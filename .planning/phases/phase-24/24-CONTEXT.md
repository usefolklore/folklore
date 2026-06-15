# Phase 24: Delete Rooms — V5 Wire-Protocol Break — Context

**Gathered:** 2026-05-27
**Status:** Ready for research + planning
**Source:** Two octopus-debates (rooms-abstraction, rooms-deprecation) + Explore-agent scope audit

<domain>
## Phase Boundary

Delete the `room` abstraction entirely. The user-facing room concept disappears:
- No `folklore room` CRUD CLI
- No `~/.folklore/rooms.json` registry
- No `~/.folklore/shared-rooms.json` policy file
- No `default_room` concept
- No system rooms (`toolshed`, `research`) — these vanish
- No `room` field in any wire-protocol message envelope

Replace with two new primitives:
1. **`workspace?: string`** — optional node field, populated at index time from `slugify(basename(git rev-parse --show-toplevel))`. Read-side pre-filter only. **Local-only — never enters federation, never enters reputation.**
2. **`private: boolean`** (default `false`) on every graph node. Sharing becomes filter on `private === false`. `folklore save --private` sets it. **Replaces `shared-rooms.json` entirely** for the binary-privacy case.

Federation wire protocol bumps to **V5**: `SearchRequest.room`, `SearchResponse.room`, and peer-pull telemetry `room` field all removed. Pre-V5 peers receive a clear protocol-version error (hard break — user has no live peers, daemon.pid is stale).

Reputation `(peer, room)` tuples flatten to `peer`-only keys.

Storage migration: drop `~/.folklore/rooms.json`, drop `~/.folklore/shared-rooms.json`, consolidate per-room Y.Docs into one global graph Y.Doc.

**Out of scope:** Replacing the deleted topical-grouping function with anything else. The synthesis decided `private: bool` covers the binary case; any future topical/tag primitive is deferred indefinitely until empirical evidence justifies it.

</domain>

<decisions>
## Implementation Decisions

### Architectural (LOCKED — from debate synthesis)

- **Delete entirely, do not rename.** The wire protocol breaks at V5; there is no "rooms become tags" rebrand. The synthesis killed Position C (tags) because of canonical-authority and Y.Doc-boundary problems.
- **Atomically in one PR.** No two-name period. No backward compatibility window. User has no live peers.
- **No co-authored commits.** Per the user's global CLAUDE.md.

### Replacement primitives (LOCKED)

- `workspace?: string` on graph nodes — populated from `slugify(basename(git rev-parse --show-toplevel))` at index time. Read-side filter only. `--workspace all` flag opts into cross-workspace queries. `--workspace <slug>` overrides cwd detection.
- `private: boolean` on graph nodes (default `false`). `folklore save --private` sets it. Sharing path filters on `node.private === false`. Replaces `shared-rooms.json`.
- **Auto-create rooms is deleted along with rooms.** There is no "auto-create the workspace room" concept — the workspace is a node-level tag, not a registry entry.

### Data migration (LOCKED)

