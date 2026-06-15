---
phase: 27-site-build-out
plan: 03
subsystem: ui
tags: [html, css, landing-page, folk-pop, brand, static-site, store, merch]

# Dependency graph
requires:
  - phase: 27-02
    provides: "Platform Culture section + #culture navbar anchor in site/index.html (the wave-3 base this plan edits)"
provides:
  - "An evolved <section id=\"store\"> rebuilt as a real product-card shop: a 3-up auto-fit grid of Tee / Sticker Pack / Enamel Pin cards, each with art, name, description, a $— price placeholder, and an inert (aria-disabled + data-buy) buy CTA wired for a real-URL drop-in"
  - "A $LORE sub-block inside #store consolidating the former #coin section: bags.fm primary CTA + coin.png treatment + 'not financial advice' disclaimer, all preserved"
  - "Removal of the standalone #coin section (content folded into the shop) — one coherent Store that reads like a shop"
affects: [27-04]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Product-card grid via grid-template-columns:repeat(auto-fit,minmax(240px,1fr)) — the same responsive pattern the #memes grid uses; collapses to single-column on mobile with no media query needed for the cards"
    - "Inert-but-wired CTA convention: aria-disabled=\"true\" + data-buy=\"<id>\" + an HTML TODO comment marking the real-product-URL drop-in point (no fabricated external store URL)"
    - "Price placeholder convention: <span class=\"price\" data-price=\"\">$—</span> — a visibly empty slot, never a fake price"
    - "Headless static-capture verification: clone site to /tmp, force .rv visible + neutralize min-height:100svh→auto so the page flows to content height for a full-page Chrome --headless=new screenshot"

key-files:
  created:
    - ".planning/phases/27-site-build-out/27-03-SUMMARY.md"
  modified:
    - "site/index.html — rebuilt section#store into a product-card shop + $LORE sub-block; deleted standalone section#coin; added scoped .shop/.prod/.buy/.lore CSS next to the old store rules"

key-decisions:
  - "Chose plan option (a): folded the #coin $LORE block into #store as a .lore sub-block and deleted the standalone #coin section, so a single Store holds both merch and the coin and reads like a real shop. Nav never linked #coin (grep-verified), so no anchor cleanup was needed."
  - "Built the shop on a fresh minimal .shop/.prod card system rather than extending the old 2-panel .merch grid — the 2-up .merch layout didn't cleanly become a 3-up card layout, and a small scoped block (mirroring the #memes auto-fit grid) keeps cards responsive with zero media query for the card grid itself."
  - "Made the buy CTAs genuinely inert (aria-disabled + pointer-events:none + cursor:not-allowed) and href=\"#store\" (in-page, never a fake shop URL), with a data-buy product id and an HTML TODO comment at each card so a real fulfilment URL drops in mechanically later."
  - "Price rendered as a visible $— placeholder (data-price empty) so it is obviously a placeholder, not a fabricated price."
  - "Product art mapping: Tee→tee.png, Sticker Pack→fishflower.png + sun.png (paired in one card), Enamel Pin→char1.png (the round 'teller' character reads naturally as an enamel pin). The disclaimer wording was preserved verbatim from the old #coin block."

patterns-established:
  - "Pattern: e-commerce-shaped placeholders are inert + wired (aria-disabled + data-* id + TODO comment), never fabricated live URLs/prices — ready for a blocked-on-user launch drop-in."

requirements-completed: [SITE-04]

# Metrics
duration: 22min
completed: 2026-06-15
---

# Phase 27 Plan 03: Real Store Summary

**The Store ("wear the commons.") rebuilt as a real product-card shop — three cards (Never-Research-Twice Tee, Folk Sticker Pack, The Teller Enamel Pin) each with folk-pop art, name, $— price placeholder, and an inert-but-wired buy CTA — plus a consolidated $LORE bags.fm block with the 'not financial advice' disclaimer, replacing the old two Coming-soon panels and the standalone #coin section.**

## Performance

