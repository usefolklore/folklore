#!/usr/bin/env bash
#
# akashik demo — P2P touch setup (5-peer mesh).
#
# Brings up 5 akashik daemons on 127.0.0.1 (peer A + 4 peers
# B/C/D/E), each in its own home with a unique research note. Peer A
# is connected to all four — `akashik touch` from A pulls just
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

A_HOME="${AKASHIK_DEMO_HOME:-$HOME/.akashik.demo}"
A_PORT=4203

# Parallel arrays: PEERS[i], HOMES[i], PORTS[i], LABELS[i], NOTES[i].
PEERS=(B C D E)
PORTS=(4204 4205 4206 4207)
HOMES=(
  "${AKASHIK_DEMO_PEER_B_HOME:-$HOME/.akashik.demo-peerB}"
  "${AKASHIK_DEMO_PEER_C_HOME:-$HOME/.akashik.demo-peerC}"
  "${AKASHIK_DEMO_PEER_D_HOME:-$HOME/.akashik.demo-peerD}"
  "${AKASHIK_DEMO_PEER_E_HOME:-$HOME/.akashik.demo-peerE}"
)
# Demo-only github handles per peer (so federation surfaces a
# recognisable identity instead of a 50-char libp2p PeerId in the
# Claude Code TUI). Plumbed into peer-labels.json on peer A's home.
GITHUB_HANDLES=(
  "munich-h2-lab"
  "stanford-cryo-lab"
  "nasa-glenn-h2"
  "eu-hbb-consortium"
)

# Each peer specialises in a slice of the hydrogen-detection-AI build:
# open-source hardware + RAG tooling (B), research evals + HF models (C),
# production benchmarks + code templates (D), industry standards +
# evaluated HF models (E). Each peer holds 2 typed notes — concept or
# synthesis — flagged with a code-score where applicable so peers
# downstream can rank "best practice" candidates.
LABELS=(
  "Open-hardware portable Raman LH2 spectrometer"
  "PINN failure modes for cryogenic flow — overlooked in 2024 papers"
  "NASA Plum Brook 2025 internal LSTM gating-loss benchmark"
  "EU Hydrogen Backbone consortium — sensor-interchange schema notes"
)
NOTES=(
  "Open-hardware portable Raman kit for H2: 4155 cm-1 Stokes line, 532 nm green laser, 600 lines/mm transmission grating, CMOS sensor. Total BOM ~2400 EUR. Repo, firmware, CAD at github.com/munich-h2-lab/open-h2-raman. Reproduced by 3 university groups; suitable for benchtop H2 leak detection prototypes. Author: github:munich-h2-lab."
  "Critical analysis: most 2024 PINN papers ignore subcooled-to-saturated phase boundary discontinuities. Counterexample dataset at github.com/stanford-cryo-lab/pinn-h2-counterexample shows 23 percent error blowup near the 25 K transition that the published Lagrange-multiplier scheme cannot recover from. Mitigation: discontinuity-aware loss with focal-Tversky weighting near phase boundary. Author: github:stanford-cryo-lab."
  "Internal Q1 2025 benchmark: AE-channel false-positive rate during fill ops dropped 64 percent after switching the LSTM gating head loss from MSE to focal-Tversky. Reusable training template at github.com/nasa-glenn-h2/h2-lstm-template — code-score 0.88 (production-tested across 3 fill cycles, 30 fps Jetson Orin). Recommended starting point for new H2-leak LSTMs. Author: github:nasa-glenn-h2."
  "Q4 2025 standardisation push for cryo-LH2 sensor data interchange via a JSON-LD vocabulary. ETH Zurich and Linde leading the working group; draft schema circulating among 14 partner orgs. Adopt this for any new H2 detection dataset to stay interoperable with industry pipelines. Reference repo at github.com/eu-hbb-consortium/lh2-schema. Author: github:eu-hbb-consortium."
)
LABELS_2=(
  "Sensor-fusion GraphRAG for cryogenic H2 monitoring"
  "HF model eval — microsoft/spectro-transformer-base on H2 spectroscopy"
  "Jetson Orin inference pipeline for LH2 anomaly detection"
  "HF model eval — eth-aerospace/lh2-anomaly-detector-v2 on EU pilot data"
)
NOTES_2=(
  "Open-source GraphRAG implementation for multimodal H2 sensor fusion (Raman + AE + thermal). Cross-modal tunnels learnt over a sliding 10-min window. Code at github.com/munich-h2-lab/sensor-fusion-rag — code-score 0.91/1.00 on internal eval (typed interfaces, 87 percent test coverage, 4 production rigs running it). Recommended as best-practice baseline for any new H2 sensor-fusion AI. Author: github:munich-h2-lab."
  "Benchmarked microsoft/spectro-transformer-base on H2 leak classification: F1 0.94 macro-averaged across 4 leak modes, beats the published CNN baseline by 11 points. Inference 4 ms per spectrum on a single A10. Recommended over from-scratch CNN architectures for early-stage H2 detection prototypes. Eval notebook at github.com/stanford-cryo-lab/h2-hf-bench. Author: github:stanford-cryo-lab."
  "Production inference pipeline: 1.2M-param U-Net denoiser feeding the focal-Tversky LSTM, 30 fps sustained on Jetson Orin Nano (+3 dB SNR floor lift). Quantised INT8 weights, MQTT publish path. Template at github.com/nasa-glenn-h2/h2-inference-orin — code-score 0.88 (battle-tested under 6 fill-ops; well-documented power envelope). Use this when targeting embedded edge inference. Author: github:nasa-glenn-h2."
  "Eval of eth-aerospace/lh2-anomaly-detector-v2 on the EU pilot dataset: AUROC 0.89 across 12 industrial LH2 storage sites, calibration ECE 0.04. License is Apache-2.0; fine-tuneable. Better choice than the v1 release for any deployment touching EU Hydrogen Backbone data — direct schema compatibility. Author: github:eu-hbb-consortium."
)

