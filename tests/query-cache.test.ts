/**
 * Tests for src/domain/query-cache.ts — the Phase 5 L1 query cache.
 * Covers:
 *   - keyFor: deterministic, canonical
 *   - get miss → null, hit → entry
 *   - set + get round trip
 *   - TTL expiry (injected clock)
 *   - LRU eviction at capacity
 *   - LRU touch: get() on an old entry keeps it alive
 *   - overwrite semantics (re-set same key refreshes insertedAt)
 *   - clear() empties + keeps counters
 *   - stats hit_rate math
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { queryCache } from '../src/domain/query-cache.ts';

describe('queryCache — keying', () => {
  it('keyFor is deterministic across identical inputs', () => {
    const c = queryCache();
    const a = c.keyFor('ask', ['--room', 'r1', 'hello world']);
    const b = c.keyFor('ask', ['--room', 'r1', 'hello world']);
    assert.equal(a, b);
  });

  it('different cmd → different key', () => {
    const c = queryCache();
    const a = c.keyFor('ask', ['x']);
    const b = c.keyFor('stats', ['x']);
    assert.notEqual(a, b);
  });

  it('arg order matters', () => {
    const c = queryCache();
    const a = c.keyFor('ask', ['--room', 'r1', 'foo']);
    const b = c.keyFor('ask', ['foo', '--room', 'r1']);
    assert.notEqual(a, b);
  });
});

describe('queryCache — set / get', () => {
  it('miss returns null + increments misses', () => {
    const c = queryCache();
    assert.equal(c.get('nonexistent'), null);
    assert.equal(c.stats().misses, 1);
    assert.equal(c.stats().hits, 0);
  });

  it('set then get returns the value + increments hits', () => {
    const c = queryCache();
    const k = c.keyFor('ask', ['q1']);
    c.set(k, 'cached stdout');
    const got = c.get(k);
    assert.ok(got);
    assert.equal(got!.stdout, 'cached stdout');
    assert.equal(c.stats().hits, 1);
  });
});

describe('queryCache — TTL', () => {
  it('entries expire after ttlMs', () => {
    let now = 1_000_000;
    const c = queryCache({ ttlMs: 1000, clock: () => now });
    const k = c.keyFor('ask', ['x']);
    c.set(k, 'A');
    assert.equal(c.get(k)?.stdout, 'A');
    now += 1001;
    assert.equal(c.get(k), null, 'TTL expired');
    assert.equal(c.stats().size, 0, 'expired entry is evicted on get');
  });

  it('within-TTL hit is fresh', () => {
    let now = 1_000_000;
    const c = queryCache({ ttlMs: 1000, clock: () => now });
    const k = c.keyFor('ask', ['x']);
    c.set(k, 'A');
    now += 500;
    assert.equal(c.get(k)?.stdout, 'A');
  });
});

describe('queryCache — LRU', () => {
  it('evicts the least-recently-inserted entry at capacity', () => {
    const c = queryCache({ maxEntries: 3 });
    c.set('a', 'A');
    c.set('b', 'B');
    c.set('c', 'C');
    c.set('d', 'D'); // a should evict
    assert.equal(c.get('a'), null);
    assert.ok(c.get('b'));
    assert.ok(c.get('c'));
    assert.ok(c.get('d'));
    assert.ok(c.stats().evictions >= 1);
  });

  it('get() touches an entry, saving it from eviction', () => {
    const c = queryCache({ maxEntries: 3 });
    c.set('a', 'A');
    c.set('b', 'B');
    c.set('c', 'C');
    c.get('a'); // touch a — now b is LRU
    c.set('d', 'D'); // b should evict, not a
    assert.ok(c.get('a'));
    assert.equal(c.get('b'), null);
  });

  it('overwrite refreshes insertedAt (extends TTL)', () => {
    let now = 1000;
    const c = queryCache({ ttlMs: 500, clock: () => now });
    c.set('k', 'v1');
    now += 400;
    c.set('k', 'v2'); // refresh
    now += 300;
    // v2 inserted at now=1400, TTL 500, so still fresh at now=1700
    const got = c.get('k');
    assert.ok(got);
    assert.equal(got!.stdout, 'v2');
  });
});

describe('queryCache — clear + stats', () => {
  it('clear empties entries but preserves counters', () => {
    const c = queryCache();
    const k = c.keyFor('ask', ['q']);
    c.set(k, 'v');
    c.get(k);
    c.clear();
    assert.equal(c.stats().size, 0);
    assert.equal(c.stats().hits, 1, 'counters preserved post-clear');
  });

  it('hit_rate is hits / (hits + misses)', () => {
    const c = queryCache();
    const k = c.keyFor('ask', ['q']);
    c.set(k, 'v');
    c.get(k);       // hit
    c.get('other'); // miss
    c.get(k);       // hit
    assert.equal(c.stats().hits, 2);
    assert.equal(c.stats().misses, 1);
    assert.ok(Math.abs(c.stats().hit_rate - 2 / 3) < 1e-6);
  });
});

describe('queryCache — option validation', () => {
  it('rejects maxEntries < 1', () => {
    assert.throws(() => queryCache({ maxEntries: 0 }));
  });
  it('rejects negative ttlMs', () => {
    assert.throws(() => queryCache({ ttlMs: -1 }));
  });
});
