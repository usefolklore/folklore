/**
 * Process lock — file-based exclusive lock for cross-process mutation
 * coordination. v4.1 fix for the v4.0 caveat documented in
 * docs/RELEASE-v4.md §4 ("run consolidate with daemon stopped").
 *
 * Mutating CLI commands (consolidate, index, trigger) acquire this
 * lock before touching graph.json / vectors.db. The daemon holds it
 * for its entire lifetime. A waiting process polls until the lock
 * frees OR the deadline expires.
 *
 * Mechanism:
 *   - POSIX exclusive-create on `<home>/wellinformed.lock` (the same
 *     pattern peer-store.ts uses for its short-lived peers.json mutex,
 *     scaled to a top-level write barrier).
 *   - Lock file content: JSON `{ pid, owner, timestamp }`. The `owner`
 *     string is human-readable ("daemon", "consolidate", "index"...)
 *     so error messages can name what's holding the lock.
 *   - Stale-lock recovery: if the lock file's PID is no longer alive
 *     (kill -0 fails) or the timestamp is older than `staleAfterMs`,
 *     the lock is forcibly broken and re-acquired.
 *   - Long-running owners (the daemon) refresh the lock's timestamp
 *     periodically via `refreshLock` so they don't get reaped.
 *
 * Pure-ish: file I/O at the boundary, returns ResultAsync. No global
 * state in this module; each call is independent.
 */

import { open, readFile, unlink, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { PeerError, type AppError } from '../domain/errors.js';

// ─────────────── shape ───────────────

export interface LockInfo {
  readonly pid: number;
  readonly owner: string;
  /** Epoch ms when the lock was acquired or last refreshed. */
  readonly timestamp: number;
}

export interface LockHandle {
  /** Path of the lock file we're holding. */
  readonly path: string;
  /** Owner tag used at acquisition. */
  readonly owner: string;
  /**
   * Refresh the lock's timestamp (extends the staleness window).
   * Long-running holders (daemon) call this on a timer.
   */
  refresh(): Promise<void>;
  /** Release the lock — deletes the file. Idempotent. */
  release(): Promise<void>;
}

export interface AcquireOptions {
  /** Owner tag — surfaces in error messages of contending processes. */
  readonly owner: string;
  /** How long to wait for the lock before giving up. Default 0 (fail fast). */
  readonly waitMs?: number;
  /** Polling interval while waiting. Default 100 ms. */
  readonly pollIntervalMs?: number;
  /** Locks older than this are considered stale + broken. Default 60 s. */
  readonly staleAfterMs?: number;
}

// ─────────────── helpers ───────────────

const lockPath = (homeDir: string): string => join(homeDir, 'wellinformed.lock');

const readLockInfo = async (path: string): Promise<LockInfo | null> => {
  try {
    const text = await readFile(path, 'utf8');
    const parsed = JSON.parse(text) as Partial<LockInfo>;
    if (typeof parsed.pid !== 'number' || typeof parsed.timestamp !== 'number' || typeof parsed.owner !== 'string') {
      return null;
    }
    return { pid: parsed.pid, owner: parsed.owner, timestamp: parsed.timestamp };
  } catch {
    return null;
  }
};

const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const isStale = async (path: string, staleAfterMs: number): Promise<boolean> => {
  const info = await readLockInfo(path);
  if (!info) return true; // unparseable → treat as stale
  if (!isProcessAlive(info.pid)) return true; // owner crashed
  if (Date.now() - info.timestamp > staleAfterMs) return true; // stale heartbeat
  return false;
};

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

// ─────────────── acquire / release ───────────────

/**
 * Try to acquire the wellinformed write lock. Returns a LockHandle on
 * success. On failure (already held + waitMs exhausted), returns the
 * conflicting LockInfo so the caller can render a useful error.
 */
export const acquireLock = (
  homeDir: string,
  opts: AcquireOptions,
): ResultAsync<LockHandle, AppError> => {
  const path = lockPath(homeDir);
  const waitMs = opts.waitMs ?? 0;
  const pollMs = opts.pollIntervalMs ?? 100;
  const staleAfterMs = opts.staleAfterMs ?? 60_000;
  const deadline = Date.now() + waitMs;

  const tryAcquire = async (): Promise<LockHandle | LockInfo> => {
    while (true) {
      try {
        await mkdir(dirname(path), { recursive: true });
        const fh = await open(path, 'wx'); // exclusive create — fails if exists
        const info: LockInfo = {
          pid: process.pid,
          owner: opts.owner,
          timestamp: Date.now(),
        };
        await fh.writeFile(JSON.stringify(info));
        await fh.close();
        return buildHandle(path, opts.owner);
      } catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if (code !== 'EEXIST') throw e;
        // Lock file exists. Check staleness and decide whether to break it.
        if (await isStale(path, staleAfterMs)) {
          try { await unlink(path); } catch { /* race ok */ }
          continue;
        }
        // Held + fresh. Either fail fast or wait.
        if (Date.now() >= deadline) {
          const info = await readLockInfo(path);
          return info ?? { pid: -1, owner: 'unknown', timestamp: Date.now() };
        }
        await sleep(pollMs);
      }
    }
  };

  return ResultAsync.fromPromise(
    tryAcquire(),
    (e): AppError => PeerError.identityWriteError(path, (e as Error).message),
  ).andThen((result) => {
    if ('release' in result) return okAsync<LockHandle, AppError>(result);
    // Conflict — render a typed error
    return errAsync<LockHandle, AppError>(
      PeerError.identityWriteError(
        path,
        `wellinformed.lock held by ${result.owner} (pid=${result.pid}); wait or stop the holder`,
      ),
    );
  });
};

const buildHandle = (path: string, owner: string): LockHandle => {
  return {
    path,
    owner,
    refresh: async () => {
      const info: LockInfo = {
        pid: process.pid,
        owner,
        timestamp: Date.now(),
      };
      // Write-and-rename for atomicity on the refresh path so a torn
      // write can't corrupt the lock file mid-read.
      const tmp = `${path}.tmp`;
      await writeFile(tmp, JSON.stringify(info));
      const { rename } = await import('node:fs/promises');
      await rename(tmp, path);
    },
    release: async () => {
      if (!existsSync(path)) return; // already released — idempotent
      try { await unlink(path); } catch { /* best-effort */ }
    },
  };
};

/**
 * Convenience: read the current lock info without acquiring. Used by
 * `wellinformed status` style commands that want to surface "is anyone
 * mutating?" without blocking.
 */
export const peekLock = (homeDir: string): ResultAsync<LockInfo | null, AppError> =>
  ResultAsync.fromPromise(
    (async () => {
      const path = lockPath(homeDir);
      if (!existsSync(path)) return null;
      return readLockInfo(path);
    })(),
    (e): AppError => PeerError.identityReadError(lockPath(homeDir), (e as Error).message),
  );

/** Re-export the lock path so callers + tests don't have to compute it. */
export { lockPath };
