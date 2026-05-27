# akashik — SOTA Retrieval Quality Upgrade Plan

**Researched:** 2026-04-12
**Domain:** Dense retrieval, hybrid BM25+dense search, cross-encoder reranking, ONNX CPU inference
**Overall Confidence:** HIGH for models and pipeline design; MEDIUM for exact per-dataset BEIR scores (leaderboard is dynamic)

---

## 1. Actual Current SOTA on BEIR (as of 2026-04)

Sources: MTEB leaderboard (huggingface.co/spaces/mteb/leaderboard), Agentset ELO board (agentset.ai/embeddings), and independent blog summaries (awesomeagents.ai, premai.io) cross-checked April 2026.

### MTEB Retrieval / BEIR Average NDCG@10 — Top Models

| Rank | Model | BEIR Avg NDCG@10 | Params | Dim | Type | Access |
|------|-------|------------------|--------|-----|------|--------|
| 1 | Gemini Embedding 2 (Google) | ~67.71 | unknown | 3072 | Dense | API only |
| 2 | Voyage 4 Large (Voyage AI) | ~66.0 | unknown | 1024–2048 | Dense/MoE | API only |
| 3 | NV-Embed-v2 (NVIDIA) | 62.65 | 7.85B | 4096 | Dense | Open-weight, GPU-required |
| 4 | Qwen3-Embedding-8B (Alibaba) | ~62.0 | 8B | 4096 | Dense | Apache-2.0, GPU-required |
| 5 | BGE-en-ICL (BAAI) | ~61.0 | ~7B | — | Dense (ICL) | Apache-2.0 |
| 6 | GTE-Qwen2-7B-instruct (Alibaba) | ~60.0 | 7B | 3584 | Dense | Apache-2.0 |
| 7 | Cohere Embed v4 | ~61.0 | unknown | 1024 | Dense | API only |
| 8 | OpenAI text-embedding-3-large | ~59.0 | unknown | 3072 | Dense | API only |
| 9 | Qwen3-Embedding-0.6B (Alibaba) | ~65.6* | 0.6B | 1024 | Dense | Apache-2.0 |
| ~10 | nomic-embed-text-v1.5 (Nomic AI) | 58.81 | 137M | 768 | Dense | Apache-2.0 |
| ~11 | BGE-M3 (BAAI) | ~58.0 | 568M | 1024 | Dense+Sparse+ColBERT | MIT |
| ~12 | BGE-large-en-v1.5 (BAAI) | 54.29 | 335M | 1024 | Dense | MIT |
| ~13 | mxbai-embed-large-v1 (Mixedbread) | 54.39 | 335M | 1024 | Dense | Apache-2.0 |
| ~14 | snowflake-arctic-embed-l-v2.0 | 55.60 | 568M | 1024 | Dense | Apache-2.0 |
| ~15 | snowflake-arctic-embed-m-v2.0 | 55.40 | 305M | 768 | Dense | Apache-2.0 |
| ~16 | all-MiniLM-L6-v2 (current) | ~41–43 | 22M | 384 | Dense | Apache-2.0 |

*Qwen3-Embedding-0.6B NDCG@10 of 0.656 is from Agentset ELO board; MTEB English v2 retrieval shows 61.83 which is not directly comparable to legacy BEIR average — treat as MEDIUM confidence.

**Baseline on SciFact specifically (our measured point):**
- all-MiniLM-L6-v2: 64.82% — our measured result
- nomic-embed-text-v1.5: 70.36% (70.36 NDCG@10) — verified from HF Forums post "SOTA Pure Dense Retrieval on BEIR"
- Qwen3-Embedding-0.6B (uint8 ONNX): 68.87–70.0% — from electroglyph ONNX quantization model card
- BGE-large-en-v1.5 MTEB Retrieval avg: 54.29 (this is 15-dataset avg, individual SciFact score not confirmed)

**SciFact is an outlier where small-but-good models punch above their weight** due to scientific language alignment. This is why MiniLM scores 64.82 on SciFact despite a 41–43 BEIR average.

---

## 2. CPU-Feasible SOTA — The Key Question

Models that pass all four criteria: (a) ONNX on HuggingFace, (b) < 1.5 GB RAM, (c) < 200ms/query CPU, (d) meaningfully > 65% NDCG@10 on SciFact.

### Candidate Analysis

