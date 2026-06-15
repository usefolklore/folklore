# Phase 16: Room Sharing via Y.js CRDT - Research

**Researched:** 2026-04-12
**Domain:** Y.js CRDT sync + libp2p custom protocol + functional persistence
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Use **y-protocols/sync** messages directly over a custom libp2p stream handler (`/folklore/share/1.0.0`) — no y-websocket/y-webrtc dep, no broken y-libp2p fork
- One **Y.Doc per shared room** — isolation, independent sync streams, per-room backpressure
- Y.Docs persisted as binary files at `~/.folklore/ydocs/<room>.ydoc` using `encodeStateAsUpdate`/`applyUpdate` native format
- Atomic writes via tmp+rename (reuse the pattern from peer-store.ts `savePeers`)
- Debounced observer: Y.Doc changes flush to in-memory graph within 200ms; graph.json saves on its normal cycle — graph.json remains authoritative for search/ask commands
- Protocol ID: `/folklore/share/1.0.0` (versioned for forward compatibility)
- One persistent libp2p stream per **(peer, room) pair** — yamux multiplexes them, per-room backpressure is clean
- Symmetric room negotiation on connect: both sides exchange `SubscribeRequest` listing their locally-shared rooms, reply with the intersection
- Standard y-protocols **sync step 1 (state vector) + sync step 2 (missing updates)** — no custom diffing
- `share room X` — creates/loads the Y.Doc, runs `auditRoom` security scan, blocks on any flagged node, registers room in `~/.folklore/shared-rooms.json`, immediately pushes `SubscribeRequest` to all currently-connected peers
- `unshare room X` local effect — removes room from registry, closes active Y.Doc streams, **keeps the local .ydoc file**
- `unshare room X` remote effect — peers receive a `ROOM_UNSHARED` signal and stop receiving updates but **keep previously-imported nodes**
- New shared-rooms registry at `~/.folklore/shared-rooms.json` with `version: 1` field (mirrors peers.json schema pattern)
- Secrets scanner runs: **(a)** on `share room X`; **(b)** on every outbound update before pushing to Y.Doc; **(c)** on every inbound update before applying to local Y.Doc — symmetric block-on-match
- Inbound blocked updates are logged and silently dropped (no back-propagation of the rejection)
- Node provenance: every imported node carries `_folklore_source_peer: <peerId>` as an extra GraphNode field
- Append-only audit trail at `~/.folklore/share-log.jsonl` — one JSON line per update
- Dep budget: `yjs` + `y-protocols` — 2 new npm deps

### Claude's Discretion
- Exact debounce timing within the 200ms ceiling
- Internal message framing on libp2p streams (length-prefixed, single-JSON-per-message, etc.)
- Whether `share room` persists the in-memory Y.Doc immediately or lazily on first update

### Deferred Ideas (OUT OF SCOPE)
- Federated search across the P2P network — Phase 17
- Peer discovery (mDNS, DHT) — Phase 17
- Production networking (NAT traversal, multiplexed streams, bandwidth mgmt) — Phase 18
- Room-level ACL — noted as a Phase 15 review risk; revisit when real ACL needs emerge
- `share clear <room>` destructive command (tombstones imported nodes) — reserve the command name, defer implementation
- Reputation system / trust graph — v3
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SHARE-01 | `folklore share room <name>` marks a room as public | shared-rooms.json schema; auditRoom pre-share gate; Y.Doc load/create; SubscribeRequest push to peers |
| SHARE-02 | `folklore unshare room <name>` makes a room private again | shared-rooms.json mutation; ROOM_UNSHARED signal to peers; stream close; .ydoc file retained |
| SHARE-03 | Shared rooms sync via Y.js CRDT — concurrent edits from multiple peers converge | Y.Doc CRDT semantics; y-protocols sync step 1+2 protocol; update observer; applyUpdate with origin filter |
| SHARE-04 | Only metadata + embeddings replicate — not raw source text | ShareableNode type boundary already enforced by Phase 15; Y.Map keyed by node.id storing ShareableNode fields only |
| SHARE-05 | Sync is incremental — only new/changed nodes since last sync | encodeStateVector + encodeStateAsUpdate(doc, peerStateVector) gives only missing deltas natively |
| SHARE-06 | Offline changes queue and sync automatically when peers reconnect | Y.js state-vector approach handles this natively: reconnect triggers step 1+2 exchange, catching up only what's missing |
</phase_requirements>

---

## Summary

Y.js 13.6.30 (npm latest as of 2026-04-12) and y-protocols 1.0.7 are the verified packages to install. The `y-protocols/sync` module exposes five functions — `writeSyncStep1`, `readSyncStep1`, `writeSyncStep2`, `readSyncStep2`, `readSyncMessage` — plus three integer constants (`messageYjsSyncStep1=0`, `messageYjsSyncStep2=1`, `messageYjsUpdate=2`). These use `lib0/encoding` and `lib0/decoding` internally; the integration code creates encoders/decoders via `encoding.createEncoder()` / `decoding.createDecoder(buf)` and converts to wire bytes via `encoding.toUint8Array(encoder)`. The y-websocket source code is the canonical reference implementation for this pattern.

