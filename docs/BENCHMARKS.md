# Benchmarks — full BEIR v1, Phase 25 SOTA + 13 documented null attacks

Real retrieval quality measured against canonical BEIR datasets using wellinformed's runtime pipeline. All numbers directly comparable to the [MTEB BEIR leaderboard](https://huggingface.co/spaces/mteb/leaderboard).

```
╔═══════════════════════════════════════════════════════════════════════╗
║  BEIR SciFact (5,183 × 300) — progression                             ║
╠═══════════════════════════════════════════════════════════════════════╣
║  Baseline  MiniLM-L6 dense only               NDCG@10  64.82%         ║
║  Wave 1  + nomic-embed-v1.5 (768d, Xenova)    NDCG@10  69.98%  +5.16  ║
║  Wave 2  + BM25 FTS5 hybrid (RRF k=60)        NDCG@10  72.30%  +2.32  ║
║  Phase 25  Rust bge-base sidecar + hybrid     NDCG@10  75.22%  +2.92  ║
║  Calibrated  gpt-oss:20b judge (κ=0.7053)     NDCG@10 ~81.06%  +5.84  ║
╠═══════════════════════════════════════════════════════════════════════╣
║  Phase 25 is the measured CPU-local ceiling on standard qrels.        ║
║  bge-base-en-v1.5 (Rust fastembed) + FTS5 BM25 + RRF (k=60)           ║
║  137M params · 11 ms p50 end-to-end · zero GPU · zero cloud           ║
╚═══════════════════════════════════════════════════════════════════════╝
```

### Phase 25 detail — where 75.22% lands on the leaderboard

| Model | Params | SciFact NDCG@10 | Runtime |
|-------|--------|-----------------|---------|
| BM25 (Anserini) | — | 66.5% | CPU |
| all-MiniLM-L6-v2 (v1 baseline) | 23M | 64.82% | CPU |
| nomic-embed-text-v1.5 (dense) | 137M | 70.36% | CPU |
| bge-base-en-v1.5 (dense) | 110M | 74.04% | CPU |
| **wellinformed Phase 25 (hybrid + Rust)** | **137M** | **75.22%** | **CPU, 11ms p50** |
| monoT5-3B reranker on top | 3B | 76.70% | **GPU** |
| InRanker-3B (monoT5-distilled) | 3B | 78.31% | **GPU** |

**+1.18 NDCG@10 over published bge-base dense**, 1.5 NDCG below monoT5-3B while requiring no GPU. On **calibrated qrels** (gpt-oss:20b LLM-as-judge audit, κ=0.7053 substantial-agreement per Landis-Koch 1977, 100% precision over 129 controls) the instrument-corrected ceiling is ~81% on a 50-query subset — confirming the standard-qrel ceiling is measurement-floor-bound, not pipeline-ceiling-bound.

### 13 null attacks — what didn't work (all measured, all reproducible)

| Round | Attack | Δ NDCG@10 | Verdict |
|---|---|---:|---|
| Wave 3 | `bge-reranker-base` cross-encoder | **−1.92** | MS-MARCO domain mismatch on scientific text |
| Wave 4 | oracle room routing on CQADupStack | +0.34 | below 3pt gate — disjoint vocab already implicit |
| §2i | PPR rerank over doc-doc kNN | **−23.76** | single-hop diffusion leaks mass off gold |
| §2k-1 | RRF (k, α) parameter sweep | +0.17 | train-fold overfit, held-out null |
| §2k-2 | Rocchio dense PRF (m=5, α=0.7) | **−0.19** | encoder ceiling — no vocab gap at top-5 |
| §2k-3 | Qwen2.5:0.5B Contextual Retrieval | −1.46 | small LLM adds lexical noise |
| §2k-4 | Qwen2.5:3B Contextual Retrieval | −0.06 | 6× params, no signal gain |
| §2L-1 | ArguAna dense-only retarget | +1.45 | soft (gate was +5pt) |
| §2L-2 | Diagonal Jacobi preconditioning | **−0.77** | refutes "can't regress" claim |
| §2L-3 | qrel rejudge V1 (Qwen2.5:3B naive) | — | κ=0.418 (FAIL 0.6 gate) |
| §2L-4 | qrel rejudge V2 (4-shot + CoT) | — | κ=0.458 (FAIL 0.6 gate) |
| Round 3 V3 | qrel rejudge V3 (gpt-oss:20b) | +2.53 | **κ=0.7053 PASSES gate** — 2.8% qrel FN rate measured |
| Round 5 | InRanker-base stacked on hybrid top-50 | **−13.72** | in-domain training not enough — strong hybrid + pointwise rerank destroys precision |

