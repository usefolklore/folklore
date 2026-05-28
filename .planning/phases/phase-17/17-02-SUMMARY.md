---
phase: phase-17
plan: "02"
subsystem: federated-search
tags: [libp2p, mdns, kad-dht, peer-discovery, search-protocol, rate-limiter, federated-search, tunnels]
dependency_graph:
  requires: [phase-17-01]
  provides: [peer-transport mDNS/DHT wiring, SEARCH_PROTOCOL_ID, registerSearchProtocol, openSearchStream, runFederatedSearch, token-bucket-rate-limiter]
  affects: [17-03, 17-04]
tech_stack:
  added: []
  patterns: [promise-race-timeout-fan-out, token-bucket-rate-limiter-inline-eviction, framed-stream-copy-not-import, float32array-json-roundtrip, mdns-explicit-dial-not-auto]
key_files:
  created:
    - src/infrastructure/search-sync.ts
    - src/application/federated-search.ts
  modified:
    - src/infrastructure/peer-transport.ts
decisions:
  - "@libp2p/identify not installed — DHT runs clientMode:true without identify; routing-table population from identify is optional for client-mode (confirmed Phase 17-01)"
  - "FramedStream copied from share-sync.ts, NOT imported — search and share stream lifecycles are independent per CONTEXT.md locked decision"
  - "Fan-out uses Promise.all + Promise.race(2s timeout) per peer — NOT ResultAsync.combine which short-circuits on first error"
  - "Peer-only rows skipped in tunnel pass — raw vectors not transmitted on wire (SEC-03); documented functional subset, not a bug"
  - "openStream dep in FederatedSearchDeps is injectable for unit testability"
metrics:
  duration_minutes: 10
  completed_date: "2026-04-12T12:50:42Z"
  tasks_completed: 3
  files_modified: 3
---

# Phase 17 Plan 02: Protocol + Discovery Infrastructure Summary

One-liner: mDNS/DHT peer discovery wired with explicit dial handler + /akashik/search/1.0.0 protocol (framed JSON, token bucket rate limiter, room auth) + runFederatedSearch orchestrator with parallel 2s-timeout fan-out and findTunnels cross-room pass.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend peer-transport.ts with mDNS + kad-dht + peer:discovery handler | 2a8f4ba | src/infrastructure/peer-transport.ts |
| 2 | Create search-sync.ts — protocol handler, framing, rate limiter, openSearchStream | 83876eb | src/infrastructure/search-sync.ts |
| 3 | Create federated-search.ts — runFederatedSearch orchestrator + tunnel pass | 29a45a9 | src/application/federated-search.ts |

## Verification Results

- `npm run build` exits 0 — TypeScript strict mode, zero errors across all 3 files
- `npm test` — 127/127 pass, 0 regressions on Phase 15/16 suites
- All 7 pitfall patterns grep-verified present in code

## What Was Delivered

### Task 1: peer-transport.ts — mDNS + kad-dht + peer:discovery

**TransportConfig extended with:**
- `mdns?: boolean` — default `true` (DISC-02 locked)
- `dhtEnabled?: boolean` — default `false` (DISC-03 locked)
- `peersPath?: string` — required for peer:discovery persistence

**createNode extended with:**
- Conditional `peerDiscovery: [mdns({ interval: 20000 })]` when `mdns !== false`
- mDNS construction wrapped in try/catch — Docker/WSL multicast failure logs warning to stderr and continues without mDNS (Pitfall 2)
- Conditional `services: { dht: kadDHT({ clientMode: true }) }` when `dhtEnabled === true`
- `peer:discovery` event handler AFTER `node.start()`:
  - Persists via `mutatePeers` with `discovery_method: 'mdns'`
  - Explicit `node.dial(multiaddrs[0])` — mDNS does NOT auto-dial (Pitfall 1)
  - Duplicate-dial guard via `node.getPeers()` check before dialling

**Pitfall 4 note:** `@libp2p/identify` confirmed not available as transitive dep (Phase 17-01 decision). DHT runs `clientMode: true` without identify — passive routing table population, acceptable for Phase 17.

### Task 2: search-sync.ts (NEW, 508 lines)

**Protocol:** `SEARCH_PROTOCOL_ID = '/akashik/search/1.0.0'`

**Wire format:**
- `SearchRequest { type:'search', embedding: number[], room?: string, k: number }`
- `SearchResponse { type:'search_response', matches: Match[], error?: ... }`
- `PeerMatch` extends `Match` with `_source_peer: string | null`

**FramedStream:** Copied verbatim from share-sync.ts (NOT imported). `.subarray()` Uint8ArrayList flattening preserved (Pitfall 4).

**Token bucket rate limiter:**
- `createRateLimiter(ratePerSec, burst)` — 10 req/s, burst 30 (CONTEXT.md)
- `evictIdle()` called inside every `consume()` call — inline pruning bounds Map growth (Pitfall 7)
- `peek(peerId)` test hook exposed

