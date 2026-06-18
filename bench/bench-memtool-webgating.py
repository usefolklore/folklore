#!/usr/bin/env python3
"""
bench-memtool-webgating.py — Memory-Tool Benchmark, P1 (web-gating, MEASURED).

Honest, apples-to-apples: each memory layer cast (charitably) as a semantic
cache IN FRONT OF the web, on a stream of repeated + paraphrased needs.

THE FAIR METRIC (v2): fallback-rate ALONE is rigged — a reckless cache with a
low threshold serves more queries (incl. the WRONG memory) and looks "better".
So we sweep the hit threshold and track TWO rates per tool:
  - fallback_rate   = queries not served from memory  (lower = better coverage)
  - false_accept    = served the WRONG need's memory   (lower = better fidelity)
and report each tool's fallback-rate AT A MATCHED false-accept budget. This is
the `bench-vcache-compare` "matched error" methodology applied across tools.

MATCHED CONTROLS:
  - Same embedder family everywhere: all-MiniLM-L6-v2 (folklore = Xenova ONNX
    port of the same model; competitors = sentence-transformers port).
  - Same stream, same canonical answers, same swept threshold band.
  - Local-LLM parity for tools that need one (mem0): Ollama qwen2.5:7b, key-free.
  - Labels: MEASURED (real tool) vs PROXY (cosine cache). Folklore runs its REAL
    retrieval via `node dist/cli/index.js ask --json` against an ISOLATED temp
    graph seeded only with the stream's cold answers; its swept score = the
    pipeline `satisfaction`, matched need = the top hit's tagged need_id.

Floor: every distinct need must be fetched once -> min fallback = distinct/total.

Run:  python3 bench/bench-memtool-webgating.py
      python3 bench/bench-memtool-webgating.py --tools cosine,langchain,folklore
      python3 bench/bench-memtool-webgating.py --json
"""
import argparse, json, os, subprocess, tempfile, shutil
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
EMBED_MODEL = "sentence-transformers/all-MiniLM-L6-v2"
OLLAMA_MODEL = "qwen2.5:7b"
SWEEP = [round(0.30 + 0.025 * i, 3) for i in range(0, 23)]  # 0.30 .. 0.85
FA_BUDGETS = [0.0, 0.02, 0.05]  # report fallback at these false-accept ceilings

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
CANON = {nid: f"[resolved answer for {nid}]" for nid, _, _ in NEEDS}


def build_stream(seed=7):
    import random
    rng = random.Random(seed)
    by_need = {}
    for nid, original, paras in NEEDS:
        by_need[nid] = [(nid, original)] + [(nid, p) for p in paras]
    order = list(by_need.keys()); rng.shuffle(order)
    queues = {k: list(v) for k, v in by_need.items()}
    stream = []
    while any(queues.values()):
        rng.shuffle(order)
        for nid in order:
            if queues[nid]:
                stream.append(queues[nid].pop(0))
    return stream


# ── adapters: lookup -> (matched_need_id|None, score 0..1|None) WITHOUT thresholding
class Adapter:
    name = "base"; kind = "PROXY"
    def available(self): return False
    def reset(self): ...
    def remember(self, q, nid): ...
    def lookup(self, q): return (None, None)


class CosineCache(Adapter):
    name = "cosine-cache (proxy)"; kind = "PROXY"
    def __init__(self): self._m=None; self.store=[]
    def available(self):
        try:
            import sentence_transformers  # noqa
            return True
        except Exception: return False
    def _model(self):
        if self._m is None:
            from sentence_transformers import SentenceTransformer
            self._m = SentenceTransformer(EMBED_MODEL)
        return self._m
    def reset(self): self.store=[]
    def _emb(self, q):
        import numpy as np
        return np.asarray(self._model().encode([q], normalize_embeddings=True)[0], dtype="float32")
    def remember(self, q, nid): self.store.append((self._emb(q), nid))
    def lookup(self, q):
        import numpy as np
        if not self.store: return (None, None)
        qv=self._emb(q); best=-1.0; bnid=None
        for sv,nid in self.store:
            s=float(np.dot(qv,sv))
            if s>best: best,bnid=s,nid
        return (bnid, best)


