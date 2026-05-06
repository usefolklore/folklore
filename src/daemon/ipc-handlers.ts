/**
 * IPC command handlers — the daemon's "delegated work" registry.
 *
 * Each handler takes the parsed argv for one CLI subcommand plus the
 * warmed Runtime singleton, runs the work in-process (no spawn), and
 * returns a HandlerResult with formatted stdout + exit code.
 *
 * Invariants:
 *   - Handlers MUST NOT call `runtime.close()` — the Runtime outlives
 *     every request and is closed only on daemon shutdown.
 *   - Handlers MUST NOT write to `process.stdout` / `process.stderr`
 *     directly — all output flows through the HandlerResult so the
 *     IPC server can frame it over the socket.
 *   - Handlers MUST be idempotent / side-effect-free on the graph.
 *     Mutating commands (index, trigger, share) remain spawn-only in
 *     v4.0. Read-only queries route through IPC.
 */

import type { Runtime } from '../cli/runtime.js';
import type { HandlerResult, IpcHandler } from './ipc.js';
import { formatError } from '../domain/errors.js';
import { ask } from '../application/ask.js';
import { queryCache, type QueryCache } from '../domain/query-cache.js';
import { semanticCache, type SemanticCache } from '../domain/semantic-cache.js';
import type { JobQueue } from './job-queue.js';
import type { JobPayload } from '../domain/job.js';

// ─────────────── process-cached L1 query cache ───────────────

/**
 * Phase 5 — process-wide L1 query cache. Lives for the daemon's
 * lifetime; cleared on `cache.clear` admin command (future) or
 * daemon restart.
 *
 * Cache-key semantics match the IPC wire shape: `hash(cmd + args)`.
 * Identical queries from different agents hit the same cache. TTL
 * 60 s keeps stale entries out of the hot path without any
 * fine-grained invalidation layer.
 */
let ipcCache: QueryCache | null = null;
const getCache = (): QueryCache => {
  if (!ipcCache) ipcCache = queryCache({ maxEntries: 256, ttlMs: 60_000 });
  return ipcCache;
};

/**
 * Phase 5.1 — process-wide L2 semantic cache. Catches paraphrased
 * queries the L1 hash cache misses ("what's libp2p" vs "tell me about
 * libp2p" hash to different keys but embed to nearly the same vector).
 *
 * Cosine threshold 0.92 is conservative — picked so that retrieval-
 * relevance reordering between near-paraphrases stays inside the
 * NDCG@10 noise floor. Lower thresholds would catch more rephrasings
 * but risk serving the wrong cached result for a semantically nearby
 * but distinct question.
 */
let ipcL2: SemanticCache | null = null;
const getL2 = (): SemanticCache => {
  if (!ipcL2) ipcL2 = semanticCache({ maxEntries: 128, ttlMs: 60_000, defaultThreshold: 0.92 });
  return ipcL2;
};

/** Test seam — lets unit tests reset both cache layers between assertions. */
export const __resetIpcCache = (): void => { ipcCache = null; ipcL2 = null; };

/** Observability — daemon can expose this via a future `cache-stats` command. */
export const ipcCacheStats = () => getCache().stats();
export const ipcL2Stats = () => getL2().stats();

// ─────────────── ask handler ───────────────

interface AskArgs {
  readonly query: string;
  readonly room?: string;
  readonly k: number;
  readonly json: boolean;
}

const parseAskArgs = (args: readonly string[]): AskArgs | string => {
  let query = '';
  let room: string | undefined;
  let k = 5;
  let json = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--room') room = next();
    else if (a.startsWith('--room=')) room = a.slice('--room='.length);
    else if (a === '--k' || a === '-k') k = parseInt(next(), 10) || 5;
    else if (a.startsWith('--k=')) k = parseInt(a.slice('--k='.length), 10) || 5;
    else if (a === '--json') json = true;
    else if (a === '--peers') return 'IPC does not delegate --peers (libp2p needs a fresh node)';
    else if (!a.startsWith('-')) query = query ? `${query} ${a}` : a;
  }
  if (!query) return 'missing query — usage: wellinformed ask "your question" [--room R] [--k N] [--json]';
  return { query, room, k, json };
};

