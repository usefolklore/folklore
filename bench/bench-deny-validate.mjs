#!/usr/bin/env node
/**
 * Deny-gate VALIDATION — a larger, adversarial-by-construction stress
 * test of the score-only hard-deny gate at the cell bench-deny-sweep
 * recommended (threshold 0.75 × min_hits 1).
 *
 * ── Why this exists ───────────────────────────────────────────────────
 * bench-deny-sweep concluded that the score-only gate (deny on
 * satisfaction >= threshold AND surviving_hits >= min_hits, dropping the
 * shipped `action === 'use_memory'` precondition) holds false-deny at 0%
 * — BUT only because of the hook's distance pre-filter (d <= 1.05,
 * folklore-smart-hook.cjs:282), NOT because satisfaction discriminates
 * relevance. Satisfaction is a STRUCTURAL score (freshness / provenance /
 * origins) and returns ~0.75 for in- AND out-of-corpus alike. So the
 * whole safety of the score-only gate rests on one number: the distance
 * cap. bench-deny-sweep tested it on only 8 adversarial questions, all
 * topically far from the seed corpus — so every adversarial nearest hit
 * sat comfortably past the cap and the 0% false-deny was UNDER-TESTED.
 *
 * The danger the small fixture never probed: an adversarial query whose
 * nearest seeded node happens to sit INSIDE the 1.05 cap would survive
 * the filter and FALSE-DENY. That only happens when the adversarial query
 * is semantically CLOSE to a seeded node — a "near-miss" — not when it is
 * random nonsense.
 *
 * ── What this harness does differently ────────────────────────────────
 *   1. Seeds a LARGER synthetic graph (eval/fixtures/deny-validate/
 *      corpus.json, ~60 durable concept nodes spanning distributed
 *      systems, vector search, storage, security, concurrency, ML) via
 *      the SAME real `folklore seed --file` ingest path the bench uses.
 *      The product seed corpus (src/domain/seed-corpus-data.ts) is NOT
 *      touched.
 *   2. Runs TWO larger question banks (eval/fixtures/deny-validate/
 *      questions.json): 44 in-corpus + 40 adversarial, where the
 *      adversarial set is deliberately split into 30 NEAR-MISS questions
 *      (a different, uncovered facet of a seeded domain — engineered to
 *      land near the cap) and 10 FAR-MISS questions (unrelated domains).
 *   3. Reports, at the recommended cell only: true-deny on in-corpus and
 *      the REAL false-deny rate on the adversarial set, BROKEN OUT by
 *      near-miss vs far-miss, plus the full distribution of adversarial
 *      nearest-hit distances relative to the 1.05 cap. That distribution
 *      IS the safety argument made visible.
 *
 * ── Honesty constraints (same as bench-deny-sweep) ────────────────────
 *   • Real binary, fresh home, model-cache symlink. No web calls, no
 *     model download. If no model cache exists, SAY SO and exit 1 —
 *     never fabricate numbers.
 *   • One real `folklore ask --json` per question; the gate predicate is
 *     replayed against those cached probes.
 *   • 0 new deps. ESM. Nothing under src/ or .claude/ is touched.
 *
 * Usage:
 *   node bench/bench-deny-validate.mjs [--json] [--k 3] [--home DIR]
 *        [--threshold 0.75] [--min-hits 1]
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'eval', 'out');
const BIN = join(ROOT, 'bin', 'folklore.js');
const FIXTURE_DIR = join(ROOT, 'eval', 'fixtures', 'deny-validate');
const CORPUS_FILE = join(FIXTURE_DIR, 'corpus.json');
const QUESTIONS_FILE = join(FIXTURE_DIR, 'questions.json');

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};
const has = (name) => argv.includes(`--${name}`);

const K = parseInt(flag('k', '3'), 10);
const TIMEOUT_MS = 30_000;

// The recommended cell from bench-deny-sweep: score-only gate.
const THRESHOLD = Number(flag('threshold', '0.75'));
const MIN_HITS = parseInt(flag('min-hits', '1'), 10);

// The hook's own relevance pre-filter (folklore-smart-hook.cjs:48,282).
// This — NOT satisfaction — is the actual relevance discriminator, and
// the entire point of this harness is to test whether it holds when the
// adversarial queries are engineered to be semantically close.
const HIT_THRESHOLD = Number(process.env.FOLKLORE_HIT_THRESHOLD ?? 1.05);

// ── load fixtures ──────────────────────────────────────────────────────
const loadJson = (p, what) => {
  try { return JSON.parse(readFileSync(p, 'utf8')); }
  catch (e) { console.error(`bench-deny-validate: cannot load ${what} (${p}): ${e.message}`); process.exit(1); }
};
const corpus = loadJson(CORPUS_FILE, 'corpus fixture');
const banks = loadJson(QUESTIONS_FILE, 'questions fixture');
const IN_CORPUS = banks.in_corpus;
const ADVERSARIAL = banks.adversarial; // [{ q, miss: 'near'|'far', near_to? }]
const NEAR = ADVERSARIAL.filter((a) => a.miss === 'near');
const FAR = ADVERSARIAL.filter((a) => a.miss === 'far');

// ── locate a model cache (same probe as bench-deny-sweep) ──────────────
const findModelHome = () => {
  for (const h of [process.env.FOLKLORE_HOME, join(homedir(), '.folklore'), join(homedir(), '.akashik')]) {
    if (h && existsSync(join(h, 'models'))) return h;
  }
  return null;
};

const runAsk = (home, query) => {
  const r = spawnSync(process.execPath, [BIN, 'ask', query, '--json', '--k', String(K)], {
    env: { ...process.env, FOLKLORE_HOME: home },
    encoding: 'utf8',
    timeout: TIMEOUT_MS,
  });
  if (r.status !== 0) return { ok: false, error: (r.stderr || '').trim().slice(0, 200) };
  try { return { ok: true, data: JSON.parse(r.stdout) }; }
  catch (e) { return { ok: false, error: `bad json: ${e.message}` }; }
};

/** Ask once, capture exactly the fields the gate consumes. */
const probe = (home, query) => {
  const res = runAsk(home, query);
  if (!res.ok) return { q: query, ok: false, error: res.error };
  const d = res.data;
  const allHits = Array.isArray(d.hits) ? d.hits : [];
  // Replicate the hook's surviving-hit distance filter (line 282).
  const surviving = allHits.filter(
    (h) => typeof h.distance === 'number' && h.distance <= HIT_THRESHOLD,
  ).length;
  return {
    q: query,
    ok: true,
    decision: d.decision ?? null,
    satisfaction: typeof d.satisfaction === 'number' ? d.satisfaction : 0,
    total_hits: allHits.length,
    surviving_hits: surviving,
    best_distance: allHits.length > 0 ? allHits[0].distance : null,
  };
};

