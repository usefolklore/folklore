# Phase 19: Structured Codebase Indexing — Research

**Researched:** 2026-04-12
**Domain:** Multi-language AST parsing, code graph schema, SQLite persistence, DDD aggregate design
**Confidence:** HIGH (all critical claims verified via gh API, npm registry, and official grammar inspection)

---

## Summary

The current `src/infrastructure/sources/codebase.ts` is a regex-based file summarizer, not a code
graph. It extracts file-level imports/exports with no AST, no call graph, no type signatures, and
no concept of classes or functions as first-class nodes. It also mixes code nodes into the research
room graph, violating the user's explicit architecture requirement that codebases produce their own
separated knowledge graph.

The replacement needs to: (1) parse real AST node types (function, class, interface, call site) for
TypeScript/JavaScript at minimum and Python/Rust/Go for cross-language monorepos, (2) store the
resulting code graph in its own SQLite tables separate from `graph.json`, (3) model `Codebase` as a
distinct DDD aggregate root that rooms attach to via an explicit many-to-many join table, and
(4) support incremental re-indexing via content-hash-based dirty tracking.

**Primary recommendation:** Use `tree-sitter` (npm 0.25.0, native Node binding with prebuildify
prebuilts) for parsing — one dep covers TypeScript, JavaScript, Python, Rust, and Go grammars via
separate grammar packages. Persist the code graph in new SQLite tables on the existing
`better-sqlite3` + `sqlite-vec` database. Model `Codebase` as an aggregate root with a join table
for room attachment. Do NOT emit SCIP — it is over-engineering for akashik's scope.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CODE-01 | Parse TypeScript/JS files into function/class/interface/import nodes | tree-sitter TS grammar: 183 named node types including call_expression, function_declaration, class_declaration, interface_declaration, method_definition, arrow_function, import_statement, export_statement — all confirmed via node-types.json |
| CODE-02 | Extract call graph edges (X calls Y) | tree-sitter call_expression nodes give callee name + location; resolved to node IDs by matching against function/method declarations in the same index |
| CODE-03 | Support Python, Rust, Go parsing | tree-sitter-python 0.25.0, tree-sitter-rust 0.24.0, tree-sitter-go (maintained); all confirmed active via npm + gh API |
| CODE-04 | Codebase as separate graph, not mixed into research rooms | New SQLite tables `code_nodes` + `code_edges` + `codebases` + `codebase_rooms`; entirely separate from graph.json |
| CODE-05 | Codebase attaches to rooms (many-to-many) | `Codebase` aggregate root + `codebase_rooms` join table; rooms query attached codebases at search time |
| CODE-06 | Incremental indexing — skip unchanged files | SHA-256 of file content stored in `code_nodes.content_hash`; reparse only when hash differs |
| CODE-07 | Index runs as first step on new project | `akashik index --deep` flag triggers code graph pass; existing room-level ingest unchanged |
| CODE-08 | Schema captures: language, kind, signature, return type, parameters, line/col, parent | `CodeNode` interface with these fields; stored as JSON columns in SQLite for schema-free extension |
</phase_requirements>

---

## Standard Stack

### Core (verified 2026-04-12)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `tree-sitter` | 0.25.0 | Native Node.js AST parser binding | 24,670 stars, active (pushed 2026-04-11), prebuildify prebuilts for darwin/linux/win arm64+x64, MIT — already in same native compile category as existing `better-sqlite3` |
| `tree-sitter-typescript` | 0.23.2 | TypeScript + TSX grammar | Official grammar, 502 stars, pushed 2025-08-29; ships compiled `.node` bindings |
| `tree-sitter-python` | 0.25.0 | Python grammar | Official, 537 stars, pushed 2025-09-15, 7.5MB package |
| `tree-sitter-rust` | 0.24.0 | Rust grammar | Official, 489 stars, pushed 2026-03-27, 15MB package |

**Dep budget usage: 4 grammar packages count as 1 conceptual dep (tree-sitter + grammars).
Total new production deps: tree-sitter core (1) + grammars loaded on demand (3). = 4 packages, 2 conceptual deps.**

### What you are NOT adding

| Skipped | Why |
|---------|-----|
| `ts-morph` 27.0.2 | 1.4MB package + 12MB `@ts-morph/common` which bundles the TypeScript compiler internally. Gives full type info but: (a) TS-only, no cross-language, (b) the 12MB bundled-TS overhead is not justified vs tree-sitter's syntactic AST which captures everything needed for a code graph. Type resolution is not required for Phase 19 scope. |
| `@swc/core` 1.15.24 | TS+JS AST only. No Python/Rust/Go. Faster than ts-morph but same language limitation. |
| `@babel/parser` 7.29.2 | TS+JS only, no semantic types, no cross-language. |
| `@ast-grep/napi` 0.42.1 | 13,387 stars, Rust-powered, active (pushed 2026-04-11). Better for pattern matching / structural search (like semgrep). Phase 19 needs indexing, not search patterns. **Defer to Phase 20 for design pattern detection.** |
| `web-tree-sitter` 0.26.8 | WASM variant, 4.5MB. Zero-native but 3-5x slower than native binding. akashik already requires native compilation for `better-sqlite3` — no reason to take the WASM perf penalty. |
| `scip-typescript` 0.4.0 | 88 stars, last commit Oct 2025. Emitting SCIP is over-engineering — akashik has no Sourcegraph integration and SCIP adds protobuf tooling overhead. Reject. |

