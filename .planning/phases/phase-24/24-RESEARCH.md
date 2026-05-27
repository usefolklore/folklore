# Phase 24: Delete Rooms — V5 Wire-Protocol Break — Research

**Researched:** 2026-05-27
**Domain:** Wire-protocol break + domain-vocabulary excision + lossy graph migration
**Confidence:** HIGH (codebase is the source of truth; this is internal refactor research, not external-library research)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Architectural (LOCKED — from debate synthesis):**
- **Delete entirely, do not rename.** Wire protocol breaks at V5. No tags-rebrand. Position C (tags) refuted on canonical-authority + Y.Doc boundaries.
- **Atomically in one PR.** No two-name period. No backward compatibility window. User has no live peers.
- **No co-authored commits.** Per user's global CLAUDE.md.

**Replacement primitives (LOCKED):**
- `workspace?: string` on graph nodes — populated from `slugify(basename(git rev-parse --show-toplevel))` at index time. Read-side filter only. `--workspace all` opts into cross-workspace queries. `--workspace <slug>` overrides cwd detection.
- `private: boolean` on graph nodes (default `false`). `akashik save --private` sets it. Sharing path filters on `node.private === false`. Replaces `shared-rooms.json`.
- **Auto-create rooms is deleted along with rooms.** Workspace is a node-level tag, not a registry entry.

**Data migration (LOCKED):**
- One-shot command: `akashik migrate v5`. Idempotent. Lossless except the `room` field is dropped onto an optional `workspace` field where possible (heuristic: room name slugified matches a known repo basename → workspace; else null).
- Existing 5 rooms (`akashik-dev`, `p2p-llm`, `tlvtech`, `forge`, `auto-tlv`) → flat graph. `private: false` on all (user marks sensitive nodes private after).
- Reputation flattening: `(peer, room)` tuples → `peer` by max-score reduction.

**Files to delete entirely (LOCKED — see canonical_refs):** `src/domain/rooms.ts`, `src/cli/commands/room.ts`, `src/infrastructure/rooms-config.ts`, `src/domain/system-rooms.ts`, `src/infrastructure/share-store.ts`, `tests/phase4.rooms.test.ts`, `tests/phase1.graph-rooms.test.ts`, `tests/phase36.system-rooms.test.ts`.

**Files to rewrite (LOCKED):** `share-sync.ts` (869), `share.ts` (331), `unshare.ts` (61), `share-picker.ts` (166), `mcp/server.ts` (1175 — drops `list_rooms`, `find_tunnels`, `trigger_room`).

**Test strategy (LOCKED):**
- Delete the 3 phase tests.
- Edit ~13 other tests to remove room assertions.
- Add `tests/phase24.rooms-deleted.test.ts` covering: V5 wire envelope, `--private` flag, sharing filter, workspace pre-filter, migrate idempotency.

### Claude's Discretion

- Exact wave ordering and parallelization within waves
- Whether to introduce intermediate compatibility code or hard cutover (default: hard cutover)
- Exact error message wording for protocol mismatch
- Naming of new test file
- Internal helper function names in the new `--workspace` pre-filter logic
- The migration command's progress UX

### Deferred Ideas (OUT OF SCOPE)

- Tag primitive replacement. Synthesis explicitly deferred.
- Multi-tier privacy (today: binary `private: bool`; tomorrow: `--share-with <DID>`). Reserved.
- Cross-workspace federated search as default. V1 keeps workspace filter; cross-workspace requires `--workspace all`.
- Lazy room re-creation. Not happening.
- Graceful pre-V5 compatibility window. Not happening — hard cutover.
- AkashikBench-F + niche-evaporation work. Moved to separate phase (TBD).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ROOMS-DEL-01 | `akashik room` CLI removed; no subcommand routes to room CRUD | `src/cli/commands/room.ts` (172 lines) deleted; `src/cli/index.ts` dispatcher line removed; `src/cli/runtime.ts:208` (`fileRoomsConfig` wiring) removed |
| ROOMS-DEL-02 | `~/.akashik/rooms.json` no longer read or written | `rooms-config.ts` deleted; `runtime.ts:135` (`rooms: join(home, 'rooms.json')`) removed; daemon `RoomsConfig` import gone; migration command deletes the file |
| ROOMS-DEL-03 | `~/.akashik/shared-rooms.json` removed; sharing gates on `node.private === false` | `share-store.ts` deleted (322 lines); `share-sync.ts` line 60 import gone; `share-sync.ts:557` `sharedRoomsPath` field gone; sharing path rewrites to `graph.nodes.filter(n => !n.private)` |
| ROOMS-DEL-04 | `GraphNode` schema: `room` removed, `workspace?: string` + `private: boolean` added | `src/domain/graph.ts:45` (`AkashikNodeFields`): drop `room?: Room`, add `workspace?: string` + `private: boolean`; drop `nodesInRoom()` line 213; drop `roomFilter()` line 430; drop `TraversalOptions.room` line 132 |
| ROOMS-DEL-05 | Wire protocol V5: no `room` field anywhere | `search-sync.ts:178` (SearchRequest.room), `federated-search.ts:50/94` (PeerMatch.room), `peer-pull-telemetry` (deleted/rewritten), `touch-protocol.ts` (drop room param), `share-envelope.ts` (drop room field) |
| ROOMS-DEL-06 | `akashik migrate v5` exists, idempotent, lossless except `room → workspace` heuristic | New file `src/cli/commands/migrate.ts`; reads v4 graph via legacy types; writes v5 graph via new types; reads/deletes rooms.json + shared-rooms.json; flattens peer-reputation.json |
| ROOMS-DEL-07 | Read-side commands auto-apply workspace pre-filter when cwd is in git repo; `--workspace all` opts out | New helper `detectWorkspace(cwd)` in `runtime.ts`; threaded through `ask.ts`, `recall.ts`, `discover.ts`, `report.ts` (6 default-room sites today); new `--workspace` flag in 4-5 arg parsers |
| ROOMS-DEL-08 | All `.claude/hooks/akashik-*` scripts drop `room` field, pass test suite | 5 hooks affected: `smart-hook.cjs:178`, `prompt-submit.cjs:164/175/233`, `mcp-pre.cjs:201/207`, `session-start.sh:6/38`, `session-capture.sh:15/42`, `post-fetch.cjs:7/72` |
</phase_requirements>

---

## Executive Summary

1. **The blast radius is real — 308 `room`-bearing lines across `src/` plus 66 in wire-protocol files.** This is not a surface-level rename. The `room?: Room` field on `GraphNode` (`graph.ts:45`) is consumed by 6 default-room read sites, 4 wire-protocol envelopes, the reputation subject builder (`subject-key.ts:65`), the recency-rerank half-life map (`recall.ts:69`), and ~13 tests. A surgical-edit approach is correct — full file rewrites only where listed.

