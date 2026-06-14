---
gsd_state_version: 1.0
milestone: v3.0
milestone_name: Folklore Launch
status: not_started
last_updated: "2026-06-15T00:30:00.000Z"
progress:
  total_phases: 4
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-15)

**Core value:** Your coding agent answers from your actual research and codebase, not its training data.
**Current focus:** v3.0 Folklore Launch — strip inherited tooling cruft, restructure the repo akashikprotocol-clean, and ship the folk-pop site, merch, and autonomous meme-agent scaffold under the usefolklore org.

## Current Position

Milestone: v3.0 Folklore Launch
Phase: 25 (Cleanup & Repo Restructure) — NOT STARTED
Plan: none yet

Progress: [----------] 0/4 phases · 0 plans complete

### v3.0 Phase Map

| Phase | Name | Requirements | Depends on |
|-------|------|-------------|------------|
| 25 | Cleanup & Repo Restructure | CLEAN-01..06, REPO-01..03 (9) | Phase 24 |
| 26 | Docs & Benchmarks | DOCS-01..03 (3) | Phase 25 |
| 27 | Site Build-Out | SITE-01..05 (5) | Phase 26 |
| 28 | Merch & Meme-Agent | MERCH-01, AGENT-01..02 (3) | Phase 27 |

**Coverage:** 20/20 v3.0 requirements mapped ✓

### Blocked on user (NOT in execution scope)

- higgsfield credit top-up (art animation)
- GitHub org `usefolklore` creation
- Cloudflare auth + usefolklore.com domain purchase
- $LORE token launch on bags.fm
- X API credentials (meme-agent scaffold runs once these exist)

## Session Continuity

- v2.0 closed at Phase 24 (Delete Rooms — V5 wire-protocol break). All prior milestone history preserved in ROADMAP.md and MILESTONES.md.
- Next action: `/gsd:plan-phase 25` to decompose Cleanup & Repo Restructure into wave-friendly plans.
- v3.0 phases are wave-decomposed in ROADMAP.md "Phase Details" — each phase's waves are explicitly marked independent vs. ordered for parallel execution.

## Accumulated Context

### Brand (v3.0)

- Folklore · org usefolklore · palette cream #f4ecd8 / ink #1d1813 / pink #ff4f6d / blue #2b3a8c / yellow #f5b921 / teal #1fae8b
- Fraunces + Geist Mono · hard sticker shadows, misregistered headers
- Deploy: Cloudflare Pages only (`wrangler.toml`, output `site/`)

### Retrieval / benchmarks (carried from v2.0 — feeds DOCS-01 / CLEAN-05)

- **Retrieval SOTA (measured, full BEIR):** Wave 2 hybrid nomic-embed-text-v1.5 + BM25 RRF = 72.30% NDCG@10 on SciFact; 34.11% on NFCorpus. Within ~2 points of bge-base-en-v1.5 at our 137M param budget.
- Wave 3 reranker (bge-reranker-base) regresses quality on scientific text (−1.92) due to MS-MARCO domain mismatch — avoid.
- Wave 4 room-aware routing gate failed: oracle routing on CQADupStack gives only +0.34 NDCG@10 — rooms are UX/permissions/discovery, not a retrieval signal.
- The retired 96.8% NDCG figure (v1.1) came from a 15-passage × 10-query mini-harness; current honest ceiling is 72.30% on full BEIR SciFact (Wave 2). BENCHMARKS page (DOCS-01) must use the honest numbers.
- Benchmark sources live in BENCH-v2.md + BENCH-COMPETITORS.md; CLEAN-05 consolidates them under `bench/` with repro commands.

### Architecture invariants (carried forward)

- Functional DDD: no classes in domain/app, neverthrow Results. AppError union covers all bounded contexts.
- sequenceLazy thunks for sequential ResultAsync (never eager map — races on shared state).
- PreToolUse hook is the key differentiator for agent integration (the "network-before-web" deny-on-confidence gate).
- Max 3 new deps per phase; hand-roll when a dep is heavier than the function. Verify library picks on ossinsight/gh API, not generic WebSearch.
- At least 3 items in acceptance tests (catches eager-sequence races).
- Git: no claude/anthropic co-authors on commits.

### Post-v2.0 codebase state (restructure operates on this)

- v2.0 deleted the `room` abstraction entirely (Phase 24): `workspace?: string` (read-side) + `private: boolean` (sharing gate), federation wire protocol V5, 13 MCP tools (down from 16). Cleanup/restructure in Phase 25 must not reintroduce room concepts.
- 313/313 tests passed at v2.0 close; REPO-02 holds this zero-regression bar through the restructure.

## Decisions (v3.0)

- v3.0 phasing: foundational Cleanup & Repo Restructure (25) precedes Docs (26) → Site (27) → Merch & Agent (28), because docs reference the clean `bench/` + module layout, the site sources docs content, and merch/agent fill the site Store.
- Meme-agent (AGENT-01) is scaffold-only this milestone: full generate → post → append-to-`/store` pipeline runs against mocked/credential-gated X access; no live X post until user supplies X API creds.
- Store section (SITE-04) is structured for live products with link points wired but inert until $LORE launch + merch fulfilment exist (both blocked on user).
