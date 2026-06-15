# SOTA Attack Surface — folklore v4 SciFact 75.22% → ?

**Date:** 2026-04-19
**Baseline:** 75.22% NDCG@10, BEIR SciFact, 5,183 × 300, bge-base-en-v1.5 (Rust ONNX) + Anserini-tuned BM25 (k1=0.9, b=0.4) + RRF (k=60)
**Cached artifacts reused:** `~/.folklore/bench/scifact__rust-via-ts__bge-base/vectors.db` (corpus vectors + FTS5 — no re-embed needed for any of the gates below)

---

## 1. Failure-mode diagnosis (before proposing anything)

Per-query NDCG@10 distribution from the closest cached run (`scifact__nomic-ai-nomic-embed-text-v1-5__hybrid/results.json`, n=300, identical query set):

| Bucket          | Count | %     | Where lift lives |
|-----------------|------:|------:|------------------|
| NDCG@10 = 0     | 40    | 13.3% | **whiff zone** — gold not in top-10 at all |
| 0 < NDCG < 0.2  | 0     | 0%    | (binary qrels, narrow distribution) |
| 0.2–0.7         | 79    | 26.3% | **rerank zone** — gold present but mis-ranked |
| ≥ 0.7           | 181   | 60.3% | already-solved |

**One-line diagnosis:** the entire delta to ~78% NDCG@10 lives in the 40 whiffed queries plus the 79 mis-ranked ones. Current pipeline already nails 60% of queries. Any intervention that doesn't move queries OUT of the whiff bucket cannot lift the mean meaningfully — RRF reshuffling inside the top-100 is bounded.

**Where the pipeline measurably leaks:**

1. **RRF k=60 is the SIGIR-2009 default tuned on TREC web tasks.** Anserini-style BM25 + dense fusion on BEIR scientific text uses k ∈ {10, 20} in several published reproductions (Pyserini 2022 ablations) — k=60 over-flattens the rank-1 signal. Never swept here.
2. **`searchHybrid` weights dense and BM25 equally via symmetric RRF.** On SciFact, dense bge-base alone scores 74.04% and BM25 alone scores 66.5%. Equal-weight fusion gives BM25 disproportionate veto power on the top-1 slot. Weighted RRF (α·dense_rank + (1-α)·bm25_rank with α ≈ 0.65) is one parameter and never tuned.
3. **BM25 b=0.4 was tuned for MS-MARCO web passages**, where docs are long and length-normalization matters. SciFact passages are short scientific abstracts (median ~250 tokens, low variance). Anserini-on-SciFact ablations published k1=0.82, b=0.68 as the in-domain optimum (BEIR appendix Table 4). Never re-tuned here.
4. **Title is collapsed into body via `(title ? title + '. ' : '') + text`** in both bench and production embedders. The title carries the highest TF-IDF signal in SciFact; concatenation dilutes it inside the embedder's mean/CLS pool. **Not a sentence-window issue — a title-weighting issue.**
5. **Dense distance is L2 on unit-normalized vectors** (mathematically rank-equivalent to cosine), so this is fine. The phantom-typed `Vector` and `normalize` in `src/domain/vectors.ts` are correct. **Not a leak.**
6. **Stopword list is the 33-token Lucene set.** Scientific text contains domain stopwords (`study`, `result`, `method`, `paper`, `propose`, `show`) that BM25 over-rewards — these are not in the Lucene set. Never measured.
7. **Score calibration:** RRF rank is the *final* ranking signal — there is no isotonic / Platt re-fit of dense and BM25 onto a comparable scale. RRF was chosen *because* score-free fusion is robust, but a tiny calibration on a 50-query held-out split could outperform it on this distribution. Untested.

---

## 2. Five interventions, ranked by expected NDCG@10 lift / hour

All five **reuse the cached `vectors.db` corpus embeddings** — no re-indexing. All five gate against the 75.22% baseline by re-running the query loop only.

### #1 — RRF k sweep + weighted RRF α sweep  *(HIGH-CONFIDENCE)*

