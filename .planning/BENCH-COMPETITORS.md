# Competitor Benchmark Analysis

**Compiled:** 2026-04-12  
**Scope:** AI memory / RAG / knowledge-graph systems competing with or adjacent to folklore  
**Methodology:** All star counts verified via `gh api repos/<owner>/<repo>`. Benchmark numbers sourced from official READMEs, arxiv papers, or vendor blog posts — each claim is annotated with its source and whether the methodology was independently verified.

---

## Table 1 — Agent Memory Frameworks with Published Retrieval Benchmarks

| Name | GitHub | Stars | Last Push | License | MCP? | Benchmark Claim | Metric | Methodology Verified? | Source URL |
|------|--------|-------|-----------|---------|------|-----------------|--------|-----------------------|------------|
| **mem0** | [mem0ai/mem0](https://github.com/mem0ai/mem0) | 52,865 | 2026-04-12 | Apache-2.0 | Yes (OpenMemory, in-repo) | 66.9% (plain), 68.4% with graph variant (mem0ᵍ) | LOCOMO LLM-as-Judge | **Contested.** Mem0's own paper (ECAI 2025, arXiv:2504.19413); Zep disputes methodology | [arXiv:2504.19413](https://arxiv.org/abs/2504.19413) |
| **Graphiti / Zep** | [getzep/graphiti](https://github.com/getzep/graphiti) | 24,840 | 2026-04-08 | Apache-2.0 | Yes | 75.14% ±0.17 (Zep counter-claim); originally claimed 84%; Mem0 corrected to 58.44% | LOCOMO LLM-as-Judge | **Disputed.** Three-way conflict: 84% original → 58.44% Mem0 correction → 75.14% Zep counter | [zep-papers issue #5](https://github.com/getzep/zep-papers/issues/5); [Zep paper arXiv:2501.13956](https://arxiv.org/html/2501.13956v1) |
| **Letta** (formerly MemGPT) | [letta-ai/letta](https://github.com/letta-ai/letta) | 22,030 | 2026-04-12 | Apache-2.0 | No native MCP | 74.0% with gpt-4o-mini using filesystem storage ("Letta Filesystem") — beats Mem0's 68.5% | LOCOMO accuracy | **Claimed, plausible.** Letta blog Aug 2025; methodology is plain file-based semantic search, not specialized memory | [Letta blog](https://www.letta.com/blog/benchmarking-ai-agent-memory) |
| **cognee** | [topoteretes/cognee](https://github.com/topoteretes/cognee) | 15,200 | 2026-04-13 | Apache-2.0 | Yes (cognee-mcp) | HotPotQA: EM 0.5, F1 0.63, LLM-Correctness 0.7 vs Base RAG (EM 0, F1 0.12, LLM 0.4) | HotPotQA via 45 eval cycles, 24 questions, GPT-4o judge | **Claimed, limited scope.** 24 questions is tiny. Vendor blog, not arxiv. | [cognee blog](https://www.cognee.ai/blog/deep-dives/ai-memory-tools-evaluation) |
| **Honcho** | [plastic-labs/honcho](https://github.com/plastic-labs/honcho) | 2,258 | 2026-04-10 | AGPL-3.0 | Yes (mcp.honcho.dev) | None published | — | No published IR benchmark | — |
| **Memobase** | [memodb-io/memobase](https://github.com/memodb-io/memobase) | 2,676 | 2026-01-11 | Apache-2.0 | Yes | LOCOMO LLM-score 0.7578 overall (0.7092 single-hop, 0.8505 temporal, 0.4688 multi-hop) | LOCOMO | **Claimed, unverified independently.** Source is their own repo docs/experiments. | [memobase LOCOMO README](https://github.com/memodb-io/memobase/blob/main/docs/experiments/locomo-benchmark/README.md) |
| **Mastra** (Observational Memory) | [mastra-ai/mastra](https://github.com/mastra-ai/mastra) | 22,940 | 2026-04-13 | MIT (core) | Yes | 94.87% LongMemEval with gpt-5-mini; 84.23% with gpt-4o (prev SOTA claimed) | LongMemEval overall accuracy | **Claimed.** Mastra research page + VentureBeat coverage. Not arxiv. Uses two background LLM agents (Observer + Reflector) — not retrieval but compression | [Mastra research](https://mastra.ai/research/observational-memory) |
| **Engram** | [Gentleman-Programming/engram](https://github.com/Gentleman-Programming/engram) | 2,484 | 2026-04-12 | MIT | Yes (native MCP binary) | 80.0% LOCOMO accuracy; 19.6% relative improvement over Mem0; 93.6% fewer tokens than full context | LOCOMO (1,540 questions, 10 conversations) | **Claimed.** HN launch post + engram.fyi/research. arXiv:2511.12960 describes architecture | [arXiv:2511.12960](https://arxiv.org/html/2511.12960); [engram.fyi/research](https://www.engram.fyi/research) |
| **MemPalace** | [MemPalace/mempalace](https://github.com/MemPalace/mempalace) | 44,088 | 2026-04-13 | MIT | No | 96.6% R@5 raw (ChromaDB, no LLM), 100% R@5 with Haiku reranking | LongMemEval R@5 (recall_any@5) | **Inflated.** The 96.6% is verbatim text in ChromaDB, not the Palace architecture. 100% was hand-tuned for known-failing questions (issue #29, issue #214 document this). | [MemPalace benchmarks](https://www.mempalace.tech/benchmarks); [GH issue #214](https://github.com/milla-jovovich/mempalace/issues/214) |

### Benchmark Key

| Benchmark | What it measures | LLM call in eval? |
|-----------|-----------------|-------------------|
| LOCOMO (LLM-as-Judge) | Answer quality on 1,540 Q across 10 long convos | Yes — LLM grades answers |
| LongMemEval R@5 | Whether correct memory appears in top-5 retrieved | No — pure retrieval recall |
| LongMemEval overall accuracy | Whether agent correctly answers questions | Yes — LLM-assisted |
| HotPotQA EM/F1 | Multi-hop answer exact match and token overlap | Partial |

**Caution on LOCOMO comparisons:** Mem0 and Zep both cite LOCOMO but used incompatible evaluation setups (adversarial category inclusion, system prompt differences). Treat any single vendor's LOCOMO number as claimed, not settled.

---

## Table 2 — MCP-Native Memory / RAG Servers

| Name | GitHub | Stars | Last Push | License | MCP? | Benchmark Claim | Metric | Methodology Verified? | Notes |
|------|--------|-------|-----------|---------|------|-----------------|--------|-----------------------|-------|
| **mcp-memory-service** | [doobidoo/mcp-memory-service](https://github.com/doobidoo/mcp-memory-service) | 1,655 | 2026-04-10 | Apache-2.0 | Yes (primary purpose) | 86.0% R@5 (session-level mode); 80.4% turn-level | LongMemEval R@5 | **Verified.** Reproducible scripts in repo: `scripts/benchmarks/benchmark_longmemeval.py`. Uses ChromaDB + all-MiniLM-L6-v2. Turn-level default, session-mode = `memory_store_session` v10.35.0 | Closest apples-to-apples: same embedding model as folklore, same LongMemEval benchmark |
| **MCP servers/memory** (official) | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) (memory subdir) | 83,621 (repo total) | 2026-03-29 | MIT | Yes | None published | — | Knowledge-graph-style entity store. No retrieval benchmark. | Official Anthropic reference implementation; uses in-memory JSON graph, not vector search |
| **mem0 / OpenMemory MCP** | Part of [mem0ai/mem0](https://github.com/mem0ai/mem0/tree/main/openmemory) | 52,865 (repo total) | 2026-04-12 | Apache-2.0 | Yes (OpenMemory subdir) | No dedicated MCP benchmark; see mem0 LOCOMO above | — | OpenMemory is the MCP wrapper for mem0. No separate IR benchmark published for the MCP tier. | Local + private framing; MCP server in `/openmemory/api/` |
| **Engram** | [Gentleman-Programming/engram](https://github.com/Gentleman-Programming/engram) | 2,484 | 2026-04-12 | MIT | Yes (Go binary, native stdio MCP) | 80% LOCOMO | LOCOMO | See Table 1 | Single binary, SQLite + FTS5, zero Docker; most operationally simple MCP memory server with a published number |
| **folklore (Wave 2)** | [SaharBarak/folklore](https://github.com/SaharBarak/folklore) | — | 2026-04-14 | MIT | Yes (16 tools, primary purpose) | **72.30% NDCG@10, 79.76% R@5 (SciFact)** · **34.11% NDCG@10 (NFCorpus)** | Full BEIR v1 (SciFact 5,183×300, NFCorpus 3,633×323) | **Full-scale BEIR.** `node scripts/bench-beir-sota.mjs scifact --hybrid`. Hybrid dense (nomic-embed-text-v1.5) + BM25 FTS5 + RRF k=60. 137M params, CPU 36ms p50. Waves 3 & 4 documented failures. | Directly comparable to MTEB leaderboard; Wave 2 within ~2 NDCG points of bge-base-en-v1.5 (74.0) |

---

## Table 3 — Code Intelligence Tools (Phase 19 Comparison)

| Name | GitHub | Stars | Last Push | License | MCP? | Retrieval Benchmark | Metric | Notes |
|------|--------|-------|-----------|---------|------|---------------------|--------|-------|
| **Aider** | [Aider-AI/aider](https://github.com/Aider-AI/aider) | 43,250 | 2026-04-09 | Apache-2.0 | No | SWE-bench Lite 26.3% (2024); not a retrieval metric | Task completion | Not a retrieval benchmark. Aider does repo-map (graph of symbols) for context, not embedding-based RAG. No NDCG published. |
| **Continue.dev** | [continuedev/continue](https://github.com/continuedev/continue) | 32,515 | 2026-04-13 | Apache-2.0 | Yes (as MCP client) | No published retrieval benchmark. Blog: voyage-code-3 recommended for accuracy. | None | Code RAG: ~50 initial → ~10 re-ranked results. No NDCG/R@5 published. |
| **Sourcegraph SCIP** | [sourcegraph/scip](https://github.com/sourcegraph/scip) | 593 | 2026-04-13 | Apache-2.0 | No | None published for SCIP itself | — | SCIP is a code graph protocol (not an LLM tool directly). Cody uses SCIP + hybrid dense-sparse embeddings. No retrieval benchmark published for Cody. |
| **LanceDB** | [lancedb/lancedb](https://github.com/lancedb/lancedb) | 9,916 | 2026-04-12 | Apache-2.0 | No | ANN recall >0.95 @ <10ms (GIST-1M dataset, IVF index). No BEIR NDCG published. | ANN recall@1 | Not a code intelligence tool. Infrastructure layer. No BEIR benchmark. |
| **Weaviate Verba** | [weaviate/Verba](https://github.com/weaviate/Verba) | 7,647 | 2025-07-14 (inactive) | BSD-3-Clause | No | None published | — | Last pushed 2025-07-14. Effectively inactive. RAG chatbot demo, not production memory system. |

**SWE-bench context:** The primary code task benchmark. As of 2026-04, top agents exceed 50%+ on SWE-bench Verified. Aider's 26.3% was 2024 SOTA; the benchmark is not a retrieval metric — it measures end-to-end issue resolution.

---

## Embedding Model Baseline: nomic-embed-text-v1.5 on BEIR

folklore's Wave 2 pipeline uses `nomic-ai/nomic-embed-text-v1.5` (768-dim, 8192-token context, ONNX runtime) paired with SQLite FTS5 BM25 via Reciprocal Rank Fusion (RRF, k=60). Position on the real BEIR leaderboard:

| Model | Params | BEIR SciFact NDCG@10 | Runtime |
|-------|--------|----------------------|---------|
| BM25 (Anserini) | — | 66.5 | CPU |
| all-MiniLM-L6-v2 (v1 baseline) | 23M | 64.82 | CPU |
| nomic-embed-text-v1.5 (dense only) | 137M | ~71 | CPU |
| **folklore Wave 2 (nomic + BM25 hybrid)** | **137M** | **72.30** | **CPU, 36ms p50** |
| E5-base-v2 (dense only) | 109M | 73.1 | CPU |
| bge-base-en-v1.5 (dense only) | 110M | 74.0 | CPU |
| bge-large-en-v1.5 (dense only) | 335M | 74.6 | CPU |
| monoT5-3B reranker on top | 3B | 76.7 | **GPU** |

Sources: [MTEB leaderboard](https://huggingface.co/spaces/mteb/leaderboard), [Brewing BEIR (Kamalloo et al., SIGIR 2024)](https://arxiv.org/abs/2306.07471), [nomic embed tech report (arXiv:2402.01613)](https://arxiv.org/abs/2402.01613), [BGE paper (arXiv:2309.07597)](https://arxiv.org/abs/2309.07597)

**Implication for folklore's 72.30% NDCG@10:** Wave 2 lands ~2 points below the best dense-only encoders at our parameter budget, ~4.4 points below GPU-required reranker stacks, and well above the BM25 and v1 baselines. For a 137M-param CPU-local model with zero new dependencies (FTS5 is already in SQLite), this is competitive. Both Wave 3 (cross-encoder reranker) and Wave 4 (room-aware routing) were tested and documented as failures in BENCH-v2.md §2b and §2c.

---

## Synthesis: folklore's Competitive Position

**What folklore does that nothing else does in combination:**

1. **Multi-source heterogeneous ingestion as first-class architecture** — ArXiv, HN, RSS, any URL, local .ts/.js files, npm deps, git history, git submodules, X/Twitter, plus the GitHub analytics ecosystem (star-history, OSS Insight, Ecosyste.ms), all in a single graph with room-based namespacing. No competitor ships this breadth out of the box.

2. **Knowledge graph + vector search via native MCP** — 15 MCP tools including `find_tunnels` (cross-domain connection discovery) and `discover_loop` (recursive source expansion). mem0/OpenMemory has MCP but is pure memory. mcp-memory-service has MCP but is single-source. Cognee has MCP but targets enterprise/cloud.

3. **BEIR-methodology inline benchmark in CI** — folklore's `npm test` runs a reproducible BEIR/HotPotQA-style harness. Most competitors (Letta, Honcho, Engram) do not embed their benchmark in the test suite.

4. **P2P knowledge sharing (v2.0 Phase 15-19)** — libp2p-based peer discovery with Y.js CRDT for room metadata replication. No other MCP memory tool in this list has a peer-sharing layer. This is unique positioning.

5. **Code graph integration (Phase 19)** — tree-sitter-based structured indexing of your own codebase alongside external research. Bridges the gap between agent memory tools (mem0, Graphiti) and code intelligence tools (Continue, Aider) — a niche none of the above occupy.

**Where folklore's benchmark claim is honest (and documented):**

- **Wave 2 = 72.30% NDCG@10** on BEIR SciFact (full 5,183 × 300, not a mini-harness) via hybrid nomic-embed-text-v1.5 + BM25 RRF. Reproducible from `node scripts/bench-beir-sota.mjs scifact --hybrid`. Within ~2 points of bge-base-en-v1.5 (74.0) at the same parameter budget, ~4.4 points below GPU reranker stacks (monoT5-3B = 76.7).
- **Wave 3 failed.** Adding `Xenova/bge-reranker-base` cross-encoder regressed NDCG@10 to 70.38% (−1.92 points) with 25.9s p50 latency — generic MS-MARCO reranker has severe domain mismatch with scientific text. Documented in BENCH-v2.md §2b.
- **Wave 4 produced a null result.** Oracle room-routing on CQADupStack (3 subforums, 79,411 passages, 2,905 queries) beat flat hybrid by only +0.34 NDCG@10 — statistically null. The room architecture is valuable for namespaces/permissions/discovery, not for retrieval quality. Documented in BENCH-v2.md §2c.
- **Prior 96.8% NDCG@10 number was retired** as a reportable metric. It was a 15-passage × 10-query mini-harness — too small to produce a leaderboard-comparable number. It survives only as a smoke test in `npm test`.

**Market niche:** folklore is the only tool positioning as a *personal research knowledge graph* that also serves as an MCP server for coding agents — combining the research/reading workflow (papers, blogs, HN) with codebase intelligence and peer sharing. Mem0 is conversation memory. Graphiti/Zep is temporal entity memory. Engram/mcp-memory-service are session memory. None of those overlap with folklore's "your reading + your code + trending repos, all searchable from Claude" positioning.

---

## Sources

| Claim | Source |
|-------|--------|
| mem0 LOCOMO 66.9% / 68.4% | [arXiv:2504.19413](https://arxiv.org/abs/2504.19413); [mem0 research page](https://mem0.ai/research) |
| Zep LOCOMO dispute (58.44% vs 75.14% vs 84%) | [zep-papers issue #5](https://github.com/getzep/zep-papers/issues/5); [Zep blog](https://blog.getzep.com/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/) |
| Letta filesystem 74% LOCOMO | [Letta blog Aug 2025](https://www.letta.com/blog/benchmarking-ai-agent-memory) |
| Cognee HotPotQA EM/F1 | [Cognee blog](https://www.cognee.ai/blog/deep-dives/ai-memory-tools-evaluation) |
| Memobase LOCOMO 0.7578 | [memobase repo docs](https://github.com/memodb-io/memobase/blob/main/docs/experiments/locomo-benchmark/README.md) |
| Mastra Observational Memory 94.87% LongMemEval | [mastra.ai/research/observational-memory](https://mastra.ai/research/observational-memory); [VentureBeat](https://venturebeat.com/data/observational-memory-cuts-ai-agent-costs-10x-and-outscores-rag-on-long) |
| Engram 80% LOCOMO | [engram.fyi/research](https://www.engram.fyi/research); [arXiv:2511.12960](https://arxiv.org/html/2511.12960) |
| MemPalace 96.6% raw, 100% reranked — methodology issues | [MemPalace benchmarks](https://www.mempalace.tech/benchmarks); [GH issue #214](https://github.com/milla-jovovich/mempalace/issues/214); [GH issue #39](https://github.com/milla-jovovich/mempalace/issues/39) |
| mcp-memory-service 86.0% R@5 | [doobidoo README](https://github.com/doobidoo/mcp-memory-service) |
| all-MiniLM-L6-v2 MTEB score | [HF model page](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2); [ailog BEIR](https://app.ailog.fr/en/blog/news/beir-benchmark-update) |
| Aider SWE-bench 26.3% | [aider.chat](https://aider.chat/2024/05/22/swe-bench-lite.html) |
| folklore Wave 2 72.30% NDCG@10 / 79.76% R@5 (BEIR SciFact) | `scripts/bench-beir-sota.mjs`; results.json at `~/.folklore/bench/scifact__nomic-ai-nomic-embed-text-v1-5__hybrid/results.json` |
| folklore Wave 3 reranker failure (−1.92 pts, 25.9s latency) | `scripts/bench-beir-sota.mjs scifact --hybrid --rerank`; root-cause verified via `scripts/debug-reranker.mjs` |
| folklore Wave 4 room-routing null result (+0.34 oracle lift on CQADupStack) | `scripts/bench-room-routing.mjs`; results.json at `~/.folklore/bench/rooms__mathematica-webmasters-gaming__xenova-all-minilm-l6-v2/results.json` |
| All star counts | `gh api repos/<owner>/<repo>` — verified 2026-04-12 |
