#!/usr/bin/env node
/**
 * ArguAna dense-only gate — Round 2 strategic re-target attack.
 *
 * BENCH-v2.md §2e measured ArguAna hybrid at 43.97% NDCG@10 with
 * R@10=86.42%. The high recall confirms gold counter-arguments ARE
 * retrieved by the dense pass; BM25 then reshuffles them out of the
 * top-10 by promoting lexically-similar (same-side) arguments. The
 * fix is mechanically obvious: turn off BM25 for counter-argument
 * tasks. Published nomic dense-only ceiling on ArguAna is ~50.4%,
 * suggesting +6.4pt of measurable headroom is sitting in the cached
 * vectors.db waiting to be claimed.
 *
 * This script:
 *   1. Loads the cached ArguAna bge-base index (no re-embed)
 *   2. For each of 1,406 queries: Rust embed → dense-only top-10
 *   3. Computes NDCG@10 + R@5 + R@10 + MRR
 *   4. Compares to the §2e hybrid baseline (43.97%)
 *
 * Pure: zero new code in production, zero re-indexing. Just a
 * read-only re-query of the cached corpus.
 *
 * Gate: PASS if NDCG@10 ≥ 49% (= +5pt over baseline). The published
 * nomic ceiling at 50.4% is the upper bound; bge-base may sit slightly
 * lower or higher.
 */

import { existsSync, mkdirSync, createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createInterface } from 'node:readline';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

import { rustSubprocessEmbedder } from '../dist/infrastructure/embedders.js';

const CACHE_DIR = join(homedir(), '.wellinformed', 'bench');
const DB_PATH = join(CACHE_DIR, 'arguana__rust-via-ts__bge-base', 'vectors.db');
const DATASET_DIR = join(CACHE_DIR, 'arguana', 'arguana');
const QUERIES_JSONL = join(DATASET_DIR, 'queries.jsonl');
const QRELS_TSV = join(DATASET_DIR, 'qrels', 'test.tsv');
const RESULTS_DIR = join(CACHE_DIR, 'arguana-dense-only');
mkdirSync(RESULTS_DIR, { recursive: true });

console.log('━'.repeat(60));
console.log(' wellinformed — ArguAna dense-only re-target gate');
console.log('━'.repeat(60));
console.log(' Baseline (BENCH §2e hybrid):  43.97% NDCG@10');
console.log(' Published nomic dense ceiling: ~50.4%');
console.log(' Gate (PASS):                   ≥49.0% NDCG@10');
console.log(' Pipeline:                       cached bge-base × dense-only top-10');
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
console.log(`[1/3] ${queries.length} queries, ${[...qrels.values()].reduce((a, b) => a + b.size, 0)} qrels`);

const db = new Database(DB_PATH, { readonly: false });
sqliteVec.load(db);

const rowidToId = new Map();
const rows = db.prepare('SELECT rowid, node_id FROM vec_meta').all();
for (const r of rows) rowidToId.set(r.rowid, r.node_id);
console.log(`  rowid↔docId: ${rowidToId.size} entries`);

console.log('[2/3] Booting Rust embedder...');
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
const ndcgK = (rankedIds, relMap, k) => {
  let dcg = 0;
  for (let i = 0; i < Math.min(rankedIds.length, k); i++) {
    if (relMap.has(rankedIds[i])) dcg += 1 / log2(i + 2);
  }
  const numRel = Math.min(relMap.size, k);
  let idcg = 0;
  for (let i = 0; i < numRel; i++) idcg += 1 / log2(i + 2);
  return idcg > 0 ? dcg / idcg : 0;
};
const recallK = (rankedIds, relMap, k) => {
  let hits = 0;
  for (let i = 0; i < Math.min(rankedIds.length, k); i++) {
    if (relMap.has(rankedIds[i])) hits++;
  }
  return relMap.size > 0 ? hits / relMap.size : 0;
};
const mrrOne = (rankedIds, relMap) => {
  for (let i = 0; i < rankedIds.length; i++) {
    if (relMap.has(rankedIds[i])) return 1 / (i + 1);
  }
  return 0;
};

console.log(`[3/3] Running ${queries.length} queries dense-only (k=10)...`);
const m = { ndcg: [], r5: [], r10: [], mrr: [] };
const tStart = Date.now();
let processed = 0;

for (const q of queries) {
  // BGE convention: queries get the "search_query: " prefix (matching
  // the original ArguAna bench setup — see bench-beir-rust.mjs).
  const vRes = await embedder.embed('search_query: ' + q.rawText);
  if (vRes.isErr()) continue;
  const denseRows = denseStmt.all(toVecBuffer(vRes.value), 10);
  const ranked = denseRows.map((r) => rowidToId.get(r.rowid));
  const rel = qrels.get(q.id);
  m.ndcg.push(ndcgK(ranked, rel, 10));
  m.r5.push(recallK(ranked, rel, 5));
  m.r10.push(recallK(ranked, rel, 10));
  m.mrr.push(mrrOne(ranked, rel));
  processed++;
  if (processed % 100 === 0) {
    const elapsed = (Date.now() - tStart) / 1000;
    process.stdout.write(`\r  ${processed}/${queries.length} (${(processed / elapsed).toFixed(1)} q/s)   `);
  }
}

embedder.shutdown?.();
db.close();

const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const ndcg = mean(m.ndcg);
const r5 = mean(m.r5);
const r10 = mean(m.r10);
const mrr = mean(m.mrr);

const baseline = 0.4397003912231444;
const delta = (ndcg - baseline) * 100;
const PASS = ndcg >= 0.49;

console.log(`\n\nResults (n=${processed}):`);
console.log(`  NDCG@10:  ${(ndcg * 100).toFixed(2)}%   (Δ vs hybrid baseline: ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}pt)`);
console.log(`  R@5:      ${(r5 * 100).toFixed(2)}%`);
console.log(`  R@10:     ${(r10 * 100).toFixed(2)}%`);
console.log(`  MRR:      ${mrr.toFixed(4)}`);
console.log(`  Verdict:  ${PASS ? '✓ PASS (≥49% gate)' : '✗ NULL'}`);

const result = {
  dataset: 'BeIR/arguana',
  attack: 'dense-only re-target (turn off BM25 for counter-argument)',
  baseline_hybrid_ndcg10: baseline,
  dense_only_ndcg10: ndcg,
  delta_pt: delta,
  metrics: { ndcg_at_10: ndcg, recall_at_5: r5, recall_at_10: r10, mrr },
  query_count: processed,
  gate_pass: PASS,
  gate_threshold: 0.49,
  timestamp: new Date().toISOString(),
};
const outPath = join(RESULTS_DIR, 'results.json');
writeFileSync(outPath, JSON.stringify(result, null, 2));
console.log(`\nResult: ${outPath}`);
