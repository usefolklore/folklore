# wellinformed

> the decentralized global accumulation of compounding knowledge

A local-first knowledge graph that sits between your AI agent and the web. Two hooks do the work:

- **PreToolUse** — fires before `Glob`, `Grep`, `Read`, `WebSearch`, `WebFetch`. Prefetches your graph and injects top matches.
- **PostToolUse** — fires after `WebSearch` and `WebFetch`. Saves results back so the graph absorbs everything you read.

You do not configure this. It works after `onboard`.

## Install

```bash
git clone https://github.com/SaharBarak/wellinformed.git
cd wellinformed && npm install && npm run build
node bin/wellinformed.js onboard --yes
```

`onboard` brings up the daemon, installs hooks, provisions your `did:key` identity, and seeds the system rooms. npm and Homebrew distributions are pending.

## Wire into Claude Code

```bash
claude mcp add --scope user wellinformed -- wellinformed mcp
wellinformed claude install
```

The first line registers the MCP server user-wide; the second installs the PreToolUse / PostToolUse hooks and the project CLAUDE.md snippet.

## System rooms

Two rooms exist on first boot. Auto-populated, P2P-shared, never created by hand.

| Room | Holds | Stale-after |
|---|---|---|
| `toolshed` | codebase, deps, git history, MCP tools, skills | 30 days |
| `research` | arxiv, HN, RSS, web fetches, web searches | 7 days |

Membership is virtual — derived from each node's `source_uri`. Every hit carries `age_days`, so the agent decides trust vs refetch on its own.

## Why this over a vector DB or RAG wrapper

Most RAG is passive — you query it. wellinformed is active. The hook intercepts every tool call your agent makes and checks the graph first. You get compounding recall without changing your workflow. Rooms federate with peers over libp2p — shared context, no central server.

## MCP tools

23 tools over stdio. The ones you reach for first: `search`, `ask`, `get_node`, `get_neighbors`, `find_tunnels`, `federated_search`, `oracle_ask`, `code_graph_query`. Full list in `src/mcp/server.ts`.

## Identity

W3C `did:key` over Ed25519 on first boot. BIP39 24-word recovery. Signed envelopes verified offline. No registry, no account.

## Numbers

75.22% NDCG@10 on BEIR SciFact · 11 ms p50 · CPU-only.

## Requirements

Node 18+, Claude Code CLI for MCP wiring.

## License

MIT.
