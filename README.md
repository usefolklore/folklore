<p align="center">
  <img src="docs/logo.png" alt="wellinformed" width="600" />
</p>

<p align="center">
  <strong>Stop re-Googling things you already read.</strong>
</p>

<p align="center">
  <a href="https://github.com/SaharBarak/wellinformed/stargazers"><img src="https://img.shields.io/github/stars/SaharBarak/wellinformed?style=social" alt="Stars" /></a>&nbsp;&nbsp;
  <a href="https://github.com/SaharBarak/wellinformed/network/members"><img src="https://img.shields.io/github/forks/SaharBarak/wellinformed?style=social" alt="Forks" /></a>&nbsp;&nbsp;
  <a href="https://github.com/SaharBarak/wellinformed/watchers"><img src="https://img.shields.io/github/watchers/SaharBarak/wellinformed?style=social" alt="Watchers" /></a>
</p>

<p align="center">
  <a href="https://github.com/SaharBarak/wellinformed/blob/main/LICENSE"><img src="https://img.shields.io/github/license/SaharBarak/wellinformed?color=59A14F" alt="License" /></a>
  <img src="https://img.shields.io/badge/MCP-11%20tools-4E79A7" alt="MCP Tools" />
  <img src="https://img.shields.io/badge/tests-27%20passing-59A14F" alt="Tests" />
  <img src="https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Codex%20%7C%20OpenClaw-F28E2B" alt="Platforms" />
</p>

<p align="center">
  <a href="#the-problem">The problem</a> &middot;
  <a href="#what-changes">What changes</a> &middot;
  <a href="#install-in-3-commands">Install</a> &middot;
  <a href="#mcp-tools">MCP tools</a> &middot;
  <a href="#source-adapters">Sources</a> &middot;
  <a href="docs/ROADMAP.md">Roadmap</a>
</p>

---

wellinformed is an MCP skill that gives your AI coding agent a research memory. It fetches from ArXiv, Hacker News, and RSS feeds, indexes your own codebase, and serves everything through 11 MCP tools your agent calls mid-conversation. Search 154 nodes in under 100ms. Runs locally. No API keys.

Works with Claude Code, Codex, OpenClaw, and any MCP-compatible harness.

## The problem

You read a paper about vector search last Tuesday. Today Claude asks for context on a related problem. You can't find the paper. Claude guesses from training data. You spend ten minutes re-Googling something you already understood.

This happens because your agent has no memory of what you've been reading. It sees your code and your prompt. It does not see the 50 articles, 12 HN threads, and 3 ArXiv papers you consumed this week.

## What changes

After installing wellinformed, your agent calls `search` and gets this:

```
$ wellinformed ask "vector search sqlite"

## sqlite-vec (npm dep)
distance: 0.908 | source: npm://sqlite-vec

## vector-index.ts (your code)
distance: 1.021 | source: file://src/infrastructure/vector-index.ts

## Syntaqlite Playground (Simon Willison)
distance: 1.023 | source: simonwillison.net
```

Three results from three different sources — a dependency, your own code, and an external blog post — returned in one query. Your agent answers from your research instead of its training data.

## Install in 3 commands

```bash
git clone https://github.com/SaharBarak/wellinformed.git && cd wellinformed
npm install && bash scripts/bootstrap.sh
node bin/wellinformed.js doctor
```

Then seed a room and start indexing:

```bash
wellinformed init                      # asks what you're researching, suggests sources
wellinformed trigger --room homelab    # fetches + embeds + indexes
wellinformed index                     # indexes your codebase, deps, git history
```

Claude Code discovers the plugin automatically via `.claude-plugin/plugin.json`. No additional configuration.

## How it works

```
  ArXiv, HN, RSS, URLs                 Your codebase
          |                                   |
          v                                   v
      fetch + parse                     walk + extract
          |                                   |
          +----------------+------------------+
                           v
                   chunk (paragraph-aware)
                           v
                   embed (all-MiniLM-L6-v2, 384d, local ONNX)
                           |
                 +---------+---------+
                 v                   v
           graph.json           vectors.db
           (NetworkX)           (sqlite-vec)
                 |                   |
                 +---------+---------+
                           v
                    MCP server (11 tools)
                     |        |        |
                Claude Code  Codex  OpenClaw
```

**Rooms** partition the graph by domain. `homelab` does not see `fundraise`. Each room has its own sources, nodes, and search scope.

**Tunnels** are the exception. When two nodes in different rooms are semantically close, wellinformed flags them. A paper in your `ml-papers` room about embedding quantization connects to a performance issue in your `homelab` room about memory-constrained vector search. That connection is what rooms exist to produce.

**Dedup** is content-hash based. Re-running `trigger` on unchanged sources costs nothing. If an article changes in place, only the changed content re-indexes.

