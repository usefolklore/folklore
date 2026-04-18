/**
 * Binary quantization + Matryoshka truncation — pure domain primitives.
 *
 * These are the math behind Phase 3 of the v4 plan: take an fp32 unit
 * vector, optionally truncate to a smaller MRL-supported dimension
 * (the model must be Matryoshka-trained), pack each dimension to its
 * sign bit, and score via popcount Hamming distance. On nomic-v1.5
 * at dim=512 this gives 48× storage compression (64 bytes vs 3,072
 * bytes fp32-768) with −1.79 pt worst-case NDCG@10 across 4 BEIR sets
 * in the production hybrid RRF pipeline — measured, not theoretical.
 * See `.planning/BENCH-v2.md §2f`.
 *
 * The functions in this module previously lived inline in
 * `scripts/bench-lab.mjs` / `scripts/bench-matryoshka.mjs` for the lab
 * sweeps. Lifting them here makes them reusable by the production
 * `VectorIndex` (Phase 3b) and the federated-sync bandwidth negotiator
 * (§4.2 of docs/V3-PROTOCOL.md).
 *
 * All functions are pure, synchronous, zero-allocation where possible.
 * No classes. Float64Array inputs are accepted for convenience but not
 * required — the module is hot-loop friendly.
 */

import { Result, err, ok } from 'neverthrow';

// ─────────────── errors ───────────────

export type BinaryQuantizeError =
  | { readonly type: 'BQInvalidDim'; readonly expected: number; readonly got: number }
  | { readonly type: 'BQDimOutOfRange'; readonly fullDim: number; readonly target: number };

export const BinaryQuantizeError = {
  invalidDim: (expected: number, got: number): BinaryQuantizeError => ({
    type: 'BQInvalidDim',
    expected,
    got,
  }),
  dimOutOfRange: (fullDim: number, target: number): BinaryQuantizeError => ({
    type: 'BQDimOutOfRange',
    fullDim,
    target,
  }),
} as const;

// ─────────────── Matryoshka truncation ───────────────

/**
 * Matryoshka-safe truncation: apply a parameterless LayerNorm-like
 * centering+scaling across the full dim, slice to the first `dim`
 * components, then L2-renormalize so the result is unit length.
 *
 * This is the procedure Nomic documents for nomic-embed-text-v1.5
 * MRL: `F.layer_norm` before slicing. Scale-invariance means it's
 * safe to apply to an already-L2-normalized vector — the output is
 * functionally equivalent to applying LN to the raw pooled output
 * first, then slicing, then L2-norming.
 *
 * LN here is parameterless (weight=1, bias=0, eps=1e-5) — Nomic's
 * MRL head uses this canonical form.
 */
export const truncateMRL = (
  v: Float32Array | Float64Array,
  dim: number,
): Result<Float32Array, BinaryQuantizeError> => {
  if (dim < 1 || dim > v.length) {
    return err(BinaryQuantizeError.dimOutOfRange(v.length, dim));
  }

  // Parameterless LayerNorm across full dim.
  const n = v.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += v[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    const d = v[i] - mean;
    variance += d * d;
  }
  variance /= n;
  const denom = Math.sqrt(variance + 1e-5);

  // Slice + L2 renormalize in one pass.
  const sliced = new Float32Array(dim);
  let sumsq = 0;
  for (let i = 0; i < dim; i++) {
    const x = (v[i] - mean) / denom;
    sliced[i] = x;
    sumsq += x * x;
  }
  const norm = Math.sqrt(sumsq) || 1;
  for (let i = 0; i < dim; i++) sliced[i] /= norm;

  return ok(sliced);
};

// ─────────────── binary packing ───────────────

