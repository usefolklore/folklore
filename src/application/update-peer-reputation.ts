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
  mutatePeerReputation,
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

/**
 * Hard cap on the append-only `reviews` array. Round-4 implementation
 * review MEDIUM on unbounded growth: without compaction the file
 * expands forever (disk + GDPR risk). 1000 reviews ≈ ~250 KB JSON;
 * covers months of normal use. When exceeded, oldest reviews are
 * evicted; the materialised aggregate in `subjects` retains the full
 * evidence because it's already a running sum — cutting old `reviews`
 * doesn't change anyone's score.
 */
export const MAX_REVIEWS_RETAINED = 1000;

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
  /** Folklore home directory. */
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
 * Round-4 implementation review fixes wired in:
 *   - BLOCKER: load → modify → save now runs under a sibling-`.lock`
 *     file via `mutatePeerReputation`. Concurrent federated asks no
 *     longer race-overwrite each other's reviews.
 *   - HIGH: `reviewer_did` is shape-validated as a `did:` URI before
 *     any write. A buggy caller can't pollute the audit log with
 *     non-DID strings.
 *   - HIGH: `reviews` array is capped at MAX_REVIEWS_RETAINED, oldest
 *     evicted on overflow.
 */
export const updatePeerReputation = (
  input: UpdatePeerReputationInput,
): ResultAsync<PeerReputationFile, UpdatePeerReputationError> => {
  // Reviewer DID shape gate — caller-supplied today; the wire-up
  // commit will source it from `ensureIdentity()`. Refuse anything
  // that doesn't match `did:<method>:<id>`.
  if (!isDidShape(input.reviewer_did)) {
    return okAsync<PeerReputationFile, UpdatePeerReputationError>(emptyResultFor(input));
  }

  if (input.satisfaction_score < MIN_SATISFACTION_TO_UPDATE) {
    return okAsync<PeerReputationFile, UpdatePeerReputationError>(emptyResultFor(input));
  }

  const perPeer = extractPerPeerSubjects(input.result.matches, input.graph);
  if (perPeer.size === 0) {
    return okAsync<PeerReputationFile, UpdatePeerReputationError>(emptyResultFor(input));
  }

  return mutatePeerReputation(input.home, input.local_peer_id, (current) =>
    applyPerPeerCredits(current, perPeer, input),
  );
};

const isDidShape = (s: string): boolean =>
  typeof s === 'string' && /^did:[a-z0-9]+:.+/i.test(s);

const emptyResultFor = (input: UpdatePeerReputationInput): PeerReputationFile => ({
  version: 1,
  local_peer_id: input.local_peer_id,
  updated_at: input.now ?? new Date().toISOString(),
  subjects: {},
  reviews: [],
});

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

  // Source-peer set captured BEFORE any update so the praise-ring cap
  // looks at the source's pre-update score (the cap can't be inflated
  // by the same ask we're applying).
  const sourcePeerIds = new Set<string>();
  for (const [peerId, weight] of reviewWeights) {
    if (weight >= 1.0) sourcePeerIds.add(peerId);
  }

  for (const [peerId, subjectMap] of perPeer) {
    const weight = reviewWeights.get(peerId) ?? RELAY_WEIGHT;
    const isRelay = !sourcePeerIds.has(peerId);

    for (const [subjectKey, descriptor] of subjectMap) {
      const existingAgg = subjects[subjectKey];
      const existingScore: PeerSubjectScore | undefined = existingAgg?.peer_scores[peerId];

      // PRAISE-RING CAP (round-4 implementation review HIGH).
      //
      //   When the update is for a relay peer (received credit weight
      //   0.4 because the chunk arrived via _also_from_peers from a
      //   real source peer X), cap the satisfaction score we persist
      //   at the highest pre-update SOURCE peer's posterior_mean for
      //   this subject. Stops two colluding peers (A relays B's
      //   chunks, B relays A's chunks) from infinitely amplifying
      //   each other's reputation through fake mutual proxying.
      //
      //   Source-peer credit (weight 1.0) is never capped — that's
      //   first-hand evidence; the ceiling is the satisfaction
      //   scorer's own output.
      let cappedScore = input.satisfaction_score;
      if (isRelay) {
        const ceiling = highestSourcePeerPosterior(existingAgg, sourcePeerIds);
        if (ceiling !== null) {
          cappedScore = Math.min(cappedScore, ceiling);
        }
      }

      const updatedScore = recordObservation(existingScore, {
        target_peer_id: peerId,
        subject_key: subjectKey,
        subject_label: descriptor.label,
        subject_kind: descriptor.kind,
        reviewer_did: input.reviewer_did,
        satisfaction_score: cappedScore,
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

  // Cap the audit log at MAX_REVIEWS_RETAINED entries.
  const trimmedReviews = reviews.length > MAX_REVIEWS_RETAINED
    ? reviews.slice(reviews.length - MAX_REVIEWS_RETAINED)
    : reviews;

  return {
    version: 1,
    local_peer_id: input.local_peer_id,
    updated_at: now,
    subjects,
    reviews: trimmedReviews,
  };
};

/**
 * Highest posterior_mean among full-credit SOURCE peers for this
 * subject. Used to cap relay peers' updates so circular amplification
 * can't exceed the original signal. Returns null when no source peer
 * has prior evidence on the subject.
 */
const highestSourcePeerPosterior = (
  agg: SubjectAggregate | undefined,
  sourcePeerIds: ReadonlySet<string>,
): number | null => {
  if (!agg) return null;
  let max: number | null = null;
  for (const sourcePeer of sourcePeerIds) {
    const s = agg.peer_scores[sourcePeer];
    if (!s) continue;
    if (max === null || s.posterior_mean > max) max = s.posterior_mean;
  }
  return max;
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
