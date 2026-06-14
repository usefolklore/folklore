# Retrieval module map — embedders + hybrid retrieval pipeline

**Status:** living document
**Scope:** the ML / embedding / retrieval code (CLEAN-04)
**Audience:** anyone arriving at the repo who needs to find *where the retrieval
brains live* and *how a query becomes a ranked result*.

This is the single authoritative map of Folklore's embedding and retrieval
modules. It documents the existing module boundary and the pipeline flow — it
does not move code. Every `src/...ts` path below is a real file on disk.

---

## 1. Where retrieval sits in the layering

Folklore follows functional DDD with a strict dependency direction:

```
src/domain          pure types + helpers (neverthrow Results, no classes)
   ↓                vectors, RRF fusion, rerank tiering, pagerank/PPR, eval metrics
src/application     use-cases (federated-ask, federated-search, ingest)
   ↓
src/infrastructure  IO / adapters — embedders, sqlite-vec, rust bridge, libp2p
   ↓
src/cli · src/daemon · src/mcp   entry points
```

The retrieval pipeline is split across exactly two of these layers:

- **`src/domain/`** owns the *pure* retrieval math: how to fuse two ranked
  lists (RRF), how to choose a rerank tier, how to re-rank by graph proximity
  (Personalized PageRank), and how to score a run (NDCG/MAP). No IO, no model
  loads — same input always yields the same output.
- **`src/infrastructure/`** owns the *effectful* adapters: turning text into
  vectors (ONNX), storing and querying those vectors (sqlite-vec), running the
  cross-encoder and LLM rerankers, and the native Rust acceleration bridge.

The application layer (`src/application/federated-ask.ts`,
`federated-search.ts`) wires the two together. The domain defines the *ports*
(e.g. `Embedder`, `VectorIndex`, `CrossEncoderScorer`, `ListwiseScorer`) and the
infrastructure modules are the *adapters* that implement them.

---

## 2. Embedding layer

Text becomes a unit vector here.

- **`src/infrastructure/embedders.ts`** — the `Embedder` port plus adapters.
  `xenovaEmbedder` is the lazy ONNX path (via `@xenova/transformers`);
  `fixtureEmbedder` gives deterministic seeded vectors for tests without
  pulling model weights. Pooling strategy (`mean`/`cls`/`last`) must match the
  model's training pooling or quality silently degrades ~10-15%. The default
  output is 384-dim ONNX (`all-MiniLM-L6-v2`, `DEFAULT_DIM` in
  `src/domain/vectors.ts`); the Wave-2 quality option is
  `nomic-embed-text-v1.5` (768-dim, 8192-token context).
- **`src/domain/vectors.ts`** — the pure vector helpers: the `Vector` type,
  `DEFAULT_DIM`, `normalize`, `rrfFuse`, `sanitizeForFts5`, and the
  `HybridConfig` defaults. This is where the *fusion* of dense + lexical lives
  (see §3).
- **`src/infrastructure/vector-index.ts`** — the `VectorIndex` port and the
  `sqliteVectorIndex` adapter, backed by better-sqlite3 + sqlite-vec 0.1.x +
  SQLite FTS5. It is the dense ANN store *and* the BM25 lexical store: BM25 uses
  SQLite's `bm25(fts_docs, 0.9, 0.4)` auxiliary function with the BEIR-tuned
  Anserini/Pyserini defaults. Single responsibility — it produces the two
  ranked lists and delegates merging to the pure `rrfFuse` in `vectors.ts`.

---

## 3. Hybrid retrieval pipeline

A query flows through this pipeline. Every stage after dense+lexical is
optional and gated by configuration or hardware:

```
        query text
            │
   ┌────────┴────────┐
   ▼                 ▼
dense (ANN)      lexical (BM25)          ← vector-index.ts (sqlite-vec + FTS5)
   │                 │
   └───────┬─────────┘
           ▼
    RRF fusion                            ← rrfFuse  (src/domain/vectors.ts)
           │
           ▼
   optional rerank                        ← cross-encoder.ts  /  llm-listwise-rerank.ts
           │                                 (tier chosen by rerank-tier.ts + hw-detect.ts)
           ▼
   optional graph re-rank (PPR)           ← graph-rerank.ts → pagerank.ts
           │
           ▼
     ranked result
```

- **Dense + lexical** are both produced by `vector-index.ts` — dense ANN over
  the embedding, BM25 over the raw text query.
- **RRF fusion** (`rrfFuse`, Cormack-Clarke-Büttcher SIGIR 2009) in
  `src/domain/vectors.ts` merges the two ranked lists into one. This is the core
  hybrid step.
- **Reranking** is optional and tiered (see §4). `cross-encoder.ts` is the
  CPU-friendly default reranker (Xenova `ms-marco-MiniLM-L-6-v2`, fail-open);
  `llm-listwise-rerank.ts` is the higher-quality LLM listwise path (Ollama,
  default `qwen2.5:1.5b`).
- **Graph re-rank** is optional Personalized PageRank: `pprRerank` in
  `src/domain/graph-rerank.ts`, built on `pagerank` in `src/domain/pagerank.ts`.
  It nudges results by graph proximity in the knowledge graph.
