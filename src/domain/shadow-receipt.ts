/**
 * Shadow-search receipts (RFC-0003 OQ#5) — the calibration substrate.
 *
 * The thresholds (0.85 / 0.65, the risk tiers) are only defensible if we
 * can measure how often a skip would have been wrong. A receipt records,
 * for every breakpoint decision, the contract that produced it plus the
 * coverage signal — a durable log that later gets labelled (human/LLM)
 * with whether the decision was right. v1 captures the decisions; the
 * auto-judge ("did a live search find a required fact the skip missed?")
 * is the open part of OQ#5 and is intentionally NOT inferred here — a
 * fabricated label is worse than an honest "unlabelled".
 *
 * Pure data + pure functions. The infra appender writes these to a
 * bounded local jsonl; nothing here does I/O.
 */

import {
  classifyRisk,
  type AgentDecision,
  type TaskRisk,
  type PeerPullTelemetry,
  type ComponentTrace,
  type LabeledSample,
  type ComponentName,
} from './peer-telemetry.js';

/**
 * The outcome label a receipt can carry. `unlabelled` is the only value
 * ever written at capture time — every other value requires a real
 * downstream signal (human review, or the abstaining auto-judge in
 * `judgeReceipt`). The honesty invariant: NEVER infer an outcome without
 * a genuine signal; a fabricated label is worse than an honest blank.
 */
export type ShadowOutcome = 'unlabelled' | 'good_skip' | 'bad_skip' | 'good_search';

export interface ShadowReceipt {
  readonly emitted_at: string;          // ISO-8601
  readonly query: string;
  readonly decision: AgentDecision;
  readonly score: number;
  readonly risk: TaskRisk;
  readonly would_shadow_search: boolean;
  readonly result_count: number;
  readonly distinct_origins: number;
  /** From the coverage map when present (borderline decisions), else null. */
  readonly coverage_ratio: number | null;
  readonly missing_terms: readonly string[];
  /**
   * The per-component satisfaction trace captured at decision time — the
   * feature vector the weight learner (`learnWeights`) trains on. Optional
   * for backward compatibility: receipts written before this field existed
   * (or by a caller that doesn't supply telemetry components) omit it, and
   * the learner safely ignores them. Carries values + observability only;
   * the captured `weight` is the equal-split weight in force at the time,
   * useful for drift inspection.
   */
  readonly components?: readonly ComponentTrace[];
  /**
   * Ground-truth label, filled later by a human/LLM pass — never inferred
   * at write time. `unlabelled` until then.
   */
  readonly outcome: ShadowOutcome;
}

/** Derive a receipt from a finished peer-pull telemetry record. Pure. */
export const buildShadowReceipt = (
  t: PeerPullTelemetry,
  now: number = Date.now(),
): ShadowReceipt => ({
  emitted_at: new Date(now).toISOString(),
  query: t.query,
  decision: t.decision,
  score: t.satisfaction.score,
  risk: classifyRisk(t.query),
  would_shadow_search: t.decision !== 'use_memory',
  result_count: t.result_count,
  distinct_origins: t.satisfaction.distinct_origins,
  coverage_ratio: t.coverage_map ? t.coverage_map.coverage_ratio : null,
  missing_terms: t.coverage_map ? t.coverage_map.missing.map((m) => m.term) : [],
  components: t.satisfaction.components,
  outcome: 'unlabelled',
});

// ─────────── shadow auto-judge (OQ#5, honest) ───────────

/**
 * The abstaining auto-judge. RFC-0003 OQ#5 asks "did a live search find a
 * required fact the skip missed?" — but we only ever have a real signal
 * for that when a coverage map exists AND the agent actually shadow-ran a
 * search. Absent a genuine signal this MUST return `null` (no label) — the
 * honesty invariant. It NEVER manufactures `good_skip`/`bad_skip` from the
 * score alone, because the score is exactly what we're trying to calibrate.
 *
 * The one signal we can read honestly, without a model, is the coverage
 * map the borderline decisions already carry:
 *
 *  - A `use_memory` skip with FULL term coverage (ratio 1, nothing missing)
 *    is a defensible `good_skip` — every required term was present in the
 *    evidence, so skipping the web didn't drop a known-required fact.
 *  - An escalating decision (would_shadow_search) that DID run the live
 *    search — signalled by the caller passing `liveSearchFoundMissing` —
 *    yields `bad_skip` if the live search surfaced a term the memory was
 *    missing, else `good_search` (the escalation was warranted but memory
 *    wasn't actually wrong about a fact, just thin).
 *
 * Everything else abstains. The caller owns the live-search signal; the
 * judge never invents it.
 */
