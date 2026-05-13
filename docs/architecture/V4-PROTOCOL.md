# wellinformed v4 — Agent Brain Protocol

**Version:** 0.4 (draft, supersedes V3-PROTOCOL.md)
**Status:** Reference implementation shipped in wellinformed v4.x; spec stabilising ahead of v4.0 tag
**Audience:** Implementers of cross-agent persistent memory, P2P application authors, anyone building on free LLMs

---

## 1. Motivation

v3 established the P2P memory protocol — cryptographic identity (W3C did:key), cross-model embedding bridge, binary-quantized storage. v4 adds **brain-shaped** behavior: a persistent daemon, an episodic→semantic consolidation worker, a query cache, and the cross-process write coordination that lets all of these run together.

The thesis is unchanged from v3: **memory portability is a necessary condition for a self-sovereign LLM stack.** v4 makes the implementation usable as a daemon-resident service (sub-100ms warm queries, transparent batching, atomic consolidation) rather than just a CLI primitive.

This document covers the v4 additions on top of V3-PROTOCOL.md. **Everything in V3-PROTOCOL.md still applies** — identity, envelopes, bridge registry, binary-512 quantization. v4 changes only the runtime / storage / coordination layers.

---

## 2. Daemon IPC (§Phase 1)

### 2.1 Socket location and protocol

Wellinformed's daemon listens on a Unix-domain socket at `${WELLINFORMED_HOME}/daemon.sock` (POSIX permissions 0600 — only the owning user can connect).

Protocol is newline-delimited JSON, request/response. One request per line, one response per line.

```
client → daemon:  {"id": <number>, "cmd": "ask", "args": ["--room", "wellinformed-dev", "p2p memory"]}
daemon → client:  {"id": <number>, "ok": true, "stdout": "...", "exit": 0}
```

### 2.2 Delegatable commands (v4.0)

The handler registry is in `src/daemon/ipc-handlers.ts`. v4.0 ships:

| `cmd` | Behavior |
|------|----------|
| `ask` | Embed query (warmed in-process), search hybrid, format stdout. Response.stdout is the ready-to-print formatted result. Caches via §3 query cache. |
| `stats` | JSON snapshot: `{nodes, edges, vectors, rooms, via:"daemon-ipc"}` |

Unknown `cmd` returns `{ok: false, stderr: "__fallback__", exit: 255}` — the client treats this as "spawn the full CLI instead".

### 2.3 Client integration

`bin/wellinformed.js` checks for the socket file BEFORE importing `dist/cli/index.js`. If present and the command is in the delegatable set (currently `ask`, `stats`), the request is forwarded over IPC. Otherwise the CLI takes the normal spawn path.

This is what gives **3.2× speedup** on cold CLI invocations (900ms → 280ms) — measured at `e156e23`. The remaining floor is Node startup; v4.1's native client collapses it further.

---

## 3. L1 Query Cache (§Phase 5)

### 3.1 Behavior

The IPC `ask` handler holds a process-local LRU + TTL cache:
- **Key**: `sha256(cmd || \\x00 || args.join("\\x01"))[0..32]`
- **Value**: cached `stdout` string (idempotent — handler output is pure given the cache key)
- **Capacity**: 256 entries (configurable)
- **TTL**: 60 seconds (configurable)
- **Eviction**: LRU on capacity overflow; on-demand expiry on get()

A cache hit short-circuits at the handler entry — no embed, no search, no format. Measured **9× cumulative** speedup (900ms cold → 100ms cached) at `6eeea44`.

### 3.2 Invalidation

