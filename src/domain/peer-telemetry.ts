/**
 * Peer-pull telemetry — the record emitted every time folklore
 * answers a query that touches peers, surfaced into the agent session
 * (Claude Code / Codex / Gemini / opencode / any MCP host).
 *
 * Pure data + a v1 satisfaction scorer. No I/O, no side effects.
 * The scorer is intentionally simple and deterministic — it ships a
 * usable number today while the protocol-quality work in
 * docs/PROTOCOL-QUALITY-QUESTIONS.md catches up.
 */

import type { CoverageMap } from './coverage.js';

// ─────────────── records ───────────────────

/**
 * One enriched search hit, augmented with the metadata the satisfaction
 * scorer cares about. The federated-search caller is responsible for
 * pulling these fields off the graph repo before scoring — the scorer
 * stays pure.
 */
export interface EnrichedMatch {
  readonly node_id: string;
  readonly distance: number;
  /** null = local, peerId string = arrived from this peer */
  readonly source_peer: string | null;
  /** other peers that returned the same node (deduped) */
  readonly also_from_peers: readonly string[];
  readonly source_uri?: string;
  readonly fetched_at?: string;       // ISO-8601
  readonly age_days?: number;         // computed against `now`
  readonly has_signature?: boolean;
  /**
   * Stale-window for this node, in days. Used to decide whether
   * `age_days > stale` triggers a staleness penalty. V5: a single
   * global default (see DEFAULT_STALE_AFTER_DAYS) — no longer
   * per-room.
   */
  readonly stale_after_days?: number;
}

/**
 * One row of the satisfaction trace — a single scorer component, its
 * value in [0,1], whether its underlying signal was observable, and the
 * weight it carried in the aggregate (0 when unobserved, since the
 * aggregator drops unobserved components rather than averaging a prior).
 * This is the load-bearing explainability surface: a denial must be
 * traceable back to exactly which components drove the score.
 */
export type ComponentName = 'retrieval' | 'freshness' | 'provenance' | 'consensus' | 'signature';

/** The five scorer components, in stable trace order. */
export const COMPONENT_NAMES: readonly ComponentName[] = [
  'retrieval',
  'freshness',
  'provenance',
  'consensus',
  'signature',
] as const;

export interface ComponentTrace {
  readonly name: ComponentName;
  readonly value: number;             // 0.0 — 1.0
  readonly observed: boolean;
  readonly weight: number;            // 0.0 — 1.0 (0 when unobserved)
}

export interface SatisfactionScore {
  readonly score: number;             // 0.0 — 1.0
  readonly fresh_count: number;
  readonly stale_count: number;
  readonly unsigned_count: number;
  readonly missing_provenance_count: number;
  readonly distinct_origins: number;
  readonly reasons: readonly string[];
  readonly penalties: readonly string[];
  /** Per-component breakdown — the satisfaction trace (RFC-0003). */
  readonly components: readonly ComponentTrace[];
  /**
   * How many of the five components (retrieval, freshness, provenance,
   * consensus, signature) had observable input. Drives the decision-
   * picker's "shallow evidence" demotion — when fewer than 4 of 5
   * signals are visible, `use_memory` is downgraded to
   * `verify_one_source` regardless of base score (codex review M2 —
   * local-only thresholds were undefensible because consensus is a
   * carve-out and signature is unobservable on a stand-alone node).
   */
  readonly observed_components: number;
}

/**
 * The breakpoint decision the protocol-quality thinking surface
 * (docs/PROTOCOL-QUALITY-QUESTIONS.md) describes — six paths the
 * agent can take. v1 always emits `use_memory` as a stable contract
 * placeholder so v2 can specialise without breaking callers that
 * type-narrow on this field.
 *
 * Stability promise: this string set may grow but existing values
 * keep their semantics. Callers should default-route on unknown
 * values (treat as `unknown`) rather than throwing.
 */
export type AgentDecision =
  | 'use_memory'
  | 'verify_one_source'
  | 'search_required'
  | 'refetch'
  | 'consensus_check'
  | 'ask_user'
  | 'unknown';

/**
 * The full record handed to the formatter and surfaced into agent
 * sessions. JSON-safe — the same shape goes into MCP responses, the
 * smart-hook additionalContext, and CLI block output.
 */
