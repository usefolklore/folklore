# Phase 23: Unified Memory Benchmark — Context

**Gathered:** 2026-05-19
**Status:** Researching → Building

<domain>
## Phase Boundary

Establish a strict, reproducible benchmark suite for the long-term
memory work shipped in Phase 21/22. The deliverable is a single
`folklore bench memory` command (and matching `npm test` entry)
that runs every dimension and emits one JSON report.

The benchmark is the **acceptance contract** for any future memory
change — a PR that adds a tier, a router, or a retention tweak must
not regress the report. Trip-wire ratchets, not narrative claims.

</domain>

<survey>
## Memory benchmark landscape (May 2026)

| Benchmark | Year / venue | Task | Queries | Metric | Public runner | What it stresses |
|---|---|---|---|---|---|---|
| BEIR SciFact | 2021 | scientific-claim retrieval | 300 | NDCG@10 | yes (Python + ours TS) | bi-encoder precision over noisy distractors |
| HotpotQA | 2018 | multi-hop QA | 7,405 dev | EM/F1 + R@k | yes | bridging facts across 2 paragraphs |
| MuSiQue | 2022 | multi-hop QA | 4,847 | F1 | yes | 2–4-hop bridging w/ adversarial distractors |
| MS-MARCO Passage | 2018 | passage retrieval / rerank | 6,980 dev | MRR@10 | yes | cross-encoder reranking ceiling |
| LongMemEval-S | ICLR 2025 | conversational long-term memory | 500 | QA correctness (GPT-4o judge) | yes (Python) | 5 abilities: info-extract / multi-session / temporal / knowledge-update / abstention. ~115k tokens of history per Q, ~40 sessions |
| LongMemEval-M / Oracle | ICLR 2025 | same | 500 | same | yes | longer haystacks (500 sessions/Q), or oracle evidence |
| LoCoMo | EMNLP 2024 (arxiv 2402.17753) | very long conversational memory | ~600 turns × 32 sessions/dialogue | F1 + LLM-as-Judge | yes | weeks/months horizon; factual recall + temporal + causal |
| Ep-Bench | arxiv 2511.07587 (GSW paper) | episodic memory for RAG | 100k–1M tokens corpora | task-specific accuracy | partial | space-time-anchored narrative tracking |
| RAGBench | 2024 | RAG quality across 12 datasets | aggregate | TRACe metrics | yes | retrieval + generation joint |

**Documented SOTA points worth citing:**
- mem0 / Letta / LangMem evaluated on LoCoMo in the Mem0 ECAI 2025
  paper. Human ceiling F1 87.9, GPT-4 32.1, mem0/Letta/Zep at varying
  points between.
- agentmemory claims 95.2% R@5 on LongMemEval-S.
- ByteRover claims 92.8% top-market accuracy + 1.6s latency on
  LongMemEval-S.
- GSW (arxiv 2511.07587) +20% on Ep-Bench over RAG baselines, −51%
  query tokens.

**Gaps no public benchmark covers cleanly:**
1. **Tier-promotion accuracy** — does the system correctly classify a
   raw observation into observation / episodic / semantic / procedural?
2. **Bayesian reliability calibration** — does Beta(α,β) on procedural
   memories converge on the true success rate over a feedback stream?
3. **Auto-forget precision/recall** — are demoted nodes actually the
   stale / contradicted / TTL-expired ones?
4. **Retention-band calibration** — does our 0.7/0.4/0.15 hot/warm/cold/
   frozen banding match a human "should I keep this" judgement?
5. **Write-time gate quality** — does the gate's drop-reason mirror a
   manually-labelled "should this have been promoted" set?

These five are the **folklore-specific** axes — no public benchmark
hits them because they're internal to the tier-management pipeline.
They have to be synthetic, but the synthetic harness can be small,
deterministic, and shared into the repo so anyone can run it.
</survey>

<decisions>
## Implementation Decisions

### Three benchmark families, one runner

**A. Public benchmarks (re-implemented with our retrieval stack):**

