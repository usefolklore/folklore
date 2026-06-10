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
import type { Graph, GraphNode } from '../domain/graph.js';
import { getNode } from '../domain/graph.js';
import { verifyNode } from '../domain/match-attestation.js';
import { openFetchStream, MAX_FETCH_IDS, type FetchedNode } from '../infrastructure/fetch-sync.js';
import { publicKeyFromPeerId } from '../infrastructure/peer-transport.js';
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
  /**
   * Caching seam for pulled node bodies (the compounding loop:
   * pulled once, local forever). Receives an import-shaped GraphNode
   * plus the embed text; returns true when cached. Absent = pulled
   * bodies are displayed but not cached.
   */
  readonly cacheNode?: (node: GraphNode, text: string) => Promise<boolean>;
}

export interface FederatedAskParams {
  readonly query: string;
  readonly embedding: Vector;
  readonly k: number;
  /** Fetch body text for remote hits over /akashik/fetch/1.0.0. */
  readonly pull?: boolean;
}

/** A remote hit's body, pulled + verified + (maybe) cached. */
export interface PulledNode {
  readonly node_id: string;
  readonly label?: string;
  readonly summary?: string;
  readonly source_uri?: string;
  readonly fetched_at?: string;
  readonly source_peer: string;
  /** Node-attestation verdict — same semantics as match _sig_valid. */
  readonly sig_valid?: boolean;
  readonly cached: boolean;
}

export interface FederatedAskOutcome {
  readonly result: FederatedSearchResult;
  readonly telemetry: PeerPullTelemetry;
  readonly graph: Graph;
  readonly pulled?: readonly PulledNode[];
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

  const pulled = params.pull
    ? await pullRemoteBodies(deps, graph, result)
    : undefined;

  return { result, telemetry, graph, pulled };
};

/**
 * Fetch body text for remote hits the local graph does not hold,
 * verify each node's attestation, and cache verified-or-unsigned
 * bodies locally (claimed-but-invalid is never cached). Grouped per
 * source peer, capped at MAX_FETCH_IDS total — fetch is targeted.
 */
const pullRemoteBodies = async (
  deps: FederatedAskDeps,
  graph: Graph,
  result: FederatedSearchResult,
): Promise<readonly PulledNode[]> => {
  const wanted = result.matches
    .filter((m) => m._source_peer !== null && !getNode(graph, m.node_id))
    .slice(0, MAX_FETCH_IDS);
  if (wanted.length === 0) return [];

  const byPeer = new Map<string, string[]>();
  for (const m of wanted) {
    const arr = byPeer.get(m._source_peer as string) ?? [];
    arr.push(m.node_id);
    byPeer.set(m._source_peer as string, arr);
  }

  const pulled: PulledNode[] = [];
  await Promise.all(
    Array.from(byPeer.entries()).map(async ([peer, ids]) => {
      const res = await openFetchStream(deps.node, peer, ids);
      if (res.isErr() || !res.value || res.value.type !== 'fetch_ok') return;
      const pub = publicKeyFromPeerId(peer);
      for (const n of res.value.nodes) {
        const sigValid = verdictFor(pub, n);
        const cached = sigValid !== false && deps.cacheNode
          ? await cacheFetched(deps.cacheNode, peer, n)
          : false;
        pulled.push({
          node_id: n.node_id,
          label: n.label,
          summary: n.summary,
          source_uri: n.source_uri,
          fetched_at: n.fetched_at,
          source_peer: peer,
          sig_valid: sigValid,
          cached,
        });
      }
    }),
  );
  return pulled;
};

const verdictFor = (pub: Uint8Array | null, n: FetchedNode): boolean | undefined => {
  if (!n.attestation) return undefined;
  if (!pub) return false;
  return verifyNode(
    pub,
    { node_id: n.node_id, label: n.label, source_uri: n.source_uri, fetched_at: n.fetched_at, summary: n.summary },
    n.attestation,
  );
};

/** Import-shaped node, mirroring share-sync's buildImportedNode. */
const cacheFetched = async (
  cacheNode: NonNullable<FederatedAskDeps['cacheNode']>,
  peer: string,
  n: FetchedNode,
): Promise<boolean> => {
  const node = {
    id: n.node_id,
    label: n.label ?? n.node_id,
    file_type: 'document',
    source_file: `peer:${peer}`,
    private: false,
    source_uri: n.source_uri,
    fetched_at: n.fetched_at,
    summary: n.summary,
    _akashik_source_peer: peer,
  } as GraphNode;
  const text = n.summary ? `${node.label}\n\n${n.summary}` : node.label;
  try {
    return await cacheNode(node, text);
  } catch {
    return false;
  }
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
        sig_valid: m._sig_valid ?? null,
      };
    });
    return JSON.stringify({
      query,
      peers_queried: result.peers_queried,
      peers_responded: result.peers_responded,
      peers_timed_out: result.peers_timed_out,
      peers_errored: result.peers_errored,
      hits,
      ...(outcome.pulled ? { pulled: outcome.pulled } : {}),
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
      const sig = m._sig_valid === true ? ' [signed ✓]' : m._sig_valid === false ? ' [SIGNATURE INVALID]' : '';
      lines.push(`source_peer: ${peerLabel}${alsoFrom}${sig}`);
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

  if (outcome.pulled && outcome.pulled.length > 0) {
    lines.push(`# pulled bodies (${outcome.pulled.length})`);
    lines.push('');
    for (const p of outcome.pulled) {
      const sig = p.sig_valid === true ? ' [signed ✓]' : p.sig_valid === false ? ' [SIGNATURE INVALID — not cached]' : '';
      const cached = p.cached ? ' (cached locally)' : '';
      lines.push(`## ${p.label ?? p.node_id}${sig}${cached}`);
      lines.push(`from: ${p.source_peer}`);
      if (p.source_uri) lines.push(`source: ${p.source_uri}`);
      if (p.summary) {
        lines.push('');
        lines.push(p.summary);
      }
      lines.push('');
    }
  }

  lines.push(formatTelemetryBlock(telemetry));
  return lines.join('\n');
};