export interface PeerPullTelemetry {
  readonly query: string;
  readonly took_ms: number;
  readonly took_local_ms: number;
  readonly took_merge_ms: number;
  readonly bytes_received: number;
  readonly result_count: number;
  readonly distinct_sources: number;
  readonly peers_alive: number;
  readonly peers_queried: number;
  readonly peers_responded: number;
  readonly peers_timed_out: number;
  readonly peers_errored: number;
  readonly satisfaction: SatisfactionScore;
  /**
   * The recommended action surfaced to the agent. v1 picks from a
   * threshold table on satisfaction.score (use_memory ≥ 0.85,
   * verify_one_source ≥ 0.65, search_required ≥ 0.40, otherwise
   * ask_user). v2 will overlay task-risk / coverage-map signals.
   * Adding the field NOW means v2 won't trigger a flag day on
   * agent prompts.
   */
  readonly decision: AgentDecision;
  /**
   * Query-term coverage map (RFC-0003) — populated only at borderline
   * decisions (verify_one_source / search_required), where it scopes a
   * constrained next search; null for clear use_memory / ask_user calls.
   */
  readonly coverage_map: CoverageMap | null;
  readonly emitted_at: string;        // ISO-8601
}

// ─────────────── v1 satisfaction scorer ────

/**
 * Components of the v1 score. Each contributes a value in [0, 1] and
 * is averaged with the others. Penalties subtract from the average.
 *
 * - `retrieval`     : top-3 cosine strength (1 - distance, clamped)
 * - `freshness`     : fraction of nodes inside their stale-window
 * - `provenance`    : fraction of nodes with source_uri AND fetched_at
 * - `consensus`     : 1 if at least 2 distinct origins, else 0.5,
 *                     unless single-origin re-share detected (then 0.2)
 * - `signature`     : fraction of nodes with verified signature chain
 *                     (when room policy supplies has_signature)
 *
 * Penalties (subtractive, clamped at 0.4 total):
 * - missing fetched_at on > half of results
 * - all evidence from one origin (sybil-like re-share signature)
 * - top hit distance > 1.5 (semantic adjacency without answer fit)
 */

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);

/**
 * One scorer component — `value` is in [0,1]; `observed=false` means
 * the underlying signal is missing (no age, no signature info, etc.).
 * The aggregator drops unobserved components instead of averaging
 * a constant 0.5 prior, which previously inflated the floor on
 * low-data result sets (caught in code review).
 */
interface Component {
  readonly value: number;
  readonly observed: boolean;
}

interface Components {
  readonly retrieval: Component;
  readonly freshness: Component;
  readonly provenance: Component;
  readonly consensus: Component;
  readonly signature: Component;
}

const NIL: Component = { value: 0, observed: false };

const computeComponents = (results: readonly EnrichedMatch[]): Components => {
  if (results.length === 0) {
    return { retrieval: NIL, freshness: NIL, provenance: NIL, consensus: NIL, signature: NIL };
  }

  // Retrieval — top-3 average of (1 − distance), clamped to [0,1].
  // Always observed when any results exist.
  const top3 = results.slice(0, 3);
  const retrieval: Component = {
    value: top3.reduce((acc, r) => acc + clamp01(1 - r.distance), 0) / top3.length,
    observed: true,
  };

  // Freshness — observed iff at least one result has a known age.
  const fresh = results.filter((r) => {
    if (r.age_days === undefined) return false;
    const limit = r.stale_after_days ?? 14;
    return r.age_days <= limit;
  }).length;
  const ageKnown = results.filter((r) => r.age_days !== undefined).length;
  const freshness: Component =
    ageKnown === 0 ? NIL : { value: fresh / ageKnown, observed: true };

  // Provenance — always observed (any node either has source_uri+fetched_at or not).
  const provenance: Component = {
    value: results.filter((r) => r.source_uri && r.fetched_at).length / results.length,
    observed: true,
  };

  // Consensus — distinct origins among the result set.
  // ALL-LOCAL ('source_peer' is null on every match): consensus is
  // not meaningfully testable — it's the user's own corpus, by
  // definition single-origin. We treat this as "consensus not
  // applicable" (component stays 1.0) rather than penalising the
  // user for not having peers connected. The single-origin
  // *penalty* below is also gated on remote presence.
  // ANY-REMOTE: penalise the case where every remote arrived from
  // one peer (possible re-share / sybil), reward the case where
  // multiple distinct peers converge on the same evidence.
  const origins = new Set<string>();
  let hasRemote = false;
  for (const r of results) {
    if (r.source_peer !== null) hasRemote = true;
    origins.add(r.source_peer ?? 'local');
    for (const also of r.also_from_peers) {
      if (also !== 'local') hasRemote = true;
      origins.add(also);
    }
  }
  const consensus: Component = hasRemote
    ? { value: origins.size >= 2 ? 1 : 0.5, observed: true }
    : { value: 1, observed: true };

  // Signature — observed iff at least one result reported has_signature.
  const sigKnown = results.filter((r) => r.has_signature !== undefined).length;
  const signature: Component =
    sigKnown === 0
      ? NIL
      : {
          value: results.filter((r) => r.has_signature === true).length / sigKnown,
          observed: true,
        };

  return { retrieval, freshness, provenance, consensus, signature };
};

