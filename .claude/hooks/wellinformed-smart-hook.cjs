#!/usr/bin/env node
/**
 * wellinformed PreToolUse smart hook.
 *
 * Runs BEFORE Claude calls Grep / Glob / Read / WebSearch / WebFetch.
 * Extracts a query from the tool input, runs `wellinformed ask --json`
 * against the knowledge graph, and injects results into additionalContext.
 *
 * Hit path  : top-3 nodes + ids + rooms + source URIs → Claude answers
 *             from the graph without the outbound tool call.
 * Miss path : append {tool, query, ts} to ~/.wellinformed/miss-log.jsonl
 *             so the user can later decide whether to ingest.
 *
 * Graceful degradation: if the graph doesn't exist, the binary isn't on
 * PATH, the prefetch times out, or the payload is malformed — exit 0
 * with no output so Claude's original tool call proceeds normally.
 */

'use strict';

const { execFileSync } = require('node:child_process');
const { readFileSync, appendFileSync, mkdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const os = require('node:os');

const HOME = process.env.WELLINFORMED_HOME || join(os.homedir(), '.wellinformed');
const GRAPH_PATH = join(HOME, 'graph.json');
const MISS_LOG = join(HOME, 'miss-log.jsonl');
const PREFETCH_TIMEOUT_MS = Number(process.env.WELLINFORMED_PREFETCH_TIMEOUT_MS ?? 4500);
const MAX_QUERY_LEN = 300;
const SNIPPET_LEN = 220;
// Relevance filter — two signals combined:
//
//   1. Absolute distance cap. Empirically on MiniLM-384 with hybrid
//      RRF scoring, the best hit for a genuinely relevant query lands
//      around 0.9–1.05, while a garbage query's best still sits
//      around 1.06–1.12 (the nearest-neighbour noise floor). 1.05
//      splits them cleanly — false positives from "nearest neighbour
//      of something" get rejected.
//
//   2. Gap signal. If the best hit's distance is within epsilon of
//      the third, the results are all tied at the noise floor — no
//      clear winner, reject everything. A sharp gap means the top
//      hit stands out; a flat curve means no hit stands out at all.
//
// Tune both via env vars if the corpus shifts (larger graph = more
// aggressive noise floor, so raise the cap).
const HIT_THRESHOLD = Number(process.env.WELLINFORMED_HIT_THRESHOLD ?? 1.05);
const GAP_MIN = Number(process.env.WELLINFORMED_GAP_MIN ?? 0.02);
// Federated-first prefetch — "the network before the web" is the product
// promise, and the hook has to live up to it. With peers enabled, we run
// `ask --peers --json` which embeds once locally, fans out to every
// connected peer with a 2s per-peer deadline, and merges results with
// local search. If no peers are connected (fresh install, daemon not
// running), federated gracefully degrades to local-only. Set
// WELLINFORMED_PREFETCH_PEERS=0 to force local-only.
const PREFETCH_PEERS = process.env.WELLINFORMED_PREFETCH_PEERS !== '0';

const emit = (text) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: text,
    },
  }) + '\n');
};

const safe = (fn) => { try { return fn(); } catch { return undefined; } };

const readPayload = () => safe(() => JSON.parse(readFileSync(0, 'utf8') || '{}')) ?? {};

const queryFromInput = (toolName, ti) => {
  if (!ti || typeof ti !== 'object') return '';
  if (toolName === 'WebSearch') return String(ti.query ?? '');
  if (toolName === 'WebFetch')  return [ti.prompt, ti.url].filter(Boolean).join(' ');
  if (toolName === 'Grep')      return String(ti.pattern ?? '');
  if (toolName === 'Glob')      return String(ti.pattern ?? '');
  return ''; // Read: path is not a semantic query
};

