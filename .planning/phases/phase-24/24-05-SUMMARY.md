---
phase: phase-24
plan: 05
subsystem: claude-hooks
tags: [v5-cutover, hooks, room-removal, wave-1d, hard-cutover]
dependency_graph:
  requires:
    - "24-01 (Room/room?: Room/nodesInRoom excised from GraphNode schema)"
  provides:
    - "Hook hit formatters render workspace, not room"
    - "Boot-time + auto-save paths no longer pass --room to the CLI"
    - "Hook scripts ready for V5 wire-protocol break"
  affects:
    - "Claude Code session-start MOTD (no rooms count)"
    - "Claude Code prompt-submit context block (workspace tag, not room)"
    - "PreToolUse hint banner (`*Getting Informed*` line)"
    - "PostToolUse auto-save (web fetches land as global, public nodes)"
tech_stack:
  added: []
  patterns:
    - "Workspace fallback `-` (vs former room fallback `?`) — explicit absence marker"
    - "Auto-touch by peer only (drop peer/room tuple key) — federation peer-pull is per-peer"
    - "Auto-save without --room — V5 CLI auto-detects workspace from cwd"
key_files:
  created: []
  modified:
    - path: ".claude/hooks/akashik-smart-hook.cjs"
      change: "renderHits formatter: [h.room ?? '?'] → [h.workspace ?? '-']; docstring updated"
    - path: ".claude/hooks/akashik-prompt-submit.cjs"
      change: "Drop h.room guard from auto-pull condition; drop room from (peer, room) target key (peer-only); drop --room from `akashik touch`; hit formatter renders workspace; topic-fallback uses workspaces"
    - path: ".claude/hooks/akashik-mcp-pre.cjs"
      change: "Banner `domains` slot: drop rooms fallback (topics.join only)"
    - path: ".claude/hooks/akashik-post-fetch.cjs"
      change: "Drop `const ROOM = 'research'`; drop --room from save argv; docstring updated to 'V5: global graph, public (not --private)'"
    - path: ".claude/hooks/akashik-session-start.sh"
      change: "Drop ROOMS env var probe; drop ROOM_COUNT segment from statusline"
    - path: ".claude/hooks/akashik-session-capture.sh"
      change: "Drop rooms.json existence guard + python DEFAULT_ROOM probe; drop 'room' field from node payload; add `private: false`"
decisions:
  - "Workspace fallback is `-` (not `?` or `null`) — explicit absence marker that distinguishes from data corruption"
  - "post-fetch saves are NOT marked --private — web fetches are shareable by default per V5 binary-privacy model"
  - "session-capture writes raw JSON (no CLI invocation) — preserves the lightweight no-spawn cost; adds `private: false` directly into the node payload"
  - "Auto-pull target dedup key collapses from `peer::room` to `peer` — federation pulls bodies by node id, not by (peer, room) tuple"
  - "Hook hit formatter shows `[workspace, age, peer]` triple (not `[workspace, peer]`) — preserves the existing 3-slot bracket; age signal remains"
metrics:
  duration: "~10 minutes"
  completed_date: "2026-05-27"
  commits: 6
  files_modified: 6
  loc_insertions: 33
  loc_deletions: 53
  loc_net: -20
requirements_delivered:
  - "ROOMS-DEL-08 (claude-hooks subsystem) — all 6 akashik-* hook scripts format hits without `room` field; none pass `--room` to any sub-CLI; none read `~/.akashik/rooms.json`"
---

# Phase 24 Plan 05: Akashik Claude Code Hooks — Room Removal Summary

**One-liner:** Excised every `h.room` reference, `--room` flag, and `rooms.json` probe from the 6 akashik Claude Code hook scripts; hit formatters now render `workspace` (fallback `-`), boot-time auto-capture writes raw nodes with `private: false`, and post-fetch auto-save lands web results in the global graph without a room flag — 20 net LOC removed, all 6 hooks pass syntax check + smoke test.

## What Was Built

### 1. `akashik-smart-hook.cjs` (PreToolUse: Grep / Glob / Read / WebSearch / WebFetch)

- **Hit formatter (line ~178):** `[${h.room ?? '?'}, ...]` → `[${h.workspace ?? '-'}, ...]`. Preserves the 3-slot bracket: `[workspace, age, peer]`.
- Module-level docstring updated: "top-3 nodes + ids + workspace + source URIs" (was "rooms").
- Closing instructive line dropped the room-specific staleness windows (`research > 7d, toolshed > 30d`) — system rooms are gone in V5; freshness is task-driven only.

### 2. `akashik-prompt-submit.cjs` (UserPromptSubmit)

