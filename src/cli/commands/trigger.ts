/**
 * `akashik trigger [--sync]` — run an ingest pass against every
 * enabled source.
 *
 * V5 (Phase 24): no --room flag. Trigger runs ALL enabled sources
 * flat. Daemon-submit mode submits a single `ingest:all` job; sync
 * mode iterates sources serially via triggerAllSources.
 *
 * On success: exit 0. On any fatal error: exit 1. Per-source errors
 * are shown in the report and do NOT abort the batch.
 */

import { formatError } from '../../domain/errors.js';
import type { RoomRun, SourceRun } from '../../domain/sources.js';
import { triggerAllSources } from '../../application/ingest.js';
import { defaultRuntime, runtimePaths } from '../runtime.js';
import { isRunning } from '../../daemon/loop.js';
import { ipcCallLines } from '../ipc-client.js';

interface ParsedArgs {
  readonly sync: boolean;
}

const parseArgs = (args: readonly string[]): ParsedArgs => {
  let sync = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--sync' || a === '--foreground') sync = true;
    // --room is silently accepted-and-ignored for back-compat with
    // legacy hooks/scripts; emit a warning so users update their wrappers.
    else if (a === '--room' || a.startsWith('--room=')) {
      console.error('trigger: --room is removed in V5 (ignored). All sources run together.');
      if (a === '--room') i++; // consume the value
    }
  }
  return { sync };
};

const renderRun = (run: SourceRun): string => {
  const tag = run.error ? '[fail]' : '[ ok ]';
  const base = `  ${tag} ${run.source_id.padEnd(28)} ${run.kind.padEnd(14)} seen=${String(run.items_seen).padStart(3)} new=${String(run.items_new).padStart(3)} upd=${String(run.items_updated).padStart(3)} skip=${String(run.items_skipped).padStart(3)}`;
  if (run.error) return `${base}\n         err: ${formatError(run.error)}`;
  return base;
};

const renderTickRun = (tick: RoomRun): string => {
  const lines = [`sources=${tick.runs.length}`];
  for (const r of tick.runs) lines.push(renderRun(r));
  return lines.join('\n');
};

const submitToDaemon = async (): Promise<number> => {
  const out = await ipcCallLines('submit-job', ['ingest:all']);
  if (out === null) {
    console.error('trigger: failed to submit ingest:all');
    return 1;
  }
  const id = out.trim();
  console.log(`  queued  ${id}  ingest:all`);
  console.log('\n1 job queued — track with: akashik jobs watch');
  return 0;
};

export const trigger = async (args: readonly string[]): Promise<number> => {
  const parsed = parseArgs(args);

  // Daemon-submit path — preferred when daemon is running.
  if (!parsed.sync && isRunning(runtimePaths().home)) {
    return submitToDaemon();
  }

  // Sync path — pays sqlite-vec / ONNX cold-open.
  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`trigger: ${formatError(rt.error)}`);
    return 1;
  }
  const runtime = rt.value;

  try {
    const result = await triggerAllSources(runtime.ingestDeps)();
    if (result.isErr()) {
      console.error(`trigger: ${formatError(result.error)}`);
      return 1;
    }
    const tick = result.value;
    if (tick.runs.length === 0) {
      console.log('trigger: no sources configured — use `akashik sources add` to seed one.');
      return 0;
    }
    console.log(renderTickRun(tick));
    const hadError = tick.runs.some((r) => r.error !== undefined);
    return hadError ? 1 : 0;
  } finally {
    runtime.close();
  }
};
