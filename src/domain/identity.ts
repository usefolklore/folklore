/**
 * User-owned decentralized identity (DID wave — Phase 32).
 *
 * This module owns the pure domain layer for wellinformed's three-tier
 * identity hierarchy:
 *
 *   1. User DID (long-lived)
 *        — a W3C `did:key` over an Ed25519 keypair, user-owned, survives
 *          device changes. Encoded per the W3C did:key spec as
 *          `did:key:z<base58btc(multicodec || publicKey)>`.
 *   2. Device key (operational)
 *        — an Ed25519 keypair authorized by the user DID via a signed
 *          authorization tuple. Revocable without losing user identity.
 *   3. Signed envelope (memory-layer wrapper)
 *        — any payload T wrapped with a device-key signature and the
 *          device authorization chain, so receivers can verify
 *          {payload, device, user} in one pass.
 *
 * Design goals:
 *   - Pure: no I/O, no classes, no `throw`. Fallible ops return
 *     neverthrow Result / ResultAsync.
 *   - Offline-verifiable: verification needs only what's inside the
 *     envelope — no registry, no DID resolver, no network.
 *   - Cross-model-portable: payloads are opaque to this layer. Memory
 *     entries, search requests, room invites all travel through the
 *     same envelope shape.
 *   - Node-only crypto (no new deps): Ed25519 via built-in `node:crypto`
 *     (Node 20+ required, already in package.json engines).
 *
 * What lives elsewhere:
 *   - Key storage + seed-phrase recovery: src/infrastructure/identity-store.ts
 *   - Lifecycle (rotate/export/import): src/application/identity-lifecycle.ts
 *   - CLI wiring: src/cli/commands/identity.ts
 */

import { randomBytes, sign as cryptoSign, verify as cryptoVerify, createPrivateKey, createPublicKey, generateKeyPairSync, type KeyObject } from 'node:crypto';
import { Result, err, ok } from 'neverthrow';
import { IdentityError } from './errors.js';

// ─────────────────────── W3C did:key multicodec constants ──────────

/**
 * Multicodec varint prefix for Ed25519 public keys: 0xed01.
 * This is the two-byte sequence that W3C did:key uses to disambiguate
 * key types inside the base58btc-encoded tail of `did:key:z...`.
 * Reference: https://w3c-ccg.github.io/did-method-key/#ed25519-x25519
 */
const ED25519_MULTICODEC: Readonly<Uint8Array> = new Uint8Array([0xed, 0x01]);

/** Raw Ed25519 public keys are exactly 32 bytes. */
export const ED25519_PUBLIC_KEY_LENGTH = 32;

/** Raw Ed25519 private key seeds are exactly 32 bytes. */
export const ED25519_PRIVATE_KEY_LENGTH = 32;

/** Ed25519 signatures are exactly 64 bytes. */
export const ED25519_SIGNATURE_LENGTH = 64;

// ─────────────────────── branded types ────────────────────────────

/** A W3C did:key identifier (Ed25519). Opaque — callers must use encodeDIDKey. */
export type DID = string & { readonly __brand: 'DID' };

/**
 * A raw Ed25519 keypair. The private key is a 32-byte seed (RFC 8032
 * "secret key"), NOT the 64-byte "expanded private key" some libraries
 * emit. Node's `crypto.createPrivateKey` accepts either via JWK; we
 * standardize on the 32-byte seed because it's what BIP39-style
 * recovery phrases derive and what most Ed25519 specs reference.
 */
export interface KeyPair {
  readonly publicKey: Uint8Array;  // 32 bytes
  readonly privateKey: Uint8Array; // 32-byte seed
}

/**
 * The public portion of a user identity. Safe to share, publish, embed
 * in memory entries — contains no private material.
 */
export interface UserIdentity {
  readonly did: DID;
  readonly publicKey: Uint8Array; // 32 bytes — same bytes that encodeDIDKey produced the DID from
  readonly created_at: string;    // ISO-8601
}

/**
 * An Ed25519 device key authorized by a user DID.
 *
 * The authorization is a signature by the user's Ed25519 private key
 * over the canonical tuple (device_id, device_public_key, authorized_at),
 * stored as `authorization_sig`. Verifying an envelope re-computes this
 * message and verifies the signature against the user DID's public key
 * — that proves the user authorized this specific device.
 */
export interface DeviceKey {
  readonly device_id: string;
  readonly user_did: DID;
  readonly device_public_key: Uint8Array; // 32 bytes
  readonly authorized_at: string;         // ISO-8601
  readonly authorization_sig: Uint8Array; // 64 bytes, signed by user private key
}

