#!/usr/bin/env node
/**
 * folklore PreToolUse smart hook.
 *
 * Runs BEFORE Claude calls Grep / Glob / Read / WebSearch / WebFetch.
 * Extracts a query from the tool input, runs `folklore ask --json`
 * against the knowledge graph, and injects results into additionalContext.
 *
 * Hit path  : top-3 nodes + ids + workspace + source URIs → Claude answers
 *             from the graph without the outbound tool call.
 * Miss path : append {tool, query, ts} to ~/.folklore/miss-log.jsonl
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

const HOME = process.env.FOLKLORE_HOME || join(os.homedir(), '.folklore');
const GRAPH_PATH = join(HOME, 'graph.json');
const MISS_LOG = join(HOME, 'miss-log.jsonl');
const PREFETCH_TIMEOUT_MS = Number(process.env.FOLKLORE_PREFETCH_TIMEOUT_MS ?? 4500);
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
const HIT_THRESHOLD = Number(process.env.FOLKLORE_HIT_THRESHOLD ?? 1.05);
const GAP_MIN = Number(process.env.FOLKLORE_GAP_MIN ?? 0.02);
// Federated-first prefetch — "the network before the web" is the product
// promise, and the hook has to live up to it. With peers enabled, we run
// `ask --peers --json` which embeds once locally, fans out to every
// connected peer with a 2s per-peer deadline, and merges results with
// local search. If no peers are connected (fresh install, daemon not
// running), federated gracefully degrades to local-only. Set
// FOLKLORE_PREFETCH_PEERS=0 to force local-only.
const PREFETCH_PEERS = process.env.FOLKLORE_PREFETCH_PEERS !== '0';

const emit = (text, decision, userMsg) => {
  const out = {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: text,
    },
  };
  // systemMessage is the USER-visible line in Claude Code (additionalContext
  // goes only to the model). Set it on the substantive paths (hits / deny) so
  // the user actually SEES folklore consult the graph — not on idle Reads.
  if (userMsg) out.systemMessage = `🪶 folklore — ${userMsg}`;
  if (decision && decision.permissionDecision) {
    out.hookSpecificOutput.permissionDecision = decision.permissionDecision;
    if (decision.permissionDecisionReason) {
      out.hookSpecificOutput.permissionDecisionReason = decision.permissionDecisionReason;
    }
  }
  process.stdout.write(JSON.stringify(out) + '\n');
};

/**
 * Opt-in: when FOLKLORE_DENY_WEBSEARCH=1 AND the prefetch lands a
 * confident answer (decision=use_memory, ≥2 hits, satisfaction ≥
 * DENY_THRESHOLD), the PreToolUse hook DENIES the upcoming WebSearch
 * or WebFetch tool call — Claude is forced to use the injected context
 * instead of searching. Off by default (false positives are costly).
 *
 * Tools eligible for denial: WebSearch and WebFetch only. Local tools
 * (Read / Glob / Grep) are never denied — they're cheap and there's no
 * value in stopping them.
 */
const DENY_WEBSEARCH = process.env.FOLKLORE_DENY_WEBSEARCH === '1';
const DENY_THRESHOLD = Number(process.env.FOLKLORE_DENY_THRESHOLD ?? 0.85);
const DENY_MIN_HITS = Number(process.env.FOLKLORE_DENY_MIN_HITS ?? 2);
const DENIABLE_TOOLS = new Set(['WebSearch', 'WebFetch']);

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

// Resolve the folklore engine. The hook ships inside the repo, so a global
// `folklore` on PATH is NOT guaranteed (the common case during local dev) —
// falling back to the repo's built CLI keeps the prefetch/deny gate live
// without a global install. Precedence: explicit FOLKLORE_BIN override →
// repo-local dist build → `folklore` on PATH.
const resolveEngine = () => {
  const bin = process.env.FOLKLORE_BIN;
  if (bin && existsSync(bin)) return { cmd: bin, pre: [] };
  const repoRoot = process.env.CLAUDE_PROJECT_DIR || join(__dirname, '..', '..');
  const distCli = join(repoRoot, 'dist', 'cli', 'index.js');
  if (existsSync(distCli)) return { cmd: process.execPath, pre: [distCli] };
  return { cmd: 'folklore', pre: [] };
};
const ENGINE = resolveEngine();

