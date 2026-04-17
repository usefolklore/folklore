/**
 * Identity store — persists the user-identity / device-key tuple to
 * `~/.wellinformed/identity/` (or the caller-supplied home directory).
 *
 * Layout:
 *   <home>/identity/user.json      — public bundle (DID, pubkey, created_at)
 *   <home>/identity/user.seed      — 32-byte private seed, hex-encoded, 0600
 *   <home>/identity/device.json    — device keypair + user-over-device signature, 0600
 *
 * Why split the private seed into its own file:
 *   - user.json is safe to publish / copy — no private material.
 *   - user.seed holds the long-lived root of the whole identity; sensitive.
 *   - device.json holds short-lived operational keys and is rotatable
 *     without loss.
 *
 * No classes, no throws — fallible operations return ResultAsync over
 * PeerError (reusing the PeerIdentity* variants since the identity
 * store is the next evolution of what peer-transport.ts already
 * persists). This keeps the error surface compact for the CLI layer.
 */

import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { readFile, writeFile, mkdir, chmod, rename, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { PeerError } from '../domain/errors.js';
import type {
  DID,
  DeviceKey,
  UserIdentity,
} from '../domain/identity.js';

// ─────────────────────── on-disk shapes ───────────────────────────

/** Public file — contents of user.json. Hex-encoded public key for portability. */
export interface StoredUserPublic {
  readonly version: 1;
  readonly did: DID;
  readonly public_key_hex: string;
  readonly created_at: string;
}

/** Private file — device.json. device_private_key_hex is the signing seed. */
export interface StoredDevice {
  readonly version: 1;
  readonly device_id: string;
  readonly user_did: DID;
  readonly device_public_key_hex: string;
  readonly device_private_key_hex: string;
  readonly authorized_at: string;
  readonly authorization_sig_hex: string;
}

export interface IdentityPaths {
  readonly dir: string;
  readonly userPublicPath: string;
  readonly userSeedPath: string;
  readonly devicePath: string;
}

/** Build the identity-layer file paths from a wellinformed home directory. */
export const identityPaths = (homeDir: string): IdentityPaths => {
  const dir = join(homeDir, 'identity');
  return {
    dir,
    userPublicPath: join(dir, 'user.json'),
    userSeedPath: join(dir, 'user.seed'),
    devicePath: join(dir, 'device.json'),
  };
};

// ─────────────────────── hex helpers ──────────────────────────────

const toHex = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
};

const fromHex = (s: string): Uint8Array => {
  const clean = s.startsWith('0x') ? s.slice(2) : s;
  if (clean.length % 2 !== 0) throw new Error(`odd-length hex string (${clean.length})`);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
};

// ─────────────────────── atomic write helper ──────────────────────

/**
 * Write `content` to `path` atomically via `<path>.tmp` + rename.
 * Optionally chmod 0600 after write (for private material).
 */
