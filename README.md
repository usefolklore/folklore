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
2. **Federation on miss.** Fan out to the peers you share rooms with. Each answers with whatever they've already saved or researched. Results merge via reciprocal-rank fusion.
3. **Web on second miss.** If the federation can't answer with confidence, the harness performs `WebSearch` / `WebFetch` / arXiv pull on *your* machine — the only time the network reaches outward.
4. **Save locally, signed.** The result lands in your local graph, attested by your DID (Ed25519). You are now the "ambitioned" curator of that knowledge: provenance, room, timestamp, source URLs all attached.
5. **Transfer on next ask.** When another contributor asks something similar later, federation fan-out reaches your peer, your research transfers to them with original attribution, and they pay nothing for the hour you spent.

Stated formally, for any topic `T` and time `t`:

- `R(T, t)` = number of peers currently holding a cached answer for `T`
- `R(T, t)` is **monotonically non-decreasing** under the mechanism — it only grows
- `expected_time_to_answer(T) ~ 1 / R(T, t)`

Compounding is not a marketing claim; it is a property of the architecture. Each peer holds only what it has asked for or contributed — there is no global graph, no central server, and disk cost on every peer scales with that peer's own curiosity rather than with the community's total contribution volume.

Full architecture: [`docs/marketing/how-akashik-works.md`](docs/marketing/how-akashik-works.md).

---

## Empirical validation — AkashikBench-F

The Round 5 octopus-discover synthesis identified one benchmark capable of falsifying the federated-commons thesis: a federation-level simulator measuring `web_fallback_rate(t)` over a realistic peer network with offline churn. We built it. First run, on the LoCoMo factual subset:

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

**These are simulator numbers, not pilot numbers.** v1 abstracts away per-peer retrieval quality (those are measured separately by the LongMemEval / LoCoMo / BEIR benches in `tests/`) and treats "does peer N hold doc D" as boolean. v2 plugs real retrieval in. The real-pilot validation lives in the 30-day local-AI / agent-tooling ecosystem launch plan — see [`docs/research/octopus-discover/round-5-2026-05-26/`](docs/research/octopus-discover/round-5-2026-05-26/) for the full synthesis.

Bench source: [`tests/bench-akashik-federation.test.ts`](tests/bench-akashik-federation.test.ts).

---

## Quickstart

> The npm package and CLI binary are still named `wellinformed` during the two-name period. The brand-marketing name is **Akashik**; a coordinated rename of package + repo + DNS is queued behind the public launch. Examples below show both forms.

Install:

```bash
npm install -g wellinformed
# (will become: npm install -g akashik)
```

Run your first peer:

```bash
wellinformed init
wellinformed daemon start
```

Save what teaches you:

```bash
wellinformed save https://arxiv.org/abs/2406.16678 --room research
wellinformed save ./notes/cuda-oom-debug.md --room toolshed
```

Query the record:

```bash
wellinformed ask "how does mxbai-rerank compare to cross-encoder on long contexts?"
```

The query checks your local graph, then federates to peers you share rooms with, then falls back to web research only if neither can answer. The web result lands in your local graph signed by you — the next contributor who asks something similar pulls it from your peer with full attribution.

**Federate. Compound. Continue.**

---

## Architecture pillars

- **P2P federation over libp2p.** No central server, no vendor data lock-in. Each peer advertises the rooms it participates in; queries fan out via gossip with bounded timeouts. Lineage per the Round 5 synthesis: *Freenet-style demand-shaped lazy replication with cache-fill on miss*, applied to attributed semantic memory.
- **Ed25519-signed contributions with DIDs.** Every record carries the curator's decentralized identifier, room, source URLs, and timestamp. Trust is graph-traversable: follow the chain, see who curated, when, and why. Lineage: AT Protocol's signed-attribution layer applied to research memory rather than social posts.
- **Commodity hardware.** Xenova ONNX embeddings (384-dim, all-MiniLM-L6-v2), sqlite-vec for vector search, sql.js for cross-platform persistence. A $7/mo VPS, a laptop, or a Raspberry Pi runs a full peer. Reproducible from public sources.

The full synthesis frames Akashik as compositionally novel with prior-art math: *"Freenet-style demand-shaped replication applied to attributed semantic research memory, with AT Protocol-style DID signatures."*

---

## What's next

Active workstreams (planning doc forthcoming at [`docs/PROJECT-PLAN-AKASHIK.md`](docs/PROJECT-PLAN-AKASHIK.md)):

- **AkashikBench-F v2** — real per-peer retrieval (not boolean), measure compounding under genuine retrieval-quality variance.
- **100-peer pilot in the local-AI / agent-tooling ecosystem** — seed contributors to `llama.cpp + ollama`, `vllm-project/vllm`, and `aider` with 50-80 canonical artifacts. Publish the real `web_fallback_rate` curve after 30 days.
- **Codebase rename** — coordinated `wellinformed → akashik` migration across npm, GitHub, DNS.
- **Read-only public peer endpoint** — "Browse the record" entry point for newcomers, no login required.
- **GDPR Article 17 tombstones** — reconciling immutable provenance with right-to-erasure via signed deletion records.
- **Rarity-aware replication quotas** — LOCKSS-style protection against niche-content evaporation; BitTorrent rarest-first weighting on federation fan-out.

---

## Contributing

Akashik is pre-launch — the federation simulator validates the thesis, the retrieval stack benchmarks at parity with public single-user baselines, and the real pilot is the next milestone. We need:

- Contributors who run a peer in the local-AI / agent-tooling ecosystem during the pilot window.
- Researchers willing to seed canonical artifacts (papers, debug threads, PRs) into their local graphs.
- Engineers interested in libp2p, signed DIDs, or vector-search infrastructure.

Open an issue, fork the repo, or DM the maintainer. The project is in flux and the door is open.

## Status

Pre-launch. Simulator-validated, retrieval-benchmarked, pilot pending. Two-name period in effect (`wellinformed` in code, `Akashik` in marketing). Public protocol spec lands with the rename.

## License

MIT. Always open protocol. Your contributions, signed by you. No central server. Ever. Provenance preserved forever.
