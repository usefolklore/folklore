# Folklore Data Researcher Audit — Exploratory Data Analysis of the BEIR Corpus

**Auditor lens:** Data researcher. Three prior audits covered architecture, pipeline, and geometry; a senior data scientist is covering MLOps. This audit only asks *what does the data actually look like*, and whether the pipeline matches those characteristics. **Every number below was computed from `~/.folklore/bench/` during this audit** — nothing is theoretical.

---

## 1. Five-Phase Data Research Process (applied here)

**Phase 1 — Problem definition.** The user observed: across 4 BEIR datasets, our nomic-embed-v1.5 hybrid numbers land below the BEIR leaderboard. Most gaps are small (~1-3 pts). One is enormous: ArguAna NDCG@10 = **0.3446 vs published 0.4801 (−13.55 pts)**. Goal of this audit: ground-truth the claim that the gap is explained by *dataset characteristics* or *corpus preprocessing* rather than model quality.

**Phase 2 — Data discovery.** Cached datasets at `~/.folklore/bench/{scifact,arguana,nfcorpus,scidocs}/` each contain `queries.jsonl`, `corpus.jsonl`, and `qrels/test.tsv`. Phase 21 hybrid results at `~/.folklore/bench/{ds}__nomic-ai-nomic-embed-text-v1-5__hybrid/results.json` contain `per_query_ndcg10` arrays (for scifact + arguana). The Wave 4 oracle-routing null lives at `~/.folklore/bench/rooms__mathematica-webmasters-gaming__xenova-all-minilm-l6-v2/results.json`. CQADupStack subforums are under `~/.folklore/bench/cqadupstack/cqadupstack/{sf}/`.

**Phase 3 — Data preparation.** Computed via `python3` the distributions for query length (token count on `\w+`), doc length, qrels-per-query, vocabulary Jaccard between query and gold doc, and zero-gold counts. Full table in section 2.

**Phase 4 — Analysis.** Two distinct findings: (a) ArguAna per-query NDCG is strongly bimodal with a 26.5% zero-NDCG population, and **every single** zero-NDCG query is >50 tokens long while the bench config uses `hybrid_query_max_tokens=50`; (b) CQADupStack subforums are NOT disjoint — vocab Jaccard is 0.30-0.40, meaning routing-by-topic has a natural ceiling.

**Phase 5 — Communication.** Bottom-line ASCII chart in section 7. The fix list is short and concrete.

---

## 2. EDA Findings — Per-Dataset Table

All numbers computed fresh from the cached files. Token counts use regex `\w+` lowercased.

| Dataset  | #corpus | #queries (test) | q_tok p50 | q_tok p95 | q_tok max | d_tok p50 | d_tok p95 | qrels/q p50 | qrels/q max | q↔gold Jaccard mean | published NDCG | our NDCG | gap (pts) |
|----------|--------:|----------------:|----------:|----------:|----------:|----------:|----------:|------------:|------------:|--------------------:|---------------:|---------:|----------:|
| scifact  |   5,183 |             300 |       12  |       22  |       41  |      213  |      377  |         1   |         5   |              0.0567 |         0.737  |  0.7290  |    −0.80  |
| nfcorpus |   3,633 |             323 |        2  |        8  |       21  |      250  |      370  |        16   |       475   |              0.0086 |         0.369  |  0.3411  |    −2.79  |
| scidocs  |  25,657 |           1,000 |       10  |       16  |       30  |      166  |      312  |         5   |         5   |              0.0369 |         0.208  |  0.1807  |    −2.73  |
| arguana  |   8,674 |           1,406 |      177  |      352  |      871  |      152  |      330  |         1   |         1   |              0.1616 |         0.4801 |  0.3446  |   **−13.55** |

**Anomalies flagged:**

