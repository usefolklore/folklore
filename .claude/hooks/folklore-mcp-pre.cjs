#!/usr/bin/env node
/**
 * folklore PreToolUse hook for the folklore MCP tool calls.
 *
 * When Claude invokes `mcp__folklore__*`, Claude Code's TUI shows
 * a bare "Calling folklore..." line. The user wants the rich
 * banner from the prompt-submit hook to land HERE too, so the call
 * is annotated with peers/domains/latency context.
 *
 * Strategy: extract the query from the tool input, run a quick
 * federated ask against it, and emit a banner identical in shape
 * to the UserPromptSubmit hook. Two short-circuits:
 *   1. If a fresh prefetch-cache entry exists for the same query,
 *      use that — no peer round-trip.
 *   2. Otherwise fire `folklore ask --peers --json` with a
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

const HOME = process.env.FOLKLORE_HOME || join(os.homedir(), '.folklore');
const CACHE_PATH = join(HOME, 'prefetch-cache.jsonl');

// Resolve the folklore engine: FOLKLORE_BIN → repo-local dist build →
// `folklore` on PATH (no global install required during local dev).
const resolveEngine = () => {
  const bin = process.env.FOLKLORE_BIN;
  if (bin && existsSync(bin)) return { cmd: bin, pre: [] };
  const repoRoot = process.env.CLAUDE_PROJECT_DIR || join(__dirname, '..', '..');
  const distCli = join(repoRoot, 'dist', 'cli', 'index.js');
  if (existsSync(distCli)) return { cmd: process.execPath, pre: [distCli] };
  return { cmd: 'folklore', pre: [] };
};
const ENGINE = resolveEngine();
const CACHE_MAX_AGE_MS = 60_000;
const PREFETCH_TIMEOUT_MS = Number(process.env.FOLKLORE_MCP_PRE_TIMEOUT_MS ?? 15000);
const ENABLED = process.env.FOLKLORE_MCP_PRE_HOOK !== '0';

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
// Peer identity rendering. The github handle here is the user's
// OAuth-verified github username (from `folklore login`), not a
// repo path — peer identity is the parallel of a DID anchored in a
// centrally-credible github account. Render as `@handle` (handle
// form, not org/repo form) to keep the distinction clean.
const formatPeer = (peerId) => {
  if (!peerId || peerId === 'local') return 'local';
  const labels = loadPeerLabels();
  const entry = labels[peerId];
  if (entry?.github) return `@${entry.github}`;
  return `peer:${String(peerId).slice(0, 12)}`;
};

// ─────────────── topic extractor ──────
//
// Pulls the dominant subject keywords from a hit set. Used to render
// the banner's `domain <topic>, <topic>` slot honestly — these are
// extracted from the content, not the room name (which was the prior
// misleading behaviour).
//
// Tokens are case-folded, stopword-filtered, and ranked by frequency.
// Single-character tokens dropped; hyphenated compounds (lh2-storage,
// graph-rag) preserved whole. The top N labels make it to the
// banner — typically 2-3 short tags like "raman, lh2, spectroscopy".
const TOPIC_STOPWORDS = new Set([
  // articles + prepositions
  'a','an','the','of','in','on','at','for','to','from','with','by','as','via',
  // conjunctions + pronouns
  'and','or','but','if','then','else','this','that','these','those','their','its','our','your','his','her','they','them','it',
  // BE / HAVE / DO verbs
  'is','are','was','were','be','been','being','am',
  'have','has','had','having','do','does','did','done','doing',
  // generic project-y noise that isn't topical
  'eval','build','version','peer','exclusive','notes','summary','use','using','used',
  'new','old','first','last','top','bottom','more','most','less','least',
  'one','two','three','many','few','some','any','all','no','not','only','just',
  'how','what','which','why','where','when','who','whom',
  // numeric tokens swallowed below; keep noise short
  'web','file','code','chunk','part','example','version','test','run','runs',
]);

const extractTopics = (hits, n = 3) => {
  const freq = new Map();
  for (const h of hits || []) {
    // Pull from label + summary + id slug. The id often carries the
    // most topical signal (concept://YYYY-MM-DD/open-hardware-raman-lh2)
    // when peer-attributed hits arrive with empty label/summary.
    const idSlug = typeof h?.id === 'string'
      ? h.id.replace(/^[a-z0-9\-]+:\/\//, '').replace(/^\d{4}-\d{2}-\d{2}\//, '').replace(/[\-_/]+/g, ' ')
      : '';
    const text = `${h?.label ?? ''} ${h?.summary ?? ''} ${idSlug}`;
    if (!text.trim()) continue;
    const tokens = text
      .split(/[\s,;:!?()\[\]\\"'`<>{}|*/=]+/)
      .map((t) => t.toLowerCase().replace(/^[\-.]+|[\-.,;:!?]+$/g, ''))
      .filter((t) => {
        if (t.length < 3) return false;
        if (TOPIC_STOPWORDS.has(t)) return false;
        if (/^\d+$/.test(t)) return false;            // pure numbers
        if (/^https?:\/\//.test(t)) return false;     // URLs
        if (/^[a-z0-9\-]+:\/\//.test(t)) return false; // schemes
        return true;
      });
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([t]) => t);
};

