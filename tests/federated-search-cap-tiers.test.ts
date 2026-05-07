/**
 * Unit tests — federated-search top-N cap + rank-weighted timeout
 * tier (the load-spreading mechanisms from
 * docs/peer-reputation-load-spreading.md §3 / §7).
 *
 * Covers:
 *   - maxPeers = N caps fan-out to first N from peerOrder
 *   - peerOrder runs BEFORE the cap (rank-aware selection)
 *   - lowRankTimeoutMs applies only to peers beyond topTierCount
 *   - default behaviour (no params) == ask every peer at full budget
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { okAsync } from 'neverthrow';

import { runFederatedSearch } from '../src/application/federated-search.js';
import type { Libp2p } from '@libp2p/interface';
import type { VectorIndex } from '../src/infrastructure/vector-index.js';
import type { Vector, VectorRecord, Match } from '../src/domain/vectors.js';
import type { PeerMatch, SearchRequest } from '../src/infrastructure/search-sync.js';
import type { SearchError } from '../src/domain/errors.js';
import { ResultAsync } from 'neverthrow';

const buildFakeVectorIndex = (records: readonly VectorRecord[]): VectorIndex => {
  const byId = new Map(records.map((r) => [r.node_id, r]));
  return {
    upsert: () => okAsync(undefined),
    searchGlobal: () => okAsync<Match[], never>([]),
    searchByRoom: () => okAsync<Match[], never>([]),
    searchHybrid: () => okAsync<Match[], never>([]),
    searchByRoomHybrid: () => okAsync<Match[], never>([]),
    all: () => okAsync(Array.from(byId.values())),
    size: () => byId.size,
    close: () => undefined,
  } as unknown as VectorIndex;
};

const buildFakeNode = (peerIds: readonly string[]): Libp2p =>
  ({ getPeers: () => peerIds.map((id) => ({ toString: () => id })) }) as unknown as Libp2p;

const buildCapturingStream = (calls: string[]) =>
  (_node: Libp2p, peerId: string, _req: SearchRequest): ResultAsync<readonly PeerMatch[], SearchError> => {
    calls.push(peerId);
    return okAsync<readonly PeerMatch[], SearchError>([]);
  };

const fakeEmbedding = new Float32Array(384);

// ─────────────── max-peers cap ────────────

test('maxPeers caps the fan-out to top-N from peerOrder', async () => {
  const calls: string[] = [];
  await runFederatedSearch(
    {
      node: buildFakeNode(['peerD', 'peerC', 'peerB', 'peerA']),
      vectorIndex: buildFakeVectorIndex([]),
      openStream: buildCapturingStream(calls),
    },
    {
      embedding: fakeEmbedding,
      k: 3,
      // peerOrder reverses to put peerA first
      peerOrder: (peers) => [...peers].reverse(),
      maxPeers: 2,
    },
  );
  // Only the top 2 from the ordered list should be queried.
  assert.deepEqual(calls.sort(), ['peerA', 'peerB']);
});

test('without maxPeers, every peer is queried (default behaviour)', async () => {
  const calls: string[] = [];
  await runFederatedSearch(
    {
      node: buildFakeNode(['peerA', 'peerB', 'peerC']),
      vectorIndex: buildFakeVectorIndex([]),
      openStream: buildCapturingStream(calls),
    },
    { embedding: fakeEmbedding, k: 3 },
  );
  assert.deepEqual(calls.sort(), ['peerA', 'peerB', 'peerC']);
});

// ─────────────── tier-aware timeouts ──────

test('lowRankTimeoutMs applies only to peers beyond topTierCount', async () => {
  // Two peers — first one resolves slow, second one resolves fast.
  // topTierCount=1 means peer index 0 gets the full 2000 ms; peer
  // index 1 gets the tighter 50 ms tier-2 budget. The slow peer at
  // index 1 should hit the tier-2 timeout.
  const slowResponses = new Map<string, number>([
    ['peerA', 0],     // resolves immediately
    ['peerB', 500],   // resolves after 500ms
  ]);
  const buildSlowStream =
    (_node: Libp2p, peerId: string, _req: SearchRequest): ResultAsync<readonly PeerMatch[], SearchError> => {
      const delayMs = slowResponses.get(peerId) ?? 0;
      return ResultAsync.fromPromise(
        new Promise<readonly PeerMatch[]>((resolve) => {
          setTimeout(() => resolve([]), delayMs);
        }),
        () => ({} as SearchError),
      );
    };

  const result = await runFederatedSearch(
    {
      node: buildFakeNode(['peerA', 'peerB']),
      vectorIndex: buildFakeVectorIndex([]),
      openStream: buildSlowStream,
    },
    {
      embedding: fakeEmbedding,
      k: 3,
      perPeerTimeoutMs: 2000,
      lowRankTimeoutMs: 50,
      topTierCount: 1,
    },
  );

  // peerA (index 0) responds → status='ok'
  // peerB (index 1) is slow + tier-2 budget expires → status='timeout'
  // Telemetry should reflect 1 timeout from the tier-2 demotion.
  assert.equal(result.peers_timed_out, 1);
});
