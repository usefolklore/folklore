/**
 * Daemon-tick auto-consolidate — Phase 4.1+ feature that runs the
 * consolidation worker on a configurable cadence inside the long-
 * running daemon.
 *
 * Runs in a detached child process per room so:
 *   - Long LLM calls don't block the daemon tick loop
 *   - Failure of one room doesn't abort others
 *   - The cross-process write lock semantics still apply (child
 *     acquires the lock just like a CLI invocation would)
 *
 * Last-run timestamp persists to `<home>/consolidate-last-run.json`
 * so daemon restarts don't trigger an immediate re-run if the
 * interval hasn't elapsed.
 *
 * No-op when `config.daemon.consolidate.enabled === false` (the
 * default). Operators opt-in via config.yaml:
 *
 *   daemon:
 *     consolidate:
 *       enabled: true
 *       interval_seconds: 86400
 *       rooms: [sessions]      # empty = all rooms above threshold
 *       prune: true
 *       model: qwen2.5:1.5b
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { ConsolidateConfig } from '../infrastructure/config-loader.js';

interface LastRunState {
  readonly version: 1;
  readonly last_run_at: string | null;
  readonly last_outcome: 'ok' | 'skipped' | 'error' | null;
}

const lastRunPath = (homeDir: string): string => join(homeDir, 'consolidate-last-run.json');

const loadState = (homeDir: string): LastRunState => {
  const p = lastRunPath(homeDir);
  if (!existsSync(p)) return { version: 1, last_run_at: null, last_outcome: null };
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8')) as LastRunState;
    if (parsed.version !== 1) return { version: 1, last_run_at: null, last_outcome: null };
    return parsed;
  } catch {
    return { version: 1, last_run_at: null, last_outcome: null };
  }
};

const saveState = (homeDir: string, state: LastRunState): void => {
  const p = lastRunPath(homeDir);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(state, null, 2), 'utf8');
};

/**
 * Decide whether to run consolidation now based on:
 *   - cfg.enabled
 *   - last_run_at + cfg.interval_seconds
 *
 * Returns true if a run should kick off; false otherwise (and logs the reason).
 */
export const shouldRunConsolidate = (
  cfg: ConsolidateConfig,
  lastRunAt: string | null,
  now: Date = new Date(),
): boolean => {
  if (!cfg.enabled) return false;
  if (!lastRunAt) return true; // never run before
  const elapsedMs = now.getTime() - new Date(lastRunAt).getTime();
  return elapsedMs >= cfg.interval_seconds * 1000;
};

/**
 * Kick off consolidation for the configured rooms via detached child
 * processes. Records the run start in the state file so the next tick
 * doesn't re-trigger. Returns the number of children spawned.
 *
 * Children inherit WELLINFORMED_HOME so they hit the same graph.
 * Each child acquires its own write lock — if the daemon's lock
 * conflicts (it shouldn't, but stale-recovery handles edge cases),
 * the child errors out cleanly.
 */
export const runConsolidateTick = (
  homeDir: string,
  cfg: ConsolidateConfig,
  log: (msg: string) => void,
  now: Date = new Date(),
): number => {
  const state = loadState(homeDir);
  if (!shouldRunConsolidate(cfg, state.last_run_at, now)) return 0;

  // Determine target rooms. If config specifies rooms, use those; else
  // discover at runtime from the live graph (delegated to the child).
  const rooms = cfg.rooms.length > 0 ? cfg.rooms : ['__auto__'];

  let spawned = 0;
  for (const room of rooms) {
    if (room === '__auto__') {
      log('consolidate-tick: rooms=[] → auto-discovery (deferred to v4.2)');
      log('  for now, set config.daemon.consolidate.rooms explicitly');
      continue;
    }

    const args = [
      join(process.cwd(), 'dist', 'cli', 'index.js'),
      'consolidate', 'run', room,
      '--threshold', String(cfg.similarity_threshold),
      '--min-size', String(cfg.min_size),
      '--max-size', String(cfg.max_size),
      '--model', cfg.model,
      ...(cfg.prune ? ['--prune'] : []),
    ];
    try {
      const child = spawn(process.execPath, args, {
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, WELLINFORMED_HOME: homeDir },
      });
      child.unref();
      log(`consolidate-tick: spawned room=${room} pid=${child.pid}`);
      spawned++;
    } catch (e) {
      log(`consolidate-tick: spawn failed for room=${room}: ${(e as Error).message}`);
    }
  }

  // Record the run attempt timestamp regardless of per-room outcome.
  // Per-child success/failure is opaque to the daemon (they're detached).
  saveState(homeDir, {
    version: 1,
    last_run_at: now.toISOString(),
    last_outcome: spawned > 0 ? 'ok' : 'skipped',
  });

  return spawned;
};

export { loadState as loadConsolidateTickState };