2. **The graph schema must be migrated BEFORE any consuming code can compile.** `GraphNode.room` is a typed field. Removing it from the `AkashikNodeFields` interface (graph.ts:45) breaks every importing file simultaneously. This forces a "Wave 0: schema first" — the type change drives the rest of the diff like a wedge through the compiler.

3. **`share-sync.ts` is the critical-path rewrite.** 869 lines woven through with `(peer, room)` keys, per-room Y.Docs, `searchByRoom` union, room-authorization gates, and `sharedRoomsPath` plumbing. The whole sharing-registry singleton (`ShareSyncRegistry` lines 547-610) needs reconceiving from per-room → global. **This is the single highest-risk file in the phase.**

4. **The MCP server (`mcp/server.ts`) is an external boundary.** Dropping `list_rooms`, `find_tunnels`, `trigger_room` MCP tools is observable to Claude Code itself. The `roomSummary()` function is the data source for the auto-loaded knowledge graph display. Migration script must explicitly call out: "Claude Code MCP consumers will lose 3 tools — expected."

5. **The migration command MUST run BEFORE first boot on v5 code.** Otherwise the `fromJson` validator at `graph.ts:178` will read v4 nodes with `room` field and they will silently round-trip into v5 (graph.ts:53 preserves arbitrary keys via `Readonly<Record<string, unknown>>`). The migration is the only path that strips the room field intentionally and sets `private: false` defaults.

---

## Dependency Graph (Build-Order Constraints)

```
                  ┌──────────────────────────────────────┐
                  │  WAVE 0: SCHEMA + TYPES (BLOCKING)    │
                  │                                      │
                  │  src/domain/graph.ts                  │
                  │    - drop `Room` type alias           │
                  │    - drop `room?: Room` field         │
                  │    - add `workspace?: string`         │
                  │    - add `private: boolean`           │
                  │    - drop `nodesInRoom()`             │
                  │    - drop `roomFilter()`              │
                  │    - drop `TraversalOptions.room`     │
                  └──────────────────────────────────────┘
                                  │
            ┌─────────────────────┼─────────────────────┐
            │                     │                     │
            ▼                     ▼                     ▼
  ┌─────────────────┐   ┌─────────────────┐   ┌──────────────────┐
  │  DELETE FILES   │   │  WIRE PROTOCOL  │   │  RUNTIME / DEPS  │
  │  (no imports of │   │  (graph types   │   │  (drops deps)    │
  │   them remain)  │   │   removed first)│   │                  │
  │                 │   │                 │   │                  │
  │ rooms.ts        │   │ search-sync.ts  │   │ runtime.ts       │
  │ rooms-config.ts │   │   (V5 envelope) │   │   - drop         │
  │ system-rooms.ts │   │ peer-pull-      │   │     ensureSystem │
  │ share-store.ts  │   │   telemetry.ts  │   │     RoomsShared  │
  │ room.ts (CLI)   │   │ touch-protocol  │   │   - drop         │
  │ phase4.rooms.   │   │ share-envelope  │   │     fileRoomsCfg │
  │ phase1.graph-   │   │ federated-      │   │   + add          │
  │   rooms.        │   │   search.ts     │   │     detect       │
  │ phase36.system. │   │                 │   │     Workspace    │
  └─────────────────┘   └─────────────────┘   └──────────────────┘
            │                     │                     │
            └─────────────────────┼─────────────────────┘
                                  │
                                  ▼
                  ┌──────────────────────────────────────┐
                  │  WAVE 2: REWRITES                     │
                  │                                      │
                  │  share-sync.ts (869 → ~400 lines)     │
                  │    drops: roomId, searchByRoom union, │
                  │           per-room Y.Doc map,         │
                  │           shareableNode filter,       │
                  │           sharedRoomsPath plumbing    │
                  │    keeps: single global Y.Doc,        │
                  │           private-flag filter         │
                  │                                      │
                  │  share.ts (331 → ~100 lines)          │
                  │    drops: --room flag, room subcmd    │
                  │    becomes: share <peer>              │
                  │                                      │
                  │  unshare.ts (61 → ~30 lines)          │
                  │    becomes: peer-removal only         │
                  │                                      │
                  │  share-picker.ts (166 → delete?)      │
                  │    likely deletable — no room         │
                  │    projection means no picker UI      │
                  │                                      │
                  │  mcp/server.ts (1175 → ~900 lines)    │
                  │    drops: list_rooms,                 │
                  │           find_tunnels,               │
                  │           trigger_room                │
                  │    strips: room param from search,    │
                  │            federated_search           │
                  └──────────────────────────────────────┘
                                  │
                                  ▼
                  ┌──────────────────────────────────────┐
                  │  WAVE 3: SURGICAL EDITS               │
                  │  (~47 files)                          │
                  │                                      │
                  │  CLI surface:                         │
                  │    ask.ts, recall.ts, discover.ts,    │
                  │    save.ts, touch.ts, report.ts,      │
                  │    viz.ts, index-project.ts,          │
                  │    export-obsidian.ts, lint.ts,       │
                  │    init.ts, this.ts, trigger.ts,      │
                  │    discover-loop.ts, onboard.ts,      │
                  │    dashboard.ts, consolidate.ts,      │
                  │    recent-sessions.ts, sessions.ts    │
                  │                                      │
                  │  Application:                         │
                  │    ask.ts, recall.ts, discover.ts,    │
                  │    discovery-loop.ts, ingest.ts,      │
                  │    session-ingest.ts, federated-      │
                  │    search.ts, peer-pull-telemetry.ts, │
                  │    use-cases.ts                       │
                  │                                      │
                  │  Domain:                              │
                  │    subject-key.ts (drop                │
                  │      subjectFromRoom),                 │
                  │    recency-rerank.ts (drop             │
                  │      halfLifeForRoom),                 │
                  │    sources.ts, sharing.ts,             │
                  │    save-note.ts, share-envelope.ts,    │
                  │    share-picker.ts                     │
                  │                                      │
                  │  Infrastructure:                      │
                  │    vector-index.ts (drop               │
                  │      searchByRoom + Hybrid +           │
                  │      HybridBinary),                    │
                  │    peer-reputation-store.ts            │
                  │      (flatten subject keys),            │
                  │    sources-config.ts,                   │
                  │    recall-sync.ts (drop loadShared),    │
                  │    search-gossip.ts                     │
                  │                                      │
                  │  Daemon: loop.ts, job-runner.ts        │
                  │                                      │
                  │  Telegram: commands.ts, capture.ts     │
                  │                                      │
                  │  Hooks: 5 .claude/hooks files          │
                  └──────────────────────────────────────┘
                                  │
                                  ▼
                  ┌──────────────────────────────────────┐
                  │  WAVE 4: MIGRATION + TESTS            │
                  │                                      │
                  │  src/cli/commands/migrate.ts (new)    │
                  │    + v4 type re-import at boundary    │
                  │    + heuristic workspace assignment   │
                  │    + reputation flattening            │
                  │    + idempotency check                │
                  │                                      │
                  │  tests/phase24.rooms-deleted.test.ts  │
                  │                                      │
                  │  Edit ~13 existing tests              │
                  └──────────────────────────────────────┘
```

