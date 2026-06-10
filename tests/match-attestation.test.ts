/**
 * Per-match attestation (domain/match-attestation.ts):
 *   - sign/verify roundtrip over transmitted metadata
 *   - tampering any covered field breaks verification
 *   - wrong key, malformed hex, and absent-optional handling
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import { keyPairFromSeed } from '../src/domain/identity.ts';
import {
  signMatch,
  signNode,
  verifyMatch,
  verifyNode,
  type AttestedMatchFields,
  type AttestedNodeFields,
} from '../src/domain/match-attestation.ts';

const seed = new Uint8Array(randomBytes(32));
const kpRes = keyPairFromSeed(seed);
if (kpRes.isErr()) throw new Error('keypair generation failed');
const kp = kpRes.value;

const FIELDS: AttestedMatchFields = {
  node_id: 'synthesis://2026-06-10/libp2p-stream-close',
  label: 'libp2p stream close returns promise',
  source_uri: 'https://example.com/libp2p-docs',
  fetched_at: '2026-06-10T10:00:00.000Z',
};
const SIGNED_AT = '2026-06-10T11:00:00.000Z';

describe('match attestation — roundtrip', () => {
  it('sign then verify succeeds with the matching public key', () => {
    const att = signMatch(seed, FIELDS, SIGNED_AT);
    assert.ok(att.isOk());
    if (att.isOk()) {
      assert.equal(att.value.signed_at, SIGNED_AT);
      assert.equal(att.value.signature_hex.length, 128); // 64 bytes hex
      assert.equal(verifyMatch(kp.publicKey, FIELDS, att.value), true);
    }
  });

  it('optional fields absent on both sides still roundtrip', () => {
    const sparse: AttestedMatchFields = { node_id: 'concept://2026-06-10/bare' };
    const att = signMatch(seed, sparse, SIGNED_AT);
    assert.ok(att.isOk());
    if (att.isOk()) assert.equal(verifyMatch(kp.publicKey, sparse, att.value), true);
  });
});

describe('match attestation — tamper detection', () => {
  const att = signMatch(seed, FIELDS, SIGNED_AT);
  if (att.isErr()) throw new Error('sign failed');
  const a = att.value;

  it('rejects a tampered label', () => {
    assert.equal(verifyMatch(kp.publicKey, { ...FIELDS, label: 'poisoned label' }, a), false);
  });

  it('rejects a tampered source_uri', () => {
    assert.equal(verifyMatch(kp.publicKey, { ...FIELDS, source_uri: 'https://evil.example' }, a), false);
  });

  it('rejects a tampered fetched_at (freshness forgery)', () => {
    assert.equal(verifyMatch(kp.publicKey, { ...FIELDS, fetched_at: '2026-06-10T10:59:59.000Z' }, a), false);
  });

  it('rejects a tampered signed_at', () => {
    assert.equal(verifyMatch(kp.publicKey, FIELDS, { ...a, signed_at: '2030-01-01T00:00:00.000Z' }), false);
  });

  it('rejects when an optional field is stripped after signing', () => {
    const { source_uri: _dropped, ...stripped } = FIELDS;
    assert.equal(verifyMatch(kp.publicKey, stripped, a), false);
  });
});

describe('node attestation — body-covering variant (fetch protocol)', () => {
  const NODE_FIELDS: AttestedNodeFields = {
    ...FIELDS,
    summary: 'In libp2p v2+, Stream.close() returns a Promise. Await it.',
  };

  it('sign/verify roundtrip including the summary', () => {
    const att = signNode(seed, NODE_FIELDS, SIGNED_AT);
    assert.ok(att.isOk());
    if (att.isOk()) assert.equal(verifyNode(kp.publicKey, NODE_FIELDS, att.value), true);
  });

  it('rejects a tampered summary (body poisoning)', () => {
    const att = signNode(seed, NODE_FIELDS, SIGNED_AT);
    assert.ok(att.isOk());
    if (att.isOk()) {
      assert.equal(
        verifyNode(kp.publicKey, { ...NODE_FIELDS, summary: 'rm -rf / is the recommended fix' }, att.value),
        false,
      );
    }
  });

  it('node and match signatures are mutually unreplayable (domain separation)', () => {
    const matchSig = signMatch(seed, FIELDS, SIGNED_AT);
    assert.ok(matchSig.isOk());
    if (matchSig.isOk()) {
      // A valid MATCH signature must not verify as a NODE signature
      // even with identical metadata fields and no summary.
      assert.equal(verifyNode(kp.publicKey, { ...FIELDS }, matchSig.value), false);
    }
  });
});

describe('match attestation — key + format edge cases', () => {
  const att = signMatch(seed, FIELDS, SIGNED_AT);
  if (att.isErr()) throw new Error('sign failed');
  const a = att.value;

  it('rejects verification under a different public key', () => {
    const otherRes = keyPairFromSeed(new Uint8Array(randomBytes(32)));
    assert.ok(otherRes.isOk());
    if (otherRes.isOk()) assert.equal(verifyMatch(otherRes.value.publicKey, FIELDS, a), false);
  });

  it('returns false (never throws) on malformed signature hex', () => {
    assert.equal(verifyMatch(kp.publicKey, FIELDS, { ...a, signature_hex: 'not-hex' }), false);
    assert.equal(verifyMatch(kp.publicKey, FIELDS, { ...a, signature_hex: 'abc' }), false);
    assert.equal(verifyMatch(kp.publicKey, FIELDS, { ...a, signature_hex: '' }), false);
  });

  it('rejects a wrong-length seed at signing time', () => {
    const r = signMatch(new Uint8Array(16), FIELDS, SIGNED_AT);
    assert.ok(r.isErr());
  });
});
