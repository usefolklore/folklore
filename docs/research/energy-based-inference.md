# An energy formulation of federated inference reuse — synthesis

> **What this is.** The flagship synthesis tying two research passes together:
> the web-grounded EBM / Hopfield / submodular results
> ([energy-based-inference-web.md](energy-based-inference-web.md), full citations
> + library traction) and the *internal* Akashik formalism surfaced from the
> NotebookLM "Akashik Research" notebook (Che LRU cache model, EigenTrust, PPR,
> the R(T,t) thesis). It states what is **provable**, what is **analogy**, the
> one **near-term lever**, and the genuinely **open** object. It grounds on the
> measured reality of the deny gate: [deny-gate-calibration.md](deny-gate-calibration.md)
> and [../protocol/DENY-CALIBRATION-REAL.md](../protocol/DENY-CALIBRATION-REAL.md)
> (real-query AUC = 0.52; gate inert; 0.0% web deflection). 2026-06-18.
> `[SPECULATIVE]` marks framing that is not yet a theorem.

## 1. The observation that motivates an energy view

The protocol already runs **three independent fixed-point computations**, each of
which is — though the codebase never names it so — the minimization of an energy:

- **PPR retrieval rerank.** Personalized PageRank solves
  `(I − (1−α)W) x = α·s`, which is the unique stationary point of the convex
  quadratic `E_ret(x) = ½(1−α)·xᵀ(I−W)x + ½α·‖x − s‖²`. Power iteration
  (the "propagate until convergence" the sources describe, 1–2 iterations in
  practice) is gradient descent on `E_ret`.
- **EigenTrust.** `t^{(k+1)} = Cᵀ t^{(k)}` is the power method converging to the
  principal eigenvector of the trust matrix — the stationary point of a Rayleigh
  quotient / a Dirichlet energy on the trust graph.
- **Che LRU cache fill / sizing.** Cooperative hit rate
  `h_i ≈ 1 − e^{−q_i t_C}` over pooled capacity `C_eff = γ·Σ C_p`, with cache
  sizing the minimizer of a cost potential `δ(c) = Γ(1−h(c)) + c`.

And a fourth, the **reranker itself**, is *exactly* one step of modern-Hopfield
retrieval: `ξ_new = X·softmax(β·Xᵀξ)` is transformer attention with `β = 1/√d_k`
(Ramsauer et al., ICLR 2021). So Folklore *already does Hopfield retrieval* — it
just lacks the explicit energy and the separation condition that come with it.

These four are currently unrelated mechanisms. The thesis of this note: they are
facets of **one energy functional over a shared object**, and naming that object
buys two things the protocol provably lacks today — (a) the Lyapunov / potential
function the sources confirm is **absent** (the term "Lyapunov" appears only in
cited paper titles, never as a protocol quantity), and (b) a principled,
calibratable replacement for the inert 0.85 deny gate.

## 2. The bridge to the compounding thesis

NotebookLM is explicit that **R(T,t) monotonicity is an idealized empirical
claim, not a theorem** — the 17%→1% simulator curve rests on a boolean
exact-match assumption, and in practice monotonicity is broken by semantic
drift, sub-0.85 near-misses, LRU eviction, and TTL decay. The web pass supplies
the missing rigor: **R(T,t) is monotone submodular coverage** (Nemhauser–Wolsey–
Fisher 1978), which is *already* the standard formalism for distributed caching
(FemtoCaching 2013; Ioannidis–Yeh, SIGMETRICS 2016).

Concretely, let `R(T,t) ⊆ Peers` hold a basin for topic `T`, and `g_T(S)` be the
expected compute saved when peer-set `S` holds `T`. Then:

- "R(T,t) monotonically non-decreasing" **is** monotonicity: `g_T(S) ≤ g_T(S∪{p})`.
- "marginal cost collapses toward a round-trip after the first peer pays" **is**
  submodularity: diminishing marginal gain of the k-th replica — which is also
  why Che's cooperative hit rate grows only **logarithmically** in peer count
  (the notebook's own result), the discrete-cache shadow of submodular
  saturation.
- A greedy/online share policy is then within **(1 − 1/e) ≈ 0.63** of optimal.

This is the rigorous restatement of the central thesis, and it **supplies the
Lyapunov function**: define network free energy (the word used as a label, not as
Friston physics — see §4)

```
F_net(t) = E_{T∼demand}[ resolution_cost(T, R(T,t)) ]
```

= expected cost to resolve a demanded topic. **Compounding inference ⇔ F_net(t)
monotonically non-increasing in t** as basins fill. Stated rigorously this is the
monotonicity of a submodular coverage objective — not thermodynamics — and that
is exactly its strength: it is provable.

## 3. Why the gate is dead, in energy terms — and the lever

The measured failure (AUC = 0.52, §DENY-CALIBRATION-REAL) has a precise
Hopfield reading. Retrieval has three fixed-point regimes: **global** (softmax
averages over all patterns → collapse), **metastable** (averages over a nearby
subset → a blurred average of several cached answers), and **single-pattern**
(clean). Low inverse-temperature `β` and/or correlated patterns (high-centrality
hubs) push retrieval into the metastable regime — *which is precisely the
"off-topic hub looks relevant" failure the signal-fix commit `80836d8`
diagnosed.* The Hopfield framing both **predicts** the AUC=0.52 result and names
the dial that fixes it: `β`.

**The near-term lever (implementable on the existing harness, ~30 lines, no
retraining)** — replace `satisfaction ≥ 0.85 AND ≥2 hits` with:

1. **Free-energy admission** over the hits' similarities (Liu et al., NeurIPS
   2020, energy-OOD):
   `E(q) = −T · logsumexp_i( sim_i(q) / T )`; **deny the web call iff
   `−E(q) ≥ τ`.** Two moderate hits now *accumulate* confidence via logsumexp
   instead of being clamped under the `[0.3,1]` ceiling — the direct fix for why
   0.85 is unreachable.
2. **Hopfield separation guard:** also require `β·Δ ≥ log(2(N−1)Nβ)`, where
   `Δ = sim(q,x₍₁₎) − sim(q,x₍₂₎)` is the best-vs-second-best gap and `N` the
   live cached-pattern count. This makes the gate **automatically stricter as the
   federated cache grows** and rejects the metastable "two-close-answers" zone.
3. **Fit `T, τ, β` once** by ECE/NLL minimization (temperature scaling, Guo et
   al. ICML 2017) on the in-corpus vs out-of-corpus set `bench-deny-real` already
   produces. `β` becomes the single sharpness dial; `FOLKLORE_DENY_THRESHOLD`
   becomes a target-TPR knob on the energy distribution, not a magic constant.
4. **Benchmark against vCache** (Berkeley, arXiv:2502.03771) — the SOTA
   error-bounded per-entry semantic-cache threshold — as the baseline the
   energy+separation gate must match or beat.

This is the one lever that is simultaneously (a) implementable now, (b) a fix for
the *measured* 0.0%-deflection failure, and (c) grounded in established citable
method rather than analogy. It supersedes the "keep 0.85, can't threshold our way
out" conclusion of DENY-CALIBRATION-REAL with a *different functional form* whose
ceiling pathology is removed by construction — to be validated empirically, not
assumed (retrieval scores are not trained softmax logits, so `−E ∝ log p(x)` is
an assumption to test, not a theorem here).

## 4. Honest novelty ledger

