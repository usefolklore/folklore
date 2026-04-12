/**
 * `wellinformed ask "<query>" [--room R] [--k N] [--peers]`
 *
 * Semantic search + formatted context output. Embeds the query, runs
 * k-NN, loads matching nodes from the graph, and prints a structured
 * context block to stdout that a human or LLM can consume.
 *
 * With --peers: fans out to all connected peers via /wellinformed/search/1.0.0,
 * merges results with _source_peer annotation, and surfaces cross-room tunnels.
 */

import { join } from 'node:path';
import { formatError } from '../../domain/errors.js';
import { getNode } from '../../domain/graph.js';
import { searchByRoom, searchGlobal } from '../../application/use-cases.js';
import { runFederatedSearch } from '../../application/federated-search.js';
import { defaultRuntime, wellinformedHome } from '../runtime.js';
import type { Runtime } from '../runtime.js';
import { loadOrCreateIdentity, createNode, dialAndTag } from '../../infrastructure/peer-transport.js';
import { loadPeers } from '../../infrastructure/peer-store.js';
import { loadConfig } from '../../infrastructure/config-loader.js';

interface ParsedArgs {
  readonly query: string;
  readonly room?: string;
  readonly k: number;
  readonly peers: boolean;
}

const parseArgs = (args: readonly string[]): ParsedArgs | string => {
  let query = '';
  let room: string | undefined;
  let k = 5;
  let peers = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--room') room = next();
    else if (a.startsWith('--room=')) room = a.slice('--room='.length);
    else if (a === '--k' || a === '-k') k = parseInt(next(), 10) || 5;
    else if (a.startsWith('--k=')) k = parseInt(a.slice('--k='.length), 10) || 5;
    else if (a === '--peers') peers = true;
    else if (!a.startsWith('-')) query = query ? `${query} ${a}` : a;
  }
  if (!query) return 'missing query — usage: wellinformed ask "your question" [--room R] [--k N] [--peers]';
  return { query, room, k, peers };
};

export const ask = async (args: readonly string[]): Promise<number> => {
  const parsed = parseArgs(args);
  if (typeof parsed === 'string') {
    console.error(`ask: ${parsed}`);
    return 1;
  }

  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`ask: ${formatError(rt.error)}`);
    return 1;
  }
  const runtime = rt.value;

  try {
    if (parsed.peers) {
      return askFederated(runtime, parsed);
    }

    const deps = {
      graphs: runtime.graphs,
      vectors: runtime.vectors,
      embedder: runtime.embedder,
    };

    const matches = parsed.room
      ? await searchByRoom(deps)({ room: parsed.room, text: parsed.query, k: parsed.k })
      : await searchGlobal(deps)({ text: parsed.query, k: parsed.k });

    if (matches.isErr()) {
      console.error(`ask: ${formatError(matches.error)}`);
      return 1;
    }

    if (matches.value.length === 0) {
      console.log('no results found. try a broader query or run `wellinformed trigger` to index content first.');
      return 0;
    }

    const graph = await runtime.graphs.load();
    if (graph.isErr()) {
      console.error(`ask: ${formatError(graph.error)}`);
      return 1;
    }

    console.log(`# wellinformed results for: ${parsed.query}`);
    if (parsed.room) console.log(`room: ${parsed.room}`);
    console.log('');

    for (const m of matches.value) {
      const node = getNode(graph.value, m.node_id);
      if (!node) {
        console.log(`## [${m.node_id}] (not in graph)`);
        continue;
      }
      console.log(`## ${node.label}`);
      console.log(`distance: ${m.distance.toFixed(3)} | room: ${node.room ?? '-'} | wing: ${node.wing ?? '-'}`);
      console.log(`source: ${node.source_uri ?? node.source_file}`);
      if (node.published_at) console.log(`published: ${node.published_at}`);
      if (node.author) console.log(`author: ${node.author}`);
      console.log('');
    }
    return 0;
  } finally {
    runtime.close();
  }
};

/**
 * Federated ask — embeds the query locally, opens a short-lived libp2p
 * node (same pattern as `peer add`), fans out to connected peers with a
 * 2s per-peer deadline, merges and prints results with _source_peer.
 *
 * When no peers are connected (fresh install, daemon not running, etc.)
 * this returns local-only results with "peers_queried: 0" — no hard error.
 */
