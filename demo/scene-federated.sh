#!/usr/bin/env bash
#
# akashik demo — scene "federated" end-to-end orchestrator.
#
# 1. trap EXIT to guarantee teardown — even on failure or Ctrl-C
# 2. setup-p2p.sh: 5 daemons up, peer A connected to B/C/D/E,
#    each remote peer holding one exclusive note
# 3. vhs scene-federated.tape: records peer-list + federated ask
# 4. teardown-p2p.sh: every daemon back down on exit
#
# Result: demo/scene-federated.gif, no daemons left running.
#
# Run from repo root:
#   bash demo/scene-federated.sh

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

cleanup() {
  if [[ "${AKASHIK_DEMO_KEEP_DAEMONS:-0}" == "1" ]]; then
    echo
    echo "[scene-federated] AKASHIK_DEMO_KEEP_DAEMONS=1 — leaving 5 daemons up."
    echo "                  tear down later with: bash demo/teardown-p2p.sh"
    return
  fi
  echo
  echo "[scene-federated] tearing down 5-daemon mesh"
  bash "demo/teardown-p2p.sh" || true
}
trap cleanup EXIT

bash demo/setup-p2p.sh

echo
echo "[scene-federated] recording demo/scene-federated.tape → demo/scene-federated.gif"
vhs demo/scene-federated.tape