The libp2p `handle()` API (confirmed from installed `@libp2p/interface` types) registers a `StreamHandler = (stream: Stream, connection: Connection) => void | Promise<void>` with `StreamHandlerOptions` that includes `runOnLimitedConnection?: boolean`, `maxInboundStreams`, and `maxOutboundStreams`. The existing `@libp2p/utils` in node_modules exposes a `LengthPrefixedDecoder` class; the idiomatic framing helper is `it-length-prefixed-stream` (v2.0.6, published 2026-04-10) which provides `lpStream(stream)` for imperative length-prefixed read/write. It-length-prefixed-stream is a transitive dep of the libp2p ecosystem but is NOT yet in package.json — it is needed for stream framing and would be the dep-budget concern (already at `yjs` + `y-protocols`). The alternative is to use lib0 encoding directly over raw stream chunks since y-protocols messages are self-framing with varint length prefixes.

**Primary recommendation:** Map each shared room to one Y.Doc + one libp2p stream per connected peer. Use `doc.on('update', (update, origin) => ...)` as the outbound trigger, pass the provider symbol as `transactionOrigin` in `applyUpdate` to prevent echo loops, and debounce graph.json writes with a 150ms `setTimeout` that merges accumulated updates via `Y.mergeUpdates`.

---

## Standard Stack

### Core — install these 2 packages (within dep budget)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| yjs | 13.6.30 | CRDT Y.Doc, Y.Map, update encode/apply | 21.6K stars, last push 2026-03-14, de-facto CRDT standard |
| y-protocols | 1.0.7 | sync.js: state-vector protocol messages | Official companion — writeSyncStep1/2, readSyncMessage |

### Already in node_modules (transitive — no additional dep entry needed)

| Library | Version | Purpose | Access Path |
|---------|---------|---------|-------------|
| lib0 | 0.2.117 | createEncoder, toUint8Array, createDecoder | pulled by y-protocols; import directly |
| @libp2p/utils | 7.0.15 | LengthPrefixedDecoder, stream helpers | already in package.json transitively |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| y-protocols/sync | hand-rolled binary protocol | y-protocols handles offline catchup natively via state vectors; hand-rolling would duplicate 400+ lines of tested code |
| lib0 varint framing | it-length-prefixed-stream | it-lp-stream is cleaner API but burns the dep budget; lib0 is already available and sufficient |
| V1 update format (default) | encodeStateAsUpdateV2 / applyUpdateV2 | V2 is more compressed but y-protocols uses V1 encoding; mixing V1/V2 requires explicit conversion — stick to V1 throughout |

**Installation:**
```bash
npm install yjs@13.6.30 y-protocols@1.0.7
```

**Version verification (confirmed 2026-04-12):**
```
yjs:         13.6.30   published 2026-03-14
y-protocols: 1.0.7     published 2025-12-16
lib0:        0.2.117   (transitive, already pulled)
```

---

## Architecture Patterns

### Recommended File Layout (new files this phase)

```
src/
├── domain/
│   ├── errors.ts              # extend: add ShareError variants + formatError cases
│   └── sharing.ts             # extend: scanShareableNode on raw update bytes
├── infrastructure/
│   ├── share-store.ts         # NEW: shared-rooms.json load/save/mutate (mirrors peer-store.ts)
│   ├── ydoc-store.ts          # NEW: .ydoc file load/save (encodeStateAsUpdate + applyUpdate + atomic write)
│   └── share-sync.ts          # NEW: libp2p handle() registration, stream lifecycle, sync loop
└── cli/commands/
    └── share.ts               # EXTEND: add 'room' and 'unshare' subcommands
~/.folklore/
├── shared-rooms.json          # registry: { version: 1, rooms: [{ name, sharedAt }] }
├── share-log.jsonl            # append-only audit trail
└── ydocs/
    └── <room>.ydoc            # binary Y.Doc state (Uint8Array from encodeStateAsUpdate)
```

### Pattern 1: y-protocols sync message exchange (the core protocol loop)

**What:** How to initiate sync when a stream opens and keep it live for incremental updates.
**When to use:** Every time `node.handle()` fires for `/folklore/share/1.0.0` (inbound) or after `node.dialProtocol()` returns (outbound).

