/**
 * Touch protocol — `/wellinformed/touch/1.0.0`.
 *
 * Wire: one request frame, one response frame, stream closed.
 * Request:  TouchRequest    — { type:'touch', room, max_nodes? }
 * Response: TouchResponse   — { type:'touch-response', nodes, redactions_applied, error? }
 *
 * Responder flow:
 *   1. Decode request
 *   2. Rate-limit check (token bucket, per peer)
 *   3. Gate: is `request.room` in this node's shared-rooms?  If not → refuse.
 *   4. Load graph, filter nodes to the room, cap to TOUCH_MAX_NODES
 *   5. Redact every node via secret-gate.redactNodes
 *   6. Serialise and return
 *
 * Initiator flow:
 *   1. dialProtocol(TOUCH_PROTOCOL_ID)
 *   2. Write TouchRequest, read TouchResponse
 *   3. On peer error → surface as TouchError
 *   4. On success → caller merges nodes into local graph (CLI step)
 *
 * Framing mirrors search-sync.ts — copied, not imported, because framing
 * is protocol-local and deliberately decoupled so a change in one
 * protocol can't accidentally break the other.
 */

import * as lp from 'it-length-prefixed';
import { ResultAsync } from 'neverthrow';
import type { Libp2p, Stream, Connection } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';

import type { TouchError } from '../domain/errors.js';
import { TouchError as TE } from '../domain/errors.js';
import {
  TOUCH_PROTOCOL_ID,
  TOUCH_MAX_NODES,
  type TouchRequest,
  type TouchResponse,
} from '../domain/touch.js';
import { nodesInRoom, type GraphNode } from '../domain/graph.js';
import type { GraphRepository } from './graph-repository.js';
import { loadSharedRooms } from './share-store.js';
import { redactNodes } from '../domain/secret-gate.js';
import { buildPatterns } from '../domain/sharing.js';
import { validateRemoteNodes, type ValidationFailure } from '../domain/remote-node-validator.js';
import { createRateLimiter, type RateLimiter } from './search-sync.js';
import {
  findSystemRoom,
  nodesInSystemRoom,
} from '../domain/system-rooms.js';

// ─────────────────────── framing ──────────────────────────────────────────────

interface FramedStream {
  write(data: Uint8Array): Promise<void>;
  frameIter(): AsyncGenerator<Uint8Array, void, undefined>;
  close(): void;
}

const makeFramedStream = (stream: Stream): FramedStream => {
  const frameIter = async function* (): AsyncGenerator<Uint8Array, void, undefined> {
    for await (const msg of lp.decode(stream)) {
      yield msg.subarray();
    }
  };
  return {
    write: async (data): Promise<void> => {
      for await (const chunk of lp.encode([data])) {
        stream.send(chunk);
      }
    },
    frameIter,
    close: (): void => { try { void stream.close(); } catch { /* benign */ } },
  };
};

const MAX_INBOUND_STREAMS = 16 as const;

// ─────────────────────── registry ─────────────────────────────────────────────

export interface TouchRegistryDeps {
  readonly graphRepo: GraphRepository;
  readonly sharedRoomsPath: string;
  readonly rateLimiter: RateLimiter;
  readonly patterns: ReturnType<typeof buildPatterns>;
}

export interface TouchRegistry {
  readonly node: Libp2p;
  readonly deps: TouchRegistryDeps;
}

export const createTouchRegistry = (
  node: Libp2p,
  homePath: string,
  graphRepo: GraphRepository,
  ratePerSec: number,
  burst: number,
  extraSecretPatterns: ReadonlyArray<{ readonly name: string; readonly pattern: string }> = [],
): TouchRegistry => ({
  node,
  deps: {
    graphRepo,
    sharedRoomsPath: `${homePath}/shared-rooms.json`,
    rateLimiter: createRateLimiter(ratePerSec, burst),
    patterns: buildPatterns(extraSecretPatterns),
  },
});

