/**
 * Unit tests — rerankMatches (cross-encoder rerank, Phase 21).
 *
 * Locks the pure-domain contract: input matches → output matches of
 * the same node_ids with `distance` rewritten by the cross-encoder
 * scorer, head reranked by score desc, tail untouched.
 *
 * Edge cases:
 *   - empty input passes through
 *   - matches without doc text pass through to the tail unchanged
 *   - scorer error → input matches returned unchanged (fail-open)
 *   - logit-shaped scores (outside [0,1]) are sigmoid-squashed
 *   - headSize cap is respected; tail keeps original ordering
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { okAsync, errAsync, ResultAsync } from 'neverthrow';
import { rerankMatches, type CrossEncoderScorer } from '../src/domain/cross-rerank.js';
import type { Match } from '../src/domain/vectors.js';
import { RerankError } from '../src/domain/errors.js';

// ─────────────── fixture scorers ─────────────

/**
 * Build a deterministic scorer that returns a pre-registered score
 * per doc-text. Missing texts get score 0.
 */
const fixtureScorer = (table: Record<string, number>): CrossEncoderScorer => ({
  score: (_q, docs) =>
    okAsync(docs.map((d) => table[d] ?? 0)) as ResultAsync<readonly number[], RerankError>,
});

const erroringScorer = (): CrossEncoderScorer => ({
  score: () => errAsync(RerankError.inference('boom')),
});

// ─────────────── helpers ─────────────

type Room = Match['room'];

const m = (id: string, distance: number, room: Room = 'r1' as Room): Match => ({
  node_id: id as Match['node_id'],
  room,
  distance,
});

// ─────────────── tests ─────────────

test('empty input → empty output, no scorer call', async () => {
  let called = false;
  const scorer: CrossEncoderScorer = {
    score: () => {
      called = true;
      return okAsync([]);
    },
  };
  const r = await rerankMatches('q', [], () => '', scorer);
  assert.ok(r.isOk());
  assert.deepEqual(r._unsafeUnwrap(), []);
  assert.equal(called, false);
});

test('higher score → lower distance → higher in output', async () => {
  const matches = [m('a', 0.5), m('b', 0.5), m('c', 0.5)];
  const scorer = fixtureScorer({ 'A': 0.9, 'B': 0.1, 'C': 0.5 });
  const docs: Record<string, string> = { a: 'A', b: 'B', c: 'C' };
  const r = await rerankMatches('q', matches, (mm) => docs[mm.node_id], scorer);
  assert.ok(r.isOk());
  const out = r._unsafeUnwrap();
  assert.deepEqual(out.map((x) => x.node_id), ['a', 'c', 'b']);
  // distance = 1 - prob
  assert.ok(Math.abs(out[0].distance - 0.1) < 1e-9);
  assert.ok(Math.abs(out[1].distance - 0.5) < 1e-9);
  assert.ok(Math.abs(out[2].distance - 0.9) < 1e-9);
});

test('logit-shaped scores get sigmoid-squashed', async () => {
  const matches = [m('a', 0.5), m('b', 0.5)];
  // raw scores: +5 (logit) ≈ sigmoid(5) ≈ 0.9933 → distance ≈ 0.0067
  //             −5 (logit) ≈ sigmoid(−5) ≈ 0.0067 → distance ≈ 0.9933
  const scorer = fixtureScorer({ 'A': 5, 'B': -5 });
  const docs: Record<string, string> = { a: 'A', b: 'B' };
  const r = await rerankMatches('q', matches, (mm) => docs[mm.node_id], scorer);
  assert.ok(r.isOk());
  const out = r._unsafeUnwrap();
  assert.equal(out[0].node_id, 'a');
  assert.ok(out[0].distance < 0.01);
  assert.ok(out[1].distance > 0.99);
});

test('scorer error → pass-through (fail-open)', async () => {
  const matches = [m('a', 0.1), m('b', 0.2)];
  const scorer = erroringScorer();
  const r = await rerankMatches('q', matches, () => 'doc', scorer);
  assert.ok(r.isOk(), 'rerank must never propagate scorer error to caller');
  assert.deepEqual(r._unsafeUnwrap().map((x) => x.node_id), ['a', 'b']);
  assert.deepEqual(r._unsafeUnwrap().map((x) => x.distance), [0.1, 0.2]);
});

test('matches without doc text → full pass-through', async () => {
  const matches = [m('a', 0.1), m('b', 0.2)];
  let called = false;
  const scorer: CrossEncoderScorer = {
    score: () => {
      called = true;
      return okAsync([]);
    },
  };
  const r = await rerankMatches('q', matches, () => undefined, scorer);
  assert.ok(r.isOk());
  assert.deepEqual(r._unsafeUnwrap(), matches);
  assert.equal(called, false, 'scorer must not be called when no doc text resolved');
});

test('headSize cap: tail untouched, head reranked', async () => {
  const matches = [
    m('a', 0.1), m('b', 0.2), m('c', 0.3),
    m('d', 0.4), m('e', 0.5),
  ];
  // Head = first 2 only; reverse them via score
  const scorer = fixtureScorer({ A: 0.1, B: 0.9 });
  const docs: Record<string, string> = { a: 'A', b: 'B', c: 'C', d: 'D', e: 'E' };
  const r = await rerankMatches('q', matches, (mm) => docs[mm.node_id], scorer, { headSize: 2 });
  assert.ok(r.isOk());
  const out = r._unsafeUnwrap();
  // Head was [a,b] with scores [0.1, 0.9] — b should now lead
  assert.equal(out[0].node_id, 'b');
  assert.equal(out[1].node_id, 'a');
  // Tail [c,d,e] passes through in original order
  assert.deepEqual(out.slice(2).map((x) => x.node_id), ['c', 'd', 'e']);
  assert.deepEqual(out.slice(2).map((x) => x.distance), [0.3, 0.4, 0.5]);
});

test('partial doc text: only matches with text get reranked, rest tail-fall through', async () => {
  const matches = [m('a', 0.1), m('b', 0.2), m('c', 0.3)];
  const scorer = fixtureScorer({ A: 0.9, C: 0.5 });
  // Only `a` and `c` have text; `b` falls into headWithoutText.
  const docs: Record<string, string | undefined> = { a: 'A', b: undefined, c: 'C' };
  const r = await rerankMatches('q', matches, (mm) => docs[mm.node_id], scorer);
  assert.ok(r.isOk());
  const out = r._unsafeUnwrap();
  // a (0.9) and c (0.5) get reranked; b passes through after them.
  assert.deepEqual(out.map((x) => x.node_id), ['a', 'c', 'b']);
});

test('non-finite score → distance clamps to 1 (orthogonal)', async () => {
  const matches = [m('a', 0.5)];
  const scorer: CrossEncoderScorer = {
    score: () => okAsync([NaN]),
  };
  const r = await rerankMatches('q', matches, () => 'doc', scorer);
  assert.ok(r.isOk());
  assert.equal(r._unsafeUnwrap()[0].distance, 1);
});
