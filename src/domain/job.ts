/**
 * Background job — pure data shape consumed by the daemon's job queue
 * and the `wellinformed jobs` CLI surface. The queue itself + the
 * runner live under src/daemon/. This file is the lingua franca.
 *
 * Lifecycle: queued → running → (done | failed)
 *
 * Idempotency invariant: every job kind MUST be safely retriable.
 * Ingestion is content-hash deduped (see src/application/ingest.ts
 * decideForItem); re-running an ingest job on the same input is a
 * no-op except for source_uri additions and freshness updates.
 */

export type JobKind = 'ingest:room' | 'ingest:file' | 'ingest:session';

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

export interface JobBase {
  readonly id: string;             // ulid-ish, sortable by creation
  readonly kind: JobKind;
  readonly status: JobStatus;
  readonly created_at: string;     // ISO-8601
  readonly started_at?: string;
  readonly finished_at?: string;
  readonly error?: string;
  /**
   * Free-form per-kind summary line. Set by the runner on completion.
   * Examples:
   *   - 'ingest:room sessions — 3 sources · 142 new · 12 updated · 0 errors'
   *   - 'ingest:file /repo/src/foo.ts — 1 chunk · 1 new'
   */
  readonly result_summary?: string;
}

// ─────────────── per-kind payloads ─────────

export interface IngestRoomPayload {
  readonly kind: 'ingest:room';
  readonly room: string;
}

export interface IngestFilePayload {
  readonly kind: 'ingest:file';
  readonly room: string;
  readonly path: string;           // absolute path
}

export interface IngestSessionPayload {
  readonly kind: 'ingest:session';
  /**
   * Optional file-path filter. When set, the runner only re-walks
   * this single .jsonl. When absent, the runner does a full
   * sessions ingest using the existing sessions-state cursor.
   */
  readonly path?: string;
}

export type JobPayload =
  | IngestRoomPayload
  | IngestFilePayload
  | IngestSessionPayload;

export interface Job extends JobBase {
  readonly payload: JobPayload;
}

// ─────────────── helpers ───────────────────

/**
 * Generate a sortable, unique-ish job id. Format: `<unix-ms>-<rand>`.
 * Sorts lexicographically by creation time so `jobs list` stays
 * chronological without an explicit ORDER BY.
 */
export const newJobId = (now: number = Date.now()): string => {
  const stamp = now.toString(36).padStart(10, '0');
  const rand = Math.random().toString(36).slice(2, 8);
  return `${stamp}-${rand}`;
};

export const isTerminal = (status: JobStatus): boolean =>
  status === 'done' || status === 'failed';
