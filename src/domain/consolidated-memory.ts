/**
 * Consolidated memory — the pure domain primitive behind Phase 4 of
 * the v4 Agent Brain plan: episodic → semantic distillation.
 *
 * A brain replays episodic memory overnight and extracts semantic
 * schemas; raw episodes are then pruned. This module owns the
 * vocabulary and math for identifying clusters of similar raw entries
 * and building provenance-chained summaries from them.
 *
 * Actual LLM invocation for the summary text happens in
 * src/application/consolidator.ts (Phase 4b) — this module stays pure.
 *
 * What NOT to put here:
 *   - Ollama HTTP calls (infra boundary)
 *   - SQLite writes (infra boundary)
 *   - Envelope signing (lives in identity-bridge)
 *
 * Every fallible op returns neverthrow Result. No classes, no throws.
 */

import { Result, err, ok } from 'neverthrow';
import type { NodeId, Room } from './graph.js';
import type { Vector } from './vectors.js';
import { cosine } from './vectors.js';

// ─────────────── errors ───────────────

export type ConsolidationError =
  | { readonly type: 'ConsolidationEmptyInput'; readonly message: string }
  | { readonly type: 'ConsolidationDimMismatch'; readonly expected: number; readonly got: number; readonly at: number }
  | { readonly type: 'ConsolidationInvalidParameter'; readonly field: string; readonly message: string };

export const ConsolidationError = {
  emptyInput: (message: string): ConsolidationError => ({ type: 'ConsolidationEmptyInput', message }),
  dimMismatch: (expected: number, got: number, at: number): ConsolidationError => ({
    type: 'ConsolidationDimMismatch',
    expected, got, at,
  }),
  invalidParameter: (field: string, message: string): ConsolidationError => ({
    type: 'ConsolidationInvalidParameter', field, message,
  }),
} as const;

// ─────────────── shapes ───────────────

/** A raw episodic entry as seen by the consolidator. */
export interface EpisodicEntry {
  readonly node_id: NodeId;
  readonly room: Room;
  readonly vector: Vector;
  /** Optional raw text — summaries need it. When null, the LLM gets only labels. */
  readonly raw_text: string | null;
  /** ISO-8601 timestamp of ingestion. Tiebreak sorting for deterministic clusters. */
  readonly timestamp: string;
}

/**
 * A group of episodic entries identified as semantically related.
 * The application layer feeds this to the LLM to produce a summary.
 */
export interface ConsolidationCluster {
  /** The seed node whose neighborhood produced this cluster. */
  readonly seed_node_id: NodeId;
  /** Entries in the cluster (includes the seed). Size ≥ min_size at construction. */
  readonly entries: readonly EpisodicEntry[];
  /** L2-normalized mean of member vectors — useful as the consolidated-memory's own vector. */
  readonly centroid: Vector;
  /** Room all entries belong to. Clusters NEVER span rooms. */
  readonly room: Room;
}

/**
 * The output of the consolidation pass — a distilled semantic memory
 * anchored to the raw entries it came from. The LLM-generated `summary`
 * is filled in by the application layer; the rest is pure.
 */
export interface ConsolidatedMemory {
  readonly id: NodeId;
  readonly room: Room;
  /** Natural-language summary from the LLM. Length typically 50–200 words. */
  readonly summary: string;
  readonly provenance_ids: readonly NodeId[];
  readonly consolidated_at: string;
  /** Model name + tag, e.g. "qwen2.5:1.5b". Lets future replays detect stale summaries. */
  readonly llm_model: string;
  /** Centroid of the source cluster — what the summary's vector SHOULD be close to. */
  readonly centroid: Vector;
}

// ─────────────── clustering ───────────────

export interface ClusterOptions {
  /** Cosine similarity threshold. Neighbors above this join the cluster. Default 0.8. */
  readonly similarity_threshold?: number;
  /** Minimum cluster size to emit. Smaller neighborhoods are dropped. Default 5. */
  readonly min_size?: number;
  /** Maximum cluster size (prevents a single dominant topic eating the room). Default 100. */
  readonly max_size?: number;
}