// ─────────────── extract query from tool input ──────

// The PreToolUse hook receives stdin JSON of shape:
//   {
//     "tool_name": "mcp__folklore__ask",
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

const runFolklore = (args, timeoutMs) => {
  try {
    return execFileSync(ENGINE.cmd, [...ENGINE.pre, ...args], {
      timeout: timeoutMs,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    return e.stdout && String(e.stdout).trim() ? String(e.stdout) : null;
  }
};

const quickAsk = (query) => {
  const out = runFolklore(
    ['ask', '--peers', '--json', '--k', '3', query],
    PREFETCH_TIMEOUT_MS,
  );
  if (!out) return null;
  try {
    const parsed = JSON.parse(out);
    const tele = parsed._telemetry ?? {};
    const sat = typeof parsed.satisfaction === 'number'
      ? parsed.satisfaction
      : (typeof tele.satisfaction?.score === 'number' ? tele.satisfaction.score : null);
    return {
      hits: Array.isArray(parsed.hits) ? parsed.hits : [],
      peers_responded: typeof parsed.peers_responded === 'number' ? parsed.peers_responded : 0,
      peers_queried: typeof parsed.peers_queried === 'number' ? parsed.peers_queried : 0,
      took_ms: typeof tele.took_ms === 'number' ? tele.took_ms : null,
      satisfaction: sat,
    };
  } catch { return null; }
};

// ─────────────── banner render ──────

// One-line status, bold-prefixed (the *...* renders bold in Claude
// Code's TUI the same way WebFetch's status line does). Shape the
// user asked for:
//   *Getting Informed* — "<question>" | <N> peers available | domain <D> | <H> hits
const renderBanner = (query, peers_responded, peers_queried, took_ms, hits, satisfaction) => {
  const peerCount = peers_queried > 0 ? `${peers_queried} peers available` : `local-only`;
  // domain = content-extracted topic tags. Aggregates the
  // most-frequent meaningful tokens across hit labels + summaries
  // so the banner answers "what subject area do these hits cover" —
  // typically 2-3 short tags like "raman, lh2, spectroscopy". Falls
  // back to "local" when the content yields fewer than 2 tags.
  const topics = extractTopics(hits, 3);
  const domains = topics.join(', ') || 'local';
  const truncQ = query.length > 64 ? query.slice(0, 61) + '...' : query;
  const lat = took_ms != null ? ` | ${took_ms} ms` : '';
  const conf = satisfaction != null ? ` | confidence ${satisfaction.toFixed(2)}` : '';
  return `*Getting Informed* — "${truncQ}" | ${peerCount} | domain ${domains} | ${hits.length} hits${conf}${lat}`;
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

// Short-circuit on a fresh cache hit — reconstruct the one-liner
// from the cached entry's metadata (the full hits array isn't
// cached, so domain/top-peer are best-effort here).
const cached = readFreshCacheEntry(query);
if (cached) {
  const pc = (cached.peers_queried ?? 0) > 0
    ? `${cached.peers_queried} peers available`
    : 'local-only';
  const truncQ = query.length > 64 ? query.slice(0, 61) + '...' : query;
  emit(`*Getting Informed* — "${truncQ}" | ${pc} | (cached prefetch)`);
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
  result.satisfaction,
));
