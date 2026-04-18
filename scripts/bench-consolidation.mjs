#!/usr/bin/env node
// Phase 4d — consolidation gate measurement.
//
// Measures two axes on a single room:
//
//   1. Storage shrinkage
//        Before: raw entries in the room (before any consolidation)
//        After:  unconsolidated raw entries + consolidated_memory nodes
//        Ratio:  raw_before / (raw_after + consolidated_count)
//        Gate:   ≥ 5× — the plan's tentpole 10x claim threshold is 10×;
//                5× is pass-worthy, <5× is soft-pass, <2× is null.
//
//   2. Retrieval quality preservation (proxy, no labeled qrels)
//        For each consolidated memory:
//          - Build a query from the first 100 chars of its summary
//          - Search the post-consolidation index
//          - Measure: does the consolidated memory appear in top-10?
//          - Measure: does any source entry still appear (when
//            markEntriesConsolidated hasn't pruned them yet)?
//        The rationale: if consolidation destroyed retrievability of
//        the cluster's topic, the summary query wouldn't find anything.
//        If the consolidated memory ranks top-1, consolidation
//        preserved the signal.
//
// Usage:
//   node scripts/bench-consolidation.mjs <room> [--threshold 0.75]
//     [--min-size 5] [--model qwen2.5:1.5b] [--skip-run]
//
//   --skip-run: assume consolidation already ran, just measure the
//               current graph state (useful for re-measuring without
//               re-running Ollama).
//
// The script does NOT run queries against a BEIR-style labeled qrels;
// that's a v4.1 extension once we have a representative query log.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const args = process.argv.slice(2);
const getArg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const has = (f) => args.includes(f);

const ROOM = args.find((a) => !a.startsWith('--'));
if (!ROOM) {
  console.error('usage: node scripts/bench-consolidation.mjs <room> [flags]');
  process.exit(1);
}
const THRESHOLD = getArg('--threshold', '0.75');
const MIN_SIZE = getArg('--min-size', '5');
const MAX_SIZE = getArg('--max-size', '100');
const MODEL = getArg('--model', 'qwen2.5:1.5b');
const SKIP_RUN = has('--skip-run');

const wiHome = () => process.env.WELLINFORMED_HOME ?? join(homedir(), '.wellinformed');
const graphPath = () => join(wiHome(), 'graph.json');

const loadGraph = () => {
  if (!existsSync(graphPath())) {
    console.error(`graph.json not found at ${graphPath()}`);
    process.exit(1);
  }
  return JSON.parse(readFileSync(graphPath(), 'utf8'));
};