const DEFAULT_CLUSTER_OPTIONS: Required<ClusterOptions> = {
  similarity_threshold: 0.8,
  min_size: 5,
  max_size: 100,
};

/**
 * Identify consolidation clusters via greedy seed-grow:
 *
 *   1. Sort entries by timestamp (deterministic order for reproducible
 *      output across peers — required by the V4-PROTOCOL §2.5 claim
 *      "same inputs → same consolidated output").
 *   2. For each unassigned entry (in timestamp order):
 *        a. Take it as seed.
 *        b. Find all OTHER unassigned entries with cosine ≥ threshold.
 *        c. If the seed + neighbors totals ≥ min_size, emit a cluster
 *           and mark them assigned. Clamp to max_size by taking the
 *           closest neighbors.
 *        d. Otherwise, the seed stays unassigned (might join another
 *           cluster with higher density later? — no, greedy; once
 *           skipped it's just released and the next seed tries again
 *           with a different point).
 *   3. Entries that never hit a cluster at threshold stay as raw
 *      episodic (the retention pass handles them).
 *
 * Complexity: O(N²) cosine. At 7,000 entries = 49 M cosine ops, ~5 s
 * in hot JS. Consolidation is a background task — runtime is fine.
 *
 * Clusters NEVER span rooms. The caller partitions input per-room
 * and invokes findClusters once per room.
 */
export const findClusters = (
  entries: readonly EpisodicEntry[],
  opts: ClusterOptions = {},
): Result<readonly ConsolidationCluster[], ConsolidationError> => {
  if (entries.length === 0) return ok([]);

  const cfg: Required<ClusterOptions> = { ...DEFAULT_CLUSTER_OPTIONS, ...opts };
  if (cfg.similarity_threshold < 0 || cfg.similarity_threshold > 1) {
    return err(ConsolidationError.invalidParameter(
      'similarity_threshold',
      `must be in [0,1], got ${cfg.similarity_threshold}`,
    ));
  }
  if (cfg.min_size < 2) {
    return err(ConsolidationError.invalidParameter('min_size', `must be ≥2, got ${cfg.min_size}`));
  }
  if (cfg.max_size < cfg.min_size) {
    return err(ConsolidationError.invalidParameter(
      'max_size',
      `must be ≥ min_size (${cfg.min_size}), got ${cfg.max_size}`,
    ));
  }

  // Verify uniform room — callers must partition per-room
  const room = entries[0].room;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].room !== room) {
      return err(ConsolidationError.invalidParameter(
        'entries',
        `room mismatch at index ${i}: expected '${room}', got '${entries[i].room}'`,
      ));
    }
  }

  // Verify uniform dim
  const dim = entries[0].vector.length;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].vector.length !== dim) {
      return err(ConsolidationError.dimMismatch(dim, entries[i].vector.length, i));
    }
  }

  // Deterministic order: sort by timestamp ASC, then node_id for tiebreak
  const sorted = [...entries].sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp < b.timestamp ? -1 : 1;
    return a.node_id < b.node_id ? -1 : 1;
  });

  const assigned = new Uint8Array(sorted.length);
  const clusters: ConsolidationCluster[] = [];

  for (let seedIdx = 0; seedIdx < sorted.length; seedIdx++) {
    if (assigned[seedIdx] === 1) continue;
    const seed = sorted[seedIdx];

    // Find all unassigned neighbors above threshold
    type Candidate = { readonly idx: number; readonly sim: number };
    const candidates: Candidate[] = [];
    for (let j = seedIdx + 1; j < sorted.length; j++) {
      if (assigned[j] === 1) continue;
      const s = cosine(seed.vector, sorted[j].vector);
      if (s >= cfg.similarity_threshold) candidates.push({ idx: j, sim: s });
    }

    // Seed + candidates must meet min_size. Otherwise skip this seed.
    if (candidates.length + 1 < cfg.min_size) continue;

    // Clamp to max_size by keeping the closest neighbors
    if (candidates.length + 1 > cfg.max_size) {
      candidates.sort((a, b) => b.sim - a.sim);
      candidates.length = cfg.max_size - 1;
    }

    // Assign + collect
    assigned[seedIdx] = 1;
    const members: EpisodicEntry[] = [seed];
    for (const c of candidates) {
      assigned[c.idx] = 1;
      members.push(sorted[c.idx]);
    }

    // Centroid: unit-normalized mean
    const centroid = computeCentroid(members.map((m) => m.vector));

    clusters.push({
      seed_node_id: seed.node_id,
      entries: members,
      centroid,
      room: seed.room,
    });
  }

  return ok(clusters);
};

