# Phase 25: Cleanup & Repo Restructure - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary

Org-ready codebase: strip inherited ruflo/claude-flow tooling cruft, organize ML/embedding/retrieval + benchmark code into documented modules, reorganize repo into an akashikprotocol-clean layout (src domains, docs, tests, spec, site, examples). Build stays green, full test suite passes. No product behavior changes.
</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices are at Claude's discretion — pure infrastructure phase. Constraints: keep `npm run build` green and full test suite passing (zero regressions); keep the folk-pop site at `site/` intact; do not touch blocked-on-user scope (org creation, Cloudflare auth/domain, $LORE, X creds, higgsfield animation); preserve git history via `git mv` for moves; remove only genuinely unused claude-flow/ruflo tooling, keep Folklore's own hooks (akashik/folklore smart-hook etc.) and document them.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- Functional DDD: src/domain, src/application, src/infrastructure, src/cli, src/daemon, src/mcp (neverthrow Results, no classes in domain/app)
- Embedders + hybrid retrieval already exist (src/infrastructure/embedders.ts, fetch-sync, search-sync)
- Benchmark code in tests/ (bench-folklore-federation.test.ts) + scripts/ (bench-*.mjs) + docs (BENCH-v2.md)
- folklore-rs/ Rust bench crate

### Established Patterns
- ESM + TypeScript, Node 20+, max 3 new deps/phase, hand-roll over heavy deps
- CLAUDE.md currently carries large ruflo/claude-flow V3 sections + .claude has claude-flow hooks/skills mixed with Folklore's own

### Integration Points
- package.json scripts, .claude/settings.json hook paths, tsconfig, test runner
</code_context>

<specifics>
## Specific Ideas

Mirror akashikprotocol's clean separation (spec / core / site / .github). Produce a written org-split plan doc rather than physically splitting repos this phase (physical split happens at push time, blocked on org creation).
</specifics>

<deferred>
## Deferred Ideas

Physical multi-repo split + push (blocked on org). higgsfield animation. Live deploy.
</deferred>
