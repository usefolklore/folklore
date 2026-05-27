# Requirements: akashik v2.0

**Defined:** 2026-04-12
**Core Value:** A decentralized knowledge graph where every coding agent shares what it learned.

## v2.0 Requirements

### Peer Identity & Management

- [x] **PEER-01**: Each akashik instance has an ed25519 keypair generated on first run, stored at ~/.akashik/peer-identity.json
- [x] **PEER-02**: `akashik peer add <multiaddr>` connects to a remote peer via js-libp2p
- [x] **PEER-03**: `akashik peer remove <id>` disconnects and removes a peer
- [x] **PEER-04**: `akashik peer list` shows connected peers with status, latency, shared rooms *(Phase 15: stored peers only; live status / latency / shared rooms land with Phase 18 NET layer)*
- [x] **PEER-05**: `akashik peer status` shows own identity, public key, connected peer count

### Security & Privacy

- [x] **SEC-01**: Secrets scanner runs on every node before sharing — detects API keys (sk-, ghp_, AKIA), tokens, passwords, .env patterns
- [x] **SEC-02**: Flagged nodes are BLOCKED from sharing with a clear warning
- [x] **SEC-03**: Shared nodes carry only: id, label, room, embedding_id, source_uri, fetched_at. No raw text, no content_sha256, no file contents, and no raw embedding vectors.

    **Rationale for `embedding_id` (reference) instead of `embedding_vector` (raw float array) — revised 2026-04-12:** Embedding-inversion attacks can recover approximate source text from sentence-transformer vectors (Morris et al. 2023, "Text Embeddings Reveal Almost As Much As Text"). Sharing raw vectors would make the metadata boundary porous — a peer receiving vectors could reconstruct private content the user never meant to leak. Phase 15 ships `embedding_id` as a stable reference so receivers know which embedding slot a node occupies locally, but the vector itself is never transmitted. Cross-peer semantic search (Phase 17) must re-embed from `source_uri + label` on the receiving side rather than trusting imported vectors. This is a stronger security model than the original spec and should be preserved through Phase 16+.
- [x] **SEC-04**: `akashik share audit --room X` shows exactly what would be shared before enabling
- [x] **SEC-05**: All P2P traffic encrypted via libp2p Noise protocol
- [x] **SEC-06**: Peer authentication via ed25519 signature verification

### Room Sharing

- [x] **SHARE-01**: `akashik share room <name>` marks a room as public (shared with connected peers)
- [x] **SHARE-02**: `akashik unshare room <name>` makes a room private again
- [x] **SHARE-03**: Shared rooms sync via Y.js CRDT — concurrent edits from multiple peers converge
- [x] **SHARE-04**: Only metadata + embeddings replicate (node labels, vectors, edges) — not raw source text
- [x] **SHARE-05**: Sync is incremental — only new/changed nodes since last sync
- [x] **SHARE-06**: Offline changes queue and sync automatically when peers reconnect

### Federated Search

- [x] **FED-01**: `akashik ask "query" --peers` searches across all connected peers' shared rooms
- [x] **FED-02**: Results aggregated and re-ranked by distance across all peers
- [x] **FED-03**: Each result shows which peer it came from
- [x] **FED-04**: Tunnel detection runs across peers — cross-peer + cross-room connections surfaced
- [x] **FED-05**: MCP tool `federated_search` lets Claude search the P2P network mid-conversation

### Peer Discovery

- [x] **DISC-01**: Manual peer add via multiaddr (always works, no infrastructure needed)
- [x] **DISC-02**: mDNS/Bonjour auto-discovery for peers on the same local network
- [x] **DISC-03**: DHT-based discovery for internet-wide peer finding (libp2p Kademlia)
- [x] **DISC-04**: Optional coordination server for bootstrapping (lightweight, stateless)

### Production Networking

- [x] **NET-01**: js-libp2p transport with multiplexed streams
- [x] **NET-02**: Bandwidth management — configurable sync rate, no flooding
- [x] **NET-03**: NAT traversal via libp2p relay + hole punching
- [x] **NET-04**: Connection health monitoring with auto-reconnect

### Structured Codebase Indexing

- [x] **CODE-01**: `akashik codebase index <path>` parses a codebase into `~/.akashik/code-graph.db` using tree-sitter (TypeScript + Python grammars at minimum)
- [x] **CODE-02**: Code graph schema captures: file, module, class, interface, function, method, signature (parameters + return type), imports, exports, call graph edges — stored in a separate SQLite database distinct from the research graph
- [x] **CODE-03**: Codebase is a first-class DDD aggregate root with its own `CodebaseId`, separate from `RoomId`
- [x] **CODE-04**: `akashik codebase attach <codebase-id> --room <room-id>` attaches a codebase to a room via the `codebase_rooms` join table (M:N — one codebase can be attached to multiple rooms, one room can reference multiple codebases)
- [x] **CODE-05**: `akashik codebase list` shows all indexed codebases with their language, node count, and attached rooms
- [x] **CODE-06**: `akashik codebase reindex <codebase-id>` incrementally re-indexes changed files (by mtime or git SHA) without re-parsing unchanged files
- [x] **CODE-07**: `akashik codebase search <query>` returns code nodes matching the query across attached codebases, with line/column locations
- [x] **CODE-08**: New MCP tool `code_graph_query` lets Claude query the structured code graph mid-conversation, separate from the research graph's `search`/`ask` tools

