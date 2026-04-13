#!/usr/bin/env node
// Warm benchmark — everything runs in a single Node process so we measure
// steady-state performance (no cold-start overhead). This is the realistic
// number for the daemon + MCP server path.

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { homedir } from 'node:os';
import { join } from 'node:path';

const stats = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  const sum = s.reduce((a, b) => a + b, 0);
  return {
    n: s.length,
    mean: sum / s.length,
    p50: s[Math.floor(s.length * 0.5)],
    p95: s[Math.floor(s.length * 0.95)],
    p99: s[Math.floor(s.length * 0.99)],
    min: s[0],
    max: s[s.length - 1],
  };
};

const now = () => Number(process.hrtime.bigint() / 1000000n);

// ─── open the real DBs ─────────────────────────────────────────
const home = process.env.WELLINFORMED_HOME ?? join(homedir(), '.wellinformed');

console.log('━━━━ Warm-state benchmark (single-process, no cold-start) ━━━━\n');

// ─── 1. Code graph search (SQLite LIKE) ─────────────────────────
console.log('1. Code graph search — 1000 iterations each');
const codedb = new Database(join(home, 'code-graph.db'), { readonly: true });
const stmt = codedb.prepare(
  "SELECT id, kind, name, file_path, start_line FROM code_nodes WHERE name LIKE ? LIMIT 20"
);

const runSearch = (pattern) => {
  const samples = [];
  // warmup
  for (let i = 0; i < 10; i++) stmt.all(pattern);
  for (let i = 0; i < 1000; i++) {
    const t0 = now();
    const _ = stmt.all(pattern);
    samples.push(now() - t0);
  }
  return stats(samples);
};

for (const [label, pattern] of [
  ['exact  "%createNode%"', '%createNode%'],
  ['broad  "%run%"', '%run%'],
  ['broad  "%node%"', '%node%'],
  ['noop   "%zzzqqq%"', '%zzzqqq%'],
  ['prefix "parse%"', 'parse%'],
]) {
  const s = runSearch(pattern);
  console.log(`  ${label.padEnd(25)} p50=${s.p50.toFixed(3)}ms  p95=${s.p95.toFixed(3)}ms  p99=${s.p99.toFixed(3)}ms  max=${s.max.toFixed(3)}ms`);
}

// ─── 2. Code graph — kind-filtered ──────────────────────────────
console.log('\n2. Code graph search — with kind filter');
const stmt2 = codedb.prepare(
  "SELECT id, kind, name, file_path FROM code_nodes WHERE name LIKE ? AND kind = ? LIMIT 20"
);
for (const [label, pattern, kind] of [
  ['functions "%parse%"', '%parse%', 'function'],
  ['classes   "%Error%"', '%Error%', 'class'],
  ['imports   "%libp2p%"', '%libp2p%', 'import'],
]) {
  const samples = [];
  for (let i = 0; i < 10; i++) stmt2.all(pattern, kind);
  for (let i = 0; i < 1000; i++) {
    const t0 = now();
    stmt2.all(pattern, kind);
    samples.push(now() - t0);
  }
  const s = stats(samples);
  console.log(`  ${label.padEnd(25)} p50=${s.p50.toFixed(3)}ms  p95=${s.p95.toFixed(3)}ms  p99=${s.p99.toFixed(3)}ms`);
}

// ─── 3. Vector search (ONNX embeddings + sqlite-vec) ────────────
console.log('\n3. Vector search — sqlite-vec k-NN');
const vecdb = new Database(join(home, 'vectors.db'), { readonly: true });
sqliteVec.load(vecdb);

// Load one existing vector to use as the query
const row = vecdb.prepare('SELECT embedding FROM vec_nodes LIMIT 1').get();
if (!row) {
  console.log('  (no vectors indexed — skipping)');
} else {
  const embedding = row.embedding; // Buffer (Float32Array serialized)
  const vstmt = vecdb.prepare(
    'SELECT rowid, distance FROM vec_nodes WHERE embedding MATCH ? AND k = 10 ORDER BY distance'
  );
  for (let i = 0; i < 10; i++) vstmt.all(embedding);
  const samples = [];
  for (let i = 0; i < 500; i++) {
    const t0 = now();
    vstmt.all(embedding);
    samples.push(now() - t0);
  }
  const s = stats(samples);
  console.log(`  vec_nodes k=10  (dim=384)    p50=${s.p50.toFixed(3)}ms  p95=${s.p95.toFixed(3)}ms  p99=${s.p99.toFixed(3)}ms  max=${s.max.toFixed(3)}ms`);

  // Also benchmark with k=50 to see scaling
  const vstmt50 = vecdb.prepare(
    'SELECT rowid, distance FROM vec_nodes WHERE embedding MATCH ? AND k = 50 ORDER BY distance'
  );
  const samples50 = [];
  for (let i = 0; i < 500; i++) {
    const t0 = now();
    vstmt50.all(embedding);
    samples50.push(now() - t0);
  }
  const s50 = stats(samples50);
  console.log(`  vec_nodes k=50  (dim=384)    p50=${s50.p50.toFixed(3)}ms  p95=${s50.p95.toFixed(3)}ms  p99=${s50.p99.toFixed(3)}ms  max=${s50.max.toFixed(3)}ms`);

  // Count total vectors
  const vecCount = vecdb.prepare('SELECT COUNT(*) as n FROM vec_nodes').get().n;
  console.log(`  (over ${vecCount.toLocaleString()} vectors)`);
}

// ─── 4. Graph totals ────────────────────────────────────────────
console.log('\n4. Graph totals');
const codeNodes = codedb.prepare('SELECT COUNT(*) as n FROM code_nodes').get().n;
const codeEdges = codedb.prepare('SELECT COUNT(*) as n FROM code_edges').get().n;
const codebases = codedb.prepare('SELECT COUNT(*) as n FROM codebases').get().n;
const attachments = codedb.prepare('SELECT COUNT(*) as n FROM codebase_rooms').get().n;
console.log(`  code nodes:      ${codeNodes.toLocaleString()}`);
console.log(`  code edges:      ${codeEdges.toLocaleString()}`);
console.log(`  codebases:       ${codebases}`);
console.log(`  room attaches:   ${attachments}`);

codedb.close();
vecdb.close();
console.log('\n━━━━ Done ━━━━');
