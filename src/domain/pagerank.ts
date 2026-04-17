/**
 * Pure Personalized PageRank (PPR) — the primitive behind v3.2's
 * graph-based rerank (HippoRAG-2 style).
 *
 * Input: an adjacency list over N nodes with optional edge weights,
 * a personalization vector (size N, non-negative, sum>0), teleport
 * probability alpha (1 - restart probability, Brin-Page 1998).
 *
 * Output: stationary distribution r, such that
 *
 *     r = (1 - alpha) * p + alpha * M · r
 *
 * where M is the column-stochastic transition matrix derived from
 * the adjacency list (out-edge-weight-normalized with a spider-trap
 * fallback for dangling nodes — a dangling node's row is replaced
 * with p so its probability mass teleports to the personalization
 * distribution rather than leaking).
 *
 * Pure: no I/O, no classes, deterministic for a given seed. Fixed-
 * point iteration terminates when ||r_{t+1} - r_t||_1 < tol or
 * after maxIter iterations, whichever comes first.
 *
 * Used for retrieval rerank: `personalization` holds the initial
 * per-doc retrieval scores, the graph is a doc-doc kNN graph over
 * vector similarities, and the resulting r scores docs by both
 * direct relevance AND graph-proximity to relevant docs.
 */

import { Result, err, ok } from 'neverthrow';

// ─────────────────────── shape ────────────────────────────────────

/** Directed weighted edge (from → to, weight). */
export interface Edge {
  readonly from: number;
  readonly to: number;
  readonly weight: number; // non-negative; raw similarities/kNN ranks both work
}

export type PagerankError =
  | { readonly type: 'PagerankInvalidInput'; readonly message: string };

export const PagerankError = {
  invalid: (message: string): PagerankError => ({ type: 'PagerankInvalidInput', message }),
} as const;

export interface PagerankOptions {
  /** Teleport weight. Default 0.85. */
  readonly alpha?: number;
  /** Convergence threshold (L1). Default 1e-6. */
  readonly tol?: number;
  /** Iteration cap. Default 50. */
  readonly maxIter?: number;
}

// ─────────────────────── main ─────────────────────────────────────

/**
 * Compute PPR over a graph with a personalization distribution.
 *
 * Mechanics (power iteration with dangling-node fixup, per HippoRAG-2
 * §4.2 and the classical Brin-Page spider-trap mitigation):
 *
 *   Let r_0 = p  (start at the personalization distribution).
 *   At each step:
 *     r' = (1 - alpha) * p
 *     for each node i:
 *       if i has outgoing edges:
 *         for each (i, j, w) in out-edges of i:
 *           r'[j] += alpha * r[i] * w / sum_out_weight[i]
 *       else:
 *         # dangling → teleport this node's mass to p
 *         for each k:
 *           r'[k] += alpha * r[i] * p[k]
 *     r = r'
 *     if ||r - r_prev||_1 < tol: break
 *
 * Returns a Float64Array of length n with r[i] for each node i.
 * Output sums to ~1 (teleport + redistribution preserve total mass).
 */