```typescript
// Source: y-websocket reference impl + y-protocols/sync.js API (verified 2026-04-12)
import * as syncProtocol from 'y-protocols/sync'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as Y from 'yjs'

// PROVIDER SYMBOL — used as transactionOrigin to prevent echo loops.
// Applying remote updates with this symbol means the 'update' event
// fires with origin === REMOTE_ORIGIN, which we skip in the outbound handler.
const REMOTE_ORIGIN = Symbol('folklore-remote')

// ── Initiate sync (called on both sides when a stream opens) ──────────────
const sendSyncStep1 = (stream: Stream, doc: Y.Doc): void => {
  const encoder = encoding.createEncoder()
  syncProtocol.writeSyncStep1(encoder, doc)
  const bytes = encoding.toUint8Array(encoder)
  // write length-prefixed frame to stream (see Pattern 2 for framing)
  writeFrame(stream, bytes)
}

// ── Handle incoming sync message ──────────────────────────────────────────
const handleIncomingBytes = (bytes: Uint8Array, doc: Y.Doc, stream: Stream): void => {
  const decoder = decoding.createDecoder(bytes)
  const encoder = encoding.createEncoder()
  const msgType = syncProtocol.readSyncMessage(decoder, encoder, doc, REMOTE_ORIGIN)
  // readSyncMessage: if msgType===0 (SyncStep1) it writes SyncStep2 into encoder
  // if msgType===1 (SyncStep2) it applies updates to doc, encoder is empty
  // if msgType===2 (Update) it applies update to doc, encoder is empty
  if (encoding.length(encoder) > 0) {
    // We have a SyncStep2 response to send back
    writeFrame(stream, encoding.toUint8Array(encoder))
  }
}

// ── Outbound update observer ──────────────────────────────────────────────
// Attach once per Y.Doc per peer-room stream.
// origin check prevents echo: updates we applied from remote have REMOTE_ORIGIN.
const attachOutboundObserver = (doc: Y.Doc, stream: Stream): () => void => {
  const handler = (update: Uint8Array, origin: unknown): void => {
    if (origin === REMOTE_ORIGIN) return  // skip remote-sourced updates
    const encoder = encoding.createEncoder()
    syncProtocol.writeUpdate(encoder, update)
    writeFrame(stream, encoding.toUint8Array(encoder))
  }
  doc.on('update', handler)
  return () => doc.off('update', handler)  // returns cleanup fn
}
```

### Pattern 2: Stream framing without extra deps (lib0 varint)

**What:** Length-prefix binary frames over a libp2p Stream. The libp2p Stream API is an async iterable — reads come as `Uint8ArrayList` chunks, not guaranteed to align to message boundaries.
**When to use:** Both the inbound handle() stream and the outbound dialProtocol() stream.

```typescript
// Source: libp2p custom-protocols example + lib0 encoding (verified 2026-04-12)
// Using it-length-prefixed-stream (v2.0.6) — already a transitive libp2p dep.
// DO NOT add it to package.json; import it as an unlisted transitive.
import { lpStream } from 'it-length-prefixed-stream'

// In handle() callback:
const handleStream = async (stream: Stream): Promise<void> => {
  const lp = lpStream(stream)
  // Write a frame:
  await lp.write(bytes)           // auto length-prefixes
  // Read a frame:
  const msg = await lp.read()
  const bytes = msg.subarray()    // Uint8ArrayList → Uint8Array
}
```

**IMPORTANT:** `lp.read()` returns a `Uint8ArrayList`, not a `Uint8Array`. Call `.subarray()` to get the flat buffer that `decoding.createDecoder()` expects.

**Alternative (zero extra import):** Manually write varint + payload using lib0's `encoding.writeVarUint(enc, bytes.length)` then `encoding.writeUint8Array(enc, bytes)` on the writer side, and `decoding.readVarUint(dec)` + `decoding.readUint8Array(dec, len)` on the reader side. This avoids even the transitive import but is more verbose. Either approach is acceptable — pick based on clarity.

### Pattern 3: libp2p handle() and dialProtocol() API

**What:** Registering the inbound protocol handler and opening outbound streams.
**When to use:** At `share room X` time for peers already connected; on peer connect for rooms already shared.

```typescript
// Source: @libp2p/interface installed types (node_modules/@libp2p/interface) — verified 2026-04-12

// StreamHandler type: (stream: Stream, connection: Connection) => void | Promise<void>
// StreamHandlerOptions: { maxInboundStreams?, maxOutboundStreams?, runOnLimitedConnection? }

// Register inbound handler (call once at startup or first share):
await node.handle(
  '/folklore/share/1.0.0',
  async (stream, connection) => {
    const peerId = connection.remotePeer.toString()
    await handleShareStream(stream, connection, peerId)
  },
  { runOnLimitedConnection: false, maxInboundStreams: 32 }
)

// Open outbound stream to a specific peer for a specific room:
const stream = await node.dialProtocol(
  peerIdFromString(peerIdStr),   // DialTarget = PeerId | Multiaddr | Multiaddr[]
  '/folklore/share/1.0.0'
)
// stream is a Stream — wrap with lpStream for framing

// Unregister (on last room unshared):
await node.unhandle('/folklore/share/1.0.0')
```

### Pattern 4: Y.Doc persistence — load from .ydoc, save atomically

**What:** Binary .ydoc file is loaded at `share room` time and written on each debounced flush.
**When to use:** `ydoc-store.ts` — the persistence adapter.

