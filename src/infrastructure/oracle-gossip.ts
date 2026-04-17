/**
 * oracle-gossip — Layer B of the peer-discovery stack.
 *
 * Thin wrapper over libp2p pubsub for the oracle Q&A topic. Layer A
 * (touch + CRDT) is async — a question propagates on the next peer
 * touch cycle. Layer B adds real-time fan-out: publish once, every
 * connected peer subscribed to the topic sees the question inside one
 * network round-trip.
 *
 * Message shape is deliberately identical to the touch wire format:
 * the question or answer node itself (GraphNode), validated on receipt
 * by the same validateRemoteNode used by touch. Same trust boundary,
 * no duplicated validation logic.
 *
 * Flow:
 *
 *   publish side:
 *     1. build the question / answer node via domain/oracle.ts
 *     2. JSON-serialise + UTF-8 encode
 *     3. node.services.pubsub.publish(TOPIC, bytes)
 *
 *   subscribe side:
 *     1. on library init, subscribe(TOPIC) + register the message handler
 *     2. handler decodes JSON, runs validateRemoteNode
 *     3. on accept, writes the node into the caller-supplied graph repo
 *        (idempotent via upsertNode — id collision = merge)
 *
 * Responsibilities OUT of scope here:
 *   - Claude-driven answering (oracle_answerable does that)
 *   - Rate-limiting (the touch handler's rate limiter covers request-
 *     response; pubsub traffic is bounded by floodsub's own per-message
 *     dedup cache until gossipsub lands)
 *   - Signature verification (peer-id on the gossipsub envelope is
 *     already validated by libp2p; the GraphNode carries asked_by /
 *     answered_by which the caller can cross-check against the sender
 *     peer-id if they care about self-attribution tampering)
 */

import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { Libp2p } from '@libp2p/interface';
import type { Message } from '@libp2p/floodsub';

import type { GraphNode } from '../domain/graph.js';
import { upsertNode } from '../domain/graph.js';
import { validateRemoteNode, type ValidationFailure } from '../domain/remote-node-validator.js';
import type { GraphRepository } from './graph-repository.js';
import type { GraphError } from '../domain/errors.js';
import { GraphError as GE } from '../domain/errors.js';

// ─────────────────────── constants ────────────────────────

/** libp2p pubsub topic for oracle questions + answers. Versioned so we
 *  can ship breaking shape changes without silent drift. */
export const ORACLE_TOPIC = '/wellinformed/oracle/1.0.0';

/** Hard cap on inbound message size — reject anything past this before
 *  even attempting JSON.parse. Same budget as the touch handler's
 *  per-response node cap. */
const MAX_MESSAGE_BYTES = 64 * 1024;

// ─────────────────────── wire format ───────────────────────

/** Wire envelope. `kind` is redundant with node.oracle_kind but
 *  cheaper to route on without fully decoding the graph node. */