- **Auto-pull condition (line ~164):** dropped the trailing `&& h.room` clause — peer body is fetched whenever distance/summary signals warrant, no room presence required.
- **Auto-pull target dedup (lines ~169-184):** key collapsed from `${peer}::${room}` to plain `peer`. `targets` array now carries `{ peer }` only. `akashik touch <peer> --max 10` (no `--room` arg). Comment updated: "V5: auto-touch-by-room is removed along with the room primitive."
- **Hit formatter (line ~234):** `[${room}, ${peer}]` → `[${workspace}, ${peer}]` with `workspace = h.workspace ?? '-'`.
- **Topic-extraction fallback (line ~512):** `_rooms` → `_workspaces` (still uses the workspace tag as the "domains" fallback when topic-extraction yields <2 terms).
- **`autoPulledLine` (line ~519):** dropped `/${room}` segment — peer label only.

### 3. `akashik-mcp-pre.cjs` (PreToolUse: `mcp__akashik__*`)

- **Banner `domains` slot (lines ~207-208):** dropped the `rooms.join(', ') || 'local'` fallback. Now `topics.join(', ') || 'local'` — content-extracted topic tags only, no room name passthrough. Comment updated to drop the "Falls back to the room set" paragraph.

### 4. `akashik-post-fetch.cjs` (PostToolUse: WebSearch / WebFetch)

- Dropped `const ROOM = 'research';` constant + the surrounding paragraph about system rooms.
- `akashik save` argv: dropped `--room ROOM`. Now `['save', '--type', 'source', '--label', label]`.
- Save invocation does NOT add `--private` (per plan: web fetches are shareable by default in V5).
- Docstring updated: "V5: web fetches land in the global graph; public (not --private). Workspace is auto-detected from cwd by the save CLI."

### 5. `akashik-session-start.sh` (SessionStart MOTD)

- Dropped the `ROOMS=` env-var assignment that pointed at `~/.akashik/rooms.json`.
- Dropped `ROOM_COUNT=$(grep -c ... "$ROOMS")` probe.
- Statusline string: `━━ akashik ━━ N nodes │ E edges │ R rooms │ S sources` → `━━ akashik ━━ N nodes │ E edges │ S sources`. (No workspace segment substituted — the existing script has no workspace variable available, and adding cwd detection here would change boot timing.)

### 6. `akashik-session-capture.sh` (Stop hook)

- Dropped the entire `ROOMS=...` + python `DEFAULT_ROOM` probe block (lines ~15-25).
- Dropped the `if [ -z "$DEFAULT_ROOM" ]; then exit 0; fi` early-exit guard. The hook now fires whenever the graph exists.
- Node payload: dropped `'room': '$DEFAULT_ROOM'` field; added `'private': False` (V5 sharing gate, default-shareable).
- New header comment: "V5: workspace is left unset here (auto-detected by CLI path; this hook writes raw JSON for performance). Sharing gate (`private: false`) is set so the node is federation-eligible."

## Smoke-test stdout (renderHits with fake hits)

Fed the V5 formatter a 3-hit synthetic payload:

```
akashik: 3 indexed node(s) match "test query about graphrag" (queried 3/4 peer(s))
  1. GraphRAG paper [akashik, 3d, local] d=0.92 — Microsoft GraphRAG hierarchical clustering
  2. V5 protocol design [-, 2w, peer:12D3KooWAbCd] d=1.01
  3. rerank study [akashik-dev, 3mo, local] d=0.98
```

