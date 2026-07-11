#!/usr/bin/env bash
# Stop alice's daemon and remove the demo homes.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$(cd "$DIR/../.." && pwd)/bin/folklore.js"
ALICE="$DIR/.alice-home"
[ -f "$ALICE/daemon.pid" ] && FOLKLORE_HOME="$ALICE" node "$BIN" daemon stop 2>/dev/null || true
rm -rf "$DIR/.alice-home" "$DIR/.bob-home"
echo "network down."
