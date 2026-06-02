# Akashik

**Federated knowledge commons for the open-source community.**

Akashik is a peer-to-peer knowledge graph protocol where every researcher, maintainer, and engineer adds their reading and reasoning, and where every newcomer can query what the community has already learned before re-treading the same path. Each contribution is Ed25519-signed, locally owned, and federated only on demand — so the network's working set grows by what its contributors are actually curious about, not by what a central planner decided to ingest.

---

## The community already learned this. Read the record.

Open source built the freest software stack in history because we shared *code* — CRAN, npm, PyPI, GitHub, arXiv. The infrastructure compounds. But the knowledge *between* the code (what we read, what we figured out together, what we debugged at 3am) has never had the same substrate. Each generation of contributors starts over. The same papers get re-explained in posts that 404 within a year. The same CUDA OOM gets diagnosed in parallel by fifty people next Tuesday.

**Akashik is what** that missing substrate looks like: a federated, cryptographically-attested record the community writes for itself. Not a personal-memory product. Not a team wiki. A shared protocol where contributor reading-hours compound into community progress, signed and attributed, forever.

**The differentiator is federation, not retrieval.** Single-user memory products already solve personal retrieval; Akashik is not trying to beat them on per-user R@5. The bet is that *cross-peer transfer* of researched-once knowledge is the missing primitive in the OSS knowledge stack, and that a demand-shaped P2P graph is the right way to build it.

The name borrows from the mythological **Akashic Records** — the perfect referent because it names what we're building: a shared, persistent, accessible record of what the collective has known. The "k" instead of "c" signals the engineering implementation, not the literal myth.

---

## How it works — the compounding loop

When you ask Akashik something, the system runs through five steps:

1. **Local first.** Query your own peer's graph. Hit? Return. Zero network cost.
2. **Federation on miss.** Someone in your network has probably already read the paper, debugged the error, or written the note you're asking about. Instead of paying token + time cost to re-research what already exists nearby, akashik asks your peers. Whatever they've curated flows back signed by them, with their sources attached — you inherit their work in milliseconds. The bigger your network, the less you ever pay to learn what someone else has already learned.
3. **Web on second miss.** If the federation can't answer with confidence, the harness performs `WebSearch` / `WebFetch` / arXiv pull on *your* machine — the only time the network reaches outward.
4. **Save locally, signed.** The result lands in your local graph, signed by you — your cryptographic identity and your verified GitHub handle, both attached. The source URLs you grounded on, the time you saved it, the project you saved it for — all there. You're now the keeper of that knowledge; anyone in your network who asks something similar later sees the answer came from you and can follow your sources.
5. **Transfer on next ask.** When another contributor asks something similar later, federation fan-out reaches your peer, your research transfers to them with original attribution, and they pay nothing for the hour you spent.

Stated formally, for any topic `T` and time `t`, let `R(T, t)` be the number of peers currently holding a cached answer for `T`. Under this mechanism `R(T, t)` is **monotonically non-decreasing** — it only grows. Once one peer in the network has done the research, the cost of the same question for every future asker collapses toward the federation round-trip cost.

Compounding is not a marketing claim; it is a property of the architecture. Each peer holds only what it has asked for or contributed — there is no global graph, no central server, and disk cost on every peer scales with that peer's own curiosity rather than with the community's total contribution volume.

Full architecture: [`docs/marketing/how-akashik-works.md`](docs/marketing/how-akashik-works.md).

---

## Empirical validation — AkashikBench-F

There's one benchmark capable of falsifying the federated-commons thesis: a federation-level simulator measuring `web_fallback_rate(t)` over a realistic peer network with offline churn. We built it. First run, on the LoCoMo factual subset:

| Parameter | Value |
|---|---|
| Corpus | LoCoMo factual subset — 695 queries |
| Peers | 10, strictly disjoint initial shards |
| Sim steps | 2000 |
| Offline churn | 20% |
| Query distribution | Zipfian (alpha = 1.0) |

Results:

| Metric | Value | Reading |
|---|---|---|
| `web_fallback_rate` (start) | 0.170 | 17% of queries hit the web at t=0 |
| `web_fallback_rate` (end) | 0.010 | 1% of queries hit the web by t=2000 |
| Compounding slope | -4.74e-5 | Negative → thesis validated for this corpus |
| Local resolution | 74.2% | Cache hit on own peer |
| Federation resolution | 21.3% | Pulled from another peer |
| Web fallback | 4.5% | Outbound only when federation couldn't answer |

**These are simulator numbers, not pilot numbers.** v1 abstracts away per-peer retrieval quality (those are measured separately by the LongMemEval / LoCoMo / BEIR benches in `tests/`) and treats "does peer N hold doc D" as boolean. v2 plugs real retrieval in. The real-pilot validation is the 100-peer ecosystem rollout queued for the next milestone.

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

Query the record:

```bash
akashik ask "how does mxbai-rerank compare to cross-encoder on long contexts?"
```

The query checks your local graph, then federates to every connected peer in your `peers.json`, then falls back to web research only if neither can answer. The web result lands in your local graph signed by you — the next contributor who asks something similar pulls it from your peer with full attribution.

**Federate. Compound. Continue.**

---

## Plugs into the harness you already use

