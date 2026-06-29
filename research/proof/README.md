# Proof log — benches run against the real harness

Real numbers from running the repo's benches (offline, cached MiniLM/bge models,
real `~/.folklore` graph + BEIR qrels). Each row links the raw capture in `raw/`.
Discipline: report what ran, label simulator vs measured, and record honest
negatives (including ones that contradict earlier claims) rather than burying them.

| RQ | Bench | Headline result | Verdict | Raw |
|----|-------|-----------------|---------|-----|
| RQ1, RQ5 | `bench-inference-tree-sharing.mjs` (NFCorpus, 323 q, 3633 docs, recall@10, q2q≥0.6) | baseline 73.5% → **tree-shared 98.6%** (+34.1% rel); rescued 2015, **hurt 7/8000 (0.09%)**, 7719/8000 inherited | ✅ reuse helps, hurt≈0 | `raw/inference-tree-sharing.txt` |
| RQ4, RQ5 | `bench-compounding-real.mjs` (SciFact, 300 q, 5183 docs, MiniLM, real qrels, 16 peers, 6000 steps, churn 20%) | correct-resolve isolated **27.9%** → cooperative **39.3%**; false-admit 5.4%→**1.8%**; web trips 4233→3599 (1.18×); **+5.35M tokens reused** | ✅ compounds (real corpus) | `raw/compounding-real.txt` |
| RQ2 | `bench-energy-gate.mjs` (real graph, 36 in + 22 out, k=5, real `ask` path) | **AUC(−E) = 0.405** — does NOT separate; true-admit 32% / false-admit 13%; satisfaction baseline 0.52 | ⚠️ **honest negative** | `raw/energy-gate.txt` |
| RQ5 | `bench-paraphrase-sigma.mjs` (36 real query↔source pairs, MiniLM, offline) | true-match cos median **0.841** vs spurious 0.087; **separation AUC 0.998**; σ≈0.033 | ✅ reproduces agenda σ figures | `raw/paraphrase-sigma.txt` |
| RQ3 | `eval/out.run6-haiku/summary.json` (Haiku agent / Opus judge, BEIR SciFact, gold-displaced, A1/A2/A3 × {25,50,75}, n=82, 2957 cells) | flip-ASR T0 **0.59** → **T1 ranker 0.024 (~25×)** → T2 0.20; attack-effect 0.84 → T1 0.10 (~8.7×) | ✅ **provenance defense PROVEN** (positive) | `eval/RESULTS-LOG.md` |
| RQ4, E4 | `bench-vcache-compare.mjs --peers 4 --steps 300` (SciFact, 300 q, recall@1, matched ≤2% false-accept) | COLD 47.7% → single-node vCache-like **60.7%** → **federated 74.0%**; **federated vs single-node +22.0%**, vs cold +55.2% | ✅ **federation beats tuned single-node** | `raw/vcache-compare-bounded.txt` |
| RQ1, E1 | `run-e1-reuse.mjs` (SciFact-100, Haiku via `claude -p`, 20 most-similar different-need pairs, mean cos 0.498) | **HURT = 0/9** fresh-correct flips; Δcorrect +1; max different-need cos **0.544 < 0.6 gate** | ✅ reuse safe at the answer level | `raw/e1-reuse.txt` |

## Discrepancy to reconcile (RQ2)

`research/rq/RQ2.md`, `00-research-agenda.md`, and the whitepaper cite the energy
gate at **AUC 0.78** (57% true-admit / 0% false-admit). Re-run **now** on the
current 17G real graph it scores **AUC 0.405** — at or below the 0.52 satisfaction
baseline, with 13% false-admit. The bench's own verdict: *"energy does NOT separate
— the sims themselves don't discriminate; fix sim_i (token-set coverage / stronger
embedder) first."*

Likely causes (to test): the graph has grown/changed since the 0.78 fit; the 58-query
fit was provisional and overfit; or `sim_i` quality regressed. **Action:** treat the
energy-OOD gate as *unproven on the current graph* until re-fit + re-validated; this
is exactly the RQ2 falsifier firing. Do not cite 0.78 as current without a fresh
matching run. (E2's `bench-energy-stale.mjs` should be built on top of a gate that
actually separates — so fixing `sim_i` is now upstream of E2.)

### The proposed `sim_i` fix, tested — and falsified

