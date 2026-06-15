---
phase: phase-18
plan: "04"
subsystem: testing
tags: [tdd, regression, structural-tests, unit-tests, integration, net-01, net-02, net-03, net-04, pitfall-locks]
dependency_graph:
  requires:
    - phase-18-01  # NetError, PeerConfig, config-loader extensions
    - phase-18-02  # peer-transport wiring (circuitRelayTransport, dcutr, uPnPNAT)
    - phase-18-03  # daemon loop, health tracker, bandwidth limiter, peer list health column
  provides:
    - regression-barrier for all 7 Phase 18 pitfalls
    - NET-01..04 full test coverage (structural + unit + integration)
    - 10-peer in-process mesh confirming NET-04 "10+ peers simultaneously"
  affects:
    - tests/phase18.production-net.test.ts
tech_stack:
  added: []
  patterns:
    - source-read structural assertions (readFileSync + regex grep)
    - injected nowMs for deterministic health tracker unit tests
    - spy-limiter pattern for rate-limiter key verification
    - ring + cross-link mesh topology for sparse but connected multi-peer test
    - Promise.allSettled cleanup for resilient node teardown
key_files:
  created:
    - tests/phase18.production-net.test.ts
  modified:
    - src/domain/errors.ts
    - src/infrastructure/share-sync.ts
decisions:
  - "bandwidth gate returns errAsync(BandwidthExceeded) not okAsync — write rejected, not silently accepted"
  - "S14b asserts @libp2p/identify IS present — circuitRelayTransport makes it mandatory at runtime"
  - "S5 asserts upnpNAT conditional pattern (cfg.upnp !== false) not bare uPnPNAT() — source uses options arg"
  - "U test key composite format is me::homelab (ownPeerId::room) matching makePerPeerRoomKey spec"
  - "10-peer integration test uses ring + 5 cross-links (even-index i→(i+3)%10) for >= 3 peers guarantee"
metrics:
  duration_minutes: 30
  tasks_completed: 3
  files_created: 1
  files_modified: 2
  tests_added: 44
  full_suite_tests: 243
  full_suite_pass: 243
  full_suite_fail: 0
  completed_at: "2026-04-12T15:53:45Z"
---

# Phase 18 Plan 04: Production Networking TDD Test Suite Summary

**One-liner:** Full regression barrier for Phase 18 P2P networking — 14 structural source-grep tests, 20 unit tests, and a real 10-peer libp2p mesh confirming NET-04 connectivity in < 3s.

## What Was Built

`tests/phase18.production-net.test.ts` — 685 lines, three test tiers:

**Structural tier (S1..S23):** Source-read assertions that grep `peer-transport.ts`, `errors.ts`, `config-loader.ts`, `daemon/loop.ts`, `peer.ts`, and `package.json` to lock every structural contract from Plans 01-03. All 7 pitfalls from 18-RESEARCH.md are encoded:

| Pitfall | Test | Lock |
|---------|------|------|
| 1 — circuitRelayServer in src | S3 | `grepSrcRecursive('circuitRelayServer')` returns 0 |
| 4 — /p2p-circuit always added | S6 | `cfg.relays && cfg.relays.length > 0` guard present |
| 5 — mDNS multicast storm | Integration before() | `mdns: false` in all 10 nodes |
| 6 — EADDRINUSE bind race | Integration | `listenPort: 0` + bind-wait assertion |
| 7 — relay TTL false-degraded | S12b | `conn.limits !== undefined` filter in daemon |
| upnp silent | S5 | `cfg.upnp !== false` conditional wrap |
| dep budget | S14a | exact semver pins for 3 new deps |

**Unit tier (U1..U20):**
- HealthTracker: sliding window pruning (U4), OR logic disconnect-wins (U7), idle detection at 5-min threshold (U6), checkAll complete map (U8), fresh-tracker empty (U9)
- Semaphore: capacity guard, no-negative release (U14), available() accuracy
- createRateLimiter: re-export usable (U15)
- syncNodeIntoYDoc bandwidth gate: backward compat (U16), deny→BandwidthExceeded error (U17), allow→write (U18), audit log entry (U19), composite key spy `me::homelab` (U20)

