#!/usr/bin/env node
// Full SOTA BEIR benchmark — dense retrieval + BM25 hybrid (RRF) + cross-encoder reranker.
//
// Usage:
//   node scripts/bench-beir-sota.mjs <dataset> [--model ID] [--dim N]
//     [--doc-prefix 'str'] [--query-prefix 'str']
//     [--hybrid] [--rerank] [--reranker-model ID]
//     [--dense-k N] [--bm25-k N] [--final-k N] [--rerank-in N]
//
// Pipeline stages:
//   1. Dense: nomic-embed-text-v1.5 (or any HF model) via @xenova/transformers → sqlite-vec
//   2. Sparse (--hybrid): SQLite FTS5 BM25 MATCH query on the same DB
//   3. Fusion (--hybrid): Reciprocal Rank Fusion (k=60) over dense + BM25 ranks
//   4. Reranker (--rerank): Xenova/bge-reranker-base cross-encoder on top-N hybrid results
//
// Measures: NDCG@10, MAP@10, R@5, R@10, MRR, per-stage latency. Reproducible.

import { existsSync, mkdirSync, createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';

import { xenovaEmbedder } from '../dist/infrastructure/embedders.js';

// ─── arg parsing ─────────────────────────────────────────────────
const args = process.argv.slice(2);
const DATASET = args[0] ?? 'scifact';
const has = (flag) => args.includes(flag);
const getArg = (flag, def) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : def;
};

const MODEL = getArg('--model', 'nomic-ai/nomic-embed-text-v1.5');
const DIM = parseInt(getArg('--dim', '768'), 10);
const DOC_PREFIX = getArg('--doc-prefix', 'search_document: ');
const QUERY_PREFIX = getArg('--query-prefix', 'search_query: ');
const HYBRID = has('--hybrid');
const RERANK = has('--rerank');
const RERANKER_MODEL = getArg('--reranker-model', 'Xenova/bge-reranker-base');
const DENSE_K = parseInt(getArg('--dense-k', '100'), 10);
const BM25_K = parseInt(getArg('--bm25-k', '100'), 10);
const FINAL_K = parseInt(getArg('--final-k', '10'), 10);
const RERANK_IN = parseInt(getArg('--rerank-in', '100'), 10);
const RRF_K = 60; // standard RRF constant
const BATCH_SIZE = parseInt(getArg('--batch', '32'), 10);

const CACHE_ROOT = join(homedir(), '.wellinformed', 'bench');
const DATASET_DIR = join(CACHE_ROOT, DATASET);
const MODEL_SLUG = MODEL.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
const SUFFIX = (HYBRID ? '__hybrid' : '') + (RERANK ? '__rerank' : '');
const CACHE_DIR = join(CACHE_ROOT, `${DATASET}__${MODEL_SLUG}${SUFFIX}`);
const DB_PATH = join(CACHE_DIR, 'sota.db');
const CORPUS_JSONL = join(DATASET_DIR, DATASET, 'corpus.jsonl');
const QUERIES_JSONL = join(DATASET_DIR, DATASET, 'queries.jsonl');
const QRELS_TSV = join(DATASET_DIR, DATASET, 'qrels', 'test.tsv');
const DATASET_URL = `https://public.ukp.informatik.tu-darmstadt.de/thakur/BEIR/datasets/${DATASET}.zip`;

// ─── banner ──────────────────────────────────────────────────────
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` wellinformed — BEIR ${DATASET.toUpperCase()} SOTA Benchmark`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` Dataset: BeIR/${DATASET} (BEIR v1, test split)`);
console.log(` Model:   ${MODEL} (${DIM} dim)`);
console.log(` Pipeline: dense${HYBRID ? ' + BM25 hybrid (RRF)' : ''}${RERANK ? ` + ${RERANKER_MODEL} reranker (top ${RERANK_IN})` : ''}`);
console.log('');

// ─── step 1: download/extract dataset ────────────────────────────
mkdirSync(CACHE_DIR, { recursive: true });
mkdirSync(DATASET_DIR, { recursive: true });
if (!existsSync(CORPUS_JSONL)) {
  console.log(`[1/6] Downloading ${DATASET}.zip...`);
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
  console.log('[1/6] Dataset cached');
}

// ─── step 2: load corpus/queries/qrels ───────────────────────────
console.log('[2/6] Loading corpus, queries, qrels...');

const loadJsonl = async (path) => {
  const lines = [];
  const rl = createInterface({ input: createReadStream(path) });
  for await (const line of rl) if (line.trim()) lines.push(JSON.parse(line));
  return lines;
};

const corpusRaw = await loadJsonl(CORPUS_JSONL);
// rawText = for BM25 (no prefix); embedText = for dense (with prefix)
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

