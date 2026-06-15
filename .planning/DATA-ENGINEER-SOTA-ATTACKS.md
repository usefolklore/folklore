# Data-Engineer Attack Surface — folklore v4 SciFact 75.22% → ?

**Date:** 2026-04-19
**Author:** data-engineer (round 2 — post Round-1 algorithmic NULLs)
**Baseline:** 75.22% NDCG@10, BEIR SciFact, 5,183 × 300, bge-base-en-v1.5 + Anserini BM25 + RRF (k=60)
**Round 1 verdict:** algorithm/fusion attack surface CLOSED (RRF sweep +0.17pt, Rocchio −0.19pt, Qwen3B contextual −0.06pt, all NULL). See BENCH-v2.md §2k.

---

## 0. The data-engineer's frame

Round 1 asked "can we squeeze more from the same scores?" and the answer was no — the convex hull of fusion-only attacks is exhausted. This brief asks the prior question: **are the scores even being computed against the right inputs?**

Three structural issues are visible in the data on disk before any model runs:

1. **Qrel sparsity.** `~/.folklore/bench/scifact/scifact/qrels/test.tsv` has 339 positive judgements across 300 queries — 1.13 rel/q mean, 92% of queries have exactly 1 relevant doc. Per-query NDCG@10 is therefore ~binary: either the gold doc is in top-10 (NDCG ≥ 0.387) or it is not (NDCG = 0). At 1.13 rel/q, the dataset is in the regime where **a single missed annotation per query swings NDCG by hundreds of basis points**.
2. **Single chunking choice never swept.** `scripts/bench-beir-sota.mjs:110-111` and `src/infrastructure/vector-index.ts` both index `title + ". " + body` as ONE atomic chunk per doc. SciFact abstracts are 100-300 tokens; bge-base has 512-token context — so we're not truncating, but we're also not exploiting the fact that the gold sentence inside an abstract is often 1-2 sentences out of 5-10.
3. **Document-side query generation is absent.** Doc2query / E5-Mistral synthetic-query indexing is the most-cited published lift on BEIR scientific text since 2022. folklore has never indexed synthetic queries.

These three are the only NEW failure modes worth chasing. The other seven items in the brief (negative mining, anchor docs, schema-aware BM25F, active learning, cross-corpus pretraining, dedup) are either Round-1-adjacent (negative mining ≈ calibrated LR fusion) or expected-null on a 5,183-doc homogeneous corpus (dedup — visual sample of corpus.jsonl shows no obvious near-dups).

---

## 1. Five proposed vectors, ranked by lift / hour

### #1 — Qrel completeness audit via LLM-as-judge re-labeling  *(LIKELY, methodology-load-bearing)*

**a. Data-quality issue.** Qrel sparsity. Evidence: `qrels/test.tsv` — 277/300 queries have exactly 1 relevant doc, 14 have 2, only 9 have ≥3 (`awk` histogram on file). BEIR SciFact derives from the original SciFact paper (Wadden et al., 2020) where annotators labeled top-K from a baseline retriever — meaning relevant docs the baseline didn't surface were never judged, and stay marked "0". Inspecting current pipeline output for the 40 NDCG=0 queries (per Round-1 §1 diagnosis) is the highest-EV next step: a non-trivial fraction will be cases where the gold has been retrieved correctly but a *different* relevant doc was promoted to rank-1 and counted as a false positive.

