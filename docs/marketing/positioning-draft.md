# Positioning copy — draft set

**Context.** User flagged the current README hero —

> Akashik is the only way to accumulate, share, and stream knowledge seamlessly into your LLM work sessions.

— and asked for a stronger lead, gesturing at:

> Akashik builds on the global accumulation of knowledge and marks the new age in web, decentralized knowledge web.

The draft has two right ideas (federation builds on every peer's contribution; this is a web-shape shift) but lands awkwardly. This doc is the working set of refined candidates.

## What category does Akashik sit in?

It's not a vector DB (Pinecone), not a memory layer (mem0, Letta), not a RAG framework (LangChain), not an MCP server (it has one, but is more), not knowledge management (Notion, Glean). The closest existing categories — and how each falls short:

| Adjacent | What they share | What Akashik adds |
|---|---|---|
| **MCP servers** | tools the agent calls | a tool that fires *before* the agent calls anything |
| **RAG frameworks** | retrieval + LLM | the agent reads our context, not the other way around |
| **Personal knowledge graphs** (Logseq, Obsidian) | local-first graph | federation + agent integration + signed envelopes |
| **IPFS / Filecoin** | P2P content | retrieval-shaped (sub-second), not storage-shaped |
| **EigenTrust / WoT** | peer reputation | scoped per subject, integrated with retrieval |

Best framing: **Akashik is a knowledge layer for AI agents.** Specifically, the layer between "what the model was trained on" and "what the agent reaches for online" — local + peer-federated graphs that the agent reads as part of its prompt arrival, not as a tool it has to call.

That positioning has no good incumbent. Most products in the space are parts of the picture; nobody else combines local-first + P2P federation + hook-time retrieval + per-subject peer reputation.

## Four draft leads — three lengths each

### Lead A — "rebellious infrastructure"
Frames Akashik against the closed-lab monopoly. Good for HN crowd, founders, senior engineers.

- **12 words:** *Closed labs hoard knowledge. Akashik federates it. Signed, local-first, sub-second.*
- **25 words:** *Closed labs froze the knowledge in the model. Akashik unfreezes it: every peer's research, code, and notes federated locally — your agent reads it before it reaches for the web.*
- **60 words:** *Frontier labs trained on what existed six months ago. The thing you actually need was published yesterday, by ten thousand people, none of whom got asked. **Akashik is how that ecosystem shares its knowledge.** Every peer keeps a local-first graph; the network federates over libp2p with cryptographic identity you own. No servers. No subscriptions. No revoke.*

**Tradeoff.** Strong tribe-signal for indie hackers, anti-establishment crowd. Risks reading as combative on a B2B landing page; legal teams may avoid it.

### Lead B — "speed + sources"
Leads with what's measurable. Good for technical decision-makers, engineering leaders evaluating tools.

- **12 words:** *Sub-second knowledge retrieval for AI agents. Cited, federated, no central server.*
- **25 words:** *Akashik gives every AI agent a sub-second knowledge layer. Local graphs federate over libp2p; retrieval lands as cited context before the agent reaches for the internet.*
- **60 words:** *Akashik is a knowledge layer for AI agents. 11 ms p50 retrieval over your code, your dependencies, your research. Hook-injected into Claude Code, Codex, Gemini, and any MCP host before the agent considers a tool call. Federates over libp2p with W3C identity; signed envelopes prove what came from where. **75% NDCG@10 on BEIR SciFact, MIT-licensed, github.com/SaharBarak/akashik.***

**Tradeoff.** Honest, defensible, easy to verify. Misses the ideological pull that Lead A carries — reads more "feature" than "movement."

### Lead C — "knowledge web" (user's draft direction, refined)

- **12 words:** *The decentralized knowledge web. Every peer's graph, federated for your AI agents.*
- **25 words:** *Akashik is the decentralized knowledge web — every peer's research, code, and conversations, federated into a layer your AI agents read before they ever reach for the internet.*
- **60 words:** *The web's first chapter was pages. Its next is knowledge — the structured, current, attributed shape of what each of us has learned. **Akashik is the decentralized knowledge web for AI agents.** Every peer keeps a local graph; the graphs federate over libp2p with cryptographic identity. Your agent's context arrives before it ever asks the open web.*

**Tradeoff.** "Decentralized" carries crypto-baggage. Needs a sentence somewhere reassuring there's no chain. The 60-word version handles this implicitly ("libp2p" + "cryptographic identity" without "blockchain") but a casual reader could miss it. **The "next chapter" framing is the strongest move in this lead** — it places Akashik in web-historical context without overclaiming.

### Lead D — "wired into the agent" (the hook differentiator)
Leads with the technical thing nobody else has: retrieval at prompt-time, not tool-call-time.

- **12 words:** *Retrieval lands before the agent reads the prompt. That's the difference.*
- **25 words:** *Every other RAG fires when the agent calls a tool. Akashik fires when the user types — local graph, cited, sub-second, before the LLM has thought.*
- **60 words:** *Most retrieval systems wait for the agent to decide it needs to search. **Akashik lands in the prompt itself.** The hook fires on UserPromptSubmit, queries the local + federated graph, and injects cited context before the LLM reads the question. Same model, same prompt — but answered from your peers' graphs, not the open web.*

**Tradeoff.** Strongest *technical* differentiator on this list — only Akashik does this, today. Risks being inscrutable to non-technical viewers (what's a "UserPromptSubmit hook"?). Best paired with the side-by-side gif as the visual proof.

## Ranking

### GitHub README hero — **Lead C, 60-word version**
The README has 30 seconds of attention. The reader is technical (they searched for this) but doesn't yet know we exist. "The decentralized knowledge web for AI agents" places us in a frame they instantly understand, and the next-chapter framing earns the right to say "this is foundational." The 60-word version then proves the claim with the libp2p / signed / no-server beats. Lead D is the runner-up; lose only because it presumes vocabulary the reader doesn't yet have.

### X / Twitter bio — **Lead B, 12-word**
*Sub-second knowledge retrieval for AI agents. Cited, federated, no central server.*

Bios are scanned. Specific numbers + clean adjectives outperform ideology. Anyone clicking through to the README gets the bigger story.

### HN launch post title — **Lead D, 12-word**
*Retrieval lands before the agent reads the prompt. That's the difference.*

HN responds to specificity + a wedge. "Sub-second" and "decentralized" are commodities on HN; "retrieval before prompt-read" is a claim only we make. The thread fills with technical questions, which is the conversation we want.

## Secondary hooks — 8 supporting one-liners

Refine these alongside the hero — they live as section headers, badge text, slide subheads.

1. **No servers. No subscriptions. No revoke.** *(strong rhythm; works as the closing line under the hero)*
2. **The peer who answered last week answers your agent today.** *(captures federation + reputation + freshness)*
3. **Your code, your research, your past sessions — one query, all rooms.** *(captures the multi-room federation that already works)*
4. **W3C did:key identity. Your math, not someone's user table.** *(identity differentiator)*
5. **Signed envelopes. Cited sources. Auditable provenance.** *(B2B / SOC2 angle)*
6. **75% NDCG@10 on BEIR SciFact. CPU-only. 11 ms p50.** *(performance numbers — honest, defensible)*
7. **MIT-licensed. CPU-only. No GPU, no telemetry, no API key.** *(barrier-to-entry sells)*
8. **The hook fires on UserPromptSubmit. The answer is in the prompt itself.** *(the technical wedge)*

## Anti-patterns — what NOT to say

These phrases dilute Akashik by associating it with weaker incumbents. **Avoid:**

1. **"AI-powered."** Every product says it. Says nothing.
2. **"Leverage."** Corporate verb. Real users say "use."
3. **"Next-gen RAG."** RAG is the category we're escaping; calling ourselves a better RAG positions us downstream.
4. **"Knowledge management for the AI era."** Too soft. Akashik isn't about *managing* knowledge — it's about *federating* it.
5. **"Vector database."** We have one inside (sqlite-vec) but that's like calling Slack a "WebSocket app."
6. **"Decentralized AI."** Triggers crypto-skeptics; sets the wrong expectation.
7. **"The future of."** Cliché.
8. **"Empower."** Same family as "leverage."
9. **"Seamlessly integrated."** Both words are dead. Either delete or replace with what specifically integrates.
10. **"Web3."** No. We are explicitly NOT web3 — design doc says no chain.

## Biggest positioning risk

The most likely failure mode: **the reader nods at "decentralized knowledge web" then mentally files it next to Filecoin or Ceramic** and walks away thinking "another crypto project." We've shipped the wrong association. The defense is in the next sentence — every Lead C version above carries language ("libp2p", "cryptographic identity", "no servers") that signals decentralization without crypto. That sentence has to land in the same scroll-second as the hero. If the gif loads and the hero scans cleanly, the reader is ours; if there's a gap where they wonder "wait, is this a token thing?", we lose them in two heartbeats.

The second risk: **Lead A and Lead C's "movement" framing reads as overclaim** if the system doesn't *yet* feel networked at the moment a new user installs it. Akashik's local-first design means a fresh install sees zero peers. The README has to make the local-only experience compelling on its own — which the prompt-hook gif does — so the federation story is upside, not the only story.

## Recommendation

**Headline:** Lead C, 60-word, with the existing performance-claim line preserved as the second paragraph. Replace the current "Akashik is the only way to accumulate, share, and stream knowledge..." with:

> The web's first chapter was pages. Its next is knowledge — the
> structured, current, attributed shape of what each of us has
> learned. **Akashik is the decentralized knowledge web for AI
> agents.** Every peer keeps a local graph; the graphs federate over
> libp2p with cryptographic identity. Your agent's context arrives
> before it ever asks the open web.

**Sub-headline (under the hero gif):**

> Same model. Same prompt. The only difference is Akashik.

**Performance line (below):** keep the existing badge row — *75.22% NDCG@10 on BEIR SciFact · CPU-only · 11 ms p50 · 13 documented null attacks · W3C did:key identity · libp2p federation · MIT*.

That structure: ideological pull → visceral demo (the gif) → technical proof (numbers). Three layers in three scrolls. README hero solved.
