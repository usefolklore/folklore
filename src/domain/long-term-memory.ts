/**
 * Long-term memory — tier vocabulary, retention math, and Bayesian
 * reliability counters for procedural memories.
 *
 * Lives next to `consolidated-memory.ts` (which already covers the
 * episodic→semantic clustering pass shipped in Phase 4b). This module
 * adds:
 *
 *   1. A four-tier classification — observation / episodic / semantic
 *      / procedural — derived deterministically from a node's URI
 *      scheme. No I/O; just inspect the prefix.
 *   2. Retention scoring — `salience · exp(-λ·Δt) + σ·Σ(1/days_since_access)`
 *      from arxiv 2512.18950 (MACLA). Decides hot / warm / cold tier
 *      membership for ranking and forgetting decisions.
 *   3. Bayesian reliability counters — Beta(α, β) on procedural
 *      memories. Updates from user feedback signals. Expected-utility
 *      selection score combines semantic similarity, reliability, and
 *      an entropy-driven exploration bonus.
 *
 * Pure: no I/O, no clock except via injected `now` parameter, no
 * randomness. Every fallible op returns a neverthrow Result.
 *
 * What NOT to put here:
 *   - LLM summarisation calls (lives in infra SummariserProvider)
 *   - Graph node persistence (lives in graph-repository)
 *   - The auto-forget tick itself (application layer)
 */

import { Result, err, ok } from 'neverthrow';
import { ConsolidationError } from './errors.js';

// ─────────────── tiers ─────────────

/**
 * The four long-term memory tiers, ordered by abstraction level.
 *
 *   - observation: raw graph node from an ingest source (research, code,
 *     session log). Unstructured, large volume, decays fast.
 *   - episodic:    one full session compressed into a session://<sid>
 *     node. Local-only (privacy boundary).
 *   - semantic:    cross-session merged fact under synthesis://. Shared
 *     into the `toolshed` room when the user opts in.
 *   - procedural:  a recurring workflow under decision://. Shared.
 *     Carries a Beta(α, β) reliability counter that updates with
 *     feedback.
 */
export type MemoryTier = 'observation' | 'episodic' | 'semantic' | 'procedural';

/**
 * URI prefix → tier mapping. Anything else (file://, https://,
 * arxiv://, etc.) is treated as `observation`.
 *
 * Order matters in `tierForUri`: `session://` must be checked before
 * `synthesis://` even though they don't share a prefix here, to keep
 * the function shape uniform for future additions.
 */
const TIER_PREFIXES: ReadonlyArray<{ readonly prefix: string; readonly tier: MemoryTier }> = [
  { prefix: 'session://',   tier: 'episodic'   },
  { prefix: 'synthesis://', tier: 'semantic'   },
  { prefix: 'decision://',  tier: 'procedural' },
];

/**
 * Classify a node's URI into a memory tier by prefix. Pure, total.
 *
 * Returns 'observation' for any URI that doesn't match a tier prefix
 * — including raw `file://`, `https://`, `arxiv://`, and free-form ids
 * like `chunk-42`.
 */
export const tierForUri = (uri: string): MemoryTier => {
  for (const { prefix, tier } of TIER_PREFIXES) {
    if (uri.startsWith(prefix)) return tier;
  }
  return 'observation';
};

// ─────────────── beta counter ─────────────

/**
 * Beta(α, β) reliability counter for a procedural memory.
 *
 * Encodes the agent's belief about whether a procedure succeeds, in
 * the form of a Beta posterior over a Bernoulli success rate. Updates
 * by integer increments — `α += 1` on a success, `β += 1` on a
 * failure. Mean is `α/(α+β)`. Entropy is `−mean·log(mean) − (1−mean)·log(1−mean)`
 * (binary entropy of the mean — a closed-form proxy for the full
 * Beta-distribution differential entropy, which costs digamma calls
 * we don't want in a hot scorer).
 *
 * Convention: brand-new procedures start at Beta(1, 1) — uniform
 * prior, mean = 0.5, max entropy. This is the standard non-informative
 * Beta and lets the exploration bonus push the agent to *try* new
 * procedures before any feedback arrives.
 */
export interface BetaCounter {
  readonly alpha: number;
  readonly beta: number;
}

/** Default counter for a freshly-created procedural memory. */
export const initialBetaCounter = (): BetaCounter => ({ alpha: 1, beta: 1 });

/**
 * Update a counter with a single binary outcome — true = success,
 * false = failure. Returns a new counter (immutable).
 *
 * Numeric guard: caller could pass cached counters with absurd
 * values (NaN, negative). We clamp the result to the non-negative
 * regime; if a non-finite slips through we reset to the prior.
 */