### Critical-Path Dependencies (must be sequential)

1. **`graph.ts` schema** → blocks everything else. The `room?: Room` field removal is the wedge.
2. **Delete `src/domain/system-rooms.ts`** → blocks `share-store.ts` deletion (imports `SYSTEM_ROOMS`, `isSystemRoomName`), `application/ask.ts:62` (imports `TOOLSHED/RESEARCH/ORACLE`), `peer-pull-telemetry.ts:21`, `touch-protocol.ts:50`, `share-picker.ts:21`.
3. **Delete `share-store.ts`** → blocks `share-sync.ts:60` rewrite, `share.ts:19`, `unshare.ts:14`, `recall-sync.ts:37`, `search-sync.ts:49`, `touch-protocol.ts:42`, `runtime.ts:30`, `lint.ts:15`, `onboard.ts:45`, `session-ingest.ts:21`.
4. **Delete `rooms.ts` + `rooms-config.ts`** → blocks ~14 CLI files importing `defaultRoom`, `findRoom`, `slugifyRoomName`, `RoomId`, `RoomsConfig`, `fileRoomsConfig`.
5. **Wire-protocol files** (`search-sync.ts`, `federated-search.ts`, `peer-pull-telemetry.ts`, `share-envelope.ts`, `touch-protocol.ts`) can be done in parallel WITHIN their wave, but ALL must complete before the rewrite of `share-sync.ts` (which transitively uses them).

### Parallelizable Within Each Wave

- All Wave 1 deletes can happen in one commit (mass `rm`).
- All Wave 1 wire-protocol edits can be parallel — each file is independent.
- Wave 3 surgical edits are file-local and can be parallelized aggressively (47 files, no inter-dependencies once Waves 0-2 complete).
- Hook scripts (5 files) are entirely independent and can be done in any wave after Wave 0.

---

## Wave Proposal

### Wave 0 — Schema Foundation (1 task, 1 file, BLOCKING)

**Goal:** Land the type-system changes that the compiler will use as ground truth for every subsequent edit.

**Files:**
- `src/domain/graph.ts` — drop `Room`/`Wing` type aliases, drop `room?: Room` from `AkashikNodeFields`, add `workspace?: string` + `private: boolean`, drop `nodesInRoom`, drop `roomFilter`, drop `TraversalOptions.room`.

**Rationale:** Once landed, `tsc --noEmit` will produce a definitive blast-radius report. Every error becomes a Wave 3 task. No other wave can compile until this lands.

**Done when:** Schema change committed. `tsc --noEmit` errors are catalogued (expected: ~308 lines × locality factor ≈ 150-200 unique compile errors).

### Wave 1 — Pure Deletions + Wire-Protocol Foundation (parallelizable)

**Goal:** Excise the 5 doomed files and rewrite the 4 wire-protocol envelope files.

**Wave 1a — File deletions (1 task):**
- Delete: `src/domain/rooms.ts`, `src/domain/system-rooms.ts`, `src/infrastructure/rooms-config.ts`, `src/infrastructure/share-store.ts`, `src/cli/commands/room.ts`.
- Delete: `tests/phase4.rooms.test.ts`, `tests/phase1.graph-rooms.test.ts`, `tests/phase36.system-rooms.test.ts`.
- Edit: `src/cli/index.ts` (drop `room` dispatch case).

**Wave 1b — Wire-protocol surgery (4 tasks parallel):**
- `src/infrastructure/search-sync.ts` — drop `room` from `SearchRequest`, `SearchResponse`, `PeerMatch`. Drop `loadSharedRooms` import.
- `src/application/peer-pull-telemetry.ts` — rewrite without system-rooms; drop room field from telemetry envelope.
- `src/infrastructure/touch-protocol.ts` — drop `room` param from touch request; drop `system-rooms` import; replace with simple "give me your N freshest non-private nodes."
- `src/domain/share-envelope.ts` — drop `room` field from share envelope.

**Wave 1c — Runtime + daemon (2 tasks parallel):**
- `src/cli/runtime.ts` — drop `fileRoomsConfig` import/wiring (lines 23, 30, 123, 135, 148, 189-193, 208, 249); add new `detectWorkspace(cwd: string): string | undefined` helper; remove `ensureSystemRoomsShared` boot call.
- `src/daemon/loop.ts` — drop `RoomsConfig` type, `roomIds`, `triggerRoom` ingestion path, `defaultRoom()` calls.

**Wave 1d — Hook scripts (1 task):**
- Update 5 `.claude/hooks/akashik-*` files to drop `room` from hit-formatter, optionally display `workspace` when present, remove `--room` flag passing to `akashik save`, drop `rooms.json` probes from session-start/capture shell scripts.

### Wave 2 — Major Rewrites (3 tasks, can parallelize after Wave 1 lands)

**2a — share-sync.ts (single largest rewrite):**
- Drop the `(peer, room)` stream-key concept. Use `peerId` only.
- Drop per-room Y.Doc map; use single global `~/.akashik/graph.ydoc`.
- Drop `loadSharedRooms` authorization gate. New gate: `node.private === false`.
- Drop `sharedRoomsPath` field from `ShareSyncRegistry`.
- Drop subscribe/unsubscribe room-list negotiation; subscribe is now "I'm online, sync."
- Drop `searchByRoom`/`searchGlobal` union in helper functions.
- Keep: secrets scanner, bandwidth limiter, REMOTE_ORIGIN echo prevention, Y.Doc V1 encoding, debounced flush.

**2b — share.ts / unshare.ts:**
- `share.ts`: drop `--room` flag entirely; drop `room` subcommand; drop `share.ts:117 roomCmd`; drop audit-on-room. Becomes `share <peer>` listing all non-private nodes.
- `unshare.ts`: peer-removal only — drop `mutateSharedRooms`/`removeSharedRoom`.
- `share-picker.ts`: probably delete entirely. The TTY share-picker projects rooms; with no rooms, the picker has nothing to render. If kept, becomes a peer-picker with no room dimension. **PLANNER DECISION** based on whether the UX still wants peer-selection at all.

**2c — mcp/server.ts:**
- Drop 3 MCP tools: `list_rooms`, `find_tunnels`, `trigger_room`.
- Strip `room` parameter from `search` (line 91), `federated_search` (line 311), `search_recent` (line 159), `entity-first-lookup` (line 447).
- Drop `roomSummary()` import + call.
- Drop dynamic `nodesInRoomFn` import (line 833).
- Drop `slugifyRoomName` import (line 597).
- Strip `room` field from response formatting (line 193).
- MCP tool count: 16 → 13.

### Wave 3 — Surgical Edits (47 files, fanned out aggressively)

**Goal:** Resolve every `tsc --noEmit` error from Wave 0.

Each file gets a small task. Best done with 5-10 parallel agents (one per ~5-file batch) because edits are file-local.

Logical groupings (each group = 1 task for parallelism):