## MCP tools

These are capabilities your agent gains. Not commands you run. Claude calls them when it needs context.

| Tool | What the agent does with it |
|---|---|
| `search` | "What did I read about this?" — room-scoped semantic search, under 100ms |
| `ask` | Search + assembled context block for answering questions |
| `get_node` | Look up a specific source by ID — full attributes |
| `get_neighbors` | Walk the graph from a node — what connects to this? |
| `find_tunnels` | Surface cross-room connections — the surprising links |
| `trigger_room` | Refresh research for a room from within a conversation |
| `graph_stats` | How many nodes, edges, vectors, rooms? |
| `room_create` | Start tracking a new research domain |
| `room_list` | What rooms exist and which is default? |
| `sources_list` | What feeds are configured? |

### Compared to other agent memory

| | wellinformed | claude-mem | memsearch | mcp-memory-service |
|---|---|---|---|---|
| Storage | Graph + vectors | Key-value | Markdown files | Generic graph |
| Active fetching | ArXiv, HN, RSS, URLs | No | No | No |
| Codebase indexing | Source files, deps, git | No | No | No |
| Room partitioning | Domains + tunnel detection | No | No | No |
| Local embeddings | ONNX, no API calls | N/A | N/A | Optional |
| Platforms | Claude Code, Codex, OpenClaw | Claude only | Claude only | Any MCP |

## Source adapters

Eight adapters. Four fetch external research. Four index your project.

| Kind | What it fetches |
|---|---|
| `generic_rss` | Any RSS 2.0 or Atom 1.0 feed |
| `arxiv` | ArXiv API search results |
| `hn_algolia` | Hacker News stories via Algolia |
| `generic_url` | One URL, article-extracted via Readability |
| `codebase` | TypeScript/JS source files — exports, imports, doc comments |
| `package_deps` | package.json dependencies with descriptions |
| `git_submodules` | .gitmodules entries with URL, branch, SHA |
| `git_log` | Recent commits with changed file lists |

Source discovery suggests new feeds automatically:

```bash
wellinformed discover --room homelab --auto
# adds selfh.st RSS, ArXiv homelab query, HN search — based on your room's keywords
```

## CLI

The CLI is the admin surface. Your agent uses MCP. You use the CLI to set things up.

| Command | Purpose |
|---|---|
| `init` | Create a room, suggest and register sources |
| `index [--room R]` | Index your project: code, deps, submodules, git |
| `trigger [--room R]` | Fetch and index from all enabled sources |
| `ask "<query>"` | Search the graph from your terminal |
| `report [--room R]` | Generate a markdown report: new nodes, top nodes, tunnels |
| `discover [--room R]` | Suggest new sources matching your keywords |
| `sources list\|add\|remove` | Manage the source registry |
| `room list\|create\|switch` | Manage the room registry |
| `daemon start\|stop\|status` | Run research on a schedule |
| `doctor [--fix]` | Check prerequisites, bootstrap the Python venv |
| `mcp start` | Start the MCP server (Claude Code auto-spawns this) |

## Architecture

```
src/
  domain/           Pure functions, no I/O, no throws
  infrastructure/   Ports + adapters (sqlite-vec, Readability, fast-xml-parser)
  application/      Use cases (indexNode, triggerRoom, findTunnels, discover)
  daemon/           setInterval loop + PID file
  mcp/              11 MCP tools over stdio
  cli/              Admin commands
```

Functional DDD. Every fallible operation returns `Result<T, E>` via [neverthrow](https://github.com/supermacro/neverthrow). No classes in domain or application layers. All libraries verified via `gh api` and [ossinsight.io](https://ossinsight.io) before selection.

## Real-world results

wellinformed indexing itself — 3 live external sources + its own codebase:

```
External:  10 ArXiv papers + 20 blog posts + 13 HN stories
Project:   55 source files + 14 deps + 1 submodule + 11 commits
Total:     154 nodes, 30+ edges, <100ms search
```

Re-running `trigger` on unchanged sources: 0 new, 0 updated, all skipped. Dedup works.

## Star history

<a href="https://www.star-history.com/#SaharBarak/wellinformed&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=SaharBarak/wellinformed&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=SaharBarak/wellinformed&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=SaharBarak/wellinformed&type=Date" />
  </picture>
</a>

## Contributing

The most useful contributions right now:

1. **New source adapters** — GitHub trending, Reddit, Twitter/X, Telegram. Each is one file under `src/infrastructure/sources/`.
2. **Platform guides** — Tested setup instructions for Cursor, Copilot, Gemini CLI.
3. **Worked examples** — Run wellinformed on a real research corpus. Share what the graph surfaced that you did not expect.

We respond within 48 hours.

## License

MIT
