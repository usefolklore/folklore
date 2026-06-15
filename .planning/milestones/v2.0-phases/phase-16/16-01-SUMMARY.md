---
phase: phase-16
plan: "01"
subsystem: sharing-foundation
tags: [yjs, crdt, share-store, ydoc-store, error-types, persistence]
dependency_graph:
  requires: [phase-15/peer-store.ts, phase-15/errors.ts]
  provides: [ShareError, share-store.ts, ydoc-store.ts, yjs@13.6.30, y-protocols@1.0.7]
  affects: [phase-16/02, phase-16/03, phase-16/04]
tech_stack:
  added: [yjs@13.6.30, y-protocols@1.0.7]
  patterns: [cross-process-lock, atomic-tmp-rename, per-path-write-queue, V1-encoding-only, functional-DDD, neverthrow-ResultAsync]
key_files:
  created:
    - src/infrastructure/share-store.ts
    - src/infrastructure/ydoc-store.ts
  modified:
    - src/domain/errors.ts
    - package.json
    - package-lock.json
decisions:
  - "yjs@13.6.30 + y-protocols@1.0.7 pinned exact (--save-exact, no ^ or ~) — dep budget = 2"
  - "V1 encoding enforced in ydoc-store.ts: encodeStateAsUpdate/applyUpdate only; V2 APIs explicitly forbidden"
  - "Per-path write queue (Map<string, Promise<void>>) serializes concurrent saveYDoc calls to prevent async interleave"
  - "loadYDoc never calls doc.getMap — strict init order enforced (new Doc → applyUpdate → return)"
  - "share-store.ts acquireLock uses wx exclusive-create, 30s stale guard, 5s timeout — verbatim peer-store.ts pattern"
metrics:
  duration_seconds: 262
  tasks_completed: 4
  files_created: 2
  files_modified: 3
  completed_date: "2026-04-12T10:24:51Z"
---

# Phase 16 Plan 01: Room Sharing Foundation — SUMMARY

**One-liner:** Y.js V1 persistence layer (share-store + ydoc-store) + ShareError union wired into AppError, providing the typed contracts all Phase 16 sync plans build on.

---

## What Was Built

### 1. npm Dependencies (Task 1)

Two new direct dependencies installed with `--save-exact` (no version drift):

| Package | Version | Purpose |
|---------|---------|---------|
| `yjs` | 13.6.30 | Y.Doc CRDT, Y.Map, V1 encode/apply primitives |
| `y-protocols` | 1.0.7 | sync.js: writeSyncStep1/2, readSyncMessage for wire protocol |

Transitively available (no dep entry needed): `lib0@0.2.x` (encoding/decoding helpers pulled by y-protocols).

Forbidden packages NOT installed: `y-libp2p` (broken), `y-websocket` (not needed), `it-length-prefixed-stream` (remains transitive only).

### 2. ShareError Union — 7 Variants (Task 2)

Added to `src/domain/errors.ts` immediately before the AppError union line:

| Variant | Factory | Fields | Semantic |
|---------|---------|--------|---------|
| `ShareAuditBlocked` | `shareAuditBlocked(room, blockedCount)` | room, blockedCount | `share room X` blocked because auditRoom flagged nodes |
| `YDocLoadError` | `ydocLoadError(path, message)` | path, message | .ydoc binary file read or applyUpdate failure |
| `YDocSaveError` | `ydocSaveError(path, message)` | path, message | .ydoc binary file write or encode failure |
| `SyncProtocolError` | `syncProtocolError(peer, message)` | peer, message | libp2p stream / sync handshake failure |
| `InboundUpdateRejected` | `inboundUpdateRejected(peer, room, reason)` | peer, room, reason | Secrets scan blocked an inbound update (logged, dropped, not back-propagated) |
| `ShareStoreReadError` | `shareStoreReadError(path, message)` | path, message | shared-rooms.json read / parse failure |
| `ShareStoreWriteError` | `shareStoreWriteError(path, message)` | path, message | shared-rooms.json write / lock failure |

AppError union extended to 6 members:
```typescript
export type AppError = GraphError | VectorError | EmbeddingError | PeerError | ScanError | ShareError;
```

`formatError` exhaustive switch updated with all 7 cases — no `default:` clause so TypeScript enforces completeness at every call site.

### 3. share-store.ts (Task 3) — shared-rooms.json Persistence

**File:** `src/infrastructure/share-store.ts` (274 lines)

**Schema:**
```json
{
  "version": 1,
  "rooms": [
    { "name": "homelab", "sharedAt": "2026-04-12T10:20:00Z" }
  ]
}
```

