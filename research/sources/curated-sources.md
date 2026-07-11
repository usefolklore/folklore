# Curated Sources (per RQ)

*Authoritative primary sources gathered to seed notebook 2 and ground the
synthesis. Grouped by research question. URLs marked `⚠verify` were returned by
the search pass but the exact arXiv ID / year should be confirmed before
citing in a writeup (kept out of the seed manifest).*

## RQ1 — When reuse improves answer quality

- **Don't Do RAG: When Cache-Augmented Generation is All You Need** — arXiv:2412.15605 (2024). Conditions (bounded, stable knowledge fitting the context window) where preloading/reusing cached knowledge matches or beats RAG.
- **GPT Semantic Cache: Reducing LLM Costs and Latency via Semantic Embedding Caching** — arXiv:2411.05276 (2024). Reusing prior answers for semantically similar queries; accuracy/quality tradeoffs of a safe reuse.
- **GPTCache: An Open-Source Semantic Cache for LLM Applications** — ACL NLP-OSS 2023, https://aclanthology.org/2023.nlposs-1.24/ . Foundational semantic cache; similarity-threshold design governs whether reuse preserves quality.
- **MeanCache: User-Centric Semantic Cache for LLM Web Services** — arXiv:2403.02694 (2024). Federated user-centric cache; false-positive cache-hit analysis (when reuse degrades quality).
- **Semantic Caching of Contextual Summaries for QA** — arXiv:2505.11271 (2025). Reuses cached contextual summaries as input context for new QA.
- **A Generative Caching System for LLMs** — arXiv:2503.17603 (2025). Generative cache recombines/adapts prior responses for new queries.
- **LLMs Can Generate a Better Answer by Aggregating Their Own Responses** — arXiv:2503.04104 (2025). Generative Self-Aggregation: feeding a model its own prior responses as context improves quality.
- **Rethinking Caching for LLM Serving Systems** — arXiv:2508.18736 (2025). When cache reuse helps vs hurts in serving; quality/latency boundary.

## RQ2 — When reuse injects stale or misleading context (and detecting it)

- **Astute RAG: Overcoming Imperfect Retrieval and Knowledge Conflicts** — arXiv:2410.07176 (2024, Google). Misleading/conflicting retrieved context degrades answers; adaptively consolidate internal vs external knowledge.
- **AbstentionBench: Reasoning LLMs Fail on Unanswerable Questions** — arXiv:2506.09038 (2025, Meta FAIR). 20-dataset benchmark on correct abstention when context doesn't support an answer.
- **ReDeEP: Detecting Hallucination in RAG via Mechanistic Interpretability** — OpenReview (ICLR 2025), https://openreview.net/forum?id=ztzZDzgfrh . Hallucination = over-weighting parametric (stale) knowledge vs retrieved context; gives a detection signal.
- **Characterizing Query-Knowledge Relevance for Reliable RAG** — arXiv:2410.08320 (2024). Goodness-of-fit framework to flag out-of-knowledge queries before they mislead generation.
- **Uncertainty-Based Abstention in LLMs** — arXiv:2404.10960 (2024). Uncertainty as the abstention signal; reduces hallucination from weak/stale context.
- **RefusalBench: Generative Evaluation of Selective Refusal in Grounded LMs** — arXiv:2510.10390 (2025) `⚠verify`. Selective refusal when context is missing/conflicting/misleading.
- **Evaluating RAG Reliability under Clean, Misleading, and Mixed Retrieval** — arXiv:2606.07783 (2026) `⚠verify` (ID/year suspect; confirm before citing). Confidently-wrong answers from misleading evidence.

## RQ3 — Trust & provenance of reused context; poisoning defenses

- **PoisonedRAG: Knowledge Corruption Attacks to RAG** — USENIX Security 2025, arXiv:2402.07867. ~5 crafted docs per query → >90% corruption. The threat model that motivates provenance/trust controls.
- **Certifiably Robust RAG against Retrieval Corruption (RobustRAG)** — arXiv:2405.15556 (2024). Isolate-then-aggregate provably bounds the impact of a few poisoned passages.
- **Backdoored Retrievers for Prompt Injection on RAG** — arXiv:2410.14479 (2024). Poison the retriever embeddings so attacker passages are preferentially retrieved.
- **Machine Against the RAG: Jamming with Blocker Documents** — arXiv:2406.05870 (2024). One blocker doc → RAG withholds answers (availability attack).
- **Follow My Instruction and Spill the Beans: Data Extraction from RAG** — arXiv:2402.17840 (2024). Retrieved context as a confidentiality/leakage surface.
- **ReliabilityRAG: Provably Robust Defense for RAG Web-Search** — OpenReview, https://openreview.net/pdf?id=D9JeNTs5Bu (2025). Robust aggregation over noisy web corpora.
- **The EigenTrust Algorithm for Reputation Management in P2P Networks** — WWW 2003, https://nlp.stanford.edu/pubs/eigentrust.pdf . Canonical Sybil-resistant global trust via pre-trusted seed teleport.
- **C2PA — Content Provenance and Authenticity** — https://c2pa.org/ (ISO 22144). Cryptographically signed, tamper-evident provenance manifests (industry standard).

