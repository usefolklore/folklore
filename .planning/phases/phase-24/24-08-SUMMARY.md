---
phase: phase-24
plan: 08
subsystem: mcp-server
tags: [v5-cutover, rooms-deletion, breaking-mcp-api, wave-2c]
dependency_graph:
  requires:
    - "Wave 0: V5 schema wedge (GraphNode without room, with workspace+private)"
    - "Wave 1: domain/rooms.ts and domain/system-rooms.ts deleted"
  provides:
    - "17-tool MCP surface with zero `room` parameters"
    - "workspace_detail aggregator (replaces room aggregator) for graph_stats"
    - "oracle node filtering via id-prefix (not room membership)"
  affects:
    - "Claude Code consumer (BREAKING MCP API change — release-notes flag)"
    - "Phase 17 C2 invariant: MCP tool count moved from 16 -> 17 (not 13 as planned — see deviation)"
tech_stack:
  added: []
  patterns:
    - "Hard cutover — no compatibility shims, no two-name period"
    - "Id-prefix namespace filtering replaces room-membership filtering for oracle"
    - "source_uri prefix (`claude-session://`) replaces room-membership filtering for sessions"
key_files:
  created: []
  modified:
    - path: "src/mcp/server.ts"
      change: "drop 6 room-tools; strip `room` from 7 tools' input schemas + handler bodies; replace roomSummary with workspaceSummary; add isOracleNodeId helper; trim imports of deleted use-cases"
decisions:
  - "Drop tool scope expanded beyond the plan's literal 3 (list_rooms, find_tunnels, trigger_room): also dropped room_create + room_list (no underlying rooms registry — runtime.rooms deleted in 24-01) and discover_loop (depends on deleted discoveryLoop signature with room param)"
  - "Did NOT add `--workspace` MCP parameter (per plan recommendation): MCP consumers are usually IDE/agent-level and operate cross-workspace; defer to Phase 25+ if consumers request it"
  - "oracle namespace filtering switched from `node.room === 'oracle'` to id-prefix check (`oracle-question:` / `oracle-answer:`) — Open Question 2 resolved via source_uri-style filter"
  - "Recent_sessions filter switched from `nodesInRoom(g, 'sessions')` to `id.startsWith('claude-session://')` — same id-prefix pattern"
requirements_delivered:
  - "ROOMS-DEL-01 (no room CRUD CLI/tool reachable) — partially: MCP-side tools gone; CLI-side `wellinformed room` is Wave 1/3"
  - "ROOMS-DEL-05 (V5 wire — no room param on search/federated_search) — fully on MCP surface"
metrics:
  duration: "~50 minutes"
  completed_date: "2026-05-27"
  commits: 1
  files_modified: 1
  tools_dropped: 6
  tools_room_stripped: 7
  mcp_tsc_errors_after: 0
  mcp_tsc_errors_before: 7
---

# Phase 24 Plan 08: MCP Server V5 Cutover Summary

**One-liner:** Stripped the `room` parameter from every MCP tool and dropped 6 room-flavored tools (list_rooms, find_tunnels, trigger_room, room_create, room_list, discover_loop) — making the MCP server a V5-compliant, room-free surface with `workspace`/`private` in the response shape.

## What Was Built

### Tools dropped (6)

| Tool          | Reason                                                                  |
| ------------- | ----------------------------------------------------------------------- |
| `list_rooms`  | Room concept deleted — no enumeration to do                             |
| `find_tunnels`| Cross-room construct gone with the room dimension                       |
| `trigger_room`| Room-scoped ingest gone (`triggerRoom` use-case is Wave 3 surgical work)|
| `room_create` | Room CRUD deleted — `runtime.rooms` no longer exists                    |
| `room_list`   | Room CRUD deleted — same                                                |
| `discover_loop`| Transitive: depends on `discoveryLoop(room)` and `runtime.rooms`        |

### Tools with `room` parameter stripped (7)

| Tool                | Before                                              | After                                           |
| ------------------- | --------------------------------------------------- | ----------------------------------------------- |
| `search`            | `room?` branched between `searchByRoom`/`searchGlobal` | `searchGlobal` unconditionally                  |
| `ask`               | Same branch + `room: ${node.room}` in formatter      | `searchGlobal`; formatter shows `workspace` + `private` |
| `federated_search`  | `room?` in input schema + `runFederatedSearch({room})` + response key | No `room` in schema / call / response           |
| `recall`            | `room?` passed to local `recall` use-case            | No `room`                                       |
| `federated_recall`  | `room?` passed to `runFederatedRecall`               | No `room`                                       |
| `deep_search`       | `room?` branched search + `room` in response object  | `searchGlobal`; response carries `workspace`/`private` |
| `recent_sessions`   | `nodesInRoom(graph, 'sessions')`                      | `id.startsWith('claude-session://')` filter      |