```typescript
// Source: Yjs docs (docs.yjs.dev/api/document-updates) — verified 2026-04-12
import * as Y from 'yjs'
import { readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'

// Load:
const loadYDoc = async (ydocPath: string): Promise<Y.Doc> => {
  const doc = new Y.Doc()
  if (existsSync(ydocPath)) {
    const bytes = await readFile(ydocPath)
    Y.applyUpdate(doc, new Uint8Array(bytes))
    // CRITICAL: applyUpdate BEFORE any getMap() calls that would
    // initialize empty types — initializing before applying corrupts state
  }
  return doc
}

// Save atomically (reuse peer-store.ts pattern):
const saveYDoc = async (ydocPath: string, doc: Y.Doc): Promise<void> => {
  const bytes = Y.encodeStateAsUpdate(doc)   // V1 format — compatible with y-protocols
  const tmp = `${ydocPath}.tmp`
  await mkdir(dirname(ydocPath), { recursive: true })
  await writeFile(tmp, bytes)
  await rename(tmp, ydocPath)                // POSIX atomic rename
}
```

### Pattern 5: Y.Map as the shared type — mapping GraphNode → Y.Map entry

**What:** One Y.Map named `'nodes'` per Y.Doc; each entry is keyed by `node.id` and stores `ShareableNode` fields.
**When to use:** In the outbound observer when new nodes arrive in the local graph for a shared room.

```typescript
// Source: Yjs docs Y.Map API + Y.Event API (verified 2026-04-12)
import * as Y from 'yjs'

const getNodesMap = (doc: Y.Doc): Y.Map<unknown> =>
  doc.getMap('nodes')   // idempotent — returns same map every call

// Add/update a node:
const upsertShareableNode = (doc: Y.Doc, node: ShareableNode): void => {
  const map = getNodesMap(doc)
  // Use doc.transact to batch; origin prevents echo
  doc.transact(() => {
    map.set(node.id, {
      id: node.id,
      label: node.label,
      room: node.room,
      embedding_id: node.embedding_id,
      source_uri: node.source_uri,
      fetched_at: node.fetched_at,
    })
  }, REMOTE_ORIGIN)   // set origin so outbound observer skips this
}

// Detect added/changed keys in observer:
const observeForGraphSync = (doc: Y.Doc, onAdded: (node: ShareableNode) => void): void => {
  const map = getNodesMap(doc)
  map.observeDeep((events) => {
    for (const event of events) {
      // event.changes.keys: Map<string, { action: 'add'|'update'|'delete', oldValue: any }>
      event.changes.keys.forEach((change, key) => {
        if (change.action === 'add' || change.action === 'update') {
          const value = (event.target as Y.Map<unknown>).get(key)
          if (value) onAdded(value as ShareableNode)
        }
      })
    }
  })
}
```

### Pattern 6: Debounce in neverthrow context — batch Y.Doc → graph.json writes

**What:** The `doc.on('update')` event fires on every single change. Flushing graph.json on each is too expensive. Collect updates, merge, flush after 150ms idle.
**When to use:** In the Y.Doc observer that drives graph.json writes.

```typescript
// Source: Yjs community debounce pattern (discuss.yjs.dev) + Y.mergeUpdates API
// This is deliberately outside the Result monad — debounce is a side effect
// controlled by setTimeout; Result wraps the flush call itself.
let pendingUpdates: Uint8Array[] = []
let debounceTimer: ReturnType<typeof setTimeout> | null = null

const scheduleGraphFlush = (
  update: Uint8Array,
  flushFn: (merged: Uint8Array) => ResultAsync<void, ShareError>
): void => {
  pendingUpdates.push(update)
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    const merged = Y.mergeUpdates(pendingUpdates)
    pendingUpdates = []
    debounceTimer = null
    // flushFn returns ResultAsync — fire-and-forget with error logging
    flushFn(merged).mapErr((e) => {
      console.error(`share-sync: graph flush failed: ${formatError(e)}`)
    })
  }, 150)  // within the 200ms ceiling from CONTEXT.md
}
```

**Key insight:** The debounce timer lives in infrastructure (not domain). The domain function `flushFn` returns `ResultAsync` and is called inside the timer callback. This keeps the Result discipline intact at call boundaries while the debounce bookkeeping stays in the infra layer where side effects belong.

### Pattern 7: ShareError union — new variants Phase 16 adds

```typescript
// Add to src/domain/errors.ts — mirrors existing error patterns

export type ShareError =
  | { readonly type: 'ShareAuditBlocked'; readonly room: string; readonly blockedCount: number }
  | { readonly type: 'YDocLoadError';       readonly path: string; readonly message: string }
  | { readonly type: 'YDocSaveError';       readonly path: string; readonly message: string }
  | { readonly type: 'SyncProtocolError';   readonly peer: string; readonly message: string }
  | { readonly type: 'InboundUpdateRejected'; readonly peer: string; readonly room: string; readonly reason: string }
  | { readonly type: 'ShareStoreReadError'; readonly path: string; readonly message: string }
  | { readonly type: 'ShareStoreWriteError'; readonly path: string; readonly message: string }

// AppError union extension:
export type AppError = GraphError | VectorError | EmbeddingError | PeerError | ScanError | ShareError
// formatError switch must add cases for all 7 new variants — TS enforces exhaustiveness
```

