/**
 * bench-ood-signals — the energy gate scores −E (logsumexp of top-k sims) and
 * fails (AUC ~0.41-0.55). But the OOD signal may live in the *shape* of the
 * top-k similarity distribution, not its mass: an in-corpus query has one sharp
 * peak (high margin, low entropy); an OOD query retrieves a flat spread of
 * moderate neighbours. This sweeps several distribution-shape signals over the
 * real ask path to see if any separates where −E does not.
 *
 *   node bench/bench-ood-signals.mjs [--k 20] [--limit N]
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'dist', 'cli', 'index.js');
const DIR = join(ROOT, 'eval', 'fixtures', 'deny-real');
const av = process.argv.slice(2);
const K = Number(av[av.indexOf('--k') + 1]) || 20;
const LIMIT = av.includes('--limit') ? Number(av[av.indexOf('--limit') + 1]) : Infinity;
const HOME = process.env.FOLKLORE_HOME || join(homedir(), '.folklore');
const T = 0.1;

const logSumExp = (xs) => { const m = Math.max(...xs); let s = 0; for (const x of xs) s += Math.exp(x - m); return m + Math.log(s); };
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const auc = (pos, neg) => { let w = 0; for (const x of pos) for (const y of neg) w += x > y ? 1 : x === y ? 0.5 : 0; return w / (pos.length * neg.length); };

// All signals: higher = more in-distribution.
const signals = (sims) => {
  const s = [...sims].sort((a, b) => b - a);
  if (s.length === 0) return null;
  const negE = T * logSumExp(s.map((x) => x / T));
  const top1 = s[0];
  const margin12 = s.length >= 2 ? s[0] - s[1] : 0;
  const marginBroad = s.length >= 2 ? s[0] - mean(s.slice(1)) : 0;
  const gap = s[0] - s[s.length - 1];
  // softmax entropy of the top-k sims; low entropy (peaked) => in-dist, so use -H
  const ex = s.map((x) => Math.exp(x / T)); const Z = ex.reduce((a, b) => a + b, 0);
  const p = ex.map((e) => e / Z);
  const H = -p.reduce((a, q) => a + (q > 0 ? q * Math.log(q) : 0), 0);
  return { negE, top1, margin12, marginBroad, gap, negEntropy: -H };
};

const probe = (query) => {
  const r = spawnSync('node', [CLI, 'ask', query, '--json', '--k', String(K), '--workspace', 'all'],
    { env: { ...process.env, FOLKLORE_HOME: HOME }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  try {
    const j = JSON.parse(r.stdout.trim().split('\n').pop());
    const sims = (j.hits ?? []).filter((h) => typeof h.distance === 'number').map((h) => 1 - h.distance);
    return sims.length ? signals(sims) : null;
  } catch { return null; }
};

const load = (f) => readFileSync(join(DIR, f), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)).slice(0, LIMIT);
const run = (rows, label) => { const out = []; for (const r of rows) { const p = probe(r.query); if (p) out.push(p); process.stderr.write('.'); } process.stderr.write(` ${label}\n`); return out; };

console.error(`bench-ood-signals: k=${K} top-k distribution-shape signals, real ask path…`);
const inR = run(load('in-corpus.jsonl'), 'in');
const outR = run(load('out-of-corpus.jsonl'), 'out');

const names = ['negE', 'top1', 'margin12', 'marginBroad', 'gap', 'negEntropy'];
console.log(`\n══ OOD SIGNAL SWEEP (k=${K}, n=${inR.length} in / ${outR.length} out) ══`);
const ranked = names.map((nm) => ({ nm, auc: auc(inR.map((x) => x[nm]), outR.map((x) => x[nm])) }))
  .sort((a, b) => b.auc - a.auc);
for (const { nm, auc: a } of ranked) {
  console.log(`  ${nm.padEnd(12)} AUC ${a.toFixed(3)}${a >= 0.7 ? '  <-- SEPARATES' : ''}`);
}
const best = ranked[0];
console.log(best.auc >= 0.7
  ? `\nVERDICT: '${best.nm}' separates (AUC ${best.auc.toFixed(2)}) — a distribution-shape signal fixes the OOD gate where −E (0.55) failed.`
  : `\nVERDICT: no distribution-shape signal separates (best ${best.nm} ${best.auc.toFixed(2)}) — OOD admission stays unsolved at the bi-encoder layer.`);
