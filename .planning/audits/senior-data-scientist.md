# akashik — Senior Data Scientist / MLOps Audit

**Auditor:** Senior DS agent (production ML lens)
**Date:** 2026-04-13
**Scope:** bench + retrieval pipeline at `/Users/saharbarak/workspace/akashik/`
**Out of scope:** IR-research concerns (BM25 sanitizer, BEIR methodology, encoder choice, paired bootstrap) — already covered by the research agent. This audit is purely **MLOps / production ML rigor**.

---

## 1. MLOps maturity assessment

Scoring 0-10 (0 = nothing, 10 = industry best). All scores sourced from direct file inspection.

| Capability | Score | Evidence present | What's missing |
|---|---|---|---|
| **Experiment tracking** | **1 / 10** | `bench-beir-sota.mjs` writes `results.json` to `~/.akashik/bench/<dataset>__<model-slug>/results.json` with a `timestamp` field. | No git SHA, no experiment ID, no run grouping, no parent/child runs, no params history, no artifact tracking. Two runs with identical flags at different times overwrite each other. `grep -r "git rev-parse\|COMMIT_SHA" scripts/` returns **zero hits**. |
| **Model versioning / registry** | **0 / 10** | Model ID is a string arg: `--model nomic-ai/nomic-embed-text-v1.5`. Default hardcoded in `embedders.ts:56`. | No registry, no version pinning beyond HuggingFace hub tags (mutable), no approval workflow, no staging/production channels, no rollback path. If HF re-publishes a model under the same tag the production encoder silently changes. |
| **Drift detection** | **0 / 10** | None. | Phase 20 auto-ingests Claude Code session history into `sessions` room. No mechanism tracks embedding distribution drift, no PSI/KL divergence monitor, no canary query set whose NDCG is tracked week-over-week, no alert on sudden p95 latency shift. |
| **Feature flags** | **0 / 10** | `use-cases.ts` hardcodes `searchByRoom` / `searchGlobal` call graph. No flag abstraction. | Phase 22 (bge-base swap) is planned as a big-bang default change in `v2.1-CANDIDATES.md` Candidate A — no `encoder_variant=nomic\|bge` runtime switch, no per-query routing, no split-traffic capability. |
| **Canary deployments** | **0 / 10** | None. | The planned encoder swap has no shadow/canary mode. The bench is a one-shot run against a fixed dataset, not a live comparison against a pinned-production baseline. |
| **Model monitoring** | **1 / 10** | Bench measures per-stage p50/p95 latency (`bench-beir-sota.mjs:517-524`). | No production-time latency histogram, no error-rate counter, no embedding-failure rate, no OOM/crash counter, no Prometheus/OpenTelemetry export. The MCP server surfaces none of this. |
| **User feedback loops** | **0 / 10** | `grep -r "feedback\|rating\|thumbs" src/` hits only `src/domain/sharing.ts` (room-sharing feedback, unrelated). | The MCP `search` / `ask` tools return results and vanish. No click-through capture, no "was this helpful", no query→answer→outcome log. Zero training signal accumulates. |
| **SLO / SLA definition** | **0 / 10** | None. | No `docs/SLO.md`, no error budget, no uptime target, no latency commitment. The README shows benchmark p50 (3-36 ms) but does not commit to a production SLO. |
| **Retrieval quality gates in CI** | **1 / 10** | `tests/bench-standard.test.ts` exists with 15 Wikipedia passages × 10 questions, computes NDCG@10. `tests/bench-onnx.test.ts` and `tests/bench-real.test.ts` run ONNX smoke tests. | The gates are **toy fixtures**, not real datasets. There is no assertion of the form `assert ndcg10 >= 0.70 on SciFact-mini`. `grep NDCG tests/` hits 5 files — none assert a floor. The 313/313 test pass rate gives zero signal about whether retrieval quality regressed. |

**Overall MLOps maturity: 3 / 90 (3.3%)** — this is a research-grade bench bolted onto a production artifact with **no MLOps substrate**. Every individual best practice is absent. This is normal for a solo-dev local tool; it becomes a liability the moment another developer tries to reproduce a number or the author ships a regression.

---

