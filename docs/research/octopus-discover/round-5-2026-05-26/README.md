# Octopus discover — Round 5 (2026-05-26 evening)

Focused re-run of Round 4 with explicit "answer Q1-Q8 directly,
no mandatory-perspectives padding" instruction. Round 4's synthesis
had landed on a codebase audit instead of fusing the strategy
answers; Round 5 corrects that. Returned exactly what was asked for.

## Headline outputs

### Q1 — Where the next engineering month goes
> **AkashikBench-F + federation routing.** Stop chasing the final
> 3pp of LME-S R@5 — that's a single-user vanity metric. The core
> differentiator is network compounding; validating it requires
> measurement infrastructure that doesn't exist yet.

### Q2 — Mechanism novelty + closest prior art
> **Compositionally novel; the math is Freenet's.**
> Freenet (Clarke et al. 2001) formalised demand-driven lazy
> replication with cache fill on miss. AT Protocol contributes
> the DID identity + signed-attribution layer. Akashik =
> *"Freenet-style demand-shaped replication applied to attributed
> semantic research memory, with AT Protocol-style DID signatures."*

### Q3 — AkashikBench-F (proposed federation benchmark)
> N=10 disjoint peer shards over a frozen OSS corpus (BEIR SciFact
> or snap-research/locomo). Zipfian query stream. 20% offline
> churn. On miss, peer fetches from controlled-oracle web corpus,
> saves locally. Metrics: **`web_fallback_rate(t)`** and
> **Propagation Half-Life** (median time to 50% peer coverage of
> a newly-acquired fact). Compounding = negative slope of
> `web_fallback_rate`. Runnable in ~1 week of dev.

### Q4 — Three other evaluation pitfalls
1. **Availability Confounding** — always-online assumptions
   inflate federation quality. *Fix:* probabilistic 20-50% peer
   churn + bounded timeouts during eval.
2. **Corpus Contamination** — overlapping seed corpora makes
   basic dedup look like knowledge transfer. *Fix:* strictly
   disjoint initial seeding per peer.
3. **Apples-to-Oranges Competitor Baselines** — mem0 (0.925) and
   ByteRover (0.928) use LLM-as-judge or E2E extraction, not
   retrieval-only. *Fix:* report retrieval-only and LLM-judge
   metrics in explicitly separate tables.

### Q5 — Smallest-viable 30-day launch plan
> Seed the **local-AI / agent-tooling ecosystem**: contributors
> to `llama.cpp + ollama`, `vllm-project/vllm`, and `aider`.
> Seed content: 50-80 canonical artifacts (GitHub issues on CUDA
> OOM, PRs, relevant papers).
>
> - Week 1: 5-10 "librarian" maintainers seed the graph
> - Week 2: onboard 80-90 early adopters
> - Week 3: organic debugging queries run
> - Week 4: publish the `web_fallback_rate` drop
>
> Tradeoff: temporarily pigeonholes Akashik as "niche debugging
> tool" — but guarantees high query overlap so compounding shows
> up fast.

### Q6 — Failure modes + known solutions
| Failure | Known solution | Mechanism |
|---|---|---|
| (a) Popularity cascade | **BitTorrent rarest-first** (Legout et al., arXiv:cs/0609026) | Weight federation fan-out by inverse-doc-frequency |
| (b) Niche evaporation | **LOCKSS** ("Lots of Copies Keep Stuff Safe") | Room-level pinning or rarity-aware replication quotas |
| (c) Misinformation flood | **Bluesky / AT Protocol labelers** (or Wikipedia verifiability) | Composable moderation labels on DIDs → local trust scores |

### Q7 — REAL competitors (named systems, not categories)
1. **Are.na** — closest *product* competitor.
   *Positioning:* "Are.na is what Akashik looks like centralized;
   Akashik is Are.na where blocks are queryable via vector search,
   locally owned, and propagate peer-to-peer."
2. **AT Protocol (Bluesky)** — closest *protocol* analogue.
   *Positioning:* "AT Protocol solved federated identity for
   social posts; Akashik is AT Protocol for semantic research
   memory with demand-shaped retrieval."
3. **agentmemory** — closest *current benchmark* rival.
   *Positioning:* "agentmemory wins single-player retrieval;
   Akashik extends that local memory into cross-peer transfer
   and network compounding."

### Q8 — Strongest counter-argument + response
**Counter-argument** (devastating, valid):
> "You're adding a flaky, mostly-offline federation hop in front
> of systems that already solve knowledge sharing better (Stack
> Overflow, GitHub, Google). Because peers are mostly offline
> laptops, users will miss locally, peers will time out, and
> Akashik will collapse into a slower 'web search plus personal
> cache'. The federated network effect is a complete illusion."

**Response:**
> Valid unless we can demonstrate, in a dense pilot room, that
> `web_fallback_rate` materially drops over 30 days AND cross-peer
> transfers happen faster than fresh web research. Local-first
> web-fallback is useful on day 1 even without federation, so the
> floor is "personal memory with auto-archive" — not zero. The
> tradeoff is brutal: if the pilot doesn't show repeated
> miss-to-hit conversions across different users under real
> churn, the federated-commons thesis is empirically disproven,
> and the product reduces to local-first memory sync. That's the
> bet.

## Final recommendation (verbatim from synthesis)

> "If I were Sahar, the next engineering month I'd spend on
> **AkashikBench-F and federation routing** because validating
> the compounding network effect is the only way to prove the
> product's core differentiator. The next marketing/launch month
> I'd spend on a **100-person pilot seeded in the local-AI /
> agent-tooling OSS ecosystem** because their high-frequency
> debugging queries will make compounding visible and measurable
> within 30 days. Specifically NOT **chasing the final 3pp of
> R@5 on LongMemEval-S** because it chases a mathematical ceiling
> for a single-user metric, which distracts from the federated
> mission."

## Patterns + Conflicts surfaced

- **Write-path interventions work** (E11 +0.66pp LME-S,
  +0.9-2.7pp LoCoMo) — at zero query-time cost.
- **Bi-encoder dominates locally** — small LLMs for listwise
  rerank repeatedly failed to beat bi-encoder. The local-only
  read-path is at its practical limit.
- **Immutable provenance ↔ GDPR Article 17 conflict** —
  "signed and attributed forever" needs tombstone propagation
  for right-to-erasure compliance.
- **SOC2 Type II gap** — gossip-first federation lacks central
  audit trail of who-queried-what for proprietary IP.

## Files

- `synthesis.md` — full Round 5 synthesis (gemini-fused, ~14 KB)
- `probes/codex-0.md`
- `probes/gemini-1.md`
- `probes/claude-sonnet-2.md`
- `probes/codex-3.md`
- `probes/gemini-4.md`
- `probes/claude-sonnet-5.md`

## Implementation pointers (where the work goes next)

- **AkashikBench-F** → new `tests/bench-akashik-federation.test.ts`
  + `src/domain/federation-sim.ts` (in-process N-peer simulator)
- **`web_fallback_rate` telemetry** → extend `src/domain/metrics.ts`
  (cardinality-safe counter; emits per-room daily)
- **Pilot launch artifacts** → `docs/marketing/launch-plan-akashik.md`
  with specific GitHub issues / PRs / papers to seed
- **Counter-argument acknowledgement** → add to
  `docs/marketing/storybrand-messaging-draft.md` Prompt 3 authority
  proof points: "Empirically validated in the local-AI pilot —
  `web_fallback_rate` dropped X% over 30 days across N peers."
  Update with real numbers post-pilot.
