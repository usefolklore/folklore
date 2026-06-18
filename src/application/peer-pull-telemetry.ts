/**
 * Build the agent-session telemetry record from a federated-search
 * result. Composes graph enrichment + the v1 satisfaction scorer onto
 * the wire-level numbers federated-search already collected.
 *
 * Shared by: MCP `federated_search` / `ask` tools, the PreToolUse
 * smart-hook, and `folklore ask --peers` CLI tail.
 *
 * V5 (Phase 24-03, ROOMS-DEL-05): per-peer telemetry only — the room
 * dimension was dropped 2026-05-27. Pre-V5 telemetry tracked the (peer,
 * room) tuple so the agent could surface "this peer was strong in
 * research, weak in toolshed"; V5 collapses that to a per-peer signal
 * because the room abstraction no longer exists. The peer dimension is
 * what actually drives reputation — the room dimension was extra
 * detail that became dead weight when rooms vanished.
 *
 * Open Question 5 (RESOLVED): rewrite per-peer, do not delete. The
 * per-peer signal still matters for reputation and consensus scoring;
 * only the room slice goes away.
 */

import type { FederatedSearchResult } from './federated-search.js';
import type { Graph } from '../domain/graph.js';
import { getNode } from '../domain/graph.js';
import {
  computeSatisfaction,
  decideContract,
  classifyRisk,
  ageInDays,
  type EnrichedMatch,
  type PeerPullTelemetry,
} from '../domain/peer-telemetry.js';
import { buildCoverageMap } from '../domain/coverage.js';

/**
 * V5 default stale window — 14 days. Pre-V5 system rooms (toolshed/research/
 * oracle) had bespoke windows (30d / 7d / 14d) baked into per-room metadata;
 * with rooms deleted the scorer falls back to a single global default.
 *
 * If finer-grained staleness control is needed later, it should be expressed
 * per-node (e.g. `node.stale_after_days?`) so it travels with the node
 * itself rather than through a global room registry.
 */
const DEFAULT_STALE_AFTER_DAYS = 14 as const;

export interface BuildTelemetryParams {
  readonly query: string;
  readonly result: FederatedSearchResult;
  readonly graph: Graph;
  readonly now?: number;
}

export const buildPeerPullTelemetry = (
  params: BuildTelemetryParams,
): PeerPullTelemetry => {
  const { query, result, graph } = params;
  const now = params.now ?? Date.now();

  const coverageHits: { node_id: string; text: string }[] = [];
  const enriched: EnrichedMatch[] = result.matches.map((m) => {
    const node = getNode(graph, m.node_id);
    // Capture searchable text for the coverage map: node label +
    // content when local, else the wire-carried label for remote hits.
    const label = node && typeof node.label === 'string' ? node.label : '';
    const body = node && typeof node.source_file === 'string' ? node.source_file : '';
    coverageHits.push({ node_id: m.node_id, text: `${label} ${body}` });
    // Remote hits aren't in the local graph — fall back to the
    // wire-carried metadata the responding peer shipped. Without this,
    // every federated hit scored as provenance-free (0 fresh, 0
    // sources) and the satisfaction contract told agents to ignore
    // the results they just fetched.
    const fetchedAt =
      node && typeof node.fetched_at === 'string'
        ? node.fetched_at
        : m.fetched_at;
    const sourceUri =
      node && typeof node.source_uri === 'string'
        ? node.source_uri
        : node && typeof node.source_file === 'string'
          ? node.source_file
          : m.source_uri;
    return {
      node_id: m.node_id,
      distance: m.distance,
      source_peer: m._source_peer ?? null,
      also_from_peers: m._also_from_peers ?? [],
      source_uri: sourceUri,
      fetched_at: fetchedAt,
      age_days: ageInDays(fetchedAt, now),
      stale_after_days: DEFAULT_STALE_AFTER_DAYS,
      // Per-match Ed25519 attestation verdict from the federated
      // merge: true = verified against the responder's peer key,
      // false = claimed but invalid, undefined = unsigned/local.
      has_signature: m._sig_valid,
    };
  });

  const distinctSources = new Set<string>();
  for (const m of enriched) {
    if (m.source_uri) distinctSources.add(m.source_uri);
  }

  const satisfaction = computeSatisfaction(enriched);
  const contract = decideContract(satisfaction, {
    risk: classifyRisk(query),
    energyGate: process.env.FOLKLORE_ENERGY_GATE === '1',
  });
  // Coverage map only at borderline decisions — where the extra signal
  // can scope a constrained next search. Clear calls don't pay for it.
  const borderline =
    contract.decision === 'verify_one_source' || contract.decision === 'search_required';
  const coverage_map = borderline ? buildCoverageMap(query, coverageHits) : null;

  return {
    query,
    took_ms: result._telemetry.took_total_ms,
    took_local_ms: result._telemetry.took_local_ms,
    took_merge_ms: result._telemetry.took_merge_ms,
    bytes_received: result._telemetry.bytes_received_estimate,
    result_count: enriched.length,
    distinct_sources: distinctSources.size,
    peers_alive: result._telemetry.peers_alive,
    peers_queried: result.peers_queried,
    peers_responded: result.peers_responded,
    peers_timed_out: result.peers_timed_out,
    peers_errored: result.peers_errored,
    satisfaction,
    decision: contract.decision,
    coverage_map,
    emitted_at: new Date(now).toISOString(),
  };
};