## 2. Experiment design critique

### What's wrong with the current bench setup

`bench-beir-sota.mjs` is a good IR script and a **non-reproducible experiment**. Specifically:

1. **No immutable run identity.** The only grouping key is `<dataset>__<model-slug>__hybrid__rerank`. Run it twice with different flag combos at different commits and you cannot tell them apart — the newer one overwrites the older. `results.json:560` has only `timestamp`, no `commit_sha`, no `run_id`, no `parent_run_id`.
2. **Cache-dependent results.** Line 138: `CACHE_OK = existsSync(DB_PATH)`. The `.akashik/bench/` SQLite DBs are not in git. Re-running someone else's published numbers requires (a) the same commit, (b) the same HF model cache, (c) the same DB cache, (d) the same dataset zip. The bench is not reproducible from source alone.
3. **Embedder non-determinism.** `@xenova/transformers` ONNX runtime has no seed pinning in `embedders.ts`. Two consecutive runs on the same machine are bitwise identical (deterministic CPU inference), but across Node.js versions or transformers.js minor versions the vectors shift by O(1e-6), which on SciFact changes per-query ranks and thus NDCG by O(0.1 pts). There is no assertion that this is bounded.
4. **No hyperparameter history.** RRF `k=60`, `DENSE_K=100`, `BM25_K=100`, `HYBRID_QUERY_MAX_TOKENS=50`, `k1=0.9`, `b=0.4` — all hardcoded or passed via argv. Never persisted into the run record with a diff against the previous run.
5. **No hardware capture.** CPU model, CPU core count, SIMD flags, RAM, Node version, OS — all missing from `results.json`. The BENCH-v2.md top-of-file block shows this was captured by hand; `bench-beir-sota.mjs` does not emit it programmatically.

### What a production ML experiment should look like here

You don't need MLflow — a 150-line custom JSON tracker is enough for a solo-dev tool. Concretely:

```jsonc
// ~/.akashik/experiments/<run_id>.json
{
  "run_id": "2026-04-13T22:14:03-nomic-scifact-hybrid-a3f8b21",
  "parent_run_id": null,
  "git_sha": "a3f8b21",
  "git_dirty": false,
  "git_branch": "main",
  "created_at": "2026-04-13T22:14:03.123Z",
  "config": {
    "dataset": "scifact", "split": "test",
    "model": "nomic-ai/nomic-embed-text-v1.5",
    "dim": 768, "max_length": 8192,
    "doc_prefix": "search_document: ", "query_prefix": "search_query: ",
    "hybrid": true, "rerank": false,
    "dense_k": 100, "bm25_k": 100, "final_k": 10,
    "rrf_k": 60, "bm25_k1": 0.9, "bm25_b": 0.4,
    "hybrid_query_max_tokens": 50,
    "bm25_stopwords": "lucene-english-33"
  },
  "env": {
    "node": "v25.6.1", "platform": "darwin-arm64",
    "cpu": "Apple M3 Max / 10 cores", "ram_gb": 32,
    "sqlite": "3.51.0", "sqlite_vec": "0.1.6",
    "transformers_js": "2.17.2", "onnxruntime": "..."
  },
  "metrics": { "ndcg_at_10": 0.7290, "map_at_10": 0.6814, ... },
  "per_query_ndcg10": [...],
  "per_query_qids": [...],
  "latency_ms": { "dense_p50": 2, "bm25_p50": 2, "total_p50": 38, ... },
  "artifacts": {
    "db_sha256": "f1e2...", // hash of sota.db after indexing
    "dataset_sha256": "a7c4...", // hash of corpus.jsonl
    "model_sha256": "e9b1..." // hash of onnx file
  },
  "duration_ms": 1423000,
  "status": "completed"
}
```

**Implementation:** a new `scripts/lib/experiment-tracker.mjs` (~150 LOC) that `bench-beir-sota.mjs` imports. Replace the current `results.json` write with `tracker.end(result)`. Add `scripts/bench-log.mjs` to `cat ~/.akashik/experiments/*.json | jq` the experiment log, filter by dataset/model, and diff runs. Total added deps: zero (jq is optional).

