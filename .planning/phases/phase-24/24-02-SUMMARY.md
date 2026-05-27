---
phase: phase-24
plan: 02
subsystem: rooms-deletion
tags: [v5-cutover, deletion, wave-1a, rooms, share-picker, breaking-change]
dependency_graph:
  requires:
    - phase: phase-24-01
      provides: "Schema wedge in GraphNode (room field removed)"
  provides:
    - "5 room source files removed from tree (846 LOC)"
    - "3 phase tests for room subsystem deleted (693 LOC)"
    - "share-picker TUI + test removed (304 LOC)"
    - "cli/index.ts no longer dispatches `room` subcommand"
    - ".gone-files-list.txt audit artifact"
  affects:
    - "Wave 1b (wire-protocol surgery) — no longer has rooms imports to worry about"
    - "Wave 1c (runtime + daemon) — can drop fileRoomsConfig cleanly"
    - "Wave 2 (rewrites of share-sync.ts, share.ts, unshare.ts, mcp/server.ts)"
    - "Wave 3 (47 surgical edits to fix import-site TS2305 errors)"
tech-stack:
  added: []
  patterns:
    - "Atomic deletion commits per logical group (sources / tests / TUI)"
    - "git rm (not rm) so deletions are staged for review"
    - "Hard cutover, no shims (per phase 24 synthesis lock)"
key-files:
  created:
    - path: ".planning/phases/phase-24/.gone-files-list.txt"
      change: "Audit trail of deleted files + line counts for post-phase LOC delta"
  modified:
    - path: "src/cli/index.ts"
      change: "Dropped `room` import + dispatch entry + JSDoc reference"
  deleted:
    - "src/domain/rooms.ts (116)"
    - "src/domain/system-rooms.ts (157)"
    - "src/infrastructure/rooms-config.ts (80)"
    - "src/infrastructure/share-store.ts (322)"
    - "src/cli/commands/room.ts (171)"
    - "tests/phase4.rooms.test.ts (248)"
    - "tests/phase1.graph-rooms.test.ts (216)"
    - "tests/phase36.system-rooms.test.ts (229)"
    - "src/cli/tui/share-picker-tty.ts (142)"
    - "tests/phase37.share-picker.test.ts (162)"
key-decisions:
  - "Open Question 1 (share-picker fate) RESOLVED at planning time: delete TUI + test, keep domain layer (Wave 2b decides domain fate). Rationale per 24-RESEARCH.md line 885: without rooms there is nothing to pick; sharing becomes `wellinformed share <peer>` direct command."
  - "Grouped deletions into 3 atomic commits (sources / tests / share-picker pair) — preserves git-blame granularity while staying within plan's `atomic per task` rule."
  - "Pre-existing untracked changes to src/cli/index.ts (gc, bench imports) stashed before Task 2 edit and restored after commit — keeps Task 2 diff pure-deletion with no scope creep."
patterns-established:
  - "Deletion-first, fix-imports-later: import-site errors in consumers (TS2305) are expected blast-radius and routed to Wave 3 — Wave 1a does NOT fix them."
  - "Audit artifact (.gone-files-list.txt) captures pre-deletion LOC for the post-phase LOC delta report."
requirements-completed:
  - "ROOMS-DEL-01 (room CLI removed)"
  - "ROOMS-DEL-02 (rooms.json no longer read/written — file deleted)"
  - "ROOMS-DEL-03 (shared-rooms.json store removed — share-store.ts deleted)"
duration: 2 min
completed: 2026-05-27
---

# Phase 24 Plan 02: Wave 1a Deletions Summary

**Excised 10 room-vocabulary files (1,843 LOC) and the `room` CLI dispatch entry, collapsing the import surface so subsequent Wave 1b/1c/1d edits cannot accidentally reach into deleted modules.**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-27T08:46:54Z
- **Completed:** 2026-05-27T08:49:27Z
- **Tasks:** 2 (Task 1: 10 files deleted across 3 atomic commits; Task 2: cli/index.ts dispatch removal)
- **Files modified:** 11 (10 deleted + 1 edited)
- **LOC removed:** 1,843

## Accomplishments

- Domain vocabulary (`rooms.ts`, `system-rooms.ts`) entirely gone — `Room`, `nodesInRoom`, `roomFilter`, `toolshed/research` system rooms have zero on-disk presence
- Persistence layer (`rooms-config.ts`, `share-store.ts`) gone — `~/.wellinformed/rooms.json` and `~/.wellinformed/shared-rooms.json` are no longer read or written by any compilable code path
- CRUD CLI (`commands/room.ts`) gone, with its dispatch entry stripped from `cli/index.ts` — `wellinformed room ...` returns "unknown command"
- Phase tests (phase1.graph-rooms, phase4.rooms, phase36.system-rooms) — 693 lines of test code whose subject no longer exists are gone
- share-picker TUI + test deleted per Open Question 1 resolution; share-picker.ts domain layer left for Wave 2b decision

## Task Commits

Each task was committed atomically (Task 1 split into 3 logical groups for git-blame clarity):

