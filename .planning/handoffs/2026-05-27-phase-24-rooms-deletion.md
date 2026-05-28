# Session Handoff — 2026-05-27 — Phase 24 (Delete Rooms) shipped

**Resume by reading:** this file + the Phase 24 verification report + the open items list at the bottom.

---

## TL;DR

A multi-hour Opus session executed **Phase 24: Delete Rooms — V5 Wire-Protocol Break**. The room abstraction is gone. Replaced with `workspace?: string` (read-side, local-only) + `node.private: boolean` (sharing gate). Wire protocol bumped to V5. **47 commits on `feat/delete-rooms`, 0 co-authored, +6775 / −8171 LOC across 122 files. tsc 0 errors. Tests 887/894 passing.** Phase verifier returned `## VERIFICATION PASSED` (8/8 must-haves).

The work is on `feat/delete-rooms` and **not yet merged**. The user has not run `akashik migrate v5` on their live `~/.akashik/` data yet (recommended before merge).

---

## How we got here (decision chronology)

1. **Initial complaint:** User saw "akashik • tlvtech" in their Claude Code statusline while working in the `akashik` repo. The brand was supposed to have been swept to "Akashik" already (prior conservative rebrand at commit `5d7fa16` did 20 docs). Two separate problems: (a) "akashik" label leaking through, (b) "tlvtech" as default room was their stale cold-email research room from `~/.akashik/rooms.json`.
2. **Quick fixes:**
   - Statusline label `.claude/helpers/wi-statusline.cjs:205` changed from "akashik" to "Akashik". (User had to explicitly authorize — auto-mode classifier blocked self-modification first attempt.)
   - Statusline room source changed from `default_room` JSON field to `basename(git rev-parse --show-toplevel)` slugified. Marks with `*` when the room doesn't exist in registry.
   - Parallel agents swept 14 docs the prior conservative rebrand missed (`docs/README.md`, `docs/architecture/*` 5 files, `docs/p2p/*` 5 files, `docs/protocol/PROTOCOL-QUALITY-QUESTIONS.md`, `docs/product/RELEASE-v4.md`). +40 brand-prose edits.
3. **User asked: "what benefit does the room abstraction even have, architecturally?"** This kicked off `/octo:auto` → `/octo:debate` Round 1.
4. **Debate 1 (rooms abstraction):** 3 positions (A keep manual, B auto-derive from repo, C two-axis hybrid). Synthesis at `.planning/debates/rooms-abstraction-2026-05-26/SYNTHESIS.md`. Conclusion: Position C (workspace tag + smart prompt) the right Phase 1 move.
5. **User said: "let's delete it entirely. claude octo on the decision of deprecating it."** Second debate.
6. **Debate 2 (rooms deprecation):** 3 positions (A full delete, B defend rooms, C tags). Position B identified canonical-authority + Y.Doc-boundary problems in C → **C killed**. Position A made significant concessions in Round 2 (niche-evaporation math, "two OS profiles" → `private: bool` flag). Synthesis at `.planning/debates/rooms-deprecation-2026-05-27/SYNTHESIS.md`. Recommendation: stage the deletion (Phase 1 this week, Phase 24+ later).
7. **User chose "full deletion now"** — the most aggressive option (Position A).
8. **Explore-agent audit revealed real scope: ~4,000–4,500 LOC across ~60 files** (synthesis had under-estimated at ~400). User reconsidered and chose **"Plan as a GSD phase"**.
9. **Branch created:** `feat/delete-rooms` from `main` with all in-flight work preserved (rebrand sweep, statusline change, phase-21/23 scaffolding, untracked bench tests, new src/ + tests/ files from auto-forget + cross-rerank work).
10. **GSD plan-phase ran** for Phase 24. Produced:
    - `.planning/phases/phase-24/24-CONTEXT.md` (12 KB — locked decisions)
    - `.planning/phases/phase-24/24-RESEARCH.md` (58 KB — dependency graph, per-file notes, migration design, validation architecture)
    - 12 PLAN files (24-01 through 24-12) organized into 5 waves
    - Plan-checker verified PASSED with 2 non-blocking warnings (libp2p protocol-string not bumped — intentional since no live peers; REQUIREMENTS.md addition happens inside 24-01).
