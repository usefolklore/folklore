# Round 2 — Position A rebuttal (vs B and C)

**Author:** opencode (Position A)  
**Targets:** Round 1 Position B (gemini, repo-derived rooms), Round 1 Position C (sonnet, two-axis hybrid)

---

## Rebutting Position B (repo-derived rooms)

**"Manual rooms fragment the network into user-specific namespaces."** This is arithmetically backward. The live registry has **6 rooms**. A typical developer has 20–100 repos checked out. Auto-deriving creates 3–17× *more* namespaces, each with zero peers, zero keywords, zero reputation. The Phase 24 bench data (76/103 docs below 50% coverage) is not an argument *for* fragmentation — it is a warning *against* multiplying it.

**Lazy enrichment does not work.** Position B claims `package.json` or git config yields usable keywords. It does not. A repo named `my-saas-backend` has `"name": "my-saas-backend"` — that is a label, not a semantic keyword. No amount of lazy derivation turns a git slug into `["knowledge-graphs", "embeddings", "MCP"]`. The gap between `package.json` keywords and `init`-worthy source suggestions is the same gap as having no keywords at all. Position B is proposing empty-keyword rooms with extra steps.

**Repo-scoped reputation is an oxymoron.** The whole point of room-scoped reputation (`peer-reputation-design.md:86`) is that trust in one domain does not transfer to another. A repo-scoped reputation is a reputation over "everything this repo happens to touch" — auth, billing, infra docs, comments. That is not a signal; it is noise. OSS trust may be repo-scoped, but Folklore's reputation layer demands *topical* scope, not organizational scope.

**"Seamless migration" is hand-waving.** What happens when a repo is renamed, forked, or monorepo-split? The room ID changes, all accumulated reputation evaporates, and there is no migration path because the mapping is one-to-one with a mutable filesystem artifact. Position B has no answer for this.

**Position B's strongest claim** — that auto-deriving removes onboarding friction — is the weakest point architecturally. A one-time `room switch` command is friction measured in seconds. Proliferating empty namespaces that degrade federation for every subsequent session is friction that compounds without bound.

---

## Rebutting Position C (two-axis hybrid)

**Position C and Position A agree on the load-bearing claim.** Both say: rooms stay intentional, rooms are the federation unit, do not auto-derive rooms from repos. Position C's `workspace` tag is structurally identical to my deliverable (a) — a repo-scoped query filter, not a room change. The difference is marginal: Position A proposes a runtime `cwd_hint` parameter (zero schema changes), Position C proposes a persisted `workspace?: string` field on the node schema (one schema change, six call-site changes). Neither dilutes room semantics. This is a implementation detail, not a competing architecture.

**Where C overreaches:** It concedes that the mental model has two layers and encodes both into storage. But "where I am working" is a *session fact*, not a *node fact*. Persisting it on every node creates long-term coupling between research artifacts and ephemeral workspace context. A runtime filter (Position A's approach) is strictly more flexible — no migration when repos move, no stale workspace tags on old nodes, no schema churn.

**C's false premise:** Position C assumes the user's problem is "I need two axes." The user's problem is "my queries return the wrong room's data." That is solvable with a runtime workspace hint, no new axis required. Occam's razor applies.

---

## Deliverables (unchanged from Round 1)

**(a) Ship this week:** Add `cwd_hint` to `ask`/`search` — detect git repo slug at runtime, filter nodes written during the session by it. Zero schema changes, zero federation impact, zero node migration.

**(b) Defer:** Any change to `RoomMeta`, `RoomRegistry`, federation protocol, or reputation subject keys. All Phase 25+ territory after FolkloreBench-F validates the niche-evaporation fix.

**(c) Mind-changer:** Bench data showing repo-derived rooms increase peer coverage rates despite namespace fragmentation. Until then, the current model is sound.
