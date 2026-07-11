#!/usr/bin/env node
/**
 * reindex-bge — re-embed the existing graph's stored text with bge-base into a
 * NEW 768-dim index, leaving the live MiniLM vectors.db untouched. The energy
 * gate fails on MiniLM (AUC ~0.41-0.51) but bge re-scoring separates at 0.968
 * (research/proof/, bench-energy-bge.mjs) — this builds the bge index so the gate
 * can be validated + re-fit end-to-end on the live ask path.
 *
 * Source text: vec_meta.raw_text from ~/.folklore/vectors.db (18,077 populated).
 * Output: ~/.folklore/vectors-bge.db (override with BGE_DB).
 *
 *   node scripts/reindex-bge.mjs [--limit N]
 *   # then validate: FOLKLORE_HOME=<home-with-bge-db> FOLKLORE_EMBEDDER_MODEL=bge-base node bench/bench-energy-gate.mjs
 */
import Database from 'better-sqlite3';
import * as vec from 'sqlite-vec';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { openSqliteVectorIndex } from '../dist/infrastructure/vector-index.js';
import { xenovaEmbedder } from '../dist/infrastructure/embedders.js';

const HOME = process.env.FOLKLORE_HOME || join(homedir(), '.folklore');
const SRC = join(HOME, 'vectors.db');
const DST = process.env.BGE_DB || join(HOME, 'vectors-bge.db');
const av = process.argv.slice(2);
const LIMIT = av.includes('--limit') ? Number(av[av.indexOf('--limit') + 1]) : Infinity;

const sdb = new Database(SRC, { readonly: true });
vec.load(sdb);
const rows = sdb
  .prepare('SELECT node_id, wing, raw_text FROM vec_meta WHERE raw_text IS NOT NULL AND LENGTH(raw_text) > 0')
  .all();
sdb.close();
const todo = rows.slice(0, LIMIT);
console.log(`reindex-bge: ${rows.length} source rows with text; embedding ${todo.length} -> ${DST}`);

const idxR = await openSqliteVectorIndex({ path: DST, dim: 768 });
if (idxR.isErr()) { console.error('open dst index failed:', idxR.error); process.exit(1); }
const idx = idxR.value;
const embedder = xenovaEmbedder({ model: 'Xenova/bge-base-en-v1.5', dim: 768 });

const t0 = Date.now();
let n = 0, ok = 0, fail = 0;
for (const r of todo) {
  const ev = await embedder.embed(r.raw_text);
  if (ev.isErr && ev.isErr()) { fail++; n++; continue; }
  const up = await idx.upsert({ node_id: r.node_id, wing: r.wing || undefined, vector: ev.value, raw_text: r.raw_text });
  if (up.isErr && up.isErr()) fail++; else ok++;
  n++;
  if (n % 100 === 0 || n === todo.length) {
    const rate = n / ((Date.now() - t0) / 1000);
    const eta = ((todo.length - n) / rate / 60).toFixed(1);
    process.stderr.write(`\r  ${n}/${todo.length}  ok=${ok} fail=${fail}  ${rate.toFixed(1)}/s  eta ${eta}m   `);
  }
}
console.log(`\nreindex-bge: done — ${ok} embedded, ${fail} failed, ${((Date.now() - t0) / 1000).toFixed(0)}s -> ${DST}`);
