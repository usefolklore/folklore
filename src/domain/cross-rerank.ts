/**
 * Cross-encoder rerank — pure scoring composition.
 *
 * The cross-encoder reranker is a small bi-encoder (ms-marco-MiniLM
 * style) that scores a (query, document) pair jointly, unlike the
 * bi-encoder retriever which embeds each side independently. Cross
 * scoring is much more accurate but quadratic in pair count, so it
 * runs only on the top-N candidates from the hybrid retriever.
 *
 * This module is the DOMAIN layer of that pipeline — it knows nothing
 * about ONNX, transformers, or the Xenova runtime. It accepts a
 * `Scorer` port (one async call: (pairs) → scores) and produces a
 * reranked Match list. The infrastructure adapter lives in
 * `infrastructure/cross-encoder.ts`.
 *
 * Why this lives next to `graph-rerank.ts` and `recency-rerank.ts`:
 *   The composition (candidates + per-pair scores → reranked candidates)
 *   is a domain concern. Network/model details are not.
 *
 * Algorithm:
 *   1. Take the top-N candidates from the bi-encoder hybrid stage
 *      (already RRF-fused dense + BM25 from Phase 23).
 *   2. Build (query, doc-text) pairs. Doc text comes from the
 *      VectorRecord.raw_text saved alongside the embedding.
 *   3. Score every pair with the cross-encoder Scorer port.
 *   4. Rewrite each Match.distance to (1 − cross_score) so downstream
 *      consumers (recency-rerank, satisfaction scorer) treat lower as
 *      better, consistent with cosine-distance semantics elsewhere.
 *   5. Sort by new distance asc. Leave the tail (rank > N) untouched
 *      and concatenate — they are already ranked below the head, the
 *      cross-encoder confirms the head ordering.
 *
 * Fail-open: when the Scorer port errors (model load failure, runtime
 * fault), this module returns the input matches unchanged. The
 * application layer can log via the RerankError but should never abort
 * the ask on a rerank failure.
 */

import { ResultAsync, okAsync } from 'neverthrow';
import type { Match } from './vectors.js';
import type { RerankError } from './errors.js';

// ─────────────── port ─────────────

/**
 * The cross-encoder scoring port. One call, batched.
 *
 * Implementations:
 *   - `xenovaCrossEncoder` (infrastructure/cross-encoder.ts) — Xenova
 *     `Xenova/ms-marco-MiniLM-L-6-v2`, lazy-loaded, falls open on
 *     model-load failure.
 *   - `fixtureCrossEncoder` — deterministic for tests; returns
 *     pre-registered scores keyed on the doc text.
 */
export interface CrossEncoderScorer {
  /**
   * Score (query, doc) pairs in batch. Returns a parallel array of
   * relevance scores in roughly [0, 1] — higher means more relevant.
   * Implementations may emit logits; absolute calibration is not
   * required, only the order. We rescale to [0, 1] before mapping
   * to distance.
   */
  score(query: string, docs: readonly string[]): ResultAsync<readonly number[], RerankError>;
}

// ─────────────── options ─────────────

export interface CrossRerankOptions {
  /**
   * Number of head candidates to rerank. Tail (rank > headSize) passes
   * through unchanged. Default 20 — empirically the sweet spot for
   * MS-MARCO-MiniLM on retrieval workloads (cost grows linearly, lift
   * plateaus past 20).
   */
  readonly headSize?: number;
}

// ─────────────── algorithm ─────────────

/**
 * Apply cross-encoder scores to the top-N candidates, returning a new
 * Match list with rewritten distances. Pure — no I/O beyond the
 * Scorer port call.
 *
 * Distance mapping: `new_distance = 1 − sigmoidIfLogit(score)`. We
 * sigmoid-squash when the raw score is outside [0, 1] (cross-encoders
 * commonly emit logits in roughly [−10, +10]); inside [0, 1] we
 * pass through. This keeps distances comparable to the bi-encoder's
 * L2-on-unit-vectors scale while preserving the cross-encoder's
 * relative ordering.
 *
 * Returns the original `matches` unchanged when:
 *   - the matches array is empty
 *   - the matches lack `raw_text` we can pair against (caller's job
 *     to provide a doc-text resolver — see `rerankWithDocs`)
 *   - the Scorer port errors
 */
export const rerankMatches = (
  query: string,
  matches: readonly Match[],
  docTextOf: (m: Match) => string | undefined,
  scorer: CrossEncoderScorer,
  opts: CrossRerankOptions = {},
): ResultAsync<readonly Match[], RerankError> => {
  const headSize = opts.headSize ?? 20;

  if (matches.length === 0) return okAsync(matches);

  const head = matches.slice(0, Math.min(headSize, matches.length));
  const tail = matches.slice(head.length);

  const docs: string[] = [];
  const headWithText: Match[] = [];
  const headWithoutText: Match[] = [];
  for (const m of head) {
    const t = docTextOf(m);
    if (t && t.length > 0) {
      docs.push(t);
      headWithText.push(m);
    } else {
      headWithoutText.push(m);
    }
  }

  if (docs.length === 0) return okAsync(matches);

  return scorer
    .score(query, docs)
    .map((scores) => {
      const rescaled = scores.map(toDistance);
      const reranked: Match[] = headWithText
        .map((m, i) => ({ ...m, distance: rescaled[i] ?? m.distance }))
        .sort((a, b) => a.distance - b.distance);
      return [...reranked, ...headWithoutText, ...tail];
    })
    .orElse((): ResultAsync<readonly Match[], RerankError> => okAsync(matches));
};

// ─────────────── score → distance ─────────────

/**
 * Map a raw cross-encoder score to a [0, 2] distance.
 *
 * Heuristic: if the raw score is in [0, 1] we treat it as a probability
 * (Xenova text-classification pipeline default) and return `1 − score`.
 * Otherwise we treat it as a logit and apply a logistic squash first.
 *
 * Why 1 − sigmoid(logit) not just −logit:
 *   Downstream consumers (recency-rerank, sat scorer) assume cosine-
 *   distance semantics (0 = identical, 2 = orthogonal). Logits violate
 *   that scale. Sigmoid keeps the range bounded and monotonic.
 */
const toDistance = (raw: number): number => {
  if (!Number.isFinite(raw)) return 1;
  const p = raw >= 0 && raw <= 1 ? raw : sigmoid(raw);
  return clamp(0, 2, 1 - p);
};

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const clamp = (lo: number, hi: number, x: number): number => Math.max(lo, Math.min(hi, x));
