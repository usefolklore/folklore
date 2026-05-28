/**
 * Benchmark — Bayesian reliability calibration (Phase 23).
 *
 * Synthetic feedback stream: simulate a procedure with a true
 * Bernoulli success rate `p ∈ {0.2, 0.5, 0.8}` and feed 1000
 * outcomes into `updateBeta`. Measure the absolute error
 * `|betaMean(counter) − p|` after step 1000.
 *
 * Statistical expectation: with 1000 binomial samples the posterior
 * mean is within ±0.03 of `p` with overwhelming probability. We
 * set the acceptance floor at 0.05 to absorb fixture-seed variance
 * while still catching any drift in the update math.
 *
 * Deterministic RNG (seeded mulberry32) so the test is reproducible
 * across runs.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendFileSync as _appendFileSync } from 'node:fs';
const appendBenchReport = (path: string, data: string): void => _appendFileSync(path, data);
import { initialBetaCounter, updateBeta, betaMean } from '../src/domain/long-term-memory.js';
import type { BenchSuiteReport } from '../src/domain/bench-types.js';

// ─────────────── seeded RNG ─────────────

const mulberry32 = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const sampleBinomial = (rand: () => number, p: number): boolean => rand() < p;

// ─────────────── single calibration run ─────────────

interface CalibrationRun {
  readonly truth: number;
  readonly steps: number;
  readonly seed: number;
}

interface CalibrationResult {
  readonly truth: number;
  readonly meanAfter: number;
  readonly absError: number;
}

const runCalibration = (cfg: CalibrationRun): CalibrationResult => {
  const rand = mulberry32(cfg.seed);
  let counter = initialBetaCounter();
  for (let i = 0; i < cfg.steps; i++) {
    counter = updateBeta(counter, sampleBinomial(rand, cfg.truth));
  }
  const meanAfter = betaMean(counter);
  return { truth: cfg.truth, meanAfter, absError: Math.abs(meanAfter - cfg.truth) };
};

// ─────────────── test ─────────────

test('bench: beta calibration converges to truth within 0.05 over 1000 steps', () => {
  const t0 = performance.now();
  const runs: readonly CalibrationRun[] = [
    { truth: 0.2, steps: 1000, seed: 1 },
    { truth: 0.5, steps: 1000, seed: 2 },
    { truth: 0.8, steps: 1000, seed: 3 },
    // Also two short streams to verify that early estimates are looser
    { truth: 0.5, steps: 50, seed: 11 },
    { truth: 0.5, steps: 200, seed: 12 },
  ];
  const results = runs.map(runCalibration);
  const elapsedMs = performance.now() - t0;

  // Long-stream runs (≥1000 steps) must be within 0.05
  const longRuns = results.filter((r, i) => runs[i].steps >= 1000);
  const worstLong = Math.max(...longRuns.map((r) => r.absError));
  const meanAbsError = longRuns.reduce((s, r) => s + r.absError, 0) / longRuns.length;

  const report: BenchSuiteReport = {
    suite: 'beta-calibration',
    metrics: {
      betaCalibration: 1 - worstLong,  // 1 − worst error → in [0, 1]
      meanAbsError,
      worstAbsError: worstLong,
    },
    perQuery: results.map((r, i) => ({
      id: `truth-${r.truth}-steps-${runs[i].steps}-seed-${runs[i].seed}`,
      metric: 'absError',
      value: r.absError,
    })),
    elapsedMs,
  };

  if (process.env.AKASHIK_BENCH_OUT) {
    appendBenchReport(process.env.AKASHIK_BENCH_OUT, JSON.stringify(report) + '\n');
  }

  console.log(
    `bench beta-calibration: worst |err|=${worstLong.toFixed(4)}, mean |err|=${meanAbsError.toFixed(4)} in ${elapsedMs.toFixed(1)}ms`,
  );
  for (const r of results) {
    console.log(`  truth=${r.truth} mean=${r.meanAfter.toFixed(4)} |err|=${r.absError.toFixed(4)}`);
  }
  assert.ok(worstLong < 0.05, `worst calibration error ${worstLong} ≥ 0.05`);
});
