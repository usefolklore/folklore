# Folklore — social launch pack

The copy that ships when Folklore leaves the bench. One source of
truth for every channel: X, HN, LinkedIn, Reddit, captions, slide
subheads, email blurbs. Pull from here; do not improvise.

> **Headline (load-bearing).** *The globally accumulating knowledge
> network. For AI agents — and humans.*
>
> **Mission paragraph.** *Cooperative. Peer-to-peer. In the lineage of
> Napster, eMule, and BitTorrent — every peer's research compounds for
> the whole network, and a sub-second retrieval replaces 90+ seconds
> of token-burning AI research. No one pays twice for the same answer.*

Everything below is a derivative of those two blocks. If a variant
contradicts them, the variant is wrong.

---

## 1 · X / Twitter

### 1.1 — Pinned bio (160 chars)

> The globally accumulating knowledge network. For AI agents — and
> humans. Cooperative · P2P · sub-second. MIT.
> github.com/SaharBarak/folklore

### 1.2 — Launch tweet (single, 280 chars)

> Just shipped Folklore — the globally accumulating knowledge
> network for AI agents, and the humans who run them.
>
> Cooperative, peer-to-peer (Napster lineage, BitTorrent lineage).
> Every peer's research compounds for the whole network. Sub-second
> retrieval. No central server.
>
> github.com/SaharBarak/folklore

### 1.3 — Launch thread (5 tweets, ordered)

**Tweet 1 — hook**

> Most retrieval systems wait until your AI agent decides to search.
>
> Folklore lands in the prompt itself.
>
> 🧵

**Tweet 2 — wedge**

> The hook fires on UserPromptSubmit — *before* the LLM reads your
> message.
>
> By the time Claude reads "tell me about X", the local + federated
> answer is already in context.
>
> Same model. Same prompt. Different latency.

**Tweet 3 — lineage**

> Cooperative, P2P — in the lineage of Napster, eMule, and BitTorrent.
>
> Every peer's research compounds for the whole network. Sub-second
> retrieval replaces 90+ seconds of token-burning AI research.
>
> No one pays twice for the same answer.

**Tweet 4 — proof**

> Demo: same prompt, same model. Two terminals.
>
> One uses Folklore. ~10× faster. Cited from local research. Hook
> fired before any tool call.
>
> [scene-claude.gif]

**Tweet 5 — close**

> MIT-licensed. CPU-only. No GPU, no telemetry, no API key.
>
> 75% NDCG@10 on BEIR SciFact. 11 ms p50 retrieval. libp2p federation.
> W3C did:key identity.
>
> Run a node: github.com/SaharBarak/folklore

### 1.4 — Reply hooks (use when someone asks "isn't this just RAG?")

> Every other RAG fires when the agent calls a tool. Folklore
> fires when the user types. The retrieval happens before the LLM
> reads the question.

> Closer to BitTorrent than to Pinecone. Local-first graph + libp2p
> federation. The "vector DB" is a sqlite file on your machine.

---

## 2 · Hacker News

### 2.1 — Title (Show HN)

Two options, ordered by my preference:

1. **Show HN: Folklore — retrieval lands before the LLM reads the prompt**
2. **Show HN: Folklore — globally accumulating knowledge network for AI agents and the humans who run them (P2P, MIT)**

Option 1 leads with the technical wedge HN respects. Option 2 leads
with the category claim.

### 2.2 — Body

> Folklore is a local-first knowledge graph + libp2p P2P
> federation that hooks into Claude Code, Codex, Gemini, and any MCP
> host. The wedge: retrieval happens at *prompt* time, not at
> *tool-call* time. By the time the LLM reads the user's message, the
> local + federated graph's answer is already in context.
>
> **Stack**
>
> - Local: sqlite-vec + FTS5 + RRF hybrid retrieval (75% NDCG@10 on
>   BEIR SciFact, 11 ms p50)
> - P2P: libp2p protocols `/folklore/{search,recall,touch,share}/1.0.0`
>   over Yjs CRDTs
> - Identity: W3C did:key, Ed25519 signed envelopes, no central server
> - Reputation: subject-scoped Bayesian-mean ranking, load-aware
>   fan-out, epsilon-greedy exploration
>
> **Cultural lineage:** Napster, eMule, BitTorrent. Cooperative
> knowledge instead of cooperative files. No chain, no token, MIT.
>
> Demo: `bash demo/setup.sh && vhs demo/scene-claude.tape` (~25 s gif)
>
> github.com/SaharBarak/folklore
>
> Happy to answer reputation-system, libp2p, or hook-architecture
> questions in this thread.

