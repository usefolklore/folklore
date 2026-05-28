# Energy-Based Contradiction Detection

**Status:** sketch (not committed to a phase yet)
**Filed:** 2026-05-20
**Author:** Akashik core
**Supersedes:** the placeholder name "Phase 25" used in earlier conversation — descriptive title from here on

A proposal for replacing the Jaccard-on-tokens contradiction filter in
`src/domain/auto-forget.ts` with a small learned NLI-style energy
network. Not urgent. Worth filing while the reasoning is fresh.

## The problem

Phase 22 ships `auto-forget` with a contradiction pass that demotes
the older of two graph nodes when:

```
Jaccard(tokens(node_A.summary), tokens(node_B.summary)) ≥ 0.9
∧  they share ≥ 1 concept tag
∧  their concept tags have a disjoint disagreement
```

This catches **lexical near-duplicates with disagreeing tags**. It
misses everything else.

### What Jaccard misses

Three failure modes observed in synthetic benchmarks + likely in
production:

1. **Paraphrased contradiction.** "The GPS in the Tesla is working
   now" vs "The GPS in the Tesla is broken." Share `the`, `gps`,
   `tesla`, `is` — Jaccard 0.7-ish, below the 0.9 cutoff. Both say
   the opposite thing about the same fact. Jaccard never fires.
2. **Negation flips.** "Pacific Renovations is cheaper than Bay Area
   Builders" vs "Pacific Renovations is NOT cheaper than Bay Area
   Builders." One-token difference, Jaccard ~0.97, but the concept-
   disagreement check requires disjoint tags — both candidates share
   the same tags, so the disagreement check filters them out.
3. **Numerical updates.** "Bob's rent is 27500 CZK" vs "Bob's rent is
   28800 CZK." High Jaccard, both about rent. Older is no longer
   correct. Tag-disagreement check probably fires, but Jaccard alone
   can't *grade* the severity of the disagreement.

The first two are silent wrong-answer sources at federation time:
peer A still serves the old fact, peer B has the corrected one, and
the consumer can't tell which to trust without re-checking the source.

### Why the current setup doesn't fix itself

Tightening Jaccard wouldn't help — that's a precision/recall tradeoff
on the same broken signal. The fundamental issue: Jaccard measures
**lexical similarity**, not **truth-value compatibility**. Two
sentences that agree and two sentences that contradict can have
identical Jaccard scores.

The right signal is "does (A ∧ B) entail a contradiction" — that's a
**Natural Language Inference (NLI)** task. NLI models output an
energy / logit per label in `{entailment, neutral, contradiction}`,
which IS an energy-based model (logits = energies, softmax just
normalizes them).

## Proposed approach

Replace the Jaccard step with an NLI-style energy classifier:

```
e(A, B) → 3-way energy over {entail, neutral, contradict}

contradicts(A, B) = argmax e(A, B) == contradict
                    ∧ confidence(e) ≥ threshold
```

### Model choice

Three real options, ranked by what fits Akashik's CPU-only +
Xenova-ONNX constraint:

| Model | Params | NLI accuracy (MNLI test) | Quantised ONNX | Notes |
|---|---:|---:|---|---|
| `cross-encoder/nli-deberta-v3-small` | 142M | ~90% | available on HF | sweet spot — Xenova-compatible, ~30 MB int8 |
| `cross-encoder/nli-deberta-v3-base` | 184M | ~91% | available | +1 point accuracy, 2× the RAM |
| `MoritzLaurer/DeBERTa-v3-large-mnli` | 435M | ~92% | partial | needs GPU; not for the daemon path |

Default: **`nli-deberta-v3-small`**, quantised, lazy-loaded via the
same `@xenova/transformers` pattern as the cross-encoder reranker
(`src/infrastructure/cross-encoder.ts`). Falls open on model-load
failure — same fail-open contract as Phase 21A.

### Where it slots in

`src/domain/auto-forget.ts:contradictsPass` is the only call site.
The substitution is mechanical:

```ts
// Before (Phase 22):
const sim = jaccardSimilarity(summaryTokens[i], summaryTokens[j]);
if (sim >= opts.contradictionThreshold && hasDisjointTags) {
  demote(older);
}

// After (proposed):
const verdict = await nli.classify(summary_i, summary_j);
if (verdict.label === 'contradiction' && verdict.confidence >= opts.contradictionThreshold) {
  demote(older);
}
```

The fall-back path (Jaccard) stays available behind an env flag:
`AKASHIK_CONTRADICTION_BACKEND=jaccard|nli`. NLI is the default
once the model is downloaded; Jaccard is the offline-or-degraded
fallback.

### Training data — three sources

We don't train from scratch. `nli-deberta-v3-small` ships with MNLI +
ANLI pretraining (1M+ NLI pairs). Zero-shot accuracy on the auto-
forget task is the starting point.

**Optional fine-tuning sources** (post v4.1 once federation has run
for months):

1. **Cross-peer disagreement audit log.** Every time federated search
   surfaces two nodes from different peers with the same source URI
   but different content, that's a labelled contradiction pair (with
   the right resolution = whichever the user kept).
2. **User feedback on `akashik contradictions resolve --prefer
   peer|local`.** Each resolution is a labelled (A, B, winner) triple
   we can use for adapter fine-tuning via LoRA.
3. **Synthetic adversarial pairs.** Generate paraphrase pairs +
   negation pairs from existing graph nodes via Phi-4-mini, label them
   via the system's existing semantic memory. ~1000 pairs per peer,
   shareable in `toolshed` if the user opts in.

LoRA fine-tuning fits on CPU — DeBERTa-v3-small + LoRA rank 8 trains
~5 minutes per epoch on 1000 pairs on a Hetzner CCX23. No GPU.

## What this doesn't replace

The proposal is narrow:

- **Bi-encoder retrieval** stays — NLI is too slow for the candidate
  set, only the contradiction post-filter on already-retrieved tier
  nodes
- **Cross-encoder rerank** stays — different signal, different model,
  different stage
- **PPR / recency rerank** stays
- **The retention math** (λ, σ, decay) stays
- **The Beta(α, β) procedural counters** stay
- **The four-tier vocabulary** stays

This is a single-line replacement in `auto-forget.ts`. The rest of
the system is unchanged.

## Acceptance gates (when this phase eventually ships)

| Gate | Target | Why |
|---|---:|---|
| Contradiction-precision on paraphrase benchmark | ≥ 0.90 | Jaccard is at ~0.70; this is the win |
| Contradiction-recall on paraphrase benchmark | ≥ 0.85 | Don't miss real contradictions |
| Daemon-tick latency cost | ≤ +200 ms p50 | NLI is heavier than Jaccard but bounded |
| Memory floor | ≤ +60 MB | DeBERTa-v3-small int8 quantised |
| Composite memory bench (Phase 23) | no regression | Don't break the ratchet |
| Fail-open behaviour | 100% on model load failure | Same contract as cross-encoder reranker |

## Why not now

Three reasons in order of weight:

1. **Volume is wrong.** Local-only graphs have very few real
   contradictions today — Jaccard misses don't bite hard until
   federation has run long enough that cross-peer disagreements pile
   up. We're at zero federated peers; nothing to detect.
2. **The bench can't see the difference.** Phase 23's auto-forget
   bench (50 nodes, 5 TTL + 10 ancient + 35 keep) doesn't have
   paraphrased contradictions to surface. We'd be shipping an NLI
   model that scores 1.0 on a Jaccard-shaped test set. Not a
   defensible move.
3. **Other work is higher leverage.** Phase 23.7 (real public-bench
   adapters) and Phase 22 deferred items (GSW entity-summary
   retrieval, Bayesian feedback loop) both move documented numbers
   today. NLI-EBM moves a number that doesn't exist yet.

## When to revisit

