# akashik — Senior Data Engineer Audit

**Lens:** is the ingest → embed → index → serve pipeline production-ready as a data engineer would build it?
**Scope:** 25 source adapters, daemon tick, graph/vector/code-graph persistence, CI/CD, observability.
**Not covered:** architecture bounded contexts, MLOps drift, geometric retrieval quality, EDA (other auditors).

---

## 1. Pipeline architecture diagram

```
                         ┌──────────────────────────────────────────┐
                         │   setInterval(interval_seconds) timer    │
                         │   src/daemon/loop.ts :: startLoop        │
                         └────────────────────┬─────────────────────┘
                                              │ every tick
                                              ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  runOneTick(DaemonDeps)  src/daemon/loop.ts:136                          │
│   1. ensureSessionsRoom (Phase 20)                                       │
│   2. rooms.load → pick room(s) (round-robin or all)                      │
│   3. for room in picked: triggerRoom(ingestDeps)(room)  [SEQUENTIAL]     │
│   4. generateReport → write md                                           │
│   5. share-sync tick (libp2p)                                            │
│   6. enforceRetention (session pruning)                                  │
└────────────────────┬─────────────────────────────────────────────────────┘
                     │ contract: Room → RoomRun
                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  triggerRoom   src/application/ingest.ts:81                              │
│   sources.list → forRoom(descriptors) → registry.buildAll                │
│   sequenceLazy(live.map(source => ingestSource(source)))  [SEQUENTIAL]   │
│   errors: per-source try/catch, synthesised failed SourceRun             │
└────────────────────┬─────────────────────────────────────────────────────┘
                     │ contract: Source → SourceRun { items_seen, items_new, items_updated, items_skipped, error? }
                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  ingestSource  src/application/ingest.ts:68                              │
│   source.fetch() → ContentItem[]                                         │
│     │                                                                    │
│     │  contract: ContentItem { source_uri, title, text, published_at?,   │
│     │                           author?, metadata? }                     │
│     ▼                                                                    │
│   processItems → for each item (sequenceLazy):                           │
│     hashContent(normalised text) → classify vs existing node             │
│        new → actOnDecision → indexChunksFor                              │
│        updated → actOnDecision → indexChunksFor                          │
│        skipped → no-op                                                   │
└────────────────────┬─────────────────────────────────────────────────────┘
                     │ contract: ContentItem → chunks[] (chunkText, 1200 chars paragraph-aware)
                     ▼
┌──────────────────────────────────────────────────────────────────────────┐
│  indexChunksFor  ingest.ts:201   →   indexNode  use-cases.ts:92          │
│   for each chunk (sequenceLazy):                                         │
│     embedder.embed(text) → Vector (384d, ONNX all-MiniLM-L6-v2)          │
│     vectors.upsert(VectorRecord)                                         │
│     graphs.load → upsertNodePure → graphs.save  [FULL REWRITE]           │
│   then add next_chunk edges between siblings                             │
└────────────────────┬─────────────────────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────┐  ┌──────────────────────┐  ┌──────────────────────┐
│  graph.json          │  │  vectors.db          │  │  code-graph.db       │
│  (NetworkX node-link)│  │  (sqlite-vec + meta) │  │  (sqlite, schema v1) │
│  fileGraphRepository │  │  vec_nodes + vec_meta│  │  codebases/nodes/    │
│  write atomic rename │  │  WAL, synchronous=   │  │  edges, WAL          │
│  FULL REWRITE EVERY  │  │  NORMAL              │  │  transactional       │
│  SAVE — O(graph)     │  │                      │  │  upserts             │
└──────────┬───────────┘  └──────────┬───────────┘  └──────────┬───────────┘
           │                         │                          │
           └─────────────────────────┴──────────────────────────┘
                                     │
                                     ▼
                          SERVE layer (MCP/CLI/telegram)
                          search, ask, get_node, find_tunnels
```

**Key contracts between stages:**

| Stage boundary          | Type                      | Location                                       |
|-------------------------|---------------------------|------------------------------------------------|
| Adapter → Application   | `ContentItem`             | `src/domain/content.ts`                        |
| Application → Infra     | `GraphNode`, `VectorRecord` | `src/domain/graph.ts`, `src/domain/vectors.ts` |
| Daemon → App            | `Room`, `SourceDescriptor`| `src/domain/graph.ts`, `src/domain/sources.ts` |
| App → Report            | `ReportData`              | `src/application/report.ts:48`                 |

