---
phase: 15-peer-foundation-security
plan: "02"
subsystem: infrastructure
tags: [peer, libp2p, transport, identity, peer-store, neverthrow, functional-ddd, sec-05, sec-06]
dependency_graph:
  requires:
    - 15-01 (PeerError union, PeerConfig, PeerStoreReadError/WriteError variants)
  provides:
    - loadOrCreateIdentity: lazy ed25519 keypair generate/load via raw base64 JSON
    - createNode: libp2p node with Noise (SEC-05) + Yamux, explicit start()
    - dialAndTag: multiaddr-safe dial with peerStore tagging
    - hangUpPeer: typed disconnect via PE.transportError
    - getNodeStatus: peerId, listenAddrs, connectedPeers
    - loadPeers / savePeers: atomic peers.json I/O (tmp + rename)
    - addPeerRecord / removePeerRecord: pure peers.json transformations
    - PeerIdentity, TransportConfig, NodeStatus, PeerRecord, PeersFile types
  affects:
    - src/infrastructure/peer-transport.ts (new)
    - src/infrastructure/peer-store.ts (new)
    - package.json (4 new deps)
tech_stack:
  added:
    - libp2p@3.2.0
    - "@libp2p/tcp@11.0.15"
    - "@libp2p/noise@1.0.1"
    - "@libp2p/yamux@8.0.1"
  patterns:
    - ResultAsync.andThen chaining for sequential async (no raw .then())
    - Atomic file write via writeFile(tmp) + rename(tmp, target)
    - Transitive dep import (@libp2p/crypto/keys, @libp2p/peer-id, @multiformats/multiaddr) without explicit package.json entry
    - Synchronous-throw guard: multiaddr() wrapped in try/catch before async dial
    - Ed25519 identity: .raw bytes serialized as base64 JSON, deserialized via privateKeyFromRaw
key_files:
  created:
    - src/infrastructure/peer-transport.ts
    - src/infrastructure/peer-store.ts
  modified:
    - package.json
decisions:
  - "privateKeyFromRaw (libp2p 3.x) replaces unmarshalEd25519PrivateKey (old API) — verified against installed types before writing"
  - "PE.transportError used for hangUpPeer failures (not PE.notFound — reserved for registry lookup misses)"
  - "PE.storeReadError/storeWriteError used exclusively in peer-store.ts (identity error types only in peer-transport.ts)"
  - "dirname() used for parent dir extraction (not regex) — cleaner and handles edge cases"
  - "multiaddr() synchronous throw caught inline, converted to typed PeerError before ResultAsync error path"
metrics:
  duration_seconds: 380
  completed_date: "2026-04-12T08:11:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 1
---

# Phase 15 Plan 02: libp2p Infrastructure Layer Summary

**One-liner:** libp2p 3.x infrastructure layer — lazy ed25519 identity with raw base64 JSON serialization, Noise-encrypted TCP transport (SEC-05/SEC-06), atomic peers.json persistence via tmp+rename.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Install libp2p deps + create peer-transport.ts | 49c6968 | package.json, src/infrastructure/peer-transport.ts |
| 2 | Create peer-store.ts for atomic peers.json persistence | 841b212 | src/infrastructure/peer-store.ts |

## What Was Built

### src/infrastructure/peer-transport.ts (new)

libp2p node lifecycle and ed25519 identity management:

- `PeerIdentity` — `{ privateKey: Ed25519PrivateKey, peerId: string }` — typed identity handle
- `TransportConfig` — `{ listenPort: number }` — injected config
- `NodeStatus` — `{ peerId, listenAddrs, connectedPeers }` — observable node state
- `loadOrCreateIdentity(path)` — `ResultAsync<PeerIdentity, PeerError>`: reads existing `peer-identity.json` or generates a new ed25519 keypair and persists it. Format: `{ privateKeyB64, peerId, createdAt }`. Uses `.raw` (64 bytes) for serialization, `privateKeyFromRaw()` for deserialization (libp2p 3.x API).
- `createNode(identity, cfg)` — `ResultAsync<Libp2p, PeerError>`: constructs libp2p with TCP + `noise()` (SEC-05: all traffic encrypted; SEC-06: ed25519 peer auth via Noise handshake) + `yamux()`. Calls `await node.start()` explicitly.
- `dialAndTag(node, rawAddr)` — `ResultAsync<string, PeerError>`: wraps synchronous `multiaddr()` parse in try/catch (maps to `PE.invalidMultiaddr`), dials, tags with `keep-alive-folklore`, returns remote PeerId string.
- `hangUpPeer(node, peerIdStr)` — `ResultAsync<void, PeerError>`: disconnects peer. Error mapped to `PE.transportError` (not `PE.notFound`).
- `getNodeStatus(node)` — pure snapshot of peerId, listenAddrs, connectedPeers.

