#!/usr/bin/env node
/**
 * RRF k + weighted-α sweep on cached SciFact bge-base vectors.
 *
 * Goal: gate the data-scientist's #1 attack vector — find the (k_rrf,
 * alpha) cell that maximizes NDCG@10 on a held-out fold and report
 * lift vs the Phase 25 baseline (k=60, α=0.5 = symmetric RRF).
 *
 * Data: ~/.wellinformed/bench/scifact__rust-via-ts__bge-base/vectors.db
 *       (corpus 5,183 × 768 + FTS5 already indexed)
 * Embedder: Rust subprocess (matches Phase 25 production path)
 *
 * Sweep grid (HIGH-CONFIDENCE, can't regress below baseline):
 *   k_rrf  ∈ {10, 20, 40, 60, 100}
 *   alpha  ∈ {0.50, 0.60, 0.65, 0.70, 0.80, 1.00}
 *
 * Methodology:
 *   1. Embed all 300 SciFact test queries (~30s on Rust embed_server)
 *   2. For each query: compute dense top-100 + BM25 top-100 (cached)
 *   3. For each (k, α) cell: weighted-RRF fuse → NDCG@10 per query
 *   4. Train fold = first 50 queries (deterministic), test fold = rest
 *   5. Pick best on TRAIN, report on TEST
 *
 * Pure: no re-embed, no re-index. ~5 min total.
 */

