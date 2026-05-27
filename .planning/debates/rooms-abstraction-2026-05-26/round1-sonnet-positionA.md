# Round 1 — Position A: Keep rooms as user-managed topical namespaces

**Assigned model:** claude-sonnet-4-6  
**Position:** A — intentional curation, room = federation share-unit

---

## The core claim

Rooms are not a UX affordance. They are the **unit of federation trust**. The moment you auto-derive them from a git repo, you dissolve that trust boundary, and every downstream system — reputation scoring, CRDT sync, prefetch fan-out, keyword-seeded source discovery — degrades in a measurable and non-recoverable way.

---

## Axis 1 — Identity / scope

`src/domain/rooms.ts:19–32` is explicit: `RoomMeta` carries `keywords[]`, `description`, `default_wing`, and a human-authored `name`. These are not decorations. They are the semantic contract that makes a room coherent across peers. A room is a *claim about a domain of knowledge*, not a pointer to a filesystem path.

A git repo is a development artifact. `my-saas-backend` may contain code that spans authentication, billing, and ML inference. Deriving a room from it produces a namespace whose semantic scope is "everything this repo happens to touch" — which is the same as no scope at all. The `validateRoomId` regex (`src/domain/rooms.ts:43`) enforces stable lowercase IDs precisely because room IDs travel over the wire and get stored in peer reputation maps. A git slug like `sahar-barak-my-saas-backend` is stable; the semantic content it implies is not.

---

## Axis 2 — Federation

`docs/p2p/P2P-VISION.md:33–37` states the privacy model: "Room-level control — mark rooms as public/private." The entire P2P protocol (`docs/architecture/V3-PROTOCOL.md:238–250`) routes `SearchRequest` envelopes through a room field: a peer receiving a request MUST check `shared-rooms.json` and refuse if the room is not shared. This is the access-control gate.

Auto-derived rooms are ungated by definition — the user has not made an explicit decision to share `repo:my-saas-backend` with the network. You either force a share prompt on every new cwd (friction that defeats the stated goal of reducing friction), or you silently create unshared rooms that produce orphan namespaces with zero peers. The AkashikBench-F data in the context is damning here: today **76/103 newly-introduced docs never reach 50% peer coverage**. Auto-deriving rooms would multiply the number of singleton namespaces by the number of repos each developer has checked out, making niche evaporation structurally worse, not better.

---

## Axis 3 — Keywords and source discovery

`src/cli/commands/room.ts:64` shows that keywords drive cold-start source seeding. The `init` command uses them to suggest RSS feeds and web sources appropriate to the room. A repo-derived room has no keywords until the user adds them — meaning `init` has nothing to suggest. Position B's answer is "lazy enrichment": auto-create the room, let the user add keywords later. But "later" does not happen. The user who won't run `akashik room create` will not run `akashik room describe --edit` either. You get a proliferation of empty-keyword rooms that produce worse source recommendations than the current state, where the user at least had to state a purpose at creation time.

---

## Axis 4 — Mental model

The user's intuition is "I'm in repo X, my research should be scoped to X." That intuition is correct about *query scoping* — it is incorrect about *storage partitioning*. A developer researching authentication patterns for `my-saas-backend` today may reuse those same nodes when working on `my-mobile-app` tomorrow. If nodes were stored in a repo-scoped room, they are invisible across contexts. The current model — a topical room like `security-patterns` that is cwd-independent — is portable in exactly the way a developer's knowledge actually works: domain expertise does not restart at git clone.

The fix to "default_room: tlvtech is stale" (`CONTEXT.md:19`) takes three seconds: `akashik room switch akashik-dev`. That is not a model failure. That is a UX gap in session restore, which is addressable without restructuring the abstraction.

---

## Axis 5 — Migration

The live registry (`CONTEXT.md:17–20`) has six intentionally named rooms: `akashik-dev`, `p2p-llm`, `tlvtech`, `forge`, `auto-tlv`. These rooms have accumulated reputation scores and, once Phase 24 ships, will have CRDT state vectors and peer associations. The reputation system in `docs/p2p/peer-reputation-design.md:86` stores subjects under `room:*` keys alongside `entity:*` keys — the room IS a first-class subject in the reputation map. A migration to repo-derived rooms does not just move metadata; it destroys accumulated `room:*` reputation signals. There is no clean migration path because repo slugs are not topical — a given `room:p2p-llm` reputation score cannot be mechanically translated into `room:akashik` or `room:akashik` without semantic loss.

---

## Axis 6 — Multi-axis (vs Position C)

Position C proposes orthogonal `workspace` tags. This is additive and correct in principle, but it does not require changing the room abstraction. A `workspace` field on the node (`node.workspace = slugify(git_remote_url)`) costs a single schema addition. Queries can filter by `workspace == current_repo` without touching rooms at all. This is the right layering — repos as a query filter, rooms as federation units — and it can be built without either diluting room semantics or breaking the reputation model.

---

## Deliverables

**(a) Leanest first-cut to ship this week**

Add a `cwd_hint` to the `ask` and `search` commands: detect `git rev-parse --show-toplevel`, store the repo slug on each node written during that session, expose it as a filter (`--workspace current`). Zero schema change to rooms. Zero federation impact. Satisfies the user's stated need — "scope my queries to what I'm working on" — without touching the trust boundary.

**(b) What to defer**

Any change to `RoomMeta`, `RoomRegistry`, `addRoom()`, or `setDefault()`. Any auto-creation of rooms. Any change to how reputation subjects are keyed. All of that is Phase 25+ territory, after AkashikBench-F has validated that the niche-evaporation fix in Phase 24.2 actually works.

**(c) What would change my mind**

If the bench data showed that repo-derived rooms *increased* peer coverage rates — i.e., that more developers share rooms when rooms map to repos they already work in publicly — I would reconsider. The evaporation problem is the load-bearing objection. Evidence that opt-in sharing rates go up enough to compensate for the namespace fragmentation would flip the calculus. Until that data exists, the current model is architecturally sounder.
