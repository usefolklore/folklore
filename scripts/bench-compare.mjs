#!/usr/bin/env node
// Paired-bootstrap significance test between two cached BEIR runs.
//
// Cormack-Clarke 2009 paired bootstrap (SIGIR'09 RRF paper) — also advocated
// by Urbano et al. "Statistical Significance Testing in IR".
//
// Usage:
//   node scripts/bench-compare.mjs <runA.json> <runB.json>
//   node scripts/bench-compare.mjs \
//     ~/.wellinformed/bench/scifact__nomic-ai-nomic-embed-text-v1-5/results.json \
//     ~/.wellinformed/bench/scifact__nomic-ai-nomic-embed-text-v1-5__hybrid/results.json
//
// Both runs must have been produced by bench-beir-sota.mjs ≥ Phase 21 so they
// include per_query_qids + per_query_ndcg10 arrays. Reports delta, 95% CI on
// the delta, and a two-sided p-value.

import { readFileSync } from 'node:fs';

const [pathA, pathB] = process.argv.slice(2);
if (!pathA || !pathB) {
  console.error('usage: node scripts/bench-compare.mjs <runA.json> <runB.json>');
  process.exit(1);
}

const a = JSON.parse(readFileSync(pathA, 'utf8'));
const b = JSON.parse(readFileSync(pathB, 'utf8'));

if (!a.per_query_ndcg10 || !b.per_query_ndcg10) {
  console.error('one or both result files are missing per_query_ndcg10 — re-run with bench-beir-sota.mjs ≥ Phase 21');
  process.exit(1);
}

if (a.dataset !== b.dataset) {
  console.error(`dataset mismatch: ${a.dataset} vs ${b.dataset}`);
  process.exit(1);
}

// Align by qid in case query order differs (it shouldn't, but be safe).
const aMap = new Map();
for (let i = 0; i < a.per_query_qids.length; i++) {
  aMap.set(a.per_query_qids[i], a.per_query_ndcg10[i]);
}
const aligned = { a: [], b: [] };
for (let i = 0; i < b.per_query_qids.length; i++) {
  const qid = b.per_query_qids[i];
  if (aMap.has(qid)) {
    aligned.a.push(aMap.get(qid));
    aligned.b.push(b.per_query_ndcg10[i]);
  }
}

if (aligned.a.length === 0) {
  console.error('no aligned queries between the two runs');
  process.exit(1);
}

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const meanA = mean(aligned.a);
const meanB = mean(aligned.b);

// Cormack-Clarke 2009 paired bootstrap, 10,000 resamples
const N_BOOTSTRAP = 10000;
const len = aligned.a.length;
const deltas = new Float64Array(N_BOOTSTRAP);
for (let s = 0; s < N_BOOTSTRAP; s++) {
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < len; i++) {
    const idx = Math.floor(Math.random() * len);
    sumA += aligned.a[idx];
    sumB += aligned.b[idx];
  }
  deltas[s] = (sumB - sumA) / len;
}
const sortedDeltas = Array.from(deltas).sort((x, y) => x - y);
const ciLow = sortedDeltas[Math.floor(N_BOOTSTRAP * 0.025)];
const ciHigh = sortedDeltas[Math.floor(N_BOOTSTRAP * 0.975)];

let pleq = 0;
let pgeq = 0;
for (let s = 0; s < N_BOOTSTRAP; s++) {
  if (deltas[s] <= 0) pleq++;
  if (deltas[s] >= 0) pgeq++;
}
const pValue = 2 * Math.min(pleq, pgeq) / N_BOOTSTRAP;

const fmtPct = (x) => (x * 100).toFixed(2) + '%';
const fmtDelta = (x) => {
  const v = (x * 100).toFixed(2);
  return x >= 0 ? `+${v}` : v;
};

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' Paired Bootstrap Significance Test');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` Dataset:    ${a.dataset}`);
console.log(` Run A:      ${a.model}${a.hybrid ? ' + hybrid' : ''}${a.rerank ? ' + rerank' : ''}`);
console.log(` Run B:      ${b.model}${b.hybrid ? ' + hybrid' : ''}${b.rerank ? ' + rerank' : ''}`);
console.log(` Queries:    ${aligned.a.length} (paired, aligned by qid)`);
console.log('');
console.log(` NDCG@10 A:  ${fmtPct(meanA)}`);
console.log(` NDCG@10 B:  ${fmtPct(meanB)}`);
console.log(` Delta:      ${fmtDelta(meanB - meanA)} pts`);
console.log(` 95% CI:     [${fmtDelta(ciLow)}, ${fmtDelta(ciHigh)}] pts`);
console.log(` p-value:    ${pValue.toFixed(4)} (two-sided, ${N_BOOTSTRAP.toLocaleString()} resamples)`);
console.log('');
const sig = pValue < 0.05 && (ciLow > 0 || ciHigh < 0);
console.log(` Result:     ${sig ? '✓ SIGNIFICANT (p < 0.05, CI excludes 0)' : '✗ NOT significant at α=0.05'}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
