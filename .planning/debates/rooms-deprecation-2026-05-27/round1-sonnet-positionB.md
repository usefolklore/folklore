# Round 1 — Position B: Defend rooms; the complexity moves but doesn't disappear

**Participant:** Claude Sonnet 4.6
**Date:** 2026-05-27
**Position:** B — Rooms are load-bearing infrastructure. Deleting them doesn't remove complexity; it redistributes it onto every consumer and every downstream phase simultaneously.

---

## Opening

Let me be honest upfront: the user is right about the pain. `default_room: "tlvtech"` while working in `akashik` is a real bug, not a minor UX quibble. The previous debate's SYNTHESIS already fixed it — workspace-derived read filter + smart write prompt, no rooms changed. That fix is sitting unshipped. The question today is whether the user's escalation ("let's delete it") is the right response to an unshipped fix, or whether something deeper is broken.

I'll argue that rooms are load-bearing in four specific, non-theoretical ways. I'll also concede two places where deletion is genuinely defensible. A strong Position B earns its claim by being falsifiable.

---

## Axis 1 — What actually pays rent

Four functions. Two survive deletion. Two don't.

**Topical reputation** (`docs/p2p/peer-reputation-design.md:86`): The reputation system's v1 key taxonomy is explicitly `entity:*` and `room:*` subject keys. The design rationale (section 8, "Risk 1 — Subject identity") says entity-first is the primary key, `room:*` is the secondary fallback. So: *room keys are a fallback, not a primary key*. If you delete rooms, reputation degrades to entity-only, which the design already says is the preferred key. This is a **defensible concession** — reputation doesn't actually need `room:*` to survive, it's a secondary subject that can be replaced by tag or label.

**Sharing granularity** (`src/cli/commands/share.ts:117-231`): This is the load-bearing one. The sharing path in `share.ts` is room-scoped end-to-end: `nodesInRoom(graph, roomId)` (line 64), `auditRoom` on those nodes, Y.Doc keyed per room (`${roomId}.ydoc`), `shared-rooms.json` as the policy gate. The user's specific case — "share `p2p-llm` publicly, keep `tlvtech` private" — requires exactly this structure. Under full deletion, sharing becomes binary per peer. You either give a peer everything or nothing. That is strictly worse privacy, and the complexity doesn't vanish — it relocates to encryption-per-peer, separate machine deployments, or manual content filtering. None of those are simpler.

**Prefetch routing** (`docs/architecture/V3-PROTOCOL.md:232-238`): The `SearchRequest` wire envelope has `room: string | null`. A receiving peer checks `shared-rooms.json` before serving the request (§5.2, step 2). Without room, you'd have to either (a) expose the full index to every peer regardless of topic, (b) replace the room field with something equivalent (tag-pattern, label-prefix), or (c) accept that federated search loses its privacy gate. Option (b) is what Position C proposes — tags are functionally equivalent here, so this function doesn't require rooms specifically, just *some* partition key. **Partially defensible concession.**

**Source curation** (`src/domain/rooms.ts:27-30`): `RoomMeta.keywords` drives `init` source suggestions. This is real value for cold-start but modest scope. It's an array of strings attached to a named entity. You could attach the same array to a tag or any other named partition. This is not a rooms-specific feature; it's an attribute of whatever partition primitive you use.

**Summary of Axis 1:** Two things survive room deletion (topical reputation, source keywords — both are attributes of a partition primitive, not rooms specifically). Two things don't: sharing granularity and the Y.Doc / CRDT boundary. The wire-protocol room field needs *something* in its place; the only question is whether that something is simpler or equivalent.

---

## Axis 2 — Wire-protocol break

`V3-PROTOCOL.md §5.2` defines `SearchRequest` with `room: string | null`. `V4-PROTOCOL.md` inherits this without modification. The `/wellinformed/share/2.0.0` CRDT sync protocol is Y.Doc-per-room (`${roomId}.ydoc`, `share.ts:202`). `PEER_HELLO` in `P2P-VISION.md` exchanges room lists.

Deletion requires at minimum: rename `room` to `namespace` or `partition` in `SearchRequest`, change `PEER_HELLO` to advertise tag-sets or nothing, re-key every existing Y.Doc. That is a major version bump — v5 by the spec's own convention. Every connected peer that hasn't upgraded will receive room-less requests they can't route, and will send room-keyed responses the requester can't parse.

The migration story is not "rooms vanish overnight." It's a two-version compatibility window with a fallback path. This isn't a reason not to do it — it's a cost to price in honestly.

---

## Axis 3 — The 5 existing rooms with real data

`wellinformed-dev`, `p2p-llm`, `tlvtech`, `forge`, `auto-tlv` each have accumulated graph nodes, Y.Doc CRDTs, and potentially shared-rooms.json entries. On deletion day:

- All nodes get field `room` stripped or migrated to a flat namespace. BM25 retrieval breaks unless the field is retained as a label.
- Y.Doc files become orphaned blobs with no routing key.
- Any peer currently syncing `p2p-llm` receives a protocol error or empty response on next connect.
- Reputation entries keyed on `room:p2p-llm` are orphaned.

Migration options: rename all `room` fields to a `label` or `tag` and treat them as free-form strings going forward. That's the Position C proposal, and it's the least-pain migration path. But it means the data model still has *something* that looks like a room — it just loses the registry, validation, and CRUD. Whether that's meaningfully different from rooms is the honest crux of this debate.

---

## Axis 4 — Sharing UX without rooms

This is the axis where deletion fails most concretely. Today the user runs:

```
wellinformed share room p2p-llm    # marks p2p-llm public, seeds Y.Doc, runs secrets gate
# tlvtech never appears in shared-rooms.json — stays private by default
```

