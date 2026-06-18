# Folklore critique — synthesis across four lenses

_2026-06-18. Consolidates four independent adversarial reviews —
[dev](dev.md), [user](user.md), [cost](cost.md), [qos](qos.md) — each grounded in
the repo at `main`. This note pulls out where they AGREE (the signal) and turns it
into a prioritized fix list. The individual docs hold the file:line evidence._

## The one finding all four lenses land on

**The deny gate is inert on real traffic, so the entire value proposition is
currently aspirational.** Every lens reached this independently:

- **dev:** the shipped `use_memory` predicate needs `score ≥ 0.85` AND ≥4/5
  components observed; a solo local graph rarely meets it. Live measurement:
  22.9% grounded, **0.0% web deflection**.
- **user:** "never research the same thing twice" doesn't trigger today; real
  week-one value is the PostToolUse auto-save + local cache, not the gate.
- **cost:** the gate is the ONLY mechanism that physically saves money, and it
  fires zero times on real queries → realized cost reduction ≈ 0.
- **qos:** mechanistically *why* — the relevance multiplier caps the score in
  `[0.3, 1]`, so a correct hit at d≈0.95 ceilings ~0.43; 0.85 is unreachable.
  The gate is safe **only because it is inert**; lowering the threshold without
  fixing the scorer exposes the costly false-accept.

So the headline ("peer-to-peer compounding inference") is sound as a thesis and
well-engineered in its parts (retrieval is genuinely benched at 72–75% NDCG@10),
but the deflection loop that delivers the value is not closed on real data. The
honest current product is *a provenance-signed local research cache with auto-save*
— which is worth shipping as exactly that while the gate is fixed.

## Headline economics are simulator/model, not field data (cost + dev + user)

The 9.13×-cheaper / 77.1%-token / 17%→1%-fallback numbers are simulator output and
partly true by construction (64 peers × 200 slots saturate a 5,000-topic catalog
with zero churn; at the realistic P=1 case cooperative = isolated = 18.4%). The
cost lens also found **double-counting**: "9.1× fewer trips" and "77% fewer tokens"
are two projections of the same avoided fetch via one hard-coded 8000/1200 ratio,
and counter-costs (per-call prefetch, per-fetch embedding, storage, P2P transfer)
are unaccounted. → Keep these clearly labelled simulator/model everywhere (the docs
mostly do); do NOT let them migrate into product copy as realized results.

## Concrete bugs / hazards (with owners)

1. **Score is mis-scaled, not just mis-thresholded (qos, CRITICAL).** Settle it with
   a labeled real-query AUC: high-AUC-but-low-mode → re-derive the threshold;
   AUC≈0.5 → fix the scorer. → the real-query harness (`bench-deny-real`) + the
   recalibration work decide this. Method grounded in `docs/research/deny-gate-calibration.md`.
2. **Silent failure is the dominant operational risk (dev, MAJOR).** Every hook
   swallows errors → exit 0; commit `1f53b25` proved all four no-op'd for who-knows-
   how-long. → a loud-failing `folklore doctor` health line + a hook error log.
3. **Graph↔vector two-store drift (dev, MAJOR).** Separate write paths, no cross-
   store transaction; ~9% of nodes lacked a vector, and 27% of vectors were orphans
   (just GC'd via `prune-vectors`). → a `reconcile` job + run it in `doctor`.
4. **`COVERAGE_WEIGHT=0.6` substring coverage backfires (qos, HIGH).** `includes()`
   is token-boundary-blind, rewards lexically-overlapping-wrong hits, penalizes
   correct paraphrases — and outweighs proximity. → token-set overlap + sweep the
   weight (answerability ≠ lexical similarity; see RAGuard ZKIP in the litreview).
5. **Staleness is cosmetic (qos + user, HIGH).** `age_days` feeds the trust base but
   NOT the multiplicative relevance gate, so a perfect-but-ancient hit still scores
   high; and three windows coexist — **7d** (CLAUDE.md) / **14d** (`peer-telemetry.ts`
   `stale_after_days ?? 14`) / **30d** (reputation). → wire age into the gate; unify
   the constant.
6. **Privacy is opt-out per node (user, HIGH).** Secret protection is pattern-only
   (14 patterns); a redaction miss is unrecoverable once a peer syncs. → opt-in
   sharing (per-workspace), and treat the pattern list as defense-in-depth not a gate.
7. **Validation rests on a tiny synthetic fixture (qos + cost + user).**
   `bench-deny-validate`'s 84%/3%→SHIP tests the *score-only* gate that does NOT ship,
   on 12–59 synthetic nodes that disagree ~2× with in-corpus numbers. → the real
   harness with a Wilson CI replaces it as the calibration oracle.

## Prioritized fix list (what to do next)

1. **Close the gate loop on real data** — harness AUC → either re-derive
   `CONTRACT_THRESHOLDS` empirically (start-strict-step-down, cost-asymmetric) or
   fix the scorer (token-set coverage, age-in-gate). This is the single highest-
   leverage fix; it converts the whole thesis from aspirational to realized.
2. **Make failure loud** — `folklore doctor` surfaces dead hooks, store drift,
   orphan rate, embedder/sidecar availability. Silent-success is the enemy.
3. **Ship the honest framing now** — "signed local research cache + auto-save,"
   federation/deny opt-in, until the field deflection curve is non-zero.
4. **Generate ground truth** — the shadow-search auto-judge (RFC-0003 OQ#5,
   "skeptical judge") to label good/bad skips → feeds `learnWeights` + a learned
   threshold, replacing every hand-set constant.

## What holds up

Retrieval quality (72–75% NDCG@10 hybrid) is genuinely well-benched. The relevance-
gate *design* (trust × relevance, shallow-evidence demotion, risk overlay) is sound
in intent — it just needs calibration against real data and the coverage component
repaired. The provenance/signature path and auto-save are real, shippable value
today. The thesis is defensible; the work is closing the measurement-to-mechanism gap.
