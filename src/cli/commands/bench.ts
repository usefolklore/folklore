/**
 * `wellinformed bench memory` — unified memory benchmark runner.
 *
 * Spawns the suite of bench-*.test.ts files with
 * `WELLINFORMED_BENCH_OUT` set so each suite appends a
 * `BenchSuiteReport` JSON line. The driver collects all reports,
 * composes a `BenchCompositeReport`, and emits either:
 *
 *   - human summary to stdout (default)
 *   - full JSON to stdout with `--json`
 *
 * Phase 23 deliverable. Subcommands:
 *   memory  Run the full memory bench
 *   help
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  composeMemoryScore,
  MEMORY_SCORE_WEIGHTS,
  type BenchSuiteReport,
  type BenchCompositeReport,
  type MemoryScoreKey,
} from '../../domain/bench-types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..');

// ─────────────── suite registry ─────────────

interface SuiteSpec {
  /** Canonical suite name (must match `report.suite`). */
  readonly name: string;
  /** Test file path relative to the repo root. */
  readonly path: string;
  /** Which composite-key the suite contributes to. */
  readonly metricKey: MemoryScoreKey;
  /** The exact metric field name inside the suite's `metrics` object. */
  readonly metricField: string;
}

/**
 * Suite registry — order matters for the public-real overlays.
 *
 * When both a synthetic/proxy suite and its real-corpus counterpart
 * register against the same `metricKey` (e.g. `longmemevalRecall5`
 * comes from both `longmemeval-synth` and `longmemeval-real`), the
 * composite-assembly loop in `runSuites()` overwrites the entry as it
 * iterates SUITES in order. Putting the real suite AFTER its
 * synth/proxy means: on machines without the public datasets, the
 * real suite skips (emits no report) and the synth value is used; on
 * the Hetzner box (with `WELLINFORMED_BENCH_PUBLIC_REAL=1` and the
 * dataset dirs set) the real value cleanly overwrites the synthetic.
 */
const SUITES: readonly SuiteSpec[] = [
  { name: 'tier-promotion',     path: 'tests/bench-tier-promotion.test.ts',     metricKey: 'tierPromotionF1',       metricField: 'tierPromotionF1' },
  { name: 'beta-calibration',   path: 'tests/bench-beta-calibration.test.ts',   metricKey: 'betaCalibration',       metricField: 'betaCalibration' },
  { name: 'retention-band',     path: 'tests/bench-retention-band.test.ts',     metricKey: 'retentionBandAccuracy', metricField: 'retentionBandAccuracy' },
  { name: 'write-gate',         path: 'tests/bench-write-gate.test.ts',         metricKey: 'writeGateF1',           metricField: 'writeGateF1' },
  { name: 'longmemeval-synth',  path: 'tests/bench-longmemeval-synth.test.ts',  metricKey: 'longmemevalRecall5',    metricField: 'longmemevalRecall5' },
  { name: 'longmemeval-real',   path: 'tests/bench-longmemeval-real.test.ts',   metricKey: 'longmemevalRecall5',    metricField: 'longmemevalRecall5' },
  { name: 'auto-forget',        path: 'tests/bench-auto-forget.test.ts',        metricKey: 'autoForgetF1',          metricField: 'autoForgetF1' },
  { name: 'hotpotqa-style',     path: 'tests/bench-standard.test.ts',           metricKey: 'hotpotqaRecall5',       metricField: 'hotpotqaRecall5' },
  { name: 'dense-retrieval-labeled', path: 'tests/bench-real.test.ts',          metricKey: 'beirSciFactNdcg10',     metricField: 'beirSciFactNdcg10' },
  { name: 'beir-scifact-real',  path: 'tests/bench-scifact-real.test.ts',       metricKey: 'beirSciFactNdcg10',     metricField: 'beirSciFactNdcg10' },
  { name: 'locomo-synth',       path: 'tests/bench-locomo-synth.test.ts',       metricKey: 'locomoFactualF1',       metricField: 'locomoFactualF1' },
  { name: 'locomo-real',        path: 'tests/bench-locomo-real.test.ts',        metricKey: 'locomoFactualF1',       metricField: 'locomoFactualF1' },
];

// ─────────────── run ─────────────

interface RunOpts {
  readonly json: boolean;
  readonly suiteFilter?: string;
}

