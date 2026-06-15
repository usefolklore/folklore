#!/bin/sh
# folklore PostToolUse auto-save — persists WebSearch / WebFetch
# results as source notes in the research-inbox room so the graph
# captures everything Claude learned from the web. Thin wrapper around
# folklore-post-fetch.cjs.
GRAPH="${FOLKLORE_HOME:-$HOME/.folklore}/graph.json"
if [ ! -f "$GRAPH" ]; then exit 0; fi
exec node "$(dirname "$0")/folklore-post-fetch.cjs"
