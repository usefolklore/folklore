# Round 2 — Position A: Full deletion, with honest concessions

**Participant:** Claude Sonnet 4.6 (substituting for Gemini)
**Date:** 2026-05-27
**Position:** A — Delete rooms entirely. Single global namespace, no replacement primitive.

---

## Concession 1: B's niche-evaporation math is partially correct

B is right that the 76/103 figure measures coverage *within a room*, so dissolving rooms doesn't fix the metric — it dissolves the partition that defined the denominator. I'll concede that framing directly.

But here is what that concession actually means: the niche-evaporation metric is a **partition-imposed artifact**, not a federation health signal. The problem it measures — "does a doc reach 50% of the peers who *opted into this room*?" — only exists because the room partition created a sub-population to measure against. Without rooms, the question is simply "does a doc propagate across the peer graph?" — governed by DHT routing, gossip probability, and peer connectivity. That is a real, measurable federation problem with a solution space that doesn't require a named partition at all. We haven't measured niche evaporation on the global graph because we've never run the global graph. That's the honest state of the evidence.

B has not demonstrated that global-namespace propagation fails worse than room-partitioned propagation. B has demonstrated that deleting rooms changes the measurement. Those are different claims.

---

## Concession 2: "Two OS profiles" is a redirect, and B is right to call it out

The user wanting `p2p-llm` public and `tlvtech` private on one machine, one DID, one process — that is a real and legitimate case. Two separate instances is not an answer; it is a punishment. I concede this.

The correct answer is a **per-node `private: bool` flag** — a single boolean field on every graph node, defaulting to `false`. The sharing rule becomes: "sync all nodes where `private = false` to trusted peers." The user runs `akashik save --private` for anything they don't want federated. Done.

Compare the surface this replaces: `shared-rooms.json` (a policy file with a maintained list), `src/cli/commands/share.ts:117-231` (room enum, Y.Doc-per-room, TUI picker, audit pipeline gated on room membership), `Y.Doc` files keyed per room. A boolean field on each node is strictly simpler than all of that. The honest objection is "what about multi-tier privacy — some content to some peers, other content to other peers?" That is a real 5% case. We do not ship it now. We reserve it as a future `--share-with <DID>` per-node flag, implemented when we have empirical evidence that binary privacy is insufficient for our actual user base.

B's Round 2 acknowledges per-node sharing flags as a viable answer but calls it "same complexity, worse ergonomics." The ergonomics claim is wrong: `--private` at write time is one flag, zero maintenance, zero registry. The `shared-rooms.json` pipeline requires the user to remember to mark rooms before any peer connects, and to re-audit when room membership changes. Per-node flags have no such temporal dependency.

---

## Against C: if the protocol breaks either way, do the simpler thing

C's own Round 2 concedes that `SearchRequest.room → SearchRequest.tag_patterns` is a real wire rename, and that the full migration is Phase 24+ work. C also concedes the workspace-tag fix (~50 lines) is the cheaper this-week answer.

So C and A agree on timing: the structural change belongs to the Phase 24+ protocol window. The disagreement is what to put in the `room` field's place.

B named the real problem with C in Round 2: the Y.Doc-per-tag-pattern boundary is unsolved. A node carrying three tags (`p2p-llm`, `oss`, `tlvtech`) belongs to which Y.Doc? C proposes hashing the pattern, but the pattern is *per-peer sharing config*, not a per-node attribute. Two peers with different `--share-pattern` configs produce incompatible CRDT boundaries for the same node. C has not resolved this — it deferred it.

Under full deletion with a `private: bool` flag, the Y.Doc question has a trivial answer: one global Y.Doc for all `private = false` nodes. One CRDT, one search index, one sync protocol, one `SearchRequest` field (`private_only: bool`). There is no combinatorial CRDT boundary problem because there is no partition. The entire class of "which partition does this multi-tagged node belong to?" questions disappears.

