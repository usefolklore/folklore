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
  decideContract,
  ageInDays,
  CONTRACT_THRESHOLDS,
  type EnrichedMatch,
  type PeerPullTelemetry,
} from '../src/domain/peer-telemetry.js';
import { formatTelemetryBlock, formatTelemetryOneLine } from '../src/infrastructure/telemetry-formatter.js';

const DAY = 86_400_000;
const fixedNow = Date.parse('2026-04-29T12:00:00Z');

const mk = (overrides: Partial<EnrichedMatch>): EnrichedMatch => ({
  node_id: 'n',
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

test('single REMOTE origin (re-share) triggers consensus penalty', () => {
  const m = mk({ source_peer: 'peer-x', also_from_peers: [] });
  const s = computeSatisfaction([m]);
  assert.equal(s.distinct_origins, 1);
  assert.ok(s.penalties.some((p) => p.includes('single remote origin')));
});

test('all-local single origin does NOT trigger the penalty', () => {
  // Pure-local data — source_peer null on every match — is the
  // user's own corpus by definition. Penalising it would tell the
  // agent "fall through to WebSearch" even when the local graph
  // has perfect coverage. Bug caught during the demo.
  const m = mk({ source_peer: null, also_from_peers: [] });
  const s = computeSatisfaction([m, { ...m, node_id: 'b' }, { ...m, node_id: 'c' }]);
  assert.equal(s.distinct_origins, 1);
  // No single-origin penalty in the penalties list
  assert.ok(
    !s.penalties.some((p) => p.includes('single')),
    `unexpected single-origin penalty for all-local: ${s.penalties.join(', ')}`,
  );
});

test('semantic-adjacent only top hit (d > 1.5) penalises', () => {
  const m = mk({ distance: 1.7 });
  const s = computeSatisfaction([m]);
  assert.ok(s.penalties.some((p) => p.includes('semantically adjacent only')));
});

test('low-data REMOTE results are NOT inflated by unknown-prior averaging', () => {
  // Single peer hit with retrieval=0.7, no fetched_at, no
  // signature, single REMOTE origin. Old scorer averaged 0.5
  // priors for freshness/signature into the base, yielding ~0.44.
  // New scorer drops unobserved components AND only penalises
  // single-origin when the source is remote — so the penalty
  // chain still fires for this case.
  const m: EnrichedMatch = {
    node_id: 'n',
    distance: 0.3,                    // retrieval ≈ 0.7
    source_peer: 'peer-x',            // REMOTE → triggers single-origin penalty
    also_from_peers: [],
    source_uri: undefined,
    fetched_at: undefined,
    age_days: undefined,
    has_signature: undefined,
    stale_after_days: undefined,
  };
  const s = computeSatisfaction([m]);
  // After missing-provenance + single-remote-origin penalties,
  // score is below 0.5 — visible signal "low confidence data."
  assert.ok(
    s.score < 0.5,
    `expected low score for low-data remote result, got ${s.score}`,
  );
  assert.equal(s.distinct_origins, 1);
  assert.equal(s.missing_provenance_count, 1);
});

test('observed_components reports the count of visible signals', () => {
  // Empty results → no components observed.
  const empty = computeSatisfaction([]);
  assert.equal(empty.observed_components, 0);

  // Local-only with provenance + age → retrieval, freshness,
  // provenance, consensus all observed (4 of 5). Signature stays
  // unobserved because nothing reports has_signature.
  const localFresh = mk({});
  const local = computeSatisfaction([localFresh]);
  assert.equal(local.observed_components, 4);

  // Strip provenance + age from a remote hit → only retrieval +
  // consensus observable (2 of 5). Codex review M2: this is the
  // "shallow evidence" case the decision picker must demote.
  const sparse: EnrichedMatch = {
    node_id: 'n',
    distance: 0.4,
    source_peer: 'peer-x',
    also_from_peers: [],
    source_uri: undefined,
    fetched_at: undefined,
    age_days: undefined,
    has_signature: undefined,
    stale_after_days: undefined,
  };
  const s = computeSatisfaction([sparse]);
  // retrieval (always observed when results exist) + provenance
  // (always observed: "does it have source_uri+fetched_at?" is a
  // boolean that's always answerable) + consensus = 3.
  // freshness + signature = unobserved.
  assert.equal(s.observed_components, 3);
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
    observed_components: 4,
  },
  decision: 'verify_one_source',
  coverage_map: null,
  emitted_at: '2026-04-29T12:00:00Z',
};

test('formatTelemetryBlock renders all six lines plus borders', () => {
  const out = formatTelemetryBlock(sampleTelemetry);
  const lines = out.split('\n');
  assert.equal(lines.length, 8); // top + 6 + bottom (query/took/data/peers/fit/action)
  assert.match(lines[0], /^─+ folklore peer pull/);
  assert.match(lines[1], /query.*vector search sqlite/);
  assert.match(lines[2], /took.*820ms.*340ms local.*80ms merge/);
  assert.match(lines[3], /data.*4\.2 KB.*12 results.*3 unique sources/);
  assert.match(lines[4], /peers.*2\/4 responded.*6 alive.*1 timeout.*1 error/);
  assert.match(lines[5], /fit.*0\.78 satisfaction.*4 fresh.*1 stale.*0 unsigned/);
  assert.match(lines[6], /action.*verify_one_source/);
  assert.match(lines[7], /^─+$/);
});

test('decision picker maps satisfaction.score to the right v1 action', () => {
  // Locks the v1 thresholds — v2 may overlay task-risk but the
  // pure-score path stays stable so callers don't break.
  const tpl = (score: number): PeerPullTelemetry => ({
    ...sampleTelemetry,
    satisfaction: { ...sampleTelemetry.satisfaction, score },
  });
  // decision is computed in buildPeerPullTelemetry, not the formatter,
  // but the formatter renders whatever's set on the record. Verify
  // the formatter passes through faithfully.
  const out = formatTelemetryBlock({ ...tpl(0.9), decision: 'use_memory' });
  assert.ok(out.includes('action   use_memory'));
  const out2 = formatTelemetryBlock({ ...tpl(0.3), decision: 'ask_user' });
  assert.ok(out2.includes('action   ask_user'));
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

// ─────────── satisfaction trace (RFC-0003) ─

test('computeSatisfaction emits a 5-row component trace; unobserved rows carry weight 0', () => {
  // one local hit, no age, no signature → freshness + signature unobserved
  const s = computeSatisfaction([mk({ age_days: undefined, has_signature: undefined })]);
  assert.equal(s.components.length, 5);
  const byName = Object.fromEntries(s.components.map((c) => [c.name, c]));
  assert.equal(byName.freshness.observed, false);
  assert.equal(byName.freshness.weight, 0);
  assert.equal(byName.signature.observed, false);
  assert.equal(byName.signature.weight, 0);
  // observed rows split the weight equally and sum to ~1
  const total = s.components.reduce((a, c) => a + c.weight, 0);
  assert.ok(Math.abs(total - 1) < 0.05, `weights should sum to ~1, got ${total}`);
});

// ─────────── decideContract (RFC-0003) ─────

test('decideContract: deep high-confidence evidence → use_memory, no shadow search', () => {
  // 4 observed components (retrieval/freshness/provenance/consensus), all strong
  const s = computeSatisfaction([
    mk({ distance: 0.1 }),
    mk({ distance: 0.15, node_id: 'n2', source_peer: 'peerA' }),
  ]);
  const c = decideContract(s);
  assert.ok(s.observed_components >= 4, 'fixture should be deep');
  assert.ok(s.score >= CONTRACT_THRESHOLDS.use_memory, `score ${s.score}`);
  assert.equal(c.decision, 'use_memory');
  assert.equal(c.would_shadow_search, false);
  assert.ok(c.summary.includes(s.score.toFixed(2)));
  assert.equal(c.trace.length, 5);
});

test('decideContract: shallow evidence demotes a high score to verify_one_source', () => {
  // 3 observed (no age, no signature) → shallow even at a high base score
  const s = computeSatisfaction([mk({ distance: 0.1, age_days: undefined, has_signature: undefined })]);
  const c = decideContract(s);
  assert.ok(s.observed_components < 4, 'fixture should be shallow');
  assert.ok(s.score >= CONTRACT_THRESHOLDS.use_memory, `score ${s.score}`);
  assert.equal(c.decision, 'verify_one_source');
  assert.equal(c.would_shadow_search, true);
});

test('decideContract: caller shallowEvidence flag forces demotion even when deep', () => {
  const s = computeSatisfaction([mk({ distance: 0.1 }), mk({ distance: 0.15, node_id: 'n2', source_peer: 'peerA' })]);
  const c = decideContract(s, { shallowEvidence: true });
  assert.equal(c.decision, 'verify_one_source');
});

test('decideContract: low score floors to ask_user', () => {
  const s: SatisfactionScore = {
    score: 0.2, fresh_count: 0, stale_count: 0, unsigned_count: 0,
    missing_provenance_count: 0, distinct_origins: 1, reasons: [], penalties: [],
    components: [], observed_components: 4,
  };
  const c = decideContract(s);
  assert.equal(c.decision, 'ask_user');
  assert.equal(c.would_shadow_search, true);
});

test('decideContract: threshold band maps to verify / search', () => {
  const base = {
    fresh_count: 0, stale_count: 0, unsigned_count: 0, missing_provenance_count: 0,
    distinct_origins: 2, reasons: [], penalties: [], components: [], observed_components: 4,
  };
  assert.equal(decideContract({ ...base, score: 0.7 }).decision, 'verify_one_source');
  assert.equal(decideContract({ ...base, score: 0.5 }).decision, 'search_required');
});
