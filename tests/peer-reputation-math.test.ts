/**
 * Unit tests — peer-reputation math.
 *
 * Locks the contract on:
 *   - freshness / loadMultiplier shape
 *   - recordObservation: cumulative-mean correctness, reviewer
 *     bucket isolation, prior pull
 *   - deriveScore: Bayesian posterior on sparse vs dense data
 *   - peerRankAt: load-aware penalty
 *   - rankPeersForSubject: ordering + unknowns-last
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PRIOR_MEAN,
  PRIOR_WEIGHT,
  LOAD_HALF_AT,
  freshness,
  loadMultiplier,
  ageDaysBetween,
  recordObservation,
  deriveScore,
  peerRankAt,
  rankPeersForSubject,
  type PeerSubjectScore,
  type SubjectAggregate,
} from '../src/domain/peer-reputation.js';

const NOW = '2026-05-07T12:00:00.000Z';
const T_MINUS = (days: number): string =>
  new Date(Date.parse(NOW) - days * 86_400_000).toISOString();

// ─────────────── freshness ────────────────

test('freshness — half-life behavior', () => {
  assert.equal(freshness(0, 30), 1);
  assert.equal(freshness(30, 30), 0.5);
  assert.equal(freshness(60, 30), 0.25);
  assert.equal(freshness(90, 30), 0.125);
});

test('freshness — guards against bad input', () => {
  assert.equal(freshness(NaN, 30), 1);
  assert.equal(freshness(-5, 30), 1);
  assert.equal(freshness(10, 0), 1);
});

// ─────────────── loadMultiplier ───────────

test('loadMultiplier — sigmoid decay, half at LOAD_HALF_AT', () => {
  assert.equal(loadMultiplier(0), 1);
  assert.equal(loadMultiplier(LOAD_HALF_AT), 0.5);
  // 9 = 3 × LOAD_HALF_AT → ~0.25
  const v = loadMultiplier(LOAD_HALF_AT * 3);
  assert.ok(Math.abs(v - 0.25) < 1e-9, `got ${v}`);
});

test('loadMultiplier — guards', () => {
  assert.equal(loadMultiplier(-1), 1);
  assert.equal(loadMultiplier(NaN), 1);
});

// ─────────────── ageDaysBetween ──────────

test('ageDaysBetween — positive day delta', () => {
  assert.equal(ageDaysBetween(T_MINUS(5), NOW), 5);
});

test('ageDaysBetween — clamps negatives to 0', () => {
  assert.equal(ageDaysBetween(T_MINUS(-3), NOW), 0);
});

test('ageDaysBetween — handles bad input gracefully', () => {
  assert.equal(ageDaysBetween('not-a-date', NOW), 0);
});

// ─────────────── deriveScore ──────────────

test('deriveScore — empty evidence pulls toward 0.5 prior with low confidence', () => {
  const r = deriveScore(0, 0, 0, 0);
  assert.equal(r.posterior_mean, PRIOR_MEAN);
  assert.equal(r.confidence, 0);
  assert.equal(r.rank_score, 0);
});

test('deriveScore — single perfect review still pulled toward prior', () => {
  // weighted_sum=1.0, count=1.0 → (3*0.5 + 1.0) / (3+1) = 0.625
  const r = deriveScore(1.0, 1.0, 0, 0);
  assert.ok(Math.abs(r.posterior_mean - 0.625) < 1e-9, `got ${r.posterior_mean}`);
  // confidence = 1 / (1+3) = 0.25
  assert.ok(Math.abs(r.confidence - 0.25) < 1e-9);
});

test('deriveScore — many reviews dominate the prior', () => {
  // 50 perfect reviews
  const r = deriveScore(50, 50, 0, 0);
  assert.ok(r.posterior_mean > 0.97);
  assert.ok(r.confidence > 0.94);
});

test('deriveScore — load decreases rank_score, not posterior_mean', () => {
  const noLoad = deriveScore(50, 50, 0, 0);
  const heavyLoad = deriveScore(50, 50, 0, 12);
  assert.equal(noLoad.posterior_mean, heavyLoad.posterior_mean);
  assert.equal(noLoad.confidence, heavyLoad.confidence);
  assert.ok(heavyLoad.rank_score < noLoad.rank_score);
});

test('deriveScore — staleness decreases rank_score, not posterior_mean', () => {
  const fresh = deriveScore(50, 50, 0, 0);
  const stale = deriveScore(50, 50, 90, 0);   // 2× half-life → ~0.25 freshness
  assert.equal(fresh.posterior_mean, stale.posterior_mean);
  assert.ok(stale.rank_score < fresh.rank_score / 3);
});

// ─────────────── recordObservation ────────

test('recordObservation — first observation creates a fresh bucket', () => {
  const next = recordObservation(undefined, {
    target_peer_id: '12D3KooWPeerA',
    subject_key: 'entity:product:lemlist',
    subject_label: 'lemlist',
    subject_kind: 'entity',
    reviewer_did: 'did:key:zLocal',
    satisfaction_score: 0.92,
    now: NOW,
  });
  assert.equal(next.raw_review_count, 1);
  assert.ok(Math.abs(next.weighted_review_count - 1.0) < 1e-9);
  assert.ok(Math.abs(next.weighted_sum - 0.92) < 1e-9);
  assert.equal(next.first_review_at, NOW);
  assert.equal(next.last_review_at, NOW);
  assert.equal(next.last_answer_at, NOW);
  assert.ok(next.reviewers['did:key:zLocal']);
});

test('recordObservation — second observation accumulates (same instant, no decay)', () => {
  // Both observations at the same NOW so lazy decay is a no-op —
  // pure accumulation test. The decay path is covered separately in
  // peer-reputation-review-fixes.test.ts.
  const a = recordObservation(undefined, {
    target_peer_id: 'p',
    subject_key: 'k',
    subject_label: 'l',
    subject_kind: 'entity',
    reviewer_did: 'did:key:zLocal',
    satisfaction_score: 0.9,
    now: NOW,
  });
  const b = recordObservation(a, {
    target_peer_id: 'p',
    subject_key: 'k',
    subject_label: 'l',
    subject_kind: 'entity',
    reviewer_did: 'did:key:zLocal',
    satisfaction_score: 0.7,
    now: NOW,
  });
  assert.equal(b.raw_review_count, 2);
  assert.ok(Math.abs(b.weighted_sum - (0.9 + 0.7)) < 1e-9);
  assert.equal(b.first_review_at, NOW);   // preserved
  assert.equal(b.last_review_at, NOW);    // bumped
});

test('recordObservation — relay weight halves the contribution', () => {
  const full = recordObservation(undefined, {
    target_peer_id: 'p',
    subject_key: 'k',
    subject_label: 'l',
    subject_kind: 'entity',
    reviewer_did: 'did:key:zLocal',
    satisfaction_score: 0.8,
    review_weight: 1.0,
    now: NOW,
  });
  const relay = recordObservation(undefined, {
    target_peer_id: 'p',
    subject_key: 'k',
    subject_label: 'l',
    subject_kind: 'entity',
    reviewer_did: 'did:key:zLocal',
    satisfaction_score: 0.8,
    review_weight: 0.4,
    now: NOW,
  });
  assert.ok(Math.abs(relay.weighted_review_count - 0.4) < 1e-9);
  assert.ok(relay.weighted_sum < full.weighted_sum);
  assert.ok(relay.confidence < full.confidence);
});

test('recordObservation — clamps satisfaction to [0, 1]', () => {
  const high = recordObservation(undefined, {
    target_peer_id: 'p', subject_key: 'k', subject_label: 'l', subject_kind: 'entity',
    reviewer_did: 'did:key:z', satisfaction_score: 1.5, now: NOW,
  });
  assert.ok(high.posterior_mean <= 1);
  const low = recordObservation(undefined, {
    target_peer_id: 'p', subject_key: 'k', subject_label: 'l', subject_kind: 'entity',
    reviewer_did: 'did:key:z', satisfaction_score: -0.3, now: NOW,
  });
  assert.ok(low.posterior_mean >= 0);
});

test('recordObservation — separate reviewer buckets', () => {
  const a = recordObservation(undefined, {
    target_peer_id: 'p', subject_key: 'k', subject_label: 'l', subject_kind: 'entity',
    reviewer_did: 'did:key:reviewer-A', satisfaction_score: 0.9, now: NOW,
  });
  const b = recordObservation(a, {
    target_peer_id: 'p', subject_key: 'k', subject_label: 'l', subject_kind: 'entity',
    reviewer_did: 'did:key:reviewer-B', satisfaction_score: 0.6, now: NOW,
  });
  assert.equal(Object.keys(b.reviewers).length, 2);
  assert.ok(b.reviewers['did:key:reviewer-A']);
  assert.ok(b.reviewers['did:key:reviewer-B']);
});

// ─────────────── peerRankAt ──────────────

test('peerRankAt — recent staleness decays rank but not posterior', () => {
  const fresh: PeerSubjectScore = {
    posterior_mean: 0.9,
    confidence: 0.5,
    rank_score: 0.45,
    weighted_review_count: 5,
    raw_review_count: 5,
    weighted_sum: 4.5,
    weighted_sum_squares: 4.05,
    first_review_at: T_MINUS(60),
    last_review_at: NOW,
    last_answer_at: NOW,
    stale_after_days: 30,
    decay_half_life_days: 30,
    reviewers: {},
  };
  const stale: PeerSubjectScore = { ...fresh, last_answer_at: T_MINUS(60) };
  const r1 = peerRankAt(fresh, NOW, 0);
  const r2 = peerRankAt(stale, NOW, 0);
  assert.ok(r2 < r1, `stale rank ${r2} should be < fresh rank ${r1}`);
});

// ─────────────── rankPeersForSubject ──────

test('rankPeersForSubject — known peers ordered by rank, unknowns last', () => {
  const score = (sum: number, count: number, last_answer_at: string): PeerSubjectScore => ({
    posterior_mean: 0,
    confidence: 0,
    rank_score: 0,
    weighted_sum: sum,
    weighted_sum_squares: 0,
    weighted_review_count: count,
    raw_review_count: count,
    first_review_at: last_answer_at,
    last_review_at: last_answer_at,
    last_answer_at,
    stale_after_days: 30,
    decay_half_life_days: 30,
    reviewers: {},
  });
  const agg: SubjectAggregate = {
    key: 'entity:product:lemlist',
    label: 'lemlist',
    kind: 'entity',
    peer_scores: {
      'peerA': score(8, 10, NOW),  // high evidence, recent
      'peerB': score(3, 5, NOW),   // moderate, recent
      'peerC': score(8, 10, T_MINUS(180)),   // high evidence, very stale
    },
  };
  const ranked = rankPeersForSubject(agg, ['peerA', 'peerB', 'peerC', 'unknownX'], NOW, new Map());
  assert.equal(ranked[0].peer_id, 'peerA');
  // unknownX must come last (rank=null)
  assert.equal(ranked[ranked.length - 1].peer_id, 'unknownX');
  assert.equal(ranked[ranked.length - 1].rank, null);
});

test('rankPeersForSubject — load demotes a heavily-asked peer', () => {
  const high: PeerSubjectScore = {
    posterior_mean: 0,
    confidence: 0,
    rank_score: 0,
    weighted_sum: 8,
    weighted_sum_squares: 0,
    weighted_review_count: 10,
    raw_review_count: 10,
    first_review_at: NOW,
    last_review_at: NOW,
    last_answer_at: NOW,
    stale_after_days: 30,
    decay_half_life_days: 30,
    reviewers: {},
  };
  const agg: SubjectAggregate = {
    key: 'k', label: 'l', kind: 'entity',
    peer_scores: { 'peerA': high, 'peerB': high },
  };
  const load = new Map<string, number>([['peerA', 12]]);
  const ranked = rankPeersForSubject(agg, ['peerA', 'peerB'], NOW, load);
  assert.equal(ranked[0].peer_id, 'peerB', 'peerB should rank first because peerA is overloaded');
});

// silence unused
void PRIOR_WEIGHT;