const prefetch = (query) => {
  try {
    const args = PREFETCH_PEERS
      ? ['ask', '--peers', '--pull', '--json', '--k', '3', query]
      : ['ask', '--json', '--k', '3', query];
    const out = execFileSync(ENGINE.cmd, [...ENGINE.pre, ...args], {
      timeout: PREFETCH_TIMEOUT_MS,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const parsed = JSON.parse(out);
    return {
      hits: Array.isArray(parsed.hits) ? parsed.hits : [],
      peers_queried: typeof parsed.peers_queried === 'number' ? parsed.peers_queried : 0,
      peers_responded: typeof parsed.peers_responded === 'number' ? parsed.peers_responded : 0,
      // Pre-rendered telemetry block from `folklore ask --peers --json`.
      // Always emitted by the federated path; absent on local-only --json.
      telemetry_block: typeof parsed._telemetry_block === 'string' ? parsed._telemetry_block : null,
      // Agent contract — satisfaction + decision so the agent knows
      // whether to fall through to WebSearch. Always present on the
      // ask --json output (local OR federated).
      satisfaction: typeof parsed.satisfaction === 'number' ? parsed.satisfaction : null,
      decision: typeof parsed.decision === 'string' ? parsed.decision : null,
    };
  } catch {
    return null;
  }
};

// Human-readable hint mapping. Stable v1; v2 will overlay task-risk.
const decisionHint = (decision) => {
  switch (decision) {
    case 'use_memory':         return 'indexed context is sufficient — no web search needed.';
    case 'verify_one_source':  return 'context is mostly sufficient — verify one source if accuracy is critical.';
    case 'search_required':    return 'partial context — fall through to WebSearch / WebFetch to fill the gap.';
    case 'refetch':            return 'right source but stale — refetch via WebFetch on the source_uri.';
    case 'consensus_check':    return 'multiple peers, independence not yet verified — verify against another source.';
    case 'ask_user':           return 'low confidence — clarify with the user before acting.';
    default:                   return null;
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
  const head = `folklore: ${hits.length} indexed node(s) match "${query.slice(0, 80)}"${peerSummary}`;
  const body = hits.map((h, i) => {
    const snippet = h.summary ? ` — ${String(h.summary).slice(0, SNIPPET_LEN).replace(/\s+/g, ' ')}` : '';
    return `  ${i + 1}. ${h.label ?? h.id} [${h.workspace ?? '-'}, ${renderAge(h)}, ${renderPeer(h)}] d=${h.distance}${snippet}\n     → ${h.source_uri ?? h.id}`;
  }).join('\n');
  return `${head}\n${body}\n\nPrefer these over the outbound tool. Load full content via mcp__folklore__get_node(id) or mcp__folklore__ask(query). If a hit's age is stale for the task, trigger a fresh pull via WebFetch / WebSearch / \`folklore trigger\` instead of trusting the cache.`;
};

// Read the most recent prefetch-cache entry from the UserPromptSubmit
// hook. If it's fresh (under 90s old), we treat that as the canonical
// "what folklore already knows" — emit its banner as the cleanly-
// rendered <system-reminder> block (no UserPromptSubmit-says prefix
// since this is PreToolUse, not UserPromptSubmit). Subsequent tool
// calls inside the same turn keep emitting the same banner, so the
// federation status stays visible while Claude works through tools.
const CACHE_PATH = join(HOME, 'prefetch-cache.jsonl');
const CACHE_MAX_AGE_MS = 90_000;
const BYPASS_LOG = join(HOME, 'bypass-log.jsonl');

const readFreshCacheEntry = () => {
  try {
    if (!existsSync(CACHE_PATH)) return null;
    const lines = readFileSync(CACHE_PATH, 'utf8').split('\n').filter(Boolean);
    if (lines.length === 0) return null;
    const entry = JSON.parse(lines[lines.length - 1]);
    const ageMs = Date.now() - Date.parse(entry.ts);
    if (!Number.isFinite(ageMs) || ageMs > CACHE_MAX_AGE_MS) return null;
    return entry;
  } catch { return null; }
};

// Bypass measurement — every outbound tool call after a terminal
// verdict gets logged here, regardless of whether deny-on-terminal
// is active. Lets us compute the bypass rate over time:
//   tools-attempted-after-terminal / terminal-verdicts-issued
// Anything > 0 with deny-on-terminal active means the harness is
// honouring our deny but the model still tries (acceptable); > 0
// without deny means soft persuasion isn't working (tune the contract).
const logBypassAttempt = (toolName, query, cachedEntry) => {
  try {
    if (!existsSync(HOME)) mkdirSync(HOME, { recursive: true });
    const entry = JSON.stringify({
      ts: new Date().toISOString(),
      tool: toolName,
      query: String(query ?? '').slice(0, 200),
      terminal_query: cachedEntry.query,
      satisfaction: cachedEntry.satisfaction ?? null,
      peers_responded: cachedEntry.peers_responded ?? 0,
      peers_queried: cachedEntry.peers_queried ?? 0,
      denied: process.env.FOLKLORE_DENY_ON_TERMINAL === '1',
    });
    appendFileSync(BYPASS_LOG, entry + '\n');
  } catch { /* never block the tool over a logging miss */ }
};

const main = () => {
  if (!existsSync(GRAPH_PATH)) { process.exit(0); }

  const payload = readPayload();
  const toolName = String(payload.tool_name ?? '');
  const ti = payload.tool_input ?? {};
  const query = queryFromInput(toolName, ti).trim();

  // Cache-fast path: surface the prompt-submit hook's banner here
  // (PreToolUse renders cleanly as <system-reminder>, no wrapper).
  // ALSO: if the cached verdict is terminal AND this tool is an
  // outbound knowledge-grabber (Glob/Grep/Read/WebSearch/WebFetch),
  // log the call as a potential bypass + optionally DENY it via
  // permissionDecision. The measurement is enabled by default; the
  // hard deny is gated on FOLKLORE_DENY_ON_TERMINAL=1 so it
  // doesn't surprise users who haven't opted in.
  const cached = readFreshCacheEntry();
  if (cached) {
    const isTerminal = cached.terminal === true;
    const isOutbound = ['Glob','Grep','Read','WebSearch','WebFetch'].includes(toolName);
    if (isTerminal && isOutbound) {
      logBypassAttempt(toolName, query, cached);
      if (process.env.FOLKLORE_DENY_ON_TERMINAL === '1') {
        emit(
          cached.system_message ?? 'folklore terminal: answer from indexed context above.',
          {
            permissionDecision: 'deny',
            permissionDecisionReason: `folklore terminal verdict (satisfaction ${(cached.satisfaction ?? 0).toFixed(2)}, ${cached.peers_responded ?? 0}/${cached.peers_queried ?? 0} peers). Answer from the indexed context block. Set FOLKLORE_DENY_ON_TERMINAL=0 to disable hard-deny.`,
          },
        );
        process.exit(0);
      }
    }
    if (cached.system_message) {
      emit(cached.system_message);
      process.exit(0);
    }
  }

  if (!query || query.length < 3) {
    emit('folklore: knowledge graph is live. Use search / ask / get_node MCP tools before outbound lookups.');
    process.exit(0);
  }

  const prefetchResult = prefetch(query);
  if (prefetchResult === null) {
    emit(`folklore: prefetch skipped for "${query.slice(0, 80)}" (binary unavailable or timed out).`);
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

  // Build the agent-visible context. Append the telemetry block ONLY
  // when the federated path actually queried peers — local-only
  // prefetches produce a `0/0 responded · 0 alive on swarm` block
  // that's noise on every PreToolUse fire (Claude Code fires Read /
  // Glob / Grep hundreds of times per session). The block is meant
  // for "folklore went to the network" moments, not idle ones.
  const block = prefetchResult.telemetry_block;
  const queriedPeers = peersMeta.peers_queried > 0;
  // Agent contract line — always append when folklore produced
  // a satisfaction score, regardless of peer status. This is the
  // *completeness signal* Claude reads to decide whether to fall
  // through to WebSearch.
  const action = prefetchResult.decision;
  const score = prefetchResult.satisfaction;
  const hint = action ? decisionHint(action) : null;
  const actionLine =
    action !== null && score !== null
      ? `\n\naction: ${action}  satisfaction: ${score.toFixed(2)}` +
        (hint ? `\n→ ${hint}` : '')
      : '';
  const appendTelemetry = (msg) =>
    (block && queriedPeers ? `${msg}\n\n${block}` : msg) + actionLine;

  if (hits.length > 0) {
    // Optional denial path — gated on env flag + tool type +
    // confidence threshold + hit count. When all four align, we
    // deny the WebSearch/WebFetch and rely on the injected context.
    // When the energy gate is on, the `use_memory` decision IS the calibrated
    // gate (decideContract already ran it) — so trust the decision rather than
    // re-checking the legacy 0.85 composite score, which never fires on a real
    // graph (the bug that made deny inert). Without the energy gate, keep the
    // old score gate.
    const energyGateOn = process.env.FOLKLORE_ENERGY_GATE === '1';
    const shouldDeny =
      DENY_WEBSEARCH &&
      DENIABLE_TOOLS.has(toolName) &&
      action === 'use_memory' &&
      hits.length >= DENY_MIN_HITS &&
      (energyGateOn || (typeof score === 'number' && score >= DENY_THRESHOLD));
    if (shouldDeny) {
      const reason =
        `folklore: indexed context already answers this (satisfaction ${score.toFixed(2)}, ${hits.length} hits). ` +
        `Use the injected context above instead of ${toolName}. ` +
        `Override with FOLKLORE_DENY_WEBSEARCH=0 if a fresh source is genuinely needed.`;
      emit(
        appendTelemetry(renderHits(hits, query, peersMeta)),
        { permissionDecision: 'deny', permissionDecisionReason: reason },
        `denied ${toolName} — memory answers it (sat ${score.toFixed(2)}, ${hits.length} hits)`,
      );
      process.exit(0);
    }
    const sat = typeof score === 'number' ? score.toFixed(2) : '—';
    emit(
      appendTelemetry(renderHits(hits, query, peersMeta)),
      undefined,
      `${hits.length} graph hit(s) · sat ${sat} · ${action ?? 'use memory'}`,
    );
  } else {
    logMiss(toolName, query);
    const peerNote = peersMeta.peers_queried > 0
      ? ` (network checked: ${peersMeta.peers_responded}/${peersMeta.peers_queried} peer(s) responded, none had a match)`
      : '';
    emit(
      appendTelemetry(`folklore: no indexed context for "${query.slice(0, 80)}"${peerNote}. Miss logged to ${MISS_LOG}. Proceeding with ${toolName} — consider saving the result back with \`folklore save\` or a PostToolUse hook once reasoning is done.`),
      undefined,
      // Show on web tools only (so the user sees folklore checked + missed);
      // silent on local Read/Grep/Glob misses to avoid per-file spam.
      DENIABLE_TOOLS.has(toolName) ? `no graph match — searching web for "${query.slice(0, 48)}"` : undefined,
    );
  }
  process.exit(0);
};

main();
