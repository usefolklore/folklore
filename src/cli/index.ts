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
import { daemon } from './commands/daemon.js';
import { discoverCmd } from './commands/discover.js';
import { indexProject } from './commands/index-project.js';
import { claudeInstall } from './commands/claude-install.js';
import { discoverLoopCmd } from './commands/discover-loop.js';
import { publish } from './commands/publish.js';
import { telegram } from './commands/telegram.js';
import { viz } from './commands/viz.js';
import { exportObsidian } from './commands/export-obsidian.js';
import { dashboard } from './commands/dashboard.js';
import { peer } from './commands/peer.js';
import { share } from './commands/share.js';

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
  daemon,
  discover: discoverCmd,
  index: indexProject,
  claude: claudeInstall,
  'discover-loop': discoverLoopCmd,
  publish,
  telegram,
  viz,
  export: exportObsidian,
  dashboard,
  peer,
  share,
};

const futureCommands = new Set<string>([]);

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
