# Benchmark results — reproducible run capture

This file captures **actual stdout** from re-running Folklore's reproducible
benchmarks in a sealed local sandbox (macOS, Apple silicon, Node v26.0.0, run
2026-06-16 → 2026-06-17). It is a measurement log, not a claims page — for the
canonical progression, the documented null attacks, and website-safe claim
language see [`docs/product/BENCHMARKS.md`](product/BENCHMARKS.md) and
[`bench/README.md`](../bench/README.md). Numbers below are quoted from **this
run**; blocked runners record the exact blocker and the command to run once
unblocked. No numbers were fabricated for blocked runners.

Every runner imports the compiled build, so the capture was preceded by
`npm run build` (tsc → `dist/` present). `npx tsc --noEmit` → **0 errors**.

## Run environment

- Real graph at `~/.folklore`: **21,133 graph nodes**, 33,220 links;
  `vectors.db` **26,395 vector rows**, 25,005 raw-text rows; plus `code-graph.db`
  (17,518 code nodes / 44,177 edges, 6 codebases).
- A rich `~/.folklore/bench/` cache of **prior** BEIR runs (scifact, arguana,
  fiqa, nfcorpus, scidocs, cqadupstack rooms) holding **pre-computed query and
  corpus vectors** (nomic-768 and bge).
- Cached embedder **models** on this host: `Xenova/all-MiniLM-L6-v2` (384d), an
  `InRanker-base` cross-encoder, and (confirmed reachable on retry) the
  `Xenova/bge-reranker-base` cross-encoder. **Not** available: the
  `nomic-embed-text-v1.5` model and the Rust `embed_server` (bge-base) sidecar
  binary. Network excludes HuggingFace, so anything not already cached blocks.

### The decisive split in this sandbox is the embedder backend

- Runners reading **pre-cached query/corpus vectors** out of `~/.folklore/bench`
  (matryoshka, bridge, ppr, the `--hybrid` BEIR SOTA path) reproduce fully — the
  cached vectors satisfy them with no model download.
- Runners that **boot the Rust `embed_server`** at runtime crash with an
  *unsettled top-level await* the instant they call `embedder.embed(...)` —
  the sidecar is absent. Reported **BLOCKED: Rust embed_server**.
- Runners that **embed on the fly with cached MiniLM** (room-routing, the
  scifact-offline fallback, `bench-beir.mjs`, and the real `ask` path behind the
  deny / coldstart / user-value benches) reproduce, but their absolute numbers
  reflect MiniLM (or a deterministic fallback), not nomic/bge.

**Tally: 21 benchmarks reproduced (2 of them only partially — slow passes that
loaded and ran but were not given time to finish), 8 blocked** — all 8 on the
missing Rust `embed_server` sidecar. Two utility/aggregate runners are not counted:
`bench-compare.mjs` (diff tool) and `bench-v2.sh` (invokes the full `npm test`).

---

## Economic / thesis benchmarks

Pure simulations or runs against the local 21,133-node graph; none need network.