/**
 * A payload of type T wrapped in the full provenance chain:
 *   device signature over payload → device authorization → user DID.
 *
 * Any receiver can verify the envelope offline: they need only the
 * envelope itself. The user DID is self-describing (contains the pub
 * key). The device pub key is embedded. The user-over-device
 * authorization is embedded. The device-over-payload signature is
 * embedded. Three Ed25519 verify() calls and you know whether the
 * envelope is authentic.
 */
export interface SignedEnvelope<T> {
  readonly payload: T;
  readonly signer_did: DID;
  readonly signer_device_id: string;
  readonly device_public_key: Uint8Array;     // 32 bytes, repeated for self-containment
  readonly device_authorization: {
    readonly authorized_at: string;
    readonly authorization_sig: Uint8Array;   // 64 bytes, user-signed
  };
  readonly signed_at: string;                 // ISO-8601
  readonly signature: Uint8Array;             // 64 bytes, device-signed over canonical payload+metadata
  readonly envelope_version: 1;
}

/** A successfully-verified envelope — carries verified identity metadata. */
export interface VerifiedEnvelope<T> {
  readonly payload: T;
  readonly verified_user_did: DID;
  readonly verified_device_id: string;
  readonly verified_at: string;
  readonly signed_at: string;
}

// ─────────────────────── base58btc codec ──────────────────────────

/**
 * Base58btc alphabet per the Bitcoin spec (Satoshi ordering). Same
 * alphabet IPFS / W3C did:key / libp2p use for the multibase `z` code.
 */
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const B58_INDEX: Readonly<Record<string, number>> = (() => {
  const idx: Record<string, number> = {};
  for (let i = 0; i < B58_ALPHABET.length; i++) idx[B58_ALPHABET[i]] = i;
  return idx;
})();

/** Encode arbitrary bytes as base58btc. Leading-zero-preserving. */
const base58btcEncode = (bytes: Uint8Array): string => {
  // Count leading zero bytes — they map to leading '1' chars (B58_ALPHABET[0] === '1').
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;

  // Big-endian base-256 → base-58 conversion.
  const input = Array.from(bytes.slice(zeros));
  const out: number[] = [];
  while (input.length > 0) {
    let carry = 0;
    for (let i = 0; i < input.length; i++) {
      const v = carry * 256 + input[i];
      input[i] = Math.floor(v / 58);
      carry = v % 58;
    }
    // Trim leading zeros from the reduced input
    while (input.length > 0 && input[0] === 0) input.shift();
    out.push(carry);
  }

  out.reverse();
  let s = '1'.repeat(zeros);
  for (const d of out) s += B58_ALPHABET[d];
  return s;
};

/** Decode a base58btc string back to bytes. Leading-zero-preserving. */
const base58btcDecode = (s: string): Result<Uint8Array, IdentityError> => {
  if (s.length === 0) return ok(new Uint8Array(0));

  let zeros = 0;
  while (zeros < s.length && s[zeros] === '1') zeros++;

  const input: number[] = [];
  for (let i = zeros; i < s.length; i++) {
    const c = s[i];
    const v = B58_INDEX[c];
    if (v === undefined) {
      return err(IdentityError.invalidDID(s, `bad base58 character '${c}' at index ${i}`));
    }
    input.push(v);
  }

  // Big-endian base-58 → base-256 conversion.
  const out: number[] = [];
  while (input.length > 0) {
    let carry = 0;
    for (let i = 0; i < input.length; i++) {
      const v = carry * 58 + input[i];
      input[i] = Math.floor(v / 256);
      carry = v % 256;
    }
    while (input.length > 0 && input[0] === 0) input.shift();
    out.push(carry);
  }

  out.reverse();
  const result = new Uint8Array(zeros + out.length);
  for (let i = 0; i < out.length; i++) result[zeros + i] = out[i];
  return ok(result);
};

// ─────────────────────── did:key encode/decode ─────────────────────

/**
 * Encode a raw 32-byte Ed25519 public key as a W3C did:key identifier.
 * Format: `did:key:z<base58btc(0xed 0x01 || publicKey)>`.
 *
 * Pure function — deterministic; the same public key always produces
 * the same DID.
 */
