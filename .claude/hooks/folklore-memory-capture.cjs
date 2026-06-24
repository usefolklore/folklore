#!/usr/bin/env node
/**
 * folklore memory-capture hook — Stop · PreCompact · SessionEnd.
 *
 * Distills the ACTIVE session's own transcript into a single embedded
 * "where did we leave off" digest node (via `folklore remember`), so a
 * future context window can resume instead of starting blind. No API,
 * no model call — the distillation is heuristic over the transcript
 * Claude Code already wrote to disk.
 *
 * Triggers:
 *   Stop         → debounced (only re-captures every N new turns) so it
 *                  doesn't boot the embedder on every response.
 *   PreCompact   → FORCED — context is about to be summarised away.
 *   SessionEnd   → FORCED — last chance before the session closes.
 *
 * Graceful degradation: every error path exits 0 with no output so the
 * session is never blocked. The debounce check inside `remember` runs
 * BEFORE the runtime boots, so skipped Stops are cheap.
 */

'use strict';

const { execFileSync } = require('node:child_process');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const safe = (fn) => { try { return fn(); } catch { return undefined; } };
const payload = safe(() => JSON.parse(readFileSync(0, 'utf8') || '{}')) ?? {};

const transcript = typeof payload.transcript_path === 'string' ? payload.transcript_path : '';
const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();
const event = String(payload.hook_event_name || process.env.CLAUDE_HOOK_EVENT || '');

if (!transcript || !existsSync(transcript)) process.exit(0);

// Resolve the folklore engine: FOLKLORE_BIN → repo-local dist build →
// `folklore` on PATH (mirrors the prompt-submit hook).
const resolveEngine = () => {
  const bin = process.env.FOLKLORE_BIN;
  if (bin && existsSync(bin)) return { cmd: bin, pre: [] };
  const repoRoot = process.env.CLAUDE_PROJECT_DIR || join(__dirname, '..', '..');
  const distCli = join(repoRoot, 'dist', 'cli', 'index.js');
  if (existsSync(distCli)) return { cmd: process.execPath, pre: [distCli] };
  return { cmd: 'folklore', pre: [] };
};
const ENGINE = resolveEngine();

// PreCompact and SessionEnd force a capture; Stop is debounced.
const FORCE = event === 'PreCompact' || event === 'SessionEnd';
const args = ['remember', '--transcript', transcript];
if (FORCE) args.push('--force');

const TIMEOUT_MS = Number(process.env.FOLKLORE_CAPTURE_TIMEOUT_MS ?? 30000);

safe(() =>
  execFileSync(ENGINE.cmd, [...ENGINE.pre, ...args], {
    cwd, // so detectWorkspace() resolves the session's git repo
    timeout: TIMEOUT_MS,
    encoding: 'utf8',
    stdio: ['ignore', 'ignore', 'ignore'],
  }),
);

process.exit(0);
