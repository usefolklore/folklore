<p align="center">
  <img src="docs/logo.svg" alt="wellinformed" width="600" />
</p>

<p align="center">
  <strong>MCP gave your agent hands. wellinformed gives it a library.</strong>
</p>

<p align="center">
  <a href="https://github.com/SaharBarak/wellinformed/stargazers"><img src="https://img.shields.io/github/stars/SaharBarak/wellinformed?style=flat&color=4E79A7" alt="GitHub Stars" /></a>
  <a href="https://github.com/SaharBarak/wellinformed/blob/main/LICENSE"><img src="https://img.shields.io/github/license/SaharBarak/wellinformed?color=59A14F" alt="License" /></a>
  <img src="https://img.shields.io/badge/MCP-11%20tools-4E79A7" alt="MCP Tools" />
  <img src="https://img.shields.io/badge/tests-27%20passing-59A14F" alt="Tests" />
  <img src="https://img.shields.io/badge/platforms-Claude%20Code%20%7C%20Codex%20%7C%20OpenClaw-F28E2B" alt="Platforms" />
</p>

<p align="center">
  <a href="#what-your-agent-gains">What your agent gains</a> &middot;
  <a href="#install">Install</a> &middot;
  <a href="#mcp-tools">MCP tools</a> &middot;
  <a href="#source-adapters">Sources</a> &middot;
  <a href="#cli">CLI</a> &middot;
  <a href="docs/ROADMAP.md">Roadmap</a>
</p>

---

An **MCP-native skill** for AI coding agents — Claude Code, Codex, OpenClaw, and any MCP-compatible harness. It fetches research from ArXiv, Hacker News, RSS feeds, and any URL, indexes your codebase (source files, deps, git history), chunks and embeds everything locally, and exposes the graph through **11 MCP tools** your agent calls mid-conversation.

Your agent stops guessing and starts citing.

> **Think of it as persistent research memory for your agent.** Not key-value storage like claude-mem. Not a flat markdown file. A rooms-scoped knowledge graph with embeddings, semantic search, cross-domain tunnel detection, and active source fetching — the difference between an agent that forgot what you read yesterday and one that can say "you bookmarked a paper about this on ArXiv last Tuesday."

## What your agent gains

Without wellinformed, when you ask Claude *"what's the best approach for vector search dedup?"* it guesses from training data.

With wellinformed installed, Claude calls `search` and gets:

```
→ sqlite-vec dep, vector-index.ts (your own code)
→ "Knowledge Graph Embeddings" (HN story, 2024)
→ Simon Willison's "Syntaqlite Playground" (blog, April 2026)
→ "Impact of Dimensionality on Node Embeddings" (ArXiv, April 2026)
```

Your agent now answers from **your research + your code + live external sources** instead of its training data. It cites the source. It knows what room the context belongs to.

### Multi-platform

| Platform | How it connects |
|---|---|
| **Claude Code** | Auto-discovered via `.claude-plugin/plugin.json`. Zero config. |
| **Codex** | MCP server — `wellinformed mcp start` as a tool provider |
| **OpenClaw** | MCP bridge via `pluginToolsMcpBridge` or direct MCP registration |
| **Any MCP host** | `wellinformed mcp start` speaks stdio JSON-RPC |

## Install

```bash
git clone https://github.com/SaharBarak/wellinformed.git && cd wellinformed
npm install && bash scripts/bootstrap.sh
node bin/wellinformed.js doctor        # 7 checks, all should pass
```

Then seed a room and index your project:

```bash
wellinformed init                      # interactive — asks what you're researching
wellinformed trigger --room homelab    # fetch from ArXiv, HN, RSS
wellinformed index                     # index your own codebase
```

Your agent now has a research library. Every MCP-compatible harness that discovers the plugin can query it.

## MCP tools

These are the capabilities your agent gains. Not CLI commands for you — **tools the agent calls autonomously** when it needs context.

| Tool | When the agent calls it |
|---|---|
| `search` | *"What do I know about X?"* — room-scoped semantic k-NN, <100ms |
| `ask` | *"Give me context for this question"* — search + assembled context block |
| `get_node` | *"Show me everything about this specific source"* — full node attributes |
| `get_neighbors` | *"What connects to this?"* — graph traversal from a node |
| `list_rooms` | *"What research domains are tracked?"* — rooms with counts |
| `find_tunnels` | *"Any surprising cross-domain connections?"* — semantic similarity across rooms |
| `trigger_room` | *"Refresh the research for this room"* — fetch + embed + index |
| `graph_stats` | *"How big is the knowledge graph?"* — node/edge/vector counts |
| `room_create` | *"Start tracking a new research area"* — create a room on the fly |
| `room_list` | *"What rooms exist?"* — registry with metadata |
| `sources_list` | *"What feeds am I pulling from?"* — configured source descriptors |

### vs other agent memory tools

| | wellinformed | claude-mem | memsearch | mcp-memory-service | Cognee |
|---|---|---|---|---|---|
| **Structure** | Knowledge graph + vector index | Key-value | Markdown files | Generic graph | Application graph |
| **Active fetching** | ArXiv, HN, RSS, URLs | No | No | No | No |
| **Codebase indexing** | Source files, deps, git, submodules | No | No | No | No |
| **Room scoping** | Partitioned domains + tunnels | No | No | No | No |
| **Dedup** | Content-hash (sha256) | None | Filename | None | None |
| **Local embeddings** | all-MiniLM-L6-v2 (ONNX, no API) | N/A | N/A | Optional | Cloud |
| **Source discovery** | Keyword-matched RSS/ArXiv/HN suggestions | No | No | No | No |
| **Multi-platform** | Claude Code, Codex, OpenClaw, any MCP | Claude only | Claude only | Any MCP | Any |

