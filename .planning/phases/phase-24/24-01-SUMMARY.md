---
phase: phase-24
plan: 01
subsystem: domain-schema
tags: [v5-cutover, schema-wedge, wave-0, rooms-deletion, breaking-change]
dependency_graph:
  requires: []
  provides:
    - "AkashikNodeFields with workspace + private, no room"
    - "Catalogued tsc --noEmit blast radius for Waves 1-3"
  affects:
    - "31 downstream files (43 compile errors) — every consumer of GraphNode/Room/nodesInRoom/TraversalOptions.room/roomFilter"
tech_stack:
  added: []
  patterns:
    - "Hard cutover (no shims, no two-name period) — the compile errors ARE the migration map"
    - "Schema-first wedge — type change drives downstream edits like a wedge through tsc"
key_files:
  created: []
  modified:
    - path: "src/domain/graph.ts"
      change: "drop Room/room field/nodesInRoom/roomFilter/TraversalOptions.room; add workspace?: string + private: boolean"
    - path: ".planning/REQUIREMENTS.md"
      change: "add ROOMS-DEL-01..08 + traceability row; coverage 38 -> 46"
decisions:
  - "Hard cutover with no shims — synthesis-locked; user has no live peers, no backward-compat window needed"
  - "private: boolean is REQUIRED (not optional) — forces every downstream node construction site to explicitly opt-in/out of federation"
  - "Wing type alias kept — still used by sources adapter; only Room is gone"
  - "Readonly<Record<string, unknown>> extension preserved on GraphNode — v4 JSON round-trips for migrate v5 + doctor commands"
  - "BFS/DFS room guards removed entirely (not replaced with workspace guards) — workspace pre-filter is a read-site concern, not a traversal-layer concern"
requirements_delivered:
  - "ROOMS-DEL-04 (schema change) — partially: type definition is in place; node-construction sites updated in Wave 3"
metrics:
  duration: "~25 minutes"
  completed_date: "2026-05-27"
  commits: 2
  files_modified: 2
  tsc_errors_introduced: 43
  tsc_files_affected: 31
---

# Phase 24 Plan 01: V5 Schema Wedge Summary

**One-liner:** Excised the `Room` type and `room?: Room` field from `GraphNode` and added `workspace?: string` + `private: boolean`, deliberately breaking 43 downstream call sites across 31 files to produce the definitive blast-radius map for Waves 1-3.

## What Was Built

### REQUIREMENTS.md (commit `aef2fad`)
- New section: `### Rooms Deletion (V5 Wire-Protocol Break)` with `ROOMS-DEL-01..08`
- Traceability row: `| ROOMS-DEL-01..08 | Phase 24 | Pending |`
- Coverage totals bumped: 38 -> 46 requirements

### graph.ts schema change (commit `a182fee`)

**Final shape of `AkashikNodeFields`:**

