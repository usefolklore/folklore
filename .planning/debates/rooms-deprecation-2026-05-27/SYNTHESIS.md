# Synthesis — Should rooms be deprecated/deleted?
**Moderator:** Opus | **Date:** 2026-05-27 | **Format:** 2 rounds, 3 positions

---

## TL;DR

**Yes — delete rooms, but stage it.** The user's intuition is correct: rooms are over-engineering for the value they currently deliver. But "delete entirely this week" is too aggressive; "defend them as-is" misses the real complaint. The honest path is a two-stage deletion that ships meaningful user-visible progress in days and defers the wire-protocol surgery to Phase 24+ when the protocol breaks anyway. Position C (tags) is **out** — Position B identified a fatal canonical-authority problem in federated tag namespaces that Position C couldn't answer. The debate collapses to A vs B, and the Round 2 concessions converged both toward the same near-term plan.

---

## What everyone agreed on by Round 2

1. **The workspace-tag + smart-prompt fix from the prior SYNTHESIS is the right THIS WEEK move.** Position A endorses it directly ("Ship the SYNTHESIS workspace-tag fix... not a concession to B; it's the right unblocking move regardless"). Position B prescribes it. Position C concedes their structural change is Phase 24+. **No disagreement on this.**
2. **The wire-protocol break (`room` field excision from `SearchRequest`, `PEER_HELLO`, `ROOM_SYNC`) is Phase 24+ work, not this-week work.** All three positions converge here in Round 2.
3. **`src/cli/commands/room.ts` (the 171-line CRUD CLI) is the most visible offender and should be deleted, not demoted.** A says delete it; B says "deleted, not demoted"; C says "tags don't have CRUD."
4. **The `room:*` reputation key is not load-bearing.** Position B conceded this in Round 1 — the design's preferred subject key is `entity:*`, with `room:*` as a fallback. Deleting rooms degrades reputation to entity-only, which the design already prefers.
5. **`RoomMeta.keywords` is a useful attribute but does not require the rooms primitive.** It's an attribute bag attachable to whatever named partition exists, or to nothing (a global `sources.yaml`).

## What got refuted decisively

### Position C is OUT

Position B's two critiques in Round 2 were fatal and Position C's rebuttal did not resolve them:

- **Tag-namespace fragmentation across federated peers.** Peer A saves a node tagged `p2p-llm`; peer B uses `peer-to-peer-llm`; peer C uses `distributed-llm-inference`. `SearchRequest.tag_patterns` globbing does not match across these strings. Federation requires either canonical authority (a registry, which is what rooms already are) or accepts namespace fragmentation. C proposed neither solution; C deferred it.
- **Y.Doc-per-tag-pattern boundary with multi-tagged nodes.** A node carrying tags `[p2p-llm, oss, tlvtech]` belongs to which Y.Doc? Per-tag → CRDT state multiplies; per-peer → that's binary sharing (which C's whole proposal was supposed to avoid); per-pattern → patterns are per-peer config, not per-node attributes. C's Round 2 hand-waved with "Y.Doc[hash('oss:*')]" but did not resolve the conflict-free CRDT scoping question.

Position C is structurally rooms-with-the-registry-removed but the registry's *functions* (canonical naming, partition identity) are still load-bearing. Removing the registry without replacing those functions is what made C unstable.

### Position A's "two OS profiles" privacy redirect — refuted by A itself

Position A's Round 1 said the answer to "share `p2p-llm` publicly but keep `tlvtech` private on one machine" was "run two OS profiles." B called this a redirect, not a solution. **A's Round 2 conceded the point and replaced it with a `private: bool` per-node flag.** This concession is important — it's not a defeat for A; it's A finding the strongest version of itself. The `private: bool` flag is genuinely simpler than `shared-rooms.json` + per-room Y.Doc + audit pipeline.

### Position A's niche-evaporation argument — partially refuted

Position A's Round 1 claimed deletion "solves" niche evaporation. B correctly observed that dissolving rooms dissolves the metric, not the problem. A's Round 2 conceded this but pivoted: "the metric is a partition-imposed artifact, not a federation health signal — without rooms, the question is just 'does a doc propagate?', governed by DHT routing." This is intellectually honest but it means **we don't actually know whether global-namespace propagation works better or worse than partitioned propagation** — we've never measured it. That uncertainty is a real reason to stage the deletion rather than do it all at once.

### Position B's "invisible rooms = dead code" — A's strongest hit

Position A's Round 2 argued that B's "auto-create + hide CRUD" plan preserves `src/domain/rooms.ts` (117 lines), `src/infrastructure/rooms-config.ts`, and room enums throughout `src/cli/commands/share.ts:117-231` — all of it as user-invisible dead weight. If rooms are invisible to users, what are they for? B's answer was Y.Doc boundaries and SearchRequest routing — both of which a `private: bool` flag + flat namespace can replace. **This argument lands.** Position B did not refute the dead-code claim in Round 2; it conceded the CRUD surface should go but kept the infrastructure layer.

---

## The decisive collapse: A and B agree on the path

By Round 2, both Position A and Position B converged on the same two-step near-term plan, differing only in what happens at Phase 24+:

**Both agree on Phase 1 (this week / next two weeks):**
1. Ship workspace-tag read filter + smart write prompt (the unshipped prior SYNTHESIS fix)
2. Delete `src/cli/commands/room.ts` (171 lines, CRUD CLI)
3. Add `private: bool` to graph node schema; wire `akashik save --private`
4. Update sharing to filter on `private = false`, making `shared-rooms.json` obsolete for binary case

The disagreement is what happens at Phase 24+ when the wire protocol breaks anyway:
- **A:** Delete the partition primitive entirely. Single global namespace. Only `private: bool` for privacy.
- **B:** Keep rooms as invisible implementation detail for federation routing + Y.Doc CRDT boundaries.

That decision can be made later, when there's empirical data on:
- Whether `private: bool` covered actual user needs (or whether multi-tier privacy emerged)
- Whether global-namespace federation propagation works
- Whether the user has *any* desire to share specific topical curations across peers

None of that data exists today. Deciding A vs B now is premature.

---

## Recommendation

### (a) Leanest first-cut this week (~80 lines net-new, ~171 deleted)

1. **Workspace-tag read filter + smart write prompt** — exactly as designed in the prior SYNTHESIS. Statusline already shipped. ~50 lines, 2-3 files.
2. **Delete `src/cli/commands/room.ts`** entirely. The CRUD CLI surface is gone. The runtime infrastructure (`src/domain/rooms.ts`, `src/infrastructure/rooms-config.ts`) stays for now — but it becomes purely internal, never user-facing.
3. **Add `node.private: boolean`** (defaults `false`) to the graph node schema. Wire `akashik save --private` to set it.
4. **Sharing migration:** update the sharing path in `src/cli/commands/share.ts` to use `node.private === false` as the federation filter alongside (or initially instead of) the room enum. `shared-rooms.json` continues to exist for compatibility but is no longer the primary control surface — the per-node flag is.
5. **Auto-create rooms from workspace context.** When a write command runs in a git repo, if no `--room` flag is set and the default room doesn't match the workspace, auto-create `room: <workspace-slug>` (unshared by default) and route the write there. The user never runs `room create` again.

Net effect: the user runs `akashik save`, gets routed to a workspace-derived room automatically, never sees the registry, never sees the CRUD. The phrase "wrong default room" becomes meaningless because the default *is* the workspace. The phrase "share my data" routes through `--private` at write time, not through `room share` ceremony.

### (b) What to defer to Phase 24+

The full wire-protocol break — excising `room` from `SearchRequest`, `PEER_HELLO`, `ROOM_SYNC`, and the reputation envelope. At that point, two paths fork based on empirical data:

- **If `private: bool` proved sufficient and federation propagation works on a global graph:** delete `src/domain/rooms.ts` and `src/infrastructure/rooms-config.ts`. Position A wins. Excise the `room` field entirely.
- **If multi-tier privacy or topical sharing emerged as real user needs:** keep rooms as invisible infrastructure under sharing/CRDT, Position B wins. Excise the user-facing room concept but preserve the partition primitive in the protocol.

Position C (tags) is permanently off the table given the unresolved canonical-authority and CRDT-boundary problems.

### (c) What would change the recommendation

- **If the user opts to take the wire-protocol break this sprint anyway** (e.g., as part of Phase 24 hardening), then ship Position A's full deletion now. The path between now and Phase 24 is the same regardless, but the Phase-24 decision compresses to today's decision if the protocol break happens immediately. In that case: delete `src/domain/rooms.ts`, `src/infrastructure/rooms-config.ts`, `shared-rooms.json`, and excise `room` from `SearchRequest`. ~400 lines deleted, V5 bump, two-version compatibility window for in-flight peers.
- **If telemetry on the workspace-tag + private-flag interim shows users actively wanting topical reputation distinct from peer-level reputation** — i.e., they want to know "this peer is trustworthy on `p2p-llm` but not on `homelab`" — then Position B's "invisible rooms" rationale strengthens and Phase 24+ should keep the partition primitive.
- **If empirical federation testing on the global graph shows propagation degrades** — actual measurement, not the partition-imposed metric — then rooms-as-infrastructure pays rent and B wins at Phase 24+.

---

## What the user gets in practice

After this week's ship:

- `akashik save "something"` from `~/personal/akashik` → routed to room `akashik` (auto-created), tagged `workspace: akashik`. User never sees the room machinery.
- `akashik save "lead info" --private` from anywhere → stored locally, never federates, regardless of room.
- `akashik ask "..."` from `~/personal/akashik` → returns nodes from this workspace first, no `--room` flag needed.
- `akashik room` (the CRUD CLI) → command not found. The 171 lines that produced this pain are gone.
- Statusline still shows `Akashik • akashik` (already shipped this session).

The user's stated complaints — "wrong default room", "registry maintenance feels imposed", "ceremony without value" — are addressed at the level they were complained about: the visible surface. The Phase 24+ decision about whether rooms exist as invisible infrastructure or vanish entirely is preserved for when there's actual data.

---

## Honesty note on the user's intent

The user said "let's delete it" and the right reading of that is: **delete what they see**. They are not asking to break the federation wire protocol this week; they are asking to stop maintaining a registry they didn't want to maintain. The recommendation above is faithful to that intent. The deeper question of whether rooms vanish entirely from the codebase is a Phase 24+ engineering decision, not a UX one. Both A and B's Round 2 plans converge on this read.
