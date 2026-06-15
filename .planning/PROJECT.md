# folklore

## What This Is

An MCP-native skill that gives AI coding agents persistent research memory. Fetches from ArXiv, Hacker News, RSS feeds, GitHub Trending, OSS Insight, and any URL. Indexes your codebase, dependencies, git history, and submodules. 12 MCP tools your agent calls mid-conversation. Rooms partition knowledge by domain. Tunnels detect cross-domain connections. Discovery loop recursively expands sources. Runs locally, no API keys for search.

Works with Claude Code (auto-discovered), Codex, OpenClaw, and any MCP-compatible harness.

## Core Value

Your coding agent answers from your actual research and codebase, not its training data.

## Requirements

### Validated

- ✓ Knowledge graph with rooms, vectors, embeddings — Phase 1
- ✓ Source ingest pipeline (ArXiv, HN, RSS, URL) with dedup — Phase 2
- ✓ MCP server with 12 tools over stdio — Phase 3
- ✓ Room management + init wizard — Phase 4
- ✓ CLI search + report generation — Phase 5
- ✓ Daemon loop + source discovery — Phase 6
- ✓ Project self-indexing (codebase, deps, git, submodules) — Extra
- ✓ OSS Insight + GitHub Trending adapters — Extra
- ✓ Discovery loop agent (recursive source expansion) — Extra
- ✓ `claude install` (PreToolUse hook for automatic graph awareness) — Extra
- ✓ `publish` command (X/Twitter OAuth + thread posting) — Extra
- ✓ Status bar, logo, landing page, README — Extra
- ✓ Peer identity + secrets scanning + share audit (libp2p + 10 regex patterns + SEC-03 field boundary) — Phase 15

### Active

- [ ] Telegram bridge (inbound capture + outbound digests)
- [ ] npm publish (so users can `npx folklore init`)
- [ ] CI/CD (GitHub Actions: test on push, build check, auto-release)
- [ ] More adapters (Reddit, Dev.to, Product Hunt)
- [ ] Graphify visualization (HTML graph + Leiden clustering via Python sidecar)
- [ ] Multi-room tunnel detection in production
- [ ] Obsidian vault export

### Out of Scope

- Mobile app — CLI + MCP is the interface
- Web dashboard — terminal-native, no browser UI beyond the landing page
- Cloud hosting — local-first, no SaaS
- Custom embedding models — all-MiniLM-L6-v2 is sufficient for Phase 1 scope

## Context

- TypeScript + ESM, Node 20+, functional DDD with neverthrow Result monads
- Graphify vendored as submodule (saharbarak/graphify, folklore branch)
- Python 3.10+ venv for graphify sidecar at ~/.folklore/venv
- All runtime state under ~/.folklore/
- 29 commits, 27 tests, 492 nodes in production graph
- Libraries verified via gh API + ossinsight before selection
- taste-skill + copywriting skill installed for design + marketing

## Constraints

- **Architecture**: Functional DDD — no classes in domain/application layers, neverthrow Results
- **Research rule**: Verify all library picks on ossinsight/gh API, not generic WebSearch
- **Deps**: Max 3 new deps per phase, hand-roll when dep is heavier than the function
- **Testing**: At least 3 items in acceptance tests (catches eager-sequence races)
- **Git**: No claude/anthropic co-authors on commits

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| neverthrow over Effect | Lighter, sufficient for our error paths | ✓ Good |
| sqlite-vec over pgvector | Local-first, no server, embeds in the binary | ✓ Good |
| linkedom over jsdom | SSR-optimized, 10x lighter, sufficient for Readability | ✓ Good |
| Hand-rolled chunker over LangChain | 80 LoC vs 21MB dep for one function | ✓ Good |
| Hand-rolled RSS normalizer over feed-parser | 140 LoC vs extra dep, handles ArXiv Atom too | ✓ Good |
| sequenceLazy thunks | Eager ResultAsync map races on shared state | ✓ Good (caught in Phase 2 acceptance test) |
| PreToolUse hook for graph awareness | Makes Claude use the graph automatically, no explicit ask | ✓ Good |

## Current Milestone: v3.0 Folklore Launch

**Goal:** Take the renamed Folklore engine public under the `usefolklore` org with a clean, launch-ready repository and folk-pop product surfaces — strip the inherited tooling cruft, tidy the ML/benchmark code, restructure the repo akashikprotocol-clean, and finish the site, merch, and autonomous meme-agent.

**Target features:**
- Model/repo cleanup: strip ruflo/claude-flow cruft; tidy ML/embedding + benchmark code; clean 3-tier model-routing config
- Clean, org-ready repository structure (src domains, docs, tests, spec, site, examples)
- Docs: BENCHMARKS page (real BEIR/FolkloreBench-F numbers); extend RFCs
- Site (folk-pop, Cloudflare Pages): composition + mobile sweep, Guidebook + Platform Culture sections, real Store
- Merch product designs from the folk art
- Autonomous Twitter meme-agent scaffold (gen → post → site /store)

**Brand:** Folklore · org usefolklore · palette cream #f4ecd8 / ink #1d1813 / pink #ff4f6d / blue #2b3a8c / yellow #f5b921 / teal #1fae8b · Fraunces + Geist Mono · hard sticker shadows, misregistered headers.

**Deploy:** Cloudflare Pages only (`wrangler.toml`, output `site/`).

**Blocked on user (tracked, NOT in execution scope):** higgsfield credit top-up (art animation), GitHub org `usefolklore` creation, Cloudflare auth + usefolklore.com domain, $LORE token launch on bags.fm, X API credentials.

---
*Last updated: 2026-06-15 after milestone v3.0 initialization*
