/**
 * In-memory job queue + single-worker driver.
 *
 * Owned by the daemon process (one instance per `akashik daemon
 * _run`). The IPC layer submits jobs over the unix socket; the worker
 * pulls from the queue serially. Single-worker is intentional for v1:
 *
 *   - Ingestion mutates graph.json + vectors.db. The cross-process
 *     write lock (process-lock.ts) only allows one writer at a time;
 *     parallel workers would just queue on the lock anyway.
 *   - Sequential output is easier to read in `akashik jobs watch`.
 *
 * Persistence: queue + completed log written to ~/.akashik/jobs.json
 * on every state transition (best-effort, fire-and-forget). On daemon
 * boot the file is read; queued and running jobs are reset to `queued`
 * and re-run. Done/failed jobs are kept up to MAX_HISTORY rows for
 * `jobs list`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteSync } from '../infrastructure/atomic-write.js';
import {
  type Job,
  type JobPayload,
  type JobStatus,
  newJobId,
} from '../domain/job.js';
import { metrics } from '../domain/metrics.js';

const MAX_HISTORY = 200;
/**
 * Bounded backpressure caps (multi-LLM round-2 review — `daemon/job-queue.ts:174`):
 *
 *   - MAX_QUEUED      hard ceiling on pending jobs. A burst that exceeds
 *                     this is rejected (submit returns null) instead of
 *                     pushing into an unbounded array → eventual OOM.
 *                     1000 is generous: even 10× a normal user's daily
 *                     activity stays well under it. Configurable later.
 *   - DEDUP_KINDS     job kinds whose identical payloads collapse. A
 *                     second 'ingest:session' fired by the file-watcher
 *                     two seconds after the first one returns the same
 *                     id without enqueueing — saves the worker from
 *                     redoing work the previous tick already covered.
 */
const MAX_QUEUED = 1000;
const DEDUP_KINDS = new Set<string>(['ingest:session', 'ingest:batch']);

interface JobsFile {
  readonly version: 1;
  readonly jobs: readonly Job[];
}

const emptyFile = (): JobsFile => ({ version: 1, jobs: [] });

const safeRead = (path: string): JobsFile => {
  if (!existsSync(path)) return emptyFile();
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as JobsFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.jobs)) return emptyFile();
    return parsed;
  } catch {
    return emptyFile();
  }
};

const safeWrite = (path: string, file: JobsFile): void => {
  try {
    // tmp+rename so a SIGKILL mid-write never leaves a torn jobs.json
    // (which would silently roll back to an empty list on next boot
    // and lose the entire queue + history).
    atomicWriteSync(path, JSON.stringify(file, null, 2));
  } catch {
    /* persistence is best-effort */
  }
};

// ─────────────── runner port ───────────────

/**
 * The runner does the actual work. Wired in src/daemon/job-runner.ts.
 * Returns a result_summary on success, throws / returns rejected
 * promise on failure (the queue catches and tags `failed`).
 */
export type JobRunner = (job: Job) => Promise<string>;

// ─────────────── queue ─────────────────────

/**
 * Snapshot of queue pressure — used by the IPC `daemon health` endpoint
 * and (later) the metrics port. Bounded reads, no I/O.
 */
export interface QueueDepth {
  readonly queued: number;
  readonly running: number;
  readonly max_queued: number;
}

export interface JobQueue {
  /**
   * Submit a new job.
   *
   *   string  → accepted, returns the job id (existing id when a
   *             duplicate of an already-queued job in DEDUP_KINDS).
   *   null    → rejected: the queue is at MAX_QUEUED. Caller should
   *             back off / report. Drops the rejection into the daemon
   *             log so operators see it.
   */
  readonly submit: (payload: JobPayload) => string | null;
  /** Snapshot of current state (queued + running + recent terminal). */
  readonly list: () => readonly Job[];
  /** Pressure snapshot — non-allocating, safe in hot paths. */
  readonly depth: () => QueueDepth;
  /** Remove all done/failed entries. Queued + running are preserved. */
  readonly clearTerminal: () => number;
  /** Drop ALL queued + done/failed. Running stays (can't unsubmit
   * mid-flight). Used to recover from a runaway catch-up flood. */
  readonly clearAll: () => number;
  /** Stop the worker loop (for daemon shutdown). */
  readonly stop: () => void;
}

export interface JobQueueOptions {
  readonly homePath: string;
  readonly runner: JobRunner;
  /** Called on every state transition — used by `jobs watch`. */
  readonly onChange?: (job: Job) => void;
}

