/**
 * Identity lifecycle — application-layer orchestration of the user
 * and device identity tuple.
 *
 * Use cases:
 *   - `ensureIdentity(home)`      — create-or-load, idempotent daemon bootstrap
 *   - `rotateDeviceKey(home)`     — revoke old device, authorize fresh one under same user DID
 *   - `exportRecoveryHex(home)`   — dump the 32-byte user seed as hex (v1 recovery format)
 *   - `importRecoveryHex(home,s)` — restore user identity from a seed hex, regenerate device
 *   - `signForDevice(home, T)`    — wrap a payload T in a SignedEnvelope using the local device key
 *   - `verifySignedEnvelope(env)` — pure passthrough to the domain verifier (re-exported for ergonomics)
 *
 * All fallible ops return ResultAsync. No classes, no throws. Pure
 * functions over the infrastructure-store and domain-identity ports.
 */

import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { hostname } from 'node:os';
import { randomBytes } from 'node:crypto';
import {
  createUserIdentity,
  userIdentityFromSeed,
  authorizeDevice,
  generateKeyPair,
  signEnvelope,
  verifyEnvelope,
  type DID,
  type DeviceKey,
  type SignedEnvelope,
  type UserIdentity,
  type VerifiedEnvelope,
} from '../domain/identity.js';
import { PeerError } from '../domain/errors.js';
import type { AppError } from '../domain/errors.js';
import {
  identityPaths,
  loadUserPublic,
  loadUserSeed,
  loadDevice,
  saveUserPublic,
  saveUserSeed,
  saveDevice,
  deleteDevice,
  type IdentityPaths,
} from '../infrastructure/identity-store.js';

// ─────────────────────── aggregate view ───────────────────────────

/**
 * Full local identity state — the caller of ensureIdentity gets this
 * back. Carries everything needed to sign outbound envelopes AND
 * verify inbound ones signed under the same user (different device).
 */
export interface ResolvedIdentity {
  readonly user: UserIdentity;
  readonly userPrivateKey: Uint8Array;
  readonly deviceKey: DeviceKey;
  readonly devicePrivateKey: Uint8Array;
  readonly paths: IdentityPaths;
}

const generateDeviceId = (): string => {
  // Format: <hostname>-<12-hex>. Hostname is non-authoritative metadata
  // (useful for humans scanning device.json); the 12-hex suffix gives
  // uniqueness so one user authorizing two devices on the same host
  // produces distinct IDs.
  const host = hostname().replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 32);
  const suffix = Buffer.from(randomBytes(6)).toString('hex');
  return `${host}-${suffix}`;
};

const nowIso = (): string => new Date().toISOString();

// ─────────────────────── ensureIdentity ───────────────────────────

/**
 * Idempotent bootstrap: loads existing user + device, creating either
 * if absent. If the user exists but has no device (or the device file
 * is corrupt / belongs to another user), authorizes a fresh device
 * under the existing user DID.
 */
export const ensureIdentity = (
  homeDir: string,
  clock: () => string = nowIso,
): ResultAsync<ResolvedIdentity, AppError> => {
  const paths = identityPaths(homeDir);

  return loadExistingUser(paths)
    .mapErr((e): AppError => e)
    .andThen((existing) => {
      if (existing) return okAsync<{ user: UserIdentity; userPrivateKey: Uint8Array }, AppError>(existing);
      return createAndPersistUser(paths, clock)
        .mapErr((e): AppError => e);
    })
    .andThen((user) =>
      loadDevice(paths)
        .mapErr((e): AppError => e)
        .andThen((dev) => {
          if (dev && dev.deviceKey.user_did === user.user.did) {
            return okAsync<ResolvedIdentity, AppError>({
              user: user.user,
              userPrivateKey: user.userPrivateKey,
              deviceKey: dev.deviceKey,
              devicePrivateKey: dev.devicePrivateKey,
              paths,
            });
          }
          // No device OR device belongs to a different user — generate a fresh one.
          return createAndAuthorizeDevice(paths, user.user, user.userPrivateKey, clock)
            .mapErr((e): AppError => e)
            .map((d) => ({
              user: user.user,
              userPrivateKey: user.userPrivateKey,
              deviceKey: d.deviceKey,
              devicePrivateKey: d.devicePrivateKey,
              paths,
            }));
        }),
    );
};

