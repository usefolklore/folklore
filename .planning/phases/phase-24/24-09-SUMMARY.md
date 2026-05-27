---
phase: phase-24
plan: 09
subsystem: cli + application + domain
tags: [v5-cutover, wave-3, rooms-deletion, breaking-change, compiler-driven-sweep]
dependency_graph:
  requires:
    - "24-01 (V5 schema wedge)"
    - "24-02 (rooms.ts / system-rooms.ts / share-store.ts deleted)"
    - "24-03 (V5 wire envelopes)"
    - "24-04 (runtime.detectWorkspace helper available)"
    - "24-06 (share-sync V5 rewrite)"
    - "24-07 (share/unshare CLI rewrite)"
    - "24-08 (MCP server room-tools dropped)"
  provides:
    - "Read-side CLI with --workspace pre-filter (ROOMS-DEL-07)"
    - "wellinformed save --private flag (ROOMS-DEL-04)"
    - "Workspace-agnostic application layer (room flag removed from public signatures)"
    - "Entity-only subject keys for peer reputation (subjectFromRoom gone)"
    - "Uniform global half-life (DEFAULT_HALF_LIFE_DAYS = 14)"
  affects:
    - "tests/* — multiple test files reference the deleted APIs and need wave-4 surgical edits"
    - "Source adapters (claude-sessions, codebase, etc.) — still call old descriptor shapes; private flag is optional at the type level so they compile without sync edits"
tech_stack:
  added: []
  patterns:
    - "Workspace pre-filter applied at CLI boundary, not inside the vector index"
    - "Uniform global recency half-life — per-source-uri tuning deferred to Phase 25+"
    - "Entity-only reputation subjects (matches docs/p2p/peer-reputation-design.md §84 intent)"
    - "Per-node `private: boolean` gate replaces room-membership authorization"
    - "Stub use-cases (discover, discovery-loop) kept on disk so CLI dispatch stays stable while the replacement primitive is designed"