NUM_PEERS=${#PEERS[@]}

CORPUS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/research-corpus" && pwd)"

echo "── akashik P2P touch setup (5-daemon mesh) ─────────"
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
  AKASHIK_HOME="$home" akashik daemon stop 2>/dev/null || true
}

# ── 1. base setup for peer A ─────────────────────────────
if [[ ! -f "$A_HOME/peer-identity.json" ]]; then
  echo "→ peer A: running setup.sh (no prior demo home)"
  bash "$(dirname "${BASH_SOURCE[0]}")/setup.sh" >/dev/null
fi
write_config "$A_HOME" "$A_PORT"
AKASHIK_HOME="$A_HOME" akashik identity init >/dev/null 2>&1 || true
AKASHIK_HOME="$A_HOME" akashik share room research >/dev/null

# Wipe any concept://* nodes synced from earlier demo runs — they
# carry old labels (e.g. "(peer C exclusive)") that pollute the
# federated response. CRDT replays will populate fresh ones from
# the rebuilt peer homes below.
if [[ -f "$A_HOME/graph.json" ]]; then
  python3 - "$A_HOME/graph.json" <<'PY' >/dev/null 2>&1 || true
import json, sys
p = sys.argv[1]
g = json.load(open(p))
ids = {n.get('id') for n in g['nodes'] if n.get('id','').startswith('concept://')}
g['nodes'] = [n for n in g['nodes'] if n.get('id') not in ids]
g['edges'] = [e for e in g.get('edges', []) if e.get('source') not in ids and e.get('target') not in ids]
json.dump(g, open(p, 'w'), indent=2)
PY
fi
rm -f "$A_HOME/ydocs/research.ydoc"

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
#
# Each peer needs the embedder model to ingest the note, but
# downloading 90 MB × 4 fresh peers from scratch hangs the script
# under timeouts. Symlink peer A's already-downloaded models dir into
# each peer's home — same on-disk cache layout, zero re-downloads.
# Falls back to per-peer download if peer A's models dir is empty.
i=0
while [[ $i -lt $NUM_PEERS ]]; do
  p="${PEERS[$i]}"
  h="${HOMES[$i]}"
  port="${PORTS[$i]}"
  label="${LABELS[$i]}"
  note="${NOTES[$i]}"
  echo "→ peer $p: identity + 2 notes + share room"
  write_config "$h" "$port"
  if [[ -d "$A_HOME/models" ]] && [[ ! -e "$h/models" ]]; then
    ln -s "$A_HOME/models" "$h/models"
  fi
  AKASHIK_HOME="$h" akashik identity init >/dev/null
  AKASHIK_HOME="$h" akashik save \
    --room research \
    --type concept \
    --label "$label" \
    --text "$note" \
    >/dev/null
  AKASHIK_HOME="$h" akashik save \
    --room research \
    --type concept \
    --label "${LABELS_2[$i]}" \
    --text "${NOTES_2[$i]}" \
    >/dev/null
  AKASHIK_HOME="$h" akashik share room research >/dev/null
  i=$((i + 1))