| Suite | Subset | Where | Acceptance gate |
|---|---|---|---|
| BEIR SciFact | full dev (300q × 5183 docs) | `tests/bench-real.test.ts` (already wired) | NDCG@10 ≥ 0.75 (current 0.7522) |
| HotpotQA-style multi-hop | curated 20-query subset | `tests/bench-standard.test.ts` (already wired) | R@5 ≥ 0.80 |
| LongMemEval-S (oracle split) | full 500 questions | NEW `tests/bench-longmemeval.test.ts` | Recall@5 ≥ 0.75 on the retrieval-only sub-evaluator (we skip the GPT-4o judge because it's not deterministic / costs money) |
| LoCoMo factual recall | 50-question subset | NEW `tests/bench-locomo.test.ts` | F1 ≥ 0.50 on factual-recall split (no LLM judge) |

We omit:
- Ep-Bench full (no clean public TS-portable runner; GSW path is
  Phase 24's job and they have their own internal eval)
- MS-MARCO full (300+ GB; we use the ms-marco-MiniLM cross-encoder
  output indirectly via the rerank-on-BEIR signal)
- RAGBench full (needs a generation step we don't own)

**B. Folklore-specific synthetic benchmarks** — the five gap-axes
above. Each gets a labelled fixture + a pure-domain scorer:

| Axis | Fixture | Metric |
|---|---|---|
| Tier-promotion accuracy | 200 hand-labelled URIs spanning all four tiers | Macro F1 of `tierForUri` |
| Bayesian calibration | 1000-step synthetic feedback stream with known success rate p ∈ {0.2, 0.5, 0.8} | mean abs error \|α/(α+β) − p\| after step 1000 |
| Auto-forget precision | 50-node graph w/ 20 staged stales | precision + recall of demoted set vs ground truth |
| Retention-band calibration | 60 labelled "human verdict" rows (keep / discard / unsure) | accuracy + confusion matrix on band ↔ verdict mapping |
| Write-time gate | 100 hand-labelled candidates (promote / drop) | precision + recall of `partitionByGate` against labels |

**C. Composite score** — single number per run, transparent formula:

```
wi_memory_score =
    0.25 · NDCG@10(BEIR SciFact)
  + 0.15 · R@5(HotpotQA-style)
  + 0.20 · R@5(LongMemEval-S oracle)
  + 0.10 · F1(LoCoMo factual subset)
  + 0.10 · F1(tier promotion)
  + 0.05 · (1 − betaError)
  + 0.05 · F1(auto-forget)
  + 0.05 · accuracy(retention band)
  + 0.05 · F1(write gate)
```

Total weight = 1.0. Acceptance gate for a PR: composite must not drop
> 1 point absolute (no narrative excuses).

### Runner shape

- One driver under `src/cli/commands/bench.ts` (NEW): subcommand
  `folklore bench memory [--suite <name>] [--json]`.
- Each suite is a TS file under `tests/bench-*.test.ts` so `npm test`
  picks them up automatically AND they can be invoked standalone via
  the CLI driver.
- Suite outputs a typed `BenchSuiteReport`:
  ```ts
  interface BenchSuiteReport {
    suite: string;
    metrics: Record<string, number>;
    perQuery: ReadonlyArray<{ id: string; metric: string; value: number }>;
    elapsedMs: number;
    rev: string;  // git SHA at run time
  }
  ```
- Composite runner aggregates suite reports + emits
  `~/.folklore/bench-memory-<ISO>.json` plus a one-line summary
  to stdout.

### Reproducibility

- Embedder pinned to `Xenova/all-MiniLM-L6-v2` (fp32, mean pooling) for
  all runs — published model variant, no quantisation drift.
- Cross-encoder pinned to `Xenova/ms-marco-MiniLM-L-6-v2` (quantised
  is fine here — only the head is reranked).
- Random seeds fixed where applicable (Beta calibration uses a fixed
  RNG seed).
- LongMemEval test set is HF-hosted at
  `xiaowu0162/longmemeval-cleaned`. We pull `longmemeval_oracle.json`
  on first run, cache under `~/.folklore/bench-cache/`.
- LoCoMo subset is hand-extracted from arxiv 2402.17753's released
  dataset (50 factual-recall pairs). Vendored under `tests/fixtures/`.

### What we explicitly do NOT do

- No GPT-4o-as-judge step. Non-deterministic + costs money + needs an
  API key. We score retrieval correctness instead — the answer is
  "did the system surface the source session", not "did it write a
  good answer paragraph". This is a stricter floor: if retrieval is
  bad, generation can't recover.
- No corpora that require online API access at run time. All test
  data either ships in-repo or downloads to `~/.folklore/
  bench-cache/` on first use.
- No leakage of test data into the prefetch cache. Bench mode sets
  `FOLKLORE_BENCH=1` which disables the auto-save hook.

</decisions>

<scope>
## Scope

In:
- `src/cli/commands/bench.ts` — driver subcommand
- `src/domain/bench-types.ts` — typed report shapes
- `tests/bench-longmemeval.test.ts` — LongMemEval-S oracle adapter
- `tests/bench-locomo.test.ts` — LoCoMo factual-recall subset
- `tests/bench-tier-promotion.test.ts` — tier-classification F1
- `tests/bench-beta-calibration.test.ts` — Bayesian convergence
- `tests/bench-auto-forget.test.ts` — already exists, extend
- `tests/bench-retention-band.test.ts` — human-verdict calibration
- `tests/bench-write-gate.test.ts` — gate precision/recall
- `tests/fixtures/bench-memory/*.json` — synthetic + vendored data
- `docs/product/BENCHMARKS.md` — update with new suite + composite formula

Out:
- Ep-Bench full implementation (Phase 24 with GSW)
- MS-MARCO full retrieval (we score it indirectly via rerank lift)
- RAGBench (no generation step in scope)
- A web dashboard for trend tracking (Phase 25)

</scope>

<acceptance>
## Acceptance criteria

1. `folklore bench memory --json` exits 0 and emits a valid
   `BenchSuiteReport[]` plus a composite score.
2. Composite score on the current main branch is documented in
   `docs/product/BENCHMARKS.md`.
3. Every suite has a CI mode that runs in <30 s (subset). Full mode
   is allowed to take longer.
4. No suite depends on external API access at run time once the
   cache is warm.
5. The 4 pre-existing test failures (Phase 17/20/35 stale assertions)
   are not made worse.

</acceptance>
