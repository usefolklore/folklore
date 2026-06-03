# Akashik — positioning (v2.1)

> **Snapshot — v2.1 (pre-V5).** This positioning draft was written
> when "room" was still a federation primitive. Read every "room"
> below as roughly "workspace tag + per-node `private: bool`" — the
> V5 primitives that replaced the abstraction. The mission framing
> (federated knowledge commons, signed by curator, federation as
> differentiator) survives untouched; the mechanism vocabulary is
> what changed. The current canonical messaging lives in the repo
> README; this file is kept as the historical positioning brief.

**Audience:** open-source developers who believe the VC-funded "AI
memory" product category is structurally unsustainable — and that the
only path forward is peers running the same tool and sharing what they
know with each other.

**The enemy, named:** mem0 ($52k stars, SaaS). Graphiti / Zep (24k,
SaaS, LOCOMO benchmark disputed three ways). Letta / MemGPT (22k, VC).
MemPalace (44k, benchmarks contested in their own issue tracker, #214).
Mastra Observational Memory (22k, SaaS). Cognee, Honcho, Memobase —
all riding the same treadmill: raise a round, put your context in
their cloud, argue about LOCOMO numbers, lock in a pricing model that
only works if the free tier eventually shrinks.

**The counter:** Every Akashik instance is a node in a peer mesh.
Your knowledge graph lives on your CPU. You share rooms with peers
you trust via libp2p. Questions reach peers via an oracle bulletin
board. Answers flow back through the same pipe that auto-saved your
web research. No cloud. No subscription. No benchmark theater.

**The hook that lands:** *These companies exist because every agent
needs a memory — and every one of them is building the same locked
silo on top of the same open-source primitives. The locked silo is
the business model, not the memory. Run Akashik instead. Share
what your graph knows with peers. The network grows, and nobody needs
a Series A.*

---

## Hero copy — three directions

Pick one. All three foreground the "your peers already did this
research" value prop; they differ in how directly they contrast
with the VC-funded category.

### Direction A — "the network before the web" (recommended default)

> **Headline**
> The network before the web.

> **Subheadline**
> Your peers already did this research. Akashik asks their
> graphs before letting your agent hit the web — their embeddings,
> their citations, their synthesis flow straight into your Claude Code
> session. Local-first when you're offline, peer-first when you're
> online. MCP-native, MIT-licensed, runs on your CPU. No cloud, no
> subscription, no benchmark theater.

> **Primary CTA:** Run your own node
> **Secondary CTA:** See the federation protocol

**Why this works:** "the network before the web" is the one-line
claim nobody else in the AI-memory category can make. VC-funded
memory SaaS locks your context in their silo — by design, my graph
can't help answer your question and vice versa. Akashik's
entire architecture is the opposite: the prefetch hook consults
connected peers *before* letting Claude reach for WebSearch, and
the PostToolUse hook saves what Claude did fetch back into a room
your peers can touch. Research compounds. The network gets smarter
the more of us run it.

The subheadline lands four specific claims in one paragraph:
(1) peers already did the work, (2) their embeddings flow direct —
no vendor broker, (3) graceful fallback to local when offline,
(4) the "no cloud, no subscription, no benchmark theater" triplet
rules the VC-funded category out without naming anyone.

### Direction B — direct enemy-naming (for the launch thread, not the homepage)

> **Headline**
> Stop paying rent on your agent's memory.

> **Subheadline**
> Every AI memory SaaS is a silo with a pricing model. Akashik
> is the same memory layer, MIT-licensed, running on your machine,
> federated across peers you trust. 23 source adapters, 21 MCP tools,
> 396 tests — all in-tree. No API key, no seat pricing, no benchmark
> argument.

> **Primary CTA:** Run your own node

**Why this works:** leans harder into the ideological frame. Right
for social-post hooks and launch threads, probably too pointed for
the permanent homepage.

### Direction C — invitation framing (for a community-first launch)

> **Headline**
> A knowledge graph for coding agents — built to federate, not to host.

> **Subheadline**
> Every developer running Akashik is a peer in the network. Your
> graph syncs with the peers you trust. Questions you can't answer
> reach the ones who can. We're not building a platform — we're
> building the protocol that makes platforms unnecessary. MIT-licensed,
> CPU-local, MCP-native.

> **Primary CTA:** Join the federation

**Why this works:** frames installation as joining a movement rather
than downloading software. Fits if the launch is paired with a
Discord / forum / peer-list where new nodes can find others to
connect to.

---

## Problem → Solution section (the second scroll)

Use after the hero. Single idea per column.

### The problem

> Every "AI memory" company is racing to the same endpoint: a cloud
> that holds your context and charges you to retrieve it. They argue
> about LOCOMO scores while their own issue trackers document how the
> numbers were tuned. They raise rounds based on graphs that will
> eventually sit behind a paywall. The memory layer your agent needs
> is being captured in front of you.

### The solution

> Akashik is the opposite shape. Every instance is a peer. Every
> peer runs the same code. Your graph lives on your CPU; your peers'
> graphs live on theirs; the P2P layer lets them share rooms without
> anyone brokering the exchange. **When your agent needs context it
> doesn't have, Akashik checks the peers you trust before it
> reaches for the web** — their embeddings, their fetched articles,
> their saved syntheses flow directly into the MCP context Claude
> reads from. You inherit their research instead of repeating it.
> The retrieval is measurable — full BEIR, NDCG@10, reproducible with
> `npm run bench`. The protocol is MIT. The only "platform" is a
> directory of peer multiaddrs.

---

## Value propositions — three benefits, not five

Ordered by leverage. Don't soften them.

### 1. Research that compounds across everyone running it.

When a peer you trust has already investigated the topic, their
graph — embeddings, citations, tunnels across related subjects —
flows straight into your Claude Code session. No Google, no
re-embedding, no "let me read this one more time." You inherit the
finished work. The more developers on the network, the less research
anyone has to redo — and nobody needs a vendor's permission for the
compounding to happen.

### 2. Your identity is a keypair you own, not a row in someone's DB.

Every Akashik install provisions a W3C `did:key` (Ed25519,
32-byte pubkey, base58btc-encoded, multicodec-prefixed per the spec)
during first boot. Your user DID is long-lived and survives device
changes. Your device key is authorized by that DID via a signed
authorization chain, and every message you send to peers — memory
entries, oracle answers, room shares — can be wrapped in a signed
envelope that any other peer verifies **offline, in under 2 ms, with
zero DID-resolver calls**. Rotate a compromised device, keep the user
DID; nobody ever emails support. No central issuer, no directory
service, no registry — just cryptography you can audit in 641 lines
of pure domain code.

### 3. Your graph, not theirs.

Every node is embedded locally. Every query hits your SQLite file
first, connected peers second, the open web last. The network layer
opens only for rooms you explicitly share or the always-on system
rooms you opt into. There is no Akashik server — nobody to buy
out, nobody to shut down, nobody to raise prices. Three system rooms
(`toolshed`, `research`, `oracle`) every peer advertises by default;
every other room is negotiable room-by-room via the interactive
share picker.

### 4. Benchmarks you can reproduce.

72.30% NDCG@10 on full BEIR SciFact (5,183 docs × 300 queries). 75.22%
with the optional Rust embedder. These are measured against
standardized datasets, not LLM-as-judge. Run them yourself with one
command. The VC-funded category publishes LOCOMO scores that contradict
each other in their own paper comments — we publish NDCG@10 on the
benchmark the academic community uses, because we don't need to
obscure what the number means.

---

## Objection handling

### "Can a local-CPU model really match GPU-required SaaS?"

Wave 2 (72.30% NDCG@10) is **within 2 NDCG points of bge-base-en-v1.5
(74.0)** and 4.4 points below GPU-required monoT5-3B reranker stacks
(76.7). At 137M parameters and 36ms p50 latency. The gap isn't an
abyss; it's a rounding error most workloads won't notice. If you
want the extra two points, flip `AKASHIK_EMBEDDER_BACKEND=rust`
and get 75.22% with the Rust bge-base sidecar — no API, still CPU,
still local.

### "What about when I need something my graph doesn't have?"

Two paths, both in-tree:

- **Auto-prefetch** — the Claude Code hook runs `akashik ask`
  before every Glob / Grep / Read / WebSearch / WebFetch. If your
  graph has the answer, Claude answers from it. If not, Claude makes
  the outbound call — and the PostToolUse hook auto-saves the result
  to the `research` system room. The next time anyone asks about
  the same topic, the graph answers.

- **Oracle bulletin board** — post a question via `oracle ask`. It
  propagates to every peer you're connected to, both over libp2p
  pubsub (real-time) and the CRDT sync (durable). Peers whose graphs
  can plausibly answer see it via `oracle answerable` and respond
  at their discretion. Federated human-or-agent Q&A over the same
  wire.

### "Isn't this just another fragmented OSS project?"

The big AI-memory repos are ~50k stars each, and none of them
federate. They're each their own fragmentation. Akashik is the
interop layer. One MIT-licensed protocol, one wire format, one
validator at the trust boundary. Peers running the same version
exchange graphs without negotiating.

### "Why should I trust peers I don't know?"

You don't, and you shouldn't. The trust boundary is explicit:

- **Signed envelopes.** Every outbound node can be wrapped in a
  device-signed envelope carrying its user-DID authorization chain.
  Receivers verify the chain offline (three Ed25519 checks, sub-2 ms)
  and know exactly *which user, which device* produced the claim.
  Domain-separation tags (`akashik-auth:v1:` vs
  `akashik-sig:v1:`) prevent replay of authorization signatures
  as payload signatures — enforced in `src/domain/identity.ts`.
- **`secret-gate`** scans every node against 14 patterns (API keys,
  JWT-anchored bearer tokens, private key blocks) before anything
  crosses the wire.
- **`remote-node-validator`** rejects malformed or un-timestamped
  nodes at the boundary with a specific failure code (`FetchedAtMissing`,
  `UriSchemeNotAllowed`, etc.) — logged on both sides for drift
  observability.
- **`shareable: false`** on any room in `shared-rooms.json` excludes
  it from system-room virtual membership too — the opt-out for
  sensitive work.
- **`share ui`** — the interactive picker — toggles opt-in per
  non-system room in ~10 seconds, zero-dep.

You trust the peers you choose, at the granularity of rooms you
choose, with cryptographic attribution for every claim that reaches
you, and the protocol enforces the rest.

### "Why should I believe you won't become another VC-funded SaaS?"

The architecture refuses the move. There is no Akashik server
to operate. Every node is authoritative for its own graph. A cloud
offering would be strictly worse than running the binary — slower,
more expensive, weaker privacy. The business model that could kill
this project doesn't fit the shape of the project.

---

## Social proof (without fabrication)

Don't invent testimonials. Use what's real:

- **Measured, reproducible benchmarks** — cite the 72.30% NDCG@10
  number and point at `scripts/bench-beir-sota.mjs`. The readers this
  page is for care more about reproducibility than endorsements.
- **Real competitor landscape** — the `.planning/BENCH-COMPETITORS.md`
  in-tree doc names every SaaS alternative, their real star counts,
  their benchmark status ("contested", "inflated", "unverified"). Put
  a summary table on the page. Let the VC-funded category make
  Akashik's argument for it.
- **Transparent phase log** — 13 phases of v2.0 + v2.1 shipped with
  commit history. Contrast with SaaS product pages where the release
  notes stop when the free-tier changes start.

---

## Final CTA

Mirror the hero. Repeat the install command. No risk reversal needed
— there's no trial, no sign-up, no credit card.

> **Run your own node**
> `git clone https://github.com/SaharBarak/akashik && npm i && bash scripts/bootstrap.sh`
>
> One command to install, three minutes to index, no account required.
> Connect to peers you trust when you're ready.

---

## Voice notes

- **Call the category out, not individual companies.** "VC-funded
  AI memory SaaS" lands; "mem0 is bad" sounds like a grudge and
  invites drama. The exception is the competitor table, where named
  comparison is the point.
- **No buzzwords.** Never "revolutionary," "powerful,"
  "streamlined," "seamless." These audiences read past them.
- **Numbers before adjectives.** "72.30% NDCG@10 on 5,183 docs × 300
  queries in 36 ms p50" > "state-of-the-art retrieval." The first
  makes a verifiable claim; the second is marketing.
- **No emoji.** This audience reads README.md, not Twitter bios. The
  existing repo style already rejects emoji; the landing should match.
- **Technical terms stay technical.** Don't explain libp2p, NDCG,
  CRDT, MCP. The reader this page exists to convert already knows
  what those are. Explaining them dilutes the signal.
- **Active voice, present tense.** "Your graph runs on your CPU"
  not "Your graph would be run on your CPU." "Peers exchange rooms"
  not "Rooms are exchanged between peers."

---

## Scroll-landing scaffold (5-chapter structure)

Applies the scroll-storyteller framework (hero → 5 chapters
alternating light/dark → finale) and Lyndon's communication-
storytelling four-part structure (Headline · Key Points · Proof ·
CTA) at every beat. Plan backwards from the finale: "a mesh of
peers, each with their own DID, each holding their own graph,
federated by protocol not by platform."

### Hero (light, wide) — the contrast

- Headline: **The network before the web.**
- Subhead: *Your peers already did this research. Your data lives
  on your machine. Your identity is a keypair you own.*
- CTA: **Run your own node**
- Visual: a single peer's graph, with faint edges reaching outward
  to other graphs in the distance. Wide composition.

### Chapter 1 — the treadmill (dark, contrast)

- Headline: **Every "AI memory" company is building the same silo.**
- Key points: VC-funded SaaS. Your context in their cloud. LOCOMO
  benchmarks that contradict each other in their own paper comments.
  Your identity is a row in their user table.
- Proof: cite the BENCH-COMPETITORS table. mem0 vs Zep vs MemPalace,
  three-way benchmark dispute, stars counted from `gh api`, all
  linked to their own issue trackers.
- Visual: a monolithic cloud containing every user's data. One
  center, many spokes. Static.

### Chapter 2 — the shape that refuses it (light)

- Headline: **Akashik is the opposite shape.**
- Key points: every node is a peer, runs the same code, answers
  answers FROM its own graph. No Akashik server. No directory.
  Just multiaddrs.
- Proof: screenshot of `akashik peer list` with real peer IDs.
  MIT license. 396 tests pass. Phase log with commit SHAs.
- Visual: the same users as chapter 1, now each their own node,
  edges between them instead of spokes to a center. Motion: soft
  pulse on each node.

### Chapter 3 — identity you own (dark, turning point)

- Headline: **Your identity is a W3C `did:key`, not a customer record.**
- Key points: Ed25519 keypair, generated locally, multicodec-prefixed
  per spec. Device keys authorized by the user DID. Signed envelopes
  verified offline in under 2 ms. Rotate a compromised device, keep
  the user DID.
- Proof: `akashik identity show` output — real DID,
  authorization chain, device pubkey. 38/38 identity tests.
- Visual: a keypair unfolding from a pair of cryptographic glyphs.
  Authorization chain as a folded ribbon. Dark background to emphasise
  the cryptographic primitive.

### Chapter 4 — the retrieval fact (light)

- Headline: **72.30% NDCG@10 on BEIR SciFact. Reproducible.**
- Key points: full BEIR v1, not LOCOMO. 5,183 docs × 300 queries.
  CPU-only, 36 ms p50. 75.22% with the optional Rust embedder.
- Proof: `scripts/bench-beir-sota.mjs scifact --hybrid` one-line
  reproduction. Link to MTEB leaderboard. Wave 3 (reranker) regressed
  — we shipped the null result anyway, with root-cause.
- Visual: a clean bar chart — Akashik Wave 2 vs bge-base-en
  vs monoT5-3B. Annotated per visual-storytelling-design rules:
  "within 2 NDCG of GPU-required SOTA." No cherry-pick, no missing
  denominators.

### Chapter 5 — join the federation (dark, rising action)

- Headline: **One install to run a node. Two system rooms by default.**
- Key points: `toolshed` + `research` always-on + the `oracle`
  bulletin board for peer Q&A. Layer B over libp2p pubsub for
  real-time. CRDT sync for durability.
- Proof: GIF of `akashik oracle ask "..." --live` on peer A,
  `akashik oracle show <qid>` on peer B within 2 s.
- Visual: three nodes, questions flowing between them as small
  glowing dots along the edges. Motion: subtle, continuous.

### Finale (centered symbol) — unity

- No headline. A single symbol: a small mesh of peers, each with a
  tiny key icon, connected by the three system-room edges. Below
  the mesh: **Run your own node.** `git clone …`
- Exit without a recap — the reader either runs the command or
  doesn't. Don't beg for the install.

### Visual system across all chapters

- Palette: dark = `#0c0c14` base with accent greens / ambers; light
  = warm off-white with the same accent. Consistent across chapters.
- Typography: Outfit for display, JetBrains Mono for identity
  strings + command-line blocks. Lead with insight, not topic.
- Motion: restrained. One change per scroll beat (visual-storytelling
  rule: highlight OR annotate, never both).
- Annotations always on data. No unlabeled comparisons.
- Integrity: show limitations. Wave 3 / Wave 4 null results stay on
  the page. Reader earns trust by seeing the disclosure.

---

## Meta

**Page title (SEO):** Akashik — the network before the web
**Description:** The federated knowledge graph for AI agents. Your peers already did this research — Akashik asks their graphs before your Claude Code session hits the web. Your identity is a W3C did:key you own. MIT-licensed, CPU-local, 75.22% NDCG@10 on BEIR SciFact. No cloud, no subscription.
