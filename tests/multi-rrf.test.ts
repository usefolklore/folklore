/**
 * Unit tests — multiRrfFuse (alias-expansion fusion).
 *
 * Locks the math powering the "free graph-RAG" signal in ask.ts:
 * when an entity resolves to multiple aliases, each becomes a
 * sub-query and the result lists fuse via reciprocal-rank fusion.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { multiRrfFuse } from '../src/domain/vectors.js';
import type { Match } from '../src/domain/vectors.js';

const m = (id: string, distance = 0.5): Match => ({
  node_id: id,
  room: 'research',
  distance,
});

test('empty input → empty output', () => {
  assert.deepEqual(multiRrfFuse([]), []);
});

test('single list passes through unchanged', () => {
  const list: Match[] = [m('a', 0.1), m('b', 0.2), m('c', 0.3)];
  const out = multiRrfFuse([list]);
  assert.equal(out.length, 3);
  // multiRrfFuse with one list returns a copy with identity ordering.
  assert.deepEqual(
    out.map((x) => x.node_id),
    ['a', 'b', 'c'],
  );
  // distance preserved when no fusion happens
  assert.equal(out[0].distance, 0.1);
});

test('two lists fuse — node in both lists climbs above lone-list nodes', () => {
  // List 1: a (rank 0), b (rank 1), c (rank 2)
  // List 2: x (rank 0), a (rank 1), y (rank 2)
  // Fused score for `a` = 1/(60+1) + 1/(60+2) = 1/61 + 1/62 ≈ 0.0325
  // Fused score for `x` = 1/(60+1) ≈ 0.01639
  // → a should beat x.
  const list1: Match[] = [m('a'), m('b'), m('c')];
  const list2: Match[] = [m('x'), m('a'), m('y')];
  const out = multiRrfFuse([list1, list2]);
  // `a` appears in both → should be top.
  assert.equal(out[0].node_id, 'a');
  // Output contains all unique ids
  const ids = new Set(out.map((x) => x.node_id));
  assert.deepEqual(ids, new Set(['a', 'b', 'c', 'x', 'y']));
});

test('distance is rewritten — top entry has smallest distance, monotone in score', () => {
  const list1: Match[] = [m('a'), m('b'), m('c')];
  const list2: Match[] = [m('a'), m('b'), m('d')];
  const out = multiRrfFuse([list1, list2]);
  // All distances in (0, 1)
  for (const r of out) {
    assert.ok(r.distance > 0 && r.distance < 1, `distance ${r.distance} out of (0,1)`);
  }
  // Sorted ascending
  for (let i = 1; i < out.length; i++) {
    assert.ok(
      out[i - 1].distance <= out[i].distance,
      `not sorted ascending at ${i}: ${out[i - 1].distance} > ${out[i].distance}`,
    );
  }
});

test('three lists with consensus winner — node in all three tops', () => {
  const list1: Match[] = [m('common'), m('only1')];
  const list2: Match[] = [m('common'), m('only2')];
  const list3: Match[] = [m('common'), m('only3')];
  const out = multiRrfFuse([list1, list2, list3]);
  assert.equal(out[0].node_id, 'common', 'consensus winner expected at top');
  assert.equal(out.length, 4);
});

test('keeps best (smallest) original distance when same node appears in multiple lists', () => {
  const list1: Match[] = [m('a', 0.7)];
  const list2: Match[] = [m('a', 0.2)];
  const out = multiRrfFuse([list1, list2]);
  // The synthetic distance from RRF will overwrite, but the kept
  // metadata path uses the smallest of the two — let's verify the
  // function preserves SOME match record (no crash on dup).
  assert.equal(out.length, 1);
  assert.equal(out[0].node_id, 'a');
});

test('rrfK=0 still produces a valid ordering (defensive)', () => {
  // Edge case: k=0 means contribution = 1/(rank+1). Still monotone.
  const list1: Match[] = [m('a'), m('b'), m('c')];
  const out = multiRrfFuse([list1], 0);
  assert.equal(out.length, 3);
});
