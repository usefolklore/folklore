/**
 * Phase 27 — `akashik peer label` / `peer unlabel` E2E.
 *
 * Drives the renamed-akashik bin through `execFileSync` against a
 * temp AKASHIK_HOME so the test never touches the live ~/.akashik/.
 * What this pins:
 *
 *   L1  `peer label <id> <handle>` writes the github mapping to
 *       peer-labels.json under the supplied AKASHIK_HOME
 *   L2  `peer label <id> @<handle>` strips the `@` prefix gracefully
 *   L3  `--note "free text"` is persisted alongside the github field
 *   L4  re-running `peer label` with the same id upserts (no duplicates)
 *   L5  `peer unlabel <id>` removes the record; second call is a no-op
 *   L6  `peer label` with too few args exits 1 with a usage hint
 *
 * Plus a domain-level test:
 *
 *   M1  setPeerLabel preserves an existing `note` when only `github`
 *       is patched on a re-label (and vice versa)
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  loadPeerLabels,
  setPeerLabel,
  removePeerLabel,
} from '../src/infrastructure/peer-labels.js';

const cliBin = join(process.cwd(), 'bin/akashik.js');

const tmpHome = (): string => mkdtempSync(join(tmpdir(), 'ak-p27-'));

interface CliResult { code: number; stdout: string; stderr: string; }

const runCli = (args: readonly string[], home: string): CliResult => {
  try {
    const stdout = execFileSync(process.execPath, [cliBin, ...args], {
      env: { ...process.env, AKASHIK_HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    });
    return { code: 0, stdout, stderr: '' };
  } catch (e) {
    const err = e as { status?: number; stdout?: string | Buffer; stderr?: string | Buffer };
    const decode = (v: string | Buffer | undefined): string =>
      typeof v === 'string' ? v : v?.toString('utf8') ?? '';
    return { code: err.status ?? 1, stdout: decode(err.stdout), stderr: decode(err.stderr) };
  }
};

const labelsPath = (home: string): string => join(home, 'peer-labels.json');

const PEER_A = 'QmAlice1234567890abcdef1234567890abcdef';
const PEER_B = 'QmBob9876543210fedcba9876543210fedcba';

// ─────────────── L1: write happy path ─────────

test('phase-27 L1: peer label writes peer-labels.json', () => {
  const home = tmpHome();
  try {
    const r = runCli(['peer', 'label', PEER_A, 'SaharBarak'], home);
    assert.equal(r.code, 0, `expected exit 0, got ${r.code} stderr=${r.stderr}`);

    assert.ok(existsSync(labelsPath(home)), 'peer-labels.json must be created');
    const labels = JSON.parse(readFileSync(labelsPath(home), 'utf8'));
    assert.equal(labels.peers[PEER_A]?.github, 'SaharBarak');
    assert.match(r.stdout, /share-sync will now pin/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─────────────── L2: @ prefix tolerance ─────────

test('phase-27 L2: peer label tolerates @handle form', () => {
  const home = tmpHome();
  try {
    const r = runCli(['peer', 'label', PEER_A, '@SaharBarak'], home);
    assert.equal(r.code, 0);
    const labels = JSON.parse(readFileSync(labelsPath(home), 'utf8'));
    assert.equal(labels.peers[PEER_A]?.github, 'SaharBarak',
      '@ prefix must be stripped (storage is canonical handle)');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─────────────── L3: --note persistence ─────────

test('phase-27 L3: --note flag is persisted', () => {
  const home = tmpHome();
  try {
    const r = runCli(['peer', 'label', PEER_A, 'SaharBarak', '--note', 'main mac mini'], home);
    assert.equal(r.code, 0);
    const labels = JSON.parse(readFileSync(labelsPath(home), 'utf8'));
    assert.equal(labels.peers[PEER_A]?.note, 'main mac mini');
    assert.match(r.stdout, /note: main mac mini/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─────────────── L4: re-label is upsert ─────────

test('phase-27 L4: re-labelling the same peer upserts (no duplicates)', () => {
  const home = tmpHome();
  try {
    runCli(['peer', 'label', PEER_A, 'OldHandle'], home);
    const r = runCli(['peer', 'label', PEER_A, 'NewHandle'], home);
    assert.equal(r.code, 0);

    const labels = JSON.parse(readFileSync(labelsPath(home), 'utf8'));
    assert.equal(labels.peers[PEER_A]?.github, 'NewHandle');
    assert.equal(Object.keys(labels.peers).length, 1,
      'must not create duplicate entries on re-label');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─────────────── L5: unlabel ─────────

test('phase-27 L5: peer unlabel removes the entry; second call is a no-op', () => {
  const home = tmpHome();
  try {
    runCli(['peer', 'label', PEER_A, 'SaharBarak'], home);
    runCli(['peer', 'label', PEER_B, 'OtherPerson'], home);

    const r1 = runCli(['peer', 'unlabel', PEER_A], home);
    assert.equal(r1.code, 0);
    assert.match(r1.stdout, /removed label/);
    const labels1 = JSON.parse(readFileSync(labelsPath(home), 'utf8'));
    assert.equal(labels1.peers[PEER_A], undefined,
      'PEER_A must be gone after unlabel');
    assert.equal(labels1.peers[PEER_B]?.github, 'OtherPerson',
      'PEER_B must remain (isolation)');

    const r2 = runCli(['peer', 'unlabel', PEER_A], home);
    assert.equal(r2.code, 0);
    assert.match(r2.stdout, /not labelled/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─────────────── L6: missing args ─────────

test('phase-27 L6: peer label with too few args exits 1 with usage hint', () => {
  const home = tmpHome();
  try {
    const r = runCli(['peer', 'label', PEER_A], home);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /usage: akashik peer label/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─────────────── M1: setPeerLabel preserves siblings ─────────

test('phase-27 M1: setPeerLabel patches `github` without clobbering `note` (and vice versa)', () => {
  const home = tmpHome();
  try {
    const path = labelsPath(home);
    setPeerLabel(path, PEER_A, { github: 'SaharBarak', note: 'mac mini' });
    // Patch github only — note must survive.
    setPeerLabel(path, PEER_A, { github: 'RenamedHandle' });
    const after = loadPeerLabels(path);
    assert.equal(after.peers[PEER_A]?.github, 'RenamedHandle');
    assert.equal(after.peers[PEER_A]?.note, 'mac mini',
      'patching only `github` must preserve any existing `note`');

    // Patch note only — github must survive.
    setPeerLabel(path, PEER_A, { note: 'updated location' });
    const final = loadPeerLabels(path);
    assert.equal(final.peers[PEER_A]?.github, 'RenamedHandle');
    assert.equal(final.peers[PEER_A]?.note, 'updated location');

    // Sanity: removePeerLabel returns false when called twice.
    assert.equal(removePeerLabel(path, PEER_A), true);
    assert.equal(removePeerLabel(path, PEER_A), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