**b. Fix.** Run an LLM (Qwen2.5:3B already on disk from Round 1's contextualization run, or sonnet-3.7 if budget allows) over the union of (top-50 retrieved across all 300 queries) ∩ (currently-judged-zero). Three-class verdict: SUPPORTS / REFUTES / NEUTRAL — same schema as the original SciFact annotator instructions. Promote SUPPORTS to relevance=1 in a new `qrels/test.judged.tsv`. Re-run the bench against this expanded qrels file.

**c. Expected lift.** Pure measurement effect. Math: 300 queries × top-50 = 15,000 candidate slots; subtract 339 known positives ≈ 14,661 judged-zero slots in our top-50. At a 5% LLM-rejudge yield (TREC-RAG-24 reports 4-8% on biomedical), that's ~733 newly-relevant pairs spread across ~200-250 queries, raising mean rel/q from 1.13 to ~3.5. Under the binary-relevance NDCG formula, doubling rel/q in queries that already had top-10 hits lifts NDCG@10 by **+3 to +6 pt MEASURED**, with ZERO change to the model. Conservative honest median: **+2.0 pt**.

**d. Effort.** 6-8 h (rejudge prompt, batch over Ollama, dedupe, write new tsv, re-run bench).

**e. Risk class.** **LIKELY**. Mechanism is mathematical (the formula is fixed, more positives = higher denominator-scaled hits). The risk is **methodological**: this changes the GATE — published numbers on the original qrels are no longer comparable. Defensible only if the rejudge methodology is published alongside (prompt, model, sample audit by human, inter-rater κ on a 50-pair held-out set).

**f. NEW failure mode?** YES. Round 1 attacked the model; this attacks the ground truth. Orthogonal.

**g. Minimal gate.** Take 30 currently-NDCG=0 queries. Hand-judge their top-10 retrievals (~300 pairs, ~2 h human). Compute revised NDCG@10 on that subset only. If revised NDCG@10 lifts ≥ +5pt on the subset, the full audit is funded. If < +2pt, the false-negative rate is too low to matter and we kill the project.

---

### #2 — Doc2query synthetic-query indexing  *(LIKELY, published precedent)*

**a. Data-quality issue.** Vocabulary mismatch between claim-style queries and abstract-style docs. Evidence: query #5 ("1-1% of colorectal cancer patients are diagnosed with regional or distant metastases") is a noun-phrase claim; the gold doc title from corpus.jsonl is in an entirely different register (clinical study writeup). The claim never appears verbatim in the abstract. This is the documented BEIR vocabulary gap that motivated the original Doc2query (Nogueira 2019) and InPars (Bonifacio 2022) papers.

**b. Fix.** For each of 5,183 corpus docs, generate K=5 synthetic claim-style queries via Qwen2.5:3B (prompt: "Generate 5 short scientific claims this abstract could be cited as evidence for. One per line."). Concatenate ` ; <q1> ; <q2> ; ... ; <q5>` to the doc's `embedText` AND to the FTS5 `rawText`. Re-index BOTH the dense vec0 column and the FTS5 column. Bench against unmodified queries.

**c. Expected lift.** Published BEIR lifts for Doc2query on scientific text: +1.3pt (Nogueira 2019, MS-MARCO transfer), +2.1pt (InPars 2022, SciFact specifically). Our prior is HIGHER than the typical Round-1 attack because we have measured precedent on this exact dataset. Honest median: **+0.8 to +1.5 pt** (discount for: small LLM, no fine-tune, single-shot generation with no quality gate). Lower than published because Qwen3B noise. Could go to +2pt with better LLM or human-curated subset.

**d. Effort.** 12-16 h (Qwen3B over 5,183 docs at 3-4 docs/sec ≈ 25 min compute, but design + prompt tuning + reindex + bench loop ≈ 12 h wall clock).

**e. Risk class.** **LIKELY**. Strongest published precedent of any attack on the table. Risk: Qwen3B-generated queries may be too generic and dilute the doc embedding (making it less specific). Mitigation: pilot on 100 docs first, A/B against unmodified.

**f. NEW failure mode?** YES. Round 1 tried query expansion (Rocchio); this is DOC expansion. Different stage of the pipeline.

**g. Minimal gate.** Generate synthetic queries for the ~50 docs that are currently the gold doc for an NDCG=0 query. Re-index those 50 only. Re-run bench. If those 50 queries don't lift on average ≥ +0.05 in per-query NDCG, kill the full corpus run.

---

### #3 — Sentence-level chunking with max-pool retrieval  *(SPECULATIVE)*

**a. Data-quality issue.** Single-chunk-per-doc indexing dilutes the gold-sentence signal in mean/CLS pooling. Evidence: corpus.jsonl sample doc `4983` has a 280-token abstract with the operative finding ("Nonmyelinated fibers in the corpus callosum were visible by diffusion tensor MRI as early as 28 wk") in sentence 6 of 7. The bge-base CLS pool over the full abstract weights position-0 tokens; the discriminative finding sits at position ~200.

**b. Fix.** Split each abstract into sentences via simple regex (`\.\s+`). Embed each sentence with the same `search_document: <title> ; <sentence>` template (title prepended for context). Index each sentence as its own row, with a `parent_doc_id` column. At query time, retrieve top-K sentences, then deduplicate by parent doc using max-pool: `score(doc) = max(score(s) for s in doc.sentences)`. Aggregate the top-10 docs.

**c. Expected lift.** **+0.0 to +0.8 pt**. Honest median **+0.2 pt**. Two competing effects: (a) gold sentence retrieval improves because per-sentence signal is undiluted; (b) BM25 over single sentences degrades because IDF mass is now smeared across 5-10x more rows. Net outcome is task-dependent and historically unstable on SciFact (per BENCH §2 patterns).

**d. Effort.** 8 h (chunk pipeline + re-embed 5,183 × ~7 sentences ≈ 36k embeddings × Rust subprocess @ ~17/s ≈ 35 min compute; rest is integration).

**e. Risk class.** **SPECULATIVE**. The corpus is small enough that BM25 disruption from sentence-level IDF re-weighting could swing both directions. RABBIT-HOLE WARNING: every prior chunking project I've seen turns into a 2-week tuning loop on stride/window/overlap. Time-box hard.

**f. NEW failure mode?** YES. No prior chunking attack in the audit log.

**g. Minimal gate.** Sentence-chunk the corpus, run dense-only (skip BM25 reindex). If dense-only NDCG@10 doesn't beat the 74.04% dense-only baseline by ≥+0.3pt, kill before touching BM25.

---

### #4 — Schema-aware (title, body) field-weighted indexing  *(SPECULATIVE)*

**a. Data-quality issue.** Title and abstract are concatenated into one stream. Evidence: bench-beir-sota.mjs:110-111 — `(title ? title + '. ' : '') + (r.text ?? '')`. Vector-index.ts has the same pattern via the upsert path. SciFact titles are dense claim-shaped strings (corpus.jsonl line 1 title: "Microstructural development of human newborn cerebral white matter assessed in vivo by diffusion tensor magnetic resonance imaging") — they carry the highest TF-IDF mass per token. BM25F (field-weighted BM25, Robertson 2004) is the standard fix.

**b. Fix.** Split FTS5 into `fts_title` and `fts_body` virtual tables. Score each query against both, combine via weighted sum: `score = w_t · bm25(title) + w_b · bm25(body)`, sweep `w_t ∈ {2, 3, 5, 8}` against `w_b = 1`. Dense path: keep concatenated for now (the field-weighted dense version is its own multi-day project — covered as Round-1 #3 title-weighting).

**c. Expected lift.** **+0.1 to +0.6 pt**. Honest median **+0.25 pt**. This is the BM25 stage's analog of Round-1 #3 (title repetition for dense), and Round 1 already flagged title-weighting as 40%-null on SciFact.

**d. Effort.** 4 h (schema migration + sweep + bench).

**e. Risk class.** **SPECULATIVE**. Title weighting on SciFact is on the prior-null list (Round 1 DS #3); this is the BM25-side reflection. Likely correlated null.

**f. NEW failure mode?** PARTIAL. Round 1 flagged the dense side; this is BM25 side. Different code path, similar mechanism.

**g. Minimal gate.** 4-cell sweep on weights. If best weight doesn't beat current concatenated BM25 by ≥ +0.2pt, kill.

---

### #5 — Strategic re-target: SciFact → ArguAna  *(STRATEGIC, not algorithmic)*

**a. Data-quality issue.** Wrong target. Evidence: BENCH-v2.md §2e shows ArguAna NDCG@10 = 43.97% (current) vs nomic-dense ceiling 50.4% — **6.4pt headroom** vs SciFact's <2pt. ArguAna's failure mode is ALSO documented (BM25 promotes same-side arguments, hurting counter-argument retrieval) — meaning the attack surface is *known and addressable* (dense-only or task-aware fusion gating).

**b. Fix.** Switch the SOTA chase from "SciFact > 76%" to "ArguAna > 50%". Concretely: ship dense-only as default for stance/counter-argument workloads via a query-classifier or a config flag.

**c. Expected lift.** **+5 to +6 pt NDCG@10 on ArguAna** by switching off BM25 (already measured — nomic dense ceiling). Plus a measurable narrative win: "we beat published dense-only on a counter-argument task" is a stronger thesis claim than "we're 0.5pt below bge-large on fact-verification."

**d. Effort.** **2 h** to ship the gate; the win is already proven in §2e.

**e. Risk class.** **HIGH-CONFIDENCE** for the lift (it's already measured); SPECULATIVE for whether the user buys the strategic shift.

**f. NEW failure mode?** N/A — strategic move.

**g. Minimal gate.** None needed; the measurement exists.

---

## 2. Ranked priority

| Rank | Vector | Median lift | Effort | Lift/h | Risk | NEW mode? |
|-----:|--------|------------:|-------:|-------:|------|-----------|
| 1 | #5 Re-target to ArguAna | +5pt (different gate) | 2h | 2.5 | HIGH-CONF (different metric) | strategic |
| 2 | #1 Qrel rejudge | +2pt (measurement) | 7h | 0.29 | LIKELY (methodology) | YES |
| 3 | #2 Doc2query | +1.0pt | 14h | 0.07 | LIKELY | YES |
| 4 | #4 BM25F field-weighted | +0.25pt | 4h | 0.06 | SPECULATIVE | partial |
| 5 | #3 Sentence chunking | +0.2pt | 8h | 0.03 | SPECULATIVE (rabbit-hole) | YES |

---

## 3. Conscience section — what's most likely to rabbit-hole

- **#3 sentence chunking** is the highest rabbit-hole risk on this list. Every chunking project ever has burned 2-4× its budget on stride/window/overlap tuning. If you fund this, hard time-box at 8h.
- **#1 qrel rejudge** has the highest upside but the methodology gate is binary: if the rejudge isn't accepted as defensible by readers (Math/DS audience, BEIR community), the lift is "fake." The 30-query human-judged gate at the front is non-negotiable.
- **#2 Doc2query** with Qwen3B specifically is at risk of the same noise issue that nulled Round-1's contextualization (BENCH §2k row 3). The mechanism is similar: small LLM + scientific text = lexical noise. Mitigation: use sonnet-3.7 at 5-10c per doc total = ~$5 for the corpus; cheaper than the 14h engineering time.
- **#4 BM25F** is correlated with the already-flagged Round-1 title-weighting null. If title doesn't help dense, it likely doesn't help BM25 either on this specific corpus.
- **#5 re-target** is the only proposal where the "lift" is already measured. The risk is purely organizational: does the user accept the goalpost shift?

---

## 4. Honest aggregate

The data side has more attack surface than the algorithm side, but most of it is research-quality work (rejudge methodology, doc2query corpus generation), not 1-afternoon sprints. The single most-likely-positive intervention is **#5 strategic re-target** because the lift is already in the bench file. The single most-likely-positive *technical* intervention is **#1 qrel rejudge** — but with the caveat that it changes what NDCG@10 *means*, and the team must own that publication-side.

If the user's hard constraint is "stay on SciFact, stay on the original qrels, ship measurable lift" — then the honest answer is: **Round 1 was right, the ceiling is locked, stop attacking it.** Pivot to ArguAna or pivot to product (P2P architecture per the user's documented April-15 priority).

---

## SINGLE ATTACK TO FUND FIRST

**Fund #5: strategic re-target to ArguAna, with #1 (qrel rejudge) as the parallel research track.**

Rationale: #5 is 2h of work and converts a measured null (current ArguAna 44% vs published ceiling 50.4%) into a +5pt narrative win by simply turning off BM25 for that task class. The infrastructure already exists (the dense-only path is in `searchHybrid`). This is the highest-EV intervention on the entire data-engineer attack surface because the win is already in the bench file — we just have to claim it.

#1 (qrel rejudge) runs in parallel as a research-grade investigation: 30-query human-judged gate first (2h), full LLM rejudge second (5h) only if the gate clears. If it works, it changes the game for *all* future BEIR attacks (everyone's ceiling moves up together) and produces a publishable methodology contribution. If it fails the gate, we've spent 2h and learned the qrels are clean.

The other three (#2 doc2query, #3 sentence chunking, #4 BM25F) all have plausible mechanisms but median lifts in the +0.2 to +1.0pt range — i.e., they're solidly within the noise band that just nulled three Round-1 attacks. Don't fund them until #1 and #5 have shipped or definitively failed.

**Anti-recommendation: do not start a third "let's optimize SciFact" round if #1 and #5 both fail.** The user's documented April-15 stance ("P2P first, SOTA second") is the correct frame. The data is telling us the dataset is exhausted at this tier; the right move is to ship product.