The trigger conditions, any of:

- ≥ 100 federated peers active with `toolshed` shared
- ≥ 50 distinct contradiction-resolution events in audit logs across
  the network
- A user-reported "the system kept the wrong fact" incident with a
  Jaccard miss as root cause
- A benchmark suite that scores paraphrase-contradiction precision
  (could be built before federation hits scale — see "open
  questions" below)

## Open questions

1. **Symmetry.** NLI is directional (A entails B ≠ B entails A). Our
   contradiction detector is bidirectional (we just want to know "do
   these contradict"). Do we run both directions and AND them? OR
   them? Use the max-confidence one? Default: AND on `contradict`
   labels — both directions must agree to demote.
2. **Calibration.** DeBERTa-v3-small NLI is well-calibrated on MNLI;
   probably less so on memory-summary domain. May need a small held-
   out calibration set per-peer.
3. **Cross-language.** Akashik is currently English-only on the
   write-gate side. DeBERTa-v3 is multilingual but NLI checkpoints
   are usually English. If we go multilingual, we need a different
   checkpoint or per-language model. Phase 25.1.
4. **Federation gossip.** Once we have an NLI verdict on (peer-A's
   fact, peer-B's fact), should we ship the verdict over the wire
   to peer C so C doesn't re-compute? Pro: bandwidth + cost. Con:
   trust — what if peer A is lying about the verdict to demote peer
   B's node? Solution probably: each peer computes its own verdicts;
   verdicts are local-view only.

## Concrete first step

When the phase opens:

1. Create `src/infrastructure/nli.ts` — port `xenovaCrossEncoder`'s
   shape, point at `Xenova/nli-deberta-v3-small`, expose `classify(a,
   b) → ResultAsync<{label, confidence}, NliError>`.
2. Create `src/domain/contradiction.ts` — pure scoring wrapper that
   takes the NLI port + a config object + a pair, returns a typed
   verdict.
3. Branch `auto-forget.ts:planAutoForget` on
   `AKASHIK_CONTRADICTION_BACKEND` env — default `nli`, fall
   back to `jaccard` on model load failure.
4. Write `tests/bench-contradiction-nli.test.ts` — 50 hand-labelled
   pairs covering paraphrase, negation, numerical update, and clean
   non-contradictions. Score precision + recall. Plug into the
   Phase 23 composite under a new dimension `nliContradictionF1`
   (weight 0.05, taken from `betaCalibration` or a new slot).
5. Document the env flag in `src/cli/commands/claude-install.ts`'s
   CLAUDE.md snippet so installs surface it.

## Estimated cost

| Item | Effort |
|---|---|
| Module + adapter + types | 1 day |
| Fixture-labelled paraphrase benchmark | 1 day |
| Composite wiring + acceptance gates | half day |
| Documentation + ratchet update | half day |
| **Total** | **~3 days** when the phase opens |

## Citations

- Modern continuous Hopfield Networks ([Ramsauer et al., arxiv 2008.02217](https://arxiv.org/abs/2008.02217)) — for the broader "EBMs in memory" framing, not the contradiction-detection task specifically
- DeBERTa-v3 ([He et al., arxiv 2111.09543](https://arxiv.org/abs/2111.09543))
- MNLI benchmark ([Williams et al., NAACL 2018](https://aclanthology.org/N18-1101/))
- ANLI ([Nie et al., ACL 2020](https://aclanthology.org/2020.acl-main.441/))
- `cross-encoder/nli-deberta-v3-small` — [HF model card](https://huggingface.co/cross-encoder/nli-deberta-v3-small)
- Akashik Phase 22 auto-forget contradiction pass: `src/domain/auto-forget.ts:contradictsPass`
- Yann LeCun on energy-based models for cognition: [LeCun 2022 "A Path Towards Autonomous Machine Intelligence"](https://openreview.net/pdf?id=BZ5a1r-kVsf) — for the broader case that EBMs are a memory/world-model primitive, not just a classifier
