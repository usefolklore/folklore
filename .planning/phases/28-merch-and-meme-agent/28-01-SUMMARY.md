---
phase: 28-merch-and-meme-agent
plan: 01
subsystem: ui
tags: [site, store, merch, css, mockup, folk-pop, html]

# Dependency graph
requires:
  - phase: 27-site-build-out
    provides: "Store <section id=store> .shop/.prod card system with bare gen-art .shot images + inert data-buy CTAs (27-03 SITE-04)"
provides:
  - "Store product shots upgraded to CSS/SVG merch mockup composites (tee chest-print, die-cut sticker sheet, round enamel pin) from existing art at zero credit cost"
  - "A concrete print-spec line per product card (material/technique/size) in folk-pop voice"
affects: [28-merch-and-meme-agent, meme-agent, store-fulfilment-launch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Merch mockups assembled from existing repo art via scoped CSS (gradients, dashed die-cut borders, round bezels with inset box-shadow) — no new image files, no higgsfield credits"
    - "Mockup framing classes scoped to .shot.tee/.shot.sheet/.shot.pin so generic .prod/.shot stay reusable"

key-files:
  created: []
  modified:
    - "site/index.html — Store .prod shots → mockup composites + .spec print lines + scoped mockup/spec CSS"

key-decisions:
  - "Built mockups purely from CSS framing of the existing gen art (tee on a dark cotton field with collar hint as a chest print; two rotated dashed die-cut chips on a hatched sheet; round metal bezel with inset highlight) — zero new files, zero higgsfield credits, no new external host"
  - "Added position:relative to the base .prod .shot rule so the tee collar ::before pseudo-element anchors inside the framed box without affecting other cards"
  - "Spec lines use the plan's exact concrete material strings (cotton/screen-print/S-3XL; die-cut vinyl/matte/weatherproof ~3in; hard enamel/1.25in/gold/clutch) so they are grep-checkable product truth, not marketing fluff"

patterns-established:
  - "Pattern: CSS-only product mockup framing (.shot.<variant>) over bare catalogue renders — reusable for any future merch card from existing art"

requirements-completed: [MERCH-01]

# Metrics
duration: 7min
completed: 2026-06-15
---

# Phase 28 Plan 01: Merch Mockups into Store Summary

**The three Store product cards now show real CSS-framed merch mockups (tee chest-print on dark cotton, die-cut sticker sheet, round enamel pin) built from existing folk art at zero credit cost, each carrying a concrete print spec, with the folk-pop skin and inert buy CTAs preserved by construction.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-15T08:03:54Z
- **Completed:** 2026-06-15T08:10:21Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Upgraded the three `.prod .shot` images from bare `assets/gen/*.png` catalogue art into distinct product mockups via scoped CSS: `.shot.tee` (dark cotton field + collar hint, art scaled to a centered chest print), `.shot.sheet` (hatched sheet with two dashed die-cut chips, slightly rotated), `.shot.pin` (round metal bezel with glossy inset highlight + ink border).
- Added a concrete `<p class="spec">` print line to each card (between `.desc` and `.foot`) with real material/technique/size facts, plus a scoped `.prod .spec{…}` mono rule.
- Verified headless Chrome at 1512px (three mockups read as tee-print / sticker-sheet / round-pin, colored hard shadows intact) and 390px (single-column stack, full-page PNG width == 390 → zero horizontal overflow, spec lines render under each desc).
- Zero new image files, zero higgsfield credits, no new external image host, `data-buy` CTAs + `<!-- TODO: real product URL -->` comments + `$LORE` block all untouched.

## Task Commits

Both tasks shipped in one atomic commit (the CSS block and markup edits are interdependent — the mockup classes and spec lines were authored together and both gated on the same screenshot verification):

1. **Task 1 (mockup composites) + Task 2 (print specs)** — `c655cc1` (feat)

**Plan metadata:** (this SUMMARY + STATE + ROADMAP commit)

## Files Created/Modified
- `site/index.html` — Added scoped mockup framing CSS (`.shot.tee`/`.shot.sheet`/`.shot.pin`) + `.prod .spec` rule next to the existing `.shop`/`.prod` rules; added `position:relative` to base `.prod .shot`; applied the three mockup classes in the markup; added one concrete `.spec` line per card. (+30/-4)

## Decisions Made
- Composited the mockups entirely from CSS over the existing art rather than generating new product photos — satisfies MERCH-01's "real mockup, not a raw catalogue render" while honoring the blocked-on-user higgsfield credit constraint (zero credits, zero new files).
- Combined Task 1 and Task 2 into a single commit because the mockup framing CSS, the spec CSS, and the per-card markup edits are one coherent Store-card upgrade verified by the same 1512/390px screenshot pass; splitting would have produced an intermediate state with spec markup but no spec CSS.
- Added `position:relative` to the shared `.prod .shot` base rule (not just `.shot.tee`) — harmless for the other cards (no absolutely-positioned children there) and the cleanest anchor for the tee collar pseudo-element.

## Deviations from Plan

None - plan executed exactly as written. (The two-tasks-in-one-commit choice is a commit-granularity decision within the plan's stated single-file scope, not a scope deviation; all acceptance criteria for both tasks were met and verified.)

## Issues Encountered
- The first backgrounded 390px store-isolation screenshot did not finish (two concurrent headless-Chrome instances contended); re-ran it standalone and it produced a clean 390-wide PNG. No code impact.

## User Setup Required
None for this plan. Store fulfilment URLs + `$LORE` launch remain blocked-on-user (merch fulfilment + bags.fm token) per the phase plan; the CTAs stay deliberately inert-but-wired.

## Next Phase Readiness
- MERCH-01 satisfied: the Store now reads like a real shop with mockups + specs; the inert `data-buy` CTAs and TODO comments mean the real fulfilment URLs drop in mechanically once the user supplies them.
- Remaining Phase 28 work: AGENT-01/AGENT-02 (meme-agent scaffold, credential-gated on X API), independent of this UI change.

## Verification Evidence
- Grep: `class="shot tee|sheet|pin"` == 3; `data-buy` == 3; `<!-- TODO: real product URL` == 3; `class="spec"` == 3; material terms (cotton/screen-print/Die-cut/vinyl/enamel/plating/clutch) all present; `.spec{` CSS rule present; `higgsfield` == 0; no new URLs in the added diff lines.
- `npx tsc --noEmit` exit 0.
- Headless Chrome screenshots (clone to /tmp, `.rv` forced visible, section `min-height:100svh→auto`): full-page 390px PNG width == 390 (no horizontal overflow); isolated `#store` at 1512px and 390px visually confirm tee-print / sticker-sheet / round-pin mockups with colored hard shadows and spec lines.

## Self-Check: PASSED

- Commit `c655cc1` exists in git log.
- `site/index.html` exists (modified, +30/-4).
- `.planning/phases/28-merch-and-meme-agent/28-01-SUMMARY.md` exists.

---
*Phase: 28-merch-and-meme-agent*
*Completed: 2026-06-15*
