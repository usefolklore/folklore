# ADR-002 — wellinformed v4 Agent Brain design decisions

**Status:** accepted
**Date:** 2026-04-18
**Deciders:** project lead + operator
**Supersedes:** none (extends ADR-001 v3)

---

## Context

ADR-001 froze the v3 protocol decisions: did:key identity, three-tier hierarchy, linear bridge over MLP, nomic-v1.5 canonical, binary-512 default, optional reputation, primitives-first shipping. v4 keeps every one of those decisions intact and adds runtime + storage + coordination primitives on top.

This ADR records the v4 decisions and why. Each decision was evaluated against alternatives; the chosen path is the one shipped (with commit citations).

---

## Decision 1 — Daemon IPC over Unix-domain sockets, NOT HTTP

**Chosen:** Unix-domain socket at `${WELLINFORMED_HOME}/daemon.sock` (POSIX 0600), newline-delimited JSON request/response.

**Alternatives:**
- HTTP over `localhost:N` — universal but adds TCP/HTTP overhead + port-allocation pain
- gRPC — strict types but adds protobuf + dep weight
- Named pipes (Windows) — platform-specific
- Stdio child process — wrong shape for ambient daemon

**Why Unix-domain socket:**
- **Permissions are the only access control we need** — 0600 means only the owner process can connect. No need for tokens, no need to bind to a port (which would require firewall rules).
- **Zero dep weight** — `node:net` is built-in. No HTTP framework, no protobuf compiler.
- **Sub-ms round trip** — over the JS event loop is the only floor; protocol overhead is negligible.
- **Matches the daemon's lifecycle** — socket exists iff daemon is running.

**Trade-offs accepted:**
- Windows-incompatible. Documented; v4.1 may add a named-pipe fallback.
- No structured types on the wire — JSON only. Acceptable because the handler registry is small and version-bumped via the protocol ID (`/wellinformed/search/2.0.0`).

**Reference**: commit `e156e23`, `src/daemon/ipc.ts`

---

## Decision 2 — Coalescing batch decorator at the embedder boundary, NOT in the Rust server

**Chosen:** A `batchingEmbedder(inner, opts)` that wraps any Embedder and queues `.embed(text)` calls for batch flushing. Default-on in `defaultRuntime()`.

**Alternatives:**
- Server-side coalescing in `wellinformed-rs/src/bin/embed_server.rs` (tokio + async channel + thread pool). High effort, requires a Rust async refactor.
- Refactor every callsite to use `embedBatch()` directly. Touches dozens of files; brittle to future code drift.
- Per-call hint flag (`coalesce: true`). API noise; opt-in is the wrong default.

**Why client-side decorator:**
- **Single change, unbounded callers benefit** — every existing `.embed()` callsite gets batching for free with no code change at the boundary.
- **No protocol change** — the Rust server already supports `embed_batch(Vec<String>)`; the client side just batches the input before crossing the boundary.
- **Transparent opt-out** — `WELLINFORMED_EMBEDDER_BATCH=off` for callers that want the legacy serial behavior.
- **Composable** — wraps Xenova in-process, Rust subprocess, or any future embedder uniformly.

**Measured win:** 8.56 → 24.67/84.66 docs/sec (2.9–9.9×) on bge-base via Rust fastembed at N=32 (commit `92f797d`, `scripts/bench-embed-throughput.mjs`).

**Trade-offs accepted:**
- 20ms flush window adds latency to single-call paths. Negligible relative to ONNX forward-pass time, but noted.
- The decorator is single-flight (one in-flight batch at a time). Higher concurrency would need worker threads; not bottlenecked at v4 scale.

**Reference**: `src/infrastructure/embedders.ts:batchingEmbedder`

---

## Decision 3 — Binary-512 in production, NOT binary-768 or fp32-128

**Chosen:** Binary-512 hybrid is the default when `WELLINFORMED_VECTOR_QUANTIZATION=binary-512` is set. Off by default (zero behavioral change for v3 users).

**Alternatives:**
- Binary-768 (96 bytes) — safer (-1.10pt worst-case) but only 32× compression vs 48×
- Fp32-128 (512 bytes) — Matryoshka truncation only, no binary. Hits ±2pt on the 4-BEIR sets but 6× compression instead of 48×
- Always-on binary-512 — too aggressive for a major version that promises zero migration risk

**Why binary-512 as opt-in default:**
- **48× compression is a category leap** — 10k vectors drop from 30 MB to 0.6 MB. P2P sync becomes cheap.
- **−1.79pt worst-case across SciFact/ArguAna/FiQA/SciDocs** is acceptable for the budget — it's measured, not aspirational
- **Hamming popcount is hardware-accelerated** — ~6× faster than fp32 cosine in the ANN-rank step
- **Binary-768 stays available** for operators with stricter quality budgets (env: `binary-768`)

