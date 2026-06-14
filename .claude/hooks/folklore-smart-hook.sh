#!/bin/sh
# akashik smart PreToolUse hook — thin sh wrapper around the Node impl.
# Prefetches the knowledge graph and injects top-3 hits into Claude's
# context before the outbound tool call. Logs misses to miss-log.jsonl.
# See akashik-smart-hook.cjs for the full logic.
GRAPH="${AKASHIK_HOME:-$HOME/.akashik}/graph.json"
if [ ! -f "$GRAPH" ]; then exit 0; fi
exec node "$(dirname "$0")/akashik-smart-hook.cjs"
