#!/usr/bin/env node
// Wave 4 gate test — does ROOM ROUTING beat flat retrieval on a multi-topic corpus?
//
// Tests whether wellinformed's room architecture gives a measurable retrieval lift
// over flat hybrid retrieval. If oracle routing doesn't beat flat by ≥3 points,
// rooms are cosmetic and we stop engineering. If it does, we proceed to learned
// routing (RouterRetriever-style) and tunnel-based reranking.
//
// Usage:
//   node scripts/bench-room-routing.mjs \
//     --datasets-dir ~/.wellinformed/bench/cqadupstack/cqadupstack \
//     --rooms mathematica,webmasters,android \
//     --model Xenova/all-MiniLM-L6-v2 --dim 384
//
// Experiments:
//   0. Flat hybrid (dense + BM25 RRF) over pooled multi-room corpus
//   1. Oracle routed (restrict search to the query's source room — upper bound)
//
// Metrics: NDCG@10, MAP@10, Recall@5, Recall@10, MRR, Success@5 — computed once per
// experiment and reported side-by-side with delta.

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

const DATASETS_DIR = getArg('--datasets-dir', join(homedir(), '.wellinformed/bench/cqadupstack/cqadupstack'));
const ROOMS_CSV = getArg('--rooms', 'mathematica,webmasters,android');
const ROOMS = ROOMS_CSV.split(',').map((r) => r.trim()).filter(Boolean);
const MODEL = getArg('--model', 'Xenova/all-MiniLM-L6-v2');
const DIM = parseInt(getArg('--dim', '384'), 10);
const DOC_PREFIX = getArg('--doc-prefix', '');
const QUERY_PREFIX = getArg('--query-prefix', '');
const DENSE_K = parseInt(getArg('--dense-k', '100'), 10);
const BM25_K = parseInt(getArg('--bm25-k', '100'), 10);
const FINAL_K = parseInt(getArg('--final-k', '10'), 10);
const RRF_K = 60;
const BATCH_SIZE = parseInt(getArg('--batch', '32'), 10);

const CACHE_ROOT = join(homedir(), '.wellinformed', 'bench');
const MODEL_SLUG = MODEL.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
const ROOMS_SLUG = ROOMS.join('-');
const CACHE_DIR = join(CACHE_ROOT, `rooms__${ROOMS_SLUG}__${MODEL_SLUG}`);
const DB_PATH = join(CACHE_DIR, 'rooms.db');

// ─── banner ──────────────────────────────────────────────────────
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' wellinformed Wave 4 — Room Routing Gate Test');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` Rooms:   ${ROOMS.join(', ')}`);
console.log(` Model:   ${MODEL} (${DIM} dim)`);
console.log(` Pipeline: dense + BM25 hybrid RRF (flat vs oracle-routed)`);
console.log('');

// ─── step 1: load each room's corpus, queries, qrels ────────────
mkdirSync(CACHE_DIR, { recursive: true });
console.log('[1/5] Loading rooms...');

const loadJsonl = async (path) => {
  const lines = [];
  const rl = createInterface({ input: createReadStream(path) });
  for await (const line of rl) if (line.trim()) lines.push(JSON.parse(line));
  return lines;
};

// Each corpus doc is keyed globally as `${room}::${docId}` so that rooms with
// colliding doc IDs (e.g. sequential "1", "2", ...) don't clobber each other
// in the pooled DB.
const corpusPooled = [];
const queriesPooled = [];
// qrels: queryGlobalId -> Map<docGlobalId, score>
const qrels = new Map();

