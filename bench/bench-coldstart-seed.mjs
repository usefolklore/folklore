#!/usr/bin/env node
/**
 * Cold-start seeding benchmark — measured, reproducible before/after.
 *
 * The gap (bench-value-model / bench-user-value): a fresh install has an
 * empty graph, so the live `folklore ask` path deflects ~0% of web
 * searches on natural questions. The compounding thesis is real in the
 * simulator but the cold graph never gets warm in practice.
 *
 * This bench measures the FIX honestly:
 *   1. spin up a FRESH, EMPTY graph home (no nodes)
 *   2. run a fixed set of natural concept questions through the REAL
 *      `folklore ask --json` binary — exactly the path the PreToolUse
 *      hook exercises. We do NOT pass `--workspace all`: the live hook
 *      detects the current repo workspace, so this reproduces what the
 *      hook actually sees.
 *   3. record web-deflection rate (BEFORE) — expected ~0% on an empty graph
 *   4. run `folklore seed` (bundled corpus)
 *   5. re-run the same questions (AFTER)
 *   6. print the delta
 *
 * Deflection criteria mirror the deny-on-confidence gate + the
 * user-value bench:
 *   - deny_gate    : decision == use_memory AND hits >= DENY_MIN_HITS
 *                    AND satisfaction >= DENY_THRESHOLD  (the hard deny)
 *   - soft_deflect : decision in {use_memory, verify_one_source} AND
 *                    hits >= 1  (memory is usable; bench-user-value's bar)
 *
 * No web calls. No model downloads — the model cache is symlinked from an
 * existing folklore home. No fabricated numbers: every row is a real
 * `ask` invocation against a real (empty, then seeded) graph.
 *
 * Usage:
 *   node bench/bench-coldstart-seed.mjs [--json] [--k 3] [--home DIR]
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
const DENY_THRESHOLD = Number(process.env.FOLKLORE_DENY_THRESHOLD ?? 0.85);
const DENY_MIN_HITS = Number(process.env.FOLKLORE_DENY_MIN_HITS ?? 2);
const TIMEOUT_MS = 30_000;

// Natural concept questions an agent asks in its first session working in
// this repo — the kind the live hook would otherwise send to the web.
// Phrased as questions, NOT verbatim node titles, so retrieval has to do
// real semantic work (no title-paste shortcut).
const QUESTIONS = [
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

// ── locate a model cache so the real embedder loads without a download ──
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

const evaluate = (home, label) => {
  const rows = [];
  for (const q of QUESTIONS) {
    const res = runAsk(home, q);
    if (!res.ok) { rows.push({ q, ok: false, error: res.error }); continue; }
    const d = res.data;
    const hits = Array.isArray(d.hits) ? d.hits.length : 0;
    const decision = d.decision ?? null;
    const sat = typeof d.satisfaction === 'number' ? d.satisfaction : 0;
    const denyGate = decision === 'use_memory' && hits >= DENY_MIN_HITS && sat >= DENY_THRESHOLD;
    const softDeflect = ['use_memory', 'verify_one_source'].includes(decision) && hits >= 1;
    rows.push({ q, ok: true, hits, decision, satisfaction: sat, denyGate, softDeflect });
  }
  const ok = rows.filter((r) => r.ok);
  const deny = ok.filter((r) => r.denyGate).length;
  const soft = ok.filter((r) => r.softDeflect).length;
  return {
    label,
    n: rows.length,
    ok: ok.length,
    deny_gate_deflections: deny,
    deny_gate_rate: deny / Math.max(1, rows.length),
    soft_deflections: soft,
    soft_deflect_rate: soft / Math.max(1, rows.length),
    mean_hits: ok.reduce((a, r) => a + r.hits, 0) / Math.max(1, ok.length),
    mean_satisfaction: ok.reduce((a, r) => a + r.satisfaction, 0) / Math.max(1, ok.length),
    rows,
  };
};

const pct = (x) => `${(x * 100).toFixed(1)}%`;

// ── main ──
const modelHome = findModelHome();
if (!modelHome) {
  console.error('bench-coldstart-seed: no model cache found under ~/.folklore or ~/.akashik.');
  console.error('  Run `folklore onboard` (or any `folklore ask`) once so the embedder model is cached, then retry.');
  process.exit(1);
}

const home = flag('home', mkdtempSync(join(tmpdir(), 'folklore-coldstart-')));
mkdirSync(home, { recursive: true });
if (!existsSync(join(home, 'models'))) {
  try { symlinkSync(join(modelHome, 'models'), join(home, 'models'), 'dir'); }
  catch { /* a real models dir may already exist */ }
}
const cleanup = () => { if (!flag('home', null)) { try { rmSync(home, { recursive: true, force: true }); } catch {} } };

