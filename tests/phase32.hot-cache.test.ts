/**
 * Phase 32 — hot cache regression tests.
 *
 * The summariser is pure, so tests are trivial: build a synthetic graph,
 * call buildSnapshot + render, assert the output structure.
 */

import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { empty, upsertNode } from '../src/domain/graph.js';
import type { Graph, GraphNode } from '../src/domain/graph.js';
import { buildSnapshot, render } from '../src/domain/hot-cache.js';

const mkNode = (overrides: Partial<GraphNode>): GraphNode => ({
  id: overrides.id ?? 'n',
  label: overrides.label ?? 'label',
  file_type: overrides.file_type ?? 'document',
  source_file: overrides.source_file ?? 'source',
  ...overrides,
}) as GraphNode;

const buildGraphWith = (nodes: readonly GraphNode[]): Graph => {
  let g: Graph = empty();
  for (const n of nodes) {
    const r = upsertNode(g, n);
    if (r.isOk()) g = r.value;
  }
  return g;
};

test('phase-32: empty graph produces a sane snapshot', () => {
  const snap = buildSnapshot(empty(), '2026-04-16T10:00:00.000Z');
  assert.strictEqual(snap.total_nodes, 0);
  assert.strictEqual(snap.total_rooms, 0);
  assert.strictEqual(snap.rooms_by_size.length, 0);
  assert.strictEqual(snap.recent_nodes.length, 0);
});

test('phase-32: groups nodes by room and sorts by size', () => {
  const nodes = [
    mkNode({ id: 'a', room: 'r1' }),
    mkNode({ id: 'b', room: 'r1' }),
    mkNode({ id: 'c', room: 'r1' }),
    mkNode({ id: 'd', room: 'r2' }),
  ];
  const snap = buildSnapshot(buildGraphWith(nodes));
  assert.strictEqual(snap.total_nodes, 4);
  assert.strictEqual(snap.total_rooms, 2);
  assert.strictEqual(snap.rooms_by_size[0].name, 'r1');
  assert.strictEqual(snap.rooms_by_size[0].node_count, 3);
  assert.strictEqual(snap.rooms_by_size[1].name, 'r2');
});

test('phase-32: recent_nodes sorted by fetched_at descending', () => {
  const nodes = [
    mkNode({ id: 'old', label: 'old', room: 'r', fetched_at: '2026-04-10T00:00:00.000Z' }),
    mkNode({ id: 'new', label: 'new', room: 'r', fetched_at: '2026-04-16T00:00:00.000Z' }),
    mkNode({ id: 'mid', label: 'mid', room: 'r', fetched_at: '2026-04-12T00:00:00.000Z' }),
  ];
  const snap = buildSnapshot(buildGraphWith(nodes));
  assert.strictEqual(snap.recent_nodes[0].id, 'new');
  assert.strictEqual(snap.recent_nodes[1].id, 'mid');
  assert.strictEqual(snap.recent_nodes[2].id, 'old');
});

test('phase-32: p2p_inbound_7d counts only peer-stamped + within-7-days nodes', () => {
  const now = '2026-04-16T00:00:00.000Z';
  const nodes = [
    mkNode({ id: 'p1', room: 'r', fetched_at: '2026-04-15T00:00:00.000Z', source_file: 'peer:12D3...' }),
    mkNode({ id: 'p2', room: 'r', fetched_at: '2026-04-15T00:00:00.000Z', source_file: 'p2p://abc' }),
    mkNode({ id: 'local', room: 'r', fetched_at: '2026-04-15T00:00:00.000Z', source_file: 'arxiv' }),
    mkNode({ id: 'old-peer', room: 'r', fetched_at: '2026-03-01T00:00:00.000Z', source_file: 'peer:x' }),
  ];
  const snap = buildSnapshot(buildGraphWith(nodes), now);
  assert.strictEqual(snap.p2p_inbound_7d, 2);
});

test('phase-32: render output contains all section headings + stays under budget', () => {
  const nodes = [
    mkNode({ id: 'a', room: 'alpha', label: 'one', fetched_at: '2026-04-16T00:00:00.000Z' }),
    mkNode({ id: 'b', room: 'beta',  label: 'two', fetched_at: '2026-04-15T00:00:00.000Z' }),
  ];
  const snap = buildSnapshot(buildGraphWith(nodes));
  const out = render(snap);
  assert.match(out, /# Recent Context/);
  assert.match(out, /## Graph at a Glance/);
  assert.match(out, /## Biggest Rooms/);
  assert.match(out, /## Newest Nodes/);
  const wordCount = out.split(/\s+/).length;
  assert.ok(wordCount <= 550, `render output ${wordCount} words exceeds soft budget`);
});

test('phase-32: render clamps on 10000-node synthetic graph', () => {
  const nodes: GraphNode[] = [];
  for (let i = 0; i < 10_000; i++) {
    nodes.push(mkNode({
      id: `n${i}`,
      room: `room${i % 20}`,
      label: `node ${i} with a moderately long title that describes something important`,
      fetched_at: `2026-04-${String((i % 15) + 1).padStart(2, '0')}T00:00:00.000Z`,
    }));
  }
  const snap = buildSnapshot(buildGraphWith(nodes));
  const out = render(snap);
  const wordCount = out.split(/\s+/).length;
  assert.ok(wordCount <= 550, `10k-node render spilled budget: ${wordCount} words`);
  // And produced the right aggregate counts
  assert.strictEqual(snap.total_nodes, 10_000);
});
