# GraphRAG audit — Folklore against 2025/2026 SOTA

> **Snapshot — pre-V5 audit.** The "virtual room membership" + "per-room
> freshness window" claims in §2 + §3 below were V4 architectural
> distinctives. V5 removed rooms entirely; the post-V5 equivalents are
> source-family tagging (web vs codebase) and per-node `private: bool` +
> `workspace` tags. The high-level audit posture (P2P federation over
> centralized index, DID + GitHub identity, signature verification per
> node, satisfaction breakpoint over similarity top-k) is unchanged
> and remains current.

## 1. State of the art (2025-2026)

Consensus across the field has hardened around three pillars: an entity-relation graph built by LLM extraction over chunks; community detection plus LLM summarization at multiple hierarchical levels for "global" reasoning; and hybrid retrieval that fuses BM25/sparse, dense embeddings, and graph traversal at query time. Microsoft's [GraphRAG](https://arxiv.org/abs/2404.16130) defined the canonical local/global split. The 2025 follow-ups push two directions at once: (a) cheaper indexing — [LazyGraphRAG](https://www.microsoft.com/en-us/research/blog/graphrag-improving-global-search-via-dynamic-community-selection/) cuts indexing cost to ~0.1% of full GraphRAG by deferring summarization to query time and dynamically selecting communities; (b) better multi-hop precision — [HippoRAG 2](https://www.marktechpost.com/2025/03/03/hipporag-2-advancing-long-term-memory-and-contextual-retrieval-in-large-language-models/) uses Personalized PageRank over a triple graph and beats GraphRAG, RAPTOR, and LightRAG on both indexing cost and multi-hop QA.

Still contested: chunking strategy, whether to summarize on traversal versus pre-compute, and how to evaluate. The [GraphRAG-Bench / ICLR'26 paper](https://arxiv.org/html/2506.05690v3) finds Community-GraphRAG (Local) wins on multi-hop (HotPotQA, MultiHop-RAG) but Global hallucinates on Null queries, and vanilla RAG still beats GraphRAG on single-hop detail. [LightRAG](https://arxiv.org/abs/2410.05779) argues for cheap dual-level (entity-specific + topic-abstract) retrieval over expensive community trees. Long-conversation memory is its own axis: [LoCoMo](https://snap-research.github.io/locomo/) shows top RAG systems still trail human ceiling by ~56% on 32-session dialogues, with temporal reasoning the worst gap. Hybrid sparse+dense fusion via RRF is now the default starting point in production stacks ([NetApp on hybrid RAG](https://community.netapp.com/t5/Tech-ONTAP-Blogs/Hybrid-RAG-in-the-Real-World-Graphs-BM25-and-the-End-of-Black-Box-Retrieval/ba-p/464834)).

## 2. Where Folklore aligns with best practice

- Entity-relation graph with embeddings: `src/domain/entity-extract.ts`, `src/domain/graph.ts`, `src/domain/vectors.ts` — same substrate as GraphRAG/HippoRAG.
- Hybrid retrieval already on the roadmap (BM25 + dense fusion via SQLite FTS5): `.planning/SOTA-UPGRADE-PLAN.md` chunk 8, plus `src/infrastructure/rust-retrieval.ts`.
- Graph rerank and recency rerank as separable stages: `src/domain/graph-rerank.ts`, `src/domain/recency-rerank.ts` — mirrors the dual-level pattern LightRAG champions.
- PageRank-style signal over the graph: `src/domain/pagerank.ts` — the same primitive HippoRAG 2 uses for context-aware selection.
- Freshness as a first-class retrieval signal with a global stale-after window (~7d default), exposed inline as `age_days` on every hit. Most GraphRAG implementations ignore freshness entirely.
- Evidence-stage typing (raw_remote → treated → consolidated → reasoned → accepted_local) in `docs/VISION.md` — closer to LoCoMo-grade memory hygiene than to a flat vector store.
- 75.22% NDCG@10 on BEIR SciFact (`docs/BENCHMARKS.md`) — competitive with published hybrid RAG baselines and reproducible CPU-only.
- Coverage-map output planned over top-k chunk lists (`docs/VISION.md` §Coverage map) — matches the agent-contract framing emerging in 2025/2026 literature.

## 3. Where Folklore diverges intentionally

- **P2P federation over centralized index.** No comparable GraphRAG ships a libp2p gossip layer; we want the network effect of compounding research across peers, not a single corpus owner.
- **Origin tagging derived from each node's `source_uri` scheme** (codebase, web, arxiv, …), not a manual taxonomy. Source family is self-healing without curation and avoids the rigid taxonomy GraphRAG community trees impose; a per-node `private` flag and an optional local-only `workspace` tag handle scoping.
- **DID/OAuth-anchored identity (W3C `did:key` + GitHub social DID)** rather than anonymous embedding ownership. Required to make peer trust scoring tractable — see `src/domain/peer-reputation.ts`.
- **`did:key` envelope verification on every shared node** (`src/domain/share-envelope.ts`, `src/infrastructure/identity-resolver.ts`). Sybil-resistance and provenance lineage matter more in a federated graph than in a single-tenant one.
- **Satisfaction breakpoint over similarity top-k.** Vision targets an explicit Stop/Continue/Refetch/Consensus/Risk/Ambiguity decision rather than returning chunks and praying. No mainstream GraphRAG does this.
- **No upfront community summarization** in v1 — closer to LazyGraphRAG and HippoRAG 2 than to vanilla GraphRAG. Deliberate: indexing cost has to stay CPU-only and idle-friendly on a developer laptop.

## 4. Gaps worth closing

- **No claim extraction or evidence clusters yet.** Vision defines them; code doesn't. Build `src/domain/claims.ts` and an `EvidenceCluster` type — P1, M.
- **No LoCoMo-style temporal-reasoning eval.** Add a temporal-QA harness alongside BEIR in `bench/bench-*` — P1, M.
- **No community detection / global-summary tier.** Add a Leiden pass + on-demand summary in `src/domain/graph.ts` gated by query intent — P2, L.
- **No formal conflict-detection across peers.** `oracle-gossip.ts` exists but does not surface contradictions per `docs/VISION.md` §Conflict. Add a contradiction scorer — P0, S→M.
- **Multi-hop traversal precision not measured.** Add MultiHop-RAG and HotPotQA scoring runs to `.planning/BENCH-v2.md` to expose where graph traversal earns its keep — P1, S.

## 5. Scale-plan validation (`.planning/p2p-scale-plan.md`)

- **Phase 1 — gossipsub fan-out for ≤50ms p50:** Approve. Matches the move LightRAG and HippoRAG 2 made toward cheap online retrieval. Confirm gossipsub does not bias result mix toward fastest responders — add tail-aware merge.
- **Phase 2 — one-call hook with `terminal:true` contract:** Approve with modification. Tie the terminal flag to the Vision satisfaction scorer (not just distance ≤ 1.0); otherwise the agent will skip search on a single confident hit that fails red-line checks (`docs/VISION.md` §Red lines).
- **Phase 3 — 10k simulated swarm:** Approve. Useful for stress-testing gossipsub propagation and merge attribution, but flag: simulation will not surface real sybil/poisoning behavior — pair with a small adversarial-peer test before claiming "ready for 10k real peers."
