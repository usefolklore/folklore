#!/usr/bin/env node
// Matryoshka truncation gate — measure NDCG@10/R@10/latency on BEIR vs
// dimension N ∈ {768, 512, 256, 128, 64} for nomic-embed-text-v1.5.
//
// Research reference:
//   - Kusupati et al. "Matryoshka Representation Learning", NeurIPS 2022
//     (arXiv:2205.13147)
//   - Nomic blog: nomic-embed-text-v1.5 is MRL-trained; published
//     retention 768→512 ≈ zero loss, 768→128 ≥95% of retrieval quality.
//
// Procedure (Nomic + sbert canonical):
//   1. Produce full-D L2-normalized embedding via the existing pipeline.
//   2. Slice first N dimensions.
//   3. L2-renormalize.
//   4. Score via cosine similarity against the truncated corpus matrix.
//
// Gate verdict (pre-declared):
//   PASS at dim D iff NDCG@10(D) within the following tolerances vs
//   NDCG@10(768):
//     D=512 → within -0.5 pts
//     D=256 → within -1.5 pts
//     D=128 → within -3.0 pts
//     D=64  → within -6.0 pts (sanity only — expected degraded)
//   A PASS at D=256 is the shippable outcome (3× cosine speedup, 3×
//   smaller vectors.db). Anything weaker than D=512 is a null result.
//
// Usage:
//   node scripts/bench-matryoshka.mjs [dataset] [--dims 768,512,256,128,64]
//     [--model nomic-ai/nomic-embed-text-v1.5] [--batch 32] [--no-cache]
//
// Re-runs against the same dataset reuse the cached full-D embeddings.
// Only the corpus is embedded once; queries are re-embedded unless
// their cache file exists.

import { existsSync, mkdirSync, createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';

import { xenovaEmbedder } from '../dist/infrastructure/embedders.js';

// ─── arg parsing ─────────────────────────────────────────────────

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : def;
};

const DATASET = args.find((a) => !a.startsWith('--') && !/^\d/.test(a)) ?? 'scifact';
const MODEL = getArg('--model', 'nomic-ai/nomic-embed-text-v1.5');
const FULL_DIM = parseInt(getArg('--full-dim', '768'), 10);
const DIMS = getArg('--dims', '768,512,256,128,64')
  .split(',')
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => n > 0 && n <= FULL_DIM);
const BATCH_SIZE = parseInt(getArg('--batch', '32'), 10);
const NO_CACHE = has('--no-cache');
const DOC_PREFIX = getArg('--doc-prefix', 'search_document: ');
const QUERY_PREFIX = getArg('--query-prefix', 'search_query: ');

const CACHE_ROOT = join(homedir(), '.wellinformed', 'bench');
const DATASET_DIR = join(CACHE_ROOT, DATASET);
const MODEL_SLUG = MODEL.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
const MRL_CACHE_DIR = join(CACHE_ROOT, `matryoshka-${DATASET}-${MODEL_SLUG}`);
const CORPUS_VEC_BIN = join(MRL_CACHE_DIR, `corpus-${FULL_DIM}.bin`);
const QUERY_VEC_BIN = join(MRL_CACHE_DIR, `queries-${FULL_DIM}.bin`);
const CORPUS_JSONL = join(DATASET_DIR, DATASET, 'corpus.jsonl');
const QUERIES_JSONL = join(DATASET_DIR, DATASET, 'queries.jsonl');
const QRELS_TSV = join(DATASET_DIR, DATASET, 'qrels', 'test.tsv');
const DATASET_URL = `https://public.ukp.informatik.tu-darmstadt.de/thakur/BEIR/datasets/${DATASET}.zip`;

mkdirSync(MRL_CACHE_DIR, { recursive: true });
mkdirSync(DATASET_DIR, { recursive: true });

// ─── banner ──────────────────────────────────────────────────────

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` wellinformed — Matryoshka truncation gate`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` Dataset:   BeIR/${DATASET} (BEIR v1, test split)`);
console.log(` Model:     ${MODEL} (${FULL_DIM} dim full)`);
console.log(` Dims:      ${DIMS.join(', ')}`);
console.log(` Cache:     ${MRL_CACHE_DIR}`);
console.log('');

// ─── step 1: dataset ─────────────────────────────────────────────

if (!existsSync(CORPUS_JSONL)) {
  console.log(`[1/5] Downloading ${DATASET}.zip...`);
  const zipPath = join(DATASET_DIR, `${DATASET}.zip`);
  if (spawnSync('curl', ['-fsSL', '-o', zipPath, DATASET_URL], { stdio: 'inherit' }).status !== 0) {
    console.error('download failed');
    process.exit(1);
  }
  if (spawnSync('unzip', ['-oq', zipPath, '-d', DATASET_DIR], { stdio: 'inherit' }).status !== 0) {
    console.error('unzip failed');
    process.exit(1);
  }
} else {
  console.log('[1/5] Dataset cached');
}