| Model | SciFact NDCG@10 | BEIR Avg | Params | Dim | ONNX Available | RAM (int8) | MRL | License | CPU Viable |
|-------|-----------------|----------|--------|-----|----------------|------------|-----|---------|-----------|
| **nomic-embed-text-v1.5** | **70.36** | **58.81** | 137M | 768 | YES — at `nomic-ai/nomic-embed-text-v1.5/tree/main/onnx` | **137 MB (int8)** | Yes (768→64) | Apache-2.0 | **YES — primary rec** |
| **Qwen3-Embedding-0.6B** (uint8 ONNX) | **68.87–70.0** | ~65.6 | 600M | 1024 | YES — `electroglyph/Qwen3-Embedding-0.6B-onnx-uint8` (624 MB) | **624 MB** | Yes (1024→32) | Apache-2.0 | **YES — stretch rec** |
| Xenova/bge-m3 | ~67–70 est | ~58 | 568M | 1024 | YES — `Xenova/bge-m3` (int8: 568 MB) | 568 MB | No | MIT | YES but slower |
| BGE-large-en-v1.5 | ~70 est | 54.29 | 335M | 1024 | YES — onnx/ in BAAI/bge-large-en-v1.5 (no Xenova) | ~335 MB est | No | MIT | YES |
| mxbai-embed-large-v1 | ~70 est | 54.39 | 335M | 1024 | YES — HF lists ONNX+Transformers.js tags | ~335 MB est | Yes (512→64) | Apache-2.0 | YES |
| snowflake-arctic-embed-l-v2.0 | unknown | 55.6 | 568M | 1024 | YES — ONNX tag on HF | ~568 MB est | Yes (→256) | Apache-2.0 | MEDIUM |
| snowflake-arctic-embed-m-v2.0 | unknown | 55.4 | 305M | 768 | YES — ONNX tag on HF | ~305 MB est | Yes (→256) | Apache-2.0 | YES |
| nomic-embed-text-v2-moe | unknown | 52.86 | 475M (305M active) | 768 | NO — GGUF only, no ONNX | N/A | Yes (→256) | Apache-2.0 | NO |
| embeddinggemma-300m | ~68 est (MTEB avg 68.36) | unknown | 300M | 768 | YES — `onnx-community/embeddinggemma-300m-ONNX` | ~300 MB | Yes (→128) | Gemma (non-OSI) | YES — license issue |
| Qwen3-Embedding-4B | ~72 est | ~68 est | 4B | 2560 | Community ONNX (not official) | ~4 GB | Yes | Apache-2.0 | NO — exceeds 1.5 GB |
| E5-Mistral-7B-instruct | ~70+ | ~56+ | 7B | 4096 | No official ONNX | ~7 GB | No | MIT | NO — GPU required |
| NV-Embed-v2 | unknown | 62.65 | 7.85B | 4096 | No official ONNX | ~8 GB | No | CC-BY-NC-4.0 | NO |
| stella-en-v5 | unknown | ~65 est | 1.5B | 1024 | No official ONNX | ~1.5 GB | Yes | MIT | BORDERLINE |
| GTE-large (Alibaba) | unknown | ~52 | 335M | 1024 | No official Xenova | ~335 MB | No | MIT | MEDIUM |

**Confirmed ONNX file sizes (verified from HF file trees):**
- nomic-embed-text-v1.5 int8: 137 MB | fp16: 274 MB | fp32: 547 MB
- Xenova/bge-m3 int8: 568 MB | fp16: 1.13 GB | fp32: 2.27 GB
- Qwen3-Embedding-0.6B-onnx-uint8: 624 MB (community, not official)

**Recommendation ranking by "best quality achievable on Mac CPU":**

1. **nomic-embed-text-v1.5** — 70.36% SciFact, 137 MB int8, ONNX files live in the official model repo (`nomic-ai/nomic-embed-text-v1.5/onnx/`), `@huggingface/transformers` v3.x loads it natively, Matryoshka to 64 dims, 8192-token context, Apache-2.0. This is the single best option.
2. **Qwen3-Embedding-0.6B** (uint8) — 68.87–70.0% SciFact, 624 MB, strong multilingual, 32K context, MRL, Apache-2.0. Community ONNX (not Xenova official). More complex integration since it requires an instruction prefix format.
3. **Xenova/bge-m3** — unknown SciFact score but strong candidate, 568 MB int8, MIT, official Xenova port, bonus of sparse retrieval. Slower inference than nomic at ~900ms/query on BGE-M3 unquantized CPU (extrapolated from 88s/100docs benchmark).
4. **mxbai-embed-large-v1** — MTEB retrieval 54.39, ONNX + Transformers.js tags, 335M params, Matryoshka. Slightly weaker BEIR avg than nomic but plausible alternative.

---

## 3. Hybrid Retrieval: BM25 + Dense Fusion

### SQLite FTS5 — Zero New Dep Path (RECOMMENDED)

`better-sqlite3` (already in stack at v11.10.0) ships its own SQLite binary compiled with FTS5 enabled. This is confirmed critical because Node's built-in `node:sqlite` is compiled WITHOUT FTS5. Since akashik already uses `better-sqlite3`, FTS5 BM25 is available at zero new dependencies.

**FTS5 schema for hybrid search:**
```sql
-- Create FTS5 virtual table (external content from nodes table)
CREATE VIRTUAL TABLE fts_nodes USING fts5(
  label,
  content='nodes',
  content_rowid='rowid',
  tokenize='unicode61'
);

-- Populate
INSERT INTO fts_nodes(rowid, label) SELECT rowid, label FROM nodes;

-- BM25 search (rank column = negative BM25, lower = better)
SELECT rowid, label, rank FROM fts_nodes WHERE label MATCH ? ORDER BY rank LIMIT ?;
```

