# Knowledge-degradation dynamics — a formal model and anti-degradation mechanisms

> **What this is.** A solution-architect's mathematical formulation of *how a
> federated knowledge cache decays over time* and *which mechanisms provably (or
> defensibly) prevent that decay*, written to compose with the existing
> energy/Hopfield/submodular framing in
> [energy-based-inference.md](energy-based-inference.md),
> [energy-based-inference-web.md](energy-based-inference-web.md), and the measured
> reality of the deny gate ([deny-gate-calibration.md](deny-gate-calibration.md),
> [../protocol/DENY-CALIBRATION-REAL.md](../protocol/DENY-CALIBRATION-REAL.md);
> real-query AUC = 0.52, gate inert, 0.0% deflection). 2026-06-18.
>
> The prior synthesis named the **gain** side: `R(T,t)` as a monotone-submodular
> coverage value, with `F_net(t)` (expected resolution cost) as its Lyapunov
> function and a `(1−1/e)` greedy guarantee. That synthesis explicitly flagged
> that monotonicity is **broken** in practice by "semantic drift, sub-0.85
> near-misses, LRU eviction, and TTL decay." **This note formalizes that
> breaking term** — the decay functional `D(t)` that opposes the gain — and then
> gives, per inspiration, the real mathematics that *raises a floor under* the
> cache.
>
> Rigor is tiered explicitly throughout: **`[RIGOROUS]`** (a theorem or an
> established method applied directly), **`[ANALOGY]`** (a real mechanism whose
> mapping to Folklore is a defensible model but not a theorem),
> **`[SPECULATIVE]`** (a defensible research bet, not yet proven), and
> **`[NUMEROLOGY — not rigorous]`** (evocative language with no load-bearing
> math; do not build on it).

---

## Part 1 — The formal degradation model

### 1.1 The object and the two opposing functionals

Recall the gain side (prior synthesis). For a topic `T`, `R(T,t) ⊆ Peers` is the
peer set holding a usable basin for `T` at time `t`; `g_T(S)` is the expected
compute saved when peer-set `S` covers `T`, and is **monotone submodular** in `S`
(Nemhauser–Wolsey–Fisher 1978). The network's compounding objective is the
**non-increasing** expected resolution cost

```
F_net(t) = E_{T∼demand}[ resolution_cost(T, R(T,t)) ].
```

Compounding inference ⇔ `F_net(t)` monotone non-increasing. The prior work
proved this *holds when fill happens and nothing decays*. The honest gap is that
**fill is not the only force on the cache**. Define a per-node *usable value*
that decays:

For a cached node `n` deposited at time `t_n`, with embedding `x_n ∈ S^{d−1}`,
trust `τ_n`, and content answering query distribution near a centroid `c_n`,
define its **instantaneous usable value to a query `q`**

```
v_n(q, t) = τ_n(t) · ρ(x_n, q) · φ_n(t)                              (1)
```

where `ρ` is relevance (cosine/energy), and `φ_n(t) ∈ [0,1]` is a **freshness /
correctness survival factor** — the probability the cached answer is still
correct at time `t`. The decay model lives in three multiplicative factors:
`τ_n(t)` (trust erosion), `ρ` (relevance, eroded by *embedding drift* — §1.4),
and `φ_n(t)` (staleness — §1.2). Eviction (§1.5) is a separate, discontinuous
force that sets `v_n ≡ 0` when a node is dropped.

The **degradation functional** is the expected *loss* of coverage value over the
demanded topic distribution between deposits:

```
D(t) = E_{T∼demand}[ g_T(R(T,t)) − g_T(R^{usable}(T,t)) ]            (2)
```

where `R^{usable}(T,t) = { p ∈ R(T,t) : v_{n_p}(·,t) ≥ θ_use }` is the subset of
peers whose basin is *still good enough to deny on*. `D(t) ≥ 0`, and `D(t) > 0`
is **exactly the term that breaks monotonicity of `g_T(R(T,t))`** as a usable
coverage: nodes are nominally present (`R` grows) but not usable (`R^{usable}`
shrinks). The net coverage dynamics are a **birth–death / renewal** balance:

```
d/dt  E[g_T(R^{usable})]  =  λ_fill(t)·Δ_fill(t)  −  λ_decay(t)·Δ_decay(t)   (3)
                              └── submodular gain ──┘   └── degradation D ──┘
```

This is the central reframing: **the prior synthesis proved the first term ≥ 0
and submodular; this note characterizes the second term and the condition under
which it loses.**

