# Particle-Physics-Inspired Attacks on the 75.22% Retrieval Ceiling

**Author:** experimental-physicist conscience pass, 2026-04-19
**Anchor:** Phase 25 SciFact NDCG@10 = 75.22% (bge-base Rust × searchHybrid × RRF k=60). Round 1 nulled fusion-tuning, dense PRF, LLM contextualization, cross-encoder rerank, PPR, and whitening.
**Constraint:** CPU, JS/WASM, no GPU, re-rank cached `sota.db` top-100 (no re-embedding).
**Graph probe:** folklore `search` returned distance >1.0 on all five core queries — these vectors are net-new to the indexed literature in this stack.

---

## TL;DR ranking (lift / hour, honest)

| # | Attack | Lift (pt, honest) | Hours | Risk |
|---|--------|-------------------|-------|------|
| 1 | **LLM-as-judge qrel audit (instrument upgrade)** | apparent +1 to +5; true ceiling unknown | 6 | PROVEN |
| 2 | **Kalman / sequential-Bayes iterative retrieval** | +0.4 to +1.2 | 10 | SPECULATIVE |
| 3 | **Track reconstruction across encoder layers (multi-layer hit linking)** | +0.3 to +1.0 | 8 | SPECULATIVE |
| 4 | **Profile-likelihood reranking with nuisance profiling** | +0.1 to +0.6 | 7 | RESEARCH |
| 5 | **Maximum-likelihood unfolding for evaluation truth** | metric-only, no production lift | 5 | RESEARCH |
| 6 | **Event vertex finding for set-level scoring** | benchmark-dependent; null on SciFact | 8 | RESEARCH (skip) |

**Fund #1 first.** It is the only attack that addresses an *unmeasured* failure mode (qrel false negatives), cannot regress the production pipeline, and unlocks every downstream lift estimate. #2 is the most genuinely-novel-on-this-stack vector and the highest expected production lift; #3 composes with #2. #4 is mathematically clean but yields tiny lifts at this candidate count. #5 is honest but doesn't ship a feature. #6 is killed by the SciFact qrel structure (1.13 rel/query — there is no "vertex set" to find).

---

## #1 — Blind-analysis qrel audit (LLM-as-judge over top-50)

**Particle-physics analogy.** Blind analysis: in HEP, you commit to a procedure on data with the labels masked, then unmask and compute the result, to prevent unconscious tuning. The retrieval analog is *measurement-instrument calibration*: SciFact has 1.13 relevant docs/query (sparse), human-pooled to depth 100 in 2020. Every benchmark since has assumed the qrels are ground truth. They are not — Thakur et al. 2021 (BEIR appendix), Soboroff 2021, and Arabzadeh et al. SIGIR 2022 all show 15-40% pool-incompleteness on TREC-style sparse-judgment tasks. **Our 75.22% is measured against a known-incomplete instrument.**

**Math sketch.** For each query `q`, take the top-50 docs returned by Phase 25's pipeline and the gold qrel-positive docs. Run an LLM-as-judge classifier (Qwen2.5:3B already present locally — re-use the same checkpoint that nulled at Contextual Retrieval) producing `p̂(rel | q, d) ∈ {0, 1, 2}`. Build an *augmented* qrel set `Q⁺ = Q ∪ {(q, d) : p̂ ≥ 1, d ∈ top50_pipeline}`. Recompute NDCG@10 against both `Q` (apples-to-apples) and `Q⁺` (instrument-corrected). Bootstrap CI on judge agreement vs the original human qrels on the held-out subset; only believe `Q⁺` if judge ↔ human Cohen's κ ≥ 0.6 on the *known* labels.

**Why this is genuinely new.** Round 1 attacked the pipeline. This attacks the *measurement*. None of MATH/PHYSICS/DATA-SCIENCE proposals touched the qrel set. It is also the only proposal that cannot regress production because nothing changes in the serving path.

**Expected lift.** *Apparent* NDCG@10 lift on `Q⁺`: +1 to +5 pt (literature on TREC pool depletion). On the original `Q`: zero by construction. Strategic value: tells us whether 75.22% is the *true* ceiling or just the *measured* ceiling.

