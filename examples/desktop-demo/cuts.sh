#!/usr/bin/env bash
# Distribution cuts from the master recording (out/*.webm).
#   ./cuts.sh out/page@xxxx.webm
# Master loop: cut 0.5s → 93.0s. Serve ≈ 13–18s; loop cut 0.7→21.0s (typeQ→typeQ, seamless).
set -euo pipefail
V="$1"; A="$(dirname "$0")/../../assets"
ffmpeg -y -ss 0.7 -t 20.3 -i "$V" -c:v libx264 -pix_fmt yuv420p -crf 19 -preset slow -movflags +faststart "$A/folklore-desktop.mp4"
ffmpeg -y -ss 0.7 -t 20.3 -i "$V" -vf "fps=10,scale=960:-1:flags=lanczos,palettegen=max_colors=112:stats_mode=diff" /tmp/pal.png
ffmpeg -y -ss 0.7 -t 20.3 -i "$V" -i /tmp/pal.png -lavfi "fps=10,scale=960:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4" "$A/folklore-desktop.gif"
ffmpeg -y -ss 12.8 -t 6.2 -i "$V" -vf "fps=12,scale=1000:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff" /tmp/palh.png
ffmpeg -y -ss 12.8 -t 6.2 -i "$V" -i /tmp/palh.png -lavfi "fps=12,scale=1000:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" "$A/folklore-hero.gif"
ffmpeg -y -ss 11.5 -t 8.8 -i "$V" -vf "crop=675:1200:582:0,scale=1080:1920:flags=lanczos" -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart "$A/folklore-vertical.mp4"
