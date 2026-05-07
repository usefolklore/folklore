/**
 * Update peer-reputation.json after every federated ask.
 *
 * Wired by the federated ask path (`cli/commands/ask.ts:askFederated`)
 * AFTER `buildPeerPullTelemetry` produces the satisfaction score. We
 * read the current rep file, call `recordObservation` for every
 * (peer × subject) pair the result attributes, append a single
 * ReviewEvent to the audit log, and atomically save.
 *
 * Re-seeder credit (`docs/peer-reputation-load-spreading.md` §5):
 *   - Source peer (`_source_peer`)            → full credit (weight 1.0)
 *   - Relay peers (`_also_from_peers`)        → fractional (RELAY_WEIGHT)
 *
 * The fractional weight is capped so circular amplification can't
 * exceed the original signal — caller is expected to honour
 * `RELAY_WEIGHT < 1.0`.
 *
 * Pure ish: this module has no clock or env dependence outside the
 * optional `now` parameter (testing seam). All disk I/O goes through
 * the store layer.
 */

import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { randomBytes } from 'node:crypto';
import type { Graph } from '../domain/graph.js';
import type { FederatedSearchResult } from './federated-search.js';
import {
  PRIOR_MEAN,
  recordObservation,
  type PeerReputationFile,
  type PeerSubjectScore,
  type ReviewEvent,
  type SubjectAggregate,
  type SubjectKey,
  type ReviewerDid,
  type Iso,
} from '../domain/peer-reputation.js';
import {
  extractPerPeerSubjects,
  type SubjectDescriptor,
} from '../domain/subject-key.js';
import {
  loadPeerReputation,
  savePeerReputation,
  type PeerReputationStoreError,
} from '../infrastructure/peer-reputation-store.js';

// ─────────────── config ───────────────────

/**
 * Weight applied to relay peers (peers in `_also_from_peers`)
 * relative to the source peer (`_source_peer`). 0.4 keeps the source
 * dominant while still rewarding re-distribution. Tunable.
 */
export const RELAY_WEIGHT = 0.4;

/**
 * Floor on the satisfaction score below which we don't update
 * reputation at all. Prevents one frustrated query from poisoning
 * everyone — under 0.4 the agent contract already says
 * `search_required` or `ask_user`, so the answer wasn't really used.
 */
export const MIN_SATISFACTION_TO_UPDATE = 0.4;

// ─────────────── shape ────────────────────

export interface UpdatePeerReputationInput {
  /** Satisfaction score for this ask (from `peer-pull-telemetry`). */
  readonly satisfaction_score: number;
  /** Federated search result — drives subject + peer attribution. */
  readonly result: FederatedSearchResult;
  /** Loaded graph (already in scope from the ask path). */
  readonly graph: Graph;
  /** Reviewer DID — caller's local identity. */
  readonly reviewer_did: ReviewerDid;
  /** Local peer id, recorded in the file's header. */
  readonly local_peer_id: string;
  /** Wellinformed home directory. */
  readonly home: string;
  /** Optional ask correlation id for audit. */
  readonly ask_id?: string;
  /** Testing seam — defaults to wall clock. */
  readonly now?: Iso;
}

export type UpdatePeerReputationError = PeerReputationStoreError;

/**
 * Apply a federated ask's outcome to the peer-reputation store.
 *
 * Returns the new file shape on success; the caller usually doesn't
 * care about the body, just whether the update succeeded. Errors are
 * load/save failures from the store; the math + extraction are pure.
 */
export const updatePeerReputation = (
  input: UpdatePeerReputationInput,
): ResultAsync<PeerReputationFile, UpdatePeerReputationError> => {
  const score = input.satisfaction_score;
  if (score < MIN_SATISFACTION_TO_UPDATE) {
    // No-op — caller treats this as success without writing.
    return okAsync<PeerReputationFile, UpdatePeerReputationError>({
      version: 1,
      local_peer_id: input.local_peer_id,
      updated_at: input.now ?? new Date().toISOString(),
      subjects: {},
      reviews: [],
    });
  }

  const perPeer = extractPerPeerSubjects(input.result.matches, input.graph);
  if (perPeer.size === 0) {
    // No federated peers contributed — nothing to credit.
    return okAsync<PeerReputationFile, UpdatePeerReputationError>({
      version: 1,
      local_peer_id: input.local_peer_id,
      updated_at: input.now ?? new Date().toISOString(),
      subjects: {},
      reviews: [],
    });
  }

  return loadPeerReputation(input.home, input.local_peer_id)
    .andThen((file): ResultAsync<PeerReputationFile, UpdatePeerReputationError> => {
      const next = applyPerPeerCredits(file, perPeer, input);
      return savePeerReputation(input.home, next).map(() => next);
    });
};

