/**
 * doctor — checks runtime prerequisites for akashik.
 *
 * Phase 1 scope:
 *   - Node >= 20
 *   - a Python >= 3.10 reachable on PATH (probed python3.13→python3.10→python3)
 *   - plugin manifest present (.claude-plugin/plugin.json)
 *   - vendor/graphify submodule present (pyproject.toml + graphify/ package)
 *   - ~/.akashik/venv exists and can `import graphify`
 *   - schema patch landed (graphify.validate.OPTIONAL_NODE_FIELDS matches spec)
 *
 * `doctor --fix` runs scripts/bootstrap.sh to create the venv and install
 * graphify in editable mode.
 *
 * Exit codes:
 *   0 — all blocking checks pass
 *   1 — one or more blocking issues (use --fix for the ones that support it)
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Check = {
  name: string;
  ok: boolean;
  detail: string;
  blocking: boolean;
  /** optional hint shown when the check fails */
  fix?: string;
};

const EXPECTED_OPTIONAL_NODE_FIELDS = [
  'embedding_id',
  'fetched_at',
  'room',
  'source_uri',
  'wing',
];

function repoRoot(): string {
  // dist/cli/commands/doctor.js → ../../..
  // src/cli/commands/doctor.ts  → ../../..
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..');
}

function akashikHome(): string {
  return process.env.AKASHIK_HOME || join(homedir(), '.akashik');
}

function venvPython(): string {
  return join(akashikHome(), 'venv', 'bin', 'python');
}

function checkNode(): Check {
  const required = 20;
  const major = Number(process.versions.node.split('.')[0]);
  return {
    name: 'Node.js >= 20',
    ok: major >= required,
    detail: `found ${process.versions.node}`,
    blocking: true,
    fix: 'install Node 20+ (e.g. `brew install node@20`)',
  };
}

/** probe for any python >= 3.10 — matches bootstrap.sh order */
function checkHostPython(): Check {
  const candidates = ['python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3'];
  for (const bin of candidates) {
    const r = spawnSync(bin, ['-c', 'import sys; print("%d.%d" % sys.version_info[:2])'], {
      encoding: 'utf8',
    });
    if (r.status !== 0 || !r.stdout) continue;
    const [maj, min] = r.stdout.trim().split('.').map(Number);
    if (maj >= 3 && min >= 10) {
      return {
        name: 'Python >= 3.10',
        ok: true,
        detail: `${bin} ${r.stdout.trim()}`,
        blocking: true,
      };
    }
  }
  return {
    name: 'Python >= 3.10',
    ok: false,
    detail: 'no python >= 3.10 on PATH (graphify sidecar needs it)',
    blocking: true,
    fix: 'install Python 3.10+ (e.g. `brew install python@3.12`)',
  };
}

function checkPluginManifest(): Check {
  const manifest = join(repoRoot(), '.claude-plugin', 'plugin.json');
  return {
    name: 'plugin manifest',
    ok: existsSync(manifest),
    detail: existsSync(manifest)
      ? '.claude-plugin/plugin.json present'
      : 'missing .claude-plugin/plugin.json',
    blocking: false,
  };
}

function checkGraphifySubmodule(): Check {
  const pyproject = join(repoRoot(), 'vendor', 'graphify', 'pyproject.toml');
  const pkg = join(repoRoot(), 'vendor', 'graphify', 'graphify', '__init__.py');
  const ok = existsSync(pyproject) && existsSync(pkg);
  return {
    name: 'graphify submodule',
    ok,
    detail: ok ? 'vendor/graphify present' : 'vendor/graphify is missing or empty',
    blocking: true,
    fix: 'run `git submodule update --init --recursive`',
  };
}

function checkVenv(): Check {
  const py = venvPython();
  const ok = existsSync(py);
  return {
    name: 'akashik venv',
    ok,
    detail: ok ? py : `missing ${py}`,
    blocking: true,
    fix: 'run `akashik doctor --fix` (or `scripts/bootstrap.sh`)',
  };
}

function checkGraphifyImport(): Check {
  const py = venvPython();
  if (!existsSync(py)) {
    return {
      name: 'graphify importable',
      ok: false,
      detail: 'skipped — venv missing',
      blocking: true,
      fix: 'run `akashik doctor --fix`',
    };
  }
  const r = spawnSync(
    py,
    ['-c', 'import graphify, graphify.validate; print(",".join(sorted(graphify.validate.OPTIONAL_NODE_FIELDS)))'],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    return {
      name: 'graphify importable',
      ok: false,
      detail: (r.stderr || 'import failed').trim().split('\n').slice(-1)[0],
      blocking: true,
      fix: 'run `akashik doctor --fix` to reinstall graphify into the venv',
    };
  }
  const got = (r.stdout || '').trim();
  return {
    name: 'graphify importable',
    ok: true,
    detail: `OPTIONAL_NODE_FIELDS = ${got}`,
    blocking: true,
  };
}

function checkSchemaPatch(importCheck: Check): Check {
  if (!importCheck.ok) {
    return {
      name: 'akashik schema patch',
      ok: false,
      detail: 'skipped — graphify not importable',
      blocking: true,
    };
  }
  const expected = EXPECTED_OPTIONAL_NODE_FIELDS.join(',');
  const got = importCheck.detail.replace('OPTIONAL_NODE_FIELDS = ', '');
  return {
    name: 'akashik schema patch',
    ok: got === expected,
    detail: got === expected ? 'room/wing/source_uri/fetched_at/embedding_id' : `got ${got}, expected ${expected}`,
    blocking: true,
    fix: 'submodule is on an older commit — run `git submodule update --init --remote`',
  };
}

