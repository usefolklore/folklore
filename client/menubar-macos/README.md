# folklore — macOS menubar client

A lightweight status-bar agent for the local folklore node. The website's
current hearth mark tracks daemon state in the menu bar, while a native
top-center island expands when real traces cross the peer network. The dropdown
shows what your node holds, who it is connected to, and what it has contributed
back to the network, with one-click daemon control.

The island tails the append-only `~/.folklore/activity-feed.jsonl` written by
successful search/fetch serves and successful remote pulls. On a notched Mac,
its compact leading and trailing regions wrap the measured hardware sensor;
on another display it uses the same content in a floating pill:

```
              [mark PULL] ┌── sensor ──┐ [+638 TOK ●]
            ┌─────────────┘            └──────────────┐
            │ TRACE RECEIVED · @PEER-LAB              │
            │ peer-traces-compound-knowledge          │
            │ @peer-lab → YOUR GRAPH   2 NODES · 638T │
            │ ●━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━● │
            └─────────────────────────────────────────┘
```

New activity first updates the compact regions, blooms below the sensor, then
settles back to live peer status. Hovering or clicking reopens the latest event.
It starts at the end of the file, queues bursts, joins all Spaces, detects the
physical notch through `NSScreen`, and respects macOS Reduce Motion. The feed
contains peer IDs, node IDs, counts, and an approximate payload-token count
only; it never stores query or trace text.

Use **Preview Activity Island** in the menu to exercise the exact presentation
without adding a synthetic record to the network activity feed.

Open [`preview.html`](preview.html) for the interactive browser rendering. Its
pull, share, and match controls exercise the same compact → expanded → compact
state sequence as the native panel.

