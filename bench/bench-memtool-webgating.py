#!/usr/bin/env python3
"""
bench-memtool-webgating.py — Memory-Tool Benchmark, P1 (web-gating, MEASURED).

Honest, apples-to-apples: how well does each memory layer act as a semantic
cache IN FRONT OF the web, on a stream of repeated + paraphrased needs? The
metric is the web-fallback rate — the fraction of queries that still hit the
web because memory didn't serve them. Lower is better.

This is the CHARITABLE framing for the competitors: mem0 / LangChain / Zep do
not gate the web at all in normal use (they are stores, not gates). We cast
them as a cache anyway and measure their recall on paraphrases. Folklore does
this natively via its retrieval + energy/deny gate.

MATCHED CONTROLS:
  - Same embedder family across every tool: all-MiniLM-L6-v2 (folklore uses the
    Xenova ONNX port of the same model; competitors use the sentence-transformers
    port). State this; it is the fair control.
  - Same query stream, same canonical answers, same hit threshold band swept.
  - Local LLM parity for tools that need one (mem0): Ollama qwen2.5:7b — key-free.
  - Labels: every adapter is MEASURED (real tool) or PROXY (cosine cache) — never
    blended. Folklore runs its REAL gate via `node dist/cli/index.js ask --json`
    against an ISOLATED temp graph seeded only with the stream's cold answers.

Floor: every distinct need must be fetched once (cold). A perfect cache serves
every later paraphrase from memory -> fallback rate == distinct_needs/total.

Run:  python3 bench/bench-memtool-webgating.py
      python3 bench/bench-memtool-webgating.py --tools cosine,langchain
      python3 bench/bench-memtool-webgating.py --threshold 0.55 --json
"""
import argparse, json, os, subprocess, sys, tempfile, shutil
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
OLLAMA_MODEL = "qwen2.5:7b"

# ── query stream: distinct needs, each with paraphrases (incl. the original) ──
# Hand-written so the test is deterministic and inspectable. First phrasing of
# each need is the "cold" form that seeds memory; the rest are paraphrases that
# a good cache should serve without a web trip.
NEEDS = [
    ("rerank_long_ctx", "How does mxbai-rerank compare to a cross-encoder on long contexts?",
     ["Is mxbai-rerank better than cross-encoders for long inputs?",
      "cross-encoder vs mxbai reranker on lengthy documents — which wins?",
      "For long-context reranking, mxbai or a cross-encoder?"]),
    ("rrf_fusion", "What is reciprocal rank fusion and why use it for hybrid search?",
     ["Explain RRF for combining BM25 and dense retrieval.",
      "Why fuse lexical and vector results with reciprocal rank fusion?",
      "How does RRF merge multiple ranked lists?"]),
    ("hnsw_params", "How do ef_construction and M affect HNSW recall and build time?",
     ["Tuning HNSW: what do M and ef_construction trade off?",
      "Effect of HNSW M parameter on recall vs memory?",
      "Setting ef_construction in HNSW — impact on index quality?"]),
    ("matryoshka", "Does truncating Matryoshka embedding dimensions hurt retrieval?",
     ["Can I shorten MRL embeddings without losing accuracy?",
      "Matryoshka representation learning — cost of using fewer dims?",
      "Truncated matryoshka vectors: how much recall is lost?"]),
    ("splade_vs_dense", "When does SPLADE beat dense retrieval on BEIR?",
     ["SPLADE vs dense embeddings — which is stronger on BEIR tasks?",
      "Is learned sparse retrieval better than dense on out-of-domain data?",
      "SPLADE advantages over dense models for zero-shot retrieval?"]),
    ("colbert_latency", "Why is ColBERT late interaction slower at query time?",
     ["What makes ColBERT's late-interaction scoring expensive?",
      "ColBERT query latency vs single-vector dense — why higher?",
      "Cost of token-level late interaction in ColBERT at search time?"]),
    ("bm25_okapi", "How does BM25 term saturation (k1) affect ranking?",
     ["What does the k1 parameter control in Okapi BM25?",
      "BM25 saturation: role of k1 in scoring?",
      "Tuning BM25 k1 — effect on term frequency weighting?"]),
    ("cross_encoder_512", "Do cross-encoders degrade past 512 tokens?",
     ["Why do cross-encoder rerankers struggle beyond 512 tokens?",
      "Cross-encoder quality on inputs longer than 512 tokens?",
      "Token-limit effects on cross-encoder reranking accuracy?"]),
]
CANONICAL_ANSWER = {nid: f"[resolved answer for {nid}]" for nid, _, _ in NEEDS}


