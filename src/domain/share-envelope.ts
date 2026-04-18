/**
 * Cryptographic envelope for shared graph nodes (Phase 32 identity wave
 * extension). Each ShareableNode that flows over the libp2p share-sync
 * protocol can be wrapped in a SignedEnvelope so that receiving peers
 * verify three things offline before committing the node to graph.json:
 *
 *   1. The payload was signed by the claimed device key.
 *   2. The device key was authorized by the claimed user DID.
 *   3. The signed_at timestamp is plausible (not in the far future,
 *      not absurdly old).
 *
 * This makes graph contents tamper-evident across the wire — a man-in-
 * the-middle on the libp2p stream can't forge nodes, and a malicious
 * peer can't impersonate another peer's authored content.
 *
 * The envelope wrapper is built on top of the existing
 * src/domain/identity.ts primitives (signEnvelope/verifyEnvelope) —
 * this module is a thin domain-specific wrapper that defines the
 * payload type and adds payload-shape validation on top.
 *
 * NOT YET WIRED into src/infrastructure/share-sync.ts — that's a
 * separate commit behind WELLINFORMED_REQUIRE_SIGNED_NODES so the
 * existing live shares stay backward-compatible during rollout.
 *
 * Pure: no I/O, no classes, all sync.
 */

import { Result, err, ok } from 'neverthrow';
import {
  signEnvelope,
  verifyEnvelope,
  type SignedEnvelope,
  type VerifiedEnvelope,
  type DID,
  type DeviceKey,
} from './identity.js';
import type { IdentityError } from './errors.js';
import type { ShareableNode } from './sharing.js';

// ─────────────── public types ───────────────

/** A ShareableNode wrapped in the full provenance chain. */
export type SignedShareableNode = SignedEnvelope<ShareableNode>;

/** Verified envelope payload — carries verified author DID + timestamps. */
export type VerifiedShareableNode = VerifiedEnvelope<ShareableNode>;

export type ShareEnvelopeError =
  | { readonly type: 'ShareEnvelopeInvalidPayload'; readonly reason: string }
  | { readonly type: 'ShareEnvelopeAuthorMismatch'; readonly expected: DID; readonly actual: DID }
  | { readonly type: 'ShareEnvelopeIdentityError'; readonly cause: IdentityError };

export const ShareEnvelopeError = {
  invalid: (reason: string): ShareEnvelopeError => ({
    type: 'ShareEnvelopeInvalidPayload',
    reason,
  }),
  authorMismatch: (expected: DID, actual: DID): ShareEnvelopeError => ({
    type: 'ShareEnvelopeAuthorMismatch',
    expected,
    actual,
  }),
  fromIdentity: (cause: IdentityError): ShareEnvelopeError => ({
    type: 'ShareEnvelopeIdentityError',
    cause,
  }),
} as const;

// ─────────────── payload validation ───────────────

/**
 * Reject obviously-malformed ShareableNode payloads BEFORE signing.
 * Cheaper than letting downstream verification fail — and the rejection
 * reason is more useful for the operator.
 */
const validateShareablePayload = (n: ShareableNode): Result<void, ShareEnvelopeError> => {
  if (!n || typeof n !== 'object') {
    return err(ShareEnvelopeError.invalid('payload is not an object'));
  }
  if (typeof n.id !== 'string' || n.id.length === 0) {
    return err(ShareEnvelopeError.invalid('payload.id missing or empty'));
  }
  if (typeof n.label !== 'string' || n.label.length === 0) {
    return err(ShareEnvelopeError.invalid('payload.label missing or empty'));
  }
  if (typeof n.room !== 'string' || n.room.length === 0) {
    return err(ShareEnvelopeError.invalid('payload.room missing or empty'));
  }
  // Optional fields — only validate if present.
  if (n.embedding_id !== undefined && typeof n.embedding_id !== 'string') {
    return err(ShareEnvelopeError.invalid('payload.embedding_id must be string when present'));
  }
  if (n.source_uri !== undefined && typeof n.source_uri !== 'string') {
    return err(ShareEnvelopeError.invalid('payload.source_uri must be string when present'));
  }
  if (n.fetched_at !== undefined && typeof n.fetched_at !== 'string') {
    return err(ShareEnvelopeError.invalid('payload.fetched_at must be string when present'));
  }
  return ok(undefined);
};

// ─────────────── sign ───────────────

export interface SignShareableInput {
  readonly devicePrivateKey: Uint8Array;
  readonly deviceKey: DeviceKey;
  readonly node: ShareableNode;
  readonly signedAt?: string;
}

/**
 * Sign a ShareableNode with the local device key, producing a
 * fully-self-contained envelope that any peer can verify offline.
 */
export const signShareableNode = (
  input: SignShareableInput,
): Result<SignedShareableNode, ShareEnvelopeError> => {
  const validation = validateShareablePayload(input.node);
  if (validation.isErr()) return err(validation.error);

  const signedAt = input.signedAt ?? new Date().toISOString();
  const res = signEnvelope(input.devicePrivateKey, input.deviceKey, input.node, signedAt);
  if (res.isErr()) return err(ShareEnvelopeError.fromIdentity(res.error));
  return ok(res.value);
};

// ─────────────── verify ───────────────

export interface VerifyShareableOptions {
  /** ISO-8601 — what's "now" from the verifier's perspective. */
  readonly verifiedAt?: string;
  /** Optional pinning: reject envelope if signer DID ≠ this. */
  readonly expectedAuthorDid?: DID;
}

/**
 * Verify a SignedShareableNode end-to-end.
 *
 * Steps:
 *   1. Payload-shape sanity (cheap reject of malformed packages)
 *   2. Three Ed25519 verifies via verifyEnvelope():
 *      a) device signature over payload+metadata
 *      b) device authorization signature by user DID
 *      c) signed_at within plausible bounds
 *   3. (Optional) author pinning — if expectedAuthorDid is set, the
 *      envelope's signer_did must match exactly.
 */
export const verifyShareableNode = (
  envelope: SignedShareableNode,
  opts: VerifyShareableOptions = {},
): Result<VerifiedShareableNode, ShareEnvelopeError> => {
  const validation = validateShareablePayload(envelope.payload);
  if (validation.isErr()) return err(validation.error);

  const verified = verifyEnvelope(envelope, opts.verifiedAt);
  if (verified.isErr()) return err(ShareEnvelopeError.fromIdentity(verified.error));

  if (opts.expectedAuthorDid && verified.value.verified_user_did !== opts.expectedAuthorDid) {
    return err(ShareEnvelopeError.authorMismatch(
      opts.expectedAuthorDid,
      verified.value.verified_user_did,
    ));
  }
  return ok(verified.value);
};