/**
 * Pack a vector into its sign-bit binary form. Output is
 * `Uint8Array(ceil(dim/8))`: each bit `i` is set iff `v[i] > 0`. A
 * value of exactly 0.0 maps to the clear bit — deterministic choice.
 *
 * Bit order: little-endian within each byte (bit 0 = first dim of the
 * octet). This matches the wire format described in
 * `docs/V3-PROTOCOL.md §4.1`.
 */
export const binarize = (v: Float32Array | Float64Array): Uint8Array => {
  const n = v.length;
  const bytes = (n + 7) >> 3;
  const out = new Uint8Array(bytes);
  for (let i = 0; i < n; i++) {
    if (v[i] > 0) out[i >> 3] |= 1 << (i & 7);
  }
  return out;
};

/**
 * Convenience: truncate to dim + binarize in one call. Returns the
 * packed bytes (ceil(dim/8)) — for dim=512 that's 64 bytes.
 */
export const matryoshkaBinary = (
  v: Float32Array | Float64Array,
  dim: number,
): Result<Uint8Array, BinaryQuantizeError> => truncateMRL(v, dim).map(binarize);

// ─────────────── Hamming distance ───────────────

// 8-bit popcount table — built once at module load.
const POPCOUNT = new Uint8Array(256);
(() => {
  for (let i = 0; i < 256; i++) {
    let x = i;
    let c = 0;
    while (x) { c += x & 1; x >>= 1; }
    POPCOUNT[i] = c;
  }
})();

/**
 * Hamming distance between two equal-length binary vectors. Returns
 * the number of differing bits.
 *
 * This is a hot-loop primitive; implementation is straight popcount
 * over the XOR. On modern CPUs the V8 JIT folds this to hardware
 * POPCNT; at the binary-512 size (64 bytes) it runs in ~100 ns per
 * pair. At 10k corpus that's ~1 ms end-to-end.
 *
 * Higher distance = less similar. For Hamming-based ranking, sort
 * ascending by this value.
 */
export const hammingDistance = (a: Uint8Array, b: Uint8Array): number => {
  if (a.length !== b.length) {
    // Mismatched lengths indicate a bug upstream — return Infinity so
    // the pair will never rank well. Kept non-throwing for hot-loop
    // safety; callers that care should assert lengths at their own
    // boundary.
    return Number.POSITIVE_INFINITY;
  }
  let d = 0;
  for (let i = 0; i < a.length; i++) d += POPCOUNT[a[i] ^ b[i]];
  return d;
};

/**
 * Convert a Hamming distance into a similarity score in [0, 1] by
 * normalizing against the maximum possible distance (the bit length).
 *
 * sim = 1 - (hamming / numBits)
 *
 * Useful when feeding Hamming-ranked results into RRF alongside
 * cosine-ranked results — RRF is rank-based so the absolute score
 * doesn't matter, but other fusion schemes might need a similarity
 * in [0, 1].
 */
export const hammingSimilarity = (a: Uint8Array, b: Uint8Array): number => {
  if (a.length !== b.length) return 0;
  const numBits = a.length * 8;
  return 1 - hammingDistance(a, b) / numBits;
};

// ─────────────── storage accounting ───────────────

/**
 * Byte cost of storing a `dim`-dimensional vector under a given
 * quantization. Matches `docs/V3-PROTOCOL.md §4.1`.
 */
export type Quantization = 'fp32' | 'int8' | 'binary';

export const bytesPerVector = (dim: number, quant: Quantization): number => {
  switch (quant) {
    case 'fp32': return dim * 4;
    case 'int8': return dim;
    case 'binary': return (dim + 7) >> 3;
  }
};

/**
 * Compression ratio of `quant` at `dim` vs the fp32 full-precision
 * baseline at `fullDim`. For (dim=512, quant='binary', fullDim=768):
 * fp32-768 = 3072 bytes, binary-512 = 64 bytes → ratio 48.
 */
export const compressionRatio = (
  fullDim: number,
  dim: number,
  quant: Quantization,
): number => (fullDim * 4) / bytesPerVector(dim, quant);
