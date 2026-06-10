---
phase: 20-session-persistence
plan: "02"
subsystem: source-adapter
tags: [session-ingestion, source-adapter, incremental-ingest, secrets-scan, atomic-io]
dependency_graph:
  requires:
    - Plan 01 (SessionError, SessionState, SessionEntry, classifyJsonlEntry, sessionNodeLabel)
    - Phase 15 (scanNode + buildPatterns from src/domain/sharing.ts)
  provides:
    - src/infrastructure/sessions-state.ts (atomic state I/O: load/save/mutate)
    - src/infrastructure/sources/claude-sessions.ts (source adapter with incremental tail-follow + secrets redaction)
    - SourceKind 'claude_sessions' in src/domain/sources.ts
    - claudeSessions deps slot in SourceRegistryDeps
  affects:
    - Plan 03 (room auto-provisioning — reads sessions-state.ts and claudeSessionsSource)
    - Plan 04 (test suite validates adapter output shapes defined here)
    - src/cli/runtime.ts (now passes claudeSessions deps to sourceRegistry)
    - tests/phase{2,3,4,5,6}.*.test.ts (stub claudeSessions deps added to every sourceRegistry call)
tech_stack:
  added: []
  patterns:
    - atomic tmp+rename write (mirrored from peer-store.ts)
    - exclusive .lock file for cross-process safety (mirrored from peer-store.ts)
    - partial-line tail-follow (standard log-tail pattern)
    - belt-and-suspenders current-session skip (env var + mtime guard)
    - scanNode redaction (not rejection): blocked content stays in graph with [BLOCKED: name] marker
    - factory-of-factories adapter shape (deps => descriptor => Source)
    - single-write-per-tick state persistence (accumulate updates, one mutateSessionsState call)
key_files:
  created:
    - src/infrastructure/sessions-state.ts
    - src/infrastructure/sources/claude-sessions.ts
  modified:
    - src/domain/sources.ts
    - src/infrastructure/sources/registry.ts
    - src/cli/runtime.ts
    - tests/phase2.ingest.test.ts
    - tests/phase3.mcp.test.ts
    - tests/phase4.rooms.test.ts
    - tests/phase5.ask-report.test.ts
    - tests/phase6.daemon.test.ts
decisions:
  - "scanNode called on both label/id/room (canonical) AND baseSummary directly — the summary text is the real leak surface for pasted API keys; canonical scanNode only checks ShareableNode fields"
  - "readTail advances byteOffset by complete-line bytes only (sum of line + \\n), never by file size — guarantees next tick re-reads any partial bytes after last \\n"
  - "mutateSessionsState called once per tick (not once per file) — N files = 1 lock+read+write cycle; avoids N lock acquisitions for large session repos"
  - "isCurrentSession checks CLAUDE_SESSION_ID env first (exact basename match), then mtime<5s — env guard handles instant-flush sessions; mtime guard handles sessions without env var"
  - "SE.stateFileError used for all sessions-state.json failures — no PeerError leakage across bounded contexts"
  - "runtime.ts wired with patterns: [] (empty) — Plan 03 will replace with buildPatterns(cfg.security.secrets_patterns) once the sessions room config is wired"
metrics:
  duration_seconds: 1200
  completed_at: "2026-04-13T14:00:00Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 2
  files_modified: 8
---

# Phase 20 Plan 02: Source Adapter Layer Summary

**One-liner:** Atomic sessions-state.ts (tmp+rename + .lock) + claude-sessions source adapter with belt-and-suspenders current-session skip, partial-line buffered reads, scanNode redaction, and single-tick state write — zero new deps, 243/243 tests pass.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create src/infrastructure/sessions-state.ts (atomic state file I/O) | f8f937c | src/infrastructure/sessions-state.ts (new) |
| 2 | Create src/infrastructure/sources/claude-sessions.ts adapter | 20eb582 | src/infrastructure/sources/claude-sessions.ts (new) |
| 3 | Wire claude_sessions kind into SourceKind union + registry | e1c88d3 | src/domain/sources.ts, src/infrastructure/sources/registry.ts, src/cli/runtime.ts, 5 test files |

## Verification

- `npx tsc --noEmit` exits 0 (exhaustive switch on AppError enforced — no default clause)
- `npm test` 243/243 pass, 0 failures, 0 regressions
- `grep "PeerError" src/infrastructure/sessions-state.ts` returns 0 (clean bounded context)
- `grep "SESSIONS_STATE_VERSION = 1"` present, `EMPTY_STATE` frozen
- `grep "CURRENT_SESSION_SKIP_MS = 5_000"` present
- `grep "CLAUDE_SESSION_ID"` appears 4 times (env read + isCurrentSession guard)
- `grep "scanNode"` appears 6 times (import + direct pattern loop + canonical check + comment)
- `grep "_blocked_by_secret_scan"` appears 3 times (projectEntry + toContentItem + SessionNode field)
- `grep "mutateSessionsState"` appears 4 times (import + one call site per tick)
- `grep "throw "` returns 0 (no throws)
- `package.json` diff is 0 lines — zero new npm packages

## Critical Pitfalls — Implemented

| Pitfall | Implementation |
|---------|----------------|
| P1: Current-session skip | `isCurrentSession`: CLAUDE_SESSION_ID basename match OR mtime within 5 s of `deps.nowMs()` |
| P2: Partial-line buffering | `readTail`: splits on `\n`, defers non-empty last element, advances byteOffset by `sum(Buffer.byteLength(line)+1)` for complete lines only |
| P3: scanNode redaction | `projectEntry`: scans baseSummary directly with `re.lastIndex=0`, then canonical `scanNode` on graph-shaped node; on match sets `[BLOCKED: name]` + `_blocked_by_secret_scan: true`; node NOT dropped |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Decisions Clarified

**1. Dual-scan in projectEntry (not a deviation — defensive correctness)**
The plan spec said "call scanNode(node, patterns) BEFORE emitting". The canonical `scanNode` in sharing.ts only scans `id`, `label`, `room`, `source_uri`, `fetched_at`, `embedding_id` fields of a `ShareableNode`. Session `content_summary` (the actual user message text — the real leak surface for pasted API keys) is NOT one of those fields. The adapter therefore applies patterns directly against `baseSummary` (with the same `re.lastIndex = 0` discipline) before also running canonical `scanNode` on the projected graph node. Both checks set `_blocked_by_secret_scan: true` and replace content. This is strictly more secure than the plan's description implied.

**2. runtime.ts wired with `patterns: []`**
The plan deferred real config wiring to Plan 03. The runtime.ts call site passes an empty patterns array (secrets scanning still works — it just has no patterns to match). Plan 03 replaces this with `buildPatterns(cfg.security.secrets_patterns)` when it wires the sessions room config end-to-end.

## Self-Check: PASSED

- FOUND: src/infrastructure/sessions-state.ts (242 lines)
- FOUND: src/infrastructure/sources/claude-sessions.ts (368 lines)
- FOUND: 'claude_sessions' in src/domain/sources.ts
- FOUND: claudeSessionsSource + claudeSessions in src/infrastructure/sources/registry.ts
- FOUND commit f8f937c: feat(phase20-02): create sessions-state.ts with atomic tmp+rename I/O
- FOUND commit 20eb582: feat(phase20-02): create claude-sessions source adapter
- FOUND commit e1c88d3: feat(phase20-02): wire claude_sessions SourceKind + registry + call-site stubs
