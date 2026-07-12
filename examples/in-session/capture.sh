#!/usr/bin/env bash
# Capture REAL folklore output for the in-session demo — with real PEOPLE.
# folklore is developers sharing the reasoning their agents already worked out,
# peer-to-peer. So this stands up real peers with real handles:
#
#   authors  — @sam-rs and @tia-async each already debugged the tokio question.
#              YOU pull their traces, so your graph holds two people's answers.
#   you      — hold a couple of your own traces (axum, sqlx) worth sharing back.
#   readers  — @leo-k, @mira-dev, @jon-p each pull one of YOUR traces; you serve
#              them and your reputation with those people climbs.
#
# Everything the demo renders is captured here from the running daemon: the
# PreToolUse deny decision, who authored each trace, the statusline + reputation
# at each serve. session.mjs just frames these real outputs as a Claude Code TUI.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$DIR/../.." && pwd)"
BIN="$REPO/bin/folklore.js"
HOOK="$REPO/.claude/hooks/folklore-smart-hook.cjs"
STATUS="$REPO/.claude/helpers/ak-statusline.cjs"
YOU="$DIR/.you-home"; FRAMES="$DIR/.frames"
PORT=4801

fk() { local h="$1"; shift; FOLKLORE_HOME="$h" node "$BIN" "$@" 2>/dev/null; }
addr_of() { node -e 'try{const j=require(process.argv[1]);const a=(j.addrs||[]).find(x=>x.includes("127.0.0.1"));if(a)process.stdout.write(a)}catch(e){}' "$1/p2p-addrs.json" 2>/dev/null || true; }
wait_addr() { local h="$1" a=""; for _ in $(seq 1 20); do a="$(addr_of "$h")"; [ -n "$a" ] && { echo "$a"; return; }; sleep 0.5; done; }

# clean slate
[ -f "$YOU/daemon.pid" ] && fk "$YOU" daemon stop >/dev/null 2>&1 || true
rm -rf "$YOU" "$FRAMES" "$DIR"/.peer-* ; mkdir -p "$YOU" "$FRAMES"

mkcfg() { mkdir -p "$1"; cat > "$1/config.yaml" <<EOF
peer: {port: $2, listen_host: "127.0.0.1", mdns: false, upnp: false, dht: {enabled: false, public: false}, tracker: {url: ""}}
daemon: {interval_seconds: 999999}
EOF
}

# ── YOU: your own hard-won traces, worth sharing back ──
mkcfg "$YOU" "$PORT"
fk "$YOU" save --label "axum-extractor-order" --text "In axum, extractors run in argument order; State/Extension must come BEFORE the body extractor (Json/Form) — the body consumes the request so it has to be last." --type synthesis >/dev/null
fk "$YOU" save --label "sqlx-offline-prepare" --text "sqlx::query! checks SQL at compile time against DATABASE_URL. For CI/offline builds run 'cargo sqlx prepare' so the macro reads .sqlx/ instead of needing a live database." --type synthesis >/dev/null
fk "$YOU" peer status >/dev/null
fk "$YOU" daemon start >/dev/null
YOU_ADDR="$(wait_addr "$YOU")"; [ -z "$YOU_ADDR" ] && { echo "you never came up" >&2; exit 1; }
fk "$YOU" ask --k 3 "warm" >/dev/null 2>&1 || true

# ── AUTHORS: two developers who already debugged the tokio question ──
declare -a AUTHORS=("sam-rs|tokio-rc-send-across-await|RESOLVED after 40min: tokio::spawn needs Send + 'static, but Rc<RefCell<T>> is !Send, so it can't cross an .await in a spawned task. Fix: Arc<Mutex<T>> for real cross-thread sharing, or tokio::task::LocalSet + spawn_local when it's logically single-threaded."
                     "tia-async|tokio-spawn-send-bound|tokio::spawn needs the future to be Send because the multi-thread work-stealing scheduler moves tasks across threads; an Rc is !Send. Use Arc<Mutex<T>>, or a LocalSet with spawn_local to keep it on one thread.")
