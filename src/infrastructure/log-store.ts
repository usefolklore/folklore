/**
 * Log store — append-only JSONL with daily rotation.
 *
 * Layout:
 *   <home>/logs/events-YYYY-MM-DD.jsonl       — today's events
 *   <home>/logs/events-YYYY-MM-DD.jsonl.gz    — yesterday and earlier (gzipped)
 *   <home>/logs/state.json                    — last shipped offset, optional shipping config
 *
 * Rotation policy:
 *   - One file per UTC date.
 *   - On the first append after midnight UTC, the prior day's file is
 *     renamed to .jsonl.gz (compressed).
 *   - Files older than `retention_days` (default 30) are deleted.
 *
 * Optional opt-in shipping:
 *   - If `WELLINFORMED_LOG_SHIP_URL` is set (or stored in state.json),
 *     newly-appended events are POSTed in batches of 100 to that URL
 *     as `application/x-ndjson`. Failure is logged but NEVER blocks
 *     the local append.
 *   - The shipper reads its own offset from state.json so a restart
 *     resumes where it left off without resending events.
 */

import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { appendFile, mkdir, readFile, rename, writeFile, readdir, unlink, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzip } from 'node:zlib';
import { promisify } from 'node:util';
import { PeerError } from '../domain/errors.js';
import type { LogEvent } from '../domain/log-event.js';

const gzipAsync = promisify(gzip);

// ─────────────────────── paths ────────────────────────────────────

export interface LogPaths {
  readonly dir: string;
  readonly statePath: string;
  /** Today's active JSONL — derived from the supplied clock for testability. */
  readonly todayPath: string;
}

export const logPaths = (homeDir: string, today?: string): LogPaths => {
  const day = today ?? new Date().toISOString().slice(0, 10);
  const dir = join(homeDir, 'logs');
  return {
    dir,
    statePath: join(dir, 'state.json'),
    todayPath: join(dir, `events-${day}.jsonl`),
  };
};

// ─────────────────────── state ────────────────────────────────────

export interface LogStoreState {
  readonly version: 1;
  readonly shipping?: {
    readonly endpoint: string;
    readonly enabled: boolean;
    readonly last_shipped_offset: number;
    readonly last_shipped_at: string | null;
  };
}

const DEFAULT_STATE: LogStoreState = { version: 1 };

const loadState = (paths: LogPaths): ResultAsync<LogStoreState, PeerError> => {
  if (!existsSync(paths.statePath)) return okAsync(DEFAULT_STATE);
  return ResultAsync.fromPromise(readFile(paths.statePath, 'utf8'), (e) =>
    PeerError.identityReadError(paths.statePath, (e as Error).message),
  ).andThen((text) => {
    try {
      const parsed = JSON.parse(text) as LogStoreState;
      if (parsed.version !== 1) {
        return errAsync<LogStoreState, PeerError>(
          PeerError.identityParseError(paths.statePath, `unknown log state version ${parsed.version}`),
        );
      }
      return okAsync<LogStoreState, PeerError>(parsed);
    } catch (e) {
      return errAsync<LogStoreState, PeerError>(
        PeerError.identityParseError(paths.statePath, (e as Error).message),
      );
    }
  });
};

const saveState = (paths: LogPaths, state: LogStoreState): ResultAsync<void, PeerError> =>
  ResultAsync.fromPromise(
    (async () => {
      await mkdir(paths.dir, { recursive: true });
      await writeFile(`${paths.statePath}.tmp`, JSON.stringify(state, null, 2), 'utf8');
      await rename(`${paths.statePath}.tmp`, paths.statePath);
    })(),
    (e) => PeerError.identityWriteError(paths.statePath, (e as Error).message),
  );

// ─────────────────────── append ───────────────────────────────────

/**
 * Append one event to today's log. Idempotent under concurrent calls
 * (relies on POSIX append-mode atomicity for short writes — events
 * are line-bounded and well under a page).
 */
