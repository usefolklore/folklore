/**
 * Pure domain model for dense vector math + semantic matches.
 *
 * This module owns the vocabulary around embeddings — Vector, Match,
 * Tunnel — plus the pure linear-algebra helpers the rest of the stack
 * builds on. No persistence, no async, no classes.
 *
 * Dimension is a phantom-friendly opaque type so callers can't
 * accidentally mix a 384-dim MiniLM vector with a 768-dim BGE vector
 * without us noticing at the boundary.
 */

import { Result, err, ok } from 'neverthrow';
import { VectorError } from './errors.js';
import type { NodeId, Room, Wing } from './graph.js';

/** Canonical embedding dimension for Xenova/all-MiniLM-L6-v2. */
export const DEFAULT_DIM = 384;

/** A dense unit-normalized float32 vector. */
export type Vector = Float32Array;

/**
 * A vector in context — carries the id, room, and wing of its node.
 *
 * Optional `raw_text` is the pre-prefix, pre-normalization text used to
 * generate the vector. When present, the vector index can use it to feed
 * a parallel FTS5 BM25 path for hybrid retrieval. When absent, hybrid
 * retrieval gracefully falls back to dense-only.
 */
export interface VectorRecord {
  readonly node_id: NodeId;
  readonly room: Room;
  readonly wing?: Wing;
  readonly vector: Vector;
  readonly raw_text?: string;
}

/** A similarity match returned by a search. `distance` is L2 on unit vectors. */
export interface Match {
  readonly node_id: NodeId;
  readonly room: Room;
  readonly wing?: Wing;
  readonly distance: number;
}

/** A pair of nodes from different rooms with a short semantic distance. */
export interface Tunnel {
  readonly a: NodeId;
  readonly b: NodeId;
  readonly room_a: Room;
  readonly room_b: Room;
  readonly distance: number;
}

// ─────────────────────── validation ───────────────────────

/** Verify a vector matches the expected dimension. */
export const assertDim = (v: Vector, expected: number = DEFAULT_DIM): Result<Vector, VectorError> =>
  v.length === expected ? ok(v) : err(VectorError.dimensionMismatch(expected, v.length));

// ─────────────────────── arithmetic ───────────────────────

/** L2 (Euclidean) distance between two equal-length vectors. */
export const l2 = (a: Vector, b: Vector): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s);
};

/** Cosine similarity — assumes both vectors are already unit-normalized. */
export const cosine = (a: Vector, b: Vector): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/** Return a new unit-normalized copy of the input vector. */
export const normalize = (v: Vector): Vector => {
  let sumsq = 0;
  for (let i = 0; i < v.length; i++) sumsq += v[i] * v[i];
  const norm = Math.sqrt(sumsq) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
};

/**
 * Build a unit vector from a sparse list of (index, value) pairs.
 * Useful for tests that want control over specific dimensions.
 */
export const sparse = (entries: readonly (readonly [number, number])[], dim = DEFAULT_DIM): Vector => {
  const v = new Float32Array(dim);
  for (const [i, x] of entries) v[i] = x;
  return normalize(v);
};

// ─────────────────────── hybrid retrieval (BM25 + RRF) ───

/**
 * Lucene EnglishAnalyzer.ENGLISH_STOP_WORDS_SET — the canonical 33-token
 * stopword list used by Anserini/Pyserini for all BEIR BM25 reproductions.
 * Keeping this as a domain constant lets both the bench and the production
 * VectorIndex use the same list without duplication.
 */
export const LUCENE_STOPWORDS: ReadonlySet<string> = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for',
  'if', 'in', 'into', 'is', 'it', 'no', 'not', 'of', 'on', 'or',
  'such', 'that', 'the', 'their', 'then', 'there', 'these', 'they',
  'this', 'to', 'was', 'will', 'with',
]);

/**
 * Anserini-style FTS5 query builder. Pure function — no I/O.
 *
 * Takes a raw natural-language query, extracts alphanumeric tokens
 * (lowercased), strips the Lucene stopword list, drops length-1 tokens,
 * and emits a space-separated OR clause. The result is safe to pass to
 * SQLite FTS5's `MATCH` with `bm25(fts_docs, 0.9, 0.4)` for BEIR-tuned
 * BM25 scoring (Pyserini SIGIR 2021 standard).
 *
 * Returns an empty string if the query has no retainable tokens; callers
 * should treat that as "skip BM25 stage" and fall back to dense-only.
 */