// ─────────────── provenance builder ───────────────

export interface BuildOptions {
  /** Deterministic ID generator for the consolidated node. */
  readonly makeId: (cluster: ConsolidationCluster, summary: string) => NodeId;
  /** Clock for consolidated_at. */
  readonly clock?: () => string;
  /** LLM model identifier — pinned in the node for future regen detection. */
  readonly llm_model: string;
}

/**
 * Given a cluster + LLM-produced summary, construct the canonical
 * ConsolidatedMemory shape. Pure — no I/O.
 *
 * The ID is computed via `makeId` so callers can choose either content-
 * addressing (sha256 of summary + sorted provenance IDs) or a simple
 * counter. Content-addressing is the recommended path: it gives
 * peer-to-peer deduplication for free.
 */
export const buildConsolidatedMemory = (
  cluster: ConsolidationCluster,
  summary: string,
  opts: BuildOptions,
): Result<ConsolidatedMemory, ConsolidationError> => {
  if (summary.trim().length === 0) {
    return err(ConsolidationError.invalidParameter('summary', 'must be non-empty'));
  }
  const clock = opts.clock ?? (() => new Date().toISOString());
  const id = opts.makeId(cluster, summary);
  const provenance_ids = cluster.entries.map((e) => e.node_id).sort(); // sorted for determinism
  return ok({
    id,
    room: cluster.room,
    summary: summary.trim(),
    provenance_ids,
    consolidated_at: clock(),
    llm_model: opts.llm_model,
    centroid: cluster.centroid,
  });
};

// ─────────────── helpers ───────────────

/**
 * L2-normalized mean of a set of vectors. Used as the cluster centroid.
 * Assumes input vectors are ALL unit-normalized (standard for embedding
 * output); the mean is L2-renormalized at the end to land back on the
 * unit sphere.
 */
export const computeCentroid = (vectors: readonly Vector[]): Vector => {
  if (vectors.length === 0) return new Float32Array(0);
  const dim = vectors[0].length;
  const sum = new Float32Array(dim);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) sum[i] += v[i];
  }
  let sumsq = 0;
  for (let i = 0; i < dim; i++) {
    sum[i] /= vectors.length;
    sumsq += sum[i] * sum[i];
  }
  const norm = Math.sqrt(sumsq) || 1;
  for (let i = 0; i < dim; i++) sum[i] /= norm;
  return sum;
};

/**
 * Convenience: partition a heterogeneous entry list by room, returning
 * one array per room. The consolidator main loop calls findClusters
 * on each partition independently.
 */
export const partitionByRoom = (
  entries: readonly EpisodicEntry[],
): ReadonlyMap<Room, readonly EpisodicEntry[]> => {
  const byRoom = new Map<Room, EpisodicEntry[]>();
  for (const e of entries) {
    const bucket = byRoom.get(e.room);
    if (bucket) bucket.push(e);
    else byRoom.set(e.room, [e]);
  }
  return byRoom;
};
