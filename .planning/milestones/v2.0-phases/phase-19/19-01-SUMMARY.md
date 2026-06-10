---
phase: phase-19
plan: "01"
subsystem: codebase-indexing-foundation
tags:
  - tree-sitter
  - domain-types
  - sqlite
  - code-graph
  - neverthrow
dependency_graph:
  requires: []
  provides:
    - CodebaseError (8 variants, AppError 8th bounded context)
    - src/domain/codebase.ts (CodebaseId, CodeNode, CodeEdge, Codebase types)
    - src/infrastructure/code-graph.ts (openCodeGraph, CodeGraphRepository port)
  affects:
    - src/domain/errors.ts
    - package.json
tech_stack:
  added:
    - tree-sitter@0.21.1 (exact pin — 0.25.0 incompatible with typescript grammar peer deps)
    - tree-sitter-typescript@0.23.2 (exact pin)
    - tree-sitter-python@0.23.4 (exact pin — 0.25.0 requires tree-sitter@^0.25.0 which conflicts)
  patterns:
    - ResultAsync lazy-open factory (mirrors openSqliteVectorIndex)
    - PRAGMA user_version schema migration (mirrors peer-store.ts PEERS_FILE_VERSION)
    - Branded string type for CodebaseId
    - Pure id derivation via sha256 (node:crypto)
    - Port + adapter split (CodeGraphRepository interface + build() adapter)
key_files:
  created:
    - src/domain/codebase.ts
    - src/infrastructure/code-graph.ts
  modified:
    - src/domain/errors.ts
    - package.json
    - package-lock.json
decisions:
  - "tree-sitter version pins corrected: 0.21.1 (not 0.25.0) — tree-sitter-typescript@0.23.2 peer requires ^0.21.0; tree-sitter-python@0.23.4 (not 0.25.0) for same compatibility window"
  - "searchNodes uses SQLite LIKE (FTS5 deferred to Phase 20 per CONTEXT.md)"
  - "deleteCodebase cascades via ON DELETE CASCADE FK constraints — no manual cleanup needed"
metrics:
  duration_seconds: 792
  completed_date: "2026-04-12"
  tasks_completed: 3
  files_modified: 5
  tests_before: 163
  tests_after: 163
  test_regressions: 0
---

# Phase 19 Plan 01: Foundation Layer — Code Graph Types + SQLite Adapter Summary

**One-liner:** CodebaseError 8-variant bounded context, pure Codebase/CodeNode/CodeEdge domain types, and openCodeGraph SQLite adapter with PRAGMA user_version schema v1 migration over a separate code-graph.db.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Pin tree-sitter deps + CodebaseError | 9284632 | package.json, src/domain/errors.ts |
| 2 | src/domain/codebase.ts — pure types | 1eb5e2e | src/domain/codebase.ts (new) |
| 3 | src/infrastructure/code-graph.ts — SQLite adapter | b50c430 | src/infrastructure/code-graph.ts (new) |

## What Was Built

### Task 1 — Dependencies + CodebaseError
Three tree-sitter packages installed at exact (no `^` or `~`) version pins. `CodebaseError` added as the 8th bounded context in `AppError` with 8 variants covering every failure surface at the infrastructure boundary: `CodebaseDbOpenError`, `CodebaseDbReadError`, `CodebaseDbWriteError`, `CodebaseGrammarMissingError`, `CodebaseParseError`, `CodebaseNotFoundError`, `CodebaseAttachFailedError`, `CodebaseInvalidPathError`. All 8 cases wired into the exhaustive `formatError` switch — TypeScript compile verifies coverage.

### Task 2 — src/domain/codebase.ts
Pure type file, zero infrastructure imports, zero side effects. Exports:
- `CodebaseId` — branded string type, 16-char hex sha256 of absolute path
- `SupportedLanguage` — `typescript | javascript | python` (Rust/Go Phase 20)
- `CodeNodeKind` — 9 discriminants: `file | module | class | interface | function | method | import | export | type_alias`
- `CodeEdgeKind` — 5 discriminants: `contains | imports | extends | implements | calls`
- `CallConfidence` — 3 levels: `exact | heuristic | unresolved`
- `CodeSignature`, `Codebase`, `CodeNode`, `CodeEdge`, `CodebaseRoomLink` readonly interfaces
- `computeCodebaseId`, `computeNodeId`, `computeEdgeId` pure helpers (node:crypto sha256)

### Task 3 — src/infrastructure/code-graph.ts
`openCodeGraph({ path })` returns `ResultAsync<CodeGraphRepository, CodebaseError>`. On first open: runs SCHEMA_V1_DDL (4 tables + 7 indexes), sets `PRAGMA user_version = 1`. On subsequent opens: migration skipped if user_version == 1; throws if user_version > 1 (future schema). Tables: `codebases`, `code_nodes`, `code_edges`, `codebase_rooms` — all FK references use `ON DELETE CASCADE` so `deleteCodebase` cascades cleanly. `upsertNodes` and `upsertEdges` use `db.transaction` for batch atomicity. `searchNodes` composes a dynamic LIKE query (FTS5 deferred per CONTEXT.md). Runtime smoke test confirms `openCodeGraph` returns `isOk: true` and sqlite3 shows correct schema + `PRAGMA user_version = 1`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Corrected incompatible tree-sitter version pins**
- **Found during:** Task 1 npm install
- **Issue:** Plan specified `tree-sitter@0.25.0` + `tree-sitter-typescript@0.23.2`, but `tree-sitter-typescript@0.23.2` declares `peerOptional tree-sitter@"^0.21.0"` — incompatible with 0.25.x. Additionally, `tree-sitter-python@0.25.0` requires `tree-sitter@^0.25.0`, making the trio internally contradictory: no single tree-sitter version satisfies both grammar constraints.
- **Fix:** Used `tree-sitter@0.21.1` (the newest version satisfying `^0.21.0`), kept `tree-sitter-typescript@0.23.2` exactly as specified, downgraded `tree-sitter-python` to `0.23.4` (the newest version requiring `tree-sitter@^0.21.1` — same compatibility window). All three install cleanly with no peer conflicts.
- **Files modified:** package.json, package-lock.json
- **Commit:** 9284632

## Verification

- `npm run build` — passes (TypeScript no errors)
- `npm test` — 163 tests, 0 failures, 0 regressions
- `src/infrastructure/sources/codebase.ts` — NOT modified (scope boundary)
- `src/cli/commands/index-project.ts` — NOT modified (scope boundary)
- Runtime smoke: `openCodeGraph({ path: '/tmp/test-code-graph.db' }).isOk === true`
- sqlite3 schema: all 4 tables + 7 indexes present
- `PRAGMA user_version` returns `1`

## Self-Check: PASSED
- src/domain/codebase.ts — EXISTS
- src/infrastructure/code-graph.ts — EXISTS
- src/domain/errors.ts — contains CodebaseError
- Commits 9284632, 1eb5e2e, b50c430 — all verified in git log
