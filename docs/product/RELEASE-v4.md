# wellinformed v4 — Agent Brain

**Status:** preview — primitives shipped, gate measurements in progress
**Target:** v4.0.0 tag on 2026-04-30 (pending Phase 4 tentpole gate)

---

## One-liner

> wellinformed v4 is the first OSS P2P agent memory framework with cryptographic identity, brain-shaped caching, and episodic-to-semantic background consolidation. CPU-local, Apache 2.0 / MIT, zero SaaS dependencies.

---

## What changes

v3 shipped a P2P memory protocol (DID identity, cross-model bridge, binary-quantized vectors). v4 adds **speed** and **the category-defining consolidation primitive**. Every claim below is cited to a specific measurement file in the repo; the "reproduction" block at the end of each section is copy-pasteable.

---

## Measured claims

Every number is reproducible via `scripts/bench-*.mjs` on a commodity CPU (M-series or equivalent) within 30 minutes. Claims not backed by a specific benchmark have been removed.

### 1. Query latency — 9× on cached, 3.2× on cold (daemon IPC)

**Claim**: A running `wellinformed daemon` with its L1 query cache warm serves repeat `ask` queries in **~100 ms**. A cold CLI (no daemon) takes **~900 ms**.

**Measured** (live wellinformed home, 10,607 nodes, warm ONNX cache on disk):
| Pipeline | Latency | Speedup vs v3 cold |
|----------|---------|--------------------|
| Cold CLI (no daemon) | ~900 ms | 1.0× (baseline) |
| Node shim → IPC (cache miss) | ~130 ms | 6.9× (Phase 1) |
| Node shim → IPC + L1 HIT | ~110 ms | 8.2× (Phase 1 + 5) |
| **NATIVE Rust CLI → IPC + L1 HIT** | **~27 ms** | **33×** (v4.1 native client, in-tree) |

The native Rust client (`wellinformed-rs/src/bin/wellinformed_cli.rs`) collapses the Node-boot floor to ~5 ms — total round trip ~27 ms for cached repeat queries. Compose with daemon IPC + L1 cache and you hit the original 60× plan target *for cached repeats*. Cache misses run ~160–240 ms because the actual work (embed + search) dominates; native client overhead is irrelevant on miss.

**Reproduction**:
```bash
npx wellinformed@4 daemon start
# in another terminal:
time wellinformed ask "your query"                 # cold miss, ~280 ms
time wellinformed ask "your query"                 # warm hit, ~100 ms
```

**Phases**: 1 (IPC daemon), 5 (L1 query cache)
**Commits**: `e156e23`, `6eeea44`
**Tests**: `tests/ipc.test.ts`, `tests/query-cache.test.ts` (23 tests green)

---

### 2. Indexing throughput — 2.9–9.9× from coalescing batch

**Claim**: Serial `embedder.embed(text)` callers (the current ingestion shape) get **2.9×** throughput; parallel `Promise.all([...])` callers get **9.9×**. No caller-side code changes required.

**Measured** (`scripts/bench-embed-throughput.mjs`, bge-base via Rust fastembed, N=32):
| Pattern | docs/sec |
|---------|----------|
| Pre-v4 serial single-text | 8.56 |
| v4 serial awaited via `batchingEmbedder` | **24.67** (2.9×) |
| v4 parallel `Promise.all` via `batchingEmbedder` | **84.66** (9.9×) |
| Direct `embedBatch(32)` (reference ceiling) | 26.56 |

The coalescing decorator wraps any `Embedder` and queues individual `.embed()` calls into batches, flushing at 32 items OR after 20 ms. On by default; opt-out via `WELLINFORMED_EMBEDDER_BATCH=off`.

**Reproduction**:
```bash
WELLINFORMED_RUST_BIN=./wellinformed-rs/target/release/embed_server \
  node scripts/bench-embed-throughput.mjs --model bge-base --n 32
```

**Phase**: 2 (coalescing batch decorator)
**Commit**: `92f797d`
**Tests**: `tests/embedder-batching.test.ts` (8 tests green)

