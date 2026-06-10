---
phase: 20-session-persistence
plan: "03"
subsystem: integration-layer
tags: [session-ingestion, daemon-tick, mcp-tool, cli, share-guard, hook-extension, retention]
dependency_graph:
  requires:
    - Plan 01 (SessionError, SessionsConfig, shareable flag)
    - Plan 02 (claude-sessions adapter, sessions-state.ts, claudeSessionsSource)
  provides:
    - src/application/session-ingest.ts (ensureSessionsRoom + enforceRetention)
    - src/cli/commands/recent-sessions.ts (rollupSessions + CLI entry)
    - 16th MCP tool recent_sessions in src/mcp/server.ts
    - sessions room auto-provision + retention pass in daemon tick
    - share room sessions hard-refuse (hardcoded + flag-based)
    - PreToolUse hook SessionStart branch in claude-install.ts
  affects:
    - Plan 04 (test suite validates all integration points defined here)
    - src/daemon/loop.ts (runOneTick extended with two new steps)
    - src/cli/runtime.ts (buildPatterns now wired from config.yaml)
    - tests/phase6.daemon.test.ts (room count assertion relaxed for sessions room)
    - tests/phase17.mcp-tool.test.ts (C2 assertion 15 -> 16)
tech_stack:
  added: []
  patterns:
    - idempotent room auto-provision on every daemon tick (rooms.create deduplicates)
    - enforceRetention walks nodesInRoom + hasKeySignal filter + graphs.save
    - rollupSessions pure helper exported for CLI + MCP reuse (single implementation)
    - CLAUDE_HOOK_EVENT branching in shell hook (SessionStart vs PreToolUse)
    - defence-in-depth share guard (hardcoded literal + shareable === false flag check)
key_files:
  created:
    - src/application/session-ingest.ts
    - src/cli/commands/recent-sessions.ts
  modified:
    - src/daemon/loop.ts
    - src/cli/runtime.ts
    - src/cli/index.ts
    - src/mcp/server.ts
    - src/cli/commands/share.ts
    - src/cli/commands/claude-install.ts
    - tests/phase17.mcp-tool.test.ts
    - tests/phase6.daemon.test.ts
decisions:
  - rollupSessions exported from CLI module and imported dynamically by MCP tool to avoid circular deps
  - enforceRetention reads config.yaml itself (not via IngestDeps) to keep IngestDeps unchanged
  - runtime.ts updated to load config.yaml and pass real buildPatterns to claudeSessions registry deps
  - shell hook branches on CLAUDE_HOOK_EVENT env var (set by each hook config entry) — single script, two modes
  - phase6.daemon.test.ts room count assertion changed from === 1 to >= 1 (sessions room now auto-added)
metrics:
  duration_seconds: 1298
  completed_at: "2026-04-13T13:38:30Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 8
---

# Phase 20 Plan 03: Integration Layer Summary

**One-liner:** Session-ingest use case (ensureSessionsRoom + enforceRetention) wired into daemon tick, recent-sessions CLI + 16th MCP tool, share-sessions hard-refuse, and PreToolUse hook extended with SessionStart branch — zero new deps, 243/243 tests pass.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create session-ingest use case + wire daemon tick | 125bc33 | src/application/session-ingest.ts (new), src/daemon/loop.ts, src/cli/runtime.ts, tests/phase6.daemon.test.ts |
| 2 | Add recent-sessions CLI + recent_sessions MCP tool (16th) + bump C2 test | 3a5b479 | src/cli/commands/recent-sessions.ts (new), src/cli/index.ts, src/mcp/server.ts, tests/phase17.mcp-tool.test.ts |
| 3 | Hard-refuse share for sessions room + PreToolUse hook SessionStart branch | 78b2aaf | src/cli/commands/share.ts, src/cli/commands/claude-install.ts |

## Verification

- `npx tsc --noEmit` exits 0
- `npm test` 243/243 pass, 0 failures
- `grep "server.registerTool(" src/mcp/server.ts | wc -l` = 16
- `grep "SESSIONS_ROOM = 'sessions'" src/application/session-ingest.ts` present
- `grep "shareable: false" src/application/session-ingest.ts` present on addSharedRoom call
- `grep "hasKeySignal" src/application/session-ingest.ts` called inside enforceRetention
- `grep "ensureSessionsRoom" src/daemon/loop.ts` invoked at top of runOneTick
- `grep "enforceRetention" src/daemon/loop.ts` invoked after runRooms + share-sync
- `grep "'recent-sessions':" src/cli/index.ts` present
- `grep "shareable === false" src/cli/commands/share.ts` present
- `grep "sessions.*refused" src/cli/commands/share.ts` present (hardcoded guard)
- `grep "loadSharedRooms" src/cli/commands/share.ts` imported
- `grep "SessionStart" src/cli/commands/claude-install.ts` present (branch + hook config)
- `grep "recent-sessions --hours 24" src/cli/commands/claude-install.ts` present
- `grep "matches.length" tests/phase17.mcp-tool.test.ts` shows 16 (not 15)
- `package.json` diff is 0 lines — zero new npm packages

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] phase6.daemon.test.ts rooms count assertion**
- **Found during:** Task 1 test run (1 failure: `2 !== 1`)
- **Issue:** `ensureSessionsRoom` auto-provisions the `sessions` room on every tick. The existing test asserted `tick.rooms.length === 1` (only homelab) but now the sessions room is also created and ticked, producing 2 rooms.
- **Fix:** Changed assertion to `>= 1` and find homelab by name instead of by array index. The test still validates homelab items_new >= 2 — correctness is preserved.
- **Files modified:** tests/phase6.daemon.test.ts
- **Commit:** 125bc33

**2. [Rule 2 - Missing functionality] runtime.ts claudeSessions patterns: []**
- **Found during:** Task 1 (Plan 02 summary noted: "Plan 03 replaces with buildPatterns")
- **Issue:** runtime.ts was wired with `patterns: []` and `scanUserMessages: false` (Plan 02 left this as a deliberate placeholder). Session ingest would silently skip all secrets scanning.
- **Fix:** Updated `defaultRuntime` to load config.yaml via `loadConfig` (which returns typed defaults when the file is absent — never fails) and pass `buildPatterns(cfg.security.secrets_patterns)` + `cfg.sessions.scan_user_messages` to the claudeSessions registry deps.
- **Files modified:** src/cli/runtime.ts
- **Commit:** 125bc33

## Self-Check: PASSED

- FOUND: src/application/session-ingest.ts
- FOUND: src/cli/commands/recent-sessions.ts
- FOUND: .planning/phases/phase-20/20-03-SUMMARY.md
- FOUND commit 125bc33: feat(phase20-03): create session-ingest use case + wire daemon tick
- FOUND commit 3a5b479: feat(phase20-03): add recent-sessions CLI + recent_sessions MCP tool (16th) + bump C2 test
- FOUND commit 78b2aaf: feat(phase20-03): share hard-refuse for sessions room + PreToolUse SessionStart hook
