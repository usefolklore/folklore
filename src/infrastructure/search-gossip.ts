/**
 * search-gossip — federated search over libp2p pubsub.
 *
 * Replaces the per-peer dialProtocol fan-out in federated-search.ts
 * with a single publish + collect. Cuts the dominant cost of
 * `folklore ask --peers` from O(peers × dial_handshake_ms) to
 * O(propagation_ms + collector_window_ms).
 *
 * Mirrors oracle-gossip.ts pattern: floodsub today, gossipsub when
 * libp2p interface v3 support lands upstream.
 *
 * Topic layout:
 *
 *   /folklore/search/1.0.0           — request topic
 *   /folklore/search-resp/1.0.0      — response topic
 *
 *   Two topics so a responder never sees its own response and so
 *   askers can subscribe-to-responses without re-processing every
 *   request that flies past.
 *
 * Request shape (V5 — JSON over the topic):
 *
 *   {
 *     "type": "search-req",
 *     "request_id": "<uuid>",
 *     "embedding": [...],
 *     "k": 5,
 *     "issued_at": "2026-05-11T..."
 *   }
 *
 * V5 cutover: the `room` field is gone. Federation is workspace-agnostic;
 * any per-workspace pre-filter happens at the asker's read site after the
 * responses arrive.
 *
 * Response shape:
 *
 *   {
 *     "type": "search-resp",
 *     "request_id": "<uuid>",
 *     "peer_id": "12D3KooW...",
 *     "matches": [...],
 *     "emitted_at": "..."
 *   }
 *
 * Collector semantics:
 *
 *   askGossip(node, req, { windowMs, maxPeerResponses }):
 *     1. subscribe to response topic if not already
 *     2. seed an in-memory map keyed by request_id
 *     3. publish the request
 *     4. wait for windowMs OR until maxPeerResponses arrive
 *     5. unsubscribe (idempotent) and return collected responses
 *
 *   Audit folded in (.planning/p2p-scale-plan.md Phase 1 mod):
 *   tail-aware merge happens at the federated-search caller, not
 *   here — this module just emits raw responses ordered by arrival.
 *
 * Bounds:
 *   - MAX_REQUEST_BYTES   16 KiB  (embedding + envelope)
 *   - MAX_RESPONSE_BYTES  256 KiB (k=20 matches × ~12 KiB worst case)
 *   - DEFAULT_WINDOW_MS   200    (covers floodsub propagation at 50-node mesh; gossipsub will need ~80)
 */

import { ResultAsync, errAsync } from 'neverthrow';
import { randomUUID } from 'node:crypto';
import type { Libp2p } from '@libp2p/interface';
import type { Message } from '@libp2p/floodsub';

import type { GraphError } from '../domain/errors.js';
import { GraphError as GE } from '../domain/errors.js';
import type { Match } from '../domain/vectors.js';
import type { MatchAttestation } from '../domain/match-attestation.js';

// ─────────────────────── constants ────────────────────────

export const SEARCH_REQ_TOPIC = '/folklore/search/1.0.0' as const;
export const SEARCH_RESP_TOPIC = '/folklore/search-resp/1.0.0' as const;

const MAX_REQUEST_BYTES = 16 * 1024;
const MAX_RESPONSE_BYTES = 256 * 1024;
const DEFAULT_WINDOW_MS = 200;

// ─────────────────────── wire types ───────────────────────

export interface SearchGossipRequest {
  readonly type: 'search-req';
  readonly request_id: string;
  readonly embedding: readonly number[];
  readonly k: number;
  readonly issued_at: string;
}

export interface SearchGossipPeerMatch extends Match {
  readonly _source_peer: string;
  /** Optional provenance metadata (see search-sync.enrichMatchMeta). */
  readonly label?: string;
  readonly source_uri?: string;
  readonly fetched_at?: string;
  /** Per-match Ed25519 attestation (see domain/match-attestation.ts). */
  readonly attestation?: MatchAttestation;
}

