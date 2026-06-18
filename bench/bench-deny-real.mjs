#!/usr/bin/env node
/**
 * REAL-QUERY deny-gate calibration — runs a LABELED in/out-of-corpus query
 * set through the REAL Folklore ask path on the REAL ~/.folklore graph, then
 * sweeps the deny rule over a (threshold × min_hits) grid and reports the
 * true-deny / false-deny tradeoff at every cell.
 *
 * ── How this differs from bench-deny-sweep / bench-deny-validate ───────
 * Those seed a fresh throwaway graph with a 12-node (or ~60-node) synthetic
 * corpus and measure the gate against THAT. Their headline "84% true-deny"
 * is a property of the seed fixture, not of the user's real graph — where
 * in-corpus satisfaction actually lands at 0.37–0.57, well under the 0.85
 * use_memory breakpoint. This harness calibrates on the real graph, with a
 * reproducible labeled set (eval/fixtures/deny-real/, generated from real
 * node labels with full provenance — see generate-fixtures.mjs).
 *
 * ── Calls the REAL engine (no stubs) ──────────────────────────────────
 * Each query runs through `node dist/cli/index.js ask "<q>" --json
 * --workspace all` — the actual application ask use-case (embed → hybrid
 * search → cross/PPR/recency rerank → computeSatisfaction → decideContract).
 * `--workspace all` is REQUIRED: cwd is the akashik repo, and without it the
 * CLI applies a workspace pre-filter that scopes out every other repo's
 * nodes, hiding most of the 21k-node graph. `dist/cli/index.js` is invoked
 * directly (not bin/folklore.js) so we bypass the daemon-socket shim and run
 * the ask in-process against the real graph + real embedder + real vectors.
 *
 * The embedder loads from the real model cache under ~/.folklore/models with
 * no network. If the build or the embedder is missing, the harness SAYS SO
 * and exits 1 — it never fabricates a satisfaction number.
 *
 * ── What it captures, per query ───────────────────────────────────────
 *   satisfaction       — the real computeSatisfaction score
 *   decision           — the real decideContract decision (use_memory / …)
 *   hits[].distance    — NOTE: this is the PPR/recency-rerank SYNTHETIC
 *                        rank-distance the ask path emits, NOT a raw cosine
 *                        distance (multiRrfFuse rewrites it to 1/(1+score);
 *                        pprRerank rewrites it to 1−fused). The deny hook's
 *                        relevance pre-filter (d <= FOLKLORE_HIT_THRESHOLD,
 *                        default 1.05) keys on THIS field, so the harness
 *                        keys on it too — and reports its distribution so the
 *                        reader can judge whether it actually separates
 *                        in- from out-of-corpus.
 *   surviving_hits     — hits with distance <= the relevance cap (the hook's
 *                        own filter, folklore-smart-hook.cjs:297).
 *
 * ── The grid ──────────────────────────────────────────────────────────
 *   threshold ∈ {0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85}
 *   min_hits  ∈ {1, 2, 3}
 *
 * Two gate variants are swept (same as bench-deny-sweep, for continuity):
 *   shipped    — the hook's exact condition: decision === 'use_memory'
 *                AND satisfaction >= threshold AND surviving_hits >= min_hits.
 *   score-only — drops the decision requirement: satisfaction >= threshold
 *                AND surviving_hits >= min_hits.
 *
 * Per cell: true-deny (in-corpus correctly denied), false-deny (out-of-corpus
 * WRONGLY denied — the costly error), and search-saved. The Pareto-best cell
 * (max true-deny subject to zero/near-zero false-deny) is highlighted.
 *
 * Usage:
 *   node bench/bench-deny-real.mjs [--json] [--k 5] [--limit N]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'eval', 'out');
const CLI = join(ROOT, 'dist', 'cli', 'index.js');
const FIXTURE_DIR = join(ROOT, 'eval', 'fixtures', 'deny-real');

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};
const has = (name) => argv.includes(`--${name}`);

const K = parseInt(flag('k', '5'), 10);
const LIMIT = flag('limit', null) ? parseInt(flag('limit', '0'), 10) : null;
const TIMEOUT_MS = 60_000;

// The hook's relevance pre-filter (folklore-smart-hook.cjs:48,297).
const HIT_THRESHOLD = Number(process.env.FOLKLORE_HIT_THRESHOLD ?? 1.05);

// Sweep grid.
const THRESHOLDS = [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85];
const MIN_HITS = [1, 2, 3];

// The domain's fixed use_memory contract breakpoint (CONTRACT_THRESHOLDS).
const USE_MEMORY_BREAKPOINT = 0.85;

// ── load the labeled fixture (must exist; generated from the real graph) ─
const loadJsonl = (p, what) => {
  if (!existsSync(p)) {
    console.error(`bench-deny-real: missing ${what} (${p}).`);
    console.error('  Run: node eval/fixtures/deny-real/generate-fixtures.mjs');
    process.exit(1);
  }
  return readFileSync(p, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
};
let inCorpus = loadJsonl(join(FIXTURE_DIR, 'in-corpus.jsonl'), 'in-corpus fixture');
let outOfCorpus = loadJsonl(join(FIXTURE_DIR, 'out-of-corpus.jsonl'), 'out-of-corpus fixture');
if (LIMIT) {
  inCorpus = inCorpus.slice(0, LIMIT);
  outOfCorpus = outOfCorpus.slice(0, LIMIT);
}

// ── locate the real model cache (the embedder must load offline) ────────
const folkloreHome = process.env.FOLKLORE_HOME || join(homedir(), '.folklore');
if (!existsSync(join(folkloreHome, 'models'))) {
  console.error(`bench-deny-real: no model cache under ${folkloreHome}/models.`);
  console.error('  The real ask path needs the cached embedder. Run any `folklore ask` once, then retry.');
  process.exit(1);
}
if (!existsSync(CLI)) {
  console.error(`bench-deny-real: ${CLI} not found. Run \`npm run build\` first.`);
  process.exit(1);
}
if (!existsSync(join(folkloreHome, 'graph.json'))) {
  console.error(`bench-deny-real: no graph.json under ${folkloreHome}. Nothing to calibrate against.`);
  process.exit(1);
}

// ── run the REAL ask path ───────────────────────────────────────────────
const runAsk = (query) => {
  const r = spawnSync(
    process.execPath,
    [CLI, 'ask', query, '--json', '--k', String(K), '--workspace', 'all'],
    {
      env: { ...process.env, FOLKLORE_HOME: folkloreHome },
      encoding: 'utf8',
      timeout: TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (r.status !== 0) return { ok: false, error: (r.stderr || '').trim().split('\n').pop()?.slice(0, 200) };
  // stdout may carry a stray warning line before the JSON — take the last
  // non-empty line that parses.
  const lines = (r.stdout || '').split('\n').map((l) => l.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return { ok: true, data: JSON.parse(lines[i]) }; }
    catch { /* keep scanning */ }
  }
  return { ok: false, error: 'no parseable JSON on stdout' };
};

