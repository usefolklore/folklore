#!/bin/sh
# akashik PostToolUse auto-save — persists WebSearch / WebFetch
# results as source notes in the research-inbox room so the graph
# captures everything Claude learned from the web. Thin wrapper around
# akashik-post-fetch.cjs.
GRAPH="${AKASHIK_HOME:-$HOME/.akashik}/graph.json"
if [ ! -f "$GRAPH" ]; then exit 0; fi
exec node "$(dirname "$0")/akashik-post-fetch.cjs"
