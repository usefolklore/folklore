/**
 * Cryptographic envelope for shared graph nodes (Phase 32 identity wave
 * extension; V5 envelope shape Phase 24-03 — ROOMS-DEL-05).
 *
 * V5: the wrapped ShareableNode no longer carries a `room` field. Sharing
 * authorization is per-node via `node.private === false`; consult the
 * gating call site (share.ts / share-sync.ts) rather than the envelope.
 *
 * Each ShareableNode that flows over the libp2p share-sync protocol can be
 * wrapped in a SignedEnvelope so that receiving peers verify three things
 * offline before committing the node to graph.json:
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
 * separate commit behind AKASHIK_REQUIRE_SIGNED_NODES so the
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
  | { readonly type: 'ShareEnvelopeGithubMismatch'; readonly expected: string; readonly actual: string | undefined }
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
  githubMismatch: (expected: string, actual: string | undefined): ShareEnvelopeError => ({
    type: 'ShareEnvelopeGithubMismatch',
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
  // V5 (Phase 24-03, ROOMS-DEL-05): the `room` field is gone from ShareableNode.
  // Authorization is per-node via `private: boolean` (enforced upstream of the
  // signing call). The envelope itself no longer carries a room field.
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
  /**
   * Phase 26 — optional pinning of the claimed GitHub handle. When set,
   * the payload's `github_user` field MUST equal this value, otherwise
   * the envelope is rejected with ShareEnvelopeGithubMismatch.
   *
   * Use case: the verifier looks up the sender peer's expected handle
   * from peer-labels.json (peer-id → github mapping) and pins the
   * envelope to it. Catches a peer trying to claim a github identity
   * they're not actually entitled to (the DID's keypair signed the
   * envelope, but the *claimed* GitHub handle in the payload was tampered).
   *
   * Strict matching: missing github_user on the payload also fails
   * (mismatch where actual is undefined) so a peer can't simply omit
   * the field to bypass the check.
   */
  readonly expectedGithubUser?: string;
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
 *   3. (Optional) author DID pinning — envelope's signer_did must match.
 *   4. (Optional) github_user pinning — payload's claimed handle must
 *      match. Phase 26 binding between DID + GitHub identity.
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

  if (opts.expectedGithubUser !== undefined) {
    const claimed = (envelope.payload as { github_user?: unknown }).github_user;
    const claimedStr = typeof claimed === 'string' ? claimed : undefined;
    if (claimedStr !== opts.expectedGithubUser) {
      return err(ShareEnvelopeError.githubMismatch(opts.expectedGithubUser, claimedStr));
    }
  }
  return ok(verified.value);
};
