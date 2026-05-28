# Phase 21: Long-Term Memory + Cross-Encoder Rerank — Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Long-term agent memory plus a precision lift on the existing hybrid
search. Two concerns, one phase because they share infrastructure
(SummariserProvider port, retention math, audit log).

What ships:

1. **Cross-encoder reranker** on top of the existing dense+BM25+RRF
   pipeline (Phase 23). Xenova quantised `ms-marco-MiniLM-L-6-v2`,
   top-20 window, env-gated. Expected lift: +2–4 NDCG@10 points based
   on standard ms-marco-MiniLM-L-6 benchmarks.

2. **Three new long-term memory tiers** mapped onto our existing URI
   schemes: `session://` (episodic), `synthesis://` (semantic),
   `decision://` (procedural). Auto-promotion from raw observations
   driven by a scheduled consolidate-tick. Privacy boundary:
   episodic stays local, semantic + procedural ship to `toolshed`.

3. **Bayesian reliability** on procedural memories — Beta(α,β)
   counters updated from user feedback, selection by expected utility
   (MACLA paper, arxiv 2512.18950). Replaces flat "tier weight" idea.

4. **Auto-forget tick** — TTL expiry, Jaccard-cluster contradiction
   detection, low-importance pruning. Local-only — never propagates
   delete across the mesh.

Not in scope this phase: GSW-style entity-summary retrieval (Phase C
in the planning doc, lands as Phase 22). The router decision between
hybrid-RRF and GSW lives in Phase 22.

</domain>

<decisions>
## Implementation Decisions

### Cross-encoder reranker

- Lazy-loaded singleton via `@xenova/transformers` (already a dep).
- Model: `Xenova/ms-marco-MiniLM-L-6-v2`, quantised, CPU-only.
- Top-20 window — head reranked, tail untouched, concatenated.
- Env flag: `AKASHIK_RERANK=1`. Off by default; falls open
  (returns input unchanged) on model-load failure.
- Module: `infrastructure/cross-encoder.ts`. Pure scoring math in
  `domain/cross-rerank.ts`.
- Hook point: `application/ask.ts:357`, after `searchByRoomHybrid`
  returns and before recency-rerank + PPR. The cross-encoder lifts
  precision on the head; recency + PPR keep the long-tail policy.

### Long-term memory tier schema

URI scheme → tier mapping (no schema migration — these prefixes
already pass `OPAQUE_INTERNAL_PREFIXES` in `internal-schemes.ts:50-51`):

| URI prefix | Tier | Who writes |
|---|---|---|
| `session://<sid>` | Episodic | consolidate-tick at SessionEnd |
| `synthesis://<topic-slug>` | Semantic | consolidate-tick on 6h schedule when concept cluster threshold met |
| `decision://<workflow-slug>` | Procedural | consolidate-tick when recurring pattern detected (≥2 sessions) |

Each tier node carries extended metadata on top of the existing
`GraphNode`:

```ts
// pure domain — no I/O
interface TierMetadata {
  readonly tier: 'episodic' | 'semantic' | 'procedural';
  readonly strength: number;         // [0,1] retention salience
  readonly accessCount: number;      // for retention reinforcement
  readonly lastAccessedAt: string;   // ISO
  readonly forgetAfter?: string;     // ISO, optional TTL
  readonly sources: readonly string[]; // observation node IDs this tier rolled up
  readonly version: number;          // monotonic; new version supersedes old
  readonly supersedes?: readonly string[]; // parent versions
  // procedural-only
  readonly beta?: { alpha: number; beta: number }; // reliability counter
}
```

Persisted as JSON on the existing graph node `extra` field — no
table-schema migration.

### SummariserProvider port

Mirrors `Embedder` (`infrastructure/embedders.ts:29`):

```ts
export interface SummariserProvider {
  summarise(
    system: string,
    user: string,
    opts?: { maxTokens?: number; timeoutMs?: number },
  ): ResultAsync<string, SummariserError>;
}
```

Default impl: small local instruct model via `@xenova/transformers`
(quantised). Specific candidate: `Xenova/Phi-3.5-mini-instruct` or
similar < 4 GB quantised. Falls open with a deterministic
fixture-summariser when local model unavailable, so dev environments
don't break.

BYO options via env (mirror existing pattern):
- `OPENAI_API_KEY` → `gpt-4o-mini`
- `ANTHROPIC_API_KEY` → `claude-haiku-4-5-20251001`
- `GEMINI_API_KEY` → `gemini-2.0-flash`

Provider selection in `infrastructure/summariser-factory.ts`.

### Retention scoring (domain)

Pure function, no I/O:

```
retention(node) = clip(0, 1,
    salience(node) · exp(-λ · daysSince(createdAt))
  + σ · Σ(1 / daysSinceAccess(t)) for t in recentAccesses)
```

