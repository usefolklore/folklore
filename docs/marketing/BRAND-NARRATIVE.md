# Folklore — Brand Narrative

> The canonical four-act story folklore tells. Locked.
>
> Every public artifact (landing page, README hero, social posts,
> press deck, OG card copy) is a faithful retelling of this arc.
> When in doubt about what to say in a hero / tagline / outbound
> tweet: re-read this document, then write.

---

## The premise in one sentence

**Open source built the freest software stack in history because we shared code. Folklore is the missing substrate for everything between the code.**

That sentence is the brand. Everything below is the structure that lets a reader feel it land.

---

## The four acts

### Act I — Context

> *We already built this infrastructure for code.*

Open source's compounding mechanism is decades old: CRAN, npm, PyPI, GitHub, arXiv. A package gets written once and the next ten thousand engineers inherit it for free. The infrastructure compounds because the *artifact* is sharable, attributable, and demand-fetched.

**Visual register:** Library shelves. A codex. Indexed catalogues. The reader should feel they're entering a place where reference material lives, not a SaaS product page.

### Act II — Problem

> *We never built it for what we read and figured out.*

Every generation of contributors starts over. The same CUDA OOM gets diagnosed in parallel by fifty engineers next Tuesday. The same paper gets re-explained in blog posts that 404 within a year. The "AI memory" category that should solve this is structurally siloed — every product is one user's graph in one vendor's cloud, paying twice for the same answer and accumulating nothing for the community.

**The named enemy:** mem0, Letta, MemGPT, Cognee, Honcho, ByteRover, Mastra. Not because they're bad products — because they're the *wrong shape*. Single-tenant retrieval cannot compound across the OSS community by definition.

**Visual register:** The silo. Five identical vaults, each closed, each holding its own copy of the same answer. The reader should feel the absurdity before the alternative arrives.

### Act III — Evidence

> *We measured what happens when knowledge can flow.*

FolkloreBench-F is the only benchmark capable of falsifying the federated-commons thesis: simulate a peer network with offline churn and Zipfian queries, then watch `web_fallback_rate(t)`.

**The numbers (locked, from `tests/bench-folklore-federation.test.ts`):**

| Metric | Value | The headline |
|---|---|---|
| `web_fallback_rate` at t=0 | 17.0% | one in six queries hits the web |
| `web_fallback_rate` at t=2000 | 1.0% | one in a hundred hits the web |
| Compounding slope | −4.74e-5 | the curve bends downward — the thesis is real |
| Local resolution | 74.2% | most answers come from your own peer |
| Federation resolution | 21.3% | most of the rest come from someone else's |
| Web fallback | 4.5% | the web is now the exception |

**The empirical claim:** R(T, t), the number of peers holding a cached answer for topic T at time t, is *monotonically non-decreasing*. Once one peer in the network has done the work, the cost for every future asker collapses to a federation round-trip.

**The honest caveat:** v1 of the bench is boolean ("does peer N hold doc D"). v2 plugs real retrieval in. The real-pilot validation is the 100-peer ecosystem rollout queued for the next milestone.

**Visual register:** A measurement notebook. Calipers on the page. Ochre marginalia. The reader should feel the bench was run by people who expected to be wrong, ran it anyway, and reported what they found.

### Act IV — Insight

> *You don't need a new memory product. You need a federation protocol.*

Folklore is not a personal-memory tool. It is not a team wiki. It is the protocol — a peer-to-peer knowledge graph where every contribution is signed by its curator's verified GitHub identity, federated only on demand, and demand-shaped (each peer holds only what it has asked for or contributed). The network's working set grows by what its contributors are curious about, not by what a central planner decided to ingest.

You plug it into the harness you already use (Claude Code, Codex, Gemini, Hermes, OpenClaw) and the WebSearch your agent was about to make goes through your graph + your peers' graphs first. When the satisfaction floor is cleared (≥ 0.85 score, ≥ 2 hits, decision = `use_memory`), the WebSearch is denied — you use the cached answer for free. When it isn't, the web call proceeds and the result lands in your graph signed by you, so the *next* contributor who asks something similar pulls it from your peer instead.

**The compounding claim, said plain:** Once one person in your network has done the work, nobody in your network pays for it again.

**Visual register:** The closing seal of a codex. § FIN · EXPLICIT. A signed colophon. The reader should feel they've finished a chapter, not been asked to subscribe.

---

## The brand voice — what it sounds like

**The three rules:**

1. **Concrete numbers over adjectives.** "75.22% NDCG@10" not "industry-leading retrieval". "Web fallback 17% → 1%" not "significant reduction in API costs". The numbers themselves are the rhetoric.

2. **Architectural claims, not feature lists.** "No central server. Ever." is brand voice. "Built on libp2p" is footnote. Lead with the property the architecture gives the user; the library it uses is a *consequence*, not the headline.

3. **Cite the limitation in the same paragraph as the claim.** "Bench numbers are simulator, not pilot — v2 plugs real retrieval in. Real-pilot validation is the 100-peer rollout queued next." A reader who's been hurt by vibes-marketing should feel relief, not vigilance.