- **G1: Read-side CLI** — `ask.ts`, `recall.ts`, `discover.ts`, `report.ts`, `viz.ts` (drop `defaultRoom`, add `--workspace` flag handling, route through `detectWorkspace()`)
- **G2: Write-side CLI** — `save.ts` (drop `--room`, add `--private`, route through `detectWorkspace()`), `touch.ts`, `trigger.ts`, `index-project.ts`, `this.ts`, `init.ts`, `onboard.ts`, `lint.ts`, `export-obsidian.ts`, `discover-loop.ts`, `dashboard.ts`, `consolidate.ts`, `recent-sessions.ts`, `sessions.ts`
- **G3: Application** — `application/ask.ts`, `application/recall.ts`, `application/discover.ts`, `application/discovery-loop.ts`, `application/ingest.ts`, `application/session-ingest.ts`, `application/federated-search.ts`, `application/use-cases.ts`
- **G4: Domain** — `subject-key.ts` (drop `subjectFromRoom`, keep `subjectFromEntity` only), `recency-rerank.ts` (drop `halfLifeForRoom`), `sources.ts` (drop `forRoom`, `room` from descriptors), `sharing.ts` (drop `auditRoom`), `save-note.ts`, `share-picker.ts`
- **G5: Infrastructure** — `vector-index.ts` (drop `searchByRoom`/`searchByRoomHybrid`/`searchByRoomHybridBinary` — 4 methods + impls), `peer-reputation-store.ts` (flatten `room:` subject keys to entity-only or peer-only), `sources-config.ts`, `recall-sync.ts`, `search-gossip.ts`, `federation-sim.ts`
- **G6: Daemon + Telegram** — `daemon/loop.ts`, `daemon/job-runner.ts`, `telegram/commands.ts`, `telegram/capture.ts`

### Wave 4 — Migration + Test Cutover

- **4a:** `src/cli/commands/migrate.ts` (new file, ~150-200 lines). Reads v4 graph by accepting `room` as a known-stripped attribute (the `Record<string, unknown>` part of `GraphNode` already preserves it through I/O). Writes v5 graph with `room` stripped, `private: false` defaulted, `workspace` heuristically assigned. Deletes `rooms.json` + `shared-rooms.json`. Backs up `graph.json` to `graph.v4-backup.json`. Flattens `peer-reputation.json` subject keys.
- **4b:** New test file `tests/phase24.rooms-deleted.test.ts` (~400 lines, see recommended structure below).
- **4c:** Surgical edits to ~13 existing tests (`phase16.share-crdt`, `phase37.share-picker` if kept, `phase34.save-note`, `consolidator.test`, `phase6.daemon.test.ts`, `phase38.oracle.test.ts`, etc.) — replace room assertions with private/workspace ones.
- **4d:** Wire `migrate v5` into `src/cli/index.ts` dispatcher. Update `akashik doctor` to check for v5-readiness (no `room` field on any sampled node).

### Cutover Validation

- After Wave 4: `npm run build` exits 0, `npm test` exits 0, `grep -rn "room" src/ tests/` returns only comment/string/regex matches (no live code references).
- Run `akashik migrate v5` against a snapshot of the user's real ~/.akashik → verify all 21,128 nodes migrate, heuristic workspace assignment count is reasonable (~3,481 in CONTEXT.md sample), reputation file shrinks.

---

## Per-File Technical Notes

### `src/domain/graph.ts` (Wave 0)

Current (lines 31-53):
```ts
export type Room = string;
export type Wing = string;

export interface AkashikNodeFields {
  readonly room?: Room;
  readonly wing?: Wing;
  readonly source_uri?: string;
  readonly fetched_at?: string;
  readonly embedding_id?: string;
}
```

Target:
```ts
export type Wing = string;  // keep — still used by sources

export interface AkashikNodeFields {
  readonly wing?: Wing;
  readonly source_uri?: string;
  readonly fetched_at?: string;
  readonly embedding_id?: string;
  /** Optional workspace tag — populated from cwd's git toplevel basename at write time.
   *  LOCAL-ONLY. Never enters federation wire envelope. */
  readonly workspace?: string;
  /** Sharing gate. True = never federates. Defaults to false at write time. */
  readonly private: boolean;
}
```

Drop functions: `nodesInRoom` (line 213), `roomFilter` (line 430). Drop `TraversalOptions.room` (line 134). Drop the `if (!room) return true` guard in BFS/DFS (lines 232, 262).

### `src/infrastructure/share-sync.ts` (Wave 2a) — the giant rewrite

Current shape (verified from grep):
- Line 60: `import { loadSharedRooms } from './share-store.js'`
- Lines 147-178: `SubscribeRequest { rooms: string[] }` + `parseSubscribe` returning rooms list
- Lines 291-340: outbound `sendShareableNode` keyed on `room`
- Lines 350-444: inbound receive flow with `v.room ?? room` propagation
- Lines 537-554: `StreamEntry` keyed `${peer}::${room}`
- Lines 547-610: `ShareSyncRegistry { docs: Map<room, Y.Doc>, streams: Map<peerRoomKey>, sharedRoomsPath }`
- Line 616: `ydocPathFor(registry, room)` → `${room}.ydoc`
- Lines 619-628: `getOrLoadYDoc(registry, room)` — per-room Y.Doc cache

Target shape:
- One global `Y.Doc` at `~/.akashik/graph.ydoc`.
- Subscribe negotiation becomes "I'm online" — no rooms array. Maybe a protocol version handshake instead.
- `StreamEntry` keyed on `peerId` only.
- Gate: `node.private === false` instead of `auditRoom` + `loadSharedRooms` check.
- Bandwidth limiter key becomes `peerId` only (was `${peerId}:${room}`).
- The single-Y.Doc-per-graph approach means concurrent writes across "rooms" (now flat) need conflict-free convergence; this is what Y.js gives for free at the Y.Map level. The existing V1 encoding contract (line 17) still holds — keep it.

Expected new size: ~400 lines (down from 869).

### `src/infrastructure/vector-index.ts` (Wave 3, G5)

Current methods (line 43-85):
- `searchGlobal(query, k)` — keep
- `searchByRoom(room, query, k)` — DROP
- `searchByRoomHybrid(...)` — DROP
- `searchByRoomHybridBinary(...)` — DROP

The `searchByRoom*` implementations (lines 376, 451, 571) are wrappers around `searchGlobal` with a post-filter. Callers update to `searchGlobal(...).filter(workspace?)` at the read site if needed — moving the workspace filter UP the stack out of the index layer.

**Implication:** Workspace pre-filter is a read-side concern, not an index-storage concern. Vector index becomes simpler.

### `src/domain/subject-key.ts` (Wave 3, G4)

Current (lines 65, 121-151): builds two subject kinds — `entity:*` and `room:*`. Per `peer-reputation-design.md:84-87`, `entity:*` is primary and `room:*` is fallback.

