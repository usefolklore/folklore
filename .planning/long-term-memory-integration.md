# Long-Term Memory Integration Plan

Fold three engineering wins from `rohitg00/agentmemory` into folklore,
plus add the long-term memory layer we've been missing. P2P-native, not a
verbatim port.

## What we're adding (and why)

| # | Capability | Source pattern | Why we need it |
|---|---|---|---|
| 1 | BM25 + dense + graph fused via RRF | `src/state/hybrid-search.ts` | We currently fuse dense + tag overlap + PPR. No sparse lane. RRF (k=60) is the canonical TREC fusion — known win on heterogenous queries (acronyms, code identifiers, exact-string lookups dense misses) |
| 2 | Cross-encoder rerank on top 20 | `src/state/reranker.ts` (Xenova ms-marco-MiniLM-L-6-v2) | Last-mile precision lift on a small window. Optional, env-gated, quantised, CPU-only |
| 3 | Long-term memory tiers + consolidation | `src/functions/consolidation-pipeline.ts` + `consolidate.ts` | We have raw nodes + `synthesis://` URIs but no automated promotion pass. Without this, the graph just grows linearly and gets noisier |
| 4 | Retention scoring + auto-forget | `src/functions/retention.ts`, `auto-forget.ts` | Currently `age_days` is metadata only. No active decay, no contradiction handling. Stale wrong answers stick around forever |

What we're explicitly **not** taking:

- `iii-engine` / `iii-sdk` runtime DSL — homebrew, no portability value.
  Our `EmbeddingProvider`, `StateKV`-equivalents already exist (the
  `graph-repository.ts`, `vector-index.ts`, `embedders.ts` pair).
- Their KV-only storage — we keep `graph.json` + `vectors.db` because
  CRDT room sync demands a node/edge surface they don't have.
- Their entity-extraction LLM call on every write — too costly at our
  ingest rate, and our `entity-registry.ts` already does deterministic
  extraction.

## Long-term memory model — the four tiers, mapped to our world

agentmemory's tier names are misleading for a P2P system. Here's the
mapping that actually fits folklore:

| Their tier | Their meaning | Our equivalent | New work |
|---|---|---|---|
| Working | Raw observations from one tool call | Graph nodes from `ingest.ts` (already exists) | None |
| Episodic | Session-level summary | `session://<sid>` node, written at SessionEnd | New: session summariser |
| Semantic | Cross-session merged facts | `synthesis://<topic>` node (exists, but written by hand) | New: auto-promotion from clustered concept hits |
| Procedural | Recurring workflows | `decision://<workflow>` node (exists, by hand) | New: pattern miner over recurring code-graph traversals |

The P2P twist: **semantic + procedural memories advertise into the
`toolshed` room**, episodic stays local (privacy). When peers query, they
see your validated long-term memory, not your raw session traces. This is
the cooperative-learning bit — peer A's hard-won workflow becomes peer B's
prefetch hit.

## Architecture — where each piece slots into our DDD layers

```
src/
  domain/
    retention.ts          [NEW] pure retention math (decay, salience, RRF)
    consolidation.ts      [NEW] tier promotion rules (pure, testable)
    contradiction.ts      [NEW] Jaccard-on-tokens cluster detector
  application/
    hybrid-search.ts      [NEW] triple-stream fuser orchestrating
                                vector-index + bm25-index + graph-rerank,
                                replacing the current dense-only path in
                                ask.ts. Keeps the same AskResult shape.
    consolidate-tick.ts   [NEW] scheduled use case; runs every N hours
                                via daemon/loop.ts, promotes tiers.
    auto-forget-tick.ts   [NEW] TTL + contradiction + low-value purge
  infrastructure/
    bm25-index.ts         [NEW] sparse index, persisted to ~/.folklore/bm25.json
    reranker.ts           [NEW] optional Xenova cross-encoder, env-gated
  daemon/
    loop.ts                [edit] register consolidate-tick + auto-forget-tick
  mcp/
    server.ts              [edit] expose `consolidate` + `forget` tools
```

Strict layering: domain has zero infra deps. application calls infra ports
via existing interfaces. Same shape as the rest of the repo.

## Phase breakdown

### Phase A — Hybrid search (RRF + rerank)

**Domain (pure):**
- `domain/retention.ts` exports `rrf(rankLists: number[][], k=60)` and
  weighted-RRF variant.