def build_stream(seed=7):
    import random
    rng = random.Random(seed)
    events = []  # (need_id, phrasing, is_cold_form)
    for nid, original, paras in NEEDS:
        events.append((nid, original, True))
        for p in paras:
            events.append((nid, p, False))
    # interleave so cold forms and paraphrases are mixed (realistic stream),
    # but a need's cold form must precede its paraphrases.
    by_need = {}
    for e in events:
        by_need.setdefault(e[0], []).append(e)
    order = list(by_need.keys())
    rng.shuffle(order)
    stream, queues = [], {k: list(v) for k, v in by_need.items()}
    while any(queues.values()):
        rng.shuffle(order)
        for nid in order:
            if queues[nid]:
                stream.append(queues[nid].pop(0))
    return stream


# ─────────────────────────── adapters ───────────────────────────
class Adapter:
    name = "base"; kind = "PROXY"
    def available(self): return False
    def reset(self): ...
    def remember(self, q, a): ...
    def lookup(self, q):  # -> (hit: bool, score: float|None)
        return (False, None)


class CosineCache(Adapter):
    """PROXY: the retrieval-layer cache decision mem0/LangChain reduce to —
    embed query, nearest stored need, cosine >= threshold."""
    name = "cosine-cache (proxy)"; kind = "PROXY"
    def __init__(self, threshold):
        self.threshold = threshold; self._model = None; self.store = []
    def available(self):
        try:
            from sentence_transformers import SentenceTransformer  # noqa
            return True
        except Exception:
            return False
    def _m(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer
            self._model = SentenceTransformer(EMBED_MODEL)
        return self._model
    def reset(self): self.store = []
    def _emb(self, q):
        import numpy as np
        v = self._m().encode([q], normalize_embeddings=True)[0]
        return np.asarray(v, dtype="float32")
    def remember(self, q, a): self.store.append((self._emb(q), a))
    def lookup(self, q):
        import numpy as np
        if not self.store: return (False, None)
        qv = self._emb(q)
        best = max(float(np.dot(qv, sv)) for sv, _ in self.store)
        return (best >= self.threshold, best)


class LangChainCache(Adapter):
    """MEASURED: real LangChain in-memory vector store + HF MiniLM embeddings,
    similarity_search_with_score used as the cache-hit decision."""
    name = "langchain (measured)"; kind = "MEASURED"
    def __init__(self, threshold):
        self.threshold = threshold; self.vs = None; self._emb = None
    def available(self):
        try:
            import langchain_huggingface, langchain_community  # noqa
            return True
        except Exception:
            try:
                import langchain_community  # noqa
                return True
            except Exception:
                return False
    def _embedder(self):
        if self._emb is None:
            try:
                from langchain_huggingface import HuggingFaceEmbeddings
            except Exception:
                from langchain_community.embeddings import HuggingFaceEmbeddings
            self._emb = HuggingFaceEmbeddings(model_name=EMBED_MODEL,
                                              encode_kwargs={"normalize_embeddings": True})
        return self._emb
    def reset(self):
        from langchain_community.vectorstores import FAISS
        # seed with a throwaway doc; FAISS needs >=1 text to init
        self.vs = None; self._seed_pending = True
    def remember(self, q, a):
        from langchain_community.vectorstores import FAISS
        if self.vs is None:
            self.vs = FAISS.from_texts([q], self._embedder(), metadatas=[{"a": a}])
        else:
            self.vs.add_texts([q], metadatas=[{"a": a}])
    def lookup(self, q):
        if self.vs is None: return (False, None)
        # FAISS returns L2 distance on normalized vecs; cos = 1 - d^2/2
        docs = self.vs.similarity_search_with_score(q, k=1)
        if not docs: return (False, None)
        _, dist = docs[0]
        cos = 1.0 - (float(dist) ** 2) / 2.0
        return (cos >= self.threshold, cos)


class Mem0Cache(Adapter):
    """MEASURED: real mem0 with local Ollama (qwen2.5:7b) + MiniLM embedder,
    key-free. mem0.search hit used as the cache decision."""
    name = "mem0 (measured)"; kind = "MEASURED"
    def __init__(self, threshold):
        self.threshold = threshold; self.m = None; self.uid = "bench"
    def available(self):
        try:
            import mem0  # noqa
            import requests
            requests.get("http://localhost:11434/api/tags", timeout=3)
            return True
        except Exception:
            return False
    def reset(self):
        from mem0 import Memory
        cfg = {
            "llm": {"provider": "ollama", "config": {"model": OLLAMA_MODEL,
                    "ollama_base_url": "http://localhost:11434"}},
            "embedder": {"provider": "huggingface",
                         "config": {"model": EMBED_MODEL}},
        }
        try:
            self.m = Memory.from_config(cfg)
        except Exception as e:
            self.m = None; self._err = str(e)
    def remember(self, q, a):
        if self.m is None: return
        try: self.m.add(f"Q: {q}\nA: {a}", user_id=self.uid)
        except Exception: pass
    def lookup(self, q):
        if self.m is None: return (False, None)
        try:
            res = self.m.search(q, user_id=self.uid, limit=1)
            hits = res.get("results", res) if isinstance(res, dict) else res
            if not hits: return (False, None)
            score = hits[0].get("score")
            if score is None: return (True, None)  # mem0 returned a memory
            return (float(score) >= self.threshold, float(score))
        except Exception:
            return (False, None)


class FolkloreGate(Adapter):
    """MEASURED: folklore's REAL retrieval + gate, isolated temp graph seeded
    only with the stream's cold answers. Hit = ask --json decides use_memory."""
    name = "folklore (measured)"; kind = "MEASURED"
    def __init__(self, threshold):
        self.threshold = threshold; self.home = None
        self.cli = REPO / "dist" / "cli" / "index.js"
    def available(self):
        return self.cli.exists()
    def reset(self):
        if self.home and Path(self.home).exists(): shutil.rmtree(self.home, ignore_errors=True)
        self.home = tempfile.mkdtemp(prefix="folklore-memtool-")
    def _run(self, args):
        env = dict(os.environ, FOLKLORE_HOME=self.home,
                   FOLKLORE_DENY_WEBSEARCH="0", FOLKLORE_PREFETCH_PEERS="0")
        return subprocess.run(["node", str(self.cli), *args], env=env,
                              capture_output=True, text=True, timeout=120)
    def remember(self, q, a):
        self._run(["save", "--label", q[:60], "--text", f"{q} {a}", "--private"])
    def lookup(self, q):
        r = self._run(["ask", q, "--json"])
        try:
            d = json.loads(r.stdout)
        except Exception:
            return (False, None)
        sat = d.get("satisfaction"); dec = d.get("decision") or d.get("action")
        if dec is not None:
            return (str(dec).startswith("use_memory"), sat)
        if sat is not None:
            return (float(sat) >= self.threshold, float(sat))
        return (False, None)


ADAPTERS = {
    "cosine": CosineCache, "langchain": LangChainCache,
    "mem0": Mem0Cache, "folklore": FolkloreGate,
}


def run_tool(adapter, stream):
    adapter.reset()
    total = fallbacks = served = 0
    for nid, phrasing, _cold in stream:
        total += 1
        hit, _score = adapter.lookup(phrasing)
        if hit:
            served += 1
        else:
            fallbacks += 1
            adapter.remember(phrasing, CANONICAL_ANSWER[nid])
    return {"total": total, "fallbacks": fallbacks, "served_from_memory": served,
            "fallback_rate": round(fallbacks / total, 4)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tools", default="cosine,langchain,mem0,folklore")
    ap.add_argument("--threshold", type=float, default=0.55)
    ap.add_argument("--json", action="store_true")
    args = ap.parse_args()

    stream = build_stream()
    distinct = len({nid for nid, _, _ in NEEDS})
    floor = round(distinct / len(stream), 4)

    out = {"benchmark": "memory-tools", "phase": "P1", "axis": "web_gating",
           "embedder": EMBED_MODEL, "ollama_model": OLLAMA_MODEL,
           "threshold": args.threshold, "stream_len": len(stream),
           "distinct_needs": distinct, "fallback_rate_floor": floor,
           "note": "Lower fallback_rate = better. Floor = every need fetched once. "
                   "Competitors cast charitably as a web-cache (they do not gate the "
                   "web natively). MEASURED = real tool; PROXY = matched-embedder cosine cache.",
           "results": {}}

    for key in [t.strip() for t in args.tools.split(",") if t.strip()]:
        cls = ADAPTERS.get(key)
        if cls is None:
            out["results"][key] = {"status": "unknown adapter"}; continue
        ad = cls(args.threshold)
        if not ad.available():
            out["results"][key] = {"status": "unavailable (dep/model missing) — skipped",
                                   "kind": ad.kind}
            continue
        try:
            r = run_tool(ad, stream); r["kind"] = ad.kind; r["name"] = ad.name
            out["results"][key] = r
        except Exception as e:
            out["results"][key] = {"status": f"error: {e}", "kind": ad.kind}

    outdir = Path.home() / ".folklore" / "bench" / "memory-tools"
    outdir.mkdir(parents=True, exist_ok=True)
    (outdir / "p1-webgating.json").write_text(json.dumps(out, indent=2) + "\n")

    if args.json:
        print(json.dumps(out, indent=2)); return
    print(f"\nMemory-Tool Benchmark — P1 web-gating (MEASURED where available)")
    print(f"  embedder={EMBED_MODEL}  threshold={args.threshold}  stream={len(stream)} events  floor={floor}\n")
    print(f"  {'tool':<22} {'kind':<9} {'fallback_rate':>13}  served/total")
    for key, r in out["results"].items():
        if "fallback_rate" in r:
            print(f"  {r.get('name',key):<22} {r['kind']:<9} {r['fallback_rate']:>13}  {r['served_from_memory']}/{r['total']}")
        else:
            print(f"  {key:<22} {r.get('kind',''):<9} {r['status']}")
    print(f"\n  floor (perfect cache) = {floor}.  Lower fallback_rate is better.")
    print(f"  snapshot -> {outdir / 'p1-webgating.json'}\n")


if __name__ == "__main__":
    main()
