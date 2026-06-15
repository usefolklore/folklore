# Phase 19: Structured Codebase Indexing - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Parse codebases into a rich, structured code graph stored separately from the research room graph. Codebase is a first-class DDD aggregate root attachable to rooms via M:N join table. Powered by tree-sitter with TypeScript + JavaScript + Python grammars for Phase 19 (Rust/Go deferred to Phase 20). New `folklore codebase` command group mirrors `peer` / `share`. Existing `search`/`ask` tools unchanged; new `code_graph_query` MCP tool provides structured code access. Phase 19 scope is indexing + lexical search only — semantic code embeddings and full design pattern detection defer to Phase 20.

</domain>

<decisions>
## Implementation Decisions

### Storage Strategy
- **Separate database file: `~/.folklore/code-graph.db`** — distinct lifecycle from `vectors.db` (code graph can be wiped and rebuilt, embeddings cannot). Shares the same `better-sqlite3` driver (no new infra dep)
- **4 normalized tables**:
  - `codebases(id PRIMARY KEY, name, root_path, language_summary, indexed_at, node_count, root_sha)`
  - `code_nodes(id PRIMARY KEY, codebase_id FK, kind, name, file_path, start_line, start_col, end_line, end_col, parent_id, language, content_hash, signature_json, extra_json)`
  - `code_edges(id PRIMARY KEY, codebase_id FK, source_id FK, target_id FK, kind, confidence, extra_json)`
  - `codebase_rooms(codebase_id FK, room_id, attached_at, PRIMARY KEY(codebase_id, room_id))`
- **Schema versioning**: `PRAGMA user_version` — Phase 19 ships v1 with a migration function pattern mirrored from `peer-store.ts`. Future versions add columns via `ALTER TABLE`
- **No vector embeddings in Phase 19** — lexical search only (SQLite FTS5 on `code_nodes.name + signature` or simple LIKE). Semantic code embeddings land in Phase 20 once the schema stabilizes

### Language Support Scope
- **Phase 19 languages: TypeScript, JavaScript, Python** — covers folklore itself + the graphify Python sidecar + most modern projects
- **Rust and Go deferred to Phase 20** — grammars exist (`tree-sitter-rust@0.24.0`, tree-sitter-go via WASM) but add dep weight beyond the 3-dep Phase 19 budget
- **Lazy grammar loading** — `tree-sitter-python` only loads when parsing a `.py` file. Fast startup for TS-only projects, low memory
- **Extension-based file type detection**: `.ts/.tsx → typescript`, `.js/.jsx/.mjs/.cjs → javascript`, `.py → python`. Override via optional `.folklore/codebase.yaml` in the codebase root
- **Unsupported files skipped with count**: report shows `indexed: 342 files, skipped: 89 (extensions: md, json, lock, png, ...)`. Not an error

### Attachment Model + CLI Surface
- **CodebaseId derivation**: deterministic `sha256(abs_path).slice(0, 16)` — stable across re-indexes, short enough to paste in CLI. Also stores a human-readable `name` (defaults to basename of root path)
- **New CLI command group**: `folklore codebase <sub>` mirroring `peer` / `share` pattern
  - `codebase index <path>` — parse a codebase into code-graph.db
  - `codebase list [--json]` — show all indexed codebases
  - `codebase show <id>` — detail view (node count by kind, edge count, attached rooms)
  - `codebase reindex <id>` — incremental re-index (content-hash diff)
  - `codebase attach <id> --room <room-id>` — attach to a room
  - `codebase detach <id> --room <room-id>` — remove attachment (codebase itself NOT deleted)
  - `codebase search <query> [--codebase <id>] [--kind <kind>]` — lexical search
  - `codebase remove <id>` — delete the codebase entirely (removes nodes + edges + attachments)
- **M:N attachment via `codebase_rooms` join table** — one codebase → many rooms, one room → many codebases. Detach is non-destructive
- **Existing `search`/`ask` tools remain UNCHANGED** — they query the research graph only. Two new surfaces:
  - New MCP tool `code_graph_query(codebase_id?, kind?, name_pattern?, limit?)` — Claude calls this explicitly when the task is code-structural
  - Optional `--with-code` flag on `folklore ask --room <room>` — when set, the room query JOINs attached codebases and merges results with a `_source_type: 'research' | 'code'` annotation
- **Keep existing `src/infrastructure/sources/codebase.ts`** — the shallow indexer remains in place for backwards compat with the research room graph. Phase 19 adds a parallel deep indexer; the shallow one is NOT removed

### Parser Output Schema
- **9 node kinds**: `file`, `module`, `class`, `interface`, `function`, `method`, `import`, `export`, `type_alias`
- **Parameters as JSON inside the node, not separate nodes** — reduces graph explosion. `signature_json` field: `{ params: [{ name, type?, default? }], returns: string? }`
- **5 edge kinds**:
  - `contains` — file → class, class → method, module → function (structural hierarchy)
  - `imports` — file → file or file → module (import statements)
  - `extends` — class → class (inheritance)
  - `implements` — class → interface (TypeScript `implements`)
  - `calls` — function → function or method → method (best-effort call graph)
- **Call graph confidence**: every `calls` edge carries `confidence: 'exact' | 'heuristic' | 'unresolved'`
  - `exact` — callee resolved to a declared function in the same file or an explicit import
  - `heuristic` — name match across files but not proven (multiple candidates, dynamic dispatch)
  - `unresolved` — callee name captured but no matching declaration found
