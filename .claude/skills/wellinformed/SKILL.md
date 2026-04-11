---
name: wellinformed
description: Knowledge graph research skill. Trigger with /wellinformed or when the user asks about research, sources, rooms, tunnels, or their knowledge graph. Also triggers when PreToolUse hook reports "wellinformed: Knowledge graph exists."
---

# wellinformed — Agent Skill

You have access to the wellinformed knowledge graph via MCP tools. Use this skill to narrate operations with full visibility.

## When to Activate

- User types `/wellinformed`
- User asks "what do I know about X", "search my research", "what did I read"
- User asks to trigger, discover, index, or manage rooms/sources
- PreToolUse hook fires with "wellinformed: Knowledge graph exists"
- User asks about architecture, dependencies, or prior research

## Operation Visibility Rules

**ALWAYS narrate what you're doing.** Don't silently call MCP tools. Show the user each step.

### Search Operations

When searching the graph, show the pipeline:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 wellinformed ► SEARCHING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Embedding query: "{query}"
◆ Searching room: {room} ({node_count} nodes)
◆ k-NN over {vector_count} vectors...

Results:
  1. {title} — distance: {d} — {source_type}
  2. {title} — distance: {d} — {source_type}
  3. {title} — distance: {d} — {source_type}
```

### Trigger Operations

When triggering a room, spawn a **named background agent** for visibility:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 wellinformed ► TRIGGERING room={room}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Loading sources for room '{room}'...
◆ Found {n} enabled sources

  ◆ Fetching: {source_id} ({kind})...
  ✓ {source_id}: {seen} items, {new} new, {skipped} skipped

  ◆ Fetching: {source_id} ({kind})...
  ✓ {source_id}: {seen} items, {new} new

Summary: +{total_new} nodes, {total_skipped} skipped
```

### Discovery Loop

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 wellinformed ► DISCOVERY LOOP room={room}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Iteration 1:
  → Discovering sources from keywords: {keywords}
  → Found {n} new sources
  → Triggering ingest...
  → Extracting new keywords from content...
  → New keywords: {kw1}, {kw2}, {kw3}

◆ Iteration 2:
  → Discovering with expanded keywords...
  → Found {n} new sources
  → No new keywords extracted

✓ Converged after 2 iterations
  Total: +{sources} sources, +{nodes} nodes
```

### Index Operations

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 wellinformed ► INDEXING PROJECT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Scanning codebase: {root}
  → {n} source files found
  → {n} new, {n} unchanged (skipped)

◆ Reading package.json
  → {n} dependencies

◆ Parsing .gitmodules
  → {n} submodules

◆ Reading git log
  → {n} recent commits

✓ Index complete: +{new} nodes, {skipped} skipped
```

### Tunnel Detection

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 wellinformed ► TUNNEL DETECTION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

◆ Loading vectors from {n} rooms...
◆ Computing cross-room similarities (threshold={t})...

Tunnels found:
  🚇 {node_a} ↔ {node_b}
     rooms: {room_a} / {room_b}
     distance: {d}
     why: both discuss {topic}
```

## How to Use MCP Tools

### Quick reference

| Tool | When | Show |
|------|------|------|
| `search` | "What do I know about X?" | Narrate: embedding → k-NN → results |
| `ask` | "Give me context on X" | Narrate: search → context assembly |
| `get_node` | "Tell me about this source" | Show full node attributes |
| `get_neighbors` | "What connects to X?" | Show graph traversal |
| `find_tunnels` | "Any cross-domain connections?" | Narrate similarity scan |
| `trigger_room` | "Refresh my research" | Narrate per-source progress |
| `discover_loop` | "Find more sources" | Narrate iterations + convergence |
| `graph_stats` | "How big is my graph?" | Show stats with breakdown |
| `room_create` | "Start tracking X" | Confirm room + suggest sources |
| `room_list` | "What rooms do I have?" | List with counts |
| `sources_list` | "What feeds am I pulling?" | List with kinds + configs |

### Before answering research questions

1. Call `graph_stats` to know the current state
2. Call `search` with the user's question
3. If results found → cite them with source_uri
4. If no results → suggest `trigger_room` or `discover_loop`

### Proactive graph use

When the PreToolUse hook fires, BEFORE grepping:
1. Call `search` with the relevant keywords
2. If the graph has good results, use them instead of raw files
3. Tell the user: "Found this in your knowledge graph:" + cite

## Status Display

After any operation, show the current state:

```
───────────────────────────────────────
wellinformed • {room}
{nodes} nodes | {edges} edges | {vectors} vectors | {sources} sources
───────────────────────────────────────
```