export const encodeDIDKey = (publicKey: Uint8Array): Result<DID, IdentityError> => {
  if (publicKey.length !== ED25519_PUBLIC_KEY_LENGTH) {
    return err(IdentityError.invalidDID('(raw)', `expected ${ED25519_PUBLIC_KEY_LENGTH}-byte public key, got ${publicKey.length}`));
  }
  const prefixed = new Uint8Array(ED25519_MULTICODEC.length + publicKey.length);
  prefixed.set(ED25519_MULTICODEC, 0);
  prefixed.set(publicKey, ED25519_MULTICODEC.length);
  return ok((`did:key:z${base58btcEncode(prefixed)}`) as DID);
};

/**
 * Decode a W3C did:key identifier back to its raw Ed25519 public key.
 * Validates the `did:key:z` prefix, the base58btc payload, and the
 * Ed25519 multicodec marker. Returns IdentityInvalidDIDError for any
 * structural issue — no partial-accept semantics.
 */
export const decodeDIDKey = (did: string): Result<Uint8Array, IdentityError> => {
  const PREFIX = 'did:key:z';
  if (!did.startsWith(PREFIX)) {
    return err(IdentityError.invalidDID(did, `missing '${PREFIX}' prefix`));
  }
  const tail = did.slice(PREFIX.length);
  const decodeRes = base58btcDecode(tail);
  if (decodeRes.isErr()) return err(decodeRes.error);

  const bytes = decodeRes.value;
  if (bytes.length !== ED25519_MULTICODEC.length + ED25519_PUBLIC_KEY_LENGTH) {
    return err(IdentityError.invalidDID(did, `payload length ${bytes.length} != ${ED25519_MULTICODEC.length + ED25519_PUBLIC_KEY_LENGTH}`));
  }
  if (bytes[0] !== ED25519_MULTICODEC[0] || bytes[1] !== ED25519_MULTICODEC[1]) {
    return err(IdentityError.invalidDID(did, `wrong multicodec: 0x${bytes[0].toString(16)}${bytes[1].toString(16)} != 0xed01 (Ed25519)`));
  }
  return ok(bytes.slice(ED25519_MULTICODEC.length));
};

// ─────────────────────── Ed25519 primitives (via node:crypto) ──────

/**
 * Generate a fresh Ed25519 keypair. Uses the system CSPRNG via
 * `node:crypto.generateKeyPairSync`.
 *
 * Returns 32-byte raw keys (not DER / PEM) so downstream consumers
 * (did:key, storage serialization, Nostr-style interop) don't need a
 * crypto library to decode them.
 */
export const generateKeyPair = (): Result<KeyPair, IdentityError> => {
  try {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    return ok({
      publicKey: keyObjectToRawPublic(publicKey),
      privateKey: keyObjectToRawPrivate(privateKey),
    });
  } catch (e) {
    return err(IdentityError.keyGeneration((e as Error).message));
  }
};

/**
 * Derive an Ed25519 keypair from a 32-byte seed. Deterministic — the
 * same seed always produces the same keypair.
 *
 * Useful for tests (seed `randomBytes(32)` once, pass to both sides)
 * and for later BIP39 recovery (seed = HKDF output of the mnemonic).
 */
/**
 * Ed25519 PKCS8 v1 DER prefix. Per RFC 8410 §10.3:
 *   SEQUENCE (46 bytes) {
 *     INTEGER 0
 *     SEQUENCE { OID 1.3.101.112 (Ed25519) }
 *     OCTET STRING { OCTET STRING { 32-byte seed } }
 *   }
 * Concretely: 16 fixed header bytes followed by the 32-byte private seed.
 *
 * We use this instead of a JWK import because Node's crypto JWK path for
 * Ed25519 strictly requires *both* `x` and `d` to be present — and `x`
 * (the public component) is not known until after we derive it from the
 * seed, which is the very thing we're trying to do. PKCS8 DER lets us
 * import the private key from the seed alone, then derive the public
 * key via createPublicKey().
 */
const ED25519_PKCS8_PREFIX: Readonly<Uint8Array> = new Uint8Array([
  0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06,
  0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20,
]);

/**
 * Ed25519 SPKI (public key info) DER prefix. Per RFC 8410 §4:
 *   SEQUENCE { SEQUENCE { OID 1.3.101.112 }, BIT STRING { 32-byte pub } }
 * 12 fixed header bytes followed by the 32-byte public key.
 */
const ED25519_SPKI_PREFIX: Readonly<Uint8Array> = new Uint8Array([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65,
  0x70, 0x03, 0x21, 0x00,
]);

