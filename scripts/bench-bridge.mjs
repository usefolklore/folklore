#!/usr/bin/env node
// Cross-model embedding bridge gate.
//
// Hypothesis: a linear map W: bge → nomic lets a peer running a BGE
// embedder retrieve documents indexed under a nomic embedder, at
// ≥85% of the retrieval quality that nomic-native queries achieve
// against the same corpus. If true, wellinformed peers can federate
// across heterogeneous encoder choices — the interop claim that no
// OSS P2P memory system currently makes.
//
// Method:
//   1. Load the 5,183 SciFact corpus vectors from both cached bench
//      DBs (nomic + bge), align by doc_id.
//   2. Solve W ∈ R^{768×768} via ridge-regularized least squares:
//          minimise ‖X W − Y‖² + λ‖W‖²
//      where X = bge_corpus, Y = nomic_corpus. Closed form:
//          W = (XᵀX + λI)⁻¹ Xᵀ Y
//      Implemented as pure Float64Array Gauss-Jordan — no deps.
//   3. Embed 300 SciFact queries once in each encoder (cached to disk).
//   4. Rank on the nomic corpus:
//        - nomic_q (native ceiling)
//        - W · bge_q (bridged)
//   5. Compute NDCG@10 / R@10 / retention ratio.
//
// Gate verdict (pre-declared):
//   retention = bridged_NDCG / native_nomic_NDCG
//     ≥ 0.85 → PASS — bridge is shippable for cross-model interop
//     ≥ 0.75 → SOFT-PASS — usable with quality warning
//     < 0.75 → NULL — linear bridge insufficient, MLP needed (follow-up)
//
// Usage:
//   node scripts/bench-bridge.mjs [--lambda 0.01] [--no-cache-queries]

import { existsSync, writeFileSync, readFileSync, createReadStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

import { xenovaEmbedder } from '../dist/infrastructure/embedders.js';

const args = process.argv.slice(2);
const getArg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const has = (f) => args.includes(f);

const LAMBDA = parseFloat(getArg('--lambda', '0.01'));
const DATASET = 'scifact';
const CACHE_ROOT = join(homedir(), '.wellinformed', 'bench');
const BRIDGE_DIR = join(CACHE_ROOT, `bridge-${DATASET}`);
const NOMIC_DB = join(CACHE_ROOT, `${DATASET}__nomic-ai-nomic-embed-text-v1-5__hybrid`, 'sota.db');
const BGE_DB = join(CACHE_ROOT, `${DATASET}__xenova-bge-base-en-v1-5__hybrid`, 'sota.db');
const DATASET_DIR = join(CACHE_ROOT, DATASET, DATASET);
const QUERIES_JSONL = join(DATASET_DIR, 'queries.jsonl');
const QRELS_TSV = join(DATASET_DIR, 'qrels', 'test.tsv');
const NOMIC_Q_BIN = join(BRIDGE_DIR, 'queries-nomic-768.bin');
const BGE_Q_BIN = join(BRIDGE_DIR, 'queries-bge-768.bin');

const DIM = 768;
mkdirSync(BRIDGE_DIR, { recursive: true });

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' wellinformed — cross-model embedding bridge gate');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` Dataset:   BeIR/${DATASET} (5,183 corpus × 300 test queries)`);
console.log(` Direction: bge → nomic (ridge least-squares, λ=${LAMBDA})`);
console.log(` Dim:       ${DIM}`);
console.log('');

// ─── load cached vectors from both sota.db files ───────────────────

if (!existsSync(NOMIC_DB)) { console.error(`✗ no nomic cache at ${NOMIC_DB}`); process.exit(1); }
if (!existsSync(BGE_DB)) { console.error(`✗ no bge cache at ${BGE_DB}`); process.exit(1); }

const Better = (await import('better-sqlite3')).default;
const sqliteVec = await import('sqlite-vec');

const loadCorpus = (path, label) => {
  const db = new Better(path, { readonly: true });
  sqliteVec.load(db);
  const meta = db.prepare('SELECT rowid, doc_id, raw_text FROM doc_meta ORDER BY rowid').all();
  const vecs = db.prepare('SELECT rowid, embedding FROM vec_nodes ORDER BY rowid').all();
  db.close();
  if (meta.length !== vecs.length) throw new Error(`${label}: meta/vec mismatch`);
  const out = { byDoc: new Map(), order: [] };
  for (let i = 0; i < meta.length; i++) {
    const docId = meta[i].doc_id;
    const v = new Float64Array(DIM);
    const buf = vecs[i].embedding;
    for (let j = 0; j < DIM; j++) v[j] = buf.readFloatLE(j * 4);
    out.byDoc.set(docId, v);
    out.order.push(docId);
  }
  return out;
};

