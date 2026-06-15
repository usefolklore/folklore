# Phase 28: Merch & Meme-Agent - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary
Two deliverables: (1) real merch product designs/mockups derived from the folk art, wired into the site Store; (2) an autonomous Twitter meme-agent scaffold — a runnable pipeline that generates a folk-pop meme, posts to X, and appends it to the site /store (or memes), runnable once X API credentials exist. Code + design only; no live posting, no external accounts created.
</domain>

<decisions>
## Implementation Decisions
### Merch (MERCH-01)
- Use existing folk art in site/assets/gen/ (tee.png, char1/sun/bird/fishflower, coin.png, border). Produce print-ready design specs + mockup composites (the mark on dark cotton, sticker sheet, enamel pin) and wire them into the Store product cards built in Phase 27 (replace placeholders with the mockup images + real spec). Do NOT require higgsfield credits (blocked); craft from existing assets / SVG / CSS composites. If a higgsfield gen is trivially affordable (~1 credit) it may be used, else skip.
### Meme-agent (AGENT-01, AGENT-02)
- Scaffold a standalone Node/TS pipeline (e.g. under tools/meme-agent/ or src/agents/): generate meme (higgsfield nano_banana_2 folk-pop, or a templated SVG/canvas meme from existing art as a no-credit fallback) → post to X (via X API v2, credentials from env: X_API_KEY etc.) → append entry to a site-readable data file (e.g. site/assets/memes.json) that the site Store/Memes section renders.
- MUST be runnable end-to-end with mocked/credential-gated X access (dry-run mode when no creds) — NO live post in this phase. Document the env vars + run command.
- AGENT-02: the site reads the memes data file (site/assets/memes.json) to render agent-posted memes in the memes/store area.
### Constraints
- No claude/anthropic git co-authors. tsc stays 0 (if TS added, it compiles; keep deps minimal — max 3). Do NOT post to X, do NOT create accounts, do NOT spend beyond ~1 higgsfield credit. Respect blocked-on-user items. Single-file site stays self-contained (memes.json is a data file it fetches, OR inline — prefer a small fetch with graceful fallback so file:// still works).
</constraints>
</decisions>

<code_context>
## Existing Code Insights
- Folk art assets in site/assets/gen/. Store product cards (.prod) + memes grid exist in site/index.html. higgsfield CLI available (~1 credit left). Project is TS/ESM functional DDD; there is already an X/Twitter publish command in the codebase (from v1 "publish" feature) — reuse its OAuth/posting patterns if present (grep src for twitter/x/publish/oauth).
</code_context>

<specifics>
## Specific Ideas
The meme-agent should be the seed of "memes by the network, for the network" — autonomous, scheduled-capable (document how to cron it), dry-run safe.
</specifics>

<deferred>
## Deferred Ideas
Live X posting (blocked on creds). Bulk higgsfield meme generation (blocked on credits). Real merch fulfilment/print-shop integration (blocked on user).
</deferred>
