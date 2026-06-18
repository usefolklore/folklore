# Energy-Based Models, Associative Memory, and a Mathematical Framing for Federated Inference Reuse

> **What this is.** Web-grounded research (2026-06-18) on whether energy-based
> models (EBMs), modern Hopfield/associative-memory theory, the free-energy
> principle, and current inference-reuse SOTA can (a) make Folklore's deny
> gate / cache faster and better-calibrated, and (b) found a defensible *new*
> mathematical framing for "LLM inference sharing & reuse." Citations are real
> (author + year + arXiv/venue) and library traction was verified on GitHub.
> **Established results, the mapping to Folklore, an honest novelty verdict,
> the one near-term lever, and the speculative-but-defensible field pitch are
> kept strictly separate. Speculation is marked `[SPECULATIVE]`.**
>
> Grounding on the real system (`docs/research/deny-gate-calibration.md`):
> `satisfaction = trust × relevance` is a **composite compressed into
> `[0.3, 1]`**; the deny gate fires at `satisfaction ≥ 0.85 AND ≥2 hits`; that
> 0.85 is **mathematically unreachable** on the real post-GC distribution
> (correct in-corpus hits ceiling ~0.43–0.57), so live web-deflection is
> **0.0%** — the gate is inert. The calibration problem is the central pain
> this research is aimed at.

---

## 1. Established results per thread (with citations)

### Thread 1 — Energy-based models & the JEPA line

**EBM fundamentals.** The canonical reference is LeCun, Chopra, Hadsell,
Ranzato & Huang, *A Tutorial on Energy-Based Learning* (2006, in *Predicting
Structured Data*, MIT Press). An EBM assigns a scalar **energy `E(x)`** to each
configuration: low energy = compatible/observed, high = incompatible. To turn
energy into a probability you use the Gibbs/Boltzmann form
`p(x) = exp(−E(x)/T) / Z` with partition function `Z = ∫ exp(−E(x′)/T) dx′` and
temperature `T`. The structurally important point: for ranking/decision tasks
`Z` is an x-independent constant, so **a threshold on energy is well-defined
without ever estimating `Z`**. EBMs deliberately avoid the normalization that
forces a score into a `[0,1]` simplex — which is exactly the move that ceilings
Folklore's composite.

**JEPA line.** LeCun's position paper *A Path Towards Autonomous Machine
Intelligence* (v0.9.2, 2022, OpenReview `BZ5a1r-kVsf`) frames JEPA explicitly as
an EBM: two encoders embed `x` and `y`, a predictor maps one latent to the
other, and **the energy is the prediction error in representation space** (L2 /
cosine between predicted and actual latent). I-JEPA (Assran et al., CVPR 2023)
and V-JEPA 2 (arXiv:2506.09985, 2025) instantiate this. **Honest caveat: the
JEPA energy is a *relative* compatibility score, not a calibrated one** — there
is no temperature-fit or held-out calibration step in the JEPA papers. JEPA
validates "score compatibility as latent-space energy"; it does **not** supply
the calibration recipe.

**Calibration + energy-OOD (the load-bearing references).**
- Guo, Pleiss, Sun & Weinberger, *On Calibration of Modern Neural Networks*
  (ICML 2017, arXiv:1706.04599): modern nets are miscalibrated;
  **temperature scaling** — divide logits by a single scalar `T` fit on
  held-out data to maximize likelihood — fixes calibration post-hoc, no
  retraining. This is exactly the "learnable `T` calibrated on held-out data"
  primitive.
