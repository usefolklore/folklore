# Folklore desktop

The cross-platform desktop app for folklore — one Tauri (Rust + webview) codebase
that ships as native installers for macOS, Windows, and Linux. It replaces the
macOS-only Swift menubar client (`client/menubar-macos`).

Two surfaces:

- **Setup wizard** (`src/index.html`) — the "download installs everything, no
  command" window. One button runs `folklore onboard`, which creates the signed
  identity, starts the daemon, and registers the folklore MCP server in every AI
  coding tool on the machine (Claude Code, Cursor, Cline, Windsurf, Gemini CLI,
  Zed, opencode, Roo). A live list shows which tools were detected.
- **Peer-activity island** (`src/island.html`) — left-click the tray icon for a
  near-black island popover (the notch spot on a MacBook; a floating pill
  elsewhere) that tails `~/.folklore/activity-feed.jsonl` and shows the latest
  trace a peer sent or pulled. Right-click the tray for the menu.

## How it drives folklore

The heavy lifting is the Node CLI (`@usefolklore/folklore`): daemon, MCP server,
`onboard`, `harness`. The Rust shell (`src-tauri/src/lib.rs`) resolves and runs
it, in this order:

1. A system-installed `folklore` on PATH (probing nvm / fnm / volta / bun /
   Homebrew / global-npm, since a double-clicked GUI app inherits none of these).
2. **The bundled Node runtime** (zero system Node): the app carries a clean Node
   dist under `resources/node`. On first run it uses that node + npm to
   `install -g @usefolklore/folklore --prefix <app-data>/cli`, then runs the
   installed CLI's `bin/folklore.js` **directly** with the bundled node. (The
   dist's `bin/npx`/`bin/npm` symlinks get flattened by the bundler, so invoking
   the entry `.js` directly is the reliable path — verified against a shipped
   `.dmg` with system Node removed from PATH.)
3. System `npx` on the published package.
4. A clear "install Node" error.

Single-file bundling isn't possible — the CLI has native addons (better-sqlite3,
sqlite-vec, onnx, tree-sitter, sharp) — which is why the Node runtime is bundled
and the deps are fetched (with the platform's native prebuilds) at first run.

## Build

```bash
npm install
npm run tauri dev      # run locally (uses system Node; resources/node is empty in the repo)
npm run tauri build    # produce installers for the current OS
```

`resources/node` holds only a README in git; the real per-platform Node payload
is fetched and lipo'd (universal on macOS) by the release workflow. A local
`tauri build` therefore falls back to system Node — that's expected.

## Release

`.github/workflows/desktop-release.yml` builds on macOS / Windows / Linux for
every `desktop-v*` tag: bundles the platform Node, then emits `.dmg` (universal),
`.msi` + NSIS `.exe`, and `.AppImage` + `.deb`, attached to a draft GitHub
release. macOS signing/notarization turns on automatically when the `APPLE_*`
repo secrets are set.

Icons (app, installer, tray) are generated from `site/assets/folklore-hero.svg`
— the hero-section hearth — via `tauri icon`.