export const computeSatisfaction = (
  results: readonly EnrichedMatch[],
): SatisfactionScore => {
  const reasons: string[] = [];
  const penalties: string[] = [];

  const components = computeComponents(results);
  // Weighted average over OBSERVED components only — unknown signals
  // contribute zero weight (and zero value), so a low-data result set
  // can't be inflated by counting "I don't know" priors as positive
  // evidence. With only retrieval observed, a 0.7 retrieval result
  // scores 0.7 base instead of the previous (0.7 + 0.5 + 0 + 0.5 + 0.5)/5 = 0.44.
  const observed = [
    components.retrieval,
    components.freshness,
    components.provenance,
    components.consensus,
    components.signature,
  ].filter((c) => c.observed);
  const base =
    observed.length === 0 ? 0 : observed.reduce((s, c) => s + c.value, 0) / observed.length;

  // Tally diagnostics
  const fresh_count = results.filter((r) => {
    if (r.age_days === undefined) return false;
    const limit = r.stale_after_days ?? 14;
    return r.age_days <= limit;
  }).length;
  const stale_count = results.filter((r) => {
    if (r.age_days === undefined) return false;
    const limit = r.stale_after_days ?? 14;
    return r.age_days > limit;
  }).length;
  const unsigned_count = results.filter((r) => r.has_signature === false).length;
  const missing_provenance_count = results.filter(
    (r) => !r.source_uri || !r.fetched_at,
  ).length;

  const origins = new Set<string>();
  for (const r of results) {
    origins.add(r.source_peer ?? 'local');
    for (const also of r.also_from_peers) origins.add(also);
  }
  const distinct_origins = origins.size;

  // Reasons (positives) ────────────────────────────────────
  if (results.length > 0 && results[0].distance < 0.3) {
    reasons.push('top hit very close (d < 0.3)');
  }
  if (fresh_count > 0) reasons.push(`${fresh_count} fresh node${fresh_count === 1 ? '' : 's'}`);
  if (distinct_origins >= 2) reasons.push(`${distinct_origins} distinct origins`);
  if (components.provenance.observed && components.provenance.value >= 0.8) {
    reasons.push('strong provenance coverage');
  }

  // Penalties (subtractive, capped at 0.4) ─────────────────
  let penaltyTotal = 0;
  if (missing_provenance_count > results.length / 2) {
    penalties.push('majority of results lack source_uri or fetched_at');
    penaltyTotal += 0.15;
  }
  // Single-origin penalty only fires when there's at least one
  // remote source AND every remote collapses to one peer. Pure-
  // local result sets (source_peer === null) are NOT penalised —
  // "local" isn't a re-share, it's the user's own corpus.
  const hasRemoteForPenalty = results.some(
    (r) =>
      r.source_peer !== null ||
      r.also_from_peers.some((p) => p !== 'local'),
  );
  if (
    results.length > 0 &&
    distinct_origins === 1 &&
    hasRemoteForPenalty
  ) {
    penalties.push('single remote origin — possible re-share without independence');
    penaltyTotal += 0.15;
  }
  if (results.length > 0 && results[0].distance > 1.5) {
    penalties.push('top hit semantically adjacent only (d > 1.5)');
    penaltyTotal += 0.2;
  }
  if (stale_count > fresh_count && (fresh_count + stale_count) > 0) {
    penalties.push('more stale results than fresh');
    penaltyTotal += 0.1;
  }
  const penalty = Math.min(penaltyTotal, 0.4);
  const score = clamp01(base - penalty);

  // Trace — each component's value, observability, and the weight it
  // carried in the aggregate (equal split across observed components,
  // 0 for unobserved). Order is stable for deterministic rendering.
  const weight = observed.length === 0 ? 0 : 1 / observed.length;
  const trace: ComponentTrace[] = (
    [
      ['retrieval', components.retrieval],
      ['freshness', components.freshness],
      ['provenance', components.provenance],
      ['consensus', components.consensus],
      ['signature', components.signature],
    ] as const
  ).map(([name, c]) => ({
    name,
    value: Math.round(c.value * 100) / 100,
    observed: c.observed,
    weight: c.observed ? Math.round(weight * 100) / 100 : 0,
  }));

  return {
    score: Math.round(score * 100) / 100,
    fresh_count,
    stale_count,
    unsigned_count,
    missing_provenance_count,
    distinct_origins,
    reasons,
    penalties,
    components: trace,
    observed_components: observed.length,
  };
};