- **Local assembly** of dense + lexical for a single node happens in
  `src/infrastructure/search-sync.ts`; the federated/gossip fan-out across peers
  is `src/infrastructure/search-gossip.ts` (libp2p pubsub, V5 wire protocol).
- **Accelerated path:** `src/infrastructure/rust-retrieval.ts` is a thin stdio
  JSON-RPC bridge to the `folklore-rs/` crate's `embed_server` binary for the
  heavier non-embedder ops (tunnel detection, centroid routing). It mirrors the
  embedder's single-flight subprocess shape and is stateless on the Rust side.

---

## 4. Rerank tiering

Folklore runs the best rerank quality each host's hardware can actually
deliver, rather than the lowest-common-denominator CPU path.

- **`src/infrastructure/hw-detect.ts`** probes the host cheaply (no model loads):
  platform/arch, Apple Silicon (`darwin + arm64`), CUDA via `nvidia-smi`, Ollama
  via an HTTP probe, and RAM. Every probe is fail-closed — a misconfigured
  `FOLKLORE_OLLAMA_URL` downgrades the tier instead of crashing.
- **`src/domain/rerank-tier.ts`** is the pure picker: `pickRerankTier` maps the
  detected `HwCapabilities` to a tier `gpu > accelerated > cpu > minimal` and a
  `RerankPlan`. With a GPU/Ollama present it can pick the LLM-listwise reranker;
  without one it downgrades to the cross-encoder, and at `minimal` it skips
  reranking entirely (fusion output passes through unchanged).

So the same query produces a different-but-correct pipeline depending on the
machine: the *retrieval contract* is stable, the *rerank tier* adapts.

---

## 5. Measured behavior (do not regress)

These are the measured ceilings and the known regressions. They are recorded
here so future contributors do not re-add the parts that hurt quality.

- **Hybrid ceiling (keep):** Wave-2 hybrid = `nomic-embed-text-v1.5` dense +
  BM25 lexical fused via RRF = **72.30% NDCG@10 on BEIR SciFact** (34.11% on
  NFCorpus) — within ~2 points of `bge-base-en-v1.5` at our 137M param budget.
- **Reranker on scientific text (avoid):** Wave-3 `bge-reranker-base`
  *regressed* quality on scientific text (−1.92 NDCG@10) due to MS-MARCO domain
  mismatch. Do not enable it as a default for scientific corpora.
- **Room-aware routing gate (null):** Wave-4 oracle routing on CQADupStack gave
  only +0.34 NDCG@10 — rooms/workspaces are a UX / permissions / discovery
  signal, **not** a retrieval signal. Do not add routing gates to the pipeline.

---

## 6. Module table

Only modules confirmed present on disk are listed.

| File | Layer | Role |
|------|-------|------|
| `src/domain/vectors.ts` | domain | `Vector` type, `DEFAULT_DIM`, `normalize`, `rrfFuse` (RRF hybrid fusion), `HybridConfig` |
| `src/domain/rerank-tier.ts` | domain | `pickRerankTier` — gpu>accelerated>cpu>minimal tier + `RerankPlan` |
| `src/domain/cross-rerank.ts` | domain | `CrossEncoderScorer` port + pure `rerankMatches` distance rewrite |
| `src/domain/llm-listwise-rerank.ts` | domain | `ListwiseScorer` port + listwise prompt/parse helpers |
| `src/domain/graph-rerank.ts` | domain | `pprRerank` — Personalized PageRank graph re-rank |
| `src/domain/pagerank.ts` | domain | `pagerank`, `buildKnnGraph` — PageRank core |
| `src/domain/recency-rerank.ts` | domain | recency-weighted re-rank helper |
| `src/domain/eval-metrics.ts` | domain | NDCG / MAP / recall metrics for benchmark runs |
| `src/infrastructure/embedders.ts` | infrastructure | `Embedder` port; `xenovaEmbedder` (ONNX) + `fixtureEmbedder` |
| `src/infrastructure/vector-index.ts` | infrastructure | `VectorIndex` port; `sqliteVectorIndex` (sqlite-vec ANN + FTS5 BM25) |
| `src/infrastructure/cross-encoder.ts` | infrastructure | Xenova `ms-marco-MiniLM-L-6-v2` cross-encoder reranker (fail-open) |
| `src/infrastructure/llm-listwise-rerank.ts` | infrastructure | Ollama LLM listwise reranker adapter |
| `src/infrastructure/hw-detect.ts` | infrastructure | host capability probe driving the rerank-tier picker |
| `src/infrastructure/rust-retrieval.ts` | infrastructure | stdio JSON-RPC bridge to the `folklore-rs` accelerated backend |
| `src/infrastructure/search-sync.ts` | infrastructure | local hybrid search assembly + request/response federated search (libp2p) |
| `src/infrastructure/search-gossip.ts` | infrastructure | federated/gossip search over libp2p pubsub (V5 wire protocol) |

Native backend: **`folklore-rs/`** (Cargo crate + `src/`) — the accelerated
retrieval backend that `rust-retrieval.ts` talks to over stdio.

---

## See also

- `src/infrastructure/README.md` — in-tree index of the infrastructure layer.
- `docs/architecture/ADR-001-v3-memory-protocol.md` — the v3 memory protocol ADR.