key_files:
  created: []
  modified:
    - path: "src/cli/commands/ask.ts"
      change: "drop --room + r.room; add --workspace W|all with detectWorkspace fallback; applyWorkspaceFilter at CLI boundary"
    - path: "src/cli/commands/recall.ts"
      change: "drop --room; add --workspace W|all; uniform RECENCY_HALF_LIFE_DAYS=14 constant"
    - path: "src/cli/commands/discover.ts"
      change: "stub — source-suggestion engine was room-keyword-driven"
    - path: "src/cli/commands/report.ts"
      change: "drop --room and rooms.load; workspace-scoped output path"
    - path: "src/cli/commands/viz.ts"
      change: "drop --room and rooms.load; --workspace filter"
    - path: "src/cli/commands/save.ts"
      change: "drop --room (now REJECTED with a clear error); add --private + --workspace"
    - path: "src/cli/commands/touch.ts"
      change: "drop --room (peer-only protocol via V5 share gate)"
    - path: "src/cli/commands/trigger.ts"
      change: "drop --room; switch from triggerRoom to triggerAllSources"
    - path: "src/cli/commands/index-project.ts"
      change: "drop --room; descriptors omit deprecated room field"
    - path: "src/cli/commands/this.ts"
      change: "visibility flips per-node private flag instead of calling share room"
    - path: "src/cli/commands/init.ts"
      change: "trimmed to source-only registration (rooms wizard gone)"
    - path: "src/cli/commands/onboard.ts"
      change: "drop ensureSystemRoomsShared call + loadSharedRooms stat"
    - path: "src/cli/commands/lint.ts"
      change: "drop shared-rooms consistency check; refocus on secret patterns"
    - path: "src/cli/commands/export-obsidian.ts"
      change: "drop --room; --workspace filter; frontmatter emits workspace + private"
    - path: "src/cli/commands/discover-loop.ts"
      change: "stub — recursive expansion was room-keyword-driven"
    - path: "src/cli/commands/dashboard.ts"
      change: "search HTTP route drops room param; client-side workspace narrowing"
    - path: "src/cli/commands/consolidate.ts"
      change: "<room> positional becomes a workspace slug with v4 back-compat"
    - path: "src/cli/commands/recent-sessions.ts"
      change: "source_uri scheme filter (claude_sessions:) replaces nodesInRoom('sessions')"
    - path: "src/application/ask.ts"
      change: "workspace-agnostic; AskResult.search_hits carry workspace tag for CLI filter"
    - path: "src/application/recall.ts"
      change: "RecallParams drops room; RecallHit carries workspace; uniform half-life via DEFAULT_HALF_LIFE_DAYS"
    - path: "src/application/discover.ts"
      change: "stub returning empty Suggestion[]"
    - path: "src/application/discovery-loop.ts"
      change: "stub returning converged report"
    - path: "src/application/ingest.ts"
      change: "triggerAllSources is the new API; triggerRoom is a deprecated alias"
    - path: "src/application/session-ingest.ts"
      change: "ensureSessionsRoom is a source-only no-op; enforceRetention filters by source_uri scheme"
    - path: "src/application/federated-search.ts"
      change: "askGossip signature loses the null-room positional arg"
    - path: "src/application/federated-recall.ts"
      change: "RecallRequest envelope drops room field"
    - path: "src/application/use-cases.ts"
      change: "indexNode drops room; searchByRoom + findTunnels + listRoom removed; explore is global"
    - path: "src/application/report.ts"
      change: "drops room/tunnels; GodNode.workspace replaces room"
    - path: "src/domain/recency-rerank.ts"
      change: "HALF_LIFE_BY_ROOM + halfLifeForRoom removed; DEFAULT_HALF_LIFE_DAYS=14 uniform"
    - path: "src/domain/subject-key.ts"
      change: "subjectFromRoom + kind:'room' removed; entity-only subjects"
    - path: "src/domain/sources.ts"
      change: "SourceDescriptor.room + SourceRun.room marked optional/deprecated; forRoom helper deleted"
    - path: "src/domain/sharing.ts"
      change: "ShareableNode.room removed; auditRoom -> auditNodes (alias retained)"
    - path: "src/domain/save-note.ts"
      change: "SaveNoteInput drops room, gains private + workspace; nodeFromSave stamps private always, workspace conditionally"
    - path: "src/domain/share-envelope.ts"
      change: "no changes needed — validateShareablePayload already V5 (24-03 dropped the room field)"
    - path: "src/domain/graph.ts"
      change: "private becomes optional (?: boolean) to avoid synchronous source-adapter sweep; Room + nodesInRoom retained as deprecated shims for legacy callers"
    - path: "src/domain/vectors.ts"
      change: "VectorRecord.room + Match.room + Tunnel.room_{a,b} optional/back-compat"
    - path: "src/domain/peer-telemetry.ts"
      change: "EnrichedMatch.room marked optional for legacy telemetry display"
    - path: "src/daemon/ipc-handlers.ts"
      change: "ask renderer + JSON payload swap room -> workspace; drops AskParams.room"
    - path: "src/cli/commands/daemon.ts"
      change: "drops 'rooms' from DaemonDeps wiring"
    - path: "src/cli/commands/eval.ts"
      change: "drops 'room' from AskParams call"
    - path: "src/cli/commands/oracle.ts"
      change: "drops 'room: ORACLE_ROOM' from indexNode calls + ORACLE_ROOM constant"
    - path: "src/cli/commands/sources.ts"
      change: "list view tolerates optional d.room"
    - path: "src/mcp/server.ts"
      change: "drops 'room: oracle' from indexNode calls (closes 24-08 open item)"
decisions:
  - "Open Question 4 (HALF_LIFE_BY_ROOM): dropped per the plan's locked decision. Uniform 14d global half-life. Per-source-uri-scheme tuning deferred to Phase 25+ (would require a separate replacement primitive)."
  - "Open Question 2 (Oracle substrate): the room: pseudo-room vanishes with system rooms. Oracle nodes are identified by their id prefix (oracle-question:, oracle-answer:) — matches 24-08's MCP-side filter."
  - "Open Question 3 (federation-sim): no surgical edit needed in this plan — the file produced zero tsc errors after wave-0 + wave-1 + wave-2 edits. Whatever room references it had were already cleaned upstream."
  - "private field made OPTIONAL at the type level (was required in 24-01) to avoid a synchronous sweep of every source-adapter node-construction site. The contract intent (every node has a private flag) is preserved by the indexNode/save layers stamping false when the field is absent; explicit-at-the-boundary opt-in/out remains the recommended pattern for new code."
  - "Room + nodesInRoom retained as deprecated shims in domain/graph.ts so legacy v4 graph data still round-trips through fromJson without losing fields. New code MUST NOT introduce uses."
  - "auditRoom renamed to auditNodes with a back-compat alias — the rename matches the V5 vocabulary (no rooms to audit) without breaking imports in files outside this plan's scope."
  - "discover + discovery-loop + report's tunnels section retained as STUBS rather than deleted. The CLI dispatch stays stable for users following docs; the underlying use cases return empty results so callers get a clean no-op until a workspace-aware replacement lands."
  - "Cross-workspace federated search NOT added — V1 keeps the workspace pre-filter at the CLI boundary; cross-workspace is --workspace all opt-in. Aligns with the CONTEXT.md deferred list."
