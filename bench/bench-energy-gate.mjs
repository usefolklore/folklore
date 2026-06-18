/**
 * bench-energy-gate — does the energy-based admission score SEPARATE
 * in-corpus from out-of-corpus on the real graph, where the composite
 * satisfaction score did not (AUC=0.52, see DENY-CALIBRATION-REAL.md)?
 *
 * Reuses the bench-deny-real labeled fixtures (36 in-corpus + 22 out-of-corpus,
 * derived from real node titles / topically-absent domains). Runs each through
 * the REAL ask path (`node dist/cli/index.js ask "<q>" --json --workspace all`)
 * and reads `satisfaction_detail.energy` (the EnergyGateVerdict now exposed in
 * the JSON). Reports:
 *   - in vs out −E(q) (negEnergy) and separation distributions,
 *   - the Mann-Whitney AUC of −E(q) as a separator (vs the 0.52 baseline),
 *   - admit-rate per class at the default τ/β (true-admit vs false-admit).
 *
 * Honest: this VALIDATES the energy gate; it does not fabricate a fit. If AUC
 * stays ~0.5, the energy score doesn't separate either and the doc's
 * "sharpen sim_i first (token-set coverage)" conclusion stands.
 *
 *   node bench/bench-energy-gate.mjs [--k 5] [--limit N]
 */

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'dist', 'cli', 'index.js');
const FIXTURE_DIR = join(ROOT, 'eval', 'fixtures', 'deny-real');
const args = process.argv.slice(2);
const K = Number(args[args.indexOf('--k') + 1]) || 5;
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const folkloreHome = process.env.FOLKLORE_HOME || join(homedir(), '.folklore');

const loadJsonl = (name) =>
  readFileSync(join(FIXTURE_DIR, name), 'utf8')
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));

const inCorpus = loadJsonl('in-corpus.jsonl').slice(0, LIMIT);
const outOfCorpus = loadJsonl('out-of-corpus.jsonl').slice(0, LIMIT);

const probe = (query) => {
  const r = spawnSync('node', [CLI, 'ask', query, '--json', '--k', String(K), '--workspace', 'all'], {
    env: { ...process.env, FOLKLORE_HOME: folkloreHome },
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) return null;
  try {
    const out = JSON.parse(r.stdout.trim().split('\n').pop());
    return out.satisfaction_detail?.energy ?? null;
  } catch {
    return null;
  }
};

const run = (rows, label) => {
  const out = [];
  for (const row of rows) {
    const e = probe(row.query);
    out.push({ query: row.query, energy: e });
    process.stderr.write('.');
  }
  process.stderr.write(` ${label} done\n`);
  return out;
};

const quantiles = (xs) => {
  if (xs.length === 0) return { p10: NaN, median: NaN, p90: NaN };
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { p10: q(0.1), median: q(0.5), p90: q(0.9) };
};

// Mann-Whitney AUC: P(in > out) + 0.5 P(tie).
const auc = (pos, neg) => {
  if (pos.length === 0 || neg.length === 0) return NaN;
  let wins = 0;
  for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0;
  return wins / (pos.length * neg.length);
};

console.error(`bench-energy-gate: ${inCorpus.length} in + ${outOfCorpus.length} out, k=${K} — real ask path…`);
const inRes = run(inCorpus, 'in-corpus');
const outRes = run(outOfCorpus, 'out-of-corpus');

const negE = (rs) => rs.filter((r) => r.energy).map((r) => r.energy.negEnergy);
const sep = (rs) => rs.filter((r) => r.energy).map((r) => r.energy.separation);
const admitRate = (rs) => {
  const withE = rs.filter((r) => r.energy);
  return withE.length === 0 ? NaN : withE.filter((r) => r.energy.admit).length / withE.length;
};

const inNegE = negE(inRes);
const outNegE = negE(outRes);
const fmt = (q) => `p10=${q.p10?.toFixed(3)} med=${q.median?.toFixed(3)} p90=${q.p90?.toFixed(3)}`;

console.log('\n══ ENERGY-GATE VALIDATION (real graph) ══\n');
console.log(`−E(q) in-corpus    : ${fmt(quantiles(inNegE))}`);
console.log(`−E(q) out-of-corpus: ${fmt(quantiles(outNegE))}`);
console.log(`separation in      : ${fmt(quantiles(sep(inRes)))}`);
console.log(`separation out     : ${fmt(quantiles(sep(outRes)))}`);
console.log('');
console.log(`AUC(−E) in-vs-out   : ${auc(inNegE, outNegE).toFixed(3)}   (satisfaction baseline was 0.52)`);
console.log(`true-admit  (in)    : ${(admitRate(inRes) * 100).toFixed(0)}%   (want high)`);
console.log(`false-admit (out)   : ${(admitRate(outRes) * 100).toFixed(0)}%   (want ~0 — the costly error)`);
console.log('');
// τ-sweep (separation guard advisory, not gating) — find the Youden-optimal
// operating point on −E(q). This is the fit the gate should bake.
const grid = [];
const lo = Math.min(...inNegE, ...outNegE);
const hi = Math.max(...inNegE, ...outNegE);
for (let i = 0; i <= 40; i++) {
  const tau = lo + ((hi - lo) * i) / 40;
  const tpr = inNegE.filter((x) => x >= tau).length / inNegE.length;
  const fpr = outNegE.filter((x) => x >= tau).length / outNegE.length;
  grid.push({ tau, tpr, fpr, youden: tpr - fpr });
}
const best = grid.reduce((b, c) => (c.youden > b.youden ? c : b), grid[0]);
console.log(
  `best τ (Youden)     : τ=${best.tau.toFixed(3)} → true-admit ${(best.tpr * 100).toFixed(0)}% / false-admit ${(best.fpr * 100).toFixed(0)}%`,
);
console.log('');
const a = auc(inNegE, outNegE);
if (Number.isNaN(a)) console.log('VERDICT: no energy verdicts captured — check ask --json output / build.');
else if (a >= 0.7) console.log(`VERDICT: energy SEPARATES (AUC ${a.toFixed(2)}) — fit τ/β here and ship the gate.`);
else if (a > 0.55) console.log(`VERDICT: weak separation (AUC ${a.toFixed(2)}) — better than 0.52 but sharpen sim_i (token-set coverage) before shipping.`);
else console.log(`VERDICT: energy does NOT separate (AUC ${a.toFixed(2)}) — the sims themselves don't discriminate; fix sim_i (token-set coverage / stronger embedder) first. No fabricated win.`);