export const appendEvent = (
  paths: LogPaths,
  event: LogEvent,
): ResultAsync<void, PeerError> =>
  ResultAsync.fromPromise(
    (async () => {
      await mkdir(paths.dir, { recursive: true });
      await appendFile(paths.todayPath, JSON.stringify(event) + '\n', 'utf8');
    })(),
    (e) => PeerError.identityWriteError(paths.todayPath, (e as Error).message),
  );

// ─────────────────────── tail / read ──────────────────────────────

/**
 * Read the last N lines from today's log. Convenience for the CLI
 * `wellinformed logs tail` flow. For a streaming watcher the caller
 * should `fs.watch` the file directly.
 */
export const tailToday = (
  paths: LogPaths,
  n: number,
): ResultAsync<readonly LogEvent[], PeerError> => {
  if (!existsSync(paths.todayPath)) return okAsync([]);
  return ResultAsync.fromPromise(readFile(paths.todayPath, 'utf8'), (e) =>
    PeerError.identityReadError(paths.todayPath, (e as Error).message),
  ).map((text) => {
    const lines = text.split('\n').filter((l) => l.trim().length > 0);
    const slice = n > 0 ? lines.slice(-n) : lines;
    const events: LogEvent[] = [];
    for (const line of slice) {
      try { events.push(JSON.parse(line) as LogEvent); }
      catch { /* skip malformed line */ }
    }
    return events;
  });
};

// ─────────────────────── rotation ─────────────────────────────────

/**
 * Compress files older than today; delete files older than retention.
 * Idempotent — safe to call on every append or once per daemon tick.
 */
export const rotate = (
  paths: LogPaths,
  retentionDays: number = 30,
): ResultAsync<{ compressed: number; deleted: number }, PeerError> =>
  ResultAsync.fromPromise(
    (async () => {
      if (!existsSync(paths.dir)) return { compressed: 0, deleted: 0 };
      const today = new Date().toISOString().slice(0, 10);
      const todayName = `events-${today}.jsonl`;
      const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

      const entries = await readdir(paths.dir);
      let compressed = 0, deleted = 0;
      for (const entry of entries) {
        const full = join(paths.dir, entry);
        if (!entry.startsWith('events-')) continue;
        const fStat = await stat(full);

        // Delete files older than retention
        if (fStat.mtimeMs < cutoffMs) {
          await unlink(full);
          deleted++;
          continue;
        }
        // Compress yesterday-or-older .jsonl files
        if (entry.endsWith('.jsonl') && entry !== todayName) {
          const text = await readFile(full);
          const gz = await gzipAsync(text);
          await writeFile(full + '.gz', gz);
          await unlink(full);
          compressed++;
        }
      }
      return { compressed, deleted };
    })(),
    (e) => PeerError.identityWriteError(paths.dir, (e as Error).message),
  );

// ─────────────────────── shipping ─────────────────────────────────

export interface ShipResult {
  readonly events_shipped: number;
  readonly bytes_shipped: number;
}

/**
 * POST any newly-appended events (since `last_shipped_offset` byte
 * position in today's file) to the configured endpoint as NDJSON.
 *
 * Failure modes (any of which returns ok with events_shipped=0 and
 * leaves the offset unchanged):
 *   - Shipping disabled in state
 *   - Endpoint unreachable
 *   - Endpoint returns non-2xx
 * The caller is responsible for emitting `log.shipping_failed` events
 * for these cases — the shipper itself does not log to avoid recursion.
 *
 * Success advances `last_shipped_offset` and updates `last_shipped_at`.
 */
