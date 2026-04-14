#!/usr/bin/env node
// Phase 25 gate bench — SciFact run through the FULL production path
// with the Rust subprocess embedder swapped in.
//
// Pipeline: bench BEIR corpus → rustSubprocessEmbedder (spawns
// wellinformed-rs embed_server binary) → openSqliteVectorIndex.upsert
// with raw_text → searchHybrid (dense + FTS5 BM25 + RRF via the
// Phase 23 production port).
//
// Gate: NDCG@10 must match the Rust-native bench-beir-sota.mjs number
// (for MiniLM: ~65.27 ± 0.5) — if yes, the TS adapter + production
// VectorIndex + Rust embedder form a correct end-to-end pipeline.
//
// Usage:
//   node scripts/bench-beir-rust.mjs <dataset> [--model minilm|nomic|bge-base]
//
// Env:
//   WELLINFORMED_RUST_BIN — override path to embed_server

import { existsSync, mkdirSync, createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';

import { rustSubprocessEmbedder } from '../dist/infrastructure/embedders.js';
import { openSqliteVectorIndex } from '../dist/infrastructure/vector-index.js';

const args = process.argv.slice(2);
const DATASET = args[0] ?? 'scifact';
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const MODEL = (getArg('--model') ?? 'minilm').toLowerCase();

const DIM_BY_MODEL = { minilm: 384, nomic: 768, 'bge-base': 768 };
const DIM = DIM_BY_MODEL[MODEL];
if (!DIM) {
  console.error(`unknown model '${MODEL}' — supported: minilm, nomic, bge-base`);
  process.exit(1);
}

const BATCH_SIZE = parseInt(getArg('--batch') ?? '32', 10);
const K = 10;

const CACHE_ROOT = join(homedir(), '.wellinformed', 'bench');
const CACHE_DIR = join(CACHE_ROOT, `${DATASET}__rust-via-ts__${MODEL}`);
const DB_PATH = join(CACHE_DIR, 'vectors.db');
const DATASET_DIR = join(CACHE_ROOT, DATASET);
const CORPUS_JSONL = join(DATASET_DIR, DATASET, 'corpus.jsonl');
const QUERIES_JSONL = join(DATASET_DIR, DATASET, 'queries.jsonl');
const QRELS_TSV = join(DATASET_DIR, DATASET, 'qrels', 'test.tsv');
const DATASET_URL = `https://public.ukp.informatik.tu-darmstadt.de/thakur/BEIR/datasets/${DATASET}.zip`;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` Phase 25 gate — BEIR ${DATASET.toUpperCase()}`);
console.log(` TS production path × Rust subprocess embedder`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` Dataset: BeIR/${DATASET}`);
console.log(` Model:   ${MODEL} (${DIM} dim) via rustSubprocessEmbedder`);
console.log(` Cache:   ${CACHE_DIR}`);
console.log('');

// ─── step 1: download dataset if needed ─────────────────────────
mkdirSync(CACHE_DIR, { recursive: true });
mkdirSync(DATASET_DIR, { recursive: true });
if (!existsSync(CORPUS_JSONL)) {
  console.log(`[1/5] Downloading ${DATASET}.zip...`);
  const zipPath = join(DATASET_DIR, `${DATASET}.zip`);
  const r = spawnSync('curl', ['-fsSL', '-o', zipPath, DATASET_URL], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(1);
  const unzip = spawnSync('unzip', ['-oq', zipPath, '-d', DATASET_DIR], { stdio: 'inherit' });
  if (unzip.status !== 0) process.exit(1);
} else {
  console.log('[1/5] Dataset cached');
}

// ─── step 2: load BEIR ─────────────────────────────────────────
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
  text: (r.title ? r.title + '. ' : '') + (r.text ?? ''),
}));

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
const testQids = new Set(qrels.keys());
const queries = queriesRaw
  .filter((q) => testQids.has(String(q._id)))
  .map((q) => ({ id: String(q._id), text: q.text }));

console.log(`  corpus:  ${corpus.length.toLocaleString()} passages`);
console.log(`  queries: ${queries.length.toLocaleString()} (test split)`);

// ─── step 3: build production components ────────────────────────
console.log('[3/5] Building production components (Rust embedder + sqlite-vec index)...');
if (existsSync(DB_PATH)) spawnSync('rm', ['-f', DB_PATH, DB_PATH + '-shm', DB_PATH + '-wal']);

const embedder = rustSubprocessEmbedder({ model: MODEL, dim: DIM });
const idxRes = await openSqliteVectorIndex({ path: DB_PATH, dim: DIM });
if (idxRes.isErr()) {
  console.error('vector index open failed:', idxRes.error);
  process.exit(1);
}
const index = idxRes.value;

