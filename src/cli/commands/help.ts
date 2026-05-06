/**
 * help — prints CLI usage.
 */

const HELP = `
wellinformed — knowledge graph + research daemon Claude Code plugin

usage:
  wellinformed <command> [options]

commands:
  onboard [--yes]         first-run installer — daemon, hooks, identity, rooms
  login github            link a verified GitHub identity to your DID (OAuth)
  this [me|everyone]      index the current folder; 'everyone' shares it on P2P
  recall <name>           entity-first lookup across every room
  entity add|list|remove  manage the canonical entity registry
  doctor [--fix]          check runtime prerequisites (and bootstrap with --fix)
  version                 print version
  help                    this message
  init                    interactive room seeding wizard
  room <sub>              list | create | switch | current | describe
  trigger [--room R]      fetch and index content from enabled sources
  sources <sub>           list | add | remove | enable | disable
  ask "<query>"           semantic search + context output
  eval <queries.jsonl>    retrieval quality eval — recall@k, NDCG@k, MRR
  metrics                 daemon counters/gauges/histograms snapshot (JSON)
  report [--room R]       generate a knowledge graph report
  index [--room R]        index the project codebase, deps, submodules, git history
  daemon <sub>            start | stop | status — background research daemon
  discover [--room R]     suggest new sources for a room (--auto to add)
  discover-loop [--room R] recursive: discover + index + extract keywords + repeat
  publish auth|tweet|thread|launch|preview  post to X/Twitter (OAuth 2.0)
  telegram setup|test|start  Telegram bot (inbound capture + commands + digests)
  claude install|uninstall  make Claude Code use the graph automatically (hook + CLAUDE.md)
  mcp start               run the MCP server (Claude Code auto-spawns this)
`.trimStart();

export function printHelp(_args: string[]): number {
  process.stdout.write(HELP);
  return 0;
}
