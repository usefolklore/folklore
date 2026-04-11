/**
 * `wellinformed daemon <sub>` — background research daemon.
 *
 *   start   — fork a detached child that runs the daemon loop
 *   stop    — send SIGTERM to the PID in daemon.pid
 *   status  — show whether the daemon is running + last log lines
 */

import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatError } from '../../domain/errors.js';
import { loadConfig } from '../../infrastructure/config-loader.js';
import { isRunning, readPid, removePid, startLoop } from '../../daemon/loop.js';
import { defaultRuntime, runtimePaths } from '../runtime.js';

const start = async (): Promise<number> => {
  const paths = runtimePaths();
  if (isRunning(paths.home)) {
    const pid = readPid(paths.home);
    console.log(`daemon is already running (pid=${pid})`);
    return 0;
  }

  // Fork a detached child that runs the daemon loop
  const child = spawn(
    process.execPath,
    [join(process.cwd(), 'dist', 'cli', 'index.js'), 'daemon', '_run'],
    {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    },
  );
  child.unref();
  console.log(`daemon started (pid=${child.pid})`);
  console.log(`  logs: ${join(paths.home, 'daemon.log')}`);
  return 0;
};

const stop = async (): Promise<number> => {
  const paths = runtimePaths();
  const pid = readPid(paths.home);
  if (pid === null) {
    console.log('daemon is not running (no PID file)');
    return 0;
  }
  if (!isRunning(paths.home)) {
    console.log(`daemon is not running (stale PID ${pid}, cleaned up)`);
    return 0;
  }
  try {
    process.kill(pid, 'SIGTERM');
    console.log(`sent SIGTERM to pid ${pid}`);
  } catch (e) {
    console.error(`failed to stop daemon: ${(e as Error).message}`);
    return 1;
  }
  removePid(paths.home);
  return 0;
};

const status = async (): Promise<number> => {
  const paths = runtimePaths();
  const pid = readPid(paths.home);
  const running = isRunning(paths.home);
  console.log(`daemon: ${running ? 'running' : 'stopped'}${pid !== null ? ` (pid=${pid})` : ''}`);

  const logFile = join(paths.home, 'daemon.log');
  if (existsSync(logFile)) {
    const lines = readFileSync(logFile, 'utf8').trim().split('\n');
    const recent = lines.slice(-5);
    console.log('\nrecent log:');
    for (const l of recent) console.log(`  ${l}`);
  }
  return 0;
};

/**
 * Internal entrypoint — called by the forked child process. This
 * runs the actual loop; the parent exits immediately after forking.
 */
const run = async (): Promise<number> => {
  const paths = runtimePaths();
  const configPath = join(paths.home, 'config.yaml');
  const cfg = await loadConfig(configPath);
  if (cfg.isErr()) {
    console.error(`daemon: ${formatError(cfg.error)}`);
    return 1;
  }

  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`daemon: ${formatError(rt.error)}`);
    return 1;
  }

  await startLoop({
    ingestDeps: rt.value.ingestDeps,
    rooms: rt.value.rooms,
    graphs: rt.value.graphs,
    vectors: rt.value.vectors,
    sources: rt.value.sources,
    config: cfg.value.daemon,
    homePath: paths.home,
  });
  return 0;
};

export const daemon = async (args: readonly string[]): Promise<number> => {
  const [sub] = args;
  switch (sub) {
    case 'start':
      return start();
    case 'stop':
      return stop();
    case 'status':
      return status();
    case '_run':
      return run();
    default:
      console.error(`daemon: unknown subcommand '${sub ?? ''}'. try: start | stop | status`);
      return 1;
  }
};