The interaction and content hierarchy follow Apple's compact, minimal, and
expanded Live Activity guidance and the sensor-aware sizing used by native
macOS projects such as [Boring Notch](https://github.com/TheBoredTeam/boring.notch)
and [Atoll](https://github.com/Ebullioscopic/Atoll). The Folklore implementation
is original AppKit code and does not copy their GPL source.

```
 point.3.connected  ← menubar glyph (slashed when the daemon is down)

 ┌──────────────────────────────────────┐
 │ folklore · @SaharBarak               │
 │ ● running · 3 peers connected        │
 │ ──────────────────────────────────── │
 │ 📊  91,418 nodes · 623,464 edges     │
 │ 🔍  206,814 vectors indexed          │
 │ 🌐  6 peers known                    │
 │ 🏅  23 rep · helped 12 peers         │
 │ ⚡  answered @sam-rs 40s ago         │
 │ ──────────────────────────────────── │
 │ Open Live Feed                       │
 │ Open Graph                           │
 │ ──────────────────────────────────── │
 │ Restart Daemon                       │
 │ Stop Daemon                          │
 │ Settings…                            │
 │ ──────────────────────────────────── │
 │ Quit folklore                        │
 └──────────────────────────────────────┘
```

## Why native

No Electron, no Python, no UI runtime dependency — a compiled Swift/AppKit
binary (`LSUIElement`, so no Dock icon). It reads a compact snapshot written by
`status.cjs` (`~/.folklore/menubar-status.json`) so opening the menu never
blocks on a graph parse; a 4-second timer refreshes the snapshot in the
background. The graph node count is memoised against `graph.json`'s mtime — a
huge unchanged graph costs nothing to re-read.

## Build

```bash
./build.sh              # → build/folklore.app (host arch — fast, for dev)
./build.sh --universal  # arm64 + x86_64 fat binary — what Release ships
./build.sh --install    # also copies to /Applications
```

Requires the Swift toolchain (`swiftc`, ships with Xcode / Command Line Tools)
and `node` for the status probe + daemon control.

## Distribution

`.github/workflows/release.yml` builds `--universal` on a `macos-14` runner,
verifies the bundle really is fat (an unflagged `swiftc` silently emits host-arch
only, which ships an app Intel Macs can't run), zips it with `ditto`, and
attaches `folklore-macos.zip` to the GitHub release for every `v*` tag. The site
links `releases/latest/download/folklore-macos.zip`, which resolves to whatever
the newest tag published.

The build is **ad-hoc signed, not notarized** — that needs a paid Apple Developer
ID, which this project doesn't have yet. Consequence: a plain download is
quarantined and macOS makes the user allow it under System Settings → Privacy &
Security. A Homebrew cask would side-step that (`brew install --cask` strips the
quarantine flag) and is the usual route for unsigned open-source Mac apps.

## Configuration

All optional — sensible defaults resolve automatically:

| Env | Default | Purpose |
|-----|---------|---------|
| `FOLKLORE_HOME` | `~/.folklore` | node data dir the client reads |
| `FOLKLORE_BIN` | — | path to `bin/folklore.js` for daemon control (Start/Stop/Restart, Live Feed) |
| `FOLKLORE_NODE` | first of homebrew/usr/local/usr | `node` binary |
| `FOLKLORE_STATUS_PROBE` | bundled `status.cjs` | status probe script |
| `FOLKLORE_ISLAND` | `1` | set to `0` to hide the top-center activity island |

Launch with a wired CLI:

```bash
open build/folklore.app \
  --env FOLKLORE_BIN="$PWD/../../bin/folklore.js" \
  --env FOLKLORE_STATUS_PROBE="$PWD/status.cjs"
```

Without `FOLKLORE_BIN` the client still shows live status; the daemon-control and
live-feed items are inert (they need to know where the CLI lives).

## What it reads

Everything comes from files the daemon already maintains — no new protocol:

- `daemon.pid` — liveness (pid existence check)
- `daemon.log` — latest `connected_peers=N` marker
- `peers.json` — standing roster
- `contribution.json` — reputation, peers helped, last serve
- `activity-feed.jsonl` — successful pull/serve events for the native island
- `graph.json` / `vectors.db` — node/edge/vector counts
- `linked-accounts.json` — GitHub identity for the header

The app bundles `folklore-logo.svg`, `folklore-navbar.svg`,
`folklore-favicon.svg`, `folklore-spark.svg`, and `folklore-mark.svg` directly
from `site/assets/` at build time so its marks stay aligned with the newest
website version.

## Island design contract

The island follows the shape of a macOS Live Activity: it grows out of the camera
notch (not a card floating below it), content lives in the two wings beside the
camera plus a body below, and it expands and collapses on one spring. `Brand` in
`activity-island.swift` is the single source of colour truth.

Colour is drawn from `.term` in `site/assets/site.css` — surface `#171310` (never
`#000`, which reads as a hole punched in a warm palette), paper `#f4ecd8`, and one
accent per direction: teal for a trace pulled in, pink for one served out, yellow
for a local match.

- **Type is the system font.** Everything is SF Pro (`.systemFont`), with
  `.monospacedDigitSystemFont` for aligned numbers only. An earlier version set
  the whole island in Geist Mono / Fraunces; monospace-on-prose read as amateur,
  and neither font ships on a stock Mac. SF Pro is native, so `preview.html` and
  the app render identically — no divergence to caveat.
- **The marks.** The wing shows `folklore-spark.svg` (flame only) — it never
  exceeds 18pt, where the full mark's figures would be mush, and it keeps the
  site's `flsway` flicker. The expanded body leads with `folklore-mark.svg` (the
  full campfire-and-tellers logo, recoloured for a dark surface) in a 40pt
  app-icon tile, where the figures read. The favicon is unusable in either spot:
  it paints a `#1d1813` card that disappears into the island surface.
- **The peer is humanized.** A published GitHub identity shows as `@handle`;
  everyone else gets a short deterministic tag (`peer-bxn6`), never a raw
  truncated hash. The context is plain English ("sent you 2 nodes").

The layout, morph physics (one spring, response ≈ 0.38s, critically damped on
close), and hover hysteresis are documented inline in `activity-island.swift`.