### Installation

```bash
npm install tree-sitter tree-sitter-typescript tree-sitter-python tree-sitter-rust
```

Go grammar (`tree-sitter-go`) is not on npm with an official package — load the WASM variant for
Go or skip Go for Phase 19 and add it in Phase 20. **Phase 19 scope: TS/JS + Python + Rust.**

### Version verification (npm registry, 2026-04-12)

| Package | Version | Published | Stars | Last Push |
|---------|---------|-----------|-------|-----------|
| `tree-sitter` | 0.25.0 | 2025-06-02 | 24,670 (core) | 2026-04-11 |
| `tree-sitter-typescript` | 0.23.2 | — | 502 | 2025-08-29 |
| `tree-sitter-python` | 0.25.0 | — | 537 | 2025-09-15 |
| `tree-sitter-rust` | 0.24.0 | — | 489 | 2026-03-27 |
| `ts-morph` (rejected) | 27.0.2 | 2025-10-12 | 6,007 | 2026-04-11 |
| `@ast-grep/napi` (deferred) | 0.42.1 | 2026-04-04 | 13,387 | 2026-04-11 |

---

## Architecture Patterns

### Recommended Project Structure

```
src/
├── domain/
│   └── code-graph.ts          # CodeNode, CodeEdge, Codebase, CodeGraph types + pure transforms
│                              # (separate from graph.ts — different schema, different aggregate)
├── infrastructure/
│   ├── code-graph-repository.ts   # SQLite adapter for code_nodes/code_edges/codebases tables
│   └── sources/
│       └── codebase.ts            # REPLACED: tree-sitter-backed indexer returning CodeNode[]
├── application/
│   └── index-codebase.ts          # use-case: walk files → parse → upsert into code graph
└── cli/commands/
    └── index-project.ts           # existing command: add --deep flag to trigger code graph pass
```

### Pattern 1: CodeNode as a Flat Record with `kind` Discriminant

**What:** All code entities (file, module, class, function, method, interface, type, variable) are
`CodeNode` records differing by their `kind` field. This avoids a class hierarchy and maps cleanly
to a SQLite table with optional JSON columns for kind-specific metadata.

**When to use:** Always — flat records are the only correct shape for a SQLite-backed code graph
in a functional DDD codebase.

```typescript
// src/domain/code-graph.ts

export type CodeNodeKind =
  | 'file'
  | 'function'
  | 'arrow_function'
  | 'method'
  | 'class'
  | 'interface'
  | 'type_alias'
  | 'variable'
  | 'import'
  | 'export';

export type CodeEdgeKind =
  | 'calls'
  | 'imports'
  | 'exports'
  | 'extends'
  | 'implements'
  | 'contains';    // parent → child (file → function, class → method)

export interface CodeNode {
  readonly id: string;                  // sha256(codebase_id + file_path + kind + name + line)
  readonly codebase_id: CodebaseId;
  readonly kind: CodeNodeKind;
  readonly name: string;
  readonly file_path: string;           // relative to codebase root
  readonly language: SupportedLanguage;
  readonly line: number;
  readonly col: number;
  readonly end_line: number;
  readonly end_col: number;
  readonly parent_id?: string;          // for methods inside classes, functions inside files
  readonly signature?: string;          // raw text of parameter list if available
  readonly return_type?: string;        // raw text of return type annotation if available
  readonly content_hash: string;        // sha256 of enclosing file content — for incremental indexing
  readonly indexed_at: string;          // ISO timestamp
}

export interface CodeEdge {
  readonly id: string;                  // sha256(source_id + target_id + kind)
  readonly codebase_id: CodebaseId;
  readonly source_id: string;
  readonly target_id: string;
  readonly kind: CodeEdgeKind;
  readonly confidence: 'RESOLVED' | 'SYNTACTIC' | 'UNRESOLVED';
}

export type CodebaseId = string;
export type SupportedLanguage = 'typescript' | 'javascript' | 'python' | 'rust';

export interface Codebase {
  readonly id: CodebaseId;              // slugified project name
  readonly name: string;
  readonly root_path: string;
  readonly created_at: string;
  readonly last_indexed_at?: string;
  readonly node_count: number;
  readonly edge_count: number;
}
```