// score-only gate predicate (the variant under test). The distance cap
// is already baked into surviving_hits.
const scoreOnlyDeny = (p) => p.satisfaction >= THRESHOLD && p.surviving_hits >= MIN_HITS;

const pct = (x) => `${(x * 100).toFixed(0)}%`;
const fmtDist = (d) => (d === null ? 'none' : d.toFixed(4));

// ── main ───────────────────────────────────────────────────────────────
const modelHome = findModelHome();
if (!modelHome) {
  console.error('bench-deny-validate: no model cache found under ~/.folklore or ~/.akashik.');
  console.error('  Run `folklore onboard` (or any `folklore ask`) once so the embedder model is cached, then retry.');
  console.error('  (No fabricated numbers: this harness needs the real embedder to run the real ask path.)');
  process.exit(1);
}

const home = flag('home', mkdtempSync(join(tmpdir(), 'folklore-deny-validate-')));
mkdirSync(home, { recursive: true });
if (!existsSync(join(home, 'models'))) {
  try { symlinkSync(join(modelHome, 'models'), join(home, 'models'), 'dir'); }
  catch { /* a real models dir may already exist */ }
}
const cleanup = () => { if (!flag('home', null)) { try { rmSync(home, { recursive: true, force: true }); } catch {} } };

console.log(`bench-deny-validate: fresh home ${home}`);
console.log(`bench-deny-validate: model cache symlinked from ${modelHome}`);
console.log(
  `bench-deny-validate: corpus ${corpus.entries.length} nodes; ` +
    `${IN_CORPUS.length} in-corpus + ${ADVERSARIAL.length} adversarial ` +
    `(${NEAR.length} near-miss / ${FAR.length} far-miss) questions, ` +
    `k=${K}, hit-filter d<=${HIT_THRESHOLD}`,
);
console.log(`bench-deny-validate: gate under test = SCORE-ONLY @ threshold ${THRESHOLD} × min_hits ${MIN_HITS}\n`);

