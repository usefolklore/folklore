# bench/ — Folklore standalone benchmark runners

This directory holds Folklore's **standalone** benchmark and experiment
runners. They are not part of the test suite — they are reproduction
scripts you invoke by hand to re-measure a published number, sweep a
parameter, or re-judge a qrel set.

Every `.mjs` runner here imports the **compiled** build from `../dist/`,
so you must build first:

```bash
npm run build
```

The in-suite benchmark **tests** (the ones `npm test` runs as part of the
942-test gate) live in `tests/bench-*.test.ts`, not here. Those import
`../src/...` directly and are exercised by CI. If you want the
regression-gated memory composite, run `folklore bench memory --json`
instead — see `docs/product/BENCHMARKS.md`.

Relative-import note: `scripts/` and `bench/` are both direct children of
the repo root, so the runners' `../dist/infrastructure/embedders.js`
imports resolve identically from either location. The move from
`scripts/` to `bench/` did not change any import depth.

## Quick start

```bash
npm run build
node bench/bench-beir.mjs scifact
```

`bench-beir.mjs scifact` downloads the canonical small BEIR dataset
(5,183 docs × 300 queries) on first run and reports NDCG@10 / MAP@10 /
R@{5,10} / MRR — directly comparable to the MTEB BEIR leaderboard.

## Honest headline number

The current measured retrieval ceiling on full BEIR SciFact is
**72.30% NDCG@10** (Wave 2: nomic-embed-text-v1.5 dense + BM25 FTS5
hybrid, RRF k=60). The Phase 25 Rust bge-base sidecar path pushes this to
75.22% NDCG@10. The retired 96.8% figure came from a 15-passage × 10-query
mini-harness and is not used. See `docs/product/BENCHMARKS.md` for the
full progression and the 13 documented null attacks.

## Offline / in-sandbox harness

Every runner above needs a BEIR `.zip` download **and** a live HuggingFace
model pull. In a sealed sandbox both are blocked. `bench-scifact-offline.mjs`
is the **zero-network** alternative: it runs the production hybrid pipeline
(`openSqliteVectorIndex` → `searchHybrid`, dense + FTS5 BM25 RRF) over a small
committed **synthetic** SciFact-style fixture (`eval/fixtures/scifact-mini`,
40 passages × 18 claim queries). It uses a locally-cached Xenova model if one
is present, otherwise a deterministic in-repo hashed bag-of-words embedder so
the harness proves end-to-end with no download (the embedder used is printed in
the output). The numbers are **not** comparable to the 72.30% BEIR figure —
they track relative change of the pipeline on a fixed mini-task, giving future
model swaps and fusion changes a measurable lever. See the fixture's
`eval/fixtures/scifact-mini/README.md` for provenance.

## Retrieval quality benchmarks

| Runner | Measures | Reproduce |
|---|---|---|
| `bench-scifact-offline.mjs` | Offline hybrid NDCG@10 / Recall@10 — zero network, bundled `eval/fixtures/scifact-mini` fixture, deterministic fallback embedder | `node bench/bench-scifact-offline.mjs` |
| `bench-beir.mjs` | BEIR NDCG@10 (dense, any BEIR v1 dataset) | `node bench/bench-beir.mjs scifact` |
| `bench-beir-sota.mjs` | Wave 2 hybrid (dense + BM25 RRF) | `node bench/bench-beir-sota.mjs scifact --hybrid` |
| `bench-beir-sota.mjs` (rerank null) | Reranker −1.92pt regression | `node bench/bench-beir-sota.mjs scifact --hybrid --rerank` |
| `bench-beir-rust.mjs` | Phase 25 headline (bge-base via Rust sidecar) | `node bench/bench-beir-rust.mjs scifact --model bge-base` |
| `bench-arguana-dense.mjs` | ArguAna dense-only retarget gate | `node bench/bench-arguana-dense.mjs` |
| `bench-matryoshka.mjs` | Matryoshka truncation × quantization gate | `node bench/bench-matryoshka.mjs` |
| `bench-room-routing.mjs` | Wave 4 room-routing null (needs CQADupStack) | `node bench/bench-room-routing.mjs --datasets-dir ~/.folklore/bench/cqadupstack/cqadupstack --rooms mathematica,webmasters,gaming` |
| `bench-ppr.mjs` | PPR rerank over doc-doc kNN (null) | `node bench/bench-ppr.mjs` |
| `bench-ppr-multihop.mjs` | HippoRAG-2 multi-hop PPR skeleton | `node bench/bench-ppr-multihop.mjs` |
| `bench-bridge.mjs` | Cross-model embedding bridge gate | `node bench/bench-bridge.mjs` |
| `bench-lab.mjs` | Matryoshka × quant × hybrid sweep lab | `node bench/bench-lab.mjs` |
| `bench-compare.mjs` | Diff two cached results.json runs | `node bench/bench-compare.mjs <a.json> <b.json>` |

