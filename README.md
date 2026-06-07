# Akashik

**We compound on inference.**

A cooperative knowledge protocol. Each peer keeps only its own graph (what it has read, debugged, fetched, signed) and queries the graphs of every other peer. Someone already paid to figure it out. Why pay again?

> Web-search fallback rate, in simulator: **17% → 1%** over 2,000 steps. Once any peer in the network has done the work, no peer pays for it again. [§ Proof](#proof)

---

## How it compounds

We compound on inference. Each peer supplies the network with reasoning it has already done, so the next peer infers from there, not from zero. Knowledge builds on knowledge. The network reasons deeper than any node alone, and nobody starts from square one.

It is not only Google you pay. It is OpenAI, Anthropic, governments, giant centralised corporations, billed per token for inference run on the same data a thousand times over, every day. Someone already read the paper, debugged the bug, grounded the claim. The tokens were paid. The work was done. Ask them.

Knowledge that used to take minutes now arrives in milliseconds. Off the grid. On the commons.

---

## The commons

There is no central knowledge bank. Each peer maintains a graph over its own code, research, and sessions on its own machine. Federation makes every local graph queryable by the network. The union of every peer's graph is the commons.

- **Sessions become the commons' context.** Every web fetch and debug transcript is indexed locally, signed, and federated.
- **Code paths become queryable by peers.** Files you explored, questions you asked: the network knows the hard parts.
- **Research becomes attributable.** URI, timestamp, signature. Once any peer reads it, the network never pays the web for it again.

---

## The math

For any topic `T` and time `t`, let `R(T, t)` be the number of peers holding a cached answer for `T`. Under akashik's mechanism `R(T, t)` is **monotonically non-decreasing**. Once any peer resolves `T`, the network's cost for `T` caps out. Compounding is a property of the architecture, not a marketing claim. Each peer holds only what it has asked for or contributed: no global graph, no central server, and disk cost on every peer scales with that peer's own curiosity rather than the community's total volume.

Three returns, after peer one:

- **Faster.** A federation hit returns in ~140 ms. A paid web fetch is 1 to 2 seconds.
- **More complete.** The peer returns the trace, the sources, the dead-ends. Reasoning to build on, not re-derive.
- **Way cheaper.** Web-fallback drops 17% → 1% over 2,000 simulator steps. Over 90% of paid fetches vanish.

---

## Proof

Three claims, each falsifiable, each on disk.

**Faster.** Federation-hit P50 around 140 ms, against 1 to 2 seconds for a paid endpoint. Roughly an order of magnitude, every time after the first.

**More complete.** 0.7522 NDCG@10 on the full BEIR SciFact benchmark, CPU-only, 11 ms median. Compared to Pinecone-baseline 0.5840, mem0 0.4410, Letta 0.3150, LangChain-RAG 0.2680. No LLM judging an LLM.

**Way cheaper.** AkashikBench-F is a federation-level simulator measuring `web_fallback_rate(t)` over a realistic peer network with offline churn. First run, on the LoCoMo factual subset:

| Parameter | Value |
|---|---|
| Corpus | LoCoMo factual subset, 695 queries |
| Peers | 10, strictly disjoint initial shards |
| Sim steps | 2,000 |
| Offline churn | 20% |
| Query distribution | Zipfian (alpha = 1.0) |

| Metric | Value | Reading |
|---|---|---|
| `web_fallback_rate` (start) | 0.170 | 17% of queries hit the web at t=0 |
| `web_fallback_rate` (end) | 0.010 | 1% of queries hit the web by t=2,000 |
| Compounding slope | -4.74e-5 | Negative, thesis holds for this corpus |
| Web fallback (final) | 4.5% | Outbound only when the network could not answer |

**These are simulator numbers, not pilot numbers.** v1 treats "does peer N hold doc D" as boolean and abstracts away per-peer retrieval quality (measured separately by the LongMemEval / LoCoMo / BEIR benches in `tests/`). v2 plugs real retrieval in. Real-pilot validation is the 100-peer ecosystem rollout queued next.

Bench source: [`tests/bench-akashik-federation.test.ts`](tests/bench-akashik-federation.test.ts).

---

## Quickstart

Install:

```bash
npm install -g akashik
```

Run your first peer:

```bash
akashik init
akashik daemon start
```

Save what teaches you:

```bash
akashik save https://arxiv.org/abs/2406.16678
akashik save ./notes/cuda-oom-debug.md --private
akashik save ./notes/launch-plan.md --workspace launch-2026
```

Query the network:

```bash
akashik ask "how does mxbai-rerank compare to cross-encoder on long contexts?"
```

**Federate. Compound. Continue.**

---

## Plugs into the harness you already use

You do not change how you work. Once akashik is installed and your daemon is running, every research-shaped tool call your harness wants to make (`WebSearch`, `WebFetch`, an arXiv pull, a Read against a path it has never read) is intercepted first. The harness asks akashik before it asks the web.

| Harness | How it wires in |
|---|---|
| **Claude Code** | `akashik claude install` wires `PreToolUse` + `PostToolUse` + `SessionStart` hooks and adds a CLAUDE.md system-prompt section. One command. |
| **Codex / Gemini / Hermes / OpenClaw** | Register `akashik mcp start` as an MCP tool server. The harness's own tool-routing layer then prefers akashik for any query-shaped call. |
| **Anything else with a PreToolUse hook** | Same pattern as Claude Code. `akashik-smart-hook.cjs` is reusable; point your harness's `PreToolUse` config at it. |

After that, the web is the *fallback*, not the default. The local plus federated graph is the first hop, every time, automatically. You do not have to remember to use akashik; akashik remembers for you.

---

## What "satisfactory" means

The harness only falls through to the web when the graph could not satisfy the query, and "satisfy" is concrete, not a vibes call. Three conditions, all enforced at the hook layer:

| Knob | Default | Meaning |
|---|---|---|
| `satisfaction_score` | >= **0.85** | After hybrid retrieval (BM25 + vec + RRF), cross-encoder rerank, and graph PPR rerank, the top result's satisfaction score must clear this floor. |
| `min_hits` | >= **2** | At least two graph hits in the answer set. A single brittle hit does not override the web check. |
| `decision` | = `use_memory` | The agent-decision layer (which weighs satisfaction, hit count, and shallow-evidence heuristics) must affirmatively land on "answer from memory", not "answer-but-verify" or "search web". |

When all three hold, the hook **denies** the harness's `WebSearch` / `WebFetch` call and the graph hits get injected into the model's context as if the web call had returned them. When any one fails, the web call proceeds, and the result lands in your graph signed by you, so the next contributor who asks something similar pulls it from your peer instead of paying for the same fetch.

Per-project tunables:

```bash
export AKASHIK_DENY_WEBSEARCH=1        # opt in to the deny pathway (off by default)
export AKASHIK_DENY_THRESHOLD=0.85     # satisfaction floor
export AKASHIK_DENY_MIN_HITS=2         # minimum hits to allow the deny
export AKASHIK_PREFETCH_PEERS=0        # local-only, skip federated fan-out
```

Only `WebSearch` and `WebFetch` are deniable. Local tools (`Read`, `Glob`, `Grep`) are never blocked: they are cheap and there is nothing to gain from stopping them. The deny pathway is opt-in because false positives (graph says "I have it" when it does not) cost more than a redundant fetch; you turn it on per-project once you trust your graph's coverage of the domain.

---

## Architecture pillars

- **No central server. Ever.** Every peer talks directly to every other peer. There is no service to be acquired, deprecated, or rate-limited. If your VPS goes down, every other peer still answers. If the project ends, you still own your graph. The fallback is not a vendor; it is other people running the same protocol.
- **Every answer carries a provenance chain you can audit.** Each record is signed by its curator's cryptographic identity and their verified GitHub handle. You can trace any claim back to the person who curated it, the sources they grounded on, and the moment they did. No anonymous Stack Overflow answers that may or may not be hallucinated: every contribution is attributable to a real, named human.
- **Runs on what you already have.** CPU-only embeddings, a single small open-source model, no GPU, no API keys, no proprietary dependencies. A $7/mo VPS, a laptop, or a Raspberry Pi runs a full peer. Reproducible from public sources.

---

## What's next

Active workstreams (planning doc: [`docs/PROJECT-PLAN-AKASHIK.md`](docs/PROJECT-PLAN-AKASHIK.md)):

- **AkashikBench-F v2.** Replace the boolean "does peer N hold doc D" abstraction with real per-peer retrieval. Measure how the compounding curve bends under genuine retrieval-quality variance.
- **100-peer pilot in the local-AI / agent-tooling ecosystem.** Seed contributors around `llama.cpp + ollama`, `vllm-project/vllm`, and `aider` with 50 to 80 canonical artifacts. Publish the real `web_fallback_rate` curve after 30 days of real traffic.
- **Provenance-attested retrieval against adversarial context.** Measure whether the signature chain on every record lets an LLM detect and refuse hallucinated or poisoned retrieval, a defense anonymous RAG cannot offer.
- **Read-only public peer endpoint.** A "browse the network" entry point for newcomers: no install, no login, just see what the network has learned so far.
- **Rarity-aware replication.** Protect niche knowledge from evaporating when its sole holder goes offline; weight federation fan-out toward rare artifacts so they survive.

---

## Contributing

Akashik is pre-launch. The federation simulator validates the thesis, the retrieval stack benchmarks at parity with public single-user baselines, and the real pilot is the next milestone. We need:

- Contributors who run a peer in the local-AI / agent-tooling ecosystem during the pilot window.
- Researchers willing to seed canonical artifacts (papers, debug threads, PRs) into their local graphs.
- Engineers interested in libp2p, signed DIDs, or vector-search infrastructure.

Open an issue, fork the repo, or DM the maintainer. The project is in flux and the door is open.

## Status

Pre-launch. Simulator-validated, retrieval-benchmarked, pilot pending. Public protocol spec lands with the launch.

## The name

Akashik borrows from the Akashic Record, the ledger of all that has ever been known. The "k" instead of "c" signals the engineering implementation, not the myth.

## License

MIT. Always an open protocol. Your contributions, signed by you. No central server. Ever.