const askHandler: IpcHandler<Runtime> = async (args, runtime) => {
  const parsed = parseAskArgs(args);
  if (typeof parsed === 'string') {
    return { stdout: '', stderr: `ask: ${parsed}\n`, exit: 1 };
  }

  // Phase 5 — L1 (hash-keyed) cache lookup. Hit returns immediately.
  const cache = getCache();
  const cacheKey = cache.keyFor('ask', args);
  const cached = cache.get(cacheKey);
  if (cached) {
    return { stdout: cached.stdout, exit: 0 };
  }

  // Phase 5.1 — L2 semantic cache. We pre-embed the query once and
  // reuse the vector both for L2 lookup AND (on miss) for the search
  // path below. This is "embed once, route twice" — saves an ONNX
  // forward pass on the cache-miss code path vs the naive design.
  //
  // Only meaningful when not filtering by room: room-scoped cached
  // stdout from a different room would be misleading. Room queries
  // skip L2 and pay the full search cost. Acceptable: paraphrase hits
  // are dominated by global-room interactive queries.
  const l2 = getL2();
  let queryVec: Float32Array | null = null;
  if (!parsed.room) {
    const embRes = await runtime.embedder.embed(parsed.query);
    if (embRes.isErr()) {
      return { stdout: '', stderr: `ask: ${formatError(embRes.error)}\n`, exit: 1 };
    }
    queryVec = embRes.value;
    const semHit = l2.get(queryVec);
    if (semHit) {
      // Promote to L1 under the actual hash key so subsequent identical
      // requests skip the embed entirely.
      cache.set(cacheKey, semHit.stdout);
      return { stdout: semHit.stdout, exit: 0 };
    }
  }

  // Delegate to the application use case — single source of truth
  // for ask composition (search + recall + rerank + mention
  // enrichment). Same canonical AskResult shape that the CLI and
  // MCP surfaces consume.
  const result = await ask({
    graphs: runtime.graphs,
    vectors: runtime.vectors,
    embedder: runtime.embedder,
    entityRegistry: runtime.entityRegistry,
  })({ query: parsed.query, room: parsed.room, k: parsed.k });

  if (result.isErr()) {
    return { stdout: '', stderr: `ask: ${formatError(result.error)}\n`, exit: 1 };
  }
  const r = result.value;

  if (parsed.json) {
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
    const payload: Record<string, unknown> = {
      query: r.query,
      room: r.room ?? null,
      hits,
      reranked: r.reranked,
      // Agent contract — completeness/decision so callers can
      // decide whether to fall through to WebSearch. Same shape
      // as the CLI output for consistency.
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
      payload.resolved_entity = {
        id: r.resolved_entity.id,
        label: r.resolved_entity.label,
        type: r.resolved_entity.type,
        mention_count: r.resolved_entity.mention_count,
      };
    }
    if (r.recall_result) {
      payload.recall = {
        total: r.recall_result.total,
        hits: r.recall_result.hits,
      };
    }
    const stdout = JSON.stringify(payload) + '\n';
    cache.set(cacheKey, stdout);
    if (queryVec) l2.set(queryVec, stdout);
    return { stdout, exit: 0 };
  }

  // Human-readable rendering
  if (r.search_hits.length === 0 && !r.resolved_entity) {
    const stdout = 'no results found. try a broader query or run `wellinformed trigger` to index content first.\n';
    cache.set(cacheKey, stdout);
    if (queryVec) l2.set(queryVec, stdout);
    return { stdout, exit: 0 };
  }

  const lines: string[] = [];

  // Entity recall block — when the query matches a registered entity,
  // surface this block FIRST. The user's question framed it: "if I
  // say lemlist you need to remember everything said in the lemlist
  // sense." This composition is the visible answer.
  if (r.resolved_entity && r.recall_result && r.recall_result.hits.length > 0) {
    const e = r.resolved_entity;
    lines.push(`# wellinformed: "${r.query}" matches entity ${e.id}`);
    lines.push(`type: ${e.type} | aliases: ${e.aliases.join(', ')} | mentions: ${r.recall_result.total}`);
    lines.push('');
    lines.push(`## entity recall (top ${r.recall_result.hits.length})`);
    for (const h of r.recall_result.hits) {
      const room = h.room ?? '-';
      const ageStr =
        h.age_days === undefined ? ''
        : h.age_days < 1 ? ' · today'
        : h.age_days < 14 ? ` · ${Math.round(h.age_days)}d`
        : h.age_days < 90 ? ` · ${Math.round(h.age_days / 7)}w`
        : ` · ${Math.round(h.age_days / 30)}mo`;
      lines.push(`  - ${h.label} [${room}${ageStr}] surface: "${h.surface}"`);
    }
    lines.push('');
  }

  if (r.search_hits.length > 0) {
    lines.push('## semantic search results');
    if (r.room) lines.push(`room: ${r.room}`);
    if (r.reranked) lines.push('ranked by: relevance × recency-decay');
    lines.push('');
    for (const h of r.search_hits) {
      lines.push(`### ${h.label}`);
      lines.push(`distance: ${h.distance.toFixed(3)} | room: ${h.room ?? '-'}`);
      if (h.source_uri) lines.push(`source: ${h.source_uri}`);
      if (h.mentioned_entities.length > 0) {
        const ents = h.mentioned_entities.slice(0, 5).map((e) => e.label).join(', ');
        const more = h.mentioned_entities.length > 5 ? `, +${h.mentioned_entities.length - 5}` : '';
        lines.push(`mentions: ${ents}${more}`);
      }
      if (typeof h.summary === 'string' && h.summary.length > 0) {
        lines.push('');
        lines.push(h.summary.slice(0, 400));
      }
      lines.push('');
    }
  }

  // Agent contract — same line shape as CLI ask. Lets the calling
  // agent (smart-hook → Claude) decide whether the indexed context
  // is enough or it should fall through to WebSearch.
  const s = r.satisfaction;
  lines.push(`action: ${r.decision}  satisfaction: ${s.score.toFixed(2)}  · fresh=${s.fresh_count} stale=${s.stale_count} missing_provenance=${s.missing_provenance_count}`);
  if (s.reasons.length > 0) lines.push(`reasons: ${s.reasons.slice(0, 3).join(' · ')}`);
  if (s.penalties.length > 0) lines.push(`penalties: ${s.penalties.slice(0, 3).join(' · ')}`);

  const stdout = lines.join('\n');
  cache.set(cacheKey, stdout);
  if (queryVec) l2.set(queryVec, stdout);
  return { stdout, exit: 0 };
};