| Runner | Headline number(s) — THIS run | Status | Repro |
|---|---|---|---|
| `bench-compounding.mjs` (SIMULATOR) | N=5,000 topics, C_p=200, α=0.9, seed=1, 200k queries. At **P=64**: cooperative hit **90.2%** vs isolated **18.4%**, web-fallback 81.5%→9.8%, **4.9×** fewer web trips. Cumulative: 200,000 no-cache → 164,550 isolated → **21,902 cooperative** = **9.1× cheaper**; end marginal web cost **8.5%**. Single-peer Che ceiling 18.3%; sim vs closed-form agree within **0.16pp**. | reproduced | `node bench/bench-compounding.mjs` |
| `bench-value-model.mjs` (MODEL) | **9.13×** fewer paid web trips / 200k queries; **77.1%** fewer model-input tokens (demand sim), **63.3%** on the measured local-graph neighborhood. Remote hit imports avg **3.9 nodes / 2.9 edges**, p50 1.3 KiB / p90 9.3 KiB. Haiku poison flip-ASR **58.9%→2.4%** (24.8×) with provenance ranking. Runner prints the honest negative: live `ask` path is **5.0% hit / 0.0% web-deflection** — not a positive product claim. | reproduced | `node bench/bench-value-model.mjs` |
| `bench-compounding-graded.mjs` (GRADED SIM — supersedes the boolean) | Topics as vectors, noised-paraphrase queries, resolution through the **real energy gate** (τ + Hopfield separation guard, calibrated to geometry); ground-truth false-admit tracked. DIM=384, 16 peers, 20% churn: cooperative correct-resolve **62.2%** vs isolated **36.3%**, **1.68×** fewer web trips, **+8.07 M tokens** LLM-inference reused, **0% false-admit**. Needs the separation guard (else ~88% false-admit) + CRDT replication (else churn kills it). Compounding is **real but bounded by retrieval precision**, not the boolean's unbounded decay. | reproduced | `node bench/bench-compounding-graded.mjs` |
| `bench-paraphrase-sigma.mjs` (REAL EMBEDDINGS) | Cached MiniLM, 36 real query↔source pairs: true-match cos median **0.841** (p10 0.54) vs spurious **0.097**, separation **AUC 0.999**, equivalent sim **σ≈0.033** — deep inside the graded-sim compounding regime (σ≲0.15). Grounds the graded sim in reality: real paraphrases stay ~0.84 cosine to their source node, so peers genuinely reuse each other's answers. | reproduced | `node bench/bench-paraphrase-sigma.mjs` |
| `bench-user-value.mjs` | Real graph (21,133 nodes, 914 candidates, 96 queries): **22.9% grounded success, 0.0% web deflection** overall; p50 ~1.07–1.13s. Best content_excerpt/content_question 41.7%; source_url 0.0%. Honest low number on the live natural-question path. | reproduced | `node bench/bench-user-value.mjs` |
| `bench-subgraph-transfer.mjs` | Real graph (21,133 nodes, 33,220 links, 2,000 samples): transplant **avg 3.9 nodes / 2.9 edges**; payload avg 3.8 KiB, p50 1.3 KiB, p90 9.1 KiB; **63.1%** token saving over 3.9 related queries (**2.7×** fewer model-input tokens). | reproduced | `node bench/bench-subgraph-transfer.mjs` |
| `bench-coldstart-seed.mjs` | Empty vs seeded (12 nodes), real `ask` path, deny ≥0.85/2: deny-gate deflection **0.0% → 8.3%**; soft/memory deflection **0.0% → 75.0%**; mean-hits 0→3.00, mean-sat 0→0.68. | reproduced | `node bench/bench-coldstart-seed.mjs` |

> **Simulator, not field data.** Compounding/value-model economics are modeled
> (Zipfian demand × Che-approximation cache ceiling), not retrieval
> measurements; the runner labels them so.

## Deny-gate / protocol benchmarks

Real `folklore seed` + `folklore ask --json` path, cached MiniLM embedder.

| Runner | Headline number(s) — THIS run | Status | Repro |
|---|---|---|---|
| `bench-deny-sweep.mjs` | Mean in-corpus satisfaction **0.68**. **Variant A (shipped gate)**: ≤8% true-deny in every cell, 0% false-deny — inert, because `use_memory` is governed by a fixed 0.85 breakpoint upstream of the threshold knob. **Variant B (score-only)** best cell **0.70 × 1 → 42% true-deny, 0% false-deny** on 12 in-corpus + 8 out-of-corpus; the `d≤1.05` distance pre-filter (not the score) holds false-deny at 0. min_hits 2/3 collapse true-deny to 0%. Recommend-only — no `src/`/`.claude/` edits. | reproduced | `node bench/bench-deny-sweep.mjs` |
| `bench-deny-validate.mjs` | 59-node synthetic graph, **44 in-corpus + 40 adversarial** (30 near-miss / 10 far-miss), score-only gate 0.75 × 1: true-deny **37/44 = 84%**, false-deny all-adversarial **1/40 = 3%**, near-miss **1/30 = 3%**, far-miss **0/10 = 0%**. 23/30 near-miss breached the cap; satisfaction bands **0.81 / 0.58 / 0.35**. **VERDICT this run: SHIP.** | reproduced | `node bench/bench-deny-validate.mjs --json` |

> **`bench-deny-validate` supersedes the older `bench/README.md` table.** That
> doc records **100% true-deny / 77% near-miss false-deny** with a
> `SHIP-WITH-GUARD` verdict and near-coincident satisfaction bands
> (0.77/0.75/0.75 — score does not discriminate). This run was taken *after* the
> relevance-aware satisfaction change (trust × relevance gate), which makes
> satisfaction reflect best-hit distance: the bands now separate (0.81/0.58/0.35)
> and the verdict flips to **SHIP** (overall false-deny 3% ≤5%, near-miss 3%
> ≤10%). The single near-miss leak was *"how does three-phase commit avoid the
> blocking problem two-phase commit has?"* Caveat (from the runner): synthetic
> corpus, hand-authored adversarial banks engineered to stress the cap — a
> deliberate worst-case probe, single-graph measurement.

