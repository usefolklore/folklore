---
phase: phase-19
plan: "02"
subsystem: codebase-indexing-parser
tags:
  - tree-sitter
  - cjs-interop
  - parser-registry
  - call-graph
  - two-pass
  - incremental-reindex
dependency_graph:
  requires:
    - src/domain/codebase.ts (Phase 19-01)
    - src/infrastructure/code-graph.ts (Phase 19-01)
    - src/domain/errors.ts with CodebaseError (Phase 19-01)
  provides:
    - src/infrastructure/tree-sitter-parser.ts (makeParserRegistry, parseFile, detectLanguage, PendingCall, ParseOutput)
    - src/application/codebase-indexer.ts (indexCodebase, reindexCodebase, IndexReport)
  affects:
    - any future CLI command that calls indexCodebase / reindexCodebase
    - src/cli/commands/codebase.ts (Phase 19-03 — will import indexCodebase)
tech_stack:
  added: []
  patterns:
    - createRequire(import.meta.url) CJS interop for ESM project consuming CJS tree-sitter
    - Map<SupportedLanguage, Parser> parser registry — one instance per language, reused across all files
    - Two-pass call graph resolution — pass 1 emits PendingCall[], pass 2 resolves with nameToNodes map
    - sha256(fileBytes) content hash as dirty-check key (mtime unreliable across git ops)
    - ResultAsync.fromPromise wrapping async indexer body (mirrors openCodeGraph pattern)
key_files:
  created:
    - src/infrastructure/tree-sitter-parser.ts
    - src/application/codebase-indexer.ts
  modified: []
decisions:
  - "createRequire(import.meta.url) is the canonical ESM→CJS interop for tree-sitter 0.21.x — dynamic import() does not work because tree-sitter's CJS module.exports is not compatible with ESM default import"
  - "TypeScript grammar reused for JavaScript files (.js/.jsx/.mjs/.cjs) — TS grammar is a proper superset, handles all valid JS"
  - "Unresolved calls still emit a CodeEdge row with a synthetic external target id — allows querying call patterns even for stdlib/npm callees"
  - "Parse errors on individual files bubble up as hard failures (not soft skips) — a malformed file is a sign of data corruption, not a normal skip condition"
  - "Unused CodeNodeKind type import auto-removed (Rule 1 — TS6133 compiler error)"
metrics:
  duration_seconds: 480
  completed_date: "2026-04-12"
  tasks_completed: 2
  files_modified: 2
  tests_before: 163
  tests_after: 163
  test_regressions: 0
---

# Phase 19 Plan 02: Tree-Sitter Parser + Two-Pass Indexer Summary

**One-liner:** ESM/CJS-safe tree-sitter parser registry with per-language Parser reuse, AST-to-CodeNode walker with trivial pattern detection, and a two-pass codebase indexer delivering exact/heuristic/unresolved call graph edges with incremental reindex via sha256 dirty-check.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | tree-sitter-parser.ts — parser registry + AST walker | a4bfdff | src/infrastructure/tree-sitter-parser.ts (new, 384 lines) |
| 2 | codebase-indexer.ts — two-pass indexer with incremental reindex | 012733f | src/application/codebase-indexer.ts (new, 350 lines) |

## What Was Built

### Task 1 — src/infrastructure/tree-sitter-parser.ts

`makeParserRegistry()` creates a `Map<SupportedLanguage, TsParser>` and returns a `ParserRegistry` whose `getParser(lang)` loads the grammar on first call and reuses the same `TsParser` instance for all subsequent files in that language. Grammar loading uses `createRequire(import.meta.url)` — the canonical workaround for consuming a CommonJS package (`tree-sitter@0.21.1`) from an ESM project. `tree-sitter-typescript.typescript` grammar is shared for both TypeScript and JavaScript (it is a strict superset).

`parseFile(registry, absFilePath, rootPath, codebaseId, contentBytes)` returns `Result<ParseOutput, CodebaseError>` with no throws. Content hash is computed once via `sha256(contentBytes)` and stamped on every emitted node. The AST walker emits:
- 1 `file` node per file (always)
- `class / interface / function / method / type_alias / import / export` nodes per the TS_KIND_MAP / PY_KIND_MAP
- `contains` edges (structural hierarchy) and `extends / implements` edges (heritage clauses)
- `PendingCall[]` — call sites deferred to indexer pass 2

Trivial design pattern detection on class nodes via `/(Factory|Singleton|Observer|Subject|Builder|Adapter)$/` regex plus a `getInstance` method scan for Singleton. Matched classes get `extra_json: '{"pattern":"..."}'`.

### Task 2 — src/application/codebase-indexer.ts

`indexCodebase(deps)(opts)` validates that `absPath` is a directory, walks the file tree (respecting `DEFAULT_EXCLUDE`), and runs `runIndex`. `reindexCodebase(deps)(codebaseId)` looks up the Codebase record in code-graph.db, walks the same root, and passes `reindexMode: true` to `runIndex`.

`runIndex` implements the explicit two-pass strategy:

**Pass 1** — for each file: compute `sha256`, optionally compare against `repo.getFileHash` (reindex only), call `parseFile`, accumulate `allNodes + allEdges + allCalls`.

**Pass 2** — build `nameToNodes = Map<string, CodeNode[]>` from all `function` and `method` nodes across the entire scan, then for each `PendingCall`:
- 0 candidates → `unresolved` (synthetic external target node id, edge still emitted)
- 1 candidate → `exact`
- N candidates → `heuristic` (prefer same-file match)

All nodes and edges are flushed to code-graph.db via `repo.upsertCodebase → repo.upsertNodes → repo.upsertEdges` in that order. Returns `IndexReport` with `indexed_files`, `skipped_files`, `unchanged_files`, `node_count`, `edge_count`, `by_kind`, `by_language`, `call_confidence`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused `CodeNodeKind` type import**
- **Found during:** `npm run build` after Task 2
- **Issue:** `CodeNodeKind` was imported in `codebase-indexer.ts` but not referenced (TS6133 error)
- **Fix:** Removed the unused import from the destructured import list
- **Files modified:** src/application/codebase-indexer.ts
- **Commit:** 012733f (removed before commit — single commit covers the fix)

## Verification

- `npm run build` — passes (TypeScript no errors)
- `npm test` — 163 tests, 0 failures, 0 regressions
- `src/infrastructure/sources/codebase.ts` — NOT modified (scope boundary)
- All plan verification greps passed: createRequire, grammar loaders, makeParserRegistry, parseFile, cache.set, PATTERN_NAME_REGEX, PendingCall, contentHash, indexCodebase, reindexCodebase, PASS 2, getFileHash, call_confidence, exact, heuristic, unresolved, nameToNodes, DEFAULT_EXCLUDE

## Self-Check: PASSED
- src/infrastructure/tree-sitter-parser.ts — EXISTS (384 lines)
- src/application/codebase-indexer.ts — EXISTS (350 lines)
- Commit a4bfdff (Task 1) — verified in git log
- Commit 012733f (Task 2) — verified in git log
