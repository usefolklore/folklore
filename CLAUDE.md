# Folklore — Claude Code Project Guide

Folklore is a knowledge-graph-first, network-before-web research layer with P2P
federation: your coding agent answers from your actual research and codebase, not
its training data. This file tells Claude Code how the project's own hooks behave —
the deny-on-confidence PreToolUse gate, the auto-save PostToolUse hook, and the
folklore MCP tools you can call to consult memory before reaching for the web.

For coding conventions — functional DDD (no classes in domain/app), `neverthrow`
Results, ESM modules, a max of 3 new dependencies per phase, and no claude/anthropic
git co-authors — see `.planning/PROJECT.md` and the "Architecture invariants" section
of `.planning/STATE.md`. Those are the authoritative source; this file does not
duplicate them. The shipped Claude Code hooks themselves are documented in
`.claude/README.md`.

<!-- folklore:start -->

# folklore
folklore is a knowledge-graph-first research layer with P2P
federation. It is **network-before-web** by design: local tool calls
(Read / Grep / Glob) run unaffected, but the moment you reach for
`WebSearch` or `WebFetch`, a PreToolUse hook asks your own graph +
connected peers first. If a confident answer exists (satisfaction ≥
0.85 with ≥ 2 hits), the hook **denies the web call outright** and
injects the graph hits into your context — you reason from cached
peer knowledge instead of paying the network trip. If the graph
can't satisfy the query, the web call proceeds normally and a
PostToolUse hook auto-saves the result into your graph so the next
session (yours or any peer's) hits the graph instead of the web.

What this means in practice:
- Routine prompts ("fix this typo", "rename X to Y") never touch
  folklore — zero overhead, zero noise.
- Local code exploration (Read / Grep / Glob) runs without the hook.
- Only outbound network lookups trigger the prefetch + possible deny.
- When you (or other peers) have already researched something, you
  pay the network cost zero additional times after the first.

Tuning knobs (env in `.claude/settings.json`):
- `FOLKLORE_DENY_WEBSEARCH=1` — enable deny-on-confidence (on by
  default in this project).
- `FOLKLORE_DENY_THRESHOLD=0.85` — confidence floor for deny.
- `FOLKLORE_DENY_MIN_HITS=2` — minimum graph hits before denying.
- `FOLKLORE_PREFETCH_PEERS=0` — force local-only (skip federated
  fan-out).

## What gets shared

Every node is either local-only or shared over P2P, gated by a
per-node `private` flag. Sharing is symmetric: peers exchange their
non-private nodes via the Y.js CRDT sync. A node's `source_uri`
scheme records where it came from (codebase, web fetch, arxiv, etc.);
an optional local-only `workspace` tag groups nodes by the repo they
were captured in but never travels over the wire.

## Freshness rule (data aging)

Every graph hit returned by `ask --json` and the prefetch hook carries
`age_days` and `fetched_at`. The smart-hook render shows it inline:
`label [3d] d=0.82`. When choosing whether to trust a cache hit vs
re-fetch:

- If the hit is younger than the staleness window (default 7 days),
  trust the cache.
- If the hit is older, prefer a fresh pull — the original WebFetch /
  WebSearch — and let the auto-save hook put the newer version back
  into the graph.
- If a hit has no `fetched_at` at all, treat it as stale of unknown age.

## When to invoke folklore

The hook handles the **passive** lane — outbound `WebSearch` /
`WebFetch` calls are gated by the graph automatically, you don't have
to think about it. The **active** lane is when you want to consult
memory explicitly, before deciding whether you even need a web call:

1. **Pull from memory first, web second.** For any "what did I read
   about X?", "how did we approach Y before?", "is this concept
   already indexed?" question, call the folklore MCP tools
   (`search`, `ask`, `get_node`, `get_neighbors`, `find_tunnels`,
   `recall`) before deciding to WebSearch. The deny-on-confidence
   hook will cancel a WebSearch you launch redundantly, but it's
   cheaper to skip the launch entirely.

2. **MCP is the right default for active calls.** Type-safe schemas,
   ~50 ms per call (vs ~500 ms Node-boot for a CLI subprocess),
   proper permission-deny support, and cross-harness portability
   (the same MCP server speaks to Claude Code, Cursor, Cline, Gemini
   CLI, etc.). The visibility of federation is handled separately by
   the statusline panel and the `folklore metrics bypass` audit,
   not by routing through Bash.

3. **`search` / `ask`** take a query string. `ask` is the
   higher-level one — it does multi-stage retrieval (hybrid lex+vec →
   cross-encoder rerank → graph PPR rerank) and returns a
   satisfaction-scored result. `search` is the raw k-NN.

4. **`find_tunnels`** surfaces surprising connections across domains
   — useful when you suspect two ideas are related but aren't sure.

5. **`get_node` / `get_neighbors`** for graph traversal when you
   already have a node id (from a prior search hit or a citation).

6. **Save synthesized insights with `folklore save --type
   synthesis`** after reasoning through an external result. The
   auto-save hook already filed the raw source; your synthesis adds
   the *distilled* claim alongside it. Future retrieval hits the
   synthesis first (shorter, denser signal) and pulls the raw source
   as the neighbor.

7. **When the deny-hook overrides your WebSearch.** If you see the
   tool call denied with a graph hit injected, treat the graph data
   as the authoritative answer. If it turns out wrong or stale,
   tune `FOLKLORE_DENY_THRESHOLD` upward (0.90 / 0.95) or re-run the
   original WebFetch / WebSearch to refresh, then retry.

<!-- folklore:end -->