const probe = (row) => {
  const res = runAsk(row.query);
  if (!res.ok) return { ...row, ok: false, error: res.error };
  const d = res.data;
  const allHits = Array.isArray(d.hits) ? d.hits : [];
  const surviving = allHits.filter(
    (h) => typeof h.distance === 'number' && h.distance <= HIT_THRESHOLD,
  ).length;
  // best (smallest) REAL distance, excluding the distance-0 recall/rank
  // placeholder so the distribution reflects genuine proximity where present.
  const realDists = allHits
    .map((h) => h.distance)
    .filter((x) => typeof x === 'number' && x > 0 && Number.isFinite(x));
  return {
    ...row,
    ok: true,
    decision: d.decision ?? null,
    satisfaction: typeof d.satisfaction === 'number' ? d.satisfaction : 0,
    total_hits: allHits.length,
    surviving_hits: surviving,
    best_distance: allHits.length > 0 ? allHits[0].distance : null,
    best_real_distance: realDists.length > 0 ? Math.min(...realDists) : null,
    zero_distance_top: allHits.length > 0 && allHits[0].distance === 0,
  };
};

// ── gate predicates ──────────────────────────────────────────────────────
const shippedDeny = (p, t, m) =>
  p.decision === 'use_memory' && p.satisfaction >= t && p.surviving_hits >= m;
