# Memory-Tool Benchmark — Scope (v0, draft)

_Status: scoping. No numbers here are measured yet; this defines WHAT to measure
and HOW to keep it honest. Measured results land in `docs/BENCHMARKS-RESULTS.md`._

## Why this benchmark exists

Folklore's BEIR SciFact NDCG@10 (`0.7522`, CPU hybrid) already tops the
production-grade CPU retrievers and is ~3pts behind a 3B GPU reranker
(InRanker, 0.783). That surface is **won and capped** — reranking measurably
regresses it (InRanker-base rerank → 0.615; bge-reranker → 0.704). Pushing
SciFact further is not where folklore beats its actual competitors.

Folklore's real competitors are **memory / research layers** — mem0, Letta,
LangChain RAG, Zep, Pinecone-backed RAG. They do **not** publish BEIR NDCG and
do not compete on raw retrieval quality. They compete (or fail to) on the layer
folklore is built for: answer-before-the-web, signed provenance, and
peer-to-peer compounding. There is **no published apples-to-apples memory-tool
benchmark on that axis** — this defines one.

Rule for the whole effort: **honest benches only.** Matched controls (same
embedder/store where a tool allows it), label simulator vs measured on every
number, no weak-baseline inflation, report blockers instead of working around
them with a fake.

## What we measure (the axes folklore is actually built for)

| # | Axis | Metric | Why competitors can't match it |
|---|------|--------|--------------------------------|
| A | **Web-gating** | web-fallback rate over a repeated/paraphrased query stream; paid web/API trips saved | mem0/Letta/RAG remember chats but never gate an outbound fetch — they answer, they don't deny the web |
| B | **Provenance / poison-defense** | flip-ASR under displaced-poison retrieval, with vs without provenance ranking | none carry signed, attributable provenance per record |
| C | **Federated compounding** | recall@1 and cache hit-rate as N peers grow (1 → 64); "what does the network already know" hop | all are single-user silos — no peer exchange |
| D | **Cost / latency** | tokens re-spent on already-resolved needs; retrieval p50 | RAG re-embeds + re-queries; mem0/Letta re-extract via an LLM per write |
| E | **Footprint** | runs CPU-only, no API key, no server | mem0/Letta need an LLM (key) for extraction; most need a vector-store server |

Axis E is partly a capability matrix (already in the README), but it gates the
others: **A–D must be run under matched footprint** or the comparison is unfair
in folklore's favour. State the footprint each tool needs to run at all.

## Competitors + install feasibility (measured 2026-06-19, this sandbox)

| Tool | pip | Runs offline / CPU-only? | Blocker for a real run here |
|------|-----|--------------------------|-----------------------------|
| folklore | n/a (this repo) | ✅ yes | none |
| mem0 (`mem0ai 2.0.0`) | ✅ visible | ❌ needs an LLM for memory extraction | needs OpenAI key OR a local Ollama model wired as the LLM |
| LangChain RAG (`langchain 0.3.30`) | ✅ visible | ⚠️ retrieval yes; "memory" varies | vector store + embeddings; LLM only if we score answer quality |
| Zep (`zep-python 2.0.2`) | ✅ visible | ❌ client for a Zep server | needs a running Zep server (Docker) |
| Letta | ⚠️ unresolved (`letta` pip name TBD) | ❌ agent server + LLM | server + LLM key |
| Pinecone RAG | client only | ❌ hosted vector DB | account + network |

Honest implication: a fully matched A–D run against mem0/Letta/Zep needs an LLM
and/or a server folklore does not. Two honest ways to handle it:
1. **Local-LLM parity** — wire every tool to the same local Ollama model + same
   embedder, so the only variable is the memory architecture. Preferred.
2. **Where a tool literally cannot do an axis** (e.g. web-gating, federation),
   record it as a **structural ❌**, not a measured loss — the capability is
   absent, which is the finding.

## Datasets / tasks

- **A (web-gating):** a query stream with deliberate repeats + paraphrases (reuse
  the paraphrase-sigma + inference-tree fixtures: question↔question cos ~0.71–0.84).
  Measure fallback rate as the stream warms. Folklore has this (`bench-compounding-real`,
  `bench-inference-tree-sharing`); competitors get the same stream, count how many
  repeats they serve from memory vs re-run.
- **B (provenance):** the displaced-poison set already used for the 58.9%→2.4%
  (24.8×) result. Inject poisoned docs; measure flip-ASR with each tool's ranking.
- **C (federation):** the 64-peer cooperative-cache sim (`bench-compounding`,
  90.2% hit vs 18% alone). Competitors = N independent silos (no exchange) → the
  ceiling is the single-user number, by construction.
- **D (cost):** token + paid-trip accounting over A's stream (reuse the 9.1×
  fewer-web-trips / 77% fewer-input-tokens harness, labelled simulator).

## Honest-controls checklist (applies to every reported number)

- [ ] Same embedder + same local LLM across tools where the tool permits it.
- [ ] Label each number **measured** or **simulator**; never blend.
- [ ] If a tool can't perform an axis, report **structural ❌**, not a measured loss.
- [ ] Report the footprint each tool needed to run (key/server) next to its number.
- [ ] No weak-baseline inflation; if folklore wins only under a footprint it
      uniquely avoids, say so explicitly — that asymmetry IS the product claim,
      but it must be named, not hidden.

## Phased plan

- **P0 — capability matrix (no LLM needed): DONE.** `bench/bench-memory-tools.mjs`
  — reproducible structural matrix + live pip-feasibility probe. Result (structural,
  not measured): Folklore 5/6 (only `no_server` ❌ — it runs a local daemon) and the
  **only** tool with web_gating + provenance + federation by design; LangChain RAG 3,
  Pinecone 2, mem0 1, Letta/Zep 0. Feasibility (2026-06-19): mem0ai 2.0.0, langchain
  0.3.30, zep-python 2.0.2, pinecone-client 6.0.0 resolvable; **`letta` NOT resolvable
  in this sandbox** → Letta stays structural-only, excluded from P1 measured runs.
