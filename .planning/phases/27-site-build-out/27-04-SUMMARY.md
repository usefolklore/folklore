---
phase: 27-site-build-out
plan: 04
subsystem: ui
tags: [html, css, landing-page, folk-pop, responsive, mobile, composition, static-site]

# Dependency graph
requires:
  - phase: 27-03
    provides: "The full post-Store site/index.html (hero, problem, alone, together, culture, mechanism, proof, join, guidebook, name, store, memes, footer) — the wave-4 base this final pass sweeps"
provides:
  - "A narrow-phone composition pass over the whole page: #join inscription long-token wrapping + a @media(max-width:480px) block that shrinks the inscription mono, frees the proof-bar track from its label column, and guards full-bleed media"
  - "Verified-clean mobile (390px) and desktop (1512px) renders across ALL twelve sections including the three new 27-01/02/03 sections"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "overflow-wrap:anywhere on mono code blocks (.insc pre, .install) so unbreakable tokens (the libp2p multiaddr, the long npm command) wrap inside their box instead of clipping at the viewport edge"
    - "A single @media(max-width:480px) narrow-phone block layered on top of the existing 900/880/820/760px breakpoints — surgical (mono size + grid column trim + media guard), never touching the clamped type scale"
    - "Headless-capture verification under Chrome's 500px-min DOM clamp: rasterized screenshots honor 390px, but @media evaluation clamps to 500 — proved the ≤480 rule by a throwaway clone with the breakpoint bumped to 520 + a getComputedStyle probe (preFont=12px, barCols=96px 284px 50px, DOC over=0)"

key-files:
  created:
    - ".planning/phases/27-site-build-out/27-04-SUMMARY.md"
  modified:
    - "site/index.html — +15/-2: overflow-wrap on .insc pre + .install; new @media(max-width:480px){ .insc, .insc pre, .bar, .bar .v, img/video } block"

key-decisions:
  - "Audit-first then surgical: a full per-section screenshot pass at 1512px + 390px found the desktop composition already balanced (no desktop edits) and only TWO real mobile issues — the #join multiaddr/comment clipping at the right edge and the proof .bar label column crowding the track at 390px. Everything else (single-column stacking via the existing 900/880/760 breakpoints, body overflow-x:hidden, marquee clipped by .marq overflow:hidden, decor clipped by body) was already correct, so the fix is 17 lines, not a redesign."
  - "Fixed the #join inscription by wrapping rather than inner-scrolling: overflow-wrap:anywhere lets the libp2p multiaddr and the daemon/hooks comment break inside the dark box, plus a ≤480px drop to 12px mono + tighter padding (20px 16px) — preferred over a horizontal scroll inside the code block (worse on touch)."
  - "Freed the proof bars at ≤480px by trimming the .bar grid label column 120px→96px (and value 56px→50px, gap 14→10), giving the track ~284px instead of ~170px — the labels (Folklore / Pinecone base / LangChain RAG) still fit, the track no longer crushes."
  - "Kept the breakpoint at the real-device-correct 480px even though headless Chrome clamps its DOM to a 500px minimum (so the rule can't be proven by a 390px headless screenshot directly). Verified the rule fires by a separate clone with the breakpoint at 520px + a computed-style probe; the shipped file keeps 480 because 390px phones satisfy 390 ≤ 480."
  - "Type scale, palette, folk-pop skin (hard shadows, ink borders, misregistered headers, stamps), scroll-snap, and the hero/commons/graph poster <video>s were all left untouched by construction — the diff adds only overflow-wrap and one media block; grep-confirmed no font-size clamp ceiling changed and no new external host entered <link>/<script>/<a>."

patterns-established:
  - "Pattern: final-wave composition sweeps audit every section at both target widths first, record a per-section pass/fail issue list, then apply only the confirmed-needed surgical CSS — extend existing breakpoints/clamps, never raise the type-scale ceiling or introduce a framework."

metrics:
  duration_minutes: 18
  tasks_completed: 2
  files_changed: 1
  completed_date: "2026-06-15"
---

# Phase 27 Plan 04: Composition + Mobile Responsive Sweep Summary

Final polish pass over the whole Folklore landing page (the original sections plus the new Guidebook / Culture / Store from 27-01/02/03), verified with headless Chrome at 1512px and 390px. Desktop composition was already balanced across all twelve sections; the mobile audit found exactly two real overflow/crowding issues, both fixed with a 17-line surgical diff that leaves the folk-pop skin, clamped type scale, scroll-snap, and poster `<video>`s untouched.

## Task 1 — Audit (1512px + 390px, every section)

