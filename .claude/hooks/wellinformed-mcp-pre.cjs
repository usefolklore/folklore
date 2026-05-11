#!/usr/bin/env node
/**
 * wellinformed PreToolUse hook for the wellinformed MCP tool calls.
 *
 * When Claude invokes `mcp__wellinformed__*`, Claude Code's TUI shows
 * a bare "Calling wellinformed..." line. The user wants the rich
 * banner from the prompt-submit hook to land HERE too, so the call
 * is annotated with peers/domains/latency context.
 *
 * Strategy: extract the query from the tool input, run a quick
 * federated ask against it, and emit a banner identical in shape
 * to the UserPromptSubmit hook. Two short-circuits:
 *   1. If a fresh prefetch-cache entry exists for the same query,
 *      use that — no peer round-trip.
 *   2. Otherwise fire `wellinformed ask --peers --json` with a
 *      tight timeout. Failure paths exit 0 without output so the
 *      tool call proceeds normally.
 *
 * Reads the same peer-labels.json + cache surface as the
 * UserPromptSubmit hook, so peer attribution renders identically.
 */

'use strict';

const { execFileSync } = require('node:child_process');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const os = require('node:os');

const HOME = process.env.WELLINFORMED_HOME || join(os.homedir(), '.wellinformed');
const CACHE_PATH = join(HOME, 'prefetch-cache.jsonl');
const CACHE_MAX_AGE_MS = 60_000;
const PREFETCH_TIMEOUT_MS = Number(process.env.WELLINFORMED_MCP_PRE_TIMEOUT_MS ?? 15000);
const ENABLED = process.env.WELLINFORMED_MCP_PRE_HOOK !== '0';

// ─────────────── peer-label resolver (mirrors prompt-submit) ──────

let peerLabelsCache = null;
const loadPeerLabels = () => {
  if (peerLabelsCache !== null) return peerLabelsCache;
  try {
    const raw = readFileSync(join(HOME, 'peer-labels.json'), 'utf8');
    peerLabelsCache = JSON.parse(raw)?.peers ?? {};
  } catch { peerLabelsCache = {}; }
  return peerLabelsCache;
};
const formatPeer = (peerId) => {
  if (!peerId || peerId === 'local') return 'local';
  const labels = loadPeerLabels();
  const entry = labels[peerId];
  if (entry?.github) {
    const didShort = entry.did_short ? `:${entry.did_short}` : '';
    return `github:${entry.github}${didShort}`;
  }
  return `peer:${String(peerId).slice(0, 12)}`;
};

// ─────────────── extract query from tool input ──────

// The PreToolUse hook receives stdin JSON of shape:
//   {
//     "tool_name": "mcp__wellinformed__ask",
//     "tool_input": { "query": "...", ... }
//   }
// Each MCP tool may use a different field for its query. Pull from
// the common ones; bail if none present.
const safe = (fn) => { try { return fn(); } catch { return undefined; } };
const readPayload = () => safe(() => JSON.parse(readFileSync(0, 'utf8') || '{}')) ?? {};

const extractQuery = (input) => {
  if (!input || typeof input !== 'object') return null;
  if (typeof input.query === 'string' && input.query.length > 4) return input.query;
  if (typeof input.text === 'string' && input.text.length > 4) return input.text;
  if (typeof input.name === 'string' && input.name.length > 2) return input.name; // recall
  if (typeof input.q === 'string') return input.q;
  return null;
};

// ─────────────── cache short-circuit ──────

const readFreshCacheEntry = (query) => {
  if (!existsSync(CACHE_PATH)) return null;
  let raw;
  try { raw = readFileSync(CACHE_PATH, 'utf8'); } catch { return null; }
  const lines = raw.split('\n').filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try { entry = JSON.parse(lines[i]); } catch { continue; }
    if (entry?.query !== query) continue;
    const ageMs = Date.now() - Date.parse(entry.ts);
    if (!Number.isFinite(ageMs) || ageMs > CACHE_MAX_AGE_MS) continue;
    return entry;
  }
  return null;
};

// ─────────────── quick federated query (no auto-pull) ──────

const runWellinformed = (args, timeoutMs) => {
  try {
    return execFileSync('wellinformed', args, {
      timeout: timeoutMs,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    return e.stdout && String(e.stdout).trim() ? String(e.stdout) : null;
  }
};

const quickAsk = (query) => {
  const out = runWellinformed(
    ['ask', '--peers', '--json', '--k', '3', query],
    PREFETCH_TIMEOUT_MS,
  );
  if (!out) return null;
  try {
    const parsed = JSON.parse(out);
    const tele = parsed._telemetry ?? {};
    return {
      hits: Array.isArray(parsed.hits) ? parsed.hits : [],
      peers_responded: typeof parsed.peers_responded === 'number' ? parsed.peers_responded : 0,
      peers_queried: typeof parsed.peers_queried === 'number' ? parsed.peers_queried : 0,
      took_ms: typeof tele.took_ms === 'number' ? tele.took_ms : null,
    };
  } catch { return null; }
};

// ─────────────── banner render ──────

const renderBanner = (query, peers_responded, peers_queried, took_ms, hits) => {
  const peerLine = peers_queried > 0
    ? `${peers_responded}/${peers_queried} responded`
    : `local-only`;
  const domains = Array.from(new Set(hits.map((h) => h?.room).filter(Boolean))).join(', ');
  const tookMs = took_ms != null ? `${took_ms} ms` : '—';
  const topPeerLabel = hits[0]?.source_peer && hits[0].source_peer !== 'local'
    ? ` (top: ${formatPeer(hits[0].source_peer)})`
    : '';
  const truncQ = query.length > 80 ? query.slice(0, 77) + '...' : query;
  return [
    `getting wellinformed`,
    `  peers:          ${peerLine}`,
    `  domains:        ${domains || '(local-only)'}`,
    `  question:       "${truncQ}"`,
    `  latency:        ${tookMs}`,
    `  hits:           ${hits.length}${topPeerLabel}`,
  ].join('\n');
};

const emit = (text) => {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: text,
    },
  }) + '\n');
};

// ─────────────── main ──────

if (!ENABLED) process.exit(0);
const payload = readPayload();
const query = extractQuery(payload.tool_input);
if (!query) process.exit(0);

// Short-circuit on a fresh cache hit.
const cached = readFreshCacheEntry(query);
if (cached && cached.system_message) {
  emit(cached.system_message);
  process.exit(0);
}

// Otherwise quick-query peers + render.
const result = quickAsk(query);
if (!result) process.exit(0);

emit(renderBanner(
  query,
  result.peers_responded,
  result.peers_queried,
  result.took_ms,
  result.hits,
));
