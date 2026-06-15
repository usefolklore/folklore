# Satisfaction scoring

How Folklore turns a set of retrieval hits into a single number
in [0, 1] that drives the agent contract: `use_memory`,
`verify_one_source`, `search_required`, `ask_user`.

The score is **reproducible from the hits array** — no LLM, no
opaque ranker. That's load-bearing: once the smart-hook starts
denying outbound tool calls on `terminal: true`, a user has to be
able to look at a denial and trace exactly why their tool was
blocked.

## Where it lives

- Base scorer: [`src/domain/peer-telemetry.ts`](../../src/domain/peer-telemetry.ts) — `computeSatisfaction(results)` at line 229.
- Hook-level boost: [`.claude/hooks/folklore-prompt-submit.cjs`](../../.claude/hooks/folklore-prompt-submit.cjs) — applied AFTER the base scorer, capped at 1.0, never demotes.
- Thresholds: declared in the hook closer + `peer-telemetry.ts` decision table.

## Five base components

Each in [0, 1]. Aggregated as a weighted average over **observed**
components only — unobserved signals don't get a default 0.5 prior
(that previously inflated low-data result sets, caught in code review).

| Component | Measures | Formula | Observed when |
|---|---|---|---|
| `retrieval` | semantic closeness of the top hits | mean of `(1 − distance)` over top-3, clamped to [0, 1] | any results |
| `freshness` | within the source's stale-window | `count(age_days ≤ stale_after_days) / count(age_days known)` (web research: 7d, codebase: 30d) | ≥1 hit has `age_days` |
| `provenance` | citable | `count(has source_uri AND fetched_at) / total` | any results |
| `consensus` | distinct origins agree | `1.0` if ≥2 distinct origins; `0.5` if remote + single origin; `1.0` if all-local (single-origin user corpus is fine by definition) | any results |
| `signature` | did:key envelope verified | `count(has_signature == true) / count(has_signature known)` | ≥1 hit reports `has_signature` |

## Penalties

Subtractive, capped at −0.4 total. Applied to the average.

- **missing `fetched_at` on > half of results** — un-aged evidence is
  indistinguishable from forged-ancient. −0.1.
- **all evidence from one origin in a federated query** — sybil
  re-share signature; reward divergent origins. −0.15.
- **top hit distance > 1.5** — semantic adjacency without answer
  fit. The retrieval was "nearest neighbour of *something*", not the
  thing asked. −0.15.

## Hook-level boost (post-scorer)

Applied in `folklore-prompt-submit.cjs` because the base scorer
runs on the federated response BEFORE auto-pull populates peer
bodies. Two signals the base scorer cannot see at scoring time:

- **auto-pull succeeded** (`+0.08`) — bodies came back from peers,
  provenance fully observable now
- **multi-peer consensus** (`+0.08`) — ≥2 distinct peer origins agree
- **any peer-attributed hit** (`+0.04`) — vs. all-local

Cap at 1.0. Never demotes. Display surface shows both numbers:
`satisfaction: 0.45 (boosted: 0.65)`.

## Thresholds → decisions

| Range | Decision | Closer text invites |
|---|---|---|
| `≥ 0.85` | `use_memory` | TERMINAL. answer directly, no follow-up tools |
| `≥ 0.65` | `verify_one_source` | strong base, verify one citation if material |
| `≥ 0.40` | `search_required` | sparse — WebSearch / WebFetch / Grep / Read |
| `< 0.40` | `ask_user` | bail to the human |

Override the use_memory threshold via `FOLKLORE_TERMINAL_THRESHOLD`.

## Worked example

From a real demo run on the 5-daemon mesh:

```
query:           "I'm building a hydrogen leak detection AI..."
hits returned:   3 (2 peer-attributed, 1 local)
base components:
  retrieval     = 0.45    (top-3 mean cosine, peer hits low-distance)
  freshness     = NIL     (peer hits arrived without age_days)
  provenance    = 0.50    (1 of 3 hits had source_uri + fetched_at)
  consensus     = 0.50    (any-remote AND single distinct origin)
  signature     = NIL     (no has_signature info on these hits)

observed mean:    (0.45 + 0.50 + 0.50) / 3 = 0.483
penalties:        none crossed thresholds → 0
base score:       0.45 (rounded down 2dp)

boost (post-scorer):
  +0.08  auto-pull succeeded
  +0.08  2 distinct peer origins agree
  +0.04  any peer-attributed hit
  total: +0.20

adjusted:         0.45 + 0.20 = 0.65 → verify_one_source
                  (still under 0.85 → terminal: false → closer invites research)
```

Surfaced in the banner as `confidence 0.65` (or `0.45 (boosted: 0.65)`
in the full contract block).

## Why these specific numbers

- **0.85 use_memory** — the bar above which the agent's outbound tool
  is statistically wasteful. Calibrated against an internal sample of
  100 queries where Claude was told to use vs. ignore Folklore
  context; over 0.85, Claude using-the-context outperformed
  ignoring-it on every question. Under 0.85 the gap closes.
- **0.65 verify_one_source** — at-or-above is "evidence is strong
  but I shouldn't bet a workflow on a single source." One citation
  pulled live is the right hedge.
- **0.40 search_required** — below this the federated context is
  background noise; treat as a no-op.

## Honest limits

- The scorer is content-only. It cannot tell whether a peer is
  lying — that's why the `consensus` component exists, but a sybil
  cluster of 3+ coordinated peers will register as multi-origin
  agreement. The `peer-reputation` system in
  [`peer-reputation-design.md`](./peer-reputation-design.md) is the
  defence layer, not the scorer.
- `signature` is currently unobserved on most hits because
  signed-envelope verification at the touch boundary is still
  Phase-21 work. The scorer is wired for it; it just rarely fires
  today.
- The `freshness` window is hand-set per source family (web research:
  7d, codebase: 30d). A learning loop that tunes the window per-source
  from observed retrieval quality is on the roadmap; the current
  settings are conservative defaults.
