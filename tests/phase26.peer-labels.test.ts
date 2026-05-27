/**
 * Phase 26 stage C — peer-labels.json loader contract.
 *
 * Locks the integration shape that share-sync's inbound observer
 * relies on for `expectedGithubUser` pin lookup:
 *
 *   loadPeerLabels(path) → PeerLabelsFile (empty on missing/corrupt)
 *   lookupGithub(labels, peerId) → string | undefined
 *
 * Corruption tolerance is critical: a bad labels file must NOT brick
 * federation. Falling back to "no pin" matches the unlabelled-peer
 * path and keeps inbound shares flowing.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPeerLabels, lookupGithub } from '../src/infrastructure/peer-labels.js';

const tmpDir = (): string => mkdtempSync(join(tmpdir(), 'ak-plabels-'));

test('phase-26: loadPeerLabels returns empty store when file missing', () => {
  const dir = tmpDir();
  try {
    const labels = loadPeerLabels(join(dir, 'peer-labels.json'));
    assert.equal(labels.version, 1);
    assert.deepEqual(labels.peers, {});
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('phase-26: loadPeerLabels parses a well-formed v1 file', () => {
  const dir = tmpDir();
  const path = join(dir, 'peer-labels.json');
  try {
    writeFileSync(path, JSON.stringify({
      version: 1,
      peers: {
        'QmABC': { github: 'SaharBarak', note: 'main laptop' },
        'QmDEF': { github: 'OtherPerson' },
      },
    }));
    const labels = loadPeerLabels(path);
    assert.equal(labels.peers['QmABC']?.github, 'SaharBarak');
    assert.equal(labels.peers['QmDEF']?.github, 'OtherPerson');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('phase-26: loadPeerLabels falls back to empty on corrupt JSON', () => {
  const dir = tmpDir();
  const path = join(dir, 'peer-labels.json');
  try {
    writeFileSync(path, 'not-json{{{');
    const labels = loadPeerLabels(path);
    assert.equal(labels.version, 1);
    assert.deepEqual(labels.peers, {},
      'corrupt file must not break federation');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('phase-26: loadPeerLabels falls back when version is wrong', () => {
  const dir = tmpDir();
  const path = join(dir, 'peer-labels.json');
  try {
    writeFileSync(path, JSON.stringify({
      version: 99,
      peers: { 'QmABC': { github: 'shouldNotLoad' } },
    }));
    const labels = loadPeerLabels(path);
    assert.equal(labels.peers['QmABC'], undefined);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('phase-26: lookupGithub returns handle for labelled peer', () => {
  const labels = {
    version: 1 as const,
    peers: { 'QmABC': { github: 'SaharBarak' } },
  };
  assert.equal(lookupGithub(labels, 'QmABC'), 'SaharBarak');
});

test('phase-26: lookupGithub returns undefined for unlabelled peer', () => {
  const labels = {
    version: 1 as const,
    peers: { 'QmABC': { github: 'SaharBarak' } },
  };
  assert.equal(lookupGithub(labels, 'QmUNKNOWN'), undefined,
    'unlabelled peer ⇒ undefined ⇒ no pin (graceful degrade)');
});

test('phase-26: lookupGithub returns undefined when entry has no github field', () => {
  const labels = {
    version: 1 as const,
    peers: { 'QmABC': { note: 'just a note, no github' } },
  };
  assert.equal(lookupGithub(labels, 'QmABC'), undefined);
});
