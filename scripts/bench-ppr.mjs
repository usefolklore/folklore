#!/usr/bin/env node
// PPR graph-rerank gate on SciFact.
//
// Hypothesis: adding a personalized-PageRank rerank layer over a doc-doc
// kNN graph lifts NDCG@10 on top of dense+hybrid retrieval, matching the
// HippoRAG-2 (NeurIPS 2024) single-hop-rerank behavior (+0.5 to +2 pt
// typical on BEIR-class datasets).
//
// Method (uses only the existing SciFact nomic sota.db cache — no re-
// embedding, no new dataset):
//   1. Load nomic corpus + queries from the cached bench DB.
//   2. Run initial dense retrieval → top-100 candidates per query.
//   3. Build a corpus-wide doc-doc kNN graph (k=5, cosine weights).
//   4. For each query, construct a personalization vector from the
//      dense-score top-100 (zero elsewhere).
//   5. Run PPR for 50 iters with alpha=0.85.
//   6. Rerank top-100 by PPR score.
//   7. Compare NDCG@10 / R@10 / MRR before and after.
//
// Gate:
//   +0.5 pt NDCG@10 → PASS, promote to primitive in production rerank
//   +0.0 to +0.5 pt → SOFT — keep primitive, defer production ship
//   negative         → NULL, rethink (most likely PPR single-hop nulls
//                                      on small corpora — expected)

import { existsSync, writeFileSync, readFileSync, createReadStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

import { pagerank, buildKnnGraph } from '../dist/domain/pagerank.js';
import { xenovaEmbedder } from '../dist/infrastructure/embedders.js';

const DATASET = 'scifact';
const K_NN = 5;
const ALPHA = 0.85;
const TOP_N = 100;
const CACHE_ROOT = join(homedir(), '.wellinformed', 'bench');
const NOMIC_DB = join(CACHE_ROOT, `${DATASET}__nomic-ai-nomic-embed-text-v1-5__hybrid`, 'sota.db');
const DS_DIR = join(CACHE_ROOT, DATASET, DATASET);
const QRELS_TSV = join(DS_DIR, 'qrels', 'test.tsv');
const QUERIES_JSONL = join(DS_DIR, 'queries.jsonl');
const OUT_DIR = join(CACHE_ROOT, 'ppr');
const Q_BIN = join(CACHE_ROOT, 'matryoshka-scifact-nomic-ai-nomic-embed-text-v1-5', 'queries-768.bin');

mkdirSync(OUT_DIR, { recursive: true });

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' PPR graph-rerank gate — SciFact');
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 k (kNN edges):  ${K_NN}
 alpha:          ${ALPHA}
 top-N rerank:   ${TOP_N}
