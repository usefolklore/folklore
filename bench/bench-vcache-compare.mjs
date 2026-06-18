/**
 * bench-vcache-compare — the DEFENSIBLE comparison. Is federated inference-tree
 * sharing actually better than the real alternative (a single-node semantic
 * cache), not just better than weak cold retrieval?
 *
 * Three systems on the IDENTICAL real stream (BEIR + qrels, recall@1), at a
 * MATCHED false-accept budget so the comparison is fair:
 *   - COLD            : direct query→doc top-1 (no cache).
 *   - SINGLE-NODE CACHE: vCache-style — each peer keeps its OWN query→verified-doc
 *     cache, accepts a hit only if query↔cached-query cos ≥ an error-bounded
 *     threshold (calibrated so false-accept ≤ budget). Deposits to itself only.
 *   - FEDERATED (folklore): the SAME error-bounded cache, but the pool is shared
 *     across all peers (CRDT). Deposits replicate to peers.
 *
 * The honest claim folklore can make is the FEDERATED − SINGLE-NODE delta at the
 * same error budget: "sharing trees P2P resolves X% more than keeping your own
 * cache." Both caches use the same decision rule, so the delta is purely the
 * federation coverage — not a weak-baseline artifact.
 *
 * always-paraphrase (no exact self-match) so it's paraphrase generalization, not
 * exact-query caching. false-accept = accepted a cached answer whose doc is NOT
 * qrel-relevant.
 *
 *   node bench/bench-vcache-compare.mjs [--dataset scifact] [--peers 16]
 *     [--steps 8000] [--budget 0.02] [--json]
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { xenovaEmbedder } from '../dist/infrastructure/embedders.js';

const args = process.argv.slice(2);
const flag = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const JSON_OUT = args.includes('--json');
const DATASET = flag('dataset', 'scifact');
const P = Number(flag('peers', 16));
const STEPS = Number(flag('steps', 8000));
const BUDGET = Number(flag('budget', 0.02)); // max false-accept rate
const SIGMA = 0.033; // measured real paraphrase noise
const HOME = process.env.FOLKLORE_HOME || join(homedir(), '.folklore');
const BASE = join(HOME, 'bench', DATASET, DATASET);
const pct = (x) => `${(x * 100).toFixed(1)}%`;

if (!existsSync(join(HOME, 'models')) || !existsSync(join(BASE, 'corpus.jsonl'))) {
  console.error(`need cached MiniLM + ${DATASET}.`); process.exit(2);
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
  const [qid, did, sc] = line.split('\t');
  if (!qid || !did || Number(sc) <= 0) continue;
  if (!qrels.has(qid)) qrels.set(qid, new Set());
  qrels.get(qid).add(did);
}
const evalQids = [...qrels.keys()].filter((qid) => qtext.has(qid) && [...qrels.get(qid)].some((d) => corpusText.has(d)));

const embedder = xenovaEmbedder({ cacheDir: join(HOME, 'models') });
const E = async (t) => { const r = await embedder.embed(t); if (r.isErr()) throw new Error(r.error.message); return Array.from(r.value); };
const cacheFile = join(tmpdir(), `folklore-emb-${DATASET}-minilm.json`);
let docEmb;
if (existsSync(cacheFile)) docEmb = new Map(Object.entries(JSON.parse(readFileSync(cacheFile, 'utf8'))));
else { docEmb = new Map(); for (const id of corpusIds) docEmb.set(id, await E(corpusText.get(id))); try { writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(docEmb))); } catch { /* */ } }
const qEmb = new Map();
for (const qid of evalQids) qEmb.set(qid, await E(qtext.get(qid)));

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
const norm = (x) => { let s = 0; for (const v of x) s += v * v; s = Math.sqrt(s) || 1; return x.map((v) => v / s); };
const directTop1 = (qe) => { let best = null, bs = -Infinity; for (const id of corpusIds) { const s = dot(qe, docEmb.get(id)); if (s > bs) { bs = s; best = id; } } return best; };

let _s = 0x1234 >>> 0;
const rnd = () => { _s = (_s + 0x6d2b79f5) >>> 0; let t = _s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const gauss = () => { const u = Math.max(rnd(), 1e-9); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd()); };
const para = (qid) => norm(qEmb.get(qid).map((v) => v + SIGMA * gauss()));
const Q = evalQids.length;
const zW = evalQids.map((_, i) => 1 / Math.pow(i + 1 + 5, 0.9));
const zSum = zW.reduce((a, b) => a + b, 0);
const zCdf = []; { let acc = 0; for (const w of zW) { acc += w / zSum; zCdf.push(acc); } }
const drawQ = () => { const u = rnd(); let lo = 0, hi = Q - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (zCdf[m] < u) lo = m + 1; else hi = m; } return evalQids[lo]; };

