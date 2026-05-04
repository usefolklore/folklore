/**
 * Tiny IPC client used by CLI commands that need to talk to the
 * already-running daemon (jobs.ts, future trigger / this when we
 * route them through the queue).
 *
 * Mirrors the wire format used in bin/wellinformed.js but lives in
 * the TS surface so commands compiled into dist/ can use it without
 * the bin shim's auto-delegation.
 *
 * Returns null on any failure (no socket, timeout, parse error,
 * fallback sentinel) — callers decide whether that's fatal.
 */

import { existsSync } from 'node:fs';
import { connect } from 'node:net';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { wellinformedHome } from './runtime.js';

const FALLBACK_SENTINEL = '__fallback__';
const TIMEOUT_MS = 8000;

interface IpcResponse {
  readonly id: number;
  readonly ok: boolean;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exit?: number;
}

const ipcCall = (cmd: string, args: readonly string[]): Promise<IpcResponse | null> =>
  new Promise((resolve) => {
    const sockPath = join(wellinformedHome(), 'daemon.sock');
    if (!existsSync(sockPath)) {
      resolve(null);
      return;
    }
    const socket = connect(sockPath);
    let settled = false;
    const done = (v: IpcResponse | null): void => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* benign */ }
      resolve(v);
    };
    const timer = setTimeout(() => done(null), TIMEOUT_MS);

    socket.on('connect', () => {
      const req = { id: Date.now(), cmd, args: [...args] };
      socket.write(JSON.stringify(req) + '\n');
    });
    socket.on('error', () => {
      clearTimeout(timer);
      done(null);
    });

    const rl = createInterface({ input: socket });
    rl.on('line', (line) => {
      clearTimeout(timer);
      try {
        const resp = JSON.parse(line) as IpcResponse;
        if (resp.stderr === FALLBACK_SENTINEL) done(null);
        else done(resp);
      } catch {
        done(null);
      }
    });
  });

/**
 * Send `cmd` + args and return raw stdout. On any failure logs the
 * stderr (if any) and returns null so the caller can decide.
 */
export const ipcCallLines = async (
  cmd: string,
  args: readonly string[],
): Promise<string | null> => {
  const resp = await ipcCall(cmd, args);
  if (!resp) return null;
  if (!resp.ok || (resp.exit ?? 0) !== 0) {
    if (resp.stderr) process.stderr.write(resp.stderr);
    return null;
  }
  return resp.stdout ?? '';
};

/**
 * Convenience wrapper: parse stdout as JSON. Returns null on any
 * IPC failure or parse failure.
 */
export const ipcCallJson = async <T>(
  cmd: string,
  args: readonly string[],
): Promise<T | null> => {
  const out = await ipcCallLines(cmd, args);
  if (out === null) return null;
  try {
    return JSON.parse(out) as T;
  } catch {
    return null;
  }
};
