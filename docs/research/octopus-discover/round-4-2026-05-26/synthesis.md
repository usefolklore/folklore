# PROBE Phase Synthesis
## Discovery Summary - יום ג׳ מאי 26 2026 17:11:12 IDT
## Original Task: -P FOURTH-ROUND analysis. Prior three octopus-discover rounds advanced the project through: (1) initial menu of retrieval-quality experiments, (2) empirical pushback on the cross-encoder null, (3) metric-blindness diagnosis + write-path enrichment validation. We've now measured everything those recommendations asked for AND made a fundamental project-identity pivot. Need help triangulating where next.

================================================================
PROJECT IDENTITY (changed since last round)
================================================================

The project pivoted from "akashik: agent-memory product" to
"Akashik: federated knowledge commons for the open-source community as a whole."

The mission is to give the OSS community what it has always lacked:
a shared, contributor-owned memory substrate where every piece of
reading, debugging, and figuring-out compounds into the community's
collective progress — generation after generation, signed and
attributed, forever.

The brand name borrows from the Akashic Records mythology, reframed
as concrete contributor-owned infrastructure. The codebase is still
called "akashik" internally.

================================================================
THE MECHANISM (the architectural insight that makes the mission credible)
================================================================

Each Akashik peer holds only its own information:
  - what its user explicitly contributed
  - what it pulled from other peers in response to its user's queries
  - what it researched on the web when the federation couldn't answer

There is NO global graph. There is NO central server. Each peer's local
store is exactly the slice that's been pulled into use through that
user's curiosity.

The compounding loop, in 5 steps:

  STEP 1: Local-first query → A's local Akashik graph
  STEP 2: Federation fan-out → connected peers in shared rooms answer
          with their two cents (what they have)
  STEP 3: If federation can't satisfy → harness reaches the web on
          A's machine (only outbound network in the whole loop)
  STEP 4: Result saved to A's local graph, signed by A's DID
          → A becomes the "ambitioned" curator of that knowledge
  STEP 5: Next user B asks similar question → federation fan-out
          reaches A's peer (if online) → A's research transfers to
          B, attributed to A

Formal property:
  R(T, t) = number of peers caching topic T at time t
            (monotonically non-decreasing — only grows)
  expected_time_to_answer(T)  ~  1 / R(T, t)

Compounding is a property of the architecture, not a marketing claim.

Honest trade-off: when an ambitioned peer goes offline before any
other peer has pulled the knowledge, that piece is temporarily
unavailable. Same property as every decentralized system —
availability follows participation. Mitigation: opt-in caching of
popular-in-room items.

================================================================
ALL MEASURED RESULTS TO DATE
================================================================

LongMemEval-S 50-distractor (n=500, Hetzner CAX11 ARM, retrieval-only):

  Baseline (no rerank, no enrich):
    R@5  = 0.9202  R@10 = 0.9687  R@20 = 0.9925  R@50 = 1.0000
    NDCG@5 = 0.8836  NDCG@10 = 0.9032  NDCG@20 = 0.9109  NDCG@50 = 0.9129
    MRR = 0.9034

  + bge-reranker-base cross-encoder, head=20  → 0.9202  CLEAN NULL
  + ms-marco-MiniLM-L-6-v2 cross-encoder, head=20  → 0.9202  CLEAN NULL
  + E11 contextual enrichment (date+session+participants prefix)  → 0.9268  +0.66pp
  + qwen2.5:1.5b listwise (no shuffle, head=30)  → 0.9202  CLEAN NULL (input-order bias)

  Implication: NDCG@5 - R@5 = 4pp gap. Some gold sits at positions 2-5.
  Max rerank-only headroom on this benchmark: ~4pp NDCG@5.

