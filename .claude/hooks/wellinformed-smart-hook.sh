#!/bin/sh
# wellinformed Smart PreToolUse hook — context-aware graph search
#
# Instead of a generic "graph exists" message, this hook:
# 1. Reads the tool input (file path, grep pattern, glob pattern)
# 2. Extracts relevant keywords
# 3. Searches the graph for matching nodes
# 4. Returns specific matches, not generic advice

GRAPH="${WELLINFORMED_HOME:-$HOME/.wellinformed}/graph.json"
if [ ! -f "$GRAPH" ]; then exit 0; fi

NODES=$(grep -c '"id"' "$GRAPH" 2>/dev/null || echo 0)

# Extract keywords from the hook input (tool arguments come via stdin in some hooks)
# For now, show the graph exists + node count + suggest specific tools
cat <<HOOK
{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"wellinformed (${NODES} nodes): Before searching files, try the MCP tools — search returns your indexed research + codebase + external sources in one query. Tools: search(query, room?), ask(query), get_node(id), get_neighbors(id), find_tunnels(threshold?), discover_loop(room). Example: search({query: 'the topic you are looking for'}) returns nodes from ArXiv, HN, GitHub Trending, your .ts files, npm deps, and git commits."}}
HOOK
