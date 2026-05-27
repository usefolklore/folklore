# Peer Reputation System — Design

**Status:** design ratified by multi-LLM round-4 audit (codex × 2, gemini × 2, claude-sonnet × 2).
Synthesis at `~/.claude-octopus/results/probe-synthesis-1778145513.md` (654 KB).

**Goal.** Each peer maintains a `peer_id × subject → score` map of every peer
it has ever talked to. After every federated ask, the local satisfaction signal
that the scorer already produces becomes a review of every peer that contributed
to the answer, scoped to the subject(s) the answer was about. Future federated
fan-outs use that map to prefer peers with a track record on the subject —
without ever filtering anyone out, so unknown peers still get sampled.

---

## 1. Formal frame — what is this in CS literature?

A `subject-scoped federated reputation system` over a P2P retrieval network.
Each peer records first-hand post-transaction feedback, aggregates it by
subject, and uses it for peer selection. Six prior works the agents converged on:

| Work                 | What it got right                                                    | What's wrong-fit for Akashik                                   |
|----------------------|----------------------------------------------------------------------|----------------------------------------------------------------|
| **EigenTrust** (Kamvar 2003) | Local feedback + global aggregation; explicit collusion thinking | Single global scalar; "good at libp2p" ≠ "good at lemlist"    |
| **PeerTrust** (Xiong & Liu 2004) | Multi-factor scoring: feedback, volume, source credibility, context | Heavier than v1 needs; overfits sparse data                |
| **PowerTrust** (Zhou & Hwang 2007) | Scalable global aggregation via power nodes              | Soft centralization cuts against room-symmetric peer model     |
| **Beta Reputation** (Jøsang 2002) | Probability + uncertainty (sparse-data handling)         | Wants binary success/failure; we have continuous satisfaction  |
| **Flow-based reputation** (Škorić 2016) | Combines propagation with explicit uncertainty       | Too much machinery for local-only v1                          |
| **SybilGuard** (Yu 2008) | Graph-based identity defense                                   | Assumes social trust graph Akashik doesn't have today         |

