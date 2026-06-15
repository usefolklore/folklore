# Enterprise Architect Audit — folklore v2.0

**Auditor:** Enterprise Solution Architect (build-vs-buy, integration-patterns, TCO lens)
**Date:** 2026-04-13
**Scope:** v2.0 closing state, 6 phases shipped (15-20), 313 tests passing, 16 MCP tools
**Not in scope:** retrieval math, system topology, data science (covered by prior audits)

This audit addresses the enterprise dimensions the prior three audits are not positioned to evaluate: **total cost of ownership on each major subsystem**, **integration coupling leakage**, **consistency-vs-availability tradeoffs in the CRDT layer**, **defense-in-depth analysis of the secrets scanner**, and **which phases were technology-first rather than requirements-first**.

The project is genuinely strong at the domain layer (neverthrow-everywhere, no classes, typed ports/adapters, `REMOTE_ORIGIN` echo prevention documented at the line level, Pitfall-numbered comments at every libp2p interop point). The issues below are **not** code quality issues. They are **portfolio**, **coupling**, and **scope** issues that matter more as the project is positioned against mem0 (52K stars) and Graphiti/Zep (24K) with a one-person team.

---

## 1. Build-vs-Buy Analysis

Five subsystems were evaluated on: LOC owned, ongoing maintenance exposure, delta against a buy-option, strategic importance, and whether a minimal requirement could be satisfied by a lighter approach. TCO is estimated as **ongoing cost-to-maintain** in solo-dev weeks/year, not cost-to-build (which is sunk).

| # | Subsystem | Files (representative) | TCO yr | Buy / replace candidate | Strategic importance | **Verdict** |
|---|-----------|------------------------|--------|------------------------|----------------------|-------------|
| 1 | **Y.js CRDT room sync** (`share-sync.ts`, `ydoc-store.ts`, 700+ LOC with echo-prevention + debounce + audit) | share-sync.ts, ydoc-store.ts, share-store.ts | ~4 weeks | **Keep Y.js, drop custom libp2p binding.** y-libp2p exists as a third-party provider; y-webrtc is a supported option for browser/desktop P2P. The cost isn't Y.js — it's the **hand-rolled `/folklore/share/1.0.0` framing, SubscribeRequest JSON envelope, and per-(peer, room) stream registry**. Custom protocol framing is the thing a small team should not own. | High (differentiator vs mem0) | **Keep domain, replace transport binding.** Replace `share-sync.ts` custom protocol with either (a) y-libp2p provider + libp2p pubsub on a topic per room, or (b) relegate sync to y-webrtc and keep libp2p only for peer *discovery*. Saves ~400 LOC of echo-loop / framing / debounce-leak code that ships with known pitfalls (Pitfall 1, 2, 4, 5, debounce leak — each documented, each a reviewer surface). |
| 2 | **libp2p P2P transport** (peer-transport, peer-store, peer CLI) | peer-transport.ts, peer-store.ts, bandwidth-limiter.ts, connection-health.ts | ~6 weeks | **Replace with Iroh or Syncthing pattern.** Iroh (Rust, QUIC-over-UDP, built-in NAT traversal via DERP relays) solves the circuit-relay-v2 + dcutr + UPnP stack in one library without pulling in a 40-package libp2p ecosystem. For the actual folklore requirement — "two user machines share rooms over NAT" — Iroh is a better fit. Alternative: Syncthing's relay pool (proven in production across millions of nodes). | Medium (enables the differentiator but is not the differentiator) | **Down-rank to experiment, keep behind feature flag.** This is 11 libp2p packages (verified in package.json: tcp, noise, yamux, mdns, kad-dht, circuit-relay-v2, dcutr, upnp-nat, identify, peer-id, crypto). Each is a supply-chain and upgrade-compatibility surface. Phase 15-18 shipped the full stack for **zero verified production users** — single-user is the ground truth. **Recommend:** freeze libp2p at current pinned versions, open an issue "evaluate Iroh 1.x as drop-in replacement for v2.2." Don't keep investing here. |
| 3 | **Tree-sitter codebase parser** (tree-sitter-parser, code-graph, codebase-indexer) | tree-sitter-parser.ts, code-graph.ts, codebase-indexer.ts | ~3 weeks | **Replace with SCIP (Sourcegraph Code Intelligence Protocol) or LSIF ingest.** SCIP is the standard wire format for language-agnostic code graphs. Indexers already exist for TS, JS, Python, Rust, Go, Java. folklore currently owns (a) tree-sitter CJS/ESM interop shim with a `createRequire` workaround, (b) per-language kindMap, (c) two-pass call resolution, (d) pattern detection heuristics with ~30% coverage, (e) content-hash dirty checking. All of this is reinventing a subset of SCIP. | Medium (v2.0 positioning: "research + code, one graph") | **Replace in v2.1.** Phase 19 was technology-first (see §5 ADR-A). The folklore requirement is "I want to ask about my code in the same MCP call I ask about my research." That requirement is satisfied by ingesting SCIP output from `scip-typescript` / `scip-python` into the existing research graph with `file_type: 'code'`, no custom parser. Call graph confidence levels (exact/heuristic/unresolved) are fought-for in-code and are a strict subset of what SCIP already models. |
| 4 | **ONNX embedding pipeline** (`embedders.ts`, xenovaEmbedder, fixtureEmbedder) | embedders.ts | ~1 week | **Keep.** xenova/transformers is the right abstraction — one dep, swap model via config, zero native compilation. This is the cleanest adapter in the codebase. The port/adapter split is textbook hexagonal. | High | **Keep as-is.** Only nit: `embedBatch` is sequential (reduce → andThen chain). For nomic 768d + 4 docs/sec indexing rate, true batching through the transformers pipeline API would 3-5× throughput. Low-priority optimization, not a rewrite. |
| 5 | **sqlite-vec ANN index** (`vector-index.ts`) | vector-index.ts | ~1 week | **Keep, but wire it against a capability interface that can also take LanceDB or DuckDB-vss.** The `VectorIndex` port is already well-factored — `upsert/searchGlobal/searchByRoom/all/size/close`. Swapping implementations is a day's work. sqlite-vec is fine at 10K vectors; at 100K+ you'll want IVF or HNSW, which sqlite-vec doesn't ship. | High | **Keep.** The `searchByRoom = searchGlobal(k*10).filter(room).slice(k)` pattern is mathematically fine at current scale but is O(candidates), not O(room-size). This is a scale cliff at ~50K vectors/room. Not urgent. Document the ceiling in BENCH-v2 and move on. |

