/**
 * Recency-aware re-ranking.
 *
 * For result sets where freshness matters, raw cosine distance is the
 * wrong primary signal — a perfect-relevance hit from 18 months ago
 * shouldn't outrank a 0.04-distance-worse hit from yesterday. This
 * module provides a deterministic decay-weighted re-ranker:
 *
 *     relevance = 1 / (1 + distance)               ∈ (0, 1]
 *     decay     = 0.5 ^ (age_days / half_life)     ∈ (0, 1]
 *     combined  = relevance × decay
 *
 * The decay uses an honest half-life: at age == half_life_days the
 * weight is exactly 0.5.
 *
 * V5 (Phase 24): the per-room half-life map is gone. A uniform global
 * half-life applies to every match. Per-source-uri-scheme tuning is
 * deferred to Phase 25+ (open question 4).
 *
 * Pure. No I/O. Tested independently of the search layer.
 */

// ─────────────── policy ───────────────────

/**
 * Uniform half-life in days. 14d is the median of the V4 per-room
 * map (sessions=30d, research=14d, toolshed=60d) — biased toward
 * the freshness-sensitive end. Tuning is a Phase 25+ concern.
 */
export const DEFAULT_HALF_LIFE_DAYS = 14;

// ─────────────── rerank ───────────────────

export interface RankableMatch {
  readonly node_id: string;
  readonly distance: number;
  /** Days since fetched_at; undefined when the node has no fetched_at. */
  readonly age_days?: number;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Compute the combined relevance × decay score for a single match.
 * When age is unknown, returns relevance only — staying neutral
 * instead of penalising un-aged nodes.
 */
export const combinedScore = <M extends RankableMatch>(m: M): number => {
  const relevance = clamp01(1 / (1 + Math.max(0, m.distance)));
  if (m.age_days === undefined) return relevance;
  const decay = Math.pow(0.5, m.age_days / DEFAULT_HALF_LIFE_DAYS);
  return relevance * decay;
};

/**
 * Re-rank a result set in-place by combined score (relevance × decay).
 * Stable for matches with identical scores. Returns the new ordering.
 */
export const rerankByRecency = <M extends RankableMatch>(
  matches: readonly M[],
): readonly M[] => {
  const scored = matches.map((m, i) => ({ m, i, s: combinedScore(m) }));
  scored.sort((a, b) => {
    if (b.s !== a.s) return b.s - a.s;
    return a.i - b.i; // stable
  });
  return scored.map((x) => x.m);
};

/**
 * Diagnostic — emit the per-match score breakdown.
 */
export interface ScoreBreakdown {
  readonly node_id: string;
  readonly relevance: number;
  readonly decay: number;
  readonly combined: number;
}

export const explainScore = <M extends RankableMatch>(m: M): ScoreBreakdown => {
  const relevance = clamp01(1 / (1 + Math.max(0, m.distance)));
  const decay =
    m.age_days === undefined
      ? 1
      : Math.pow(0.5, m.age_days / DEFAULT_HALF_LIFE_DAYS);
  return { node_id: m.node_id, relevance, decay, combined: relevance * decay };
};
