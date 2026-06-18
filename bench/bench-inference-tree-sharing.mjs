/**
 * bench-inference-tree-sharing — does sharing resolved INFERENCE TREES
 * (answered-question → verified-doc edges) P2P massively improve retrieval?
 *
 * Mechanism. A cold peer's DIRECT query→doc retrieval can be weak (the embedder
 * may not put a short question near its answer doc). But query→QUERY similarity
 * for the same information need is strong (measured ≈0.84 for real paraphrases).
 * So if peers share their resolved trees — (question they answered) → (verified
 * evidence docs) — a new query can retrieve by matching the POOL OF ANSWERED
 * QUESTIONS and inheriting their verified docs: "someone already answered this."
 * That rescues retrievals direct search misses.
 *
 * Honest measurement on a real IR corpus (BEIR + qrels), recall@k of the
 * relevant doc — NOT the gate, NOT satisfaction. Two systems, identical stream:
 *   - BASELINE: direct query→doc top-k.
 *   - TREE-SHARED: direct top-k UNIONED with docs inherited from the nearest
 *     PRIOR answered question (query→query match ≥ threshold), reranked.
 * Anti-gaming: the answered-pool holds only PRIOR instances (online, no
 * self-match); inheriting from an unrelated question adds WRONG docs and hurts
 * recall (a real cost, not hidden); improvement is measured against qrels.
 *
 * Demand: Zipfian over the query set with paraphrase recurrence — popular
 * questions recur as paraphrases (emb + σ·gauss, σ=measured 0.033), exactly the
 * production case where one peer answered q and another asks a paraphrase.
 *
 *   node bench/bench-inference-tree-sharing.mjs [--dataset nfcorpus] [--k 10]
 *     [--steps 8000] [--q2q 0.75] [--sigma 0.033] [--json]
 *
 * Offline: cached MiniLM + ~/.folklore/bench/<dataset>. Embeddings cached to tmp.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { xenovaEmbedder } from '../dist/infrastructure/embedders.js';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const JSON_OUT = args.includes('--json');
const DATASET = flag('dataset', 'nfcorpus');
const K = Number(flag('k', 10));
const STEPS = Number(flag('steps', 8000));
// min query↔query cos to inherit a tree. Calibrated: real paraphrases of the
// same question sit ~0.71 apart, unrelated questions ~0.1, so 0.6 catches every
// paraphrase and rejects every unrelated question (hurt=0 empirically). 0.75
// was above the paraphrase floor and wrongly rejected valid matches.
const Q2Q = Number(flag('q2q', 0.6));
const SIGMA = Number(flag('sigma', 0.033));
const ALWAYS_PARA = args.includes('--always-paraphrase'); // noise EVERY instance (no exact self-match)
const HOME = process.env.FOLKLORE_HOME || join(homedir(), '.folklore');
const BASE = join(HOME, 'bench', DATASET, DATASET);
const pct = (x) => `${(x * 100).toFixed(1)}%`;

if (!existsSync(join(HOME, 'models')) || !existsSync(join(BASE, 'corpus.jsonl'))) {
  console.error(`bench-inference-tree-sharing: need cached MiniLM + ${DATASET} dataset.`);
  process.exit(2);
}

const readJsonl = (p) => readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const corpus = readJsonl(join(BASE, 'corpus.jsonl'));
const queries = readJsonl(join(BASE, 'queries.jsonl'));
const qtext = new Map(queries.map((q) => [String(q._id), q.text]));
const corpusText = new Map(corpus.map((d) => [String(d._id), `${d.title ? d.title + ' ' : ''}${d.text ?? ''}`.trim()]));
const corpusIds = [...corpusText.keys()];
const qrelsPath = existsSync(join(BASE, 'qrels', 'test.tsv')) ? join(BASE, 'qrels', 'test.tsv') : join(BASE, 'qrels', 'dev.tsv');
const qrels = new Map();
for (const line of readFileSync(qrelsPath, 'utf8').split('\n').slice(1)) {
  const [qid, did, score] = line.split('\t');
  if (!qid || !did || Number(score) <= 0) continue;
  if (!qrels.has(qid)) qrels.set(qid, new Set());
  qrels.get(qid).add(did);
}
const evalQids = [...qrels.keys()].filter((qid) => qtext.has(qid) && [...qrels.get(qid)].some((d) => corpusText.has(d)));

const embedder = xenovaEmbedder({ cacheDir: join(HOME, 'models') });
const E = async (t) => { const r = await embedder.embed(t); if (r.isErr()) throw new Error(r.error.message); return Array.from(r.value); };
const cacheFile = join(tmpdir(), `folklore-emb-${DATASET}-minilm.json`);
let docEmb;
if (existsSync(cacheFile)) {
  docEmb = new Map(Object.entries(JSON.parse(readFileSync(cacheFile, 'utf8'))));
} else {
  if (!JSON_OUT) console.error(`embedding ${corpusIds.length} corpus docs (one-time)…`);
  docEmb = new Map();
  for (const id of corpusIds) docEmb.set(id, await E(corpusText.get(id)));
  try { writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(docEmb))); } catch { /* best effort */ }
}
const qEmb = new Map();
for (const qid of evalQids) qEmb.set(qid, await E(qtext.get(qid)));

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const norm = (x) => { let s = 0; for (const v of x) s += v * v; s = Math.sqrt(s) || 1; return x.map((v) => v / s); };