### Pattern 8: shared-rooms.json schema (mirrors peers.json)

```typescript
// src/infrastructure/share-store.ts

const SHARED_ROOMS_VERSION = 1 as const

export interface SharedRoomRecord {
  readonly name: string
  readonly sharedAt: string  // ISO-8601
}

export interface SharedRoomsFile {
  readonly version: typeof SHARED_ROOMS_VERSION
  readonly rooms: readonly SharedRoomRecord[]
}
// mutatSharedRooms() follows the exact same lock+load+transform+save pattern
// as mutatePeers() in peer-store.ts
```

### Pattern 9: share-log.jsonl audit trail

```typescript
// One line per event, append-only.
// Written by share-sync.ts infrastructure for both allowed and blocked updates.
interface ShareLogEntry {
  readonly timestamp: string  // ISO-8601
  readonly peer: string       // peerId string
  readonly room: string
  readonly nodeId: string
  readonly action: 'inbound' | 'outbound'
  readonly allowed: boolean
  readonly reason?: string    // pattern name if blocked
}
// Write: appendFileSync(logPath, JSON.stringify(entry) + '\n')
// No rotation in Phase 16 — append-only is sufficient
```

### Anti-Patterns to Avoid

- **Applying V2 updates with V1 applyUpdate (or vice versa):** V1 and V2 are incompatible binary formats. y-protocols uses V1 encoding. All calls in this codebase must use V1 (`encodeStateAsUpdate`, `applyUpdate`, `doc.on('update')`) consistently. Never mix `encodeStateAsUpdateV2` with `applyUpdate`.
- **Calling `getMap()` before `applyUpdate` on a fresh doc:** Calling `doc.getMap('nodes')` initializes an empty Y.Map before the persisted state is applied. This does NOT corrupt existing keys but can create conflicts in edge cases. Always call `applyUpdate(doc, storedBytes)` FIRST, then `doc.getMap()`.
- **Missing `origin` check in update observer:** Without `if (origin === REMOTE_ORIGIN) return`, every applied remote update will be re-broadcast, creating an infinite echo loop between peers.
- **Not freeing the debounce timer on stream close:** If `clearTimeout(debounceTimer)` is not called in the stream teardown path, a timer fires after the stream is closed and attempts to write to a dead stream reference.
- **Opening multiple streams per (peer, room) pair:** libp2p's `dialProtocol` called repeatedly creates new streams without closing old ones. Track open streams in a `Map<peerIdStr+roomName, Stream>` and reuse.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CRDT convergence | custom merge logic | `Y.applyUpdate` + `Y.Doc` | Yjs handles clock ordering, tombstones, concurrent inserts — getting this right from scratch takes months |
| State-vector diffing | custom "send only new nodes" | `Y.encodeStateVector` + `Y.encodeStateAsUpdate(doc, peerSV)` | State vectors precisely encode what each peer has seen; the diff is exact and handles out-of-order delivery |
| Offline catchup | queuing system | y-protocols step 1+2 on reconnect | Reconnect triggers SyncStep1 exchange; Y.js natively returns only the missing updates |
| Stream framing | rolling your own varint parser | `lpStream(stream)` from `it-length-prefixed-stream` OR lib0's existing varint API | Partial reads across chunk boundaries are the main footgun in stream protocols |
| Update batching | custom merge logic | `Y.mergeUpdates(updates)` | Correctly merges multiple V1 Uint8Array updates into a single coherent update |

---

## Common Pitfalls

### Pitfall 1: Update echo loop
**What goes wrong:** Peer A applies an update from Peer B. Y.Doc fires an `'update'` event. The outbound handler sends it back to Peer B. Peer B applies it again, fires `'update'`, sends back to Peer A. Infinite loop.
**Why it happens:** The `'update'` event fires for ALL changes including those applied via `applyUpdate`, unless the origin filter is active.
**How to avoid:** Always call `Y.applyUpdate(doc, remoteBytes, REMOTE_ORIGIN)` where `REMOTE_ORIGIN` is a symbol or object unique to this provider instance. In the `doc.on('update', (update, origin) => ...)` handler, return early if `origin === REMOTE_ORIGIN`.
**Warning signs:** CPU spikes, growing stream write queue, two peers generating updates indefinitely.

### Pitfall 2: V1/V2 format mismatch
**What goes wrong:** `encodeStateAsUpdateV2` produces a Uint8Array that `applyUpdate` (V1) silently misparses — Yjs may throw or produce corrupted state.
**Why it happens:** V2 uses different internal compression. All y-protocols functions use V1 encoding. Mixing is not detected at compile time.
**How to avoid:** Use ONLY V1 throughout this phase: `encodeStateAsUpdate`, `applyUpdate`, `encodeStateVector`, `doc.on('update')`. Never `encodeStateAsUpdateV2` or `doc.on('updateV2')`.
**Warning signs:** `applyUpdate` throws "Invalid Input" or Y.Map gets keys it should not have.