## Retrieval-quality benchmarks

| Runner | Headline number(s) — THIS run | Status | Repro |
|---|---|---|---|
| `bench-scifact-offline.mjs` | Synthetic 40-doc fixture, 18 queries, production hybrid (dense+FTS5 BM25 RRF), **hashed-bow deterministic fallback embedder** (no model): **NDCG@10 79.90%, R@10 94.44%, MRR 0.7533**. Pipeline regression sentinel — NOT comparable to the 72.30% BEIR figure. | reproduced | `node bench/bench-scifact-offline.mjs` |
| `bench-beir-sota.mjs --hybrid` | Real BEIR SciFact (5,183 docs, 300 queries), nomic-768 dense + BM25 RRF from **cached vectors**: **NDCG@10 73.34%, MAP@10 68.52%, R@5 79.87%, R@10 86.62%, MRR 0.6985**; total latency p50 164ms / p95 263ms. ~1pt above the documented 72.30% Wave-2 headline — within run/index variance; corroborates the band, does not restate the headline. | reproduced | `node bench/bench-beir-sota.mjs scifact --hybrid` |
| `bench-matryoshka.mjs` | SciFact (nomic) from cache. Full 768 = **70.76%** baseline; 512 −0.53pt, 256 −3.04pt, 128 −6.29pt, 64 −17.24pt — every truncated dim fails the tolerance gate. **NULL.** | reproduced (null) | `node bench/bench-matryoshka.mjs` |
| `bench-bridge.mjs` | SciFact from cached nomic+bge query vectors. Native nomic 70.01% → **bridged bge→nomic 64.34% (91.9% retention)** vs native-bge port 63.46%. **PASS** — linear bridge ≥85% gate; ship as v3 interop primitive. | reproduced | `node bench/bench-bridge.mjs` |
| `bench-room-routing.mjs` | cqadupstack {mathematica, webmasters, gaming}, 79,411 passages, 2,905 queries, MiniLM dense+BM25 hybrid. Flat **43.85%** vs oracle-routed **44.24%** → **Δ +0.38pt**. **GATE FAILED / NULL** — rooms cosmetic for retrieval (reproduces the documented +0.34 null). | reproduced (null) | `node bench/bench-room-routing.mjs --datasets-dir ~/.folklore/bench/cqadupstack/cqadupstack --rooms mathematica,webmasters,gaming` |
| `bench-ppr.mjs` | SciFact, doc-doc kNN (k=5, 25,915 edges), cached vectors. Dense **70.01%** → +PPR rerank **46.25%** → **Δ −23.76pt**. **NULL** — single-hop does not benefit. | reproduced (null) | `node bench/bench-ppr.mjs` |
| `bench-ppr-multihop.mjs` | Live HotpotQA path is a documented skeleton needing the ~1 GB BEIR download (prints note, exits). `--synthetic` 50-doc micro-corpus ran end-to-end: baseline NDCG@10 1.0000 → PPR **0.6578** (Δ −34.22pt). Synthetic validates **wiring only**, not lift. | reproduced (synthetic wiring only; live blocked: needs HotpotQA) | `node bench/bench-ppr-multihop.mjs --synthetic` (live: `… --dataset hotpotqa`) |
| `debug-reranker.mjs` | InRanker cross-encoder diagnostic: single forward 1696ms; batch-of-3 logits `[6.04, −10.18, −0.90]` (relevant highest, irrelevant lowest). Confirms the reranker tier runs end-to-end on cached `InRanker-base`. | reproduced | `node bench/debug-reranker.mjs` |
| `bench-beir.mjs scifact` (dense) | Real BEIR SciFact, default `Xenova/all-MiniLM-L6-v2` (cached), full 5,183-doc corpus re-embedded at runtime (~3–5 docs/sec CPU, does not reuse the cached hybrid vectors). **Completed: NDCG@10 65.26%, MAP@10 60.37%, R@5 75.02%, R@10 78.97%, MRR 0.6109**. This is the MiniLM dense-only floor — well below the 73.34% nomic dense+BM25 hybrid, as expected (weaker model, no BM25 fusion). | reproduced (slow full-corpus re-embed) | `node bench/bench-beir.mjs scifact` |
| `bench-lab.mjs` | Matryoshka × quant × hybrid sweep over scifact/arguana/fiqa/scidocs from cached vectors. Runs from cache (no network) but is long-running (4 datasets × 8 dims × 3 quant levels); not run to completion in this capture's time budget. | partially reproduced (runs from cache; long sweep, not completed) | `node bench/bench-lab.mjs` |
| `bench-beir-sota.mjs --rerank` | The `Xenova/bge-reranker-base` cross-encoder **did load this run** (so it is reachable/cached after all — not download-blocked), but the per-query rerank pass over 300 queries did not finish inside the time budget and the run was killed. The **previously cached** result.json for this exact config shows rerank **NDCG@10 70.38%** vs the 73.34% hybrid above — a **−2.96pt regression**, same sign/verdict as the documented **−1.92pt reranker null** (magnitude differs by run/cache). | partially reproduced (reranker loads; slow rerank pass not completed) | `node bench/bench-beir-sota.mjs scifact --hybrid --rerank` |
| `bench-beir-rust.mjs` | Boots the Rust embedder, then crashes on `embedder.embedBatch(...)` (unsettled top-level await). Documented Phase-25 figure **75.22% NDCG@10** stands as previously measured. | BLOCKED: Rust `embed_server` (bge-base) | `FOLKLORE_RUST_BIN=$(pwd)/folklore-rs/target/release/embed_server node bench/bench-beir-rust.mjs scifact --model bge-base` |
| `bench-arguana-dense.mjs` | Loads 1,406 queries/qrels, builds rowid↔docId map, then crashes booting the Rust embedder. Gate target ≥49.0% NDCG@10 (published nomic ceiling ~50.4%). | BLOCKED: Rust `embed_server` | `node bench/bench-arguana-dense.mjs` |

