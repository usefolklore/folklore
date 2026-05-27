/**
 * Auto-forget tick — orchestrator for the long-term memory lifecycle
 * pass (Phase 22 of v4).
 *
 * Loads the graph, runs the pure `planAutoForget` planner, and
 * applies the plan: hard-delete TTL-expired tier nodes, set
 * `isLatest = false` on demoted ones. Local-only — never propagates
 * across the mesh (intentional design choice — peers retain content
 * independently; touch responses simply drop the demoted node from
 * the local view).
 *
 * One round-trip on the graph for the planning + mutation. Vector
 * index entries are cleaned up via `vectors.deleteByNodeId` when a
 * tier node is deleted; demote keeps the vector entry so retrieval
 * can still surface the historical version on `isLatest:false` filter
 * relaxation (e.g. audit replay).
 *
 * Pure surface: `runAutoForgetTick(deps, params) → ResultAsync<Report>`.
 * Tests inject the four ports with in-memory fakes.
 */

import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import type { GraphRepository } from '../infrastructure/graph-repository.js';
import type { VectorIndex } from '../infrastructure/vector-index.js';
import type { Graph, NodeId, GraphNode } from '../domain/graph.js';
import { removeNode, replaceNode } from '../domain/graph.js';
import {
  planAutoForget,
  type AutoForgetConfig,
  type AutoForgetPlan,
  type AutoForgetPlanItem,
} from '../domain/auto-forget.js';

// ─────────────── ports ─────────────

export interface AutoForgetDeps {
  readonly graphs: Pick<GraphRepository, 'load' | 'save'>;
  /** Vector index — deletes by node id when a tier node is purged. */
  readonly vectors: Pick<VectorIndex, 'deleteByNodeId'>;
  /** Clock — defaults to () => Date.now(). Injectable for tests. */
  readonly clock?: () => number;
}

export interface AutoForgetParams {
  /** When true, plan is computed but graph is not mutated. */
  readonly dryRun?: boolean;
  /** Override the default `AutoForgetConfig`. */
  readonly config?: AutoForgetConfig;
}

export interface AutoForgetReport {
  readonly plan: AutoForgetPlan;
  readonly applied: {
    readonly deleted: readonly NodeId[];
    readonly demoted: readonly NodeId[];
    readonly errors: readonly { readonly nodeId: NodeId; readonly message: string }[];
  };
  readonly dryRun: boolean;
}

// ─────────────── implementation ─────────────

const applyItem = (
  graph: Graph,
  item: AutoForgetPlanItem,
): { graph: Graph; deletedId?: NodeId; demotedId?: NodeId; error?: string } => {
  if (item.action === 'delete') {
    const r = removeNode(graph, item.nodeId);
    if (r.isErr()) return { graph, error: `delete failed: ${r.error.type}` };
    return { graph: r.value, deletedId: item.nodeId };
  }
  // demote
  const existing = graph.nodeById.get(item.nodeId);
  if (!existing) return { graph, error: 'node missing at demote time' };
  const next: GraphNode = { ...existing, isLatest: false } as GraphNode;
  const r = replaceNode(graph, next);
  if (r.isErr()) return { graph, error: `demote failed: ${r.error.type}` };
  return { graph: r.value, demotedId: item.nodeId };
};

export const runAutoForgetTick =
  (deps: AutoForgetDeps) =>
  (params: AutoForgetParams = {}): ResultAsync<AutoForgetReport, AppError> => {
    const clock = deps.clock ?? Date.now;
    const dryRun = params.dryRun ?? false;
    const cfg = params.config ?? {};

    return deps.graphs
      .load()
      .mapErr((e): AppError => e)
      .andThen((graph) => {
        const plan = planAutoForget(graph.json.nodes, clock(), cfg);

        if (dryRun || plan.items.length === 0) {
          return okAsync<AutoForgetReport, AppError>({
            plan,
            applied: { deleted: [], demoted: [], errors: [] },
            dryRun,
          });
        }

        let current: Graph = graph;
        const deleted: NodeId[] = [];
        const demoted: NodeId[] = [];
        const errors: { nodeId: NodeId; message: string }[] = [];

        for (const item of plan.items) {
          const r = applyItem(current, item);
          current = r.graph;
          if (r.error) {
            errors.push({ nodeId: item.nodeId, message: r.error });
            continue;
          }
          if (r.deletedId) deleted.push(r.deletedId);
          if (r.demotedId) demoted.push(r.demotedId);
        }

        return deps.graphs
          .save(current)
          .mapErr((e): AppError => e)
          .andThen(() => {
            // Vector cleanup for deletes — best-effort; we don't fail
            // the tick on vector delete errors (the graph delete is
            // the source of truth, vector orphans are harmless on
            // retrieval since they won't have a corresponding node).
            if (deleted.length === 0) {
              return okAsync<AutoForgetReport, AppError>({
                plan,
                applied: { deleted, demoted, errors },
                dryRun,
              });
            }
            const vectorOps = deleted.map((id) =>
              deps.vectors.deleteByNodeId(id).mapErr((): null => null),
            );
            return ResultAsync.combine(vectorOps)
              .map((): AutoForgetReport => ({
                plan,
                applied: { deleted, demoted, errors },
                dryRun,
              }))
              .orElse(() =>
                okAsync<AutoForgetReport, AppError>({
                  plan,
                  applied: { deleted, demoted, errors },
                  dryRun,
                }),
              );
          });
      });
  };

// re-export so callers can construct deps without reaching into infra
export type { AutoForgetConfig, AutoForgetPlan, AutoForgetPlanItem };
// silence unused import lint when errAsync isn't reached at runtime
void errAsync;
