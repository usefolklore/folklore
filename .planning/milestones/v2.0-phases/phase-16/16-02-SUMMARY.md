---
phase: phase-16
plan: "02"
subsystem: share-sync
tags: [libp2p, yjs, y-protocols, crdt, sync, sharing, p2p, secrets-scan]
dependency_graph:
  requires:
    - 16-01  # ydoc-store, share-store, ShareError types
    - src/infrastructure/peer-transport.ts  # Libp2p node type
    - src/domain/sharing.ts  # buildPatterns, scanNode, ShareableNode
    - src/domain/graph.ts    # upsertNode, GraphNode, Graph
    - src/domain/errors.ts   # ShareError, formatError
    - src/infrastructure/graph-repository.ts  # GraphRepository port
  provides:
    - registerShareProtocol   # /folklore/share/1.0.0 on libp2p node
    - openShareStream         # outbound (peer, room) stream dial
    - closeUnsharedStreams     # enforces unshare semantics on each tick
    - syncNodeIntoYDoc        # outbound secrets gate
    - runShareSyncTick        # daemon entrypoint returning { opened }
    - ShareSyncRegistry       # factory + interface for registry object
    - REMOTE_ORIGIN           # exported Symbol for test assertions
    - SHARE_PROTOCOL_ID       # '/folklore/share/1.0.0'
  affects:
    - 16-03  # daemon wiring + CLI consumes all exports from this file
tech_stack:
  added:
    - it-length-prefixed (already transitive — used for framing, NOT it-length-prefixed-stream)
    - uint8arraylist (already transitive — Uint8ArrayList from lp.decode)
  patterns:
    - FramedStream abstraction wrapping libp2p Stream via lp.encode/lp.decode
    - REMOTE_ORIGIN Symbol echo-loop prevention (Pitfall 1 from RESEARCH.md)
    - Debounced Y.Map observer flushing graph.json at 150ms
    - Per-(peer, room) stream registry Map<string, StreamEntry>
    - Symmetric inbound/outbound secrets scanning via scanNode
    - closeUnsharedStreams called first on every daemon tick
key_files:
  created:
    - src/infrastructure/share-sync.ts (727 lines)
  modified: []
decisions:
  - Used `it-length-prefixed` (lp.encode/lp.decode) directly on the libp2p
    Stream's AsyncIterable interface instead of `it-length-prefixed-stream`,
    which was not installed as a transitive dep. The plan referenced
    `lpStream` from that package; the substitute is functionally identical
    since lp.decode(stream) accepts any AsyncIterable<Uint8Array | Uint8ArrayList>.
  - StreamHandler signature `(stream, connection)` — not `({ stream, connection })`.
    The libp2p @libp2p/interface StreamHandler type uses positional args, not
    a destructured object. Fixed to match the actual type.
  - FramedStream interface defined internally to abstract write/frameIter/close
    over the raw Stream, keeping y-protocols logic independent of framing details.
metrics:
  duration_seconds: 584
  completed_at: "2026-04-12T10:37:56Z"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
  commits: 1
---

# Phase 16 Plan 02: Share Sync Engine Summary

**One-liner:** libp2p y-protocols V1 sync over `/folklore/share/1.0.0` with REMOTE_ORIGIN echo prevention, symmetric secrets scanning via scanNode, and debounced graph.json flush.

## What Was Built

`src/infrastructure/share-sync.ts` (727 lines) is the central sync engine for Phase 16. It:

1. Registers `/folklore/share/1.0.0` on a libp2p node via `node.handle()` (the `StreamHandler` signature takes `(stream, connection)` as positional args)
2. Manages a per-(peer, room) stream registry: `Map<"${peerId}::${room}", StreamEntry>`
3. Exchanges `SubscribeRequest` JSON frames (first frame on each stream) to negotiate room intersection
4. Runs y-protocols sync step 1 + 2 (state vector exchange) and then loops on incoming frames
5. Scans every outbound node via `scanNode` (before writing to the Y.Map) and every inbound node (before flushing to graph.json)
6. Debounces graph.json writes via a 150ms Y.Map observer