const prefetch = (query) => {
  try {
    const args = PREFETCH_PEERS
      ? ['ask', '--peers', '--json', '--k', '3', query]
      : ['ask', '--json', '--k', '3', query];
    const out = execFileSync('wellinformed', args, {
      timeout: PREFETCH_TIMEOUT_MS,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(out);
    return {
      hits: Array.isArray(parsed.hits) ? parsed.hits : [],
      peers_queried: typeof parsed.peers_queried === 'number' ? parsed.peers_queried : 0,
      peers_responded: typeof parsed.peers_responded === 'number' ? parsed.peers_responded : 0,
    };
  } catch {
    return null;
  }
};

const logMiss = (tool, query) => safe(() => {
  if (!existsSync(HOME)) mkdirSync(HOME, { recursive: true });
  appendFileSync(MISS_LOG, JSON.stringify({
    ts: new Date().toISOString(),
    tool,
    query: query.slice(0, MAX_QUERY_LEN),
  }) + '\n');
});

const renderAge = (h) => {
  // age_days arrives as a fractional number or null; format coarsely so
  // Claude can act on it without parsing: "today" / "3d" / "6w" / "11mo"
  if (typeof h.age_days !== 'number') return 'age:?';
  const d = h.age_days;
  if (d < 1)     return 'today';
  if (d < 14)    return `${Math.round(d)}d`;
  if (d < 90)    return `${Math.round(d / 7)}w`;
  return `${Math.round(d / 30)}mo`;
};

const renderPeer = (h) => {
  const p = h.source_peer ?? 'local';
  return p === 'local' ? 'local' : `peer:${p.slice(0, 12)}`;
};

const renderHits = (hits, query, peersMeta) => {
  const peerSummary = peersMeta && peersMeta.peers_queried > 0
    ? ` (queried ${peersMeta.peers_responded}/${peersMeta.peers_queried} peer(s))`
    : '';
  const head = `wellinformed: ${hits.length} indexed node(s) match "${query.slice(0, 80)}"${peerSummary}`;
  const body = hits.map((h, i) => {
    const snippet = h.summary ? ` — ${String(h.summary).slice(0, SNIPPET_LEN).replace(/\s+/g, ' ')}` : '';
    return `  ${i + 1}. ${h.label ?? h.id} [${h.room ?? '?'}, ${renderAge(h)}, ${renderPeer(h)}] d=${h.distance}${snippet}\n     → ${h.source_uri ?? h.id}`;
  }).join('\n');
  return `${head}\n${body}\n\nPrefer these over the outbound tool. Load full content via mcp__wellinformed__get_node(id) or mcp__wellinformed__ask(query). If a hit's age is stale for the task (research > 7d, toolshed > 30d), trigger a fresh pull via WebFetch / WebSearch / \`wellinformed trigger\` instead of trusting the cache.`;
};

const main = () => {
  if (!existsSync(GRAPH_PATH)) { process.exit(0); }

  const payload = readPayload();
  const toolName = String(payload.tool_name ?? '');
  const ti = payload.tool_input ?? {};
  const query = queryFromInput(toolName, ti).trim();

  if (!query || query.length < 3) {
    emit('wellinformed: knowledge graph is live. Use search / ask / get_node MCP tools before outbound lookups.');
    process.exit(0);
  }

  const prefetchResult = prefetch(query);
  if (prefetchResult === null) {
    emit(`wellinformed: prefetch skipped for "${query.slice(0, 80)}" (binary unavailable or timed out).`);
    process.exit(0);
  }
  // Two-stage relevance filter (see threshold constants above). First
  // cap absolute distance; then if the best remaining hit is within
  // GAP_MIN of the last, reject the whole set as "flat noise floor."
  const below = prefetchResult.hits.filter((h) => typeof h.distance === 'number' && h.distance <= HIT_THRESHOLD);
  const hits = (() => {
    if (below.length === 0) return below;
    if (below.length === 1) return below;
    const best = below[0].distance;
    const worst = below[below.length - 1].distance;
    return worst - best >= GAP_MIN ? below : [below[0]];
  })();
  const peersMeta = {
    peers_queried: prefetchResult.peers_queried,
    peers_responded: prefetchResult.peers_responded,
  };

  if (hits.length > 0) {
    emit(renderHits(hits, query, peersMeta));
  } else {
    logMiss(toolName, query);
    const peerNote = peersMeta.peers_queried > 0
      ? ` (network checked: ${peersMeta.peers_responded}/${peersMeta.peers_queried} peer(s) responded, none had a match)`
      : '';
    emit(`wellinformed: no indexed context for "${query.slice(0, 80)}"${peerNote}. Miss logged to ${MISS_LOG}. Proceeding with ${toolName} — consider saving the result back with \`wellinformed save\` or a PostToolUse hook once reasoning is done.`);
  }
  process.exit(0);
};

main();
