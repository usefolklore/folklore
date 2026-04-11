#!/bin/sh
# wellinformed PreToolUse hook — reminds Claude that the knowledge graph exists.
# Fires before Glob, Grep, Read. If graph.json is present, inject a context hint.
GRAPH="${WELLINFORMED_HOME:-$HOME/.wellinformed}/graph.json"
if [ -f "$GRAPH" ]; then
  NODES=$(grep -c '"id"' "$GRAPH" 2>/dev/null || echo 0)
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"wellinformed: Knowledge graph exists ('"$NODES"' nodes). Before searching raw files, consider using the wellinformed MCP tools: search (semantic k-NN), ask (search + context assembly), get_node (lookup by ID), get_neighbors (graph traversal). These return your indexed research + codebase + external sources in one query."}}'
fi
