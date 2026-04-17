/**
 * Identity bridge — the process-wide seam every other module reaches for
 * when it needs to sign an outbound record or verify an inbound one.
 *
 * Caches the ResolvedIdentity for the process lifetime so each call is
 * O(1) once warmed. `reset` is exposed for unit tests that need to
 * simulate a fresh process.
 *
 * Integration pattern for downstream modules (search-sync, share-sync,
 * touch, save, session-ingest):
 *
 *   Outbound:
 *     const env = await signForCurrentDevice(payload);
 *     if (env.isOk()) send(env.value);
 *
 *   Inbound:
 *     const ver = verifyIncomingEnvelope(received);
 *     if (ver.isOk()) handle(ver.value.payload, ver.value.verified_user_did);
 *
 * The application-layer bridge never throws and never mutates inputs.
 * All failures bubble as AppError via neverthrow.
 */

import { ResultAsync, okAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import {
  ensureIdentity,
  signForDevice,
  verifySignedEnvelope,
  type ResolvedIdentity,
  type SignedEnvelope,
  type VerifiedEnvelope,
} from './identity-lifecycle.js';
import { wellinformedHome } from '../cli/runtime.js';

// ─────────────────────── process-cached singleton ─────────────────

let cached: ResolvedIdentity | null = null;
let inflight: Promise<ResolvedIdentity> | null = null;
let homeOverride: string | null = null;

/**
 * Load-or-create the resolved identity for this process. Idempotent,
 * lazy — the first caller bootstraps, subsequent calls hit the cache.
 *
 * If two concurrent callers race the first ensureIdentity, the
 * `inflight` promise dedupes them so only one disk bootstrap happens.
 */
export const currentIdentity = (): ResultAsync<ResolvedIdentity, AppError> => {
  if (cached) return okAsync<ResolvedIdentity, AppError>(cached);
  if (!inflight) {
    const home = homeOverride ?? wellinformedHome();
    inflight = new Promise<ResolvedIdentity>((resolve, reject) => {
      ensureIdentity(home).then((res) => {
        if (res.isOk()) {
          cached = res.value;
          resolve(res.value);
        } else {
          reject(res.error);
        }
      });
    });
  }
  return ResultAsync.fromPromise(inflight, (e) => e as AppError);
};

/**
 * Sign a payload with the current device key. Thin wrapper that
 * folds in the cached identity so callers don't pass it explicitly.
 */
export const signForCurrentDevice = <T>(
  payload: T,
  signedAt?: string,
): ResultAsync<SignedEnvelope<T>, AppError> =>
  currentIdentity().andThen((id) => signForDevice(id, payload, signedAt));

/**
 * Verify an envelope. Does NOT require the local identity — any peer
 * can verify any envelope by the keys embedded inside it. The bridge
 * re-exports this for ergonomic one-import integration.
 */
export const verifyIncomingEnvelope = <T>(
  envelope: SignedEnvelope<T>,
  verifiedAt?: string,
): ResultAsync<VerifiedEnvelope<T>, AppError> =>
  verifySignedEnvelope(envelope, verifiedAt);

// ─────────────────────── test seams ───────────────────────────────

/**
 * Reset the process-cached identity. Intended for tests that spin up
 * multiple identities across temp home dirs within one Node process.
 * Do NOT call this from production code paths.
 */
export const __testReset = (): void => {
  cached = null;
  inflight = null;
  homeOverride = null;
};

/**
 * Override the home directory used by `currentIdentity()`. Intended
 * for tests; resets on __testReset or on explicit `setHomeOverride(null)`.
 */
export const __setHomeOverride = (home: string | null): void => {
  homeOverride = home;
  cached = null;
  inflight = null;
};