### 2.3 — Anticipated HN questions, drafted answers

**"How is this different from \[mem0 / Letta / LangChain RAG\]?"**

> Different layer. Mem0 and Letta are agent-memory frameworks; you
> bolt them into the agent's runtime. LangChain RAG fires when the
> agent decides it needs context. Folklore fires *before the agent
> reads the prompt* — the result is injected as
> `additionalContext` on UserPromptSubmit, so the LLM never has to
> decide to search. It just reads.

**"Isn't 'decentralized' a red flag here?"**

> No chain, no token, no smart contract. libp2p is the same protocol
> stack IPFS uses for transport. Identity is W3C did:key — Ed25519
> keys you generate locally. The "decentralization" here is about not
> needing a server, not about a marketplace.

**"How do you handle malicious peers?"**

> Subject-scoped peer reputation: Bayesian-mean posterior with a
> recency half-life and load multiplier. Top-N fan-out cap +
> tier-based timeouts so high-rep peers don't get DDoS'd. Source-peer
> posterior caps relay credit (praise-ring defense). Reviewer DID
> shape gate. 13 documented null attacks in the threat model
> (`docs/p2p-threat-model.md`).

**"What's the eventual consistency story?"**

> Yjs CRDTs over libp2p pubsub. Nodes replicate per-peer (anything not
> marked `private`); freshness rules let consumers prefer fresh pulls
> when a hit's `age_days` exceeds the global stale-after window (~7 d).

---

## 3 · LinkedIn

### 3.1 — Founder post

> I shipped something I think changes how knowledge flows in AI agent
> workflows.
>
> **Folklore is the globally accumulating knowledge network for AI
> agents — and humans.** Cooperative, peer-to-peer, in the lineage of
> Napster, eMule, and BitTorrent. Every peer's research compounds for
> the whole network. A sub-second retrieval replaces 90+ seconds of
> token-burning AI research. No one pays twice for the same answer.
>
> The same primitive serves both: when Claude Code (or Codex, Gemini)
> reads your prompt, the graph answer is already in context. When
> *you* run `folklore ask` in your terminal, you read the same
> graph your agents do — your code, your dependencies, your past
> sessions, every peer's contribution.
>
> The technical wedge: while every other RAG framework wires retrieval
> into the agent's tool-call path, Folklore wires it into the
> *prompt* path. By the time Claude (or Codex, or Gemini) reads your
> message, the local + federated graph's answer is already in context.
>
> Architecture: local-first knowledge graphs over sqlite-vec + FTS5;
> libp2p federation; W3C did:key identity; Ed25519 signed envelopes;
> subject-scoped peer reputation that learns who knows what.
>
> MIT-licensed. CPU-only. No GPU, no telemetry, no API key.
>
> github.com/SaharBarak/folklore

### 3.2 — Re-share blurb (when others post about it)

> The bit that hooked me: retrieval fires *before* the LLM reads the
> prompt. Most "RAG" frameworks bolt search into the agent's tool path
> — Folklore lands the answer in the context window before the
> model thinks. Different layer.

---

## 4 · Reddit

### 4.1 — r/programming title

> [Show] Folklore — local-first knowledge graph + P2P federation that hooks into Claude Code's prompt path

### 4.2 — r/programming body

> I built this because every RAG framework I tried wires retrieval
> into the agent's tool-call path — meaning Claude has to *decide* to
> search before it gets context. That's the wrong layer.
>
> Folklore wires retrieval into the prompt itself. The hook fires
> on UserPromptSubmit (a Claude Code lifecycle event), runs
> `folklore ask` against a local knowledge graph + connected
> peers, and injects the result as `additionalContext` before the LLM
> reads anything.
>
> Same model. Same prompt — but answered from your peers' graphs, not
> the open web.
>
> **Stack**
>
> - sqlite-vec + FTS5 + RRF (75% NDCG@10 on BEIR SciFact)
> - libp2p P2P federation, W3C did:key identity
> - Ed25519 signed envelopes, no central server
> - Subject-scoped peer reputation (Bayesian rank, epsilon-greedy fan-out)
>
> MIT-licensed. CPU-only. Cultural lineage: Napster, eMule, BitTorrent.
>
> github.com/SaharBarak/folklore

