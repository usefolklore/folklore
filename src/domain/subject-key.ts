/**
 * Subject-key extraction — turn a federated ask result into the set
 * of subject identifiers a reputation update should credit.
 *
 * v1 ships only `entity:*` and `room:*` keys. Embedding-cluster keys
 * are deferred (taxonomy drift risk — see
 * `docs/peer-reputation-design.md` §8 Risk 1).
 *
 * Pure: no I/O. The caller passes in the federated matches plus the
 * graph (for entity lookups) and gets back, per peer, the set of
 * subjects that peer should be credited on.
 *
 * Strategy:
 *   1. Walk every match. If it has `_source_peer`, the subject(s) it
 *      contributed to are: the canonical entity_ids in the chunk's
 *      mentioned_entities, plus the chunk's room as a fallback when
 *      no entities surface. Empty when neither is present.
 *   2. Aggregate by peer: a peer who returned three lemlist chunks
 *      gets credited on `entity:product:lemlist` exactly once per
 *      ask (we don't double-count within one query).
 */

import type { Graph, GraphNode } from './graph.js';
import { edgesByRelationAndSource } from './graph.js';

/**
 * Structural minimal interface — DOMAIN does not depend on
 * APPLICATION. The federated layer's `FederatedMatch` happens to
 * conform, but we don't import it (round-4 review LOW on layer-leak).
 *
 * Any type with `node_id`, optional `room`, `_source_peer`, and the
 * optional `_also_from_peers` array satisfies this contract.
 */
export interface PeerAttributedMatch {
  readonly node_id: string;
  readonly room?: string;
  readonly _source_peer: string | null;
  readonly _also_from_peers?: readonly string[];
}

// ─────────────── shape ────────────────────

export type SubjectKey = string;

/** Full description of a subject + its label/kind for the rep store. */
export interface SubjectDescriptor {
  readonly key: SubjectKey;
  readonly label: string;
  readonly kind: 'entity' | 'room';
}

/** Map of `peer_id → set of subjects to credit them on`. */
export type PerPeerSubjects = Map<string, Map<SubjectKey, SubjectDescriptor>>;

// ─────────────── helpers ──────────────────

/** Build the subject key from an entity id (e.g. `entity:product:lemlist`). */
export const subjectFromEntity = (entity_id: string): SubjectDescriptor => ({
  key: entity_id,
  label: entity_id,
  kind: 'entity',
});

/** Build the subject key from a room name (e.g. `room:research`). */
export const subjectFromRoom = (room: string): SubjectDescriptor => ({
  key: `room:${room}`,
  label: room,
  kind: 'room',
});

// ─────────────── core ─────────────────────

/**
 * Walk every match attributed to a peer; collect the set of entity-id
 * subjects the chunk mentions (via the graph's `mentions` outbound
 * edges) plus a room fallback. Aggregate per peer.
 *
 * `_also_from_peers` is included alongside `_source_peer` so that when
 * the same chunk arrived from multiple peers, all of them get the
 * subject credit (subject to the `re-seeder credit` rules in the
 * application layer — full credit to source, fractional to relays).
 *
 * Returns an empty map when no peer-attributed matches are present
 * (local-only result, no federated peers responded, etc.).
 */
export const extractPerPeerSubjects = (
  matches: readonly PeerAttributedMatch[],
  graph: Graph,
): PerPeerSubjects => {
  const out: PerPeerSubjects = new Map();
  for (const m of matches) {
    const peers = peerIdsFor(m);
    if (peers.length === 0) continue;     // pure local hit — nothing to credit
    const subjects = subjectsForMatch(m, graph);
    if (subjects.length === 0) continue;  // nothing to credit on
    for (const p of peers) {
      let bucket = out.get(p);
      if (!bucket) {
        bucket = new Map();
        out.set(p, bucket);
      }
      for (const s of subjects) bucket.set(s.key, s);
    }
  }
  return out;
};

/**
 * Subjects a single match should credit: entity-ids (from the chunk's
 * mentions edges, when the local graph has the chunk) PLUS the room
 * (always, when known).
 *
 * Round-4 review HIGH on the previous version: if the remote peer
 * returned a NOVEL chunk the local graph hadn't ingested yet,
 * `nodeById.get` returned undefined and the function dropped ALL
 * credit — silently penalising peers who brought genuinely new
 * knowledge. Now: room subject is always emitted when known, even
 * for novel chunks; entity subjects only fire when the local graph
 * has the chunk.
 */
const subjectsForMatch = (
  m: PeerAttributedMatch,
  graph: Graph,
): readonly SubjectDescriptor[] => {
  const node: GraphNode | undefined = graph.nodeById.get(m.node_id);
  const out: SubjectDescriptor[] = [];
  const seen = new Set<SubjectKey>();

  // entity:* — only fires when the local graph already has the
  // chunk. Novel chunks (peer brings new knowledge) fall through
  // cleanly to the room-only path below.
  if (node) {
    for (const edge of edgesByRelationAndSource(graph, 'mentions', m.node_id)) {
      const target = edge.target;
      if (typeof target !== 'string' || target.length === 0) continue;
      const desc = subjectFromEntity(target);
      if (seen.has(desc.key)) continue;
      seen.add(desc.key);
      out.push(desc);
    }
  }

  // room:* — always emitted when a room is known. Source: the local
  // node's room first; if the chunk is novel, fall back to the
  // match's wire-level `room` field. Closes the silent zero-credit
  // bug for novel chunks.
  const room = (typeof node?.room === 'string' && node.room.length > 0)
    ? node.room
    : (typeof m.room === 'string' && m.room.length > 0 ? m.room : null);
  if (room) {
    const desc = subjectFromRoom(room);
    if (!seen.has(desc.key)) {
      seen.add(desc.key);
      out.push(desc);
    }
  }
  return out;
};

/**
 * Collect every peer attributed to this match — `_source_peer` first
 * (full credit), then `_also_from_peers` (fractional credit applied
 * by the rep update layer, not here).
 */
const peerIdsFor = (m: PeerAttributedMatch): readonly string[] => {
  const out: string[] = [];
  if (typeof m._source_peer === 'string' && m._source_peer.length > 0 && m._source_peer !== 'local') {
    out.push(m._source_peer);
  }
  if (Array.isArray(m._also_from_peers)) {
    for (const p of m._also_from_peers) {
      if (typeof p === 'string' && p.length > 0 && p !== 'local' && !out.includes(p)) {
        out.push(p);
      }
    }
  }
  return out;
};