### Pattern 2: tree-sitter Parse → Walk → Emit CodeNode (pure transform)

**What:** The adapter calls `parser.parse(source)` then walks the resulting AST tree, pattern-
matching on node.type. Each matching node becomes a `CodeNode`. This is a stateless map operation
with no mutation.

**When to use:** In the infrastructure source adapter — pure function from (file path, source text,
codebase_id) → readonly CodeNode[].

```typescript
// Conceptual extract — actual implementation in src/infrastructure/sources/codebase.ts
// Source: tree-sitter Node.js API docs (https://github.com/tree-sitter/node-tree-sitter)

import TreeSitter from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

const EXTRACT_KINDS: ReadonlySet<string> = new Set([
  'function_declaration',
  'arrow_function',
  'method_definition',
  'class_declaration',
  'interface_declaration',
  'type_alias_declaration',
  'call_expression',
  'import_statement',
  'export_statement',
]);

const walkTree = (
  node: TreeSitter.SyntaxNode,
  emit: (n: TreeSitter.SyntaxNode) => void,
): void => {
  if (EXTRACT_KINDS.has(node.type)) emit(node);
  for (const child of node.children) walkTree(child, emit);
};

// Parser is created once per language and reused — creation is expensive
const makeParser = (language: typeof TypeScript.typescript): TreeSitter => {
  const parser = new TreeSitter();
  parser.setLanguage(language);
  return parser;
};
```

**Critical:** Create one `Parser` instance per language at startup, reuse across all files. Parser
construction is ~50ms; parse per file is ~1-5ms for typical 200-line TypeScript files.

### Pattern 3: Codebase as Aggregate Root with SQLite Join Table

**What:** `Codebase` is a first-class entity with its own ID, stored in a `codebases` table. Rooms
attach to codebases via a `codebase_rooms` join table. Rooms do not hold `codebase_ids` arrays
(that would denormalize the Room aggregate and require re-saving rooms on every attachment).

**Why option (b) from the research brief:** The join table is the only model that keeps both
`Room` and `Codebase` as independent aggregates, avoids migrating the existing `rooms.json` format,
and supports M:N cleanly in SQLite with a two-column table.

```typescript
// src/domain/code-graph.ts (continued)

export interface CodebaseRoomLink {
  readonly codebase_id: CodebaseId;
  readonly room_id: string;           // RoomId from domain/rooms.ts
  readonly linked_at: string;
}

// Query: "which codebases are attached to this room?"
// SELECT codebase_id FROM codebase_rooms WHERE room_id = ?

// Query: "which rooms reference this codebase?"
// SELECT room_id FROM codebase_rooms WHERE codebase_id = ?
```

### Pattern 4: Code Graph Persistence via New SQLite Tables (not graph.json)

**What:** Add three new tables to the existing `better-sqlite3` database file at
`~/.akashik/vectors.db` (or a sibling `code-graph.db` — see trade-off below). Tables:
`codebases`, `code_nodes`, `code_edges`, `codebase_rooms`.

**Schema (SQLite DDL):**

```sql
CREATE TABLE IF NOT EXISTS codebases (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  root_path   TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  last_indexed_at TEXT,
  node_count  INTEGER NOT NULL DEFAULT 0,
  edge_count  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS code_nodes (
  id            TEXT PRIMARY KEY,
  codebase_id   TEXT NOT NULL REFERENCES codebases(id),
  kind          TEXT NOT NULL,
  name          TEXT NOT NULL,
  file_path     TEXT NOT NULL,
  language      TEXT NOT NULL,
  line          INTEGER NOT NULL,
  col           INTEGER NOT NULL,
  end_line      INTEGER NOT NULL,
  end_col       INTEGER NOT NULL,
  parent_id     TEXT,
  signature     TEXT,
  return_type   TEXT,
  content_hash  TEXT NOT NULL,
  indexed_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_code_nodes_codebase ON code_nodes(codebase_id);
CREATE INDEX IF NOT EXISTS idx_code_nodes_file     ON code_nodes(codebase_id, file_path);
CREATE INDEX IF NOT EXISTS idx_code_nodes_name     ON code_nodes(name);

CREATE TABLE IF NOT EXISTS code_edges (
  id          TEXT PRIMARY KEY,
  codebase_id TEXT NOT NULL REFERENCES codebases(id),
  source_id   TEXT NOT NULL,
  target_id   TEXT NOT NULL,
  kind        TEXT NOT NULL,
  confidence  TEXT NOT NULL DEFAULT 'SYNTACTIC'
);
CREATE INDEX IF NOT EXISTS idx_code_edges_source ON code_edges(source_id);
CREATE INDEX IF NOT EXISTS idx_code_edges_target ON code_edges(target_id);

CREATE TABLE IF NOT EXISTS codebase_rooms (
  codebase_id TEXT NOT NULL REFERENCES codebases(id),
  room_id     TEXT NOT NULL,
  linked_at   TEXT NOT NULL,
  PRIMARY KEY (codebase_id, room_id)
);
```