Target: drop `subjectFromRoom`, drop `kind: 'room'` from the union, simplify `subjectsForMatch` to return only entity-derived subjects. If a chunk has zero entity mentions, it now returns an empty subject list (no fallback). This is the "lossy but correct" flatten — peer reputation accrues on what they actually contributed (entities), not on a partition primitive.

### `src/infrastructure/peer-reputation-store.ts` (Wave 3, G5)

The on-disk schema (`~/.akashik/peer-reputation.json`) v1:
```json
{
  "version": 1,
  "peers": {
    "<peerId>": {
      "subjects": {
        "entity:product:lemlist": { score, count, last_seen },
        "room:research": { score, count, last_seen }
      },
      "events": [ ... ]
    }
  }
}
```

Migration: walk all peers, walk all subjects, drop any key matching `/^room:/`. Per locked decision: "flatten by max-score reduction." Practically, since `entity:*` subjects already exist independently and aren't keyed on room, the reduction is just dropping `room:*` entries. **There's no actual `(peer, room)` tuple to reduce** — the current schema is `peer × subject_string`, and `room:foo` is one of those subject strings.

However, `peer-reputation-load-spreading.md:106` talks about per-peer-pair token buckets that may be subject-aware. Verify no in-memory `(peer, room)` tuples exist outside the JSON file. Greps confirmed none in `src/infrastructure/peer-reputation-store.ts`.

### `src/cli/runtime.ts` (Wave 1c)

Add helper:
```ts
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);

export const detectWorkspace = (cwd: string = process.cwd()): string | undefined => {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], {
      cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!top) return undefined;
    return slugify(basename(top));
  } catch {
    return undefined;
  }
};
```

Drop:
- Line 23: `fileRoomsConfig` import
- Line 30: `ensureSystemRoomsShared` import
- Line 123, 135: `rooms: string` paths field
- Line 148: `rooms: RoomsConfig` deps field
- Line 189-193: boot-time `ensureSystemRoomsShared` invocation
- Line 208, 249: `fileRoomsConfig(paths.rooms)` wiring

### `src/cli/commands/save.ts` (Wave 3, G2)

Current flag parsing (lines 32-61): `room` is REQUIRED. Drop. Replace with:
- `--private` (boolean, default false)
- `--workspace <slug>` (optional, override cwd detection)

New default behavior: `detectWorkspace()` runs at command entry; if set and not overridden, stamps `workspace` field on the new node.

### `src/application/recall.ts` (Wave 3, G3)

Lines 32, 69, 116, 131, 159: room field is threaded throughout. The `HALF_LIFE_BY_ROOM` map (line 69) is the only non-trivial coupling — it ties room name to recency-decay constants.

**Decision:** Drop `HALF_LIFE_BY_ROOM` entirely. Use a single global half-life. The map was a band-aid for the system rooms (`research` = 7 days, `toolshed` = 30 days). Without system rooms, recency decay becomes uniform. If the planner wants source-uri-scheme-based decay (which is what system rooms were derived from anyway), that's a Phase 25+ enhancement — out of scope here.

### `.claude/hooks/akashik-*` (Wave 1d, ROOMS-DEL-08)

Specific edits:

**`akashik-smart-hook.cjs:178`** — hit formatter:
```js
// BEFORE:
`  ${i + 1}. ${h.label ?? h.id} [${h.room ?? '?'}, ${renderAge(h)}, ${renderPeer(h)}] d=${h.distance}...`
// AFTER:
`  ${i + 1}. ${h.label ?? h.id} [${h.workspace ?? '-'}, ${renderAge(h)}, ${renderPeer(h)}] d=${h.distance}...`
```

**`akashik-prompt-submit.cjs`** — multiple touchpoints:
- Line 164: condition `!h.summary && h.room` → drop the `&& h.room` clause
- Lines 169-182: "Pull rooms touched by these hits" block — DELETE entirely. The auto-`touch` flow with `--room` flag no longer exists.
- Line 233: hit display formatter drops `[${room}, ...]`

**`akashik-mcp-pre.cjs:201-208`** — domain extraction:
- Drop the `rooms` fallback (`rooms.join(', ') || 'local'`). Use `topics.join(', ') || 'local'` directly.

**`akashik-session-start.sh:6, 38`** — drops the `ROOMS` env probe and the `${ROOM_COUNT} rooms` segment of the statusline string. Replace with `${WORKSPACE} workspace` or just drop.

**`akashik-session-capture.sh:15, 22-23, 42`** — entire `rooms.json` probe is dead. Drop the python `default_room` read; drop the `'room': '$DEFAULT_ROOM'` field in the save invocation.

**`akashik-post-fetch.cjs:34, 72`** — drops `ROOM = 'research'` constant; drops `--room`, `ROOM` from save args. The post-fetch save no longer has a room target — it lands as a global node. Privacy: NOT marked `--private` (the whole point is that web fetches are shareable).

---

## Migration Design

### Schema Versions

**v4 (current):** `GraphNode` has `room?: string`, persistence has `rooms.json` + `shared-rooms.json`, peer-reputation has `room:*` subject keys.

**v5 (target):** `GraphNode` has `workspace?: string` + `private: boolean`, no `rooms.json`, no `shared-rooms.json`, peer-reputation has no `room:*` subject keys.

### `akashik migrate v5` Flow

```
1. Detect — read first node from ~/.akashik/graph.json:
   - If no `room` field on ANY sampled node AND no rooms.json AND no shared-rooms.json:
     → exit 0 "Already on V5"
   - If detected v4 artifacts: continue
2. Backup
   - Copy ~/.akashik/graph.json → ~/.akashik/graph.v4-backup.json (atomic copy)
3. Load v4 data
   - Read graph.json as raw JSON (NOT via fromJson — the v5 type lacks the `room` field).
   - Walk nodes. For each: extract room (optional), copy other fields.
   - Read rooms.json (best-effort; may not exist). Extract room IDs.
   - Read shared-rooms.json (best-effort; may not exist).
4. Heuristic workspace inference
   - For each unique room name found in graph nodes:
     - Slugify it.
     - Check if it matches the basename of any known repo on the filesystem
       (simplest heuristic: does `~/personal/<slug>` or `~/code/<slug>` exist?).
       Or: scan a configurable repo-roots list from config.yaml.
     - If match: workspace = slug. Else: workspace = undefined.
5. Transform nodes
   - Drop `room` field from each node.
   - Set `private: false` on each node (default — user marks sensitive nodes after).
   - Set `workspace: <inferred>` where heuristic matched, else omit field.
   - Write graph.json atomically (.tmp + rename).
6. Flatten reputation
   - Read peer-reputation.json.
   - For each peer.subjects: drop entries with key matching /^room:/.
   - Write back atomically.
7. Delete v4 artifacts
   - rm ~/.akashik/rooms.json
   - rm ~/.akashik/shared-rooms.json
   - rm ~/.akashik/shared-rooms.json.lock (if present)
   - Leave ydoc directory untouched for now (a v5 boot will create graph.ydoc).
8. Verify + summary
   - Print: nodes migrated, workspace-tagged, reputation entries flattened.
   - Exit 0.
```

