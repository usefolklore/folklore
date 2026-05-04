/**
 * Unit tests — peer-pull telemetry scorer + formatter.
 *
 * These lock the v1 satisfaction math so future protocol-quality work
 * can iterate weights without silently shifting the agent-visible
 * surface.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  computeSatisfaction,
  ageInDays,
  type EnrichedMatch,
  type PeerPullTelemetry,
} from '../src/domain/peer-telemetry.js';
import { formatTelemetryBlock, formatTelemetryOneLine } from '../src/infrastructure/telemetry-formatter.js';

const DAY = 86_400_000;
const fixedNow = Date.parse('2026-04-29T12:00:00Z');

const mk = (overrides: Partial<EnrichedMatch>): EnrichedMatch => ({
  node_id: 'n',
  room: 'research',
  distance: 0.4,
  source_peer: null,
  also_from_peers: [],
  source_uri: 'https://example.com/doc',
  fetched_at: new Date(fixedNow - 1 * DAY).toISOString(),
  age_days: 1,
  stale_after_days: 7,
  has_signature: undefined,
  ...overrides,
});

// ─────────── ageInDays ────────────────────

test('ageInDays returns undefined on missing or malformed input', () => {
  assert.equal(ageInDays(undefined, fixedNow), undefined);
  assert.equal(ageInDays('not-a-date', fixedNow), undefined);
});

test('ageInDays computes positive day deltas, never negative', () => {
  const ts = new Date(fixedNow - 3 * DAY).toISOString();
  assert.equal(ageInDays(ts, fixedNow), 3);
  // Future timestamp — clamped to 0.
  const future = new Date(fixedNow + DAY).toISOString();
  assert.equal(ageInDays(future, fixedNow), 0);
});

// ─────────── scorer — empty + single-result ─

test('empty result set scores 0 with no reasons', () => {
  const s = computeSatisfaction([]);
  assert.equal(s.score, 0);
  assert.equal(s.fresh_count, 0);
  assert.equal(s.stale_count, 0);
  assert.deepEqual(s.reasons, []);
  assert.deepEqual(s.penalties, []);
});

test('single fresh provenance-rich result scores high', () => {
  const s = computeSatisfaction([
    mk({ distance: 0.15, age_days: 1, source_peer: 'peer-a', also_from_peers: ['peer-b'] }),
  ]);
  assert.ok(s.score >= 0.7, `expected high score, got ${s.score}`);
  assert.equal(s.fresh_count, 1);
  assert.equal(s.stale_count, 0);
  assert.equal(s.distinct_origins, 2);
  assert.ok(s.reasons.some((r) => r.includes('top hit very close')));
});

// ─────────── scorer — penalties ────────────

test('all-stale results trigger staleness penalty', () => {
  const stale = mk({ age_days: 30, stale_after_days: 7 });
  const s = computeSatisfaction([stale, { ...stale, node_id: 'b' }]);
  assert.equal(s.stale_count, 2);
  assert.equal(s.fresh_count, 0);
  assert.ok(s.penalties.some((p) => p.includes('more stale results than fresh')));
});

test('missing provenance on majority triggers penalty', () => {
  const m1 = mk({ source_uri: undefined, fetched_at: undefined, age_days: undefined });
  const m2 = mk({ node_id: 'b', source_uri: undefined, fetched_at: undefined, age_days: undefined });
  const m3 = mk({ node_id: 'c' }); // 1 of 3 has provenance
  const s = computeSatisfaction([m1, m2, m3]);
  assert.equal(s.missing_provenance_count, 2);
  assert.ok(s.penalties.some((p) => p.includes('majority of results lack source_uri')));
});

test('single origin (re-share) triggers consensus penalty', () => {
  const m = mk({ source_peer: 'peer-x', also_from_peers: [] });
  const s = computeSatisfaction([m]);
  assert.equal(s.distinct_origins, 1);
  assert.ok(s.penalties.some((p) => p.includes('single origin')));
});

test('semantic-adjacent only top hit (d > 1.5) penalises', () => {
  const m = mk({ distance: 1.7 });
  const s = computeSatisfaction([m]);
  assert.ok(s.penalties.some((p) => p.includes('semantically adjacent only')));
});

test('score is clamped to [0, 1]', () => {
  const garbage = mk({
    distance: 1.9,
    source_peer: 'peer-x',
    also_from_peers: [],
    source_uri: undefined,
    fetched_at: undefined,
    age_days: undefined,
    stale_after_days: undefined,
  });
  const s = computeSatisfaction([garbage, { ...garbage, node_id: 'b' }, { ...garbage, node_id: 'c' }]);
  assert.ok(s.score >= 0 && s.score <= 1);
});

// ─────────── formatter ─────────────────────

const sampleTelemetry: PeerPullTelemetry = {
  query: 'vector search sqlite',
  room: 'research',
  took_ms: 820,
  took_local_ms: 340,
  took_merge_ms: 80,
  bytes_received: 4280,
  result_count: 12,
  distinct_sources: 3,
  peers_alive: 6,
  peers_queried: 4,
  peers_responded: 2,
  peers_timed_out: 1,
  peers_errored: 1,
  satisfaction: {
    score: 0.78,
    fresh_count: 4,
    stale_count: 1,
    unsigned_count: 0,
    missing_provenance_count: 0,
    distinct_origins: 3,
    reasons: ['top hit very close'],
    penalties: [],
  },
  emitted_at: '2026-04-29T12:00:00Z',
};

test('formatTelemetryBlock renders all five lines plus borders', () => {
  const out = formatTelemetryBlock(sampleTelemetry);
  const lines = out.split('\n');
  assert.equal(lines.length, 7); // top + 5 + bottom
  assert.match(lines[0], /^─+ wellinformed peer pull/);
  assert.match(lines[1], /query.*vector search sqlite.*room=research/);
  assert.match(lines[2], /took.*820ms.*340ms local.*80ms merge/);
  assert.match(lines[3], /data.*4\.2 KB.*12 results.*3 unique sources/);
  assert.match(lines[4], /peers.*2\/4 responded.*6 alive.*1 timeout.*1 error/);
  assert.match(lines[5], /fit.*0\.78 satisfaction.*4 fresh.*1 stale.*0 unsigned/);
  assert.match(lines[6], /^─+$/);
});

test('formatTelemetryOneLine is a compact single line', () => {
  const out = formatTelemetryOneLine(sampleTelemetry);
  assert.equal(out.split('\n').length, 1);
  assert.match(out, /peer-pull.*820ms.*12 hits.*2\/4 peers.*sat=0\.78/);
});

test('formatTelemetryBlock handles long queries with truncation', () => {
  const long = { ...sampleTelemetry, query: 'a'.repeat(200) };
  const out = formatTelemetryBlock(long);
  assert.ok(out.includes('…'));
  // Each line stays bounded — no 200-char monstrosity
  for (const l of out.split('\n')) {
    assert.ok(l.length < 80, `line too long: ${l}`);
  }
});

test('formatTelemetryBlock omits timeout/error counters when zero', () => {
  const clean = {
    ...sampleTelemetry,
    peers_timed_out: 0,
    peers_errored: 0,
  };
  const out = formatTelemetryBlock(clean);
  assert.ok(!out.includes('timeout'));
  assert.ok(!out.includes('error'));
});