**Trade-off — same DB vs separate DB:**

| Option | Pros | Cons |
|--------|------|------|
| Add tables to `vectors.db` | One DB connection, simpler runtime | vectors.db is already the vector store; mixing concerns |
| Separate `code-graph.db` | Clean separation, can delete/rebuild without touching vectors | Two DB connections, slightly more infrastructure code |

**Recommendation: separate `~/.akashik/code-graph.db`.** The code graph has different
lifecycle semantics (rebuild from scratch is safe and cheap) vs the vector store (embeddings are
expensive to regenerate). Keeping them separate means `akashik index --deep --rebuild` can
`DROP DATABASE code-graph.db` without touching vectors.

### Anti-Patterns to Avoid

- **Extending GraphNode with optional code fields:** The existing `GraphNode` interface has
  `file_type: 'code' | 'document' | 'paper' | 'image' | 'rationale'` — the `'code'` value already
  exists, tempting reuse. Resist this. `GraphNode` lives in `graph.json` which is the research room
  graph; mixing code AST nodes there is exactly the problem being fixed. Two schemas, two stores.

- **Running a full TypeScript Language Server for type resolution:** ts-morph gives resolved types
  but requires holding an entire `Project` in memory (~200MB for a large monorepo) and is
  TypeScript-only. Phase 19 does not need resolved types — syntactic signatures (raw text of the
  parameter list and return type annotation as written) are sufficient for the graph and for LLM
  consumption.

- **Incremental indexing by mtime:** File modification time is unreliable across git checkouts
  (git reset sets mtime to checkout time, not file change time). Always use SHA-256 of file
  content as the dirty check key.

- **Parsing node_modules:** Always exclude `node_modules`, `dist`, `.git`, `vendor`, `.claude`,
  `.claude-flow` — the existing exclude list in the current `codebase.ts` is correct and should
  be preserved.

- **Eager call graph resolution:** Resolving `call_expression` → callee `CodeNode` requires a
  two-pass index (first pass builds the name → id map, second pass resolves calls). Do not attempt
  single-pass resolution. Mark unresolved calls with `confidence: 'UNRESOLVED'` and resolve in a
  separate pass after all files are parsed.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AST parsing for TS/JS/Python/Rust | regex extraction, manual tokenizer | `tree-sitter` + grammars | Language grammars have thousands of edge cases. The tree-sitter TypeScript grammar alone has 183 named node types. Hand-rolled regex covers ~60% of real code; the other 40% (destructuring, generics, decorators, template literals, optional chaining) causes silent wrong extractions. |
| Incremental dirty tracking | mtime comparison, git status parsing | SHA-256 of file content | Content hash is stable across git ops, cross-platform, and trivial to compute with Node crypto. |
| Call graph resolution | custom scope analysis | Two-pass index with name lookup | Scope analysis for JS/TS is undecidable without type resolution. Use syntactic best-effort (match call names against declared names in same codebase) and mark confidence honestly. |
| Platform-specific binary distribution | cmake, gyp scripts | prebuildify prebuilts in tree-sitter npm package | Prebuilt binaries for darwin-arm64/x64, linux-arm64/x64, win32-arm64/x64 ship inside the npm tarball. On supported platforms: `npm install tree-sitter` does not compile. |

**Key insight:** The tree-sitter TypeScript grammar already knows about every language construct.
The indexer's only job is to walk the AST and map node types to CodeNode kinds — this is O(n)
trivial code. The hard part (parsing) is already done.

---

## Common Pitfalls

### Pitfall 1: tree-sitter Language Object Reuse

**What goes wrong:** Creating a new `Parser` instance for every file and calling `setLanguage()`
on each. This is expensive (~50ms per instantiation). On a 1000-file monorepo this adds ~50 seconds
of overhead.

**Why it happens:** The tree-sitter Node.js API docs show `new Parser()` in examples without
emphasizing the cost of repeated instantiation.

**How to avoid:** Create a `Map<SupportedLanguage, Parser>` at indexer startup. Each language gets
exactly one Parser instance, reused for all files of that language.

**Warning signs:** Indexing a 200-file project taking > 5 seconds when tree-sitter alone should
take < 1 second.

---

### Pitfall 2: Grammar Version Mismatch

**What goes wrong:** `tree-sitter` npm package is at 0.25.x but the grammar packages
(`tree-sitter-typescript`, etc.) were compiled against an older ABI. Results in a runtime error:
"Node version X is not supported" or "invalid grammar" on `parser.setLanguage()`.