const askFederated = async (runtime: Runtime, parsed: ParsedArgs): Promise<number> => {
  // 1. Embed the query locally (same embedder as non-federated path)
  const embedRes = await runtime.embedder.embed(parsed.query);
  if (embedRes.isErr()) {
    console.error(`ask --peers: ${formatError(embedRes.error)}`);
    return 1;
  }
  const embedding = embedRes.value; // Float32Array, length 384

  // 2. Boot a short-lived libp2p node so we can dial connected peers.
  //    This mirrors the pattern in peer add — load identity, createNode,
  //    call node.stop() in finally. We do NOT register any protocols
  //    (we're outbound-only for this query).
  const identityPath = join(wellinformedHome(), 'peer-identity.json');
  const peersPath = join(wellinformedHome(), 'peers.json');
  const configPath = join(wellinformedHome(), 'config.yaml');

  const cfgRes = await loadConfig(configPath);
  if (cfgRes.isErr()) {
    console.error(`ask --peers: ${formatError(cfgRes.error)}`);
    return 1;
  }
  const cfg = cfgRes.value;

  const idRes = await loadOrCreateIdentity(identityPath);
  if (idRes.isErr()) {
    console.error(`ask --peers: ${formatError(idRes.error)}`);
    return 1;
  }

  const nodeRes = await createNode(idRes.value, {
    listenPort: 0, // ephemeral — outbound-only
    listenHost: '127.0.0.1',
    mdns: cfg.peer.mdns,
    dhtEnabled: cfg.peer.dht.enabled,
    peersPath, // so peer:discovery events (if any during this tick) persist
  });
  if (nodeRes.isErr()) {
    console.error(`ask --peers: ${formatError(nodeRes.error)}`);
    return 1;
  }
  const node = nodeRes.value;

  try {
    // 3. Best-effort dial of every known peer so fan-out has targets.
    //    Short grace period — dials resolve in parallel.
    const peersRes = await loadPeers(peersPath);
    if (peersRes.isOk()) {
      await Promise.all(
        peersRes.value.peers.map(async (p) => {
          for (const addr of p.addrs) {
            try {
              await dialAndTag(node, addr);
              break;
            } catch {
              /* try next addr */
            }
          }
        }),
      );
    }

    // 4. Run the federated search — 2s per-peer deadline locked in Plan 02
    const result = await runFederatedSearch(
      { node, vectorIndex: runtime.vectors },
      { embedding, k: parsed.k, room: parsed.room },
    );

    // 5. Print results with _source_peer annotation
    const graph = await runtime.graphs.load();
    if (graph.isErr()) {
      console.error(`ask --peers: ${formatError(graph.error)}`);
      return 1;
    }

    console.log(`# wellinformed federated results for: ${parsed.query}`);
    if (parsed.room) console.log(`room: ${parsed.room}`);
    console.log(`peers_queried: ${result.peers_queried}`);
    console.log(`peers_responded: ${result.peers_responded}`);
    if (result.peers_timed_out > 0) console.log(`peers_timed_out: ${result.peers_timed_out}`);
    if (result.peers_errored > 0) console.log(`peers_errored: ${result.peers_errored}`);
    console.log('');

    if (result.matches.length === 0) {
      console.log('no results from local or connected peers.');
    } else {
      for (const m of result.matches) {
        const graphNode = getNode(graph.value, m.node_id);
        const label = graphNode?.label ?? m.node_id;
        console.log(`## ${label}`);
        const peerLabel = m._source_peer ?? 'local';
        const alsoFrom =
          m._also_from_peers && m._also_from_peers.length > 0
            ? ` (also: ${m._also_from_peers.join(', ')})`
            : '';
        console.log(`source_peer: ${peerLabel}${alsoFrom}`);
        console.log(`distance: ${m.distance.toFixed(3)} | room: ${m.room ?? '-'} | wing: ${m.wing ?? '-'}`);
        if (graphNode?.source_uri) console.log(`source: ${graphNode.source_uri}`);
        console.log('');
      }
    }

    // 6. Cross-room tunnels section (FED-04 rendering)
    if (result.tunnels.length > 0) {
      console.log('## Cross-room tunnels');
      for (const t of result.tunnels) {
        console.log(`  ${t.a} (${t.room_a}) <-> ${t.b} (${t.room_b}) — distance: ${t.distance.toFixed(3)}`);
      }
      console.log('');
    }

    return 0;
  } finally {
    // CRITICAL: always stop the libp2p node — orphaned nodes leak TCP listeners
    try {
      await node.stop();
    } catch {
      /* benign */
    }
  }
};
