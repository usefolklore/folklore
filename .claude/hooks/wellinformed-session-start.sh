#!/bin/sh
# wellinformed SessionStart hook — announces the knowledge graph on session start
# Shows: stats, recent activity, trending topics, tunnel candidates

GRAPH="${WELLINFORMED_HOME:-$HOME/.wellinformed}/graph.json"
ROOMS="${WELLINFORMED_HOME:-$HOME/.wellinformed}/rooms.json"
SOURCES="${WELLINFORMED_HOME:-$HOME/.wellinformed}/sources.json"
LOG="${WELLINFORMED_HOME:-$HOME/.wellinformed}/daemon.log"

if [ ! -f "$GRAPH" ]; then exit 0; fi

NODES=$(grep -c '"id"' "$GRAPH" 2>/dev/null || echo 0)
EDGES=$(grep -c '"source"' "$GRAPH" 2>/dev/null || echo 0)
ROOM_COUNT=$(grep -c '"id"' "$ROOMS" 2>/dev/null || echo 0)
SOURCE_COUNT=$(grep -c '"id"' "$SOURCES" 2>/dev/null || echo 0)

# Get recent activity from daemon log
LAST_ACTIVITY=""
if [ -f "$LOG" ]; then
  LAST_LINE=$(tail -1 "$LOG" 2>/dev/null)
  LAST_ACTIVITY=$(echo "$LAST_LINE" | grep -oE '\[.*\]' | head -1 | tr -d '[]')
fi

# Get top 3 most recent node labels
RECENT=""
if command -v python3 >/dev/null 2>&1; then
  RECENT=$(python3 -c "
import json, sys
try:
    g = json.load(open('$GRAPH'))
    nodes = sorted([n for n in g.get('nodes',[]) if n.get('fetched_at')], key=lambda n: n.get('fetched_at',''), reverse=True)[:3]
    for n in nodes:
        print(f\"  → {n.get('label','?')[:60]}\")
except: pass
" 2>/dev/null)
fi

MSG="━━ wellinformed ━━ ${NODES} nodes │ ${EDGES} edges │ ${ROOM_COUNT} rooms │ ${SOURCE_COUNT} sources"

if [ -n "$RECENT" ]; then
  MSG="$MSG
Recent:
$RECENT"
fi

if [ -n "$LAST_ACTIVITY" ]; then
  MSG="$MSG
Last daemon: $LAST_ACTIVITY"
fi

echo "$MSG"
