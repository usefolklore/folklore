/**
 * Tests for src/domain/shamir.ts — Shamir secret sharing in GF(2⁸).
 * Covers:
 *   - k-of-n round trip on a 32-byte Ed25519-sized secret
 *   - Any threshold-sized subset of shares reconstructs correctly
 *   - One share fewer than threshold cannot reconstruct (property:
 *     the reconstruction does not equal the original)
 *   - Parameter validation: bad shares/threshold/empty secret
 *   - Duplicate x values rejected
 *   - Inconsistent share lengths rejected
 *   - Deterministic given a fixed RNG (for reproducibility in tests)
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { randomBytes } from 'node:crypto';
import { split, combine, type SecretShare } from '../src/domain/shamir.ts';

describe('shamir — split + combine round trip', () => {
  it('3-of-5 over a 32-byte secret', () => {
    const secret = new Uint8Array(randomBytes(32));
    const shares = split(secret, 5, 3);
    assert.ok(shares.isOk(), `split: ${shares.isErr() ? JSON.stringify(shares.error) : ''}`);
    if (!shares.isOk()) return;
    assert.equal(shares.value.length, 5);

    // Any 3-share subset reconstructs
    for (const subset of [[0, 1, 2], [1, 3, 4], [0, 2, 4], [2, 3, 4]]) {
      const picked = subset.map((i) => shares.value[i]);
      const r = combine(picked);
      assert.ok(r.isOk(), `combine: ${r.isErr() ? JSON.stringify(r.error) : ''}`);
      if (r.isOk()) assert.deepEqual(r.value, secret);
    }
  });

  it('2-of-3 round trip', () => {
    const secret = new TextEncoder().encode('the free LLM world needs portable memory');
    const shares = split(secret, 3, 2);
    assert.ok(shares.isOk());
    if (!shares.isOk()) return;

    // Any pair reconstructs
    const pair01 = combine([shares.value[0], shares.value[1]]);
    const pair02 = combine([shares.value[0], shares.value[2]]);
    const pair12 = combine([shares.value[1], shares.value[2]]);
    assert.ok(pair01.isOk() && pair02.isOk() && pair12.isOk());
    if (pair01.isOk()) assert.deepEqual(pair01.value, secret);
    if (pair02.isOk()) assert.deepEqual(pair02.value, secret);
    if (pair12.isOk()) assert.deepEqual(pair12.value, secret);
  });

  it('all shares reconstruct (over-determined, consistent)', () => {
    const secret = new Uint8Array(randomBytes(16));
    const shares = split(secret, 4, 2);
    assert.ok(shares.isOk());
    if (!shares.isOk()) return;
    const r = combine(shares.value);
    assert.ok(r.isOk());
    if (r.isOk()) assert.deepEqual(r.value, secret);
  });

  it('one share below threshold does not reconstruct', () => {
    const secret = new Uint8Array(randomBytes(32));
    const shares = split(secret, 5, 3);
    assert.ok(shares.isOk());
    if (!shares.isOk()) return;

    // 2 shares when threshold=3 → Lagrange over 2 points produces a
    // DIFFERENT byte pattern (not the original secret). The math still
    // returns something (underdetermined polynomial gives a valid
    // interpolation); the test is that it is NOT the secret.
    const r = combine([shares.value[0], shares.value[1]]);
    assert.ok(r.isOk());
    if (r.isOk()) {
      let equal = true;
      for (let i = 0; i < 32; i++) if (r.value[i] !== secret[i]) { equal = false; break; }
      assert.equal(equal, false, 'k-1 shares should NOT recover the original');
    }
  });
});

describe('shamir — deterministic with injected RNG', () => {
  it('same RNG + same secret ⇒ identical shares', () => {
    const secret = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    // deterministic RNG: zeros (makes the polynomial degenerate but the math still runs)
    const rng = (n: number): Uint8Array => new Uint8Array(n); // all zeros
    const a = split(secret, 3, 2, { rng });
    const b = split(secret, 3, 2, { rng });
    assert.ok(a.isOk() && b.isOk());
    if (a.isOk() && b.isOk()) {
      for (let i = 0; i < 3; i++) {
        assert.equal(a.value[i].x, b.value[i].x);
        assert.deepEqual(a.value[i].y, b.value[i].y);
      }
    }
  });
});

describe('shamir — input validation', () => {
  it('rejects empty secret', () => {
    assert.ok(split(new Uint8Array(0), 3, 2).isErr());
  });

  it('rejects threshold > shares', () => {
    assert.ok(split(new Uint8Array(10), 3, 4).isErr());
  });

  it('rejects shares > 255', () => {
    assert.ok(split(new Uint8Array(10), 256, 2).isErr());
  });

  it('rejects shares < 1', () => {
    assert.ok(split(new Uint8Array(10), 0, 1).isErr());
  });

  it('rejects threshold < 1', () => {
    assert.ok(split(new Uint8Array(10), 3, 0).isErr());
  });

  it('combine rejects empty input', () => {
    assert.ok(combine([]).isErr());
  });

  it('combine rejects duplicate x values', () => {
    const shares: SecretShare[] = [
      { x: 1, y: new Uint8Array([1, 2]) },
      { x: 1, y: new Uint8Array([3, 4]) },
    ];
    assert.ok(combine(shares).isErr());
  });

  it('combine rejects inconsistent y lengths', () => {
    const shares: SecretShare[] = [
      { x: 1, y: new Uint8Array(10) },
      { x: 2, y: new Uint8Array(11) },
    ];
    assert.ok(combine(shares).isErr());
  });

  it('combine rejects x out of range', () => {
    const shares: SecretShare[] = [
      { x: 0, y: new Uint8Array([1, 2]) },
      { x: 2, y: new Uint8Array([3, 4]) },
    ];
    assert.ok(combine(shares).isErr());
  });
});