Captured full-page screenshots at both widths (clone-to-/tmp harness with `.rv` forced visible) and sliced the mobile capture into ordered bands; read every band plus zoom crops of the known overflow-risk spots. Per-section result at 390px:

| Section | No horizontal overflow | Single-column stacking | No clipped/oversize element |
|---|---|---|---|
| hero | pass | pass (herogrid→1fr @900) | pass (navbar + install chip fit) |
| problem | pass | pass | pass |
| alone | pass | pass (beat→1fr @880) | pass |
| together | pass | pass | pass (commons video full-width, bordered) |
| culture (new) | pass | pass (illum→1fr @760) | pass |
| mechanism | pass | pass (illum→1fr @760) | pass |
| proof | pass | pass (ledger→1fr 1fr @760) | **WATCH** — `.bar` 120px label column crowds the track |
| join | pass (doc-level) | pass | **FAIL** — `.insc pre` multiaddr + comment clip at the right edge |
| guidebook (new) | pass | pass (illum→1fr @760) | pass (install chip in card i fits) |
| name | pass | pass | pass |
| store (new) | pass | pass (shop auto-fit→1col; lore→1fr @760) | pass (cards + $LORE coin-first stack) |
| memes | pass | pass (memegrid auto-fit→1col) | pass |
| footer | pass | pass (.foot flex-wrap) | pass |

Known overflow-risk spots from the plan, each explicitly checked:
- `.insc pre` multiaddr (#join): **clipping at 390** — the daemon/hooks comment lost "ide" and the `/ip4/.../p2p/12D3KooW...` line ran to the edge; `word-break:break-word` does not break the slashy path. → fixed.
- `.bars .bar` 120px column: track squeezed to ~170px at 390 — legible but tight. → eased.
- hero `.install`: long npm command + copy chip — fits at 390, but hardened with `flex-wrap` + `overflow-wrap:anywhere` as a guard.
- `.marq .track` (w=2515): intentionally wide, clipped by `.marq{overflow:hidden}` — no body scroll. OK.
- `.farshape`/`.fg` decor: clipped by `body{overflow-x:hidden}` — add no scrollable width. OK.
- new 27-0x grids (guidebook `.illum`, store `.shop`/`.lore`, memes grid): all collapse to single column at ≤760px. OK.

Document-level overflow probe: `scrollWidth - clientWidth = 0` at both widths.

## Task 2 — Fix + re-verify

Edits (`site/index.html`, +15/-2):
- `.insc pre` and `.install`: added `overflow-wrap:anywhere` (and `flex-wrap` on `.install`) so unbreakable tokens wrap inside the box.
- New `@media(max-width:480px)` block: `.insc{padding:20px 16px}`, `.insc pre{font-size:12px;line-height:1.95}`, `.bar{grid-template-columns:96px 1fr 50px;gap:10px;font-size:.86rem}`, `.bar .v{font-size:.82rem}`, and an `img,video{max-width:100%}` guard.

### Before / after — #join inscription (390px)
- Before: comment clipped at "ide"; multiaddr line and `folklore ask` line ran to / past the box right edge.
- After: full comment visible; `folklore save … "mxbai … ctx"`, the `/ip4/203.0.113.7/tcp/4001/p2p/12D3KooW...` multiaddr, and `folklore ask "mxbai-rerank vs cross-encoder?"` all wrap and sit inside the dark box. Computed `font-size:12px`; pre `scrollWidth - clientWidth = 0`.

### Before / after — proof bars (390px)
- Before: `120px 1fr 56px` left the track ~170px.
- After: `96px 1fr 50px` → track ~284px; labels still fit; no crush.

Re-verification: greps pass — `overflow-x:hidden` retained; `id="guidebook"`==1, `id="culture"`==1, `id="store"`==1; hero `video poster="assets/gen/hero..."` retained. `git diff` adds no non-font external host. No `font-size` clamp ceiling changed (type scale locked).

## Deviations from Plan

None — plan executed as written. The desktop composition pass required no edits (audit found it already balanced), and the mobile fixes were the two confirmed issues from the audit; no architectural changes, no new deps, no out-of-scope work.

## Commits

- `e2fa693` fix(27-04): mobile composition sweep — wrap #join multiaddr, free proof bars at 390px

## Self-Check: PASSED

- site/index.html modified (+15/-2), commit `e2fa693` present in `git log`.
- Verification greps pass: overflow-x:hidden retained; guidebook/culture/store == 1; hero poster video retained; no new external host; no clamp ceiling raised.
- Evidence screenshots captured and read at both widths (full-page + per-section bands + #join/proof zoom crops; before vs after confirmed for the two fixed regions).
