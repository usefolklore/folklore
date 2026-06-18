# Compounding under graded retrieval — does P2P knowledge actually compound?

> 2026-06-18. The headline 17%→1% web-fallback decay (`bench-compounding.mjs`)
> uses **boolean exact-match** retrieval — a peer either holds the exact topic id
> or not. The cost + degradation critiques flagged this as artificially inflating
> the decay. `bench/bench-compounding-graded.mjs` replaces boolean with **graded
> semantic retrieval through the real energy gate**, and the answer is more
> honest and more interesting: **compounding is real, but bounded by retrieval
> precision — not unlimited.**

## The sim

Topics are unit vectors in `R^d`; demand is Mandelbrot-Zipf; a query for topic
`k` is a NOISED paraphrase `normalize(topic_k + σ·gauss)`. A peer resolves from
memory iff the real `energyGate` (`src/domain/energy-gate.ts`) admits over the
cosine similarities of its candidate cache hits — `−E(q) ≥ τ` AND a Hopfield
separation guard `Δ ≥ sepMin`. Both τ and sepMin are **calibrated to the sim's
own geometry** by a warmup (Youden on true-match vs spurious-neighbour
distributions) — the real-graph-fitted defaults don't transfer across geometries.
Ground truth is known, so we report **false-admit** = "use memory" while the true
answer is absent (resolved from a wrong-but-close topic). ISOLATED reads only the
issuing peer's cache; COOPERATIVE reads the federated union.

Synthetic vectors (geometric sim), not real text embeddings — the point is graded
geometry + the real gate, a strict honesty upgrade over boolean. Two artifacts the
boolean model structurally cannot show: **paraphrase misses** and **near-miss
false-admits**.

## Result — sweep over paraphrase noise σ (DIM=384, 16 peers, 4000 steps, 600 topics)

| σ | true-match TPR / FPR (calib) | coop web-fallback end | isolated end | web trips saved | false-admit | verdict |
|---|---|---|---|---|---|---|
| 0.10 | 100% / 0% | **1.5%** | 50.0% | **4.49×** | **0.0%** | COMPOUNDS |
| 0.15 | 97% / 2% | 38.5% | 51.5% | 1.72× | 0.0% | COMPOUNDS |
| 0.20 | 86% / 9% | 71.5% | 66.0% | ~1× | ~1% | no gap |

And the control: at **P=1** cooperative == isolated exactly (same web trips, same
hit rate) — the gap is caused by *sharing*, not by the cache model.

## What this means (honest)

1. **Compounding is real under graded retrieval** — at realistic paraphrase
   similarity (σ ≲ 0.15, i.e. a query whose embedding stays close to the cached
   answer) cooperative web-fallback collapses far below isolated (4.5× fewer paid
   web trips at σ=0.10) with **0% false-admit**. This is genuine P2P knowledge
   reuse: peer A's resolved answer correctly satisfies peer B's paraphrase.
2. **It is bounded by retrieval precision, not unlimited.** As paraphrase noise
   rises the honest gate *correctly pays web* rather than false-resolving, so the
   cooperative advantage shrinks and closes by σ≈0.20. The boolean sim's 17%→1%
   hid this entirely — it assumed every paraphrase is a perfect hit.
3. **The separation guard is load-bearering.** Without it (τ alone), a single
   threshold calibrated for true-match sensitivity ALSO rubber-stamps the
   best-of-thousands spurious neighbour in a large federated cache → false-admit
   ~88%, and the "web-fallback → 0" is mostly *false resolution*. The Hopfield
   separation guard (`Δ ≥ sepMin`) drops false-admit to ~0% by requiring the
   cached self to be clearly closest. This is exactly the metastable-collapse
   rejection the energy-based-inference research predicted.
4. **Dimensionality matters.** At low d (24) random topics aren't near-orthogonal,
   so the best spurious neighbour is close and false-admits dominate; at realistic
   d (384) random cos concentrates near 0, so a calibrated gate separates cleanly.

## The defensible claim

"Peers compound on inference" is **true under graded retrieval when paraphrase
similarity clears the spurious-neighbour floor, and false-admit is held near zero
by the separation guard** — a far stronger and more credible statement than the
boolean 17%→1%. The compounding *rate* is a function of embedder paraphrase
robustness (σ) and federated cache size (spurious-neighbour density), both
measurable. Next: sweep peer count P to chart R(T,t) growth, add offline churn,
and re-run on real text embeddings (not synthetic vectors) to fix the real-world σ.
