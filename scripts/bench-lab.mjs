#!/usr/bin/env node
// Retrieval lab — sweep multiple levers over ALREADY-CACHED Xenova-nomic
// corpus vectors across multiple BEIR datasets in a single invocation.
//
// Levers tested:
//   1. Matryoshka truncation dims: 768, 512, 384, 256, 192, 128, 96, 64
//   2. Quantization: fp32 / int8 / binary (sign-bit, Hamming rank)
//   3. Dense vs hybrid (dense-truncated + BM25 RRF)
//   4. Combined Matryoshka × binary — the P2P sync lever (bytes-per-vec)
//
// Inputs: existing bench sota.db files under ~/.wellinformed/bench/, which
// already contain vec0-stored Xenova-nomic 768-dim corpus vectors plus the
// FTS5 BM25 index. We only re-embed the queries (~10s/dataset).
//
// Outputs: per-dataset NDCG@10 / R@10 / latency / bytes-per-vec matrix +
// Pareto-frontier summary.
//
// Usage:
//   node scripts/bench-lab.mjs [--datasets scifact,arguana,fiqa,scidocs]
//     [--dims 768,512,384,256,192,128,96,64] [--hybrid] [--binary] [--int8]
//     [--top-k 100]

import { existsSync, writeFileSync, readFileSync, createReadStream, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';

import { xenovaEmbedder } from '../dist/infrastructure/embedders.js';

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const getArg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };

const DATASETS = getArg('--datasets', 'scifact,arguana,fiqa,scidocs').split(',').map((s) => s.trim());
const DIMS = getArg('--dims', '768,512,384,256,192,128,96,64').split(',').map((s) => parseInt(s, 10));
const DO_BINARY = !has('--no-binary');
const DO_INT8 = !has('--no-int8');
const DO_HYBRID = !has('--no-hybrid');
const TOP_K = parseInt(getArg('--top-k', '100'), 10);
const MODEL = 'nomic-ai/nomic-embed-text-v1.5';
const FULL_DIM = 768;

const CACHE_ROOT = join(homedir(), '.wellinformed', 'bench');
const LAB_OUT_DIR = join(CACHE_ROOT, 'lab');
mkdirSync(LAB_OUT_DIR, { recursive: true });

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' wellinformed — retrieval lab');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` Datasets:  ${DATASETS.join(', ')}`);
console.log(` Dims:      ${DIMS.join(', ')}`);
console.log(` Quant:     fp32${DO_INT8 ? ' + int8' : ''}${DO_BINARY ? ' + binary' : ''}`);
console.log(` Hybrid:    ${DO_HYBRID ? 'yes (dense + BM25 RRF)' : 'no'}`);
console.log(` top-k:     ${TOP_K}`);
console.log('');

const Better = (await import('better-sqlite3')).default;
const sqliteVec = await import('sqlite-vec');

// ─── helpers ──────────────────────────────────────────────────────────

const loadJsonl = async (path) => {
  const lines = [];
  const rl = createInterface({ input: createReadStream(path) });
  for await (const line of rl) if (line.trim()) lines.push(JSON.parse(line));
  return lines;
};

const bufToFloat32 = (buf, dim) => {
  const out = new Float32Array(dim);
  for (let i = 0; i < dim; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
};

const LN_EPS = 1e-5;
const applyLN = (v) => {
  const n = v.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += v[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) { const d = v[i] - mean; variance += d * d; }
  variance /= n;
  const denom = Math.sqrt(variance + LN_EPS);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (v[i] - mean) / denom;
  return out;
};

const l2Norm = (v) => {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const norm = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
};

/** Nomic-MRL truncation: LN → slice → L2. */
const truncFp32 = (v, D) => {
  const ln = applyLN(v);
  if (D >= v.length) return l2Norm(ln);
  const s = new Float32Array(D);
  for (let i = 0; i < D; i++) s[i] = ln[i];
  return l2Norm(s);
};

/** Binary quantize (sign bit). Output = Uint8Array of ceil(D/8) bytes. */
const binarize = (v) => {
  const D = v.length;
  const bytes = (D + 7) >> 3;
  const out = new Uint8Array(bytes);
  for (let i = 0; i < D; i++) {
    if (v[i] > 0) out[i >> 3] |= 1 << (i & 7);
  }
  return out;
};

/** Int8 quantize — symmetric, per-vector scale. Keeps unit-norm cosine meaningful. */
const int8ize = (v) => {
  const D = v.length;
  let max = 1e-9;
  for (let i = 0; i < D; i++) { const a = Math.abs(v[i]); if (a > max) max = a; }
  const scale = 127 / max;
  const out = new Int8Array(D);
  for (let i = 0; i < D; i++) out[i] = Math.max(-127, Math.min(127, Math.round(v[i] * scale)));
  return out;
};

/** Cosine via dot — both inputs unit-normalized. */
const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/** Int8 dot with integer accumulator (closer-to-int8-kernel semantics). */
const dotI8 = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/** Hamming popcount — higher = more similar after flipping to 1-hamming for ranking. */
const POPCOUNT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let x = i, c = 0; while (x) { c += x & 1; x >>= 1; } POPCOUNT[i] = c;
}
const hammingDist = (a, b) => {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += POPCOUNT[a[i] ^ b[i]];
  return d;
};

