/**
 * Unit tests — query-term coverage map (RFC-0003 OQ#3).
 * Locks the no-LLM heuristic so the "did the evidence cover the
 * question?" signal stays transparent and argued-about.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractQueryTerms, buildCoverageMap, type CoverageHit } from '../src/domain/coverage.js';

// ─────────── extractQueryTerms ─────────────

test('extractQueryTerms drops stopwords + short tokens, dedupes, lowercases', () => {
  const terms = extractQueryTerms('How do I use the vllm OOM with vllm cache');
  assert.ok(!terms.includes('how') && !terms.includes('the') && !terms.includes('do'));
  assert.ok(terms.includes('vllm'));
  assert.equal(terms.filter((t) => t === 'vllm').length, 1, 'deduped');
  assert.ok(terms.includes('oom'));
});

test('extractQueryTerms keeps quoted phrases whole', () => {
  const terms = extractQueryTerms('fix "prefix cache" on node 24');
  assert.ok(terms.includes('prefix cache'), `got ${terms.join('|')}`);
});

test('extractQueryTerms caps at 8 terms', () => {
  const terms = extractQueryTerms('alpha beta gamma delta epsilon zeta eta theta iota kappa');
  assert.equal(terms.length, 8);
});

// ─────────── buildCoverageMap ──────────────

const hit = (node_id: string, text: string): CoverageHit => ({ node_id, text });

test('buildCoverageMap splits covered vs missing and scopes the next search', () => {
  const map = buildCoverageMap('vllm OOM prefix cache fp8', [
    hit('a', 'vllm OOM happens when the prefix cache page size is too small'),
    hit('b', 'unrelated note about postgres'),
  ]);
  const coveredTerms = map.covered.map((c) => c.term);
  assert.ok(coveredTerms.includes('vllm'));
  assert.ok(coveredTerms.includes('prefix'));
  const missingTerms = map.missing.map((m) => m.term);
  assert.ok(missingTerms.includes('fp8'), `fp8 should be missing; missing=${missingTerms.join(',')}`);
  assert.ok(map.coverage_ratio < 1 && map.coverage_ratio > 0);
  assert.ok(map.recommended_action.includes('fp8'));
  assert.equal(map.method, 'heuristic-terms');
  // covered terms carry their evidence node ids
  assert.deepEqual(
    map.covered.find((c) => c.term === 'vllm')?.evidence,
    ['a'],
  );
});

test('buildCoverageMap: full coverage → ratio 1, no constrained search', () => {
  const map = buildCoverageMap('sqlite vector', [hit('a', 'sqlite vector search with vec0')]);
  assert.equal(map.missing.length, 0);
  assert.equal(map.coverage_ratio, 1);
  assert.ok(map.recommended_action.includes('no constrained search'));
});

test('buildCoverageMap: query with no salient terms → ratio 1', () => {
  const map = buildCoverageMap('how do I', [hit('a', 'anything')]);
  assert.equal(map.required_terms.length, 0);
  assert.equal(map.coverage_ratio, 1);
});