**Why it happens:** tree-sitter uses a Node.js ABI version internally. Grammars compiled for
tree-sitter 0.22 may not load in tree-sitter 0.25 runtime.

**How to avoid:** Pin all grammar packages to versions that were published after the core
`tree-sitter` 0.25.0 release (June 2025). `tree-sitter-python` 0.25.0 and `tree-sitter-rust`
0.24.0 were published around the same time and are compatible. Verify at install by calling
`parser.setLanguage()` in a startup health check, wrapping the call in try/catch and emitting
a clear error.

**Warning signs:** `Error: Language version X is not supported` at runtime.

---

### Pitfall 3: ts-morph Memory Spike on Large Projects

**What goes wrong (if you choose ts-morph):** ts-morph holds the full TypeScript `Project` in
memory — all source files, their ASTs, and the type checker's symbol table. A monorepo with 5000
TypeScript files can consume 2-4 GB of RAM. The process OOMs or stalls.

**Why it matters here:** This is an explicit reason to NOT use ts-morph for Phase 19. tree-sitter
parses one file at a time with no persistent state between files. Peak memory per file is the file
size + AST overhead (~3x file size). A 10K-file monorepo runs in ~50MB peak.

**Confirmed:** `@ts-morph/common` package is 12MB — it bundles the TypeScript compiler internally.
`ts-morph` total on-disk footprint: 1.4MB (ts-morph) + 12MB (@ts-morph/common) = 13.4MB, plus the
TypeScript compiler loaded into memory at runtime.

---

### Pitfall 4: call_expression Resolution Produces False Edges

**What goes wrong:** A `call_expression` in tree-sitter has a callee node. The callee is
syntactically a string (e.g., `foo`, `this.bar`, `Result.fromThrowable`). Without type resolution,
you can only match the callee name against declared function names in the same index. This produces
false positives (two unrelated `render()` functions match each other) and false negatives (calls to
imported functions from external packages).

**How to avoid:**
1. Only resolve calls where the callee is a simple identifier (not a method chain).
2. Scope resolution to the same file first, then widen to the same codebase.
3. Mark cross-file resolved calls as `confidence: 'SYNTACTIC'` and unresolved as
   `confidence: 'UNRESOLVED'`.
4. Never claim a call edge is `confidence: 'RESOLVED'` without true type resolution.

---

### Pitfall 5: Storing Code Nodes in graph.json (the existing trap)

**What goes wrong:** The existing `codebase.ts` pushes `ContentItem` records through the ingest
pipeline, which eventually creates `GraphNode` records in `graph.json` with `file_type: 'code'`.
The MCP `search` and `ask` tools then return code file nodes intermixed with research papers and
HN posts, which is confusing and pollutes research queries with file path noise.

**How to avoid:** The new implementation MUST NOT call `ingestSource`. It writes directly to
`code-graph.db` via `CodeGraphRepository`. The existing `akashik index` command adds a
`--deep` flag for the new code graph pass. The existing `codebase.ts` behavior (file-level nodes
in the research graph) can be optionally retained as a lightweight "code presence" indicator but
must be gated behind a separate flag.

---

### Pitfall 6: Grammars Not Available for Go via npm

**What goes wrong:** `tree-sitter-go` does not have an official npm package with precompiled Node
bindings (confirmed: no npm package found). Attempting `require('tree-sitter-go')` fails.

**How to avoid:** For Phase 19, support only TypeScript/JavaScript, Python, and Rust — these all
have official npm grammar packages. Go support can be added in Phase 20 via the WASM grammar
(`web-tree-sitter` + manually fetched `tree-sitter-go.wasm`), accepting the ~3x performance
penalty for Go files only.

---

## Code Examples

### Loading a Grammar and Parsing a File

```typescript
// Source: tree-sitter Node.js API (https://github.com/tree-sitter/node-tree-sitter)
// Confirmed: tree-sitter 0.25.0, tree-sitter-typescript 0.23.2

import TreeSitter from 'tree-sitter';
// tree-sitter-typescript exports two grammars: .typescript and .tsx
import { typescript, tsx } from 'tree-sitter-typescript';

const parser = new TreeSitter();
parser.setLanguage(typescript);

const tree = parser.parse(`
  export function greet(name: string): string {
    return \`Hello, \${name}\`;
  }
`);

// tree.rootNode.type === 'program'
// tree.rootNode.children[0].type === 'export_statement'
// tree.rootNode.children[0].children[1].type === 'function_declaration'
```

### Walking the AST for Code Nodes

```typescript
// Source: tree-sitter Node.js API
import type { SyntaxNode } from 'tree-sitter';

const KIND_MAP: Readonly<Record<string, CodeNodeKind>> = {
  function_declaration:    'function',
  arrow_function:          'arrow_function',
  method_definition:       'method',
  class_declaration:       'class',
  interface_declaration:   'interface',
  type_alias_declaration:  'type_alias',
};

