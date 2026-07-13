#!/usr/bin/env bash
# Distribution cuts from the master recording (out/*.webm).
#   ./cuts.sh out/page@xxxx.webm
# Master loop: cut 0.5s → 62.6s. Serve segment ≈ 45.0–55.5s.
set -euo pipefail
V="$1"; A="$(dirname "$0")/../../assets"
ffmpeg -y -ss 0.5 -t 62.6 -i "$V" -c:v libx264 -pix_fmt yuv420p -crf 19 -preset slow -movflags +faststart "$A/folklore-desktop.mp4"
ffmpeg -y -ss 0.5 -t 62.6 -i "$V" -vf "setpts=PTS/1.7,fps=8,scale=920:-1:flags=lanczos,palettegen=max_colors=96:stats_mode=diff" /tmp/pal.png
ffmpeg -y -ss 0.5 -t 62.6 -i "$V" -i /tmp/pal.png -lavfi "setpts=PTS/1.7,fps=8,scale=920:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4" "$A/folklore-desktop.gif"
ffmpeg -y -ss 46.8 -t 6.4 -i "$V" -vf "fps=12,scale=1000:-1:flags=lanczos,palettegen=max_colors=128:stats_mode=diff" /tmp/palh.png
ffmpeg -y -ss 46.8 -t 6.4 -i "$V" -i /tmp/palh.png -lavfi "fps=12,scale=1000:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3" "$A/folklore-hero.gif"
ffmpeg -y -ss 45.0 -t 10.5 -i "$V" -vf "crop=675:1200:582:0,scale=1080:1920:flags=lanczos" -c:v libx264 -pix_fmt yuv420p -crf 20 -movflags +faststart "$A/folklore-vertical.mp4"
