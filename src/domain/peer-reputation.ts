/**
 * Peer reputation — subject-scoped trust accumulation.
 *
 * Each peer keeps a local map of `peer_id × subject → score` for every
 * remote peer it has ever talked to. After every federated ask, the
 * local satisfaction signal that `peer-telemetry.ts:computeSatisfaction`
 * already produces becomes a review of every peer that contributed to
 * the answer, scoped to the subject(s) the answer was about. Future
 * federated fan-outs use that map to prefer peers with a track record
 * on the subject — for ordering only, never filtering, with an
 * exploration floor so unknown peers still get sampled.
 *
 * Pure: no I/O, no clock outside the optional `now` parameter,
 * deterministic for fixed inputs. The store layer
 * (`peer-reputation-store.ts`) and the application wiring
 * (`update-peer-reputation.ts`) are the only places that touch disk
 * or wall-clock time.
 *
 * Design ratified by multi-LLM round-4 audit — see
 * `docs/peer-reputation-design.md` for prior art (EigenTrust,
 * PeerTrust, Beta Reputation, PowerTrust, SybilGuard) and
 * `docs/peer-reputation-load-spreading.md` for the load-aware ranking
 * + replication propagation strategy.
 */

// ─────────────── shape ────────────────────

/**
 * Stable key for a subject the reputation system tracks.
 *
 * v1 only ships `entity:*` and `room:*` keys. Embedding-cluster keys
 * are deferred (taxonomy drift risk — see design doc §8 Risk 1).
 *
 *   - `entity:product:lemlist`   from canonical entity_id (preferred)
 *   - `room:research`            from system room name (fallback)
 */
export type SubjectKey = string;

/** ISO-8601 timestamp string. */
export type Iso = string;

/** Peer DID or libp2p peer-id; opaque to this module. */
export type PeerIdRef = string;

/** Reviewer DID — the local peer's `did:key` when reviewing first-hand. */
export type ReviewerDid = string;

/**
 * One peer's score on one subject, accumulated across many reviews.
 *
 * `weighted_sum` and `weighted_review_count` are the running totals
 * needed to compute `posterior_mean` and `confidence` cheaply at any
 * time. They survive process restarts intact, so cumulative-mean
 * stays stable across reboots.
 */
export interface PeerSubjectScore {
  readonly posterior_mean: number;          // Bayesian: (k·prior + Σwx) / (k + Σw)
  readonly confidence: number;              // Σw / (Σw + k), in [0, 1)
  readonly rank_score: number;              // posterior × confidence × freshness × load
  readonly weighted_review_count: number;   // Σw_i — sum of review weights
  readonly raw_review_count: number;        // count of distinct reviews (pre-decay)
  readonly weighted_sum: number;            // Σ w_i · score_i
  readonly weighted_sum_squares: number;    // Σ w_i · score_i² (variance signal, future)
  readonly first_review_at: Iso;
  readonly last_review_at: Iso;
  readonly last_answer_at: Iso;             // when this peer last actually answered
  readonly stale_after_days: number;
  readonly decay_half_life_days: number;
  readonly reviewers: Readonly<Record<ReviewerDid, ReviewerEvidence>>;
}

/**
 * Per-reviewer bucket of evidence inside a `PeerSubjectScore`.
 *
 * Held separately so that, when peer-reputation is gossiped in a
 * future phase, we can detect double-counting (one reviewer relayed
 * by two peers should still count as one source of evidence).
 */
export interface ReviewerEvidence {
  readonly weighted_count: number;          // Σ w_i for this reviewer alone
  readonly weighted_sum: number;            // Σ w_i · score_i for this reviewer
  readonly last_review_at: Iso;
}

/**
 * One subject — its label, kind, and the per-peer scores. Materialised
 * aggregation (fast read for fan-out ranking).
 */
export interface SubjectAggregate {
  readonly key: SubjectKey;
  readonly label: string;
  readonly kind: 'entity' | 'room';
  readonly peer_scores: Readonly<Record<PeerIdRef, PeerSubjectScore>>;
}

/**
 * Append-only review event log. Replayable, audit-friendly, and the
 * basis for any future gossip protocol that wants the underlying
 * evidence rather than the materialised aggregate.
 */
export interface ReviewEvent {
  readonly review_id: string;
  readonly ask_id?: string;
  readonly reviewer_did: ReviewerDid;
  readonly subject_keys: readonly SubjectKey[];
  readonly target_peer_id: PeerIdRef;
  readonly satisfaction_score: number;
  readonly weight: number;                  // freshness · provenance · independence
  readonly created_at: Iso;
}

/**
 * The full on-disk state. The store layer's load/save operates on
 * this shape; the rest of the system never reads or writes it
 * directly.
 */