**The three bans:**

- **No "elevate / seamless / unleash / next-gen / revolutionary."** Every one of these signals AI-written-copy and instantly devalues the page. Use the verb that names the action.
- **No emojis in copy.** The codex aesthetic does not survive a 🚀.
- **No "agent memory" framing.** That category is the silo we're contradicting. Folklore is a *federation protocol that happens to give your agent memory as a side effect*, not an agent-memory product.

---

## The brand identity — what it looks like

The codex visual system (shipped commit `14f7af8`) carries the brand:

- **Surface:** Parchment-primary (`#f3ecd8`). Dark "chapter" sections (ink scale) used only for staged emphasis (hero, manifesto, finale). The page reads as a *page*, not a dashboard.
- **Accent:** Deep-leaf emerald (`#1f6f4f`) on parchment, brighter emerald (`#34d399`) on the dark chapters. Ochre (`#9c6f1c`) for marginalia and the hex-feed chrome. Vermilion (`#a8401a`) reserved as a rubric red for the rare hard claim.
- **Type:** Fraunces (variable serif, opsz 144, SOFT 50, WONK 0) for headings and `<em>` flourishes. JetBrains Mono for the hex chrome + code. Outfit for body warmth.
- **Chrome:** Left + right fixed columns of slowly drifting ledger material — 16-char hashes annotated with `leaf:`, `arxiv:`, `did:key:z6Mk…`, `peer:zM…` tokens. The page is always indexing something, just out of focus.
- **Section markers:** `§ 0N · NAME` codex spines above every major H2. Mono face, ochre, with a dashed-rule flank that fades into the section surface.

**What it must not look like:** a generic emerald-on-ink SaaS landing page, a developer tool with a particle-system hero, a startup with a 3-column "features" grid, anything purple.

---

## How the landing page tells this story

Each section maps to one act. The reader scrolls through the four-act arc:

| Section | Act | Job |
|---|---|---|
| **§ 00 · COVER** (hero, dark) | Context entry-point | Name the network, drop the install command, get the reader past the title. |
| **§ 02 · EXEMPLAR · QUERY THE NETWORK** (try, dark) | Context — what it *feels* like | A live demo of "ask, peer answers, signed by them". Concrete before abstract. |
| **§ 03 · MECHANISM · THE COMPOUNDING LOOP** (how, dark) | Context — what it *is* | Three concrete steps on how the integration plugs into Claude Code, etc. |
| **§ 04 · EMPIRICA · RETRIEVAL FOLIO** (bench, parchment) | Evidence | 75.22% NDCG@10 + the BEIR table. Numbers in monospace + table; nothing decorative. |
| **§ 05 · CONTRAVENTION · WHY EVERY OTHER MEMORY IS A SILO** (silo, parchment) | Problem | The named-enemy section. Reader has seen the thing work, now sees what they were going to settle for. |
| **§ 06 · MANIFEST · THE NEXT CHAPTER** (manifesto, dark) | Insight setup | "Giant platforms didn't invent the internet — they won a chapter of it." The pivot from problem to mission. |
| **§ FIN · EXPLICIT** (finale, dark) | Insight close | "The network gets smarter every time someone new joins." Install. Star. Continue. |

**Order rationale:** Specific → empirical → structural → mission. The reader experiences the product before being told why it has to exist. By the time they hit the manifesto, they've already seen the thing work and read real numbers, so the "next chapter of the internet" framing reads as inevitable rather than as a pitch.

---

## How everything outside the landing page tells this story

| Surface | Anchor act | Approved framing |
|---|---|---|
| Repo README hero | Act IV — Insight | "Federated knowledge commons for the open-source community." |
| Social — long thread opener | Act II — Problem | "Every AI memory company is building the same silo." |
| Social — short post | Act I — Context | "Open source built the freest software stack in history because we shared code. We never built it for what we read and figured out." |
| OG card | Act IV — Insight | "The globally accumulating knowledge network." |
| Press one-liner | Act III — Evidence | "Web fallback fell from 17% to 1% in 2,000 sim steps. Federation compounds." |
| Conference abstract | Act IV — Insight + Act III caveat | "A federation protocol for OSS knowledge. FolkloreBench-F validated in simulator; 100-peer pilot is the next milestone." |

Anyone writing copy for folklore picks the surface, picks the act it anchors on, then reads the corresponding section above before they type.

---

## What this document is NOT

- Not a style guide. Style guide is `BRAND-KIT.md` (color + type tokens + spacing).
- Not a roadmap. Roadmap is `../PROJECT-PLAN-FOLKLORE.md`.
- Not a positioning brief. Positioning is `positioning-v2.1.md` (historical, pre-V5).
- Not technical documentation. Mechanism docs are in the repo README, `how-folklore-works.md`, and `../architecture/V5-PROTOCOL.md`.

It is the *story*. When the story drifts, the brand drifts. When the brand drifts, the docs drift, and the docs are the brand. This file is the anchor.
