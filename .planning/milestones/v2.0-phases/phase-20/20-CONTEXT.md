# Phase 20: Session Persistence - Context

**Gathered:** 2026-04-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Auto-ingest every Claude Code session's JSONL transcript into a dedicated `sessions` room so context survives kills, crashes, and restarts — without explicit user request. The gap: Claude Code already writes full session transcripts to `~/.claude/projects/<project-hash>/<session-id>.jsonl` but no tool reads them, so new sessions start blind to prior work. Phase 20 closes that loop end-to-end: source adapter → incremental ingest → CLI surface → MCP tool → PreToolUse hook that surfaces the previous session's state on SessionStart. Zero explicit-user-action integration.

</domain>

<decisions>
## Implementation Decisions

### JSONL Parser + State Model
- Each meaningful JSONL entry becomes a first-class graph node: `user` messages, `assistant` messages (including embedded tool_use), and `attachment` entries with `hookEvent: "SessionStart"`
- Granularity: one node per meaningful entry (not per session and not per byte) — enables per-action retrieval like "when did I last edit X"
- Tool calls parsed into: node label = command/operation, tags = file paths, content = first 200 chars of stdout/stderr + exit code
- Each node carries BOTH `sessionId` (room-like grouping) and the JSONL entry's own `uuid` (individual retrieval key)
- Chain edges: `followed-by` edges between consecutive entries in a session, linked via `parentUuid`