export interface PeerReputationFile {
  readonly version: 1;
  readonly local_peer_id: PeerIdRef;
  readonly updated_at: Iso;
  readonly subjects: Readonly<Record<SubjectKey, SubjectAggregate>>;
  readonly reviews: readonly ReviewEvent[];
}

// ─────────────── tunables ─────────────────

/**
 * Bayesian prior — pulls every score toward 0.5 when evidence is
 * thin. `PRIOR_WEIGHT` is the equivalent number of "phantom" reviews
 * with score 0.5 the system credits before any real review lands.
 *
 * 3 is small enough that two real reviews already shift the
 * posterior, large enough that one freak 0.95 review can't catapult
 * an unknown peer above an established one.
 */
export const PRIOR_MEAN = 0.5;
export const PRIOR_WEIGHT = 3;

/**
 * Default windows for staleness + decay. Matches the system room
 * conventions (research = 7-day stale-window, toolshed = 30 days).
 * Per-subject overrides land on the SubjectAggregate later.
 */
export const DEFAULT_STALE_AFTER_DAYS = 30;
export const DEFAULT_DECAY_HALF_LIFE_DAYS = 45;

/**
 * Load penalty — number of recent asks to a peer that halves their
 * rank. `load_factor = 1 / (1 + recent / LOAD_HALF_AT)`. Picking 3
 * means: 0 recent asks → load_factor 1.0; 3 → 0.5; 9 → 0.25.
 *
 * The asker decides "recent" in their sliding-window count; this
 * module only takes the count and turns it into a multiplier.
 */
export const LOAD_HALF_AT = 3;

// ─────────────── pure helpers ─────────────

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * Decay multiplier for an event of `age_days`. Half-life is
 * `half_life_days`. `freshness(0) = 1`, `freshness(half) = 0.5`,
 * `freshness(2·half) = 0.25`. Pure function of the inputs.
 */
export const freshness = (age_days: number, half_life_days: number): number => {
  if (!Number.isFinite(age_days) || age_days <= 0) return 1;
  if (half_life_days <= 0) return 1;
  return Math.pow(0.5, age_days / half_life_days);
};

/**
 * Load multiplier — sigmoid-like decay as `recent` rises.
 * `recent=0 → 1.0`, `recent=LOAD_HALF_AT → 0.5`, etc.
 */
export const loadMultiplier = (recent: number): number => {
  if (!Number.isFinite(recent) || recent <= 0) return 1;
  return 1 / (1 + recent / LOAD_HALF_AT);
};

/**
 * Days between two ISO timestamps, clamped at 0. Tolerant to bad
 * input — returns 0 for malformed strings rather than NaN.
 */
export const ageDaysBetween = (then: Iso, now: Iso): number => {
  const t = Date.parse(then);
  const n = Date.parse(now);
  if (Number.isNaN(t) || Number.isNaN(n)) return 0;
  return Math.max(0, (n - t) / 86_400_000);
};

// ─────────────── score derivation ─────────

/**
 * Recompute `posterior_mean`, `confidence`, and `rank_score` from the
 * stored running totals. Pure function — used both right after an
 * update and at read time when we want a fresh `freshness` factor
 * without rewriting state.
 *
 * `recent_asks` is the asker's count in the local sliding window;
 * pass 0 if the caller doesn't track load (the multiplier becomes 1).
 */
export const deriveScore = (
  weighted_sum: number,
  weighted_review_count: number,
  age_of_last_answer_days: number,
  recent_asks_in_window: number,
  half_life_days: number = DEFAULT_DECAY_HALF_LIFE_DAYS,
): { posterior_mean: number; confidence: number; rank_score: number } => {
  const k = PRIOR_WEIGHT;
  const w = weighted_review_count;
  const posterior_mean = clamp01((k * PRIOR_MEAN + weighted_sum) / (k + w));
  const confidence = w / (w + k);
  const fresh = freshness(age_of_last_answer_days, half_life_days);
  const load = loadMultiplier(recent_asks_in_window);
  const rank_score = posterior_mean * confidence * fresh * load;
  return { posterior_mean, confidence, rank_score };
};

// ─────────────── observation update ───────

export interface RecordObservationInput {
  readonly target_peer_id: PeerIdRef;
  readonly subject_key: SubjectKey;
  readonly subject_label: string;
  readonly subject_kind: 'entity' | 'room';
  readonly reviewer_did: ReviewerDid;
  readonly satisfaction_score: number;       // 0..1 from peer-telemetry scorer
  readonly review_weight?: number;           // freshness · provenance · independence
  readonly now?: Iso;                        // testing seam
  readonly stale_after_days?: number;
  readonly decay_half_life_days?: number;
}

