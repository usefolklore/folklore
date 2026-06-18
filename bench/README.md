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
| `bench-compounding.mjs` | 64-peer compounding stream, **boolean** retrieval (superseded — see graded below) | `node bench/bench-compounding.mjs` |
| `bench-compounding-graded.mjs` | **Graded** compounding through the real energy gate — paraphrase misses + false-admit; churn, CRDT replication, inference-cost. `--sweep-peers` for R(T,t) | `node bench/bench-compounding-graded.mjs` |
| `bench-paraphrase-sigma.mjs` | Real-embedding paraphrase regime (query↔source cos) → maps to the graded-sim σ | `node bench/bench-paraphrase-sigma.mjs` |
| `bench-subgraph-transfer.mjs` | Bounded subgraph payload per hit | `node bench/bench-subgraph-transfer.mjs` |
| `bench-value-model.mjs` | Demand economics with subgraph transfer | `node bench/bench-value-model.mjs` |
| `bench-user-value.mjs` | Per-user value model | `node bench/bench-user-value.mjs` |
| `bench-coldstart-seed.mjs` | Cold-start web-deflection before/after `folklore seed` (real `ask` path, empty vs seeded graph) | `node bench/bench-coldstart-seed.mjs` |
| `bench-deny-sweep.mjs` | Deny-gate threshold × min-hits sweep with honest false-deny accounting (true-deny on in-corpus vs false-deny on adversarial out-of-corpus) | `node bench/bench-deny-sweep.mjs` |
| `bench-deny-validate.mjs` | Larger adversarial-by-construction validation of the score-only gate at 0.75 × 1: 59-node synthetic graph, 44 in-corpus + 40 adversarial (30 near-miss / 10 far-miss) questions, near/far false-deny split + nearest-hit distance distribution | `node bench/bench-deny-validate.mjs` |
| `bench-index-health.mjs` | Local index health diagnostic | `node bench/bench-index-health.mjs` |

### Deny-gate default: the evidence

`bench-deny-sweep.mjs` answers "what `FOLKLORE_DENY_THRESHOLD` /
`FOLKLORE_DENY_MIN_HITS` default actually trades web-trips-avoided against
false-denials?" It seeds a fresh graph (real `folklore seed`), probes the
real `folklore ask --json` path once per question, then replays the grid
`{0.70, 0.75, 0.80, 0.85} × {1, 2, 3}` against two gate variants. Each cell
reports **true-deny** (web trip correctly avoided on the 12 in-corpus
questions) and **false-deny** (web trip wrongly blocked on 8 adversarial
out-of-corpus questions). It recommends only — it does **not** edit
`.claude/settings.json` or any `src/` file.

The honest finding (measured, not assumed): the **shipped** gate is **0%
true-deny in every cell**. Turning `FOLKLORE_DENY_THRESHOLD` down is inert,
because the gate also requires `action === 'use_memory'`, and that decision
is governed by a *fixed* `0.85` breakpoint in `CONTRACT_THRESHOLDS` plus a
single-origin shallow-evidence demotion — seeded nodes land at satisfaction
~0.75 and never reach `use_memory`. The knob the cold-start track wanted to
turn is gated shut upstream of itself.

