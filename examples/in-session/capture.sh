#!/usr/bin/env bash
# Capture REAL folklore outputs for the in-session demo, off-camera:
#   1. the PreToolUse deny-hook output when a WebSearch is answered from the
#      graph (a trace a peer already ground out) — the "receiving" half.
#   2. the real statusline segment at reputation 0 → 3 as peers pull YOUR
#      traces and your node earns rep — the "serving" half.
#
# Everything the demo renders comes from here — nothing is faked; the session
# player just replays these captured frames as a clean Claude Code TUI session.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/../.." && pwd)"
BIN="$REPO/bin/folklore.js"
HOOK="$REPO/.claude/hooks/folklore-smart-hook.cjs"
STATUS="$REPO/.claude/helpers/ak-statusline.cjs"
YOU="$DIR/.you-home"
FRAMES="$DIR/.frames"

fk() { local h="$1"; shift; FOLKLORE_HOME="$h" node "$BIN" "$@" 2>/dev/null; }

# clean slate
[ -f "$YOU/daemon.pid" ] && fk "$YOU" daemon stop >/dev/null 2>&1 || true
rm -rf "$YOU" "$FRAMES"; mkdir -p "$YOU" "$FRAMES"
cat > "$YOU/config.yaml" <<'EOF'
peer: {port: 4701, listen_host: "127.0.0.1", mdns: false, upnp: false, dht: {enabled: false, public: false}, tracker: {url: ""}}
daemon: {interval_seconds: 999999}
EOF

# YOUR graph holds traces peers already worked out. TWO corroborating traces on
# the tokio question → the gate reaches consensus (use_memory) and hard-denies
# the web call, not just "verify one source".
fk "$YOU" save --label "tokio-rc-send-across-await" \
  --text "RESOLVED after 40min: tokio::spawn needs Send + 'static, but Rc<RefCell<T>> is !Send, so sharing it across an .await in a spawned task won't compile. Fix: Arc<Mutex<T>> for real cross-thread sharing, or tokio::task::LocalSet + spawn_local when the state is logically single-threaded." \
  --type synthesis >/dev/null
fk "$YOU" save --label "tokio-spawn-send-bound" \
  --text "tokio::spawn requires the future to be Send because the multi-thread work-stealing scheduler may move the task across threads; an Rc is !Send so it can't cross an await point in a spawned task. Use Arc<Mutex<T>>, or a LocalSet with spawn_local to keep it single-threaded." \
  --type synthesis >/dev/null

# a few more traces so the node has something worth serving the swarm
fk "$YOU" save --label "axum-extractor-order" --text "In axum, extractors run in argument order; put State/Extension before the body extractor (Json/Form) — the body must be the LAST extractor since it consumes the request." --type synthesis >/dev/null
fk "$YOU" save --label "sqlx-compile-time-check" --text "sqlx::query! validates SQL at compile time against DATABASE_URL; set it in .env and run cargo sqlx prepare for offline/CI builds so the macro reads .sqlx/ instead of a live DB." --type synthesis >/dev/null

fk "$YOU" peer status >/dev/null
fk "$YOU" daemon start >/dev/null
YOU_ADDR=""; for _ in $(seq 1 20); do
  YOU_ADDR="$(node -e 'try{const j=require(process.argv[1]);const a=(j.addrs||[]).find(x=>x.includes("127.0.0.1"));if(a)process.stdout.write(a)}catch(e){}' "$YOU/p2p-addrs.json" 2>/dev/null || true)"
  [ -n "$YOU_ADDR" ] && break; sleep 0.5
done
[ -z "$YOU_ADDR" ] && { echo "capture: your node never came up" >&2; exit 1; }

# warm your daemon's embedder so serving is fast
fk "$YOU" ask --k 3 "tokio spawn" >/dev/null 2>&1 || true

status_frame() { # $1 = output file
  echo '{"workspace":{"current_dir":"'"$YOU"'"},"model":{"display_name":"Opus 4.8"}}' \
    | FOLKLORE_HOME="$YOU" node "$STATUS" 2>/dev/null > "$1"
}

# ── capture the deny-hook output (receiving from the swarm) ──
# CLAUDE_PROJECT_DIR must be the REPO (so the hook finds dist/cli/index.js), not
# the folklore home. No FOLKLORE_BIN (that expects an executable, not a .js).
echo '{"tool_name":"WebSearch","tool_input":{"query":"how do I fix the tokio spawn Send + static error sharing an Rc across await"}}' \
  | CLAUDE_PROJECT_DIR="$REPO" FOLKLORE_HOME="$YOU" FOLKLORE_DENY_WEBSEARCH=1 FOLKLORE_PREFETCH_PEERS=0 \
    FOLKLORE_DENY_THRESHOLD=0.85 FOLKLORE_DENY_MIN_HITS=2 \
    node "$HOOK" 2>/dev/null > "$FRAMES/hook.json"

# ── rep 0 statusline (before serving) ──
status_frame "$FRAMES/status-0.txt"

# ── drive real serves: 3 distinct peers each pull one of YOUR traces ──
i=0
for topic in "tokio spawn Send static Rc await" "axum extractor order body last" "sqlx compile time query check"; do
  i=$((i+1))
  P="$DIR/.peer-$i"
  rm -rf "$P"; mkdir -p "$P"
  cat > "$P/config.yaml" <<EOF
peer: {port: $((4710+i)), listen_host: "127.0.0.1", mdns: false, upnp: false, dht: {enabled: false, public: false}, tracker: {url: ""}}
daemon: {interval_seconds: 999999}
EOF
  fk "$P" peer status >/dev/null
  fk "$P" peer add "$YOU_ADDR" >/dev/null
  fk "$P" ask --peers --pull --k 3 "$topic" >/dev/null 2>&1 || true
  sleep 1
  status_frame "$FRAMES/status-$i.txt"
  cp "$YOU/contribution.json" "$FRAMES/contrib-$i.json" 2>/dev/null || true
  rm -rf "$P"
done

fk "$YOU" daemon stop >/dev/null 2>&1 || true
echo "captured to $FRAMES:"; ls "$FRAMES"
echo "final ledger:"; cat "$YOU/contribution.json" 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);console.log("  rep",j.reputation,"served",(j.peers_helped||[]).length,"peers")})'
rm -rf "$YOU"
