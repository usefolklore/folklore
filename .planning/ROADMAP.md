# Roadmap: folklore v2.0

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
1. First run generates ed25519 keypair at ~/.folklore/peer-identity.json
2. `peer add <multiaddr>` establishes a js-libp2p connection
3. Secrets scanner detects API keys in test fixtures and blocks them
4. `share audit --room X` shows the metadata that would be shared

## Phase 16: Room Sharing via Y.js CRDT ✓ COMPLETE 2026-04-12

**Goal:** Mark rooms as public, sync nodes across peers via Y.js. Metadata-only replication with incremental sync.

**Requirements:** SHARE-01..06 (live-network UAT deferred to Phase 17/18)

**Plans:** 4/4 complete

Plans:
- [x] 16-01-PLAN.md — Foundation: yjs+y-protocols install, ShareError, share-store, ydoc-store (V1 encoding, atomic writes) — DONE 2026-04-12
- [x] 16-02-PLAN.md — Sync engine: /folklore/share/1.0.0 libp2p protocol, REMOTE_ORIGIN echo prevention, secrets-scanned in/out updates, debounced graph flush — DONE 2026-04-12
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
- [x] 17-02-PLAN.md — Protocol + discovery infra: mDNS/DHT/peer:discovery, /folklore/search/1.0.0, token bucket, runFederatedSearch — DONE 2026-04-12
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
1. `folklore codebase index <path>` parses a TypeScript/JavaScript codebase into `~/.folklore/code-graph.db` with classes, functions, methods, imports, exports
2. `folklore codebase attach <codebase-id> --room <room-id>` attaches a codebase to a research room (M:N)
3. `folklore codebase search <query>` returns code nodes by semantic match across attached codebases
4. New MCP tool `code_graph_query` lets Claude query the structured code graph independently of research rooms

## Phase 20: Session Persistence ✓ COMPLETE 2026-04-13

**Goal:** Auto-persist every Claude Code session's progress into folklore so context survives kills, crashes, and restarts. No explicit user request.

**Requirements:** SESS-01..08 (all complete)

**Plans:** 4/4 complete

Plans:
- [x] 20-01-PLAN.md — Foundation: SessionError 5-variant union, src/domain/sessions.ts (254 lines, pure types + helpers), AppConfig.sessions, SharedRoomRecord.shareable v1→v2 migration — DONE 2026-04-13
- [x] 20-02-PLAN.md — Infrastructure: sessions-state.ts (242 lines, atomic lock+tmp+rename), claude-sessions.ts (368 lines, 3 pitfalls: mtime+env skip, buffered tail, scanNode redaction), SourceKind + registry wiring — DONE 2026-04-13
- [x] 20-03-PLAN.md — Integration: session-ingest + daemon auto-provision + enforceRetention, recent-sessions CLI, 16th MCP tool, share hard-refuse (double defense), PreToolUse SessionStart branch (idempotent), phase17 C2 bumped 15→16 — DONE 2026-04-13
- [x] 20-04-PLAN.md — TDD suite: tests/phase20.sessions.test.ts (686 lines, 13 describe groups, 70 tests, 313/313 full suite pass) + 2 JSONL fixtures — DONE 2026-04-13

**Success criteria:**
1. `~/.claude/projects/<hash>/*.jsonl` files are indexed automatically (via daemon tick) into a dedicated `sessions` room
2. `folklore recent-sessions` CLI command shows last N sessions with duration, tool-call summary, and assistant-message highlights
3. New MCP tool `recent_sessions(hours?, project?)` lets Claude query previous session state from any new session
4. On SessionStart, the PreToolUse hook surfaces a one-paragraph "what the last session was doing" automatically — no explicit ask required

## Phase 24: Delete Rooms — V5 Wire-Protocol Break ✓ COMPLETE 2026-05-27

**Goal:** Delete the `room` abstraction entirely from the codebase. Replace with `workspace?: string` (read-side, local-only) + `private: boolean` (sharing gate). Bump federation wire protocol to V5. The user-facing room concept disappears: no `folklore room` CRUD, no `shared-rooms.json`, no `default_room`, no system rooms (`toolshed`, `research`). Sharing is gated by per-node `private === false`. Reputation flattens from `(peer, room)` to `peer` keys.

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
- [x] 24-11-PLAN.md — Wave 4a: Build `folklore migrate v5` command (idempotent, lossless, --rollback); grow doctor to nag on v4 data; write V5-PROTOCOL.md, deprecate V4-PROTOCOL.md, update peer-reputation-design.md
- [x] 24-12-PLAN.md — Wave 4b: New tests/phase24.rooms-deleted.test.ts (~500 lines, 9 describe groups, 30+ tests); surgical edits to ~12 existing tests; final cutover validation (build + test + tsc)