### Helper changes

- `roomSummary` → `workspaceSummary`. Aggregates by `node.workspace` (defaulting to `unassigned`). `graph_stats` now emits `workspace_detail` instead of `room_detail`.
- New `isOracleNodeId(id)` helper. Replaces the `node.room === 'oracle'` filter in `oracle_answerable` — uses the deterministic id-prefix (`oracle-question:` / `oracle-answer:`).

### Import cleanup

Imports removed from `src/mcp/server.ts`:

- `searchByRoom`, `findTunnels` from `application/use-cases.ts`
- `triggerRoom` from `application/ingest.ts`
- `nodesInRoom` (dynamic import inside `recent_sessions` body)
- `slugifyRoomName` (dynamic import inside `room_create` body)

No imports remain on `domain/rooms.ts`, `domain/system-rooms.ts`, or `infrastructure/rooms-config.ts` (all deleted in Wave 1).

## Deviations from Plan

### [Rule 3 — Blocking] Expanded the drop list from 3 tools to 6

**Found during:** Task 1 — reading the file revealed `room_create`, `room_list`, and `discover_loop` were all broken by upstream deletions.

- `room_create` calls `await import('../domain/rooms.js')` and `runtime.rooms.create(...)`. Both gone.
- `room_list` calls `runtime.rooms.load()`. Gone.
- `discover_loop` calls `discoveryLoop(deps)(room, ...)` and passes `runtime.rooms`. Both gone.

**Fix:** Dropped all three tools entirely. The alternative (keep them as broken handlers) would have left the MCP surface advertising tools that throw on first call — strictly worse than the plan's literal "drop 3" intent.

**Files modified:** `src/mcp/server.ts`
**Commit:** `844126a`

### [Rule 3 — Blocking] Recent_sessions and oracle_answerable used room-keyed filters

**Found during:** Task 2 reading.

- `recent_sessions` called `nodesInRoom(graph, 'sessions')`. `nodesInRoom` was removed in Wave 0.
- `oracle_answerable` filtered hits with `h.room !== 'oracle'`. `node.room` no longer typed (only `unknown` via the JSON-extension).

**Fix:** Both switched to id-prefix filters that survive the V5 schema:
- Sessions: `id.startsWith('claude-session://')` (matches `buildSessionNodeId` output)
- Oracle: `id.startsWith('oracle-question:') || id.startsWith('oracle-answer:')` (matches `nodeFromQuestion`/`nodeFromAnswer` output)

This is the "route to source_uri filter" the researcher noted for Open Question 2.

**Commit:** `844126a`

### Tool count: 17 not 13

**Plan's must_haves:** "MCP tool count is 13 (down from 16)."
**Reality:** Started at 23 tools (Phase 19 added `code_graph_query`, Phase 20 added `recent_sessions`, plus 5 oracle tools — `oracle_ask`, `oracle_answer`, `list_open_questions`, `oracle_answerable`, `oracle_answers` — plus `federated_recall`).
**After this plan:** 17 tools.

The plan's count expectation was stale, written against a pre-Phase-19/20 baseline. The directional intent — drop room tooling, strip room params — is fully delivered. No oracle tool was room-keyed (each filters by id-prefix already, modulo the one fix above).

## Final tool list (17)

1. `search` — global semantic search
2. `ask` — semantic + context block (workspace/private exposed)
3. `get_node` — single-node fetch
4. `get_neighbors` — neighborhood walk
5. `federated_search` — P2P fan-out
6. `sources_list` — descriptors
7. `recall` — entity-first local
8. `federated_recall` — entity-first P2P
9. `graph_stats` — nodes/edges/workspaces/vectors
10. `deep_search` — multi-hop traversal
11. `code_graph_query` — Phase 19 code-graph
12. `recent_sessions` — Phase 20 session rollups (now id-prefixed)
13. `oracle_ask` — post question
14. `oracle_answer` — post answer
15. `list_open_questions` — bulletin board
16. `oracle_answerable` — match-maker (now id-prefix filter)
17. `oracle_answers` — fetch answers for a question

## Acceptance criteria

All from the plan's `<acceptance_criteria>` blocks:

```
grep -cE '"list_rooms"|"find_tunnels"|"trigger_room"' src/mcp/server.ts        -> 0  PASS
grep -cE "room\\??:\\s*z\\.string" src/mcp/server.ts                            -> 0  PASS
grep -cE "input\\.room\\b|args\\.room\\b" src/mcp/server.ts                     -> 0  PASS
grep -cE "roomSummary|nodesInRoomFn|slugifyRoomName" src/mcp/server.ts         -> 0  PASS
grep -cE "from.*system-rooms|TOOLSHED|belongsToSystemRoom|nodesInSystemRoom" src/mcp/server.ts -> 0  PASS
wc -l src/mcp/server.ts                                                         -> 1042 (under 1100)  PASS
npx tsc --noEmit (errors in src/mcp/server.ts only)                             -> 0  PASS
grep -cE "server\\.registerTool\\(" src/mcp/server.ts                          -> 17 (>= 13)  PASS
```

## Release-notes flag

**BREAKING MCP API CHANGE — Phase 24, V5 wire-protocol cutover.**

External consumers (Claude Code, Cursor, Cline, Gemini CLI, any other MCP client wired to `wellinformed mcp start`) MUST update tool-call envelopes:

- Stop sending `room` on `search`, `federated_search`, `recall`, `federated_recall`, `deep_search`, `ask`, `recent_sessions`.
- Drop calls to `list_rooms`, `find_tunnels`, `trigger_room`, `room_create`, `room_list`, `discover_loop` — those tools no longer exist.
- Response shape: `graph_stats` now emits `workspaces`/`workspace_detail` (was `rooms`/`room_detail`). `deep_search` results carry `workspace`/`private` (was `room`).

## Decisions Made

- **No `--workspace` MCP parameter added.** Per plan recommendation: defer until consumers request it. Workspace filtering is currently a CLI-side concern via `runtime` cwd-detection; the MCP server runs out-of-process and out-of-cwd, so adding a workspace param without a use case would be premature.
- **Drop, don't refactor, the 3 broken-by-deletion tools.** `room_create` / `room_list` / `discover_loop` had no V5-coherent purpose — keeping them as stubs would advertise capability the server can't deliver.
- **Id-prefix beats source_uri-prefix for oracle.** Oracle nodes have deterministic ids (`oracle-question:<uuid>`, `oracle-answer:<uuid>`) — cheaper to check than `source_uri` and survives any future source_uri rewrites.

## Self-Check: PASSED

```
grep -cE '"list_rooms"|"find_tunnels"|"trigger_room"' src/mcp/server.ts        -> 0      PASS
grep -cE "room\\??:\\s*z\\.string" src/mcp/server.ts                            -> 0      PASS
grep -cE "input\\.room\\b|args\\.room\\b" src/mcp/server.ts                     -> 0      PASS
grep -cE "roomSummary|nodesInRoomFn|slugifyRoomName" src/mcp/server.ts         -> 0      PASS
grep -cE "from.*system-rooms|TOOLSHED|belongsToSystemRoom" src/mcp/server.ts   -> 0      PASS
grep -cE "server\\.registerTool\\(" src/mcp/server.ts                          -> 17     PASS
wc -l src/mcp/server.ts                                                         -> 1042   PASS
npx tsc --noEmit 2>&1 | grep "src/mcp/server.ts" | wc -l                       -> 0      PASS
git log --oneline -1                                                            -> 844126a feat(24-08): ...  PASS
```

## Commits

| Hash      | Message                                                                          |
| --------- | -------------------------------------------------------------------------------- |
| `844126a` | `feat(24-08): drop 6 room-tools + strip room param from MCP surface (V5)`        |

Branch `feat/delete-rooms`. No co-authored commits (per user global CLAUDE.md). Not pushed.

## What Comes Next

This plan finishes Wave 2c. Wave 3 (the surgical-edit set against `/tmp/phase24-wave0-blastradius.txt`) still needs to:

- Strip `room` from `IndexNodeCommand`, `RoomSearchQuery`, `TunnelDetectionQuery` in `src/application/use-cases.ts`
- Strip `room: 'oracle'` from `indexNode(deps)(...)` call sites inside oracle tool handlers (currently passes the literal — works at the type level until use-cases lose `room`)
- Apply the same room-deletion sweep across the 11 application files, 7 infrastructure files, 3 CLI files still showing tsc errors

`mcp/server.ts` itself is now complete and stable on the V5 surface.
