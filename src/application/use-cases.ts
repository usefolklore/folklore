/**
 * Application use cases — thin orchestration between domain and infra.
 *
 * Each use case is a pure function (no classes, no hidden state) that
 * takes the ports it needs as parameters and returns a `ResultAsync`.
 * This makes them trivial to test with fakes and keeps the domain
 * utterly I/O-free.
 *
 * The use cases here are the minimum needed for Phase 1's acceptance
 * test. Later phases will add: indexDocument (fetch+chunk+embed+upsert),
 * answerQuestion (embed+search+assemble context), detectDrift, etc.
 */

import { Result, ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { AppError, GraphError, VectorError } from '../domain/errors.js';
import {
  type Graph,
  type GraphNode,
  type NodeId,
  type Room,
  type Subgraph,
  type TraversalOptions,
  type Wing,
  bfs,
  nodesInRoom,
  upsertNode as upsertNodePure,
} from '../domain/graph.js';
import {
  type Match,
  type Tunnel,
  type VectorRecord,
  findTunnels as findTunnelsPure,
} from '../domain/vectors.js';
import type { GraphRepository } from '../infrastructure/graph-repository.js';
import type { VectorIndex } from '../infrastructure/vector-index.js';
import type { Embedder } from '../infrastructure/embedders.js';

// ─────────────────────── commands ─────────────────────────

/** A node about to be inserted, together with the text that will be embedded. */
export interface IndexNodeCommand {
  readonly node: GraphNode;
  readonly text: string;
  readonly room: Room;
  readonly wing?: Wing;
}

/** A room-scoped semantic search. */
export interface RoomSearchQuery {
  readonly room: Room;
  readonly text: string;
  readonly k?: number;
}

/** A global semantic search (no room filter). */
export interface GlobalSearchQuery {
  readonly text: string;
  readonly k?: number;
}

/** Parameters for the tunnel-detection pass. */
export interface TunnelDetectionQuery {
  readonly threshold: number;
  readonly restrictToRoom?: Room;
}

// ─────────────────────── dependencies ─────────────────────

/**
 * All ports a use case might need. We pass this as a single object so
 * adding a new port (e.g. a clock, a logger) doesn't force every use
 * case signature to change.
 */
export interface UseCaseDeps {
  readonly graphs: GraphRepository;
  readonly vectors: VectorIndex;
  readonly embedder: Embedder;
}

// ─────────────────────── indexNode ────────────────────────

/**
 * Embed a node's text, upsert the vector into the vector index, and
 * upsert the node into the graph with `embedding_id` set to the node
 * id. The operation is an atomic pair from the caller's perspective
 * (both writes succeed or the error is surfaced).
 *
 * Side effects are ordered so the vector is written first. If the
 * subsequent graph write fails, the vector store has a stale row
 * that a later graph write will overwrite — harmless.
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
            room: cmd.room,
            wing: cmd.wing,
            vector: vec,
            // Pass the pre-prefix raw text so the FTS5 BM25 index can
            // participate in hybrid retrieval. Phase 23 pipeline unification:
            // production now writes to both vec0 AND fts_docs on every upsert.
            raw_text: cmd.text,
          })
          .mapErr((e): AppError => e)
          .map(() => vec),
      )
      .andThen(() =>
        deps.graphs.load().mapErr((e): AppError => e).andThen((graph) => {
          const enriched: GraphNode = {
            ...cmd.node,
            room: cmd.room,
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

// ─────────────────────── searchByRoom ─────────────────────

/**
 * Room-scoped semantic search. Returns the top-k matches restricted
 * to the given room, fused via RRF over dense + BM25 (Phase 23
 * pipeline unification: production now uses hybrid by default).
 *
 * For nodes that were upserted before Phase 23 (and thus have no FTS5
 * row), the BM25 stage returns an empty list and RRF degrades gracefully
 * to dense-only. Once the graph is re-indexed the hybrid benefit kicks in.
 */
export const searchByRoom =
  (deps: UseCaseDeps) =>
  (query: RoomSearchQuery): ResultAsync<readonly Match[], AppError> => {
    const k = query.k ?? 5;
    return deps.embedder
      .embed(query.text)
      .mapErr((e): AppError => e)
      .andThen((vec) => {
        // Phase 3c — when the VectorIndex was opened with binaryDim,
        // route through the Hamming-ranked binary path. Otherwise fall
        // back to the fp32 searchByRoomHybrid. Zero-behavioral-change
        // when binary mode is off.
        const call =
          deps.vectors.binaryDim !== null
            ? deps.vectors.searchByRoomHybridBinary(query.room, query.text, vec, k)
            : deps.vectors.searchByRoomHybrid(query.room, query.text, vec, k);
        return call.mapErr((e): AppError => e);
      });
  };

// ─────────────────────── searchGlobal ─────────────────────

/**
 * Global semantic search — no room filter. Hybrid dense + BM25 + RRF
 * (Phase 23 pipeline unification).
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
        return call.mapErr((e): AppError => e);
      });
  };

// ─────────────────────── findTunnels ──────────────────────

/**
 * Offline pass: surface pairs of nodes in different rooms with L2
 * distance below `threshold`. Pulls the full snapshot from the vector
 * index and delegates the math to the pure domain function.
 */
export const findTunnels =
  (deps: UseCaseDeps) =>
  (query: TunnelDetectionQuery): ResultAsync<readonly Tunnel[], AppError> =>
    deps.vectors
      .all()
      .mapErr((e): AppError => e)
      .map((records: readonly VectorRecord[]) =>
        findTunnelsPure(records, query.threshold, query.restrictToRoom),
      );

// ─────────────────────── exploreRoom ──────────────────────

/**
 * Graph traversal inside a single room. Seeds from the most-similar
 * node for the given text and BFSes outward using the room filter on
 * the pure domain traversal. Returns the matching sub-graph.
 */
export interface ExploreRoomQuery {
  readonly room: Room;
  readonly text: string;
  readonly depth?: number;
  readonly k?: number;
}

export const exploreRoom =
  (deps: UseCaseDeps) =>
  (query: ExploreRoomQuery): ResultAsync<Subgraph, AppError> => {
    const k = query.k ?? 3;
    const traversalOpts: TraversalOptions = { depth: query.depth ?? 3, room: query.room };
    return searchByRoom(deps)({ room: query.room, text: query.text, k })
      .andThen((matches) => deps.graphs.load().mapErr((e): AppError => e).map((graph) => ({ matches, graph })))
      .map(({ matches, graph }) => bfs(graph, matches.map((m) => m.node_id), traversalOpts));
  };

// ─────────────────────── listRoom ─────────────────────────

/** Convenience: every node in a room, no search required. */
export const listRoom =
  (deps: UseCaseDeps) =>
  (room: Room): ResultAsync<readonly GraphNode[], AppError> =>
    deps.graphs.load().mapErr((e): AppError => e).map((graph) => nodesInRoom(graph, room));

// ─────────────────────── re-exports ──────────────────────

// Re-export the neverthrow primitives the application layer uses, so
// downstream callers can `import { Result } from 'wellinformed/application'`
// instead of reaching into neverthrow directly if they prefer.
export type { VectorError, GraphError };
export type { NodeId, Room, Wing };
export { Result, ResultAsync };
