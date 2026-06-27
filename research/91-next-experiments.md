# Next Experiments — rigorous benchmarks & data

The capability and safety claims rest on five assumptions the repo has so far
probed mostly *in simulation* or via *retrieval proxies*. The job is to test them,
not assume them. In priority order, the still-untested ones:

1. **(RQ1)** That reuse improves **end-to-end answer quality** — not retrieval
   `recall@1` — inside the `[0.6, 0.71)` no-man's-land the recalibrated 0.6 gate
   admits. This attacks Folklore's own headline.
2. **(RQ2)** That the energy/OOD gate protects against *on-distribution-but-stale*
   hits, not only OOD ones; and that the freshness multiplier is calibrated on real
   traffic rather than fitted to `0.5^(age/7)`.
3. **(RQ3)** That provenance restores **calibration** where the consumer is
   *actually* weak (Haiku/7B-class), not only where a frontier model already resists.
4. **(RQ4)** That net token/latency/compute savings survive honest accounting of
   retrieval **+ verification** overhead against regeneration cost.
5. **(RQ5)** That compounding stays *reliable* across a real, churning population.

E1–E4 are offline-benchable now; E5 is the only calendar-bound piece.

---

## E1 — Answer-quality-under-reuse in the `[0.6, 0.71)` band *(RQ1, highest)*

**Hypothesis.** End-to-end answer correctness under reuse degrades inside
`[0.6, 0.71)` — the band between the shipped gate (0.6) and the paraphrase floor
(~0.71) — because that is where q2q cosine is high enough to *fire* but the
information *need* genuinely differs. Folklore's measured `hurt = 0` was scored on
**retrieval `recall@1` over BEIR**, which can read ~97% while answers silently
regress; the falsifier lives downstream of retrieval.

**Dataset.** Reuse the BEIR wiring in `bench/` (SciFact, NFCorpus, FiQA over
MiniLM + sqlite-vec). Construct query *pairs*: (a) a matched-need paraphrase set
(cosine ~0.71–0.84), and (b) a hard **near-miss** set — different-need pairs binned
into `[0.6, 0.71)`. Each query carries its gold qrel so answers are scored against
ground truth, not the cache.

**Independent variable.** Gate policy at fixed encoder: `static-0.6` vs
`static-0.8` (the GPT-Semantic-Cache / MeanCache reliable band) vs **vCache**
(arXiv:2502.03771) per-prompt learned threshold at a user-set `Pr(correct) ≥ 1−δ`,
δ ∈ {1%, 2%, 3%}. Run all three through the existing vCache A/B harness.

**Dependent variable.** **End-to-end answer correctness** (LLM-graded against the
gold qrel answer, plus EM/`BERTScore` where extractive), partitioned by q2q-cosine
bin. Secondary: hit-rate, so we can read the hit-rate↔correctness trade.

**Baseline.** Answer-fresh (no reuse) on the identical query stream — the only
honest reference for "did reuse help or hurt the *answer*."

**Metric.** `Δcorrect = correct(reuse) − correct(fresh)` per cosine bin, with
`hurt = fraction of queries where reuse flips correct→incorrect`.

**Falsifier.** If `hurt > 0` in `[0.6, 0.71)` beyond tolerance once answers (not
recall) are scored, the 0.6 gate is falsified and must rise toward 0.78–0.83 or go
per-prompt (vCache). If vCache holds `hurt ≤ δ` where static-0.6 does not, the
fix is the learned threshold, not the constant.

## E2 — Does the energy/OOD gate protect against on-distribution-but-STALE hits? *(RQ2)*

**Hypothesis.** The energy gate `−E(q) = −T·logsumexp(simᵢ/T)` separates *OOD*
from in-distribution (measured AUC 0.78 on a constructed split; real-query
deny-calibration was a clean null at AUC 0.52). It does **not** separate
on-distribution-but-stale: a hit semantically near the query, admitted with high
confidence, yet factually outdated. ReDeEP predicts such hits are *over-trusted*.

**Variables.** Independent: ground-truth **staleness/correctness** of admitted
hits (knowledge-update items from LongMemEval / LoCoMo adapters supply
time-stamped fact revisions). Dependent: **downstream answer error**, bucketed by
the gate's admission confidence and by `age_days`. Second sweep: the freshness
multiplier `φ = FRESH_FLOOR + (1−FRESH_FLOOR)·0.5^(age/7)` — fit `FRESH_FLOOR` and
the half-life to *real* error-by-age, replacing the assumed 7-day window.

**Baseline.** Reject-all-stale oracle (upper bound) and admit-all (lower bound),
bracketing what the gate buys.

**Metric.** Error-rate-by-admission-confidence curve; calibration of `age_days` →
`P(stale-wrong)`; ECE of the freshness-adjusted score.

**Falsifier.** If admitted high-confidence stale hits carry the **same or higher**
error than rejected ones — a **flat error-by-confidence curve** — the gate gives
zero protection against the failure RQ2 names, and an uncalibrated freshness
multiplier is the only (untested) line of defense.

## E3 — Provenance value on WEAKER agents *(RQ3)*