const runSuites = (opts: RunOpts): BenchCompositeReport => {
  const outDir = mkdtempSync(join(tmpdir(), 'wi-bench-'));
  const outFile = join(outDir, 'reports.jsonl');
  writeFileSync(outFile, '');

  const t0 = Date.now();
  try {
    const targets = opts.suiteFilter
      ? SUITES.filter((s) => s.name === opts.suiteFilter)
      : SUITES;
    if (targets.length === 0) {
      throw new Error(`unknown suite '${opts.suiteFilter}'. valid: ${SUITES.map((s) => s.name).join(', ')}`);
    }

    for (const suite of targets) {
      const result = spawnSync(
        'npx',
        ['--yes', 'tsx', '--test', join(REPO_ROOT, suite.path)],
        {
          cwd: REPO_ROOT,
          env: { ...process.env, WELLINFORMED_BENCH_OUT: outFile },
          stdio: ['ignore', 'pipe', 'pipe'],
          encoding: 'utf8',
        },
      );
      if (result.status !== 0) {
        process.stderr.write(`bench: suite ${suite.name} failed (exit ${result.status})\n`);
        if (result.stdout) process.stderr.write(result.stdout);
        if (result.stderr) process.stderr.write(result.stderr);
      }
    }

    const lines = existsSync(outFile) ? readFileSync(outFile, 'utf8').split('\n').filter(Boolean) : [];
    const reports: BenchSuiteReport[] = [];
    for (const line of lines) {
      try {
        const r = JSON.parse(line) as BenchSuiteReport;
        if (r && typeof r.suite === 'string') reports.push(r);
      } catch { /* ignore malformed */ }
    }

    const perDimension: Partial<Record<MemoryScoreKey, number>> = {};
    for (const suite of SUITES) {
      const report = reports.find((r) => r.suite === suite.name);
      if (!report) continue;
      const v = report.metrics[suite.metricField];
      if (typeof v === 'number' && Number.isFinite(v)) {
        perDimension[suite.metricKey] = v;
      }
    }

    const composite = composeMemoryScore(perDimension);
    return {
      version: 1,
      composite,
      perDimension: {
        beirSciFactNdcg10:     perDimension.beirSciFactNdcg10     ?? 0,
        hotpotqaRecall5:       perDimension.hotpotqaRecall5       ?? 0,
        longmemevalRecall5:    perDimension.longmemevalRecall5    ?? 0,
        locomoFactualF1:       perDimension.locomoFactualF1       ?? 0,
        tierPromotionF1:       perDimension.tierPromotionF1       ?? 0,
        betaCalibration:       perDimension.betaCalibration       ?? 0,
        autoForgetF1:          perDimension.autoForgetF1          ?? 0,
        retentionBandAccuracy: perDimension.retentionBandAccuracy ?? 0,
        writeGateF1:           perDimension.writeGateF1           ?? 0,
      },
      suites: reports,
      elapsedMs: Date.now() - t0,
      runAt: new Date().toISOString(),
    };
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
};

// ─────────────── render ─────────────

const renderHuman = (r: BenchCompositeReport): string => {
  const pad = (s: string, n: number) => s.length >= n ? s : s + ' '.repeat(n - s.length);
  const lines: string[] = [];
  lines.push(`wellinformed memory bench — ${r.runAt}`);
  lines.push(`elapsed: ${(r.elapsedMs / 1000).toFixed(2)}s`);
  lines.push('');
  lines.push('per-dimension:');
  for (const k of Object.keys(MEMORY_SCORE_WEIGHTS) as MemoryScoreKey[]) {
    const w = MEMORY_SCORE_WEIGHTS[k];
    const v = r.perDimension[k];
    const contrib = w * v;
    const flag = v === 0 ? ' (no-run)' : '';
    lines.push(`  ${pad(k, 24)}  w=${w.toFixed(2)}  v=${v.toFixed(4)}  contrib=${contrib.toFixed(4)}${flag}`);
  }
  lines.push('');
  lines.push(`composite score: ${r.composite.toFixed(4)} / 1.0000`);
  lines.push('');
  if (r.suites.length > 0) {
    lines.push('per-suite metrics:');
    for (const s of r.suites) {
      lines.push(`  ${s.suite}: ${s.elapsedMs.toFixed(1)}ms`);
      for (const [k, v] of Object.entries(s.metrics)) {
        if (typeof v === 'number') lines.push(`    ${pad(k, 28)} ${v.toFixed(4)}`);
      }
    }
  }
  return lines.join('\n');
};

// ─────────────── entry ─────────────

const printBenchHelp = (): void => {
  console.log(`wellinformed bench — unified memory benchmark

Subcommands:
  memory [--json] [--suite <name>]   Run the memory bench
  help

Suites:
  ${SUITES.map((s) => s.name).join('\n  ')}

The runner spawns each suite as a child node:test, collects per-suite
JSONL reports, and emits a composite BenchCompositeReport. The
composite formula and per-dimension weights live in
src/domain/bench-types.ts.

Acceptance gates per suite live inside each test file and assert into
the test runner — a regressing dimension fails the suite, which fails
the bench.
`);
};

const memoryCmd = async (args: readonly string[]): Promise<number> => {
  let json = false;
  let suiteFilter: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--json') { json = true; continue; }
    if (a === '--suite') { suiteFilter = args[++i]; continue; }
    console.error(`bench: unknown flag '${a}'`);
    return 1;
  }
  try {
    const report = runSuites({ json, suiteFilter });
    if (json) {
      process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    } else {
      console.log(renderHuman(report));
    }
    return 0;
  } catch (e) {
    console.error(`bench: ${(e as Error).message}`);
    return 1;
  }
};

export const bench = async (args: readonly string[]): Promise<number> => {
  const [sub, ...rest] = args;
  switch (sub) {
    case undefined:
    case 'help':
    case '-h':
    case '--help':
      printBenchHelp();
      return 0;
    case 'memory':
      return memoryCmd(rest);
    default:
      console.error(`bench: unknown subcommand '${sub}'`);
      return 1;
  }
};
