/**
 * Recall sync — federated entity recall over libp2p.
 *
 * Sibling protocol to /wellinformed/search/1.0.0. The architectural
 * review (data + solution architects, both converged) said: ship
 * recall as its OWN protocol. Reasons:
 *
 *   - Wire shape is genuinely different (entity_id string vs
 *     embedding number[384]).
 *   - Lifecycle independence — separate rate limit, separate ACL
 *     decisions later.
 *   - Mirrors how /wellinformed/touch/1.0.0 sits next to /search.
 *
 * Privacy boundary:
 *   - Sender ships a CANONICAL entity_id (e.g. 'entity:product:lemlist').
 *     The slug function in src/domain/entity.ts is deterministic,
 *     so two peers that both registered "Lemlist" arrive at the
 *     same id without exchanging aliases.
 *   - Receiver applies the share-store gate: only `mentions` edges
 *     whose chunk lives in a shareable room respond.
 *   - The `surface` text on a mention edge is user prose ("lemlist
 *     is overpriced") — never transmitted. Only the chunk's
 *     metadata (label, source_uri, room, age_days) crosses.
 *
 * Pure transport. The fan-out orchestration lives in
 * application/federated-recall.ts; this file is libp2p-only.
 */

import * as lp from 'it-length-prefixed';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { Libp2p, Stream, Connection } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';
import type { Graph, GraphEdge, GraphNode } from '../domain/graph.js';
import { edgesByRelationAndTarget } from '../domain/graph.js';
import { SearchError as SEARCH_ERR, type SearchError } from '../domain/errors.js';
import { loadSharedRooms } from './share-store.js';

// ─────────────── constants ────────────────

export const RECALL_PROTOCOL_ID = '/wellinformed/recall/1.0.0' as const;
const PER_PEER_TIMEOUT_MS = 2000;
const MAX_INBOUND_STREAMS = 16;
const MAX_LIMIT = 50;

// ─────────────── wire shapes ──────────────

export interface RecallRequest {
  readonly type: 'recall';
  readonly entity_id: string;
  readonly room?: string;
  readonly limit: number;
}

export interface RecallPeerHit {
  readonly node_id: string;
  readonly room?: string;
  readonly label: string;
  readonly source_uri?: string;
  readonly fetched_at?: string;
  readonly age_days?: number;
}

export interface RecallResponse {
  readonly type: 'recall_ok';
  readonly entity_id: string;
  readonly mention_count: number;       // peer's own count, not aggregate
  readonly hits: readonly RecallPeerHit[];
}

export interface RecallError {
  readonly type: 'recall_err';
  readonly reason: 'unknown_entity' | 'unauthorized_room' | 'rate_limited' | 'invalid_request';
}

type RecallWire = RecallResponse | RecallError;

// ─────────────── frame helpers ────────────

const writeFrame = async (stream: Stream, payload: object): Promise<void> => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  for await (const chunk of lp.encode([bytes])) {
    stream.send(chunk);
  }
};

const readFrame = async <T>(stream: Stream): Promise<T | null> => {
  for await (const msg of lp.decode(stream)) {
    try {
      return JSON.parse(new TextDecoder().decode(msg.subarray())) as T;
    } catch {
      return null;
    }
  }
  return null;
};

// ─────────────── responder ────────────────

export interface RecallResponderDeps {
  /** Loaded graph snapshot — passed by the daemon's request handler. */
  readonly graph: Graph;
  /** Path to shared-rooms.json for the share-store gate. */
  readonly sharedRoomsPath: string;
  /** ms-since-epoch for age computation. */
  readonly now: () => number;
}

const buildHit = (
  edge: GraphEdge,
  graph: Graph,
  nowMs: number,
): RecallPeerHit | null => {
  const node: GraphNode | undefined = graph.nodeById.get(edge.source);
  if (!node) return null;
  // Don't transmit chunk body content — only metadata.
  const fetchedAt =
    typeof node.fetched_at === 'string' ? node.fetched_at : undefined;
  const fetchedMs = fetchedAt ? Date.parse(fetchedAt) : NaN;
  const ageDays = Number.isFinite(fetchedMs)
    ? Number(((nowMs - fetchedMs) / 86_400_000).toFixed(2))
    : undefined;
  return {
    node_id: node.id,
    room: node.room,
    label: node.label,
    source_uri: node.source_uri ?? node.source_file,
    fetched_at: fetchedAt,
    age_days: ageDays,
  };
};

/**
 * Answer a single inbound recall. Used by the protocol handler on
 * the daemon side.
 */