**Rationale:** Two octopus debates (2026-05-26 + 2026-05-27) converged on deletion. The user opted for "full deletion now" over a staged Phase 1 / Phase 24+ split. The debate synthesis lives at `.planning/debates/rooms-deprecation-2026-05-27/SYNTHESIS.md`. Scope audit ~4,000–4,500 LOC deleted across ~60 files (5 files deleted entirely, 3 major rewrites of share-store.ts + share-sync.ts + mcp/server.ts, ~47 surgical edits, 3 phase tests deleted).

**Success criteria:**
1. `folklore save "x"` from any cwd routes to a workspace-derived graph slice with `private: false` by default; user never sees a room concept.
2. `folklore ask "x"` from a git repo returns nodes filtered by workspace pre-filter; cross-workspace results available with `--workspace all`.
3. `folklore share <peer>` shares all `private === false` nodes; no `--room` flag, no `shared-rooms.json` to maintain. `folklore save --private` sets the flag.
4. Federation wire protocol bumped to V5: `SearchRequest.room` and `SearchResponse.room` fields removed; pre-V5 peers receive a clear protocol-version error. The 5 existing rooms migrate to a flat namespace via `folklore migrate v5` (one-shot, idempotent, lossless except the room field is dropped onto an optional `workspace` derived heuristically or null).

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

---

# Roadmap: folklore v3.0 — Folklore Launch

**Milestone:** v3.0 Folklore Launch
**Phases:** 25-28 (continues from v2.0 which ended at Phase 24)
**Granularity:** standard
**Requirements:** 20 mapped (CLEAN-01..06, REPO-01..03, DOCS-01..03, SITE-01..05, MERCH-01, AGENT-01..02)
**Coverage:** 20/20 ✓

**Milestone goal:** Take the renamed Folklore engine public under the `usefolklore` org with a clean, launch-ready repository and folk-pop product surfaces. Strip inherited tooling cruft, tidy the ML/benchmark code, restructure the repo akashikprotocol-clean, and finish the site, merch, and autonomous meme-agent.

**Out of scope (blocked on user, NOT phased):** higgsfield art animation, GitHub org `usefolklore` creation, Cloudflare auth + usefolklore.com domain purchase, $LORE token launch on bags.fm, live X posting. The meme-agent is scaffold-only — runnable once X creds exist.

## Phases

- [x] **Phase 25: Cleanup & Repo Restructure** - Strip ruflo/claude-flow cruft, tidy ML/bench code, reorganize into org-ready akashikprotocol-clean layout with green build. (completed 2026-06-14)
- [x] **Phase 26: Docs & Benchmarks** - BENCHMARKS page with real numbers, extended RFC set, org profile README. (completed 2026-06-15)
- [x] **Phase 27: Site Build-Out** - Composition + mobile sweep, Guidebook + Platform Culture sections, real Store, Cloudflare Pages build config. (completed 2026-06-15)
- [ ] **Phase 28: Merch & Meme-Agent** - Real merch product designs wired into the Store, autonomous Twitter meme-agent scaffold feeding the site.

## Phase Details

### Phase 25: Cleanup & Repo Restructure
**Goal:** A clean, org-ready codebase with all inherited ruflo/claude-flow tooling cruft removed, ML/embedding/retrieval and benchmark code organized into documented modules, and the repo reorganized into an akashikprotocol-clean layout — with the build green and the full test suite passing.
**Depends on:** Phase 24 (rooms deletion complete — restructure operates on the post-V5 codebase)
**Requirements:** CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-04, CLEAN-05, CLEAN-06, REPO-01, REPO-02, REPO-03
**Plans:** 5/5 plans complete

Plans:
- [ ] 25-01-PLAN.md — Wave 1: Strip claude-flow/ruflo from CLAUDE.md + .claude/settings.json + .mcp.json, fix statusLine, document Folklore hooks (CLEAN-01/02/03/06)
- [ ] 25-02-PLAN.md — Wave 1: Document the ML/embedding + hybrid-retrieval module layout (CLEAN-04)
- [ ] 25-03-PLAN.md — Wave 1: Consolidate benchmark runners under bench/ via git mv + repro README, update docs paths (CLEAN-05)
- [ ] 25-04-PLAN.md — Wave 2: akashikprotocol-clean layout doc + spec/examples surfaces + org-split plan (REPO-01/03)
- [ ] 25-05-PLAN.md — Wave 3: Validation gate — build + lint + full test suite green, cruft-grep + site-intact evidence (REPO-02)
**Wave decomposition (parallel-friendly):**
  - Wave A — Tooling cruft removal: CLAUDE.md ruflo/claude-flow strip (CLEAN-01), `.claude/` hooks+skills prune keeping Folklore's own (CLEAN-02), swarm/hive-mind/MCP reference removal (CLEAN-03), 3-tier routing config clean/remove (CLEAN-06). Independent of code-layout work.
  - Wave B — Code tidy: ML/embedding + hybrid retrieval module layout (CLEAN-04), benchmark consolidation under `bench/` with repro commands (CLEAN-05). Independent of Wave A.
  - Wave C — Restructure (after A+B land): akashikprotocol-clean repo layout (REPO-01), org-boundary split plan: core+cli / spec / site / .github (REPO-03).
  - Wave D — Validation gate (after C): build green + full test suite green, zero regressions (REPO-02).
