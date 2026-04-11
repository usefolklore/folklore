#!/bin/sh
# wellinformed Session Capture — auto-indexes session context on Stop
#
# When Claude Code's Stop hook fires (end of a response), this hook
# saves a summary of the current session to the knowledge graph.
# This closes the gap with claude-mem and memsearch which auto-capture
# conversation context.
#
# Implementation: writes a session-note node to graph.json via a
# lightweight Node script (no full runtime startup — just JSON append).

GRAPH="${WELLINFORMED_HOME:-$HOME/.wellinformed}/graph.json"
if [ ! -f "$GRAPH" ]; then exit 0; fi

# Only capture if graph exists and has at least one room
ROOMS="${WELLINFORMED_HOME:-$HOME/.wellinformed}/rooms.json"
if [ ! -f "$ROOMS" ]; then exit 0; fi

DEFAULT_ROOM=$(python3 -c "
import json, sys
try:
    r = json.load(open('$ROOMS'))
    print(r.get('default_room', r.get('rooms', [{}])[0].get('id', '')))
except: pass
" 2>/dev/null)

if [ -z "$DEFAULT_ROOM" ]; then exit 0; fi

# Write a session marker node (lightweight — no embedding, just graph)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
SESSION_ID="session-$(date +%s)"

python3 -c "
import json, sys
try:
    g = json.load(open('$GRAPH'))
    node = {
        'id': '$SESSION_ID',
        'label': 'Claude session at $TIMESTAMP',
        'file_type': 'rationale',
        'source_file': 'session-capture',
        'room': '$DEFAULT_ROOM',
        'source_uri': 'session://$SESSION_ID',
        'fetched_at': '$TIMESTAMP',
        'kind': 'session_capture'
    }
    g['nodes'].append(node)
    with open('$GRAPH', 'w') as f:
        json.dump(g, f, indent=2)
except Exception as e:
    pass
" 2>/dev/null