### 1.2 Staleness: which decay law for `φ_n(t)`?

Two candidate survival laws, both real, with different tails:

- **Exponential (memoryless / Poisson-invalidation).** If the world-fact behind a
  cached answer is invalidated by a Poisson process of rate `μ_T` (volatility of
  topic `T`), then `φ_n(t) = e^{−μ_T (t − t_n)}`. This is the TTL model: a
  half-life `t_{½} = ln2 / μ_T`. **`[RIGOROUS]`** under the Poisson assumption,
  and it is the law that matches "TTL matched to volatility" already recommended
  in `deny-gate-calibration.md`.
- **Power-law (heavy-tailed forgetting).** Human retention does **not** decay
  exponentially; the **Wickelgren power law** (Wickelgren 1974, *single-trace
  fragility theory*; Wixted & Carpenter 2007, *Psych. Sci.*) is
  `m(t) = λ(1 + βt)^{−ψ}`, an inverse-power curve. Power-law tails mean *old
  knowledge that survived this long is likely to keep surviving* — exactly the
  "stable facts stay stable, volatile facts churn early" regime. **`[ANALOGY,
  defensible]`** for Folklore: a *mixture* of volatilities across topics induces a
  power-law-like aggregate even when each topic is exponential (a known result —
  a Gamma mixture of exponentials is a Pareto/Lomax survival; Anderson & Schooler's
  rational-analysis line). The architecturally honest move: **estimate `μ_T`
  per-topic from observed re-fetch invalidations** rather than imposing one global
  decay shape.

**Folklore mapping.** `φ_n(t)` is the missing multiplicative factor flagged in
DENY-CALIBRATION-REAL §"freshness rule is cosmetic": `age_days` currently feeds
the *trust base* but **not** the multiplicative relevance gate. Wiring
`φ_n(t)=e^{−μ_T·age}` (with a per-topic `μ_T`, default the inverse of the current
7-day window) into the satisfaction product `satisfaction = (trust − penalty) ·
relevance · φ` is the **direct, implementable** fix and is consistent with the
already-queued lever "wire `age_days` into the relevance gate multiplicatively."

### 1.3 Trust erosion `τ_n(t)`

EigenTrust supplies a stationary trust vector `t = Cᵀt` (principal eigenvector of
the normalized peer-trust matrix). Trust *erosion* is two effects: (a) reputation
half-life — the 30-day reputation window already in the code is an exponential
forget on peer reliability evidence; (b) provenance staleness — a node whose
source peer has gone offline or been down-weighted loses derived trust. Both are
multiplicative damping on `τ_n`. **`[RIGOROUS as control, ANALOGY as "erosion"]`**:
the EigenTrust fixed point is rigorous; calling its time-variation "erosion" is a
modeling choice, fine as long as `τ_n(t)` is computed, not narrated.

### 1.4 Embedding drift — the relevance-erosion term

This is the subtlest and most important decay channel, and the one the
spherical-packing mechanism (§2.1) directly attacks. Two distinct drifts:

1. **Embedder-version drift (extrinsic).** When the embedding model is upgraded
   (MiniLM-384 → nomic/bge, as `sota-retrieval-synthesis.md` contemplates), every
   stored `x_n` was computed under the *old* map `E_old`. A live query `q` is
   embedded under `E_new`. Cosine `ρ(x_n, q)` is then comparing vectors from two
   different metric spaces — relevance is silently corrupted. **`[RIGOROUS as a
   stated failure]`:** without re-embedding, `ρ` is not a valid similarity. Lever:
   stamp every node with `embedder_version`; on a version bump, **re-embed lazily
   on access** (or eagerly in a background sweep) — an *error-correcting refresh*
   (§2.2). This is the cache analogue of a coordinate change; it is a hard
   correctness bug, not a soft decay.
2. **Concept drift (intrinsic).** The *meaning* of a query term shifts (e.g., a
   library name now refers to a new major version). The stored answer's centroid
   `c_n` no longer sits where the live demand mass sits; `ρ` stays high
   (lexically/embeddingly similar) while *usable* value drops. This is the
   "answerability ≠ similarity" failure from `deny-gate-calibration.md`. It is
   **not** fixable by re-embedding; it requires re-validation (§2.6, resonance /
   periodic re-fetch of high-demand topics).

Net: relevance decay = embedder drift (a metric-space mismatch — fixable by
re-embedding) **+** concept drift (a content-truth mismatch — fixable only by
re-fetch). Conflating them is a common and expensive error.

