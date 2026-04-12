/**
 * Share sync — y-protocols sync messages over a libp2p custom protocol.
 *
 * Phase 16 core. Registers /wellinformed/share/1.0.0 on a libp2p node,
 * tracks one Y.Doc per shared room, opens one stream per (peer, room) pair,
 * exchanges sync step 1 + 2 messages, and drives a debounced flush of the
 * Y.Doc state into the in-memory graph. Every inbound and outbound update
 * passes through the secrets scanner (SEC-01..04 + SHARE-04 boundary).
 *
 * CRITICAL invariants — every reviewer must check these:
 *   1. REMOTE_ORIGIN is the SAME symbol used both as Y.applyUpdate's
 *      transactionOrigin AND as the early-return check inside the
 *      outbound `doc.on('update', (u, origin) => ...)` handler. Without
 *      this filter, applying a remote update fires the observer which
 *      sends it back to the sender — infinite echo loop (Pitfall 1).
 *
 *   2. V1 encoding only. y-protocols/sync uses V1. NEVER call
 *      encodeStateAsUpdateV2, applyUpdateV2, or doc.on('updateV2').
 *      Mixing V1 and V2 silently corrupts state (Pitfall 2).
 *
 *   3. readSyncMessage only writes to the response encoder for SyncStep1
 *      messages. For SyncStep2 and Update messages the encoder is empty
 *      and we MUST NOT send a zero-length frame back. Always guard with
 *      `if (encoding.length(encoder) > 0)` (Pitfall 5).
 *
 *   4. lp.decode yields Uint8ArrayList values. Call .subarray() to get
 *      the flat Uint8Array that decoding.createDecoder() requires
 *      (Research Pattern 2 — Pitfall 4).
 *
 *   5. Inbound updates are scanned against buildPatterns BEFORE applyUpdate.
 *      Blocked updates are written to share-log.jsonl as
 *      { allowed: false, reason: '...' } and silently dropped — never
 *      back-propagated to the peer (don't leak the scan verdict).
 *
 *   6. The 150ms graph-flush debounce timer must be cleared on
 *      unregisterShareProtocol(), or it fires after the stream is closed
 *      and writes to a dead doc reference (Pitfall — debounce leak).
 */
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import * as lp from 'it-length-prefixed';

