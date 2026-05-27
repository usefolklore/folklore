/**
 * Touch protocol — `/wellinformed/touch/1.0.0`.
 *
 * Wire: one request frame, one response frame, stream closed.
 *   Request:  TouchRequest    — { type:'touch', protocol_version:5, max_nodes? }
 *   Response: TouchResponse   — { type:'touch-response', protocol_version:5, nodes,
 *                                redactions_applied, error? }
 *
 * V5 (Phase 24-03, ROOMS-DEL-05): the `room` parameter is gone. Touch now
 * means "give me your N freshest non-private nodes." Authorization is per-
 * node via `node.private === false`; there is no room-level gate anymore.
 *
 * Responder flow:
 *   1. Decode request
 *   2. V5 envelope guard (reject any payload with `room` field, or protocol_version != 5)
 *   3. Rate-limit check (token bucket, per peer)
 *   4. Load graph, filter to non-private nodes, sort by fetched_at desc, cap to TOUCH_MAX_NODES
 *   5. Redact every node via secret-gate.redactNodes (defence-in-depth on top of the private gate)
 *   6. Serialise and return
 *
 * Initiator flow:
 *   1. dialProtocol(TOUCH_PROTOCOL_ID)
 *   2. Write TouchRequest (protocol_version:5), read TouchResponse
 *   3. On peer error → surface as TouchError
 *   4. On success → caller merges nodes into local graph (CLI step)
 *
 * The libp2p protocol-path stays at `/wellinformed/touch/1.0.0`; V5 is enforced
 * at the envelope layer. Pre-V5 peers receive a clear `protocol-mismatch`
 * response rather than "protocol not handled."
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
import type { GraphNode } from '../domain/graph.js';
import type { GraphRepository } from './graph-repository.js';
import { redactNodes } from '../domain/secret-gate.js';
import { buildPatterns } from '../domain/sharing.js';
import { validateRemoteNodes, type ValidationFailure } from '../domain/remote-node-validator.js';
import { createRateLimiter, type RateLimiter } from './search-sync.js';

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

/** V5 protocol-version literal carried on every touch envelope. */
export const TOUCH_PROTOCOL_VERSION = 5 as const;

// ─────────────────────── registry ─────────────────────────────────────────────

export interface TouchRegistryDeps {
  readonly graphRepo: GraphRepository;
  readonly rateLimiter: RateLimiter;
  readonly patterns: ReturnType<typeof buildPatterns>;
}

export interface TouchRegistry {
  readonly node: Libp2p;
  readonly deps: TouchRegistryDeps;
}