// ─────────────────────── rotate / export / import ─────────────────

/**
 * Rotate the device key — delete the current device.json, generate a
 * fresh keypair, authorize it under the user DID, persist. The user
 * identity is unchanged; old envelopes signed by the previous device
 * remain verifiable (their device_public_key is embedded), but new
 * signatures from the prior device will no longer match the current
 * device.json if the caller later checks "is this my current device".
 */
export const rotateDeviceKey = (
  homeDir: string,
  clock: () => string = nowIso,
): ResultAsync<ResolvedIdentity, AppError> => {
  const paths = identityPaths(homeDir);
  return loadExistingUser(paths)
    .mapErr((e): AppError => e)
    .andThen((existing) => {
      if (!existing) {
        return errAsync<{ user: UserIdentity; userPrivateKey: Uint8Array }, AppError>(
          PeerError.identityReadError(paths.userPublicPath, 'no user identity to rotate'),
        );
      }
      return okAsync<{ user: UserIdentity; userPrivateKey: Uint8Array }, AppError>(existing);
    })
    .andThen((user) =>
      deleteDevice(paths)
        .mapErr((e): AppError => e)
        .andThen(() => createAndAuthorizeDevice(paths, user.user, user.userPrivateKey, clock).mapErr((e): AppError => e))
        .map((d) => ({
          user: user.user,
          userPrivateKey: user.userPrivateKey,
          deviceKey: d.deviceKey,
          devicePrivateKey: d.devicePrivateKey,
          paths,
        })),
    );
};

// ─────────────── BIP39 mnemonic recovery (v4.1) ───────────────

/**
 * Export the user seed as a 24-word BIP39 English mnemonic — the v4.1
 * default recovery format. Hex is still supported via exportRecoveryHex.
 *
 * 24 words = 256 bits of entropy = exact match for the Ed25519 seed
 * length. No HKDF derivation involved.
 */
export const exportRecoveryMnemonic = (homeDir: string): ResultAsync<string, AppError> => {
  const paths = identityPaths(homeDir);
  return loadUserSeed(paths)
    .mapErr((e): AppError => e)
    .andThen((seed) =>
      ResultAsync.fromPromise(
        (async () => {
          if (!seed) throw new Error('NO_SEED');
          const { mnemonicFromSeed } = await import('./bip39-recovery.js');
          const r = mnemonicFromSeed(seed);
          if (r.isErr()) throw new Error(r.error.type);
          return r.value;
        })(),
        (e): AppError => {
          if ((e as Error).message === 'NO_SEED') {
            return PeerError.identityReadError(paths.userSeedPath, 'no user seed — run ensureIdentity first');
          }
          return PeerError.identityReadError('(mnemonic)', (e as Error).message);
        },
      ),
    );
};

/**
 * Restore identity from a 24-word BIP39 mnemonic. Same outcome shape
 * as importRecoveryHex. Detects whether input is mnemonic vs hex via
 * `importRecoveryAuto`.
 */
export const importRecoveryMnemonic = (
  homeDir: string,
  mnemonic: string,
  clock: () => string = nowIso,
): ResultAsync<ResolvedIdentity, AppError> => {
  return ResultAsync.fromPromise(import('./bip39-recovery.js'), (e) =>
    PeerError.identityReadError('(import)', (e as Error).message),
  ).andThen((mod) => {
    const seedRes = mod.seedFromMnemonic(mnemonic);
    if (seedRes.isErr()) return errAsync<ResolvedIdentity, AppError>(seedRes.error);
    return importRecoverySeed(homeDir, seedRes.value, clock);
  });
};

/**
 * Auto-detect and dispatch: if input is 24 whitespace-separated words,
 * treat as BIP39 mnemonic. If it's a 64-hex string, treat as hex seed.
 * Anything else returns InvalidDIDError.
 */
