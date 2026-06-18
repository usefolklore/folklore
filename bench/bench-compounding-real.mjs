/**
 * bench-compounding-real — the FULL compounding run on a real IR benchmark.
 *
 * No synthetic vectors, no noise model: real queries, real corpus docs, real
 * MiniLM embeddings, real relevance judgments (qrels). The most faithful test
 * of "do peers compound on knowledge + inference?"
 *
 * Mapping (BEIR → folklore):
 *   - corpus docs            = the resolvable knowledge (what a peer can cache).
 *   - queries (with qrels)   = the demand stream (Zipfian-repeated for reuse).
 *   - qrels[q] = relevant doc ids = ground truth ("the answer to q").
 *   - resolve-from-memory iff the real energy gate ADMITS over the cosine
 *     similarities of the cached docs to the query embedding (τ + Hopfield
 *     separation guard, calibrated on real query↔relevant-doc vs query↔random
 *     distributions).
 *   - correct-resolve = admit AND the top cached doc is qrel-relevant.
 *     false-admit     = admit AND the top cached doc is NOT relevant.
 *     miss            = no admit → "research it": deposit q's relevant doc(s)
 *                       into the cache (cooperative: propagate to online peers).
 *
 * ISOLATED reads only the issuing peer's cache; COOPERATIVE the online union.
 *
 *   node bench/bench-compounding-real.mjs [--dataset scifact] [--peers 16]
 *     [--steps 6000] [--cap 300] [--churn 0.2] [--json]
 *
 * Offline: needs the cached MiniLM under ~/.folklore/models and the dataset
 * under ~/.folklore/bench/<dataset>/<dataset>/. Corpus embeddings are cached to
 * /tmp so re-runs are fast.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { energyGate, freeEnergy } from '../dist/domain/energy-gate.js';
import { xenovaEmbedder } from '../dist/infrastructure/embedders.js';

const args = process.argv.slice(2);
const flag = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const JSON_OUT = args.includes('--json');
const DATASET = flag('dataset', 'scifact');
const P = Number(flag('peers', 16));
const STEPS = Number(flag('steps', 6000));
const CAP = Number(flag('cap', 300));
const CHURN = Number(flag('churn', 0.2));
const TOPK = 5;
const C_RESEARCH = 8000;
const C_RECALL = 200;
const HOME = process.env.FOLKLORE_HOME || join(homedir(), '.folklore');
const BASE = join(HOME, 'bench', DATASET, DATASET);
const pct = (x) => `${(x * 100).toFixed(1)}%`;

for (const p of [join(HOME, 'models'), join(BASE, 'corpus.jsonl')]) {
  if (!existsSync(p)) {
    console.error(`bench-compounding-real: missing ${p}. Need the cached MiniLM + the ${DATASET} dataset.`);
    process.exit(2);
  }
}

// ── load corpus / queries / qrels ──
const readJsonl = (p) => readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const corpus = readJsonl(join(BASE, 'corpus.jsonl')); // {_id, title?, text}
const queries = readJsonl(join(BASE, 'queries.jsonl')); // {_id, text}
const qtext = new Map(queries.map((q) => [String(q._id), q.text]));
const corpusText = new Map(corpus.map((d) => [String(d._id), `${d.title ? d.title + ' ' : ''}${d.text ?? ''}`.trim()]));
const corpusIds = [...corpusText.keys()];

const qrelsPath = existsSync(join(BASE, 'qrels', 'test.tsv')) ? join(BASE, 'qrels', 'test.tsv') : join(BASE, 'qrels', 'dev.tsv');
const qrels = new Map(); // queryId -> Set(relevant docId)
for (const line of readFileSync(qrelsPath, 'utf8').split('\n').slice(1)) {
  const [qid, did, score] = line.split('\t');
  if (!qid || !did || Number(score) <= 0) continue;
  if (!qrels.has(qid)) qrels.set(qid, new Set());
  qrels.get(qid).add(did);
}
// keep queries that have qrels AND text AND at least one relevant doc in corpus
const evalQids = [...qrels.keys()].filter(
  (qid) => qtext.has(qid) && [...qrels.get(qid)].some((d) => corpusText.has(d)),
);

// ── embed (cache corpus embeddings to /tmp) ──
const embedder = xenovaEmbedder({ cacheDir: join(HOME, 'models') });
const E = async (t) => {
  const r = await embedder.embed(t);
  if (r.isErr()) throw new Error(r.error.message ?? 'embed failed');
  return Array.from(r.value);
};
const cacheFile = join(tmpdir(), `folklore-emb-${DATASET}-minilm.json`);
let docEmb; // docId -> number[]
if (existsSync(cacheFile)) {
  docEmb = new Map(Object.entries(JSON.parse(readFileSync(cacheFile, 'utf8'))));
  if (!JSON_OUT) console.error(`(loaded ${docEmb.size} cached corpus embeddings)`);
} else {
  if (!JSON_OUT) console.error(`embedding ${corpusIds.length} corpus docs (one-time, ~30s)…`);
  docEmb = new Map();
  for (const id of corpusIds) docEmb.set(id, await E(corpusText.get(id)));
  try {
    mkdirSync(tmpdir(), { recursive: true });
    writeFileSync(cacheFile, JSON.stringify(Object.fromEntries(docEmb)));
  } catch { /* cache is best-effort */ }
}
const qEmb = new Map();
for (const qid of evalQids) qEmb.set(qid, await E(qtext.get(qid)));

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