**Local-only vs gossiped:**
- **Local-only** is more defensible (Jøsang's "own experience"). Cold-starts badly.
- **Gossiped** unlocks network memory, faster convergence. Imports collusion,
  replay, Sybil amplification — and our current TOFU DID layer can authenticate
  *who said* something, not whether they were *honest*, *independent*, or *unique*.

---

## 2. What ships once this lands

**Wins:**
- **Smarter fan-out ordering.** Today `federated-search.ts:202` fans out to all
  connected peers in parallel. Reputation lets us sort first, optionally early-stop,
  and budget low-rep peers tighter.
- **"Ask only the experts" mode** for high-stakes queries.
- **Fresh-room bootstrap.** Joining a new room? See who already knows the subject
  and request a connection.
- **Decay/freshness weighting.** A peer who was the lemlist authority 90 days ago
  but stopped reading shouldn't outrank a peer active this week.
- **Audit/provenance.** "This answer came from peers with rep ≥ 0.72 on
  `entity:product:lemlist` and confidence ≥ 0.6." Real SOC2 evidence.

**Limits — what this does NOT solve:**
- Factual correctness.
- Low-volume subjects (sparse data → low confidence; that's correct, not a flaw).
- Identity uniqueness — TOFU DIDs are still cheap pseudonyms.
- Replacement of the existing satisfaction scorer's provenance/freshness signals.

**New abuse surface to budget for:** mutual-praise rings, targeted downrating,
topic farming, reviewer capture.

---

## 3. Architecture — where it fits

Reputation is a **sibling subsystem to telemetry**, not a layer inside the existing
satisfaction scorer.

| Layer | New / extend | Path |
|---|---|---|
| Domain — pure types + math | NEW | `src/domain/peer-reputation.ts` |
| Domain — subject keys | NEW | `src/domain/subject-key.ts` (or fold into peer-reputation.ts) |
| Application — update path | NEW | `src/application/update-peer-reputation.ts` |
| Application — telemetry hook | EXTEND | `src/application/peer-pull-telemetry.ts:40` (emit structured evidence) |
| Application — fan-out ranking | EXTEND | `src/application/federated-search.ts:202` |
| Infrastructure — atomic store | NEW | `src/infrastructure/peer-reputation-store.ts` (patterned after `peer-store.ts:138`) |
| CLI — inspect | NEW | `src/cli/commands/peers-rep.ts` |

Reuse `computeSatisfaction()` from `peer-telemetry.ts:229` as the per-ask outcome
generator. Don't put the rep math inside the scorer — keep concerns separate.

**Subject extraction strategy** (rank by stability):
1. **Primary** — canonical `entity_id` from `mentioned_entities` (already on
   AskHit), and from `recall.ts` resolution of the query.
2. **Fallback** — embedding-cluster key. Defer to later; volatile, hard to audit.

**v1 exposes `entity:*` subject keys only.**

> **V5 Update (2026-05-27)** — Pre-V5 this section listed a secondary
> `room:*` scheme. The Phase 24 rooms-deletion mandate removed the rooms
> abstraction entirely; `room:*` keys are no longer written by the
> reputation store, the runtime drops them on load, and `wellinformed
> migrate v5` permanently flattens them on disk. See
> `docs/architecture/V5-PROTOCOL.md`.

**Aggregation function:** recency-weighted Bayesian mean.

```
prior_mean         = 0.5
prior_weight (k)   = 3
review_weight (w)  = freshness_decay × provenance_weight × independence_weight
posterior_mean     = (k·0.5 + Σ w_i·score_i) / (k + Σ w_i)
confidence         = Σ w_i / (Σ w_i + k)
rank_score         = posterior_mean × confidence × freshness_multiplier
```

Defensible because it handles sparse data, supports continuous scores, and
penalises stale/weakly-independent evidence.

---

## 4. Data model

`~/.wellinformed/peer-reputation.json` — local, atomic temp-write + rename
(mirrors `peer-store.ts:138`):

```json
{
  "version": 1,
  "local_peer_id": "12D3KooWLocal",
  "updated_at": "2026-05-07T12:00:00.000Z",
  "subjects": {
    "entity:product:lemlist": {
      "label": "lemlist",
      "kind": "entity",
      "peer_scores": {
        "12D3KooWPeerA": {
          "posterior_mean": 0.77,
          "confidence": 0.48,
          "rank_score": 0.34,
          "weighted_review_count": 2.15,
          "raw_review_count": 3,
          "weighted_sum": 1.96,
          "weighted_sum_squares": 1.67,
          "first_review_at": "2026-05-01T09:00:00.000Z",
          "last_review_at": "2026-05-07T10:00:00.000Z",
          "last_answer_at": "2026-05-07T10:00:00.000Z",
          "stale_after_days": 30,
          "decay_half_life_days": 45,
          "reviewers": {
            "did:key:zLocalDid": {
              "weighted_count": 2.15,
              "weighted_sum": 1.96,
              "last_review_at": "2026-05-07T10:00:00.000Z"
            }
          }
        }
      }
    }
  },
  "reviews": [
    {
      "review_id": "rev_001",
      "ask_id": "ask_001",
      "reviewer_did": "did:key:zLocalDid",
      "subject_keys": ["entity:product:lemlist"],
      "target_peer_id": "12D3KooWPeerA",
      "satisfaction_score": 0.92,
      "weight": 1.0,
      "created_at": "2026-05-01T09:00:00.000Z"
    }
  ]
}
```

**Why two top-level fields?** `subjects` is the materialised aggregation (fast
read for fan-out ranking). `reviews` is the append-only event log (replayable,
audit-friendly, basis for future gossip). Both update atomically together.

**Worked example after 3 asks with 2 responding peers** (subject `entity:product:lemlist`):

| Ask | PeerA score | PeerB score |
|-----|-------------|-------------|
| 1   | 0.92        | 0.41        |
| 2   | 0.81        | —           |
| 3   | 0.58        | 0.87        |

After decay/weights: PeerA accumulates more evidence → moderate posterior_mean,
higher confidence, mid rank_score. PeerB has fewer observations → higher variance
in posterior, lower confidence, lower rank_score even though one of its scores
was higher than any of PeerA's.

**Edge cases:**
- **Sparse data.** Expose both `posterior_mean` and `confidence`; rank by
  `rank_score`, not raw mean. Beta-style certainty-aware.
- **Conflicting reviews.** Per-reviewer evidence buckets — when gossip lands
  later, aggregate by reviewer DID so one reviewer can't be double-counted
  through multiple relays.
- **Decay.** Apply half-life decay to *evidence*, not just final score —
  naturally lowers both posterior and confidence when a subject goes cold.

---

## 5. Wire protocol — three options, ranked

| Option | Buys | Attack surface | Storage cost | Recommendation |
|---|---|---|---|---|
| **Never propagate (local only)** | Simplest model, no cross-peer attacks, strongest privacy | Local score gaming only | One JSON file | ✅ **Phase 1** |
| **Pull on demand** | Subject-specific bootstrap without continuous gossip ("who knows lemlist around here?") | False summaries, replayed old summaries, Sybil fan-out | Moderate; only hot subjects move | ⏸ **Phase 2** |
| **Gossip via pubsub** | Fastest convergence, passive discovery | Highest. Collusion, replay storms, subject spam, reputation poisoning, storage bloat | Highest | ❌ **Skip until** durable reviewer identity, replay protection, and imported-evidence discount model exist |

For phase 2 (pull-on-demand), reviews would be wrapped in signed envelopes
analogous to `share-envelope.ts:148` — gives authenticity and timestamp
plausibility, **not truthfulness.**

---

## 6. Failure modes + mitigations

| Failure | Mitigation |
|---|---|
| Cold start, no reviews yet | Prior mean 0.5 + confidence gating; fallback to current all-peer fan-out |
| One bad query distorts profile | Cap per-ask weight contribution; Bayesian prior dilutes outliers |
| Satisfaction-score gaming via verbosity | Rep updates only from normalised scorer output; consider answer-length penalty |
| Mutual-praise ring | Keep first-hand vs second-hand evidence separate; discount imports aggressively |
| Topic atrophy | Half-life decay on evidence; surface `last_answer_at` |
| Subject taxonomy drift | Canonical `entity_id` first; defer embedding-cluster subjects |
| Off-topic vector hits | Require subject-overlap between query-subjects and hit-subjects before crediting |
| Duplicate evidence inflation via `_also_from_peers` | Split or downweight when same node arrived from multiple peers |
| Reviewer identity churn (cheap new DIDs) | Local age/tenure weighting; signed envelopes give continuity, not uniqueness |
| Replay of stale reviews | `review_id`, `signed_at`, monotonic per-reviewer sequence; reject old duplicates |
| Privacy leakage | Subject competence reveals what a peer reads — keep local by default; export with explicit room/subject opt-outs |
| Compliance (B2B / multi-tenant) | Retention policy, deletion semantics, SOC2/GDPR audit trail |

---

## 7. Phased implementation — concrete commits

| # | Item | Tag | Files |
|---|---|---|---|
| 1 | Pure reputation domain module — types, evidence accumulation, decay, Bayesian math, ranking | **ADD-NOW** | `src/domain/peer-reputation.ts` (new), reuse `peer-telemetry.ts:229` |
| 2 | Atomic versioned-JSON store | **ADD-NOW** | `src/infrastructure/peer-reputation-store.ts` (new), pattern from `peer-store.ts:138` |
| 3 | Local update path after federated ask | **ADD-NOW** | `src/application/peer-pull-telemetry.ts:40` (extend), `src/application/update-peer-reputation.ts` (new), `src/cli/commands/ask.ts:343` (call) |
| 4 | Subject extraction (entity-only — V5; legacy room scheme dropped) | **ADD-NEXT** | `src/domain/subject-key.ts` (new); reads from `mentioned_entities` already on AskHit |
| 5 | Use rep for **ordering only**, never filtering, with exploration floor | **ADD-NEXT** | `src/application/federated-search.ts:202` |
| 6 | Surface in CLI + JSON: "answered by peers with rep≥X on subject Y" | **ADD-NEXT** | `src/application/peer-pull-telemetry.ts:81`, `src/infrastructure/telemetry-formatter.ts` |
| 7 | `wellinformed peers rep [<peer-id>]` inspect command | **ADD-NEXT** | `src/cli/commands/peers-rep.ts` (new) |
| 8 | Pull-on-demand wire protocol (signed review summaries) | **ADD-LATER** | New `/wellinformed/reputation/1.0.0` libp2p protocol |
| 9 | Pubsub gossip | **SKIP** — until reviewer identity, replay handling, and imported-evidence discount exist | n/a |

---

## 8. Two biggest design risks

### Risk 1 — Subject identity, not the math

> The biggest risk is not the math. It is **subject identity**. If you get
> subject extraction wrong, you build a precise-looking reputation layer on top
> of noisy labels. A peer answering three "lemlist-adjacent" asks may be
> genuinely strong on outbound automation, weak on lemlist specifically, and
> irrelevant for Clay or Instantly. If v1 mixes room names, fuzzy embedding
> clusters, and returned entities too freely, the profile becomes hard to audit
> and easy to game.

**Prerequisite:** stable subject-key hierarchy with canonical `entity_id` first
and explicit fallback semantics. **v1 ships `entity:*` keys only (V5 update).**

### Risk 2 — Importing reputation before identity matures

> The current signed-envelope path can prove authorship and integrity, and the
> identity resolver tracks DIDs, but it is still TOFU and currently in-memory.
> Enough for first-hand local scoring, not enough for network-wide trust.

**Prerequisite for Phase 2 (gossip):** persistent reviewer identity, signed
review records with replay protection, and a clear imported-evidence discount
model. Until then, **stay local-only.**

---

## Implementation kickoff

The next commit lands items 1–3 (`ADD-NOW` triplet) as a single bundle:

- `src/domain/peer-reputation.ts` — pure types, recordObservation, decay,
  posterior_mean / confidence / rank_score math, top-subjects / peers-by-expertise
- `src/infrastructure/peer-reputation-store.ts` — atomic load/save with version
- `src/application/update-peer-reputation.ts` — wire `peer-pull-telemetry.ts`
  output → reputation update on every federated ask
- Test coverage on the math + the persistence
- No behavioural change to ranking yet — that's item 5, next bundle

The reputation file accumulates from the first ask after this commit ships.
Existing daemons keep working unchanged — the file is created on first review,
not at boot.

## Source

- Multi-LLM round-4 synthesis at `~/.claude-octopus/results/probe-synthesis-1778145513.md`
- Six prior works inline above; full citations in the synthesis output.
