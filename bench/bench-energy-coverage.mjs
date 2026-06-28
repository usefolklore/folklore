/**
 * bench-energy-coverage — does multiplying sim_i by token-set coverage SHARPEN
 * the energy gate's separation (the "fix sim_i" lever bench-energy-gate flagged)?
 *
 * Measurement-only, no live-code change: runs the real `ask --json` per deny-real
 * fixture, pulls per-hit (distance, label+summary), and recomputes -E(q) two ways:
 *   raw       : sim_i = 1 - distance
 *   coverage  : sim_i' = sim_i * max(floor, coverage_i),
 *               coverage_i = |q_tokens ∩ hit_tokens| / |q_tokens|
 * Reports AUC(in vs out) for both. If coverage AUC >> raw, wiring it into the
 * gate's sim_i is justified; if not, the lever doesn't help and we say so.
 *
 *   node bench/bench-energy-coverage.mjs [--k 5] [--limit N] [--floor 0.2]
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'dist', 'cli', 'index.js');
const DIR = join(ROOT, 'eval', 'fixtures', 'deny-real');
const a = process.argv.slice(2);
const K = Number(a[a.indexOf('--k') + 1]) || 5;
const LIMIT = a.includes('--limit') ? Number(a[a.indexOf('--limit') + 1]) : Infinity;
const FLOOR = a.includes('--floor') ? Number(a[a.indexOf('--floor') + 1]) : 0.2;
const T = 0.1;
const HOME = process.env.FOLKLORE_HOME || join(homedir(), '.folklore');

const STOP = new Set('the a an of to in on for and or is are was were be by with that this it as at from into what does do how why which paper propose'.split(' '));
const toks = (s) => new Set(String(s).toLowerCase().match(/[a-z0-9]+/g)?.filter((t) => t.length > 2 && !STOP.has(t)) ?? []);
const logSumExp = (xs) => { if (!xs.length) return -Infinity; const m = Math.max(...xs); let s = 0; for (const x of xs) s += Math.exp(x - m); return m + Math.log(s); };
const negE = (sims) => (sims.length ? T * logSumExp(sims.map((x) => x / T)) : -Infinity);
const auc = (pos, neg) => { let w = 0; for (const x of pos) for (const y of neg) w += x > y ? 1 : x === y ? 0.5 : 0; return w / (pos.length * neg.length); };

const probe = (query) => {
  const r = spawnSync('node', [CLI, 'ask', query, '--json', '--k', String(K), '--workspace', 'all'],
    { env: { ...process.env, FOLKLORE_HOME: HOME }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  try {
    const j = JSON.parse(r.stdout.trim().split('\n').pop());
    const hits = j.hits ?? [];
    const qt = toks(query);
    const raw = [], cov = [];
    for (const h of hits) {
      if (typeof h.distance !== 'number') continue;
      const sim = 1 - h.distance;
      const ht = toks(`${h.label ?? ''} ${h.summary ?? ''}`);
      let hitc = 0; for (const t of qt) if (ht.has(t)) hitc++;
      const coverage = qt.size ? hitc / qt.size : 0;
      raw.push(sim);
      cov.push(sim * Math.max(FLOOR, coverage));
    }
    return { rawNegE: negE(raw), covNegE: negE(cov) };
  } catch { return null; }
};

const load = (f) => readFileSync(join(DIR, f), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)).slice(0, LIMIT);
const run = (rows, label) => {
  const out = [];
  for (const r of rows) { const p = probe(r.query); if (p) out.push(p); process.stderr.write('.'); }
  process.stderr.write(` ${label}\n`);
  return out;
};

console.error(`bench-energy-coverage: floor=${FLOOR}, k=${K} — real ask path…`);
const inR = run(load('in-corpus.jsonl'), 'in');
const outR = run(load('out-of-corpus.jsonl'), 'out');

const rawAuc = auc(inR.map((x) => x.rawNegE), outR.map((x) => x.rawNegE));
const covAuc = auc(inR.map((x) => x.covNegE), outR.map((x) => x.covNegE));
console.log('\n══ ENERGY × TOKEN-COVERAGE ══');
console.log(`  n: ${inR.length} in, ${outR.length} out`);
console.log(`  AUC(-E) raw sim          : ${rawAuc.toFixed(3)}`);
console.log(`  AUC(-E) coverage-adjusted: ${covAuc.toFixed(3)}   (floor ${FLOOR})`);
console.log(`  delta                    : ${(covAuc - rawAuc >= 0 ? '+' : '') + (covAuc - rawAuc).toFixed(3)}`);
console.log(covAuc >= 0.7 ? '  VERDICT: coverage SEPARATES -> wire sim_i*coverage into the gate.'
  : covAuc - rawAuc > 0.1 ? '  VERDICT: coverage helps materially -> worth wiring + re-fitting tau.'
  : '  VERDICT: coverage does not rescue separation on this fixture; the lever is not enough alone.');