console.log(`bench-coldstart-seed: fresh home ${home}`);
console.log(`bench-coldstart-seed: model cache symlinked from ${modelHome}`);
console.log(`bench-coldstart-seed: ${QUESTIONS.length} natural questions, k=${K}, deny>= ${DENY_THRESHOLD}/${DENY_MIN_HITS} hits\n`);

// BEFORE — empty graph. `ask` needs a graph.json to exist; create empty.
if (!existsSync(join(home, 'graph.json'))) {
  writeFileSync(join(home, 'graph.json'), JSON.stringify({ directed: false, multigraph: false, graph: {}, nodes: [], links: [] }));
}
const before = evaluate(home, 'before (empty graph)');

// SEED
const seedRes = spawnSync(process.execPath, [BIN, 'seed', '--json'], {
  env: { ...process.env, FOLKLORE_HOME: home }, encoding: 'utf8', timeout: TIMEOUT_MS,
});
let seeded = 0;
try { seeded = JSON.parse(seedRes.stdout).seeded ?? 0; } catch { /* ignore */ }
if (seedRes.status !== 0) {
  console.error(`bench-coldstart-seed: seed failed: ${(seedRes.stderr || '').slice(0, 300)}`);
  cleanup();
  process.exit(1);
}

// AFTER — seeded graph.
const after = evaluate(home, `after (seeded ${seeded} nodes)`);

const summary = {
  generated_at: new Date().toISOString(),
  home,
  questions: QUESTIONS.length,
  k: K,
  deny_threshold: DENY_THRESHOLD,
  deny_min_hits: DENY_MIN_HITS,
  seeded_nodes: seeded,
  before: { ...before, rows: undefined },
  after: { ...after, rows: undefined },
  delta: {
    deny_gate_rate: after.deny_gate_rate - before.deny_gate_rate,
    soft_deflect_rate: after.soft_deflect_rate - before.soft_deflect_rate,
    mean_hits: after.mean_hits - before.mean_hits,
  },
  rows_after: after.rows,
};

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'coldstart-seed-summary.json'), JSON.stringify(summary, null, 2) + '\n');

const line = (s) =>
  `${s.label.padEnd(26)}  deny-gate ${pct(s.deny_gate_rate).padStart(6)}   soft-deflect ${pct(s.soft_deflect_rate).padStart(6)}   mean-hits ${s.mean_hits.toFixed(2)}   mean-sat ${s.mean_satisfaction.toFixed(2)}`;
console.log(line(before));
console.log(line(after));
console.log('');
console.log(`web-deflection (deny gate):  ${pct(before.deny_gate_rate)}  →  ${pct(after.deny_gate_rate)}   (+${pct(after.deny_gate_rate - before.deny_gate_rate)})`);
console.log(`web-deflection (soft/memory): ${pct(before.soft_deflect_rate)}  →  ${pct(after.soft_deflect_rate)}   (+${pct(after.soft_deflect_rate - before.soft_deflect_rate)})`);
console.log(`\nbench-coldstart-seed: -> ${join(OUT, 'coldstart-seed-summary.json')}`);

cleanup();

if (has('json')) console.log(JSON.stringify(summary, null, 2));
