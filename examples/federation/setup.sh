#!/usr/bin/env bash
# Stand up a two-peer folklore network on loopback — idempotent.
#
#   alice = a peer who already ground out an inference trace (paid the tokens).
#           runs a listening daemon that serves her graph over P2P.
#   bob   = you. empty graph. dials alice so `resolve` can pull her trace.
#
# Direct-dial only: no public IPFS DHT, no mDNS — deterministic + offline.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$DIR/../.." && pwd)"
BIN="$REPO_ROOT/bin/folklore.js"
ALICE="$DIR/.alice-home"
BOB="$DIR/.bob-home"
ALICE_PORT=4211
BOB_PORT=4212

fk() { local home="$1"; shift; FOLKLORE_HOME="$home" node "$BIN" "$@" 2>/dev/null; }

# clean slate
[ -f "$ALICE/daemon.pid" ] && fk "$ALICE" daemon stop >/dev/null 2>&1 || true
rm -rf "$ALICE" "$BOB"; mkdir -p "$ALICE" "$BOB"

write_cfg() { cat > "$1/config.yaml" <<EOF
peer:
  port: $2
  listen_host: "127.0.0.1"
  mdns: false
  upnp: false
  dht:
    enabled: false
    public: false
daemon:
  interval_seconds: 999999
EOF
}
write_cfg "$ALICE" "$ALICE_PORT"
write_cfg "$BOB" "$BOB_PORT"

# alice's hard-won trace — a real debugging conclusion worth reusing
fk "$ALICE" save \
  --label "tokio-rc-send-across-await-RESOLVED" \
  --text "RESOLVED after 40min debugging: tokio::spawn requires Send + 'static, but Rc<RefCell<T>> is !Send, so sharing it across an .await inside a spawned task fails to compile. Root cause: the future captures the Rc and may migrate threads under the work-stealing scheduler. Fix: switch to Arc<Mutex<T>> for cross-task shared state, OR keep the task on one thread with tokio::task::LocalSet + spawn_local (which does not require Send). Arc<Mutex> is correct for genuine multi-thread sharing; LocalSet is lighter when the state is logically single-threaded." \
  --type synthesis >/dev/null

# alice needs a peer identity before her daemon will expose P2P
fk "$ALICE" peer status >/dev/null
fk "$ALICE" daemon start >/dev/null

# wait for alice's P2P listener, then grab her dial multiaddr
ALICE_ADDR=""
for _ in $(seq 1 20); do
  ALICE_ADDR="$(node -e 'try{const j=require(process.argv[1]);const a=(j.addrs||[]).find(x=>x.includes("127.0.0.1"));if(a)process.stdout.write(a)}catch(e){}' "$ALICE/p2p-addrs.json" 2>/dev/null || true)"
  [ -n "$ALICE_ADDR" ] && break
  sleep 0.5
done
[ -z "$ALICE_ADDR" ] && { echo "setup: alice never came up on P2P" >&2; exit 1; }

# bob gets an identity and dials alice
fk "$BOB" peer status >/dev/null
fk "$BOB" peer add "$ALICE_ADDR" >/dev/null

# warm the path once — alice's daemon lazy-loads its embedder + graph on the
# first P2P search (~50s cold), so we pay that here, not on camera. Then wipe
# bob's pulled copy so the recorded resolve still shows a genuine fresh pull.
fk "$BOB" ask --peers --pull --k 3 "warmup query" >/dev/null 2>&1 || true
rm -f "$BOB/graph.json" "$BOB"/vectors.db* 2>/dev/null || true

echo "network up:"
echo "  alice (peer, has the trace)  → $ALICE_ADDR"
echo "  bob   (you, empty graph)     → dialing alice"
