/**
 * Subject-key extraction — turn a federated ask result into the set
 * of subject identifiers a reputation update should credit.
 *
 * V5 (Phase 24): rooms deleted. The room: subject scheme is gone;
 * peer reputation now credits entity:* subjects only. Chunks that
 * surface no entities contribute no credit — the "lossy but correct"
 * flatten described in docs/p2p/peer-reputation-design.md §84.
 *
 * Pure: no I/O. The caller passes in the federated matches plus the
 * graph (for entity lookups) and gets back, per peer, the set of
 * entity subjects that peer should be credited on.
 */

import type { Graph, GraphNode } from './graph.js';
import { edgesByRelationAndSource } from './graph.js';

/**
 * Structural minimal interface — DOMAIN does not depend on APPLICATION.
 *
 * Any type with `node_id`, `_source_peer`, and the optional
 * `_also_from_peers` array satisfies this contract.
 */
export interface PeerAttributedMatch {
  readonly node_id: string;
  readonly _source_peer: string | null;
  readonly _also_from_peers?: readonly string[];
}

// ─────────────── shape ────────────────────

export type SubjectKey = string;

/** Full description of a subject + its label/kind for the rep store. */
export interface SubjectDescriptor {
  readonly key: SubjectKey;
  readonly label: string;
  /** V5: only `entity` subjects exist. Union kept open for forward
   *  extension (e.g. embedding-cluster keys in a later phase). */
  readonly kind: 'entity';
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

// ─────────────── core ─────────────────────

/**
 * Walk every match attributed to a peer; collect the set of entity-id
 * subjects the chunk mentions (via the graph's `mentions` outbound
 * edges). Aggregate per peer.
 *
 * V5: chunks without local mentions edges contribute no subjects.
 * Novel peer chunks (not in local graph) cannot mention entities for
 * reputation purposes — the room: fallback is gone.
 */
export const extractPerPeerSubjects = (
  matches: readonly PeerAttributedMatch[],
  graph: Graph,
): PerPeerSubjects => {
  const out: PerPeerSubjects = new Map();
  for (const m of matches) {
    const peers = peerIdsFor(m);
    if (peers.length === 0) continue;
    const subjects = subjectsForMatch(m, graph);
    if (subjects.length === 0) continue;
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
 * Subjects a single match should credit: entity-ids from the chunk's
 * mentions edges (when the local graph has the chunk). Returns empty
 * when the chunk is novel or has no mentions edges.
 */
const subjectsForMatch = (
  m: PeerAttributedMatch,
  graph: Graph,
): readonly SubjectDescriptor[] => {
  const node: GraphNode | undefined = graph.nodeById.get(m.node_id);
  if (!node) return [];

  const out: SubjectDescriptor[] = [];
  const seen = new Set<SubjectKey>();

  for (const edge of edgesByRelationAndSource(graph, 'mentions', m.node_id)) {
    const target = edge.target;
    if (typeof target !== 'string' || target.length === 0) continue;
    const desc = subjectFromEntity(target);
    if (seen.has(desc.key)) continue;
    seen.add(desc.key);
    out.push(desc);
  }
  return out;
};

/**
 * Collect every peer attributed to this match — `_source_peer` first
 * (full credit), then `_also_from_peers` (fractional credit applied by
 * the rep update layer, not here).
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