const scoreOnlyDeny = (p, t, m) => p.satisfaction >= t && p.surviving_hits >= m;

const sweepVariant = (predicate, inProbes, outProbes) => {
  const cells = [];
  const inOk = inProbes.filter((p) => p.ok);
  const outOk = outProbes.filter((p) => p.ok);
  for (const t of THRESHOLDS) {
    for (const m of MIN_HITS) {
      const trueDeny = inOk.filter((p) => predicate(p, t, m)).length;
      const falseDeny = outOk.filter((p) => predicate(p, t, m)).length;
      cells.push({
        threshold: t,
        min_hits: m,
        true_deny: trueDeny,
        in_n: inOk.length,
        true_deny_rate: inOk.length ? trueDeny / inOk.length : 0,
        false_deny: falseDeny,
        out_n: outOk.length,
        false_deny_rate: outOk.length ? falseDeny / outOk.length : 0,
      });
    }
  }
  return cells;
};

// ── distribution helpers ─────────────────────────────────────────────────
const pct = (x) => `${(x * 100).toFixed(0)}%`;
const quantiles = (xs) => {
  const s = xs.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((a, b) => a - b);
  if (s.length === 0) return null;
  const q = (f) => s[Math.min(s.length - 1, Math.floor(f * (s.length - 1)))];
  return {
    n: s.length,
    min: Number(s[0].toFixed(3)),
    p25: Number(q(0.25).toFixed(3)),
    median: Number(q(0.5).toFixed(3)),
    p75: Number(q(0.75).toFixed(3)),
    max: Number(s[s.length - 1].toFixed(3)),
  };
};

// ── main ──────────────────────────────────────────────────────────────────
console.log(`bench-deny-real: real graph at ${folkloreHome}/graph.json`);
console.log(
  `bench-deny-real: ${inCorpus.length} in-corpus + ${outOfCorpus.length} out-of-corpus labeled queries, ` +
    `k=${K}, hit-filter d<=${HIT_THRESHOLD}`,
);
console.log('bench-deny-real: probing the REAL ask path (this runs the real embedder + vector search per query)…\n');

const inProbes = inCorpus.map((row, i) => {
  process.stderr.write(`  in-corpus  ${i + 1}/${inCorpus.length}\r`);
  return probe(row);
});
const outProbes = outOfCorpus.map((row, i) => {
  process.stderr.write(`  out-corpus ${i + 1}/${outOfCorpus.length}\r`);
  return probe(row);
});
process.stderr.write('\n');

const inFailed = inProbes.filter((p) => !p.ok);
const outFailed = outProbes.filter((p) => !p.ok);
if (inFailed.length || outFailed.length) {
  console.error(`bench-deny-real: ${inFailed.length + outFailed.length} probe(s) failed:`);
  for (const p of [...inFailed, ...outFailed].slice(0, 10)) {
    console.error(`  - "${p.query.slice(0, 50)}": ${p.error}`);
  }
}

const inOk = inProbes.filter((p) => p.ok);
const outOk = outProbes.filter((p) => p.ok);
if (inOk.length === 0 || outOk.length === 0) {
  console.error('bench-deny-real: too many probe failures to calibrate. Aborting (no fabricated numbers).');
  process.exit(1);
}

const shipped = sweepVariant(shippedDeny, inProbes, outProbes);
const scoreOnly = sweepVariant(scoreOnlyDeny, inProbes, outProbes);

// satisfaction distributions
const inSat = inOk.map((p) => p.satisfaction);
const outSat = outOk.map((p) => p.satisfaction);
const inSatQ = quantiles(inSat);
const outSatQ = quantiles(outSat);

// distance distributions (synthetic rank-distance the gate keys on)
const inDist = inOk.map((p) => p.best_distance);
const outDist = outOk.map((p) => p.best_distance);
const inRealDist = inOk.map((p) => p.best_real_distance);
const outRealDist = outOk.map((p) => p.best_real_distance);

