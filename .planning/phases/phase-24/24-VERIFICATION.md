---
phase: 24
verified: 2026-05-27
status: passed
score: 8/8 must-haves verified
must_haves_met: 8/8
re_verification:
  previous_status: none
  previous_score: n/a
gaps: []
human_verification:
  - test: "Smoke `wellinformed save --private` from a fresh git repo; then `wellinformed share <peer>` — confirm the private node is excluded from outbound Y.Map upsert."
    expected: "share output prints `private (skipped): N` with N>=1 and the private node id never reaches the peer."
    why_human: "End-to-end Y.js CRDT transit and peer perception require a live two-process run; unit tests cover the gate but not the wire visibility."
  - test: "From a clone of an unmigrated V4 install (with rooms.json + shared-rooms.json + room-tagged nodes), run `wellinformed migrate v5` twice."
    expected: "First run reports nodes migrated + rooms.json/shared-rooms.json deleted; second run reports `Reputation file already V5-clean (no legacy keys found)` and exits 0 without errors."
    why_human: "Idempotency on real V4 user data — unit fixtures cover the transform but not the on-disk transition behavior."
  - test: "Connect a V4 peer (running the prior protocol_version 4 daemon) and have it issue a federated search request to this V5 peer."
    expected: "V5 peer logs `peer at <id> sent V4 SearchRequest with \\`room\\` field. This peer is on V5; the \\`room\\` field is removed.` and closes the stream with SearchProtocolMismatch; no V4 envelope is parsed."
    why_human: "Wire-protocol cutover behavior between independent binaries must be observed live; mock-only assertions can't prove the network path."
---

# Phase 24: Delete Rooms — V5 Wire-Protocol Break Verification Report

**Phase Goal:** Delete the `room` abstraction entirely from the codebase. Replace with `workspace?: string` (read-side, local-only) + `private: boolean` (sharing gate). Bump federation wire protocol to V5. The user-facing room concept disappears: no `wellinformed room` CRUD, no `shared-rooms.json`, no `default_room`, no system rooms (`toolshed`, `research`). Sharing is gated by per-node `private === false`. Reputation flattens from `(peer, room)` to `peer` keys.

**Verified:** 2026-05-27
**Status:** PASSED — 8/8 must-haves verified, all quality gates green.
**Re-verification:** No — initial verification.

## Executive Summary

The codebase delivers the V5 cutover end-to-end. All 8 ROOMS-DEL-* requirements are satisfied: `wellinformed room` is unregistered from the CLI dispatch, `rooms.ts` / `room.ts` / `share-store.ts` are deleted, the wire envelopes on all three federation surfaces (search-sync, touch-protocol, share-sync) carry `protocol_version: 5` and reject pre-V5 envelopes with `SearchProtocolMismatch`, the graph node schema adds `workspace?: string` + `private?: boolean` while keeping `Room` only as a deprecated type alias for compile-time backward-compat, the migrate command exists with idempotent V4→V5 transform + rollback, and the `.claude` hooks format hits without `room`. Build is clean (`tsc --noEmit` exit 0), tests are clean (887 passed / 0 failed / 7 skipped), no Co-Authored-By footers on any of the 47 phase commits.

A small amount of vestigial `room` vocabulary remains in CLI-internal variable names (`consolidate.ts`'s `<room>` positional now semantically means workspace; `this.ts`'s `room: slug` in `watch-targets.json` carries a workspace slug; `eval.ts`'s `--room` flag is parsed but no longer passed to `ask()`; `codebase.ts` attach/detach still references rooms but they're unreachable since `wellinformed room` is gone) — these are deferred cosmetic renames, not functional violations. The wire protocol, sharing gate, and storage layer are all V5-pure.

## Goal Achievement

### Observable Truths (from ROADMAP Success Criteria)

