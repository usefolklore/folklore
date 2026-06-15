# Debate context — should rooms be deprecated and deleted entirely?

## The user's stated position (2026-05-27)
> "i feel like we've over complicated and over engineered this repo with the rooms approach. lets delete it."

## Read these first (all required)

1. **Prior debate's context pack** — establishes what rooms are today and how they're used:
   `/Users/saharbarak/personal/folklore/.planning/debates/rooms-abstraction-2026-05-26/CONTEXT.md`

2. **Prior debate's synthesis** — the workspace-tag + smart-prompt design we just landed on (which the user is now rejecting as still too much):
   `/Users/saharbarak/personal/folklore/.planning/debates/rooms-abstraction-2026-05-26/SYNTHESIS.md`

3. **Source files for grounding citations:**
   - `src/domain/rooms.ts` (the vocabulary — addRoom, RoomMeta, defaultRoom, validateRoomId)
   - `src/cli/commands/room.ts` (user-facing CRUD)
   - `src/cli/commands/share.ts` (sharing policy layer)
   - `docs/p2p/P2P-VISION.md` (room as federation share-unit)
   - `docs/p2p/peer-reputation-design.md` (room-scoped reputation subjects)
   - `docs/architecture/V3-PROTOCOL.md` (the SearchRequest envelope with `room` field)
   - `docs/architecture/V4-PROTOCOL.md`

## The question
**If we delete rooms entirely — what breaks, what simplifies, and what should replace them (if anything)?**

## The three positions

### Position A — Delete rooms entirely. Single global namespace.
The user is right: rooms are over-engineering. Reputation becomes peer-scoped (`peer:<DID>`). Sharing becomes binary per peer ("trust this peer or don't"). `init` source curation collapses to a one-shot `sources.yaml`. The libp2p protocol drops the `room` field. Niche evaporation is a non-problem because there's one namespace. The 6 default-room call sites collapse to direct search. All 5 user rooms merge into a single graph. `RoomMeta`, `RoomRegistry`, `addRoom`, `setDefault`, `shared-rooms.json` — all gone.

### Position B — Defend rooms; the complexity moves but doesn't disappear.
Rooms are load-bearing in ways that are non-obvious. (1) Topical reputation matters — a peer high-rep on `p2p-llm` shouldn't get default trust on `homelab`. (2) Sharing granularity — user shares `p2p-llm` public but keeps `tlvtech` private. Without rooms: all-or-nothing per peer, strictly worse. (3) `init` keyword-driven source curation needs topical grouping. (4) P2P prefetch routes by room — without it, every query goes to every peer for every topic. (5) Deleting rooms doesn't simplify — it pushes the scoping problem onto every consumer without the right primitive.

### Position C — Replace rooms with free-form tags (many-to-many).
Delete `RoomMeta`, `RoomRegistry`, `addRoom`, `setDefault`, `shared-rooms.json`, room CRUD. Replace with `node.tags: string[]` — no registry, no validation beyond charset, no default. Federation shares by tag-prefix ("share anything tagged `oss:*`"). Reputation accrues to (peer, tag) pairs. User never creates a room; they tag (or LLM auto-tags). 5 existing rooms migrate to 5 tags. Wire protocol routing key becomes tag-pattern instead of room. Same scoping power, dirt-simple primitive.

## Axes you must address

1. **What actually pays rent.** For each function rooms serve (topical reputation, granular sharing, prefetch routing, source curation), is rooms NECESSARY or just one implementation? What's the simplest alternative?
2. **Wire-protocol break.** Deletion/replacement means changing `SearchRequest`, `PEER_HELLO`, `ROOM_SYNC`, reputation envelopes. Migration story? Major version bump?
3. **The 5 existing user rooms with real data.** What happens to `folklore-dev`, `p2p-llm`, `tlvtech`, `forge`, `auto-tlv` on landing day?
4. **Sharing UX.** Today user shares `p2p-llm` public and keeps `tlvtech` private. Under deletion: how? Two machines? Encryption? Is that simpler or just relocated complexity?
5. **Reputation key.** Without `room:*`, what's the new key? Effect on Phase 24.2 niche-evaporation math (76/103 docs never reach 50% peer coverage)?
6. **What the user actually wants.** Underneath the architecture: (i) statusline showed `tlvtech` while working in `folklore`, (ii) registry maintenance feels imposed, (iii) feels like ceremony without value. Does deletion solve that pain, or could a smaller change (workspace-derived default, auto-create, hide CRUD UI) also solve it?

## Constraints
- Cite file paths and line numbers. Read whatever you need.
- Be honest if deletion is the right call. Position B in particular: do NOT default to "keep things as they are." Articulate the strongest case for why rooms are load-bearing or concede the point.
- End with: (a) leanest first-cut this week, (b) what to defer, (c) what would change your mind.
- ~400-700 words for opening; ~300-500 for rebuttal.
