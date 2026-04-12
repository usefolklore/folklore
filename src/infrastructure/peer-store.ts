/**
 * Peer store — persists known peers to ~/.wellinformed/peers.json.
 * Atomic writes via write-to-tmp + rename to prevent file corruption.
 * No classes, neverthrow ResultAsync for all I/O.
 *
 * Error types: PE.storeReadError / PE.storeWriteError for peers.json I/O.
 * These are distinct from identity error types (peer-identity.json lives
 * in peer-transport.ts and uses PE.identityReadError / identityWriteError).
 */
import { ResultAsync, okAsync } from 'neverthrow';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PeerError } from '../domain/errors.js';
import { PeerError as PE } from '../domain/errors.js';

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
}

export interface PeersFile {
  readonly peers: readonly PeerRecord[];
}

// ─────────────────────── constants ────────────────────────

const EMPTY_FILE: PeersFile = Object.freeze({ peers: [] });

// ─────────────────────── I/O operations ───────────────────

/**
 * Load peers from disk. Returns an empty registry if the file does not
 * exist. Returns empty on corrupt/unparseable JSON rather than crashing —
 * a missing or broken peers.json is recoverable (just start with no peers).
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
    try {
      const parsed = JSON.parse(text) as PeersFile;
      return okAsync<PeersFile, PeerError>(
        parsed?.peers ? parsed : EMPTY_FILE,
      );
    } catch {
      // Corrupt JSON — return empty rather than crashing
      return okAsync<PeersFile, PeerError>(EMPTY_FILE);
    }
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
      peers: file.peers.map((p) =>
        p.id === record.id ? { ...p, addrs: record.addrs } : p,
      ),
    };
  }
  return { peers: [...file.peers, record] };
};

/**
 * Remove a peer record by id. Returns unchanged file if the id is not
 * found — caller is responsible for persisting via savePeers.
 */
export const removePeerRecord = (
  file: PeersFile,
  id: string,
): PeersFile => ({
  peers: file.peers.filter((p) => p.id !== id),
});
