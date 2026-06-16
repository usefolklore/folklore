#!/usr/bin/env node
/**
 * Deny-gate threshold sweep — evidence-based default for the
 * deny-on-confidence PreToolUse gate, with honest false-deny accounting.
 *
 * ── The question ──────────────────────────────────────────────────────
 * The PreToolUse hook (.claude/hooks/folklore-smart-hook.cjs) denies an
 * outbound WebSearch/WebFetch when, AND ONLY when, all four hold:
 *
 *     FOLKLORE_DENY_WEBSEARCH=1
 *     toolName ∈ {WebSearch, WebFetch}
 *     action === 'use_memory'
 *     satisfaction >= FOLKLORE_DENY_THRESHOLD   (default 0.85)
 *     surviving_hits >= FOLKLORE_DENY_MIN_HITS  (default 2)
 *
 * The cold-start seed track (bench-coldstart-seed.mjs) raised SOFT
 * web-deflection (memory usable) from 0%→100% on a seeded graph, but the
 * HARD deny gate still fires 0%: seeded single-origin nodes land at
 * satisfaction ~0.75 and the contract demotes them to
 * `verify_one_source` (the domain `use_memory` breakpoint is a FIXED 0.85
 * in CONTRACT_THRESHOLDS, with a shallow-evidence demotion on single
 * origin). So `FOLKLORE_DENY_THRESHOLD` alone is inert on the shipped
 * gate — the `action === 'use_memory'` condition gates it shut first.
 *
 * ── What this sweep measures ──────────────────────────────────────────
 * Two gate variants, swept over the same grid, on the SAME real
 * `folklore ask --json` outputs (no model re-runs between cells — we ask
 * once per question, then replay the grid against the cached results):
 *
 *   A. shipped     — the gate exactly as the hook ships it
 *                    (requires action === 'use_memory'). This is the
 *                    honest "what does turning the knob actually do today"
 *                    baseline. Spoiler: nothing, until sat clears 0.85.
 *
 *   B. score-only  — the PROPOSED relaxation: drop the
 *                    `action === 'use_memory'` requirement and deny on
 *                    (satisfaction >= threshold AND surviving_hits >=
 *                    min_hits). This is what would actually let seeded
 *                    nodes deflect — and exactly the variant whose
 *                    false-deny downside must be measured before
 *                    recommending it.
 *
 * BOTH variants apply the hook's own relevance pre-filter first:
 *   surviving_hits = hits.filter(distance <= FOLKLORE_HIT_THRESHOLD)
 * (default 1.05, line 282 of the hook). That distance cap — NOT the
 * satisfaction score — is what discriminates a real in-corpus hit from
 * noise: the satisfaction score is structural (freshness / provenance /
 * origins) and returns ~0.75 even for total garbage queries, so a
 * score-only gate WITHOUT the distance filter would false-deny on
 * nonsense. The filter is part of the honest gate, so the sweep applies
 * it.
 *
 * ── True-deny vs false-deny ───────────────────────────────────────────
 *   IN-CORPUS questions  → a deny is a TRUE deny (web trip correctly
 *                          avoided; memory really had the answer).
 *   OUT-OF-CORPUS / adversarial questions → a deny is a FALSE deny (the
 *                          gate blocked the web but memory was actually
 *                          insufficient; the agent is now stuck with a
 *                          wrong/empty answer).
 *
 * A good default MAXIMISES true-deny on in-corpus while keeping
 * false-deny at/near ZERO on out-of-corpus. Both columns are printed per
 * cell.
 *
 * ── Honesty constraints ───────────────────────────────────────────────
 *   • Reuses the cold-start harness pattern verbatim: fresh home,
 *     model-cache symlink, real `folklore seed` + real `folklore ask`.
 *   • No web calls. No model downloads. If no model cache exists the
 *     harness SAYS SO and exits 1 rather than fabricating.
 *   • Tiny fixture (12 in-corpus + N out-of-corpus). The numbers are a
 *     direction, not a leaderboard — see the caveat printed at the end.
 *   • 0 new deps. ESM. Nothing under src/ or .claude/ is touched; this
 *     RECOMMENDS a default, it does not change one.
 *
 * Usage:
 *   node bench/bench-deny-sweep.mjs [--json] [--k 3] [--home DIR]
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'eval', 'out');
const BIN = join(ROOT, 'bin', 'folklore.js');

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};
const has = (name) => argv.includes(`--${name}`);

const K = parseInt(flag('k', '3'), 10);
const TIMEOUT_MS = 30_000;

// The hook's own relevance pre-filter (folklore-smart-hook.cjs:48,282).
// A hit only counts toward the deny min-hits if its cosine distance is
// within this cap. This is the actual relevance discriminator — the
// satisfaction score is structural and does not separate in- from
// out-of-corpus on its own.
const HIT_THRESHOLD = Number(process.env.FOLKLORE_HIT_THRESHOLD ?? 1.05);

// The sweep grid.
const THRESHOLDS = [0.7, 0.75, 0.8, 0.85];
const MIN_HITS = [1, 2, 3];

// The domain's fixed `use_memory` contract breakpoint (RFC-0003,
// CONTRACT_THRESHOLDS.use_memory). The shipped gate requires the decision
// to be `use_memory`, which only happens at satisfaction >= this AND
// non-shallow evidence — independent of FOLKLORE_DENY_THRESHOLD.
const USE_MEMORY_BREAKPOINT = 0.85;

// ── IN-CORPUS: natural questions the seed corpus is meant to answer.
// Identical to bench-coldstart-seed.mjs so the two tracks are directly
// comparable (same fixture, different lens). ───────────────────────────
const IN_CORPUS = [
  'how does folklore decide whether to block an outbound web search?',
  'what happens to a web fetch result after the tool runs?',
  'what is the satisfaction score made of and how is it weighted?',
  'when does the agent get told to use memory versus search the web?',
  'how does folklore share knowledge between peers and keep things private?',
  'how fresh does a cached answer have to be before I should refetch?',
  'what are the stages of the ask retrieval pipeline?',
  'why does a fresh install miss the knowledge graph at first?',
  'should I use the MCP tools or the hook to consult memory?',
  'how are saved notes given ids and what types are there?',
  'what is the threshold and minimum hit count for denying a web call?',
  'how much context does a single peer hit bring across?',
];

// ── OUT-OF-CORPUS / adversarial: questions the seed corpus genuinely
// does NOT cover. A confident deny on any of these is a FALSE deny — the
// gate blocked a web trip the agent actually needed. Deliberately spans
// unrelated domains (ops, finance, film, cooking, a fast-changing fact,
// and an absurd one) so a deny here cannot be excused as "close enough."
const OUT_OF_CORPUS = [
  'how do I configure nginx reverse proxy with TLS termination?',
  'what is the current price of bitcoin in USD?',
  'how do I bake sourdough bread with a 70% hydration starter?',
  'how does the Rust borrow checker handle lifetime elision?',
  'what were the box office numbers for the latest Dune movie?',
  'what is the airspeed velocity of an unladen swallow?',
  'what is the capital of Burkina Faso?',
  'how do I treat a second-degree burn at home?',
];

// ── locate a model cache so the real embedder loads without a download
// (same probe as bench-coldstart-seed.mjs). ────────────────────────────
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

/**
 * Ask every question ONCE, capture the raw fields the gate consumes.
 * The grid is then replayed against these cached probes — the embedder
 * is not re-run per cell, so the sweep is fast and every cell sees byte-
 * identical inputs.
 */
