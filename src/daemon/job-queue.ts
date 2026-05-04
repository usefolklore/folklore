/**
 * In-memory job queue + single-worker driver.
 *
 * Owned by the daemon process (one instance per `wellinformed daemon
 * _run`). The IPC layer submits jobs over the unix socket; the worker
 * pulls from the queue serially. Single-worker is intentional for v1:
 *
 *   - Ingestion mutates graph.json + vectors.db. The cross-process
 *     write lock (process-lock.ts) only allows one writer at a time;
 *     parallel workers would just queue on the lock anyway.
 *   - Sequential output is easier to read in `wellinformed jobs watch`.
 *
 * Persistence: queue + completed log written to ~/.wellinformed/jobs.json
 * on every state transition (best-effort, fire-and-forget). On daemon
 * boot the file is read; queued and running jobs are reset to `queued`
 * and re-run. Done/failed jobs are kept up to MAX_HISTORY rows for
 * `jobs list`.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type Job,
  type JobPayload,
  type JobStatus,
  newJobId,
} from '../domain/job.js';

const MAX_HISTORY = 200;

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
    writeFileSync(path, JSON.stringify(file, null, 2));
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

export interface JobQueue {
  /** Submit a new job. Returns the assigned id. */
  readonly submit: (payload: JobPayload) => string;
  /** Snapshot of current state (queued + running + recent terminal). */
  readonly list: () => readonly Job[];
  /** Remove all done/failed entries. Queued + running are preserved. */
  readonly clearTerminal: () => number;
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

    try {
      const summary = await opts.runner(started);
      replace(job.id, {
        status: 'done',
        finished_at: new Date().toISOString(),
        result_summary: summary,
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      replace(job.id, {
        status: 'failed',
        finished_at: new Date().toISOString(),
        error: err,
      });
    } finally {
      runningId = null;
      // Schedule next tick — yield to the event loop first.
      setImmediate(() => { void tick(); });
    }
  };

  const submit = (payload: JobPayload): string => {
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

  const clearTerminal = (): number => {
    const before = jobs.length;
    jobs = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
    persist();
    return before - jobs.length;
  };

  const stop = (): void => {
    stopped = true;
  };

  // Boot: any leftover queued work resumes immediately.
  setImmediate(() => { void tick(); });

  return { submit, list, clearTerminal, stop };
};