## How it works

```
  External sources                     Your codebase
  ┌──────────────────────┐              ┌──────────────────────┐
  │ ArXiv  HN  RSS  URLs │              │ .ts files  deps  git │
  └──────────┬───────────┘              └──────────┬───────────┘
             │                                     │
             ▼                                     ▼
         fetch + parse                      AST extract
             │                                     │
             └──────────────┬──────────────────────┘
                            ▼
                   chunk (paragraph-aware, ~80 LoC, no deps)
                            │
                            ▼
                   embed (all-MiniLM-L6-v2, 384d, local ONNX)
                            │
                  ┌─────────┴─────────┐
                  ▼                   ▼
            graph.json           vectors.db
            (NetworkX)           (sqlite-vec, room-scoped k-NN)
                  │                   │
                  └─────────┬─────────┘
                            ▼
                    MCP server (11 tools)
                     ↕        ↕         ↕
               Claude Code  Codex    OpenClaw
```

### Rooms & tunnels

**Rooms** partition the graph. `homelab` doesn't see `fundraise`. Each room has its own sources, nodes, and search scope.

**Tunnels** are the exception — when nodes in *different* rooms are semantically close, wellinformed flags them. This is the feature rooms exist to produce: surprising connections between domains your agent tracks separately.

### Dedup

`sha256(normalized_text)` on every item. Re-triggering is free — unchanged content is skipped. If a source rewrites an article in place, only the changed content re-indexes.

## Source adapters

Eight adapters — four for external research, four for project self-indexing:

| Kind | What it fetches |
|---|---|
| `generic_rss` | Any RSS 2.0 / Atom 1.0 feed |
| `arxiv` | ArXiv API search (Atom) |
| `hn_algolia` | Hacker News stories (Algolia JSON) |
| `generic_url` | One URL, article-extracted via Readability |
| `codebase` | TypeScript/JS source files — exports, imports, doc comments |
| `package_deps` | package.json dependencies with descriptions |
| `git_submodules` | .gitmodules entries with URL, branch, SHA |
| `git_log` | Recent commits with changed file lists |

```bash
# Source discovery suggests feeds from your room's keywords
wellinformed discover --room homelab --auto
# → adds selfh.st RSS, ArXiv homelab query, HN search
```

## CLI

The CLI is the admin surface — for seeding rooms, managing sources, and running the daemon. Your agent uses MCP; you use the CLI to set things up.

| Command | What it does |
|---|---|
| `init` | Interactive room seeding wizard |
| `index [--room R]` | Index project: source files, deps, submodules, git |
| `trigger [--room R]` | Fetch + embed + index from enabled sources |
| `ask "<query>"` | Terminal-level semantic search |
| `report [--room R]` | Markdown report: new nodes, god nodes, tunnels |
| `discover [--room R]` | Suggest new sources |
| `sources list\|add\|remove` | Source registry |
| `room list\|create\|switch` | Room registry |
| `daemon start\|stop\|status` | Background research daemon |
| `doctor [--fix]` | Check prerequisites |
| `mcp start` | Start MCP server (auto-spawned by Claude Code) |

## Real-world results

wellinformed indexing itself — its own codebase + 3 live external sources:

```
External (ArXiv + HN + Simon Willison)    43 items
Project self-index                         81 items (55 files, 14 deps, 1 submodule, 11 commits)
                                          ─────────
Total                                     154 nodes, 30+ edges, <100ms search
```

```
$ wellinformed ask "MCP server sqlite vector"

→ sqlite-vec (npm dep)
→ vector-index.ts (your code)
→ Simon Willison's "Syntaqlite Playground" (external blog post)
```

A search for "sqlite vector" returns your code AND an external blog post about the same topic. Cross-source connections for free.

## Architecture

```
src/
  domain/           pure functions, no I/O, no throws, Result monads
  infrastructure/   ports + adapters (sqlite-vec, Readability, fast-xml-parser)
  application/      use cases (indexNode, triggerRoom, findTunnels, discover)
  daemon/           setInterval loop + PID file
  mcp/              11 MCP tools over stdio
  cli/              admin commands
```

Functional DDD. Every fallible op returns `Result<T, E>` via [neverthrow](https://github.com/supermacro/neverthrow). No classes in domain/application. All libraries verified via `gh api` + [ossinsight.io](https://ossinsight.io) before selection.

## Star history

<a href="https://www.star-history.com/#SaharBarak/wellinformed&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=SaharBarak/wellinformed&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=SaharBarak/wellinformed&type=Date" />
    <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=SaharBarak/wellinformed&type=Date" />
  </picture>
</a>

## Contributing

The highest-impact contributions right now:

1. **New source adapters** — GitHub trending, Reddit, Twitter/X, Telegram capture. Each is one file under `src/infrastructure/sources/`.
2. **New platform integrations** — Cursor, Copilot, Gemini CLI support for the MCP server.
3. **Worked examples** — Run wellinformed on a real research corpus, share the graph stats and what surprised you.

We respond within 48 hours.

## License

MIT

---

<p align="center">
  <strong>If your agent is smarter with wellinformed installed, give it a ⭐</strong>
</p>
