/**
 * Peer-pull telemetry — the record emitted every time wellinformed
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
  readonly room: string;
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
}

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

interface Components {
  readonly retrieval: number;
  readonly freshness: number;
  readonly provenance: number;
  readonly consensus: number;
  readonly signature: number;
}

const computeComponents = (results: readonly EnrichedMatch[]): Components => {
  if (results.length === 0) {
    return { retrieval: 0, freshness: 0, provenance: 0, consensus: 0, signature: 0 };
  }

  // Retrieval — top-3 average of (1 − distance), clamped to [0,1].
  // Cosine distance for normalised embeddings is in [0, 2]; treat
  // distances ≥ 1 as 0 retrieval signal.
  const top3 = results.slice(0, 3);
  const retrieval =
    top3.reduce((acc, r) => acc + clamp01(1 - r.distance), 0) / top3.length;

  // Freshness — node is fresh when age_days is within stale_after_days
  // (default 14 if unspecified). Missing age treated as half-fresh
  // because we don't know.
  const fresh = results.filter((r) => {
    if (r.age_days === undefined) return false;
    const limit = r.stale_after_days ?? 14;
    return r.age_days <= limit;
  }).length;
  const ageKnown = results.filter((r) => r.age_days !== undefined).length;
  const freshness = ageKnown === 0 ? 0.5 : fresh / ageKnown;

  // Provenance — both source_uri and fetched_at present
  const provenance =
    results.filter((r) => r.source_uri && r.fetched_at).length / results.length;

  // Consensus — distinct origins among (source_peer + also_from_peers).
  // null source_peer counts as 'local'.
  const origins = new Set<string>();
  for (const r of results) {
    origins.add(r.source_peer ?? 'local');
    for (const also of r.also_from_peers) origins.add(also);
  }
  const consensus = origins.size >= 2 ? 1 : 0.5;

  // Signature — fraction with verified envelope (when reported)
  const sigKnown = results.filter((r) => r.has_signature !== undefined).length;
  const sigVerified = results.filter((r) => r.has_signature === true).length;
  const signature = sigKnown === 0 ? 0.5 : sigVerified / sigKnown;

  return { retrieval, freshness, provenance, consensus, signature };
};

export const computeSatisfaction = (
  results: readonly EnrichedMatch[],
): SatisfactionScore => {
  const reasons: string[] = [];
  const penalties: string[] = [];

  const components = computeComponents(results);
  const base =
    (components.retrieval +
      components.freshness +
      components.provenance +
      components.consensus +
      components.signature) /
    5;

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
  if (components.provenance >= 0.8) reasons.push('strong provenance coverage');

  // Penalties (subtractive, capped at 0.4) ─────────────────
  let penaltyTotal = 0;
  if (missing_provenance_count > results.length / 2) {
    penalties.push('majority of results lack source_uri or fetched_at');
    penaltyTotal += 0.15;
  }
  if (results.length > 0 && distinct_origins === 1) {
    penalties.push('single origin — possible re-share without independence');
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
