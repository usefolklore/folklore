/**
 * Daemon-tick auto-forget — runs the long-term-memory GC pass
 * (`planAutoForget` → delete TTL-expired tier nodes, demote frozen-band
 * ones) on a configurable cadence inside the long-running daemon.
 *
 * Unlike consolidation (which spawns a detached child because of long
 * Ollama calls), this runs IN-PROCESS: it is pure graph math plus one
 * load/save round-trip and a few vector deletes — the same shape as the
 * `enforceRetention` pass already called inline in the daemon loop.
 *
 * Local-only by construction (the application orchestrator never
 * propagates deletes to peers) and gated three ways for safety:
 *   - `config.daemon.auto_forget.enabled` (default false — opt-in)
 *   - a last-run cadence file so it doesn't run every tick
 *   - `dry_run` computes and logs the plan but never mutates
 *
 * Opt in via config.yaml:
 *
 *   daemon:
 *     auto_forget:
 *       enabled: true
 *       interval_seconds: 86400
 *       demote_band: frozen
 *       min_age_days: 30
 *       dry_run: false
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ResultAsync, okAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import type { AutoForgetDaemonConfig } from '../infrastructure/config-loader.js';
import {
  runAutoForgetTick,
  type AutoForgetDeps,
  type AutoForgetReport,
} from '../application/auto-forget-tick.js';

interface LastRunState {
  readonly version: 1;
  readonly last_run_at: string | null;
  readonly last_outcome: 'ok' | 'skipped' | 'error' | null;
}

const lastRunPath = (homeDir: string): string => join(homeDir, 'auto-forget-last-run.json');

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
 * Pure cadence gate: enabled AND (never run OR interval elapsed).
 * Extracted so the decision is unit-testable without touching disk.
 */
export const shouldRunAutoForget = (
  cfg: AutoForgetDaemonConfig,
  lastRunAt: string | null,
  now: Date = new Date(),
): boolean => {
  if (!cfg.enabled) return false;
  if (!lastRunAt) return true;
  const elapsedMs = now.getTime() - new Date(lastRunAt).getTime();
  return elapsedMs >= cfg.interval_seconds * 1000;
};

/**
 * Run one GC pass if the cadence gate allows. Best-effort: resolves ok
 * with `null` when skipped or on error (the daemon tick must never fail
 * because GC hiccuped), and records the attempt so the next tick waits
 * out the interval. Returns the report when a pass actually ran.
 */
export const runAutoForgetDaemonTick = (
  deps: AutoForgetDeps,
  homeDir: string,
  cfg: AutoForgetDaemonConfig,
  log: (msg: string) => void,
  now: Date = new Date(),
): ResultAsync<AutoForgetReport | null, AppError> => {
  const state = loadState(homeDir);
  if (!shouldRunAutoForget(cfg, state.last_run_at, now)) return okAsync(null);

  return runAutoForgetTick(deps)({
    dryRun: cfg.dry_run,
    config: { demoteBand: cfg.demote_band, demoteMinAgeDays: cfg.min_age_days },
  })
    .map((report): AutoForgetReport => {
      const { deleted, demoted, errors } = report.applied;
      const verb = report.dryRun ? 'planned' : 'applied';
      log(
        `auto-forget-tick: ${verb} — ${deleted.length} deleted, ${demoted.length} demoted` +
          (errors.length > 0 ? `, ${errors.length} error(s)` : '') +
          (report.dryRun ? ' (dry-run, nothing mutated)' : ''),
      );
      saveState(homeDir, { version: 1, last_run_at: now.toISOString(), last_outcome: 'ok' });
      return report;
    })
    .orElse((e): ResultAsync<AutoForgetReport | null, AppError> => {
      log(`auto-forget-tick: error — ${e.type}`);
      saveState(homeDir, { version: 1, last_run_at: now.toISOString(), last_outcome: 'error' });
      return okAsync(null);
    });
};

export { loadState as loadAutoForgetTickState };
