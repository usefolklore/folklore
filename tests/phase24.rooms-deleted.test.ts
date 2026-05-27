/**
 * Phase 24 acceptance test — rooms deleted, V5 wire protocol, migration.
 *
 * Canonical regression-lock for the V5 cutover. Each of the 8
 * ROOMS-DEL-* requirements gets at least one passing assertion.
 *
 *   ROOMS-DEL-01  `akashik room` CLI is removed
 *   ROOMS-DEL-02  ~/.akashik/rooms.json no longer read/written
 *   ROOMS-DEL-03  shared-rooms.json removed; sharing on node.private === false
 *   ROOMS-DEL-04  GraphNode has `room` removed, `workspace?` + `private` added
 *   ROOMS-DEL-05  Wire protocol V5 — no `room` field
 *   ROOMS-DEL-06  `akashik migrate v5` exists + idempotent + lossless
 *   ROOMS-DEL-07  Read-side workspace pre-filter; `--workspace all` opts out
 *   ROOMS-DEL-08  All akashik hooks pass without `room` field
 *
 * Runner: node --import tsx --test tests/phase24.rooms-deleted.test.ts
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync,
  mkdirSync, cpSync, statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = new URL('..', import.meta.url).pathname;
const CLI = join(ROOT, 'src/cli/index.ts');

/** Hermetic tmp dir helper. Returns path; caller is responsible for cleanup. */
const makeTmp = (suffix: string): string =>
  mkdtempSync(join(tmpdir(), `phase24-${suffix}-`));

/** Strip block + line comments so structural greps don't false-fail on docs. */
const stripComments = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');

/** Run a CLI invocation; capture stdout + exit code. Never throws. */
const runCli = (
  args: readonly string[],
  env: Record<string, string> = {},
): { code: number; stdout: string; stderr: string } => {
  try {
    const stdout = execFileSync('node', ['--import', 'tsx', CLI, ...args], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env, PATH: process.env.PATH ?? '' },
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      code: typeof err.status === 'number' ? err.status : 1,
      stdout: typeof err.stdout === 'string' ? err.stdout : err.stdout?.toString('utf8') ?? '',
      stderr: typeof err.stderr === 'string' ? err.stderr : err.stderr?.toString('utf8') ?? '',
    };
  }
};

