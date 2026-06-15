---
phase: 15-peer-foundation-security
plan: "03"
subsystem: cli
tags: [peer, share, audit, cli, subcommands, neverthrow, functional-ddd, sec-04]
dependency_graph:
  requires:
    - 15-01 (PeerError, ScanError, ShareableNode, auditRoom, buildPatterns, isMultiaddrShaped)
    - 15-02 (loadOrCreateIdentity, createNode, dialAndTag, loadPeers, savePeers, addPeerRecord, removePeerRecord)
  provides:
    - "`folklore peer add <multiaddr>` — dial + persist to peers.json"
    - "`folklore peer remove <id>` — remove entry from peers.json"
    - "`folklore peer list` — stored peers (live status deferred to Phase 18)"
    - "`folklore peer status` — own PeerId, public key, peer count"
    - "`folklore share audit --room <name> [--json]` — sharing boundary preview (SEC-04)"
    - peer and share commands registered in CLI router
  affects:
    - src/cli/commands/peer.ts (new)
    - src/cli/commands/share.ts (new)
    - src/cli/index.ts (2 imports + 2 record entries)
tech_stack:
  added: []
  patterns:
    - "`(args: string[]) => Promise<number>` command signature mirroring room.ts"
    - Subcommand routing via `switch(sub)` with exhaustive default + USAGE banner
    - try/finally around libp2p node lifecycle — node.stop() guaranteed on every exit path
    - Inline flag parser for `--room` / `--json` (no commander/yargs dep)
    - formatError used directly on GraphError/PeerError/ScanError (all members of AppError)
    - Ed25519 public key extraction via .raw.slice(32) — no libp2p API round-trip
key_files:
  created:
    - src/cli/commands/peer.ts
    - src/cli/commands/share.ts
  modified:
    - src/cli/index.ts
decisions:
  - "node.stop() placed in try/finally of `peer add` — guarantees libp2p cleanup even when dial/persist fails (prevents dangling TCP listeners)"
  - "`peer list` reads peers.json only — live connection status, latency, shared rooms explicitly deferred to Phase 18 NET layer (documented in USAGE banner and plan scope note)"
  - "public key displayed in `peer status` via `identity.privateKey.raw.slice(32)` — .raw is 64 bytes (32 private scalar + 32 public), slicing avoids a second libp2p call"
  - "`share audit` uses fileGraphRepository directly instead of defaultRuntime — avoids opening the sqlite vector index for a read-only audit (faster, smaller footprint, no sqlite side-effects)"
  - "formatError applied directly without casting each branch to AppError — GraphError/PeerError/ScanError are all union members so TypeScript infers correctly at the callsite"
  - "`share audit --json` outputs full ShareableNode + blocked records (not just counts) — machine-readable consumers need the node IDs and match reasons, not a summary"
metrics:
  duration_seconds: 240
  completed_date: "2026-04-12T11:17:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 1
---

# Phase 15 Plan 03: Peer and Share CLI Commands Summary

**One-liner:** Five user-facing CLI commands delivering PEER-02/03/04/05 + SEC-04 — `peer add/remove/list/status` and `share audit --room X [--json]` — wired into the command router with neverthrow error handling and formatError output.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Create peer CLI command with add/remove/list/status subcommands | ba7db60 | src/cli/commands/peer.ts |
| 2 | Create share audit CLI command and register both in index.ts | 15394ef | src/cli/commands/share.ts, src/cli/index.ts |

## What Was Built

### src/cli/commands/peer.ts (new, 194 lines)

Four-subcommand router exposing the peer bounded context to the CLI, following the exact pattern of `room.ts`:

- **`peer add <multiaddr>`** — validates multiaddr shape (domain `isMultiaddrShaped`), loads config for listen port, lazily creates ed25519 identity, starts a libp2p node, dials the remote via `dialAndTag`, then loads + upserts + saves peers.json through the atomic peer-store. A `try { ... } finally { await node.stop() }` around the whole dial-and-persist sequence guarantees the libp2p node is always stopped — even when dial fails or persist errors.
- **`peer remove <id>`** — pure peers.json update: load, guard for existence, `removePeerRecord`, save. No libp2p node is started (Phase 15 scope: stored peers only).
- **`peer list`** — reads peers.json and renders each entry with id, addrs, addedAt, optional label. Empty-state message guides the user to `peer add`. Explicit note in USAGE: "stored — live status in Phase 18".
- **`peer status`** — loads identity (lazy-generate on first call), reads peer count from peers.json, prints PeerId, base64 public key (`privateKey.raw.slice(32)` — the second 32 bytes of the ed25519 raw form), and the stored peer count.

All error branches flow through `formatError` for consistent one-line CLI diagnostics. The entry function signature matches the existing `CommandFn` type: `async (args: string[]) => Promise<number>`.

### src/cli/commands/share.ts (new, 129 lines)

Single-subcommand command for the sharing security boundary:

- **`share audit --room <name> [--json]`** — inline flag parser (no commander/yargs dep), loads config for custom `security.secrets_patterns`, opens the graph through `fileGraphRepository` (bypassing `defaultRuntime` to avoid opening the sqlite vector index for a read-only audit), filters nodes via `nodesInRoom`, composes built-in + config patterns through `buildPatterns`, and runs `auditRoom` from the domain layer.
- **Table output** (default): total nodes / would-share count / blocked count header, then `allowed` section (12-char id prefix, 60-char label truncate, optional source_uri), then `BLOCKED` section with comma-joined `field:patternName` reason list.
- **JSON output** (`--json` flag): emits `{ room, total, allowed, blocked, allowed_nodes, blocked_nodes }` — the full ShareableNode records and ScanMatch arrays, not just counts, so machine consumers can drive downstream tooling.
- USAGE banner announces the Phase 16 follow-ups (`share room`, `unshare`) without implementing them.

### src/cli/index.ts (2 import lines + 2 record entries)

- Added `import { peer } from './commands/peer.js'` and `import { share } from './commands/share.js'` after the existing `dashboard` import.
- Added `peer,` and `share,` entries to the `commands: Record<string, CommandFn>` map after `dashboard`.
- No changes to `main()`, `futureCommands`, or the unknown-command fallback — the existing router dispatches the new commands automatically.

## Verification

```
npx tsc --noEmit   → 0 errors (empty stdout)
npm test           → 70/70 pass (33 pre-existing + 37 from Plan 15-04, 0 regressions)
git log --oneline -3
  15394ef feat(15-03): add share audit CLI command and register in router
  ba7db60 feat(15-03): add peer CLI command with add/remove/list/status subcommands
  cb46402 test(15-04): Phase 15 peer-security requirement suite — 37 tests, 12 groups
```

Acceptance criteria (Plan 15-03):

- [x] `export const peer` in peer.ts — 1 occurrence (line 182)
- [x] `case 'add' | 'remove' | 'list' | 'status'` — all 4 present (lines 185-188)
- [x] `loadOrCreateIdentity` used in both `add` and `status`
- [x] `dialAndTag` invoked in `add`
- [x] `savePeers` invoked in both `add` and `remove`
- [x] `node.stop()` in finally block — 1 occurrence
- [x] `export const share` in share.ts — 1 occurrence (line 120)
- [x] `case 'audit'` present
- [x] `auditRoom`, `buildPatterns`, `nodesInRoom` all referenced
- [x] `--json` flag parsed and honored
- [x] `peer` and `share` imports + record entries in index.ts
- [x] `npx tsc --noEmit` → 0 errors
- [x] `npm test` → 70/70 pass

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed unused imports and spurious AppError casts from plan snippet**

