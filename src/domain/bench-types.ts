/**
 * Benchmark report shapes — typed contract for every memory bench
 * suite in Phase 23. Pure domain, no I/O.
 *
 * Each suite produces a `BenchSuiteReport`. The composite runner
 * collects all reports and emits a `BenchCompositeReport` with a
 * single `composite` score computed by `composeMemoryScore`.
 *
 * Stability promise: the metric keys per suite are part of the
 * contract. A suite can add new keys but never rename or remove
 * existing ones — old reports must remain comparable.
 */

// ─────────────── suite report ─────────────

export interface BenchPerQuery {
  readonly id: string;
  readonly metric: string;
  readonly value: number;
}

export interface BenchSuiteReport {
  readonly suite: string;
  readonly metrics: Readonly<Record<string, number>>;
  readonly perQuery: readonly BenchPerQuery[];
  readonly elapsedMs: number;
  /** Optional notes — e.g. dataset version, model variant. */
  readonly notes?: string;
}

// ─────────────── composite ─────────────

/**
 * Weights for the unified memory score. Sum to 1.0.
 *
 * Provenance:
 *   - 0.25 BEIR SciFact NDCG@10 — single biggest dimension, real
 *     public benchmark with a SOTA we can defend against
 *   - 0.15 HotpotQA-style R@5 — multi-hop retrieval
 *   - 0.20 LongMemEval-S R@5 — conversational long-term recall
 *   - 0.10 LoCoMo factual F1 — temporal/causal recall
 *   - 0.10 tier-promotion F1 — folklore-specific
 *   - 0.05 Beta calibration (1 − error) — Phase 22 EU lane
 *   - 0.05 auto-forget F1 — Phase 22 lifecycle
 *   - 0.05 retention-band accuracy — Phase 22 banding
 *   - 0.05 write-gate F1 — Phase 21B
 */
export const MEMORY_SCORE_WEIGHTS = {
  beirSciFactNdcg10:        0.25,
  hotpotqaRecall5:          0.15,
  longmemevalRecall5:       0.20,
  locomoFactualF1:          0.10,
  tierPromotionF1:          0.10,
  betaCalibration:          0.05,
  autoForgetF1:             0.05,
  retentionBandAccuracy:    0.05,
  writeGateF1:              0.05,
} as const;

export type MemoryScoreKey = keyof typeof MEMORY_SCORE_WEIGHTS;

export interface BenchCompositeReport {
  readonly version: 1;
  readonly composite: number;
  readonly perDimension: Readonly<Record<MemoryScoreKey, number>>;
  readonly suites: readonly BenchSuiteReport[];
  readonly elapsedMs: number;
  readonly runAt: string;
}

// ─────────────── score composition ─────────────

/**
 * Compose the unified score. Missing dimensions contribute 0 — a
 * suite that didn't run can't pad the score.
 *
 * Total weight is always 1.0 by construction (the weights table
 * sums to 1). The composite is in [0, 1]. A bench that doesn't
 * run all suites tells you so explicitly via the per-dimension
 * row in the report.
 */
export const composeMemoryScore = (
  perDim: Partial<Record<MemoryScoreKey, number>>,
): number => {
  let total = 0;
  for (const k of Object.keys(MEMORY_SCORE_WEIGHTS) as MemoryScoreKey[]) {
    const v = perDim[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) continue;
    total += MEMORY_SCORE_WEIGHTS[k] * Math.max(0, Math.min(1, v));
  }
  return total;
};

// ─────────────── confusion-matrix helpers (for F1 suites) ─────────────

export interface ConfusionMatrix {
  readonly tp: number;
  readonly fp: number;
  readonly fn: number;
  readonly tn: number;
}

export const precision = (cm: ConfusionMatrix): number =>
  cm.tp + cm.fp > 0 ? cm.tp / (cm.tp + cm.fp) : 0;

export const recall = (cm: ConfusionMatrix): number =>
  cm.tp + cm.fn > 0 ? cm.tp / (cm.tp + cm.fn) : 0;

export const f1 = (cm: ConfusionMatrix): number => {
  const p = precision(cm);
  const r = recall(cm);
  return p + r > 0 ? (2 * p * r) / (p + r) : 0;
};

export const accuracy = (cm: ConfusionMatrix): number => {
  const total = cm.tp + cm.fp + cm.fn + cm.tn;
  return total > 0 ? (cm.tp + cm.tn) / total : 0;
};

/**
 * Macro-averaged F1 across N classes. Caller passes one ConfusionMatrix
 * per class (one-vs-rest); we mean their f1 scores. Standard macro-F1
 * for multi-class — no instance weighting.
 */
export const macroF1 = (classes: readonly ConfusionMatrix[]): number => {
  if (classes.length === 0) return 0;
  let sum = 0;
  for (const c of classes) sum += f1(c);
  return sum / classes.length;
};
