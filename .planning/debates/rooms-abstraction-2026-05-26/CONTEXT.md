# Debate context — room abstraction

## Question
Should the `room` concept in Folklore (codebase still named `folklore`) stay as a user-managed, registry-backed namespace, shift to auto-derive from the git repo of the current cwd, or evolve into something else?

## What rooms are today

**Domain vocabulary** (`src/domain/rooms.ts`)
- `RoomMeta`: id (lowercase alnum+hyphen, 1–63 chars), name, description, keywords[], default_wing?, created_at
- `RoomRegistry`: rooms[] + optional default_room
- `defaultRoom(reg)` returns `reg.default_room ?? reg.rooms[0]?.id`
- `addRoom()` auto-sets default if registry was empty

**User-facing CRUD** (`src/cli/commands/room.ts`): list / create / switch / current / describe. Manual.

**Live registry** (`~/.folklore/rooms.json` for this user):
- folklore-dev (knowledge graphs, embeddings, MCP, vector-search — hand-curated keywords for `init` source suggestions)
- p2p-llm (P2P LLM inference, libp2p, kademlia, sel-did)
- tlvtech (cold-email, lemlist, make.com — totally unrelated to this repo, but is current default)
- forge (multi-agent deliberation engine)
- auto-tlv
- default_room: "tlvtech"

## How rooms are used downstream

1. **Read-side default** — every command that doesn't take `--room` falls back to `defaultRoom(reg.value)`:
   - `src/cli/commands/report.ts:59`, `viz.ts:64`, `discover.ts:45`, `index-project.ts:66`, `export-obsidian.ts:85`, `discover-loop.ts:35`
   - `src/telegram/commands.ts:47,65,78`
   - `src/cli/commands/trigger.ts:63 resolveRooms` selects multiple rooms

2. **Federation share-unit** (`docs/p2p/P2P-VISION.md`, `docs/p2p/peer-reputation-design.md`):
   - Peers advertise rooms they participate in via libp2p `/folklore/share/1.0.0`
   - Prefetch hook fans out room-scoped queries to peers
   - Reputation accrual is **room-scoped** — a peer with high rep in `p2p-llm` doesn't transfer that to `homelab`
   - `shared-rooms.json` is a separate policy layer: rooms exist locally, become federated only when explicitly shared

3. **System rooms** (always-on, virtual): `toolshed` (codebase, deps, git history; stale-after 30d) and `research` (RSS, web fetches; stale-after 7d). Membership derived from `source_uri` scheme, not the room field.

4. **`init` source suggestions** — uses hand-curated `keywords[]` to seed RSS/web sources for cold-start.

## Federation health context (Phase 24 in PROJECT-PLAN-FOLKLORE.md)
- FolkloreBench-F simulator measures `compoundingSlope`, `propagation_half_life`, `web_fallback_rate`
- Today: 76/103 newly-introduced docs **never reach 50% peer coverage** (niche evaporation problem)
- Phase 24.2 plans rarity-aware caching to mitigate. Lots of small rooms could amplify this.

## The three positions to debate

### Position A — Keep rooms as user-managed topical namespaces
The federation share-unit needs intentional curation. Rooms are how reputation, sharing policy, and topical coherence accrue. Auto-deriving creates orphan rooms with no peers, no sources, no curated keywords, and dilutes the long tail further. The fix to "default_room: tlvtech is stale" is `folklore room switch folklore-dev`, not changing the model.

### Position B — Auto-derive rooms from git repo
Meet the user where they actually work. A developer's mental model is "I'm in repo X" — making them pick a research room is friction that prevents adoption. Lazy enrichment (auto-create the room, let the user later add keywords/sources via `folklore room describe --edit`) fixes cold-start. Federation can still happen via opt-in sharing per repo room. This is the "federated commons for OSS community" story expressed at the right granularity.

### Position C — Two-axis hybrid
Rooms stay as user-managed topical units (federation share-unit, reputation scope, source curation). Add an orthogonal `workspace` tag (repo-scoped) on every node. Queries default to `workspace == current_repo` AND `room == user_default` (or `workspace == current_repo` alone if no room set). The repo→room mapping is many-to-many: one repo can write into multiple topical rooms; one room can collect contributions from many repos.

## Constraints for your argument
- Read whatever source files you need; cite paths and line numbers.
- This is analysis only — do not write code, do not modify files.
- Address all 6 axes in the question (identity/scope, federation, keywords, mental model, migration, multi-axis).
- End with a concrete deliverable: (a) leanest first-cut to ship this week, (b) what to defer, (c) what would change your recommendation.
- Be direct. Take your assigned position seriously. Find the strongest case for it.