### src/infrastructure/peer-store.ts (new)

Atomic persistence for `~/.folklore/peers.json`:

- `PeerRecord` — `{ id, addrs, addedAt, label? }` — readonly peer entry
- `PeersFile` — `{ peers: readonly PeerRecord[] }` — file envelope
- `loadPeers(path)` — `ResultAsync<PeersFile, PeerError>`: returns `EMPTY_FILE` if missing, returns `EMPTY_FILE` on corrupt JSON (recoverable). Uses `PE.storeReadError`.
- `savePeers(path, file)` — `ResultAsync<void, PeerError>`: mkdir + writeFile(tmp) + rename(tmp, path) — POSIX atomic. Uses `PE.storeWriteError`.
- `addPeerRecord(file, record)` — pure upsert: inserts new peer or refreshes addrs on existing id.
- `removePeerRecord(file, id)` — pure filter: returns unchanged file if id not found.

## Verification

```
npm ls libp2p @libp2p/tcp @libp2p/noise @libp2p/yamux
  ├── @libp2p/noise@1.0.1
  ├── @libp2p/tcp@11.0.15
  ├── @libp2p/yamux@8.0.1
  └── libp2p@3.2.0

npx tsc --noEmit   → 0 errors
npm test           → 33/33 pass (0 failures, 0 regressions)
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `unmarshalEd25519PrivateKey` does not exist in libp2p 3.x**

- **Found during:** Task 1 API verification (before writing code)
- **Issue:** The plan's code snippet used `unmarshalEd25519PrivateKey` from `@libp2p/crypto/keys`. In libp2p 3.2.0 (the installed version), this function does not exist. The correct API is `privateKeyFromRaw(rawBytes)`.
- **Fix:** Used `privateKeyFromRaw` throughout `loadOrCreateIdentity`. Verified round-trip: generate key → `.raw` bytes → base64 → back to `Uint8Array` → `privateKeyFromRaw` → `peerIdFromPrivateKey` → PeerId matches original.
- **Files modified:** src/infrastructure/peer-transport.ts
- **Commit:** 49c6968

**2. [Rule 1 - Bug] Used `dirname()` instead of regex for parent dir extraction**

- **Found during:** Task 1 and Task 2 implementation
- **Issue:** Plan used `identityPath.replace(/\/[^/]+$/, '')` to extract the parent directory. This fails on paths that don't contain a slash (edge case) and is less readable.
- **Fix:** Used `dirname(identityPath)` from `node:path` — correct for all path shapes, handles trailing slashes, platform-independent.
- **Files modified:** src/infrastructure/peer-transport.ts, src/infrastructure/peer-store.ts
- **Commit:** 49c6968, 841b212

## Self-Check: PASSED

- [x] src/infrastructure/peer-transport.ts exists and compiles
- [x] src/infrastructure/peer-store.ts exists and compiles
- [x] Commit 49c6968 exists (Task 1)
- [x] Commit 841b212 exists (Task 2)
- [x] libp2p@3.2.0 installed (npm ls confirmed)
- [x] @libp2p/tcp@11.0.15, @libp2p/noise@1.0.1, @libp2p/yamux@8.0.1 installed
- [x] @libp2p/crypto, @libp2p/peer-id, @multiformats/multiaddr NOT in package.json (transitive only)
- [x] loadOrCreateIdentity, createNode, dialAndTag, hangUpPeer, getNodeStatus exported
- [x] noise() in connectionEncrypters (SEC-05/SEC-06)
- [x] await node.start() explicit
- [x] PE.transportError in hangUpPeer error mapper
- [x] PE.storeReadError/storeWriteError in peer-store.ts (no identity error types in code)
- [x] Atomic write: tmp + rename in savePeers
- [x] No raw .then() in either file
- [x] 33/33 existing tests pass (no regressions)
- [x] npx tsc --noEmit → 0 errors
