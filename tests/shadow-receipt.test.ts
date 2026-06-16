/**
 * Unit tests — shadow-search receipts (RFC-0003 OQ#5).
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildShadowReceipt, summarizeReceipts, type ShadowReceipt } from '../src/domain/shadow-receipt.js';
import type { PeerPullTelemetry, SatisfactionScore } from '../src/domain/peer-telemetry.js';

const sat = (score: number): SatisfactionScore => ({
  score, fresh_count: 1, stale_count: 0, unsigned_count: 0, missing_provenance_count: 0,
  distinct_origins: 2, reasons: [], penalties: [], components: [], observed_components: 4,
});

const tele = (over: Partial<PeerPullTelemetry>): PeerPullTelemetry => ({
  query: 'sqlite vector search', took_ms: 100, took_local_ms: 20, took_merge_ms: 5,
  bytes_received: 1024, result_count: 3, distinct_sources: 2, peers_alive: 2, peers_queried: 2,
  peers_responded: 2, peers_timed_out: 0, peers_errored: 0,
  satisfaction: sat(0.9), decision: 'use_memory', coverage_map: null,
  emitted_at: '2026-06-16T00:00:00.000Z', ...over,
});

test('buildShadowReceipt: use_memory → no shadow, no coverage, unlabelled', () => {
  const r = buildShadowReceipt(tele({}), Date.parse('2026-06-16T00:00:00Z'));
  assert.equal(r.decision, 'use_memory');
  assert.equal(r.would_shadow_search, false);
  assert.equal(r.coverage_ratio, null);
  assert.equal(r.outcome, 'unlabelled');
  assert.equal(r.score, 0.9);
  assert.equal(r.risk, 'low');
});

test('buildShadowReceipt: high-risk query is classified from the text', () => {
  const r = buildShadowReceipt(tele({ query: 'rotate the oauth secret safely', decision: 'search_required' }));
  assert.equal(r.risk, 'high');
  assert.equal(r.would_shadow_search, true);
});

test('buildShadowReceipt: pulls coverage ratio + missing terms when present', () => {
  const r = buildShadowReceipt(
    tele({
      decision: 'search_required',
      coverage_map: {
        query: 'q', method: 'heuristic-terms', required_terms: ['a', 'b'],
        covered: [{ term: 'a', covered: true, evidence: ['n1'] }],
        missing: [{ term: 'b', covered: false, evidence: [] }],
        coverage_ratio: 0.5, recommended_action: 'search only for the missing terms: b',
      },
    }),
  );
  assert.equal(r.coverage_ratio, 0.5);
  assert.deepEqual(r.missing_terms, ['b']);
});

test('summarizeReceipts: rates + bad-skip null until labelled', () => {
  const mk = (over: Partial<ShadowReceipt>): ShadowReceipt => ({
    emitted_at: '2026-06-16T00:00:00.000Z', query: 'q', decision: 'use_memory', score: 0.9,
    risk: 'low', would_shadow_search: false, result_count: 3, distinct_origins: 2,
    coverage_ratio: null, missing_terms: [], outcome: 'unlabelled', ...over,
  });
  const s = summarizeReceipts([
    mk({}),                                                    // skip
    mk({ decision: 'search_required', would_shadow_search: true, coverage_ratio: 0.4 }),
    mk({ decision: 'verify_one_source', would_shadow_search: true, coverage_ratio: 0.6 }),
  ]);
  assert.equal(s.total, 3);
  assert.equal(s.skip_rate, round(1 / 3));
  assert.equal(s.would_shadow_rate, round(2 / 3));
  assert.equal(s.avg_coverage_ratio, 0.5);
  assert.equal(s.bad_skip_rate, null);
  assert.equal(s.labelled, 0);
  assert.equal(s.by_decision.use_memory, 1);

  const labelled = summarizeReceipts([
    mk({ outcome: 'good_skip' }),
    mk({ outcome: 'bad_skip' }),
  ]);
  assert.equal(labelled.labelled, 2);
  assert.equal(labelled.bad_skip_rate, 0.5);
});

const round = (n: number): number => Math.round(n * 1000) / 1000;

test('summarizeReceipts: empty → zeros, null ratios', () => {
  const s = summarizeReceipts([]);
  assert.equal(s.total, 0);
  assert.equal(s.skip_rate, 0);
  assert.equal(s.avg_coverage_ratio, null);
  assert.equal(s.bad_skip_rate, null);
});