### 1.5 Eviction (LRU) and the vocabulary-mismatch coverage hole

LRU/LFU eviction sets `v_n ≡ 0` discontinuously. The cooperative-cache model
already in the synthesis (Che approximation, `h ≈ 1 − e^{−q·t_C}`) governs *which*
nodes survive: a node referenced with demand rate `q_n` survives if its inter-
reference gap is below the characteristic time `t_C` of the pooled cache. So
eviction is **demand-weighted**, which is benign for the head of the demand
distribution and lethal for the **cold tail** — rarely-queried-but-correct
knowledge gets evicted first. Two consequences:

- **Coverage erosion is concentrated in the tail.** The submodular gain `g_T`
  weights by demand; evicting cold tail nodes barely moves `F_net`. So *for the
  compounding objective, LRU eviction is close to harmless* — a genuinely
  reassuring result that falls straight out of the existing model. **`[RIGOROUS]`**
  given the Che model + demand-weighted `g_T`.
- **Vocabulary mismatch** is the coverage hole that eviction *cannot* see: a
  correct node exists but the live query phrases the need with non-overlapping
  tokens, so retrieval never surfaces it (it looks cold, gets evicted, and the
  knowledge is lost even though demand existed). This is the
  `COVERAGE_WEIGHT` substring-coverage failure. Lever: **token-set / learned-
  sparse coverage** (already the #1 queued lever) keeps such nodes *retrievable*,
  hence *warm*, hence *un-evicted* — coverage repair and eviction repair are the
  same fix here.

### 1.6 The non-collapse condition (when gain beats decay)

Model coverage of a topic `T` as a **birth–death process on the count of usable
replicas** `k_T(t) = |R^{usable}(T,t)|`. Births: a researched miss is deposited
and propagated at rate `λ_T` (demand × deposit-probability × propagation fanout).
Deaths: each usable replica decays/evicts independently at per-node rate `δ_T`
(the composite of §1.2–1.5: `δ_T ≈ μ_T + ε_evict + ε_drift`). This is an
**M/M/∞-style immigration–death** process; its stationary mean is

```
E[k_T(∞)] = λ_T / δ_T.                                              (4)
```

**Non-collapse condition (the floor).** Topic `T`'s basin persists in
expectation (does not vanish to a forced web round-trip) iff

```
λ_T  >  δ_T  · k_min                                                (5)
```

where `k_min` is the minimum replica count the deny gate requires (today
`minHits`-style `k_min = 2`; see §2.2 for why a *durability* target sets it). In
branching-process language this is the **supercritical** condition (mean
offspring per node > 1): below it the basin is **subcritical** and goes extinct
with probability 1; above it, it survives. The *whole-network* non-collapse is
the per-topic condition (5) holding for every demanded topic — i.e. the slowest-
refilled, fastest-decaying topic sets the binding constraint. **`[RIGOROUS]`**
under the independence/Markov assumptions; these are idealizations (deposits are
correlated, decay is not exponential for all topics), so treat (4)–(5) as the
**design inequality** the engineering levers must satisfy, not a measured law.

**This is the precise statement of "never research the same thing twice":** the
network avoids re-research of `T` iff `T` is supercritical. The anti-degradation
mechanisms of Part 2 are, each, a way to **lower `δ_T`** (slower decay) or
**guarantee a higher effective `λ_T`** (cheaper/more reliable refill) so that (5)
holds for more topics.

---

## Part 2 — Anti-degradation mechanisms

Ordered by strength of the real bridge: spherical packing ↔ Hopfield capacity
first (the strongest), then redundancy/ECC ↔ durability, graph-Laplacian
diffusion, CRDT causal time, then the weaker analogies (information bounds,
resonance), and finally the numerology to drop.

### 2.1 Spherical packing ↔ Hopfield capacity — separation-maximizing placement **[RIGOROUS — the headline mechanism]**

**The math.** Cached patterns live on the unit sphere `S^{d−1}` (embeddings are
L2-normalized). Modern-Hopfield retrieval (Ramsauer et al., ICLR 2021,
arXiv:2008.02217) — which Folklore's softmax-over-cosine reranker *already is*,
one CCCP step `ξ_new = X·softmax(βXᵀξ)` — retrieves pattern `i` cleanly iff its
**separation** `Δ_i = min_{j≠i}(x_iᵀx_i − x_iᵀx_j)` exceeds a threshold growing in
the pattern count: `Δ_i ≳ (1/β)·log(2(N−1)Nβ M²)`. The post-update error is
**exponentially small in `β·Δ_i`**. Hu, Wu & Liu (NeurIPS 2024,
arXiv:2410.23126) closed the capacity bound: it is *tight*, and is achieved
**exactly when the stored patterns form an optimal spherical code** — a set of
points on `S^{d−1}` that maximizes the minimum pairwise distance.

This is the **Tammes problem** (Tammes 1930; Cohn's spherical-codes program; the
general problem is open but near-optimal constructions are known) and its
near-optimal practical solution is the **Fibonacci / golden-angle lattice**
(Gonzalez 2010, *Math. Geosci.* 42:49; the golden angle 137.5° = 360°·(1−1/φ)
gives Voronoi cells of near-equal area, ≥40% lower RMS area error than naive
lattices). **Phyllotaxis / the golden ratio is therefore a *real* bridge, not
decoration:** the same golden-angle construction that distributes seeds on a
sunflower head distributes points near-optimally on a sphere, and *near-optimal
spherical packing is exactly the configuration that maximizes Hopfield retrieval
capacity and minimizes metastable collapse.*

**Folklore mapping — degradation channel attacked.** The measured failure (AUC =
0.52, the "metastable / off-topic hub looks relevant" regime, commit `80836d8`)
is precisely **insufficient separation**: two topically-close cached answers
collapse into one blurred basin. Embedding *drift* (§1.4) and federated
*duplication* (two peers deposit near-identical answers for the same topic) both
*reduce* `min_{i≠j} Δ` over time — separation erodes as the cache grows and as
peers redundantly fill. So **separation is a decaying quantity**, and maintaining
it is anti-degradation.

**Implementable lever (separation-maximizing dedup / placement).** On deposit of
a candidate `x_new`:
1. Compute `Δ_new = max_j x_newᵀx_j` (nearest existing pattern).
2. If `Δ_new` is *too large* (cosine too close, i.e. a near-duplicate of an
   existing basin), **do not add a new basin** — instead *merge*: increment the
   existing node's replica/consensus count (raising its `τ` and durability, §2.2)
   rather than crowding the sphere. This is **separation-preserving dedup**.
3. If a region of `S^{d−1}` is over-dense (many basins within angular `θ_min`),
   prefer eviction *there* (LRU within the crowded cell) — i.e. **eviction
   targets the over-packed region**, actively *restoring* separation, the inverse
   of generic LRU. The golden-angle lattice gives the target spacing `θ_min` as a
   function of how many distinct basins the corpus actually needs.
4. The separation guard `β·Δ ≥ log(2(N−1)Nβ)` from the prior synthesis becomes
   the deny criterion that is **automatically stricter as `N` grows** — decay-
   aware by construction.

**Why this is the strongest bridge.** It is the one inspiration where the
"woo" word (golden ratio / spiral / phyllotaxis) maps onto an *exact theorem*
(spherical-code optimality ⇔ Hopfield-capacity optimality) and onto the
*measured* failure mode (metastable collapse / AUC 0.52). Dimension is never the
binding constraint (a `d=384` sphere holds `O(2^{96})` separable patterns —
astronomically beyond any corpus); **separation is the binding constraint, and it
decays**, so maintaining it is a real, implementable anti-degradation policy.
Flag: the *capacity theorem* is rigorous; the claim that golden-angle placement
is *optimal* for a real (non-uniform, demand-clustered) embedding distribution is
**`[SPECULATIVE]`** — uniform-sphere optimality does not transfer unchanged to a
clustered manifold. The defensible engineering claim is weaker and still useful:
*separation-maximizing dedup raises `min Δ`, which provably lowers retrieval
error.*

### 2.2 DNA repair / ECC ↔ durability + CRDT convergence **[RIGOROUS]**

**The math.** Biological self-repair (DNA mismatch repair, polymerase
proofreading, replication redundancy) is, formally, **error-correcting coding +
replication for durability**. Two layers:

- **Replication for durability.** With independent per-node loss probability
  `p_loss` over a window and replication factor `r`, the probability a topic's
  basin is *entirely* lost is `p_loss^r`. To hold loss below a target ε,
  `r ≥ ln ε / ln p_loss`. This **sets `k_min`** in the non-collapse condition (5):
  durability is *why* you need ≥ k replicas, and (5) then says refill rate must
  beat decay rate to *maintain* them. **`[RIGOROUS]`.**
- **Erasure coding for sub-replica efficiency.** Reed–Solomon / LDPC / **fountain
  (LT/Raptor) codes** (Luby 2002; rateless, near-optimal erasure correction)
  achieve the same durability at far lower storage overhead than naive
  replication: an `(n,k)` code tolerates `n−k` erasures, so durability `r`-fold
  replication needs `r×` storage while an erasure code needs only `n/k×`.
  **`[RIGOROUS]`**, but with an honest caveat: erasure-coding a *semantic cache*
  is awkward — you can erasure-code the *raw artifact bytes* (the fetched
  document) cleanly, but the *embedding/basin* is the unit of retrieval and is
  cheap to recompute from the artifact, so the natural design is **replicate the
  small embedding + erasure-code the large artifact**.
- **CRDT convergence as the repair substrate.** Folklore uses Y.js, which
  implements a CRDT with **strong eventual consistency** (Shapiro, Preguiça,
  Baquero & Zawirski 2011): replicas receiving the same update set converge
  regardless of order, via commutativity/associativity/idempotence. This is the
  *homeostatic* substrate — it guarantees the repaired/merged state is consistent
  across peers without a coordinator. **`[RIGOROUS]`.**

**Homeostasis / control-theory framing.** Single-cell set-point regulation maps
to **negative-feedback control with a Lyapunov function**. Treat the usable
replica count `k_T(t)` as the controlled variable with set-point `k* = k_min`.
The repair policy is a controller: when `k_T < k*`, trigger re-deposit /
re-propagation (raise `λ_T`); the error `e = k* − k_T` drives the actuation.
`F_net(t)` is the Lyapunov/storage function the prior synthesis already
identified; the repair controller keeps the system in its basin. **`[RIGOROUS as
control theory; ANALOGY as "homeostasis"]`** — the control loop is real and
implementable; "homeostasis" is the biological label for it.

**Implementable lever (a redundancy/repair policy keeping `R` above a floor).**
A background daemon that, per demanded topic, (i) measures `k_T`, (ii) if
`k_T < k_min` re-propagates the basin to additional peers (births to satisfy (5)),
(iii) on embedder-version bump, re-embeds stored basins (the §1.4 metric-space
repair), (iv) maintains tombstones for evicted/superseded nodes so the CRDT does
not resurrect stale state (ties to §2.4). This is the concrete realization of
"keep `R(T,t)` above a floor."

### 2.3 Maxwell ↔ graph-Laplacian diffusion + the admission gate as a demon **[RIGOROUS diffusion; ANALOGY demon]**

**The math (rigorous).** Knowledge propagation across peers is **diffusion on the
peer/knowledge graph**. The graph Laplacian `L = D − A`; the heat equation
`∂u/∂t = −Lu` has solution `u(t) = e^{−tL}u(0)`, the **heat kernel** `H_t =
e^{−tL}` (Kondor & Lafferty, ICML 2002 — the discrete counterpart of the Gaussian
kernel). This is *the same operator family* as the PPR retrieval rerank already in
Folklore: PPR solves `(I−(1−α)W)x = αs`, whose stationary point minimizes the
**Dirichlet energy** `½(1−α)xᵀ(I−W)x + ½α‖x−s‖²` — a regularized diffusion. So
the existing PPR/EigenTrust machinery *is* graph diffusion; the heat-kernel view
adds the **time axis** that the static rerank lacks. **`[RIGOROUS]`.**

**Anti-degradation use.** Diffusion is how a freshly-deposited basin *reaches*
the `k_min` peers required by (5): the deposit is an impulse `u(0)=δ_{peer}`, and
`e^{−tL}` describes how fast it spreads. **Propagation speed = the Fiedler value
`λ_2(L)`** (algebraic connectivity): a well-connected peer graph refills basins
fast (high effective `λ_T`), a fragmented one leaves topics subcritical. **Lever:**
monitor `λ_2(L)` of the live peer graph; if it drops (federation fragmenting),
the non-collapse margin (5) shrinks network-wide — this is a *measurable early-
warning signal for systemic degradation*. The wave equation `∂²u/∂t² = −Lu` adds
nothing rigorous here; diffusion (heat, first-order) is the right model.

**The demon (analogy, with a real cost floor).** The admission gate is an
entropy-sorting device: it lets *low-energy* (high-confidence, in-corpus) queries
be answered from cache and *rejects* high-energy ones to the web — sorting "hot"
(needs fresh research) from "cold" (cached) exactly like **Maxwell's demon**
sorting molecules. The honest content: sorting is not free — **Landauer's bound**
(1961) says each irreversible admit/reject decision (one bit erased) costs
`≥ k_BT ln2 ≈ 3×10⁻²¹ J`. **`[ANALOGY]`** and explicitly **non-load-bearing**:
the Landauer floor is ~10²⁰× below the dollar/latency cost of one LLM
re-derivation, so it is a poetic floor, never a design constraint. "Maxwell's
equations of knowledge" is **not** a thing — only the *diffusion* (Laplacian) and
the *demon-as-sorter* (entropy reduction at a cost) are real, and only the former
is load-bearing.

### 2.4 Einstein ↔ distributed simultaneity = CRDT causal time **[RIGOROUS as partial order; ANALOGY as relativity]**

**The math.** A P2P network has **no global clock**, so "which cached version is
fresher" cannot be decided by wall-clock comparison across peers — clock skew
makes wall-clock ordering *wrong*. The rigorous analogue of "relativity of
simultaneity" is the **partial order of events**: Lamport clocks (1978) give a
consistent total-order-respecting-causality, and **vector clocks** give the exact
causal (happens-before) partial order. CRDTs (Shapiro 2011; Y.js) encode this:
concurrent updates with no causal edge are *genuinely simultaneous* (no fact of
the matter about ordering), and the CRDT merge is defined to be correct for
*any* linearization consistent with the partial order. **`[RIGOROUS]`.**

**Anti-degradation use.** Map **freshness/staleness ordering to causal order, not
wall-clock.** A cached node is "superseded" only if a *causally later* update
(vector-clock dominance) revised the same topic — not merely if some peer's wall-
clock is higher. This prevents two degradation bugs: (a) a clock-skewed peer
wrongly evicting a fresher node, and (b) the "lost update" where a stale write
with a high wall-clock clobbers a fresh one. **Lever:** stamp basins with vector
clocks (Y.js already provides the causal metadata); freshness comparisons and
tombstone decisions use causal dominance. This makes the §1.2 staleness factor
`φ_n` *causally* correct.

**Honest flag.** The *partial-order-of-events* structure is a real shared
mathematical core between special relativity (the causal/light-cone partial
order) and distributed systems (happens-before). It is **`[ANALOGY]`** to call
this "relativity"; the rigorous, citable object is **Lamport/vector clocks +
CRDT causal consistency**. Use that language; "relativistic knowledge" is
decorative.

### 2.5 Hawking ↔ information bounds + recoverability of evicted knowledge **[ANALOGY / bounds — not load-bearing]**

**The math (real but slack).** Ultimate information bounds: **Bekenstein** bounds
information in a region by its energy×radius; **Landauer** (§2.3) bounds erasure
cost. Both are *real* and both are **astronomically slack** versus practical
rate-distortion limits — the binding limit on Folklore is the embedder's bits-
per-vector and the corpus's intrinsic dimension, not any physical bound. So these
are **`[ANALOGY / bounds]`**, cite-as-floor only.

**The one useful question it frames — recoverability.** "Hawking radiation as slow
leakage" = the decay rate `δ_T` of §1.6 (knowledge leaking out of the cache over
time). The **black-hole information paradox** — *is information that fell in
recoverable?* — maps onto a genuinely real engineering question: **is evicted
knowledge recoverable?** Three mechanisms make Folklore's answer "yes" (unlike a
naive LRU cache that loses information irreversibly):
- **Provenance / `source_uri`** — an evicted node's *origin* survives, so it can
  be re-fetched (the artifact is recoverable from the source).
