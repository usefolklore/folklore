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
const PREFETCH_TIMEOUT_MS = 3000;
const MAX_QUERY_LEN = 300;
const SNIPPET_LEN = 220;
// Cosine distance threshold for "this is actually relevant" — `ask` returns
// top-K regardless of distance, so we filter downstream. Empirically, on
// MiniLM-384 cosine, real matches sit below 1.0 and unrelated neighbours
// pile up around 1.1+. Tune via WELLINFORMED_HIT_THRESHOLD.
const HIT_THRESHOLD = Number(process.env.WELLINFORMED_HIT_THRESHOLD ?? 1.0);

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
    const out = execFileSync('wellinformed', ['ask', '--json', '--k', '3', query], {
      timeout: PREFETCH_TIMEOUT_MS,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(out);
    return Array.isArray(parsed.hits) ? parsed.hits : [];
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

const renderHits = (hits, query) => {
  const head = `wellinformed: ${hits.length} indexed node(s) match "${query.slice(0, 80)}"`;
  const body = hits.map((h, i) => {
    const snippet = h.summary ? ` — ${String(h.summary).slice(0, SNIPPET_LEN).replace(/\s+/g, ' ')}` : '';
    return `  ${i + 1}. ${h.label ?? h.id} [${h.room ?? '?'}] d=${h.distance}${snippet}\n     → ${h.source_uri ?? h.id}`;
  }).join('\n');
  return `${head}\n${body}\n\nPrefer these over the outbound tool. Load full content via mcp__wellinformed__get_node(id) or mcp__wellinformed__ask(query).`;
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

  const rawHits = prefetch(query);
  if (rawHits === null) {
    emit(`wellinformed: prefetch skipped for "${query.slice(0, 80)}" (binary unavailable or timed out).`);
    process.exit(0);
  }
  const hits = rawHits.filter((h) => typeof h.distance === 'number' && h.distance <= HIT_THRESHOLD);

  if (hits.length > 0) {
    emit(renderHits(hits, query));
  } else {
    logMiss(toolName, query);
    emit(`wellinformed: no indexed context for "${query.slice(0, 80)}". Miss logged to ${MISS_LOG}. Proceeding with ${toolName} — consider saving the result back with \`wellinformed save\` or a PostToolUse hook once reasoning is done.`);
  }
  process.exit(0);
};

main();