// graph.json must exist before seed/ask (same as the other benches).
if (!existsSync(join(home, 'graph.json'))) {
  writeFileSync(
    join(home, 'graph.json'),
    JSON.stringify({ directed: false, multigraph: false, graph: {}, nodes: [], links: [] }),
  );
}

// SEED the validation corpus via the REAL ingest path (folklore seed --file).
const seedRes = spawnSync(process.execPath, [BIN, 'seed', '--file', CORPUS_FILE, '--json'], {
  env: { ...process.env, FOLKLORE_HOME: home }, encoding: 'utf8', timeout: 120_000,
});
let seeded = 0;
try { seeded = JSON.parse(seedRes.stdout).seeded ?? 0; } catch { /* ignore */ }
if (seedRes.status !== 0) {
  console.error(`bench-deny-validate: seed failed: ${(seedRes.stderr || '').slice(0, 300)}`);
  cleanup();
  process.exit(1);
}
console.log(`bench-deny-validate: seeded ${seeded} validation nodes; probing real ask path…\n`);

// Probe once per question.
const inProbes = IN_CORPUS.map((q) => probe(home, q));
const nearProbes = NEAR.map((a) => ({ ...probe(home, a.q), near_to: a.near_to }));
const farProbes = FAR.map((a) => probe(home, a.q));

const allProbes = [...inProbes, ...nearProbes, ...farProbes];
const failed = allProbes.filter((p) => !p.ok);
if (failed.length > 0) {
  console.error(`bench-deny-validate: ${failed.length} ask probe(s) failed:`);
  for (const p of failed) console.error(`  - "${p.q.slice(0, 55)}": ${p.error}`);
  if (failed.length === allProbes.length) { cleanup(); process.exit(1); }
}

const okIn = inProbes.filter((p) => p.ok);
const okNear = nearProbes.filter((p) => p.ok);
const okFar = farProbes.filter((p) => p.ok);
const okAdv = [...okNear, ...okFar];

// ── deny tallies at the recommended cell ───────────────────────────────
const trueDeny = okIn.filter(scoreOnlyDeny).length;
const falseNear = okNear.filter(scoreOnlyDeny).length;
const falseFar = okFar.filter(scoreOnlyDeny).length;
const falseDeny = falseNear + falseFar;

// ── adversarial nearest-hit distance distribution vs the cap ───────────
const advWithDist = okAdv.filter((p) => typeof p.best_distance === 'number');
const insideCap = advWithDist.filter((p) => p.best_distance <= HIT_THRESHOLD);
const nearInsideCap = okNear.filter((p) => typeof p.best_distance === 'number' && p.best_distance <= HIT_THRESHOLD);
const farInsideCap = okFar.filter((p) => typeof p.best_distance === 'number' && p.best_distance <= HIT_THRESHOLD);

const distSummary = (probes) => {
  const ds = probes.map((p) => p.best_distance).filter((d) => typeof d === 'number').sort((a, b) => a - b);
  if (ds.length === 0) return { n: 0 };
  const q = (f) => ds[Math.min(ds.length - 1, Math.floor(f * (ds.length - 1)))];
  return {
    n: ds.length,
    min: Number(ds[0].toFixed(4)),
    p25: Number(q(0.25).toFixed(4)),
    median: Number(q(0.5).toFixed(4)),
    p75: Number(q(0.75).toFixed(4)),
    max: Number(ds[ds.length - 1].toFixed(4)),
  };
};

// Mean satisfaction bands — to re-confirm satisfaction does NOT separate
// in- from out-of-corpus (the premise that makes the distance cap the
// sole guard).
const mean = (xs) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const meanInSat = mean(okIn.map((p) => p.satisfaction));
const meanNearSat = mean(okNear.map((p) => p.satisfaction));
const meanFarSat = mean(okFar.map((p) => p.satisfaction));

const trueDenyRate = trueDeny / Math.max(1, okIn.length);
const falseDenyRate = falseDeny / Math.max(1, okAdv.length);
const falseNearRate = falseNear / Math.max(1, okNear.length);
const falseFarRate = falseFar / Math.max(1, okFar.length);

