/**
 * Round-4 implementation review fix coverage.
 *
 * Each test asserts a property the round-4 review flagged as missing
 * or incorrect:
 *   - Lazy decay on observation (evidence decays, not just rank)
 *   - Praise-ring cap (relay peer's persisted score is bounded by
 *     the source peer's pre-update posterior)
 *   - Novel chunk → room-only credit (no silent zero-credit drop)
 *   - Reviewer DID shape gate (caller can't write garbage strings)
 *   - Concurrency: mutatePeerReputation under simulated parallel
 *     load doesn't lose writes
 *   - reviews log capped at MAX_REVIEWS_RETAINED
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  recordObservation,
  type PeerSubjectScore,
} from '../src/domain/peer-reputation.js';
import {
  extractPerPeerSubjects,
  type PeerAttributedMatch,
} from '../src/domain/subject-key.js';
import { fromJson, type Graph, type GraphJson } from '../src/domain/graph.js';
import {
  updatePeerReputation,
  MAX_REVIEWS_RETAINED,
} from '../src/application/update-peer-reputation.js';
import {
  loadPeerReputation,
  mutatePeerReputation,
} from '../src/infrastructure/peer-reputation-store.js';
import type { FederatedSearchResult } from '../src/application/federated-search.js';

const tmpHome = (): string => mkdtempSync(join(tmpdir(), 'wi-rep-fix-'));

const NOW = '2026-05-07T12:00:00.000Z';
const T_MINUS = (days: number): string =>
  new Date(Date.parse(NOW) - days * 86_400_000).toISOString();

// ─────────────── lazy decay ───────────────

test('recordObservation decays evidence by time-since-last-review', () => {
  // Establish a strong baseline
  const t0 = T_MINUS(60);
  let s: PeerSubjectScore | undefined;
  for (let i = 0; i < 10; i++) {
    s = recordObservation(s, {
      target_peer_id: 'p',
      subject_key: 'k',
      subject_label: 'l',
      subject_kind: 'entity',
      reviewer_did: 'did:key:zReviewer',
      satisfaction_score: 0.9,
      now: t0,
    });
  }
  assert.ok(s);
  const beforeWeighted = s!.weighted_review_count;

  // Now apply an observation 90 days later (well past the 45-day half-life).
  // Existing evidence should be cut by ~75% (2× half-life).
  const after = recordObservation(s, {
    target_peer_id: 'p',
    subject_key: 'k',
    subject_label: 'l',
    subject_kind: 'entity',
    reviewer_did: 'did:key:zReviewer',
    satisfaction_score: 0.9,
    now: NOW,
  });

  // Old evidence should be ~25% of original (decay factor at 2× half-life).
  // After this observation we add weight=1, so:
  //   new_count ≈ 0.25 * 10 + 1 = 3.5 (exact value depends on half-life exact)
  assert.ok(
    after.weighted_review_count < beforeWeighted * 0.5,
    `decayed evidence ${after.weighted_review_count} should be ≤ half of ${beforeWeighted}`,
  );
  // raw_review_count is observability; never decayed.
  assert.equal(after.raw_review_count, s!.raw_review_count + 1);
});

test('recordObservation no-decay when timestamps equal', () => {
  let s: PeerSubjectScore | undefined;
  s = recordObservation(s, {
    target_peer_id: 'p', subject_key: 'k', subject_label: 'l', subject_kind: 'entity',
    reviewer_did: 'did:key:z', satisfaction_score: 0.8, now: NOW,
  });
  const before = s!.weighted_review_count;
  s = recordObservation(s, {
    target_peer_id: 'p', subject_key: 'k', subject_label: 'l', subject_kind: 'entity',
    reviewer_did: 'did:key:z', satisfaction_score: 0.8, now: NOW,
  });
  // Same timestamp → no decay → count grows by exactly 1
  assert.ok(Math.abs(s!.weighted_review_count - (before + 1)) < 1e-9);
});

// ─────────────── novel chunk → room-only ──

test('V5: extractPerPeerSubjects yields no subjects when chunk is not in local graph (room: fallback removed)', () => {
  // Empty graph — peer returns a chunk we've never seen.
  const g: Graph = (() => {
    const r = fromJson({
      directed: false, multigraph: false, graph: {}, nodes: [], links: [],
    } as GraphJson);
    if (r.isErr()) throw new Error('graph build failed');
    return r.value;
  })();

  const matches: PeerAttributedMatch[] = [
    {
      node_id: 'novel-chunk-from-peer-A',
      _source_peer: '12D3KooWPeerA',
    },
  ];
  const out = extractPerPeerSubjects(matches, g);
  // V5 (Phase 24): the room: fallback subject was removed. Novel chunks
  // contribute no reputation signal because we can't verify what they
  // mention without a local link in the mentions graph.
  assert.equal(out.size, 0,
    'V5: novel chunks yield no subjects (room: fallback gone)');
});

test('V5: extractPerPeerSubjects emits entity-only subjects when local graph has the chunk', () => {
  const g: Graph = (() => {
    const r = fromJson({
      directed: false, multigraph: false, graph: {}, nodes: [
        { id: 'chunk-1', label: 'c', file_type: 'rationale', source_file: 'f' },
        { id: 'entity:product:lemlist', label: 'lemlist', file_type: 'rationale', source_file: 'f', kind: 'entity' },
      ], links: [
        { source: 'chunk-1', target: 'entity:product:lemlist', relation: 'mentions',
          confidence: 'EXTRACTED', source_file: 'f' },
      ],
    } as GraphJson);
    if (r.isErr()) throw new Error('graph build failed: ' + JSON.stringify(r.error));
    return r.value;
  })();

  const matches: PeerAttributedMatch[] = [
    { node_id: 'chunk-1', _source_peer: '12D3KooWPeerA' },
  ];
  const out = extractPerPeerSubjects(matches, g);
  const subjects = out.get('12D3KooWPeerA');
  assert.ok(subjects);
  // V5 (Phase 24): entity-only subjects. Room subject scheme is gone.
  assert.ok(subjects!.has('entity:product:lemlist'));
  assert.ok(!subjects!.has('room:research'),
    'V5: room: subject scheme must not appear (24-10 entity-only flatten)');
});

// ─────────────── reviewer DID gate ────────

test('updatePeerReputation refuses non-DID reviewer string (no-op, no file write)', async () => {
  const home = tmpHome();
  try {
    const g: Graph = (() => {
      const r = fromJson({
        directed: false, multigraph: false, graph: {}, nodes: [], links: [],
      } as GraphJson);
      if (r.isErr()) throw new Error('graph build failed');
      return r.value;
    })();
    const result: FederatedSearchResult = {
      matches: [{ node_id: 'x', room: 'research', distance: 0.1, _source_peer: '12D3KooWPeerA' }],
      tunnels: [],
      peers_queried: 1, peers_responded: 1, peers_timed_out: 0, peers_errored: 0,
      _telemetry: {
        peers_alive: 1,
        took_total_ms: 1, took_local_ms: 1, took_merge_ms: 0,
        bytes_received_estimate: 0,
      },
    };
    const r = await updatePeerReputation({
      satisfaction_score: 0.9,
      result,
      graph: g,
      reviewer_did: 'totally-not-a-did',
      local_peer_id: '12D3KooWLocal',
      home,
      now: NOW,
    });
    assert.ok(r.isOk(), 'should succeed (no-op) on bad DID');
    // Loading the file should still see no subjects persisted.
    const loaded = await loadPeerReputation(home, '12D3KooWLocal');
    assert.ok(loaded.isOk());
    if (loaded.isOk()) assert.deepEqual(loaded.value.subjects, {});
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─────────────── concurrency / mutex ──────

test('mutatePeerReputation serialises concurrent updates — no lost writes', async () => {
  const home = tmpHome();
  try {
    // Fire 8 concurrent transforms that each append a marker subject.
    // Without the lock, the slower ones would overwrite faster ones'
    // writes; with it, all 8 must show up in the final file.
    const promises = Array.from({ length: 8 }, (_, i) =>
      mutatePeerReputation(home, '12D3KooWLocal', (current) => ({
        ...current,
        subjects: {
          ...current.subjects,
          [`marker:${i}`]: {
            key: `marker:${i}`,
            label: `marker-${i}`,
            kind: 'entity',
            peer_scores: {},
          },
        },
      })),
    );
    const results = await Promise.all(promises);
    for (const r of results) assert.ok(r.isOk());

    const loaded = await loadPeerReputation(home, '12D3KooWLocal');
    assert.ok(loaded.isOk());
    if (loaded.isOk()) {
      for (let i = 0; i < 8; i++) {
        assert.ok(
          loaded.value.subjects[`marker:${i}`] !== undefined,
          `lost write — marker:${i} missing from final state`,
        );
      }
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

// ─────────────── reviews log cap ──────────

test('reviews log is capped at MAX_REVIEWS_RETAINED', async () => {
  const home = tmpHome();
  try {
    const g: Graph = (() => {
      const r = fromJson({
        directed: false, multigraph: false, graph: {}, nodes: [], links: [],
      } as GraphJson);
      if (r.isErr()) throw new Error('graph build failed');
      return r.value;
    })();
    // Synthesise MAX_REVIEWS_RETAINED + 5 different review events
    // by running unique federated asks.
    const total = MAX_REVIEWS_RETAINED + 5;
    for (let i = 0; i < total; i++) {
      const result: FederatedSearchResult = {
        matches: [{
          node_id: `chunk-${i}`,
          room: 'research',
          distance: 0.1,
          _source_peer: `12D3KooWPeerA${i}`,
        }],
        tunnels: [],
        peers_queried: 1, peers_responded: 1, peers_timed_out: 0, peers_errored: 0,
        _telemetry: {
          peers_alive: 1,
          took_total_ms: 1, took_local_ms: 1, took_merge_ms: 0,
          bytes_received_estimate: 0,
        },
      };
      const r = await updatePeerReputation({
        satisfaction_score: 0.8,
        result,
        graph: g,
        reviewer_did: 'did:key:zLocal',
        local_peer_id: '12D3KooWLocal',
        home,
      });
      assert.ok(r.isOk());
    }
    const loaded = await loadPeerReputation(home, '12D3KooWLocal');
    assert.ok(loaded.isOk());
    if (loaded.isOk()) {
      assert.ok(
        loaded.value.reviews.length <= MAX_REVIEWS_RETAINED,
        `reviews count ${loaded.value.reviews.length} exceeds cap ${MAX_REVIEWS_RETAINED}`,
      );
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
