---
phase: 25-cleanup-repo-restructure
plan: 04
subsystem: docs
tags: [repo-structure, layout, org-split, spec-surface, examples, ddd, documentation]

# Dependency graph
requires:
  - phase: 25-cleanup-repo-restructure
    provides: "25-03 consolidated bench/ dir + 25-02 RETRIEVAL-MODULES.md that the layout doc references"
provides:
  - "Authoritative akashikprotocol-clean repo layout map (docs/architecture/REPO-LAYOUT.md)"
  - "Written org-boundary split plan (docs/REPO-SPLIT.md) — usefolklore core+cli/spec/site/.github"
  - "Spec surface (spec/README.md) indexing docs/rfc + docs/protocol + V5-PROTOCOL"
  - "Examples surface (examples/README.md) with verified runnable folklore CLI usage"
  - "README top-level Repository layout section linking the layout + split docs"
affects: [25-05-validation-gate, 26-docs-benchmarks, docs]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Document-the-layout + add-thin-surfaces (no mass file move) under a zero-regression test bar"
    - "Org split authored as a deferred plan (git filter-repo boundaries) rather than executed, since org creation is blocked on user"

key-files:
  created:
    - spec/README.md
    - examples/README.md
    - docs/architecture/REPO-LAYOUT.md
    - docs/REPO-SPLIT.md
  modified:
    - README.md

key-decisions:
  - "Satisfied REPO-01 with a documented layout + two thin new surfaces (spec/, examples/) instead of moving src/ — a file reshuffle would break tsconfig rootDir + ~85 test files of relative imports for zero behavioral gain"
  - "spec/ is a thin index pointing at the real protocol docs (docs/rfc, docs/protocol, V5-PROTOCOL), not a copy — keeps a single source of truth and a clean boundary for a future folklore-spec repo"
  - "examples/README.md commands were each verified against `node bin/folklore.js help` before writing — no invented subcommands"
  - "REPO-03 is a written plan only: physical multi-repo split is deferred until the usefolklore org exists (blocked on user); the doc enforces boundaries logically meanwhile"

patterns-established:
  - "Layout/split docs cite only directories verified present on disk (verify loop exits 0); the one .github/profile mention explicitly states it does NOT exist (Phase 26 / DOCS-03)"

requirements-completed: [REPO-01, REPO-03]

# Metrics
duration: 4min
completed: 2026-06-15
---

# Phase 25 Plan 04: Repo Layout + Org-Split Plan Summary

**The repo now has an authoritative akashikprotocol-clean layout map plus the two missing surfaces (spec/, examples/) and a written usefolklore org-split plan — all documentation, zero source moves, build green.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-14T22:09:46Z
- **Completed:** 2026-06-14T22:13:22Z
- **Tasks:** 3
- **Files modified:** 5 (4 created + README updated)

## Accomplishments
- Created the **spec surface** (`spec/README.md`): a thin discoverable index into `docs/rfc/` (RFC process + RFC-0001), `docs/protocol/`, and the current `docs/architecture/V5-PROTOCOL.md`, with reading order and the RFC change process.
- Created the **examples surface** (`examples/README.md`): five copy-paste runnable examples (`codebase index/list/search`, `ask`, `ask --peers`, `save --type synthesis`, `claude install`) — every subcommand verified against `node bin/folklore.js help`.
- Authored **`docs/architecture/REPO-LAYOUT.md`** (93 lines): top-level tree + per-directory role table + a "design principles" section, identifying where the spec + examples surfaces live and referencing the consolidated `bench/` (25-03) and `RETRIEVAL-MODULES.md` (25-02). Every directory cited exists on disk.
- Authored **`docs/REPO-SPLIT.md`** (77 lines): the usefolklore org-boundary plan — four target repos (`folklore`, `folklore-spec`, `folklore-site`, `.github`), per-repo `git filter-repo` mechanics, submodule routing (`vendor/graphify` → core), cross-repo reference rewrites, and the blocked-on-user note (org creation + Cloudflare deferred).
- Added a **README Repository layout** section (between "The name" and "Contributing") mirroring the top-level tree and linking both `REPO-LAYOUT.md` and `REPO-SPLIT.md`.