export const updateBeta = (c: BetaCounter, success: boolean): BetaCounter => {
  const alpha = success ? c.alpha + 1 : c.alpha;
  const beta  = success ? c.beta      : c.beta + 1;
  if (!Number.isFinite(alpha) || !Number.isFinite(beta) || alpha < 0 || beta < 0) {
    return initialBetaCounter();
  }
  return { alpha, beta };
};

/** Posterior mean — agent's point estimate of the success rate. */
export const betaMean = (c: BetaCounter): number => {
  const total = c.alpha + c.beta;
  return total > 0 ? c.alpha / total : 0.5;
};

/**
 * Binary-entropy proxy for the Bernoulli with parameter `mean`.
 * Range: [0, ln 2] ≈ [0, 0.693]. Used as the exploration bonus in
 * `expectedUtility` — high entropy means "we have weak evidence,
 * try this procedure to learn more."
 *
 * The true Beta differential entropy involves digamma + a constant
 * we don't want in the hot path. The Bernoulli proxy peaks at the
 * same location (mean = 0.5) and decays monotonically toward 0 as
 * the mean tightens — same qualitative behaviour at a fraction of
 * the cost.
 */
export const betaEntropy = (c: BetaCounter): number => {
  const p = betaMean(c);
  if (p <= 0 || p >= 1) return 0;
  return -(p * Math.log(p) + (1 - p) * Math.log(1 - p));
};

// ─────────────── expected-utility selection ─────────────

/**
 * Inputs to the procedural-memory selection scorer.
 *
 * `similarity` is the bi-encoder (or hybrid) score between the query
 * and the procedure's text representation — already on [0, 1] after
 * cross-rerank squashing. `risk` defaults to 1.0 in Phase 21; Phase
 * 22 will derive it per procedure from past failure mode tags.
 */
export interface EuInput {
  readonly similarity: number;
  readonly counter: BetaCounter;
  readonly risk?: number;
}

export interface EuOptions {
  /** Reward on success. Default 1. */
  readonly rMax?: number;
  /** Cost on failure. Default 0.5 — failures hurt half as much as successes help. */
  readonly cFail?: number;
  /** Exploration weight (entropy bonus coefficient). Default 0.1. */
  readonly lambdaInfo?: number;
}

/**
 * MACLA Eq. 4 — expected-utility selection score for procedural
 * memories.
 *
 *   EU = sim · mean · R_max − risk · (1 − mean) · C_fail + λ_info · H[Beta]
 *
 * Where:
 *   - `mean = α / (α + β)`  is the posterior success-rate estimate
 *   - `H[Beta]` is the binary-entropy proxy from `betaEntropy`
 *   - The first term rewards similar + reliable procedures
 *   - The second term penalises similar + unreliable procedures
 *   - The third term rewards uncertainty — encourages exploration
 *
 * Returns a finite number. Use it as the procedural lane in the
 * retrieval fuser; bigger is better.
 */
export const expectedUtility = (input: EuInput, opts: EuOptions = {}): number => {
  const rMax = opts.rMax ?? 1;
  const cFail = opts.cFail ?? 0.5;
  const lambda = opts.lambdaInfo ?? 0.1;
  const risk = input.risk ?? 1;
  const mean = betaMean(input.counter);
  const entropy = betaEntropy(input.counter);
  const reward = input.similarity * mean * rMax;
  const penalty = risk * (1 - mean) * cFail;
  return reward - penalty + lambda * entropy;
};

// ─────────────── retention math ─────────────

/**
 * Per-tier base salience. Procedural > Semantic > Episodic > Observation
 * — established workflows are more valuable to keep than raw chunks.
 *
 * The agentmemory paper (arxiv 2512.18950) uses similar weights
 * keyed on memory type (architecture > pattern > preference >
 * workflow > fact). We collapse those into our tier scheme because
 * (a) our `synthesis://` already encodes the "fact vs pattern"
 * distinction in the body, and (b) the cleaner mapping is easier
 * to test.
 */
const TIER_BASE_SALIENCE: Record<MemoryTier, number> = {
  procedural:  0.85,
  semantic:    0.75,
  episodic:    0.50,
  observation: 0.30,
};

/** Bonus from access count. Caps at 0.2 to avoid runaway dominance. */
const ACCESS_BONUS = (count: number): number => Math.min(0.2, Math.max(0, count) * 0.02);

/**
 * Salience for a tier-classified memory. `baseSalience + accessBonus`,
 * clamped to [0, 1].
 */
export const salienceForTier = (tier: MemoryTier, accessCount: number): number => {
  const base = TIER_BASE_SALIENCE[tier];
  return Math.min(1, base + ACCESS_BONUS(accessCount));
};

