/**
 * `akashik ask "<query>" [--workspace W|all] [--k N] [--peers]`
 *
 * Semantic search + formatted context output. Embeds the query, runs
 * k-NN, loads matching nodes from the graph, and prints a structured
 * context block to stdout that a human or LLM can consume.
 *
 * V5 (Phase 24): room flag is gone. Read-side commands auto-apply a
 * workspace pre-filter when cwd is in a git repo. Use `--workspace all`
 * to opt out, or `--workspace <slug>` to override the cwd detection.
 *
 * With --peers: fans out to all connected peers via /akashik/search/1.0.0,
 * merges results with _source_peer annotation.
 */

import { join } from 'node:path';
import { formatError, formatErrorWithHint } from '../../domain/errors.js';
import { executeFederatedAsk, formatFederatedAsk } from '../../application/federated-ask.js';
import { indexNode } from '../../application/use-cases.js';
import { ask as askUseCase, type AskResult } from '../../application/ask.js';
import { defaultRuntime, akashikHome, detectWorkspace } from '../runtime.js';
import type { Runtime } from '../runtime.js';
import { loadOrCreateIdentity, createNode } from '../../infrastructure/peer-transport.js';
import { loadConfig } from '../../infrastructure/config-loader.js';

interface ParsedArgs {
  readonly query: string;
  /** Resolved workspace pre-filter. undefined = no filter (--workspace all
   * or no git repo); string = filter to this slug. */
  readonly workspace?: string;
  readonly k: number;
  readonly peers: boolean;
  /** With --peers: fetch + cache body text for remote hits. */
  readonly pull: boolean;
  readonly json: boolean;
}

const parseArgs = (args: readonly string[]): ParsedArgs | string => {
  let query = '';
  let workspaceFlag: string | undefined;
  let workspaceExplicit = false;
  let k = 5;
  let peers = false;
  let pull = false;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--workspace') { workspaceFlag = next(); workspaceExplicit = true; }
    else if (a.startsWith('--workspace=')) { workspaceFlag = a.slice('--workspace='.length); workspaceExplicit = true; }
    else if (a === '--k' || a === '-k') k = parseInt(next(), 10) || 5;
    else if (a.startsWith('--k=')) k = parseInt(a.slice('--k='.length), 10) || 5;
    else if (a === '--peers') peers = true;
    else if (a === '--pull') pull = true;
    else if (a === '--json') json = true;
    else if (!a.startsWith('-')) query = query ? `${query} ${a}` : a;
  }
  if (!query) return 'missing query — usage: akashik ask "your question" [--workspace W|all] [--k N] [--peers [--pull]] [--json]';

  // Resolve workspace: explicit --workspace all → undefined (no filter);
  // explicit slug → that slug; absent → detectWorkspace(cwd) → slug | undefined.
  let workspace: string | undefined;
  if (workspaceExplicit) {
    workspace = workspaceFlag === 'all' ? undefined : (workspaceFlag || undefined);
  } else {
    workspace = detectWorkspace();
  }
  return { query, workspace, k, peers, pull, json };
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
      // closing the SQLite vector index mid-query.
      return await askFederated(runtime, parsed);
    }

    // Delegate to the application-layer ask use case.
    const result = await askUseCase({
      graphs: runtime.graphs,
      vectors: runtime.vectors,
      embedder: runtime.embedder,
      entityRegistry: runtime.entityRegistry,
    })({ query: parsed.query, k: parsed.k });

    if (result.isErr()) {
      console.error(`ask: ${formatErrorWithHint(result.error)}`);
      return 1;
    }

    // Apply workspace pre-filter at the CLI boundary (V5: application
    // layer is workspace-agnostic; CLI is the only filter site).
    const filtered = applyWorkspaceFilter(result.value, parsed.workspace);
    return parsed.json
      ? renderAskJson(filtered)
      : renderAskHuman(filtered);
  } finally {
    runtime.close();
  }
};

// ─────────────── workspace filter ─────────

/**
 * Pre-filter search/recall hits to those tagged with the given workspace.
 * Applied at the CLI boundary AFTER the application-layer query returns.
 * Per the plan (Wave 2 vector-index simplification): the index stays
 * workspace-blind; filtering is a read-site concern.
 */
const applyWorkspaceFilter = (r: AskResult, workspace: string | undefined): AskResult => {
  if (!workspace) return r;
  const search_hits = r.search_hits.filter((h) => h.workspace === workspace);
  const recall_result = r.recall_result
    ? {
        ...r.recall_result,
        hits: r.recall_result.hits.filter((h) => h.workspace === workspace),
      }
    : undefined;
  return { ...r, search_hits, recall_result };
};

// ─────────────── renderers ────────────────