- Verify with property tests: rrf of identical lists ranks them top;
  rrf of disjoint lists interleaves by k+rank.

**Infrastructure:**
- `infrastructure/bm25-index.ts` — port the BM25 logic from their
  `search-index.ts`. Persist as JSONL. Stemmer + synonym file optional
  per language.
- `infrastructure/reranker.ts` — `@xenova/transformers` lazy load.
  Quantised model. Env flag `FOLKLORE_RERANK=1`. Falls open on
  load failure (returns input unchanged).

**Application:**
- New `hybrid-search.ts` use case. Replaces the call site in
  `ask.ts:searchByRoom`. Same `AskHit[]` return shape so the
  satisfaction scorer and the hook contract don't change.

**Acceptance:**
- BEIR SciFact NDCG@10 ≥ current 75.22% (don't regress).
- With reranker on: ≥ +2 points (cross-encoder lift is well documented).
- p50 local latency stays ≤ 25 ms without reranker, ≤ 80 ms with.

### Phase B — Long-term memory tiers

**Domain:**
- `domain/consolidation.ts` — pure tier-promotion rules. Input: list of
  graph nodes + access logs. Output: planned promotions
  (`{ from: 'observation', to: 'semantic', nodes: [...] }`). No I/O.
- Concept-cluster detection: nodes sharing >= 3 concept tags AND
  cosine ≥ 0.7 → candidate semantic memory.
- Pattern detection (procedural): recurring `code_graph` traversals
  appearing in ≥ 2 sessions → candidate procedural memory.

**Application:**
- `consolidate-tick.ts` — uses a `MemoryProvider` port (we already have
  `EmbeddingProvider`; adding a `SummariserProvider` for LLM
  summarisation). Default impl: local llama.cpp or hosted via the
  bring-your-own-API user already configured for embeddings.
- Output: writes `session://`, `synthesis://`, `decision://` URI nodes
  via existing `graph-repository.ts`. No new storage.
- Schedules: configurable. Defaults — episodic at SessionEnd hook;
  semantic + procedural every 6h; decay every 24h.

**P2P:**
- New `decision://` and `synthesis://` nodes automatically land in
  `toolshed` (already wired in `internal-schemes.ts:50-51`).
- No change to room-sharing — these are first-class shareable types.

**Acceptance:**
- On a 7-day session corpus, consolidation produces ≥1 semantic memory
  per recurring concept (≥ 3 hits).
- Procedural extraction recovers ≥ 1 workflow per pattern with
  frequency ≥ 2.
- LongMemEval-S style benchmark target: ≥ 80% R@5 on synthetic
  long-term recall. (We don't have to match their 95.2% — they overfit
  to a 500-question set — but we need a documented number.)

### Phase C — Retention scoring + auto-forget

**Domain:**
- `domain/retention.ts` — pure score math:
  ```
  retention = clip(0..1, salience × exp(-λ·Δt) + σ·Σ(1/days_since_access))
  ```
  λ = 0.01, σ = 0.3, tier-thresholds hot=0.7 warm=0.4 cold=0.15. Same
  defaults as theirs, expose via `~/.folklore/config.json`.
- `domain/contradiction.ts` — Jaccard on shared-concept clusters.
  Threshold 0.9, older loses, audit-logged.

**Application:**
- `auto-forget-tick.ts` — TTL expiry, contradiction resolution,
  low-importance pruning (their 180-day + importance ≤ 2 default fits).

**P2P:**
- Auto-forget is **local only**. Never propagates a delete across the
  mesh. A peer that "forgets" simply stops advertising; if another peer
  asks, the touch protocol returns 0 nodes. Other peers may still hold
  the same content — that's fine, federation is eventually-consistent
  on content, not on delete operations.

**Acceptance:**
- Retention scores written to a new KV scope `retention.json` (parallel
  to `peer-reputation-store.ts` pattern). Surfaced via statusline.
- Auto-forget dry-run + apply CLI subcommand under `folklore gc`.
- Contradiction detector pages an audit entry to
  `~/.folklore/audit.jsonl`.

## What this replaces / deprecates

- `application/recall.ts` — keep as-is (entity-mentions recall is
  orthogonal). Hybrid search runs in parallel, results merged in `ask.ts`.
- `domain/recency-rerank.ts` — subsumed by retention scoring (recency
  becomes one component, not its own pass).
- Hand-written `synthesis://` notes — keep, but consolidation creates
  them automatically too.

## Open architectural questions for the research pass

1. **BM25 index sync via CRDT** — our `share-sync.ts` ships graph diffs,
   not inverted-index diffs. Do we ship the BM25 index across peers, or
   does each peer rebuild on receive? Rebuild is simpler; ship is faster
   on cold join. Default: rebuild on receive, async, behind a feature
   flag — same pattern as `vector-index.ts` rebuild.
2. **Summariser provider** — bring-your-own-key (OpenAI / Anthropic /
   local llama.cpp) versus mandate-local. Mandate-local keeps the
   privacy story clean but raises CPU floor. Default: local first, BYO
   key optional via env. Same pattern as `embedders.ts`.
3. **Tier-aware ranking** — should semantic/procedural memories
   outrank raw observations in `ask` results? Yes, weighted into RRF as
   a fourth lane with weight 0.5 of the dense lane.
4. **Cross-peer contradiction** — when peer B's semantic memory
   contradicts peer A's local semantic memory, who wins? Local always
   wins on the local view; the peer hit is surfaced with a contradiction
   badge. Resolution stays human-in-the-loop.

## Research findings — answers to the four open questions

### Q1. BM25 index over CRDT?

**Decision: rebuild on receive, never ship the index.**

Our `share-sync.ts` already commits to this pattern. The Y.Doc / Y.Map
sync protocol ships only the `ShareableNode` payloads (text + metadata),
filtered through `buildPatterns` for secret redaction before
`applyUpdate`. The local `vector-index.ts` rebuilds on receive
asynchronously, not over the wire. BM25 is the same problem class:
- Inverted indexes are derivable from the corpus. Shipping them is
  redundant bandwidth.
- Indexes diverge per locale (stemmer differs by language config). A
  peer-shipped index would be wrong for receivers using a different
  stemmer.
- The CRDT semantics on a Y.Map of token→[postings] would be
  awful — every insert is a multi-key write with concurrent edits.

Implementation: `infrastructure/bm25-index.ts` exposes an
`onNodeUpserted(node)` hook called from the same Y.Map observer that
already rebuilds the vector index (`share-sync.ts:362`). One-line
addition to the existing path.

### Q2. Summariser provider — local mandate vs BYO?

**Decision: BYO with a local default, exactly like `embedders.ts`.**

The `Embedder` interface at `embedders.ts:29` already proves the pattern
works: Xenova (local quantised), Rust subprocess (local native), or
fixture (deterministic for tests). The user can swap by config without
touching the application layer.

**Default choice (May 2026):** Phi-4-mini 3.8B via llama.cpp. Reasons:
- Runs on 8 GB machines, which our 11-ms-local benchmark implies as
  baseline target hardware.
- Summarisation quality is reportedly indistinguishable from larger
  models on the consolidation prompts we'll write (short XML-tagged
  output, low entropy).