**The critical data engineering flaw visible in this diagram:** there is no queue, no buffer, no worker pool, no checkpointing between stages. Every stage calls the next synchronously via `ResultAsync` chain. A single slow source adapter serializes the entire tick, and a crash mid-chunk-loop replays from the last committed graph.json.

---

## 2. Production-readiness scorecard

| Capability              | Score | Evidence                                                                                                                                                                                     |
|-------------------------|:----:|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Schema contracts        | 6/10 | `ContentItem`, `GraphNode`, `SourceRun` exist as TS types. But the contract is **compile-time only** — no runtime validation at the adapter boundary. A drifted adapter can emit `any` and it flows through. Only `claude-sessions` and `sessions-state` do runtime narrowing (sessions-state.ts:124-155). |
| Idempotency             | 8/10 | `sha256(normalized text)` dedup keyed by `source_uri` (ingest.ts:165-178). `arxiv.ts:64` strips version. Atomic rename on graph.json save (graph-repository.ts:54-56). Session ingest tracks byteOffset per file (sessions-state.ts).                         |
| Retries                 | 1/10 | **Not present.** http-fetcher has a timeout + single attempt (fetcher.ts:95-128). Zero retry-with-backoff anywhere in the fetch path. `arxiv.ts:19-20` comment explicitly says "Phase 3 will add rate limiting; Phase 2 just calls it" — still Phase 2 in prod. |
| Backpressure            | 0/10 | **Not present.** `triggerRoom` runs sources sequentially via `sequenceLazy` (ingest.ts:105). A hung source blocks the tick. `runRooms` (loop.ts:217) is also strictly sequential — comment admits: "Sequential to avoid parallel writes to graph.json." No queue abstraction, no concurrency cap. |
| Dead-letter handling    | 2/10 | Errors are **logged to stderr** (claude-sessions.ts:316-333) or swallowed into a `SourceRun.error` field (ingest.ts:106-113). No DLQ, no quarantine store, no operator inbox, no replay ability. A bad item is counted as skipped and forgotten. |
| Metrics                 | 0/10 | **Zero metrics libraries.** grep `metric\|prometheus\|counter\|histogram\|gauge\|opentelemetry` → 0 hits in `src/`. The only counters are `items_seen/new/updated/skipped` on the `SourceRun` value object, which is written to a markdown report and discarded. No time-series, no export. |
| Traces                  | 0/10 | **Not present.** Zero `opentelemetry`, `tracer`, `span` imports. Error paths use `formatError` for log strings only. |
| Logs                    | 3/10 | `daemonLog()` appends to `~/.akashik/daemon.log` (loop.ts:118-125). Plain-text, unstructured, no level, no correlation id, no rotation, no shipping. `claude-sessions.ts` uses raw `console.error`. No unified logger port. |
| Lineage                 | 4/10 | Partial: `GraphNode` carries `source_uri`, `source_file`, `fetched_at`, `content_sha256`, `kind`. Chunks add `chunk_index`, `chunk_count`. But there is no ingest-run id, no adapter version, no config snapshot, no git commit of the adapter code at index time. Cannot answer "which config produced this node". |
| Schema migrations       | 4/10 | Good for `code-graph.db`: `PRAGMA user_version`, explicit `CODE_GRAPH_SCHEMA_VERSION = 1`, forward-compat error on newer (code-graph.ts:34, 141-150). `sessions-state.json` also has a `version` field with reject-on-newer (sessions-state.ts:131-138). **Graph.json has no schema version field** — the `doc_meta.raw_text` column addition in the bench had to be detected via column-exists probe because NetworkX node-link dicts are schemaless. |
| CI pipeline tests       | 3/10 | `.github/workflows/ci.yml` runs `npm run build` + `npm test` (node --test over tests/*.test.ts) on node 20/22. **Does NOT run any bench script**. `scripts/bench-beir.mjs`, `bench-beir-sota.mjs`, `bench-room-routing.mjs` are not invoked. No NDCG regression gate. No fixture ingest smoke test. |

**Aggregate: 31 / 110 = 28%.** That is roughly "we built the pipe correctly for the happy path, but every failure mode is either unhandled or silently absorbed." Production data systems live and die on the non-happy path.

---

## 3. Ingest adapter audit — consistency across 25 adapters

Pattern every adapter **should** follow (derived from `Source` port in `src/domain/sources.ts`):

```ts
parseConfig(raw) → cfg | null     // runtime-narrow the YAML blob
buildUrl(cfg)    → string         // deterministic URL
fetchItems()     → ResultAsync<readonly ContentItem[], AppError>
  deps.http.get(url).mapErr(AppError).andThen(parseResponse).map(hitToItem)
```

### 5 BEST (most contract-aligned)

| Rank | Adapter                | Why                                                                                                              |
|:----:|------------------------|------------------------------------------------------------------------------------------------------------------|
| 1    | `hn-algolia.ts`        | Textbook: `parseConfig` → `buildUrl` → `parseResponse` (typed AlgoliaHit) → `hitToItem` (nullable guard) → max cap loop. Clean error type `GraphError.parseError`. |
| 2    | `arxiv.ts`             | Reuses `normalizeFeed` domain helper, strips `v\d+` for dedup, typed config shape, single `parseConfig` that returns `null` on invalid. |
| 3    | `generic-rss.ts`       | The reference implementation the whole feed family descends from. Tight error chain, no exceptions leaking.      |
| 4    | `generic-url.ts`       | Reuses `response.url` as `source_uri` so post-redirect dedup works. Delegates to `html.extract`.                 |
| 5    | `claude-sessions.ts`   | Extensive comments, belt-and-suspenders current-session guard, cross-process lock on state, partial-line buffering, single state-write per tick. This is the only adapter with **incremental watermarks** — everyone else re-fetches wholesale. |

### 5 WORST (most bespoke / inconsistent)

| Rank | Adapter                | Why                                                                                                              |
|:----:|------------------------|------------------------------------------------------------------------------------------------------------------|
| 1    | `github-trending.ts`   | Inline config parsing (no separate `parseConfig`), try/catch wrapped around `JSON.parse` + map in one blob, string-concat of `q` with `pushed:>${date}` breaks if user supplies their own date filter. No shared GitHub error type — leaks `GraphParseError` from a non-graph context. |
| 2    | `codebase.ts`          | Walks the filesystem with `readdirSync`/`statSync` directly — no `fs` port, no watermark. Regex-based export/import parsing despite the comment claiming "TypeScript compiler API" (line 7 vs actual line 100). `catch {}` silently drops unreadable files. Every tick re-reads every file; no mtime check. |
| 3    | `git-log.ts`           | `spawnSync` inside a ResultAsync — synchronous blocking on every git call. `getChangedFiles` is called **per commit** inside a map, serializing N git child processes. No max bytes on stdout. Error type is `GraphReadError` for a git subprocess failure. |
| 4    | `twitter-search.ts`    | Reads from a user-maintained JSON file `~/.akashik/twitter-cache.json`, treats all failures as empty array, silently drops malformed entries. Is effectively a no-op by default. Comment admits it's a stub. |
| 5    | `codebase.ts` (counted once, but honorable mention: `image-metadata`, `pdf-text`, `audio-transcript`, `image-ocr` are all `stubAdapter` in the registry — they return `okAsync([])`, meaning the pipeline thinks they ran successfully when nothing happened. **That is a silent-failure anti-pattern** for data engineering.) |

**Error-handling styles observed across 25 adapters:** at least **5** distinct shapes:

1. Return `errAsync({type: 'InvalidNode', field, node_id})` (arxiv, hn, generic-url, twitter)
2. Return `errAsync({type: 'GraphReadError', path, message})` (codebase, git-log)
3. Return `errAsync({type: 'GraphParseError', path, message})` (github-trending)
4. `console.error` + `continue` + return partial result (claude-sessions)
5. `catch {}` → return empty (twitter-search cache read)

There is no single adapter error taxonomy. This means `SourceRun.error` aggregation is best-effort; a dashboard cannot group failures by category. A production data pipeline would use one `AdapterError = { kind: 'config' | 'network' | 'parse' | 'auth' | 'ratelimit' | 'empty', ... }`.

---

## 4. Incremental re-index cost — walking the code paths

**Scenario:** one ArXiv paper (`source_uri = http://arxiv.org/abs/2403.12345`) has its abstract revised. The user hits the next daemon tick on the room that owns the `arxiv` source.

Walking the actual code:

1. **`runOneTick`** (`loop.ts:136`) — loads `rooms.json`, picks the room.
2. **`triggerRoom`** (`ingest.ts:81`) — loads `sources.json`, filters by room, hydrates `arxivSource(descriptor)`.
3. **`arxivSource.fetch`** (`arxiv.ts:75`) — HTTP GET `export.arxiv.org/api/query?...&max_results=10`. **Pulls ALL 10 papers in the query, not just the changed one.** No `since` / `mod_since` / cursor. **Bytes read from ArXiv: ~50 KB of Atom XML for the full 10.**
4. **`processItems`** (`ingest.ts:130`) — calls `deps.graphs.load()` **once** to get the full graph into memory. Current graph.json in this project is ~9,918 nodes; `fileGraphRepository.load` reads the **entire JSON file** (`readFile(path, 'utf8')`) and `JSON.parse`s it. **Bytes read from disk: ~50-200 MB for a mature graph.**
5. **`classifyItem`** (`ingest.ts:165`) — for each of the 10 fetched items, computes `sha256(normalised(text))` and compares to `existing.content_sha256`. The 9 unchanged papers hit the skip branch. The 1 revised paper hits `updated`.
6. **`actOnDecision`** → **`indexChunksFor`** (`ingest.ts:201`) for the 1 changed paper:
   - `chunkText(item.text)` — typically 2-4 chunks for an abstract.
   - For each chunk, calls `indexNode` (`use-cases.ts:92`):
     - `embedder.embed(chunk)` → **ONNX forward pass, 384-dim vector per chunk**. ~100-300 ms per chunk on CPU.
     - `vectors.upsert(record)` → DELETE + INSERT in sqlite-vec (via WAL). Cheap.
     - **`graphs.load()` AGAIN** — reloads, parses the **entire 9,918-node graph.json** a second time. **Bytes read: ~50-200 MB.**
     - `upsertNodePure` — in-memory pure update.
     - **`graphs.save(next)`** → `JSON.stringify(toJson(graph), null, 2)` + write to `.tmp` + rename. **Writes the entire 9,918-node graph.json to disk.** **Bytes written: ~50-200 MB.**
   - Loop repeats per chunk. With 3 chunks: **3× full graph load, 3× full graph write.**
   - After all chunks, `indexChunksFor` loads the graph a **fourth** time to add `next_chunk` edges between siblings, then **saves again**. **4th full rewrite.**
7. `aggregateRun` returns `SourceRun { items_seen: 10, items_updated: 1, items_skipped: 9 }`.

**Total cost to update 1 paper with 3 chunks in a 10k-node graph:**

| Resource                    | Count                             | Amount                        |
|-----------------------------|-----------------------------------|-------------------------------|
| HTTP to arxiv.org           | 1                                 | ~50 KB                        |
| Full graph.json reads       | **5** (1 classify + 3 chunks + 1 edges) | **~250 MB – 1 GB**      |
| Full graph.json writes      | **4** (3 chunks + 1 edges)        | **~200 MB – 800 MB**          |
| ONNX embeddings computed    | 3                                 | 3 × 384-dim                   |
| sqlite-vec upserts          | 3                                 | ~4 KB                         |
| Bytes of *actual* new data  | —                                 | ~2 KB chunk text              |

**The ratio of I/O to new data is ~100,000× to 500,000×.** The graph.json full-rewrite on every node upsert is the single biggest production scalability problem in the pipeline. For any room with more than a few thousand nodes, each item ingest is O(|graph|) in both directions. At 50k nodes this is seconds per chunk on a fast SSD, minutes on a slow disk. The architecture explicitly serializes the tick because "parallel writes to graph.json" would race — that race exists because the persistence layer is a single JSON blob, not a database.

**Fix:** graph.json should become append-only or node-keyed (LMDB, SQLite with a `graph_nodes` + `graph_edges` table, or even one JSON file per node). The `code-graph.db` adapter already does this correctly — `upsertNodes` is a single transaction that touches only changed rows (code-graph.ts:239-267). Bring the main graph up to the same bar.

---

## 5. Observability gap analysis — 5 things that should be observable but aren't

1. **Ingest failure rate per source adapter.** Not counted, not logged as a metric, not queryable. `SourceRun.error` is carried to the markdown report and then thrown away. A data engineer cannot answer "which of my 25 adapters has the highest failure rate this week" without grepping `daemon.log`. **Needed:** a `counter{source_id, kind, outcome}` incremented on every `ingestSource` return.

2. **Embedder latency distribution.** `embedder.embed(text)` is called N times per tick with zero instrumentation. A regression in the ONNX model loader (cold start vs warm) is invisible. **Needed:** `histogram{stage="embed", source_kind}` with p50/p95/p99 per tick.

3. **Graph write size and duration.** `fileGraphRepository.save` rewrites the full graph synchronously with zero instrumentation. There is no alert when the graph.json doubles in size, no alert when save takes >5s. **Needed:** `histogram{operation="graph_save", bytes, duration_ms}`.

4. **HTTP retry/rate-limit behaviour.** Not observable because **not implemented** — but even the single attempt has no status-code counter. An adapter silently 429'ing for a week is indistinguishable from an adapter that returns empty results. **Needed:** `counter{source_id, http_status}` + alert on `http_status >= 400 / total > 0.1`.

5. **Chunk count drift.** If `chunkText` behaviour changes (bigger chunks, different paragraph detector), the number of chunks per item silently shifts, which changes recall and embedding cost. There is no historical chunk count per ingest run. **Needed:** `histogram{source_kind, chunks_per_item}` and log a dbt-style snapshot so the lineage shows "this node's chunk_count was 3 on 2026-04-01, 5 on 2026-04-13, same content_sha256."

**Single-pane-of-glass proposal:** a Prometheus exporter port under `src/infrastructure/metrics.ts` (ResultAsync-friendly wrapper around prom-client), plumbed through `runOneTick` via `DaemonDeps.metrics`. The telegram/MCP adapters already scrape stats; wire the same registry to a `/metrics` HTTP endpoint on port 9090 so `scripts/dashboard.sh` can render it.

---

## 6. Schema migration strategy — concrete proposal for akashik

**The bench-discovered bug:** a new `raw_text` column was added to `doc_meta` in a rebuild. Cached databases from prior runs didn't have the column. Reads threw `SqliteError: no such column: raw_text`.

**Why this happened:** graph.json is schemaless (NetworkX node-link is a free-form dict, and `fromJson` passes extras through unchanged — ingest.ts:20-21 comment admits it). SQLite databases for vectors and code-graph versioned schemas via `PRAGMA user_version`, but `doc_meta` (presumably added in a later phase) didn't get a migration.

**Concrete 5-step migration strategy for v2.1:**

1. **Stamp every persistent store with a schema version.**
   - `graph.json` gets a top-level `{"schema_version": 2, "nodes": [...], "edges": [...], ...}`.
   - `vectors.db` gets `PRAGMA user_version = N` on open.
   - `code-graph.db` already has this; extend the convention.
   - `sessions-state.json` already has this; extend the convention.

2. **Ship a single `src/infrastructure/migrations/` module** with one file per version:
   ```
   migrations/
     graph_v1_to_v2.ts     // export const migrate = (old: GraphV1) => GraphV2
     vectors_v1_to_v2.ts   // export const migrate = (db: Database) => ResultAsync<void, ...>
     code_graph_v1_to_v2.ts
   ```
   Each exports `migrate(old) → ResultAsync<new, MigrationError>`. No shared base class — pure functions composed via a `runMigrations(currentVersion, targetVersion, db)` driver.

3. **Run migrations eagerly on open.** `fileGraphRepository.load`, `openSqliteVectorIndex`, and `openCodeGraph` all already lazy-open. Wrap each with a `migrate` step that reads the version, replays migrations sequentially up to `CURRENT_SCHEMA_VERSION`, and persists the new version stamp before returning the store. Write the pre-migration file to `graph.json.v<n>.bak` once, never overwrite.

4. **Forbid silent downgrades.** All three stores already reject "version > supported" with a clear error (see code-graph.ts:146-150 and sessions-state.ts:131-138). Copy that pattern to graph.json loader. This prevents an old daemon from silently corrupting a new-schema graph.

5. **CI-gate every schema change.** Add a test `tests/migration-roundtrip.test.ts` that:
   - Loads the oldest-supported schema fixture from `tests/fixtures/schemas/graph_v1.json`.
   - Runs the full migration chain.
   - Asserts the resulting graph passes the current domain validator.
   - Asserts the `schema_version` field is stamped.
   - Asserts a round-trip save + reload preserves every node.
   This catches "you added a field but forgot the migration" at PR time.

This approach mirrors how Prisma, Flyway, and Alembic handle DB migrations, and is compatible with the project's functional style (migrations are pure functions in `ResultAsync`, no DDL-only tool required).

---

## 7. CI for the data pipeline — concrete GitHub Actions workflow

**File:** `.github/workflows/bench.yml` (new, alongside the existing `ci.yml`).

```yaml
name: Bench
on:
  pull_request:
    branches: [main]
    paths:
      - 'src/**'
      - 'scripts/bench-*'
      - 'tests/fixtures/bench/**'
      - '.github/workflows/bench.yml'

jobs:
  bench:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
          fetch-depth: 0  # needed for git-log adapter fixture

      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }

      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }

      - run: npm ci
      - run: npm run build
      - run: bash scripts/bootstrap.sh

      # Tiny fixture: 200 passages x 20 queries from the same BEIR slice
      # checked into tests/fixtures/bench/mini/.
      - name: Run mini bench
        id: bench
        run: |
          node scripts/bench-beir.mjs \
            --fixture tests/fixtures/bench/mini \
            --passages 200 \
            --queries 20 \
            --out bench-results.json
          cat bench-results.json

      - name: Restore baseline
        uses: actions/cache@v4
        with:
          path: .bench-baseline.json
          key: bench-baseline-main
          restore-keys: bench-baseline-

      - name: Compare vs baseline
        id: diff
        run: |
          node scripts/bench-compare.mjs \
            --current bench-results.json \
            --baseline .bench-baseline.json \
            --out bench-diff.md \
            --ndcg-regression-threshold 1.0
          echo "exit=$?" >> $GITHUB_OUTPUT

      - name: Post PR comment
        if: github.event_name == 'pull_request'
        uses: marocchino/sticky-pull-request-comment@v2
        with:
          header: bench
          path: bench-diff.md

      - name: Fail on NDCG regression >= 1 point
        if: steps.diff.outputs.exit != '0'
        run: |
          echo "::error::NDCG@10 regressed by >= 1 point vs main baseline"
          exit 1

      - uses: actions/upload-artifact@v4
        with:
          name: bench-results
          path: |
            bench-results.json
            bench-diff.md
```

**Supporting additions required** (each 1 small PR):

- `scripts/bench-compare.mjs` accepts `--ndcg-regression-threshold` and exits non-zero on regression.
- `tests/fixtures/bench/mini/` — 200 passages (<100 KB) + 20 queries + qrels. Deterministic, seed-stable.
- `scripts/bench-beir.mjs` gains a `--fixture` flag so it does not need network access in CI.
- A nightly `bench-baseline.yml` workflow re-runs on `main` and uploads `bench-baseline.json` to the cache key the PR job restores.
- The `items_seen/new/updated/skipped` aggregate counters from a fixture `triggerRoom` run should also be asserted — e.g. `items_updated==0` on second run proves dedup works.

This is ~30 lines of config + 3 small script changes. It catches silent NDCG regressions, silent 0-new-items regressions, and the `raw_text` schema bug would fail the fixture ingest on every PR.

---

## 8. Top 3 data-engineering additions for v2.1 — ordered by ROI

### 1. Replace graph.json full-rewrite with a SQLite `graph_nodes` table (HIGH ROI, MEDIUM EFFORT)

**Why:** killed by the cost analysis in §4 — every ingested chunk currently triggers a full graph rewrite. At 10k nodes this is the dominant cost. At 100k it is unusable.

**Impact area:**
- New: `src/infrastructure/graph-sqlite-repository.ts` (mirror `code-graph.ts` layout, reuse its migration pattern)
- Modify: `src/infrastructure/graph-repository.ts` — add factory switch `fileGraphRepository | sqliteGraphRepository`
- Modify: `src/application/use-cases.ts:110-124` — remove the load-full + save-full pattern, replace with `upsertNode(node)` direct call
- Migrate: `migrations/graph_json_to_sqlite.ts` — read legacy graph.json once, write all nodes to graph.db, leave a backup
- Tests: adapt phase1.graph-rooms.test.ts + a new concurrency test that triggers 100 parallel upserts

**Effort:** ~2-3 days for a senior. High confidence — the `code-graph.ts` adapter is a ready-made template.

**ROI:** eliminates the sequential `runRooms` constraint (loop.ts:217 comment), unlocks parallel source ingest, drops per-item write cost from O(|graph|) to O(1), removes the single biggest production blocker.

### 2. Unified `AdapterError` taxonomy + typed retry/backoff middleware (HIGH ROI, LOW EFFORT)

**Why:** §3 found 5 distinct error-handling styles across 25 adapters. §2 scored retries 1/10. Both fix with one change.

**Impact area:**
- New: `src/domain/adapter-error.ts` — `AdapterError = { kind: 'config' | 'network' | 'ratelimit' | 'parse' | 'auth' | 'empty' | 'quota', source_id, message, retry_after_ms? }`
- New: `src/infrastructure/http/retry-fetcher.ts` — `retryFetcher(inner: HttpFetcher, opts): HttpFetcher` with exponential backoff + jitter + per-host rate-limit awareness (reads `Retry-After` header)
- Modify: every adapter in `src/infrastructure/sources/*.ts` to return `AdapterError` instead of ad-hoc `GraphReadError` / `GraphParseError`. Mechanical — most is `mapErr(toAdapterError)`.
- Modify: `src/domain/sources.ts` — `SourceRun.error?: AdapterError` (was `AppError`)
- Tests: one retry test with a flaky mock http, one rate-limit test

**Effort:** ~2 days for a senior. Mechanical changes to 25 files, but each is ~5 lines.

**ROI:** every adapter gets retries for free, observability becomes groupable by `kind`, and the arxiv rate-limit comment ("Phase 3 will add rate limiting; Phase 2 just calls it") finally gets honoured. This unblocks §5 metric #4 (HTTP retry/rate-limit).

### 3. Prometheus `/metrics` endpoint + structured logger port (MEDIUM ROI, LOW EFFORT)

**Why:** §2 scored metrics 0/10, traces 0/10, logs 3/10. §5 lists 5 observability gaps, all of which are the same missing primitive: a typed `Metrics` port wrapping prom-client.

**Impact area:**
- New: `src/infrastructure/metrics.ts` — `MetricsPort = { counter, histogram, gauge, handler(): http.RequestListener }` backed by `prom-client`. Keep it behind the port so tests stay pure.
- New: `src/infrastructure/logger.ts` — `LoggerPort = { info, warn, error }` with a pino or winston adapter (JSON lines, level, correlation id from `runId`)
- Modify: `DaemonDeps.metrics: MetricsPort`, `DaemonDeps.logger: LoggerPort`
- Modify: `ingestSource`, `indexNode`, `httpFetcher` to increment counters and record histograms. 10-15 call sites.
- Modify: `src/daemon/loop.ts:startLoop` — spin up an HTTP server on `config.metrics_port ?? 9090` serving `/metrics`
- Modify: `akashik doctor` CLI — add a `metrics` subcommand that scrapes `/metrics` locally and prints a summary

**Effort:** ~1-2 days. prom-client is zero-dep and battle-tested.

**ROI:** unlocks every observability requirement in §5, makes the pipeline debuggable in production, lets `scripts/dashboard.sh` render p95 latencies and failure rates, and is a prereq for any future SLO work.

---

## Bottom line

The pipeline is architecturally clean (functional DDD, neverthrow, ports/adapters), but it is built like a **research prototype, not a production data system.** The happy path is elegant; the failure path is mostly absent. The three additions above — sqlite-backed graph, unified error + retry, metrics port — would move the production-readiness score from 28% to roughly 65% in under a week of senior-engineer time, and they are the prerequisites for every other v2.1 data-eng candidate in `.planning/v2.1-CANDIDATES.md`.
