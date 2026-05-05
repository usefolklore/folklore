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

import { dirname, isAbsolute } from 'node:path';
import { readFileSync, statSync } from 'node:fs';
import { okAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import { formatError } from '../domain/errors.js';
import type { Job } from '../domain/job.js';
import type { Runtime } from '../cli/runtime.js';
import type { Source, SourceDescriptor } from '../domain/sources.js';
import type { ContentItem } from '../domain/content.js';
import { triggerRoom, ingestSource } from '../application/ingest.js';
import { ingestBatch } from '../application/batch-ingest.js';

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
 * Re-ingest a single file inside a known room. Reads the file directly,
 * builds a synthetic ContentItem, and routes through the chunk-based
 * ingest pipeline — bypassing the codebase adapter's directory walk
 * entirely.
 *
 * Was: walked the parent directory and let content-hash dedupe skip
 * siblings. For a 200-file dir, 200 statSync + 200 hash compares per
 * editor save. Bursty workloads (npm install touching package-lock,
 * git checkout, watch-mode rebuild) would queue N jobs each redoing
 * O(N) sibling walks → O(N²) on a single repo edit.
 *
 * Now: O(1) per save. Just the file we got the change event for.
 */
const runIngestFile = async (
  deps: RunnerDeps,
  room: string,
  path: string,
): Promise<string> => {
  if (!isAbsolute(path) || path === '/') {
    throw new Error(`ingest:file refused — non-absolute or root path: ${path}`);
  }

  // Read the file. Skip cleanly when it was deleted between the
  // watcher event and the worker pulling the job.
  let text: string;
  let mtime: Date;
  try {
    const buf = readFileSync(path, 'utf8');
    text = buf;
    mtime = statSync(path).mtime;
  } catch (e) {
    return `file=${path} room=${room} skipped (${(e as Error).message})`;
  }

  // Skip empty / huge files — embedding them is wasted work, and the
  // codebase adapter already filters by extension at the directory
  // walk; here we re-apply a size sanity check.
  const MAX_FILE_BYTES = 2_000_000;
  if (text.length === 0) return `file=${path} room=${room} skipped (empty)`;
  if (text.length > MAX_FILE_BYTES) {
    return `file=${path} room=${room} skipped (>${MAX_FILE_BYTES}B)`;
  }

  // Build a synthetic single-item Source so the existing chunk
  // pipeline (chunk text → batched embed → single graph save) does
  // the work. The descriptor's source_uri is the file path; the
  // ingest pipeline's content-hash dedupe will skip if the file
  // hasn't actually changed since last index.
  const item: ContentItem = {
    source_uri: `file://${path}`,
    title: path,
    text,
    metadata: { kind: 'ingest:file-watch', mtime: mtime.toISOString() },
  };
  const desc: SourceDescriptor = {
    id: `${room}-watch-${path}`,
    kind: 'codebase',
    room,
    enabled: true,
    config: { root: dirname(path) },
  };
  const synthSource: Source = {
    descriptor: desc,
    fetch: () => okAsync<readonly ContentItem[], AppError>([item]),
  };

  const ingest = ingestSource(deps.runtime.ingestDeps);
  const r = await ingest(synthSource);
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

/**
 * Batched file ingest — daemon-side adapter.
 *
 * Was a 280-line inline reimplementation of the chunk pipeline (the
 * "patch" the architects flagged as the highest-value cleanup target).
 * Now: read files into ContentItems → build a SourceDescriptor →
 * delegate to application/batch-ingest's `ingestBatch` use case.
 * Single source of truth for chunk + entity + graph mutation lives
 * in the application layer where it belongs.
 *
 * The mentionsExtractor port is wired into IngestDeps by the daemon's
 * Runtime construction (cli/runtime.ts) — that's how the entity
 * layer plugs into the canonical pipeline without the daemon owning
 * its own copy of ingest semantics.
 */
const MAX_BATCH_FILE_BYTES = 2_000_000;

const runIngestBatch = async (
  deps: RunnerDeps,
  room: string,
  paths: readonly string[],
): Promise<string> => {
  if (paths.length === 0) return `room=${room} paths=0 (empty)`;

  // Read every file into a ContentItem. Anything we can't or
  // shouldn't index is skipped without aborting the batch.
  const items: ContentItem[] = [];
  let skippedRead = 0;
  let skippedSize = 0;
  for (const path of paths) {
    if (!isAbsolute(path) || path === '/') { skippedRead++; continue; }
    try {
      const text = readFileSync(path, 'utf8');
      if (text.length === 0) { skippedSize++; continue; }
      if (text.length > MAX_BATCH_FILE_BYTES) { skippedSize++; continue; }
      const mtime = statSync(path).mtime.toISOString();
      items.push({
        source_uri: `file://${path}`,
        title: path,
        text,
        metadata: { kind: 'ingest:batch-watch', mtime },
      });
    } catch {
      skippedRead++;
    }
  }
  if (items.length === 0) {
    return `room=${room} paths=${paths.length} skipped_read=${skippedRead} skipped_size=${skippedSize}`;
  }

  // Delegate to the application-layer batch use case. The runtime's
  // ingestDeps already carries graphMutex + (optionally)
  // mentionsExtractor, so the entity layer plugs in via the port —
  // this daemon adapter does not import infrastructure or domain
  // entity modules at all.
  const descriptor: SourceDescriptor = {
    id: `${room}-batch-${Date.now()}`,
    kind: 'codebase',
    room,
    enabled: true,
    config: { root: '<batch>' },
  };
  const r = await ingestBatch(deps.runtime.ingestDeps)({ descriptor, items });
  if (r.isErr()) throw new Error(`ingest:batch room=${room} — ${formatError(r.error)}`);
  const v = r.value;
  return `room=${room} paths=${paths.length} new=${v.items_new} updated=${v.items_updated} skipped=${v.items_skipped + skippedRead + skippedSize}`;
};

/**
 * Project ingest — the four ephemeral descriptors that `wellinformed
 * this` wants to run, but routed through the daemon's worker so the
 * graph.json write-lock dance stays single-writer. Descriptors are
 * NOT persisted to sources.json (mirrors `wellinformed index`).
 */
const runIngestProject = async (
  deps: RunnerDeps,
  room: string,
  root: string,
  maxCommits: number,
  includeDev: boolean,
): Promise<string> => {
  const descriptors: SourceDescriptor[] = [
    { id: `${room}-codebase`, kind: 'codebase', room, enabled: true, config: { root } },
    { id: `${room}-deps`, kind: 'package_deps', room, enabled: true, config: { root, include_dev: includeDev } },
    { id: `${room}-submodules`, kind: 'git_submodules', room, enabled: true, config: { root } },
    { id: `${room}-git`, kind: 'git_log', room, enabled: true, config: { root, max_commits: maxCommits } },
  ];
  const ingest = ingestSource(deps.runtime.ingestDeps);
  let totalNew = 0;
  let totalUpd = 0;
  let totalSkip = 0;
  let errs = 0;
  for (const desc of descriptors) {
    const built = deps.runtime.registry.buildAll([desc]);
    if (built.errors.length > 0 || built.sources.length === 0) {
      errs++;
      continue;
    }
    const r = await ingest(built.sources[0]);
    if (r.isErr()) {
      errs++;
      continue;
    }
    totalNew += r.value.items_new;
    totalUpd += r.value.items_updated;
    totalSkip += r.value.items_skipped;
  }
  return `room=${room} root=${root} new=${totalNew} updated=${totalUpd} skipped=${totalSkip} errors=${errs}`;
};

// ─────────────── dispatch ──────────────────

/**
 * Build the per-job dispatcher. The mutex now lives at a finer
 * granularity — inside indexChunksFor's load→upsert→save block — so
 * skipped items, embed work, and vector upserts run lock-free. This
 * keeps the mutex window tiny (~80ms graph save) instead of holding
 * the gate for the entire job lifetime, which under burst load
 * (boot reconciliation enqueues hundreds of jobs) was queueing
 * skipped no-op jobs behind one another for tens of seconds each.
 */
export const buildJobRunner = (deps: RunnerDeps) =>
  async (job: Job): Promise<string> => {
    const p = job.payload;
    switch (p.kind) {
      case 'ingest:room':    return runIngestRoom(deps, p.room);
      case 'ingest:file':    return runIngestFile(deps, p.room, p.path);
      case 'ingest:session': return runIngestSession(deps, p.path);
      case 'ingest:project': return runIngestProject(deps, p.room, p.root, p.maxCommits ?? 50, p.includeDev ?? true);
      case 'ingest:batch':   return runIngestBatch(deps, p.room, p.paths);
      default: {
        const _exhaustive: never = p;
        void _exhaustive;
        throw new Error(`unknown job kind: ${(p as { kind: string }).kind}`);
      }
    }
  };

