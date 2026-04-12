/**
 * Peer store — persists known peers to ~/.wellinformed/peers.json.
 * Atomic writes via write-to-tmp + rename to prevent file corruption.
 * No classes, neverthrow ResultAsync for all I/O.
 *
 * Error types: PE.storeReadError / PE.storeWriteError for peers.json I/O.
 * These are distinct from identity error types (peer-identity.json lives
 * in peer-transport.ts and uses PE.identityReadError / identityWriteError).
 */
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { readFile, writeFile, mkdir, rename, open, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PeerError } from '../domain/errors.js';
import { PeerError as PE } from '../domain/errors.js';

/** Current peers.json schema version. Bump when making breaking changes. */
const PEERS_FILE_VERSION = 1 as const;

/**
 * Cross-process lock for peers.json mutations.
 *
 * Uses exclusive-create (`wx` flag) on a sibling `.lock` file — POSIX
 * atomic exclusive file creation with no external dependency. Holds the
 * lock for the duration of a read-modify-write transaction so two
 * concurrent wellinformed processes cannot clobber each other's peer list.
 *
 * Staleness guard: lock file contains the locker's PID and timestamp.
 * Locks older than STALE_LOCK_MS are considered abandoned (e.g., parent
 * process crashed) and are forcibly broken before a new locker acquires.
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
        throw new Error(`timed out waiting for peers.json lock after ${LOCK_MAX_WAIT_MS}ms`);
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

export interface PeerRecord {
  /** multibase-encoded PeerId string (libp2p canonical form) */
  readonly id: string;
  /** known multiaddrs for dialling this peer */
  readonly addrs: readonly string[];
  /** ISO-8601 timestamp when this peer was first added */
  readonly addedAt: string;
  /** optional human-readable alias */
  readonly label?: string;
  /**
   * How this peer was discovered. Optional for backward compatibility with
   * pre-Phase 17 peers.json files (absence means 'manual' — the only pre-17 path).
   *   - 'manual' : `wellinformed peer add <multiaddr>`
   *   - 'mdns'   : libp2p mDNS peer:discovery event
   *   - 'dht'    : kad-dht FIND_NODE response (Phase 17 wiring, off by default)
   *
   * Pitfall 6 (17-RESEARCH.md): This field is OPTIONAL. Strict type assertions
   * on legacy files would fail — keep it optional and treat absence as 'manual'
   * in `peer list` rendering.
   */
  readonly discovery_method?: 'manual' | 'mdns' | 'dht';
}

export interface PeersFile {
  /** Schema version — present so future format changes can migrate safely. */
  readonly version: number;
  readonly peers: readonly PeerRecord[];
}

// ─────────────────────── constants ────────────────────────

const EMPTY_FILE: PeersFile = Object.freeze({ version: PEERS_FILE_VERSION, peers: [] });

// ─────────────────────── I/O operations ───────────────────

/**
 * Load peers from disk. Returns an empty registry if the file does not
 * exist. Returns `err(storeReadError)` if the file exists but is unparseable
 * or shape-invalid — silently swallowing corruption would let the next
 * `savePeers` overwrite the user's peer list with empty. Corrupt files
 * must be surfaced so the user can investigate (backup / recover / delete).
 *
 * Accepts both current (`version: 1`) and legacy (no version) shapes for
 * forward compatibility, but always writes the current version on save.
 *
 * Uses PE.storeReadError for read failures (not PE.identityReadError —
 * that error type is reserved for peer-identity.json).
 */
export const loadPeers = (
  peersPath: string,
): ResultAsync<PeersFile, PeerError> => {
  if (!existsSync(peersPath)) return okAsync(EMPTY_FILE);
  return ResultAsync.fromPromise(
    readFile(peersPath, 'utf8'),
    (e) => PE.storeReadError(peersPath, (e as Error).message),
  ).andThen((text) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return errAsync<PeersFile, PeerError>(
        PE.storeReadError(peersPath, `parse failed: ${(e as Error).message}`),
      );
    }
    if (!parsed || typeof parsed !== 'object') {
      return errAsync<PeersFile, PeerError>(
        PE.storeReadError(peersPath, 'root must be an object'),
      );
    }
    const obj = parsed as Record<string, unknown>;
    if (!Array.isArray(obj.peers)) {
      return errAsync<PeersFile, PeerError>(
        PE.storeReadError(peersPath, "missing or invalid 'peers' array"),
      );
    }
    const version = typeof obj.version === 'number' ? obj.version : PEERS_FILE_VERSION;
    if (version > PEERS_FILE_VERSION) {
      return errAsync<PeersFile, PeerError>(
        PE.storeReadError(
          peersPath,
          `unsupported peers.json version ${version} (supported: ${PEERS_FILE_VERSION})`,
        ),
      );
    }
    return okAsync<PeersFile, PeerError>({
      version: PEERS_FILE_VERSION,
      peers: obj.peers as readonly PeerRecord[],
    });
  });
};