// ─── metrics ──────────────────────────────────────────────────────────

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
const mrrOne = (ranked, rel) => {
  for (let i = 0; i < ranked.length; i++) if (rel.has(ranked[i].docId)) return 1 / (i + 1);
  return 0;
};

// ─── RRF fusion (for hybrid sweep) ─────────────────────────────────────

const RRF_K = 60;
const LUCENE_STOPWORDS = new Set([
  'a','an','and','are','as','at','be','but','by','for','if','in','into','is','it','no','not','of','on','or',
  'such','that','the','their','then','there','these','they','this','to','was','will','with',
]);
const sanitizeForFts5 = (q) => {
  const toks = (q.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((t) => t.length > 1 && !LUCENE_STOPWORDS.has(t));
  return toks.join(' OR ');
};

const rrfFuse = (dense, bm25) => {
  const byId = new Map();
  dense.forEach((c, i) => byId.set(c.docId, { docId: c.docId, dR: i, sR: null }));
  bm25.forEach((c, i) => {
    const ex = byId.get(c.docId);
    if (ex) ex.sR = i;
    else byId.set(c.docId, { docId: c.docId, dR: null, sR: i });
  });
  const scored = [];
  for (const c of byId.values()) {
    let s = 0;
    if (c.dR !== null) s += 1 / (RRF_K + c.dR + 1);
    if (c.sR !== null) s += 1 / (RRF_K + c.sR + 1);
    scored.push({ docId: c.docId, score: s });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
};

// ─── main per-dataset routine ──────────────────────────────────────────

const datasetResults = {};

for (const ds of DATASETS) {
  const SOTA_DB = join(CACHE_ROOT, `${ds}__nomic-ai-nomic-embed-text-v1-5__hybrid`, 'sota.db');
  const DS_DIR = join(CACHE_ROOT, ds, ds);
  const QRELS = join(DS_DIR, 'qrels', 'test.tsv');
  const QUERIES = join(DS_DIR, 'queries.jsonl');

  console.log(`━━━ ${ds.toUpperCase()} ━━━`);
  if (!existsSync(SOTA_DB)) { console.log(`  ✗ no cached sota.db — skipping`); continue; }

  // 1. Load qrels
  const qrels = new Map();
  const lines = readFileSync(QRELS, 'utf8').split('\n').slice(1);
  for (const line of lines) {
    const [qid, docId, scoreStr] = line.split('\t');
    if (!qid || !scoreStr) continue;
    const sc = parseInt(scoreStr, 10);
    if (sc > 0) {
      if (!qrels.has(qid)) qrels.set(qid, new Map());
      qrels.get(qid).set(docId, sc);
    }
  }
  const testQids = new Set(qrels.keys());

  // 2. Load queries from BEIR jsonl, filter to test split
  const queriesRaw = await loadJsonl(QUERIES);
  const queries = queriesRaw
    .filter((q) => testQids.has(String(q._id)))
    .map((q) => ({ id: String(q._id), rawText: q.text, embedText: 'search_query: ' + q.text }));

  // 3. Open the cached sota.db and extract corpus vectors + doc_ids + raw_text
  const db = new Better(SOTA_DB, { readonly: true });
  sqliteVec.load(db);

  const metaRows = db.prepare('SELECT rowid, doc_id, raw_text FROM doc_meta ORDER BY rowid').all();
  const vecRows = db.prepare('SELECT rowid, embedding FROM vec_nodes ORDER BY rowid').all();

  if (metaRows.length !== vecRows.length) {
    console.log(`  ✗ meta/vec row mismatch: ${metaRows.length} vs ${vecRows.length} — skipping`);
    db.close();
    continue;
  }

  const corpusVecs = new Array(metaRows.length);
  const corpusIds = new Array(metaRows.length);
  for (let i = 0; i < metaRows.length; i++) {
    corpusVecs[i] = bufToFloat32(vecRows[i].embedding, FULL_DIM);
    corpusIds[i] = metaRows[i].doc_id;
  }

  console.log(`  corpus:  ${metaRows.length.toLocaleString()} vectors loaded from cache`);
  console.log(`  queries: ${queries.length.toLocaleString()}`);

  // 4. Embed queries fresh
  const embedder = xenovaEmbedder({ model: MODEL, dim: FULL_DIM, maxLength: 8192, pooling: 'mean' });
  const queryVecs = new Array(queries.length);
  const BATCH = 32;
  const qt0 = Date.now();
  for (let i = 0; i < queries.length; i += BATCH) {
    const slice = queries.slice(i, i + BATCH);
    const r = await embedder.embedBatch(slice.map((q) => q.embedText));
    if (r.isErr()) { console.log(`  query embed failed: ${r.error}`); break; }
    for (let j = 0; j < slice.length; j++) queryVecs[i + j] = r.value[j];
  }
  console.log(`  queries embedded in ${((Date.now() - qt0) / 1000).toFixed(1)}s`);

  // 5. Pre-run BM25 once per query (independent of dense config) for hybrid sweep
  const bm25Stmt = db.prepare(
    'SELECT rowid, bm25(fts_docs, 0.9, 0.4) AS r FROM fts_docs WHERE fts_docs MATCH ? ORDER BY r LIMIT ?'
  );
  const rowidToDocId = new Map();
  for (const row of metaRows) rowidToDocId.set(row.rowid, row.doc_id);

  const bm25PerQuery = queries.map((q) => {
    try {
      const fq = sanitizeForFts5(q.rawText);
      if (!fq) return [];
      const rows = bm25Stmt.all(fq, TOP_K);
      return rows.map((r, i) => ({ docId: rowidToDocId.get(r.rowid), rank: i }));
    } catch { return []; }
  });
  db.close();

  // 6. Run sweep: {dim} × {quant} × {dense, hybrid}
  const configs = [];
  for (const D of DIMS) {
    configs.push({ dim: D, quant: 'fp32' });
    if (DO_INT8) configs.push({ dim: D, quant: 'int8' });
    if (DO_BINARY) configs.push({ dim: D, quant: 'binary' });
  }

  const results = [];

  for (const cfg of configs) {
    const { dim: D, quant } = cfg;

    // Prepare truncated corpus + queries per quantization regime
    const qPrep = quant === 'binary'
      ? (v) => binarize(truncFp32(v, D))
      : quant === 'int8'
      ? (v) => int8ize(truncFp32(v, D))
      : (v) => truncFp32(v, D);

    const cPrepT = Date.now();
    const truncCorpus = corpusVecs.map(qPrep);
    const truncQueries = queryVecs.map(qPrep);
    const prepMs = Date.now() - cPrepT;

    const bytesPerVec = quant === 'binary' ? Math.ceil(D / 8)
                      : quant === 'int8' ? D
                      : D * 4;

    const latenciesDense = [];
    const latenciesHybrid = [];
    const mDense = { ndcg10: [], r10: [] };
    const mHybrid = { ndcg10: [], r10: [] };

    for (let qi = 0; qi < queries.length; qi++) {
      const qv = truncQueries[qi];
      const q = queries[qi];
      const rel = qrels.get(q.id) ?? new Map();

      // Dense stage
      const t0 = Date.now();
      const scored = new Array(truncCorpus.length);
      if (quant === 'binary') {
        for (let ci = 0; ci < truncCorpus.length; ci++) {
          scored[ci] = { docId: corpusIds[ci], score: -hammingDist(qv, truncCorpus[ci]) };
        }
      } else if (quant === 'int8') {
        for (let ci = 0; ci < truncCorpus.length; ci++) {
          scored[ci] = { docId: corpusIds[ci], score: dotI8(qv, truncCorpus[ci]) };
        }
      } else {
        for (let ci = 0; ci < truncCorpus.length; ci++) {
          scored[ci] = { docId: corpusIds[ci], score: dot(qv, truncCorpus[ci]) };
        }
      }
      scored.sort((a, b) => b.score - a.score);
      const denseTop = scored.slice(0, TOP_K);
      latenciesDense.push(Date.now() - t0);
      mDense.ndcg10.push(ndcgK(denseTop, rel, 10));
      mDense.r10.push(recallK(denseTop, rel, 10));

      // Hybrid stage (dense-truncated + cached BM25 via RRF)
      if (DO_HYBRID) {
        const th0 = Date.now();
        const fused = rrfFuse(denseTop, bm25PerQuery[qi]);
        latenciesHybrid.push(Date.now() - th0 + latenciesDense[latenciesDense.length - 1]);
        mHybrid.ndcg10.push(ndcgK(fused, rel, 10));
        mHybrid.r10.push(recallK(fused, rel, 10));
      }
    }

    const mean = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    const pctl = (xs, p) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length * p)] ?? 0; };

    results.push({
      dim: D,
      quant,
      bytes_per_vec: bytesPerVec,
      prep_ms: prepMs,
      dense: {
        ndcg10: mean(mDense.ndcg10),
        r10: mean(mDense.r10),
        p50: pctl(latenciesDense, 0.5),
        p95: pctl(latenciesDense, 0.95),
      },
      hybrid: DO_HYBRID ? {
        ndcg10: mean(mHybrid.ndcg10),
        r10: mean(mHybrid.r10),
        p50: pctl(latenciesHybrid, 0.5),
        p95: pctl(latenciesHybrid, 0.95),
      } : null,
    });
  }

  datasetResults[ds] = { corpus_size: corpusIds.length, query_count: queries.length, results };

  // Print per-dataset table
  console.log('  ┌────┬──────┬───────┬────────┬──────────┬───────┬───────┬──────────┬───────┐');
  console.log('  │ D  │ Q    │ bytes │ dense  │  Δ-vs-fp32-768 │ hybrid│ Δ     │ p50ms    │ sh@-2 │');
  console.log('  ├────┼──────┼───────┼────────┼──────────┼───────┼───────┼──────────┼───────┤');
  const base = results.find((r) => r.dim === FULL_DIM && r.quant === 'fp32');
  const baseNdcg = base.dense.ndcg10;
  for (const r of results) {
    const dDense = (r.dense.ndcg10 - baseNdcg) * 100;
    const dHyb = r.hybrid ? (r.hybrid.ndcg10 - baseNdcg) * 100 : 0;
    const ship = dDense >= -2 ? '✓' : ' ';
    console.log(
      `  │${String(r.dim).padStart(3)} │ ${r.quant.padEnd(4)} │ ${String(r.bytes_per_vec).padStart(5)} │ ` +
      `${(r.dense.ndcg10 * 100).toFixed(2).padStart(5)}% │ ` +
      `${(dDense >= 0 ? '+' : '') + dDense.toFixed(2).padStart(5)}pt  │ ` +
      `${r.hybrid ? (r.hybrid.ndcg10 * 100).toFixed(2).padStart(5) + '%' : ' n/a  '} │ ` +
      `${r.hybrid ? (dHyb >= 0 ? '+' : '') + dHyb.toFixed(2).padStart(5) + 'pt' : '  n/a'} │ ` +
      `${String(r.dense.p50).padStart(4)}/${String(r.hybrid ? r.hybrid.p50 : 0).padStart(3)}ms│ ${ship.padStart(3)}   │`
    );
  }
  console.log('  └────┴──────┴───────┴────────┴──────────┴───────┴───────┴──────────┴───────┘');
  console.log('');
}

