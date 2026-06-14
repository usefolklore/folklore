---
phase: 25-cleanup-repo-restructure
plan: 02
subsystem: docs
tags: [retrieval, embeddings, hybrid-search, rrf, rerank, ddd, documentation]

# Dependency graph
requires:
  - phase: 24-rooms-deletion
    provides: "V5 wire protocol + workspace/private model the retrieval modules now operate under"
provides:
  - "Authoritative retrieval module map (docs/architecture/RETRIEVAL-MODULES.md)"
  - "In-tree infrastructure layer index (src/infrastructure/README.md)"
affects: [26-docs-benchmarks, docs, retrieval]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Document-the-layout (not move-the-code) approach to module organization under a zero-regression test bar"

key-files:
  created:
    - docs/architecture/RETRIEVAL-MODULES.md
    - src/infrastructure/README.md
  modified: []

key-decisions:
  - "Satisfy CLEAN-04 'documented module layout' with an authoritative layout doc + in-tree index rather than physically moving files, to avoid a risky import rewrite across ~80 test files for zero behavioral gain"
  - "RRF fusion is documented as living in src/domain/vectors.ts (rrfFuse), not a separate multi-rrf file — verified against disk"
  - "Rerank tiering is the pure src/domain/rerank-tier.ts (pickRerankTier) driven by the src/infrastructure/hw-detect.ts probe"

patterns-established:
  - "Module-map docs cite only paths verified present on disk (stale-path verify loop in the plan)"

requirements-completed: [CLEAN-04]

# Metrics
duration: 12min
completed: 2026-06-15
---

# Phase 25 Plan 02: Retrieval Module Layout Summary

**The ML/embedding/retrieval code now has a documented module layout — an authoritative map of the embedders + dense/lexical/RRF/rerank pipeline plus an in-tree infrastructure index — with zero source moves and a green build.**

## Performance

- **Duration:** ~12 min
- **Tasks:** 2 completed
- **Files created:** 2
- **Files modified (source):** 0

## Accomplishments
- Authored `docs/architecture/RETRIEVAL-MODULES.md` (186 lines): layering overview, embedding layer, the hybrid pipeline with an ASCII flow diagram (dense + lexical → RRF → optional rerank → optional graph PPR re-rank), the `hw-detect`-driven rerank tiering, the measured ceilings/regressions, and a file/layer/role module table.
- Added `src/infrastructure/README.md`: groups the IO layer into four clusters (retrieval/embedding, P2P/federation, code-graph, storage/misc) and points the retrieval cluster at the authoritative map.
- Every `src/...ts` path cited in both docs was verified to exist on disk; `npx tsc --noEmit` still exits 0.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author the authoritative retrieval module map** - `8a3d850` (docs)
2. **Task 2: Add an in-tree index pointing at the module map** - `7a6618e` (docs)

## Files Created/Modified
- `docs/architecture/RETRIEVAL-MODULES.md` - Authoritative ML/embedding + hybrid-retrieval module map with pipeline flow and measured ceilings.
- `src/infrastructure/README.md` - In-tree index of the infrastructure layer, cross-linking the retrieval cluster to the module map.

## Verification
- Both docs exist; no stale `src/*.ts` paths cited (verify loop exits 0).
- No source/import changes: only the two new `.md` files were staged/committed by this plan.
- Build still green: `npx tsc --noEmit` exits 0.
- Acceptance greps pass: `embedders.ts`, `vector-index.ts`, `cross-encoder.ts`, `rust-retrieval.ts`, `RRF`, `72.30`, `hw-detect` all present in the map; `RETRIEVAL-MODULES` + four cluster names present in the README.

## Deviations from Plan
- **[Naming]** The plan facts used the legacy "Folklore" / `multi-rrf` shorthand. Verified against disk: RRF fusion is `rrfFuse` in `src/domain/vectors.ts` (no `multi-rrf` file), and the project's current name is Folklore — the docs use the confirmed real module names and project name. No source paths cited that do not exist.
- Otherwise the plan executed as written.

## Self-Check: PASSED
- FOUND: docs/architecture/RETRIEVAL-MODULES.md
- FOUND: src/infrastructure/README.md
- FOUND: commit 8a3d850
- FOUND: commit 7a6618e