export const importRecoveryAuto = (
  homeDir: string,
  input: string,
  clock: () => string = nowIso,
): ResultAsync<ResolvedIdentity, AppError> => {
  const trimmed = input.trim();
  const wordCount = trimmed.split(/\s+/).length;
  if (wordCount === 24) return importRecoveryMnemonic(homeDir, trimmed, clock);
  if (/^[0-9a-fA-F]{64}$/.test(trimmed.replace(/^0x/i, ''))) return importRecoveryHex(homeDir, trimmed, clock);
  return errAsync<ResolvedIdentity, AppError>(
    PeerError.identityParseError('(input)', 'recovery input must be a 24-word BIP39 mnemonic OR a 64-char hex seed'),
  );
};

/** Internal: shared restore-from-bytes path used by both hex and mnemonic. */
const importRecoverySeed = (
  homeDir: string,
  seed: Uint8Array,
  clock: () => string,
): ResultAsync<ResolvedIdentity, AppError> => {
  const paths = identityPaths(homeDir);
  const userRes = userIdentityFromSeed(seed, clock());
  if (userRes.isErr()) return errAsync<ResolvedIdentity, AppError>(userRes.error);
  const { identity, privateKey } = userRes.value;
  return saveUserPublic(paths, identity)
    .mapErr((e): AppError => e)
    .andThen(() => saveUserSeed(paths, privateKey).mapErr((e): AppError => e))
    .andThen(() => deleteDevice(paths).mapErr((e): AppError => e))
    .andThen(() => createAndAuthorizeDevice(paths, identity, privateKey, clock).mapErr((e): AppError => e))
    .map((d) => ({
      user: identity,
      userPrivateKey: privateKey,
      deviceKey: d.deviceKey,
      devicePrivateKey: d.devicePrivateKey,
      paths,
    }));
};

/** Export the user seed as a hex string (v1 recovery format). */
export const exportRecoveryHex = (homeDir: string): ResultAsync<string, AppError> => {
  const paths = identityPaths(homeDir);
  return loadUserSeed(paths)
    .mapErr((e): AppError => e)
    .andThen((seed) => {
      if (!seed) {
        return errAsync<string, AppError>(
          PeerError.identityReadError(paths.userSeedPath, 'no user seed — run ensureIdentity first'),
        );
      }
      let hex = '';
      for (let i = 0; i < seed.length; i++) hex += seed[i].toString(16).padStart(2, '0');
      return okAsync<string, AppError>(hex);
    });
};

/**
 * Restore a user identity from a recovery hex seed. Overwrites any
 * existing user.* files. Generates a fresh device key under the
 * restored user DID.
 */
export const importRecoveryHex = (
  homeDir: string,
  hexSeed: string,
  clock: () => string = nowIso,
): ResultAsync<ResolvedIdentity, AppError> => {
  const paths = identityPaths(homeDir);
  const clean = hexSeed.trim().replace(/^0x/i, '');
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    return errAsync<ResolvedIdentity, AppError>(
      PeerError.identityParseError('(input)', `recovery hex must be 64 lowercase hex chars, got ${clean.length}`),
    );
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);

  const userRes = userIdentityFromSeed(bytes, clock());
  if (userRes.isErr()) return errAsync<ResolvedIdentity, AppError>(userRes.error);
  const { identity, privateKey } = userRes.value;

  return saveUserPublic(paths, identity)
    .mapErr((e): AppError => e)
    .andThen(() => saveUserSeed(paths, privateKey).mapErr((e): AppError => e))
    .andThen(() => deleteDevice(paths).mapErr((e): AppError => e))
    .andThen(() => createAndAuthorizeDevice(paths, identity, privateKey, clock).mapErr((e): AppError => e))
    .map((d) => ({
      user: identity,
      userPrivateKey: privateKey,
      deviceKey: d.deviceKey,
      devicePrivateKey: d.devicePrivateKey,
      paths,
    }));
};

// ─────────────────────── sign / verify shims ──────────────────────

/**
 * Wrap a payload in a SignedEnvelope using the resolved local device
 * key. Thin convenience over `domain/identity.signEnvelope` that
 * folds the resolved-identity state in.
 */
export const signForDevice = <T>(
  identity: ResolvedIdentity,
  payload: T,
  signedAt: string = nowIso(),
): ResultAsync<SignedEnvelope<T>, AppError> => {
  const res = signEnvelope(identity.devicePrivateKey, identity.deviceKey, payload, signedAt);
  if (res.isErr()) return errAsync<SignedEnvelope<T>, AppError>(res.error);
  return okAsync<SignedEnvelope<T>, AppError>(res.value);
};

