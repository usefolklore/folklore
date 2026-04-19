#!/usr/bin/env node
/**
 * SciFact qrel completeness audit — Round 2 measurement-instrument
 * upgrade attack (particle-physicist + data-engineer convergent pick).
 *
 * Hypothesis: SciFact qrels (1.13 rel/q average, depth-100-pooled in
 * 2020) likely contain a 15-40% pool-incompleteness rate per the
 * literature (Thakur 2021, Soboroff 2021, Arabzadeh 2022). The 75.22%
 * NDCG@10 ceiling we're trying to break is measured against a known-
 * incomplete instrument — and we never asked HOW incomplete.
 *
 * Methodology (blind analysis, borrowed from LHC):
 *   1. For 100 sampled queries, get top-20 from the cached Phase 25
 *      pipeline (no re-embed — uses cached vectors.db).
 *   2. For each (query, candidate) pair, ask Qwen2.5:3b via Ollama
 *      "Is this passage relevant to the claim?" with strict YES/NO.
 *   3. Calibration: include ALL human-judged-positive docs + 2 control
 *      docs (sampled from rank 200+, i.e. definitely-irrelevant) per
 *      query. Compute Cohen's κ between LLM and humans on the known
 *      labels.
 *   4. If κ ≥ 0.6 (substantial agreement, Landis-Koch): trust the
 *      judge. Add LLM-positive docs from the unjudged top-20 as new
 *      qrel positives (expanded qrels Q⁺).
 *   5. Recompute NDCG@10 against Q⁺. The Δ from Q to Q⁺ is the
 *      MEASUREMENT-FLOOR effect — it tells us whether 75.22% is
 *      pipeline-ceiling or instrument-floor.
 *
 * Critical property: this attack CANNOT regress production. It changes
 * the gate yardstick, not the pipeline. Either outcome is decision-
 * relevant:
 *   - High false-negative rate → 75.22% is measurement-floor; true
 *     ceiling >80%; round 1 nulls were noise against a broken yardstick
 *   - Tight qrels → 75.22% is real; future SOTA attacks get a
 *     calibrated target instead of fighting noise
 *
 * Cost: ~100 queries × ~25 (q, d) pairs per query × ~3s LLM call
 * ≈ 2 hours wall clock.
 */