- **Duration:** ~22 min
- **Completed:** 2026-06-15
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Replaced the two `.merch` "Coming soon" panels with a `.shop` grid (`repeat(auto-fit,minmax(240px,1fr))`) of three `.prod` cards: **Never-Research-Twice Tee** (tee.png), **Folk Sticker Pack** (fishflower.png + sun.png paired in-card), **The Teller Enamel Pin** (char1.png). Each card carries a "DROPS TO PEERS FIRST" `.soon` chip, a bordered image with a colored hard shadow (pink/blue/teal), a name, a description, a `$—` price placeholder, and an inert `aria-disabled` + `data-buy` buy CTA with a `<!-- TODO: real product URL at fulfilment launch -->` comment.
- Consolidated the standalone `#coin` section into a `.lore` sub-block inside `#store`: the "$LORE — minted on bags.fm." pitch, the `https://bags.fm` `.btn-primary` CTA, the round/bordered/hard-shadow `coin.png`, and the exact disclaimer "Memecoin · for fun & culture, not financial advice · contract address at launch" — all preserved. Deleted the now-redundant `<section id="coin">`.
- Added a small scoped CSS block (`.shop`/`.prod`/`.buy`/`.lore`) next to the old store rules; replaced the old `.store`/`.merch` rules. Reused `.soon`, `.btn-primary`, `.stamp`, `.mis`, `.rule`, `.body`, `.rv` — no new deps, clamped type preserved, folk-pop skin (ink borders, hard shadows, misregistered heading) intact.

## Task Commits

1. **Task 1: Rebuild the Store as a real product-card shop** - `1477579` (feat)

**Plan metadata:** _(this docs commit)_

## Files Created/Modified
- `site/index.html` - Rebuilt `section#store` into a product-card shop + `.lore` $LORE sub-block; removed `section#coin`; added scoped `.shop`/`.prod`/`.buy`/`.lore` CSS. (+78/-30)

## Decisions Made
- Plan option (a): single coherent Store holding both merch and $LORE; standalone `#coin` deleted (nav never referenced it).
- Fresh `.shop`/`.prod` card system over extending the 2-panel `.merch` grid (cleaner 3-up, responsive auto-fit).
- Inert + wired CTAs (`aria-disabled` + `data-buy` + TODO comment, `href="#store"`); no fabricated shop URL; `$—` price placeholder.

## Deviations from Plan
None - plan executed exactly as written. (Preferred option (a) was chosen as the plan recommended; disclaimer wording preserved verbatim; no nav anchor cleanup needed since nav never linked `#coin`.)

## Issues Encountered
- The `.rv` reveal animation never fires in a static headless capture and `min-height:100svh` makes sections as tall as the headless window. Resolved per the 27-01/27-02 precedent: cloned the site to `/tmp`, forced `.rv{opacity:1;transform:none}` and `section{min-height:auto}` so the page flows to content height. The full page is very tall (~11000px at 1512w); captured with a tall window and cropped to the store region. Temp artifacts only — the committed `site/index.html` is unmodified by the harness.

## Verification Evidence
- Automated grep gate PASS: `id="store"` ×1, `not financial advice` present, `bags.fm` present, `data-buy`/`aria-disabled`/`TODO: real product URL` all present, price placeholder present, `id="guidebook"` ×1 and `id="culture"` ×1 (27-01/27-02 intact), `id="coin"` ×0 (consolidated). Three product ids: `tee`, `sticker-pack`, `enamel-pin`.
- Headless Chrome (`--headless=new`) at **1512px**: the Store renders as a multi-card shop — yellow stamp, misregistered "wear the commons." heading, three product cards in a row with colored hard shadows, names, `$—` placeholders, and ink "Buy" buttons, plus the `.lore` block with the round coin, bags.fm CTA, and the disclaimer. Read the PNG to confirm.
- Headless at **390px**: full-page PNG width == 390 (no horizontal overflow); the three product cards stack single-column (Tee → Sticker Pack → Pin), each full-width with image/name/desc/price; the $LORE block stacks to one column with the coin ordered first. Read the PNG to confirm.
- `git diff --stat` touched only `site/index.html` (+78/-30). No new deps; hero/commons/graph `<video>`, `#memes`, Guidebook, and Culture untouched.

## User Setup Required
None for this plan. The Store is structured for a **blocked-on-user** launch: merch fulfilment (real product URLs drop into the `data-buy` CTAs / TODO comments + `$—` price slots) and the $LORE token launch on bags.fm (contract address at launch).

## Next Phase Readiness
- 27-04 (composition / mobile sweep) can proceed off this base. The Store already has passing 1512px and 390px captures; the shop card grid is responsive (auto-fit) and verified single-column at 390px.

## Self-Check: PASSED
- site/index.html contains `id="store"` ×1 with the product-card shop (committed in 1477579) ✓
- Three product cards present: `data-buy="tee"`, `data-buy="sticker-pack"`, `data-buy="enamel-pin"` ✓
- $LORE block present: `bags.fm` CTA + `not financial advice` disclaimer ✓
- Standalone `#coin` removed (`id="coin"` ×0) ✓
- 27-01 Guidebook (`id="guidebook"` ×1) and 27-02 Culture (`id="culture"` ×1) intact ✓
- Commit 1477579 present in git log ✓
- 27-03-SUMMARY.md created ✓

---
*Phase: 27-site-build-out*
*Completed: 2026-06-15*
