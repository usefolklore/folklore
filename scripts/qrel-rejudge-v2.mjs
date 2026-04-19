#!/usr/bin/env node
/**
 * SciFact qrel completeness audit V2 — Round 3 calibrated-judge attack.
 *
 * Round 2 (qrel-rejudge.mjs) produced κ = 0.418 (FP=0, FN=74) with the
 * naive YES/NO prompt on Qwen2.5:3b. The judge had perfect precision
 * but only 36% recall — too cautious. Known LLM-judge pattern (Liu
 * 2023, Wang 2024 EMNLP), known fix: few-shot exemplars + brief
 * chain-of-thought reasoning before the final label. Published lifts
 * to κ are typically 0.05-0.20.
 *
 * V2 changes:
 *   1. Four hand-crafted few-shot exemplars covering: direct support,
 *      direct refutation, tangential-not-relevant, same-field-unrelated.
 *   2. Chain-of-thought: the LLM emits a short reasoning step before
 *      the final YES/NO. Boosts recall on borderline cases.
 *   3. Output parsing: extract last YES/NO token, more robust.
 *
 * Gate: κ ≥ 0.6 (substantial agreement, Landis-Koch). If passes,
 * the +2.5pt instrument-correction lift becomes the formal SOTA claim
 * for measurement-corrected SciFact NDCG@10.
 */

