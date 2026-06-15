/**
 * Build a peer-ordering callback for `runFederatedSearch` that ranks
 * connected peers by reputation on the query's subjects + applies an
 * epsilon-greedy exploration floor.
 *
 * The ordering is the load-spreading mechanism the design doc §3
 * outlines: round-robin across the top-N rep peers emerges naturally
 * because `peerRankAt` includes a load_factor (recent asks) — but we
 * also sprinkle in a small probability of moving an unknown / random
 * peer to the front so new experts get sampled (`docs/peer-reputation
 * -design.md` §7 ADD-NEXT exploration floor).
 *
 * Pure-ish: the only async step is loading the rep file. After that,
 * the returned closure is synchronous and used by the federated layer
 * during fan-out.
 *
 * Cold-start safe: when the rep file is empty / missing, the closure
 * just returns the input list unchanged. Federated search behaviour
 * is identical to the pre-rep world until the file accumulates data.
 */

import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import {
  rankPeersForSubject,
  type PeerIdRef,
  type PeerReputationFile,
  type SubjectKey,
} from '../domain/peer-reputation.js';
import { loadPeerReputation } from '../infrastructure/peer-reputation-store.js';
import type { EntityRegistry } from '../infrastructure/entity-registry.js';

/**
 * Probability per call that the topmost rep-ranked peer is swapped
 * with a random one — gives unknown peers a chance to surface
 * before the rep system has any data on them.
 *
 * 0.15 lifted from the round-3 architecture review's
 * "exploration floor" recommendation; tunable.
 */
export const EXPLORATION_EPSILON = 0.15;

export interface BuildPeerOrderInput {
  readonly home: string;
  readonly localPeerId: PeerIdRef;
  readonly query: string;
  readonly registry: EntityRegistry;
  /** Optional sliding-window load-counter; pass an empty Map until
   * the asker tracks per-peer recent-ask counts. */
  readonly recentAsksPerPeer?: ReadonlyMap<PeerIdRef, number>;
  /** Test seam — returns a deterministic 0..1 instead of Math.random. */
  readonly randomFn?: () => number;
}

export type PeerOrderFn = (peerIds: readonly string[]) => readonly string[];

// ─────────────── subject derivation ───────

/**
 * Derive candidate subject keys for a query. Entity-only
 * (resolves the trimmed query against the registry, accepts both a
 * canonical id and an alias). V5: the `room:` subject scheme was
 * removed with the rooms abstraction.
 *
 * Returns [] when the registry can't surface anything — peerOrder
 * will then reduce to "no rep signal", same as a fresh install.
 */
const deriveQuerySubjects = (
  query: string,
  registry: EntityRegistry,
): SubjectKey[] => {
  const out: SubjectKey[] = [];
  const trimmed = query.trim();

  // Entity:* — try canonical-id first, then alias resolve.
  if (trimmed.length > 0) {
    try {
      const ent =
        registry.getById(trimmed) ?? registry.resolve(trimmed);
      if (ent) out.push(ent.id);
    } catch {
      // Registry implementations may throw on edge cases — see codex
      // round-2 review on ask.ts. Don't propagate.
    }
  }

  return out;
};

// ─────────────── public API ───────────────

/**
 * Resolve to a peer-ordering callback. Best-effort: load failures
 * (no rep file yet, malformed file, etc.) fall through to a no-op
 * identity function so federated search degrades gracefully.
 */
export const buildReputationPeerOrder = (
  input: BuildPeerOrderInput,
): ResultAsync<PeerOrderFn, never> => {
  return loadPeerReputation(input.home, input.localPeerId)
    .map((file) => buildOrderFromFile(file, input))
    .orElse(() => okAsync<PeerOrderFn, never>(identityOrder));
};

const identityOrder: PeerOrderFn = (peerIds) => peerIds;

/**
 * Pure construction of the ordering callback from a loaded rep file.
 * Exposed for tests so they don't need a temp dir round-trip.
 */
export const buildOrderFromFile = (
  file: PeerReputationFile,
  input: Omit<BuildPeerOrderInput, 'home' | 'localPeerId'>,
): PeerOrderFn => {
  const subjects = deriveQuerySubjects(input.query, input.registry);
  const recent = input.recentAsksPerPeer ?? new Map<PeerIdRef, number>();
  const randomFn = input.randomFn ?? Math.random;
  const now = new Date().toISOString();

  return (peerIds) => {
    if (peerIds.length <= 1) return peerIds;
    if (subjects.length === 0) return peerIds;

    // For each peer, take the MAX rank across the candidate subjects.
    // This gives a lemlist-expert peer the high rank when the query
    // resolves to entity:product:lemlist.
    const ranks = new Map<string, number | null>();
    for (const peerId of peerIds) {
      let best: number | null = null;
      for (const sub of subjects) {
        const agg = file.subjects[sub];
        if (!agg) continue;
        const ranked = rankPeersForSubject(agg, [peerId], now, recent);
        const r = ranked[0]?.rank;
        if (r === null || r === undefined) continue;
        if (best === null || r > best) best = r;
      }
      ranks.set(peerId, best);
    }

    // Stable sort: known peers by rank desc, unknowns last in input order.
    const sorted = [...peerIds].sort((a, b) => {
      const ra = ranks.get(a) ?? null;
      const rb = ranks.get(b) ?? null;
      if (ra === null && rb === null) return 0;
      if (ra === null) return 1;
      if (rb === null) return -1;
      return rb - ra;
    });

    // Epsilon-greedy: with probability EXPLORATION_EPSILON, swap the
    // top-of-list with a random peer (could be unknown). Gives
    // newcomers a chance to surface before the rep system has data.
    //
    // Skip when every peer is unranked — there's no "exploit vs
    // explore" trade-off to make, just an input list with no signal.
    // Firing the swap here was the source of intermittent
    // `empty rep file returns the input order unchanged` failures
    // (~5% of CI runs) — Math.random() < EPSILON would occasionally
    // permute the input and break the unit-test contract.
    const anyRanked = [...ranks.values()].some((r) => r !== null);
    if (anyRanked && sorted.length > 1 && randomFn() < EXPLORATION_EPSILON) {
      const j = Math.floor(randomFn() * sorted.length);
      if (j > 0 && j < sorted.length) {
        const swap = sorted[j];
        sorted.splice(j, 1);
        sorted.unshift(swap);
      }
    }

    return sorted;
  };
};

// silence unused
void errAsync;
