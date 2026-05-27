# Roadmap: wellinformed v2.0

**Milestone:** v2.0 P2P Distributed Knowledge Graph
**Phases:** 15-18 (continues from v1.1 which ended at Phase 14)
**Requirements:** 30 mapped

## Phase 15: Peer Foundation + Security ✓ COMPLETE 2026-04-12

**Goal:** Peer identity, manual peer management, and secrets scanning so the security model is built BEFORE any sharing happens.

**Requirements:** PEER-01..05, SEC-01..06 (PEER-04 partial — live status deferred to Phase 18)

**Plans:** 4/4 complete

Plans:
- [x] 15-01-PLAN.md — Domain types + security scanner (peer.ts, sharing.ts, errors, config) — DONE 2026-04-12
- [x] 15-02-PLAN.md — Infrastructure layer (libp2p install, peer-transport.ts, peer-store.ts) — DONE 2026-04-12
- [x] 15-03-PLAN.md — CLI commands (peer add/remove/list/status, share audit, index.ts wiring) — DONE 2026-04-12
- [x] 15-04-PLAN.md — TDD test suite (37 tests, 11 requirements, 70/70 full suite pass) — DONE 2026-04-12

**Success criteria:**
1. First run generates ed25519 keypair at ~/.wellinformed/peer-identity.json
2. `peer add <multiaddr>` establishes a js-libp2p connection
3. Secrets scanner detects API keys in test fixtures and blocks them
4. `share audit --room X` shows the metadata that would be shared

## Phase 16: Room Sharing via Y.js CRDT ✓ COMPLETE 2026-04-12

**Goal:** Mark rooms as public, sync nodes across peers via Y.js. Metadata-only replication with incremental sync.

**Requirements:** SHARE-01..06 (live-network UAT deferred to Phase 17/18)

**Plans:** 4/4 complete

Plans:
- [x] 16-01-PLAN.md — Foundation: yjs+y-protocols install, ShareError, share-store, ydoc-store (V1 encoding, atomic writes) — DONE 2026-04-12
- [x] 16-02-PLAN.md — Sync engine: /wellinformed/share/1.0.0 libp2p protocol, REMOTE_ORIGIN echo prevention, secrets-scanned in/out updates, debounced graph flush — DONE 2026-04-12
- [x] 16-03-PLAN.md — CLI surface: `share room` (audit-gated), `unshare` (keeps .ydoc), daemon hook for runShareSyncTick — DONE 2026-04-12
- [x] 16-04-PLAN.md — TDD test suite: SHARE-01..06 + 5 pitfall regressions + local broadcast invariant (40 tests, 13 groups) — DONE 2026-04-12

**Success criteria:**
1. `share room homelab` makes a room available to connected peers
2. Peer B sees nodes from Peer A's shared room within 5 seconds
3. Concurrent node additions from both peers converge correctly
4. Offline peer reconnects and catches up without full resync

## Phase 17: Federated Search + Discovery ✓ COMPLETE 2026-04-12

**Goal:** Search across the P2P network. Tunnel detection across peers. Auto-discover peers on local network + DHT.

**Requirements:** FED-01..05, DISC-01..04 (DISC-04 coordination server explicitly deferred to Phase 18+; live-network UAT deferred to Phase 18)

**Plans:** 4/4 complete

Plans:
- [x] 17-01-PLAN.md — Foundation: 3 libp2p deps, SearchError 5-variant, PeerRecord.discovery_method, PeerConfig extensions — DONE 2026-04-12
- [x] 17-02-PLAN.md — Protocol + discovery infra: mDNS/DHT/peer:discovery, /wellinformed/search/1.0.0, token bucket, runFederatedSearch — DONE 2026-04-12
- [x] 17-03-PLAN.md — Surface: ask --peers, peer list column, 14th MCP tool federated_search, daemon search protocol — DONE 2026-04-12
- [x] 17-04-PLAN.md — TDD suite: 36 tests covering FED-01..05 + DISC-01..04 + 7 pitfalls (163/163 full suite pass) — DONE 2026-04-12

