# Phase 7: Telegram Bridge - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Telegram bot that serves as the mobile interface to akashik: forward links for ingest, receive daily digests, query the graph from your phone. Single-user, long-polling, runs inside the daemon process.

</domain>

<decisions>
## Implementation Decisions

### Bot Architecture
- Long-polling (no webhook, no public URL needed)
- Raw `node-telegram-bot-api` library (~12K stars, lightweight)
- Bot runs inside the daemon loop — single process
- Single-user only — chat_id whitelist from config.yaml
- BotFather setup documented in CLI `akashik telegram setup`

### Inbound Capture
- Room classification via keyword similarity (compare message text against room keywords, pick highest-scoring)
- Capture URLs (auto-fetch + ingest) and plain text (save as note node)
- Follow references from captured URLs, configurable max_depth (default 2) from config.yaml
- Silent ingest + reply with node summary (no confirmation prompt)

### Outbound Digests & Commands
- Markdown-style digest: room name + top-3 new items with source links
- Digest sent after each daemon tick (frequency matches daemon interval)
- Commands available: ask, report, trigger, status, rooms
- Natural language syntax ("ask embeddings" not "/ask embeddings")

### Claude's Discretion
- Error message formatting for Telegram
- Rate limiting on inbound messages
- Message length truncation for Telegram's 4096 char limit

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/application/ingest.ts` — triggerRoom, ingestSource use cases
- `src/application/use-cases.ts` — searchByRoom, searchGlobal for ask command
- `src/application/report.ts` — generateReport, renderReport for digest/report
- `src/application/discover.ts` — discover for room classification keywords
- `src/domain/rooms.ts` — findRoom, roomIds for room lookup
- `src/infrastructure/http/fetcher.ts` — httpFetcher for URL fetching
- `src/daemon/loop.ts` — daemon loop to integrate bot into

### Established Patterns
- ResultAsync for all I/O, sequenceLazy for sequential operations
- Functional ports + adapters — bot should be a port with an adapter
- Config loaded from ~/.akashik/config.yaml via config-loader.ts

### Integration Points
- Daemon loop (src/daemon/loop.ts) — bot starts alongside the timer
- Config (src/infrastructure/config-loader.ts) — add telegram section
- Doctor (src/cli/commands/doctor.ts) — add telegram token check
- CLI router (src/cli/index.ts) — add telegram subcommand

</code_context>

<specifics>
## Specific Ideas

- BotFather is the setup mechanism — `akashik telegram setup` should guide token creation
- Digest should feel like a daily briefing, not a data dump

</specifics>

<deferred>
## Deferred Ideas

- OCR for images sent to the bot (Phase 8+ or later)
- Voice message transcription
- Group chat support (multi-user)

</deferred>
