# Next Levers — retrieval & protocol synthesis

**Synthesised:** 2026-06-16 from the research backlog.
**Inputs:** `.planning/SOTA-UPGRADE-PLAN.md`, `.planning/v2.1-CANDIDATES.md`,
the five `*-SOTA-ATTACKS.md` specialist reports (Math / Physics / Particle-Physics
/ Data-Science / Data-Engineer / CFD), `.planning/BENCH-v2.md` §2k+§2L null waves,
`docs/product/BENCHMARKS.md`, and RFC-0003 / `PROTOCOL-QUALITY-QUESTIONS.md` open
questions.

## Where we actually are

Production retrieval headline is **72.30% NDCG@10 on BEIR SciFact** for the
pure-Node, zero-extra-build path (nomic-embed-text-v1.5 768d dense + SQLite FTS5
BM25, RRF k=60, full 5,183×300 corpus), and **75.22%** with the optional Rust
`bge-base` sidecar (fastembed-rs) already wired. Both are directly leaderboard-
comparable. On calibrated qrels (gpt-oss:20b judge, κ=0.7053 substantial
agreement) the instrument-corrected ceiling is ~81% on a 50-query subset, which
is the single most important finding in the backlog: the apparent ceiling is
**measurement-floor-bound, not pipeline-ceiling-bound**.

That reframes the whole retrieval track. Twelve post-encoder attacks across three
rounds were fighting a 2.5–5pt phantom ceiling created by qrel sparsity (measured
2.8% false-negative rate at top-15). The honest conclusion the backlog already
reached: **the SOTA-attack surface is closed at the ≤500M-param CPU tier on
SciFact**, and further pt-chasing there is low-EV. The highest-value retrieval
work left is either (a) instrument/methodology, (b) a different dataset where real
headroom exists (ArguAna), or (c) shipping what is already measured. The protocol
side — RFC-0003's "when is retrieval enough" contract — has more genuinely untried
headroom than retrieval does.

## Ranked shortlist

### 1. Ship Wave 2 to production (v2.1 Candidate A) — UNTRIED, highest user-facing lift

The largest real improvement available, and it is already measured end-to-end in
the bench scripts; it is wiring, not research. Production still defaults to the v1
baseline path on parts of the surface, while the bench proves nomic-768d + FTS5
BM25 RRF hybrid hits 72.30%. The call-site survey in `v2.1-CANDIDATES.md` shows
`DEFAULT_DIM` lives in exactly one place (`src/domain/vectors.ts`) and five call
sites need the `embedDoc`/`embedQuery` split — Phase 21 is plausibly a one-day
change, with the migration CLI (atomic re-index to `vectors.db.new`, `--fast-mode`
MiniLM opt-in) and a TDD regression bar (≥72% NDCG@10 on a SciFact fixture) as the
two larger phases.

Expected gain: +7.48 NDCG@10 in production parity (baseline 64.82% → 72.30%),
which is real and shipped rather than projected. Effort: ~4–5 days, 3 phases, zero
new dependencies. Evidence: measured in `bench/bench-beir-sota.mjs --hybrid` and
documented in BENCHMARKS.md as "measured but not yet fully shipped." Risk: 550 MB
nomic ONNX first-run download (needs progress UI + escape hatch); destructive DB
migration (the atomic-swap design must be airtight). This is the obvious next
lever because the work is de-risked — the pipeline already runs.

### 2. RFC-0003 protocol levers: abstain + conflict-as-first-class + auto-judge calibration — UNTRIED, on-thesis

