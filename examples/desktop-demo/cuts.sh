#!/usr/bin/env bash
# Distribution cuts from the master recording (out/*.webm).
#   ./cuts.sh out/page@xxxx.webm
# Master loop: cut 0.5s → 93.0s. Serve segment ≈ 73–85s; loop cut 0.5→93.5s.
set -euo pipefail
V="$1"; A="$(dirname "$0")/../../assets"
ffmpeg -y -ss 0.5 -t 93.0 -i "$V" -c:v libx264 -pix_fmt yuv420p -crf 19 -preset slow -movflags +faststart "$A/folklore-desktop.mp4"
ffmpeg -y -ss 0.5 -t 93.0 -i "$V" -vf "fps=5,scale=800:-1:flags=lanczos,palettegen=max_colors=72:stats_mode=diff" /tmp/pal.png
ffmpeg -y -ss 0.5 -t 93.0 -i "$V" -i /tmp/pal.png -lavfi "fps=5,scale=800:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4" "$A/folklore-desktop.gif"
ffmpeg -y -ss 73.0 -t 9 -i "$V" -vf "fps=12,scale=1000:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff" /tmp/palh.png
ffmpeg -y -ss 73.0 -t 9 -i "$V" -i /tmp/palh.png -lavfi "fps=12,scale=1000:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" "$A/folklore-hero.gif"
ffmpeg -y -ss 72.0 -t 13 -i "$V" -vf "crop=675:1200:582:0,scale=1080:1920:flags=lanczos" -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart "$A/folklore-vertical.mp4"
