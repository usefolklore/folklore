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
import { runFederatedSearch } from '../../application/federated-search.js';
import { buildPeerPullTelemetry } from '../../application/peer-pull-telemetry.js';
import { formatTelemetryBlock } from '../../infrastructure/telemetry-formatter.js';
import { ask as askUseCase, type AskResult } from '../../application/ask.js';
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
  readonly json: boolean;
}

const parseArgs = (args: readonly string[]): ParsedArgs | string => {
  let query = '';
  let room: string | undefined;
  let k = 5;
  let peers = false;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--room') room = next();
    else if (a.startsWith('--room=')) room = a.slice('--room='.length);
    else if (a === '--k' || a === '-k') k = parseInt(next(), 10) || 5;
    else if (a.startsWith('--k=')) k = parseInt(a.slice('--k='.length), 10) || 5;
    else if (a === '--peers') peers = true;
    else if (a === '--json') json = true;
    else if (!a.startsWith('-')) query = query ? `${query} ${a}` : a;
  }
  if (!query) return 'missing query — usage: wellinformed ask "your question" [--room R] [--k N] [--peers] [--json]';
  return { query, room, k, peers, json };
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
      // CRITICAL: `await` here. Without it, the outer async function's
      // `finally { runtime.close() }` runs before askFederated completes,
      // closing the SQLite vector index mid-query and silently poisoning
      // every federated-local search. Caught while wiring the v2.1 smart-
      // hook to consult peers by default.
      return await askFederated(runtime, parsed);
    }

    // Delegate to the application-layer ask use case. CLI is now
    // a renderer of AskResult — composition (search + recall +
    // rerank + mention enrichment) lives in application/ask.ts.
    const result = await askUseCase({
      graphs: runtime.graphs,
      vectors: runtime.vectors,
      embedder: runtime.embedder,
      entityRegistry: runtime.entityRegistry,
    })({ query: parsed.query, room: parsed.room, k: parsed.k });

    if (result.isErr()) {
      console.error(`ask: ${formatError(result.error)}`);
      return 1;
    }
    return parsed.json
      ? renderAskJson(result.value)
      : renderAskHuman(result.value);
  } finally {
    runtime.close();
  }
};

// ─────────────── renderers ────────────────

const renderAskJson = (r: AskResult): number => {
  const hits = r.search_hits.map((h) => ({
    id: h.node_id,
    label: h.label,
    room: h.room ?? null,
    distance: Number(h.distance.toFixed(4)),
    source_uri: h.source_uri ?? null,
    summary: typeof h.summary === 'string' ? h.summary.slice(0, 400) : null,
    fetched_at: h.fetched_at ?? null,
    age_days: h.age_days ?? null,
    mentioned_entities: h.mentioned_entities,
  }));
  const out: Record<string, unknown> = {
    query: r.query,
    room: r.room ?? null,
    hits,
    reranked: r.reranked,
    satisfaction: r.satisfaction.score,
    decision: r.decision,
    satisfaction_detail: {
      fresh: r.satisfaction.fresh_count,
      stale: r.satisfaction.stale_count,
      missing_provenance: r.satisfaction.missing_provenance_count,
      distinct_origins: r.satisfaction.distinct_origins,
      reasons: r.satisfaction.reasons,
      penalties: r.satisfaction.penalties,
    },
  };
  if (r.resolved_entity) {
    out.resolved_entity = {
      id: r.resolved_entity.id,
      label: r.resolved_entity.label,
      type: r.resolved_entity.type,
      mention_count: r.resolved_entity.mention_count,
    };
  }
  if (r.recall_result) {
    out.recall = {
      total: r.recall_result.total,
      hits: r.recall_result.hits,
    };
  }
  console.log(JSON.stringify(out));
  return 0;
};