class LangChainCache(Adapter):
    name = "langchain (measured)"; kind = "MEASURED"
    def __init__(self): self.vs=None; self._emb=None
    def available(self):
        try:
            import faiss, langchain_community  # noqa
            return True
        except Exception: return False
    def _embedder(self):
        if self._emb is None:
            try: from langchain_huggingface import HuggingFaceEmbeddings
            except Exception: from langchain_community.embeddings import HuggingFaceEmbeddings
            self._emb=HuggingFaceEmbeddings(model_name=EMBED_MODEL, encode_kwargs={"normalize_embeddings":True})
        return self._emb
    def reset(self): self.vs=None
    def remember(self, q, nid):
        from langchain_community.vectorstores import FAISS
        if self.vs is None: self.vs=FAISS.from_texts([q], self._embedder(), metadatas=[{"nid":nid}])
        else: self.vs.add_texts([q], metadatas=[{"nid":nid}])
    def lookup(self, q):
        if self.vs is None: return (None,None)
        docs=self.vs.similarity_search_with_score(q,k=1)
        if not docs: return (None,None)
        d,dist=docs[0]
        cos=1.0-(float(dist)**2)/2.0
        return (d.metadata.get("nid"), cos)


class Mem0Cache(Adapter):
    name = "mem0 (measured)"; kind = "MEASURED"
    def __init__(self): self.m=None; self.uid="bench"
    def available(self):
        try:
            import mem0, requests  # noqa
            requests.get("http://localhost:11434/api/tags", timeout=3); return True
        except Exception: return False
    def reset(self):
        from mem0 import Memory
        cfg={"llm":{"provider":"ollama","config":{"model":OLLAMA_MODEL,"ollama_base_url":"http://localhost:11434"}},
             "embedder":{"provider":"huggingface","config":{"model":EMBED_MODEL}}}
        try: self.m=Memory.from_config(cfg)
        except Exception: self.m=None
    def remember(self, q, nid):
        if self.m is None: return
        try: self.m.add(f"[nid:{nid}] Q: {q}\nA: {CANON[nid]}", user_id=self.uid)
        except Exception: pass
    def lookup(self, q):
        if self.m is None: return (None,None)
        try:
            res=self.m.search(q,user_id=self.uid,limit=1)
            hits=res.get("results",res) if isinstance(res,dict) else res
            if not hits: return (None,None)
            mem=hits[0].get("memory","") or ""
            score=hits[0].get("score")
            nid=None
            if "[nid:" in mem: nid=mem.split("[nid:",1)[1].split("]",1)[0]
            return (nid, float(score) if score is not None else 1.0)
        except Exception: return (None,None)


class FolkloreGate(Adapter):
    name = "folklore (measured)"; kind = "MEASURED"
    def __init__(self): self.home=None; self.cli=REPO/"dist"/"cli"/"index.js"
    def available(self): return self.cli.exists()
    def reset(self):
        if self.home and Path(self.home).exists(): shutil.rmtree(self.home,ignore_errors=True)
        self.home=tempfile.mkdtemp(prefix="folklore-memtool-")
    def _run(self,args):
        env=dict(os.environ,FOLKLORE_HOME=self.home,FOLKLORE_DENY_WEBSEARCH="0",FOLKLORE_PREFETCH_PEERS="0")
        return subprocess.run(["node",str(self.cli),*args],env=env,capture_output=True,text=True,timeout=120)
    def remember(self,q,nid):
        self._run(["save","--label",f"nid:{nid}","--text",f"{q} {CANON[nid]}","--private"])
    def lookup(self,q):
        r=self._run(["ask",q,"--json"])
        try: d=json.loads(r.stdout)
        except Exception: return (None,None)
        sat=d.get("satisfaction")
        nid=None
        hits=d.get("hits") or d.get("results") or d.get("matches") or []
        if hits and isinstance(hits,list):
            top=hits[0]
            lbl=(top.get("label") or top.get("title") or top.get("id") or "") if isinstance(top,dict) else str(top)
            if "nid:" in lbl: nid=lbl.split("nid:",1)[1].split()[0].strip().strip('"')
        return (nid, float(sat) if sat is not None else None)


ADAPTERS={"cosine":CosineCache,"langchain":LangChainCache,"mem0":Mem0Cache,"folklore":FolkloreGate}


