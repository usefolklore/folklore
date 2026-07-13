# folklore — macOS menubar client

A lightweight status-bar agent for the local folklore node — the way uTorrent
or Ollama live in the menubar. A glyph whose fill tracks the daemon, and a
dropdown that shows what your node holds, who it is connected to, and what it
has contributed back to the network, with one-click daemon control.

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

No Electron, no Python, no runtime dependency — a single compiled Swift/AppKit
binary (`LSUIElement`, so no Dock icon). It reads a compact snapshot written by
`status.cjs` (`~/.folklore/menubar-status.json`) so opening the menu never
blocks on a graph parse; a 4-second timer refreshes the snapshot in the
background. The graph node count is memoised against `graph.json`'s mtime — a
huge unchanged graph costs nothing to re-read.

## Build

```bash
./build.sh              # → build/folklore.app
./build.sh --install    # also copies to /Applications
```

Requires the Swift toolchain (`swiftc`, ships with Xcode / Command Line Tools)
and `node` for the status probe + daemon control.

## Configuration

All optional — sensible defaults resolve automatically:

| Env | Default | Purpose |
|-----|---------|---------|
| `FOLKLORE_HOME` | `~/.folklore` | node data dir the client reads |
| `FOLKLORE_BIN` | — | path to `bin/folklore.js` for daemon control (Start/Stop/Restart, Live Feed) |
| `FOLKLORE_NODE` | first of homebrew/usr/local/usr | `node` binary |
| `FOLKLORE_STATUS_PROBE` | bundled `status.cjs` | status probe script |

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
- `graph.json` / `vectors.db` — node/edge/vector counts
- `linked-accounts.json` — GitHub identity for the header
