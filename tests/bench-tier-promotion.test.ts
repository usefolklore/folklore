/**
 * Benchmark — tier-promotion classification accuracy (Phase 23).
 *
 * Labelled URI fixture: 200 IDs each tagged with their ground-truth
 * tier. Runs `tierForUri` over the fixture, computes per-class
 * confusion matrices, reports macro-F1.
 *
 * This is a akashik-specific axis — no public benchmark exists
 * for "did the system correctly classify this URI's tier?" — so
 * the fixture is in-repo + deterministic.
 *
 * Acceptance: macro-F1 ≥ 0.95. Tier classification is rule-based
 * (URI-prefix match), so anything below 0.95 means we broke the
 * scheme registry.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendFileSync as _appendFileSync } from 'node:fs';
const appendBenchReport = (path: string, data: string): void => _appendFileSync(path, data);
import { tierForUri, type MemoryTier } from '../src/domain/long-term-memory.js';
import {
  macroF1,
  type ConfusionMatrix,
  type BenchSuiteReport,
} from '../src/domain/bench-types.js';

interface LabelledUri {
  readonly uri: string;
  readonly expected: MemoryTier;
}

const FIXTURE: readonly LabelledUri[] = [
  // ─── episodic (session://) — 25 ─────────────
  ...Array.from({ length: 25 }, (_, i) => ({
    uri: `session://${String(i).padStart(3, '0')}-${(i * 7919) % 1000}`,
    expected: 'episodic' as const,
  })),
  // ─── semantic (synthesis://) — 50 ─────────────
  ...Array.from({ length: 50 }, (_, i) => ({
    uri: `synthesis://${['hydrogen-detection', 'rag-eval', 'p2p-federation', 'bge-vs-minilm', 'tier-promotion'][i % 5]}-${i}`,
    expected: 'semantic' as const,
  })),
  // ─── procedural (decision://) — 25 ─────────────
  ...Array.from({ length: 25 }, (_, i) => ({
    uri: `decision://${['release-workflow', 'pr-review-flow', 'hotfix-protocol', 'eval-rerun'][i % 4]}-v${i}`,
    expected: 'procedural' as const,
  })),
  // ─── observation — 100, spanning the realistic URI surface ─────────────
  ...Array.from({ length: 25 }, (_, i) => ({
    uri: `file:///Users/x/repo/src/file-${i}.ts`,
    expected: 'observation' as const,
  })),
  ...Array.from({ length: 20 }, (_, i) => ({
    uri: `https://arxiv.org/abs/2${500 + i}.${10000 + i * 13}`,
    expected: 'observation' as const,
  })),
  ...Array.from({ length: 15 }, (_, i) => ({
    uri: `arxiv://2${300 + i}.${50000 + i}`,
    expected: 'observation' as const,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    uri: `hn://${30000000 + i * 123}`,
    expected: 'observation' as const,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    uri: `rss://example.com/feed-${i}`,
    expected: 'observation' as const,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    uri: `git://commit-abc${String(i).padStart(7, '0')}`,
    expected: 'observation' as const,
  })),
  ...Array.from({ length: 10 }, (_, i) => ({
    uri: `npm://lodash@4.17.${i}`,
    expected: 'observation' as const,
  })),
] as const;

const buildConfusionMatrix = (
  klass: MemoryTier,
  predictions: ReadonlyArray<{ expected: MemoryTier; predicted: MemoryTier }>,
): ConfusionMatrix => {
  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const { expected, predicted } of predictions) {
    const isE = expected === klass;
    const isP = predicted === klass;
    if (isE && isP) tp++;
    else if (!isE && isP) fp++;
    else if (isE && !isP) fn++;
    else tn++;
  }
  return { tp, fp, fn, tn };
};

test('bench: tier-promotion macro-F1 ≥ 0.95', () => {
  const t0 = performance.now();
  const predictions = FIXTURE.map((row) => ({
    expected: row.expected,
    predicted: tierForUri(row.uri),
  }));
  const classes: readonly MemoryTier[] = ['observation', 'episodic', 'semantic', 'procedural'];
  const matrices: ConfusionMatrix[] = classes.map((c) => buildConfusionMatrix(c, predictions));
  const macro = macroF1(matrices);
  const elapsedMs = performance.now() - t0;

  const report: BenchSuiteReport = {
    suite: 'tier-promotion',
    metrics: {
      tierPromotionF1: macro,
      observationF1:  (() => { const m = matrices[0]; return m.tp + m.fp + m.fn > 0 ? (2 * m.tp) / (2 * m.tp + m.fp + m.fn) : 0; })(),
      episodicF1:     (() => { const m = matrices[1]; return m.tp + m.fp + m.fn > 0 ? (2 * m.tp) / (2 * m.tp + m.fp + m.fn) : 0; })(),
      semanticF1:     (() => { const m = matrices[2]; return m.tp + m.fp + m.fn > 0 ? (2 * m.tp) / (2 * m.tp + m.fp + m.fn) : 0; })(),
      proceduralF1:   (() => { const m = matrices[3]; return m.tp + m.fp + m.fn > 0 ? (2 * m.tp) / (2 * m.tp + m.fp + m.fn) : 0; })(),
    },
    perQuery: [],
    elapsedMs,
  };

  // Persist the report for the composite runner to pick up.
  if (process.env.AKASHIK_BENCH_OUT) {
    appendBenchReport(process.env.AKASHIK_BENCH_OUT, JSON.stringify(report) + '\n');
  }

  console.log(`bench tier-promotion: macro-F1=${macro.toFixed(4)} in ${elapsedMs.toFixed(1)}ms`);
  assert.ok(macro >= 0.95, `macro-F1 ${macro} below acceptance floor 0.95`);
});
