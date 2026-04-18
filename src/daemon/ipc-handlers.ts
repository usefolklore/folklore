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
import { getNode } from '../domain/graph.js';
import { searchByRoom, searchGlobal } from '../application/use-cases.js';
import { queryCache, type QueryCache } from '../domain/query-cache.js';
import { semanticCache, type SemanticCache } from '../domain/semantic-cache.js';

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

  const deps = {
    graphs: runtime.graphs,
    vectors: runtime.vectors,
    embedder: runtime.embedder,
  };

  const matches = parsed.room
    ? await searchByRoom(deps)({ room: parsed.room, text: parsed.query, k: parsed.k })
    : await searchGlobal(deps)({ text: parsed.query, k: parsed.k });

  if (matches.isErr()) {
    return { stdout: '', stderr: `ask: ${formatError(matches.error)}\n`, exit: 1 };
  }

  const graphRes = await runtime.graphs.load();
  if (graphRes.isErr()) {
    return { stdout: '', stderr: `ask: ${formatError(graphRes.error)}\n`, exit: 1 };
  }

  // JSON surface — same shape as src/cli/commands/ask.ts (local-only path)
  if (parsed.json) {
    const nowMs = Date.now();
    const hits = matches.value.map((m) => {
      const node = getNode(graphRes.value, m.node_id);
      const fetchedAt = typeof node?.fetched_at === 'string' ? node.fetched_at : null;
      const fetchedMs = fetchedAt ? Date.parse(fetchedAt) : NaN;
      const ageDays = Number.isFinite(fetchedMs)
        ? Number(((nowMs - fetchedMs) / 86_400_000).toFixed(2))
        : null;
      return {
        id: m.node_id,
        label: node?.label ?? null,
        room: node?.room ?? null,
        distance: Number(m.distance.toFixed(4)),
        source_uri: node?.source_uri ?? node?.source_file ?? null,
        summary: typeof node?.summary === 'string' ? (node.summary as string).slice(0, 400) : null,
        fetched_at: fetchedAt,
        age_days: ageDays,
      };
    });
    const payload = JSON.stringify({ query: parsed.query, room: parsed.room ?? null, hits });
    const stdout = payload + '\n';
    cache.set(cacheKey, stdout);
    if (queryVec) l2.set(queryVec, stdout);
    return { stdout, exit: 0 };
  }

  // Human-readable — matches src/cli/commands/ask.ts output verbatim
  if (matches.value.length === 0) {
    const stdout = 'no results found. try a broader query or run `wellinformed trigger` to index content first.\n';
    cache.set(cacheKey, stdout);
    if (queryVec) l2.set(queryVec, stdout);
    return { stdout, exit: 0 };
  }

  const lines: string[] = [];
  lines.push(`# wellinformed results for: ${parsed.query}`);
  if (parsed.room) lines.push(`room: ${parsed.room}`);
  lines.push('');
  for (const m of matches.value) {
    const node = getNode(graphRes.value, m.node_id);
    if (!node) {
      lines.push(`## [${m.node_id}] (not in graph)`);
      continue;
    }
    lines.push(`## ${node.label}`);
    lines.push(`distance: ${m.distance.toFixed(3)} | room: ${node.room ?? '-'} | wing: ${node.wing ?? '-'}`);
    lines.push(`source: ${node.source_uri ?? node.source_file ?? ''}`);
    if (node.published_at) lines.push(`published: ${node.published_at}`);
    if (node.author) lines.push(`author: ${node.author}`);
    lines.push('');
  }
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

// ─────────────── registry ───────────────

/**
 * Build the command→handler map. Called once by the daemon at startup.
 * Extending: add new handlers here. The daemon re-exposes them
 * automatically via the IPC protocol.
 */
export const buildIpcHandlers = (): Map<string, IpcHandler<Runtime>> => {
  const h = new Map<string, IpcHandler<Runtime>>();
  h.set('ask', askHandler);
  h.set('stats', statsHandler);
  h.set('cache-stats', cacheStatsHandler);
  return h;
};

/**
 * List of CLI subcommands the client-side shim should attempt to
 * delegate over IPC. Must stay in sync with the keys in
 * buildIpcHandlers(). Used by bin/wellinformed.js to know whether to
 * try the socket before spawning.
 */
export const IPC_DELEGATABLE_COMMANDS: ReadonlySet<string> = new Set(['ask', 'stats', 'cache-stats']);
