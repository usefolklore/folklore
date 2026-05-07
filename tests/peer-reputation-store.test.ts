/**
 * Unit tests — peer-reputation atomic store.
 *
 * Locks the load/save round trip, the version-refusal path, and the
 * empty-file behavior on missing path.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  loadPeerReputation,
  savePeerReputation,
} from '../src/infrastructure/peer-reputation-store.js';
import type { PeerReputationFile } from '../src/domain/peer-reputation.js';

const tmpHome = (): string => mkdtempSync(join(tmpdir(), 'wi-rep-'));

const sampleFile = (peerId: string): PeerReputationFile => ({
  version: 1,
  local_peer_id: peerId,
  updated_at: '2026-05-07T12:00:00.000Z',
  subjects: {
    'entity:product:lemlist': {
      key: 'entity:product:lemlist',
      label: 'lemlist',
      kind: 'entity',
      peer_scores: {
        'peer-A': {
          posterior_mean: 0.8,
          confidence: 0.5,
          rank_score: 0.4,
          weighted_review_count: 3,
          raw_review_count: 3,
          weighted_sum: 2.4,
          weighted_sum_squares: 1.92,
          first_review_at: '2026-05-01T00:00:00.000Z',
          last_review_at: '2026-05-07T00:00:00.000Z',
          last_answer_at: '2026-05-07T00:00:00.000Z',
          stale_after_days: 30,
          decay_half_life_days: 45,
          reviewers: {},
        },
      },
    },
  },
  reviews: [],
});

test('loadPeerReputation — returns empty file on missing path', async () => {
  const home = tmpHome();
  try {
    const r = await loadPeerReputation(home, '12D3KooWLocal');
    assert.ok(r.isOk());
    if (r.isOk()) {
      assert.equal(r.value.local_peer_id, '12D3KooWLocal');
      assert.equal(r.value.version, 1);
      assert.deepEqual(r.value.subjects, {});
      assert.deepEqual(r.value.reviews, []);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('savePeerReputation + loadPeerReputation — round trip', async () => {
  const home = tmpHome();
  try {
    const original = sampleFile('12D3KooWLocal');
    const saved = await savePeerReputation(home, original);
    assert.ok(saved.isOk());
    const loaded = await loadPeerReputation(home, '12D3KooWLocal');
    assert.ok(loaded.isOk());
    if (loaded.isOk()) {
      const f = loaded.value;
      // updated_at gets rewritten on save; everything else round-trips.
      assert.equal(f.local_peer_id, original.local_peer_id);
      assert.deepEqual(f.subjects, original.subjects);
      assert.deepEqual(f.reviews, original.reviews);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('loadPeerReputation — refuses unknown future version', async () => {
  const home = tmpHome();
  try {
    writeFileSync(join(home, 'peer-reputation.json'), JSON.stringify({
      version: 99,
      local_peer_id: 'p',
      updated_at: '2026-05-07T00:00:00.000Z',
      subjects: {},
      reviews: [],
    }));
    const r = await loadPeerReputation(home, 'p');
    assert.ok(r.isErr());
    if (r.isErr()) assert.equal(r.error.type, 'PeerReputationVersionError');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('loadPeerReputation — flags malformed JSON', async () => {
  const home = tmpHome();
  try {
    writeFileSync(join(home, 'peer-reputation.json'), 'not-json{{{');
    const r = await loadPeerReputation(home, 'p');
    assert.ok(r.isErr());
    if (r.isErr()) assert.equal(r.error.type, 'PeerReputationReadError');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('loadPeerReputation — flags missing required fields', async () => {
  const home = tmpHome();
  try {
    writeFileSync(join(home, 'peer-reputation.json'), JSON.stringify({
      version: 1,
      // missing local_peer_id, updated_at, subjects, reviews
    }));
    const r = await loadPeerReputation(home, 'p');
    assert.ok(r.isErr());
    if (r.isErr()) assert.equal(r.error.type, 'PeerReputationReadError');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('savePeerReputation — atomic via temp+rename (no torn writes)', async () => {
  const home = tmpHome();
  try {
    const original = sampleFile('p');
    await savePeerReputation(home, original);
    const path = join(home, 'peer-reputation.json');
    const raw = readFileSync(path, 'utf8');
    // The result must be valid JSON — never a partial write.
    const parsed = JSON.parse(raw);
    assert.equal(parsed.version, 1);
    assert.equal(parsed.local_peer_id, 'p');
    assert.ok(parsed.subjects['entity:product:lemlist']);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
