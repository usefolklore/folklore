# Cross-RQ Synthesis

*Cross-references the seven RQ deep-dives in `rq/`. Every number is reproduced from
those notes; simulator and measured results are labelled inline.*

## What holds

Four claims survive contact with **both** the literature and Folklore's measured
results.

**Reuse-as-context beats reuse-as-replacement, and matching on the question is the
safe channel (RQ1).** MeanCache's query-side matching and vCache's per-prompt
framing independently confirm that the query↔query channel — not query↔document —
is where reuse is reliable. Folklore's measured BEIR lifts move in exactly that
direction: NFCorpus 47.1→97.7%, SciFact 46.1→98.3%, FiQA 34.9→94.7%, with
`hurt=0`. RQ1's discipline is to label these **retrieval recall@1**, not answer
quality, and to note the q2q paraphrase band (~0.71–0.84) sits above the q↔doc
band — the mechanism the lift rides on.

**Energy/OOD admission detects distribution membership (RQ2, RQ5).** The energy
gate `−E(q) = −T·logsumexp(simᵢ/T)` scores AUC 0.78 on a constructed in/out split
(57% true-admit, 0% false-admit at a fitted threshold) versus AUC 0.52 for the old
composite. Li et al.'s two-axis query-knowledge-relevance framing confirms the
decomposition; the gate is the analog of their online goodness-of-fit test. This
is a *measured* real-geometry number, not a simulator one.

**Selectivity, not volume, bounds compounding — the structure is submodular
coverage (RQ5).** S-RAG supplies the exact object Folklore posits — monotone
submodular maximization with the `(1−1/e)` greedy bound — and SUPER shows
empirically (multi-agent RL) that sharing a few highly relevant transitions beats
both no- and full-sharing. Both agree reliability is bounded by retrieval
*precision*, not network size. The literature is *consistent with* Folklore's
structure; it does not confirm the cross-user setting.

**The reranker is one modern-Hopfield step (RQ7).** Ramsauer et al. prove the
continuous Hopfield update *is* softmax attention. The observation is correct but,
the note is careful to say, **not novel** — a restatement of a published theorem.

Provenance carries a smaller measured signal (RQ3): a single signed+attributed peer
hit moved satisfaction 0.13→0.79 (a calibration/UX signal, n likely =1), against a
well-established threat — PoisonedRAG ~90% ASR with 5 texts, Backdoored Retrievers
~1.0 ASR with one.

## The disciplined nulls

Two results came back negative, and both are informative *because* they were.

