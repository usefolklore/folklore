#!/usr/bin/env bash
# Rasterize the SVG OG cards in docs/assets/ to PNG for platforms that
# require raster (Twitter/X, LinkedIn). Outputs PNGs alongside the
# source SVGs.
#
# Dependencies (one of):
#   - rsvg-convert  (brew install librsvg)        ← preferred, fastest, pure C
#   - npx @resvg/resvg-js-cli                     ← npm fallback, needs node
#
# Run: bash scripts/render-og-cards.sh

set -euo pipefail

ASSETS_DIR="docs/assets"
TARGETS=(
  "og-card:1200:630"
  "og-square:1200:1200"
  "og-portrait:1080:1920"
)

# Pick the first available rasterizer
if command -v rsvg-convert >/dev/null 2>&1; then
  RENDERER="rsvg-convert"
  echo "[render-og] using rsvg-convert (librsvg)"
elif command -v npx >/dev/null 2>&1; then
  RENDERER="npx-resvg"
  echo "[render-og] using npx @resvg/resvg-js-cli (slower first run)"
else
  echo "[render-og] error: neither rsvg-convert nor npx is on PATH."
  echo "[render-og]   install librsvg:  brew install librsvg     (macOS)"
  echo "[render-og]                     apt install librsvg2-bin (Debian/Ubuntu)"
  exit 1
fi

cd "$(dirname "$0")/.."

for target in "${TARGETS[@]}"; do
  IFS=':' read -r name w h <<< "$target"
  src="$ASSETS_DIR/$name.svg"
  out="$ASSETS_DIR/$name.png"

  if [[ ! -f "$src" ]]; then
    echo "[render-og] skip $name (source $src not found)"
    continue
  fi

  case "$RENDERER" in
    rsvg-convert)
      rsvg-convert --width="$w" --height="$h" --output="$out" "$src"
      ;;
    npx-resvg)
      npx --yes @resvg/resvg-js-cli --fit-width "$w" "$src" "$out"
      ;;
  esac

  bytes=$(wc -c < "$out" | tr -d ' ')
  echo "[render-og] $name.png  ${w}x${h}  ${bytes} bytes"
done

echo "[render-og] done. PNGs written to $ASSETS_DIR/"
