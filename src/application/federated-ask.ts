/**
 * Federated ask — shared executor + output formatter.
 *
 * Two callers, one behavior:
 *   - CLI `akashik ask --peers` (src/cli/commands/ask.ts) on a
 *     short-lived libp2p node, paying ~800ms of process + p2p
 *     bootstrap per query.
 *   - Daemon IPC `ask --peers` (src/daemon/ipc-handlers.ts) on the
 *     daemon's ALREADY-CONNECTED live node — the fast path that
 *     collapses federated ask latency to roughly the in-protocol
 *     search window.
 *
 * The executor embeds nothing — callers pass the query embedding so
 * the daemon path can reuse its warmed embedder.
 */

import { join } from 'node:path';
import type { Libp2p } from '@libp2p/interface';
import type { Graph } from '../domain/graph.js';
import { getNode } from '../domain/graph.js';
import type { Vector } from '../domain/vectors.js';
import type { VectorIndex } from '../infrastructure/vector-index.js';
import type { EntityRegistry } from '../infrastructure/entity-registry.js';
import { loadPeers } from '../infrastructure/peer-store.js';
import { dialAndTag } from '../infrastructure/peer-transport.js';
import { formatTelemetryBlock } from '../infrastructure/telemetry-formatter.js';
import type { PeerPullTelemetry } from '../domain/peer-telemetry.js';
import { runFederatedSearch, type FederatedSearchResult } from './federated-search.js';
import { buildPeerPullTelemetry } from './peer-pull-telemetry.js';
import { buildReputationPeerOrder } from './peer-order-builder.js';
import { updatePeerReputation } from './update-peer-reputation.js';
import { ensureIdentity } from './identity-lifecycle.js';

export interface FederatedAskDeps {
  readonly home: string;
  /** Live (daemon) or ephemeral (CLI) libp2p node. The executor never
   *  stops it — lifetime belongs to the caller. */
  readonly node: Libp2p;
  readonly vectorIndex: VectorIndex;
  readonly loadGraph: () => Promise<Graph | null>;
  readonly entityRegistry: EntityRegistry;
}

export interface FederatedAskParams {
  readonly query: string;
  readonly embedding: Vector;
  readonly k: number;
}

export interface FederatedAskOutcome {
  readonly result: FederatedSearchResult;
  readonly telemetry: PeerPullTelemetry;
  readonly graph: Graph;
}

/**
 * Dial known peers (no-op for already-connected ones), fan out the
 * search, score the pull, and fire the best-effort reputation update.
 */
export const executeFederatedAsk = async (
  deps: FederatedAskDeps,
  params: FederatedAskParams,
): Promise<FederatedAskOutcome | { readonly error: string }> => {
  const peersPath = join(deps.home, 'peers.json');

  const peersRes = await loadPeers(peersPath);
  if (peersRes.isOk()) {
    await Promise.all(
      peersRes.value.peers.map(async (p) => {
        for (const addr of p.addrs) {
          try {
            await dialAndTag(deps.node, addr);
            break;
          } catch {
            /* try next addr */
          }
        }
      }),
    );
  }

  const localPeerId = deps.node.peerId.toString();
  const peerOrderRes = await buildReputationPeerOrder({
    home: deps.home,
    localPeerId,
    query: params.query,
    registry: deps.entityRegistry,
  });
  const peerOrder = peerOrderRes.isOk() ? peerOrderRes.value : undefined;

  const result = await runFederatedSearch(
    { node: deps.node, vectorIndex: deps.vectorIndex },
    {
      embedding: params.embedding,
      k: params.k,
      text: params.query,
      peerOrder,
      skipTunnels: true,
    },
  );

  const graph = await deps.loadGraph();
  if (!graph) return { error: 'graph load failed' };

  const telemetry = buildPeerPullTelemetry({ query: params.query, result, graph });

  if (result.peers_responded > 0) {
    void (async () => {
      try {
        const id = await ensureIdentity(deps.home);
        if (id.isErr()) return;
        await updatePeerReputation({
          satisfaction_score: telemetry.satisfaction.score,
          result,
          graph,
          reviewer_did: id.value.user.did,
          local_peer_id: localPeerId,
          home: deps.home,
        });
      } catch { /* benign — rep is observability, not state */ }
    })();
  }

  return { result, telemetry, graph };
};

