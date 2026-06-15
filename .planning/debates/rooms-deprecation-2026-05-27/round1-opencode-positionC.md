# Position C — Round 1: Replace rooms with free-form tags

## Rooms don't pay rent. Tags do everything rooms do, with less ceremony.

Every function rooms serve has a simpler formulation as a tag. Let me walk each one:

**Topical reputation.** The design in `docs/p2p/peer-reputation-design.md:86` keys reputation to `room:*` subjects. That's a naming convention dressed up as a hard type. Replace `room:p2p-llm` with `tag:p2p-llm` — same scoping, same aggregation, no registry. A peer who answers questions about `tag:p2p-llm` accrues reputation to that tag. The Bayesian math (line 89-98) treats "subject" as an opaque key; it doesn't care whether the key came from a `RoomMeta` or a string array on a node.

**Granular sharing.** Today's `share.ts:180-184` marks a room as shared in `shared-rooms.json`. Under tags: "share anything matching `oss:*`" is a prefix pattern, not an enum. The user never runs `folklore share room <name>` — they set a sharing policy once: `--share-pattern "oss:*"`. Audit (`share.ts:30-113`) still works: scan graph for nodes matching the pattern, check secrets. Semantically identical, structurally simpler.

**Prefetch routing.** `V3-PROTOCOL.md:237` carries `room: string | null` in `SearchRequest`. Replace with `tag_patterns: string[]`. A peer wanting nodes tagged `oss:*` sends `["oss:*"]`. Same filter, more expressive (AND/OR across tags), no `ROOM_SYNC` handshake needed since tags are self-describing on the node.

**Source curation.** Today `init` uses hand-curated `RoomMeta.keywords` (rooms.ts:26-28). Under tags, a "room" is just a tag — the user (or LLM) stamps `folklore-dev` on relevant sources. Keywords were always a poor man's embedding; drop them.

**Axis 2: Wire-protocol break.**
- `SearchRequest.room` → `SearchRequest.tag_patterns: string[]`. The protocol gets more expressive (globs, unions) at the cost of one field rename.
- `Match.room` (V3-PROTOCOL.md:257) → `Match.tags: string[]`. Self-describing.
- `ROOM_SYNC` protocol dies entirely. `PEER_HELLO` carries tag-pattern capabilities instead.
- Migration: on landing day, every existing node gets `tags: [existing_room]`. The 5 user rooms (`folklore-dev`, `p2p-llm`, `tlvtech`, `forge`, `auto-tlv`) become 5 tags. `shared-rooms.json` becomes `share-patterns.json` with the same policy (e.g., `share_patterns: ["p2p-llm", "oss:*"]`). No data loss, one-shot transform.
- Major version bump to v5? Depends on your taste. The delta is one renamed field + one removed handshake. Could be v4.1.

**Axis 3: What happens to the 5 existing rooms?**
One-time migration. Each node in the graph gets `tags: [room]` stamped (the room field becomes a tag). The user (or a `folklore migrate` command) can re-tag as needed. `default_room` becomes a concept that doesn't exist — queries match against any tag. The "wrong default room" bug (`SYNTHESIS.md:8`) ends permanently because there is no default.

**Axis 4: Sharing UX.**
Today `share.ts:234-305` is a full TUI picker over rooms. Under tags, the user gets:
- A one-time `--share-pattern "oss:*"` policy.
- Or per-node sharing via `folklore tag <node> --share`.
- Or all-tags-open: share everything not explicitly flagged `private`. Simpler than the existing `shared-rooms.json` + Y.Doc + audit pipeline (`share.ts:200-208`). The secrets gate stays.

**Axis 5: Reputation key.**
The `room:*` key in `peer-reputation-design.md:248` becomes `tag:*`. Same dimensionality, same sparsity math. The niche-evaporation problem (76/103 docs never reach 50% coverage) is structurally identical under tags — tags are just as narrow as rooms. But tags collapse the namespace: a node can carry 3 tags instead of being forced into one room. A `tlvtech` node that's also `oss:*` gets exposure in both tag spaces. Tags inherently increase cross-pollination.