import { existsSync, mkdirSync, createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

import { rustSubprocessEmbedder } from '../dist/infrastructure/embedders.js';

const CACHE_DIR = join(homedir(), '.wellinformed', 'bench');
const DB_PATH = join(CACHE_DIR, 'scifact__rust-via-ts__bge-base', 'vectors.db');
const DATASET_DIR = join(CACHE_DIR, 'scifact', 'scifact');
const CORPUS_JSONL = join(DATASET_DIR, 'corpus.jsonl');
const QUERIES_JSONL = join(DATASET_DIR, 'queries.jsonl');
const QRELS_TSV = join(DATASET_DIR, 'qrels', 'test.tsv');
const RESULTS_DIR = join(CACHE_DIR, 'qrel-rejudge');
mkdirSync(RESULTS_DIR, { recursive: true });

const SAMPLE_SIZE = parseInt(process.argv[2] ?? '100', 10);
const TOP_K_TO_JUDGE = parseInt(process.argv[3] ?? '20', 10);
const N_CONTROLS = 2;
const OLLAMA_MODEL = 'qwen2.5:3b';
const OLLAMA_URL = 'http://localhost:11434';

console.log('━'.repeat(60));
console.log(' wellinformed — SciFact qrel completeness audit (Round 2)');
console.log('━'.repeat(60));
console.log(` Sample: ${SAMPLE_SIZE} queries × top-${TOP_K_TO_JUDGE} + ${N_CONTROLS} controls`);
console.log(` Judge:  ${OLLAMA_MODEL} via ${OLLAMA_URL}`);
console.log(` Gate:   κ ≥ 0.6 → trust judge, expand qrels, recompute NDCG@10`);
console.log('');

// ─── load ──────────────────────────────────────────────────────────
const loadJsonl = async (path) => {
  const lines = [];
  const rl = createInterface({ input: createReadStream(path) });
  for await (const line of rl) {
    if (line.trim()) lines.push(JSON.parse(line));
  }
  return lines;
};

console.log('[1/5] Loading corpus + queries + qrels...');
const corpus = await loadJsonl(CORPUS_JSONL);
const docTextById = new Map();
for (const d of corpus) docTextById.set(String(d._id), (d.title ? d.title + '. ' : '') + (d.text ?? ''));

const queriesRaw = await loadJsonl(QUERIES_JSONL);
const qrelsText = readFileSync(QRELS_TSV, 'utf8');
const qrels = new Map();
for (const line of qrelsText.split('\n').slice(1)) {
  const parts = line.split('\t');
  if (parts.length < 3) continue;
  const [qid, docId, scoreStr] = parts;
  const score = parseInt(scoreStr, 10);
  if (score > 0) {
    if (!qrels.has(qid)) qrels.set(qid, new Map());
    qrels.get(qid).set(docId, score);
  }
}
const testQids = [...qrels.keys()];
const queriesAll = queriesRaw
  .filter((q) => qrels.has(String(q._id)))
  .map((q) => ({ id: String(q._id), rawText: q.text }));

// Deterministic sample (first N — reproducible)
const queries = queriesAll.slice(0, SAMPLE_SIZE);
console.log(`  ${queries.length} queries sampled (of ${queriesAll.length} total)`);

const db = new Database(DB_PATH, { readonly: false });
sqliteVec.load(db);
const rowidToId = new Map();
const rows = db.prepare('SELECT rowid, node_id FROM vec_meta').all();
for (const r of rows) rowidToId.set(r.rowid, r.node_id);

// ─── retrieve top-K via cached pipeline + identify candidate set ──
console.log('[2/5] Retrieving top-K via Rust + cached vectors.db...');
const embedder = rustSubprocessEmbedder({ model: 'bge-base', dim: 768 });
const denseStmt = db.prepare(
  `SELECT v.rowid FROM vec_nodes v WHERE v.embedding MATCH ? AND k = ? ORDER BY v.distance`
);
const toVecBuffer = (vec) => {
  const buf = Buffer.alloc(vec.length * 4);
  for (let i = 0; i < vec.length; i++) buf.writeFloatLE(vec[i], i * 4);
  return buf;
};

const TOP_RETRIEVE = 250;  // need 200+ to sample controls
const tasks = []; // { qid, candDocIds: top-K, controlDocIds: 2 negative controls, qrelPosIds: human-positives }
for (let i = 0; i < queries.length; i++) {
  const q = queries[i];
  const vRes = await embedder.embed('search_query: ' + q.rawText);
  if (vRes.isErr()) { console.error(`embed failed q${q.id}`); continue; }
  const denseRows = denseStmt.all(toVecBuffer(vRes.value), TOP_RETRIEVE);
  const ranked = denseRows.map((r) => rowidToId.get(r.rowid));
  const topK = ranked.slice(0, TOP_K_TO_JUDGE);
  // Controls: random docs from rank 200-249 (definitely irrelevant via dense)
  const tail = ranked.slice(200, TOP_RETRIEVE);
  const controls = [];
  while (controls.length < N_CONTROLS && tail.length > 0) {
    const idx = Math.floor(Math.random() * tail.length);
    const cand = tail.splice(idx, 1)[0];
    if (!qrels.get(q.id)?.has(cand)) controls.push(cand);  // ensure not human-judged
  }
  tasks.push({
    qid: q.id,
    queryText: q.rawText,
    topK,
    controls,
    qrelPos: [...(qrels.get(q.id)?.keys() ?? [])],
  });
  if ((i + 1) % 25 === 0) process.stdout.write(`\r  retrieved ${i + 1}/${queries.length}   `);
}
console.log(`\n  retrieved ${tasks.length} task contexts`);
embedder.shutdown?.();

// ─── LLM judge ─────────────────────────────────────────────────────
console.log('[3/5] Judging via Qwen2.5:3b...');
const PROMPT_TEMPLATE = (claim, passage) =>
`You are a strict scientific claim verifier. Given a claim and a passage, decide whether the passage CONTAINS information that DIRECTLY supports OR refutes the claim.

A passage is RELEVANT only if a domain expert would cite it to support or refute the claim. Background context, tangentially-related work, or papers from the same field are NOT relevant.

Output exactly one token: YES or NO.

CLAIM: ${claim}

PASSAGE: ${passage.slice(0, 1500)}

ANSWER:`;

const judgeOne = async (claim, passage) => {
  const prompt = PROMPT_TEMPLATE(claim, passage);
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0, num_predict: 4 },
    }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  const out = (j.response ?? '').trim().toUpperCase();
  if (out.startsWith('YES')) return 1;
  if (out.startsWith('NO')) return 0;
  return null;
};

