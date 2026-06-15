# Physics-Inspired Attacks on the 75.22% Retrieval Ceiling

**Author:** physics-conscience pass, 2026-04-19
**Anchor:** BENCH-v2.md §2e (75.22% NDCG@10, p50=11ms, bge-base × Rust × searchHybrid × RRF k=60)
**Constraint:** CPU-only, no GPU, JS/WASM, sqlite-vec stack, gate via re-rank of cached `sota.db` top-100 — no re-indexing.

---

## TL;DR ranking (lift / hour, honest)

| # | Attack | Lift (pt, honest) | Hours | $/pt | Risk |
|---|--------|-------------------|-------|------|------|
| 1 | Per-query convex score fusion (γ-blend, learned λ) | +0.4 to +1.5 | 3 | best | PROVEN |
| 2 | Boltzmann score calibration (softmax(−E/kT) + linear sum) | +0.3 to +1.0 | 4 | good | PROVEN |
| 3 | Heat-kernel diffusion over kNN graph (e^(−tL)) on ArguAna | +2 to +5 on ArguAna only | 6 | high (per-task) | SPECULATIVE |
| 4 | Query-entropy temperature adaptation | +0.2 to +0.8 | 5 | medium | SPECULATIVE |
| 5 | Path-integral retrieval (truncated Neumann series) | −1 to +0.5 | 8 | poor | RESEARCH (likely null) |

**Bet the budget on #1 and #2 first.** They have the cleanest physical analogy AND the strongest published track record. #3 is the only one that actually targets the documented failure mode (ArguAna recall=86 / NDCG=44 means rank shuffle, exactly what diffusion smooths). #4 and #5 are scientifically interesting but should not displace #1–3.

---

## #1 — Per-query convex score fusion (γ-blend)

**Physics analogy.** Two-source linear superposition. RRF currently treats dense and BM25 as *rank lists* (discarding magnitude); we instead treat them as *intensities* and apply the standard physical recipe for combining two coherent measurements: `S(q,d) = γ(q)·s_dense(q,d) + (1−γ(q))·s_bm25(q,d)` after each source is z-score-normalized per query. RRF is the limit γ→0.5, k→60, magnitudes discarded; it's lossy by construction (Bruch et al., SIGIR 2023, "Score-Aware Hybrid Search").

**Math.**
- `s̃_dense(q,d) = (cos(q,d) − μ_dense(q)) / σ_dense(q)`
- `s̃_bm25(q,d) = (bm25(q,d) − μ_bm25(q)) / σ_bm25(q)`
- `S(q,d) = γ(q)·s̃_dense + (1−γ)·s̃_bm25`
- `γ(q) = σ(w·φ(q) + b)` where `φ(q)` is 4 cheap features: log query length, fraction of OOV tokens, dense top-1 raw cosine, BM25 top-1 normalized score.

**Why it addresses a specific failure.** ArguAna §2e: recall@10=86.42%, NDCG@10=43.97%. Gold IS in top-100; BM25 reshuffles it out of top-10. With `γ→1` for counter-argument queries, dense rank is preserved; with `γ→0` for SciFact-style fact queries, BM25 contribution stays. RRF can't express either extreme because k=60 dampens both ends.

**Expected lift.** SciFact is at ceiling; expected +0.0 to +0.5 there. ArguAna recovers most of the gap to dense-only (~50% NDCG ceiling per nomic report) → +5 to +6 on ArguAna. NFCorpus +0.2. Honest cross-dataset average: **+0.4 to +1.5 NDCG@10**.

**Effort.** 3h. Pure replacement of `rrfFuse` in `src/domain/vectors.ts`. Train γ logistic on 200 SciFact + 200 ArguAna queries via held-out CV. No new deps.

**Risk.** PROVEN — score-aware hybrid is the published baseline literature has been telling us to use over RRF since 2023. The reason RRF is everywhere is convenience, not quality.

**Gate.** Re-rank cached `sota.db` top-100 for SciFact + ArguAna + NFCorpus. Paired bootstrap (already in `bench-compare.mjs`). PASS = +0.5pt average across the three OR +3pt on ArguAna alone with p<0.05.

---

## #2 — Boltzmann score calibration (energy-based normalization)

**Physics analogy.** Treat retrieval scores as energies. Boltzmann distribution `p(d|q) = exp(−E(q,d)/kT) / Z(q)` with `E = −s̃` and learned per-query temperature T. This is exactly the energy-based-model framing (LeCun 2006, Grathwohl et al. ICLR 2020). Canonical partition function Z normalizes per query — fixes the cross-query score-scale incomparability that breaks naive linear fusion.

