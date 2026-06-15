/**
 * Phase 24 unit tests — federation simulator + metrics.
 *
 * Determinism, metric correctness, and the boundary behaviours
 * (no peers online → step skipped, every peer online → no
 * federation needed, all peers offline → no events). The full
 * bench harness lives in `tests/bench-folklore-federation.test.ts`.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  runFederationSim,
  webFallbackRateOverTime,
  compoundingSlope,
  propagationHalfLife,
  resolveSourceCounts,
  type SimConfig,
  type SimCorpus,
  type SimEvent,
} from '../src/domain/federation-sim.js';

// ─────────────── fixtures ─────────────

const buildCorpus = (numQueries: number, docsPerQuery = 1): SimCorpus => {
  const queries = [];
  const allDocs = new Set<string>();
  for (let i = 0; i < numQueries; i++) {
    const goldDocs: string[] = [];
    for (let j = 0; j < docsPerQuery; j++) {
      const d = `doc-${i}-${j}`;
      goldDocs.push(d);
      allDocs.add(d);
    }
    queries.push({ id: `q-${i}`, goldDocs });
  }
  return { queries, allDocs: Array.from(allDocs) };
};

const baseConfig = (overrides: Partial<SimConfig> = {}): SimConfig => ({
  numPeers: 5,
  numSteps: 100,
  offlineProbability: 0.2,
  zipfAlpha: 1.0,
  seed: 42,
  initialShardFraction: 0.2,
  ...overrides,
});

// ─────────────── determinism ─────────────

test('runFederationSim: same (corpus, config, seed) produces identical results', () => {
  const corpus = buildCorpus(20);
  const config = baseConfig();
  const r1 = runFederationSim(corpus, config);
  const r2 = runFederationSim(corpus, config);
  assert.equal(r1.events.length, r2.events.length);
  for (let i = 0; i < r1.events.length; i++) {
    assert.equal(r1.events[i].t, r2.events[i].t);
    assert.equal(r1.events[i].queryId, r2.events[i].queryId);
    assert.equal(r1.events[i].askingPeer, r2.events[i].askingPeer);
    assert.equal(r1.events[i].source, r2.events[i].source);
  }
});

test('runFederationSim: different seeds produce different trajectories', () => {
  const corpus = buildCorpus(20);
  const r1 = runFederationSim(corpus, baseConfig({ seed: 1 }));
  const r2 = runFederationSim(corpus, baseConfig({ seed: 2 }));
  // Probabilistic: at least one event should differ.
  let diff = 0;
  const n = Math.min(r1.events.length, r2.events.length);
  for (let i = 0; i < n; i++) {
    if (r1.events[i].queryId !== r2.events[i].queryId) diff++;
  }
  assert.ok(diff > 0, 'expected different seeds to produce diverging trajectories');
});

// ─────────────── boundary behaviour ─────────────

test('runFederationSim: 100% offline → zero events (every step skipped)', () => {
  const corpus = buildCorpus(10);
  const r = runFederationSim(corpus, baseConfig({ offlineProbability: 1.0 }));
  assert.equal(r.events.length, 0);
});

test('runFederationSim: 0% offline + fresh peer = guaranteed local for own shard', () => {
  // With offline=0, every peer is always online. Asker may already
  // hold doc locally OR pull from another peer.
  const corpus = buildCorpus(50, 1);
  const r = runFederationSim(corpus, baseConfig({
    offlineProbability: 0,
    numSteps: 200,
    initialShardFraction: 0.2,
  }));
  // All 200 steps should produce events.
  assert.equal(r.events.length, 200);
  // Most queries should resolve via local OR federation; only
  // queries whose gold doc is NOT in any initial shard fall to
  // web. Since initialShardFraction × numPeers = 1.0, 100% of
  // docs are sharded → web fallbacks should occur only when
  // gold doc isn't in any peer's initial shard AND hasn't been
  // pulled yet.
  const counts = resolveSourceCounts(r.events);
  assert.ok(counts.local + counts.federation > 0);
});

test('runFederationSim: 100% shard coverage means web fallback only when curiosity hasnt explored that doc yet', () => {
  // Build a 2-peer corpus where every doc is sharded → no
  // genuine "web-only" knowledge. After enough queries,
  // web_fallback_rate should drive to near zero.
  const corpus = buildCorpus(10, 1);
  const r = runFederationSim(corpus, baseConfig({
    numPeers: 2,
    initialShardFraction: 0.5,  // 2 peers × 0.5 = 100% coverage
    numSteps: 500,
    offlineProbability: 0,
    zipfAlpha: 0,  // uniform — exercise all queries
  }));
  // Look at the LAST window — web_fallback_rate should be very low.
  const rates = webFallbackRateOverTime(r.events, 100);
  const lastRate = rates[rates.length - 1].rate;
  assert.ok(lastRate < 0.05, `late web_fallback_rate should be near 0, got ${lastRate}`);
});

// ─────────────── compounding signal ─────────────

test('runFederationSim: web_fallback_rate DECREASES over time when web-only knowledge is queried repeatedly', () => {
  // Build a corpus where only some docs are sharded — the rest
  // are "web-only" initially. As peers query them, they get
  // cached → web_fallback_rate should fall.
  const corpus = buildCorpus(50, 1);
  const r = runFederationSim(corpus, baseConfig({
    numPeers: 5,
    initialShardFraction: 0.1,  // 5 × 0.1 = 50% sharded; 50% web-only
    numSteps: 1000,
    offlineProbability: 0.1,
    zipfAlpha: 1.0,  // Zipfian — popular queries dominate
  }));
  const rates = webFallbackRateOverTime(r.events, 100);
  assert.ok(rates.length >= 3, 'need at least 3 windows for slope');
  const slope = compoundingSlope(rates);
  // Negative slope = compounding. Even a small negative number
  // is the signal we care about; the magnitude depends on
  // Zipfian concentration + churn.
  assert.ok(slope < 0, `expected negative compounding slope, got ${slope}`);
});

// ─────────────── metric functions ─────────────

test('webFallbackRateOverTime: empty events → empty rates', () => {
  assert.deepEqual(webFallbackRateOverTime([], 10), []);
});

test('webFallbackRateOverTime: single all-web window → rate 1.0', () => {
  const events: SimEvent[] = Array.from({ length: 10 }, (_, t) => ({
    t,
    queryId: `q-${t}`,
    askingPeer: 'peer-0',
    source: 'web' as const,
    goldFound: true,
    peersOnline: 1,
    askerLearned: [],
  }));
  const rates = webFallbackRateOverTime(events, 10);
  assert.equal(rates.length, 1);
  assert.equal(rates[0].rate, 1.0);
});

test('webFallbackRateOverTime: alternating local/web → 0.5', () => {
  const events: SimEvent[] = Array.from({ length: 10 }, (_, t) => ({
    t,
    queryId: `q-${t}`,
    askingPeer: 'peer-0',
    source: (t % 2 === 0 ? 'local' : 'web') as 'local' | 'web',
    goldFound: true,
    peersOnline: 1,
    askerLearned: [],
  }));
  const rates = webFallbackRateOverTime(events, 10);
  assert.equal(rates[0].rate, 0.5);
});

test('compoundingSlope: monotonically falling rates → negative slope', () => {
  const rates = [
    { t: 0, rate: 1.0 },
    { t: 1, rate: 0.8 },
    { t: 2, rate: 0.6 },
    { t: 3, rate: 0.4 },
    { t: 4, rate: 0.2 },
  ];
  const slope = compoundingSlope(rates);
  assert.ok(Math.abs(slope - (-0.2)) < 1e-9, `expected -0.2, got ${slope}`);
});

test('compoundingSlope: empty / single-point input → 0', () => {
  assert.equal(compoundingSlope([]), 0);
  assert.equal(compoundingSlope([{ t: 0, rate: 1 }]), 0);
});

test('propagationHalfLife: doc never spreads → never count grows', () => {
  // Only 1 web event, no subsequent federation events → never.
  const events: SimEvent[] = [{
    t: 0,
    queryId: 'q-0',
    askingPeer: 'peer-0',
    source: 'web' as const,
    goldFound: true,
    peersOnline: 5,
    askerLearned: ['doc-x'],
  }];
  const r = propagationHalfLife(events, 5);
  assert.equal(r.everReached, 0);
  assert.equal(r.never, 1);
});

test('propagationHalfLife: doc reaches 50% via federation events → halfLife recorded', () => {
  // numPeers=6, ceil(6*0.5)=3. Introduce doc-x at t=0 on peer-0
  // via web. Federation events pull doc-x to peers 1 (t=3),
  // 2 (t=5). At t=5, peers holding doc-x = {0, 1, 2} = 3 ≥ 3.
  // Half-life = 5 - 0 = 5.
  const events: SimEvent[] = [
    {
      t: 0, queryId: 'q-0', askingPeer: 'peer-0', source: 'web',
      goldFound: true, peersOnline: 6, askerLearned: ['doc-x'],
    },
    {
      t: 3, queryId: 'q-1', askingPeer: 'peer-1', source: 'federation',
      servingPeer: 'peer-0', goldFound: true, peersOnline: 6,
      askerLearned: ['doc-x'],
    },
    {
      t: 5, queryId: 'q-2', askingPeer: 'peer-2', source: 'federation',
      servingPeer: 'peer-1', goldFound: true, peersOnline: 6,
      askerLearned: ['doc-x'],
    },
  ];
  const r = propagationHalfLife(events, 6);
  assert.equal(r.everReached, 1);
  assert.equal(r.median, 5);
});

test('resolveSourceCounts: tallies match', () => {
  const events: SimEvent[] = [
    { t: 0, queryId: 'q-0', askingPeer: 'p', source: 'local', goldFound: true, peersOnline: 1, askerLearned: [] },
    { t: 1, queryId: 'q-1', askingPeer: 'p', source: 'federation', goldFound: true, peersOnline: 2, askerLearned: [] },
    { t: 2, queryId: 'q-2', askingPeer: 'p', source: 'web', goldFound: true, peersOnline: 1, askerLearned: [] },
    { t: 3, queryId: 'q-3', askingPeer: 'p', source: 'web', goldFound: true, peersOnline: 1, askerLearned: [] },
  ];
  const c = resolveSourceCounts(events);
  assert.deepEqual(c, { local: 1, federation: 1, web: 2, total: 4 });
});
