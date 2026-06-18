#!/usr/bin/env python3
"""
bench-memtool-federation.py — Memory-Tool Benchmark, P3 (federated compounding).

The other axis where folklore structurally differs: it federates. Peers exchange
their resolved (question -> answer) memory over a Y.js CRDT, so a query one peer
has never seen is served from the network if ANY peer resolved it. mem0, Letta,
LangChain RAG and Zep are single-user silos by construction — a user's cache only
holds what THAT user resolved; adding more users does nothing for any individual.

This harness isolates the federation lever on IDENTICAL recall: same shared
need-pool, same paraphrased query stream, same matched embedder + threshold. The
ONLY variable is whether memory is SHARED across peers (folklore) or SILOED
(every competitor). Metric = cooperative cache hit-rate (fraction of queries
served from memory) as the peer count N grows.

  - silo (mem0 / LangChain / Letta / Zep): a peer hits only on its OWN prior
    resolutions. Flat in N — the "alone" ceiling, by construction.
  - federated (folklore): a peer hits if ANY peer already resolved the need.
    Rises with N as the commons warms.

LABEL: SIMULATOR — peer behaviour and CRDT sharing are modeled (folklore's real
sync is Y.js; the silo assumption is literally what single-user tools are). The
RECALL decision is MEASURED (real MiniLM cosine >= threshold over the accessible
memory). Cross-ref folklore's existing measured cooperative-cache result:
90.2% hit @ 64 peers vs 18% alone (bench-compounding).

Run:  python3 bench/bench-memtool-federation.py
      python3 bench/bench-memtool-federation.py --json --queries-per-peer 8 --threshold 0.55
"""
import argparse, json
from pathlib import Path

EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
PEER_COUNTS = [1, 2, 4, 8, 16, 32, 64]