## Task Commits

Each task was committed atomically (no AI co-authors):

1. **Task 1: Establish spec + examples surfaces** - `5e7aada` (docs)
2. **Task 2: Author akashikprotocol-clean layout map** - `c20d5ff` (docs)
3. **Task 3: Write org-split plan + README repo map** - `35a131c` (docs)

## Files Created/Modified
- `spec/README.md` - Spec surface: index into docs/rfc + docs/protocol + V5-PROTOCOL.
- `examples/README.md` - Examples surface: five verified runnable folklore CLI examples.
- `docs/architecture/REPO-LAYOUT.md` - Authoritative top-level layout map (tree + role table + design principles).
- `docs/REPO-SPLIT.md` - Written usefolklore org-split plan (deferred physical split).
- `README.md` - Added Repository layout section linking the layout + split docs.

## Decisions Made
- **No source move (REPO-01).** Layout satisfied by documentation + two thin new surfaces, not by relocating `src/`. Moving source would break `tsconfig` rootDir and ~85 test files of relative imports against the zero-regression bar for no behavioral gain — consistent with the 25-02 CLEAN-04 precedent.
- **spec/ as an index, not a copy.** Single source of truth stays in `docs/`; `spec/README.md` just points there and marks the future `folklore-spec` boundary.
- **REPO-03 is a plan, not a split.** The physical multi-repo extraction is deferred until the `usefolklore` org exists (blocked on user). The doc specifies the exact `git filter-repo` boundaries so the eventual split is mechanical.

## Deviations from Plan

None - plan executed exactly as written. All three tasks' acceptance criteria and the plan-level verification passed without auto-fixes.

## Issues Encountered
- The working tree was already dirty before this plan with an in-progress akashik→folklore rebrand (modified `src/**` and an untracked `site/`, carried over from earlier 25-0x work). The `git diff README.md` against the committed baseline therefore shows rebrand deletions alongside my additions, but `git diff --cached -- src/ site/` confirms **none** of my three commits staged any `src/` or `site/` file — my commits touched only the 5 intended files (`spec/README.md`, `examples/README.md`, `docs/architecture/REPO-LAYOUT.md`, `docs/REPO-SPLIT.md`, `README.md`). The pre-existing churn is out of scope and untouched.

## User Setup Required
None - no external service configuration required.

(Note: the *physical* org split in docs/REPO-SPLIT.md is blocked on the user creating the `usefolklore` GitHub org and Cloudflare/domain setup — but those are out-of-scope items deferred to a later milestone, not setup required to complete this plan.)

## Next Phase Readiness
- REPO-01 + REPO-03 satisfied; 25-05's validation gate can confirm the full `npm test` pass count and `tsc --noEmit` (already exits 0 here).
- The layout + split docs give Phase 26 (Docs & Benchmarks) and the eventual org-split a precise reference.
- `tsc --noEmit` exits 0; `site/` untouched; no `src/` file moved by this plan.

## Verification
- `spec/`, `examples/` surfaces exist with real content; `docs/architecture/REPO-LAYOUT.md` (93 lines) + `docs/REPO-SPLIT.md` (77 lines) exist.
- Every directory named in REPO-LAYOUT.md exists on disk (verify loop exits 0); the lone `.github/profile` mention states it does not exist.
- README links both `docs/architecture/REPO-LAYOUT.md` and `docs/REPO-SPLIT.md` and gained a top-level layout section.
- No `src/` file moved, no `site/` file touched by my commits: `git diff --cached -- src/ site/` across the three commits is empty.
- `npx tsc --noEmit` exits 0.

## Self-Check: PASSED
- FOUND: spec/README.md
- FOUND: examples/README.md
- FOUND: docs/architecture/REPO-LAYOUT.md
- FOUND: docs/REPO-SPLIT.md
- FOUND: commit 5e7aada
- FOUND: commit c20d5ff
- FOUND: commit 35a131c

---
*Phase: 25-cleanup-repo-restructure*
*Completed: 2026-06-15*