The secrets gate runs per-room (`share.ts:165-177`). The Y.Doc is per-room (`share.ts:202`). Privacy is opt-in per room — nothing is shared until explicitly marked.

Under full deletion with a single global namespace: sharing becomes "expose everything or expose nothing." To share `p2p-llm` content but not `tlvtech` content, you need one of:

1. **Per-node sharing flags** — every node carries `shareable: boolean`. Now you've just moved the partition primitive from room-level to node-level. Same complexity, worse ergonomics.
2. **Per-peer encryption** — encrypt `tlvtech` nodes with a key you don't give `p2p-llm` peers. More complex, not less.
3. **Two separate instances** — one instance for public research, one for private. Same functionality, worse DX.

None of these are simpler. The partition complexity doesn't disappear — it finds a new home.

---

## Axis 5 — Reputation key

`peer-reputation-design.md:86–87` states v1 ships only `entity:*` and `room:*` keys, with entity-first as the primary. The niche evaporation problem (76/103 docs never reaching 50% coverage) is an argument *against* proliferating rooms, not for their deletion. Fewer, broader rooms mean more peer overlap, slower evaporation. If you delete rooms and replace them with free-form tags (Position C) you potentially multiply the partition count, worsening evaporation.

If you delete rooms entirely and go peer-scoped reputation only (`peer:<DID>` as the sole key), you lose subject-scoped routing. A peer high-rep on `p2p-llm` topics shouldn't get default trust for `cold-email` topics. The `federated-search.ts:202` fan-out ordering (the Phase 24.2 smart routing) depends on subject-scoped scores. Peer-only reputation can't distinguish topical expertise.

However: Position A is right that entity-level keys (`entity:product:lemlist`) are the stronger signal anyway. The `room:*` fallback is a blunt instrument. Deleting rooms doesn't break the reputation design — it removes the fallback and forces entity-first, which the design already prefers.

---

## Axis 6 — What the user actually wants

The prior SYNTHESIS identified three pain signals: (i) statusline showed `tlvtech` while working in `akashik`, (ii) registry maintenance feels imposed, (iii) ceremony without value.

Pain (i) is already fixed by the workspace-tag + smart-prompt approach — shipped in spirit, not in code. The bug is an unshipped fix, not evidence that rooms are structurally wrong.

Pain (ii) — "registry maintenance feels imposed" — is real. Five rooms is fine. Thirty rooms accumulated over 18 months is cognitive debt. The fix here is not deletion; it's auto-creation with no-maintenance defaults. The room exists implicitly when you write to it; the registry is populated lazily.

Pain (iii) — "ceremony without value" — is a UX problem. The `room create`, `room switch`, `room current`, `room describe` surface is six commands nobody wants to run. The fix is to hide the CRUD surface, not to delete the partition primitive.

**What would solve the user's stated pain without the wire-protocol break and data migration cost:**
- Ship the workspace-tag + smart-prompt fix from the prior SYNTHESIS (already designed, unshipped).
- Make `room` invisible in day-to-day usage: no `--room` flag needed in `ask`, `save`, `report` when workspace filter is active.
- Keep rooms as an implementation detail of federation and sharing, not a user-visible configuration layer.

The user probably doesn't want to manage rooms. That's different from saying rooms shouldn't exist.

---

## Concessions

I'll concede two things clearly:

1. **Reputation `room:*` keys are not essential.** The fallback can be entity-level tags or label-prefixes. If rooms disappear, reputation survives at reduced but acceptable fidelity for Phase 24.2.

2. **Source curation keywords don't require rooms.** They require a named partition with an attributes bag. Tags work equally well here.

What I won't concede: sharing granularity and the Y.Doc-per-room CRDT boundary. Under the current wire protocol, these require a named partition. You can rename "room" to "tag" or "namespace" — but you cannot make it disappear without making sharing binary-per-peer, which is worse privacy not less complexity.

---

## Closing positions

### (a) Leanest first-cut this week

Do not delete rooms. Ship the unshipped fix from the prior SYNTHESIS:
1. `workspace?: string` field on graph nodes, populated from `git rev-parse --show-toplevel` slug.
2. Read-side workspace filter at the 6 call sites (`report.ts:59`, `viz.ts:64`, `discover.ts:45`, `index-project.ts:66`, `export-obsidian.ts:85`, `discover-loop.ts:35`).
3. Smart write-side prompt when `default_room` doesn't match cwd workspace.
4. Hide `room create/switch/current/describe` from the top-level help text — demote to `wellinformed room --advanced`.

Surface area: ~50 lines, 2-3 files, zero protocol change, zero data migration.

### (b) What to defer

- Any decision about renaming `room` to `tag` or `namespace` in the wire protocol — defer to V5 with a compatibility window.
- Lazy room auto-creation from cwd (the Position B-flavored workspace room approach from prior SYNTHESIS) — defer until smart-prompt telemetry shows how often users hit it.
- Deletion of `RoomMeta`, `RoomRegistry`, `addRoom`, `setDefault` — these are 117 lines in `src/domain/rooms.ts`. Not worth the migration cost until the sharing and CRDT layers are redesigned.

### (c) What would change my mind

- **If federation is indefinitely deferred** — the entire sharing granularity argument collapses. If there will never be a peer connecting to this instance, room-level Y.Docs and `shared-rooms.json` are dead code and deletion is correct.
- **If sharing granularity is replaced by per-node `shareable` flags** — that's functionally equivalent, and if the implementation is cleaner, Position B's strongest argument is answered.
- **If the workspace-tag fix ships and the user still finds rooms painful** — then the problem is the registry ceremony itself, not the stale default, and a more aggressive removal is warranted. The SYNTHESIS fix deserves one real-world trial before escalating to protocol surgery.
