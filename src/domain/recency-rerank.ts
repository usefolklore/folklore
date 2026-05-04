/**
 * Recency-aware re-ranking for room search.
 *
 * For some rooms (sessions especially) raw cosine distance is the
 * wrong primary signal — a perfect-relevance hit from 18 months ago
 * shouldn't outrank a 0.04-distance-worse hit from yesterday. This
 * module provides a deterministic decay-weighted re-ranker:
 *
 *     relevance = 1 / (1 + distance)               ∈ (0, 1]
 *     decay     = 0.5 ^ (age_days / half_life)     ∈ (0, 1]
 *     combined  = relevance × decay
 *
 * The decay uses an honest half-life: at age == half_life_days the
 * weight is exactly 0.5. (The seductive `exp(-age / half_life)` form
 * gives 0.37 at the half-life, which makes recency policy harder to
 * reason about; `0.5^(age/h)` is the textbook decay.)
 *
 * The room policy maps each known-rerank-eligible room to a
 * half-life (days). Unmapped rooms skip rerank entirely. Read the
 * room from each match (not the query) so a global-search hit set
 * can mix per-room policies.
 *
 * Pure. No I/O. Tested independently of the search layer.
 */

// ─────────────── room policy ───────────────

/**
 * Half-life in days, per room. Bigger = more weight on relevance.
 * Smaller = sharper recency preference.
 *
 * - sessions:  30d    — Claude transcripts go stale fast; "what did
 *                       I just figure out?" should usually outrank
 *                       "what did I figure out two months ago?".
 * - research:  14d    — papers / hn / arxiv: fresh signal matters
 *                       more than top relevance after a couple weeks.
 * - toolshed:  60d    — code / deps / git: relevance dominates;
 *                       still some recency lift for live repos.
 *
 * Rooms not listed → no recency rerank.
 */
const HALF_LIFE_DAYS_BY_ROOM: ReadonlyMap<string, number> = new Map([
  ['sessions', 30],
  ['research', 14],
  ['toolshed', 60],
]);

export const halfLifeForRoom = (room: string | undefined): number | undefined =>
  room === undefined ? undefined : HALF_LIFE_DAYS_BY_ROOM.get(room);

// ─────────────── rerank ───────────────────

export interface RankableMatch {
  readonly node_id: string;
  readonly room?: string;
  readonly distance: number;
  /** Days since fetched_at; undefined when the node has no fetched_at. */
  readonly age_days?: number;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Compute the combined relevance × decay score for a single match.
 * When the room has no recency policy OR the age is unknown, returns
 * relevance only — staying neutral instead of penalising un-aged
 * nodes (those get caught by the satisfaction scorer separately).
 */
export const combinedScore = <M extends RankableMatch>(m: M): number => {
  const relevance = clamp01(1 / (1 + Math.max(0, m.distance)));
  const halfLife = halfLifeForRoom(m.room);
  if (halfLife === undefined || m.age_days === undefined) return relevance;
  const decay = Math.pow(0.5, m.age_days / halfLife);
  return relevance * decay;
};

/**
 * Re-rank a result set in-place by combined score (relevance × decay).
 * Stable for matches with identical scores. Returns the new ordering.
 *
 * Matches in rooms without a policy keep their relative order under
 * the relevance-only scorer — this means a mixed-room result set
 * gets coherent ranking even when only some rooms have decay.
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
 * Diagnostic — emit the per-match score breakdown. Used by tests and
 * (eventually) by `wellinformed ask --explain`.
 */
export interface ScoreBreakdown {
  readonly node_id: string;
  readonly relevance: number;
  readonly decay: number;
  readonly combined: number;
}

export const explainScore = <M extends RankableMatch>(m: M): ScoreBreakdown => {
  const relevance = clamp01(1 / (1 + Math.max(0, m.distance)));
  const halfLife = halfLifeForRoom(m.room);
  const decay =
    halfLife === undefined || m.age_days === undefined
      ? 1
      : Math.pow(0.5, m.age_days / halfLife);
  return { node_id: m.node_id, relevance, decay, combined: relevance * decay };
};