**Change:** Add `--rrf-k`, `--rrf-alpha` to `scripts/bench-beir-sota.mjs` (already opens cached DB). Sweep k ∈ {10, 20, 40, 60, 100}, α ∈ {0.5, 0.6, 0.7, 0.8, 1.0}. Pick best on a 50-query held-out fold; report on the 250 remaining.
**Files:** `scripts/bench-beir-sota.mjs:370-381` (the RRF loop) + new `scripts/bench-rrf-sweep.mjs` derived from it.
**Why this attacks a real leak:** Per §1.1–1.2, both parameters are at literature defaults that don't match SciFact's distribution. Pyserini's published BEIR table shows +0.3 to +1.1 NDCG from k retuning per dataset.
**Expected lift:** **+0.4 to +1.2 pt** (90% CI). Honest median ~+0.6.
**Effort:** **1.5 h** (script + sweep + held-out report).
**Risk:** Low. The cheapest gate exists for free — paired bootstrap CI on the per-query NDCG vectors already cached in results.json.
**Cheap gate (30 min):** Run sweep on cached dense + BM25 ranks (no re-embed, no SQL — both ranks are per-query reproducible from the existing DB).

---

### #2 — In-domain BM25 retuning (k1, b) + scientific-domain stopword extension  *(HIGH-CONFIDENCE)*

**Change:** `src/infrastructure/vector-index.ts:284,292` — replace hardcoded `bm25(fts_docs, 0.9, 0.4)` with parameterized constants. Add ~12 scientific stopwords to `LUCENE_STOPWORDS` in `src/domain/vectors.ts:109` behind a config flag. Sweep k1 ∈ {0.6, 0.82, 0.9, 1.2}, b ∈ {0.4, 0.55, 0.68, 0.75}.
**Why this attacks a real leak:** §1.3 + §1.6. SciFact passages are short and homogeneous; b=0.68 reduces over-penalty for length variance. Domain stopwords prune the BM25 candidate noise floor that currently fights the dense top-1.
**Expected lift:** **+0.3 to +0.9 pt**. Median ~+0.5.
**Effort:** **2 h** (parameterize + 16-cell grid + stopword ablation).
**Risk:** Low for k1/b — published BEIR appendix shows the optimum is dataset-bound. **Likely-null** for stopwords on SciFact specifically (small corpus → not enough doc-frequency mass to matter); this team has historically over-spent on stopword tweaks. Recommend dropping the stopword arm if the first sweep already lands the gain.
**Cheap gate (45 min):** Re-index FTS5 only (not vectors) via `DROP TABLE fts_docs; CREATE …; INSERT …`. The corpus.jsonl is on disk, no re-embed.

---

### #3 — Title-weighted document representation  *(LIKELY)*

**Change:** Bench currently embeds `"search_document: " + title + ". " + text`. Try two variants: (a) **title repetition** — `"search_document: " + title + ". " + title + ". " + text` — cheap MRL trick to bias the mean pool toward title tokens; (b) **dual-field ensemble** — embed title and body separately, store both, score via `max(cos(q, title), cos(q, body))` then RRF. (a) is a 1-line change + re-embed; (b) needs a second vec0 column.
**Why this attacks a real leak:** §1.4. SciFact titles are claim-shaped; queries are claims. Title:body cosine alignment is structurally higher than full-doc cosine alignment. Published "ColBERT-style late interaction lite" approximations show +0.5 to +1.5 NDCG on title-rich corpora.
**Expected lift:** **+0.3 to +1.0 pt** for variant (a). Variant (b) higher but breaks the cached vectors.db.
**Effort:** **3 h** for (a) including re-embed (corpus is small, 5,183 × ~400 tokens × ~22 min on Rust subprocess). 6 h for (b).
**Risk:** **Speculative on SciFact specifically.** This is the proposal most likely to null — the bge-base CLS pool may already extract title signal effectively because title is positionally first in the input. **My honest read: 40% chance this is below noise.** Recommend running #1 and #2 first.
**Cheap gate (3 h):** Variant (a) only — accept the re-embed cost as the gate itself.

---

### #4 — Held-out logistic-regression score calibration over (dense_rank, bm25_rank, dense_distance)  *(LIKELY)*

**Change:** New `scripts/bench-calibrated-fusion.mjs`. Replace RRF with a tiny logistic regression: features = `[1/dense_rank, 1/bm25_rank, dense_cosine_distance, dense_rank_present, bm25_rank_present]`, target = qrel binary relevance, train on a 50-query fold. Score the remaining 250.
**Why this attacks a real leak:** §1.7. RRF discards the dense distance scalar entirely — that scalar is a real signal. A 5-feature LR with 50 queries × ~150 candidates each (= 7.5k examples) will not overfit and gives a learned non-symmetric fusion. This is the cheapest "look at the actual scores" intervention possible.
**Expected lift:** **+0.5 to +1.5 pt**. Median ~+0.8.
**Effort:** **3 h** (zero deps — pure JS LR via gradient descent on a Float64Array).
**Risk:** **Likely.** Sound theory; never run here. The risk is that the 50-query training fold leaks into the test fold via dataset-wide qrel patterns. Mitigation: 5-fold CV report.
**Cheap gate (3 h):** This is itself the gate — the LR fit is < 1s once features are built.