C is rooms with the registry removed. A is rooms with the registry *and* the partition removed. If you're breaking the wire protocol anyway — which C, B, and A all agree must happen at V5 — the simpler outcome is fewer concepts, not a tag namespace that requires either a synonym registry (B's objection) or fragmentation across federated peers with divergent naming conventions.

---

## Against B's strongest move: auto-create + hide is 90% right, but the 10% is real dead code

B's Round 2 lands on "make rooms invisible as an implementation detail — auto-create, hide CRUD, never surface to user." That is the least disruptive path and I acknowledge it honestly. It answers the user's stated UX pain without a protocol break.

But consider what "invisible rooms" means for the codebase. Every line of rooms infrastructure remains:

- `src/domain/rooms.ts` (117 lines): `RoomRegistry`, `RoomMeta`, `validateRoomId`, `addRoom`, `setDefault`, `defaultRoom` — all still present, all still tested, all still a maintenance surface.
- `src/cli/commands/room.ts` (171 lines): the CRUD commands B says to delete. Fine — that's 171 lines gone.
- `src/cli/commands/share.ts:117-231`: room enums, `nodesInRoom`, `auditRoom`, Y.Doc keyed per room — all still present under B's plan.
- `src/infrastructure/rooms-config.ts`: the rooms persistence layer — still present.

B's "hide rooms" plan removes the CRUD CLI surface but keeps everything underneath it. Under A's deletion plan, all of that is gone. The difference is not cosmetic: every one of those modules is a future maintenance obligation, a future bug surface, and a future onboarding tax for any contributor who has to understand what a room is in order to modify the sharing or federation layer.

If rooms are invisible to users under B's plan, what exactly are they for? B's answer is: Y.Doc boundaries and SearchRequest routing. Those are real functions. But a `private: bool` flag handles sharing granularity, and a flat namespace handles routing with no partition key. The only remaining justification for rooms as invisible infrastructure is the 5% multi-tier case we're explicitly deferring.

---

## Restated positions

**(a) Leanest first-cut this week**

Do not do the wire-protocol break this week — C is right that it belongs to Phase 24+. Do this:

1. Ship the SYNTHESIS workspace-tag fix (50 lines, zero protocol change) — this is not a concession to B; it's the right unblocking move regardless of where the debate lands.
2. Add `private: bool` (default `false`) to the graph node schema. Wire `akashik save --private` to set it. Update sharing to filter on this field instead of `shared-rooms.json`. This is ~30 lines and makes `shared-rooms.json` obsolete without a protocol break.
3. Delete `src/cli/commands/room.ts` entirely. The CRUD surface is gone immediately.

Surface area: ~80 lines net-new, ~171 lines deleted, zero protocol change, zero data migration.

**(b) What to defer**

The full wire-protocol break — excising `room` from `SearchRequest`, `PEER_HELLO`, and `ROOM_SYNC` — defers to V5/Phase 24+. At that point, delete `src/domain/rooms.ts`, `src/infrastructure/rooms-config.ts`, and the remaining room references in `share.ts`. The migration cost is paid once, in the same window where the protocol is already breaking for other reasons.

**(c) What would change my mind**

- **If the `private: bool` flag demonstrably fails to cover the multi-tier privacy case for real users before Phase 24.** If telemetry or user feedback shows that binary privacy is insufficient — that users need "share with peer A but not peer B" at the node level — then a scoped partition primitive is warranted and B's invisible-rooms design is the right answer.
- **If C solves the Y.Doc boundary problem under multi-tagged nodes.** A concrete proposal for conflict-free CRDT scoping across a node with N tags, where N > 1 and different peers have different sharing patterns, would make C's approach structurally sound. Until then, the single global CRDT under A is simpler by definition.
- **If B proves that global-namespace propagation fails empirically.** Not "the metric disappears" — actual propagation failure, measured. The evaporation math B cites is room-scoped by construction; it does not constitute evidence about global-namespace behavior.
