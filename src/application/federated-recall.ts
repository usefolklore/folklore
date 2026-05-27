/**
 * Federated entity recall — fan-out orchestrator.
 *
 * Sibling to application/federated-search.ts. Same fan-out pattern
 * (Promise.all + per-peer timeout — NOT ResultAsync.combine which
 * short-circuits on first error and would block the whole fan-out
 * when any peer is slow).
 *
 * Wire shape: ships canonical entity_id (deterministic across peers
 * via the slug function in domain/entity.ts), receives chunk
 * metadata back. Per the architectural review: never transmits
 * `surface` text from local mention edges — that's user prose.
 *
 * Returns a unified envelope the renderer can consume the same way
 * it consumes peer-pull telemetry — total time, alive peers,
 * responded peers, merged hits with per-peer attribution.
 */

import type { Libp2p } from '@libp2p/interface';
import type { Entity } from '../domain/entity.js';
import type { EntityRegistry } from '../infrastructure/entity-registry.js';
import {
  openRecallStream,
  type RecallRequest,
  type RecallPeerHit,
} from '../infrastructure/recall-sync.js';

// ─────────────── output shape ─────────────

export interface FederatedRecallHit extends RecallPeerHit {
  readonly source_peer: string;          // peer id (always set on remote hits)
}

export interface FederatedRecallResult {
  readonly entity_id: string;
  readonly entity?: Entity;              // local registry view (when we know it)
  readonly local_mentions: number;       // count from local recall
  readonly remote_hits: readonly FederatedRecallHit[];
  readonly peers_queried: number;
  readonly peers_responded: number;
  readonly peers_timed_out: number;
  readonly peers_errored: number;
  readonly peers_unknown_entity: number; // peers that didn't know this entity
  readonly took_ms: number;
}

// ─────────────── deps + params ────────────

export interface FederatedRecallDeps {
  readonly node: Libp2p;
  readonly entityRegistry: EntityRegistry;
}

export interface FederatedRecallParams {
  /** Surface text OR canonical id — caller can pass either; we resolve. */
  readonly query: string;
  readonly limit: number;
  readonly room?: string;
}

// ─────────────── per-peer outcome ─────────

interface PeerOutcome {
  readonly peerId: string;
  readonly status:
    | 'ok'
    | 'unknown_entity'
    | 'unauthorized'
    | 'timeout'
    | 'error';
  readonly hits: readonly RecallPeerHit[];
}

// ─────────────── orchestrator ─────────────

export const runFederatedRecall = async (
  deps: FederatedRecallDeps,
  params: FederatedRecallParams,
): Promise<FederatedRecallResult> => {
  const t0 = Date.now();

  // Resolve query → canonical entity_id. If the local registry
  // doesn't know it, ship the raw query as-is (a peer that DOES
  // know it will resolve via its own registry on the responder side
  // — currently the responder takes entity_id verbatim, so callers
  // must pass an id that's been canonicalised. v2 can add a
  // surface-form fallback variant of the protocol).
  const local = deps.entityRegistry.resolve(params.query);
  const entityId = local?.id ?? params.query;

  const peers = deps.node.getPeers().map((p) => p.toString());
  if (peers.length === 0) {
    return {
      entity_id: entityId,
      entity: local,
      local_mentions: local?.mention_count ?? 0,
      remote_hits: [],
      peers_queried: 0,
      peers_responded: 0,
      peers_timed_out: 0,
      peers_errored: 0,
      peers_unknown_entity: 0,
      took_ms: Date.now() - t0,
    };
  }

  const req: RecallRequest = {
    type: 'recall',
    entity_id: entityId,
    limit: params.limit,
  };

  // Fan-out — Promise.all NOT ResultAsync.combine (Pattern locked
  // from federated-search.ts: combine short-circuits on first error
  // and starves remaining peers of their timeout window).
  const probe = async (peerId: string): Promise<PeerOutcome> => {
    const r = await openRecallStream(deps.node, peerId, req);
    if (r.isErr()) {
      return { peerId, status: 'error', hits: [] };
    }
    const wire = r.value;
    if (!wire) {
      return { peerId, status: 'timeout', hits: [] };
    }
    if (wire.type === 'recall_err') {
      return {
        peerId,
        status: wire.reason === 'unknown_entity' ? 'unknown_entity' : 'unauthorized',
        hits: [],
      };
    }
    // recall_ok — but mention_count == 0 still counts as
    // 'unknown_entity' for diagnostics (peer didn't reject,
    // it just had no mentions).
    if (wire.hits.length === 0) {
      return { peerId, status: 'unknown_entity', hits: [] };
    }
    return { peerId, status: 'ok', hits: wire.hits };
  };
  const outcomes: readonly PeerOutcome[] = await Promise.all(peers.map(probe));

  const peers_responded = outcomes.filter((o) => o.status === 'ok').length;
  const peers_timed_out = outcomes.filter((o) => o.status === 'timeout').length;
  const peers_errored = outcomes.filter((o) => o.status === 'error').length;
  const peers_unknown_entity = outcomes.filter(
    (o) => o.status === 'unknown_entity',
  ).length;

  // Merge — dedupe by node_id (same source_uri may live on many
  // peers; show first-seen + collapse to a single row tagged with
  // the responding peer for attribution).
  const byId = new Map<string, FederatedRecallHit>();
  for (const o of outcomes) {
    if (o.status !== 'ok') continue;
    for (const h of o.hits) {
      if (!byId.has(h.node_id)) {
        byId.set(h.node_id, { ...h, source_peer: o.peerId });
      }
    }
  }
  // Sort merged hits by recency desc.
  const remote_hits = Array.from(byId.values()).sort(
    (a, b) => (b.fetched_at ?? '').localeCompare(a.fetched_at ?? ''),
  );

  return {
    entity_id: entityId,
    entity: local,
    local_mentions: local?.mention_count ?? 0,
    remote_hits: remote_hits.slice(0, params.limit),
    peers_queried: peers.length,
    peers_responded,
    peers_timed_out,
    peers_errored,
    peers_unknown_entity,
    took_ms: Date.now() - t0,
  };
};