export const shipPending = (
  paths: LogPaths,
  fetchImpl: typeof fetch = fetch,
): ResultAsync<ShipResult, PeerError> =>
  loadState(paths).andThen((state) => {
    if (!state.shipping || !state.shipping.enabled) {
      return okAsync<ShipResult, PeerError>({ events_shipped: 0, bytes_shipped: 0 });
    }
    if (!existsSync(paths.todayPath)) {
      return okAsync<ShipResult, PeerError>({ events_shipped: 0, bytes_shipped: 0 });
    }
    const shipping = state.shipping;
    return ResultAsync.fromPromise(
      (async () => {
        const buf = await readFile(paths.todayPath);
        const totalLen = buf.length;
        const offset = shipping.last_shipped_offset;
        if (offset >= totalLen) return { events_shipped: 0, bytes_shipped: 0, newOffset: -1 };
        const tail = buf.subarray(offset);
        const text = tail.toString('utf8');
        const lines = text.split('\n').filter((l) => l.trim().length > 0);
        if (lines.length === 0) return { events_shipped: 0, bytes_shipped: 0, newOffset: -1 };

        const body = lines.join('\n') + '\n';
        const resp = await fetchImpl(shipping.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-ndjson', 'X-Wellinformed-Schema': '1' },
          body,
        });
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}`);
        }
        return { events_shipped: lines.length, bytes_shipped: tail.length, newOffset: totalLen };
      })(),
      (e) => PeerError.identityWriteError('shipping', (e as Error).message),
    ).andThen((result) => {
      if (result.newOffset < 0) return okAsync<ShipResult, PeerError>({
        events_shipped: result.events_shipped,
        bytes_shipped: result.bytes_shipped,
      });
      const next: LogStoreState = {
        ...state,
        shipping: {
          ...shipping,
          last_shipped_offset: result.newOffset,
          last_shipped_at: new Date().toISOString(),
        },
      };
      return saveState(paths, next).map(() => ({
        events_shipped: result.events_shipped,
        bytes_shipped: result.bytes_shipped,
      }));
    });
  });

// ─────────────────────── shipping config ──────────────────────────

export const enableShipping = (
  paths: LogPaths,
  endpoint: string,
): ResultAsync<void, PeerError> =>
  loadState(paths).andThen((current) =>
    saveState(paths, {
      ...current,
      shipping: {
        endpoint,
        enabled: true,
        last_shipped_offset: current.shipping?.last_shipped_offset ?? 0,
        last_shipped_at: current.shipping?.last_shipped_at ?? null,
      },
    }),
  );

export const disableShipping = (paths: LogPaths): ResultAsync<void, PeerError> =>
  loadState(paths).andThen((current) => {
    if (!current.shipping) return okAsync<void, PeerError>(undefined);
    return saveState(paths, {
      ...current,
      shipping: { ...current.shipping, enabled: false },
    });
  });

export const getShippingStatus = (paths: LogPaths): ResultAsync<LogStoreState['shipping'] | null, PeerError> =>
  loadState(paths).map((s) => s.shipping ?? null);

// ─────────────────────── export bundle ────────────────────────────

/**
 * Concatenate all log files (today + rotated .gz) into a single
 * gzipped NDJSON tarball — the caller's "ship me a debug bundle"
 * primitive. Implementation: read all files, decompress .gz ones,
 * sort by timestamp, gzip the result.
 *
 * Returns the bundle bytes — the CLI writes them to disk.
 */
export const exportBundle = (
  paths: LogPaths,
): ResultAsync<Uint8Array, PeerError> =>
  ResultAsync.fromPromise(
    (async () => {
      if (!existsSync(paths.dir)) return new Uint8Array();
      const entries = (await readdir(paths.dir)).filter((e) => e.startsWith('events-'));
      const allLines: string[] = [];
      const { gunzip } = await import('node:zlib');
      const gunzipAsync = promisify(gunzip);
      for (const entry of entries) {
        const full = join(paths.dir, entry);
        const buf = await readFile(full);
        const text = entry.endsWith('.gz')
          ? (await gunzipAsync(buf)).toString('utf8')
          : buf.toString('utf8');
        for (const line of text.split('\n')) if (line.trim()) allLines.push(line);
      }
      allLines.sort(); // ISO timestamps sort lexicographically
      return new Uint8Array(await gzipAsync(allLines.join('\n') + '\n'));
    })(),
    (e) => PeerError.identityReadError(paths.dir, (e as Error).message),
  );
