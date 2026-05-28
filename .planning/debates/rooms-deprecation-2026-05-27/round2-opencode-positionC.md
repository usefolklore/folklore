# Round 2 — Position C: Tags are not rooms with extra steps. The structural delta is the registry.

**Participant:** OpenCode (claude-code)  
**Date:** 2026-05-27  
**Position:** C — Replace rooms with free-form tags (unchanged from Round 1)

---

## Against Position A: "Tags are rooms with extra steps"

This is the wrong framing. The right framing: **rooms are tags with a mandatory registry layer bolted on.** The delta between rooms and tags is *exactly* the layer we want to delete.

| Property | Rooms | Tags |
|----------|-------|------|
| Registry | `RoomRegistry` singleton (`rooms.ts:60-83`) — 23 lines of map + validation | None. Zero. `node.tags` is an array on the node, like any other field. |
| Validation | `validateRoomId()` (`rooms.ts:43-54`) — 12-line regex with test suite | One charset filter. Literally `/[^a-z0-9*:-]/`. |
| Default | `defaultRoom()` (`rooms.ts:27-30`) — mandatory fallback that *causes the bug* the user is reporting | No default. None. The concept doesn't exist. |
| CRUD | 171 lines in `room.ts` — `create`, `switch`, `current`, `describe`, `list` | Zero. Tags emerge from save-context. The user never creates a tag. |
| Persistence | `RoomRegistry` serialized to disk, loaded on init, maintained across sessions (inferred from `rooms.ts:66` — persistent map) | Tags live on the node. No second persistence layer. |
| Partition constraint | 1:1 — a node lives in exactly one room | M:N — a node carries N tags. A `p2p-llm` node also tagged `oss:*` gets cross-pollination for free. |

Tag creation is not a user action; it's a *consequence* of save-context. `akashik save --tag "p2p-llm"` doesn't create a tag — it stamps the string. There is no `addTag(tag) → Result<void, RoomError>`. There is no `TagRegistry`. There is no "tag doesn't exist" error path.

Position A's framing ("tags are rooms with extra steps") is backwards. Rooms are tags with **117 extra lines** (`src/domain/rooms.ts` + `src/cli/commands/room.ts`) that produce exactly the three pains the user reports: wrong default, registry maintenance, ceremony.

---

## Against Position B: Sharing and CRDTs survive under tags

**Sharing granularity** (`share.ts:117-231`): Position B argues room-scoped sharing requires rooms. It requires a *partition key*, not a *registry*. Under tags:

```
# Before: two CLI commands + registry state
akashik share room p2p-llm

# After: one-time policy file, zero daily ceremony
# share-patterns.json
{ "share": ["oss:*", "p2p-llm"], "private": ["private:*", "tlvtech"] }
```

The audit pipeline (`share.ts:30-113`) scans nodes by pattern instead of room enum. The secrets gate (`share.ts:165-177`) runs per match. The user said "shared-rooms.json ceremony feels imposed" — under tags the policy is *set once and forgotten*, not maintained as rooms appear and disappear.

**Y.Doc-per-room CRDT** (`share.ts:200-208`): Re-key by tag-pattern hash. A peer subscribing to `oss:*` syncs `Y.Doc[hash("oss:*")]`. Same isolation guarantee (pattern-scoped CRDT, not room-scoped) — you only receive mutations matching your subscribed patterns. The `ROOM_SYNC` handshake becomes a tag-pattern subscription exchange. No registry consulted because there is no registry.

**Where Position B is right** (conceding cleanly):
- Full migration takes effort. The one-shot `rooms-to-tags` stamp touches every node in the graph (7,002 entries per V4-PROTOCOL.md:157).
- `SearchRequest.room` → `SearchRequest.tag_patterns` is a real wire rename that breaks every pre-v5 peer. This is correctly priced as a major version bump.
- The workspace-tag + smart-prompt fix from the SYNTHESIS is the **cheaper** fix this week. Position C is a Phase 24+ play, not a this-week play.

But: the user escalated from "fix the default" to "delete it entirely." That means Phase 24+ federation hardening — where we're already touching every wire envelope and every peer — is the right window for this. Doing tags then costs nearly nothing incremental: the protocol is already breaking, so rename the field.

---

## Restated positions

**(a) Leanest first-cut this week** — unchanged from Round 1 tags migration plan. Add `node.tags` alongside `room`, stamp tags in the one-shot migration, replace `shared-rooms.json` with `share-patterns.json`, delete `rooms.ts`/`room.ts`/`rooms-config.ts`.

**(b) What to defer** — unchanged. Wire protocol rename (`SearchRequest.room` → `SearchRequest.tag_patterns`) defers to V5. Reputation key rename (`room:*` → `tag:*`) defers to the same window.

**(c) What would change my mind** — one addition from Round 2: if the one-time tags migration takes longer than the workspace-tag fix (`~50 lines`), and the user agrees to trial just the fix first, I'd concede this is a Phase 24+ task and Position B's incremental fix is the right this-week answer. The structural argument for tags over rooms stands either way.