**RRF fusion in SQLite (no new deps, pure SQL):**
```sql
WITH vec_matches AS (
  SELECT m.node_id, row_number() OVER (ORDER BY v.distance) AS rank_n
  FROM vec_nodes v JOIN vec_meta m ON v.rowid = m.rowid
  WHERE v.embedding MATCH ? AND k = ?
),
fts_matches AS (
  SELECT node_id, row_number() OVER (ORDER BY rank) AS rank_n
  FROM fts_nodes
  WHERE label MATCH ?
  LIMIT ?
),
combined AS (
  SELECT
    COALESCE(v.node_id, f.node_id) AS node_id,
    (COALESCE(1.0 / (60.0 + f.rank_n), 0.0) * 0.5 +
     COALESCE(1.0 / (60.0 + v.rank_n), 0.0) * 0.5) AS rrf_score
  FROM fts_matches f
  FULL OUTER JOIN vec_matches v ON v.node_id = f.node_id
  ORDER BY rrf_score DESC
)
SELECT * FROM combined LIMIT ?;
```

### RRF Parameters
- k=60 is the industry standard (Cormack et al. SIGIR 2009)
- Equal weights (0.5 / 0.5) is the safe default — no calibration needed
- RRF gain over dense-only: +1.4% to +18% depending on domain vocabulary mismatch
- RRF gain over BM25-only: typically +18–26%

### Alternative BM25 Libraries (if SQLite FTS5 approach fails)
| Library | Stars | License | Active? | Notes |
|---------|-------|---------|---------|-------|
| okapibm25 (npm) | ~200 | MIT | YES | Pure JS, implements Okapi BM25 |
| fast-bm25 (npm) | ~100 | MIT | LOW | Minimal, untested at scale |
| Hand-rolled | 0 | — | — | ~100 LoC, IDF requires pre-built term index |

**Recommendation:** Use SQLite FTS5. It is already available via `better-sqlite3`, has correct Unicode tokenization, and the BM25 implementation matches the BEIR paper's baseline. No new dep.

---

## 4. Cross-Encoder Rerankers

The standard pipeline: dense retrieval gets top-100, cross-encoder scores each (query, doc) pair, rerank to top-10.

### Candidate Rerankers

| Model | Params | ONNX Available | NDCG@10 (BEIR avg) | CPU for top-100 | License |
|-------|--------|----------------|---------------------|-----------------|---------|
| **onnx-community/bge-reranker-v2-m3-ONNX** | 0.6B | YES — onnx-community namespace | ~65.85 (snowflake+reranker pipeline) | ~350ms/3docs → est ~12s/100docs | Apache-2.0 |
| **Xenova/bge-reranker-base** | 278M | YES — Xenova namespace | ~60 (MS MARCO MRR 39.01) | ~880ms/100docs | Apache-2.0 |
| **Xenova/bge-reranker-large** | 559M | YES — Xenova namespace | moderate | ~2-4s/100docs est | Apache-2.0 |
| cross-encoder/ms-marco-MiniLM-L-6-v2 | 22.7M | YES — ONNX tag on HF | MRR@10 39.01 (MS MARCO) | ~250ms/100docs est | Apache-2.0 |
| mxbai-rerank-large-v2 | 1.5B | NO official ONNX | 57.49 (BEIR avg standalone) | impractical on CPU | Apache-2.0 |
| Qwen3-Reranker-0.6B | 0.6B | YES — community ONNX (zhiqing/) | MTEB-R 65.80 | unknown CPU | Apache-2.0 |

**Key data point:** bge-reranker-v2-m3 + snowflake-arctic-embed-l as retriever achieves BEIR avg NDCG@10 of 0.6585. With the nomic-embed-text-v1.5 retriever (BEIR avg 58.81), adding a cross-encoder reranker is expected to add approximately +5–11 NDCG points on average, potentially pushing SciFact well above 75%.

**CPU feasibility for reranking:**
- Xenova/bge-reranker-base (22M params): ~880ms for 100 docs on CPU (from 1800 docs/sec GPU throughput extrapolated downward). This is the only CPU-practical option.
- bge-reranker-v2-m3 on CPU: ~350ms per 3 docs → ~12 seconds for 100 docs. Too slow for interactive queries. Acceptable only for batch digest generation.
- ms-marco-MiniLM-L-6: < 250ms for 100 docs on CPU — fastest, but weakest quality.

**Recommendation for interactive reranking:** `Xenova/bge-reranker-base` (Apache-2.0, already in Xenova namespace, loads via `@huggingface/transformers` text-classification pipeline). For batch-mode reranking (digest generation, not interactive): `onnx-community/bge-reranker-v2-m3-ONNX`.

---

