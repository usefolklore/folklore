/**
 * Unit tests — inbound share-sync policy classifier.
 *
 * Locks the contract for `classifyInboundShare`:
 *   - signed envelope → signed_ok with verified DID
 *   - tampered envelope → signed_invalid
 *   - plain payload + soft mode → unsigned_allowed
 *   - plain payload + strict mode → unsigned_rejected
 *   - garbage → malformed
 *   - sharePolicyModeFromEnv reads FOLKLORE_REQUIRE_SIGNED_NODES
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyInboundShare,
  sharePolicyModeFromEnv,
} from '../src/domain/share-policy.js';
import { signShareableNode } from '../src/domain/share-envelope.js';
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
  const deviceKeyRes = authorizeDevice(
    userPriv,
    user.did,
    'test-device-1',
    devicePub,
    '2026-04-18T00:00:01Z',
  );
  if (deviceKeyRes.isErr()) throw new Error(`authorizeDevice: ${JSON.stringify(deviceKeyRes.error)}`);
  return { user, deviceKey: deviceKeyRes.value, devicePriv };
};

const samplePayload: ShareableNode = {
  id: 'node-1',
  label: 'libp2p mesh',
  source_uri: 'https://example.com/x',
  fetched_at: '2026-05-01T00:00:00Z',
};

const buildSignedEnvelope = () => {
  const { deviceKey, devicePriv } = buildIdentity();
  const signed = signShareableNode({
    devicePrivateKey: devicePriv,
    deviceKey,
    node: samplePayload,
    signedAt: '2026-05-01T00:00:01Z',
  });
  if (signed.isErr()) throw new Error(`signShareableNode: ${JSON.stringify(signed.error)}`);
  return signed.value;
};

// ─────────────── policy mode parsing ──────

test('sharePolicyModeFromEnv defaults to soft when var unset', () => {
  assert.equal(sharePolicyModeFromEnv({}), 'soft');
  assert.equal(sharePolicyModeFromEnv({ FOLKLORE_REQUIRE_SIGNED_NODES: '' }), 'soft');
  assert.equal(sharePolicyModeFromEnv({ FOLKLORE_REQUIRE_SIGNED_NODES: '0' }), 'soft');
});

test('sharePolicyModeFromEnv flips to strict for "1" or "true"', () => {
  assert.equal(sharePolicyModeFromEnv({ FOLKLORE_REQUIRE_SIGNED_NODES: '1' }), 'strict');
  assert.equal(
    sharePolicyModeFromEnv({ FOLKLORE_REQUIRE_SIGNED_NODES: 'true' }),
    'strict',
  );
});

// ─────────────── classify: signed ──────────

test('signed envelope verifies → signed_ok with payload + verified DID', () => {
  const env = buildSignedEnvelope();
  const c = classifyInboundShare(env, 'soft');
  assert.equal(c.verdict, 'signed_ok');
  if (c.verdict === 'signed_ok') {
    assert.equal(c.payload.id, 'node-1');
    assert.ok(c.verified.verified_user_did.startsWith('did:key:'));
  }
});

test('signed envelope verifies in strict mode too — strict only blocks UNSIGNED', () => {
  const env = buildSignedEnvelope();
  const c = classifyInboundShare(env, 'strict');
  assert.equal(c.verdict, 'signed_ok');
});

test('tampered signed envelope (mutated payload after signing) → signed_invalid', () => {
  const env = buildSignedEnvelope();
  // Forge: change the payload after the signature was computed.
  const tampered = {
    ...env,
    payload: { ...env.payload, label: 'attacker-injected' },
  };
  const c = classifyInboundShare(tampered, 'soft');
  assert.equal(c.verdict, 'signed_invalid');
});

// ─────────────── classify: unsigned ────────

test('plain ShareableNode + soft mode → unsigned_allowed', () => {
  const c = classifyInboundShare(samplePayload, 'soft');
  assert.equal(c.verdict, 'unsigned_allowed');
  if (c.verdict === 'unsigned_allowed') {
    assert.equal(c.payload.id, 'node-1');
  }
});

test('plain ShareableNode + strict mode → unsigned_rejected', () => {
  const c = classifyInboundShare(samplePayload, 'strict');
  assert.equal(c.verdict, 'unsigned_rejected');
});

// ─────────────── classify: malformed ───────

test('null / undefined / non-object → malformed', () => {
  assert.equal(classifyInboundShare(null, 'soft').verdict, 'malformed');
  assert.equal(classifyInboundShare(undefined, 'soft').verdict, 'malformed');
  assert.equal(classifyInboundShare(42, 'soft').verdict, 'malformed');
  assert.equal(classifyInboundShare('hello', 'soft').verdict, 'malformed');
});

test('object missing required ShareableNode fields → malformed', () => {
  // No id — fails the looksLikeShareable guard.
  assert.equal(classifyInboundShare({ label: 'x' }, 'soft').verdict, 'malformed');
  // No label.
  assert.equal(classifyInboundShare({ id: 'a' }, 'soft').verdict, 'malformed');
  // Empty id — non-empty string required by the guard.
  assert.equal(classifyInboundShare({ id: '', label: 'b' }, 'soft').verdict, 'malformed');
});

test('valid id+label (no room field) is accepted, not malformed', () => {
  // `room` is no longer part of ShareableNode, so a node carrying only
  // a non-empty id + string label is a well-formed unsigned node.
  const c = classifyInboundShare({ id: 'a', label: 'b' }, 'soft');
  assert.equal(c.verdict, 'unsigned_allowed');
  if (c.verdict === 'unsigned_allowed') assert.equal(c.payload.id, 'a');
});

test('signed-envelope-shaped but with missing required signature fields → malformed', () => {
  // envelope_version present but signature/signer_did/payload missing.
  const partial = { envelope_version: 1 };
  assert.equal(classifyInboundShare(partial, 'soft').verdict, 'malformed');
});
