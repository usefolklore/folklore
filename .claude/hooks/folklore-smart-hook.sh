#!/bin/sh
# folklore smart PreToolUse hook — thin sh wrapper around the Node impl.
# Prefetches the knowledge graph and injects top-3 hits into Claude's
# context before the outbound tool call. Logs misses to miss-log.jsonl.
# See folklore-smart-hook.cjs for the full logic.
GRAPH="${FOLKLORE_HOME:-$HOME/.folklore}/graph.json"
if [ ! -f "$GRAPH" ]; then exit 0; fi
exec node "$(dirname "$0")/folklore-smart-hook.cjs"