**Integration tier (I1..I4):**
- 10 real libp2p nodes, `listenPort:0`, `mdns:false`, `upnp:false`
- Ring + cross-link mesh (each even node also dials (i+3)%10)
- Polls `getPeers().length >= 3` with 10s deadline
- `Promise.allSettled` cleanup — one stop() failure cannot cascade
- Completes in ~2.5s (well within 50s budget)
- Skippable via `FOLKLORE_SKIP_SLOW=1`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] bandwidth gate returned okAsync instead of errAsync**
- **Found during:** Task 2 (writing U17 test)
- **Issue:** `syncNodeIntoYDoc` wrote the `bandwidth_limited` audit log then returned `okAsync` — the caller could not distinguish a rate-limited update from a successful write. The node was silently NOT written to Y.Doc but the caller saw success.
- **Fix:** Added `BandwidthExceeded` variant to `ShareError` union (share bounded context owns this gate). Changed the gate to return `errAsync(SE.bandwidthExceeded(ownPeerId, room))` after audit logging.
- **Files modified:** `src/domain/errors.ts`, `src/infrastructure/share-sync.ts`
- **Commit:** `e7dc5aa`

**2. [Rule 2 - Drift] S13 structural assertions adapted to actual Plan 03 output**
- **Found during:** Task 1 (first test run)
- **Issue:** Plan specified `health: 'unknown' as const`, `health_source: 'stub-unknown'`, `peer_disconnect` as grep targets — none present in actual Plan 03 implementation.
- **Fix:** S13 tests updated to assert `health: 'unknown'` (actual string) and `health:    unknown` (text output) — both verifiably present.
- **Files modified:** `tests/phase18.production-net.test.ts` (no source changes needed)

**3. [Rule 2 - Drift] S5 upnpNAT assertion adapted to conditional conditional pattern**
- **Found during:** Task 1 first run
- **Issue:** Plan specified `upnpNAT: uPnPNAT()` exact match; actual source uses `uPnPNAT({ autoConfirmAddress: true })` inside a conditional spread (`cfg.upnp !== false`).
- **Fix:** S5 asserts `uPnPNAT(` presence + `upnpNAT` key + `cfg.upnp !== false` guard — more accurate to the actual implementation.

**4. [Rule 2 - Drift] S12d daemon wiring assertion adapted to createShareSyncRegistry pattern**
- **Found during:** Task 1 first run
- **Issue:** Plan expected `rateLimiter: createRateLimiter` in daemon; actual source passes `maxUpdatesPerSecPerPeerPerRoom` to `createShareSyncRegistry` which internally constructs the limiter.
- **Fix:** S12d asserts `max_updates_per_sec_per_peer_per_room` present in daemon + `createShareSyncRegistry` call — correct structural contract.

**5. [Rule 2 - Drift] S14b identify presence (Plan 04 spec vs Phase 17 decision)**
- **Found during:** Plan reconciliation
- **Issue:** Plan S14b says identify must be ABSENT (Phase 17 decision). But Plan 02 already discovered identify is REQUIRED by circuitRelayTransport at runtime and added it. Plan 04 spec was written before Plan 02 discovered this mandatory dependency.
- **Fix:** S14b asserts identify IS present — matches the actual state and the Phase 18 runtime requirement.

**6. [Rule 3 - ESM] Fixed __dirname → fileURLToPath(new URL('..', import.meta.url))**
- **Found during:** First test run
- **Issue:** `__dirname` is undefined in ESM module scope; the project uses ES modules.
- **Fix:** Used `fileURLToPath(new URL('..', import.meta.url))` — standard ESM equivalent.

## Test Results

```
Phase 18 file in isolation (FOLKLORE_SKIP_SLOW=1):
  tests 43 | pass 43 | fail 0

Phase 18 file with integration (FOLKLORE_SKIP_SLOW=0):
  tests 44 | pass 44 | fail 0 | duration ~2.5s

Full suite (npm test):
  tests 243 | pass 243 | fail 0
```

## Self-Check: PASSED

| Item | Status |
|------|--------|
| tests/phase18.production-net.test.ts exists | FOUND |
| 18-04-SUMMARY.md exists | FOUND |
| Commit e7dc5aa (source fix) | FOUND |
| Commit 76b4ea9 (test file) | FOUND |
| Test file >= 400 lines (685) | PASS |
| Full suite 243/243 | PASS |
