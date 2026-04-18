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
    return { stdout: payload + '\n', exit: 0 };
  }

  // Human-readable — matches src/cli/commands/ask.ts output verbatim
  if (matches.value.length === 0) {
    return {
      stdout: 'no results found. try a broader query or run `wellinformed trigger` to index content first.\n',
      exit: 0,
    };
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
  return { stdout: lines.join('\n'), exit: 0 };
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
  return h;
};

/**
 * List of CLI subcommands the client-side shim should attempt to
 * delegate over IPC. Must stay in sync with the keys in
 * buildIpcHandlers(). Used by bin/wellinformed.js to know whether to
 * try the socket before spawning.
 */
export const IPC_DELEGATABLE_COMMANDS: ReadonlySet<string> = new Set(['ask', 'stats']);