// ─────────────── learned component weights (RFC-0003 OQ#5 R&D) ──

/**
 * A per-component weight vector. Always carries all five components so
 * downstream aggregation is total; weights are non-negative and sum to 1.
 */
export type ComponentWeights = Readonly<Record<ComponentName, number>>;

/**
 * The hand-tuned baseline: equal weight across all five components. This
 * is the exact behaviour `computeSatisfaction` ships today — it splits the
 * weight equally across the OBSERVED components, which for a full result
 * set is 1/5 each. `learnWeights` returns THIS unchanged whenever there is
 * not enough labelled signal to do better, so the default stays identical.
 */
export const DEFAULT_COMPONENT_WEIGHTS: ComponentWeights = {
  retrieval: 0.2,
  freshness: 0.2,
  provenance: 0.2,
  consensus: 0.2,
  signature: 0.2,
} as const;

/**
 * A single labelled training row for the weight learner: per-component
 * values plus a binary `satisfied` target. `satisfied=true` means the
 * decision was vindicated (good_skip / good_search), `false` means it was
 * wrong (bad_skip). Receipts whose outcome is `unlabelled` are NOT training
 * rows — the caller must drop them before calling, and `learnWeights` also
 * defends against them. This keeps the honesty invariant at the type level:
 * a row only exists when a real label exists.
 */
export interface LabeledSample {
  /** Component value in [0,1] keyed by name; missing key = unobserved. */
  readonly values: Partial<Record<ComponentName, number>>;
  readonly satisfied: boolean;
}

export interface LearnWeightsOptions {
  /**
   * Minimum labelled samples required before learning at all. Below this,
   * the degenerate fallback returns DEFAULT_COMPONENT_WEIGHTS. Default 8 —
   * enough that a Fisher ratio isn't dominated by a single row.
   */
  readonly minSamples?: number;
  /**
   * Minimum samples in EACH class (satisfied / unsatisfied). A separation
   * statistic is meaningless when one class is empty or tiny. Default 3.
   */
  readonly minPerClass?: number;
  /** Floor weight kept for every component so none is fully zeroed. Default 0.02. */
  readonly floor?: number;
}

export interface LearnWeightsResult {
  readonly weights: ComponentWeights;
  /** True when real learning happened; false when the fallback fired. */
  readonly learned: boolean;
  /** Human-readable reason the fallback fired (empty when learned). */
  readonly fallback_reason: string;
  /** How many labelled samples were actually used. */
  readonly samples_used: number;
}

const meanOf = (xs: readonly number[]): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

const varianceOf = (xs: readonly number[], mu: number): number =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + (b - mu) * (b - mu), 0) / xs.length;

