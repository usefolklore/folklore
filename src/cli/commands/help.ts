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
  trigger [--room R]      fetch and index content from enabled sources
  sources <sub>           list | add | remove | enable | disable
  ask "<query>"           semantic search + context output
  report [--room R]       generate a knowledge graph report
  index [--room R]        index the project codebase, deps, submodules, git history
  daemon <sub>            start | stop | status — background research daemon
  discover [--room R]     suggest new sources for a room (--auto to add)
  claude install|uninstall  make Claude Code use the graph automatically (hook + CLAUDE.md)
  mcp start               run the MCP server (Claude Code auto-spawns this)

commands (roadmap, not yet implemented):
  telegram <sub>          setup / test / capture-start / digest-test
`.trimStart();

export function printHelp(_args: string[]): number {
  process.stdout.write(HELP);
  return 0;
}