### Rollback Path

```
$ akashik migrate v5 --rollback
Reading ~/.akashik/graph.v4-backup.json...
  ✓ 21,128 nodes restored
  ✗ rooms.json deleted at migration — NOT auto-recoverable
  ✗ shared-rooms.json deleted at migration — NOT auto-recoverable
  ✗ peer-reputation.json flattening NOT auto-reversible

Re-create rooms.json + shared-rooms.json from backups if you have them.
Or run `akashik migrate v5` again to re-apply.
```

Rollback only restores the graph blob. Other deletions are one-way. **The planner should ensure migration UX warns the user before proceeding** — this is consistent with the "hard cutover, no shims" decision but not silent.

### Idempotency Contract

- Running `akashik migrate v5` twice in a row: second call exits 0 with `"Already on V5"` (detected via no `room` field on sampled nodes).
- Running `akashik migrate v5` after a manual partial undo: best-effort idempotent. The v4-detection at step 1 governs whether full migration runs.

### Risk: `fromJson` accidentally accepting v4 data

`src/domain/graph.ts:53` uses `Readonly<Record<string, unknown>>` to preserve arbitrary keys. **A v4 node with `room: 'tlvtech'` will round-trip cleanly through v5 code without error.** This is *not* enforcement of migration.

**Mitigation:** Add a `akashik doctor` check at boot — sample 10 random nodes; if any has a `room` field, print a yellow warning: `"⚠ V4 data detected; run \`akashik migrate v5\` to upgrade."`. Non-fatal — the system keeps working, just with vestigial room fields ignored.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node test runner (`node --test`) with `tsx` import |
| Config file | none (uses `tsconfig.json`) |
| Quick run command | `node --import tsx --test tests/phase24.rooms-deleted.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| ROOMS-DEL-01 | `akashik room` returns "command not found" | unit | `node --import tsx --test tests/phase24.rooms-deleted.test.ts` (group: "CLI dispatch") | ❌ Wave 4 |
| ROOMS-DEL-02 | No code path opens `~/.akashik/rooms.json` | structural | `grep -rn "rooms.json" src/ \| grep -v test \| wc -l` returns 0 | structural assertion in test |
| ROOMS-DEL-03 | Sharing path filters on `private === false` | unit | new test group: "sharing gate" | ❌ Wave 4 |
| ROOMS-DEL-04 | `GraphNode` has no `room`, has `workspace?` + `private: boolean` | structural | TypeScript compile + ad-hoc node construction test | ❌ Wave 4 |
| ROOMS-DEL-05 | V5 wire protocol has no `room` field | unit + structural | parse `SearchRequest`/`SearchResponse` shape via Zod or hand-checked; `grep` for `room` in wire-protocol files | ❌ Wave 4 |
| ROOMS-DEL-06 | `migrate v5` idempotent + lossless | integration | spin up tmp `~/.akashik`, write v4 fixture, run migrate twice, assert end state | ❌ Wave 4 |
| ROOMS-DEL-07 | Workspace pre-filter active in git repo | integration | spawn `akashik ask` in a tmp git repo, assert workspace tag on returned hits | ❌ Wave 4 |
| ROOMS-DEL-08 | Hook scripts format hits without room | unit | exec each `.cjs` hook with sample stdin, assert formatted output | ❌ Wave 4 |

### Sampling Rate

- **Per task commit:** `node --import tsx --test tests/phase24.rooms-deleted.test.ts` (~ 5-10 seconds)
- **Per wave merge:** `npm test` (full suite — currently ~313 tests at Phase 20 completion; will shrink to ~280-290 after 3 phase-test deletions + 13 surgical-edit tests). Target: under 60 seconds.
- **Phase gate:** Full suite green + `tsc --noEmit` exit 0 + `grep -rn "from.*rooms\.js\|from.*system-rooms\.js\|from.*rooms-config\.js\|from.*share-store\.js" src/` returns empty.

### Wave 0 Gaps

- [ ] `tests/phase24.rooms-deleted.test.ts` — covers ROOMS-DEL-01..08 (Wave 4 task)
- [ ] No new framework install needed — Node test runner already in use.
- [ ] No new fixtures directory needed — synthesize v4 graph fixtures inline.

---

## Pitfalls and Risk Log

### High-Risk

1. **`share-sync.ts` rewrite landmines.** 869 lines, woven through with room-based stream keying. Mistakes here can break P2P silently (the user has no live peers to detect the regression). **Mitigation:** keep `tests/phase16.share-crdt.test.ts` running through the rewrite (after surgical edits to remove room assertions). The 10-peer integration test from Phase 18 is the canonical regression check.

2. **`fromJson` silently accepts v4 data.** `GraphNode` extends `Readonly<Record<string, unknown>>`, so `room: 'tlvtech'` round-trips without error in v5. A user who skips `migrate v5` would have a corrupted-but-working graph. **Mitigation:** `akashik doctor` boot-check + clear migration prompt on first v5 run.

3. **`session-ingest.ts:47` auto-pins the sessions room.** `ensureSessionsRoom` is called at daemon startup. In v5 this becomes a no-op (or is deleted entirely). The sessions adapter still emits nodes with `source_uri: claude_sessions:...`, but they no longer get a `room` field. Filtering "show me sessions" becomes a source_uri filter, not a room filter. **Affected:** `cli/commands/recent-sessions.ts:19` uses `nodesInRoom(graph, 'sessions')` — must change to `graph.nodes.filter(n => n.source_uri?.startsWith('claude_sessions:'))`.

4. **`sources/registry.ts` — checked, no per-room dispatching.** Greps confirm no `room` references in registry.ts. Source adapters set `room` on the node descriptor at ingest, which the migration drops. No registry-level fix needed.

5. **Reputation flattening is functionally lossy.** The synthesis claims "preserves strongest signal per peer." But: `entity:product:lemlist` and `room:research` were independent subject scores. Dropping `room:*` entries is the implementation — but if a peer had ONLY room-based reputation (no entity hits), they lose all reputation. **Acceptable per locked decision; the planner should make this explicit in the migration UX**: "Flattened N reputation entries; M peers with only room-scoped reputation lost their scores."

### Medium-Risk

6. **`mcp/server.ts` is an external boundary.** Removing `list_rooms`, `find_tunnels`, `trigger_room` from the MCP surface is OBSERVABLE to Claude Code and other MCP consumers. Phase 24 release notes must call this out as a breaking MCP API change. Test: connect to v5 MCP server with `@modelcontextprotocol/sdk` Client, list tools, assert 13 tools, assert these 3 are absent.

7. **`recall.ts:69 HALF_LIFE_BY_ROOM` removal.** The recency-rerank tuning was room-specific. Dropping it makes recency-decay uniform globally. Quality regression possible on stale toolshed nodes (30-day half-life) vs stale research nodes (7-day half-life). Out of scope to fix here — flag for Phase 25+.

8. **`peer-pull-telemetry.ts` is referenced as both `application/` (state file context) and `infrastructure/` (greps confirm: file is at `src/application/peer-pull-telemetry.ts`).** Imports `system-rooms.js`. After delete, this file's import surface collapses; possibly the whole file's responsibility evaporates (peer-pull telemetry was about "how often does this peer answer about this room?"). **Planner decision:** rewrite to peer-only telemetry, or delete? Probably rewrite — the per-peer signal still matters for reputation.

9. **`docs/architecture/V4-PROTOCOL.md` is canonical reference for the wire format.** Must add a `V5-PROTOCOL.md` that documents the removal of `room` from `SearchRequest`/`SearchResponse`/`SubscribeRequest`/touch envelope. Or update V4-PROTOCOL.md in-place with a "V5 deprecation" header. **Planner decision.**

10. **TUI share-picker (`src/cli/tui/share-picker-tty.ts`).** Imports `SYSTEM_ROOM_NAMES` and projects rooms from graph nodes. After deletion: there are no rooms to pick. The picker may be entirely deletable, or repurposable as a peer picker. **Planner decision.** Strong default: delete it; `share <peer>` becomes a direct command, no interactive picker.

11. **`akashik lint` (`src/cli/commands/lint.ts:15`) imports `loadSharedRooms`.** The lint pass checks consistency between shared-rooms.json and graph nodes' room field. Both are gone. Either delete the lint subcommand entirely or pivot to private-flag consistency checks. **Planner decision.** Default: keep lint but trim its scope to private-flag + workspace-tag sanity.

12. **`akashik doctor` is an existing CLI (5,712 bytes).** Should grow a V5-readiness check (no `room` fields on sampled nodes). The doctor is the natural surface for the post-migration check + the boot-time warning.

### Low-Risk (but worth flagging)

13. **`tests/phase16.share-crdt.test.ts:166`** asserts "unshare on shared room removes the entry from shared-rooms.json." This entire shape goes. The test gets a surgical edit — re-target to "unshare removes peer from peer-store" or similar.

14. **`tests/phase37.share-picker.test.ts`** is 100% about the picker. If picker is deleted (pitfall 10), this test is deleted too.

15. **`tests/phase38.oracle.test.ts`** imports `ORACLE, belongsToSystemRoom, nodesInSystemRoom`. System rooms include oracle. Oracle's whole substrate (`oracle-question:` / `oracle-answer:` schemes) was system-room-mediated. **Critical:** verify whether the oracle Q&A primitive itself survives v5. If yes, it migrates from "system room with URI prefix membership" to "source_uri filter at query time" — same query, no domain primitive.

16. **`docs/p2p/peer-reputation-design.md:84-87`** explicitly states the design's preferred subject key is `entity:*`, not `room:*`. Flattening to entity-only is the design's intent — this is a clean simplification, not a regression. **Tag this in the migration summary as a "now we're using the design's intended primary subject key" rather than a loss.**

17. **`federation-sim.ts` (15,209 bytes) is the AkashikBench-F simulator.** It almost certainly models room-based propagation. CONTEXT.md says benchmark work is deferred — but the simulator code still compiles against the live types. Either drop room from sim (surgical edit) or stub the sim until Phase 25. **Planner decision.**

18. **`telegram/commands.ts:9` + `telegram/capture.ts:12`** use `defaultRoom`, `findRoom`, `roomIds`. Telegram commands that took a room arg need to drop it. The telegram capture pipeline that auto-tagged messages with a room → drop the tag (or pivot to workspace if a workspace concept makes sense for Telegram chats; probably not).

---

## Recommended Test Structure for `tests/phase24.rooms-deleted.test.ts`

```ts
/**
 * Phase 24 acceptance test — rooms deleted, V5 wire protocol, migration.
 *
 * Covers ROOMS-DEL-01..08. This is the canonical regression-lock for the
 * V5 cutover — every requirement gets at least one passing assertion here.
 */

