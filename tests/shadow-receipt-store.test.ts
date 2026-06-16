/**
 * Unit tests — shadow-receipt store: flag-gated learned-weight loading.
 *
 * Locks the backward-compatibility contract: with the flag off (the
 * default), `loadLearnedWeights` returns the hand-tuned constants and
 * reports `learned=false`, so production behaviour is unchanged. With the
 * flag on but a thin store, it STILL falls back. Only with the flag on AND
 * a labelled separating store does it learn.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { appendShadowReceipt, loadLearnedWeights } from '../src/infrastructure/shadow-receipt-store.js';
import { DEFAULT_COMPONENT_WEIGHTS, COMPONENT_NAMES, type ComponentName, type ComponentTrace } from '../src/domain/peer-telemetry.js';
import type { ShadowReceipt } from '../src/domain/shadow-receipt.js';

const tmpHome = (): string => mkdtempSync(join(tmpdir(), 'folklore-weights-'));

const trace = (name: ComponentName, value: number): ComponentTrace => ({ name, value, observed: true, weight: 0.25 });

const labelled = (sat: boolean, retrieval: number): ShadowReceipt => ({
  emitted_at: '2026-06-16T00:00:00.000Z',
  query: 'q',
  decision: sat ? 'use_memory' : 'search_required',
  score: retrieval,
  risk: 'low',
  would_shadow_search: !sat,
  result_count: 3,
  distinct_origins: 2,
  coverage_ratio: null,
  missing_terms: [],
  components: [trace('retrieval', retrieval), trace('provenance', 0.5)],
  outcome: sat ? 'good_skip' : 'bad_skip',
});

test('loadLearnedWeights: flag OFF → constants unchanged (backward compatible)', () => {
  const home = tmpHome();
  try {
    // Even a perfectly separable store is ignored while the flag is off.
    for (let i = 0; i < 8; i++) appendShadowReceipt(home, labelled(true, 0.9));
    for (let i = 0; i < 8; i++) appendShadowReceipt(home, labelled(false, 0.1));
    const res = loadLearnedWeights(home, { enabled: false });
    assert.equal(res.learned, false);
    assert.deepEqual(res.weights, DEFAULT_COMPONENT_WEIGHTS);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('loadLearnedWeights: flag ON but empty store → fallback to constants', () => {
  const home = tmpHome();
  try {
    const res = loadLearnedWeights(home, { enabled: true });
    assert.equal(res.learned, false);
    assert.deepEqual(res.weights, DEFAULT_COMPONENT_WEIGHTS);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('loadLearnedWeights: flag ON + labelled separating store → learns', () => {
  const home = tmpHome();
  try {
    for (let i = 0; i < 8; i++) appendShadowReceipt(home, labelled(true, 0.9));
    for (let i = 0; i < 8; i++) appendShadowReceipt(home, labelled(false, 0.1));
    const res = loadLearnedWeights(home, { enabled: true });
    assert.equal(res.learned, true);
    assert.ok(res.weights.retrieval > 0.2, `retrieval up-weighted, got ${res.weights.retrieval}`);
    assert.ok(Math.abs(COMPONENT_NAMES.reduce((a, n) => a + res.weights[n], 0) - 1) < 1e-9);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
