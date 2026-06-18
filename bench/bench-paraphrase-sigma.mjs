/**
 * bench-paraphrase-sigma — ground the graded compounding sim in REAL embeddings.
 *
 * The compounding sim (bench-compounding-graded.mjs) shows compounding holds when
 * paraphrase noise σ is low enough that a query stays close to the cached answer
 * (σ ≲ 0.15 at DIM=384). But σ was assumed. This measures the REAL regime: with
 * the cached MiniLM embedder, how similar is a real natural-language query to the
 * SOURCE node it should resolve to (true-match), vs an unrelated node (spurious)?
 *
 * Uses the deny-real fixtures (in-corpus queries are real questions about real
 * graph nodes, with from_node_id provenance). For each: cos(embed(query),
 * embed(source-node-text)) = true-match; cos(query, random other node) = spurious.
 * Then inverts the sim's noise model — query = normalize(topic + σ·gauss) gives
 * E[cos] ≈ 1/√(1+σ²·DIM) — to convert the measured true-match cos into the sim's
 * σ, and reads the compounding verdict off the σ-table.
 *
 *   node bench/bench-paraphrase-sigma.mjs [--limit N] [--json]
 *
 * Offline: needs the cached embedder under ~/.folklore/models (run any
 * `folklore ask` once first). No network.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { xenovaEmbedder } from '../dist/infrastructure/embedders.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HOME = process.env.FOLKLORE_HOME || join(homedir(), '.folklore');
const args = process.argv.slice(2);
const JSON_OUT = args.includes('--json');
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const DIM = 384; // MiniLM

if (!existsSync(join(HOME, 'models'))) {
  console.error(`bench-paraphrase-sigma: no model cache under ${HOME}/models — run any \`folklore ask\` once first.`);
  process.exit(2);
}

// ── load fixtures + graph node text ──
const fixtures = readFileSync(join(ROOT, 'eval', 'fixtures', 'deny-real', 'in-corpus.jsonl'), 'utf8')
  .split('\n')
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l))
  .slice(0, LIMIT);

const graph = JSON.parse(readFileSync(join(HOME, 'graph.json'), 'utf8'));
const textById = new Map();
for (const n of graph.nodes ?? []) {
  const t = `${n.label ?? ''} ${n.summary ?? ''}`.trim();
  if (t) textById.set(n.id, t);
}
const allIds = [...textById.keys()];

const embedder = xenovaEmbedder({ cacheDir: join(HOME, 'models') });
const E = async (t) => {
  const r = await embedder.embed(t);
  if (r.isErr()) throw new Error(r.error.message ?? 'embed failed');
  return r.value;
};
const cos = (a, b) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += a[i] * b[i];
  return d; // both normalized
};

// deterministic spurious pick (no Math.random)
let _s = 1234567;
const nextIdx = (n) => {
  _s = (_s * 1103515245 + 12345) & 0x7fffffff;
  return _s % n;
};

const trueMatch = [];
const spurious = [];
let missingSource = 0;

for (const fx of fixtures) {
  const srcText = textById.get(fx.from_node_id) ?? fx.from_label;
  if (!srcText) {
    missingSource++;
    continue;
  }
  const qv = await E(fx.query);
  const sv = await E(srcText);
  trueMatch.push(cos(qv, sv));
  // spurious: query vs 3 random OTHER nodes
  for (let j = 0; j < 3; j++) {
    let id = allIds[nextIdx(allIds.length)];
    if (id === fx.from_node_id) continue;
    spurious.push(cos(qv, await E(textById.get(id))));
  }
}

const quant = (xs) => {
  if (!xs.length) return { p10: NaN, median: NaN, p90: NaN, mean: NaN };
  const s = [...xs].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return { p10: q(0.1), median: q(0.5), p90: q(0.9), mean: xs.reduce((a, b) => a + b, 0) / xs.length };
};
const auc = (pos, neg) => {
  let w = 0;
  for (const a of pos) for (const b of neg) w += a > b ? 1 : a === b ? 0.5 : 0;
  return pos.length && neg.length ? w / (pos.length * neg.length) : NaN;
};
// invert E[cos] ≈ 1/√(1+σ²·DIM) → σ
const cosToSigma = (c) => (c > 0 && c < 1 ? Math.sqrt((1 / (c * c) - 1) / DIM) : NaN);

const tm = quant(trueMatch);
const sp = quant(spurious);
const sigmaEq = cosToSigma(tm.median);
const a = auc(trueMatch, spurious);

if (JSON_OUT) {
  console.log(JSON.stringify({ n: trueMatch.length, true_match: tm, spurious: sp, auc: a, sigma_equiv: sigmaEq, missing_source: missingSource }, null, 2));
  process.exit(0);
}

const f = (x) => x.toFixed(3);
console.log(`bench-paraphrase-sigma: ${trueMatch.length} real query↔source pairs (MiniLM, offline), ${missingSource} sources missing\n`);
console.log(`  true-match cos (query ↔ its source node):  p10=${f(tm.p10)} median=${f(tm.median)} p90=${f(tm.p90)}`);
console.log(`  spurious  cos (query ↔ random other node):  p10=${f(sp.p10)} median=${f(sp.median)} p90=${f(sp.p90)}`);
console.log(`  separation AUC (true-match > spurious):     ${f(a)}`);
console.log(`  → equivalent sim σ (from median cos):       ${f(sigmaEq)}\n`);
const verdict =
  sigmaEq <= 0.15
    ? `REAL REGIME COMPOUNDS — measured σ≈${f(sigmaEq)} ≤ 0.15, inside the regime where the graded sim shows cooperative compounding with ~0 false-admit. Real paraphrases stay close enough to their source for peers to reuse them.`
    : sigmaEq <= 0.2
      ? `REAL REGIME MARGINAL — measured σ≈${f(sigmaEq)} (0.15–0.20): compounding is weak; a stronger embedder (nomic/bge) would tighten σ and restore the gap.`
      : `REAL REGIME TOO NOISY — measured σ≈${f(sigmaEq)} > 0.20: MiniLM paraphrase similarity is too low for reliable reuse; the gate would (correctly) pay web. Upgrade the embedder.`;
console.log(`VERDICT: ${verdict}`);
console.log(`  (separation AUC ${f(a)} also matters — high AUC means the gate CAN tell true from spurious even if absolute cos is modest.)`);