**Why not MLflow local mode?** Python dep, `mlruns/` directory, UI server. Overkill for a Node.js solo tool. The JSON log above gives 90% of MLflow's value at 10% of the cost, and bench-compare.mjs can already consume it unchanged.

---

## 3. Gradual rollout plan for Phase 22 (bge-base swap)

The current plan in `v2.1-CANDIDATES.md` Candidate A is a **big-bang default change**: flip `DEFAULT_DIM` from 768 to 768 (same), swap `nomic-embed-text-v1.5` for `bge-base-en-v1.5`, force users to re-index. This is the opposite of a safe rollout.

### Proposed canary design

Even on a single-user local tool, the canary pattern is correct — it gives reversibility and per-query telemetry for free.

**Phase 22a — shadow mode (one day).** Add `EmbedderVariant = "nomic" | "bge" | "canary"` to config. `"canary"` mode embeds the query with *both* encoders in parallel, runs both retrieval pipelines, returns the production (`nomic`) result to the user, and logs the paired result to `~/.akashik/canary/<timestamp>.jsonl`:

```jsonc
{"t": "2026-04-14T10:03:22Z", "query_hash": "abc123", "room": "research",
 "prod_variant": "nomic", "canary_variant": "bge",
 "prod_top10": ["doc42","doc7",...], "canary_top10": ["doc7","doc42",...],
 "prod_latency_ms": 38, "canary_latency_ms": 41,
 "overlap_at_10": 0.8, "kendall_tau": 0.72}
```

No user impact. Pure telemetry.

**Phase 22b — per-query paired evaluation.** After 500 canary samples, run `scripts/canary-report.mjs` which:
- Computes paired overlap@10, Kendall's tau on top-10 between `prod` and `canary`
- Runs each canary result against a local gold set (user-marked "this was the right answer" labels — see §4) if any exist
- Emits a go/no-go signal: `overlap ≥ 0.6 AND p95_latency_delta < +30% AND no errors`

**Phase 22c — 10% traffic split.** Add `canary_fraction = 0.10` to config. `src/application/use-cases.ts searchGlobal` becomes:

```ts
const variant = Math.random() < config.canary_fraction ? "bge" : "nomic";
const t0 = Date.now();
return deps.embedders[variant].embed(text).andThen(...)
  .map((res) => { logCanaryEvent({ variant, latency: Date.now() - t0, hits: res.length }); return res; });
```

**Phase 22d — auto-rollback sentinel.** Background worker reads the canary log every 100 queries. If `bge` p95 > `nomic` p95 × 1.5 OR `bge` error-rate > 1% OR `bge` overlap@10 < 0.4 → emit desktop notification "akashik: canary bge-base showing regression, auto-disabling" and flip `canary_fraction = 0`. The `nomic` encoder is never removed from disk so rollback is one config flag.

**Phase 22e — promotion.** After 7 days of clean canary at 10%, bump to 50%, then 100%. Only after 100% clean for 7 days does `nomic` get deprecated — and even then, keep it downloadable under `akashik config set encoder nomic` as a fallback.

**Why this matters even for a solo tool:** when the user reports "the ask tool got worse after the update," you can say "canary has been running for 3 days, overlap@10 is 0.78, here's the paired sample where bge lost — let's look at that query." Without canary, the answer is "re-run the whole BEIR bench locally and hope you can tell."

**Effort:** ~1.5 days. Reuses existing `bench-compare.mjs` paired-bootstrap primitive.

---

## 4. Active learning surface — minimum viable design

akashik captures **zero user signals**. Every query, every answer, every click — vanishes. This is the single biggest missed opportunity for a knowledge graph that lives right in the user's editor.

### Minimum viable feedback capture

**New MCP tool: `feedback_mark`.** Parameters: `{query, node_id, verdict: "helpful" | "wrong" | "duplicate" | "outdated", comment?}`. Persists to a new `feedback` room in the existing graph:

```ts
interface FeedbackRecord {
  id: FeedbackId;
  query_text: string;
  query_hash: string;           // for dedup
  query_embedding: Vector;      // store for nearest-query clustering
  result_node_id: NodeId;
  rank: number;                 // which position in the result list
  verdict: FeedbackVerdict;
  encoder_variant: string;      // which encoder produced this result
  retrieval_latency_ms: number;
  timestamp: ISO8601;
  session_id?: string;          // if called inside a Claude Code session
}
```