# Shared need-pool: needs every peer might independently ask, each with paraphrases
# (peers phrase the same need differently — realistic, and forces semantic recall).
NEEDS = {
    "rerank_long_ctx": ["How does mxbai-rerank compare to a cross-encoder on long contexts?",
                        "Is mxbai-rerank better than cross-encoders for long inputs?",
                        "For long-context reranking, mxbai or a cross-encoder?"],
    "rrf_fusion": ["What is reciprocal rank fusion and why use it for hybrid search?",
                   "Explain RRF for combining BM25 and dense retrieval.",
                   "How does RRF merge multiple ranked lists?"],
    "hnsw_params": ["How do ef_construction and M affect HNSW recall and build time?",
                    "Tuning HNSW: what do M and ef_construction trade off?",
                    "Effect of HNSW M parameter on recall vs memory?"],
    "matryoshka": ["Does truncating Matryoshka embedding dimensions hurt retrieval?",
                   "Can I shorten MRL embeddings without losing accuracy?",
                   "Truncated matryoshka vectors: how much recall is lost?"],
    "splade_vs_dense": ["When does SPLADE beat dense retrieval on BEIR?",
                        "Is learned sparse retrieval better than dense out-of-domain?",
                        "SPLADE advantages over dense for zero-shot retrieval?"],
    "colbert_latency": ["Why is ColBERT late interaction slower at query time?",
                        "What makes ColBERT's late-interaction scoring expensive?",
                        "ColBERT query latency vs single-vector dense — why higher?"],
    "bm25_okapi": ["How does BM25 term saturation (k1) affect ranking?",
                   "What does the k1 parameter control in Okapi BM25?",
                   "Tuning BM25 k1 — effect on term frequency weighting?"],
    "cross_encoder_512": ["Do cross-encoders degrade past 512 tokens?",
                          "Why do cross-encoder rerankers struggle beyond 512 tokens?",
                          "Token-limit effects on cross-encoder reranking accuracy?"],
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--queries-per-peer", type=int, default=8)
    ap.add_argument("--threshold", type=float, default=0.55)
    ap.add_argument("--seed", type=int, default=11)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    try:
        from sentence_transformers import SentenceTransformer
        import numpy as np
    except Exception as e:
        print(json.dumps({"status": f"unavailable: {e}"})); return
    import random

    model = SentenceTransformer(EMBED_MODEL)
    # precompute embeddings for every (need, phrasing)
    phr = [(nid, p) for nid, ps in NEEDS.items() for p in ps]
    embs = np.asarray(model.encode([p for _, p in phr], normalize_embeddings=True), dtype="float32")
    idx = {(nid, p): i for i, (nid, p) in enumerate(phr)}
    need_ids = list(NEEDS.keys())

    def emb(nid, p): return embs[idx[(nid, p)]]

    def recall_hit(qv, store_vecs, tau):
        if not store_vecs:
            return False
        import numpy as np
        best = max(float(np.dot(qv, sv)) for sv in store_vecs)
        return best >= tau

    def run(n_peers, shared):
        rng = random.Random(a.seed + n_peers)
        # build a query stream: each peer asks queries_per_peer queries, each a
        # random need + random paraphrase. Interleave peers round-robin.
        per = a.queries_per_peer
        stream = []
        for q in range(per):
            for p in range(n_peers):
                nid = rng.choice(need_ids)
                phrasing = rng.choice(NEEDS[nid])
                stream.append((p, nid, phrasing))
        rng.shuffle(stream)
        peer_store = {p: [] for p in range(n_peers)}   # silo: per-peer vectors
        global_store = []                                # fed: shared vectors
        hits = 0
        for p, nid, phrasing in stream:
            qv = emb(nid, phrasing)
            accessible = global_store if shared else peer_store[p]
            if recall_hit(qv, accessible, a.threshold):
                hits += 1
            else:
                # cold: resolve + store (web fetch happened once)
                v = emb(nid, phrasing)
                if shared: global_store.append(v)
                else: peer_store[p].append(v)
        return round(hits / len(stream), 4)

    rows = []
    for n in PEER_COUNTS:
        silo = run(n, shared=False)
        fed = run(n, shared=True)
        rows.append({"peers": n, "silo_hit_rate": silo, "federated_hit_rate": fed,
                     "lift_x": round(fed / silo, 2) if silo > 0 else None})

    out = {
        "benchmark": "memory-tools", "phase": "P3", "axis": "federated_compounding",
        "kind": "SIMULATOR (peer behaviour + CRDT sharing modeled); recall decision MEASURED (MiniLM cosine>=tau)",
        "embedder": EMBED_MODEL, "threshold": a.threshold, "queries_per_peer": a.queries_per_peer,
        "metric": "cooperative cache hit-rate vs peer count; higher = more web trips avoided",
        "note": "silo == every competitor (single-user; flat in N by construction). "
                "federated == folklore (CRDT-shared memory; rises with N). Only variable is sharing. "
                "Cross-ref folklore measured: 90.2% hit @64 peers vs 18% alone (bench-compounding).",
        "structural": "mem0/Letta/LangChain/Zep cannot share memory across users -> they are the silo column.",
        "curve": rows,
    }
    outdir = Path.home() / ".folklore" / "bench" / "memory-tools"
    outdir.mkdir(parents=True, exist_ok=True)
    (outdir / "p3-federation.json").write_text(json.dumps(out, indent=2) + "\n")

    if a.json:
        print(json.dumps(out, indent=2)); return
    print("\nMemory-Tool Benchmark — P3 federated compounding (SIMULATOR; recall MEASURED)\n")
    print(f"  embedder={EMBED_MODEL}  threshold={a.threshold}  queries/peer={a.queries_per_peer}\n")
    print(f"  {'peers':>5}  {'silo (competitors)':>18}  {'federated (folklore)':>20}  {'lift':>6}")
    for r in rows:
        print(f"  {r['peers']:>5}  {r['silo_hit_rate']:>18}  {r['federated_hit_rate']:>20}  {str(r['lift_x'])+'x':>6}")
    print(f"\n  silo is flat in N by construction (single-user). folklore rises as the commons warms.")
    print(f"  cross-ref (folklore measured): 90.2% @64 peers vs 18% alone.")
    print(f"  snapshot -> {outdir / 'p3-federation.json'}\n")


if __name__ == "__main__":
    main()
