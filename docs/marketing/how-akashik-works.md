# How Akashik works

The shortest accurate description of the mechanism that makes
Akashik possible. Written for the reader who has heard "federated
knowledge graph" and wants to understand *exactly* what's
distributed, *what* gets cached, *when* the network reaches out
to the web, and *who* ends up holding which piece of the record.

This is the architecture, not the marketing copy. The marketing
copy lives in [`storybrand-messaging-draft.md`](./storybrand-messaging-draft.md).

## The one-paragraph version

Each Akashik peer holds **only its own information** — what its
user contributed, what it pulled from other peers in response to
its user's questions, and what it researched on the web when the
federation couldn't satisfy a query. When you ask Akashik
something, it asks your local graph first, then asks every peer
you're federated with for *their two cents*. If the federation
can't answer with confidence, the harness reaches out to the web,
finishes the research, and **saves the result locally on the peer
that asked** — that peer becomes the "ambitioned" curator of that
piece of knowledge. The *next* user who asks a similar question
gets that research transferred from the ambitioned peer (if
they're online), without anyone having to know it existed. Every
query is a potential cache-fill, every web-fetch becomes someone's
local commons, and the network's working set grows by *what its
contributors are curious about* — not by what a central planner
decided to ingest. **Time-to-answer drops every time anyone in
the network does work.** That compound is the entire mission.

## The mechanism in five steps

```
                ┌─────────────────────────────────────────────────┐
                │  USER A asks: "How does mxbai-rerank compare    │
                │   to cross-encoder on long contexts?"           │
                └─────────────────────────────────────────────────┘
                                    │
                                    ▼
   ─── STEP 1 ─────────────────────────────────────────────────
       Query A's LOCAL Akashik graph
       Hit?  → return; done. (Cheapest path. Zero network.)
       Miss? → continue.
   ────────────────────────────────────────────────────────────
                                    │
                                    ▼
   ─── STEP 2 ─────────────────────────────────────────────────
       Fan out to connected PEERS in A's shared rooms
       Each peer answers with "two cents" — whatever they've
       saved or previously researched that matches.
       Results merge via RRF into a candidate set.
   ────────────────────────────────────────────────────────────
                                    │
                                    ▼
                   ┌────────────────┴───────────────┐
                   │ Federation answered?           │
                   │  ├── Yes (confident) → return  │
                   │  └── No (or low confidence)    │
                   └───────────────┬────────────────┘
                                    │
                                    ▼
   ─── STEP 3 ─────────────────────────────────────────────────
       Harness performs WEB RESEARCH on A's machine
       (WebSearch / WebFetch / arxiv pull / etc.)
       This is the only time the network reaches outward.
   ────────────────────────────────────────────────────────────
                                    │
                                    ▼
   ─── STEP 4 ─────────────────────────────────────────────────
       Result is SIGNED BY A and saved to A's local graph
       A becomes the "ambitioned" curator of this knowledge.
       Provenance: A's DID, timestamp, source URLs, room.
   ────────────────────────────────────────────────────────────
                                    │
                                    ▼
   ─── STEP 5 ─────────────────────────────────────────────────
       Later, USER B asks a similar question
       Federation fan-out reaches A's peer (if online)
       A's research transfers to B with original attribution
       Cost of the research: paid once, by A. Benefit: ∞.
   ────────────────────────────────────────────────────────────
```

## What each peer actually stores

| Bucket | Contents | Source |
|---|---|---|
| **Self-contributed** | Things the user explicitly saved (`akashik save <url>`, codebase indexing, manually-typed notes) | The user |
| **Pulled** | Nodes received from federated peers in response to the user's own queries | Federation, with provenance |
| **Researched-on-miss** | Web research results that were fetched on the user's machine because the federation couldn't satisfy a query | Web, attested by the curator |
| **NOT stored** | Anything other peers saved that this user never asked about | — |

The fourth row is the key. No peer holds the global graph. There
is **no global graph**. Each peer's local store is exactly the
slice that's been pulled into use through that user's curiosity
plus their direct contributions. This is what makes it scale to
the whole open-source community without becoming someone's
2-terabyte sync nightmare.

## Why "ambitioned" matters

When User A's query triggers web research, A's machine does the
fetching, A's machine does the embedding, and A's local graph
stores the result. **A is now the ambitioned curator** of that
particular piece of knowledge for the network.

This matters for four reasons:

1. **Provenance lives where the work happened.** The reader who
   queries A's research six months later sees A's DID, A's room,
   the date, the source — not a faceless "Akashik says". Knowledge
   has authors.
2. **Cost lives where the curiosity was.** A paid the network
   roundtrip + the web fetch. B, C, D who query later pay
   nothing. The "ambitioned" framing is the natural answer to
   "who pays for the compounding?" — the curious user pays once,
   the community benefits forever.
3. **Trust is graph-traversable.** If you don't trust the
   research, you can follow the chain: who curated it, who they
   are, what room they're in, what they linked to. There's no
   "trust the platform" because there's no platform.
4. **Curiosity drives the network's working set.** The faster a
   topic gets queried, the more peers end up with it cached. The
   network's hot data is exactly what the community is currently
   curious about. Nobody has to plan ingestion; the curiosity of
   the contributors plans it.

## What happens when a peer goes offline

This is the honest trade-off and we don't paper over it.

If User A is offline when User B asks a question only A's local
graph holds:

- B's local-first query misses (A's research isn't on B's disk).
- B's federation fan-out reaches A's peer ID but gets no response
  (A is offline).
