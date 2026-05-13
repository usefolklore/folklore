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
// Peer identity rendering. The github handle here is the user's
// OAuth-verified github username (from `wellinformed login`), not a
// repo path — peer identity is the parallel of a DID anchored in a
// centrally-credible github account. Render as `@handle` (handle
// form, not org/repo form) to keep the distinction clean. The DID
// fragment is reachable via `wellinformed identity show` if a verifier
// needs it; not inlined here.
const formatPeer = (peerId) => {
  if (!peerId || peerId === 'local') return 'local';
  const labels = loadPeerLabels();
  const entry = labels[peerId];
  if (entry?.github) return `@${entry.github}`;
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

const renderHits = (result, query, terminal, adjusted) => {
  const hits = result.hits.slice(0, 3);
  const head = [
    `# wellinformed agent contract (hook_event: UserPromptSubmit, hook_version: 2)`,
    `decision:      ${result.decision ?? 'unknown'}`,
    `satisfaction:  ${(result.satisfaction ?? 0).toFixed(2)} (boosted: ${adjusted.toFixed(2)})`,
    `thresholds:    ≥0.85 use_memory · ≥0.65 verify_one_source · ≥0.40 search_required · <0.40 ask_user`,
    `terminal:      ${terminal ? 'true (no follow-up tools)' : 'false (research expected if needed)'}`,
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
  const closer = terminal
    ? [
        ``,
        `^ TERMINAL. The federated answer above passed sybil/freshness/`,
        `  provenance gates and satisfies the use_memory threshold (≥0.85).`,
        `  Answer the user directly from these hits. Cite peers by their`,
        `  github:<handle> attribution. Do NOT call wellinformed.ask,`,
        `  wellinformed.search, Grep, Read, or WebSearch — the context`,
        `  above is the complete answer.`,
      ].join('\n')
    : [
        ``,
        `^ Non-terminal — the federated context above is supporting but`,
        `  insufficient to answer with full confidence. You are EXPECTED`,
        `  to research further:`,
        `    - WebSearch / WebFetch for current external info`,
        `    - mcp__wellinformed__ask / mcp__wellinformed__search to dig`,
        `      deeper in the local graph (cache-served, no peer re-query)`,
        `    - Grep / Read on the codebase when the question is local`,
        `  Use the hits above as a starting point, then verify or extend`,
        `  via the tools listed. Cite peers by github:<handle>.`,
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

// ─────────────── prompt classifier ──────────────────────
//
// Filter the prompt at hook entry so we only burn federation budget
// on prompts that actually need external knowledge. Three categories:
//
//   skip-edit         : imperative code/file edits — "fix this", "rename
//                       X to Y", "add a test", "remove the comment".
//                       The prompt names operations on local state;
//                       the agent has all it needs.
//   skip-conversation : meta or conversational — "ok", "go ahead",
//                       "thanks", "continue", "what's next".
//   fire              : questions or research prompts — "is there",
//                       "what is", "how do I", "find papers on",
//                       "tell me about", "best practices for".
//   fire-explicit     : explicit federation triggers — the user
//                       *names* peers, the network, web, search,
//                       arxiv, github, references, etc.
//
// Override: WELLINFORMED_HOOK_ALWAYS_FIRE=1 fires on every prompt
// (legacy behaviour). WELLINFORMED_HOOK_NEVER_FIRE=1 disables.

const ALWAYS_FIRE = process.env.WELLINFORMED_HOOK_ALWAYS_FIRE === '1';
const NEVER_FIRE = process.env.WELLINFORMED_HOOK_NEVER_FIRE === '1';

// Explicit federation triggers — user named peers, web, network, etc.
// These fire even if other heuristics would skip ("ask my peers about X"
// is intent-clear even though "ask" + a code-noun could look edit-y).
const EXPLICIT_TRIGGERS = /\b(?:check|ask|query|search|look\s?up|find|fetch|consult|poll|hit|browse|crawl|scrape|look\s+for)\s+(?:the\s+|my\s+|our\s+|in\s+)?(?:net|web|google|bing|duckduckgo|peers?|network|graph|wellinformed|swarm|community|arxiv|github|huggingface|hf|model\s?hub|registry|crates\.io|npm|pypi|hackernews|reddit|twitter|x\.com)\b/i;
// Compound-phrase triggers — same scope as EXPLICIT_TRIGGERS but
// expressed as compound nouns. We deliberately match only the
// space-separated forms (federated SEARCH, peer NETWORK) so that
// hyphenated code identifiers like `federated-search` or
// `peer-transport` aren't mistaken for federation intent.
const EXPLICIT_TRIGGERS_2 = /\b(?:across\s+(?:my\s+)?peers?|peer\s+network|peer-?to-?peer|federated\s+search|federation\s+(?:layer|protocol|pipeline)|web\s?search|web\s?fetch)\b/i;

// Research-intent words. Fire when present anywhere.
const RESEARCH_INTENT = /(?:\bwhat\s+(?:is|are|do|does|would|kind)\b|\bwho(?:\s+(?:is|are|does)|'?s)\b|\bwhen\s+(?:is|did|will|was|does)\b|\bwhere\s+(?:is|are|can|do)\b|\bwhy\s+(?:is|does|did|do)\b|\bhow\s+(?:do|does|can|would|to|much|many)\b|\bwhich\s+(?:is|are|model|library|tool|framework|paper|repo)\b|\bany\s+(?:known|good|recommended|best|examples?)\b|\bis\s+there\b|\bare\s+there\b|\bany\s+research\b|\bbest\s+practice|\brecommended?\b|\bcurrent\s+state\b|\bsota\b|\bstate\s+of\s+the\s+art\b|\bbenchmark|\bcite\b|\bsource\b|\breference|\bpaper\b|\barxiv|\bsurvey|\bpublication|\bevaluat|\bcompar(?:e|ison|ed)\b|\btell\s+me\s+(?:about|how)\b|\bexplain|\bsuggest|\bideas?\s+for\b|\bopinions?\s+on\b|\bthoughts?\s+on\b|\boptions?\s+for\b)/i;

// Imperative-edit verbs (likely paired with a local code/file target).
// Anchored at start so a question like "How do I implement X?" doesn't
// match. We also require the prompt to be short OR to not contain a
// research-intent word (a long edit with no research-intent words is
// pure imperative; a short prompt that starts with an edit verb is
// almost always a direct task).
const EDIT_VERBS_AT_START = /^(?:please\s+)?(?:can\s+you\s+|could\s+you\s+|would\s+you\s+)?(?:fix|rename|refactor|add|remove|delete|drop|change|update|edit|patch|move|copy|extract|inline|wrap|swap|replace|implement|build|create|write|generate|format|reorder|sort|comment|uncomment|merge|rebase|commit|push|squash|revert|undo|redo|run|exec|execute|test|lint|typecheck|compile|deploy|ship|release|tag|init|setup|install|configure|enable|disable|toggle|stub|mock|seed|migrate)\b/i;

// Pure conversational acks. Allow them to chain ("ok thanks, continue").
const CONVO_TOKENS = /^(?:ok(?:ay)?|sure|cool|thanks?|thank\s+you|great|nice|got\s+it|continue|keep\s+going|go\s+on|go\s+ahead|do\s+it|do\s+that|yes|yep|yeah|no|nope|nvm|never\s+mind|wait|stop|pause|hold\s+on|hmm+|umm+|huh|wow|what(?:'?s|\s+is)?\s+next|next|previous|back|done|finish(?:ed)?)$/i;

// Word-level conversational ack — a prompt is conversational iff
// every whitespace-delimited token is in the ack vocabulary. This
// catches "ok thanks, continue", "yep go ahead", "sure thanks!", etc.
const CONVO_WORDS = new Set([
  'ok','okay','sure','cool','thanks','thx','great','nice','yep','yes','yeah',
  'no','nope','nvm','wait','stop','pause','done','hmm','hmmm','umm','huh',
  'wow','next','back','previous','finish','finished','continue','go','ahead',
  'keep','going','on','do','it','that','please','thank','you','got',
]);
const isConversational = (p) => {
  const cleaned = p.replace(/[\s.,!?;:&]+$/g, '').toLowerCase();
  if (cleaned.length === 0 || cleaned.length > 60) return false;
  const tokens = cleaned.split(/[\s,;.!?:&]+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 6) return false;
  return tokens.every((t) => CONVO_WORDS.has(t));
};

const looksLikeQuestion = (p) => p.endsWith('?') || /\?\s*$/.test(p);

const classifyPrompt = (raw) => {
  const p = raw.trim();
  if (p.length < MIN_PROMPT_LEN) return 'skip-too-short';
  // User intent wins — explicit triggers override everything.
  if (EXPLICIT_TRIGGERS.test(p) || EXPLICIT_TRIGGERS_2.test(p)) return 'fire-explicit';
  // Pure conversational ack.
  if (isConversational(p)) return 'skip-convo';
  // Imperative edit prompt with no research signal — skip.
  if (EDIT_VERBS_AT_START.test(p) && !RESEARCH_INTENT.test(p) && !looksLikeQuestion(p)) {
    return p.length > 240 ? 'skip-edit-long' : 'skip-edit';
  }
  // Question or research intent — fire.
  if (looksLikeQuestion(p) || RESEARCH_INTENT.test(p)) return 'fire';
  // Default for everything else: SKIP. The hook only fires on
  // explicit triggers, questions, or research-intent prompts. Short
  // imperatives, follow-ups ("show me X", "do that"), and ambiguous
  // prose ("the bug is in line 12") never burn federation budget
  // unless the user explicitly invokes the network.
  return 'skip-ambiguous';
};

// ─────────────── main ──────────────────────

if (!ENABLED) process.exit(0);
if (NEVER_FIRE) process.exit(0);
const payload = readPayload();
const prompt = String(payload.prompt ?? '').trim();
if (prompt.length < MIN_PROMPT_LEN) process.exit(0);

const verdict = ALWAYS_FIRE ? 'fire-always' : classifyPrompt(prompt);
if (verdict.startsWith('skip-')) {
  // Log the skip for observability so users can tune the rules.
  safe(() => {
    if (!existsSync(HOME)) mkdirSync(HOME, { recursive: true });
    appendFileSync(PROMPT_LOG, JSON.stringify({
      ts: new Date().toISOString(),
      query: prompt.slice(0, MAX_PROMPT_LEN),
      verdict,
      decision: null,
      satisfaction: null,
      hits: 0,
    }) + '\n');
  });
  process.exit(0);
}

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

// P2P-scale phase 2 — write the assembled context to the prefetch
// cache, keyed by the prompt + truncation. The MCP server reads this
// before issuing a redundant ask/search call inside the same turn.
// Plain-text content; tracked as JSONL so we can append cheaply and
// trim from the head if needed.
const PREFETCH_CACHE = join(HOME, 'prefetch-cache.jsonl');
const CACHE_KEEP_LAST = 200;
const writePrefetchCache = (query, ctx, sysMsg, terminal) => safe(() => {
  if (!existsSync(HOME)) mkdirSync(HOME, { recursive: true });
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    query,
    context: ctx,
    system_message: sysMsg,
    terminal,
    satisfaction: result.satisfaction,
    decision: result.decision,
    peers_responded: result.peers_responded,
    peers_queried: result.peers_queried,
  });
  // Atomic-ish append. Trim old entries when file gets large
  // (keep last CACHE_KEEP_LAST lines) to bound disk.
  appendFileSync(PREFETCH_CACHE, entry + '\n');
  try {
    const lines = readFileSync(PREFETCH_CACHE, 'utf8').split('\n').filter(Boolean);
    if (lines.length > CACHE_KEEP_LAST) {
      const trimmed = lines.slice(-CACHE_KEEP_LAST).join('\n') + '\n';
      const tmp = PREFETCH_CACHE + '.tmp';
      const { writeFileSync, renameSync } = require('node:fs');
      writeFileSync(tmp, trimmed);
      renameSync(tmp, PREFETCH_CACHE);
    }
  } catch { /* benign — cache trim is best-effort */ }
});

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
// Topic extractor — same algorithm as the mcp-pre hook. Aggregates
// the dominant tokens across hit labels + summaries so the banner's
// "domains" slot reflects subject matter, not just the room name.
const TOPIC_STOPWORDS = new Set([
  'a','an','the','of','in','on','at','for','to','from','with','by','as','via',
  'and','or','but','if','then','else','this','that','these','those','their','its','our','your','his','her','they','them','it',
  'is','are','was','were','be','been','being','am',
  'have','has','had','having','do','does','did','done','doing',
  'eval','build','version','peer','exclusive','notes','summary','use','using','used',
  'new','old','first','last','top','bottom','more','most','less','least',
  'one','two','three','many','few','some','any','all','no','not','only','just',
  'how','what','which','why','where','when','who','whom',
  'web','file','code','chunk','part','example','test','run','runs',
]);
const extractTopicsFromHits = (hits, n = 3) => {
  const freq = new Map();
  for (const h of hits || []) {
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
        if (/^\d+$/.test(t)) return false;
        if (/^https?:\/\//.test(t)) return false;
        if (/^[a-z0-9\-]+:\/\//.test(t)) return false;
        return true;
      });
    for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n)
    .map(([t]) => t);
};
const _topics = extractTopicsFromHits(result.hits, 3);
const _rooms = Array.from(new Set(result.hits.map((h) => h?.room).filter(Boolean)));
const domains = _topics.length >= 2 ? _topics.join(', ') : (_rooms.join(', ') || 'local');
const tookMs = result.took_ms != null ? `${result.took_ms} ms` : '—';
const topPeerLabel = result.hits[0]?.source_peer && result.hits[0].source_peer !== 'local'
  ? ` (top: ${formatPeer(result.hits[0].source_peer)})`
  : '';
const autoPulledLine = Array.isArray(result.auto_pulled) && result.auto_pulled.length > 0
  ? `\n  pulled body:    ${formatPeer(result.auto_pulled[0].peer)}/${result.auto_pulled[0].room}`
  : '';
const truncQ = truncated.length > 80 ? truncated.slice(0, 77) + '...' : truncated;
// Satisfaction boost — the base scorer (src/domain/peer-telemetry.ts)
// runs on the federated response BEFORE auto-pull populates peer
// bodies. Two signals it cannot see at scoring time:
//   1. successful body auto-pull from a peer (provenance increased)
//   2. multi-peer origin agreement (consensus increased)
// We apply a bounded boost here to bring the effective score into
// line with what the scorer would have computed had the auto-pulled
// data been available. Capped at 1.0; never demoted.
const peerHits = result.hits.filter((h) => h?.source_peer && h.source_peer !== 'local');
const distinctOrigins = new Set(peerHits.map((h) => h.source_peer)).size;
const autoPulledCount = Array.isArray(result.auto_pulled) ? result.auto_pulled.length : 0;
let boost = 0;
if (autoPulledCount > 0) boost += 0.08;          // got the bodies
if (distinctOrigins >= 2) boost += 0.08;         // multi-peer consensus
if (peerHits.length > 0 && distinctOrigins >= 1) boost += 0.04; // any peer signal
const adjustedSatisfaction = Math.min(1.0, (result.satisfaction ?? 0) + boost);
const TERMINAL_THRESHOLD = Number(process.env.WELLINFORMED_TERMINAL_THRESHOLD ?? 0.85);
const terminal = adjustedSatisfaction >= TERMINAL_THRESHOLD;
const sysMsg = [
  `getting wellinformed`,
  `  peers:          ${peerLine}`,
  `  domains:        ${domains || '(local-only)'}`,
  `  question:       "${truncQ}"`,
  `  latency:        ${tookMs}`,
  `  hits:           ${result.hits.length}${topPeerLabel}` + autoPulledLine,
  `  terminal:       ${terminal ? 'true (answer directly, no follow-up calls)' : 'false (one cached verify call allowed)'}`,
].join('\n');

const renderedContext = renderHits(result, truncated, terminal, adjustedSatisfaction);
writePrefetchCache(truncated, renderedContext, sysMsg, terminal);
// The banner is intentionally NOT emitted as systemMessage from
// here. Claude Code's TUI prepends "UserPromptSubmit says:" to any
// systemMessage, which makes the rich block look wrapped. Instead,
// we stash sysMsg in the prefetch-cache.jsonl (written above) so
// the PreToolUse smart-hook can pick it up and render the same
// banner as a clean <system-reminder> block (no wrapper prefix)
// on Claude's first tool call after the prompt arrives.
emit(renderedContext);
