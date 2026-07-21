# 92 — Sleep, Consolidation, and Wiring Folklore's Self-Improvement

Prompted by *Language Models Need Sleep: Learning to Self-Modify and Consolidate
Memories* (Behrouz, Hashemi, Javanmard, Mirrokni — Google Research + Cornell,
2026; [arXiv 2606.03979](https://arxiv.org/abs/2606.03979)). This note records
what that paper does, why its mechanism does **not** transfer to Folklore, the
one idea that does, and the concrete state of Folklore's own
consolidation/self-improvement machinery after this pass.

## 1. What the paper actually does (mechanism, not abstract)

A "Sleep" phase, entirely in the model's **parameters**:

- **Memory Consolidation via Knowledge Seeding** — an *upward* distillation.
  A new low-rank expert (matrices `A·B`, `d_low ≪ d`) is added to a larger
  model; the smaller model's recent in-context knowledge is distilled into
  *those new weights* via `L = reward(y) − α·KL(teacher‖student)`, freezing all
  but the expanded parameters.
- **Dreaming** — self-improvement. The model generates synthetic samples, scores
  each by gradient importance `∇_θ L_SFT`, keeps the top-k, LoRA-fine-tunes an
  isolated copy on them, and rewards (binary) whatever improves a downstream
  metric; the sampling policy is trained by ReSTEM.

Both halves require backprop. The paper is explicit that this is orthogonal to
retrieval: *"RAG or knowledge graphs lack learnable parameters to consolidate
into… Sleep solves parameter consolidation; RAG solves access to external facts.
Complementary, not competitive."*

## 2. Does Folklore need it? No — and why that's the right answer

Folklore is non-parametric: a graph of nodes, edges, and vectors, no weights, no
gradients. Knowledge Seeding and Dreaming have **zero implementation surface**
here — nothing to seed a low-rank expert into, nothing to LoRA-tune. Chasing the
mechanism would mean abandoning what Folklore is (a frozen-model-compatible,
shared, external layer) to build a different, parametric system.

The paper's value is positioning, and it *sharpens* Folklore's moat rather than
threatening it. Weight consolidation is single-brain (one agent's sleep never
reaches a peer), impossible on the frozen API models most agents actually run on,
and unattributable. Folklore is exactly the shared, frozen-model-compatible,
signed substrate those three gaps require. Written up in WHITEPAPER.md §8.

## 3. The one idea that does transfer: selective consolidation

Dreaming's core trick is **selection** — generate many candidate rehearsals,
keep only the highest-value few (top-k by gradient importance). That is the same
principle as our strongest standing result (`research/90-synthesis.md`):
*"selectivity, not volume, bounds compounding — submodular coverage, reliability
bounded by retrieval precision not network size."*

The Folklore-native form — call it **selective consolidation** (a "network
dreaming"): the consolidation worker should not summarize every eligible cluster
on a fixed cadence; it should prioritize the clusters whose consolidation most
increases coverage of live demand (recent/repeated queries) per token spent.
This is a submodular selection over candidate clusters, not an RL policy over
weights, and it reuses machinery Folklore already has (query-reuse records the
demand; consolidation produces the supply). Proposed as a follow-up experiment
in `research/91-next-experiments.md` territory — see RQ1 (reuse-as-context) for
the demand signal that would drive the selection.

## 4. State of Folklore's self-improvement machinery (this pass)

The consolidation framing the paper validates is already implemented across
`src/domain/consolidated-memory.ts` → `src/application/consolidator.ts` →
`src/cli/commands/consolidate.ts` (episodic clusters → one LLM-distilled
`consolidated_memory` node + centroid, raw episodes pruned with backup). Several
adjacent lifecycle primitives were built and unit-tested but not wired into any
running path. Status after this pass:

- **Auto-forget (TTL delete + frozen-band demote)** — **now wired.** Previously
  reachable only via `folklore gc apply` (manual). Added a daemon-tick runner
  (`src/daemon/auto-forget-tick.ts`) called in-process from the daemon loop
  (like the existing `enforceRetention` pass — no LLM, so no detached child),
  gated by `config.daemon.auto_forget.enabled` (default off), its own cadence,
  and a `dry_run` safety valve. Local-only by construction (never propagates a
  delete to peers). Covered by `tests/auto-forget-tick.test.ts`.
- **Consolidation daemon tick** — already wired, opt-in
  (`config.daemon.consolidate.enabled`, default off). No change.
- **Query-reuse (q2q inference-tree sharing)** — already wired, opt-in
  (`FOLKLORE_QUERY_REUSE=1`). No change.
- **Write-time gate** (`src/domain/write-time-gate.ts`) — **still inert, by
  decision.** `partitionByGate` filters observation writes by importance floor,
  schema, and contradiction-vs-strong-semantic. Wiring it correctly means gating
  only *observation-tier* writes (not sessions, code chunks, or consolidated
  memories) and doing a semantic-neighbor lookup at write time. The write path
  fans out across `batch-ingest.ts`, `codebase-indexer.ts`, `session-manager.ts`,
  and the `indexNode` chokepoint in `use-cases.ts`; a careless gate drops
  legitimate writes. Deferred to a focused pass rather than rushed here.
- **Beta procedural-reliability + expected-utility selection + tier-versioned
  promotion** (`src/domain/long-term-memory.ts`) — **still inert.** Requires the
  consolidation writer to stamp tier metadata (`newTierMetadata`,
  `version`/`supersedes`/`isLatest`) and the retrieval selector to consume
  `expectedUtility`/`updateBeta`. This is a retrieval-ranker change and the
  deepest of the three; deferred with the wiring points recorded here.

Net: the lifecycle GC pass is now live-capable; the two deeper primitives
(write-gating, procedural reliability) are scoped with their exact integration
points, to be wired as focused passes rather than folded into this change.