import { existsSync, mkdirSync, createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

import { rustSubprocessEmbedder } from '../dist/infrastructure/embedders.js';

const CACHE_DIR = join(homedir(), '.wellinformed', 'bench');
const DATASET = 'scifact';
const DB_PATH = join(CACHE_DIR, 'scifact__rust-via-ts__bge-base', 'vectors.db');
const DATASET_DIR = join(CACHE_DIR, DATASET, DATASET);
const QUERIES_JSONL = join(DATASET_DIR, 'queries.jsonl');
const QRELS_TSV = join(DATASET_DIR, 'qrels', 'test.tsv');
const RESULTS_DIR = join(CACHE_DIR, 'rrf-sweep');
mkdirSync(RESULTS_DIR, { recursive: true });

// Sweep grid
const K_GRID = [10, 20, 40, 60, 100];
const ALPHA_GRID = [0.50, 0.60, 0.65, 0.70, 0.80, 1.00];
const TOP_N = 100;
const TRAIN_FOLD_SIZE = 50;

console.log('━'.repeat(60));
console.log(' wellinformed — RRF k + α sweep on cached SciFact');
console.log('━'.repeat(60));
console.log(` Baseline: k=60, α=0.50 → 75.22% NDCG@10 (Phase 25)`);
console.log(` Sweep:    k ∈ {${K_GRID.join(',')}} × α ∈ {${ALPHA_GRID.join(',')}}`);
console.log(` Method:   train on first ${TRAIN_FOLD_SIZE} queries, report on rest`);
console.log('');

// ─── load corpus + queries + qrels ─────────────────────────────────
console.log('[1/5] Loading queries + qrels...');

const loadJsonl = async (path) => {
  const lines = [];
  const rl = createInterface({ input: createReadStream(path) });
  for await (const line of rl) {
    if (line.trim()) lines.push(JSON.parse(line));
  }
  return lines;
};

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
  .map((q) => ({ id: String(q._id), rawText: q.text }));
console.log(`  ${queries.length} test queries, ${[...qrels.values()].reduce((a, b) => a + b.size, 0)} (q,doc) qrels`);

// ─── open DB + sqlite-vec ─────────────────────────────────────────
console.log('[2/5] Opening cached vectors.db...');
const db = new Database(DB_PATH, { readonly: false });  // FTS5 may need write lock for some queries
sqliteVec.load(db);

// Discover the rowid → docId mapping. The sota.db / vectors.db schema stores
// the BEIR docId in a side table. Let's introspect.
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table','view') ORDER BY name").all();
console.log(`  Tables: ${tables.map((t) => t.name).join(', ')}`);

// vec_meta carries (rowid, node_id) typically.
const rowidToId = new Map();
const idToRowid = new Map();
try {
  const rows = db.prepare('SELECT rowid, node_id FROM vec_meta').all();
  for (const r of rows) {
    rowidToId.set(r.rowid, r.node_id);
    idToRowid.set(r.node_id, r.rowid);
  }
  console.log(`  rowid↔docId map: ${rowidToId.size} entries`);
} catch (e) {
  console.error(`  vec_meta read failed: ${e.message}`);
  process.exit(1);
}

// ─── embedder ──────────────────────────────────────────────────────
console.log('[3/5] Booting Rust embed_server (bge-base)...');
const embedder = rustSubprocessEmbedder({ model: 'bge-base', dim: 768 });

// ─── prepared statements ───────────────────────────────────────────
const denseStmt = db.prepare(
  `SELECT v.rowid, v.distance FROM vec_nodes v WHERE v.embedding MATCH ? AND k = ? ORDER BY v.distance`
);
const bm25Stmt = db.prepare(
  `SELECT rowid, bm25(fts_docs, 0.9, 0.4) AS rank
     FROM fts_docs
     WHERE fts_docs MATCH ?
     ORDER BY rank
     LIMIT ?`
);

// Lucene EnglishAnalyzer stopwords (matches bench-beir-sota.mjs)
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

const toVecBuffer = (vec) => {
  const buf = Buffer.alloc(vec.length * 4);
  for (let i = 0; i < vec.length; i++) buf.writeFloatLE(vec[i], i * 4);
  return buf;
};

// ─── pass 1: collect dense + BM25 ranks per query ──────────────────
console.log(`[4/5] Embedding ${queries.length} queries + caching ranks...`);
const cached = []; // { qid, denseRanks: [{docId, rank}], bm25Ranks: [{docId, rank}] }
const tStart = Date.now();
for (let i = 0; i < queries.length; i++) {
  const q = queries[i];
  const vRes = await embedder.embed('search_query: ' + q.rawText);
  if (vRes.isErr()) { console.error(`  embed failed q${q.id}`); continue; }
  const vecBuf = toVecBuffer(vRes.value);
  const denseRows = denseStmt.all(vecBuf, TOP_N);
  const denseRanks = denseRows.map((r, idx) => ({ docId: rowidToId.get(r.rowid), rank: idx }));

  let bm25Ranks = [];
  try {
    const ftsQ = sanitizeForFts5(q.rawText);
    if (ftsQ) {
      const bm25Rows = bm25Stmt.all(ftsQ, TOP_N);
      bm25Ranks = bm25Rows.map((r, idx) => ({ docId: rowidToId.get(r.rowid), rank: idx }));
    }
  } catch {}

  cached.push({ qid: q.id, denseRanks, bm25Ranks });
  if ((i + 1) % 50 === 0) {
    const elapsed = (Date.now() - tStart) / 1000;
    process.stdout.write(`\r  ${i + 1}/${queries.length} (${(i / elapsed).toFixed(1)} q/sec)   `);
  }
}
console.log(`\n  cached ranks for ${cached.length} queries in ${((Date.now() - tStart) / 1000).toFixed(1)}s`);

embedder.shutdown?.();

// ─── metric ────────────────────────────────────────────────────────
const log2 = (x) => Math.log(x) / Math.LN2;
const ndcg10 = (rankedDocIds, relMap) => {
  let dcg = 0;
  const topK = rankedDocIds.slice(0, 10);
  for (let i = 0; i < topK.length; i++) {
    const r = relMap.has(topK[i]) ? 1 : 0;
    dcg += r / log2(i + 2);
  }
  const numRel = Math.min(relMap.size, 10);
  let idcg = 0;
  for (let i = 0; i < numRel; i++) idcg += 1 / log2(i + 2);
  return idcg > 0 ? dcg / idcg : 0;
};

// ─── pass 2: sweep (k, α) on cached ranks ──────────────────────────
console.log('[5/5] Sweeping (k, α)...');
const fuseRanked = (denseRanks, bm25Ranks, k, alpha) => {
  const map = new Map();
  for (const d of denseRanks) {
    map.set(d.docId, { docId: d.docId, denseRank: d.rank, bm25Rank: null });
  }
  for (const b of bm25Ranks) {
    const e = map.get(b.docId);
    if (e) e.bm25Rank = b.rank;
    else map.set(b.docId, { docId: b.docId, denseRank: null, bm25Rank: b.rank });
  }
  return [...map.values()]
    .map((c) => {
      let score = 0;
      if (c.denseRank !== null) score += alpha / (k + c.denseRank + 1);
      if (c.bm25Rank !== null) score += (1 - alpha) / (k + c.bm25Rank + 1);
      return { docId: c.docId, score };
    })
    .sort((a, b) => b.score - a.score)
    .map((c) => c.docId);
};

const trainFold = cached.slice(0, TRAIN_FOLD_SIZE);
const testFold = cached.slice(TRAIN_FOLD_SIZE);

const evalFold = (fold, k, alpha) => {
  let sum = 0;
  for (const q of fold) {
    const ranked = fuseRanked(q.denseRanks, q.bm25Ranks, k, alpha);
    sum += ndcg10(ranked, qrels.get(q.qid));
  }
  return sum / fold.length;
};

// Baseline (k=60, α=0.5) on test fold for comparison.
const baselineTest = evalFold(testFold, 60, 0.5);
console.log(`  baseline (k=60,α=0.5) on test fold: ${(baselineTest * 100).toFixed(2)}%`);

const grid = [];
for (const k of K_GRID) {
  for (const alpha of ALPHA_GRID) {
    const trainNdcg = evalFold(trainFold, k, alpha);
    const testNdcg = evalFold(testFold, k, alpha);
    grid.push({ k, alpha, train: trainNdcg, test: testNdcg });
  }
}

// Sort by train; report best.
grid.sort((a, b) => b.train - a.train);
console.log('\nTop-10 cells by TRAIN NDCG@10:');
console.log('  rank  k    α     train     test     Δ_test_vs_baseline');
for (let i = 0; i < Math.min(10, grid.length); i++) {
  const g = grid[i];
  const delta = (g.test - baselineTest) * 100;
  console.log(`  ${(i + 1).toString().padStart(2)}    ${g.k.toString().padStart(3)}  ${g.alpha.toFixed(2)}  ${(g.train * 100).toFixed(2)}%  ${(g.test * 100).toFixed(2)}%  ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}pt`);
}

const bestTrain = grid[0];
console.log(`\nBest by TRAIN: k=${bestTrain.k}, α=${bestTrain.alpha} → train ${(bestTrain.train * 100).toFixed(2)}%, test ${(bestTrain.test * 100).toFixed(2)}%`);
console.log(`Δ vs baseline (k=60, α=0.5) on test: ${((bestTrain.test - baselineTest) * 100 >= 0 ? '+' : '') + ((bestTrain.test - baselineTest) * 100).toFixed(2)}pt`);

// Also report best on full set (for reporting only — not the gate)
const fullEval = grid.map((g) => ({ ...g, full: (TRAIN_FOLD_SIZE * g.train + (cached.length - TRAIN_FOLD_SIZE) * g.test) / cached.length }));
fullEval.sort((a, b) => b.full - a.full);
const bestFull = fullEval[0];
console.log(`\nBest by FULL (informational): k=${bestFull.k}, α=${bestFull.alpha} → ${(bestFull.full * 100).toFixed(2)}%`);

const result = {
  dataset: 'scifact',
  baseline: { k_rrf: 60, alpha: 0.5, ndcg_at_10: baselineTest, on: 'test_fold' },
  best_by_train: bestTrain,
  best_by_full: bestFull,
  grid: grid,
  train_fold_size: TRAIN_FOLD_SIZE,
  test_fold_size: cached.length - TRAIN_FOLD_SIZE,
  timestamp: new Date().toISOString(),
};
const outPath = join(RESULTS_DIR, 'sweep-results.json');
writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`\nResults: ${outPath}`);

db.close();