- **CRDT tombstones** — eviction is logged as a tombstone, not a silent delete,
  so the *fact of prior knowledge* and its causal position survive.
- **Deposit logs** (`miss-log.jsonl` already exists) — the record that a topic
  was researched survives eviction of the answer itself.
So Folklore is **information-preserving under eviction** in the recoverability
sense, even though the working-set value `v_n` goes to 0. That is a real, modest,
defensible property. **`[ANALOGY]`** for the physics; **`[RIGOROUS]`** for the
plain statement "provenance + tombstones + deposit logs make eviction reversible."

### 2.6 Tesla ↔ resonance = periodic re-validation; refusal of 3-6-9 **[ANALOGY useful; NUMEROLOGY to drop]**

**The real mapping `[ANALOGY, useful].`** "Resonance / oscillation" maps onto
**periodic re-validation cycles** and **demand-driven amplification**:
- *Refresh cycles.* High-volatility topics (high `μ_T`, §1.2) should be
  re-validated on a period `≈ t_{½} = ln2/μ_T` — a topic-specific refresh
  *frequency*. This is the staleness rule restated as a clock. It directly
  counters concept-drift (§1.4 case 2), the channel re-embedding can't fix.
- *Resonant amplification of high-demand topics.* A topic queried at high rate
  `q_T` should get a *higher* replica set-point `k*` and *more frequent* refresh —
  the cache "rings louder" where demand drives it, exactly the `λ_T ∝ q_T`
  coupling that makes high-demand topics easily supercritical in (5). This is
  also why submodular gain `g_T` is demand-weighted: resonance and the coverage
  objective agree.