**Storage:** reuse `src/infrastructure/vector-index.ts` — `feedback` is just another room. Zero new infrastructure. The `VectorIndex.upsert()` path already handles per-room writes.

**UX surfacing:** in the MCP tool response for `search` / `ask`, include a hint `{...results, feedback_instructions: "Call feedback_mark({query, node_id, verdict}) to improve future results"}`. Claude agents will see this in their tool output and can proactively feed back. Humans using the CLI get a `--helpful <node-id>` flag on `akashik ask`.

### Using the signal — per-query-type RRF weighting

After ~200 feedback records accumulate, a background job computes:

```python
# pseudocode — would live in src/domain/feedback.ts
for each (query_cluster, encoder_variant):
    dense_win_rate = count(helpful && rank_dense_only ≤ rank_hybrid) / total
    hybrid_win_rate = 1 - dense_win_rate
    optimal_alpha = argmax_alpha(ndcg_on_feedback_subset(alpha * dense + (1-alpha) * bm25))
```

Store `optimal_alpha` per query cluster in a small JSON `~/.akashik/learned-weights.json`. At query time, `searchHybrid` looks up the nearest query cluster by embedding similarity, reads `alpha`, and uses it in the RRF fusion. This is a **per-query-type learned reranker without any neural network**.

**First version is crude on purpose:** no need for a learned reranker, no LambdaMART, no listwise loss. Just a lookup table of `{query_cluster: alpha}` that adapts over time. The ArguAna backfire case (BM25 hurts counter-argument queries per `BENCH-v2.md:86`) becomes self-healing once users mark a few counter-argument results as wrong.

**Effort:** ~1.5 days for capture, ~1 day for the weight-learning job. Total: 2.5 days. Per-query-type fusion is the single highest-leverage improvement you can make with real user data; SOTA retrieval systems (Google Search, Cohere Rerank) all do per-query-class weighting.

---

## 5. Retrieval quality gate for CI

`tests/bench-standard.test.ts` today is a 15-passage toy. The production pipeline can regress catastrophically and tests stay green. Concrete fix:

### New file: `tests/bench/scifact-mini.test.ts`

**Fixture.** Bundle a 200-passage × 20-query SciFact slice under `tests/fixtures/scifact-mini/` (≈300 KB, versioned in git). Slice selection: stratified sample from the full SciFact test split, preserving the qrels graded label distribution (0/1 split with ~30% positives). This is small enough to ship, large enough to produce stable NDCG@10 (σ ≈ 0.015 on n=20 queries is tolerable for a floor-gate with a safety margin).

**Test spec (pseudocode):**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { xenovaEmbedder } from '../src/infrastructure/embedders.js';
import { openSqliteVectorIndex } from '../src/infrastructure/vector-index.js';
import { indexNode, searchHybrid } from '../src/application/use-cases.js'; // post-Phase 22
import { ndcgK, loadScifactMini } from './fixtures/scifact-mini/helpers.js';

const GATE_NDCG10 = 0.70;
const GATE_LATENCY_P95_MS = 100;
const GATE_INDEX_THROUGHPUT = 2; // docs/sec floor

