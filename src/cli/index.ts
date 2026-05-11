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
import { unshare } from './commands/unshare.js';
import { touch } from './commands/touch.js';
import { hot } from './commands/hot.js';
import { lint } from './commands/lint.js';
import { save } from './commands/save.js';
import { oracle } from './commands/oracle.js';
import { codebase } from './commands/codebase.js';
import { recentSessions } from './commands/recent-sessions.js';
import { identity } from './commands/identity.js';
import { logs } from './commands/logs.js';
import { update } from './commands/update.js';
import { consolidate } from './commands/consolidate.js';
import { sessions } from './commands/sessions.js';
import { cacheStats } from './commands/cache-stats.js';
import { onboard } from './commands/onboard.js';
import { thisCmd } from './commands/this.js';
import { jobs } from './commands/jobs.js';
import { recallCmd } from './commands/recall.js';
import { entity } from './commands/entity.js';
import { evalCmd } from './commands/eval.js';
import { metricsCmd } from './commands/metrics.js';
import { login } from './commands/login.js';
import { peersRep } from './commands/peers-rep.js';
import { swarm } from './commands/swarm.js';

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
  unshare,
  touch,
  hot,
  lint,
  save,
  oracle,
  codebase,
  'recent-sessions': recentSessions,
  identity,
  logs,
  update,
  consolidate,
  sessions,
  'cache-stats': cacheStats,
  onboard,
  this: thisCmd,
  jobs,
  recall: recallCmd,
  entity,
  eval: evalCmd,
  metrics: metricsCmd,
  login,
  swarm,
  // Plural-form alias: `wellinformed peers rep …` works as well as
  // `wellinformed peer rep …`. The subcommand dispatcher handles both.
  peers: async (args: string[]): Promise<number> => {
    const [sub, ...rest] = args;
    if (sub === 'rep') return peersRep(rest);
    console.error('peers: only `rep` is implemented today (more coming).');
    console.error('  usage: wellinformed peers rep [<peer-id>] [--subject <key>] [--json]');
    return sub ? 1 : 1;
  },
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