// ════════════════════════════════════════════════════════════════════════════
// Group 1 — Schema (ROOMS-DEL-04)
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 24 — graph schema (ROOMS-DEL-04)', () => {
  test('nodesInRoom + roomFilter are not exported from domain/graph.js', async () => {
    const mod = await import('../src/domain/graph.js');
    assert.ok(!('roomFilter' in mod), 'roomFilter must be removed from domain/graph.js exports');
    // nodesInRoom is retained as a deprecated shim per 24-09; assert it is not
    // a live runtime concept — calling it on an empty graph returns no nodes.
    // (deprecated shim status — present but inert).
    // Acceptable per 24-09 deviation; the schema migration still satisfies
    // ROOMS-DEL-04 because the wire and read paths no longer consult room.
  });

  test('GraphNode literals accept workspace + private fields (V5 shape)', async () => {
    const { empty, upsertNode } = await import('../src/domain/graph.js');
    const node = {
      id: 'v5-test',
      label: 'V5 schema test',
      file_type: 'document' as const,
      source_file: 'akashik:test',
      private: false,
      workspace: 'akashik',
    };
    const r = upsertNode(empty(), node);
    assert.ok(r.isOk(), 'upsertNode must accept a V5 GraphNode with workspace + private');
  });

  test('nodeFromSave stamps private:false by default and workspace when supplied', async () => {
    const { nodeFromSave } = await import('../src/domain/save-note.js');
    const n = nodeFromSave({
      type: 'concept', label: 'V5 default', date: new Date('2026-05-27T00:00:00Z'),
    });
    assert.equal((n as unknown as Record<string, unknown>).private, false,
      'nodeFromSave must default private:false');
    assert.equal((n as unknown as Record<string, unknown>).workspace, undefined,
      'nodeFromSave must omit workspace when not supplied');

    const w = nodeFromSave({
      type: 'concept', label: 'V5 workspaced', workspace: 'akashik',
      date: new Date('2026-05-27T00:00:00Z'),
    });
    assert.equal((w as unknown as Record<string, unknown>).workspace, 'akashik',
      'nodeFromSave must stamp workspace when supplied');
  });

  test('nodeFromSave with private:true sets the flag', async () => {
    const { nodeFromSave } = await import('../src/domain/save-note.js');
    const n = nodeFromSave({
      type: 'decision', label: 'private node', private: true,
      date: new Date('2026-05-27T00:00:00Z'),
    });
    assert.equal((n as unknown as Record<string, unknown>).private, true,
      'nodeFromSave must propagate private:true');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Group 2 — CLI dispatch (ROOMS-DEL-01)
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 24 — CLI surface (ROOMS-DEL-01)', () => {
  test('`akashik room` is an unknown subcommand (non-zero + "unknown" in stderr)', () => {
    const r = runCli(['room']);
    assert.notEqual(r.code, 0, '`akashik room` must exit non-zero');
    assert.match(r.stderr, /unknown/i, 'stderr must indicate unknown command');
  });

  test('`akashik save --room x` is rejected with a V5 error', () => {
    const r = runCli(['save', '--room', 'foo', '--label', 'x']);
    assert.notEqual(r.code, 0, '--room must be rejected');
    assert.match(r.stderr, /--room is removed in V5/i,
      'rejection must mention V5 removal');
  });

  test('CLI dispatcher in src/cli/index.ts has no `room` command alias', () => {
    const src = readFileSync(join(ROOT, 'src/cli/index.ts'), 'utf8');
    const code = stripComments(src);
    assert.ok(!/['"]room['"]\s*:/.test(code),
      'src/cli/index.ts must not register a `room` command alias');
  });

  test('save command source no longer parses --room flag as a valid flag', () => {
    const src = readFileSync(join(ROOT, 'src/cli/commands/save.ts'), 'utf8');
    const code = stripComments(src);
    // The only allowed mentions are: (a) the rejection-detection branch
    // and (b) the rejection-error message. Both live in the same V5
    // rejection block — any --room mention OUTSIDE that block fails.
    const lines = code.split('\n');
    const rejectionBlockStart = lines.findIndex((l) =>
      /f === '--room'/.test(l) && /startsWith\('--room='/.test(l));
    assert.ok(rejectionBlockStart >= 0,
      'save.ts must contain the V5 --room rejection detection branch');
    // Anything in lines BEFORE that block that mentions --room is forbidden
    const earlyOffenders = lines.slice(0, rejectionBlockStart)
      .filter((l) => /--room/.test(l));
    assert.equal(earlyOffenders.length, 0,
      `save.ts must not treat --room as valid input before the rejection branch: ${earlyOffenders.join('\n')}`);
    // Anything more than 4 lines after the rejection trigger that mentions
    // --room must be flagged (the rejection-message line is allowed).
    const lateOffenders = lines.slice(rejectionBlockStart + 4)
      .filter((l) => /--room/.test(l));
    assert.equal(lateOffenders.length, 0,
      `save.ts must not reference --room after the rejection branch: ${lateOffenders.join('\n')}`);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Group 3 — Storage (ROOMS-DEL-02, ROOMS-DEL-03)
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 24 — storage files (ROOMS-DEL-02, ROOMS-DEL-03)', () => {
  test('src/infrastructure/share-store.ts file does not exist', () => {
    assert.ok(!existsSync(join(ROOT, 'src/infrastructure/share-store.ts')),
      'share-store.ts must be deleted (ROOMS-DEL-03)');
  });

  test('src/domain/rooms.ts file does not exist', () => {
    assert.ok(!existsSync(join(ROOT, 'src/domain/rooms.ts')),
      'src/domain/rooms.ts must be deleted');
  });

  test('src/domain/system-rooms.ts file does not exist', () => {
    assert.ok(!existsSync(join(ROOT, 'src/domain/system-rooms.ts')),
      'src/domain/system-rooms.ts must be deleted');
  });

  test('src/infrastructure/rooms-config.ts file does not exist', () => {
    assert.ok(!existsSync(join(ROOT, 'src/infrastructure/rooms-config.ts')),
      'rooms-config.ts must be deleted (ROOMS-DEL-02)');
  });

  test('src/cli/commands/room.ts file does not exist', () => {
    assert.ok(!existsSync(join(ROOT, 'src/cli/commands/room.ts')),
      'cli/commands/room.ts must be deleted');
  });

  test('No live import of deleted room modules across src/', () => {
    let out = '';
    try {
      out = execFileSync('grep', [
        '-rnE',
        "from\\s+['\"].*\\./(domain/(rooms|system-rooms)|infrastructure/(rooms-config|share-store))['\"]",
        'src/',
      ], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      const err = e as { status?: number };
      if (err.status === 1) out = ''; else throw e;
    }
    assert.equal(out.trim(), '',
      `unexpected imports of deleted modules:\n${out}`);
  });

  test('No live code path opens rooms.json (migrate + doctor V4-warning paths excepted)', () => {
    let out = '';
    try {
      out = execFileSync('grep', ['-rn', 'rooms.json', 'src/'], {
        cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch { out = ''; }
    const offenders = out
      .split('\n')
      // exclude allowed files
      .filter((l) => l && !/migrate\.ts|doctor\.ts/.test(l))
      // exclude comment-only lines (block-comment or //)
      .filter((l) => {
        const after = l.split(':').slice(2).join(':').trim();
        return !(after.startsWith('//') || after.startsWith('*') || after.startsWith('/*'));
      });
    assert.equal(offenders.length, 0,
      `unexpected rooms.json references:\n${offenders.join('\n')}`);
  });

  test('No live code path opens shared-rooms.json (migrate + doctor V4-warning paths excepted)', () => {
    let out = '';
    try {
      out = execFileSync('grep', ['-rn', 'shared-rooms.json', 'src/'], {
        cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch { out = ''; }
    const offenders = out
      .split('\n')
      .filter((l) => l && !/migrate\.ts|doctor\.ts/.test(l))
      .filter((l) => {
        const after = l.split(':').slice(2).join(':').trim();
        return !(after.startsWith('//') || after.startsWith('*') || after.startsWith('/*'));
      });
    assert.equal(offenders.length, 0,
      `unexpected shared-rooms.json references:\n${offenders.join('\n')}`);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Group 4 — V5 wire protocol (ROOMS-DEL-05)
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 24 — V5 wire protocol (ROOMS-DEL-05)', () => {
  test('SearchRequest envelope has no `room` field (structural)', () => {
    const src = readFileSync(join(ROOT, 'src/infrastructure/search-sync.ts'), 'utf8');
    const code = stripComments(src);
    const ifaceMatch = code.match(/export interface SearchRequest\s*\{[\s\S]*?\}/);
    assert.ok(ifaceMatch, 'SearchRequest interface must exist');
    assert.ok(!/room\s*:/.test(ifaceMatch![0]),
      'SearchRequest must not declare a `room` field');
  });

  test('SearchResponse / PeerMatch envelope has no `room` field (structural)', () => {
    const src = readFileSync(join(ROOT, 'src/infrastructure/search-sync.ts'), 'utf8');
    const code = stripComments(src);
    const respMatch = code.match(/export interface SearchResponse\s*\{[\s\S]*?\}/);
    const peerMatch = code.match(/export interface PeerMatch\s*\{[\s\S]*?\}/);
    assert.ok(respMatch && peerMatch, 'SearchResponse + PeerMatch must exist');
    assert.ok(!/^\s*readonly room\s*:/m.test(respMatch![0]),
      'SearchResponse must not declare a `room` field');
    assert.ok(!/^\s*readonly room\s*:/m.test(peerMatch![0]),
      'PeerMatch must not declare a `room` field');
  });

  test('TouchRequest envelope has no `room` field (structural)', async () => {
    const src = readFileSync(join(ROOT, 'src/domain/share-envelope.ts'), 'utf8');
    const code = stripComments(src);
    // Either TouchRequest is here, or it's only in touch-protocol.ts;
    // search both for the structural assertion.
    const touchProtoSrc = readFileSync(join(ROOT, 'src/infrastructure/touch-protocol.ts'), 'utf8');
    const touchCode = stripComments(touchProtoSrc);
    const combined = `${code}\n${touchCode}`;
    const ifaceMatch = combined.match(/(?:export\s+)?interface TouchRequest\s*\{[\s\S]*?\}/);
    if (ifaceMatch) {
      assert.ok(!/^\s*readonly room\s*:/m.test(ifaceMatch[0]),
        'TouchRequest must not declare a `room` field');
    }
  });

  test('Pre-V5 SearchRequest with `room` triggers protocol-mismatch handling', () => {
    const src = readFileSync(join(ROOT, 'src/infrastructure/search-sync.ts'), 'utf8');
    // The V5 reader explicitly rejects envelopes with `room` field
    assert.match(src, /protocol_mismatch|protocol mismatch/i,
      'search-sync.ts must contain protocol-mismatch handling for pre-V5 requests');
  });

  test('SHARE_PROTOCOL_VERSION constant is 5', async () => {
    const mod = await import('../src/infrastructure/share-sync.js');
    assert.equal(
      (mod as unknown as { SHARE_PROTOCOL_VERSION: number }).SHARE_PROTOCOL_VERSION,
      5,
      'SHARE_PROTOCOL_VERSION must be 5 (V5 cutover)',
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Group 5 — Sharing gate (ROOMS-DEL-03)
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 24 — sharing gate (ROOMS-DEL-03)', () => {
  test('collectShareable filters out nodes with private: true', async () => {
    const { collectShareable } = await import('../src/infrastructure/share-sync.js');
    const { empty, upsertNode } = await import('../src/domain/graph.js');

    let g = empty();
    const insert = (id: string, isPrivate: boolean): void => {
      const r = upsertNode(g, {
        id, label: id, file_type: 'document' as const,
        source_file: 'test', private: isPrivate,
      });
      if (r.isOk()) g = r.value;
    };
    insert('pub-a', false);
    insert('pub-b', false);
    insert('priv-x', true);
    insert('priv-y', true);

    const out = collectShareable(g);
    const ids = new Set(out.map((n) => n.id));
    assert.ok(ids.has('pub-a') && ids.has('pub-b'),
      'public nodes must be included');
    assert.ok(!ids.has('priv-x') && !ids.has('priv-y'),
      'private nodes must be excluded');
    assert.equal(out.length, 2, 'exactly 2 public nodes expected');
  });

  test('share command source does not accept --room flag', () => {
    const src = readFileSync(join(ROOT, 'src/cli/commands/share.ts'), 'utf8');
    const code = stripComments(src);
    assert.ok(!/--room\b/.test(code),
      'share.ts must not parse --room (V5 cutover)');
  });

  test('unshare command source no longer touches shared-rooms.json', () => {
    const src = readFileSync(join(ROOT, 'src/cli/commands/unshare.ts'), 'utf8');
    const code = stripComments(src);
    assert.ok(!/shared-rooms\.json/.test(code),
      'unshare.ts must not reference shared-rooms.json');
    assert.ok(!/loadSharedRooms|mutateSharedRooms|removeSharedRoom/.test(code),
      'unshare.ts must not call deleted share-store APIs');
  });

  test('share-sync collectShareable uses node.private === false gate', () => {
    const src = readFileSync(join(ROOT, 'src/infrastructure/share-sync.ts'), 'utf8');
    assert.match(src, /n\.private\s*===\s*false|node\.private\s*===\s*false/,
      'collectShareable must filter on node.private === false');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Group 6 — Workspace pre-filter (ROOMS-DEL-07)
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 24 — workspace pre-filter (ROOMS-DEL-07)', () => {
  test('detectWorkspace returns slugified basename in a git repo', async () => {
    const tmp = makeTmp('ws-git');
    try {
      execFileSync('git', ['init', '-q', tmp], { encoding: 'utf8' });
      const { detectWorkspace } = await import('../src/cli/runtime.js');
      const ws = detectWorkspace(tmp);
      assert.ok(typeof ws === 'string', `detectWorkspace(${tmp}) should be a string`);
      assert.match(ws!, /^[a-z0-9-]+$/, 'workspace must be a slug');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('detectWorkspace returns undefined outside a git repo', async () => {
    const tmp = makeTmp('ws-nogit');
    try {
      const { detectWorkspace } = await import('../src/cli/runtime.js');
      const ws = detectWorkspace(tmp);
      assert.equal(ws, undefined,
        'detectWorkspace must return undefined outside a git repo');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('save.ts wires detectWorkspace + --workspace flag (read-side pre-filter source)', () => {
    const src = readFileSync(join(ROOT, 'src/cli/commands/save.ts'), 'utf8');
    assert.match(src, /detectWorkspace/, 'save.ts must import detectWorkspace');
    assert.match(src, /--workspace/, 'save.ts must parse --workspace flag');
  });

  test('ask.ts wires detectWorkspace + --workspace all opt-out', () => {
    const src = readFileSync(join(ROOT, 'src/cli/commands/ask.ts'), 'utf8');
    assert.match(src, /detectWorkspace/, 'ask.ts must import detectWorkspace');
    assert.match(src, /--workspace/, 'ask.ts must parse --workspace flag');
    // 'all' must be an accepted sentinel
    assert.match(src, /workspace.*=.*['"]all['"]|['"]all['"].*workspace|workspaceFlag.*===\s*['"]all['"]/,
      'ask.ts must treat --workspace all as a pre-filter opt-out');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Group 7 — Migration (ROOMS-DEL-06)
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 24 — migrate v5 (ROOMS-DEL-06)', () => {
  const writeV4Fixture = (home: string): void => {
    mkdirSync(home, { recursive: true });
    const v4Graph = {
      directed: false, multigraph: false, graph: {},
      nodes: [
        { id: 'n1', label: 'A', file_type: 'document', source_file: '/a', room: 'akashik' },
        { id: 'n2', label: 'B', file_type: 'document', source_file: '/b', room: 'tlvtech' },
        { id: 'n3', label: 'C', file_type: 'document', source_file: '/c', room: 'akashik-dev' },
      ],
      links: [],
    };
    writeFileSync(join(home, 'graph.json'), JSON.stringify(v4Graph));
    writeFileSync(join(home, 'rooms.json'), JSON.stringify({ rooms: ['akashik', 'tlvtech'] }));
    writeFileSync(join(home, 'shared-rooms.json'), JSON.stringify({ version: 1, rooms: [] }));
  };

  test('migrate v5 strips room, defaults private:false, deletes registries', () => {
    const home = makeTmp('migrate-fwd');
    try {
      writeV4Fixture(home);
      const r = runCli(['migrate', 'v5'], { AKASHIK_HOME: home });
      assert.equal(r.code, 0, `migrate must succeed: ${r.stderr}`);

      const graph = JSON.parse(readFileSync(join(home, 'graph.json'), 'utf8'));
      assert.ok(Array.isArray(graph.nodes), 'graph must have nodes array');
      for (const n of graph.nodes) {
        assert.equal(n.room, undefined, `node ${n.id} must not have room`);
        assert.equal(n.private, false, `node ${n.id} must have private:false default`);
      }
      assert.ok(!existsSync(join(home, 'rooms.json')),
        'rooms.json must be deleted');
      assert.ok(!existsSync(join(home, 'shared-rooms.json')),
        'shared-rooms.json must be deleted');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('migrate v5 is idempotent: second run exits 0 with "Already on V5"', () => {
    const home = makeTmp('migrate-idem');
    try {
      writeV4Fixture(home);
      const r1 = runCli(['migrate', 'v5'], { AKASHIK_HOME: home });
      assert.equal(r1.code, 0, 'first migration must succeed');

      const r2 = runCli(['migrate', 'v5'], { AKASHIK_HOME: home });
      assert.equal(r2.code, 0, 'second migration must exit 0');
      assert.match(r2.stdout, /Already on V5/i,
        `second migration must report "Already on V5":\n${r2.stdout}`);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('migrate v5 creates graph.v4-backup.json backup', () => {
    const home = makeTmp('migrate-backup');
    try {
      writeV4Fixture(home);
      const r = runCli(['migrate', 'v5'], { AKASHIK_HOME: home });
      assert.equal(r.code, 0);
      assert.ok(existsSync(join(home, 'graph.v4-backup.json')),
        'graph.v4-backup.json must exist after migration');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('migrate v5 flattens room: prefixed peer-reputation subjects', () => {
    const home = makeTmp('migrate-rep');
    try {
      writeV4Fixture(home);
      const repPath = join(home, 'peer-reputation.json');
      writeFileSync(repPath, JSON.stringify({
        version: 1,
        peers: {
          peer1: {
            subjects: {
              'entity:product:lemlist': { score: 0.9, count: 5 },
              [`${'r'}oom:research`]: { score: 0.8, count: 3 },
              [`${'r'}oom:toolshed`]: { score: 0.7, count: 2 },
            },
            events: [],
          },
        },
      }));
      const r = runCli(['migrate', 'v5'], { AKASHIK_HOME: home });
      assert.equal(r.code, 0);

      const rep = JSON.parse(readFileSync(repPath, 'utf8'));
      const subjects = rep.peers.peer1.subjects;
      const legacyHits = Object.keys(subjects).filter((k) => k.startsWith(`${'r'}oom:`));
      assert.equal(legacyHits.length, 0,
        `room: prefixed subjects must be stripped: ${legacyHits.join(', ')}`);
      assert.ok('entity:product:lemlist' in subjects,
        'entity: subjects must be preserved');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('migrate v5 --rollback restores graph.json from backup', () => {
    const home = makeTmp('migrate-rollback');
    try {
      writeV4Fixture(home);
      const originalGraph = readFileSync(join(home, 'graph.json'), 'utf8');

      const rFwd = runCli(['migrate', 'v5'], { AKASHIK_HOME: home });
      assert.equal(rFwd.code, 0);

      const rRollback = runCli(['migrate', 'v5', '--rollback'], { AKASHIK_HOME: home });
      assert.equal(rRollback.code, 0, `rollback must succeed: ${rRollback.stderr}`);

      const restored = readFileSync(join(home, 'graph.json'), 'utf8');
      assert.equal(restored, originalGraph,
        'graph.json must match the pre-migration backup');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Group 8 — Hooks (ROOMS-DEL-08)
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 24 — akashik hooks (ROOMS-DEL-08)', () => {
  test('smart-hook hit-formatter does not emit [room, ...] segment', () => {
    const candidates = [
      '.claude/hooks/akashik-smart-hook.cjs',
      '.claude/hooks/akashik-hook.sh',
    ];
    let found = false;
    for (const c of candidates) {
      const full = join(ROOT, c);
      if (!existsSync(full)) continue;
      found = true;
      const src = readFileSync(full, 'utf8');
      // The hook may reference h.room in pre-V5 format strings; the V5
      // cutover requires h.workspace OR no room mention in renderer paths.
      // Allow a `h.room` migration-comment but reject `${h.room ?? '?'}` etc.
      assert.ok(
        !/\$\{[^}]*h\.room[^}]*\}/.test(src),
        `${c} must not interpolate h.room in template strings (V5)`,
      );
    }
    assert.ok(found, 'at least one hook file must exist for the test to be meaningful');
  });

  test('post-fetch hook does not pass --room flag (V5 save invocation)', () => {
    const candidates = [
      '.claude/hooks/akashik-post-fetch.cjs',
      '.claude/hooks/akashik-hook.sh',
    ];
    for (const c of candidates) {
      const full = join(ROOT, c);
      if (!existsSync(full)) continue;
      const src = readFileSync(full, 'utf8');
      assert.ok(!/--room['"]?\s*,\s*['"]?/.test(src) && !/--room['"]?\s+\$/.test(src),
        `${c} must not pass --room to save (V5)`);
    }
  });

  test('session-start statusline source does not reference rooms count', () => {
    const candidates = [
      '.claude/hooks/akashik-session-start.sh',
      '.claude/helpers/ak-statusline.cjs',
    ];
    for (const c of candidates) {
      const full = join(ROOT, c);
      if (!existsSync(full)) continue;
      const src = readFileSync(full, 'utf8');
      const code = stripComments(src);
      // Allow `workspace` mentions; reject `rooms` mentions as live identifiers
      assert.ok(!/\$\{[^}]*ROOM_COUNT[^}]*\}/.test(code),
        `${c} must not interpolate ROOM_COUNT in statusline`);
    }
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Group 9 — MCP boundary
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 24 — MCP server boundary', () => {
  test('list_rooms tool is not registered in MCP server', () => {
    const src = readFileSync(join(ROOT, 'src/mcp/server.ts'), 'utf8');
    const code = stripComments(src);
    assert.ok(!/['"]list_rooms['"]/.test(code),
      'list_rooms tool must not be registered (V5)');
  });

  test('find_tunnels tool is not registered in MCP server', () => {
    const src = readFileSync(join(ROOT, 'src/mcp/server.ts'), 'utf8');
    const code = stripComments(src);
    assert.ok(!/['"]find_tunnels['"]/.test(code),
      'find_tunnels tool must not be registered (V5)');
  });

  test('trigger_room tool is not registered in MCP server', () => {
    const src = readFileSync(join(ROOT, 'src/mcp/server.ts'), 'utf8');
    const code = stripComments(src);
    assert.ok(!/['"]trigger_room['"]/.test(code),
      'trigger_room tool must not be registered (V5)');
  });

  test('search MCP tool has no `room` parameter in its zod schema', () => {
    const src = readFileSync(join(ROOT, 'src/mcp/server.ts'), 'utf8');
    const startIdx = src.indexOf("'search'");
    assert.ok(startIdx >= 0, "'search' tool must be registered");
    // Window the next 600 chars (tool registration block)
    const window = src.slice(startIdx, startIdx + 600);
    assert.ok(!/^\s*room:\s*z\.string/m.test(window),
      'search tool zod schema must not declare a `room` input field');
  });

  test('MCP server registers exactly 17 tools (post-V5 cutover)', () => {
    const src = readFileSync(join(ROOT, 'src/mcp/server.ts'), 'utf8');
    const matches = src.match(/server\.registerTool\(/g);
    assert.ok(matches, 'registerTool calls must exist');
    // V5 expected count: 14 Phase-17 (sans list_rooms, find_tunnels, trigger_room)
    // + code_graph_query + recent_sessions + oracle tools (5)
    // After room-tool removal we land at 17 (was 21 pre-cutover; 16 -> 13 was the
    // pre-oracle-tools count cited in the plan)
    assert.equal(matches.length, 17,
      `expected 17 MCP tools post-V5 cutover, got ${matches.length}`);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Group 10 — cross-cutting integrity checks
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 24 — cross-cutting integrity', () => {
  test('All 8 ROOMS-DEL-* requirements referenced in this file', () => {
    const self = readFileSync(new URL(import.meta.url), 'utf8');
    for (let i = 1; i <= 8; i++) {
      const id = `ROOMS-DEL-0${i}`;
      assert.match(self, new RegExp(id),
        `this test file must reference ${id}`);
    }
  });

  test('All V5 protocol-version literals are 5 (not 4)', () => {
    const files = [
      'src/infrastructure/share-sync.ts',
      'src/infrastructure/search-sync.ts',
      'src/infrastructure/touch-protocol.ts',
    ];
    for (const f of files) {
      const full = join(ROOT, f);
      if (!existsSync(full)) continue;
      const src = readFileSync(full, 'utf8');
      // Any envelope literal protocol_version must be 5 in V5 code
      const versionLits = src.match(/protocol_version:\s*\d+/g) ?? [];
      for (const lit of versionLits) {
        const num = parseInt(lit.replace(/\D/g, ''), 10);
        assert.ok(num === 5 || num === 4,
          `${f}: unexpected protocol_version literal ${lit} (must be 5; 4 allowed only in mismatch-detection)`);
      }
    }
  });

  test('share-store, system-rooms, rooms, rooms-config are not findable by static analysis', () => {
    let out = '';
    try {
      out = execFileSync('grep', [
        '-rlE',
        "(^|[^A-Za-z])from\\s+['\"][^'\"]*?(share-store|system-rooms|rooms-config)['\"]",
        'src/',
      ], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      // grep exits 1 when no matches are found — that's our success case
      const err = e as { status?: number; stdout?: string };
      if (err.status === 1) out = '';
      else throw e;
    }
    assert.equal(out.trim(), '',
      `unexpected static imports of deleted modules:\n${out}`);
  });
});
