# Performance prediction matrix — hardware × rerank tier

**Drafted:** 2026-05-24
**Anchors:** T1 diagnostic on Hetzner CAX11 ARM (R@5=0.9202, R@10=0.9687, R@20=0.9925, R@50=1.000) + E11 contextual enrichment (R@5=0.9268) + E1' null with `bge-reranker-base` (R@5=0.9202) + competitor public claims (ByteRover 0.928 @ 1.6s; mem0 0.925 with LLM judge; agentmemory 0.952).

## 1. Empirical floor and ceiling

Both anchors are *measured*, not predicted:

- **Recall floor**: R@5 baseline = 0.9202 (bi-encoder + RRF, no rerank, no enrich)
- **Recall ceiling at K=20**: R@20 = 0.9925 → a perfect reranker over the top-20 head lifts R@5 to 0.9925
- **Recall ceiling at K=50**: R@50 = 1.000 → with a listwise reranker that sees the full 50 candidates, the ceiling is 1.000

Anything above 0.9925 requires going beyond cross-encoder rerank (the cross-encoder only sees the top-20 head). Anything between 0.9202 and 0.9925 is achievable with the right cross-encoder. Anything between 0.9925 and 1.0000 is reachable only with listwise rerank over a wider pool.

## 2. The prediction matrix

Rows = hardware tier (worst to best). Columns = rerank tier. Cells show **(predicted R@5, predicted per-query latency)**.

