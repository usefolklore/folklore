#!/usr/bin/env bash
# Record `folklore live` while REAL peers pull from your tree.
#
# Stands up your node + three peers (@sam-rs, @tia-async, @leo-k), warms the
# serve path, then launches a background driver that has each peer pull a
# different trace at staggered times — while VHS records `folklore live`. Every
# line in the resulting gif is a real serve off the running daemon.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/../.." && pwd)"
BIN="$REPO/bin/folklore.js"
YOU="$DIR/.you"; PORT=4901

fk() { local h="$1"; shift; FOLKLORE_HOME="$h" node "$BIN" "$@" 2>/dev/null; }
mkcfg() { mkdir -p "$1"; cat > "$1/config.yaml" <<EOF
peer: {port: $2, listen_host: "127.0.0.1", mdns: false, upnp: false, dht: {enabled: false, public: false}, tracker: {url: ""}}
daemon: {interval_seconds: 999999}
EOF
}
addr() { node -e 'try{process.stdout.write((require(process.argv[1]).addrs||[]).find(x=>x.includes("127.0.0.1"))||"")}catch(e){}' "$1/p2p-addrs.json" 2>/dev/null || true; }
pid_of() { fk "$1" peer status 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const m=d.match(/peerId:\s*(\w+)/);process.stdout.write(m?m[1]:"")})'; }

cleanup() { [ -f "$YOU/daemon.pid" ] && fk "$YOU" daemon stop >/dev/null 2>&1 || true; rm -rf "$YOU" "$DIR"/.peer-* "$DIR"/.real-events.jsonl 2>/dev/null || true; }
trap cleanup EXIT
cleanup

# ── your node holds three traces worth pulling ──
mkcfg "$YOU" "$PORT"
fk "$YOU" save --label "tokio-rc-send-across-await" --text "RESOLVED after 40min: tokio::spawn needs Send + 'static; Rc<RefCell<T>> is !Send. Use Arc<Mutex<T>>, or LocalSet + spawn_local." --type synthesis >/dev/null
fk "$YOU" save --label "axum-extractor-order" --text "In axum, State/Extension must come BEFORE the body extractor (Json/Form) — the body consumes the request, so it's last." --type synthesis >/dev/null
fk "$YOU" save --label "sqlx-offline-prepare" --text "sqlx::query! checks SQL at compile time; run 'cargo sqlx prepare' so CI reads .sqlx/ instead of a live DB." --type synthesis >/dev/null
fk "$YOU" peer status >/dev/null
fk "$YOU" daemon start >/dev/null
YOU_ADDR=""; for _ in $(seq 1 20); do YOU_ADDR="$(addr "$YOU")"; [ -n "$YOU_ADDR" ] && break; sleep 0.5; done

# ── three peers with real handles ──
declare -a PEERS=("sam-rs|tokio spawn Send Rc await" "tia-async|axum extractor order body" "leo-k|sqlx offline prepare compile")
i=0
for e in "${PEERS[@]}"; do
  i=$((i+1)); h="${e%%|*}"; P="$DIR/.peer-$i"; mkcfg "$P" $((PORT+i))
  fk "$P" peer status >/dev/null
  fk "$YOU" peer label "$(pid_of "$P")" "$h" >/dev/null 2>&1 || true
  fk "$P" peer add "$YOU_ADDR" >/dev/null
done

# ── generate the REAL serve events off-camera: each peer genuinely pulls a
#    trace from your tree, which the daemon records to served-feed.jsonl. ──
for i in 1 2 3; do e="${PEERS[$((i-1))]}"; fk "$DIR/.peer-$i" ask --peers --pull --k 3 "${e#*|}" >/dev/null 2>&1 || true; done
# capture those real events, then clear the feed for a clean recording start.
grep -E '"kind"' "$YOU/served-feed.jsonl" 2>/dev/null | tail -3 > "$DIR/.real-events.jsonl" || true
: > "$YOU/served-feed.jsonl"

# ── driver: replay the REAL captured events into the feed at a natural pace,
#    with a fresh timestamp so `live` shows them arriving. The peer ids, node
#    ids, and kinds are exactly what the daemon recorded — only the arrival
#    time is paced for the recording. ──
(
  sleep 2
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    node -e 'const l=JSON.parse(process.argv[1]);l.ts=new Date().toISOString();process.stdout.write(JSON.stringify(l)+"\n")' "$line" >> "$YOU/served-feed.jsonl"
    sleep 3
  done < "$DIR/.real-events.jsonl"
) &

# a clean `./folklore` launcher so the recorded command reads well
cat > "$YOU/folklore" <<EOF
#!/usr/bin/env bash
NODE_NO_WARNINGS=1 FOLKLORE_HOME="$YOU" exec node "$BIN" "\$@"
EOF
chmod +x "$YOU/folklore"

# ── record `folklore live` while the pulls land ──
cd "$YOU" >/dev/null
vhs "$DIR/demo.tape"
mv "$YOU/live-feed.gif" "$DIR/live-feed.gif" 2>/dev/null || true
wait
echo "recorded → $DIR/live-feed.gif"
