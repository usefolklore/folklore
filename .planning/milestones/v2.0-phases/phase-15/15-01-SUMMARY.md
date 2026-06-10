---
phase: 15-peer-foundation-security
plan: "01"
subsystem: domain
tags: [peer, sharing, secrets-scan, neverthrow, functional-ddd]
dependency_graph:
  requires: []
  provides:
    - ShareableNode type (SEC-03 enforced metadata boundary)
    - scanNode / auditRoom / buildPatterns pure functions
    - PeerInfo / PeerRegistry types and pure registry operations
    - PeerError union (10 variants) + ScanError union (1 variant) in AppError
    - PeerConfig + SecurityConfig in AppConfig
  affects:
    - src/domain/sharing.ts (new)
    - src/domain/peer.ts (new)
    - src/domain/errors.ts (extended)
    - src/infrastructure/config-loader.ts (extended)
tech_stack:
  added: []
  patterns:
    - Pure functional domain: no classes, no throws, neverthrow Result
    - Discriminated union errors with factory objects (same pattern as GraphError)
    - Global regex re.lastIndex reset guard (prevents statefulness bugs)
    - ShareableNode as type-level projection (field omission as security boundary)
key_files:
  created:
    - src/domain/peer.ts
    - src/domain/sharing.ts
  modified:
    - src/domain/errors.ts
    - src/infrastructure/config-loader.ts
decisions:
  - "ScanError + PeerError added to AppError union; formatError switch is exhaustive over all variants"
  - "ShareableNode omits file_type and source_file at the type level (not runtime filter) for SEC-03"
  - "10 built-in secret patterns use global regexes with mandatory re.lastIndex = 0 reset per call"
  - "PeerStoreReadError and PeerStoreWriteError are separate variants from identity errors (peers.json vs peer-identity.json)"
  - "Task 2 executed before Task 1 commit because sharing.ts imports ScanError/ScanMatch from errors.ts — resolved as Deviation Rule 3 (blocking import)"
metrics:
  duration_seconds: 183
  completed_date: "2026-04-12T07:58:38Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 2
---

# Phase 15 Plan 01: Peer Foundation Domain Types and Security Scanner Summary

**One-liner:** Pure functional domain layer for P2P peers and secrets scanning — ShareableNode projection, 10 built-in regex patterns with lastIndex guard, PeerError/ScanError unions extending AppError.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Create peer.ts + sharing.ts domain types and security functions | 49f02c2 | src/domain/peer.ts, src/domain/sharing.ts |
| 2 | Extend errors.ts + config-loader.ts with PeerError, ScanError, PeerConfig, SecurityConfig | b3b6c95 | src/domain/errors.ts, src/infrastructure/config-loader.ts |

## What Was Built

### src/domain/peer.ts (new)
Pure vocabulary for P2P peer identity and registry:
- `PeerInfo` — readonly peer record (id, addrs, addedAt, label?)
- `PeerRegistry` — readonly collection of peers
- `emptyRegistry` — constructor
- `findPeer`, `hasPeer` — queries (no throws)
- `addPeer`, `removePeer` — pure transformations returning `Result<PeerRegistry, string>` (deduplication enforced by id)
- `isMultiaddrShaped` — structural check delegating protocol validation to infra layer

### src/domain/sharing.ts (new)
Secrets scanning and share-boundary projection:
- `ShareableNode` — type-level subset of GraphNode, intentionally missing `file_type` and `source_file` (SEC-03)
- `AuditResult` — partition of allowed / blocked nodes with match details
- `BUILT_IN_PATTERNS` — 10 frozen pattern entries covering OpenAI keys, GitHub tokens, GitHub OAuth, AWS key IDs, Stripe live keys, Bearer tokens, password KV pairs, api_key KV pairs, env _TOKEN and _SECRET suffixes
- `buildPatterns(extras?)` — composes built-ins with config-supplied extras
- `scanNode(node, patterns)` — projects GraphNode to ShareableNode, returns `ok(ShareableNode)` or `err(ScanError)` (hard block, no override)
- `auditRoom(nodes, patterns)` — applies scanNode across a node list, returns `AuditResult`
- All global regexes reset `re.lastIndex = 0` before every `test()` call

### src/domain/errors.ts (extended)
- `ScanMatch` interface — `{ field, patternName }` for diagnostics
- `PeerError` discriminated union — 10 variants:
  - Identity file: PeerIdentityReadError, PeerIdentityWriteError, PeerIdentityParseError, PeerIdentityGenerateError
  - Peer store (peers.json): PeerStoreReadError, PeerStoreWriteError
  - Network: PeerDialError, PeerNotFound, PeerTransportError, InvalidMultiaddr
- `ScanError` discriminated union — 1 variant: SecretDetected(nodeId, matches[])
- `AppError` union extended: `GraphError | VectorError | EmbeddingError | PeerError | ScanError`
- `formatError` switch extended with all 11 new variants (exhaustive)

### src/infrastructure/config-loader.ts (extended)
- `PeerConfig` — `{ port: number }` (default 0 = OS-assigned)
- `SecurityConfig` — `{ secrets_patterns: ReadonlyArray<{name, pattern}> }` (default [])
- `AppConfig` extended with `peer: PeerConfig` and `security: SecurityConfig`
- `loadConfig` YAML parser reads `peer.port` and `security.secrets_patterns` with typed defaults

## Verification

```
npx tsc --noEmit   → 0 errors
npm test           → 33/33 pass (0 failures, 0 regressions)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 2 had to be executed before Task 1's TypeScript verification**

- **Found during:** Task 1 verification (`npx tsc --noEmit` after writing peer.ts + sharing.ts)
- **Issue:** `sharing.ts` imports `ScanError` and `ScanMatch` from `errors.ts`, but those types are defined in Task 2. TypeScript reported 3 errors: `Module '"./errors.js"' has no exported member 'ScanError'` / `ScanMatch`.
- **Fix:** Proceeded immediately to execute Task 2 (extending errors.ts) before committing Task 1. Both tasks were then committed separately once the full type-check passed.
- **Files modified:** src/domain/errors.ts, src/infrastructure/config-loader.ts
- **Impact:** None — both tasks still committed atomically as separate commits; execution order was adjusted, not scope.

## Self-Check: PASSED

- [x] src/domain/peer.ts exists and compiles
- [x] src/domain/sharing.ts exists and compiles
- [x] src/domain/errors.ts extended and compiles
- [x] src/infrastructure/config-loader.ts extended and compiles
- [x] Commit 49f02c2 exists (Task 1)
- [x] Commit b3b6c95 exists (Task 2)
- [x] All 33 existing tests pass (no regressions)
- [x] ShareableNode type excludes file_type and source_file
- [x] 10 built-in patterns in BUILT_IN_PATTERNS
- [x] re.lastIndex = 0 present in scanNode
- [x] PeerStoreReadError and PeerStoreWriteError are separate variants
- [x] AppError union includes PeerError and ScanError