v4.0 has no fine-grained invalidation. The 60s TTL bounds staleness. v4.1 will add cache.clear on graph-write events (the daemon's tick loop knows when ingestion mutates state).

---

## 4. Coalescing Embedder (§Phase 2)

### 4.1 Behavior

Any `Embedder` (Xenova in-process, Rust subprocess, fixture) can be wrapped with `batchingEmbedder(inner, opts)`. Individual `.embed(text)` calls queue and flush as a single `.embedBatch()` against the inner encoder when:
- The queue reaches `maxBatch` items (default 32), OR
- `flushAfterMs` elapses since the first queued item (default 20ms)

Direct `.embedBatch(texts)` calls bypass the queue.

**Default-on** in v4 — `defaultRuntime()` wraps the chosen backend automatically. Opt-out via `WELLINFORMED_EMBEDDER_BATCH=off`.

### 4.2 Measured throughput (bge-base via Rust fastembed, N=32)

| Pattern | docs/sec | Speedup |
|---------|----------|---------|
| Pre-v4 serial single-text | 8.56 | 1.0× |
| **v4 serial awaited via decorator** | **24.67** | **2.9×** |
| **v4 parallel (Promise.all) via decorator** | **84.66** | **9.9×** |

Reference: `92f797d`, `scripts/bench-embed-throughput.mjs`.

---

## 5. Consolidation Worker (§Phase 4) — the category-defining primitive

### 5.1 Conceptual model

Episodic memory entries (raw session transcripts, ingested chat logs, observed events) accumulate linearly. A brain compresses them via overnight replay into semantic schemas. wellinformed v4 ships this as a CLI primitive plus a graph-node schema.

### 5.2 Cluster identification

`findClusters` (in `src/domain/consolidated-memory.ts`):
- Sort entries by (timestamp, node_id) — deterministic across peers
- Greedy seed-grow: for each unassigned entry as seed, take all unassigned others with cosine ≥ `similarity_threshold`
- Emit cluster if seed + neighbors ≥ `min_size`; clamp to `max_size` keeping closest
- **Clusters NEVER span rooms** — caller partitions per-room via `partitionByRoom`

Default parameters:
```
similarity_threshold = 0.8
min_size = 5
max_size = 100
```

### 5.3 Consolidated memory node schema

A `consolidated_memory` graph node carries:

```typescript
{
  id: NodeId,                          // content-addressed: "consolidated:<sha256[..32]>"
  label: string,                       // first 80 chars of summary
  file_type: 'document',
  source_file: string,                 // "consolidated://<id>"
  room: Room,
  kind: 'consolidated_memory',
  summary: string,                     // LLM-distilled 50-200 word semantic summary
  provenance_ids: NodeId[],            // sorted source entry IDs
  consolidated_at: ISO-8601,
  llm_model: string,                   // e.g. "qwen2.5:1.5b" — pinned for future regen detection
}
```

The vector index gets the cluster's L2-normalized centroid as the consolidated memory's vector.

### 5.4 Content-addressed determinism

```
id = "consolidated:" + sha256(room + ":" + sorted(provenance_ids).join(",") + ":" + summary)[0..32]
```

Two peers with identical sources + identical LLM output produce identical IDs. **Federated dedup falls out for free.** Cross-peer summary-text comparisons need the LLM to be deterministic (use temperature=0.2 + same model + same provenance order — all defaults).

### 5.5 Provenance + retention

Source entries get marked with `consolidated_at: <ISO>`. Two paths:

- **Lazy retention**: a future tick prunes `consolidated_at`-flagged entries older than retention threshold
- **Atomic prune** (`--prune` flag): source entries deleted from BOTH graph and vector index immediately after successful consolidation. Closes BENCH-v2.md §2j quality regression by removing the still-indexed raw text from BM25 retrieval competition

### 5.6 Signed envelopes

Every `ConsolidatedMemory` SHOULD wrap in a `SignedEnvelope<ConsolidatedMemory>` per V3-PROTOCOL §2.3. Federated peers verify the chain (user DID → device key → payload signature) before accepting an inbound consolidated memory into their own graph. v4.0 ships the envelope schema; the CRDT ingestion path that auto-verifies inbound envelopes is v4.1.

### 5.7 Measured tentpole gate

Live `sessions` room, 7,002 raw Claude session entries, qwen2.5:1.5b, threshold=0.8, min_size=5, max_size=200:

| Axis | Result |
|------|--------|
| Entries consolidated | 6,013 / 7,002 (86%) |
| `consolidated_memory` nodes | 124 |
| Post-retention footprint | 1,113 nodes |
| **Storage shrinkage** | **6.29×** ✓ PASS (gate ≥5×) |
| Wall time | 178.5s |

Reference: BENCH-v2.md §2j, commit `b0548d6`.

---

## 6. Cross-Process Write Lock (§Phase 4.1)

### 6.1 Lock file location

`${WELLINFORMED_HOME}/wellinformed.lock` — POSIX exclusive-create file.

Content:
```json
{"pid": 12345, "owner": "daemon", "timestamp": 1745024400000}
```

### 6.2 Acquire semantics

- POSIX exclusive create (`open` with `wx` flag) — atomic
- On EEXIST, check staleness:
  - Holder PID not alive (`kill -0` fails) → break
  - Timestamp older than `staleAfterMs` (default 60s) → break
- If contended + fresh: poll every `pollIntervalMs` until `waitMs` elapses or lock frees
- Acquirer writes `{pid, owner, timestamp}` to the file

Long-running owners (the daemon) refresh the timestamp every 20s via atomic write-and-rename so the staleness check doesn't reap them.

### 6.3 Required usage

These commands MUST acquire the lock before mutating graph.json or vectors.db:
- `daemon` (holds for lifetime)
- `consolidate run`
- (future) `index`, `trigger`, `share` writes

Read-only commands (`ask`, `stats`, `search`) do NOT take the lock.

### 6.4 Inspection

`peekLock(home)` is non-blocking — used by status surfaces to render "is anyone mutating?" without contending.

---

## 7. Vector Quantization Negotiation (V3-PROTOCOL §4 → V4 update)

V3 specified the negotiation handshake for federated peers to choose an encoding (fp32-768, fp32-512, binary-768, binary-512, ...). V4 ships this as a runtime toggle:

```bash
WELLINFORMED_VECTOR_QUANTIZATION=binary-512   # 64 bytes/vec, -1.79pt worst-case (measured)
WELLINFORMED_VECTOR_QUANTIZATION=binary-768   # 96 bytes/vec, -1.10pt worst-case (safer)
unset                                          # fp32-768 (default, identical to v3)
```

The VectorIndex schema gets a `raw_bin BLOB` column (idempotent ALTER TABLE on existing DBs). When binary mode is on:
- Every upsert writes both fp32 (vec_nodes) and binary (vec_meta.raw_bin)
- `searchHybrid` dispatches to `searchHybridBinary` automatically (Hamming popcount + RRF + BM25)
- Pre-existing rows have NULL raw_bin and are skipped by binary search until reindexed

Measurement: BENCH-v2.md §2f. Reference: commits `1e609a6`, `b16a93a`, `09223d1`.

---

## 8. Conformance tests for v4 implementations

In addition to the v3 conformance suite (V3-PROTOCOL §7), a v4 implementation MUST pass:

- **Daemon IPC** — open the socket, accept request, return delegatable command result; return fallback sentinel on unknown cmd
- **Coalescing batching** — N parallel `.embed()` calls produce the same N-element result vector array as N serial calls
- **Lock acquire/release** — exclusive across processes; stale recovery on dead PID
- **Consolidated memory** — content-addressed ID is reproducible byte-for-byte from (room, sorted provenance_ids, summary)
- **Atomic prune** — after `consolidate run --prune` completes, source IDs are absent from both graph and vector index
- **Quantization migration** — opening a fp32-only DB with binaryDim set adds the column without losing data; opening it again without binaryDim returns the original behavior

Reference suite: `tests/ipc.test.ts` + `tests/embedder-batching.test.ts` + `tests/process-lock.test.ts` + `tests/consolidated-memory.test.ts` + `tests/consolidator.test.ts` + `tests/vector-index-binary.test.ts` (62 tests covering v4 surface).

---

## 9. Reference implementation map (v4 changes)

```
src/daemon/ipc.ts                    Unix-socket server + client (Phase 1)
src/daemon/ipc-handlers.ts           Command registry (Phase 1) + L1 cache wiring (Phase 5)
src/cli/commands/daemon.ts           Daemon entry + lock acquire (Phase 4.1)
bin/wellinformed.js                  Client-side IPC delegation (Phase 1)

src/domain/binary-quantize.ts        Matryoshka + sign-bit + Hamming primitive (Phase 3a)
src/infrastructure/vector-index.ts   Binary storage + searchHybridBinary + deleteByNodeId (Phase 3b/4.1)
src/cli/runtime.ts                   Env var dispatch + batchingEmbedder wrap (Phase 3c/2)

src/domain/query-cache.ts            LRU + TTL primitive (Phase 5)

src/domain/consolidated-memory.ts    Clustering + provenance primitive (Phase 4a)
src/application/consolidator.ts      Port-injected orchestrator (Phase 4b)
src/cli/commands/consolidate.ts      Ollama wiring + CLI (Phase 4c) + --prune (Phase 4.1)
src/infrastructure/ollama-client.ts  Thin /api/generate HTTP client (Phase 4c)
scripts/bench-consolidation.mjs      Storage + quality gate harness (Phase 4d)

src/infrastructure/process-lock.ts   File-based exclusive write lock (Phase 4.1)

src/infrastructure/embedders.ts      batchingEmbedder coalescing decorator (Phase 2)
scripts/bench-embed-throughput.mjs   Throughput diagnostic (Phase 2)
```

Zero new runtime dependencies — all v4 primitives use Node stdlib + the existing v3 dep graph (neverthrow, better-sqlite3, sqlite-vec).

---

## 10. Future work

Explicitly deferred from v4.0:

**Shipped post-rc1 in this session** (commits 86de002, b19b97e, 28cd666):

- **L2 semantic query cache** — paraphrase-aware lookup catches the 30-50% of queries the L1 hash cache misses (`src/domain/semantic-cache.ts`). Cosine threshold 0.92, embed-once-route-twice on miss. Wired into the daemon ask handler; cache-stats reports both layers.
- **HippoRAG-2 multi-hop PPR bench skeleton** — algorithmic harness (`scripts/bench-ppr-multihop.mjs`) reuses `src/domain/pagerank.ts` over a localized doc-doc kNN graph. Synthetic mode validates pipeline; `--dataset hotpotqa|musique` is the path to the real gate.
- **Browser/WASM portability for the domain layer** — `src/domain/{binary-quantize, semantic-cache, query-cache, vectors}.ts` certified zero `node:` imports. `query-cache` swapped from `node:crypto` to `@noble/hashes` (pure JS, transitive via `@scure/bip39`). Fitness contract enforced by `tests/browser-portability.test.ts`.
- **SignedShareableNode envelope primitive** — `src/domain/share-envelope.ts` builds on the identity primitive to wrap each ShareableNode in a verifiable Ed25519 envelope chain. Sign/verify roundtrip + 9 tamper-detection tests pass; wiring into the share-sync inbound observer ships behind `WELLINFORMED_REQUIRE_SIGNED_NODES` in a follow-up commit.

**Still deferred:**

- **v4.1 — Native binary client** (Rust `wellinformed-cli` that speaks the IPC protocol directly, bypassing Node boot). Target: warm-hit latency 100ms → 15ms.
- **v4.1 — BIP39 mnemonic recovery** — adds `@scure/bip39` (40 KB audited dep) for human-readable 12/24-word phrases. Hex format remains supported.
- **v4.2 — Real-data PPR gate** — wire `scripts/bench-ppr-multihop.mjs` to BEIR HotpotQA + MuSiQue corpora. If +3pt NDCG@10 or +5pt R@5, enable `multi_hop: true` flag on MCP queries.
- **v4.2 — Contextual Retrieval with a larger local LLM** — current null was measured with Qwen2.5-0.5B (too small). Retry with Qwen3 or Llama-3.2 once their embedding-pair ONNX ports are validated.
- **v4.2 — Cross-encoder rerank with domain-matched models** — bge-reranker-v2-m3, jina-reranker-v2 — both untested in our pipeline.
- **v4.2 — Wire `WELLINFORMED_REQUIRE_SIGNED_NODES` into share-sync inbound observer** — the receive-side complement to §5.6, using the now-shipped envelope primitive.
- **v4.3 — WASM browser runtime** — Rust core compiled to WASM for in-browser peers. The TS domain layer is already browser-portable (this session); WASM is for the high-throughput sqlite-vec/HNSW path.

---

## 11. License + provenance

- Code: MIT
- Protocol spec + ADR: CC-BY-4.0
- Cross-model bridge matrices distributed by the project: CC0
- Every measurement claim is reproducible via the bench scripts in `scripts/bench-*.mjs`. Reviewers verify via `git log` + the reproduction commands. No "trust me" in this stack.

---

*Document generated 2026-04-18. Final v4.0.0 tag pending external dogfood window.*