You don't change how you work. Once akashik is installed and your daemon is running, every research-shaped tool call your harness wants to make — `WebSearch`, `WebFetch`, an arXiv pull, a Read against a path it's never read — is intercepted first. The harness asks akashik before it asks the web.

| Harness | How it wires in |
|---|---|
| **Claude Code** | `akashik claude install` — wires `PreToolUse` + `PostToolUse` + `SessionStart` hooks and adds a CLAUDE.md system-prompt section. One command. |
| **Codex / Gemini / Hermes / OpenClaw** | Register `akashik mcp start` as an MCP tool server. Once wired, the harness's own tool-routing layer prefers akashik for any query-shaped call. |
| **Anything else with a PreToolUse hook** | Same pattern as Claude Code — `akashik-smart-hook.cjs` is reusable; point your harness's `PreToolUse` config at it. |

After that, the web is the *fallback*, not the default. The local + federated graph is the first hop, every time, automatically. You don't have to remember to use akashik; akashik remembers for you.

---

## What "satisfactory" means

The harness only falls through to the web when the graph couldn't satisfy the query — and "satisfy" is concrete, not a vibes call. Three conditions, all enforced at the hook layer:

| Knob | Default | Meaning |
|---|---|---|
| `satisfaction_score` | ≥ **0.85** | After hybrid retrieval (BM25 + vec + RRF) + cross-encoder rerank + graph PPR rerank, the top result's satisfaction score must clear this floor. |
| `min_hits` | ≥ **2** | At least two graph hits in the answer set. A single brittle hit doesn't override the web check. |
| `decision` | = `use_memory` | The agent-decision layer (which weighs satisfaction, hit count, and shallow-evidence heuristics) must affirmatively land on "answer from memory" — not "answer-but-verify" or "search web". |

When all three hold, the hook **denies** the harness's `WebSearch` / `WebFetch` call and the graph hits get injected into the model's context as if the web call had returned them. When any one fails, the web call proceeds — and the result lands in your graph signed by you, so the next contributor who asks something similar pulls it from your peer instead of paying for the same fetch.

Per-project tunables:

```bash
export AKASHIK_DENY_WEBSEARCH=1        # opt in to the deny pathway (off by default)
export AKASHIK_DENY_THRESHOLD=0.85     # satisfaction floor
export AKASHIK_DENY_MIN_HITS=2         # minimum hits to allow the deny
export AKASHIK_PREFETCH_PEERS=0        # local-only — skip federated fan-out
```

Only `WebSearch` and `WebFetch` are deniable. Local tools (`Read`, `Glob`, `Grep`) are never blocked — they're cheap and there's nothing to gain from stopping them. The deny pathway is opt-in because false positives (graph says "I have it" when it doesn't) cost more than a redundant fetch; you turn it on per-project once you trust your graph's coverage of the domain.

---

## Architecture pillars

- **No central server. Ever.** Every peer talks directly to every other peer. There's no service to be acquired, deprecated, or rate-limited. If your VPS goes down, every other peer still answers. If the project ends, you still own your graph. There is no fallback to a vendor — only to other people running the same protocol.
- **Every answer carries a provenance chain you can audit.** Each record is signed by its curator's cryptographic identity AND their verified GitHub handle. You can trace any claim back to the person who curated it, the sources they grounded on, and the moment they did. No more anonymous Stack Overflow answers that may or may not be hallucinated — every contribution is attributable to a real, named human.
- **Runs on what you already have.** CPU-only embeddings, a single small open-source model, no GPU, no API keys, no proprietary dependencies. A $7/mo VPS, a laptop, or a Raspberry Pi runs a full peer. Reproducible from public sources.

---

## What's next

Active workstreams (planning doc: [`docs/PROJECT-PLAN-AKASHIK.md`](docs/PROJECT-PLAN-AKASHIK.md)):

- **AkashikBench-F v2** — replace the boolean "does peer N hold doc D" abstraction with real per-peer retrieval. Measure how the compounding curve bends under genuine retrieval-quality variance.
- **100-peer pilot in the local-AI / agent-tooling ecosystem** — seed contributors around `llama.cpp + ollama`, `vllm-project/vllm`, and `aider` with 50-80 canonical artifacts. Publish the real `web_fallback_rate` curve after 30 days of real traffic.
- **Read-only public peer endpoint.** A "Browse the record" entry point for newcomers — no install, no login, just see what the network has learned so far.
- **GDPR Article 17 tombstones.** Reconcile immutable provenance with the right to be forgotten via signed deletion records — the chain still verifies, the content is gone.
- **Rarity-aware replication.** Protect niche knowledge from evaporating when its sole holder goes offline; weight federation fan-out toward rare artifacts so they survive.

---

## Contributing

Akashik is pre-launch — the federation simulator validates the thesis, the retrieval stack benchmarks at parity with public single-user baselines, and the real pilot is the next milestone. We need:

- Contributors who run a peer in the local-AI / agent-tooling ecosystem during the pilot window.
- Researchers willing to seed canonical artifacts (papers, debug threads, PRs) into their local graphs.
- Engineers interested in libp2p, signed DIDs, or vector-search infrastructure.

Open an issue, fork the repo, or DM the maintainer. The project is in flux and the door is open.

## Status

Pre-launch. Simulator-validated, retrieval-benchmarked, pilot pending. Public protocol spec lands with the launch.

## License

MIT. Always open protocol. Your contributions, signed by you. No central server. Ever. Provenance preserved forever.
