/**
 * Graph-aware rerank for vector search results — wires the
 * Personalised PageRank primitive in `pagerank.ts` into the retrieval
 * path so structural authority on the entity-chunk graph (HippoRAG-2
 * §4.2) influences the final ranking, not only bi-encoder cosine.
 *
 * Pure: no I/O, no clock, deterministic for a given seed graph.
 *
 * Why this lives here, not in the application layer:
 *   The composition (graph + matches → ranked matches) is a domain
 *   concern. The application layer (ask.ts) only decides WHEN to
 *   apply it; the math + edge-walking belongs next to graph.ts and
 *   pagerank.ts which are the inputs.
 *
 * Algorithm (HippoRAG-2 retrieval rerank distilled):
 *
 *   1. Take the bi-encoder candidate set as the personalisation
 *      vector (each candidate's weight = max(0, 1 − distance)).
 *   2. Build a 1-hop subgraph induced by the candidates by walking
 *      `mentions` and `next_chunk` edges in BOTH directions. The
 *      mentions relation is bipartite (chunk ↔ entity); next_chunk
 *      is sequential (chunk → chunk). One hop is enough to surface
 *      the entity-pivot signal that drives HippoRAG-2's wins.
 *   3. Run PPR with α=0.85 over the subgraph.
 *   4. Fuse vector_score and ppr_score:
 *        final = β · vec_score + (1 − β) · normalised_ppr_score
 *      Default β=0.5 — equal weight to direct relevance and graph
 *      authority. Override on the call-site for ablation/eval.
 *   5. Sort candidates by final, convert back to a `distance` so
 *      downstream consumers (recency-rerank, scorer) see the same
 *      Match shape.
 *
 * Cost: subgraph is bounded by candidates + 1-hop neighbours.
 * Typical: 10 candidates × avg degree 5 = ~60 nodes, ~120 edges. PPR
 * converges in ≤50 iterations of O(edges) → sub-millisecond on the
 * hot path.
 */

import { Result, ok, err } from 'neverthrow';
import type { Graph } from './graph.js';
import { edgesByRelationAndSource, edgesByRelationAndTarget } from './graph.js';
import { pagerank, type Edge as PprEdge, type PagerankError } from './pagerank.js';
import type { Match } from './vectors.js';

// ─────────────── error / opts ─────────────

export type GraphRerankError = PagerankError;

export interface PprRerankOptions {
  /** Restart probability for PPR. Default 0.85 (Brin–Page). */
  readonly alpha?: number;
  /**
   * Edge relations to use in the random walk. Default ['mentions',
   * 'next_chunk'] — the two relations the ingest pipeline writes.
   * Adding new relations later (e.g. 'similar_to', 'co_mentioned')
   * is a config-only change.
   */
  readonly relations?: readonly string[];
  /**
   * Score blend: final = β · vec + (1 − β) · ppr_norm.
   *   β = 1.0 → vector only (PPR is no-op)
   *   β = 0.0 → PPR only
   *   β = 0.5 → equal weight (default — HippoRAG-2 reports near this)
   */
  readonly beta?: number;
}

// ─────────────── core ─────────────────────

/**
 * Rerank `matches` by combining the bi-encoder distance with a PPR
 * walk over the entity-chunk subgraph induced by the candidate set.
 *
 * The output is a `Match[]` of the SAME node_ids as the input — no
 * neighbours are promoted into the result. The `distance` field is
 * rewritten to `1 − fused_score` so downstream `slice(0, k)` and
 * sort-by-distance code paths keep working unchanged.
 */
export const pprRerank = (
  graph: Graph,
  matches: readonly Match[],
  opts: PprRerankOptions = {},
): Result<readonly Match[], GraphRerankError> => {
  if (matches.length === 0) return ok([]);

  const beta = clamp01(opts.beta ?? 0.5);
  const alpha = opts.alpha ?? 0.85;
  const relations = opts.relations ?? ['mentions', 'next_chunk'];

  // β = 1 → vector-only mode; PPR adds nothing, return as-is to skip
  // the subgraph build entirely. Used by the eval harness for an
  // apples-to-apples ablation.
  if (beta >= 1) return ok(matches);

  // Map node_ids to contiguous integer indices. Candidates first so
  // their indices are 0..(matches.length−1); neighbours appended.
  const idToIdx = new Map<string, number>();
  const idxToId: string[] = [];
  const intern = (id: string): number => {
    let i = idToIdx.get(id);
    if (i !== undefined) return i;
    i = idxToId.length;
    idToIdx.set(id, i);
    idxToId.push(id);
    return i;
  };
  for (const m of matches) intern(m.node_id);

  // Walk 1-hop neighbours of candidates (both directions) for each
  // configured relation. The pagerank routine is robust to repeated
  // edges (they sum into the out-weight), so we don't dedupe here.
  const subEdges: PprEdge[] = [];
  const candidateIds = matches.map((m) => m.node_id);
  for (const id of candidateIds) {
    for (const rel of relations) {
      // Outbound: id → ?
      for (const e of edgesByRelationAndSource(graph, rel, id)) {
        subEdges.push({ from: intern(e.source), to: intern(e.target), weight: 1 });
      }
      // Inbound: ? → id (gives the entity-pivot signal that lets
      // chunks co-mentioning the same entity boost each other).
      for (const e of edgesByRelationAndTarget(graph, rel, id)) {
        subEdges.push({ from: intern(e.source), to: intern(e.target), weight: 1 });
      }
    }
  }

  const n = idxToId.length;

  // No graph signal at all — every candidate is isolated. Return
  // input unchanged rather than running a degenerate PPR.
  if (subEdges.length === 0) return ok(matches);

  // Personalisation vector: each candidate's weight is its bi-encoder
  // similarity (1 − distance), clamped to [0, 1]. Non-candidates
  // start at 0 and only acquire mass through the random walk.
  const personalisation = new Float64Array(n);
  let pSum = 0;
  for (const m of matches) {
    const w = Math.max(0, 1 - m.distance);
    personalisation[idToIdx.get(m.node_id)!] = w;
    pSum += w;
  }
  // Edge case: every candidate has distance ≥ 1 (semantic adjacency
  // only). Fall back to uniform candidate weight so PPR has a non-
  // zero seed; the bi-encoder ordering then breaks ties.
  if (pSum === 0) {
    for (const m of matches) personalisation[idToIdx.get(m.node_id)!] = 1;
  }

  const pprRes = pagerank(n, subEdges, Array.from(personalisation), { alpha });
  if (pprRes.isErr()) return err(pprRes.error);
  const r = pprRes.value;

  // Normalise PPR scores by the max value seen ON THE CANDIDATE SET
  // — neighbour mass is irrelevant since neighbours don't surface in
  // the output. This keeps the fusion ratio in [0, 1] and avoids the
  // "all-PPR-mass-on-one-popular-entity" degeneracy.
  let pprMax = 0;
  for (const m of matches) {
    const s = r[idToIdx.get(m.node_id)!];
    if (s > pprMax) pprMax = s;
  }
  if (pprMax === 0) return ok(matches);

  const reranked = matches.map((m) => {
    const idx = idToIdx.get(m.node_id)!;
    const pprNorm = r[idx] / pprMax;            // [0, 1]
    const vec = Math.max(0, 1 - m.distance);    // [0, 1]
    const fused = beta * vec + (1 - beta) * pprNorm;
    return { ...m, distance: 1 - fused };
  });
  // Stable sort by ascending distance (smaller = better).
  return ok(
    reranked.slice().sort((a, b) => a.distance - b.distance),
  );
};

// ─────────────── helpers ──────────────────

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