/**
 * V5 schema readiness — Phase 24 (ROOMS-DEL-06).
 *
 * Samples up to 10 random nodes from graph.json. If ANY carries a legacy
 * `room` field the user is nudged to run `akashik migrate v5`. Also
 * flags residual rooms.json / shared-rooms.json artifacts from the V4 era.
 *
 * Non-blocking: the V5 runtime tolerates orphan fields, this is a hygiene
 * nag that persists until the user opts into the one-way migration.
 */
function checkV5SchemaReadiness(): Check {
  const home = process.env.AKASHIK_HOME ?? join(homedir(), '.akashik');
  const graphPath = join(home, 'graph.json');
  const roomsJsonPath = join(home, 'rooms.json');
  const sharedRoomsJsonPath = join(home, 'shared-rooms.json');

  const artifacts: string[] = [];
  if (existsSync(roomsJsonPath)) artifacts.push('rooms.json');
  if (existsSync(sharedRoomsJsonPath)) artifacts.push('shared-rooms.json');

  if (!existsSync(graphPath)) {
    if (artifacts.length === 0) {
      return {
        name: 'V5 schema readiness',
        ok: true,
        detail: 'graph not yet populated — V5 ready',
        blocking: false,
      };
    }
    return {
      name: 'V5 schema readiness',
      ok: false,
      detail: `V4 artifacts present: ${artifacts.join(', ')}`,
      blocking: false,
      fix: 'run `akashik migrate v5` to remove them',
    };
  }

  let v4HitCount = 0;
  let sampleSize = 0;
  try {
    const parsed = JSON.parse(readFileSync(graphPath, 'utf8')) as { nodes?: unknown[] };
    const nodes = Array.isArray(parsed.nodes) ? parsed.nodes : [];
    const sampleN = Math.min(10, nodes.length);
    sampleSize = sampleN;
    const seen = new Set<number>();
    while (seen.size < sampleN) seen.add(Math.floor(Math.random() * nodes.length));
    for (const idx of seen) {
      const n = nodes[idx] as { room?: unknown };
      if (n && typeof n.room === 'string' && n.room.length > 0) v4HitCount += 1;
    }
  } catch (e) {
    return {
      name: 'V5 schema readiness',
      ok: false,
      detail: `could not parse graph.json: ${(e as Error).message}`,
      blocking: false,
    };
  }

  if (v4HitCount > 0) {
    const artifactDetail = artifacts.length > 0 ? ` + ${artifacts.join(', ')}` : '';
    return {
      name: 'V5 schema readiness',
      ok: false,
      detail: `V4 data detected: ${v4HitCount}/${sampleSize} sampled nodes still have a 'room' field${artifactDetail}`,
      blocking: false,
      fix: 'run `akashik migrate v5` to upgrade',
    };
  }

  if (artifacts.length > 0) {
    return {
      name: 'V5 schema readiness',
      ok: false,
      detail: `V4 artifacts present: ${artifacts.join(', ')}`,
      blocking: false,
      fix: 'run `akashik migrate v5` to remove them',
    };
  }

  return {
    name: 'V5 schema readiness',
    ok: true,
    detail: `${sampleSize}/${sampleSize} sampled nodes V5-clean`,
    blocking: false,
  };
}

function render(c: Check): string {
  const mark = c.ok ? '[ ok ]' : c.blocking ? '[fail]' : '[skip]';
  const line = `${mark} ${c.name.padEnd(28)} ${c.detail}`;
  if (!c.ok && c.fix) return `${line}\n       fix: ${c.fix}`;
  return line;
}

function runFix(): number {
  const script = join(repoRoot(), 'scripts', 'bootstrap.sh');
  if (!existsSync(script)) {
    console.error(`doctor --fix: ${script} not found`);
    return 1;
  }
  console.log(`doctor --fix: running ${script}`);
  const r = spawnSync('bash', [script], { stdio: 'inherit' });
  return r.status ?? 1;
}

export async function doctor(args: string[]): Promise<number> {
  if (args.includes('--fix')) {
    const code = runFix();
    if (code !== 0) return code;
    console.log('');
    console.log('rerunning checks...\n');
  }

  const hostPy = checkHostPython();
  const graphImport = checkGraphifyImport();

  const checks: Check[] = [
    checkNode(),
    hostPy,
    checkPluginManifest(),
    checkGraphifySubmodule(),
    checkVenv(),
    graphImport,
    checkSchemaPatch(graphImport),
    checkV5SchemaReadiness(),
  ];

  console.log('akashik doctor\n');
  for (const c of checks) console.log(render(c));
  console.log('');

  const blocking = checks.filter((c) => !c.ok && c.blocking);
  if (blocking.length === 0) {
    console.log('all checks pass — phase 1 runtime is healthy.');
    return 0;
  }
  console.log(`${blocking.length} blocking issue(s).`);
  if (!args.includes('--fix')) {
    console.log("run 'akashik doctor --fix' to bootstrap the venv + graphify install.");
  }
  return 1;
}