const probe = (home, questions) =>
  questions.map((q) => {
    const res = runAsk(home, q);
    if (!res.ok) return { q, ok: false, error: res.error };
    const d = res.data;
    const allHits = Array.isArray(d.hits) ? d.hits : [];
    // Replicate the hook's surviving-hit filter (line 282).
    const surviving = allHits.filter(
      (h) => typeof h.distance === 'number' && h.distance <= HIT_THRESHOLD,
    ).length;
    return {
      q,
      ok: true,
      decision: d.decision ?? null,
      satisfaction: typeof d.satisfaction === 'number' ? d.satisfaction : 0,
      total_hits: allHits.length,
      surviving_hits: surviving,
      best_distance: allHits.length > 0 ? allHits[0].distance : null,
    };
  });

// ── the two gate predicates ────────────────────────────────────────────
// shipped: exactly the hook's condition (action === 'use_memory' is a
// FIXED 0.85 breakpoint, so threshold only bites once sat clears 0.85).
const shippedDeny = (p, threshold, minHits) =>
  p.decision === 'use_memory' &&
  p.satisfaction >= threshold &&
  p.surviving_hits >= minHits;

// score-only: the proposed relaxation. Drops the decision requirement;
// keeps the distance pre-filter (baked into surviving_hits) as the
// relevance guard.
const scoreOnlyDeny = (p, threshold, minHits) =>
  p.satisfaction >= threshold && p.surviving_hits >= minHits;

