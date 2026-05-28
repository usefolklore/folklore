/**
 * `akashik recall <name> [--workspace W|all] [--k N] [--json]`
 *
 * Entity-first lookup. Resolves <name> against the entity registry,
 * traverses every `mentions` edge, returns ranked source chunks
 * across the global graph.
 *
 * V5 (Phase 24): no --room flag. Read-side workspace pre-filter is
 * auto-applied when cwd is in a git repo; --workspace all opts out.
 * Uniform global half-life (14d) — per-source-uri tuning deferred to
 * Phase 25+.
 *
 * The contrast with `ask`: ask runs a vector search over the
 * embedding space; recall runs a graph traversal from a known entity.
 */

import { join } from 'node:path';
import { recall } from '../../application/recall.js';
import { runFederatedRecall } from '../../application/federated-recall.js';
import { defaultRuntime, akashikHome, detectWorkspace } from '../runtime.js';
import { formatError, formatErrorWithHint } from '../../domain/errors.js';
import { loadOrCreateIdentity, createNode, dialAndTag } from '../../infrastructure/peer-transport.js';
import { loadPeers } from '../../infrastructure/peer-store.js';
import { loadConfig } from '../../infrastructure/config-loader.js';

/** Single uniform half-life — V5 dropped HALF_LIFE_BY_ROOM; see
 *  src/domain/recency-rerank.ts DEFAULT_HALF_LIFE_DAYS. */
const RECENCY_HALF_LIFE_DAYS = 14;

interface ParsedArgs {
  readonly query: string;
  readonly workspace?: string;
  readonly k: number;
  readonly json: boolean;
  readonly peers: boolean;
}

const parseArgs = (args: readonly string[]): ParsedArgs | string => {
  let query = '';
  let workspaceFlag: string | undefined;
  let workspaceExplicit = false;
  let k = 20;
  let json = false;
  let peers = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--workspace') { workspaceFlag = next(); workspaceExplicit = true; }
    else if (a.startsWith('--workspace=')) { workspaceFlag = a.slice('--workspace='.length); workspaceExplicit = true; }
    else if (a === '--k' || a === '-k') k = parseInt(next(), 10) || 20;
    else if (a.startsWith('--k=')) k = parseInt(a.slice('--k='.length), 10) || 20;
    else if (a === '--json') json = true;
    else if (a === '--peers') peers = true;
    else if (!a.startsWith('-')) query = query ? `${query} ${a}` : a;
  }
  if (!query) return 'missing name — usage: akashik recall <name> [--workspace W|all] [--k N] [--peers] [--json]';

  let workspace: string | undefined;
  if (workspaceExplicit) {
    workspace = workspaceFlag === 'all' ? undefined : (workspaceFlag || undefined);
  } else {
    workspace = detectWorkspace();
  }
  return { query, workspace, k, json, peers };
};

export const recallCmd = async (args: readonly string[]): Promise<number> => {
  if (args.includes('--help') || args.includes('-h') || args.includes('help')) {
    console.log(`usage: akashik recall <name> [--workspace W|all] [--k N] [--peers] [--json]

Entity-first lookup. Resolves <name> against the entity registry
(\`akashik entity add ...\`) plus heuristic auto-detected
entities, then walks every \`mentions\` edge in the graph to
return chunks that reference it.

flags:
  --workspace W  pre-filter to a workspace slug (auto-detected from
                 git toplevel when run inside a repo). Use 'all' to
                 opt out of the cwd-based pre-filter.
  --k N          max results (default 20)
  --peers        fan out to connected libp2p peers via the
                 /akashik/recall/1.0.0 protocol
  --json         machine-readable output

Recency decay: uniform ${RECENCY_HALF_LIFE_DAYS}d half-life.`);
    return 0;
  }

  const parsed = parseArgs(args);
  if (typeof parsed === 'string') {
    console.error(`recall: ${parsed}`);
    return 1;
  }

  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`recall: ${formatErrorWithHint(rt.error)}`);
    return 1;
  }
  const runtime = rt.value;
  try {
    if (parsed.peers) {
      return await runRecallFederated(runtime, parsed);
    }
    const graphRes = await runtime.graphs.load();
    if (graphRes.isErr()) {
      console.error(`recall: graph load failed: ${formatError(graphRes.error)}`);
      return 1;
    }
    return await runRecall(runtime, graphRes.value, parsed);
  } finally {
    runtime.close();
  }
};

// ─────────────── federated path ───────────