const anyInUseMemory = inOk.some((p) => p.decision === 'use_memory');
const inDecisions = inOk.reduce((acc, p) => { acc[p.decision] = (acc[p.decision] || 0) + 1; return acc; }, {});
const outDecisions = outOk.reduce((acc, p) => { acc[p.decision] = (acc[p.decision] || 0) + 1; return acc; }, {});

// ── pick a recommended cell for each variant ────────────────────────────
// Maximise true-deny subject to a hard false-deny<=0 constraint; tie-break
// toward higher min_hits then higher threshold (the more conservative cell
// that still wins).
const pickBest = (cells) => {
  const zeroFalse = cells.filter((c) => c.false_deny === 0 && c.true_deny > 0);
  const pool = zeroFalse.length ? zeroFalse : cells.filter((c) => c.true_deny > 0);
  if (pool.length === 0) return null;
  return pool
    .slice()
    .sort((a, b) => b.true_deny - a.true_deny || b.min_hits - a.min_hits || b.threshold - a.threshold)[0];
};
const recShipped = pickBest(shipped);
const recScoreOnly = pickBest(scoreOnly);

// ── separation diagnostic: can ANY (threshold,minHits) cell separate? ────
// "Good separation" = a cell exists with true-deny >= 0.5 AND false-deny == 0.
const separable = scoreOnly.some((c) => c.true_deny_rate >= 0.5 && c.false_deny === 0);

const summary = {
  generated_at: new Date().toISOString(),
  folklore_home: folkloreHome,
  k: K,
  hit_threshold: HIT_THRESHOLD,
  use_memory_breakpoint: USE_MEMORY_BREAKPOINT,
  counts: {
    in_corpus: inOk.length,
    out_of_corpus: outOk.length,
    in_failed: inFailed.length,
    out_failed: outFailed.length,
  },
  satisfaction: {
    in_corpus: inSatQ,
    out_of_corpus: outSatQ,
    in_median: inSatQ?.median ?? null,
    out_median: outSatQ?.median ?? null,
    note:
      'If in/out medians are close, satisfaction does NOT separate in- from out-of-corpus and no satisfaction threshold can gate cleanly.',
  },
  distance_synthetic_top: {
    note: 'distance the deny hook filters on; PPR/recency rerank rewrites it (NOT cosine). distance-0 = rank/recall placeholder.',
    in_corpus: quantiles(inDist),
    out_of_corpus: quantiles(outDist),
    in_zero_top: inOk.filter((p) => p.zero_distance_top).length,
    out_zero_top: outOk.filter((p) => p.zero_distance_top).length,
  },
  distance_best_real_nonzero: {
    note: 'smallest distance > 0 per query (excludes the 0 placeholder).',
    in_corpus: quantiles(inRealDist),
    out_of_corpus: quantiles(outRealDist),
  },
  decisions: { in_corpus: inDecisions, out_of_corpus: outDecisions, any_in_corpus_use_memory: anyInUseMemory },
  grid: { thresholds: THRESHOLDS, min_hits: MIN_HITS },
  shipped_gate: shipped,
  score_only_gate: scoreOnly,
  recommendation: {
    shipped: recShipped,
    score_only: recScoreOnly,
    good_separation_achievable: separable,
  },
  probes: { in_corpus: inProbes, out_of_corpus: outProbes },
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'deny-real-summary.json'), JSON.stringify(summary, null, 2) + '\n');

// ── render ──────────────────────────────────────────────────────────────
const q = (qd) => (qd ? `min ${qd.min}  p25 ${qd.p25}  med ${qd.median}  p75 ${qd.p75}  max ${qd.max}` : '(no data)');

console.log('── satisfaction distribution (the score any threshold must sit against) ──\n');
console.log(`  in-corpus      ${q(inSatQ)}`);
console.log(`  out-of-corpus  ${q(outSatQ)}`);
console.log(`  → in-corpus median ${inSatQ?.median ?? '—'}  vs  out-of-corpus median ${outSatQ?.median ?? '—'}\n`);