// ─────────────────────── handler (responder) ──────────────────────────────────

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const writeResponse = async (fs: FramedStream, resp: TouchResponse): Promise<void> => {
  await fs.write(encoder.encode(JSON.stringify(resp)));
};

const errorResponse = (code: TouchResponse['error']): TouchResponse => ({
  type: 'touch-response',
  nodes: [],
  redactions_applied: 0,
  error: code,
});

const handleTouchRequest = async (
  deps: TouchRegistryDeps,
  stream: Stream,
  peerIdStr: string,
): Promise<void> => {
  const fs = makeFramedStream(stream);
  try {
    const iter = fs.frameIter();
    const first = await iter.next();
    if (first.done || !first.value) return;

    let req: TouchRequest;
    try {
      req = JSON.parse(decoder.decode(first.value)) as TouchRequest;
    } catch {
      await writeResponse(fs, errorResponse('internal-error'));
      return;
    }
    if (req.type !== 'touch' || typeof req.room !== 'string' || req.room.length === 0) {
      await writeResponse(fs, errorResponse('internal-error'));
      return;
    }

    if (!deps.rateLimiter.consume(peerIdStr)) {
      await writeResponse(fs, errorResponse('rate-limited'));
      return;
    }

    // System rooms (toolshed / research) are always shareable — they're the
    // two out-of-the-box surfaces every peer advertises. Other rooms have
    // to be explicitly opted in via shared-rooms.json. Regardless, we
    // always load the file here — system-room virtual membership respects
    // `shareable: false` entries as an opt-out.
    const systemRoom = findSystemRoom(req.room);
    const sharedRes = await loadSharedRooms(deps.sharedRoomsPath);
    if (sharedRes.isErr()) {
      await writeResponse(fs, errorResponse('internal-error'));
      return;
    }
    const sharedRooms = sharedRes.value.rooms;
    if (!systemRoom) {
      const isShared = sharedRooms.some((r) => r.name === req.room && r.shareable !== false);
      if (!isShared) {
        await writeResponse(fs, errorResponse('room-not-shared'));
        return;
      }
    }

    const graphRes = await deps.graphRepo.load();
    if (graphRes.isErr()) {
      await writeResponse(fs, errorResponse('internal-error'));
      return;
    }

    // Physical rooms explicitly marked `shareable: false` are the user's
    // opt-out signal — nodes in them must NOT leak via system-room
    // virtual membership either.
    const isolatedRooms = new Set<string>(
      sharedRooms.filter((r) => r.shareable === false).map((r) => r.name),
    );

    // System rooms are virtual — membership derived from source_uri
    // scheme and results sorted newest-first by fetched_at. Physical
    // rooms use the existing room-field filter.
    const cap = Math.min(req.max_nodes ?? TOUCH_MAX_NODES, TOUCH_MAX_NODES);
    const allRoomNodes = systemRoom
      ? nodesInSystemRoom(graphRes.value.json.nodes, systemRoom, isolatedRooms)
      : nodesInRoom(graphRes.value, req.room);
    const roomNodes = allRoomNodes.slice(0, cap);

    const { nodes: cleaned, redactions_by_node } = redactNodes(roomNodes, deps.patterns);
    const totalRedactions = Array.from(redactions_by_node.values())
      .reduce((sum, r) => sum + r.length, 0);

    await writeResponse(fs, {
      type: 'touch-response',
      nodes: cleaned,
      redactions_applied: totalRedactions,
    });
  } finally {
    fs.close();
  }
};

export const registerTouchProtocol = (
  registry: TouchRegistry,
): ResultAsync<void, TouchError> =>
  ResultAsync.fromPromise(
    (async () => {
      try { await registry.node.unhandle(TOUCH_PROTOCOL_ID); } catch { /* benign */ }
      await registry.node.handle(
        TOUCH_PROTOCOL_ID,
        async (stream: Stream, connection: Connection) => {
          const peerIdStr = connection.remotePeer.toString();
          await handleTouchRequest(registry.deps, stream, peerIdStr);
        },
        { runOnLimitedConnection: false, maxInboundStreams: MAX_INBOUND_STREAMS },
      );
    })(),
    (e) => TE.protocolError('local', `handle() failed: ${(e as Error).message}`),
  );