**The numerology, named and refused. `[NUMEROLOGY — not rigorous]`** Tesla's
"3-6-9" has **no mathematical content** for this system (or any). There is no
sense in which 3, 6, or 9 replicas/peers/refresh-periods is privileged; `k_min`
comes from the durability calculation (§2.2, `r ≥ ln ε/ln p_loss`) and the
non-collapse condition (§1.6), which yield whatever integer those inputs imply —
typically 2–4, and *for reasons*. **Do not build any "3-6-9" structure into
Folklore.** Likewise, the golden ratio is load-bearing **only** through the
spherical-code/Hopfield bridge of §2.1 (a real theorem); invoking φ anywhere else
(growth schedules, refresh periods, trust weights) would be numerology — flag and
refuse it the same way.

---

## Part 3 — Composition with the energy / Hopfield / submodular framing

The mechanisms are not independent patches; they compose around the single
energy/coverage spine the prior synthesis built. The key compositions:

- **Separation (§2.1) ⊗ the deny gate (energy-OOD).** The energy-OOD admission
  score `−E(q) = T·logsumexp_i(sim_i/T)` and the Hopfield separation guard
  `β·Δ ≥ log(2(N−1)Nβ)` are the *same object* viewed two ways: `E` is the basin
  depth, `Δ` is the basin separation. Maintaining separation (§2.1 dedup/placement)
  *directly improves the discriminability* (AUC) the gate needs — i.e. the
  anti-degradation placement policy is also the fix for the measured 0.52-AUC
  inertness. **These two compose multiplicatively and should ship together.**