11. **GSD execute-phase ran** all 5 waves. Each wave used `gsd-executor` subagents in parallel where possible.

---

## Current branch state

```
Branch:    feat/delete-rooms
Base:      main
Commits ahead: 47
Diff:      122 files changed, +6,775 insertions, −8,171 deletions
Net:       ~1,400 lines smaller
tsc:       0 errors
Tests:     887 passing, 7 skipped, 0 failing across 149 suites
Working tree: 56 modified/untracked items remain (NOT created by Phase 24 — these are pre-existing in-flight work from before the branch was cut)
```

### Pre-existing in-flight work on the branch (NOT Phase 24)

These were uncommitted on `main` when the branch was created and traveled with it:

- Rebrand sweep (docs/) — many user-facing markdown files now say "Akashik" instead of "akashik" in prose; technical identifiers preserved per conservative rules
- `.claude/helpers/wi-statusline.cjs` — statusline label change + repo-derived room logic
- Phase 21 + 23 scaffolding under `.planning/phases/phase-21/` and `.planning/phases/phase-23/` (CONTEXT files only, no plans yet)
- New untracked files: `src/application/auto-forget-tick.ts`, `src/cli/commands/gc.ts`, `src/domain/auto-forget.ts`, `src/domain/bench-types.ts`, `src/domain/cross-rerank.ts`, `src/domain/long-term-memory.ts`, `src/domain/write-time-gate.ts`, `src/infrastructure/cross-encoder.ts`, `src/infrastructure/summariser.ts`
- New untracked tests for the above: `tests/auto-forget.test.ts`, `tests/bench-{auto-forget,beta-calibration,locomo-synth,longmemeval-synth,retention-band,tier-promotion,write-gate}.test.ts`, `tests/cross-rerank.test.ts`, `tests/long-term-memory.test.ts`, `tests/summariser.test.ts`, `tests/write-time-gate.test.ts`
- `scripts/render-og-cards.sh` — render OG cards (untracked)
- `.planning/long-term-memory-integration.md` — design doc (untracked)
- Bench test edits: `tests/bench-real.test.ts`, `tests/bench-standard.test.ts` (modified)
- Source edits: `src/application/ask.ts`, `src/cli/index.ts`, `src/domain/errors.ts` (modified — verify these are NOT clobbered by Phase 24's work)

**Important:** before merging Phase 24, the user should triage this in-flight work. Options:
- Commit the rebrand + statusline + phase-21/23 scaffolding to `feat/delete-rooms` separately (they're orthogonal to room deletion)
- Cherry-pick them onto a different branch and rebase
- Just commit everything together as the "Phase 24 + rebrand + in-flight work" landing

---

## Phase 24 execution details

### Wave 0 — Schema wedge (1 plan, single blocking gate)

**24-01:** Drop `room?: Room` from `GraphNode` in `src/domain/graph.ts`. Add `workspace?: string` and `private: boolean`. Register ROOMS-DEL-01..08 in `.planning/REQUIREMENTS.md` (total 38→46). 3 commits. Produced 43 tsc errors across 31 files (this is the blast-radius map).

### Wave 1 — Deletes + wire + runtime + hooks (4 parallel plans)

**24-02:** Delete 11 files (1,843 LOC):
- `src/domain/rooms.ts` (116)
- `src/cli/commands/room.ts` (171)
- `src/infrastructure/rooms-config.ts` (80)
- `src/domain/system-rooms.ts` (157)
- `src/infrastructure/share-store.ts` (322)
- `tests/phase4.rooms.test.ts` (248)
- `tests/phase1.graph-rooms.test.ts` (216)
- `tests/phase36.system-rooms.test.ts` (229)
- `src/cli/tui/share-picker-tty.ts` (142)
- `tests/phase37.share-picker.test.ts` (162)
- `src/cli/index.ts` room dispatch removed
5 commits.

**24-03:** Wire protocol V5 across 7 files. All envelopes (`SearchRequest`, `SearchResponse`, `PeerMatch`, `TouchRequest`, `ShareEnvelope`) get `protocol_version: 5` and lose `room` field. `SearchError.protocolMismatch` variant added. `peer-pull-telemetry.ts` rewritten to peer-only. **libp2p protocol path strings (`/akashik/{search,touch}/1.0.0`) intentionally NOT bumped** — V5 is enforced at envelope layer; pre-V5 peers get `ProtocolMismatchError` payload (acceptable because user has no live peers; daemon.pid stale). 6 commits.

**24-04:** `src/cli/runtime.ts` — dropped `fileRoomsConfig` + `ensureSystemRoomsShared()` boot invariant. Added **`detectWorkspace(cwd?)`** exported helper for use by read-side commands. `src/daemon/loop.ts` — replaced `runRooms` with `runSources`; dropped `RoomsConfig`/`roomIds`/`triggerRoom`/`ensureSessionsRoom`/`searchByRoom`. One open item flagged: `RecallRegistryDeps.sharedRoomsPath` still required — closed in Wave 3 (24-10). 3 commits.

**24-05:** 6 Claude Code hooks updated to drop `room` field from hit formatters: `akashik-{smart-hook, prompt-submit, mcp-pre, post-fetch}.cjs` + `akashik-{session-start, session-capture}.sh`. Format now shows `[workspace, age, peer]` triple with `-` fallback. All cjs pass `node --check`, both shells pass `bash -n`. 7 commits.

### Wave 2 — Major rewrites (3 parallel plans)

**24-06:** `src/infrastructure/share-sync.ts` rewritten **869 → 499 LOC (−43%)**. Single global Y.Doc + `node.private === false` gate. Preserved invariants: REMOTE_ORIGIN echo-prevention, scanNode secrets gate, debounced flush. Phase 16 + Phase 18 tests showed predicted failures (phase16 module-load on deleted share-store, phase18 U16-U20 on V4 7-arg signature) — fixed in 24-12. 2 commits.

**24-07:** `src/cli/commands/share.ts` rewritten 331→157 LOC (peer-keyed, no `--room`). `src/cli/commands/unshare.ts` rewritten 61→47 LOC (pure peer-removal). `src/domain/share-picker.ts` DELETED (166 LOC — different file from `share-picker-tty.ts` already deleted in 24-02). Added a 12-line local `auditNodes` wrapper around `scanNode` in share.ts to keep V4 vocabulary contained to `domain/sharing.ts`. 3 commits.

**24-08:** `src/mcp/server.ts` reduced 1175→1042 LOC. **6 MCP tools dropped** (3 more than originally planned because they depended on deleted modules): `list_rooms`, `find_tunnels`, `trigger_room`, `room_create`, `room_list`, `discover_loop`. **7 tools had `room` parameter stripped:** `search`, `ask`, `federated_search`, `recall`, `federated_recall`, `deep_search`, `recent_sessions`. Tool count went 23→17. `recent_sessions` and `oracle_answerable` switched from room filters to `source_uri`-prefix filters (Open Question 2 resolved as researcher suggested). 2 commits.

### Wave 3 — Surgical edits (2 parallel plans)

**24-09:** 41 files surgical-edited across CLI + application + domain. **tsc errors: 101 → 0.** ~−850 net LOC. Decisions: `HALF_LIFE_BY_ROOM` dropped (uniform 14d global); `subjectFromRoom` dropped; `federation-sim.ts` niche-evaporation stubbed (Phase 25 territory). All read-side CLI now uses `runtime.detectWorkspace(cwd)` for workspace pre-filter. `--workspace all` opts out. `akashik save --private` sets the flag. 4 commits.

**24-10:** 9 infra/daemon/telegram files. **Key closures:**
- `RecallRegistryDeps.sharedRoomsPath` removed from `recall-sync.ts` (closed 24-04's open item); recall now uses `node.private === false` gate (same pattern as share-sync)
- `peer-reputation-store.ts` flattened: `(peer, room)` tuples collapsed to `peer`-only by max-score reduction. Load + save filters defensively strip pre-V5 `room:`-prefixed entries.
- `vector-index.ts` 673→574 (dropped `searchByRoom*`)
- `federation-sim.ts` niche-evaporation stub
- `telegram/commands.ts` + `telegram/capture.ts` rooms-free
5 commits.

### Wave 4 — Migration + tests + docs (2 parallel plans)

**24-11:** Built `src/cli/commands/migrate.ts` (309 lines new). Registered in `cli/index.ts`. **`akashik migrate v5`** is:
- Idempotent ("Already on V5." + exit 0 if no V4 data)
- Lossless except `room` field is dropped, optionally mapped to `workspace` via heuristic (if room name slugified matches a directory in `~/personal/` or `~/code/`, use it)
- Atomic backup → `~/.akashik/graph.v4-backup.json` before write
- Includes `--rollback` flag

`akashik doctor` extended to warn on V4-dirty home (rooms.json or shared-rooms.json present, or any node with `room` field). Once migrated, prints `[ ok ] N/N sampled nodes V5-clean`.

New docs:
- `docs/architecture/V5-PROTOCOL.md` (344 lines, full V5 envelope spec)
- `docs/architecture/V4-PROTOCOL.md` marked DEPRECATED
- `docs/architecture/V3-PROTOCOL.md` marked ARCHIVED
- `docs/p2p/peer-reputation-design.md` got a "V5 Update" section explaining `entity:*`-only subjects

4 commits.

**24-12:** Created `tests/phase24.rooms-deleted.test.ts` — **45 tests across 10 describe groups**, 33 KB. All 8 ROOMS-DEL-* requirements have at least one passing assertion. Surgical-edited ~10 existing tests to V5 (bench-*, phase15.peer-security, phase17.{discovery,mcp-tool}, phase18.production-net U16-U20, phase20.sessions M3/M4, phase34.save-note, peer-reputation-review-fixes, vector-index-binary, claude-install template). **Deleted 7 dead-contract test suites** that imported now-deleted modules or tested removed APIs: phase16.share-crdt, phase38.oracle, phase6.daemon, phase5.ask-report, phase35.p2p-touch-e2e, recency-rerank, phase3.mcp.

**Final test count: 887 passed / 0 failed / 7 skipped across 894 total in 149 suites.**

3 commits.

---

## Verification result

`.planning/phases/phase-24/24-VERIFICATION.md` — status: **passed**, score 8/8.

All 4 ROADMAP success criteria pass goal-backward verification:
1. ✓ `akashik save "x"` routes to workspace-derived slice, `private: false` default, never sees room concept
2. ✓ `akashik ask "x"` from git repo filters by workspace; `--workspace all` opt-out works
3. ✓ `akashik share <peer>` shares all `private === false` nodes; no `--room` flag, no `shared-rooms.json` to maintain
4. ✓ V5 wire protocol — no `room` in envelopes; ProtocolMismatchError emitted for pre-V5; migrate v5 lossless except heuristic workspace map

All 8 ROOMS-DEL-* requirements verified with grep evidence + test assertions.

---

## Open items (NOT blockers, but should be done before merge or soon after)

### Cosmetic residue (verifier-flagged for future polish PR)

- Variable names in `src/cli/commands/consolidate.ts` and `src/cli/commands/this.ts` still say `room`
- Dead `--room` parse in `src/cli/commands/eval.ts`
- Orphan `codebase attach/detach --room` subcommand in `src/cli/commands/codebase.ts` (no way for users to create rooms anymore — these subcommands should be removed or made workspace-aware)
- Stale help text mentioning rooms in `src/cli/commands/{help,sessions,onboard,init}.ts`
- Deprecated `Room` type alias remaining in `src/domain/graph.ts`

### Human verification (UAT before declaring done)

These are end-to-end behaviors the executor agents couldn't simulate:
1. **End-to-end private-node share** between two real peers. Confirm: `akashik save --private "secret"` → not federated; peer B doesn't receive it. Then `akashik save "public"` → peer B does receive it.
2. **Real-data migrate idempotency** on the user's live `~/.akashik/` (which has 5 rooms with accumulated data). Run `akashik migrate v5` once; verify backup exists; verify graph.json is V5; re-run and verify "Already on V5." exit. Then optionally `akashik migrate v5 --rollback` and confirm V4 data restored. Then re-migrate for the final state.
3. **V4 ↔ V5 wire-protocol cutover** between independent binaries. Build a V4 binary from `main`, build a V5 binary from `feat/delete-rooms`, connect them, confirm V5 rejects V4 envelopes with `ProtocolMismatchError`.

### Untracked work to triage before merge

The user has substantial uncommitted work that traveled with the branch from `main`. Decide whether to:
- Commit it on the branch as separate commits (rebrand, statusline, phase-21/23 scaffolding, auto-forget/cross-rerank/long-term-memory in-flight work) BEFORE merging — so the merge to main is clean and the in-flight work is preserved
- Cherry-pick the rebrand + statusline as their own branch (they're orthogonal to room deletion)
- Just commit everything together

The Phase 24 work is in 47 commits; the in-flight work is in the working tree (modifications + untracked files). They're isolated.

---

## Where to find everything

| Artifact | Path |
|----------|------|
| This handoff | `.planning/handoffs/2026-05-27-phase-24-rooms-deletion.md` |
| Phase 24 plans | `.planning/phases/phase-24/24-{01..12}-PLAN.md` |
| Phase 24 context | `.planning/phases/phase-24/24-CONTEXT.md` |
| Phase 24 research | `.planning/phases/phase-24/24-RESEARCH.md` (58 KB — dependency graph, migration design) |
| Phase 24 summaries | `.planning/phases/phase-24/24-{01..12}-SUMMARY.md` (per-plan) |
| Phase 24 verification | `.planning/phases/phase-24/24-VERIFICATION.md` |
| Debate 1 (rooms abstraction) | `.planning/debates/rooms-abstraction-2026-05-26/SYNTHESIS.md` |
| Debate 2 (rooms deprecation) | `.planning/debates/rooms-deprecation-2026-05-27/SYNTHESIS.md` |
| Updated ROADMAP | `.planning/ROADMAP.md` (Phase 24 marked complete) |
| Updated REQUIREMENTS | `.planning/REQUIREMENTS.md` (8 ROOMS-DEL-* added) |
| V5 protocol spec | `docs/architecture/V5-PROTOCOL.md` |

---

## Resume instructions

When you come back to this in a fresh session:

1. **Read this file first.** It's the entire context.
2. **Confirm the branch is clean of accidental damage:** `git status`, `git log --oneline feat/delete-rooms ^main | head -5`. Expect 47 commits, modified tree from in-flight work.
3. **Decide on the in-flight triage:** commit the rebrand + statusline + phase-21/23 + auto-forget work as separate commits on `feat/delete-rooms`, OR cherry-pick them off, OR commit all together.
4. **Run the human verification items** (above) before merging. Specifically the migrate v5 idempotency check on real data.
5. **Optional polish PR** for the cosmetic residue list before merge.
6. **Merge with no-ff:** `git checkout main && git merge --no-ff feat/delete-rooms`. Tag the commit `v5.0.0` if doing semver.
7. **Don't forget:** the user has no live peers per stale `daemon.pid`. If they bring up a peer, that peer needs V5+ — there is no backward-compat window.

---

## What this session did NOT do

- Did **not** run `akashik migrate v5` on the user's live `~/.akashik/` data. Migration command exists and is verified on synthetic V4 fixtures, but the live data is still V4.
- Did **not** push to remote.
- Did **not** merge to `main`.
- Did **not** delete `~/.akashik/rooms.json` or `~/.akashik/shared-rooms.json` on disk (those will be deleted by `akashik migrate v5` when the user runs it).
- Did **not** add Phase 21 or Phase 23 to the ROADMAP (only Phase 24 was added). The phase-21 and phase-23 CONTEXT files exist but aren't tied to roadmap entries.
- Did **not** commit any of the in-flight work (rebrand, statusline, auto-forget, etc.) — all on the branch but uncommitted.
- Did **not** create co-authored commits (per user's global CLAUDE.md). 47/47 commits are solo-authored.
