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

const runWellinformed = (args, timeoutMs) => {
  try {
    return execFileSync('wellinformed', args, {
      timeout: timeoutMs,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    // Federated paths print valid JSON to stdout, then libp2p sometimes
    // throws StreamStateError during teardown. Non-zero exit but stdout
    // is intact — recover it here.
    return e.stdout && String(e.stdout).trim() ? String(e.stdout) : null;
  }
};

const parseAskOutput = (out) => {
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

const AUTO_PULL_PEER_BODY = process.env.WELLINFORMED_PREFETCH_AUTO_PULL !== '0';
// Distance threshold for triggering an auto-pull. Federation returns
// MiniLM-384 cosine distances; relevance for genuinely useful hits
// typically sits in 0.85–1.25 on a hybrid (BM25+vec) scorer. Default
// 1.30 catches the long tail of "peer has *something*" matches and
// errs toward fetching too much rather than too little — the network
// cost is tiny (metadata + few KB summary) and Claude can ignore
// irrelevant hits but cannot make up for absent ones.
const AUTO_PULL_DISTANCE_MAX = Number(process.env.WELLINFORMED_PREFETCH_AUTO_PULL_DISTANCE ?? 1.30);
const AUTO_PULL_TIMEOUT_MS = Number(process.env.WELLINFORMED_PREFETCH_AUTO_PULL_TIMEOUT_MS ?? 8000);

const localGraphCache = { loaded: false, byId: new Map() };
const loadLocalGraph = () => {
  if (localGraphCache.loaded) return localGraphCache.byId;
  try {
    const raw = readFileSync(join(HOME, 'graph.json'), 'utf8');
    const parsed = JSON.parse(raw);
    for (const n of parsed.nodes ?? []) {
      if (n?.id) localGraphCache.byId.set(n.id, n);
    }
  } catch { /* graph absent or corrupt — skip */ }
  localGraphCache.loaded = true;
  return localGraphCache.byId;
};

const fetchNodeLocal = (id) => {
  // Force a re-read of graph.json so we see nodes added by the touch
  // we just performed.
  localGraphCache.loaded = false;
  localGraphCache.byId.clear();
  const byId = loadLocalGraph();
  return byId.get(id) ?? null;
};

// peer-labels.json (written by `wellinformed login` / demo setup)
// maps libp2p PeerId → {github, did_short, display}. When a peer hit
// carries a known PeerId, render it as `github:<handle>` instead of
// `peer:<short_libp2p_id>`. Fall through to the libp2p form otherwise.
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

const maybeAutoPullPeerBody = (federatedResult, query) => {
  if (!AUTO_PULL_PEER_BODY) return federatedResult;
  const hits = [...(federatedResult.hits ?? [])];
  // Find peer-exclusive high-relevance hits whose body isn't already
  // local (no summary populated by federation, since metadata-only).
  const peerHitIdxs = [];
  hits.forEach((h, i) => {
    if (h?.source_peer && h.source_peer !== 'local' &&
        typeof h.distance === 'number' && h.distance <= AUTO_PULL_DISTANCE_MAX &&
        !h.summary && h.room) {
      peerHitIdxs.push(i);
    }
  });
  if (peerHitIdxs.length === 0) return federatedResult;
  // Pull rooms touched by these hits — cap at 2 distinct (peer, room)
  // pairs to bound prefetch cost.
  const seen = new Set();
  const targets = [];
  for (const i of peerHitIdxs) {
    const h = hits[i];
    const key = `${h.source_peer}::${h.room}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({ peer: h.source_peer, room: h.room });
    if (targets.length >= 2) break;
  }
  for (const t of targets) {
    runWellinformed(['touch', t.peer, '--room', t.room, '--max', '10'], AUTO_PULL_TIMEOUT_MS);
  }
  // After touch the bodies now live locally. Look each peer hit up by id
  // and graft the summary onto the federated hit so renderHits prints it.
  let pulledCount = 0;
  for (const i of peerHitIdxs) {
    const node = fetchNodeLocal(hits[i].id);
    if (node) {
      hits[i] = {
        ...hits[i],
        label: hits[i].label ?? node.label,
        summary: node.summary ?? node.body ?? hits[i].summary,
        source_uri: hits[i].source_uri ?? node.source_uri,
      };
      pulledCount++;
    }
  }
  return {
    ...federatedResult,
    hits,
    auto_pulled: pulledCount > 0 ? targets : [],
    auto_pulled_count: pulledCount,
  };
};

const prefetch = (query) => {
  const args = PREFETCH_PEERS
    ? ['ask', '--peers', '--json', '--k', '3', query]
    : ['ask', '--json', '--k', '3', query];
  const out = runWellinformed(args, PREFETCH_TIMEOUT_MS);
  if (!out) return null;
  const result = parseAskOutput(out);
  if (!result) return null;
  return PREFETCH_PEERS ? maybeAutoPullPeerBody(result, query) : result;
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
    const peer = formatPeer(h.source_peer);
    const summary = typeof h.summary === 'string'
      ? ` — ${h.summary.slice(0, 200).replace(/\s+/g, ' ')}`
      : '';
    return `  ${i + 1}. ${h.label ?? h.id} [${room}, ${peer}]${summary}\n     → ${h.source_uri ?? h.id}`;
  }).join('\n');
  const closer = [
    ``,
    `^ This block contains the federated answer. Bodies are inlined for`,
    `  peer hits that exceeded the auto-pull threshold. Refer to peers`,
    `  by their github:<handle> attribution (not "peer A/B/C"). Answer`,
    `  the user directly from these hits — no additional wellinformed,`,
    `  Grep, Read, or WebSearch calls are needed when the indexed`,
    `  context above already answers the question.`,
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
// Surface peer-attributed hits unconditionally — even a mid-satisfaction
// fan-out is valuable when a peer has the answer. Only gate on
// satisfaction when ALL hits are local (local-only retrievals fall back
// to the global threshold so noise gets filtered out).
const hasPeerHit = result.hits.some((h) => h?.source_peer && h.source_peer !== 'local');
if (!hasPeerHit && result.satisfaction !== null && result.satisfaction < MIN_SATISFACTION) {
  process.exit(0);
}

// systemMessage banner — surfaces in Claude Code's TUI as a status
// line so the watcher sees federation actually firing. Multi-line
// format:
//   getting wellinformed
//     peers:          4/4 responded
//     domains:        cryogenic-h2, spectroscopy
//     question:       "..."
//     latency:        287 ms
//     hits:           3 (top: github:stanford-cryo-lab:hr7DHqKy)
//     pulled body:    github:munich-h2-lab/research
const peerLine = result.peers_queried > 0
  ? `${result.peers_responded}/${result.peers_queried} responded`
  : `local-only`;
const domains = Array.from(new Set(result.hits.map((h) => h?.room).filter(Boolean))).join(', ');
const tookMs = result.took_ms != null ? `${result.took_ms} ms` : '—';
const topPeerLabel = result.hits[0]?.source_peer && result.hits[0].source_peer !== 'local'
  ? ` (top: ${formatPeer(result.hits[0].source_peer)})`
  : '';
const autoPulledLine = Array.isArray(result.auto_pulled) && result.auto_pulled.length > 0
  ? `\n  pulled body:    ${formatPeer(result.auto_pulled[0].peer)}/${result.auto_pulled[0].room}`
  : '';
const truncQ = truncated.length > 80 ? truncated.slice(0, 77) + '...' : truncated;
const sysMsg = [
  `getting wellinformed`,
  `  peers:          ${peerLine}`,
  `  domains:        ${domains || '(local-only)'}`,
  `  question:       "${truncQ}"`,
  `  latency:        ${tookMs}`,
  `  hits:           ${result.hits.length}${topPeerLabel}` + autoPulledLine,
].join('\n');

emit(renderHits(result, truncated), sysMsg);
