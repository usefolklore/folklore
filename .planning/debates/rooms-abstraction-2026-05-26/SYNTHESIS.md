# Synthesis — Room abstraction debate
**Moderator:** Opus | **Date:** 2026-05-27 | **Format:** 2 rounds, 3 positions

---

## What everyone agreed on (load-bearing facts)

1. The user's surface complaint is real and well-founded: `default_room: "tlvtech"` (cold-email research room) is currently the active default while working in the `folklore` codebase. That is a wrong-room-by-default failure, regardless of which position wins.
2. Rooms are the federation unit. Reputation accrues to `room:*` keys (`docs/p2p/peer-reputation-design.md:86`). Sharing policy is room-scoped via `shared-rooms.json`. The P2P protocol routes `SearchRequest` envelopes through a `room` field (`docs/architecture/V3-PROTOCOL.md:238–250`).
3. Niche evaporation is empirically measured: 76/103 newly-introduced docs never reach 50% peer coverage. Phase 24.2 rarity-aware caching is the planned mitigation.
4. Workspace filtering by cwd-derived repo identity is technically correct — Position A explicitly concedes this in its own Axis 6 ("This is the right layering — repos as a query filter, rooms as federation units").
5. Lazy enrichment of room metadata does not happen in practice. Position A's observation — "users who won't run `folklore room create` will not run `folklore room describe --edit` either" — is correct, and Position C used it directly to refute Position B.

## Where the debate actually split

| Axis | Position A | Position B | Position C |
|------|-----------|-----------|-----------|
| Mechanism for cwd-awareness | Session-runtime hint (no schema) | Replace room with auto-derived repo | Persisted `workspace?: string` field |
| Federation unit | Topical room (unchanged) | Repo (= room) | Topical room (unchanged) |
| Ship-this-week | `cwd_hint` runtime filter | Full repo-derived rooms + lazy enrichment | Node schema field + 6 call-site filters |
| Write-side stale-room bug | Not addressed | Solved (writes go to repo room) | **Not addressed** ← B's strongest hit |

## Decisive arguments (what survived rebuttal)

**Position B's repo-as-federation-unit collapses on the long-tail problem.** B's claim that "repos are universally recognized, verifiable identities" holds for `react`, `postgres`, `typescript`. It fails for proprietary monorepos, forks, personal repos, internal company codebases — which are the actual workload for most folklore sessions. Position C named this correctly: per-repo rooms multiply existing thin-but-topical coverage into a vastly larger set of zero-peer singletons. The 76/103 evaporation problem gets structurally worse, not better. **B does not survive this rebuttal.**

**Position A's "defer until Phase 25+" is caution tax with no validated risk.** Position C correctly observed that the workspace-tag mechanism never enters the wire protocol, never creates rooms, never fragments coverage — so there is nothing for FolkloreBench-F to validate. A is essentially arguing "wait" without articulating what risk the waiting is hedging against. **A's deferral position does not survive.**

**Position B's write-pollution objection lands cleanly on C.** B in Round 2: "Under Position C, the user blindly appends `folklore` knowledge graph research into the `tlvtech` federation room. If the system auto-filters by workspace, the user has zero feedback that they are polluting a shared namespace." C never addressed this. A workspace-on-READ filter hides a write-side problem rather than fixing it. **C's R1 design is incomplete.**

**Position A's reputation-mutability argument survives.** Repo identity is mutable (rename, fork, monorepo split). Reputation `room:*` keys are permanent. Auto-deriving rooms from repos creates a structural fragility that has no clean migration story. **A wins this point against B unambiguously.**

---

## Recommendation

This is two decisions, not one. The debate revealed them by surfacing what each position missed.

### Decision 1 — Read-side: scope queries to the workspace

**Position C's mechanism, adopted.** Add an optional `workspace?: string` field to the node type, populated at index time from `slugify(basename(git rev-parse --show-toplevel))`. Inject as a soft pre-filter at the six default-room read sites (`report.ts:59`, `viz.ts:64`, `discover.ts:45`, `index-project.ts:66`, `export-obsidian.ts:85`, `discover-loop.ts:35`). Local-only. Never enters federation, never enters reputation, never touches `RoomMeta`.

Position A's Axis 6 concedes this is the right layering. Position B did not refute the mechanism — they refuted half-measures, and a half-measure is what they get if Decision 2 isn't also addressed.

### Decision 2 — Write-side: stop polluting the stale default room

**Position B's bug-identification, adopted with Position A's constraint that rooms stay user-curated.**

When a user runs a write command (`save`, `index-project`, `touch`, `trigger`) inside a git repo without `--room`, the runtime SHOULD NOT silently write to a stale `default_room`. Three acceptable behaviors:

- **Smart prompt** (most conservative): on first write in a new cwd, surface a one-time prompt: *"You're in `folklore/`, but your default room is `tlvtech`. Use `tlvtech`, switch to a different existing room, or skip writing?"* Costs one prompt per repo per shell session.
- **Auto-create local workspace room** (B-flavored, scoped): auto-create a room named `workspace:<repo-slug>` (or similar prefix) on first write, **not federated by default** (`shared-rooms.json` excludes it). This room is structurally a topical room (gets a `RoomMeta`, can be federated later via explicit `share`), but it's born unshared and the prefix advertises its provenance. Migration story: if reputation accrues to it and the repo is later renamed, user explicitly migrates via `folklore room rename`. Solves the niche-evaporation concern by keeping it local until intentional sharing.
- **Hard-refuse with helpful error**: if no `--room` and the default doesn't match the workspace, fail loudly. Maximum safety, maximum friction.

I recommend the **smart prompt** for v1: it preserves user intent (Position A's invariant), surfaces the stale-default-room bug B identified, and avoids the empty-keyword room proliferation B's lazy enrichment would create. The auto-create-workspace-room behavior is a v2 option once we have data on how often users hit the prompt.

### (a) Leanest first-cut to ship this week

1. **Node schema**: add `workspace?: string` (one optional field, treated as wildcard when absent).
2. **Index-time population**: in `src/cli/runtime.ts` or the index pipeline, compute `slugify(basename(git rev-parse --show-toplevel))` once per command invocation and stamp it on new nodes.
3. **Read-side filter**: at the six default-room call sites, when `cwd` is in a git repo and `--workspace` is not explicitly overridden, add `AND node.workspace == current_workspace` to the query.
4. **Write-side prompt**: in the runtime path that resolves room for write commands, if cwd's repo slug ≠ `default_room` AND no `--room` flag set, surface a one-shot per-session prompt offering: (i) use default, (ii) `room switch <existing>`, (iii) cancel.
5. **Statusline already shipped** — derives display label from git toplevel basename, marks with `*` when the room doesn't exist in registry.

**Surface area**: ~2–3 source files, ~50 lines, one node-schema field, one test. Ships in a day or two.

### (b) What to defer

- Auto-creation of `workspace:*` rooms (v2 once smart-prompt data is in)
- Lazy enrichment of keywords from `package.json` (Position A's null observation says this doesn't work; don't ship it on optimism)
- Any change to `RoomMeta`, `RoomRegistry`, `addRoom()`, `setDefault()`, the federation wire protocol, `shared-rooms.json` semantics, or reputation `room:*` keys
- Many-to-many `workspace bind <repo> <room>` UI
- Cross-repo synthesis as a federated query primitive

### (c) What would change the recommendation

- **If telemetry shows workspace filter hides relevant cross-repo results >30% of the time** → flip filter to opt-in via `--workspace <slug>` rather than default.
- **If repo-derived rooms acquire peers in practice despite long-tail proprietary skew** → Position B's case strengthens, revisit whether the workspace-prefixed room should be federation-eligible by default.
- **If users routinely curate multi-repo research into a single topical room successfully** → Position A's case strengthens, workspace becomes a query-hint only (no node-schema field needed; runtime hint sufficient).
- **If the Phase 24.2 rarity-aware caching closes niche evaporation and peer counts rise broadly** → the namespace fragmentation argument loses force, opening room for federation-eligible workspace rooms.

---

## What the user gets in practice

After shipping Decision 1 + Decision 2:

- Statusline shows `Folklore • folklore` (the repo, not stale tlvtech). ✓ Already shipped this session.
- `folklore ask "how does X work"` from inside `~/personal/folklore` returns nodes tagged with `workspace: folklore` first — your repo's research, not cold-email research.
- `folklore save "<insight>"` from inside `~/personal/folklore` either uses your explicit `--room`, or prompts: *"You're in `folklore/`, default room is `tlvtech`. Use tlvtech / switch / cancel?"* — stops the silent write pollution.
- `folklore room list` is unchanged. The 5 existing rooms keep their hand-curated keywords, descriptions, and accumulated reputation. Nothing migrates, nothing breaks.
- Federation unchanged. P2P protocol unchanged. Reputation model unchanged.

This is what Position C should have been in Round 1 if it had addressed the write-side bug Position B raised: the workspace tag handles READS, the smart prompt handles WRITES, and rooms-as-federation-units stays as Position A demanded.

The user's intuition ("rooms should be based on the repo we're in") is honored at the read layer (which is what they actually see day-to-day) without dismantling the federation share-unit. The user's manual rooms remain available as the curated topical layer for explicit cross-repo research projects.
