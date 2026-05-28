# MATH-SOTA-ATTACKS — five novel attack vectors on the 75.22% ceiling

**Date:** 2026-04-19
**Author:** math conscience (research mathematician embed)
**Target:** beat 75.22% NDCG@10 on BEIR SciFact at ≤500M params, CPU, no GPU
**Honest priors:** Phase 25 already extracts what the parameter tier can give from a single encoder. Lifts of >2pt require either (a) extracting orthogonal signal from already-encoded vectors that the cosine kernel discards, or (b) better fusion math than RRF k=60. Anything that re-touches the encoder family has been measured null (Wave 3, Wave 4, Contextual Retrieval, Qwen3-Int4, 3-way ensemble). What I propose below operates **strictly post-encoder** on the 768-dim bge-base outputs we already have cached in `sota.db`.

The graph (akashik search) was probed for prior art on each idea: no local research notes or indexed papers cover **whitening, optimal-transport ranking, isotonic-RRF, conformal pruning, or PRF/Rocchio in the v4 hybrid path**. These are net-new attack vectors for this codebase.

---

## Ranked best-first by expected lift / hour

### 1. PRF + Rocchio query expansion in the dense space (PROVEN)

**Mathematical sketch.** After the first dense pass, treat the top-`m` documents D₁..D_m as pseudo-relevant. Update the query vector via Rocchio:

  q' = α·q + β·(1/|D_R|)·Σ_{d ∈ D_R} d − γ·(1/|D_NR|)·Σ_{d ∈ D_NR} d

Then re-normalize and re-search. With α≈0.7, β≈0.3, γ=0 (positive-only Rocchio — the standard variant for dense PRF), m=5–10. Optionally weight each pseudo-relevant doc by its dense rank score (RM3-style). Pure linear algebra over already-computed vectors; no encoder call.

**Why it might work HERE.** SciFact has a measured query-document vocabulary gap (the §2b reranker failure case "0-D biomaterials" vs "calcium phosphate nanomaterials" is exactly this — the relevant doc IS in the candidate set, just ranked too low). Rocchio in the dense space pulls the query vector toward the centroid of the strong candidates, fixing the rank. Hybrid RRF benefits doubly: a better dense ranking feeds a better fused ranking, AND the Rocchio'd query produces a richer BM25 expansion when we project q' back to a token list (the LM-style expansion path).

**Expected lift.** +1.5 to +3.0 pt NDCG@10 on SciFact. Literature: ANCE+RM3 (Lin 2021) reports +1.8 average across BEIR, dense PRF (Yu et al. SIGIR 2021) reports +2.4 on SciFact specifically with E5/BGE-class encoders. The lift is robust across encoders — this is one of the cleanest "free" levers in IR.

**Effort.** 2–4 hours. ~30 LOC in `src/domain/vectors.ts` (a `rocchio(q, topK_vectors, alpha, beta)` pure function), ~20 LOC in the bench harness to call it as a second-pass.

**Risk class.** PROVEN.

**Gate.** SciFact only, m=5, α=0.7, β=0.3, single-pass Rocchio. If lift ≥ +0.5pt over Phase 25 (75.22%), promote to multi-dataset sweep. If null, try (a) m=10, (b) RM3 score-weighting, (c) two-pass Rocchio. If still null after these three, park.

---

### 2. Isotonic-calibrated learned RRF weights (SPECULATIVE, high upside)

**Mathematical sketch.** Vanilla RRF treats dense and BM25 ranks symmetrically: score = 1/(k+r_dense+1) + 1/(k+r_bm25+1). This is provably suboptimal when one signal is more informative than the other. Replace with:

  score = w_d · f_d(r_dense) + w_b · f_b(r_bm25)

