import assert from 'node:assert/strict';
import { test } from 'node:test';

import { empty, upsertEdge, upsertNode, type Graph, type GraphEdge, type GraphNode } from '../src/domain/graph.js';
import { collectFetchSubgraph, projectFetchedNode } from '../src/infrastructure/fetch-sync.js';

const node = (id: string, isPrivate = false): GraphNode => ({
  id,
  label: id,
  file_type: 'document',
  source_file: `test:${id}`,
  source_uri: `https://example.com/${id}`,
  fetched_at: '2026-06-12T00:00:00Z',
  summary: `body for ${id}`,
  private: isPrivate,
});

const edge = (source: string, target: string): GraphEdge => ({
  source,
  target,
  relation: 'related',
  confidence: 'EXTRACTED',
  source_file: 'test',
});

const buildGraph = (): Graph => {
  let g = empty();
  for (const n of [node('hit'), node('neighbor-a'), node('neighbor-b'), node('private-neighbor', true)]) {
    const r = upsertNode(g, n);
    assert.ok(r.isOk());
    g = r.value;
  }
  for (const e of [edge('hit', 'neighbor-a'), edge('hit', 'neighbor-b'), edge('hit', 'private-neighbor')]) {
    const r = upsertEdge(g, e);
    assert.ok(r.isOk());
    g = r.value;
  }
  return g;
};

test('fetch subgraph transfer includes requested hit plus bounded 1-hop context', () => {
  const g = buildGraph();
  const sg = collectFetchSubgraph(g, {
    type: 'fetch',
    protocol_version: 5,
    node_ids: ['hit'],
    include_neighbors: true,
    max_nodes: 3,
  });

  assert.deepEqual(new Set(sg.nodeIds), new Set(['hit', 'neighbor-a', 'neighbor-b']));
  assert.equal(sg.edges.length, 2);
});

test('fetch subgraph transfer can be disabled for pointer-body compatibility', () => {
  const g = buildGraph();
  const sg = collectFetchSubgraph(g, {
    type: 'fetch',
    protocol_version: 5,
    node_ids: ['hit'],
    include_neighbors: false,
    max_nodes: 3,
  });

  assert.deepEqual(sg.nodeIds, ['hit']);
  assert.deepEqual(sg.edges, []);
});

test('fetch projection filters private nodes before they ride the wire', () => {
  const g = buildGraph();
  const publicWire = projectFetchedNode(g, 'neighbor-a', undefined, undefined, '2026-06-12T00:00:00Z');
  const privateWire = projectFetchedNode(g, 'private-neighbor', undefined, undefined, '2026-06-12T00:00:00Z');

  assert.equal(publicWire?.node_id, 'neighbor-a');
  assert.equal(privateWire, null);
});