def sweep_tool(adapter, stream):
    """One streaming pass collecting (true_nid, matched_nid, score) per event;
    then evaluate every threshold offline (memory grows identically regardless
    of threshold because we always remember on a content-novel need)."""
    adapter.reset()
    trace=[]  # (true_nid, matched_nid, score, is_first_sight)
    seen=set()
    for true_nid, phrasing in stream:
        first = true_nid not in seen
        m_nid, score = adapter.lookup(phrasing)
        trace.append((true_nid, m_nid, score, first))
        # seed memory on first sight of a need (the cold web fetch), so later
        # paraphrases can be served. Always remember first-sight; this is
        # threshold-independent and identical across the sweep.
        if first:
            adapter.remember(phrasing, true_nid); seen.add(true_nid)
    n=len(trace)
    curve=[]
    for tau in SWEEP:
        fb=fa=corr=0
        for true_nid, m_nid, score, first in trace:
            hit = (score is not None) and (m_nid is not None) and (score>=tau)
            if first:
                # cold: even if a (spurious) hit clears tau, real systems fetch
                # because nothing was stored yet -> count as fallback, and if it
                # "hit" something it's a false-accept signal.
                if hit and m_nid!=true_nid: fa+=1
                fb+=1
                continue
            if not hit: fb+=1
            elif m_nid==true_nid: corr+=1
            else: fa+=1; fb+=1  # wrong memory served = still a real miss
        curve.append({"tau":tau,"fallback_rate":round(fb/n,4),
                      "false_accept_rate":round(fa/n,4),"correct_serve_rate":round(corr/n,4)})
    return {"n":n,"curve":curve}


def at_budgets(curve):
    out={}
    for b in FA_BUDGETS:
        ok=[p for p in curve if p["false_accept_rate"]<=b]
        best=min(ok,key=lambda p:p["fallback_rate"]) if ok else None
        out[str(b)]= ({"tau":best["tau"],"fallback_rate":best["fallback_rate"],
                       "false_accept_rate":best["false_accept_rate"]} if best else None)
    return out


def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--tools",default="cosine,langchain,mem0,folklore")
    ap.add_argument("--json",action="store_true")
    a=ap.parse_args()
    stream=build_stream(); distinct=len(NEEDS); floor=round(distinct/len(stream),4)
    out={"benchmark":"memory-tools","phase":"P1","axis":"web_gating",
         "metric":"fallback-rate at matched false-accept (swept threshold)",
         "embedder":EMBED_MODEL,"ollama_model":OLLAMA_MODEL,"stream_len":len(stream),
         "distinct_needs":distinct,"fallback_rate_floor":floor,"fa_budgets":FA_BUDGETS,
         "note":"Lower fallback at a matched (low) false-accept budget = better. "
                "Raw fallback alone is rigged (reckless caching wins it). MEASURED=real tool, PROXY=cosine cache. "
                "This axis is single-user web-gating; folklore's structural edge (federation, provenance) is P2/P3.",
         "results":{}}
    for key in [t.strip() for t in a.tools.split(",") if t.strip()]:
        cls=ADAPTERS.get(key)
        if not cls: out["results"][key]={"status":"unknown adapter"}; continue
        ad=cls()
        if not ad.available(): out["results"][key]={"status":"unavailable — skipped","kind":ad.kind}; continue
        try:
            sw=sweep_tool(ad,stream)
            out["results"][key]={"kind":ad.kind,"name":ad.name,"n":sw["n"],
                                 "at_false_accept_budget":at_budgets(sw["curve"]),"curve":sw["curve"]}
        except Exception as e:
            out["results"][key]={"status":f"error: {e}","kind":ad.kind}
    outdir=Path.home()/".folklore"/"bench"/"memory-tools"; outdir.mkdir(parents=True,exist_ok=True)
    (outdir/"p1-webgating.json").write_text(json.dumps(out,indent=2)+"\n")
    if a.json: print(json.dumps(out,indent=2)); return
    print(f"\nMemory-Tool Benchmark — P1 web-gating (fallback @ matched false-accept)")
    print(f"  embedder={EMBED_MODEL}  stream={len(stream)}  floor={floor}\n")
    print(f"  {'tool':<22} {'kind':<9} " + "  ".join(f"FA<={b}:fb" for b in FA_BUDGETS))
    for key,r in out["results"].items():
        if "at_false_accept_budget" in r:
            cells=[]
            for b in FA_BUDGETS:
                pt=r["at_false_accept_budget"][str(b)]
                cells.append(f"{pt['fallback_rate']}@{pt['tau']}" if pt else "n/a")
            print(f"  {r['name']:<22} {r['kind']:<9} " + "  ".join(f"{c:>11}" for c in cells))
        else:
            print(f"  {key:<22} {r.get('kind',''):<9} {r['status']}")
    print(f"\n  cells = best fallback_rate @ the tau that holds false-accept <= budget. floor={floor}.")
    print(f"  snapshot -> {outdir/'p1-webgating.json'}\n")


if __name__=="__main__":
    main()