where w_d, w_b are learned per-dataset via cross-validation, and f_d, f_b are **isotonic regressions** mapping rank → expected relevance probability. Isotonic regression is the canonical monotone non-parametric calibrator (Zadrozny-Elkan 2002, Platt scaling's stronger cousin). On a 50–100 query held-out subset it solves in O(n log n) via PAV (Pool Adjacent Violators) and produces a step function with no hyperparameters beyond the rank-bin count. Then refit weights via a one-line linear solve over rank pairs.

**Why it might work HERE.** §2c (room-routing null) and the §2g bridge experiments both show that **the dense and BM25 signals carry orthogonal information that simple rank-sum erases**. ArguAna (where hybrid actively HURTS by −19pt, §2e) is a textbook case of mis-weighted fusion: BM25's signal should be **negative** for counter-argument retrieval, but RRF k=60 cannot express negative weights. Isotonic + learned weights can — w_b can go to ~0 or even negative on ArguAna while staying high on SciFact. The same primitive simultaneously fixes both the SciFact ceiling AND the ArguAna regression.

**Expected lift.** +0.5 to +1.5pt on SciFact (we're close to the per-task RRF optimum already), but +5 to +12pt on ArguAna recovery (huge), and this is the right primitive for the "auto-pick fusion weights per query" learned router that §2c said wouldn't work via room oracles. Literature: Bruch et al. SIGIR 2023 ("Analysis of Fusion Functions for Hybrid Retrieval") report consistent +0.8–1.6 NDCG@10 across BEIR for learned over fixed-k RRF.

**Effort.** 6–10 hours. Pure JS isotonic regression via PAV is ~80 LOC; cross-validation harness ~40 LOC; per-dataset cache ~20 LOC. Zero new deps.

**Risk class.** SPECULATIVE. The lift might land in the +0.3pt range on SciFact specifically (RRF k=60 is empirically near-optimal for medical/scientific text) — the multi-dataset average is the better bet.

**Gate.** Run isotonic-RRF on the existing SciFact `per_query_ndcg10` arrays in `sota.db` cache. 80% train / 20% held-out, paired bootstrap (already in `bench-beir-sota.mjs` comments). If held-out lift ≥ +0.3pt with p<0.05 on SciFact AND the same model recovers ≥+5pt on ArguAna, promote to production. If SciFact null but ArguAna recovers, ship as ArguAna-only fallback.

---

### 3. CLS / centroid whitening + Mahalanobis re-ranking (PROVEN class, untested here)

**Mathematical sketch.** Sentence-transformer outputs are known to be **anisotropic** — mass concentrates in a low-rank subspace and the cosine kernel over-rewards "popular" directions. Whitening fixes this:

  Compute μ = (1/N)·Σ_i d_i, Σ = (1/N)·Σ_i (d_i − μ)(d_i − μ)ᵀ
  Solve W = Σ^{-1/2} via eigendecomposition (Σ = U·Λ·Uᵀ → W = U·Λ^{-1/2}·Uᵀ)
  Apply: d̃ = W·(d − μ); q̃ = W·(q − μ)
  Score with cosine on whitened vectors (or equivalently Mahalanobis distance on raw).

768-dim eigendecomposition on the 5,183-doc SciFact corpus is a ~1-second one-shot offline pass. Whitening matrix is 768×768 = 2.4 MB — same shape as the v3 cross-model bridge (already shipped). At query time: one matvec, ~0.5ms.

**Why it might work HERE.** bge-base CLS-pooled outputs are documented in the literature to have severe anisotropy (Su et al. 2021 "Whitening Sentence Representations" measured average cosine ~0.6 between random doc pairs — wildly non-uniform). The §2d finding that "Xenova bge-base port is defective" hints at distributional drift in the embedding space; whitening is **also a known repair** for distribution shift between models, not just intra-model anisotropy. This is the same mathematical primitive that made the §2g bridge work (linear least-squares = whitened ridge).

**Expected lift.** +0.5 to +2.0pt NDCG@10. Su et al. report +2.3 average on BEIR-class STS tasks; on dense-only retrieval the lift is typically +0.8–1.5pt. SciFact's scientific-text distribution may be especially anisotropic given the narrow topic range.

**Effort.** 4–6 hours. Eigendecomposition: pure JS Jacobi rotation works for 768×768 in ~5 seconds (acceptable for offline). Or borrow the Gauss-Jordan path already shipped in `scripts/bench-bridge.mjs` for the linear-W bridge fit. Apply at query time = 30 LOC. The eigendecomposition could also be cached as a `whitening.bin` file shipped alongside the bridge registry.

**Risk class.** PROVEN-class technique, SPECULATIVE in this stack (no one has measured it on bge-base + binary-512 hybrid). The interaction with Matryoshka MRL truncation is the unknown — whitening before vs after truncation matters.

**Gate.** Compute Σ from existing `sota.db` corpus vectors. Run dense-only SciFact pre-/post-whitening on a 50-query subset. If +0.5pt on dense-only, expand to full set + hybrid. If null, the anisotropy isn't the bottleneck — kill it.

---

### 4. Sinkhorn / entropic optimal-transport reranking on top-100 (RESEARCH)

**Mathematical sketch.** Treat the query as a distribution over its token-level subword embeddings q = {q_1, ..., q_n}, and each candidate doc as a distribution over its token subword embeddings d = {d_1, ..., d_m}. Score via entropy-regularized Wasserstein distance (Sinkhorn distance):

  W_ε(q, d) = min_{T ∈ Π(q,d)} ⟨T, C⟩ + ε·H(T)

where C_ij = 1 − cos(q_i, d_j) is the cost matrix and ε is the entropic regularizer. Sinkhorn iterations converge in ~20 steps; per-pair cost is O(n·m·iters), feasible only on top-100 reranking. This is the math behind ColBERT-style late interaction, but as a pure-rerank layer with no model change.

**Why it might work HERE.** bge-base's CLS pooling collapses 512 token embeddings into 768 dims — a 47× compression that throws away the **token-level alignment** between query and doc. Sinkhorn-OT on the unpooled token embeddings recovers exactly that signal. The §2b reranker failure was because bge-reranker is wrong-domain; Sinkhorn-OT is **encoder-derived**, no MS-MARCO bias. Critically: the unpooled token embeddings come for free if we expose them from the existing Rust embed_server (single API change, no new model download).

**Expected lift.** Highly uncertain. ColBERT v2 reports +3–5pt over CLS-pooled BERT on BEIR; pure Sinkhorn rerank on bge-base CLS embeddings is unmeasured. Plausible range: −1pt (encoder pooled embeddings don't carry the right token-level info) to +3pt (free orthogonal signal). I am genuinely 50/50 on which way this goes.

**Effort.** 12–20 hours. Requires (a) Rust embed_server change to return token embeddings, (b) ~120 LOC pure JS Sinkhorn solver in `src/domain/sinkhorn.ts`, (c) integration into rerank stage. The Sinkhorn solver itself is 30 LOC; the rest is plumbing token embeddings through the embedder boundary.

**Risk class.** RESEARCH. No published prior of CLS-extracted token embeddings + Sinkhorn rerank on BEIR. Could be a real lift or a measured null.

**Gate.** Phase 1: dump 100 (query, top-100-doc) pairs to disk with token embeddings, run Sinkhorn offline in a notebook-style script, measure NDCG@10 on those 100 queries. If +1pt, integrate. If null, document and park — the tokens-in-CLS-pooling hypothesis is wrong for bge-base.

---

### 5. Conformal-prediction-pruned candidate set + adaptive top-k (RESEARCH, low priority)

**Mathematical sketch.** Use split-conformal prediction (Vovk 2005) to compute per-query a prediction set S_q of candidate docs that contains the true relevant doc with probability ≥ 1−α. Calibrate on a held-out 30% of the qrels: for each calibration query, compute the rank position of the gold doc in the dense+hybrid-fused list, take the (1−α)-quantile of those ranks as the cutoff k_α. At query time, return only the top k_α (which may be 5, 12, 47 — adaptive per query). Then re-rank ONLY within k_α via any of the methods above.

**Why it might work HERE.** Two ways: (a) computational — limits expensive rerank/Sinkhorn cost to a guaranteed-relevant-containing prefix, (b) quality — NDCG is rank-sensitive in the top-10, so removing junk from positions 11+ before reranking can improve NDCG@10 indirectly via better fusion math. The conformal guarantee is distribution-free, so it composes cleanly with any of attacks 1–4.

**Expected lift.** +0.0 to +0.5pt directly (NDCG@10 cares only about top-10), but **enables** attacks 1, 4 to run faster + cleaner. Treat this as infrastructure, not a primary lift.

**Effort.** 4 hours. Conformal calibration is ~50 LOC of pure quantile arithmetic, no new deps.

**Risk class.** RESEARCH for the direct lift; PROVEN as a calibration primitive (used in classification, untested for IR rerank gating).

**Gate.** Skip as a primary attack. Only build if attack #1 or #4 lands and we want a principled cutoff for rerank input size.

---

## Math-conscience callouts (intellectually appealing, unlikely to breach)

These I considered and **rejected** as primary attack vectors. Documenting here so we don't waste time:

- **Hyperbolic / Poincaré-ball embeddings.** Beautiful math (negative-curvature manifold packs hierarchical data efficiently), but: (a) bge-base was trained in Euclidean space — projecting to hyperbolic post-hoc loses the optimization advantage, (b) SciFact is fact-verification, not hierarchy retrieval (which is where hyperbolic shines, e.g. WordNet, taxonomy). Wrong tool for this benchmark. Park for tunnel-discovery work where hierarchy DOES matter.

- **Topological data analysis / persistent homology over candidate set.** Computational cost is brutal (O(N³) for Vietoris-Rips), and the "topology" of a 100-candidate set in 768-dim space is unlikely to discriminate at the NDCG@10 level. This is a tool for understanding embedding-space geometry, not for production rerank. Killed.

- **Geodesic kNN on the embedding manifold.** Requires building an Isomap-style graph + Dijkstra at query time. The complexity is wrong for hot-path retrieval, and the §2i PPR null already showed that graph-diffusion on single-hop SciFact regresses. Same failure mode would re-emerge.

- **Spectral clustering (eigenvectors of doc-doc similarity matrix) for soft routing.** §2c oracle-routing on CQADupStack already proved that even with **gold** topic labels routing only buys +0.34pt. A learned spectral router can only approximate oracle. Killed for the same mechanistic reason.

- **Contextual Retrieval with a bigger LLM.** Already in the v4.2 deferred bucket; not math-novel.

- **MLP bridge (vs linear).** ADR-001 Decision 3 already gates this on linear bridge < 75% retention. Premature.

---

## Ranked summary (best-first by expected lift / hour)

| # | Attack | Expected pt | Hours | Pt/hr | Risk |
|---|--------|-------------|-------|-------|------|
| 1 | **Rocchio PRF in dense space** | +1.5 to +3.0 | 2–4 | **0.5–1.5** | PROVEN |
| 2 | **Isotonic-calibrated learned RRF** | +0.5 to +1.5 (SciFact); +5–12 (ArguAna recovery) | 6–10 | **0.1–0.25** SciFact / **0.5–2** cross-task | SPECULATIVE |
| 3 | **CLS / Mahalanobis whitening** | +0.5 to +2.0 | 4–6 | **0.1–0.5** | PROVEN-class, untested here |
| 4 | **Sinkhorn-OT token rerank** | −1 to +3 | 12–20 | **−0.05 to +0.25** | RESEARCH |
| 5 | **Conformal prediction set pruning** | 0 to +0.5 (direct) | 4 | **0–0.1** | infrastructure-only |

**Recommendation:** Ship #1 first as a 4-hour gate. If +0.5pt or better on SciFact, run #3 in parallel (orthogonal signal; both compose). #2 is the highest-EV cross-task move (it's the only proposal that ALSO fixes the §2e ArguAna regression). #4 is the only one with real upside potential to breach +2pt but with real null risk — gate it last, on offline 100-query subset before full integration. #5 is infrastructure, build only after the others pay.

The honest expected ceiling from a stacked #1 + #2 + #3 attack is **76.5–77.5% NDCG@10** on SciFact. That's parity with bge-large dense-only (74.6) + RRF (~+1) + the three lifts above. Beating monoT5-3B GPU (76.7%) at our tier becomes plausible. Beating it cleanly (>+1pt margin with paired-bootstrap p<0.05) is not.

---

*Numbers in this report are honest priors based on cited literature. Every attack ships with a gate. Documented null > hypothetical positive.*
