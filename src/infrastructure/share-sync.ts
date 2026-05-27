/**
 * Share sync — y-protocols sync over libp2p (V5).
 *
 * Single global Y.Doc at `~/.wellinformed/graph.ydoc`; sharing gate is per-node
 * `node.private === false`; subscribe envelope carries `{type, protocol_version: 5}`
 * (pre-V5 envelopes with a `rooms` array are rejected); stream + bandwidth-limiter
 * keys are peerId only.
 *
 * Preserved invariants: (1) REMOTE_ORIGIN Symbol is both applyUpdate origin and
 * outbound-observer early-return — echo-loop prevention; (2) V1 encoding only —
 * never encodeStateAsUpdateV2/applyUpdateV2; (3) only emit y-protocols response
 * frames when `encoding.length(enc) > 0`; (4) lp.decode yields Uint8ArrayList —
 * call .subarray() before createDecoder; (5) classifyInboundShare + scanNode
 * gates run before any graph upsert and blocked values are logged + dropped
 * (never back-propagated); (6) debounce timers cleared on unregister.
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
import type { GraphRepository } from './graph-repository.js';
import { createRateLimiter, type RateLimiter } from './search-sync.js';
import { metrics } from '../domain/metrics.js';
import { classifyInboundShare, sharePolicyModeFromEnv, type SharePolicyMode } from '../domain/share-policy.js';
import { inProcessIdentityResolver, type IdentityResolver } from './identity-resolver.js';

export const SHARE_PROTOCOL_ID = '/wellinformed/share/1.0.0' as const;
export const SHARE_PROTOCOL_VERSION = 5 as const;

/** Module-level Symbol for echo-loop prevention. */
export const REMOTE_ORIGIN: unique symbol = Symbol('wellinformed-share-remote');

const GRAPH_FLUSH_DEBOUNCE_MS = 150;
const MAX_INBOUND_STREAMS = 32;
const MAP_NAME = 'nodes' as const;
const GRAPH_YDOC_FILE = 'graph.ydoc' as const;
const VERDICT_METRIC = {
  signed_ok: 'signed_ok', signed_invalid: 'signature_invalid',
  unsigned_allowed: 'unsigned_allowed', unsigned_rejected: 'unsigned_rejected',
  malformed: 'malformed',
} as const;

interface FramedStream {
  write(data: Uint8Array): Promise<void>;
  frameIter(): AsyncGenerator<Uint8Array, void, undefined>;
  close(): void;
}

const makeFramedStream = (stream: Stream): FramedStream => {
  const frameIter = async function* (): AsyncGenerator<Uint8Array, void, undefined> {
    for await (const msg of lp.decode(stream)) yield msg.subarray();
  };
  return {
    write: async (data) => {
      for await (const chunk of lp.encode([data])) stream.send(chunk);
    },
    frameIter,
    close: () => { try { void stream.close(); } catch { /* benign */ } },
  };
};

interface SubscribeRequest {
  readonly type: 'subscribe';
  readonly protocol_version: 5;
}

const writeSubscribeRequest = async (fs: FramedStream): Promise<void> => {
  const payload: SubscribeRequest = { type: 'subscribe', protocol_version: SHARE_PROTOCOL_VERSION };
  // Outbound V5 fence: defence-in-depth assert before transmit.
  if (payload.protocol_version !== SHARE_PROTOCOL_VERSION) {
    throw new Error(`share-sync: outbound SubscribeRequest must be V${SHARE_PROTOCOL_VERSION}`);
  }
  await fs.write(new TextEncoder().encode(JSON.stringify(payload)));
};

/** V5 inbound guards: reject `rooms` field; require `protocol_version === 5`. */
const readSubscribeRequest = async (
  iter: AsyncGenerator<Uint8Array, void, undefined>,
  peer: string,
): Promise<void> => {
  const result = await iter.next();
  if (result.done || !result.value) throw new Error('stream ended before SubscribeRequest');
  const p = JSON.parse(new TextDecoder().decode(result.value)) as Record<string, unknown>;
  if (!p || typeof p !== 'object' || p.type !== 'subscribe') {
    throw new Error('malformed SubscribeRequest');
  }
  if ('rooms' in p) {
    throw new Error(`protocol mismatch: peer ${peer} sent pre-V5 SubscribeRequest with 'rooms' field`);
  }
  if (p.protocol_version !== SHARE_PROTOCOL_VERSION) {
    throw new Error(`protocol mismatch: peer ${peer} protocol_version=${String(p.protocol_version)}; expected ${SHARE_PROTOCOL_VERSION}`);
  }
};

interface ShareLogEntry {
  readonly timestamp: string;
  readonly peer: string;
  readonly nodeId: string;
  readonly action: 'inbound' | 'outbound' | 'bandwidth_limited';
  readonly allowed: boolean;
  readonly reason?: string;
}