import { createReadStream, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
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
const RESULTS_DIR = join(CACHE_DIR, 'qrel-rejudge-v2');
mkdirSync(RESULTS_DIR, { recursive: true });

const SAMPLE_SIZE = parseInt(process.argv[2] ?? '100', 10);
const TOP_K_TO_JUDGE = parseInt(process.argv[3] ?? '20', 10);
const N_CONTROLS = 2;
const OLLAMA_MODEL = 'qwen2.5:3b';
const OLLAMA_URL = 'http://localhost:11434';

console.log('━'.repeat(60));
console.log(' wellinformed — SciFact qrel rejudge V2 (few-shot + CoT)');
console.log('━'.repeat(60));
console.log(` Round 2 baseline:     κ = 0.418 (FAIL), FP=0, recall=36%`);
console.log(` V2 changes:           4-shot exemplars + chain-of-thought`);
console.log(` Gate:                 κ ≥ 0.6 → formal +2.5pt SOTA claim`);
console.log('');

// ─── few-shot exemplars (carefully constructed) ────────────────────
const FEW_SHOT = `EXAMPLE 1 (relevance via direct support):
CLAIM: Vitamin D deficiency increases risk of cardiovascular disease.
PASSAGE: A meta-analysis of 19 prospective cohort studies (n=65,994) found that individuals in the lowest quintile of serum 25-hydroxyvitamin D had a 1.52× higher risk of incident cardiovascular events compared to the highest quintile (95% CI 1.30-1.77).
REASONING: The passage directly reports a quantitative association between vitamin D deficiency and cardiovascular disease risk, with effect size and confidence interval — this is exactly the evidence needed to support the claim.
ANSWER: YES

EXAMPLE 2 (relevance via direct refutation):
CLAIM: Daily aspirin reduces all-cause mortality in healthy elderly adults.
PASSAGE: The ASPREE randomized trial (n=19,114, median follow-up 4.7 years) found no significant difference in all-cause mortality between aspirin and placebo arms in healthy adults aged 70+ (HR 1.14, 95% CI 1.01-1.29; p=0.04 favoring placebo).
REASONING: The passage reports a large RCT directly contradicting the claim — this is refuting evidence, which COUNTS as relevance for fact-checking purposes (the claim verifier needs to find both supporting AND refuting passages).
ANSWER: YES

EXAMPLE 3 (tangentially related — NOT relevant):
CLAIM: SGLT2 inhibitors reduce heart failure hospitalizations in type 2 diabetes.
PASSAGE: Type 2 diabetes is a chronic metabolic disorder characterized by insulin resistance and beta-cell dysfunction, affecting over 400 million people worldwide. The pathophysiology involves complex interactions between genetic and environmental factors.
REASONING: The passage discusses the same disease but only at the introductory/background level — no information about SGLT2 inhibitors or heart failure outcomes. A domain expert would NOT cite this passage to support or refute the specific claim.
ANSWER: NO

EXAMPLE 4 (same field, different topic — NOT relevant):
CLAIM: Statins increase risk of new-onset diabetes mellitus.
PASSAGE: Statins are HMG-CoA reductase inhibitors widely prescribed for hyperlipidemia. Their primary mechanism involves competitive inhibition of cholesterol biosynthesis in the liver, leading to upregulation of LDL receptors.
REASONING: Same drug class as the claim but only mechanistic background — no data about diabetes risk. NOT directly relevant.
ANSWER: NO

`;

const PROMPT_TEMPLATE = (claim, passage) =>
`You are a strict scientific claim verifier. Given a claim and a passage, decide whether the passage CONTAINS information that DIRECTLY supports OR refutes the claim.

A passage is RELEVANT (YES) if a domain expert would cite it as evidence to support OR refute the claim. Refuting evidence COUNTS as relevant.

A passage is NOT RELEVANT (NO) if it only provides background, tangential context, or discusses the same field/disease/drug class without addressing the specific claim.

Reason briefly in one sentence, then output ANSWER: YES or ANSWER: NO on the final line.

${FEW_SHOT}NOW JUDGE:
CLAIM: ${claim}

PASSAGE: ${passage.slice(0, 1500)}

REASONING:`;

// ─── load corpus + queries + qrels ─────────────────────────────────
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
const queriesAll = queriesRaw
  .filter((q) => qrels.has(String(q._id)))
  .map((q) => ({ id: String(q._id), rawText: q.text }));
const queries = queriesAll.slice(0, SAMPLE_SIZE);
console.log(`  ${queries.length} queries sampled`);

const db = new Database(DB_PATH, { readonly: false });
sqliteVec.load(db);
const rowidToId = new Map();
const rows = db.prepare('SELECT rowid, node_id FROM vec_meta').all();
for (const r of rows) rowidToId.set(r.rowid, r.node_id);

// ─── retrieve ──────────────────────────────────────────────────────
console.log('[2/5] Retrieving top-K + controls...');
const embedder = rustSubprocessEmbedder({ model: 'bge-base', dim: 768 });
const denseStmt = db.prepare(
  `SELECT v.rowid FROM vec_nodes v WHERE v.embedding MATCH ? AND k = ? ORDER BY v.distance`
);
const toVecBuffer = (vec) => {
  const buf = Buffer.alloc(vec.length * 4);
  for (let i = 0; i < vec.length; i++) buf.writeFloatLE(vec[i], i * 4);
  return buf;
};

const TOP_RETRIEVE = 250;
const tasks = [];
for (let i = 0; i < queries.length; i++) {
  const q = queries[i];
  const vRes = await embedder.embed('search_query: ' + q.rawText);
  if (vRes.isErr()) continue;
  const denseRows = denseStmt.all(toVecBuffer(vRes.value), TOP_RETRIEVE);
  const ranked = denseRows.map((r) => rowidToId.get(r.rowid));
  const topK = ranked.slice(0, TOP_K_TO_JUDGE);
  const tail = ranked.slice(200, TOP_RETRIEVE);
  const controls = [];
  while (controls.length < N_CONTROLS && tail.length > 0) {
    const idx = Math.floor(Math.random() * tail.length);
    const cand = tail.splice(idx, 1)[0];
    if (!qrels.get(q.id)?.has(cand)) controls.push(cand);
  }
  tasks.push({ qid: q.id, queryText: q.rawText, topK, controls, qrelPos: [...(qrels.get(q.id)?.keys() ?? [])] });
  if ((i + 1) % 25 === 0) process.stdout.write(`\r  ${i + 1}/${queries.length}   `);
}
console.log(`\n  ${tasks.length} tasks built`);
embedder.shutdown?.();

// ─── judge ─────────────────────────────────────────────────────────
console.log('[3/5] Judging via Qwen2.5:3b (few-shot + CoT)...');

const judgeOne = async (claim, passage) => {
  const prompt = PROMPT_TEMPLATE(claim, passage);
  const res = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      prompt,
      stream: false,
      options: { temperature: 0, num_predict: 80 }, // CoT needs more tokens
    }),
  });
  if (!res.ok) return null;
  const j = await res.json();
  const out = (j.response ?? '').toUpperCase();
  // Find the last "ANSWER: YES" or "ANSWER: NO" pattern
  const m = out.match(/ANSWER\s*:\s*(YES|NO)\b/g);
  if (m && m.length > 0) {
    const last = m[m.length - 1];
    return last.includes('YES') ? 1 : 0;
  }
  // Fallback: look for last YES/NO token in output
  const tokens = out.split(/\W+/).filter((t) => t === 'YES' || t === 'NO');
  if (tokens.length > 0) return tokens[tokens.length - 1] === 'YES' ? 1 : 0;
  return null;
};

const allPairs = new Map();
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

const judgments = new Map();
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
console.log(`\n  judged in ${((Date.now() - tStart) / 60000).toFixed(1)} min`);

