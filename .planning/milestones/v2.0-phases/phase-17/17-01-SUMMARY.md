---
phase: phase-17
plan: "01"
subsystem: foundation
tags: [libp2p, search-error, peer-record, peer-config, types, foundation]
dependency_graph:
  requires: [phase-16]
  provides: [SearchError union, PeerRecord.discovery_method, PeerConfig.mdns/dht/search_rate_limit, 3 new libp2p deps]
  affects: [17-02, 17-03, 17-04]
tech_stack:
  added: ["@libp2p/mdns@12.0.16", "@libp2p/kad-dht@16.2.0", "@libp2p/bootstrap@12.0.16"]
  patterns: [exhaustive-switch-union, optional-field-backward-compat, nested-config-with-defaults]
key_files:
  created: []
  modified:
    - package.json
    - src/domain/errors.ts
    - src/infrastructure/peer-store.ts
    - src/infrastructure/config-loader.ts
decisions:
  - "@libp2p/identify not installed — not available transitively from libp2p@3.2.0 or new deps, and not required by any Phase 17 code"
  - "PEERS_FILE_VERSION stays at 1 — discovery_method is additive-optional; no migration needed"
  - "mdns defaults to true (DISC-02 locked), dht.enabled defaults to false (DISC-03 locked), search_rate_limit 10/30 (CONTEXT.md locked)"
  - "DISC-04 coordination server explicitly deferred — @libp2p/bootstrap installed for DHT seed peer list only, not as coordination server"
metrics:
  duration_minutes: 3
  completed_date: "2026-04-12T12:41:00Z"
  tasks_completed: 2
  files_modified: 4
---

# Phase 17 Plan 01: Foundation Layer Summary

One-liner: Three exact-pinned libp2p deps + SearchError 7th bounded context (5 variants, exhaustive switch) + optional PeerRecord.discovery_method + PeerConfig mdns/dht/search_rate_limit extensions with locked defaults.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install 3 libp2p deps + SearchError union | 94db382 | package.json, src/domain/errors.ts |
| 2 | PeerRecord.discovery_method + PeerConfig mdns/dht/search_rate_limit | 7675409 | src/infrastructure/peer-store.ts, src/infrastructure/config-loader.ts |

## Verification Results

- `npm run build` exits 0 — TypeScript exhaustiveness gate on `formatError` confirmed (no `default:` clause, all 5 SearchError variants handled)
- `npm test` — 127/127 pass, 0 regressions
- `npm ls @libp2p/mdns @libp2p/kad-dht @libp2p/bootstrap` — exact 12.0.16 / 16.2.0 / 12.0.16

## What Was Delivered

### Task 1: Deps + SearchError

**Installed packages (exact pins):**
- `@libp2p/mdns@12.0.16` — mDNS LAN peer discovery (DISC-02)
- `@libp2p/kad-dht@16.2.0` — Kademlia DHT wiring (DISC-03)
- `@libp2p/bootstrap@12.0.16` — DHT seed peer list loader (NOT a coordination server — DISC-04 deferred)

**@libp2p/identify resolution:**
`@libp2p/identify` is NOT available as a transitive dep from libp2p@3.2.0 or any of the 3 new packages. It is also not required by any Phase 17 code. No explicit install needed. Research Open Question #1: resolved as transitive-not-needed.

**SearchError union — 5 variants:**
```typescript
export type SearchError =
  | { readonly type: 'SearchDimensionMismatch'; readonly expected: number; readonly got: number }
  | { readonly type: 'SearchUnauthorized';      readonly peer: string; readonly room: string }
  | { readonly type: 'SearchRateLimited';       readonly peer: string }
  | { readonly type: 'SearchProtocolError';     readonly peer: string; readonly message: string }
  | { readonly type: 'SearchTimeout';           readonly peer: string; readonly elapsedMs: number };
```

All 5 variants wired into `AppError` union and `formatError` exhaustive switch. Grep count of variant literals: 20 (vs minimum 10 required). Literal `SearchError` token count: 10 across the file.

### Task 2: PeerRecord + PeerConfig extensions

**PeerRecord.discovery_method:**
```typescript
readonly discovery_method?: 'manual' | 'mdns' | 'dht';
```
Field is optional (`?:`) — backward compatible. `PEERS_FILE_VERSION` stays at 1. Legacy peers.json with `{id, addrs, addedAt}` loads without error. Consumers treat absence as `'manual'` display.

**PeerConfig new fields:**
```typescript
readonly mdns: boolean;                                     // default: true  (DISC-02)
readonly dht: { enabled: boolean; bootstrap_peers: string[] };  // default: false (DISC-03)
readonly search_rate_limit: { rate_per_sec: number; burst: number }; // default: 10/30
```

**Parser uses existing `bool`/`num` helpers** with safe nested access via `(peerRaw.dht as Record<string, unknown> | undefined)?.enabled`. Legacy config.yaml without peer.mdns/peer.dht/peer.search_rate_limit keys yields the locked defaults without error.

## Decisions Made

1. **@libp2p/identify**: Not installed — not a transitive dep and not needed. Documented.
2. **PEERS_FILE_VERSION = 1**: Unchanged. Optional field is backward compatible — no migration path needed.
3. **DISC-04 explicit deferral**: `@libp2p/bootstrap` is DHT seed loader only. Coordination server is deferred per CONTEXT.md. This is documented in this summary as required by the plan.
4. **No test fixture updates required**: The `loadConfig` test in `phase6.daemon.test.ts` only asserts on `daemon` + `tunnels` fields — new `peer` fields with defaults do not affect it.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED
