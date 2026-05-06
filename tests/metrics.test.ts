/**
 * Unit tests — in-process metrics registry.
 *
 * Locks the contract (counter monotonicity, gauge LWW, histogram
 * percentiles, snapshot shape, reset isolation) so the metrics
 * surface stays stable while we wire it into more sites (recall/
 * search responders, federated search, etc.).
 */

import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { metrics, timed } from '../src/domain/metrics.js';

beforeEach(() => {
  metrics.reset();
});

// ─────────────── counter ──────────────────

test('counter increments monotonically; default by=1', () => {
  const c = metrics.counter('foo');
  c.inc();
  c.inc();
  c.inc(5);
  assert.equal(c.value(), 7);
});

test('counter is name-keyed; same name returns same instance', () => {
  metrics.counter('shared').inc();
  metrics.counter('shared').inc();
  assert.equal(metrics.counter('shared').value(), 2);
});

// ─────────────── gauge ────────────────────

test('gauge is last-write-wins', () => {
  const g = metrics.gauge('queue.depth');
  g.set(5);
  g.set(12);
  g.set(0);
  assert.equal(g.value(), 0);
});

// ─────────────── histogram ────────────────

test('histogram empty → all zeros', () => {
  const h = metrics.histogram('latency').snapshot();
  assert.equal(h.count, 0);
  assert.equal(h.mean, 0);
  assert.equal(h.p50, 0);
  assert.equal(h.p95, 0);
});

test('histogram p50 / p95 / mean / min / max on a known distribution', () => {
  const h = metrics.histogram('lat');
  // values 1..100 inclusive
  for (let i = 1; i <= 100; i++) h.observe(i);
  const s = h.snapshot();
  assert.equal(s.count, 100);
  assert.equal(s.min, 1);
  assert.equal(s.max, 100);
  // mean = (1+100)*100/2 / 100 = 50.5
  assert.ok(Math.abs(s.mean - 50.5) < 1e-9, `mean ${s.mean}`);
  // p50 ≈ 50 (Math.floor(0.5 * 100) = 50; sorted index 50 → value 51)
  assert.ok(s.p50 === 50 || s.p50 === 51, `p50 ${s.p50}`);
  // p95 ≈ 95 or 96
  assert.ok(s.p95 >= 95 && s.p95 <= 96, `p95 ${s.p95}`);
});

test('histogram count grows past the ring size; window stays bounded', () => {
  const h = metrics.histogram('flood');
  for (let i = 0; i < 5000; i++) h.observe(i);
  const s = h.snapshot();
  assert.equal(s.count, 5000, 'total count tracks all observations');
  // Window holds last 1024 — min should be in the recent tail (≥ 5000-1024 = 3976)
  assert.ok(s.min >= 3000, `min ${s.min} should be from recent window`);
  assert.equal(s.max, 4999);
});

// ─────────────── snapshot + reset ─────────

test('snapshot shape includes all three families + emitted_at ISO', () => {
  metrics.counter('a').inc(3);
  metrics.gauge('b').set(7);
  metrics.histogram('c').observe(11);
  const s = metrics.snapshot();
  assert.equal(s.counters.a, 3);
  assert.equal(s.gauges.b, 7);
  assert.equal(s.histograms.c.count, 1);
  // emitted_at is a parseable ISO timestamp
  assert.ok(!Number.isNaN(Date.parse(s.emitted_at)));
});

test('reset wipes all state — required for test isolation', () => {
  metrics.counter('x').inc();
  metrics.gauge('y').set(99);
  metrics.histogram('z').observe(42);
  metrics.reset();
  const s = metrics.snapshot();
  assert.deepEqual(s.counters, {});
  assert.deepEqual(s.gauges, {});
  assert.deepEqual(s.histograms, {});
});

// ─────────────── timed helper ─────────────

test('timed records duration on success path', async () => {
  const r = await timed('work.ms', async () => {
    await new Promise((res) => setTimeout(res, 10));
    return 42;
  });
  assert.equal(r, 42);
  assert.equal(metrics.histogram('work.ms').snapshot().count, 1);
  assert.ok(metrics.histogram('work.ms').snapshot().min >= 9);
});

test('timed still records on throw; the throw propagates', async () => {
  await assert.rejects(
    timed('fail.ms', async () => {
      throw new Error('boom');
    }),
    /boom/,
  );
  assert.equal(metrics.histogram('fail.ms').snapshot().count, 1);
});
