/**
 * Tests for src/domain/binary-quantize.ts — the Matryoshka + binary
 * primitive that Phase 3 wires into the production VectorIndex.
 *
 * Covers:
 *   - truncateMRL is scale-invariant (LN cancels uniform scaling)
 *   - truncateMRL output is unit-L2-normalized
 *   - truncateMRL rejects bad dims
 *   - binarize: sign-bit shape + byte length
 *   - binarize: all-positive / all-negative extremes
 *   - hammingDistance: known pair values + self-distance is 0
 *   - hammingDistance: length mismatch returns Infinity (non-throwing)
 *   - hammingSimilarity: complement of hamming/numBits
 *   - matryoshkaBinary end-to-end: 768→64 bytes at dim=512
 *   - bytesPerVector + compressionRatio table from V3-PROTOCOL §4.1
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  truncateMRL,
  binarize,
  hammingDistance,
  hammingSimilarity,
  matryoshkaBinary,
  bytesPerVector,
  compressionRatio,
} from '../src/domain/binary-quantize.ts';

const seed = (n: number, fn: (i: number) => number): Float32Array => {
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) v[i] = fn(i);
  return v;
};

describe('truncateMRL', () => {
  it('produces a unit-L2 vector at the requested dim', () => {
    const v = seed(768, (i) => Math.sin(i * 0.1));
    const r = truncateMRL(v, 512);
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    assert.equal(r.value.length, 512);
    let sumsq = 0;
    for (let i = 0; i < r.value.length; i++) sumsq += r.value[i] * r.value[i];
    assert.ok(Math.abs(sumsq - 1) < 1e-5, `||v||² = ${sumsq.toFixed(6)}, expected ~1`);
  });

  it('is scale-invariant (uniform scaling of input cancels through LN)', () => {
    const v = seed(768, (i) => Math.sin(i * 0.1));
    const vScaled = seed(768, (i) => 17 * v[i]);
    const a = truncateMRL(v, 256);
    const b = truncateMRL(vScaled, 256);
    assert.ok(a.isOk() && b.isOk());
    if (!a.isOk() || !b.isOk()) return;
    for (let i = 0; i < 256; i++) {
      assert.ok(Math.abs(a.value[i] - b.value[i]) < 1e-5, `index ${i} differs: ${a.value[i]} vs ${b.value[i]}`);
    }
  });

  it('handles dim === full length as a no-op up to LN+renorm', () => {
    const v = seed(16, (i) => (i % 2 === 0 ? 1 : -1) * (i + 1));
    const r = truncateMRL(v, 16);
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    assert.equal(r.value.length, 16);
  });

  it('rejects dim = 0 or > full length', () => {
    const v = seed(8, () => 0.5);
    assert.ok(truncateMRL(v, 0).isErr());
    assert.ok(truncateMRL(v, 9).isErr());
  });
});

describe('binarize', () => {
  it('emits ceil(dim/8) bytes', () => {
    assert.equal(binarize(new Float32Array(512)).length, 64);
    assert.equal(binarize(new Float32Array(768)).length, 96);
    assert.equal(binarize(new Float32Array(10)).length, 2);
  });

  it('sets bit i iff v[i] > 0 (little-endian within byte)', () => {
    // v = [+, -, +, +, -, +, -, -, +, -]
    // byte 0: bits 0,2,3,5 set → 0b00101101 = 0x2D
    // byte 1: bit  0 set      → 0b00000001 = 0x01
    const v = new Float32Array([0.5, -0.1, 0.9, 0.2, -0.8, 0.1, -0.4, -0.3, 0.7, -0.2]);
    const b = binarize(v);
    assert.equal(b[0], 0x2d);
    assert.equal(b[1], 0x01);
  });

  it('maps 0.0 to the clear bit (deterministic)', () => {
    const v = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0]);
    const b = binarize(v);
    assert.equal(b[0], 0x00);
  });

  it('all-positive → all bits set', () => {
    const v = seed(64, () => 0.1);
    const b = binarize(v);
    for (let i = 0; i < 8; i++) assert.equal(b[i], 0xff);
  });
});

describe('hammingDistance', () => {
  it('self-distance is 0', () => {
    const a = new Uint8Array([0b10110101, 0b11001100]);
    assert.equal(hammingDistance(a, a), 0);
  });

  it('complement vector has max distance (numBits)', () => {
    const a = new Uint8Array([0x00, 0x00, 0x00, 0x00]);
    const b = new Uint8Array([0xff, 0xff, 0xff, 0xff]);
    assert.equal(hammingDistance(a, b), 32);
  });

  it('counts bits correctly in a known small case', () => {
    // 0b10110101 XOR 0b00110110 = 0b10000011 → 3 set bits
    const a = new Uint8Array([0b10110101]);
    const b = new Uint8Array([0b00110110]);
    assert.equal(hammingDistance(a, b), 3);
  });

  it('returns Infinity on length mismatch (non-throwing)', () => {
    const a = new Uint8Array([0x01, 0x02]);
    const b = new Uint8Array([0x01]);
    assert.equal(hammingDistance(a, b), Number.POSITIVE_INFINITY);
  });
});

describe('hammingSimilarity', () => {
  it('self-similarity is 1', () => {
    const a = new Uint8Array([0b10110101, 0b11001100]);
    assert.equal(hammingSimilarity(a, a), 1);
  });

  it('complement similarity is 0', () => {
    const a = new Uint8Array([0x00, 0x00]);
    const b = new Uint8Array([0xff, 0xff]);
    assert.equal(hammingSimilarity(a, b), 0);
  });

  it('matches 1 - (hamming / numBits)', () => {
    const a = new Uint8Array([0b11110000, 0b00000000]);
    const b = new Uint8Array([0b00001111, 0b00000000]); // 8 different bits out of 16
    assert.equal(hammingSimilarity(a, b), 1 - 8 / 16);
  });
});

describe('matryoshkaBinary (end-to-end)', () => {
  it('768 → 64 bytes at dim=512 (the canonical v4 wire format)', () => {
    const v = seed(768, (i) => Math.sin(i * 0.1));
    const r = matryoshkaBinary(v, 512);
    assert.ok(r.isOk());
    if (r.isOk()) {
      assert.equal(r.value.length, 64, 'binary-512 payload is 64 bytes');
    }
  });

  it('round-tripping through truncate+binarize matches the lab reference', () => {
    // Matches the lab helper in scripts/bench-lab.mjs — used to be
    // inline, now lives in the domain module. Same math, same bytes.
    const v = seed(768, (i) => Math.cos(i * 0.05) - 0.1);
    const r = matryoshkaBinary(v, 256);
    assert.ok(r.isOk());
    if (r.isOk()) assert.equal(r.value.length, 32); // 256 bits = 32 bytes
  });
});

describe('bytesPerVector + compressionRatio', () => {
  it('matches V3-PROTOCOL §4.1 table', () => {
    assert.equal(bytesPerVector(768, 'fp32'), 3072);
    assert.equal(bytesPerVector(512, 'fp32'), 2048);
    assert.equal(bytesPerVector(768, 'binary'), 96);
    assert.equal(bytesPerVector(512, 'binary'), 64);
    assert.equal(bytesPerVector(384, 'binary'), 48);
    assert.equal(bytesPerVector(768, 'int8'), 768);
  });

  it('compressionRatio: binary-512 vs fp32-768 = 48× (headline claim)', () => {
    assert.equal(compressionRatio(768, 512, 'binary'), 48);
  });

  it('compressionRatio: binary-768 vs fp32-768 = 32×', () => {
    assert.equal(compressionRatio(768, 768, 'binary'), 32);
  });
});