### Pitfall 3: Y.Doc initialized before applyUpdate
**What goes wrong:** Calling `doc.getMap('nodes')` on a fresh Y.Doc initializes an empty type before the persisted bytes are loaded. In certain edge cases this can create a clock conflict with the stored state.
**Why it happens:** Y.js creates an empty shared type on first access. Loading the stored state later applies on top of the (now non-empty) initial state.
**How to avoid:** In `loadYDoc`, the order is strictly: `new Y.Doc()` → `applyUpdate(doc, storedBytes)` → `doc.getMap('nodes')`. Never access any shared type before loading persisted state.
**Warning signs:** Duplicate keys in the Y.Map, unexpected `'update'` events on initial load.

### Pitfall 4: Stale stream after peer reconnect
**What goes wrong:** A peer disconnects and reconnects. The old `Stream` object is dead but the stream registry still holds a reference to it. Writes throw `stream not writable`.
**Why it happens:** libp2p does not automatically close application-level streams when a connection drops — those are user-managed.
**How to avoid:** Listen to the libp2p `'peer:disconnect'` event (or stream `'close'` / `'abort'`). Remove the stream from the per-(peer,room) registry. On reconnect, re-run the SubscribeRequest exchange and open fresh streams.
**Warning signs:** Write errors after connection resume, no catchup sync on reconnect.