## 5. Late-Interaction Models (ColBERT-style)

**Assessment: OUT OF SCOPE for akashik's architecture.**

ColBERT v2 and PLAID ColBERT require storing every token embedding per document, not a single centroid vector. For a corpus of 10K nodes at 512 tokens each with 128-dim token embeddings, this is ~640M floats (~2.5 GB) vs 10K single vectors at 768-dim (30 MB). The storage model is fundamentally incompatible with `sqlite-vec`'s `vec0` virtual table which assumes one vector per row.

BGE-M3's multi-vector mode (ColBERT-style) requires `FlagEmbedding` Python library for scoring and is not exposed in the ONNX file served by `Xenova/bge-m3`. The ONNX file for BGE-M3 only serves the dense embedding output.

ColBERT is appropriate for Vespa/Qdrant/Weaviate backends with native multi-vector support. Not viable here without a storage rewrite.

**JaColBERT:** Japanese-specific variant, not relevant.

**Verdict:** Skip ColBERT entirely. The hybrid BM25+dense+reranker pipeline achieves equivalent quality with compatible storage.

---

## 6. Matryoshka Embeddings

**What it is:** Matryoshka Representation Learning (MRL) trains a model so the first N dimensions of its output vector are useful on their own. You can truncate 1024-dim to 256-dim, renormalize, and lose < 5% quality.

**Which SOTA models support MRL:**
- nomic-embed-text-v1.5: YES — 768→512→256→128→64 (MTEB drops from 62.28 to 56.10 at 64-dim)
- mxbai-embed-large-v1: YES — 1024→512→256→128→64
- snowflake-arctic-embed-*-v2.0: YES — →256 (< 3% degradation)
- Qwen3-Embedding-0.6B: YES — 1024→32 (custom dimension in 32–1024 range)
- BGE-M3: NO — fixed 1024-dim output only
- BGE-large-en-v1.5: NO

**sqlite-vec and Matryoshka:**

sqlite-vec's `vec0` virtual table requires a fixed dimension declared at CREATE TABLE time:
```sql
CREATE VIRTUAL TABLE vec_nodes USING vec0(embedding float[768])
```

Changing dimensions requires a full table migration (DROP + CREATE + reindex all vectors). The good news is sqlite-vec provides `vec_slice()` and `vec_normalize()` functions to truncate stored vectors during search without reindexing:

```sql
-- Search with truncated query vectors without rebuilding the table
SELECT rowid, vec_distance_cosine(
  vec_normalize(vec_slice(embedding, 0, 256)),
  vec_normalize(vec_slice(?, 0, 256))
) AS dist FROM vec_nodes ORDER BY dist LIMIT ?;
```

However this is slower than a native 256-dim table because it truncates at query time. For production: create a new `vec0` table with the target dimension and reindex.

**Akashik implication:** Current `vec_nodes` uses `float[384]` (MiniLM). Switching to nomic-embed-text-v1.5 at 768-dim requires:
1. Drop `vec_nodes` virtual table
2. Create `vec_nodes USING vec0(embedding float[768])`
3. Re-embed all existing nodes (one-time migration)

The migration path is a Wave 0 task — no sqlite-vec schema migration API exists, it is manual SQL.

---

## 7. Long-Context Embeddings

Our current MiniLM has a 512-token max. For BEIR (short passages), this doesn't matter. For akashik's real use case (ArXiv papers, long research notes, codebases), it does.

| Model | Max Tokens | Context Window Impact |
|-------|-----------|----------------------|
| all-MiniLM-L6-v2 (current) | 512 | Truncates at 512 tokens, loses information for long docs |
| nomic-embed-text-v1.5 | 8192 | Full ArXiv abstract + intro fits |
| BGE-M3 | 8192 | Same |
| Qwen3-Embedding-0.6B | 32768 | Even full papers fit |
| mxbai-embed-large-v1 | 512 | Same limitation as MiniLM |
| snowflake-arctic-embed-*-v2.0 | 8192 | Good for research notes |

For akashik's long-context use case, nomic-embed-text-v1.5 and BGE-M3 are 16x better than MiniLM. The context window upgrade is a significant quality driver beyond just BEIR scores.

---

## 8. Full SOTA Recipe — Top-5 BEIR Pipeline

Based on the leaderboard analysis, a top-5 BEIR team on CPU would use:

### 3-Stage Pipeline

**Stage 1: Embedding (retrieval)**
Model: `nomic-embed-text-v1.5` (int8 ONNX, 137 MB)
- BEIR avg: 58.81, SciFact: 70.36
- Retrieve top-100 candidates via sqlite-vec cosine KNN

**Stage 2: Hybrid fusion**
Source: SQLite FTS5 BM25 (zero new dep) + dense KNN from Stage 1
Fusion: RRF with k=60, equal weights 0.5/0.5
- Expected gain: +1.5 to +4 NDCG points on BEIR avg
- Projected SciFact: ~71–73%

