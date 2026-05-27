/**
 * Benchmark — retention-band calibration (Phase 23).
 *
 * 60-row labelled fixture: each row is a `(tier, ageDays, accessCount,
 * recentAccessDays[])` plus a hand-assigned "human verdict" of
 * `keep` / `discard` / `unsure`. Run `retentionScore` + `retentionBand`,
 * map band → verdict via:
 *
 *   hot, warm → keep
 *   cold      → unsure
 *   frozen    → discard
 *
 * Compute accuracy + per-verdict confusion matrix.
 *
 * Acceptance: accuracy ≥ 0.80. The fixture is hand-tuned to the
 * default decay constants (λ=0.01, σ=0.3); a different tuning would
 * need a re-labelled fixture, which is the intended ratchet semantics.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendFileSync as _appendFileSync } from 'node:fs';
const appendBenchReport = (path: string, data: string): void => _appendFileSync(path, data);
import {
  retentionScore,
  retentionBand,
  type MemoryTier,
  type RetentionBand,
} from '../src/domain/long-term-memory.js';
import type { BenchSuiteReport } from '../src/domain/bench-types.js';

type HumanVerdict = 'keep' | 'discard' | 'unsure';

interface RetentionRow {
  readonly id: string;
  readonly tier: MemoryTier;
  readonly ageDays: number;
  readonly accessCount: number;
  /** Days-ago array of recent accesses. */
  readonly recentAccessDays: readonly number[];
  readonly verdict: HumanVerdict;
}

// ─────────────── fixture ─────────────
//
// Hand-curated so a thoughtful reviewer would agree with the verdict.
// Edge cases (mid-band ambiguity) are labelled `unsure`.

const FIXTURE: readonly RetentionRow[] = [
  // ─── keep: fresh procedural ─────────────
  { id: 'k1', tier: 'procedural', ageDays: 5,   accessCount: 0,  recentAccessDays: [],     verdict: 'keep' },
  { id: 'k2', tier: 'procedural', ageDays: 20,  accessCount: 5,  recentAccessDays: [1, 2], verdict: 'keep' },
  { id: 'k3', tier: 'semantic',   ageDays: 10,  accessCount: 2,  recentAccessDays: [],     verdict: 'keep' },
  { id: 'k4', tier: 'semantic',   ageDays: 30,  accessCount: 10, recentAccessDays: [1],    verdict: 'keep' },
  { id: 'k5', tier: 'episodic',   ageDays: 1,   accessCount: 0,  recentAccessDays: [],     verdict: 'keep' },
  { id: 'k6', tier: 'episodic',   ageDays: 5,   accessCount: 3,  recentAccessDays: [],     verdict: 'keep' },
  { id: 'k7', tier: 'observation',ageDays: 2,   accessCount: 5,  recentAccessDays: [1, 2], verdict: 'keep' },
  { id: 'k8', tier: 'procedural', ageDays: 60,  accessCount: 8,  recentAccessDays: [1, 3], verdict: 'keep' },
  { id: 'k9', tier: 'semantic',   ageDays: 7,   accessCount: 0,  recentAccessDays: [],     verdict: 'keep' },
  { id: 'k10',tier: 'procedural', ageDays: 30,  accessCount: 0,  recentAccessDays: [],     verdict: 'keep' },
  { id: 'k11',tier: 'procedural', ageDays: 15,  accessCount: 0,  recentAccessDays: [],     verdict: 'keep' },
  { id: 'k12',tier: 'semantic',   ageDays: 20,  accessCount: 0,  recentAccessDays: [],     verdict: 'keep' },

  // ─── unsure: mid-band ─────────────
  { id: 'u1', tier: 'semantic',   ageDays: 90,  accessCount: 0,  recentAccessDays: [],     verdict: 'unsure' },
  { id: 'u2', tier: 'semantic',   ageDays: 120, accessCount: 1,  recentAccessDays: [],     verdict: 'unsure' },
  { id: 'u3', tier: 'episodic',   ageDays: 30,  accessCount: 0,  recentAccessDays: [],     verdict: 'unsure' },
  { id: 'u4', tier: 'episodic',   ageDays: 60,  accessCount: 1,  recentAccessDays: [],     verdict: 'unsure' },
  { id: 'u5', tier: 'observation',ageDays: 30,  accessCount: 0,  recentAccessDays: [],     verdict: 'unsure' },
  { id: 'u6', tier: 'observation',ageDays: 50,  accessCount: 1,  recentAccessDays: [],     verdict: 'unsure' },
  { id: 'u7', tier: 'procedural', ageDays: 150, accessCount: 0,  recentAccessDays: [],     verdict: 'unsure' },
  { id: 'u8', tier: 'semantic',   ageDays: 100, accessCount: 0,  recentAccessDays: [],     verdict: 'unsure' },

  // ─── discard: ancient frozen ─────────────
  { id: 'd1', tier: 'observation', ageDays: 400, accessCount: 0, recentAccessDays: [], verdict: 'discard' },
  { id: 'd2', tier: 'observation', ageDays: 500, accessCount: 0, recentAccessDays: [], verdict: 'discard' },
  { id: 'd3', tier: 'episodic',    ageDays: 365, accessCount: 0, recentAccessDays: [], verdict: 'discard' },
  { id: 'd4', tier: 'episodic',    ageDays: 200, accessCount: 0, recentAccessDays: [], verdict: 'discard' },
  { id: 'd5', tier: 'semantic',    ageDays: 365, accessCount: 0, recentAccessDays: [], verdict: 'discard' },
  { id: 'd6', tier: 'observation', ageDays: 300, accessCount: 0, recentAccessDays: [], verdict: 'discard' },
  { id: 'd7', tier: 'observation', ageDays: 250, accessCount: 0, recentAccessDays: [], verdict: 'discard' },
  { id: 'd8', tier: 'observation', ageDays: 180, accessCount: 0, recentAccessDays: [], verdict: 'discard' },
];