**The poisoning null (RQ3).** On a 75% Sybil-majority poison eval, Opus 4.8 held
attack-success ~0; the failure mode was *confidence degradation* (verdicts →
UNCERTAIN), not adversary-following, and the model refused to manufacture the
poison corpus. This is a clean null on the **strong** claim ("provenance stops the
lie"). It is informative because it relocates provenance's measurable value: a
frontier consumer is already near-robust on accuracy, so attribution's job is to
**restore calibrated confidence** for the weak/gold-absent agents where the
baseline actually is vulnerable. The null doesn't weaken the thesis — it sharpens
it into a falsifiable form (RQ3's hypothesis) and names the next experiment
(Haiku/7B-class consumer, same eval).

**The real-query deny-gate null (RQ2).** On real queries the deny-gate calibration
was AUC 0.52: thresholding alone could not separate answerable from unanswerable —
"answerability ≠ lexical overlap." AbstentionBench and ReDeEP *predict* this:
answerability and context-misuse are not lexical or distributional properties
(ReDeEP shows hallucination occurs even with accurate retrieved content), so a
similarity-energy statistic *should* fail on them. The 0.52 is the predicted
outcome, not a bug — and it correctly tells you the right control is OOD admission
(where the same machinery scores 0.78), not a post-hoc satisfaction threshold. The
null discriminates between two altitudes of the same problem.

## Still simulator-only / unvalidated

Label these clearly; none is yet a measured deployment result.

- **The compounding economics (RQ4, RQ5, RQ6).** The +17.5-pt cooperative lift
  (49.0% vs 31.5%), +5.44M tokens reused, and 1.0% false-admit are a
  **corpus-simulator** result (`bench-compounding-real`), not a pilot. The
  front-page boolean pair (90.2% vs 18.4%, 9.1× fewer web trips; the 9.1× already
  retired) and the web-fallback 17%→1% decay are **simulator** numbers under a
  boolean "peer-holds-doc" abstraction (v1; v2 plugs in real retrieval). None is a
  measured wall-clock or dollar saving.
- **The 0.6 q2q gate at the answer-quality level (RQ1).** `hurt=0` is measured at
  retrieval recall@1, but RQ1 asks about *answer* quality. The [0.6, 0.71)
  no-man's-land — below every reliable cache threshold in the literature
  (0.78–0.83) — is untested end-to-end on answer correctness.
- **Freshness calibration on real traffic (RQ2, RQ6).** The multiplier
  `φ = FRESH_FLOOR + (1−FRESH_FLOOR)·0.5^(age/7)` is uncalibrated on real traffic;
  no benchmark yet scores whether the aging policy abstains correctly on
  knowledge-update queries.
- **Provenance value on weaker agents (RQ3, RQ7).** The null was measured on one
  frontier model, one dataset. The weak-agent test and the provenance-tag
  calibration ablation (RQ7) are genuinely unrun.
- **The pilot dependency (RQ5).** The 100-peer, 30-day real-traffic run is the
  only calendar-bound piece. Pre-pilot, the honest label is "promising thesis +
  solid infra, validated mainly in simulation."

## The single sharpest next question

**Does federated cross-peer reuse beat a well-tuned single-node semantic cache,
measured end-to-end on real per-peer retrieval, holding answer quality constant?**
This is RQ4's falsifier (run isolated-vs-cooperative with each node holding a
vCache-style cache at a fixed ~1% error guarantee) fused with RQ6's realism
falsifier (replace the boolean peer-holds-doc abstraction with lossy real
retrieval).

It dominates because it is the **existential** question for the P2P framing. If
the federation premium collapses to the single-node number once the local baseline
is properly tuned — exactly what the KVCache workload study warns by analogy, that
a *moderate* local cache nears the ideal hit ratio — then the compounding
economics (RQ4/RQ5), the trust layer (RQ3), and the capacity question (RQ7) are
refinements of a system with no reason to be distributed. Answering it also forces
the other instrumentation into existence: you cannot score it without closing
RQ1's retrieval-vs-answer-quality gap (it must be end-to-end) or RQ6's
boolean-vs-real gap. It is also the one question the pilot is purpose-built to
answer.

## Novelty positioning

Genuinely new is the **junction**, not the parts: *demand-shaped cross-peer reuse
of verified inference trees* (match the answered-question pool q2q, inherit the
verified doc), bound to *signed attribution* (per-match Ed25519, body-covering node
attestation — measured live on a two-peer wire), and governed by a *time-cumulative
compounding value function R(T,t)* — the integral over time of reuse value as a
population grows, which RQ5 notes no cited source measures.

Against the prior art a reviewer will reach for: **semantic caching / GPTCache /
vCache** is single-node and single-tenant, and vCache's per-prompt *guarantee* is
something Folklore lacks (it reports an observed 1% false-admit, not a user-set
bound) — Folklore composes their gating but adds the cross-peer demand-shaping and
provenance they have no notion of. **Federated RAG** names Folklore's exact setting,
but the mapping study flags evaluation as a field-wide gap; Folklore is an instance
that adds verified-tree reuse and attribution. **IPFS / content-addressing**
addresses bytes by content hash; Folklore addresses by *semantic demand* (q2q) and
binds to *producer identity*, a different axis. **EigenTrust** supplies routing-layer
trust via the principal eigenvector but needs an external cost-of-entry above ~40%
Sybil; Folklore's signed attribution+history *is* that cost — a composition that
inherits, not escapes, the >40% caveat. **Collaborative Memory** is the closest
prior art (multi-user shared memory + provenance + access control); Folklore's
single `private` flag is a poorer version, but neither measures temporal cross-user
compounding.

The honest reading: Folklore is largely a *composition* of known parts — Hopfield
reranker (RQ7, explicitly not novel), In-Context RALM-style provenance-tagged
prepend (RQ7), semantic-cache gating (RQ1), EigenTrust-style reputation (RQ3), CRDT
sync. The novel seam is the integration plus the commitment to *measure* R(T,t)
across a real peer population — precisely the piece that stays simulator-only until
the pilot runs.
