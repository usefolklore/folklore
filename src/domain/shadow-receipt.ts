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

import { classifyRisk, type AgentDecision, type TaskRisk, type PeerPullTelemetry } from './peer-telemetry.js';

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
   * Ground-truth label, filled later by a human/LLM pass — never inferred
   * at write time. `unlabelled` until then.
   */
  readonly outcome: 'unlabelled' | 'good_skip' | 'bad_skip' | 'good_search';
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
  outcome: 'unlabelled',
});

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
