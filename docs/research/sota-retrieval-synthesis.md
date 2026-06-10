# SOTA Retrieval Synthesis: CPU-Bound Memory & Temporal Reasoning (2024-2026)

> **Snapshot.** Research synthesis from the Phase 21–23 CPU-bound
> retrieval-optimization era (formerly root `findings.md`). Kept as
> reference; not the current direction — see
> `docs/PROJECT-PLAN-AKASHIK.md`.

This synthesis evaluates 2024-2026 retrieval techniques against the strict constraints of the `akashik` pipeline (CPU-only, ARM Hetzner CAX11 4GB, TypeScript + transformers.js + sqlite-vec), specifically targeting the 10-13pp loss in multi-session and temporal-reasoning questions on LongMemEval-S.

## 1. Late-Interaction CPU Ports
**Techniques:** ColBERTv2, PLAID, Jina-ColBERT-v2.
*   **Advantage:** Jina-ColBERT-v2 (with Matryoshka down to 64 dims) deployed via ONNX INT8 achieves near-SOTA BEIR NDCG (approaching 0.75+) by computing token-level interactions. PLAID allows sub-100ms multi-vector scoring on CPU.
*   **Trade-off/Disadvantage:** On the other hand, multi-vector representations inflate the `sqlite-vec` storage size by 10-50x compared to single-vector. Furthermore, `sqlite-vec` does not natively support the MaxSim operator required for ColBERT scoring, necessitating a custom UDF or application-side processing that will spike memory usage on a 4GB node.

## 2. Matryoshka Representation Learning (MRL) & SPLADE-v3
**Techniques:** Truncated embeddings (e.g., `nomic-embed-text-v1.5`), `naver/splade-v3`.
*   **Advantage:** MRL allows truncating dense vectors (e.g., to 128d) for blazing fast first-stage retrieval on CPU while retaining ~98% of the information. SPLADE-v3 achieves SOTA sparse lexical precision, acting as a "learned BM25" that flawlessly handles exact-match entities.
*   **Trade-off/Disadvantage:** Conversely, SPLADE-v3 requires storing dynamic sparse vectors. Since `sqlite-vec` is optimized for dense arrays, you must fall back to SQLite FTS5 with pseudo-text or use a separate sparse index, increasing architectural complexity. MRL maintains the same transformer forward-pass latency as full models; it only speeds up the vector distance calculation.

## 3. MTEB/BEIR 2024 Winners (Open-Weight)
**Techniques:** `gte-Qwen2-1.5B`, `bge-en-icl`, `NV-Embed-v2`.
*   **Advantage:** `gte-Qwen2-1.5B` is the most viable SOTA embedding LLM for CPU, capable of running via ONNX with INT8 quantization, providing top-tier MTEB scores due to its LLM backbone. `bge-en-icl` provides excellent in-context learning for niche domains.
*   **Trade-off/Disadvantage:** However, the tradeoff is extreme latency and OOM risk. Even a quantized 1.5B parameter model will consume ~1.2-1.5GB of RAM. On a 4GB Hetzner instance also running a Node daemon and SQLite, concurrent queries will trigger OOM kills. `NV-Embed-v2` (7B parameters, ~16GB VRAM) is completely unfeasible.

## 4. Conversational Memory & Temporal Retrieval
**Techniques:** Anthropic Contextual Retrieval, MemoRAG, LightRAG, MemGPT-2 (Letta).
*   **Advantage:** Anthropic's Contextual Retrieval (prepending 50-100 tokens of situational/temporal context to every chunk before embedding) directly targets the temporal-reasoning weak spot. It ensures vector searches match chronologically relevant facts, requiring zero changes to the `sqlite-vec` engine. LightRAG offers efficient incremental updates for relation tracking.
*   **Trade-off/Disadvantage:** The downside of Contextual Retrieval is increased token usage and indexing cost, as every chunk requires an LLM call to generate context. LightRAG introduces graph-traversal logic that is hard to debug on the fly, increasing the "bus factor" if the primary author is unavailable.

## 5. Reasoning-Augmented Retrieval
**Techniques:** Corrective-RAG, Self-RAG, Search-o1.
*   **Advantage:** Corrective-RAG dynamically grades retrieved chunks and triggers fallbacks (like web search or query rewriting) if confidence is low, drastically improving the LoCoMo factual harmonic-mean.
*   **Trade-off/Disadvantage:** The tradeoff is the addition of an LLM generation step directly in the critical retrieval path. This will add 1-3 seconds of latency, destroying the UX for fast typeahead or real-time conversational responses.