**Inbound handler pipeline:**
1. Rate-limit check (`rateLimiter.consume`)
2. Dimension guard (`req.embedding.length !== 384`) — before Float32Array construction (Pitfall 3)
3. Room authorization (`loadSharedRooms` — non-shared rooms return `unauthorized`)
4. Float32Array reconstruction: `new Float32Array(req.embedding)` (Pitfall 3)
5. `vectorIndex.searchByRoom` or union-of-shared-rooms fallback
6. Audit log: every `search_request` and `search_response` appended to `share-log.jsonl`

**Protocol registration:**
- `registerSearchProtocol(registry)` / `unregisterSearchProtocol(registry)` — idempotent, mirrors share-sync.ts shape
- `createSearchRegistry(node, homePath, vectorIndex, ratePerSec, burst)` — factory

**Outbound helper:** `openSearchStream(node, peerIdStr, req)` — one-shot dial → write → read → annotate `_source_peer` → close.

**No REMOTE_ORIGIN** — search is read-only (no Y.Doc, no CRDT).

### Task 3: federated-search.ts (NEW, 294 lines)

**runFederatedSearch(deps, params) → Promise<FederatedSearchResult>**

1. **Local query:** `searchByRoom` or `searchGlobal` depending on `params.room`
2. **Parallel fan-out:** `Promise.all` over all connected peers, each wrapped in `withTimeout(2000ms)` using `Promise.race`. NOT `ResultAsync.combine` (short-circuits on first error — anti-pattern locked).
3. **Merge:** dedupe by `node_id`, prefer local/first-seen peer, collapse duplicates into `_also_from_peers`. Sort by distance ascending, slice to `k`.
4. **Tunnel detection (FED-04):** `computeCrossRoomTunnels` pulls local vectors for merged matches, calls `findTunnelsPure`. Peer-only rows skipped (no raw vectors on wire, SEC-03).
5. **Return:** `FederatedSearchResult { matches, tunnels, peers_queried, peers_responded, peers_timed_out, peers_errored }`

**Injectable seam:** `FederatedSearchDeps.openStream` optional override for unit tests.

## Pitfall Patterns Verified (7/7)

| # | Pitfall | Pattern in Code | File |
|---|---------|-----------------|------|
| 1 | mDNS does NOT auto-dial | `node.dial(detail.multiaddrs[0])` in `peer:discovery` handler | peer-transport.ts |
| 2 | Docker/WSL mDNS bind failure | `try { peerDiscovery = [mdns(...)]; } catch { stderr.write(...) }` | peer-transport.ts |
| 3 | Float32Array JSON precision | `new Float32Array(req.embedding)` inbound; `Array.from(embedding)` outbound | search-sync.ts |
| 4 | Uint8ArrayList from lp.decode | `msg.subarray()` in `frameIter()` | search-sync.ts |
| 5 | No REMOTE_ORIGIN in search | Zero Symbol usage — read-only protocol | search-sync.ts |
| 6 | discovery_method optional | `discovery_method: 'mdns'` in mutatePeers call | peer-transport.ts |
| 7 | Rate limiter Map leak | `evictIdle(now)` called inside `consume()` on every request | search-sync.ts |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] @libp2p/identify import removed — not available as transitive dep**
- **Found during:** Task 1 build (TypeScript error TS2307)
- **Issue:** Plan action specified `import { identify } from '@libp2p/identify'` but Phase 17-01 already confirmed this package is NOT available as a transitive dep from libp2p@3.2.0
- **Fix:** Removed identify import. DHT services block uses `kadDHT({ clientMode: true })` only. clientMode DHT does not require identify for passive routing-table participation (confirmed by libp2p docs).
- **Files modified:** src/infrastructure/peer-transport.ts
- **Commit:** 2a8f4ba

**2. [Rule 1 - Bug] services typing cast required for dynamic object**
- **Found during:** Task 1 build (TypeScript error TS2322 — KadDHTComponents incompatible with ComponentsServiceMap)
- **Issue:** libp2p's `createLibp2p` `services` type parameter is strict about service factory component shapes. Dynamic conditional service object fails inference.
- **Fix:** `const services: Record<string, any> = dhtOn ? { dht: kadDHT(...) } : {}` with ESLint disable comment. Semantically correct — `any` here is bounded by the runtime conditional.
- **Files modified:** src/infrastructure/peer-transport.ts
- **Commit:** 2a8f4ba

**3. [Rule 1 - Bug] ResultAsync.then() returns PromiseLike, not Promise**
- **Found during:** Task 3 build (TypeScript error TS2345)
- **Issue:** `withTimeout` takes `Promise<T>` but `openSearchStream(...).then(...)` returns `PromiseLike<T>` (ResultAsync chain). `Promise.race` requires `Promise`, not `PromiseLike`.
- **Fix:** Wrapped in `Promise.resolve(streamOpener(...).then(...))` to convert PromiseLike to concrete Promise.
- **Files modified:** src/application/federated-search.ts
- **Commit:** 29a45a9

## Self-Check: PASSED

- `src/infrastructure/peer-transport.ts` — modified, commit 2a8f4ba exists
- `src/infrastructure/search-sync.ts` — created, commit 83876eb exists
- `src/application/federated-search.ts` — created, commit 29a45a9 exists
- `npm run build` exits 0
- `npm test` — 127/127 pass
