/**
 * Unit tests — learned satisfaction weights + the abstaining shadow
 * auto-judge (RFC-0003 OQ#5 R&D).
 *
 * These lock three invariants:
 *  1. Backward compatibility — too little / degenerate signal returns the
 *     hand-tuned DEFAULT_COMPONENT_WEIGHTS unchanged (`learned=false`).
 *  2. Real learning — a labelled set where one component cleanly separates
 *     satisfied from unsatisfied makes the learner up-weight that component.
 *  3. Honesty — the auto-judge never invents an outcome without a genuine
 *     signal; it abstains (returns null) otherwise.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  learnWeights,
  reweightScore,
  DEFAULT_COMPONENT_WEIGHTS,
  COMPONENT_NAMES,
  type LabeledSample,
  type ComponentName,
  type ComponentTrace,
} from '../src/domain/peer-telemetry.js';
import {
  judgeReceipt,
  receiptsToSamples,
  type ShadowReceipt,
} from '../src/domain/shadow-receipt.js';

// ─────────── helpers ───────────

const sample = (values: Partial<Record<ComponentName, number>>, satisfied: boolean): LabeledSample => ({
  values,
  satisfied,
});

const trace = (name: ComponentName, value: number, observed = true): ComponentTrace => ({
  name,
  value,
  observed,
  weight: observed ? 0.25 : 0,
});

const receipt = (over: Partial<ShadowReceipt>): ShadowReceipt => ({
  emitted_at: '2026-06-16T00:00:00.000Z',
  query: 'q',
  decision: 'use_memory',
  score: 0.9,
  risk: 'low',
  would_shadow_search: false,
  result_count: 3,
  distinct_origins: 2,
  coverage_ratio: null,
  missing_terms: [],
  components: undefined,
  outcome: 'unlabelled',
  ...over,
});

const sumWeights = (w: Record<ComponentName, number>): number =>
  COMPONENT_NAMES.reduce((a, n) => a + w[n], 0);

// ─────────── learnWeights: degenerate fallback ───────────

test('learnWeights: too few samples → DEFAULT weights, learned=false', () => {
  const samples = [sample({ retrieval: 0.9 }, true), sample({ retrieval: 0.1 }, false)];
  const res = learnWeights(samples);
  assert.equal(res.learned, false);
  assert.deepEqual(res.weights, DEFAULT_COMPONENT_WEIGHTS);
  assert.match(res.fallback_reason, /labelled samples/);
  assert.equal(res.samples_used, 2);
});

test('learnWeights: empty input → DEFAULT weights, learned=false', () => {
  const res = learnWeights([]);
  assert.equal(res.learned, false);
  assert.deepEqual(res.weights, DEFAULT_COMPONENT_WEIGHTS);
});

test('learnWeights: one class empty → fallback (cannot separate)', () => {
  // 10 satisfied rows, 0 unsatisfied — Fisher ratio is undefined.
  const samples = Array.from({ length: 10 }, () => sample({ retrieval: 0.8, freshness: 0.6 }, true));
  const res = learnWeights(samples);
  assert.equal(res.learned, false);
  assert.match(res.fallback_reason, /class imbalance/);
  assert.deepEqual(res.weights, DEFAULT_COMPONENT_WEIGHTS);
});

test('learnWeights: no component separates the classes → degenerate fallback', () => {
  // Both classes have IDENTICAL component distributions — zero separation
  // anywhere. The honest answer is the equal split, not noise.
  const rows: LabeledSample[] = [];
  for (let i = 0; i < 6; i++) rows.push(sample({ retrieval: 0.5, freshness: 0.5, provenance: 0.5 }, true));
  for (let i = 0; i < 6; i++) rows.push(sample({ retrieval: 0.5, freshness: 0.5, provenance: 0.5 }, false));
  const res = learnWeights(rows);
  assert.equal(res.learned, false);
  assert.match(res.fallback_reason, /degenerate|separates/);
  assert.deepEqual(res.weights, DEFAULT_COMPONENT_WEIGHTS);
});

// ─────────── learnWeights: real learning ───────────

test('learnWeights: a cleanly separating component earns the most weight', () => {
  // `retrieval` perfectly separates satisfied (high) from unsatisfied (low).
  // `provenance` is pure noise — same value in both classes. The learner
  // must up-weight retrieval well above the 0.2 baseline and down-weight
  // provenance below it.
  const rows: LabeledSample[] = [];
  for (let i = 0; i < 8; i++) {
    rows.push(sample({ retrieval: 0.9, provenance: 0.5 }, true));
  }
  for (let i = 0; i < 8; i++) {
    rows.push(sample({ retrieval: 0.1, provenance: 0.5 }, false));
  }
  const res = learnWeights(rows);
  assert.equal(res.learned, true);
  assert.equal(res.fallback_reason, '');
  assert.ok(
    res.weights.retrieval > 0.2,
    `retrieval should beat baseline, got ${res.weights.retrieval}`,
  );
  assert.ok(
    res.weights.retrieval > res.weights.provenance,
    `separating component must outweigh the noisy one: ${res.weights.retrieval} vs ${res.weights.provenance}`,
  );
  // Weights remain a valid distribution.
  assert.ok(Math.abs(sumWeights(res.weights) - 1) < 1e-9, `weights must sum to 1, got ${sumWeights(res.weights)}`);
  for (const n of COMPONENT_NAMES) assert.ok(res.weights[n] >= 0, `weight ${n} non-negative`);
});

test('learnWeights: learned weights demonstrably separate satisfied vs unsatisfied', () => {
  // Build a labelled set where freshness is the discriminating signal.
  // Then score a satisfied-looking trace and an unsatisfied-looking trace
  // under the learned weights — the learned vector must rank them apart by
  // MORE than the equal-weight baseline would (it has discovered freshness
  // matters and retrieval/provenance are flat noise).
  const rows: LabeledSample[] = [];
  for (let i = 0; i < 10; i++) {
    rows.push(sample({ retrieval: 0.6, freshness: 0.95, provenance: 0.6 }, true));
  }
  for (let i = 0; i < 10; i++) {
    rows.push(sample({ retrieval: 0.6, freshness: 0.05, provenance: 0.6 }, false));
  }
  const res = learnWeights(rows);
  assert.equal(res.learned, true);
  assert.ok(res.weights.freshness > res.weights.retrieval, 'freshness must dominate');

  const satTrace: ComponentTrace[] = [
    trace('retrieval', 0.6),
    trace('freshness', 0.95),
    trace('provenance', 0.6),
  ];
  const unsatTrace: ComponentTrace[] = [
    trace('retrieval', 0.6),
    trace('freshness', 0.05),
    trace('provenance', 0.6),
  ];

  const learnedGap = reweightScore(satTrace, res.weights) - reweightScore(unsatTrace, res.weights);
  const equalGap = reweightScore(satTrace, DEFAULT_COMPONENT_WEIGHTS) - reweightScore(unsatTrace, DEFAULT_COMPONENT_WEIGHTS);
  assert.ok(
    learnedGap > equalGap,
    `learned weighting should separate the classes more than equal: learned=${learnedGap} equal=${equalGap}`,
  );
});

// ─────────── reweightScore ───────────

test('reweightScore: equal weights reproduce the plain observed-average', () => {
  const t: ComponentTrace[] = [trace('retrieval', 0.8), trace('freshness', 0.4)];
  const avg = (0.8 + 0.4) / 2;
  assert.ok(Math.abs(reweightScore(t, DEFAULT_COMPONENT_WEIGHTS) - avg) < 1e-9);
});

test('reweightScore: unobserved components are dropped, not zero-filled', () => {
  const t: ComponentTrace[] = [
    trace('retrieval', 0.8),
    trace('freshness', 0.0, false), // unobserved — must NOT drag the score down
  ];
  // Only retrieval observed → score is exactly retrieval's value.
  assert.ok(Math.abs(reweightScore(t, DEFAULT_COMPONENT_WEIGHTS) - 0.8) < 1e-9);
});

test('reweightScore: empty / all-unobserved → 0', () => {
  assert.equal(reweightScore([], DEFAULT_COMPONENT_WEIGHTS), 0);
  assert.equal(reweightScore([trace('retrieval', 0.9, false)], DEFAULT_COMPONENT_WEIGHTS), 0);
});

// ─────────── receiptsToSamples ───────────

test('receiptsToSamples: drops unlabelled and component-less receipts', () => {
  const rows = receiptsToSamples([
    receipt({ outcome: 'unlabelled', components: [trace('retrieval', 0.9)] }), // unlabelled → drop
    receipt({ outcome: 'good_skip', components: undefined }),                   // no features → drop
    receipt({ outcome: 'good_skip', components: [trace('retrieval', 0.9)] }),   // keep, satisfied
    receipt({ outcome: 'bad_skip', components: [trace('retrieval', 0.2)] }),    // keep, unsatisfied
    receipt({ outcome: 'good_search', components: [trace('freshness', 0.7)] }), // keep, satisfied
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].satisfied, true);
  assert.equal(rows[1].satisfied, false);
  assert.equal(rows[2].satisfied, true);
  // Unobserved component values are omitted from the feature map.
  const withMixed = receiptsToSamples([
    receipt({ outcome: 'good_skip', components: [trace('retrieval', 0.9), trace('signature', 0, false)] }),
  ]);
  assert.deepEqual(Object.keys(withMixed[0].values), ['retrieval']);
});

// ─────────── judgeReceipt: honesty invariant ───────────

test('judgeReceipt: abstains (null) without a genuine signal — never fabricates from score', () => {
  // A high-score skip with NO coverage map is NOT auto-judgeable. The score
  // is what we are calibrating; using it as its own label would be circular
  // and dishonest. Must return null.
  assert.equal(judgeReceipt(receipt({ decision: 'use_memory', score: 0.99, coverage_ratio: null })), null);
});

test('judgeReceipt: full coverage on a confident skip is an honest good_skip', () => {
  const r = receipt({ decision: 'use_memory', coverage_ratio: 1, missing_terms: [] });
  assert.equal(judgeReceipt(r), 'good_skip');
});

test('judgeReceipt: partial coverage on a skip still abstains (no fabrication)', () => {
  // Coverage < 1 with missing terms on a skip is suspicious, but we have no
  // PROOF the missing term mattered without a live search. Abstain.
  const r = receipt({ decision: 'use_memory', coverage_ratio: 0.5, missing_terms: ['x'] });
  assert.equal(judgeReceipt(r), null);
});

test('judgeReceipt: escalating decision needs a real live-search signal', () => {
  const r = receipt({ decision: 'search_required', would_shadow_search: true, coverage_ratio: 0.4, missing_terms: ['x'] });
  // No caller signal → abstain.
  assert.equal(judgeReceipt(r), null);
  // Live search found a missing term → bad_skip (memory was actually wrong).
  assert.equal(judgeReceipt(r, { liveSearchFoundMissing: true }), 'bad_skip');
  // Live search found nothing missing → good_search (escalation safe, memory not wrong).
  assert.equal(judgeReceipt(r, { liveSearchFoundMissing: false }), 'good_search');
});

test('judgeReceipt: never overwrites an existing human label', () => {
  const r = receipt({ decision: 'use_memory', coverage_ratio: 1, missing_terms: [], outcome: 'bad_skip' });
  assert.equal(judgeReceipt(r), null);
});
