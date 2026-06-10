---
phase: phase-16
plan: "03"
subsystem: sharing-cli-daemon
tags: [cli, share, unshare, daemon, libp2p, yjs, crdt, share-sync, p2p]
dependency_graph:
  requires:
    - 16-01  # share-store.ts, ydoc-store.ts, ShareError
    - 16-02  # share-sync.ts — syncNodeIntoYDoc, runShareSyncTick, createShareSyncRegistry, registerShareProtocol
  provides:
    - "akashik share room <name> CLI command"
    - "akashik unshare <name> CLI command"
    - "DaemonDeps.shareSync optional field"
    - "daemon loop calls runShareSyncTick per tick when libp2p is live"
    - "libp2p bootstrap in startLoop gated on peer-identity.json existence"
  affects:
    - 16-04  # integration tests will exercise these CLI commands
tech_stack:
  added: []
  patterns:
    - auditRoom hard-block gate before mutateSharedRooms (SHARE-01)
    - syncNodeIntoYDoc seeds Y.Doc with existing room nodes on share (W3/SHARE-04)
    - idempotent unshare — identity-transform read before removal
    - shareSync optional field in DaemonDeps — additive, never breaking
    - libp2p bootstrap gated on peer-identity.json presence (zero network footprint for non-P2P users)
    - unregisterShareProtocol + node.stop() cleanup ordering on SIGTERM/SIGINT
key_files:
  created:
    - src/cli/commands/unshare.ts
  modified:
    - src/cli/commands/share.ts
    - src/cli/index.ts
    - src/daemon/loop.ts
decisions:
  - "syncNodeIntoYDoc takes GraphNode (not ShareableNode) — the CLI passes the full GraphNode filtered by allowed IDs from auditRoom so the function can re-scan internally; ShareableNode values from auditRoom are not passed directly"
  - "auditRes variable (not audit) used in roomCmd to avoid shadowing the audit() function — semantically identical to the plan's audit.blocked.length check"
  - "liveNode.stop() used instead of node.stop() (plan's grep criterion) — the local variable is named liveNode for clarity; intent fully satisfied"
  - ".ydoc files are never deleted by unshare — retained for future re-share (CONTEXT.md locked decision)"
  - "unshare does two mutateSharedRooms calls (idempotent read then conditional remove) — acceptable overhead for a human-initiated CLI command"
metrics:
  duration_seconds: 1335
  tasks_completed: 3
  files_created: 1
  files_modified: 3
  completed_date: "2026-04-12T11:04:47Z"
---

# Phase 16 Plan 03: CLI Commands + Daemon Tick Hook — SUMMARY

**One-liner:** `share room` / `unshare` CLI commands with auditRoom hard-block and Y.Doc seeding, plus libp2p share-sync bootstrapped inside `startLoop` and ticked per daemon interval.

---

## What Was Built

### 1. `akashik share room <name>` subcommand (Task 1)

**File:** `src/cli/commands/share.ts` — extended from 130 to 232 lines

**Flow:**
1. `loadConfig` → `loadGraph` → `nodesInRoom` → `buildPatterns`
2. `auditRoom` — SHARE-01 hard-block: if `auditRes.blocked.length > 0`, exits 1 with blocked count + node list. No override path.
3. `mutateSharedRooms(sharedRoomsPath, file => addSharedRoom(file, record))` — cross-process lock
4. `loadYDoc(ydocPath)` → iterate allowed GraphNodes → `syncNodeIntoYDoc` each → `saveYDoc` — W3: Y.Doc seeded with existing room nodes so peers see content on first sync
5. Prints success message + daemon hint

**Empty room handling:** Records the room in shared-rooms.json even with 0 nodes — future ingests will propagate.

**Exit codes:** 0 on success, 1 on any error (blocked, config failure, lock failure, Y.Doc failure).

### 2. `akashik unshare <name>` command (Task 2)

**File:** `src/cli/commands/unshare.ts` — 61 lines (new file)

**SHARE-02 semantics:**
- Reads current shared-rooms.json (identity transform via `mutateSharedRooms`) to check if room is registered
- Idempotent: if room is not in registry, exits 0 with `'<name>' was not shared (no-op)`
- On found: `mutateSharedRooms(path, file => removeSharedRoom(file, name))` removes the entry
- `.ydoc` file at `~/.akashik/ydocs/<name>.ydoc` is **NEVER deleted** — retained for future re-share
- Prints daemon-restart hint so user knows streams close on next tick

**CLI registration:** `src/cli/index.ts` — `import { unshare }` added + `unshare,` in the commands Record.

### 3. Daemon loop share sync hook (Task 3)

**File:** `src/daemon/loop.ts` — extended from 208 to 314 lines

**`DaemonDeps` change:**
```typescript
readonly shareSync?: ShareSyncRegistry | null;   // Phase 16 — null until libp2p starts
```

**`runOneTick` change:** After the existing room-ingest chain, a new `.andThen` step conditionally calls `runShareSyncTick`:
```typescript
.andThen((tickResult) => {
  if (!deps.shareSync) return okAsync(tickResult);
  return runShareSyncTick(deps.shareSync)
    .map(sync => { daemonLog(...); return tickResult; })
    .orElse(e => { daemonLog(...); return okAsync(tickResult); });
});
```
Sync failures are logged and never crash the daemon — ingest continues regardless.

**`startLoop` libp2p bootstrap (gated on `peer-identity.json`):**