for (const room of ROOMS) {
  const roomDir = join(DATASETS_DIR, room);
  if (!existsSync(join(roomDir, 'corpus.jsonl'))) {
    console.error(`  [fail] ${room}: corpus.jsonl not found under ${roomDir}`);
    process.exit(1);
  }
  const corpusRaw = await loadJsonl(join(roomDir, 'corpus.jsonl'));
  const queriesRaw = await loadJsonl(join(roomDir, 'queries.jsonl'));
  const qrelsText = readFileSync(join(roomDir, 'qrels', 'test.tsv'), 'utf8');

  for (const r of corpusRaw) {
    corpusPooled.push({
      globalId: `${room}::${String(r._id)}`,
      localId: String(r._id),
      room,
      rawText: (r.title ? r.title + '. ' : '') + (r.text ?? ''),
      embedText: DOC_PREFIX + ((r.title ? r.title + '. ' : '') + (r.text ?? '')),
    });
  }

  const perRoomQrels = new Map();
  for (const line of qrelsText.split('\n').slice(1)) {
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [qid, docId, score] = parts;
    if (parseInt(score, 10) > 0) {
      const qGlobal = `${room}::${qid}`;
      const dGlobal = `${room}::${docId}`;
      if (!perRoomQrels.has(qGlobal)) perRoomQrels.set(qGlobal, new Map());
      perRoomQrels.get(qGlobal).set(dGlobal, parseInt(score, 10));
    }
  }
  for (const [qid, rels] of perRoomQrels.entries()) qrels.set(qid, rels);

  const testQids = new Set(perRoomQrels.keys());
  const roomQueries = [];
  for (const q of queriesRaw) {
    const qGlobal = `${room}::${String(q._id)}`;
    if (!testQids.has(qGlobal)) continue;
    roomQueries.push({
      globalId: qGlobal,
      room,
      rawText: q.text,
      embedText: QUERY_PREFIX + q.text,
    });
  }
  queriesPooled.push(...roomQueries);

  console.log(`  ${room.padEnd(15)} ${String(corpusRaw.length).padStart(6)} passages · ${String(roomQueries.length).padStart(5)} test queries · ${String(perRoomQrels.size).padStart(5)} qrels`);
}

console.log(`  ─────────────────────────────────────────`);
console.log(`  pooled ${' '.repeat(8)} ${String(corpusPooled.length).padStart(6)} passages · ${String(queriesPooled.length).padStart(5)} test queries`);