/**
 * Retention-score input. `createdAtMs` is the node's birth timestamp
 * in epoch ms. `recentAccessMs` is the access log — every entry
 * contributes a `1 / daysSince(access)` reinforcement bonus.
 */
export interface RetentionInput {
  readonly tier: MemoryTier;
  readonly createdAtMs: number;
  readonly nowMs: number;
  readonly accessCount: number;
  readonly recentAccessMs: readonly number[];
}

export interface RetentionOptions {
  /** Temporal-decay rate. Default 0.01 — ~50% decay over 70 days. */
  readonly lambda?: number;
  /** Reinforcement weight. Default 0.3. */
  readonly sigma?: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const daysBetween = (laterMs: number, earlierMs: number): number =>
  (laterMs - earlierMs) / MS_PER_DAY;

/**
 * Retention score on [0, 1]. The MACLA formula:
 *
 *   retention = clip(0, 1,
 *       salience · exp(−λ · Δt_days)
 *     + σ · Σ(1 / daysSinceAccess(t))   for t in recentAccesses
 *   )
 *
 * Defaults: λ = 0.01, σ = 0.3. With access count 0 and no recent
 * accesses the score equals `salience · exp(−λ·Δt)`.
 *
 * Tier thresholds for downstream decisions:
 *   - retention ≥ 0.70 → hot:  promote, keep, surface eagerly
 *   - retention ≥ 0.40 → warm: keep, surface on hit
 *   - retention ≥ 0.15 → cold: keep but de-prioritise
 *   - retention <  0.15 → frozen: candidate for auto-forget
 */
export const retentionScore = (
  input: RetentionInput,
  opts: RetentionOptions = {},
): number => {
  const lambda = opts.lambda ?? 0.01;
  const sigma  = opts.sigma  ?? 0.3;
  const salience = salienceForTier(input.tier, input.accessCount);
  const ageDays = Math.max(0, daysBetween(input.nowMs, input.createdAtMs));
  const decay = Math.exp(-lambda * ageDays);
  let reinforcement = 0;
  for (const t of input.recentAccessMs) {
    if (!Number.isFinite(t) || t >= input.nowMs) continue;
    const daysSince = daysBetween(input.nowMs, t);
    if (daysSince <= 0) continue;
    reinforcement += 1 / daysSince;
  }
  const score = salience * decay + sigma * reinforcement;
  return Math.max(0, Math.min(1, score));
};

/** Coarse retention-tier classification — see `retentionScore` docs. */
export type RetentionBand = 'hot' | 'warm' | 'cold' | 'frozen';

export const retentionBand = (score: number): RetentionBand => {
  if (score >= 0.70) return 'hot';
  if (score >= 0.40) return 'warm';
  if (score >= 0.15) return 'cold';
  return 'frozen';
};

// ─────────────── tier metadata on a node ─────────────

/**
 * The bag of metadata a tier node carries on top of the base
 * GraphNode fields.
 *
 * Serialised to the existing `extra` field on graph nodes — no
 * schema migration required, no new table.
 *
 * `version` + `supersedes` capture evolution-style versioning: when
 * consolidation merges new observations into an existing semantic
 * node, we don't mutate; we emit a new node with `version` bumped
 * and a `supersedes` pointer to the parent. The old node stays
 * available for audit but is marked `isLatest = false`.
 */
export interface TierMetadata {
  readonly tier: MemoryTier;
  readonly strength: number;
  readonly accessCount: number;
  readonly lastAccessedAt: string;
  readonly forgetAfter?: string;
  readonly sources: readonly string[];
  readonly version: number;
  readonly supersedes?: readonly string[];
  readonly isLatest: boolean;
  readonly beta?: BetaCounter;
}

/**
 * Build a fresh TierMetadata for a newly-promoted node.
 *
 * Procedural tier auto-gets a Beta(1, 1) counter — the application
 * layer can override by passing an explicit counter when promoting
 * from a manual user save.
 */
export const newTierMetadata = (
  tier: MemoryTier,
  sources: readonly string[],
  nowIso: string,
  opts: { beta?: BetaCounter; forgetAfter?: string } = {},
): Result<TierMetadata, ConsolidationError> => {
  if (sources.length === 0) {
    return err(ConsolidationError.emptyInput('TierMetadata requires at least one source'));
  }
  const beta = tier === 'procedural' ? (opts.beta ?? initialBetaCounter()) : opts.beta;
  return ok({
    tier,
    strength: TIER_BASE_SALIENCE[tier],
    accessCount: 0,
    lastAccessedAt: nowIso,
    forgetAfter: opts.forgetAfter,
    sources,
    version: 1,
    isLatest: true,
    beta,
  });
};
