# Session handoff — 2026-07-14

**Branch**: `feat/contribution-reputation` → PR #17 (usefolklore/folklore).
**10 commits unpushed** (`7ace416`…`1146c36`) at handoff time — push pending owner approval.
Working tree clean; untracked (pre-existing, ignore): `.bench-data/`, `.envrc.local`, `.fastembed_cache/`, `folklore-rs/`.

## Shipped this session

### 1. Two-way P2P notifications (pushed before this handoff)
- `src/infrastructure/notify.ts` — `notifyPeerRequest` (peer pulled YOUR tree) + `notifyYouPulled` (you pulled a peer's tree). Real macOS notifications via terminal-notifier/osascript, rate-limited 1200ms, `FOLKLORE_NOTIFY=0` opt-out.
- Wired into `src/application/federated-ask.ts` (pullRemoteBodies) and `src/infrastructure/contribution.ts` (recordServed).

### 2. Native macOS menubar client — `client/menubar-macos/` (`7ace416`)
- Swift/AppKit, `LSUIElement`, uTorrent/Ollama-style. Glyph tracks daemon; dropdown: nodes/edges/vectors, connected peers, roster, contribution ledger (rep · helped · last serve), Start/Stop/Restart Daemon, Open Live Feed/Graph, Settings.
- `status.cjs` probe → `~/.folklore/menubar-status.json`; graph node count memoized on `graph.json` mtime (329MB file, never re-parsed unless changed).
- Build: `./build.sh [--install]`. Env: `FOLKLORE_BIN` (CLI path for daemon control), `FOLKLORE_HOME`, `FOLKLORE_NODE`, `FOLKLORE_STATUS_PROBE`.
- Verified live: app ran, owned a menubar item, cache refreshed on 4s timer.

### 3. Desktop demo — `examples/desktop-demo/`
- `scene.html` — self-contained designed composite (agreed with owner; not a screen grab). Brand-faithful: hearth logo animated (sway/lick/embers), paper/ink palette, Fraunces + Geist Mono (Google Fonts, `document.fonts.ready` gate), real M-series notch geometry (closed 190×32pt r6/14; open r19/24; concave top fillets), ticking menubar clock, folklore statusline strip in the terminal, `✻ Thinking…` shimmer, macOS pointer clicks the menubar client open.
- Narrative: opening card → **without folklore** (web spinner ticks to 14.2s) → **phase 1 querying peers** (3 pulls with receipts: 412/386/445ms · 0 web calls · saved ~90s/~2m/~75s) → **network-map beat** (wallpaper becomes topology: 6 named peers → @SaharBarak) → **phase 2 answering peers** (rep ticks in dropdown + statusline) → closing card (github.com/usefolklore/folklore).
- `record.mjs` — playwright-core + system Chrome, args: scene outDir seconds W H zoom (default 1920×1200 via body zoom 1.5 = native HD).
- `cuts.sh` — regenerates all assets from master webm. Current timings: loop cut 0.5→93.5s; serves ≈73–85s.
- **Pacing is deliberately slow** (owner pushed back twice): cards 5s, answers 4s, serves 3.6s, gif natural 1:1 — never speed up.
- **v1 backup**: `scene-v1.html` in-tree; v1 assets at commit `19da727`.
- Assets: `assets/folklore-desktop.mp4` (10M) / `.gif` (8.2M, under GitHub 10M cap) / `folklore-hero.gif` (3.0M, 9s serve moment) / `folklore-vertical.mp4` (1.3M, 9:16).

### 4. Manifesto — `docs/MANIFESTO.md`
Ten articles: reasoning is labor · re-derivation is a tax · mouth to ear · network smarter than node · shared memory shrinks the model (→ decentralized/edge models) · less inference is independence · no big brother in the loop · provenance over authority · local-first sovereignty · the commons compounds. Oath ending.

### 5. README
Desktop demo gif = hero (before/after numbers in caption); live-feed gif moved into "Day N: together"; new **Philosophy** section (4 condensed articles + link); Manifesto in top link row.

### 6. Site — `site/index.html`
- `#demo` "The Demonstration — Watch a Session" after `#problem`: autoplay-loop video in ink frame, `site/assets/folklore-desktop.{mp4,poster.jpg}`.
- `#creed` "The Creed — Why We Gather" band before `#join`: "the fire is ours to keep.", 6 articles in roman-numeral brutalist grid, oath + link to full manifesto. Scoped `.creed-*` styles, mobile collapse included.
- Both navs (desktop + mobile) gained Demo + Creed. Render-verified in headless Chrome at 1440w.

## Next steps
1. **Push 10 commits to PR #17** (owner approval pending at handoff).
2. Deploy site so #demo/#creed go live.
3. Optional: notarize/release the menubar client; post vertical/hero cuts.
4. `folklore live` command still exists (README references examples/live-feed) — fine, but demo supersedes it as the hero.

## Hard-won context (also in auto-memory `demo-craft-preferences`)
- No mocks passed off as real; designed composites only when explicitly agreed + labeled reproducible.
- Peers are PEOPLE (@handles), never "swarm"/"developers"; uTorrent framing.
- Repo is `usefolklore/folklore`.
- Owner's menubar auto-hides + screen may show private work — don't self-record the live desktop; use the scene pipeline.
- `.claude/helpers/gsd-statusline.js` (global) is the statusline Claude Code actually uses, not the project's ak-statusline.cjs.
