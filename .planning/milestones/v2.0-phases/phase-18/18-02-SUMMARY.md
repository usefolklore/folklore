---
phase: phase-18
plan: "02"
subsystem: infrastructure
tags: [libp2p, nat-traversal, circuit-relay, dcutr, upnp, bandwidth, connection-health]
dependency_graph:
  requires: [phase-18-01]
  provides: [bandwidth-limiter, connection-health, createNode-NAT-wiring]
  affects: [peer-transport, share-sync, search-sync, daemon]
tech_stack:
  added:
    - "@libp2p/circuit-relay-v2@4.2.0 — circuitRelayTransport() in transports[]"
    - "@libp2p/dcutr@3.0.15 — dcutr() in services{}"
    - "@libp2p/upnp-nat@4.0.15 — uPnPNAT(autoConfirmAddress:true) in services{}"
    - "@libp2p/identify@4.1.0 — required by circuitRelayTransport RelayDiscovery"
  patterns:
    - "Semaphore primitive via closure counter (Pattern 5, 18-RESEARCH.md)"
    - "Token bucket re-export — single source of truth from search-sync.ts"
    - "In-memory sliding-window health tracker with deterministic nowMs injection"
    - "Conditional /p2p-circuit listen — only when cfg.relays is non-empty"
key_files:
  created:
    - src/infrastructure/bandwidth-limiter.ts
    - src/infrastructure/connection-health.ts
  modified:
    - src/infrastructure/peer-transport.ts
    - tests/phase17.discovery.test.ts
    - package.json
    - package-lock.json
decisions:
  - "autoConfirmAddress:true on uPnPNAT to bypass @libp2p/autonat serviceDependency"
  - "identify() added to services — circuitRelayTransport RelayDiscovery unconditionally requires it"
  - "D7 test assertion updated: identify IS imported because circuitRelayTransport mandates it"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-12"
  tasks: 3
  files_created: 2
  files_modified: 4
  tests: "199 pass, 0 fail"
---

# Phase 18 Plan 02: Infrastructure — Bandwidth Limiter, Connection Health, NAT Wiring Summary

## One-liner

Semaphore + HealthTracker primitives shipped; `createNode` wired with `circuitRelayTransport` + `dcutr` + `uPnPNAT` + `identify` for production NAT traversal.

## What Was Built

### Task 1 — `src/infrastructure/bandwidth-limiter.ts` (45 lines, NEW)

Pure primitives module with no libp2p imports:

- `Semaphore` interface + `createSemaphore(maxConcurrent)` factory — closure-based counter with `tryAcquire() → boolean`, `release()` (defensive no-negative), `available() → number`
- Re-exports `createRateLimiter` and `RateLimiter` from `./search-sync.js` — single source of truth, no duplication

### Task 2 — `src/infrastructure/connection-health.ts` (120 lines, NEW)

Pure in-memory state container, no file I/O, no libp2p imports:

- `PeerHealth` and `HealthTracker` interfaces
- `createHealthTracker()` factory — `Map<string, MutableState>` with sliding-window disconnect tracking
- Degraded heuristic (locked): 3+ disconnects in 60s window OR no stream in 5 minutes
- All methods accept optional `nowMs` for deterministic test injection
- `checkAll()` returns `ReadonlyMap<string, PeerHealth>` snapshot

### Task 3 — `src/infrastructure/peer-transport.ts` (MODIFIED)

Four structural changes:

1. Added 4 imports: `circuitRelayTransport`, `dcutr`, `uPnPNAT`, `identify`
2. Extended `TransportConfig` with `relays?: readonly string[]` and `upnp?: boolean`
3. Rewrote services block: DHT (conditional) + `identify()` + `dcutr()` + `uPnPNAT({ autoConfirmAddress: true })` (conditional on `cfg.upnp !== false`)
4. Rewrote addresses.listen: conditional `/p2p-circuit` only when `cfg.relays && cfg.relays.length > 0`

## Acceptance Criteria Verification