console.log('[1/5] Loading cached corpus vectors...');
const nomic = loadCorpus(NOMIC_DB, 'nomic');
const bge = loadCorpus(BGE_DB, 'bge');
console.log(`  nomic: ${nomic.order.length} vectors`);
console.log(`  bge:   ${bge.order.length} vectors`);

// Align by doc_id
const sharedIds = [];
for (const id of nomic.order) if (bge.byDoc.has(id)) sharedIds.push(id);
console.log(`  shared: ${sharedIds.length} paired doc_ids`);

const N = sharedIds.length;
const X = new Float64Array(N * DIM); // bge
const Y = new Float64Array(N * DIM); // nomic
for (let i = 0; i < N; i++) {
  const id = sharedIds[i];
  const b = bge.byDoc.get(id);
  const n = nomic.byDoc.get(id);
  for (let j = 0; j < DIM; j++) {
    X[i * DIM + j] = b[j];
    Y[i * DIM + j] = n[j];
  }
}

// ─── solve W via ridge least squares ──────────────────────────────
// W = (XᵀX + λI)⁻¹ XᵀY

console.log(`[2/5] Solving W = (XᵀX + ${LAMBDA}I)⁻¹ XᵀY  (N=${N}, D=${DIM})...`);

const t2 = Date.now();

// XᵀX : D × D
const XtX = new Float64Array(DIM * DIM);
for (let i = 0; i < N; i++) {
  const row = i * DIM;
  for (let a = 0; a < DIM; a++) {
    const va = X[row + a];
    if (va === 0) continue;
    const aDim = a * DIM;
    for (let b = 0; b < DIM; b++) {
      XtX[aDim + b] += va * X[row + b];
    }
  }
}
// add λI
for (let i = 0; i < DIM; i++) XtX[i * DIM + i] += LAMBDA;

// XᵀY : D × D
const XtY = new Float64Array(DIM * DIM);
for (let i = 0; i < N; i++) {
  const row = i * DIM;
  for (let a = 0; a < DIM; a++) {
    const va = X[row + a];
    if (va === 0) continue;
    const aDim = a * DIM;
    for (let b = 0; b < DIM; b++) {
      XtY[aDim + b] += va * Y[row + b];
    }
  }
}

// Solve (XᵀX) W = XᵀY via Gauss-Jordan elimination (stored row-major)
// In-place: mutate XtX to identity, XtY becomes W.
const solveInPlace = (A, B, n) => {
  // A is n×n, B is n×n. At end, A = I and B = A⁻¹ · B.
  for (let i = 0; i < n; i++) {
    // Partial pivoting: find the row with largest |A[k,i]| for k >= i
    let maxRow = i;
    let maxVal = Math.abs(A[i * n + i]);
    for (let k = i + 1; k < n; k++) {
      const v = Math.abs(A[k * n + i]);
      if (v > maxVal) { maxVal = v; maxRow = k; }
    }
    if (maxVal < 1e-12) throw new Error(`singular matrix at column ${i}`);
    if (maxRow !== i) {
      const aRow = i * n, bRow = maxRow * n;
      for (let j = 0; j < n; j++) {
        let t = A[aRow + j]; A[aRow + j] = A[bRow + j]; A[bRow + j] = t;
        t = B[aRow + j]; B[aRow + j] = B[bRow + j]; B[bRow + j] = t;
      }
    }
    // Normalize pivot row
    const pivot = A[i * n + i];
    const iRow = i * n;
    for (let j = 0; j < n; j++) { A[iRow + j] /= pivot; B[iRow + j] /= pivot; }
    // Eliminate other rows
    for (let k = 0; k < n; k++) {
      if (k === i) continue;
      const factor = A[k * n + i];
      if (factor === 0) continue;
      const kRow = k * n;
      for (let j = 0; j < n; j++) {
        A[kRow + j] -= factor * A[iRow + j];
        B[kRow + j] -= factor * B[iRow + j];
      }
    }
    if ((i + 1) % 64 === 0 || i === n - 1) {
      process.stdout.write(`\r  elimination ${i + 1}/${n}   `);
    }
  }
};

solveInPlace(XtX, XtY, DIM);
process.stdout.write('\n');
console.log(`  solved in ${((Date.now() - t2) / 1000).toFixed(1)}s`);

