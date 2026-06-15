---
phase: 26-docs-and-benchmarks
plan: 02
subsystem: docs
tags: [rfc, deny-on-confidence, network-before-web, pretooluse-hook, folklore]

# Dependency graph
requires:
  - phase: 25-cleanup-and-repo-restructure
    provides: clean docs/rfc/ surface (RFC-0001 core spec, README index + template)
provides:
  - RFC-0002 documenting the deny-on-confidence gate as deployed (0.85 / 2 / off-by-default)
  - docs/rfc/README.md index listing every RFC in the directory (0001 + 0002)
affects: [27-site-build-out, contributor-onboarding]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RFC documents shipped behavior, not speculation — numbers grounded against live code (folklore-smart-hook.cjs)"

key-files:
  created:
    - docs/rfc/0002-deny-on-confidence.md
  modified:
    - docs/rfc/README.md

key-decisions:
  - "Used real FOLKLORE_DENY_* / FOLKLORE_PREFETCH_PEERS env names (verified in folklore-smart-hook.cjs), not the plan's stale AKASHIK_DENY_* facts — guardrail required matching deployed behavior + RFC-0001"
  - "Committed previously-untracked RFC-0001 + README alongside the index refresh so the index links no untracked files"

patterns-established:
  - "Pattern: ground every RFC default against the source that implements it before writing the number"

requirements-completed: [DOCS-02]

# Metrics
duration: 9min
completed: 2026-06-15
---

# Phase 26 Plan 02: Deny-on-Confidence RFC + Index Summary

**RFC-0002 documents the network-before-web deny gate as it actually ships (satisfaction ≥ 0.85, ≥ 2 hits, decision `use_memory`, off by default, FOLKLORE_DENY_* knobs), and the docs/rfc/ index now lists every RFC.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-06-15
- **Completed:** 2026-06-15
- **Tasks:** 2
- **Files modified:** 3 (1 created, 2 committed/modified)

## Accomplishments
- Authored docs/rfc/0002-deny-on-confidence.md following the README template (Summary, Motivation, Design, Alternatives considered, Open questions — 5 `## ` sections), documenting the PreToolUse gate, the three-condition AND-gate, on-deny injection, on-failure fall-through + PostToolUse auto-save, off-by-default stance, env knobs, and freshness interplay.
- All thresholds grounded against live code: `FOLKLORE_DENY_THRESHOLD ?? 0.85`, `FOLKLORE_DENY_MIN_HITS ?? 2`, and decision verdict `use_memory` verified in `.claude/hooks/folklore-smart-hook.cjs`.
- Refreshed docs/rfc/README.md status table with the RFC-0002 row; RFC-0001 row, process, template, and open-questions list left untouched. No orphan links — every RFC file in the directory is linked.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author RFC-0002 — deny-on-confidence gate** - `9f7e2a1` (docs)
2. **Task 2: Refresh the RFC index** - `74340da` (docs)

## Files Created/Modified
- `docs/rfc/0002-deny-on-confidence.md` - New RFC for the deny-on-confidence gate (created, committed in 9f7e2a1)
- `docs/rfc/README.md` - Status table now lists RFC-0001 + RFC-0002 (committed in 74340da)
- `docs/rfc/0001-folklore-core.md` - Was untracked; committed in 74340da so the index links no untracked file

## Decisions Made
- **Env var names:** The plan's `<facts>` block listed `AKASHIK_DENY_*` knobs, but the deployed codebase (and RFC-0001, CLAUDE.md, ARCHITECTURE.md) use `FOLKLORE_DENY_*` / `FOLKLORE_PREFETCH_PEERS` exclusively. The guardrails required verifying env var names against the codebase and staying consistent with RFC-0001, so RFC-0002 uses the real `FOLKLORE_*` names. Confirmed by grep: zero `AKASHIK_*` matches in `.claude/` or `src/`.
- **Defaults grounding:** Each default (0.85, 2, `use_memory`, off-by-default) was read out of `folklore-smart-hook.cjs` rather than copied from the plan, so the RFC matches the shipping binary.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Used real FOLKLORE_* env var names instead of plan's stale AKASHIK_* names**
- **Found during:** Task 1 (Author RFC-0002)
- **Issue:** The plan `<facts>` block specified `AKASHIK_DENY_WEBSEARCH/_THRESHOLD/_MIN_HITS` and `AKASHIK_PREFETCH_PEERS`. These do not exist in the codebase — the deployed hooks use `FOLKLORE_DENY_*` / `FOLKLORE_PREFETCH_PEERS`. Writing the stale names would make the RFC contradict RFC-0001 and document knobs that do nothing.
- **Fix:** Used the real `FOLKLORE_*` env names, verified against `.claude/hooks/folklore-smart-hook.cjs` (`FOLKLORE_DENY_THRESHOLD ?? 0.85`, `FOLKLORE_DENY_MIN_HITS ?? 2`) and RFC-0001's deny semantics.
- **Files modified:** docs/rfc/0002-deny-on-confidence.md
- **Verification:** `grep -rho 'AKASHIK_DENY_[A-Z_]*' .claude/ src/` returns nothing; `FOLKLORE_DENY_*` confirmed present.
- **Committed in:** 9f7e2a1 (Task 1 commit)

**2. [Rule 3 - Blocking] Committed untracked RFC-0001 + README to avoid orphan index links**
- **Found during:** Task 2 (Refresh the RFC index)
- **Issue:** `docs/rfc/0001-folklore-core.md` and `docs/rfc/README.md` were untracked working-tree files (never committed by a prior plan). Committing only the README index update would leave the index linking RFC-0001, a file not in the repo.
- **Fix:** Staged and committed RFC-0001 alongside the README index refresh so every RFC the index links is tracked.
- **Files modified:** docs/rfc/README.md, docs/rfc/0001-folklore-core.md
- **Verification:** `git ls-files docs/rfc/` now lists 0001, 0002, README; orphan-check loop prints nothing.
- **Committed in:** 74340da (Task 2 commit)

---

**Total deviations:** 2 auto-fixed (1 bug — wrong env names; 1 blocking — untracked index targets)
**Impact on plan:** Both auto-fixes necessary for correctness (RFC must document real knobs) and repo integrity (index must not link untracked files). No scope creep — changes confined to docs/rfc/.

## Issues Encountered
- The working tree carries a large set of pre-existing modifications unrelated to this plan (hooks, .planning/, src/, etc.), so Task 2's `git diff --name-only` "only two files" check could not pass globally. Scoped the check to `docs/rfc/` — my changes are isolated there. The pre-existing noise is out of scope (logged as context, not touched).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- DOCS-02 satisfied: the RFC set is extended with one substantive, non-filler RFC backed by deployed defaults, and the index lists every current RFC.
- `npx tsc --noEmit` exits 0 — no source touched.
- Phase 27 (Site Build-Out) can source the RFC content from a clean, indexed docs/rfc/ surface.

## Self-Check: PASSED

- FOUND: docs/rfc/0002-deny-on-confidence.md
- FOUND: docs/rfc/README.md
- FOUND: .planning/phases/26-docs-and-benchmarks/26-02-SUMMARY.md
- FOUND commit: 9f7e2a1 (Task 1)
- FOUND commit: 74340da (Task 2)

---
*Phase: 26-docs-and-benchmarks*
*Completed: 2026-06-15*
