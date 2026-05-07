# wellinformed — demo

This directory contains the end-to-end demo: a 15-note research corpus, the script
that loads it, a manuscript that walks the recording scene-by-scene, and the rendered
artifacts.

## Quickstart

```bash
bash demo/setup.sh         # loads the corpus into ~/.wellinformed.demo
vhs demo/screencast.tape   # renders demo/screencast.gif (terminal scenes)
vhs demo/timing.tape       # renders demo/timing.gif    (headline-only teaser)
```

After `setup.sh`, you can also explore by hand:

```bash
export WELLINFORMED_HOME=$HOME/.wellinformed.demo

wellinformed ask "ML methods for liquid hydrogen leak detection" --k 3
wellinformed recall stanford-cryo-lab
wellinformed recall nasa-glenn
wellinformed metrics | jq .
```

## Files

| Path                      | Purpose                                          |
|---------------------------|--------------------------------------------------|
| `MANUSCRIPT.md`           | 8-scene shooting script (full demo).             |
| `setup.sh`                | One-shot reproducible corpus load.               |
| `research-corpus/*.md`    | 15 markdown notes on cryogenic-LH2 detection.    |
| `screencast.tape`         | VHS script for the terminal-only scenes.         |
| `timing.tape`             | VHS script for the headline-timing teaser.       |
| `scene-claude.tape`       | VHS script for the side-by-side timing comparison. |
| `scene-codebase.tape`     | VHS script for the codebase Q&A in `claude -p`.  |
| `scene-touch.tape`        | VHS script for the 5-peer P2P touch demo.        |
| `setup-p2p.sh`            | Spins up 5 daemons (peer A + B/C/D/E) on 127.0.0.1. |
| `teardown-p2p.sh`         | Stops every demo daemon (idempotent; `--wipe` archives homes too). |
| `scene-touch.sh`          | One-shot orchestrator: setup → record → teardown via EXIT trap. |
| `screencast.gif`          | Rendered output (1100×720, ~770 KB).             |
| `timing.gif`              | Rendered output (1100×480, ~180 KB).             |
| `scene-claude.gif`        | Side-by-side: Claude alone vs Claude + wellinformed (1200×800, ~350 KB). |
| `scene-codebase.gif`      | Codebase Q&A — `claude -p` cites `src/daemon/job-queue.ts` directly via the hook (1200×760, ~285 KB). |
| `scene-touch.gif`         | P2P touch — peer A pulls exclusive notes from peers B and D in a 5-daemon mesh (1200×760, ~640 KB). |
| `screenshots/`            | Stills from the live screen capture (recorder fills). |

## What the GIFs cover vs what needs live capture

The VHS-rendered GIFs are real recordings of `wellinformed` running against the
real corpus — no faking. They cover scenes that fit a single terminal pane.

| Scene                          | Where covered                |
|--------------------------------|------------------------------|
| 0 · title                      | `screencast.gif`             |
| 1 · load corpus                | implicit (run `setup.sh`)    |
| 2 · direct ask + timing        | `screencast.gif`, `timing.gif` |
| 3 · Claude Code hook injection | covered inside `scene-claude.gif` (Run B path) |
| 4 · side-by-side timing        | `scene-claude.gif` ✓         |
| 5 · entity recall              | `screencast.gif`             |
| 6 · P2P touch (peer pull)      | `scene-touch.gif` ✓ (5-peer mesh) |
| 7 · codebase Q&A in Claude     | `scene-codebase.gif` ✓       |
| 8 · closing card               | `screencast.gif`             |

**Recording the P2P scene end-to-end:**

```bash
bash demo/scene-touch.sh
```

Spins up peer A + 4 peers (B/C/D/E) on 127.0.0.1, each in its own
`~/.wellinformed.demo*` home with a unique research note. Records the
touch + ask flow via VHS. An EXIT trap guarantees every daemon stops
when the script finishes — even on Ctrl-C or crash. Re-runnable; each
invocation rebuilds the 5-peer mesh from scratch.

## Re-rendering

VHS reads the `.tape` file, drives a real shell, and writes the GIF. Each render
takes ~30 s. To change the demo, edit the tape and re-run `vhs demo/<file>.tape`.
The corpus stays loaded between renders unless you re-run `setup.sh`.

## Why not asciinema?

VHS produces deterministic, frame-perfect GIFs with theming + window chrome built in,
which is what social posts and READMEs actually consume. asciinema's `.cast` files are
better for browser-embedded interactive playback — we can add those later as a
companion artifact if we want both.
