<p align="center">
  <img src="docs/logo.png" alt="wellinformed" width="400" />
</p>

<p align="center">
  <a href="https://github.com/SaharBarak/wellinformed/stargazers"><img src="https://img.shields.io/github/stars/SaharBarak/wellinformed?style=social" alt="Stars" /></a>&nbsp;
  <a href="https://github.com/SaharBarak/wellinformed/network/members"><img src="https://img.shields.io/github/forks/SaharBarak/wellinformed?style=social" alt="Forks" /></a>&nbsp;
  <a href="https://github.com/SaharBarak/wellinformed/watchers"><img src="https://img.shields.io/github/watchers/SaharBarak/wellinformed?style=social" alt="Watchers" /></a>
</p>

<p align="center">
  <img src="demo/scene-claude.gif" alt="Side-by-side: Claude alone (web search, ~14 s, generic) vs Claude + wellinformed (hook injection, ~1.5 s, cited)" width="880" />
</p>

<p align="center">
  <em>Same prompt. Same model. The only difference is the wellinformed PreToolUse hook.</em>
</p>

> **wellinformed is the only way to accumulate, share, and stream knowledge seamlessly into your LLM work sessions.**

**A peer-to-peer shared knowledge network that enables continuous shared learning across machines.** Every one of us holds a shard of knowledge; together, we create knowledge planes — always up-to-date, everlasting, globally accessible, at lightning speed. **No servers. No subscriptions.** Before your coding agent burns 30 minutes on the same web search someone in the community already did this morning, it asks the network — your code, your dependencies, your research, every peer's graph — all federated over libp2p with a cryptographic identity you own. Local-first. CPU-only. Zero cloud, zero telemetry.

```
$ wellinformed ask "vector search sqlite" --k 3

## vearch/vearch (2,297★)            (GitHub repo your peer starred)
   distance: 0.961 | room: wellinformed-dev

## packages/vectordb/store.go         (your own code)
   distance: 1.090 | room: auto-tlv

## CLAUDE.md project instructions     (your research notes)
   distance: 1.173 | room: auto-tlv
```

One query. Three rooms. A starred GitHub repo, your Go source, and your own Claude-session notes — all retrieved in 970 ms, CPU-only, no network call.

<p align="center">
  <b>75.22% NDCG@10 on BEIR SciFact</b> &nbsp;·&nbsp; CPU-only &nbsp;·&nbsp; 11 ms p50 &nbsp;·&nbsp;
  <b>13 documented null attacks</b> &nbsp;·&nbsp; W3C did:key identity &nbsp;·&nbsp; libp2p federation &nbsp;·&nbsp; MIT
</p>

## See it in action

| | |
|---|---|
| <img src="demo/scene-prompt-hook.gif" alt="UserPromptSubmit hook — answer arrives before Claude reads the message" width="420" /> | **The hook fires BEFORE the LLM reads your message.** UserPromptSubmit + wellinformed = retrieval at prompt time. Claude has the answer with citations *before* it considers a tool call. |
| <img src="demo/timing.gif" alt="headline timing teaser" width="420" /> | **Direct query, sub-second.** 15 cryogenic-LH2 research notes, cold cache. Real `time` measurement. |
| <img src="demo/scene-codebase.gif" alt="codebase Q&A" width="420" /> | **Codebase Q&A.** `claude -p` cites `src/daemon/job-queue.ts` directly via the wellinformed PreToolUse hook. |
| <img src="demo/scene-touch.gif" alt="P2P touch — 5-peer mesh" width="420" /> | **P2P touch.** 5 daemons on 127.0.0.1; peer A pulls exclusive notes from peers B and D, attribution preserved. |
| <img src="demo/screencast.gif" alt="full screencast" width="420" /> | **Full tour.** Agent contract, semantic search, entity recall, peer reputation table. |

Reproduce locally — every gif in `demo/` is a real recording, not a mock-up. See `demo/README.md` for the one-shot setup script and the [shooting manuscript](demo/MANUSCRIPT.md).

## Why wellinformed exists

The frontier-model economy isn't sustainable, and everyone paying attention knows it. Compute costs climb. Training runs burn hundreds of millions. Investors want returns. Governments want levers — a US administration can decide tomorrow that an AI lab is strategic infrastructure and reshape its trajectory with a phone call. When that happens your workflow's weather changes overnight: prices hike, models deprecate, weights get silently swapped, terms tighten, behaviors drift. The customer is never consulted.

The open-source community — tens of thousands of engineers, researchers, and operators — already writes the code, benchmarks the models, builds the tools, and documents the failure modes faster than any single lab can absorb them. Closed labs race; the open-source ecosystem evolves.

**wellinformed is how that ecosystem shares its knowledge.**