| Check | Result |
|-------|--------|
| `grep -c "circuitRelayServer" peer-transport.ts` | 0 (Pitfall 1 locked) |
| `grep -c "export const createRateLimiter = " bandwidth-limiter.ts` | 0 (re-export only) |
| `grep -c "@libp2p/" bandwidth-limiter.ts` | 0 (pure primitives) |
| `grep -c "@libp2p/" connection-health.ts` | 0 (pure primitives) |
| `grep -c "readFile\|writeFile" connection-health.ts` | 0 (no file I/O) |
| `grep -c "transports: [tcp(), circuitRelayTransport()]"` | 1 |
| `grep -c "dcutr: dcutr()"` | 1 |
| `grep -c "upnpNAT: uPnPNAT"` | 1 |
| `grep -c "streamMuxers: [yamux()]"` | 1 (NET-01 preserved) |
| `grep -c "'/p2p-circuit'"` | 1 (conditional) |
| `grep -c "cfg.relays && cfg.relays.length > 0"` | 1 |
| `grep -c "cfg.upnp !== false"` | 1 |
| `npx tsc --noEmit` | exit 0 |
| `npm test` | 199/199 pass |
| Runtime smoke (node start/stop + semaphore + health) | ok |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `@libp2p/identify` required by `circuitRelayTransport` at runtime**

- **Found during:** Task 3 runtime smoke
- **Issue:** `circuitRelayTransport`'s `RelayDiscovery` is always initialized in the constructor (no init option to disable it), and it unconditionally registers `'@libp2p/identify'` as a `serviceDependency` via the getter at `dist/src/transport/index.js:75-83`. The research summary (18-RESEARCH.md line 72) stated identify was not required, but the actual installed source proves otherwise.
- **Fix:** Installed `@libp2p/identify@4.1.0` and added `identify: identify()` to the services block. Updated the Phase 17 D7 test assertion which hard-coded "identify must NOT be in imports" — that assertion was correct for Phase 17 (only TCP/mDNS/DHT wired) but is superseded by Phase 18's circuitRelayTransport requirement. The two still-valid assertions (clientMode:true present, Pitfall 4 comment present) are preserved.
- **Files modified:** `src/infrastructure/peer-transport.ts`, `package.json`, `package-lock.json`, `tests/phase17.discovery.test.ts`
- **Commits:** 48d30c0

**2. [Rule 3 - Blocking] `uPnPNAT` requires `@libp2p/autonat` unless `autoConfirmAddress: true`**

- **Found during:** Task 3 runtime smoke (second attempt, after identify was added)
- **Issue:** `uPnPNAT()`'s `serviceDependencies` getter returns `['@libp2p/autonat']` when `autoConfirmAddress` is false (the default). `@libp2p/autonat` is not installed and was not in the plan.
- **Fix:** Pass `{ autoConfirmAddress: true }` to `uPnPNAT()`. This tells the service the UPnP-mapped address is authoritative — no second autonat verification round-trip needed. Correct semantics for the Phase 18 use case (we trust our own UPnP mapping).
- **Files modified:** `src/infrastructure/peer-transport.ts`
- **Commit:** 48d30c0

## Confirmation Statements

- `circuitRelayServer` is NEVER referenced anywhere in `peer-transport.ts` (grep count = 0)
- `yamux()` stream muxer is still wired as the sole `streamMuxers` entry (NET-01 preserved)
- `bandwidth-limiter.ts` re-exports (does NOT re-implement) `createRateLimiter` from `search-sync.ts`
- `connection-health.ts` has zero file I/O calls and zero libp2p imports
- Real libp2p node started and stopped cleanly with all three new services composed

## Commits

| Hash | Message |
|------|---------|
| 867f7d6 | feat(phase-18-02): create bandwidth-limiter.ts — Semaphore + re-exported token bucket |
| 4eb2526 | feat(phase-18-02): create connection-health.ts — in-memory HealthTracker for NET-04 |
| 48d30c0 | feat(phase-18-02): wire circuitRelayTransport + dcutr + uPnPNAT into createNode (NET-03) |

## Self-Check: PASSED

- `src/infrastructure/bandwidth-limiter.ts` — exists, 45 lines
- `src/infrastructure/connection-health.ts` — exists, 120 lines
- Commits 867f7d6, 4eb2526, 48d30c0 — all present in git log
- `npm test` — 199 pass, 0 fail