### 4.3 — r/MachineLearning angle

> [P] Folklore — peer-federated knowledge retrieval with
> subject-scoped Bayesian reputation
>
> The reputation system might interest folks here: each peer
> accumulates a Bayesian posterior per `(peer, subject)` tuple, where
> subject = entity-id or source-family derived from the federated match. The
> ranking score is `posterior × freshness(half-life) ×
> loadMultiplier(in-flight)`, with epsilon-greedy exploration on top
> to keep the cold-start tail from starving. Top-N fan-out cap +
> tier-based timeout budgets so a 0.95-rep peer doesn't get
> hammered.
>
> Threat model documents the praise-ring attack defense (relay credit
> capped at source peer's posterior) and the silent-zero-credit fix
> for novel chunks (always emit the source-family subject when entity unknown).
>
> Code + design doc in repo. Curious if anyone has hit a similar
> peer-ranking problem in federated learning settings.
>
> github.com/SaharBarak/folklore

---

## 5 · Captions for the demo gifs

Ship these as alt-text, video subheads, screenshot captions.

**scene-claude.gif** (the ~10× side-by-side)

> Same model. Same prompt. The only difference is Folklore.

**scene-prompt-hook.gif** (UserPromptSubmit hook in flight)

> The hook fires before Claude reads the user's message. The graph
> answer arrives as context, not as a tool call.

**screencast.gif** (terminal walkthrough)

> Sub-second local retrieval, entity recall, peer reputation —
> CPU-only, no API key.

---

## 6 · Slide / one-liner library

For talks, decks, podcast intros, conference badges:

- *The globally accumulating knowledge network. For AI agents — and humans.*
- *One graph. Two readers: your agent, and you.*
- *Most RAG fires when the agent calls a tool. Folklore fires when the user types.*
- *Cooperative knowledge — Napster lineage.*
- *Sub-second retrieval. 90 seconds of AI research, every time.*
- *No server. No subscription. No revoke.*
- *The peer who answered last week answers your agent today.*
- *Same model. Same prompt. The only difference is Folklore.*
- *W3C did:key identity. Your math, not someone's user table.*

---

## 7 · Email signatures + bios

**Long (180 chars)**

> Building Folklore — the globally accumulating knowledge network
> for AI agents and humans. Cooperative, P2P, MIT.
> github.com/SaharBarak/folklore

**Medium (120 chars)**

> Folklore — knowledge before the prompt. Cooperative, P2P, MIT.
> github.com/SaharBarak/folklore

**Short (60 chars)**

> Folklore — knowledge before the prompt.

---

## 8 · What NOT to say

These phrases dilute Folklore by tying it to weaker incumbents.
Keep them out of every channel:

- *AI-powered* — every product says it; says nothing.
- *Leverage* — corporate verb. Real users say "use."
- *Next-gen RAG* — RAG is the category we're escaping.
- *Knowledge management for the AI era* — too soft. We *federate*; we don't *manage*.
- *Vector database* — sqlite-vec is inside; that's not the headline.
- *Decentralized AI* — triggers crypto-skeptics.
- *The future of* — cliché.
- *Empower* — same family as "leverage."
- *Seamlessly integrated* — both words are dead.
- *Web3* — explicitly NOT. Design doc says no chain.

---

## 9 · Channel-by-channel checklist

When the launch goes live, post in this order:

1. **GitHub README** — already updated to V5 hero + cooperative paragraph.
2. **Landing page (`docs/index.html`)** — already updated.
3. **X bio** — paste 1.1.
4. **X launch tweet** — paste 1.2 from the founder account.
5. **HN Show HN** — paste 2.1 + 2.2. Be present in the thread for the first 4 hours.
6. **LinkedIn founder post** — paste 3.1.
7. **r/programming** — paste 4.1 + 4.2 (Tuesday morning ET, peak engagement).
8. **r/MachineLearning** — paste 4.3 if reputation work is the angle that lands.
9. **Slack/Discord communities** — short blurb (section 7 medium) + GIF link.
10. **Email blast (if list exists)** — short subject line: "Folklore is live"; body = mission paragraph + repo link.

Don't post simultaneously. Stagger by ~30 min so each channel can
absorb its first wave of feedback before the next.

---

*This pack supersedes any earlier launch copy. If something here feels
off, edit this file — don't fork the message into another doc.*