const appendShareLog = async (logPath: string, entry: ShareLogEntry): Promise<void> => {
  try {
    await mkdir(dirname(logPath), { recursive: true });
    await appendFile(logPath, JSON.stringify(entry) + '\n');
  } catch { /* best-effort */ }
};

const sendSyncStep1 = async (fs: FramedStream, doc: Y.Doc): Promise<void> => {
  const enc = encoding.createEncoder();
  syncProtocol.writeSyncStep1(enc, doc);
  await fs.write(encoding.toUint8Array(enc));
};

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

const attachOutboundObserver = (
  doc: Y.Doc,
  framedStreams: readonly FramedStream[],
): (() => void) => {
  const handler = (update: Uint8Array, origin: unknown): void => {
    if (origin === REMOTE_ORIGIN) return;  // ECHO LOOP PREVENTION
    const enc = encoding.createEncoder();
    syncProtocol.writeUpdate(enc, update);
    const bytes = encoding.toUint8Array(enc);
    for (const fs of framedStreams) fs.write(bytes).catch(() => { /* dead — reaped */ });
  };
  doc.on('update', handler);
  return () => doc.off('update', handler);
};

/**
 * Project a node to a ShareableNode and write into the global Y.Doc.
 * Pipeline: bandwidth gate (NET-02) → secrets scan (SEC-01) → Y.Map upsert.
 * Origin defaults to undefined so the outbound observer fires AND broadcasts.
 * NEVER pass REMOTE_ORIGIN here — that is reserved for inbound applyUpdate.
 */
export const syncNodeIntoYDoc = (
  doc: Y.Doc,
  node: GraphNode,
  patterns: ReturnType<typeof buildPatterns>,
  logPath: string,
  ownPeerId: string,
  /** Optional per-peer rate limiter (V5: no room dimension). */
  limiter?: RateLimiter,
): ResultAsync<void, ShareError> => {
  const writeErr = (): ShareError => SE.shareStoreWriteError(logPath, 'audit log append failed');
  const log = (
    action: ShareLogEntry['action'], allowed: boolean, reason?: string,
  ): Promise<void> => appendShareLog(logPath, {
    timestamp: new Date().toISOString(), peer: ownPeerId, nodeId: node.id, action, allowed, reason,
  });

  if (limiter !== undefined && !limiter.consume(ownPeerId)) {
    return ResultAsync.fromPromise(log('bandwidth_limited', false, 'rate_limit_exceeded'), writeErr)
      .andThen(() => errAsync<void, ShareError>(SE.bandwidthExceeded(ownPeerId, '')));
  }

  const scanResult = scanNode(node, patterns);
  if (scanResult.isErr()) {
    const reason = scanResult.error.matches.map((m) => `${m.field}/${m.patternName}`).join(',');
    return ResultAsync.fromPromise(log('outbound', false, reason), writeErr)
      .andThen(() => errAsync<void, ShareError>(SE.shareAuditBlocked('', 1)));
  }

  // Y.Map upsert. ShareableNode.room is omitted from the wire payload (V5).
  const s: ShareableNode = scanResult.value;
  doc.transact(() => {
    const map = doc.getMap(MAP_NAME) as Y.Map<unknown>;
    map.set(s.id, {
      id: s.id, label: s.label,
      embedding_id: s.embedding_id, source_uri: s.source_uri, fetched_at: s.fetched_at,
    });
  });

  return ResultAsync.fromPromise(log('outbound', true), writeErr);
};

/**
 * V5 sharing gate: every node with `private === false` is a federation
 * candidate. Replaces the prior room-authorization pipeline.
 */
export const collectShareable = (graph: Graph): readonly GraphNode[] =>
  graph.json.nodes.filter((n: GraphNode) => n.private === false);

interface Screened { readonly payload: ShareableNode; readonly signedBy?: string }

/** Policy gate (crypto trust). Bumps metric, records signed-DID provenance. */
const screenInbound = (
  value: unknown,
  policyMode: SharePolicyMode,
  identityResolver: IdentityResolver,
): Screened | null => {
  const c = classifyInboundShare(value, policyMode);
  metrics.counter(`share.inbound.${VERDICT_METRIC[c.verdict]}`).inc();
  if (c.verdict === 'signed_ok') {
    identityResolver.record({
      did: c.verified.verified_user_did,
      device_id: c.verified.verified_device_id,
      room: '',  // V5: dim dropped; arg kept for legacy resolver shape
    });
    return { payload: c.payload, signedBy: c.verified.verified_user_did };
  }
  return c.verdict === 'unsigned_allowed' ? { payload: c.payload } : null;
};

