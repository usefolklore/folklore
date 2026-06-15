---
phase: 27-site-build-out
plan: 02
subsystem: ui
tags: [html, css, landing-page, folk-pop, brand, static-site]

# Dependency graph
requires:
  - phase: 27-01
    provides: "Guidebook section + #guidebook navbar anchor in site/index.html (the wave-2 base this plan edits)"
provides:
  - "A new <section id=\"culture\"> (Platform Culture) between #together and #mechanism telling the lore / the commons / the folk story"
  - "#culture navbar anchor wired into .hlinks"
  - "The brand thesis (lore is the graph; folk are the peers) stated as a culture/philosophy beat, not just a one-line flourish"
affects: [27-03, 27-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reuse the locked .illum/.il 3-up grid (per-child pink/blue/yellow shadows) for narrative beat cards — same component the Mechanism + Guidebook sections use"
    - "Headless static-capture verification: clone site to /tmp, force .rv visible + neutralize min-height:100svh so the page flows to content height for a full-page Chrome --headless=new screenshot"

key-files:
  created: []
  modified:
    - "site/index.html — added section#culture + navbar anchor"

key-decisions:
  - "Built Culture on the existing .illum/.il 3-card grid (not stacked .beat rows) — the per-child colored shadows give pink/blue/yellow rhythm for free and the folk-pop brand lock holds by construction"
  - "Placed Culture between #together and #mechanism so the narrative reads problem → alone → together → culture (why it matters / the commons) → mechanism (how) — Culture bridges the emotional beat into the technical one"
  - "Used the 3-condition card num as a folk dot (·) rather than roman numerals to distinguish the cultural beats from the numbered how-to steps in Mechanism/Guidebook"

patterns-established:
  - "Pattern: narrative/community sections reuse the same .illum card grid as mechanism/proof — one component, colored-shadow rhythm, clamped type, no new CSS"

requirements-completed: [SITE-03]

# Metrics
duration: 18min
completed: 2026-06-15
---

# Phase 27 Plan 02: Platform Culture Summary

**A Platform Culture section ("a commons, not a cloud.") presenting the lore / the commons / the folk as a three-card folk-pop beat between #together and #mechanism, navbar-linked, stating the brand thesis (the lore is the graph; the folk are the peers).**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-06-15T07:19:08Z
- **Completed:** 2026-06-15T07:21:56Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Added `<section id="culture">` with a yellow stamp ("The Folklore — Platform Culture"), misregistered h2 ("a commons, not a cloud." with teal accent + pink misregister), the ink `.rule`, and a `.lede` framing the bet in order (works **alone** day one → **compounds** when peers join → nobody grinds out the same answer twice).
- Three narrative beats in the locked `.illum`/`.il` grid: **The Lore** (knowledge passed on, never relearned — the lore is the graph), **The Commons** (stone soup for machines; a shared pool nobody pays for twice; not a vendor's cloud), **The Folk** (signed by a real, named hand — the folk are the peers).
- One folk-shape accent (teal `#flower`) in the right margin, outside `.wrap`, clear of the text column.
- Wired `#culture` into the navbar: Guidebook · Culture · Mechanism · Proof · Join · RFC.

## Task Commits

1. **Task 1: Add the Platform Culture section** - `f64582b` (feat)

**Plan metadata:** _(this docs commit)_

## Files Created/Modified
- `site/index.html` - New `section#culture` inserted between `#together` and `#mechanism`; `#culture` anchor added to `.hlinks`. No CSS added — section reuses existing `.stamp`/`.mis`/`.rule`/`.lede`/`.illum`/`.il`/`.fg` classes.

## Decisions Made
- `.illum` 3-card grid over stacked `.beat` rows — cleaner fit, free colored-shadow rhythm, brand lock holds by construction.
- Narrative placement bridges the emotional "together" beat into the technical "mechanism" beat.
- Folk dot (`·`) as the card `.num` to visually separate cultural beats from the numbered how-to steps elsewhere.

## Deviations from Plan
None - plan executed exactly as written. (Optional folk-shape accent and the thesis line were both included; copy follows docs/brand/README.md voice — plainspoken, folk-warm, hearth/stone-soup/commons metaphors, no protocol-speak.)

## Issues Encountered
- The `.rv` reveal animation never fires in a static headless capture and `min-height:100svh` makes each section as tall as the (oversized) headless window. Resolved per the 27-01 precedent by cloning the site to a temp dir and (a) forcing `.rv{opacity:1;transform:none}` and (b) neutralizing `min-height:100svh→auto` so the page flows to content height for a clean full-page screenshot. Temp artifacts removed after capture; the committed `site/index.html` is unmodified by the verification harness.

## Verification Evidence
- Automated grep gate PASS: `id="culture"` ×1, `href="#culture"` present, `class="stamp` present, `the lore is the graph` present (case-insensitive), `id="guidebook"` still ×1 (27-01 intact). "The Lore" / "The Commons" / "The Folk" all present.
- Headless Chrome (`--headless=new`) screenshot at **1512px**: Culture renders with stamp + misregistered heading + lede + three colored-shadow cards, folk-pop consistent, teal flower accent in margin, no overflow or broken cards. Read the PNG to confirm.
- Headless screenshot at **390px**: full-page PNG width == 390 (no horizontal overflow); the three cards stack single-column with their shadows, lede full-width, clean transition into Mechanism.
- `git diff --stat` touched only `site/index.html` (+28/-1). No new deps; hero/commons/graph `<video>` untouched; Guidebook untouched.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- 27-03 (Store) and 27-04 (composition/mobile sweep) can proceed off this base. The Culture section follows the same `.illum` component contract, so the mobile sweep already has a passing 390px capture for it.

## Self-Check: PASSED
- site/index.html contains `id="culture"` (committed in f64582b) ✓
- Navbar anchor `href="#culture"` present ✓
- 27-01 Guidebook intact (`id="guidebook"` ×1) ✓
- 27-02-SUMMARY.md created ✓
- Commit f64582b present in git log ✓

---
*Phase: 27-site-build-out*
*Completed: 2026-06-15*
