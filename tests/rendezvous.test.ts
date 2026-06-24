// DISC-04 — public-DHT rendezvous unit tests. Covers the deterministic CID
// (the whole discovery scheme breaks if two nodes derive different keys), the
// opt-in config default, and one tick of provide + findProviders + dial with a
// mock DHT (no real libp2p node needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CID } from 'multiformats/cid';

import {
  folkloreRendezvousCid,
  rendezvousTick,
  nextRendezvousDelay,
  RENDEZVOUS_INTERVAL_MS,
  RENDEZVOUS_SEARCH_INTERVAL_MS,
  RENDEZVOUS_SEARCH_BACKOFF_MAX_MS,
  type RendezvousCadence,
  type RendezvousNode,
} from '../src/infrastructure/rendezvous.ts';
import { loadConfig } from '../src/infrastructure/config-loader.ts';

// Stable value pinned so a namespace change is a loud, intentional test failure
// (it forks the discovery network — never an accident).
const GOLDEN_CID = 'bafkreieeoswforjgdd34ql5ylqg422gd425gmfid7dslsdcsipz3cuptnm';

type FakeId = { toString: () => string; equals: (o: { toString(): string }) => boolean };
const mkId = (s: string): FakeId => ({ toString: () => s, equals: (o) => o.toString() === s });

test('folkloreRendezvousCid is deterministic and matches the golden value', async () => {
  const a = await folkloreRendezvousCid();
  const b = await folkloreRendezvousCid();
  assert.equal(a.toString(), b.toString(), 'two derivations must be identical');
  assert.equal(a.toString(), GOLDEN_CID, 'CID must not drift (would fork the network)');
  assert.equal(a.code, 0x55, 'codec must be raw (0x55)');
  assert.equal(a.multihash.code, 0x12, 'multihash must be sha256 (0x12)');
});

test('dht.public defaults to true (zero-infra discovery on by default)', async () => {
  const cfg = await loadConfig('/nonexistent/config.yaml');
  assert.equal(cfg.isOk(), true);
  if (cfg.isOk()) {
    assert.equal(cfg.value.peer.dht.public, true, 'public IPFS DHT discovery is on by default — peers found with no folklore-owned seed');
    assert.equal(cfg.value.peer.dht.enabled, true, 'DHT enabled by default');
  }
});

test('rendezvousTick provides, then dials only new non-self peers', async () => {
  const self = mkId('peer-self');
  const already = mkId('peer-connected');
  const fresh = mkId('peer-new');

  let provided = false;
  const dialed: string[] = [];

  const node: RendezvousNode = {
    peerId: self as unknown as RendezvousNode['peerId'],
    getPeers: () => [already] as unknown as ReturnType<RendezvousNode['getPeers']>,
    dial: (async (id: { toString(): string }) => { dialed.push(id.toString()); return undefined; }) as unknown as RendezvousNode['dial'],
    services: {
      dht: {
        // eslint-disable-next-line require-yield
        async *provide() { provided = true; },
        async *findProviders() {
          yield {
            name: 'PROVIDER',
            providers: [
              { id: self }, { id: already }, { id: fresh },
            ] as unknown as readonly { id: FakeId }[],
          };
        },
      },
    },
  } as unknown as RendezvousNode;

  const cid = await folkloreRendezvousCid();
  const count = await rendezvousTick({ node, log: () => {} }, cid);

  assert.equal(provided, true, 'must announce itself via provide()');
  assert.deepEqual(dialed, ['peer-new'], 'dials only the fresh peer (skips self + already-connected)');
  assert.equal(count, 1);
});

test('nextRendezvousDelay: searches fast while peerless, relaxes once connected', () => {
  const cadence: RendezvousCadence = {
    steadyMs: RENDEZVOUS_INTERVAL_MS,
    searchMs: RENDEZVOUS_SEARCH_INTERVAL_MS,
    backoffMaxMs: RENDEZVOUS_SEARCH_BACKOFF_MAX_MS,
  };
  // first peerless round → base search interval (fast, not the 5-min steady)
  assert.equal(nextRendezvousDelay(0, 0, cadence), RENDEZVOUS_SEARCH_INTERVAL_MS);
  // exponential backoff on subsequent peerless rounds
  assert.equal(nextRendezvousDelay(0, 1, cadence), RENDEZVOUS_SEARCH_INTERVAL_MS * 2);
  assert.equal(nextRendezvousDelay(0, 2, cadence), RENDEZVOUS_SEARCH_INTERVAL_MS * 4);
  // backoff is capped — never spins the DHT faster than the cap allows
  assert.equal(nextRendezvousDelay(0, 999, cadence), RENDEZVOUS_SEARCH_BACKOFF_MAX_MS);
  // any connected peer → relax to the steady refresh, backoff irrelevant
  assert.equal(nextRendezvousDelay(1, 5, cadence), RENDEZVOUS_INTERVAL_MS);
  assert.equal(nextRendezvousDelay(3, 0, cadence), RENDEZVOUS_INTERVAL_MS);
});

test('nextRendezvousDelay: search interval is much shorter than steady (fresh node finds peers fast)', () => {
  assert.ok(RENDEZVOUS_SEARCH_INTERVAL_MS < RENDEZVOUS_INTERVAL_MS, 'search faster than steady');
  assert.ok(RENDEZVOUS_SEARCH_BACKOFF_MAX_MS <= RENDEZVOUS_INTERVAL_MS, 'backoff cap ≤ steady refresh');
});

test('rendezvousTick is a no-op without a dht service', async () => {
  const node = {
    peerId: mkId('x') as unknown,
    getPeers: () => [],
    dial: async () => undefined,
    services: {},
  } as unknown as RendezvousNode;
  const count = await rendezvousTick({ node, log: () => {} }, CID.parse(GOLDEN_CID));
  assert.equal(count, 0);
});
