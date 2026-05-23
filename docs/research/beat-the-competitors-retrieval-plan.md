# How wellinformed beats the retrieval leaderboard (forward plan)

**Status:** strategic sketch — Phase 24 candidate ratchets
**Drafted:** 2026-05-21
**Anchor numbers (Phase 23.7+ measured):**
| Benchmark | wellinformed | Competitor best | Gap |
|---|---:|---:|---:|
| LongMemEval-S R@5 (50-distractor, n=500) | **0.9202** | agentmemory 0.952, ByteRover 0.928 | -3pp / -0.6pp |
| LongMemEval-S R@5 (oracle) | 0.9990 | (at ceiling) | — |
| BEIR SciFact NDCG@10 (5,183 docs × 300 q) | **0.7202** | ColBERTv2 SOTA ~0.7522 | -3pp |
| LoCoMo harmonic-mean (n=699, retrieval-only) | 0.3536 | mem0 0.925 (LLM-judge) | not comparable |
| LoCoMo SQuAD-F1 (qwen2.5:1.5b extractor) | 0.1602 | (no published SQuAD-F1) | new axis |

The honest read: we are **0.6pp** below ByteRover, **3pp** below agentmemory, on the actual public LongMemEval-S benchmark — retrieval-only, no LLM judge. That gap is closeable.

## 1. Loss analysis — where the points actually live

Per-question-type R@5 on LME-S 50-distractor (n=500):

| Question type | n | R@5 | Headroom |
|---|---:|---:|---:|
| single-session-assistant | 56 | 1.000 | 0 |
| knowledge-update | 78 | 0.974 | ~2 pts |
| multi-session | 133 | 0.905 | ~10 pts |
| temporal-reasoning | 133 | 0.871 | ~13 pts |
| single-session-preference | 30 | 0.867 | ~13 pts |

**Where the recoverable mass is:**

1. **multi-session (0.905, 133 q)** — needs evidence from ≥2 sessions in top-5. Single-shot retrieval can't always grab both. Bi-encoder cosine doesn't compose well across hops.
2. **temporal-reasoning (0.871, 133 q)** — "earliest / latest / before X" doesn't naturally rank by date in vector space. Time is implicit at best.
3. **single-session-preference (0.867, 30 q)** — preferences stated once with different vocabulary than the question uses. Pure semantic gap.

Note small-N caveat on single-session-preference (30 q) — one bad retrieval costs 3.3pp.

## 2. Inventory — what's already in the codebase

Primitives that exist but are NOT in the bench retrieval path:

| Primitive | Where | Bench-path? | Note |
|---|---|---|---|
| Cross-encoder rerank (ms-marco-MiniLM-L-6-v2) | `src/application/ask.ts:436-441` + `src/domain/cross-rerank.ts` | **No** | Gated behind `WELLINFORMED_RERANK=1`; benches call `searchByRoom` directly, bypass `ask()` |
| Personalized PageRank rerank | `src/application/ask.ts:444` | **No** | Same — only in `ask()` |
| Mention enrichment (`buildHit`) | `src/application/ask.ts:448` | **No** | Same |
| Cross-room federated search | `src/application/use-cases.ts` | **No** | Benches scope to one room |
| Binary-quantized hot cache | `src/domain/binary-quantize.ts` | No | Hot-cache layer for query latency, not quality |
| Hyperbolic embeddings | `src/infrastructure/embedders.ts` | No | Experimental Phase 22+ |
| LLM extractor (Phase 23.8) | wired into `bench-locomo-real` | partial | LoCoMo-only |

Primitives that don't exist yet but would lift the gap:

- HyDE query expansion
- Multi-query expansion (RAG-Fusion-style 3-5 reformulations + RRF)
- Iterative multi-hop retrieval (retrieve → entity-extract → re-retrieve)
- Time-aware reranking for temporal queries
- Fine-tuned bi-encoder on held-out LongMemEval domain
- Late-interaction retrieval (ColBERTv2-style)

## 3. Experiment menu — impact / effort matrix

Ranked by `(expected lift on LME-S R@5)/(implementation hours)`:

| # | Experiment | Lift estimate | Effort | Rationale |
|---|---|---:|---|---|
| **E1** | **Wire cross-encoder rerank into the bench path** | **+2 to +5pp** | **1-2 h** | ms-marco MiniLM rerank typically lifts NDCG@10 by 3-8 points on BEIR; should generalize. Code already exists, just not invoked. |
| **E2** | Upgrade embedder: all-MiniLM-L6-v2 → bge-base-en-v1.5 (768-dim, top-MTEB) | +3 to +6pp | 1 h | Single-line model change. BGE-base on SciFact = 0.7308 NDCG@10 vs all-MiniLM 0.6440 (BEIR table). |
| **E3** | Upgrade to nomic-embed-text-v1.5 (768-dim, **8192-ctx**) | +2 to +5pp | 1 h | The 8192-ctx eliminates silent truncation on multi-session conversational evidence. Long context = better recall on `multi-session` and `temporal-reasoning` types. |
| **E4** | HyDE: Ollama-generate synthetic answer per question, embed + retrieve | +2 to +4pp | 4-6 h | Highest impact on `single-session-preference` (rephrasing gap). Reuses existing Ollama client. Adds ~500 LLM calls/bench. |
| **E5** | Multi-query expansion (3 reformulations + RRF fuse) | +1 to +3pp | 3-4 h | Helps `multi-session` by hitting different facets. Adds 3× retrieval cost. |
| **E6** | Time-aware reranking when query contains temporal keywords | +3 to +6pp on temporal subset | 2-3 h | Targeted at `temporal-reasoning` (0.871). Detect "earliest / latest / before / after / first / last" → boost by date. |
| **E7** | Iterative two-hop retrieval (entity extract → re-retrieve) | +3 to +5pp on multi-session | 6-8 h | Largest theoretical win for `multi-session`. Requires entity extraction at query time. |
| **E8** | Fine-tune bi-encoder on held-out LME pairs | +5 to +10pp | 2-3 days | Highest absolute lift but requires GPU + train infra. Risk: overfits to LME, regresses BEIR. |
| **E9** | Activate PPR rerank in bench (already wired in `ask`) | +0 to +2pp | 1 h | Free if E1 is done — both come together by routing through `ask()`. Per HANDOFF the PPR is in `ask.ts`; same bypass issue. |

## 4. Recommendation — bench-doable in ~1 day

**The plan that lands inside this week:**

```
E1 + E9 (route benches through ask())  →  +2-5pp     1 day  ← first
E2 (BGE-base embedder)                  →  +3-6pp    1 day  ← second
E3 (nomic-embed for long context)       →  +2-5pp    1 day  ← OR vs E2

Combined plausible end-state:
  LongMemEval-S R@5      0.9202  →  0.96-0.98   (beats agentmemory 0.952)
  BEIR SciFact NDCG@10   0.7202  →  0.78-0.82   (beats ColBERTv2 0.7522)
```

If those land, **wellinformed becomes the published-leaderboard leader on LME-S** with a fully open-source, CPU-only, retrieval-only pipeline. No LLM judge, no GPT-4 reasoning loop, no closed-weight model — just a clean hybrid sparse+dense+rerank+graph pipeline that beats the proprietary stacks.

**E4 / E5 / E6 / E7** are second-wave once E1–E3 are measured. They target the *remaining* loss after the easy wins — by then we'll know which question types are still bleeding.

**E8 (fine-tuning)** is the nuclear option. Park it. We don't need it to hit SOTA.

## 5. First-experiment design (E1: cross-encoder rerank in bench path)

Concrete diff:

```
// In each bench-*-real.test.ts, around the searchByRoom call:
//
// Today:
//   const r = await searchByRoom({ graphs, vectors, embedder })({ room, text, k: K });
//
// E1 path — pull rerank into the test:
//   const reranker = process.env.WELLINFORMED_RERANK === '1'
//     ? crossEncoderFromEnv() : null;
//   const r0 = await searchByRoom({ graphs, vectors, embedder })({ room, text, k: K * 4 });  // 4x candidates
//   const matches = r0._unsafeUnwrap();
//   const reranked = reranker
//     ? (await rerankMatches(text, matches, docTextOf, reranker))
//         .map((xs) => xs.slice(0, K))
//     : ok(matches.slice(0, K));
```