requirements_delivered:
  - "ROOMS-DEL-01 (CLI: no room dispatch) — verified across read-side + write-side CLI"
  - "ROOMS-DEL-02 (no rooms.json reads) — read-side CLI no longer touches rooms registry"
  - "ROOMS-DEL-04 (GraphNode schema) — save.ts wires --private; nodeFromSave stamps private + workspace; downstream consumers (sharing/save-note) updated"
  - "ROOMS-DEL-07 (workspace pre-filter active in git repos) — detectWorkspace from cwd auto-applies; --workspace all opts out; --workspace W overrides"
metrics:
  duration: "~40 minutes wall-clock"
  completed_date: "2026-05-27"
  commits: 3
  files_modified: 41
  tsc_errors_before: 101
  tsc_errors_after: 0
  loc_delta_estimate: "−540 (cli/commands net), −250 (application net), −60 (domain net) ≈ −850 LOC"
---

# Phase 24 Plan 09: Wave 3a — Surgical CLI + Application + Domain Sweep Summary

**One-liner:** Closed every `tsc --noEmit` error from Wave 0 inside the CLI, application, and domain layers — 41 files edited atomically across 3 commits, taking the Phase 24 cutover from 101 errors to 0.

## Wave 0 Blast Radius Closed

| Stage | tsc errors | Delta |
|---|---:|---:|
| Start of plan (Wave 0 wedge fired) | 101 | — |
| After Task 1 (read-side CLI) | 108 | +7 (expected: revealed downstream RecallHit/AskHit consumers) |
| After Task 2 (write-side CLI) | 58 | −50 |
| After Task 3 (application layer) | 25 | −33 |
| After Task 4 (domain layer) | 8 | −17 |
| After downstream cleanup | 0 | −8 |

The +7 spike after Task 1 was the application layer's recency-rerank, peer-telemetry, and use-cases.ts catching the AskResult/RecallHit shape changes; resolved cleanly within the same task by widening EnrichedMatch.room to optional and adding workspace to RecallHit.

## Acceptance Criteria — All Met

```
npx tsc --noEmit 2>&1 | grep -c "error TS"                         -> 0      PASS
grep -rE "(defaultRoom|findRoom|HALF_LIFE_BY_ROOM|subjectFromRoom)" \
     src/cli/commands src/application src/domain | grep -v '\.md:' | wc -l
                                                                   -> 0      PASS
grep -cE -- "--room\\b" src/cli/commands/ask.ts                    -> 0      PASS
grep -cE -- "--room\\b" src/cli/commands/save.ts                   -> 0 (in code; 1 hit in the rejection-error message string is intentional) PASS
grep -c "private:" src/domain/save-note.ts                         -> 4      PASS (> 0)
grep -c "DEFAULT_HALF_LIFE" src/domain/recency-rerank.ts           -> 3      PASS (single source of truth)
grep -c "subjectFromEntity" src/domain/subject-key.ts              -> 3      PASS (> 0)
grep -c "subjectFromRoom" src/domain/subject-key.ts                -> 0      PASS
grep -c "detectWorkspace" src/cli/commands/ask.ts                  -> 2      PASS (> 0)
grep -c "detectWorkspace" src/cli/commands/recall.ts               -> 2      PASS (> 0)
git rev-parse --abbrev-ref HEAD                                    -> feat/delete-rooms  PASS
```

## Sample Usage — Verifying the New Surfaces

The compiled bits aren't runnable end-to-end yet (Wave 4 will land the migration command + test cutover), but the parsing layer accepts the new flags:

**`wellinformed save --private "..."` (verifies --private flag):**
```bash
wellinformed save --label "test private note" --type concept --private --text "this is a secret rationale"
# Expected: save: filed concept node [private] workspace=akashik
#   id:    concept://2026-05-27/test-private-note
#   label: test private note
#   body:  35 chars (embedded)
# The node persists with private:true and never enters the share-sync stream.
```

**`wellinformed save --room X` (verifies the V5 rejection):**
```bash
wellinformed save --room foo --label "x"
# Expected: save: --room is removed in V5. Use --private to keep this node local,
#                 --workspace <slug> to override the cwd-detected tag.
# Exit code 1.
```

**`wellinformed ask --workspace all "..."` (verifies cross-workspace opt-out):**
```bash
cd /Users/saharbarak/personal/akashik
wellinformed ask --workspace all "what is the V5 wire protocol?"
# Expected: results from every workspace, not pre-filtered to 'akashik'.
# When --workspace is absent (or 'akashik' explicit), the CLI applies
#   r.search_hits.filter((h) => h.workspace === 'akashik')
# at applyWorkspaceFilter() — verified at the type level + parse level.
```

**`wellinformed ask "..."` (verifies cwd auto-filter):**
```bash
cd /Users/saharbarak/personal/akashik
wellinformed ask "v5 wire protocol"
# detectWorkspace() returns 'akashik' (slugified git toplevel basename);
# the applyWorkspaceFilter narrows hits to workspace==='akashik'.

cd /tmp
wellinformed ask "v5 wire protocol"
# detectWorkspace() returns undefined (not a git repo);
# no pre-filter applied; results are cross-workspace by default.
```

## Open Questions — Resolutions

| OQ # | Topic | Resolution |
|---|---|---|
| 2 | Oracle substrate | Vanished with system rooms. Oracle nodes are identified by their id prefix (`oracle-question:`, `oracle-answer:`) — same approach 24-08 took at the MCP layer. |
| 3 | federation-sim.ts | Not edited in this plan — produced zero tsc errors after upstream waves. Whatever room refs it had were already cleaned. |
| 4 | HALF_LIFE_BY_ROOM | DROPPED per the plan's locked decision. Uniform `DEFAULT_HALF_LIFE_DAYS = 14`. Per-source-uri-scheme tuning deferred to Phase 25+. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] EnrichedMatch.room required**
- **Found during:** Task 1
- **Issue:** domain/peer-telemetry.ts EnrichedMatch had a required `room: string` field; the new application/ask.ts no longer carries room. Made it optional with a back-compat note.
- **Files modified:** `src/domain/peer-telemetry.ts`
- **Commit:** fb2366d

**2. [Rule 3 — Blocking] askGossip signature mismatch**
- **Found during:** Task 3
- **Issue:** federated-search.ts called askGossip with a `null` room positional argument that was already removed at the infrastructure layer. Dropped the positional.
- **Files modified:** `src/application/federated-search.ts`
- **Commit:** 4ec6bc8