const seedToPkcs8Der = (seed: Uint8Array): Buffer => {
  const out = Buffer.alloc(ED25519_PKCS8_PREFIX.length + seed.length);
  out.set(ED25519_PKCS8_PREFIX, 0);
  out.set(seed, ED25519_PKCS8_PREFIX.length);
  return out;
};

const pubToSpkiDer = (publicKey: Uint8Array): Buffer => {
  const out = Buffer.alloc(ED25519_SPKI_PREFIX.length + publicKey.length);
  out.set(ED25519_SPKI_PREFIX, 0);
  out.set(publicKey, ED25519_SPKI_PREFIX.length);
  return out;
};

export const keyPairFromSeed = (seed: Uint8Array): Result<KeyPair, IdentityError> => {
  if (seed.length !== ED25519_PRIVATE_KEY_LENGTH) {
    return err(IdentityError.keyGeneration(`seed must be ${ED25519_PRIVATE_KEY_LENGTH} bytes, got ${seed.length}`));
  }
  try {
    const privateKey = createPrivateKey({ key: seedToPkcs8Der(seed), format: 'der', type: 'pkcs8' });
    const publicKey = createPublicKey(privateKey);
    return ok({
      publicKey: keyObjectToRawPublic(publicKey),
      privateKey: new Uint8Array(seed),
    });
  } catch (e) {
    return err(IdentityError.keyGeneration((e as Error).message));
  }
};

/** Sign a message with a 32-byte Ed25519 seed. Returns 64-byte signature. */
export const signBytes = (privateKeySeed: Uint8Array, message: Uint8Array): Result<Uint8Array, IdentityError> => {
  if (privateKeySeed.length !== ED25519_PRIVATE_KEY_LENGTH) {
    return err(IdentityError.signature(`private key must be ${ED25519_PRIVATE_KEY_LENGTH} bytes, got ${privateKeySeed.length}`));
  }
  try {
    const key = createPrivateKey({ key: seedToPkcs8Der(privateKeySeed), format: 'der', type: 'pkcs8' });
    // Ed25519 uses the built-in hash; algorithm arg must be null.
    const sig = cryptoSign(null, Buffer.from(message), key);
    return ok(new Uint8Array(sig));
  } catch (e) {
    return err(IdentityError.signature((e as Error).message));
  }
};

/** Verify an Ed25519 signature against a 32-byte public key. */
export const verifyBytes = (publicKey: Uint8Array, message: Uint8Array, signature: Uint8Array): boolean => {
  if (publicKey.length !== ED25519_PUBLIC_KEY_LENGTH) return false;
  if (signature.length !== ED25519_SIGNATURE_LENGTH) return false;
  try {
    const key = createPublicKey({ key: pubToSpkiDer(publicKey), format: 'der', type: 'spki' });
    return cryptoVerify(null, Buffer.from(message), key, Buffer.from(signature));
  } catch {
    return false;
  }
};

// ─────────────────────── user + device + envelope ops ──────────────

/**
 * Create a fresh user identity. Returns the public UserIdentity (safe
 * to share) AND the private seed (caller must store encrypted-at-rest
 * in the identity-store layer, never logged, never transmitted).
 */
export const createUserIdentity = (clock: () => string = () => new Date().toISOString()): Result<{ identity: UserIdentity; privateKey: Uint8Array }, IdentityError> =>
  generateKeyPair().andThen((kp) =>
    encodeDIDKey(kp.publicKey).map((did) => ({
      identity: { did, publicKey: kp.publicKey, created_at: clock() },
      privateKey: kp.privateKey,
    })),
  );

/** Restore a user identity from a stored private seed. Pure. */
export const userIdentityFromSeed = (seed: Uint8Array, created_at: string): Result<{ identity: UserIdentity; privateKey: Uint8Array }, IdentityError> =>
  keyPairFromSeed(seed).andThen((kp) =>
    encodeDIDKey(kp.publicKey).map((did) => ({
      identity: { did, publicKey: kp.publicKey, created_at },
      privateKey: kp.privateKey,
    })),
  );

/**
 * Authorize a device key under a user DID.
 *
 * The authorization message is the canonical concatenation of the
 * device ID, the device public key (hex), and the authorized_at ISO
 * timestamp — this is what verifiers will recompute and check against
 * the signature. The message format is intentionally simple (no JSON
 * canonicalization) so downstream ports in other languages are trivial.
 */