/**
 * Derive component weights from labelled samples — the calibration the
 * hand-tuned equal split is a placeholder for. Pure, deterministic,
 * dependency-free.
 *
 * Method — a Fisher-style discriminant score per component. For each
 * component we look only at the rows where it was observed, split them by
 * the `satisfied` label, and measure how cleanly its value separates the
 * two classes:
 *
 *     fisher(c) = (mean_sat − mean_unsat)² / (var_sat + var_unsat + ε)
 *
 * A component whose value is high for satisfied decisions and low for
 * unsatisfied ones (or vice-versa) gets a large ratio → it earns weight.
 * A component that looks the same in both classes (no discriminative
 * power) gets ~0 → it earns almost nothing. The raw ratios are floored,
 * then L1-normalised to a proper weight vector that sums to 1. This is a
 * standard, defensible, closed-form feature-importance estimator — no
 * iteration, no learning rate, fully reproducible from the same input.
 *
 * Fallback (returns DEFAULT_COMPONENT_WEIGHTS, `learned=false`) when:
 *  - fewer than `minSamples` labelled rows, or
 *  - either class has fewer than `minPerClass` rows, or
 *  - every component is degenerate (no separation anywhere) — there is
 *    no signal to prefer one component over another, so the honest answer
 *    is the equal split, not a vector hallucinated from noise.
 */
export const learnWeights = (
  samples: readonly LabeledSample[],
  opts?: LearnWeightsOptions,
): LearnWeightsResult => {
  const minSamples = opts?.minSamples ?? 8;
  const minPerClass = opts?.minPerClass ?? 3;
  const floor = opts?.floor ?? 0.02;

  const fallback = (reason: string): LearnWeightsResult => ({
    weights: DEFAULT_COMPONENT_WEIGHTS,
    learned: false,
    fallback_reason: reason,
    samples_used: samples.length,
  });

  if (samples.length < minSamples) {
    return fallback(`only ${samples.length} labelled samples (need ≥ ${minSamples})`);
  }
  const sat = samples.filter((s) => s.satisfied);
  const unsat = samples.filter((s) => !s.satisfied);
  if (sat.length < minPerClass || unsat.length < minPerClass) {
    return fallback(
      `class imbalance: ${sat.length} satisfied / ${unsat.length} unsatisfied (need ≥ ${minPerClass} each)`,
    );
  }

  const EPS = 1e-6;
  const fisher: Record<ComponentName, number> = {
    retrieval: 0,
    freshness: 0,
    provenance: 0,
    consensus: 0,
    signature: 0,
  };
  for (const name of COMPONENT_NAMES) {
    const sVals = sat
      .map((s) => s.values[name])
      .filter((v): v is number => v !== undefined);
    const uVals = unsat
      .map((s) => s.values[name])
      .filter((v): v is number => v !== undefined);
    // Need both classes represented for THIS component to separate it.
    if (sVals.length === 0 || uVals.length === 0) {
      fisher[name] = 0;
      continue;
    }
    const muS = meanOf(sVals);
    const muU = meanOf(uVals);
    const between = (muS - muU) * (muS - muU);
    const within = varianceOf(sVals, muS) + varianceOf(uVals, muU);
    fisher[name] = between / (within + EPS);
  }

  const rawTotal = COMPONENT_NAMES.reduce((a, n) => a + fisher[n], 0);
  if (rawTotal <= EPS) {
    return fallback('no component separates satisfied from unsatisfied — degenerate signal');
  }

  // Floor each component so none is fully zeroed (keeps the aggregator
  // total even when a component briefly looks useless), then L1-normalise.
  const floored: Record<ComponentName, number> = {
    retrieval: 0,
    freshness: 0,
    provenance: 0,
    consensus: 0,
    signature: 0,
  };
  for (const n of COMPONENT_NAMES) floored[n] = fisher[n] / rawTotal + floor;
  const flTotal = COMPONENT_NAMES.reduce((a, n) => a + floored[n], 0);
  const weights: ComponentWeights = {
    retrieval: floored.retrieval / flTotal,
    freshness: floored.freshness / flTotal,
    provenance: floored.provenance / flTotal,
    consensus: floored.consensus / flTotal,
    signature: floored.signature / flTotal,
  };

  return {
    weights,
    learned: true,
    fallback_reason: '',
    samples_used: samples.length,
  };
};