const atomicWrite = (
  path: string,
  content: string,
  modeOctal: number | null,
): ResultAsync<void, PeerError> =>
  ResultAsync.fromPromise(
    (async () => {
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.tmp`;
      await writeFile(tmp, content, 'utf8');
      if (modeOctal !== null) await chmod(tmp, modeOctal);
      await rename(tmp, path);
    })(),
    (e) => PeerError.identityWriteError(path, (e as Error).message),
  );

// ─────────────────────── user identity I/O ───────────────────────

/**
 * Load the public user identity from disk. Returns `null` if the file
 * doesn't exist (no identity yet). Returns an error only for I/O or
 * parse failures on an existing file.
 */
export const loadUserPublic = (paths: IdentityPaths): ResultAsync<StoredUserPublic | null, PeerError> => {
  if (!existsSync(paths.userPublicPath)) return okAsync(null);
  return ResultAsync.fromPromise(readFile(paths.userPublicPath, 'utf8'), (e) =>
    PeerError.identityReadError(paths.userPublicPath, (e as Error).message),
  ).andThen((text) => {
    try {
      const parsed = JSON.parse(text) as StoredUserPublic;
      if (parsed.version !== 1) {
        return errAsync<StoredUserPublic | null, PeerError>(
          PeerError.identityParseError(paths.userPublicPath, `unsupported version ${parsed.version}`),
        );
      }
      return okAsync<StoredUserPublic | null, PeerError>(parsed);
    } catch (e) {
      return errAsync<StoredUserPublic | null, PeerError>(
        PeerError.identityParseError(paths.userPublicPath, (e as Error).message),
      );
    }
  });
};

/**
 * Load the 32-byte user seed. Returns null if file is absent. The
 * file is plain hex text (plus trailing newline) — the identity-store
 * layer does NOT encrypt-at-rest in v1. Encryption-at-rest is a
 * v1.1 follow-up; for v1 we rely on 0600 file perms + the user's home
 * directory being their own.
 */
export const loadUserSeed = (paths: IdentityPaths): ResultAsync<Uint8Array | null, PeerError> => {
  if (!existsSync(paths.userSeedPath)) return okAsync(null);
  return ResultAsync.fromPromise(readFile(paths.userSeedPath, 'utf8'), (e) =>
    PeerError.identityReadError(paths.userSeedPath, (e as Error).message),
  ).andThen((text) => {
    const hex = text.trim();
    try {
      const bytes = fromHex(hex);
      if (bytes.length !== 32) {
        return errAsync<Uint8Array | null, PeerError>(
          PeerError.identityParseError(paths.userSeedPath, `expected 32-byte seed, got ${bytes.length}`),
        );
      }
      return okAsync<Uint8Array | null, PeerError>(bytes);
    } catch (e) {
      return errAsync<Uint8Array | null, PeerError>(
        PeerError.identityParseError(paths.userSeedPath, (e as Error).message),
      );
    }
  });
};

export const saveUserPublic = (
  paths: IdentityPaths,
  identity: UserIdentity,
): ResultAsync<void, PeerError> => {
  const record: StoredUserPublic = {
    version: 1,
    did: identity.did,
    public_key_hex: toHex(identity.publicKey),
    created_at: identity.created_at,
  };
  return atomicWrite(paths.userPublicPath, `${JSON.stringify(record, null, 2)}\n`, 0o644);
};

export const saveUserSeed = (
  paths: IdentityPaths,
  seed: Uint8Array,
): ResultAsync<void, PeerError> => {
  if (seed.length !== 32) {
    return errAsync(PeerError.identityWriteError(paths.userSeedPath, `expected 32-byte seed, got ${seed.length}`));
  }
  return atomicWrite(paths.userSeedPath, `${toHex(seed)}\n`, 0o600);
};

// ─────────────────────── device key I/O ───────────────────────────

export const loadDevice = (paths: IdentityPaths): ResultAsync<{ deviceKey: DeviceKey; devicePrivateKey: Uint8Array } | null, PeerError> => {
  if (!existsSync(paths.devicePath)) return okAsync(null);
  return ResultAsync.fromPromise(readFile(paths.devicePath, 'utf8'), (e) =>
    PeerError.identityReadError(paths.devicePath, (e as Error).message),
  ).andThen((text) => {
    try {
      const parsed = JSON.parse(text) as StoredDevice;
      if (parsed.version !== 1) {
        return errAsync<{ deviceKey: DeviceKey; devicePrivateKey: Uint8Array } | null, PeerError>(
          PeerError.identityParseError(paths.devicePath, `unsupported version ${parsed.version}`),
        );
      }
      const devicePublic = fromHex(parsed.device_public_key_hex);
      const devicePrivate = fromHex(parsed.device_private_key_hex);
      const authSig = fromHex(parsed.authorization_sig_hex);
      const deviceKey: DeviceKey = {
        device_id: parsed.device_id,
        user_did: parsed.user_did,
        device_public_key: devicePublic,
        authorized_at: parsed.authorized_at,
        authorization_sig: authSig,
      };
      return okAsync<{ deviceKey: DeviceKey; devicePrivateKey: Uint8Array } | null, PeerError>({
        deviceKey,
        devicePrivateKey: devicePrivate,
      });
    } catch (e) {
      return errAsync<{ deviceKey: DeviceKey; devicePrivateKey: Uint8Array } | null, PeerError>(
        PeerError.identityParseError(paths.devicePath, (e as Error).message),
      );
    }
  });
};

export const saveDevice = (
  paths: IdentityPaths,
  deviceKey: DeviceKey,
  devicePrivateKey: Uint8Array,
): ResultAsync<void, PeerError> => {
  const record: StoredDevice = {
    version: 1,
    device_id: deviceKey.device_id,
    user_did: deviceKey.user_did,
    device_public_key_hex: toHex(deviceKey.device_public_key),
    device_private_key_hex: toHex(devicePrivateKey),
    authorized_at: deviceKey.authorized_at,
    authorization_sig_hex: toHex(deviceKey.authorization_sig),
  };
  return atomicWrite(paths.devicePath, `${JSON.stringify(record, null, 2)}\n`, 0o600);
};

/**
 * Remove the device key file (used by rotate + unit tests). Safe to
 * call when the file is absent.
 */
export const deleteDevice = (paths: IdentityPaths): ResultAsync<void, PeerError> => {
  if (!existsSync(paths.devicePath)) return okAsync(undefined);
  return ResultAsync.fromPromise(unlink(paths.devicePath), (e) =>
    PeerError.identityWriteError(paths.devicePath, (e as Error).message),
  );
};