- **Trivial naming-based design pattern detection** — zero-dep heuristic, sets `extra_json.pattern`:
  - Class/function named `*Factory` → `pattern: 'Factory'`
  - Class named `*Singleton` or with `getInstance()` method → `pattern: 'Singleton'`
  - Class named `*Observer` or `*Subject` → `pattern: 'Observer'`
  - Class named `*Builder` → `pattern: 'Builder'`
  - Class named `*Adapter` → `pattern: 'Adapter'`
  - Covers ~30% of real uses at zero cost. Full AST-based pattern matching defers to Phase 20 with `@ast-grep/napi`

### Claude's Discretion
- Exact SQLite FTS5 vs LIKE query strategy for `codebase search` (FTS5 is faster on 10K+ nodes but adds index build time)
- Whether to expose `codebase detach --all-rooms` shortcut
- Edge id generation strategy (deterministic hash of source+target+kind vs. auto-increment)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/infrastructure/graph-repository.ts` — `better-sqlite3` setup pattern; Phase 19 opens a second DB handle on `code-graph.db` with the same driver
- `src/infrastructure/peer-store.ts` — cross-process `.lock` file pattern, version migration pattern — reused for code-graph.db writes where concurrent re-indexing is possible
- `src/infrastructure/vector-index.ts` — example of `openSqliteVectorIndex` lazy-open ResultAsync pattern; Phase 19 mirrors this as `openCodeGraph`
- `src/cli/commands/peer.ts` and `src/cli/commands/share.ts` — CLI subcommand pattern for the new `folklore codebase` command group
- `src/infrastructure/rooms-config.ts` — `RoomId` type that the `codebase_rooms` join table references (no FK constraint — rooms.json is JSON not SQLite, so validation happens at attach time)
- `src/domain/errors.ts` — `AppError` union pattern; Phase 19 extends with `CodebaseError` (8 variants)

### Established Patterns
- Functional DDD, neverthrow, no classes in domain/application
- Error union per bounded context
- `ResultAsync.fromPromise` wrapping sqlite calls
- Versioned JSON files via `version: 1` field (peers.json, shared-rooms.json); SQLite version via `PRAGMA user_version`
- CLI subcommand pattern: `(args: string[]) => Promise<number>` with switch on `args[0]`
- Integration tests via `node:test` with tmp directories

### Integration Points
- New files:
  - `src/domain/codebase.ts` — `CodebaseId`, `CodebaseMeta`, `CodeNode`, `CodeEdge`, `CodeNodeKind`, `CodeEdgeKind`, `CallConfidence` types
  - `src/domain/errors.ts` — extend with `CodebaseError` (parse failed, grammar missing, db error, codebase not found, attach failed, etc.)
  - `src/infrastructure/code-graph.ts` — SQLite open + schema migration + CRUD operations
  - `src/infrastructure/tree-sitter-parser.ts` — tree-sitter Parser wrapping, per-language grammar loading, AST → CodeNode conversion
  - `src/application/codebase-indexer.ts` — `indexCodebase`, `reindexCodebase` — walks file tree, dispatches to parser, writes to code-graph.db
  - `src/cli/commands/codebase.ts` — `codebase` command with all subcommands
  - `tests/phase19.codebase-indexing.test.ts` — test suite
- Extended files:
  - `src/cli/index.ts` — register `codebase` command
  - `src/mcp/server.ts` — register `code_graph_query` MCP tool (14 → 15 total tools)
  - `src/cli/commands/ask.ts` — optional `--with-code` flag
- Existing files NOT touched:
  - `src/infrastructure/sources/codebase.ts` — shallow adapter remains for backwards compat with the research room graph
  - `src/cli/commands/index-project.ts` — existing `folklore index` stays; Phase 19 is a NEW command, not a replacement

</code_context>

<specifics>
## Specific Ideas

- **Dep budget: 3 new deps** — `tree-sitter@0.25.0`, `tree-sitter-typescript@0.23.2`, `tree-sitter-python@0.25.0`. `tree-sitter-rust` and `tree-sitter-go` deferred to Phase 20
- Tree-sitter is native-compiled (prebuildify prebuilts available for darwin/linux/win × arm64/x64). `better-sqlite3` already requires native compilation, so this is no incremental risk
- File walking respects `.gitignore` + an optional `.folklore/codebase-ignore` for project-specific excludes
- Parallel parsing via Node `worker_threads` is NOT in Phase 19 — single-threaded is fast enough for 10K files (tree-sitter parses ~1ms per file)
- Content hash = `sha256(file_content)` stored per node; reindex skips files where all nodes' content_hash matches current content
- No `design pattern` ML detection, no `semantic code search`, no `call graph query language` — all deferred to Phase 20
- MCP tool count: 14 → 15 with `code_graph_query`. Update README stats in Phase 19 summary

</specifics>

<deferred>
## Deferred Ideas (Phase 20+)

- **Semantic code search** — embed code node signatures into `vectors.db` and search via sqlite-vec. Requires decisions about what to embed (name only? name+signature? full body?)
- **Full AST-based design pattern detection** via `@ast-grep/napi` — structural pattern matching for all 23 GoF patterns
- **Rust + Go language support** — `tree-sitter-rust@0.24.0` and tree-sitter-go (WASM) — deferred to Phase 20 to fit Phase 19's 3-dep budget
- **Parallel parsing via worker_threads** — optimization for 10K+ file monorepos; defer until someone actually hits the bottleneck
- **Call graph query language** — "show me all functions that call `foo` transitively within 3 hops" — needs a recursive CTE on `code_edges.calls` plus a query syntax
- **Multi-version indexing** — keep a history of indexes per commit SHA, diff across versions (Sourcegraph-style)
- **Cross-codebase linking** — if codebase A imports from codebase B, create cross-codebase `imports` edges
- **LSP integration** — piggyback on user's running language servers for full type info (would give perfect call graph resolution but adds huge complexity)

</deferred>
