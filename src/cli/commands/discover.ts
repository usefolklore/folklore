/**
 * `wellinformed discover [--room R] [--auto]`
 *
 * Suggest new sources for a room based on its keywords. Prints the
 * suggestions to stdout. With --auto, adds them to sources.json
 * immediately.
 */

import { join } from 'node:path';
import { formatError } from '../../domain/errors.js';
import { defaultRoom } from '../../domain/rooms.js';
import { discover } from '../../application/discover.js';
import { fileRoomsConfig } from '../../infrastructure/rooms-config.js';
import { fileSourcesConfig } from '../../infrastructure/sources-config.js';
import { runtimePaths } from '../runtime.js';

interface ParsedArgs {
  readonly room?: string;
  readonly auto: boolean;
}

const parseArgs = (args: readonly string[]): ParsedArgs => {
  let room: string | undefined;
  let auto = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--room') room = next();
    else if (a.startsWith('--room=')) room = a.slice('--room='.length);
    else if (a === '--auto') auto = true;
  }
  return { room, auto };
};

export const discoverCmd = async (args: readonly string[]): Promise<number> => {
  const parsed = parseArgs(args);
  const paths = runtimePaths();
  const rooms = fileRoomsConfig(join(paths.home, 'rooms.json'));
  const sources = fileSourcesConfig(paths.sources);

  // Resolve room
  let room = parsed.room;
  if (!room) {
    const reg = await rooms.load();
    if (reg.isOk()) room = defaultRoom(reg.value);
  }
  if (!room) {
    console.error('discover: no room specified and no default room set. use --room or run `wellinformed init`.');
    return 1;
  }

  const deps = { rooms, sources };
  const result = await discover(deps)(room);
  if (result.isErr()) {
    console.error(`discover: ${formatError(result.error)}`);
    return 1;
  }

  const suggestions = result.value;
  if (suggestions.length === 0) {
    console.log(`no new source suggestions for room '${room}'. all known feeds already registered.`);
    return 0;
  }

  console.log(`${suggestions.length} suggestion(s) for room '${room}':\n`);
  for (const s of suggestions) {
    console.log(`  ${s.descriptor.id} (${s.descriptor.kind})`);
    console.log(`    reason: ${s.reason}`);
    console.log(`    config: ${JSON.stringify(s.descriptor.config)}`);
    console.log('');
  }

  if (parsed.auto) {
    for (const s of suggestions) {
      const addResult = await sources.add(s.descriptor);
      if (addResult.isErr()) {
        console.error(`  failed to add ${s.descriptor.id}: ${formatError(addResult.error)}`);
      } else {
        console.log(`  added ${s.descriptor.id}`);
      }
    }
    console.log(`\n${suggestions.length} source(s) added. run 'wellinformed trigger --room ${room}' to fetch.`);
  } else {
    console.log(`add them with: wellinformed discover --room ${room} --auto`);
  }

  return 0;
};
