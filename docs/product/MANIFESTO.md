# Why Akashik exists

The frontier-model economy isn't sustainable, and everyone paying attention knows it. Compute costs climb. Training runs burn hundreds of millions. Investors want returns. Governments want levers — a US administration can decide tomorrow that an AI lab is strategic infrastructure and reshape its trajectory with a phone call. When that happens your workflow's weather changes overnight: prices hike, models deprecate, weights get silently swapped, terms tighten, behaviors drift. The customer is never consulted.

The open-source community — tens of thousands of engineers, researchers, and operators — already writes the code, benchmarks the models, builds the tools, and documents the failure modes faster than any single lab can absorb them. Closed labs race; the open-source ecosystem evolves.

**Akashik is how that ecosystem shares its knowledge.**

Ten thousand developers asking the same question ten thousand times a day. Ten thousand isolated 30-minute web searches. Same papers, same GitHub repos, same Stack Overflow threads, all re-derived alone, all billable. None of it accumulates. Each of us holds a shard of what's current — the regression we hit at 3 am and fixed, the library migration we finished Tuesday, the arXiv paper that dropped two hours ago, the CI config that broke after Node 25 shipped. None of that is in any frozen-weight model because it happened *after* training ended. Alone, those shards die when the session closes. Federated, they become the only live index of the field. Knowledge compounds across the community faster than any quarterly pre-training dump can keep up. Your Claude session starts from what ten thousand peers have already measured — not what a foundation model memorized six months ago.

Decentralized means the knowledge can't be revoked. When a lab gets acquired, sanctioned, or reorganized, your graph doesn't care. Your identity is a W3C `did:key` you own — the math on your keyring, not a row in someone else's user table. Shared memory carries signed envelopes verifiable offline in under 2 ms. Nobody emails support, because nobody operates "support."

The result: fewer tokens burned on repeated research, richer sessions every time a peer in your network learns something new, automatic propagation of best practices and current tools, context that stays fresh between pre-training cuts. The open-source movement open-sourced the code. **Akashik open-sources the knowledge graph itself.** That's the next step.

## The three pillars

**1. Each peer carries a shard of what's current — together, the live index.** Every Akashik instance is a libp2p peer. Rooms sync across peers via Y.js CRDT. A federated `ask --peers` fans a query across the network in parallel, 2-second per-peer timeout, results merged by cosine distance with per-peer attribution. The stranger who read that paper last Thursday, the peer who benchmarked that library two weeks ago, the dev who debugged that exact bug last night — their embeddings flow into your session. Nobody knows the whole graph; together the community does — the live state of the field, something no frozen-weight model can touch.

**2. Your identity is math you own.** W3C `did:key` over Ed25519 on first boot, BIP39 24-word recovery, hardware-authorized device keys. Every shared memory carries a signed envelope verifiable offline in under 2 ms. No registry, no resolver, no customer record to revoke. When the VC-funded memory category changes pricing, yours stays.

**3. Retrieval that's measured, not claimed.** 75.22% NDCG@10 on full BEIR SciFact (5,183 × 300) — 1.2 pts above published bge-base dense, 1.5 below GPU-only monoT5-3B. 13 separate algorithmic attacks nulled and documented, including a full gpt-oss:20b κ=0.7053 LLM-as-judge calibration audit that puts the instrument-corrected ceiling at ~81%. Every null is reproducible; the hard part of retrieval is knowing what you can't claim.

## The only knowledge layer that gets richer the more people use it

<p align="center">
  <img src="docs/memory-stack.png" alt="The same Claude session, two different Fridays — without vs with Akashik" width="920" />
</p>

**Same question. Same developer. Two different Fridays.**

Without Akashik, your Claude session starts empty every time. Claude browses ten URLs, burns forty-five thousand tokens, takes thirty seconds, returns an answer half a year stale, and dies with the tab. Ten thousand other people run the exact same loop the same day. None of it compounds.

With Akashik, the `PreToolUse` hook fires before Claude reaches for the web. Your graph — already holding every arXiv paper you've pulled, every repo you've starred, every past session you've had, plus every shard shared by every other peer running Akashik — answers in **11 ms**. Three hits across three rooms: a GitHub repo someone starred yesterday, a piece of community code you hadn't seen, an arXiv paper from two hours ago. Claude replies instantly from the community's latest state. When the session ends, your transcript is vector-indexed back into the graph so tomorrow's session starts richer than today's. And every peer on the network is doing the same — the ten-thousand-stranger loop runs **once**, not ten thousand times.

That's the compound. Every new contributor makes every existing session better. The graph is the only memory layer in the AI stack that goes the *other* direction: up and to the right, forever, at zero marginal cost.

**Sources for the canonical stack** this diagram contrasts against: Anthropic's [Claude Code best-practices doc](https://code.claude.com/docs/en/best-practices) and the 2026 community comparisons of mem0 / Zep / Letta / Engram / MemPalace / mcp-memory-service.