/**
 * Persist peers to disk atomically: write to a .tmp file then rename
 * into the final path. Rename is atomic on POSIX — readers see either
 * the old complete file or the new complete file, never a partial write.
 *
 * Uses PE.storeWriteError for write failures (not PE.identityWriteError).
 */
export const savePeers = (
  peersPath: string,
  file: PeersFile,
): ResultAsync<void, PeerError> => {
  const dir = dirname(peersPath);
  const tmp = `${peersPath}.tmp`;
  return ResultAsync.fromPromise(
    mkdir(dir, { recursive: true }),
    (e) => PE.storeWriteError(peersPath, (e as Error).message),
  ).andThen(() =>
    ResultAsync.fromPromise(
      writeFile(tmp, JSON.stringify(file, null, 2), 'utf8'),
      (e) => PE.storeWriteError(peersPath, (e as Error).message),
    ),
  ).andThen(() =>
    ResultAsync.fromPromise(
      rename(tmp, peersPath),
      (e) => PE.storeWriteError(peersPath, (e as Error).message),
    ),
  );
};

// ─────────────────────── pure transformations ─────────────

/**
 * Add a peer record. If the peer already exists (by id), updates its
 * addrs (address refresh). Returns a new PeersFile — caller is
 * responsible for persisting via savePeers.
 */
export const addPeerRecord = (
  file: PeersFile,
  record: PeerRecord,
): PeersFile => {
  const exists = file.peers.some((p) => p.id === record.id);
  if (exists) {
    return {
      version: file.version,
      peers: file.peers.map((p) =>
        p.id === record.id ? { ...p, addrs: record.addrs } : p,
      ),
    };
  }
  return { version: file.version, peers: [...file.peers, record] };
};

/**
 * Remove a peer record by id. Returns unchanged file if the id is not
 * found — caller is responsible for persisting via savePeers.
 */
export const removePeerRecord = (
  file: PeersFile,
  id: string,
): PeersFile => ({
  version: file.version,
  peers: file.peers.filter((p) => p.id !== id),
});

/**
 * Transactional read-modify-write for peers.json.
 *
 * Acquires a cross-process lock (sibling `.lock` file via exclusive-create),
 * loads the current state, applies the pure transform, saves atomically,
 * and releases the lock. Prevents two wellinformed processes (e.g., daemon +
 * CLI `peer add`) from racing and clobbering each other's writes.
 *
 * The `transform` function receives the current PeersFile and must return
 * the new PeersFile — it should be pure (no I/O). All side effects happen
 * outside the transform, wrapped by this function.
 *
 * On lock acquisition failure (timeout or abandoned stale lock), returns
 * PE.storeWriteError with a descriptive message. Callers should treat
 * lock errors as retryable at a higher level.
 */
export const mutatePeers = (
  peersPath: string,
  transform: (current: PeersFile) => PeersFile,
): ResultAsync<PeersFile, PeerError> => {
  const lockPath = `${peersPath}.lock`;
  return ResultAsync.fromPromise(
    acquireLock(lockPath),
    (e) => PE.storeWriteError(peersPath, `lock acquire failed: ${(e as Error).message}`),
  )
    .andThen(() => loadPeers(peersPath))
    .andThen((current) => {
      const next = transform(current);
      return savePeers(peersPath, next).map(() => next);
    })
    .andThen((result) =>
      ResultAsync.fromPromise(
        releaseLock(lockPath),
        (e) => PE.storeWriteError(peersPath, `lock release failed: ${(e as Error).message}`),
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