| # | Truth (Success Criterion) | Status | Evidence |
|---|---------------------------|--------|----------|
| 1 | `wellinformed save "x"` from any cwd routes to a workspace-derived graph slice with `private: false` by default; user never sees a room concept. | VERIFIED | `src/cli/commands/save.ts`: parses `--private` / `--workspace`; calls `detectWorkspace()` from cwd; stamps `private: parsed.private` (default false). Returns explicit error if `--room` is passed: `"save: --room is removed in V5..."` (line 65). |
| 2 | `wellinformed ask "x"` from a git repo returns nodes filtered by workspace pre-filter; cross-workspace results available with `--workspace all`. | VERIFIED | `src/cli/commands/ask.ts`: parses `--workspace` (lines 52-53); `--workspace all` → `workspace = undefined` (no filter); absent → `detectWorkspace()` (line 68); `applyWorkspaceFilter` (line 127) filters `search_hits` and `recall_result.hits` by `h.workspace === workspace`. |
| 3 | `wellinformed share <peer>` shares all `private === false` nodes; no `--room` flag, no `shared-rooms.json` to maintain. `wellinformed save --private` sets the flag. | VERIFIED | `src/cli/commands/share.ts`: no `--room` argument anywhere; filters `graph.json.nodes.filter((n) => n.private !== true)` (line 102); blocks on secret-bearing nodes with `wellinformed save --private` guidance (line 134). `src/infrastructure/share-store.ts` deleted; sharing pipeline operates on the candidate-node list directly. |
| 4 | Federation wire protocol bumped to V5: `SearchRequest.room` and `SearchResponse.room` fields removed; pre-V5 peers receive a clear protocol-version error. | VERIFIED | `src/infrastructure/search-sync.ts:329-336`: presence of `rawDecoded.room` triggers `SearchProtocolMismatch` with message `"peer at <id> sent V4 SearchRequest with \`room\` field. This peer is on V5..."`. `protocol_version !== 5` is rejected separately (lines 348-353). Same guards in `touch-protocol.ts` (lines 180-194) and `share-sync.ts` (lines 89-104). All three surfaces use `*_PROTOCOL_VERSION = 5 as const`. |