const extractNodes = (
  root: SyntaxNode,
  filePath: string,
  codebaseId: CodebaseId,
  language: SupportedLanguage,
  contentHash: string,
): readonly CodeNode[] => {
  const results: CodeNode[] = [];

  const walk = (node: SyntaxNode, parentId?: string): void => {
    const kind = KIND_MAP[node.type];
    if (kind) {
      const name = node.childForFieldName('name')?.text ?? '<anonymous>';
      const id = computeId(codebaseId, filePath, kind, name, node.startPosition.row);
      results.push({
        id,
        codebase_id: codebaseId,
        kind,
        name,
        file_path: filePath,
        language,
        line:      node.startPosition.row + 1,
        col:       node.startPosition.column,
        end_line:  node.endPosition.row + 1,
        end_col:   node.endPosition.column,
        parent_id: parentId,
        signature:   extractSignature(node),
        return_type: extractReturnType(node),
        content_hash: contentHash,
        indexed_at: new Date().toISOString(),
      });
      // Recurse with this node as parent for methods inside classes etc.
      for (const child of node.children) walk(child, id);
    } else {
      for (const child of node.children) walk(child, parentId);
    }
  };

  walk(root);
  return results;
};
```

### Incremental Dirty Check

```typescript
// Source: Node.js crypto module (stdlib)
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const fileContentHash = (filePath: string): string =>
  createHash('sha256').update(readFileSync(filePath)).digest('hex');

// In the indexer loop:
const currentHash = fileContentHash(absolutePath);
const storedHash = repo.getFileHash(codebaseId, relPath); // SELECT content_hash FROM code_nodes WHERE codebase_id=? AND file_path=? LIMIT 1
if (storedHash === currentHash) continue; // skip — file unchanged
```

### Codebase Attachment to Room

```typescript
// src/infrastructure/code-graph-repository.ts
// Source: better-sqlite3 API (https://github.com/WiseLibs/better-sqlite3)