**Success Criteria** (what must be TRUE):
  1. `grep -ri` for ruflo / claude-flow / swarm / hive-mind over CLAUDE.md + config + docs returns no live config references; only Folklore's own hooks remain in `.claude/` and are documented.
  2. ML/embedding/retrieval code lives in a documented module layout (embedders + hybrid pipeline) and benchmark code lives under a `bench/` structure with copy-paste reproduction commands.
  3. The repo follows an akashikprotocol-clean layout (src domains, docs, tests, spec, site, examples) with a written org-split plan defining folklore core+cli / spec / site / .github boundaries.
  4. `npm run build` succeeds and the full test suite passes with zero regressions after the restructure.

### Phase 26: Docs & Benchmarks
**Goal:** Launch-grade documentation: a BENCHMARKS page presenting real, reproducible numbers; an extended and indexed RFC set; and an org profile README ready for the usefolklore org landing.
**Depends on:** Phase 25 (docs reference the clean module + `bench/` structure and the org-ready boundaries)
**Requirements:** DOCS-01, DOCS-02, DOCS-03
**Plans:** 3/3 plans complete

Plans:
- [ ] 26-01-PLAN.md — Wave 1: BENCHMARKS page — reconcile 72.30% (pure-Node hybrid headline) vs 75.22%/0.7522 (Rust sidecar, same dataset), keep failures as failures, label FolkloreBench-F 17%→1% a simulator figure, repro command behind every claim (DOCS-01)
- [ ] 26-02-PLAN.md — Wave 1: Author RFC-0002 (deny-on-confidence gate, deployed defaults 0.85/2/off) + refresh the RFC index (DOCS-02)
- [ ] 26-03-PLAN.md — Wave 1: Stage the usefolklore org-profile README at .github/profile/README.md (folk-pop, product-first, real numbers) + point REPO-SPLIT.md at it (DOCS-03)
**Wave decomposition (parallel-friendly):**
  - Wave A — BENCHMARKS page: real BEIR SciFact NDCG, Wave-2 hybrid, FolkloreBench-F (17%→1%) with method + repro commands (DOCS-01). Sources numbers from BENCH-v2.md + the consolidated `bench/`.
  - Wave B — RFCs: extend RFC set (RFC-0002+) and refresh the RFC index (DOCS-02). Independent of Wave A.
  - Wave C — Org profile: author `.github/profile` README for the usefolklore org landing (DOCS-03). Independent of A+B.
**Success Criteria** (what must be TRUE):
  1. A BENCHMARKS page shows real BEIR SciFact NDCG, Wave-2 hybrid, and FolkloreBench-F (17%→1%) numbers, each with stated method and runnable reproduction commands.
  2. The RFC set is extended (RFC-0002 or later as needed) and the RFC index lists every current RFC.
  3. An org profile README exists at `.github/profile` suitable for the usefolklore org landing page.

### Phase 27: Site Build-Out
**Goal:** The folk-pop site is composition-tightened and mobile-clean across all sections, with a Guidebook section, a Platform Culture section, a real Store section structured for live products, and a verified-buildable Cloudflare Pages config.
**Depends on:** Phase 26 (Guidebook/benchmarks content sourced from docs; Store structure shared with Phase 28 merch + agent)
**Requirements:** SITE-01, SITE-02, SITE-03, SITE-04, SITE-05
**Plans:** 5/5 plans complete