The backlog is explicit that "the hardest problem is not retrieval, it is deciding
when retrieval is enough," and that the product should optimise for "searches
safely avoided" over "NDCG." Three RFC-0003 open questions are genuinely untried
and directly serve the deny-on-confidence gate that is folklore's actual moat:
the `abstain` signal (a peer saying "I know adjacent things but not enough,"
OQ in `PROTOCOL-QUALITY-QUESTIONS.md`), **conflict as a first-class field** that
forces verification instead of being averaged into one satisfaction score
(RFC-0003 OQ#4), and the **shadow-search auto-judge** that labels `outcome` on
the receipt log so BadSkipRate becomes measurable against the <2% target
(RFC-0003 OQ#5 — the substrate ships, the judge does not).

Expected gain: not an NDCG number — the right metric is BadSkipRate and
search-deflection rate. The backlog flags the current natural-question web
deflection at 0.0% (a measured gap, not a claim), so any movement here is
net-new product value. Effort: medium per lever (~2–4 days each); the scorer,
trace, and receipt log already exist, so these are additive domain-layer
functions, not infrastructure. Evidence: RFC-0003 documents the contract that
ships today and names exactly these as the open extensions; the gpt-oss:20b judge
at κ=0.7053 already proves a trustworthy local LLM-as-judge is achievable, which
is the same instrument the auto-judge needs. This is the lever most aligned with
the stated thesis and least explored.

### 3. ArguAna re-target via per-task BM25 gating — PARTIALLY TRIED (soft), real headroom

The one retrieval dataset with measured headroom. SciFact is at-ceiling, but
ArguAna sits at 43.97% against a ~50.4% nomic dense-only ceiling, and the failure
mode is *understood*: R@10 is 86.42% (gold is retrieved) but BM25 promotes
same-side arguments and reshuffles the counter-argument gold out of top-10. The
dense-only re-target was run and returned **+1.45pt (43.97% → 45.42%), soft —
below the +5pt gate**. So the naive "turn BM25 off" version is already a soft
null; the untried part is a *query-classifier or config flag* that routes
stance/counter-argument workloads to dense-only while keeping hybrid as the
default (`bench-arguana-dense.mjs` already ships the fallback).

Expected gain: +1.45pt is banked; the gated-routing version targets the full
+5–6pt to the nomic ceiling but is unproven and the soft result tempers the
prior. Effort: ~2 days to ship the gate. Evidence: measured +1.45pt in
`.planning/BENCH-v2.md` §2L; mechanism documented (BM25 reshuffle). Honest call:
medium-confidence, capped upside, and it is a different metric from the SciFact
headline so it reads as a narrative win ("beats published dense-only on a
counter-argument task") more than a headline-number win.

### 4. Inference-free learned-sparse (SPLADE-family / Seismic) — UNTRIED, architecturally heavy

The one genuinely new *retrieval* operator not yet attacked. Every nulled attack
stayed inside dense + BM25 RRF; learned-sparse is a different representation that
the fusion-surface nulls do not bound. Inference-free learned-sparse retrievers
(2024–2026 line) keep query-side cost at BM25 levels and have published BEIR lifts
over BM25. Verified alive: `castorini/pyserini` (2.1k★, pushed 2026-06-15) and
`castorini/anserini` (1.1k★, pushed 2026-06-15) are actively maintained reference
toolkits; `FlagOpen/FlagEmbedding` (11.8k★, MIT, pushed 2026-04) covers the model
side; Seismic remains the cited SOTA index for sparse vectors as of 2026. The
catch is storage: it needs an inverted-index path alongside `sqlite-vec`'s vec0
table, which is closer to the ColBERT verdict ("out of scope without a storage
rewrite") than to a drop-in. `naver/splade` itself is only lightly maintained
(last push 2024-05) so the model line, not that repo, is the live artifact.

Expected gain: unproven on this corpus; published BEIR lifts over BM25 exist but
SciFact is already encoder-ceiling-bound, so the SciFact-specific prior is modest.
Effort: high (~1–2 weeks) — new index, new write path, new fusion term. Evidence:
external traction verified (pyserini/anserini/FlagEmbedding all live and starred);
no folklore measurement. Classification: untried-promising but the lowest EV of
the four given the storage cost and the SciFact ceiling.

## Already tried and nulled — do not re-run

These are documented, reproducible nulls in `.planning/BENCH-v2.md`. Listed so the
next agent does not burn budget re-attacking a closed surface.

| Lever | Δ NDCG@10 | Bench | Why it nulled |
|---|---:|---|---|
| bge-reranker-base cross-encoder (Wave 3) | **−1.92** | §2b | MS-MARCO domain mismatch on scientific text |
| InRanker-base stacked on hybrid top-50 | **−13.72** | Round 5 | strong hybrid + pointwise rerank destroys precision |
| Oracle room-routing (CQADupStack) | +0.34 | §2c / Wave 4 | below +3pt gate; disjoint vocab already implicit |
| PPR graph-rerank over doc-doc kNN | **−23.76** | §2i | single-hop diffusion leaks mass off gold |
| RRF (k, α) parameter sweep | +0.17 | §2k-1 | train-fold overfit, held-out null |
| Rocchio dense PRF (m=5, α=0.7) | **−0.19** | §2k-2 | encoder ceiling — no vocab gap at top-5 |
| Qwen2.5 Contextual Retrieval (0.5B / 3B) | −1.46 / −0.06 | §2k-3/4 | small LLM adds lexical noise, no signal |
| Diagonal Jacobi preconditioning of cosine | **−0.77** | §2L-3 | refuted the CFD "can't regress" claim |

The qrel-rejudge track (V1 κ=0.418 → V2 κ=0.458 → **V3 gpt-oss:20b κ=0.7053
PASS**, 2.8% qrel FN rate) is the one part of the SOTA track still worth a unit of
budget: a full-set V3 run (300 queries × top-20, ~14h) would convert the
subset-extrapolated ≥75.71% calibrated-ceiling estimate into a measured,
methodology-publishable number. That is an *instrument* improvement, not a pipeline
lever, and it is the only SciFact work the backlog still endorses.

## Untried algorithmic attacks — low-confidence, listed for completeness

The specialist reports proposed ~25 attacks; most that were gated nulled. The
untested remainder all carry honest medians at or below noise on SciFact:
AMR score-gradient candidate refinement (CFD #2, +0.4 median, SPECULATIVE),
Petrov-Galerkin asymmetric kernel (CFD #4, +0.2 SciFact / +2.0 ArguAna median,
RESEARCH, documented overfit risk), Krylov subspace projection (CFD #3, +0.2
median, RESEARCH), Doc2query doc-expansion (Data-Engineer #2, +0.8–1.5 median,
LIKELY per published SciFact precedent but needs a corpus re-index and an LLM
generation pass), and BM25F field-weighting (Data-Engineer #4, +0.25 median,
correlated with the already-flagged title-weighting null). Given the
measurement-floor finding, none of these clears the bar set by levers 1–3. If any
single algorithmic attack is funded, Doc2query has the strongest external
precedent on SciFact specifically — but it should be gated on the 50-doc pilot the
report specifies before any full-corpus run.

## Bottom line

Retrieval pt-chasing on SciFact is a closed surface — spend there only on the
full-set V3 qrel audit (instrument, not pipeline). The real next levers are
shipping Wave 2 to production (banked +7.48, de-risked) and building out the
RFC-0003 epistemic contract (abstain / conflict / auto-judge), which is where the
deny-on-confidence thesis actually lives and where the deflection metric is still
sitting at zero. ArguAna gated routing is a modest, honest narrative win; learned-
sparse is the only net-new retrieval operator but is storage-heavy and unproven
here.
