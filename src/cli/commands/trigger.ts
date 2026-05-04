/**
 * `wellinformed trigger [--room <room>] [--sync]` — run an ingest pass.
 *
 * Default: when the daemon is running, submit an `ingest:room` job
 * per matching room and return immediately (the worker drains the
 * queue serially in the background). When the daemon is not running,
 * fall back to in-process synchronous ingest. `--sync` forces inline
 * mode regardless of daemon state.
 *
 * On success: exit 0. On any fatal error: exit 1. Per-source errors
 * are shown in the report and do NOT abort the batch.
 */

import { formatError } from '../../domain/errors.js';
import type { RoomRun, SourceRun } from '../../domain/sources.js';
import { triggerRoom } from '../../application/ingest.js';
import { defaultRuntime, runtimePaths } from '../runtime.js';
import { isRunning } from '../../daemon/loop.js';
import { ipcCallLines } from '../ipc-client.js';
import { fileSourcesConfig } from '../../infrastructure/sources-config.js';

interface ParsedArgs {
  readonly room?: string;
  readonly sync: boolean;
}

const parseArgs = (args: readonly string[]): ParsedArgs => {
  let room: string | undefined;
  let sync = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--room' && i + 1 < args.length) {
      room = args[i + 1];
      i++;
    } else if (a.startsWith('--room=')) {
      room = a.slice('--room='.length);
    } else if (a === '--sync' || a === '--foreground') {
      sync = true;
    }
  }
  return { room, sync };
};

const renderRun = (run: SourceRun): string => {
  const tag = run.error ? '[fail]' : '[ ok ]';
  const base = `  ${tag} ${run.source_id.padEnd(28)} ${run.kind.padEnd(14)} seen=${String(run.items_seen).padStart(3)} new=${String(run.items_new).padStart(3)} upd=${String(run.items_updated).padStart(3)} skip=${String(run.items_skipped).padStart(3)}`;
  if (run.error) return `${base}\n         err: ${formatError(run.error)}`;
  return base;
};

const renderRoomRun = (room: RoomRun): string => {
  const lines = [`room=${room.room}  sources=${room.runs.length}`];
  for (const r of room.runs) lines.push(renderRun(r));
  return lines.join('\n');
};

/**
 * Resolve the room list. When --room is set, that's the only one;
 * otherwise read sources.json (no sqlite-vec / ONNX needed) and pull
 * distinct rooms. Avoids paying the runtime cold-open just to
 * enumerate rooms in daemon-submit mode.
 */
const resolveRooms = async (parsed: ParsedArgs): Promise<readonly string[] | string> => {
  if (parsed.room) return [parsed.room];
  const paths = runtimePaths();
  const cfg = fileSourcesConfig(paths.sources);
  const list = await cfg.list();
  if (list.isErr()) return formatError(list.error);
  const rooms = Array.from(new Set(list.value.map((d) => d.room)));
  return rooms;
};

const submitToDaemon = async (rooms: readonly string[]): Promise<number> => {
  if (rooms.length === 0) {
    console.log('trigger: no sources configured — use `wellinformed sources add` to seed one.');
    return 0;
  }
  let failed = 0;
  for (const room of rooms) {
    const out = await ipcCallLines('submit-job', ['ingest:room', room]);
    if (out === null) {
      console.error(`trigger: failed to submit ingest:room ${room}`);
      failed++;
      continue;
    }
    const id = out.trim();
    console.log(`  queued  ${id}  ingest:room ${room}`);
  }
  console.log(`\n${rooms.length - failed} job(s) queued — track with: wellinformed jobs watch`);
  return failed > 0 ? 1 : 0;
};

export const trigger = async (args: readonly string[]): Promise<number> => {
  const parsed = parseArgs(args);

  // Daemon-submit path — preferred when the daemon is running and
  // the caller didn't ask for --sync. The user sees their command
  // return immediately; the worker drains in the background.
  if (!parsed.sync && isRunning(runtimePaths().home)) {
    const rooms = await resolveRooms(parsed);
    if (typeof rooms === 'string') {
      console.error(`trigger: ${rooms}`);
      return 1;
    }
    return submitToDaemon(rooms);
  }

  // Sync path — original behaviour. Pays sqlite-vec / ONNX cold-open.
  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`trigger: ${formatError(rt.error)}`);
    return 1;
  }
  const runtime = rt.value;

  try {
    // Load the full descriptor list once. If --room is provided,
    // only that room runs; otherwise iterate every distinct room in
    // the sources config.
    const listed = await runtime.sources.list();
    if (listed.isErr()) {
      console.error(`trigger: ${formatError(listed.error)}`);
      return 1;
    }
    const rooms = parsed.room
      ? [parsed.room]
      : Array.from(new Set(listed.value.map((d) => d.room)));

    if (rooms.length === 0) {
      console.log('trigger: no sources configured — use `wellinformed sources add` to seed one.');
      return 0;
    }

    let hadError = false;
    for (const room of rooms) {
      const result = await triggerRoom(runtime.ingestDeps)(room);
      if (result.isErr()) {
        hadError = true;
        console.error(`trigger: room=${room} — ${formatError(result.error)}`);
        continue;
      }
      console.log(renderRoomRun(result.value));
      if (result.value.runs.some((r) => r.error !== undefined)) hadError = true;
    }

    return hadError ? 1 : 0;
  } finally {
    runtime.close();
  }
};