- Same precedent as Xenova MiniLM-L6-v2 for embedding: small, local,
  CPU-only.

**BYO options:** OpenAI / Anthropic / Gemini / xAI. Mirror the existing
`OPENAI_API_KEY` etc. env handling in `embedders.ts`. The
`SummariserProvider` port stays one method:
```ts
interface SummariserProvider {
  summarise(system: string, user: string): ResultAsync<string, SummariserError>;
}
```

Sources: [Best Small AI Models 2026 — Local AI Master][small-ai],
[Best Local LLM Models 2026 — SitePoint][sitepoint-llm].

### Q3. Tier-aware ranking — and a stronger upgrade

**Original plan:** 4-lane RRF with semantic+procedural as a fourth lane
at weight 0.5 of dense.

**Upgrade after reading 2025/2026 SOTA papers:** the right move on
*long-term recall queries* is not RRF over tiers — it's the **GSW
pattern** ([Generative Semantic Workspace, arxiv 2511.07587][gsw]).

GSW outperforms RAG baselines by **+20% on Episodic Memory Benchmark
while reducing query tokens by 51%.** The win comes from structured
retrieval, not better fusion:

1. NER on the query → extract actor/role/state mentions.
2. **String-match** against entity nodes in the workspace
   (deterministic, not vector cosine).