// One pass over the stream, recording per-instance (best-match cos, whether the
// accepted doc would be correct, whether direct is correct) so recall + false-
// accept can be computed for EVERY threshold offline — the rigorous error-vs-
// recall operating curve (vCache-style), not a single guessed threshold.
const GRID = [];
for (let t = 0.95; t >= 0.3; t -= 0.025) GRID.push(Number(t.toFixed(3)));

const runCurve = (federated) => {
  _s = 0xCACE >>> 0;
  const peers = Array.from({ length: P }, () => []);
  const inst = []; // {bestCos, acceptCorrect, directCorrect}
  for (let t = 0; t < STEPS; t++) {
    const qid = drawQ();
    const qe = para(qid);
    const rel = qrels.get(qid);
    const issuing = Math.floor(rnd() * P);
    const view = federated ? peers.flat() : peers[issuing];
    let best = { cos: -Infinity, docs: null };
    for (const e of view) { const c = dot(qe, e.emb); if (c > best.cos) best = { cos: c, docs: e.docs }; }
    let acceptCorrect = false;
    if (best.docs) {
      let top = null, ts = -Infinity;
      for (const d of best.docs) { const sc = docEmb.has(d) ? dot(qe, docEmb.get(d)) : -1; if (sc > ts) { ts = sc; top = d; } }
      acceptCorrect = rel.has(top);
    }
    const directCorrect = rel.has(directTop1(qe));
    inst.push({ bestCos: best.cos, acceptCorrect, directCorrect, hasMatch: !!best.docs });
    // deposit verified tree (always — models "eventually resolved + shared")
    const entry = { emb: qe, docs: rel };
    if (federated) for (const p of peers) p.push(entry); else peers[issuing].push(entry);
  }
  // recall + false-accept at each threshold
  return GRID.map((thr) => {
    let hit = 0, acc = 0, fa = 0;
    for (const x of inst) {
      if (x.hasMatch && x.bestCos >= thr) { acc++; if (x.acceptCorrect) hit++; else fa++; }
      else if (x.directCorrect) hit++;
    }
    return { thr, recall: hit / inst.length, false_accept: acc ? fa / acc : 0 };
  });
};

let coldHit = 0;
{ _s = 0xC01D >>> 0; for (let t = 0; t < STEPS; t++) { const qid = drawQ(); const qe = para(qid); if (qrels.get(qid).has(directTop1(qe))) coldHit++; } }
const cold = coldHit / STEPS;
const singleCurve = runCurve(false);
const fedCurve = runCurve(true);
// operating point: the threshold (highest recall) whose false-accept ≤ BUDGET
const opPoint = (curve) => curve.filter((p) => p.false_accept <= BUDGET).sort((a, b) => b.recall - a.recall)[0] ?? curve.sort((a, b) => a.false_accept - b.false_accept)[0];
const sOp = opPoint(singleCurve), fOp = opPoint(fedCurve);

if (JSON_OUT) {
  console.log(JSON.stringify({ dataset: DATASET, budget: BUDGET, cold_recall: cold, single_node: sOp, federated: fOp, single_curve: singleCurve, fed_curve: fedCurve }, null, 2));
  process.exit(0);
}
console.log(`bench-vcache-compare: ${DATASET} — ${Q} queries, ${corpusIds.length} docs, ${P} peers, recall@1`);
console.log(`  operating point = max recall with false-accept ≤ ${pct(BUDGET)} (always-paraphrase, no exact cache)\n`);
console.log(`  COLD (direct, no cache):         recall ${pct(cold)}`);
console.log(`  SINGLE-NODE cache (vCache-like):  recall ${pct(sOp.recall)}  @ thr ${sOp.thr}  (false-accept ${pct(sOp.false_accept)})`);
console.log(`  FEDERATED tree-sharing:           recall ${pct(fOp.recall)}  @ thr ${fOp.thr}  (false-accept ${pct(fOp.false_accept)})`);
console.log('');
const fedVsSingle = sOp.recall > 0 ? (fOp.recall - sOp.recall) / sOp.recall : NaN;
const fedVsCold = cold > 0 ? (fOp.recall - cold) / cold : NaN;
console.log(`  FEDERATED vs SINGLE-NODE cache: ${fedVsSingle >= 0 ? '+' : ''}${(fedVsSingle * 100).toFixed(1)}%  ← honest federation advantage at matched ≤${pct(BUDGET)} error`);
console.log(`  FEDERATED vs COLD direct:       ${fedVsCold >= 0 ? '+' : ''}${(fedVsCold * 100).toFixed(1)}%`);
