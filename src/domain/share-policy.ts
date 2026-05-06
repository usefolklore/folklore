/**
 * Inbound share-sync policy — classifies Y.Map values written by remote
 * peers and decides whether they survive into graph.json.
 *
 * Pure: no I/O, no clock, no env. Tests inject `now` if needed.
 *
 * Three states the sender can be in:
 *
 *   - signed:    the value is a SignedShareableNode envelope (carries
 *                signer DID + signature + chain). The receiver verifies
 *                offline and gets cryptographic attribution.
 *   - unsigned:  the value is a plain ShareableNode (legacy / pre-flag
 *                peer). Soft mode accepts; strict mode rejects.
 *   - malformed: the value isn't recognisable as either shape — drop.
 *
 * The strict-vs-soft toggle is a domain-level enum so the call site
 * (share-sync.ts) just reads env once at construction and the
 * classifier stays pure.
 *
 * Round-2 architecture-review priority: this is the core of step A
 * (signed envelope wiring). Without this classifier, share-sync.ts
 * either treats every value as plain (current state) or has its own
 * ad-hoc detection, both of which fragment the trust model.
 */

import type { ShareableNode } from './sharing.js';
import type { SignedShareableNode, VerifiedShareableNode } from './share-envelope.js';
import { verifyShareableNode } from './share-envelope.js';

// ─────────────── policy mode ──────────────

export type SharePolicyMode = 'soft' | 'strict';

/**
 * Read mode from env. Default is soft (backward compatible — existing
 * peers without signing keep working). Set
 *   WELLINFORMED_REQUIRE_SIGNED_NODES=1
 * to enforce strict mode (only SignedShareableNode survives, plain
 * unsigned drops with a metric + log).
 */
export const sharePolicyModeFromEnv = (
  env: NodeJS.ProcessEnv = process.env,
): SharePolicyMode => {
  const v = env.WELLINFORMED_REQUIRE_SIGNED_NODES;
  return v === '1' || v === 'true' ? 'strict' : 'soft';
};

// ─────────────── classification ───────────

/**
 * Outcome of running an inbound Y.Map value through the policy gate.
 * The caller commits or drops based on the tag.
 */
export type ClassifiedShare =
  | {
      readonly verdict: 'signed_ok';
      readonly payload: ShareableNode;
      readonly verified: VerifiedShareableNode;
    }
  | {
      readonly verdict: 'signed_invalid';
      readonly reason: string;
    }
  | {
      readonly verdict: 'unsigned_allowed';
      readonly payload: ShareableNode;
    }
  | {
      readonly verdict: 'unsigned_rejected';
      readonly payload: ShareableNode;
      readonly reason: 'strict_mode_requires_signature';
    }
  | {
      readonly verdict: 'malformed';
      readonly reason: string;
    };

/**
 * Detect whether a value is a SignedShareableNode envelope. We can't
 * use `instanceof` (envelopes are plain objects) so we shape-check
 * the discriminating fields.
 */
const isSignedEnvelope = (v: unknown): v is SignedShareableNode => {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.envelope_version === 'number' &&
    typeof o.signer_did === 'string' &&
    typeof o.signer_device_id === 'string' &&
    typeof o.signed_at === 'string' &&
    o.signature !== undefined &&
    o.payload !== null &&
    typeof o.payload === 'object'
  );
};

/**
 * Cheap shape-check for a plain ShareableNode. Real validation happens
 * downstream in `scanNode`; this just rejects "obvious garbage" before
 * the strict-mode gate.
 */
const looksLikeShareable = (v: unknown): v is ShareableNode => {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    o.id.length > 0 &&
    typeof o.label === 'string' &&
    typeof o.room === 'string'
  );
};

/**
 * Classify one inbound Y.Map value against the active policy mode.
 * Pure — no I/O, no clock except via the verifier's optional `now`.
 *
 * Side note: the verifier already enforces the signed_at plausibility
 * window and the three Ed25519 verifies, so signed_ok is a strong
 * statement. Receivers can now answer "what did peer X say, when, and
 * who signed for it" without trusting transport or any peer's claim.
 */
export const classifyInboundShare = (
  value: unknown,
  mode: SharePolicyMode,
  verifiedAt?: string,
): ClassifiedShare => {
  if (isSignedEnvelope(value)) {
    const verified = verifyShareableNode(value, { verifiedAt });
    if (verified.isErr()) {
      const e = verified.error;
      const reason =
        e.type === 'ShareEnvelopeIdentityError'
          ? `identity_error:${e.cause.type}`
          : e.type === 'ShareEnvelopeAuthorMismatch'
          ? `author_mismatch:${e.expected}!=${e.actual}`
          : `invalid:${e.reason}`;
      return { verdict: 'signed_invalid', reason };
    }
    return {
      verdict: 'signed_ok',
      payload: verified.value.payload,
      verified: verified.value,
    };
  }

  if (looksLikeShareable(value)) {
    if (mode === 'strict') {
      return {
        verdict: 'unsigned_rejected',
        payload: value,
        reason: 'strict_mode_requires_signature',
      };
    }
    return { verdict: 'unsigned_allowed', payload: value };
  }

  return { verdict: 'malformed', reason: 'value is neither envelope nor shareable node' };
};