3. For each matched entity, **generate a query-specific summary** from
   its accumulated role/state/spatial/temporal history.
4. Re-rank summaries by cosine to the query embedding.
5. Pass top-N summaries (cap on token count) to the LLM.

Our `entity-registry.ts` already does the deterministic entity
extraction (step 1+2). The summary-generation step (3) is new and
naturally lives in semantic/procedural memory. So:

- **Working / observation queries** ("show me what I read about X"):
  hybrid RRF (BM25 + dense + graph), same as Phase A.
- **Long-term recall queries** ("what's my pattern for hydrogen-AI
  Raman spectroscopy projects"): GSW-style — match entities, retrieve
  per-entity summaries from semantic+procedural tier.

The router lives in `application/ask.ts`: if the query contains an
entity match with strength ≥ threshold AND the entity has ≥ N
semantic/procedural nodes, route to GSW path; else hybrid RRF.

For procedural memory specifically, add **Bayesian reliability
weighting** from MACLA ([arxiv 2512.18950][macla]):

Each `decision://` node carries Beta(α, β) counters of past
success/failure. Selection score:
```
EU(proc | query) = sim(q, proc) · α/(α+β) · R_max
                 − risk(proc) · β/(α+β) · C_fail
                 + λ_info · H[Beta(α, β)]
```
The `H[Beta]` entropy term explores uncertain procedures; α/β updates
on user thumb-up/thumb-down feedback (we already log that via
audit.jsonl).

This subsumes the simple "tier weight = 0.5 of dense" idea.

### Q4. Cross-peer contradiction policy

**Decision: local always wins on local view; peer contradictions get
surfaced as a badge; user can promote a peer's version to override.**

Mechanics:
- `auto-forget-tick.ts` only acts on local contradictions (Jaccard 0.9
  threshold on shared-concept clusters). Never deletes peer content.
- During federated `ask`, when a peer hit's content has Jaccard ≥ 0.9
  with a local node BUT disagrees on a key claim (e.g. opposite valence
  in an extracted fact), the satisfaction scorer drops a
  `contradiction` flag in the hit envelope.
- Statusline renders contradiction count.
- New CLI: `folklore contradictions list / resolve <id> --prefer
  peer|local`. Logged to audit.jsonl with peer DID + signature.

This dovetails with the existing `consensus` component of the
satisfaction scorer — same input, different output channel.

**Write-time gating** ([Selective Memory, arxiv 2603.15994][selective],
+25 to +65pp improvement over read-time curation): apply at
consolidation time. Before promoting an observation to semantic, run a
filter that drops:
- Importance ≤ 2 observations (already in agentmemory)
- Observations contradicting an existing semantic node with strength ≥ 0.8
- Observations that fail a deterministic schema check (concept count
  < 1, no entity mentions)

Cheap, deterministic, no LLM call needed — fits the
`domain/consolidation.ts` pure-rules pattern.

[gsw]: https://arxiv.org/abs/2511.07587
[macla]: https://arxiv.org/abs/2512.18950
[selective]: https://arxiv.org/abs/2603.15994
[small-ai]: https://localaimaster.com/blog/small-language-models-guide-2026
[sitepoint-llm]: https://www.sitepoint.com/best-local-llm-models-2026/

## Revised phase ordering

Q3 changed the plan. New order:

- **Phase A** (unchanged): BM25 + RRF + reranker. Hybrid path for
  observation-tier queries.
- **Phase B**: long-term tiers + consolidation. Adds semantic +
  procedural nodes with write-time gating from `selective`.
- **Phase C**: GSW-style entity-summary retrieval as the long-term
  query path. Router in `ask.ts` picks GSW vs hybrid by query shape.
- **Phase D**: Bayesian reliability on procedural nodes + cross-peer
  contradiction surfacing. Auto-forget runs last.

## Out of scope

- Multi-tenant team memory (their `KV.teamShared`). We're individual
  peers; a "team" is a `room`.
- Their `iii-engine` orchestration model. We use the existing daemon
  loop.
- Image memories (`KV.imageRefs`). Separate epic.

## Next concrete step

Drop this doc, get user OK on the four-tier mapping table and the
acceptance criteria, then file Phase A as a GSD plan under
`.planning/phases/` and start the BM25 + RRF work. Phase B can run in
parallel once the `SummariserProvider` port is defined.
