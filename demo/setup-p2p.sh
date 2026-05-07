#!/usr/bin/env bash
#
# wellinformed demo — P2P touch setup (5-peer mesh).
#
# Brings up 5 wellinformed daemons on 127.0.0.1 (peer A + 4 peers
# B/C/D/E), each in its own home with a unique research note. Peer A
# is connected to all four — `wellinformed touch` from A pulls just
# the chunks it asks for, attributing them to the source peer.
#
# Lifecycle: this script SETS UP. demo/scene-touch.sh wraps it with
# an EXIT trap that tears the daemons down when recording finishes.
# To run setup standalone (e.g. for manual exploration), use
# `bash demo/teardown-p2p.sh` to stop everything when done.
#
# Implementation note: macOS ships bash 3.2 from 2007, which does
# not support associative arrays. Everything here uses parallel
# indexed arrays + numeric loop indices to stay compatible.
#
# Run from the repo root:
#
#   bash demo/setup-p2p.sh
#
# Idempotent: re-running tears down any running peer daemons first
# and rebuilds. mDNS / UPnP / DHT are all disabled — every link is
# explicitly added via multiaddr.

set -euo pipefail

A_HOME="${WELLINFORMED_DEMO_HOME:-$HOME/.wellinformed.demo}"
A_PORT=4203

# Parallel arrays: PEERS[i], HOMES[i], PORTS[i], LABELS[i], NOTES[i].
PEERS=(B C D E)
PORTS=(4204 4205 4206 4207)
HOMES=(
  "${WELLINFORMED_DEMO_PEER_B_HOME:-$HOME/.wellinformed.demo-peerB}"
  "${WELLINFORMED_DEMO_PEER_C_HOME:-$HOME/.wellinformed.demo-peerC}"
  "${WELLINFORMED_DEMO_PEER_D_HOME:-$HOME/.wellinformed.demo-peerD}"
  "${WELLINFORMED_DEMO_PEER_E_HOME:-$HOME/.wellinformed.demo-peerE}"
)
LABELS=(
  "Open-hardware portable Raman LH2 spectrometer (peer B exclusive)"
  "PINN failure modes for cryogenic flow — overlooked in 2024 papers (peer C exclusive)"
  "NASA Plum Brook 2025 internal benchmark — peer D private summary"
  "EU Hydrogen Backbone consortium working notes (peer E exclusive)"
)
NOTES=(
  "A small Munich lab open-sourced a 4155 cm-1 Raman kit with 532 nm green laser, 600 lines/mm transmission grating, CMOS sensor. Total parts ~2400 EUR. BOM, firmware, CAD at github.com/open-h2-raman. Lives only on peer B."
  "Critical analysis: most 2024 PINN papers ignore subcooled-to-saturated phase boundary discontinuities. A counterexample dataset from Stanford Cryo Lab shows 23 percent error blowup near the 25 K transition that the published Lagrange-multiplier scheme cannot recover from. Detailed in peer C notes."
  "Plum Brook internal Q1 2025 benchmark: AE-channel false-positive rate during fill ops dropped 64 percent after switching the LSTM gating head loss from MSE to focal-Tversky. Not yet published; peer D obtained it from an in-person visit."
  "EU Hydrogen Backbone Working Group meeting summary: Q4 2025 standardisation push for cryo-LH2 sensor data interchange via a JSON-LD vocabulary. ETH Zurich and Linde leading. Draft schema circulating among 14 partner orgs."
)

