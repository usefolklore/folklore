# PROBE Phase Synthesis
## Discovery Summary - יום ג׳ מאי 26 2026 18:05:11 IDT
## Original Task: -P ROUND 5 — focused synthesis. Round 4 produced six substantive probes but the synthesizer collapsed them into a codebase audit instead of fusing direct answers to Q1-Q8. Re-run with explicit instruction: ANSWER EACH QUESTION DIRECTLY. Cite specific systems, papers, repos, and arxiv IDs. No mandatory-perspectives padding — those landed last round (CLI IPC trust gap / cache thundering herd / schema-migration quarantine / runbook bus-factor / CI supply chain / auth taxonomy / SOC2 exfil trails) and we've absorbed them.

================================================================
PROJECT CONTEXT (unchanged from Round 4 — abbreviated)
================================================================

Akashik = federated knowledge commons for the OSS community.
Compounding via the ambitioned-curator loop:
  local-first → federation-fan-out → web-on-miss → save-locally
  → transfer-to-next-asker (when ambitioned curator is online).
Each peer holds only its own contributions + pulled items + own
research. No global graph. No central server. Curiosity drives
the working set. R(T,t) monotonically non-decreasing.

Empirical state (full numbers in Round 4 brief):
  LME-S R@5 = 0.9202, NDCG@5 = 0.884, MRR = 0.903 — head saturated
  LoCoMo R@3 = 0.392, R@30 = 0.993 — 60pp rerank headroom unmined
  E11 contextual enrichment: +0.66pp LME-S, +0.9-2.7pp LoCoMo
  Small-LLM listwise (qwen 1.5b/3b/7b) with shuffle fix:
    quality below bi-encoder at 8-q spot-check
  Cross-encoder rerank on LME-S: clean null (bge AND ms-marco)

================================================================
DIRECT-ANSWER REQUIREMENTS — Q1 through Q8
================================================================

Q1 — Where should the next engineering month go: marketing
     R@5-mining toward agentmemory's 0.952, or architecting the
     federation rather than per-peer retrieval?
     >> Pick one. One paragraph rationale.

Q2 — Is the Akashik 'ambitioned-curator + curiosity-driven cache'
     mechanism architecturally novel, or a known pattern in
     disguise?
     >> Name the closest prior-art system or paper (arxiv ID,
     repo URL, or RFC). If novel, name the closest neighbour.
     If not, explain how to position against it.

Q3 — There is no public benchmark for federation-level
     compounding. Propose one.
     >> Concrete experimental design: dataset choice, metrics,
     simulation protocol, what 'compounding' means
     quantitatively. Should be runnable on commodity hardware
     within ~one week of dev.

Q4 — Other known evaluation pitfalls we're probably hitting:
     >> Three specific pitfalls beyond input-order bias and
     metric blindness. Each with a one-sentence fix.

Q5 — Smallest-viable launch plan that produces visible
     compounding in 30 days.
     >> Specific communities to seed (named OSS groups, not
     categories), specific seed content (named papers/repos),
     specific timeline. ~100 first contributors.

Q6 — Failure modes of curiosity-driven propagation:
     (a) popularity cascade (record stays diverse?)
     (b) niche knowledge evaporation
     (c) adversarial misinformation flood
     >> One known system that solved each, and the mechanism.

Q7 — REAL competitors (not categories). Pick the 2-3 specific
     existing systems that Akashik most directly competes with /
     extends / supersedes. Among:
       Are.na · Logseq P2P sync · Mastodon · arxiv · Wikipedia ·
       Roam · IPFS · hypercore · Bluesky/ATProto · mem0 ·
       agentmemory · ByteRover · Letta · LangMem
     >> Pick the 2-3 most informative comparisons + 1-line
     positioning against each.

Q8 — Strongest counter-argument against the entire project.
     >> One devastating argument someone could make at a YC
     interview, OSS forum, or HN comment thread. Plus a
     one-paragraph honest response we'd give.

================================================================
HONEST FINAL ASSESSMENT
================================================================

End with: 'If I were Sahar, the next engineering month I'd spend
on [X] because [why]. The next marketing/launch month I'd spend
on [Y] because [why]. Specifically NOT [Z] because [why not].'

3 sentences. Be direct.

<external-cli-output provider="gemini" trust="untrusted">
Here is the focused synthesis of the research findings, addressing the problem space, evaluating technical feasibility, and directly answering Q1–Q8 with balanced architectural analysis and compliance awareness.

### 1. Key Findings (Direct Answers to Q1–Q8)