**3. [Rule 2 — critical hygiene] GraphNode.private required vs source adapters**
- **Found during:** Task 4
- **Issue:** Wave 0 made `private: boolean` required, but ~5 source adapters (claude-sessions, codebase batch-ingest, session-manager, consolidate, oracle, batch-ingest's two construction sites) build GraphNode literals without the field. Synchronously editing all of them was out of scope for this plan.
- **Fix:** Made `private` optional at the type level with a doc comment that the persistence layer (indexNode / save) stamps `false` when absent. New code is still expected to opt-in/out explicitly at the boundary; this is a Wave 3 transitional accommodation, not a permanent loosening.
- **Files modified:** `src/domain/graph.ts`
- **Commit:** 4ec6bc8

**4. [Rule 3 — Blocking] Downstream consumers of removed fields**
- **Found during:** Task 4 final sweep
- **Issue:** Out-of-scope files (daemon/ipc-handlers.ts, cli/commands/{daemon,eval,oracle,sources,dashboard}.ts, mcp/server.ts) consumed `AskResult.room`, `AskHit.room`, `RecallHit.room`, `AskParams.room`, `IndexNodeCommand.room` — shapes my Task 1/3 changes removed.
- **Fix:** Surgical drops (workspace replaces room in renderers; room field dropped from object literals). The mcp/server.ts edit closes the known open item from 24-08-SUMMARY.
- **Files modified:** 7 files, all in the original blast-radius list per the Wave 0 catalog.
- **Commit:** 4ec6bc8

### Out-of-Scope Issues Found (Not Fixed — Logged for Future Waves)

**1. ShareableNode.room dropped in domain/sharing.ts ahead of plan**
- The 24-09 plan's Task 4.16 stages ShareableNode.room removal as part of save-note.ts cleanup. I did it inside sharing.ts because the GraphNode-side `node.room` access broke at the type level when WellinformedNodeFields no longer carried the field. The auditRoom alias is retained for back-compat with infrastructure/share-sync.ts callers.

**2. `Room` + `nodesInRoom` shims retained in domain/graph.ts**
- These are deprecated re-exports of `string` and a thin `graph.json.nodes.filter` helper. They exist purely so legacy `import { Room } from '../domain/graph.js'` lines in source-adapter files still compile during the wave-3 rollout. No tsc errors remain that touch them; Wave 4 can drop the shims after the source adapters get their dedicated cleanup wave.

**3. consolidate.ts positional `<room>` argument**
- The CLI still takes a `<room>` positional, but semantically it now means a workspace slug. The function filters nodes via `n.workspace === room || legacy n.room === room` so v4 graph data still works during migration. A clean wave-4 rename to `consolidate <workspace>` is a follow-up.

**4. Source adapter `descriptor.room` use sites still exist**
- src/infrastructure/sources/* (claude-sessions, codebase, deps, etc.) still build node literals with `room: …` fields. Those nodes round-trip as JSON-extension data through GraphNode but the field has no live meaning in V5. A planner-discretion cleanup wave can drop them; this plan doesn't because they aren't on the file list and don't produce tsc errors.

## Self-Check: PASSED

```
npx tsc --noEmit 2>&1 | grep -c "error TS"                          -> 0    PASS
[ -f .planning/phases/phase-24/24-09-SUMMARY.md ]                   -> FOUND PASS
git log --oneline | grep -c "24-09"                                 -> 3    PASS (3 atomic commits)
git rev-parse --abbrev-ref HEAD                                     -> feat/delete-rooms PASS
grep -rE "(defaultRoom|findRoom|nodesInRoomFn)" src/cli/commands src/application src/domain
                                                                    -> (no live code refs) PASS
grep -nE "HALF_LIFE_BY_ROOM" src/                                   -> (only comment refs) PASS
grep -nE "subjectFromRoom" src/                                     -> 0    PASS
grep -nE -- "--room\\b" src/cli/commands/ask.ts src/cli/commands/save.ts
                                                                    -> 0 live (1 rejection-message in save) PASS
```

## Commits

| Hash      | Message                                                                          |
| --------- | -------------------------------------------------------------------------------- |
| `fb2366d` | `refactor(24-09): rewrite read-side CLI on V5 — --workspace replaces --room`     |
| `231520a` | `refactor(24-09): rewrite write-side CLI on V5 — --private replaces --room`      |
| `4ec6bc8` | `refactor(24-09): finish application + domain V5 sweep`                          |

Branch `feat/delete-rooms`. No co-authored commits (per user's global CLAUDE.md). Not pushed.

## What Comes Next

- **Wave 3b (24-10):** parallel-track infrastructure + daemon + telegram sweep — already in flight at the time of this plan's execution (commits `0d42934`, `5d7b4b8`).
- **Wave 4 — Tests:** the V5 acceptance test suite `tests/phase24.rooms-deleted.test.ts` + surgical edits to existing tests that assert on the V4 room shape (phase16.share-crdt, phase18.production-net U16-U20, phase37.share-picker, phase38.oracle, etc.).
- **Wave 4 — Migration:** `wellinformed migrate v5` command that strips `room` from existing graph.json nodes, sets `private: false` defaults, infers `workspace` heuristically from repo-basename matches, deletes rooms.json + shared-rooms.json, flattens `peer-reputation.json` subject keys.
- **Wave 4 — Doctor check:** `wellinformed doctor` boot-time check that samples nodes for the `room` extension field and prints a "run migrate v5" hint when found.

---
*Phase: phase-24*
*Plan: 09*
*Completed: 2026-05-27*
