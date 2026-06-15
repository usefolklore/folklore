# Phase 27: Site Build-Out - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary
Finish the folk-pop marketing site (site/index.html): composition + mobile responsive sweep across all sections; add a Guidebook section and a Platform Culture section; build the real Store (merch + $LORE) structured for live products; verify the Cloudflare Pages build config. Single self-contained HTML file + assets under site/assets/. No backend.
</domain>

<decisions>
## Implementation Decisions
### Visual / brand (locked)
- Folk-pop / risograph. Palette: cream #f4ecd8, ink #1d1813, pink #ff4f6d, blue #2b3a8c, yellow #f5b921, teal #1fae8b. Fraunces (display) + Geist Mono. Hard sticker shadows, misregistered headers, scroll-snap sections (min-height:100svh), scroll-aware narrow→full navbar, blue marquee inside first viewport, animated scroll-cue, folk-spark logo.
- Keep clamped type scale (do NOT enlarge back). Each section confident within ~100svh.
### Discretion
Section content/layout at Claude's discretion within the brand. Guidebook = how it works / get started (install, hooks, ask, peer). Culture = the lore/commons/folk story. Store = merch products (tee/sticker/pin) + $LORE memecoin (bags.fm), structured so real products/links drop in later.
### Constraints
- Single-file HTML, zero external deps beyond Google Fonts. No browser storage. prefers-reduced-motion respected.
- hero/commons/graph are poster-backed <video> already — keep, don't break (mp4s arrive later, blocked on higgsfield credits).
- Mobile: single column, no horizontal scroll at 390px.
- Cloudflare Pages only (wrangler.toml + site/_headers exist). Do NOT deploy (blocked on user auth/domain).
- Do NOT touch src/ or break tsc. Conventional commits, no AI co-authors.
</decisions>

<code_context>
## Existing Code Insights
- site/index.html is the full folk-pop site. Assets in site/assets/gen/ (hero, commons, graph, coin, tee, stickers, memes, border, og). Logo inline SVG. wrangler.toml + site/_headers present.
- Verify visually via headless Chrome screenshot: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot=/tmp/x.png --window-size=1512,860 "file://.../site/index.html" ; and at 390 width for mobile.
</code_context>

<specifics>
## Specific Ideas
Reference jazz.security structure but keep folk-pop skin. Store should read like a real shop (product cards w/ price placeholders), $LORE section with bags.fm CTA + "not financial advice" disclaimer.
</specifics>

<deferred>
## Deferred Ideas
higgsfield video clips for hero/commons/graph (blocked on credits). Live deploy + domain (blocked on user). Real merch product photos (Phase 28 designs).
</deferred>