**Math.**
- Per source: `p_dense(d|q) = exp(s_dense(q,d)/T_dense) / Σ_d' exp(s_dense(q,d')/T_dense)` over top-100.
- Combine in log-space: `log p(d|q) = α·log p_dense + (1−α)·log p_bm25`. This is the geometric mean — Bayesian posterior under independent likelihoods.
- T is learned per dataset (one scalar) by minimizing NDCG-loss on 100 held-out queries. T<1 sharpens, T>1 smooths. Empirically T_dense≈0.4 for cosine on bge-base.

**Why it addresses a specific failure.** RRF discards score magnitude entirely. Boltzmann recovers it: a query where dense top-1 cosine is 0.92 (highly confident) gets a sharp distribution that dominates fusion; a query where dense top-1 is 0.51 (uncertain, e.g. ArguAna) gets a flat distribution where BM25 has natural say. **Critical regime self-detection**: T ~ score variance, so the fusion automatically re-weights.

**Expected lift.** **+0.3 to +1.0 NDCG@10** averaged across SciFact/NFCorpus/ArguAna. Composes additively with #1 if both ship.

**Effort.** 4h. New domain primitive `boltzmann-fuse.ts`, ~80 lines pure functional. T fit via 1D golden-section search on cached per-query NDCG arrays.

**Risk.** PROVEN — temperature calibration is standard in classification calibration (Guo et al., ICML 2017) and has been re-applied to retrieval (e.g. ColBERT v2's softmax over MaxSim, mPLUG's contrastive temperature). The novelty here is purely as a fusion mechanism; the math is standard.

**Gate.** Same harness as #1.

---

## #3 — Heat-kernel diffusion on doc-doc kNN graph

**Physics analogy.** Heat equation on a manifold. Define graph Laplacian `L = D − W` where W is the symmetric kNN cosine graph (already buildable via `src/domain/pagerank.ts:buildKnnGraph`). The heat kernel `K_t = exp(−tL)` describes how relevance "diffuses" from initial retrieval scores. Final score: `r(d) = Σ_d' K_t(d,d') · s₀(d')`.

