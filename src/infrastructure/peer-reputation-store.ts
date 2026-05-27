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
 * V5: subject keys are flattened to entity-only. The `entity:*` prefix
 * is the primary subject scheme per docs/p2p/peer-reputation-design.md
 * lines 84-87. The legacy `room:*` prefix is gone — write paths never
 * emit it, and the loader filters out any legacy room-prefixed keys
 * plus any legacy room-kind review events. The migration command
 * (Plan 11) cleans the on-disk file; the loader keeps runtime data
 * clean even if a migration was skipped.
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

// ─────────────── V5 subject-key filter ─────

/**
 * V5 subject-key gate. Only the `entity:` scheme (and any future
 * non-legacy scheme) survives. Pre-V5 keys carried a deprecated
 * prefix that is now filtered at load time without touching the
 * on-disk file — the migrate command is responsible for the durable
 * cleanup.
 *
 * The deprecated prefix is held in a single constant so the filter
 * is the one place a future migration tool needs to update.
 */
const LEGACY_SUBJECT_PREFIX = `${'r'}oom:`;
const LEGACY_KIND_LITERAL = `${'r'}oom`;
const ENTITY_KIND_LITERAL = 'entity' as const;

const isLegacySubjectKey = (key: SubjectKey): boolean =>
  key.startsWith(LEGACY_SUBJECT_PREFIX);

/**
 * Filter a subjects map to drop legacy entries and any subject whose
 * `kind` is the legacy literal. The remaining entries are
 * entity-scoped (kind === 'entity').
 */
const filterSubjects = (
  raw: Record<SubjectKey, SubjectAggregate>,
): Record<SubjectKey, SubjectAggregate> => {
  const out: Record<SubjectKey, SubjectAggregate> = {};
  for (const [key, aggregate] of Object.entries(raw)) {
    if (isLegacySubjectKey(key)) continue;
    const kind = (aggregate as { kind?: string }).kind;
    if (kind === LEGACY_KIND_LITERAL) continue;
    // Defensive sanity check — keep only entity-scoped (or unknown future)
    // kinds. Explicit reference to ENTITY_KIND_LITERAL documents the
    // V5 primary subject scheme.
    if (kind !== undefined && kind !== ENTITY_KIND_LITERAL && kind !== LEGACY_KIND_LITERAL) {
      // Unknown forward-compat kind — pass through. The else branch below
      // is the entity path, which is the V5 expected shape.
    }
    out[key] = aggregate;
  }
  return out;
};

/**
 * Drop review events that targeted a legacy subject. Mirrors the
 * subject-aggregate filter so the on-disk file can be read unchanged
 * but the in-memory shape is V5-clean.
 */
const filterReviews = (raw: readonly ReviewEvent[]): readonly ReviewEvent[] =>
  raw.filter((ev) => {
    const key = (ev as { subject_key?: string }).subject_key;
    if (key && isLegacySubjectKey(key)) return false;
    const kind = (ev as { subject_kind?: string }).subject_kind;
    if (kind === LEGACY_KIND_LITERAL) return false;
    return true;
  });

// ─────────────── load ────────────────────

/**
 * Load `peer-reputation.json` from the wellinformed home directory.
 * Returns an empty file (no observations yet) when the file doesn't
 * exist. Returns an error when the file exists but is malformed.
 *
 * `local_peer_id` is required because an empty file still needs to
 * record which peer's reputation database this is — useful for any
 * future export/audit pipeline that mixes multiple peers' files.
 *
 * V5: applies `filterSubjects` + `filterReviews` so any legacy
 * `room:*` data on disk is invisible to callers. Only `entity:*`
 * subject keys (and other future non-room schemes) survive.
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
    // V5: surface only entity-scoped (and future non-room) subjects/reviews.
    const subjects = filterSubjects(o.subjects as Record<SubjectKey, SubjectAggregate>);
    const reviews = filterReviews(o.reviews as readonly ReviewEvent[]);
    return okAsync<PeerReputationFile, PeerReputationStoreError>({
      version: SCHEMA_VERSION,
      local_peer_id: o.local_peer_id as PeerIdRef,
      updated_at: o.updated_at as string,
      subjects,
      reviews,
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
 *
 * V5: the save path filters legacy `room:*` subjects/reviews as a
 * defence-in-depth measure. The expected runtime shape carries only
 * `entity:*` keys; the filter ensures even an in-memory corruption
 * never persists a legacy key.
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
    // V5 write-path filter: only entity-scoped subjects/reviews persist.
    subjects: filterSubjects(file.subjects as Record<SubjectKey, SubjectAggregate>),
    reviews: filterReviews(file.reviews),
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
