/**
 * Unit tests — pprRerank (HippoRAG-2 retrieval rerank).
 *
 * Locks the wrapper's contract: input matches → output matches of
 * the same node_ids, with `distance` rewritten to a fused score and
 * sorted ascending. Edge cases: empty input, β=1 no-op, no edges,
 * all-zero personalisation.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromJson, type Graph, type GraphJson } from '../src/domain/graph.js';
import { pprRerank } from '../src/domain/graph-rerank.js';
import type { Match } from '../src/domain/vectors.js';

const buildGraph = (json: GraphJson): Graph => {
  const r = fromJson(json);
  if (r.isErr()) throw new Error(`graph build failed: ${JSON.stringify(r.error)}`);
  return r.value;
};

const REQUIRED_NODE_FIELDS = {
  file_type: 'rationale' as const,
  source_file: 'test.md',
};

test('empty input → empty output', () => {
  const g = buildGraph({ directed: false, multigraph: false, graph: {}, nodes: [], links: [] });
  const r = pprRerank(g, []);
  assert.ok(r.isOk());
  assert.deepEqual(r.isOk() ? r.value : null, []);
});

test('β=1 short-circuits to vector-only ordering (no PPR work)', () => {
  const g = buildGraph({
    directed: false,
    multigraph: false,
    graph: {},
    nodes: [
      { id: 'a', label: 'a', ...REQUIRED_NODE_FIELDS },
      { id: 'b', label: 'b', ...REQUIRED_NODE_FIELDS },
    ],
    links: [],
  });
  const matches: Match[] = [
    { node_id: 'a', distance: 0.4 },
    { node_id: 'b', distance: 0.2 },
  ];
  const r = pprRerank(g, matches, { beta: 1 });
  assert.ok(r.isOk());
  // β=1 returns matches as-is — order preserved, distances unchanged.
  if (r.isOk()) {
    assert.equal(r.value.length, 2);
    assert.equal(r.value[0].node_id, 'a');
    assert.equal(r.value[0].distance, 0.4);
  }
});

test('no edges in graph → input returned unchanged', () => {
  const g = buildGraph({
    directed: false,
    multigraph: false,
    graph: {},
    nodes: [
      { id: 'x', label: 'x', ...REQUIRED_NODE_FIELDS },
      { id: 'y', label: 'y', ...REQUIRED_NODE_FIELDS },
    ],
    links: [],
  });
  const matches: Match[] = [{ node_id: 'x', distance: 0.3 }];
  const r = pprRerank(g, matches);
  assert.ok(r.isOk());
  if (r.isOk()) assert.deepEqual(r.value, matches);
});

test('co-mention boosts a chunk via shared entity (HippoRAG-2 core)', () => {
  // Three chunks (c1, c2, c3) all mention entity e1.
  // c1 also has a unique mention of e2 — uniquely connected to e2.
  // Bi-encoder scores: c1 closer than c2, c3 the closest by a hair.
  // After PPR, c1 and c2 boost each other via e1; c3 should not pull
  // ahead since it has no graph corroboration with the others.
  const g = buildGraph({
    directed: false,
    multigraph: false,
    graph: {},
    nodes: [
      { id: 'c1', label: 'chunk1', ...REQUIRED_NODE_FIELDS },
      { id: 'c2', label: 'chunk2', ...REQUIRED_NODE_FIELDS },
      { id: 'c3', label: 'chunk3', ...REQUIRED_NODE_FIELDS },
      { id: 'e1', label: 'entity1', kind: 'entity', ...REQUIRED_NODE_FIELDS },
      { id: 'e2', label: 'entity2', kind: 'entity', ...REQUIRED_NODE_FIELDS },
    ],
    links: [
      { source: 'c1', target: 'e1', relation: 'mentions', confidence: 'EXTRACTED', source_file: 'test.md' },
      { source: 'c2', target: 'e1', relation: 'mentions', confidence: 'EXTRACTED', source_file: 'test.md' },
      { source: 'c3', target: 'e1', relation: 'mentions', confidence: 'EXTRACTED', source_file: 'test.md' },
      { source: 'c1', target: 'e2', relation: 'mentions', confidence: 'EXTRACTED', source_file: 'test.md' },
    ],
  });
  const matches: Match[] = [
    { node_id: 'c3', distance: 0.18 },
    { node_id: 'c1', distance: 0.20 },
    { node_id: 'c2', distance: 0.22 },
  ];
  const r = pprRerank(g, matches, { beta: 0.4 });
  assert.ok(r.isOk());
  if (r.isOk()) {
    assert.equal(r.value.length, 3, 'no candidates dropped');
    const ids = new Set(r.value.map((m) => m.node_id));
    assert.deepEqual(ids, new Set(['c1', 'c2', 'c3']));
    // Distances are rewritten to fused scores → all in [0, 1].
    for (const m of r.value) {
      assert.ok(m.distance >= 0 && m.distance <= 1, `distance ${m.distance} out of [0,1]`);
    }
    // Ranked ascending: r.value[0] is the strongest.
    for (let i = 1; i < r.value.length; i++) {
      assert.ok(
        r.value[i - 1].distance <= r.value[i].distance,
        `not sorted ascending at ${i}`,
      );
    }
  }
});

test('candidates with all distance ≥ 1 use uniform PPR seed (no degenerate run)', () => {
  // Every candidate is "semantically adjacent only" — distance > 1.
  // Without the uniform-seed fallback, personalisation sums to 0
  // and pagerank() rejects. With the fallback, all candidates get
  // weight 1 and the PPR walk still runs.
  const g = buildGraph({
    directed: false,
    multigraph: false,
    graph: {},
    nodes: [
      { id: 'a', label: 'a', ...REQUIRED_NODE_FIELDS },
      { id: 'b', label: 'b', ...REQUIRED_NODE_FIELDS },
      { id: 'e', label: 'e', kind: 'entity', ...REQUIRED_NODE_FIELDS },
    ],
    links: [
      { source: 'a', target: 'e', relation: 'mentions', confidence: 'EXTRACTED', source_file: 'test.md' },
      { source: 'b', target: 'e', relation: 'mentions', confidence: 'EXTRACTED', source_file: 'test.md' },
    ],
  });
  const matches: Match[] = [
    { node_id: 'a', distance: 1.6 },
    { node_id: 'b', distance: 1.7 },
  ];
  const r = pprRerank(g, matches);
  assert.ok(r.isOk(), 'must not error on all-far candidates');
  if (r.isOk()) {
    assert.equal(r.value.length, 2);
  }
});

test('output node_ids are exactly the input node_ids — no neighbour promotion', () => {
  // Even though e1, e2 collect PPR mass during the walk, they must
  // NOT surface in the output (would change result semantics — caller
  // asked for top-N CHUNKS, not entities).
  const g = buildGraph({
    directed: false,
    multigraph: false,
    graph: {},
    nodes: [
      { id: 'c1', label: 'c1', ...REQUIRED_NODE_FIELDS },
      { id: 'c2', label: 'c2', ...REQUIRED_NODE_FIELDS },
      { id: 'e1', label: 'e1', kind: 'entity', ...REQUIRED_NODE_FIELDS },
    ],
    links: [
      { source: 'c1', target: 'e1', relation: 'mentions', confidence: 'EXTRACTED', source_file: 'test.md' },
      { source: 'c2', target: 'e1', relation: 'mentions', confidence: 'EXTRACTED', source_file: 'test.md' },
    ],
  });
  const matches: Match[] = [
    { node_id: 'c1', distance: 0.3 },
    { node_id: 'c2', distance: 0.4 },
  ];
  const r = pprRerank(g, matches);
  assert.ok(r.isOk());
  if (r.isOk()) {
    const ids = r.value.map((m) => m.node_id).sort();
    assert.deepEqual(ids, ['c1', 'c2']);
  }
});