echo "{}" > "$FRAMES/authors.json"
ai=0
for entry in "${AUTHORS[@]}"; do
  ai=$((ai+1)); handle="${entry%%|*}"; rest="${entry#*|}"; label="${rest%%|*}"; text="${rest#*|}"
  P="$DIR/.peer-a$ai"; rm -rf "$P"; mkcfg "$P" $((PORT+ai))
  fk "$P" save --label "$label" --text "$text" --type synthesis >/dev/null
  fk "$P" peer status >/dev/null
  fk "$P" daemon start >/dev/null
  PA="$(wait_addr "$P")"
  fk "$P" ask --k 3 "warm" >/dev/null 2>&1 || true
  PID="$(node -e 'const m=require(process.argv[1]).addrs[0].match(/p2p\/(\w+)/);process.stdout.write(m[1])' "$P/p2p-addrs.json")"
  # YOU add + label the author, then pull their trace → it lands in your graph
  fk "$YOU" peer add "$PA" >/dev/null
  fk "$YOU" peer label "$PID" "$handle" >/dev/null 2>&1 || true
  fk "$YOU" ask --peers --pull --k 3 "$label tokio spawn Send Rc await" >/dev/null 2>&1 || true
  node -e 'const fs=require("fs");const f=process.argv[1];const j=JSON.parse(fs.readFileSync(f));j[process.argv[2]]=process.argv[3];fs.writeFileSync(f,JSON.stringify(j))' "$FRAMES/authors.json" "$label" "$handle"
  fk "$P" daemon stop >/dev/null 2>&1 || true; rm -rf "$P"
done

# ── capture the deny-hook (receiving from people who already solved it) ──
echo '{"tool_name":"WebSearch","tool_input":{"query":"how do I fix the tokio spawn Send + static error sharing an Rc across await"}}' \
  | CLAUDE_PROJECT_DIR="$REPO" FOLKLORE_HOME="$YOU" FOLKLORE_DENY_WEBSEARCH=1 FOLKLORE_PREFETCH_PEERS=0 \
    FOLKLORE_DENY_THRESHOLD=0.85 FOLKLORE_DENY_MIN_HITS=2 \
    node "$HOOK" 2>/dev/null > "$FRAMES/hook.json"

status_frame() { echo '{"workspace":{"current_dir":"'"$YOU"'"},"model":{"display_name":"Opus 4.8"}}' | FOLKLORE_HOME="$YOU" node "$STATUS" 2>/dev/null > "$1"; }
status_frame "$FRAMES/status-0.txt"

# ── READERS: three developers pull YOUR traces; you serve them ──
i=0
for entry in "leo-k|axum extractor order body last" "mira-dev|sqlx offline prepare compile check" "jon-p|tokio spawn Send static Rc await"; do
  i=$((i+1)); handle="${entry%%|*}"; topic="${entry#*|}"
  P="$DIR/.peer-r$i"; rm -rf "$P"; mkcfg "$P" $((PORT+10+i))
  fk "$P" peer status >/dev/null
  PID="$(fk "$P" peer status 2>/dev/null | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const m=d.match(/peerId:\s*(\w+)/);process.stdout.write(m?m[1]:"")})')"
  fk "$P" peer add "$YOU_ADDR" >/dev/null
  fk "$YOU" peer label "$PID" "$handle" >/dev/null 2>&1 || true
  fk "$P" ask --peers --pull --k 3 "$topic" >/dev/null 2>&1 || true
  sleep 1
  status_frame "$FRAMES/status-$i.txt"
  cp "$YOU/contribution.json" "$FRAMES/contrib-$i.json" 2>/dev/null || true
  rm -rf "$P"
done

fk "$YOU" daemon stop >/dev/null 2>&1 || true
echo "captured:"; ls "$FRAMES"
echo "authors:"; cat "$FRAMES/authors.json"
echo "ledger:"; cat "$YOU/contribution.json" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{const j=JSON.parse(d);console.log("  rep",j.reputation,"helped",(j.peers_helped||[]).length,"people")})'
rm -rf "$YOU"
