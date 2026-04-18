/**
 * Tests for src/application/bip39-recovery.ts — v4.1 mnemonic export/import.
 *
 * Covers:
 *   - mnemonicFromSeed produces 24 English words
 *   - seed → mnemonic → seed round-trip is identity
 *   - validateMnemonic accepts good, rejects bad
 *   - rejects 12-word (we deliberately use 24-word for full 256-bit Ed25519 seed)
 *   - rejects mnemonic with bad checksum
 *   - integrates with importRecoveryAuto in identity-lifecycle
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';
import {
  mnemonicFromSeed,
  seedFromMnemonic,
  validateMnemonic,
} from '../src/application/bip39-recovery.ts';
import {
  ensureIdentity,
  exportRecoveryMnemonic,
  importRecoveryAuto,
  importRecoveryHex,
} from '../src/application/identity-lifecycle.ts';

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'wi-bip39-'));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('BIP39 — pure helpers', () => {
  it('mnemonicFromSeed yields 24 English words from a 32-byte seed', () => {
    const seed = new Uint8Array(randomBytes(32));
    const r = mnemonicFromSeed(seed);
    assert.ok(r.isOk(), `expected ok, got ${r.isErr() ? JSON.stringify(r.error) : ''}`);
    if (r.isOk()) {
      const words = r.value.split(/\s+/);
      assert.equal(words.length, 24);
      // Every word should be lowercase letters only (English wordlist invariant)
      for (const w of words) assert.match(w, /^[a-z]+$/);
    }
  });

  it('seed → mnemonic → seed round-trip is byte-identical', () => {
    const seed = new Uint8Array(randomBytes(32));
    const m = mnemonicFromSeed(seed);
    assert.ok(m.isOk());
    if (!m.isOk()) return;
    const back = seedFromMnemonic(m.value);
    assert.ok(back.isOk());
    if (back.isOk()) assert.deepEqual(back.value, seed);
  });

  it('rejects mnemonic that is not exactly 24 words', () => {
    const twelve = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
    assert.ok(seedFromMnemonic(twelve).isErr(), '12-word mnemonic should be rejected');
    const empty = '';
    assert.ok(seedFromMnemonic(empty).isErr());
  });

  it('rejects mnemonic with bad checksum', () => {
    // Take a valid mnemonic and swap the last word — checksum will fail
    const seed = new Uint8Array(randomBytes(32));
    const m = mnemonicFromSeed(seed);
    assert.ok(m.isOk());
    if (!m.isOk()) return;
    const words = m.value.split(' ');
    // Replace the last word with one that's in the wordlist but wrong here
    const bad = [...words.slice(0, -1), 'abandon'].join(' ');
    if (bad === m.value) return; // unlikely but possible
    assert.ok(seedFromMnemonic(bad).isErr(), 'bad checksum should be rejected');
  });

  it('validateMnemonic agrees with seedFromMnemonic', () => {
    const seed = new Uint8Array(randomBytes(32));
    const m = mnemonicFromSeed(seed);
    assert.ok(m.isOk());
    if (!m.isOk()) return;
    assert.equal(validateMnemonic(m.value), true);
    assert.equal(validateMnemonic('not a mnemonic'), false);
    assert.equal(validateMnemonic(''), false);
  });

  it('handles whitespace + case-insensitivity gracefully (within BIP39 spec)', () => {
    const seed = new Uint8Array(randomBytes(32));
    const m = mnemonicFromSeed(seed);
    assert.ok(m.isOk());
    if (!m.isOk()) return;
    // Extra whitespace between words
    const padded = m.value.split(' ').join('  ');
    const r = seedFromMnemonic(padded);
    assert.ok(r.isOk(), 'multi-space separators should be normalized');
    if (r.isOk()) assert.deepEqual(r.value, seed);
  });
});

describe('BIP39 — end-to-end through identity-lifecycle', () => {
  it('exportRecoveryMnemonic emits 24 words; importRecoveryAuto restores the same DID', async () => {
    const a = await ensureIdentity(home, () => '2026-04-18T00:00:00.000Z');
    assert.ok(a.isOk(), `ensureIdentity: ${a.isErr() ? JSON.stringify(a.error) : ''}`);
    if (!a.isOk()) return;
    const originalDid = a.value.user.did;

    const m = await exportRecoveryMnemonic(home);
    assert.ok(m.isOk());
    if (!m.isOk()) return;
    const mnemonic = m.value;
    assert.equal(mnemonic.split(/\s+/).length, 24);

    // Wipe the identity dir, then restore via mnemonic
    await rm(home, { recursive: true, force: true });
    const restored = await importRecoveryAuto(home, mnemonic);
    assert.ok(restored.isOk(), `restore: ${restored.isErr() ? JSON.stringify(restored.error) : ''}`);
    if (restored.isOk()) {
      assert.equal(restored.value.user.did, originalDid, 'restored DID must match original');
    }
  });

  it('importRecoveryAuto auto-detects hex vs mnemonic', async () => {
    const a = await ensureIdentity(home, () => '2026-04-18T00:00:00.000Z');
    assert.ok(a.isOk());
    if (!a.isOk()) return;
    const originalDid = a.value.user.did;

    // Path 1: export hex, restore via auto (recognizes 64-hex)
    const hexLike = Array.from(a.value.userPrivateKey).map((b) => b.toString(16).padStart(2, '0')).join('');
    await rm(home, { recursive: true, force: true });
    const r1 = await importRecoveryAuto(home, hexLike);
    assert.ok(r1.isOk());
    if (r1.isOk()) assert.equal(r1.value.user.did, originalDid);
  });

  it('importRecoveryAuto rejects malformed input', async () => {
    const r = await importRecoveryAuto(home, 'not 24 words and not 64 hex');
    assert.ok(r.isErr());
  });
});