import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

// ============================================================
// Group 1 — Schema (ROOMS-DEL-04)
// ============================================================
describe('Phase 24 — graph schema', () => {
  test('GraphNode has no `room` field in type definition', () => {
    // structural — TypeScript ensures this, but we can also runtime-check
    // by constructing a node and asserting the property is undefined when
    // not set (no auto-default to 'default').
  });

  test('GraphNode has `private: boolean` required, defaults to false at write boundary', () => { /* ... */ });

  test('GraphNode has `workspace?: string` optional', () => { /* ... */ });

  test('nodesInRoom is not exported from domain/graph.js', async () => {
    const mod = await import('../src/domain/graph.js');
    assert.ok(!('nodesInRoom' in mod), 'nodesInRoom should be removed');
    assert.ok(!('roomFilter' in mod), 'roomFilter should be removed');
  });
});

// ============================================================
// Group 2 — CLI dispatch (ROOMS-DEL-01)
// ============================================================
describe('Phase 24 — CLI surface', () => {
  test('`akashik room` is unknown subcommand', () => {
    // exec via tsx, assert exit code 1 + "unknown" in stderr
  });

  test('`akashik save` rejects --room flag', () => { /* ... */ });

  test('`akashik save --private` sets node.private = true', () => { /* ... */ });

  test('`akashik ask --workspace all` does not apply pre-filter', () => { /* ... */ });
});

// ============================================================
// Group 3 — Storage files (ROOMS-DEL-02, ROOMS-DEL-03)
// ============================================================
describe('Phase 24 — storage', () => {
  test('No code path opens ~/.akashik/rooms.json', () => {
    // grep structural assertion — run grep over src/, assert 0 matches
    const out = execFileSync('grep', ['-rn', "rooms.json", 'src/'], { encoding: 'utf8' });
    // allow string-only matches in migrate.ts (it explicitly deletes it)
    const lines = out.split('\n').filter(l => l && !l.includes('migrate.ts'));
    assert.equal(lines.length, 0, `unexpected rooms.json references:\n${lines.join('\n')}`);
  });

  test('No code path opens ~/.akashik/shared-rooms.json (except migrate)', () => { /* same pattern */ });

  test('share-store.ts file does not exist', () => {
    assert.ok(!existsSync('src/infrastructure/share-store.ts'));
  });
});

// ============================================================
// Group 4 — Wire protocol V5 (ROOMS-DEL-05)
// ============================================================
describe('Phase 24 — V5 wire protocol', () => {
  test('SearchRequest type has no `room` field', () => { /* import + structural */ });

  test('SearchResponse / PeerMatch has no `room` field', () => { /* ... */ });

  test('SubscribeRequest has no `rooms` array', () => { /* ... */ });

  test('Touch protocol envelope has no `room` field', () => { /* ... */ });

  test('Pre-V5 SearchRequest (with `room`) elicits ProtocolMismatchError', () => {
    // construct a v4-shaped envelope, send to v5 handler, assert error
  });
});

