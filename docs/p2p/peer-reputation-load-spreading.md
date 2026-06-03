# Peer Reputation — Load Spreading & Knowledge Propagation

**Companion to** `docs/peer-reputation-design.md`. The base design ratifies
*subject-scoped reputation* and *use it for fan-out ordering*. This doc tackles
the next obvious question: once reputation works, what stops the highest-rep
peer from becoming a hot-spot, and how does its knowledge actually spread to
the rest of the network?

## The problem, stated plainly

If peer X scores 0.95 on `entity:product:lemlist`, every related ask in the
network now ranks X first. With naive fan-out, X gets:

- **Bandwidth pressure** — every connected peer's lemlist query lands on X
- **CPU pressure** — X runs `recall` + `search` for every requester
- **Privacy pressure** — X learns what every other peer is researching about
  lemlist (a side-channel the existing recall sanitiser does NOT cover, because
  the asker's *query patterns* are themselves information leakage)
- **Single-point-of-knowledge fragility** — X goes offline, the network's lemlist
  expertise effectively disappears for the duration

**The corollary:** if peer X is the only one who knows about lemlist, the network
hasn't *spread* the knowledge. A 0.95-rep peer that nobody else can answer for
is a centralisation failure dressed in P2P clothes.

## Why this is solvable in our architecture

Two facts about the existing Akashik code make load-spreading
**incremental, not architectural**:

1. **Touch already replicates chunks.** When peer A `akashik touch`-es a
   chunk from peer B, that chunk lands in A's `graph.json` with
   `_akashik_source_peer: B` provenance. A is now a secondary source for
   anyone asking A about the same subject. We don't need new wire protocol —
   we need to make this re-seeding *intentional* instead of accidental.
2. **Receiver-side rate limiting already exists.** `src/infrastructure/recall-sync.ts`
   and `search-sync.ts` have per-peer token buckets that return `rate_limited`
   when overrun. The asker already has to honour that response — we just need
   to make the asker pick a *different* peer instead of giving up.

So the load-spread mechanism is composed of **existing primitives**, with one
new domain-level concept (load-aware rank).

## Seven mechanisms, ranked by composability

| # | Mechanism | Already partially exists? | Effort |
|---|---|---|---|
| 1 | **Replication-on-touch** — pulled chunks become locally answerable | ✓ in graph.json upsert path | LOW |
| 2 | **Receiver-side rate limit** — token bucket per requester returns `rate_limited` | ✓ recall-sync.ts, search-sync.ts | LOW (already wired) |
| 3 | **Load-aware rank penalty** — rep × (1 / (1 + recent_asks_to_peer)) | NEW | LOW |
| 4 | **Epsilon-greedy exploration** — N% of asks sample random peers, including unknown | NEW | LOW |
| 5 | **Re-seeder credit** — peers who re-answer earn rep too, not just the original expert | NEW | MEDIUM |
| 6 | **Pre-replication on join** — new peers receive a "popular subjects" starter pack from current top peers | NEW | MEDIUM |
| 7 | **Subject-sharded fan-out** — high-rep peers on subject S get the first ask, but parallel asks fan out to N>1 next-best | NEW | LOW (extends item 3) |

Discussion below.

---

### 1. Replication-on-touch — the foundational primitive

**What it does.** `akashik touch --peer B --label "lemlist pricing"` pulls
the chunk and writes it to A's local `graph.json` with `_akashik_source_peer: B`.
A's next `ask` for "lemlist pricing" surfaces this chunk *as if A had originally
indexed it*, with peer-B attribution preserved for audit.

**Status today.** Already implemented in the touch path. The chunk is durable
on A's disk after the pull.

**What's missing.**
- Touch is *manual* — the user has to know to run `touch` for a specific node.
  The natural instinct is to pull-on-ask, automatically. Add a `--auto-pull`
  flag to `akashik ask --peers` that, on a high-confidence federated
  result, also touches the underlying chunks so they're locally durable for
  next time.
- Bandwidth: an over-aggressive auto-pull means every federated ask doubles
  data flow. Cap by satisfaction threshold (only pull when satisfaction ≥ 0.7)
  AND by recency (don't re-pull a chunk we already have).

**Why this is the foundation.** Every other mechanism builds on the assumption
that knowledge can replicate. Without replication, load-spreading is just
"ask different peers" — but if no other peer has the chunk, all you've done is
fail more.

**Files:** `src/application/recall.ts`, `src/cli/commands/ask.ts:askFederated`,
new helper `src/application/auto-pull-on-confidence.ts`.

---

### 2. Receiver-side rate limit — already in production

**What it does.** Peer X's `recall-sync.ts` per-peer token bucket caps incoming
recall calls at `RATE_PER_SEC = 5`, burst `RATE_BURST = 10`. When peer Y
exceeds, X responds `{type: 'recall_err', reason: 'rate_limited'}` and Y is
expected to back off and try someone else.

**Status today.** Wired since round-2 (`recall-sync.ts:53-61`,
`search-sync.ts:140`).

**What's missing.**
- The **asker side** doesn't have a fallback strategy. When peer Y receives
  `rate_limited` from X, currently it just records the failure in telemetry.
  The right behaviour is to demote X for the next 60s and re-route to the
  next-best peer in the rep ranking.
- The token bucket is per-peer-pair, not per-subject. If peer Z hits X with
  100 different subjects in 1 second, Z exhausts their budget for *all*
  subjects — including ones X actually wants to share. That's correct overall
  but creates a perverse incentive for Z to spread asks across DIDs.

**Files:** `src/application/federated-search.ts` (asker-side fallback logic on
`rate_limited`), `src/domain/peer-telemetry.ts` (record demotion).

---

### 3. Load-aware rank penalty — the simplest new mechanism

**What it does.** Modify the `rank_score` formula in
`docs/peer-reputation-design.md` §3 to include a load penalty:

```
load_factor = 1 / (1 + recent_asks_to_peer_in_window)
rank_score  = posterior_mean × confidence × freshness × load_factor
```

`recent_asks_to_peer_in_window` is a sliding count (last 60s) of asks the
local peer has sent to this remote peer. A peer who's already been asked 5
times in the window gets `load_factor = 1/6 ≈ 0.17` — drops in the rank order
even with perfect rep.

**Properties.**
- **Self-correcting.** Once peer Y's load on X has been spread to other peers,
  X recovers full rank. No persistent state, no gossip needed.
- **Fair across asks.** Two peers with rep 0.95 and 0.94 will trade off — the
  one we asked last second gets demoted, the other one rises. Round-robin
  emerges naturally.
- **Doesn't punish underused experts.** A peer with rep 0.95 that we haven't
  asked in an hour stays at the top.

**Tradeoff.** Local-only — peer Y doesn't know how *other* peers are loading X.
That's fine for v1: I'm not trying to globally optimise X's load, only to
stop *me* from being the one who DoSes X.

**Files:** `src/domain/peer-reputation.ts` (extend rank_score), tracking buffer
in `src/application/federated-search.ts`.

---

### 4. Epsilon-greedy exploration — for new peers + drift

**What it does.** With probability ε (suggest 0.15), the asker bypasses the
rep ranking and picks a random peer (including peers with zero observations).
Standard multi-armed-bandit pattern.

**Why this matters for load-spreading.**
- Discovers *new* experts. Without exploration, a peer with 5 perfect lemlist
  reviews starves out one with 1 unknown lemlist review forever.
- **Indirectly seeds knowledge.** If exploration sampled peer Z and Z had a
  lemlist chunk, Y now has a basis for caching it (mechanism #1) and crediting
  Z (mechanism #5). The rep distribution flattens over time without any
  coordination.

**Tradeoff.** ε queries waste budget on ~85% of cases where a known expert
would have answered better. Mitigation: only spend exploration budget when
satisfaction can tolerate it (high-stakes queries skip exploration; routine
ones use it). Codex flagged this in the design audit as the "exploration
floor" recommendation.

**Files:** `src/application/federated-search.ts:202` (peer-ordering hook).

---

### 5. Re-seeder credit — knowledge actually propagates

**What it does.** When peer A answers peer Y's query with chunks A originally
*touched* from peer B (carrying `_akashik_source_peer: B`), the
satisfaction-based reputation update credits **both A and B**. Specifically:

- B gets full credit (it's the original source)
- A gets a fractional credit (e.g., 0.4) for *carrying* the knowledge
- The credit fraction is configurable; recommended 0.3–0.5

**Why this changes incentives.** Without it, only the original expert ever
gains rep on lemlist — re-seeders are uncompensated mules. Carriers stop
caring about touching/replicating because they get nothing. With it,
**re-distributing knowledge is itself rewarded**, so the system optimises for
spread.

**Risk.** Mutual-praise rings — A pulls from B, B pulls from A, both inflate
each other's rep on a subject neither originally produced. Mitigation: cap
re-seeder rep gain at the *original* peer's rep on that subject, so circular
amplification can't exceed the source.

**Files:** `src/application/update-peer-reputation.ts` (new — extend the
local update path to credit `_akashik_source_peer` chains).

---

### 6. Pre-replication on join — solving cold-start for new peers

**What it does.** When peer F first connects to the network, it requests "popular
subjects in the last 30 days" from connected peers. Each connected peer responds
with their top-K subjects + the highest-confidence chunk for each. F pre-loads
that into its local graph.

**Why this matters for load.** Without it, F enters the network knowing
nothing about lemlist; F's first 50 lemlist queries all land on the
established expert X. With it, F arrives with lemlist coverage already cached
locally — F's queries are answered locally, X is left alone.

**Cost.** Bandwidth at join time (could be MBs depending on K and the
chunk sizes). Solvable by capping K and only pulling chunk *summaries*, not
full bodies — full body pulled lazily on first ask.

**Files:** new wire protocol `/akashik/seed/1.0.0`. Substantial — Phase 3
or later.

---

### 7. Parallel fan-out to N>1 next-best peers

**What it does.** Instead of asking only the top-rep peer first, ask the top-3
in parallel and merge results via the existing federated-search merge path.
First good answer wins (or all merge into the result). Naturally distributes
load across the top of the distribution.

**Tradeoff.** 3× the egress bandwidth and 3× the load on the receivers.
Bandwidth is cheap; the receiver load is the real cost. Recommended: parallel
fan-out only when satisfaction confidence on the top peer is below a threshold
(e.g., 0.6). When the top peer is highly trusted on this subject, ask only
them.

**Files:** `src/application/federated-search.ts:202`.

---

## The recommended composition

These mechanisms compose orthogonally. The recommended starting set, in
implementation order:

| Order | Mechanism | What it adds | Phase |
|---|---|---|---|
| 1 | **Load-aware rank penalty (#3)** | Stops me from DoSing one peer | Phase 1 (with the rep system) |
| 2 | **Asker-side `rate_limited` fallback (#2)** | When the receiver pushes back, route elsewhere | Phase 1 |
| 3 | **Epsilon-greedy exploration (#4)** | Discover new experts; sample unknowns | Phase 1 |
| 4 | **Auto-pull on high-confidence federated answer (#1)** | Replicate so I can answer next time | Phase 2 |
| 5 | **Re-seeder credit (#5)** | Reward re-distribution; knowledge actually spreads | Phase 2 |
| 6 | **Parallel fan-out for low-confidence asks (#7)** | Hedge when no single peer is clearly best | Phase 2 |
| 7 | **Pre-replication on join (#6)** | Solve cold-start for new peers | Phase 3 (new protocol) |

**Items 1–3 ship in Phase 1 alongside the base reputation system.** They're
all small, additive changes to the same `federated-search.ts` ranking path
plus the `rank_score` formula in `peer-reputation.ts`. They get the network
to "load-balanced enough that the 0.95-rep peer doesn't get crushed" without
any new wire protocol.

**Items 4–6 ship in Phase 2** alongside subject extraction and the per-peer
ordering hook. These are where knowledge actually starts to *propagate*
through the network. Without them, load-balancing is "spread the asks"
without "spread the answers" — the underlying scarcity stays.

**Item 7 ships in Phase 3** with the pull-on-demand wire protocol. It's the
only one that requires new libp2p protocol design.

---

## Failure modes per mechanism

| Mechanism | Most likely failure | Detection / mitigation |
|---|---|---|
| Replication-on-touch | Bandwidth amplification (every ask doubles data flow) | Threshold on satisfaction (≥0.7) before auto-pull |
| Receiver rate-limit | Asker treats `rate_limited` as failure, not redirect signal | Asker-side demote-and-retry path |
| Load-aware rank | Recent-window count is wrong size (too short → no debounce; too long → no recovery) | Eval-harness measurement on the 60-second window |
| Epsilon-greedy | Wastes high-stakes queries on bad peers | Skip exploration when query has high stakes (heuristic: longer query, more entities) |
| Re-seeder credit | Praise rings amplify between cooperating peers | Cap re-seeder rep at original peer's rep on subject |
| Pre-replication on join | New peers immediately consume MBs of disk | Cap K and pull summaries first, body on demand |
| Parallel fan-out | 3× receiver load | Gate on confidence — only fan out parallel when no peer is clearly best |

---

## Direct answer to the user's question

**How do we keep the 0.95-rep peer from being overwhelmed AND make sure its
knowledge spreads?**

Three mechanisms working together close the loop:

1. **Load-aware ranking** — the asker's *own* recent-ask count to peer X
   penalises X's `rank_score`. Round-robin across the top-N rep emerges
   naturally without coordination. Local-only, no new state, ships in Phase 1.

2. **Replication-on-touch + auto-pull-on-high-confidence** — every federated
   answer over satisfaction 0.7 silently durable-writes the chunk to the
   asker's local graph (we already do this for manual touch; auto-pull is one
   feature flag away). Ten asks for lemlist over a week → ten peers now have
   lemlist coverage locally → load on the original expert decays exponentially.
   Ships in Phase 2.

3. **Re-seeder credit** — when those ten peers answer future lemlist queries,
   they earn (capped) rep credit alongside the original expert. The
   incentive aligns: re-distributing knowledge is the rep-maximising strategy,
   not hoarding. Knowledge spreads not because we ordered it to, but because
   the gradient on rep growth points that way.

**Why this is enough.** Item (1) is a 50-line change in
`peer-reputation.ts:rank_score` + a sliding window in `federated-search.ts`.
Item (2) is a `--auto-pull` flag on `ask --peers` plus a satisfaction-gate.
Item (3) is the rep-update path crediting `_akashik_source_peer` chains.
None of them needs new wire protocol; the touch protocol is already the
replication channel.

**What this does NOT solve.** Coordinated misinformation that the entire
network agrees on, malicious peers gaming the satisfaction signal directly
(handled by the existing scorer's confidence + provenance), or pathological
network topologies (one peer is the only path to a subject — no amount of
incentive spreads knowledge through a network of one). Those are honest
limits, not blocks on shipping.