Plans:
- [ ] 27-01-PLAN.md — Wave 1: Guidebook section (install / hooks / ask / peer) in the folk-pop section system + navbar link (SITE-02)
- [ ] 27-02-PLAN.md — Wave 2: Platform Culture section (the lore / the commons / the folk) + navbar link (SITE-03)
- [ ] 27-03-PLAN.md — Wave 3: Real Store — product cards (tee/sticker/pin) with price placeholders + inert buy CTAs + $LORE bags.fm block w/ "not financial advice" (SITE-04)
- [ ] 27-04-PLAN.md — Wave 4: Composition pass + 390px mobile sweep across ALL sections (incl. the three new ones), headless-screenshot verified (SITE-01)
- [x] 27-05-PLAN.md — Wave 1: Verify Cloudflare Pages config (wrangler.toml output=site/, _headers, no Vercel remnants, local static serve) — no deploy (SITE-05)

**Sequencing note:** nearly every plan edits the single file `site/index.html`, so the index.html-editing plans are serialized one-per-wave (27-01 → 27-02 → 27-03 → 27-04) to prevent concurrent-edit collisions; 27-05 (config/verify, does NOT touch index.html) runs in Wave 1 parallel with 27-01. SITE-01 (sweep) runs LAST so the new sections are swept too.

**Wave decomposition (original parallel-friendly intent — superseded by the single-file serialization above):**
  - Wave A — Content sections: Guidebook (how Folklore works / get started) (SITE-02), Platform Culture (the lore, the commons, the folk) (SITE-03). Two independent section builds.
  - Wave B — Store scaffold: real Store section structured for live products (merch + $LORE placeholders wired for later live links) (SITE-04).
  - Wave C — Composition + responsive sweep (after sections exist): composition pass + 390px mobile sweep, no overflow, clean stacking across all sections (SITE-01).
  - Wave D — Deploy config: `wrangler.toml` + `_headers` verified buildable; actual deploy stays blocked on user auth/domain (SITE-05).
**Success Criteria** (what must be TRUE):
  1. The site renders cleanly at 390px across all sections — no horizontal overflow, content stacks correctly — and the composition pass is applied.
  2. A Guidebook section explains how Folklore works and how to get started; a Platform Culture section presents the lore, the commons, and the folk.
  3. A Store section exists structured to hold live products ($LORE + merch), with link points wired for the blocked-on-user launch.
  4. `wrangler.toml` and `_headers` are present and the site builds locally with the Cloudflare Pages build command (deploy itself deferred to user auth/domain).

### Phase 28: Merch & Meme-Agent
**Goal:** Real merch product designs derived from the folk art are wired into the Store, and an autonomous Twitter meme-agent is scaffolded end-to-end (generate → post → append to site `/store`) so it runs the moment X credentials exist, with the site consuming its output.
**Depends on:** Phase 27 (merch fills the Store section; the agent appends to the site `/store` data file the site reads)
**Requirements:** MERCH-01, AGENT-01, AGENT-02
**Wave decomposition (parallel-friendly):**
  - Wave A — Merch designs: real product designs/mockups (tee, stickers, pin) from the folk art, wired into the Store (MERCH-01). Independent of agent code.
  - Wave B — Meme-agent scaffold: pipeline that generates a folk-pop meme, posts to X, and appends to site `/store` — credential-gated, runnable once X creds exist, no live posting in this milestone (AGENT-01).
  - Wave C — Site integration (after B's data contract is defined): site `/store` (or memes) reads the agent-output data file (AGENT-02). Shares the data file shape with Wave B.
**Success Criteria** (what must be TRUE):
  1. Real product designs/mockups for a tee, stickers, and a pin exist (derived from the folk art) and appear in the Store section.
  2. An autonomous meme-agent scaffold runs the full generate → post → append-to-`/store` pipeline against mocked/credential-gated X access — no live X post is made — and is documented as runnable once X creds exist.
  3. The site `/store` (or memes view) consumes the agent's output data file, so generated memes surface on the site without manual edits.

## Phase Progress (v3.0)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 25. Cleanup & Repo Restructure | 5/5 | Complete    | 2026-06-14 |
| 26. Docs & Benchmarks | 3/3 | Complete    | 2026-06-15 |
| 27. Site Build-Out | 5/5 | Complete   | 2026-06-15 |
| 28. Merch & Meme-Agent | 0/TBD | Not started | - |

## Phase Summary (v3.0)

| Phase | Name | Requirements | Success Criteria |
|-------|------|-------------|------------------|
| 25 | Cleanup & Repo Restructure | CLEAN-01..06, REPO-01..03 (9) | 4 |
| 26 | Docs & Benchmarks | DOCS-01..03 (3) | 3 |
| 27 | Site Build-Out | SITE-01..05 (5) | 4 |
| 28 | Merch & Meme-Agent | MERCH-01, AGENT-01..02 (3) | 3 |
| **Total (v3.0)** | | **20** | **14** |

---
*v3.0 roadmap created: 2026-06-15 (Phases 25-28, continues from Phase 24)*