const runRecallFederated = async (
  runtime: import('../runtime.js').Runtime,
  parsed: ParsedArgs,
): Promise<number> => {
  const idPath = join(akashikHome(), 'peer-identity.json');
  const peersPath = join(akashikHome(), 'peers.json');
  const cfgPath = join(akashikHome(), 'config.yaml');
  const cfgRes = await loadConfig(cfgPath);
  if (cfgRes.isErr()) {
    console.error(`recall --peers: ${formatError(cfgRes.error)}`);
    return 1;
  }
  const idRes = await loadOrCreateIdentity(idPath);
  if (idRes.isErr()) {
    console.error(`recall --peers: ${formatError(idRes.error)}`);
    return 1;
  }
  const nodeRes = await createNode(idRes.value, {
    listenPort: 0,
    listenHost: '127.0.0.1',
    mdns: cfgRes.value.peer.mdns,
    dhtEnabled: cfgRes.value.peer.dht.enabled,
    peersPath,
  });
  if (nodeRes.isErr()) {
    console.error(`recall --peers: ${formatError(nodeRes.error)}`);
    return 1;
  }
  const node = nodeRes.value;
  try {
    const peersRes = await loadPeers(peersPath);
    if (peersRes.isOk()) {
      await Promise.all(
        peersRes.value.peers.map(async (p) => {
          for (const addr of p.addrs) {
            try { await dialAndTag(node, addr); break; } catch { /* try next */ }
          }
        }),
      );
    }

    const result = await runFederatedRecall(
      { node, entityRegistry: runtime.entityRegistry },
      { query: parsed.query, limit: parsed.k },
    );

    if (parsed.json) {
      console.log(JSON.stringify({
        query: parsed.query,
        entity_id: result.entity_id,
        local_mentions: result.local_mentions,
        peers_queried: result.peers_queried,
        peers_responded: result.peers_responded,
        peers_timed_out: result.peers_timed_out,
        peers_errored: result.peers_errored,
        peers_unknown_entity: result.peers_unknown_entity,
        took_ms: result.took_ms,
        remote_hits: result.remote_hits,
      }));
      return 0;
    }

    console.log(`# akashik recall --peers: ${parsed.query}`);
    console.log(`entity_id:        ${result.entity_id}`);
    if (result.entity) {
      console.log(`local entity:     ${result.entity.label} (${result.entity.type})`);
      console.log(`local mentions:   ${result.local_mentions}`);
    } else {
      console.log(`local entity:     <not registered locally>`);
    }
    console.log(`peers queried:    ${result.peers_queried}`);
    console.log(`peers responded:  ${result.peers_responded} ok | ${result.peers_unknown_entity} unknown_entity | ${result.peers_timed_out} timeout | ${result.peers_errored} error`);
    console.log(`took:             ${result.took_ms}ms`);
    console.log('');

    if (result.remote_hits.length === 0) {
      console.log('no peer mentions for this entity.');
      if (result.peers_queried === 0) {
        console.log('  (no connected peers — dial one with `akashik peer add <multiaddr>`)');
      }
      return 0;
    }
    console.log(`## remote mentions (${result.remote_hits.length})`);
    for (const h of result.remote_hits) {
      const ageStr =
        h.age_days === undefined ? ''
        : h.age_days < 1 ? ' · today'
        : h.age_days < 14 ? ` · ${Math.round(h.age_days)}d`
        : h.age_days < 90 ? ` · ${Math.round(h.age_days / 7)}w`
        : ` · ${Math.round(h.age_days / 30)}mo`;
      const peer = h.source_peer.slice(0, 12);
      console.log(`  - ${h.label} [${ageStr}] peer:${peer}`);
      if (h.source_uri) console.log(`      ${h.source_uri}`);
    }
    return 0;
  } finally {
    try { await node.stop(); } catch { /* benign */ }
  }
};

const runRecall = async (
  runtime: import('../runtime.js').Runtime,
  graph: import('../../domain/graph.js').Graph,
  parsed: ParsedArgs,
): Promise<number> => {
  const result = recall(
    { registry: runtime.entityRegistry, graph },
    { query: parsed.query, limit: parsed.k },
  );

  if (result.isErr()) {
    if (result.error.type === 'EntityNotFound') {
      if (parsed.json) {
        console.log(JSON.stringify({ query: parsed.query, found: false, hits: [] }));
        return 0;
      }
      console.log(`no entity registered for "${parsed.query}".`);
      console.log(`  register one with: akashik entity add "${parsed.query}"`);
      console.log(`  or run an ingest — heuristic detection picks up CamelCase identifiers`);
      console.log(`  and URL hosts automatically.`);
      return 0;
    }
    console.error(`recall: ${result.error.message}`);
    return 1;
  }

  // V5 workspace pre-filter at CLI boundary.
  const { entity, hits: rawHits, total } = result.value;
  const hits = parsed.workspace
    ? rawHits.filter((h) => h.workspace === parsed.workspace)
    : rawHits;

  if (parsed.json) {
    console.log(JSON.stringify({
      query: parsed.query,
      entity: {
        id: entity.id,
        label: entity.label,
        type: entity.type,
        aliases: entity.aliases,
        mention_count: entity.mention_count,
        first_seen: entity.first_seen,
        last_seen: entity.last_seen,
      },
      total,
      hits,
    }));
    return 0;
  }

  console.log(`# akashik recall: ${entity.label}`);
  console.log(`entity:  ${entity.id}`);
  console.log(`type:    ${entity.type}`);
  console.log(`aliases: ${entity.aliases.join(', ')}`);
  console.log(`mentions: ${total} (showing ${hits.length})`);
  if (parsed.workspace) console.log(`workspace: ${parsed.workspace}`);
  console.log('');

  if (hits.length === 0) {
    console.log('no chunks reference this entity yet — heuristics may not have caught it,');
    console.log('or no ingest has run since registration. try `akashik trigger`.');
    return 0;
  }

  const renderAge = (d?: number): string => {
    if (d === undefined) return 'age:?';
    if (d < 1) return 'today';
    if (d < 14) return `${Math.round(d)}d`;
    if (d < 90) return `${Math.round(d / 7)}w`;
    return `${Math.round(d / 30)}mo`;
  };

  for (const h of hits) {
    console.log(`## ${h.label}`);
    console.log(`workspace: ${h.workspace ?? '-'} | ${renderAge(h.age_days)} | surface: "${h.surface}"`);
    if (h.source_uri) console.log(`source: ${h.source_uri}`);
    if (h.summary) {
      const snippet = h.summary.replace(/\s+/g, ' ').slice(0, 320);
      console.log('');
      console.log(snippet);
    }
    console.log('');
  }
  return 0;
};