// ─── Pareto frontier ───────────────────────────────────────────────────

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' Pareto frontier — quality vs bytes-per-vec (dense only)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Per dataset, compute Pareto frontier of (bytes_per_vec, ndcg10)
for (const ds of DATASETS) {
  if (!datasetResults[ds]) continue;
  const { results } = datasetResults[ds];
  // Sort by bytes asc; keep configs where no smaller-bytes config has ≥ ndcg
  const sorted = [...results].sort((a, b) => a.bytes_per_vec - b.bytes_per_vec);
  let bestSoFar = -Infinity;
  const frontier = [];
  // Iterate from smallest to largest — Pareto-optimal means no smaller-bytes config beats it
  // Canonical: iterate bytes ascending, keep any config whose ndcg > max-so-far-of-smaller-bytes
  // This identifies configs where bytes are small AND quality has monotonically improved.
  for (const r of sorted) {
    if (r.dense.ndcg10 > bestSoFar) {
      frontier.push(r);
      bestSoFar = r.dense.ndcg10;
    }
  }
  console.log(`\n  ${ds.toUpperCase()} — corpus=${datasetResults[ds].corpus_size}`);
  console.log('   bytes/vec   dim  quant    NDCG@10    R@10      vs-fp32-768');
  const base = results.find((r) => r.dim === FULL_DIM && r.quant === 'fp32');
  for (const r of frontier) {
    const d = (r.dense.ndcg10 - base.dense.ndcg10) * 100;
    console.log(
      `   ${String(r.bytes_per_vec).padStart(5)}       ${String(r.dim).padStart(3)}  ${r.quant.padEnd(6)}  ` +
      `${(r.dense.ndcg10 * 100).toFixed(2).padStart(5)}%    ` +
      `${(r.dense.r10 * 100).toFixed(2).padStart(5)}%     ${d >= 0 ? '+' : ''}${d.toFixed(2)}pt`
    );
  }
}

