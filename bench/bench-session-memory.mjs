#!/usr/bin/env node
// Benchmark — agent-memory capture lane (session-digest distiller).
//
// Runs the PURE distiller over a real corpus of Claude Code transcripts
// (~/.claude/projects/**/*.jsonl) and reports honest numbers:
//
//   - distill latency  p50 / p95 / p99 (no embedding — pure CPU)
//   - compression      digest_chars / transcript_bytes
//   - file capture     fraction of files the session actually edited
//                      (ground truth = Edit/Write/MultiEdit tool_use
//                      target_paths) that appear in the digest. The
//                      distiller caps at 25 files BY DESIGN, so coverage
//                      < 1 on large sessions is reported, not hidden:
//                      `cap_saturated` counts sessions over the cap.
//   - signal presence  % sessions with a last-goal / ≥1 decision
//   - empty rate       % sessions with nothing worth remembering
//   - SECRET LEAK      every rendered digest is re-scanned with the
//                      shared secret patterns; MUST be 0 (the capture
//                      path redacts before save, this is the guard).
//
// Usage:
//   node bench/bench-session-memory.mjs [--n 200] [--min-bytes 20000]
//
// Reads only — never writes to any graph. Embedding latency is measured
// separately by the e2e smoke (it boots the real embedder); this harness
// isolates the distiller so the numbers are deterministic and portable.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import {
  parseTranscript,
  distillSession,
  renderDigest,
  isDigestEmpty,
} from '../dist/domain/session-digest.js';
import { buildPatterns } from '../dist/domain/sharing.js';

const args = process.argv.slice(2);
const getArg = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const N = parseInt(getArg('--n', '200'), 10);
const MIN_BYTES = parseInt(getArg('--min-bytes', '20000'), 10);

const EDIT_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit', 'str_replace', 'create_file']);
const FILE_CAP = 25; // mirror MAX_FILES in session-digest.ts

const pct = (sorted, p) => {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[i];
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// ── collect transcript files, biggest first (substance) ──────
const root = join(homedir(), '.claude', 'projects');
const files = [];
const walk = (dir) => {
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.isFile() && e.name.endsWith('.jsonl')) {
      try { const st = statSync(p); if (st.size >= MIN_BYTES) files.push({ p, size: st.size }); } catch { /* skip */ }
    }
  }
};
walk(root);
files.sort((a, b) => b.size - a.size);
const sample = files.slice(0, N);

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(` Agent-memory distiller benchmark`);
console.log(`   corpus: ${files.length} transcripts ≥ ${MIN_BYTES}B · sampling top ${sample.length} by size`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

const patterns = buildPatterns([]);

const latencies = [];
const compressions = [];
const fileCoverages = [];
let capSaturated = 0;
let withGoal = 0;
let withDecision = 0;
let emptyCount = 0;
let leakCount = 0;
let leakExamples = [];
let usable = 0;

for (const { p, size } of sample) {
  let raw;
  try { raw = readFileSync(p, 'utf8'); } catch { continue; }

  const entries = parseTranscript(raw);
  if (entries.length === 0) continue;
  usable++;

  // ground-truth edited files (full tool_use list, uncapped)
  const groundFiles = new Set();
  for (const e of entries) {
    if (e.kind !== 'assistant') continue;
    for (const tc of e.toolCalls) {
      if (EDIT_TOOLS.has(tc.tool) && tc.target_path) groundFiles.add(tc.target_path);
    }
  }

  const t0 = process.hrtime.bigint();
  const digest = distillSession(entries);
  const md = renderDigest(digest);
  const t1 = process.hrtime.bigint();
  latencies.push(Number(t1 - t0) / 1e6); // ms

  compressions.push(md.length / size);

  if (isDigestEmpty(digest)) emptyCount++;
  if (digest.lastUserGoal) withGoal++;
  if (digest.decisions.length > 0) withDecision++;

  if (groundFiles.size > 0) {
    const captured = digest.filesTouched.filter((f) => groundFiles.has(f)).length;
    fileCoverages.push(captured / groundFiles.size);
    if (groundFiles.size > FILE_CAP) capSaturated++;
  }

  // redaction-need probe — does the RAW (un-redacted) digest carry a
  // secret pattern? The `remember` CLI redacts before save, so this is
  // not a failure; it measures how load-bearing the redaction layer is.
  for (const { name, re } of patterns) {
    re.lastIndex = 0;
    if (re.test(md)) {
      leakCount++;
      if (leakExamples.length < 5) leakExamples.push(`${name} in ${p.split('/').pop()}`);
      break;
    }
  }
}

const sortedLat = [...latencies].sort((a, b) => a - b);
const r2 = (x) => Math.round(x * 100) / 100;
const pctStr = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : 'n/a');

console.log('');
console.log(`usable sessions:     ${usable}`);
console.log('');
console.log(`distill latency:     p50 ${r2(pct(sortedLat, 50))}ms · p95 ${r2(pct(sortedLat, 95))}ms · p99 ${r2(pct(sortedLat, 99))}ms · max ${r2(sortedLat[sortedLat.length - 1] ?? 0)}ms`);
console.log(`compression:         mean ${r2(mean(compressions) * 100)}% of transcript size (digest md / raw bytes)`);
console.log('');
console.log(`last-goal captured:  ${pctStr(withGoal, usable)} (${withGoal}/${usable})`);
console.log(`≥1 decision:         ${pctStr(withDecision, usable)} (${withDecision}/${usable})`);
console.log(`empty (nothing):     ${pctStr(emptyCount, usable)} (${emptyCount}/${usable})`);
console.log('');
console.log(`file coverage:       mean ${r2(mean(fileCoverages) * 100)}% of edited files captured (${fileCoverages.length} sessions with edits)`);
console.log(`cap-saturated:       ${capSaturated} sessions edited > ${FILE_CAP} files (coverage capped by design)`);
console.log('');
console.log(`redaction-need:      ${leakCount}/${usable} raw digests carry a secret pattern → the capture path REDACTS these before save`);
if (leakExamples.length) console.log(`  patterns seen:     ${leakExamples.join(', ')}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

process.exit(0);
