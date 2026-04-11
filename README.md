<p align="center">
  <img src="docs/logo.png" alt="wellinformed" width="400" />
</p>

<p align="center">
  <a href="https://github.com/SaharBarak/wellinformed/stargazers"><img src="https://img.shields.io/github/stars/SaharBarak/wellinformed?style=social" alt="Stars" /></a>&nbsp;
  <a href="https://github.com/SaharBarak/wellinformed/network/members"><img src="https://img.shields.io/github/forks/SaharBarak/wellinformed?style=social" alt="Forks" /></a>&nbsp;
  <a href="https://github.com/SaharBarak/wellinformed/watchers"><img src="https://img.shields.io/github/watchers/SaharBarak/wellinformed?style=social" alt="Watchers" /></a>
</p>

Your coding agent forgets everything you read between sessions. wellinformed gives it a memory — it fetches your research, indexes your codebase, and serves it through MCP so Claude answers from your sources, not its training data.

```
$ wellinformed ask "vector search sqlite"

## sqlite-vec                         (npm dep you installed last week)
   distance: 0.908 | source: npm://sqlite-vec

## vector-index.ts                    (your own code)
   distance: 1.021 | source: file://src/infrastructure/vector-index.ts

## Syntaqlite Playground              (Simon Willison blog post, April 2026)
   distance: 1.023 | source: simonwillison.net
```

One query. Three source types. Your code, your dependencies, and a blog post you read — all in one result.

## Install

```bash
git clone https://github.com/SaharBarak/wellinformed.git && cd wellinformed
npm install && bash scripts/bootstrap.sh
```

## Try it

```bash
wellinformed init                      # create a room, pick your sources
wellinformed trigger --room homelab    # fetch from ArXiv, HN, RSS, blogs, any URL
wellinformed index                     # index your codebase + deps + git
wellinformed claude install            # make Claude use the graph automatically
```

That last command is the key one. After `claude install`, Claude checks your knowledge graph before every file search — no explicit ask needed.

## What it indexes

| Source | What you get |
|---|---|
| **ArXiv** | Papers matching your keywords, chunked and embedded |
| **Hacker News** | Stories via Algolia search |
| **RSS / Atom** | Any feed — blogs, newsletters, release notes, podcasts |
| **Any URL** | Article-extracted via Mozilla Readability |
| **Your .ts/.js files** | Exports, imports, doc comments per file |
| **package.json** | Every dependency with version, description, homepage |
| **Git history** | Recent commits with changed file lists |
| **Git submodules** | Remote URL, branch, HEAD SHA |
| **Discovery loop** | Recursively finds MORE sources from indexed content keywords |
| **X / Twitter** | Posts and threads via OAuth 2.0 (publish + ingest) |

**Research channels** — wellinformed also connects to the GitHub analytics ecosystem for tracking trends, competitors, and emerging tools:

| Channel | What it tracks |
|---|---|
| [star-history.com](https://www.star-history.com/) | Star trajectories over time |
| [Daily Stars Explorer](https://github.com/emanuelef/daily-stars-explorer) | Top daily star gainers |
| [OSS Insight](https://ossinsight.io) | Per-repo activity: commits, PRs, contributors |
| [Repohistory](https://github.com/repohistory/repohistory) | Historical star/fork/issue trends |
| [RepoBeats](https://repobeats.axiom.co/) | Contributor + PR activity analytics |
| [Gitstar Ranking](https://gitstar-ranking.com/) | Top repos by star count |
| [Ecosyste.ms Timeline](https://timeline.ecosyste.ms/) | Package release timelines across registries |

Source discovery suggests new feeds automatically from your room's keywords:

```bash
wellinformed discover --room homelab --auto
# → adds selfh.st RSS, ArXiv query, HN search — based on your keywords
```

## How Claude uses it

After `wellinformed claude install`, a PreToolUse hook fires before every Glob/Grep/Read. Claude sees:

> *"wellinformed: Knowledge graph exists (425 nodes). Consider using search, ask, get_node before searching raw files."*

Claude then calls the MCP tools instead of grepping. 12 tools available:

`search` · `ask` · `get_node` · `get_neighbors` · `find_tunnels` · `trigger_room` · `discover_loop` · `graph_stats` · `room_create` · `room_list` · `sources_list`

Works with **Claude Code** (auto-discovered), **Codex**, **OpenClaw**, and any MCP host.

## Rooms & tunnels

Rooms partition the graph. `homelab` doesn't see `fundraise`. Each room has its own sources and search scope.

**Tunnels** are the exception — when nodes in different rooms are semantically close, wellinformed flags them. A paper about embedding quantization in `ml-papers` connects to a memory issue in `homelab`. That connection is what rooms exist to produce.

## Discovery loop

```bash
wellinformed discover-loop --room homelab --max-iterations 3
# iteration 1: found 4 sources from room keywords
# iteration 2: found 2 more from extracted keywords ("VFIO", "iommu")
# iteration 3: found 0 new — converged
# total: 6 new sources, 42 new nodes
```

The discovery loop agent expands your sources recursively: discover feeds from keywords, index them, extract new keywords from the content, discover more. Converges when nothing new is found.

## Publish to X/Twitter

```bash
export X_CLIENT_ID="your_client_id"    # from developer.x.com
wellinformed publish auth              # OAuth 2.0 — opens browser
wellinformed publish preview           # see what would be posted
wellinformed publish launch            # post the launch thread
wellinformed publish tweet "text"      # post a single tweet
```

## Background daemon

```bash
wellinformed daemon start              # runs trigger on a schedule
wellinformed daemon status             # check if running
wellinformed report --room homelab     # see what's new
```

## Real numbers

```
ArXiv:         10 papers
Simon Willison: 20 blog posts
Hacker News:   13 stories
Codebase:      55 source files
Dependencies:  14 packages
Git:           11 commits + 1 submodule
─────────────────────────
Total:         154 nodes, 30+ edges, <100ms search
Dedup re-run:  0 new (all skipped)
```

<details>
<summary>Architecture (for contributors)</summary>

```
src/
  domain/           Pure functions, no I/O, Result monads (neverthrow)
  infrastructure/   Ports + adapters (sqlite-vec, Readability, fast-xml-parser)
  application/      Use cases (indexNode, triggerRoom, findTunnels, discover)
  daemon/           setInterval loop + PID file
  mcp/              12 MCP tools over stdio
  cli/              Admin commands
```

Functional DDD. Every fallible op returns `Result<T, E>`. No classes in domain/application. All deps verified via `gh api` + [ossinsight.io](https://ossinsight.io).

</details>

## Star history

<a href="https://www.star-history.com/#SaharBarak/wellinformed&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=SaharBarak/wellinformed&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=SaharBarak/wellinformed&type=Date" />
    <img alt="Star History" src="https://api.star-history.com/svg?repos=SaharBarak/wellinformed&type=Date" />
  </picture>
</a>

## Contributing

1. **New source adapters** — GitHub trending, Reddit, Telegram. One file each under `src/infrastructure/sources/`.
2. **Platform guides** — Tested setup for Cursor, Copilot, Gemini CLI.
3. **Worked examples** — Run it on a real corpus. Share what the graph surfaced.

We respond within 48 hours.

## License

MIT