// ─── "Shippable at -2pt" summary across datasets ────────────────────────

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' Shippable configs (all datasets within −2pt NDCG@10 of fp32-768)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Build a matrix: for each (dim, quant), check if all tested datasets pass
const allConfigs = new Set();
for (const ds of DATASETS) {
  if (!datasetResults[ds]) continue;
  for (const r of datasetResults[ds].results) allConfigs.add(`${r.dim}__${r.quant}`);
}

const shippable = [];
for (const key of allConfigs) {
  const [dimStr, quant] = key.split('__');
  const dim = parseInt(dimStr, 10);
  if (dim === FULL_DIM && quant === 'fp32') continue;

  let allPass = true;
  let worstDelta = Infinity;
  for (const ds of DATASETS) {
    if (!datasetResults[ds]) continue;
    const base = datasetResults[ds].results.find((r) => r.dim === FULL_DIM && r.quant === 'fp32');
    const cfg = datasetResults[ds].results.find((r) => r.dim === dim && r.quant === quant);
    if (!base || !cfg) { allPass = false; break; }
    const delta = (cfg.dense.ndcg10 - base.dense.ndcg10) * 100;
    if (delta < worstDelta) worstDelta = delta;
    if (delta < -2) allPass = false;
  }
  const bytes = quant === 'binary' ? Math.ceil(dim / 8) : quant === 'int8' ? dim : dim * 4;
  shippable.push({ dim, quant, bytes, worst_delta: worstDelta, all_pass: allPass });
}

shippable.sort((a, b) => a.bytes - b.bytes);
console.log('  bytes/vec   dim  quant    worst Δ  all-pass');
for (const r of shippable) {
  const flag = r.all_pass ? '✓ ship' : '  null';
  console.log(`   ${String(r.bytes).padStart(5)}       ${String(r.dim).padStart(3)}  ${r.quant.padEnd(6)}  ${r.worst_delta.toFixed(2).padStart(6)}pt  ${flag}`);
}

// ─── persist JSON ────────────────────────────────────────────────────────

const out = {
  timestamp: new Date().toISOString(),
  model: MODEL,
  full_dim: FULL_DIM,
  datasets: DATASETS,
  dims: DIMS,
  quantizations: ['fp32', ...(DO_INT8 ? ['int8'] : []), ...(DO_BINARY ? ['binary'] : [])],
  hybrid: DO_HYBRID,
  results: datasetResults,
  shippable,
};
const outPath = join(LAB_OUT_DIR, `results-${Date.now()}.json`);
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`\nResult JSON: ${outPath}`);