A **score-only** variant (deny on `satisfaction ≥ threshold ∧
surviving_hits ≥ min_hits`, dropping the `use_memory` precondition but
keeping the hook's own `d ≤ 1.05` relevance pre-filter) is what unlocks
deflection: **threshold 0.75 × min_hits 1 → 92% true-deny on in-corpus,
0% false-deny on out-of-corpus**. False-deny stays at 0 because the
*distance* filter, not the satisfaction score, is the relevance guard — the
adversarial questions return the same ~0.75 satisfaction but their nearest
hit sits well past the `1.05` cap, so they never count toward `min_hits`.
Raising `min_hits` to 2 collapses true-deny to 17% on this corpus (most
seeded answers have one surviving hit), so the lever genuinely costs
deflection rather than denying everything. Caveat: 12 + 8 questions is a
*direction*, not a population estimate (~8 points per flipped question);
adopting the score-only shape means relaxing the hook's `action`
precondition, which this bench recommends but does not perform.

### Deny-gate validation: the score-only gate is NOT safe to ship as-is

`bench-deny-sweep`'s 0% false-deny rested on one untested assumption: that
the `d ≤ 1.05` distance pre-filter — not the satisfaction score — keeps
adversarial queries out of `min_hits`. But that sweep's 8 adversarial
questions were all topically *far* from the seed corpus, so their nearest
hit sat well past the cap by construction. The 0% was an artifact of the
fixture, not a property of the gate: an adversarial query whose nearest
seeded node lands *inside* the cap would false-deny, and the small set
never probed that boundary.

`bench-deny-validate.mjs` builds the missing test. It seeds a **59-node
synthetic validation graph** (`eval/fixtures/deny-validate/corpus.json`,
durable concepts across distributed systems, vector search, storage,
security, concurrency, ML) via the same real `folklore seed --file`
ingest path — the **product seed corpus is untouched**. It then runs
**44 in-corpus + 40 adversarial** questions
(`eval/fixtures/deny-validate/questions.json`), where the adversarial set
is deliberately split into **30 near-miss** (a different, *uncovered*
facet of a seeded domain — e.g. "three-phase commit" against a corpus
that only covers two-phase commit — engineered to land near the cap) and
**10 far-miss** (unrelated domains: espresso, F1, mortgages).

Measured at the recommended cell (score-only, **0.75 × 1**), on the real
`folklore ask --json` path:

| metric | count | rate |
| --- | --- | --- |
| true-deny (in-corpus) | 44 / 44 | **100%** |
| false-deny (all adversarial) | 23 / 40 | **57%** |
| false-deny (**near-miss**) | 23 / 30 | **77%** |
| false-deny (far-miss) | 0 / 10 | **0%** |

Nearest-hit distance vs the `1.05` cap tells the whole story:

| bank | min | median | max | inside cap |
| --- | --- | --- | --- | --- |
| in-corpus | 0.49 | 0.76 | 1.01 | — |
| near-miss | 0.77 | 0.99 | 1.17 | **23 / 30** |
| far-miss | 1.22 | 1.29 | 1.39 | 0 / 10 |

And satisfaction confirms it cannot help: mean satisfaction is
**0.77 / 0.75 / 0.75** across in-corpus / near-miss / far-miss — the score
is structural and does **not** separate relevance, so the distance cap is
the *sole* guard. The near-miss band straddles the cap (median 0.99,
max 1.17), so 23 of 30 near-miss questions slipped inside `1.05` and
false-denied — confident denials on questions memory could not answer
(three-phase commit, hybrid logical clocks, ARIES recovery, ColBERT,
DBSCAN, …).

**VERDICT — `SHIP-WITH-GUARD`.** The score-only gate at 0.75 × 1 is *not*
safe to ship on its own: it leaks badly (77% near-miss false-deny) the
moment adversarial queries are semantically adjacent rather than random.
The far-miss 0% reproduces the original sweep, which is exactly why the
small sweep looked safe and wasn't. Before relying on a score-only gate,
add a guard:

- a **tighter distance cap** — the in-corpus band tops out at ~1.01 while
  the near-miss band starts at ~0.77, so the two overlap and no single
  cap cleanly separates them; tightening helps but cannot fully close the
  gap on this set;
- **relevance-aware satisfaction** — let the score reflect best-hit
  distance, not just freshness/provenance/origins, so a far hit can't
  ride a structural 0.75;
- a **multi-origin / `min_hits ≥ 2`** requirement so one close-but-wrong
  node can't trip the gate (note this also costs in-corpus deflection, as
  the sweep showed).

Caveat: the corpus is synthetic and the near-miss bank is *engineered* to
stress the cap, so 77% is a deliberate worst-case probe, not an
in-the-wild base rate. A leak this size under adversarial proximity is
nonetheless decisive: the score-only gate's safety margin depends on
adversarial queries staying topically distant, which is not a safe
assumption. Repro:

```bash
node bench/bench-deny-validate.mjs            # table + verdict
node bench/bench-deny-validate.mjs --json      # + machine-readable summary
```

(Writes `eval/out/deny-validate-summary.json`. Needs a cached embedder
model under `~/.folklore` or `~/.akashik`; says so and exits 1 if absent —
no fabricated numbers. Recommends only — no `src/` or `.claude/` edits.)

## Full v2 system report

`bench-v2.sh` runs the comprehensive v2.0 CLI benchmark and writes a
report to `.planning/BENCH-v2.md`. It invokes `npm test` as part of the
run.

```bash
bash bench/bench-v2.sh
```

See `docs/product/BENCHMARKS.md` and `.planning/BENCH-v2.md` for the full
attack archive, root-cause analysis, and competitor landscape.