- One-shot command: `folklore migrate v5`. Idempotent. Lossless except the `room` field is dropped onto an optional `workspace` field where possible (heuristic: if the room name slugified matches a known repo basename in the user's filesystem, use it; otherwise drop the field, leave `workspace: null`).
- Existing 5 rooms (`folklore-dev`, `p2p-llm`, `tlvtech`, `forge`, `auto-tlv`) → all nodes merge into a single graph. Room field stripped, workspace field set heuristically where possible, `private: false` set on all (user can mark sensitive nodes private after migration).
- Reputation flattening: collapse `(peer, room)` tuples to `peer` by max-score reduction (preserves the strongest signal per peer).

### What to delete entirely (LOCKED)

| File | Lines | Reason |
|------|-------|--------|
| `src/domain/rooms.ts` | 116 | Domain vocabulary — gone |
| `src/cli/commands/room.ts` | 171 | CRUD CLI — gone |
| `src/infrastructure/rooms-config.ts` | 80 | Persistence — gone |
| `src/domain/system-rooms.ts` | 157 | toolshed/research — gone |
| `src/infrastructure/share-store.ts` | 322 | shared-rooms.json store — gone |
| `tests/phase4.rooms.test.ts` | 248 | Tests the deleted CRUD |
| `tests/phase1.graph-rooms.test.ts` | 216 | Tests deleted graph-rooms |
| `tests/phase36.system-rooms.test.ts` | 229 | Tests deleted system rooms |

### What to rewrite (LOCKED)

| File | Lines | Rewrite |
|------|-------|---------|
| `src/infrastructure/share-sync.ts` | 869 | Drop room authorization gate; drop `searchByRoom` union; pure private-flag gate |
| `src/cli/commands/share.ts` | 331 | Drop `--room` flag, drop shareable-check, becomes `share <peer>` for all `private:false` nodes |
| `src/cli/commands/unshare.ts` | 61 | Becomes peer-removal only |
| `src/domain/share-picker.ts` | 166 | Pure peer picker, no room projection |
| `src/mcp/server.ts` | 1175 | Drop `list_rooms`, `find_tunnels`, `trigger_room` tools; strip `room` param from `search`, `federated_search` |

### What gets surgical edits (LOCKED scope, ~47 files)

CLI: `ask.ts`, `discover.ts`, `recall.ts`, `save.ts`, `touch.ts`, `report.ts`, `viz.ts`, `index-project.ts`, `export-obsidian.ts`, `discover-loop.ts`, `trigger.ts`, `lint.ts`, `init.ts`, `index.ts`
Runtime: `runtime.ts` (remove `ensureSystemRoomsShared`, drop `fileRoomsConfig`)
Daemon: `daemon/loop.ts` (remove `RoomsConfig` type, `defaultRoom()` calls)
Application: `discover.ts`, `discovery-loop.ts`, `ingest.ts`, `session-ingest.ts`
Infrastructure: `search-gossip.ts`, `peer-pull-telemetry.ts`, `touch-protocol.ts`, `share-envelope.ts`, `peer-reputation-store.ts`
Domain: `graph.ts` (drop `room?: Room` field from `GraphNode`, drop `nodesInRoom`, drop `roomFilter`)
Telegram: `telegram/commands.ts`
Hooks: `.claude/hooks/folklore-{session-start,session-capture,prompt-submit,smart-hook,post-fetch}.{sh,cjs}`

### Test strategy (LOCKED)

- Delete the 3 phase tests (`phase1.graph-rooms`, `phase4.rooms`, `phase36.system-rooms`) — their subject is being deprecated.
- Edit ~13 other tests to remove room assertions and add private/workspace assertions where relevant (`phase16.share-crdt`, `phase34.save-note`, `phase37.share-picker`, `consolidator.test`, etc.).
- Add new test file `tests/phase24.rooms-deleted.test.ts` covering:
  - Wire protocol V5 (no `room` field in any envelope)
  - `folklore save --private` sets the flag
  - Sharing filters on `private === false`
  - Workspace pre-filter active in git repos
  - `folklore migrate v5` is idempotent and lossless

### Claude's Discretion

- Exact wave ordering and parallelization within waves (planner agent decides)
- Whether to introduce intermediate compatibility code or commit to a hard cutover (default: hard cutover, no shims)
- Exact error message wording for protocol mismatch
- Naming of new test file (e.g., `phase24.rooms-deleted.test.ts` vs `phase24.v5-cutover.test.ts`)
- Internal helper function names in the new `--workspace` pre-filter logic
- The migration command's progress UX

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architectural decisions
- `.planning/debates/rooms-deprecation-2026-05-27/SYNTHESIS.md` — The decision to delete entirely (this phase's mandate)
- `.planning/debates/rooms-abstraction-2026-05-26/SYNTHESIS.md` — Prior workspace-tag + smart-prompt design (workspace primitive comes from here)
- `.planning/debates/rooms-deprecation-2026-05-27/round1-*.md`, `round2-*.md` — Position rationale and refutation logic
- `docs/PROJECT-PLAN-FOLKLORE.md` — Phase 24 federation hardening context (this phase subsumes it for the deletion piece)

### Existing code (source of truth)
- `src/domain/rooms.ts` (to be deleted) — current vocabulary
- `src/cli/commands/room.ts` (to be deleted) — CRUD surface
- `src/infrastructure/share-store.ts` (to be deleted) — shared-rooms.json store
- `src/infrastructure/share-sync.ts` (to be rewritten) — room authorization gate is here
- `src/mcp/server.ts` (to be edited) — MCP tools that take room param
- `src/cli/runtime.ts` — `ensureSystemRoomsShared()` boot invariant lives here
- `src/domain/graph.ts` — `GraphNode.room` field lives here
- `src/application/federated-search.ts` — fan-out routing by room
- `docs/architecture/V3-PROTOCOL.md`, `V4-PROTOCOL.md` — current wire protocol (these become V5)
- `docs/p2p/peer-reputation-design.md` — `room:*` subject keys

### Style guide
- `./CLAUDE.md` (project) — file organization rules, no root saves, DDD bounded contexts, files under 500 lines
- `~/.claude/CLAUDE.md` (user) — strict linting, functional programming, neverthrow result monads, no co-authored commits

</canonical_refs>

<specifics>
## Specific Ideas

### Migration command UX
```
$ folklore migrate v5
Reading ~/.folklore/graph.json...
  21,128 nodes found across 5 rooms + 6 system rooms.
Reading ~/.folklore/rooms.json...
  5 user rooms, 1 default (tlvtech).
Reading ~/.folklore/shared-rooms.json...
  0 rooms marked shareable.

Migrating to V5...
  ✓ Stripped `room` field from 21,128 nodes
  ✓ Set `private: false` on 21,128 nodes
  ✓ Heuristic workspace assignment: 3,481 nodes tagged (from repo basename match)
  ✓ Flattened 4 reputation entries from (peer, room) to peer keys
  ✓ Deleted ~/.folklore/rooms.json
  ✓ Deleted ~/.folklore/shared-rooms.json
  ✓ Backed up pre-migration graph to ~/.folklore/graph.v4-backup.json

V5 cutover complete. Run `folklore doctor` to verify.
```

Idempotent: if no `room` fields present in graph, exits 0 with "Already on V5" message.

### Wire-protocol error for pre-V5 peers
On receiving a `SearchRequest` with a `room` field, the V5 peer responds:
```
ProtocolMismatchError: peer at <multiaddr> sent V4 SearchRequest with `room` field.
This peer is on V5; the `room` field is removed. Upgrade the requester or the responder.
```

### Hook contract break
The 5 folklore hooks (`.claude/hooks/folklore-*.{sh,cjs}`) all format graph hits with a `room` field. They break together in this phase. Each hook needs its hit-formatter updated to drop the room and optionally show `workspace` when present.

### Auto-detect cwd workspace
`src/cli/runtime.ts` gets a helper:
```ts
const detectWorkspace = (cwd: string): string | undefined => {
  try {
    const top = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
    return slugify(basename(top));
  } catch {
    return undefined;
  }
};
```

Used by `save`, `ask`, `recall`, `report` — anywhere a query/write needs workspace pre-filter.

</specifics>

<deferred>
## Deferred Ideas

- **Tag primitive replacement.** Synthesis explicitly deferred. Re-evaluate if/when topical sharing emerges as a real user need.
- **Multi-tier privacy.** Today: binary `private: bool`. Tomorrow (if needed): `--share-with <DID>` per-node. Reserved.
- **Cross-workspace federated search as default.** V1 keeps workspace filter; cross-workspace requires `--workspace all`.
- **Lazy room re-creation.** Not happening. Rooms are gone.
- **A graceful pre-V5 compatibility window.** Not happening — user has no live peers, hard cutover.
- **FolkloreBench-F + niche-evaporation work.** Phase 24 in PROJECT-PLAN-FOLKLORE.md scoped this — moved to a separate phase (TBD, possibly 25) since the deletion subsumes the room dimension that niche-evaporation was measuring.

</deferred>

---

## Requirements (new — to be added to REQUIREMENTS.md)

| ID | Description |
|----|-------------|
| ROOMS-DEL-01 | `folklore room` CLI command is removed; no subcommand routes to room CRUD |
| ROOMS-DEL-02 | `~/.folklore/rooms.json` is no longer read or written by any code path |
| ROOMS-DEL-03 | `~/.folklore/shared-rooms.json` is removed; sharing gates on `node.private === false` |
| ROOMS-DEL-04 | `GraphNode` schema has `room` removed, `workspace?: string` and `private: boolean` added |
| ROOMS-DEL-05 | Wire protocol V5: `SearchRequest`, `SearchResponse`, peer-pull telemetry have no `room` field |
| ROOMS-DEL-06 | `folklore migrate v5` exists, is idempotent, and migrates the user's live graph losslessly (except `room` → `workspace` heuristic) |
| ROOMS-DEL-07 | Read-side commands (`ask`, `recall`, `discover`, `report`) auto-apply workspace pre-filter when cwd is in a git repo; `--workspace all` opts out |
| ROOMS-DEL-08 | All `.claude/hooks/folklore-*` scripts format hits without `room` field and pass the test suite |

---

*Phase: phase-24*
*Context gathered: 2026-05-27 from rooms-abstraction debate + rooms-deprecation debate + Explore-agent scope audit*
