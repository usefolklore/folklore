# wellinformed — Roadmap

## Vision

A Claude Code plugin that turns a research daemon + daily Telegram scroll into a queryable, embeddings-backed knowledge graph. Rooms partition knowledge by domain (homelab, fundraise, etc.). Tunnels surface surprising cross-domain connections.

## Phases

### Phase 0 — Scaffold (done)

Zero-dep CLI with `doctor`, `version`, `help`. Plugin manifest at `.claude-plugin/plugin.json`. Config example. TypeScript + ESM.

### Phase 1 — Graph + Vectors + Embeddings (done)

DDD layered stack: pure domain (graph, vectors, errors), infrastructure ports + adapters (JSON graph repo, sqlite-vec vector index, xenova/fixture embedders), application use cases (indexNode, searchByRoom, searchGlobal, findTunnels, exploreRoom). Graphify vendored as submodule with schema patch for room/wing/source_uri/fetched_at/embedding_id. Python venv bootstrapping for graphify sidecar.

### Phase 2 — Source Ingest Pipeline (done)

Pluggable Source port with four adapters: generic_rss, arxiv, hn_algolia, generic_url. RSS 2.0 + Atom normaliser. Recursive paragraph chunker. Content-hash (sha256) dedup on re-runs. `wellinformed trigger [--room R]` and `wellinformed sources list|add|remove|enable|disable`.

Libraries: @mozilla/readability (article extraction), linkedom (DOM), fast-xml-parser (XML).

### Phase 3 — MCP Server (done)

9 tools exposed over stdio via @modelcontextprotocol/sdk: search, ask, get_node, get_neighbors, list_rooms, find_tunnels, sources_list, trigger_room, graph_stats. `wellinformed mcp start` — auto-spawned by Claude Code via the plugin manifest.

### Phase 4 — Room Management + Init

**Commands:** `wellinformed init`, `wellinformed room list|create|switch|current`

**Goal:** Make onboarding self-service. `init` is an interactive wizard that asks what the user is researching, creates the room, suggests source adapters (arxiv queries, RSS feeds, HN searches), and registers them. `room` manages rooms programmatically (list, create, set current default, switch).

**Deliverables:**
- `src/domain/rooms.ts` — Room metadata type (name, description, created_at, keywords, default wing)
- `src/infrastructure/rooms-config.ts` — Room registry at `~/.wellinformed/rooms.json`
- `src/cli/commands/init.ts` — Interactive room seeding wizard (prompts via readline)
- `src/cli/commands/room.ts` — list / create / switch / current / describe
- Update `sources add` to validate that the room exists in the registry
- Update MCP tools: add `room_create`, `room_list` tools
- Test: `tests/phase4.rooms.test.ts`

### Phase 5 — CLI Search + Reports

**Commands:** `wellinformed ask "<query>"`, `wellinformed report [date] [--room R]`

**Goal:** Query the graph from the terminal without Claude Code, and generate human-readable daily/weekly reports.

**Deliverables:**
- `src/cli/commands/ask.ts` — Semantic search + formatted context output to stdout
- `src/cli/commands/report.ts` — Generate markdown report: new nodes, tunnel candidates, god nodes, community shifts
- `src/application/report.ts` — Report generation use case (loads graph, computes delta since last report, formats)
- Report persistence at `~/.wellinformed/reports/<room>/<date>.md`
- Test: `tests/phase5.ask.test.ts`, `tests/phase5.report.test.ts`

### Phase 6 — Daemon + Discovery

**Commands:** `wellinformed daemon start|stop|status`, `wellinformed discover [--room R]`

**Goal:** Set-and-forget. The daemon runs `triggerRoom` on a configurable schedule, rotates through rooms, writes reports, and surfaces new content without manual intervention. Discovery mode expands the source list by finding new feeds/queries within a room's topic area.

**Deliverables:**
- `src/daemon/loop.ts` — setInterval-based loop with PID file, round-robin rooms, configurable interval
- `src/daemon/discovery.ts` — Given a room's keywords and existing sources, suggest new sources (search RSS aggregators, arxiv categories, HN tags)
- `src/cli/commands/daemon.ts` — start / stop / status
- `src/cli/commands/discover.ts` — one-shot discovery run
- Config integration: read daemon settings from `~/.wellinformed/config.yaml` (add `yaml` dep)
- Test: `tests/phase6.daemon.test.ts`

### Phase 7 — Telegram Bridge

**Commands:** `wellinformed telegram setup|test|capture-start|digest-test`

**Subphases (from config.yaml):**
- **7a — Outbound digests:** After each daemon iteration, send a summary to Telegram (one message per room, top-N new items)
- **7b — Inbound capture:** Forward any link to the bot → auto-ingest into the best-matching room. Follows references (max_depth), OCR images, vision fallback for screenshots
- **7c — Inbound commands:** Query from your phone: `ask`, `report`, `trigger`, `status`, `rooms`, `pending`

**Deliverables:**
- `src/telegram/bot.ts` — Telegram Bot API client (long-polling, no webhook)
- `src/telegram/capture.ts` — URL → ingest pipeline, room classification, reference following
- `src/telegram/digest.ts` — Post-iteration summary formatting + send
- `src/telegram/commands.ts` — Inbound command routing
- `src/cli/commands/telegram.ts` — setup (interactive token + chat_id), test, capture-start
- Test: `tests/phase7.telegram.test.ts` (mock bot API)

## Status

| Phase | Status | Commits | Tests |
|-------|--------|---------|-------|
| 0 | done | `3d298bf` | — |
| 1 | done | `7548d92` `d053264` `b4365b3` | 1 |
| 2 | done | `db22615` | 14 |
| 3 | done | `1efbbb4` | 1 |
| 4 | next | — | — |
| 5 | planned | — | — |
| 6 | planned | — | — |
| 7 | planned | — | — |

## Principles

- **DDD + functional:** pure domain, ports + adapters infra, neverthrow Result chains
- **Research before picking libs:** verify on ossinsight / gh API / star-history, not generic web search
- **Right tool for the job:** hand-roll when the dep is heavier than the function (chunker, RSS normaliser)
- **Three new deps max per phase:** keep the dependency surface tight
- **Test at least 3 items:** catches the eager-sequence race on shared state