**Success criteria:**
1. `ask "query" --peers` returns results from connected peers' shared rooms
2. Results show which peer each result came from
3. mDNS discovers peers on the same local network automatically
4. MCP tool `federated_search` works from Claude Code

## Phase 18: Production Networking ✓ COMPLETE 2026-04-12

**Goal:** Production-grade P2P networking: multiplexed streams (yamux), NAT traversal (circuit-relay-v2 + dcutr + uPnPNAT), application-layer bandwidth management, and passive connection health monitoring. Last phase of v2.0 — after verify, the milestone ships.

**Requirements:** NET-01..04 (all complete)

**Plans:** 4/4 complete

Plans:
- [x] 18-01-PLAN.md — Foundation: 3 libp2p deps (circuit-relay-v2@4.2.0 + dcutr@3.0.15 + upnp-nat@4.0.15 + identify@4.1.0 transitive), NetError 6-variant, PeerConfig.relays/upnp/bandwidth — DONE 2026-04-12
- [x] 18-02-PLAN.md — Infrastructure: bandwidth-limiter.ts (Semaphore + re-exported createRateLimiter), connection-health.ts (in-memory HealthTracker), peer-transport wiring (circuitRelayTransport + dcutr + uPnPNAT) — DONE 2026-04-12
- [x] 18-03-PLAN.md — Integration: share-sync bandwidth gate with BandwidthExceeded error, daemon connection:close listener + conn.limits filter + relay pre-dial, peer list health column — DONE 2026-04-12
- [x] 18-04-PLAN.md — TDD suite: 685 lines, 44 tests across 3 tiers (structural + unit + 10-peer integration in ~2.5s), all 7 pitfalls regression-locked (243/243 full suite pass) — DONE 2026-04-12

**Success criteria:**
1. Peers behind NAT connect via libp2p relay + hole punching
2. Sync rate is configurable and does not flood bandwidth
3. Connection drops are detected and auto-reconnected
4. 10+ peers connected simultaneously without degradation

## Phase 19: Structured Codebase Indexing ✓ COMPLETE 2026-04-12

**Goal:** Parse codebases into a rich, structured code graph (classes, functions, signatures, call graph) stored separately from the research room graph. Codebases are first-class aggregates attachable to rooms via a join table. Powered by tree-sitter with TypeScript + Python grammars.

**Requirements:** CODE-01..08 (all 8 complete)

**Plans:** 4/4 complete

Plans:
- [x] 19-01-PLAN.md — Foundation: tree-sitter@0.21.1 + typescript@0.23.2 + python@0.23.4 (exact pins), CodebaseError (8 variants), src/domain/codebase.ts (163 lines), src/infrastructure/code-graph.ts (429 lines, 11 repo methods) — DONE 2026-04-12
- [x] 19-02-PLAN.md — Parser + indexer: tree-sitter-parser.ts (384 lines, Map<Lang,Parser> cache, CJS interop), codebase-indexer.ts (350 lines, two-pass exact/heuristic/unresolved resolution, content-hash incremental) — DONE 2026-04-12
- [x] 19-03-PLAN.md — CLI + MCP: cli/commands/codebase.ts (430 lines, 8 subcommands), runtime.ts (codeGraph path), cli/index.ts (dispatcher), mcp/server.ts (15th tool code_graph_query) — DONE 2026-04-12
- [x] 19-04-PLAN.md — TDD suite: 5 fixtures + tests/phase19.codebase-indexing.test.ts (757 lines, 14 describe groups, 36 tests, 199/199 full suite pass) — DONE 2026-04-12

