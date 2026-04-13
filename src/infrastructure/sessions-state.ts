/**
 * Session state file — persists incremental ingest progress to
 * ~/.wellinformed/sessions-state.json.
 *
 * Schema: { version: 1, files: { [absPath]: { mtime, byteOffset, lastLineNum } } }
 *
 * Atomic writes via write-to-tmp + rename to prevent file corruption.
 * Cross-process lock via exclusive-create (.lock file) — same pattern as peer-store.ts.
 * No classes, neverthrow ResultAsync for all I/O.
 *
 * Error type: SE.stateFileError for all state file I/O failures.
 * NEVER silently swallows parse errors — corrupt state would cause the adapter
 * to re-read entire 50 MB transcripts from byte 0 on the next tick.
 */
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { readFile, writeFile, mkdir, rename, open, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { SessionError } from '../domain/errors.js';
import { SessionError as SE } from '../domain/errors.js';
import type { SessionState, SessionFileState } from '../domain/sessions.js';

/** Current sessions-state.json schema version. Bump when making breaking changes. */
const SESSIONS_STATE_VERSION = 1 as const;

// ─────────────────────── lock constants ───────────────────
/**
 * Cross-process lock for sessions-state.json mutations.
 * Uses exclusive-create (`wx` flag) on a sibling `.lock` file — POSIX
 * atomic exclusive file creation with no external dependency.
 */
const STALE_LOCK_MS = 30_000;
const LOCK_RETRY_DELAY_MS = 50;
const LOCK_MAX_WAIT_MS = 5_000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

const isStaleLock = async (lockPath: string): Promise<boolean> => {
  try {
    const text = await readFile(lockPath, 'utf8');
    const parsed = JSON.parse(text) as { pid?: number; timestamp?: number };
    if (typeof parsed.timestamp !== 'number') return true;
    return Date.now() - parsed.timestamp > STALE_LOCK_MS;
  } catch {
    // Unreadable lock file — treat as stale so we do not deadlock forever
    return true;
  }
};

const acquireLock = async (lockPath: string): Promise<void> => {
  const deadline = Date.now() + LOCK_MAX_WAIT_MS;
  while (true) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(
        JSON.stringify({ pid: process.pid, timestamp: Date.now() }),
      );
      await handle.close();
      return;
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== 'EEXIST') throw err;
      if (await isStaleLock(lockPath)) {
        try {
          await unlink(lockPath);
        } catch {
          // Another process may have cleaned it up — retry
        }
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`timed out waiting for sessions-state.json lock after ${LOCK_MAX_WAIT_MS}ms`);
      }
      await sleep(LOCK_RETRY_DELAY_MS);
    }
  }
};

const releaseLock = async (lockPath: string): Promise<void> => {
  try {
    await unlink(lockPath);
  } catch {
    // Lock already gone — benign
  }
};

// ─────────────────────── constants ────────────────────────

const EMPTY_STATE: SessionState = Object.freeze({
  version: SESSIONS_STATE_VERSION,
  files: {},
});

// ─────────────────────── I/O operations ───────────────────

/**
 * Load session ingest state from disk.
 * Returns an empty state if the file does not exist (first-run semantics).
 * Returns err(stateFileError) if the file exists but is corrupt or unparseable —
 * silently swallowing corruption would cause the adapter to re-read every
 * transcript from byte 0 on the next tick.
 */
