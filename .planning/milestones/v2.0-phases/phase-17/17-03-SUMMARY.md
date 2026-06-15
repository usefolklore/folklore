---
phase: phase-17
plan: "03"
subsystem: cli-mcp-surface
tags: [federated-search, ask-peers, mcp-tool, peer-discovery, daemon-bootstrap, libp2p]
dependency_graph:
  requires: [phase-17-01, phase-17-02]
  provides: [ask --peers CLI flag, federated_search MCP tool (14th), peer list discovery_method column, daemon search protocol bootstrap]
  affects: [17-04]
tech_stack:
  added: []
  patterns: [short-lived-libp2p-node-per-command, finally-node-stop-leak-prevention, soft-degrade-no-peers, privacy-aware-tool-description]
key_files:
  created: []
  modified:
    - src/cli/commands/ask.ts
    - src/cli/commands/peer.ts
    - src/mcp/server.ts
    - src/daemon/loop.ts
decisions:
  - "Short-lived libp2p node per ask --peers / federated_search invocation — mirrors peer add pattern, no shared node lifecycle complexity"
  - "node.stop() wrapped in try/catch in finally — benign errors must not shadow main result"
  - "Federated branch returns before local-only path using early return from askFederated helper — keeps ask() readable"
  - "Cleanup order in daemon: unregisterSearch → unregisterShare → node.stop — search is newer, unregisters first"
  - "Search registration independent of share registration success — both protocols attempt to register when liveNode is live"
metrics:
  duration_minutes: 5
  completed_date: "2026-04-12T13:00:15Z"
  tasks_completed: 3
  files_modified: 4
---

# Phase 17 Plan 03: CLI/MCP Surface Layer Summary

One-liner: `ask --peers` flag with askFederated helper (short-lived libp2p node, _source_peer render, tunnel section) + `federated_search` as the 14th MCP tool (privacy-aware description, same spin-up/down pattern) + `peer list` discovery_method column + daemon wires SEARCH_PROTOCOL_ID alongside SHARE_PROTOCOL_ID with peersPath/mdns/dhtEnabled forwarded.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend ask.ts with --peers flag + askFederated helper | 65dab8c | src/cli/commands/ask.ts |
| 2 | peer list discovery_method column + federated_search 14th MCP tool | bf14479 | src/cli/commands/peer.ts, src/mcp/server.ts |
| 3 | Daemon wires search protocol alongside share protocol + peersPath forwarding | b664a29 | src/daemon/loop.ts |

## Verification Results

- `npm run build` exits 0 — TypeScript strict mode, zero errors across all 4 files
- `npm test` — 127/127 pass, 0 regressions on Phase 15/16 suites
- All contract greps pass (see grid below)

## Contract Grep Grid

| Check | Target | Result |
|-------|--------|--------|
| `grep -c "'--peers'" ask.ts` | 1 | 1 |
| `grep -c "askFederated" ask.ts` | >=2 | 2 |
| `grep -c "runFederatedSearch" ask.ts` | >=2 | 2 |
| `grep -c "await node.stop()" ask.ts` | 1 | 1 |
| `grep -c "peers_queried" ask.ts` | >=1 | 2 |
| `grep -c "Cross-room tunnels" ask.ts` | 1 | 1 |
| `grep -c "discovery_method" peer.ts` | >=2 | 3 |
| `grep -c "p.discovery_method ?? 'manual'" peer.ts` | >=2 | 2 |
| `grep -c "'federated_search'" server.ts` | 1 | 1 |
| `grep -c "server.registerTool" server.ts` | 14 | 14 |
| `grep -ic "privacy" server.ts` | >=1 | 1 |
| `grep -c "await node.stop()" server.ts` | 1 | 1 |
| `grep -c "createSearchRegistry" loop.ts` | >=2 | 2 |
| `grep -c "registerSearchProtocol" loop.ts` | >=2 | 4 |
| `grep -c "unregisterSearchProtocol" loop.ts` | >=2 | 2 |
| `grep -c "peersPath:" loop.ts` | 1 | 1 |
| `grep -c "search_rate_limit" loop.ts` | >=1 | 2 |
| `grep -c "liveSearch" loop.ts` | >=3 | 6 |
| Cleanup order: unregisterSearch before unregisterShare | line 312 < 315 | PASS |

## What Was Delivered