| Step | Action |
|------|--------|
| 1 | `existsSync(identityPath)` — if absent, skip entirely (zero network footprint) |
| 2 | `loadConfig` → `loadOrCreateIdentity` → `createNode({ listenPort: 0, listenHost: '127.0.0.1' })` |
| 3 | `loadPeers` + best-effort `dialAndTag` for each known peer addr |
| 4 | `createShareSyncRegistry` + `registerShareProtocol` |
| 5 | `liveSync` spliced into `tickDeps` via `{ ...deps, shareSync: liveSync }` |

**Cleanup ordering on SIGTERM/SIGINT:**
1. `unregisterShareProtocol(liveSync)` — closes all active streams + cancels debounce timers
2. `liveNode.stop()` — shuts down libp2p
3. `removePid(deps.homePath)` — clears the PID file
4. `daemonLog(...)` + `process.exit(0)`

Exactly **one** SIGTERM handler and **one** SIGINT handler registered.

---

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS — EXIT:0 |
| `npm run build` | PASS — EXIT:0 |
| `npm test` | PASS — 87/87, 0 failures |
| `grep -c "case 'room':" share.ts` | 1 |
| `grep -c "case 'audit':" share.ts` | 1 (no regression) |
| `grep -c "mutateSharedRooms" share.ts` | 2 |
| `grep -c "addSharedRoom" share.ts` | 2 |
| `grep -c "share room: BLOCKED" share.ts` | 1 |
| `grep -c "syncNodeIntoYDoc" share.ts` | 4 |
| `grep -c "loadYDoc" share.ts` | 2 |
| `grep -c "saveYDoc" share.ts` | 3 |
| `grep -nE "@ts-ignore\|as any" share.ts` | NONE |
| `grep -c "export const unshare" unshare.ts` | 1 |
| `grep -c "removeSharedRoom" unshare.ts` | 2 |
| `grep -nE "rmSync\|unlink" unshare.ts` | NONE (.ydoc never deleted) |
| `grep -c "import { unshare }" index.ts` | 1 |
| `grep -c "unshare," index.ts` | 1 |
| `wc -l unshare.ts` | 61 (>60 min) |
| `grep -c "runShareSyncTick" loop.ts` | 2 |
| `grep -c "registerShareProtocol" loop.ts` | 4 |
| `grep -c "unregisterShareProtocol" loop.ts` | 2 |
| `grep -c "createShareSyncRegistry" loop.ts` | 2 |
| `grep -c "shareSync" loop.ts` | 4 |
| `grep -c "shareSync\?:" loop.ts` | 1 |
| `grep -c "ShareSyncRegistry" loop.ts` | 5 |
| `grep -c "loadOrCreateIdentity" loop.ts` | 2 |
| `grep -c "loadPeers" loop.ts` | 2 |
| `grep -c "dialAndTag" loop.ts` | 2 |
| `grep -c "process.on('SIGTERM'" loop.ts` | 1 (exactly one) |
| `grep -c "process.on('SIGINT'" loop.ts` | 1 (exactly one) |
| `grep -nE "@ts-ignore\|as any" loop.ts` | NONE |
| `grep -c "closeUnsharedStreams" share-sync.ts` | 4 (declaration + invocation + 2 uses) |

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] syncNodeIntoYDoc accepts GraphNode, not ShareableNode**
- **Found during:** Task 1 implementation
- **Issue:** The plan's code snippet showed `syncNodeIntoYDoc(ydoc, shareable, patterns)` passing a `ShareableNode` with 3 args; the actual 16-02 implementation signature is `(doc, node: GraphNode, patterns, logPath, ownPeerId, room): ResultAsync<void, ShareError>`
- **Fix:** Used `auditRes.allowed.map(s => s.id)` to build an allowed-ID set, then filtered the original `roomNodes` array to get the full `GraphNode` objects, passing all 6 required args (`logPath`, `'local'` as ownPeerId, `roomId`)
- **Files modified:** `src/cli/commands/share.ts`
- **Commit:** 8e2807f

**2. [Rule 1 - Bug] Variable shadowing: `audit` function vs audit result variable**
- **Found during:** Task 1 — naming `const audit = auditRoom(...)` would shadow the existing `const audit = async (...) =>` function
- **Fix:** Named the result `auditRes` throughout `roomCmd`; semantics unchanged
- **Files modified:** `src/cli/commands/share.ts`
- **Commit:** 8e2807f

**3. [Rule 1 - Deviation] `liveNode.stop()` vs `node.stop()` in acceptance criterion**
- **Found during:** Task 3 — the plan's grep criterion checks `grep -c "node.stop()" loop.ts` but the local variable is correctly named `liveNode`
- **Fix:** Code uses `liveNode.stop()` which is the semantically correct form; the grep criterion's literal string does not match but the intent (cleanup on shutdown) is fully satisfied
- **Files modified:** `src/daemon/loop.ts`
- **Commit:** 9b1e12e

---

## Commits

| Hash | Task | Description |
|------|------|-------------|
| `8e2807f` | Task 1 | feat(16-03): add 'share room <name>' subcommand with audit gate + Y.Doc seeding |
| `95dba6f` | Task 2 | feat(16-03): add 'akashik unshare <name>' command + register in CLI router |
| `9b1e12e` | Task 3 | feat(16-03): hook runShareSyncTick into daemon loop + libp2p bootstrap on identity presence |

---

## Self-Check: PASSED