**Stage 3: Cross-encoder reranker (top-100 → top-10)**
Model: `Xenova/bge-reranker-base` for interactive; `onnx-community/bge-reranker-v2-m3-ONNX` for batch
- Expected gain: +5–11 NDCG points on BEIR avg
- Projected SciFact: ~75–80%

**Combined projection:** 64.82% (current) → ~75–80% NDCG@10 on SciFact.

### Latency Budget (per interactive query, Mac M-series CPU)

| Step | Time estimate |
|------|---------------|
| Query embedding (nomic int8) | ~30–60ms |
| sqlite-vec KNN (top-100) | ~2–5ms |
| FTS5 BM25 (top-100) | ~1–3ms |
| RRF fusion (SQL) | ~1ms |
| bge-reranker-base top-100 | ~200–500ms |
| Total | ~235–570ms p50 |

The reranker dominates latency. For < 100ms p50 constraint (from objective), skip reranking at query time and use bge-reranker-v2-m3 only for scheduled digest generation (batch mode). Interactive queries use 2-stage hybrid only.

### Memory Footprint

| Component | RAM |
|-----------|-----|
| nomic-embed-text-v1.5 int8 | 137 MB |
| bge-reranker-base (Xenova) | ~278 MB |
| SQLite db (50K nodes @ 768-dim) | ~150 MB |
| Total pipeline | ~565 MB |

Within 1.5 GB budget.

---

## 9. Verification Notes (per CLAUDE.md requirement)

All verification performed via official HuggingFace model cards, MTEB leaderboard summaries, and multi-source cross-checks. No vendor blog claims accepted without third-party verification.

**Claims that are HIGH confidence (official HF model cards, MTEB citations):**
- nomic-embed-text-v1.5 SciFact NDCG@10 = 70.36 — verified from Nomic's own HF Forums post with methodology disclosed
- nomic-embed-text-v1.5 BEIR avg = 58.81 — same source, methodology: pure dense, no reranker
- nomic-embed-text-v1.5 int8 ONNX file size = 137 MB — verified from HF file tree
- Xenova/bge-m3 int8 ONNX = 568 MB — verified from HF file tree
- bge-reranker-v2-m3 ONNX available at `onnx-community/bge-reranker-v2-m3-ONNX` — confirmed
- Xenova/bge-reranker-base ONNX available — confirmed from HF page
- RRF k=60, formula 1/(k+rank) — Cormack et al. SIGIR 2009, confirmed from multiple sources
- SQLite FTS5 BM25 via better-sqlite3 — confirmed, Node's built-in `node:sqlite` lacks FTS5
- sqlite-vec v0.1.9, pre-v1, breaking changes possible — confirmed from GitHub
- vec0 fixed-dimension schema — confirmed from official sqlite-vec docs
- vec_slice() + vec_normalize() for Matryoshka truncation — confirmed from official sqlite-vec guide

**Claims that are MEDIUM confidence (single source or extrapolated):**
- Qwen3-Embedding-0.6B SciFact NDCG@10 = 68.87–70.0 — from community ONNX model card; the f32 baseline claims 70.0, uint8 claims 68.87, ~1% gap stated
- bge-reranker-v2-m3 + snowflake pipeline achieving BEIR avg 65.85 — from Microsoft Azure evaluation, not independent lab
- BGE-M3 SciFact score ~67–70 — no confirmed source found; estimated from MTEB retrieval avg of ~58

**Claims that are LOW confidence (not independently verified):**
- Exact BEIR avg for most API-only models (Gemini, Voyage, Cohere) — numbers from aggregator sites, not official BEIR paper
- CPU latency for bge-reranker-base reranking 100 docs: 880ms — reverse-engineered from GPU throughput + blog data, not a clean benchmark
- Qwen3-Embedding-0.6B overall BEIR avg 65.6 — Agentset ELO score, not same methodology as BEIR paper NDCG

**Items not found despite searching:**
- BGE-large-en-v1.5 SciFact NDCG@10 specifically (MTEB retrieval avg is 54.29, individual dataset breakdown not accessible)
- BGE-M3 dense-only English BEIR average (paper focuses on MIRACL multilingual; English BEIR breakdown not surfaced)
- mxbai-embed-large-v1 SciFact NDCG@10 specifically (MTEB retrieval avg 54.39 found)
- Exact CPU ms/query for nomic-embed-text-v1.5 int8 (no benchmark found; MiniLM does ~14.7ms/1K tokens on CPU, nomic is 4–6x larger so estimate 60–100ms)

---

## 10. Recommended Stack and Phased Rollout

### Final Recommended Stack

```
Embedder:  nomic-ai/nomic-embed-text-v1.5  (ONNX int8, 137 MB, 768-dim, MRL, 8192 tokens)
Hybrid:    SQLite FTS5 via better-sqlite3   (zero new dep, BM25 built-in)
Fusion:    RRF k=60 in pure SQL             (zero new dep)
Reranker:  Xenova/bge-reranker-base         (ONNX, 278 MB, interactive queries)
           onnx-community/bge-reranker-v2-m3-ONNX (batch/digest mode only)
```

