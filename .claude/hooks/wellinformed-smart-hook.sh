#!/bin/sh
# wellinformed smart PreToolUse hook — thin sh wrapper around the Node impl.
# Prefetches the knowledge graph and injects top-3 hits into Claude's
# context before the outbound tool call. Logs misses to miss-log.jsonl.
# See wellinformed-smart-hook.cjs for the full logic.
GRAPH="${WELLINFORMED_HOME:-$HOME/.wellinformed}/graph.json"
if [ ! -f "$GRAPH" ]; then exit 0; fi
exec node "$(dirname "$0")/wellinformed-smart-hook.cjs"
