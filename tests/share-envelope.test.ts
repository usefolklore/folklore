/**
 * Share-envelope sign/verify roundtrip + tamper-detection tests.
 *
 * Coverage:
 *   - Valid sign + verify roundtrip → ok with verified DID + payload
 *   - Tampered payload after signing → verify rejects
 *   - Wrong author DID pinning → verify rejects with authorMismatch
 *   - Malformed payload (missing required fields) → reject before signing
 *   - Replayed envelope from a different user → still verifies as that user
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  signShareableNode,
  verifyShareableNode,
} from '../src/domain/share-envelope.js';
import {
  createUserIdentity,
  authorizeDevice,
  generateKeyPair,
} from '../src/domain/identity.js';
import type { ShareableNode } from '../src/domain/sharing.js';

const buildIdentity = () => {
  const userRes = createUserIdentity(() => '2026-04-18T00:00:00Z');
  if (userRes.isErr()) throw new Error(`createUserIdentity: ${JSON.stringify(userRes.error)}`);
  const { identity: user, privateKey: userPriv } = userRes.value;

  const deviceKpRes = generateKeyPair();
  if (deviceKpRes.isErr()) throw new Error(`generateKeyPair: ${JSON.stringify(deviceKpRes.error)}`);
  const { publicKey: devicePub, privateKey: devicePriv } = deviceKpRes.value;

  const authorizedAt = '2026-04-18T00:00:01Z';
  const deviceId = 'test-device-1';
  const deviceKeyRes = authorizeDevice(userPriv, user.did, deviceId, devicePub, authorizedAt);
  if (deviceKeyRes.isErr()) throw new Error(`authorizeDevice: ${JSON.stringify(deviceKeyRes.error)}`);

  return { user, userPriv, deviceKey: deviceKeyRes.value, devicePriv };
};

const sampleNode: ShareableNode = {
  id: 'node-abc-123',
  label: 'libp2p mesh networking',
  room: 'research',
  embedding_id: 'emb-xyz-789',
  source_uri: 'https://example.com/p',
  fetched_at: '2026-04-18T00:00:00Z',
};

test('share-envelope: sign + verify roundtrip', () => {
  const id = buildIdentity();
  const signed = signShareableNode({
    devicePrivateKey: id.devicePriv,
    deviceKey: id.deviceKey,
    node: sampleNode,
    signedAt: '2026-04-18T00:00:02Z',
  });
  assert.ok(signed.isOk(), `sign failed: ${JSON.stringify(signed.isErr() ? signed.error : null)}`);
  const env = signed._unsafeUnwrap();
  assert.equal(env.signer_did, id.user.did);
  assert.equal(env.signer_device_id, id.deviceKey.device_id);
  assert.equal(env.envelope_version, 1);

  const verified = verifyShareableNode(env, { verifiedAt: '2026-04-18T00:00:03Z' });
  assert.ok(verified.isOk(), `verify failed: ${JSON.stringify(verified.isErr() ? verified.error : null)}`);
  const v = verified._unsafeUnwrap();
  assert.equal(v.verified_user_did, id.user.did);
  assert.equal(v.verified_device_id, id.deviceKey.device_id);
  assert.deepEqual(v.payload, sampleNode);
});

test('share-envelope: tampered payload after signing → verify rejects', () => {
  const id = buildIdentity();
  const signed = signShareableNode({
    devicePrivateKey: id.devicePriv,
    deviceKey: id.deviceKey,
    node: sampleNode,
  });
  assert.ok(signed.isOk());
  const env = signed._unsafeUnwrap();

  // Tamper: swap the label.
  const tampered = { ...env, payload: { ...env.payload, label: 'evil label' } };
  const verified = verifyShareableNode(tampered);
  assert.ok(verified.isErr(), 'tampered envelope should fail verification');
});

test('share-envelope: tampered signer_device_id → verify rejects', () => {
  const id = buildIdentity();
  const signed = signShareableNode({
    devicePrivateKey: id.devicePriv,
    deviceKey: id.deviceKey,
    node: sampleNode,
  });
  const env = signed._unsafeUnwrap();
  const tampered = { ...env, signer_device_id: 'attacker-device' };
  const verified = verifyShareableNode(tampered);
  assert.ok(verified.isErr(), 'device-id swap should fail verification');
});

test('share-envelope: author DID pinning rejects mismatch', () => {
  const id1 = buildIdentity();
  const id2 = buildIdentity();
  const signed = signShareableNode({
    devicePrivateKey: id1.devicePriv,
    deviceKey: id1.deviceKey,
    node: sampleNode,
  });
  const env = signed._unsafeUnwrap();

  // Verify pinning to id2's DID — must reject as authorMismatch.
  const verified = verifyShareableNode(env, { expectedAuthorDid: id2.user.did });
  assert.ok(verified.isErr());
  const err = verified._unsafeUnwrapErr();
  assert.equal(err.type, 'ShareEnvelopeAuthorMismatch');
});

test('share-envelope: author DID pinning passes match', () => {
  const id = buildIdentity();
  const signed = signShareableNode({
    devicePrivateKey: id.devicePriv,
    deviceKey: id.deviceKey,
    node: sampleNode,
  });
  const env = signed._unsafeUnwrap();
  const verified = verifyShareableNode(env, { expectedAuthorDid: id.user.did });
  assert.ok(verified.isOk());
});

test('share-envelope: malformed payload rejected before signing', () => {
  const id = buildIdentity();
  const bad = { id: '', label: 'x', room: 'r' } as ShareableNode;
  const signed = signShareableNode({
    devicePrivateKey: id.devicePriv,
    deviceKey: id.deviceKey,
    node: bad,
  });
  assert.ok(signed.isErr());
  const err = signed._unsafeUnwrapErr();
  assert.equal(err.type, 'ShareEnvelopeInvalidPayload');
});

test('share-envelope: missing required label rejected', () => {
  const id = buildIdentity();
  const bad = { id: 'x', label: '', room: 'r' } as ShareableNode;
  const signed = signShareableNode({
    devicePrivateKey: id.devicePriv,
    deviceKey: id.deviceKey,
    node: bad,
  });
  assert.ok(signed.isErr());
});

test('share-envelope: optional field type-mismatch rejected', () => {
  const id = buildIdentity();
  const bad = {
    id: 'x',
    label: 'x',
    room: 'r',
    embedding_id: 123 as unknown as string,
  } as ShareableNode;
  const signed = signShareableNode({
    devicePrivateKey: id.devicePriv,
    deviceKey: id.deviceKey,
    node: bad,
  });
  assert.ok(signed.isErr());
});

test('share-envelope: device_authorization tampering → verify rejects', () => {
  const id = buildIdentity();
  const signed = signShareableNode({
    devicePrivateKey: id.devicePriv,
    deviceKey: id.deviceKey,
    node: sampleNode,
  });
  const env = signed._unsafeUnwrap();
  // Flip a byte in the authorization sig
  const badSig = new Uint8Array(env.device_authorization.authorization_sig);
  badSig[0] ^= 0xff;
  const tampered = {
    ...env,
    device_authorization: { ...env.device_authorization, authorization_sig: badSig },
  };
  const verified = verifyShareableNode(tampered);
  assert.ok(verified.isErr(), 'authorization-sig tamper should fail');
});

test('share-envelope: signature byte flip → verify rejects', () => {
  const id = buildIdentity();
  const signed = signShareableNode({
    devicePrivateKey: id.devicePriv,
    deviceKey: id.deviceKey,
    node: sampleNode,
  });
  const env = signed._unsafeUnwrap();
  const badSig = new Uint8Array(env.signature);
  badSig[10] ^= 0x55;
  const tampered = { ...env, signature: badSig };
  const verified = verifyShareableNode(tampered);
  assert.ok(verified.isErr(), 'payload-sig tamper should fail');
});