test('scifact-mini: hybrid retrieval meets production quality gate', async (t) => {
  const { corpus, queries, qrels } = await loadScifactMini();
  const dir = t.testdir();
  const index = openSqliteVectorIndex({ path: join(dir, 'v.db'), dim: 768 });
  const embedder = xenovaEmbedder({ model: 'nomic-ai/nomic-embed-text-v1.5', dim: 768 });

  // Index — uses production code path, not bench code
  const tIdx = Date.now();
  for (const doc of corpus) {
    await indexNode({ graphs, vectors: index, embedder })({
      node: { id: doc.id, /* ... */ },
      text: doc.text, room: 'scifact',
    });
  }
  const indexThroughput = corpus.length / ((Date.now() - tIdx) / 1000);
  assert.ok(indexThroughput >= GATE_INDEX_THROUGHPUT,
    `index throughput ${indexThroughput.toFixed(1)} < ${GATE_INDEX_THROUGHPUT} docs/sec`);

  // Query — same code path as MCP search tool
  const ndcgs = [];
  const latencies = [];
  for (const q of queries) {
    const t0 = Date.now();
    const res = await searchHybrid({ graphs, vectors: index, embedder })(
      { text: q.text, k: 10 }
    );
    latencies.push(Date.now() - t0);
    assert.ok(res.isOk(), `query ${q.id} failed`);
    ndcgs.push(ndcgK(res.value, qrels.get(q.id), 10));
  }

  const meanNdcg = ndcgs.reduce((a, b) => a + b, 0) / ndcgs.length;
  const p95Latency = [...latencies].sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];

  assert.ok(meanNdcg >= GATE_NDCG10,
    `NDCG@10 ${(meanNdcg * 100).toFixed(1)}% < gate ${GATE_NDCG10 * 100}% — retrieval regression`);
  assert.ok(p95Latency <= GATE_LATENCY_P95_MS,
    `p95 latency ${p95Latency}ms > gate ${GATE_LATENCY_P95_MS}ms — performance regression`);
});
```

**CI integration.** Add to `package.json`:

```jsonc
"scripts": {
  "test": "node --test tests/",
  "test:quality": "node --test tests/bench/",
  "test:quality:ci": "npm run test:quality || (echo 'QUALITY GATE FAILED' && exit 1)"
}
```

**GitHub Action** runs `npm run test:quality:ci` on every PR. The gate blocks merge if NDCG@10 drops below 0.70 (with a 2-pt safety margin below the measured 72.30%). This is the **single most important missing test**: it makes "the bench" load-bearing against the "the tests" instead of decorative.

**Cost:** test takes ~90 seconds (dominated by 200-doc nomic embed). Acceptable for a merge gate. Can be scoped to a nightly job if flaky.

---

## 6. Performance targets for akashik

A local-first memory tool still needs SLOs. Proposed table (commit to these in `docs/SLO.md`):

| SLI | Target | Floor (error budget triggers alert) | Rationale |
|---|---|---|---|
| **Retrieval latency p50** (hybrid, 10K docs) | ≤ 40 ms | 80 ms | Matches measured Wave 2 SciFact p50 (36 ms) with 10% headroom. Editor integrations start to feel laggy past ~80 ms. |
| **Retrieval latency p95** (hybrid, 10K docs) | ≤ 100 ms | 250 ms | p95 is the visible experience. Anything past 250 ms breaks interactive flow. |
| **Indexing throughput (nomic, single-thread)** | ≥ 4 docs/sec | 2 docs/sec | Matches measured Wave 1 (4 docs/sec). A 2× floor gives headroom for CPU contention. Below 2 /s → investigate embedder regression. |
| **ANN recall@10 vs exact KNN** | ≥ 0.98 | 0.95 | sqlite-vec is brute-force today so recall is 1.0; when DiskANN/HNSW lands, this is the floor. |
| **Quality: NDCG@10 on scifact-mini CI gate** | ≥ 0.72 | 0.70 (test fails) | 2-pt buffer under measured production. |
| **Error rate** (all MCP tools, 24h window) | < 0.1 % | 1 % | MCP tool failures visible to the agent. Above 1% → page. |
| **Memory ceiling** (daemon, steady state) | < 1 GB | 2 GB | nomic ONNX is ~550 MB resident. Beyond 2 GB → leak. |
| **Daemon uptime** (7d rolling) | ≥ 99.0 % | 95 % | Local daemon, crash-restart is cheap. 99% = ~1.7 hrs/week downtime budget. |
| **Model cold-start** (first query after restart) | ≤ 5 s | 15 s | Dominated by ONNX session init. Past 15 s → model redownload. |

**Instrumentation:** a new `src/infrastructure/telemetry.ts` that exposes these as a `/metrics` endpoint (OpenMetrics format) from the daemon, scraped by `akashik status`. Zero new deps — plain text response.

---

## 7. Top 3 MLOps additions for v2.1 (ordered by ROI)

### #1 — Quality gate CI test (§5)

**Why first.** Cost: 1 day. Value: blocks every retrieval regression from merging. Without this, the 313/313-tests-pass signal is decorative — the tests exercise the code paths but not the quality. This is the single cheapest way to make `npm test` load-bearing for retrieval quality. **Ratio: ~10×.**

**Sketch.**
1. Sample 200 passages × 20 queries from SciFact test split, stratified on grade.
2. Commit fixture under `tests/fixtures/scifact-mini/` (git-LFS if >1 MB).
3. Write `tests/bench/scifact-mini.test.ts` per §5.
4. Add `test:quality` script + `.github/workflows/ci.yml` stage.
5. Gate threshold starts at 0.70 (2 pts under measured); tighten after 1 week of stable runs.

### #2 — Experiment tracker + git SHA in every bench run (§2)

**Why second.** Cost: 1 day. Value: the bench becomes reproducible from source. Every number in `BENCH-v2.md` becomes traceable to a commit. Enables paired-bootstrap comparison across **any two historical runs**, not just two cached runs from the same week. **Ratio: ~5×.**

**Sketch.**
1. New `scripts/lib/experiment-tracker.mjs` — 150 LOC, no deps.
2. `tracker.start({dataset, model, config})` → captures git SHA via `child_process.execSync('git rev-parse HEAD')`, hardware info via `os.*`, hashes the corpus file.
3. `tracker.end({metrics, latencies, per_query})` → writes `~/.akashik/experiments/<run_id>.json`.
4. Port `bench-beir-sota.mjs` to use it (replace the current `writeFileSync(results.json)` at line 562).
5. Port `bench-compare.mjs` to accept `run_id` as well as path.
6. Add `scripts/bench-log.mjs` — lists runs, filters by dataset/model/commit, diffs metrics.

### #3 — Feedback capture MCP tool + per-query learned fusion (§4)

**Why third.** Cost: 2.5 days. Value: closes the active-learning loop. Every query the user runs becomes a potential training signal. Even at low volume (10 feedback records/week), the per-query-type alpha weights start to adapt. This is what separates "a benchmark" from "a system that gets smarter." **Ratio: ~3×.**

**Sketch.**
1. New domain type `FeedbackRecord` + `feedback` room + `verdict` enum.
2. MCP tool `feedback_mark` wired into `src/mcp/server.ts`.
3. CLI flag `akashik ask "..." --helpful <node-id>` for humans.
4. Background job `scripts/learn-fusion-weights.mjs` clusters feedback by query embedding (k-means on stored `query_embedding`), computes optimal alpha per cluster, writes `~/.akashik/learned-weights.json`.
5. `searchHybrid` reads the weights file on startup, nearest-cluster lookup per query, applies cluster-specific alpha in RRF.
6. Hidden value: the feedback set itself becomes a **second quality gate** — a `tests/bench/user-feedback.test.ts` that re-runs every marked query and asserts the top result is still the one the user marked helpful. Effectively a user-specific regression suite.

### Not in top 3 (but worth doing eventually)

- **Drift detector** on sessions room (§1 row 3). Ship after feedback capture — drift detection without feedback is noise.
- **Canary rollout** (§3). Ship when you swap encoders again. Not needed right now because v2.1 Candidate A is already scoped.
- **OpenMetrics `/metrics` endpoint** (§6). Ship when uptime becomes a concern. For a solo-dev tool, logs-to-disk is enough.

---

## Summary

akashik is a **research-quality retrieval bench grafted onto a production MCP tool with zero MLOps substrate**. The bench methodology (thanks to Phase 21) is clean; the research agent's audit already covered that. What's missing is the production ML loop: no experiment tracking, no model versioning, no drift detection, no feedback capture, no quality gate in CI, no SLO, no canary. The 313/313 tests prove the TypeScript compiles; they prove nothing about whether a user-visible query got worse yesterday.

The three v2.1 adds above turn this from "a bench that ran once" into "a system that knows when it regresses and gets better from usage." Total cost: ~4.5 days. Total leverage: qualitative phase change in what akashik *is*.

**Word count:** ~2,400 words, MLOps-focused, no duplication with the IR-research audit.