**Exported API:**
| Function | Signature | Purpose |
|----------|-----------|---------|
| `loadSharedRooms` | `(path) → ResultAsync<SharedRoomsFile, ShareError>` | Load registry; returns empty file if missing |
| `saveSharedRooms` | `(path, file) → ResultAsync<void, ShareError>` | Atomic tmp+rename write |
| `addSharedRoom` | `(file, record) → SharedRoomsFile` | Pure upsert by name (idempotent) |
| `removeSharedRoom` | `(file, name) → SharedRoomsFile` | Pure filter by name (idempotent) |
| `mutateSharedRooms` | `(path, transform) → ResultAsync<SharedRoomsFile, ShareError>` | Transactional lock → load → transform → save → release |

**Lock pattern** (verbatim from peer-store.ts):
- Sibling `.lock` file via POSIX exclusive-create (`open(path, 'wx')`)
- Stale lock guard: 30s threshold, reads PID + timestamp from lock file
- Retry loop: 50ms interval, 5s total timeout
- Best-effort release in `.orElse` error path (original error preserved)

### 4. ydoc-store.ts (Task 4) — .ydoc Binary Persistence

**File:** `src/infrastructure/ydoc-store.ts` (121 lines)

**File location pattern:** `~/.folklore/ydocs/<room>.ydoc`

**V1 Encoding Rule (CRITICAL for downstream plans):**
- ONLY `Y.encodeStateAsUpdate(doc)` for serialization — NEVER `encodeStateAsUpdateV2`
- ONLY `Y.applyUpdate(doc, bytes)` for deserialization — NEVER `applyUpdateV2`
- ONLY `doc.on('update', ...)` observer — NEVER `doc.on('updateV2', ...)`
- Rationale: y-protocols/sync uses V1 internally; mixing V1/V2 silently corrupts state

**Init Order Rule (CRITICAL — Pitfall 3):**
- `loadYDoc` always does: `new Y.Doc()` → `Y.applyUpdate(doc, storedBytes)` → return
- `loadYDoc` NEVER calls `doc.getMap()` internally
- Callers must wait for `loadYDoc` to resolve before calling `doc.getMap('nodes')`
- Pattern: `loadYDoc(path).map(doc => doc.getMap('nodes'))`

**Exported API:**
| Function | Signature | Purpose |
|----------|-----------|---------|
| `loadYDoc` | `(ydocPath) → ResultAsync<Y.Doc, ShareError>` | Load or create Y.Doc; V1 applyUpdate applied |
| `saveYDoc` | `(ydocPath, doc) → ResultAsync<void, ShareError>` | Atomic V1 encode + tmp+rename write |

**Concurrent Write Serialization (Pitfall 6):**
- Module-level `writeQueues = new Map<string, Promise<void>>()` keyed by path
- Each `saveYDoc` call chains onto the previous promise for the same path
- Snapshot of `Y.encodeStateAsUpdate(doc)` taken synchronously at call time (not queue-run time)
- Prior queue failures are swallowed (`.catch(() => undefined)`) so one failure does not block all subsequent saves

---

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS — zero errors |
| `npm test` | PASS — 87/87 tests, 0 failures, 0 regressions |
| `grep -c "encodeStateAsUpdateV2" ydoc-store.ts` (code lines only) | 0 — V2 absent |
| `grep -c "doc.getMap" ydoc-store.ts` (code lines only) | 0 — init-order enforced |
| `grep '"yjs": "13.6.30"' package.json` | MATCH — exact pin |
| `grep '"y-protocols": "1.0.7"' package.json` | MATCH — exact pin |
| ShareError variant count | 7 — all present in type + factory + formatError |
| share-store.ts line count | 274 — exceeds 150 minimum |
| ydoc-store.ts roundtrip | PASS — set → saveYDoc → loadYDoc → get, data preserved |

---

## Deviations from Plan

None — plan executed exactly as written.

---

## Commits

| Hash | Task | Description |
|------|------|-------------|
| `92e9aa6` | Task 1 | chore(16-01): install yjs@13.6.30 + y-protocols@1.0.7 pinned exact |
| `a47648e` | Task 2 | feat(16-01): extend ShareError union — 7 variants, AppError + formatError wired |
| `8054e55` | Task 3 | feat(16-01): add share-store.ts — shared-rooms.json with cross-process lock |
| `730a081` | Task 4 | feat(16-01): add ydoc-store.ts — Y.Doc V1 persistence with per-path write queue |

---

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/infrastructure/share-store.ts | FOUND |
| src/infrastructure/ydoc-store.ts | FOUND |
| .planning/phases/phase-16/16-01-SUMMARY.md | FOUND |
| commit 92e9aa6 (Task 1) | FOUND |
| commit a47648e (Task 2) | FOUND |
| commit 8054e55 (Task 3) | FOUND |
| commit 730a081 (Task 4) | FOUND |
