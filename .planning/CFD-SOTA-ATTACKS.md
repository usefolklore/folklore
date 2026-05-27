# CFD-SOTA-ATTACKS — multi-scale & operator-theoretic attacks on the 75.22% ceiling

**Date:** 2026-04-19
**Author:** CFD conscience (computational fluid dynamicist embed)
**Target:** beat 75.22% NDCG@10 on BEIR SciFact OR recover the −19.6pt ArguAna regression at ≤500M params, CPU.
**Honest priors:** Round 1 (Math/Physics/DS) burned the *fusion* surface — RRF sweep, Rocchio PRF, and 3B Contextual Retrieval all NULLED tonight (BENCH §2k). Mechanism: SciFact's 13.3% whiff bucket is *encoder-bound*, and the 26.3% mis-rank bucket has no remaining signal in `(rank_dense, rank_bm25)` space that RRF cannot already extract. Any new attack must touch a NEW operator surface: the kernel itself (preconditioning), the basis (spectral / Krylov), the encoder symmetry (Petrov-Galerkin), or the candidate-set topology (AMR). I propose four such attacks below; #5 is a re-targeting argument.

KG probe (`mcp__akashik__search`) on multigrid retrieval, Krylov + IR, Petrov-Galerkin retrieval, and per-dim preconditioning returned only generic RAG indexes (vearch, RAG_Techniques, AutoRAG) and Matryoshka/transformer-family pages. **None of these CFD operators have been applied to dense+BM25 retrieval in this codebase or in indexed prior art.** Net-new attack surface.

---

## Ranked best-first by expected lift / hour

### 1. Per-dimension diagonal preconditioning of the cosine kernel (PROVEN-class, untested here)

**a. CFD analogy.** Jacobi (diagonal) preconditioner for the linear system `Ax = b` — the cheapest, most universally applied trick in iterative solvers. Replace `A` with `D⁻¹A` where `D = diag(A)`. Convergence rate of CG/GMRES improves by `√(κ(A)/κ(D⁻¹A))` for ill-conditioned operators. The cosine kernel `K(q,d) = ⟨q,d⟩` over bge-base outputs is mildly ill-conditioned (anisotropic — same finding behind Round 1's whitening proposal), but full whitening is a *full* preconditioner (768×768 dense matrix). Diagonal Jacobi is the 768-parameter limit: ~3,000× cheaper, often capturing the dominant share of the conditioning gain.

**b. Mathematical formulation.**
```
Given:   d_i ∈ R^768 (corpus, unit-norm), q ∈ R^768 (query, unit-norm)
Learn:   s ∈ R^768 (per-dim scale), via:
   s_j² = 1 / Var_i(d_{ij})           # inverse per-dim variance over corpus
Apply:   d̃_i = (s ⊙ d_i) / ||s ⊙ d_i||₂
         q̃   = (s ⊙ q)   / ||s ⊙ q||₂
Score:   K̃(q,d) = ⟨q̃, d̃⟩
```
Equivalent to scoring with a Mahalanobis kernel where Σ is approximated as `diag(Var(d))` — the diagonal whitening limit.

**c. Failure mode addressed (NOT in Round 1).** Round 1's full whitening proposal (Math #3) was punted because eigendecomposition of a 768×768 covariance is ~5s in pure JS and the interaction with Matryoshka MRL truncation is unknown. Jacobi preconditioning is the *separable* version: 1 dim of variance per dim, 768 multiplies at query time, MRL-truncation-safe (per-dim scales just truncate alongside the dims). It targets the same anisotropy that whitening does, with ~50% of the expected lift but ~10% of the implementation risk and zero interaction risk with binary-512.

**d. Expected lift.** **+0.2 to +0.7 pt NDCG@10 on SciFact**, +0.5 to +1.5 on ArguAna (where score-magnitude matters more — the BM25-reshuffle failure mode in §2e is partly driven by dense scores being mis-scaled relative to BM25's BM25-natural scale). Honest median: **+0.4 pt** on SciFact. The Su et al. "Whitening Sentence Representations" paper reports +2.3 average for *full* whitening on STS; the diagonal limit typically captures 30–50% of that, i.e. +0.7 to +1.1 in the optimistic case.

**e. Effort.** **2 hours.** Compute `s` once offline from cached corpus vectors in `~/.akashik/bench/scifact__rust-via-ts__bge-base/vectors.db` (~50 ms), persist as a 3KB Float32Array, apply at query/index time via `src/domain/vectors.ts` ~15 LOC. Re-rank cached top-100 — no re-embed, no re-index.

**f. Risk class.** PROVEN (Jacobi preconditioning is the most-studied numerical primitive in existence) / SPECULATIVE for this exact application (no published ablation of diagonal-vs-full whitening on bge-base + RRF).

**g. Minimal gate.** Compute `s` from cached `sota.db`. Re-score 50 held-out SciFact queries with `K̃` swapped for cosine in dense stage, re-fuse via existing RRF k=60. PASS = +0.3 pt with paired-bootstrap p<0.10. If ≥+0.3pt, run on full 300 + ArguAna. If null, the anisotropy is in the off-diagonal — escalate to full whitening as a separate gate.

**h. Round-1 novelty check.** Round 1 Math #3 proposed *full* whitening (eigendecomposed Σ⁻¹ᐟ²). I propose the *diagonal* limit — strictly different operator, strictly cheaper, strictly MRL-compatible. It would NOT have worked in Round 1 because Round 1 didn't propose it. Genuinely novel within this codebase.

---

### 2. AMR-style two-pass retrieval: refine top-k by score-gradient (SPECULATIVE)

**a. CFD analogy.** Adaptive Mesh Refinement (Berger-Oliger 1984). In CFD, AMR refines the grid where `|∇u|` is large — shock fronts, boundary layers — while leaving smooth regions on the coarse grid. In retrieval, the analogous "shock" is the **score gradient near the rank-10 cutoff**: when `score(rank_k) − score(rank_{k+1})` is small (a "smooth" tail), the top-10/top-11 boundary is unstable and small re-ranking perturbations can change NDCG meaningfully. When the gradient is large (a "shock" — clear rank-10 winner), refinement adds nothing.

**b. Mathematical formulation.**
```
Pass 1: dense retrieval, get top-100 with scores s_1 > s_2 > ... > s_100.
Compute gradient field:  g_k = s_k - s_{k+1}, for k = 5..20.
Estimate "shock indicator":  I = median(g_k for k near 10) / median(g_k for k=1..5).
If I < threshold τ (≈ 0.2):
  → "smooth tail" — top-10 boundary is unstable → run Pass 2:
    Take top-30. For each of the 5 docs at rank 6..10, query "neighborhood":
      expand candidate set with kNN(d, top-5 in dense space) for those 5 docs.
    Re-score the union (top-30 ∪ neighbors, max ~60 docs) with the original kernel + BM25 RRF.
Else:
  → "shock present" — return Pass 1.
```
This is a query-adaptive version of "expand-then-rerank." Crucially, it **only fires on the queries where the rank-10 boundary is genuinely ambiguous**, sparing the 60% of queries already nailed (per DS §1, NDCG ≥ 0.7 bucket).

**c. Failure mode addressed (NOT in Round 1).** Round 1 attacked the whole top-100 uniformly (Rocchio centroid pull, RRF k sweep). DS §1 measured that 13.3% of queries whiff entirely (no fix possible post-encoder) and 60.3% are already solved. The **26.3% rerank-zone queries** are where signal lives, and *those* are exactly the queries with low `g_k` near rank 10. AMR refines the candidate set adaptively for that bucket only — no waste on the other two buckets. PRF dilutes everywhere; AMR concentrates effort where the gradient says it matters.

**d. Expected lift.** **+0.3 to +0.8 pt NDCG@10 on SciFact** (capturing partial recovery of the 26.3% mis-rank bucket — ~80 queries × ~0.05 NDCG average = ~+1.3pt on that bucket, ~+0.4pt on aggregate). **+1 to +3 pt on ArguAna** if the shock indicator correctly identifies the BM25-reshuffle queries. Honest median: **+0.4 SciFact / +1.5 ArguAna.**

**e. Effort.** **5 hours.** Reuses the existing kNN graph from `src/domain/pagerank.ts:buildKnnGraph`. New `src/domain/amr-refine.ts` (~120 LOC pure functional). Bench harness change: ~30 LOC in `scripts/bench-beir-sota.mjs` after RRF.

**f. Risk class.** SPECULATIVE. The shock-indicator heuristic is novel-as-IR, well-studied as CFD. The risk: the candidate-set expansion can pull in *false positives* (kNN of rank-6 in dense space = topical neighbors, which is exactly the failure mode that nulled PPR in §2i). Mitigation: cap expansion at 3 neighbors per refined doc and ALWAYS re-fuse with BM25, which down-weights pure topical similarity.

**g. Minimal gate.** Compute `I` for the 300 SciFact queries from cached `sota.db`. Verify the 26.3% mis-rank bucket has bimodally lower `I` than the 60.3% solved bucket — if not, the shock indicator is wrong and the attack stops here (1 hour). If yes, build the refinement pass and gate on +0.3pt aggregate or +1.5pt on the low-I subset.

**h. Round-1 novelty check.** Conformal-pruning (Math #5) was the closest cousin — adaptive top-k SIZING. AMR is adaptive top-k *EXPANSION via kNN*, with a score-gradient trigger. Different mechanism, different operator. Would NOT have appeared in Round 1.

---

### 3. Krylov subspace projection of the corpus before scoring (SPECULATIVE, low priority)

**a. CFD analogy.** Lanczos / Arnoldi iteration — build an `m`-dimensional Krylov subspace `K_m(A, v) = span{v, Av, A²v, ..., A^(m-1)v}` that captures most of `A`'s spectral content. In CFD this is how GMRES solves `Ax = b` without ever forming `A⁻¹`. In retrieval: build a low-rank `m`-dim subspace of the corpus matrix `C ∈ R^{N×768}` via truncated SVD (which is the Krylov basis for `CᵀC`), project queries into it, score there.

**b. Mathematical formulation.**
```
Offline:  C ∈ R^{N × 768} (N = 5,183 corpus vectors)
          Compute thin SVD via Lanczos: C ≈ U Σ Vᵀ, rank m=128
          → V ∈ R^{768 × 128} is the Krylov basis
At query: q̂ = Vᵀ q             (project to 128-d subspace)
          d̂_i = Vᵀ d_i (precomputed)
Score:    K_m(q,d) = ⟨q̂, d̂⟩ + λ · ⟨q − VVᵀq, d − VVᵀd⟩
                     │              │
                     subspace term  residual term (small λ ≈ 0.1)
```
The split-score form preserves the residual signal that pure projection would discard — same trick used in randomized SVD reranking (Halko-Martinsson-Tropp 2011).

**c. Failure mode addressed (NOT in Round 1).** Anisotropy of bge-base CLS pooling concentrates ~95% of variance in the first ~100 PCs (measurable; Su et al. 2021 reports this). The cosine kernel weights all 768 dims equally, so the noise dims dilute the signal. Krylov projection at m=128 *up-weights* the high-variance directions implicitly — same effect as PCA whitening but with the residual term preserving the off-PC signal. This is a **different operator surface from #1** (#1 rescales dims; #3 changes the basis), composable with #1.

**d. Expected lift.** **+0.1 to +0.5 pt NDCG@10 on SciFact**, +0.2 to +0.8 on ArguAna. Honest median: **+0.2 pt.** This is genuinely uncertain because the residual-term coefficient λ has no principled tuning (would need a held-out fit), and pure projection without the residual has been measured-null in adjacent literature (Reimers et al. 2020 on Sentence-BERT PCA reduction: −0.5 pt on STS at 128-d). The residual term is the differentiator and is unmeasured.

**e. Effort.** **8 hours.** Lanczos iteration in pure JS for a 5,183×768 matrix at rank 128: ~200 LOC + ~3 sec offline compute. Project queries: 1 matvec, ~0.5 ms. Storage: 768×128 = 392 KB basis + 5,183×128 = 2.65 MB projected corpus (or compute on the fly). Risk-adjusted, this is high-effort low-confidence.

**f. Risk class.** SPECULATIVE bordering on RESEARCH. Pure dim-reduction has a published null history on dense retrieval; the residual-term variant is unmeasured.

**g. Minimal gate.** Skip this until #1 and #2 ship. Build only if #1 returns ≥+0.3pt AND there's reason to believe further basis-reweighting helps (i.e., if the diagonal preconditioner gives most of its lift from a few dominant dims, full Krylov is worth trying).

**h. Round-1 novelty check.** Round 1 had no spectral / basis-projection proposal. The closest was Math #3 (whitening) which is full-matrix Mahalanobis. Krylov m=128 is rank-restricted and adds the residual term — distinct operator.

---

### 4. Petrov-Galerkin asymmetric kernel: query and doc through different small projections (RESEARCH)

**a. CFD analogy.** Petrov-Galerkin: in finite-element methods you choose **trial functions** (the basis you expand the solution in) and **test functions** (the basis you project residuals onto) from *different* spaces. Standard Galerkin uses the same space for both, which is symmetric and elegant but suboptimal for advection-dominated problems. In retrieval: the dense kernel `cos(q,d)` uses the *same* encoder for both q and d — the symmetric Galerkin choice. Petrov-Galerkin breaks the symmetry: learn a small residual projection `W_q` for queries and `W_d` for docs (both 768→768, low-rank, residual form: `q̃ = q + W_q q`, `d̃ = d + W_d d`).

**b. Mathematical formulation.**
```
Learn (offline, on 50 held-out queries with qrel labels):
  W_q, W_d ∈ R^{768 × r}, r=16   (residual projections, very small)
Score:
  K_PG(q, d) = ⟨q + α W_q W_qᵀ q,  d + α W_d W_dᵀ d⟩
            ≈ ⟨q, d⟩ + α (⟨W_qᵀ q, W_dᵀ d⟩ + ⟨W_qᵀ q, W_qᵀ q⟩ + ⟨W_dᵀ d, W_dᵀ d⟩)
Train via:  minimize InfoNCE loss on 50 (query, gold-doc, hard-neg) triplets
            with α=0.1, r=16 → ~25k learnable params
```
This is essentially a *tiny* fine-tune of the cosine kernel rather than the encoder — strictly post-encoder, no GPU. r=16 keeps it underfit-safe; 50 queries × ~10 negs = 500 examples >> 25k params is INSUFFICIENT, so use r=8 or regularize hard.

**c. Failure mode addressed (NOT in Round 1).** SciFact has a *structural* asymmetry: queries are claim sentences (~10 tokens, declarative), docs are scientific abstracts (~250 tokens, expository). The symmetric encoder forces them into the same representation space, which is a known mismatch (DPR uses two encoders for exactly this reason; Karpukhin et al. 2020). bge-base's single-encoder design CANNOT exploit this. A tiny PG residual gives the kernel one degree of freedom to break the symmetry without retraining the encoder. This is **structurally different from anything in Round 1** — Round 1 stayed inside the symmetric kernel.

**d. Expected lift.** **+0.0 to +0.5 pt NDCG@10 on SciFact** (the encoder is already doing most of the alignment; residual lift is small). **+1 to +4 pt on ArguAna** — this is where asymmetry matters most: queries argue, docs counter-argue, the directional structure is exactly what `W_q ≠ W_d` can encode. Honest median: **+0.2 SciFact / +2.0 ArguAna.**

**e. Effort.** **10 hours.** Pure JS gradient descent on 25k params, InfoNCE loss, ~300 LOC. Hard-negative mining from cached top-100 (free). Real risk of overfitting the 50-query training fold (Round 1 RRF sweep already showed this exact failure mode — train 86%, test 73%, +0.17pt held-out). Mitigation: 5-fold CV with bootstrap CI, r=8 not r=16, strong L2.

**f. Risk class.** RESEARCH. The "tiny-PG-on-frozen-encoder" pattern has no published BEIR ablation I or the KG could find. Closest analog is COIL (Gao et al. 2021 — token-level scoring weights), which is a more elaborate version of the same idea and reports +1–3pt on MS MARCO.

**g. Minimal gate.** Build the trainer on cached `sota.db`. 5-fold CV. PASS = held-out lift ≥+0.5pt OR ArguAna ≥+1.5pt with paired-bootstrap p<0.10. If train-test gap exceeds 1.5pt (the Round 1 RRF gap), **kill it** — overfitting is the documented failure mode.

**h. Round-1 novelty check.** Genuinely novel. Round 1 Math/Physics/DS all kept the symmetric kernel. Petrov-Galerkin asymmetry is the only proposal here that touches the kernel symmetry itself.

---

### 5. Re-target: stop chasing SciFact, attack ArguAna (META — NOT a CFD attack)

**The honest empirical case.** SciFact at 75.22% is **2 pt below the dense-only published bge-base ceiling** (74.04%) plus the +1.18 hybrid lift — i.e., we are *already above* the encoder's solo capability. The 13.3% whiff bucket is encoder-bound (NULL gates from Round 1 confirm this mechanistically). Every additional pt costs exponentially more effort.

ArguAna at 43.97% is **−6.4 pt below the dense-only nomic ceiling** (~50.4%, per nomic tech report) and −19.6 pt below the bge-base dense ceiling we'd see if hybrid weren't actively destroying rank order. **The recoverable headroom is 6–20 pt depending on attack scope.** Per BENCH §2e: R@10 is 86.42%, NDCG@10 is 43.97% — *the gold doc is being retrieved and then mis-ranked by BM25*. That is the cleanest possible mechanistic target.

**Both ways:**
- **For SciFact chase:** SOTA narrative is cleaner, monoT5-3B GPU is the named target, peer review will compare to bge-large (74.6) which we beat. Marketing wins.
- **For ArguAna pivot:** 2–4× the expected pt-per-hour, mechanistically *understood* (BM25 reshuffles correct retrieval out of top-10), and shippable as the v3.2 `multi_doc_diffusion=true` flag the team already designed for. Engineering wins.

**Recommendation:** Re-target. Of attacks #1–#4 above, three (#1, #2, #4) target *exactly* the BM25-reshuffle mechanism on ArguAna. SciFact is at-ceiling; ArguAna is mid-channel and the current is ours.

---

## Summary table (best-first by lift / hour)

| # | Attack | SciFact pt | ArguAna pt | Hours | Risk |
|---|--------|------------|------------|-------|------|
| 1 | **Diagonal Jacobi preconditioning** | +0.2 to +0.7 | +0.5 to +1.5 | 2 | PROVEN-class |
| 2 | **AMR score-gradient refinement** | +0.3 to +0.8 | +1 to +3 | 5 | SPECULATIVE |
| 3 | Krylov subspace + residual | +0.1 to +0.5 | +0.2 to +0.8 | 8 | SPECULATIVE/RESEARCH |
| 4 | **Petrov-Galerkin asymmetric kernel** | +0.0 to +0.5 | +1 to +4 | 10 | RESEARCH |
| 5 | Re-target SciFact → ArguAna | n/a | up to +6–20 | 0 (decision) | DECISION |

**CFD-conscience honest read.** If forced to fund ONE: **#1 (Jacobi preconditioning), 2 hours, +0.4pt SciFact / +1pt ArguAna median.** It's the only proposal that is both novel-vs-Round-1 AND has a sub-3-hour gate AND can't go below baseline (worst case `s = 1` recovers cosine exactly). #2 is the high-EV second move once #1 lands. #3 and #4 should NOT be built until #1+#2 demonstrate that any non-fusion lift remains extractable at all.

If #1 nulls (median +0.0pt, no significance), the v4 thesis pivot is fully vindicated: **the SOTA-attack track is closed at this parameter tier**, and the next budget unit should go to ArguAna pivot or to the v3.2 P2P infrastructure work the user has already prioritized ("P2P first, SOTA second").

*— end CFD attack inventory —*