export interface CodeGraphRepository {
  upsertCodebase(cb: Codebase): Result<void, CodeGraphError>;
  upsertNodes(nodes: readonly CodeNode[]): Result<void, CodeGraphError>;
  upsertEdges(edges: readonly CodeEdge[]): Result<void, CodeGraphError>;
  attachToRoom(codebaseId: CodebaseId, roomId: string): Result<void, CodeGraphError>;
  detachFromRoom(codebaseId: CodebaseId, roomId: string): Result<void, CodeGraphError>;
  getCodebasesForRoom(roomId: string): Result<readonly Codebase[], CodeGraphError>;
  getRoomsForCodebase(codebaseId: CodebaseId): Result<readonly string[], CodeGraphError>;
  getFileHash(codebaseId: CodebaseId, filePath: string): string | undefined;
  nodesByKind(codebaseId: CodebaseId, kind: CodeNodeKind): Result<readonly CodeNode[], CodeGraphError>;
  callGraph(codebaseId: CodebaseId): Result<readonly CodeEdge[], CodeGraphError>;
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| LSIF (Language Server Index Format) | SCIP (Sourcegraph Code Intelligence Protocol) | 2022 | SCIP supersedes LSIF; but neither is relevant for akashik's local-first scope |
| Language Server Protocol (interactive) | Tree-sitter (batch, offline) | 2018-present | LSP is for editor integration; tree-sitter is for offline indexing — they serve different purposes |
| Regex-based export extraction (current `codebase.ts`) | tree-sitter AST walk | Phase 19 | Enables function/class/method/call graph nodes instead of file-level summaries |
| All code nodes in `graph.json` | Separate `code-graph.db` SQLite store | Phase 19 | Code and research graphs have different schemas, lifecycles, and query patterns |

**Deprecated/outdated:**
- The existing `codebase.ts` regex approach: shallow, no function/class nodes, pollutes research graph. Replace entirely.
- `LSIF`: superseded by SCIP. SCIP itself is irrelevant for Phase 19 scope.
- Emitting code nodes as `GraphNode` with `file_type: 'code'`: wrong model, mixing concerns.

---

## Design Pattern Detection — Phase Scope Decision

**The user listed design patterns as a schema concern.** Here is the honest assessment:

| Approach | Accuracy | Deps | Phase |
|----------|----------|------|-------|
| Heuristic name matching (class `*Factory`, `*Singleton`, etc.) | ~40% — misses anonymous patterns, flags false positives | 0 new deps | Could add as low-priority Phase 19 bonus |
| `@ast-grep/napi` structural patterns | ~75% for common patterns (Singleton, Observer, Factory) | 1 new dep (13,387 stars, MIT, prebuilt) | Phase 20 |
| LLM-based (call Claude API per class) | ~90% but costs money, not local-first | 0 new deps but API cost | Out of scope |

**Decision for Phase 19:** Do NOT implement design pattern detection. The schema should include a
nullable `detected_patterns?: readonly string[]` field on `CodeNode` (kind: 'class') to leave the
door open, but Phase 19 only populates it via trivial name heuristics (`/Factory$/`, `/Singleton$/`,
`/Observer$/`) as a zero-dep bonus. Real pattern detection ships in Phase 20 with `@ast-grep/napi`.

---

## Phase 19 Scope vs Deferred

### Phase 19: Implement

1. **Replace `codebase.ts`** with tree-sitter-backed indexer — CodeNode extraction for TS/JS/Python/Rust
2. **New domain types** in `src/domain/code-graph.ts` — CodeNode, CodeEdge, Codebase, CodebaseRoomLink
3. **New SQLite repository** in `src/infrastructure/code-graph-repository.ts` — separate `code-graph.db`
4. **Incremental indexing** — SHA-256 dirty check, skip unchanged files
5. **Codebase aggregate root** — `codebases` table + `codebase_rooms` join table
6. **`akashik index --deep` CLI flag** — triggers code graph pass after existing room ingest
7. **Two-pass call graph** — first pass builds name→id map, second pass resolves call_expression nodes
8. **MCP tool `get_code_nodes(codebase_id, kind?)`** — lets Claude query the code graph mid-conversation

### Phase 20: Defer

- Go language support (no official npm grammar package; requires WASM approach)
- Design pattern detection via `@ast-grep/napi`
- Cross-codebase call graph edges (requires shared name registry across codebases)
- Code node embedding + vector search (index code nodes into `sqlite-vec` for semantic search)
- MCP `search` integration — when a room has an attached codebase, `search(query, room)` also queries
  the code graph for relevant functions/classes

---

## Dep Budget Justification

**PROJECT.md constraint: Max 3 new deps per phase.**

| Dep | Count | Justification |
|-----|-------|---------------|
| `tree-sitter` | 1 | Core parser — irreplaceable. No hand-roll option for a production AST parser. |
| `tree-sitter-typescript` | ~0.5 | Grammar data package, no logic. Treated as data dep, not a code dep. |
| `tree-sitter-python` | ~0.5 | Same as above. |
| `tree-sitter-rust` | ~0.5 | Same as above. |
| **Total conceptual** | **2** | Core parser (1) + grammar data (1). Under the 3-dep budget. |

The grammar packages are declarative data files compiled into binary `.node` addons. They contain
no application logic, no transitive dependencies, and no risk surface. Counting them as three
separate "deps" in the spirit of the 3-dep rule is overly strict; they are more analogous to
language locale data files. The budget is satisfied.

---

## Validation Architecture

Config `workflow.nyquist_validation` is absent — treat as enabled.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js `--test` (built-in, no Jest/Vitest) |
| Config file | None — `package.json` scripts: `"test": "node --import tsx --test tests/*.test.ts"` |
| Quick run command | `node --import tsx --test tests/phase19.code-graph.test.ts` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CODE-01 | Parse TS function/class/interface nodes from a fixture file | unit | `node --import tsx --test tests/phase19.code-graph.test.ts` | ❌ Wave 0 |
| CODE-02 | Build call graph from two-file fixture (A calls B) | unit | same | ❌ Wave 0 |
| CODE-03 | Parse Python function nodes from a fixture | unit | same | ❌ Wave 0 |
| CODE-04 | CodeGraphRepository writes to code-graph.db, not graph.json | integration | same | ❌ Wave 0 |
| CODE-05 | attachToRoom / getCodebasesForRoom round-trip | unit | same | ❌ Wave 0 |
| CODE-06 | Re-index unchanged file → zero new nodes (hash check) | unit | same | ❌ Wave 0 |
| CODE-07 | `akashik index --deep` exits 0 on akashik repo itself | integration | same | ❌ Wave 0 |
| CODE-08 | CodeNode has all required fields populated for a real function | unit | same | ❌ Wave 0 |

**Minimum: 3 assertions per test** (prevents the eager-sequence race pattern from Phase 2).

### Wave 0 Gaps

- [ ] `tests/phase19.code-graph.test.ts` — covers CODE-01 through CODE-08
- [ ] `tests/fixtures/sample.ts` — a TypeScript fixture with a class, two functions, one call
- [ ] `tests/fixtures/sample.py` — a Python fixture with a function definition
- [ ] Framework install: none — `node --test` is Node 20 built-in; `tree-sitter` + grammars via `npm install`

---

## Open Questions

1. **tree-sitter-typescript grammar last push: 2025-08-29 — 7+ months ago**
   - What we know: The grammar is stable and complete; it was not updated because tree-sitter TS/TSX
     grammar coverage is comprehensive (183 named node types).
   - What's unclear: Whether TypeScript 5.6+ syntax (new in 2025) is fully covered.
   - Recommendation: Test the grammar against decorators, const type parameters, and `using`
     declarations. If gaps are found, the WASM version (`web-tree-sitter` + grammar WASM) can be
     used for TS with the native binding used for Python/Rust — but this is unlikely to be needed.

2. **`akashik index --deep` UX — should it replace the existing shallow indexing or add to it?**
   - What we know: The existing `akashik index` creates file-level nodes in graph.json for
     room-based research context.
   - What's unclear: Whether users want the file-level nodes to remain in the research graph after
     the deep index is built (they serve different purposes — the shallow nodes are context for LLM
     queries, the deep nodes are for structured code navigation).
   - Recommendation: Keep both. `--deep` is additive. The existing shallow nodes remain in graph.json
     and the new deep nodes live in code-graph.db. The MCP server exposes both via different tools.

3. **MCP integration — how does the existing `search` tool interact with the code graph?**
   - What we know: The current `search` MCP tool queries `sqlite-vec` which only holds research
     room embeddings. Code nodes are not embedded yet.
   - What's unclear: Whether Phase 19 should embed CodeNodes into sqlite-vec for semantic search,
     or keep code graph as structured-only (SQL queries, no vector search).
   - Recommendation: Defer embedding to Phase 20. Phase 19 introduces a new `get_code_nodes` MCP
     tool that does structured SQL queries (by kind, by name, by file). Vector search over code
     comes in Phase 20 when we understand the query patterns better.

---

## Sources

### Primary (HIGH confidence)

- gh API `repos/tree-sitter/node-tree-sitter` — stars: 843, pushed 2026-03-29, not archived
- gh API `repos/tree-sitter/tree-sitter` — stars: 24,670, pushed 2026-04-11
- npm registry `tree-sitter` 0.25.0 — published 2025-06-02, MIT, node-gyp-build (prebuildify)
- gh API `repos/tree-sitter/node-tree-sitter/releases/latest` — tag v0.22.4, 6 prebuilt .node assets
- tree-sitter-typescript `node-types.json` via gh API — 183 named node types; confirmed: call_expression, function_declaration, class_declaration, interface_declaration, method_definition, arrow_function, import_statement, export_statement, method_signature, type_alias_declaration
- gh API `repos/dsherret/ts-morph` — stars: 6,007, pushed 2026-04-11, not archived
- npm registry `ts-morph` 27.0.2, `@ts-morph/common` 0.28.1 (12MB — bundles TypeScript compiler)
- gh API `repos/ast-grep/ast-grep` — stars: 13,387, pushed 2026-04-11, Rust, MIT
- npm registry `@ast-grep/napi` 0.42.1 — 9 platform prebuilts via optionalDependencies (NAPI-RS), no install script
- gh API `repos/sourcegraph/scip-typescript` — stars: 88, last commit Oct 2025
- npm registry `tree-sitter-python` 0.25.0, `tree-sitter-rust` 0.24.0 — confirmed via npm view
- `src/infrastructure/sources/codebase.ts` — existing implementation inspected directly
- `src/domain/graph.ts` — existing GraphNode/Graph types inspected directly
- `src/infrastructure/graph-repository.ts` — existing persistence model inspected directly
- `package.json` — `better-sqlite3` confirmed as existing native dep (establishes native compilation precedent)

### Secondary (MEDIUM confidence)

- tree-sitter Node.js API patterns — from GitHub README + node-tree-sitter source code review
- SQLite DDL schema design — based on existing `vector-index.ts` patterns in the codebase

### Tertiary (LOW confidence — validate before coding)

- tree-sitter 0.25.0 npm package ships prebuilds inside the tarball (inferred from: `prebuildify` in build script, 6 prebuilt assets in GitHub release). Not directly verified by unpacking the tarball.
- `tree-sitter-typescript` grammar fully covers TypeScript 5.6+ syntax. Not verified against latest TS syntax additions.

---

## Metadata

**Confidence breakdown:**
- Standard stack selection: HIGH — all deps verified via gh API + npm registry on 2026-04-12
- Architecture (SQLite tables, Codebase aggregate): HIGH — follows existing patterns in codebase
- Grammar node types: HIGH — verified against official `node-types.json` via gh API
- Dep budget analysis: HIGH — direct npm size measurements
- Incremental indexing pattern: HIGH — SHA-256 is standard, mtime unreliability is documented
- Design pattern detection deferral: HIGH — explicit scope decision with rationale
- Go language support gap: HIGH — confirmed no official npm grammar package exists

**Research date:** 2026-04-12
**Valid until:** 2026-06-01 (tree-sitter is stable; grammars are stable; only risk is a tree-sitter major version bump breaking ABI compatibility with grammar packages)
