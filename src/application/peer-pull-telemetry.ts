/**
 * Build the agent-session telemetry record from a federated-search
 * result. Composes graph enrichment + the v1 satisfaction scorer onto
 * the wire-level numbers federated-search already collected.
 *
 * Shared by: MCP `federated_search` / `ask` tools, the PreToolUse
 * smart-hook, and `wellinformed ask --peers` CLI tail.
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
  ageInDays,
  type AgentDecision,
  type EnrichedMatch,
  type PeerPullTelemetry,
  type SatisfactionScore,
} from '../domain/peer-telemetry.js';

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

  const enriched: EnrichedMatch[] = result.matches.map((m) => {
    const node = getNode(graph, m.node_id);
    const fetchedAt =
      node && typeof node.fetched_at === 'string' ? node.fetched_at : undefined;
    const sourceUri =
      node && typeof node.source_uri === 'string'
        ? node.source_uri
        : node && typeof node.source_file === 'string'
          ? node.source_file
          : undefined;
    return {
      node_id: m.node_id,
      // EnrichedMatch.room is structural metadata for the scorer's consensus
      // diagnostics — V5 has no room, so we pass an empty string. The scorer
      // does not branch on the value (only on source_peer), so this preserves
      // back-compat with the shared EnrichedMatch shape without leaking the
      // deleted abstraction into satisfaction math.
      room: '',
      distance: m.distance,
      source_peer: m._source_peer ?? null,
      also_from_peers: m._also_from_peers ?? [],
      source_uri: sourceUri,
      fetched_at: fetchedAt,
      age_days: ageInDays(fetchedAt, now),
      stale_after_days: DEFAULT_STALE_AFTER_DAYS,
      // has_signature surfaces in v4.x when the share envelope verifier
      // exposes per-node verdicts; left undefined here so the scorer
      // treats signature as 'unknown' (0.5 component contribution).
      has_signature: undefined,
    };
  });

  const distinctSources = new Set<string>();
  for (const m of enriched) {
    if (m.source_uri) distinctSources.add(m.source_uri);
  }

  const satisfaction = computeSatisfaction(enriched);

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
    decision: pickDecision(satisfaction),
    coverage_map: null,
    emitted_at: new Date(now).toISOString(),
  };
};

/**
 * v1 decision picker — pure threshold over satisfaction.score.
 * v2 will overlay task-risk + coverage-map signals; this function
 * exists so v1 ships a stable `decision` field that v2 can refine
 * without breaking the agent surface.
 */
const pickDecision = (s: SatisfactionScore): AgentDecision => {
  if (s.score >= 0.85) return 'use_memory';
  if (s.score >= 0.65) return 'verify_one_source';
  if (s.score >= 0.40) return 'search_required';
  return 'ask_user';
};
