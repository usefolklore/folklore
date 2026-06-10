/**
 * Unit tests — auto-forget planner + orchestrator (Phase 22).
 *
 * Planner: pure-domain tests with synthetic GraphNode fixtures.
 * Orchestrator: injected fake GraphRepository + VectorIndex ports.
 *
 * Locks:
 *   - observation tier is ignored
 *   - TTL-expired tier node → delete
 *   - frozen retention + age past demoteMinAgeDays → demote
 *   - contradiction pair → demote the older one
 *   - dryRun never mutates the graph
 *   - applied report matches plan
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { okAsync, ResultAsync } from 'neverthrow';
import {
  planAutoForget,
} from '../src/domain/auto-forget.js';
import { runAutoForgetTick } from '../src/application/auto-forget-tick.js';
import { empty as emptyGraph, fromJson, type GraphJson } from '../src/domain/graph.js';
import type { GraphNode, Graph } from '../src/domain/graph.js';
import type { AppError } from '../src/domain/errors.js';
import type { VectorError } from '../src/domain/errors.js';

// ─────────────── fixture helpers ─────────────

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-05-19T00:00:00Z');

const node = (overrides: Partial<GraphNode> & { id: string }): GraphNode =>
  ({
    id: overrides.id,
    label: overrides.label ?? overrides.id,
    file_type: 'document',
    source_file: 'fixture',
    source_uri: overrides.source_uri ?? overrides.id,
    ...overrides,
  }) as GraphNode;

const ago = (days: number): string =>
  new Date(NOW - days * DAY).toISOString();

const buildGraphFrom = (nodes: readonly GraphNode[]): Graph => {
  const json: GraphJson = {
    directed: false,
    multigraph: false,
    graph: {},
    nodes,
    links: [],
  };
  const r = fromJson(json);
  if (r.isErr()) throw new Error(JSON.stringify(r.error));
  return r.value;
};

// ─────────────── planner ─────────────

test('planAutoForget: observation tier is ignored', () => {
  const nodes = [
    node({ id: 'file:///foo.md', fetched_at: ago(365) }),
    node({ id: 'https://example.com/old', fetched_at: ago(500) }),
  ];
  const plan = planAutoForget(nodes, NOW);
  assert.equal(plan.stats.tieredNodes, 0);
  assert.equal(plan.items.length, 0);
});

test('planAutoForget: tier node with expired forgetAfter → delete', () => {
  const nodes = [
    node({
      id: 'synthesis://old',
      fetched_at: ago(10),
      consolidated_at: ago(10),
      forgetAfter: ago(1),  // yesterday
    } as GraphNode & { forgetAfter: string }),
  ];
  const plan = planAutoForget(nodes, NOW);
  assert.equal(plan.stats.deletes, 1);
  assert.equal(plan.items[0]?.action, 'delete');
});

test('planAutoForget: frozen retention + age ≥ demoteMinAgeDays → demote', () => {
  const nodes = [
    node({
      id: 'synthesis://ancient',
      label: 'ancient',
      fetched_at: ago(400),
      consolidated_at: ago(400),
    }),
  ];
  const plan = planAutoForget(nodes, NOW);
  assert.equal(plan.stats.demotes, 1);
  const item = plan.items[0];
  assert.equal(item?.action, 'demote');
  assert.equal((item as { reason: string }).reason, 'retention_frozen');
});

test('planAutoForget: fresh tier node is left alone', () => {
  const nodes = [
    node({
      id: 'synthesis://fresh',
      fetched_at: ago(2),
      consolidated_at: ago(2),
    }),
  ];
  const plan = planAutoForget(nodes, NOW);
  assert.equal(plan.items.length, 0);
  assert.equal(plan.stats.tieredNodes, 1);
});

test('planAutoForget: contradiction pair with shared concept + disjoint disagreement → demote older', () => {
  // Two semantic nodes with near-identical summaries (Jaccard >= 0.9)
  // but disagreeing concept tags. Older should be demoted.
  const sharedBody =
    'BGE-base outperforms MiniLM on BEIR SciFact retrieval benchmark with measured ndcg lift';
  const nodes = [
    node({
      id: 'synthesis://old',
      summary: sharedBody,
      concepts: ['retrieval', 'bge', 'old-claim'],
      consolidated_at: ago(20),
      fetched_at: ago(20),
    }),
    node({
      id: 'synthesis://new',
      summary: sharedBody + ' updated',
      concepts: ['retrieval', 'bge', 'new-claim'],
      consolidated_at: ago(2),
      fetched_at: ago(2),
    }),
  ];
  const plan = planAutoForget(nodes, NOW, { demoteMinAgeDays: 999 });
  assert.equal(plan.stats.contradictions, 1);
  assert.equal(plan.items[0]?.action, 'demote');
  assert.equal(plan.items[0]?.nodeId, 'synthesis://old');
  const it = plan.items[0] as { contradictsId?: string; reason: string };
  assert.equal(it.contradictsId, 'synthesis://new');
  assert.equal(it.reason, 'contradiction');
});

test('planAutoForget: skipContradictions disables the O(N²) pass', () => {
  const nodes = [
    node({
      id: 'synthesis://a',
      summary: 'same body',
      concepts: ['x', 'a'],
      fetched_at: ago(20),
      consolidated_at: ago(20),
    }),
    node({
      id: 'synthesis://b',
      summary: 'same body',
      concepts: ['x', 'b'],
      fetched_at: ago(2),
      consolidated_at: ago(2),
    }),
  ];
  const plan = planAutoForget(nodes, NOW, {
    skipContradictions: true,
    demoteMinAgeDays: 999,
  });
  assert.equal(plan.stats.contradictions, 0);
});

// ─────────────── orchestrator ─────────────

interface FakeRepo {
  readonly graphs: {
    load: () => ResultAsync<Graph, AppError>;
    save: (g: Graph) => ResultAsync<void, AppError>;
  };
  readonly vectors: {
    deleteByNodeId: (id: string) => ResultAsync<void, VectorError>;
  };
  saves: Graph[];
  vectorDeletes: string[];
}

const makeFakes = (graph: Graph): FakeRepo => {
  const saves: Graph[] = [];
  const vectorDeletes: string[] = [];
  return {
    graphs: {
      load: () => okAsync(graph),
      save: (g) => {
        saves.push(g);
        return okAsync(undefined);
      },
    },
    vectors: {
      deleteByNodeId: (id) => {
        vectorDeletes.push(id);
        return okAsync(undefined);
      },
    },
    saves,
    vectorDeletes,
  };
};

test('runAutoForgetTick: dryRun never saves', async () => {
  const graph = buildGraphFrom([
    node({
      id: 'synthesis://x',
      fetched_at: ago(400),
      consolidated_at: ago(400),
    }),
  ]);
  const fakes = makeFakes(graph);
  const r = await runAutoForgetTick({
    graphs: fakes.graphs,
    vectors: fakes.vectors,
    clock: () => NOW,
  })({ dryRun: true });
  assert.ok(r.isOk());
  const report = r._unsafeUnwrap();
  assert.equal(report.dryRun, true);
  assert.equal(report.plan.stats.demotes, 1);
  assert.equal(fakes.saves.length, 0);
  assert.equal(report.applied.demoted.length, 0);
});

test('runAutoForgetTick: applies deletes + demotes; saves once; vector delete called for deletes', async () => {
  const graph = buildGraphFrom([
    node({
      id: 'synthesis://ttl',
      fetched_at: ago(5),
      consolidated_at: ago(5),
      forgetAfter: ago(1),
    } as GraphNode & { forgetAfter: string }),
    node({
      id: 'synthesis://frozen',
      fetched_at: ago(400),
      consolidated_at: ago(400),
    }),
    node({
      id: 'file:///observation.md',
      fetched_at: ago(2),
    }),
  ]);
  const fakes = makeFakes(graph);
  const r = await runAutoForgetTick({
    graphs: fakes.graphs,
    vectors: fakes.vectors,
    clock: () => NOW,
  })({});
  assert.ok(r.isOk());
  const report = r._unsafeUnwrap();
  assert.deepEqual(report.applied.deleted, ['synthesis://ttl']);
  assert.deepEqual(report.applied.demoted, ['synthesis://frozen']);
  assert.equal(fakes.saves.length, 1);
  assert.deepEqual(fakes.vectorDeletes, ['synthesis://ttl']);
  // Verify the saved graph: ttl removed, frozen now isLatest:false
  const saved = fakes.saves[0];
  assert.equal(saved.nodeById.has('synthesis://ttl'), false);
  const frozen = saved.nodeById.get('synthesis://frozen') as
    | (GraphNode & { isLatest?: boolean })
    | undefined;
  assert.equal(frozen?.isLatest, false);
});

test('runAutoForgetTick: empty graph → no-op, no save', async () => {
  const graph = emptyGraph();
  const fakes = makeFakes(graph);
  const r = await runAutoForgetTick({
    graphs: fakes.graphs,
    vectors: fakes.vectors,
    clock: () => NOW,
  })({});
  assert.ok(r.isOk());
  assert.equal(fakes.saves.length, 0);
});