Verified: workspace renders cleanly (`akashik`, `akashik-dev`), absent-workspace fallback shows as `-` (hit #2), age and peer slots unchanged. No crashes, no undefined slots.

All 4 cjs hooks also smoke-tested with no graph and degraded-input payloads — every one exits 0 silently as designed (no surprise stdout, no exception propagation).

## LOC Delta

| File | +ins | -del | Net |
|------|-----:|-----:|-----:|
| `akashik-smart-hook.cjs` | 3 | 3 | 0 |
| `akashik-prompt-submit.cjs` | 13 | 13 | 0 |
| `akashik-mcp-pre.cjs` | 4 | 5 | -1 |
| `akashik-post-fetch.cjs` | 6 | 12 | -6 |
| `akashik-session-start.sh` | 1 | 3 | -2 |
| `akashik-session-capture.sh` | 6 | 17 | -11 |
| **Total** | **33** | **53** | **-20** |

The two cjs formatters net to zero (token-for-token swaps); the shell hooks shed the python-rooms-json probes (~11 lines from session-capture alone); post-fetch sheds the system-rooms docstring + constant.

## Deviations from Plan

**None of architectural significance.** Three small Rule 3 adjustments inside the locked scope:

1. **smart-hook closing line** (Rule 2 — critical hygiene): the plan listed only the formatter line as the change site, but the closing instructive line referenced `research > 7d, toolshed > 30d` (the deleted system rooms) — left in place this would have actively misled Claude after the V5 cutover. Dropped the room-specific staleness windows to a generic "if a hit's age is stale for the task" phrase.

2. **smart-hook docstring** (Rule 2 — hygiene): the module-level header advertised "top-3 nodes + ids + rooms + source URIs" as the hit-path contract. Updated to "workspace" so the docstring matches the formatter.

3. **session-capture early-exit guard** (Rule 3 — fix blocker): the plan said to drop the python `DEFAULT_ROOM` probe; the natural follow-on is also to drop the `if [ -z "$DEFAULT_ROOM" ]; then exit 0; fi` line that immediately followed it (otherwise the hook becomes unreachable after the probe is removed). Dropped both.

The plan's note "DELETE the python block at line ~15 that probes ~/.akashik/rooms.json for DEFAULT_ROOM" and "DELETE lines ~22-23 that set DEFAULT_ROOM" were collapsed into a single contiguous block removal because, in the actual file, the probe and the assignment are part of the same python heredoc (not two separate stages). The behaviour is identical.

`akashik-hook.sh` is NOT in the plan's file list and was NOT modified by this plan. It carries a pre-existing in-conversation edit (visible in `git status`) that's outside this plan's scope — left for a separate commit.

## Acceptance Criteria — All Pass

```
grep -rnE "h\.room|--room\b|rooms\.json|DEFAULT_ROOM|ROOM_COUNT|const ROOM\s*=|rooms\.join" \
  .claude/hooks/akashik-*.cjs .claude/hooks/akashik-*.sh
→ (no hits) PASS

node --check .claude/hooks/akashik-smart-hook.cjs        → OK PASS
node --check .claude/hooks/akashik-prompt-submit.cjs     → OK PASS
node --check .claude/hooks/akashik-mcp-pre.cjs           → OK PASS
node --check .claude/hooks/akashik-post-fetch.cjs        → OK PASS
bash -n .claude/hooks/akashik-session-start.sh           → OK PASS
bash -n .claude/hooks/akashik-session-capture.sh         → OK PASS

Smoke: 4× cjs hooks with safe degraded inputs                 → exit 0 silently PASS
Smoke: renderHits with 3-hit synthetic payload                → renders cleanly PASS
```

## Self-Check: PASSED

- `git log --oneline | grep 24-05` → 6 commits visible (5908c6b, 1aabcd3, 89cb376, 634d09c, b40d82f, e619353)
- All 6 hook files modified (verified via `git show --stat` per commit)
- No co-authored commits (verified via `git log --format=fuller -6 | grep -i co-author` → empty)
- Branch: `feat/delete-rooms` (correct)

## Commits

| Hash | Message |
|------|---------|
| `5908c6b` | `refactor(24-05): drop h.room from smart-hook hit formatter, render workspace instead` |
| `1aabcd3` | `refactor(24-05): drop room from prompt-submit hit formatter + auto-pull (V5)` |
| `89cb376` | `refactor(24-05): drop rooms fallback from mcp-pre banner (topics-only)` |
| `634d09c` | `refactor(24-05): drop ROOM constant + --room arg from post-fetch auto-save (V5 global graph)` |
| `b40d82f` | `refactor(24-05): drop ROOMS probe + rooms count from session-start statusline` |
| `e619353` | `refactor(24-05): drop rooms.json probe + room field from session-capture node payload` |

All on branch `feat/delete-rooms`. No co-authored commits (per user's global CLAUDE.md). Not pushed.

## What Comes Next

The hook scripts are now in lockstep with the V5 wire protocol break — they won't pass `--room` to a `akashik save` / `akashik touch` CLI that no longer accepts it, and they won't read `rooms.json` once it's deleted from disk by the `migrate v5` command (Plan 24-09 territory).

Downstream consumers:

- **Plan 24-04** (`runtime.ts` + `detectWorkspace`): the save-CLI side of the contract. When the post-fetch hook fires `akashik save --type source --label X`, the CLI now reaches into cwd, runs `git rev-parse --show-toplevel`, slugifies the basename, and writes `workspace: <slug>` onto the node. Already committed (`a775896`).
- **Plan 24-09** (migrate v5): the `rooms.json` file we just stopped probing will eventually get deleted by the migration. After that, the `[ ! -f "$ROOMS" ]` style guards are dead code anyway — they were removed here as a preemptive sweep.
- **`akashik-hook.sh`** (the legacy PreToolUse + SessionStart shim): pre-existing in-conversation modification. Not touched by this plan. The legacy branch doesn't reference rooms at all (just a node count), so it's already V5-clean.

State / roadmap / requirements updates intentionally skipped per the executor instructions (gsd-tools indexer bugs make those updates unreliable mid-phase).
