/**
 * Benchmark — write-time gate precision/recall (Phase 23).
 *
 * 100-candidate labelled fixture (60 promote, 40 drop) — each tagged
 * with the ground-truth gate decision. Run `partitionByGate` over
 * the fixture, compare against labels, report precision + recall
 * + F1 on the promote class.
 *
 * Acceptance: F1 ≥ 0.90. Gate logic is deterministic — anything
 * below means a rule regressed or the fixture drifted from intent.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendFileSync as _appendFileSync } from 'node:fs';
const appendBenchReport = (path: string, data: string): void => _appendFileSync(path, data);
import {
  partitionByGate,
  tokenSet,
  type WriteGateCandidate,
  type ExistingSemantic,
} from '../src/domain/write-time-gate.js';
import {
  f1,
  precision,
  recall,
  type ConfusionMatrix,
  type BenchSuiteReport,
} from '../src/domain/bench-types.js';

// ─────────────── fixture ─────────────

interface LabelledCandidate extends WriteGateCandidate {
  readonly expectedPromote: boolean;
}

/**
 * Good candidates use a diverse body template — each substantive and
 * concept-tagged but worded distinctly so they don't accidentally
 * Jaccard-match the contradiction anchor.
 */
const goodBody = (i: number): string => {
  const topics = [
    'matryoshka representation learning reduces embedding dimension while preserving downstream task quality on document classification',
    'split-encoder bi-encoders trained with hard negative mining outperform vanilla DPR on cold-start passage ranking workloads',
    'late-interaction colbert architecture beats single-vector dense retrieval on long document corpora at the cost of index size',
    'hybrid bm25 plus dense fusion via reciprocal rank fusion captures both lexical and semantic relevance signals consistently',
    'two-stage pipelines reranking top fifty bi-encoder candidates with cross-encoder yield two ndcg points on most beir tasks',
    'distillation from a strong teacher to a small student preserves seventy percent of retrieval quality at one tenth the cost',
  ];
  return topics[i % topics.length] + ` Concrete number measured: ${0.05 + (i % 17) * 0.01} on validation split ${i}.`;
};

const FIXTURE: readonly LabelledCandidate[] = [
  // ─── promote: 60 cases ─────────────
  ...Array.from({ length: 30 }, (_, i) => ({
    id: `obs-good-${i}`,
    body: goodBody(i),
    importance: 6 + (i % 4),
    concepts: ['retrieval', 'benchmark'],
    sourceUri: `https://example.com/post-${i}`,
    expectedPromote: true,
  })),
  ...Array.from({ length: 30 }, (_, i) => ({
    id: `obs-rich-${i}`,
    body:
      'This is a substantive observation about Phi-4-mini quantisation outperforming a baseline ' +
      `on the ${i % 5 === 0 ? 'BEIR SciFact' : 'HotpotQA'} subset with concrete numbers attached.`,
    importance: 5 + (i % 5),
    concepts: ['llm', 'quantisation', 'benchmark'],
    sourceUri: `https://hn.com/item?id=${10000000 + i}`,
    expectedPromote: true,
  })),

  // ─── drop: low importance — 10 cases ─────────────
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `obs-lowimp-${i}`,
    body: goodBody(i),
    importance: 1 + (i % 2),
    concepts: ['retrieval'],
    sourceUri: `https://example.com/lowimp-${i}`,
    expectedPromote: false,
  })),

  // ─── drop: schema — no concepts — 10 cases ─────────────
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `obs-noconcept-${i}`,
    body: goodBody(i),
    importance: 8,
    concepts: [] as readonly string[],
    sourceUri: `https://example.com/noconcept-${i}`,
    expectedPromote: false,
  })),

  // ─── drop: schema — short body — 10 cases ─────────────
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `obs-shortbody-${i}`,
    body: 'too short',
    importance: 8,
    concepts: ['x'],
    sourceUri: `https://example.com/short-${i}`,
    expectedPromote: false,
  })),

  // ─── drop: contradicts existing strong semantic — 10 cases ─────────────
  // Body is a near-duplicate of the anchor below; concepts include the
  // anchor's plus one disjoint tag so the disagreement check fires.
  ...Array.from({ length: 10 }, (_, i) => ({
    id: `obs-contra-${i}`,
    body:
      `Hydrogen detection sensor calibration via 532nm Raman spectroscopy backscatter at threshold ${0.1 + i * 0.01} ppm with validated noise floor measured across nine field sites in laboratory conditions.`,
    importance: 8,
    concepts: ['hydrogen-detection', 'raman', 'contradicted-claim'],
    sourceUri: `https://example.com/contra-${i}`,
    expectedPromote: false,
  })),
];

const EXISTING: readonly ExistingSemantic[] = [
  {
    id: 'sem-strong-anchor',
    // Token set engineered to share Jaccard ≥ 0.9 with the contra-* candidates
    tokens: tokenSet(
      'Hydrogen detection sensor calibration via 532nm Raman spectroscopy backscatter at threshold 0.05 ppm with validated noise floor measured across nine field sites in laboratory conditions.',
    ),
    strength: 0.95,
  },
];

test('bench: write-gate F1 ≥ 0.90', () => {
  const t0 = performance.now();
  const { promoted } = partitionByGate(FIXTURE, EXISTING);
  const promotedIds = new Set(promoted.map((c) => c.id));

  let tp = 0, fp = 0, fn = 0, tn = 0;
  for (const c of FIXTURE) {
    const pred = promotedIds.has(c.id);
    if (c.expectedPromote && pred) tp++;
    else if (!c.expectedPromote && pred) fp++;
    else if (c.expectedPromote && !pred) fn++;
    else tn++;
  }
  const cm: ConfusionMatrix = { tp, fp, fn, tn };
  const p = precision(cm);
  const r = recall(cm);
  const score = f1(cm);
  const elapsedMs = performance.now() - t0;

  const report: BenchSuiteReport = {
    suite: 'write-gate',
    metrics: {
      writeGateF1: score,
      precision: p,
      recall: r,
      tp, fp, fn, tn,
    },
    perQuery: [],
    elapsedMs,
  };

  if (process.env.FOLKLORE_BENCH_OUT) {
    appendBenchReport(process.env.FOLKLORE_BENCH_OUT, JSON.stringify(report) + '\n');
  }

  console.log(
    `bench write-gate: F1=${score.toFixed(4)} (P=${p.toFixed(3)} R=${r.toFixed(3)}, tp=${tp} fp=${fp} fn=${fn}) in ${elapsedMs.toFixed(1)}ms`,
  );
  assert.ok(score >= 0.90, `write-gate F1 ${score} below 0.90`);
});