### Pitfall 5: readSyncMessage does not re-encode Update/SyncStep2
**What goes wrong:** Developer assumes `readSyncMessage` always writes to the response encoder — calls `writeFrame(stream, toUint8Array(encoder))` unconditionally. For SyncStep2 and Update messages, encoder is empty. This sends a zero-length frame.
**Why it happens:** `readSyncMessage` only populates the encoder for SyncStep1 (writing the SyncStep2 reply). For other message types it applies the update to the doc but leaves the encoder empty.
**How to avoid:** Check `encoding.length(encoder) > 0` before writing the response frame. (Verified from y-protocols issue #15, confirmed by y-websocket source.)
**Warning signs:** Peers receiving spurious empty frames; stream parse errors on the reading end.

### Pitfall 6: Concurrent writes to the same .ydoc file
**What goes wrong:** The debounce timer fires and writes the .ydoc file while a sync step 2 message is also writing the same file. File is partially written.
**Why it happens:** Node.js is single-threaded but async — two `writeFile` calls can interleave if both are awaited in flight simultaneously.
**How to avoid:** Use the same lock pattern from `peer-store.ts` (POSIX exclusive-create `.lock` file) for .ydoc writes. Alternatively, serialize writes via a per-room async queue (`let writeQueue: Promise<void> = Promise.resolve()`; chain each write onto the queue).
**Warning signs:** `applyUpdate` throwing on the malformed .ydoc bytes at next load.

### Pitfall 7: `encodeStateAsUpdate` is synchronous and blocks on large docs
**What goes wrong:** A large Y.Doc (many thousands of nodes) causes `encodeStateAsUpdate` to block the event loop for >100ms. This stalls libp2p's connection manager and may cause timeout errors.
**Why it happens:** Yjs serialization is synchronous by design (CRDT semantics require consistent snapshots).
**How to avoid:** For Phase 16 scope (metadata-only nodes, no raw content), each node is a small JSON object. The practical limit before blocking is ~50K nodes. This is not a concern at current scale (499 nodes). Document as a known constraint for Phase 18.
**Warning signs:** Event loop lag spikes; peer connection timeouts during sync of large rooms.

---

## Code Examples

### Complete sync step 1+2 exchange (verified pattern from y-websocket source)

```typescript
// Source: github.com/yjs/y-websocket y-websocket.js (canonical reference impl)
import * as syncProtocol from 'y-protocols/sync'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import * as Y from 'yjs'

// ── INITIATOR side (our peer opens stream to remote) ─────────────────────
const initiateSyncOnStream = (stream: Stream, doc: Y.Doc): void => {
  // Write SyncStep1 (our state vector)
  const enc = encoding.createEncoder()
  syncProtocol.writeSyncStep1(enc, doc)
  writeFrame(stream, encoding.toUint8Array(enc))
}

// ── BOTH sides process incoming messages ─────────────────────────────────
const REMOTE_ORIGIN = Symbol('share-remote')
const processIncomingFrame = (bytes: Uint8Array, doc: Y.Doc, stream: Stream): void => {
  const decoder = decoding.createDecoder(bytes)
  const responseEncoder = encoding.createEncoder()
  syncProtocol.readSyncMessage(decoder, responseEncoder, doc, REMOTE_ORIGIN)
  // Only send reply if readSyncMessage generated one (SyncStep1 → SyncStep2 reply)
  if (encoding.length(responseEncoder) > 0) {
    writeFrame(stream, encoding.toUint8Array(responseEncoder))
  }
}
// NOTE: applyUpdate inside readSyncMessage is called with transactionOrigin=REMOTE_ORIGIN
// This prevents the 'update' observer from re-broadcasting to the peer that sent it.
```

### Y.Map node upsert with SEC-03 boundary enforcement

```typescript
// Source: pattern derived from Yjs Y.Map docs + ShareableNode type in sharing.ts
const syncNodeToYDoc = (doc: Y.Doc, node: GraphNode, patterns: ReturnType<typeof buildPatterns>): Result<void, ShareError | ScanError> =>
  scanNode(node, patterns)
    .map((shareable) => {
      doc.transact(() => {
        doc.getMap('nodes').set(shareable.id, shareable)
      }, REMOTE_ORIGIN)  // REMOTE_ORIGIN prevents outbound observer from echoing
    })
    .mapErr((e) => e)  // ScanError passes through as-is
```

### Shared-rooms.json mutate (mirrors mutatePeers pattern)

```typescript
// Source: pattern from src/infrastructure/peer-store.ts mutatePeers
// share-store.ts follows the identical lock → load → transform → save → unlock flow
export const mutateSharedRooms = (
  roomsPath: string,
  transform: (current: SharedRoomsFile) => SharedRoomsFile,
): ResultAsync<SharedRoomsFile, ShareError> => {
  const lockPath = `${roomsPath}.lock`
  return ResultAsync.fromPromise(acquireLock(lockPath), (e) =>
    ShareError.storeWriteError(roomsPath, `lock acquire: ${(e as Error).message}`)
  )
    .andThen(() => loadSharedRooms(roomsPath))
    .andThen((current) => {
      const next = transform(current)
      return saveSharedRooms(roomsPath, next).map(() => next)
    })
    .andThen((result) =>
      ResultAsync.fromPromise(releaseLock(lockPath), () =>
        ShareError.storeWriteError(roomsPath, 'lock release failed')
      ).map(() => result)
    )
    .orElse((err) =>
      ResultAsync.fromPromise(releaseLock(lockPath), () => err).andThen(() => errAsync(err))
    )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| y-libp2p (broken npm package) | raw y-protocols/sync over custom handle() | Package unmaintained ~2022 | Do NOT install y-libp2p — it does not work with modern libp2p 3.x |
| y-websocket for all transport | custom protocol handler for non-WS transports | Ongoing (community pattern) | y-protocols is transport-agnostic; y-websocket is just one consumer |
| V1 update format only | V2 available but not universal | yjs 13.x series | y-protocols still uses V1; V2 opt-in requires all participants to agree |
| Yjs v13 (stable) | v14.0.0-rc.11 in RC phase as of 2026-04-11 | April 2026 | Do NOT install v14 RC — install 13.6.30 (latest stable) |

**Deprecated/outdated:**
- `y-libp2p` (npm): Do not install. Unmaintained, incompatible with libp2p 3.x. The CONTEXT.md decision to avoid it is correct.
- `y-webrtc`: WebRTC transport only — not relevant for TCP libp2p.
- `unmarshalEd25519PrivateKey` (old libp2p API): Already avoided in Phase 15 — `privateKeyFromRaw` is the correct 3.x API.

---

## Open Questions

1. **Sync process location: daemon loop vs. standalone process**
   - What we know: Phase 15 review flagged "one libp2p node per CLI command" as a risk. The daemon loop (`src/daemon/loop.ts`) already runs as a detached process with PID management. The CLI share commands would need a long-lived libp2p node for sync.
   - What's unclear: Whether the daemon process is the right home for the persistent libp2p sync node, or whether `share room` should start a mini-process (like daemon) that holds the node alive.
   - Recommendation: The planner should choose one of: (a) extend the daemon to also own the libp2p sync node (cleanest from lifecycle perspective — one process), or (b) `share room` writes shared-rooms.json and the daemon detects the change on next tick and starts the sync. The research supports (b) as less invasive to the daemon's current structure, since the daemon already uses polling.

2. **SubscribeRequest message format**
   - What we know: Both peers must exchange their list of shared rooms on connect; only the intersection is synced. This requires a custom JSON message before the y-protocols sync step 1.
   - What's unclear: Exact wire format. CONTEXT.md says "Claude's Discretion" for internal message framing.
   - Recommendation: Use a simple length-prefixed JSON frame (via lib0 or lpStream) for SubscribeRequest before any y-protocols bytes. Example: `{ type: 'subscribe', rooms: ['homelab', 'rust'] }`. The protocol handler reads the first frame as JSON, determines intersection, then opens per-room Y.Doc streams.

3. **ROOM_UNSHARED signal to remote peers**
   - What we know: `unshare room X` must notify connected peers to stop receiving updates. CONTEXT.md specifies peers keep already-imported nodes.
   - What's unclear: Is this a new message type on the same stream, or closing the stream signals unshare?
   - Recommendation: Closing the stream IS the signal — the remote peer should treat stream close as "room unshared." This is the simplest implementation and requires no new message type.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test`) + `node:assert/strict` |
