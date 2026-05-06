/**
 * Unit tests — linked-accounts persistence.
 *
 * Locks the contract:
 *   - load on a fresh home returns empty schema (version 1, accounts {})
 *   - save round-trips the verified handle for one provider
 *   - save preserves other providers (multi-provider isolation)
 *   - corrupted file gracefully falls back to empty
 *   - tokens never make it to disk (smoke check on payload schema)
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadLinkedAccounts,
  saveLinkedAccount,
} from '../src/infrastructure/linked-accounts.js';

const tmpHome = (): string => mkdtempSync(join(tmpdir(), 'wi-linked-'));

const sampleAccount = {
  handle: 'sahar-barak',
  user_id: '12345',
  profile_url: 'https://github.com/sahar-barak',
  verified_at: '2026-05-06T20:30:00.000Z',
} as const;

test('loadLinkedAccounts on a fresh home returns empty file', () => {
  const home = tmpHome();
  try {
    const f = loadLinkedAccounts(home);
    assert.equal(f.version, 1);
    assert.deepEqual(f.accounts, {});
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('saveLinkedAccount persists + load round-trips github account', () => {
  const home = tmpHome();
  try {
    const r = saveLinkedAccount(home, 'github', sampleAccount);
    assert.ok(r.isOk());
    const f = loadLinkedAccounts(home);
    assert.deepEqual(f.accounts.github, sampleAccount);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('saving a second provider preserves the first', () => {
  const home = tmpHome();
  try {
    saveLinkedAccount(home, 'github', sampleAccount);
    saveLinkedAccount(home, 'google', {
      ...sampleAccount,
      handle: 'sahar@example.com',
      user_id: 'gid-789',
      profile_url: 'https://google.com/profiles/789',
    });
    const f = loadLinkedAccounts(home);
    assert.equal(f.accounts.github?.handle, 'sahar-barak');
    assert.equal(f.accounts.google?.handle, 'sahar@example.com');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('replacing the same provider overwrites in place', () => {
  const home = tmpHome();
  try {
    saveLinkedAccount(home, 'github', sampleAccount);
    saveLinkedAccount(home, 'github', { ...sampleAccount, handle: 'renamed-account' });
    const f = loadLinkedAccounts(home);
    assert.equal(f.accounts.github?.handle, 'renamed-account');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('corrupted file gracefully falls back to empty', () => {
  const home = tmpHome();
  try {
    writeFileSync(join(home, 'linked-accounts.json'), 'not-json{{{');
    const f = loadLinkedAccounts(home);
    assert.equal(f.version, 1);
    assert.deepEqual(f.accounts, {});
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('persisted JSON contains no token-shaped fields (privacy guard)', () => {
  const home = tmpHome();
  try {
    saveLinkedAccount(home, 'github', sampleAccount);
    const raw = readFileSync(join(home, 'linked-accounts.json'), 'utf8');
    // Belt-and-braces: nothing token-shaped should ever land here.
    assert.ok(!/access_token|gho_|ghp_|gh[osu]_/i.test(raw), `token-like field leaked: ${raw}`);
    assert.ok(/sahar-barak/.test(raw));
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