**Axis 6: What the user actually wants.**
The user said "i feel like we've over complicated and over engineered this repo with the rooms approach. lets delete it." The pain points:
- *Statusline showed `tlvtech` while working in `folklore`.* Under tags, there's no default room. The statusline shows active tags — context, not identity.
- *Registry maintenance feels imposed.* `rooms.ts:85-99` `addRoom()`, `rooms.ts:102-110` `setDefault()`, the entire 171-line CRUD CLI in `room.ts` — all gone. The user never creates a room, never switches one. They tag (or the ingest pipeline auto-tags via `git rev-parse` → workspace tag, which is what `SYNTHESIS.md:41` already prescribes).
- *Ceremony without value.* Rooms force a single-axis partition. Tags are `node.tags: string[]` — no registry, no validation beyond charset (`rooms.ts:43-54`), no notion of "default." The write-side pollution bug (`SYNTHESIS.md:29`) ends because every node carries its workspace tag at minimum — there's no blind write to a shared namespace.

## Verb: what survives and what dies

**Survival count:** roughly 7 modules / files touched vs 6 deleted.

| Dies | Survives/adapts |
|------|----------------|
| `src/domain/rooms.ts` (all 116 lines) | `src/infrastructure/share-store.ts` (becomes `share-patterns`) |
| `src/cli/commands/room.ts` (all 171 lines) | `src/cli/commands/share.ts` (audit + pattern set, no room enum) |
| `shared-rooms.json` format | `shared-rooms.json` → `share-patterns.json` (simpler schema) |
| `RoomMeta`, `RoomRegistry` types | Graph node gains `tags: string[]` |
| `ROOM_SYNC` libp2p protocol | `SearchRequest` keeps its shape, field renames |
| `default_room` concept + 6 call-site fallbacks | Query filter becomes tag-based |
| `src/infrastructure/rooms-config.ts` | Reputation `room:*` → `tag:*` (one regex replace) |

## (a) Leanest first-cut this week

1. **Schema**: add `node.tags: string[]` beside the existing `room` field. Both live for one release.
2. **Migration**: `folklore migrate rooms-to-tags` — stamps `tags: [room]` on every node, writes `share-patterns.json` from `shared-rooms.json`.
3. **Read**: add `--tag` flag to query commands. `room` queries still work (backcompat).
4. **Write**: in `share.ts`, replace room enum with `--share-pattern` flag. Audit still scans nodes by pattern.
5. **Delete**: remove `room.ts` CRUD CLI. Remove `rooms.ts` pure-domain module. Remove `rooms-config.ts`.

## (b) What to defer

- `ROOM_SYNC` protocol removal from libp2p — leave it emitting no-ops for one release, cut in v5.
- `SearchRequest.room` → `SearchRequest.tag_patterns` wire change — do after the internal migration is stable.
- Reputation key rename `room:*` → `tag:*` — the Bayesian math doesn't care about the prefix; change when the protocol changes.
- Full TUI picker rewrite — the existing `share.ts:234-305` works with the old room enum; swap the data source to tags later.

## (c) What would change my mind

- **If the cost of the one-time migration exceeds the benefit.** If stamping tags on 7,002 entries (V4-PROTOCOL.md:157) plus rewriting `shared-rooms.json` takes more than a day, the "just fix the default" camp (SYNTHESIS smart-prompt, ~50 lines) starts looking better.
- **If Position A demonstrates a concrete feature that rooms-as-registry enables that tags-as-strings cannot replicate.** I haven't found one — reputation scoping, audit, sharing granularity, and prefetch routing all work with tag patterns — but I want to hear it.
- **If the user, after trying tags, says "this is just rooms with extra typing."** The whole bet is that removing the registry ceremony and the wrong-default bug is the specific relief they're asking for. If tags feel like the same abstraction with a different name, go back to Position A's "fix the default, shrink the UI."
