/**
 * Pure Bloom filter — the primitive behind wellinformed v3's
 * federated-search pre-filter (§9.2 of docs/V3-PROTOCOL.md).
 *
 * Each peer publishes a compact filter of its indexed node content at
 * capability-exchange time. A query-sending peer consults all received
 * filters and fans out only to peers whose filter tests positive for
 * the query tokens. Expected bandwidth reduction: 10–100× on sparse
 * topic matches, measured via `scripts/bench-bloom.mjs` (v3.2).
 *
 * Design:
 *   - Zero dependencies. Pure TypedArray bit manipulation.
 *   - Deterministic hashing via FNV-1a × 2 with Kirsch-Mitzenmacher
 *     double-hashing to derive k hash indices from two base hashes
 *     (g_i(x) = h1(x) + i * h2(x) mod m) — standard technique,
 *     shown asymptotically equivalent to k independent hashes at
 *     negligible quality cost (Kirsch & Mitzenmacher 2006).
 *   - Serializable as Uint8Array for wire transmission: 8-byte header
 *     (m:u32 bits, k:u32 hashes) + ceil(m / 8) bytes of bit data.
 *
 * No classes, no throws. Fallible ops return neverthrow Result.
 */

import { Result, err, ok } from 'neverthrow';

// ─────────────────────── errors ───────────────────────────────────

export type BloomError =
  | { readonly type: 'BloomInvalidParameter'; readonly field: string; readonly message: string }
  | { readonly type: 'BloomDecodeError'; readonly message: string };

export const BloomError = {
  invalidParameter: (field: string, message: string): BloomError => ({
    type: 'BloomInvalidParameter',
    field,
    message,
  }),
  decodeError: (message: string): BloomError => ({ type: 'BloomDecodeError', message }),
} as const;

// ─────────────────────── public shape ─────────────────────────────

/**
 * An opaque Bloom filter value. Fields are readonly and deterministic;
 * two filters with identical (m, k, bytes) values test identically.
 */
export interface Bloom {
  /** Total bits in the filter. */
  readonly m: number;
  /** Number of hash probes per insert/query. */
  readonly k: number;
  /** Bit-packed filter data. Length = ceil(m / 8). */
  readonly bits: Uint8Array;
}

// ─────────────────────── construction ─────────────────────────────

/**
 * Create an empty Bloom filter with `m` bits and `k` hash probes.
 * Callers typically derive (m, k) from `optimalParams(n, p)` below.
 */
export const create = (m: number, k: number): Result<Bloom, BloomError> => {
  if (!Number.isInteger(m) || m < 8 || m > 1 << 26) {
    return err(BloomError.invalidParameter('m', `must be 8..2^26 integer, got ${m}`));
  }
  if (!Number.isInteger(k) || k < 1 || k > 32) {
    return err(BloomError.invalidParameter('k', `must be 1..32 integer, got ${k}`));
  }
  const bytes = (m + 7) >> 3;
  return ok({ m, k, bits: new Uint8Array(bytes) });
};

/**
 * Derive optimal (m, k) for expecting `n` inserts at target false-positive rate `p`.
 *   m ≈ -n ln(p) / (ln 2)² ,  k ≈ (m/n) ln 2
 *
 * Rounds up to next byte boundary so the filter packs cleanly. The
 * returned k is clamped to [1, 32] — callers with extreme targets
 * should set (m, k) directly.
 */
export const optimalParams = (n: number, p: number): { m: number; k: number } => {
  if (n < 1) n = 1;
  if (p <= 0 || p >= 1) p = 0.01;
  const ln2 = Math.LN2;
  const rawM = -(n * Math.log(p)) / (ln2 * ln2);
  const m = Math.max(8, Math.ceil(rawM / 8) * 8);
  const rawK = (m / n) * ln2;
  const k = Math.max(1, Math.min(32, Math.round(rawK)));
  return { m, k };
};

// ─────────────────────── double hashing ───────────────────────────

/**
 * FNV-1a 32-bit, operating on raw bytes. Pure and fast, suitable for
 * filter hashing. Same constants as widely-used implementations.
 */
const fnv1a32 = (bytes: Uint8Array, seed: number): number => {
  let h = seed >>> 0;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};

/**
 * Derive k hash indices for a value under the filter's `m` via
 * Kirsch-Mitzenmacher double-hashing: g_i(x) = h1(x) + i * h2(x) mod m.
 * Two FNV-1a seeds (0x811c9dc5, 0xdeadbeef) give h1, h2.
 */
const indices = (bytes: Uint8Array, m: number, k: number): readonly number[] => {
  const h1 = fnv1a32(bytes, 0x811c9dc5);
  const h2 = fnv1a32(bytes, 0xdeadbeef);
  const out = new Array<number>(k);
  for (let i = 0; i < k; i++) {
    // Use unsigned arithmetic; % m stays in [0, m).
    out[i] = ((h1 + Math.imul(i, h2)) >>> 0) % m;
  }
  return out;
};

const textBytes = (s: string): Uint8Array => new TextEncoder().encode(s);

// ─────────────────────── core ops (pure, return new filter) ───────

/**
 * Return a new filter with `value` marked present. Does NOT mutate
 * the input filter — pure function. Callers doing bulk inserts
 * should use `insertMany` which mutates an accumulator internally
 * and returns a new frozen view, avoiding O(n²) copies.
 */
export const insert = (filter: Bloom, value: string | Uint8Array): Bloom => {
  const bytes = typeof value === 'string' ? textBytes(value) : value;
  const next = new Uint8Array(filter.bits); // copy
  for (const idx of indices(bytes, filter.m, filter.k)) {
    next[idx >> 3] |= 1 << (idx & 7);
  }
  return { m: filter.m, k: filter.k, bits: next };
};