- **Decay `φ` (§1.2) ⊗ satisfaction.** `φ_n(t)` enters the satisfaction product
  as a third multiplicative factor, so the gate becomes time-aware without any new
  functional form: `−E(q)` is computed over `sim_i·φ_i` instead of `sim_i`. Stale
  basins automatically lose energy and stop denying. Composes cleanly.
- **Durability `k_min` (§2.2) ⊗ non-collapse (§1.6) ⊗ submodular gain.** The ECC
  durability calculation *sets* `k_min`; the birth–death condition (5) says the
  greedy fill must beat decay to *hold* `k_min`; the `(1−1/e)` submodular guarantee
  says greedy fill is near-optimal *at* doing so. The three are one argument:
  **a durability-floored, decay-aware, greedily-filled cache is provably within
  `(1−1/e)` of the best maintainable coverage** — this is the clean theorem to
  state, strictly stronger than the prior "fill-only" coverage result because it
  carries the decay term.
- **Diffusion `λ_2(L)` (§2.3) ⊗ effective `λ_T`.** Algebraic connectivity sets the
  *refill rate* in (5); it is the network-topology input to the non-collapse
  condition. Monitoring it is monitoring the margin of the whole compounding
  thesis.
- **CRDT causal time (§2.4)** is the substrate under all of the above:
  separation-dedup merges, repair re-propagation, and `φ`-based supersession are
  all CRDT operations whose convergence (Shapiro 2011) is what makes the federated
  version of every mechanism well-defined.