export const createTouchRegistry = (
  node: Libp2p,
  _homePath: string,
  graphRepo: GraphRepository,
  ratePerSec: number,
  burst: number,
  extraSecretPatterns: ReadonlyArray<{ readonly name: string; readonly pattern: string }> = [],
): TouchRegistry => ({
  node,
  deps: {
    graphRepo,
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
  protocol_version: TOUCH_PROTOCOL_VERSION,
  nodes: [],
  redactions_applied: 0,
  error: code,
});

/**
 * V5: "non-private" gate replaces the room-level shareable check.
 * A node is touchable iff `node.private === false` (or absent — defaulted false
 * in the Wave-3 node-construction pass).
 */
const isNonPrivate = (n: GraphNode): boolean =>
  (n as { private?: boolean }).private !== true;

/**
 * V5 freshness order: newest first by `fetched_at`, falling back to lexical
 * id order when timestamps are missing or tied.
 */
const byFetchedAtDesc = (a: GraphNode, b: GraphNode): number => {
  const ta = typeof a.fetched_at === 'string' ? Date.parse(a.fetched_at) : NaN;
  const tb = typeof b.fetched_at === 'string' ? Date.parse(b.fetched_at) : NaN;
  if (Number.isFinite(tb) && Number.isFinite(ta)) return tb - ta;
  if (Number.isFinite(tb)) return 1;
  if (Number.isFinite(ta)) return -1;
  return a.id.localeCompare(b.id);
};

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

    let rawDecoded: Record<string, unknown>;
    let req: TouchRequest;
    try {
      rawDecoded = JSON.parse(decoder.decode(first.value)) as Record<string, unknown>;
      req = rawDecoded as unknown as TouchRequest;
    } catch {
      await writeResponse(fs, errorResponse('internal-error'));
      return;
    }
    if (!rawDecoded || typeof rawDecoded !== 'object' || rawDecoded.type !== 'touch') {
      await writeResponse(fs, errorResponse('internal-error'));
      return;
    }

    // V5 envelope guard — reject pre-V5 (V4) envelopes BEFORE any other work.
    // A V4 envelope is identified by either:
    //   (a) presence of the deleted `room` field, OR
    //   (b) absence of `protocol_version === 5`.
    if (rawDecoded.room !== undefined) {
      process.stderr.write(
        `wellinformed: peer ${peerIdStr} sent V4 TouchRequest with \`room\` field. This peer speaks V5; see docs/architecture/V5-PROTOCOL.md.\n`,
      );
      await writeResponse(fs, errorResponse('protocol-mismatch'));
      return;
    }
    if (rawDecoded.protocol_version !== TOUCH_PROTOCOL_VERSION) {
      process.stderr.write(
        `wellinformed: peer ${peerIdStr} sent TouchRequest with unknown protocol_version=${JSON.stringify(rawDecoded.protocol_version)}; this peer speaks V5 only.\n`,
      );
      await writeResponse(fs, errorResponse('protocol-mismatch'));
      return;
    }

    if (!deps.rateLimiter.consume(peerIdStr)) {
      await writeResponse(fs, errorResponse('rate-limited'));
      return;
    }

    const graphRes = await deps.graphRepo.load();
    if (graphRes.isErr()) {
      await writeResponse(fs, errorResponse('internal-error'));
      return;
    }

    // V5: filter to non-private nodes, sort newest first, cap to requested
    // maximum (or TOUCH_MAX_NODES — whichever is smaller). No room-level
    // gate; per-node `private` is the authorization signal.
    const cap = Math.min(req.max_nodes ?? TOUCH_MAX_NODES, TOUCH_MAX_NODES);
    const allNodes = graphRes.value.json.nodes
      .filter(isNonPrivate)
      .sort(byFetchedAtDesc);
    const touchableNodes = allNodes.slice(0, cap);

    const { nodes: cleaned, redactions_by_node } = redactNodes(touchableNodes, deps.patterns);
    const totalRedactions = Array.from(redactions_by_node.values())
      .reduce((sum, r) => sum + r.length, 0);

    await writeResponse(fs, {
      type: 'touch-response',
      protocol_version: TOUCH_PROTOCOL_VERSION,
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
 * Initiator — open a touch stream to `peerIdStr` and pull up to `maxNodes`
 * non-private nodes. V5: no `room` argument — touch is now an asymmetric
 * "give me your freshest public nodes" primitive.
 *
 * Single frame in, single frame out.
 */
export const openTouchStream = (
  node: Libp2p,
  peerIdStr: string,
  maxNodes: number = TOUCH_MAX_NODES,
): ResultAsync<TouchResult, TouchError> =>
  ResultAsync.fromPromise(
    (async (): Promise<TouchResult> => {
      const pid = peerIdFromString(peerIdStr);
      const stream = await node.dialProtocol(pid, TOUCH_PROTOCOL_ID);
      const fs = makeFramedStream(stream);
      try {
        const req: TouchRequest = {
          type: 'touch',
          protocol_version: TOUCH_PROTOCOL_VERSION,
          max_nodes: maxNodes,
        };
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
      if (msg.startsWith('remote:rate-limited'))     return TE.remoteError(peerIdStr, 'rate-limited');
      if (msg.startsWith('remote:protocol-mismatch')) return TE.remoteError(peerIdStr, 'protocol-mismatch');
      if (msg.startsWith('remote:'))                  return TE.remoteError(peerIdStr, msg.slice('remote:'.length));
      return TE.protocolError(peerIdStr, msg);
    },
  );
