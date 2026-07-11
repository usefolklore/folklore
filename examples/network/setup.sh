#!/usr/bin/env bash
# Stand up a folklore network that discovers itself through a TRACKER — no
# `peer add`, no DHT, no LAN. This is the production discovery path (the tracker
# runs on usefolklore.com); here it runs locally so the demo is self-contained.
#
#   tracker = the rendezvous (peer directory, holds pointers only)
#   alice   = a peer who already ground out an inference trace
#   bob     = you — empty graph; finds alice purely via the tracker
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$DIR/../.." && pwd)"
BIN="$REPO_ROOT/bin/folklore.js"
ALICE="$DIR/.alice-home"; BOB="$DIR/.bob-home"
TRACKER_URL="http://localhost:8790"

fk() { local home="$1"; shift; FOLKLORE_HOME="$home" node "$BIN" "$@" 2>/dev/null; }

# clean slate
[ -f "$ALICE/daemon.pid" ] && fk "$ALICE" daemon stop >/dev/null 2>&1 || true
[ -f "$BOB/daemon.pid" ] && fk "$BOB" daemon stop >/dev/null 2>&1 || true
[ -f "$DIR/.tracker.pid" ] && kill "$(cat "$DIR/.tracker.pid")" 2>/dev/null || true
rm -rf "$ALICE" "$BOB"; mkdir -p "$ALICE" "$BOB"

# start the local tracker
node "$DIR/tracker.mjs" 8790 >"$DIR/.tracker.log" 2>&1 &
echo $! > "$DIR/.tracker.pid"
sleep 1

# both nodes: tracker discovery ONLY (mdns off, dht off, no peer add)
write_cfg() { cat > "$1/config.yaml" <<EOF
peer:
  port: $2
  listen_host: "127.0.0.1"
  mdns: false
  upnp: false
  dht:
    enabled: false
    public: false
  tracker:
    url: "$TRACKER_URL"
    namespace: "folklore"
daemon:
  interval_seconds: 999999
EOF
}
write_cfg "$ALICE" 4501
write_cfg "$BOB" 4502

# alice's hard-won trace
fk "$ALICE" save \
  --label "tokio-rc-send-across-await-RESOLVED" \
  --text "RESOLVED after 40min debugging: tokio::spawn requires Send + 'static, but Rc<RefCell<T>> is !Send, so sharing it across an .await inside a spawned task fails to compile. Fix: Arc<Mutex<T>> for cross-thread shared state, or tokio::task::LocalSet + spawn_local when the state is logically single-threaded." \
  --type synthesis >/dev/null

# identities + daemons — NO peer add anywhere; discovery is 100% tracker
fk "$ALICE" peer status >/dev/null
fk "$BOB" peer status >/dev/null
fk "$ALICE" daemon start >/dev/null
fk "$BOB" daemon start >/dev/null

# Warm ALICE's daemon (a local ask loads her embedder + graph, so serving a
# P2P search later is fast, not the ~50s cold path). We warm the SERVER, not
# bob — bob stays untouched so his resolve is genuine. Give the tracker-
# established link a moment to share-sync alice's public trace across to bob.
fk "$ALICE" ask --k 3 "tokio spawn send static" >/dev/null 2>&1 || true
sleep 10

echo "network up (discovery via tracker, zero peer-add):"
curl -s "$TRACKER_URL/tracker/peers?ns=folklore" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);console.log("  tracker knows "+j.count+" peers")})' 2>/dev/null || true