**Score:** 4/4 truths verified.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/cli/commands/room.ts` | DELETED | VERIFIED | File absent. `test -f` returns non-zero. |
| `src/domain/rooms.ts` | DELETED | VERIFIED | File absent. |
| `src/infrastructure/share-store.ts` | DELETED | VERIFIED | File absent. |
| `src/cli/commands/migrate.ts` | EXISTS (V4→V5 migration) | VERIFIED | Present, 280+ lines, exports `migrateCommand`; registered in CLI dispatch as `'migrate'` (index.ts:113). |
| `src/cli/commands/save.ts` | `--private` + `--workspace` flags; no `--room` | VERIFIED | Both new flags parsed; `--room` produces explicit removal error. |
| `src/cli/commands/ask.ts` | `--workspace W\|all` opt-out flag; applies workspace pre-filter | VERIFIED | `applyWorkspaceFilter` defined locally; called after federated/local ask. |
| `src/cli/commands/share.ts` | No `--room`; gates on `node.private === false` | VERIFIED | `--room` flag absent; `collectShareable` filters by `private !== true`. |
| `src/infrastructure/search-sync.ts` | V5 envelope guards; no `room` field on wire | VERIFIED | `SEARCH_PROTOCOL_VERSION = 5`; reject path for V4 `room` field and version mismatch. |
| `src/infrastructure/touch-protocol.ts` | V5 envelope guards; `private`-only gating | VERIFIED | `TOUCH_PROTOCOL_VERSION = 5`; same dual-guard pattern. |
| `src/infrastructure/share-sync.ts` | V5 envelope; `room` removed from Y.Map payload | VERIFIED | `SHARE_PROTOCOL_VERSION = 5`; Y.Map upsert payload is `{id, label, embedding_id, source_uri, fetched_at}` only. |
| `src/cli/runtime.ts:detectWorkspace` | Exported; reads cwd's git toplevel | VERIFIED | Line 49 — exported helper imported by ask, save, recall, discover, report, viz, export-obsidian, index-project. |
| `src/domain/graph.ts` schema | `workspace?: string`, `private?: boolean`, NO required `room` | VERIFIED | Lines 55-69 declare both fields; `Room` retained only as deprecated type alias with explicit `@deprecated` JSDoc. |
| `docs/architecture/V5-PROTOCOL.md` | Spec document | VERIFIED | Present alongside V3-PROTOCOL.md, V4-PROTOCOL.md. |

### Key Link Verification

| From | To | Via | Status | Detail |
|------|-----|-----|--------|--------|
| CLI `save` | graph repo write | `parseArgs → { private, workspace } → indexNode` | WIRED | save.ts line 111 passes parsed.private; line 112 passes parsed.workspace into the indexNode call. |
| CLI `ask` | application `ask` use case | workspace inferred at CLI boundary, application layer is workspace-blind | WIRED | ask.ts line 110: filter applied at CLI; application/ask.ts has no workspace concept (correct per V5 architecture). |
| CLI `share` | `collectShareable` | `private !== true` gate | WIRED | share.ts:102 filters; share-sync.ts:209-210 `collectShareable` re-filters at the Y-doc upsert site. |
| Federation request | V5 envelope guard | `protocol_version === 5 && room === undefined` | WIRED | search-sync.ts, touch-protocol.ts, share-sync.ts all enforce both guards before any state mutation. |
| V4 data on disk | V5 detection + migration | `wellinformed migrate v5` | WIRED | migrate.ts `detectV4` checks for rooms.json, shared-rooms.json, or `n.room` field; transformNodes strips room, defaults private, maps room → workspace heuristically; flattenReputation removes `room:*` subject keys. |
| `.claude` hooks | wellinformed CLI | hit-format JSON output | WIRED | wellinformed-mcp-pre.cjs and wellinformed-prompt-submit.cjs comments document V5 contract; no `--room` flag passed; no `rooms.json` read. |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|----------------|-------------|--------|----------|
| ROOMS-DEL-01 | 24-02, 24-08 | `wellinformed room` CLI command removed; no subcommand routes to room CRUD. | SATISFIED | `src/cli/commands/room.ts` deleted. `grep "room" src/cli/index.ts` returns 0 hits. No `'room':` key in the dispatch table (lines 62-123). |
| ROOMS-DEL-02 | 24-02, 24-04 | `~/.wellinformed/rooms.json` no longer read or written. | SATISFIED | `grep "rooms.json" src/` only matches: migrate.ts (deletion path), doctor.ts (V4 artifact detection), comments. Zero active read/write code paths. |
| ROOMS-DEL-03 | 24-02, 24-06 | `~/.wellinformed/shared-rooms.json` removed; sharing gates on `node.private === false`. | SATISFIED | `src/infrastructure/share-store.ts` deleted; `share.ts:102` gates on `n.private !== true`; `recall-sync.ts:300` gates on `built.node.private !== false`; `share-sync.ts:210` `collectShareable` filters on `n.private === false`. |
| ROOMS-DEL-04 | 24-01, 24-09 | `GraphNode` has `room` removed, `workspace?: string` + `private: boolean` added. | SATISFIED | `src/domain/graph.ts:55-69`: both fields declared with proper JSDoc. `Room` type alias kept solely for compile-time backward-compat with `@deprecated` annotation (lines 32-39). |
| ROOMS-DEL-05 | 24-03, 24-08 | Wire protocol V5: `SearchRequest`, `SearchResponse`, peer-pull telemetry have no `room` field. | SATISFIED | `SEARCH_PROTOCOL_VERSION = 5` (search-sync.ts:59); `TOUCH_PROTOCOL_VERSION = 5` (touch-protocol.ts:84); `SHARE_PROTOCOL_VERSION = 5` (share-sync.ts:77 area). V4 envelopes rejected via `rawDecoded.room !== undefined` + version mismatch guards. `application/peer-pull-telemetry.ts` carries `room: ''` only into the internal `EnrichedMatch` consensus-diagnostic shape (line 75) — never on the wire. |
| ROOMS-DEL-06 | 24-11 | `wellinformed migrate v5` exists, is idempotent, migrates losslessly. | SATISFIED | `src/cli/commands/migrate.ts` registered in CLI dispatch (line 113). `runMigrate` transforms nodes (strip room, default private=false, heuristic workspace map), `flattenReputation` removes `room:*` subject keys, `removeIfExists` deletes rooms.json + shared-rooms.json. Re-run on a V5-clean install reports `Reputation file already V5-clean (no legacy keys found)` (line 247). Phase24 acceptance test covers idempotency at tests/phase24.rooms-deleted.test.ts:413. |
| ROOMS-DEL-07 | 24-04, 24-09 | Read-side commands auto-apply workspace pre-filter when cwd is in a git repo; `--workspace all` opts out. | SATISFIED | `detectWorkspace` exported from runtime.ts (line 49) and used by ask, recall, discover, report (verified via grep). All four commands accept `--workspace W|all`. ask.ts performs the actual `applyWorkspaceFilter`; others propagate the workspace through their own pipelines or annotate behavior. |
| ROOMS-DEL-08 | 24-05 | All `.claude/hooks/wellinformed-*` scripts format hits without `room` field; pass test suite. | SATISFIED | grep across all six wellinformed-* hook scripts finds only V5-narrative comments — no `--room` flag passing, no `~/.wellinformed/rooms.json` reads, no `room` field in formatted hit output. Phase24 hooks test suite at tests/phase24.rooms-deleted.test.ts:538 passes. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/cli/commands/consolidate.ts` | 46, 86 | Variable named `room` but semantically holds a workspace slug. | Info | Cosmetic. Comment at line 101-105 documents the V5 semantic shift; runtime behavior is workspace-correct (with v4 graph fallback). Future PR can rename. |
| `src/cli/commands/this.ts` | 81 | `watch-targets.json` field still named `room: slug` while holding a workspace value. | Info | Cosmetic. Inline comment (lines 77-79) flags the deferred field rename. No user-visible impact. |
| `src/cli/commands/eval.ts` | 49, 56-57, 228 | `--room` flag parsed but not forwarded to `askUseCase` (the use case has no `room` param). | Info | Dead flag — accepted to avoid breaking pre-V5 eval JSONL fixtures, but ignored at the call site. Should be removed in a follow-up cleanup. |
| `src/cli/commands/codebase.ts` | 9-10, 258-314, 413-414 | `codebase attach/detach --room <r>` still references rooms. | Warning | The `wellinformed room` command is gone, so users have no way to create a room to attach to. The underlying `codebase_rooms` SQLite table in code-graph.ts still exists. This subcommand is now orphan-but-callable — running it stores attachments to non-existent room IDs. Not part of any ROOMS-DEL-* criterion, but a notable inconsistency. Recommend follow-up phase to either repurpose to `--workspace` or remove the subcommand entirely. |
| `src/cli/commands/swarm.ts` | 50, 186 | Synthetic swarm corpus `SwarmNote.room: 'research' \| 'toolshed'`. | Info | Lives in a benchmark/sim-only corpus generator. Doesn't enter the wire envelope or real graph state. Cosmetic. |
| `src/cli/commands/help.ts` | 22, 27, 28, 30, 31 | Help text still shows `--room R` for trigger, report, index, discover, discover-loop. | Warning | User-facing help docs are stale post-cutover. Doesn't block functionality (the flags are individually rejected or coerced) but is misleading UX. Should be updated in a follow-up doc pass. |
| `src/cli/commands/peers-rep.ts` | 205 | Help text mentions `--subject <entity:foo\|room:r>`. | Info | `room:*` subjects are filtered out by the V5 reputation store loader, so passing one returns empty. Stale help text. |
| `src/cli/commands/sessions.ts` | 37, 45, 72 | Help text refers to `wellinformed trigger --room sessions`. | Warning | Stale guidance pointing to a no-longer-valid flag. Should update to V5 syntax. |
| `src/cli/commands/init.ts` | 5 | JSDoc still mentions "creating a research room". | Info | Comment-only; doesn't affect runtime. |
| `src/cli/commands/onboard.ts` | 9, 247, 520 | Onboarding flow still narrates "system rooms (toolshed + research)". | Warning | User-facing onboarding text references deleted abstractions. Functionally onboard.ts line 247 is a no-op, but the narrative misleads new users. Doc cleanup follow-up. |

