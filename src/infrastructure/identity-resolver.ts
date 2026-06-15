/**
 * Identity resolver — port + in-process implementation.
 *
 * Round-2 architecture-review priority #5: pair `FOLKLORE_REQUIRE_SIGNED_NODES`
 * with an `IdentityResolver` that the daemon can ask "is this DID
 * authorised, and what's its current device chain?"
 *
 * Today's MVP: trust-on-first-sight (TOFU). The envelope is self-
 * verifiable — `share-envelope.verifyShareableNode` already does the
 * three Ed25519 checks offline. The resolver's job is the META layer:
 *
 *   - Track which DIDs we've seen sign envelopes for which rooms.
 *   - Surface that data via metrics + a JSON snapshot for audit.
 *   - Provide a single seam where future `did:web` HTTP resolution
 *     drops in WITHOUT touching share-sync.ts again.
 *
 * Tomorrow's commit: a `WebIdentityResolver` that fetches
 * `https://github.com/<user>/.well-known/did.json` (or the eventual
 * social-DID endpoint), caches with TTL, and rejects DIDs whose chain
 * doesn't match the resolved document. Same port — config flips.
 */

import type { DID } from '../domain/identity.js';
import { metrics } from '../domain/metrics.js';

// ─────────────── port ─────────────────────

/**
 * One verified appearance of a DID. The resolver accumulates these so
 * the operator can answer "who signed what, when?"
 */
export interface DidObservation {
  readonly did: DID;
  readonly device_id: string;
  readonly first_seen: string;       // ISO-8601
  readonly last_seen: string;        // ISO-8601
  readonly count: number;            // total envelopes verified for this DID
  readonly rooms: readonly string[]; // rooms this DID has signed into
}

/**
 * The resolver port. Two surfaces:
 *
 *   record   — called by share-sync after a successful envelope verify,
 *              so the resolver can log/count the sighting.
 *   list     — snapshot of every DID seen; used by `folklore
 *              identity peers` (future CLI) and the audit log.
 *
 * Future implementations (did:web, OAuth-anchored social DIDs) add a
 * `validate(did)` step that returns ok/err; the current TOFU resolver
 * always says ok and just tracks.
 */
export interface IdentityResolver {
  readonly record: (input: { did: DID; device_id: string; room: string; at?: string }) => void;
  readonly list: () => readonly DidObservation[];
  readonly findByDid: (did: DID) => DidObservation | undefined;
}

// ─────────────── in-process impl ──────────

/**
 * TOFU-style resolver — accepts every DID the verifier already
 * accepts, accumulates sightings, surfaces them via metrics +
 * `list()`. No persistence; daemon restart wipes the audit. Future
 * commit lifts state to `~/.folklore/identity-audit.json` with
 * atomic writes (mirrors entities.json pattern).
 */
export const inProcessIdentityResolver = (): IdentityResolver => {
  const byDid = new Map<DID, DidObservation>();

  const record: IdentityResolver['record'] = ({ did, device_id, room, at }) => {
    const now = at ?? new Date().toISOString();
    const existing = byDid.get(did);
    if (existing) {
      const rooms = existing.rooms.includes(room)
        ? existing.rooms
        : [...existing.rooms, room];
      byDid.set(did, {
        did,
        device_id,
        first_seen: existing.first_seen,
        last_seen: now,
        count: existing.count + 1,
        rooms,
      });
    } else {
      byDid.set(did, {
        did,
        device_id,
        first_seen: now,
        last_seen: now,
        count: 1,
        rooms: [room],
      });
      metrics.counter('identity.dids.first_seen').inc();
    }
    metrics.counter('identity.observations').inc();
    metrics.gauge('identity.dids.total').set(byDid.size);
  };

  const list: IdentityResolver['list'] = () =>
    Array.from(byDid.values()).sort((a, b) =>
      b.last_seen.localeCompare(a.last_seen),
    );

  const findByDid: IdentityResolver['findByDid'] = (did) => byDid.get(did);

  return { record, list, findByDid };
};