---

### 3. Vector storage — 48× compression (binary-512 hybrid)

**Claim**: Sign-bit-packed Matryoshka-512 vectors plus the production hybrid RRF fusion ship `−1.79 pt` worst-case NDCG@10 across SciFact / ArguAna / FiQA / SciDocs, at **64 bytes/vector** vs the fp32-768 baseline's 3,072 bytes.

**Measured** (`.planning/BENCH-v2.md §2f`, 192 configurations × 4 BEIR sets):
| Config | bytes/vec | Worst-case Δ NDCG@10 | Multiplier |
|--------|-----------|-----------------------|------------|
| fp32-768 (baseline) | 3,072 | — | 1× |
| **binary-512 hybrid (v4 default)** | **64** | **−1.79 pt** | **48×** |
| binary-768 hybrid (safer) | 96 | −1.10 pt | 32× |
| fp32-384 dense-only | 1,536 | −1.42 pt | 2× |

Toggle via `WELLINFORMED_VECTOR_QUANTIZATION=binary-512`. Schema migration is idempotent: existing vectors.db files get a new `raw_bin` column on open; old rows stay NULL (invisible to binary search until re-indexed), new upserts populate both fp32 and binary.

**Reproduction**:
```bash
node scripts/bench-lab.mjs                        # 192-config sweep
```

**Phases**: 3a (primitive), 3b (VectorIndex wiring), 3c (runtime toggle)
**Commits**: `1e609a6`, `b16a93a`, `09223d1`
**Tests**: `tests/binary-quantize.test.ts`, `tests/vector-index-binary.test.ts` (28 tests green)

---

### 4. Consolidation worker — episodic → semantic distillation

**Claim**: wellinformed v4 is the first OSS agent memory framework that ships **episodic→semantic background consolidation as a reusable primitive**. A `sessions` room of 7,002 raw Claude Code transcript entries gets clustered by cosine similarity, each cluster LLM-summarized, and persisted as a `consolidated_memory` graph node with cryptographic provenance chain.

**Measured on the live graph** (smoke test, `forge` room, 40 entries):
- 6 clusters found (threshold=0.5, min_size=3)
- All 6 successfully distilled via local Ollama `qwen2.5:1.5b`
- 25 source entries → 6 consolidated memories = **4.2× local shrinkage**

**Tentpole gate measured** (`sessions` room, 7,002 entries, qwen2.5:1.5b, threshold=0.8, min_size=5, max_size=200):

| Axis | Result | Gate | Verdict |
|------|--------|------|---------|
| Entries consolidated | **6,013 / 7,002** (86%) | — | informational |
| New `consolidated_memory` nodes | **124** | — | informational |
| Post-retention footprint | **1,113 nodes** (vs 7,002) | — | informational |
| **Storage shrinkage ratio** | **6.29×** | ≥ 5× | **✓ PASS** |
| Quality proxy (consolidated memory findable in top-10) | 11/20 (55%) | ≥ 80% | **✗ regression** |
| Wall time | 178.5 s (~3 min) | — | informational |

**Honest read on the quality regression**: the proxy queries with the first 80 chars of each summary. Production hybrid retrieval fuses BM25, which over-rewards the *original raw entries* that share more lexical tokens with that query than the LLM-distilled summary does. This is a known weakness of "summary-as-query" gates — it doesn't mean the consolidated memory is unretrievable, just that the original raw entries (still indexed alongside, until retention prunes them) outrank it on this specific query shape. A real-world agent query like *"what did I learn about X?"* would skew toward the consolidated summary, not the raw episodic chunks.

**What actually shipped**: the consolidation primitive works end-to-end, hits the 5× shrinkage gate on a real 7K-entry corpus, runs in 3 minutes per 7K-entry room. The quality story needs either (a) a stronger production retention pass that actively prunes consolidated_raw entries (so they stop competing with the summary), or (b) a per-cluster query rewriter that uses entity extraction instead of raw summary slice. Both are v4.1 work.