done

# ── 4. start all 5 daemons ───────────────────────────────
stop_daemon_quietly "$A_HOME"
sleep 0.3
echo "→ starting peer A daemon"
AKASHIK_HOME="$A_HOME" akashik daemon start

i=0
while [[ $i -lt $NUM_PEERS ]]; do
  echo "→ starting peer ${PEERS[$i]} daemon"
  AKASHIK_HOME="${HOMES[$i]}" akashik daemon start
  i=$((i + 1))
done

sleep 2

# ── 5. peer A connects to all four peers ─────────────────
#
# Note: `akashik peer add` boots an ephemeral libp2p node to
# perform the dial, but reads the host's config.yaml — meaning it
# tries to bind the SAME port as the running daemon and fails with
# EADDRINUSE. The cleanest workaround for the demo is to write
# peers.json directly: same end state as `peer add`, no port
# conflict, no live dial during setup.
A_PEERID=$(AKASHIK_HOME="$A_HOME" akashik peer status 2>/dev/null | awk '/peerId/ {print $2}')

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
    pid=$(AKASHIK_HOME="$h" akashik peer status 2>/dev/null | awk '/peerId/ {print $2}')
    if [[ -z "$pid" ]]; then
      echo "[setup-p2p] could not read peerId for peer $p; abort" >&2
      exit 1
    fi
    # libp2p dial verification requires the full /p2p/<peerId>
    # suffix on the multiaddr — without it, dialAndTag silently
    # fails ("we don't know who we're connecting to") and the
    # federated ask sees peers_queried: 0.
    addr="/ip4/127.0.0.1/tcp/$port/p2p/$pid"
    if [[ $first -eq 0 ]]; then echo '    ,'; fi
    echo '    {'
    echo "      \"id\": \"$pid\","
    echo "      \"addrs\": [\"$addr\"],"
    echo "      \"addedAt\": \"$NOW\""
    echo '    }'
    first=0
    # Persist peer id for the recording.
    echo "$pid" >"$A_HOME/peer-${p}-id"
    echo "→ peer A knows peer $p: $addr" >&2
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
      "addrs": ["/ip4/127.0.0.1/tcp/$A_PORT/p2p/$A_PEERID"],
      "addedAt": "$NOW"
    }
  ]
}
EOF
  i=$((i + 1))
done

# ── 5a. write peer-labels.json on peer A so the prompt-submit hook
# can substitute `github:<handle>` for the libp2p PeerId in its
# rendering. Mirrors what real `akashik login` would produce
# for each peer; here it's a static fixture for the demo.
LABELS_JSON="$A_HOME/peer-labels.json"
{
  echo '{'
  echo '  "version": 1,'
  echo '  "peers": {'
  i=0
  first=1
  while [[ $i -lt $NUM_PEERS ]]; do
    h="${HOMES[$i]}"
    handle="${GITHUB_HANDLES[$i]}"
    pid=$(AKASHIK_HOME="$h" akashik peer status 2>/dev/null | awk '/peerId/ {print $2}')
    did=$(AKASHIK_HOME="$h" akashik identity show 2>/dev/null | awk '/user DID/ {print $3}')
    did_short=$(echo "$did" | sed -E 's/^did:key:z6Mk//;s/^(.{8}).*$/\1/')
    if [[ $first -eq 0 ]]; then echo '    ,'; fi
    echo "    \"$pid\": {"
    echo "      \"github\":    \"$handle\","
    echo "      \"did\":       \"$did\","
    echo "      \"did_short\": \"$did_short\""
    echo '    }'
    first=0
    i=$((i + 1))
  done
  echo '  }'
  echo '}'
} >"$LABELS_JSON"

# ── 5b. daemons need to reload to pick up peers.json. libp2p
# only binds its TCP listener when the daemon has at least one
# known peer at startup, so we must restart every daemon now that
# peers.json files are written.
sleep 0.5
echo "→ restarting all daemons so they pick up peers.json"
stop_daemon_quietly "$A_HOME"
i=0
while [[ $i -lt $NUM_PEERS ]]; do
  stop_daemon_quietly "${HOMES[$i]}"
  i=$((i + 1))
done
sleep 1
AKASHIK_HOME="$A_HOME" akashik daemon start
i=0
while [[ $i -lt $NUM_PEERS ]]; do
  AKASHIK_HOME="${HOMES[$i]}" akashik daemon start
  i=$((i + 1))
done
sleep 3

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
