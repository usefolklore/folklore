/**
 * Job runner — dispatches Job → Runtime work.
 *
 * Lives in the daemon. Receives the warmed Runtime singleton + a
 * handle to the cross-process write lock (already held by the daemon
 * for its lifetime, so ingestion work runs lock-free here).
 *
 * Each handler returns a single-line result summary that surfaces in
 * `folklore jobs list`. Errors throw — the queue catches them and
 * tags the job `failed`.
 *
 * V5: per-workspace dispatch is gone. The `ingest:workspace` payload is
 * still carried by the Job type (24-09 owns the domain narrowing) but
 * the runner now interprets it as "run every enabled source flat" —
 * the workspace label is captured in the summary only. Jobs (ingest,
 * share-sync, search-gossip) run against the global graph.
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
import { ingestSource } from '../application/ingest.js';
import { ingestBatch } from '../application/batch-ingest.js';
import { isEnabled } from '../domain/sources.js';

export interface RunnerDeps {
  readonly runtime: Runtime;
}

/**
 * V5: run every enabled source flat. The `workspace` label is preserved in
 * the result summary for parity with the `ingest:workspace` payload
 * shape, but no longer drives source selection.
 */
const runIngestAll = async (deps: RunnerDeps, label: string): Promise<string> => {
  const listed = await deps.runtime.sources.list();
  if (listed.isErr()) {
    throw new Error(`ingest:all label=${label} — ${formatError(listed.error)}`);
  }
  const descriptors = listed.value.filter(isEnabled);
  const built = deps.runtime.registry.buildAll(descriptors);
  let newCount = 0;
  let updCount = 0;
  let errCount = built.errors.length;
  for (const source of built.sources) {
    const r = await ingestSource(deps.runtime.ingestDeps)(source);
    if (r.isErr()) {
      errCount++;
      continue;
    }
    newCount += r.value.items_new;
    updCount += r.value.items_updated;
  }
  return `label=${label} sources=${built.sources.length} new=${newCount} updated=${updCount} errors=${errCount}`;
};

/**
 * Re-ingest a single file. Reads the file directly, builds a
 * synthetic ContentItem, and routes through the chunk-based
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
 *
 * V5: the `label` argument is a vestigial pass-through of the
 * job-payload `workspace` field — used only in the result summary, never
 * for routing.
 */
const runIngestFile = async (
  deps: RunnerDeps,
  label: string,
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
    return `file=${path} label=${label} skipped (${(e as Error).message})`;
  }

  // Skip empty / huge files — embedding them is wasted work, and the
  // codebase adapter already filters by extension at the directory
  // walk; here we re-apply a size sanity check.
  const MAX_FILE_BYTES = 2_000_000;
  if (text.length === 0) return `file=${path} label=${label} skipped (empty)`;
  if (text.length > MAX_FILE_BYTES) {
    return `file=${path} label=${label} skipped (>${MAX_FILE_BYTES}B)`;
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
    id: `${label}-watch-${path}`,
    kind: 'codebase',
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
  return `file=${path} label=${label} new=${r.value.items_new} updated=${r.value.items_updated} skipped=${r.value.items_skipped}`;
};

/**
 * Incremental session ingest. V5: with per-workspace dispatch retired, this
 * routes through the flat source list and lets the sessions adapter's
 * own cursor decide what work to do.
 *
 * The path argument is reserved for a future targeted re-walk; for v1
 * we still run the full flat fan-out — the sessions adapter's offset
 * cursor keeps the work proportional to new bytes.
 */
const runIngestSession = async (
  deps: RunnerDeps,
  path?: string,
): Promise<string> => {
  void path;
  return runIngestAll(deps, 'sessions');
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
  label: string,
  paths: readonly string[],
): Promise<string> => {
  if (paths.length === 0) return `label=${label} paths=0 (empty)`;

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
    return `label=${label} paths=${paths.length} skipped_read=${skippedRead} skipped_size=${skippedSize}`;
  }

  // Delegate to the application-layer batch use case. The runtime's
  // ingestDeps already carries graphMutex + (optionally)
  // mentionsExtractor, so the entity layer plugs in via the port —
  // this daemon adapter does not import infrastructure or domain
  // entity modules at all.
  const descriptor: SourceDescriptor = {
    id: `${label}-batch-${Date.now()}`,
    kind: 'codebase',
    enabled: true,
    config: { root: '<batch>' },
  };
  const r = await ingestBatch(deps.runtime.ingestDeps)({ descriptor, items });
  if (r.isErr()) throw new Error(`ingest:batch label=${label} — ${formatError(r.error)}`);
  const v = r.value;
  return `label=${label} paths=${paths.length} new=${v.items_new} updated=${v.items_updated} skipped=${v.items_skipped + skippedRead + skippedSize}`;
};

/**
 * Project ingest — the four ephemeral descriptors that `folklore
 * this` wants to run, but routed through the daemon's worker so the
 * graph.json write-lock dance stays single-writer. Descriptors are
 * NOT persisted to sources.json (mirrors `folklore index`).
 *
 * V5: the `label` argument identifies the project for the result
 * summary; it no longer drives source partitioning.
 */
const runIngestProject = async (
  deps: RunnerDeps,
  label: string,
  root: string,
  maxCommits: number,
  includeDev: boolean,
): Promise<string> => {
  const descriptors: SourceDescriptor[] = [
    { id: `${label}-codebase`, kind: 'codebase', enabled: true, config: { root } },
    { id: `${label}-deps`, kind: 'package_deps', enabled: true, config: { root, include_dev: includeDev } },
    { id: `${label}-submodules`, kind: 'git_submodules', enabled: true, config: { root } },
    { id: `${label}-git`, kind: 'git_log', enabled: true, config: { root, max_commits: maxCommits } },
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
  return `label=${label} root=${root} new=${totalNew} updated=${totalUpd} skipped=${totalSkip} errors=${errs}`;
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
      // V5: per-workspace dispatch is gone. Job payloads still carry
      // a `workspace` field (24-09 owns the domain narrowing); the runner reads
      // it as an opaque label for the result summary only.
      case 'ingest:workspace': return runIngestAll(deps, p.workspace);
      case 'ingest:file':    return runIngestFile(deps, p.workspace, p.path);
      case 'ingest:session': return runIngestSession(deps, p.path);
      case 'ingest:project': return runIngestProject(deps, p.workspace, p.root, p.maxCommits ?? 50, p.includeDev ?? true);
      case 'ingest:batch':   return runIngestBatch(deps, p.workspace, p.paths);
      default: {
        const _exhaustive: never = p;
        void _exhaustive;
        throw new Error(`unknown job kind: ${(p as { kind: string }).kind}`);
      }
    }
  };

