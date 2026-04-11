#!/usr/bin/env node
/**
 * wellinformed CLI — subcommand router.
 *
 * Phase 0: doctor, version, help.
 * Phase 1: (runtime checks extended in doctor).
 * Phase 2: trigger, sources.
 * Future phases add: init, room, daemon, discover, telegram, report, ask, mcp.
 */

import { doctor } from './commands/doctor.js';
import { version } from './commands/version.js';
import { printHelp } from './commands/help.js';
import { trigger } from './commands/trigger.js';
import { sources } from './commands/sources.js';
import { mcp } from './commands/mcp.js';
import { init } from './commands/init.js';
import { room } from './commands/room.js';
import { ask } from './commands/ask.js';
import { report } from './commands/report.js';

type CommandFn = (args: string[]) => Promise<number> | number;

const commands: Record<string, CommandFn> = {
  doctor,
  version,
  '--version': version,
  '-v': version,
  help: printHelp,
  '--help': printHelp,
  '-h': printHelp,
  trigger,
  sources,
  mcp,
  init,
  room,
  ask,
  report,
};

const futureCommands = new Set([
  'daemon',
  'discover',
  'telegram',
]);

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd) {
    printHelp([]);
    return 0;
  }
  const handler = commands[cmd];
  if (handler) {
    return (await handler(rest)) ?? 0;
  }
  if (futureCommands.has(cmd)) {
    console.error(`wellinformed: '${cmd}' is recognized but not yet implemented (Phase 0 scaffold).`);
    console.error(`               see the roadmap — it lands in a later phase.`);
    return 2;
  }
  console.error(`wellinformed: unknown command '${cmd}'. run 'wellinformed help'.`);
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('wellinformed: fatal error');
    console.error(err);
    process.exit(1);
  });