// ─── step 4: index corpus (production path: embedBatch + upsert with raw_text) ──
console.log(`[4/5] Embedding corpus (batch=${BATCH_SIZE})...`);
const tIdx = Date.now();
let done = 0;
for (let i = 0; i < corpus.length; i += BATCH_SIZE) {
  const batch = corpus.slice(i, i + BATCH_SIZE);
  const texts = batch.map((c) => c.text);
  const vecRes = await embedder.embedBatch(texts);
  if (vecRes.isErr()) {
    console.error('embedBatch failed:', vecRes.error);
    process.exit(1);
  }
  const vectors = vecRes.value;
  for (let j = 0; j < batch.length; j++) {
    const upsertRes = await index.upsert({
      node_id: batch[j].id,
      room: DATASET,
      vector: vectors[j],
      raw_text: batch[j].text,
    });
    if (upsertRes.isErr()) {
      console.error('upsert failed:', upsertRes.error);
      process.exit(1);
    }
  }
  done += batch.length;
  if (done % 256 === 0 || done >= corpus.length) {
    const rate = (done / ((Date.now() - tIdx) / 1000)).toFixed(0);
    process.stdout.write(`\r  indexed ${done}/${corpus.length} (${rate} docs/sec)   `);
  }
}
const indexElapsedMs = Date.now() - tIdx;
console.log(`\n  indexing done in ${(indexElapsedMs / 1000).toFixed(1)}s`);

// ─── step 5: run queries via searchHybrid (production port) ──────
console.log('[5/5] Running queries via production searchHybrid...');
const queryResults = new Map();
const latencies = [];
const tQ = Date.now();

for (let i = 0; i < queries.length; i++) {
  const q = queries[i];
  const vRes = await embedder.embed(q.text);
  if (vRes.isErr()) continue;
  const tStart = Date.now();
  // Use searchHybrid — the Phase 23 production hybrid path
  const sRes = await index.searchHybrid(q.text, vRes.value, K);
  latencies.push(Date.now() - tStart);
  if (sRes.isErr()) continue;
  queryResults.set(q.id, sRes.value.map((m) => ({ docId: m.node_id, score: -m.distance })));
  if ((i + 1) % 50 === 0 || i === queries.length - 1) {
    process.stdout.write(`\r  ran ${i + 1}/${queries.length} queries   `);
  }
}
console.log(`\n  query pass done in ${((Date.now() - tQ) / 1000).toFixed(1)}s`);

// ─── metrics ────────────────────────────────────────────────────
const log2 = (x) => Math.log(x) / Math.LN2;
const ndcgK = (ranked, rel, k) => {
  let dcg = 0;
  for (let i = 0; i < ranked.slice(0, k).length; i++) {
    const r = rel.get(ranked[i].docId) ?? 0;
    dcg += r / log2(i + 2);
  }
  const idealGrades = [...rel.values()].sort((a, b) => b - a).slice(0, k);
  let idcg = 0;
  for (let i = 0; i < idealGrades.length; i++) idcg += idealGrades[i] / log2(i + 2);
  return idcg > 0 ? dcg / idcg : 0;
};
const recallK = (ranked, rel, k) => {
  const hits = ranked.slice(0, k).filter((r) => rel.has(r.docId)).length;
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

const perQ = { ndcg10: [], r5: [], r10: [], map10: [], mrr: [] };
for (const q of queries) {
  const ranked = queryResults.get(q.id) ?? [];
  const rel = qrels.get(q.id) ?? new Map();
  perQ.ndcg10.push(ndcgK(ranked, rel, 10));
  perQ.r5.push(recallK(ranked, rel, 5));
  perQ.r10.push(recallK(ranked, rel, 10));
  perQ.map10.push(mapK(ranked, rel, 10));
  perQ.mrr.push(mrrOne(ranked, rel));
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (x) => (x * 100).toFixed(2) + '%';
const ndcg10 = mean(perQ.ndcg10);
const r5 = mean(perQ.r5);
const r10 = mean(perQ.r10);
const map10 = mean(perQ.map10);
const mrr = mean(perQ.mrr);
latencies.sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;

console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` Phase 25 gate result — TS production × Rust embedder`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` NDCG@10:   ${pct(ndcg10)}`);
console.log(` MAP@10:    ${pct(map10)}`);
console.log(` Recall@5:  ${pct(r5)}`);
console.log(` Recall@10: ${pct(r10)}`);
console.log(` MRR:       ${mrr.toFixed(4)}`);
console.log(` Latency:   p50=${p50}ms p95=${p95}ms`);
console.log(` Indexing:  ${(corpus.length / (indexElapsedMs / 1000)).toFixed(0)} docs/sec`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log(' Gate: match Rust-native bench within 0.5 NDCG points.');
console.log(' Rust-native MiniLM SciFact = 65.27%');
console.log(` Delta: ${(ndcg10 * 100 - 65.27).toFixed(2)} NDCG points`);

index.close();

const result = {
  dataset: `BeIR/${DATASET}`,
  phase: 25,
  pipeline: 'TS production × Rust subprocess embedder',
  model: MODEL,
  dim: DIM,
  corpus_size: corpus.length,
  query_count: queries.length,
  metrics: { ndcg_at_10: ndcg10, map_at_10: map10, recall_at_5: r5, recall_at_10: r10, mrr },
  latency_ms: { p50, p95 },
  throughput: { indexing_docs_per_sec: corpus.length / (indexElapsedMs / 1000) },
  timestamp: new Date().toISOString(),
};
writeFileSync(join(CACHE_DIR, 'results.json'), JSON.stringify(result, null, 2));
console.log(`\nResult JSON: ${join(CACHE_DIR, 'results.json')}`);

// Signal shutdown to the child embed_server
process.exit(0);