**Effort.** 6h. Re-uses cached top-100 + the Qwen2.5:3B already validated. ~80 LOC: judge prompt, agreement-on-known qrels gate, dual NDCG report.

**Risk.** PROVEN methodology, untested in this stack.

**Gate.** Judge ↔ human κ on known qrels ≥ 0.6 on a 50-query calibration. Then publish dual numbers. PASS = κ threshold met AND `Q⁺ \ Q` reveals ≥30 unjudged-relevant in top-50 across 300 queries (signal exists). Note: this changes what we *claim*, not what the gate-baseline 75.22% measures.

**Novelty vs round 1.** Yes — entirely new attack surface (the labels, not the pipeline).

---

## #2 — Kalman filter / sequential-Bayes iterative retrieval

**Particle-physics analogy.** Track reconstruction in a multi-layer detector: start with a prior over the track parameters (initial doc beliefs from BM25 + dense), update sequentially as each layer adds a measurement (each evidence query adds posterior mass), terminate when the covariance shrinks below threshold (convergence). The Kalman filter is the optimal linear sequential Bayesian estimator under Gaussian noise — exactly the setting where each retrieval pass adds an independent noisy observation of the same latent "is this doc relevant" state.

**Math sketch.** Let `xₜ ∈ ℝᴺ` be the latent log-relevance over the top-100 candidate pool at step t. Initialise `x₀ ~ 𝒩(μ₀, Σ₀)` from `μ₀ = z(s_dense) + z(s_bm25)`, `Σ₀ = diag(σ²_init)`. At each step, generate a *follow-up query* `qₜ` derived not from the original q but from the current MAP top-3 docs (extract the highest-IDF noun phrases — pure JS, no LLM). Re-search to get `yₜ = z(score(qₜ, d))`. Kalman update:
```
Kₜ = Σₜ Hᵀ (H Σₜ Hᵀ + R)⁻¹
xₜ₊₁ = xₜ + Kₜ (yₜ − H xₜ)
Σₜ₊₁ = (I − Kₜ H) Σₜ
```
with `H = I` (we observe each doc directly), `R = σ²_obs · I` calibrated from per-query score variance. Terminate at t=3 or when `tr(Σₜ₊₁)/tr(Σₜ) > 0.95` (no more information gain).

**Why this addresses a NEW failure mode.** Round 1 was single-shot. The fundamental limit of single-shot fusion is that *all evidence comes from one query embedding*. The 13.3% whiff queries (BENCH-v2 §1) miss because the query and gold doc share no surface terms AND no embedding-near intermediate. Iterative refinement adds *new* evidence per round — the second pass can find lexical overlap with what was retrieved in round 1, even when the original query couldn't. This is the mechanism behind GAR, RECOMP, and Self-RAG, none of which exist in this stack.

**Expected lift.** **+0.4 to +1.2 pt** NDCG@10. Honest priors: GAR (Mao 2021) reports +1.5 on NQ but degrades on factoid-narrow datasets. SciFact is factoid-narrow → bottom of the range. Calibrated down from the round 1 over-optimism.

**Effort.** 10h: Kalman gain math (40 LOC), follow-up query extraction via tf-idf top-noun (60 LOC), per-query budget enforcement, gate harness.

**Risk.** SPECULATIVE — distinct mechanism from PRF (PRF is one-shot Rocchio in the *vector* space; Kalman is multi-step in the *posterior* space with explicit covariance). The failure mode of Rocchio (drift toward centroid) is mitigated by the Kalman gain shrinking the update when observation noise R is high.