console.log('── synthetic top-hit distance (what the deny relevance cap filters on) ──\n');
console.log(`  in-corpus      ${q(quantiles(inDist))}   (zero-distance top hit: ${summary.distance_synthetic_top.in_zero_top}/${inOk.length})`);
console.log(`  out-of-corpus  ${q(quantiles(outDist))}   (zero-distance top hit: ${summary.distance_synthetic_top.out_zero_top}/${outOk.length})\n`);

console.log('── best NON-ZERO distance (genuine proximity where present) ──\n');
console.log(`  in-corpus      ${q(quantiles(inRealDist))}`);
console.log(`  out-of-corpus  ${q(quantiles(outRealDist))}\n`);

console.log('── decisions (real decideContract output) ──\n');
console.log(`  in-corpus:     ${JSON.stringify(inDecisions)}`);
console.log(`  out-of-corpus: ${JSON.stringify(outDecisions)}`);
console.log(`  any in-corpus decision == use_memory? ${anyInUseMemory ? 'yes' : 'NO'}\n`);

const renderTable = (label, cells) => {
  console.log(`── ${label} ──`);
  console.log('  thresh  minHits   true-deny (in-corpus)        false-deny (out-of-corpus)');
  for (const c of cells) {
    const td = `${c.true_deny}/${c.in_n} = ${pct(c.true_deny_rate)}`;
    const fd = `${c.false_deny}/${c.out_n} = ${pct(c.false_deny_rate)}`;
    console.log(`  ${c.threshold.toFixed(2)}    ${String(c.min_hits).padStart(2)}        ${td.padEnd(24)}    ${fd}`);
  }
  console.log('');
};
renderTable('VARIANT A — shipped gate (requires decision === use_memory)', shipped);
renderTable('VARIANT B — score-only gate (drops decision requirement, keeps distance filter)', scoreOnly);

console.log('══ RECOMMENDATION ══\n');
const fmtRec = (name, r) =>
  r
    ? `  ${name}: threshold ${r.threshold.toFixed(2)} × min_hits ${r.min_hits} → true-deny ${pct(r.true_deny_rate)}, false-deny ${pct(r.false_deny_rate)}`
    : `  ${name}: NO cell achieves any true-deny — the gate cannot fire on this real set at any swept threshold.`;
console.log(fmtRec('shipped gate ', recShipped));
console.log(fmtRec('score-only   ', recScoreOnly));
console.log('');
console.log(`  good separation achievable (a cell with true-deny>=50% AND zero false-deny)? ${separable ? 'YES' : 'NO'}\n`);

if (!separable) {
  console.log(
    'FINDING: on the REAL graph, no swept (threshold × min_hits) cell separates in- from out-of-corpus\n' +
      '  with both meaningful true-deny and zero false-deny. The reasons are structural, not a bad threshold:\n' +
      '   • satisfaction is a TRUST score (freshness/provenance/consensus), not a relevance score, so its\n' +
      '     in- and out-of-corpus medians sit close together (see distribution above);\n' +
      '   • the distance the relevance cap filters on is a PPR/recency SYNTHETIC rank-distance, not cosine,\n' +
      '     so a high-centrality node lands near distance 0 even for an off-topic query — the cap does not\n' +
      '     discriminate either.\n' +
      '  See docs/protocol/DENY-CALIBRATION-REAL.md for the full argument and the recommended fix path.\n',
  );
}

console.log(
  `CAVEAT — labeled-set size: ${inOk.length} in-corpus + ${outOk.length} out-of-corpus on ONE real graph.\n` +
    '  The rates are a direction, not a population estimate; one query flipping moves a rate by ~3 points.\n' +
    '  In-corpus labels are recall questions grounded in real node titles (provenance in the fixture);\n' +
    '  out-of-corpus labels are topically-absent domains. Re-run generate-fixtures.mjs after a graph change.\n',
);

console.log(`bench-deny-real: -> ${join(OUT, 'deny-real-summary.json')}`);

if (has('json')) console.log(JSON.stringify(summary, null, 2));