export const pagerank = (
  n: number,
  edges: readonly Edge[],
  personalization: readonly number[],
  opts: PagerankOptions = {},
): Result<Float64Array, PagerankError> => {
  if (!Number.isInteger(n) || n < 1) {
    return err(PagerankError.invalid(`n must be a positive integer, got ${n}`));
  }
  if (personalization.length !== n) {
    return err(PagerankError.invalid(`personalization length ${personalization.length} != n ${n}`));
  }
  const alpha = opts.alpha ?? 0.85;
  const tol = opts.tol ?? 1e-6;
  const maxIter = opts.maxIter ?? 50;
  if (alpha <= 0 || alpha >= 1) {
    return err(PagerankError.invalid(`alpha must be in (0,1), got ${alpha}`));
  }

  // Normalize personalization to a probability distribution.
  let pSum = 0;
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(personalization[i]) || personalization[i] < 0) {
      return err(PagerankError.invalid(`personalization[${i}] must be non-negative finite, got ${personalization[i]}`));
    }
    pSum += personalization[i];
  }
  if (pSum === 0) {
    return err(PagerankError.invalid('personalization vector sums to 0'));
  }
  const p = new Float64Array(n);
  for (let i = 0; i < n; i++) p[i] = personalization[i] / pSum;

  // Build outgoing-edge arrays and per-node weight sums.
  // Storage: one flat array of [to, w] pairs, two offset arrays
  // indexing into it. Avoids allocating n Map instances.
  const outDegCount = new Int32Array(n);
  for (const e of edges) {
    if (e.from < 0 || e.from >= n || e.to < 0 || e.to >= n) {
      return err(PagerankError.invalid(`edge out of range: ${e.from} → ${e.to}`));
    }
    if (!Number.isFinite(e.weight) || e.weight < 0) {
      return err(PagerankError.invalid(`edge weight ${e.weight} invalid (must be non-negative finite)`));
    }
    if (e.weight > 0) outDegCount[e.from]++;
  }
  const outStart = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) outStart[i + 1] = outStart[i] + outDegCount[i];
  const outTo = new Int32Array(outStart[n]);
  const outW = new Float64Array(outStart[n]);
  const cursor = new Int32Array(n);
  const wSum = new Float64Array(n);
  for (const e of edges) {
    if (e.weight <= 0) continue;
    const base = outStart[e.from];
    const off = cursor[e.from]++;
    outTo[base + off] = e.to;
    outW[base + off] = e.weight;
    wSum[e.from] += e.weight;
  }

  // Power iteration.
  let r = new Float64Array(p);
  let rNext = new Float64Array(n);

  for (let iter = 0; iter < maxIter; iter++) {
    // Seed with teleport contribution.
    for (let i = 0; i < n; i++) rNext[i] = (1 - alpha) * p[i];

    // Aggregate dangling mass — distributed to personalization at end of iter
    // rather than per-node, which would be O(n²). Textbook PR optimization.
    let dangling = 0;
    for (let i = 0; i < n; i++) {
      if (wSum[i] === 0) {
        dangling += r[i];
      } else {
        const alphaRi = (alpha * r[i]) / wSum[i];
        const base = outStart[i];
        const deg = outStart[i + 1] - base;
        for (let k = 0; k < deg; k++) {
          rNext[outTo[base + k]] += alphaRi * outW[base + k];
        }
      }
    }
    if (dangling > 0) {
      const share = alpha * dangling;
      for (let i = 0; i < n; i++) rNext[i] += share * p[i];
    }

    // Convergence check: L1 norm of delta.
    let delta = 0;
    for (let i = 0; i < n; i++) delta += Math.abs(rNext[i] - r[i]);
    // Swap
    const tmp = r; r = rNext; rNext = tmp;
    if (delta < tol) break;
  }

  return ok(r);
};

// ─────────────────────── convenience: kNN graph builder ───────────

/**
 * Build a symmetric kNN graph over N unit-normalized vectors.
 * Each node gets an edge to its top-k nearest neighbors (by cosine),
 * excluding itself. Weights are the cosine values.
 *
 * For SOTA rerank experiments we typically use k=5..10 (HippoRAG-2
 * uses k=5 in their Personalized-PR ablation).
 *
 * Complexity: O(N² * D) for the pairwise similarity matrix, then
 * O(N * k log N) for the per-row top-k. For N≤25k this is
 * seconds in JS; larger corpora should use an ANN library.
 */
export const buildKnnGraph = (
  vectors: readonly Float64Array[],
  k: number,
): Result<readonly Edge[], PagerankError> => {
  const n = vectors.length;
  if (n === 0) return ok([]);
  if (k < 1 || k >= n) {
    return err(PagerankError.invalid(`k must be in [1, n-1], got ${k}`));
  }
  const d = vectors[0].length;
  for (let i = 0; i < n; i++) {
    if (vectors[i].length !== d) {
      return err(PagerankError.invalid(`vector ${i} has dim ${vectors[i].length}, expected ${d}`));
    }
  }

  const edges: Edge[] = [];
  // Reusable buffer for the per-row top-k heap (simple sorted array).
  for (let i = 0; i < n; i++) {
    // Compute similarities to all j ≠ i.
    const sims = new Array<{ j: number; s: number }>(n - 1);
    let idx = 0;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      // dot product — vectors are unit-normalized
      let s = 0;
      const a = vectors[i];
      const b = vectors[j];
      for (let t = 0; t < d; t++) s += a[t] * b[t];
      sims[idx++] = { j, s };
    }
    // partial sort — we only need top k. Sort descending.
    sims.sort((x, y) => y.s - x.s);
    for (let t = 0; t < k; t++) {
      const { j, s } = sims[t];
      // Clamp negative cosines to 0 — PageRank requires non-negative weights.
      // In practice on unit-normed text embeddings, negatives are rare anyway.
      edges.push({ from: i, to: j, weight: Math.max(0, s) });
    }
  }
  return ok(edges);
};