- B falls through to web research themselves.
- B is now an ambitioned curator of their own version of that
  research.
- Some duplication. Some redundancy. Both A and B now hold
  attestable versions of the same investigation.

Two notes:

- This is fine and arguably *good*. Multiple independent curations
  of the same topic strengthen the record (more provenance, more
  perspectives).
- Mitigations exist for popular topics: peers can opt into
  caching anything that crosses a "frequently queried" threshold
  in their room. The default is "cache only what I asked for";
  the opt-in is "also cache the room's hot items".

This is identical to the property every decentralized system has:
**availability follows participation**. Akashik doesn't pretend
otherwise.

## Why this beats every existing alternative

Other "shared memory" or "team knowledge" products try to be a
single source of truth and either need a central server, a
sync daemon, or full replication of the entire graph on every
node. All three are wrong for the OSS community as a whole:

| Approach | Problem |
|---|---|
| Central server (Notion, Slack, "team memory" SaaS) | Vendor owns the data; pricing/privacy changes can lock you out; doesn't scale to community-of-millions ownership |
| Full-graph replication on every node | Disk cost compounds linearly with community size; new joiners face a multi-GB-to-multi-TB sync; trivially DoS-able by spam contributions |
| Per-room private CRDTs (Roam-style multiplayer) | Closed by default; doesn't compound across rooms; no path to community-wide commons |

Akashik's **"each peer holds only what it has asked for or
contributed"** model neatly avoids all three. The community's
knowledge is replicated *to the precision of demand* — popular
items get cached on many peers, fringe items live on one peer
with original provenance, and disk cost on every peer scales with
*that peer's own curiosity*, not with the community's total
contribution volume.

## Compounding, stated formally

For any topic `T` in the network:

- Let `Q(T, t)` = number of times anyone has asked about `T` by
  time `t`.
- Let `R(T, t)` = number of peers currently holding a cached
  answer for `T` at time `t`.

Then by construction:

```
R(T, t) ≤ Q(T, t)
```

(R grows by 1 each time a previously-uncached peer asks about T
and pulls it.) The interesting property:

```
expected_time_to_answer(T)  ~  1 / R(T, t)
```

The more peers cache `T`, the faster the next query lands. And
`R(T, t)` is **monotonically non-decreasing** under the
mechanism — it only grows. Knowledge that's been
researched anywhere in the network gets faster to retrieve
everywhere.

This is the compounding. It's not a marketing claim; it's a
property of the architecture.

## Privacy: who sees what

| Type of data | Who sees it |
|---|---|
| Your local contributions in a public room | Anyone federated in that room can pull on query |
| Your local contributions in a private room | Only peers you've explicitly shared the room with |
| Your queries | Local to you; the federation sees only what you choose to fan out |
| Web research you did to satisfy your own query | Saved locally; shared via your peer ID with the room you queried from |
| Anything you never saved or researched | Doesn't exist on your peer; nothing to leak |

The default is **privacy-by-construction**: a peer literally
cannot expose what it doesn't hold. No data-erasure migration
required for a node that was never indexed.

## Reading the network

Public peers (and there can be many) expose a read-only browse
endpoint that shows the records held by that peer + freshness +
provenance chains. This is the "Browse the record" entry point
for newcomers who want to see what's already in the federation
before contributing. No login. No account. Just a peer URL.

## See also

- [`storybrand-messaging-draft.md`](./storybrand-messaging-draft.md) — Brand messaging that this mechanism credibility-anchors.
- `docs/research/beat-the-competitors-retrieval-plan.md` — The retrieval-quality work that backs each peer's individual lookups.
- The protocol spec (TBD — link when the public spec lands).
