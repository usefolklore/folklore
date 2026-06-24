/**
 * Unit tests — IR metrics (recall@k, NDCG@k, MRR).
 *
 * Locks the math so future eval-harness changes (PPR ablation, BGE-M3
 * upgrade comparison, HyDE A/B) keep using a stable reference.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { recallAtK, recallAnyAtK, ndcgAtK, reciprocalRank } from '../src/domain/eval-metrics.js';

const setOf = (...ids: string[]): ReadonlySet<string> => new Set(ids);

// ─────────────── recall@k ─────────────────

test('recall@k — perfect retrieval at top-k', () => {
  const r = recallAtK(['a', 'b', 'c'], setOf('a', 'b'), 3);
  assert.equal(r, 1);
});

test('recall@k — no relevant retrieved is 0', () => {
  const r = recallAtK(['x', 'y', 'z'], setOf('a', 'b'), 3);
  assert.equal(r, 0);
});

test('recall@k — partial retrieval', () => {
  // 1 of 2 relevant items in top-3 → 0.5
  const r = recallAtK(['x', 'a', 'y'], setOf('a', 'b'), 3);
  assert.equal(r, 0.5);
});

test('recall@k — empty relevant set returns 0 (vacuous)', () => {
  const r = recallAtK(['a', 'b'], setOf(), 3);
  assert.equal(r, 0);
});

// ─────────────── recall_any@k ─────────────────
// The apples-to-apples metric for multi-gold queries (agentmemory et al.):
// 1 if ANY gold is in top-k, vs recallAtK's fraction-of-gold.

test('recall_any@k — any gold in top-k is 1 (the multi-gold distinction)', () => {
  // 1 of 2 gold in top-3 → recall_any 1.0 but fraction-recall 0.5
  assert.equal(recallAnyAtK(['x', 'a', 'y'], setOf('a', 'b'), 3), 1);
  assert.equal(recallAtK(['x', 'a', 'y'], setOf('a', 'b'), 3), 0.5);
});

test('recall_any@k — no gold in top-k is 0', () => {
  assert.equal(recallAnyAtK(['x', 'y', 'z'], setOf('a', 'b'), 3), 0);
});

test('recall_any@k — gold below the cutoff does not count', () => {
  // gold 'a' sits at rank 3, k=2 → not counted
  assert.equal(recallAnyAtK(['x', 'y', 'a'], setOf('a'), 2), 0);
  assert.equal(recallAnyAtK(['x', 'y', 'a'], setOf('a'), 3), 1);
});

test('recall_any@k — empty relevant set returns 0 (vacuous)', () => {
  assert.equal(recallAnyAtK(['a', 'b'], setOf(), 3), 0);
});

test('recall@k — k smaller than retrieved truncates correctly', () => {
  // Relevant 'b' is at position 4 — outside top-3 → 0 hit
  const r = recallAtK(['x', 'y', 'z', 'b'], setOf('b'), 3);
  assert.equal(r, 0);
});

// ─────────────── ndcg@k ───────────────────

test('ndcg@k — relevant at rank 1 yields 1.0', () => {
  const r = ndcgAtK(['a', 'b', 'c'], setOf('a'), 3);
  assert.equal(r, 1);
});

test('ndcg@k — relevant at rank 2 < 1.0 (logarithmic discount)', () => {
  // DCG = 1 / log2(3) ≈ 0.6309
  // IDCG (1 relevant) = 1 / log2(2) = 1
  // NDCG = 0.6309
  const r = ndcgAtK(['x', 'a', 'y'], setOf('a'), 3);
  assert.ok(Math.abs(r - 1 / Math.log2(3)) < 1e-9, `got ${r}`);
});

test('ndcg@k — multiple relevant items rank correctly', () => {
  // Both 'a' and 'b' relevant; retrieved as positions 1 and 3.
  // DCG = 1/log2(2) + 1/log2(4) = 1 + 0.5 = 1.5
  // IDCG@3 = 1/log2(2) + 1/log2(3) ≈ 1 + 0.6309 = 1.6309
  // NDCG ≈ 0.9197
  const r = ndcgAtK(['a', 'x', 'b'], setOf('a', 'b'), 3);
  const expected = (1 + 1 / Math.log2(4)) / (1 + 1 / Math.log2(3));
  assert.ok(Math.abs(r - expected) < 1e-9, `got ${r}, expected ${expected}`);
});

test('ndcg@k — empty relevant returns 0', () => {
  assert.equal(ndcgAtK(['a', 'b'], setOf(), 3), 0);
});

test('ndcg@k — perfect ranking == 1.0 even when k > |relevant|', () => {
  const r = ndcgAtK(['a', 'b', 'c'], setOf('a', 'b'), 5);
  assert.equal(r, 1);
});

// ─────────────── reciprocal rank ──────────

test('MRR component — first relevant at rank 1 → 1.0', () => {
  assert.equal(reciprocalRank(['a', 'x', 'y'], setOf('a')), 1);
});

test('MRR component — first relevant at rank 3 → 1/3', () => {
  assert.equal(reciprocalRank(['x', 'y', 'a'], setOf('a')), 1 / 3);
});

test('MRR component — no relevant → 0', () => {
  assert.equal(reciprocalRank(['x', 'y', 'z'], setOf('a')), 0);
});

test('MRR component — ignores second relevant (only first counts)', () => {
  // 'a' at rank 2, 'b' at rank 4 — RR = 1/2
  assert.equal(reciprocalRank(['x', 'a', 'y', 'b'], setOf('a', 'b')), 0.5);
});