| Framing | Status |
|---|---|
| Energy-OOD gate (logsumexp + temperature) | Established method; mild novelty as application. **Ship as engineering, not research.** |
| Reranker = one Hopfield step | **Exact identity, not novel** — reinventing it would be claiming Ramsauer's result. |
| Hopfield separation condition as the deny criterion | **Novel recombination** — applying an existing bound as a cache-size-aware gate. |
| PPR / EigenTrust as energy descent | **Known in spirit** (both are classic fixed-point/variational); the novelty is *unifying them with retrieval under one functional*, not the individual facts. |
| Monotone submodular coverage of R(T,t) | **RIGOROUS — the safe claim.** The established distributed-caching formalism; supplies the missing Lyapunov. **This is what to claim + prove.** |
| "Network free energy as physics" | **ANALOGY, weak** `[SPECULATIVE]` — no `q`, no generative `p(z,x)`, no bounded surprise; inherits FEP's unfalsifiability critique (Bruineberg 2022). Use the word as a label only. |
| Expected-cost control objective `J(π)` | Rigorous **iff** you drop the "free energy" label — it is a legitimate MDP/stochastic-control cost. |
| Landauer floor | Rigorous but ~10²⁰× below the dollar/latency cost of an LLM re-derivation. Poetic, never load-bearing. |
| **Federated, time-cumulative reuse value `R(T,t)`** | **Genuinely unoccupied** `[SPECULATIVE but defensible]`. vCache federates nothing; MeanCache federates the embedder not the value; Probabilistic Language Tries (2026) is single-node. |

**Bottom line.** Every component is prior art. The defensible novelty is the
**composition**: a federated cache modeled as one shared Hopfield energy
landscape, with an energy-OOD + separation gate for admission and a
monotone-submodular coverage value function for the compounding claim — plus the
*network-cumulative reuse value* `R(T,t)` as the object none of the prior art
defines. Claim the composition and the object; never claim to have invented
energy models, Hopfield capacity, or free energy.

## 5. The research program (what to prove, in order)

1. **Monotone-coverage theorem — core, achievable.** Under a fill rule (every
   researched miss is deposited and propagated), prove `g_T(·)` is monotone
   submodular ⇒ `F_net(t)` non-increasing and a greedy/online share policy is
   within `(1−1/e)` of optimal. This is the rigorous central thesis and the most
   defensible first paper. Replaces the boolean simulator with a theorem.
2. **Distributed separation / capacity theorem — the open frontier.** Extend the
   single-node Ramsauer / Hu–Wu–Liu (NeurIPS 2024) spherical-code capacity
   (`c ≥ √p·2^{(d−1)/4}`, tight) to a *federation*: bound reliable retrieval
   capacity of the union landscape under partial replication and per-peer
   sharding, with a no-collapse separation condition. No prior theory exists
   (Alessandrelli et al. 2026 do federated *archetype consolidation*, not
   partitioned content-addressable retrieval). **This is the headline open
   problem and the genuine "new field" seed.**
3. **Calibrated admissibility under federation.** Carry vCache's per-entry
   error bound into the federated, mutually-untrusted-peer setting — ties the
   energy gate to the existing trust×relevance layer (EigenTrust supplies the
   trust eigenvector; the gate supplies relevance).

### Engineering sequence (matches the deny-calibration next-levers)
1. Token-set coverage (already queued) — sharpens `sim_i`, the gate's input.
2. **Energy-OOD + separation gate** (this note, §3) behind a flag; fit on
   `bench-deny-real`; A/B vs the current gate and vs vCache. AUC/FPR95 are the
   metrics.
3. Age into the gate multiplicatively + unify the staleness window.
4. Shadow auto-judge → real labels → fit `β` online (feeds `learnWeights`).

### Library notes (verified 2026-06-18)
vLLM ~83k★, SGLang ~29k★, LMCache ~9.3k★, Mem0 ~48k★ — all active. **Avoid:**
GPTCache (last push Jul-2025, maintenance), `ml-jku/hopfield-layers` (frozen
Apr-2023 — port the ~30 lines, don't depend), `facebookresearch/ijepa` (archived
— use `vjepa2`). The energy gate needs no new dependency: logsumexp + a fitted
temperature is a few lines over the existing similarity scores.
