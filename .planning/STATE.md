---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: milestone
status: unknown
last_updated: "2026-06-15T06:42:18Z"
progress:
  total_phases: 7
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
---

# State

## Project Reference

See: .planning/PROJECT.md (updated 2026-06-15)

**Core value:** Your coding agent answers from your actual research and codebase, not its training data.
**Current focus:** Phase 26 — Docs & Benchmarks (in progress; 26-01 BENCHMARKS page executed, DOCS-01 satisfied)

## Current Position

Phase: 25 (Cleanup & Repo Restructure) — COMPLETE (5/5 plans)
Plan: 5 of 5 complete (25-01: claude-flow cruft stripped from CLAUDE.md/settings.json/.mcp.json, Folklore hooks documented; CLEAN-01/02/03/06 satisfied. 25-02: retrieval module layout documented; CLEAN-04 satisfied. 25-03: 29 standalone benchmark runners consolidated under bench/ with repro README, docs repointed; CLEAN-05 satisfied. 25-04: akashikprotocol-clean layout map (docs/architecture/REPO-LAYOUT.md) + spec/ and examples/ surfaces + written usefolklore org-split plan (docs/REPO-SPLIT.md) + README repo map; REPO-01/REPO-03 satisfied, zero source moves, tsc green. 25-05: validation gate — build exit 0, lint exit 0, full suite 942 pass / 0 fail (zero regressions), config-surface cruft grep clean, site untouched; REPO-02 satisfied. Evidence: 25-VALIDATION.md)

Phase 26 (Docs & Benchmarks) IN PROGRESS — 3 plans, 1 wave (all docs independent, disjoint files → fully parallel):
- 26-01 (DOCS-01): BENCHMARKS page — DONE (commits fab1843, cff009d). Added a "Which number is the headline" block reconciling the honest pure-Node 72.30% SciFact NDCG@10 (Wave 2: nomic-embed-text-v1.5 dense + BM25 FTS5 hybrid, RRF k=60) against the optional Rust bge-base sidecar's 75.22% = the site's 0.7522 LED (same dataset, same hybrid fusion). Added a "Federation web-fallback (simulator)" block labeling the FolkloreBench-F 17%→1% web_fallback_rate as illustrative simulator output (whitepaper §7.2: demonstration, not validated evidence; partly true by construction under v1 boolean retrieval). Wave-3 reranker (−1.92) / Wave-4 routing (+0.34 null) kept as failures; repro command behind every claim, all gated behind `npm run build`. Numbers cross-checked against bench/README.md, RETRIEVAL-MODULES.md §5, and the whitepaper — nothing invented. tsc green; only docs/product/BENCHMARKS.md touched. SUMMARY: .planning/phases/26-docs-and-benchmarks/26-01-SUMMARY.md.
- 26-02 (DOCS-02): author RFC-0002 (deny-on-confidence gate, deployed defaults 0.85/2/off-by-default) + refresh docs/rfc/README.md index. (executed in this wave — see commit log)
- 26-03 (DOCS-03): stage usefolklore org-profile README at .github/profile/README.md (folk-pop, product-first, real numbers) + point docs/REPO-SPLIT.md at it. (executed in this wave — see commit log)

Doc-only phase: no source changes, `npx tsc --noEmit` stays 0. Conventional commits, no AI co-authors.

Next action: validate Phase 26 completion (all 3 plan SUMMARYs present), then `/gsd:plan-phase 27` (Site Build-Out).

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

- DOCS-01 (26-01): the single honest BENCHMARKS headline is 72.30% SciFact NDCG@10 (Wave 2 pure-Node hybrid) because it reproduces from a fresh clone with zero extra build steps and is the canonical figure in bench/README.md. The 75.22%/0.7522 figure (= the site's LED) is reconciled in prose as the SAME SciFact dataset + same hybrid RRF fusion on the optional Rust bge-base sidecar — not a separate claim. FolkloreBench-F's 17%→1% web-fallback decay is labeled a SIMULATOR figure mirroring whitepaper §7.2 ("demonstration, not validated evidence; partly true by construction under v1 boolean retrieval"). Wave-3/Wave-4 nulls kept as failures; existing ASCII box, leaderboard table, and 13-null-attacks table left intact. All numbers cross-checked against three in-repo sources; nothing invented; no source/site files touched; tsc green.
- v3.0 phasing: foundational Cleanup & Repo Restructure (25) precedes Docs (26) → Site (27) → Merch & Agent (28), because docs reference the clean `bench/` + module layout, the site sources docs content, and merch/agent fill the site Store.
- Meme-agent (AGENT-01) is scaffold-only this milestone: full generate → post → append-to-`/store` pipeline runs against mocked/credential-gated X access; no live X post until user supplies X API creds.
- Store section (SITE-04) is structured for live products with link points wired but inert until $LORE launch + merch fulfilment exist (both blocked on user).
- CLEAN-04 (25-02): satisfied "documented module layout" with an authoritative map (docs/architecture/RETRIEVAL-MODULES.md) + in-tree index (src/infrastructure/README.md) rather than physically moving source files — a file reshuffle would force an import rewrite across ~80 test files, endangering the zero-regression bar for no behavioral gain.
- CLEAN-01/02/03/06 (25-01): the new CLAUDE.md does NOT re-list the generic-good behavioural rules from the deleted claude-flow block — the authoritative conventions live in PROJECT.md + STATE.md "Architecture invariants", so CLAUDE.md just points there. statusLine was collapsed to the single helper that exists on disk (ak-statusline.cjs). CLEAN-06 documented by recording the removed 3-tier router and pointing to the real hw-detect rerank hardware-tier picker in .claude/README.md.
- SECURITY follow-up (25-01): untracked-but-present .claude/settings.local.json holds a live HCLOUD_TOKEN + stale claude-flow enabledMcpjsonServers entry. Gitignored (won't ship) but token should be rotated before public launch.
- REPO-01/REPO-03 (25-04): satisfied the akashikprotocol-clean layout by documenting it (docs/architecture/REPO-LAYOUT.md) and adding the two missing surfaces (spec/README.md as a thin index into docs/rfc + V5-PROTOCOL; examples/README.md with CLI commands verified against `folklore help`) rather than moving src/ — a source reshuffle would break tsconfig rootDir + ~85 test files of relative imports for zero behavioral gain (same precedent as CLEAN-04). The org split (docs/REPO-SPLIT.md) is a written plan only: physical multi-repo extraction (usefolklore core+cli/spec/site/.github) is deferred until the org exists (blocked on user); the doc records the exact git filter-repo boundaries so the split is mechanical later.
- REPO-02 (25-05): phase-25 validation gate is green — `npm run build` exit 0, `npm run lint` exit 0, `npm test` 942 pass / 0 fail (951 total, 9 skipped) matching the planning-time baseline, so the cleanup + restructure introduced zero regressions. Cruft grep over the live config surface (CLAUDE.md/.claude/settings.json/.mcp.json) is clean — the only hits are the documented-removal sentences in .claude/README.md. Site is untouched (it is entirely untracked; no phase-25 commit touched it; index.html + assets/gen present). Evidence: 25-VALIDATION.md. Phase 25 closed.
- CLEAN-05 (25-03): 29 standalone benchmark runners moved scripts/ → bench/ (24 via git mv preserving history, 5 untracked via mv+add) with a copy-paste repro README. No import edits needed — scripts/ and bench/ are repo-root siblings so `../dist/` resolves identically (verified by smoke import + full 942-test pass). Frozen docs/research/octopus-discover/ audit captures left unedited (dated historical records, not live repro paths).
