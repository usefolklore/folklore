/**
 * Daemon loop — runs triggerRoom on a schedule.
 *
 * The loop is a plain setInterval-based timer that:
 *   1. loads the room registry
 *   2. picks the next room (round-robin or all-at-once)
 *   3. calls triggerRoom for each picked room
 *   4. generates a report per room
 *   5. sleeps until the next tick
 *
 * PID file at `~/.wellinformed/daemon.pid` for lifecycle management.
 *
 * The daemon is designed to run as a detached child process forked
 * by `wellinformed daemon start`. It logs to
 * `~/.wellinformed/daemon.log` and exits cleanly on SIGTERM.
 *
 * For testability, `runOneTick` is exported separately — tests call
 * it directly without starting the timer.
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { ResultAsync, okAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import { formatError } from '../domain/errors.js';
import { roomIds } from '../domain/rooms.js';
import type { RoomRun } from '../domain/sources.js';
import { triggerRoom } from '../application/ingest.js';
import { generateReport, renderReport } from '../application/report.js';
import type { IngestDeps } from '../application/ingest.js';
import type { DaemonConfig } from '../infrastructure/config-loader.js';
import type { RoomsConfig } from '../infrastructure/rooms-config.js';
import type { GraphRepository } from '../infrastructure/graph-repository.js';
import type { VectorIndex } from '../infrastructure/vector-index.js';
import type { SourcesConfig } from '../infrastructure/sources-config.js';

// ─────────────── types ──────────────────

export interface DaemonDeps {
  readonly ingestDeps: IngestDeps;
  readonly rooms: RoomsConfig;
  readonly graphs: GraphRepository;
  readonly vectors: VectorIndex;
  readonly sources: SourcesConfig;
  readonly config: DaemonConfig;
  readonly homePath: string;
}

export interface TickResult {
  readonly rooms: readonly RoomRun[];
  readonly reports_written: readonly string[];
}

// ─────────────── PID management ─────────

const pidPath = (homePath: string): string => join(homePath, 'daemon.pid');
const logPath = (homePath: string): string => join(homePath, 'daemon.log');

export const writePid = (homePath: string): void => {
  mkdirSync(homePath, { recursive: true });
  writeFileSync(pidPath(homePath), String(process.pid));
};

export const readPid = (homePath: string): number | null => {
  const p = pidPath(homePath);
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, 'utf8').trim();
  const pid = parseInt(raw, 10);
  return Number.isNaN(pid) ? null : pid;
};

export const removePid = (homePath: string): void => {
  const p = pidPath(homePath);
  if (existsSync(p)) unlinkSync(p);
};

export const isRunning = (homePath: string): boolean => {
  const pid = readPid(homePath);
  if (pid === null) return false;
  try {
    process.kill(pid, 0); // signal 0 = existence check
    return true;
  } catch {
    // stale PID file — process gone
    removePid(homePath);
    return false;
  }
};

// ─────────────── logging ────────────────

const daemonLog = (homePath: string, msg: string): void => {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    appendFileSync(logPath(homePath), line);
  } catch {
    // best-effort
  }
};

// ─────────────── one tick ───────────────

/** Track round-robin position across ticks. */
let roundRobinIndex = 0;

/**
 * Execute one daemon tick. Exported for testability — tests call
 * this directly without starting the timer or writing PID files.
 */
export const runOneTick = (deps: DaemonDeps): ResultAsync<TickResult, AppError> =>
  deps.rooms
    .load()
    .mapErr((e): AppError => e)
    .andThen((registry) => {
      const allRooms = roomIds(registry);
      if (allRooms.length === 0) {
        return okAsync<TickResult, AppError>({ rooms: [], reports_written: [] });
      }

      // Pick rooms for this tick
      const picked: string[] = [];
      if (deps.config.round_robin_rooms) {
        picked.push(allRooms[roundRobinIndex % allRooms.length]);
        roundRobinIndex++;
      } else {
        picked.push(...allRooms);
      }

      return runRooms(deps, picked);
    });

const runRooms = (
  deps: DaemonDeps,
  rooms: readonly string[],
): ResultAsync<TickResult, AppError> => {
  const results: RoomRun[] = [];
  const reports: string[] = [];

  // Sequential to avoid parallel writes to graph.json
  return rooms
    .reduce<ResultAsync<void, AppError>>(
      (acc, room) =>
        acc.andThen(() =>
          triggerRoom(deps.ingestDeps)(room)
            .andThen((run) => {
              results.push(run);
              daemonLog(deps.homePath, `tick: room=${room} new=${run.runs.reduce((s, r) => s + r.items_new, 0)}`);
              // Generate report
              return generateReport({
                graphs: deps.graphs,
                vectors: deps.vectors,
                sources: deps.sources,
              })({ room })
                .map((data) => {
                  const md = renderReport(data);
                  const reportDir = join(deps.homePath, 'reports', room);
                  mkdirSync(reportDir, { recursive: true });
                  const date = data.generated_at.slice(0, 10);
                  const path = join(reportDir, `${date}.md`);
                  writeFileSync(path, md);
                  reports.push(path);
                  daemonLog(deps.homePath, `report: ${path}`);
                });
            })
            .orElse((e) => {
              daemonLog(deps.homePath, `error: room=${room} ${formatError(e)}`);
              return okAsync(undefined);
            }),
        ),
      okAsync<void, AppError>(undefined),
    )
    .map((): TickResult => ({ rooms: results, reports_written: reports }));
};

// ─────────────── loop ───────────────────

/**
 * Start the daemon loop. Runs until SIGTERM / SIGINT. Writes PID
 * file on start, removes on exit.
 *
 * This function never returns in normal operation — it blocks via
 * the timer. Tests should use `runOneTick` instead.
 */
export const startLoop = async (deps: DaemonDeps): Promise<void> => {
  writePid(deps.homePath);
  daemonLog(deps.homePath, `daemon started (pid=${process.pid}, interval=${deps.config.interval_seconds}s)`);

  const cleanup = (): void => {
    removePid(deps.homePath);
    daemonLog(deps.homePath, 'daemon stopped');
    process.exit(0);
  };
  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);

  // Run immediately on start
  await runOneTick(deps);

  // Then schedule
  const interval = setInterval(async () => {
    await runOneTick(deps);
  }, deps.config.interval_seconds * 1000);

  // Keep the process alive
  interval.unref(); // allow process to exit on signal
  await new Promise<void>(() => {}); // block forever
};