// ─────────────── cache-stats handler (Phase 5 observability) ─────

/**
 * Returns the L1 query cache stats as a JSON line. The CLI surface
 * (wellinformed cache-stats) prints this for operators monitoring
 * cache effectiveness on real workloads.
 */
const cacheStatsHandler: IpcHandler<Runtime> = async (_args, _runtime): Promise<HandlerResult> => {
  const l1 = ipcCacheStats();
  const l2 = ipcL2Stats();
  return {
    stdout: JSON.stringify({
      l1: {
        size: l1.size,
        hits: l1.hits,
        misses: l1.misses,
        evictions: l1.evictions,
        hit_rate: Number(l1.hit_rate.toFixed(4)),
      },
      l2: {
        size: l2.size,
        hits: l2.hits,
        misses: l2.misses,
        evictions: l2.evictions,
        hit_rate: Number(l2.hit_rate.toFixed(4)),
        average_hit_similarity: Number(l2.average_hit_similarity.toFixed(4)),
      },
      via: 'daemon-ipc',
    }) + '\n',
    exit: 0,
  };
};

// ─────────────── stats handler (fast "is the daemon alive + what's indexed") ───────────────

const statsHandler: IpcHandler<Runtime> = async (_args, runtime): Promise<HandlerResult> => {
  const graphRes = await runtime.graphs.load();
  if (graphRes.isErr()) {
    return { stdout: '', stderr: `stats: ${formatError(graphRes.error)}\n`, exit: 1 };
  }
  const graph = graphRes.value;
  const nodes = graph.json.nodes.length;
  const edges = graph.json.links.length;
  const vectors = runtime.vectors.size();
  // Rooms: count distinct room values
  const rooms = new Set<string>();
  for (const n of graph.json.nodes) {
    const r = (n as { room?: string }).room;
    if (typeof r === 'string') rooms.add(r);
  }
  return {
    stdout: JSON.stringify({
      nodes,
      edges,
      vectors,
      rooms: rooms.size,
      via: 'daemon-ipc',
    }) + '\n',
    exit: 0,
  };
};

// ─────────────── jobs handlers ───────────────

/**
 * `wellinformed jobs submit <kind> <...args>` over IPC.
 *
 * Args shape:
 *   submit ingest:room <room>
 *   submit ingest:file <room> <path>
 *   submit ingest:session [path]
 *
 * The queue captured in the closure is the daemon-owned singleton.
 * Returns the assigned job id on stdout (one line, no trailing brace
 * spam — keeps `wellinformed this | xargs` style scripting easy).
 */
