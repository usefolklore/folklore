#!/bin/sh
# wellinformed PreToolUse + SessionStart hook.
# Fires before Glob|Grep|Read (legacy hint) and on SessionStart (Phase 20 — recent session summary).
GRAPH="${WELLINFORMED_HOME:-$HOME/.wellinformed}/graph.json"

# ── SessionStart branch (Phase 20) ──────────────────────────────────────────
if [ "${CLAUDE_HOOK_EVENT:-}" = "SessionStart" ]; then
  if command -v wellinformed >/dev/null 2>&1; then
    RECENT=$(wellinformed recent-sessions --hours 24 --limit 1 --json 2>/dev/null || echo '{"count":0,"sessions":[]}')
    COUNT=$(printf '%s' "$RECENT" | grep -c '"id":' 2>/dev/null || echo 0)
    if [ "$COUNT" -gt 0 ]; then
      SID=$(printf '%s' "$RECENT" | grep -m1 '"id":' | sed 's/.*"id": *"\([^"]*\)".*/\1/')
      STARTED=$(printf '%s' "$RECENT" | grep -m1 '"started_at":' | sed 's/.*"started_at": *"\([^"]*\)".*/\1/')
      FINAL=$(printf '%s' "$RECENT" | grep -m1 '"final_assistant_message":' | sed 's/.*"final_assistant_message": *"\([^"]*\)".*/\1/')
      BRANCH=$(printf '%s' "$RECENT" | grep -m1 '"git_branch":' | sed 's/.*"git_branch": *"\([^"]*\)".*/\1/')
      MSG="wellinformed: Previous session $SID (started $STARTED, branch $BRANCH). Last assistant: ${FINAL:-<none>}. Call the recent_sessions MCP tool for the full rollup."
      printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"%s"}}\n' "$MSG"
    fi
  fi
  exit 0
fi

# ── Legacy PreToolUse branch — unchanged output ──────────────────────────────
if [ -f "$GRAPH" ]; then
  NODES=$(grep -c '"id"' "$GRAPH" 2>/dev/null || echo 0)
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"wellinformed: Knowledge graph exists ('"$NODES"' nodes). Before searching raw files, consider using the wellinformed MCP tools: search (semantic k-NN), ask (search + context assembly), get_node (lookup by ID), get_neighbors (graph traversal). These return your indexed research + codebase + external sources in one query."}}'
fi
