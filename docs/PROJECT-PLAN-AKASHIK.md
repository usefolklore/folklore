# Akashik — project plan

This is the engineering+launch plan for the next 30-60 days, anchored
in the Round 5 octopus-discover recommendation (verbatim: "next
engineering month on AkashikBench-F and federation routing; next
marketing month on a 100-person pilot in the local-AI / agent-tooling
OSS ecosystem"). The product has pivoted from "agent-memory product"
to "federated knowledge commons for the open-source community" and
the brand is now Akashik — the codebase is still `akashik` and
will remain so during the two-name period. The architecture
([how-akashik-works.md](./marketing/how-akashik-works.md)) is the
credibility anchor for the mission; AkashikBench-F is the only
instrument that can falsify or validate the compounding thesis
empirically.

## Status snapshot (2026-05-26)

AkashikBench-F was scaffolded today
([tests/bench-akashik-federation.test.ts](../tests/bench-akashik-federation.test.ts)
+ [src/domain/federation-sim.ts](../src/domain/federation-sim.ts))
and produced positive signal on the LoCoMo factual subset:
`compoundingSlope = -4.74e-5` (negative = network is learning),
`web_fallback_rate` trajectory monotonically falls over the
simulated horizon. This is in-simulator only — a pure boolean-set
abstraction over real retrieval — so it validates dynamics, not
end-to-end retrieval quality. Real-pilot validation is pending.
Codebase is still named `akashik`; brand is Akashik; the
rename PR is a separate workstream queued behind launch. LongMemEval-S
R@5 = 0.9268 (with E11 enrichment), LoCoMo R@10 = 0.725 (with E11);
the local read-path is at its practical ceiling and further per-peer
retrieval tuning is explicitly de-prioritised below.

## Phase 24 — Federation infrastructure (next engineering month)

The Round 5 verbatim recommendation: spend this month on
AkashikBench-F + federation routing because validating the
compounding network effect is the only way to prove the product's
core differentiator. Concrete deliverables:

- **24.1 AkashikBench-F parameter sweep.** Run the existing simulator
  across the grid `shard ∈ {0.02, 0.05, 0.10, 0.20}` ×
  `offline ∈ {0.0, 0.2, 0.5}` × `peers ∈ {5, 10, 25, 50}` ×
  `zipfAlpha ∈ {0.5, 1.0, 1.5}`. For each cell, report
  `compoundingSlope`, `propagationHalfLife.median`,
  `propagationHalfLife.never`, and the
  `local / federation / web` fraction breakdown. Success criterion:
  `compoundingSlope < 0` across ≥ 80% of plausible (shard ≤ 0.10,
  offline ≤ 0.5) configurations. Identify the regime boundary
  where compounding fails so we know what we're betting on.
  Deliverable: results table in
  `docs/research/akashik-bench-f-sweep.md` with a one-paragraph
  interpretation per axis.

- **24.2 Niche-evaporation mitigation (LOCKSS-style).** Today's bench
  surfaced `propagation.never = 76 / 103` documents — only a quarter
  of newly-introduced docs ever reach 50% peer coverage. This is
  Q6b in the Round 5 brief (niche evaporation). Implement
  rarity-aware caching: peers opt-in to caching room items below
  a popularity threshold (the inverse of BitTorrent rarest-first
  — peers proactively replicate the long tail that's at risk of
  evaporating). Add a `replicateBelowPopularity` knob to `SimConfig`,
  wire it into the cache-fill step in `runFederationSim`, and re-run
  the sweep to show the `never` count drops. Deliverable: simulator
  option + measured fix (target: `never` count cut by ≥ 50%
  without `compoundingSlope` going positive).

- **24.3 Federation routing (real wire).** Harden the existing
  `src/infrastructure/peer-transport.ts` (libp2p gossip + dial)
  and `src/application/federated-search.ts` (query fan-out +
  cross-peer transfer) so peers can actually exchange query results
  in production, not just in the sim. Includes:
  Ed25519-signed envelope verification on the receive path
  (already partially present — finish it), bounded timeouts on
  fan-out (Q4 availability-confounding mitigation), and the
  cache-fill side-effect (when peer B answers peer A, peer A
  writes the result to its own local graph signed by B's DID).
  Success criterion: 10-peer LAN integration test shows a query
  resolved by federation lands signed-by-source on the asking
  peer's local graph and is hit-locally on the next ask.

- **24.4 `web_fallback_rate` telemetry pipeline.** Per Round 5
  priority matrix (high impact, low effort). Add a cardinality-safe
  counter to `src/domain/metrics.ts` (no `peer_id × room × entity_id`
  labels — the round-2 audit already warned this is a 500M-series
  bomb; we emit room-level aggregates only). Counter increments
  on `web` resolves, denominator on all resolves; daily snapshot
  written to the peer's local metrics ring. This is the live-network
  analogue of the simulator's `webFallbackRateOverTime`. Success
  criterion: per-room daily snapshot, queryable from CLI, integrates
  cleanly with the existing `metrics bypass` audit path.

- **24.5 Operational hardening — top 3 of the Round 4 blocker list.**
  Three of the eight launch blockers from
  [round-4 synthesis](./research/octopus-discover/round-4-2026-05-26/synthesis.md)
  are picked up here; the other five get explicit defer-to-Phase-26
  notes below.
  - **CLI ↔ daemon IPC auth** (Round 4 finding A): the local
    socket has no workload identity today; a compromised process
    can impersonate the CLI. Add a per-session token in
    `src/daemon/ipc.ts` written to `~/.akashik/ipc.token`
    with `0600` perms; CLI reads + sends on every call; daemon
    rejects unauth'd connections. Success: integration test
    confirms unauth'd socket connect is rejected with
    `IpcAuthError`.
  - **Cache invalidation staggering** (Round 4 finding B):
    today's 60s TTL flush-everything-at-once is a thundering-herd
    risk. Add jitter `±20%` to the TTL per cache key in
    `src/domain/hot-cache.ts` and `src/daemon/ipc-handlers.ts`;
    benchmark shows no synchronized miss bursts under simulated
    load.
  - **CI supply chain** (Round 4 finding F): `npm ci` +
    `scripts/bootstrap.sh` run before the provenance step,
    so a malicious dep can exfiltrate `GITHUB_TOKEN` /
    `NPM_TOKEN`. Pin all transitive deps via lockfile-only
    install (`npm ci --ignore-scripts` + explicit allowlist of
    postinstall scripts), and move secret-bearing steps after
    bootstrap. Success: CI run with a synthetic-malicious dep
    cannot reach the publish step.

## Phase 25 — Pilot launch (next marketing/launch month)

Per Round 5's smallest-viable launch plan: seed the local-AI /
agent-tooling ecosystem because their high-frequency debugging
queries make compounding visible within 30 days. The brutal
tradeoff is acknowledged in the Round 5 brief: "temporarily
pigeonholes Akashik as 'niche debugging tool' — but guarantees
high query overlap so compounding shows up fast." Worth it.

- **25.1 Seed content curation.** Assemble 50-80 canonical artifacts
  covering the local-AI ecosystem's recurring pain points: GitHub
  issues on CUDA OOM (ollama, vllm, llama.cpp), Apple Silicon Metal
  perf threads, vLLM PagedAttention PRs, quantization comparison
  papers (GPTQ, AWQ, GGUF), aider context-window strategies, etc.
  Each artifact saved via `akashik save --type research` from
  a librarian's peer (so provenance lands signed by a real maintainer,
  not the project itself). Deliverable: `docs/marketing/seed-corpus-pilot.md`
  listing every artifact with its URL, librarian, and room.

- **25.2 Librarian onboarding (5-10 maintainers).** Specific named
  maintainers in `llama.cpp`, `ollama`, `vllm-project/vllm`, and
  `aider` ecosystems. These people seed the graph in week 1 of
  the pilot. Target list (to be confirmed by 1:1 outreach):
  - `ollama` — Jeffrey Morgan + 1 maintainer
  - `vllm-project/vllm` — Zhuohan Li + Woosuk Kwon (or proxies)
  - `llama.cpp` — Georgi Gerganov is unlikely; a top-N contributor
    is the realistic target
  - `aider` — Paul Gauthier
  - Plus 3-5 independent ML/agent-tooling builders with strong
    OSS bona fides
  This is the contribution-graph problem — we cannot list certainty
  here; the deliverable is a *contacted* list with yes/no/pending
  status by end of week 1.

- **25.3 Cohort onboarding (80-90 early adopters).** Weeks 2-3 of
  the pilot per Round 5. Recruitment channels: Hacker News (one
  Show HN post), the `r/LocalLLaMA` subreddit, LocalLLM Discords,
  and the maintainers' own audiences. Onboarding artifact is a
  90-second video walkthrough + `npm install -g akashik` +
  `akashik share` to join the pilot rooms. Success criterion:
  ≥ 80 active peers (defined as: ≥ 1 query in past 7 days) by end
  of week 3.

- **25.4 Measurement & report.** Week 4 publishes the live
  `web_fallback_rate(t)` trajectory across the cohort, using
  the 24.4 telemetry pipeline. This is the empirical anchor
  that validates or falsifies the federated thesis under real
  churn — the same chart the simulator produces, but on real
  peers, real queries, real offline rates. Deliverable:
  `docs/research/pilot-30-day-report.md` with the
  trajectory, propagation half-life on real-pilot data, the
  `local / federation / web` fraction breakdown, and an explicit
  pass/fail verdict on the compounding hypothesis. If the line
  doesn't fall measurably, we publish that too — the Q8
  counter-argument is fair-game and we promised to answer it
  empirically.

## Phase 26+ — Operational maturity (deferred Round 4 findings)

The five Round 4 launch blockers that don't gate the pilot but
do gate enterprise / SOC2-grade adoption. Each gets a deliberate
phase slot, not a hand-wave:

- **26.1 Schema migration quarantine** (Round 4 C). When a peer
  with an older schema federates with a peer on v2, malformed
  nodes are dropped silently. Add a `quarantine` table in the
  peer's SQLite, persist rejected envelopes with the parser error,
  and expose `akashik quarantine list / replay` so operators
  can recover post-migration. The right time to ship this is
  immediately after the pilot when we'll have actual cross-version
  traffic.

- **26.2 Observability for federated search** (Round 4 D). The
  current cardinality-safe metric design is correct but
  under-instrumented for ops — when fan-out degrades, the
  operator can't tell which peer / room is the cause.
  Mitigation: per-room (not per-peer) histograms for fan-out
  latency, federation hit rate, dial failures; emitted as
  structured logs the operator can grep, not as Prometheus
  labels.

- **26.3 Runbooks for split-brain / dial-storms / index corruption**
  (Round 4 E). Today's bus-factor is 1; the runbook deliverable
  is `docs/runbooks/{split-brain.md, dial-storm.md, index-corruption.md, peer-key-rotation.md}`
  with reproducible recovery commands. Drives toward bus-factor ≥ 2
  via documentation, not just hiring.

- **26.4 HTTP-style auth error taxonomy** (Round 4 G). Domain
  errors today (`PeerDialError`, `ShareError`) are too granular for
  MCP clients to decide retry vs abort. Add a coarse `category`
  field — `unauthorized | forbidden | rate-limited | unavailable | bad-request`
  — alongside the precise error name. Clients route on the category;
  humans debug from the precise name.

- **26.5 SOC2-grade exfiltration audit trails** (Round 4 H).
  Today peers federate queries autonomously; an enterprise
  auditor cannot prove what proprietary IP left the local machine.
  Mitigation: append-only signed audit log of every outbound
  federation query with `(timestamp, room, query-hash, target-peer-set)`;
  optional WORM export. This is enterprise gating, not pilot
  gating.

## What we're explicitly NOT doing — and why

Verbatim from Round 5: *"Specifically NOT chasing the final 3pp of
R@5 on LongMemEval-S because it chases a mathematical ceiling for a
single-user metric, which distracts from the federated mission."*
Expanded:

- **No further bge-reranker / ms-marco / listwise rerank tuning on
  LongMemEval-S.** The head is saturated (R@50 = 1.0, NDCG@5 = 0.884,
  R@5 = 0.92) and only ~4pp of NDCG headroom remains. Three rounds
  of probes confirmed clean nulls from every cross-encoder we tried.
  This is a vanity-metric race against single-user products.

- **No mem0 / agentmemory / ByteRover parity push.** Their published
  numbers (0.925 / 0.952 / 0.928) use LLM-as-judge or E2E extraction,
  not retrieval-only — they're not apples-to-apples (Round 5 Q4 #3).
  And more fundamentally, they're single-user products serving a
  different problem; we're not in their bracket. Reporting our
  retrieval-only ladders next to their LLM-judge numbers is
  misleading both ways.

- **No retrieval-quality work that doesn't measurably move one of
  `web_fallback_rate`, `propagation_half_life`, `compounding_slope`.**
  If a proposed experiment can't be expressed as "we expect this to
  shift metric X by Y%", we don't do it in this 60-day window. The
  bench is the gate.

- **No premature rebrand-PR (`akashik → akashik` package
  rename).** The two-name period is fine during launch — pilot
  participants install `akashik` and read about Akashik;
  this is normal in rebrand windows. The rename is a single
  coordinated PR queued behind a successful pilot, not in front
  of it.

- **No SOC2 / enterprise security work in the launch window.** Phase
  26.5 exists; it's just not on the critical path for a 100-person
  OSS pilot. Doing it now would burn the engineering month.

## Open architectural questions

Questions where we genuinely don't have an answer yet and are
proceeding without one. Listed here so they can't be quietly
forgotten:

- **GDPR Article 17 vs immutable signed provenance.** "Signed and
  attributed forever" is the brand promise; right-to-erasure is the
  legal requirement. When a contributor invokes erasure, the
  signed envelope already lives on N peers. Candidate answers:
  tombstone propagation (peers respect tombstones lazily, but a
  malicious peer can ignore them), encrypted-payload-with-key-shred
  (legible only while the curator publishes a key — they can
  withdraw it), or jurisdictional carve-outs (the protocol stays
  immutable, regional gateways enforce erasure for their users).
  Decision: park until pilot reveals real demand. The local-AI
  pilot population is unlikely to trigger GDPR cases week 1.

- **Bootstrap problem.** The 101st contributor on day 1 has a graph
  of size zero; their first 10 queries will all fall through to web
  (because none of their queries' answers are yet cached on their
  peer). The compounding only helps from query 11 onward. Is this
  acceptable? Mitigations to evaluate: a "starter pack" room of
  the most-queried topics in the pilot that new peers can opt into
  cloning (LOCKSS-style proactive replication), or accepting that
  day-1 UX is "just like having no peer" and the value compounds.

- **Misinformation flood resilience.** Round 5 Q6c flagged adversarial
  contributors flooding with plausible-but-wrong knowledge as the
  attack surface. Suggested mitigation was Bluesky-style composable
  moderation labelers attached to DIDs. Open question: how does
  third-party labeling interact with cryptographically signed
  contributions? (A labeler attests "this DID's contributions are
  unreliable in topic X"; consumers weight retrieval by the labeler
  reputation they subscribe to.) Concrete design pending; for the
  pilot we rely on the small librarian-vetted seed corpus.

- **Federation under partial-trust rooms.** Today rooms are binary
  (member or not). Real OSS communities have trust gradients —
  "I trust llama.cpp maintainers more than randoms in the same room."
  Do we need weighted federation (a peer's contributions count
  more if they're in the librarian set)? Or is binary good enough
  for v1? Decision: binary for the pilot; revisit if compounding
  is driven entirely by 5 librarians (which would mean the model
  is too centralised).

- **The "ambitioned curator goes offline" worst case.** Acknowledged
  honestly in `how-akashik-works.md` ("availability follows
  participation"). The pilot will produce empirical data on what
  fraction of niche knowledge is held by exactly one peer; if
  that's the dominant case, the LOCKSS-style replication of
  Phase 24.2 is the answer. If it's a tail, we leave it.

## Success criteria for the next 30 days

Concrete, measurable, falsifiable:

- **Phase 24.1 sweep published.** All configs in the
  `shard ≤ 0.10, offline ≤ 0.5` grid show `compoundingSlope < 0`,
  or we explicitly document the cells where it doesn't and why.

- **Phase 24.2 mitigation lands a real win.** Niche-evaporation
  `propagation.never` count drops by ≥ 50% under the rarity-aware
  caching opt-in, without `compoundingSlope` regressing to ≥ 0.

- **Phase 24.3 federation routing is integration-tested at 10 peers.**
  A query satisfied by federation produces a signed-by-source local
  cache entry on the asker, and the asker resolves that query
  locally on retry — end-to-end across real libp2p, not just
  in-process.

- **Phase 24.4 `web_fallback_rate` telemetry ships.** CLI command
  `akashik metrics fallback --room <room>` returns a per-day
  series, and the daemon emits zero spurious cardinality.

- **Pilot has ≥ 50 active peers by end of week 3** and the live
  `web_fallback_rate(t)` trajectory is monotonically falling over
  ≥ 14 consecutive days. If it's not falling, the
  Round 5 Q8 counter-argument was right and we publish that
  honestly.

- **AkashikBench-F v2 is at least started.** v1 is boolean-set
  federation dynamics; v2 plugs in real per-peer retrieval (each
  peer runs the full local read-path on its shard) so we can
  separate "the network compounds knowledge boolean-availably"
  from "the network compounds *retrievable* knowledge". The
  scaffold + a passing first run is enough — full eval is Phase 27.

## Reference index

The docs this plan depends on, ranked by load-bearing-ness:

- [docs/research/octopus-discover/round-5-2026-05-26/README.md](./research/octopus-discover/round-5-2026-05-26/README.md)
  — the verbatim engineering-month + marketing-month recommendation
  and the AkashikBench-F design brief.
- [docs/research/octopus-discover/round-4-2026-05-26/synthesis.md](./research/octopus-discover/round-4-2026-05-26/synthesis.md)
  — the 8 operational/security launch blockers (A-H) referenced
  in Phase 24.5 and Phase 26.
- [tests/bench-akashik-federation.test.ts](../tests/bench-akashik-federation.test.ts)
  — the first-pass bench harness (positive signal today:
  `compoundingSlope = -4.74e-5`).
- [src/domain/federation-sim.ts](../src/domain/federation-sim.ts)
  — the simulator + the metric functions
  (`webFallbackRateOverTime`, `compoundingSlope`,
  `propagationHalfLife`) that Phase 24.1 sweeps and Phase 24.4
  productionises.
- [docs/marketing/how-akashik-works.md](./marketing/how-akashik-works.md)
  — the architectural credibility anchor; the mechanism the pilot
  exists to validate.
- [docs/marketing/storybrand-messaging-draft.md](./marketing/storybrand-messaging-draft.md)
  — the brand positioning the Phase 25 launch executes against;
  the empirical proof points lower-down on that page get updated
  with the Phase 25.4 numbers post-pilot.