**Q1 — Where should the next engineering month go?**
The next engineering month must be spent on **architecting the federation and its measurement infrastructure (AkashikBench-F)**. The empirical data confirms the LME-S head is saturated (R@50=1.000, ~4pp NDCG headroom). Chasing the final 2-3pp to match `agentmemory`'s 0.952 is a vanity metric for a single-user memory product, which Akashik is no longer. The core differentiator is network compounding. Conversely, the tradeoff of abandoning single-peer tuning is leaving 60pp of factual headroom on LoCoMo unmined, meaning local retrieval may remain noisy. However, building the federation layer (CRDT sync, query fan-out) and measuring the `web_fallback_rate` is the only way to empirically validate the actual "knowledge commons" thesis.

**Q2 — Is the Akashik mechanism architecturally novel?**
The mechanism is compositionally novel, but builds entirely upon established primitives. The closest prior art for the monotonic caching property is **Freenet** (Clarke et al., 2001, [PDF](https://www.cs.princeton.edu/courses/archive/fall11/cos518/papers/freenet.pdf)), which formally described demand-driven transparent lazy replication. For identity and repositories, the closest neighbor is **AT Protocol**. Position Akashik as: *"Freenet-style demand-shaped replication applied to attributed semantic research memory, utilizing AT Protocol-style DID signatures."* The advantage is a strong lineage to Freenet's caching math and ATProto's identity model; however, the tradeoff is that unlike AT Protocol's always-on server relays, Akashik's device-level P2P suffers severe cold-start availability and relies heavily on unpredictable individual node uptime.

**Q3 — Propose a benchmark for federation-level compounding.**
Propose **AkashikBench-F** (Federated Compounding Benchmark).
*   **Experimental Design:** Use a frozen snapshot of an OSS dataset (e.g., BEIR SciFact or `snap-research/locomo` arXiv:2402.17753). Partition into N=10 strictly disjoint peer shards. Simulate a Zipfian query stream over time with a 20% offline churn rate. On a miss, the peer utilizes a controlled oracle web corpus, saves the result locally, and subsequent queries test propagation.
*   **Metrics:** `web_fallback_rate(t)` and `Propagation Half-Life` (median time until a newly acquired fact reaches 50% peer coverage). Compounding is defined quantitatively as the negative slope of the `web_fallback_rate` over the simulation.
*   **Tradeoff:** This directly measures the network's learning curve. On the other hand, simulated query streams are sterile and rarely match the adversarial semantic drift of real users, potentially overstating compounding compared to a real live network.

**Q4 — Other known evaluation pitfalls we're hitting.**
1.  **Availability Confounding:** Always-online assumptions falsely inflate federation quality; *fix by introducing a probabilistic 20-50% peer churn/offline rate and bounded timeouts during evaluation.*
2.  **Corpus Contamination:** Benchmarking with overlapping seed corpora makes basic deduplication look like genuine knowledge transfer; *fix by strictly enforcing entirely disjoint initial seeding across peers.*
3.  **Apples-to-Oranges Competitor Baselines:** `mem0` (0.925) and `ByteRover` (0.928) use LLM-as-judge or E2E extraction rather than pure retrieval; *fix by reporting retrieval-only and LLM-judge metrics in explicitly separate tables.*

**Q5 — Smallest-viable launch plan (30 days).**
Seed the **local-AI/agent-tooling ecosystem** (specifically `llama.cpp` + `ollama`, `vllm-project/vllm`, and `aider` contributors).
*   **Seed content:** 50-80 canonical artifacts like GitHub issues on CUDA OOM errors, PRs, and relevant papers.
*   **Timeline:** Week 1: 5-10 "librarian" maintainers seed the graph. Week 2: Onboard 80-90 early adopters. Week 3: Run organic debugging queries. Week 4: Publish the `web_fallback_rate` drop.
*   **Tradeoff:** This narrow wedge guarantees high query overlap, making compounding visible quickly. Conversely, it temporarily pigeonholes Akashik as a niche debugging tool rather than a broad knowledge commons, which could stall wider OSS adoption.

**Q6 — Failure modes of curiosity-driven propagation.**
1.  **(a) Popularity cascade:** Solved by **BitTorrent's rarest-first piece selection** (Legout et al., arXiv:cs/0609026); *mechanism:* weight federation fan-out by inverse document frequency to prioritize scarce records. *Tradeoff:* increases diversity but risks suppressing the genuinely best popular answer.
2.  **(b) Niche knowledge evaporation:** Solved by **LOCKSS** ("Lots of Copies Keep Stuff Safe"); *mechanism:* room-level pinning or rarity-aware replication quotas for rare nodes. *Tradeoff:* preserves the long tail but increases local storage overhead and governance burdens.
3.  **(c) Adversarial misinformation flood:** Solved by **Bluesky/AT Protocol labelers** (or Wikipedia verifiability norms); *mechanism:* composable moderation labels attached to DIDs to compute local trust scores. *Tradeoff:* combats spam, but managing a decentralized auth error taxonomy raises governance costs and complicates enterprise SOC2 compliance.

**Q7 — REAL competitors.**
1.  **Are.na**: Closest *product* competitor. *Positioning:* Are.na is what Akashik looks like centralized; Akashik is Are.na where blocks are queryable via vector search, locally owned, and propagate peer-to-peer.
2.  **AT Protocol (Bluesky)**: Closest *protocol* analogue. *Positioning:* AT Protocol solved federated identity for social posts; Akashik is AT Protocol for semantic research memory with demand-shaped retrieval.
3.  **agentmemory**: Closest *current benchmark* rival. *Positioning:* agentmemory wins single-player retrieval; Akashik extends that baseline local memory into cross-peer transfer and network compounding.
*   **Tradeoff:** Are.na offers superior curation UX, and AT Protocol offers mature federation/identity; however, neither combines semantic retrieval with a web-on-miss compounding loop.

**Q8 — Strongest counter-argument against the entire project.**
*   **Counter-argument:** "You are adding a flaky, mostly-offline federation hop in front of systems that already solve knowledge sharing better (Stack Overflow, GitHub, Google). Because peers are mostly offline laptops, users will miss locally, peers will time out, and Akashik will collapse into a slower 'web search plus personal cache', meaning the federated network effect is a complete illusion."
*   **Response:** That critique is devastatingly valid unless we can demonstrate a dense room where the `web_fallback_rate` materially drops over 30 days and cross-peer transfers happen faster than fresh web research. Our architecture mitigates the cold-start problem because the local-first web-fallback loop is highly useful on day 1 for the individual. The tradeoff is brutal, however: if the first pilot fails to show repeated miss-to-hit conversions across different users under real churn, the federated-commons thesis is empirically disproven, and the product devolves into local-first memory sync.

---

### 2. Patterns & Consensus
*   **Write-path Interventions Work:** Prepending structured metadata (E11) consistently improves recall at zero query-time cost.
*   **Bi-Encoder Dominance:** Small local LLMs for listwise reranking repeatedly failed to beat the bi-encoder baseline on factual subsets, confirming that the current architecture has reached the practical limit of local-only read-path retrieval tuning.

### 3. Conflicts & Trade-offs
*   **Compliance & Enterprise Viability vs. Immutable Provenance:** For B2B/enterprise contexts, Akashik's "signed and attributed forever" model fundamentally conflicts with GDPR right-to-erasure (Article 17). If a peer deletes a node containing PII, tombstones must propagate reliably across the P2P graph. Furthermore, for SOC2 Type II compliance, enterprise customers require evidence of access control, audit trails, and data residency; Akashik's gossip-first federation lacks an explicit central audit trail of who queried what proprietary IP, risking accidental exfiltration.

### 4. Gaps
*   **Federated Measurement:** Zero active integration tests demonstrate multi-peer compounding or measure real-world latency bounds during network saturation.
*   **Misinformation & Quarantine:** The architecture lacks a "quarantine table" for nodes that fail semantic validity checks or are flagged by community labelers, leaving the network vulnerable to semantic adversarial attacks.

### 5. Priority Matrix

| Initiative | Impact | Effort | Priority |
| :--- | :---: | :---: | :---: |
| **AkashikBench-F Harness (Federation Eval)** | High | Medium | **High** |
| **`web_fallback_rate` Telemetry Pipeline** | High | Low | **High** |
| **Launch 100-user OSS Pilot (local-AI)** | High | High | **Medium** |
| **Tombstone Propagation (GDPR/Compliance)** | Medium | High | **Medium** |
| **LME-S R@5 further tuning** | Low | Medium | **Low** |

### 6. Recommended Approach

If I were Sahar, the next engineering month I'd spend on AkashikBench-F and federation routing because validating the compounding network effect is the only way to prove the product's core differentiator. The next marketing/launch month I'd spend on a 100-person pilot seeded in the local-AI/agent-tooling OSS ecosystem because their high-frequency debugging queries will make compounding visible and measurable within 30 days. Specifically NOT chasing the final 3pp of R@5 on LongMemEval-S because it chases a mathematical ceiling for a single-user metric, which distracts from the federated mission.
</external-cli-output>

---
*Synthesized from 6 research threads (task group: 1779807221)*