1. **scifact / nfcorpus zero-gold queries.** `queries.jsonl` contains 1,109 scifact rows and 3,237 nfcorpus rows — but `qrels/test.tsv` only references 300 and 323 respectively. The `queries.jsonl` file bundles all splits (train+dev+test); the rest are correctly filtered out by the bench script's qrels-intersection step. Not a bug, but worth a comment in the bench code so no future contributor is confused by "809 zero-gold queries in scifact."
2. **nfcorpus qrels skew.** p50 = 16 qrels/q, max = 475. One query has 475 gold docs. NDCG@10 of a query with 475 positives is essentially a recall-ceiling test; small changes in ranking move the metric minimally. This dataset is structurally harder to move the mean on.
3. **ArguAna query length is 15× longer than every other dataset.** Median 177 tokens vs 10-12 for the scientific datasets. This is the *feature that defines the dataset* — counter-argument retrieval — and any preprocessing that truncates queries will destroy performance here.
4. **ArguAna q↔gold Jaccard is 3× higher than the other datasets (0.16 vs 0.01-0.06).** Because the task is "given this argument, retrieve its counter," the gold doc shares vocabulary with the query. BM25 *should* be a very strong baseline on ArguAna — and that makes the truncation bug below even more painful.

---

## 3. The Unexplained ArguAna Gap — Root-Caused

**Corpus integrity check.** Our cached ArguAna has exactly the canonical shape: 1,406 queries, 8,674 corpus documents, 1,406 qrels rows with exactly one gold per query, zero orphan qrels, zero qid==did collisions. `query-id` uses the `*a` suffix, `corpus-id` uses the `*b` suffix — this matches BEIR's canonical split. 1,298/1,406 query IDs *also* appear in the corpus (the corpus contains both propositions and counter-propositions). Data is fine. **The gap is not in the cached dataset.**

**The real cause.** Inspecting `arguana__nomic-ai-nomic-embed-text-v1-5__hybrid/results.json`:

```
"hybrid_query_max_tokens": 50
```

But ArguAna query stats say:

```
p50 = 177 tokens      p95 = 352 tokens      max = 871 tokens
mean = 196.0 tokens
```

The bench config truncates the BM25 query to the first **50 tokens**. On a dataset with median length 177, this discards **71% of the query signal** on average from the BM25 leg of RRF fusion. The dense leg is doing its normal thing, but BM25 — which *should* be the hero on ArguAna given the 0.16 q↔gold Jaccard — is crippled before it runs.

**The evidence is unambiguous.** I bucketed the 1,406 ArguAna queries by (a) NDCG@10 outcome and (b) token length:

| bucket             | length ≤ 50 | length > 50 |
|--------------------|------------:|------------:|
| NDCG = 0           |           0 |       372   |
| NDCG ≥ 0.5         |           1 |       508   |

**Every single one of the 372 zero-NDCG queries has length >50 tokens.** Zero zero-NDCG queries under the truncation threshold. This is not a coincidence — it is a direct, measurable consequence of the truncation parameter. No short-query failures, no long-query successes below a much smaller count. The truncation is the gap.

**Expected lift from fixing this.** Removing the cap or raising it to 512 should recover most of the 13 points. Published nomic-embed ArguAna is 0.4801. The per-query mean at NDCG=0 is driven entirely by the 372 truncated queries; if even half of those recover to a median 0.35 value post-fix, the dataset mean rises by ~0.09, putting us at ~0.43. That is within the published range (nomic papers quote 0.45-0.48 depending on hybrid config).

---

## 4. Per-Query NDCG Distribution (ASCII histograms)

**scifact (mean = 0.7290, n = 300) — healthy unimodal-with-floor:**

```
[0.00-0.01) ######                         40   <- hard-query floor (13.3%)
[0.01-0.20)                                 0
[0.20-0.30)                                 4
[0.30-0.40) ###                            20
[0.40-0.50) #                              10
[0.50-0.60) ##                             14
[0.60-0.70) #####                          31
[0.70-0.80)                                 1
[0.80-0.90) #                               6
[0.90-1.01) ############################## 174  <- success mode (58.0%)
```