## Critical Invariants Enforced

| Invariant | Location |
|-----------|----------|
| REMOTE_ORIGIN echo prevention | `attachOutboundObserver`: `if (origin === REMOTE_ORIGIN) return` |
| REMOTE_ORIGIN passed to readSyncMessage | `handleInboundFrame`: 4th arg to `syncProtocol.readSyncMessage` |
| Empty-response guard | `handleInboundFrame`: `if (encoding.length(responseEncoder) > 0)` |
| Uint8ArrayList → Uint8Array | `makeFramedStream.frameIter`: `yield msg.subarray()` |
| V1-only encoding | No `encodeStateAsUpdateV2`, `applyUpdateV2`, or `'updateV2'` anywhere |
| Outbound secrets scan | `syncNodeIntoYDoc`: `scanNode` before `doc.transact()` |
| Inbound secrets scan | `attachInboundObserver` handler: `scanNode` before debounced flush |
| closeUnsharedStreams first | `runShareSyncTick`: called before any `openShareStream` |
| Debounce timer cleanup | `unregisterShareProtocol`: `entry.cancelDebounce()` for each entry |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `it-length-prefixed-stream` not installed as transitive dep**
- **Found during:** Task 1, first `tsc --noEmit` run
- **Issue:** The plan specified `import { lpStream } from 'it-length-prefixed-stream'` but that package was not present in `node_modules` — only `it-length-prefixed` (the lower-level encode/decode functions) was available
- **Fix:** Replaced `lpStream` abstraction with a `FramedStream` interface using `lp.encode`/`lp.decode` directly on the libp2p Stream's AsyncIterable. The libp2p `Stream` IS an `AsyncIterable<Uint8Array | Uint8ArrayList>`, so `lp.decode(stream)` works directly. Semantics are identical.
- **Files modified:** `src/infrastructure/share-sync.ts` (never had the wrong import committed)
- **Commit:** 58cbb3e

**2. [Rule 1 - Bug] StreamHandler positional signature mismatch**
- **Found during:** Task 1, second `tsc --noEmit` run  
- **Issue:** Plan had `async ({ stream, connection }) => {}` (destructured object) but `@libp2p/interface` `StreamHandler` is `(stream: Stream, connection: Connection) => void | Promise<void>` (positional args)
- **Fix:** Changed to `async (stream: Stream, connection: Connection) => {}` matching the actual type
- **Files modified:** `src/infrastructure/share-sync.ts`
- **Commit:** 58cbb3e

## Test Results

```
tests: 87
pass:  87
fail:  0
```

No regressions. All pre-existing 87 tests continue to pass.

## Self-Check

```
[ ] src/infrastructure/share-sync.ts — 727 lines — FOUND
[ ] commit 58cbb3e — FOUND
[ ] REMOTE_ORIGIN count ≥ 4 — 8 occurrences — PASS
[ ] Symbol('folklore-share-remote') — 1 — PASS
[ ] if (origin === REMOTE_ORIGIN) return — 2 — PASS
[ ] encoding.length(responseEncoder) > 0 — 1 — PASS
[ ] .subarray() — 5 occurrences — PASS
[ ] scanNode calls ≥ 2 — 4 — PASS
[ ] export const closeUnsharedStreams — 1 — PASS
[ ] export const syncNodeIntoYDoc — 1 — PASS
[ ] export const runShareSyncTick — 1 — PASS
[ ] opened: — 3 — PASS
[ ] No encodeStateAsUpdateV2/applyUpdateV2/updateV2 — comment-only match — PASS
[ ] npx tsc --noEmit — EXIT:0 — PASS
[ ] npm test — 87/87 pass — PASS
```

## Self-Check: PASSED
