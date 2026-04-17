#!/bin/sh
# wellinformed PostToolUse auto-save — persists WebSearch / WebFetch
# results as source notes in the research-inbox room so the graph
# captures everything Claude learned from the web. Thin wrapper around
# wellinformed-post-fetch.cjs.
GRAPH="${WELLINFORMED_HOME:-$HOME/.wellinformed}/graph.json"
if [ ! -f "$GRAPH" ]; then exit 0; fi
exec node "$(dirname "$0")/wellinformed-post-fetch.cjs"