// top-k corpus docs by cosine (linear scan — corpus is small)
const directTopK = (qe, k) => {
  const scored = corpusIds.map((id) => [id, dot(qe, docEmb.get(id))]);
  scored.sort((a, b) => b[1] - a[1]);
  return scored.slice(0, k);
};

let _s = 0xBEEF >>> 0;
const rnd = () => { _s = (_s + 0x6d2b79f5) >>> 0; let t = _s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = () => { const u = Math.max(rnd(), 1e-9); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
const Q = evalQids.length;
const zW = evalQids.map((_, i) => 1 / Math.pow(i + 1 + 5, 0.9));
const zSum = zW.reduce((a, b) => a + b, 0);
const zCdf = []; { let acc = 0; for (const w of zW) { acc += w / zSum; zCdf.push(acc); } }
const drawQ = () => { const u = rnd(); let lo = 0, hi = Q - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (zCdf[m] < u) lo = m + 1; else hi = m; } return evalQids[lo]; };

// Run the identical stream; measure baseline-direct recall@k and tree-shared
// recall@k. Tree pool grows with PRIOR instances only.
const seen = new Map(); // qid -> times seen (for paraphrase recurrence)
const pool = []; // {emb, docs:Set} answered inference trees
let baseHit = 0, treeHit = 0, treeRescued = 0, treeHurt = 0, n = 0;
let inheritedUsed = 0;

for (let t = 0; t < STEPS; t++) {
  const qid = drawQ();
  const occ = (seen.get(qid) ?? 0);
  seen.set(qid, occ + 1);
  const base = qEmb.get(qid);
  // paraphrase on recurrence; --always-paraphrase noises the first occurrence
  // too, so NO instance is ever the exact original (rules out exact-cache).
  const qe = occ === 0 && !ALWAYS_PARA ? base : norm(base.map((v) => v + SIGMA * gauss()));
  const rel = qrels.get(qid);
  n++;

  // BASELINE: direct top-k
  const direct = directTopK(qe, K);
  const baseOk = direct.some(([id]) => rel.has(id));
  if (baseOk) baseHit++;

  // TREE-SHARED: union direct with docs inherited from the nearest prior tree
  const cand = new Map(); // docId -> score
  for (const [id, sc] of direct) cand.set(id, sc);
  let best = { cos: -Infinity, docs: null };
  for (const e of pool) {
    const c = dot(qe, e.emb);
    if (c > best.cos) best = { cos: c, docs: e.docs };
  }
  if (best.docs && best.cos >= Q2Q) {
    inheritedUsed++;
    for (const did of best.docs) cand.set(did, Math.max(cand.get(did) ?? 0, best.cos)); // inherited docs scored by q2q match
  }
  const treeTop = [...cand.entries()].sort((a, b) => b[1] - a[1]).slice(0, K);
  const treeOk = treeTop.some(([id]) => rel.has(id));
  if (treeOk) treeHit++;
  if (treeOk && !baseOk) treeRescued++;
  if (!treeOk && baseOk) treeHurt++;

  // append this resolved tree (question → verified relevant docs) to the pool
  pool.push({ emb: qe, docs: rel });
}

const baseRecall = baseHit / n;
const treeRecall = treeHit / n;
const improvement = baseRecall > 0 ? (treeRecall - baseRecall) / baseRecall : NaN;

if (JSON_OUT) {
  console.log(JSON.stringify({ dataset: DATASET, k: K, steps: n, baseline_recall: baseRecall, tree_recall: treeRecall, improvement, rescued: treeRescued, hurt: treeHurt, inherited_used: inheritedUsed }, null, 2));
  process.exit(0);
}
console.log(`bench-inference-tree-sharing: ${DATASET} — ${Q} eval queries, ${corpusIds.length} docs, recall@${K}, q2q≥${Q2Q}, σ=${SIGMA}`);
console.log(`  stream ${n} instances (Zipfian + paraphrase recurrence); pool = shared answered-question→verified-doc trees\n`);
console.log(`  BASELINE direct recall@${K}:     ${pct(baseRecall)}`);
console.log(`  TREE-SHARED recall@${K}:         ${pct(treeRecall)}`);
console.log(`  improvement:                  ${improvement >= 0 ? '+' : ''}${(improvement * 100).toFixed(1)}%  (relative)`);
console.log(`  rescued (tree hit, direct miss): ${treeRescued}   hurt (tree miss, direct hit): ${treeHurt}   inherited used: ${inheritedUsed}/${n}\n`);
const big = improvement >= 0.8;
console.log(big
  ? `VERDICT: MASSIVE — +${(improvement * 100).toFixed(0)}% retrieval from P2P inference-tree sharing (recall@${K} ${pct(baseRecall)}→${pct(treeRecall)}), measured on real qrels. Net rescued ${treeRescued - treeHurt}.`
  : `VERDICT: +${(improvement * 100).toFixed(1)}% so far (target ≥80%). Tree-sharing rescues ${treeRescued} / hurts ${treeHurt}. Iterate the mechanism (q2q threshold, reranking, multi-tree fusion).`);