// ─── step 2: load corpus/queries/qrels ───────────────────────────

console.log('[2/5] Loading corpus, queries, qrels...');

const loadJsonl = async (path) => {
  const lines = [];
  const rl = createInterface({ input: createReadStream(path) });
  for await (const line of rl) if (line.trim()) lines.push(JSON.parse(line));
  return lines;
};

const corpusRaw = await loadJsonl(CORPUS_JSONL);
const corpus = corpusRaw.map((r) => ({
  id: String(r._id),
  rawText: (r.title ? r.title + '. ' : '') + (r.text ?? ''),
  embedText: DOC_PREFIX + ((r.title ? r.title + '. ' : '') + (r.text ?? '')),
}));

const queriesRaw = await loadJsonl(QUERIES_JSONL);
const qrelsText = readFileSync(QRELS_TSV, 'utf8');
const qrels = new Map();
for (const line of qrelsText.split('\n').slice(1)) {
  const parts = line.split('\t');
  if (parts.length < 3) continue;
  const [qid, docId, score] = parts;
  if (parseInt(score, 10) > 0) {
    if (!qrels.has(qid)) qrels.set(qid, new Map());
    qrels.get(qid).set(docId, parseInt(score, 10));
  }
}
const testQids = new Set(qrels.keys());
const queries = queriesRaw
  .filter((q) => testQids.has(String(q._id)))
  .map((q) => ({
    id: String(q._id),
    rawText: q.text,
    embedText: QUERY_PREFIX + q.text,
  }));

console.log(`  corpus:  ${corpus.length.toLocaleString()} passages`);
console.log(`  queries: ${queries.length.toLocaleString()} (test split)`);

// ─── step 3: embed at full dim (cached) ──────────────────────────

const embedder = xenovaEmbedder({ model: MODEL, dim: FULL_DIM, maxLength: 8192, pooling: 'mean' });

/** Write a Float32 matrix as [count:u32][dim:u32][data...] little-endian. */
const writeMatrix = (path, rows, dim) => {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(rows.length, 0);
  header.writeUInt32LE(dim, 4);
  const body = Buffer.alloc(rows.length * dim * 4);
  for (let i = 0; i < rows.length; i++) {
    const off = i * dim * 4;
    const view = new DataView(body.buffer, body.byteOffset + off, dim * 4);
    for (let j = 0; j < dim; j++) view.setFloat32(j * 4, rows[i][j], true);
  }
  writeFileSync(path, Buffer.concat([header, body]));
};

/** Read a Float32 matrix back as Float32Array[]. */
const readMatrix = (path) => {
  const buf = readFileSync(path);
  const count = buf.readUInt32LE(0);
  const dim = buf.readUInt32LE(4);
  const rows = new Array(count);
  const bodyOff = 8;
  for (let i = 0; i < count; i++) {
    const arr = new Float32Array(dim);
    for (let j = 0; j < dim; j++) {
      arr[j] = buf.readFloatLE(bodyOff + (i * dim + j) * 4);
    }
    rows[i] = arr;
  }
  return { rows, dim };
};

const embedPass = async (items, label) => {
  const out = new Array(items.length);
  const tStart = Date.now();
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const slice = items.slice(i, i + BATCH_SIZE);
    const texts = slice.map((x) => x.embedText);
    const res = await embedder.embedBatch(texts);
    if (res.isErr()) {
      console.error(`${label} embedBatch failed:`, res.error);
      process.exit(1);
    }
    for (let j = 0; j < slice.length; j++) out[i + j] = res.value[j];
    if ((i + slice.length) % 128 === 0 || i + slice.length >= items.length) {
      const rate = ((i + slice.length) / ((Date.now() - tStart) / 1000)).toFixed(1);
      process.stdout.write(`\r  ${label}: ${i + slice.length}/${items.length} (${rate} docs/sec)   `);
    }
  }
  process.stdout.write('\n');
  return out;
};

let corpusVecs;
let queryVecs;

if (!NO_CACHE && existsSync(CORPUS_VEC_BIN)) {
  console.log('[3/5] Loading cached corpus embeddings...');
  const { rows } = readMatrix(CORPUS_VEC_BIN);
  corpusVecs = rows;
  console.log(`  loaded ${rows.length} vectors @ ${FULL_DIM}d`);
} else {
  console.log(`[3/5] Embedding corpus at ${FULL_DIM}d (one-time, then cached)...`);
  corpusVecs = await embedPass(corpus, 'corpus');
  writeMatrix(CORPUS_VEC_BIN, corpusVecs, FULL_DIM);
  console.log(`  wrote ${CORPUS_VEC_BIN}`);
}

