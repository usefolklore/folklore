<p align="center">
  <img src="docs/logo.svg" alt="wellinformed" width="600" />
</p>

<p align="center">
  <strong>A Claude Code plugin that feeds your research into a queryable knowledge graph — rooms-scoped, embeddings-backed, always current.</strong>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> &middot;
  <a href="#how-it-works">How it works</a> &middot;
  <a href="#cli-reference">CLI</a> &middot;
  <a href="#mcp-tools">MCP tools</a> &middot;
  <a href="docs/ROADMAP.md">Roadmap</a>
</p>

---

Set up a research room, point it at ArXiv, Hacker News, RSS feeds, or any URL. wellinformed fetches, chunks, embeds, and indexes everything into a persistent knowledge graph partitioned by **rooms** (homelab, fundraise, ml-papers — whatever you're tracking). Claude Code queries the graph live via MCP. A background daemon keeps it current.

Cross-room connections ("tunnels") surface when two topics in different rooms are semantically close — the thing rooms exist to produce.

```
wellinformed init                              # seed a room interactively
wellinformed trigger --room homelab            # fetch + index all sources
wellinformed ask "knowledge graph embeddings"  # semantic search from terminal
```

## Quick start

```bash
# clone
git clone https://github.com/saharbarak/wellinformed.git
cd wellinformed

# install + bootstrap graphify sidecar
npm install
bash scripts/bootstrap.sh

# verify
node bin/wellinformed.js doctor
```

```
[ ok ] Node.js >= 20                found 25.6.1
[ ok ] Python >= 3.10               python3.13 3.13
[ ok ] plugin manifest              .claude-plugin/plugin.json present
[ ok ] graphify submodule           vendor/graphify present
[ ok ] wellinformed venv            ~/.wellinformed/venv/bin/python
[ ok ] graphify importable          OPTIONAL_NODE_FIELDS = embedding_id,fetched_at,room,source_uri,wing
[ ok ] wellinformed schema patch    room/wing/source_uri/fetched_at/embedding_id
```

## How it works

```
Sources (ArXiv, HN, RSS, URLs)
    │
    ▼
  fetch → parse → chunk → embed (all-MiniLM-L6-v2, 384d)
    │                              │
    ▼                              ▼
  graph.json                   vectors.db
  (NetworkX node-link)         (sqlite-vec, room-scoped k-NN)
    │                              │
    └──────────┬───────────────────┘
               ▼
        MCP server (11 tools)
         ↕           ↕
    Claude Code    CLI (ask, report)
```

**Rooms** partition your knowledge. Each room is an independent research context with its own sources, nodes, and embeddings. Rooms don't see each other — except through **tunnels**, cross-room pairs of semantically similar nodes that surface surprising connections.

**Dedup** is content-hash based. Re-running `trigger` on the same sources skips unchanged items (sha256 of normalized text). If an article is rewritten in place, only the changed content is re-indexed.

**Graph format** is NetworkX node-link JSON — the same format graphify reads and writes. Five optional fields are added to each node: `room`, `wing`, `source_uri`, `fetched_at`, `embedding_id`.

## CLI reference

| Command | Description |
|---|---|
| `doctor [--fix]` | Check runtime prerequisites. `--fix` bootstraps the Python venv. |
| `init` | Interactive room seeding wizard. Suggests sources from your keywords. |
| `room list\|create\|switch\|current\|describe` | Manage the room registry. |
| `sources list\|add\|remove\|enable\|disable` | Manage source descriptors. |
| `trigger [--room R]` | Fetch + chunk + embed + index all enabled sources for a room. |
| `ask "<query>" [--room R] [--k N]` | Semantic search + formatted context output. |
| `report [--room R] [--since DATE]` | Generate a markdown report: new nodes, god nodes, tunnels. |
| `discover [--room R] [--auto]` | Suggest new sources matching room keywords. |
| `daemon start\|stop\|status` | Background daemon that triggers on a schedule. |
| `mcp start` | Start the MCP stdio server (Claude Code auto-spawns this). |

## Source adapters

| Kind | What it fetches | Config |
|---|---|---|
| `generic_rss` | Any RSS 2.0 or Atom 1.0 feed | `{ "feed_url": "https://..." }` |
| `arxiv` | ArXiv API (Atom responses) | `{ "query": "abs:embeddings OR abs:rag" }` |
| `hn_algolia` | Hacker News via Algolia search | `{ "query": "knowledge graph", "tags": "story" }` |
| `generic_url` | One URL, extracted via Readability | `{ "url": "https://..." }` |

```bash
# Add a source manually
wellinformed sources add my-feed \
  --kind generic_rss \
  --room homelab \
  --config '{"feed_url":"https://selfh.st/rss/","max_items":20}'

# Or let discovery suggest sources from your keywords
wellinformed discover --room homelab --auto
```

## MCP tools

When Claude Code discovers the `.claude-plugin/plugin.json` manifest, it spawns `wellinformed mcp start` and gains access to 11 tools:

| Tool | What it does |
|---|---|
| `search` | Room-scoped semantic k-NN search |
| `ask` | Search + assembled context block for LLM consumption |
| `get_node` | Full attributes of a node by ID |
| `get_neighbors` | Direct neighbors with edge details |
| `list_rooms` | All rooms with counts and sample labels |
| `find_tunnels` | Cross-room pairs below a distance threshold |
| `sources_list` | Show configured source descriptors |
| `trigger_room` | Run one ingest iteration from within Claude Code |
| `graph_stats` | Node/edge/room/vector counts |
| `room_create` | Create a new room |
| `room_list` | List the room registry |

## Architecture

```
src/
  domain/           pure types + ops, no I/O, no throws
    graph.ts         Graph value + immutable upsert/bfs/dfs/shortestPath
    vectors.ts       Vec math, L2, cosine, findTunnels
    chunks.ts        recursive paragraph splitter (~80 LoC, no deps)
    feeds.ts         RSS 2.0 + Atom normaliser (~140 LoC, no deps)
    rooms.ts         RoomMeta, registry, validation
    sources.ts       Source port + SourceDescriptor + SourceRun
    content.ts       ContentItem, FingerprintedItem
    errors.ts        tagged GraphError / VectorError / EmbeddingError

  infrastructure/    ports + adapters
    graph-repository.ts      JSON file (atomic tmp+rename writes)
    vector-index.ts          better-sqlite3 + sqlite-vec
    embedders.ts             Xenova (ONNX) + fixture (tests)
    rooms-config.ts          room registry JSON
    sources-config.ts        source registry JSON
    config-loader.ts         YAML config with typed defaults
    http/fetcher.ts          native fetch + file:// for tests
    parsers/                 html-extractor (Readability+linkedom)
                             xml-parser (fast-xml-parser)
    sources/                 generic-rss, arxiv, hn-algolia, generic-url
                             registry (hydrates descriptors → Sources)

  application/       orchestration — use cases as closures over deps
    use-cases.ts     indexNode, searchByRoom, searchGlobal, findTunnels
    ingest.ts        ingestSource, triggerRoom (lazy sequential pipeline)
    report.ts        generateReport, renderReport
    discover.ts      suggest new sources from room keywords

  daemon/
    loop.ts          setInterval + PID file + round-robin rooms

  mcp/
    server.ts        11 MCP tools over stdio

  cli/
    runtime.ts       wires the live dependency graph
    commands/        doctor, init, room, sources, trigger, ask, report,
                     discover, daemon, mcp, help, version
```

Every fallible operation returns `Result<T, E>` or `ResultAsync<T, E>` via [neverthrow](https://github.com/supermacro/neverthrow). No classes in domain or application layers — pure functions and interface-driven factories.

## Dependencies

| Package | Purpose | Stars | Last commit |
|---|---|---|---|
| `neverthrow` | Result monad for error handling | 6k+ | active |
| `@xenova/transformers` | ONNX embeddings (all-MiniLM-L6-v2) | 12k+ | active |
| `better-sqlite3` | SQLite bindings | 6k+ | active |
| `sqlite-vec` | Vector search extension for SQLite | 5k+ | active |
| `@mozilla/readability` | Article extraction (Firefox Reader View) | 11k | active |
| `linkedom` | Lightweight DOM for server-side parsing | 2k | active |
| `fast-xml-parser` | RSS/Atom/ArXiv XML parsing | 3k | daily commits |
| `@modelcontextprotocol/sdk` | MCP server protocol | 12k | active |
| `yaml` | YAML config parsing | 1.6k | active |
| `zod` | Tool input schemas | 35k+ | active |

All libraries verified via `gh api repos/<owner>/<repo>` and ossinsight.io before selection.

## Runtime state

All per-user state lives under `~/.wellinformed/` (override with `WELLINFORMED_HOME`):

```
~/.wellinformed/
  graph.json          knowledge graph (NetworkX node-link JSON)
  vectors.db          sqlite-vec vector index (384-dim, room-scoped)
  rooms.json          room registry
  sources.json        source descriptors
  config.yaml         daemon + tunnel config (optional, defaults apply)
  venv/               Python venv with graphify sidecar
  reports/            generated markdown reports
  models/             cached ONNX embedding model
  daemon.pid          PID file when daemon is running
  daemon.log          daemon log
```

## Config

Copy `config/config.example.yaml` to `~/.wellinformed/config.yaml` and adjust:

```yaml
daemon:
  interval_seconds: 86400     # 1 day between runs
  round_robin_rooms: true     # one room per tick vs all-at-once

rooms:
  tunnels:
    enabled: true
    similarity_threshold: 0.80
```

## Dogfood results

wellinformed running on itself with 3 live sources:

```
room=wellinformed-dev  sources=3
  [ ok ] wellinformed-dev-arxiv          seen= 10 new= 10
  [ ok ] wellinformed-dev-simon-willison seen= 20 new= 20
  [ ok ] wellinformed-dev-hn             seen= 13 new= 13

73 nodes, 30 edges, <100ms search latency
```

`ask "knowledge graph embeddings"` returns HN stories from 2017-2024 about KG embeddings. `ask "MCP protocol Claude Code"` returns Simon Willison's Claude Code posts. Dedup correctly skips unchanged items on re-run.

## License

MIT
