#!/usr/bin/env python3
"""
bench-memtool-latency.py — Memory-Tool Benchmark, axis D (latency + cost).

Two cost axes the scope asks for, measured where possible, structural where not:

  D1 latency p50/p95 — retrieval-layer query latency, matched all-MiniLM-L6-v2:
       - cosine cache (proxy)      : MEASURED in-proc
       - LangChain FAISS (measured): MEASURED in-proc
       - folklore                  : MEASURED via `node dist/cli/index.js ask`
         BUT this end-to-end CLI number includes ~Node process boot; it is NOT
         folklore's retrieval-core latency. Folklore's production path is the
         MCP / daemon-IPC server (no per-call boot). The retrieval CORE is
         documented at 11 ms median (bench-index-health / BENCHMARKS-RESULTS).
         Reported separately and labeled — never compared boot-vs-in-proc as if
         equal.

  D2 write cost — the asymmetry that doesn't show up in latency:
       - folklore / LangChain / cosine: a write = a LOCAL embed (free, CPU ms).
       - mem0 / Letta: a write runs an LLM EXTRACTION per memory (tokens / $ or
         local-GPU seconds). Structural cost AGAINST them; quantified as calls,
         not faked dollars.

  D3 paid web/API trips saved — derived from the measured hit-rates (P1/P3):
       trips = misses. Higher hit-rate => fewer paid web trips. Reported from the
       cooperative-cache curve, not re-measured.

Run:  python3 bench/bench-memtool-latency.py
      python3 bench/bench-memtool-latency.py --json --n 24
"""
import argparse, json, os, statistics, subprocess, tempfile, time, shutil
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

QUERIES = [
    "For long-context reranking, is mxbai better than a cross-encoder?",
    "Why fuse lexical and vector results with reciprocal rank fusion?",
    "Tuning HNSW: what do M and ef_construction trade off?",
    "Can I shorten matryoshka embeddings without losing accuracy?",
    "Is learned sparse retrieval better than dense out-of-domain?",
    "What makes ColBERT late-interaction expensive at search time?",
    "What does the k1 parameter control in Okapi BM25?",
    "Why do cross-encoder rerankers struggle beyond 512 tokens?",
]
CORPUS = [
    "A cross-encoder degrades past its token limit; mxbai-rerank holds quality longer on long inputs.",
    "RRF merges ranked lists by summing 1/(k+rank); fuses BM25 and dense without score calibration.",
    "Higher M and ef_construction raise HNSW recall and quality at the cost of memory and build time.",
    "Truncating MRL dims degrades recall gradually; aggressive truncation fails tolerance gates.",
    "SPLADE (learned sparse) often beats dense out-of-domain via exact term match.",
    "ColBERT scores every query token against every doc token, so query-time cost is high.",
    "BM25 k1 controls term-frequency saturation: higher k1 keeps adding weight for repeats.",
    "Cross-encoders are trained at 512 tokens; quality drops on longer inputs unless long-context trained.",
]


