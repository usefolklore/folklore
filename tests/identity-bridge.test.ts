/**
 * Tests for src/application/identity-bridge.ts — the process-wide
 * seam that downstream trust-boundary modules (search-sync, share-sync,
 * touch, save) will integrate with.
 *
 * Also demonstrates the integration pattern by wrapping a realistic
 * federated-search-request shape in a SignedEnvelope<SearchRequest>
 * and verifying the round-trip. The wire-protocol integration lives
 * in a later patch; this test pins the pattern.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  currentIdentity,
  signForCurrentDevice,
  verifyIncomingEnvelope,
  __testReset,
  __setHomeOverride,
} from '../src/application/identity-bridge.ts';

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'wi-bridge-'));
  __setHomeOverride(home);
});

afterEach(async () => {
  __testReset();
  await rm(home, { recursive: true, force: true });
});

describe('identity-bridge', () => {
  it('currentIdentity is cached — second call returns same instance', async () => {
    const a = await currentIdentity();
    const b = await currentIdentity();
    assert.ok(a.isOk() && b.isOk());
    if (a.isOk() && b.isOk()) {
      assert.strictEqual(a.value, b.value); // reference equality
    }
  });

  it('concurrent bootstrap calls share one inflight promise', async () => {
    const [a, b, c] = await Promise.all([
      currentIdentity(),
      currentIdentity(),
      currentIdentity(),
    ]);
    assert.ok(a.isOk() && b.isOk() && c.isOk());
    if (a.isOk() && b.isOk() && c.isOk()) {
      assert.strictEqual(a.value, b.value);
      assert.strictEqual(b.value, c.value);
    }
  });

  it('signs and verifies a federated search request payload', async () => {
    // Pattern: SearchRequest wire payload (Float32Array → number[] per Pitfall 3).
    const searchRequest = {
      type: 'search' as const,
      embedding: [0.1, 0.2, -0.3, 0.4],
      room: 'wellinformed-dev',
      k: 10,
    };

    const envRes = await signForCurrentDevice(searchRequest, '2026-04-17T10:00:00.000Z');
    assert.ok(envRes.isOk(), `sign: ${envRes.isErr() ? JSON.stringify(envRes.error) : ''}`);
    if (!envRes.isOk()) return;

    const verRes = await verifyIncomingEnvelope(envRes.value, '2026-04-17T10:01:00.000Z');
    assert.ok(verRes.isOk(), `verify: ${verRes.isErr() ? JSON.stringify(verRes.error) : ''}`);
    if (!verRes.isOk()) return;

    assert.deepEqual(verRes.value.payload, searchRequest);
    // DID is present — the responder can now rate-limit / prioritize by identity
    assert.ok(verRes.value.verified_user_did.startsWith('did:key:z'));
  });

  it('tampered embedding in a signed search request fails verification', async () => {
    const req = { type: 'search', embedding: [0.1, 0.2], room: 'x', k: 5 };
    const envRes = await signForCurrentDevice(req);
    assert.ok(envRes.isOk());
    if (!envRes.isOk()) return;

    // Replace the embedding after signing — any responder MUST reject this.
    const tampered = { ...envRes.value, payload: { ...envRes.value.payload, embedding: [0.9, 0.9] } };
    const verRes = await verifyIncomingEnvelope(tampered);
    assert.ok(verRes.isErr());
  });

  it('envelope from user A does not verify after tampering signer DID', async () => {
    // Same pattern as the federated-search "pretend to be someone else" attack.
    const payload = { kind: 'touch_response', note_count: 42 };
    const envRes = await signForCurrentDevice(payload);
    assert.ok(envRes.isOk());
    if (!envRes.isOk()) return;

    const fake = {
      ...envRes.value,
      signer_did: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK' as typeof envRes.value.signer_did,
    };
    assert.ok((await verifyIncomingEnvelope(fake)).isErr());
  });

  it('__testReset + home override lets a test adopt a fresh identity', async () => {
    const first = await currentIdentity();
    assert.ok(first.isOk());

    const other = await mkdtemp(join(tmpdir(), 'wi-bridge-other-'));
    try {
      __testReset();
      __setHomeOverride(other);
      const second = await currentIdentity();
      assert.ok(second.isOk());
      if (first.isOk() && second.isOk()) {
        // Different home dirs ⇒ different user DIDs
        assert.notEqual(first.value.user.did, second.value.user.did);
      }
    } finally {
      await rm(other, { recursive: true, force: true });
    }
  });
});