The one mechanism that **does not compose** and should be quarantined as language:
the Friston "network free energy as physics" framing (already flagged in the prior
synthesis) and the Maxwell/Hawking *physics* (as opposed to the diffusion and
recoverability content). They share a *word* with the rigorous core but add no
constraint; keeping them in the formal model would import unfalsifiability.

---

## Part 4 — Ranked, honest next steps

**A. Provable (claim and prove these).**
1. **Decay-aware monotone-coverage theorem.** Extend the prior fill-only result
   with the birth–death decay term (§1.6): prove that under repair policy (§2.2)
   satisfying `λ_T > δ_T·k_min` for all demanded `T`, usable coverage
   `E[g_T(R^{usable})]` is non-decreasing and greedy fill is within `(1−1/e)` of
   the best *maintainable* coverage. **Most defensible first result; strictly
   generalizes the existing thesis by carrying the term that breaks it.**
2. **Separation-erosion bound.** Quantify how `min_{i≠j}Δ` decays under federated
   duplication + drift, and prove separation-maximizing dedup (§2.1) keeps it above
   the Hopfield retrieval threshold. Ties the strongest real bridge to a theorem.
   Honest open part: optimality on a *clustered* (non-uniform) manifold is
   `[SPECULATIVE]`.

**B. Engineering levers (implement now, no theorem needed).**
1. **Wire `φ_n(t)=e^{−μ_T·age}` into the satisfaction product, multiplicatively,
   with per-topic `μ_T` estimated from re-fetch invalidations.** Fixes the
   "freshness is cosmetic" bug; directly supports condition (5). *Highest-value,
   lowest-risk — this is the single most implementable anti-degradation lever.*
