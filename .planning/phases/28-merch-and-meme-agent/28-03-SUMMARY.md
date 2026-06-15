---
phase: 28-merch-and-meme-agent
plan: 03
subsystem: ui
tags: [site, memes, fetch, vanilla-js, folk-pop, static-fallback, agent-roundtrip]

# Dependency graph
requires:
  - phase: 28-merch-and-meme-agent (28-02, AGENT-01)
    provides: MemeEntry schema (src/agents/meme-agent/types.ts) + seeded site/assets/memes.json the grid renders
  - phase: 28-merch-and-meme-agent (28-01, MERCH-01)
    provides: the same site/index.html edited here (serialized Wave 2 after 28-01 to avoid concurrent-edit collision)
  - phase: 27-site-build-out
    provides: the #memes section markup + the trailing vanilla-JS <script> (io observer) this plan extends
provides:
  - "#memes grid is data-driven from site/assets/memes.json (renders one folk-pop card per MemeEntry)"
  - "graceful static fallback: file:// / 404 / bad JSON / empty array leave the six seeded cards in place (never blank)"
  - "agent → site round-trip proven: a dry-run-appended MemeEntry surfaces on the unchanged site with zero HTML edits"
affects: [meme-agent live posting, site deploy (Cloudflare Pages), future memes curation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "fetch() + try/catch + .catch with progressive enhancement over server-rendered static fallback markup"
    - "DOM render mirrors existing card markup exactly (cycling pink/blue/teal/yellow hard shadows) — no schema/style drift"

key-files:
  created: []
  modified:
    - site/index.html  # data-static #memegrid hook + fetch-and-render block in the trailing <script>

key-decisions:
  - "Static-first progressive enhancement: the six seeded cards ARE the fallback; JS replaces them only on a successful non-empty fetch (replaceChildren + removeAttribute data-static). file:// fetch rejection is swallowed so the section is never blank and there is no console-error spam."
  - "Render mirrors the existing inline card markup exactly (3px ink border, var(--paper) bg, 8px hard shadow cycling pink/blue/teal/yellow, overflow:hidden, img width:100% display:block) and uses ONLY the MemeEntry contract (image/alt/caption) — caption maps to img title, no schema drift from 28-02."
  - "No browser storage, no new dep, no new external host, no build step; image refs stay relative (entry.image is already assets/gen/...). Store/$LORE block and hero/commons/graph videos untouched."

patterns-established:
  - "Progressive-enhancement data binding: server-rendered static markup as the resilient baseline, fetched data swapped in only on success — keeps the single-file site working at file://."

requirements-completed: [AGENT-02]

# Metrics
duration: 6min
completed: 2026-06-15
---

# Phase 28 Plan 03: Site memes.json integration Summary

**The #memes grid is now data-driven from site/assets/memes.json — rendering one folk-pop card per MemeEntry over http and falling back to the six seeded static cards at file:// (never blank), so agent-posted memes surface with zero manual HTML edits.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-15T08:14:51Z
- **Completed:** 2026-06-15T08:20:42Z
- **Tasks:** 2
- **Files modified:** 1 (site/index.html, +32/-1)

## Accomplishments
- Marked the `#memegrid` with `id="memegrid" data-static="1"` and added a guarded async fetch block to the trailing `<script>` that renders MemeEntry cards from `assets/memes.json`, cycling the pink/blue/teal/yellow hard shadows and binding `image`/`alt`/`caption` (caption → img `title`).
- Graceful fallback proven both ways: over http the grid swapped to the 2 json entries (data-static removed); at file:// the fetch rejection was swallowed and all 6 seeded static cards stayed visible (section not blank).
- Agent → site round-trip proven end-to-end: the dry-run agent appended a 3rd MemeEntry and the **unchanged** index.html rendered it over http (card count 2→3, new alt "folk-pop meme — round-trip check" in the DOM); seed then restored.
- Mobile clean at 390px (full-page PNG width == 390 → zero horizontal overflow; the data-driven cards stack single-column via the existing `auto-fit minmax(240px,1fr)` grid).

## Task Commits

1. **Task 1: Data-drive the #memes grid from memes.json with a graceful static fallback** - `9e1cb3e` (feat)
2. **Task 2: Verify the agent → site round-trip (no manual edit) and mobile no-overflow** - verification-only (no file change; round-trip artifacts reverted to seed)

**Plan metadata:** committed separately with SUMMARY + STATE + ROADMAP + REQUIREMENTS.

## Files Created/Modified
- `site/index.html` - Added `id="memegrid" data-static="1"` to the memes grid wrapper; added a ~25-line async IIFE in the trailing `<script>` that `fetch('assets/memes.json')`, renders one card per MemeEntry (mirroring the static card markup, cycling shadows, `img.title = caption`), and on ANY failure (file:// rejection, 404, bad JSON, empty/array-less, no renderable entries) leaves the static cards in place via try/catch + `.catch(()=>{})`.

## Decisions Made
- **Static-first progressive enhancement.** The six seeded cards are the resilient baseline; JS replaces them only on a successful non-empty fetch (`grid.replaceChildren(frag)` + `removeAttribute('data-static')`). Every failure path returns early or is swallowed, so the section is never blank and file:// produces no console-error spam. This keeps the single-file site self-contained.
- **No schema/style drift.** Render uses only the MemeEntry contract from 28-02 (`image`, `alt`, `caption`) and reproduces the exact inline card styling (ink border, paper bg, 8px hard shadow cycling pink/blue/teal/yellow, `overflow:hidden`, `img{width:100%;display:block}`); `caption` is surfaced as the img `title` (non-destructive, accessible).
- **Self-contained constraints honored.** No `localStorage`/`sessionStorage` (grep-clean), no new dependency, no new external host, no build step; `entry.image` stays relative. Store/$LORE block (owned by 28-01) and the hero/commons/graph `<video>`s untouched.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
- Headless Chrome never fires the `.rv` IntersectionObserver in a static capture, and clamps its DOM to a ~500px minimum, so a raw screenshot of the served page shows the memes section hidden (opacity 0) and can't directly prove 390px. Resolved with the same harness used in Phase 27: a throwaway forced-reveal clone (`.rv{opacity:1!important}` + `section{min-height:auto}`) served over http (so relative `fetch('assets/memes.json')` resolves), plus `--dump-dom` over the *real unmodified* index.html to assert the rendered card count / alt text definitively. The 390px full-page PNG width == 390 confirms no horizontal overflow.

## Verification Evidence
- **grep gate (Task 1):** `fetch(.*memes.json` present (1); fetch guarded by `try{` + `.catch`; `memegrid` count 2; `assets/gen/` static refs 17 (≥4 fallback cards); `localStorage|sessionStorage` → NONE; schema fields `m.image`/`m.alt`/`m.caption` referenced.
- **http data-driven (`--dump-dom` of real index.html):** `data-static` removed, exactly 2 cards == memes.json length, seed alts present ("…agent with amnesia…", "$LORE coins raining…"). Visual: `/tmp/memes-shots/http-memes.png` (amnesia card pink shadow, coinrain card blue shadow).
- **file:// fallback (`--dump-dom`):** `data-static` retained, all 6 seeded `assets/gen/*` cards present (section not blank). Visual: `/tmp/memes-shots/clone-c3.png`.
- **Round-trip:** `node --import tsx src/agents/meme-agent/run.ts --text "round-trip check"` appended entry 3 (`source:svg`); unchanged site rendered 3 cards incl. `assets/gen/agent-2026-06-15-round-trip-check.svg`. Seed restored: `git status --porcelain site/assets/memes.json` clean (2 entries), test SVG removed.
- **Mobile:** `/tmp/memes-shots/mobile-http-full.png` pixelWidth == 390 (no horizontal overflow); `/tmp/memes-shots/mobile-memes.png` shows the two cards stacked single-column.
- **Regression:** `npx tsc --noEmit` exit 0; `git diff --name-only HEAD~1 HEAD` == `site/index.html` only (memes.json at committed seed).

## User Setup Required
None - no external service configuration required. (Live X posting + Cloudflare Pages deploy remain blocked-on-user per STATE, unchanged by this plan.)

## Next Phase Readiness
- AGENT-02 satisfied; with 28-01 (MERCH-01) and 28-02 (AGENT-01) already done, Phase 28 is 3/3 on disk. The agent now closes the loop "memes by the network": it appends to memes.json and the site surfaces entries automatically.
- No blockers introduced. When X creds land, live-posted memes (with `postedUrl`) will render through the same path.

## Self-Check: PASSED

- FOUND: `.planning/phases/28-merch-and-meme-agent/28-03-SUMMARY.md`
- FOUND: commit `9e1cb3e` (Task 1)
- FOUND: `fetch('assets/memes.json'` in `site/index.html`

---
*Phase: 28-merch-and-meme-agent*
*Completed: 2026-06-15*
