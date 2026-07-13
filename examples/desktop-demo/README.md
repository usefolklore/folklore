# Desktop demo — the folklore workspace

A full-desktop scene showing what folklore feels like in daily use: you ask your
agent a question, and instead of hitting the web it **pulls the answer from a
peer's tree** — then, moments later, **other peers pull from yours**. Both
directions surface through the macOS **notch island** (Dynamic-Island style),
with the folklore menubar client showing the contribution ledger climb live.

- `assets/folklore-desktop.mp4` — crisp, natural pace (~27s), for the site / `<video>`
- `assets/folklore-desktop.gif` — lighter, 1.4× tighter (~20s), for the README

## What the scene shows

1. **You pull (cyan island).** Three questions — a tokio `Send` cache, axum
   extractor ordering, sqlx offline prep. Each resolves from a named peer's tree
   (`← @sam-rs`, `← @leo-k`, `← @mira-dev`) with **0 web calls**.
2. **Peers pull from you (green island).** The same traces you worked out answer
   `@tia-async`, `@noah-go`, `@priya-rs`. The menubar client's reputation and
   "helped N peers" tick up in real time.

The thesis: reasoning compounds across the network, like torrents seeding.

## Regenerate

The scene is a single self-contained `scene.html` (no external assets). Recorded
deterministically through the installed Chrome via Playwright:

```bash
cd examples/desktop-demo
node record.mjs "$PWD/scene.html" ./out 30      # → out/*.webm (needs playwright-core + Chrome)

# encode
V=$(ls out/*.webm)
ffmpeg -y -ss 0.3 -t 27.4 -i "$V" -c:v libx264 -pix_fmt yuv420p -crf 20 \
  -movflags +faststart ../../assets/folklore-desktop.mp4
ffmpeg -y -ss 0.3 -t 27.4 -i "$V" \
  -vf "setpts=PTS/1.4,fps=12,scale=1000:-1:flags=lanczos,palettegen=stats_mode=diff" /tmp/pal.png
ffmpeg -y -ss 0.3 -t 27.4 -i "$V" -i /tmp/pal.png \
  -lavfi "setpts=PTS/1.4,fps=12,scale=1000:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" \
  ../../assets/folklore-desktop.gif
```

`scene.html` is a designed composite — the peer handles and node ids are
representative. The notifications it depicts are the real ones the node fires
(`notifyYouPulled` / `notifyPeerRequest`, see `src/infrastructure/notify.ts`);
the menubar client is the real one in `client/menubar-macos/`.