const W = XtY; // now W: R^{DIM×DIM}, rows are bge_index, cols are nomic_index

// Report training reconstruction error
let trainErr = 0;
for (let i = 0; i < Math.min(N, 500); i++) {
  const row = i * DIM;
  for (let c = 0; c < DIM; c++) {
    let pred = 0;
    for (let r = 0; r < DIM; r++) pred += X[row + r] * W[r * DIM + c];
    const diff = pred - Y[row + c];
    trainErr += diff * diff;
  }
}
console.log(`  train reconstruction MSE (first 500 docs): ${(trainErr / 500 / DIM).toExponential(3)}`);

// ─── load qrels + queries ─────────────────────────────────────────

console.log('[3/5] Loading queries + qrels...');
const loadJsonl = async (path) => {
  const lines = [];
  const rl = createInterface({ input: createReadStream(path) });
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

// ─── embed queries via both encoders (cached) ─────────────────────

const writeMat = (path, rows) => {
  const n = rows.length, d = rows[0].length;
  const buf = Buffer.alloc(8 + n * d * 4);
  buf.writeUInt32LE(n, 0); buf.writeUInt32LE(d, 4);
  for (let i = 0; i < n; i++) for (let j = 0; j < d; j++) buf.writeFloatLE(rows[i][j], 8 + (i * d + j) * 4);
  writeFileSync(path, buf);
};
const readMat = (path) => {
  const buf = readFileSync(path);
  const n = buf.readUInt32LE(0), d = buf.readUInt32LE(4);
  const rows = new Array(n);
  for (let i = 0; i < n; i++) {
    const r = new Float64Array(d);
    for (let j = 0; j < d; j++) r[j] = buf.readFloatLE(8 + (i * d + j) * 4);
    rows[i] = r;
  }
  return rows;
};

const embedQueries = async (embedder, prefix, texts) => {
  const out = new Array(texts.length);
  const BATCH = 32;
  const t0 = Date.now();
  for (let i = 0; i < texts.length; i += BATCH) {
    const slice = texts.slice(i, i + BATCH).map((t) => prefix + t);
    const r = await embedder.embedBatch(slice);
    if (r.isErr()) throw new Error(`embed: ${JSON.stringify(r.error)}`);
    for (let j = 0; j < slice.length; j++) {
      const v = new Float64Array(DIM);
      for (let k = 0; k < DIM; k++) v[k] = r.value[j][k];
      out[i + j] = v;
    }
    process.stdout.write(`\r  embedded ${i + slice.length}/${texts.length} in ${((Date.now() - t0) / 1000).toFixed(1)}s   `);
  }
  process.stdout.write('\n');
  return out;
};

const NO_CACHE = has('--no-cache-queries');

let nomicQ, bgeQ;
if (!NO_CACHE && existsSync(NOMIC_Q_BIN)) {
  console.log('[4/5] Loading cached nomic queries...');
  nomicQ = readMat(NOMIC_Q_BIN);
} else {
  console.log('[4/5] Embedding nomic queries...');
  const e = xenovaEmbedder({ model: 'nomic-ai/nomic-embed-text-v1.5', dim: DIM, maxLength: 8192, pooling: 'mean' });
  nomicQ = await embedQueries(e, 'search_query: ', queries.map((q) => q.text));
  writeMat(NOMIC_Q_BIN, nomicQ);
}

if (!NO_CACHE && existsSync(BGE_Q_BIN)) {
  console.log('  Loading cached bge queries...');
  bgeQ = readMat(BGE_Q_BIN);
} else {
  console.log('  Embedding bge queries...');
  const e = xenovaEmbedder({ model: 'Xenova/bge-base-en-v1.5', dim: DIM, maxLength: 512, pooling: 'cls' });
  bgeQ = await embedQueries(e, '', queries.map((q) => q.text));
  writeMat(BGE_Q_BIN, bgeQ);
}

// ─── eval: native nomic vs bridged bge→nomic vs native bge (bge corpus) ──

console.log('[5/5] Scoring...');

const applyW = (v) => {
  // bridged = v @ W (v is 1×D, W is D×D, result is 1×D)
  const out = new Float64Array(DIM);
  for (let c = 0; c < DIM; c++) {
    let s = 0;
    for (let r = 0; r < DIM; r++) s += v[r] * W[r * DIM + c];
    out[c] = s;
  }
  // L2 normalize (nomic corpus is normalized, so bridged query must be too for cosine = dot)
  let sumsq = 0;
  for (let i = 0; i < DIM; i++) sumsq += out[i] * out[i];
  const norm = Math.sqrt(sumsq) || 1;
  for (let i = 0; i < DIM; i++) out[i] /= norm;
  return out;
};

const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

const corpusIds = nomic.order;
const nomicCorpus = corpusIds.map((id) => nomic.byDoc.get(id));
const bgeCorpus = corpusIds.map((id) => bge.byDoc.get(id));

const log2 = (x) => Math.log(x) / Math.LN2;
const ndcgK = (ranked, rel, k) => {
  let dcg = 0;
  const topK = ranked.slice(0, k);
  for (let i = 0; i < topK.length; i++) {
    const r = rel.get(topK[i].docId) ?? 0;
    dcg += r / log2(i + 2);
  }
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

const scoreRun = (queryVecs, corpusVecs, label) => {
  const m = { ndcg10: [], r10: [] };
  for (let qi = 0; qi < queries.length; qi++) {
    const qv = queryVecs[qi];
    const scored = new Array(corpusVecs.length);
    for (let ci = 0; ci < corpusVecs.length; ci++) {
      scored[ci] = { docId: corpusIds[ci], score: dot(qv, corpusVecs[ci]) };
    }
    scored.sort((a, b) => b.score - a.score);
    const rel = qrels.get(queries[qi].id) ?? new Map();
    m.ndcg10.push(ndcgK(scored, rel, 10));
    m.r10.push(recallK(scored, rel, 10));
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return { label, ndcg10: mean(m.ndcg10), r10: mean(m.r10) };
};

const nativeNomic = scoreRun(nomicQ, nomicCorpus, 'native nomic');
const nativeBge = scoreRun(bgeQ, bgeCorpus, 'native bge (defective Xenova port)');
const bridgedBgeNomic = scoreRun(bgeQ.map(applyW), nomicCorpus, 'bridged bge → nomic');

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' Bridge gate results');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' config                              NDCG@10    R@10      retention');
const fmtPct = (p) => (p * 100).toFixed(2) + '%';
const rows = [
  { ...nativeNomic, retention: 1.0, anchor: true },
  { ...bridgedBgeNomic, retention: bridgedBgeNomic.ndcg10 / nativeNomic.ndcg10 },
  { ...nativeBge, retention: nativeBge.ndcg10 / nativeNomic.ndcg10 },
];
for (const r of rows) {
  const ret = r.anchor ? '(anchor)' : `${(r.retention * 100).toFixed(1)}% of native nomic`;
  console.log(`  ${r.label.padEnd(36)} ${fmtPct(r.ndcg10).padStart(7)}    ${fmtPct(r.r10).padStart(7)}    ${ret}`);
}

const ret = bridgedBgeNomic.ndcg10 / nativeNomic.ndcg10;
console.log('');
if (ret >= 0.85) {
  console.log(`✓ PASS — bridged retention ${(ret * 100).toFixed(1)}% ≥ 85% gate`);
  console.log('  → Linear W works for cross-model federated retrieval.');
  console.log('  → Ship as v3 interop primitive.');
} else if (ret >= 0.75) {
  console.log(`~ SOFT-PASS — bridged retention ${(ret * 100).toFixed(1)}% between 75% and 85%`);
  console.log('  → Usable with quality warning; consider MLP bridge as follow-up.');
} else {
  console.log(`✗ NULL — bridged retention ${(ret * 100).toFixed(1)}% below 75% floor`);
  console.log('  → Linear W insufficient. Options: (a) use bge through Rust port to rule out');
  console.log('     Xenova-port-defect confound, (b) small MLP bridge instead of linear,');
  console.log('     (c) accept cross-model federation requires re-embed on receive.');
}
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const out = {
  timestamp: new Date().toISOString(),
  dataset: `BeIR/${DATASET}`,
  lambda: LAMBDA,
  dim: DIM,
  n_paired: N,
  query_count: queries.length,
  results: {
    native_nomic: nativeNomic,
    bridged_bge_to_nomic: bridgedBgeNomic,
    native_bge: nativeBge,
  },
  retention: ret,
  verdict: ret >= 0.85 ? 'PASS' : ret >= 0.75 ? 'SOFT_PASS' : 'NULL',
};
writeFileSync(join(BRIDGE_DIR, 'results.json'), JSON.stringify(out, null, 2));
console.log(`\nResult JSON: ${join(BRIDGE_DIR, 'results.json')}`);
