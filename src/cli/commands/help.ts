/**
 * help — prints CLI usage.
 */

const HELP = `
akashik — knowledge graph + research daemon Claude Code plugin

usage:
  akashik <command> [options]

commands:
  onboard [--yes]         first-run installer — daemon, hooks, identity
  login                   link a verified GitHub identity to your DID (OAuth)
  this [me|everyone]      index the current folder; 'everyone' shares it on P2P
  recall <name>           entity-first lookup across the graph
  entity add|list|remove  manage the canonical entity registry
  doctor [--fix]          check runtime prerequisites (and bootstrap with --fix)
  version                 print version
  help                    this message
  init                    register external content sources (RSS / ArXiv / HN)
  trigger                 fetch and index content from enabled sources
  sources <sub>           list | add | remove | enable | disable
  ask "<query>"           semantic search + context output
  eval <queries.jsonl>    retrieval quality eval — recall@k, NDCG@k, MRR
  metrics                 daemon counters/gauges/histograms snapshot (JSON)
  report                  generate a knowledge graph report
  index                   index the project codebase, deps, submodules, git history
  daemon <sub>            start | stop | status — background research daemon
  discover                suggest new sources (--auto to add)
  publish auth|tweet|thread|launch|preview  post to X/Twitter (OAuth 2.0)
  claude install|uninstall  make Claude Code use the graph automatically (hook + CLAUDE.md)
  mcp start               run the MCP server (Claude Code auto-spawns this)
  migrate v5              upgrade ~/.akashik/ from V4 (rooms) to V5 (workspace+private)
`.trimStart();

export function printHelp(_args: string[]): number {
  process.stdout.write(HELP);
  return 0;
}
