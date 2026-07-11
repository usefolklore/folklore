# Research Agenda — Shared Inference & Compounding Memory

*Working draft. Frames the empirical program; each RQ has a dedicated deep-dive
in `rq/`.*

## The thesis

Centralized LLM inference is bounded by cost, latency, energy, and
infrastructure concentration. Folklore proposes a peer-to-peer layer in which
participants share previously generated, high-quality model outputs through a
federated vector index. When a semantically similar query has already been
answered, the system retrieves and reuses that result as context rather than
starting from scratch or repeating the same remote model call.

The thesis has a *capability* claim (this saves compute / latency / tokens and
improves answers) and a *safety* claim (provenance lets the system stay reliable
and measurable while reusing other peers' inference). The program below tries to
**falsify both**, not defend them.

## The seven research questions

The research statement decomposes into seven empirical questions. Each is stated
with: the question, why it matters, what the repo has already measured, the
hypothesis under test, and the observation that would falsify it.

### RQ1 — When does reuse improve answer quality?

**Q.** Under what query/task/similarity conditions does reusing a prior peer
answer as context *improve* answer quality versus answering fresh?

**Why.** This is the load-bearing capability claim. If reuse only helps when the
query is a near-duplicate, the system is a glorified exact-match cache.

**In-repo evidence.** Inference-tree sharing (peers share `answered question →
verified doc` trees; a new query matches the *answered-question pool* (q2q) and
inherits the verified doc) measured large recall@1 lifts on real BEIR corpora
with `hurt = 0`: NFCorpus 47.1% → 97.7% (+107%), SciFact 46.1% → 98.3% (+113%),
FiQA 34.9% → 94.7% (+171%). Mechanism works because query↔query similarity
(paraphrases ≈ 0.71–0.84) exceeds query↔doc similarity for the same information
need. Caveats already on record: warm-pool / steady-state regime, and the
"verified-tree" premise (the shared answer was actually correct).

**Hypothesis.** Reuse improves quality iff (a) q2q similarity clears a floor that
sits *below* the paraphrase band (~0.6) and *above* the unrelated band (~0.1),
and (b) the reused answer was itself correct. Outside that band reuse is neutral
or harmful.

**Falsifier.** A regime with realistic query streams where reuse shows `hurt > 0`
that the similarity floor cannot remove, or where the lift collapses once the
"verified-tree" premise is relaxed to noisy real correctness labels.

### RQ2 — When does reuse inject stale or misleading context?

**Q.** When does reusing a prior answer introduce *stale* or *misleading*
context, and can the system detect that case before it harms the answer?

**Why.** The mirror image of RQ1. Reuse that silently serves a stale or wrong
prior answer is worse than a cache miss.

**In-repo evidence.** Two findings in tension. (i) The **energy-OOD admission
gate** `−E(q) = −T·logsumexp(simᵢ/T)` separates in- vs out-of-distribution
queries at AUC 0.78 (vs 0.52 for the old composite-satisfaction score), giving
57% true-admit / 0% false-admit at a fitted threshold — i.e. it can refuse to
reuse when the query is OOD. (ii) The **deny-gate calibration** on *real*
queries produced a clean null: AUC 0.52, thresholding alone could not separate
answerable from unanswerable; "answerability ≠ lexical overlap." Freshness is
handled multiplicatively (`φ = FRESH_FLOOR + (1−FRESH_FLOOR)·0.5^(age/7)`), but
its calibration on real traffic is unproven.

**Hypothesis.** Staleness/misleadingness is detectable as an *energy/OOD* signal
plus an *age* signal, but not as a single satisfaction threshold; the right
control is admission (reuse vs re-run), not a post-hoc score.

**Falsifier.** A labeled real-traffic set where the energy gate's 0%-false-admit
property does not hold, or where stale-but-on-distribution answers slip through
because age decay is mis-calibrated.

### RQ3 — How should trust and provenance be handled?

**Q.** How should trust and provenance of reused outputs be handled so a peer can
safely consume another peer's inference — and does cryptographic attribution let
an LLM agent resist poisoned/adversarial reused context?

**Why.** Shared inference is only safe if a consumer can reason about *who*
produced a reused answer and *whether to trust it*.

**In-repo evidence.** The substrate exists and is verified on a live two-peer
wire: per-match Ed25519 attestation, body-covering node attestation on fetch, and
a satisfaction contract emitting per-result trust lines (`signed ✓ by @handle` /
`unsigned` / `unattributed fresh identity`). A single signed, attributed peer hit
moved satisfaction 0.13 → 0.79. The controlled poisoning eval produced a
**disciplined null on the strong claim**: frontier models (Opus 4.8) held
attack-success at ~0 even with a 75% Sybil-majority of colluding poison; the
observed failure mode was *confidence degradation* (verdicts → UNCERTAIN), not
adversary-following; and models refused to manufacture the poison corpus. The
broad notebook (akashik) also documents the literature defenses: embedding
anomaly detection at ingestion, zero-knowledge causal leave-one-out filtering,
chunk-wise perplexity filtering, and EigenTrust-style Sybil-resistant reputation.

**Hypothesis (sharpened).** Provenance's measurable value is not "stop the lie"
(frontier models already resist) but **restore calibrated confidence** for the
weaker agents and gold-absent regimes where the baseline IS vulnerable.

**Falsifier.** Weaker agents / gold-absent regimes where provenance metadata does
*not* recover calibrated confidence relative to a no-provenance baseline.

### RQ4 — How much compute / latency / token is actually saved?

**Q.** How much compute, latency, and token usage does reuse actually save, under
honest accounting?

**Why.** The economic case. Prior internal headline numbers were *simulator*
numbers (e.g. a 9.1× compounding figure, explicitly labelled) and a federation
web-fallback decay that was partly a property of the cache model, not a
discovery.

**In-repo evidence.** Real-geometry compounding sim: cooperative correct-resolve
49.0% vs isolated 31.5% (+17.5 pts), +5.44M tokens reused, false-admit 1.0%. The
honest framing already adopted: this is *federated semantic-cache reuse*, not
cold-retrieval SOTA; numbers are bounded by retrieval precision; simulator ≠
pilot.

**Hypothesis.** Net savings are real but bounded by (retrieval precision × reuse
hit-rate × verification cost), and only positive once the cost of *checking* a
reused answer is below the cost of regenerating it.

**Falsifier.** A measured (not simulated) workload where the verification +
retrieval overhead erases the regeneration saving.

### RQ5 — Does shared inference compound knowledge across users, reliably and measurably?

**Q.** Can distributed memory and shared inference traces let reasoning systems
*compound* knowledge across users while remaining reliable and measurable?

**Why.** The big claim — the reason the system is P2P rather than a personal
cache.

**In-repo evidence.** A four-link evidence chain — boolean → graded → real-σ
(AUC 0.999, σ ≈ 0.033 for paraphrase vs spurious separation) → real-geometry —
shows both knowledge and LLM-inference compounding with false-admit ~0–1%,
churn-robust via CRDT replication. But the strongest evidence (a 100-peer,
30-day real-traffic pilot) is still ahead; pre-pilot this is "promising thesis +
solid infra," not "validated."

**Hypothesis.** Compounding is real and is mathematically a *monotone submodular
coverage* process (diminishing returns, `(1−1/e)` greedy bound), not unbounded
growth; the reliability bound is retrieval precision, not network size.

**Falsifier.** A real multi-user deployment where added peers do not raise
correct-resolve rate beyond the single-peer baseline, or where compounding comes
with a rising false-admit tail.

### RQ6 — What rigorous benchmarks and data test these assumptions?

**Q.** What benchmarks, datasets, and metrics rigorously test RQ1–RQ5 rather than
assuming them?

**Why.** The stated *immediate* research challenge: build rigorous benchmarks,
collect data, test assumptions.

**In-repo evidence.** BEIR SciFact / NFCorpus / FiQA (real dense retrieval over
MiniLM + sqlite-vec); a `recall_any@k` metric; real LongMemEval / LoCoMo
adapters (reported to beat agentmemory); vCache (arXiv:2502.03771) named as the
A/B baseline; GPTCache as prior art. Metric discipline already adopted:
attributable-ASR (clean-correct → poison-flip), recall@1 vs qrels not vs the
gate, simulator-vs-measured labelling.

**Hypothesis.** No single existing benchmark captures *cross-peer demand-shaped
reuse*; the right harness composes retrieval benchmarks (BEIR), long-horizon
memory benchmarks (LongMemEval/LoCoMo), and a poison track, with reuse hit-rate
and verification cost as first-class measured quantities.

**Falsifier.** An existing public benchmark already measures cross-peer reuse
quality + savings + trust jointly (i.e. the gap is illusory).

### RQ7 — What retrieval architectures / long-context designs fit this setting? (longer-term)

**Q.** What retrieval architectures and long-context model designs are optimal
for shared-inference reuse?

**Why.** The stated longer-term goal. Out of scope for the immediate empirical
sprint but shapes which assumptions are worth testing now.

**In-repo evidence.** The reranker is already one modern-Hopfield step
(`softmax(β·XᵀΞ)` = attention); PPR + EigenTrust + cache eviction read as
energy-descent fixed points. Open problem on record: a distributed Hopfield
capacity theorem (how much shared memory the network can hold before retrieval
degrades).

**Hypothesis.** Long-context models that can *ingest provenance-tagged retrieved
context as first-class evidence* (not anonymous tokens) will out-calibrate models
that cannot — connecting RQ3 to architecture.

**Falsifier.** Provenance-aware context ingestion shows no calibration benefit at
scale.

## Cross-cutting commitments

- **Falsify-your-own-thesis.** Every RQ has an explicit falsifier; a clean null
  is reported as a result, with the instrumentation that shows *why*.
- **Simulator vs measured** is labelled on every number.
- **Memory-first.** Notebooks + Folklore graph consulted before web.
- **The pilot is the only calendar-bound piece** (RQ5) — everything else is
  bench-able offline.
