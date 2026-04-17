/**
 * End-to-end tests for the DID wave:
 *   domain/identity.ts (already covered by identity.test.ts)
 *   infrastructure/identity-store.ts
 *   application/identity-lifecycle.ts
 *
 * Scenarios:
 *   - ensureIdentity is idempotent — second call reuses existing state
 *   - rotateDeviceKey keeps user DID but yields a distinct device key
 *   - exportRecoveryHex → importRecoveryHex round-trip restores the same user DID
 *   - SignedEnvelope produced on device A verifies on a freshly-booted device B
 *     under the same user DID (memory portability across devices — the heart
 *     of the DID thesis)
 *   - A file-perm check on user.seed ensures 0600 on POSIX
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm, stat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  ensureIdentity,
  rotateDeviceKey,
  exportRecoveryHex,
  importRecoveryHex,
  signForDevice,
  verifySignedEnvelope,
} from '../src/application/identity-lifecycle.ts';
import { identityPaths } from '../src/infrastructure/identity-store.ts';

let homeA: string;
let homeB: string;

beforeEach(async () => {
  homeA = await mkdtemp(join(tmpdir(), 'wi-identity-A-'));
  homeB = await mkdtemp(join(tmpdir(), 'wi-identity-B-'));
});

afterEach(async () => {
  await rm(homeA, { recursive: true, force: true });
  await rm(homeB, { recursive: true, force: true });
});

describe('identity lifecycle', () => {
  it('ensureIdentity is idempotent and creates files on first call', async () => {
    const first = await ensureIdentity(homeA);
    assert.ok(first.isOk(), `first call: ${first.isErr() ? JSON.stringify(first.error) : ''}`);
    if (!first.isOk()) return;

    const paths = identityPaths(homeA);
    // Files exist after first call
    const pubStat = await stat(paths.userPublicPath);
    const seedStat = await stat(paths.userSeedPath);
    const devStat = await stat(paths.devicePath);
    assert.ok(pubStat.isFile());
    assert.ok(seedStat.isFile());
    assert.ok(devStat.isFile());

    // POSIX file perms — user.seed should be 0600
    if (process.platform !== 'win32') {
      assert.equal(seedStat.mode & 0o777, 0o600, `seed perm: ${(seedStat.mode & 0o777).toString(8)}`);
    }

    const second = await ensureIdentity(homeA);
    assert.ok(second.isOk(), 'second call must succeed');
    if (!second.isOk()) return;

    // Same user DID, same device id, same device public key
    assert.equal(second.value.user.did, first.value.user.did);
    assert.equal(second.value.deviceKey.device_id, first.value.deviceKey.device_id);
    assert.deepEqual(second.value.deviceKey.device_public_key, first.value.deviceKey.device_public_key);
  });

  it('rotateDeviceKey preserves user DID but yields a new device key', async () => {
    const before = await ensureIdentity(homeA);
    assert.ok(before.isOk());
    if (!before.isOk()) return;

    const rotated = await rotateDeviceKey(homeA);
    assert.ok(rotated.isOk(), `rotate: ${rotated.isErr() ? JSON.stringify(rotated.error) : ''}`);
    if (!rotated.isOk()) return;

    assert.equal(rotated.value.user.did, before.value.user.did);
    assert.notEqual(rotated.value.deviceKey.device_id, before.value.deviceKey.device_id);
    assert.notDeepEqual(rotated.value.deviceKey.device_public_key, before.value.deviceKey.device_public_key);
  });

  it('exports then imports recovery hex and restores the same user DID', async () => {
    const original = await ensureIdentity(homeA);
    assert.ok(original.isOk());
    if (!original.isOk()) return;

    const exp = await exportRecoveryHex(homeA);
    assert.ok(exp.isOk());
    if (!exp.isOk()) return;
    assert.equal(exp.value.length, 64);

    const imported = await importRecoveryHex(homeB, exp.value);
    assert.ok(imported.isOk(), `import: ${imported.isErr() ? JSON.stringify(imported.error) : ''}`);
    if (!imported.isOk()) return;

    // Same user DID, same user public key → memory portability across devices
    assert.equal(imported.value.user.did, original.value.user.did);
    assert.deepEqual(imported.value.user.publicKey, original.value.user.publicKey);
    // Different device key — restored-on-new-device authorizes fresh device
    assert.notDeepEqual(imported.value.deviceKey.device_public_key, original.value.deviceKey.device_public_key);
  });

  it('rejects an import of a malformed recovery hex', async () => {
    const res = await importRecoveryHex(homeA, 'not-a-hex-string');
    assert.ok(res.isErr());
  });

  it('envelope signed on device A verifies on freshly-imported device B', async () => {
    // Device A bootstraps a user
    const a = await ensureIdentity(homeA);
    assert.ok(a.isOk());
    if (!a.isOk()) return;

    // Device A signs a memory entry
    const payload = {
      kind: 'memory_entry' as const,
      label: 'wellinformed v3 is a P2P memory protocol for the free LLM world',
      room: 'wellinformed-dev',
      tags: ['release', 'p2p', 'did'],
    };
    const envRes = await signForDevice(a.value, payload, '2026-04-17T00:00:00.000Z');
    assert.ok(envRes.isOk(), `sign: ${envRes.isErr() ? JSON.stringify(envRes.error) : ''}`);
    if (!envRes.isOk()) return;

    // Device B is a fresh machine that imports the recovery hex from A
    const exp = await exportRecoveryHex(homeA);
    assert.ok(exp.isOk());
    if (!exp.isOk()) return;
    const b = await importRecoveryHex(homeB, exp.value);
    assert.ok(b.isOk());
    if (!b.isOk()) return;

    // Verifying the A-signed envelope on B succeeds with the original user DID
    const verRes = await verifySignedEnvelope(envRes.value, '2026-04-17T01:00:00.000Z');
    assert.ok(verRes.isOk(), `verify: ${verRes.isErr() ? JSON.stringify(verRes.error) : ''}`);
    if (!verRes.isOk()) return;

    assert.equal(verRes.value.verified_user_did, a.value.user.did);
    assert.equal(verRes.value.verified_user_did, b.value.user.did);
    assert.deepEqual(verRes.value.payload, payload);
  });

  it('persisted user.json is stable across reopens', async () => {
    const first = await ensureIdentity(homeA);
    assert.ok(first.isOk());
    if (!first.isOk()) return;

    const paths = identityPaths(homeA);
    const raw = await readFile(paths.userPublicPath, 'utf8');
    const parsed = JSON.parse(raw) as { version: number; did: string; public_key_hex: string; created_at: string };
    assert.equal(parsed.version, 1);
    assert.equal(parsed.did, first.value.user.did);
    assert.ok(/^[0-9a-f]{64}$/.test(parsed.public_key_hex));
  });
});
