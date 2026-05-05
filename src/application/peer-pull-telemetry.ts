/**
 * Build the agent-session telemetry record from a federated-search
 * result. Composes graph enrichment + the v1 satisfaction scorer onto
 * the wire-level numbers federated-search already collected.
 *
 * Shared by: MCP `federated_search` / `ask` tools, the PreToolUse
 * smart-hook, and `wellinformed ask --peers` CLI tail.
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
import { isSystemRoomName, TOOLSHED, RESEARCH, ORACLE } from '../domain/system-rooms.js';

const staleWindowFor = (room: string | undefined): number | undefined => {
  if (!room) return undefined;
  if (room === TOOLSHED.name) return TOOLSHED.staleAfterDays;
  if (room === RESEARCH.name) return RESEARCH.staleAfterDays;
  if (room === ORACLE.name) return ORACLE.staleAfterDays;
  if (isSystemRoomName(room)) return undefined;
  return undefined; // user rooms have no canonical window — scorer falls back to 14d
};

export interface BuildTelemetryParams {
  readonly query: string;
  readonly room?: string;
  readonly result: FederatedSearchResult;
  readonly graph: Graph;
  readonly now?: number;
}

export const buildPeerPullTelemetry = (
  params: BuildTelemetryParams,
): PeerPullTelemetry => {
  const { query, room, result, graph } = params;
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
    const nodeRoom = node?.room ?? m.room;
    return {
      node_id: m.node_id,
      room: nodeRoom,
      distance: m.distance,
      source_peer: m._source_peer ?? null,
      also_from_peers: m._also_from_peers ?? [],
      source_uri: sourceUri,
      fetched_at: fetchedAt,
      age_days: ageInDays(fetchedAt, now),
      stale_after_days: staleWindowFor(nodeRoom),
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
    room,
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
