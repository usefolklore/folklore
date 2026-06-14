#!/usr/bin/env node
/**
 * Product-shaped end-to-end benchmark — measures what a USER feels,
 * not retrieval quality (BEIR lives in bench-beir*.mjs).
 *
 * Scenarios (each timed as full CLI wall-clock, including Node boot):
 *   warm-ask    `akashik ask` with the daemon up (IPC fast path)
 *   fed-ask     `akashik ask --peers` over the real libp2p wire
 *   save        `akashik save` of a short synthesis node
 *
 * Prereqs: a running daemon for `home` (and for fed-ask, at least one
 * connected peer daemon holding content).
 *
 * Usage:
 *   node scripts/bench-e2e.mjs --home /tmp/akashik-e2e/peerB \
 *     [--bin bin/akashik.js] [--n 15] [--json]
 *
 * The web-fetch comparison line uses the README's 1–2s paid-fetch
 * claim as a reference band; it is NOT measured here.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : dflt;
};
const has = (name) => argv.includes(`--${name}`);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BIN = flag('bin', join(ROOT, 'bin', 'akashik.js'));
const HOME = flag('home', process.env.AKASHIK_HOME ?? '');
const N = parseInt(flag('n', '15'), 10);

if (!HOME) {
  console.error('bench-e2e: --home <dir> (or $AKASHIK_HOME) is required');
  process.exit(1);
}

const QUERIES = [
  'does stream.close need await in libp2p',
  'sqlite native module node compatibility',
  'how do peers share knowledge',
  'unhandled promise rejection in finally block',
  'vector search latency on cpu',
];

const timeCli = (args) => {
  const t0 = performance.now();
  const r = spawnSync(process.execPath, [BIN, ...args], {
    env: { ...process.env, AKASHIK_HOME: HOME },
    encoding: 'utf8',
    timeout: 30_000,
  });
  const ms = performance.now() - t0;
  return { ms, ok: r.status === 0, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};

const pct = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

const summarize = (name, samples) => {
  const ok = samples.filter((s) => s.ok);
  const times = ok.map((s) => s.ms).sort((a, b) => a - b);
  if (times.length === 0) return { name, n: samples.length, ok: 0 };
  return {
    name,
    n: samples.length,
    ok: ok.length,
    p50_ms: Math.round(pct(times, 50)),
    p95_ms: Math.round(pct(times, 95)),
    min_ms: Math.round(times[0]),
    max_ms: Math.round(times[times.length - 1]),
  };
};

const scenarios = [];

// warm-ask — daemon IPC fast path
{
  const samples = [];
  for (let i = 0; i < N; i++) {
    samples.push(timeCli(['ask', QUERIES[i % QUERIES.length]]));
  }
  scenarios.push(summarize('warm-ask (daemon IPC)', samples));
}

// fed-ask — full libp2p round trip
{
  const samples = [];
  for (let i = 0; i < N; i++) {
    samples.push(timeCli(['ask', QUERIES[i % QUERIES.length], '--peers', '--workspace', 'all']));
  }
  scenarios.push(summarize('fed-ask (libp2p wire)', samples));
}

// save — write path
{
  const samples = [];
  for (let i = 0; i < N; i++) {
    samples.push(timeCli([
      'save',
      '--label', `bench node ${i}`,
      '--type', 'synthesis',
      '--text', `benchmark payload ${i}: short synthesis body for write-path timing.`,
    ]));
  }
  scenarios.push(summarize('save (write path)', samples));
}

if (has('json')) {
  console.log(JSON.stringify({ home: HOME, n: N, scenarios, measured_at: new Date().toISOString() }, null, 2));
} else {
  console.log(`bench-e2e — home=${HOME} n=${N}\n`);
  console.log('scenario                    ok    p50      p95      min      max');
  for (const s of scenarios) {
    if (!s.p50_ms) { console.log(`${s.name.padEnd(26)} ${String(s.ok).padStart(3)}/${s.n}  (all failed)`); continue; }
    console.log(
      `${s.name.padEnd(26)} ${String(s.ok).padStart(3)}/${s.n}  ${String(s.p50_ms).padStart(5)}ms  ${String(s.p95_ms).padStart(5)}ms  ${String(s.min_ms).padStart(5)}ms  ${String(s.max_ms).padStart(5)}ms`,
    );
  }
  console.log('\nreference band: paid web fetch ≈ 1000–2000ms (README claim, not measured here)');
}