**Trade-offs accepted:**
- Migration on existing DBs requires re-index for full coverage (pre-existing rows stay NULL raw_bin, invisible to binary search until upserted again).
- Binary mode adds storage cost per row (raw_bin BLOB) on top of fp32 vec0 — both are kept so the production hybrid can run either path. v4.1 may expose a `binary-only` mode that drops the fp32 column to actually realize the 48× claim on disk.

**Reference**: BENCH-v2.md §2f, commits `1e609a6`, `b16a93a`, `09223d1`

---

## Decision 4 — Episodic-to-semantic consolidation as a CLI primitive, NOT a daemon-tick worker

**Chosen:** `wellinformed consolidate run <room>` is an explicit CLI command, run by an operator (or a cron job, or the daemon's tick loop in v4.1). Not auto-run on a timer in v4.0.

**Alternatives:**
- Daemon-tick auto-consolidation (every N hours, every N new entries)
- LLM-as-a-trigger (consolidate when entry count crosses threshold)
- Manual web UI

**Why CLI primitive first:**
- **Operator visibility on first runs** — consolidation deletes data (with `--prune`) and bills LLM tokens. Surfacing it as an explicit invocation lets operators see exactly what's about to happen
- **Decouples LLM choice from daemon lifecycle** — operators pick the model + parameters per run; daemon ticks would lock in a single config
- **Easier gate measurement** — `scripts/bench-consolidation.mjs` can run the CLI directly for reproducible timing
- **Daemon-tick autorun is additive** — once we have v4.1 retention + write-lock + bench gates, wiring a tick is a 5-line change

**Trade-offs accepted:**
- New users won't get consolidation benefits without explicitly invoking it. Documented in RELEASE-v4.md upgrade path.
- v4.1 will offer `daemon.consolidate.auto = true` config for ambient consolidation on a schedule.

**Reference**: commits `f6ab7f1` (primitive), `832c91c` (orchestrator), `0385f69` (CLI)

---

## Decision 5 — Atomic prune via `--prune`, NOT timed retention

**Chosen:** `consolidate run --prune` deletes source raw entries from the graph + vector index in the same logical operation as consolidation. No "wait for retention pass" gap.

**Alternatives:**
- Always prune (no flag) — too destructive without explicit consent
- Timed retention only — leaves a window where consolidated_raw entries compete with the consolidated_memory in BM25 hybrid retrieval (the §2j quality regression)
- Soft delete (mark + don't surface) — adds an indirection at every read site

**Why atomic prune:**
- **Closes the §2j quality regression mechanistically** — the BM25 competition disappears when source entries are gone
- **Operator opt-in** — `--prune` is required, so accidental data loss is impossible
- **Mutually exclusive with `--dry-run`** — explicit intent at the CLI boundary
- **Idempotent** — `deleteByNodeId` is no-op on missing entries; safe to re-run

**Trade-offs accepted:**
- Delete is actually destructive — no undo. Operators must trust the consolidated_memory's summary captures everything they need from the source. Mitigated by the LLM-distilled summary being signed + provenance-chained back to source IDs (which can be re-fetched from external sources if those sources are still alive).
- v4.1 retention pass remains a useful additional safety net (catches mass-marked-but-not-yet-pruned entries from v4.0 runs).

**Reference**: commit `3ed850f`, `src/cli/commands/consolidate.ts`

---

## Decision 6 — File-based write lock with stale-PID recovery, NOT in-memory mutex or external service

**Chosen:** `${WELLINFORMED_HOME}/wellinformed.lock` — POSIX exclusive-create file with `{pid, owner, timestamp}` content. Daemon refreshes every 20s; consolidate waits up to 30s.

**Alternatives:**
- Database-level locking (SQLite WAL already serializes writes inside a single connection; doesn't cross processes)
- External service (Redis, etcd) — wrong dep weight for a local-first tool
- Mutex via a sidecar daemon — adds a process to manage the process-management primitive
- No lock — accept the v4.0 caveat ("stop daemon first")

**Why file-based lock:**
- **Cross-process by definition** — anything that opens the same file sees the same lock
- **Zero external deps** — POSIX exclusive create is universal on Linux/macOS
- **Stale-PID recovery is automatic** — `kill -0 <pid>` answers "is the holder alive"
- **Heartbeat keeps long-running owners (daemon) in good standing** — 20s refresh against 60s stale window
- **Operator-debuggable** — `cat ~/.wellinformed/wellinformed.lock` shows who holds it

**Trade-offs accepted:**
- Windows-incompatible (POSIX `kill -0`). Same caveat as Decision 1.
- Sub-second contention has 100ms polling resolution — fine for human-scale operations, not for high-frequency mutation. v4.x doesn't have any high-frequency mutators, so it's fine.

**Reference**: commit `5591757`, `src/infrastructure/process-lock.ts`

---

## Decision 7 — L1 query cache as a process-local LRU+TTL, NOT distributed or persistent

**Chosen:** `queryCache({maxEntries: 256, ttlMs: 60_000})` — in-process, lifetime-of-daemon, no persistence.

**Alternatives:**
- Persistent cache (sqlite or rocksdb) — survives restarts but adds disk I/O on read
- Distributed cache (Redis) — wrong dep weight
- LFU (least-frequently-used) — better hit rate on stable working sets but worse on bursty agent queries
- L2 semantic cache (embed query, find nearest cached) — adds complexity; defer to v4.1

**Why LRU+TTL in-process:**
- **Daemon lifetime is the right invalidation horizon** — graph mutations bounce the daemon (or via v4.1 cache.clear hooks), so cross-restart cache reuse isn't valuable
- **256 entries × ~1KB stdout = ~256 KB resident** — negligible
- **60s TTL bounds staleness for the agent-burst use case** — refinement queries within a session hit cache; queries from yesterday don't pretend to be fresh
- **Pure domain primitive** (`src/domain/query-cache.ts`) — testable without daemon plumbing

**Trade-offs accepted:**
- Cache misses on every daemon restart. Acceptable; the daemon is meant to be long-lived.
- Exact-match keying — paraphrased queries don't hit. Semantic L2 cache is v4.1.

**Reference**: commit `6eeea44`, `src/domain/query-cache.ts`

---

## Decision 8 — Continue refusing the BEIR-SOTA chase

**Reaffirmed from ADR-001 Decision 7.** v4 explicitly does NOT claim BEIR SOTA. Phase 25 (Rust bge-base + hybrid = 75.22% SciFact NDCG@10) remains the CPU-local ceiling. Three v4-era attempts to push beyond all measured null:
- Contextual Retrieval (Qwen2.5-0.5B): −1.46pt
- 3-way encoder ensemble (nomic + bge + BM25): +0.24pt soft-pass
- Qwen3-Embedding-0.6B encoder swap: −2.24pt

Documented in BENCH-v2.md Appendix. The v4 release explicitly reframes the claim surface from "better NDCG" to "brain-shaped architecture" — daemon speed, storage compression, consolidated scale, cross-model portability, cryptographic provenance.

---

## Non-decisions (deferred with reason)

| Item | Why deferred to v4.1+ |
|------|----------------------|
| BIP39 mnemonic recovery | v1 hex format adequate for the first adopter wave; `@scure/bip39` is a 40 KB audited dep and a small follow-up |
| Native CLI client (Rust binary) | Closes the 100ms Node-boot floor. Requires install pipeline integration; v4.1 work |
| HippoRAG-2 multi-hop PPR gate | PPR primitive ships (12 tests green); MuSiQue + HotpotQA datasets are 16+ GB downloads + 12+ hours of embedding |
| Contextual Retrieval with 7B+ LLM | 0.5B nulled; retry needs Qwen3 / Llama-3.2 with proper local inference, multi-hour wall time |
| WASM browser runtime | Architectural follow-on; v4.3 |
| CRDT envelope verification on inbound | Receive-side complement to §5.6; v4.1 |
| Auto-consolidate via daemon tick | Decision 4 trade-off; v4.1 |
| L2 semantic query cache | Decision 7 trade-off; v4.1 |
| Binary-only storage mode (drop fp32) | Realizes the full 48× claim on disk; v4.1 |

---

## Consequences (measured + expected)

**Immediate (v4.0)**:
- Cold CLI ask: 900ms → cached 100ms (9× cumulative)
- Indexing: 8.6 → 24.7 docs/sec serial / 84.7 docs/sec parallel
- Vector storage: 48× compression at −1.79pt worst-case on hybrid retrieval
- Sessions room consolidation: 6.29× shrinkage measured live (7,002 → 1,113 nodes in 178.5s)
- Cross-process coordination: lock primitive ships, daemon-stop caveat removed
- Cross-device memory portability: proven (carried from v3)

**Expected (v4.1–v4.3)**:
- Native client closes the 100ms floor → ~15ms warm hits
- HippoRAG PPR multi-hop gates on MuSiQue: if PASS, +5–14% on multi-hop QA tasks
- WASM runtime unlocks in-browser agent peers
- Auto-consolidate on tick removes operator workflow friction

---

## Revisit triggers

This ADR is revisited if:
- A measured null on the 6.29× consolidation shrinkage in a different domain (code-graph, research notes) — would suggest the threshold/min_size defaults are session-specific
- Quality regression on `--prune` in real usage — would suggest the LLM summarization model is too small
- Lock contention measured > 1% in real usage — would suggest the daemon's mutating tick is too slow + needs decomposition
- Cache hit rate measured < 10% on real agent traffic — would suggest the keying scheme misses too many paraphrased queries
- An OSS encoder appears that displaces nomic-v1.5 as canonical — would re-open ADR-001 Decision 4

---

*See `docs/V4-PROTOCOL.md` for the wire-level specification. See `docs/RELEASE-v4.md` for the public-facing release artifact. See `.planning/BENCH-v2.md` §2f / §2g / §2h / §2i / §2j for the measurements that inform these decisions.*