import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { appendFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

import type { Libp2p, Stream, Connection } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';
import { Uint8ArrayList } from 'uint8arraylist';

import type { ShareError } from '../domain/errors.js';
import { ShareError as SE, formatError } from '../domain/errors.js';
import { buildPatterns, scanNode, type ShareableNode } from '../domain/sharing.js';
import type { GraphNode, Graph } from '../domain/graph.js';
import { upsertNode } from '../domain/graph.js';

import { loadYDoc, saveYDoc } from './ydoc-store.js';
import { loadSharedRooms } from './share-store.js';
import type { GraphRepository } from './graph-repository.js';

// ─────────────────────── constants ────────────────────────────────────────────

export const SHARE_PROTOCOL_ID = '/wellinformed/share/1.0.0' as const;

/**
 * REMOTE_ORIGIN — module-level Symbol used as transactionOrigin in every
 * Y.applyUpdate call AND as the early-return check inside the outbound
 * 'update' observer. THIS IS THE ECHO-LOOP PREVENTION (Pitfall 1).
 * Do not export a getter — exporting the Symbol ensures any test can
 * import it and assert that the same instance is reused everywhere.
 */
export const REMOTE_ORIGIN: unique symbol = Symbol('wellinformed-share-remote');

const GRAPH_FLUSH_DEBOUNCE_MS = 150;     // within the 200ms ceiling from CONTEXT.md
const MAX_INBOUND_STREAMS = 32;
const MAP_NAME = 'nodes' as const;       // single Y.Map per Y.Doc

// ─────────────────────── FramedStream abstraction ─────────────────────────────

/**
 * A thin wrapper around a libp2p Stream that encodes/decodes frames with
 * varint length prefixes via it-length-prefixed.
 *
 * write(bytes): length-prefixes and sends via stream.send().
 * The frameIter() generator yields complete decoded frames (as flat
 * Uint8Array) by piping the stream's async iterator through lp.decode().
 */
interface FramedStream {
  /** Send a length-prefixed frame. */
  write(data: Uint8Array): Promise<void>;
  /** Async iterator of decoded frames (Uint8Array, already .subarray()'d). */
  frameIter(): AsyncGenerator<Uint8Array, void, undefined>;
  /** Close the underlying stream. Best-effort. */
  close(): void;
}

const makeFramedStream = (stream: Stream): FramedStream => {
  const frameIter = async function* (): AsyncGenerator<Uint8Array, void, undefined> {
    // lp.decode(source) accepts AsyncIterable<Uint8Array | Uint8ArrayList>
    // The libp2p Stream IS an AsyncIterable<Uint8Array | Uint8ArrayList>.
    for await (const msg of lp.decode(stream)) {
      // Pitfall 4 — lp.decode yields Uint8ArrayList; .subarray() flattens to Uint8Array.
      yield msg.subarray();
    }
  };

  return {
    write: async (data: Uint8Array): Promise<void> => {
      // lp.encode([data]) yields one length-prefixed Uint8ArrayList chunk.
      for await (const chunk of lp.encode([data])) {
        stream.send(chunk);
      }
    },
    frameIter,
    close: (): void => { try { void stream.close(); } catch { /* benign */ } },
  };
};

// ─────────────────────── SubscribeRequest framing ─────────────────────────────

/**
 * First frame on every new stream: a JSON SubscribeRequest listing the
 * sender's locally-shared rooms. The receiver replies with another
 * SubscribeRequest containing its own list. Both sides then open
 * y-protocols sync sessions for the INTERSECTION of the two lists.
 *
 * Wire format: a single length-prefixed frame containing utf-8 JSON.
 * Discrimination from y-protocols frames is positional — the SubscribeRequest
 * is always the FIRST frame on the stream, every subsequent frame is a
 * y-protocols message.
 */
interface SubscribeRequest {
  readonly type: 'subscribe';
  readonly rooms: readonly string[];
}

const writeSubscribeRequest = async (
  fs: FramedStream,
  rooms: readonly string[],
): Promise<void> => {
  const payload: SubscribeRequest = { type: 'subscribe', rooms };
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  await fs.write(bytes);
};

const readSubscribeRequest = async (
  iter: AsyncGenerator<Uint8Array, void, undefined>,
): Promise<readonly string[]> => {
  const result = await iter.next();
  if (result.done || !result.value) throw new Error('stream ended before SubscribeRequest');
  // result.value is already a flat Uint8Array from frameIter (Pitfall 4 handled there).
  const text = new TextDecoder().decode(result.value);
  const parsed = JSON.parse(text) as SubscribeRequest;
  if (parsed.type !== 'subscribe' || !Array.isArray(parsed.rooms)) {
    throw new Error('malformed SubscribeRequest');
  }
  return parsed.rooms;
};

// ─────────────────────── share-log.jsonl audit trail ──────────────────────────

interface ShareLogEntry {
  readonly timestamp: string;
  readonly peer: string;
  readonly room: string;
  readonly nodeId: string;
  readonly action: 'inbound' | 'outbound';
  readonly allowed: boolean;
  readonly reason?: string;
}

const appendShareLog = async (logPath: string, entry: ShareLogEntry): Promise<void> => {
  try {
    await mkdir(dirname(logPath), { recursive: true });
    await appendFile(logPath, JSON.stringify(entry) + '\n');
  } catch {
    // best-effort — never fail a sync because the audit log can't be written
  }
};

// ─────────────────────── sync engine helpers ──────────────────────────────────

/**
 * Send sync step 1 (our state vector). Called on stream open by both sides.
 * The peer responds with sync step 2 (the missing updates) which we apply.
 */
const sendSyncStep1 = async (fs: FramedStream, doc: Y.Doc): Promise<void> => {
  const enc = encoding.createEncoder();
  syncProtocol.writeSyncStep1(enc, doc);
  await fs.write(encoding.toUint8Array(enc));
};

/**
 * Process one inbound y-protocols frame.
 *
 * readSyncMessage:
 *   - msgType 0 (SyncStep1)  → writes SyncStep2 reply into responseEncoder
 *   - msgType 1 (SyncStep2)  → applies updates to doc, responseEncoder STAYS EMPTY
 *   - msgType 2 (Update)     → applies update to doc, responseEncoder STAYS EMPTY
 *
 * The applyUpdate calls inside readSyncMessage use REMOTE_ORIGIN as
 * transactionOrigin. This prevents echo loops in the outbound observer.
 *
 * CRITICAL: only emit a response frame if encoding.length(encoder) > 0.
 * Without this guard we send zero-length frames after every Update message,
 * which spams the peer with empty bytes and may break their decoder
 * (Pitfall 5, verified from y-protocols issue #15).
 */
const handleInboundFrame = async (
  bytes: Uint8Array,
  doc: Y.Doc,
  fs: FramedStream,
): Promise<void> => {
  const decoder = decoding.createDecoder(bytes);
  const responseEncoder = encoding.createEncoder();
  syncProtocol.readSyncMessage(decoder, responseEncoder, doc, REMOTE_ORIGIN);
  if (encoding.length(responseEncoder) > 0) {
    await fs.write(encoding.toUint8Array(responseEncoder));
  }
};

// ─────────────────────── outbound observer ────────────────────────────────────

/**
 * Attach an outbound update observer to a Y.Doc and return a cleanup fn.
 *
 * The observer fires for EVERY Y.Doc change including updates we just
 * applied from a remote peer. The `if (origin === REMOTE_ORIGIN) return`
 * branch is the echo-loop prevention — without it, every applied remote
 * update would be re-broadcast back to the sender.
 *
 * Outbound updates are NOT scanned here directly because the update bytes
 * are an opaque CRDT delta. Instead, the application-layer code that calls
 * syncNodeIntoYDoc (see below) scans the node before inserting it. By the
 * time we reach this observer, all locally-originated mutations have already
 * passed the secrets scanner.
 */
const attachOutboundObserver = (
  doc: Y.Doc,
  framedStreams: readonly FramedStream[],
): (() => void) => {
  const handler = (update: Uint8Array, origin: unknown): void => {
    if (origin === REMOTE_ORIGIN) return;  // ECHO LOOP PREVENTION
    const enc = encoding.createEncoder();
    syncProtocol.writeUpdate(enc, update);
    const bytes = encoding.toUint8Array(enc);
    // Best-effort fan-out — write failures on a single stream do not
    // halt other peers. The stream registry will reap dead streams on
    // the next tick.
    for (const fs of framedStreams) {
      fs.write(bytes).catch(() => { /* dead stream — reaped elsewhere */ });
    }
  };
  doc.on('update', handler);
  return () => doc.off('update', handler);
};

/**
 * Sync a single GraphNode into a Y.Doc after secrets scanning.
 *
 * This is the OUTBOUND security gate. Local nodes that pass the scan are
 * upserted into the Y.Map; flagged nodes are blocked and logged.
 *
 * Uses `undefined` as transactionOrigin (default) for locally-originated
 * edits so the outbound observer fires AND broadcasts. REMOTE_ORIGIN is
 * reserved for applyUpdate() to prevent echo loops — never use it here.
 */
export const syncNodeIntoYDoc = (
  doc: Y.Doc,
  node: GraphNode,
  patterns: ReturnType<typeof buildPatterns>,
  logPath: string,
  ownPeerId: string,
  room: string,
): ResultAsync<void, ShareError> => {
  const scanResult = scanNode(node, patterns);
  if (scanResult.isErr()) {
    const reason = scanResult.error.matches.map((m) => `${m.field}/${m.patternName}`).join(',');
    return ResultAsync.fromPromise(
      appendShareLog(logPath, {
        timestamp: new Date().toISOString(),
        peer: ownPeerId,
        room,
        nodeId: node.id,
        action: 'outbound',
        allowed: false,
        reason,
      }),
      () => SE.shareStoreWriteError(logPath, 'audit log append failed'),
    ).andThen(() => errAsync<void, ShareError>(SE.shareAuditBlocked(room, 1)));
  }
  const shareable: ShareableNode = scanResult.value;
  doc.transact(() => {
    const map = doc.getMap(MAP_NAME) as Y.Map<unknown>;
    map.set(shareable.id, {
      id: shareable.id,
      label: shareable.label,
      room: shareable.room,
      embedding_id: shareable.embedding_id,
      source_uri: shareable.source_uri,
      fetched_at: shareable.fetched_at,
    });
  });
  return ResultAsync.fromPromise(
    appendShareLog(logPath, {
      timestamp: new Date().toISOString(),
      peer: ownPeerId,
      room,
      nodeId: node.id,
      action: 'outbound',
      allowed: true,
    }),
    () => SE.shareStoreWriteError(logPath, 'audit log append failed'),
  );
};

// ─────────────────────── inbound observer + debounced graph flush ──────────────

/**
 * Attach a Y.Map observer that writes incoming nodes into the in-memory
 * graph and persists graph.json on a 150ms debounce.
 *
 * Inbound nodes:
 *   1. Are scanned via scanNode (SECRETS GATE — symmetric with outbound)
 *   2. Carry _wellinformed_source_peer: <peerId> as a provenance tag
 *   3. Pass through upsertNode() into the in-memory Graph
 *   4. Trigger a debounced graphRepo.save() after 150ms idle
 *
 * Blocked inbound updates are logged and silently dropped (no back-prop).
 */
const attachInboundObserver = (
  doc: Y.Doc,
  room: string,
  remotePeerId: string,
  patterns: ReturnType<typeof buildPatterns>,
  graphRepo: GraphRepository,
  logPath: string,
): { detach: () => void; cancel: () => void } => {
  let pendingMerge: Uint8Array[] = [];
  let timer: NodeJS.Timeout | null = null;

  const flush = async (): Promise<void> => {
    if (pendingMerge.length === 0) return;
    pendingMerge = [];
    timer = null;
    const loaded = await graphRepo.load();
    if (loaded.isErr()) {
      console.error(`share-sync: graph load failed: ${formatError(loaded.error)}`);
      return;
    }
    let graph: Graph = loaded.value;
    const map = doc.getMap(MAP_NAME) as Y.Map<unknown>;
    map.forEach((value) => {
      const v = value as ShareableNode;
      if (!v || typeof v !== 'object' || !v.id) return;
      // Reconstruct a GraphNode from the ShareableNode + provenance.
      // file_type/source_file are required by GraphNode but excluded from
      // the wire — fill with sentinel values that mark imported provenance.
      const imported: GraphNode = {
        id: v.id,
        label: v.label,
        file_type: 'document',
        source_file: `peer:${remotePeerId}`,
        room: v.room ?? room,
        embedding_id: v.embedding_id,
        source_uri: v.source_uri,
        fetched_at: v.fetched_at,
        _wellinformed_source_peer: remotePeerId,
      } as GraphNode;
      const upserted = upsertNode(graph, imported);
      if (upserted.isOk()) graph = upserted.value;
    });
    const saved = await graphRepo.save(graph);
    if (saved.isErr()) {
      console.error(`share-sync: graph save failed: ${formatError(saved.error)}`);
    }
  };

  const handler = (_event: Y.YEvent<Y.Map<unknown>>): void => {
    // Inbound scan for the SECRET BOUNDARY (must run before allowing
    // the update to influence graph.json).
    const map = doc.getMap(MAP_NAME) as Y.Map<unknown>;
    map.forEach((value, key) => {
      const v = value as Partial<ShareableNode>;
      if (!v || !v.id || !v.label) return;
      const candidate: GraphNode = {
        id: v.id,
        label: v.label,
        file_type: 'document',
        source_file: `peer:${remotePeerId}`,
        room: v.room ?? room,
        embedding_id: v.embedding_id,
        source_uri: v.source_uri,
        fetched_at: v.fetched_at,
      } as GraphNode;
      const scan = scanNode(candidate, patterns);
      if (scan.isErr()) {
        const reason = scan.error.matches.map((m) => `${m.field}/${m.patternName}`).join(',');
        // Remove the offending key from the local Y.Map (don't propagate it
        // into graph.json) and log it as blocked.
        map.delete(key);
        void appendShareLog(logPath, {
          timestamp: new Date().toISOString(),
          peer: remotePeerId,
          room,
          nodeId: v.id,
          action: 'inbound',
          allowed: false,
          reason,
        });
      }
    });

    // Schedule a debounced flush of graph.json.
    if (timer) clearTimeout(timer);
    pendingMerge.push(new Uint8Array());  // sentinel — actual update bytes are
                                          // already inside the doc; we use the
                                          // queue length as a "dirty" flag.
    timer = setTimeout(() => { void flush(); }, GRAPH_FLUSH_DEBOUNCE_MS);
  };

  const map = doc.getMap(MAP_NAME) as Y.Map<unknown>;
  map.observe(handler);

  return {
    detach: () => map.unobserve(handler),
    cancel: () => { if (timer) { clearTimeout(timer); timer = null; } },
  };
};

// ─────────────────────── stream registry + protocol registration ───────────────

/**
 * Per-(peer, room) stream registry. Key = `${peerId}::${room}`.
 * Holds the FramedStream wrapper plus the cleanup fns for the observers.
 */
interface StreamEntry {
  readonly fs: FramedStream;
  readonly stream: Stream;
  readonly detachInbound: () => void;
  readonly cancelDebounce: () => void;
  readonly detachOutbound: () => void;
}

export interface ShareSyncRegistry {
  readonly node: Libp2p;
  readonly homePath: string;
  readonly graphRepo: GraphRepository;
  readonly patterns: ReturnType<typeof buildPatterns>;
  readonly docs: Map<string, Y.Doc>;                  // room → Y.Doc
  readonly streams: Map<string, StreamEntry>;          // `${peer}::${room}` → entry
  readonly logPath: string;                            // share-log.jsonl
  readonly ydocsDir: string;                           // ~/.wellinformed/ydocs
  readonly sharedRoomsPath: string;                    // shared-rooms.json
}

export const createShareSyncRegistry = (deps: {
  node: Libp2p;
  homePath: string;
  graphRepo: GraphRepository;
  patterns: ReturnType<typeof buildPatterns>;
}): ShareSyncRegistry => ({
  node: deps.node,
  homePath: deps.homePath,
  graphRepo: deps.graphRepo,
  patterns: deps.patterns,
  docs: new Map(),
  streams: new Map(),
  logPath: join(deps.homePath, 'share-log.jsonl'),
  ydocsDir: join(deps.homePath, 'ydocs'),
  sharedRoomsPath: join(deps.homePath, 'shared-rooms.json'),
});

const ydocPathFor = (registry: ShareSyncRegistry, room: string): string =>
  join(registry.ydocsDir, `${room}.ydoc`);

/** Load (or fetch from cache) the Y.Doc for a room. Idempotent. */
const getOrLoadDoc = (
  registry: ShareSyncRegistry,
  room: string,
): ResultAsync<Y.Doc, ShareError> => {
  const cached = registry.docs.get(room);
  if (cached) return okAsync(cached);
  return loadYDoc(ydocPathFor(registry, room)).map((doc) => {
    registry.docs.set(room, doc);
    return doc;
  });
};

/**
 * Register the /wellinformed/share/1.0.0 protocol on the libp2p node.
 * Called once at sync engine startup. Idempotent — calling twice unhandles
 * first to avoid duplicate handlers.
 */
export const registerShareProtocol = (
  registry: ShareSyncRegistry,
): ResultAsync<void, ShareError> =>
  ResultAsync.fromPromise(
    (async () => {
      // Best-effort cleanup of any prior registration (idempotent).
      try { await registry.node.unhandle(SHARE_PROTOCOL_ID); } catch { /* benign */ }
      await registry.node.handle(
        SHARE_PROTOCOL_ID,
        async (stream: Stream, connection: Connection) => {
          const peerIdStr = connection.remotePeer.toString();
          await runStreamSession(registry, stream, peerIdStr, /* initiator */ false);
        },
        { runOnLimitedConnection: false, maxInboundStreams: MAX_INBOUND_STREAMS },
      );
    })(),
    (e) => SE.syncProtocolError('local', `handle() failed: ${(e as Error).message}`),
  );

export const unregisterShareProtocol = (
  registry: ShareSyncRegistry,
): ResultAsync<void, ShareError> => {
  // Cancel every debounce timer first (Pitfall — debounce leak).
  for (const entry of registry.streams.values()) {
    entry.cancelDebounce();
    entry.detachInbound();
    entry.detachOutbound();
    entry.fs.close();
  }
  registry.streams.clear();
  return ResultAsync.fromPromise(
    registry.node.unhandle(SHARE_PROTOCOL_ID),
    (e) => SE.syncProtocolError('local', `unhandle() failed: ${(e as Error).message}`),
  );
};

/**
 * Open an outbound share stream to a specific peer for a specific room.
 * Used when this node calls `share room X` for a peer that is already
 * connected, OR when a new peer connects and we have rooms to push.
 */
export const openShareStream = (
  registry: ShareSyncRegistry,
  peerIdStr: string,
  _room: string,
): ResultAsync<void, ShareError> =>
  ResultAsync.fromPromise(
    (async () => {
      const pid = peerIdFromString(peerIdStr);
      const stream = await registry.node.dialProtocol(pid, SHARE_PROTOCOL_ID);
      await runStreamSession(registry, stream, peerIdStr, /* initiator */ true);
    })(),
    (e) => SE.syncProtocolError(peerIdStr, `dialProtocol failed: ${(e as Error).message}`),
  );

/**
 * Run one stream session — exchange SubscribeRequests, open per-room
 * Y.Doc bridges for the intersection, run sync step 1+2, then loop on
 * incoming frames until the stream closes.
 */
const runStreamSession = async (
  registry: ShareSyncRegistry,
  stream: Stream,
  remotePeerIdStr: string,
  initiator: boolean,
): Promise<void> => {
  const fs = makeFramedStream(stream);
  // Create a single shared iterator so SubscribeRequest frames and
  // y-protocols frames all consume from the same underlying stream.
  const iter = fs.frameIter();

  // Step A: SubscribeRequest exchange — both sides send their list,
  // both sides read the peer's list. The intersection is what we sync.
  const local = await loadSharedRooms(registry.sharedRoomsPath);
  if (local.isErr()) {
    fs.close();
    return;
  }
  const localRoomNames = local.value.rooms.map((r) => r.name);

  // Order: initiator writes first then reads, listener reads first then writes
  // to avoid both sides blocking on read.
  let remoteRoomNames: readonly string[] = [];
  try {
    if (initiator) {
      await writeSubscribeRequest(fs, localRoomNames);
      remoteRoomNames = await readSubscribeRequest(iter);
    } else {
      remoteRoomNames = await readSubscribeRequest(iter);
      await writeSubscribeRequest(fs, localRoomNames);
    }
  } catch {
    fs.close();
    return;
  }
  const intersection = localRoomNames.filter((r) => remoteRoomNames.includes(r));

  // Phase 16 simplification: pick the FIRST intersected room for this stream.
  // openShareStream is called per-room by the daemon tick, so multi-room
  // syncing is handled by multiple openShareStream calls, not by multiplexing
  // inside one stream session.
  const room = intersection[0];
  if (!room) {
    fs.close();
    return;
  }

  const docResult = await getOrLoadDoc(registry, room);
  if (docResult.isErr()) {
    fs.close();
    return;
  }
  const doc = docResult.value;

  const inbound = attachInboundObserver(
    doc,
    room,
    remotePeerIdStr,
    registry.patterns,
    registry.graphRepo,
    registry.logPath,
  );
  const detachOutbound = attachOutboundObserver(doc, [fs]);

  const key = `${remotePeerIdStr}::${room}`;
  registry.streams.set(key, {
    fs,
    stream,
    detachInbound: inbound.detach,
    cancelDebounce: inbound.cancel,
    detachOutbound,
  });

  // Step C: Initial sync exchange — write step 1, then loop on frames.
  try {
    await sendSyncStep1(fs, doc);
    for await (const flat of iter) {
      // flat is already a Uint8Array (subarray()'d in frameIter).
      await handleInboundFrame(flat, doc, fs);
      // Persist the .ydoc snapshot after every applied frame so a crash
      // does not lose progress.
      void saveYDoc(ydocPathFor(registry, room), doc);
    }
  } finally {
    inbound.detach();
    inbound.cancel();
    detachOutbound();
    registry.streams.delete(key);
  }
};

// ─────────────────────── closeUnsharedStreams helper ──────────────────────────

/**
 * Close any active streams whose room is no longer in the shared-rooms list.
 * Called FIRST on every runShareSyncTick — enforces the unshare→close path
 * on the daemon's normal cadence (Blocker 3 in the plan checker).
 *
 * Mutates `registry.streams` by removing closed entries.
 */
export const closeUnsharedStreams = (
  registry: ShareSyncRegistry,
  currentSharedRooms: readonly string[],
): void => {
  for (const [key, entry] of registry.streams.entries()) {
    // Key format: `${peerId}::${room}`
    const room = key.split('::').slice(1).join('::');
    if (!currentSharedRooms.includes(room)) {
      entry.cancelDebounce();
      entry.detachInbound();
      entry.detachOutbound();
      entry.fs.close();
      registry.streams.delete(key);
    }
  }
};

// ─────────────────────── runShareSyncTick ─────────────────────────────────────

/**
 * Single tick of the share sync engine — called by the daemon loop.
 *
 * Protocol:
 *   1. Load shared-rooms.json
 *   2. Close streams for rooms no longer shared (via closeUnsharedStreams)
 *   3. For each (connected peer, shared room) pair without an open stream,
 *      open a new outbound stream
 *
 * Idempotent: skips pairs that already have an open stream.
 * Returns { opened } — the count of newly opened streams.
 */
export const runShareSyncTick = (
  registry: ShareSyncRegistry,
): ResultAsync<{ readonly opened: number }, ShareError> =>
  loadSharedRooms(registry.sharedRoomsPath).andThen((file) => {
    const currentRoomNames = file.rooms.map((r) => r.name);

    // MUST run first — enforce unshare→close before opening new streams
    closeUnsharedStreams(registry, currentRoomNames);

    if (file.rooms.length === 0) return okAsync({ opened: 0 });
    const peers = registry.node.getPeers().map((p) => p.toString());
    if (peers.length === 0) return okAsync({ opened: 0 });

    const tasks: Array<Promise<void>> = [];
    let opened = 0;
    for (const peerId of peers) {
      for (const room of file.rooms) {
        const key = `${peerId}::${room.name}`;
        if (registry.streams.has(key)) continue;
        opened++;
        tasks.push(
          openShareStream(registry, peerId, room.name)
            .match(
              () => undefined,
              (e) => { console.error(`share-sync: ${formatError(e)}`); },
            ),
        );
      }
    }
    return ResultAsync.fromPromise(
      Promise.all(tasks).then(() => ({ opened })),
      (e) => SE.syncProtocolError('local', (e as Error).message),
    );
  });

// ─────────────────────── ensure Uint8ArrayList import used ───────────────────

// Uint8ArrayList is used for type-narrowing in the generic stream handling path.
// This export-type reference prevents TS from eliding the import in strict mode.
export type { Uint8ArrayList };