**Success criteria:**
1. `wellinformed codebase index <path>` parses a TypeScript/JavaScript codebase into `~/.wellinformed/code-graph.db` with classes, functions, methods, imports, exports
2. `wellinformed codebase attach <codebase-id> --room <room-id>` attaches a codebase to a research room (M:N)
3. `wellinformed codebase search <query>` returns code nodes by semantic match across attached codebases
4. New MCP tool `code_graph_query` lets Claude query the structured code graph independently of research rooms

## Phase 20: Session Persistence ✓ COMPLETE 2026-04-13

**Goal:** Auto-persist every Claude Code session's progress into wellinformed so context survives kills, crashes, and restarts. No explicit user request.

**Requirements:** SESS-01..08 (all complete)

**Plans:** 4/4 complete

Plans:
- [x] 20-01-PLAN.md — Foundation: SessionError 5-variant union, src/domain/sessions.ts (254 lines, pure types + helpers), AppConfig.sessions, SharedRoomRecord.shareable v1→v2 migration — DONE 2026-04-13
- [x] 20-02-PLAN.md — Infrastructure: sessions-state.ts (242 lines, atomic lock+tmp+rename), claude-sessions.ts (368 lines, 3 pitfalls: mtime+env skip, buffered tail, scanNode redaction), SourceKind + registry wiring — DONE 2026-04-13
- [x] 20-03-PLAN.md — Integration: session-ingest + daemon auto-provision + enforceRetention, recent-sessions CLI, 16th MCP tool, share hard-refuse (double defense), PreToolUse SessionStart branch (idempotent), phase17 C2 bumped 15→16 — DONE 2026-04-13
- [x] 20-04-PLAN.md — TDD suite: tests/phase20.sessions.test.ts (686 lines, 13 describe groups, 70 tests, 313/313 full suite pass) + 2 JSONL fixtures — DONE 2026-04-13

**Success criteria:**
1. `~/.claude/projects/<hash>/*.jsonl` files are indexed automatically (via daemon tick) into a dedicated `sessions` room
2. `wellinformed recent-sessions` CLI command shows last N sessions with duration, tool-call summary, and assistant-message highlights
3. New MCP tool `recent_sessions(hours?, project?)` lets Claude query previous session state from any new session
4. On SessionStart, the PreToolUse hook surfaces a one-paragraph "what the last session was doing" automatically — no explicit ask required

## Phase 24: Delete Rooms — V5 Wire-Protocol Break ✓ COMPLETE 2026-05-27

**Goal:** Delete the `room` abstraction entirely from the codebase. Replace with `workspace?: string` (read-side, local-only) + `private: boolean` (sharing gate). Bump federation wire protocol to V5. The user-facing room concept disappears: no `wellinformed room` CRUD, no `shared-rooms.json`, no `default_room`, no system rooms (`toolshed`, `research`). Sharing is gated by per-node `private === false`. Reputation flattens from `(peer, room)` to `peer` keys.

**Requirements:** ROOMS-DEL-01..08 (new — see REQUIREMENTS.md)

**Plans:** 12/12 complete

