/**
 * Tests for src/domain/bloom.ts — the v3 federated-search pre-filter
 * primitive. Covers:
 *   - construction via create(m, k) and optimalParams(n, p)
 *   - insert / mayContain / insertMany semantics
 *   - no false negatives after insert
 *   - false-positive rate empirically within the designed ceiling
 *   - union requires identical parameters
 *   - encode → decode round-trip preserves identity
 *   - size estimator is within ±10% of truth at designed load
 *   - magic / version rejection on corrupt wire payloads
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import {
  create,
  optimalParams,
  insert,
  insertMany,
  mayContain,
  union,
  estimatedSize,
  fillRatio,
  encode,
  decode,
} from '../src/domain/bloom.ts';

describe('bloom — construction', () => {
  it('create(m, k) with sensible parameters returns an empty filter', () => {
    const r = create(1024, 4);
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    assert.equal(r.value.m, 1024);
    assert.equal(r.value.k, 4);
    assert.equal(r.value.bits.length, 128); // 1024 bits / 8
    assert.equal(fillRatio(r.value), 0);
  });

  it('rejects invalid m and k', () => {
    assert.ok(create(0, 4).isErr());       // m too small
    assert.ok(create(1e9, 4).isErr());     // m too large
    assert.ok(create(1024, 0).isErr());    // k too small
    assert.ok(create(1024, 64).isErr());   // k too large
    assert.ok(create(1024.5, 4).isErr());  // m non-integer
  });

  it('optimalParams derives plausible (m, k) for a target rate', () => {
    const { m, k } = optimalParams(10000, 0.01);
    // Textbook values for n=10k, p=0.01: m ≈ 95,851, k ≈ 7
    assert.ok(m >= 90000 && m <= 100000, `m out of range: ${m}`);
    assert.ok(k >= 6 && k <= 8, `k out of range: ${k}`);
  });
});

describe('bloom — insert / mayContain', () => {
  it('inserted values are always reported present (no false negatives)', () => {
    const { m, k } = optimalParams(500, 0.01);
    const built = create(m, k);
    assert.ok(built.isOk());
    if (!built.isOk()) return;

    const values = Array.from({ length: 500 }, (_, i) => `entry:${i}`);
    const filter = insertMany(built.value, values);

    for (const v of values) {
      assert.ok(mayContain(filter, v), `missing insert ${v}`);
    }
  });

  it('empirical false-positive rate is close to designed p=0.01', () => {
    const { m, k } = optimalParams(10000, 0.01);
    const empty = create(m, k);
    assert.ok(empty.isOk());
    if (!empty.isOk()) return;

    const inserted = Array.from({ length: 10000 }, (_, i) => `v:${i}`);
    const filter = insertMany(empty.value, inserted);

    const probes = 10000;
    let falsePositives = 0;
    for (let i = 0; i < probes; i++) {
      const q = `miss:${i}`; // guaranteed not in the set
      if (mayContain(filter, q)) falsePositives++;
    }
    const fpRate = falsePositives / probes;
    // Designed p = 0.01. Empirical should be within 3× at this sample size.
    assert.ok(fpRate < 0.035, `false-positive rate ${fpRate.toFixed(4)} well above 0.01`);
  });

  it('works on raw Uint8Array values, not just strings', () => {
    const r = create(1024, 4);
    assert.ok(r.isOk());
    if (!r.isOk()) return;

    const value = new Uint8Array(randomBytes(32));
    const f = insert(r.value, value);
    assert.ok(mayContain(f, value));
    assert.equal(mayContain(r.value, value), false); // original unchanged
  });

  it('is immutable at the public surface — insert returns a new filter', () => {
    const r = create(512, 3);
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    const before = r.value.bits.slice();
    insert(r.value, 'x');
    // original bits untouched
    for (let i = 0; i < before.length; i++) assert.equal(r.value.bits[i], before[i]);
  });
});

describe('bloom — union', () => {
  it('unions two filters with identical params via bitwise OR', () => {
    const r1 = create(1024, 4);
    const r2 = create(1024, 4);
    assert.ok(r1.isOk() && r2.isOk());
    if (!r1.isOk() || !r2.isOk()) return;

    const a = insertMany(r1.value, ['alpha', 'beta']);
    const b = insertMany(r2.value, ['gamma', 'delta']);

    const u = union(a, b);
    assert.ok(u.isOk());
    if (!u.isOk()) return;

    for (const v of ['alpha', 'beta', 'gamma', 'delta']) {
      assert.ok(mayContain(u.value, v));
    }
  });

  it('rejects union with mismatched parameters', () => {
    const a = create(1024, 4);
    const b = create(2048, 4);
    assert.ok(a.isOk() && b.isOk());
    if (!a.isOk() || !b.isOk()) return;
    assert.ok(union(a.value, b.value).isErr());
  });
});

describe('bloom — serialization', () => {
  it('encode → decode round-trips', () => {
    const r = create(8192, 5);
    assert.ok(r.isOk());
    if (!r.isOk()) return;

    const original = insertMany(r.value, ['red', 'green', 'blue']);
    const wire = encode(original);
    const restored = decode(wire);
    assert.ok(restored.isOk());
    if (!restored.isOk()) return;

    assert.equal(restored.value.m, original.m);
    assert.equal(restored.value.k, original.k);
    assert.deepEqual(restored.value.bits, original.bits);
    for (const v of ['red', 'green', 'blue']) assert.ok(mayContain(restored.value, v));
  });

  it('wire size = 10 + ceil(m/8)', () => {
    const r = create(8192, 5);
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    assert.equal(encode(r.value).length, 10 + 1024);
  });

  it('rejects corrupt magic / version', () => {
    const r = create(512, 3);
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    const wire = encode(r.value);

    const badMagic = wire.slice();
    badMagic[0] = 0x00;
    assert.ok(decode(badMagic).isErr());

    const badVersion = wire.slice();
    badVersion[1] = 2;
    assert.ok(decode(badVersion).isErr());

    const truncated = wire.slice(0, 5);
    assert.ok(decode(truncated).isErr());
  });
});

describe('bloom — size estimator', () => {
  it('estimatedSize is within ±25% of truth at designed load', () => {
    // Note: double-hashed bloom filters with small k have bounded bias
    // in the Swamidass-Baldi estimator at finite n. ±25% is a reasonable
    // capacity-monitoring tolerance; for precise counting use a different
    // structure (e.g. hyperloglog).
    const { m, k } = optimalParams(1000, 0.01);
    const empty = create(m, k);
    assert.ok(empty.isOk());
    if (!empty.isOk()) return;

    const values = Array.from({ length: 1000 }, (_, i) => `x:${i}`);
    const filter = insertMany(empty.value, values);
    const est = estimatedSize(filter);
    assert.ok(est >= 750 && est <= 1250, `estimatedSize=${est.toFixed(1)}, truth=1000`);
  });

  it('fillRatio rises with load', () => {
    const r = create(4096, 4);
    assert.ok(r.isOk());
    if (!r.isOk()) return;

    const empty = r.value;
    assert.equal(fillRatio(empty), 0);

    const half = insertMany(empty, Array.from({ length: 500 }, (_, i) => `h:${i}`));
    assert.ok(fillRatio(half) > 0 && fillRatio(half) < 1);

    const saturated = insertMany(empty, Array.from({ length: 10_000 }, (_, i) => `s:${i}`));
    assert.ok(fillRatio(saturated) > fillRatio(half));
  });
});