/**
 * Re-aggregate a computed satisfaction trace under a learned weight
 * vector. Pure. The default scorer averages observed components equally;
 * this lets a caller (behind a flag — see `scoreWithWeights`) re-weight
 * the SAME observed component values without recomputing them.
 *
 * Only observed components contribute (the honesty rule the base scorer
 * already enforces — unknown signals get zero weight, never a prior). The
 * learned weights are renormalised over just the observed set so the
 * result stays in [0,1] regardless of which signals were visible.
 */
export const reweightScore = (
  components: readonly ComponentTrace[],
  weights: ComponentWeights,
): number => {
  const observed = components.filter((c) => c.observed);
  if (observed.length === 0) return 0;
  const wTotal = observed.reduce((a, c) => a + weights[c.name], 0);
  if (wTotal <= 0) {
    // Every observed component had zero learned weight — fall back to the
    // equal average rather than dividing by zero.
    return observed.reduce((a, c) => a + c.value, 0) / observed.length;
  }
  const blended = observed.reduce((a, c) => a + c.value * weights[c.name], 0) / wTotal;
  return clamp01(blended);
};

// ─────────────── agent contract (RFC-0003) ──

/**
 * Task risk tier — the same satisfaction score should not authorise the
 * same skip everywhere (RFC-0003 OQ#2, the doc's "Breakpoints By Risk"
 * table). Higher risk raises the breakpoint: peer/cached memory is
 * treated as context, not as a final answer.
 *
 * - `low`      : routine coding/recall — skip search at a high score.
 * - `elevated` : version/dependency/upgrade work — verify a source even
 *                at a high score (freshness matters, drift is silent).
 * - `high`     : security, auth/crypto, medical, legal, financial — never
 *                skip on memory alone; a live/primary source is required.
 */
export type TaskRisk = 'low' | 'elevated' | 'high';

const HIGH_RISK = /\b(securit|vulnerab|\bcve\b|exploit|auth|oauth|password|secret|token|crypto|encrypt|tls|ssl|medical|health|dosage|symptom|legal|lawsuit|liabilit|compliance|gdpr|hipaa|financ|tax|invest|payment|kyc|aml)/i;
const ELEVATED_RISK = /\b(upgrade|migrat|version|dependenc|deprecat|breaking change|bump|lockfile|release note|patch|rollback)/i;

/**
 * Classify a query's task risk from its text. Deterministic keyword
 * heuristic — no LLM — so a denial's risk tier is reproducible and
 * argued-about, matching the rest of the transparent scorer. High beats
 * elevated beats low.
 */
export const classifyRisk = (query: string): TaskRisk => {
  if (HIGH_RISK.test(query)) return 'high';
  if (ELEVATED_RISK.test(query)) return 'elevated';
  return 'low';
};

/**
 * The explicit decision contract handed to the agent for every
 * breakpoint — the protocol's answer to "context is not evidence."
 * Instead of returning top-k chunks, Folklore returns a recommendation
 * the agent can act on, with the reasoning that produced it. JSON-safe;
 * the same shape flows into MCP responses, the smart-hook
 * additionalContext, and CLI output.
 *
 * Stability: `decision` follows the AgentDecision growth promise
 * (existing values keep their semantics; default-route on unknown).
 */
export interface AgentContract {
  readonly decision: AgentDecision;
  /** Imperative next move for the agent, e.g. "use memory; no web search needed". */
  readonly recommended_action: string;
  readonly score: number;
  /** Positive evidence that lifted the score (mirrors satisfaction.reasons). */
  readonly reasons: readonly string[];
  /** Negative signals that held it down (mirrors satisfaction.penalties). */
  readonly penalties: readonly string[];
  /** The per-component satisfaction trace that produced the score. */
  readonly trace: readonly ComponentTrace[];
  /**
   * Whether a shadow web search would still be worth running to measure
   * a possible bad-skip. False only for a confident `use_memory`; true
   * for every escalating decision — the doc's bad-skip instrumentation.
   */
  readonly would_shadow_search: boolean;
  /** The task-risk tier that shaped the decision (default `low`). */
  readonly risk: TaskRisk;
  /** One-line human contract: what was found, how fresh, the call. */
  readonly summary: string;
}