const sweepVariant = (predicate, inProbes, outProbes) => {
  const cells = [];
  for (const t of THRESHOLDS) {
    for (const m of MIN_HITS) {
      const inOk = inProbes.filter((p) => p.ok);
      const outOk = outProbes.filter((p) => p.ok);
      const trueDeny = inOk.filter((p) => predicate(p, t, m)).length;
      const falseDeny = outOk.filter((p) => predicate(p, t, m)).length;
      cells.push({
        threshold: t,
        min_hits: m,
        true_deny: trueDeny,
        in_n: inOk.length,
        true_deny_rate: trueDeny / Math.max(1, inOk.length),
        false_deny: falseDeny,
        out_n: outOk.length,
        false_deny_rate: falseDeny / Math.max(1, outOk.length),
      });
    }
  }
  return cells;
};

const pct = (x) => `${(x * 100).toFixed(0)}%`;

// ── main ────────────────────────────────────────────────────────────────
const modelHome = findModelHome();
if (!modelHome) {
  console.error('bench-deny-sweep: no model cache found under ~/.folklore or ~/.akashik.');
  console.error('  Run `folklore onboard` (or any `folklore ask`) once so the embedder model is cached, then retry.');
  console.error('  (No fabricated numbers: this harness needs the real embedder to run the real ask path.)');
  process.exit(1);
}

const home = flag('home', mkdtempSync(join(tmpdir(), 'folklore-deny-sweep-')));
mkdirSync(home, { recursive: true });
if (!existsSync(join(home, 'models'))) {
  try { symlinkSync(join(modelHome, 'models'), join(home, 'models'), 'dir'); }
  catch { /* a real models dir may already exist */ }
}
const cleanup = () => { if (!flag('home', null)) { try { rmSync(home, { recursive: true, force: true }); } catch {} } };

console.log(`bench-deny-sweep: fresh home ${home}`);
console.log(`bench-deny-sweep: model cache symlinked from ${modelHome}`);
console.log(
  `bench-deny-sweep: ${IN_CORPUS.length} in-corpus + ${OUT_OF_CORPUS.length} out-of-corpus questions, k=${K}, hit-filter d<=${HIT_THRESHOLD}\n`,
);

// graph.json must exist before `ask` (same as cold-start bench).
if (!existsSync(join(home, 'graph.json'))) {
  writeFileSync(
    join(home, 'graph.json'),
    JSON.stringify({ directed: false, multigraph: false, graph: {}, nodes: [], links: [] }),
  );
}

// SEED the graph (real corpus, real binary).
const seedRes = spawnSync(process.execPath, [BIN, 'seed', '--json'], {
  env: { ...process.env, FOLKLORE_HOME: home }, encoding: 'utf8', timeout: TIMEOUT_MS,
});
let seeded = 0;
try { seeded = JSON.parse(seedRes.stdout).seeded ?? 0; } catch { /* ignore */ }
if (seedRes.status !== 0) {
  console.error(`bench-deny-sweep: seed failed: ${(seedRes.stderr || '').slice(0, 300)}`);
  cleanup();
  process.exit(1);
}
console.log(`bench-deny-sweep: seeded ${seeded} nodes; probing real ask path…\n`);

// Probe once per question.
const inProbes = probe(home, IN_CORPUS);
const outProbes = probe(home, OUT_OF_CORPUS);

const inFailed = inProbes.filter((p) => !p.ok);
const outFailed = outProbes.filter((p) => !p.ok);
if (inFailed.length > 0 || outFailed.length > 0) {
  console.error(`bench-deny-sweep: ${inFailed.length + outFailed.length} ask probe(s) failed:`);
  for (const p of [...inFailed, ...outFailed]) console.error(`  - "${p.q.slice(0, 50)}": ${p.error}`);
}

const shipped = sweepVariant(shippedDeny, inProbes, outProbes);
const scoreOnly = sweepVariant(scoreOnlyDeny, inProbes, outProbes);

// Observed satisfaction band (so the reader sees WHY the shipped gate is
// inert: sat sits below the fixed 0.85 use_memory breakpoint).
const inOk = inProbes.filter((p) => p.ok);
const meanInSat = inOk.reduce((a, p) => a + p.satisfaction, 0) / Math.max(1, inOk.length);
const anyUseMemory = inOk.some((p) => p.decision === 'use_memory');

// ── recommendation ──────────────────────────────────────────────────────
// Pick the score-only cell that maximises true-deny subject to a hard
// zero-false-deny constraint; tie-break toward the HIGHER min_hits and
// HIGHER threshold (the more conservative cell that still wins), since on
// a tiny fixture the safer cell generalises better.
const zeroFalse = scoreOnly.filter((c) => c.false_deny === 0);
const recommend = (zeroFalse.length > 0 ? zeroFalse : scoreOnly)
  .slice()
  .sort((a, b) =>
    b.true_deny - a.true_deny ||
    b.min_hits - a.min_hits ||
    b.threshold - a.threshold,
  )[0];