Ten thousand developers asking the same question ten thousand times a day. Ten thousand isolated 30-minute web searches. Same papers, same GitHub repos, same Stack Overflow threads, all re-derived alone, all billable. None of it accumulates. Each of us holds a shard of what's current — the regression we hit at 3 am and fixed, the library migration we finished Tuesday, the arXiv paper that dropped two hours ago, the CI config that broke after Node 25 shipped. None of that is in any frozen-weight model because it happened *after* training ended. Alone, those shards die when the session closes. Federated, they become the only live index of the field. Knowledge compounds across the community faster than any quarterly pre-training dump can keep up. Your Claude session starts from what ten thousand peers have already measured — not what a foundation model memorized six months ago.

Decentralized means the knowledge can't be revoked. When a lab gets acquired, sanctioned, or reorganized, your graph doesn't care. Your identity is a W3C `did:key` you own — the math on your keyring, not a row in someone else's user table. Shared memory carries signed envelopes verifiable offline in under 2 ms. Nobody emails support, because nobody operates "support."

The result: fewer tokens burned on repeated research, richer sessions every time a peer in your network learns something new, automatic propagation of best practices and current tools, context that stays fresh between pre-training cuts. The open-source movement open-sourced the code. **wellinformed open-sources the knowledge graph itself.** That's the next step.

## The three pillars

**1. Each peer carries a shard of what's current — together, the live index.** Every wellinformed instance is a libp2p peer. Rooms sync across peers via Y.js CRDT. A federated `ask --peers` fans a query across the network in parallel, 2-second per-peer timeout, results merged by cosine distance with per-peer attribution. The stranger who read that paper last Thursday, the peer who benchmarked that library two weeks ago, the dev who debugged that exact bug last night — their embeddings flow into your session. Nobody knows the whole graph; together the community does — the live state of the field, something no frozen-weight model can touch.

**2. Your identity is math you own.** W3C `did:key` over Ed25519 on first boot, BIP39 24-word recovery, hardware-authorized device keys. Every shared memory carries a signed envelope verifiable offline in under 2 ms. No registry, no resolver, no customer record to revoke. When the VC-funded memory category changes pricing, yours stays.

**3. Retrieval that's measured, not claimed.** 75.22% NDCG@10 on full BEIR SciFact (5,183 × 300) — 1.2 pts above published bge-base dense, 1.5 below GPU-only monoT5-3B. 13 separate algorithmic attacks nulled and documented, including a full gpt-oss:20b κ=0.7053 LLM-as-judge calibration audit that puts the instrument-corrected ceiling at ~81%. Every null is reproducible; the hard part of retrieval is knowing what you can't claim.

## The only knowledge layer that gets richer the more people use it

<p align="center">
  <img src="docs/memory-stack.png" alt="The same Claude session, two different Fridays — without vs with wellinformed" width="920" />
</p>

**Same question. Same developer. Two different Fridays.**

Without wellinformed, your Claude session starts empty every time. Claude browses ten URLs, burns forty-five thousand tokens, takes thirty seconds, returns an answer half a year stale, and dies with the tab. Ten thousand other people run the exact same loop the same day. None of it compounds.

With wellinformed, the `PreToolUse` hook fires before Claude reaches for the web. Your graph — already holding every arXiv paper you've pulled, every repo you've starred, every past session you've had, plus every shard shared by every other peer running wellinformed — answers in **11 ms**. Three hits across three rooms: a GitHub repo someone starred yesterday, a piece of community code you hadn't seen, an arXiv paper from two hours ago. Claude replies instantly from the community's latest state. When the session ends, your transcript is vector-indexed back into the graph so tomorrow's session starts richer than today's. And every peer on the network is doing the same — the ten-thousand-stranger loop runs **once**, not ten thousand times.

That's the compound. Every new contributor makes every existing session better. The graph is the only memory layer in the AI stack that goes the *other* direction: up and to the right, forever, at zero marginal cost.

**Sources for the canonical stack** this diagram contrasts against: Anthropic's [Claude Code best-practices doc](https://code.claude.com/docs/en/best-practices) and the 2026 community comparisons of mem0 / Zep / Letta / Engram / MemPalace / mcp-memory-service.

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

Claude then calls the MCP tools instead of grepping. 21 tools available:

`search` · `ask` · `get_node` · `get_neighbors` · `find_tunnels` · `trigger_room` · `discover_loop` · `graph_stats` · `room_create` · `room_list` · `sources_list` · `federated_search` · `code_graph_query` · `recent_sessions` · `deep_search` · `oracle_ask` · `oracle_answer` · `list_open_questions` · `oracle_answers` · `oracle_answerable`

The v2.1 hook layer goes further: before every Grep/Glob/Read/WebSearch/WebFetch, a PreToolUse hook runs `wellinformed ask --json` on the extracted query and injects the top-3 hits into Claude's context. On a miss, the query is logged for later ingest. After every WebSearch/WebFetch, a PostToolUse hook auto-saves the result as a `source` node in the always-on `research` system room so the next session finds it via the graph instead of the network.

