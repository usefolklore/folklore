/**
 * Per-match attestation — signed federated search results.
 *
 * The libp2p noise channel already authenticates the TRANSPORT: the
 * asker knows the bytes came from the peer id it dialed. What it does
 * not give is a PERSISTABLE claim — proof that peer X asserted result
 * Y at time T, verifiable offline, after the connection is gone, by a
 * third party. This module closes that gap with a detached Ed25519
 * signature over the transmitted match metadata, using the
 * responder's libp2p peer key. The asker verifies against the public
 * key embedded in the responder's peer id — zero key distribution.
 *
 * Scope note (v1): this binds the result to the PEER identity, not
 * yet to the DID + verified-GitHub identity chain (share-envelope
 * territory). The satisfaction scorer's `has_signature` consumes the
 * verdict either way; the DID binding upgrade slots in behind the
 * same wire fields.
 */

import type { Result } from 'neverthrow';
import type { IdentityError } from './errors.js';
import { signBytes, verifyBytes } from './identity.js';

/** Domain separator — never sign bare user-influenced JSON. */
const DOMAIN = 'akashik-match:v1:';

/** The exact transmitted fields the signature covers. */
export interface AttestedMatchFields {
  readonly node_id: string;
  readonly label?: string;
  readonly source_uri?: string;
  readonly fetched_at?: string;
}

/** Wire shape carried alongside a match. */
export interface MatchAttestation {
  /** 64-byte Ed25519 signature, hex. */
  readonly signature_hex: string;
  /** ISO timestamp the responder produced the signature. */
  readonly signed_at: string;
}

/**
 * Canonical signing bytes. Literal key order IS the canonical order —
 * keep alphabetical; absent optionals serialize as null so the asker
 * reconstructs identical bytes from the wire fields alone.
 */
const canonicalBytes = (f: AttestedMatchFields, signedAt: string): Uint8Array =>
  new TextEncoder().encode(
    DOMAIN +
      JSON.stringify({
        fetched_at: f.fetched_at ?? null,
        label: f.label ?? null,
        node_id: f.node_id,
        signed_at: signedAt,
        source_uri: f.source_uri ?? null,
      }),
  );

const toHex = (bytes: Uint8Array): string => {
  let s = '';
  for (const b of bytes) s += b.toString(16).padStart(2, '0');
  return s;
};

const fromHex = (hex: string): Uint8Array | null => {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

/**
 * Sign one match with the responder's 32-byte Ed25519 seed
 * (libp2p Ed25519PrivateKey.raw.slice(0, 32)).
 */
export const signMatch = (
  privateKeySeed: Uint8Array,
  fields: AttestedMatchFields,
  signedAt: string,
): Result<MatchAttestation, IdentityError> =>
  signBytes(privateKeySeed, canonicalBytes(fields, signedAt)).map((sig) => ({
    signature_hex: toHex(sig),
    signed_at: signedAt,
  }));

/**
 * Verify a match attestation against the responder's 32-byte public
 * key (from its peer id). Returns false on any malformation — a
 * garbage signature must read as "claimed but invalid", never throw.
 */
export const verifyMatch = (
  publicKey: Uint8Array,
  fields: AttestedMatchFields,
  attestation: MatchAttestation,
): boolean => {
  const sig = fromHex(attestation.signature_hex);
  if (!sig) return false;
  return verifyBytes(publicKey, canonicalBytes(fields, attestation.signed_at), sig);
};

// ─────────── node-level attestation (fetch protocol) ───────────
//
// The fetch protocol transfers BODY text, so the signature must cover
// it — a separate domain separator keeps node signatures and match
// signatures mutually unreplayable.

const NODE_DOMAIN = 'akashik-node:v1:';

export interface AttestedNodeFields extends AttestedMatchFields {
  readonly summary?: string;
}

const canonicalNodeBytes = (f: AttestedNodeFields, signedAt: string): Uint8Array =>
  new TextEncoder().encode(
    NODE_DOMAIN +
      JSON.stringify({
        fetched_at: f.fetched_at ?? null,
        label: f.label ?? null,
        node_id: f.node_id,
        signed_at: signedAt,
        source_uri: f.source_uri ?? null,
        summary: f.summary ?? null,
      }),
  );

export const signNode = (
  privateKeySeed: Uint8Array,
  fields: AttestedNodeFields,
  signedAt: string,
): Result<MatchAttestation, IdentityError> =>
  signBytes(privateKeySeed, canonicalNodeBytes(fields, signedAt)).map((sig) => ({
    signature_hex: toHex(sig),
    signed_at: signedAt,
  }));

export const verifyNode = (
  publicKey: Uint8Array,
  fields: AttestedNodeFields,
  attestation: MatchAttestation,
): boolean => {
  const sig = fromHex(attestation.signature_hex);
  if (!sig) return false;
  return verifyBytes(publicKey, canonicalNodeBytes(fields, attestation.signed_at), sig);
};