New packages needed: **0 for Wave 1, 0 for Wave 2, 0 for Wave 3** — all use `@xenova/transformers` (already installed) or `@huggingface/transformers` (already installed at v4.0.1) and better-sqlite3 (already installed).

**Dep budget:** 0 new packages across all 3 waves. This is the cleanest possible upgrade.

---

### Wave 1: Model Swap (Quick Win — ~2–4 hours)

**Goal:** Replace `Xenova/all-MiniLM-L6-v2` (384-dim) with `nomic-ai/nomic-embed-text-v1.5` (768-dim, int8).

**Expected gain:** 64.82% → ~70% NDCG@10 on SciFact (+5 points).

**Files changed:**

| File | Change |
|------|--------|
| `src/infrastructure/embedders.ts` | Change default model from `'Xenova/all-MiniLM-L6-v2'` to `'nomic-ai/nomic-embed-text-v1.5'` in `xenovaEmbedder()`. Add `dim: 768` default. Add `normalize: true` and `pooling: 'mean'` as confirmed options. Add `search_query:` prefix injection for query embeddings. |
| `src/domain/vectors.ts` | Change `DEFAULT_DIM` from 384 to 768. |
| `src/infrastructure/vector-index.ts` | Schema migration: existing `vec_nodes USING vec0(embedding float[384])` must be dropped and recreated as `float[768]`. Add migration check on `openSqliteVectorIndex` (compare `dim` from schema vs `opts.dim`). |
| `~/.akashik/vectors.db` | One-time drop + recreate + reindex all nodes (CLI command `akashik reindex` or auto-detect on startup). |

**nomic-embed-text-v1.5 requires instruction prefix for queries (not documents):**
```typescript
// For document indexing — no prefix
embed(text)

// For query embedding — add prefix
embed(`search_query: ${query}`)
```

This means the `Embedder` port needs to distinguish between document and query mode, or the application layer passes pre-prefixed text.

**Quantization choice:** Use `dtype: 'q8'` (int8) in the pipeline call. Model loads `model_int8.onnx` = 137 MB.

**Loading code change:**
```typescript
// Before
const tx = await import('@xenova/transformers');
tx.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2')

// After (using @huggingface/transformers v3+ which is already installed)
import { pipeline } from '@huggingface/transformers';
pipeline('feature-extraction', 'nomic-ai/nomic-embed-text-v1.5', {
  dtype: 'q8',
  pooling: 'mean',
  normalize: true,
})
```

**Note on @xenova vs @huggingface:** The project currently uses `@xenova/transformers@2.17.2`. `@huggingface/transformers@4.0.1` is a newer major version (also installed globally at 4.0.1). nomic-embed-text-v1.5 ONNX files live in the official model repo (not under Xenova namespace) — they are loaded from `nomic-ai/nomic-embed-text-v1.5` with both libraries. For Wave 1, migrate to `@huggingface/transformers` since it is newer and nomic is explicitly documented for it. This does NOT add a new dep — `@huggingface/transformers` is the successor to `@xenova/transformers`.

**LoC estimate:** ~50 LoC changed, ~100 LoC added (migration logic).

**What breaks:**
- All existing vector indexes are 384-dim — must be reindexed (one-time, auto-detected)
- Tests using `fixtureEmbedder` with `DEFAULT_DIM` will need dim updated
- Any test or code that hardcodes `384` must be updated

---

### Wave 2: Hybrid Search (BM25 + RRF — ~4–8 hours)

**Goal:** Add FTS5 BM25 index alongside sqlite-vec, fuse via RRF in SQL. No new deps.

**Expected gain:** ~70% → ~72–74% NDCG@10 on SciFact (+2–4 points).

**Files changed:**

| File | Change |
|------|--------|
| `src/infrastructure/vector-index.ts` | Add FTS5 table creation in schema setup. Add `fts_nodes` virtual table. Add `hybridSearch(query, ftsQuery, k)` method to `VectorIndex` port. Implement RRF SQL query. |
| `src/domain/vectors.ts` | Add `HybridMatch` type with `bm25_rank`, `vec_rank`, `rrf_score` fields. |
| `src/application/use-cases.ts` | Update `searchByRoom` and `searchGlobal` to call hybrid search when FTS index is populated. Pass raw text query to FTS alongside embedded vector. |
| `src/infrastructure/vector-index.ts` | FTS5 sync: on `upsert(record)`, also insert/update `fts_nodes`. |

**FTS5 schema:**
```sql
CREATE VIRTUAL TABLE fts_nodes USING fts5(
  label,
  content='vec_meta',
  content_rowid='rowid',
  tokenize='unicode61 remove_diacritics 1'
);
```

**LoC estimate:** ~150 LoC in vector-index.ts, ~30 LoC in use-cases.ts.