- **Found during:** Task 1 write (before commit)
- **Issue:** The plan's code snippet imported `hangUpPeer` and `getNodeStatus` from peer-transport, and `runtimePaths` from runtime.ts, but `peer.ts` never uses them (hangUp happens inside `node.stop()`; getNodeStatus is for a live-node list which is deferred to Phase 18; peers/identity paths use `folkloreHome()` directly). It also imported `AppError` and cast every error branch as `error as AppError`, but `loadConfig` returns `GraphError` and the peer-* functions return `PeerError` — both are already union members of `AppError`, so `formatError` accepts them directly without casts. TypeScript's strict noUnusedLocals would fail on the unused imports, and the redundant casts add noise.
- **Fix:** Trimmed imports to only what `peer.ts` actually uses (`loadOrCreateIdentity`, `createNode`, `dialAndTag`, `loadPeers`, `savePeers`, `addPeerRecord`, `removePeerRecord`, `loadConfig`, `folkloreHome`, `isMultiaddrShaped`, `formatError`). Removed `AppError` type import and the `error as AppError` casts at each `formatError(...)` callsite.
- **Files modified:** src/cli/commands/peer.ts
- **Commit:** ba7db60

**2. [Rule 1 - Bug] Same unused-import / redundant-cast cleanup in share.ts**

- **Found during:** Task 2 write (before commit)
- **Issue:** Plan snippet imported `AppError` (never referenced) and cast `configResult.error` / `graphResult.error` as `AppError` at the formatError callsites. Same root cause as deviation 1 — they're already union members.
- **Fix:** Dropped the `AppError` import and removed the casts.
- **Files modified:** src/cli/commands/share.ts
- **Commit:** 15394ef

**3. [Rule 2 - Missing critical] Flag parser was slightly brittle in plan snippet**

- **Found during:** Task 2 write
- **Issue:** Plan used two separate `if` branches in the flag-parse loop (`if --room ... if --json`) with no `else`. Functionally correct for current flags but masks the intent that `--room` and `--json` are mutually-exclusive slots within the iteration — and would mis-index if a future flag took the form `--json=<value>`.
- **Fix:** Changed to `if / else if` so each iteration handles at most one flag, and advanced the counter only inside the `--room` branch.
- **Files modified:** src/cli/commands/share.ts
- **Commit:** 15394ef

### Task Commit Hygiene Note

Task 1's commit (ba7db60) absorbed pre-existing staged-but-unrelated files from a prior execution attempt: `.planning/STATE.md`, `.planning/REQUIREMENTS.md`, and `.planning/phases/phase-15/15-04-SUMMARY.md`. These had already been staged before I ran `git add src/cli/commands/peer.ts`, so the explicit-file `git add` still swept them into the commit. None of those files belong to Plan 15-03 semantically — they reflect legitimate prior work from Plans 15-01/02/04 and a concurrent state update. Task 2's commit (15394ef) is clean: only `share.ts` and `index.ts`, matching the plan's stated scope.

## Self-Check: PASSED

- [x] src/cli/commands/peer.ts exists and compiles
- [x] src/cli/commands/share.ts exists and compiles
- [x] src/cli/index.ts updated with peer + share imports and record entries
- [x] Commit ba7db60 exists (Task 1)
- [x] Commit 15394ef exists (Task 2)
- [x] `export const peer` is the single public entry of peer.ts
- [x] `export const share` is the single public entry of share.ts
- [x] `case 'add'`, `case 'remove'`, `case 'list'`, `case 'status'` all present in peer.ts
- [x] `case 'audit'` present in share.ts
- [x] `auditRoom`, `buildPatterns`, `nodesInRoom` all imported in share.ts
- [x] `loadOrCreateIdentity`, `dialAndTag`, `savePeers`, `addPeerRecord`, `removePeerRecord` all imported in peer.ts
- [x] `node.stop()` inside try/finally of `peer add`
- [x] `--json` flag parsing present in share.ts
- [x] `peer` and `share` imports present in index.ts
- [x] `peer,` and `share,` entries present in commands record in index.ts
- [x] `npx tsc --noEmit` → 0 errors
- [x] `npm test` → 70/70 pass, 0 regressions
- [x] No claude/anthropic co-authors on any commit
