/**
 * Persistence for peer reputation — atomic load/save against
 * `~/.wellinformed/peer-reputation.json`.
 *
 * Mirrors the patterns from `peer-store.ts:138`:
 *   - Versioned JSON (forward-compat refusal of unknown future versions).
 *   - Atomic write — temp file + rename, so a SIGKILL mid-write never
 *     leaves a torn JSON the next boot reads as garbage.
 *   - Empty file on missing path (first boot before any review lands).
 *   - Strict shape validation; a corrupt file errors loudly so the
 *     next save() doesn't quietly overwrite real history with empty.
 *
 * Pure-ish: depends on `fs/promises`. Tests inject a tmp home dir.
 */

import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  emptyFile,
  type PeerIdRef,
  type PeerReputationFile,
  type ReviewEvent,
  type SubjectAggregate,
  type SubjectKey,
} from '../domain/peer-reputation.js';
import { acquireFileLock, releaseFileLock } from './peer-store.js';

const FILE_NAME = 'peer-reputation.json';
const SCHEMA_VERSION = 1 as const;

// ─────────────── error model ─────────────

export type PeerReputationStoreError =
  | { readonly type: 'PeerReputationReadError'; readonly path: string; readonly message: string }
  | { readonly type: 'PeerReputationWriteError'; readonly path: string; readonly message: string }
  | { readonly type: 'PeerReputationVersionError'; readonly path: string; readonly version: number };

export const PeerReputationStoreError = {
  read: (path: string, message: string): PeerReputationStoreError => ({
    type: 'PeerReputationReadError', path, message,
  }),
  write: (path: string, message: string): PeerReputationStoreError => ({
    type: 'PeerReputationWriteError', path, message,
  }),
  version: (path: string, version: number): PeerReputationStoreError => ({
    type: 'PeerReputationVersionError', path, version,
  }),
} as const;

const peerReputationPath = (home: string): string => join(home, FILE_NAME);

// ─────────────── load ────────────────────

/**
 * Load `peer-reputation.json` from the wellinformed home directory.
 * Returns an empty file (no observations yet) when the file doesn't
 * exist. Returns an error when the file exists but is malformed.
 *
 * `local_peer_id` is required because an empty file still needs to
 * record which peer's reputation database this is — useful for any
 * future export/audit pipeline that mixes multiple peers' files.
 */
export const loadPeerReputation = (
  home: string,
  local_peer_id: PeerIdRef,
): ResultAsync<PeerReputationFile, PeerReputationStoreError> => {
  const path = peerReputationPath(home);
  if (!existsSync(path)) return okAsync(emptyFile(local_peer_id));
  return ResultAsync.fromPromise(
    readFile(path, 'utf8'),
    (e) => PeerReputationStoreError.read(path, (e as Error).message),
  ).andThen((text) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      return errAsync<PeerReputationFile, PeerReputationStoreError>(
        PeerReputationStoreError.read(path, `parse failed: ${(e as Error).message}`),
      );
    }
    if (!parsed || typeof parsed !== 'object') {
      return errAsync<PeerReputationFile, PeerReputationStoreError>(
        PeerReputationStoreError.read(path, 'root must be an object'),
      );
    }
    const o = parsed as Record<string, unknown>;
    const v = typeof o.version === 'number' ? o.version : SCHEMA_VERSION;
    if (v > SCHEMA_VERSION) {
      return errAsync<PeerReputationFile, PeerReputationStoreError>(
        PeerReputationStoreError.version(path, v),
      );
    }
    if (
      typeof o.local_peer_id !== 'string' ||
      typeof o.updated_at !== 'string' ||
      !o.subjects || typeof o.subjects !== 'object' ||
      !Array.isArray(o.reviews)
    ) {
      return errAsync<PeerReputationFile, PeerReputationStoreError>(
        PeerReputationStoreError.read(path, 'missing required top-level fields'),
      );
    }
    return okAsync<PeerReputationFile, PeerReputationStoreError>({
      version: SCHEMA_VERSION,
      local_peer_id: o.local_peer_id as PeerIdRef,
      updated_at: o.updated_at as string,
      subjects: o.subjects as Record<SubjectKey, SubjectAggregate>,
      reviews: o.reviews as readonly ReviewEvent[],
    });
  });
};

// ─────────────── save ────────────────────

/**
 * Atomic save — write to `<path>.tmp`, then rename. POSIX rename is
 * atomic so any concurrent reader sees either the old complete file
 * or the new one, never a partial state.
 *
 * `updated_at` is rewritten on every save so callers don't have to
 * remember to bump it.
 */
export const savePeerReputation = (
  home: string,
  file: PeerReputationFile,
): ResultAsync<void, PeerReputationStoreError> => {
  const path = peerReputationPath(home);
  const tmp = `${path}.tmp`;
  const dir = dirname(path);
  const next: PeerReputationFile = {
    version: SCHEMA_VERSION,
    local_peer_id: file.local_peer_id,
    updated_at: new Date().toISOString(),
    subjects: file.subjects,
    reviews: file.reviews,
  };
  return ResultAsync.fromPromise(
    mkdir(dir, { recursive: true }),
    (e) => PeerReputationStoreError.write(path, (e as Error).message),
  ).andThen(() =>
    ResultAsync.fromPromise(
      writeFile(tmp, JSON.stringify(next, null, 2), 'utf8'),
      (e) => PeerReputationStoreError.write(path, (e as Error).message),
    ),
  ).andThen(() =>
    ResultAsync.fromPromise(
      rename(tmp, path),
      (e) => PeerReputationStoreError.write(path, (e as Error).message),
    ),
  );
};

// ─────────────── transactional RMW ────────

/**
 * Transactional read-modify-write for `peer-reputation.json`.
 *
 * Closes the BLOCKER concurrency race the round-4 implementation
 * review flagged: federated asks resolve in parallel, so two
 * `updatePeerReputation` calls can land at the same time. Without a
 * mutex, the slower one's `save` overwrites the faster one's review
 * — peer A's review of peer B is silently destroyed by peer C's
 * concurrent review of peer D.
 *
 * The lock is a sibling `.lock` file with the same stale-detection
 * pattern as `peer-store.ts:mutatePeers`. Cross-process: works even
 * when the daemon and a CLI command land at the same time.
 */
export const mutatePeerReputation = (
  home: string,
  local_peer_id: PeerIdRef,
  transform: (current: PeerReputationFile) => PeerReputationFile,
): ResultAsync<PeerReputationFile, PeerReputationStoreError> => {
  const path = peerReputationPath(home);
  const lockPath = `${path}.lock`;
  return ResultAsync.fromPromise(
    acquireFileLock(lockPath),
    (e) => PeerReputationStoreError.write(path, `lock acquire failed: ${(e as Error).message}`),
  )
    .andThen(() => loadPeerReputation(home, local_peer_id))
    .andThen((current) => {
      const next = transform(current);
      return savePeerReputation(home, next).map(() => next);
    })
    .andThen((result) =>
      ResultAsync.fromPromise(
        releaseFileLock(lockPath),
        (e) => PeerReputationStoreError.write(path, `lock release failed: ${(e as Error).message}`),
      ).map(() => result),
    )
    .orElse((err) =>
      // On any error after lock acquisition, best-effort release the lock so
      // a transient failure doesn't leave the lock file behind for the next run.
      ResultAsync.fromPromise(
        releaseFileLock(lockPath),
        () => err,
      ).andThen(() => errAsync<PeerReputationFile, PeerReputationStoreError>(err)),
    );
};