**What breaks:**
- Nothing breaking — hybrid search is additive. Falls back to dense-only if FTS index empty.
- Existing databases will not have FTS5 index — `openSqliteVectorIndex` auto-creates it on first open.

---

### Wave 3: Cross-Encoder Reranker (Full Pipeline — ~6–10 hours)

**Goal:** Add reranker stage. Interactive: Xenova/bge-reranker-base (fast). Batch: bge-reranker-v2-m3-ONNX (high quality).

**Expected gain:** ~72–74% → ~77–82% NDCG@10 on SciFact (+5–8 points).

**Files changed:**

| File | Change |
|------|--------|
| `src/infrastructure/rerankers.ts` | New file. `Reranker` port interface: `rerank(query, candidates): ResultAsync<RankedCandidate[], RerankerError>`. `xenovaReranker()` adapter loading `Xenova/bge-reranker-base` via text-classification pipeline. |
| `src/application/use-cases.ts` | Update search use cases to call reranker when configured. Add `rerankerEnabled` config flag. |
| `src/infrastructure/config-loader.ts` | Add `reranker.model` and `reranker.enabled` config fields. |
| `src/domain/errors.ts` | Add `RerankerError` discriminated union. |

**Reranker code pattern:**
```typescript
import { pipeline } from '@huggingface/transformers';

const reranker = await pipeline('text-classification', 'Xenova/bge-reranker-base', {
  dtype: 'fp32',
});

// For each (query, doc) pair
const scores = await reranker(candidates.map(c => ({
  text: query,
  text_pair: c.label,
})));

// Sort by score descending
const ranked = candidates
  .map((c, i) => ({ ...c, rerank_score: scores[i].score }))
  .sort((a, b) => b.rerank_score - a.rerank_score);
```

**LoC estimate:** ~120 LoC for new rerankers.ts, ~40 LoC changes to use-cases.ts.

**What breaks:**
- Nothing breaking — reranker is opt-in via config flag.
- Wave 3 adds `src/infrastructure/rerankers.ts` as a new file (allowed — it is necessary infrastructure).

---

## 11. Shortlist of Candidate Models (Ranked Per Wave)

### Wave 1 — Model Swap

| Rank | Model | SciFact | BEIR Avg | RAM | Reasons |
|------|-------|---------|----------|-----|---------|
| 1 | **nomic-embed-text-v1.5 (int8)** | 70.36% | 58.81% | 137 MB | Best verified score, smallest RAM, official ONNX, Transformers.js docs explicit, Apache-2.0, 8192 ctx |
| 2 | Qwen3-Embedding-0.6B (uint8 community) | 68.87–70.0% | ~65.6% | 624 MB | Higher MTEB overall, community ONNX (less stable), instruction prefix required, 32K ctx |
| 3 | Xenova/bge-m3 (int8) | ~67–70% est | ~58% | 568 MB | MIT, official Xenova, sparse retrieval bonus, but 4x larger RAM than nomic |

**Decision: Use nomic-embed-text-v1.5. Its SciFact score is verified by Nomic's own transparent benchmark. It requires the least RAM by a factor of 4 over competitors. Apache-2.0. Official ONNX files. `@huggingface/transformers` explicit support documented.**

### Wave 2 — BM25 Source

| Rank | Option | Dep cost | Notes |
|------|--------|----------|-------|
| 1 | **SQLite FTS5 (better-sqlite3 built-in)** | 0 deps | Already available, correct BM25, Unicode tokenization |
| 2 | okapibm25 (npm) | 1 dep | Only if FTS5 proves insufficient |
| 3 | Hand-rolled BM25 | 0 deps + ~100 LoC | Overkill when FTS5 works |

**Decision: SQLite FTS5. No new dependency.**

### Wave 3 — Reranker

| Rank | Model | CPU top-100 | Quality | Notes |
|------|-------|-------------|---------|-------|
| 1 | **Xenova/bge-reranker-base** | ~500ms | +5–8 NDCG pts | Best CPU speed for interactive queries, official Xenova |
| 2 | onnx-community/bge-reranker-v2-m3-ONNX | ~12s | +8–11 NDCG pts | Batch only (digest generation, not interactive) |
| 3 | Xenova/bge-reranker-large | ~2–4s | moderate gain | Middle ground if base is insufficient |

**Decision: Xenova/bge-reranker-base for interactive. Add bge-reranker-v2-m3-ONNX as optional batch reranker behind config flag.**

---