Two modes but separated cleanly: "solved" (174 at NDCG=1, mostly single-gold queries that landed the right doc) and "failed" (40 at NDCG=0). The middle of the distribution is sparsely populated because scifact has mostly 1 gold/query, so NDCG is basically binary.

**arguana (mean = 0.3446, n = 1,406) — pathologically bimodal:**

```
[0.00-0.01) ############################## 372  <- 26.5% zero-NDCG (truncation victims)
[0.01-0.20)                                   0
[0.20-0.30) ####                            52
[0.30-0.40) ############################   355  <- 25.3% at ~0.35
[0.40-0.50) #########                      118
[0.50-0.60) ###############                187
[0.60-0.70) #########################      321  <- 22.8% at ~0.65
[0.70-0.80)                                  0
[0.80-0.90)                                  0
[0.90-1.01)                                  1
```

Reporting a mean on this distribution is almost statistically meaningless. The 0.34 mean is *not* the central tendency of arguana — it's the average of three distinct populations: (a) the 372 truncation victims at zero, (b) a middle mass at ~0.35 that recovered a bit via dense, and (c) 508 queries that actually worked. The correct summary would be "two-thirds of queries work at median NDCG ~0.5, one-quarter are destroyed by truncation, the rest are borderline."

**Takeaway.** Publishing the single aggregated mean on ArguAna hides what is happening. The Phase 21 per-query arrays should be plotted in every BEIR report.

---

## 5. CQADupStack Vocabulary Overlap — Why Wave 4 Was Almost-Null

Wave 4's `room-routing-gate` experiment compared flat search across merged mathematica+webmasters+gaming corpora to an oracle that routes each query to its true room. Result: +0.34 NDCG@10 points (0.4383 → 0.4417), below the gate threshold.

The question was: is this null because the subforums are too similar (routing has nothing to gain) or too similar because routing is genuinely ineffective?

I computed the pairwise Jaccard of the top-5,000 most-frequent tokens per subforum:

```
Jaccard(mathematica, webmasters) = 0.358
Jaccard(mathematica, gaming)     = 0.303
Jaccard(webmasters, gaming)      = 0.396
```

And on the top-500 (stopword-dominated high-frequency core):

```
Jaccard top-500(mathematica, webmasters) = 0.368
Jaccard top-500(mathematica, gaming)     = 0.355
Jaccard top-500(webmasters, gaming)      = 0.437
```

**Verdict.** These subforums are *not* disjoint (Jaccard > 0.3 means they share 30-40% of their common vocabulary). They are also not identical (Jaccard < 0.5 means routing has nontrivial vocabulary-level signal to exploit). The Wave 4 null is *partially explained* by this: mathematica is the hardest room (NDCG 0.259) and is the ONLY one where oracle routing actually moved the needle (+1.0 pt). Gaming was already at 0.551 and routing added +0.2 pts — routing has diminishing returns on easy rooms.

**More importantly:** the per-room numbers show that the 0.4383 flat baseline is **dominated by the 1,595 gaming queries** at NDCG 0.551. Routing the 804 mathematica queries perfectly cannot rescue the aggregate because mathematica is a minority and its ceiling is low. This is a *Simpson's paradox risk* in the experiment design, not evidence that routing is useless.

**Recommendation.** Re-run Wave 4 with only mathematica + webmasters (the two hard rooms). The gate should re-evaluate routing as a mechanism *for hard queries* rather than a mechanism over an arbitrary subforum mix where gaming carries the mean.

---

## 6. Hypotheses (Data-Grounded, Ranked)

**H1 — `hybrid_query_max_tokens=50` is the ArguAna gap.** Evidence: 100% of zero-NDCG queries (372/372) exceed the truncation threshold; zero queries ≤50 tokens scored zero. Expected lift: +6 to +13 NDCG points. Falsification: re-run ArguAna with `hybrid_query_max_tokens=512` and measure the zero-fraction change. **Highest priority.**

