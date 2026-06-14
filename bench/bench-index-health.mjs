#!/usr/bin/env node
/**
 * Index-health benchmark.
 *
 * Explains whether user-value misses come from the graph, the vector
 * index, or the current query embedder. It uses stored vectors directly,
 * so it does not call any model.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'eval', 'out');
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};

const GRAPH_PATH = flag('graph', join(homedir(), '.folklore', 'graph.json'));
const SOURCE_HOME = dirname(GRAPH_PATH);
const HOME = flag('home', join('/tmp', 'folklore-user-value-home'));
const SAMPLE = parseInt(flag('sample', '1000'), 10);
const SEED = parseInt(flag('seed', '11'), 10);

const rngFrom = (seed) => {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const copyIfChanged = (src, dst) => {
  if (!existsSync(src)) return;
  const srcStat = statSync(src);
  if (existsSync(dst)) {
    const dstStat = statSync(dst);
    if (dstStat.size === srcStat.size && Math.trunc(dstStat.mtimeMs) >= Math.trunc(srcStat.mtimeMs)) return;
  }
  copyFileSync(src, dst);
};

mkdirSync(HOME, { recursive: true });
for (const name of ['graph.json', 'vectors.db', 'entities.json', 'config.yaml', 'sources.json']) {
  copyIfChanged(join(SOURCE_HOME, name), join(HOME, name));
}
if (existsSync(join(SOURCE_HOME, 'models')) && !existsSync(join(HOME, 'models'))) {
  try { symlinkSync(join(SOURCE_HOME, 'models'), join(HOME, 'models'), 'dir'); } catch { /* best effort */ }
}

const graph = JSON.parse(readFileSync(join(HOME, 'graph.json'), 'utf8'));
const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
const nodeById = new Map(nodes.map((n) => [n.id, n]));

const db = new Database(join(HOME, 'vectors.db'), { readonly: true });
sqliteVec.load(db);
const meta = db.prepare('SELECT rowid, node_id, raw_text FROM vec_meta ORDER BY rowid').all();
const withGraph = meta.filter((m) => nodeById.has(m.node_id));
const withRaw = meta.filter((m) => typeof m.raw_text === 'string' && m.raw_text.length > 0);
const graphWithVector = nodes.filter((n) => meta.some((m) => m.node_id === n.id));
const graphWithTitleInRaw = withRaw.filter((m) => {
  const n = nodeById.get(m.node_id);
  const label = String(n?.label ?? '').replace(/\s*\[chunk\s+\d+\/\d+\]\s*$/i, '').trim();
  return label.length > 0 && String(m.raw_text).toLowerCase().includes(label.toLowerCase().slice(0, 48));
});
const graphWithSourceInRaw = withRaw.filter((m) => {
  const n = nodeById.get(m.node_id);
  const uri = String(n?.source_uri ?? '');
  return uri.length > 0 && String(m.raw_text).includes(uri);
});

const rng = rngFrom(SEED);
const pool = withRaw.filter((m) => {
  const row = db.prepare('SELECT embedding FROM vec_nodes WHERE rowid=?').get(m.rowid);
  return row?.embedding;
});
const sample = [];
const copy = [...pool];
while (copy.length > 0 && sample.length < SAMPLE) {
  const idx = (rng() * copy.length) | 0;
  sample.push(copy.splice(idx, 1)[0]);
}

const search = db.prepare('SELECT rowid, distance FROM vec_nodes WHERE embedding MATCH ? AND k = 10 ORDER BY distance');
const getVec = db.prepare('SELECT embedding FROM vec_nodes WHERE rowid=?');
let selfAt1 = 0, selfAt5 = 0, selfAt10 = 0;
for (const m of sample) {
  const row = getVec.get(m.rowid);
  if (!row?.embedding) continue;
  const hits = search.all(row.embedding).map((h) => h.rowid);
  const idx = hits.indexOf(m.rowid);
  if (idx === 0) selfAt1++;
  if (idx >= 0 && idx < 5) selfAt5++;
  if (idx >= 0 && idx < 10) selfAt10++;
}
db.close();

const summary = {
  graph: { nodes: nodes.length },
  vectors: {
    rows: meta.length,
    rows_with_graph_node: withGraph.length,
    rows_with_raw_text: withRaw.length,
    graph_nodes_with_vector: graphWithVector.length,
    raw_text_coverage: withRaw.length / Math.max(1, meta.length),
    graph_vector_coverage: graphWithVector.length / Math.max(1, nodes.length),
    title_present_in_raw_text_rate: graphWithTitleInRaw.length / Math.max(1, withRaw.length),
    source_uri_present_in_raw_text_rate: graphWithSourceInRaw.length / Math.max(1, withRaw.length),
  },
  stored_vector_self_recall: {
    sample: sample.length,
    at1: selfAt1 / Math.max(1, sample.length),
    at5: selfAt5 / Math.max(1, sample.length),
    at10: selfAt10 / Math.max(1, sample.length),
  },
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'index-health-summary.json'), JSON.stringify(summary, null, 2) + '\n');

console.log(`bench-index-health: graph=${nodes.length} vector_rows=${meta.length} raw_text=${withRaw.length}`);
console.log(`coverage: raw_text=${(summary.vectors.raw_text_coverage * 100).toFixed(1)}% graph_vector=${(summary.vectors.graph_vector_coverage * 100).toFixed(1)}%`);
console.log(`metadata in raw_text: title=${(summary.vectors.title_present_in_raw_text_rate * 100).toFixed(1)}% source_uri=${(summary.vectors.source_uri_present_in_raw_text_rate * 100).toFixed(1)}%`);
console.log(`stored-vector self recall: R@1=${(summary.stored_vector_self_recall.at1 * 100).toFixed(1)}% R@5=${(summary.stored_vector_self_recall.at5 * 100).toFixed(1)}% R@10=${(summary.stored_vector_self_recall.at10 * 100).toFixed(1)}%`);
console.log(`bench-index-health: -> ${join(OUT, 'index-health-summary.json')}`);
