# Deny-gate calibration — literature synthesis (NotebookLM, "Akashik Research")

_2026-06-18. Grounded research to inform the deny-gate recalibration (night-queue
#2 contract thresholds + #6 relevance-gate re-tune). Sources are user-uploaded
papers/articles in the NotebookLM "Akashik Research" notebook; treat AI-synthesized
citations as untrusted and verify before relying. This note records the prior art
and the recommended approach — the empirical numbers come from
`docs/protocol/DENY-CALIBRATION-REAL.md` (the real-query harness)._

## The problem (from the QoS/cost/user/dev critiques)

The shipped deny gate fires on `satisfaction ≥ 0.85 AND ≥2 hits AND agent chose
use_memory`. On the real (post-orphan-GC) graph, satisfaction is **compressed**:
even a correct in-corpus hit ceilings around **0.43–0.57** because the relevance
multiplier caps the score in `[REL_FLOOR=0.3, 1]`. So 0.85 is **mathematically
unreachable** → live web-deflection measured at **0.0%**. The 0.85 constant was
set against a different score scaling/embedder. The gate is currently safe only
because it is inert; lowering the threshold naively would expose the costly error
(false-accept: trusting wrong/stale cache).

## What the literature favors

**Threshold derivation — option (B), empirical, not (A) probabilistic recalibration.**
The notebook sources do not use Platt scaling / isotonic regression. They favor
re-deriving the operating point from the collection's own score distribution:

- **Baseline the distribution first, then set the cut.** Raji (RAG Poisoning):
  static thresholds are "a guess"; baseline the normal similarity distribution and
  set the threshold at **mean + 2σ**. Plot the histogram (Spheron): a healthy
  corpus is bimodal — near-duplicates cluster high, unrelated queries low, with a
  "dangerous zone" between where queries are topically related but semantically
  distinct. The cut belongs above that zone.
- **Cost-asymmetric operating point (false-accept ≫ false-abstain).** Standard
  practice: **start strict and step down.** Begin at a restrictive threshold,
  monitor the empirical false-positive rate over a window, and only lower in tight
  0.01 increments while the false-positive rate stays acceptable. For high-update
  collections, tune the threshold *upward* to avoid serving superseded facts.
- **Staleness → TTL matched to volatility.** Short TTL (minutes) for volatile data,
  longer for stable; for disastrous-if-stale data, don't cache. (Maps to our
  freshness rule — which the QoS critic found is cosmetic: `age_days` feeds the
  trust base but NOT the multiplicative relevance gate, and three windows coexist
  — 7d doc / 14d scorer / 30d reputation.)

**Answerability ≠ lexical similarity.** Directly attacks our `COVERAGE_WEIGHT=0.6`
substring-coverage component (which rewards lexically-overlapping-but-wrong hits and
penalizes correct paraphrases):

- **Causal leave-one-out influence (RAGuard ZKIP).** Don't trust a retrieved doc on
  cosine alone; measure its *causal effect* on the answer — answer stability
  (cosine between full vs leave-one-out answer) and entropy differential. Abstain
  when the combined anomaly score exceeds τ. Label-free, attack-agnostic.
- **Cue-trigger disconnect + constraint-consistency (Locomo-Plus).** Evaluate
  whether the model *applied* the retrieved concept, not whether strings overlapped;
  construct test queries with low surface similarity to the cue on purpose.
- **Structure/temporal validity (SAT-Graph RAG).** PPR + MDL edge selection +
  temporal-proximity decay to surface only topologically/temporally valid answers,
  not merely similar ones.

**Selective prediction / abstention.** The "Skeptical Judge" refusal metric
(Locomo-Plus) — score a system correct when it *refuses* or flags a conflict rather
than hallucinating — is exactly the **shadow-search auto-judge** (RFC-0003 OQ#5):
run the search anyway, label the skip good/bad. That is the ground-truth generator a
learned threshold needs.

## Recommended approach (contingent on the harness AUC)

1. **Measure first.** `bench-deny-real` produces the real in-corpus vs out-of-corpus
   satisfaction distribution + AUC. This is the tiebreaker.
2. **If the bands separate (high AUC, low overlap):** it's a *thresholding* fix.
   Re-derive `CONTRACT_THRESHOLDS.use_memory` (and the deny threshold) empirically
   from the real distribution — the separation point / out-of-corpus mean + 2σ —
   biased strict for the cost asymmetry. Do NOT keep 0.85.
3. **If the bands do NOT separate (AUC ≈ 0.5):** the *scorer* is broken, not the
   threshold. Then fix the components the QoS critic flagged: replace substring
   coverage with token-set overlap and re-sweep `COVERAGE_WEIGHT`; wire `age_days`
   into the relevance gate multiplicatively; unify the staleness window.
4. **Longer term:** a shadow auto-judge (skeptical-judge style) to generate labeled
   good/bad-skip outcomes → learned weights / learned threshold, instead of any
   hand-set constant.

## Caveats

- The semantic-caching sources assume a *raw cosine* in [0,1] (bimodal at 0.95/0.85);
  our satisfaction is a *composite* compressed to [0.3,1], so their absolute numbers
  (0.92, 0.85) do NOT transfer — only the *method* (baseline-then-cut, start-strict)
  transfers. The cut must come from our own distribution.
- NotebookLM answers are Gemini-synthesized over a curated source set; the strongest
  cited primary sources (RAGuard, Locomo-Plus, SAT-Graph RAG, PoisonedRAG) should be
  read directly before any are cited in product/whitepaper claims.
