/**
 * Unit tests — buildOrderFromFile + buildReputationPeerOrder.
 *
 * Locks the contract:
 *   - Empty rep file → identity ordering (cold-start safe)
 *   - Single subject → known peers ranked, unknowns last
 *   - Multi-subject query → max rank across candidate subjects
 *   - Epsilon-greedy with deterministic randomFn → predictable swap
 *   - Single-peer input is a no-op (epsilon doesn't fire)
 *   - Registry resolution: canonical id, alias, both fail-closed
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildOrderFromFile,
  EXPLORATION_EPSILON,
} from '../src/application/peer-order-builder.js';
import {
  type PeerReputationFile,
  type PeerSubjectScore,
} from '../src/domain/peer-reputation.js';
import type { EntityRegistry } from '../src/infrastructure/entity-registry.js';
import type { Entity } from '../src/domain/entity.js';

const NOW = '2026-05-07T12:00:00.000Z';

const fakeRegistry = (entities: ReadonlyMap<string, Entity>): EntityRegistry => ({
  list: () => Array.from(entities.values()),
  getById: (id) => entities.get(id),
  resolve: (q) => {
    const lower = q.trim().toLowerCase();
    for (const e of entities.values()) {
      if (e.id === q) return e;
      if (e.label.toLowerCase() === lower) return e;
      for (const a of e.aliases) {
        if (a.toLowerCase() === lower) return e;
      }
    }
    return undefined;
  },
  register: () => { throw new Error('not used'); },
  remove: () => false,
  touch: () => undefined,
  touchMany: () => 0,
});

const score = (sum: number, count: number, last_answer_at: string): PeerSubjectScore => ({
  posterior_mean: 0,
  confidence: 0,
  rank_score: 0,
  weighted_sum: sum,
  weighted_sum_squares: 0,
  weighted_review_count: count,
  raw_review_count: count,
  first_review_at: last_answer_at,
  last_review_at: last_answer_at,
  last_answer_at,
  stale_after_days: 30,
  decay_half_life_days: 30,
  reviewers: {},
});

const baseFile = (): PeerReputationFile => ({
  version: 1,
  local_peer_id: 'localPeer',
  updated_at: NOW,
  subjects: {},
  reviews: [],
});

// ─────────────── cold-start ───────────────

test('empty rep file returns the input order unchanged', () => {
  const order = buildOrderFromFile(baseFile(), {
    query: 'lemlist',
    room: 'research',
    registry: fakeRegistry(new Map()),
  });
  const peers = ['peerA', 'peerB', 'peerC'];
  assert.deepEqual(order(peers), peers);
});

test('single peer input is a no-op', () => {
  const order = buildOrderFromFile(baseFile(), {
    query: 'lemlist',
    room: 'research',
    registry: fakeRegistry(new Map()),
  });
  assert.deepEqual(order(['onlyPeer']), ['onlyPeer']);
});

test('zero peer input is a no-op', () => {
  const order = buildOrderFromFile(baseFile(), {
    query: 'lemlist',
    room: 'research',
    registry: fakeRegistry(new Map()),
  });
  assert.deepEqual(order([]), []);
});

// ─────────────── room-only ranking ────────

test('room-keyed reputation orders known peers ahead of unknowns', () => {
  const file: PeerReputationFile = {
    ...baseFile(),
    subjects: {
      'room:research': {
        key: 'room:research',
        label: 'research',
        kind: 'room',
        peer_scores: {
          'peerA': score(8, 10, NOW),
          'peerB': score(3, 5, NOW),
          // peerC has no observations → unknown
        },
      },
    },
  };
  const order = buildOrderFromFile(file, {
    query: 'unknown query',
    room: 'research',
    registry: fakeRegistry(new Map()),
    randomFn: () => 1,             // disable epsilon-greedy swap
  });
  const out = order(['peerC', 'peerA', 'peerB']);
  // peerA must be first (highest evidence), peerC last (unknown).
  assert.equal(out[0], 'peerA');
  assert.equal(out[out.length - 1], 'peerC');
});

// ─────────────── entity-keyed ranking ─────

test('entity-keyed query resolves alias and ranks by entity rep', () => {
  const lemlist: Entity = {
    id: 'entity:product:lemlist',
    type: 'product',
    label: 'Lemlist',
    aliases: ['lemlist', 'lemlist.com'],
    kind: 'entity',
    created_at: NOW,
    last_seen: NOW,
    mention_count: 0,
  };
  const file: PeerReputationFile = {
    ...baseFile(),
    subjects: {
      'entity:product:lemlist': {
        key: 'entity:product:lemlist',
        label: 'Lemlist',
        kind: 'entity',
        peer_scores: {
          'lemlistExpert': score(20, 25, NOW),  // strong evidence
          'lurker': score(0.6, 1, NOW),           // weak evidence
        },
      },
    },
  };
  const order = buildOrderFromFile(file, {
    query: 'lemlist.com',           // alias — should resolve
    registry: fakeRegistry(new Map([[lemlist.id, lemlist]])),
    randomFn: () => 1,              // disable epsilon
  });
  const out = order(['lurker', 'lemlistExpert']);
  assert.equal(out[0], 'lemlistExpert');
});

// ─────────────── multi-subject (max rank) ─

test('multi-subject query takes max rank across entity + room', () => {
  const lemlist: Entity = {
    id: 'entity:product:lemlist',
    type: 'product',
    label: 'Lemlist',
    aliases: [],
    kind: 'entity',
    created_at: NOW,
    last_seen: NOW,
    mention_count: 0,
  };
  // peerA: weak on entity, strong on room  →  high MAX rank from room
  // peerB: strong on entity, weak on room  →  high MAX rank from entity
  // both should outrank unknowns; comparator just verifies neither
  // is null when one of the subjects has data on them.
  const file: PeerReputationFile = {
    ...baseFile(),
    subjects: {
      'entity:product:lemlist': {
        key: 'entity:product:lemlist', label: 'Lemlist', kind: 'entity',
        peer_scores: { 'peerB': score(15, 20, NOW) },
      },
      'room:research': {
        key: 'room:research', label: 'research', kind: 'room',
        peer_scores: { 'peerA': score(15, 20, NOW) },
      },
    },
  };
  const order = buildOrderFromFile(file, {
    query: 'lemlist',
    room: 'research',
    registry: fakeRegistry(new Map([[lemlist.id, lemlist]])),
    randomFn: () => 1,
  });
  const out = order(['unknownX', 'peerA', 'peerB']);
  // Both peerA and peerB rank ahead of unknownX.
  assert.notEqual(out[2], 'peerA');
  assert.notEqual(out[2], 'peerB');
  assert.equal(out[2], 'unknownX');
});

// ─────────────── epsilon-greedy ───────────

test('epsilon-greedy swaps top with random index when randomFn < EPSILON', () => {
  const file: PeerReputationFile = {
    ...baseFile(),
    subjects: {
      'room:research': {
        key: 'room:research', label: 'research', kind: 'room',
        peer_scores: {
          'topPeer': score(20, 25, NOW),
        },
      },
    },
  };
  // Deterministic: first randomFn call returns 0.05 (< EPSILON), so
  // we swap. Second returns 0.5 — index = floor(0.5 * 3) = 1.
  let calls = 0;
  const sequence = [0.05, 0.5];
  const order = buildOrderFromFile(file, {
    query: 'unknown',
    room: 'research',
    registry: fakeRegistry(new Map()),
    randomFn: () => sequence[calls++ % sequence.length],
  });
  const out = order(['topPeer', 'midPeer', 'bottomPeer']);
  // Without epsilon, topPeer would be at [0]. With swap-from-1,
  // midPeer moves to the front.
  assert.equal(out[0], 'midPeer');
});

test('epsilon-greedy is no-op when randomFn ≥ EPSILON', () => {
  const file: PeerReputationFile = {
    ...baseFile(),
    subjects: {
      'room:research': {
        key: 'room:research', label: 'research', kind: 'room',
        peer_scores: {
          'topPeer': score(20, 25, NOW),
        },
      },
    },
  };
  const order = buildOrderFromFile(file, {
    query: 'unknown',
    room: 'research',
    registry: fakeRegistry(new Map()),
    randomFn: () => EXPLORATION_EPSILON + 0.01,
  });
  const out = order(['midPeer', 'topPeer']);
  // No swap — topPeer naturally rises to index 0 by rank.
  assert.equal(out[0], 'topPeer');
});

// ─────────────── registry-throws guard ────

test('registry throws on resolve → falls through to room-only ranking', () => {
  const throwyRegistry: EntityRegistry = {
    list: () => [],
    getById: () => undefined,
    resolve: () => { throw new Error('alt impl boom'); },
    register: () => { throw new Error('not used'); },
    remove: () => false,
    touch: () => undefined,
    touchMany: () => 0,
  };
  const file: PeerReputationFile = {
    ...baseFile(),
    subjects: {
      'room:research': {
        key: 'room:research', label: 'research', kind: 'room',
        peer_scores: { 'peerA': score(10, 12, NOW) },
      },
    },
  };
  const order = buildOrderFromFile(file, {
    query: 'lemlist',
    room: 'research',
    registry: throwyRegistry,
    randomFn: () => 1,
  });
  const out = order(['unknownX', 'peerA']);
  assert.equal(out[0], 'peerA', 'registry throw must not break room-keyed ranking');
});
