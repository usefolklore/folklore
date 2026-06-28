/**
 * bench-energy-bge — would a STRONGER embedder (bge) sharpen the energy gate's
 * separation that MiniLM fails at (AUC 0.405)? Cheap, faithful-ish test: instead
 * of re-embedding the whole 17G graph, re-SCORE the real retrieved hits under bge.
 *
 * Per deny-real fixture: run the real `ask --json`, take the top-k hits' text
 * (label + summary) and MiniLM distance, then recompute sim two ways:
 *   minilm : sim = 1 - distance         (what the gate uses today)
 *   bge    : sim = cos(bge(query), bge(hit_text))
 * Report AUC(-E) in-vs-out for both. bge AUC >> minilm => the full re-embed is
 * justified; otherwise bge scoring doesn't separate these candidates either.
 *
 * Caveat: re-scores MiniLM's retrieved candidates (not a true bge retrieval), so
 * it tests bge SCORING, not bge RETRIEVAL. Still the cheapest faithful signal.
 *
 *   node bench/bench-energy-bge.mjs [--k 5] [--limit N]
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { xenovaEmbedder } from '../dist/infrastructure/embedders.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'dist', 'cli', 'index.js');
const DIR = join(ROOT, 'eval', 'fixtures', 'deny-real');
const av = process.argv.slice(2);
const K = Number(av[av.indexOf('--k') + 1]) || 5;
const LIMIT = av.includes('--limit') ? Number(av[av.indexOf('--limit') + 1]) : Infinity;
const T = 0.1;
const HOME = process.env.FOLKLORE_HOME || join(homedir(), '.folklore');

const bge = xenovaEmbedder({ model: 'Xenova/bge-base-en-v1.5', dim: 768 });
const embed = async (text) => {
  const r = await bge.embed(text);
  if (r.isErr && r.isErr()) return null;
  const v = Array.from(r.value); let s = 0; for (const x of v) s += x * x; const n = Math.sqrt(s) || 1;
  return v.map((x) => x / n);
};
const dot = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d; };
const logSumExp = (xs) => { if (!xs.length) return -Infinity; const m = Math.max(...xs); let s = 0; for (const x of xs) s += Math.exp(x - m); return m + Math.log(s); };
const negE = (sims) => (sims.length ? T * logSumExp(sims.map((x) => x / T)) : -Infinity);
const auc = (pos, neg) => { let w = 0; for (const x of pos) for (const y of neg) w += x > y ? 1 : x === y ? 0.5 : 0; return w / (pos.length * neg.length); };

const probe = async (query) => {
  const r = spawnSync('node', [CLI, 'ask', query, '--json', '--k', String(K), '--workspace', 'all'],
    { env: { ...process.env, FOLKLORE_HOME: HOME }, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) return null;
  let j; try { j = JSON.parse(r.stdout.trim().split('\n').pop()); } catch { return null; }
  const hits = (j.hits ?? []).filter((h) => typeof h.distance === 'number');
  if (!hits.length) return null;
  const qv = await embed(query);
  const minilm = [], bgeS = [];
  for (const h of hits) {
    minilm.push(1 - h.distance);
    const ht = `${h.label ?? ''} ${h.summary ?? ''}`.trim();
    const hv = ht ? await embed(ht) : null;
    bgeS.push(hv && qv ? dot(qv, hv) : 0);
  }
  return { minilmNegE: negE(minilm), bgeNegE: negE(bgeS) };
};

const load = (f) => readFileSync(join(DIR, f), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)).slice(0, LIMIT);
const run = async (rows, label) => {
  const out = [];
  for (const r of rows) { const p = await probe(r.query); if (p) out.push(p); process.stderr.write('.'); }
  process.stderr.write(` ${label}\n`);
  return out;
};

console.error(`bench-energy-bge: bge-base re-scoring of real hits, k=${K} …`);
const inR = await run(load('in-corpus.jsonl'), 'in');
const outR = await run(load('out-of-corpus.jsonl'), 'out');

const mAuc = auc(inR.map((x) => x.minilmNegE), outR.map((x) => x.minilmNegE));
const bAuc = auc(inR.map((x) => x.bgeNegE), outR.map((x) => x.bgeNegE));
console.log('\n══ ENERGY: MiniLM vs bge re-scoring ══');
console.log(`  n: ${inR.length} in, ${outR.length} out`);
console.log(`  AUC(-E) MiniLM (1-distance) : ${mAuc.toFixed(3)}`);
console.log(`  AUC(-E) bge re-scored       : ${bAuc.toFixed(3)}`);
console.log(`  delta                       : ${(bAuc - mAuc >= 0 ? '+' : '') + (bAuc - mAuc).toFixed(3)}`);
console.log(bAuc >= 0.7 ? '  VERDICT: bge SEPARATES -> a full bge re-embed of the graph is justified.'
  : bAuc - mAuc > 0.1 ? '  VERDICT: bge helps materially -> worth the full re-embed.'
  : '  VERDICT: bge scoring does not separate these candidates either -> re-embed unlikely to rescue the gate alone.');
