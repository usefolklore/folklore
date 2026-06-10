---
phase: phase-18
plan: "03"
subsystem: infrastructure
tags: [libp2p, bandwidth, connection-health, share-sync, daemon, peer-list]
dependency_graph:
  requires: [phase-18-02]
  provides: [share-sync-bandwidth-gate, daemon-health-listener, daemon-relay-predial, peer-list-health-column]
  affects: [share-sync, daemon/loop, peer-transport, cli/peer]
tech_stack:
  added: []
  patterns:
    - "Per-peer-per-room rate limiter keyed by makePerPeerRoomKey (peerId::room)"
    - "Pitfall 7 filter: conn.limits !== undefined skips recordDisconnect for relay TTL"
    - "Optional limiter param preserves backward-compat (no-op when absent)"
    - "Outer-scope liveHealthTracker + inner non-null alias for closure safety"
key_files:
  created: []
  modified:
    - src/infrastructure/bandwidth-limiter.ts
    - src/infrastructure/share-sync.ts
    - src/daemon/loop.ts
    - src/cli/commands/peer.ts
decisions:
  - "health: 'unknown' in CLI (Phase 18); live value deferred to Phase 19+ daemon IPC/MCP"
  - "makePerPeerRoomKey added to bandwidth-limiter.ts (matches stream registry key convention)"
  - "Relay pre-dial is best-effort: failures logged, never crash daemon"
  - "Bandwidth gate runs before secrets scan (fail fast on rate limit)"
  - "burst = rate for share limiter (single-config simplicity; power users tune max_updates_per_sec)"
metrics:
  duration: "~4 minutes"
  completed: "2026-04-12"
  tasks: 3
  files_created: 0
  files_modified: 4
  tests: "199 pass, 0 fail"
---

# Phase 18 Plan 03: Integration — Bandwidth Gate, Health Listener, Relay Pre-dial, Health Column Summary

## One-liner

Wave 2 primitives wired into the production path: per-peer-per-room bandwidth gate in share-sync, connection:close listener with relay TTL filter in daemon, relay pre-dial on bootstrap, and health column in peer list.

## What Was Built

### Task 1 — `src/infrastructure/bandwidth-limiter.ts` + `src/infrastructure/share-sync.ts`

**bandwidth-limiter.ts:**
- Added `makePerPeerRoomKey(peerId, room): string` — canonical `${peerId}::${room}` key, consistent with the stream registry convention used throughout share-sync.

**share-sync.ts:**
- Imported `createRateLimiter`, `makePerPeerRoomKey`, `RateLimiter` from `./bandwidth-limiter.js`
- `ShareLogEntry.action` extended to allow `'bandwidth_limited'`
- `ShareSyncRegistry` gains optional `limiter?: RateLimiter` — absent = no-op (backward-compat)
- `createShareSyncRegistry` accepts `maxUpdatesPerSecPerPeerPerRoom?: number`; when provided, creates `createRateLimiter(rate, rate)` and stores it on the registry
- `syncNodeIntoYDoc` checks `limiter.consume(makePerPeerRoomKey(ownPeerId, room))` BEFORE the secrets scan; if `false`, logs `bandwidth_limited` to share-log.jsonl and returns `okAsync` (silent drop, never back-propagated)
- When no limiter is passed the function is identical to Phase 17 behaviour (backward-compat invariant preserved)

### Task 2 — `src/daemon/loop.ts`

Four additions inside the libp2p bootstrap block:

1. `HealthTracker` import from `connection-health.js`
2. `healthTracker?: HealthTracker | null` field on `DaemonDeps`
3. `liveHealthTracker: HealthTracker | null = null` declared at outer scope alongside `liveNode`
4. After `liveNode = nodeRes.value`:
   - `createHealthTracker()` assigned to `liveHealthTracker`; a non-null alias `healthTracker` captured for the listener closure
   - `connection:close` listener registered via `addEventListener`:
     - **Pitfall 7 guard:** `if (conn.limits !== undefined)` → log audit-only, `return` (no `recordDisconnect`)
     - Otherwise: `healthTracker.recordDisconnect(peerId)` + daemon log
   - Relay pre-dial loop: iterates `cfgRes.value.peer.relays`, calls `dialAndTag` per relay, logs success/failure; failures are non-fatal