/**
 * Apply one new observation to a `PeerSubjectScore`. Pure: returns a
 * new object, never mutates inputs. Caller persists the result via
 * the store layer.
 *
 * Math:
 *   - New review's weight is clamped to [0, 1]; default 1.0.
 *   - Reviewer bucket is upserted so a single reviewer can't be
 *     amplified by being relayed through multiple peers later.
 *   - Running sums are updated; `posterior_mean`, `confidence`, and
 *     `rank_score` are derived from those sums (see `deriveScore`).
 *
 * `recent_asks_in_window` is NOT a property of an observation — it's
 * a property of the *current* read. We pass 0 here so the persisted
 * `rank_score` reflects the "no recent load" view; the federated
 * search ranker re-derives a load-adjusted rank_score at query time.
 */
export const recordObservation = (
  prev: PeerSubjectScore | undefined,
  input: RecordObservationInput,
): PeerSubjectScore => {
  const now = input.now ?? new Date().toISOString();
  const w = clamp01(input.review_weight ?? 1.0);
  const score = clamp01(input.satisfaction_score);
  const stale = input.stale_after_days ?? DEFAULT_STALE_AFTER_DAYS;
  const halfLife = input.decay_half_life_days ?? DEFAULT_DECAY_HALF_LIFE_DAYS;

  const baseSum = prev?.weighted_sum ?? 0;
  const baseSumSquares = prev?.weighted_sum_squares ?? 0;
  const baseCount = prev?.weighted_review_count ?? 0;
  const baseRaw = prev?.raw_review_count ?? 0;

  const weighted_sum = baseSum + w * score;
  const weighted_sum_squares = baseSumSquares + w * score * score;
  const weighted_review_count = baseCount + w;
  const raw_review_count = baseRaw + 1;

  // Reviewer bucket — upsert.
  const existingReviewer = prev?.reviewers?.[input.reviewer_did];
  const reviewerBucket: ReviewerEvidence = {
    weighted_count: (existingReviewer?.weighted_count ?? 0) + w,
    weighted_sum: (existingReviewer?.weighted_sum ?? 0) + w * score,
    last_review_at: now,
  };
  const reviewers = {
    ...(prev?.reviewers ?? {}),
    [input.reviewer_did]: reviewerBucket,
  };

  // Persisted score uses zero recent-asks (load is asker-time only).
  const derived = deriveScore(
    weighted_sum,
    weighted_review_count,
    0,                   // age — last answer is now, so 0 days
    0,                   // load — re-derived at query time
    halfLife,
  );

  return {
    posterior_mean: derived.posterior_mean,
    confidence: derived.confidence,
    rank_score: derived.rank_score,
    weighted_review_count,
    raw_review_count,
    weighted_sum,
    weighted_sum_squares,
    first_review_at: prev?.first_review_at ?? now,
    last_review_at: now,
    last_answer_at: now,
    stale_after_days: stale,
    decay_half_life_days: halfLife,
    reviewers,
  };
};

// ─────────────── ranking helpers ──────────

/**
 * Produce a ranking score for a candidate peer at query time, applied
 * after the asker's load-window count is known. This is what the
 * federated-search ordering hook calls.
 */
export const peerRankAt = (
  score: PeerSubjectScore,
  now: Iso,
  recent_asks_in_window: number,
): number => {
  const age = ageDaysBetween(score.last_answer_at, now);
  const derived = deriveScore(
    score.weighted_sum,
    score.weighted_review_count,
    age,
    recent_asks_in_window,
    score.decay_half_life_days,
  );
  return derived.rank_score;
};

/**
 * Sort a peer set for a given subject, descending by rank-at-now.
 * Peers with no observations on the subject get a `null` score and
 * appear at the END — but the caller is expected to mix in
 * exploration (epsilon-greedy) so unknown peers still get sampled.
 *
 * `recent_asks_per_peer` is a per-peer-id sliding-window count; pass
 * an empty Map to disable load-aware ranking.
 */
export const rankPeersForSubject = (
  agg: SubjectAggregate | undefined,
  candidate_peer_ids: readonly PeerIdRef[],
  now: Iso,
  recent_asks_per_peer: ReadonlyMap<PeerIdRef, number>,
): Array<{ peer_id: PeerIdRef; rank: number | null }> => {
  if (!agg) {
    return candidate_peer_ids.map((p) => ({ peer_id: p, rank: null }));
  }
  return candidate_peer_ids
    .map((p) => {
      const s = agg.peer_scores[p];
      if (!s) return { peer_id: p, rank: null };
      const recent = recent_asks_per_peer.get(p) ?? 0;
      return { peer_id: p, rank: peerRankAt(s, now, recent) };
    })
    .sort((a, b) => {
      if (a.rank === null && b.rank === null) return 0;
      if (a.rank === null) return 1;       // unknowns last
      if (b.rank === null) return -1;
      return b.rank - a.rank;              // higher rank first
    });
};

// ─────────────── empty-state helpers ──────

export const emptyFile = (local_peer_id: PeerIdRef): PeerReputationFile => ({
  version: 1,
  local_peer_id,
  updated_at: new Date().toISOString(),
  subjects: {},
  reviews: [],
});
