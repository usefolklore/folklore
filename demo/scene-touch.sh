#!/usr/bin/env bash
#
# folklore demo — scene 6 (P2P touch) end-to-end orchestrator.
#
# Lifecycle (single execution):
#
#   1. trap EXIT to guarantee teardown — even on failure or Ctrl-C
#   2. setup-p2p.sh: 5 daemons up, A connected to B/C/D/E
#   3. vhs scene-touch.tape: records the touch + ask flow
#   4. teardown-p2p.sh: every daemon back down before this script exits
#
# Result: demo/scene-touch.gif, no daemons left running anywhere.
#
# Run from the repo root:
#
#   bash demo/scene-touch.sh
#
# Honours `FOLKLORE_DEMO_KEEP_DAEMONS=1` if you want to keep the
# 5-peer mesh alive after recording (e.g. for manual exploration).

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

cleanup() {
  if [[ "${FOLKLORE_DEMO_KEEP_DAEMONS:-0}" == "1" ]]; then
    echo
    echo "[scene-touch] FOLKLORE_DEMO_KEEP_DAEMONS=1 — leaving 5 daemons up."
    echo "                tear down later with: bash demo/teardown-p2p.sh"
    return
  fi
  echo
  echo "[scene-touch] tearing down 5-daemon mesh"
  bash "demo/teardown-p2p.sh" || true
}
trap cleanup EXIT

bash demo/setup-p2p.sh

# Surface the peer ids as env vars so the tape can reference them
# instead of hard-coding (peer ids regenerate every setup run).
export FOLKLORE_DEMO_PEER_B_ID=$(cat "$HOME/.folklore.demo/peer-B-id")
export FOLKLORE_DEMO_PEER_C_ID=$(cat "$HOME/.folklore.demo/peer-C-id")
export FOLKLORE_DEMO_PEER_D_ID=$(cat "$HOME/.folklore.demo/peer-D-id")
export FOLKLORE_DEMO_PEER_E_ID=$(cat "$HOME/.folklore.demo/peer-E-id")

echo
echo "[scene-touch] recording demo/scene-touch.tape → demo/scene-touch.gif"
vhs demo/scene-touch.tape
