/**
 * Unit tests — write-time gate (Phase 21B).
 *
 * Locks the pure filter's contract:
 *   - low-importance candidates dropped with `low_importance`
 *   - schema failures dropped with `schema_*`
 *   - contradiction against a strong semantic node dropped with
 *     `contradicts_strong_semantic`, populates contradictsId + score
 *   - weak existing semantics are ignored for contradiction
 *   - partitionByGate splits correctly + preserves audit trail
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  writeGateDecision,
  partitionByGate,
  tokenSet,
  jaccardSimilarity,
  type WriteGateCandidate,
  type ExistingSemantic,
} from '../src/domain/write-time-gate.js';

const goodCandidate = (overrides: Partial<WriteGateCandidate> = {}): WriteGateCandidate => ({
  id: 'obs-1',
  body: 'BGE-base-en-v1.5 outperforms MiniLM on BEIR SciFact by 6 NDCG points.',
  importance: 7,
  concepts: ['embedding', 'beir'],
  sourceUri: 'https://example.com/post',
  ...overrides,
});

// ─────────────── happy path ─────────────

test('clean candidate promotes', () => {
  const r = writeGateDecision(goodCandidate(), []);
  assert.ok(r.isOk());
  const d = r._unsafeUnwrap();
  assert.equal(d.action, 'promote');
  assert.equal(d.reason, undefined);
});

// ─────────────── importance ─────────────

test('importance below threshold → drop low_importance', () => {
  const r = writeGateDecision(goodCandidate({ importance: 1 }), []);
  assert.equal(r._unsafeUnwrap().reason, 'low_importance');
});

test('importance at boundary (= minImportance) is dropped (≤ not <)', () => {
  const r = writeGateDecision(goodCandidate({ importance: 2 }), []);
  assert.equal(r._unsafeUnwrap().reason, 'low_importance');
});

// ─────────────── schema ─────────────

test('no concepts → drop schema_no_concepts', () => {
  const r = writeGateDecision(goodCandidate({ concepts: [] }), []);
  assert.equal(r._unsafeUnwrap().reason, 'schema_no_concepts');
});

test('short body → drop schema_short_body', () => {
  const r = writeGateDecision(goodCandidate({ body: 'too short' }), []);
  assert.equal(r._unsafeUnwrap().reason, 'schema_short_body');
});

test('missing source URI → drop schema_no_source', () => {
  const r = writeGateDecision(goodCandidate({ sourceUri: undefined }), []);
  assert.equal(r._unsafeUnwrap().reason, 'schema_no_source');
});

// ─────────────── contradiction ─────────────

test('contradicts a strong existing semantic → drop with contradictsId + score', () => {
  const candidate = goodCandidate({
    body: 'BGE base outperforms MiniLM on BEIR SciFact by six points',
    importance: 8,
  });
  const existing: ExistingSemantic = {
    id: 'sem-old',
    tokens: tokenSet(candidate.body),
    strength: 0.9,
  };
  const r = writeGateDecision(candidate, [existing]);
  const d = r._unsafeUnwrap();
  assert.equal(d.action, 'drop');
  assert.equal(d.reason, 'contradicts_strong_semantic');
  assert.equal(d.contradictsId, 'sem-old');
  assert.ok((d.contradictionScore ?? 0) >= 0.9);
});

test('weak existing semantic ignored (strength below cutoff)', () => {
  const candidate = goodCandidate({
    body: 'MiniLM outperforms BGE on BEIR SciFact by six points',
    importance: 8,
  });
  const existing: ExistingSemantic = {
    id: 'sem-weak',
    tokens: tokenSet(candidate.body),
    strength: 0.3,
  };
  const r = writeGateDecision(candidate, [existing]);
  assert.equal(r._unsafeUnwrap().action, 'promote');
});

// ─────────────── partitionByGate ─────────────

test('partitionByGate: mixed batch splits into promoted + dropped with reasons', () => {
  const good = goodCandidate({ id: 'good-1' });
  const lowImp = goodCandidate({ id: 'bad-imp', importance: 1 });
  const noConcepts = goodCandidate({ id: 'bad-concepts', concepts: [] });
  const { promoted, dropped } = partitionByGate([good, lowImp, noConcepts], []);
  assert.deepEqual(promoted.map((c) => c.id), ['good-1']);
  assert.deepEqual(dropped.map((d) => d.candidateId), ['bad-imp', 'bad-concepts']);
  assert.deepEqual(dropped.map((d) => d.reason), ['low_importance', 'schema_no_concepts']);
});

// ─────────────── tokenSet + jaccard ─────────────

test('tokenSet: lowercases, drops <=2-char tokens, deduplicates', () => {
  const s = tokenSet('The quick BROWN fox jumps over an a quick dog');
  assert.ok(s.has('quick'));
  assert.ok(s.has('brown'));
  assert.ok(s.has('dog'));
  // Filter is `length > 2` — 1- and 2-char tokens are dropped
  assert.ok(!s.has('a'));
  assert.ok(!s.has('an'));
  // Dedup: "quick" appears twice in input, once in the set
  let quickCount = 0;
  for (const t of s) if (t === 'quick') quickCount++;
  assert.equal(quickCount, 1);
});

test('jaccardSimilarity: identical sets = 1, disjoint = 0, empty = 0', () => {
  const a = new Set(['one', 'two', 'three']);
  const b = new Set(['one', 'two', 'three']);
  const c = new Set(['four', 'five']);
  assert.equal(jaccardSimilarity(a, b), 1);
  assert.equal(jaccardSimilarity(a, c), 0);
  assert.equal(jaccardSimilarity(new Set(), a), 0);
});

test('jaccardSimilarity: |intersection| / |union|', () => {
  const a = new Set(['a', 'b', 'c']);
  const b = new Set(['b', 'c', 'd']);
  // intersect = {b,c} = 2; union = {a,b,c,d} = 4; jaccard = 0.5
  assert.equal(jaccardSimilarity(a, b), 0.5);
});