const submitJobHandler = (queue: JobQueue): IpcHandler<Runtime> =>
  async (args): Promise<HandlerResult> => {
    const [kind, ...rest] = args;
    let payload: JobPayload | string;
    if (kind === 'ingest:room') {
      if (!rest[0]) payload = 'usage: submit ingest:room <room>';
      else payload = { kind: 'ingest:room', room: rest[0] };
    } else if (kind === 'ingest:file') {
      if (!rest[0] || !rest[1]) payload = 'usage: submit ingest:file <room> <path>';
      else payload = { kind: 'ingest:file', room: rest[0], path: rest[1] };
    } else if (kind === 'ingest:session') {
      payload = { kind: 'ingest:session', path: rest[0] };
    } else if (kind === 'ingest:project') {
      if (!rest[0] || !rest[1]) payload = 'usage: submit ingest:project <room> <root>';
      else payload = { kind: 'ingest:project', room: rest[0], root: rest[1] };
    } else if (kind === 'ingest:batch') {
      if (!rest[0] || rest.length < 2) payload = 'usage: submit ingest:batch <room> <path1> [path2 ...]';
      else payload = { kind: 'ingest:batch', room: rest[0], paths: rest.slice(1) };
    } else {
      payload = `unknown job kind: ${kind ?? '<missing>'}`;
    }
    if (typeof payload === 'string') {
      return { stdout: '', stderr: `submit: ${payload}\n`, exit: 1 };
    }
    const id = queue.submit(payload);
    return { stdout: `${id}\n`, exit: 0 };
  };

const jobsListHandler = (queue: JobQueue): IpcHandler<Runtime> =>
  async (args): Promise<HandlerResult> => {
    const json = args.includes('--json');
    const live = args.includes('--live'); // queued + running only
    const all = queue.list();
    const filtered = live
      ? all.filter((j) => j.status === 'queued' || j.status === 'running')
      : all;
    if (json) {
      return { stdout: JSON.stringify({ jobs: filtered }) + '\n', exit: 0 };
    }
    if (filtered.length === 0) {
      return { stdout: 'no jobs\n', exit: 0 };
    }
    const lines = filtered
      .slice()
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((j) => {
        const tag = j.status.padEnd(7);
        const summary = j.result_summary ?? j.error ?? '';
        return `  [${tag}] ${j.id}  ${j.kind.padEnd(16)} ${summary}`;
      });
    return { stdout: lines.join('\n') + '\n', exit: 0 };
  };

const jobsClearHandler = (queue: JobQueue): IpcHandler<Runtime> =>
  async (args): Promise<HandlerResult> => {
    const all = args.includes('--all');
    const removed = all ? queue.clearAll() : queue.clearTerminal();
    return {
      stdout: `cleared ${removed} ${all ? 'queued+terminal' : 'terminal'} job(s)\n`,
      exit: 0,
    };
  };

// ─────────────── registry ───────────────

/**
 * Build the command→handler map. Called once by the daemon at startup.
 * The optional JobQueue argument enables the `submit-job` /
 * `jobs-list` / `jobs-clear` handlers; without it those commands are
 * absent from the registry and the client falls back to spawning a
 * fresh process (which itself errors with "daemon not running" — see
 * src/cli/commands/jobs.ts).
 */
export const buildIpcHandlers = (queue?: JobQueue): Map<string, IpcHandler<Runtime>> => {
  const h = new Map<string, IpcHandler<Runtime>>();
  h.set('ask', askHandler);
  h.set('stats', statsHandler);
  h.set('cache-stats', cacheStatsHandler);
  if (queue) {
    h.set('submit-job', submitJobHandler(queue));
    h.set('jobs-list', jobsListHandler(queue));
    h.set('jobs-clear', jobsClearHandler(queue));
  }
  return h;
};

/**
 * List of CLI subcommands the client-side shim should attempt to
 * delegate over IPC. Must stay in sync with the keys in
 * buildIpcHandlers(). Used by bin/wellinformed.js to know whether to
 * try the socket before spawning.
 */
export const IPC_DELEGATABLE_COMMANDS: ReadonlySet<string> = new Set([
  'ask', 'stats', 'cache-stats',
  'submit-job', 'jobs-list', 'jobs-clear',
]);
