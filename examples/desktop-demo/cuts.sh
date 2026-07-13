#!/usr/bin/env bash
# Distribution cuts from the master recording (out/*.webm).
#   ./cuts.sh out/page@xxxx.webm
# Master loop: cut 0.5s → 72.5s. Serve segment ≈ 57.4–66s; loop cut 0.5→73.0s.
set -euo pipefail
V="$1"; A="$(dirname "$0")/../../assets"
ffmpeg -y -ss 0.5 -t 72.5 -i "$V" -c:v libx264 -pix_fmt yuv420p -crf 19 -preset slow -movflags +faststart "$A/folklore-desktop.mp4"
ffmpeg -y -ss 0.5 -t 72.5 -i "$V" -vf "fps=6,scale=820:-1:flags=lanczos,palettegen=max_colors=80:stats_mode=diff" /tmp/pal.png
ffmpeg -y -ss 0.5 -t 72.5 -i "$V" -i /tmp/pal.png -lavfi "fps=6,scale=820:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4" "$A/folklore-desktop.gif"
ffmpeg -y -ss 57.4 -t 8 -i "$V" -vf "fps=12,scale=1000:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff" /tmp/palh.png
ffmpeg -y -ss 57.4 -t 8 -i "$V" -i /tmp/palh.png -lavfi "fps=12,scale=1000:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" "$A/folklore-hero.gif"
ffmpeg -y -ss 56.0 -t 12 -i "$V" -vf "crop=675:1200:582:0,scale=1080:1920:flags=lanczos" -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart "$A/folklore-vertical.mp4"