const buildImportedNode = (peer: string, v: ShareableNode, signedBy?: string): GraphNode => ({
  id: v.id, label: v.label,
  file_type: 'document', source_file: `peer:${peer}`, private: false,
  embedding_id: v.embedding_id, source_uri: v.source_uri, fetched_at: v.fetched_at,
  _wellinformed_source_peer: peer,
  ...(signedBy ? { _wellinformed_signed_by: signedBy } : {}),
} as GraphNode);

const logInbound = (logPath: string, peer: string, nodeId: string, reason: string): void => {
  void appendShareLog(logPath, {
    timestamp: new Date().toISOString(),
    peer, nodeId, action: 'inbound', allowed: false, reason,
  });
};

/**
 * Y.Map observer: classifyInboundShare → scanNode → upsertNode, persisted on a
 * 150 ms debounce. Blocked values are removed from the Y.Map and logged —
 * never back-propagated to the peer.
 */
const attachInboundObserver = (
  doc: Y.Doc,
  peer: string,
  patterns: ReturnType<typeof buildPatterns>,
  graphRepo: GraphRepository,
  logPath: string,
  policyMode: SharePolicyMode,
  identityResolver: IdentityResolver,
): { detach: () => void; cancel: () => void } => {
  let dirty = false;
  let timer: NodeJS.Timeout | null = null;

  const flush = async (): Promise<void> => {
    if (!dirty) return;
    dirty = false; timer = null;
    const loaded = await graphRepo.load();
    if (loaded.isErr()) {
      console.error(`share-sync: graph load failed: ${formatError(loaded.error)}`);
      return;
    }
    let graph: Graph = loaded.value;
    const map = doc.getMap(MAP_NAME) as Y.Map<unknown>;
    map.forEach((value) => {
      const s = screenInbound(value, policyMode, identityResolver);
      if (!s) return;
      const r = upsertNode(graph, buildImportedNode(peer, s.payload, s.signedBy));
      if (r.isOk()) graph = r.value;
    });
    const saved = await graphRepo.save(graph);
    if (saved.isErr()) console.error(`share-sync: graph save failed: ${formatError(saved.error)}`);
  };

  const handler = (_event: Y.YEvent<Y.Map<unknown>>): void => {
    // Policy first (crypto trust) → secrets scan against unwrapped payload.
    const map = doc.getMap(MAP_NAME) as Y.Map<unknown>;
    map.forEach((value, key) => {
      const s = screenInbound(value, policyMode, identityResolver);
      if (!s) {
        map.delete(key);
        const nid = typeof (value as { id?: unknown })?.id === 'string'
          ? (value as { id: string }).id : '<unknown>';
        logInbound(logPath, peer, nid, 'policy_drop');
        return;
      }
      const scan = scanNode(buildImportedNode(peer, s.payload), patterns);
      if (scan.isErr()) {
        map.delete(key);
        logInbound(logPath, peer, s.payload.id,
          scan.error.matches.map((m) => `${m.field}/${m.patternName}`).join(','));
      }
    });
    if (timer) clearTimeout(timer);
    dirty = true;
    timer = setTimeout(() => { void flush(); }, GRAPH_FLUSH_DEBOUNCE_MS);
  };

  const map = doc.getMap(MAP_NAME) as Y.Map<unknown>;
  map.observe(handler);
  return {
    detach: () => map.unobserve(handler),
    cancel: () => { if (timer) { clearTimeout(timer); timer = null; } },
  };
};

/** Per-peer stream entry. V5: key is peerId only. */
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
  /** Single global Y.Doc — lazy-loaded on first stream session. */
  doc: Y.Doc | null;
  /** peerId → StreamEntry (V5: no composite key). */
  readonly streams: Map<string, StreamEntry>;
  readonly logPath: string;
  /** Absolute path to the single global graph.ydoc file. */
  readonly ydocPath: string;
  readonly limiter?: RateLimiter;
  readonly policyMode: SharePolicyMode;
  readonly identityResolver: IdentityResolver;
}

export const createShareSyncRegistry = (deps: {
  node: Libp2p;
  homePath: string;
  graphRepo: GraphRepository;
  patterns: ReturnType<typeof buildPatterns>;
  /** Outbound rate cap. Omit to skip bandwidth gating. V5: peer-only key. */
  maxUpdatesPerSecPerPeerPerRoom?: number;
  policyMode?: SharePolicyMode;
  identityResolver?: IdentityResolver;
}): ShareSyncRegistry => {
  const r = deps.maxUpdatesPerSecPerPeerPerRoom;
  return {
    node: deps.node, homePath: deps.homePath, graphRepo: deps.graphRepo,
    patterns: deps.patterns, doc: null, streams: new Map(),
    logPath: join(deps.homePath, 'share-log.jsonl'),
    ydocPath: join(deps.homePath, GRAPH_YDOC_FILE),
    limiter: r !== undefined ? createRateLimiter(r, r) : undefined,
    policyMode: deps.policyMode ?? sharePolicyModeFromEnv(),
    identityResolver: deps.identityResolver ?? inProcessIdentityResolver(),
  };
};