- **P1 — web-gating (axis A): MEASURED, partial, honest.**
  `bench/bench-memtool-webgating.py` — 32-event stream (8 needs × repeats/paraphrases),
  matched embedder all-MiniLM-L6-v2, each tool as a web-cache, metric = web-fallback
  rate (lower better, floor 0.25). **Result @ threshold 0.55:** cosine-proxy **0.4375**,
  LangChain (measured) **0.4375** (identical → proxy validated), folklore (measured)
  **0.50** (more conservative). mem0 pending (Ollama qwen2.5:7b, slow LLM-per-write).
  **HONEST READ — not a folklore win:** on single-user *raw hit-rate* folklore ≈ a
  semantic cache, slightly worse at this operating point. Two caveats make the bare
  number misleading and BOTH must be fixed before any "vs mem0" claim:
  (1) **No false-accept axis.** Fallback-rate alone rewards reckless caching — a low
  threshold serves more (incl. WRONG) memories and looks "better". folklore's gate is
  calibrated for low false-accept; the fair metric is fallback-rate **at matched
  false-accept** (the existing `bench-vcache-compare` methodology). Next pass: track
  serve-WRONG-need + sweep thresholds.
  (2) **Wrong axis for folklore's edge.** Single-user cache hit-rate is something a
  plain cosine cache already does; folklore's structural advantage is FEDERATION (the
  cache is shared across peers — P3) and PROVENANCE/poison-defense (P2), which the
  single-user tools cannot do at all. Web-gating parity ≠ the differentiator.

  **P1 v2 — fair metric (fallback @ matched false-accept, swept threshold). RESULT
  + verdict that web-gating is the WRONG head-to-head for folklore:**
  Sweeping the hit threshold and reporting the best fallback-rate that holds
  false-accept ≤ budget, on the 32-event toy stream:

  | tool | FA≤0 | FA≤0.05 |
  |---|---|---|
  | cosine-cache (proxy) | 0.6875 | 0.4688 |
  | LangChain (measured) | 0.6875 | 0.4688 (≈ proxy → proxy validated twice) |
  | folklore (measured) | 1.0 | 1.0 |

  folklore reads 1.0 — but this is a **measured metric/regime mismatch, not a clean
  defeat, and is NOT publishable as "folklore loses web-gating":**
  - Diagnostic confirms folklore's TOP hit is correct (an RRF paraphrase → `nid:rrf_fusion`),
    but at `satisfaction 0.42` with native decision `search_required`. Its satisfaction
    is calibrated for a populated graph + the deny pipeline, **not cosine-comparable**
    and not meaningfully sweepable as a 0–1 threshold; the scores are compressed
    (0.42 for a *correct* match) so no swept τ separates correct from spurious-neighbor.
  - The competitors ARE cosine caches (LangChain == the cosine proxy exactly), so they
    sweep naturally; folklore's gate does not. Forcing it onto that axis mismeasures it.
  - Publishing the 1.0 as a folklore loss would inflate the competitors via a rigged
    regime — the inverse of weak-baseline inflation, equally dishonest. Declined.

  **Verdict:** single-user web-gating on a synthetic micro-graph is **not a valid
  head-to-head** for folklore (favors cosine-cache tools; mismeasures folklore's gate;
  folklore's real regime is a large populated graph, which breaks the matched-control).
  The honest, structurally-meaningful comparisons are **P2 (provenance/poison-defense)**
  and **P3 (federation)** — axes the single-user tools cannot perform at all. The
  harness (`bench/bench-memtool-webgating.py`) stays as the reproducible source of the
  cosine/LangChain numbers; mem0 run still pending but deprioritised behind P2/P3.
- **P2 — provenance (axis B): MEASURED, folklore WINS — the right head-to-head.**
  `bench/bench-memtool-poison.py` — 8 target queries, each with a trusted CORRECT
  doc + an untrusted POISON doc crafted to mirror the query wording (the realistic
  displaced-poison attack). Matched all-MiniLM-L6-v2; identical corpus + retrieval;
  the ONLY variable is provenance. Metric = flip-ASR (top-1 retrieved is the poison).
  **Result:** similarity-only ranking (= mem0/LangChain/RAG, which carry no
  provenance field) **flip-ASR 0.625**; folklore provenance-demotion drops it to
  **0.125 @0.2** and **0.0 @0.4**. Competitors **structurally cannot leave the 0.625
  column** — they have no signed-source field to rank on. Direction matches the live
  Fellows LLM eval (Haiku/Opus, model-grade): 58.9% → 2.4% with provenance ranking.
  Honest labels: MEASURED on real embeddings; the trust signal (trusted/untrusted)
  models signed-source / verified-github-handle in production; n=8 micro-harness
  corroborating the lever's direction, not a full attack matrix. The demotion
  magnitude is a free parameter — the point is that ANY real provenance signal cuts
  flip-ASR sharply while the competitors have ZERO such signal.
- **P3 — federation (axis C):** folklore N-peer compounding vs the structural
  single-user ceiling of the silos.

## Open questions

1. Local-LLM parity model — pin one Ollama model (e.g. a small instruct model) so
   mem0/Letta extraction is comparable and key-free? Confirms axis-E parity.
2. Letta: resolve the correct pip/package + whether its server runs headless here.
3. Is a structural capability matrix (P0) enough for the site's competitor claim,
   or do we need P1 measured numbers before publishing any "vs mem0" figure?