LoCoMo factual subset (n=699, M-series Mac, retrieval-only):

  Baseline (no rerank, no enrich):
    R@3 = 0.392  R@10 = 0.698  R@30 = 0.993  R@50 = 0.993
    NDCG@3 = 0.484  NDCG@10 = 0.603  NDCG@30 = 0.658  NDCG@50 = 0.658
    MRR = 0.5931
    dimension (harmonic mean evidence-recall × containment) = 0.3536

  + E11 contextual enrichment:
    R@3 = 0.401 (+0.9pp)  R@10 = 0.725 (+2.7pp)
    NDCG@3 = 0.499 (+1.5pp)  NDCG@10 = 0.620 (+1.7pp)
    MRR = 0.6067 (+1.4pp)
    dimension = 0.358 (+0.4pp)

  + Cross-encoder rerank (any model)  → 0.3536  CLEAN NULL
  + qwen2.5:1.5b listwise (no shuffle)  → 0.3536  CLEAN NULL
  + qwen2.5:1.5b listwise (shuffle on, post-1f828b7 fix)  → still measuring; 8-q spot-check showed 3 same-set + 1 lift + 1 regression
  + qwen2.5:7b listwise (shuffle on)  → 8-q spot-check: 2/8 hits vs bi-encoder 6/8 (REGRESSION −50pp on small sample)
  + gpt-oss:20b listwise  → BROKEN: returns empty output for every prompt on this Ollama install

  Implication: R@30 = 0.993 means gold is in the candidate pool for
  ~all questions. R@3 = 0.392 means it's ranked badly within top-3.
  60pp of theoretical rerank headroom. Small local LLMs aren't
  capturing it.

================================================================
THREE PRIOR OCTOPUS-DISCOVER ROUNDS — INSIGHTS AND VERDICTS
================================================================