Defaults: λ = 0.01, σ = 0.3.
Tier thresholds: hot ≥ 0.7, warm ≥ 0.4, cold ≥ 0.15.

Salience component: tier-aware base + access-count bonus.

```
salience(node) = baseSalienceForTier(tier)
               + min(0.2, accessCount × 0.02)
```

Tier base table: procedural 0.85, semantic 0.75, episodic 0.5,
observation 0.3.

### Bayesian reliability (procedural only)

Each `decision://` node carries `beta: { alpha, beta }`. On user
feedback (thumb-up via existing audit-log path):
```
α ← α + y       where y ∈ {0, 1}
β ← β + (1 − y)
```

Expected-utility selection (MACLA Eq. 4):
```
EU(proc | query) = sim(q, proc) · α/(α+β) · R_max
                 − risk(proc) · β/(α+β) · C_fail
                 + λ_info · H[Beta(α, β)]
```

Defaults: R_max = 1, C_fail = 0.5, λ_info = 0.1. Risk fixed at 1 in
Phase 21 (Phase 22 will derive risk per procedure).

### Consolidate-tick + write-time gate

- Schedule: registered with `daemon/loop.ts` ticker, same place as
  source adapters. Episodic on SessionEnd hook. Semantic +
  procedural every 6 h. Decay pass every 24 h.
- Write-time gate (arxiv 2603.15994) is a pure-domain filter that
  runs before promotion:
  - Drop observations with importance ≤ 2.
  - Drop observations that contradict an existing semantic node
    with strength ≥ 0.8 (Jaccard ≥ 0.9 on token sets).
  - Drop observations failing schema check (no concepts, no entity
    mentions).
- MAX_LLM_CALLS_PER_TICK = 10. Same budget as agentmemory. Prevents
  runaway summariser cost.

### Auto-forget tick

- TTL expiry: any node with `forgetAfter` in the past is hard-deleted
  locally. Audit-logged.
- Contradiction: Jaccard ≥ 0.9 on shared-concept clusters. Older
  node marked `isLatest = false`. Never deleted; just demoted.
- Low-importance: observations ≥ 180 days old AND importance ≤ 2.
- All cross-peer effects local-only — touch protocol just stops
  returning the demoted node.

### Cross-peer contradiction surface

Federated search hits include a `contradicts?: string[]` field
listing local node IDs the peer hit disagrees with. Statusline gets
a contradiction count; new CLI `akashik contradictions
{list,resolve}`.

</decisions>

<scope>
## Scope

In:
- domain/cross-rerank.ts, domain/long-term-memory.ts,
  domain/retention.ts, domain/consolidation.ts,
  domain/contradiction.ts
- infrastructure/cross-encoder.ts, infrastructure/summariser.ts,
  infrastructure/summariser-factory.ts
- application/hybrid-rerank.ts, application/consolidate-tick.ts,
  application/auto-forget-tick.ts
- daemon/loop.ts edits — register new ticks
- mcp/server.ts edits — expose `consolidate` + `forget` tools
- CLI: `akashik gc`, `akashik contradictions`

Out:
- GSW entity-summary retrieval (Phase 22)
- Per-procedure risk derivation (Phase 22)
- Multi-tenant team memory
- Image-memory consolidation

</scope>

<status>
## Status — 2026-05-19

Shipped this turn:

- `src/domain/cross-rerank.ts` + `src/infrastructure/cross-encoder.ts`
  + RerankError variant + wired into `application/ask.ts` after the
  hybrid retrieval stage. Env-gated `AKASHIK_RERANK=1`.
  Fail-open on model-load / inference. 8/8 unit tests.
- `src/domain/long-term-memory.ts` — MemoryTier vocabulary,
  `tierForUri`, Beta(α,β) counter math, `expectedUtility` (MACLA Eq. 4),
  retention scoring with hot/warm/cold/frozen bands, `newTierMetadata`.
  21/21 unit tests.
- `src/domain/write-time-gate.ts` — pure filter with importance,
  schema, and Jaccard-contradiction checks. `partitionByGate` for
  batch use. 12/12 unit tests.
- `src/infrastructure/summariser.ts` — Summariser port + ollama
  adapter + fixture adapter + `summariserFromEnv()` factory.
  10/10 unit tests.

Phase 21 unit total: 51/51 passing. `tsc --noEmit` clean.

Deferred to Phase 22:
- consolidate-tick + auto-forget-tick daemon wiring
- procedural-tier extractor that emits decision:// nodes
- Bayesian feedback loop (α/β updates from audit-log feedback events)
- Cross-peer contradiction surface + statusline badge
- GSW entity-summary router

</status>
