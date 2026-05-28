# Position A: Delete Rooms Entirely

The user’s inThe file `/Users/saharbarak/personal/akashik/.planning/debates/rooms-deprecation-2026-05-27/round1-gemini-positionA.md` has been successfully written with the Round 1 opening argument for Position A.
a of partitions, we birthed the "wrong default room" bug, fragmented our network, and saddled the CLI with 150+ lines of CRUD (`src/cli/commands/room.ts`, `src/domain/rooms.ts`). We must delete the abstraction entirely.

Here is the reality of what actually pays rent across the six axes:

**1. The Illusion of Rent & (6) What the User Wants**
Rooms demand constant registry maintenance (Axis 6) for features that are better solved natively or not at all. *Source curation* doesn’t need a room registry; it collapses to a single `sources.yaml` list. *Prefetch routing* via rooms is a premature optimization; standard Kademlia DHT or broad gossip is sufficient for our current scale. The user wants to query their graph and save insights without being interrogated about namespace boundaries. Deleting rooms removes the ceremony entirely.

**5. Reputation Key & Niche Evaporation**
Room-scoped reputation (`docs/p2p/peer-reputation-design.md:86`) is not just unnecessary; it is actively damaging federation health. The Phase 24.2 niche evaporation crisis—where 76/103 documents never reach 50% peer coverage—is the direct mathematical consequence of fracturing our peer graph into tiny, isolated shards. By deleting rooms, the reputation key collapses to `peer:<DID>`. This single, dense global namespace maximizes peer overlap, instantly solving the evaporation problem without complex rarity-aware caching.

**4. Sharing UX**
The argument that users need granular sharing (e.g., federate `p2p-llm`, hide `tlvtech`) is a classic trap of reinventing OS-level isolation. If a user has strictly private data and public data, they should run two instances or profiles. Building complex, room-scoped access control (`shared-rooms.json`, `src/cli/commands/share.ts`) into a local knowledge graph is a mistake. P2P sharing should be binary: you trust a peer to sync your graph, or you don't.

**3. Migrating the 5 Existing Rooms**
On landing day, the 5 existing partitions (`akashik-dev`, `p2p-llm`, `tlvtech`, `forge`, `auto-tlv`) simply evaporate. All nodes are merged into a single, unified local graph. No data is lost; the records simply drop their `room` attribute. The artificial walls come down, allowing organic, cross-disciplinary connections to surface naturally during queries. 

**2. Wire-Protocol Break**
This is a hard, breaking change. It requires a V5 major version bump. The `room` field is completely excised from the `SearchRequest` envelope (`docs/architecture/V3-PROTOCOL.md:238-250`), `PEER_HELLO`, and `ROOM_SYNC`. This drastically simplifies the protocol specification and peer discovery logic.

### Implementation Plan

**(a) Leanest first-cut this week**
1. Delete `src/domain/rooms.ts`, `src/cli/commands/room.ts`, and `src/cli/commands/share.ts` completely.
2. Remove the `--room` flag from all read/write call sites (e.g., `report.ts`, `discover.ts`).
3. Migrate the local DB: merge existing data into the global namespace by dropping the room requirement on node retrieval and ignoring legacy fields.
4. Collapse the `init` keyword lists into a single global configuration array.

**(b) What to defer**
Defer any granular access control, per-node encryption, or complex DHT routing optimizations. We do not rebuild isolation mechanisms until we have hard, empirical proof that binary (all-or-nothing) peer federation is fundamentally broken for our core user base.

**(c) What would change my mind**
I would shift to Position B or C only if telemetry proves that a single global graph produces catastrophic noise during P2P queries (where broad gossip fundamentally collapses the network) OR if we observe users abandoning the platform because running a second OS profile for private data is empirically a dealbreaker. Until then, total deletion is the only path that materially reduces system complexity.