export const sanitizeForFts5 = (query: string): string => {
  const tokens = (query.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (t) => t.length > 1 && !LUCENE_STOPWORDS.has(t),
  );
  return tokens.join(' OR ');
};

/**
 * A ranked candidate after dense or sparse retrieval. Used as input to RRF.
 */
export interface RankedCandidate {
  readonly node_id: NodeId;
  readonly room?: Room;
  readonly wing?: Wing;
  readonly denseRank: number | null;
  readonly bm25Rank: number | null;
  readonly distance?: number;
}

/**
 * Hybrid retrieval configuration.
 *
 * `rrfK` is the Cormack-Clarke-Büttcher SIGIR 2009 constant; 60 is the
 * published standard and moves only marginally with per-dataset tuning.
 * `denseK` and `bm25K` are the depth of each ranked list that feeds RRF;
 * depths below 30 start to cut recall, depths above 200 dilute the
 * ranking signal — 100 is the BEIR default.
 */
export interface HybridConfig {
  readonly denseK: number;
  readonly bm25K: number;
  readonly rrfK: number;
}

export const DEFAULT_HYBRID_CONFIG: HybridConfig = {
  denseK: 100,
  bm25K: 100,
  rrfK: 60,
};

/**
 * Reciprocal Rank Fusion (Cormack, Clarke, Büttcher, SIGIR 2009).
 *
 * Pure function: takes two ranked candidate lists (dense and BM25) and
 * merges them by summing `1 / (rrfK + rank + 1)` contributions from each
 * list in which a candidate appears. Returns the merged list sorted by
 * fused score descending. No I/O, no mutation.
 *
 * When a candidate appears in only one list, its contribution from the
 * other list is zero (not a missing-data penalty — RRF's strength is that
 * it naturally handles absent candidates).
 */
export const rrfFuse = (
  dense: readonly RankedCandidate[],
  bm25: readonly RankedCandidate[],
  cfg: HybridConfig = DEFAULT_HYBRID_CONFIG,
): readonly RankedCandidate[] => {
  const byId = new Map<NodeId, RankedCandidate>();
  for (let i = 0; i < dense.length; i++) {
    const c = dense[i];
    byId.set(c.node_id, {
      ...c,
      denseRank: i,
      bm25Rank: null,
    });
  }
  for (let i = 0; i < bm25.length; i++) {
    const c = bm25[i];
    const existing = byId.get(c.node_id);
    if (existing) {
      byId.set(c.node_id, { ...existing, bm25Rank: i });
    } else {
      byId.set(c.node_id, {
        ...c,
        denseRank: null,
        bm25Rank: i,
      });
    }
  }
  const scored = [...byId.values()].map((c) => {
    let score = 0;
    if (c.denseRank !== null) score += 1 / (cfg.rrfK + c.denseRank + 1);
    if (c.bm25Rank !== null) score += 1 / (cfg.rrfK + c.bm25Rank + 1);
    return { candidate: c, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.candidate);
};

// ─────────────────────── tunnel detection ────────────────

/**
 * Find cross-room tunnel candidates — pairs of records from different
 * rooms with L2 distance ≤ threshold.
 *
 * Pure function: no I/O, no mutation. The caller passes a snapshot of
 * all vector records it cares about, and this returns a sorted list.
 *
 * Complexity: O(n²) in the number of records passed. For Phase 1
 * volumes (hundreds) this is fine. Later phases can swap in a
 * nearest-neighbours search driven by the vector index.
 */
export const findTunnels = (
  records: readonly VectorRecord[],
  threshold: number,
  restrictToRoom?: Room,
): readonly Tunnel[] => {
  const tunnels: Tunnel[] = [];
  for (let i = 0; i < records.length; i++) {
    const a = records[i];
    if (restrictToRoom && a.room !== restrictToRoom) continue;
    for (let j = i + 1; j < records.length; j++) {
      const b = records[j];
      if (a.room === b.room) continue; // same room is not a tunnel
      const d = l2(a.vector, b.vector);
      if (d <= threshold) {
        tunnels.push({
          a: a.node_id,
          b: b.node_id,
          room_a: a.room,
          room_b: b.room,
          distance: d,
        });
      }
    }
  }
  return tunnels.sort((x, y) => x.distance - y.distance);
};