## Infra / perf benchmarks

| Runner | Headline number(s) — THIS run | Status | Repro |
|---|---|---|---|
| `bench-warm.mjs` | Warm-cache latency over the live DB. Code-graph search p50 0–2ms / p99 ≤3ms; **vector k-NN (sqlite-vec 384d, 26,395 vectors): k=10 p50 30ms / p95 38ms; k=50 p50 32ms / p95 42ms**. Totals: 17,518 code nodes, 44,177 edges, 6 codebases, 6 room attaches. | reproduced | `node bench/bench-warm.mjs` |
| `bench-e2e.mjs` | Product-shaped E2E (n=15, fresh `--home`): **warm-ask (daemon IPC) p50 755ms / p95 2515ms; fed-ask (libp2p wire) p50 1045ms / p95 1106ms; save p50 759ms / p95 869ms**; reference paid-web-fetch band ≈1000–2000ms. Requires `--home <dir>` (or `$FOLKLORE_HOME`) — errors without one. | reproduced (requires `--home`) | `node bench/bench-e2e.mjs --home /tmp/folklore-e2e-home` |
| `bench-index-health.mjs` | Local index diagnostic: graph **21,133 nodes**, **26,395 vector rows**, 25,005 raw_text; coverage raw_text **94.7%** / graph_vector **90.7%**; metadata title 2.4% / source_uri 0.1%; **stored-vector self-recall R@1 90.5% / R@5 98.7% / R@10 98.9%**. | reproduced | `node bench/bench-index-health.mjs` |
| `bench-consolidation.mjs` | Ran against an **empty `default` room** (no live session data): 0 entries, shrinkage **1.00×** → **NULL** (`<2× shrinkage`), quality probe skipped. Mechanically clean but vacuous — the local graph has no populated consolidation room to exercise. | reproduced (vacuous — no populated room) | `node bench/bench-consolidation.mjs <room>` |
| `bench-embed-throughput.mjs` | Crashes during warm-up on `embedder.embedBatch(...)` (unsettled top-level await). | BLOCKED: Rust `embed_server` (bge-base) | `node bench/bench-embed-throughput.mjs --model bge-base --n 32` |

## Parameter sweeps & qrel audits

All boot the Rust embedder and crash; the qrel-rejudge trio additionally needs
an Ollama judge on `localhost:11434`.

