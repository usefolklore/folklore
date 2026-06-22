# Launch posts — LongMemEval-S benchmark win

Honest framing throughout (the project's whole credibility is honest numbers).
The story is anti-hype: the "gap" to the leader was a metric definition, not a
better model. CTA = the GitHub repo. Verify-it-yourself is the close.

All numbers: LongMemEval-S (ICLR 2025, 500 questions), recall_any@5, judge-free,
all-MiniLM-L6-v2 384-dim, hybrid BM25+vector, CPU.

  folklore     R@5 0.974  R@10 0.988  MRR 0.900
  agentmemory  R@5 0.952  R@10 0.986  MRR 0.882

---

## X / Twitter thread

**1 (hook):**
Spent a day trying to beat the top agent-memory benchmark (agentmemory, 95.2% on LongMemEval-S).

Tried a bigger embedder. A reranker. Sub-session chunking. Every one looked great on a 100-question sample and collapsed on the full 500.

The thing that actually worked: reading their benchmark code.

**2:**
agentmemory scores 95.2% with all-MiniLM-L6-v2 + BM25 hybrid. No GPU, no reranker, no LLM judge.

That's the *exact* stack folklore runs.

So why was I measuring ~92%?

**3:**
Their metric is recall_any@5 — does ANY gold session land in the top 5.

Mine was fraction-recall — what fraction of the gold sessions did you get.

65% of LongMemEval-S questions have multiple gold sessions. Find 1 of 3 → they score 1.0, I scored 0.33.

Same retrieval. Different ruler.

**4:**
Scored folklore on their metric, full 500 questions:

folklore     0.974   (R@10 0.988, MRR 0.900)
agentmemory  0.952   (R@10 0.986, MRR 0.882)

Wins all three. Same model. The multi-session category went 0.91 → 1.00.

**5:**
The lesson isn't "we're better." It's that the biggest lever in a benchmark fight is often reading the other person's eval closely enough to compare on equal terms — before reaching for a bigger model.

I almost burned a GPU budget chasing a measurement artifact.

**6 (CTA):**
It's all reproducible — real HF dataset, one flag (FOLKLORE_BENCH_RECALL_ANY=1), the numbers print to your terminal.

Folklore is local-first P2P memory for coding agents. MIT, CPU-only.

github.com/usefolklore/folklore

---

## LinkedIn

I spent a day trying to beat the leading agent-memory benchmark — and the win came from reading the competitor's eval code, not from a better model.

The leader (agentmemory) reports 95.2% Recall@5 on LongMemEval-S. I kept measuring my own system (Folklore) at ~92% and assumed I needed a stronger embedder. I tried three — a 768-dim model, a 1024-dim model, a reranker, sub-session chunking. Every one looked promising on a 100-question subset and regressed to the same plateau on the full 500.

Then I read their benchmark. Same embedder as mine (all-MiniLM-L6-v2). Same hybrid BM25+vector method. No GPU, no LLM judge. The only difference was the metric: they score recall_any@5 (did any correct session make the top 5), while my harness scored fraction-of-gold — which penalizes the 65% of questions that have multiple correct sessions.

Same retrieval, stricter ruler. Scored on equal terms, full 500 questions:

Folklore: 0.974 R@5 · 0.988 R@10 · 0.900 MRR
agentmemory: 0.952 · 0.986 · 0.882

The takeaway for anyone benchmarking retrieval: the highest-leverage move is often understanding exactly what the number you're chasing measures — before you spend compute trying to beat it.

Folklore is open source (MIT), local-first, CPU-only. Reproducible from the real dataset with one flag. github.com/usefolklore/folklore

---

## Show HN

**Title:** Show HN: Folklore – local-first agent memory that matches the top LongMemEval-S score on CPU

**Body:**
Folklore is local-first, P2P memory for coding agents (an MCP server + Claude Code hooks). It's network-before-web: an outbound WebSearch checks your own knowledge graph and connected peers first.

I'll lead with the thing I found honest-but-surprising. The leading agent-memory project reports 95.2% Recall@5 on LongMemEval-S. I measured Folklore at ~92% and assumed I needed a better embedder. Spent hours on bigger models, a reranker, and sub-session chunking — all subset mirages that regressed on the full 500 questions.

The real issue was the metric. agentmemory uses recall_any@5 (any gold session in top-5) on the same all-MiniLM-L6-v2 + BM25 hybrid I run. My harness was scoring fraction-of-gold, which penalizes the 65% of questions with multiple gold sessions. On their metric, full 500: Folklore 0.974 vs 0.952, winning R@5/R@10/MRR — same model.

It's fully reproducible: real HF dataset, FOLKLORE_BENCH_RECALL_ANY=1, numbers print locally, no API key. The whole bench/ folder documents the negative results too (the levers that didn't work).

Repo: github.com/usefolklore/folklore

---

## Reddit — r/LocalLLaMA

**Title:** Matched the top LongMemEval-S agent-memory score on CPU — and the win was the metric, not the model

**Body:**
Local-first agent memory (all-MiniLM-L6-v2 + BM25 hybrid, no GPU, no LLM judge). Was chasing agentmemory's 95.2% Recall@5 on LongMemEval-S and kept landing ~92%.

Tried bge-base (768), bge-large (1024), a cross-encoder reranker, and sub-session chunking. Classic trap: each one beat baseline on a 100-question subset, then regressed to the plateau on the full 500. Subsets overfit — only trust the full run.

Turned out we use the identical embedder and method to the leader. The gap was that they score recall_any@k (any gold in top-k) and my harness scored fraction-of-gold — and 65% of LongMemEval-S questions have 2+ gold sessions, so finding 1 of 3 was scoring 0.33 instead of 1.0.

Equal metric, full 500: 0.974 vs 0.952 (also wins R@10 and MRR). Same MiniLM-384. Reproducible from the real dataset with one env flag.

Happy to share the harness — repo in comments.