| Hardware → Rerank ↓ | **CAX11 ARM cloud** (4 GB, 2 vCPU) | **Intel/AMD laptop CPU** (16 GB, 8 cores) | **Apple Silicon M1+** (ANE + Metal) | **Apple Silicon M3+ Max** (ANE + 30+ GPU cores) | **NVIDIA RTX 3060+** (workstation) |
|---|---|---|---|---|---|
| **none** (no rerank — current baseline) | 0.920 @ 100 ms | 0.920 @ 60 ms | 0.920 @ 50 ms | 0.920 @ 40 ms | 0.920 @ 30 ms |
| **cross-encoder ms-marco-MiniLM-L-6-v2** (E1' redo, in flight) | 0.93–0.95 @ 250 ms | 0.93–0.95 @ 200 ms | 0.93–0.95 @ 150 ms | 0.93–0.95 @ 120 ms | 0.93–0.95 @ 80 ms |
| **cross-encoder + E11 enrichment stack** | 0.94–0.96 @ 250 ms | 0.94–0.96 @ 200 ms | 0.94–0.96 @ 150 ms | 0.94–0.96 @ 120 ms | 0.94–0.96 @ 80 ms |
| **LLM listwise — qwen2.5:1.5b** (small) | NOT VIABLE¹ | 0.94–0.96 @ 5–8 s | 0.95–0.97 @ 1.5–2.5 s | 0.95–0.97 @ 0.8–1.5 s | 0.95–0.97 @ 0.4–0.8 s |
| **LLM listwise — qwen2.5:7b** (medium) | NOT VIABLE¹ | 0.96–0.97 @ 15–30 s | 0.96–0.97 @ 3–5 s | 0.96–0.97 @ 1.5–3 s | 0.96–0.97 @ 0.5–1.2 s |
| **LLM listwise — gpt-oss:20b** (large, Apache 2.0 ~20B params) | NOT VIABLE¹ | NOT VIABLE² | 0.97–0.985 @ 6–10 s | 0.97–0.985 @ 3–5 s | 0.97–0.99 @ 1–2 s |
| **LLM listwise — Claude Haiku API** (cloud) | 0.97–0.99 @ 0.5–1 s³ | 0.97–0.99 @ 0.5–1 s³ | 0.97–0.99 @ 0.5–1 s³ | 0.97–0.99 @ 0.5–1 s³ | 0.97–0.99 @ 0.5–1 s³ |
| **Tiered: cross-encoder always + LLM-small on uncertain queries** | NOT VIABLE¹ | ~0.95 @ 250 ms median, 5 s p95 | ~0.96 @ 150 ms median, 2 s p95 | ~0.96 @ 120 ms median, 1.5 s p95 | ~0.96 @ 80 ms median, 0.8 s p95 |

**Footnotes:**
1. `NOT VIABLE¹` — 4 GB RAM can't fit the model in resident memory (qwen2.5:1.5b needs ~2 GB plus working set; 7b needs ~5 GB; 20b needs ~15 GB).
2. `NOT VIABLE²` — fits in RAM but encoding latency runs into the multi-minute range without acceleration. Would block the bench rather than serve users.
3. Cloud API path bypasses the local hardware constraint entirely but adds USD ~$0.0005–0.001 per query and a network round-trip.

## 3. How to read the matrix

**Vertical reading (within a hardware column):** how much R@5 lift you get from upgrading your rerank tier, given your hardware.
- On a CAX11 ARM box: cross-encoder is the ceiling (~0.95). LLM listwise is impossible.
- On an M3 Max: cross-encoder gives ~0.95; LLM-small adds another ~+1 pp at ~1s; LLM-large adds another ~+1–2 pp at ~3-5 s.
- On a GPU workstation: nothing is cost-prohibitive — pick by quality.

**Horizontal reading (within a rerank tier):** how much latency improves with better hardware at fixed quality.
- Cross-encoder latency drops 3× from CAX11 to RTX-class.
- LLM listwise drops 5–10× from CPU-only to ANE-accelerated.
- For competitive UX, anything above 1 s per query starts to feel slow; anything above 3 s feels like a separate operation.

**Diagonal reading:** "what is each user's actually-best-achievable R@5?"
- ARM-cloud / Raspberry Pi user: 0.94–0.96 (cross-encoder + E11)
- Typical M-series MacBook user with Ollama: 0.95–0.97 (llm-listwise-small)
- Heavy user with gpt-oss:20b on M3+ Max: 0.97–0.985
- Workstation user: 0.97–0.99
- Cloud-API user: 0.97–0.99 with ~$0.001/q

## 4. Competitor positioning under each tier

| System | Their R@5 | Their latency | Our matching tier |
|---|---:|---:|---|
| ByteRover | 0.928 | 1.6 s | matched by *any* cross-encoder tier on Apple Silicon + |
| mem0 (LLM-as-judge) | 0.925¹ | 1–2 s | matched by cross-encoder + E11 |
| agentmemory | 0.952 | ~2-3 s² | matched by llm-listwise-small or larger |
| MemMachine (gpt-4.1-mini judge) | ~0.92³ | 3–5 s | matched by cross-encoder + E11 |

1. mem0's LoCoMo 92.5 is composite (LLM judge), not LME-S R@5.
2. agentmemory's latency isn't publicly broken down; inferred from architecture.
3. MemMachine's LME-S number isn't published; LoCoMo 0.917 is the published anchor.

## 5. Predicted lift from EBM / LLM-listwise vs cross-encoder

The cross-encoder runs *pairwise* — independent scoring of each (query, doc) pair. The LLM listwise reranker runs *listwise* — sees the whole candidate set jointly and can rank them comparatively. Three structural advantages drive the lift estimates:

| Capability | Cross-encoder ms-marco | LLM listwise |
|---|---|---|
| Domain match (conversational sessions, LME) | Trained on web passages — partial | Prompt-conditioned — adaptive |
| Joint candidate awareness | No (pairwise scores can't compare across candidates) | Yes — full list in context |
| Negation / contradiction handling | Indirect (via training data) | Explicit (LLM understands NOT, was vs is, etc.) |
| Temporal reasoning ("before X happened") | Absent — no ordinal geometry in scores | Present — LLM can do relative time |
| Per-question routing | Fixed pipeline | LLM can self-route ("this is a temporal question, sort by date") |

The lift estimates above are anchored to:
- RankGPT (Sun et al., 2023) reported +6.1 pp NDCG@10 over ms-marco on BEIR using gpt-3.5
- RankLlama (Ma et al., 2023) reported +3–4 pp using LLaMA-7B fine-tuned for ranking
- Listwise reranking surveys (2024) consistently show +2-5 pp over pairwise on conversational tasks

LongMemEval-S specifically has +5 pp of headroom (R@5 0.92 vs R@20 0.99) that the cross-encoder demonstrably failed to capture with bge-reranker-base. The LLM listwise has a structural reason to succeed where bge failed: it can use the temporal-reasoning capability the cross-encoder lacks, and that's exactly the question type sitting in the gold-tail.

## 6. The "+EBM" prediction

If we treat "EBM" as *listwise rerank specifically* (the meaningful interpretation per our earlier discussion):

Without LLM listwise (cross-encoder ceiling): **0.93–0.96 R@5**
With LLM listwise small (qwen2.5:1.5b / phi3:mini): **0.95–0.97**
With LLM listwise large (qwen2.5:7b / gpt-oss:20b): **0.96–0.98**
With LLM listwise frontier (Claude/GPT-4-class via API): **0.97–0.99**

Theoretical retrieval-only ceiling on LME-S 50-distractor: **1.000** (matches measured R@50).

The agentmemory 0.952 number sits in the "LLM listwise small" tier in this matrix. Their architectural advantage is *they have an LLM in the pipeline* — we'd match them by adding the same.

## 7. Recommended next experiments (post ms-marco bench)

Once the in-flight ms-marco cross-encoder run lands, the next four data points are:

1. **ms-marco + E11 on Hetzner** — establishes the cross-encoder + write-path ceiling on the conservative hardware tier
2. **Mac-side baseline (no rerank)** — establishes how much faster everything is on user-real hardware (probably 3–5×)
3. **Mac-side LLM listwise with qwen2.5:1.5b** — first measurement of the small LLM rerank tier; predicted 0.95–0.97
4. **Mac-side LLM listwise with gpt-oss:20b** — first measurement of the large LLM rerank tier; predicted 0.97–0.985

Total wall-time: ~6 hours for all four, spread across Hetzner + Mac. Each one independently tells us something.

## 8. What the matrix implies about the project pitch

The defensible positioning *isn't* "we beat agentmemory on R@5" — that depends on a tier they probably already use and we're catching up to. The defensible positioning is:

> **Akashik is the only retrieval system that adapts to whatever hardware its user has.**
> On a Raspberry Pi we run a fast cross-encoder and hit ~0.94.
> On a M3 Max we run gpt-oss:20b listwise and hit ~0.98.
> On a workstation we run anything that fits.
> Across all tiers, we share results federally between peers so the same data isn't fetched twice.
>
> No competitor offers this — they're all single-tier (cloud-only or single-model).

That's the story the matrix tells, and it's much stronger than "0.96 vs 0.952" leaderboard chasing.