const countRoom = (graph, room) => {
  let raw = 0, consolidatedRaw = 0, consolidatedMemories = 0;
  for (const n of graph.nodes) {
    if (n.room !== room) continue;
    if (n.kind === 'consolidated_memory') consolidatedMemories++;
    else if (n.consolidated_at) consolidatedRaw++;
    else raw++;
  }
  return { raw, consolidatedRaw, consolidatedMemories };
};

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` Phase 4 — consolidation gate: room=${ROOM}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// ─── BEFORE snapshot ────────────────────────────────────────────
const before = countRoom(loadGraph(), ROOM);
const totalBefore = before.raw + before.consolidatedRaw + before.consolidatedMemories;
console.log('');
console.log('[BEFORE]');
console.log(`  raw entries:             ${before.raw}`);
console.log(`  consolidated (raw):      ${before.consolidatedRaw}`);
console.log(`  consolidated_memory:     ${before.consolidatedMemories}`);
console.log(`  total nodes in room:     ${totalBefore}`);

// ─── RUN consolidation ───────────────────────────────────────────
if (!SKIP_RUN) {
  console.log('');
  console.log('[RUN]');
  const startTime = Date.now();
  const result = spawnSync('node', [
    'dist/cli/index.js', 'consolidate', 'run', ROOM,
    '--threshold', THRESHOLD, '--min-size', MIN_SIZE, '--max-size', MAX_SIZE,
    '--model', MODEL,
  ], { stdio: 'inherit' });
  const elapsed = (Date.now() - startTime) / 1000;
  if (result.status !== 0) {
    console.error(`consolidation failed (exit=${result.status})`);
    process.exit(1);
  }
  console.log(`  elapsed: ${elapsed.toFixed(1)}s`);
} else {
  console.log('');
  console.log('[SKIP-RUN] using current graph state');
}

// ─── AFTER snapshot ─────────────────────────────────────────────
const after = countRoom(loadGraph(), ROOM);
const totalAfter = after.raw + after.consolidatedRaw + after.consolidatedMemories;
console.log('');
console.log('[AFTER]');
console.log(`  raw entries:             ${after.raw}`);
console.log(`  consolidated (raw):      ${after.consolidatedRaw}`);
console.log(`  consolidated_memory:     ${after.consolidatedMemories}`);
console.log(`  total nodes in room:     ${totalAfter}`);

// ─── storage shrinkage ──────────────────────────────────────────
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' Storage shrinkage verdict');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

// Post-retention shrinkage: raw entries that COULD be pruned (those
// marked consolidated_raw) give the effective footprint reduction
// once the retention pass runs.
const rawLost = after.consolidatedRaw;
const consolidatedGained = after.consolidatedMemories - before.consolidatedMemories;
const postRetentionFootprint = after.raw + after.consolidatedMemories; // after retention drops consolidated_raw
const ratio = totalBefore > 0 && postRetentionFootprint > 0
  ? totalBefore / postRetentionFootprint
  : 1;

console.log(`  entries consolidated:       ${rawLost}`);
console.log(`  new consolidated memories:  ${consolidatedGained}`);
console.log(`  post-retention footprint:   ${postRetentionFootprint} nodes`);
console.log(`  shrinkage ratio:            ${ratio.toFixed(2)}×`);

let verdict;
if (ratio >= 10) verdict = '✓✓ TENTPOLE — 10× shrinkage (plan headline)';
else if (ratio >= 5) verdict = '✓ PASS — ≥5× shrinkage';
else if (ratio >= 2) verdict = '~ SOFT — 2–5× shrinkage (tune threshold / min-size)';
else verdict = '✗ NULL — <2× shrinkage; consolidation not paying off on this corpus';
console.log(`  verdict: ${verdict}`);

// ─── quality proxy ──────────────────────────────────────────────
console.log('');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(' Quality preservation (proxy)');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const graph = loadGraph();
const consolidated = graph.nodes.filter((n) => n.room === ROOM && n.kind === 'consolidated_memory');
if (consolidated.length === 0) {
  console.log('  no consolidated memories in this room — skipping quality probe');
} else {
  console.log(`  probing top-10 retrievability of ${consolidated.length} consolidated memories...`);

  let found = 0;
  let foundInTop1 = 0;
  const fails = [];
  for (const m of consolidated.slice(0, 20)) { // cap at 20 probes for speed
    // Query using the first 80 chars of the summary
    const summary = String(m.summary ?? '').slice(0, 80);
    if (!summary) continue;
    // Call `ask --json` on the memory's query text
    const result = spawnSync('node', [
      'dist/cli/index.js', 'ask', '--json', '--room', ROOM, '--k', '10', summary,
    ], { stdio: ['ignore', 'pipe', 'pipe'] });
    if (result.status !== 0) continue;
    try {
      const resp = JSON.parse(result.stdout.toString());
      const hits = resp.hits ?? [];
      const rank = hits.findIndex((h) => h.id === m.id);
      if (rank >= 0) { found++; if (rank === 0) foundInTop1++; }
      else fails.push(m.id.slice(0, 40));
    } catch { /* skip */ }
  }
  const probed = Math.min(consolidated.length, 20);
  console.log(`  consolidated memory in top-10:   ${found}/${probed} (${(found * 100 / probed).toFixed(0)}%)`);
  console.log(`  consolidated memory as top-1:    ${foundInTop1}/${probed} (${(foundInTop1 * 100 / probed).toFixed(0)}%)`);
  if (fails.length > 0) {
    console.log(`  missed (top-${fails.length}):`);
    for (const f of fails.slice(0, 5)) console.log(`    - ${f}...`);
  }

  const qualityOk = found / probed >= 0.8;
  console.log(`  quality verdict: ${qualityOk ? '✓ PASS (≥80% findable)' : '✗ REGRESSION (<80% findable)'}`);
}