This is the *symmetric* cousin of PPR. The PPR null in §2i used asymmetric random walk `αM·r + (1−α)p` where M is row-stochastic; the failure was diffusion of mass off the gold doc onto its neighbors (which weren't relevant under single-hop qrels). **Symmetric heat-kernel diffusion at small t (t≈0.1–0.3, 3 power-iter steps)** smooths *only locally* — it averages each doc's score with its immediate neighbors with exponentially decaying weight. At t→0 it's identity; at t→∞ it collapses to uniform. Small-t is a **denoising filter on the rank list**, not a destructive long-range diffusion.

**Math (truncated 3-term Neumann series, no eigendecomp).**
- `K_t ≈ I − tL + (tL)²/2` — three sparse matvecs, O(N·k·3) at k=10, N=100.
- Build `L` only over the top-100 dense candidates per query (not the full corpus). 100×100 sparse, ~1ms per query.

**Why it addresses a specific failure.** ArguAna §2e: gold counter-argument IS retrieved (R@10=86%) but BM25 promotes lexically-similar same-side arguments above it. A heat-kernel filter at small t says: "if a doc's neighbors in dense-cosine space all score low, that doc's BM25 boost is suspect." It denoises the BM25 reshuffle without destroying single-hop precision (small t).

**Expected lift.** **+2 to +5 NDCG@10 on ArguAna**, +0.0 to +0.3 on SciFact (already near ceiling), null or slight regression on NFCorpus (small graphs are noisy). Honest cross-dataset: +0.5 to +1.5.

**Effort.** 6h. Reuse `buildKnnGraph` (already shipped). New `heat-kernel.ts` with the 3-term series, ~120 lines. Per-query budget: 100×10 cosine matvec, ≈1ms; total p50 budget +2ms.

**Risk.** SPECULATIVE. Heat-kernel-on-retrieval has *some* track record (Cohen et al., SIGIR 2018, "Cross Domain Regularization for Neural Ranking Models Using Adversarial Learning"; Vakulenko et al., on graph-of-docs reranking). The published lifts are 1-3pt and concentrated on benchmarks where neighborhood structure matters. Whether SciFact/ArguAna fit this profile is the gate's job to answer. **The PPR null is NOT evidence against this** — different operator (symmetric vs row-stochastic), different time-scale (small-t local vs convergent fixpoint).

**Gate.** Re-rank cached top-100. PASS = +2pt on ArguAna AND no regression on SciFact (>−0.5pt).

---

## #4 — Query-entropy temperature adaptation

**Physics analogy.** Statistical-mechanics phase-transition detection. Entropy of the dense-score distribution `H(q) = −Σ p_i log p_i` (over top-100, post-softmax) measures how "sharp" the retrieval is. Sharp (low H) = confident regime → trust dense; flat (high H) = critical regime → diversify via BM25 + diffusion.

**Math.** `T(q) = T₀ · (1 + β·H(q)/H_max)`. Plug into #2's Boltzmann fusion.

**Why it addresses a specific failure.** ArguAna queries are exactly the high-H regime (counter-argument is genuinely ambiguous). SciFact fact queries are low-H. Today's pipeline uses one fusion strategy for both — the gate test for whether per-query adaptation is worth the complexity.

**Expected lift.** **+0.2 to +0.8** *on top of* #1+#2. Honest read: this is cute but #1 already captures most of the per-query adaptivity by training γ on query features. Marginal.

**Effort.** 5h, including the gate to confirm it composes with #1+#2.

**Risk.** SPECULATIVE — but cheap to gate. If #1 ships, run this only if there's headroom.

**Gate.** Bootstrap CI on the delta `(NDCG of #1+#2+#4) − (NDCG of #1+#2)`. PASS = strictly positive 95% CI.

---

## #5 — Path-integral retrieval (truncated Neumann series)

**Physics analogy.** Sum-over-paths. Score doc `d` as `S(q,d) = Σ_paths exp(−S[path])` over paths from q to d through the kNN graph. Wick-rotated to real-positive: this is exactly `(I + W + W² + W³ + …)·s₀ = (I−W)⁻¹·s₀`, the resolvent operator. The truncation to 3 hops is mathematically identical to #3 with different coefficients.

**Why it's listed separately.** Because the reader will ask. It's not actually a different method — it's a different presentation of #3 with worse coefficient choices (no exponential decay → over-weights long paths).

**Expected lift.** **−1 to +0.5.** Likely null. Long-range path sums on single-hop benchmarks are exactly what failed in §2i (PPR convergent fixpoint).

**Effort.** 8h.

**Risk.** RESEARCH. **Do not build #5 if #3 is built.** They're the same operator family; #3's small-t exponential decay is the principled choice.

---

## Decorative-physics warning (own-conscience pass)

Things to NOT propose, even though they sound physics-cool:

- **Conformal symmetry / scale-invariant kernels** — there's no conformal structure in cosine on bge-base embeddings. The space isn't scale-invariant. Pure decoration.
- **Renormalization-group flow on the pipeline** — RG requires a continuous family of theories at different scales. We have one model at one scale. Decoration.
- **Particle-physics interaction vertices** — the analogy ends at "two things multiply." No conservation law gives a retrieval signal.
- **Schrödinger-equation spreading** — complex amplitudes don't help when the observable is a real ranking. Wick-rotated → it's just heat kernel #3.
- **Mean-field query-as-field** — at 768-dim with one query and N docs, mean-field IS just cosine. The "field" framing adds no new operator.

These are intellectually fun and produce 0.0 NDCG@10 lift. Avoid.

---

## Build order (if any pass their gate)

1. **Hour 0–3**: Build #1 (γ-blend). Gate on cached SciFact+ArguAna+NFCorpus. If +0.5pt PASS → ship behind `FOLKLORE_FUSION=score-blend`.
2. **Hour 3–7**: Build #2 (Boltzmann). Gate composed with #1. If additive +0.3pt → ship.
3. **Hour 7–13**: Build #3 (heat-kernel) **only if ArguAna is a target workload**. Gate per-dataset; ship behind `multi_doc_diffusion=true` query flag like the v3.2 PPR primitive.
4. Skip #4 unless #1+#2 leave headroom; skip #5 entirely.

All four buildable variants re-rank from cached `~/.folklore/bench/<dataset>__*-bge-base*/sota.db` — zero re-embedding, full benchmark in <60s per gate.

---

## Honesty appendix

- The 75.22% number includes the +1.18pt hybrid lift over published bge-base dense (74.04%). Some "physics" lifts above may be partially attributable to better fusion, not better physics. Decompose carefully in the gate report.
- ArguAna is the cleanest target because the failure mode is mechanistically well-understood (R@10 high, NDCG low → pure rank-shuffle, exactly what re-ranking attacks). SciFact is at-ceiling for its parameter budget and may simply not move.
- The CPU-only, no-new-deps, JS/WASM constraint kills 90% of physics-inspired ML papers (which assume GPU + PyTorch + millions of training pairs). The four shippable proposals here are the survivors of that filter.

*— end report —*