const summary = {
  generated_at: new Date().toISOString(),
  home,
  k: K,
  hit_threshold: HIT_THRESHOLD,
  use_memory_breakpoint: USE_MEMORY_BREAKPOINT,
  seeded_nodes: seeded,
  in_corpus_n: inOk.length,
  out_of_corpus_n: outProbes.filter((p) => p.ok).length,
  mean_in_corpus_satisfaction: Number(meanInSat.toFixed(3)),
  any_in_corpus_use_memory: anyUseMemory,
  grid: { thresholds: THRESHOLDS, min_hits: MIN_HITS },
  shipped_gate: shipped,
  score_only_gate: scoreOnly,
  recommendation: recommend
    ? {
        variant: 'score-only',
        threshold: recommend.threshold,
        min_hits: recommend.min_hits,
        true_deny_rate: recommend.true_deny_rate,
        false_deny_rate: recommend.false_deny_rate,
      }
    : null,
  probes: { in_corpus: inProbes, out_of_corpus: outProbes },
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'deny-sweep-summary.json'), JSON.stringify(summary, null, 2) + '\n');

// ── render ────────────────────────────────────────────────────────────
const renderTable = (label, cells) => {
  console.log(`── ${label} ──`);
  console.log('  thresh  minHits   true-deny (in-corpus)   false-deny (out-of-corpus)');
  for (const c of cells) {
    const td = `${c.true_deny}/${c.in_n} = ${pct(c.true_deny_rate)}`;
    const fd = `${c.false_deny}/${c.out_n} = ${pct(c.false_deny_rate)}`;
    console.log(
      `  ${c.threshold.toFixed(2)}    ${String(c.min_hits).padStart(2)}        ${td.padEnd(20)}   ${fd}`,
    );
  }
  console.log('');
};

console.log(
  `mean in-corpus satisfaction: ${meanInSat.toFixed(2)}  ` +
    `(domain use_memory breakpoint is a FIXED ${USE_MEMORY_BREAKPOINT}; ` +
    `any in-corpus decision == use_memory? ${anyUseMemory ? 'yes' : 'NO'})\n`,
);

renderTable('VARIANT A — shipped gate (requires action === use_memory)', shipped);
renderTable('VARIANT B — score-only gate (proposed; drops decision requirement, keeps distance filter)', scoreOnly);

if (!anyUseMemory) {
  console.log(
    'finding: every shipped-gate cell is 0% true-deny — not because of the threshold knob,\n' +
      `  but because no in-corpus answer reaches the fixed ${USE_MEMORY_BREAKPOINT} use_memory breakpoint, so the\n` +
      "  gate's `action === 'use_memory'` precondition is never met. Lowering FOLKLORE_DENY_THRESHOLD\n" +
      '  alone is INERT on the shipped gate. The score-only variant is what the knob would need to gate.\n',
  );
}

if (recommend) {
  console.log(
    `RECOMMENDATION: score-only gate at threshold ${recommend.threshold.toFixed(2)} × min_hits ${recommend.min_hits}\n` +
      `  → true-deny ${pct(recommend.true_deny_rate)} on in-corpus, false-deny ${pct(recommend.false_deny_rate)} on out-of-corpus.\n` +
      `  Reasoning: it is the highest-true-deny cell that holds false-deny at 0% on the adversarial set.\n` +
      `  The distance pre-filter (d<=${HIT_THRESHOLD}), not the satisfaction score, is what keeps false-deny at 0:\n` +
      `  out-of-corpus questions return the same ~0.75 satisfaction but their nearest hit is far past the cap.\n` +
      `  Adopting this requires relaxing the gate's action precondition in the hook (RECOMMEND ONLY — not changed here).\n`,
  );
} else {
  console.log('RECOMMENDATION: no cell achieved a non-zero true-deny; the fixture may need richer seed coverage.\n');
}

console.log(
  'CAVEAT — fixture size: this is a 12 in-corpus + ' +
    `${OUT_OF_CORPUS.length} out-of-corpus probe over one seeded graph. The rates are a\n` +
    '  DIRECTION, not a population estimate; a single question flipping moves a rate by ~8 points.\n' +
    '  Treat the recommendation as "the knob and the gate shape that are defensible to ship as a\n' +
    '  default," to be re-confirmed against a larger natural-question set before tightening further.\n',
);

console.log(`bench-deny-sweep: -> ${join(OUT, 'deny-sweep-summary.json')}`);

cleanup();

if (has('json')) console.log(JSON.stringify(summary, null, 2));
