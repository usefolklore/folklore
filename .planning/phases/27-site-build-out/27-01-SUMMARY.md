---
phase: 27-site-build-out
plan: 01
subsystem: ui
tags: [html, css, folk-pop, landing-page, guidebook, static-site]

# Dependency graph
requires:
  - phase: 26-docs-and-benchmarks
    provides: honest product copy + real CLI surface (folklore onboard/ask/peer add) the Guidebook quotes verbatim
provides:
  - A "How it works / get started" Guidebook section on the marketing site (install / hooks-onboard / ask / add-peer as four numbered step cards)
  - A navbar #guidebook anchor wired as the first nav link
affects: [27-site-build-out remaining plans (27-02..27-05 edit the same site/index.html — serialized waves), 28-merch-and-meme-agent]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reuse the locked folk-pop section system (.stamp / h2.mis / .illum/.il numbered grid / .copy chip) — no new CSS framework, no new deps"
    - "Real product commands only — copy quotes the actual folklore CLI surface, no invented flags"

key-files:
  created: []
  modified:
    - "site/index.html — new <section id=\"guidebook\"> + navbar anchor"

key-decisions:
  - "Built the Guidebook on the existing .illum/.il 4-card grid (the Mechanism section's layout) rather than a new component — the per-child colored shadows (pink/blue/yellow/teal) and clamped type come for free and the brand lock is preserved by construction."
  - "Reused the hero .install chip markup (with a small inline size trim) inside card i so the install command is copyable via the existing .copy handler — no new JS, no browser storage."
  - "Acceptance evidence captured by isolating the section into a styles-inlined doc and forcing the .rv reveal visible (the IntersectionObserver does not fire in a static headless capture); horizontal-overflow at 390px verified separately by confirming the full-page mobile PNG is exactly 390px wide."

patterns-established:
  - "Site sections quote the real CLI verbatim (folklore onboard/ask \"…\"/peer add … --peers) — never invent flags or rename the binary."
  - "Screenshot acceptance for .rv-animated sections: inline a force-visible style + isolate the section; verify no-overflow via PNG width == viewport width."

requirements-completed: [SITE-02]

# Metrics
duration: 4min
completed: 2026-06-15
---

# Phase 27 Plan 01: Guidebook section Summary

**A folk-pop Guidebook section on the Folklore site that turns the abstract "why" into a concrete four-move walkthrough — install, hooks/onboard, ask the graph, add a peer — using the real CLI commands and the existing .illum numbered-card grid, plus a navbar anchor.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-15T06:55:12Z
- **Completed:** 2026-06-15T06:58:52Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- New `<section id="guidebook">` placed between `#join` and the Name flourish, presenting the four real get-started moves as a 2x2 grid of numbered step cards (i Install, ii Hooks & onboard, iii Ask the graph, iv Add a peer).
- Card i carries a copyable `npm install -g @usefolklore/folklore` command via the existing `.copy` chip; cards ii–iv quote the real `folklore onboard` / `folklore ask "…"` / `folklore peer add … --peers` surface, with the deny-on-confidence behavior described accurately (gates WebSearch/WebFetch, never touches local Read/Grep/Glob).
- Navbar `.hlinks` gains `<a href="#guidebook">Guidebook</a>` as the first link (reading order: Guidebook, Mechanism, Proof, Join, RFC).
- Renders inside the locked folk-pop skin (yellow stamp, misregistered heading with pink offset + blue accent, ink rule, per-child colored hard shadows, clamped type) — verified by headless Chrome screenshots at 1512px (2x2 grid) and 390px (single column, no horizontal overflow).

## Task Commits

1. **Task 1: Add the Guidebook section** - `43fa0d5` (feat)

_(site/index.html was previously untracked; this is its first tracked commit, so the diff records the whole file. Only site/index.html is in the commit.)_

## Files Created/Modified
- `site/index.html` — added the Guidebook section and the navbar anchor; reused existing classes only, no new CSS rules, no new deps, hero/commons/graph `<video>` elements untouched.

## Decisions Made
- Used the existing `.illum`/`.il` 4-card grid (the Mechanism section's pattern) so the colored per-child shadows and clamped type apply automatically and the brand lock holds by construction.
- Embedded a size-trimmed copy of the hero `.install` chip in card i to get a copyable real install command through the existing `.copy` handler — zero new JS.

## Deviations from Plan

None - plan executed exactly as written. (The plan's example markup used a misregister where `data-text` and the accent split could mismatch; the final heading sets `data-text="four moves to never research twice."` equal to the full visible plain text, per the interfaces note that data-text MUST equal the visible plain text — this is the documented-correct usage, not a deviation.)

## Issues Encountered
- Static headless screenshots initially captured blank/hero-only frames because the `.rv` scroll-reveal keeps content at `opacity:0` until the IntersectionObserver fires (which a non-scrolling headless capture never triggers). Resolved by isolating the section into a styles-inlined doc with `.rv` forced visible for the render screenshot, and separately confirming no 390px horizontal overflow by checking the full-page mobile PNG width equals 390px.

## User Setup Required
None - static site edit, no external service configuration.

## Next Phase Readiness
- SITE-02 satisfied. site/index.html now carries the get-started walkthrough.
- Remaining Phase 27 plans (27-02..27-05) edit the same file and are serialized; this commit is a clean base for them.

## Self-Check: PASSED

- FOUND: `.planning/phases/27-site-build-out/27-01-SUMMARY.md`
- FOUND: `site/index.html` contains `id="guidebook"`
- FOUND: commit `43fa0d5`

---
*Phase: 27-site-build-out*
*Completed: 2026-06-15*