if (!NO_CACHE && existsSync(QUERY_VEC_BIN)) {
  console.log('  loading cached query embeddings...');
  const { rows } = readMatrix(QUERY_VEC_BIN);
  queryVecs = rows;
} else {
  console.log(`  embedding queries at ${FULL_DIM}d...`);
  queryVecs = await embedPass(queries, 'queries');
  writeMatrix(QUERY_VEC_BIN, queryVecs, FULL_DIM);
}

// ─── step 4: truncate + score per dim ────────────────────────────

/**
 * Nomic MRL procedure (canonical):
 *   1. Apply parameterless F.layer_norm across the full dim.
 *   2. Slice first N dims.
 *   3. L2-renormalize.
 *
 * The LN step is scale-invariant (y = (x - μ) / σ cancels any uniform
 * scaling), so it's safe to apply to an L2-normalized cached vector
 * without re-embedding. Xenova's feature-extraction pipeline skips the
 * MRL-specific LN that Nomic puts on top of the sentence_transformers
 * stack — hence the degraded truncation numbers we see without this step.
 */
const LN_EPS = 1e-5;
const applyLayerNorm = (v) => {
  const n = v.length;
  let mean = 0;
  for (let i = 0; i < n; i++) mean += v[i];
  mean /= n;
  let variance = 0;
  for (let i = 0; i < n; i++) {
    const d = v[i] - mean;
    variance += d * d;
  }
  variance /= n;
  const denom = Math.sqrt(variance + LN_EPS);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (v[i] - mean) / denom;
  return out;
};

const l2Normalize = (v) => {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const norm = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
};

/** MRL-correct truncation: LN → slice → L2-norm. */
const truncateNormalize = (v, dim) => {
  const ln = applyLayerNorm(v);
  if (dim >= v.length) return l2Normalize(ln);
  const sliced = new Float32Array(dim);
  for (let i = 0; i < dim; i++) sliced[i] = ln[i];
  return l2Normalize(sliced);
};

/** Cosine similarity — assumes unit-normalized. */
const dot = (a, b) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

// Rank every doc for every query under each candidate dim.
// For SciFact (5183 × 300) this is 5183 × 300 × dim flops per run.
// At dim=768 that's ~1.2 B flops — well under a second in hot JS.
// Cosine work is the lever Matryoshka exists to shrink.

const log2 = (x) => Math.log(x) / Math.LN2;

const ndcgK = (ranked, rel, k) => {
  let dcg = 0;
  const topK = ranked.slice(0, k);
  for (let i = 0; i < topK.length; i++) {
    const r = rel.get(topK[i].docId) ?? 0;
    dcg += r / log2(i + 2);
  }
  const idealGrades = [...rel.values()].sort((a, b) => b - a).slice(0, k);
  let idcg = 0;
  for (let i = 0; i < idealGrades.length; i++) idcg += idealGrades[i] / log2(i + 2);
  return idcg > 0 ? dcg / idcg : 0;
};
const recallK = (ranked, rel, k) => {
  const topK = ranked.slice(0, k);
  let hits = 0;
  for (const r of topK) if (rel.has(r.docId)) hits++;
  return rel.size > 0 ? hits / rel.size : 0;
};
const mrrOne = (ranked, rel) => {
  for (let i = 0; i < ranked.length; i++) if (rel.has(ranked[i].docId)) return 1 / (i + 1);
  return 0;
};
const mapK = (ranked, rel, k) => {
  const topK = ranked.slice(0, k);
  let sum = 0, count = 0;
  for (let i = 0; i < topK.length; i++) {
    if (rel.has(topK[i].docId)) {
      count++;
      sum += count / (i + 1);
    }
  }
  return rel.size > 0 ? sum / Math.min(rel.size, k) : 0;
};

console.log(`[4/5] Scoring at dims ${DIMS.join(', ')}...`);

// Pre-allocate scoring arrays so we can measure pure cosine+sort latency.
const perDimResults = [];