/**
 * Render the federated outcome exactly as `akashik ask --peers`
 * prints it — one implementation, CLI and IPC byte-identical.
 */
export const formatFederatedAsk = (
  query: string,
  outcome: FederatedAskOutcome,
  json: boolean,
): string => {
  const { result, telemetry, graph } = outcome;

  if (json) {
    const nowMs = Date.now();
    const hits = result.matches.map((m) => {
      const graphNode = getNode(graph, m.node_id);
      const fetchedAt = typeof graphNode?.fetched_at === 'string'
        ? graphNode.fetched_at
        : (m.fetched_at ?? null);
      const fetchedMs = fetchedAt ? Date.parse(fetchedAt) : NaN;
      const ageDays = Number.isFinite(fetchedMs)
        ? Number(((nowMs - fetchedMs) / 86_400_000).toFixed(2))
        : null;
      return {
        id: m.node_id,
        label: graphNode?.label ?? m.label ?? null,
        workspace: graphNode?.workspace ?? null,
        distance: Number(m.distance.toFixed(4)),
        source_uri: graphNode?.source_uri ?? graphNode?.source_file ?? m.source_uri ?? null,
        summary: typeof graphNode?.summary === 'string' ? (graphNode.summary as string).slice(0, 400) : null,
        fetched_at: fetchedAt,
        age_days: ageDays,
        source_peer: m._source_peer ?? 'local',
        also_from_peers: m._also_from_peers ?? [],
      };
    });
    return JSON.stringify({
      query,
      peers_queried: result.peers_queried,
      peers_responded: result.peers_responded,
      peers_timed_out: result.peers_timed_out,
      peers_errored: result.peers_errored,
      hits,
      _telemetry: telemetry,
      _telemetry_block: formatTelemetryBlock(telemetry),
    });
  }

  const lines: string[] = [];
  lines.push(`# akashik federated results for: ${query}`);
  lines.push(`peers_queried: ${result.peers_queried}`);
  lines.push(`peers_responded: ${result.peers_responded}`);
  if (result.peers_timed_out > 0) lines.push(`peers_timed_out: ${result.peers_timed_out}`);
  if (result.peers_errored > 0) lines.push(`peers_errored: ${result.peers_errored}`);
  lines.push('');

  if (result.matches.length === 0) {
    lines.push('no results from local or connected peers.');
  } else {
    for (const m of result.matches) {
      const graphNode = getNode(graph, m.node_id);
      const label = graphNode?.label ?? m.label ?? m.node_id;
      lines.push(`## ${label}`);
      if (!graphNode && m.label) lines.push(`id: ${m.node_id}`);
      const peerLabel = m._source_peer ?? 'local';
      const alsoFrom =
        m._also_from_peers && m._also_from_peers.length > 0
          ? ` (also: ${m._also_from_peers.join(', ')})`
          : '';
      lines.push(`source_peer: ${peerLabel}${alsoFrom}`);
      const ws = typeof graphNode?.workspace === 'string' ? graphNode.workspace : '-';
      const fetchedAt = (typeof graphNode?.fetched_at === 'string' ? graphNode.fetched_at : undefined) ?? m.fetched_at;
      const ageMs = fetchedAt ? Date.now() - Date.parse(fetchedAt) : NaN;
      const age = Number.isFinite(ageMs) ? ` | age: ${Math.max(0, Math.round(ageMs / 86_400_000))}d` : '';
      lines.push(`distance: ${m.distance.toFixed(3)} | workspace: ${ws}${age}`);
      const srcUri = graphNode?.source_uri ?? m.source_uri;
      if (srcUri) lines.push(`source: ${srcUri}`);
      lines.push('');
    }
  }

  lines.push(formatTelemetryBlock(telemetry));
  return lines.join('\n');
};
