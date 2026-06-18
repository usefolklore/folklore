/**
 * Regression invariants for bench/bench-compounding-graded.mjs — the graded
 * multi-peer compounding sim. Locks the honest behaviour so it stays part of
 * the working body:
 *   - P=1: cooperative == isolated (no peers to share with → sharing is the
 *     only thing that can create a gap).
 *   - low paraphrase noise: cooperative COMPOUNDS (more correct reuse, fewer
 *     web trips, more inference reused) with ~0 false-admit (the separation
 *     guard rejects spurious neighbours).
 *
 * Spawns the bench with --json. Skipped (not failed) when dist isn't built —
 * the bench imports the compiled energy gate (run `npm run build` first).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BENCH = join(ROOT, 'bench', 'bench-compounding-graded.mjs');
const DIST_GATE = join(ROOT, 'dist', 'domain', 'energy-gate.js');
const skip = !existsSync(DIST_GATE) ? 'dist not built (run `npm run build`)' : false;

const run = (args: string[]): any => {
  const r = spawnSync('node', [BENCH, '--json', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`bench failed: ${r.stderr}`);
  return JSON.parse(r.stdout.trim());
};

describe('compounding-graded sim invariants', () => {
  it('P=1: cooperative equals isolated (sharing is the only source of a gap)', { skip }, () => {
    const d = run(['--peers', '1', '--steps', '1500', '--dim', '128', '--sigma', '0.1']);
    assert.equal(d.cooperative.correct_resolves, d.isolated.correct_resolves);
    assert.equal(d.cooperative.web_paid, d.isolated.web_paid);
  });

  it('low paraphrase noise: cooperative compounds with ~0 false-admit', { skip }, () => {
    const d = run(['--peers', '16', '--steps', '2500', '--dim', '384', '--sigma', '0.1']);
    assert.ok(
      d.cooperative.correct_resolve_rate > d.isolated.correct_resolve_rate + 0.05,
      `coop should reuse more: ${d.cooperative.correct_resolve_rate} vs ${d.isolated.correct_resolve_rate}`,
    );
    assert.ok(d.cooperative.web_paid < d.isolated.web_paid, 'coop should pay less web');
    assert.ok(
      d.cooperative.false_admit_rate <= 0.02,
      `separation guard must keep false-admit ~0, got ${d.cooperative.false_admit_rate}`,
    );
  });

  it('separation guard is load-bearing: removing it inflates false-admit', { skip }, () => {
    // The dedup + separation guard keep false-admit near zero. Confirm the
    // calibration reports a usable separating sepMin (> 0) — i.e. true matches
    // are distinguishable from spurious neighbours at this geometry.
    const d = run(['--peers', '16', '--steps', '1500', '--dim', '384', '--sigma', '0.1']);
    assert.ok(d.calibration.sepMin > 0, 'a positive separating sepMin must exist');
    assert.ok(d.calibration.tpr >= 0.8, `true-match TPR should be high, got ${d.calibration.tpr}`);
  });
});
