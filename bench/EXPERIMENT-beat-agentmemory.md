# Experiment: surpassing agentmemory's 95.2% on LongMemEval-S

Goal: beat the competitor's claimed **95.2% Recall@5** on LongMemEval-S (real
ICLR-2025 dataset, judge-free retrieval). Autonomous sweep of every cheap lever
on the shipped CPU retrieval stack. Honest negative result: **none beat the
0.9284 MiniLM+enrich baseline on the full 500 questions.**

## The methods tried, and what each really did

Every lever was measured first on a 100-Q subset (fast) then confirmed on the
full 500. The pattern that defined this experiment: **the subset lies every
time.** Each method looked like a winner on 100-Q and regressed to the ~0.92–0.93
plateau on the full set.

| method | 100-Q subset | full 500 | verdict |
|---|---|---|---|
| MiniLM-384 + BM25 hybrid (baseline) | 0.9313 | 0.9213 | — |
| **+ contextual enrich** (date/participants prefix) | 0.9438 | **0.9284** | **best — the only real, durable lift (+0.71)** |
| + cross-encoder rerank (ms-marco-MiniLM) | 0.9313 | 0.9213 | no-op (off-domain, doesn't reorder top-5) |
| + bge-base-768 (Rust sidecar) | 0.9672 | ~0.93 | subset mirage; regressed; 2.6× slower |
| + sub-session chunking (turn-windows → dedup) | 0.9513 | ~0.927 | subset mirage; regressed to baseline |

(bge-base and chunking full runs were stopped early once they had clearly
converged below the enrich baseline — 250–275/500 each.)

## Why the plateau

The stack tops out at **R@5 ≈ 0.92–0.93** on LongMemEval-S regardless of the
retrieval-side lever. R@10 is ~0.97 and R@30 ~0.99 — the right session is almost
always in the candidate pool; the ~5-point gap to 95% is purely top-5 ordering,
and no reranker / chunker / 768-dim swap moved it durably. That points to the
representation, not the pipeline: **MiniLM-384 is the ceiling here.** Competitors
reporting ≥95% almost certainly use a much stronger embedder (e.g. OpenAI
text-embedding-3-large, 3072-dim) — a cloud-API dependency and cost this CPU,
local-first stack deliberately avoids.

## The reusable output

`tests/bench-longmemeval-exp.test.ts` adds two env-gated, identity-safe knobs to
the bench (off = the committed adapter exactly):
- `FOLKLORE_EXP_CHUNK=1` (`_TURNS`, `_STRIDE`) — sub-session turn-window indexing
  with chunk→parent-session dedup before scoring.
- backend-select carried from the real adapter (`FOLKLORE_EMBEDDER_BACKEND=rust`,
  `bge-base`/`nomic`, 768-dim).

Negative results are results: the cheap levers are exhausted and ruled out. The
honest best remains **MiniLM + contextual enrich, R@5 0.9284**. Clearing 95.2%
is a deliberate embedder-upgrade decision (stronger local model like bge-large,
or a cloud embedding API) — out of scope for an autonomous, cost-free sweep.