**Hypothesis.** Folklore's poison null (Opus 4.8 held attack-success ~0 under a
75% Sybil-majority on SciFact) measured frontier robustness, not provenance value.
The signed trust lines (`signed ✓ by @handle` / `unsigned` /
`unattributed fresh identity`) buy **calibration** precisely where the baseline is
vulnerable — a weak consumer.

**Variables.** Independent: consumer model (Haiku / 7B-class) × trust lines
{present, ablated}, holding the 75%-Sybil SciFact poison corpus fixed (embedded
injections + laundered citations). Dependent: **attributable-ASR**
(clean-correct → poison-flip) **and calibration** (confidence vs correctness; ECE,
and verdict-distribution shift toward UNCERTAIN).

**Baseline.** Same weak model, same poison, **no** provenance metadata.

**Metric.** ΔASR and ΔECE (trust-lines − no-trust-lines) on the weak consumer;
report both, since the frontier result showed accuracy and calibration can move
independently.

**Falsifier.** If the weak model's ASR and calibration are **unchanged** by the
trust lines (it follows the poison majority regardless), attribution carries no
measurable defensive value and the sharpened RQ3 hypothesis dies. Structural
second falsifier: if aged/laundered identities forge attribution+history cheaply
(EigenTrust's >40%-Sybil boundary), the substrate collapses.

## E4 — MEASURED (not simulated) reuse savings *(RQ4)*

**Hypothesis.** Net savings are real but bounded by
`per_hit_speedup × hit_rate × (1 − error_cost)` and turn positive only once the
cost of *checking* a reused answer is below the cost of regenerating it. The
in-repo +17.5 pts / +5.44M-tokens / 1.0%-false-admit figures are a
**corpus-simulator** result (`bench-compounding-real.mjs` / `-graded.mjs`), not a
wall-clock or token saving.

**Variables.** Independent: isolated vs cooperative, each node holding a
**vCache-tuned** local cache at a fixed 1% error guarantee. Dependent:
**net tokens, latency, and compute** measured end-to-end — regeneration cost minus
(retrieval + verification) overhead. Real workload (BEIR + LongMemEval streams),
not a boolean peer-holds-doc abstraction.

**Baseline.** Single-node vCache-tuned semantic cache at matched 1% false-admit —
the number the literature already reports.

**Metric.** Net token/latency/$ delta per resolved query; federation premium =
cooperative − isolated at matched error.

**Falsifier.** If cooperative does not beat a well-tuned isolated node by a
meaningful margin once verification is priced in — or if matching 1% false-admit
forces the federated hit-rate down to the isolated level — the federation premium
is a simulator artifact and **overhead erases the saving**.

## E5 — Compounding at scale: the 100-peer, 30-day pilot *(RQ5)*

**Hypothesis.** Compounding is a *monotone submodular coverage* process —
diminishing returns, `(1−1/e)` greedy bound — reliable because retrieval precision,
not network size, bounds it.

**What only the pilot measures.** The simulator (`bench-memtool-federation.py`,
self-labelled SIMULATOR) reports cache hit-rate that is monotone-up *by
construction* (~90%@64 peers vs ~18% alone) and therefore **cannot** exhibit
capacity collapse. The pilot uniquely measures: the **real web_fallback curve**
under organic demand; **real churn** against CRDT replication; and the **real
false-admit tail** as the graph grows — calibrated against the measured
real-geometry baseline (energy-gate AUC 0.78; SciFact false-admit ≤15%), *not* the
≤1% simulator bound.

**Variables.** Independent: cumulative shared-node count per user over 30 days.
Dependent: net task-quality lift; false-admit rate; web_fallback fraction.

**Baseline.** Single-peer (no federation) on the same user's stream.

**Metric.** Lift-vs-cumulative-shared-nodes curve, per user, with the false-admit
tail tracked alongside.

**Falsifier.** A **linear/non-saturating** curve refutes the submodular model; a
**flat-or-negative** curve (recall up, precision down, false-admits drifting toward
the ≤15% SciFact bound) refutes *reliable* compounding.

---


## Offline-benchable NOW vs blocked

| Exp | Status | Harness reused | Blocked on |
|-----|--------|----------------|------------|
| **E1** | **NOW** | BEIR `bench/` + vCache A/B + answer-grading | Build the `[0.6,0.71)` different-need pair set; add an answer-correctness scorer (currently `recall@1`). |
| **E2** | **NOW** | `energy-gate.ts` + LongMemEval/LoCoMo knowledge-update adapters | Need time-stamped staleness labels; fit `φ` on real age→error. |
| **E3** | **NOW** | SciFact 75%-Sybil poison eval + signed trust lines | Swap consumer to Haiku/7B; add calibration (ECE) instrumentation. |
| **E4** | **Partial** | `bench-compounding-real.mjs` + vCache | Replace boolean peer-holds-doc with real per-peer retrieval; add wall-clock/token meters + verification-cost accounting. |
| **E5** | **BLOCKED** | `bench-memtool-federation.py` (sim only) | Calendar-bound: live 100-peer / 30-day deployment, real churn + demand. |

Discipline throughout: every number labelled **simulator vs measured**; answers
scored against **gold qrels**, never the cache gate; no simulator figure is
promoted to a deployment claim.