Run with `WELLINFORMED_RERANK=1` env on the Hetzner box. Compare against today's 0.9202 number. If lift is real, ship.

**Risk:** cross-encoder adds ~10ms/match latency. With K=5 reranked from 20 candidates, that's 200ms/query × 500 q = 100s added to LME-S run. Cheap.

**Risk #2:** the ms-marco model might underperform on conversational LongMemEval — it was trained on web-search pairs. If E1 underdelivers, fall back to E2/E3 first.

## 6. Stretch — Phase 24 candidates

Once leaderboard-leading on retrieval, the next frontier is **hybrid retrieval + LLM extraction with SQuAD-F1 + LLM-judge as competing axes in the composite**. That makes wellinformed comparable to mem0's 92.5 LoCoMo composite — different scoring philosophy, head-to-head. Phase 23.8 already laid the SQuAD-F1 foundation; Phase 24 adds the judge axis.

Beyond that: **federated retrieval** (the unique wellinformed bet) — measure how P2P-shared rooms across multiple peers lift recall on out-of-distribution questions, vs single-peer baselines. No public benchmark covers this today; we'd publish one.

---

## 7. Multi-LLM research update (2026-05-21 — Octopus discover, 6 probes)

After running this brief through claude-octopus `discover -P` (Codex × 2 + Claude-sonnet × 2 + Gemini × 2), the synthesis surfaced **three high-ROI techniques that were missing from my E1-E8** plus several revisions to the existing plan. The key conceptual shift: I was thinking purely *read-path*; write-path interventions compound with all read-path techniques at **zero query-time latency**.

### 7.1 Three new candidates — should rank above several of my originals

| # | Technique | What it is | Targets | Lift est. | Effort |
|---|---|---|---|---:|---|
| **E10** | **Temporal Query Gate + recency-disable** | Classifier detects temporal queries ("when", "before", "earliest", "latest", "first", "last"). For matched queries, disable recency boost and substitute a temporal-distance scorer over date metadata. | temporal-reasoning **13pp** | +5–10pp on temporal subset | 2-3 h |
| **E11** | **Rule-based contextual enrichment (write-path)** | Prepend structured metadata (date, room/persona, participants, top-K extracted entities) to each session's text *before* embedding. Like Anthropic's Contextual Retrieval but rule-based — no LLM call, zero ingest cost beyond regex/NER. | multi-session **10pp**, temporal **13pp** | +3–5pp aggregate | 3-4 h |
| **E12** | **Write-path contradiction chains (`superseded_by`)** | mem0-style write-time classifier marks older conflicting preference nodes as `superseded_by` newer ones. At query time, filter or down-weight superseded nodes. Solves stale-preference pollution structurally. | single-session-preference **13pp** | +5–10pp on preferences | 4-6 h |

All three are **write-path** — they pay their cost at consolidation/index time, not query time. They also compound with E1 (cross-encoder rerank) and E2/E3 (embedder swap) — no cancellation per the synthesis.

### 7.2 Revisions to E1-E8 based on the synthesis

- **E1 reranker model**: don't just activate `ms-marco-MiniLM-L-6-v2` — *also swap the model*. The ms-marco reranker was trained on web-search ranking pairs and is **domain-mismatched for conversational memory** (which resembles a semantic-entailment task). Universal recommendation across probes: swap to **`mxbai-rerank-base-v1`** or an NLI-based cross-encoder. Same activation work; better model. Effort still ~2 h.
- **E4 (HyDE)**: gate **off** for temporal and multi-session queries. Synthesis warns HyDE actively backfires in high-distractor environments — if the LLM hallucinates a wrong date or entity in the hypothetical document, dense search pulls in highly convincing false positives. Apply HyDE only to single-session and ambiguous-vocabulary queries.
- **Late-interaction (ColBERTv2 / PLAID)**: **abandon** as a primary retrieval path. The full-corpus late-interaction index doesn't fit the Hetzner CAX11 4GB RAM constraint and isn't a natural fit for `sqlite-vec`. Only viable form is `Jina-ColBERT-v2` as a **second-stage reranker** on top-20 candidates — and even then, projected lift is small on LME-S vs other options.
- **MTEB top models (gte-Qwen2-7B, NV-Embed-v2)**: **abandon** for inference; can't fit 4GB ARM. Stick with bge-base / nomic-embed for the embedder swap. Larger models could be used to *generate synthetic training pairs* offline (E8 territory).
- **SPLADE-v3**: don't pursue in the first wave. It would replace BM25 but the storage + ingestion cost is high (~30k-vocab sparse vectors, no native `sqlite-vec` support; needs a parallel inverted index). Defer until after E1-E3 + E10-E12 are measured.
- **CRAG / Self-RAG / reasoning-augmented retrieval**: defer. They inject LLM calls into the retrieval loop, breaking the "no LLM in hot path" stance. Useful only as fallback when initial retrieval confidence is low — Phase 25 candidate.