Works with **Claude Code** (auto-discovered), **Codex**, **OpenClaw**, and any MCP host.

## Rooms & tunnels

Rooms partition the graph. `homelab` doesn't see `fundraise`. Each room has its own sources and search scope. There are three layers:

- **Three always-on system rooms** — `toolshed` / `research` / `oracle` advertised out of the box by every peer, with virtual membership derived from node `source_uri` scheme (see below).
- **One room per repo** — when you `wellinformed index` a codebase (or Claude Code opens one), wellinformed provisions a dedicated room for it. The repo name becomes the room id — `my-app`, `auto-tlv`, `wellinformed-dev` — and its embeddings, commits, and docs stay scoped to that room. Switching projects switches rooms automatically; queries stay relevant to the repo you're in without cross-contamination.
- **Custom rooms** — anything you create yourself (`homelab`, `fundraise`, `reading-list`, etc.). Full control over sources, sharing, and retention.

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

## System rooms + oracle bulletin board (v2.1)

Every wellinformed peer advertises **three always-on system rooms** out of the box. No opt-in, no manual sharing — every peer can touch them immediately:

| System room | What it contains | Stale-after |
|---|---|---|
| `toolshed` | codebase, skills, MCP tools, deps, git history — "what this peer can do" | 30 days |
| `research` | arxiv, hn, rss, web searches, web fetches, telegram — "what this peer has read" | 7 days |
| `oracle` | Q&A bulletin board — questions + answers propagate via touch + CRDT | 14 days |

Membership is **virtual** — derived from each node's `source_uri` scheme, not from its physical `room` field. A git commit tagged `room: wellinformed-dev` still shows up in `toolshed` for peers. User-chosen rooms stay intact; system rooms are an additional query-time lens.

**Data aging:** every graph hit now surfaces `fetched_at` + numeric `age_days`. The prefetch hook renders compact age tags inline: `label [research, 3d] d=0.82`. If a hit is older than the room's `staleAfterDays` window, Claude prefers a fresh pull over the cache. The trust boundary (remote-node-validator) **requires** `fetched_at` on every inbound node — a node with no timestamp is indistinguishable from a node forged ten years ago and gets rejected.

**Opt-out** for sensitive rooms: mark them `shareable: false` in `shared-rooms.json` (or via the interactive picker below) and nodes in them are excluded from system-room virtual membership.

```bash
wellinformed share ui                             # interactive toggle list
                                                  # (zero-dep ANSI; system rooms are never shown)
```

### Oracle — peer-to-peer Q&A at zero protocol cost

The oracle bulletin board (Layer A of peer discovery) reuses the existing `touch` + CRDT surface. No new wire protocol, no new rate limiter.

```bash
wellinformed oracle ask "how do I wire prefetch hooks without adding a dep?"
# → node oracle-question:<uuid> lands in your graph, room=oracle
# → any peer touches `oracle` on next cycle, receives it

wellinformed oracle answerable                    # what can your graph plausibly answer?
wellinformed oracle answer <qid> "use raw ANSI + setRawMode" --confidence 0.85
wellinformed oracle show <qid>                    # confidence-ranked answers
```

**Layer B — live oracle queries via libp2p pubsub:**

```bash
wellinformed oracle ask "..." --live              # publishes over pubsub for real-time fan-out
wellinformed oracle answer <qid> "..." --live     # live response path
wellinformed daemon start                         # daemon subscribes at boot and upserts
                                                  # inbound questions/answers in real-time
```

Layer A (touch, seconds to minutes) and Layer B (pubsub, sub-second) use the same node shape and validator, so they compose cleanly. Layer A is the durable backing store; Layer B is the fast path when both sides are online.

`@libp2p/floodsub` ships Layer B today; gossipsub's latest still targets libp2p/interface v2 while wellinformed runs v3 — the service API is identical so a future swap is a one-line change.

### Save distilled insights