| Runner | Headline number(s) — THIS run | Status | Repro |
|---|---|---|---|
| `sweep-rrf.mjs` | Loads 300 queries / 339 qrels, opens cached `vectors.db`, then crashes booting the Rust `embed_server` on `embedder.embed(...)`. Baseline target k=60/α=0.50 → 75.22%. | BLOCKED: Rust `embed_server` | `node bench/sweep-rrf.mjs` |
| `sweep-rocchio.mjs` | Loads 300 queries / 339 qrels, then crashes booting the embedder. Baseline 75.22%; settings m=5, α=0.7, β=0.3. | BLOCKED: Rust `embed_server` | `node bench/sweep-rocchio.mjs` |
| `jacobi-preconditioning.mjs` | Computed corpus stats (N=5,183, D=768, σ² ratio 9×) and built `W=diag(1/√(σ²+ε))`, then crashed booting the embedder. CFD null — worst case W=I = vanilla cosine. | BLOCKED: Rust `embed_server` (CFD null) | `node bench/jacobi-preconditioning.mjs` |
| `qrel-rejudge.mjs` / `-v2` / `-v3` | All load corpus/queries/qrels, then crash booting the Rust embedder; they also require an Ollama judge (qwen2.5:3b / gpt-oss:20b) on `localhost:11434`. Documented v3 result κ=0.7053 PASS. | BLOCKED: Rust `embed_server` **and** Ollama judge | `node bench/qrel-rejudge.mjs 100 20` · `node bench/qrel-rejudge-v2.mjs` · `node bench/qrel-rejudge-v3.mjs` |
| `contextualize-corpus.mjs` | Ran by **resuming from a pre-existing fully-contextualized corpus** (5,183 docs already present), re-emitting `corpus.jsonl` without calling Ollama. Fresh corpus needs an Ollama instance. **Bug noted below** (progress counter overshoots). | partially reproduced (resumed from cache; fresh run needs Ollama) | `node bench/contextualize-corpus.mjs` |

## Honest nulls (called out explicitly)

| Null | THIS run | Verdict |
|---|---|---|
| Reranker regression (documented −1.92pt) | Cached rerank config 70.38% vs 73.34% hybrid → **−2.96pt** (fresh `--rerank` reranker loaded but pass not completed in budget) | NULL — reranking regresses single-stage hybrid |
| Room routing (documented +0.34) | Oracle 44.24% vs flat 43.85% → **+0.38pt** over 2,905 queries | NULL — rooms cosmetic for retrieval; gate failed |
| PPR rerank (single-hop) | Dense 70.01% → +PPR 46.25% → **−23.76pt** | NULL — single-hop does not benefit |
| PPR multi-hop (synthetic probe) | Baseline 1.0000 → PPR 0.6578 → −34.22pt (wiring-only) | NULL on synthetic; real gate needs HotpotQA |
| Matryoshka truncation | Every dim <768 fails tolerance (−0.53 to −17.24pt) | NULL on SciFact |
| Jacobi / CFD preconditioning | Setup ran; embedder boot blocked this run | NULL (documented); blocked on Rust sidecar |
| Consolidation shrinkage | 1.00× on empty room | NULL (vacuous — no populated room here) |

## Potential bugs / unexpected behavior

Not clean "needs X" skips — flag for the maintainer:

- **`contextualize-corpus.mjs` progress counter overshoots its own total.** It
  printed `5200/5183 … 10350/5183 done` with `ETA −0.0 min` while "resuming"
  from a fully cached corpus. The work appears to be a no-op cache hit but the
  counter keeps incrementing past 100%, so the throughput/ETA line is
  meaningless. Cosmetic but misleading.
- **Rust-embedder runners crash with an *unsettled top-level await* instead of a
  clean error** when the sidecar is missing (`sweep-rrf`, `sweep-rocchio`,
  `jacobi`, `qrel-rejudge*`, `bench-arguana-dense`, `bench-embed-throughput`,
  `bench-beir-rust`). They exit non-zero (13) but emit only the Node warning, no
  human-readable "Rust embed_server not found — set FOLKLORE_RUST_BIN" hint. A
  preflight check would turn 8 confusing crashes into clean actionable skips.
- **`bench-beir-sota.mjs --rerank` has no progress output during its rerank
  pass.** After printing `Loading reranker…` / `reranker loaded` it runs the
  per-query cross-encoder pass (300 queries × top-100) silently for minutes with
  no counter, so it is indistinguishable from a hang. A `n/300` progress line
  (as the hybrid pass already has) would remove the ambiguity.

## How to unblock the remaining 8 (and finish the 2 partials)