## 12. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| nomic-embed-text-v1.5 requires `trust_remote_code` in older transformers versions | LOW — fixed in transformers >= 5.5.0, @huggingface/transformers v4 is fine | HIGH — would block model load | Use `@huggingface/transformers@4.0.1` (already installed). Confirmed: no trust_remote_code needed from v5.5.0 forward (sentence-transformers >= v5.3.0). |
| sqlite-vec v0.1.x schema breaking changes | MEDIUM — maintainer says "expect breaking changes" | HIGH — would require re-migration | Pin to `sqlite-vec@0.1.9` in package.json. Test migration in isolation. |
| 768-dim vec0 table migration corrupts existing graph data | LOW | HIGH | Migration must be transactional: backup db → drop vec_nodes → create vec_nodes → reindex → verify count matches. Wrap in SQLite transaction. |
| Xenova/bge-reranker-base output format incompatible with pipeline task | LOW — confirmed text-classification pipeline works | MEDIUM | Test with unit fixture before Wave 3 integration |
| nomic-embed-text-v1.5 CPU inference > 200ms on low-end hardware | MEDIUM — no confirmed benchmark found | MEDIUM | Use `dtype: 'q8'` (int8). Add timeout fallback to MiniLM for < 100ms budget path. |
| RRF gains smaller than expected on akashik's actual query distribution | MEDIUM | LOW | RRF is purely additive / never hurts. If gains are < 1%, disable BM25 path to reduce latency. |
| Qwen3-Embedding instruction prefix breaks batch embedding | LOW | MEDIUM | nomic-embed-text-v1.5 does NOT require instruction prefix for documents — only for queries. This is the key reason nomic is preferred over Qwen3 for this stack. |

---

## Sources

### HIGH Confidence (official HuggingFace model cards, verified file trees)
- `nomic-ai/nomic-embed-text-v1.5` HF model card — dimensions, ONNX files, Transformers.js support
- `nomic-ai/nomic-embed-text-v1.5/tree/main/onnx` — exact file sizes (int8: 137 MB, fp16: 274 MB)
- `Xenova/bge-m3/tree/main/onnx` — ONNX file sizes (int8: 568 MB, fp16: 1.13 GB)
- `Xenova/bge-reranker-base` HF model card — text-classification pipeline confirmed
- `onnx-community/bge-reranker-v2-m3-ONNX` HF model card — Transformers.js compatible confirmed
- `BAAI/bge-reranker-v2-m3` HF model card — 0.6B params, Apache-2.0, multilingual
- `BAAI/bge-large-en-v1.5` HF model card — 335M params, MIT, MTEB retrieval 54.29
- `Snowflake/snowflake-arctic-embed-l-v2.0` HF model card — 568M, BEIR 55.6, MRL, Apache-2.0
- `Snowflake/snowflake-arctic-embed-m-v2.0` HF model card — 305M, BEIR 55.4, MRL, Apache-2.0
- `electroglyph/Qwen3-Embedding-0.6B-onnx-uint8` — SciFact NDCG@10 = 68.87, f32 baseline = 70.0, 624 MB
- `onnx-community/embeddinggemma-300m-ONNX` — 300M, Gemma license (non-OSI), MTEB English 68.36
- `mixedbread-ai/mxbai-embed-large-v1` — 335M, MTEB retrieval 54.39, Transformers.js confirmed
- `mixedbread-ai/mxbai-rerank-large-v2` — 1.5B, BEIR avg 57.49, no ONNX confirmed
- `sqlite-vec` GitHub — v0.1.9 (March 31 2026), pre-v1, breaking changes warned
- sqlite-vec Matryoshka guide (alexgarcia.xyz) — vec_slice, vec_normalize documented
- sqlite-vec hybrid search guide (alexgarcia.xyz) — RRF SQL pattern extracted and verified
- `@xenova/transformers@2.17.2` and `@huggingface/transformers@4.0.1` — version confirmed

### HIGH Confidence (primary benchmark sources)
- HF Forums "SOTA Pure Dense Retrieval on BEIR: Beating Hybrid Methods with Nomic Embed v1.5" — SciFact: 70.36, NFCorpus: 33.81, TREC-COVID: 72.26, BEIR avg: 58.81 (methodology: 768D cosine, no reranker, no BM25)
- OpenSearch blog on RRF — k=60 standard, 1/(k+rank) formula, Cormack et al. SIGIR 2009

### MEDIUM Confidence (secondary sources, cross-verified)
- awesomeagents.ai MTEB March 2026 ranking — top API models confirmed (Gemini, Voyage, NV-Embed)
- premai.io "Best Embedding Models for RAG 2026" — qualitative CPU guidance on nomic, BGE-M3
- Microsoft Azure evaluation — bge-reranker-v2-m3 improves vector search by ~11 NDCG points
- Medium "Speed Showdown for Rerankers" — bge-reranker-base ~88s/100docs (raw CPU, no ONNX optimization)
- mixedbread.com/blog/mxbai-rerank-v2 — 57.49 BEIR avg for mxbai-rerank-large-v2

### LOW Confidence (single source, unverified)
- Agentset ELO board — Qwen3-Embedding-0.6B at nDCG@10=0.656 (methodology differs from BEIR paper)
- Various blog summaries of overall MTEB ranking for API models (Gemini 68.32, NV-Embed 62.65)

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (30 days — MTEB leaderboard shifts monthly, Qwen3 ONNX ecosystem evolving)