export const authorizeDevice = (
  userPrivateKey: Uint8Array,
  userDID: DID,
  deviceId: string,
  devicePublicKey: Uint8Array,
  authorizedAt: string,
): Result<DeviceKey, IdentityError> => {
  const message = buildAuthorizationMessage(deviceId, devicePublicKey, authorizedAt);
  return signBytes(userPrivateKey, message).map((sig) => ({
    device_id: deviceId,
    user_did: userDID,
    device_public_key: devicePublicKey,
    authorized_at: authorizedAt,
    authorization_sig: sig,
  }));
};

/**
 * Sign a payload under a device key, embedding the device authorization
 * chain so receivers can verify offline.
 *
 * The signed message is the canonical JSON of the payload + signed_at
 * + device_id, hashed implicitly by Ed25519. Canonical JSON here means
 * keys sorted lexicographically at every level — identical semantics
 * to JCS (RFC 8785) for the JSON subset we emit (no bigints, no Maps,
 * no cyclic refs).
 */
export const signEnvelope = <T>(
  devicePrivateKey: Uint8Array,
  deviceKey: DeviceKey,
  payload: T,
  signedAt: string,
): Result<SignedEnvelope<T>, IdentityError> =>
  canonicalSigningMessage(payload, deviceKey.device_id, signedAt).andThen((message) =>
    signBytes(devicePrivateKey, message).map((sig) => ({
      payload,
      signer_did: deviceKey.user_did,
      signer_device_id: deviceKey.device_id,
      device_public_key: deviceKey.device_public_key,
      device_authorization: {
        authorized_at: deviceKey.authorized_at,
        authorization_sig: deviceKey.authorization_sig,
      },
      signed_at: signedAt,
      signature: sig,
      envelope_version: 1 as const,
    })),
  );

/**
 * Verify an envelope end-to-end:
 *   1. Decode the user DID → user public key.
 *   2. Verify the device authorization signature under user public key.
 *   3. Verify the payload signature under the device public key.
 *
 * Returns a VerifiedEnvelope on success. No mutation of the input.
 */
export const verifyEnvelope = <T>(
  envelope: SignedEnvelope<T>,
  verifiedAt: string = new Date().toISOString(),
): Result<VerifiedEnvelope<T>, IdentityError> => {
  if (envelope.envelope_version !== 1) {
    return err(IdentityError.badSignature(`unknown envelope version ${envelope.envelope_version}`));
  }

  // Step 1: user DID → public key
  const userPubRes = decodeDIDKey(envelope.signer_did);
  if (userPubRes.isErr()) return err(userPubRes.error);
  const userPub = userPubRes.value;

  // Step 2: verify the device authorization
  const authMessage = buildAuthorizationMessage(
    envelope.signer_device_id,
    envelope.device_public_key,
    envelope.device_authorization.authorized_at,
  );
  if (!verifyBytes(userPub, authMessage, envelope.device_authorization.authorization_sig)) {
    return err(IdentityError.deviceAuthorization('user signature over (device_id, device_pub, authorized_at) did not verify'));
  }

  // Step 3: verify the payload signature
  const payloadMsgRes = canonicalSigningMessage(envelope.payload, envelope.signer_device_id, envelope.signed_at);
  if (payloadMsgRes.isErr()) return err(payloadMsgRes.error);
  if (!verifyBytes(envelope.device_public_key, payloadMsgRes.value, envelope.signature)) {
    return err(IdentityError.badSignature('device signature over payload did not verify'));
  }

  return ok({
    payload: envelope.payload,
    verified_user_did: envelope.signer_did,
    verified_device_id: envelope.signer_device_id,
    verified_at: verifiedAt,
    signed_at: envelope.signed_at,
  });
};

// ─────────────────────── canonical message builders ───────────────

/**
 * Build the authorization message bytes. Fixed format:
 *   `wellinformed-auth:v1:{device_id}:{hex(device_pub_key)}:{authorized_at}`
 *
 * The leading domain-separation tag (`wellinformed-auth:v1:`) prevents
 * signature confusion attacks where a signature over an authorization
 * message could be replayed as a signature over a payload.
 */
const buildAuthorizationMessage = (
  deviceId: string,
  devicePublicKey: Uint8Array,
  authorizedAt: string,
): Uint8Array => {
  const hex = toHex(devicePublicKey);
  const s = `wellinformed-auth:v1:${deviceId}:${hex}:${authorizedAt}`;
  return new TextEncoder().encode(s);
};