1. Build the Rust `embed_server` sidecar (bge-base) and export
   `FOLKLORE_RUST_BIN=$(pwd)/folklore-rs/target/release/embed_server`. Unblocks
   all 8: `sweep-rrf`, `sweep-rocchio`, `jacobi-preconditioning`,
   `bench-arguana-dense`, `bench-embed-throughput`, `bench-beir-rust`, and the
   retrieval half of `qrel-rejudge{,-v2,-v3}`.
2. Run a local Ollama (`qwen2.5:3b` / `gpt-oss:20b`) on `localhost:11434` for the
   `qrel-rejudge*` judge half and a fresh `contextualize-corpus` run.
3. Give the two partial runs more wall-clock time to finish their slow passes:
   `bench-beir-sota.mjs --rerank` (the reranker loads; the 300-query
   cross-encoder pass just needs minutes) and `bench-lab.mjs` (the long
   matryoshka × quant × hybrid sweep).
4. Allow the ~1 GB HotpotQA BEIR download for the live
   `bench-ppr-multihop.mjs --dataset hotpotqa` gate.

---

## Summary

| Category | Runner | Status | Headline this run |
|---|---|---|---|
| economic | `bench-compounding.mjs` | reproduced (sim) | 9.1× cheaper, coop hit 90.2% @P=64 |
| economic | `bench-value-model.mjs` | reproduced (model) | 9.13× fewer trips, 77.1% tokens saved |
| economic | `bench-user-value.mjs` | reproduced | 22.9% grounded, 0% web-deflection (live) |
| economic | `bench-subgraph-transfer.mjs` | reproduced | 3.9 nodes / 2.9 edges, 63.1% token saving |
| economic | `bench-coldstart-seed.mjs` | reproduced | soft-deflect 0% → 75% after seed |
| deny-gate | `bench-deny-sweep.mjs` | reproduced | score-only 0.70×1 → 42% true / 0% false |
| deny-gate | `bench-deny-validate.mjs` | reproduced | 84% true-deny / 3% false-deny (SHIP) |
| retrieval | `bench-scifact-offline.mjs` | reproduced | NDCG@10 79.90% (synthetic proxy) |
| retrieval | `bench-beir-sota.mjs --hybrid` | reproduced | NDCG@10 73.34% (vs doc 72.30%) |
| retrieval | `bench-matryoshka.mjs` | reproduced (null) | every dim <768 fails gate |
| retrieval | `bench-bridge.mjs` | reproduced | bridge retention 91.9% (PASS) |
| retrieval | `bench-room-routing.mjs` | reproduced (null) | oracle +0.38pt vs flat (gate failed) |
| retrieval | `bench-ppr.mjs` | reproduced (null) | PPR −23.76pt |
| retrieval | `bench-ppr-multihop.mjs` | reproduced (synthetic) | wiring-only; live needs HotpotQA |
| retrieval | `debug-reranker.mjs` | reproduced | reranker tier runs (InRanker) |
| retrieval | `bench-beir.mjs scifact` | reproduced | MiniLM dense-only NDCG@10 65.26% |
| retrieval | `bench-lab.mjs` | partial | runs from cache; long sweep, not completed |
| retrieval | `bench-beir-sota.mjs --rerank` | partial | reranker loads; pass not completed (cached prior: −2.96pt) |
| retrieval | `bench-beir-rust.mjs` | BLOCKED | Rust sidecar (doc 75.22%) |
| retrieval | `bench-arguana-dense.mjs` | BLOCKED | Rust sidecar |
| infra | `bench-warm.mjs` | reproduced | vec k-NN k=10 p50 30ms |
| infra | `bench-e2e.mjs` | reproduced | warm-ask p50 755ms, fed-ask p50 1045ms |
| infra | `bench-index-health.mjs` | reproduced | self-recall R@10 98.9% over 21,133 nodes |
| infra | `bench-consolidation.mjs` | reproduced (vacuous) | 1.00× (empty room) |
| infra | `bench-embed-throughput.mjs` | BLOCKED | Rust sidecar |
| sweeps | `sweep-rrf.mjs` | BLOCKED | Rust sidecar |
| sweeps | `sweep-rocchio.mjs` | BLOCKED | Rust sidecar |
| sweeps | `jacobi-preconditioning.mjs` | BLOCKED | Rust sidecar (CFD null) |
| sweeps | `qrel-rejudge.mjs` / `-v2` / `-v3` | BLOCKED | Rust sidecar + Ollama judge |
| sweeps | `contextualize-corpus.mjs` | partial | resumed from cache; fresh needs Ollama |