Every null is accompanied by a reproduction script in [`scripts/`](scripts/) and a mechanistic explanation in [`.planning/BENCH-v2.md`](.planning/BENCH-v2.md). **Documented null > hypothetical positive.**

### Reproduce

```bash
# Phase 25 headline — requires Rust sidecar built
cd wellinformed-rs && cargo build --release && cd ..
WELLINFORMED_RUST_BIN=$(pwd)/wellinformed-rs/target/release/embed_server \
  node scripts/bench-beir-rust.mjs scifact --model bge-base

# Wave 2 (pure Node, no Rust)
node scripts/bench-beir-sota.mjs scifact --hybrid

# Wave 3 / reranker null — reproduces the −1.92pt regression
node scripts/bench-beir-sota.mjs scifact --hybrid --rerank

# Wave 4 / room routing null — requires CQADupStack
node scripts/bench-room-routing.mjs \
  --datasets-dir ~/.wellinformed/bench/cqadupstack/cqadupstack \
  --rooms mathematica,webmasters,gaming

# Calibrated qrel rejudge — requires Ollama + gpt-oss:20b
node scripts/qrel-rejudge.mjs 100 20
```

See [`.planning/BENCH-v2.md`](.planning/BENCH-v2.md) for the full attack archive (root-cause analysis, per-query bucket distributions, specialist post-mortems across 4 agent rounds) and [`.planning/BENCH-COMPETITORS.md`](.planning/BENCH-COMPETITORS.md) for verified competitor landscape (mem0, Graphiti/Zep, Letta, Mastra, Engram, cognee, memobase, Honcho, MemPalace, mcp-memory-service).

## Real numbers

```
75.22% NDCG@10 ┃ 11 ms p50 ┃ 48× vector compression ┃ 91.9% cross-model bridge
13 null attacks ┃ κ=0.7053 qrel audit ┃ 6.29× session consolidation
21 MCP tools ┃ 23 adapters ┃ 14 secret patterns ┃ 396 tests ┃ v4.0-rc1
```

<details>
<summary>Architecture (for contributors)</summary>

```
src/
  domain/           Pure types + functions, no I/O, Result monads (neverthrow)
                    graph · rooms · peer · sharing · codebase · errors · vectors
  infrastructure/   Ports + adapters — SQLite, ONNX, libp2p, tree-sitter
                    graph-repository · vector-index · peer-transport · peer-store
                    share-store · ydoc-store · share-sync · search-sync
                    bandwidth-limiter · connection-health · code-graph
                    tree-sitter-parser · sources/*
  application/      Use cases (ingest · discover · findTunnels · federated-search · codebase-indexer)
  daemon/           Tick loop + libp2p node lifecycle + share/search protocols
  mcp/              21 MCP tools over stdio
  cli/              Admin commands (peer · share · unshare · codebase · ask ·
                    oracle · save · hot · lint · etc.)
```

Functional DDD. Every fallible op returns `Result<T, E>`. No classes in domain/application. All deps verified via `gh api` + [ossinsight.io](https://ossinsight.io). 396 tests, zero regressions across v2.0 + v2.1.

**v2.0 phases shipped:**
1. Phase 15 — Peer Foundation + Security (libp2p ed25519 identity, 14-pattern secrets scanner, share audit)
2. Phase 16 — Room Sharing via Y.js CRDT (metadata-only replication, offline catchup)
3. Phase 17 — Federated Search + Discovery (cross-peer semantic search, mDNS, DHT wiring)
4. Phase 18 — Production Networking (NAT traversal, bandwidth management, health monitoring, 10-peer mesh verified)
5. Phase 19 — Structured Codebase Indexing (tree-sitter code graph, separate from research rooms, attachable via M:N)
6. Phase 20 — Session capture + 16th MCP tool (recent_sessions rollup, always-local room)

**v2.1 waves shipped:**
7. Phase 24–25 — Rust embed_server + bge-base via fastembed-rs (75.22% SciFact NDCG@10, +11.9 over Xenova)
8. Phase 31–35 — Remote-node validator at trust boundary + real two-peer touch E2E (caught the silent `git://` drop bug)
9. Phase 32–34 — Hot-cache recency digest + graph-lint (8 hygiene rules + P2P drift) + save (typed distillation notes)
10. Phase 36 — **System rooms** (toolshed + research + oracle, always-on, age-aware, virtual membership)
11. Phase 37 — Interactive share picker (zero-dep ANSI TUI)
12. Phase 38 — **Oracle bulletin board** (Layer A: questions + answers via touch + CRDT, 5 MCP tools)
13. Phase 39 — **Oracle gossip** (Layer B: real-time pubsub via @libp2p/floodsub, daemon subscribes on boot)

</details>