NUM_PEERS=${#PEERS[@]}

CORPUS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/research-corpus" && pwd)"

echo "── wellinformed P2P touch setup (5-daemon mesh) ─────────"
echo "  peer A:  $A_HOME  (libp2p :$A_PORT)"
i=0
while [[ $i -lt $NUM_PEERS ]]; do
  echo "  peer ${PEERS[$i]}:  ${HOMES[$i]}  (libp2p :${PORTS[$i]})"
  i=$((i + 1))
done
echo

write_config() {
  local home=$1 port=$2
  cat >"$home/config.yaml" <<EOF
peer:
  port: $port
  listen_host: "127.0.0.1"
  mdns: false
  upnp: false
  dht:
    enabled: false

daemon:
  interval_seconds: 3600
  round_robin_rooms: false
EOF
}

stop_daemon_quietly() {
  local home=$1
  WELLINFORMED_HOME="$home" wellinformed daemon stop 2>/dev/null || true
}

# ── 1. base setup for peer A ─────────────────────────────
if [[ ! -f "$A_HOME/peer-identity.json" ]]; then
  echo "→ peer A: running setup.sh (no prior demo home)"
  bash "$(dirname "${BASH_SOURCE[0]}")/setup.sh" >/dev/null
fi
write_config "$A_HOME" "$A_PORT"
WELLINFORMED_HOME="$A_HOME" wellinformed identity init >/dev/null 2>&1 || true
WELLINFORMED_HOME="$A_HOME" wellinformed share room research >/dev/null

# ── 2. tear down + rebuild peer B/C/D/E homes ─────────────
i=0
while [[ $i -lt $NUM_PEERS ]]; do
  h="${HOMES[$i]}"
  stop_daemon_quietly "$h"
  if [[ -d "$h" ]]; then
    mv "$h" "$h.archived-$(date +%s)"
  fi
  mkdir -p "$h"
  i=$((i + 1))
done

# ── 3. peer B/C/D/E identities + unique notes ────────────
i=0
while [[ $i -lt $NUM_PEERS ]]; do
  p="${PEERS[$i]}"
  h="${HOMES[$i]}"
  port="${PORTS[$i]}"
  label="${LABELS[$i]}"
  note="${NOTES[$i]}"
  echo "→ peer $p: identity + note + share room"
  write_config "$h" "$port"
  WELLINFORMED_HOME="$h" wellinformed identity init >/dev/null
  WELLINFORMED_HOME="$h" wellinformed save \
    --room research \
    --type concept \
    --label "$label" \
    --text "$note" \
    >/dev/null
  WELLINFORMED_HOME="$h" wellinformed share room research >/dev/null
  i=$((i + 1))
done

# ── 4. start all 5 daemons ───────────────────────────────
stop_daemon_quietly "$A_HOME"
sleep 0.3
echo "→ starting peer A daemon"
WELLINFORMED_HOME="$A_HOME" wellinformed daemon start

i=0
while [[ $i -lt $NUM_PEERS ]]; do
  echo "→ starting peer ${PEERS[$i]} daemon"
  WELLINFORMED_HOME="${HOMES[$i]}" wellinformed daemon start
  i=$((i + 1))
done

sleep 2

# ── 5. peer A connects to all four peers ─────────────────
#
# Note: `wellinformed peer add` boots an ephemeral libp2p node to
# perform the dial, but reads the host's config.yaml — meaning it
# tries to bind the SAME port as the running daemon and fails with
# EADDRINUSE. The cleanest workaround for the demo is to write
# peers.json directly: same end state as `peer add`, no port
# conflict, no live dial during setup.
A_PEERID=$(WELLINFORMED_HOME="$A_HOME" wellinformed peer status 2>/dev/null | awk '/peerId/ {print $2}')

# Build the peers.json content for peer A.
A_PEERS_JSON="$A_HOME/peers.json"
NOW="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
{
  echo '{'
  echo '  "version": 1,'
  echo '  "peers": ['
  i=0
  first=1
  while [[ $i -lt $NUM_PEERS ]]; do
    p="${PEERS[$i]}"
    h="${HOMES[$i]}"
    port="${PORTS[$i]}"
    pid=$(WELLINFORMED_HOME="$h" wellinformed peer status 2>/dev/null | awk '/peerId/ {print $2}')
    if [[ -z "$pid" ]]; then
      echo "[setup-p2p] could not read peerId for peer $p; abort" >&2
      exit 1
    fi
    addr="/ip4/127.0.0.1/tcp/$port"
    if [[ $first -eq 0 ]]; then echo '    ,'; fi
    echo '    {'
    echo "      \"id\": \"$pid\","
    echo "      \"addrs\": [\"$addr\"],"
    echo "      \"addedAt\": \"$NOW\""
    echo '    }'
    first=0
    # Persist peer id for the recording.
    echo "$pid" >"$A_HOME/peer-${p}-id"
    echo "→ peer A knows peer $p: $addr/p2p/$pid"
    i=$((i + 1))
  done
  echo '  ]'
  echo '}'
} >"$A_PEERS_JSON"

# And put peer A in each remote peer's peers.json so they all know
# the inbound counterpart for /touch and /recall reverse calls.
i=0
while [[ $i -lt $NUM_PEERS ]]; do
  h="${HOMES[$i]}"
  cat >"$h/peers.json" <<EOF
{
  "version": 1,
  "peers": [
    {
      "id": "$A_PEERID",
      "addrs": ["/ip4/127.0.0.1/tcp/$A_PORT"],
      "addedAt": "$NOW"
    }
  ]
}
EOF
  i=$((i + 1))
done

# ── 6. final readiness print ─────────────────────────────
echo
echo "── ready ────────────────────────────────────────────────"
echo "  5 daemons running. Recording can start."
echo
echo "  Peer A peerIds known:"
i=0
while [[ $i -lt $NUM_PEERS ]]; do
  p="${PEERS[$i]}"
  printf "    peer %s: %s\n" "$p" "$(cat "$A_HOME/peer-$p-id")"
  i=$((i + 1))
done
echo
echo "  Tear down with:"
echo "    bash demo/teardown-p2p.sh"
echo
