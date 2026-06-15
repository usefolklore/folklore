# P2P scale plan — faster retrieval · one-call hook · 10k sim

**Created:** 2026-05-11
**Status:** draft, pre-implementation
**Trigger:** user feedback on demo — three MCP calls per question, ~280ms federated latency, need 10k peers in the demo

## 1. Faster retrieval (target ≤ 50ms p50)

### Current path
```
prompt → hook → folklore ask --peers --json
  ↓
  local sqlite-vec query           ≈  5–20 ms
  + per-peer libp2p dialProtocol   ≈  150–250 ms  (5 peers, sequential-ish)
  + result merge + tunnel calc     ≈  20–50 ms
  total                            ≈  200–350 ms
```

### Plan

1. **Replace per-peer touch dial with gossipsub broadcast** — single
   `publish(/folklore/ask/1.0.0, q)` reaches all peers in one
   round trip. Each peer's daemon subscribes at boot, runs its local
   sqlite-vec query, and replies on a sibling topic. Collector
   times out at 80ms and merges what arrived.
   - File: `src/infrastructure/federated-search.ts` (rewrite the
     fan-out section)
   - Add gossipsub subscription at daemon boot
     (`src/daemon/loop.ts`)
   - Expected p50: 30–60ms for 100 peers, 60–120ms for 10k peers
     under realistic gossipsub propagation.

2. **HNSW on the peer side** — already present
   (`src/infrastructure/diskann-index.ts`), confirm it's hot on
   query path. If not, warm it on daemon start.

3. **Tighten satisfaction calculation** — the scorer currently walks
   every hit's fetched_at, recency-weighted edges, etc. Cache the
   per-hit signal calculation when peers send pre-computed
   satisfaction sub-scores.

### Acceptance
- `folklore ask --peers` p50 ≤ 50ms over 10 peers
- Same query p50 ≤ 150ms over 10k peers (gossipsub propagation
  dominates)
- No regressions in NDCG@10 on BEIR SciFact

## 2. One-call hook (skip Claude's follow-up MCP roundtrips)

### Current behaviour
Hook returns `additionalContext` with the federated results. Claude
sometimes still calls `folklore search`, `folklore ask`,
`folklore get_node` 1–3 more times before responding.

### Plan

1. **Raise federation hit confidence to use_memory threshold.**
   Today: peer hits don't always cross 0.85 satisfaction. Add a
   `peer_attribution_boost`: when ≥1 peer hit has distance ≤ 1.0
   AND it's the closest hit, bump satisfaction to ≥ 0.85.
   - File: `src/domain/satisfaction-scorer.ts`

2. **Add a terminal contract hint.** The hook's contract block
   already says "decision: use_memory" when threshold crosses 0.85.
   Add an explicit `terminal: true` field and update the closer
   text from "no additional calls are needed" to "Answer directly.
   Do not call folklore/Grep/Read/WebSearch — those are
   redundant when terminal:true."
   - File: `.claude/hooks/folklore-prompt-submit.cjs`

3. **Pre-fan to MCP tools.** When the hook fetches federated
   results AND auto-pulls peer bodies, write the assembled context
   to a transient store keyed by prompt hash. Subsequent
   `mcp__folklore__ask` calls in the same session return the
   cached result if hash matches — zero re-query cost.
   - File: `src/mcp/server.ts` (cache layer for `ask` tool)

### Acceptance
- For demo prompts where hook satisfaction ≥ 0.85, Claude makes
  zero additional MCP/Grep/Read calls.
- For 0.65 ≤ satisfaction < 0.85, Claude makes ≤ 1 follow-up call.

## 3. 10k simulated peers (`folklore swarm sim`)

### Plan

1. **New mode: `folklore swarm sim --count 10000 --corpus ...`**
   Spins up ONE local daemon process that:
   - Registers `count` virtual peer-ids in `peers.json` (no real
     libp2p sockets).
   - Mounts an in-memory `swarm-corpus.json` partitioned across
     virtual peers (deterministic round-robin from a seed file).
   - Intercepts inbound federated-search requests directed at any
     of those virtual ids and serves from the partitioned corpus,
     tagging each response with the virtual peer's id + a
     pre-generated github handle (`github:demo-peer-NNNN`).

2. **Corpus generator: `folklore swarm gen --count 10000
   --domain hydrogen-detection`** — produces a JSONL where each
   line is a fake-but-plausible note seeded from real templates
   (HF model evals, GitHub repo references with code-scores, paper
   summaries). 10k notes ≈ 30 MB JSONL.

3. **Federation pass-through:** `federated_search` already iterates
   peers from `peers.json`. The swarm-sim daemon intercepts at the
   libp2p protocol handler level — same code path for real vs
   virtual peers downstream of the dial.

4. **Peer-labels.json scales up:** Generated alongside the corpus.

### Acceptance
- `folklore swarm sim --count 10000` boots in ≤ 10s.
- `folklore ask --peers "..."` against a 10k swarm:
  - reports `peers_queried: 10000` honestly
  - p50 latency ≤ 200ms (bounded by gossipsub propagation, NOT
    by per-peer dial)
  - merges top-k hits across virtual peers with attribution
- Demo re-record shows the new banner reading:
  `peers: 9847/10000 responded · 142 ms · 8 hits`

## Phase order (do not reorder)
1. Faster retrieval (gossipsub fan-out) — landline for #2 and #3.
2. One-call hook (uses #1's faster latencies).
3. 10k sim (uses #1 + #2 — needs the gossipsub broadcast model and
   the terminal-contract hook to be coherent in the demo).

## Research input — folded back in from audit

Full audit at `docs/GRAPHRAG-AUDIT.md`. Modifications:

### Phase 1 mod: tail-aware merge
Gossipsub fan-out biases the top-k toward the fastest-responding
peers. Add a `merge_policy: 'peer-diversity'` flag: after the 80ms
collector window, cap any single peer's contribution to ⌈k/3⌉ before
final ranking. This protects against "the closest 3 peers happen to
both have similar variations of the same chunk."

### Phase 2 mod: terminal flag tied to satisfaction, not distance
Drop the `if (peer hit && distance ≤ 1.0) → terminal:true` rule from
the original plan. Replace with: `terminal:true` only if the Vision
satisfaction scorer crosses 0.85 AND the red-line checks
(sybil/conflict/freshness) pass. One confident peer hit alone is not
enough — a malicious peer could trivially satisfy that. File:
`src/domain/satisfaction-scorer.ts` (add red-line composite).

### Phase 3 mod: pair the 10k swarm with an adversarial fixture
Before claiming "ready for 10k real peers", add a fixture that
simulates 3-5 sybil-poisoning peers: peers that respond with
plausible-looking but garbage nodes, or with the same node-id under
multiple identities. The federation pipeline must demote them
(via the existing `peer-reputation.ts` scoring) without manual
intervention. File: new `swarm-adversarial-fixture.json`.

### Net-new gaps (queued, not in scope for this plan)
The audit identified gaps that don't block the scale plan but are
worth tracking separately:
- P0 S→M: contradiction scorer in oracle-gossip
- P1 M: claim extraction + EvidenceCluster type
- P1 M: LoCoMo-style temporal-QA harness
- P1 S: MultiHop-RAG + HotPotQA bench runs
- P2 L: community detection + on-demand global summary

These belong in a separate `.planning/graphrag-gaps.md` if/when we
decide to chase them — out of scope for the scale work.