// Build in-memory rowid → raw text map. Reranker uses this instead of
// querying the DB — faster and avoids FTS5 external-content column
// quirks.
const rowidToText = new Map();

// ─── step 3: open raw DB with vec0 + fts5 tables ─────────────────
// Cache: if DB already has the right number of nodes, skip reindexing.
// This lets us iterate on query pipelines without re-embedding nomic
// every run (~22 min saved on SciFact).
const CACHE_OK = has('--no-cache') ? false : existsSync(DB_PATH);
console.log('[3/6] Opening DB (vec0 + fts5)' + (CACHE_OK ? ' — cached' : ' — fresh'));
if (!CACHE_OK && existsSync(DB_PATH)) spawnSync('rm', ['-f', DB_PATH, DB_PATH + '-shm', DB_PATH + '-wal']);

const Better = (await import('better-sqlite3')).default;
const sqliteVec = await import('sqlite-vec');
const db = new Better(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
sqliteVec.load(db);

if (!CACHE_OK) {
  db.exec(`
    CREATE VIRTUAL TABLE vec_nodes USING vec0(embedding float[${DIM}]);
    CREATE TABLE doc_meta (
      rowid INTEGER PRIMARY KEY,
      doc_id TEXT UNIQUE NOT NULL,
      raw_text TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE fts_docs USING fts5(
      text,
      tokenize='porter unicode61 remove_diacritics 2'
    );
  `);
}

const insertMeta = db.prepare('INSERT INTO doc_meta(rowid, doc_id, raw_text) VALUES (?, ?, ?)');
const insertVec = db.prepare('INSERT INTO vec_nodes(rowid, embedding) VALUES (?, ?)');
const insertFts = db.prepare('INSERT INTO fts_docs(rowid, text) VALUES (?, ?)');

// ─── step 4: embed + index (or load cached) ─────────────────────
const embedder = xenovaEmbedder({ model: MODEL, dim: DIM });
const idToRowid = new Map();
const rowidToId = new Map();
// vec0 virtual table requires BigInt rowids, not plain JS numbers
const toVecBuffer = (v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength);

let indexElapsedMs = 0;
if (CACHE_OK) {
  console.log('[4/6] Loading cached index...');
  const rows = db.prepare('SELECT rowid, doc_id, raw_text FROM doc_meta').all();
  for (const r of rows) {
    idToRowid.set(r.doc_id, r.rowid);
    rowidToId.set(r.rowid, r.doc_id);
    rowidToText.set(r.rowid, r.raw_text);
  }
  console.log(`  loaded ${rows.length} cached docs`);
} else {
  console.log(`[4/6] Embedding corpus (batch=${BATCH_SIZE}) + indexing...`);
  const tIdx = Date.now();
  let done = 0;

  for (let i = 0; i < corpus.length; i += BATCH_SIZE) {
    const batch = corpus.slice(i, i + BATCH_SIZE);
    const texts = batch.map((c) => c.embedText);
    const vecRes = await embedder.embedBatch(texts);
    if (vecRes.isErr()) {
      console.error('embedBatch failed:', vecRes.error);
      process.exit(1);
    }
    const vectors = vecRes.value;
    const insertTx = db.transaction(() => {
      for (let j = 0; j < batch.length; j++) {
        const rowidNum = i + j + 1;
        const rowid = BigInt(rowidNum);
        idToRowid.set(batch[j].id, rowidNum);
        rowidToId.set(rowidNum, batch[j].id);
        rowidToText.set(rowidNum, batch[j].rawText);
        insertMeta.run(rowidNum, batch[j].id, batch[j].rawText);
        insertVec.run(rowid, toVecBuffer(vectors[j]));
        insertFts.run(rowidNum, batch[j].rawText);
      }
    });
    insertTx();
    done += batch.length;
    if (done % 256 === 0 || done >= corpus.length) {
      const rate = (done / ((Date.now() - tIdx) / 1000)).toFixed(0);
      process.stdout.write(`\r  indexed ${done}/${corpus.length} (${rate} docs/sec)   `);
    }
  }
  indexElapsedMs = Date.now() - tIdx;
  console.log(`\n  indexing done in ${(indexElapsedMs / 1000).toFixed(1)}s`);
}

// ─── step 5: load reranker if needed ─────────────────────────────
// Use raw tokenizer + sequence-classification model so we can pass
// (query, passage) text pairs — Xenova's text-classification pipeline
// only accepts single strings.
let rerankerTokenizer = null;
let rerankerModel = null;
let rerankerRawModule = null;
if (RERANK) {
  console.log(`[5/6] Loading reranker (${RERANKER_MODEL})...`);
  try {
    rerankerRawModule = await import('@xenova/transformers');
    rerankerTokenizer = await rerankerRawModule.AutoTokenizer.from_pretrained(RERANKER_MODEL);
    rerankerModel = await rerankerRawModule.AutoModelForSequenceClassification.from_pretrained(
      RERANKER_MODEL,
    );
    console.log('  reranker loaded (raw tokenizer + model)');
  } catch (e) {
    console.error(`reranker load failed: ${e.message}`);
    process.exit(1);
  }
} else {
  console.log('[5/6] Reranker disabled');
}

// ─── step 6: run queries ─────────────────────────────────────────
console.log('[6/6] Running queries...');

// prepared statements
const denseStmt = db.prepare(
  `SELECT v.rowid, v.distance FROM vec_nodes v WHERE v.embedding MATCH ? AND k = ? ORDER BY v.distance`
);
const bm25Stmt = db.prepare(
  `SELECT rowid, rank FROM fts_docs WHERE fts_docs MATCH ? ORDER BY rank LIMIT ?`
);

// FTS5 query sanitizer — escape FTS5 special chars
const sanitizeForFts5 = (q) => {
  // Use phrase queries (quoted terms) to avoid operator parsing
  return q
    .split(/\s+/)
    .filter((t) => /\w/.test(t))
    .map((t) => `"${t.replace(/"/g, '""')}"`)
    .join(' OR ');
};

const queryResults = new Map();
const latencies = { dense: [], bm25: [], fuse: [], rerank: [], total: [] };
const tQ = Date.now();

for (let i = 0; i < queries.length; i++) {
  const q = queries[i];
  const tStart = Date.now();

  // Dense stage
  const vRes = await embedder.embed(q.embedText);
  if (vRes.isErr()) continue;
  const vecBuf = toVecBuffer(vRes.value);

  const tDense0 = Date.now();
  const denseRows = denseStmt.all(vecBuf, DENSE_K);
  latencies.dense.push(Date.now() - tDense0);
  const denseRanked = denseRows.map((r, idx) => ({
    docId: rowidToId.get(r.rowid),
    denseRank: idx,
    distance: r.distance,
  }));

  let candidates = denseRanked.map((r) => ({ docId: r.docId, denseRank: r.denseRank, bm25Rank: null }));

  // BM25 stage
  if (HYBRID) {
    const tBm25_0 = Date.now();
    let bm25Rows = [];
    try {
      const ftsQuery = sanitizeForFts5(q.rawText);
      if (ftsQuery) bm25Rows = bm25Stmt.all(ftsQuery, BM25_K);
    } catch (e) {
      // Sanitizer may still produce an invalid query — fall back to empty BM25 result
      bm25Rows = [];
    }
    latencies.bm25.push(Date.now() - tBm25_0);

    const byDoc = new Map();
    for (const c of candidates) byDoc.set(c.docId, c);
    bm25Rows.forEach((r, idx) => {
      const id = rowidToId.get(r.rowid);
      const existing = byDoc.get(id);
      if (existing) {
        existing.bm25Rank = idx;
      } else {
        byDoc.set(id, { docId: id, denseRank: null, bm25Rank: idx });
      }
    });

    // RRF fuse
    const tFuse0 = Date.now();
    const fused = [...byDoc.values()]
      .map((c) => {
        let score = 0;
        if (c.denseRank !== null) score += 1 / (RRF_K + c.denseRank + 1);
        if (c.bm25Rank !== null) score += 1 / (RRF_K + c.bm25Rank + 1);
        return { ...c, rrfScore: score };
      })
      .sort((a, b) => b.rrfScore - a.rrfScore);
    latencies.fuse.push(Date.now() - tFuse0);
    candidates = fused;
  }

  // Reranker stage (operates on top-N of current candidates)
  if (RERANK && rerankerModel) {
    const topN = candidates.slice(0, RERANK_IN);
    const tRr0 = Date.now();
    try {
      // Build text pairs [query, passage], tokenize in one batch, score all
      const queryTexts = new Array(topN.length).fill(q.rawText);
      const passageTexts = topN.map((c) => rowidToText.get(idToRowid.get(c.docId)) ?? '');

      // AutoTokenizer in Xenova 2.x accepts (text, { text_pair, ... })
      // where text and text_pair can both be arrays for batch tokenization.
      const inputs = await rerankerTokenizer(queryTexts, {
        text_pair: passageTexts,
        padding: true,
        truncation: true,
        max_length: 512,
      });
      const out = await rerankerModel(inputs);
      // BGE reranker produces a single logit per pair (sequence-classification with num_labels=1)
      // Higher = more relevant. Use raw logits — relative order is what matters.
      const logits = out.logits.data;
      // logits shape: [batchSize] (num_labels=1 is squeezed) or [batchSize, 1]
      const numPairs = topN.length;
      const scores = new Array(numPairs);
      for (let k = 0; k < numPairs; k++) {
        scores[k] = Number(logits[k]);
      }
      const scored = topN.map((c, idx) => ({ ...c, rerankScore: scores[idx] }));
      scored.sort((a, b) => b.rerankScore - a.rerankScore);
      candidates = [...scored, ...candidates.slice(RERANK_IN)];
    } catch (e) {
      if (i === 0) console.error(`\n  rerank failed on first query: ${e.message}\n  stack: ${e.stack?.split('\n').slice(0, 3).join('\n  ')}`);
    }
    latencies.rerank.push(Date.now() - tRr0);
  }

  latencies.total.push(Date.now() - tStart);
  queryResults.set(q.id, candidates.slice(0, FINAL_K));

  if ((i + 1) % 50 === 0 || i === queries.length - 1) {
    process.stdout.write(`\r  ran ${i + 1}/${queries.length} queries   `);
  }
}
console.log(`\n  query pass done in ${((Date.now() - tQ) / 1000).toFixed(1)}s`);

db.close();

// ─── metrics ─────────────────────────────────────────────────────
console.log('\n[=] Computing BEIR standard metrics...\n');

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
  let sum = 0,
    count = 0;
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

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (x) => (x * 100).toFixed(2) + '%';

const ndcg10 = mean(m.ndcg10);
const r5 = mean(m.r5);
const r10 = mean(m.r10);
const map10 = mean(m.map10);
const mrr = mean(m.mrr);

const pctl = (xs, p) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length * p)] ?? 0;
};

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` BEIR ${DATASET.toUpperCase()} — SOTA Pipeline Results`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` Corpus:    ${corpus.length.toLocaleString()} passages`);
console.log(` Queries:   ${queries.length.toLocaleString()} (test split)`);
console.log(` Model:     ${MODEL} (${DIM} dim)`);
console.log(` Pipeline:  dense${HYBRID ? ' + BM25 RRF' : ''}${RERANK ? ` + reranker` : ''}`);
console.log('');
console.log(' Retrieval metrics:');
console.log(`   NDCG@10:   ${pct(ndcg10)}`);
console.log(`   MAP@10:    ${pct(map10)}`);
console.log(`   Recall@5:  ${pct(r5)}`);
console.log(`   Recall@10: ${pct(r10)}`);
console.log(`   MRR:       ${mrr.toFixed(4)}`);
console.log('');
console.log(' Per-stage latency (ms, p50 / p95):');
console.log(`   dense:     ${pctl(latencies.dense, 0.5)} / ${pctl(latencies.dense, 0.95)}`);
if (HYBRID) {
  console.log(`   bm25:      ${pctl(latencies.bm25, 0.5)} / ${pctl(latencies.bm25, 0.95)}`);
  console.log(`   rrf fuse:  ${pctl(latencies.fuse, 0.5)} / ${pctl(latencies.fuse, 0.95)}`);
}
if (RERANK) console.log(`   rerank:    ${pctl(latencies.rerank, 0.5)} / ${pctl(latencies.rerank, 0.95)}`);
console.log(`   TOTAL:     ${pctl(latencies.total, 0.5)} / ${pctl(latencies.total, 0.95)}`);
console.log('');
console.log(` Indexing throughput: ${(corpus.length / (indexElapsedMs / 1000)).toFixed(0)} docs/sec`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const result = {
  dataset: `BeIR/${DATASET}`,
  split: 'test',
  model: MODEL,
  dim: DIM,
  hybrid: HYBRID,
  rerank: RERANK,
  reranker_model: RERANK ? RERANKER_MODEL : null,
  dense_k: DENSE_K,
  bm25_k: HYBRID ? BM25_K : null,
  rrf_k: HYBRID ? RRF_K : null,
  rerank_in: RERANK ? RERANK_IN : null,
  corpus_size: corpus.length,
  query_count: queries.length,
  metrics: { ndcg_at_10: ndcg10, map_at_10: map10, recall_at_5: r5, recall_at_10: r10, mrr },
  latency_ms: {
    total_p50: pctl(latencies.total, 0.5),
    total_p95: pctl(latencies.total, 0.95),
    dense_p50: pctl(latencies.dense, 0.5),
    bm25_p50: HYBRID ? pctl(latencies.bm25, 0.5) : null,
    rerank_p50: RERANK ? pctl(latencies.rerank, 0.5) : null,
  },
  timestamp: new Date().toISOString(),
};
writeFileSync(join(CACHE_DIR, 'results.json'), JSON.stringify(result, null, 2));
console.log(`\nResult JSON: ${join(CACHE_DIR, 'results.json')}`);