for (const D of DIMS) {
  // Truncate the corpus matrix to D dims.
  const truncCorpus = corpusVecs.map((v) => truncateNormalize(v, D));
  const truncQueries = queryVecs.map((v) => truncateNormalize(v, D));

  // Score every query. Pure brute-force cosine — O(N × M × D).
  const latencies = [];
  const m = { ndcg10: [], r5: [], r10: [], map10: [], mrr: [] };
  const perQueryQids = [];

  for (let qi = 0; qi < queries.length; qi++) {
    const q = queries[qi];
    const qv = truncQueries[qi];

    const t0 = Date.now();
    const scored = new Array(truncCorpus.length);
    for (let ci = 0; ci < truncCorpus.length; ci++) {
      scored[ci] = { docId: corpus[ci].id, score: dot(qv, truncCorpus[ci]) };
    }
    scored.sort((a, b) => b.score - a.score);
    const ranked = scored.slice(0, 100);
    latencies.push(Date.now() - t0);

    const rel = qrels.get(q.id) ?? new Map();
    m.ndcg10.push(ndcgK(ranked, rel, 10));
    m.r5.push(recallK(ranked, rel, 5));
    m.r10.push(recallK(ranked, rel, 10));
    m.map10.push(mapK(ranked, rel, 10));
    m.mrr.push(mrrOne(ranked, rel));
    perQueryQids.push(q.id);
  }

  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const pctl = (xs, p) => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length * p)] ?? 0;
  };

  perDimResults.push({
    dim: D,
    ndcg10: mean(m.ndcg10),
    r5: mean(m.r5),
    r10: mean(m.r10),
    map10: mean(m.map10),
    mrr: mean(m.mrr),
    latency_p50: pctl(latencies, 0.5),
    latency_p95: pctl(latencies, 0.95),
    per_query_ndcg10: m.ndcg10,
    per_query_qids: perQueryQids,
  });

  const r = perDimResults[perDimResults.length - 1];
  console.log(
    `  dim=${String(D).padStart(3)}  NDCG@10=${(r.ndcg10 * 100).toFixed(2)}%  R@10=${(r.r10 * 100).toFixed(2)}%  MRR=${r.mrr.toFixed(4)}  cosine p50=${r.latency_p50}ms p95=${r.latency_p95}ms`,
  );
}

// ─── step 5: verdict ─────────────────────────────────────────────

console.log('\n[5/5] Gate verdict\n');

const base = perDimResults.find((r) => r.dim === FULL_DIM);
const GATE_TOLERANCE_PTS = { 512: 0.5, 256: 1.5, 128: 3.0, 64: 6.0 };

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` Matryoshka gate — ${DATASET.toUpperCase()} (${MODEL})`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' dim  NDCG@10   Δ vs 768   R@10      MRR      p50    Verdict');

for (const r of perDimResults) {
  const delta = (r.ndcg10 - base.ndcg10) * 100;
  const tol = GATE_TOLERANCE_PTS[r.dim];
  let verdict;
  if (r.dim === FULL_DIM) {
    verdict = 'BASELINE';
  } else if (tol === undefined) {
    verdict = 'info';
  } else if (delta >= -tol) {
    verdict = `PASS (tol −${tol.toFixed(1)}pt)`;
  } else {
    verdict = `NULL (Δ ${delta.toFixed(2)}pt, tol −${tol.toFixed(1)}pt)`;
  }
  console.log(
    `  ${String(r.dim).padStart(3)}  ` +
      `${(r.ndcg10 * 100).toFixed(2)}%   ` +
      `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}pt    ` +
      `${(r.r10 * 100).toFixed(2)}%   ` +
      `${r.mrr.toFixed(4)}   ` +
      `${String(r.latency_p50).padStart(3)}ms  ${verdict}`,
  );
}

// Shippable dim = smallest dim that still PASSes.
const shippable = perDimResults
  .filter((r) => r.dim < FULL_DIM && GATE_TOLERANCE_PTS[r.dim] !== undefined)
  .filter((r) => (r.ndcg10 - base.ndcg10) * 100 >= -GATE_TOLERANCE_PTS[r.dim])
  .sort((a, b) => a.dim - b.dim)[0];

console.log('');
if (shippable) {
  const shrink = FULL_DIM / shippable.dim;
  const speedup = base.latency_p50 / Math.max(shippable.latency_p50, 1);
  console.log(
    `✓ Shippable dim: ${shippable.dim} (${shrink.toFixed(1)}× smaller vectors, ${speedup.toFixed(1)}× faster cosine)`,
  );
} else {
  console.log('✗ No dim below full passes the gate — Matryoshka null on this dataset.');
}
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const result = {
  dataset: `BeIR/${DATASET}`,
  split: 'test',
  model: MODEL,
  full_dim: FULL_DIM,
  dims: DIMS,
  corpus_size: corpus.length,
  query_count: queries.length,
  per_dim: perDimResults.map((r) => ({
    dim: r.dim,
    ndcg_at_10: r.ndcg10,
    map_at_10: r.map10,
    recall_at_5: r.r5,
    recall_at_10: r.r10,
    mrr: r.mrr,
    latency_p50_ms: r.latency_p50,
    latency_p95_ms: r.latency_p95,
    per_query_ndcg10: r.per_query_ndcg10,
    per_query_qids: r.per_query_qids,
  })),
  gate_tolerances_pts: GATE_TOLERANCE_PTS,
  shippable_dim: shippable?.dim ?? null,
  timestamp: new Date().toISOString(),
};
writeFileSync(join(MRL_CACHE_DIR, 'results.json'), JSON.stringify(result, null, 2));
console.log(`\nResult JSON: ${join(MRL_CACHE_DIR, 'results.json')}`);
