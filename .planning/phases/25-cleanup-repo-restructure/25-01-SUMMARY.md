---
phase: 25-cleanup-repo-restructure
plan: 01
subsystem: infra
tags: [claude-code, hooks, mcp, config, cleanup]

# Dependency graph
requires:
  - phase: 24-rooms-deletion
    provides: post-room codebase state the cleanup operates on
provides:
  - Folklore-only CLAUDE.md (claude-flow/RuFlo cruft removed)
  - settings.json wired to Folklore hooks with a working statusLine
  - claude-flow-free .mcp.json
  - .claude/README.md documenting Folklore's shipped hooks + hw-detect rerank tiering
affects: [26-docs-benchmarks, 27-site-build-out, repo-public-launch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Claude Code config surface carries only Folklore's own hooks/skill/statusLine"
    - "Model tiering = hardware-tier rerank picker (hw-detect), not an external model router"

key-files:
  created:
    - .claude/README.md
  modified:
    - CLAUDE.md
    - .claude/settings.json
    - .mcp.json

key-decisions:
  - "Did not preserve the generic-good behavioural rules from the cruft block; pointed to PROJECT.md + STATE.md 'Architecture invariants' as the authoritative source instead"
  - "statusLine collapsed to the single helper that exists on disk (ak-statusline.cjs), dropping two dead references"
  - "Documented CLEAN-06 by recording the removed 3-tier router and pointing to the real hw-detect rerank tiering"

patterns-established:
  - "Pattern: config-surface grep verification scoped to config files so Folklore's legitimate src/ swarm-sim code is not flagged"

requirements-completed: [CLEAN-01, CLEAN-02, CLEAN-03, CLEAN-06]

# Metrics
duration: 4min
completed: 2026-06-14
---

# Phase 25 Plan 01: Config-Surface Cleanup Summary

**Stripped all inherited claude-flow / RuFlo V3 cruft (swarm, hive-mind, 3-tier router, attribution co-author, leaked MCP server) from CLAUDE.md, settings.json and .mcp.json; rewired the statusLine to the helper that exists; and documented Folklore's own hooks in a new .claude/README.md.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-14T21:58:20Z
- **Completed:** 2026-06-14T22:02:21Z
- **Tasks:** 3
- **Files modified:** 3 + 1 created

## Accomplishments
- CLAUDE.md is now a Folklore-only guide: short project header + conventions pointer, then the preserved `folklore:start` block byte-for-byte. No claude-flow/ruflo/swarm/hive-mind/3-tier text remains.
- settings.json carries zero claude-flow config: removed the `claudeFlow` block, `attribution` co-author, `env` flags, and the four claude-flow `permissions.allow` entries; kept the `.env` deny block and all Folklore hooks; fixed `statusLine` to call `ak-statusline.cjs` (dropping the two non-existent helper references).
- .mcp.json `mcpServers` reduced to an empty object (claude-flow server removed).
- New `.claude/README.md` maps every shipped Folklore hook to its event + behaviour, names the statusLine helper and skill, and records that the claude-flow 3-tier router was removed in favour of the `hw-detect` rerank hardware-tier picker (CLEAN-06).
- `npx tsc --noEmit` exits 0; config-surface grep for ruflo/claude-flow/hive-mind/3-tier returns no matches.

## Task Commits

Each task was committed atomically (no AI co-authors):

1. **Task 1: Replace CLAUDE.md with a Folklore-only document** - `d4b5543` (refactor)
2. **Task 2: Strip claude-flow from settings.json + .mcp.json and fix statusLine** - `a697bba` (chore)
3. **Task 3: Document Folklore's own hooks in .claude/README.md** - `88a56d0` (docs)

## Files Created/Modified
- `CLAUDE.md` - Replaced 247 lines of claude-flow cruft with a Folklore header + conventions pointer; preserved the folklore:start block.
- `.claude/settings.json` - Removed claudeFlow/attribution/env/claude-flow-permissions; fixed statusLine to ak-statusline.cjs; kept hooks + deny block.
- `.mcp.json` - Emptied mcpServers (removed claude-flow).
- `.claude/README.md` - New doc for Folklore's Claude Code hooks + model-tiering (hw-detect) section.

## Decisions Made
- Did not carry the generic-good behavioural rules (DDD, read-before-edit, no-secrets) into the new CLAUDE.md; the authoritative conventions live in PROJECT.md + STATE.md, so a pointer is sufficient and avoids drift.
- statusLine reduced to the single helper present on disk rather than chaining two dead references.

## Deviations from Plan

None — plan executed exactly as written. No deviation rules triggered; tsc, JSON validity, and all per-task acceptance criteria passed on first or second verification (Task 3 README needed one rewrite to bring claude-flow mentions down to the single allowed "removed" sentence — within plan acceptance, not a deviation).

## Issues Encountered

- **Pre-existing staged index bundled into task commits.** When execution began, a large set of unrelated changes (the `scripts/` → `bench/` rename, new bench `.mjs` files, and `bench/bench-v2.sh`) was already staged in the index from prior/concurrent work. Because they were already staged, `git add <my-file>` followed by `git commit` swept them into the Task 1 and Task 2 commits even though I only `git add`-ed my own files. My own edits (CLAUDE.md, settings.json, .mcp.json) are correct and present in those commits; the bundled bench files are pre-existing work, not introduced here, and history was left intact rather than rewritten. Task 3 committed cleanly (single file). No `src/` file was modified by this plan.
- **Concurrent phase-25 commits.** Other plan executors in this phase committed `7a6618e` (25-02) and `316d7b3` (25-03) interleaved with mine; all three of my commits (`d4b5543`, `a697bba`, `88a56d0`) are intact on `main`.

## User Setup Required

**Security follow-up (out of scope for this plan, surfaced per plan output):**
`.claude/settings.local.json` is **not** git-tracked (confirmed gitignored, so it will not ship) but it contains a live `HCLOUD_TOKEN` and an `enabledMcpjsonServers: ["claude-flow"]` entry. Recommended user actions before the repo goes public:
- Rotate the Hetzner Cloud token (it was present in a local file; treat as exposed).
- Optionally remove the stale `claude-flow` entry from `enabledMcpjsonServers` in that local file so the now-deleted MCP server is not re-advertised locally.
No token value was printed or committed during this plan.

## Next Phase Readiness
- Config surface is public-ready: CLAUDE.md, settings.json, .mcp.json carry only Folklore config; hooks documented.
- Phase 26 (Docs & Benchmarks) can reference the clean `.claude/README.md` and the documented hw-detect tiering.
- Blocker (user): rotate the HCLOUD_TOKEN noted above before public launch.

## Self-Check: PASSED

All created/modified files present on disk (CLAUDE.md, .claude/settings.json, .mcp.json, .claude/README.md, 25-01-SUMMARY.md) and all three task commits (d4b5543, a697bba, 88a56d0) present in git history.

---
*Phase: 25-cleanup-repo-restructure*
*Completed: 2026-06-14*