### Session Persistence

- [x] **SESS-01**: New source adapter `src/infrastructure/sources/claude-sessions.ts` walks `~/.claude/projects/<project-hash>/*.jsonl` and ingests every session transcript into a dedicated `sessions` room. Each user message, assistant response, tool call, and hook event becomes a first-class graph node with timestamps, sessionId, parentUuid chain, and git branch.
- [x] **SESS-02**: Tool calls (Bash, Edit, Write, Read, Agent, WebFetch, Grep, Glob) are extracted from the JSONL and indexed with full metadata — command, file paths, exit codes, stdout/stderr summaries. File edits track the target file so `ask "when did I last touch X"` works.
- [x] **SESS-03**: Incremental ingest — the adapter tracks file mtime + byte offset per JSONL so a 50 MB session doesn't re-parse from byte 0 on every daemon tick. New messages appended since last tick are the only new work.
- [x] **SESS-04**: Daemon tick includes a session-sources run (configurable interval, default 5 min) so in-progress sessions are captured in near-realtime without user action.
- [x] **SESS-05**: New CLI command `akashik recent-sessions [--hours N] [--project PATH] [--json]` prints a structured summary of recent sessions: duration, tool-call count, file list, final assistant message, git branch.
- [x] **SESS-06**: New MCP tool `recent_sessions(hours?, project?, limit?)` — Claude queries previous session state from any new session. Returns the same structured summary as the CLI for machine consumption.
- [x] **SESS-07**: The existing akashik PreToolUse hook is extended to surface a one-paragraph "previous session summary" on SessionStart, injected into Claude's context automatically. Triggers when the current session has < 3 user messages and a previous session exists within the last N hours (default 24).
- [x] **SESS-08**: Automatic retention policy — session nodes older than 30 days age out unless they contain "key signals" (commit hashes, external API calls, secret-scanner matches that were blocked). Key-signal sessions retained indefinitely. Configurable via `config.yaml sessions.retention_days`.

### Rooms Deletion (V5 Wire-Protocol Break)

- [ ] **ROOMS-DEL-01**: `akashik room` CLI command is removed; no subcommand routes to room CRUD
- [ ] **ROOMS-DEL-02**: `~/.akashik/rooms.json` is no longer read or written by any code path
- [ ] **ROOMS-DEL-03**: `~/.akashik/shared-rooms.json` is removed; sharing gates on `node.private === false`
- [ ] **ROOMS-DEL-04**: `GraphNode` schema has `room` removed, `workspace?: string` and `private: boolean` added
- [ ] **ROOMS-DEL-05**: Wire protocol V5: `SearchRequest`, `SearchResponse`, peer-pull telemetry have no `room` field
- [ ] **ROOMS-DEL-06**: `akashik migrate v5` exists, is idempotent, and migrates the user's live graph losslessly (except `room` → `workspace` heuristic)
- [ ] **ROOMS-DEL-07**: Read-side commands (`ask`, `recall`, `discover`, `report`) auto-apply workspace pre-filter when cwd is in a git repo; `--workspace all` opts out
- [ ] **ROOMS-DEL-08**: All `.claude/hooks/akashik-*` scripts format hits without `room` field and pass the test suite

## v3 Requirements (deferred)

- **V3-01**: Reputation system — peers that share valuable content rank higher
- **V3-02**: Incentive layer — token-based rewards for sharing rare knowledge
- **V3-03**: Federated learning — train shared embedding models across the network
- **V3-04**: Global knowledge index — searchable directory of all public rooms across all peers

## Out of Scope

| Feature | Reason |
|---------|--------|
| Blockchain/crypto integration | Complexity, no clear value for v2 |
| Raw text sharing | Privacy risk — metadata + embeddings only |
| Anonymous peers | All peers authenticated via ed25519 |
| Central server dependency | P2P by design — server is optional bootstrap only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| PEER-01..05 | Phase 15 | ✓ Complete |
| SEC-01..06 | Phase 15 | ✓ Complete |
| SHARE-01..06 | Phase 16 | ✓ Complete |
| FED-01..05 | Phase 17 | ✓ Complete |
| DISC-01..04 | Phase 17 | ✓ Complete (DISC-04 deferred to v3) |
| NET-01..04 | Phase 18 | Pending |
| CODE-01..08 | Phase 19 | Pending |
| ROOMS-DEL-01..08 | Phase 24 | Pending |

**Coverage:**
- v2.0 requirements: 46 total (30 P2P + 8 codebase indexing + 8 rooms deletion)
- Mapped to phases: 46
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-12*