export interface SearchGossipResponse {
  readonly type: 'search-resp';
  readonly request_id: string;
  readonly peer_id: string;
  readonly matches: ReadonlyArray<SearchGossipPeerMatch>;
  readonly emitted_at: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

// ─────────────────────── pubsub access ─────────────────────

type PubsubService = {
  readonly publish: (topic: string, data: Uint8Array) => Promise<unknown>;
  readonly subscribe: (topic: string) => void;
  readonly unsubscribe: (topic: string) => void;
  // `any` keeps typed CustomEvent handlers assignable (contravariant
  // param position — `unknown` would reject every concrete listener).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly addEventListener: (type: string, listener: (e: any) => void) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readonly removeEventListener: (type: string, listener: (e: any) => void) => void;
};

const getPubsub = (node: Libp2p): PubsubService => {
  const svc = (node.services as Record<string, unknown>).pubsub;
  if (!svc) {
    throw new Error(
      'search-gossip: libp2p node was constructed without pubsub. Ensure createNode wires the floodsub service.',
    );
  }
  return svc as PubsubService;
};

// ─────────────────────── responder side ────────────────────

export interface SearchGossipResponderDeps {
  /** Run the local query for an incoming request. Caller injects so
   *  this module doesn't import the application layer (clean deps). */
  readonly runLocalQuery: (req: SearchGossipRequest) =>
    Promise<ReadonlyArray<SearchGossipPeerMatch>>;
}

export interface SearchGossipResponderHandle {
  readonly unsubscribe: () => void;
}

/**
 * Daemon-side subscriber: listens on the request topic, runs the
 * caller-supplied query, publishes a response keyed by request_id.
 *
 * Fire-and-forget per inbound request — never throws into the libp2p
 * event loop; bad requests are silently dropped after a debug log.
 */
export const registerSearchGossipResponder = (
  node: Libp2p,
  deps: SearchGossipResponderDeps,
  onLog?: (msg: string) => void,
): ResultAsync<SearchGossipResponderHandle, GraphError> => {
  const pubsub = (() => {
    try { return getPubsub(node); } catch (e) { return e as Error; }
  })();
  if (pubsub instanceof Error) {
    return errAsync(GE.writeError('search-gossip:responder', pubsub.message));
  }
  const p = pubsub;

  const selfId = node.peerId.toString();
  const log = onLog ?? (() => undefined);

  const handler = (event: CustomEvent<Message>): void => {
    const message = event.detail;
    if (message.topic !== SEARCH_REQ_TOPIC) return;
    if (message.data.byteLength > MAX_REQUEST_BYTES) {
      log(`search-gossip: dropped oversize request ${message.data.byteLength}B`);
      return;
    }
    let req: SearchGossipRequest;
    try {
      const parsed = JSON.parse(decoder.decode(message.data));
      if (parsed?.type !== 'search-req' || typeof parsed.request_id !== 'string') return;
      req = parsed as SearchGossipRequest;
    } catch {
      log('search-gossip: malformed request, dropped');
      return;
    }
    // Don't answer our own broadcasts (floodsub echoes locally).
    const fromPeer =
      'from' in message && message.from ? message.from.toString() : null;
    if (fromPeer === selfId) return;

    // Fire the local query off the event-loop tick.
    void (async () => {
      try {
        const matches = await deps.runLocalQuery(req);
        const resp: SearchGossipResponse = {
          type: 'search-resp',
          request_id: req.request_id,
          peer_id: selfId,
          matches,
          emitted_at: new Date().toISOString(),
        };
        const json = JSON.stringify(resp);
        if (json.length > MAX_RESPONSE_BYTES) {
          log(`search-gossip: response ${json.length}B exceeds cap; truncating to empty`);
          const truncated: SearchGossipResponse = { ...resp, matches: [] };
          await p.publish(SEARCH_RESP_TOPIC, encoder.encode(JSON.stringify(truncated)));
          return;
        }
        await p.publish(SEARCH_RESP_TOPIC, encoder.encode(json));
      } catch (e) {
        log(`search-gossip: responder failed: ${(e as Error).message}`);
      }
    })();
  };

  return ResultAsync.fromPromise(
    (async () => {
      p.subscribe(SEARCH_REQ_TOPIC);
      p.addEventListener('message', handler);
      return {
        unsubscribe: () => {
          try { p.removeEventListener('message', handler); } catch { /* benign */ }
          try { p.unsubscribe(SEARCH_REQ_TOPIC); } catch { /* benign */ }
        },
      } satisfies SearchGossipResponderHandle;
    })(),
    (e) => GE.writeError('search-gossip:subscribe', (e as Error).message),
  );
};

// ─────────────────────── swarm-sim responder ──────────────
//
// Phase 3 of the P2P scale plan: when a daemon has a swarm corpus
// loaded (~/.folklore/swarm-corpus.jsonl), it ALSO publishes
// synthetic responses on behalf of virtual peers from that corpus.
// Each virtual peer that owns a top-relevance hit gets its OWN
// SearchGossipResponse published to the response topic.
//
// From the asker's vantage:
//   peers_queried: 1 (the one real daemon)
//   peers_responded: <K virtual peers from corpus> + 1 real
//
// The asker doesn't care; the gossip envelope's peer_id identifies
// each virtual responder distinctly. This is a pure publish-side
// amplification — no extra subscriptions, no extra sockets.

export interface SwarmCorpusPeerHit {
  readonly node_id: string;
  readonly distance: number;
  readonly peer_id: string;
  /** Optional summary that bypasses auto-pull and goes straight
   *  into the asker's prefetch render. */
  readonly summary?: string;
  readonly label?: string;
  readonly source_uri?: string;
}

export interface SwarmRespondDeps {
  /** Resolve the top-K hits from the swarm corpus for a request.
   *  Implementation reads the corpus + scores against the request's
   *  embedding (or text-based BM25 fallback if no embedding match). */
  readonly findHits: (req: SearchGossipRequest) => Promise<ReadonlyArray<SwarmCorpusPeerHit>>;
}

/**
 * Subscribe to the request topic alongside the real daemon's
 * responder. On every inbound request, partition the swarm corpus
 * top-hits across their owning virtual peers and publish one
 * SearchGossipResponse per peer.
 */
export const registerSwarmSimResponder = (
  node: Libp2p,
  deps: SwarmRespondDeps,
  onLog?: (msg: string) => void,
): ResultAsync<SearchGossipResponderHandle, GraphError> => {
  const pubsub = (() => {
    try { return getPubsub(node); } catch (e) { return e as Error; }
  })();
  if (pubsub instanceof Error) {
    return errAsync(GE.writeError('search-gossip:swarm', pubsub.message));
  }
  const p = pubsub;
  const log = onLog ?? (() => undefined);

  const handler = (event: CustomEvent<Message>): void => {
    const message = event.detail;
    if (message.topic !== SEARCH_REQ_TOPIC) return;
    if (message.data.byteLength > MAX_REQUEST_BYTES) return;
    let req: SearchGossipRequest;
    try {
      const parsed = JSON.parse(decoder.decode(message.data));
      if (parsed?.type !== 'search-req' || typeof parsed.request_id !== 'string') return;
      req = parsed as SearchGossipRequest;
    } catch { return; }
    void (async () => {
      try {
        const hits = await deps.findHits(req);
        if (hits.length === 0) return;
        // Group hits by owning virtual peer.
        const byPeer = new Map<string, SwarmCorpusPeerHit[]>();
        for (const h of hits) {
          const arr = byPeer.get(h.peer_id) ?? [];
          arr.push(h);
          byPeer.set(h.peer_id, arr);
        }
        // Publish all virtual peer responses in PARALLEL — sequential
        // awaits would take O(peers × pubsub_publish_ms) and overflow
        // the asker's collector window. With N=100 peers + ~5ms per
        // publish, sequential = 500ms; parallel = ~20ms.
        const publishes: Promise<unknown>[] = [];
        for (const [peerId, peerHits] of byPeer.entries()) {
          const matches: SearchGossipPeerMatch[] = peerHits.map((h) => ({
            node_id: h.node_id,
            // wing is part of the real Match type — synthesize a
            // sensible default so the asker's typecheck passes.
            wing: 'main' as unknown as Match['wing'],
            distance: h.distance,
            _source_peer: peerId,
          }));
          const resp: SearchGossipResponse = {
            type: 'search-resp',
            request_id: req.request_id,
            peer_id: peerId,
            matches,
            emitted_at: new Date().toISOString(),
          };
          const json = JSON.stringify(resp);
          if (json.length > MAX_RESPONSE_BYTES) continue;
          publishes.push(p.publish(SEARCH_RESP_TOPIC, encoder.encode(json)).catch(() => undefined));
        }
        const settled = await Promise.allSettled(publishes);
        const ok = settled.filter((s) => s.status === 'fulfilled').length;
        log(`search-gossip swarm: published responses for ${byPeer.size} virtual peers (${ok}/${publishes.length} succeeded)`);
      } catch (e) {
        log(`search-gossip swarm: failed: ${(e as Error).message}`);
      }
    })();
  };

  return ResultAsync.fromPromise(
    (async () => {
      p.subscribe(SEARCH_REQ_TOPIC);
      p.addEventListener('message', handler);
      return {
        unsubscribe: () => {
          try { p.removeEventListener('message', handler); } catch { /* benign */ }
          try { p.unsubscribe(SEARCH_REQ_TOPIC); } catch { /* benign */ }
        },
      } satisfies SearchGossipResponderHandle;
    })(),
    (e) => GE.writeError('search-gossip:swarm-subscribe', (e as Error).message),
  );
};

// ─────────────────────── asker side ────────────────────────

export interface AskGossipOptions {
  /** Collector window. Default 200ms (floodsub on a 50-peer LAN mesh).
   *  Lower for tighter latency, higher for larger swarms. */
  readonly windowMs?: number;
  /** Stop collecting once this many distinct peers have responded.
   *  Default Infinity (drain the window). */
  readonly maxPeerResponses?: number;
}

export interface AskGossipResult {
  readonly request_id: string;
  readonly responses: ReadonlyArray<SearchGossipResponse>;
  readonly took_ms: number;
}

/**
 * Asker-side: publish a federated search request and collect every
 * SearchGossipResponse that arrives within the collector window
 * (or until maxPeerResponses is hit, whichever comes first).
 *
 * The caller-side response subscription is held alive for the
 * duration of the call. We do NOT keep a persistent subscription —
 * one ask = one ephemeral handler + cleanup, so the asker doesn't
 * accumulate stale state across runs.
 */
export const askGossip = (
  node: Libp2p,
  embedding: Float32Array,
  k: number,
  opts: AskGossipOptions = {},
): ResultAsync<AskGossipResult, GraphError> => {
  const pubsub = (() => {
    try { return getPubsub(node); } catch (e) { return e as Error; }
  })();
  if (pubsub instanceof Error) {
    return errAsync(GE.writeError('search-gossip:askGossip', pubsub.message));
  }
  const p = pubsub;
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const maxPeerResponses = opts.maxPeerResponses ?? Number.POSITIVE_INFINITY;
  const requestId = randomUUID();
  const t0 = Date.now();

  return ResultAsync.fromPromise(
    new Promise<AskGossipResult>((resolve) => {
      const responses: SearchGossipResponse[] = [];
      const seenPeers = new Set<string>();
      let resolved = false;

      const handler = (event: CustomEvent<Message>): void => {
        const message = event.detail;
        if (message.topic !== SEARCH_RESP_TOPIC) return;
        if (message.data.byteLength > MAX_RESPONSE_BYTES) return;
        let resp: SearchGossipResponse;
        try {
          const parsed = JSON.parse(decoder.decode(message.data));
          if (parsed?.type !== 'search-resp') return;
          if (parsed.request_id !== requestId) return;
          resp = parsed as SearchGossipResponse;
        } catch { return; }
        if (seenPeers.has(resp.peer_id)) return;
        seenPeers.add(resp.peer_id);
        responses.push(resp);
        if (responses.length >= maxPeerResponses) finish();
      };

      const finish = (): void => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timer);
        try { p.removeEventListener('message', handler); } catch { /* benign */ }
        try { p.unsubscribe(SEARCH_RESP_TOPIC); } catch { /* benign */ }
        resolve({
          request_id: requestId,
          responses,
          took_ms: Date.now() - t0,
        });
      };

      const timer = setTimeout(finish, windowMs);

      p.subscribe(SEARCH_RESP_TOPIC);
      // ALSO subscribe to the request topic so floodsub's subscription
      // gossip layer knows we participate. Without this, peers
      // sometimes skip propagating our publishes back since they
      // don't see us advertising the topic. Idempotent + cheap.
      p.subscribe(SEARCH_REQ_TOPIC);
      p.addEventListener('message', handler);

      const req: SearchGossipRequest = {
        type: 'search-req',
        request_id: requestId,
        embedding: Array.from(embedding),
        k,
        issued_at: new Date().toISOString(),
      };
      const json = JSON.stringify(req);
      if (json.length > MAX_REQUEST_BYTES) {
        // Request too big — return empty result rather than throwing.
        finish();
        return;
      }
      // Floodsub needs a small settle window so subscription gossip
      // exchanges with peers — without this, the publish goes out
      // before peers know we care about the response topic, and
      // their responses get dropped. 80ms is enough for a LAN mesh.
      const SETTLE_MS = 100;
      setTimeout(() => {
        // Publish is fire-and-forget; floodsub returns after fanning to
        // direct neighbours. Any failure here just means no responses
        // (collector will time out, return empty).
        void p.publish(SEARCH_REQ_TOPIC, encoder.encode(json)).catch(() => undefined);
      }, SETTLE_MS);
    }),
    (e) => GE.writeError('search-gossip:ask', (e as Error).message),
  );
};
