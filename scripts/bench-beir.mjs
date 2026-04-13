#!/usr/bin/env node
// Full BEIR benchmark runner — downloads any BEIR v1 dataset by name and runs
// the canonical retrieval metrics on wellinformed's ONNX + sqlite-vec stack.
//
// Usage: node scripts/bench-beir.mjs <dataset-name>
// Examples:
//   node scripts/bench-beir.mjs scifact    (5,183 corpus, 300 queries — canonical small BEIR)
//   node scripts/bench-beir.mjs nfcorpus   (3,633 corpus, 323 queries — biomedical)
//   node scripts/bench-beir.mjs arguana    (8,674 corpus, 1,406 queries — argument retrieval)
//
// Methodology: BEIR v1 test split, standard metrics (NDCG@10, MAP@10, R@{5,10}, MRR).
// Results are directly comparable to the BEIR leaderboard.

import { existsSync, mkdirSync, createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';

import { xenovaEmbedder } from '../dist/infrastructure/embedders.js';
import { openSqliteVectorIndex } from '../dist/infrastructure/vector-index.js';

const DATASET = process.argv[2] ?? 'scifact';
const BATCH_SIZE = 32;
const K = 10;

const CACHE_ROOT = join(homedir(), '.wellinformed', 'bench');
const CACHE_DIR = join(CACHE_ROOT, DATASET);
const DB_PATH = join(CACHE_DIR, 'vectors.db');
const CORPUS_JSONL = join(CACHE_DIR, DATASET, 'corpus.jsonl');
const QUERIES_JSONL = join(CACHE_DIR, DATASET, 'queries.jsonl');
const QRELS_TSV = join(CACHE_DIR, DATASET, 'qrels', 'test.tsv');
const DATASET_URL = `https://public.ukp.informatik.tu-darmstadt.de/thakur/BEIR/datasets/${DATASET}.zip`;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` wellinformed — BEIR ${DATASET.toUpperCase()} Benchmark`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` Dataset: BeIR/${DATASET} (BEIR v1, test split)`);
console.log(` Model:   Xenova/all-MiniLM-L6-v2 (384 dim)`);
console.log(` Cache:   ${CACHE_DIR}`);
console.log('');

// ─── step 1: download + extract dataset ──────────────────────────
mkdirSync(CACHE_DIR, { recursive: true });
if (!existsSync(CORPUS_JSONL)) {
  console.log(`[1/5] Downloading ${DATASET}.zip...`);
  const zipPath = join(CACHE_DIR, `${DATASET}.zip`);
  const r = spawnSync('curl', ['-fsSL', '-o', zipPath, DATASET_URL], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`[fail] download failed from ${DATASET_URL}`);
    process.exit(1);
  }
  console.log('[1/5] Extracting...');
  const unzip = spawnSync('unzip', ['-oq', zipPath, '-d', CACHE_DIR], { stdio: 'inherit' });
  if (unzip.status !== 0) {
    console.error('[fail] unzip failed');
    process.exit(1);
  }
} else {
  console.log('[1/5] Dataset cached, skipping download');
}

// ─── step 2: load corpus + queries + qrels ──────────────────────
console.log('[2/5] Loading corpus, queries, and qrels...');

