# Round 1 — Position C: Two-Axis Hybrid
**Assigned model:** claude-sonnet-4-6 | **Date:** 2026-05-26

---

## Opening Argument

Position A and Position B are each solving a real problem, and each is paying a real price to solve it. Position A preserves federation integrity but leaves the user stranded in the wrong room — the live registry has `default_room: "tlvtech"` (cold-email, lemlist, make.com) as the active default while the user is actively working on a knowledge-graph codebase. Position B fixes context-awareness but dissolves the federation unit: a per-repo room that nobody else shares is just a namespace silo with extra steps. Position C holds both without sacrificing either, by recognising that "where I am working" and "what I am researching" are orthogonal facts, and the system should track both independently.

---

### 1. Identity / Scope

The current `RoomMeta` type (`src/domain/rooms.ts:19–32`) already contains the right shape for federation: `id`, `keywords[]`, `default_wing`, `description`. That structure earns its keep as the topical unit — it is what peers advertise, what reputation accrues to, and what the `init` source-suggestion pipeline keys on. None of that should be discarded.

What is missing is a lightweight, orthogonal `workspace` tag on every node — a string derived from the git remote or the repo root path, written at index time, queryable at read time. This tag does not replace `room`; it lives alongside it. The node schema gains one optional field: `workspace?: string`. Every existing node implicitly has `workspace: undefined`, which is handled by treating undefined as "match all" — zero migration cost on read.

---

### 2. Federation

The P2P-VISION document (`docs/p2p/P2P-VISION.md:33–37`) is explicit: peers advertise rooms, sharing policy is room-level, CRDT sync is per room, and private rooms stay local. The `PEER_HELLO` message exchanges room lists. None of this protocol touches `workspace`. Rooms continue to be the federation unit, unchanged.

The niche-evaporation problem called out in Phase 24 context (76/103 newly-introduced docs never reaching 50% peer coverage) is a peer-count problem per topical room, not a namespace problem. Adding per-repo rooms under Position B would make this *worse* — it would fragment the already-thin coverage across hundreds of repo-scoped rooms, each with a unique name and zero pre-existing peers. Position C avoids this entirely: the federated topology stays on topical rooms, while workspace filtering stays local and query-side only.

---

### 3. Keywords / Source Curation

The `keywords[]` field on `RoomMeta` is load-bearing for cold-start source suggestion. It requires deliberate curation — you cannot auto-derive `["knowledge-graphs", "embeddings", "MCP", "vector-search"]` from a git remote URL. A repo-derived room would be born empty, defeating the `init` pipeline. Under Position C, keywords stay on topical rooms where a human or an agent put them. The workspace tag carries no keywords — it is a filter, not a research context.

---

### 4. Mental Model

The user's mental model has two layers, not one. "I am in the `akashik` repo right now" is a workspace fact — always available, automatically true, requires no action. "I am researching knowledge graphs" is a research context fact — it accrues value through curation, it is the thing worth federating. Collapsing these into one axis forces an impossible choice: either the user manages a room per repo (Position B's implicit ask), or they constantly switch the single global default (Position A's current failure mode, evidenced by `default_room: "tlvtech"` being stale).

Position C maps each layer to the right UX. The workspace filter is invisible and automatic. Room management remains intentional and rare. The query default becomes: `workspace == current_repo AND room == user_default`, or if no default room is set, `workspace == current_repo` alone. This is the query in `src/cli/commands/discover.ts:45`, `report.ts:59`, `viz.ts:64` — all of which already fall back to `defaultRoom(reg.value)`. Adding workspace as a pre-filter requires a one-line change at each call site, not a structural redesign.

---

### 5. Migration

Existing nodes carry no `workspace` field. This is a non-issue: treat `undefined` as a wildcard match. New nodes indexed from the current working directory pick up the workspace tag automatically. Existing room infrastructure — `RoomRegistry`, `addRoom()`, `setDefault()`, `validateRoomId()` (`src/domain/rooms.ts:46–110`) — is untouched. The CLI commands in `src/cli/commands/room.ts` continue to work as-is. No user is broken. No data is migrated. The feature activates incrementally as new nodes are indexed.

---

### 6. Multi-Axis

Position C is explicitly multi-axis by design. The reputation system in `docs/p2p/peer-reputation-design.md:86–87` already defines subject keys as `entity:*` and `room:*`. Workspace is a third orthogonal axis for local query scoping — it does not enter the reputation wire protocol, does not affect federation, and does not complicate the subject-key hierarchy. This avoids the design risk the reputation document explicitly flags: "if you get subject extraction wrong, you build a precise-looking reputation layer on top of noisy labels" (`peer-reputation-design.md:242–247`). Workspace is a stable, auditable tag — it never flows into reputation subjects.

---

## Concrete Deliverable

### (a) Leanest first-cut to ship this week

1. Add `workspace?: string` to the node type (one field, fully optional).
2. At index time, populate it from `git remote get-url origin` or `git rev-parse --show-toplevel`, slugified — same logic already in `slugifyRoomName()` at `src/domain/rooms.ts:57–62`.
3. At query time, inject a workspace pre-filter when cwd is inside a git repo. Thread it through the six read-side default call sites (`report.ts:59`, `viz.ts:64`, `discover.ts:45`, `index-project.ts:66`, `export-obsidian.ts:85`, `discover-loop.ts:35`) as an optional parameter — no change to callers that pass `--room` explicitly.
4. No changes to `RoomMeta`, `RoomRegistry`, federation, reputation, or the P2P wire protocol.

Total surface area: two files modified, one small domain change. Ships in a day.

### (b) What to defer

- Any UI for managing workspace tags explicitly (not needed — they are automatic).
- Workspace as a federation axis (the niche-evaporation data argues against smaller rooms, not for them).
- Any change to the `PEER_HELLO` or `ROOM_SYNC` protocol (zero P2P changes in this first cut).
- The many-to-many repo→room mapping UI (`akashik workspace bind <repo> <room>`) — useful eventually, not needed for v1 value.

### (c) What would change my mind

If the workspace tag turns out to produce poor recall in practice — i.e., users regularly want cross-repo results and the workspace pre-filter hides them — then Position A's argument strengthens: the right fix is better `room switch` ergonomics, not a new axis. Concretely, if telemetry shows that more than 30% of workspace-filtered queries return zero results where the unfiltered query would have returned relevant hits, the pre-filter is net-harmful and should become opt-in rather than default. I would also revise if federation adoption data shows that per-repo rooms do acquire peers in practice (contra the niche-evaporation evidence) — that would validate Position B's intuition and reduce the case for the topical-room distinction.
