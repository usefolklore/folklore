---
phase: 26-docs-and-benchmarks
plan: 03
subsystem: docs
tags: [brand, org-profile, readme, repo-split, usefolklore, folk-pop, benchmarks]

# Dependency graph
requires:
  - phase: 25-cleanup-repo-restructure
    provides: docs/REPO-SPLIT.md (written org-split plan) + docs/brand/README.md (brand voice + palette)
  - phase: 26-docs-and-benchmarks (26-01)
    provides: docs/product/BENCHMARKS.md reconciled numbers (72.30% pure-Node / 75.22% Rust sidecar, same SciFact dataset; 17%->1% labelled simulator)
provides:
  - Staged usefolklore org-profile landing README at .github/profile/README.md (folk-pop, product-first, real numbers)
  - REPO-SPLIT.md reconciled to reference the staged profile as source-of-truth shipped to usefolklore/.github at split time
affects: [27-site-build-out, repo-split, org-creation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Org-profile staged in-repo at .github/profile/README.md (NOT .github/README.md) — GitHub renders profile/README.md from the special .github repo as the org landing"
    - "Stage-then-lift: new org-profile content authored once in the monorepo, copied (not git-filter-repo extracted) into usefolklore/.github when the org exists"

key-files:
  created:
    - .github/profile/README.md
  modified:
    - docs/REPO-SPLIT.md

key-decisions:
  - "Profile README leads with the alone-then-compounds product bet, protocol second — mirrors docs/brand/README.md 'the bet' ordering"
  - "Quoted only BENCHMARKS-backed numbers (72.30% pure-Node, 75.22% Rust sidecar same SciFact dataset, 11ms p50, 137M params); omitted the 17%->1% federation figure entirely since it is simulator-only and the landing page prefers omission over a labelled caveat"
  - "Resolved the stale 'do NOT create .github/profile' instruction in REPO-SPLIT.md rather than leaving a contradiction — DOCS-03 now DOES stage the file; kept the blocked-on-org caveat"

patterns-established:
  - "Pattern: org-profile staging — author at .github/profile/README.md, record in REPO-SPLIT.md as ship-to-usefolklore/.github content, defer physical push to org-creation"

requirements-completed: [DOCS-03]

# Metrics
duration: 2min
completed: 2026-06-15
---

# Phase 26 Plan 03: usefolklore org-profile README Summary

**Staged a folk-pop, product-first org-landing README at `.github/profile/README.md` (alone-then-compounds bet, BENCHMARKS-backed numbers, network-before-web gate, closes on "never research twice") and reconciled REPO-SPLIT.md to ship it to `usefolklore/.github` at split time.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-15T06:40:44Z
- **Completed:** 2026-06-15T06:42:19Z
- **Tasks:** 2
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- Authored `.github/profile/README.md` (61 lines) — warm hearth/tales hero, "what it is", "the bet" in the brand's alone-then-compounds order, a proof block of real numbers only, a folk-warm "how it works" (stone-soup framing of the deny-on-confidence gate), a light "where to look" repo pointer, closing on the brand line "never research twice."
- Quoted only BENCHMARKS-page numbers (72.30% pure-Node hybrid, 75.22% Rust sidecar same SciFact dataset, 11 ms p50, 137M params, 13 null attacks); the simulator 17%->1% federation figure was omitted entirely per the landing-page guidance.
- Reconciled `docs/REPO-SPLIT.md`: the `usefolklore/.github` target-repo row and the migration-mechanics subsection now point at the staged `.github/profile/README.md` as the source-of-truth, the stale "do NOT create .github/profile" instruction is resolved, and the blocked-on-org caveat is preserved.

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the staged org-profile README** - `e4bc56c` (docs)
2. **Task 2: Point REPO-SPLIT.md at the staged profile** - `2dd7678` (docs)

**Plan metadata:** committed separately with SUMMARY/STATE/ROADMAP/REQUIREMENTS.

## Files Created/Modified
- `.github/profile/README.md` - Staged usefolklore org-profile landing README (folk-pop, product-first, real numbers, brand line)
- `docs/REPO-SPLIT.md` - Reconciled the `usefolklore/.github` row + migration note to point at the staged profile; resolved the stale "do not create" line; kept blocked-on-org caveat

## Decisions Made
- Led with the product bet (works alone day one, compounds peer-to-peer), protocol second, per docs/brand/README.md ordering.
- Omitted the 17%->1% federation figure rather than labelling it on the landing page — the plan's facts block preferred omission; the acceptance check (no unlabeled simulator claim) passes by absence.
- Quoted both the 72.30% pure-Node and 75.22% Rust-sidecar numbers as the same-SciFact-dataset pair, matching the reconciled BENCHMARKS page (26-01).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The working tree was already heavily dirty (pre-existing uncommitted changes across src/, docs/, tests/, hooks/ from earlier untracked work) before this plan ran. The plan verification's "`git diff --name-only` lists only the two files" cannot hold literally against that backdrop; it was interpreted as "this plan modifies only those two files", which was enforced by surgical staging (`git add` of exactly `.github/profile/README.md` and `docs/REPO-SPLIT.md`). All other dirty files are out of scope per the scope boundary and were left untouched.
- `npx tsc --noEmit` exits 0 (sanity gate green — no source touched).

## User Setup Required
None for this plan. The physical push of `.github/profile/README.md` into `usefolklore/.github` remains blocked on user (GitHub org `usefolklore` creation) — recorded in REPO-SPLIT.md and STATE.md "Blocked on user".

## Next Phase Readiness
- DOCS-03 complete. Phase 26 (Docs & Benchmarks) docs surface is in place for Phase 27 (Site Build-Out), which sources docs/brand + the org-profile voice.
- No blockers introduced. Org creation remains the only deferred dependency for shipping the profile to the live org.

## Self-Check: PASSED

- `.github/profile/README.md` — FOUND
- `docs/REPO-SPLIT.md` — FOUND
- `.planning/phases/26-docs-and-benchmarks/26-03-SUMMARY.md` — FOUND
- Commit `e4bc56c` (Task 1) — FOUND
- Commit `2dd7678` (Task 2) — FOUND

---
*Phase: 26-docs-and-benchmarks*
*Completed: 2026-06-15*