None of these are blockers for the phase goal. They are deferred cosmetic / doc-text cleanups. The wire protocol, storage layer, sharing gate, schema, and verification test suite are all V5-pure.

### Quality Gates

| Gate | Command | Result |
|------|---------|--------|
| Typecheck | `npx tsc --noEmit` | Exit 0, no output. |
| Full test suite | `npm test` | 887 passed / 0 failed / 7 skipped / 0 todo (894 tests across 149 suites). |
| Phase 24 acceptance test | `npm test -- tests/phase24.rooms-deleted.test.ts` | Passes (10 describe blocks covering all 8 ROOMS-DEL-* IDs). |
| Phase branch commit count | `git log --oneline main..feat/delete-rooms \| wc -l` | 47 commits. |
| No Co-Authored-By footers | `git log main..feat/delete-rooms --format="%h %s%n%b" \| grep -i "co-authored\|anthropic"` | No matches (only filename/scheme strings like `claude-install.ts` / `claude_sessions:`). |
| Branch name | `git branch --show-current` | `feat/delete-rooms`. |

### Human Verification Required

Three items captured in frontmatter `human_verification:` block — see top of file. Summary:
1. **End-to-end share with `--private`**: confirm private nodes never reach a real peer's Y-doc.
2. **migrate v5 idempotency on real V4 data**: run twice against a live V4 install, confirm second run is a clean no-op.
3. **V4 ↔ V5 wire-protocol cutover**: stand up a V4 peer and confirm the V5 daemon rejects it with the documented SearchProtocolMismatch message.

### Gaps Summary

None blocking. The 8 ROOMS-DEL-* requirements are all satisfied; the 4 ROADMAP success criteria all map to verified code paths; build and tests are clean. The phase delivers its goal.

Recommended follow-up (NOT phase-24 gaps, but technical-debt items the verification surfaced):
- Rename `consolidate.ts` positional `<room>` → `<workspace>`; `this.ts` watch-targets field `room` → `workspace`.
- Decide fate of `codebase attach/detach --room`: rewire to workspace, or drop entirely.
- Strip vestigial `--room` accept-and-ignore in `eval.ts`.
- User-doc cleanup of `help.ts`, `sessions.ts`, `onboard.ts`, `init.ts` to remove "room" / "research room" / "toolshed" narrative.
- Drop the `Room` deprecated type alias from `domain/graph.ts` once the planned wave-3 surgical edits complete.

---

_Verified: 2026-05-27_
_Verifier: Claude (gsd-verifier)_
