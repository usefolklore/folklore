# scifact-mini — synthetic SciFact-style retrieval fixture

**Provenance: this is a SYNTHETIC, hand-authored fixture, NOT the official
BEIR SciFact split.** It was written from scratch for `bench-scifact-offline.mjs`
so that retrieval quality can be measured fully in-sandbox with zero network
(no BEIR `.zip` download, no HuggingFace model pull). The numbers it produces
are **not comparable** to the BEIR leaderboard or to the 72.30% NDCG@10 figure
reported on the full 5,183-doc SciFact corpus — they only track relative change
of the *production hybrid pipeline* on this fixed mini-task.

## Shape

| File | Format | Count |
|---|---|---|
| `corpus.jsonl` | BEIR corpus JSONL (`{_id, title, text}`) | 40 passages |
| `queries.jsonl` | BEIR queries JSONL (`{_id, text}`) | 18 claim queries |
| `qrels.tsv`     | BEIR qrels TSV (`query-id  corpus-id  score`, header row) | 18 (q, doc) pairs |

The format matches BEIR v1 exactly (`corpus.jsonl` / `queries.jsonl` /
`qrels/test.tsv`), so the same loader/metric code that `bench-beir*.mjs` uses
applies unchanged.

## Why it is a *real* retrieval task

The corpus spans ~13 biomedical topic clusters (vitamin D, statins, aspirin,
insulin/diabetes, gut microbiome, telomeres/cancer, immunity, sleep, blood
pressure, smoking, diet, neuroscience). Each query targets exactly one gold
passage, but every cluster contains 2-4 *near-distractor* passages that share
vocabulary with the gold doc (e.g. q01 "vitamin D ... respiratory infection"
must beat d002 "vitamin D ... bone density" and d003 "vitamin D synthesis").
This makes the task **lexically and semantically separable but non-trivial** —
a pure-frequency baseline that ignores meaning will misrank the distractors,
so both the BM25 (FTS5) and dense arms of the hybrid pipeline are exercised.

Each gold pairing is single-relevant (binary `score=1`), so NDCG@10 and
Recall@10 are well-defined and Recall@1 == MRR-style top-hit rate.

## Determinism

The fixture is a committed flat file — no randomness, no generation step at
run time. Re-running the bench yields identical metrics for a given embedder.
