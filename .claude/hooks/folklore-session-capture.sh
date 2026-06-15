#!/bin/sh
# folklore Session Capture — auto-indexes session context on Stop
#
# When Claude Code's Stop hook fires (end of a response), this hook
# saves a summary of the current session to the knowledge graph.
# This closes the gap with claude-mem and memsearch which auto-capture
# conversation context.
#
# Implementation: writes a session-note node to graph.json via a
# lightweight Node script (no full runtime startup — just JSON append).

GRAPH="${FOLKLORE_HOME:-$HOME/.folklore}/graph.json"
if [ ! -f "$GRAPH" ]; then exit 0; fi

# Write a session marker node (lightweight — no embedding, just graph).
# V5: workspace is left unset here (auto-detected by CLI path; this hook
# writes raw JSON for performance). Sharing gate (`private: false`)
# is set so the node is federation-eligible.
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
        'source_uri': 'session://$SESSION_ID',
        'fetched_at': '$TIMESTAMP',
        'kind': 'session_capture',
        'private': False
    }
    g['nodes'].append(node)
    with open('$GRAPH', 'w') as f:
        json.dump(g, f, indent=2)
except Exception as e:
    pass
" 2>/dev/null