*(Plus the akashik notebook's own defense set: ingestion embedding-anomaly detection, zero-knowledge causal leave-one-out filtering, chunk-wise perplexity (PD/PM) filtering — see `01-notebook-discovery.md`.)*

## RQ4 — Compute / latency / token savings

- **vCache: Verified Semantic Prompt Caching** — arXiv:2502.03771 (ICLR 2026). Per-prompt learned thresholds with user-defined error-rate guarantees. **The named A/B baseline.**
- **GPTCache** — ACL NLPOSS 2023 (above). Reports 2–10× speedup on hits + API cost reduction.
- **Prompt Cache: Modular Attention Reuse** — arXiv:2311.04934 (MLSys 2024). Reuse precomputed attention of recurring prompt segments; 8×(GPU)–60×(CPU) TTFT reduction, no accuracy loss.
- **SGLang / RadixAttention** — arXiv:2312.07104 (NeurIPS 2024). Automatic KV-cache reuse across calls via radix tree; up to 6.4× throughput.
- **KVCache Cache in the Wild** — arXiv:2506.02634 (2025). Production cloud KV-cache reuse traces: real hit-rate/latency/cost distributions.
- **Mooncake: KVCache-centric Disaggregated Architecture** — USENIX FAST 2025, https://www.usenix.org/system/files/fast25-qin.pdf . Cross-request KV-cache reuse via distributed cache pool.
- **Cache-Craft: Managing Chunk-Caches for RAG** — arXiv:2502.15734 (SIGMOD 2025). KV reuse beyond strict prefixes for dynamically concatenated RAG chunks.

## RQ5 — Distributed/shared memory compounding across users

- **Collaborative Memory: Multi-User Memory Sharing in LLM Agents** — arXiv:2505.18279 (2025). Two-tier private/shared memory + dynamic access graphs; cross-user knowledge transfer with asymmetric permissions. **Closest prior art.**
- **Federated RAG: A Systematic Mapping Study** — Findings of EMNLP 2025, https://aclanthology.org/2025.findings-emnlp.388/ . Design space for distributed retrieval over siloed sources.
- **FRAG: Federated Vector Database Management for Collaborative & Secure RAG** — arXiv:2410.13272 (2024). Federated vector-DB so multiple parties contribute/retrieve from shared embeddings securely.
- **FedMosaic: Federated RAG via Parametric Adapters** — arXiv:2602.05235 (2026) `⚠verify`. Parametric adapters to share distributed knowledge without exposing raw data.
- **Optimal Document Selection in RAG via Combinatorial Optimization** — OpenReview, https://openreview.net/forum?id=gtcOku1v2s (2025). Retrieval as monotone submodular maximization (diminishing-returns coverage).
- **Stochastic Submodular Maximization: Coverage Functions** — NeurIPS 2017. Theory for the submodular value of pooled memory with (1−1/e) greedy bound.
- **Shared Experience Actor-Critic for Multi-Agent RL** — arXiv:2006.07169 (NeurIPS 2020). Sharing experience accelerates collective learning.
- **Selectively Sharing Experiences Improves Multi-Agent RL** — arXiv:2311.00865 (2023). Selectively sharing only the most relevant experiences maximizes group gains.

## RQ6 — Benchmarks & datasets

- **LongMemEval: Benchmarking Chat Assistants on Long-Term Interactive Memory** — arXiv:2410.10813 (ICLR 2025). 500 questions; extraction, multi-session reasoning, temporal reasoning, knowledge updates, abstention.
- **LoCoMo: Evaluating Very Long-Term Conversational Memory** — arXiv:2402.17753 (ACL 2024). ~27 sessions / ~600 turns; QA, event summarization, multimodal.
- **BEIR: Heterogeneous Zero-shot IR Benchmark** — arXiv:2104.08663 (NeurIPS 2021 D&B). 18 datasets; the retrieval-quality anchor (already wired in `bench/`).
- **MTEB: Massive Text Embedding Benchmark** — arXiv:2210.07316 (EACL 2023). Embedding quality driving retrieval & cache-match quality.
- **MemoryAgentBench: Evaluating Memory in LLM Agents** — arXiv:2507.05257 (2025) `⚠verify`. Accurate retrieval, test-time learning, long-range understanding, conflict resolution.

## RQ7 — Retrieval architectures / long-context (longer-term)

- **Hopfield Networks is All You Need** — arXiv:2008.02217 (ICLR 2021). Attention = modern Hopfield update; the "retrieval as energy descent" bridge.
- **RETRO: Improving LMs by Retrieving from Trillions of Tokens** — arXiv:2112.04426 (ICML 2022). Chunk-level cross-attention over an external DB; memory decoupled from parameters.
- **In-Context Retrieval-Augmented LMs** — arXiv:2302.00083 (TACL 2023). Prepend grounding docs to an unchanged LM; natural source attribution (provenance-aware ingestion).
- **Memorizing Transformers** — arXiv:2203.08913 (ICLR 2022). kNN-augmented attention over a 262K-token external memory.
- **HMT: Hierarchical Memory Transformer** — arXiv:2405.06067 (NAACL 2025). Sensory/short/long-term memory hierarchy.
- **MemLong: Memory-Augmented Retrieval for Long Text** — arXiv:2408.16967 (2024). Non-trainable retriever + retrieval-causal attention.
- **EpMAN: Episodic Memory AttentioN** — arXiv:2502.14280 (2025). Episodic memory module with attention-based chunk retrieval.
- **RAG: A Comprehensive Survey of Architectures, Enhancements, Robustness** — arXiv:2506.00054 (2025). Taxonomy anchor.
