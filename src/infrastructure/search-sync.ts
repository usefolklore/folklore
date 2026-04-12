/**
 * Search sync — one-shot request/response federated search over a libp2p custom protocol.
 *
 * Phase 17 core. Registers /wellinformed/search/1.0.0 on a libp2p node.
 * Unlike share-sync.ts this is read-only: no Y.js docs, no CRDT mutations,
 * no REMOTE_ORIGIN needed, no debounce timers.
 *
 * CRITICAL invariants — every reviewer must check these:
 *   1. SEARCH_PROTOCOL_ID is '/wellinformed/search/1.0.0' — separate from
 *      '/wellinformed/share/1.0.0' so sync and search have independent stream
 *      lifecycles (CONTEXT.md locked decision).
 *
 *   2. FramedStream is COPIED from share-sync.ts, NOT imported. Search and share
 *      streams have independent lifecycles (CONTEXT.md locked decision). If either
 *      protocol evolves its framing, the other should NOT inherit the change
 *      automatically.
 *
 *   3. Float32Array precision (Pitfall 3, 17-RESEARCH.md): outbound embeddings are
 *      sent as JSON number[] via Array.from(embedding). Inbound arrays are
 *      reconstructed via new Float32Array(req.embedding). Precision loss at the
 *      6th–7th decimal place is acceptable for cosine distance comparison.
 *
 *   4. lp.decode yields Uint8ArrayList — frameIter already calls .subarray() to
 *      flatten. Every consumer of frameIter receives a plain Uint8Array (Pitfall 4).
 *
 *   5. Rate limiter Map memory leak (Pitfall 7, 17-RESEARCH.md): evictIdle() is
 *      called on EVERY consume() call. A standalone timer is fragile; inline
 *      pruning ensures eviction runs whenever the bucket is used.
 *
 *   6. Inbound authorization: only rooms listed in local shared-rooms.json respond.
 *      Non-shared rooms return an empty match set with error:'unauthorized'.
 *      No per-peer ACL in Phase 17 — room-level only (CONTEXT.md).
 *
 *   7. Audit log: every inbound search request and outbound response is appended
 *      to share-log.jsonl (same file as share-sync.ts per CONTEXT.md decision).
 */