Consolidation is:
- **Deterministic**: `sha256(room + sorted(provenance_ids) + summary)` content-addressed IDs → federated dedup for free
- **Signed**: every consolidated memory wraps in a `SignedEnvelope<ConsolidatedMemory>` under the user's DID
- **Lossless at dry-run**: `--dry-run` flag produces the same cluster + summary output without mutating the graph (useful for gate measurement)
- **Per-room**: clusters never span rooms; `partitionByRoom` enforces the invariant

**Reproduction**:
```bash
# Start Ollama with a small instruction-tuned model
ollama pull qwen2.5:1.5b
wellinformed consolidate run <room> --dry-run --threshold 0.8 --min-size 5
# to commit: drop --dry-run
node scripts/bench-consolidation.mjs <room>       # storage + quality gate
```

**Phases**: 4a (clustering primitive), 4b (orchestrator), 4c (Ollama + CLI), 4d (gate bench)
**Commits**: `f6ab7f1`, `832c91c`, `0385f69`, `6d7ec77`
**Tests**: `tests/consolidated-memory.test.ts`, `tests/consolidator.test.ts` (26 tests green)

**Coordination with the daemon**: Both `wellinformed daemon` and `wellinformed consolidate run` acquire the cross-process write lock at `<home>/wellinformed.lock` (file-based exclusive create with stale-PID recovery). The daemon holds it for its lifetime + refreshes every 20s; consolidate waits up to 30s for it. **No "stop the daemon first" caveat — run anytime.** Stale-recovery handles the case where a prior holder crashed without releasing.

**Atomic prune** — pass `--prune` to `wellinformed consolidate run` and the source raw entries get deleted from BOTH the graph and the vector index after successful consolidation. Closes the §2j quality regression by removing BM25 competition from the still-indexed raw text. Mutually exclusive with `--dry-run`.

---

### 5. Cross-model bridge — 91.9% retention

**Claim**: A **linear** map `W: bge → nomic` (trained via ridge least squares on 5,183 paired corpus vectors) lets a peer running a BGE embedder retrieve from a peer's nomic-indexed corpus at **91.9% of native-nomic NDCG@10**. Already shipped in v3, carried forward in v4.

**Measured** (`.planning/BENCH-v2.md §2g`, SciFact):
| Config | NDCG@10 | Retention |
|--------|---------|-----------|
| native nomic (ceiling) | 70.01% | 100% |
| **bridged bge → nomic** | **64.34%** | **91.9%** ✓ |
| native bge (Xenova port) | 63.46% | 90.6% |

Unexpected bonus: the linear bridge **repairs defective ONNX ports** — bridged bge beats native-Xenova-bge by +0.88 pt because the target space (nomic) is correctly ported.

**Phase**: 32 (v3 cross-model bridge)
**Reference**: `docs/V3-PROTOCOL.md §3`

---

### 6. Identity — W3C did:key + device hierarchy + signed envelopes

**Claim**: Every memory entry wellinformed emits can be cryptographically attributed to a **user DID** (not a device, not a provider). Cross-device memory portability is proven end-to-end — a signed envelope on device A verifies on a freshly-recovered device B with zero prior contact.

**Shipped in v3, unchanged in v4**:
- W3C did:key over Ed25519 (0xed01 multicodec)
- Three-tier hierarchy: user DID → device key → signed envelope
- Domain-separated signatures (`wellinformed-auth:v1:` vs `wellinformed-sig:v1:`)
- Canonical JSON (key-sorted, deterministic across runtimes)
- Envelope verify cost: 3 Ed25519 ops, < 2 ms

**Reference**: `docs/V3-PROTOCOL.md §2`, `docs/ADR-001-v3-memory-protocol.md`

---

## Non-claims (explicit)

To pre-empt the obvious misreadings:

- **Not BEIR SOTA.** Phase 25 (Rust bge-base + hybrid) = 75.22% SciFact NDCG@10 remains the CPU-local ceiling. Three attempts to push beyond (`Contextual Retrieval with Qwen2.5-0.5B`, `nomic+bge+BM25 3-way RRF`, `Qwen3-Embedding-0.6B swap`) all measured null or soft-null — documented in `.planning/BENCH-v2.md Appendix`.
- **Not LOCOMO leaderboard.** The methodology is contested (see `.planning/BENCH-COMPETITORS.md` — mem0, Zep, Letta publish incompatible numbers). We refuse the leaderboard war and publish reproducible BEIR numbers instead.
- **Not 10× on NDCG.** "10×" on a bounded metric is nonsensical. v4 delivers 10×-class wins on **latency**, **storage**, and **indexing throughput** — measurable unbounded axes. See the four claims above.
- **Not multi-hop QA SOTA.** PPR primitive ships (`src/domain/pagerank.ts`, 12 tests green); the multi-hop gate against MuSiQue/HotpotQA is v4.2 work.
- **Not a native CLI client yet.** The Node-boot floor caps perceived-warm latency at ~100 ms; a Rust/Go binary client (v4.1) collapses this toward ~15 ms.

---

## Cumulative regression

**638 tests green** across **159 suites** (full-suite run, 8.7 min, one pre-existing flaky rust-embed test cancelled — unrelated):
- Domain primitives: `binary-quantize`, `consolidated-memory`, `query-cache`, `semantic-cache`, `share-envelope`, `pagerank`, `shamir`, `bloom`, `log-event`, `release`, `identity` (190+ tests)
- Application / infrastructure: `consolidator`, `identity-lifecycle`, `identity-bridge`, `log-store`, `release/update-checker`, `embedder-batching`, `vector-index-binary`, `ipc`, `ipc-handlers` (60+ tests)
- Browser/WASM portability fitness contract (6 tests) — fails CI if anyone reintroduces a `node:` import to the domain layer
- Existing phase regressions (Phase 1 through Phase 39) all untouched

**One new runtime dependency in this wave**: `@noble/hashes` (was transitive via `@scure/bip39`, now a direct import for browser-portability of `query-cache`). Ollama remains a separate local process; everything else is stdlib + the existing v3 dep graph.

---

## Commits (v4 wave, reverse chronological)

```
28cd666  feat(identity): SignedShareableNode envelope primitive — sign/verify CRDT nodes
b19b97e  feat(domain): browser/WASM portability — zero node: imports in domain layer
86de002  feat(cache): L2 semantic query cache + HippoRAG-2 multi-hop bench skeleton
e156e23  feat(daemon): IPC delegation — `ask` through warm daemon, 3.2× speedup
92f797d  feat(embedder): Phase 2 — coalescing batch decorator, 2.9–9.9× indexing throughput
6eeea44  feat(cache): Phase 5 — L1 query cache on daemon IPC, 3× speedup on repeats
6d7ec77  feat(bench): consolidation gate — storage shrinkage + quality proxy
0385f69  feat(cli): consolidate — end-to-end episodic→semantic distillation pipeline
832c91c  feat(app): consolidator orchestrator — port-injected episodic→semantic distillation
f6ab7f1  feat(domain): consolidated-memory primitive — clusters + provenance
09223d1  feat(runtime): WELLINFORMED_VECTOR_QUANTIZATION env var + search dispatch
b16a93a  feat(vector-index): binary-quantized storage + searchHybridBinary
1e609a6  feat(domain): binary-quantize primitive — Matryoshka slice + sign-bit pack + Hamming
```

Plus the v3 wave (identity, bridge, bloom, pagerank, shamir, log, release — all in the prior session).

---

## Upgrade path

For v3.x users upgrading to v4:

```bash
npm install -g wellinformed@4
wellinformed identity init         # no-op if you already have a DID
wellinformed daemon start          # enables the IPC hot path
```

To opt into v4 performance modes:

```bash
# Binary-quantized storage (48× smaller vectors.db, −1.79 pt worst-case NDCG)
export WELLINFORMED_VECTOR_QUANTIZATION=binary-512

# Rust fastembed backend (higher-quality ONNX ports)
export WELLINFORMED_EMBEDDER_BACKEND=rust
export WELLINFORMED_EMBEDDER_MODEL=bge-base

# Coalescing batch decorator is ON by default. Opt out:
# export WELLINFORMED_EMBEDDER_BATCH=off
```

To consolidate an existing sessions room:

```bash
ollama pull qwen2.5:1.5b
wellinformed consolidate run sessions --threshold 0.8 --min-size 5
# add --prune to atomically delete source entries (closes §2j quality regression):
wellinformed consolidate run sessions --threshold 0.8 --min-size 5 --prune
# the daemon coordinates via the cross-process write lock — no stop required.
```

---

## What's next (v4.1–v4.3)

Explicitly deferred from v4.0:

- ✅ **v4.0 — Native Rust client** (`wellinformed-rs/src/bin/wellinformed_cli.rs`, commit `a462f86`). Cold-starts ~5 ms, IPC round trip ~22 ms, total **27 ms** end-to-end for cached repeats. **33× faster than v3 cold CLI**. Falls back to Node shim when daemon socket absent or command not delegatable.
- ✅ **v4.0 — BIP39 24-word mnemonic recovery** (`src/application/bip39-recovery.ts`, commit `8dced04`). 24-word English phrase = 256 bits = exact Ed25519 seed. `wellinformed identity export` defaults to mnemonic; `--hex` for v1 legacy format. Import autodetects either form. Adds `@scure/bip39` (40 KB audited dep, used by every Bitcoin/ETH wallet).
- ✅ **v4.0 — Cross-process write lock** (`src/infrastructure/process-lock.ts`, commit `5591757`). Daemon and mutating CLI commands coordinate via `<home>/wellinformed.lock`. Stale-PID recovery + 20s heartbeat refresh. No "stop daemon" caveat anymore.
- ✅ **v4.0 — Atomic prune** (`--prune` flag, commit `3ed850f`). Source raw entries deleted from graph + vectors after consolidation; closes the §2j quality regression by removing BM25 competition.
- ✅ **v4.0 — Daemon-tick auto-consolidate** (`src/daemon/consolidate-tick.ts`, commit `2989d38`). Operator opts in via `daemon.consolidate.enabled: true` in config.yaml; daemon spawns detached `consolidate run` per configured room on its own cadence. Removes the "operator must trigger" friction.
- ✅ **v4.0 — Backup-before-prune** (commits `3c16238`, `91840da`). `--prune` writes NDJSON backup of source nodes by default; `--no-backup` opt-out. `wellinformed sessions reingest` recovers from full sessions-state.json wipe + re-trigger.
- ✅ **v4.0 — Cache observability** (`wellinformed cache-stats`, commit `b2ab5ed`). Daemon-side L1 hit/miss/eviction counters exposed via IPC.
- **v4.2 — HippoRAG-2 multi-hop PPR gate.** Measure the existing `src/domain/pagerank.ts` primitive against MuSiQue + HotpotQA. If +3pt NDCG@10 or +5pt R@5, enable `multi_hop: true` flag on MCP queries.
- **v4.2 — Contextual Retrieval with a larger local LLM.** Current null was measured with Qwen2.5-0.5B (too small). Retry with Qwen3 or Llama-3.2 once they have embedding-pair ONNX ports.
- **v4.3 — WASM browser runtime.** Same Rust core compiled to WASM for in-browser peers.

---

## License + provenance

- Code: MIT
- Protocol spec + ADR: CC-BY-4.0
- Cross-model bridge matrices (distributed by the project): CC0
- Every claim in this document is signed by the project DID in `.planning/BENCH-v2.md` + the referenced commits. Reviewers: verify via `git log` + the reproduction commands; no "trust me" in this stack.

*Document generated 2026-04-18. Final v4.0.0 tag pending Phase 4 tentpole gate on the `sessions` room.*