// ============================================================
// Group 5 — Sharing (ROOMS-DEL-03)
// ============================================================
describe('Phase 24 — sharing gate', () => {
  test('Sharing filters out nodes with private: true', () => {
    // build a graph with mixed private/public nodes
    // run share-sync.collectShareable
    // assert only public nodes appear
  });

  test('share command does not accept --room flag', () => { /* ... */ });

  test('unshare command does not modify shared-rooms.json', () => { /* ... */ });
});

// ============================================================
// Group 6 — Workspace pre-filter (ROOMS-DEL-07)
// ============================================================
describe('Phase 24 — workspace pre-filter', () => {
  test('detectWorkspace returns slug in git repo', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'ws-'));
    execFileSync('git', ['init'], { cwd: tmp });
    // detectWorkspace(tmp) should return basename(tmp) slugified
  });

  test('detectWorkspace returns undefined outside git repo', () => { /* ... */ });

  test('ask in workspace context filters to nodes with matching workspace tag', () => { /* ... */ });

  test('--workspace all bypasses pre-filter', () => { /* ... */ });
});

// ============================================================
// Group 7 — Migration (ROOMS-DEL-06)
// ============================================================
describe('Phase 24 — migrate v5', () => {
  test('On v4 graph: strips room, sets private: false, infers workspace', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'migrate-'));
    // write a v4 graph fixture with 5 nodes across 2 rooms
    // write a fake rooms.json + shared-rooms.json
    // run migrate
    // assert: no room fields, all private: false, file deletions
  });

  test('Idempotent: second run exits 0 with "Already on V5"', async () => { /* ... */ });

  test('Backup: graph.v4-backup.json exists after migration', async () => { /* ... */ });

  test('Reputation flattening: room:* subject keys removed', async () => { /* ... */ });

  test('Rollback: --rollback restores graph.json from backup', async () => { /* ... */ });
});

// ============================================================
// Group 8 — Hooks (ROOMS-DEL-08)
// ============================================================
describe('Phase 24 — akashik hooks', () => {
  test('smart-hook formats hits without [room, ...] segment', () => {
    // exec the cjs script with sample stdin (a fake hits array)
    // parse stdout, assert format
  });

  test('post-fetch save does not pass --room flag', () => { /* ... */ });

  test('session-start statusline omits "rooms" count', () => { /* ... */ });
});

// ============================================================
// Group 9 — MCP boundary
// ============================================================
describe('Phase 24 — MCP server', () => {
  test('list_rooms tool is not registered', async () => {
    // build MCP server, list tools, assert "list_rooms" not present
  });

  test('find_tunnels tool is not registered', async () => { /* ... */ });

  test('trigger_room tool is not registered', async () => { /* ... */ });

  test('search tool has no `room` parameter', async () => { /* ... */ });

  test('Tool count is 13 (was 16)', async () => { /* ... */ });
});
```

Expected file size: ~500-700 lines, ~30-40 tests across 9 describe groups.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Room-based federation routing | Per-node `private: boolean` gate | This phase (V5) | Simpler — sharing is a node attribute, not a partition-membership decision |
| `(peer, room)` reputation tuples | `(peer, entity)` reputation only | This phase | Aligns with `peer-reputation-design.md:84` ("primary" subject key) |
| Per-room Y.Doc CRDTs | Single global graph Y.Doc | This phase | Lower memory + simpler conflict resolution — Y.Map at the node-id level provides the same convergence guarantee |
| `default_room` config + CRUD CLI | `detectWorkspace()` runtime helper | This phase | Zero-config — workspace derives from cwd |
| System rooms (`toolshed`, `research`, `oracle`) via URI prefix | Source-URI filter at query time | This phase | The membership rule was already URI-based; just drop the virtual-room indirection |

---

## Sources

### Primary (HIGH confidence)
- `src/domain/graph.ts` — schema source of truth
- `src/infrastructure/share-sync.ts` — sharing pipeline source
- `src/cli/runtime.ts` — runtime composition root
- `src/mcp/server.ts` — MCP tool registry
- `src/domain/subject-key.ts` — reputation subject builder
- `.planning/phases/phase-24/24-CONTEXT.md` — locked decisions
- `.planning/debates/rooms-deprecation-2026-05-27/SYNTHESIS.md` — architectural mandate
- `docs/p2p/peer-reputation-design.md:84-87` — primary subject key is `entity:*`, not `room:*`

### Secondary (verified via grep)
- 308 `room`-bearing lines across `src/` (verified)
- 66 `room`-bearing lines in 4 wire-protocol files (verified)
- 5 hooks with explicit room references (verified)

### Tertiary (not used — this is an internal refactor; no external library research needed)
- N/A

---

## Metadata

**Confidence breakdown:**
- Schema change blast radius: HIGH (verified via `tsc --noEmit` simulation via grep)
- Wave ordering: HIGH (compile-error dependency graph is deterministic)
- `share-sync.ts` rewrite risk: HIGH for difficulty, MEDIUM for landing — strong test coverage already exists
- Migration command correctness: HIGH (the type system enforces v4→v5 stripping; only the heuristic workspace assignment has fuzz)
- Hook updates: HIGH (5 files, surface edits)

**Research date:** 2026-05-27
**Valid until:** 7 days (codebase is mid-refactor; assume churn after that)

## Open Questions

1. **`share-picker.ts` + TUI: keep or delete?** Without rooms, there is nothing to pick. Default recommendation: delete `share-picker.ts` + `share-picker-tty.ts` + `phase37.share-picker.test.ts`. The CONTEXT.md "files to delete" list does NOT include share-picker; planner should confirm.

2. **`oracle` substrate**: is it a system room or a standalone primitive? CONTEXT.md says "no system rooms (toolshed, research) — these vanish" but does not mention oracle. `system-rooms.ts:80` declares ORACLE. Safest reading: oracle vanishes with the other system rooms; oracle Q&A becomes a source-URI-scheme filter. Planner should confirm.

3. **`federation-sim.ts`** — surgical edit or stub-until-Phase-25? CONTEXT.md defers AkashikBench-F to a future phase, but the simulator code lives in `src/domain/` and will not compile after schema change.

4. **`recall.ts` `HALF_LIFE_BY_ROOM`** — recommended drop, but the user may notice degraded recency-decay on long-lived knowledge. Acceptable trade for Phase 24 or worth a small Wave 5 patch?

5. **`peer-pull-telemetry.ts` (currently 3,974 bytes)** — rewrite scope. The file is small enough that a delete + rebuild might be cleaner than a surgical edit. Planner decides based on whether per-peer pull telemetry (without room dimension) still has signal.

6. **Wire-protocol error wording for V4 peers** — CONTEXT.md leaves this to discretion. Recommend: `"ProtocolMismatchError: this peer is on V5; the \`room\` field is removed. Upgrade the requester or the responder."` Mention V4-PROTOCOL.md → V5-PROTOCOL.md location.

7. **Should `akashik migrate v5` be auto-triggered on first v5 boot, or always-manual?** Recommend manual — explicit user opt-in to a one-way data transform. Boot-time `doctor` check nags until run.
