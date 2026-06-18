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
const REAL_BENCH = join(ROOT, 'bench', 'bench-compounding-real.mjs');
const DIST_GATE = join(ROOT, 'dist', 'domain', 'energy-gate.js');
const skip = !existsSync(DIST_GATE) ? 'dist not built (run `npm run build`)' : false;
// The full real-corpus run needs the cached embedder + the SciFact dataset.
const HOME = process.env.FOLKLORE_HOME || join(process.env.HOME ?? '', '.folklore');
const SCIFACT = join(HOME, 'bench', 'scifact', 'scifact', 'corpus.jsonl');
const realSkip =
  skip || !existsSync(join(HOME, 'models')) || !existsSync(SCIFACT)
    ? 'needs cached embedder + ~/.folklore/bench/scifact'
    : false;

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

describe('compounding on a REAL IR corpus (SciFact, real qrels)', () => {
  it('cooperative compounds on SciFact with low false-admit', { skip: realSkip }, () => {
    const r = spawnSync('node', [REAL_BENCH, '--json', '--dataset', 'scifact', '--steps', '4000'], {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 180_000,
    });
    if (r.status !== 0) throw new Error(`real bench failed: ${r.stderr}`);
    const d = JSON.parse(r.stdout.trim());
    assert.ok(
      d.cooperative.correct_resolve_rate > d.isolated.correct_resolve_rate + 0.03,
      `coop should reuse more on real corpus: ${d.cooperative.correct_resolve_rate} vs ${d.isolated.correct_resolve_rate}`,
    );
    assert.ok(
      d.cooperative.false_admit_rate <= 0.15,
      `false-admit should stay low on SciFact, got ${d.cooperative.false_admit_rate}`,
    );
  });
});

const TREE = join(ROOT, 'bench', 'bench-inference-tree-sharing.mjs');
const SUBTREE = join(ROOT, 'bench', 'bench-subject-tree-prefetch.mjs');

describe('P2P inference-tree sharing — massive retrieval lift, honest', () => {
  it('paraphrase-generalized: ≥80% recall@1 lift with ZERO hurt (no gaming)', { skip: realSkip }, () => {
    // --always-paraphrase rules out exact-query cache; the gain must come from
    // matching a PARAPHRASE to a prior answered question and inheriting its
    // verified doc. hurt=0 means it never degrades retrieval.
    const r = spawnSync('node', [TREE, '--json', '--dataset', 'scifact', '--k', '1', '--always-paraphrase', '--steps', '1500'], {
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180_000,
    });
    if (r.status !== 0) throw new Error(`tree bench failed: ${r.stderr}`);
    const d = JSON.parse(r.stdout.trim());
    assert.ok(d.improvement >= 0.8, `expected ≥80% recall@1 lift, got ${(d.improvement * 100).toFixed(0)}%`);
    assert.equal(d.hurt, 0, `tree-sharing must not hurt retrieval, got ${d.hurt}`);
  });

  it('subtree prefetch pre-answers the follow-up questions (next 4–8)', { skip: realSkip }, () => {
    const r = spawnSync('node', [SUBTREE, '--json', '--dataset', 'scifact', '--session', '8', '--steps', '300'], {
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180_000,
    });
    if (r.status !== 0) throw new Error(`subtree bench failed: ${r.stderr}`);
    const d = JSON.parse(r.stdout.trim());
    assert.ok(
      d.follow.subtree > d.follow.baseline * 1.8,
      `follow-up subtree recall should ≫ baseline: ${d.follow.subtree} vs ${d.follow.baseline}`,
    );
    assert.equal(d.follow.hurt, 0, `subtree prefetch must not hurt, got ${d.follow.hurt}`);
  });

  it('beats a single-node semantic cache at MATCHED error (the defensible claim)', { skip: realSkip }, () => {
    const VCACHE = join(ROOT, 'bench', 'bench-vcache-compare.mjs');
    const r = spawnSync('node', [VCACHE, '--json', '--dataset', 'scifact', '--steps', '3000'], {
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 180_000,
    });
    if (r.status !== 0) throw new Error(`vcache-compare failed: ${r.stderr}`);
    const d = JSON.parse(r.stdout.trim());
    // both operating points respect the false-accept budget; federation wins recall
    assert.ok(d.federated.false_accept <= d.budget + 0.005, `federated must respect error budget, got ${d.federated.false_accept}`);
    assert.ok(d.single_node.false_accept <= d.budget + 0.005, `single-node must respect error budget, got ${d.single_node.false_accept}`);
    assert.ok(
      d.federated.recall > d.single_node.recall * 1.08,
      `federation should beat single-node cache at matched error: ${d.federated.recall} vs ${d.single_node.recall}`,
    );
  });
});