Beyond raw ingest, `wellinformed save` files typed notes (synthesis / concept / decision / source) that outlive chat transcripts. Ported from [claude-obsidian](https://github.com/AgriciDaniel/claude-obsidian) — reused for the Q&A distillation flow.

```bash
wellinformed save --room project --type synthesis --label "Touch primitive" \
  --text "Asymmetric P2P pull replacing symmetric Y.js intersection rule"
echo "body..." | wellinformed save --room project --type concept --label "RNG tunnels"
```

Saved nodes are both vector-embedded and BM25-indexed so they surface from `ask` / `search` immediately.

## Decentralized identity — your keypair, not someone's customer record (v2.1, DID wave)

Every wellinformed install provisions a W3C `did:key` on first boot. Ed25519 keypair, 32-byte pubkey, base58btc-encoded with the `0xed01` multicodec prefix per the [did:key spec](https://w3c-ccg.github.io/did-method-key/). The user DID is long-lived and survives device changes; a device key is authorized by the user DID via a signed tuple `(device_id, device_pub, authorized_at)` so individual devices can be rotated without losing identity.

```bash
wellinformed identity show           # prints your user DID + authorized devices
wellinformed identity rotate         # new device key, same user DID, old device revoked
wellinformed identity export         # BIP39 mnemonic recovery phrase
wellinformed identity import         # restore from recovery phrase on a new machine
```

**Signed envelopes at the wire** — any outbound node (memory entry, oracle answer, room share) can be wrapped with a device signature + the device-authorization chain. Receivers verify the whole chain **offline, in under 2 ms, three Ed25519 checks**. No DID resolver, no registry lookup, no network call. Domain-separation tags (`wellinformed-auth:v1:` vs `wellinformed-sig:v1:`) prevent replay of authorization signatures as payload signatures.

**Canonical JSON** — signatures are over key-sorted, deterministic JSON encoding so the same payload produces byte-identical bytes across Node versions, architectures, and runtimes. Pure Node `crypto` primitives (PKCS8/SPKI DER paths), zero new crypto deps, 38 tests passing across three test files.

```
src/domain/identity.ts             641 lines of pure domain — codec + keys + envelope + verify
src/infrastructure/identity-store.ts  encrypted-at-rest seed + JSON public bundle
src/application/identity-lifecycle.ts ensure / rotate / export / import — the lifecycle ops
src/application/identity-bridge.ts    envelope wrapping for share-sync, oracle, session capture
```

**Why this matters:** the VC-funded AI memory category holds your identity in their user table. When they change pricing, when they get acquired, when they revoke your account — they take your identity with them. wellinformed's identity is math you already own; no intermediary to revoke it.

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

## Benchmarks — full BEIR v1, Phase 25 SOTA + 13 documented null attacks

Real retrieval quality measured against canonical BEIR datasets using wellinformed's runtime pipeline. All numbers directly comparable to the [MTEB BEIR leaderboard](https://huggingface.co/spaces/mteb/leaderboard).

```
╔═══════════════════════════════════════════════════════════════════════╗
║  BEIR SciFact (5,183 × 300) — progression                             ║
╠═══════════════════════════════════════════════════════════════════════╣
║  Baseline  MiniLM-L6 dense only               NDCG@10  64.82%         ║
║  Wave 1  + nomic-embed-v1.5 (768d, Xenova)    NDCG@10  69.98%  +5.16  ║
║  Wave 2  + BM25 FTS5 hybrid (RRF k=60)        NDCG@10  72.30%  +2.32  ║
║  Phase 25  Rust bge-base sidecar + hybrid     NDCG@10  75.22%  +2.92  ║
║  Calibrated  gpt-oss:20b judge (κ=0.7053)     NDCG@10 ~81.06%  +5.84  ║
╠═══════════════════════════════════════════════════════════════════════╣
║  Phase 25 is the measured CPU-local ceiling on standard qrels.        ║
║  bge-base-en-v1.5 (Rust fastembed) + FTS5 BM25 + RRF (k=60)           ║
║  137M params · 11 ms p50 end-to-end · zero GPU · zero cloud           ║
╚═══════════════════════════════════════════════════════════════════════╝
```

### Phase 25 detail — where 75.22% lands on the leaderboard

| Model | Params | SciFact NDCG@10 | Runtime |
|-------|--------|-----------------|---------|
| BM25 (Anserini) | — | 66.5% | CPU |
| all-MiniLM-L6-v2 (v1 baseline) | 23M | 64.82% | CPU |
| nomic-embed-text-v1.5 (dense) | 137M | 70.36% | CPU |
| bge-base-en-v1.5 (dense) | 110M | 74.04% | CPU |
| **wellinformed Phase 25 (hybrid + Rust)** | **137M** | **75.22%** | **CPU, 11ms p50** |
| monoT5-3B reranker on top | 3B | 76.70% | **GPU** |
| InRanker-3B (monoT5-distilled) | 3B | 78.31% | **GPU** |

**+1.18 NDCG@10 over published bge-base dense**, 1.5 NDCG below monoT5-3B while requiring no GPU. On **calibrated qrels** (gpt-oss:20b LLM-as-judge audit, κ=0.7053 substantial-agreement per Landis-Koch 1977, 100% precision over 129 controls) the instrument-corrected ceiling is ~81% on a 50-query subset — confirming the standard-qrel ceiling is measurement-floor-bound, not pipeline-ceiling-bound.

### 13 null attacks — what didn't work (all measured, all reproducible)

| Round | Attack | Δ NDCG@10 | Verdict |
|---|---|---:|---|
| Wave 3 | `bge-reranker-base` cross-encoder | **−1.92** | MS-MARCO domain mismatch on scientific text |
| Wave 4 | oracle room routing on CQADupStack | +0.34 | below 3pt gate — disjoint vocab already implicit |
| §2i | PPR rerank over doc-doc kNN | **−23.76** | single-hop diffusion leaks mass off gold |
| §2k-1 | RRF (k, α) parameter sweep | +0.17 | train-fold overfit, held-out null |
| §2k-2 | Rocchio dense PRF (m=5, α=0.7) | **−0.19** | encoder ceiling — no vocab gap at top-5 |
| §2k-3 | Qwen2.5:0.5B Contextual Retrieval | −1.46 | small LLM adds lexical noise |
| §2k-4 | Qwen2.5:3B Contextual Retrieval | −0.06 | 6× params, no signal gain |
| §2L-1 | ArguAna dense-only retarget | +1.45 | soft (gate was +5pt) |
| §2L-2 | Diagonal Jacobi preconditioning | **−0.77** | refutes "can't regress" claim |
| §2L-3 | qrel rejudge V1 (Qwen2.5:3B naive) | — | κ=0.418 (FAIL 0.6 gate) |
| §2L-4 | qrel rejudge V2 (4-shot + CoT) | — | κ=0.458 (FAIL 0.6 gate) |
| Round 3 V3 | qrel rejudge V3 (gpt-oss:20b) | +2.53 | **κ=0.7053 PASSES gate** — 2.8% qrel FN rate measured |
| Round 5 | InRanker-base stacked on hybrid top-50 | **−13.72** | in-domain training not enough — strong hybrid + pointwise rerank destroys precision |

Every null is accompanied by a reproduction script in [`scripts/`](scripts/) and a mechanistic explanation in [`.planning/BENCH-v2.md`](.planning/BENCH-v2.md). **Documented null > hypothetical positive.**

### Reproduce

```bash
# Phase 25 headline — requires Rust sidecar built
cd wellinformed-rs && cargo build --release && cd ..
WELLINFORMED_RUST_BIN=$(pwd)/wellinformed-rs/target/release/embed_server \
  node scripts/bench-beir-rust.mjs scifact --model bge-base

# Wave 2 (pure Node, no Rust)
node scripts/bench-beir-sota.mjs scifact --hybrid

# Wave 3 / reranker null — reproduces the −1.92pt regression
node scripts/bench-beir-sota.mjs scifact --hybrid --rerank

# Wave 4 / room routing null — requires CQADupStack
node scripts/bench-room-routing.mjs \
  --datasets-dir ~/.wellinformed/bench/cqadupstack/cqadupstack \
  --rooms mathematica,webmasters,gaming

# Calibrated qrel rejudge — requires Ollama + gpt-oss:20b
node scripts/qrel-rejudge.mjs 100 20
```

See [`.planning/BENCH-v2.md`](.planning/BENCH-v2.md) for the full attack archive (root-cause analysis, per-query bucket distributions, specialist post-mortems across 4 agent rounds) and [`.planning/BENCH-COMPETITORS.md`](.planning/BENCH-COMPETITORS.md) for verified competitor landscape (mem0, Graphiti/Zep, Letta, Mastra, Engram, cognee, memobase, Honcho, MemPalace, mcp-memory-service).

## Real numbers

```
75.22% NDCG@10 ┃ 11 ms p50 ┃ 48× vector compression ┃ 91.9% cross-model bridge
13 null attacks ┃ κ=0.7053 qrel audit ┃ 6.29× session consolidation
21 MCP tools ┃ 23 adapters ┃ 14 secret patterns ┃ 396 tests ┃ v4.0-rc1
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
  mcp/              21 MCP tools over stdio
  cli/              Admin commands (peer · share · unshare · codebase · ask ·
                    oracle · save · hot · lint · etc.)
```

Functional DDD. Every fallible op returns `Result<T, E>`. No classes in domain/application. All deps verified via `gh api` + [ossinsight.io](https://ossinsight.io). 396 tests, zero regressions across v2.0 + v2.1.

**v2.0 phases shipped:**
1. Phase 15 — Peer Foundation + Security (libp2p ed25519 identity, 14-pattern secrets scanner, share audit)
2. Phase 16 — Room Sharing via Y.js CRDT (metadata-only replication, offline catchup)
3. Phase 17 — Federated Search + Discovery (cross-peer semantic search, mDNS, DHT wiring)
4. Phase 18 — Production Networking (NAT traversal, bandwidth management, health monitoring, 10-peer mesh verified)
5. Phase 19 — Structured Codebase Indexing (tree-sitter code graph, separate from research rooms, attachable via M:N)
6. Phase 20 — Session capture + 16th MCP tool (recent_sessions rollup, always-local room)

**v2.1 waves shipped:**
7. Phase 24–25 — Rust embed_server + bge-base via fastembed-rs (75.22% SciFact NDCG@10, +11.9 over Xenova)
8. Phase 31–35 — Remote-node validator at trust boundary + real two-peer touch E2E (caught the silent `git://` drop bug)
9. Phase 32–34 — Hot-cache recency digest + graph-lint (8 hygiene rules + P2P drift) + save (typed distillation notes)
10. Phase 36 — **System rooms** (toolshed + research + oracle, always-on, age-aware, virtual membership)
11. Phase 37 — Interactive share picker (zero-dep ANSI TUI)
12. Phase 38 — **Oracle bulletin board** (Layer A: questions + answers via touch + CRDT, 5 MCP tools)
13. Phase 39 — **Oracle gossip** (Layer B: real-time pubsub via @libp2p/floodsub, daemon subscribes on boot)

</details>

## Vision — the agent-memory protocol problem

wellinformed is not a vector store with peer sync bolted on. It is an attempt
at the protocol that decides whether peer knowledge is good enough for an
agent to trust, cite, or use *instead of* a live web search. The product
question:

> When a peer returns knowledge, how do we know it is satisfactory enough to
> stop the agent from searching the web?

If that question is weak, the whole P2P story is vibes — sometimes helpful,
sometimes stale, sometimes wrong, impossible to defend. If it's strong,
wellinformed becomes a serious agent-memory protocol. Full thinking surface
(60+ pages, evolving) in
[`docs/PROTOCOL-QUALITY-QUESTIONS.md`](./docs/PROTOCOL-QUALITY-QUESTIONS.md).

### The humanity-level bottleneck

Agent systems are stuck on one thing right now:

> Agents can act faster than humans can verify, but they do not yet know when
> their context is sufficient.

The failure mode is not only hallucination. It's **premature closure** — an
agent sees a plausible chunk, forms a plan, and stops searching before it has
the missing fact that would change the action. wellinformed treats this as a
protocol problem, not a model problem:

- Context is not evidence.
- Relevance is not sufficiency.
- Consensus is not independence.
- Freshness is not correctness.
- Confidence is not calibration.
- A memory is not a source unless it carries provenance.
- A source is not an answer unless it resolves the task.

### The decision the protocol must make

Every query needs an explicit breakpoint, not a top-k chunk list. There are
six possible decisions and six kinds of breakpoint that produce them:

| Decision                          | Breakpoint type | Trigger                                                      |
| --------------------------------- | --------------- | ------------------------------------------------------------ |
| Use local / peer memory           | **Stop**        | Enough independent evidence covers every required fact.      |
| Search only the missing facts     | **Continue**    | Partial coverage — agent knows what's still missing.         |
| Refresh the source                | **Refetch**     | Right source, may be stale.                                  |
| Verify against another peer/oracle| **Consensus**   | Multiple answers, independence not yet proven.               |
| Force live verification           | **Risk**        | High-risk task — peer memory cannot be final.                |
| Ask the user                      | **Ambiguity**   | Query underspecified; more retrieval won't fix it.           |

A possible scorer:

```
satisfaction =
    retrieval_quality
  + source_quality
  + freshness_quality
  + peer_trust
  + consensus
  + task_fit
  - risk_penalty
  - staleness_penalty
  - missing_metadata_penalty
```

| Score        | Default behavior                                  |
| ------------ | ------------------------------------------------- |
| ≥ 0.85       | Use peer/local memory; no live search             |
| 0.65 – 0.85  | Use memory, verify one source                     |
| 0.40 – 0.65  | Show memory as hints; perform live search         |
| < 0.40       | Cache miss — search or ask the oracle room        |

Numbers are placeholders. The point is the breakpoint is **explicit and
measurable**, not an emergent property of cosine distance.

### Coverage map > top-k

Instead of returning ranked chunks, the daemon should return a coverage map:

```json
{
  "query": "upgrade libp2p dcutr setup for Node 24",
  "required_facts": [
    "current libp2p version",
    "Node 24 compatibility",
    "dcutr config changes",
    "known breaking changes",
    "local repo usage"
  ],
  "covered": [
    { "fact": "local repo usage", "evidence": ["node:codebase:peer-transport.ts"], "confidence": 0.91 },
    { "fact": "known breaking changes", "evidence": ["peer:alice:release-note-summary"], "confidence": 0.62 }
  ],
  "missing": [
    { "fact": "current libp2p version", "recommended_action": "package_registry_fetch" },
    { "fact": "Node 24 compatibility", "recommended_action": "live_search" }
  ],
  "decision": "search_required"
}
```

This is brighter than top-k because it tells the agent **why** it should keep
searching, and **what to search for**. "Search the web" is too crude — there
are many escalation moves: official docs, exact source URI, package registry,
GitHub releases, local git history, peer oracle, run a local command, run a
benchmark, ask a human. The protocol should recommend the next-best action,
not a binary `search_required: true`.

### The agent contract

Every response should expose an explicit contract to the agent — more useful
than prose context because it gives a decision boundary:

```txt
I found evidence for X.
I did not find evidence for Y.
This is fresh enough because Z.
This is risky because W.
My recommendation: use memory / verify source / search / ask user.
```

### Conflict is more informative than agreement

If two peers disagree, that is often more valuable than a single smooth
answer. The protocol should return contradictions explicitly:

```json
{ "conflicts": [ {
  "claim": "libp2p dcutr works on Node 24",
  "supporting_evidence":   ["peer:a:session-2026-04-20"],
  "contradicting_evidence":["peer:b:release-note-2026-04-24"],
  "recommended_action": "verify_primary_source"
} ] }
```

### Many peers means data treatment, not just retrieval

At small scale, peer search feels like asking a few friends. At network scale
it is a data-processing problem. The system will receive duplicate memories,
near-duplicate summaries, stale once-current sources, contradictory claims,
weak LLM summaries, poisoned spam, lived measurements from unknown peers,
mixed source schemas, repeated re-shares with unclear origins. The protocol
must therefore separate four jobs:

1. **Acquire** peer data.
2. **Treat** it into a clean evidence substrate.
3. **Consolidate** redundant and related evidence (preserving conflict + minority).
4. **Reason** over the treated substrate with provenance intact.

Knowledge moves through explicit stages — the storage layer should reflect
this, not collapse them:

| Stage              | Meaning                                              | Allowed uses                              |
| ------------------ | ---------------------------------------------------- | ----------------------------------------- |
| `raw_remote`       | received from peer, minimally validated              | audit, quarantine, low-trust search       |
| `treated`          | normalized, deduped, scored, provenance-preserved    | retrieval, satisfaction scoring           |
| `consolidated`     | clustered or summarized across evidence              | context injection, reports                |
| `reasoned`         | claims extracted, conflicts found, coverage mapped   | agent contract, skip/search decisions     |
| `accepted_local`   | user or policy promoted it into local memory         | normal local retrieval                    |

**Deduplication is not deletion.** Duplicates can mean independent
discoveries, propagating misinformation, official-source dominance, or sybil
re-shares. Collapse for context, but keep an `EvidenceCluster` record that
preserves origin counts, peer lineage, freshness range, consensus and
conflict scores. Clusters — not individual nodes — should become the primary
retrieval unit at scale.

**Memory degrades** in many ways: source staleness, summary loss, context
drift, dependency drift, peer drift, semantic drift, protocol drift.
Version-sensitive memories should expire faster; repo-aware memories can
include lockfile hashes; consolidation should preserve "fragile facts" and
"what would make this stale" alongside summaries.

### Agent epistemics — typed knowledge

For every answer-bearing result, the agent should know what kind of knowledge
it's holding:

| Label           | Meaning                                                     |
| --------------- | ----------------------------------------------------------- |
| `observed`      | A peer directly saw or ran this.                            |
| `measured`      | A peer produced a benchmark or reproducible result.         |
| `sourced`       | A peer indexed a primary or secondary source.               |
| `summarized`    | An LLM compressed raw material into a memory.               |
| `inferred`      | A peer or model derived a conclusion from evidence.         |
| `hearsay`       | Records someone else's claim without primary evidence.      |
| `stale_known`   | The system knows this may be outdated.                      |
| `unknown_basis` | The basis is missing or stripped.                           |

This makes claim extraction first-class — peers can share `claim` records
with `evidence_kind`, `measured_at`, `environment`, `confidence`, linked back
to exact source spans, instead of laundering weak evidence into confident
prose summaries.

### Quality points & red lines

A quality point is a measurable feature that moves the breakpoint decision.

**Positive:** fresh primary source · direct local measurement · reproducible
command · peer with high historical satisfaction in this domain · independent
peer agreement · refreshable source URI · covers a required fact · exact
versions/dates/commands · verified signature chain · linked to local repo
code.

**Negative:** missing timestamp · summary without raw provenance · stale
source · no exact version · no source URI · single-origin re-share · peer
unknown in this domain · only semantically adjacent · conflicts with another
peer · query is high-risk or time-sensitive.

**Red lines — always block "skip search":**

- Missing `fetched_at`.
- No source or provenance for a factual claim.
- High-risk task (security / dependency / financial / legal) with no primary
  fresh source.
- All evidence traces to one origin through re-shares.
- Stale window exceeded and source can't be cheaply refreshed.
- Room-required signature missing or invalid.

### Minimum bright protocol — v1 milestone

The first genuinely intelligent version. Necessary, not yet sufficient at
network scale, but it's the pivot from *retrieval system* to *epistemic
protocol*:

1. Result quality metadata.
2. Raw-remote landing zone separate from local memory.
3. Treatment pipeline (schema → safety → normalize → dedupe → score →
   quarantine/promote).
4. Evidence clustering with duplicate collapse.
5. Claim extraction for high-value results.
6. Transparent satisfaction scorer.
7. Coverage map for borderline queries.
8. Shadow-search receipts to measure bad skips.
9. Traceable agent contract in every response.
10. Retention and quarantine policy for remote garbage.

### First experiment

A 100-query local study from real agent workflows. For each query: retrieve
local + peer results → produce satisfaction score and agent contract → decide
skip/search/refetch/ask-user → in shadow mode, run the recommended live
verification anyway → label whether the original decision was correct.

Targets before changing protocol defaults:

- `BadSkipRate` < **2%** for low-risk coding tasks.
- `SearchSavedRate` > **25%**.
- `MetadataCoverage` > **90%**.
- ≥ **30 examples** where peer memory beats live search by containing local
  measurement or lived debugging evidence absent from the public web.

### Open research questions

- Does peer memory reduce live searches by 30%+ without raising bad answers?
- Which metadata most predicts peer sufficiency?
- Does consensus across independent peers beat one trusted peer?
- Can claim-level contradiction be detected from metadata alone?
- How often is freshness the actual reason peer memory fails?
- Can an LLM judge peer sufficiency with acceptable human agreement?
- What confidence threshold keeps `BadSkipRate` below 2%?
- Does showing provenance to the agent improve final answer quality?
- Should benchmark claims be first-class typed metadata, distinct from prose?
- How do we represent "trusted peer, untrusted source" vs "untrusted peer,
  official source"?
- How do we detect sybil peers re-sharing one origin as fake consensus?
- Should reputation be local-and-private, or does that lose accountability?
- Can an LLM-free coverage extractor be cheap enough to run on every query?

### The hardest open problem

The hardest problem is not retrieval. It is deciding when retrieval is
enough. That means the protocol needs to carry **evidence, not just
chunks**. The quality system needs to measure **bad skips, not just NDCG**.
The product should optimize for **searches safely avoided** rather than "more
results returned."

Until that is measured, the honest default is:

> Peer knowledge can narrow or answer a query, but high-risk or freshness-
> sensitive tasks still require verification.

## Roadmap

The execution priorities for getting wellinformed to category leadership as a
local-first agent memory system. Full detail (acceptance gates, file pointers,
suggested order) lives in [`NEXT_STEPS.md`](./NEXT_STEPS.md).

### North Star

Make this loop feel inevitable:

1. Peer A researches or fixes something current.
2. Peer B asks Claude / Codex a related task.
3. wellinformed retrieves the trusted peer memory before web search.
4. The agent sees source age, room, peer attribution, and provenance.
5. The answer is faster, cheaper, and better than local-only context.

### Priorities

1. **Match federated search to local search.** Federated peer search currently
   downgrades to dense-only because the embedding is all that crosses the wire.
   Add an opt-in `query_text` field gated by room policy so remote peers can
   run hybrid (BM25 + dense). Privacy-sensitive rooms keep the embedding-only
   path.
2. **Fix room-filtered dense retrieval.** `searchByRoom` does global k-NN then
   filters; switch to per-room partitions so room recall isn't dominated by
   global overfetch luck.
3. **Ship the native Rust CLI as a first-class artifact.** The IPC client
   exists; install/package flow still centers the Node shim. Bake it into
   bootstrap, document cold / warm / daemon-hit / fallback latencies.
4. **Wire the semantic L2 cache into the daemon.** Paraphrased queries miss the
   exact-match cache today; embed incoming queries server-side, check semantic
   cache after the exact miss and before retrieval, expose L1/L2 hit rates in
   `cache-stats`.
5. **Make consolidation ambient and safe.** Auto-discover eligible rooms,
   pre/post retrieval-quality gate, NDJSON backup before prune by default.
6. **Add product-shaped evals.** Stop optimizing only for BEIR; benchmark the
   actual product claim — peer-vs-search, prior-session recall, stale source
   handling, "would this avoid a web search?" agent workflow cases.
7. **Tighten claims and first-impression copy.** Separate shipped behavior,
   benchmark-only behavior, env-gated behavior, and roadmap. Every public
   number should name what it requires (daemon, native client, cache hit, Rust
   embedder).

### Definition of done

wellinformed claims category leadership when:

- federated search is not lower quality than local search by default policy;
- room search has deterministic recall;
- warm daemon hits are visibly fast in a fresh install;
- semantic paraphrases hit cache;
- consolidation is safe to leave on;
- evals show fewer repeated web searches per agent task;
- public docs distinguish shipped facts from roadmap work.

### Out of scope (explicitly)

- Another SciFact SOTA attack unless tied to a product eval.
- Embedding model swaps without a deployment story.
- Graph algorithms that don't change the peer-memory demo.
- Claims without a reproducible gate.

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