- Liu, Wang, Owens & Li, *Energy-based Out-of-distribution Detection*
  (NeurIPS 2020, arXiv:2010.03759): the **free energy**
  **`E(x) = −T · log Σᵢ exp(fᵢ(x)/T)`** (negative log-partition over logits)
  tracks input density — `−E(x) ∝ log p(x)` up to a constant — whereas softmax
  max-probability saturates near 1 for both in- and out-of-distribution inputs
  (the **overconfidence/ceiling pathology — structurally the same disease as
  Folklore's compressed satisfaction**). Decision rule: in-distribution iff
  `−E(x) ≥ τ`, with `τ` set on in-distribution data. Reported −18.03% FPR95 vs
  softmax on CIFAR-10.

### Thread 2 — Modern Hopfield networks / associative memory

**The attention equivalence (Ramsauer et al., "Hopfield Networks is All You
Need", ICLR 2021, arXiv:2008.02217).** For stored patterns as columns of
`X = (x₁,…,x_N)` and query state `ξ`, the continuous energy is

```
E(ξ) = −lse(β, Xᵀξ) + ½ ξᵀξ + β⁻¹ log N + ½ M²,   lse(β,z) = β⁻¹ log Σ exp(β z_l)
```

with `M = maxᵢ‖xᵢ‖` and `β` the inverse temperature. The one-step (CCCP) update
is **`ξ_new = X · softmax(β Xᵀ ξ)`**, which is **exactly transformer attention**
`softmax(β QKᵀ)V` with `β = 1/√d_k`. Retrieval converges in **one step** for
well-separated patterns.

**Capacity ladder.** Classical binary Hopfield (Hopfield 1982) holds only
`≈0.138 N` random patterns before a spin-glass blackout (Amit, Gutfreund &
Sompolinsky 1985, *PRL* 55:1530). Krotov & Hopfield (2016, NeurIPS,
arXiv:1606.01164) added higher-order interactions → polynomial capacity
(`∝ N^{n−1}`). Demircigil et al. (2017, *J. Stat. Phys.*, arXiv:1702.01929) with
exponential interaction → `≈2^{N/2}`. **The bound that matters for caching**
(Ramsauer et al. 2020): for continuous patterns on the unit sphere in `ℝ^d`,

```
c ≥ √p · 2^{(d−1)/4}        — exponential in embedding dimension d
```

Each pattern has a **separation** `Δᵢ = min_{j≠i}(xᵢᵀxᵢ − xᵢᵀxⱼ)`; after one
update the error is **exponentially small in `β·Δᵢ`**, provided `Δᵢ` exceeds a
threshold `~ (1/β) log(2(N−1)Nβ M²)`. Hu, Wu & Liu (2024, NeurIPS,
arXiv:2410.23126) closed this with a matching upper bound (`M* ≍ c^d`,
achieved when patterns form an **optimal spherical code**) — exponential scaling
is **tight**.

**Retrieval dynamics — the "dangerous zone."** Three fixed-point regimes:
**global** (softmax averages over *all* patterns — collapse), **metastable**
(averages over a nearby *subset* — a blurred average of several cached answers),
and **single-pattern** (clean retrieval). Low `β` → topically-related entries
merge into one metastable basin (exactly the "topically related but distinct"
cache failure); high `β` → crisp basins. **`β` is literally the sharpness knob
of the basin boundary** and therefore the principled analogue of the deny-gate
sharpness.

### Thread 3 — Free-energy principle, thermodynamics, submodularity

**Variational free energy / FEP.** Friston (2010, *Nat. Rev. Neurosci.*
11:127): `F = E_q[ln q(z) − ln p(z,x)] = −ELBO`, an upper bound on surprise
`−ln p(x)`; minimizing `F` minimizes prediction error. Active inference adds
*expected free energy* `G(π)` over policies (Da Costa et al. 2020). **The
rigorous core is plain variational inference** — Blei, Kucukelbir & McAuliffe
(2017, *JASA* 112:859, arXiv:1601.00670); the FEP's "free energy" is literally
`−ELBO`. The FEP itself is widely criticized as unfalsifiable/over-general
(Colombo & Wright 2021; Bruineberg et al. 2022 "Emperor's New Markov Blankets";
even Friston et al. 2023 *Physics Reports* 1024 is a response to that charge).

**Thermodynamics of computation.** Landauer (1961, *IBM J.*): erasing one bit
costs `≥ k_B T ln 2` (~2.9×10⁻²¹ J at 300 K). Bennett (1973/1982): reversible
computation can dissipate ~nothing; only erasure carries a mandatory cost.

**Information bottleneck.** Tishby, Pereira & Bialek (1999, arXiv:physics/0004057):
minimize `I(X;T) − β I(T;Y)` — a defensible objective for *how much* to cache.

**Monotone submodular coverage.** Nemhauser, Wolsey & Fisher (1978, *Math.
Prog.* 14:265): greedy achieves a **tight `(1 − 1/e)`** for monotone submodular
maximization under a cardinality constraint. **This is already the standard
formalism for distributed caching:** Shanmugam et al. "FemtoCaching" (2013,
*IEEE Trans. IT*) and Ioannidis & Yeh "Adaptive Caching Networks with
Optimality Guarantees" (SIGMETRICS 2016, arXiv:1604.03175) cast cache placement
to maximize caching gain as monotone submodular maximization with `(1 − 1/e)`
greedy / continuous-greedy guarantees.

### Thread 4 — Inference-reuse SOTA (2024-2026), with verified traction

| Layer | Representative work | Match key | GitHub traction (verified) |
|---|---|---|---|
| **KV/prefix reuse** | vLLM/PagedAttention (Kwon SOSP'23); SGLang/RadixAttention (Zheng NeurIPS'24, arXiv:2312.07104); Prompt Cache (Gim MLSys'24, arXiv:2311.04934); LMCache | **exact token prefix** | vLLM **~83k★**, v0.23 Jun-2026 ✅ · SGLang **~29k★**, Jun-2026 ✅ · LMCache **~9.3k★**, 2026 ✅ |
| **Semantic caching** | GPTCache; MeanCache (arXiv:2403.02694); **vCache** (Berkeley, arXiv:2502.03771); SCALM; Async Verified (arXiv:2602.13165) | **embedding similarity** | GPTCache **~8k★ but last push Jul-2025 — STALE/maintenance** ⚠️ |
| **Speculative decoding** | Leviathan'23; Chen'23; Medusa (Cai'24); EAGLE-1/2/3 | within one generation | EAGLE **~2.4k★**, folded into vLLM/SGLang |
| **Retrieval LMs** | kNN-LM (Khandelwal'20); RETRO (Borgeaud'22) | datastore interpolation | single-model, training-coupled |
| **Frontier: cross-agent / federated** | TokenDance, SAGA, DroidSpeak (cluster-internal); Letta/Mem0 (content memory); **Probabilistic Language Tries** (Magarshak arXiv:2604.06228) | varies | Mem0 **~48k★** — content, not compute-value |

Two findings dominate. **(i) vCache** (UC Berkeley Sky Lab, 2502.03771, 2025)
replaces the single static similarity threshold with an **online per-embedding
threshold that provably satisfies a user-defined error bound** (up to 12.5× hit
rate, 26× lower error). It directly attacks the threshold-calibration problem
Folklore shares with GPTCache, and **it is the SOTA baseline Folklore's global
0.85 gate must beat.** **(ii) Probabilistic Language Tries** (2604.06228, 2026)
is the closest formal object: a memoization index where serving cost
(`p_r·O(log N) + (1−p_r)·O(n²)`) **falls as the artifact store accumulates** —
but it is **single-node**: `p_r` does not emerge from a *network*, and it proves
no monotone coverage under distributed updates.

---

## 2. Mapping to Folklore's `R(T,t)` / cache / gate

**The deny gate is an OOD test.** "Answer from cache vs fetch web" is exactly
"is this query in-corpus enough that my hits cover it." So the most direct
mapping (Thread 1) is **energy-based OOD admission**: replace
`satisfaction ∈ [0.3,1]` with a free energy over the per-hit relevance scores
(treat each hit's similarity `simᵢ` as a logit) and aggregate the `≥2` hits with
the logsumexp that the gate already implies:

```
E(q) = −T · logsumexp_i ( simᵢ(q) / T )      deny web ⇔  −E(q) ≥ τ
```

Two moderate hits now **accumulate** energy via logsumexp instead of being
clamped under a ceiling — which is precisely why the current 0.85 is
unreachable. `T` and `τ` are fit on a held-out in-corpus vs out-of-corpus set
(Guo's recipe); `T` absorbs the score-compression, `τ` is read off the
in-corpus energy distribution at a target TPR. This is the same "baseline the
distribution, then set the cut" conclusion already reached empirically in
`deny-gate-calibration.md` — energy-OOD gives it a principled functional form.

**The reranker is already one Hopfield step (Thread 2).** Folklore's
softmax-over-cosine reranker over retrieved candidates *is*
`ξ_new = X·softmax(β Xᵀξ)`. So Folklore already runs Hopfield retrieval; the
missing piece is the explicit energy + **separation condition**. The capacity
theorem says a `d=768` cache holds `O(2^{d/4})` reliably-retrievable distinct
answers — astronomically beyond any real corpus, so **dimension is never the
binding constraint; separation is.** Federation = a union of pattern sets across
`N` peers on one shared embedding sphere; the binding risk is two near-duplicate
answers from different peers collapsing into one metastable basin (the
"dangerous zone" of `deny-gate-calibration.md`, now with a name and a `β`).

**`R(T,t)` is monotone submodular coverage (Thread 3).** Let
`R(T,t) ⊆ Peers` hold topic `T`, and `g_T(S)` = caching gain from peer-set `S`.
The thesis "R(T,t) monotonically non-decreasing" *is* monotonicity
(`g_T(S) ≤ g_T(S∪{p})`); "marginal cost collapses toward a round-trip after the
first peer pays" *is* submodularity (diminishing marginal gain of the k-th
replica). A greedy share policy is then provably within `(1 − 1/e) ≈ 0.63` of
optimal — a 40-year-old theorem (Nemhauser–Wolsey–Fisher 1978), already the
model for distributed caching (FemtoCaching; Ioannidis–Yeh).

**The frontier gap Folklore occupies (Thread 4).** The literature has formalized
**per-key correctness** (vCache's error-bounded threshold) and **single-node
amortized cost** (PLT's `p_r`), but **not the network-level, time-cumulative
value of a cached inference across a federation of agents.** No published work
defines `R(T,t)` as *expected compute saved across all peers up to time `t`*,
nor proves monotone coverage under distributed P2P fill. That object is the open
territory.

---

## 3. Honest assessment — genuinely novel vs. analogy

| Framing | Status | Verdict |
|---|---|---|
| Energy-OOD gate (logsumexp + temperature) | **Established method, mild novelty as application** | Reviewer will say "OOD detection on retrieval scores." Fine as an engineering lever; **do not sell as research.** The `−E ∝ log p(x)` guarantee is *borrowed* — retrieval scores aren't trained softmax logits, so it's an assumption to validate, not a theorem here. `[validate empirically]` |
| Reranker = one Hopfield step | **Exact identity, not novel** | The math (energy, capacity, attention-equivalence) is fully established. Claiming novelty here would be reinventing Hopfield/Ramsauer. |
| Hopfield **separation condition as the deny criterion** | **Novel *recombination*** | Using `β·Δ ≥ τ(N)` (gap between best/2nd-best, threshold growing in cache size `N`) as a calibrated gate is a defensible new framing — but it is *applying* an existing bound. |
| "Network **free energy**" as literal physics | **ANALOGY, and weak** `[SPECULATIVE]` | No `q`, no generative `p(z,x)`, no surprise being bounded. Borrows the *word*. Inherits FEP's unfalsifiability baggage. **Do not claim as physics.** |
| Expected-cost / EFE as a control objective | **Rigorous *only if* you drop the "free energy" label** | A real `J(π)=E[c_research·1{first}+c_recompute·1{miss}+c_latency]` is a legitimate MDP/stochastic-control objective; calling it "expected free energy" is the overreach. |
| **Monotone submodular coverage** of `R(T,t)` | **RIGOROUS — the safe claim** | *The* established distributed-caching formalism (FemtoCaching; Ioannidis–Yeh 2016). Monotonicity + diminishing returns are exactly the thesis, with a `(1−1/e)` guarantee. **This is what to claim.** |
| Landauer floor on energy saved | **Rigorous but NEGLIGIBLE** | `k_BT ln2 ≈ 3×10⁻²¹ J/bit` is ~10²⁰× below the dollar/latency cost of an LLM re-derivation. Cite as poetic floor; never load-bearing. |
| **Federated, time-cumulative reuse value** | **Genuinely unoccupied** `[SPECULATIVE but defensible]` | vCache federates nothing; MeanCache federates the *embedder* not the *value*; TokenDance shares *state* in one cluster; PLT is single-node. The network-`R(T,t)` value function appears unclaimed. |

**Bottom line:** the *components* are all prior art (EBM, Hopfield, submodular
caching, energy-OOD, vCache). The **defensible novelty is the composition**: a
federated cache modeled as one shared energy landscape, with a Hopfield
separation gate for admission and a monotone-submodular coverage value function
for the compounding claim — and the *network-cumulative reuse value* `R(T,t)` as
the new object none of the prior art defines. Claim the composition and the
object; do **not** claim to have invented energy models, Hopfield capacity, or
free energy.

---

## 4. The one concrete near-term lever (implementable now)

**Replace the inert `satisfaction ≥ 0.85 AND ≥2 hits` deny gate with a
free-energy admission score plus a Hopfield separation guard — two scalars,
no retraining, ~30 lines.**

1. **Free-energy gate.** Over the retrieved hits' similarity scores `simᵢ(q)`:
   `E(q) = −T · logsumexp_i(simᵢ(q)/T)`; **deny the web call iff `−E(q) ≥ τ`.**
   This makes multiple moderate hits *accumulate* confidence (fixing the
   ceiling) and lives on the real energy distribution, not on an unreachable
   point of the `[0.3,1]` composite.
2. **Separation guard (Hopfield).** Also require
   `β·Δ ≥ log(2(N−1)Nβ)` where `Δ = sim(q,x₍₁₎) − sim(q,x₍₂₎)` is the
   best-vs-second-best gap and `N` is the live cached-pattern count. This makes
   the gate **automatically stricter as the federated cache grows** (more
   patterns → more crowding → demand more separation) and rejects the metastable
   "dangerous zone" (two topically-close answers) directly.
3. **Fit `T`, `τ`, `β` once** by ECE/NLL minimization (Guo 2017) on the
   in-corpus vs out-of-corpus set the `bench-deny-real` harness already
   produces. Single sharpness dial `β` replaces the magic 0.85;
   `FOLKLORE_DENY_THRESHOLD` becomes a target-TPR knob on the energy
   distribution.
4. **Benchmark against vCache** (per-embedding error-bounded threshold,
   arXiv:2502.03771) as the SOTA single-node baseline — the energy+separation
   gate must match or beat its hit-rate/error trade-off to be worth shipping.

Why this and not the others: it is the only lever that is (a) directly
implementable on the existing harness, (b) fixes the *measured* 0.0%-deflection
calibration failure, and (c) grounded in established, citable method
(energy-OOD + temperature scaling + Hopfield separation) rather than analogy.

---

## 5. `[SPECULATIVE but defensible]` — the "new field" framing

**Candidate object.** A *federated knowledge manifold* `M` (the shared
embedding sphere `S^{d−1}` of all peers' cached answers). Each cached inference
`ξᵢ` is a stored pattern that **lowers an energy basin** around its embedding;
the network's energy landscape is `E_net(q) = −lse(β, X_∪ᵀ q)` over the
deduplicated **union** `X_∪` of all peers' patterns. A query is resolved by
**energy descent** to the nearest basin (one Hopfield/attention step); a *miss*
is a query whose energy stays above threshold (no basin deep enough) → it is
researched once, then **deposited as a new basin that all peers inherit.**

**Candidate definitions.**
- **Reach** `R(T,t)` = the peer set holding a basin for topic `T` at time `t`.
- **Coverage value** `g_T(S)` = expected compute saved when peer-set `S` holds
  `T`; **axiomatically monotone non-decreasing and submodular in `S`.**
- **Network free energy** `[ANALOGY — flag explicitly]`
  `F_net(t) = E_{T∼demand}[ resolution_cost(T, R(T,t)) ]` = expected cost to
  resolve a demanded topic. **Compounding inference = `F_net(t)` monotonically
  non-increasing in `t`** as basins fill — but stated rigorously this is *not*
  Friston free energy; it is the **monotonicity of a submodular coverage
  objective**, and should be presented that way.

**What would have to be PROVEN to make it a field, not a metaphor.**
1. **Monotone-coverage theorem (the core, *achievable*).** Under a fill rule
   (every researched miss is deposited and propagated), prove `g_T(·)` is
   monotone submodular ⇒ `F_net(t)` non-increasing and a greedy/online share
   policy is within `(1−1/e)` of optimal. This is the rigorous restatement of
   the central thesis and the most defensible deliverable.
2. **Distributed separation / capacity theorem (genuinely open).** Bound the
   reliable capacity of the *union* landscape under partial replication and
   per-peer sharding — i.e. extend the Ramsauer/Hu–Wu–Liu spherical-code
   capacity from one node to a federation with a separation condition for
   no-collapse retrieval. **No prior theory exists** (the closest, Alessandrelli
   et al. 2026 "Federated Many-to-One Hopfield", arXiv:2603.19902, does
   federated *archetype consolidation*, not partitioned content-addressable
   retrieval). This is the real research frontier.
3. **Calibrated admissibility under federation.** Carry vCache's per-entry
   error-bounded threshold (arXiv:2502.03771) into the federated setting: prove
   a network-level error bound holds when basins are contributed by mutually
   untrusted peers (ties to the existing trust×relevance gate).

**Nearest prior art so we don't reinvent it.** EBM (LeCun 2006) and JEPA
(LeCun 2022) own "compatibility as energy." Hopfield/Ramsauer (2020) +
Hu–Wu–Liu (2024) own associative-memory capacity. FemtoCaching (2013) +
Ioannidis–Yeh (2016) own submodular distributed caching. vCache (2025) owns
error-bounded semantic-cache admission. Probabilistic Language Tries (2026) owns
single-node amortized reuse. **The unclaimed center is the *federated,
time-cumulative reuse value function* `R(T,t)` plus the *distributed* capacity
theorem — the composition, not any single piece.** Claim the composition and
prove (1); pursue (2) as the headline open problem; treat all "network free
energy as physics" language as flagged analogy.

---

### Sources

EBM/JEPA: LeCun et al. 2006 (EBM tutorial); LeCun 2022 (OpenReview BZ5a1r-kVsf);
Assran et al. CVPR 2023 (I-JEPA); V-JEPA 2 arXiv:2506.09985. Calibration/OOD:
Guo et al. ICML 2017 arXiv:1706.04599; Liu et al. NeurIPS 2020 arXiv:2010.03759.
Hopfield: Ramsauer et al. ICLR 2021 arXiv:2008.02217; Krotov & Hopfield 2016
arXiv:1606.01164; Demircigil et al. 2017 arXiv:1702.01929; Hu, Wu & Liu NeurIPS
2024 arXiv:2410.23126; Amit-Gutfreund-Sompolinsky 1985 PRL 55:1530;
Alessandrelli et al. 2026 arXiv:2603.19902. FEP/VI/thermo/submodular: Friston
2010 Nat Rev Neurosci 11:127; Blei-Kucukelbir-McAuliffe 2017 arXiv:1601.00670;
Landauer 1961 IBM J; Tishby-Pereira-Bialek 1999 arXiv:physics/0004057;
Nemhauser-Wolsey-Fisher 1978 Math Prog 14:265; Shanmugam et al. 2013
(FemtoCaching); Ioannidis & Yeh SIGMETRICS 2016 arXiv:1604.03175. Reuse SOTA:
Kwon et al. SOSP 2023 (vLLM); Zheng et al. NeurIPS 2024 arXiv:2312.07104
(SGLang); Gim et al. MLSys 2024 arXiv:2311.04934 (Prompt Cache);
MeanCache arXiv:2403.02694; vCache arXiv:2502.03771; Async Verified Semantic
Caching arXiv:2602.13165; Magarshak 2026 arXiv:2604.06228 (Probabilistic
Language Tries). Library traction verified on GitHub 2026-06-18: vLLM ~83k★
(active), SGLang ~29k★ (active), LMCache ~9.3k★ (active), Mem0 ~48k★ (active),
**GPTCache ~8k★ — last push Jul-2025, maintenance-mode/STALE**,
ml-jku/hopfield-layers ~1.9k★ — **last push Apr-2023, frozen/STALE (pin it)**,
facebookresearch/ijepa **ARCHIVED Aug-2024 (use vjepa2 ~4.2k★ instead)**.
