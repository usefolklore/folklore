# X/Twitter Launch Posts — Akashik

## Thread 1: Launch announcement

**Post 1 (hook):**
I built an MCP plugin that gives Claude Code a research memory.

It fetches from ArXiv, Hacker News, and RSS feeds. Indexes your codebase. Searches 154 nodes in under 100ms.

Your agent answers from YOUR sources, not training data.

Open source: github.com/SaharBarak/akashik

**Post 2 (demo):**
Here's what happens when Claude asks for context on vector search:

- sqlite-vec (your npm dep)
- vector-index.ts (your own code)
- Simon Willison's blog post about SQLite

Three source types. One query. No copy-paste.

**Post 3 (how it works):**
How it works:

1. `akashik init` — pick your research topics
2. `akashik trigger` — fetch from ArXiv, HN, RSS
3. `akashik index` — index your codebase
4. `akashik claude install` — hook into Claude Code

After step 4, Claude checks your graph before every file search. Automatically.

**Post 4 (differentiator):**
The key command is `akashik claude install`.

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

Akashik is different: it partitions by research domain (rooms), detects cross-domain connections (tunnels), and actively fetches from ArXiv + HN + RSS on a schedule.

It's a knowledge graph, not a vector store with a search box.

**Post 2:**
The tunnel detection is the interesting part.

You track "homelab" and "ml-papers" separately. When a paper about embedding quantization in ml-papers is semantically close to a memory issue in homelab, Akashik flags it.

Cross-domain insight. Automated.

**Post 3:**
I indexed Akashik's own codebase into its own graph.

55 TypeScript files, 14 npm deps, 11 git commits, 1 submodule.

Now when I search "vector search sqlite" I get my code, my deps, AND an external blog post. The graph connects them.

Self-referential RAG.

---

## Thread 3: Dev tools audience

**Post 1:**
If you use Claude Code, Codex, or OpenClaw, your agent has no memory of what you've been reading.

Akashik fixes that in 4 commands:

```
akashik init
akashik trigger --room homelab
akashik index
akashik claude install
```

Now Claude checks your research graph automatically.

**Post 2:**
The `discover` command suggests sources you didn't know about.

I typed `akashik discover --room akashik-dev --auto` and it found:
- selfh.st RSS (homelab feed)
- Simon Willison's blog (matched "claude" keyword)
- Papers With Code (matched "embeddings")

Keyword-driven source expansion.

---

## Standalone posts

**Short post 1:**
Your AI coding agent reads 0 of the 50 articles you read this week.

Akashik changes that.

github.com/SaharBarak/akashik

**Short post 2:**
Every AI memory tool is key-value or markdown files.

Akashik is a knowledge graph with rooms, tunnels, 8 source adapters, and a daemon that keeps it current.

Open source. Runs locally. No API keys.

**Short post 3:**
I used github star-history, ossinsight, and gitstar-ranking to verify every dependency before selecting it.

Then I built a tool that does the same thing automatically for your research.

The meta is strong with this one.

github.com/SaharBarak/akashik