/** Thresholds for the score → decision breakpoint table (RFC-0003). */
export const CONTRACT_THRESHOLDS = {
  use_memory: 0.85,
  verify_one_source: 0.65,
  search_required: 0.4,
} as const;

const ACTION_TEXT: Record<AgentDecision, string> = {
  use_memory: 'use memory; no web search needed',
  verify_one_source: 'use memory, but verify one source before acting',
  search_required: 'treat memory as hints; run a live search',
  refetch: 're-fetch the cited source before trusting it',
  consensus_check: 'evidence is single-origin; seek an independent source',
  ask_user: 'confidence is below the floor; ask the user',
  unknown: 'no decision could be derived',
};

/**
 * Map a satisfaction score to an explicit agent contract. The single
 * source of truth for the breakpoint decision — both the local `ask`
 * path and the federated peer-pull path route through here so a denial
 * is computed and explained one way.
 *
 * `shallow` (fewer than 4 of 5 components observed, or a caller-supplied
 * `shallowEvidence` flag — e.g. recall-only hits with no live search)
 * demotes a top-tier `use_memory` to `verify_one_source`: consensus is a
 * local carve-out and signature is unobservable on a stand-alone node,
 * so a high score from one or two signals is not defensible enough to
 * deny outright.
 */
export const decideContract = (
  s: SatisfactionScore,
  opts?: { readonly shallowEvidence?: boolean; readonly risk?: TaskRisk },
): AgentContract => {
  const risk: TaskRisk = opts?.risk ?? 'low';
  const shallow = (opts?.shallowEvidence ?? false) || s.observed_components < 4;
  let decision: AgentDecision;
  if (s.score >= CONTRACT_THRESHOLDS.use_memory) {
    decision = shallow ? 'verify_one_source' : 'use_memory';
  } else if (s.score >= CONTRACT_THRESHOLDS.verify_one_source) {
    decision = 'verify_one_source';
  } else if (s.score >= CONTRACT_THRESHOLDS.search_required) {
    decision = 'search_required';
  } else {
    decision = 'ask_user';
  }

  // Task-risk overlay (RFC-0003 OQ#2). The score is necessary but not
  // sufficient at higher risk: raise the breakpoint so memory can't be
  // the final word where being wrong is expensive.
  const reasons = [...s.reasons];
  if (risk === 'elevated' && decision === 'use_memory') {
    decision = 'verify_one_source';
    reasons.push('elevated-risk task — verifying a source despite a high score');
  } else if (risk === 'high' && (decision === 'use_memory' || decision === 'verify_one_source')) {
    // High-risk: peer/cached memory is context only — require a live or
    // primary source. Never silently skip on memory alone.
    decision = 'search_required';
    reasons.push('high-risk task — memory is context only, a fresh source is required');
  }

  const would_shadow_search = decision !== 'use_memory';
  const found =
    s.distinct_origins > 0
      ? `${s.distinct_origins} origin${s.distinct_origins === 1 ? '' : 's'}, ${s.fresh_count} fresh`
      : 'no evidence';
  const lead = reasons[0] ?? (s.penalties[0] ? `held back: ${s.penalties[0]}` : 'thin evidence');
  const riskTag = risk === 'low' ? '' : `[${risk} risk] `;
  const summary = `${riskTag}${found} · score ${s.score.toFixed(2)} · ${lead} → ${ACTION_TEXT[decision]}`;

  return {
    decision,
    recommended_action: ACTION_TEXT[decision],
    score: s.score,
    reasons,
    penalties: s.penalties,
    trace: s.components ?? [],
    would_shadow_search,
    risk,
    summary,
  };
};

// ─────────────── helpers ───────────────────

/**
 * Compute age_days from an ISO timestamp. Returns undefined when the
 * input is missing or malformed.
 */
export const ageInDays = (fetched_at: string | undefined, now = Date.now()): number | undefined => {
  if (!fetched_at) return undefined;
  const t = Date.parse(fetched_at);
  if (Number.isNaN(t)) return undefined;
  return Math.max(0, (now - t) / 86_400_000);
};