ROUND 1 (2026-05-21, probe-synthesis-1779351019.md):
  Recommended: cross-encoder rerank activation (E1'), bge-reranker-base
  swap, write-path contextual enrichment (E11), temporal query gate (E10).
  Empirical verdict: bge-reranker-base swap recommendation was WRONG
  (model came up null). E11 recommendation was RIGHT (+0.66pp on LME-S,
  +0.9-2.7pp on LoCoMo). E10 not yet implemented.

ROUND 2 (2026-05-24, probe-synthesis-1779613890.md):
  Diagnosed bge-reranker-base failure as "mathematical ceiling" (set
  saturation) — turned out partly true (head is saturated on LME-S)
  but partly wrong (LoCoMo head is NOT saturated; the issue there is
  reranker quality not saturation). Recommended R@50 diagnostic,
  turn-level indexing, temporal gate.
  Empirical verdict: R@50 diagnostic was the RIGHT move — revealed
  LME-S head saturation (R@50=1.0) AND LoCoMo's massive recall
  headroom (R@30=0.993 vs R@3=0.392). Turn-level indexing not tested.

ROUND 3 (2026-05-26 morning, probe-synthesis-1779784750.md):
  Diagnosed "metric blindness" — set-based R@K masks intra-list
  reordering. Pointed out ndcgAtK and reciprocalRank already existed
  in src/domain/eval-metrics.ts but weren't invoked. Recommended
  NDCG/MRR augmentation + LoCoMo E11 run. Identified the listwise-
  rerank input-order bias as known pathology (RankGPT §4.3) and
  recommended sliding window or input shuffling.
  Empirical verdict: BOTH recommendations validated. NDCG augmentation
  shipped (Phase 23.15) revealed real lift signals R@K hides. E11 on
  LoCoMo shipped real lift across every metric. Shuffle fix (Phase
  23.14, commit 1f828b7) shipped, breaks the bias, but small LLMs
  still don't beat bi-encoder.

================================================================
WHAT'S NEW SINCE ROUND 3
================================================================

1. Marketing positioning made three full pivots:
     Personal-memory framing (wrong: too small, R@5 race vs mem0)
     Team/small-group framing (closer: federated/signed/owned but
       private-by-default and missing the mission)
     OSS-community-commons framing (correct: matches both the
       architecture AND the mission)
   Brand renamed to Akashik. New StoryBrand-anchored marketing
   draft + mechanism doc (docs/marketing/how-akashik-works.md)
   capture the compounding loop architecturally and link to it
   from the brand messaging as the credibility anchor.

2. LME-S baseline re-run with NDCG/MRR ladder. Confirmed head
   saturation (NDCG@5 = 0.884, only 4pp room below R@5 = 0.92).

3. The Akashik mechanism (5-step compounding loop, peer-local
   storage, ambitioned-curator model) is now explicitly documented
   as the architectural credibility anchor for the mission claim.

================================================================
OPEN QUESTIONS FOR THIS ROUND
================================================================

Q1. Given the empirical ceiling on LME-S R@5 (NDCG@5 headroom ~4pp,
    R@50 already 1.0), is further investment in pushing the headline
    R@5 number a marketing question (mining the last 2pp toward
    agentmemory) or an engineering question (architecting the
    federation rather than tuning per-peer retrieval)? Where should
    the next engineering month go?

Q2. The Akashik mechanism (peer-local + federation-on-query + web-
    on-miss + save-locally + transfer-on-next-ask) — is this
    architecturally novel, or is it a known pattern in disguise?
    Cite prior art. If it IS novel, what's the closest existing
    research/protocol/system, and what makes Akashik different in
    a defensible way?

Q3. There is NO existing public benchmark for "how much does a
    federated peer network compound knowledge over time?" The
    R@5 / NDCG@K / MRR benchmarks measure single-peer retrieval
    quality, not the compounding the mission claims. What
    benchmark would actually measure the mission? Could we
    propose / publish one?

Q4. The Octopus has flagged "input-order bias" (Round 3) and
    "metric blindness" (Round 3) as known retrieval-research
    pitfalls we'd missed. Are there OTHER known pitfalls we're
    probably hitting and don't realise? Specifically in:
      (a) listwise rerank evaluation
      (b) federated retrieval evaluation
      (c) write-path enrichment (E11)
      (d) the comparison to competitor numbers (agentmemory 0.952
          / mem0 0.925 / ByteRover 0.928 — are these defensible
          baselines?)

Q5. The Akashik mission requires the network to actually grow.
    What's the smallest-viable launch plan that produces a
    meaningful compounding signal in the first ~30 days post-
    launch? Specifically: who are the first 100 contributors, what
    rooms do they share, and what content do they save such that
    the compounding becomes visible to a new contributor visiting
    the network at day 30?

Q6. The Akashik architecture relies on user curiosity as the
    propagation signal. This is brilliant when curiosity-volume is
    healthy. What happens when:
      (a) the network is dominated by N curators of the same hot
          topic (popularity cascade — does the record stay diverse?)
      (b) niche knowledge gets pulled rarely (does it stay
          retrievable, or quietly evaporate from peer caches?)
      (c) adversarial contributors flood the federation with
          plausible-but-wrong knowledge (the misinformation
          attack surface)
    What known systems have solved these problems and how?

Q7. The competitor frame (mem0/agentmemory/ByteRover) was the
    wrong frame — they're single-user products and we're a
    federated commons. Who are the REAL existing systems that
    Akashik competes with / extends / supersedes? Be specific
    about systems, not categories. Possibilities to evaluate:
      - Are.na (curated cards, central)
      - Logseq P2P sync (knowledge graph, multi-device same user)
      - Mastodon (federated social, no semantic graph)
      - arxiv (open preprint, central but read-only)
      - Wikipedia (open knowledge, central + edit-conflict-driven)
      - Roam Research + Knowledge Garden movement
      - IPFS / hypercore / dat (P2P storage primitives)
      - Bluesky / AT Protocol (federated identity + content)
      - The various "agent memory" products (single-user, central)
    Which of these is the closest competitor / collaborator / fork
    target?

Q8. Final philosophical question. The mission is "make the OSS
    community's collective progress compound." The mechanism is
    sound. The marketing draft is honest. What's the strongest
    counter-argument someone could make against this entire
    project that we should pre-emptively address in the launch?

OUTPUT EXPECTED:

  - Direct answers to Q1-Q8
  - For Q2: closest prior-art protocol or research paper, with
    why Akashik differs
  - For Q3: a proposed benchmark for measuring federation-level
    compounding, with the metrics and the experimental design
  - For Q5: the smallest-viable launch plan (specific communities,
    specific seed content, specific timeline)
  - For Q7: definitive identification of the 2-3 systems that are
    actual competitors (not categories)
  - For Q8: the strongest counter-argument + a one-paragraph
    response to it
  - HONEST FINAL ASSESSMENT: given the three-round empirical arc
    and this pivot, what should the next engineering month
    actually be spent on?

<external-cli-output provider="gemini" trust="untrusted">
This synthesis combines a direct analysis of the local codebase with the mandatory systemic perspectives. The findings below are grounded strictly in the actual file contents, repository structure, and CI/CD configurations found in your workspace, directly applying them to your recent pivot to the **Akashik** federated knowledge commons.

### 1. Codebase Reality Check: Tech Stack, Architecture, and Conventions

**Tech Stack:**
*   **Language & Runtime:** TypeScript / Node.js (v20 and v22 via `.github/workflows/ci.yml`).
*   **Storage & Search:** SQLite with `sqlite-vec` (evidenced by `src/infrastructure/vector-index.ts` and `VectorError` types), plus Y.js for CRDT syncing (`src/infrastructure/ydoc-store.ts`).
*   **Networking:** libp2p for federation (`src/infrastructure/peer-transport.ts`).
*   **Functional Primitives:** Extensive use of `neverthrow` (`Result`, `ResultAsync`) for monad-based error handling.

**Architecture Patterns & File Structure:**
The codebase strictly adheres to **Domain-Driven Design (DDD)** and **Clean Architecture**.
*   `src/domain/`: Pure business logic. Completely devoid of I/O, classes, or `throw` statements. Exclusively uses immutable interfaces, pure functions, and `Result` types. 
*   `src/infrastructure/`: Ports and adapters. Handles side-effects, SQLite reads, HTTP fetches (`src/infrastructure/http/fetcher.ts`), and libp2p transport.
*   `src/application/`: Application use cases (e.g., `federated-search.ts`, `session-ingest.ts`).
*   `src/daemon/` & `src/cli/`: The operational shell. IPC handlers (`src/daemon/ipc-handlers.ts`) connect the background daemon tick loop to CLI commands.
*   `src/mcp/`: The Model Context Protocol layer for Claude integration.

**Coding Conventions:**
*   **Extreme Purity:** Errors are handled via discriminated/tagged unions (e.g., `AppError` in `src/domain/errors.ts`), forcing exhaustive `switch` statements at the format boundary. This prevents silent runtime exceptions.
*   **Immutable Types:** Heavy usage of `readonly` properties and `ReadonlyArray`.

**Relation to the Akashik Pivot:**
The architecture perfectly supports the "federated knowledge commons" pivot. The strict separation of pure domain logic (like `eval-metrics.ts` and `sharing.ts`) from infrastructure (like `peer-transport.ts`) means the local knowledge graph operates flawlessly offline, treating remote peers simply as additional infrastructure sources.

---

### 2. Mandatory Perspectives: Systemic Blind Spots & Trade-offs

LLMs typically miss the following operational realities. Here is how your specific codebase holds up against them, evaluated with strict balance (advantages vs. tradeoffs).

#### A. Internal Trust Boundaries & Workload Identity
*   **Observation:** You use libp2p with Noise and `ed25519` for external peering (`src/infrastructure/peer-identity.ts`), but internal services (e.g., CLI to Daemon) rely on local IPC (`src/daemon/ipc.ts`). 
*   **Analysis:** There is **no mTLS, SPIFFE/SPIRE, or workload identity** governing local inter-process communication. 
*   **Balanced Trade-off:** The advantage is drastically reduced setup complexity and fast local development. The disadvantage is a gaping local trust boundary: a compromised process on the user's machine can write directly to the local daemon's IPC socket, impersonating the CLI and poisoning the local vector DB without triggering the libp2p security gates.

#### B. Cache Invalidation Blast Radius
*   **Observation:** The daemon utilizes an L1 `queryCache` and L2 `semanticCache` (`src/daemon/ipc-handlers.ts` and `src/domain/hot-cache.ts`) with a 60-second TTL.
*   **Analysis:** There is no evidence of staggered invalidation or circuit breakers. 
*   **Balanced Trade-off:** The advantage of a strict 60s TTL is architectural simplicity. The massive risk is a **thundering herd**: when the cache clears, a burst of agent refinement queries will simultaneously miss the cache, slamming the local `sqlite-vec` instance and the embedding model. This risks freezing the daemon during peak local LLM generation.

#### C. The Long Tail: Schema Migration & Data Quarantine
*   **Observation:** The system relies on pure parsers and validators, returning `GraphParseError` or `PeerStoreReadError` when JSON shapes don't match.
*   **Analysis:** There is **no quarantine table** for malformed nodes or orphaned records. 
*   **Balanced Trade-off:** The advantage is strict data hygiene (bad data is dropped instantly, keeping the active graph pure). The disadvantage is operational fragility during schema migrations (e.g., upgrading from v1 to v2 shared rooms). If an older peer sends a deprecated schema over libp2p, the data is lost silently or throws a parser error, with no "dead letter queue" to recover it from later.

#### D. Metric Cardinality
*   **Observation:** The file `src/domain/metrics.ts` explicitly addresses this. It states: *"No labels / tag cardinality. The round-2 audit warned that `peer_id x room x entity_id` would explode to 500M time series; we simply don't expose label dimensions at all."*
*   **Analysis:** You have successfully identified and neutralized the cardinality bomb. You rely on snapshot-on-pull instead of a Prometheus exporter.
*   **Balanced Trade-off:** The advantage is that monitoring will never degrade the system's memory budget. The tradeoff is a severe loss of observability; when federated search degrades, operators cannot query metrics to find *which specific room or peer* is causing the latency, forcing them to rely on raw logs.

#### E. Human Factors (Runbooks, Bus Factor, On-Call)
*   **Observation:** The codebase is pristine, but operational documentation is missing.
*   **Analysis:** There are **no runbooks** for dealing with split-brain Y.js CRDT conflicts, manual SQLite-vec recovery, or libp2p dial storms. 
*   **Balanced Trade-off:** The advantage of a single-author (bus factor = 1) architecture is rapid iteration and conceptual integrity. The disadvantage is zero sustainability. When the first enterprise cohort adopts this and encounters a corrupted local vector index, there is no documented escalation path or recovery script, which will cause immediate churn.

#### F. CI/CD as a Privileged Attack Surface
*   **Observation:** `.github/workflows/release.yml` successfully uses `npm publish --provenance`, generating SLSA Level 3 signatures. It also pushes to `ghcr.io` via `GITHUB_TOKEN`.
*   **Analysis:** You have excellent artifact signing. However, `.github/workflows/ci.yml` uses `submodules: recursive` and runs `npm ci` followed by `bash scripts/bootstrap.sh`. 
*   **Balanced Trade-off:** The advantage is high-assurance releases. The disadvantage is that your CI pipeline is highly vulnerable to third-party supply chain attacks. If a malicious NPM package or git submodule executes arbitrary code during `npm ci` or `bootstrap.sh`, it can exfiltrate the `GITHUB_TOKEN` or NPM token before the provenance step is even reached.

#### G. Auth Error Taxonomy
*   **Observation:** Errors are strictly typed as `PeerError`, `ShareError`, etc., inside `src/domain/errors.ts`. 
*   **Analysis:** You are missing a standard HTTP-style taxonomy (401 invalid, 403 forbidden, 429 rate-limited). A failure to dial a peer returns `PeerDialError`.
*   **Balanced Trade-off:** The advantage is that your errors are domain-perfect (e.g., `PeerIdentityParseError`). The disadvantage is poor interoperability for downstream clients. When an agent's MCP call fails, it doesn't know if it should back off and retry (429 equivalent) or if it was explicitly denied access to a room (403 equivalent). There is no token introspection endpoint for debugging P2P handshakes.

#### H. B2B / Enterprise Security Audits (SOC2 / GDPR)
*   **Observation:** You built a robust `share audit` command (Phase 15 SEC-04) that blocks 14 patterns of secrets (OpenAI keys, AWS keys) from federating.
*   **Analysis:** While you block secret ingestion, you completely lack **data exfiltration audit trails**. 
*   **Balanced Trade-off:** The advantage of your current setup is that developers feel safe sharing rooms because API keys are scrubbed. The disadvantage is that enterprise SOC2 Type II auditors will fail the system. An enterprise needs to prove *who asked what, and what specific data left the local machine*. Because Akashik peers autonomously federate queries via `ask --peers`, a SOC2 audit cannot easily prove that a specific piece of proprietary IP wasn't inadvertently synced to an unauthorized peer's local graph.
</external-cli-output>

---
*Synthesized from 6 research threads (task group: 1779803926)*
