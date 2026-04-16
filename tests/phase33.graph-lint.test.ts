/**
 * Phase 33 — graph-lint regression tests.
 *
 * Each rule is exercised with a focused fixture. The entry-point
 * lintGraph() is also tested for rule composition + room scoping.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { empty, upsertNode, upsertEdge } from '../src/domain/graph.js';
import type { Graph, GraphNode } from '../src/domain/graph.js';
import { lintGraph } from '../src/domain/graph-lint.js';
import { buildPatterns } from '../src/domain/sharing.js';

const mkNode = (o: Partial<GraphNode>): GraphNode => ({
  id: 'n',
  label: 'l',
  file_type: 'document',
  source_file: 's',
  ...o,
}) as GraphNode;

const graphWith = (nodes: readonly GraphNode[], edges: ReadonlyArray<{ s: string; t: string }> = []): Graph => {
  let g: Graph = empty();
  for (const n of nodes) {
    const r = upsertNode(g, n);
    if (r.isOk()) g = r.value;
  }
  for (const e of edges) {
    const r = upsertEdge(g, {
      source: e.s,
      target: e.t,
      relation: 'rel',
      confidence: 'EXTRACTED',
      source_file: 'test',
    });
    if (r.isOk()) g = r.value;
  }
  return g;
};

test('phase-33: orphan rule catches isolated nodes', () => {
  const g = graphWith([
    mkNode({ id: 'a', room: 'r' }),
    mkNode({ id: 'b', room: 'r' }),
    mkNode({ id: 'orphan', room: 'r' }),
  ], [{ s: 'a', t: 'b' }]);
  const r = lintGraph(g);
  const orphans = r.findings.filter((f) => f.category === 'orphan');
  assert.strictEqual(orphans.length, 1);
  assert.strictEqual(orphans[0].node_id, 'orphan');
});

test('phase-33: missing-room rule catches unassigned nodes', () => {
  const g = graphWith([mkNode({ id: 'noroom' })]);
  const r = lintGraph(g);
  assert.ok(r.findings.some((f) => f.category === 'missing-room' && f.node_id === 'noroom'));
});

test('phase-33: missing-fetched-at rule catches nodes with no timestamp', () => {
  const g = graphWith([mkNode({ id: 'nots', room: 'r' })]);
  const r = lintGraph(g);
  assert.ok(r.findings.some((f) => f.category === 'missing-fetched-at'));
});

test('phase-33: empty-label rule catches blank / whitespace labels', () => {
  const g = graphWith([mkNode({ id: 'blank', room: 'r', label: '   ' })]);
  const r = lintGraph(g);
  assert.ok(r.findings.some((f) => f.category === 'empty-label'));
});

test('phase-33: duplicate-uri rule flags overlapping source_uris', () => {
  const g = graphWith([
    mkNode({ id: 'a', room: 'r', source_uri: 'https://x/1' }),
    mkNode({ id: 'b', room: 'r', source_uri: 'https://x/1' }),
    mkNode({ id: 'c', room: 'r', source_uri: 'https://x/2' }),
  ]);
  const r = lintGraph(g);
  const dup = r.findings.filter((f) => f.category === 'duplicate-uri');
  assert.strictEqual(dup.length, 1);
  assert.match(dup[0].detail, /2 nodes share source_uri/);
});

test('phase-33: unshared-p2p rule flags peer-stamped node in non-shared room', () => {
  const g = graphWith([
    mkNode({ id: 'remote', room: 'private', source_file: 'peer:12D3...' }),
    mkNode({ id: 'local', room: 'private', source_file: 'arxiv' }),
  ]);
  const r = lintGraph(g, { shared_rooms: new Set(['published']) });
  const flags = r.findings.filter((f) => f.category === 'unshared-p2p');
  assert.strictEqual(flags.length, 1);
  assert.strictEqual(flags[0].node_id, 'remote');
});

test('phase-33: stale-secret-match rule catches drifted tokens', () => {
  const g = graphWith([
    mkNode({
      id: 'leaking',
      room: 'r',
      label: 'I found sk-abcdefghijklmnopqrstuvwxyz12345 in the logs',
    }),
    mkNode({ id: 'clean', room: 'r', label: 'just some research notes' }),
  ]);
  const r = lintGraph(g, { secret_patterns: buildPatterns() });
  const hits = r.findings.filter((f) => f.category === 'stale-secret-match');
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].node_id, 'leaking');
});

test('phase-33: room scoping excludes nodes outside the target room', () => {
  const g = graphWith([
    mkNode({ id: 'o1', room: 'r1' }),  // orphan in r1
    mkNode({ id: 'o2', room: 'r2' }),  // orphan in r2
  ]);
  const all = lintGraph(g);
  const r1Only = lintGraph(g, { room: 'r1' });
  assert.strictEqual(all.findings.filter((f) => f.category === 'orphan').length, 2);
  assert.strictEqual(r1Only.findings.filter((f) => f.category === 'orphan').length, 1);
  assert.strictEqual(r1Only.findings.filter((f) => f.category === 'orphan')[0].node_id, 'o1');
});

test('phase-33: clean graph produces zero findings', () => {
  const g = graphWith([
    mkNode({ id: 'a', room: 'r', label: 'alpha', fetched_at: '2026-04-16T00:00:00.000Z' }),
    mkNode({ id: 'b', room: 'r', label: 'beta',  fetched_at: '2026-04-16T00:00:00.000Z' }),
  ], [{ s: 'a', t: 'b' }]);
  const r = lintGraph(g, { shared_rooms: new Set(), secret_patterns: buildPatterns() });
  assert.strictEqual(r.findings.length, 0);
});

test('phase-33: by_category aggregates match findings count', () => {
  const g = graphWith([
    mkNode({ id: 'o1', room: 'r', fetched_at: '2026-04-16T00:00:00.000Z' }),
    mkNode({ id: 'o2', room: 'r', fetched_at: '2026-04-16T00:00:00.000Z' }),
  ]);
  const r = lintGraph(g);
  const total = [...r.by_category.values()].reduce((a, b) => a + b, 0);
  assert.strictEqual(total, r.findings.length);
});