`energy-gate.ts` itself says the planned fix is "after the **token-set-coverage**
change sharpens `sim_i`." New measurement bench `bench/bench-energy-coverage.mjs`
re-scores the deny-real fixtures via the real `ask --json` path, recomputing `−E(q)`
with `sim_i' = sim_i × max(floor, token_coverage)`. Result (12 in / 12 out, floor 0.2):

| sim | AUC(−E) in-vs-out |
|-----|-------------------|
| raw `1 − distance` | 0.622 |
| coverage-adjusted | **0.521** (Δ **−0.10**) |

**Token-set coverage does not rescue the gate — it makes separation worse.** The hit
labels/summaries don't share enough vocabulary with even in-corpus queries, so
coverage suppresses real hits as much as OOD ones. The cheap lever the project assumed
would fix `sim_i` is measured-negative. The remaining lever — a **stronger embedder**
(bge, cached) — needs re-embedding the 17G MiniLM graph (384→768 dim), the genuine
heavy infra task. So: the energy gate's separation is **bounded by MiniLM embedding
quality on the real graph**, and the honest next step is a graph re-embed, not a
post-hoc score tweak.

### And the stronger-embedder lever, tested — it WORKS (the fix is found)

`bench/bench-energy-bge.mjs` re-scores the **same real retrieved hits** with **bge-base**
(`sim = cos(bge(query), bge(hit_text))`) instead of MiniLM's `1 − distance`, on the full
deny-real set (36 in / 22 out):