export const startJobQueue = (opts: JobQueueOptions): JobQueue => {
  const persistPath = join(opts.homePath, 'jobs.json');

  // Boot — load persisted history; reset any in-flight jobs to queued
  // so they re-run after a daemon restart.
  let jobs: Job[] = safeRead(persistPath).jobs.map((j) =>
    j.status === 'running' ? { ...j, status: 'queued' as JobStatus } : j,
  );

  let stopped = false;
  let runningId: string | null = null;

  const persist = (): void => {
    // Trim terminal history to MAX_HISTORY rows.
    const terminal = jobs.filter((j) => j.status === 'done' || j.status === 'failed');
    const live = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
    if (terminal.length > MAX_HISTORY) {
      // Keep the most recent MAX_HISTORY terminal rows.
      const sorted = terminal
        .slice()
        .sort((a, b) => (a.finished_at ?? '').localeCompare(b.finished_at ?? ''));
      jobs = [...live, ...sorted.slice(-MAX_HISTORY)];
    }
    safeWrite(persistPath, { version: 1, jobs });
  };

  const replace = (id: string, patch: Partial<Job>): Job | null => {
    const idx = jobs.findIndex((j) => j.id === id);
    if (idx === -1) return null;
    const next: Job = { ...jobs[idx], ...patch } as Job;
    jobs[idx] = next;
    persist();
    opts.onChange?.(next);
    return next;
  };

  const nextQueued = (): Job | undefined =>
    jobs.find((j) => j.status === 'queued');

  /**
   * Worker tick — runs one job to completion, then schedules the next.
   * Uses setImmediate between jobs so a long burst of submissions
   * doesn't starve the event loop.
   */
  const tick = async (): Promise<void> => {
    if (stopped) return;
    if (runningId !== null) return;
    const job = nextQueued();
    if (!job) return;

    runningId = job.id;
    const started = replace(job.id, {
      status: 'running',
      started_at: new Date().toISOString(),
    });
    if (!started) {
      runningId = null;
      return;
    }

    const t0 = performance.now();
    try {
      const summary = await opts.runner(started);
      replace(job.id, {
        status: 'done',
        finished_at: new Date().toISOString(),
        result_summary: summary,
      });
      metrics.histogram('queue.job.ms').observe(performance.now() - t0);
      metrics.counter(`queue.job.${started.kind}.ok`).inc();
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      replace(job.id, {
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: err,
      });
      metrics.histogram('queue.job.ms').observe(performance.now() - t0);
      metrics.counter(`queue.job.${started.kind}.error`).inc();
    } finally {
      runningId = null;
      // Schedule next tick — yield to the event loop first.
      setImmediate(() => { void tick(); });
    }
  };

  const submit = (payload: JobPayload): string | null => {
    // Per-kind dedupe: same kind + identical payload as an already-
    // queued (NOT yet running) job collapses into the existing id.
    // `running` jobs do NOT dedupe — they're already mid-flight, the
    // user might have legitimately changed something since then.
    if (DEDUP_KINDS.has(payload.kind)) {
      const incoming = JSON.stringify(payload);
      for (const j of jobs) {
        if (
          j.status === 'queued' &&
          j.kind === payload.kind &&
          JSON.stringify(j.payload) === incoming
        ) {
          return j.id;
        }
      }
    }

    // Bounded admission. Counts only queued (in-flight `running` is
    // still bounded at 1 by the single-worker design). At capacity,
    // reject and log so the operator sees overload pressure rather
    // than discovering it as an OOM crash.
    const queuedCount = jobs.reduce(
      (n, j) => (j.status === 'queued' ? n + 1 : n),
      0,
    );
    if (queuedCount >= MAX_QUEUED) {
      metrics.counter('queue.rejected').inc();
      opts.onChange?.({
        id: 'rejected',
        kind: payload.kind,
        payload,
        status: 'failed',
        created_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        error: `queue_full: ${queuedCount} ≥ ${MAX_QUEUED}`,
      } as Job);
      return null;
    }

    const id = newJobId();
    const job: Job = {
      id,
      kind: payload.kind,
      payload,
      status: 'queued',
      created_at: new Date().toISOString(),
    };
    jobs.push(job);
    persist();
    opts.onChange?.(job);
    // Kick the worker if idle.
    setImmediate(() => { void tick(); });
    return id;
  };

  const list = (): readonly Job[] => jobs.slice();

  const depth = (): QueueDepth => {
    let queued = 0;
    let running = 0;
    for (const j of jobs) {
      if (j.status === 'queued') queued++;
      else if (j.status === 'running') running++;
    }
    // Mirror to gauges so the metrics snapshot has the live pressure
    // without requiring callers to poll depth() and copy values.
    metrics.gauge('queue.queued').set(queued);
    metrics.gauge('queue.running').set(running);
    return { queued, running, max_queued: MAX_QUEUED };
  };

  const clearTerminal = (): number => {
    const before = jobs.length;
    jobs = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
    persist();
    return before - jobs.length;
  };

  const clearAll = (): number => {
    const before = jobs.length;
    jobs = jobs.filter((j) => j.status === 'running');
    persist();
    return before - jobs.length;
  };

  const stop = (): void => {
    stopped = true;
  };

  // Boot: any leftover queued work resumes immediately.
  setImmediate(() => { void tick(); });

  return { submit, list, depth, clearTerminal, clearAll, stop };
};
