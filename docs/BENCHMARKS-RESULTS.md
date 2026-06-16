# Benchmark results — reproducible run capture (2026-06-16)

This file captures **actual stdout** from re-running Folklore's reproducible
benchmarks on a developer laptop (macOS, Apple silicon, Node v26.0.0) on
**2026-06-16**. It is a measurement log, not a claims page — for the canonical
progression, the 13 null attacks, and website-safe claim language see
[`docs/product/BENCHMARKS.md`](product/BENCHMARKS.md) and
[`bench/README.md`](../bench/README.md).

Every runner imports the compiled build, so each run was preceded by:

```bash
npm run build
```

Environment notes for this capture:

- Real graph present at `~/.folklore/graph.json` (**21,134 nodes**, 33,220
  links) and `~/.folklore/vectors.db` (26,396 vector rows).
- Cached embedders on this host: Xenova `all-MiniLM-L6-v2` **and**
  `nomic-ai/nomic-embed-text-v1.5` (768d), plus a cached BEIR SciFact dataset
  and prebuilt hybrid index under `~/.folklore/bench/`.
- **Not** cached / blocked: the `bge-reranker-base` cross-encoder and the Rust
  `bge-base` sidecar. The network allowlist excludes HuggingFace, so any runner
  needing an uncached model download is reported as **BLOCKED** below with the
  exact repro command — no numbers were fabricated for those.

Simulator figures (compounding, value-model, federation web-fallback) are
labelled as **simulator** throughout — they model economics, they are not
retrieval measurements.

---

## 1. Offline SciFact hybrid — `bench-scifact-offline.mjs`

Zero-network proxy over the committed synthetic 40-passage fixture. **Not**
comparable to the 72.30% BEIR leaderboard figure; tracks relative pipeline
change only.

```bash
node bench/bench-scifact-offline.mjs
```

Result (embedder used: `hashed-bow-fallback`, deterministic 384d — no model
download):

| metric | value |
| --- | ---: |
| NDCG@10 | **79.90%** |
| Recall@10 | 94.44% |
| MRR | 0.7533 |

Corpus 40 passages · 18 queries · production hybrid (dense + FTS5 BM25, RRF
k=60). The harness fell back to the deterministic hashed bag-of-words embedder
rather than the cached MiniLM, which it prints in its own output; the number is
a pipeline regression sentinel, not a leaderboard comparison.

## 2. Full BEIR SciFact hybrid (pure Node) — `bench-beir-sota.mjs`

The honest-headline pipeline: nomic-embed-text-v1.5 dense (768d) + BM25 FTS5
hybrid, RRF k=60, over full BEIR SciFact (5,183 docs × 300 test queries). This
host had both the dataset and the nomic model cached, so it ran end-to-end.

```bash
node bench/bench-beir-sota.mjs scifact --hybrid
```

Result (reproduced identically across two consecutive runs):

| metric | value |
| --- | ---: |
| NDCG@10 | **73.34%** |
| MAP@10 | 68.52% |
| Recall@5 | 79.87% |
| Recall@10 | 86.62% |
| MRR | 0.6985 |

Per-stage latency p50/p95 (ms): dense 6/7 · bm25 2/5 · rrf-fuse 0/0 · TOTAL
36/58.

This run lands at **73.34%**, ~1pt above the documented **72.30%** honest
headline. The difference is within run/index-state variance for the same
pipeline and corpus on this machine; the canonical published figure remains
72.30% — this capture corroborates the same pipeline reproduces in that band,
it does not restate the headline.

### 2a. Reranker null variant — `--rerank` — **BLOCKED**

```bash
node bench/bench-beir-sota.mjs scifact --hybrid --rerank
```

**BLOCKED on this host.** The variant needs the `Xenova/bge-reranker-base`
cross-encoder, which is not in the local model cache, and the network allowlist
excludes HuggingFace, so the model fetch hangs and the run never completes. The
documented result for this variant stands as previously measured:
**−1.92 NDCG@10** (MS-MARCO-trained cross-encoder vs scientific text domain
mismatch). Re-running it requires a HuggingFace download of the reranker model.