// Dedupe (q, d) pairs across topK ∪ controls ∪ qrelPos
const allPairs = new Map(); // key = `${qid}|${docId}` → { qid, docId, kind: 'top'|'pos'|'ctrl', text }
for (const t of tasks) {
  for (const docId of t.topK) {
    const text = docTextById.get(docId);
    if (text) allPairs.set(`${t.qid}|${docId}`, { qid: t.qid, docId, kind: 'top', text, claim: t.queryText });
  }
  for (const docId of t.qrelPos) {
    const text = docTextById.get(docId);
    if (text) {
      const key = `${t.qid}|${docId}`;
      if (allPairs.has(key)) allPairs.get(key).kind = 'top+pos';
      else allPairs.set(key, { qid: t.qid, docId, kind: 'pos', text, claim: t.queryText });
    }
  }
  for (const docId of t.controls) {
    const text = docTextById.get(docId);
    if (text) allPairs.set(`${t.qid}|${docId}`, { qid: t.qid, docId, kind: 'ctrl', text, claim: t.queryText });
  }
}
console.log(`  ${allPairs.size} (q, d) pairs to judge`);

const judgments = new Map(); // key → { ...pair, llmYes }
let processed = 0;
const tStart = Date.now();
for (const [key, pair] of allPairs) {
  const llmYes = await judgeOne(pair.claim, pair.text);
  judgments.set(key, { ...pair, llmYes });
  processed++;
  if (processed % 25 === 0) {
    const elapsed = (Date.now() - tStart) / 1000;
    const rate = processed / elapsed;
    const eta = (allPairs.size - processed) / rate / 60;
    process.stdout.write(`\r  ${processed}/${allPairs.size} (${rate.toFixed(2)} pair/s, ETA ${eta.toFixed(1)}min)   `);
  }
}
console.log(`\n  judged ${processed} pairs in ${((Date.now() - tStart) / 60000).toFixed(1)} min`);

// ─── compute Cohen's κ ─────────────────────────────────────────────
console.log('[4/5] Computing Cohen\'s κ...');

// Binary contingency on the SUBSET of pairs with reliable ground truth:
//   - human-positive (qrelPos) → ground truth = 1
//   - control (rank 200+, not human-judged) → ground truth = 0
// Top-K pairs that are NEITHER human-positive NOR control are EXCLUDED
// from κ — they're the discovery set.
const calibration = []; // { humanRel, llmYes }
for (const j of judgments.values()) {
  if (j.llmYes === null) continue;
  if (j.kind === 'pos' || j.kind === 'top+pos') {
    calibration.push({ humanRel: 1, llmYes: j.llmYes });
  } else if (j.kind === 'ctrl') {
    calibration.push({ humanRel: 0, llmYes: j.llmYes });
  }
}
const n = calibration.length;
const a = calibration.filter((x) => x.humanRel === 1 && x.llmYes === 1).length;
const b = calibration.filter((x) => x.humanRel === 0 && x.llmYes === 1).length;
const c = calibration.filter((x) => x.humanRel === 1 && x.llmYes === 0).length;
const d = calibration.filter((x) => x.humanRel === 0 && x.llmYes === 0).length;
const po = (a + d) / n;
const pe = ((a + b) * (a + c) + (c + d) * (b + d)) / (n * n);
const kappa = (po - pe) / (1 - pe);