```typescript
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

**Removed entirely:**
- `export type Room = string;` (type alias)
- `nodesInRoom(g, room)` (filter function)
- `roomFilter(g, room)` (internal BFS/DFS predicate)
- `TraversalOptions.room` (traversal filter)
- BFS/DFS `if (!room) return true` guards
- Module-level JSDoc mentions of "Room" vocabulary

**Kept (intentional):**
- `export type Wing = string;` — sources adapter still uses it
- `Readonly<Record<string, unknown>>` extension on `GraphNode` — v4 JSON round-trips through v5 code so migrate + doctor can read pre-migration graphs

## Blast Radius (Wave 1-3 Input)

`tsc --noEmit` exit code: NON-ZERO (expected — this IS the wedge working)

```
Total error lines:  56  (in /tmp/phase24-wave0-blastradius.txt)
TypeScript errors:  43
Unique files:       31
```

### Error categories

| Code | Count | Meaning |
|------|-------|---------|
| TS2305 | 21 | "no exported member 'Room' / 'nodesInRoom'" — import-site fixes |
| TS2322 | 12 | "type X is not assignable to GraphNode" — node-construction sites missing `private` |
| TS2352 | 4 | "conversion may be a mistake" — `as GraphNode` cast sites missing `private` |
| TS7006 | 3 | "Parameter 'n' implicitly has 'any' type" — fallout from removed function exports |
| TS2353 | 1 | `room` does not exist in `TraversalOptions` |
| TS2345 | 1 | Telemetry envelope room arg type mismatch |
| TS2339 | 1 | Property access on shrunken type |

### Files by directory

| Directory | Files affected |
|-----------|---------------|
| `src/application/` | 11 |
| `src/domain/` | 7 |
| `src/infrastructure/` | 7 |
| `src/cli/` | 3 |
| `src/daemon/` | 1 |
| `src/mcp/` | 1 |
| `src/telegram/` | 1 |

### Top-error hotspots (likely Wave 2/3 priority)

| File | Errors |
|------|--------|
| `src/cli/commands/consolidate.ts` | 4 |
| `src/application/use-cases.ts` | 3 |
| `src/application/report.ts` | 3 |
| `src/infrastructure/touch-protocol.ts` | 2 |
| `src/infrastructure/share-sync.ts` | 2 |
| `src/cli/commands/share.ts` | 2 |
| `src/application/peer-pull-telemetry.ts` | 2 |
| `src/application/batch-ingest.ts` | 2 |

The full error log is at `/tmp/phase24-wave0-blastradius.txt` (56 lines).

## Deviations from Plan

**None.** The plan executed exactly as written:

- Task 1 (REQUIREMENTS.md): 8 IDs + traceability + coverage update — clean insertion-only diff (16 lines net change, 2 deletions are the coverage number bumps).
- Task 2 (graph.ts): All 7 enumerated targets removed (`Room` alias, `room?: Room`, `nodesInRoom`, `roomFilter`, `TraversalOptions.room`, BFS guard, DFS guard); both new fields added with JSDoc per the interface spec.

Minor additions beyond the literal task list (still in scope of the deviation rules):
- **Rule 2 (critical hygiene):** Updated the module-level JSDoc that still listed "Room" in the vocabulary and described "Room filtering is a predicate passed down to traversal" — these documentation lines would have been actively misleading for the next reader after the type was gone.

No architectural decisions raised — every change was inside the locked scope of the synthesis.

## Self-Check: PASSED

```
grep -n 'room?:' src/domain/graph.ts          -> (no hits) PASS
grep -n 'workspace?:' src/domain/graph.ts     -> line 48 PASS
grep -n 'private:' src/domain/graph.ts        -> line 50 PASS
grep -c 'ROOMS-DEL-' .planning/REQUIREMENTS.md -> 9 PASS (8 reqs + 1 traceability row)
git log feat/delete-rooms ^main                -> 2 commits visible PASS
npx tsc --noEmit 2>&1 | wc -l                  -> 56 (expected NON-ZERO — wedge working) PASS
```

## Commits

| Hash | Message |
|------|---------|
| `aef2fad` | `feat(24-01): add ROOMS-DEL-01..08 requirements for V5 cutover` |
| `a182fee` | `refactor(24-01): excise Room from GraphNode schema; add workspace + private (V5 wedge)` |

Both on branch `feat/delete-rooms`. No co-authored commits (per user's global CLAUDE.md). Not pushed.

## What Comes Next

Wave 1 (parallel-safe deletions + wire protocol):

- **1a — File deletions:** `src/domain/rooms.ts`, `src/domain/system-rooms.ts`, `src/infrastructure/rooms-config.ts`, `src/infrastructure/share-store.ts`, `src/cli/commands/room.ts`, plus 3 phase-test files.
- **1b — Wire-protocol surgery:** `search-sync.ts`, `peer-pull-telemetry.ts`, `touch-protocol.ts`, `share-envelope.ts` (drop `room` field from each envelope).
- **1c — Runtime + daemon:** `src/cli/runtime.ts` (drop `fileRoomsConfig`, add `detectWorkspace()`), `src/daemon/loop.ts` (drop `RoomsConfig`).
- **1d — Hook scripts:** 5 `.claude/hooks/akashik-*` files (drop `room` from hit formatter; show `workspace` when present).

Wave 2 (rewrites): `share-sync.ts` (869 -> ~400 lines), `share.ts` / `unshare.ts`, `mcp/server.ts`.

Wave 3 (~47 surgical edits): Walk the `/tmp/phase24-wave0-blastradius.txt` list. Every TS2322 / TS2352 line is a node-construction site that needs `private: false` (or `true` for sensitive nodes). Every TS2305 line is an import statement that needs `Room` / `nodesInRoom` / `roomFilter` removed.

Wave 4: `akashik migrate v5` command + new `tests/phase24.rooms-deleted.test.ts` + edits to ~13 existing tests.

State updates (STATE.md / ROADMAP.md) intentionally deferred to a later wave per the executor's instructions — gsd-tools indexer bugs make those updates unreliable mid-phase.