// ── verdict ────────────────────────────────────────────────────────────
// A score-only gate is "safe to ship" only if the realistic adversarial
// false-deny stays low even on the near-miss set. Thresholds are a
// judgement call; we state them explicitly so the verdict is auditable.
//   SHIP            : overall false-deny <= 5% AND near-miss false-deny <= 10%
//   SHIP-WITH-GUARD : false-deny material on near-miss (the distance cap
//                     leaks under semantic proximity) — recommend an
//                     extra guard before relying on score-only.
const SHIP_FALSE_DENY_MAX = 0.05;
const SHIP_NEAR_FALSE_DENY_MAX = 0.10;
const safe = falseDenyRate <= SHIP_FALSE_DENY_MAX && falseNearRate <= SHIP_NEAR_FALSE_DENY_MAX;
const verdict = safe ? 'SHIP' : 'SHIP-WITH-GUARD';

const summary = {
  generated_at: new Date().toISOString(),
  home,
  k: K,
  hit_threshold: HIT_THRESHOLD,
  gate: { variant: 'score-only', threshold: THRESHOLD, min_hits: MIN_HITS },
  corpus_nodes: corpus.entries.length,
  seeded_nodes: seeded,
  counts: {
    in_corpus: okIn.length,
    adversarial: okAdv.length,
    near_miss: okNear.length,
    far_miss: okFar.length,
    probe_failures: failed.length,
  },
  results: {
    true_deny: trueDeny,
    true_deny_rate: Number(trueDenyRate.toFixed(4)),
    false_deny: falseDeny,
    false_deny_rate: Number(falseDenyRate.toFixed(4)),
    false_deny_near: falseNear,
    false_deny_near_rate: Number(falseNearRate.toFixed(4)),
    false_deny_far: falseFar,
    false_deny_far_rate: Number(falseFarRate.toFixed(4)),
  },
  distance_distribution: {
    cap: HIT_THRESHOLD,
    adversarial_inside_cap: insideCap.length,
    adversarial_total: advWithDist.length,
    near_inside_cap: nearInsideCap.length,
    near_total: okNear.length,
    far_inside_cap: farInsideCap.length,
    far_total: okFar.length,
    in_corpus_best_distance: distSummary(okIn),
    near_miss_best_distance: distSummary(okNear),
    far_miss_best_distance: distSummary(okFar),
  },
  satisfaction_bands: {
    mean_in_corpus: Number(meanInSat.toFixed(3)),
    mean_near_miss: Number(meanNearSat.toFixed(3)),
    mean_far_miss: Number(meanFarSat.toFixed(3)),
    note: 'If these are all close, satisfaction does NOT separate relevance and the distance cap is the sole guard.',
  },
  verdict: {
    decision: verdict,
    criteria: {
      ship_false_deny_max: SHIP_FALSE_DENY_MAX,
      ship_near_false_deny_max: SHIP_NEAR_FALSE_DENY_MAX,
    },
  },
  probes: {
    in_corpus: inProbes,
    near_miss: nearProbes,
    far_miss: farProbes,
  },
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'deny-validate-summary.json'), JSON.stringify(summary, null, 2) + '\n');

// ── render ───────────────────────────────────────────────────────────────
console.log('── RESULTS @ score-only gate, threshold ' + THRESHOLD + ' × min_hits ' + MIN_HITS + ' ──\n');
console.log('  metric                         count            rate');
console.log('  ----------------------------   --------------   ------');
console.log(`  true-deny  (in-corpus)         ${String(trueDeny + '/' + okIn.length).padEnd(14)}   ${pct(trueDenyRate)}`);
console.log(`  false-deny (all adversarial)   ${String(falseDeny + '/' + okAdv.length).padEnd(14)}   ${pct(falseDenyRate)}`);
console.log(`  false-deny (NEAR-miss)         ${String(falseNear + '/' + okNear.length).padEnd(14)}   ${pct(falseNearRate)}`);
console.log(`  false-deny (FAR-miss)          ${String(falseFar + '/' + okFar.length).padEnd(14)}   ${pct(falseFarRate)}`);
console.log('');

console.log('── adversarial nearest-hit distance vs cap (d<=' + HIT_THRESHOLD + ') ──\n');
console.log(`  inside cap, all adversarial:   ${insideCap.length}/${advWithDist.length}`);
console.log(`  inside cap, NEAR-miss:         ${nearInsideCap.length}/${okNear.length}   <-- these are the ones that can leak`);
console.log(`  inside cap, FAR-miss:          ${farInsideCap.length}/${okFar.length}`);
console.log('');
const ds = summary.distance_distribution;
const row = (label, s) => s.n === 0
  ? console.log(`  ${label.padEnd(14)} (no hits)`)
  : console.log(`  ${label.padEnd(14)} min ${fmtDist(s.min)}  p25 ${fmtDist(s.p25)}  med ${fmtDist(s.median)}  p75 ${fmtDist(s.p75)}  max ${fmtDist(s.max)}`);