/** Re-export so the application layer need only import from this module. */
export const verifySignedEnvelope = <T>(
  envelope: SignedEnvelope<T>,
  verifiedAt: string = nowIso(),
): ResultAsync<VerifiedEnvelope<T>, AppError> => {
  const res = verifyEnvelope(envelope, verifiedAt);
  if (res.isErr()) return errAsync<VerifiedEnvelope<T>, AppError>(res.error);
  return okAsync<VerifiedEnvelope<T>, AppError>(res.value);
};

// ─────────────────────── internals ────────────────────────────────

/** Load an existing user from disk, or return null if both files absent. */
const loadExistingUser = (
  paths: IdentityPaths,
): ResultAsync<{ user: UserIdentity; userPrivateKey: Uint8Array } | null, PeerError> =>
  loadUserPublic(paths).andThen((pub) =>
    loadUserSeed(paths).andThen((seed) => {
      if (!pub && !seed) return okAsync<{ user: UserIdentity; userPrivateKey: Uint8Array } | null, PeerError>(null);
      if (!pub || !seed) {
        return errAsync<{ user: UserIdentity; userPrivateKey: Uint8Array } | null, PeerError>(
          PeerError.identityParseError(
            paths.dir,
            'incoherent identity state: one of user.json/user.seed is missing',
          ),
        );
      }
      const derived = userIdentityFromSeed(seed, pub.created_at);
      if (derived.isErr()) {
        return errAsync<{ user: UserIdentity; userPrivateKey: Uint8Array } | null, PeerError>(
          PeerError.identityParseError(paths.userSeedPath, `seed/DID mismatch: ${derived.error.type}`),
        );
      }
      if (derived.value.identity.did !== pub.did) {
        return errAsync<{ user: UserIdentity; userPrivateKey: Uint8Array } | null, PeerError>(
          PeerError.identityParseError(paths.userPublicPath, `seed does not produce the stored DID`),
        );
      }
      return okAsync<{ user: UserIdentity; userPrivateKey: Uint8Array } | null, PeerError>({
        user: derived.value.identity,
        userPrivateKey: derived.value.privateKey,
      });
    }),
  );

/** Create a new user + persist. Private helper. */
const createAndPersistUser = (
  paths: IdentityPaths,
  clock: () => string,
): ResultAsync<{ user: UserIdentity; userPrivateKey: Uint8Array }, PeerError> => {
  const res = createUserIdentity(clock);
  if (res.isErr()) {
    return errAsync<{ user: UserIdentity; userPrivateKey: Uint8Array }, PeerError>(
      PeerError.identityGenerateError(res.error.type),
    );
  }
  const { identity, privateKey } = res.value;
  return saveUserPublic(paths, identity)
    .andThen(() => saveUserSeed(paths, privateKey))
    .map(() => ({ user: identity, userPrivateKey: privateKey }));
};

/** Create a fresh device key under the user, persist. Private helper. */
const createAndAuthorizeDevice = (
  paths: IdentityPaths,
  user: UserIdentity,
  userPrivateKey: Uint8Array,
  clock: () => string,
): ResultAsync<{ deviceKey: DeviceKey; devicePrivateKey: Uint8Array }, PeerError> => {
  const kpRes = generateKeyPair();
  if (kpRes.isErr()) {
    return errAsync<{ deviceKey: DeviceKey; devicePrivateKey: Uint8Array }, PeerError>(
      PeerError.identityGenerateError(kpRes.error.type),
    );
  }
  const { publicKey: devicePub, privateKey: devicePriv } = kpRes.value;
  const deviceId = generateDeviceId();
  const authRes = authorizeDevice(userPrivateKey, user.did, deviceId, devicePub, clock());
  if (authRes.isErr()) {
    return errAsync<{ deviceKey: DeviceKey; devicePrivateKey: Uint8Array }, PeerError>(
      PeerError.identityGenerateError(authRes.error.type),
    );
  }
  return saveDevice(paths, authRes.value, devicePriv).map(() => ({
    deviceKey: authRes.value,
    devicePrivateKey: devicePriv,
  }));
};

/** Re-export for ergonomics. */
export type { DID, SignedEnvelope, VerifiedEnvelope };
