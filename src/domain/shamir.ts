/**
 * Shamir's Secret Sharing over GF(2⁸) — pure domain primitive for
 * social key recovery (§6.3 of docs/V3-PROTOCOL.md).
 *
 * A user splits their 32-byte Ed25519 seed into n shares, any k of
 * which can reconstruct the seed. Losing up to n-k shares has no
 * effect on the secret's availability; anyone with fewer than k shares
 * learns zero bits of the secret (information-theoretic security).
 *
 * Implementation: classical Shamir 1979. For each byte of the secret,
 * generate a random polynomial of degree k-1 whose constant term is
 * the secret byte, evaluate at x = 1..n. A share is the tuple
 * (x, [f_byte_0(x), f_byte_1(x), ..., f_byte_31(x)]). Reconstruction
 * is Lagrange interpolation at x=0.
 *
 * All arithmetic in GF(2⁸) with the AES polynomial x⁸ + x⁴ + x³ + x + 1
 * (0x11b). Tables are computed once at module load time.
 *
 * Scope: this module implements the math. Wrapping shares in signed
 * envelopes and distributing them over libp2p is application-layer
 * work (not yet shipped — design is "user DID + signs each share
 * with device key; receivers store and verify on return").
 *
 * Zero deps. Pure, deterministic given the random byte source
 * passed in (default: Node's crypto.randomBytes — caller can inject
 * a seeded RNG for tests).
 */

import { randomBytes } from 'node:crypto';
import { Result, err, ok } from 'neverthrow';

// ─────────────────────── errors ───────────────────────────────────

export type ShamirError =
  | { readonly type: 'ShamirInvalidParameter'; readonly field: string; readonly message: string }
  | { readonly type: 'ShamirInsufficientShares'; readonly got: number; readonly need: number }
  | { readonly type: 'ShamirInconsistentShares'; readonly message: string }
  | { readonly type: 'ShamirDuplicateShareX'; readonly x: number };

export const ShamirError = {
  invalidParameter: (field: string, message: string): ShamirError => ({ type: 'ShamirInvalidParameter', field, message }),
  insufficientShares: (got: number, need: number): ShamirError => ({ type: 'ShamirInsufficientShares', got, need }),
  inconsistentShares: (message: string): ShamirError => ({ type: 'ShamirInconsistentShares', message }),
  duplicateShareX: (x: number): ShamirError => ({ type: 'ShamirDuplicateShareX', x }),
} as const;

// ─────────────────────── GF(2⁸) tables ────────────────────────────

// Irreducible polynomial for AES-compatible GF(2⁸): x⁸ + x⁴ + x³ + x + 1.
const GF_PRIM: number = 0x11b;

// Log / exp tables generated once. gfExp[gfLog[x]] = x for x != 0.
// Generator g = 3 (a primitive element of GF(2⁸) under this polynomial).
const GF_LOG = new Uint8Array(256);
const GF_EXP = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    GF_EXP[i] = x;
    GF_LOG[x] = i;
    // Multiply x by 3 (= x + 1 in polynomial form), reduce mod GF_PRIM.
    let xx = x << 1;
    if (x & 0x80) xx ^= GF_PRIM;
    x = (xx ^ GF_EXP[i]) & 0xff; // x * 3 = x * 2 ^ x
  }
  GF_EXP[255] = GF_EXP[0]; // wrap
})();

const gfMul = (a: number, b: number): number => {
  if (a === 0 || b === 0) return 0;
  return GF_EXP[(GF_LOG[a] + GF_LOG[b]) % 255];
};

const gfDiv = (a: number, b: number): number => {
  if (a === 0) return 0;
  if (b === 0) throw new Error('shamir: division by zero in GF(2^8)');
  const diff = GF_LOG[a] - GF_LOG[b];
  return GF_EXP[((diff % 255) + 255) % 255];
};

// ─────────────────────── shape ────────────────────────────────────

/** One share of a split secret. */
export interface SecretShare {
  /** x-coordinate of this share. Non-zero byte in [1, 255]. */
  readonly x: number;
  /** y-coordinates, one per secret byte. Length = length of original secret. */
  readonly y: Uint8Array;
}

// ─────────────────────── split ────────────────────────────────────

export interface SplitOptions {
  /** Injected random-byte source for tests. Default: crypto.randomBytes. */
  readonly rng?: (n: number) => Uint8Array;
}

/**
 * Split a secret into `shares` shares, any `threshold` of which can
 * reconstruct it. Threshold is inclusive — threshold=3 means you need
 * exactly 3 (or more) shares to recover.
 *
 *   1 ≤ threshold ≤ shares ≤ 255
 */
