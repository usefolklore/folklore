/**
 * `wellinformed sessions <sub>` — Claude session ingestion lifecycle.
 *
 * Subcommands:
 *   reingest         — wipe sessions-state.json + re-trigger the sessions
 *                      source from offset 0. Used to recover from a
 *                      destructive `consolidate --prune` that removed raw
 *                      entries we want back.
 *   status           — show how many JSONL files + bytes the state cursor
 *                      is currently at.
 *
 * The reingest path:
 *   1. Acquire the cross-process write lock (same as consolidate does)
 *   2. Delete ~/.wellinformed/sessions-state.json
 *   3. Print next-step guidance (`trigger --room sessions` re-walks from
 *      offset 0; the source file `claude-sessions-default` was auto-
 *      provisioned by ensureSessionsRoom on first daemon boot)
 *
 * We intentionally do NOT kick off the trigger here — it's a long-
 * running ingest, better run explicitly so the operator sees progress.
 */

import { existsSync, unlinkSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { formatError } from '../../domain/errors.js';
import { acquireLock } from '../../infrastructure/process-lock.js';
import { wellinformedHome } from '../runtime.js';

const sessionsStatePath = (): string => join(wellinformedHome(), 'sessions-state.json');

const reingest = async (args: readonly string[]): Promise<number> => {
  const force = args.includes('--force') || args.includes('-y');
  const statePath = sessionsStatePath();

  if (!existsSync(statePath)) {
    console.log('sessions-state.json not present — nothing to reset.');
    console.log('  next run of `wellinformed trigger --room sessions` will re-ingest from offset 0.');
    return 0;
  }

  if (!force) {
    const stat = statSync(statePath);
    console.error(`sessions reingest: about to DELETE ${statePath} (${stat.size} bytes).`);
    console.error(`  this forces a full re-walk of ~/.claude/projects/**/*.jsonl on the next`);
    console.error(`  'wellinformed trigger --room sessions' (can re-create thousands of nodes).`);
    console.error(``);
    console.error(`  pass --force (or -y) to actually delete the state file.`);
    return 1;
  }

  const lockRes = await acquireLock(wellinformedHome(), {
    owner: 'sessions-reingest',
    waitMs: 30_000,
    pollIntervalMs: 250,
  });
  if (lockRes.isErr()) {
    console.error(`sessions reingest: ${formatError(lockRes.error)}`);
    return 1;
  }
  const lock = lockRes.value;

  try {
    try {
      unlinkSync(statePath);
    } catch (e) {
      console.error(`sessions reingest: unlink failed: ${(e as Error).message}`);
      return 1;
    }
    console.log(`✓ deleted ${statePath}`);
    console.log('');
    console.log('Next step:');
    console.log('  wellinformed trigger --room sessions');
    console.log('');
    console.log('That will re-walk every JSONL under ~/.claude/projects/ from offset 0.');
    console.log('Existing consolidated_memory nodes in the sessions room are preserved;');
    console.log('raw entries get re-ingested alongside with fresh vectors.');
    return 0;
  } finally {
    await lock.release();
  }
};

const status = async (): Promise<number> => {
  const statePath = sessionsStatePath();
  if (!existsSync(statePath)) {
    console.log('sessions-state.json not present (no ingest has run yet).');
    return 0;
  }
  const stat = statSync(statePath);
  try {
    const { readFileSync } = await import('node:fs');
    const raw = readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw) as { files?: Record<string, { byteOffset?: number; lastLineNum?: number; mtime?: number }> };
    const files = parsed.files ?? {};
    const fileCount = Object.keys(files).length;
    let totalBytes = 0;
    let totalLines = 0;
    for (const f of Object.values(files)) {
      totalBytes += f.byteOffset ?? 0;
      totalLines += f.lastLineNum ?? 0;
    }
    console.log(`state file:          ${statePath}`);
    console.log(`state file size:     ${stat.size} bytes`);
    console.log(`tracked JSONL files: ${fileCount}`);
    console.log(`total bytes read:    ${totalBytes.toLocaleString()}`);
    console.log(`total lines read:    ${totalLines.toLocaleString()}`);
  } catch (e) {
    console.error(`sessions status: parse failed: ${(e as Error).message}`);
    return 1;
  }
  return 0;
};

const help = (): number => {
  console.log('usage: wellinformed sessions <sub>');
  console.log('');
  console.log('  reingest [--force|-y]   Delete sessions-state.json (full re-walk on next trigger)');
  console.log('  status                  Show state cursor position + file count');
  console.log('  help                    This text');
  console.log('');
  console.log('Use reingest to recover after a destructive `consolidate --prune` that');
  console.log('removed raw session entries you want back. Source JSONLs at');
  console.log('~/.claude/projects/**/*.jsonl are never touched by wellinformed — a fresh');
  console.log('trigger re-creates every graph node deterministically.');
  return 0;
};

export const sessions = async (args: readonly string[]): Promise<number> => {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'reingest':    return reingest(rest);
    case 'status':
    case undefined:     return status();
    case 'help':
    case '--help':
    case '-h':          return help();
    default:
      console.error(`sessions: unknown subcommand '${sub}'`);
      return help();
  }
};