/**
 * Build the payload-signing message bytes. Fixed format:
 *   `wellinformed-sig:v1:{device_id}:{signed_at}:{canonical_json(payload)}`
 *
 * Same domain separation; different tag from auth messages.
 */
const canonicalSigningMessage = <T>(
  payload: T,
  deviceId: string,
  signedAt: string,
): Result<Uint8Array, IdentityError> =>
  canonicalJSON(payload).map((json) => {
    const s = `wellinformed-sig:v1:${deviceId}:${signedAt}:${json}`;
    return new TextEncoder().encode(s);
  });

// ─────────────────────── canonical JSON ───────────────────────────

/**
 * Deterministic JSON encoder.
 *
 * Rules:
 *   - Object keys sorted lexicographically at every level.
 *   - Arrays preserve insertion order (position is semantic).
 *   - Primitives: string, number, boolean, null.
 *   - Rejects: bigint, function, undefined, Map, Set, Date, cyclic refs.
 *     These are either ambiguous (Map insertion order, Date serializer
 *     choice) or non-JSON. Callers must convert upstream.
 *
 * This gives byte-identical output for equivalent objects across
 * different runtimes — required for cross-peer signature verification.
 */
const canonicalJSON = (value: unknown, seen: WeakSet<object> = new WeakSet()): Result<string, IdentityError> => {
  if (value === null) return ok('null');
  const t = typeof value;
  if (t === 'string') return ok(JSON.stringify(value));
  if (t === 'boolean') return ok(value ? 'true' : 'false');
  if (t === 'number') {
    if (!Number.isFinite(value as number)) {
      return err(IdentityError.canonicalization(`non-finite number: ${value}`));
    }
    return ok(JSON.stringify(value));
  }
  if (t === 'bigint') {
    return err(IdentityError.canonicalization('bigint not supported'));
  }
  if (t === 'undefined' || t === 'function' || t === 'symbol') {
    return err(IdentityError.canonicalization(`${t} not supported`));
  }
  if (value instanceof Uint8Array) {
    // Treat bytes as hex — unambiguous, short, same on every runtime.
    return ok(JSON.stringify(`0x${toHex(value)}`));
  }
  if (t === 'object') {
    if (seen.has(value as object)) {
      return err(IdentityError.canonicalization('cyclic reference'));
    }
    seen.add(value as object);
    if (Array.isArray(value)) {
      const parts: string[] = [];
      for (const item of value) {
        const r = canonicalJSON(item, seen);
        if (r.isErr()) return err(r.error);
        parts.push(r.value);
      }
      return ok(`[${parts.join(',')}]`);
    }
    // Plain object — sort keys.
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const k of keys) {
      const r = canonicalJSON(obj[k], seen);
      if (r.isErr()) return err(r.error);
      parts.push(`${JSON.stringify(k)}:${r.value}`);
    }
    return ok(`{${parts.join(',')}}`);
  }
  return err(IdentityError.canonicalization(`unknown type: ${t}`));
};

// ─────────────────────── byte + base64url helpers ──────────────────

const keyObjectToRawPublic = (key: KeyObject): Uint8Array => {
  // SPKI DER = 12-byte header + 32-byte Ed25519 public key.
  const spki = key.export({ format: 'der', type: 'spki' });
  if (spki.length !== ED25519_SPKI_PREFIX.length + ED25519_PUBLIC_KEY_LENGTH) {
    throw new Error(`unexpected Ed25519 SPKI length ${spki.length}`);
  }
  return new Uint8Array(spki.subarray(ED25519_SPKI_PREFIX.length));
};

const keyObjectToRawPrivate = (key: KeyObject): Uint8Array => {
  // PKCS8 DER = 16-byte header + 32-byte Ed25519 seed.
  const pkcs8 = key.export({ format: 'der', type: 'pkcs8' });
  if (pkcs8.length !== ED25519_PKCS8_PREFIX.length + ED25519_PRIVATE_KEY_LENGTH) {
    throw new Error(`unexpected Ed25519 PKCS8 length ${pkcs8.length}`);
  }
  return new Uint8Array(pkcs8.subarray(ED25519_PKCS8_PREFIX.length));
};

const toHex = (bytes: Uint8Array): string => {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
};

/** Re-exported for the identity-store layer's file header magic. */
export const __INTERNAL__ = {
  base58btcEncode,
  base58btcDecode,
  buildAuthorizationMessage,
  canonicalJSON,
  toHex,
};

// Satisfy the linter on unused identifiers we keep for symmetry.
void randomBytes;