// ─────────────── pure aggregation ─────────

/**
 * Walk the per-peer subject map and merge each (peer × subject)
 * observation into the file. Source vs relay credit is decided by
 * peer position in the federated matches: `_source_peer` is full
 * weight, anyone in `_also_from_peers` gets RELAY_WEIGHT.
 */
const applyPerPeerCredits = (
  file: PeerReputationFile,
  perPeer: ReadonlyMap<string, ReadonlyMap<SubjectKey, SubjectDescriptor>>,
  input: UpdatePeerReputationInput,
): PeerReputationFile => {
  const now = input.now ?? new Date().toISOString();
  const reviewWeights = computePerPeerWeights(input.result, perPeer);

  // Mutable shadow copies — cheaper than 100 spread operations.
  const subjects: Record<SubjectKey, SubjectAggregate> = {
    ...(file.subjects as Record<SubjectKey, SubjectAggregate>),
  };
  const reviews: ReviewEvent[] = file.reviews.slice();

  for (const [peerId, subjectMap] of perPeer) {
    const weight = reviewWeights.get(peerId) ?? RELAY_WEIGHT;
    for (const [subjectKey, descriptor] of subjectMap) {
      const existingAgg = subjects[subjectKey];
      const existingScore: PeerSubjectScore | undefined = existingAgg?.peer_scores[peerId];
      const updatedScore = recordObservation(existingScore, {
        target_peer_id: peerId,
        subject_key: subjectKey,
        subject_label: descriptor.label,
        subject_kind: descriptor.kind,
        reviewer_did: input.reviewer_did,
        satisfaction_score: input.satisfaction_score,
        review_weight: weight,
        now,
      });
      const peer_scores: Record<string, PeerSubjectScore> = {
        ...(existingAgg?.peer_scores ?? {}),
        [peerId]: updatedScore,
      };
      subjects[subjectKey] = {
        key: subjectKey,
        label: descriptor.label,
        kind: descriptor.kind,
        peer_scores,
      };
    }

    // One review event per (peer, ask) — captures all subjects
    // credited for this peer in a single audit row.
    reviews.push({
      review_id: `rev_${randomBytes(6).toString('hex')}`,
      ask_id: input.ask_id,
      reviewer_did: input.reviewer_did,
      subject_keys: Array.from(subjectMap.keys()),
      target_peer_id: peerId,
      satisfaction_score: input.satisfaction_score,
      weight,
      created_at: now,
    });
  }

  return {
    version: 1,
    local_peer_id: input.local_peer_id,
    updated_at: now,
    subjects,
    reviews,
  };
};

/**
 * Decide review weight per peer in this ask:
 *   - Any peer that appears as `_source_peer` for any match → 1.0
 *   - Anyone else (relay-only) → RELAY_WEIGHT
 */
const computePerPeerWeights = (
  result: FederatedSearchResult,
  perPeer: ReadonlyMap<string, ReadonlyMap<SubjectKey, SubjectDescriptor>>,
): Map<string, number> => {
  const sourcePeers = new Set<string>();
  for (const m of result.matches) {
    if (typeof m._source_peer === 'string' && m._source_peer !== 'local') {
      sourcePeers.add(m._source_peer);
    }
  }
  const out = new Map<string, number>();
  for (const peerId of perPeer.keys()) {
    out.set(peerId, sourcePeers.has(peerId) ? 1.0 : RELAY_WEIGHT);
  }
  return out;
};

// silence imports kept for type-shape stability
void PRIOR_MEAN;
void errAsync;
