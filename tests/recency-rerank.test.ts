/**
 * Unit tests — recency-aware rerank.
 *
 * Locks the math + boundaries: relevance × exp(-age / half_life),
 * stability for tied scores, room-by-room policy switch, neutral
 * behaviour when room has no policy or age is missing.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  rerankByRecency,
  combinedScore,
  explainScore,
  halfLifeForRoom,
  type RankableMatch,
} from '../src/domain/recency-rerank.js';

const mk = (over: Partial<RankableMatch> & { node_id: string }): RankableMatch => ({
  distance: 0.4,
  room: 'sessions',
  age_days: 1,
  ...over,
});

// ─────────── policy lookup ──────────────

test('halfLifeForRoom returns the right windows', () => {
  assert.equal(halfLifeForRoom('sessions'), 30);
  assert.equal(halfLifeForRoom('research'), 14);
  assert.equal(halfLifeForRoom('toolshed'), 60);
  assert.equal(halfLifeForRoom('user-room'), undefined);
  assert.equal(halfLifeForRoom(undefined), undefined);
});

// ─────────── combinedScore ──────────────

test('combinedScore returns relevance only when room has no policy', () => {
  const m = mk({ node_id: 'a', room: 'user-room', distance: 0, age_days: 365 });
  assert.equal(combinedScore(m), 1.0);
});

test('combinedScore returns relevance only when age is unknown', () => {
  const m = mk({ node_id: 'a', distance: 0, age_days: undefined });
  assert.equal(combinedScore(m), 1.0);
});

test('combinedScore decays exponentially with age in policy rooms', () => {
  // sessions policy = 30d half-life. At exactly 30d, decay should be 0.5.
  const m = mk({ node_id: 'a', distance: 0, age_days: 30, room: 'sessions' });
  assert.ok(Math.abs(combinedScore(m) - 0.5) < 1e-9);
});

// ─────────── rerank ────────────────────

test('rerankByRecency lifts the recent hit above a slightly-better-distance stale one', () => {
  // Stale: perfect distance but 90 days old in sessions room
  const stale = mk({ node_id: 'stale', distance: 0.0, age_days: 90 });
  // Fresh: slightly worse distance, 1 day old
  const fresh = mk({ node_id: 'fresh', distance: 0.1, age_days: 1 });
  const out = rerankByRecency([stale, fresh]);
  assert.equal(out[0].node_id, 'fresh');
  assert.equal(out[1].node_id, 'stale');
});

test('rerankByRecency leaves order alone when relevance gap dominates decay', () => {
  // Relevance gap big enough that decay shouldn't flip them.
  // distance 0.0 vs 1.5 → relevance 1.0 vs 0.4. At 30d (half-life)
  // the fresh one needs decay × 1.0 < 1.0 × 0.5 = 0.5 to lose. The
  // 30d-old hit at distance 0 has combined = 0.5, the fresh at 1.5
  // has combined = 0.4 × 1.0 = 0.4. So stale-perfect wins.
  const a = mk({ node_id: 'precise-stale', distance: 0.0, age_days: 30 });
  const b = mk({ node_id: 'irrelevant-fresh', distance: 1.5, age_days: 1 });
  const out = rerankByRecency([a, b]);
  assert.equal(out[0].node_id, 'precise-stale');
});

test('rerankByRecency is stable for tied scores', () => {
  // Two matches with identical (room, distance, age) — order preserved.
  const a = mk({ node_id: 'a' });
  const b = mk({ node_id: 'b' });
  const c = mk({ node_id: 'c' });
  const out = rerankByRecency([a, b, c]);
  assert.deepEqual(out.map((m) => m.node_id), ['a', 'b', 'c']);
});

test('rerankByRecency does not penalise un-aged nodes in policy rooms', () => {
  // A match with age_days undefined gets relevance only — same as a
  // freshly-fetched one. Important: missing age shouldn't push old
  // (visibly stale) hits to the top by accident.
  const aged = mk({ node_id: 'aged', distance: 0.5, age_days: 60 });
  const naive = mk({ node_id: 'naive', distance: 0.5, age_days: undefined });
  const out = rerankByRecency([aged, naive]);
  // naive scores 1/1.5 ≈ 0.67; aged scores 0.67 × exp(-60/30) ≈ 0.09.
  assert.equal(out[0].node_id, 'naive');
});

test('rerankByRecency mixes policy and non-policy rooms coherently', () => {
  // Same relevance, one in sessions (30d half-life, 30d old) and one
  // in user-room (no policy). The policy room loses to decay, the
  // user-room one keeps full relevance.
  const sess = mk({ node_id: 'sess', room: 'sessions', distance: 0, age_days: 30 });
  const user = mk({ node_id: 'user', room: 'user-room', distance: 0, age_days: 365 });
  const out = rerankByRecency([sess, user]);
  assert.equal(out[0].node_id, 'user'); // relevance 1.0 vs 0.5
});

test('explainScore exposes the breakdown', () => {
  const m = mk({ node_id: 'x', distance: 0, age_days: 30 });
  const e = explainScore(m);
  assert.equal(e.node_id, 'x');
  assert.equal(e.relevance, 1);
  assert.ok(Math.abs(e.decay - 0.5) < 1e-9);
  assert.ok(Math.abs(e.combined - 0.5) < 1e-9);
});