export const loadSessionsState = (
  path: string,
): ResultAsync<SessionState, SessionError> => {
  if (!existsSync(path)) return okAsync(EMPTY_STATE);
  return ResultAsync.fromPromise(
    readFile(path, 'utf8'),
    (e) => SE.stateFileError(path, (e as Error).message),
  ).andThen((text) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return errAsync<SessionState, SessionError>(
        SE.stateFileError(path, `parse failed: ${(e as Error).message}`),
      );
    }
    if (!parsed || typeof parsed !== 'object') {
      return errAsync<SessionState, SessionError>(
        SE.stateFileError(path, 'root must be an object'),
      );
    }
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.files !== 'object' || obj.files === null) {
      return errAsync<SessionState, SessionError>(
        SE.stateFileError(path, "missing or invalid 'files' object"),
      );
    }
    const version = typeof obj.version === 'number' ? obj.version : SESSIONS_STATE_VERSION;
    if (version > SESSIONS_STATE_VERSION) {
      return errAsync<SessionState, SessionError>(
        SE.stateFileError(
          path,
          `unsupported sessions-state.json version ${version} (supported: ${SESSIONS_STATE_VERSION})`,
        ),
      );
    }
    // Migration: normalise any entries with missing fields to defaults
    const rawFiles = obj.files as Record<string, unknown>;
    const files: Record<string, SessionFileState> = {};
    for (const [filePath, entry] of Object.entries(rawFiles)) {
      if (typeof entry === 'object' && entry !== null) {
        const e = entry as Record<string, unknown>;
        files[filePath] = {
          mtime: typeof e.mtime === 'number' ? e.mtime : 0,
          byteOffset: typeof e.byteOffset === 'number' ? e.byteOffset : 0,
          lastLineNum: typeof e.lastLineNum === 'number' ? e.lastLineNum : 0,
        };
      }
    }
    return okAsync<SessionState, SessionError>({
      version: SESSIONS_STATE_VERSION,
      files,
    });
  });
};

/**
 * Persist session state to disk atomically: write to a .tmp file then rename
 * into the final path. Rename is atomic on POSIX.
 */
export const saveSessionsState = (
  path: string,
  state: SessionState,
): ResultAsync<void, SessionError> => {
  const dir = dirname(path);
  const tmp = `${path}.tmp`;
  return ResultAsync.fromPromise(
    mkdir(dir, { recursive: true }),
    (e) => SE.stateFileError(path, (e as Error).message),
  )
    .andThen(() =>
      ResultAsync.fromPromise(
        writeFile(tmp, JSON.stringify(state, null, 2), 'utf8'),
        (e) => SE.stateFileError(path, (e as Error).message),
      ),
    )
    .andThen(() =>
      ResultAsync.fromPromise(
        rename(tmp, path),
        (e) => SE.stateFileError(path, (e as Error).message),
      ),
    );
};

// ─────────────────────── pure transformations ─────────────

/**
 * Return a new SessionState with the given file's entry replaced.
 * Immutable — caller persists via saveSessionsState or mutateSessionsState.
 */
export const updateFileState = (
  current: SessionState,
  filePath: string,
  next: SessionFileState,
): SessionState => ({
  version: current.version,
  files: { ...current.files, [filePath]: next },
});

// ─────────────────────── transactional mutate ─────────────

/**
 * Transactional read-modify-write for sessions-state.json.
 *
 * Acquires a cross-process lock, loads the current state, applies the
 * pure transform, saves atomically, and releases the lock. Prevents two
 * wellinformed processes (e.g., daemon + CLI) from racing and clobbering
 * each other's ingest offsets.
 *
 * The `transform` function receives the current SessionState and must
 * return the new SessionState — it should be pure (no I/O).
 */
export const mutateSessionsState = (
  path: string,
  transform: (current: SessionState) => SessionState,
): ResultAsync<SessionState, SessionError> => {
  const lockPath = `${path}.lock`;
  return ResultAsync.fromPromise(
    acquireLock(lockPath),
    (e) => SE.stateFileError(path, `lock acquire failed: ${(e as Error).message}`),
  )
    .andThen(() => loadSessionsState(path))
    .andThen((current) => {
      const next = transform(current);
      return saveSessionsState(path, next).map(() => next);
    })
    .andThen((result) =>
      ResultAsync.fromPromise(
        releaseLock(lockPath),
        (e) => SE.stateFileError(path, `lock release failed: ${(e as Error).message}`),
      ).map(() => result),
    )
    .orElse((err) =>
      // Best-effort lock release on failure path — do not mask the original error
      ResultAsync.fromPromise(
        releaseLock(lockPath),
        () => err,
      ).andThen(() => errAsync(err)),
    );
};
