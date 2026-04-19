#!/usr/bin/env node
/**
 * Diagonal Jacobi preconditioning of cosine similarity — Round 2 CFD
 * attack. Strict subset of full whitening (separable, MRL-safe, no
 * eigendecomposition required).
 *
 * Math:
 *   Compute per-dim variance: σ²_i = E[(d_i − μ_i)²] over corpus
 *   Preconditioner weights:    w_i = 1 / sqrt(σ²_i + ε)
 *   Apply elementwise:          d̃ = w ⊙ (d − μ),  q̃ = w ⊙ (q − μ)
 *   Renormalize:                d̃ /= ||d̃||,        q̃ /= ||q̃||
 *   Score:                      cosine(d̃, q̃)
 *
 * This is mathematically equivalent to Mahalanobis distance with a
 * DIAGONAL covariance matrix (Σ ≈ diag(σ²)), which is the cheapest
 * possible anisotropy correction. Full whitening (Mahalanobis with
 * full Σ) is the upper bound; diagonal Jacobi captures the
 * per-dimension scale anisotropy but ignores cross-dimension
 * correlations. If diagonal is null, full whitening likely is too.
 *
 * Worst case: w_i = 1 for all i → identity transform → vanilla cosine.
 * Cannot regress below baseline.
 *
 * Reuses cached SciFact bge-base vectors.db. Pure JS over Float32Array.
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
const QUERIES_JSONL = join(DATASET_DIR, 'queries.jsonl');
const QRELS_TSV = join(DATASET_DIR, 'qrels', 'test.tsv');
const RESULTS_DIR = join(CACHE_DIR, 'jacobi-preconditioning');
mkdirSync(RESULTS_DIR, { recursive: true });

const EPS = 1e-6;
const TOP_K = 100;
const RRF_K = 60;

console.log('━'.repeat(60));
console.log(' wellinformed — Diagonal Jacobi preconditioning (CFD #1)');
console.log('━'.repeat(60));
console.log(' Baseline: Phase 25 hybrid bge-base = 75.22% NDCG@10');
console.log(' Math:    cosine(W·(d−μ), W·(q−μ)) where W = diag(1/√σ²)');
console.log(' Worst case: W=I → vanilla cosine (cannot regress)');
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

console.log('[1/5] Loading queries + qrels...');
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
const queries = queriesRaw
  .filter((q) => qrels.has(String(q._id)))
  .map((q) => ({ id: String(q._id), rawText: q.text }));
console.log(`  ${queries.length} queries`);

const db = new Database(DB_PATH, { readonly: false });
sqliteVec.load(db);
const rowidToId = new Map();
const rows = db.prepare('SELECT rowid, node_id FROM vec_meta').all();
for (const r of rows) rowidToId.set(r.rowid, r.node_id);

// ─── load all corpus vectors + compute μ, σ² ───────────────────────
console.log('[2/5] Loading corpus vectors + computing statistics...');
const allVecRows = db.prepare('SELECT rowid, embedding FROM vec_nodes').all();
const D = 768;
const N = allVecRows.length;
const mu = new Float64Array(D);
const corpusVecs = new Array(N);
const corpusRowids = new Array(N);
for (let r = 0; r < N; r++) {
  const buf = allVecRows[r].embedding;
  const v = new Float32Array(D);
  for (let i = 0; i < D; i++) v[i] = buf.readFloatLE(i * 4);
  corpusVecs[r] = v;
  corpusRowids[r] = allVecRows[r].rowid;
  for (let i = 0; i < D; i++) mu[i] += v[i];
}
for (let i = 0; i < D; i++) mu[i] /= N;

const sigma2 = new Float64Array(D);
for (let r = 0; r < N; r++) {
  const v = corpusVecs[r];
  for (let i = 0; i < D; i++) {
    const dv = v[i] - mu[i];
    sigma2[i] += dv * dv;
  }
}
for (let i = 0; i < D; i++) sigma2[i] /= N;
console.log(`  N=${N}, D=${D}`);
console.log(`  μ stats:  min=${Math.min(...mu).toFixed(4)}  max=${Math.max(...mu).toFixed(4)}  mean=${(mu.reduce((a, b) => a + b, 0) / D).toFixed(4)}`);
const s2arr = Array.from(sigma2);
console.log(`  σ² stats: min=${Math.min(...s2arr).toExponential(2)}  max=${Math.max(...s2arr).toExponential(2)}  ratio=${(Math.max(...s2arr) / Math.min(...s2arr)).toFixed(0)}×`);

// ─── precondition corpus vectors ───────────────────────────────────
console.log('[3/5] Applying preconditioning W = diag(1/√(σ² + ε))...');
const w = new Float32Array(D);
for (let i = 0; i < D; i++) w[i] = 1 / Math.sqrt(sigma2[i] + EPS);
const preCorpus = new Array(N);
for (let r = 0; r < N; r++) {
  const v = corpusVecs[r];
  const vt = new Float32Array(D);
  let sumsq = 0;
  for (let i = 0; i < D; i++) {
    vt[i] = w[i] * (v[i] - mu[i]);
    sumsq += vt[i] * vt[i];
  }
  const norm = Math.sqrt(sumsq) || 1;
  for (let i = 0; i < D; i++) vt[i] /= norm;
  preCorpus[r] = vt;
}

// ─── BM25 path (unchanged) ─────────────────────────────────────────
const bm25Stmt = db.prepare(
  `SELECT rowid, bm25(fts_docs, 0.9, 0.4) AS rank
     FROM fts_docs
     WHERE fts_docs MATCH ?
     ORDER BY rank
     LIMIT ?`
);
const LUCENE_STOPWORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'but', 'by', 'for',
  'if', 'in', 'into', 'is', 'it', 'no', 'not', 'of', 'on', 'or',
  'such', 'that', 'the', 'their', 'then', 'there', 'these', 'they',
  'this', 'to', 'was', 'will', 'with',
]);
const sanitizeForFts5 = (q) => {
  const tokens = (q.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((t) => t.length > 1 && !LUCENE_STOPWORDS.has(t));
  return tokens.join(' OR ');
};

console.log('[4/5] Booting Rust embedder + running queries...');
const embedder = rustSubprocessEmbedder({ model: 'bge-base', dim: 768 });

const denseStmt = db.prepare(
  `SELECT v.rowid, v.distance FROM vec_nodes v WHERE v.embedding MATCH ? AND k = ? ORDER BY v.distance`
);
const toVecBuffer = (vec) => {
  const buf = Buffer.alloc(vec.length * 4);
  for (let i = 0; i < vec.length; i++) buf.writeFloatLE(vec[i], i * 4);
  return buf;
};

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

let sumBaseline = 0, sumJacobi = 0, sumJacobiHybrid = 0;
const tStart = Date.now();
let processed = 0;

for (const q of queries) {
  const vRes = await embedder.embed('search_query: ' + q.rawText);
  if (vRes.isErr()) continue;
  const qv = vRes.value;

  // Baseline: stock dense + BM25 RRF
  const baseRows = denseStmt.all(toVecBuffer(qv), TOP_K);
  const baseRanked = baseRows.map((r) => rowidToId.get(r.rowid));

  // Jacobi-preconditioned dense (linear scan over preCorpus)
  const qPre = new Float32Array(D);
  let qSumsq = 0;
  for (let i = 0; i < D; i++) {
    qPre[i] = w[i] * (qv[i] - mu[i]);
    qSumsq += qPre[i] * qPre[i];
  }
  const qNorm = Math.sqrt(qSumsq) || 1;
  for (let i = 0; i < D; i++) qPre[i] /= qNorm;

  const sims = new Float32Array(N);
  for (let r = 0; r < N; r++) {
    const v = preCorpus[r];
    let s = 0;
    for (let i = 0; i < D; i++) s += v[i] * qPre[i];
    sims[r] = s;
  }
  // top-K by sim desc
  const idxs = Array.from({ length: N }, (_, i) => i);
  idxs.sort((a, b) => sims[b] - sims[a]);
  const jacobiRanked = idxs.slice(0, TOP_K).map((idx) => rowidToId.get(corpusRowids[idx]));

  // BM25
  let bm25Ranked = [];
  try {
    const ftsQ = sanitizeForFts5(q.rawText);
    if (ftsQ) {
      const bm25Rows = bm25Stmt.all(ftsQ, TOP_K);
      bm25Ranked = bm25Rows.map((r) => rowidToId.get(r.rowid));
    }
  } catch {}

  // RRF fuse: baseline (dense + BM25) and Jacobi (dense + BM25)
  const rrf = (denseList, bm25List) => {
    const map = new Map();
    denseList.forEach((id, i) => map.set(id, { id, dr: i, br: null }));
    bm25List.forEach((id, i) => {
      const e = map.get(id);
      if (e) e.br = i;
      else map.set(id, { id, dr: null, br: i });
    });
    return [...map.values()]
      .map((c) => {
        let s = 0;
        if (c.dr !== null) s += 1 / (RRF_K + c.dr + 1);
        if (c.br !== null) s += 1 / (RRF_K + c.br + 1);
        return { id: c.id, s };
      })
      .sort((a, b) => b.s - a.s)
      .map((c) => c.id);
  };

  const baselineHybrid = rrf(baseRanked, bm25Ranked);
  const jacobiHybrid = rrf(jacobiRanked, bm25Ranked);

  const rel = qrels.get(q.id);
  sumBaseline += ndcg10(baselineHybrid, rel);
  sumJacobi += ndcg10(jacobiRanked, rel);  // dense-only
  sumJacobiHybrid += ndcg10(jacobiHybrid, rel);

  processed++;
  if (processed % 50 === 0) {
    const elapsed = (Date.now() - tStart) / 1000;
    process.stdout.write(`\r  ${processed}/${queries.length} (${(processed / elapsed).toFixed(1)} q/s)   `);
  }
}

embedder.shutdown?.();
db.close();

const baseN = sumBaseline / processed;
const jacobiN = sumJacobi / processed;
const jacobiHybridN = sumJacobiHybrid / processed;
const deltaDense = (jacobiN - baseN) * 100;
const deltaHybrid = (jacobiHybridN - baseN) * 100;

console.log(`\n\nResults (n=${processed}):`);
console.log(`  Baseline (Phase 25 hybrid):       ${(baseN * 100).toFixed(2)}%`);
console.log(`  Jacobi dense-only:                 ${(jacobiN * 100).toFixed(2)}%   (Δ: ${deltaDense >= 0 ? '+' : ''}${deltaDense.toFixed(2)}pt)`);
console.log(`  Jacobi dense + BM25 hybrid:        ${(jacobiHybridN * 100).toFixed(2)}%   (Δ: ${deltaHybrid >= 0 ? '+' : ''}${deltaHybrid.toFixed(2)}pt)`);

const PASS = jacobiHybridN > baseN + 0.003;  // +0.3pt gate
console.log(`  Verdict: ${PASS ? '✓ PASS (≥+0.3pt)' : '✗ NULL'}`);

const result = {
  attack: 'diagonal Jacobi preconditioning of cosine kernel (CFD #1)',
  dataset: 'BeIR/scifact',
  baseline_hybrid_ndcg10: baseN,
  jacobi_dense_only_ndcg10: jacobiN,
  jacobi_hybrid_ndcg10: jacobiHybridN,
  delta_pt_dense: deltaDense,
  delta_pt_hybrid: deltaHybrid,
  query_count: processed,
  variance_anisotropy_ratio: Math.max(...s2arr) / Math.min(...s2arr),
  gate_pass: PASS,
  timestamp: new Date().toISOString(),
};
writeFileSync(join(RESULTS_DIR, 'results.json'), JSON.stringify(result, null, 2));
console.log(`\nResult: ${join(RESULTS_DIR, 'results.json')}`);
