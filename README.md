<p align="center">
  <img src="docs/logo.png" alt="wellinformed" width="400" />
</p>

<p align="center">
  <a href="https://github.com/SaharBarak/wellinformed/stargazers"><img src="https://img.shields.io/github/stars/SaharBarak/wellinformed?style=social" alt="Stars" /></a>&nbsp;
  <a href="https://github.com/SaharBarak/wellinformed/network/members"><img src="https://img.shields.io/github/forks/SaharBarak/wellinformed?style=social" alt="Forks" /></a>&nbsp;
  <a href="https://github.com/SaharBarak/wellinformed/watchers"><img src="https://img.shields.io/github/watchers/SaharBarak/wellinformed?style=social" alt="Watchers" /></a>
</p>

Your coding agent forgets everything you read between sessions. wellinformed gives it a memory — it fetches your research, indexes your codebase, and serves it through MCP so Claude answers from your sources, not its training data.

```
$ wellinformed ask "vector search sqlite"

## sqlite-vec                         (npm dep you installed last week)
   distance: 0.908 | source: npm://sqlite-vec

## vector-index.ts                    (your own code)
   distance: 1.021 | source: file://src/infrastructure/vector-index.ts

## Syntaqlite Playground              (Simon Willison blog post, April 2026)
   distance: 1.023 | source: simonwillison.net
```

One query. Three source types. Your code, your dependencies, and a blog post you read — all in one result.

## Install

```bash
git clone https://github.com/SaharBarak/wellinformed.git && cd wellinformed
npm install && bash scripts/bootstrap.sh
```

## Try it

```bash
wellinformed init                      # create a room, pick your sources
wellinformed trigger --room homelab    # fetch from ArXiv, HN, RSS, blogs, any URL
wellinformed index                     # index your codebase + deps + git
```

## Wire it into Claude Code (once, globally)

Register wellinformed as a **user-scoped MCP server** so every project gets it automatically — no `.mcp.json` per repo, no restart for each new project:

```bash
claude mcp add --scope user wellinformed -- wellinformed mcp
wellinformed claude install            # PreToolUse hook — Claude checks the graph first
```

After this, opening any project in Claude Code has `search`, `ask`, `get_node`, `get_neighbors`, `find_tunnels` available immediately. Claude checks your knowledge graph before every file search — no explicit ask needed.

> If you only want it in the current project, skip `--scope user` and a `.mcp.json` will be written locally instead.

## What it indexes

| Source | What you get |
|---|---|
| **ArXiv** | Papers matching your keywords, chunked and embedded |
| **Hacker News** | Stories via Algolia search |
| **RSS / Atom** | Any feed — blogs, newsletters, release notes, podcasts |
| **Any URL** | Article-extracted via Mozilla Readability |
| **Your .ts/.js files** | Exports, imports, doc comments per file |
| **package.json** | Every dependency with version, description, homepage |
| **Git history** | Recent commits with changed file lists |
| **Git submodules** | Remote URL, branch, HEAD SHA |
| **Discovery loop** | Recursively finds MORE sources from indexed content keywords |
| **X / Twitter** | Posts and threads via OAuth 2.0 (publish + ingest) |

**Research channels** — wellinformed also connects to the GitHub analytics ecosystem for tracking trends, competitors, and emerging tools:

| Channel | What it tracks |
|---|---|
| [star-history.com](https://www.star-history.com/) | Star trajectories over time |
| [Daily Stars Explorer](https://github.com/emanuelef/daily-stars-explorer) | Top daily star gainers |
| [OSS Insight](https://ossinsight.io) | Per-repo activity: commits, PRs, contributors |
| [Repohistory](https://github.com/repohistory/repohistory) | Historical star/fork/issue trends |
| [RepoBeats](https://repobeats.axiom.co/) | Contributor + PR activity analytics |
| [Gitstar Ranking](https://gitstar-ranking.com/) | Top repos by star count |
| [Ecosyste.ms Timeline](https://timeline.ecosyste.ms/) | Package release timelines across registries |

Source discovery suggests new feeds automatically from your room's keywords:

```bash
wellinformed discover --room homelab --auto
# → adds selfh.st RSS, ArXiv query, HN search — based on your keywords
```

## How Claude uses it

After `wellinformed claude install`, a PreToolUse hook fires before every Glob/Grep/Read. Claude sees:

> *"wellinformed: Knowledge graph exists (425 nodes). Consider using search, ask, get_node before searching raw files."*

Claude then calls the MCP tools instead of grepping. 15 tools available:

`search` · `ask` · `get_node` · `get_neighbors` · `find_tunnels` · `trigger_room` · `discover_loop` · `graph_stats` · `room_create` · `room_list` · `sources_list` · `federated_search` · `code_graph_query`

Works with **Claude Code** (auto-discovered), **Codex**, **OpenClaw**, and any MCP host.

## Rooms & tunnels

Rooms partition the graph. `homelab` doesn't see `fundraise`. Each room has its own sources and search scope.

**Tunnels** are the exception — when nodes in different rooms are semantically close, wellinformed flags them. A paper about embedding quantization in `ml-papers` connects to a memory issue in `homelab`. That connection is what rooms exist to produce.

## P2P distributed knowledge graph (v2.0)

Every wellinformed instance is a libp2p peer with a cryptographic identity. Rooms can be shared across peers via Y.js CRDT. Search runs federated across the network. mDNS auto-discovers peers on your LAN; NAT traversal via circuit-relay-v2 + dcutr + UPnP handles the public internet. All traffic is encrypted by libp2p Noise; peers authenticate via ed25519 during the handshake.

```bash
# peer identity + manual peer management (Phase 15)
wellinformed peer status                          # show your PeerId + public key
wellinformed peer add /ip4/1.2.3.4/tcp/9001      # connect to a remote peer
wellinformed peer list                            # known peers (--json for agents)

# share rooms via Y.js CRDT (Phase 16)
wellinformed share audit --room homelab           # see exactly what would be shared
wellinformed share room homelab                   # mark room as shared (audit-gated)
wellinformed unshare homelab                      # stop sharing (keeps local .ydoc)

# federated search (Phase 17)
wellinformed ask "proxmox GPU passthrough" --peers  # query across connected peers
```

**Security model** (Phase 15 + 17):
- `share audit` scans every node against **14 secret patterns** — API keys (OpenAI, GitHub, Stripe, AWS, Slack, Google), JWT-anchored bearer tokens, private key blocks, env vars — and hard-blocks the room if anything matches
- Shared nodes carry **only** metadata: `id`, `label`, `room`, `embedding_id`, `source_uri`, `fetched_at`. No raw text, no file paths, no file contents, and **no raw embedding vectors** (to prevent embedding-inversion attacks). Cross-peer semantic search re-embeds locally on the receiving side
- Inbound updates are symmetrically scanned — a malicious peer cannot push secrets into your graph
- Rate limiting (token bucket per peer) prevents query floods

**Y.js CRDT sync** (Phase 16): `share room X` creates a Y.Doc, pushes existing nodes, and the daemon syncs incremental updates to connected peers via a custom libp2p protocol. Offline peers catch up automatically via y-protocols sync step 1+2. Concurrent edits converge with zero conflict logic on your part.

**Federated search + discovery** (Phase 17): `ask --peers` embeds your query locally, fans out to connected peers with a 2s per-peer timeout, each runs sqlite-vec against its own shared-room vectors, results merge by cosine distance with `_source_peer` annotation. mDNS auto-discovers peers on your LAN. DHT wiring lands off-by-default for internet-wide discovery.

**Production networking** (Phase 18): libp2p circuit-relay-v2 + dcutr (direct connection upgrade via hole punching) + UPnP port forwarding handle NAT traversal. Application-layer bandwidth limiter caps per-peer-per-room updates. Passive connection health monitoring flags degraded peers without active probes. **10 simultaneous peers connect in-process in ~2.5s** (integration tested).

## Structured codebase indexing (v2.0, Phase 19)

Separate from the research graph, wellinformed parses codebases into a rich structured code graph via tree-sitter. Codebases are first-class aggregates attachable to rooms via a join table. Nothing mixes the research nodes and the code nodes — two distinct graphs, two distinct query surfaces.

```bash
wellinformed codebase index ~/work/my-app         # parse with tree-sitter (TS+JS+Python)
wellinformed codebase attach <id> --room homelab  # attach to a research room (M:N)
wellinformed codebase search "loadConfig"          # lexical search across attached codebases
wellinformed codebase list --json                  # machine-readable view with node counts
```

Schema captures: **file**, **module**, **class**, **interface**, **function**, **method**, **import**, **export**, **type_alias** (9 node kinds) with **contains**, **imports**, **extends**, **implements**, **calls** edges (5 kinds). Call graph resolution is best-effort with confidence levels (`exact` / `heuristic` / `unresolved`). Trivial pattern detection tags `Factory` / `Singleton` / `Observer` / `Builder` / `Adapter` classes. Stored in a separate SQLite file at `~/.wellinformed/code-graph.db` — wiping and re-indexing is safe without losing your research embeddings.

Claude queries the code graph via the new `code_graph_query` MCP tool, separate from `search`/`ask` which remain research-only.

## Discovery loop

```bash
wellinformed discover-loop --room homelab --max-iterations 3
# iteration 1: found 4 sources from room keywords
# iteration 2: found 2 more from extracted keywords ("VFIO", "iommu")
# iteration 3: found 0 new — converged
# total: 6 new sources, 42 new nodes
```

The discovery loop agent expands your sources recursively: discover feeds from keywords, index them, extract new keywords from the content, discover more. Converges when nothing new is found.

## Publish to X/Twitter

```bash
export X_CLIENT_ID="your_client_id"    # from developer.x.com
wellinformed publish auth              # OAuth 2.0 — opens browser
wellinformed publish preview           # see what would be posted
wellinformed publish launch            # post the launch thread
wellinformed publish tweet "text"      # post a single tweet
```

## Background daemon

```bash
wellinformed daemon start              # runs trigger on a schedule
wellinformed daemon status             # check if running
wellinformed report --room homelab     # see what's new
```

## Benchmarks — full BEIR v1, 4-wave SOTA progression (reproducible)

Real retrieval quality measured against canonical BEIR datasets using wellinformed's runtime pipeline. All numbers directly comparable to the [MTEB BEIR leaderboard](https://huggingface.co/spaces/mteb/leaderboard). Every wave below was independently measured on full-size datasets — including two wave-level failures (Waves 3 and 4) kept here for methodological honesty.

```
╔════════════════════════════════════════════════════════════════════╗
║  SOTA progression on BEIR SciFact (5,183 × 300)                    ║
╠════════════════════════════════════════════════════════════════════╣
║  Baseline  MiniLM-L6 dense only            NDCG@10  64.82%         ║
║  Wave 1  + nomic-embed-v1.5 (768d)         NDCG@10  69.98%  +5.16  ║
║  Wave 2  + BM25 FTS5 hybrid (RRF)          NDCG@10  72.30%  +2.32  ║
║  Wave 3  + bge-reranker-base  [FAILED]     NDCG@10  70.38%  -1.92  ║
║  Wave 4  + room-aware routing [NULL]       Δ≤0.34 NDCG on CQA 3/11 ║
╠════════════════════════════════════════════════════════════════════╣
║  Wave 2 is the measured CPU-local SOTA ceiling.                    ║
║  nomic-embed-text-v1.5 + SQLite FTS5 BM25 + RRF (k=60)             ║
║  137M params · 36 ms p50 total · zero new npm deps                 ║
╚════════════════════════════════════════════════════════════════════╝
```

### Wave 2 detail — BEIR SciFact (5,183 × 300)

| Metric | MiniLM (v1) | **Wave 2** | Lift |
|--------|-------------|------------|------|
| NDCG@10 | 64.82% | **72.30%** | +7.48 |
| MAP@10 | 59.57% | **67.66%** | +8.09 |
| Recall@5 | 74.84% | **79.76%** | +4.92 |
| Recall@10 | 79.53% | **84.79%** | +5.26 |
| MRR | 0.604 | **0.690** | +0.086 |
| Latency p50 | 3 ms | 36 ms | +33 ms |

Where 72.30% lands on the real leaderboard: within ~2 points of the strongest dense-only encoders at our parameter budget (bge-base-en-v1.5 = 74.0, E5-base-v2 = 73.1) and 4.4 points below GPU-required monoT5-3B reranker stacks (76.7). Competitive for a 137M CPU-local model with zero new dependencies.

### Waves 3 and 4 — honest disclosure of null / negative results

**Wave 3 (cross-encoder reranker) regressed quality.** Adding `Xenova/bge-reranker-base` over top-100 hybrid results dropped NDCG@10 from 72.30% → 70.38% and added 25.9 seconds of latency per query. Root cause (verified by `scripts/debug-reranker.mjs`): the reranker is MS MARCO-trained and rates genuinely-relevant scientific passages as *negative* (e.g. scores "calcium phosphate nanomaterials (0-D biomaterials)" at −0.83 for a 0-D biomaterials query). Generic rerankers require domain-matched training; none is CPU-friendly and SciFact-trained.

**Wave 4 (room-aware retrieval) produced a null result.** We hypothesized that wellinformed's user-curated "rooms" could be a retrieval scoring signal per the 2024-2025 literature (RouterRetriever, HippoRAG, LexBoost). The gate test: oracle routing on CQADupStack (3 subforums, 79k passages, 2,905 queries) — the upper bound that uses gold topic labels. Oracle beat flat hybrid by only **+0.34 NDCG@10 points**, well below the 3-point threshold. Flat hybrid already recovers the routing signal implicitly when room vocabularies are sufficiently disjoint. Rooms remain valuable for UX (namespaces), security (permissions), and discovery (tunnels for cross-domain serendipity) — but **not for retrieval quality**. A learned router can only approximate oracle, so it cannot cross the gate either.

Strategic conclusion: **Wave 2 at 72.30% is the measured CPU-local SOTA for wellinformed on standard BEIR retrieval.** Further engineering targets orthogonal value (UX, security, federated P2P, structured code graph, session persistence), not encoder stacking.

Reproduce:
```bash
# Wave 1 baseline (MiniLM)
node scripts/bench-beir.mjs scifact

# Wave 1 (nomic dense only)
node scripts/bench-beir.mjs scifact --model nomic-ai/nomic-embed-text-v1.5 --dim 768 \
  --doc-prefix "search_document: " --query-prefix "search_query: "

# Wave 2 (nomic + BM25 hybrid) — measured SOTA
node scripts/bench-beir-sota.mjs scifact --hybrid

# Wave 3 (add reranker) — regresses quality, kept for reproducibility
node scripts/bench-beir-sota.mjs scifact --hybrid --rerank

# Wave 4 (room routing gate test) — requires CQADupStack download
node scripts/bench-room-routing.mjs \
  --datasets-dir ~/.wellinformed/bench/cqadupstack/cqadupstack \
  --rooms mathematica,webmasters,gaming
```

See [`.planning/BENCH-v2.md`](.planning/BENCH-v2.md) for the full 4-wave writeup (root-cause analysis, per-room breakdowns, latency budgets, debug reproductions) and [`.planning/BENCH-COMPETITORS.md`](.planning/BENCH-COMPETITORS.md) for verified competitor landscape (mem0, Graphiti/Zep, Letta, Mastra, Engram, cognee, memobase, Honcho, MemPalace, mcp-memory-service).

## Real numbers

```
2700+ nodes │ 23 adapters │ 15 MCP tools │ 14 secret patterns │ 243 tests │ 5 phases shipped (v2.0)
```

<details>
<summary>Architecture (for contributors)</summary>

```
src/
  domain/           Pure types + functions, no I/O, Result monads (neverthrow)
                    graph · rooms · peer · sharing · codebase · errors · vectors
  infrastructure/   Ports + adapters — SQLite, ONNX, libp2p, tree-sitter
                    graph-repository · vector-index · peer-transport · peer-store
                    share-store · ydoc-store · share-sync · search-sync
                    bandwidth-limiter · connection-health · code-graph
                    tree-sitter-parser · sources/*
  application/      Use cases (ingest · discover · findTunnels · federated-search · codebase-indexer)
  daemon/           Tick loop + libp2p node lifecycle + share/search protocols
  mcp/              15 MCP tools over stdio
  cli/              Admin commands (peer · share · unshare · codebase · ask · etc.)
```

Functional DDD. Every fallible op returns `Result<T, E>`. No classes in domain/application. All deps verified via `gh api` + [ossinsight.io](https://ossinsight.io). 243 tests, zero regressions across 5 phases of v2.0.

**v2.0 phases shipped:**
1. Phase 15 — Peer Foundation + Security (libp2p ed25519 identity, 14-pattern secrets scanner, share audit)
2. Phase 16 — Room Sharing via Y.js CRDT (metadata-only replication, offline catchup)
3. Phase 17 — Federated Search + Discovery (cross-peer semantic search, mDNS, DHT wiring)
4. Phase 18 — Production Networking (NAT traversal, bandwidth management, health monitoring, 10-peer mesh verified)
5. Phase 19 — Structured Codebase Indexing (tree-sitter code graph, separate from research rooms, attachable via M:N)

</details>

## Star history

<a href="https://www.star-history.com/#SaharBarak/wellinformed&Date">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=SaharBarak/wellinformed&type=Date&theme=dark" />
    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=SaharBarak/wellinformed&type=Date" />
    <img alt="Star History" src="https://api.star-history.com/svg?repos=SaharBarak/wellinformed&type=Date" />
  </picture>
</a>

## Contributing

1. **New source adapters** — GitHub trending, Reddit, Telegram. One file each under `src/infrastructure/sources/`.
2. **Platform guides** — Tested setup for Cursor, Copilot, Gemini CLI.
3. **Worked examples** — Run it on a real corpus. Share what the graph surfaced.

We respond within 48 hours.

## License

MIT
