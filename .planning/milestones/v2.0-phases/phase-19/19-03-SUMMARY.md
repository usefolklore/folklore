---
phase: phase-19
plan: "03"
subsystem: codebase-cli-mcp
tags:
  - cli
  - mcp
  - code-graph
  - 15th-tool
  - subcommands
dependency_graph:
  requires:
    - src/infrastructure/code-graph.ts (Phase 19-01 — openCodeGraph, CodeGraphRepository)
    - src/application/codebase-indexer.ts (Phase 19-02 — indexCodebase, reindexCodebase)
    - src/infrastructure/tree-sitter-parser.ts (Phase 19-02 — makeParserRegistry)
    - src/domain/codebase.ts (Phase 19-01 — CodebaseId, CodeNodeKind)
    - src/domain/errors.ts (Phase 19-01 — CodebaseError in AppError)
  provides:
    - src/cli/commands/codebase.ts (8-subcommand CLI command group)
    - src/cli/runtime.ts (codeGraph path in RuntimePaths)
    - src/cli/index.ts (codebase command registered)
    - src/mcp/server.ts (code_graph_query as 15th MCP tool)
  affects:
    - Any consumer of RuntimePaths (now has codeGraph field)
    - MCP clients (now see 15 tools instead of 14)
tech_stack:
  added: []
  patterns:
    - Per-invocation on-demand DB open (mirrors peer.ts libp2p-per-invocation pattern)
    - try/finally repo.close() in every subcommand
    - parseArgs helper for --flag <value> / --bool flag parsing
    - VALID_KINDS Set for kind validation at CLI boundary
    - okJson / errText MCP response helpers (reused from existing tools)
key_files:
  created:
    - src/cli/commands/codebase.ts
  modified:
    - src/cli/runtime.ts
    - src/cli/index.ts
    - src/mcp/server.ts
    - tests/phase17.mcp-tool.test.ts
decisions:
  - "codebase command uses Record lookup (not switch) in index.ts dispatcher — matches existing peer/share/unshare pattern"
  - "code_graph_query MCP handler opens code-graph.db via runtime.paths.codeGraph (path resolved through RuntimePaths, not hardcoded)"
  - "tool count assertion in phase17 test updated from 14 to 15 — test was hardcoded to Phase 17 count, now reflects Phase 19 total"
metrics:
  duration_seconds: 595
  completed_date: "2026-04-12"
  tasks_completed: 2
  files_modified: 5
  tests_before: 163
  tests_after: 163
  test_regressions: 0
---

# Phase 19 Plan 03: CLI Command Group + 15th MCP Tool Summary

**One-liner:** `akashik codebase` 8-subcommand CLI group (index/list/show/reindex/attach/detach/search/remove) wired to openCodeGraph + indexCodebase/reindexCodebase, plus `code_graph_query` registered as the 15th MCP tool querying code-graph.db independently of the research graph.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | codeGraph path in runtime.ts + create codebase.ts | c9b30f5 | src/cli/runtime.ts, src/cli/commands/codebase.ts (new, 430 lines) |
| 2 | Register codebase in index.ts + code_graph_query MCP tool | b227bd0 | src/cli/index.ts, src/mcp/server.ts, tests/phase17.mcp-tool.test.ts |

## What Was Built

### Task 1 — src/cli/runtime.ts + src/cli/commands/codebase.ts

`RuntimePaths` gains a `readonly codeGraph: string` field; `runtimePaths()` populates it as `join(home, 'code-graph.db')`. `defaultRuntime()` is NOT modified — codebase commands open code-graph.db on demand per invocation, mirroring how `peer.ts` spins a libp2p node per call.

`src/cli/commands/codebase.ts` (430 lines) implements 8 subcommands via the identical peer.ts dispatch pattern — `export const codebase = async (args: string[]): Promise<number>` dispatches on `args[0]`. Every subcommand:
- Opens code-graph.db via `openCodeGraph({ path: runtimePaths().codeGraph })`
- Wraps its body in `try/finally { repo.close() }`
- Returns exit code 0 (success) or 1 (error)
- Supports `--json` where applicable for machine-readable output

Subcommands: `index <path>` (full parse via indexCodebase + makeParserRegistry), `list` (all codebases with rooms), `show <id>` (detail: languages, node count, rooms), `reindex <id>` (incremental hash-diff via reindexCodebase), `attach <id> --room <r>` / `detach <id> --room <r>` (M:N link management), `search <query>` (LIKE-wrapped name_pattern against searchNodes), `remove <id>` (cascade delete).

A local `parseArgs` helper handles `--flag <value>` / `--bool` parsing without any external library. `VALID_KINDS` Set validates `--kind` at the CLI boundary before hitting the DB.

### Task 2 — src/cli/index.ts + src/mcp/server.ts

`src/cli/index.ts` imports `codebase` from `./commands/codebase.js` and adds it to the `commands` Record — the existing key-lookup dispatcher routes `akashik codebase <sub>` with zero other changes.

`src/mcp/server.ts` registers `code_graph_query` as the 15th tool after `discover_loop`. Handler: opens code-graph.db via `runtime.paths.codeGraph`, calls `repo.searchNodes` with the caller-provided filters, closes the repo in finally, returns `okJson({ count, nodes })`. Input schema: `codebase_id?` (string), `kind?` (enum of 9 CodeNodeKind values), `name_pattern?` (substring, auto-wrapped in `%...%`), `limit` (1-200, default 20). Description explicitly states it is SEPARATE from `search`/`ask` — operates on code-graph.db, not research content.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale tool-count assertion in Phase 17 test**
- **Found during:** Task 2 npm test run
- **Issue:** `tests/phase17.mcp-tool.test.ts` C2 asserted `matches.length === 14` — the Phase 17 count. Adding the 15th tool caused the assertion to fail with `15 !== 14`.
- **Fix:** Updated the assertion to `15` and updated the description string to reference Phase 19.
- **Files modified:** tests/phase17.mcp-tool.test.ts
- **Commit:** b227bd0

## Verification

- `npx tsc --noEmit` — exit 0 (no errors)
- `npm test` — 163 tests, 0 failures, 0 regressions
- `src/infrastructure/sources/codebase.ts` — NOT modified (confirmed via `git show c9b30f5` and `git show b227bd0`)
- `src/cli/commands/index-project.ts` — NOT modified (confirmed same)
- `server.registerTool` count: 15 (verified via grep)
- 8 subcommand switch cases confirmed in codebase.ts
- `codeGraph` field present in both RuntimePaths interface and runtimePaths() return

## Self-Check: PASSED
- src/cli/commands/codebase.ts — EXISTS (430 lines)
- src/cli/runtime.ts — contains `readonly codeGraph: string` and `codeGraph: join(home, 'code-graph.db')`
- src/cli/index.ts — contains `import { codebase }` and `codebase,` in commands Record
- src/mcp/server.ts — contains `'code_graph_query'` registration and `runtime.paths.codeGraph`
- Commits c9b30f5 (Task 1) and b227bd0 (Task 2) — both verified in git log
