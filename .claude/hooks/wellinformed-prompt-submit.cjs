#!/usr/bin/env node
/**
 * wellinformed UserPromptSubmit hook.
 *
 * Fires BEFORE Claude reads the user's message. Runs `wellinformed
 * ask` against the prompt text and injects the result into Claude's
 * context AT THE UserPromptSubmit LEVEL — so the LLM sees the
 * retrieval block alongside the user's prompt, with no round-trip
 * required for the first tool call.
 *
 * Why this event matters more than PreToolUse alone:
 *   PreToolUse fires AFTER Claude has read the prompt and decided
 *   to use a tool. UserPromptSubmit fires BEFORE Claude reads the
 *   prompt at all — high-quality retrieval can prevent Claude from
 *   EVEN ATTEMPTING a WebSearch in the first place.
 *
 *   The PreToolUse hook stays as a fallback for cases the prompt
 *   itself didn't surface (Claude derived a more specific query
 *   from internal reasoning before calling a tool).
 *
 * Graceful degradation: identical to PreToolUse — every error path
 * exits 0 with no output so Claude proceeds normally.
 */

'use strict';

const { execFileSync } = require('node:child_process');
const { readFileSync, appendFileSync, mkdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');
const os = require('node:os');

const HOME = process.env.WELLINFORMED_HOME || join(os.homedir(), '.wellinformed');
const PROMPT_LOG = join(HOME, 'prompt-prefetch-log.jsonl');
const PREFETCH_TIMEOUT_MS = Number(process.env.WELLINFORMED_PREFETCH_TIMEOUT_MS ?? 4500);
const MIN_PROMPT_LEN = 6;
const MAX_PROMPT_LEN = 800;
const MIN_SATISFACTION = 0.55;
const PREFETCH_PEERS = process.env.WELLINFORMED_PREFETCH_PEERS !== '0';
const ENABLED = process.env.WELLINFORMED_PROMPT_PREFETCH !== '0';

const safe = (fn) => { try { return fn(); } catch { return undefined; } };
const readPayload = () => safe(() => JSON.parse(readFileSync(0, 'utf8') || '{}')) ?? {};

const emit = (text, systemMessage) => {
  const payload = {
    hookSpecificOutput: {
      hookEventName: 'UserPromptSubmit',
      additionalContext: text,
    },
  };
  if (systemMessage) payload.systemMessage = systemMessage;
  process.stdout.write(JSON.stringify(payload) + '\n');
};

const prefetch = (query) => {
  const args = PREFETCH_PEERS
    ? ['ask', '--peers', '--json', '--k', '3', query]
    : ['ask', '--json', '--k', '3', query];
  let out;
  try {
    out = execFileSync('wellinformed', args, {
      timeout: PREFETCH_TIMEOUT_MS,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    // The federated path prints valid JSON to stdout, then libp2p
    // sometimes throws StreamStateError during teardown — non-zero
    // exit but the JSON is already on stdout. Recover it here.
    out = e.stdout && String(e.stdout).trim() ? String(e.stdout) : null;
    if (!out) return null;
  }
  try {
    const parsed = JSON.parse(out);
    const tele = parsed._telemetry ?? {};
    const sat = typeof parsed.satisfaction === 'number'
      ? parsed.satisfaction
      : (typeof tele.satisfaction?.score === 'number' ? tele.satisfaction.score : null);
    const dec = typeof parsed.decision === 'string'
      ? parsed.decision
      : (typeof tele.decision === 'string' ? tele.decision : null);
    return {
      hits: Array.isArray(parsed.hits) ? parsed.hits : [],
      satisfaction: sat,
      decision: dec,
      peers_responded: typeof parsed.peers_responded === 'number' ? parsed.peers_responded : 0,
      peers_queried: typeof parsed.peers_queried === 'number' ? parsed.peers_queried : 0,
      took_ms: typeof tele.took_ms === 'number' ? tele.took_ms : null,
    };
  } catch {
    return null;
  }
};

const renderHits = (result, query) => {
  const hits = result.hits.slice(0, 3);
  const head = [
    `# wellinformed agent contract (hook_event: UserPromptSubmit, hook_version: 2)`,
    `decision:      ${result.decision ?? 'unknown'}`,
    `satisfaction:  ${(result.satisfaction ?? 0).toFixed(2)}  (range 0.00–1.00)`,
    `thresholds:    ≥0.85 use_memory · ≥0.65 verify_one_source · ≥0.40 search_required · <0.40 ask_user`,
    result.peers_queried > 0
      ? `peers:         ${result.peers_responded}/${result.peers_queried} responded`
      : `peers:         (no federation this query)`,
    ``,
    `## indexed context for: "${query.slice(0, 80)}"`,
  ].join('\n');
  const body = hits.map((h, i) => {
    const room = h.room ?? '?';
    const peer = h.source_peer && h.source_peer !== 'local'
      ? `peer:${String(h.source_peer).slice(0, 12)}`
      : 'local';
    const summary = typeof h.summary === 'string'
      ? ` — ${h.summary.slice(0, 200).replace(/\s+/g, ' ')}`
      : '';
    return `  ${i + 1}. ${h.label ?? h.id} [${room}, ${peer}]${summary}\n     → ${h.source_uri ?? h.id}`;
  }).join('\n');
  const closer = [
    ``,
    `^ Pull a node's full content via mcp__wellinformed__get_node(id),`,
    `  or run mcp__wellinformed__ask(query) for richer retrieval.`,
    `  When decision=use_memory, the indexed context above answers`,
    `  the user — no WebSearch needed unless the user explicitly`,
    `  asked for fresh-from-the-web sources.`,
  ].join('\n');
  return `${head}\n${body}${closer}`;
};

const logPrefetch = (query, result) => safe(() => {
  if (!existsSync(HOME)) mkdirSync(HOME, { recursive: true });
  appendFileSync(PROMPT_LOG, JSON.stringify({
    ts: new Date().toISOString(),
    query: query.slice(0, MAX_PROMPT_LEN),
    decision: result?.decision ?? null,
    satisfaction: result?.satisfaction ?? null,
    hits: result?.hits.length ?? 0,
  }) + '\n');
});

// ─────────────── main ──────────────────────

if (!ENABLED) process.exit(0);
const payload = readPayload();
const prompt = String(payload.prompt ?? '').trim();
if (prompt.length < MIN_PROMPT_LEN) process.exit(0);

const truncated = prompt.length > MAX_PROMPT_LEN ? prompt.slice(0, MAX_PROMPT_LEN) : prompt;
const result = prefetch(truncated);
if (!result) process.exit(0);
logPrefetch(truncated, result);

if (result.hits.length === 0) process.exit(0);
if (result.satisfaction !== null && result.satisfaction < MIN_SATISFACTION) process.exit(0);

// systemMessage banner — surfaces in Claude Code's TUI as a status
// line so the watcher sees federation actually firing. Format:
//   "▶ wellinformed: 4 peers · 2 rooms · 287ms · 3 hits"
const peerLine = result.peers_queried > 0
  ? `${result.peers_responded}/${result.peers_queried} peers`
  : `local-only`;
const distinctRooms = new Set(result.hits.map((h) => h?.room).filter(Boolean)).size;
const tookMs = result.took_ms != null ? `${result.took_ms} ms` : '—';
const topPeer = result.hits[0]?.source_peer && result.hits[0].source_peer !== 'local'
  ? ` · top hit from peer:${String(result.hits[0].source_peer).slice(0, 12)}`
  : '';
const sysMsg = `▶ wellinformed: ${peerLine} · ${distinctRooms} rooms · ${tookMs} · ${result.hits.length} hits${topPeer}`;

emit(renderHits(result, truncated), sysMsg);
