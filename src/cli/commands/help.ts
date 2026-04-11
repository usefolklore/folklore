/**
 * help — prints CLI usage.
 */

const HELP = `
wellinformed — knowledge graph + research daemon Claude Code plugin

usage:
  wellinformed <command> [options]

commands:
  doctor [--fix]          check runtime prerequisites (and bootstrap with --fix)
  version                 print version
  help                    this message
  init                    interactive room seeding wizard
  room <sub>              list | create | switch | current | describe
  trigger [--room R]      fetch and index content from enabled sources for a room
  sources <sub>           list | add | remove | enable | disable the source registry
  mcp start               run the MCP server (Claude Code auto-spawns this)

commands (roadmap, not yet implemented):
  daemon <sub>            start / stop / status / trigger
  discover [--room R]     force a discovery iteration
  telegram <sub>          setup / test / capture-start / digest-test
  report [date] [--room]  read a report
  ask "<query>"           semantic search + summarize
`.trimStart();

export function printHelp(_args: string[]): number {
  process.stdout.write(HELP);
  return 0;
}
