# Round 2 — Position B: Rooms as invisible infrastructure

**Participant:** Claude Sonnet 4.6
**Date:** 2026-05-27
**Position:** B — Rooms remain load-bearing. The complexity doesn't vanish under deletion or tag-replacement; it migrates to harder problems downstream.

---

## Against Position A: the single-namespace math runs backwards

A's core claim is that deleting rooms "solves niche evaporation." This is directionally wrong. The 76/103 evaporation figure measures whether a doc reaches 50% of peers *within its room*. That denominator is small by design — only peers subscribed to `p2p-llm` are expected to carry `p2p-llm` docs. Dissolve rooms into one global namespace and you don't shrink the evaporation problem; you erase the partition that made the metric meaningful. Every doc now competes for prefetch attention across 7,002+ nodes at every peer. The probability that any individual peer holds any individual doc goes *down* — more nodes, same finite attention budget, no routing signal to prioritize. A has confused "the metric disappears" with "the problem is solved." They are opposite outcomes.

A's privacy answer — "run two OS profiles" — isn't a solution; it's a redirect. The user's stated case is sharing `p2p-llm` publicly while keeping `tlvtech` private on the *same machine, same identity*. Two profiles means two graph databases, two DID keys, two libp2p listeners, manual cross-instance search. That is categorically more complexity than `shared-rooms.json`. A needs to cost this honestly or withdraw the claim.

---

## Against Position C: tag federation has no canonical authority

C is the interesting opponent, and C is right about one thing: the 171-line CRUD CLI in `src/cli/commands/room.ts` is the actual user pain, not the partition primitive underneath it. But C's tag-based federation breaks in a specific, non-obvious way.

**Pressure 1: tag namespace fragmentation.** C says "the LLM auto-tags from save-context." But auto-tagging across federated peers with no shared registry produces divergent namespaces immediately. Peer A saves a node tagged `p2p-llm`. Peer B saves the same concept tagged `peer-to-peer-llm`. Peer C uses `distributed-llm-inference`. These three strings do not intersect in the `SearchRequest.tag_patterns` glob match. C's federation is only as coherent as the tag-naming consensus across every peer — and there is no consensus mechanism proposed. Rooms enforced canonical identity via the registry (`rooms.ts:43-54` charset validation + uniqueness constraint). Tags, as C describes them, are free strings. Free strings across federated peers fragment.

You could answer this by introducing a tag synonym/alias layer, but that layer is a registry — you have just rebuilt the rooms registry with a different name and worse guarantees, because at least rooms were typed and constrained.

**Pressure 2: the Y.Doc-per-tag-pattern problem.** C proposes "Y.Doc-per-tag-pattern-hash" for CRDT sync. A node can carry three tags: `p2p-llm`, `oss`, `tlvtech`. Which Y.Doc does it belong to? Options:

- One Y.Doc per tag → a three-tagged node lives in three Y.Docs simultaneously. CRDT state multiplies by tag count. Conflict resolution across overlapping Y.Docs is undefined in C's proposal.
- One Y.Doc per peer → sharing reverts to all-or-nothing per peer. This is exactly the binary-sharing failure B warned about in Round 1, just renamed.
- One Y.Doc per tag-pattern-hash on the *sharing side* → but the sharing patterns are per-peer configuration, not per-node attributes. Two peers with different `--share-pattern` configs produce incompatible CRDT boundaries for the same node.

C has not resolved the CRDT boundary problem. It has deferred it under a friendlier name.

---

## Where C is right, and what B should absorb

The CRUD surface is the real complaint. The 171 lines in `src/cli/commands/room.ts` — `room create`, `room switch`, `room current`, `room describe`, `room list` — are commands nobody wants to run. B's Round 1 said "hide them behind `--advanced`." That's not enough. The correct move is to make rooms auto-create, auto-populate from workspace context, and never surface the registry to the user at all.

A version of Position B that hides rooms entirely as an implementation detail of sharing and federation is functionally what users want. The partition still exists (for Y.Doc boundaries, for `SearchRequest` routing, for `shared-rooms.json` policy). The user never sees it except when they deliberately configure sharing. That is a UX fix, not a deletion — and it answers the user's "over-engineered" complaint without paying the migration cost or breaking the wire protocol.

---

## Restated positions

**(a) Leanest first-cut this week**
Ship the unshipped SYNTHESIS fix (workspace-tag read filter + smart write prompt, ~50 lines, zero protocol change). Simultaneously remove `room.ts` CRUD CLI from the top-level command surface entirely — not demoted, deleted. Auto-create rooms from workspace context on first write; no `room create` ever needed. The partition exists; the user never manages it.

**(b) What to defer**
Any renaming of `room` → `tag` or `namespace` in the wire protocol. If the auto-creation UX removes the user-visible pain, the rename is cosmetic and costs a v5 migration window. Defer until there is evidence the word "room" itself is the problem, not the CRUD it currently requires.

**(c) What would change my mind**
If C proposes a concrete canonical tag-authority mechanism — a shared tag registry, a synonym resolution protocol, something that prevents `p2p-llm` / `peer-to-peer-llm` / `distributed-llm-inference` from fragmenting across peers — I will move toward C. That mechanism would need to solve the Y.Doc boundary problem simultaneously. Until both are specified, C's proposal is rooms with the registry removed but the registry's *functions* left unaddressed.
