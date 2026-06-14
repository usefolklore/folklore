# Milestones

## v0.x — Foundation (Phases 0-6 + Extras) ✓

**Shipped:** 2026-04-09 to 2026-04-12

| Phase | Name | Status |
|-------|------|--------|
| 0 | Scaffold | ✓ |
| 1 | Graph + Vectors + Embeddings | ✓ |
| 2 | Source Ingest Pipeline | ✓ |
| 3 | MCP Server | ✓ |
| 4 | Room Management + Init | ✓ |
| 5 | CLI Search + Reports | ✓ |
| 6 | Daemon + Discovery | ✓ |

## v1.0 — Ship-Ready (Phases 7-10 + Extras) ✓

**Shipped:** 2026-04-12

| Phase | Name | Status |
|-------|------|--------|
| 7 | Telegram Bridge | ✓ |
| 8 | Adapter Expansion (19 total) | ✓ |
| 9 | Visualization + Obsidian Export | ✓ |
| 10 | CI/CD + Dockerfile + npm | ✓ |
| Extra | Project self-indexing | ✓ |
| Extra | OSS Insight + GitHub Trending | ✓ |
| Extra | Discovery loop agent | ✓ |
| Extra | `claude install` hooks | ✓ |
| Extra | `publish` X/Twitter | ✓ |
| Extra | deep_search multi-hop | ✓ |
| Extra | Session capture hook | ✓ |
| Extra | Real benchmarks (IR metrics) | ✓ |
| Extra | Status bar + landing page + README | ✓ |

**Last phase number:** 10

## v1.1 — Close Competitive Gaps (Phases 11-14) ✓

**Shipped:** 2026-04-12

| Phase | Name | Status |
|-------|------|--------|
| 11 | Session Management + Biomimetic Memory | ✓ |
| 12 | Multimodal Ingestion (Image+OCR+Audio+PDF) | ✓ |
| 13 | Web Dashboard (vis.js + search + rooms) | ✓ |
| 14 | Real ONNX Benchmarks (96.8% NDCG, 100% R@5)¹ | ✓ |

**Last phase number:** 14

**Stats at close:** 49 commits, 33 tests, 499 nodes, 13 MCP tools, 23 adapters, 96.8% NDCG@10¹

¹ The 96.8% figure was retrospectively retired in v2.0 — it came from a 15-passage × 10-query mini-harness too small to produce a leaderboard-comparable number. The current measured ceiling is **72.30% NDCG@10 on full BEIR SciFact** (Wave 2). See BENCH-v2.md §2 and the v2.0 closing stats below.

## v2.0 — P2P Distributed Knowledge Graph + Codebase + Sessions (Phases 15-20) ✓

**Shipped:** 2026-04-12 to 2026-04-14

| Phase | Name | Status |
|-------|------|--------|
| 15 | Peer Foundation + Security (libp2p ed25519 + 14-pattern secrets scanner) | ✓ |
| 16 | Room Sharing via Y.js CRDT (metadata-only replication, REMOTE_ORIGIN echo prevention) | ✓ |
| 17 | Federated Search + Discovery (mDNS, DHT, 14th MCP tool federated_search) | ✓ |
| 18 | Production Networking (circuit-relay-v2 + dcutr + UPnP NAT, 10-peer mesh in 2.5s) | ✓ |
| 19 | Structured Codebase Indexing (tree-sitter TS+JS+Python, 15th MCP tool code_graph_query) | ✓ |
| 20 | Session Persistence (auto-ingest ~/.claude/projects/*/jsonl, 16th MCP tool recent_sessions) | ✓ |

**Last phase number:** 20

**Stats at close:**
- 313/313 tests pass, zero regressions across all 6 phases
- 16 MCP tools (added federated_search, code_graph_query, recent_sessions to the 13)
- 23 source adapters (no new sources — Phase 20 added a new SourceKind for sessions, not new fetchers)
- 9,800+ nodes in production graph (5 indexed codebases + research room + sessions)
- 6 phases shipped, no scope creep — Phase 19 (codebase indexing) + Phase 20 (sessions) were both inserted mid-milestone in response to live user needs
- v1.x feature regression bar: zero broken (all v1.x tests intact through 6 new phases)

**v2.0 SOTA benchmark closure (4 waves measured on full BEIR datasets):**
| Wave | Pipeline | SciFact NDCG@10 | Verdict |
|------|----------|-----------------|---------|
| Baseline | MiniLM-L6 dense only | 64.82% | v1 baseline |
| Wave 1 | + nomic-embed-text-v1.5 (768d) | 69.98% (+5.16) | ✓ Measured |
| Wave 2 | + SQLite FTS5 BM25 RRF hybrid | **72.30% (+2.32)** | ✓ **Measured CPU-local SOTA** |
| Wave 3 | + bge-reranker-base cross-encoder | 70.38% (−1.92) | ✗ MS-MARCO domain mismatch on sci text |
| Wave 4 | + room-aware oracle routing (CQADupStack gate) | +0.34 oracle Δ | ✗ Null on disjoint-vocab benchmarks |

Wave 2 lands within ~2 NDCG points of `bge-base-en-v1.5` (74.0) at the same parameter budget. Both Wave 3 and Wave 4 failures are documented in BENCH-v2.md §2b and §2c with reproduction commands so future contributors can verify and avoid the same dead ends. The room/tunnel architecture remains valuable for namespace isolation, permissions, and serendipitous cross-room discovery — explicitly NOT a retrieval quality feature.

**Deferred from v2.0 (candidates for v2.1):**
- Production swap: `src/infrastructure/embedders.ts` still defaults to MiniLM. Migrating to nomic+BM25 hybrid in production lifts end-user retrieval by +7.48 NDCG@10 but requires user vectors.db migration (384d → 768d), nomic ONNX download (~550MB), FTS5 BM25 indexing in the hot path. Non-trivial; benchmarked but not shipped.
- DHT internet-wide peer discovery (Phase 17 scoped DHT off-by-default for safety)
- Type-aware call graph via LSP (Phase 19 used tree-sitter syntactic parsing, leaving 70-80% of edges unresolved on bigger codebases)
- Web dashboard for sessions room (Phase 13 dashboard predates Phase 20)

## v2.x — Rooms Deletion (Phase 24) ✓

**Shipped:** 2026-05-27

| Phase | Name | Status |
|-------|------|--------|
| 24 | Delete Rooms — V5 Wire-Protocol Break | ✓ |

**Last phase number:** 24

Room abstraction removed entirely; `workspace?` (read-side) + `private: boolean` (sharing gate); federation wire protocol V5; 13 MCP tools. 313/313 tests pass.

## v3.0 — Folklore Launch (Phases 25-28) — PLANNED

**Planned:** 2026-06-15

| Phase | Name | Requirements | Status |
|-------|------|--------------|--------|
| 25 | Cleanup & Repo Restructure | CLEAN-01..06, REPO-01..03 (9) | Not started |
| 26 | Docs & Benchmarks | DOCS-01..03 (3) | Not started |
| 27 | Site Build-Out | SITE-01..05 (5) | Not started |
| 28 | Merch & Meme-Agent | MERCH-01, AGENT-01..02 (3) | Not started |

**Last phase number:** 28
**Coverage:** 20/20 v3.0 requirements mapped ✓

**Goal:** Take the renamed Folklore engine public under the `usefolklore` org — clean launch-ready repo + folk-pop product surfaces (site, merch, autonomous meme-agent scaffold).

**Blocked on user (NOT phased):** higgsfield animation, GitHub org creation, Cloudflare auth/domain purchase, $LORE token launch, live X posting.