const loadJsonl = async (path) => {
  const lines = [];
  const rl = createInterface({ input: createReadStream(path) });
  for await (const line of rl) {
    if (line.trim()) lines.push(JSON.parse(line));
  }
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
console.log(`  qrels:   ${[...qrels.values()].reduce((a, b) => a + b.size, 0)} (q, doc) pairs`);

// ─── step 3: embed + index ────────────────────────────────────────
console.log(`[3/5] Embedding corpus (batch=${BATCH_SIZE}) + indexing to sqlite-vec...`);

if (existsSync(DB_PATH)) {
  spawnSync('rm', ['-f', DB_PATH, DB_PATH + '-shm', DB_PATH + '-wal']);
}

const embedder = xenovaEmbedder({});
const idxRes = await openSqliteVectorIndex({ path: DB_PATH, dim: 384 });
if (idxRes.isErr()) {
  console.error('vector index open failed:', idxRes.error);
  process.exit(1);
}
const index = idxRes.value;

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

// ─── step 4: run queries ────────────────────────────────────────
console.log('[4/5] Running queries...');
const queryResults = new Map();
const latencies = [];
const tQ = Date.now();

for (let i = 0; i < queries.length; i++) {
  const q = queries[i];
  const vRes = await embedder.embed(q.text);
  if (vRes.isErr()) continue;
  const qStart = Date.now();
  const sRes = await index.searchGlobal(vRes.value, K);
  latencies.push(Date.now() - qStart);
  if (sRes.isErr()) continue;
  queryResults.set(q.id, sRes.value.map((m) => ({ docId: m.node_id, score: -m.distance })));
  if ((i + 1) % 50 === 0 || i === queries.length - 1) {
    process.stdout.write(`\r  ran ${i + 1}/${queries.length} queries   `);
  }
}
console.log(`\n  query pass done in ${((Date.now() - tQ) / 1000).toFixed(1)}s`);

// ─── step 5: metrics ────────────────────────────────────────────
console.log('[5/5] Computing BEIR standard metrics...\n');

const log2 = (x) => Math.log(x) / Math.LN2;
const ndcgK = (ranked, rel, k) => {
  let dcg = 0;
  const topK = ranked.slice(0, k);
  for (let i = 0; i < topK.length; i++) {
    const r = rel.has(topK[i].docId) ? 1 : 0;
    dcg += r / log2(i + 2);
  }
  const numRel = Math.min(rel.size, k);
  let idcg = 0;
  for (let i = 0; i < numRel; i++) idcg += 1 / log2(i + 2);
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

const m = { ndcg10: [], r5: [], r10: [], map10: [], mrr: [] };
for (const q of queries) {
  const ranked = queryResults.get(q.id) ?? [];
  const rel = qrels.get(q.id) ?? new Map();
  m.ndcg10.push(ndcgK(ranked, rel, 10));
  m.r5.push(recallK(ranked, rel, 5));
  m.r10.push(recallK(ranked, rel, 10));
  m.map10.push(mapK(ranked, rel, 10));
  m.mrr.push(mrrOne(ranked, rel));
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const pct = (x) => (x * 100).toFixed(2) + '%';

const ndcg10 = mean(m.ndcg10);
const r5 = mean(m.r5);
const r10 = mean(m.r10);
const map10 = mean(m.map10);
const mrr = mean(m.mrr);

latencies.sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
const p99 = latencies[Math.floor(latencies.length * 0.99)] ?? 0;

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` BEIR ${DATASET.toUpperCase()} — Final Results`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` Corpus:    ${corpus.length.toLocaleString()} passages`);
console.log(` Queries:   ${queries.length.toLocaleString()} (test split)`);
console.log(` Model:     Xenova/all-MiniLM-L6-v2 (384 dim, ONNX)`);
console.log(` Index:     sqlite-vec (vec0 virtual table)`);
console.log('');
console.log(' Retrieval:');
console.log(`   NDCG@10:   ${pct(ndcg10)}`);
console.log(`   MAP@10:    ${pct(map10)}`);
console.log(`   Recall@5:  ${pct(r5)}`);
console.log(`   Recall@10: ${pct(r10)}`);
console.log(`   MRR:       ${mrr.toFixed(4)}`);
console.log('');
console.log(' Latency (sqlite-vec KNN only):');
console.log(`   p50: ${p50} ms`);
console.log(`   p95: ${p95} ms`);
console.log(`   p99: ${p99} ms`);
console.log('');
console.log(` Indexing throughput: ${(corpus.length / (indexElapsedMs / 1000)).toFixed(0)} docs/sec`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

index.close();

// Machine-readable
const result = {
  dataset: `BeIR/${DATASET}`,
  split: 'test',
  model: 'Xenova/all-MiniLM-L6-v2',
  dim: 384,
  corpus_size: corpus.length,
  query_count: queries.length,
  metrics: { ndcg_at_10: ndcg10, map_at_10: map10, recall_at_5: r5, recall_at_10: r10, mrr },
  latency_ms: { p50, p95, p99 },
  throughput: { indexing_docs_per_sec: corpus.length / (indexElapsedMs / 1000) },
  timestamp: new Date().toISOString(),
};
writeFileSync(join(CACHE_DIR, 'results.json'), JSON.stringify(result, null, 2));
console.log(`\nResult JSON: ${join(CACHE_DIR, 'results.json')}`);
