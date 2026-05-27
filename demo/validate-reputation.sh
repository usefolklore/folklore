#!/usr/bin/env bash
#
# akashik demo — peer reputation validation harness.
#
# Spins up the 5-daemon mesh (setup-p2p.sh), runs a few federated
# asks from peer A, then inspects the populated peer-reputation.json
# via `akashik peers rep` to verify the wire-up actually
# accumulates observations end-to-end. Exit trap stops every daemon
# when this finishes — same pattern as demo/scene-touch.sh.
#
# Run from the repo root:
#
#   bash demo/validate-reputation.sh
#
# Set AKASHIK_DEMO_KEEP_DAEMONS=1 to inspect the running mesh
# manually after this exits.

set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

A_HOME="${AKASHIK_DEMO_HOME:-$HOME/.akashik.demo}"

cleanup() {
  if [[ "${AKASHIK_DEMO_KEEP_DAEMONS:-0}" == "1" ]]; then
    echo
    echo "[validate-rep] keeping 5 daemons up — tear down with: bash demo/teardown-p2p.sh"
    return
  fi
  echo
  echo "[validate-rep] tearing down 5-daemon mesh"
  bash demo/teardown-p2p.sh || true
}
trap cleanup EXIT

echo "── reputation validation harness ──────────────────────"
echo "  peer A home: $A_HOME"
echo

# 1. Stand up the mesh (5 daemons, peer-attribution wired).
bash demo/setup-p2p.sh

# `akashik ask --peers` boots its OWN ephemeral libp2p node and
# loads peer-identity.json. If peer A's daemon is also running, the
# two libp2p nodes both try to claim the same peerId — they fight,
# the ephemeral node can't connect, peers_queried stays 0.
# Stop peer A's daemon for the validation; the other 4 peers (B/C/D/E)
# keep serving search/recall, which is all the asks need.
echo
echo "→ stopping peer A daemon so CLI ephemeral node owns the peerId"
AKASHIK_HOME="$A_HOME" akashik daemon stop || true
# Remove the stale daemon.sock — the bin/akashik.js shim's
# `existsSync(sockPath)` check otherwise tries to IPC-delegate ask
# calls and gets ECONNREFUSED instead of falling through to the
# spawn path that actually runs the federated logic.
rm -f "$A_HOME/daemon.sock"

# Brief pause so the daemon shutdown finishes + libp2p protocol
# registration on the other peers settles before asks.
sleep 1

# 2. Issue three federated asks of different shapes so the rep data
#    isn't just one peer + one subject.
echo
echo "── three federated asks from peer A ────────────────────"
for q in \
    "open hardware raman lh2 spectrometer munich" \
    "physics informed neural network cryogenic flow" \
    "NASA Plum Brook 2025 internal benchmark"; do
  echo
  echo "→ ask: \"$q\""
  AKASHIK_HOME="$A_HOME" akashik ask "$q" --peers --k 5 \
    | head -10 \
    || true
  # Brief pause to let the fire-and-forget rep update flush before
  # the next ask. updatePeerReputation grabs the .lock; back-to-back
  # asks would just queue on it but a small sleep keeps the demo
  # output readable.
  sleep 1
done

# 3. Inspect the populated rep file.
echo
echo "── \`akashik peers rep\` (default — top-3 per peer) ──"
AKASHIK_HOME="$A_HOME" akashik peers rep || true

echo
echo "── \`akashik peers rep --subject room:research\` ──"
AKASHIK_HOME="$A_HOME" akashik peers rep --subject room:research || true

echo
echo "── raw rep file (~/.akashik.demo/peer-reputation.json) ──"
if [[ -f "$A_HOME/peer-reputation.json" ]]; then
  wc -l "$A_HOME/peer-reputation.json" | awk '{print "  " $1 " lines"}'
  jq '{version, local_peer_id, updated_at,
       subjects_count: (.subjects | length),
       reviews_count: (.reviews | length),
       sample_subject_keys: (.subjects | keys | .[0:5])}' \
     "$A_HOME/peer-reputation.json" 2>/dev/null \
     || head -40 "$A_HOME/peer-reputation.json"
else
  echo "  (no rep file produced — wire-up did not fire)"
fi

echo
echo "── done ──"