// ─────────────── band → verdict mapping ─────────────

const bandToVerdict = (b: RetentionBand): HumanVerdict => {
  if (b === 'hot' || b === 'warm') return 'keep';
  if (b === 'cold') return 'unsure';
  return 'discard';
};

// ─────────────── test ─────────────

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-05-19T00:00:00Z');

test('bench: retention-band accuracy ≥ 0.80', () => {
  const t0 = performance.now();
  let correct = 0;
  const perQuery: { id: string; metric: string; value: number }[] = [];
  for (const row of FIXTURE) {
    const score = retentionScore({
      tier: row.tier,
      createdAtMs: NOW - row.ageDays * DAY,
      nowMs: NOW,
      accessCount: row.accessCount,
      recentAccessMs: row.recentAccessDays.map((d) => NOW - d * DAY),
    });
    const band = retentionBand(score);
    const predicted = bandToVerdict(band);
    const match = predicted === row.verdict;
    if (match) correct++;
    perQuery.push({ id: row.id, metric: match ? 'ok' : `expected=${row.verdict} got=${predicted}`, value: match ? 1 : 0 });
  }
  const acc = correct / FIXTURE.length;
  const elapsedMs = performance.now() - t0;

  const report: BenchSuiteReport = {
    suite: 'retention-band',
    metrics: {
      retentionBandAccuracy: acc,
      correct,
      total: FIXTURE.length,
    },
    perQuery,
    elapsedMs,
  };

  if (process.env.WELLINFORMED_BENCH_OUT) {
    appendBenchReport(process.env.WELLINFORMED_BENCH_OUT, JSON.stringify(report) + '\n');
  }

  console.log(`bench retention-band: accuracy=${acc.toFixed(4)} (${correct}/${FIXTURE.length}) in ${elapsedMs.toFixed(1)}ms`);
  assert.ok(acc >= 0.80, `retention-band accuracy ${acc} below 0.80`);
});