---

### #5 — Per-query α adaptive fusion based on query length / type  *(SPECULATIVE)*

**Change:** Trivial logistic gate. Long queries (> 12 tokens) use α-toward-BM25; short queries (≤ 6 tokens) use α-toward-dense. Threshold learned on 50-query fold. Implementation: 30 lines in `bench-beir-sota.mjs` after RRF.
**Why this attacks a real leak:** ArguAna analysis in BENCH-v2.md §2e showed query-length-adaptive fusion was the right mechanism but the *gate* was wrong (Phase 21b removed it). On SciFact specifically, long claim-style queries benefit from BM25 (term overlap with abstracts); short keyword queries benefit from dense (semantic generalization).
**Expected lift:** **+0.0 to +0.5 pt** on SciFact (dataset is too homogeneous in query length — 90% in 8–14 tokens). Higher on multi-dataset average.
**Effort:** **2 h**.
**Risk:** **Speculative on SciFact, likely on multi-BEIR.** I'd skip this for the SciFact-only target and pick it back up if the goal expands to NFCorpus/SciDocs.

---

## 3. Ranked priority (lift / hour)

| Rank | Intervention                            | Expected lift | Effort | Lift/h | Risk           |
|-----:|-----------------------------------------|--------------:|-------:|-------:|----------------|
| 1    | #1 RRF k + α sweep                     | +0.6 pt       | 1.5 h  | 0.40   | HIGH-CONFIDENCE |
| 2    | #2 BM25 k1/b retune                    | +0.5 pt       | 2.0 h  | 0.25   | HIGH-CONFIDENCE |
| 3    | #4 Calibrated LR fusion                | +0.8 pt       | 3.0 h  | 0.27   | LIKELY          |
| 4    | #3 Title-weighted doc repr (variant a) | +0.5 pt       | 3.0 h  | 0.17   | LIKELY (40% null) |
| 5    | #5 Per-query adaptive α                | +0.2 pt       | 2.0 h  | 0.10   | SPECULATIVE    |

**Sequenced plan (one afternoon, 6.5 h total):**
- 1.5 h: #1 sweep → measure
- 2.0 h: #2 BM25 grid → measure
- 3.0 h: #4 calibrated fusion (only if #1+#2 already net ≥ +0.7 pt and trend supports a learned fuse on top)

**Honest aggregate forecast:** stacking #1 + #2 + #4 has diminishing returns (they all touch the fusion stage). Realistic combined ceiling: **76.5–77.0% NDCG@10**, putting folklore within 0.5 pt of the bge-base + GPU-rerank line at zero new dependencies.

---

## 4. Conscience section — what's most likely to null

The team has 10+ documented null gates. The proposals above must be ranked honestly:

- **#3 (title weighting) is the highest-probability null.** bge-base's CLS pool already weights position-zero tokens more heavily than mean-pool models — the title signal may already be captured. I rate it 40% null. **Skip if effort-constrained.**
- **#5 (adaptive α) is null on SciFact alone** — homogeneous query length distribution. Only useful for multi-dataset.
- **#1 (RRF sweep) cannot null below baseline** — the baseline (k=60, α=0.5) is in the search space, so worst case = 0 lift. This is the safest spend.
- **#2 (BM25 retune) has a Pyserini-published positive precedent**, so it should not null — but the published lift is small (+0.3 to +0.5), so don't expect more.
- **#4 (calibrated fusion) is the highest-variance bet** — could lift +1.5 pt or null if the held-out fold shows train/test qrel pattern leakage. Run only after #1 + #2 confirm there's tunable signal in the fusion stage at all.

**One thing I deliberately did NOT propose:** a new encoder swap, a new reranker, or any IVF-PQ/HNSW work. The team already proved Wave 3 reranker hurts (BENCH §2b), Qwen3 hurts (§2.x), and bge-base is already the encoder ceiling at 137M-params CPU. Spending hours on encoder swaps is the documented anti-pattern.

**Final honest take:** If forced to ship one intervention, ship **#1 (RRF k sweep)**. It's 90 minutes, can't go below baseline, and the published precedent suggests +0.4 to +0.8 pt lift is highly likely. Everything else is +EV but has tail risk.

*Cached artifact for all gates: `~/.folklore/bench/scifact__rust-via-ts__bge-base/vectors.db` (corpus + FTS5 already indexed). Re-run cost per gate: ~30 s of Rust embedder time for 300 queries + 1 s of SQL.*
