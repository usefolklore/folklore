# Experiment protocols (E1–E5)

Runnable protocols that turn `../91-next-experiments.md` into something an engineer
can execute, each grounded in the **real** `bench/` + `scripts/fellows-eval/`
harness (the agents read the actual files; where the aim assumed an API the repo
lacks, the protocol adapts and names the new code to build).

| # | Question | Reuses | Offline-now? |
|---|----------|--------|--------------|
| [E1](E1.md) | Does reuse improve **end-to-end answer quality** (not recall@1) in the `[0.6,0.71)` q2q band? static-0.6 vs static-0.8 vs per-prompt vCache | `scripts/fellows-eval/` (run-matrix→judge), `bench-vcache-compare.mjs`, `bench-inference-tree-sharing.mjs`, `src/domain/query-reuse.ts` | **Yes** (build 3 files) |
| [E2](E2.md) | Does the energy/OOD gate protect against on-distribution-but-**stale** hits? recalibrate freshness on real traffic | `energy-gate.ts`, `bench-energy-gate.mjs`, `peer-telemetry.ts:363` freshnessGate, `eval/fixtures/deny-real` | **Yes** |
| [E3](E3.md) | Does provenance restore **calibration** on a **weaker** agent under 75% Sybil poison? | `scripts/fellows-eval/run-matrix.mjs` T0/T1/T2, `eval/scifact-100.json`, `eval/attacks.json`, `eval/out.run6-haiku` | **Yes** (Haiku proxy) |
| [E4](E4.md) | **Measured** net token/latency savings of federation vs a vCache-tuned single node, net of verification | `bench-vcache-compare.mjs --budget 0.01`, `bench-memtool-latency.py`, `bench-compounding-real.mjs`, `cross-rerank.ts` | **Yes** |
| [E5](E5.md) | Does compounding stay **reliable** across a real churning population? | `bench-compounding-real.mjs` (offline twin), `bench-memtool-federation*.py` (sim baseline) | **No** — live pilot; twin runs now |

## Key reality-checks the specs surfaced

- **No per-prompt vCache threshold exists** in the repo — `bench-vcache-compare.mjs`
  picks a single *global static* point on its threshold grid. E1/E4 spec it as new code.
- **The only answer-graded pipeline is `scripts/fellows-eval/`** (run-matrix.mjs →
  `answers.jsonl`, judge.mjs → `correct`, model.mjs seam, Haiku agent / Opus judge),
  built for the poison T0/T1/T2 treatments. E1 reuses it by swapping the poison
  treatments for *reuse* policies; E3 maps with/without-trust-lines onto T0/T2.
  Everything else in `bench/` measures **retrieval recall@1**, not answer quality —
  which is exactly the RQ1 gap.
- **Calibration/ECE is not yet emitted** anywhere; E3 adds it (the disciplined null
  said calibration, not ASR, is the right dependent variable).
- **A true 7B consumer** needs a new `model.mjs` backend; `eval/out.run6-haiku` is the
  current weak-agent proxy.

## Build queue (the new code each experiment needs)

1. **E1** — `scripts/fellows-eval/build-need-pairs.mjs` (distinct-need `[0.6,0.71)`
   pair constructor), `scripts/fellows-eval/reuse-treatments.mjs` (reuse policies in
   place of poison arms), `bench/vcache-threshold.mjs` (per-prompt learned threshold),
   + the q2q-cosine-bin answer scorer.
2. **E2** — `bench/bench-energy-stale.mjs` (in-process index→search + `energyGate()`
   on `simᵢ = 1 − distance`); recalibrate the real `freshnessGate`
   (`src/domain/peer-telemetry.ts:363`, `FRESH_FLOOR=0.3`, 7d half-life) on
   knowledge-update traffic.
3. **E3** — `scripts/fellows-eval/calibration.mjs` (ECE + verdict-shift + a
   confidence-elicitation flag); later a real-7B `model.mjs` backend.
4. **E4** — `bench/probe-unit-costs.mjs` + `bench/bench-net-savings.mjs` (measured
   net token/latency ledger; `cross-rerank.ts` `rerankMatches` priced as the verifier).
5. **E5** — `bench/pilot-telemetry.mjs` + `bench/pilot-lift-scorer.mjs` + an
   answer-grader; `bench-compounding-real.mjs` sweep is the pre-registered offline twin.

## Recommended run order

**E1 first** — it attacks Folklore's own headline (does reuse help the *answer*,
not just retrieval) and the `fellows-eval` harness already exists. **E3 next** — the
treatments (T0/T2) and a weak-agent run (`run6-haiku`) already exist, so it is mostly
adding the calibration metric. **E2** and **E4** are independent and offline-now.
**E5**'s offline twin runs now; the live 100-peer pilot is the only calendar-bound
piece and should start recruiting in parallel.
