/**
 * Application use cases — thin orchestration between domain and infra.
 *
 * V5 (Phase 24): workspace-agnostic. The room-keyed search/explore use
 * cases were removed along with the room primitive; what remains is
 * `indexNode`, `searchGlobal`, and lightweight helpers consumed by the
 * CLI and daemon layers. The CLI applies workspace pre-filtering on
 * the result-set, not inside these use cases.
 */

import { Result, ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { AppError, GraphError, VectorError } from '../domain/errors.js';
import {
  type Graph,
  type GraphNode,
  type NodeId,
  type Subgraph,
  type TraversalOptions,
  type Wing,
  bfs,
  upsertNode as upsertNodePure,
} from '../domain/graph.js';
import { type Match } from '../domain/vectors.js';
import type { GraphRepository } from '../infrastructure/graph-repository.js';
import type { VectorIndex } from '../infrastructure/vector-index.js';
import type { Embedder } from '../infrastructure/embedders.js';

// ─────────────────────── commands ─────────────────────────

/**
 * A node about to be inserted, together with the text that will be
 * embedded.
 *
 * V5: no `room` field. `wing` remains for source-adapter sub-partitioning.
 */
export interface IndexNodeCommand {
  readonly node: GraphNode;
  readonly text: string;
  readonly wing?: Wing;
}

/** A global semantic search (V5: every search is global). */
export interface GlobalSearchQuery {
  readonly text: string;
  readonly k?: number;
}

// ─────────────────────── dependencies ─────────────────────

export interface UseCaseDeps {
  readonly graphs: GraphRepository;
  readonly vectors: VectorIndex;
  readonly embedder: Embedder;
}

// ─────────────────────── indexNode ────────────────────────

/**
 * Embed a node's text, upsert the vector into the vector index, and
 * upsert the node into the graph with `embedding_id` set to the node
 * id. The pair is atomic from the caller's perspective.
 */
export const indexNode =
  (deps: UseCaseDeps) =>
  (cmd: IndexNodeCommand): ResultAsync<Graph, AppError> =>
    deps.embedder
      .embed(cmd.text)
      .mapErr((e): AppError => e)
      .andThen((vec) =>
        deps.vectors
          .upsert({
            node_id: cmd.node.id,
            wing: cmd.wing,
            vector: vec,
            raw_text: cmd.text,
          })
          .mapErr((e): AppError => e)
          .map(() => vec),
      )
      .andThen(() =>
        deps.graphs.load().mapErr((e): AppError => e).andThen((graph) => {
          const enriched: GraphNode = {
            ...cmd.node,
            wing: cmd.wing,
            embedding_id: cmd.node.id,
          };
          return ResultAsync.fromPromise(
            Promise.resolve(upsertNodePure(graph, enriched)),
            (): AppError => ({ type: 'GraphWriteError', path: '<memory>', message: 'upsert failed' }),
          )
            .andThen((r: Result<Graph, GraphError>) =>
              r.isOk() ? okAsync<Graph, AppError>(r.value) : errAsync<Graph, AppError>(r.error),
            )
            .andThen((next) => deps.graphs.save(next).mapErr((e): AppError => e).map(() => next));
        }),
      );

// ─────────────────────── searchGlobal ─────────────────────

/**
 * Global semantic search — hybrid dense + BM25 + RRF.
 * V5: there is no room-scoped sibling; CLI applies workspace
 * pre-filter on the returned matches at the boundary.
 */
export const searchGlobal =
  (deps: UseCaseDeps) =>
  (query: GlobalSearchQuery): ResultAsync<readonly Match[], AppError> => {
    const k = query.k ?? 5;
    return deps.embedder
      .embed(query.text)
      .mapErr((e): AppError => e)
      .andThen((vec) => {
        const call =
          deps.vectors.binaryDim !== null
            ? deps.vectors.searchHybridBinary(query.text, vec, k)
            : deps.vectors.searchHybrid(query.text, vec, k);
        return call.mapErr((e: AppError): AppError => e);
      });
  };

// ─────────────────────── explore ──────────────────────────

/**
 * Graph traversal from a query seed. V5: no room scope — traverses
 * the global graph.
 */
export interface ExploreQuery {
  readonly text: string;
  readonly depth?: number;
  readonly k?: number;
}

export const explore =
  (deps: UseCaseDeps) =>
  (query: ExploreQuery): ResultAsync<Subgraph, AppError> => {
    const k = query.k ?? 3;
    const traversalOpts: TraversalOptions = { depth: query.depth ?? 3 };
    return searchGlobal(deps)({ text: query.text, k })
      .andThen((matches) => deps.graphs.load().mapErr((e): AppError => e).map((graph) => ({ matches, graph })))
      .map(({ matches, graph }) => bfs(graph, matches.map((m) => m.node_id), traversalOpts));
  };

// ─────────────────────── listAll ──────────────────────────

/** Convenience: every node in the graph. */
export const listAll =
  (deps: UseCaseDeps) =>
  (): ResultAsync<readonly GraphNode[], AppError> =>
    deps.graphs.load().mapErr((e): AppError => e).map((graph) => graph.json.nodes);

// ─────────────────────── re-exports ──────────────────────

export type { VectorError, GraphError };
export type { NodeId, Wing };
export { Result, ResultAsync };
