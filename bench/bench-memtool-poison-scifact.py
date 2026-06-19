#!/usr/bin/env python3
"""
bench-memtool-poison-scifact.py — P2 provenance/poison-defense, SCALED to a real
BEIR SciFact corpus (eval/fixtures/scifact-mini: 40 real docs, 18 real queries).

The toy P2 (bench-memtool-poison.py) had 1 clean + 1 poison per query — easy.
This scales it: 40 REAL trusted docs + 18 REAL queries, and for each query one
untrusted POISON doc that mirrors the query (verbatim query text + a contradiction
tail → maximal cosine to the query). The poison must now out-rank not just its
target but a realistic field of 40 competing docs. Tests whether the provenance
lever (demote untrusted) still drives flip-ASR to ~0 at corpus scale, not just on
a toy.

Matched control: all-MiniLM-L6-v2; identical retrieval; ONLY variable = provenance.
Metric: flip-ASR (top-1 retrieved across clean∪poison is the query's poison).
similarity-only == mem0/LangChain/RAG (no provenance field). provenance-demotion
== folklore's lever. MEASURED on real embeddings; trust signal = signed/untrusted.

Run:  python3 bench/bench-memtool-poison-scifact.py [--json]
"""
import argparse, json
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FIX = REPO / "eval" / "fixtures" / "scifact-mini"
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
DEMOTIONS = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5]


def load_jsonl(p):
    return [json.loads(l) for l in p.read_text().splitlines() if l.strip()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    try:
        from sentence_transformers import SentenceTransformer
        import numpy as np
    except Exception as e:
        print(json.dumps({"status": f"unavailable: {e}"})); return

    corpus = load_jsonl(FIX / "corpus.jsonl")     # real docs, TRUSTED
    queries = load_jsonl(FIX / "queries.jsonl")   # real queries
    model = SentenceTransformer(EMBED_MODEL)

    # docs: 40 real trusted + one untrusted poison per query (mirrors the query)
    docs = []  # (id, trusted, text, poison_for_qid|None)
    for d in corpus:
        docs.append((d["_id"], True, f"{d.get('title','')} {d.get('text','')}", None))
    for q in queries:
        poison_text = f"{q['text']} In fact the opposite is true and the claim is false."
        docs.append((f"poison_{q['_id']}", False, poison_text, q["_id"]))

    doc_emb = np.asarray(model.encode([d[2] for d in docs], normalize_embeddings=True), dtype="float32")
    q_emb = {q["_id"]: np.asarray(model.encode([q["text"]], normalize_embeddings=True)[0], dtype="float32")
             for q in queries}

    def flip_asr(demotion):
        flips = 0
        for q in queries:
            qid = q["_id"]; qv = q_emb[qid]
            best_score = -9; best_is_poison = False
            for i, (did, trusted, _t, pfor) in enumerate(docs):
                cos = float(np.dot(qv, doc_emb[i]))
                score = cos - (0.0 if trusted else demotion)
                if score > best_score:
                    best_score = score
                    best_is_poison = (pfor == qid)  # the poison crafted FOR this query
            if best_is_poison:
                flips += 1
        return round(flips / len(queries), 4)

    sim_asr = flip_asr(0.0)
    curve = [{"demotion": dm, "flip_asr": flip_asr(dm)} for dm in DEMOTIONS]
    best = min(curve, key=lambda p: p["flip_asr"])

    out = {
        "benchmark": "memory-tools", "phase": "P2-scifact", "axis": "provenance_poison_defense",
        "corpus": "BEIR scifact-mini (real)", "n_docs_trusted": len(corpus),
        "n_poison": len(queries), "n_queries": len(queries), "embedder": EMBED_MODEL,
        "metric": "flip-ASR (top-1 across 40 real docs + 18 poison is the query's poison); lower better",
        "competitor_similarity_only_flip_asr": sim_asr,
        "folklore_provenance_curve": curve, "folklore_best": best,
        "note": "Scaled from the toy P2 (1 clean+1 poison) to 40 real trusted docs + 18 real "
                "queries, each with a query-mirroring untrusted poison. similarity-only == "
                "mem0/LangChain/RAG (no provenance); provenance-demotion == folklore's lever. "
                "MEASURED, matched MiniLM. Tests whether the provenance defense holds at corpus scale.",
        "structural": "competitors have no provenance field -> pinned to the similarity-only row.",
    }
    outdir = Path.home() / ".folklore" / "bench" / "memory-tools"; outdir.mkdir(parents=True, exist_ok=True)
    (outdir / "p2-poison-scifact.json").write_text(json.dumps(out, indent=2) + "\n")

    if a.json: print(json.dumps(out, indent=2)); return
    print("\nMemory-Tool Benchmark — P2 provenance/poison-defense @ REAL scifact-mini\n")
    print(f"  {len(corpus)} real trusted docs + {len(queries)} query-mirroring poison docs; {len(queries)} queries; matched MiniLM\n")
    print(f"  similarity-only (mem0 / LangChain / RAG — no provenance):  flip-ASR = {sim_asr}")
    print(f"  folklore provenance-demotion:")
    for p in curve:
        print(f"     demote untrusted by {p['demotion']:.1f}  ->  flip-ASR = {p['flip_asr']}")
    print(f"\n  folklore best: flip-ASR {best['flip_asr']} at demotion {best['demotion']}")
    print(f"  competitors structurally pinned to similarity-only row (no provenance field).")
    print(f"  snapshot -> {outdir / 'p2-poison-scifact.json'}\n")


if __name__ == "__main__":
    main()