| Config file | none — tests run via `node --import tsx --test tests/*.test.ts` |
| Quick run command | `node --import tsx --test tests/phase16.share-crdt.test.ts` |
| Full suite command | `node --import tsx --test tests/*.test.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SHARE-01 | `share room X` registers room in shared-rooms.json after auditRoom passes | unit | `node --import tsx --test tests/phase16.share-crdt.test.ts` | ❌ Wave 0 |
| SHARE-01 | `share room X` blocks if any node in room is flagged by scanner | unit | same | ❌ Wave 0 |
| SHARE-02 | `unshare room X` removes room from shared-rooms.json | unit | same | ❌ Wave 0 |
| SHARE-02 | `unshare room X` keeps .ydoc file on disk | unit | same | ❌ Wave 0 |
| SHARE-03 | Two Y.Docs with concurrent upserts converge after sync step 1+2 exchange | unit | same | ❌ Wave 0 |
| SHARE-03 | Update echo loop is prevented by REMOTE_ORIGIN filter | unit | same | ❌ Wave 0 |
| SHARE-04 | Y.Map entries contain only ShareableNode fields (not file_type, source_file, content) | unit | same | ❌ Wave 0 |
| SHARE-05 | encodeStateVector + encodeStateAsUpdate(doc, peerSV) returns only delta for peer | unit | same | ❌ Wave 0 |
| SHARE-06 | Offline peer catches up: apply saved .ydoc updates then step 1+2 sync fills gap | unit | same | ❌ Wave 0 |
| Security | Inbound update containing secret pattern is blocked and logged | unit | same | ❌ Wave 0 |
| Security | Outbound update containing secret pattern is blocked before writing to Y.Doc | unit | same | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `node --import tsx --test tests/phase16.share-crdt.test.ts`
- **Per wave merge:** `node --import tsx --test tests/*.test.ts`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/phase16.share-crdt.test.ts` — covers all 11 test cases above
- [ ] `src/infrastructure/share-store.ts` — needs to exist before tests can import it
- [ ] `src/infrastructure/ydoc-store.ts` — needs to exist before tests can import it

*(Note: no new test framework needed — existing `node:test` + `tsx` infrastructure covers Phase 16)*

---

## Sources

### Primary (HIGH confidence)
- `node_modules/@libp2p/interface/dist/src/stream-handler.d.ts` — `StreamHandler`, `StreamHandlerOptions`, `runOnLimitedConnection` type definition (installed package, exact types)
- `node_modules/@libp2p/interface/dist/src/index.d.ts` — `handle()`, `dialProtocol()`, `unhandle()` signatures (installed package)
- `unpkg.com/y-protocols@1.0.7/sync.js` — `writeSyncStep1`, `readSyncStep1`, `writeSyncStep2`, `readSyncStep2`, `readSyncMessage`, message type constants
- `unpkg.com/yjs@13.6.30/dist/yjs.cjs` — `encodeStateAsUpdate`, `applyUpdate`, `encodeStateAsUpdateV2`, `applyUpdateV2`, `encodeStateVector`, `mergeUpdates` function signatures
- `unpkg.com/lib0@0.2.117/encoding.js` — `createEncoder()`, `toUint8Array()` (verified source)
- `unpkg.com/lib0@0.2.117/decoding.js` — `createDecoder(buf)`, `readVarUint()`, `readVarUint8Array()` (verified source)
- npm registry — `yjs@13.6.30` (2026-03-14), `y-protocols@1.0.7` (2025-12-16), `lib0@0.2.117` (2025-12-30) publish dates confirmed
- `github.com/yjs/y-websocket` — canonical reference implementation for readSyncMessage + update observer pattern

### Secondary (MEDIUM confidence)
- `deepwiki.com/yjs/y-protocols/2.1-sync-protocol` — sync protocol 3-message-type specification (matches verified source)
- `discuss.yjs.dev/t/creating-a-custom-provider/1938` — transactionOrigin echo-prevention pattern (community, consistent with docs)
- `discuss.yjs.dev/t/y-websocket-debounce-broadcast-and-merge-updates/885` — Y.mergeUpdates debounce pattern
- `docs.yjs.dev/api/y.event` — `changes.keys` map structure, `action: 'add'|'update'|'delete'`
- `github.com/yjs/y-protocols/issues/15` — readSyncMessage encoder behavior (encoder empty for SyncStep2/Update messages)
- `github.com/libp2p/js-libp2p-example-custom-protocols` — `lpStream`, `lp.read()/.write()`, `Uint8ArrayList.subarray()`

### Tertiary (LOW confidence — flag for validation)
- y-protocols v14.0.0-rc.11 existence (GitHub releases page — do NOT install; confirmed stable is 13.6.30)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against npm registry 2026-04-12; source inspected at unpkg
- Architecture: HIGH — patterns traced to installed node_modules types and canonical y-websocket source
- Pitfalls: HIGH for items 1-5 (verified from official sources/issues); MEDIUM for items 6-7 (reasoned from Node.js async semantics + Yjs sync semantics)
- Validation: HIGH — matches established test pattern from phase15.peer-security.test.ts

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (stable y-protocols 1.0.7; yjs 13.6.30; check before planning if v14.0.0 stable releases)