export const judgeReceipt = (
  r: ShadowReceipt,
  signal?: {
    /** True iff a real live search ran and surfaced a term memory lacked. */
    readonly liveSearchFoundMissing?: boolean;
  },
): ShadowOutcome | null => {
  // Already labelled by a human/earlier pass — never overwrite.
  if (r.outcome !== 'unlabelled') return null;

  // A confident skip with provably-complete coverage is an honest good_skip:
  // the coverage map is a real signal, not the score.
  if (
    r.decision === 'use_memory' &&
    r.coverage_ratio === 1 &&
    r.missing_terms.length === 0
  ) {
    return 'good_skip';
  }

  // An escalating decision can only be judged when the caller actually ran
  // the live search and reports back. No report → abstain (honest blank).
  if (r.would_shadow_search && signal && signal.liveSearchFoundMissing !== undefined) {
    return signal.liveSearchFoundMissing ? 'bad_skip' : 'good_search';
  }

  // No genuine signal → abstain. NEVER fabricate from the score.
  return null;
};

/**
 * Map a binary `satisfied` target onto a receipt's outcome label. The
 * decision was vindicated (`good_skip`, `good_search`) → satisfied; it was
 * wrong (`bad_skip`) → unsatisfied. `unlabelled` rows have no target and
 * are excluded by `receiptsToSamples`.
 */
const OUTCOME_TO_SATISFIED: Readonly<Record<ShadowOutcome, boolean | null>> = {
  good_skip: true,
  good_search: true,
  bad_skip: false,
  unlabelled: null,
};

/**
 * Project labelled receipts into the learner's `LabeledSample` rows. Pure.
 * Receipts without a component trace, or still `unlabelled`, are dropped —
 * the learner only ever sees rows backed by a real label AND real features,
 * so it cannot learn from a fabricated or empty signal (honesty invariant).
 */
export const receiptsToSamples = (
  receipts: readonly ShadowReceipt[],
): readonly LabeledSample[] => {
  const out: LabeledSample[] = [];
  for (const r of receipts) {
    const satisfied = OUTCOME_TO_SATISFIED[r.outcome];
    if (satisfied === null) continue;          // unlabelled → not a training row
    if (!r.components || r.components.length === 0) continue; // no features
    const values: Partial<Record<ComponentName, number>> = {};
    for (const c of r.components) {
      if (c.observed) values[c.name] = c.value; // unobserved → omitted, not zero
    }
    if (Object.keys(values).length === 0) continue; // nothing observable
    out.push({ values, satisfied });
  }
  return out;
};

export interface ShadowSummary {
  readonly total: number;
  readonly by_decision: Readonly<Partial<Record<AgentDecision, number>>>;
  /** Fraction whose decision skipped the web (use_memory). */
  readonly skip_rate: number;
  /** Fraction flagged would_shadow_search (every escalating decision). */
  readonly would_shadow_rate: number;
  /** Mean coverage_ratio over receipts that carry one (borderline). */
  readonly avg_coverage_ratio: number | null;
  /** BadSkipRate over LABELLED receipts only; null until any are labelled. */
  readonly bad_skip_rate: number | null;
  readonly labelled: number;
}

/** Aggregate a batch of receipts into a calibration summary. Pure. */
export const summarizeReceipts = (receipts: readonly ShadowReceipt[]): ShadowSummary => {
  const total = receipts.length;
  const by_decision: Partial<Record<AgentDecision, number>> = {};
  let skips = 0;
  let wouldShadow = 0;
  let covSum = 0;
  let covN = 0;
  let labelled = 0;
  let badSkips = 0;
  for (const r of receipts) {
    by_decision[r.decision] = (by_decision[r.decision] ?? 0) + 1;
    if (r.decision === 'use_memory') skips += 1;
    if (r.would_shadow_search) wouldShadow += 1;
    if (r.coverage_ratio !== null) {
      covSum += r.coverage_ratio;
      covN += 1;
    }
    if (r.outcome !== 'unlabelled') {
      labelled += 1;
      if (r.outcome === 'bad_skip') badSkips += 1;
    }
  }
  const round = (n: number): number => Math.round(n * 1000) / 1000;
  return {
    total,
    by_decision,
    skip_rate: total === 0 ? 0 : round(skips / total),
    would_shadow_rate: total === 0 ? 0 : round(wouldShadow / total),
    avg_coverage_ratio: covN === 0 ? null : round(covSum / covN),
    bad_skip_rate: labelled === 0 ? null : round(badSkips / labelled),
    labelled,
  };
};