1. **Task 1a: 5 source files** — `1389a10` (chore: delete 5 room source files)
2. **Task 1b: 3 phase tests** — `8b8c0f6` (chore: delete 3 phase tests for room subsystem)
3. **Task 1c: share-picker pair** — `b40586e` (chore: delete share-picker TUI + test)
4. **Task 2: cli/index.ts dispatch** — `384ef55` (chore: remove room dispatch case from cli/index.ts)

All commits on `feat/delete-rooms`. No co-authored lines (per user's global CLAUDE.md).

## Files Created/Modified

### Created
- `.planning/phases/phase-24/.gone-files-list.txt` — audit trail (10 paths + LOC)

### Modified
- `src/cli/index.ts` — dropped `import { room }` + `room,` dispatch entry + JSDoc mention (1 insertion / 3 deletions)

### Deleted (10 files, 1,843 LOC total)

| File | LOC | Commit |
|------|-----|--------|
| src/domain/rooms.ts | 116 | 1389a10 |
| src/domain/system-rooms.ts | 157 | 1389a10 |
| src/infrastructure/rooms-config.ts | 80 | 1389a10 |
| src/infrastructure/share-store.ts | 322 | 1389a10 |
| src/cli/commands/room.ts | 171 | 1389a10 |
| tests/phase4.rooms.test.ts | 248 | 8b8c0f6 |
| tests/phase1.graph-rooms.test.ts | 216 | 8b8c0f6 |
| tests/phase36.system-rooms.test.ts | 229 | 8b8c0f6 |
| src/cli/tui/share-picker-tty.ts | 142 | b40586e |
| tests/phase37.share-picker.test.ts | 162 | b40586e |

**Subtotals:** 846 LOC (source) + 693 LOC (tests) + 304 LOC (share-picker pair) = **1,843 LOC removed**

## Decisions Made

- **Grouped deletion commits.** Plan declared 2 tasks but flexibility on "each deletion or grouped deletion is its own atomic commit". I grouped Task 1's 10 deletions into 3 atomic commits by subsystem (sources / tests / share-picker pair) for cleaner git-blame and easier revert if needed. This matches the constraint's spirit.
- **Stash-then-restore for Task 2.** Pre-existing untracked work in `src/cli/index.ts` (gc + bench imports from a parallel branch of work) was stashed before applying Task 2 edits and restored after committing. Result: the 24-02 commit `384ef55` shows ONLY the 3 room-removal lines (1 insertion + 3 deletions) — meets the acceptance criterion's "no additions" intent.

## Deviations from Plan

None — plan executed exactly as written. The grouped-commit decision is within the plan's flexibility clause ("each deletion or grouped deletion is its own atomic commit").

## Issues Encountered

- **Pre-existing `src/cli/index.ts` modifications** (unrelated gc/bench imports already in working tree from parallel work). Resolved by stashing before Task 2 and popping after commit, keeping the 24-02 commit diff surgical. No code lost; the gc/bench changes remain in the working tree untracked.

## Self-Check: PASSED

```
test ! -f src/domain/rooms.ts              -> PASS
test ! -f src/domain/system-rooms.ts       -> PASS
test ! -f src/infrastructure/rooms-config.ts -> PASS
test ! -f src/infrastructure/share-store.ts  -> PASS
test ! -f src/cli/commands/room.ts         -> PASS
test ! -f tests/phase4.rooms.test.ts       -> PASS
test ! -f tests/phase1.graph-rooms.test.ts -> PASS
test ! -f tests/phase36.system-rooms.test.ts -> PASS
test ! -f src/cli/tui/share-picker-tty.ts  -> PASS
test ! -f tests/phase37.share-picker.test.ts -> PASS
grep -c "room" src/cli/index.ts            -> 0 PASS
git log --grep="24-02"                     -> 4 commits PASS
git rev-parse --abbrev-ref HEAD            -> feat/delete-rooms PASS
[ -f .planning/phases/phase-24/.gone-files-list.txt ] -> PASS
```

## Next Phase Readiness

- **Wave 1b (wire-protocol surgery):** can proceed in parallel — search-sync.ts, peer-pull-telemetry.ts, touch-protocol.ts, share-envelope.ts no longer have room imports to fight against
- **Wave 1c (runtime + daemon):** safe to drop fileRoomsConfig and RoomsConfig type references — the underlying files are gone
- **Wave 1d (hook scripts):** independent of 24-02; already in progress (commits 5908c6b, 1aabcd3, 89cb376 visible on branch)
- **Wave 2 (rewrites):** share-sync.ts, share.ts, unshare.ts, mcp/server.ts have their import-site errors waiting — Wave 2 + Wave 3 collaboratively resolve them

**Blockers:** None. The 43-error tsc blast radius from Wave 0 is expected and unchanged in shape — only shifted (some TS2305 errors now resolve to "module not found" instead of "no exported member", which is equivalent for our purposes).

---
*Phase: phase-24*
*Plan: 02*
*Completed: 2026-05-27*