### Incremental Ingest State Tracking
- State file: `~/.folklore/sessions-state.json` with `{ version: 1, files: { [filePath]: { mtime, byteOffset, lastLineNum } } }` — mirrors the `peers.json` / `shared-rooms.json` schema pattern
- File discovery: walk `~/.claude/projects/` recursively, match `*.jsonl`. No hardcoded project paths
- Current-session skip: files with mtime within 5 seconds of `now` are skipped (they're being actively written). Belt-and-suspenders skip for `${CLAUDE_SESSION_ID}.jsonl` when that env var is set at ingest time
- Partial line handling: after reading up to `byteOffset`, buffer any bytes after the last `\n`. Next tick re-reads from the stored offset. Standard tail-follow pattern, prevents half-written lines from being parsed as broken JSON

### Integration with Daemon + Hooks
- Session ingest runs as a **registered source adapter** invoked by the existing daemon tick loop — same pattern as arxiv/hn/rss/codebase sources. Configurable interval via `config.yaml sessions.interval_seconds` (default 300)
- Dedicated `sessions` room auto-provisioned on first ingest. Distinct from `folklore-dev` and all research rooms. Never the default room
- PreToolUse hook: extend the EXISTING `.claude/hooks/folklore-hook.sh` that `folklore claude install` drops. Add a SessionStart branch that runs `folklore recent-sessions --hours 24 --json` and emits the first session summary as additionalContext. Hook stays idempotent — doesn't change what it emits for other events
- MCP tool `recent_sessions(hours?, project?, limit?)` returns:
  ```
  { count, sessions: [{ id, started_at, duration_ms, tool_calls, files_touched, final_assistant_message, git_branch }] }
  ```

### Privacy, Retention, Security
- **Every session node runs through Phase 15's `scanNode` secrets scanner before ingest.** Matched nodes get `_blocked_by_secret_scan: true` tag and the content is replaced with a placeholder like `[BLOCKED: <pattern_name>]`. Sessions often contain pasted API keys, the scanner MUST apply
- Retention: default 30 days, configurable via `config.yaml sessions.retention_days`. Nodes containing "key signals" (git commit hashes, external API URLs, blocked-secret matches) are retained indefinitely as a separate tier
- **`sessions` room is marked `shareable: false`** at the registry level. Phase 16's `share room sessions` command hard-refuses with a dedicated error. Session data is personal and NEVER goes over libp2p
- Retention enforcement runs inside the same daemon tick as ingest. Prunes nodes whose `timestamp` is older than the cutoff and lack key-signal tags

### Claude's Discretion
- Whether to apply the secrets scanner to the user messages as well (lean: yes, users paste secrets into prompts)
- Exact tool-use extraction format for multi-tool assistant turns — flatten into N sibling nodes or one parent node with tool_calls array
- Whether to backfill historical sessions (existing JSONL files older than 30 days) on first ingest or start from now

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/infrastructure/sources/generic-rss.ts` (84 LoC) — the canonical small source adapter pattern. Phase 20 mirrors it for JSONL parsing + node emission
- `src/infrastructure/sources/codebase.ts` (204 LoC) — shows how to walk a directory and emit nodes with metadata
- `src/domain/sharing.ts` (Phase 15) — `scanNode` + `buildPatterns` used for secrets scanning on ingest
- `src/application/ingest.ts` — the shared ingest pipeline (chunk + embed + upsert). Phase 20 feeds through this same pipeline
- `src/daemon/loop.ts` (Phase 6-18) — tick loop that fans out to all registered sources. Phase 20 adds one more source type
- `src/infrastructure/peer-store.ts` — version-tracked JSON file pattern (`version: 1` + atomic tmp+rename) for `sessions-state.json`
- `src/cli/commands/peer.ts` + `src/cli/commands/codebase.ts` — CLI subcommand templates for the new `recent-sessions` command
- `src/mcp/server.ts` — `registerTool` pattern for the new `recent_sessions` MCP tool

### Established Patterns
- Functional DDD: pure domain types + functions in `src/domain/`, I/O in `src/infrastructure/`
- neverthrow `Result` / `ResultAsync` for every fallible op
- Atomic file writes via tmp + rename (reuse the helper from peer-store.ts)
- Error unions per bounded context — Phase 20 adds `SessionError` with variants: FileReadError, JsonlParseError, StateFileError, RetentionError, IngestError
- Source adapter shape: `(config) => ResultAsync<readonly RawNode[], GraphError>` — feeds ingest pipeline
- All deps verified via gh api + ossinsight (none needed for Phase 20 — zero new packages)

### Integration Points
- New files:
  - `src/domain/sessions.ts` — `SessionEntry`, `SessionNode`, `SessionState` types + pure helpers
  - `src/infrastructure/sources/claude-sessions.ts` — the source adapter (file walk, JSONL parse, incremental state tracking)
  - `src/infrastructure/sessions-state.ts` — atomic state file read/write with version migration
  - `src/application/session-ingest.ts` — use case that composes the adapter + scanner + upsert pipeline
  - `src/cli/commands/recent-sessions.ts` — CLI command
  - `tests/phase20.sessions.test.ts` — test suite
- Extended files:
  - `src/domain/errors.ts` — add `SessionError` variants and wire into `AppError` + exhaustive `formatError`
  - `src/infrastructure/config-loader.ts` — add `SessionsConfig { interval_seconds, retention_days, scan_user_messages }`
  - `src/infrastructure/sources-config.ts` — register the new `claude_sessions` source kind
  - `src/daemon/loop.ts` — dispatch to the claude-sessions source on each tick
  - `src/cli/index.ts` — register `recent-sessions` command
  - `src/mcp/server.ts` — register `recent_sessions` MCP tool (15th → 16th tool)
  - `.claude/hooks/folklore-hook.sh` (generated by `folklore claude install`) — extend with SessionStart branch. Also update the install command to emit the new hook body
  - `src/cli/commands/claude-install.ts` — update hook template
- Files NOT touched:
  - `src/infrastructure/sources/codebase.ts` — shallow code adapter stays
  - Phase 15-19 output — no regressions
  - `~/.folklore/graph.json` and `vectors.db` — sessions room is additive, does not touch existing nodes
  - `code-graph.db` — Phase 19 codebase graph is a separate subsystem

</code_context>

<specifics>
## Specific Ideas

- **Zero new deps.** All parsing via `node:fs` + `JSON.parse`. No new npm packages.
- The `.claude/projects/-Users-saharbarak-workspace-folklore/` directory on disk already has multiple `<session-id>.jsonl` files (confirmed via ls) — Phase 20 can run retroactively on the historical data to validate the adapter
- JSONL entries include `cwd` and `gitBranch` fields → automatically expose "which branch was I on when I did X"
- Tool calls contain `toolUseID` → enable cross-linking a user-visible assistant message with the underlying Bash command that produced it
- `attachment` entries with `type: "file-history-snapshot"` → can be used as "session baseline" markers
- Incremental sync interval configurable — for always-on use, set `interval_seconds: 60` to get near-realtime session capture
- The `sessions` room never participates in P2P sharing — this prevents any risk of leaking personal session data across peers (Phase 16 review item addressed explicitly)
- User explicitly hit this pain on a cyberleads Make.com session in another Claude window — Phase 20 is the direct fix

</specifics>

<deferred>
## Deferred Ideas (Phase 21+)

- **Session search by semantic content** — Phase 20 ships lexical/structural search via existing ingest pipeline. Semantic embedding of session nodes would add vector search within sessions, but wait until the schema stabilizes
- **Multi-machine session sync via libp2p** — explicitly OUT of scope for Phase 20 per the privacy decision. Sessions stay local
- **Redaction policies beyond secrets scanning** — e.g. auto-redact file paths matching patterns in `.gitignore`. Defer
- **Session replay / timeline UI** — Phase 20 ships data, not visualization. A later `folklore viz sessions` command could render a timeline
- **Cross-session pattern mining** — e.g. "you tend to fix Make.com scenarios on Mondays". Out of scope
- **Automatic task resumption** — the hook surfaces context but doesn't auto-continue tasks. That's a Claude Code feature not a folklore feature
- **Session archival to external storage** — for users who want to keep sessions past retention, export to S3/disk. Defer

</deferred>