`);

// ─── load corpus vectors from sota.db ─────────────────────────────

const Better = (await import('better-sqlite3')).default;
const sqliteVec = await import('sqlite-vec');

if (!existsSync(NOMIC_DB)) { console.error(`✗ missing ${NOMIC_DB}`); process.exit(1); }
const db = new Better(NOMIC_DB, { readonly: true });
sqliteVec.load(db);
const meta = db.prepare('SELECT rowid, doc_id FROM doc_meta ORDER BY rowid').all();
const vecs = db.prepare('SELECT rowid, embedding FROM vec_nodes ORDER BY rowid').all();
db.close();

const DIM = 768;
console.log(`[1/5] Loading ${meta.length} corpus vectors...`);
const corpusVecs = new Array(meta.length);
const corpusIds = new Array(meta.length);
for (let i = 0; i < meta.length; i++) {
  const v = new Float64Array(DIM);
  for (let j = 0; j < DIM; j++) v[j] = vecs[i].embedding.readFloatLE(j * 4);
  corpusVecs[i] = v;
  corpusIds[i] = meta[i].doc_id;
}

// ─── load queries ────────────────────────────────────────────────

const loadJsonl = async (p) => {
  const lines = [];
  const rl = createInterface({ input: createReadStream(p) });
  for await (const line of rl) if (line.trim()) lines.push(JSON.parse(line));
  return lines;
};

const qrels = new Map();
for (const line of readFileSync(QRELS_TSV, 'utf8').split('\n').slice(1)) {
  const [qid, docId, scoreStr] = line.split('\t');
  if (!qid || !scoreStr) continue;
  const sc = parseInt(scoreStr, 10);
  if (sc > 0) {
    if (!qrels.has(qid)) qrels.set(qid, new Map());
    qrels.get(qid).set(docId, sc);
  }
}
const testQids = new Set(qrels.keys());
const queriesRaw = await loadJsonl(QUERIES_JSONL);
const queries = queriesRaw.filter((q) => testQids.has(String(q._id))).map((q) => ({ id: String(q._id), text: q.text }));
console.log(`  queries: ${queries.length}`);

// ─── load or embed query vectors ─────────────────────────────────

let queryVecs;
if (existsSync(Q_BIN)) {
  console.log('[2/5] Loading cached query vectors...');
  const buf = readFileSync(Q_BIN);
  const n = buf.readUInt32LE(0);
  const d = buf.readUInt32LE(4);
  if (d !== DIM) { console.error(`query cache dim ${d} != ${DIM}`); process.exit(1); }
  if (n !== queries.length) { console.error(`query cache count ${n} != ${queries.length}`); process.exit(1); }
  queryVecs = new Array(n);
  for (let i = 0; i < n; i++) {
    const v = new Float64Array(d);
    for (let j = 0; j < d; j++) v[j] = buf.readFloatLE(8 + (i * d + j) * 4);
    queryVecs[i] = v;
  }
} else {
  console.log('[2/5] Embedding queries...');
  const e = xenovaEmbedder({ model: 'nomic-ai/nomic-embed-text-v1.5', dim: DIM, maxLength: 8192, pooling: 'mean' });
  queryVecs = new Array(queries.length);
  const BATCH = 32;
  for (let i = 0; i < queries.length; i += BATCH) {
    const slice = queries.slice(i, i + BATCH).map((q) => 'search_query: ' + q.text);
    const r = await e.embedBatch(slice);
    if (r.isErr()) { console.error(`embed: ${JSON.stringify(r.error)}`); process.exit(1); }
    for (let j = 0; j < r.value.length; j++) {
      const v = new Float64Array(DIM);
      for (let k = 0; k < DIM; k++) v[k] = r.value[j][k];
      queryVecs[i + j] = v;
    }
  }
}

// ─── build kNN graph once over the corpus ────────────────────────

console.log(`[3/5] Building doc-doc kNN graph (k=${K_NN}, ${corpusVecs.length} nodes)...`);
const t3 = Date.now();
const graphRes = buildKnnGraph(corpusVecs, K_NN);
if (graphRes.isErr()) { console.error(`kNN: ${JSON.stringify(graphRes.error)}`); process.exit(1); }
const edges = graphRes.value;
console.log(`  ${edges.length} edges in ${((Date.now() - t3) / 1000).toFixed(1)}s`);

// ─── retrieval + PPR rerank per query ────────────────────────────

const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

const log2 = (x) => Math.log(x) / Math.LN2;
const ndcgK = (ranked, rel, k) => {
  let dcg = 0;
  const topK = ranked.slice(0, k);
  for (let i = 0; i < topK.length; i++) dcg += (rel.get(topK[i].docId) ?? 0) / log2(i + 2);
  const ideal = [...rel.values()].sort((a, b) => b - a).slice(0, k);
  let idcg = 0;
  for (let i = 0; i < ideal.length; i++) idcg += ideal[i] / log2(i + 2);
  return idcg > 0 ? dcg / idcg : 0;
};
const recallK = (ranked, rel, k) => {
  const topK = ranked.slice(0, k);
  let h = 0;
  for (const r of topK) if (rel.has(r.docId)) h++;
  return rel.size > 0 ? h / rel.size : 0;
};
const mrrOne = (ranked, rel) => {
  for (let i = 0; i < ranked.length; i++) if (rel.has(ranked[i].docId)) return 1 / (i + 1);
  return 0;
};

console.log('[4/5] Running retrieval + PPR rerank per query...');
const metricsDense = { ndcg10: [], r10: [], mrr: [] };
const metricsPpr   = { ndcg10: [], r10: [], mrr: [] };

const tPpr = Date.now();
for (let qi = 0; qi < queries.length; qi++) {
  const q = queries[qi];
  const qv = queryVecs[qi];
  const rel = qrels.get(q.id) ?? new Map();

  // Initial dense retrieval — score all docs, keep top-N.
  const scored = new Array(corpusVecs.length);
  for (let i = 0; i < corpusVecs.length; i++) {
    scored[i] = { idx: i, docId: corpusIds[i], score: dot(qv, corpusVecs[i]) };
  }
  scored.sort((a, b) => b.score - a.score);
  const dense = scored.slice(0, TOP_N);
  metricsDense.ndcg10.push(ndcgK(dense, rel, 10));
  metricsDense.r10.push(recallK(dense, rel, 10));
  metricsDense.mrr.push(mrrOne(dense, rel));

  // Build personalization vector: top-N dense scores at their indices,
  // zero elsewhere. Shift min to zero so PageRank sees non-negative.
  const personalization = new Array(corpusVecs.length).fill(0);
  let minS = Infinity, maxS = -Infinity;
  for (const c of dense) { if (c.score < minS) minS = c.score; if (c.score > maxS) maxS = c.score; }
  const range = maxS - minS || 1;
  for (const c of dense) {
    personalization[c.idx] = (c.score - minS) / range + 1e-6; // strictly positive
  }

  // Run PPR.
  const pprRes = pagerank(corpusVecs.length, edges, personalization, { alpha: ALPHA, maxIter: 50, tol: 1e-6 });
  if (pprRes.isErr()) {
    metricsPpr.ndcg10.push(0); metricsPpr.r10.push(0); metricsPpr.mrr.push(0);
    continue;
  }

  // Rerank top-N by PPR score (NOT the whole corpus — docs outside the
  // initial top-N would bleed in, changing the comparison).
  const reranked = dense.map((c) => ({ ...c, pprScore: pprRes.value[c.idx] }));
  reranked.sort((a, b) => b.pprScore - a.pprScore);
  metricsPpr.ndcg10.push(ndcgK(reranked, rel, 10));
  metricsPpr.r10.push(recallK(reranked, rel, 10));
  metricsPpr.mrr.push(mrrOne(reranked, rel));

  if ((qi + 1) % 50 === 0) process.stdout.write(`\r  ${qi + 1}/${queries.length}   `);
}
process.stdout.write('\n');
console.log(`  scoring done in ${((Date.now() - tPpr) / 1000).toFixed(1)}s`);

// ─── report ──────────────────────────────────────────────────────

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const dN = mean(metricsDense.ndcg10), pN = mean(metricsPpr.ndcg10);
const dR = mean(metricsDense.r10),    pR = mean(metricsPpr.r10);
const dM = mean(metricsDense.mrr),    pM = mean(metricsPpr.mrr);

const fmt = (p) => (p * 100).toFixed(2) + '%';
console.log('[5/5] Gate verdict');
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' stage          NDCG@10    R@10      MRR');
console.log(`  dense (n=${TOP_N})    ${fmt(dN).padStart(7)}    ${fmt(dR).padStart(7)}    ${dM.toFixed(4)}`);
console.log(`  + PPR rerank    ${fmt(pN).padStart(7)}    ${fmt(pR).padStart(7)}    ${pM.toFixed(4)}`);
console.log(`  Δ               ${((pN - dN) * 100 >= 0 ? '+' : '') + ((pN - dN) * 100).toFixed(2)}pt      ${((pR - dR) * 100 >= 0 ? '+' : '') + ((pR - dR) * 100).toFixed(2)}pt      ${(pM - dM).toFixed(4)}`);

const delta = (pN - dN) * 100;
console.log('');
if (delta >= 0.5) {
  console.log(`✓ PASS — PPR rerank adds ${delta.toFixed(2)}pt NDCG@10 ≥ 0.5pt gate`);
  console.log('  → Promote to production rerank primitive.');
} else if (delta >= 0) {
  console.log(`~ SOFT — PPR rerank adds ${delta.toFixed(2)}pt, under 0.5pt gate`);
  console.log('  → Keep primitive. Gate on multi-hop benchmark (MuSiQue/HotpotQA) in v3.2.');
} else {
  console.log(`✗ NULL — PPR rerank regresses by ${Math.abs(delta).toFixed(2)}pt`);
  console.log('  → Single-hop retrieval does not benefit. Document and park.');
}
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

writeFileSync(join(OUT_DIR, 'results.json'), JSON.stringify({
  dataset: `BeIR/${DATASET}`,
  knn_k: K_NN,
  alpha: ALPHA,
  top_n: TOP_N,
  dense: { ndcg10: dN, r10: dR, mrr: dM },
  ppr:   { ndcg10: pN, r10: pR, mrr: pM },
  delta_ndcg10_pt: delta,
  timestamp: new Date().toISOString(),
}, null, 2));
console.log(`\nResult JSON: ${join(OUT_DIR, 'results.json')}`);