export const split = (
  secret: Uint8Array,
  shares: number,
  threshold: number,
  opts: SplitOptions = {},
): Result<readonly SecretShare[], ShamirError> => {
  if (!Number.isInteger(shares) || shares < 1 || shares > 255) {
    return err(ShamirError.invalidParameter('shares', `must be integer in [1, 255], got ${shares}`));
  }
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > shares) {
    return err(ShamirError.invalidParameter('threshold', `must be integer in [1, ${shares}], got ${threshold}`));
  }
  if (secret.length === 0) {
    return err(ShamirError.invalidParameter('secret', 'must be non-empty'));
  }

  const rng = opts.rng ?? ((n) => new Uint8Array(randomBytes(n)));

  // For each byte of the secret, build a degree (threshold-1) polynomial
  // with f(0) = secret_byte and random coefficients for higher terms.
  // Evaluate at x = 1..shares to produce each share's y_i for this byte.
  const L = secret.length;
  const result: SecretShare[] = [];
  for (let s = 0; s < shares; s++) {
    result.push({ x: s + 1, y: new Uint8Array(L) });
  }

  // Random coefficient buffer for all bytes at once — one call to rng
  const coeffBuf = rng(L * (threshold - 1));
  for (let byteIdx = 0; byteIdx < L; byteIdx++) {
    const a0 = secret[byteIdx];
    // Build polynomial coefficients: a[0] = secret, a[1..threshold-1] random
    const coeffs = new Uint8Array(threshold);
    coeffs[0] = a0;
    for (let c = 1; c < threshold; c++) {
      coeffs[c] = coeffBuf[byteIdx * (threshold - 1) + (c - 1)];
    }
    // Evaluate at x = 1..shares via Horner's method for GF(2⁸)
    for (let s = 0; s < shares; s++) {
      const x = s + 1;
      let y = 0;
      // Horner: y = (((a_{t-1}) * x + a_{t-2}) * x + ...) * x + a_0
      for (let c = threshold - 1; c >= 0; c--) {
        y = gfMul(y, x) ^ coeffs[c];
      }
      result[s].y[byteIdx] = y;
    }
  }

  return ok(result);
};

// ─────────────────────── combine ──────────────────────────────────

/**
 * Reconstruct the secret from a collection of shares. Needs ≥ threshold
 * distinct-x shares; extra shares are fine (any threshold-sized subset
 * works; all-shares form is over-determined but consistent).
 *
 * Uses Lagrange interpolation at x=0 over each byte.
 */
export const combine = (shares: readonly SecretShare[]): Result<Uint8Array, ShamirError> => {
  if (shares.length < 1) {
    return err(ShamirError.insufficientShares(0, 1));
  }
  // Validate all y-lengths match
  const L = shares[0].y.length;
  for (const s of shares) {
    if (s.y.length !== L) {
      return err(ShamirError.inconsistentShares(`y lengths differ: ${L} vs ${s.y.length}`));
    }
  }
  // Validate x values are distinct and in [1, 255]
  const seenX = new Set<number>();
  for (const s of shares) {
    if (s.x < 1 || s.x > 255 || !Number.isInteger(s.x)) {
      return err(ShamirError.invalidParameter('x', `share x=${s.x} must be integer in [1, 255]`));
    }
    if (seenX.has(s.x)) return err(ShamirError.duplicateShareX(s.x));
    seenX.add(s.x);
  }

  const out = new Uint8Array(L);
  const xs = shares.map((s) => s.x);

  for (let byteIdx = 0; byteIdx < L; byteIdx++) {
    // Lagrange at x=0:
    //   secret = Σ_j y_j · Π_{i≠j} (x_i) / (x_i ⊕ x_j)
    // All arithmetic in GF(2⁸).
    let acc = 0;
    for (let j = 0; j < shares.length; j++) {
      const xj = xs[j];
      const yj = shares[j].y[byteIdx];
      let num = 1;
      let den = 1;
      for (let i = 0; i < shares.length; i++) {
        if (i === j) continue;
        const xi = xs[i];
        // At x=0, numerator factor is (0 - x_i) = x_i in GF(2⁸) (additive inverse = self).
        num = gfMul(num, xi);
        den = gfMul(den, xi ^ xj);
      }
      try {
        acc ^= gfMul(yj, gfDiv(num, den));
      } catch (e) {
        return err(ShamirError.inconsistentShares((e as Error).message));
      }
    }
    out[byteIdx] = acc;
  }

  return ok(out);
};
