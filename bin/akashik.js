#!/usr/bin/env node
/**
 * akashik CLI entry (thin shim + optional IPC delegation).
 *
 * Fast path — if `$AKASHIK_HOME/daemon.sock` exists AND the
 * requested command is in the IPC-delegatable set, send the argv over
 * the socket, print the daemon's response, exit. Avoids ~240 ms of
 * sqlite-vec open + ONNX model load that a one-shot CLI would
 * otherwise pay.
 *
 * Slow path (fallback) — import the compiled CLI from ../dist. Falls
 * back further to `npx tsx` on the source for local development.
 *
 * The Node-boot floor (~500 ms) still applies because this file IS
 * the spawned process. A v4.1 native binary client can collapse the
 * end-to-end number closer to 15 ms.
 */

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { connect } from 'node:net';
import { createInterface } from 'node:readline';

// libp2p occasionally throws StreamStateError during peer-stream
// teardown AFTER the actual work has completed and stdout has been
// flushed. The process should exit clean (CLI) or keep serving (MCP)
// rather than crash with a stack trace. We swallow those specific
// teardown errors; anything else still crashes as normal so real
// bugs aren't masked.
const isP2pTeardownNoise = (err) => {
  if (!err) return false;
  const name = err.constructor?.name ?? err.name ?? '';
  if (name === 'StreamStateError' || name === 'AbortError') return true;
  const msg = String(err.message ?? '');
  return /Cannot write to a stream that is closing|stream is .*closed|TimeoutController/i.test(msg);
};
process.on('uncaughtException', (err) => {
  if (isP2pTeardownNoise(err)) {
    if (process.env.AKASHIK_DEBUG) process.stderr.write(`[wi] libp2p teardown noise: ${err.message}\n`);
    return;
  }
  console.error(err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  if (isP2pTeardownNoise(reason)) {
    if (process.env.AKASHIK_DEBUG) process.stderr.write(`[wi] libp2p teardown noise: ${reason?.message ?? reason}\n`);
    return;
  }
  console.error(reason);
  process.exit(1);
});

const here = dirname(fileURLToPath(import.meta.url));
const distEntry = join(here, '..', 'dist', 'cli', 'index.js');
const srcEntry = join(here, '..', 'src', 'cli', 'index.ts');

// ── IPC delegation (fast path for read-only queries) ──

// Keep this list in sync with IPC_DELEGATABLE_COMMANDS in
// src/daemon/ipc-handlers.ts. Duplicated here to avoid importing the
// compiled TS surface before we know whether delegation will succeed.
const IPC_DELEGATABLE = new Set(['ask', 'stats', 'cache-stats', 'metrics']);
const IPC_FALLBACK_SENTINEL = '__fallback__';
const IPC_TIMEOUT_MS = 5000;

const akashikHome = () =>
  process.env.AKASHIK_HOME ?? join(homedir(), '.akashik');

const attemptIpcDelegation = (cmd, args) =>
  new Promise((resolve) => {
    const sockPath = join(akashikHome(), 'daemon.sock');
    if (!existsSync(sockPath)) { resolve(null); return; }

    const socket = connect(sockPath);
    let settled = false;
    const done = (v) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch {}
      resolve(v);
    };
    const timer = setTimeout(() => done(null), IPC_TIMEOUT_MS);

    socket.on('connect', () => {
      const req = { id: Date.now(), cmd, args: [...args] };
      socket.write(JSON.stringify(req) + '\n');
    });
    socket.on('error', () => { clearTimeout(timer); done(null); });

    const rl = createInterface({ input: socket });
    rl.on('line', (line) => {
      clearTimeout(timer);
      try {
        const resp = JSON.parse(line);
        if (resp.stderr === IPC_FALLBACK_SENTINEL) done(null);
        else done(resp);
      } catch {
        done(null);
      }
    });
  });

const [cmd, ...cmdArgs] = process.argv.slice(2);

// If the command is delegatable AND a daemon is running, try IPC first.
if (cmd && IPC_DELEGATABLE.has(cmd)) {
  const resp = await attemptIpcDelegation(cmd, cmdArgs);
  if (resp) {
    if (resp.stdout) process.stdout.write(resp.stdout);
    if (resp.stderr) process.stderr.write(resp.stderr);
    process.exit(resp.exit ?? 0);
  }
  // else: no daemon, or daemon returned fallback sentinel → continue to spawn
}

// ── slow path: load the compiled CLI (or tsx source) ──

if (existsSync(distEntry)) {
  await import(distEntry);
} else if (existsSync(srcEntry)) {
  const result = spawnSync('npx', ['--yes', 'tsx', srcEntry, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
} else {
  console.error('akashik: no build output and no source found.');
  console.error('run `npm install && npm run build` from the project root.');
  process.exit(1);
}
