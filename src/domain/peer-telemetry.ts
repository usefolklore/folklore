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

// ─────────────── records ───────────────────

/**
 * One enriched search hit, augmented with the metadata the satisfaction
 * scorer cares about. The federated-search caller is responsible for
 * pulling these fields off the graph repo before scoring — the scorer
 * stays pure.
 */
export interface EnrichedMatch {
  readonly node_id: string;
  /** V5 (Phase 24): retained as optional for backwards-compat with
   * legacy callers (telemetry display, audit logs). New callers should
   * not set this; sharing/federation are no longer room-keyed. */
  readonly room?: string;
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
   * Stale-window for this node's room (e.g. 7d for research, 30d for
   * toolshed). Used to decide whether `age_days > stale` triggers a
   * staleness penalty.
   */
  readonly stale_after_days?: number;
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
  readonly room?: string;
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
   * Reserved for v2's coverage-map output (required_facts /
   * covered / missing). Always null in v1 — present so consumers
   * can opt in incrementally.
   */
  readonly coverage_map: null;
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

  return {
    score: Math.round(score * 100) / 100,
    fresh_count,
    stale_count,
    unsigned_count,
    missing_provenance_count,
    distinct_origins,
    reasons,
    penalties,
    observed_components: observed.length,
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