## 6. Rerankers Beyond MS-Marco
**Techniques:** `bge-reranker-v2`, `mxbai-rerank`, ColBERT-as-rerank.
*   **Advantage:** `mxbai-rerank` and `bge-reranker-v2` (quantized to ONNX) offer a 5-8% relative lift over `ms-marco-MiniLM` in zero-shot transfer, pulling up edge cases in SciFact.
*   **Trade-off/Disadvantage:** On the other hand, running a heavier cross-encoder over the Top-100 candidates on an ARM CPU is computationally punishing. To fit the latency budget, you must reduce the re-rank depth (e.g., Top-20), which caps the potential recall gain.

## Ablation-Stack Analysis: Compounding vs. Canceling
*   **Compounding:** Contextual Retrieval + MRL + `bge-reranker-v2`. Contextualization fixes the temporal/semantic ambiguity in the chunk; MRL ensures the first-stage SQLite search remains fast; the cross-encoder fixes precision.
*   **Canceling:** SPLADE-v3 + Contextual Retrieval. Adding generated context to chunks bloats the sparse vocabulary with LLM-generated generic tokens, diluting SPLADE's exact-match signals. MemoRAG + Self-RAG introduces redundant LLM reasoning cycles that compound latency but offer diminishing returns on accuracy.

## Top-3 Sprint Hit-List (Not Currently Planned)
1.  **Anthropic Contextual Retrieval (Data Preprocessing)**
    *   **Effort:** ~4 hours (prompt engineering at indexing time).
    *   **Expected Lift:** +0.02 to +0.03 on LME-S (directly hitting multi-session and temporal-reasoning).
    *   **CPU/ARM Viability:** 100% viable (shifts the compute to indexing time via API).
2.  **Jina-ColBERT-v2 (INT8 ONNX) as a Re-ranker**
    *   **Effort:** ~12 hours (integrating MaxSim scoring over small Top-20 sets).
    *   **Expected Lift:** +0.025 BEIR NDCG.
    *   **CPU/ARM Viability:** Viable only if restricted to Top-20 candidates to avoid CPU bottlenecks.
3.  **Matryoshka Truncation (using `nomic-embed-text-v1.5`)**
    *   **Effort:** ~6 hours (updating indexing logic and transformers.js parameters).
    *   **Expected Lift:** Neutral on accuracy, but frees up ~30% CPU cycles/memory, enabling concurrency.
    *   **CPU/ARM Viability:** Highly recommended for 4GB nodes.

## Cross-Cutting Concerns & Compliance

### Human Factors & Operational Sustainability
*   **Runbooks & On-Call:** Replacing BM25/MiniLM with WASM-based SPLADE or ColBERT MaxSim scoring makes the system vastly more complex. Are runbooks updated to diagnose an OOM kill caused by a runaway ONNX memory leak? The Hetzner 4GB instance has little margin for error; alert fatigue is a real risk if the daemon starts thrashing swap space.
*   **Bus Factor:** If we adopt custom ONNX graphs or custom SQLite UDFs for ColBERT, can more than one person on the team diagnose a production failure? We must balance SOTA techniques with maintainability.

### CI/CD Security (Privileged Attack Surface)
*   Treat the CI/CD pipeline as a highly privileged attack surface. It executes third-party code and has write access to production.
*   **Model Poisoning / Supply Chain:** If the CI/CD pipeline dynamically pulls `transformers.js` weights or ONNX files from Hugging Face without hash verification, a compromised upstream repository could inject poisoned embedding models, leading to targeted data blindness or prompt injection vulnerabilities.
*   **Mitigation:** Ensure artifact signing (SLSA) for the compiled Node binaries. Scope pipeline secrets strictly (e.g., HF tokens, Hetzner SSH keys) and ensure GitHub Actions cannot exfiltrate these via malicious PRs.

### Enterprise Compliance (SOC2 / GDPR / Data Residency)
*   **Contextual Retrieval Risk:** Prepending context to chunks means summarizing potentially sensitive temporal events. Under GDPR, if a user requests data deletion, we must guarantee that all synthetic contextual headers derived from that user's data are also purged from `sqlite-vec`.
*   Audit trails must explicitly log when an embedding model version changes, as this alters the fundamental representation of compliance-sensitive data.

## DONE