// ── deterministic RNG + Zipfian query demand ──
let _s = 0xC0FFEE >>> 0;
const rnd = () => {
  _s = (_s + 0x6d2b79f5) >>> 0;
  let t = _s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const Q = evalQids.length;
const zWeights = evalQids.map((_, i) => 1 / Math.pow(i + 1 + 5, 0.9));
const zSum = zWeights.reduce((a, b) => a + b, 0);
const zCdf = [];
{ let acc = 0; for (const w of zWeights) { acc += w / zSum; zCdf.push(acc); } }
const drawQ = () => {
  const u = rnd();
  let lo = 0, hi = Q - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (zCdf[m] < u) lo = m + 1; else hi = m; }
  return evalQids[lo];
};

const sep = (xs) => { const s = [...xs].sort((a, b) => b - a); return s.length >= 2 ? s[0] - s[1] : 0; };
const youden = (pos, neg) => {
  const lo = Math.min(...pos, ...neg), hi = Math.max(...pos, ...neg);
  let best = { cut: lo, y: -1, tpr: 0, fpr: 0 };
  for (let i = 0; i <= 50; i++) {
    const cut = lo + ((hi - lo) * i) / 50;
    const tpr = pos.filter((x) => x >= cut).length / pos.length;
    const fpr = neg.filter((x) => x >= cut).length / neg.length;
    if (tpr - fpr > best.y) best = { cut, y: tpr - fpr, tpr, fpr };
  }
  return best;
};

// calibrate τ/sepMin on real query↔relevant-doc (pos) vs query↔random-doc (neg)
const calibrate = (T = 0.1) => {
  const nePos = [], neNeg = [], spPos = [], spNeg = [];
  for (const qid of evalQids) {
    const qe = qEmb.get(qid);
    const rel = [...qrels.get(qid)].filter((d) => docEmb.has(d));
    if (!rel.length) continue;
    const relSim = Math.max(...rel.map((d) => dot(qe, docEmb.get(d))));
    const randSims = Array.from({ length: TOPK }, () => dot(qe, docEmb.get(corpusIds[Math.floor(rnd() * corpusIds.length)])));
    const posSet = [relSim, ...randSims].sort((a, b) => b - a).slice(0, TOPK);
    nePos.push(-freeEnergy(posSet, T)); spPos.push(sep(posSet));
    neNeg.push(-freeEnergy(randSims, T)); spNeg.push(sep(randSims));
  }
  const tau = youden(nePos, neNeg), sm = youden(spPos, spNeg);
  return { tau: tau.cut, sepMin: sm.cut, tpr: tau.tpr, fpr: tau.fpr };
};

