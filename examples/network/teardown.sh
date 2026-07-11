#!/usr/bin/env bash
# Stop both daemons and the local tracker; remove demo homes.
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$(cd "$DIR/../.." && pwd)/bin/folklore.js"
for H in "$DIR/.alice-home" "$DIR/.bob-home"; do
  [ -f "$H/daemon.pid" ] && FOLKLORE_HOME="$H" node "$BIN" daemon stop 2>/dev/null || true
done
[ -f "$DIR/.tracker.pid" ] && kill "$(cat "$DIR/.tracker.pid")" 2>/dev/null || true
rm -rf "$DIR/.alice-home" "$DIR/.bob-home" "$DIR/.tracker.pid" "$DIR/.tracker.log"
echo "network down."