// ─── κ + NDCG ──────────────────────────────────────────────────────
console.log('[4/5] Computing Cohen\'s κ...');
const calibration = [];
for (const j of judgments.values()) {
  if (j.llmYes === null) continue;
  if (j.kind === 'pos' || j.kind === 'top+pos') calibration.push({ humanRel: 1, llmYes: j.llmYes });
  else if (j.kind === 'ctrl') calibration.push({ humanRel: 0, llmYes: j.llmYes });
}
const n = calibration.length;
const a = calibration.filter((x) => x.humanRel === 1 && x.llmYes === 1).length;
const b = calibration.filter((x) => x.humanRel === 0 && x.llmYes === 1).length;
const c = calibration.filter((x) => x.humanRel === 1 && x.llmYes === 0).length;
const d = calibration.filter((x) => x.humanRel === 0 && x.llmYes === 0).length;
const po = (a + d) / n;
const pe = ((a + b) * (a + c) + (c + d) * (b + d)) / (n * n);
const kappa = (po - pe) / (1 - pe);
const precision = (a + b) > 0 ? a / (a + b) : 0;
const recall = (a + c) > 0 ? a / (a + c) : 0;

console.log(`\n  Calibration n=${n}  TP=${a} FP=${b} FN=${c} TN=${d}`);
console.log(`  precision=${(precision * 100).toFixed(1)}%  recall=${(recall * 100).toFixed(1)}%`);
console.log(`  Cohen's κ = ${kappa.toFixed(4)}`);

const kappaPass = kappa >= 0.6;
const v2VsV1 = kappa - 0.4181;
console.log(`  V2 vs V1: ${v2VsV1 >= 0 ? '+' : ''}${v2VsV1.toFixed(4)} κ`);
console.log(`  Verdict: ${kappaPass ? '✓ TRUST JUDGE — formal SOTA claim unblocked' : `✗ STILL FAIL — κ improved by ${v2VsV1.toFixed(3)} but below 0.6 gate`}`);

console.log('[5/5] Computing NDCG@10 vs Q vs Q⁺...');
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

let sumQ = 0, sumQplus = 0, newPos = 0;
for (const t of tasks) {
  const relQ = qrels.get(t.qid) ?? new Map();
  const relQplus = new Map(relQ);
  for (const docId of t.topK) {
    if (relQplus.has(docId)) continue;
    const j = judgments.get(`${t.qid}|${docId}`);
    if (j && j.llmYes === 1) {
      relQplus.set(docId, 1);
      newPos++;
    }
  }
  sumQ += ndcg10(t.topK, relQ);
  sumQplus += ndcg10(t.topK, relQplus);
}
const ndcgQ = sumQ / tasks.length;
const ndcgQplus = sumQplus / tasks.length;
const delta = (ndcgQplus - ndcgQ) * 100;

console.log(`\n  NDCG@10 vs Q  (original):       ${(ndcgQ * 100).toFixed(2)}%`);
console.log(`  NDCG@10 vs Q⁺ (LLM-expanded):   ${(ndcgQplus * 100).toFixed(2)}%`);
console.log(`  Δ instrument-correction:        ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}pt`);
console.log(`  New positives discovered:        ${newPos} (${(newPos / (tasks.length * TOP_K_TO_JUDGE) * 100).toFixed(1)}% qrel FN rate)`);

const result = {
  attack: 'qrel rejudge V2 — few-shot + CoT calibrated judge',
  judge_model: OLLAMA_MODEL,
  prompt_strategy: '4-shot + chain-of-thought',
  sample_size: queries.length,
  top_k_judged: TOP_K_TO_JUDGE,
  pairs_judged: judgments.size,
  cohens_kappa_v2: kappa,
  cohens_kappa_v1: 0.4181,
  delta_kappa: v2VsV1,
  kappa_pass: kappaPass,
  precision: precision,
  recall: recall,
  confusion: { TP: a, FP: b, FN: c, TN: d },
  ndcg_at_10_Q: ndcgQ,
  ndcg_at_10_Qplus: ndcgQplus,
  delta_pt_instrument: delta,
  new_positives: newPos,
  qrel_false_negative_rate: newPos / (tasks.length * TOP_K_TO_JUDGE),
  verdict: kappaPass
    ? '✓ FORMAL SOTA CLAIM unblocked — true ceiling ~' + (ndcgQplus * 100).toFixed(2) + '%'
    : '✗ κ still below 0.6 — instrument-floor evidence remains heuristic',
  timestamp: new Date().toISOString(),
};
writeFileSync(join(RESULTS_DIR, 'results.json'), JSON.stringify(result, null, 2));
console.log(`\nResult: ${join(RESULTS_DIR, 'results.json')}`);

db.close();