// ─── step 2: open DB with room-aware schema ─────────────────────
const CACHE_OK = has('--no-cache') ? false : existsSync(DB_PATH);
console.log('[2/5] Opening DB' + (CACHE_OK ? ' — cached' : ' — fresh'));
if (!CACHE_OK && existsSync(DB_PATH)) {
  spawnSync('rm', ['-f', DB_PATH, DB_PATH + '-shm', DB_PATH + '-wal']);
}

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
      rowid    INTEGER PRIMARY KEY,
      doc_id   TEXT UNIQUE NOT NULL,
      room     TEXT NOT NULL,
      raw_text TEXT NOT NULL
    );
    CREATE INDEX idx_doc_meta_room ON doc_meta(room);
    CREATE VIRTUAL TABLE fts_docs USING fts5(
      text,
      tokenize='porter unicode61 remove_diacritics 2'
    );
  `);
}

const insertMeta = db.prepare('INSERT INTO doc_meta(rowid, doc_id, room, raw_text) VALUES (?, ?, ?, ?)');
const insertVec = db.prepare('INSERT INTO vec_nodes(rowid, embedding) VALUES (?, ?)');
const insertFts = db.prepare('INSERT INTO fts_docs(rowid, text) VALUES (?, ?)');

// ─── step 3: embed + index ──────────────────────────────────────
const embedder = xenovaEmbedder({ model: MODEL, dim: DIM });
const idToRowid = new Map();
const rowidToId = new Map();
const rowidToRoom = new Map();
const toVecBuffer = (v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength);

let indexElapsedMs = 0;
if (CACHE_OK) {
  console.log('[3/5] Loading cached index...');
  const rows = db.prepare('SELECT rowid, doc_id, room FROM doc_meta').all();
  for (const r of rows) {
    idToRowid.set(r.doc_id, r.rowid);
    rowidToId.set(r.rowid, r.doc_id);
    rowidToRoom.set(r.rowid, r.room);
  }
  console.log(`  loaded ${rows.length} cached docs`);
} else {
  console.log(`[3/5] Embedding corpus (batch=${BATCH_SIZE}) + indexing...`);
  const tIdx = Date.now();
  let done = 0;

  for (let i = 0; i < corpusPooled.length; i += BATCH_SIZE) {
    const batch = corpusPooled.slice(i, i + BATCH_SIZE);
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
        idToRowid.set(batch[j].globalId, rowidNum);
        rowidToId.set(rowidNum, batch[j].globalId);
        rowidToRoom.set(rowidNum, batch[j].room);
        insertMeta.run(rowidNum, batch[j].globalId, batch[j].room, batch[j].rawText);
        insertVec.run(rowid, toVecBuffer(vectors[j]));
        insertFts.run(rowidNum, batch[j].rawText);
      }
    });
    insertTx();
    done += batch.length;
    if (done % 256 === 0 || done >= corpusPooled.length) {
      const rate = (done / ((Date.now() - tIdx) / 1000)).toFixed(0);
      process.stdout.write(`\r  indexed ${done}/${corpusPooled.length} (${rate} docs/sec)   `);
    }
  }
  indexElapsedMs = Date.now() - tIdx;
  console.log(`\n  indexing done in ${(indexElapsedMs / 1000).toFixed(1)}s`);
}

// ─── step 4: query runners ─────────────────────────────────────
console.log('[4/5] Running experiments...');

// Prepared statements. We use two variants of the dense search — global and
// per-room — plus BM25 with optional per-room filter via WHERE on doc_meta.
//
// sqlite-vec's vec0 virtual table does not support WHERE filtering directly,
// so per-room dense search uses an overfetch + filter pattern: ask for
// DENSE_K * N candidates globally and keep the ones whose rowid is in the
// target room. This is the same pattern wellinformed's production
// searchByRoom uses (via roomSearchOverfetch).
const denseStmt = db.prepare(
  `SELECT v.rowid, v.distance FROM vec_nodes v WHERE v.embedding MATCH ? AND k = ? ORDER BY v.distance`
);
const denseOverfetchStmt = db.prepare(
  `SELECT v.rowid, v.distance FROM vec_nodes v WHERE v.embedding MATCH ? AND k = ? ORDER BY v.distance`
);
const bm25FlatStmt = db.prepare(
  `SELECT rowid, rank FROM fts_docs WHERE fts_docs MATCH ? ORDER BY rank LIMIT ?`
);
// BM25 room filter using JOIN onto doc_meta
const bm25RoomStmt = db.prepare(
  `SELECT f.rowid, f.rank
     FROM fts_docs f
     JOIN doc_meta m ON m.rowid = f.rowid
    WHERE fts_docs MATCH ? AND m.room = ?
    ORDER BY f.rank LIMIT ?`
);

const sanitizeForFts5 = (q) =>
  q.split(/\s+/).filter((t) => /\w/.test(t)).map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ');

// Single-query hybrid — returns top-FINAL_K candidates. routeRoom=null for flat,
// or a specific room for oracle routing. When routed, we overfetch on dense
// (DENSE_K * ROOMS.length) and filter to the target room client-side.
const runHybrid = async (q, routeRoom) => {
  const vRes = await embedder.embed(q.embedText);
  if (vRes.isErr()) return [];
  const vecBuf = toVecBuffer(vRes.value);

  // Dense stage
  let denseRows;
  if (routeRoom) {
    const overK = DENSE_K * ROOMS.length; // overfetch then filter
    const all = denseOverfetchStmt.all(vecBuf, overK);
    denseRows = all.filter((r) => rowidToRoom.get(r.rowid) === routeRoom).slice(0, DENSE_K);
  } else {
    denseRows = denseStmt.all(vecBuf, DENSE_K);
  }
  const denseRanked = denseRows.map((r, idx) => ({
    docId: rowidToId.get(r.rowid),
    denseRank: idx,
    distance: r.distance,
  }));

  // BM25 stage
  let bm25Rows = [];
  try {
    const ftsQuery = sanitizeForFts5(q.rawText);
    if (ftsQuery) {
      bm25Rows = routeRoom
        ? bm25RoomStmt.all(ftsQuery, routeRoom, BM25_K)
        : bm25FlatStmt.all(ftsQuery, BM25_K);
    }
  } catch {
    bm25Rows = [];
  }

  // RRF fusion
  const byDoc = new Map();
  for (const c of denseRanked) byDoc.set(c.docId, { ...c, bm25Rank: null });
  bm25Rows.forEach((r, idx) => {
    const id = rowidToId.get(r.rowid);
    const existing = byDoc.get(id);
    if (existing) existing.bm25Rank = idx;
    else byDoc.set(id, { docId: id, denseRank: null, bm25Rank: idx });
  });

  const fused = [...byDoc.values()]
    .map((c) => {
      let score = 0;
      if (c.denseRank !== null) score += 1 / (RRF_K + c.denseRank + 1);
      if (c.bm25Rank !== null) score += 1 / (RRF_K + c.bm25Rank + 1);
      return { ...c, rrfScore: score };
    })
    .sort((a, b) => b.rrfScore - a.rrfScore);

  return fused.slice(0, FINAL_K);
};

// Run each experiment over the full query pool
const runExperiment = async (label, routeByRoom) => {
  console.log(`  [${label}] running ${queriesPooled.length} queries...`);
  const results = new Map();
  const tStart = Date.now();
  for (let i = 0; i < queriesPooled.length; i++) {
    const q = queriesPooled[i];
    const route = routeByRoom ? q.room : null;
    const ranked = await runHybrid(q, route);
    results.set(q.globalId, ranked);
    if ((i + 1) % 100 === 0 || i === queriesPooled.length - 1) {
      process.stdout.write(`\r    ${i + 1}/${queriesPooled.length}   `);
    }
  }
  console.log(`\n    done in ${((Date.now() - tStart) / 1000).toFixed(1)}s`);
  return results;
};

const flatResults = await runExperiment('FLAT', false);
const oracleResults = await runExperiment('ORACLE-ROUTED', true);

db.close();

// ─── step 5: metrics ─────────────────────────────────────────────
console.log('\n[5/5] Computing metrics...\n');

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
const successK = (ranked, rel, k) => {
  const topK = ranked.slice(0, k);
  for (const r of topK) if (rel.has(r.docId)) return 1;
  return 0;
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
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const computeMetrics = (results) => {
  const m = { ndcg10: [], map10: [], r5: [], r10: [], mrr: [], success5: [] };
  // Also per-room breakdown
  const perRoom = new Map();
  for (const room of ROOMS) {
    perRoom.set(room, { ndcg10: [], r5: [], success5: [] });
  }
  for (const q of queriesPooled) {
    const ranked = results.get(q.globalId) ?? [];
    const rel = qrels.get(q.globalId) ?? new Map();
    const n = ndcgK(ranked, rel, 10);
    const r5 = recallK(ranked, rel, 5);
    const r10 = recallK(ranked, rel, 10);
    const ma = mapK(ranked, rel, 10);
    const rr = mrrOne(ranked, rel);
    const s5 = successK(ranked, rel, 5);
    m.ndcg10.push(n);
    m.map10.push(ma);
    m.r5.push(r5);
    m.r10.push(r10);
    m.mrr.push(rr);
    m.success5.push(s5);
    const pr = perRoom.get(q.room);
    pr.ndcg10.push(n);
    pr.r5.push(r5);
    pr.success5.push(s5);
  }
  return {
    ndcg10: mean(m.ndcg10),
    map10: mean(m.map10),
    r5: mean(m.r5),
    r10: mean(m.r10),
    mrr: mean(m.mrr),
    success5: mean(m.success5),
    n: m.ndcg10.length,
    perRoom: Object.fromEntries(
      [...perRoom.entries()].map(([room, xs]) => [
        room,
        { ndcg10: mean(xs.ndcg10), r5: mean(xs.r5), success5: mean(xs.success5), n: xs.ndcg10.length },
      ]),
    ),
  };
};

const flatMetrics = computeMetrics(flatResults);
const oracleMetrics = computeMetrics(oracleResults);

const pct = (x) => (x * 100).toFixed(2) + '%';
const delta = (a, b) => {
  const d = (b - a) * 100;
  const sign = d >= 0 ? '+' : '';
  return `${sign}${d.toFixed(2)}`;
};

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' Wave 4 Gate Test — Flat vs Oracle-Routed Results');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` Rooms: ${ROOMS.join(', ')}`);
console.log(` Corpus: ${corpusPooled.length.toLocaleString()} passages`);
console.log(` Queries: ${queriesPooled.length.toLocaleString()} test queries`);
console.log('');
console.log('                      FLAT          ORACLE-ROUTED    Δ');
console.log(`   NDCG@10:       ${pct(flatMetrics.ndcg10).padStart(8)}      ${pct(oracleMetrics.ndcg10).padStart(8)}     ${delta(flatMetrics.ndcg10, oracleMetrics.ndcg10).padStart(6)}`);
console.log(`   MAP@10:        ${pct(flatMetrics.map10).padStart(8)}      ${pct(oracleMetrics.map10).padStart(8)}     ${delta(flatMetrics.map10, oracleMetrics.map10).padStart(6)}`);
console.log(`   Recall@5:      ${pct(flatMetrics.r5).padStart(8)}      ${pct(oracleMetrics.r5).padStart(8)}     ${delta(flatMetrics.r5, oracleMetrics.r5).padStart(6)}`);
console.log(`   Recall@10:     ${pct(flatMetrics.r10).padStart(8)}      ${pct(oracleMetrics.r10).padStart(8)}     ${delta(flatMetrics.r10, oracleMetrics.r10).padStart(6)}`);
console.log(`   Success@5:     ${pct(flatMetrics.success5).padStart(8)}      ${pct(oracleMetrics.success5).padStart(8)}     ${delta(flatMetrics.success5, oracleMetrics.success5).padStart(6)}`);
console.log(`   MRR:           ${flatMetrics.mrr.toFixed(4).padStart(8)}      ${oracleMetrics.mrr.toFixed(4).padStart(8)}     ${delta(flatMetrics.mrr, oracleMetrics.mrr).padStart(6)}`);
console.log('');
console.log(' Per-room NDCG@10 breakdown:');
for (const room of ROOMS) {
  const f = flatMetrics.perRoom[room];
  const o = oracleMetrics.perRoom[room];
  console.log(`   ${room.padEnd(15)} n=${String(f.n).padStart(4)}  flat=${pct(f.ndcg10).padStart(7)}  oracle=${pct(o.ndcg10).padStart(7)}  Δ=${delta(f.ndcg10, o.ndcg10).padStart(6)}`);
}
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Gate decision
const gateDelta = (oracleMetrics.ndcg10 - flatMetrics.ndcg10) * 100;
console.log('');
if (gateDelta >= 3.0) {
  console.log(` ✓ GATE PASSED — oracle routing beats flat by ${gateDelta.toFixed(2)} NDCG@10 points.`);
  console.log('   Proceed to Expt 2: learned pilot-centroid router.');
} else if (gateDelta >= 1.5) {
  console.log(` ⚠ GATE MARGINAL — oracle routing beats flat by only ${gateDelta.toFixed(2)} points.`);
  console.log('   Decide whether room architecture is worth engineering time.');
} else {
  console.log(` ✗ GATE FAILED — oracle routing beats flat by only ${gateDelta.toFixed(2)} points.`);
  console.log('   Rooms are cosmetic for retrieval. Accept Wave 2 as SOTA and update docs.');
}

// Machine-readable dump
const result = {
  wave: 4,
  experiment: 'room-routing-gate',
  rooms: ROOMS,
  model: MODEL,
  dim: DIM,
  corpus_size: corpusPooled.length,
  query_count: queriesPooled.length,
  flat: flatMetrics,
  oracle_routed: oracleMetrics,
  gate_delta_ndcg10_pts: gateDelta,
  gate_passed: gateDelta >= 3.0,
  timestamp: new Date().toISOString(),
};
writeFileSync(join(CACHE_DIR, 'results.json'), JSON.stringify(result, null, 2));
console.log(`\nResults JSON: ${join(CACHE_DIR, 'results.json')}`);