const renderAskHuman = (r: AskResult): number => {
  // 1. Entity recall — when the query resolved to a known entity,
  //    show the recall block FIRST. This is the user's headline:
  //    "you asked about lemlist — here's what I know across rooms."
  if (r.resolved_entity && r.recall_result && r.recall_result.hits.length > 0) {
    const e = r.resolved_entity;
    console.log(`# wellinformed: "${r.query}" matches entity ${e.id}`);
    console.log(`type: ${e.type} | aliases: ${e.aliases.join(', ')} | mentions: ${r.recall_result.total}`);
    console.log('');
    console.log(`## entity recall (top ${r.recall_result.hits.length})`);
    for (const h of r.recall_result.hits) {
      const room = h.room ?? '-';
      const ageStr =
        h.age_days === undefined
          ? ''
          : h.age_days < 1 ? ' · today'
          : h.age_days < 14 ? ` · ${Math.round(h.age_days)}d`
          : h.age_days < 90 ? ` · ${Math.round(h.age_days / 7)}w`
          : ` · ${Math.round(h.age_days / 30)}mo`;
      console.log(`  - ${h.label} [${room}${ageStr}] surface: "${h.surface}"`);
    }
    console.log('');
  }

  // 2. Vector search results
  if (r.search_hits.length === 0) {
    if (!r.resolved_entity) {
      console.log('no results found. try a broader query or run `wellinformed trigger` to index content first.');
      console.log('');
    }
    // Even with no hits, surface the agent contract — decision will
    // be `ask_user` or `search_required`, telling the agent it
    // should NOT trust the cache.
    console.log(`action: ${r.decision}  satisfaction: ${r.satisfaction.score.toFixed(2)}`);
    return 0;
  }

  console.log(`## semantic search results`);
  if (r.room) console.log(`room: ${r.room}`);
  if (r.reranked) console.log('ranked by: relevance × recency-decay');
  console.log('');

  for (const h of r.search_hits) {
    console.log(`### ${h.label}`);
    console.log(`distance: ${h.distance.toFixed(3)} | room: ${h.room ?? '-'}`);
    if (h.source_uri) console.log(`source: ${h.source_uri}`);
    if (h.mentioned_entities.length > 0) {
      const ents = h.mentioned_entities.slice(0, 5).map((e) => e.label).join(', ');
      const more = h.mentioned_entities.length > 5 ? `, +${h.mentioned_entities.length - 5}` : '';
      console.log(`mentions: ${ents}${more}`);
    }
    if (typeof h.summary === 'string' && h.summary.length > 0) {
      console.log('');
      console.log(h.summary.slice(0, 400));
    }
    console.log('');
  }

  // Agent contract — explicit completeness signal so the calling
  // agent (Claude / Codex / etc.) knows whether to fall through to
  // WebSearch. v1 thresholds: ≥0.85 use_memory · ≥0.65 verify_one_source ·
  // ≥0.40 search_required · <0.40 ask_user.
  const s = r.satisfaction;
  console.log(`action: ${r.decision}  satisfaction: ${s.score.toFixed(2)}  · fresh=${s.fresh_count} stale=${s.stale_count} missing_provenance=${s.missing_provenance_count}`);
  if (s.reasons.length > 0) console.log(`reasons: ${s.reasons.slice(0, 3).join(' · ')}`);
  if (s.penalties.length > 0) console.log(`penalties: ${s.penalties.slice(0, 3).join(' · ')}`);
  return 0;
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

    // 4. Run the federated search — 2s per-peer deadline locked in Plan 02.
    // Pass `text` so the local half uses the hybrid (BM25 + vector + RRF)
    // path that non-federated `ask` uses; peers still only receive the
    // embedding (SEC-03 boundary).
    const result = await runFederatedSearch(
      { node, vectorIndex: runtime.vectors },
      { embedding, k: parsed.k, room: parsed.room, text: parsed.query },
    );

    // 5. Print results with _source_peer annotation
    const graph = await runtime.graphs.load();
    if (graph.isErr()) {
      console.error(`ask --peers: ${formatError(graph.error)}`);
      return 1;
    }

    // Compose the agent-session telemetry block once. Used by both
    // --json (structured payload + pre-rendered text) and the human
    // surface (printed at the end so the user sees timing/peer/sat).
    const telemetry = buildPeerPullTelemetry({
      query: parsed.query,
      room: parsed.room,
      result,
      graph: graph.value,
    });

    if (parsed.json) {
      // JSON surface for the smart-hook and any programmatic consumer.
      // Same shape as local --json plus peer provenance fields so the
      // caller can surface "this hit came from peer X" context.
      const nowMs = Date.now();
      const hits = result.matches.map((m) => {
        const graphNode = getNode(graph.value, m.node_id);
        const fetchedAt = typeof graphNode?.fetched_at === 'string' ? graphNode.fetched_at : null;
        const fetchedMs = fetchedAt ? Date.parse(fetchedAt) : NaN;
        const ageDays = Number.isFinite(fetchedMs)
          ? Number(((nowMs - fetchedMs) / 86_400_000).toFixed(2))
          : null;
        return {
          id: m.node_id,
          label: graphNode?.label ?? null,
          room: graphNode?.room ?? m.room ?? null,
          distance: Number(m.distance.toFixed(4)),
          source_uri: graphNode?.source_uri ?? graphNode?.source_file ?? null,
          summary: typeof graphNode?.summary === 'string' ? (graphNode.summary as string).slice(0, 400) : null,
          fetched_at: fetchedAt,
          age_days: ageDays,
          source_peer: m._source_peer ?? 'local',
          also_from_peers: m._also_from_peers ?? [],
        };
      });
      console.log(JSON.stringify({
        query: parsed.query,
        room: parsed.room ?? null,
        peers_queried: result.peers_queried,
        peers_responded: result.peers_responded,
        peers_timed_out: result.peers_timed_out,
        peers_errored: result.peers_errored,
        hits,
        tunnels: result.tunnels.map((t) => ({
          a: t.a, b: t.b, room_a: t.room_a, room_b: t.room_b,
          distance: Number(t.distance.toFixed(4)),
        })),
        _telemetry: telemetry,
        _telemetry_block: formatTelemetryBlock(telemetry),
      }));
      return 0;
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

    // 7. Peer-pull telemetry block — visible signal of "wellinformed
    //    actually went to the network and here's what came back".
    console.log(formatTelemetryBlock(telemetry));

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
