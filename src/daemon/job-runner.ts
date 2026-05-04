/**
 * Job runner — dispatches Job → Runtime work.
 *
 * Lives in the daemon. Receives the warmed Runtime singleton + a
 * handle to the cross-process write lock (already held by the daemon
 * for its lifetime, so ingestion work runs lock-free here).
 *
 * Each handler returns a single-line result summary that surfaces in
 * `wellinformed jobs list`. Errors throw — the queue catches them and
 * tags the job `failed`.
 */

import { join } from 'node:path';
import { formatError } from '../domain/errors.js';
import type { Job } from '../domain/job.js';
import type { Runtime } from '../cli/runtime.js';
import type { SourceDescriptor } from '../domain/sources.js';
import { triggerRoom, ingestSource } from '../application/ingest.js';

export interface RunnerDeps {
  readonly runtime: Runtime;
}

const runIngestRoom = async (deps: RunnerDeps, room: string): Promise<string> => {
  const result = await triggerRoom(deps.runtime.ingestDeps)(room);
  if (result.isErr()) {
    throw new Error(`ingest:room ${room} — ${formatError(result.error)}`);
  }
  const r = result.value;
  const newCount = r.runs.reduce((a, x) => a + x.items_new, 0);
  const updCount = r.runs.reduce((a, x) => a + x.items_updated, 0);
  const errCount = r.runs.filter((x) => x.error !== undefined).length;
  return `room=${room} sources=${r.runs.length} new=${newCount} updated=${updCount} errors=${errCount}`;
};

/**
 * Re-ingest a single file inside a known room. Builds a one-shot
 * codebase descriptor scoped to that file's parent so the existing
 * codebase adapter does the work. The descriptor is ephemeral (not
 * persisted to sources.json) — same pattern as `wellinformed this`.
 */
const runIngestFile = async (
  deps: RunnerDeps,
  room: string,
  path: string,
): Promise<string> => {
  // The codebase adapter walks a root and emits ContentItems per file.
  // Scoping to a single file: use the file's parent as root and rely on
  // content-hash dedupe (decideForItem) to skip every sibling — only
  // the changed file gets re-embedded. Slightly wasteful (walks
  // siblings to compare hashes) but an order of magnitude faster than
  // re-walking the whole repo.
  const root = path.replace(/\/[^/]+$/, '');
  const desc: SourceDescriptor = {
    id: `${room}-watch-${path}`,
    kind: 'codebase',
    room,
    enabled: true,
    config: { root },
  };
  const built = deps.runtime.registry.buildAll([desc]);
  if (built.errors.length > 0 || built.sources.length === 0) {
    throw new Error(`ingest:file ${path} — ${built.errors.map(formatError).join('; ')}`);
  }
  const ingest = ingestSource(deps.runtime.ingestDeps);
  const r = await ingest(built.sources[0]);
  if (r.isErr()) throw new Error(`ingest:file ${path} — ${formatError(r.error)}`);
  return `file=${path} room=${room} new=${r.value.items_new} updated=${r.value.items_updated} skipped=${r.value.items_skipped}`;
};

/**
 * Incremental session ingest. Routes through triggerRoom('sessions')
 * which uses the existing sessions-state.json offset cursor — only
 * new lines are read; the JSONL re-walk is cheap when most files are
 * unchanged.
 */
const runIngestSession = async (
  deps: RunnerDeps,
  path?: string,
): Promise<string> => {
  // path is reserved for a future targeted re-walk; for v1 we route
  // through the room-level trigger which inspects every JSONL via the
  // cursor and is already efficient on incremental change.
  void path;
  return runIngestRoom(deps, 'sessions');
};

// ─────────────── dispatch ──────────────────

export const buildJobRunner = (deps: RunnerDeps) =>
  async (job: Job): Promise<string> => {
    const p = job.payload;
    switch (p.kind) {
      case 'ingest:room':    return runIngestRoom(deps, p.room);
      case 'ingest:file':    return runIngestFile(deps, p.room, p.path);
      case 'ingest:session': return runIngestSession(deps, p.path);
      default: {
        const _exhaustive: never = p;
        void _exhaustive;
        throw new Error(`unknown job kind: ${(p as { kind: string }).kind}`);
      }
    }
  };

// Silence the home-path import (reserved for a future job-log file).
void join;