### 7.3 Updated top-3 sprint hit-list (replaces §4)

Revised after multi-LLM synthesis:

| Rank | Action | Targets | Lift est. | Effort | Why this order |
|---|---|---|---:|---|---|
| **1st** | **E1' (rerank wired + mxbai-rerank-base-v1)** | All types | +3-7pp | 2-3 h | Free lift; activates a code path already wired but bypassed; new model is a single ONNX swap. |
| **2nd** | **E11 (contextual enrichment)** | multi-session, temporal | +3-5pp | 3-4 h | Write-path → compounds with everything. Single-pass re-index of LoCoMo + LME-S sessions to validate. |
| **3rd** | **E10 (temporal query gate)** | temporal-reasoning **specifically** | +5-10pp on temporal subset | 2-3 h | Direct attack on our weakest large-N type. Pure routing logic, no model swap. |

**Plausible combined end-state after this sprint:**
```
LongMemEval-S R@5       0.9202  →  0.965-0.975   (clears agentmemory 0.952)
LongMemEval-S temporal  0.871   →  0.93-0.97     (closes 6-10pp of 13pp gap)
LongMemEval-S multi     0.905   →  0.94-0.96     (closes 3-5pp of 10pp gap)
BEIR SciFact NDCG@10    0.7202  →  0.75-0.79     (clears ColBERTv2 0.7522)
```

Then E12 (write-path contradiction) + the original E2/E3 (embedder swap) become the second-week sprint targeting single-session-preference and the BEIR ceiling.

### 7.4 Compound vs cancel — empirical notes from the synthesis

- ✅ **Compounds:** rerank ⊕ contextual-enrichment ⊕ temporal-gate ⊕ predecessor-chains. All operate on different stages.
- ✅ **Compounds:** embedder upgrade (bge / nomic) ⊕ cross-encoder rerank. Standard BEIR finding.
- ⚠️ **Cancels:** HyDE ⊕ high-distractor temporal queries → HyDE drags retrieval *down* by 2-5pp on those subsets. Must be query-type-gated.
- ⚠️ **Cancels:** ms-marco rerank ⊕ conversational queries → domain mismatch; swap to NLI/entailment-trained reranker.
- 📊 **Diminishing returns:** rerank + multi-query + HyDE + multi-hop all stacked → published systems plateau around +8-12pp combined over the bi-encoder baseline. We're already at 0.92 LME-S; absolute ceiling on this benchmark with retrieval-only is probably ~0.97-0.98.

### 7.5 Operational gaps the synthesis flagged (not retrieval-quality but worth filing)

These are Phase 25+ but worth recording so they don't get lost:

- **CI/CD checksum pinning** — `model-checksums.json` for the Xenova ONNX weights to prevent supply-chain attacks (the bge-base defective-conversion incident is the precedent).
- **2-minute regression smoke bench** — small subset of LME-S / SciFact in CI so quality regressions can't ship silently.
- **Bus factor on `wellinformed-rs`** — Rust ARM cross-compile is specialized knowledge; consider TypeScript-only fallback path.
- **GDPR derived-data semantics** — contextual enrichment + contradiction chains create *derived* personal data that must map back to source turns for delete-by-user compliance.

Source: `~/.claude-octopus/results/probe-synthesis-1779351019.md` — 6 multi-LLM probes synthesized by Gemini-2.5-Pro, 2026-05-21. Full transcript preserved in claude-octopus state.