export const answerRecall = async (
  req: RecallRequest,
  deps: RecallResponderDeps,
): Promise<RecallWire> => {
  if (typeof req.entity_id !== 'string' || req.entity_id.length === 0) {
    return { type: 'recall_err', reason: 'invalid_request' };
  }
  const limit = Math.min(Math.max(1, req.limit ?? 20), MAX_LIMIT);

  // Share-store gate — only respond with chunks in shared rooms.
  const sharedRes = await loadSharedRooms(deps.sharedRoomsPath);
  if (sharedRes.isErr()) {
    return { type: 'recall_err', reason: 'unauthorized_room' };
  }
  const shareableRooms = new Set(
    sharedRes.value.rooms
      .filter((r) => r.shareable !== false)
      .map((r) => r.name),
  );
  if (req.room && !shareableRooms.has(req.room)) {
    return { type: 'recall_err', reason: 'unauthorized_room' };
  }

  // Walk inbound mentions edges via the indexed accessor.
  const edges = edgesByRelationAndTarget(deps.graph, 'mentions', req.entity_id);
  if (edges.length === 0) {
    return {
      type: 'recall_ok',
      entity_id: req.entity_id,
      mention_count: 0,
      hits: [],
    };
  }

  const now = deps.now();
  const hits: RecallPeerHit[] = [];
  let totalForEntity = 0;
  for (const e of edges) {
    const hit = buildHit(e, deps.graph, now);
    if (!hit) continue;
    totalForEntity++;
    if (req.room && hit.room !== req.room) continue;
    if (hit.room && !shareableRooms.has(hit.room)) continue;
    hits.push(hit);
  }
  // Sort by recency desc, then trim.
  hits.sort((a, b) =>
    (b.fetched_at ?? '').localeCompare(a.fetched_at ?? ''),
  );
  return {
    type: 'recall_ok',
    entity_id: req.entity_id,
    mention_count: totalForEntity,
    hits: hits.slice(0, limit),
  };
};

// ─────────────── protocol registration ────

export interface RecallRegistryDeps {
  readonly node: Libp2p;
  /** Live graph getter — re-fetched per request so updates flow. */
  readonly getGraph: () => Promise<Graph | null>;
  readonly sharedRoomsPath: string;
  /** Optional logger; default no-op. */
  readonly log?: (msg: string) => void;
}

export const registerRecallProtocol = (deps: RecallRegistryDeps): void => {
  const log = deps.log ?? (() => undefined);
  void deps.node.handle(
    RECALL_PROTOCOL_ID,
    async (stream: Stream, connection: Connection) => {
      try {
        const req = await readFrame<RecallRequest>(stream);
        if (!req || req.type !== 'recall') {
          await writeFrame(stream, {
            type: 'recall_err',
            reason: 'invalid_request',
          });
          stream.close();
          return;
        }
        const graph = await deps.getGraph();
        if (!graph) {
          await writeFrame(stream, {
            type: 'recall_err',
            reason: 'invalid_request',
          });
          stream.close();
          return;
        }
        const resp = await answerRecall(req, {
          graph,
          sharedRoomsPath: deps.sharedRoomsPath,
          now: () => Date.now(),
        });
        await writeFrame(stream, resp);
        log(
          `recall responder ← peer=${connection.remotePeer.toString().slice(0, 12)} entity=${req.entity_id} hits=${resp.type === 'recall_ok' ? resp.hits.length : 0}`,
        );
      } catch (e) {
        log(`recall responder error: ${(e as Error).message}`);
      } finally {
        try { stream.close(); } catch { /* benign */ }
      }
    },
    { maxInboundStreams: MAX_INBOUND_STREAMS },
  );
};

export const unregisterRecallProtocol = (node: Libp2p): ResultAsync<void, SearchError> =>
  ResultAsync.fromPromise(
    node.unhandle(RECALL_PROTOCOL_ID),
    (e) => SEARCH_ERR.protocolError('local', (e as Error).message),
  );

// ─────────────── outbound dial ────────────

const withTimeout = <T>(p: Promise<T>, ms: number, peer: string): Promise<T> =>
  Promise.race<T>([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`recall timeout peer=${peer}`)), ms),
    ),
  ]);

/**
 * Dial RECALL_PROTOCOL_ID on `peerId`, send the request, read the
 * single response frame, return the decoded wire object. Failure
 * (timeout, dial error, parse error) returns null and the caller
 * counts that peer as 'errored' / 'timed_out'.
 */
export const openRecallStream = (
  node: Libp2p,
  peerIdStr: string,
  req: RecallRequest,
): ResultAsync<RecallWire | null, SearchError> =>
  ResultAsync.fromPromise(
    (async () => {
      const pid = peerIdFromString(peerIdStr);
      const stream = await withTimeout(
        node.dialProtocol(pid, RECALL_PROTOCOL_ID),
        PER_PEER_TIMEOUT_MS,
        peerIdStr,
      );
      try {
        await writeFrame(stream, req);
        const resp = await withTimeout(
          readFrame<RecallWire>(stream),
          PER_PEER_TIMEOUT_MS,
          peerIdStr,
        );
        return resp;
      } finally {
        try { stream.close(); } catch { /* benign */ }
      }
    })(),
    (e) => SEARCH_ERR.protocolError('local', (e as Error).message),
  );

// silence unused parity import
void errAsync;
void okAsync;
