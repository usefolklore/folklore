/**
 * Unit tests — long-term memory tier vocabulary, Bayesian counters,
 * and retention math (Phase 21B).
 *
 * Pure-domain tests only — no I/O. Locks:
 *   - URI prefix → tier classification
 *   - Beta(α, β) update + mean + entropy
 *   - Expected utility selection formula (MACLA Eq. 4)
 *   - Salience-per-tier table + access-count bonus cap
 *   - Retention score formula + band classification
 *   - newTierMetadata sources-empty guard
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  tierForUri,
  initialBetaCounter,
  updateBeta,
  betaMean,
  betaEntropy,
  expectedUtility,
  salienceForTier,
  retentionScore,
  retentionBand,
  newTierMetadata,
  type BetaCounter,
} from '../src/domain/long-term-memory.js';

// ─────────────── tierForUri ─────────────

test('tierForUri: session:// → episodic', () => {
  assert.equal(tierForUri('session://abc'), 'episodic');
});

test('tierForUri: synthesis:// → semantic', () => {
  assert.equal(tierForUri('synthesis://hydrogen-detection-ai'), 'semantic');
});

test('tierForUri: decision:// → procedural', () => {
  assert.equal(tierForUri('decision://release-workflow'), 'procedural');
});

test('tierForUri: file:// + https:// + arxiv:// → observation', () => {
  assert.equal(tierForUri('file:///foo.md'), 'observation');
  assert.equal(tierForUri('https://example.com'), 'observation');
  assert.equal(tierForUri('arxiv://2511.07587'), 'observation');
});

test('tierForUri: empty string → observation (total function)', () => {
  assert.equal(tierForUri(''), 'observation');
});

// ─────────────── Beta(α, β) ─────────────

test('initialBetaCounter starts at Beta(1, 1) → mean 0.5', () => {
  const c = initialBetaCounter();
  assert.equal(c.alpha, 1);
  assert.equal(c.beta, 1);
  assert.equal(betaMean(c), 0.5);
});

test('updateBeta: success increments alpha; failure increments beta', () => {
  let c = initialBetaCounter();
  c = updateBeta(c, true);
  assert.deepEqual(c, { alpha: 2, beta: 1 });
  c = updateBeta(c, false);
  assert.deepEqual(c, { alpha: 2, beta: 2 });
});

test('updateBeta: corrupt counter resets to prior', () => {
  const corrupt: BetaCounter = { alpha: NaN, beta: 3 };
  const c = updateBeta(corrupt, true);
  assert.deepEqual(c, { alpha: 1, beta: 1 });
});

test('betaEntropy peaks at 0.5 mean, zero at deterministic edges', () => {
  const at50 = betaEntropy({ alpha: 1, beta: 1 });
  const at90 = betaEntropy({ alpha: 9, beta: 1 });
  const at01 = betaEntropy({ alpha: 1, beta: 99 });
  assert.ok(at50 > at90, `entropy at mean 0.5 (${at50}) must exceed mean 0.9 (${at90})`);
  assert.ok(at50 > at01, `entropy at mean 0.5 (${at50}) must exceed mean 0.01 (${at01})`);
  // Bernoulli entropy at p=0.5 is ln 2 ≈ 0.6931
  assert.ok(Math.abs(at50 - Math.log(2)) < 1e-6);
});

// ─────────────── expectedUtility (MACLA Eq. 4) ─────────────

test('expectedUtility: reliable procedure (high α) outscores unreliable one at same similarity', () => {
  const reliable = expectedUtility({
    similarity: 0.8,
    counter: { alpha: 19, beta: 1 },
  });
  const unreliable = expectedUtility({
    similarity: 0.8,
    counter: { alpha: 1, beta: 19 },
  });
  assert.ok(reliable > unreliable);
});

test('expectedUtility: entropy bonus pulls uncertain procedure ahead of similar-but-tested-failed one', () => {
  // similar uncertain procedure (no evidence yet) should beat a
  // similar procedure that's been tried 20 times and always failed
  const uncertain = expectedUtility({
    similarity: 0.7,
    counter: initialBetaCounter(),
  });
  const knownBad = expectedUtility({
    similarity: 0.7,
    counter: { alpha: 1, beta: 20 },
  });
  assert.ok(uncertain > knownBad);
});

test('expectedUtility: lambda_info=0 disables exploration term', () => {
  const baseline = expectedUtility(
    { similarity: 0.5, counter: { alpha: 1, beta: 1 } },
    { lambdaInfo: 0 },
  );
  // reward 0.5 · 0.5 · 1 = 0.25; penalty 1 · 0.5 · 0.5 = 0.25; entropy term off
  assert.ok(Math.abs(baseline - 0) < 1e-9);
});

// ─────────────── salience + retention ─────────────

test('salienceForTier: tier ordering — procedural > semantic > episodic > observation', () => {
  const sp = salienceForTier('procedural', 0);
  const ss = salienceForTier('semantic', 0);
  const se = salienceForTier('episodic', 0);
  const so = salienceForTier('observation', 0);
  assert.ok(sp > ss && ss > se && se > so);
});

test('salienceForTier: access-count bonus caps at +0.2', () => {
  const noAccess = salienceForTier('observation', 0);
  const tonAccess = salienceForTier('observation', 1000);
  assert.ok(tonAccess - noAccess <= 0.2 + 1e-9);
});

test('retentionScore: zero-aged hot tier scores high; very-aged frozen', () => {
  const now = Date.now();
  const fresh = retentionScore({
    tier: 'procedural',
    createdAtMs: now,
    nowMs: now,
    accessCount: 0,
    recentAccessMs: [],
  });
  const ancient = retentionScore({
    tier: 'observation',
    createdAtMs: now - 365 * 24 * 60 * 60 * 1000,
    nowMs: now,
    accessCount: 0,
    recentAccessMs: [],
  });
  assert.ok(fresh > 0.7);
  assert.ok(ancient < 0.15);
});

test('retentionScore: recent-access reinforcement boosts an otherwise cold node', () => {
  const now = Date.now();
  const oneDay = 24 * 60 * 60 * 1000;
  const cold = retentionScore({
    tier: 'observation',
    createdAtMs: now - 200 * oneDay,
    nowMs: now,
    accessCount: 0,
    recentAccessMs: [],
  });
  const warmed = retentionScore({
    tier: 'observation',
    createdAtMs: now - 200 * oneDay,
    nowMs: now,
    accessCount: 5,
    recentAccessMs: [now - 1 * oneDay, now - 2 * oneDay],
  });
  assert.ok(warmed > cold);
});

test('retentionBand: thresholds map correctly', () => {
  assert.equal(retentionBand(0.9), 'hot');
  assert.equal(retentionBand(0.5), 'warm');
  assert.equal(retentionBand(0.2), 'cold');
  assert.equal(retentionBand(0.05), 'frozen');
});

// ─────────────── newTierMetadata ─────────────

test('newTierMetadata: empty sources → error', () => {
  const r = newTierMetadata('semantic', [], '2026-05-19T00:00:00Z');
  assert.ok(r.isErr());
});

test('newTierMetadata: procedural tier auto-gets Beta(1, 1)', () => {
  const r = newTierMetadata('procedural', ['obs-1'], '2026-05-19T00:00:00Z');
  assert.ok(r.isOk());
  const meta = r._unsafeUnwrap();
  assert.deepEqual(meta.beta, { alpha: 1, beta: 1 });
});

test('newTierMetadata: semantic tier omits beta', () => {
  const r = newTierMetadata('semantic', ['obs-1'], '2026-05-19T00:00:00Z');
  assert.ok(r.isOk());
  assert.equal(r._unsafeUnwrap().beta, undefined);
});

test('newTierMetadata: explicit beta override on procedural', () => {
  const r = newTierMetadata('procedural', ['o'], '2026-05-19T00:00:00Z', {
    beta: { alpha: 5, beta: 2 },
  });
  assert.deepEqual(r._unsafeUnwrap().beta, { alpha: 5, beta: 2 });
});