export interface OracleGossipMessage {
  readonly kind: 'question' | 'answer';
  readonly node: GraphNode;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ─────────────────────── pubsub access ─────────────────────

/** Minimal structural type for the pubsub service the floodsub plugin
 *  registers under node.services.pubsub. Keeps us from importing the
 *  full FloodSub class and lets us swap to gossipsub later by changing
 *  just the service registration in peer-transport.ts. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PubsubService = {
  readonly publish: (topic: string, data: Uint8Array) => Promise<unknown>;
  readonly subscribe: (topic: string) => void;
  readonly unsubscribe: (topic: string) => void;
  readonly addEventListener: (type: string, listener: (e: any) => void) => void;
  readonly removeEventListener: (type: string, listener: (e: any) => void) => void;
};

/** Strict accessor — the libp2p node MUST have pubsub wired. Throws
 *  a descriptive error at call sites that forget to compose it. */
const getPubsub = (node: Libp2p): PubsubService => {
  const svc = (node.services as Record<string, unknown>).pubsub;
  if (!svc) {
    throw new Error(
      'oracle-gossip: libp2p node was constructed without pubsub. Ensure createNode wires the floodsub service.',
    );
  }
  return svc as PubsubService;
};

// ─────────────────────── publish ───────────────────────────

const publishMessage = (
  node: Libp2p,
  msg: OracleGossipMessage,
): ResultAsync<void, GraphError> => {
  return ResultAsync.fromPromise(
    (async () => {
      const json = JSON.stringify(msg);
      if (json.length > MAX_MESSAGE_BYTES) {
        throw new Error(`oracle-gossip: message ${json.length}B exceeds ${MAX_MESSAGE_BYTES}B cap`);
      }
      const bytes = encoder.encode(json);
      await getPubsub(node).publish(ORACLE_TOPIC, bytes);
    })(),
    (e) => GE.writeError('oracle-gossip:publish', (e as Error).message),
  );
};

export const publishQuestion = (node: Libp2p, question: GraphNode): ResultAsync<void, GraphError> =>
  publishMessage(node, { kind: 'question', node: question });

export const publishAnswer = (node: Libp2p, answer: GraphNode): ResultAsync<void, GraphError> =>
  publishMessage(node, { kind: 'answer', node: answer });

// ─────────────────────── subscribe ─────────────────────────

export interface SubscribeOptions {
  /** Graph repository where validated inbound nodes are upserted. */
  readonly graphRepo: GraphRepository;
  /** Optional observer fired AFTER successful upsert. Useful for tests
   *  and for surfacing "new question arrived" to higher layers. */
  readonly onAccepted?: (msg: OracleGossipMessage, fromPeer: string) => void;
  /** Optional observer for any rejection — validator failure, size
   *  cap, or JSON parse error. Useful for drop-observability. */
  readonly onRejected?: (reason: string, fromPeer: string) => void;
}

export interface SubscribeHandle {
  /** Stop the subscription; idempotent. */
  readonly unsubscribe: () => void;
}

/**
 * Subscribe to the oracle topic. Every inbound message is:
 *   1. decoded as OracleGossipMessage
 *   2. validated node-by-node via validateRemoteNode (same path as touch)
 *   3. upserted into the caller's graph repo on accept
 * Rejections are silently counted via onRejected — never thrown to the
 * libp2p event loop (a bad peer message must not crash the service).
 */
export const subscribeOracle = (
  node: Libp2p,
  opts: SubscribeOptions,
): ResultAsync<SubscribeHandle, GraphError> => {
  const pubsub = (() => {
    try { return getPubsub(node); } catch (e) { return e as Error; }
  })();
  if (pubsub instanceof Error) {
    return errAsync(GE.writeError('oracle-gossip:subscribe', pubsub.message));
  }
  const p = pubsub;

  const handler = (event: CustomEvent<Message>): void => {
    const message = event.detail;
    if (message.topic !== ORACLE_TOPIC) return;
    // SignedMessage has `from`; UnsignedMessage does not. floodsub
    // typically signs so `from` should be present — fall back to
    // 'unknown' rather than crashing.
    const fromPeer =
      'from' in message && message.from ? message.from.toString() : 'unknown';

    if (message.data.length > MAX_MESSAGE_BYTES) {
      opts.onRejected?.(`message ${message.data.length}B exceeds cap`, fromPeer);
      return;
    }

    let decoded: OracleGossipMessage;
    try {
      decoded = JSON.parse(decoder.decode(message.data)) as OracleGossipMessage;
    } catch (e) {
      opts.onRejected?.(`json parse: ${(e as Error).message}`, fromPeer);
      return;
    }
    if (decoded.kind !== 'question' && decoded.kind !== 'answer') {
      opts.onRejected?.(`unknown kind: ${String(decoded.kind)}`, fromPeer);
      return;
    }

    const validated = validateRemoteNode(decoded.node);
    if (validated.isErr()) {
      const f: ValidationFailure = validated.error;
      opts.onRejected?.(`validator: ${f.kind}`, fromPeer);
      return;
    }

    // Upsert into the graph. Fire-and-forget: pubsub doesn't give us
    // back-pressure anyway, so awaiting here wouldn't slow down
    // upstream producers.
    void opts.graphRepo.load().andThen((graph) => {
      const next = upsertNode(graph, validated.value);
      if (next.isErr()) return errAsync<void, GraphError>(next.error);
      return opts.graphRepo.save(next.value).map(() => {
        opts.onAccepted?.({ kind: decoded.kind, node: validated.value }, fromPeer);
      });
    });
  };

  p.addEventListener('message', handler as EventListener);
  p.subscribe(ORACLE_TOPIC);

  return okAsync({
    unsubscribe: (): void => {
      try {
        p.removeEventListener('message', handler as EventListener);
        p.unsubscribe(ORACLE_TOPIC);
      } catch {
        /* idempotent — swallow double-stop */
      }
    },
  });
};