export const unregisterTouchProtocol = (
  registry: TouchRegistry,
): ResultAsync<void, TouchError> =>
  ResultAsync.fromPromise(
    registry.node.unhandle(TOUCH_PROTOCOL_ID),
    (e) => TE.protocolError('local', `unhandle() failed: ${(e as Error).message}`),
  );

// ─────────────────────── initiator ────────────────────────────────────────────

export interface TouchResult {
  readonly nodes: readonly GraphNode[];
  readonly redactions_applied: number;
  /** Non-empty when the responder sent nodes that failed validation. */
  readonly rejected: ReadonlyArray<{ readonly index: number; readonly failure: ValidationFailure }>;
}

/**
 * Initiator — open a touch stream to `peerIdStr`, request `room`, return
 * the redacted node set. Single frame in, single frame out.
 */
export const openTouchStream = (
  node: Libp2p,
  peerIdStr: string,
  room: string,
  maxNodes: number = TOUCH_MAX_NODES,
): ResultAsync<TouchResult, TouchError> =>
  ResultAsync.fromPromise(
    (async (): Promise<TouchResult> => {
      const pid = peerIdFromString(peerIdStr);
      const stream = await node.dialProtocol(pid, TOUCH_PROTOCOL_ID);
      const fs = makeFramedStream(stream);
      try {
        const req: TouchRequest = { type: 'touch', room, max_nodes: maxNodes };
        await fs.write(encoder.encode(JSON.stringify(req)));
        const iter = fs.frameIter();
        const frame = await iter.next();
        if (frame.done || !frame.value) {
          return { nodes: [], redactions_applied: 0, rejected: [] };
        }
        // Parse defensively — an adversarial peer may send shapes that
        // don't match TouchResponse. Prototype-pollution gate: a reviver
        // drops __proto__/constructor/prototype keys at parse time so no
        // downstream walker can pick them up. Shape checks after parse.
        const unsafeReviver = (key: string, value: unknown): unknown =>
          key === '__proto__' || key === 'constructor' || key === 'prototype'
            ? undefined
            : value;
        let resp: TouchResponse;
        try {
          resp = JSON.parse(decoder.decode(frame.value), unsafeReviver) as TouchResponse;
        } catch (e) {
          throw new Error(`malformed-response: ${(e as Error).message}`);
        }
        if (!resp || typeof resp !== 'object' || resp.type !== 'touch-response') {
          throw new Error('malformed-response: wrong shape');
        }
        if (resp.error) {
          // Surface peer-side refusals as a thrown error so the ResultAsync
          // wrapper classifies them correctly via the catch path below.
          throw new Error(`remote:${resp.error}`);
        }
        // Validate every node at the trust boundary before handing them
        // back to the caller. Survivors are safe to upsertNode; rejects
        // are surfaced so the CLI can report them.
        const rawNodes = Array.isArray(resp.nodes) ? resp.nodes : [];
        const { accepted, rejected } = validateRemoteNodes(rawNodes);
        return {
          nodes: accepted,
          redactions_applied: resp.redactions_applied ?? 0,
          rejected,
        };
      } finally {
        fs.close();
      }
    })(),
    (e) => {
      const msg = (e as Error).message;
      if (msg.startsWith('remote:room-not-shared')) return TE.roomNotShared(peerIdStr, '');
      if (msg.startsWith('remote:rate-limited'))    return TE.remoteError(peerIdStr, 'rate-limited');
      if (msg.startsWith('remote:'))                return TE.remoteError(peerIdStr, msg.slice('remote:'.length));
      return TE.protocolError(peerIdStr, msg);
    },
  );
