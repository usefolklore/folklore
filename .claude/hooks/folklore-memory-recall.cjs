#!/usr/bin/env node
/**
 * folklore memory-recall hook — SessionStart.
 *
 * Injects the most recent "where did we leave off" digest for this
 * workspace (captured by `folklore remember`) as additionalContext, so
 * a fresh / cleared / compacted context window opens already knowing
 * the last goal, decisions, files touched, and open threads.
 *
 * Reads back via `folklore resume` (graph.json only — no embedder
 * boot, fast). Emits nothing when there's no prior session memory.
 * Every error path exits 0 with no output so startup is never blocked.
 */

'use strict';

const { execFileSync } = require('node:child_process');
const { readFileSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const safe = (fn) => { try { return fn(); } catch { return undefined; } };
const payload = safe(() => JSON.parse(readFileSync(0, 'utf8') || '{}')) ?? {};
const cwd = typeof payload.cwd === 'string' && payload.cwd ? payload.cwd : process.cwd();

const resolveEngine = () => {
  const bin = process.env.FOLKLORE_BIN;
  if (bin && existsSync(bin)) return { cmd: bin, pre: [] };
  const repoRoot = process.env.CLAUDE_PROJECT_DIR || join(__dirname, '..', '..');
  const distCli = join(repoRoot, 'dist', 'cli', 'index.js');
  if (existsSync(distCli)) return { cmd: process.execPath, pre: [distCli] };
  return { cmd: 'folklore', pre: [] };
};
const ENGINE = resolveEngine();
const TIMEOUT_MS = Number(process.env.FOLKLORE_RESUME_TIMEOUT_MS ?? 5000);

const out = safe(() =>
  execFileSync(ENGINE.cmd, [...ENGINE.pre, 'resume', '--limit', String(process.env.FOLKLORE_RESUME_LIMIT ?? 1)], {
    cwd,
    timeout: TIMEOUT_MS,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }),
);

const text = (out || '').trim();
if (text.length === 0) process.exit(0);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: text,
    },
  }) + '\n',
);
process.exit(0);