const renderAskJson = (r: AskResult): number => {
  const hits = r.search_hits.map((h) => ({
    id: h.node_id,
    label: h.label,
    workspace: h.workspace ?? null,
    distance: Number(h.distance.toFixed(4)),
    source_uri: h.source_uri ?? null,
    summary: typeof h.summary === 'string' ? h.summary.slice(0, 400) : null,
    fetched_at: h.fetched_at ?? null,
    age_days: h.age_days ?? null,
    mentioned_entities: h.mentioned_entities,
  }));
  const out: Record<string, unknown> = {
    query: r.query,
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

/**
 * Hook payload schema version. Bump when the field set or ordering
 * changes so downstream agent integrations can skip a stale block.
 */
const HOOK_SCHEMA_VERSION = 2;

const renderAgentContract = (r: AskResult): void => {
  const s = r.satisfaction;
  console.log(`# akashik agent contract (hook_version: ${HOOK_SCHEMA_VERSION})`);
  console.log(`action:        ${r.decision}`);
  console.log(`satisfaction:  ${s.score.toFixed(2)}  (range 0.00–1.00)`);
  console.log(
    `thresholds:    ≥0.85 use_memory · ≥0.65 verify_one_source · ≥0.40 search_required · <0.40 ask_user`,
  );
  console.log(
    `signals:       fresh=${s.fresh_count} stale=${s.stale_count} missing_provenance=${s.missing_provenance_count} observed=${s.observed_components}/5`,
  );
  if (s.reasons.length > 0) {
    console.log(`reasons:       ${s.reasons.slice(0, 3).join(' · ')}`);
  }
  if (s.penalties.length > 0) {
    console.log(`penalties:     ${s.penalties.slice(0, 3).join(' · ')}`);
  }
  console.log('');
};

const renderAskHuman = (r: AskResult): number => {
  renderAgentContract(r);

  if (r.resolved_entity && r.recall_result && r.recall_result.hits.length > 0) {
    const e = r.resolved_entity;
    console.log(`# akashik: "${r.query}" matches entity ${e.id}`);
    console.log(`type: ${e.type} | aliases: ${e.aliases.join(', ')} | mentions: ${r.recall_result.total}`);
    console.log('');
    console.log(`## entity recall (top ${r.recall_result.hits.length})`);
    for (const h of r.recall_result.hits) {
      const ws = h.workspace ?? '-';
      const ageStr =
        h.age_days === undefined
          ? ''
          : h.age_days < 1 ? ' · today'
          : h.age_days < 14 ? ` · ${Math.round(h.age_days)}d`
          : h.age_days < 90 ? ` · ${Math.round(h.age_days / 7)}w`
          : ` · ${Math.round(h.age_days / 30)}mo`;
      console.log(`  - ${h.label} [${ws}${ageStr}] matched_on: "${h.surface}"`);
    }
    console.log('');
  }

  if (r.search_hits.length === 0) {
    if (!r.resolved_entity) {
      console.log('no results found. try a broader query or run `akashik trigger` to index content first.');
    }
    return 0;
  }

  console.log(`## semantic search results`);
  if (r.reranked) console.log('ranked by: relevance × recency-decay');
  console.log('');

  for (const h of r.search_hits) {
    console.log(`### ${h.label}`);
    const relevance = Math.max(0, 1 - h.distance);
    console.log(
      `relevance: ${relevance.toFixed(3)} (cosine_distance ${h.distance.toFixed(3)}) | workspace: ${h.workspace ?? '-'}`,
    );
    if (h.source_uri) console.log(`source: ${h.source_uri}`);
    if (h.mentioned_entities.length > 0) {
      const ents = h.mentioned_entities.slice(0, 5).map((e) => e.label).join(', ');
      const more = h.mentioned_entities.length > 5 ? `, +${h.mentioned_entities.length - 5}` : '';
      console.log(`mentions: ${ents}${more}`);
    }
    if (typeof h.summary === 'string' && h.summary.length > 0) {
      console.log('');
      const TRUNC = 400;
      const out = h.summary.length > TRUNC ? `${h.summary.slice(0, TRUNC)} […]` : h.summary;
      console.log(out);
    }
    console.log('');
  }
  return 0;
};

/**
 * Federated ask — embeds the query locally, opens a short-lived libp2p
 * node, fans out to connected peers with a 2s per-peer deadline.
 */
const askFederated = async (runtime: Runtime, parsed: ParsedArgs): Promise<number> => {
  // 1. Embed the query locally
  const embedRes = await runtime.embedder.embed(parsed.query);
  if (embedRes.isErr()) {
    console.error(`ask --peers: ${formatError(embedRes.error)}`);
    return 1;
  }
  const embedding = embedRes.value;

  const identityPath = join(akashikHome(), 'peer-identity.json');
  const peersPath = join(akashikHome(), 'peers.json');
  const configPath = join(akashikHome(), 'config.yaml');

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
    listenPort: 0,
    listenHost: '127.0.0.1',
    mdns: cfg.peer.mdns,
    dhtEnabled: cfg.peer.dht.enabled,
    peersPath,
  });
  if (nodeRes.isErr()) {
    console.error(`ask --peers: ${formatError(nodeRes.error)}`);
    return 1;
  }
  const node = nodeRes.value;

  try {
    // Shared executor — same code path the daemon's IPC handler runs
    // on its live node (src/application/federated-ask.ts).
    const outcome = await executeFederatedAsk(
      {
        home: akashikHome(),
        node,
        vectorIndex: runtime.vectors,
        loadGraph: async () => {
          const r = await runtime.graphs.load();
          return r.isOk() ? r.value : null;
        },
        entityRegistry: runtime.entityRegistry,
        cacheNode: async (n, text) => {
          const r = await indexNode({
            graphs: runtime.graphs,
            vectors: runtime.vectors,
            embedder: runtime.embedder,
            githubUser: runtime.githubUser,
          })({ node: n, text });
          return r.isOk();
        },
      },
      { query: parsed.query, embedding, k: parsed.k, pull: parsed.pull },
    );
    if ('error' in outcome) {
      console.error(`ask --peers: ${outcome.error}`);
      return 1;
    }
    console.log(formatFederatedAsk(parsed.query, outcome, parsed.json));
    return 0;
  } finally {
    try {
      await node.stop();
    } catch {
      /* benign */
    }
  }
};
