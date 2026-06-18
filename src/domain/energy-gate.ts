/**
 * energy-gate — an energy-based out-of-distribution admission test for the
 * deny gate (RFC-0003 / docs/research/energy-based-inference.md §3).
 *
 * The shipped gate fires on `satisfaction ≥ 0.85`, but satisfaction is a
 * composite compressed into [0.3, 1] and 0.85 is empirically unreachable
 * (real-query AUC = 0.52, 0% web deflection — see DENY-CALIBRATION-REAL.md).
 * The failure is structural: a single clamped score can't let multiple
 * moderate hits accumulate evidence.
 *
 * This module computes a free-energy admission score over the retrieved hits'
 * similarities (Liu et al., NeurIPS 2020, energy-based OOD detection):
 *
 *     E(q)  = −T · logsumexp_i( sim_i / T )          (free energy; lower = more in-distribution)
 *     admit ⇔ −E(q) ≥ τ                              (enough total evidence mass)
 *
 * plus a modern-Hopfield SEPARATION guard (Ramsauer et al., ICLR 2021) that
 * rejects the metastable "two topically-close answers blur together" regime —
 * the exact failure that made off-topic high-centrality hubs look relevant:
 *
 *     β · Δ ≥ log( 2 (n−1) n β )      with  Δ = sim_(1) − sim_(2)
 *
 * The guard tightens as the pattern count n grows (a larger cache demands more
 * separation), so it is self-scaling. logsumexp lets several moderate hits
 * accumulate confidence instead of being clamped under a ceiling — directly
 * removing the 0.85-unreachable pathology.
 *
 * Pure + dependency-free. T, τ, β are calibrated on the real in-corpus vs
 * out-of-corpus distribution (`bench-energy-gate`, temperature scaling — Guo et
 * al. ICML 2017); the defaults here are PROVISIONAL until that fit lands.
 */

/**
 * Defaults fitted on the real graph via `bench-energy-gate` (2026-06-18,
 * 36 in-corpus + 22 out-of-corpus). −E(q) separates the classes at
 * **AUC = 0.78** (the composite satisfaction score managed only 0.52); the
 * Youden-optimal operating point on −E was **τ = −0.016 → 57% true-admit /
 * 0% false-admit**. Provisional — fitted on 58 points; re-fit as the labeled
 * set grows (and after the token-set-coverage change sharpens `sim_i`).
 */
export const ENERGY_GATE_DEFAULTS = {
  /** Temperature for the free-energy logsumexp. */
  T: 0.1,
  /** Admission floor on −E(q) (the accumulated evidence mass). Fitted. */
  tau: -0.016,
  /**
   * Minimum best-vs-second similarity gap to admit — the PRACTICAL
   * separation guard that rejects the metastable regime (two topically-close
   * answers blur into one basin). The literal Hopfield capacity floor
   * `log(2(n−1)nβ)` is ~6 in this compressed-cosine regime where real gaps
   * are ~0.02, so it never passes; `sepMin` is the data-scaled stand-in. The
   * theoretical floor is still reported (separationFloor) for reference.
   */
  sepMin: 0.01,
  /** Inverse temperature for the (reported-only) theoretical Hopfield floor. */
  beta: 12,
} as const;

export interface EnergyGateParams {
  readonly T?: number;
  readonly tau?: number;
  readonly beta?: number;
  /** Practical minimum best-vs-second gap to admit (metastable rejection). */
  readonly sepMin?: number;
  /**
   * Pattern count for the (reported-only) theoretical Hopfield floor. Ideally
   * the live cached-pattern count; defaults to the number of similarities.
   */
  readonly patternCount?: number;
  /** Minimum hits required to admit (mirrors the gate's ≥2-hits rule). */
  readonly minHits?: number;
}

export interface EnergyGateVerdict {
  /** Free energy E(q) = −T·logsumexp(sim/T). Lower = more in-distribution. */
  readonly energy: number;
  /** −E(q): the accumulated evidence mass that must clear τ. */
  readonly negEnergy: number;
  /** Best-minus-second similarity gap Δ (0 when fewer than 2 hits). */
  readonly separation: number;
  /** Theoretical Hopfield floor log(2(n−1)nβ)/β — reported for reference only. */
  readonly separationFloor: number;
  /** Whether the practical separation guard passed (Δ ≥ sepMin). */
  readonly separationOk: boolean;
  /** Final admission: enough evidence mass AND Δ ≥ sepMin AND ≥ minHits. */
  readonly admit: boolean;
}

/** Numerically-stable log-sum-exp. */
const logSumExp = (xs: readonly number[]): number => {
  if (xs.length === 0) return -Infinity;
  const m = Math.max(...xs);
  if (!Number.isFinite(m)) return m;
  let sum = 0;
  for (const x of xs) sum += Math.exp(x - m);
  return m + Math.log(sum);
};

/**
 * Free energy over a set of similarity scores.
 * E = −T · logsumexp(sim_i / T). With one dominant high sim it ≈ −max(sim);
 * with several moderate sims the mass accumulates (the point).
 */
export const freeEnergy = (sims: readonly number[], T: number): number => {
  if (sims.length === 0) return Infinity; // no hits → maximal energy → never admit
  return -T * logSumExp(sims.map((s) => s / T));
};

/**
 * Compute the full energy-gate verdict from per-hit similarities
 * (sim_i = 1 − vec_distance_i, the true embedding proximity). Pure.
 */
export const energyGate = (
  sims: readonly number[],
  params?: EnergyGateParams,
): EnergyGateVerdict => {
  const T = params?.T ?? ENERGY_GATE_DEFAULTS.T;
  const tau = params?.tau ?? ENERGY_GATE_DEFAULTS.tau;
  const beta = params?.beta ?? ENERGY_GATE_DEFAULTS.beta;
  const sepMin = params?.sepMin ?? ENERGY_GATE_DEFAULTS.sepMin;
  const minHits = params?.minHits ?? 2;
  const n = Math.max(params?.patternCount ?? sims.length, sims.length);

  const energy = freeEnergy(sims, T);
  const negEnergy = -energy;

  const sorted = [...sims].sort((a, b) => b - a);
  const separation = sorted.length >= 2 ? sorted[0] - sorted[1] : 0;
  // Reported-only theoretical Hopfield floor β·Δ ≥ log(2(n−1)nβ), normalized
  // to a Δ-scale by dividing by β. In the compressed-cosine regime this is
  // ~0.5 (unreachable), so admission gates on the practical sepMin instead.
  const separationFloor = n >= 2 ? Math.log(2 * (n - 1) * n * beta) / beta : Infinity;
  const separationOk = sims.length >= 2 && separation >= sepMin;

  const admit = sims.length >= minHits && negEnergy >= tau && separationOk;

  return { energy, negEnergy, separation, separationFloor, separationOk, admit };
};