/** Bulk insert — O(n * k) total, one filter allocation. */
export const insertMany = (
  filter: Bloom,
  values: Iterable<string | Uint8Array>,
): Bloom => {
  const next = new Uint8Array(filter.bits); // one copy for the whole batch
  for (const value of values) {
    const bytes = typeof value === 'string' ? textBytes(value) : value;
    for (const idx of indices(bytes, filter.m, filter.k)) {
      next[idx >> 3] |= 1 << (idx & 7);
    }
  }
  return { m: filter.m, k: filter.k, bits: next };
};

/**
 * Test membership. False positives possible at the rate `p` chosen at
 * construction; false negatives impossible.
 */
export const mayContain = (filter: Bloom, value: string | Uint8Array): boolean => {
  const bytes = typeof value === 'string' ? textBytes(value) : value;
  for (const idx of indices(bytes, filter.m, filter.k)) {
    if ((filter.bits[idx >> 3] & (1 << (idx & 7))) === 0) return false;
  }
  return true;
};

/**
 * Union two filters — bitwise OR. Useful for building a combined
 * filter over multiple rooms without re-inserting each value.
 *
 * Errors if the parameters don't match: filters can only union under
 * identical (m, k).
 */
export const union = (a: Bloom, b: Bloom): Result<Bloom, BloomError> => {
  if (a.m !== b.m || a.k !== b.k) {
    return err(
      BloomError.invalidParameter(
        'params',
        `cannot union filters with different (m,k): (${a.m},${a.k}) vs (${b.m},${b.k})`,
      ),
    );
  }
  const next = new Uint8Array(a.bits.length);
  for (let i = 0; i < next.length; i++) next[i] = a.bits[i] | b.bits[i];
  return ok({ m: a.m, k: a.k, bits: next });
};

/**
 * Estimated count of distinct insertions, per Swamidass-Baldi.
 *   n̂ = -(m/k) * ln(1 - X/m)
 * where X is the number of set bits. Useful for capacity monitoring;
 * when n̂ approaches the designed `n` callers should rotate filters
 * (fresh, empty filter for the next epoch) rather than continue
 * inserting past capacity.
 */
export const estimatedSize = (filter: Bloom): number => {
  let setBits = 0;
  for (let i = 0; i < filter.bits.length; i++) {
    let b = filter.bits[i];
    while (b) { setBits += b & 1; b >>= 1; }
  }
  if (setBits === filter.m) return Infinity;
  if (setBits === 0) return 0;
  return -((filter.m / filter.k) * Math.log(1 - setBits / filter.m));
};

/** Fill ratio (set_bits / m). Rises toward 1 as the filter approaches saturation. */
export const fillRatio = (filter: Bloom): number => {
  let setBits = 0;
  for (let i = 0; i < filter.bits.length; i++) {
    let b = filter.bits[i];
    while (b) { setBits += b & 1; b >>= 1; }
  }
  return setBits / filter.m;
};

// ─────────────────────── serialization ────────────────────────────

/**
 * Wire format (v1):
 *   byte 0       magic = 0xB1 ('B' ⊕ 0xF3)
 *   byte 1       version = 1
 *   bytes 2..5   m as little-endian u32
 *   bytes 6..9   k as little-endian u32
 *   bytes 10..   ceil(m/8) bytes of bit data
 *
 * Total wire size: 10 + ceil(m/8) bytes. For a filter designed at
 * n=10000 entries, p=0.01: m=95851, k=7 → 11996-byte filter + 10-byte
 * header = ~12 KB. Well within libp2p identify-protocol budgets.
 */
const BLOOM_MAGIC = 0xb1;
const BLOOM_VERSION = 1;

export const encode = (filter: Bloom): Uint8Array => {
  const out = new Uint8Array(10 + filter.bits.length);
  out[0] = BLOOM_MAGIC;
  out[1] = BLOOM_VERSION;
  // little-endian u32
  out[2] = filter.m & 0xff;
  out[3] = (filter.m >>> 8) & 0xff;
  out[4] = (filter.m >>> 16) & 0xff;
  out[5] = (filter.m >>> 24) & 0xff;
  out[6] = filter.k & 0xff;
  out[7] = (filter.k >>> 8) & 0xff;
  out[8] = (filter.k >>> 16) & 0xff;
  out[9] = (filter.k >>> 24) & 0xff;
  out.set(filter.bits, 10);
  return out;
};

export const decode = (bytes: Uint8Array): Result<Bloom, BloomError> => {
  if (bytes.length < 10) return err(BloomError.decodeError(`too short: ${bytes.length} < 10`));
  if (bytes[0] !== BLOOM_MAGIC) return err(BloomError.decodeError(`bad magic: 0x${bytes[0].toString(16)}`));
  if (bytes[1] !== BLOOM_VERSION) return err(BloomError.decodeError(`bad version: ${bytes[1]}`));
  const m = bytes[2] | (bytes[3] << 8) | (bytes[4] << 16) | (bytes[5] << 24);
  const k = bytes[6] | (bytes[7] << 8) | (bytes[8] << 16) | (bytes[9] << 24);
  const expectedBitsLen = (m + 7) >> 3;
  if (bytes.length !== 10 + expectedBitsLen) {
    return err(BloomError.decodeError(`size mismatch: expected ${10 + expectedBitsLen}, got ${bytes.length}`));
  }
  if (m < 8 || m > 1 << 26 || k < 1 || k > 32) {
    return err(BloomError.decodeError(`bad params: m=${m}, k=${k}`));
  }
  return ok({ m, k, bits: bytes.slice(10) });
};
