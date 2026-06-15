# RFC-0002 — Deny-on-Confidence Gate

- Status: Draft
- Author(s): Folklore maintainers
- Created: 2026-06

## Summary

The deny-on-confidence gate is Folklore's network-before-web mechanism. A PreToolUse hook intercepts an agent's outbound `WebSearch` / `WebFetch` call, asks the local graph (and, optionally, connected peers) the same query first, and — when the graph already holds a confident answer — **denies the web call outright** and injects the graph hits into the caller's context in place of the web result. The agent reasons from cached, attributable peer knowledge instead of paying the network trip. When the graph cannot satisfy the query, the call proceeds untouched and a PostToolUse hook auto-saves the fetched result so the next session hits the graph instead of the web. The gate is **off by default**: it only denies when all three confidence conditions hold (satisfaction ≥ 0.85, ≥ 2 hits, decision-layer `use_memory`), and a project must opt in explicitly. This RFC documents the gate as it ships today; it is the operational expansion of the "Deny semantics" subsection of RFC-0001.

## Motivation

Agents re-pay for web lookups over knowledge that has already been resolved — by an earlier session, by the codebase, or by a peer. RFC-0001 established that the first hop for any research call should be the commons rather than the web, and defined the deny semantics at the contract level. This RFC pins down the live behavior so the single biggest product differentiator — making the graph, not the search engine, the default first hop — is reproducible and debuggable.

Two pressures make the gate worth its own RFC. First, the thresholds are a live, contested design decision: RFC-0001's open question 3 ("Should deny-on-confidence ever be on by default, or is opt-in the permanent stance?") is unresolved, and the defaults below are the v1 answer, not a settled one. Second, a deny is a *destructive* override — it cancels a tool call the agent explicitly requested. A wrong deny (stale or off-topic graph hit substituted for a fresh web result) costs more trust than a redundant fetch costs latency. The gate's design is therefore conservative by construction, and the conservatism needs to be written down so it is preserved as the implementation evolves.

## Design

### Interception scope

The gate is a PreToolUse hook. It fires **only** on outbound network tool calls — `WebSearch` and `WebFetch`. Local tool calls (`Read`, `Grep`, `Glob`) are never gated: there is no remote knowledge to substitute for reading a local file, and gating them would add latency to the routine inner loop for no benefit. Routine prompts that issue no web call never touch the gate at all — zero overhead, zero noise.

### The three-condition AND-gate

A deny is permitted **iff all three** conditions hold (identical to RFC-0001's deny semantics — this RFC expands the operational detail, it does not change the contract):

1. `satisfaction_score ≥ FOLKLORE_DENY_THRESHOLD` — the reranked top hit's satisfaction score clears the confidence floor (default `0.85`).
2. graph hit count `≥ FOLKLORE_DENY_MIN_HITS` — at least N independent hits corroborate the answer (default `2`), so a single lucky match cannot trigger a deny.
3. the decision layer returns `use_memory` — not `verify_one_source`, not `consensus_check`, not `search_web`. The decision layer is a classifier over the retrieval result; only its strongest verdict ("indexed context is sufficient — no web search needed") authorizes a deny.

If any one condition fails, the gate does not deny. The conjunction is deliberate: the score floor guards against weak matches, the hit-count floor guards against single-source overconfidence, and the decision verdict guards against cases where the query *type* wants verification regardless of score.

### On deny

When all three conditions hold, the hook returns a permission-deny for the tool call and injects the graph hits — each carrying its `satisfaction_score`, `age_days`, and `provenance` (per RFC-0001) — into the caller's context in place of the web result. The agent sees the cached answer with its freshness and attribution and reasons from it. The render surfaces the freshness inline (`label [3d] d=0.82`) so a stale substitution is visible.

### On failure / fall-through

If any condition fails, if the local graph is empty, if peer fan-out times out, or if the hook errors for any reason, the web call **proceeds normally**. Fall-through is the safe default: a missed deny only costs a redundant fetch, whereas a spurious deny corrupts the agent's answer. After the web call returns, a PostToolUse hook auto-saves the result into the local graph as a shared (non-`private`) node, so the next session — yours or any peer's — hits the graph instead of the web. The gate thus improves monotonically: every fall-through seeds a future deny.

### Off by default

The gate ships **off by default** (opt-in via `FOLKLORE_DENY_WEBSEARCH=1`). This is the v1 stance on RFC-0001 open question 3, grounded in the asymmetry above: a false deny erodes trust faster than a redundant fetch wastes latency. A project that has built confidence in its graph's coverage can enable it; the default protects projects whose graph is still sparse.

### Configuration (env knobs)

All knobs are environment variables (set in `.claude/settings.json` for the Claude Code harness):

| Variable | Default | Effect |
|---|---|---|
| `FOLKLORE_DENY_WEBSEARCH` | unset (off) | `1` enables deny-on-confidence. Off by default. |
| `FOLKLORE_DENY_THRESHOLD` | `0.85` | Satisfaction-score floor for condition 1. Raise (0.90 / 0.95) to deny more conservatively. |
| `FOLKLORE_DENY_MIN_HITS` | `2` | Minimum corroborating graph hits for condition 2. |
| `FOLKLORE_PREFETCH_PEERS` | `0` | `0` forces local-only (skip federated fan-out); the gate then answers from the local graph alone. |

### Freshness interplay

The gate composes with RFC-0001's freshness rule. A graph hit inside the global stale-after window (~7 days) is trustworthy and eligible to satisfy a deny. Past the window, a peer SHOULD prefer a fresh pull — re-running the original `WebFetch` / `WebSearch` — and let the auto-save hook replace the stale node with the newer version. A hit lacking `fetched_at` is treated as stale of unknown age and SHOULD NOT, on its own, authorize a deny.

## Alternatives considered

- **Deny on by default.** Rejected for v1 (consistent with RFC-0001). The cost asymmetry is decisive: a false deny substitutes wrong knowledge into an answer, while a missed deny only costs one redundant fetch. Until graph coverage is reliably high, opt-in is the safer floor. This remains a live open question, not a closed one.
- **Always-fetch-then-dedup.** Let every web call proceed, then deduplicate against the graph after the fact. Rejected: it pays the network trip every time, which defeats the entire network-before-web premise. The whole point is to *not* make the call when the answer is already held.
- **A fixed global threshold with no per-project override.** Rejected: projects vary in tolerance for a wrong deny. A research-heavy project with a dense, fresh graph can afford a lower floor; a project whose graph is sparse needs a higher one or none at all. The threshold is therefore per-project tunable via env, not a hard-coded constant.

## Open questions

- **Permanent opt-in vs. eventual default.** Should deny-on-confidence ever flip to on by default once coverage heuristics mature, or is opt-in the permanent stance? (This is RFC-0001 open question 3, still live.)
- **Per-source-type vs. global thresholds.** A single global `FOLKLORE_DENY_THRESHOLD` treats a codebase (`file:` / `git:`) hit and a web (`https:` / `arxiv:`) hit identically. Should the floor (and min-hits) be settable per `source_uri` scheme, given their different trust and freshness profiles?
- **Surfacing a deny correctably.** A deny is invisible to the user beyond the injected hits. How should a wrong deny be surfaced so the user can override it in the moment — a one-keystroke "fetch anyway", a metrics audit (`folklore metrics bypass`), or both?
- **Multi-peer disagreement.** When federated fan-out returns hits from peers that disagree, what should the gate do — deny on the highest-confidence cluster, refuse to deny when peers conflict, or surface the disagreement and let the agent decide? (Ties into RFC-0001 open question 5, conflict surfacing.)