## Parameter sweeps & qrel audits

| Runner | Measures | Reproduce |
|---|---|---|
| `sweep-rrf.mjs` | RRF (k, α) parameter sweep | `node bench/sweep-rrf.mjs` |
| `sweep-rocchio.mjs` | Rocchio dense PRF sweep | `node bench/sweep-rocchio.mjs` |
| `qrel-rejudge.mjs` | SciFact qrel completeness audit (Round 2) | `node bench/qrel-rejudge.mjs 100 20` |
| `qrel-rejudge-v2.mjs` | Few-shot + CoT rejudge (κ=0.458) | `node bench/qrel-rejudge-v2.mjs` |
| `qrel-rejudge-v3.mjs` | gpt-oss:20b rejudge (κ=0.7053 PASS) | `node bench/qrel-rejudge-v3.mjs` |
| `contextualize-corpus.mjs` | Anthropic Contextual Retrieval preprocessing | `node bench/contextualize-corpus.mjs` |
| `jacobi-preconditioning.mjs` | Diagonal Jacobi preconditioning (CFD null) | `node bench/jacobi-preconditioning.mjs` |
| `debug-reranker.mjs` | Reranker tier debug harness | `node bench/debug-reranker.mjs` |

## Throughput & system benchmarks

| Runner | Measures | Reproduce |
|---|---|---|
| `bench-embed-throughput.mjs` | Embedding docs/sec (bge-base via Rust) | `node bench/bench-embed-throughput.mjs --model bge-base --n 32` |
| `bench-consolidation.mjs` | Session consolidation storage + quality gate | `node bench/bench-consolidation.mjs <room>` |
| `bench-warm.mjs` | Warm-cache latency | `node bench/bench-warm.mjs` |
| `bench-e2e.mjs` | Product-shaped end-to-end benchmark | `node bench/bench-e2e.mjs` |

## Value-model benchmarks (compounding graph transfer)

These measure Folklore's economic claim — bounded graph transplant, not
summaries — across a federated stream.

| Runner | Measures | Reproduce |
|---|---|---|
| `bench-compounding.mjs` | 64-peer compounding stream (paid web trips) | `node bench/bench-compounding.mjs` |
| `bench-subgraph-transfer.mjs` | Bounded subgraph payload per hit | `node bench/bench-subgraph-transfer.mjs` |
| `bench-value-model.mjs` | Demand economics with subgraph transfer | `node bench/bench-value-model.mjs` |
| `bench-user-value.mjs` | Per-user value model | `node bench/bench-user-value.mjs` |
| `bench-coldstart-seed.mjs` | Cold-start web-deflection before/after `folklore seed` (real `ask` path, empty vs seeded graph) | `node bench/bench-coldstart-seed.mjs` |
| `bench-index-health.mjs` | Local index health diagnostic | `node bench/bench-index-health.mjs` |

## Full v2 system report

`bench-v2.sh` runs the comprehensive v2.0 CLI benchmark and writes a
report to `.planning/BENCH-v2.md`. It invokes `npm test` as part of the
run.

```bash
bash bench/bench-v2.sh
```

See `docs/product/BENCHMARKS.md` and `.planning/BENCH-v2.md` for the full
attack archive, root-cause analysis, and competitor landscape.
