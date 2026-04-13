/**
 * Share store — persists the shared-rooms registry to ~/.wellinformed/shared-rooms.json.
 * Mirrors peer-store.ts: cross-process lock + atomic tmp+rename writes + pure transforms.
 *
 * Phase 16 introduces this file alongside peers.json. Two separate registries
 * (peers.json owns connections, shared-rooms.json owns the public rooms list)
 * because their lifecycles and contention patterns are independent.
 *
 * Error types: SE.shareStoreReadError / SE.shareStoreWriteError for all I/O.
 * Never throws to callers — all fallible ops return ResultAsync<_, ShareError>.
 */
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { readFile, writeFile, mkdir, rename, open, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ShareError } from '../domain/errors.js';
import { ShareError as SE } from '../domain/errors.js';

/** Current shared-rooms.json schema version. Bump when making breaking changes. */
const SHARED_ROOMS_VERSION = 2 as const;

/**
 * Cross-process lock for shared-rooms.json mutations.
 *
 * Uses exclusive-create (`wx` flag) on a sibling `.lock` file — POSIX
 * atomic exclusive file creation with no external dependency. Holds the
 * lock for the duration of a read-modify-write transaction so two
 * concurrent wellinformed processes (e.g., daemon + CLI `share room foo`)
 * cannot clobber each other's registry writes.
 *
 * Staleness guard: lock file contains the locker's PID and timestamp.
 * Locks older than STALE_LOCK_MS are considered abandoned (e.g., parent
 * process crashed) and are forcibly broken before a new locker acquires.
 *
 * Pattern is verbatim from peer-store.ts — the only behavioral difference
 * is the error type returned on timeout (ShareStoreWriteError vs PeerStoreWriteError).
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
    // Unreadable lock file — treat as stale so we don't deadlock forever
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
      // Lock exists — check if stale
      if (await isStaleLock(lockPath)) {
        try {
          await unlink(lockPath);
        } catch {
          // Another process may have cleaned it up — retry
        }
        continue;
      }
      if (Date.now() >= deadline) {
        throw new Error(`timed out waiting for shared-rooms.json lock after ${LOCK_MAX_WAIT_MS}ms`);
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

// ─────────────────────── types ────────────────────────────

export interface SharedRoomRecord {
  /** Room name as used by the local graph (room field on GraphNode). */
  readonly name: string;
  /** ISO-8601 timestamp when this room was first shared. */
  readonly sharedAt: string;
  /**
   * Phase 20 — non-shareable rooms hard-refuse `share room <name>`.
   * Legacy v1 records without this field are treated as shareable: true on read
   * (backwards compatibility). The `sessions` room is explicitly created with
   * shareable: false so session data never crosses libp2p.
   */
  readonly shareable: boolean;
}

export interface SharedRoomsFile {
  /** Schema version — present so future format changes can migrate safely. */
  readonly version: number;
  readonly rooms: readonly SharedRoomRecord[];
}

// ─────────────────────── constants ────────────────────────

const EMPTY_FILE: SharedRoomsFile = Object.freeze({ version: SHARED_ROOMS_VERSION, rooms: [] });

// ─────────────────────── I/O operations ───────────────────

/**
 * Load shared rooms from disk. Returns an empty registry if the file does
 * not exist. Returns `err(shareStoreReadError)` if the file exists but is
 * unparseable or shape-invalid — silently swallowing corruption would let
 * the next `saveSharedRooms` overwrite the user's registry with empty.
 *
 * Accepts both current (`version: 1`) and legacy (no version) shapes for
 * forward compatibility, but always writes the current version on save.
 */
export const loadSharedRooms = (
  path: string,
): ResultAsync<SharedRoomsFile, ShareError> => {
  if (!existsSync(path)) return okAsync(EMPTY_FILE);
  return ResultAsync.fromPromise(
    readFile(path, 'utf8'),
    (e) => SE.shareStoreReadError(path, (e as Error).message),
  ).andThen((text) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return errAsync<SharedRoomsFile, ShareError>(
        SE.shareStoreReadError(path, `parse failed: ${(e as Error).message}`),
      );
    }
    if (!parsed || typeof parsed !== 'object') {
      return errAsync<SharedRoomsFile, ShareError>(
        SE.shareStoreReadError(path, 'root must be an object'),
      );
    }
    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.rooms)) {
      return errAsync<SharedRoomsFile, ShareError>(
        SE.shareStoreReadError(path, "missing or invalid 'rooms' array"),
      );
    }
    const version = typeof obj.version === 'number' ? obj.version : SHARED_ROOMS_VERSION;
    if (version > SHARED_ROOMS_VERSION) {
      return errAsync<SharedRoomsFile, ShareError>(
        SE.shareStoreReadError(
          path,
          `unsupported shared-rooms.json version ${version} (supported: ${SHARED_ROOMS_VERSION})`,
        ),
      );
    }
    const normalised: SharedRoomRecord[] = (
      obj.rooms as readonly Partial<SharedRoomRecord>[]
    ).map((r) => ({
      name: String(r.name ?? ''),
      sharedAt: String(r.sharedAt ?? ''),
      shareable: typeof r.shareable === 'boolean' ? r.shareable : true,
    }));
    return okAsync<SharedRoomsFile, ShareError>({
      version: SHARED_ROOMS_VERSION,
      rooms: normalised,
    });
  });
};

