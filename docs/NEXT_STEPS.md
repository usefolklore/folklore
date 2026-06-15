# folklore Next Steps

> **Snapshot.** Engineering priorities from the agent-memory framing,
> moved out of the repo root. Current direction lives in
> `docs/PROJECT-PLAN-FOLKLORE.md`; the P1–P7 items below remain valid
> engineering work but read them against that plan, not as the roadmap.

This is the execution README for getting folklore closer to SOTA as a
local-first agent memory system.

The target is not BEIR leaderboard SOTA. The repo already documents that
choice in `docs/ADR-002-v4-agent-brain.md`: retrieval quality is measured, but
the stronger product claim is an agent brain that is fast, federated,
cryptographically portable, and useful before an agent burns time on repeat
research.

## North Star

folklore should make this demo feel inevitable:

1. Peer A researches or fixes something current.
2. Peer B asks Claude/Codex a related task.
3. folklore retrieves the trusted peer memory before web search.
4. The agent sees source age, workspace, peer attribution, and provenance.
5. The answer is faster, cheaper, and better than local-only context.

Everything below should serve that loop.

## Priority 1: Make Federated Search Match Local Search

Local search uses hybrid dense + BM25 retrieval. Remote peer search currently
receives only an embedding, so peers can only run vector search.

Relevant files:

- `src/application/federated-search.ts`
- `src/infrastructure/search-sync.ts`
- `src/infrastructure/vector-index.ts`
- `tests/phase17.federated-search.test.ts`

Work:

- Add an optional `query_text` field to the federated search request.
- Gate raw query sharing by config.
- When `query_text` is present, remote peers should run hybrid search across
  their shared (non-private) nodes.
- Preserve the embedding-only path for privacy-sensitive queries.
- Add tests proving local-only hybrid and federated remote hybrid return the
  same class of results on BM25-sensitive queries.

Acceptance gate:

- Federated search no longer silently downgrades remote peers to dense-only
  when config allows query text.

## Priority 2: Fix Scope-Filtered Dense Retrieval

Scoped search (by `workspace` tag or `source_uri` scheme) performs global
vector search, then filters by scope. This can miss good in-scope results when
out-of-scope nodes dominate the global nearest neighbors.

Relevant files:

- `src/infrastructure/vector-index.ts`
- `src/domain/vectors.ts`
- `tests/vector-index-binary.test.ts`

Work:

- Add a true scope-restricted dense retrieval path.
- Prefer per-scope vector partitions or a query shape that constrains by
  `workspace` / `source_uri` scheme before ranking.
- Keep binary and fp32 behavior aligned.
- Add a regression test where global top-k is dominated by out-of-scope nodes
  but scoped search still returns the correct in-scope hit.

Acceptance gate:

- Scoped search recall is independent of global overfetch luck.

## Priority 3: Ship The Native Rust CLI Path

The Rust IPC client exists, but install/package flow still centers the Node
shim. If warm hits are part of the product claim, the native path should be a
first-class shipped artifact.

Relevant files:

- `folklore-rs/src/bin/folklore_cli.rs`
- `bin/folklore.js`
- `package.json`
- `scripts/bootstrap.sh`
- `docs/V4-PROTOCOL.md`
- `docs/RELEASE-v4.md`

Work:

- Build the Rust CLI during bootstrap when Rust is available.
- Package or document the binary path clearly.
- Make command dispatch choose native IPC for delegatable commands.
- Keep the Node fallback intact.
- Add a benchmark command that reports cold, warm, daemon-hit, and fallback
  latencies.

Acceptance gate:

- A fresh user can run the native fast path without reading implementation
  notes.

## Priority 4: Wire Semantic L2 Cache Into The Daemon

The semantic cache primitive exists, but paraphrased agent queries still miss
if only exact query caching is active.

Relevant files:

- `src/domain/semantic-cache.ts`
- `src/domain/query-cache.ts`
- `src/daemon/ipc-handlers.ts`
- `src/daemon/ipc.ts`
- `src/cli/commands/cache-stats.ts`

Work:

- Embed incoming `ask` queries in the daemon.
- Check semantic cache after exact cache miss and before retrieval.
- Store successful results with query vectors.
- Clear or version caches on graph writes.
- Expose L1/L2 hit rates in cache stats.

Acceptance gate:

- Similar paraphrases within the TTL hit cache without stale graph results.

## Priority 5: Make Consolidation Ambient And Safe

Consolidation is central to long-running agent memory, but the current path is
still operator-driven or requires explicit scope config.

Relevant files:

- `src/application/consolidator.ts`
- `src/cli/commands/consolidate.ts`
- `src/daemon/consolidate-tick.ts`
- `src/infrastructure/config-loader.ts`
- `bench/bench-consolidation.mjs`

Work:

- Consolidate across the whole graph by default, auto-discovering eligible
  nodes when no consolidation scopes are configured (the
  `daemon.consolidate.workspaces` config key names the optional scope list).
- Run a pre/post retrieval-quality gate for consolidated nodes.
- Keep NDJSON backup on by default before prune.
- Record consolidation outcome per scope, not only per tick.
- Surface status in CLI and daemon logs.

Acceptance gate:

- Users can enable auto-consolidation without hand-listing scopes and without
  losing retrieval quality silently.

## Priority 6: Add Product-Shaped Evals

BEIR is useful but incomplete for this product. The important eval is whether
folklore changes agent behavior.

Relevant files:

- `bench/bench-beir-sota.mjs`
- `bench/bench-ppr-multihop.mjs`
- `tests/`
- `.planning/BENCH-v2.md`

Add eval fixtures for:

- local-only vs federated search
- dense-only vs hybrid remote search
- prior session recall
- stale source handling
- workspace / private-gate isolation
- oracle answerability
- consolidation before/after quality
- "would this avoid a web search?" agent workflow cases

Acceptance gate:

- Every major product claim has a reproducible command or test.

## Priority 7: Tighten Claims And First Impression

The public README should separate shipped behavior, benchmark-only behavior,
env-gated behavior, and future work. The current README also has a malformed
bold tag near the top.

Relevant files:

- `README.md`
- `docs/RELEASE-v4.md`
- `docs/ADR-002-v4-agent-brain.md`
- `.planning/BENCH-v2.md`

Work:

- Fix README formatting.
- Add a "What ships today" section.
- Move future claims to "Roadmap" or "Expected".
- Keep the 75.22% claim, but avoid implying BEIR leaderboard SOTA.
- Clarify which latency numbers require daemon, native client, cache hit, or
  Rust embedder.

Acceptance gate:

- A skeptical engineer can read the README and know exactly what is real now.

## Suggested Order

1. Fix README claim clarity.
2. Add scoped-search regression test, then fix scope-restricted dense retrieval.
3. Add federated `query_text` config and remote hybrid search.
4. Wire semantic L2 cache into daemon IPC.
5. Ship native CLI fast path.
6. Make auto-consolidation safe by default.
7. Add product-shaped evals and publish the results.

## Do Not Spend Time On

- Another SciFact SOTA attack unless it is tied to a product eval.
- More embedding model swaps without a clear deployment story.
- Complex graph algorithms that do not affect the peer-memory demo.
- New claims that do not have a reproducible gate.

## Definition Of Done

folklore is ready to claim category leadership when:

- federated search is not lower quality than local search by default policy;
- scoped search has deterministic recall;
- warm daemon hits are visibly fast in a fresh install;
- semantic paraphrases hit cache;
- consolidation is safe to leave on;
- evals show fewer repeated web searches or fewer repeated agent steps;
- public docs distinguish shipped facts from roadmap work.