console.log('  best-distance distribution (closer = more relevant):');
row('in-corpus', ds.in_corpus_best_distance);
row('near-miss', ds.near_miss_best_distance);
row('far-miss', ds.far_miss_best_distance);
console.log('');

console.log('── satisfaction bands (does the score itself separate relevance?) ──\n');
console.log(`  mean satisfaction  in-corpus ${meanInSat.toFixed(3)}   near-miss ${meanNearSat.toFixed(3)}   far-miss ${meanFarSat.toFixed(3)}`);
console.log('  (close bands => satisfaction does NOT discriminate; the distance cap is the only real guard.)\n');

// near-miss leak detail — name the questions that survived the cap so a
// reader can judge whether the "deny" was actually defensible.
const leaks = okNear.filter(scoreOnlyDeny);
if (leaks.length > 0) {
  console.log('── NEAR-MISS questions that FALSE-DENIED (survived the distance cap) ──\n');
  for (const p of leaks) {
    console.log(`  d=${fmtDist(p.best_distance)} sat=${p.satisfaction.toFixed(2)} hits=${p.surviving_hits}  "${p.q}"`);
    if (p.near_to) console.log(`      (near to: ${p.near_to})`);
  }
  console.log('');
}

console.log('══ VERDICT ══\n');
if (verdict === 'SHIP') {
  console.log(
    `  ${verdict}: the score-only gate at ${THRESHOLD} × ${MIN_HITS} holds up on a realistic adversarial set.\n` +
      `  Overall false-deny ${pct(falseDenyRate)} (<= ${pct(SHIP_FALSE_DENY_MAX)}) and near-miss false-deny ${pct(falseNearRate)} ` +
      `(<= ${pct(SHIP_NEAR_FALSE_DENY_MAX)}).\n` +
      `  The distance pre-filter (d<=${HIT_THRESHOLD}) held even when adversarial queries were engineered to be\n` +
      `  semantically adjacent to seeded nodes: ${nearInsideCap.length}/${okNear.length} near-miss queries breached the cap.\n` +
      `  Satisfaction still does not discriminate (bands ${meanInSat.toFixed(2)}/${meanNearSat.toFixed(2)}/${meanFarSat.toFixed(2)}), so the\n` +
      `  cap is the load-bearing guard — and on this larger set it bears the load.\n`,
  );
} else {
  console.log(
    `  ${verdict}: the score-only gate at ${THRESHOLD} × ${MIN_HITS} LEAKS under semantic proximity.\n` +
      `  Near-miss false-deny is ${pct(falseNearRate)} (${falseNear}/${okNear.length}) — above the ${pct(SHIP_NEAR_FALSE_DENY_MAX)} ship bar.\n` +
      `  ${nearInsideCap.length}/${okNear.length} near-miss adversarial queries landed INSIDE the ${HIT_THRESHOLD} distance cap, and because\n` +
      `  satisfaction does not discriminate (bands ${meanInSat.toFixed(2)}/${meanNearSat.toFixed(2)}/${meanFarSat.toFixed(2)}), those slipped through\n` +
      `  as confident denies on questions memory could not actually answer.\n` +
      `  RECOMMEND an extra guard before shipping score-only, e.g.:\n` +
      `    • a tighter distance cap (probe the near-miss distance band above for a safe value), or\n` +
      `    • relevance-aware satisfaction (let the score reflect best-hit distance, not just structure), or\n` +
      `    • a multi-origin / min-hits>=2 requirement so a single close-but-wrong node cannot trip the gate.\n`,
  );
}

console.log(
  'CAVEAT: synthetic corpus + hand-authored adversarial banks. The near-miss questions are\n' +
    '  ENGINEERED to stress the cap, so the near-miss false-deny here is a deliberate worst-case\n' +
    '  probe, not an in-the-wild base rate. Read it as "can the cap leak under adversarial proximity?"\n' +
    '  — a yes is decisive; a no is reassuring but still a single-graph measurement.\n',
);

console.log(`bench-deny-validate: -> ${join(OUT, 'deny-validate-summary.json')}`);

cleanup();

if (has('json')) console.log(JSON.stringify(summary, null, 2));