/**
 * Persist shared rooms to disk atomically: write to a .tmp file then rename
 * into the final path. Rename is atomic on POSIX — readers see either
 * the old complete file or the new complete file, never a partial write.
 */
export const saveSharedRooms = (
  path: string,
  file: SharedRoomsFile,
): ResultAsync<void, ShareError> => {
  const dir = dirname(path);
  const tmp = `${path}.tmp`;
  return ResultAsync.fromPromise(
    mkdir(dir, { recursive: true }),
    (e) => SE.shareStoreWriteError(path, (e as Error).message),
  ).andThen(() =>
    ResultAsync.fromPromise(
      writeFile(tmp, JSON.stringify(file, null, 2), 'utf8'),
      (e) => SE.shareStoreWriteError(path, (e as Error).message),
    ),
  ).andThen(() =>
    ResultAsync.fromPromise(
      rename(tmp, path),
      (e) => SE.shareStoreWriteError(path, (e as Error).message),
    ),
  );
};

// ─────────────────────── pure transforms ──────────────────

/**
 * Add a shared room record. If the room already exists (by name), updates
 * its record (idempotent — `share room foo` twice keeps a single entry).
 * Returns a new SharedRoomsFile — caller is responsible for persisting
 * via saveSharedRooms.
 */
export const addSharedRoom = (
  file: SharedRoomsFile,
  record: SharedRoomRecord,
): SharedRoomsFile => {
  const exists = file.rooms.some((r) => r.name === record.name);
  if (exists) {
    return {
      version: file.version,
      rooms: file.rooms.map((r) => (r.name === record.name ? record : r)),
    };
  }
  return { version: file.version, rooms: [...file.rooms, record] };
};

/**
 * Remove a shared room record by name. Returns unchanged file if the name
 * is not found — idempotent, never an error. Caller is responsible for
 * persisting via saveSharedRooms.
 */
export const removeSharedRoom = (
  file: SharedRoomsFile,
  name: string,
): SharedRoomsFile => ({
  version: file.version,
  rooms: file.rooms.filter((r) => r.name !== name),
});

// ─────────────────────── transactional mutate ─────────────

/**
 * Transactional read-modify-write for shared-rooms.json.
 *
 * Acquires a cross-process lock (sibling `.lock` file via exclusive-create),
 * loads the current state, applies the pure transform, saves atomically,
 * and releases the lock. Prevents two wellinformed processes (e.g., daemon +
 * CLI `share room foo`) from racing and clobbering each other's writes.
 *
 * The `transform` function receives the current SharedRoomsFile and must
 * return the new SharedRoomsFile — it should be pure (no I/O). All side
 * effects happen outside the transform, wrapped by this function.
 *
 * On lock acquisition failure (timeout or abandoned stale lock), returns
 * SE.shareStoreWriteError with a descriptive message. Callers should treat
 * lock errors as retryable at a higher level.
 */
export const mutateSharedRooms = (
  path: string,
  transform: (current: SharedRoomsFile) => SharedRoomsFile,
): ResultAsync<SharedRoomsFile, ShareError> => {
  const lockPath = `${path}.lock`;
  return ResultAsync.fromPromise(
    acquireLock(lockPath),
    (e) => SE.shareStoreWriteError(path, `lock acquire failed: ${(e as Error).message}`),
  )
    .andThen(() => loadSharedRooms(path))
    .andThen((current) => {
      const next = transform(current);
      return saveSharedRooms(path, next).map(() => next);
    })
    .andThen((result) =>
      ResultAsync.fromPromise(
        releaseLock(lockPath),
        (e) => SE.shareStoreWriteError(path, `lock release failed: ${(e as Error).message}`),
      ).map(() => result),
    )
    .orElse((err) =>
      // Best-effort lock release on failure path — don't mask the original error
      ResultAsync.fromPromise(
        releaseLock(lockPath),
        () => err,
      ).andThen(() => errAsync(err)),
    );
};