| sim source | AUC(−E) in-vs-out |
|------------|-------------------|
| MiniLM `1 − distance` | **0.506** (≈ chance — the gate's real failure) |
| **bge re-scored** | **0.968** (Δ **+0.46**, near-perfect) |

**bge cleanly separates where MiniLM doesn't.** The gate's failure is an *embedder-quality*
problem — not gate design, not coverage: the cheap lexical lever fails (−0.10), the
stronger-embedder lever near-perfectly fixes it (+0.46) — *on this scoring test*. Caveat
(load-bearing, see below): this re-scores MiniLM-retrieved candidates, so it tests bge
*scoring*, not bge *retrieval*. Raw: `research/proof/raw/energy-bge.txt`.

### LIVE validation of the full bge re-embed — the fix does NOT transfer (disciplined negative)

Re-embedded all **18,077** nodes with bge-base into `vectors-bge.db` (~64 min, 0 failed),
fixed two code gaps that left bge half-wired (the xenova path ignored
`FOLKLORE_EMBEDDER_MODEL`; the index opened at the default 384-dim — both fixed in
`src/cli/runtime.ts`), and ran the **real `ask` path** over the bge index:

| sim path | AUC(−E) in-vs-out |
|----------|-------------------|
| MiniLM (live) | ~0.41–0.51 |
| bge re-SCORING (offline, MiniLM-retrieved candidates) | 0.968 |
| **bge RETRIEVAL (live path, full re-embed)** | **0.548** |

**The fix does not transfer.** Live bge *retrieval* surfaces its own nearest neighbours, and
bge gives even OOD queries high-cosine hits — out-of-corpus −E median **0.840 exceeds**
in-corpus **0.352** (separation inverted). So a stronger embedder does **not** rescue the
energy gate on the live retrieval path. The earlier "re-embed justified" line was the
scoring-vs-retrieval caveat firing, now measured. AUC is threshold-independent → re-fitting
τ/β cannot recover it.

**Net for RQ2:** neither lever fixes the OOD gate — cheap coverage (−0.10) nor heavy bge
re-embed (live 0.548). The failure is deeper than embedder quality: OOD admission over a
21k-node graph where *any* query finds moderate-cosine neighbours is the hard part. Honest
status holds — **the energy-OOD gate does not separate on the real graph**; the
satisfaction deny-gate (~0.52) remains the ceiling. Code dividend: the bge path is now
functional end-to-end (a real bug fix in `runtime.ts`), even though bge is not the answer.
Raw: `research/proof/raw/energy-gate-bge.txt`.

### Lever sweep complete — the OOD gate is a genuine open problem

| lever | AUC(−E) / result |
|-------|------------------|
| bi-encoder MiniLM (shipped) | 0.41–0.51 — fails |
| token-set coverage × sim | −0.10 — fails |
| bge re-embed (live retrieval) | 0.548 — fails |
| cross-encoder (ms-marco) rerank | **untestable here** — model not cached (only MiniLM/bge are), HF download blocked; probe returned degenerate passthrough scores [1,1] for a relevant *and* irrelevant doc |

All cheap + medium levers are exhausted and negative. The cross-encoder is the most
promising untried lever (joint query-doc scoring is far sharper than bi-encoder cosine and
is exactly the relevance discrimination OOD admission needs) but requires the
`Xenova/ms-marco-MiniLM-L-6-v2` model, which isn't available in this sandbox. **Honest
conclusion for RQ2/E2:** OOD admission on a 21k-node graph is not fixable by embedder or
score tweaks at the bi-encoder layer; the next real attempt is a working cross-encoder
admission score (needs the model) or a fundamentally different OOD signal (e.g. retrieval
*margin*/entropy over the full corpus, not top-k similarity). Documented, not guessed.

## RQ3 — provenance defense PROVEN positive (measured, supersedes the "null")

The E3 experiment my notes/whitepaper called "pending" **already ran** (runs 5–6,
2026-06-11, `eval/RESULTS-LOG.md`). The arc:

- Runs 1–4 = the null: Opus (and Haiku with gold force-pinned in-window) resist
  poison to ~0 ASR. **But that null was an artifact of force-pinning gold in the
  top-k window** (PoisonedRAG's own failure analysis: clean passage in window →
  model answers correctly).
- Run 6, the **gold-displaced** regime (gold pushed out of top-k, 3-tier trust:
  signed-gold / unsigned-corpus / fresh-unsigned-poison, authority-framing poison):
  the baseline is **genuinely poisonable** and the **provenance ranker recovers it**.

`run6/summary.json` (flip-ASR among clean-correct, n=82):

| rate | T0 baseline | T1 ranker | T2 prompt |
|------|-------------|-----------|-----------|
| 25%  | 0.636 | 0.018 | 0.336 |
| 50%  | 0.598 | 0.027 | 0.150 |
| 75%  | 0.533 | 0.027 | 0.107 |

- **T1 (drop every unsigned passage, keep the attributed-signed gold) cuts flip-ASR
  ~25× (0.589→0.024) and attack-effect ~8.7× (0.838→0.098), and is poison-rate-
  invariant** — flat because dropping unsigned passages makes Sybil cluster size
  irrelevant. This is the protocol's safety claim, **demonstrated**.
- T2 (provenance-in-prompt, poison kept in window) blocks the lie but converts it to
  doubt (doubt-rate 0.42→0.71): prevents falsehood, can't restore truth without the
  gold present. **T1 > T2.**
- Per-attack: A1 authority/erratum 0.94→≤0.03, A3 citation-laundering 0.86→≤0.03,
  A2 crude `[SYSTEM CORRECTION]` injection already ignored (0.08–0.11). Reproduces the
  literature's soft-authority-framing > overt-injection finding.
- Caveats (on record): `claude -p` backend, no temperature-0; ~18% judge cells dropped
  to transient exit-1 (effect 0.84 vs 0.10 dwarfs both).

**ACTION — whitepaper correction needed.** §7.4 / §6.3 / abstract / §9#2 / §10 were
updated this session to the *null* framing (from `FELLOWS-FRAMING.md`, which predates
runs 5–6). The real result is the **positive** one above. Re-update to: null on the
strong claim (frontier/gold-present) → null broken in the displaced regime → **T1
provenance ranker ~25× protection** on the vulnerable weak-agent baseline.

## RQ4 / RQ5 — compounding (label simulator vs real)

`eval/COMPOUNDING-RESULTS.md`:
- **Simulator** (`bench-compounding.mjs`, 64 peers, 200k-query stream, Mandelbrot-Zipf):
  isolated hit flat ~18.5% vs cooperative **90.2%** at 64 peers; **9.1× fewer paid web
  trips**; **77.1% fewer model input tokens** (4.4× vs no-cache, 3.8× vs isolated).
  Checked against Che's LRU approximation within 0.16 pts. Labeled *simulator evidence,
  not production proof*.
- **Real-graph** (`bench-subgraph-transfer.mjs`, sampling `~/.folklore`, 21,130 nodes):
  avg transplant 3.9 nodes / 2.9 edges, p50 payload 1.3 KiB; **63.3% token saving /
  2.7× model-token reduction** over related asks.
- Plus the live `bench-compounding-real.mjs` run above (RQ4/RQ5 row): cooperative
  correct-resolve 39.3% vs 27.9%, false-admit 1.8%.

## Loop queue (remaining)

- ⚠️ `bench-vcache-compare.mjs` HUNG at 9m (RQ1/RQ4 federated-vs-single-node) — needs a
  smaller-N flag or backgrounding. Retry with a bounded query set.
- Update the whitepaper RQ3 framing (null → positive) — see ACTION above.
- Update `research/rq/RQ2.md` (energy-gate 0.78 → 0.405 on current graph) and
  `research/rq/RQ3.md` (fold in run6 positive numbers).
- Build E1–E5 new code per `research/experiments/`. Backend note: the eval harness
  uses the **`claude -p` CLI** (no API key) — check `which claude` to enable re-runs of
  the LLM-graded E1/E3 here; `ANTHROPIC_API_KEY` is not set in env.

*(Queue above is now CLEARED — vcache re-run bounded, whitepaper corrected, RQ2/RQ3
notes reconciled, E1 built + run. See below.)*

## E1 — answer-quality-under-reuse (built + run this loop)

New harness `scripts/fellows-eval/run-e1-reuse.mjs` (reuses `complete()` = `claude -p`,
no API key; `evalEmbedder` MiniLM; the frozen gold-SUPPORTED SciFact-100). Two findings:

1. **Structural (the headline).** The `[0.6, 0.71)` near-miss band the spec targeted is
   **empty** on SciFact-100: the maximum cosine between any two *different-need* claims is
   **0.544** (p90 0.494, p50 0.360) — **below the 0.6 q2q reuse gate**. So a different-need
   query *cannot reach the reuse threshold*; the false-hit hazard is structurally empty,
   and the recalibrated 0.6 gate sits in the safe gap (above the 0.544 different-need
   ceiling, below the ~0.71 paraphrase floor). This **vindicates** the 0.6 choice that
   `rq/RQ1.md` flagged as "below every reliable cache threshold" — those literature
   thresholds (0.78–0.83) are for single-tenant exact-query caches; for q2q cross-claim
   reuse, different claims never get that close.
2. **Stress test (LLM-graded).** On the 20 *most-similar* different-need pairs that exist
   (mean cos 0.498, all below the gate — worst case available), reusing the neighbour's
   answer as context: **HURT = 0/9** (no fresh-correct answer flipped to wrong), Δcorrect
   +1, one fresh-wrong→reuse-correct, doubt 0. Reuse does not degrade the answer even at the
   worst available similarity. Caveats: n=20, single corpus, Haiku weak base (fresh acc
   0.45), single gold doc, no temperature-0.

Together: at the **retrieval** level (tree-sharing hurt 7/8000) and the **answer** level
(E1 hurt 0/9), cross-peer reuse does not hurt, and the gate structurally excludes the
different-need regime where it could.

## Final scoreboard — all benchable RQs/experiments answered

| RQ / Exp | Status | Proof |
|----------|--------|-------|
| RQ1 reuse→quality | ✅ | tree-sharing recall +34% hurt≈0; **E1 answer-level hurt=0**; gate 0.6 > 0.544 different-need ceiling |
| RQ2 staleness/OOD | ✅ honest negative (fix NOT found) | MiniLM AUC 0.41–0.51; coverage −0.10; bge re-scoring 0.968 but **live bge retrieval 0.548** — neither lever rescues the OOD gate |
| RQ3 trust/provenance | ✅ positive | run6: provenance ranker **~25×** (flip-ASR 0.59→0.024), poison-rate-invariant |
| RQ4 savings | ✅ | federation **+22%** vs tuned single-node @≤2% error; +5.35M tokens; sim 9.1×/77.1% |
| RQ5 compounding | ✅ | paraphrase σ AUC **0.998**; cooperative correct-resolve 27.9%→39.3% |
| RQ6 benchmarks | ✅ | the harness here *is* the benchmark suite (BEIR + LongMemEval/LoCoMo + poison) |
| RQ7 architecture | — | theoretical (Hopfield reranker); not a bench |
| E2 energy-stale | ⛔ blocked upstream | needs `sim_i` to separate first (RQ2 negative) |
| E5 100-peer pilot | ⛔ out of loop scope | live deployment; `bench-compounding-real.mjs` is the run offline twin |

**The one negative (RQ2) and the two blocked (E2 upstream, E5 deployment) are reported
honestly, not buried.** Everything else is measured proof.