console.log(`\n  Calibration set: n=${n}  (${a + c} human-positives, ${b + d} controls)`);
console.log(`  Confusion: TP=${a}  FP=${b}  FN=${c}  TN=${d}`);
console.log(`  P(observed)=${po.toFixed(3)}  P(expected by chance)=${pe.toFixed(3)}`);
console.log(`  Cohen's κ = ${kappa.toFixed(4)}`);

const kappaPass = kappa >= 0.6;
console.log(`  Verdict: ${kappaPass ? '✓ trust the judge (κ ≥ 0.6, substantial agreement)' : '✗ REJECT — κ too low; do not expand qrels'}`);

// ─── compute NDCG@10 against Q vs Q⁺ ───────────────────────────────
console.log('[5/5] Computing NDCG@10 against Q vs Q⁺...');

const log2 = (x) => Math.log(x) / Math.LN2;
const ndcg10 = (rankedIds, relMap) => {
  let dcg = 0;
  for (let i = 0; i < Math.min(rankedIds.length, 10); i++) {
    if (relMap.has(rankedIds[i])) dcg += 1 / log2(i + 2);
  }
  const numRel = Math.min(relMap.size, 10);
  let idcg = 0;
  for (let i = 0; i < numRel; i++) idcg += 1 / log2(i + 2);
  return idcg > 0 ? dcg / idcg : 0;
};

let sumQ = 0, sumQplus = 0;
let newPositivesTotal = 0;
for (const t of tasks) {
  const relQ = qrels.get(t.qid) ?? new Map();
  const relQplus = new Map(relQ);
  // Add LLM-positive docs from top-K that are NOT in Q
  for (const docId of t.topK) {
    if (relQplus.has(docId)) continue;
    const judg = judgments.get(`${t.qid}|${docId}`);
    if (judg && judg.llmYes === 1) {
      relQplus.set(docId, 1);
      newPositivesTotal++;
    }
  }
  sumQ += ndcg10(t.topK, relQ);
  sumQplus += ndcg10(t.topK, relQplus);
}
const ndcgQ = sumQ / tasks.length;
const ndcgQplus = sumQplus / tasks.length;
const deltaQplus = (ndcgQplus - ndcgQ) * 100;
const fnRate = newPositivesTotal / (tasks.length * TOP_K_TO_JUDGE);

console.log(`\n  NDCG@10 vs Q  (original qrels):     ${(ndcgQ * 100).toFixed(2)}%`);
console.log(`  NDCG@10 vs Q⁺ (LLM-expanded qrels): ${(ndcgQplus * 100).toFixed(2)}%`);
console.log(`  Δ (instrument-correction):           ${deltaQplus >= 0 ? '+' : ''}${deltaQplus.toFixed(2)}pt`);
console.log(`  New positives discovered:            ${newPositivesTotal} (${(fnRate * 100).toFixed(1)}% of top-${TOP_K_TO_JUDGE} were unjudged-relevant)`);

const result = {
  attack: 'qrel completeness audit (LLM-as-judge with κ blinding)',
  dataset: 'BeIR/scifact',
  judge_model: OLLAMA_MODEL,
  sample_size: queries.length,
  top_k_judged: TOP_K_TO_JUDGE,
  pairs_judged: judgments.size,
  cohens_kappa: kappa,
  kappa_pass: kappaPass,
  confusion: { TP: a, FP: b, FN: c, TN: d },
  ndcg_at_10_Q: ndcgQ,
  ndcg_at_10_Qplus: ndcgQplus,
  delta_pt_instrument: deltaQplus,
  new_positives: newPositivesTotal,
  estimated_qrel_false_negative_rate: fnRate,
  verdict: kappaPass
    ? (deltaQplus > 2 ? '✓ instrument-floor confirmed' : '◯ qrels are tight; 75.22% is the real ceiling')
    : '✗ judge unreliable; cannot expand qrels',
  timestamp: new Date().toISOString(),
};
const outPath = join(RESULTS_DIR, 'results.json');
writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`\nResult: ${outPath}`);

db.close();
