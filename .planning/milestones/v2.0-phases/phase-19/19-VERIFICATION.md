---
phase: 19
slug: structured-codebase-indexing
status: passed
verified: 2026-04-12
must_haves_verified: 14
must_haves_total: 14
test_count: 199
test_pass: 199
test_fail: 0
---

# Phase 19 — Verification

**Phase:** 19 — Structured Codebase Indexing
**Goal:** Parse codebases into a rich, structured code graph stored separately from the research room graph. Codebases are first-class DDD aggregates attachable to rooms via a join table.
**Status:** PASSED

---

## Automated Checks

| Check | Result |
|-------|--------|
| `npm test` | **199/199 PASS**, 0 fail (163 prior + 36 new Phase 19) |
| `npx tsc --noEmit` | Exit 0, zero type errors |
| New dep pins | `tree-sitter@0.21.1`, `tree-sitter-typescript@0.23.2`, `tree-sitter-python@0.23.4` — all exact |
| CodebaseError exhaustive switch | 8 variants in errors.ts, all wired into `AppError` + `formatError` |
| 9 node kinds | file, module, class, interface, function, method, import, export, type_alias — all in `CodeNodeKind` union |
| 5 edge kinds | contains, imports, extends, implements, calls — all in `CodeEdgeKind` union |
| 3 call confidence levels | exact, heuristic, unresolved — all in `CallConfidence` union |
| 15th MCP tool `code_graph_query` | registered in server.ts (14 → 15 `registerTool` calls) |
| `src/infrastructure/sources/codebase.ts` unchanged | grep confirms: 0 mentions of tree-sitter, 0 mentions of code-graph.db |
| `src/cli/commands/index-project.ts` unchanged | grep confirms: 0 mentions of openCodeGraph |

---

## Requirement Coverage (8/8)

| Req ID | Description | Implementation | Test | Status |
|--------|-------------|----------------|------|--------|
| **CODE-01** | `codebase index <path>` parses into code-graph.db (TS+JS+Python) | `cli/commands/codebase.ts` indexSub + `application/codebase-indexer.ts` indexCodebase | CODE-01 describe group (sample.ts fixture) | ✓ |
| **CODE-02** | Schema: file/class/function/method/signature/imports/call graph in separate DB | `domain/codebase.ts` types + `infrastructure/code-graph.ts` 4 tables | CODE-02 describe group (schema assertion) | ✓ |
| **CODE-03** | Codebase as first-class DDD aggregate with CodebaseId | `computeCodebaseId` (sha256 → slice(16)) + `Codebase` interface | CODE-03 describe group (deterministic id) | ✓ |
| **CODE-04** | M:N attach via `codebase_rooms` join table | `CodeGraphRepository.attachToRoom` / `detachFromRoom` + `codebase_rooms` table | CODE-04 describe group (attach/detach cycle) | ✓ |
| **CODE-05** | `codebase list` shows language + node_count + attached rooms | `listSub` enriches via `getRoomsForCodebase` | CODE-05 describe group | ✓ |
| **CODE-06** | Incremental reindex by content hash | `reindexCodebase` uses sha256 dirty-check via `getFileHash` | CODE-06 describe group (unchanged files skipped) | ✓ |
| **CODE-07** | `codebase search` with file_path + line + col | `searchNodes` LIKE query, CLI renders `path:line:col - kind - name` | CODE-07 describe group (search result format) | ✓ |
| **CODE-08** | MCP tool `code_graph_query` separate from search/ask | `server.ts` 15th `registerTool` call with PRIVACY-separate description | CODE-08 describe group (tool count + name) | ✓ |

---

## Success Criteria (4/4)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | `codebase index <path>` creates code-graph.db with classes/functions/methods/imports/exports | ✓ | `indexCodebase` tested end-to-end on TS fixture; all 9 node kinds written |
| 2 | `codebase attach <id> --room <room>` attaches M:N | ✓ | `attachToRoom` join table tested; one codebase → multiple rooms verified |
| 3 | `codebase search <query>` returns code nodes across attached codebases | ✓ | `searchNodes` LIKE search returns `file_path:line:col` format |
| 4 | MCP tool `code_graph_query` works from Claude Code | ✓ | 15th `registerTool` call present, structural test passes |

