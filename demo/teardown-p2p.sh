#!/usr/bin/env bash
#
# folklore demo — P2P touch teardown.
#
# Stops every demo daemon spawned by setup-p2p.sh. Idempotent: it's
# safe to run even when no daemons are up; missing PID files just
# emit "not running" lines and the script exits 0.
#
# Run from anywhere:
#
#   bash demo/teardown-p2p.sh
#
# Pass --wipe to also archive every demo home directory under
# `~/.folklore.demo*.archived-<ts>` so the next setup starts
# from absolutely clean state.

set -uo pipefail

WIPE=0
if [[ "${1:-}" == "--wipe" ]]; then
  WIPE=1
fi

HOMES=(
  "${FOLKLORE_DEMO_HOME:-$HOME/.folklore.demo}"
  "${FOLKLORE_DEMO_PEER_B_HOME:-$HOME/.folklore.demo-peerB}"
  "${FOLKLORE_DEMO_PEER_C_HOME:-$HOME/.folklore.demo-peerC}"
  "${FOLKLORE_DEMO_PEER_D_HOME:-$HOME/.folklore.demo-peerD}"
  "${FOLKLORE_DEMO_PEER_E_HOME:-$HOME/.folklore.demo-peerE}"
)

echo "── folklore P2P teardown ────────────────────────────"
for h in "${HOMES[@]}"; do
  if [[ -d "$h" ]]; then
    name=$(basename "$h")
    echo -n "→ $name: "
    if FOLKLORE_HOME="$h" folklore daemon stop 2>/dev/null; then
      :
    else
      echo "  (not running)"
    fi
    if [[ "$WIPE" == "1" ]]; then
      mv "$h" "$h.archived-$(date +%s)" 2>/dev/null || true
    fi
  fi
done

# Belt-and-braces — kill any folklore daemon process still alive
# (e.g. crashed before writing PID file). Restricted to processes
# whose argv contains 'daemon _run' so we never touch the user's
# main folklore daemon if it shares the parent terminal session.
if pgrep -fl "folklore.*daemon.*_run" >/dev/null 2>&1; then
  echo "→ residual daemons found — sending SIGTERM"
  pkill -TERM -f "folklore.*daemon.*_run" 2>/dev/null || true
  sleep 0.5
fi

echo "  ✓ teardown complete"