### Task 1: ask.ts — --peers flag + askFederated helper

**ParsedArgs extended:**
```typescript
interface ParsedArgs {
  readonly query: string;
  readonly room?: string;
  readonly k: number;
  readonly peers: boolean;   // FED-01
}
```

**parseArgs recognises `--peers` boolean** — no value consumed, sets `peers = true`.

**ask() branches before local-only path:**
```typescript
if (parsed.peers) {
  return askFederated(runtime, parsed);
}
// ...existing local-only path unchanged...
```

**askFederated helper:**
1. Embeds query via `runtime.embedder.embed()`
2. Loads config + identity; calls `createNode({ listenPort: 0, mdns, dhtEnabled, peersPath })`
3. Best-effort parallel dials of all known peers from peers.json
4. Calls `runFederatedSearch({ node, vectorIndex }, { embedding, k, room })`
5. Renders each match with `source_peer: <peerId>` or `source_peer: local`
6. Renders `## Cross-room tunnels` section when `result.tunnels` is non-empty
7. Prints `peers_queried / peers_responded` footer
8. `node.stop()` in `try { ... } catch { /* benign */ }` inside `finally` — TCP listener leak prevention

**Soft-degrade behaviour:** 0 connected peers returns local results only with `peers_queried: 0`. No hard error.

### Task 2a: peer.ts — discovery_method column

**JSON output** (`--json`): `discovery_method: p.discovery_method ?? 'manual'` added to per-peer object. Legacy peers.json entries missing the field render as `'manual'`.

**Text output**: `discovery: manual/mdns/dht` line added per peer entry alongside `added:` and optional `label:`.

### Task 2b: server.ts — 14th MCP tool federated_search

**Imports added:** `join`, `createNode`, `dialAndTag`, `loadPeers`, `loadConfig`, `runFederatedSearch`, `folkloreHome`.

**Tool registered** after `find_tunnels`, before `sources_list` (grouped with search-flavored tools).

**Description:** includes `PRIVACY NOTE` explaining embedding correlability and PIR deferral to v3 (CONTEXT.md requirement).

**Handler:** embed → createNode (ephemeral port 0) → dial known peers → runFederatedSearch → okJson with full result shape including tunnels + counters. `node.stop()` in finally.

**Final MCP tool count: 14** (was 13 after Phase 16).

### Task 3: daemon/loop.ts — search protocol + peersPath forwarding

**New imports:** `createSearchRegistry`, `registerSearchProtocol`, `unregisterSearchProtocol`, `SearchRegistry` from `search-sync.ts`.

**liveSearch variable:** `let liveSearch: SearchRegistry | null = null` alongside existing `liveSync`.

**createNode call updated** with `peersPath`, `mdns`, `dhtEnabled` from loaded config — enables `peer:discovery` handler to persist discovered peers to disk.

**Search registration** runs after share registration attempt, independent of share success. Logs `search protocol registered: /folklore/search/1.0.0` on success, or logs failure and continues (`liveSearch = null`).

**Cleanup order** (verified by line numbers):
```
line 312: unregisterSearchProtocol(liveSearch)
line 315: unregisterShareProtocol(liveSync)
line 318: liveNode.stop()
```

**No changes to runOneTick** — search is reactive (inbound request/response), not a tick-driven operation.

## Manual Smoke Test (for human verifier)

```bash
# 1. Verify peer list shows discovery column
folklore peer list
# Expected: "discovery: manual" for any existing peers

# 2. Verify ask --peers runs without error (0 peers = local-only)
folklore ask "knowledge graph" --peers
# Expected: "peers_queried: 0" footer, local results shown

# 3. Verify MCP tool count
folklore mcp start &
# (ask Claude Code to call federated_search)
# Expected: returns JSON with peers_queried, matches, tunnels fields

# 4. Verify daemon log shows search protocol registered
folklore daemon start
tail -5 ~/.folklore/daemon.log
# Expected line: "search protocol registered: /folklore/search/1.0.0"
```

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `src/cli/commands/ask.ts` — modified, commit 65dab8c exists
- `src/cli/commands/peer.ts` — modified, commit bf14479 exists
- `src/mcp/server.ts` — modified, commit bf14479 exists
- `src/daemon/loop.ts` — modified, commit b664a29 exists
- `npm run build` exits 0
- `npm test` — 127/127 pass