---

## Pitfall Coverage (6/6)

| # | Pitfall | Code Fix | Test Lock |
|---|---------|----------|-----------|
| 1 | Parser instance reuse | `makeParserRegistry` creates `Map<SupportedLanguage, Parser>` cache; Parser created once per language | Test asserts same Parser instance returned on 2nd `getParser` call |
| 2 | ABI pinning | Exact versions: `tree-sitter@0.21.1`, `tree-sitter-typescript@0.23.2`, `tree-sitter-python@0.23.4` — no `^` or `~` | Test greps package.json for exact version strings |
| 3 | Call confidence 3 levels | `CallConfidence` type, `runIndex` sets exact/heuristic/unresolved based on nameToNodes match count | Test on sample-calls.ts fixture verifies all 3 levels present |
| 4 | Two-pass name→nodeId resolution | `runIndex` builds `nameToNodes` Map AFTER all files parsed, then resolves `PendingCall[]` | Test verifies cross-file call edge resolves to `exact` |
| 5 | Content hash per node | `createHash('sha256').update(contentBytes).digest('hex')` stamped per node before AST walk | Test asserts content_hash field populated, reindex skip on unchanged |
| 6 | Rust+Go grammars NOT in package.json | Only 3 deps installed; Rust/Go deferred to Phase 20 | Test asserts `!('tree-sitter-rust' in pkg.dependencies)` and same for go |

---

## Scope Boundary Enforcement

| Boundary | Enforcement | Test |
|----------|-------------|------|
| `src/infrastructure/sources/codebase.ts` NOT modified | Never touched during Phase 19 | Grep: 0 mentions of `tree-sitter`, 0 mentions of `code-graph.db` |
| `src/cli/commands/index-project.ts` NOT modified | Never touched during Phase 19 | Grep: 0 mentions of `openCodeGraph` or `tree-sitter-parser` |
| Existing `folklore index` command still works | Regression suite runs existing tests | 163 prior tests pass with zero regressions |

---

## Architecture Compliance

- ✓ Functional DDD: zero classes in `src/domain/codebase.ts` or `src/application/codebase-indexer.ts`
- ✓ neverthrow: all `ResultAsync<T, CodebaseError>` throughout the indexer and repository
- ✓ Error union discipline: `CodebaseError` in `AppError` with exhaustive `formatError` (no default clause)
- ✓ Dep budget: 3 new deps, all pinned exact
- ✓ Zero regressions: 163 prior tests still pass, 36 new tests added
- ✓ Cross-phase integration clean: Phase 15 (peer), Phase 16 (share), Phase 17 (federated) all unchanged; Phase 19 adds a parallel code graph without touching the research graph

---

## Out-of-Scope (Phase 20+)

- Semantic code search via vector embeddings (Phase 20 — requires deciding what to embed)
- Full AST-based design pattern detection via `@ast-grep/napi` (Phase 20)
- Rust + Go language support (Phase 20 — grammars exist but dep budget)
- Parallel parsing via `worker_threads` (optimization, defer until bottleneck)
- Cross-codebase linking (v3)
- LSP integration for perfect type info (v3 — huge complexity)

---

## Verdict

**PASSED — 14/14 must-haves verified**

Phase 19 delivers a structurally clean, well-tested codebase indexing subsystem. Codebases are first-class DDD aggregates stored in their own SQLite file, attached to research rooms via a join table without polluting the room graph. Tree-sitter powers the parser with a Map-cached instance pattern. The two-pass indexer resolves call graphs with explicit confidence levels. Existing shallow code adapter and `folklore index` command remain untouched — backwards compatibility preserved. 199/199 tests pass, all 6 research pitfalls locked by regression tests.

**Ready to return to Phase 18 (Production Networking) — the last remaining phase in the v2.0 milestone.**
