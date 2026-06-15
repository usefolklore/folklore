# X/Twitter Launch Posts — Folklore

## Thread 1: Launch announcement

**Post 1 (hook):**
I built an MCP plugin that gives Claude Code a research memory.

It fetches from ArXiv, Hacker News, and RSS feeds. Indexes your codebase. Searches 154 nodes in under 100ms.

Your agent answers from YOUR sources, not training data.

Open source: github.com/SaharBarak/folklore

**Post 2 (demo):**
Here's what happens when Claude asks for context on vector search:

- sqlite-vec (your npm dep)
- vector-index.ts (your own code)
- Simon Willison's blog post about SQLite

Three source types. One query. No copy-paste.

**Post 3 (how it works):**
How it works:

1. `folklore init` — pick your research topics
2. `folklore trigger` — fetch from ArXiv, HN, RSS
3. `folklore index` — index your codebase
4. `folklore claude install` — hook into Claude Code

After step 4, Claude checks your graph before every file search. Automatically.

**Post 4 (differentiator):**
The key command is `folklore claude install`.

It adds a PreToolUse hook that fires before every Glob/Grep/Read. Claude sees "knowledge graph exists (425 nodes)" and uses MCP tools instead of grepping.

No other agent memory tool does this.

**Post 5 (technical):**
Built with:
- neverthrow Result monads (no throws in domain layer)
- sqlite-vec for vector search
- all-MiniLM-L6-v2 ONNX embeddings (local, no API)
- 8 source adapters (ArXiv, HN, RSS, URL, codebase, deps, git, submodules)
- 11 MCP tools over stdio
- 27 tests, functional DDD

All deps verified via gh API + ossinsight.io before selection.

---

## Thread 2: AI/ML audience

**Post 1:**
RAG is usually "embed your docs, hope for the best."

Folklore is different: every contribution is signed by its curator's verified GitHub identity, lives on the curator's own peer, and federates on demand to anyone running the same protocol.

It's a knowledge graph that compounds across the community, not a vector store with a search box.

**Post 2:**
The federation is the interesting part.

You ask. Your local graph answers first. If it can't, folklore asks every connected peer in your `peers.json` — whatever they've curated flows back signed by them, with their sources attached.

You inherit their work in milliseconds. Cost: zero web fetches, zero tokens.

**Post 3:**
I indexed folklore's own codebase into its own graph.

55 TypeScript files, 14 npm deps, 11 git commits, 1 submodule.

Now when I search "vector search sqlite" I get my code, my deps, AND a paper a teammate read last week — signed by them.

Self-referential RAG with attribution.

---

## Thread 3: Dev tools audience

**Post 1:**
If you use Claude Code, Codex, Gemini, Hermes, or OpenClaw, your agent has no memory of what your team has been reading.

Folklore fixes that in 4 commands:

```
folklore onboard
folklore login           # link your verified GitHub identity
folklore this            # index the current repo into your graph
folklore claude install  # hook into Claude Code automatically
```

Now Claude checks your local graph + your peers' graphs before every WebSearch.

**Post 2:**
Every WebSearch your agent makes goes through folklore first.

If your graph (or a peer's graph) has the answer with satisfaction ≥ 0.85 and ≥ 2 hits, the WebSearch is denied — your agent uses the cached answer instead.

If not, the web call proceeds, and the result lands in your graph signed by you. Next contributor who asks something similar pulls it from your peer.

Zero behaviour change. Token cost: down. Compounding: on.

---

## Standalone posts

**Short post 1:**
Your AI coding agent reads 0 of the 50 articles you read this week.

Folklore changes that.

github.com/SaharBarak/folklore

**Short post 2:**
Every AI memory tool is single-user and gets stranded on someone's laptop.

Folklore is a peer-to-peer knowledge graph. Every contribution is signed by its curator's verified GitHub identity, locally owned, and federated on demand — so one peer's research compounds for the whole network.

Open source. Runs locally. No API keys. No central server.

**Short post 3:**
I used github star-history, ossinsight, and gitstar-ranking to verify every dependency before selecting it.

Then I built a tool that does the same thing automatically for your research.

The meta is strong with this one.

github.com/SaharBarak/folklore