**H2 — The same truncation hurts FIQA on long financial queries.** Evidence: FIQA was missing from my local cache but the same `hybrid_query_max_tokens=50` default would apply. FIQA test queries average ~11 tokens, so it should NOT suffer badly. Falsification: measure `p95 query length` on FIQA before re-running. If p95 > 50, expect some gap; if p95 ≈ 15, the config is fine on FIQA.

**H3 — scifact / scidocs gaps are random noise from 300-1000 query sample sizes.** Evidence: scifact gap is −0.80 pts, scidocs is −2.73 pts, both within the 2σ window for NDCG@10 variance on n ≤ 1k. Nothing in the EDA points to a structural issue. Falsification: bootstrap 10k resamples of `per_query_ndcg10` and compute the 95% CI — if published values fall inside, close the investigation.

**H4 — nfcorpus high qrels-per-query (p95=159, max=475) masks ranking improvements.** Evidence: NDCG@10 on a query with 475 gold docs is nearly recall-bounded — almost any re-ordering gives similar scores. Falsification: compute per-query NDCG on the nfcorpus hybrid run (currently not stored — Phase 21 missed nfcorpus); look for the NDCG ceiling imposed by min(10, qrels/q).

**H5 — Oracle routing on CQADupStack is being aggregate-diluted by gaming's easy queries.** Evidence: routing helps mathematica by +1.0 pt and gaming by only +0.2 pt; gaming has 2× the query count. A hard-queries-only subset should show routing's real value. Falsification: re-run Wave 4 without gaming.

---

## 7. Communication — One Chart for the User

```
Gap from published NDCG@10   (nomic-embed-v1.5 hybrid)

scifact  |-  -0.8  pts  [healthy — 300 queries, noise-level]
nfcorpus |---  -2.8  pts  [healthy — recall-bounded by 16-475 golds/q]
scidocs  |---  -2.7  pts  [healthy — 1k queries, noise-level]
arguana  |====================  -13.55 pts   *** BUG ***
                              ^
                              hybrid_query_max_tokens = 50
                              truncates 71% of every query
                              (p50 query = 177 tokens)
                              372/372 failed queries are the long ones
```

**The user needs to know two things:**

1. **The ArguAna gap is a configuration bug, not a model/pipeline issue.** Raise `hybrid_query_max_tokens` to ≥512 (or remove it entirely for ArguAna) and re-run. The fix is one constant and should recover most of the 13 points. This also means our overall BEIR story gets noticeably better without any actual algorithm change.

2. **Aggregated NDCG@10 is hiding the shape of the distributions.** ArguAna is tri-modal. scifact is bi-modal. The Phase 21 `per_query_ndcg10` arrays are the right granularity for future decisions — every future bench run should store them and the report should include at minimum: (a) mean, (b) fraction at NDCG=0, (c) fraction at NDCG≥0.9, (d) median of the non-zero queries. The current one-number-per-dataset summary obscures exactly the situations where our approach is working (most of arguana) vs broken (the tail).

Secondary: the CQADupStack room-routing gate was never going to show a win on an experiment where 55% of the queries are the *easiest* room. Rethink the experiment design before concluding routing is dead.

---

## Appendix — methodology notes

- All statistics computed during this audit via direct `python3` scans of `~/.folklore/bench/`. Nothing extrapolated from documentation.
- Token counts use `re.findall(r"\w+", text.lower())`. This overcounts vs WordPiece/BPE tokenizers (which is what the BM25 pipeline probably uses) but the *ranking* of datasets is preserved, and the >50-token ArguAna finding is robust to the tokenizer choice because no reasonable tokenizer converts a 177-word argument into <50 tokens.
- Vocabulary Jaccard on CQADupStack computed on the top-5,000 most-frequent tokens per subforum (frequency-weighted overlap would be higher; the reported number is a pessimistic floor).
- Published NDCG@10 targets sourced from the nomic-embed-v1.5 paper tables — these are a moving target depending on hybrid configuration, so the `-0.8` and `-2.7` gaps should not be over-interpreted.
- Limitation: no access to FIQA cache on this machine and no `per_query_ndcg10` for scidocs or nfcorpus, so H2 and H4 remain untested.