Plans:
- [x] 24-01-PLAN.md — Wave 0: Schema wedge — drop `room?: Room` from GraphNode, add `workspace?` + `private`; add ROOMS-DEL-01..08 to REQUIREMENTS.md
- [x] 24-02-PLAN.md — Wave 1a: Delete 5 source files + 3 phase tests + share-picker TUI; strip `room` dispatch from cli/index.ts
- [x] 24-03-PLAN.md — Wave 1b: Wire-protocol surgery — V5 SearchRequest/Response/PeerMatch/TouchRequest/ShareEnvelope; ProtocolMismatchError; rewrite peer-pull-telemetry to peer-only
- [x] 24-04-PLAN.md — Wave 1c: Runtime + daemon — drop rooms wiring from runtime.ts, add detectWorkspace helper; drop RoomsConfig + per-room triggers from daemon/loop.ts
- [x] 24-05-PLAN.md — Wave 1d: Update 5 Claude Code hooks (smart-hook, prompt-submit, mcp-pre, session-start, session-capture, post-fetch) — drop room from formatters + save invocations
- [x] 24-06-PLAN.md — Wave 2a: Rewrite share-sync.ts (869 → ~400 lines) — single global Y.Doc, private-flag gate, peer-only stream keying
- [x] 24-07-PLAN.md — Wave 2b: Rewrite share.ts + unshare.ts to peer-only; DELETE share-picker.ts (Open Question 1 resolved)
- [x] 24-08-PLAN.md — Wave 2c: MCP server — drop list_rooms/find_tunnels/trigger_room (16→13 tools); strip room param from search/federated_search/search_recent/entity-first-lookup
- [x] 24-09-PLAN.md — Wave 3a: Surgical edits to ~32 CLI + application + domain files; HALF_LIFE_BY_ROOM dropped; subjectFromRoom dropped
- [x] 24-10-PLAN.md — Wave 3b: Surgical edits to ~9 infrastructure + daemon + telegram files; vector-index searchByRoom* deleted; peer-reputation flattened; federation-sim niche-evaporation stubbed
- [x] 24-11-PLAN.md — Wave 4a: Build `wellinformed migrate v5` command (idempotent, lossless, --rollback); grow doctor to nag on v4 data; write V5-PROTOCOL.md, deprecate V4-PROTOCOL.md, update peer-reputation-design.md
- [x] 24-12-PLAN.md — Wave 4b: New tests/phase24.rooms-deleted.test.ts (~500 lines, 9 describe groups, 30+ tests); surgical edits to ~12 existing tests; final cutover validation (build + test + tsc)

**Rationale:** Two octopus debates (2026-05-26 + 2026-05-27) converged on deletion. The user opted for "full deletion now" over a staged Phase 1 / Phase 24+ split. The debate synthesis lives at `.planning/debates/rooms-deprecation-2026-05-27/SYNTHESIS.md`. Scope audit ~4,000–4,500 LOC deleted across ~60 files (5 files deleted entirely, 3 major rewrites of share-store.ts + share-sync.ts + mcp/server.ts, ~47 surgical edits, 3 phase tests deleted).

**Success criteria:**
1. `wellinformed save "x"` from any cwd routes to a workspace-derived graph slice with `private: false` by default; user never sees a room concept.
2. `wellinformed ask "x"` from a git repo returns nodes filtered by workspace pre-filter; cross-workspace results available with `--workspace all`.
3. `wellinformed share <peer>` shares all `private === false` nodes; no `--room` flag, no `shared-rooms.json` to maintain. `wellinformed save --private` sets the flag.
4. Federation wire protocol bumped to V5: `SearchRequest.room` and `SearchResponse.room` fields removed; pre-V5 peers receive a clear protocol-version error. The 5 existing rooms migrate to a flat namespace via `wellinformed migrate v5` (one-shot, idempotent, lossless except the room field is dropped onto an optional `workspace` derived heuristically or null).

## Phase Summary

| Phase | Name | Requirements | Success Criteria |
|-------|------|-------------|------------------|
| 15 | Peer Foundation + Security | PEER-01..05, SEC-01..06 (11) | 4 |
| 16 | Room Sharing (Y.js CRDT) | SHARE-01..06 (6) | 4 |
| 17 | Federated Search + Discovery | FED-01..05, DISC-01..04 (9) | 4 |
| 18 | Production Networking | NET-01..04 (4) | 4 |
| 19 | Structured Codebase Indexing | CODE-01..08 (8) | 4 |
| 20 | Session Persistence | SESS-01..08 (8) | 4 |
| 24 | Delete Rooms (V5 break) | ROOMS-DEL-01..08 (8) | 4 |
| **Total** | | **46** | **24** |

---
*Roadmap created: 2026-04-12 (Phase 19 added 2026-04-12 after Phase 18 kickoff; Phase 20 planned 2026-04-12; Phase 24 planned 2026-05-27)*