const runArm = (cooperative, tau, sepMin) => {
  _s = 0xABCDEF >>> 0;
  const peers = Array.from({ length: P }, () => new Map()); // docId -> true (LRU)
  const touch = (peer, did) => {
    if (peer.has(did)) peer.delete(did);
    peer.set(did, 1);
    if (peer.size > CAP) peer.delete(peer.keys().next().value);
  };
  let hits = 0, correct = 0, falseAdmit = 0, webPaid = 0;
  const BUCKETS = 20, perB = Math.ceil(STEPS / BUCKETS);
  const fb = new Array(BUCKETS).fill(0), bc = new Array(BUCKETS).fill(0);

  for (let t = 0; t < STEPS; t++) {
    const issuing = peers[Math.floor(rnd() * P)];
    const qid = drawQ();
    const qe = qEmb.get(qid);
    const rel = qrels.get(qid);
    const caches = cooperative ? peers.filter((p) => p === issuing || rnd() >= CHURN) : [issuing];
    // candidate cached docs, deduped by docId, top-K cosine
    const seen = new Set();
    const cand = [];
    for (const c of caches) for (const did of c.keys()) {
      if (seen.has(did)) continue;
      seen.add(did);
      cand.push([did, dot(qe, docEmb.get(did))]);
    }
    cand.sort((a, b) => b[1] - a[1]);
    const top = cand.slice(0, TOPK).map((x) => x[1]);
    const bestDid = cand.length ? cand[0][0] : null;
    const verdict = top.length ? energyGate(top, { tau, sepMin }) : { admit: false };

    const b = Math.min(BUCKETS - 1, Math.floor(t / perB));
    bc[b]++;
    if (verdict.admit) {
      hits++;
      if (bestDid && rel.has(bestDid)) correct++;
      else falseAdmit++;
    } else {
      webPaid++; fb[b]++;
      // research it → deposit the relevant doc(s); cooperative replicates to online peers
      for (const did of rel) {
        if (!docEmb.has(did)) continue;
        if (cooperative) { for (const p of peers) if (p === issuing || rnd() >= CHURN) touch(p, did); }
        else touch(issuing, did);
      }
    }
  }
  const series = fb.map((f, i) => (bc[i] ? f / bc[i] : 0));
  return {
    fallback_start: series[0],
    fallback_end: series[series.length - 1],
    correct_resolve_rate: correct / STEPS,
    false_admit_rate: hits ? falseAdmit / hits : 0,
    web_paid: webPaid,
    compute_saved_tok: correct * (C_RESEARCH - C_RECALL),
  };
};

const cal = calibrate();
const iso = runArm(false, cal.tau, cal.sepMin);
const coop = runArm(true, cal.tau, cal.sepMin);

if (JSON_OUT) {
  console.log(JSON.stringify({ dataset: DATASET, params: { P, STEPS, CAP, CHURN, queries: Q, corpus: corpusIds.length }, calibration: cal, isolated: iso, cooperative: coop }, null, 2));
  process.exit(0);
}

console.log(`bench-compounding-real: ${DATASET} — ${Q} eval queries, ${corpusIds.length} corpus docs (MiniLM, real qrels)`);
console.log(`  ${P} peers, ${STEPS} steps, cap ${CAP}, churn ${pct(CHURN)}; calibrated τ=${cal.tau.toFixed(3)} sepMin=${cal.sepMin.toFixed(3)} (query↔relevant-doc TPR ${pct(cal.tpr)}/FPR ${pct(cal.fpr)})\n`);
console.log(`                       isolated      cooperative`);
console.log(`  web-fallback start   ${pct(iso.fallback_start).padStart(8)}     ${pct(coop.fallback_start).padStart(8)}`);
console.log(`  web-fallback end     ${pct(iso.fallback_end).padStart(8)}     ${pct(coop.fallback_end).padStart(8)}`);
console.log(`  correct-resolve rate ${pct(iso.correct_resolve_rate).padStart(8)}     ${pct(coop.correct_resolve_rate).padStart(8)}   (admit AND top cached doc is qrel-relevant)`);
console.log(`  false-admit rate     ${pct(iso.false_admit_rate).padStart(8)}     ${pct(coop.false_admit_rate).padStart(8)}   (admit but top doc NOT relevant)`);
console.log(`  web trips paid       ${String(iso.web_paid).padStart(8)}     ${String(coop.web_paid).padStart(8)}`);
console.log(`  compute saved        ${(iso.compute_saved_tok / 1e6).toFixed(2).padStart(6)} M    ${(coop.compute_saved_tok / 1e6).toFixed(2).padStart(6)} M tok`);
console.log('');
const compounds = coop.correct_resolve_rate > iso.correct_resolve_rate + 0.05 && coop.false_admit_rate <= 0.1;
const cheaper = (iso.web_paid / Math.max(1, coop.web_paid)).toFixed(2);
if (compounds) {
  console.log(`VERDICT: COMPOUNDS (real corpus) — cooperative correct-resolve ${pct(coop.correct_resolve_rate)} vs isolated ${pct(iso.correct_resolve_rate)}.`);
  console.log(`  ${cheaper}× fewer web trips, ${((coop.compute_saved_tok - iso.compute_saved_tok) / 1e6).toFixed(2)} M extra tokens reused. false-admit ${pct(coop.false_admit_rate)}. Real queries, real docs, real qrels.`);
} else {
  console.log(`VERDICT: weak/no gap on ${DATASET} — cooperative correct-resolve ${pct(coop.correct_resolve_rate)} vs isolated ${pct(iso.correct_resolve_rate)}, false-admit ${pct(coop.false_admit_rate)}.`);
}