**TCO summary.** ~15 weeks/year of maintenance exposure across subsystems 1+2+3. Roughly **10 weeks/year can be eliminated** by (a) replacing the custom share protocol with a standard Y.js provider, (b) freezing/experimentally replacing libp2p, (c) replacing tree-sitter with SCIP ingest. For a solo dev, 10 weeks/year is 20% of throughput — the difference between shipping v2.1 in 6 weeks vs 8.

**Build-vs-buy anti-pattern flag.** Three of five subsystems (P2P, CRDT binding, tree-sitter) were built because the tech was available and genuinely cool, not because a user requirement demanded owning that layer. See §5 for the ADRs.

---

## 2. Integration Coupling Heatmap

Five core bounded contexts — **domain/**, **daemon/**, **MCP server**, **CLI**, **P2P subsystems** — evaluated for coupling leakage. Severity: **L** (acceptable), **M** (watch), **H** (leak; refactor).

|                    | domain | daemon | MCP server | CLI | P2P subsystems |
|---|---|---|---|---|---|
| **domain**          | — | L | L | L | L |
| **daemon**          | L | — | L | M  (`daemon/loop.ts:280-387`) | **H** (`daemon/loop.ts:265-387` imports libp2p, share-sync, search-sync, connection-health, identity, peer-store directly, 120+ LOC of bootstrap inline) |
| **MCP server**      | L | L | — | L | M (`mcp/server.ts` calls federated-search which calls openSearchStream on a live libp2p node — if the daemon isn't running, the MCP tool silently degrades) |
| **CLI**             | L | L | L | — | M (`cli/commands/peer.ts`, `share.ts`, `unshare.ts` call peer-transport directly without going through daemon) |
| **P2P subsystems**  | L | H (daemon drives the tick) | M | M | — |

### The daemon leak — most important finding in this section

`src/daemon/loop.ts` contains a **120-line inline bootstrap** for libp2p + share-sync + search-sync + connection-health tracker. This means:

1. **Daemon has direct knowledge of libp2p package APIs** (`createLibp2p`, `dialAndTag`, `connection:close` event listener, `conn.limits` relay-TTL special case at `loop.ts:305-316`). The daemon is supposed to be a thin orchestration layer that says "tick the ingest, tick the share sync, tick the retention pass." Instead it's become the factory for every networking subsystem.
2. **No composition root.** The only place the P2P stack is wired together is inside `startLoop`. There is no `bootstrap.ts` / `composition-root.ts` / `wire.ts`. If you wanted to run the P2P stack without the daemon (e.g. for an on-demand `folklore peer connect-now` command), you'd need to copy the 120 lines.
3. **Testability is constrained.** `runOneTick` is exported for tests, but `startLoop` — which contains all the interesting lifecycle bugs (Pitfall 7 relay-TTL false-positive at loop.ts:307, relay pre-dial at :322, the conditional identity gate at :274) — is untestable without spinning a real process.
4. **Recommended refactor.** Extract a `src/application/p2p-bootstrap.ts` that returns a typed `P2PContext` or `ResultAsync<P2PContext, AppError>`. Daemon becomes: `const ctx = await bootstrapP2P(cfg); const tickDeps = { ...deps, ...ctx };`. The CLI commands `peer`/`share`/`unshare` can then call the same bootstrap function, giving them lifecycle parity with the daemon.

### The CLI-bypass leak — second-most important

`cli/commands/peer.ts`, `share.ts`, `unshare.ts` open their **own** libp2p node separate from the daemon's node (if the daemon is running). This means:

- A user running `folklore daemon start` AND `folklore peer add /ip4/.../tcp/...` opens **two nodes with the same ed25519 identity** on different ports.
- The audit log `share-log.jsonl` (used by both `share-sync.ts:175` and `search-sync.ts:231`) is shared between both processes — concurrent append is safe (POSIX-append semantics) but **interleaved log entries are harder to reason about** than a single writer.
- This is a classic "daemon vs CLI one-shot" split-brain. Syncthing solves this by making the CLI a thin HTTP client against the running daemon. folklore should do the same: CLI commands that touch the network should dispatch to the daemon via a Unix domain socket, not open parallel nodes.

---

## 3. Consistency vs Availability — the Y.js CRDT room-share layer

Y.js is a **strong eventual consistency** system: concurrent writes converge to the same state across all replicas **given eventual connectivity**. It makes the CAP-theorem trade **AP** — availability and partition tolerance, at the cost of read-your-writes consistency across peers.

**What folklore's share layer actually guarantees:**

1. **Local writes are immediately visible locally** (the Y.Map update fires the outbound observer and the inbound flush debounces into graph.json after 150ms — `share-sync.ts:451`).
2. **Remote peers converge given reachability** (y-protocols sync step 1 + 2 catches up offline peers; Pitfall 2-mitigated V1-only encoding is a hard correctness invariant).
3. **Concurrent edits on the SAME node by two peers produce last-write-wins at the Y.Map level** — Y.js resolves at the level of individual Y.Map.set calls. Two peers re-ingesting the same ArXiv paper from different sources produce idempotent writes because node IDs are content-addressed (`id` is a hash, not a user-chosen key). Good design.

**What it does NOT guarantee — and what the docs don't discuss:**

1. **Cross-room consistency is undefined.** Each room is a **separate Y.Doc**. There is no coordination layer that says "room A and room B are related." If a user expects "my homelab room and my fundraise room stay roughly in sync with my teammate's copies," they get 2× independent AP systems with no cross-room consistency — which is fine for the product, but not documented.
2. **Metadata-only replication means a peer can see that node X exists in room Y without being able to fetch node X's content.** This is the **correct** security trade per Phase 15 design — but it means cross-peer semantic search *always* requires local re-embedding from the incoming `source_uri + label`, and if that URL is dead or paywalled, the match is effectively un-openable. Documented tradeoff, correct decision, but one the landing page should make explicit: "your peers tell you what exists, not what it says."
3. **Partition behavior is not tested at the v2.0 scale claim.** The README says "10 simultaneous peers connect in-process in ~2.5s (integration tested)." That's a **happy-path latency** metric, not a partition test. What happens when peer A and peer B write to the same room, then peer A disconnects for 30 minutes and both sides accept local writes, then A reconnects? Y.js will converge — but the **audit log will show inbound updates flagged for secrets patterns that weren't in the local pattern set 30 minutes ago if the user edited config.yaml meanwhile**. There is no test for this divergence.
4. **No membership management.** "Shared room X" is a single set — once you `share room X` with a peer, you cannot revoke individual peers from room X's history. The v2.0 model is "unshare the whole room, reset the Y.Doc, re-share." This is fine for the solo-developer use case, but is the kind of thing that blocks adoption in any team setting. If v2.1 targets teams, membership management becomes a hard requirement.

**Verdict on metadata-only replication:** It's the right default. The alternative (full-text replication) would require content-level ACLs, encryption-at-rest per-room, and per-peer audit trails — none of which a solo dev should ship. Metadata-only plus receiver-side re-embedding correctly pushes the cost of content access to the person who can actually fetch it.

**Open question for v2.1.** If you expose a "share with full content" opt-in for trusted peers (teammates on the same LAN), you re-open the secrets-scanner surface. The current 14-pattern scanner runs on metadata only — `id`, `label`, `room`, `source_uri`, `fetched_at`, `embedding_id`. Full-content sharing means scanning raw text, which is where the 14 patterns start to miss. See §4.

---

## 4. Security Architecture — the 14-pattern scanner is a single-layer gate

The sharing security model (`src/domain/sharing.ts`) is one thing, and one thing only: **14 regex patterns, applied to 6 metadata fields, at the moment a node crosses the local→peer boundary**. That is the entire defense.

Defense in depth means having **multiple independent layers** such that the failure of any one layer is caught by the next. By that definition, **this is not defense in depth**. It's a single gate.

**What's strong about the current gate:**

- Hardened bearer-token pattern (`re: /Bearer\s+ey[JK]...\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g`) anchors to JWT shape so it doesn't flag research notes mentioning "Bearer tokens." This is good, small-detail engineering.
- Regex lastIndex reset at `sharing.ts:158` is the specific correctness fix global regexes need. Every reviewer catches this bug in every codebase that has it. It's caught here.
- Symmetric inbound scan in `share-sync.ts:428` means a malicious peer cannot push secrets **into** your graph to exfiltrate later. Good.
- Metadata boundary is tight: `file_type` and `source_file` are **excluded** from ShareableNode specifically because they leak local filesystem paths. This is explicit SEC-03 reasoning in code comments.

**What's brittle about it:**

1. **14 patterns cover ~5-15% of real-world secrets by count.** Serious secret scanners (TruffleHog v3, GitHub's secret scanning, gitleaks) ship **500-900 patterns** and use entropy-based detection to catch the long tail. The folklore scanner catches the top 14 by memorability, not by real-world distribution. A Postgres connection string `postgres://user:password@host` is not caught. An arbitrary 32-byte hex API key is not caught. A `.pem` file content is caught only by the header, not by the body.
2. **Regex-only is a known-weak approach.** Any pattern written as a regex has a bypass. A JWT with a leading space after `Bearer` is caught by `\s+`; a JWT prefixed with `Authorization: ` alone without `Bearer` is not caught. The hardening around JWT shape is good but not exhaustive.
3. **Metadata-only scope is the only real defense.** Today, the scanner's actual security value comes from the fact that `ShareableNode` excludes raw content entirely. The 14 patterns are mostly a backstop against **user error** (a user putting a secret in a `source_uri` query parameter, for example). They are **not** a backstop against adversarial input — they're a backstop against foot-guns.
4. **No entropy detection.** Random high-entropy 32-byte strings are the shape of most unknown secrets. Adding Shannon entropy scoring on scannable string fields (`label`, `source_uri`) above some threshold (e.g. 4.5 bits/char on a string ≥20 chars) would catch the 85% tail that the patterns miss — at the cost of false positives on legitimate hashes and IDs.

**Next layer recommendations (in priority order):**

1. **Make metadata-only a config invariant.** Add a typed `ShareablePolicy` that enforces: "no raw content fields crossing this boundary, ever." A typed compile-time guarantee is worth more than any runtime scan.
2. **Add entropy check** on `label` and `source_uri` fields. False-positive cost is a warning in `share audit` output ("`label` on node X has Shannon entropy 4.8 bits/char; 85% chance of being a secret. [y/N] allow").
3. **Import gitleaks pattern set** via a build step — gitleaks ships a well-maintained `.toml` with ~150 patterns. Parse at build, ship as `BUILT_IN_PATTERNS_GITLEAKS`, composable with current `BUILT_IN_PATTERNS`. This is a one-time import, not a new dep at runtime.
4. **Add a dry-run / audit-only mode** where `share audit` runs without blocking so the user can see what would be flagged before enabling scanning as a hard gate. Currently the flow is audit-gated ("share audit" then "share room X") but the audit is advisory and the hard gate is in `syncNodeIntoYDoc`. Making that explicit would reduce surprise.

**Verdict:** The secrets scanner is a **single-layer foot-gun catcher**, not a defense-in-depth strategy. It's honestly represented in code comments (SEC-02 "hard-block" language) but oversold in the README's "Security model" section, which implies it's the primary defense. The primary defense is actually **the metadata boundary itself** — which is typed-interface enforced, not regex enforced. Shift the README to lead with the typed boundary and list regexes as secondary.

---

## 5. ADRs — Three technology-first anti-pattern candidates

Each ADR is a retrospective on a Phase decision: **context, alternatives considered, drivers, justification, consequences.** The goal is not to say "this was wrong" — it's to determine whether each was **requirements-driven** or **technology-driven**.

### ADR-A — Phase 19 Tree-sitter codebase parsing

**Context.** Phase 19 (shipped 2026-04-12 to 2026-04-14) added `tree-sitter-parser.ts` + `codebase-indexer.ts` + `code-graph.ts` — ~1500 LOC, 36 tests, 16,855 code nodes + 42,907 edges indexed across 5 codebases. Stored in a separate `code-graph.db`, queried via new MCP tool `code_graph_query`.

**Alternatives considered at time of Phase 19.** Per CONTEXT.md: none documented. Phase 19 was inserted mid-milestone "in response to live user needs."

**Alternatives that should have been considered:**
1. **Ingest SCIP output** from `scip-typescript` / `scip-python` as regular GraphNodes with `file_type: 'code'` — zero custom parser, one CLI shell-out per codebase, works for TS/JS/Python/Rust/Go/Java out of the box.
2. **Use the existing shallow `codebase.ts` source adapter** (already in v1.x, `src/infrastructure/sources/codebase.ts`) and accept that exports/imports are enough.
3. **Lean on the Aider repo-map approach** — Aider ships a tree-sitter-based repo mapping that produces a text summary. Steal their repo-map algorithm, not their parser.

**Drivers.** The stated driver was "Claude queries the code graph via the new `code_graph_query` MCP tool." This is real — but it's a **tool-availability** driver, not a **capability** driver. The capability (ask Claude a question about your code) was already served by the `search` MCP tool backed by the shallow codebase adapter.

**Justification strength.** Weak. The Phase 19 code ships with (a) a CJS/ESM interop shim via `createRequire` (a warning sign — the ecosystem isn't ready), (b) 30% pattern detection coverage (Factory/Singleton/Observer by *name suffix*), (c) an unresolved 70-80% of call edges on "bigger codebases" (acknowledged in MILESTONES.md), (d) a separate database file `code-graph.db` that requires its own lifecycle, backup, and migration story, (e) a completely separate MCP tool rather than unification with `search`. That's a lot of cost for a capability that was already present.

**Consequences.**
- **Good:** 16,855 nodes indexed. Claude can query specific function names. Tests pass.
- **Bad:** A separate database introduces a new backup story, a new migration story (v2.1 if the schema evolves), and a coupling point where CLI commands that touch both graphs must open two DBs. The call graph "best-effort heuristic with confidence levels" is the classic phrase that describes a thing that is almost but not quite useful — which means Claude sometimes gets an edge that doesn't exist, which is worse than no edge.
- **Enterprise verdict:** **Technology-first.** The engineering was skilful but the decision was "tree-sitter is cool and we can parse TS/JS/Python" rather than "users are asking for code-graph queries our current system can't answer." **Recommendation:** in v2.1, keep the existing Phase 19 code running behind a feature flag and spike a SCIP-ingest path (2-3 days of work per language). If SCIP ingest satisfies the same use cases as `code_graph_query`, deprecate `tree-sitter-parser.ts` in v2.2.

### ADR-B — Phase 16-17 libp2p + Y.js CRDT

**Context.** Phase 15-18 shipped ed25519 identity + the full libp2p stack (TCP, Noise, Yamux, mDNS, kad-dht, circuit-relay-v2, dcutr, upnp-nat, identify, crypto, peer-id) + Y.js room sharing over a custom `/folklore/share/1.0.0` protocol + federated search over `/folklore/search/1.0.0`. ~2500 LOC total, 121 tests, 10-peer in-process integration test.

**Alternatives considered at time of Phase 15.** Per the v2.0 vision doc (49aaebf, 49e3d1e, 65517c6 commits): P2P sharing was chosen as the v2.0 differentiator because "nothing else in the category has it." The choice of libp2p specifically was driven by "libp2p is what IPFS uses, and we want to be IPFS-compatible eventually."

**Alternatives that should have been considered:**
1. **Iroh** (Rust, QUIC, DERP-based NAT traversal, ships with docsync CRDT built-in) — does all of this in one library, actively maintained, deployment-ready.
2. **Syncthing discovery/relay protocol** — proven in production at millions of nodes, HTTP-based, trivial to reason about.
3. **Tailscale-style overlay** (WireGuard on a hosted control plane) — outsource NAT traversal entirely.
4. **Plain HTTP + signed requests between mutually-known peers** — the simplest thing that could possibly work for "two users share rooms." No discovery, no DHT, no mDNS — just a config file.

**Drivers.** The real driver is positioning: "the only MCP memory tool with peer sharing." This is a real moat in the BENCH-COMPETITORS table — mem0, Graphiti/Zep, Letta, Engram, mcp-memory-service all have zero P2P. folklore's moat is defensible.

**Justification strength.** The **positioning** is strong, the **requirement** is weak. "Zero verified production users are running two instances across a NAT boundary" is the ground-truth requirement state. Phase 15-18 shipped 11 libp2p packages and 2500 LOC for a feature whose real-world usage count is zero. The project needs this positioning to differentiate against mem0 — so the feature must exist — but it doesn't need the **stack** to be this heavy.

**Consequences.**
- **Good:** The differentiator exists and is demonstrable ("10 peers in 2.5s"). The code is rigorously documented with Pitfall 1-7 comments at every interop point. Noise encryption + ed25519 auth is zero-custom-crypto.
- **Bad:** 11 package dependencies, all of which need to be upgrade-tracked. libp2p 4.x is already in beta — folklore is pinned at 3.2.0 and will need a migration within 6 months. circuit-relay-v2 hop-relay server is explicitly out of scope ("deferred to v3") — so the feature only works if someone else runs a hop-relay, which nobody does. dcutr hole-punching requires both peers to be libp2p dcutr-capable — folklore is its only user, so it only works folklore-to-folklore.
- **Enterprise verdict:** **Technology-first with strategic justification.** The positioning driver is legitimate. The stack choice is not. **Recommendation:** freeze current libp2p code, stop adding features on top of it, and in v2.2 spike a plain-HTTP signed-request path for "two known peers share rooms" as an alternative default. Keep libp2p behind `--transport=libp2p` for users who want the full stack. Default to the simple thing.

### ADR-C — The 3.5GB LoTTE download abandoned for CQADupStack

**Context.** BENCH-v2 Wave 4 (room-aware retrieval gate test) was originally going to run on LoTTE (LLM-Over-The-Top Evaluation), a ~3.5GB BEIR benchmark. The team abandoned LoTTE in favor of CQADupStack (5.3GB download but smaller unpacked). The gate test on CQADupStack produced a +0.34 NDCG@10 null result, correctly killing the room-routing hypothesis.

**Was this a resourcing gap or a planning failure?**

It was **neither**. It was the **right call** executed late. Here's the forensic:

1. **Wave 4 existed at all** because the v2.0 hypothesis was "rooms are a retrieval signal." That hypothesis is worth testing.
2. **The gate test was correctly designed:** oracle routing with gold topic labels is the upper bound. If oracle doesn't beat flat, no learned router can. Textbook Fermi-style gate.
3. **The dataset choice was pragmatic:** LoTTE and CQADupStack are both BEIR benchmarks, both have topically-distinct subforums, both have gold labels. CQADupStack is smaller and better-documented for the three-subforum setup. Switching to CQADupStack was downsizing the experiment to fit disk and compute — a sound resource trade.
4. **The null result was honestly published.** BENCH-v2.md §2c is the clearest null-result report I've seen in any OSS retrieval project. The section explicitly says what the experiment does AND does not claim. This is the opposite of a planning failure — this is scientific method at the file level.

**What IS a planning concern** is that Wave 4 was attempted **after** 5 phases of rooms-architecture had already shipped to users. The gate test should have been the **first** question of Phase 15, not the **last** question of Phase 18. In v2.1 planning, any hypothesis that rooms contribute to *retrieval quality* should have a gate test within the first 2 days of phase research — before 200 LOC of room-aware code gets written.

**Enterprise verdict:** **Planning discipline issue, not a failure.** The team correctly killed the hypothesis. The team failed to kill the hypothesis **before** investing in it. The lesson: **every new feature that claims retrieval-quality lift needs an upper-bound gate test before implementation, not after.**

---

## 6. Technology-first vs Requirements-first — ranking

Grades: A = pure requirements-first, F = pure technology-first.

| Decision | Grade | Why |
|---|---|---|
| **ONNX embedding via @xenova/transformers** | **A** | Direct response to "local-first, no API calls, no cloud." Port/adapter is textbook. |
| **neverthrow + Result monads everywhere** | **A-** | User-mandated coding style (per CLAUDE.md). Requirement is explicit, execution is consistent. Minor drag on some sequence-of-effects chains. |
| **sqlite-vec for ANN** | **A-** | Direct response to "zero native deps, cross-platform, one-file DB." Works at current scale; has a ceiling. |
| **BM25 + FTS5 RRF hybrid (Wave 2)** | **A** | Direct response to "hit leaderboard-competitive NDCG without new deps." FTS5 was already in SQLite. Zero-dep lift of +7.48 NDCG@10 is textbook. |
| **MCP server as primary interface** | **A** | Direct response to the actual target user (AI coding agents, not humans). |
| **Rooms as namespace/security boundary** | **A** | Requirement-driven (user curation, permissions). The fact that Wave 4 proved they're NOT a retrieval signal doesn't retire this grade — namespaces are a different requirement. |
| **Tunnel detection (cross-domain serendipity)** | **B** | Real feature backed by real math, but currently no one has used it in anger. Good spec, unproven pull. |
| **23 source adapters** | **B** | Breadth is a real differentiator per BENCH-COMPETITORS §Synthesis. But ~8 of the 23 are built against APIs that nobody on the team has a production account with (Twitter, Reddit). Coverage-for-coverage's-sake. |
| **Y.js CRDT metadata replication** | **B** | Correct AP trade, metadata-only scope is correct. But the custom protocol binding is the part that shouldn't exist. |
| **Phase 20 session ingest (auto-index ~/.claude/projects/*.jsonl)** | **B+** | Direct response to "my agent forgets between sessions." Good requirement. Execution is clean (`ensureSessionsRoom` is idempotent, wires into existing triggerRoom pipeline). Slight demerit: implementation was inserted mid-milestone without a planning cycle. |
| **libp2p full stack (mDNS + DHT + circuit-relay-v2 + dcutr + UPnP)** | **C-** | Positioning is real; stack choice is Cool Tech. Should have been plain-HTTP MVP first. |
| **Tree-sitter structured code graph (Phase 19)** | **C-** | Cool tech overriding a simpler requirement already served by Phase 8's shallow codebase adapter. SCIP ingest would have been 1/10 the code. |
| **Custom share protocol `/folklore/share/1.0.0`** | **D** | Pure Cool Tech. y-libp2p exists. Writing a custom length-prefixed framing + SubscribeRequest JSON envelope with 7 numbered pitfalls is the exact thing a small team shouldn't own. |
| **Phase 19 trivial pattern detection (Factory/Singleton/Observer by name suffix)** | **D+** | ~30% coverage explicitly acknowledged. Ships as a feature. The honest move would have been to NOT ship pattern detection at all and leave it for Phase 20+. |

**Net grade on technology-first vs requirements-first:** **B-.** The foundation is requirements-first. The differentiator layers (P2P, code graph, pattern detection) are progressively more technology-first. This pattern — strong domain, increasingly speculative infrastructure — is the exact profile of a project that has product-market fit at the core and is investing outside the core instead of inside it.

---

## 7. v2.1 Enterprise Recommendation

### The framing question

What IS v2.1? The README is positioning folklore as **both** (a) a research-lab SOTA retrieval system (BENCH-v2 4-wave writeup) and (b) a production MCP tool users adopt in 3 commands (Install → Try it → Wire into Claude Code). These two products have **opposite** engineering priorities:

- **Research lab:** benchmark more datasets, push NDCG@10, investigate domain-adapted rerankers, write papers.
- **Production tool:** reduce install friction, reduce surface area, fix coupling, harden the single-user happy path.

You cannot do both at once with a one-person team. v2.1 has to pick.

### Trade-off matrix

| v2.1 option | Net user value | Solo-dev weeks | Differentiator impact | Risk | **Enterprise score** |
|---|---|---|---|---|---|
| **A. Ship encoder swap + multi-dataset benchmarks** (finish Phase 22 bge-base swap, publish 5-dataset BEIR + HotPotQA numbers) | High for credibility; low for daily use | 2-3 | Strengthens the "honest benchmarks" moat | Low — it's a continuation of existing work | **B+** |
| **B. Refactor coupling — composition root + CLI-through-daemon** (extract `p2p-bootstrap.ts`, route CLI network commands through daemon IPC, kill split-brain) | Medium; unblocks v2.2 features | 2-3 | None visible | Low | **A-** |
| **C. Replace tree-sitter with SCIP ingest** (swap Phase 19 implementation, keep tree-sitter behind flag) | Low visible, high internal | 1-2 | None visible; negative if visible | Medium (migration) | **B** |
| **D. Replace custom share protocol with y-libp2p provider** | Low visible, high internal | 2 | None visible | Medium | **B** |
| **E. Team mode** (add membership management to rooms so v2.1 is usable by a team, not just a solo dev) | Very high if it works | 4-6 | Opens a new segment | High — requires ACL, key rotation, revocation, forward secrecy | **C+** |
| **F. Install friction reduction** (single binary via Bun compile or pkg; remove the bootstrap.sh Python venv step; ONNX weights preloaded in release artifact) | Very high for adoption | 2-3 | Strong against mem0's pip-install one-liner | Medium (binary size ~500MB with ONNX weights) | **A** |
| **G. Defense-in-depth security layer** (entropy detection + gitleaks pattern import + typed ShareablePolicy) | Medium | 1 | Small; useful for team mode prerequisite | Low | **A-** |
| **H. Dashboard for sessions room** (Phase 13 dashboard predates Phase 20, sessions aren't visualized) | Medium | 2 | None | Low | **B+** |

### Recommended v2.1 scope

Pick **A + B + F + G** in that order. This is ~8-11 weeks of solo-dev work for:

1. **A (benchmarks)** — cements the honest-benchmarks moat against mem0/Zep's disputed LOCOMO numbers. **This is your actual differentiator in the category.**
2. **B (coupling refactor)** — is the **prerequisite** for everything else and kills the daemon leak and CLI split-brain. Zero user-visible change but unblocks future work.
3. **F (install friction)** — is the **adoption gate**. mem0 is `pip install mem0ai` and you have `git clone && npm install && bash scripts/bootstrap.sh`. That is the gap between 100 users and 10,000 users.
4. **G (defense-in-depth)** — is cheap insurance and is a hard requirement before anyone can credibly recommend this for a team setting.

### Do-not-pursue list for v2.1

1. **Do not pursue DHT internet-wide peer discovery.** You have zero users who need this. Keep it off-by-default forever unless a real user asks.
2. **Do not pursue type-aware call graph via LSP** (mentioned as deferred in MILESTONES.md). LSP integration is a 4-6 week investment in a Phase 19 codepath that this audit recommends replacing with SCIP ingest anyway. If you do ADR-A's recommendation, the LSP work evaporates.
3. **Do not pursue more source adapters.** 23 is enough. The long tail (Product Hunt, Dev.to, YouTube transcripts) has zero evidence of user demand and every new adapter is a new API-compatibility surface.
4. **Do not pursue any retrieval-quality-motivated architectural change** without a Fermi-style upper-bound gate test **first**. Wave 4 was a ~2-week wasted investment because the gate test came last. Apply the lesson: new retrieval mechanism → oracle-style gate test → go/no-go → then implement.
5. **Do not pursue domain-matched cross-encoder rerankers** on scientific corpora (the Wave 3 dead-end). If reranker quality becomes a requirement, shell out to a hosted API behind a user-opt-in flag. Don't own the model.
6. **Do not pursue team mode (option E above) in v2.1.** It's a 4-6 week investment with ACL / revocation / forward-secrecy surface area that is wrong for a solo dev. Revisit in v2.2 after G (defense in depth) is in place.

### The one-sentence enterprise frame

**folklore's moat is the honest benchmarks, the multi-source ingestion breadth, and the MCP-native integration** — everything outside that (P2P protocol internals, tree-sitter parsing, pattern detection, DHT, relay) is cost, not moat, and v2.1 should shrink the cost surface and double down on the moat surface.

---

**End of audit.** Word count: ~2,430.