2. **Separation-preserving dedup on deposit** (§2.1 steps 1–3): merge near-
   duplicates into replica-count increments, target eviction at over-packed
   spherical cells. Improves both durability *and* gate AUC.
3. **Embedder-version stamping + lazy re-embed on bump** (§1.4 / §2.2): closes the
   hard metric-space-mismatch correctness bug.
4. **Repair daemon** maintaining `k_T ≥ k_min` (§2.2 control loop) + **monitor
   `λ_2(L)`** (§2.3) as the systemic-degradation early warning.
5. **Causal (vector-clock) freshness/supersession** (§2.4): correctness fix for
   staleness ordering, free with Y.js.

**C. Evocative language to drop (or strictly quarantine).**
- **"3-6-9" — drop entirely. `[NUMEROLOGY]`** No mathematical content.
- **Golden ratio anywhere except the §2.1 spherical-code bridge — drop.** φ is
  load-bearing *only* via Tammes/Hopfield; elsewhere it is numerology.
- **"Maxwell's equations of knowledge", "network free energy as physics",
  "relativistic / Hawking-radiation knowledge" — quarantine as labels.** The
  *content* under them (graph-Laplacian diffusion, submodular coverage, causal
  partial order, recoverability via provenance) is rigorous and should be named
  by its rigorous name; the physics words add unfalsifiability and should never
  appear in a claim, only (sparingly) as intuition pumps.

---

### Sources (verified 2026-06-18)

Degradation/forgetting: Wickelgren 1974 (single-trace fragility theory);
Wixted & Carpenter 2007 *Psych. Sci.* 18:133 (Wickelgren power law ↔ Ebbinghaus);
Anderson & Schooler 1991 (rational analysis of forgetting / power law from
exponential mixtures). Spherical packing / Hopfield: Tammes 1930 (dissertation);
Cohn (MIT) spherical-codes program; Gonzalez 2010 *Math. Geosci.* 42:49
(Fibonacci/golden-angle lattice); Ramsauer et al. ICLR 2021 arXiv:2008.02217;
Hu, Wu & Liu NeurIPS 2024 arXiv:2410.23126; Demircigil et al. 2017
arXiv:1702.01929. ECC/durability/CRDT: Luby 2002 (LT/fountain codes; Raptor
extension); Reed–Solomon 1960; Shapiro, Preguiça, Baquero & Zawirski 2011
(CRDTs / strong eventual consistency, INRIA RR-7506); Lamport 1978 *CACM* 21:558
(logical clocks). Diffusion: Kondor & Lafferty ICML 2002 (diffusion/heat kernels
on graphs); Fiedler 1973 (algebraic connectivity). Bounds: Landauer 1961
*IBM J.*; Bekenstein 1981. Coverage/submodular (carried from prior synthesis):
Nemhauser–Wolsey–Fisher 1978 *Math. Prog.* 14:265; Ioannidis & Yeh SIGMETRICS
2016 arXiv:1604.03175; Che et al. (LRU approximation). Calibration/OOD (gate
composition): Guo et al. ICML 2017 arXiv:1706.04599; Liu et al. NeurIPS 2020
arXiv:2010.03759; vCache arXiv:2502.03771. Library traction (carried, verified
2026-06-18): Y.js active (broad local-first ecosystem); vLLM ~83k★, SGLang ~29k★,
LMCache ~9.3k★ active; **GPTCache last push Jul-2025 — STALE**;
`ml-jku/hopfield-layers` frozen Apr-2023 — **port the ~30 lines, do not depend**.
