#!/usr/bin/env bash
#
# wellinformed demo — one-shot setup.
#
# Loads the 15-node cryogenic-LH2 research corpus into a fresh
# wellinformed home, then verifies the install with a sample query.
# Designed to be re-runnable: clears any prior state under
# ~/.wellinformed.demo so the demo always starts from the same place.
#
# Run from the wellinformed repo root:
#
#   bash demo/setup.sh
#
# Environment overrides:
#
#   WELLINFORMED_DEMO_HOME   alternate data home (default ~/.wellinformed.demo)
#   WELLINFORMED_DEMO_KEEP   set to "1" to skip the wipe step

set -euo pipefail

DEMO_HOME="${WELLINFORMED_DEMO_HOME:-$HOME/.wellinformed.demo}"
CORPUS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/research-corpus" && pwd)"

echo "── wellinformed demo setup ─────────────────────────────"
echo "  data home:  $DEMO_HOME"
echo "  corpus:     $CORPUS_DIR ($(ls "$CORPUS_DIR" | wc -l | tr -d ' ') files)"
echo

# 1. Wipe prior demo state unless asked to keep it.
if [[ "${WELLINFORMED_DEMO_KEEP:-0}" != "1" ]]; then
  if [[ -d "$DEMO_HOME" ]]; then
    echo "→ archiving previous demo home"
    mv "$DEMO_HOME" "$DEMO_HOME.archived-$(date +%s)"
  fi
fi
mkdir -p "$DEMO_HOME"

# 2. Stop any running daemon to avoid lock contention while we onboard.
WELLINFORMED_HOME="$DEMO_HOME" wellinformed daemon stop 2>/dev/null || true

# 3. Onboard non-interactively. The wizard creates identity + system
#    rooms + Claude Code hooks. --no-sessions keeps it fast for the
#    demo (we're not ingesting Claude history here).
echo "→ onboarding (this should take < 5 s)"
WELLINFORMED_HOME="$DEMO_HOME" wellinformed onboard --yes --no-sessions

# 4. Index the corpus into the local-only "research" room.
#    `wellinformed this me` walks the current directory, chunks every
#    file, embeds it locally, and registers entities. Output is
#    deterministic across runs (chunk ids derived from source_uri).
echo
echo "→ indexing 15 research notes (this should take ~2 s)"
(cd "$CORPUS_DIR" && WELLINFORMED_HOME="$DEMO_HOME" wellinformed this me)

# 5. Smoke-test the install.
echo
echo "── verification ──────────────────────────────────────"
echo "→ sample query: \"ML methods for liquid hydrogen leak detection\""
WELLINFORMED_HOME="$DEMO_HOME" wellinformed ask \
  "ML methods for liquid hydrogen leak detection" --k 3

echo
echo "── ready ────────────────────────────────────────────"
echo "  Demo data home: $DEMO_HOME"
echo
echo "  Try:"
echo "    WELLINFORMED_HOME=$DEMO_HOME wellinformed ask \"who runs the cryo lab at stanford\""
echo "    WELLINFORMED_HOME=$DEMO_HOME wellinformed recall stanford-cryo-lab"
echo "    WELLINFORMED_HOME=$DEMO_HOME wellinformed metrics | jq ."
echo
echo "  Recording? Follow demo/MANUSCRIPT.md scene-by-scene."