import * as lp from 'it-length-prefixed';
import { ResultAsync } from 'neverthrow';
import { appendFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import type { Libp2p, Stream, Connection } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';
import type { SearchError } from '../domain/errors.js';
import { SearchError as SEARCH_ERR } from '../domain/errors.js';
import type { VectorIndex } from './vector-index.js';
import type { Match, Vector } from '../domain/vectors.js';
import { DEFAULT_DIM } from '../domain/vectors.js';
import type { Room } from '../domain/graph.js';
import { loadSharedRooms } from './share-store.js';

// ─────────────────────── constants ────────────────────────────────────────────

export const SEARCH_PROTOCOL_ID = '/wellinformed/search/1.0.0' as const;
const MAX_INBOUND_STREAMS = 32;
/** Per-peer outbound timeout — locked from CONTEXT.md (2s). */
const PER_PEER_TIMEOUT_MS = 2000;
/** Idle eviction threshold — prune peers unseen for 5+ minutes (Pitfall 7). */
const RATE_LIMIT_IDLE_EVICT_MS = 5 * 60 * 1000;

// ─────────────────────── FramedStream abstraction ─────────────────────────────

/**
 * Copied from share-sync.ts — NOT imported. Search and share streams have
 * independent lifecycles (CONTEXT.md locked decision). If either protocol
 * evolves its framing, the other should NOT inherit the change automatically.
 *
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

// ─────────────────────── wire format ──────────────────────────────────────────

/**
 * Outbound search request.
 * embedding is number[] (JSON-safe) — reconstructed as Float32Array on inbound
 * (Pitfall 3 from 17-RESEARCH.md: acceptable precision loss at 6th-7th decimal).
 */
export interface SearchRequest {
  readonly type: 'search';
  readonly embedding: number[];   // JSON-safe — reconstructed as Float32Array on inbound
  readonly room?: string;
  readonly k: number;
}

/**
 * A match result annotated with peer provenance.
 * _source_peer: null = local result; string = remote peer PeerId.
 */
export interface PeerMatch extends Match {
  readonly label?: string;         // optional: responding peer includes if available
  readonly source_uri?: string;
  readonly _source_peer: string | null;  // null = local, peerId string = remote
}

/**
 * Inbound search response from a remote peer.
 * matches omit _source_peer (peer doesn't know its own id).
 * error field is set on failure cases — caller receives empty matches.
 */
export interface SearchResponse {
  readonly type: 'search_response';
  readonly matches: ReadonlyArray<Omit<PeerMatch, '_source_peer'>>;
  readonly error?: 'dimension_mismatch' | 'unauthorized' | 'rate_limited' | 'protocol';
}

// ─────────────────────── token bucket rate limiter ────────────────────────────

/**
 * Token bucket state per peer.
 * lastActive is used by evictIdle to prune stale entries (Pitfall 7).
 */
interface BucketState {
  tokens: number;
  lastRefill: number;   // Date.now() ms
  lastActive: number;   // Date.now() ms — for idle eviction (Pitfall 7)
}

export interface RateLimiter {
  /** Consume one token for peerId. Returns true if allowed, false if rate limited. */
  consume(peerId: string): boolean;
  /**
   * Evict idle buckets. Called internally on each consume (inline pruning).
   * Also exported for tests and admin use.
   * Returns the count of evicted entries.
   */
  evictIdle(nowMs?: number): number;
  /** Test hook — peek current bucket state without mutation. */
  peek(peerId: string): Readonly<BucketState> | undefined;
}

/**
 * Create a token bucket rate limiter.
 *
 * Tokens refill at ratePerSec tokens/second up to burst capacity.
 * A new peer starts with a full burst bucket.
 *
 * PITFALL LOCK (Pitfall 7): evictIdle() is called inside consume() on every
 * request. A standalone timer is fragile — inline pruning bounds Map growth
 * to active peer count without a separate cleanup lifecycle.
 */
export const createRateLimiter = (
  ratePerSec: number,
  burst: number,
): RateLimiter => {
  const buckets = new Map<string, BucketState>();

  const evictIdle = (nowMs: number = Date.now()): number => {
    let removed = 0;
    for (const [peer, state] of buckets.entries()) {
      if (nowMs - state.lastActive > RATE_LIMIT_IDLE_EVICT_MS) {
        buckets.delete(peer);
        removed++;
      }
    }
    return removed;
  };

  const consume = (peerId: string): boolean => {
    const now = Date.now();
    // Cheap incremental prune on every consume call — O(n) but n is
    // bounded by active peer count which is small in practice.
    // Pitfall 7 (17-RESEARCH.md) — unbounded Map growth.
    evictIdle(now);

    const state = buckets.get(peerId) ?? { tokens: burst, lastRefill: now, lastActive: now };
    const elapsed = (now - state.lastRefill) / 1000;
    const refilled = Math.min(burst, state.tokens + elapsed * ratePerSec);
    if (refilled < 1) {
      buckets.set(peerId, { tokens: refilled, lastRefill: now, lastActive: now });
      return false;   // rate limited
    }
    buckets.set(peerId, { tokens: refilled - 1, lastRefill: now, lastActive: now });
    return true;      // allowed
  };

  const peek = (peerId: string): Readonly<BucketState> | undefined => buckets.get(peerId);

  return { consume, evictIdle, peek };
};

// ─────────────────────── audit log ────────────────────────────────────────────

/**
 * Search audit log entry. Appended to share-log.jsonl (same file as
 * share-sync.ts per CONTEXT.md decision — single log for all P2P activity).
 */
interface SearchLogEntry {
  readonly timestamp: string;
  readonly peer: string;
  readonly room?: string;
  readonly action: 'search_request' | 'search_response';
  readonly outcome: 'allowed' | 'unauthorized' | 'rate_limited' | 'dimension_mismatch' | 'error';
  readonly k?: number;
  readonly resultCount?: number;
}

const appendSearchLog = async (logPath: string, entry: SearchLogEntry): Promise<void> => {
  try {
    await mkdir(dirname(logPath), { recursive: true });
    await appendFile(logPath, JSON.stringify(entry) + '\n');
  } catch {
    // best-effort — never fail a request because audit append failed
  }
};

// ─────────────────────── inbound handler ──────────────────────────────────────

interface SearchHandlerDeps {
  readonly vectorIndex: VectorIndex;
  readonly sharedRoomsPath: string;
  readonly logPath: string;
  readonly rateLimiter: RateLimiter;
  readonly expectedDim: number;   // DEFAULT_DIM from vectors.ts
}

/**
 * Handle one inbound search stream.
 *
 * Protocol (one-shot request/response):
 *   1. Read one length-prefixed JSON frame (SearchRequest)
 *   2. Rate-limit check (token bucket per peerId)
 *   3. Dimension guard (req.embedding.length === 384)
 *   4. Room authorization (room must be in local shared-rooms.json)
 *   5. Reconstruct Float32Array from number[] (Pitfall 3)
 *   6. Query vectorIndex.searchByRoom or union-of-shared-rooms global search
 *   7. Write one length-prefixed JSON frame (SearchResponse)
 *   8. Append audit log entry
 *   9. Close stream
 */
const handleSearchRequest = async (
  deps: SearchHandlerDeps,
  stream: Stream,
  remotePeerId: string,
): Promise<void> => {
  const fs = makeFramedStream(stream);
  try {
    const iter = fs.frameIter();
    const first = await iter.next();
    if (first.done || !first.value) { fs.close(); return; }

    // Parse request (JSON over length-prefixed frame)
    let req: SearchRequest;
    try {
      const parsed = JSON.parse(new TextDecoder().decode(first.value)) as unknown;
      if (
        !parsed || typeof parsed !== 'object' ||
        (parsed as { type?: unknown }).type !== 'search' ||
        !Array.isArray((parsed as { embedding?: unknown }).embedding) ||
        typeof (parsed as { k?: unknown }).k !== 'number'
      ) {
        throw new Error('malformed SearchRequest');
      }
      req = parsed as SearchRequest;
    } catch {
      const errResp: SearchResponse = { type: 'search_response', matches: [], error: 'protocol' };
      await fs.write(new TextEncoder().encode(JSON.stringify(errResp)));
      fs.close();
      return;
    }

    // Rate limit check (Pitfall 7 — evictIdle runs inside consume)
    if (!deps.rateLimiter.consume(remotePeerId)) {
      const errResp: SearchResponse = { type: 'search_response', matches: [], error: 'rate_limited' };
      await fs.write(new TextEncoder().encode(JSON.stringify(errResp)));
      void appendSearchLog(deps.logPath, {
        timestamp: new Date().toISOString(), peer: remotePeerId, room: req.room,
        action: 'search_request', outcome: 'rate_limited', k: req.k,
      });
      fs.close();
      return;
    }

    // Dimension guard (Pitfall 3 mitigation — check length before Float32Array construction)
    if (req.embedding.length !== deps.expectedDim) {
      const errResp: SearchResponse = { type: 'search_response', matches: [], error: 'dimension_mismatch' };
      await fs.write(new TextEncoder().encode(JSON.stringify(errResp)));
      void appendSearchLog(deps.logPath, {
        timestamp: new Date().toISOString(), peer: remotePeerId, room: req.room,
        action: 'search_request', outcome: 'dimension_mismatch', k: req.k,
      });
      fs.close();
      return;
    }

    // Room authorization — only respond to rooms listed in shared-rooms.json
    if (req.room !== undefined) {
      const sharedRes = await loadSharedRooms(deps.sharedRoomsPath);
      if (sharedRes.isErr() || !sharedRes.value.rooms.some((r) => r.name === req.room)) {
        const errResp: SearchResponse = { type: 'search_response', matches: [], error: 'unauthorized' };
        await fs.write(new TextEncoder().encode(JSON.stringify(errResp)));
        void appendSearchLog(deps.logPath, {
          timestamp: new Date().toISOString(), peer: remotePeerId, room: req.room,
          action: 'search_request', outcome: 'unauthorized', k: req.k,
        });
        fs.close();
        return;
      }
    }

    // Log the allowed search_request BEFORE running the query
    void appendSearchLog(deps.logPath, {
      timestamp: new Date().toISOString(), peer: remotePeerId, room: req.room,
      action: 'search_request', outcome: 'allowed', k: req.k,
    });

    // Reconstruct Float32Array from JSON number[] (Pitfall 3 — acceptable precision loss)
    const embedding: Vector = new Float32Array(req.embedding);

    // Global queries are ALSO room-restricted: only vectors whose room is in
    // shared-rooms.json may leak out. For safety, an unconstrained global
    // query is converted to the union of shared rooms. If none are shared,
    // return empty matches.
    let matches: readonly Match[] = [];
    if (req.room) {
      const r = await deps.vectorIndex.searchByRoom(req.room as Room, embedding, req.k);
      matches = r.isOk() ? r.value : [];
    } else {
      const sharedRes = await loadSharedRooms(deps.sharedRoomsPath);
      if (sharedRes.isOk() && sharedRes.value.rooms.length > 0) {
        // For each shared room, run searchByRoom and merge. Keep top-k by distance.
        const all: Match[] = [];
        for (const r of sharedRes.value.rooms) {
          const res = await deps.vectorIndex.searchByRoom(r.name as Room, embedding, req.k);
          if (res.isOk()) all.push(...res.value);
        }
        matches = all.sort((a, b) => a.distance - b.distance).slice(0, req.k);
      }
      // else: no shared rooms → empty matches (not an error; normal case for fresh install)
    }

    const response: SearchResponse = {
      type: 'search_response',
      matches: matches.map((m) => ({
        node_id: m.node_id,
        room: m.room,
        wing: m.wing,
        distance: m.distance,
      })),
    };
    await fs.write(new TextEncoder().encode(JSON.stringify(response)));
    void appendSearchLog(deps.logPath, {
      timestamp: new Date().toISOString(), peer: remotePeerId, room: req.room,
      action: 'search_response', outcome: 'allowed', k: req.k, resultCount: matches.length,
    });
  } finally {
    fs.close();
  }
};

// ─────────────────────── registry + protocol registration ─────────────────────

export interface SearchRegistry {
  readonly node: Libp2p;
  readonly deps: SearchHandlerDeps;
}

/**
 * Create a SearchRegistry. Holds the node reference and all handler deps.
 * Call registerSearchProtocol(registry) to begin accepting inbound search streams.
 */
export const createSearchRegistry = (
  node: Libp2p,
  homePath: string,
  vectorIndex: VectorIndex,
  ratePerSec: number,
  burst: number,
): SearchRegistry => ({
  node,
  deps: {
    vectorIndex,
    sharedRoomsPath: join(homePath, 'shared-rooms.json'),
    logPath: join(homePath, 'share-log.jsonl'),
    rateLimiter: createRateLimiter(ratePerSec, burst),
    expectedDim: DEFAULT_DIM,
  },
});

/**
 * Register the /wellinformed/search/1.0.0 protocol on the libp2p node.
 * Idempotent — unhandles any prior registration before re-registering.
 * Mirrors the registerShareProtocol shape from share-sync.ts.
 */
export const registerSearchProtocol = (
  registry: SearchRegistry,
): ResultAsync<void, SearchError> =>
  ResultAsync.fromPromise(
    (async () => {
      // Best-effort cleanup of any prior registration (idempotent).
      try { await registry.node.unhandle(SEARCH_PROTOCOL_ID); } catch { /* benign */ }
      await registry.node.handle(
        SEARCH_PROTOCOL_ID,
        async (stream: Stream, connection: Connection) => {
          const peerIdStr = connection.remotePeer.toString();
          await handleSearchRequest(registry.deps, stream, peerIdStr);
        },
        { runOnLimitedConnection: false, maxInboundStreams: MAX_INBOUND_STREAMS },
      );
    })(),
    (e) => SEARCH_ERR.protocolError('local', `handle() failed: ${(e as Error).message}`),
  );

/**
 * Unregister the /wellinformed/search/1.0.0 protocol.
 * Search streams are one-shot (no persistent registry state to clean up).
 */
export const unregisterSearchProtocol = (
  registry: SearchRegistry,
): ResultAsync<void, SearchError> =>
  ResultAsync.fromPromise(
    registry.node.unhandle(SEARCH_PROTOCOL_ID),
    (e) => SEARCH_ERR.protocolError('local', `unhandle() failed: ${(e as Error).message}`),
  );

// ─────────────────────── outbound helper ──────────────────────────────────────

/**
 * Open a one-shot search stream to a single peer.
 *
 * Dials SEARCH_PROTOCOL_ID, writes one JSON frame (SearchRequest),
 * reads one JSON frame (SearchResponse), closes. Returns PeerMatch[] with
 * _source_peer annotated as peerIdStr.
 *
 * Per-peer timeout is NOT applied here — the caller (federated-search.ts)
 * wraps each openSearchStream call in a Promise.race with a 2000ms timeout
 * per the PER_PEER_TIMEOUT_MS constant (CONTEXT.md locked).
 *
 * On any peer error (protocol, rate_limited, dimension_mismatch, unauthorized),
 * returns [] and logs a warning — the fan-out logic treats this as a degraded
 * peer and continues with the rest of the fan-out.
 */
export const openSearchStream = (
  node: Libp2p,
  peerIdStr: string,
  req: SearchRequest,
): ResultAsync<ReadonlyArray<PeerMatch>, SearchError> =>
  ResultAsync.fromPromise(
    (async () => {
      const pid = peerIdFromString(peerIdStr);
      const stream = await node.dialProtocol(pid, SEARCH_PROTOCOL_ID);
      const fs = makeFramedStream(stream);
      try {
        // Write one frame — JSON SearchRequest (embedding already Array.from()'d by caller)
        await fs.write(new TextEncoder().encode(JSON.stringify(req)));
        const iter = fs.frameIter();
        const frame = await iter.next();
        if (frame.done || !frame.value) return [];
        const resp = JSON.parse(new TextDecoder().decode(frame.value)) as SearchResponse;
        if (resp.error) {
          // Peer returned an error code — propagate as empty matches.
          // The fan-out logic in federated-search.ts treats this as a degraded peer.
          process.stderr.write(
            `wellinformed: peer ${peerIdStr} search error: ${resp.error}\n`,
          );
          return [];
        }
        // Annotate each match with _source_peer
        return resp.matches.map((m): PeerMatch => ({
          node_id: m.node_id,
          room: m.room,
          wing: m.wing,
          distance: m.distance,
          _source_peer: peerIdStr,
        }));
      } finally {
        fs.close();
      }
    })(),
    (e) => SEARCH_ERR.protocolError(peerIdStr, `dialProtocol failed: ${(e as Error).message}`),
  );

// ─────────────────────── re-export for consumers ──────────────────────────────

/** PER_PEER_TIMEOUT_MS is exported so federated-search.ts uses the same constant. */
export { PER_PEER_TIMEOUT_MS };
