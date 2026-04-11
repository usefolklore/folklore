/**
 * `wellinformed index [--room R] [--root DIR]`
 *
 * Index the current project into the knowledge graph: source files,
 * package.json dependencies, git submodules, and recent git history.
 *
 * This command creates ephemeral source descriptors for the four
 * project-indexing adapters (codebase, package_deps, git_submodules,
 * git_log), runs them through the ingest pipeline, and reports
 * what was indexed. The descriptors are NOT persisted to sources.json
 * — they're derived from the working directory each time.
 *
 * By default it uses the default room from the room registry. If no
 * room exists, it creates one named after the project directory.
 */

import { basename } from 'node:path';
import { formatError } from '../../domain/errors.js';
import type { SourceDescriptor } from '../../domain/sources.js';
import { slugifyRoomName, defaultRoom } from '../../domain/rooms.js';
import { ingestSource } from '../../application/ingest.js';
import { defaultRuntime } from '../runtime.js';

interface ParsedArgs {
  readonly room?: string;
  readonly root: string;
  readonly includeDev: boolean;
  readonly maxCommits: number;
}

const parseArgs = (args: readonly string[]): ParsedArgs => {
  let room: string | undefined;
  let root = process.cwd();
  let includeDev = true;
  let maxCommits = 50;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--room') room = next();
    else if (a.startsWith('--room=')) room = a.slice('--room='.length);
    else if (a === '--root') root = next();
    else if (a.startsWith('--root=')) root = a.slice('--root='.length);
    else if (a === '--include-dev') includeDev = true;
    else if (a === '--no-dev') includeDev = false;
    else if (a === '--max-commits') maxCommits = parseInt(next(), 10) || 50;
  }
  return { room, root, includeDev, maxCommits };
};

export const indexProject = async (args: readonly string[]): Promise<number> => {
  const parsed = parseArgs(args);

  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`index: ${formatError(rt.error)}`);
    return 1;
  }
  const runtime = rt.value;

  try {
    // Resolve room — use flag, default room, or derive from directory name
    let room = parsed.room;
    if (!room) {
      const reg = await runtime.rooms.load();
      if (reg.isOk()) {
        room = defaultRoom(reg.value);
      }
    }
    if (!room) {
      room = slugifyRoomName(basename(parsed.root));
      // Auto-create the room
      await runtime.rooms.create({
        id: room,
        name: basename(parsed.root),
        description: `Project index for ${basename(parsed.root)}`,
        keywords: [],
        created_at: new Date().toISOString(),
      });
      console.log(`auto-created room '${room}'`);
    }

    // Build project-indexing descriptors (ephemeral, not saved)
    const descriptors: SourceDescriptor[] = [
      {
        id: `${room}-codebase`,
        kind: 'codebase',
        room,
        enabled: true,
        config: { root: parsed.root },
      },
      {
        id: `${room}-deps`,
        kind: 'package_deps',
        room,
        enabled: true,
        config: { root: parsed.root, include_dev: parsed.includeDev },
      },
      {
        id: `${room}-submodules`,
        kind: 'git_submodules',
        room,
        enabled: true,
        config: { root: parsed.root },
      },
      {
        id: `${room}-git`,
        kind: 'git_log',
        room,
        enabled: true,
        config: { root: parsed.root, max_commits: parsed.maxCommits },
      },
    ];

    console.log(`indexing project at ${parsed.root} → room=${room}\n`);

    const ingest = ingestSource(runtime.ingestDeps);
    let totalNew = 0;
    let totalSkipped = 0;
    let hadError = false;

    for (const desc of descriptors) {
      const { sources: srcs, errors } = runtime.registry.buildAll([desc]);
      if (errors.length > 0 || srcs.length === 0) {
        console.error(`  [fail] ${desc.kind.padEnd(16)} — ${errors.map(formatError).join('; ')}`);
        hadError = true;
        continue;
      }
      const result = await ingest(srcs[0]);
      if (result.isErr()) {
        console.error(`  [fail] ${desc.kind.padEnd(16)} — ${formatError(result.error)}`);
        hadError = true;
        continue;
      }
      const run = result.value;
      console.log(
        `  [ ok ] ${desc.kind.padEnd(16)} seen=${String(run.items_seen).padStart(3)} new=${String(run.items_new).padStart(3)} skip=${String(run.items_skipped).padStart(3)}`,
      );
      totalNew += run.items_new;
      totalSkipped += run.items_skipped;
    }

    console.log(`\ntotal: ${totalNew} new, ${totalSkipped} skipped`);
    return hadError ? 1 : 0;
  } finally {
    runtime.close();
  }
};
