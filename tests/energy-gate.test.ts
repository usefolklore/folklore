/**
 * Tests for domain/energy-gate.ts — the energy-based OOD admission test
 * (docs/research/energy-based-inference.md §3).
 *
 * Properties under test:
 *  - free energy: empty → never admit; multiple moderate hits ACCUMULATE
 *    evidence (the fix for the [0.3,1] ceiling that made 0.85 unreachable);
 *  - admission requires ≥ minHits, enough −E mass, AND Hopfield separation;
 *  - the separation guard rejects the metastable regime (two topically-close
 *    answers with a tiny best-vs-second gap) even when total mass is high —
 *    the exact off-topic-hub failure mode;
 *  - the separation floor tightens as the pattern count grows.
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { freeEnergy, energyGate, ENERGY_GATE_DEFAULTS } from '../src/domain/energy-gate.ts';

describe('freeEnergy', () => {
  it('no hits → +Infinity (maximal energy, never admit)', () => {
    assert.equal(freeEnergy([], 0.1), Infinity);
  });

  it('multiple moderate hits accumulate more evidence than one (−E rises)', () => {
    const T = 0.1;
    const one = -freeEnergy([0.6], T);
    const many = -freeEnergy([0.6, 0.58, 0.55], T);
    assert.ok(many > one, `accumulation: −E(many)=${many} should exceed −E(one)=${one}`);
  });

  it('is numerically stable for large 1/T (no overflow)', () => {
    const e = freeEnergy([0.9, 0.8, 0.7], 0.01);
    assert.ok(Number.isFinite(e), `energy must be finite, got ${e}`);
  });
});

describe('energyGate', () => {
  const P = { T: ENERGY_GATE_DEFAULTS.T, tau: ENERGY_GATE_DEFAULTS.tau, beta: ENERGY_GATE_DEFAULTS.beta };

  it('admits a well-separated, high-similarity in-corpus result', () => {
    // top hit clearly above the rest → large Δ, high mass
    const v = energyGate([0.92, 0.45, 0.4], P);
    assert.ok(v.admit, `expected admit; verdict=${JSON.stringify(v)}`);
    assert.ok(v.separationOk);
  });

  it('rejects a single hit (below minHits) regardless of mass', () => {
    const v = energyGate([0.99], P);
    assert.ok(!v.admit, 'a single hit must not admit (≥2-hits rule)');
  });

  it('rejects the metastable regime: high mass but tiny best-vs-second gap', () => {
    // two near-identical top sims → Δ≈0 → separation guard fails even though
    // the accumulated −E mass is high. This is the off-topic-hub failure.
    const v = energyGate([0.9, 0.895, 0.5], P);
    assert.ok(v.negEnergy >= P.tau, 'mass is high here');
    assert.ok(!v.separationOk, 'separation guard must fail on a tiny gap');
    assert.ok(!v.admit, 'metastable result must not be admitted');
  });

  it('rejects off-topic out-of-corpus hits (insufficient −E mass below τ)', () => {
    // Real out-of-corpus hits sit at vec_distance > 1 → negative cosine sim;
    // their accumulated −E falls below the fitted τ=−0.016.
    const v = energyGate([-0.1, -0.15, -0.2], P);
    assert.ok(v.negEnergy < (P.tau ?? -0.016), `−E should be below τ, got ${v.negEnergy}`);
    assert.ok(!v.admit, 'off-topic out-of-corpus must not admit');
  });

  it('separation floor tightens as the pattern count grows', () => {
    const small = energyGate([0.9, 0.6], { ...P, patternCount: 2 });
    const large = energyGate([0.9, 0.6], { ...P, patternCount: 100_000 });
    assert.ok(
      large.separationFloor > small.separationFloor,
      'a bigger cache must demand more separation',
    );
  });
});