def pctile(xs, p):
    if not xs: return None
    xs = sorted(xs); k = (len(xs) - 1) * p
    f = int(k); c = min(f + 1, len(xs) - 1)
    return round(xs[f] + (xs[c] - xs[f]) * (k - f), 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=24)
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()
    qs = (QUERIES * ((a.n // len(QUERIES)) + 1))[:a.n]

    try:
        from sentence_transformers import SentenceTransformer
        import numpy as np
    except Exception as e:
        print(json.dumps({"status": f"unavailable: {e}"})); return

    model = SentenceTransformer(EMBED_MODEL)
    corpus_emb = np.asarray(model.encode(CORPUS, normalize_embeddings=True), dtype="float32")
    model.encode(["warmup"], normalize_embeddings=True)  # warm

    lat = {}

    # cosine in-proc
    t = []
    for q in qs:
        s = time.perf_counter()
        qv = np.asarray(model.encode([q], normalize_embeddings=True)[0], dtype="float32")
        _ = max(float(np.dot(qv, cv)) for cv in corpus_emb)
        t.append((time.perf_counter() - s) * 1000)
    lat["cosine-cache (proxy)"] = {"kind": "MEASURED in-proc", "p50_ms": pctile(t, .5), "p95_ms": pctile(t, .95)}

    # langchain FAISS in-proc
    try:
        import faiss  # noqa
        from langchain_community.vectorstores import FAISS
        try: from langchain_huggingface import HuggingFaceEmbeddings
        except Exception: from langchain_community.embeddings import HuggingFaceEmbeddings
        emb = HuggingFaceEmbeddings(model_name=EMBED_MODEL, encode_kwargs={"normalize_embeddings": True})
        vs = FAISS.from_texts(CORPUS, emb)
        t = []
        for q in qs:
            s = time.perf_counter(); _ = vs.similarity_search_with_score(q, k=1); t.append((time.perf_counter() - s) * 1000)
        lat["langchain (measured)"] = {"kind": "MEASURED in-proc", "p50_ms": pctile(t, .5), "p95_ms": pctile(t, .95)}
    except Exception as e:
        lat["langchain (measured)"] = {"kind": "MEASURED", "status": f"unavailable: {repr(e)[:120]}"}

    # folklore via CLI (end-to-end, INCLUDES node boot — labeled)
    cli = REPO / "dist" / "cli" / "index.js"
    if cli.exists():
        home = tempfile.mkdtemp(prefix="folklore-lat-")
        env = dict(os.environ, FOLKLORE_HOME=home, FOLKLORE_DENY_WEBSEARCH="0", FOLKLORE_PREFETCH_PEERS="0")
        for i, c in enumerate(CORPUS):
            subprocess.run(["node", str(cli), "save", "--label", f"d{i}", "--text", c, "--private"],
                           env=env, capture_output=True, text=True, timeout=120)
        t = []
        for q in qs[:8]:  # CLI is slow; 8 calls enough for a p50
            s = time.perf_counter()
            subprocess.run(["node", str(cli), "ask", q, "--json"], env=env, capture_output=True, text=True, timeout=120)
            t.append((time.perf_counter() - s) * 1000)
        shutil.rmtree(home, ignore_errors=True)
        lat["folklore (CLI end-to-end)"] = {
            "kind": "MEASURED — INCLUDES ~Node boot; NOT the production path",
            "p50_ms": pctile(t, .5), "p95_ms": pctile(t, .95),
            "note": "production path is MCP/daemon-IPC (no per-call boot); retrieval CORE documented 11ms median.",
        }
    else:
        lat["folklore (CLI end-to-end)"] = {"status": "dist not built"}

    out = {
        "benchmark": "memory-tools", "phase": "P-D", "axis": "latency_and_cost",
        "embedder": EMBED_MODEL, "queries": a.n,
        "D1_latency": lat,
        "D1_note": "In-proc cosine/LangChain vs folklore-CLI is NOT apples-to-apples — the CLI "
                   "pays Node process boot; folklore's production path is MCP/IPC and its retrieval "
                   "core is 11ms median (measured, BENCHMARKS-RESULTS). Compare cores, not transports.",
        "D2_write_cost": {
            "folklore": "local embed per write — free, CPU ms, no LLM, no key",
            "langchain_rag": "local embed per write — free (no LLM unless answer-gen)",
            "cosine_proxy": "local embed per write — free",
            "mem0": "LLM EXTRACTION per write (tokens/$ or local-GPU seconds) — structural cost",
            "letta": "LLM per memory edit — structural cost",
            "finding": "folklore/RAG writes are free; mem0/Letta pay an LLM per write. A cost axis "
                       "that never appears in retrieval latency but dominates ingest cost at scale.",
        },
        "D3_paid_trips_saved": {
            "source": "derived from measured hit-rates (P1 single-user, P3 federated)",
            "single_user_cache (cosine/langchain/folklore)": "fallback ~0.47 @FA<=0.05 -> ~53% of repeat/paraphrase trips saved",
            "folklore_federated_64peers": "hit 0.97 -> ~97% of trips saved vs web-every-time; silo tools flat ~0.31",
            "note": "trips saved = 1 - fallback_rate; federation is where folklore's cost win compounds.",
        },
    }
    outdir = Path.home() / ".folklore" / "bench" / "memory-tools"; outdir.mkdir(parents=True, exist_ok=True)
    (outdir / "pD-latency-cost.json").write_text(json.dumps(out, indent=2) + "\n")

    if a.json: print(json.dumps(out, indent=2)); return
    print("\nMemory-Tool Benchmark — axis D (latency + cost)\n")
    print("  D1 retrieval latency (matched MiniLM):")
    for k, v in lat.items():
        if "p50_ms" in v and v.get("p50_ms") is not None:
            print(f"     {k:<30} p50 {v['p50_ms']:>8} ms   p95 {v['p95_ms']:>8} ms   [{v['kind']}]")
        else:
            print(f"     {k:<30} {v.get('status','-')}")
    print("     NOTE: folklore-CLI includes Node boot; production = MCP/IPC; retrieval core = 11ms (measured).")
    print("\n  D2 write cost: folklore/RAG = free local embed; mem0/Letta = an LLM extraction PER WRITE (structural cost).")
    print("  D3 trips saved: single-user cache ~53% (repeats); folklore federated @64 peers ~97% vs silo flat ~31%.")
    print(f"\n  snapshot -> {outdir / 'pD-latency-cost.json'}\n")


if __name__ == "__main__":
    main()