## 3. Dense-only BEIR baseline — `bench-beir.mjs` — **NOT COMPLETED**

```bash
node bench/bench-beir.mjs scifact
```

**NOT COMPLETED in this capture.** This runner re-embeds the SciFact corpus for
a dense-only configuration and did not finish within the time budget on this
host (it does not reuse the cached hybrid index that runner #2 uses). It is not
strictly blocked — no HF download is required when MiniLM is cached — but it was
not allowed to run to completion here. Re-run unattended to capture the
dense-only baseline.

## 4. Phase 25 Rust headline (bge-base sidecar) — `bench-beir-rust.mjs` — **BLOCKED**

```bash
cd folklore-rs && cargo build --release && cd ..
FOLKLORE_RUST_BIN=$(pwd)/folklore-rs/target/release/embed_server \
  node bench/bench-beir-rust.mjs scifact --model bge-base
```

**BLOCKED on this host.** The Rust `embed_server` sidecar binary was not built
and the `bge-base` fastembed model is not cached, so the 75.22% Phase-25 tier
cannot be reproduced here without (a) building the Rust crate and (b) a model
download. The documented figure remains **75.22% NDCG@10** (same corpus, same
hybrid RRF fusion, heavier embedder + native acceleration).

## 5. Deny-gate threshold × min-hits sweep — `bench-deny-sweep.mjs`

Real `folklore seed` + real `folklore ask --json` path, cached embedder. 12
in-corpus + 8 out-of-corpus questions, k=3, distance pre-filter d≤1.05. Replays
the grid {0.70, 0.75, 0.80, 0.85} × {1, 2, 3} against two gate variants.

```bash
node bench/bench-deny-sweep.mjs
```

Mean in-corpus satisfaction **0.68** (domain `use_memory` breakpoint is a fixed
0.85).

**Variant A — shipped gate (requires `action === use_memory`):** 0% true-deny in
every cell except 8% at min_hits=1 (1/12), 0% false-deny everywhere. The shipped
gate stays effectively inert because the fixed 0.85 `use_memory` breakpoint sits
upstream of the threshold knob.

**Variant B — score-only gate (proposed; drops the action precondition, keeps
the distance filter):**

| thresh | min_hits | true-deny (in-corpus) | false-deny (out-of-corpus) |
| ---: | ---: | ---: | ---: |
| 0.70 | 1 | 5/12 = **42%** | 0/8 = 0% |
| 0.75 | 1 | 3/12 = 25% | 0/8 = 0% |
| 0.80 | 1 | 2/12 = 17% | 0/8 = 0% |
| 0.85 | 1 | 1/12 = 8% | 0/8 = 0% |
| any | 2 or 3 | 0/12 = 0% | 0/8 = 0% |

Recommendation emitted by the runner: score-only gate at **0.70 × 1 → 42%
true-deny, 0% false-deny**. Recommend-only — it does not edit `src/` or
`.claude/`. Caveat (from the runner): 12+8 questions is a *direction*, ~8 points
per flipped question.

## 6. Deny-gate adversarial validation — `bench-deny-validate.mjs`

Seeds a 59-node synthetic validation graph via the real `folklore seed --file`
path (product seed corpus untouched), then runs **44 in-corpus + 40 adversarial**
questions (30 near-miss / 10 far-miss) on the real `folklore ask --json` path,
score-only gate at 0.75 × 1, distance cap d≤1.05.

```bash
node bench/bench-deny-validate.mjs --json
```

Result (writes `eval/out/deny-validate-summary.json`):

| metric | count | rate |
| --- | --- | ---: |
| true-deny (in-corpus) | 37/44 | **84%** |
| false-deny (all adversarial) | 1/40 | **3%** |
| false-deny (near-miss) | 1/30 | 3% |
| false-deny (far-miss) | 0/10 | 0% |

Nearest-hit distance vs the 1.05 cap:

| bank | min | median | max | inside cap |
| --- | ---: | ---: | ---: | ---: |
| in-corpus | 0.49 | 0.76 | 1.01 | — |
| near-miss | 0.77 | 0.99 | 1.17 | 23/30 |
| far-miss | 1.22 | 1.29 | 1.39 | 0/10 |

Satisfaction bands: in-corpus **0.810** · near-miss **0.583** · far-miss
**0.351**.

> **Note — this supersedes the older table in `bench/README.md`.** That doc
> recorded **100% true-deny / 57% false-deny** with a `SHIP-WITH-GUARD` verdict
> and near-coincident satisfaction bands (0.77/0.75/0.75 — score does not
> discriminate). This run was taken *after* commit `0c21e44`
> ("relevance-aware satisfaction (trust × relevance gate)"), which makes
> satisfaction reflect best-hit distance. The bands now separate cleanly
> (0.81/0.58/0.35) and the runner's verdict flips to **SHIP**: overall
> false-deny 3% (≤5%) and near-miss false-deny 3% (≤10%). The one near-miss
> leak was "how does three-phase commit avoid the blocking problem two-phase
> commit has?" The `bench/README.md` prose reflects the pre-`0c21e44` gate and
> is now stale relative to this measurement. Caveat (from the runner): synthetic
> corpus, hand-authored adversarial banks engineered to stress the cap — a
> deliberate worst-case probe, single-graph measurement.

## 7. Cold-start web-deflection before/after seed — `bench-coldstart-seed.mjs`

Real `ask` path, 12 natural questions, k=3, deny gate 0.85 / 2 hits. Empty graph
vs after `folklore seed` (12 nodes).

```bash
node bench/bench-coldstart-seed.mjs
```

| state | deny-gate deflection | soft/memory deflection | mean hits | mean sat |
| --- | ---: | ---: | ---: | ---: |
| before (empty graph) | 0.0% | 0.0% | 0.00 | 0.00 |
| after (seeded 12 nodes) | 8.3% | 75.0% | 3.00 | 0.68 |

Web-deflection lift: deny-gate **0.0% → 8.3%** (+8.3%); soft/memory
**0.0% → 75.0%** (+75.0%).

## 8. Local index health — `bench-index-health.mjs`

Diagnostic over the real `~/.folklore` graph + vector store.

```bash
node bench/bench-index-health.mjs
```

| metric | value |
| --- | ---: |
| graph nodes | 21,134 |
| vector rows | 26,396 |
| raw-text rows | 25,006 |
| raw-text coverage | 94.7% |
| graph→vector coverage | 90.7% |
| stored-vector self recall R@1 / R@5 / R@10 | 90.3% / 98.7% / 98.8% |

(Title metadata present on 2.4% of raw-text rows, source_uri on 0.1% — a known
metadata-sparsity observation, not a retrieval metric.)

## 9. Subgraph-transfer payload (real graph) — `bench-subgraph-transfer.mjs`

Bounded subgraph payload per hit, sampled over the live 21,134-node graph
(sample=2000).

```bash
node bench/bench-subgraph-transfer.mjs
```

| metric | avg | p50 | p90 |
| --- | ---: | ---: | ---: |
| transplant nodes | 3.7 | 3 | 3 |
| transplant edges | 2.7 | 2 | 2 |
| payload bytes | 3.6 KiB | 1.3 KiB | 9.1 KiB |

Token model: **62.2% saved** over 3.7 related queries (**2.6× fewer** model
input tokens). Real-graph measurement.

## 10. Compounding stream — `bench-compounding.mjs` (SIMULATOR)

64-peer, 200,000-query compounding stream. **This is a simulator** — Zipfian
demand model with a Che-approximation cache ceiling, not a retrieval
measurement.

```bash
node bench/bench-compounding.mjs
```

Parameters: N=5,000 topics, cap C_p=200, α=0.9, offset=20, 200,000 queries,
seed=1. Single-peer Che ceiling 18.3%; isolated-sim vs closed-form agree within
0.16pp.

| peers | isolated hit | cooperative hit | web-fallback | trips-avoided/1k |
| ---: | ---: | ---: | ---: | ---: |
| 1 | 18.5% | 18.5% | 81.5% | 0 |
| 8 | 18.2% | 54.6% | 45.4% | 363 |
| 32 | 18.2% | 80.0% | 20.0% | 617 |
| 64 | 18.4% | 90.2% | 9.8% | 718 |

Cumulative timeline (one network, P=64, 200,000 queries): no-cache 200,000 web
trips → isolated 164,550 (82%) → cooperative **21,902 (11%)** = **9.1× cheaper**.
Subgraph-transfer economics in the same run: cooperative 365.9M model-input
tokens vs 1.6B no-cache = **77.1% saved**.

> **Simulator, not field data.** These are modeled economics. The
> federation web-fallback **17% → 1%** decay curve cited elsewhere is likewise
> a FolkloreBench-F **simulator** output ("a demonstration, not validated
> evidence" per whitepaper §7.2), never a measured production result.

## 11. Value-model scorecard — `bench-value-model.mjs` (MODEL)

Consolidated economics scorecard combining the simulator and real-graph
measurements above.

```bash
node bench/bench-value-model.mjs
```

- Cooperative graph transfer: **9.13× fewer** paid web trips over 200k queries;
  end marginal web cost falls to **8.5%** (simulator).
- Model-token saving: **77.1%** fewer input tokens in the demand simulation;
  **62.2%** saved on the measured local-graph neighborhood model.
- A remote hit imports **3.7 nodes / 2.7 edges** on average; p50 payload 1.3
  KiB, p90 9.1 KiB (real graph).
- Haiku poison flip-ASR cut **58.9% → 2.4%** (24.8×) with provenance ranking;
  attack-effect **83.8% → 9.8%** (8.58×).
- Current natural-question graph hit rate **22.9%**, web deflection **0.0%** —
  explicitly **not** a positive website claim yet (negative result, gap not
  claim).

---

## Summary

| # | Bench | Status | Headline number this run |
| ---: | --- | --- | --- |
| 1 | `bench-scifact-offline.mjs` | ran | NDCG@10 79.90% (synthetic proxy) |
| 2 | `bench-beir-sota.mjs` (hybrid) | ran | NDCG@10 **73.34%** (vs doc 72.30%) |
| 2a | `bench-beir-sota.mjs --rerank` | **BLOCKED** | needs `bge-reranker-base` (HF) |
| 3 | `bench-beir.mjs` (dense) | not completed | did not finish in time budget |
| 4 | `bench-beir-rust.mjs` | **BLOCKED** | needs Rust sidecar + bge-base (HF) |
| 5 | `bench-deny-sweep.mjs` | ran | score-only 0.70×1 → 42% true / 0% false |
| 6 | `bench-deny-validate.mjs` | ran | 84% true-deny / 3% false-deny (SHIP) |
| 7 | `bench-coldstart-seed.mjs` | ran | soft-deflect 0% → 75% after seed |
| 8 | `bench-index-health.mjs` | ran | self-recall R@10 98.8% over 21,134 nodes |
| 9 | `bench-subgraph-transfer.mjs` | ran | 3.7 nodes / 2.7 edges, 62.2% token saving |
| 10 | `bench-compounding.mjs` | ran (simulator) | 9.1× cheaper, 77.1% tokens saved |
| 11 | `bench-value-model.mjs` | ran (model) | consolidated scorecard |

Three runners were blocked or incomplete on this sandbox: the reranker-null
variant and the Phase-25 Rust tier both require a HuggingFace model pull that
the network allowlist blocks, and the dense-only BEIR baseline did not finish in
the time budget. Their documented figures (−1.92pt reranker null, 75.22% Rust
tier) stand as previously measured and were **not** re-fabricated here.
