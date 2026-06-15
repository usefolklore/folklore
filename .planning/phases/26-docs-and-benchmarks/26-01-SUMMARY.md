---
phase: 26-docs-and-benchmarks
plan: 01
subsystem: docs
tags: [benchmarks, beir, scifact, ndcg, retrieval, federation-simulator, honesty-audit]

# Dependency graph
requires:
  - phase: 25-cleanup-and-repo-restructure
    provides: "consolidated bench/ runners + repro README (CLEAN-05), RETRIEVAL-MODULES.md module map (CLEAN-04)"
provides:
  - "Reconciled, honesty-audited docs/product/BENCHMARKS.md"
  - "Explicit 'Which number is the headline' block: 72.30% pure-Node vs 75.22%/0.7522 Rust, same SciFact dataset"
  - "FolkloreBench-F 17%->1% federation figure labeled a SIMULATOR result, not a production measurement"
affects: [27-site-build-out]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Honesty audit: every headline number reconciled to one canonical source (bench/README.md) + a copy-paste bench/ repro command behind each claim"

key-files:
  created:
    - .planning/phases/26-docs-and-benchmarks/26-01-SUMMARY.md
  modified:
    - docs/product/BENCHMARKS.md

key-decisions:
  - "72.30% (Wave 2 pure-Node hybrid) is the honest headline; 75.22%/0.7522 (Phase-25 Rust bge-base sidecar) is the same SciFact dataset + same hybrid fusion on a heavier embedder = the site's LED. Reconciled in prose, both ASCII box and leaderboard table left intact."
  - "FolkloreBench-F 17%->1% is presented as illustrative simulator output, mirroring whitepaper §7.2 ('demonstration, not validated evidence; partly true by construction under v1 boolean retrieval'). Worded so it cannot be mistaken for a live production measurement."

patterns-established:
  - "Reconciliation block placed immediately after the progression box, before existing detail tables — adds clarity without replacing existing evidence."

requirements-completed: [DOCS-01]

# Metrics
duration: 2min
completed: 2026-06-15
---

# Phase 26 Plan 01: BENCHMARKS page — honesty audit & headline reconciliation Summary

**docs/product/BENCHMARKS.md now states one explicit honest headline (72.30% pure-Node SciFact NDCG@10), reconciles it with the 75.22%/0.7522 Rust-sidecar tier on the same dataset, and labels the FolkloreBench-F 17%->1% federation figure as a simulator result — each backed by a copy-paste bench/ repro command.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-15T06:40:26Z
- **Completed:** 2026-06-15T06:42:18Z
- **Tasks:** 2
- **Files modified:** 1 (docs/product/BENCHMARKS.md)

## Accomplishments
- Added a `### Which number is the headline` block: 72.30% is the pure-Node, CPU-only, zero-extra-build-step headline (Wave 2: nomic-embed-text-v1.5 dense + BM25 FTS5 hybrid, RRF k=60); 75.22%/0.7522 is the optional Rust bge-base sidecar on the same SciFact corpus and same hybrid fusion (= the site's LED). Retired 96.8% mini-harness figure flagged not-comparable and unused.
- Added a `### Federation web-fallback (simulator)` block: the 17%->1% web_fallback_rate figure is now explicitly an illustrative federation-simulator output (10 peers, 20% offline churn, Zipfian demand), citing whitepaper §7.2's "demonstration, not validated evidence" framing.
- Confirmed the documented failures stay failures: Wave-3 reranker (-1.92) and Wave-4 routing (+0.34, null) remain in the 13-null-attacks table with intact "Documented null > hypothetical positive" framing; repro commands for both already present.
- Verified repro coverage: Wave-2 hybrid, Phase-25 Rust, Wave-3 rerank null, Wave-4 routing null, and the value-model trio (compounding / subgraph-transfer / value-model) all have copy-paste bench/ commands; `npm run build` gate noted once.

## Task Commits

Each task was committed atomically (no AI co-authors):

1. **Task 1: Add headline reconciliation block** - `fab1843` (docs)
2. **Task 2: Label FolkloreBench-F as simulator + audit failures/repro coverage** - `cff009d` (docs)

## Files Created/Modified
- `docs/product/BENCHMARKS.md` - Added headline reconciliation block (Task 1, +35 lines) and federation-simulator block (Task 2, +17 lines). All existing content (progression box, leaderboard table, 13-null-attacks table, value-model section, Reproduce block) left intact.
- `.planning/phases/26-docs-and-benchmarks/26-01-SUMMARY.md` - This summary.

## Decisions Made
- 72.30% chosen as the single honest headline because it is what a fresh clone reproduces with zero extra build steps and is the canonical figure in bench/README.md "Honest headline number"; 75.22%/0.7522 reconciled as the same dataset + fusion on the optional Rust embedder.
- FolkloreBench-F framing mirrors the whitepaper rather than inventing new wording — keeps the docs internally consistent and preserves the "true by construction under v1 boolean retrieval" caveat.

## Deviations from Plan

None - plan executed exactly as written.

All numbers were cross-checked against three independent in-repo sources before any edit (bench/README.md "Honest headline number", docs/architecture/RETRIEVAL-MODULES.md §5, docs/whitepaper.html §7.2/Figure 2) and found mutually consistent with the plan's `<facts>` block. No number was invented or rounded differently. No source or site files were touched.

## Issues Encountered
- The session clock advanced one day mid-run (2026-06-14 -> 2026-06-15), so a naive epoch-diff duration computed ~181 min; actual wall time was ~2 min. Recorded the real duration.
- `git diff --name-only` reports a large set of files because the working tree was already dirty before this session began (pre-existing uncommitted changes, out of scope per the scope boundary). Verified my edits were isolated to docs/product/BENCHMARKS.md and staged only that file for each commit.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DOCS-01 satisfied: the BENCHMARKS page is launch-honest and reconciled. Phase 27 (Site Build-Out) can source these numbers — the site's `0.7522` LED is now explained on the page.
- tsc green (exit 0); no source touched.

## Self-Check: PASSED

- FOUND: docs/product/BENCHMARKS.md
- FOUND: .planning/phases/26-docs-and-benchmarks/26-01-SUMMARY.md
- FOUND commit: fab1843 (Task 1)
- FOUND commit: cff009d (Task 2)

---
*Phase: 26-docs-and-benchmarks*
*Completed: 2026-06-15*
