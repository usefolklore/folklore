#!/usr/bin/env bash
#
# akashik demo — one-shot setup.
#
# Loads the 15-node cryogenic-LH2 research corpus into a fresh
# akashik home, then verifies the install with a sample query.
# Designed to be re-runnable: clears any prior state under
# ~/.akashik.demo so the demo always starts from the same place.
#
# Run from anywhere:
#
#   bash demo/setup.sh
#
# Environment overrides:
#
#   AKASHIK_DEMO_HOME   alternate data home (default ~/.akashik.demo)
#   AKASHIK_DEMO_KEEP   set to "1" to skip the wipe step

set -euo pipefail

DEMO_HOME="${AKASHIK_DEMO_HOME:-$HOME/.akashik.demo}"
CORPUS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/research-corpus" && pwd)"

echo "── akashik demo setup ─────────────────────────────"
echo "  data home:  $DEMO_HOME"
echo "  corpus:     $CORPUS_DIR ($(ls "$CORPUS_DIR" | wc -l | tr -d ' ') files)"
echo

# 1. Wipe prior demo state unless asked to keep it.
if [[ "${AKASHIK_DEMO_KEEP:-0}" != "1" ]]; then
  if [[ -d "$DEMO_HOME" ]]; then
    echo "→ archiving previous demo home"
    mv "$DEMO_HOME" "$DEMO_HOME.archived-$(date +%s)"
  fi
fi
mkdir -p "$DEMO_HOME"

# 2. Stop any running daemon to avoid lock contention while we onboard.
AKASHIK_HOME="$DEMO_HOME" akashik daemon stop 2>/dev/null || true

# 3. Load each markdown note via `akashik save`. Each file is
#    one canonical "concept" node in the local-only research room.
#    The label is read from the first markdown heading; the body is
#    streamed via stdin so chunking + embedding happens server-side
#    in one shot. Output is suppressed for cleanliness.
echo "→ ingesting 15 research notes (~3 s)"
loaded=0
for f in "$CORPUS_DIR"/*.md; do
  label=$(head -1 "$f" | sed -E 's/^#+[[:space:]]*//' | tr -d '\r')
  if [[ -z "$label" ]]; then
    label=$(basename "$f" .md)
  fi
  if AKASHIK_HOME="$DEMO_HOME" akashik save \
       --room research \
       --type concept \
       --label "$label" \
       <"$f" >/dev/null 2>&1; then
    loaded=$((loaded + 1))
  else
    echo "  ! failed: $(basename "$f")"
  fi
done
echo "  ✓ $loaded / $(ls "$CORPUS_DIR" | wc -l | tr -d ' ') notes ingested"

# 4. Smoke-test the install.
echo
echo "── verification ──────────────────────────────────────"
echo "→ sample query: \"ML methods for liquid hydrogen leak detection\""
echo
AKASHIK_HOME="$DEMO_HOME" akashik ask \
  "ML methods for liquid hydrogen leak detection" --k 3 | head -25

echo
echo "── ready ────────────────────────────────────────────"
echo "  Demo data home: $DEMO_HOME"
echo
echo "  Try:"
echo "    AKASHIK_HOME=$DEMO_HOME akashik ask \"who runs the cryo lab at stanford\""
echo "    AKASHIK_HOME=$DEMO_HOME akashik recall stanford-cryo-lab"
echo "    AKASHIK_HOME=$DEMO_HOME akashik metrics | jq ."
echo
echo "  Recording? Follow demo/MANUSCRIPT.md scene-by-scene."
