/**
 * `wellinformed jobs <sub>` — inspect the daemon's background queue.
 *
 *   list         show queued + running + recent terminal jobs
 *   list --json  same, JSON
 *   list --live  queued + running only
 *   watch        same as list, refreshed every 1s until interrupted
 *   clear        drop terminal (done/failed) entries from history
 *
 * Submit-side commands (trigger, this, ingest workers) talk to the
 * queue over IPC; this command is read-only.
 *
 * When the daemon isn't running, every subcommand prints a clear
 * diagnostic and exits 1 — there's no in-process queue without it.
 */

import { existsSync } from 'node:fs';
import { runtimePaths } from '../runtime.js';
import { isRunning } from '../../daemon/loop.js';
import { ipcCallJson, ipcCallLines } from '../ipc-client.js';
import type { Job } from '../../domain/job.js';

const USAGE = `usage: wellinformed jobs <sub>

  list [--json] [--live]   show queued + running + recent terminal
  watch                    refresh list every second (Ctrl-C to exit)
  clear                    drop terminal (done/failed) entries`;

const checkDaemon = (): number | null => {
  const paths = runtimePaths();
  if (!existsSync(paths.home) || !isRunning(paths.home)) {
    console.error('jobs: daemon is not running. start it with `wellinformed daemon start`.');
    return 1;
  }
  return null;
};

const list = async (args: readonly string[]): Promise<number> => {
  const code = checkDaemon();
  if (code !== null) return code;
  const json = args.includes('--json');
  const live = args.includes('--live');
  const ipcArgs: string[] = [];
  if (json) ipcArgs.push('--json');
  if (live) ipcArgs.push('--live');
  const out = await ipcCallLines('jobs-list', ipcArgs);
  if (out === null) return 1;
  process.stdout.write(out);
  return 0;
};

const watch = async (): Promise<number> => {
  const code = checkDaemon();
  if (code !== null) return code;

  const draw = async (): Promise<void> => {
    const data = await ipcCallJson<{ jobs: Job[] }>('jobs-list', ['--json']);
    if (!data) return;
    process.stdout.write('\x1b[2J\x1b[H');
    process.stdout.write(`wellinformed jobs — ${new Date().toISOString()}\n\n`);
    if (data.jobs.length === 0) {
      process.stdout.write('  (no jobs)\n');
      return;
    }
    for (const j of data.jobs.slice().sort((a, b) => b.created_at.localeCompare(a.created_at))) {
      const tag = j.status.padEnd(7);
      const meta = j.result_summary ?? j.error ?? '';
      process.stdout.write(`  [${tag}] ${j.id}  ${j.kind.padEnd(16)} ${meta}\n`);
    }
  };

  await draw();
  const handle = setInterval(() => { void draw(); }, 1000);
  await new Promise<void>((resolve) => {
    process.once('SIGINT', () => {
      clearInterval(handle);
      resolve();
    });
  });
  return 0;
};

const clear = async (): Promise<number> => {
  const code = checkDaemon();
  if (code !== null) return code;
  const out = await ipcCallLines('jobs-clear', []);
  if (out === null) return 1;
  process.stdout.write(out);
  return 0;
};

export const jobs = async (args: readonly string[]): Promise<number> => {
  const [sub, ...rest] = args;
  if (!sub || sub === '--help' || sub === '-h' || sub === 'help') {
    console.log(USAGE);
    return 0;
  }
  switch (sub) {
    case 'list':  return list(rest);
    case 'watch': return watch();
    case 'clear': return clear();
    default:
      console.error(`jobs: unknown subcommand '${sub}'`);
      console.error(USAGE);
      return 1;
  }
};