const getOrLoadDoc = (registry: ShareSyncRegistry): ResultAsync<Y.Doc, ShareError> => {
  if (registry.doc) return okAsync(registry.doc);
  return loadYDoc(registry.ydocPath).map((doc) => {
    registry.doc = doc;
    return doc;
  });
};

export const registerShareProtocol = (
  registry: ShareSyncRegistry,
): ResultAsync<void, ShareError> =>
  ResultAsync.fromPromise((async () => {
    try { await registry.node.unhandle(SHARE_PROTOCOL_ID); } catch { /* benign */ }
    await registry.node.handle(SHARE_PROTOCOL_ID,
      async (stream: Stream, connection: Connection) => {
        await runStreamSession(registry, stream, connection.remotePeer.toString(), false);
      },
      { runOnLimitedConnection: false, maxInboundStreams: MAX_INBOUND_STREAMS },
    );
  })(), (e) => SE.syncProtocolError('local', `handle() failed: ${(e as Error).message}`));

export const unregisterShareProtocol = (
  registry: ShareSyncRegistry,
): ResultAsync<void, ShareError> => {
  // Cancel every debounce timer (Pitfall — debounce leak).
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

/** Open outbound share stream to a peer (V5: no room argument). */
export const openShareStream = (
  registry: ShareSyncRegistry,
  peerIdStr: string,
): ResultAsync<void, ShareError> =>
  ResultAsync.fromPromise((async () => {
    const stream = await registry.node.dialProtocol(peerIdFromString(peerIdStr), SHARE_PROTOCOL_ID);
    await runStreamSession(registry, stream, peerIdStr, true);
  })(), (e) => SE.syncProtocolError(peerIdStr, `dialProtocol failed: ${(e as Error).message}`));

/**
 * Stream session: V5 SubscribeRequest exchange → attach observers to the global
 * Y.Doc → sync step 1+2 → loop on incoming frames until close.
 */
const runStreamSession = async (
  registry: ShareSyncRegistry,
  stream: Stream,
  remotePeerIdStr: string,
  initiator: boolean,
): Promise<void> => {
  const fs = makeFramedStream(stream);
  const iter = fs.frameIter();

  try {
    // Initiator writes first; listener inverse — avoid double-read block.
    if (initiator) {
      await writeSubscribeRequest(fs);
      await readSubscribeRequest(iter, remotePeerIdStr);
    } else {
      await readSubscribeRequest(iter, remotePeerIdStr);
      await writeSubscribeRequest(fs);
    }
  } catch (e) {
    console.error(`share-sync: ${(e as Error).message}`);
    fs.close();
    return;
  }

  const docResult = await getOrLoadDoc(registry);
  if (docResult.isErr()) { fs.close(); return; }
  const doc = docResult.value;

  const inbound = attachInboundObserver(
    doc, remotePeerIdStr, registry.patterns, registry.graphRepo,
    registry.logPath, registry.policyMode, registry.identityResolver,
  );
  const detachOutbound = attachOutboundObserver(doc, [fs]);

  registry.streams.set(remotePeerIdStr, {
    fs, stream,
    detachInbound: inbound.detach, cancelDebounce: inbound.cancel, detachOutbound,
  });

  try {
    await sendSyncStep1(fs, doc);
    for await (const flat of iter) {
      await handleInboundFrame(flat, doc, fs);
      // Persist .ydoc snapshot after every applied frame (V1 encoding only).
      void saveYDoc(registry.ydocPath, doc);
    }
  } finally {
    inbound.detach();
    inbound.cancel();
    detachOutbound();
    registry.streams.delete(remotePeerIdStr);
  }
};

/**
 * Single daemon tick. V5: for each connected peer without an open stream,
 * dial one outbound. The full non-private graph syncs via y-protocols.
 * Idempotent: skips peers with an existing stream.
 */
export const runShareSyncTick = (
  registry: ShareSyncRegistry,
): ResultAsync<{ readonly opened: number }, ShareError> => {
  const peers = registry.node.getPeers().map((p) => p.toString());
  if (peers.length === 0) return okAsync({ opened: 0 });

  const tasks: Array<Promise<void>> = [];
  let opened = 0;
  for (const peerId of peers) {
    if (registry.streams.has(peerId)) continue;
    opened++;
    tasks.push(
      openShareStream(registry, peerId)
        .match(() => undefined, (e) => { console.error(`share-sync: ${formatError(e)}`); }),
    );
  }
  return ResultAsync.fromPromise(
    Promise.all(tasks).then(() => ({ opened })),
    (e) => SE.syncProtocolError('local', (e as Error).message),
  );
};

// Type re-export to prevent strict-mode import elision.
export type { Uint8ArrayList };