5. `createShareSyncRegistry` call updated to pass `maxUpdatesPerSecPerPeerPerRoom` from config
6. `tickDeps` updated: `{ ...deps, shareSync: liveSync, healthTracker: liveHealthTracker }`

### Task 3 — `src/cli/commands/peer.ts`

- JSON path: `health: 'unknown'` field added to each peer object in `peer list --json` output
- Text path: `health:    unknown` line printed per peer in `peer list` text output
- Both paths document via comment that live health requires Phase 19+ daemon IPC/MCP

## Acceptance Criteria Verification

| Check | Result |
|-------|--------|
| `grep "bandwidth_limited" share-sync.ts` | 3 matches (action type, log entry ×2) |
| `grep "makePerPeerRoomKey" share-sync.ts` | 2 matches (import + usage) |
| `grep "conn\.limits" daemon/loop.ts` | 3 matches (comment + guard + comment) |
| `grep "health.json\|readFile\|writeFile" connection-health.ts` | comment only (no file I/O) |
| `grep "'unknown'" peer.ts` | 3 matches (JSON value + text + comment) |
| `npx tsc --noEmit` | exit 0 |
| `npm test` | 199/199 pass |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `createRateLimiter` requires 2 arguments (rate + burst)**

- **Found during:** Task 1 tsc check
- **Issue:** The plan said "import `createRateLimiter`" but did not specify the burst argument. `createRateLimiter(ratePerSec, burst)` in search-sync.ts requires both positional args; calling with one argument produced TS2554.
- **Fix:** Pass `burst = rate` (i.e. `createRateLimiter(rate, rate)`). This matches the semantic of the config field (`max_updates_per_sec_per_peer_per_room` sets both the sustained rate and the burst ceiling — conservative and consistent with the locked defaults).
- **Files modified:** `src/infrastructure/share-sync.ts`
- **Commit:** a95f6c8

**2. [Rule 2 - Auto-add] `liveHealthTracker` needed at outer scope for `tickDeps`**

- **Found during:** Task 2 implementation
- **Issue:** The plan said "store healthTracker reference in daemon deps" but the natural implementation `const liveHealthTracker = createHealthTracker()` inside the `else` block would not be accessible at the `tickDeps` assignment site.
- **Fix:** Declared `let liveHealthTracker: HealthTracker | null = null` at the same outer scope as `liveNode`/`liveSync`/`liveSearch`, then assigned (not declared) inside the block. Added a `const healthTracker = liveHealthTracker` alias immediately after assignment for use inside the event listener closure (avoids TS narrowing issues with mutable outer `let`).
- **Files modified:** `src/daemon/loop.ts`
- **Commit:** 347703d

## Commits

| Hash | Message |
|------|---------|
| a95f6c8 | feat(phase-18-03): bandwidth gate in share-sync outbound path (NET-02) |
| 347703d | feat(phase-18-03): connection:close listener + relay pre-dial in daemon (NET-04) |
| 3cedb6d | feat(phase-18-03): add health column to peer list output (text + JSON) |

## Self-Check: PASSED

- `src/infrastructure/bandwidth-limiter.ts` — modified (makePerPeerRoomKey added)
- `src/infrastructure/share-sync.ts` — modified (bandwidth gate in syncNodeIntoYDoc)
- `src/daemon/loop.ts` — modified (health listener + relay pre-dial)
- `src/cli/commands/peer.ts` — modified (health column)
- Commits a95f6c8, 347703d, 3cedb6d — all present in git log
- `npx tsc --noEmit` — exit 0
- `npm test` — 199 pass, 0 fail