**Gate.** SciFact only, t ∈ {1, 2, 3}. PASS = +0.4pt at any t with no regression at t=1 (proves the math doesn't break the baseline). Bootstrap-paired CI.

**Novelty vs round 1.** Yes — round 1's PRF is `q' = αq + β·mean(D_top)` once; Kalman is a sequential posterior update with covariance, which decides per-doc how much to trust each new observation. PRF cannot represent observation-noise-aware updates; Kalman naturally does.

---

## #3 — Track reconstruction across encoder layers (multi-layer hit linking)

**Particle-physics analogy.** Tracker layers in ATLAS/CMS each register hits; the reconstruction algorithm associates hits across layers into tracks via a Hough transform / combinatorial Kalman. For retrieval: each "layer" = a different *view* of the document (chunk-level embeddings, sentence-level embeddings, BM25 unigrams, BM25 bigrams). A doc is a "true track" if the same doc-id appears as a top-k hit across multiple layers — the *consensus* score is a likelihood, not a sum.

**Math sketch.** For each candidate doc `d` and each view `v`, compute `rᵥ(d) = rank of d in view v` (top-100). Track-likelihood:
```
ℒ(d) = Πᵥ pᵥ(observe | d relevant) · qᵥ(rank=rᵥ | d relevant)
log ℒ(d) = Σᵥ [log pᵥ + log qᵥ(rᵥ)]
```
where `qᵥ(r)` is the empirically-fit power law `qᵥ(r) ∝ r^(-βᵥ)` from held-out qrels per view. Score = `log ℒ`. Crucially, this is *not* RRF — RRF assumes uniform `q(r)`; this fits the per-view rank-relevance distribution from data. Views available zero-cost: dense top-100 (cached), BM25 top-100 (cached), BM25-bigram (cheap re-index of FTS5), per-sentence dense (one-time corpus pass).

**Why this addresses a NEW failure mode.** Round 1's fusion math (RRF, isotonic, Boltzmann) used 2 views (dense, BM25). This uses 4 with rank-distribution-aware combination. The mechanism that MATH-SOTA's isotonic-RRF was supposed to capture but missed: RRF tunes `k`, isotonic tunes per-view `f(r)`, but neither has *cross-view consensus structure* — a doc seen at rank-3 in two views is not the same evidence as rank-3 in one view + rank-50 in another.

**Expected lift.** **+0.3 to +1.0 pt.** Composes with #2 (Kalman provides the prior; track reconstruction provides per-step likelihoods).

**Effort.** 8h. Sentence-level chunking already exists in `src/domain/chunks.ts`; need a per-sentence vec0 column. BM25-bigram is one ALTER + REINDEX. Power-law fit: 1D MLE per view, 10 LOC.

**Risk.** SPECULATIVE. The bigram BM25 view is the lowest-confidence — bigram BM25 on small corpora is noisy. Sentence-level dense is the strongest new view.

**Gate.** Two-view → 4-view ablation. PASS = monotonic lift per added view, ≥+0.3 cross-dataset on the cached benchmarks.

**Novelty vs round 1.** Yes — round 1's fusion was 2-view rank-sum. This is N-view rank-distribution-likelihood. The math reduces to RRF only under uniform q(r) AND independence AND equal view-quality, none of which hold.

---

## #4 — Profile-likelihood reranking with nuisance profiling

**Particle-physics analogy.** Profile likelihood ratio `Λ = sup_{θ̂(μ)} L(μ, θ̂) / sup L`. We have a parameter of interest (`μ = is doc relevant`) and nuisance parameters (`θ = encoder bias for doc length, BM25 noise floor, query specificity`). Standard test statistic: profile out the nuisances, score by `−2 log Λ`. This is the LHC-Higgs discovery procedure (Cowan et al. 2010).

**Math sketch.** Per (q, d): `L(rel, θ | s_dense, s_bm25) = 𝒩(s_dense | μ_d(θ), σ²_dense(θ)) · 𝒩(s_bm25 | μ_b(θ), σ²_bm25(θ))` where `μ_d, σ_d` depend on doc-length and on per-query "difficulty" (variance of dense scores in top-100). Profile by maximizing over `θ` per (q, d); score by `log L(rel=1, θ̂) − log L(rel=0, θ̂)`. The nuisance `θ` is 3-dimensional (doc-length, query-difficulty, bm25-saturation); MLE in closed form (Gaussian).

**Why this addresses a NEW failure mode.** Round 1's calibration (Boltzmann, isotonic) treats per-query variance as independent noise. Profile-LR explicitly *removes* that variance from the test statistic — equivalent to per-query whitening of the score distribution before ranking. The whitening null in round 1 was *embedding* whitening; this is *score* whitening with a likelihood justification.

**Expected lift.** **+0.1 to +0.6 pt.** Honest: this is the kind of math that adds 0.3pt and looks great in a paper but doesn't move the needle. With only 100 candidates and 1.13 rel/query the likelihood is data-starved.

**Effort.** 7h.

**Risk.** RESEARCH. Likely null at this candidate count. Self-call: this is the proposal most at risk of being decorative-physics. Recommend deferring until after #1, #2, #3 ship.

**Gate.** Same as #1; PASS = +0.3pt with bootstrap p<0.05.

**Novelty vs round 1.** Marginal. The math is genuinely different from Boltzmann (likelihood-ratio with nuisance profiling vs softmax temperature) but in practice the score effect is similar. Honest categorization: borderline-decorative.

---

## #5 — Maximum-likelihood unfolding (evaluation-truth instrument)

**Particle-physics analogy.** Given measured spectrum `m` and known detector response matrix `R`, recover the true spectrum `t` via `m = R t`. Direct inversion is unstable; ML unfolding (D'Agostini 1995, Schmitt 2012) is iterative Bayesian unsmearing. Retrieval analog: the qrel-pool sparsity *smears* the true rank-quality distribution. Unfolding gives an estimator of the un-smeared per-query NDCG.

**Math sketch.** Let `t(r) = P(rank r is correct under complete qrels)`, `m(r) = P(rank r is correct under sparse qrels)`. Detector response `R(m | t)` modeled as binomial sampling with depth-100 pool inclusion probability. D'Agostini iterative unfolding: `t̂_{k+1}(r) = Σ_r' P(t=r | m=r', t̂_k) · m(r')`, 5–10 iterations.

**Why include it.** This is the rigorous version of #1's instrument-correction. Where #1 *adds* labels, #5 *re-weights existing labels* to remove the sparsity bias — no LLM needed, fully classical statistics.

**Expected lift.** Zero in production NDCG@10. Provides a corrected metric for which other attacks can be honestly compared.

**Effort.** 5h.

**Risk.** RESEARCH (statistical, not algorithmic). This is correct math but it doesn't ship features.

**Gate.** N/A — methodology contribution, not an attack.

**Novelty vs round 1.** Yes, but in the wrong dimension (measurement, not pipeline).

---

## #6 — Event vertex finding for set-level scoring (SKIP for SciFact)

**Particle-physics analogy.** Vertex finder: identify the (x,y,z) point where multiple tracks converge — the interaction. Retrieval analog: for multi-hop QA, find the smallest doc-set that *jointly* answers. Score sets, not docs.

**Honest verdict.** SciFact qrels avg 1.13 rel/query — there are no vertices to find. ArguAna and HotpotQA-style benchmarks would justify this; SciFact does not. **Skip.** If the v2.1 target benchmark expands to multi-hop, revisit.

---

## Decorative-physics conscience callout

Things I considered and *killed*:
- **Trigger systems / hardware-level filtering** — analog is just top-k pruning; no new operator.
- **Detector-acceptance Monte Carlo for query-difficulty estimation** — pretty math, indistinguishable in effect from per-query softmax temperature (already in PHYSICS-SOTA #2).
- **Look-elsewhere effect / trials factor on rerank** — only matters when reporting *significance*, not when reporting the point estimate. Statistical hygiene, not a lift.
- **Likelihood-ratio anomaly score (Higgs-style)** — would require background-only training data we don't have.
- **Wavelet-based multi-resolution scoring** — fancy name for sentence-window pooling, which is essentially #3 view "sentence-level dense".

---

## Recommended build order

1. **Hour 0–6:** Ship #1 (qrel audit). Tells us the true ceiling.
2. **Hour 6–16:** Ship #2 (Kalman). The novel-mechanism bet.
3. **Hour 16–24:** Ship #3 (multi-view track-reconstruction) only if #2 lands.
4. Skip #4 and #6. #5 only if a journal paper is in scope.

All four shippable variants re-rank from cached `sota.db` — zero re-embedding, full benchmark in <90s per gate.

*— end report —*
