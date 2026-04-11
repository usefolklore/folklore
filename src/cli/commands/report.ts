/**
 * `wellinformed report [--room R] [--since DATE] [--no-save]`
 *
 * Generates a markdown report from the current graph state and
 * optionally persists it to ~/.wellinformed/reports/<room>/<date>.md.
 *
 * If --since is provided, only nodes fetched after that date are
 * included as "new nodes". Otherwise all nodes are shown.
 *
 * By default the report is both printed to stdout AND written to
 * disk. Use --no-save to skip the disk write.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatError } from '../../domain/errors.js';
import { defaultRoom } from '../../domain/rooms.js';
import { generateReport, renderReport } from '../../application/report.js';
import { defaultRuntime } from '../runtime.js';

interface ParsedArgs {
  readonly room?: string;
  readonly since?: string;
  readonly save: boolean;
}

const parseArgs = (args: readonly string[]): ParsedArgs => {
  let room: string | undefined;
  let since: string | undefined;
  let save = true;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--room') room = next();
    else if (a.startsWith('--room=')) room = a.slice('--room='.length);
    else if (a === '--since') since = next();
    else if (a.startsWith('--since=')) since = a.slice('--since='.length);
    else if (a === '--no-save') save = false;
  }
  return { room, since, save };
};

export const report = async (args: readonly string[]): Promise<number> => {
  const parsed = parseArgs(args);

  const rt = await defaultRuntime();
  if (rt.isErr()) {
    console.error(`report: ${formatError(rt.error)}`);
    return 1;
  }
  const runtime = rt.value;

  try {
    // Resolve room — use flag, fall back to default room
    let room = parsed.room;
    if (!room) {
      const reg = await runtime.rooms.load();
      if (reg.isOk()) {
        room = defaultRoom(reg.value);
      }
    }

    const deps = {
      graphs: runtime.graphs,
      vectors: runtime.vectors,
      sources: runtime.sources,
    };

    const result = await generateReport(deps)({ room, since: parsed.since });
    if (result.isErr()) {
      console.error(`report: ${formatError(result.error)}`);
      return 1;
    }

    const markdown = renderReport(result.value);
    console.log(markdown);

    if (parsed.save) {
      const roomDir = join(runtime.paths.home, 'reports', result.value.room);
      mkdirSync(roomDir, { recursive: true });
      const date = result.value.generated_at.slice(0, 10); // YYYY-MM-DD
      const filePath = join(roomDir, `${date}.md`);
      writeFileSync(filePath, markdown);
      console.log(`\nsaved to ${filePath}`);
    }

    return 0;
  } finally {
    runtime.close();
  }
};
