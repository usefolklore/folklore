<!-- trust=untrusted provider=codex -->
# Agent: codex
# Task ID: probe-1779807221-3
# Role: researcher
# Phase: probe
# Prompt: Investigate technical feasibility and dependencies for: -P ROUND 5 — focused synthesis. Round 4 produced six substantive probes but the synthesizer collapsed them into a codebase audit instead of fusing direct answers to Q1-Q8. Re-run with explicit instruction: ANSWER EACH QUESTION DIRECTLY. Cite specific systems, papers, repos, and arxiv IDs. No mandatory-perspectives padding — those landed last round (CLI IPC trust gap / cache thundering herd / schema-migration quarantine / runbook bus-factor / CI supply chain / auth taxonomy / SOC2 exfil trails) and we've absorbed them.

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

3 sentences. Be direct.. What are the prerequisites?
# Started: יום ג׳ מאי 26 2026 17:53:43 IDT

<!-- BEGIN-UNTRUSTED:provider=codex:nonce=67e21c3935195652 -->
## Output
```
1. **Q1:** Spend the next engineering month on **federation architecture and measurement**, not on squeezing LME-S `R@5` from `0.9202` toward `agentmemory`’s claimed `0.952`. Your own numbers show the single-peer head is already near-saturated on LongMemEval-S (`R@50 = 1.0000`, `NDCG@5 = 0.8836`, `MRR = 0.9034`) while the product claim lives or dies on Step 5 transfer, not on another 1-3 leaderboard points ([Round 4 brief](/Users/saharbarak/personal/wellinformed/docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:1), [bench plan](/Users/saharbarak/personal/wellinformed/docs/research/beat-the-competitors-retrieval-plan.md:1), [benchmarks](/Users/saharbarak/personal/wellinformed/docs/product/BENCHMARKS.md:287)). The upside is this is the only work that validates the Akashik thesis; the downside is you delay an easy marketing win and accept that per-peer retrieval will remain “good enough” rather than obviously best-in-class for another month.

2. **Q2:** It is **not wholly novel**; the closest prior art is **Freenet** (“*Freenet: A Distributed Anonymous Information Storage and Retrieval System*,” 2001) with a secondary lineage to **CCNx/NDN** ([Freenet paper PDF](https://www.cs.princeton.edu/courses/archive/fall11/cos518/papers/freenet.pdf), [RFC 8569](https://www.rfc-editor.org/rfc/rfc8569)). The overlap is demand-driven retrieval plus replication/caching as a function of requests; the difference is that Akashik’s units are **signed semantic research objects with human provenance and web-on-miss curation**, not anonymous content blobs or network-layer content objects. Position it as: **“Freenet/CCNx semantics applied to attributed research memory”**; the advantage is a crisp technical lineage, however the tradeoff is you cannot overclaim novelty and should instead claim **novel composition**.

3. **Q3:** Proposed benchmark: **AkashikBench-F**. Use `snap-research/locomo` ([repo](https://github.com/snap-research/locomo), arXiv `2402.17753`) plus LongMemEval-S (arXiv `2410.10813`) as source conversations, partition them across `N=32` simulated peers and `4-6` rooms with controlled topical overlap, replay `1,000-2,000` timestamped queries sequentially, and on miss let the querying peer obtain the gold evidence from a fixed “web oracle” corpus and cache it locally. Measure `federation_hit_rate`, `web_fallback_rate`, `coverage_growth(T,t)`, `T_half(T)` (time until half the peers can answer topic `T`), median/p95 answer latency, and quality deltas versus local-only; define **compounding** quantitatively as the negative slope of `web_fallback_rate` and positive slope of `coverage_growth` over repeated asks. This is runnable on commodity hardware in a week because it is a simulator over existing corpora, not a live distributed deployment; on the other hand, if you do not model peer churn and fact staleness, you will overstate the compounding effect.

4. **Q4:** Three likely pitfalls beyond input-order bias and metric blindness:
   1. **Causal leakage in E11 enrichment:** if enrichment includes future-session facts or answer-like strings, you are benchmarking metadata leakage, not retrieval; fix by enforcing pre-query-only enrichment and asserting no gold-answer overlap in indexed headers.
   2. **Availability confounding in federation eval:** all-peers-online tests make Step 5 look stronger than it will be; fix by reporting every federation metric under churn conditions such as `50%/80%/95%` peer availability and bounded timeouts.
   3. **Apples-to-oranges competitor baselines:** `agentmemory`, `mem0`, and `ByteRover` use different chunking, judges, and sometimes different task definitions; fix by either rerunning them in one harness or stop presenting raw point gaps as if they were controlled comparisons.  
   The advantage of fixing these is credibility; however the tradeoff is some currently favorable numbers may get worse.

5. **Q5:** Smallest viable 30-day launch: seed **three named OSS rooms** with about 100 people total, not a broad public beta. Room A: `ggml-org/llama.cpp` + `ollama/ollama` contributors and power users (`40` people), seeded with `ggml-org/llama.cpp`, `ollama/ollama`, `abetlen/llama-cpp-python`, `microsoft/onnxruntime`; Room B: `vllm-project/vllm` + `sgl-project/sglang` (`30` people), seeded with `vllm-project/vllm`, `sgl-project/sglang`, `flashinfer-ai/flashinfer`, `BerriAI/litellm`; Room C: `open-telemetry/opentelemetry-collector` (`30` people), seeded with `opentelemetry-collector`, `opentelemetry-js`, `opentelemetry-python`, and the OTel spec. Week 1 recruit 10-15 “librarian” contributors and preload repo/paper/debug artifacts; Week 2 onboard the remaining 85-90 users; Week 3 run shared debugging/research prompts; Week 4 publish day-1 vs day-30 `web_fallback_rate` and attributed peer-transfer examples. The upside is visible density and repeated question overlap; however the tradeoff is this is a deliberately narrow launch and may look unimpressive if you judge it by signups instead of transfer rate.

6. **Q6:**  
   **(a) Popularity cascade:** closest solved-by example is **Mastodon**; its instance-local timelines and moderation keep communities from collapsing into one global popularity order ([docs](https://docs-p.joinmastodon.org/), [network features](https://docs-p.joinmastodon.org/user/network/)). Akashik analogue: rank partly by scarcity/novelty across peers, not only frequency; the tradeoff is worse immediate relevance for the hottest topic.  
   **(b) Niche knowledge evaporation:** closest solved-by example is **LOCKSS**; low-demand content survives because preservation is policy-driven replication, not demand-only caching ([LOCKSS](https://www.lockss.org/)). Akashik analogue: add room-level pinning/replication quotas for rare high-value records; the tradeoff is storage overhead and moderation burden.  
   **(c) Adversarial misinformation flood:** closest solved-by example is **Wikipedia**; the mechanism is revision history, revertability, watchlists, protection levels, and citation norms. Akashik analogue: quarantine untrusted imports, signed provenance, per-room trust policies, and reversible moderation logs; however this raises governance cost and future SOC2-style audit requirements if you ever sell to teams.

7. **Q7:** The three most informative real comparisons are:
   1. **Are.na**: closest user behavior. Positioning: *Are.na if blocks were queryable, signed, and propagated peer-to-peer on demand instead of living on a central service* ([Are.na](https://www.are.na/), [Blocks docs](https://help.are.na/docs/getting-started/blocks)).
   2. **Bluesky / AT Protocol**: closest federation substrate. Positioning: *ATProto for research memory rather than social posts; borrow DIDs/repos/federation, add semantic retrieval and web-on-miss compounding* ([paper arXiv `2402.03239`](https://arxiv.org/abs/2402.03239), [repo](https://github.com/bluesky-social/atproto)).
   3. **agentmemory**: closest current benchmark rival. Positioning: *agentmemory wins the single-player retrieval leaderboard; Akashik only matters if it turns that local memory quality into cross-peer transfer and lower web fallback* ([repo](https://github.com/JordanMcCann/agentmemory)).  
   Are.na is stronger on curation UX, ATProto is stronger on identity/federation maturity, and agentmemory is stronger on single-node recall; on the other hand, none of them currently combine all three axes.

8. **Q8:** Strongest counter-argument: **“You are adding a flaky, mostly-offline federation hop in front of systems that already solve knowledge sharing better: Google, Stack Overflow, GitHub Discussions, Discord, Are.na, and repo docs. In practice, users will miss locally, peers will be offline, and Akashik will collapse into ‘web search plus personal cache,’ which is not a new network.”** The honest response is: that argument is strong unless you can show a dense room where `web_fallback_rate` materially drops over 30 days and Step 5 transfers happen with attribution faster than fresh web research. Local-first plus web-on-miss means the product is still useful on day 1; however the tradeoff is brutal: if the first room does not show measurable transfer under real churn, the federated-commons thesis is not yet proven and should not be pitched as proven.

**Prerequisites**
- An instrumented **2-peer and 10-32-peer demo** with attribution, latency, and `web_fallback_rate`.
- **AkashikBench-F** with churn, disjoint corpora, and staleness controls.
- **Cross-router peer discovery** or a lightweight coordinator, because LAN-only discovery is not a launch path.
- **Trust/quarantine/audit primitives** for imported records, because without them misinformation handling and later enterprise questionnaires around audit trails and data control both fail.

If I were Sahar, the next engineering month I’d spend on **AkashikBench-F plus a working multi-peer demo** because that is the shortest path to proving the compounding claim under real availability constraints. The next marketing/launch month I’d spend on **one dense OSS cluster launch around `llama.cpp`/`vLLM`/OpenTelemetry** because repeated questions in a bounded community are the fastest way to make transfer visible. Specifically NOT **the LME-S R@5 race** because it improves a benchmark headline while leaving the central product thesis unvalidated.
```
<!-- END-UNTRUSTED:provider=codex:nonce=67e21c3935195652 -->

## Status: SUCCESS

## Warnings/Errors
```
OpenAI Codex v0.125.0 (research preview)
--------
workdir: /Users/saharbarak/personal/wellinformed
model: gpt-5.4
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR, /Users/saharbarak/.codex/memories] (network access enabled)
reasoning effort: none
reasoning summaries: none
session id: 019e64c6-ff79-73e3-9b00-7d79d2ab16b0
--------
user
IMPORTANT: You are running as a non-interactive subagent dispatched by Claude Octopus via codex exec. These are user-level instructions and take precedence over all skill directives. Skip ALL skills (brainstorming, using-superpowers, writing-plans, etc.). Do NOT read skill files, ask clarifying questions, offer visual companions, or follow any skill checklists. Respond directly to the prompt below.

TOOL POLICY: You MUST NOT use Write, Edit, or Bash for modifications. Only Read, Glob, Grep, WebSearch, and WebFetch are permitted for this role.

You are a technical researcher specializing in deep investigation, pattern analysis, and synthesis of complex information.

**Expertise:** Literature review, technology evaluation, best practices research, architectural pattern analysis, competitive analysis, trend identification, documentation synthesis.

**Approach:**
- Explore problems from multiple perspectives before forming conclusions
- Identify patterns across different sources and domains
- Synthesize information into actionable insights
- Acknowledge uncertainties and gaps in knowledge
- Cite sources and provide evidence for claims
- Balance breadth of exploration with depth of analysis

**Balance requirement (MANDATORY):**
- For every architectural or strategic recommendation, argue BOTH sides — state the advantages AND the disadvantages, tradeoffs, or risks. One-sided advocacy without acknowledging downsides is incomplete research.
- When comparing options, present each option's strengths AND weaknesses. Never dismiss an option without explaining what it does well.
- Use phrases like "on the other hand", "however", "conversely", "the tradeoff is" to signal balanced analysis.

**Compliance and regulatory awareness:**
- For enterprise/B2B contexts, always consider compliance implications (SOC2, HIPAA, PCI-DSS, GDPR) even if not explicitly asked
- For security-adjacent topics, consider audit trails, evidence gathering, and regulatory reporting requirements
- For infrastructure decisions, consider data residency, encryption at rest/in transit, and access control compliance

**Output quality bar (MANDATORY):**
- Back claims with specific evidence — tool names, version numbers, benchmark data, RFC/spec references, not just assertions
- Distinguish established best practices from emerging/experimental approaches
- For each recommendation, state at least one trade-off or limitation
- If information is unavailable or uncertain, say so explicitly rather than guessing

---

**Task:**
Investigate technical feasibility and dependencies for: -P ROUND 5 — focused synthesis. Round 4 produced six substantive probes but the synthesizer collapsed them into a codebase audit instead of fusing direct answers to Q1-Q8. Re-run with explicit instruction: ANSWER EACH QUESTION DIRECTLY. Cite specific systems, papers, repos, and arxiv IDs. No mandatory-perspectives padding — those landed last round (CLI IPC trust gap / cache thundering herd / schema-migration quarantine / runbook bus-factor / CI supply chain / auth taxonomy / SOC2 exfil trails) and we've absorbed them.

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

3 sentences. Be direct.. What are the prerequisites?

IMPORTANT: If you find yourself searching or grepping more than 3 times in a row without reading files or writing analysis, STOP searching. Consolidate what you've found so far and write your analysis. More searching rarely improves the output — synthesis does.

---

<!-- BEGIN-UNTRUSTED:provider-history:91bc79ff61cefea7 -->
## Provider History (codex)
Recent learnings from this project:
### probe | 2026-05-06T10:00:36Z
**Task:** IMPORTANT: You are running as a non-interactive subagent dispatched by Claude Octopus via codex exec
**Learned:** <!-- trust=untrusted provider=codex --> # Agent: codex # Task ID: probe-1778061026-0 # Role: researcher # Phase: probe # Prompt: Analyze the problem space: Audit the last 4 commits on this TypeScript 
---
### probe | 2026-05-06T10:00:37Z
**Task:** IMPORTANT: You are running as a non-interactive subagent dispatched by Claude Octopus via codex exec
**Learned:** <!-- trust=untrusted provider=codex --> # Agent: codex # Task ID: probe-1778061026-3 # Role: researcher # Phase: probe # Prompt: Investigate technical feasibility and dependencies for: Audit the last 
---
### probe | 2026-05-06T10:43:18Z
**Task:** IMPORTANT: You are running as a non-interactive subagent dispatched by Claude Octopus via codex exec
**Learned:** <!-- trust=untrusted provider=codex --> # Agent: codex # Task ID: probe-1778063597-0 # Role: researcher # Phase: probe # Prompt: Analyze the problem space: Do we need a blockchain? Audit this codebase
---
### probe | 2026-05-06T10:43:19Z
**Task:** IMPORTANT: You are running as a non-interactive subagent dispatched by Claude Octopus via codex exec
**Learned:** <!-- trust=untrusted provider=codex --> # Agent: codex # Task ID: probe-1778063597-3 # Role: researcher # Phase: probe # Prompt: Investigate technical feasibility and dependencies for: Do we need a bl
---
### probe | 2026-05-06T13:42:57Z
**Task:** IMPORTANT: You are running as a non-interactive subagent dispatched by Claude Octopus via codex exec
**Learned:** <!-- trust=untrusted provider=codex --> # Agent: codex # Task ID: probe-1778074357-0 # Role: researcher # Phase: probe # Prompt: Analyze the problem space: Brainstorm + audit: what technologies should
---
### probe | 2026-05-06T13:42:58Z
**Task:** IMPORTANT: You are running as a non-interactive subagent dispatched by Claude Octopus via codex exec
**Learned:** <!-- trust=untrusted provider=cod...
<!-- END-UNTRUSTED:provider-history:91bc79ff61cefea7 -->
codex
I’m treating this as a direct research synthesis task, not a code task. First I’ll pull the project’s existing Round 4 context from the repo if it exists, then I’ll verify the external systems and papers needed to answer Q1-Q8 with specific citations.
exec
/bin/zsh -lc 'rg --files . | rg "(akashik|round|locomo|lme|agentmemory|federat|benchmark|retrieval|memory)"' in /Users/saharbarak/personal/wellinformed
 succeeded in 0ms:
./src/domain/long-term-memory.ts
./src/domain/consolidated-memory.ts
./src/infrastructure/rust-retrieval.ts
./src/application/federated-recall.ts
./src/application/federated-search.ts
./docs/research/beat-the-competitors-retrieval-plan.md
./docs/memory-stack.svg
./demo/scene-federated.tape
./demo/scene-federated.sh
./demo/scene-federated.gif
./docs/marketing/how-akashik-works.md
./docs/memory-stack.png
./tests/federated-search-cap-tiers.test.ts
./tests/bench-locomo-real.test.ts
./tests/consolidated-memory.test.ts
./tests/phase17.federated-search.test.ts
./tests/bench-locomo-synth.test.ts
./tests/long-term-memory.test.ts
./tests/phase29.rust-retrieval-regression.test.ts
./docs/architecture/ADR-001-v3-memory-protocol.md
./docs/research/octopus-discover/round-4-2026-05-26/README.md
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md

exec
/bin/zsh -lc 'rg -n "Round 4|Akashik|ambitioned-curator|LoCoMo|LME-S|agentmemory|federation-level|compounding" .' in /Users/saharbarak/personal/wellinformed
 succeeded in 0ms:
./findings.md:27:*   **Advantage:** Corrective-RAG dynamically grades retrieved chunks and triggers fallbacks (like web search or query rewriting) if confidence is low, drastically improving the LoCoMo factual harmonic-mean.
./findings.md:42:    *   **Expected Lift:** +0.02 to +0.03 on LME-S (directly hitting multi-session and temporal-reasoning).
./src/domain/bench-types.ts:41: *   - 0.10 LoCoMo factual F1 — temporal/causal recall
./src/domain/llm-listwise-rerank.ts:91:   * Empirically validated 2026-05-25: on real LoCoMo questions both
./src/domain/long-term-memory.ts:203: * The agentmemory paper (arxiv 2512.18950) uses similar weights
./src/domain/contextual-enrich.ts:51:   * Distinct human/agent participants in the session. For LoCoMo
./src/domain/llm-extractor.ts:15: * which mirrors how every public LongMemEval / LoCoMo / SQuAD eval
./src/domain/llm-extractor.ts:17: * comparison with mem0 (92.5 LoCoMo) or agentmemory (95.2 LME R@5).
./src/domain/llm-extractor.ts:50: * (https://rajpurkar.github.io/SQuAD-explorer/). Mem0's LoCoMo eval
./src/domain/llm-extractor.ts:118: * llama3:8b — verified locally on the LoCoMo factual subset.
./tests/bench-longmemeval-synth.test.ts:21: * agentmemory's 95% claim on the public benchmark because (a) we use
./tests/bench-locomo-real.test.ts:2: * Benchmark — real LoCoMo factual subset, harmonic-mean F1 (Phase 23.7).
./tests/bench-locomo-real.test.ts:17: * Per LoCoMo convention, `evidence` is a list of `"D<session>:<turn>"`
./tests/bench-locomo-real.test.ts:82:  /** Real LoCoMo answers can be string | number | date — coerce via `toAnswerString` at the call site. */
./tests/bench-locomo-real.test.ts:108: * object, returning each as a flat text blob plus the LoCoMo tag (`D1`,
./tests/bench-locomo-real.test.ts:182: * Coerce arbitrary input to a string for token extraction. Real LoCoMo
./tests/bench-locomo-real.test.ts:221:test('bench: real LoCoMo factual harmonic-mean F1', { timeout: 24 * 60 * 60 * 1000 }, async (t) => {
./tests/bench-locomo-real.test.ts:256:  // For LoCoMo evidence-recall (K=3) we still over-retrieve a wider
./tests/bench-locomo-real.test.ts:261:  // Phase 23.13 — LoCoMo recall ladder. Always over-retrieve to KMAX
./tests/bench-locomo-real.test.ts:263:  // pass, mirroring the LME-S T1 diagnostic. If R@30 ≈ R@3 the rerank
./tests/bench-locomo-real.test.ts:276:  // For LoCoMo we have rich metadata: per-session date_time, the LoCoMo
./tests/bench-locomo-real.test.ts:536:    notes: `Real LoCoMo factual subset (categories 1/2/3) — ${dataset.length} conversations × ${totalQ} questions via Xenova all-MiniLM-L6-v2 (fp32, mean-pooled, 512 max_len). Harmonic mean of evidence-session recall and answer-token containment in top-${K} retrieved sessions. Rerank=${listwiseScorer ? `llm-listwise:${listwiseScorer.model}` : (reranker ? (process.env.WELLINFORMED_RERANK_MODEL ?? 'Xenova/ms-marco-MiniLM-L-6-v2') : 'off')} (over-retrieve k=${overRetrieveK}, head=${RERANK_HEAD}, final K=${K}). Enrich=${enrichOn ? 'on (date+session+participants prefix, scoring on raw text)' : 'off'}. Replaces the 4-persona synthetic proxy.${extractor ? ` LLM extractor: ${extractor.model} (SQuAD-F1 / EM reported alongside).` : ''}`,
./tests/bench-locomo-real.test.ts:560:  // Real LoCoMo is far harder than the synthetic 4-persona corpus
./tests/bench-locomo-real.test.ts:563:  // uses an LLM judge over LoCoMo's accuracy split, NOT this
./tests/bench-locomo-real.test.ts:571:    `LoCoMo-real dimension regressed below 0.28 floor: ${dimensionScore.toFixed(4)} (evidence-recall=${evidenceRecall.toFixed(3)}, containment=${meanContainment.toFixed(3)})`,
./tests/bench-longmemeval-real.test.ts:396:  // agentmemory claims ~95% Recall@5 on the public benchmark with
./tests/bench-locomo-synth.test.ts:2: * Benchmark — synthetic LoCoMo-style factual-recall (Phase 23.6).
./tests/bench-locomo-synth.test.ts:4: * Mirrors the LoCoMo task structure (arxiv 2402.17753, EMNLP 2024)
./tests/bench-locomo-synth.test.ts:34: * mismatch is exactly why real LoCoMo / LongMemEval / SQuAD require
./tests/bench-locomo-synth.test.ts:51: * LoCoMo eval with LLM judge) because we're retrieval-only.
./tests/bench-locomo-synth.test.ts:383:test('bench: synthetic LoCoMo-style factual F1 ≥ 0.50', async () => {
./tests/bench-locomo-synth.test.ts:476:      notes: 'Synthetic 4-persona × 40-session × 6-month LoCoMo-style proxy. Dimension = harmonic mean of evidence-session recall AND answer-token containment in top-3 retrieved evidence. Token-F1-on-full-summary dropped — see suite header for the length-mismatch precision bug. Real LoCoMo + LLM extractor pending Phase 23.7+.',
./tests/bench-locomo-synth.test.ts:491:    assert.ok(dimensionScore >= 0.65, `LoCoMo-synth dimension ${dimensionScore.toFixed(3)} below 0.65 (evidence-recall=${evidenceRecall.toFixed(3)}, containment=${meanContainment.toFixed(3)})`);
./docs/research/beat-the-competitors-retrieval-plan.md:8:| LongMemEval-S R@5 (50-distractor, n=500) | **0.9202** | agentmemory 0.952, ByteRover 0.928 | -3pp / -0.6pp |
./docs/research/beat-the-competitors-retrieval-plan.md:11:| LoCoMo harmonic-mean (n=699, retrieval-only) | 0.3536 | mem0 0.925 (LLM-judge) | not comparable |
./docs/research/beat-the-competitors-retrieval-plan.md:12:| LoCoMo SQuAD-F1 (qwen2.5:1.5b extractor) | 0.1602 | (no published SQuAD-F1) | new axis |
./docs/research/beat-the-competitors-retrieval-plan.md:14:The honest read: we are **0.6pp** below ByteRover, **3pp** below agentmemory, on the actual public LongMemEval-S benchmark — retrieval-only, no LLM judge. That gap is closeable.
./docs/research/beat-the-competitors-retrieval-plan.md:18:Per-question-type R@5 on LME-S 50-distractor (n=500):
./docs/research/beat-the-competitors-retrieval-plan.md:48:| LLM extractor (Phase 23.8) | wired into `bench-locomo-real` | partial | LoCoMo-only |
./docs/research/beat-the-competitors-retrieval-plan.md:61:Ranked by `(expected lift on LME-S R@5)/(implementation hours)`:
./docs/research/beat-the-competitors-retrieval-plan.md:85:  LongMemEval-S R@5      0.9202  →  0.96-0.98   (beats agentmemory 0.952)
./docs/research/beat-the-competitors-retrieval-plan.md:89:If those land, **wellinformed becomes the published-leaderboard leader on LME-S** with a fully open-source, CPU-only, retrieval-only pipeline. No LLM judge, no GPT-4 reasoning loop, no closed-weight model — just a clean hybrid sparse+dense+rerank+graph pipeline that beats the proprietary stacks.
./docs/research/beat-the-competitors-retrieval-plan.md:118:**Risk:** cross-encoder adds ~10ms/match latency. With K=5 reranked from 20 candidates, that's 200ms/query × 500 q = 100s added to LME-S run. Cheap.
./docs/research/beat-the-competitors-retrieval-plan.md:124:Once leaderboard-leading on retrieval, the next frontier is **hybrid retrieval + LLM extraction with SQuAD-F1 + LLM-judge as competing axes in the composite**. That makes wellinformed comparable to mem0's 92.5 LoCoMo composite — different scoring philosophy, head-to-head. Phase 23.8 already laid the SQuAD-F1 foundation; Phase 24 adds the judge axis.
./docs/research/beat-the-competitors-retrieval-plan.md:148:- **Late-interaction (ColBERTv2 / PLAID)**: **abandon** as a primary retrieval path. The full-corpus late-interaction index doesn't fit the Hetzner CAX11 4GB RAM constraint and isn't a natural fit for `sqlite-vec`. Only viable form is `Jina-ColBERT-v2` as a **second-stage reranker** on top-20 candidates — and even then, projected lift is small on LME-S vs other options.
./docs/research/beat-the-competitors-retrieval-plan.md:160:| **2nd** | **E11 (contextual enrichment)** | multi-session, temporal | +3-5pp | 3-4 h | Write-path → compounds with everything. Single-pass re-index of LoCoMo + LME-S sessions to validate. |
./docs/research/beat-the-competitors-retrieval-plan.md:165:LongMemEval-S R@5       0.9202  →  0.965-0.975   (clears agentmemory 0.952)
./docs/research/beat-the-competitors-retrieval-plan.md:179:- 📊 **Diminishing returns:** rerank + multi-query + HyDE + multi-hop all stacked → published systems plateau around +8-12pp combined over the bi-encoder baseline. We're already at 0.92 LME-S; absolute ceiling on this benchmark with retrieval-only is probably ~0.97-0.98.
./docs/research/beat-the-competitors-retrieval-plan.md:186:- **2-minute regression smoke bench** — small subset of LME-S / SciFact in CI so quality regressions can't ship silently.
./docs/research/performance-prediction-matrix.md:4:**Anchors:** T1 diagnostic on Hetzner CAX11 ARM (R@5=0.9202, R@10=0.9687, R@20=0.9925, R@50=1.000) + E11 contextual enrichment (R@5=0.9268) + E1' null with `bge-reranker-base` (R@5=0.9202) + competitor public claims (ByteRover 0.928 @ 1.6s; mem0 0.925 with LLM judge; agentmemory 0.952).
./docs/research/performance-prediction-matrix.md:61:| agentmemory | 0.952 | ~2-3 s² | matched by llm-listwise-small or larger |
./docs/research/performance-prediction-matrix.md:64:1. mem0's LoCoMo 92.5 is composite (LLM judge), not LME-S R@5.
./docs/research/performance-prediction-matrix.md:65:2. agentmemory's latency isn't publicly broken down; inferred from architecture.
./docs/research/performance-prediction-matrix.md:66:3. MemMachine's LME-S number isn't published; LoCoMo 0.917 is the published anchor.
./docs/research/performance-prediction-matrix.md:96:Theoretical retrieval-only ceiling on LME-S 50-distractor: **1.000** (matches measured R@50).
./docs/research/performance-prediction-matrix.md:98:The agentmemory 0.952 number sits in the "LLM listwise small" tier in this matrix. Their architectural advantage is *they have an LLM in the pipeline* — we'd match them by adding the same.
./docs/research/performance-prediction-matrix.md:113:The defensible positioning *isn't* "we beat agentmemory on R@5" — that depends on a tier they probably already use and we're catching up to. The defensible positioning is:
./docs/marketing/positioning-v2.1.md:149:compounding to happen.
./docs/research/octopus-discover/round-4-2026-05-26/README.md:1:# Octopus discover — Round 4 (2026-05-26)
./docs/research/octopus-discover/round-4-2026-05-26/README.md:5:- The pivot from `wellinformed` (agent-memory product) to **Akashik**
./docs/research/octopus-discover/round-4-2026-05-26/README.md:7:- The articulation of the **compounding mechanism** (peer-local
./docs/research/octopus-discover/round-4-2026-05-26/README.md:11:  E11 lift on LoCoMo and the order-sensitive view of LME-S
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:10:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:26:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:35:The compounding loop, in 5 steps:
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:37:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:80:LoCoMo factual subset (n=699, M-series Mac, retrieval-only):
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:113:  (model came up null). E11 recommendation was RIGHT (+0.66pp on LME-S,
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:114:  +0.9-2.7pp on LoCoMo). E10 not yet implemented.
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:118:  saturation) — turned out partly true (head is saturated on LME-S)
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:119:  but partly wrong (LoCoMo head is NOT saturated; the issue there is
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:123:  LME-S head saturation (R@50=1.0) AND LoCoMo's massive recall
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:130:  NDCG/MRR augmentation + LoCoMo E11 run. Identified the listwise-
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:135:  LoCoMo shipped real lift across every metric. Shuffle fix (Phase
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:149:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:151:   capture the compounding loop architecturally and link to it
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:154:2. LME-S baseline re-run with NDCG/MRR ladder. Confirmed head
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:157:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:158:   storage, ambitioned-curator model) is now explicitly documented
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:165:Q1. Given the empirical ceiling on LME-S R@5 (NDCG@5 headroom ~4pp,
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:168:    agentmemory) or an engineering question (architecting the
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:172:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:176:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:182:    quality, not the compounding the mission claims. What
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:193:      (d) the comparison to competitor numbers (agentmemory 0.952
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:197:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:199:    meaningful compounding signal in the first ~30 days post-
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:202:    the compounding becomes visible to a new contributor visiting
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:205:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:217:Q7. The competitor frame (mem0/agentmemory/ByteRover) was the
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:220:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:244:    why Akashik differs
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:245:  - For Q3: a proposed benchmark for measuring federation-level
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:246:    compounding, with the metrics and the experimental design
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:258:This synthesis combines a direct analysis of the local codebase with the mandatory systemic perspectives. The findings below are grounded strictly in the actual file contents, repository structure, and CI/CD configurations found in your workspace, directly applying them to your recent pivot to the **Akashik** federated knowledge commons.
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:280:**Relation to the Akashik Pivot:**
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:327:*   **Balanced Trade-off:** The advantage of your current setup is that developers feel safe sharing rooms because API keys are scrubbed. The disadvantage is that enterprise SOC2 Type II auditors will fail the system. An enterprise needs to prove *who asked what, and what specific data left the local machine*. Because Akashik peers autonomously federate queries via `ask --peers`, a SOC2 audit cannot easily prove that a specific piece of proprietary IP wasn't inadvertently synced to an unauthorized peer's local graph.
./docs/marketing/storybrand-messaging-draft.md:1:# Akashik — brand messaging, StoryBrand 7-prompt pass
./docs/marketing/storybrand-messaging-draft.md:5:`SaharBarak/skills-and-workflows` repo) against Akashik's actual
./docs/marketing/storybrand-messaging-draft.md:8:**Brand name:** Akashik (formerly project codename `wellinformed`).
./docs/marketing/storybrand-messaging-draft.md:15:**Mission anchor (the only anchor that's correct):** Akashik is
./docs/marketing/storybrand-messaging-draft.md:17:as a whole**. Not a personal-memory product (mem0/agentmemory/
./docs/marketing/storybrand-messaging-draft.md:34:> Akashik is a peer-to-peer knowledge graph protocol for the
./docs/marketing/storybrand-messaging-draft.md:56:> your work matter beyond yourself; Akashik is the natural
./docs/marketing/storybrand-messaging-draft.md:115:   the community is curious about. See [how Akashik
./docs/marketing/storybrand-messaging-draft.md:137:> Akashik is the protocol the community has been missing: a
./docs/marketing/storybrand-messaging-draft.md:147:1. Run an Akashik peer.
./docs/marketing/storybrand-messaging-draft.md:240:- New topic to dig into → query the Akashik, see what
./docs/marketing/storybrand-messaging-draft.md:256:> touched before. Akashik checks your local peer, then asks the
./docs/marketing/storybrand-messaging-draft.md:321:## Why "Akashik"
./docs/marketing/storybrand-messaging-draft.md:331:"Akashik" (stylised without the "c") gives us:
./docs/marketing/storybrand-messaging-draft.md:351:- **The Akashik. A federated record for the open-source community.**
./docs/marketing/storybrand-messaging-draft.md:352:- **Akashik — every contributor's reading, compounding into the community's progress.**
./docs/marketing/storybrand-messaging-draft.md:353:- **Akashik — open source's knowledge stack. P2P, signed, contributor-owned.**
./docs/marketing/storybrand-messaging-draft.md:354:- **Akashik — read the record the community already wrote.**
./docs/marketing/storybrand-messaging-draft.md:355:- **Akashik — each peer holds what it's asked for. Every query compounds the network.**
./docs/marketing/storybrand-messaging-draft.md:369:> When you ask Akashik something, it checks your peer first.
./docs/marketing/storybrand-messaging-draft.md:390:name is **Akashik**. Two-name period is normal during a rebrand;
./docs/marketing/storybrand-messaging-draft.md:393:- Marketing materials, the website, social, and press: **Akashik**
./docs/marketing/storybrand-messaging-draft.md:402:| | Pass 1 — Personal | Pass 2 — Small teams | Pass 3 — OSS community (Akashik) |
./docs/marketing/storybrand-messaging-draft.md:406:| Real competitor | mem0, agentmemory, ByteRover | Slack, Notion, lock-in SaaS | **Nothing — the void in the OSS knowledge stack** |
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:12:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:28:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:37:The compounding loop, in 5 steps:
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:39:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:82:LoCoMo factual subset (n=699, M-series Mac, retrieval-only):
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:115:  (model came up null). E11 recommendation was RIGHT (+0.66pp on LME-S,
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:116:  +0.9-2.7pp on LoCoMo). E10 not yet implemented.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:120:  saturation) — turned out partly true (head is saturated on LME-S)
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:121:  but partly wrong (LoCoMo head is NOT saturated; the issue there is
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:125:  LME-S head saturation (R@50=1.0) AND LoCoMo's massive recall
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:132:  NDCG/MRR augmentation + LoCoMo E11 run. Identified the listwise-
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:137:  LoCoMo shipped real lift across every metric. Shuffle fix (Phase
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:151:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:153:   capture the compounding loop architecturally and link to it
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:156:2. LME-S baseline re-run with NDCG/MRR ladder. Confirmed head
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:159:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:160:   storage, ambitioned-curator model) is now explicitly documented
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:167:Q1. Given the empirical ceiling on LME-S R@5 (NDCG@5 headroom ~4pp,
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:170:    agentmemory) or an engineering question (architecting the
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:174:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:178:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:184:    quality, not the compounding the mission claims. What
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:195:      (d) the comparison to competitor numbers (agentmemory 0.952
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:199:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:201:    meaningful compounding signal in the first ~30 days post-
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:204:    the compounding becomes visible to a new contributor visiting
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:207:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:219:Q7. The competitor frame (mem0/agentmemory/ByteRover) was the
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:222:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:246:    why Akashik differs
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:247:  - For Q3: a proposed benchmark for measuring federation-level
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:248:    compounding, with the metrics and the experimental design
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:266:# FOURTH-ROUND ANALYSIS — Akashik / wellinformed
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:273:The stack is TypeScript / DDD with clean layer separation (`domain` → `application` → `infrastructure` → `cli`/`mcp`). Domain layer is pure: immutable graph values, `neverthrow` Result monads throughout, no I/O. Key domain types confirm what the prompt describes: `graph.ts` (immutable GraphNode/GraphEdge), `eval-metrics.ts` (pure `recallAtK`/`ndcgAtK`/`reciprocalRank`), `contextual-enrich.ts` (E11, pure, deterministic), `llm-listwise-rerank.ts` (ports-and-adapters for LLM, shuffle already shipped at commit 1f828b7), `sharing.ts` (SEC-03 boundary: no raw embeddings cross the wire), `oracle.ts` (P2P Q&A as pure graph-node data shape), `federated-search.ts` (Promise.all fan-out with 2000ms per-peer timeout, dedup prefers local). The architecture is sound for the Akashik mission. The retrieval plumbing is well-built. The open question is what to measure next.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:279:**The headline claim first:** continuing to push per-peer R@5 is a marketing question for the OLD product frame, not an engineering question for Akashik.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:281:Here is why. LME-S shows R@50 = 1.0 — the gold is always in the candidate pool; the ceiling is real. The remaining ~4pp NDCG@5 headroom is the gap between ranks 1 and 2-5. On LoCoMo the headroom is 60pp, but the only interventions that produced lift were write-path ones (E11), not read-path ones. Small local LLMs actively regression on LoCoMo after shuffle.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:283:More importantly: Akashik's product claim is not "our single-peer R@5 beats mem0." That was wellinformed's frame, and the pivot explicitly abandoned it. Akashik's claim is that the compounding loop produces network-level knowledge availability that grows monotonically. That claim cannot be validated by any per-peer retrieval benchmark. The engineering debt is not "push R@5 from 0.920 to 0.940." The engineering debt is "there is no benchmark for what we claim."
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:285:**The tradeoff of stopping retrieval tuning:** You leave 60pp of theoretical LoCoMo headroom on the table. However, that headroom requires a larger model than what runs locally (qwen2.5:7b already regressed). Capturing it requires a cloud API call, which reintroduces network dependency and cost per query — counter to the local-first architecture. The tradeoff is: spend a week definitively answering whether a cloud API call on LoCoMo lifts R@3 above bi-encoder (one 50-question spot-check with GPT-4o-mini would settle this), then either ship the cloud reranker as an opt-in tier or close the listwise chapter entirely.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:291:4. One-week cloud-API listwise ablation on LoCoMo to definitively close or continue the reranker chapter (~10%)
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:295:## Q2 — Is the Akashik mechanism novel or a known pattern?
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:301:| System | What it shares with Akashik | What's missing |
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:305:| **W3C SPARQL 1.1 Federated Queries** (2013 spec) | Semantic federation: one query fans out to multiple SPARQL endpoints, results merged. | Requires central service-description registry for peer discovery. No P2P pull. No attribution. No caching compounding. |
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:309:**What makes Akashik defensibly different:** The mechanism where (a) propagation is triggered by semantic query similarity not by push replication or key lookup, (b) DID-signed attribution is non-separable from the content node (it travels as a graph property, not as metadata that can be stripped), and (c) the satisfaction gate is a protocol-level decision (the `0.85 threshold` in VISION.md) not a UX heuristic — this combination exists nowhere in the prior art literature.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:311:The single most important citation to engage: **Freenet's monotonic availability proof.** Akashik's `R(T,t) = monotonically non-decreasing` is structurally the same claim. You should either cite and extend Freenet's proof to the semantic-search case, or derive your own. Without a formal proof or simulation backing it, "compounding is a property of the architecture, not a marketing claim" is still a marketing claim.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:317:No existing public benchmark measures federated knowledge compounding. This is a real gap and a publishable contribution.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:319:**Proposed: AkashikBench-F (Federation Compounding Benchmark)**
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:330:| `coverage_growth(T, t)` | Fraction of peers that can answer topic T at time t | Directly measures the compounding claim |
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:331:| `T_half(T)` | Time for 50% of network to acquire a topic | Speed of compounding |
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:353:- **Candidate count calibration.** qwen2.5:1.5b was trained and evaluated on small candidate sets. At headSize=30 on LoCoMo you're at the model's practical context ceiling. At headSize=50, quality should degrade further. The regression you saw with qwen2.5:7b is consistent with this — larger model, same calibration problem, higher perplexity on the over-long prompt.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:357:- **Availability confounding.** Your current bench runs with all peers online. In production, the 2000ms timeout means some peers never respond. Your single-peer benchmarks (LME-S, LoCoMo) don't model this. AkashikBench-F should include a "partial availability" condition: what is federation R@k when 20% of peers are offline?
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:365:- **Short-body prefix dominance.** On LoCoMo, some conversation turns are very short (< 30 tokens). A 512-token sentence-transformer with a 40-token E11 prefix and a 20-token body is now embedding 66% metadata + 33% content. The metadata prefix dominates the vector. Test E11 lift stratified by body length. If the lift is concentrated in long-body documents, the metric average is masking a failure on short bodies.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:369:The 0.952 (agentmemory) / 0.925 (mem0) / 0.928 (ByteRover) numbers are NOT defensible baselines for comparison. Here's why:
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:375:**The real risk:** publishing "wellinformed 0.9202 vs mem0 0.925" when the evaluation protocols differ is a credibility trap. The correct framing for Akashik launch is NOT R@5 comparison against single-user products. It's `web_fallback_rate` vs baseline (before federation) — a metric only Akashik can report.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:379:## Q5 — Smallest-viable launch plan: 100 contributors, 30 days, visible compounding
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:383:Reasons: small and high-trust (≈5,000 serious contributors globally), terminal-native (CLI fits), deep knowledge-sharing culture (This Week in Rust newsletter has 15k+ subscribers), and the community has a known pain — institutional memory evaporates when maintainers rotate. Akashik's compounding property is precisely the fix.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:389:Direct invite to maintainers of top-100 crates by download count. Message: "You already know things that took months to learn. Akashik keeps that knowledge alive for the next person, attributed to you." The attribution model matters here — unlike Confluence/Notion, contributions stay yours.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:392:Submit a This Week in Rust link. Not a blog post — a concrete demo: "Ask 'how do I handle backpressure in tokio::mpsc?' — watch Akashik answer from peer knowledge instead of web." The demo should show the `_source_peer` field (already in `FederatedMatch`) crediting the actual peer that contributed the answer.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:394:**The compounding signal to show at day 30:**
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:395:Instrument and publish `web_fallback_rate` for the `rust` room. The expected curve: day 1 ≈ 80-90% web fallback (sparse graph), day 30 < 40% (librarian + early-adopter knowledge covers the common queries). This is the compounding claim made visible.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:407:The known solution is **topic diversity indexing**, analogous to Mastodon's local vs. federated timeline split. Akashik's room structure partially mitigates this (niche rooms exist independently), but within a room, hot nodes will crowd out cold ones in search rankings.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:423:The asymmetry to be honest about: misinformation spreads faster than corrections in every P2P network studied. Akashik's DID attribution is the correct mitigation (you can identify and quarantine a bad actor's entire contribution graph) but the window between propagation and quarantine is real. Launch comms should acknowledge this explicitly rather than claiming "attribution solves misinformation."
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:433:This is the most important one. AT Protocol solved federated identity (DIDs), signed content, Personal Data Servers (each user owns their data), and protocol-level federation at scale (millions of users). Their architecture maps almost directly: PDS = Akashik peer, DID = Akashik contributor identity, lexicon record type = Akashik graph node type.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:437:**Practical question for the engineering month:** should Akashik use AT Protocol DIDs natively? The `identity-store.ts` and `github-oauth.ts` infrastructure suggests GitHub OAuth DIDs. Assess whether AT Protocol DID anchoring is feasible — if yes, Akashik inherits AT Protocol's identity ecosystem and becomes a knowledge-graph extension of the AT Protocol universe rather than a competing P2P identity system.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:441:Are.na is the closest product-level analogue. Curated cards, attributed to contributors, topic-organized, designed for thinkers/researchers/OSS community. Are.na is what Akashik would look like centralized. It has ~700k users and genuine community adoption among exactly Akashik's target demographic.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:443:The competitive differentiation is NOT features — Are.na is polished. The differentiation is: Are.na's knowledge belongs to Are.na's servers. Akashik's knowledge belongs to its contributors. That's a values-level difference that resonates with the OSS community specifically.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:447:Not a competitor in the traditional sense — Obsidian is a tool, Akashik is a protocol. But Obsidian's user base (technical writers, researchers, OSS developers who maintain public "digital gardens") is exactly Akashik's first-wave contributor pool. An Obsidian plugin that treats a published Obsidian vault as an Akashik peer would give Akashik instant distribution to Obsidian's 1M+ users without requiring them to change their workflow.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:449:**The three explicitly NOT competitors:** mem0, agentmemory, ByteRover. These are single-user, server-side, API-first products. They are measuring something different (agent context management) and serving a different customer (developers building agents). Continuing to compare against them is a category error now that the identity pivot has happened.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:457:> "This is a coordination problem in an infrastructure costume. Compounding is a property of participation density, not architecture. The mechanism only works when enough peers are online and have already pulled the relevant knowledge — which requires network effects you haven't earned yet. Every federated network (Mastodon, Matrix, Diaspora) has built technically correct architecture and then struggled for years to reach the critical mass where the federated property is actually better than the centralized alternative. Akashik's architectural insight about R(T,t) is correct but irrelevant until you have R(T, t) >> 0 for enough T, which is a community-building problem, not an engineering problem. The next engineering month could be zero effort and the project would succeed faster by spending that month on community seeding and distribution."
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:463:The cold-start problem is real for every network, but it conflates two distinct claims. The first claim — "federation is valuable once you have density" — is trivially true and grants the counter-argument. The second claim — "Akashik provides value before density" — is the actual product bet, and it's defensible: the web-fallback path means a contributor with zero peers still gets a functional local knowledge tool on day 1. Federation value is strictly additive. The counter-argument applies if Akashik required federation to work at all; it doesn't. However, the counter-argument correctly identifies the real risk: if the compounding claim is made at launch but can't be demonstrated (because the network is too sparse), early adopters experience a tool that feels like a slower version of their existing web search. The engineering month is not zero precisely because without `web_fallback_rate` instrumentation and AkashikBench-F, there is no number to show at launch that makes the compounding claim concrete rather than aspirational. The engineering constraint is measurement, not architecture.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:470:- **Write-path interventions work** (E11: +0.66pp LME-S, +1.5pp LoCoMo NDCG@3). Deterministic, composable, zero query-time cost.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:472:- **The identity pivot is architecturally correct.** The codebase already has all the infrastructure needed for the Akashik mission: federated search with dedup and attribution (`federated-search.ts`), peer reputation (`peer-reputation-store.ts`), oracle P2P Q&A (`oracle.ts`), DID identity (`identity-store.ts`), SEC-03 metadata boundary (`sharing.ts`). None of this needs to be built. What needs to be built is the measurement infrastructure for what the mission claims.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:476:1. **AkashikBench-F harness** — build the N-peer simulation bench described in Q3. This is what validates the mission claim. Without it, launch is vibes. With it, launch is a paper and a credible number.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:482:4. **Close the listwise chapter** — one 50-question GPT-4o-mini cloud call on LoCoMo. If it lifts R@3 above 0.55, implement cloud reranker as opt-in tier. If it doesn't, write the conclusion: bi-encoder quality is the ceiling on this dataset given its structure, and per-peer retrieval tuning is complete.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:484:Explicitly stop: per-peer R@5 headline number optimization, cross-encoder experiments, E10 temporal query gate (solves the old product frame's problem), any work that produces a number comparable to mem0/agentmemory/ByteRover.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:13:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:29:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:38:The compounding loop, in 5 steps:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:40:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:83:LoCoMo factual subset (n=699, M-series Mac, retrieval-only):
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:116:  (model came up null). E11 recommendation was RIGHT (+0.66pp on LME-S,
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:117:  +0.9-2.7pp on LoCoMo). E10 not yet implemented.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:121:  saturation) — turned out partly true (head is saturated on LME-S)
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:122:  but partly wrong (LoCoMo head is NOT saturated; the issue there is
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:126:  LME-S head saturation (R@50=1.0) AND LoCoMo's massive recall
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:133:  NDCG/MRR augmentation + LoCoMo E11 run. Identified the listwise-
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:138:  LoCoMo shipped real lift across every metric. Shuffle fix (Phase
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:152:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:154:   capture the compounding loop architecturally and link to it
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:157:2. LME-S baseline re-run with NDCG/MRR ladder. Confirmed head
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:160:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:161:   storage, ambitioned-curator model) is now explicitly documented
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:168:Q1. Given the empirical ceiling on LME-S R@5 (NDCG@5 headroom ~4pp,
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:171:    agentmemory) or an engineering question (architecting the
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:175:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:179:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:185:    quality, not the compounding the mission claims. What
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:196:      (d) the comparison to competitor numbers (agentmemory 0.952
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:200:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:202:    meaningful compounding signal in the first ~30 days post-
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:205:    the compounding becomes visible to a new contributor visiting
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:208:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:220:Q7. The competitor frame (mem0/agentmemory/ByteRover) was the
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:223:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:247:    why Akashik differs
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:248:  - For Q3: a proposed benchmark for measuring federation-level
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:249:    compounding, with the metrics and the experimental design
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:270:- LoCoMo says something different: `R@30 = 0.993` but `R@3 = 0.392`, so there is still real per-peer ranking work. However, that is still single-peer optimization, while the Akashik claim is federation compounding.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:271:- LongMemEval itself is about single-assistant memory abilities, not network compounding; its abstract frames five assistant-memory abilities, not peer propagation ([LongMemEval](https://huggingface.co/papers/2410.10813)).
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:275:- Spend `~30%` on the remaining high-yield peer work: temporal query gating and turn/session granularity experiments on LoCoMo.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:277:On the other hand, ignoring headline `R@5` entirely has a cost: buyers, contributors, and press will still compare Akashik to single-user memory systems. So keep a lightweight benchmark cadence, but stop letting LongMemEval-S drive roadmap priority.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:281:Akashik is **not novel in primitives**. It is **novel in composition**.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:292:- Akashik’s distinctive move is **curiosity-driven semantic replication**:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:307:- FeB4RAG updates federated search for RAG, but still targets federated retrieval, not longitudinal knowledge compounding ([FeB4RAG](https://arxiv.org/abs/2402.11891)).
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:309:Proposed benchmark: **AkashikBench**
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:363:- `agentmemory` currently self-publishes `95.2% R@5` and `98.6% R@10` on LongMemEval-S in its README ([GitHub](https://github.com/rohitg00/agentmemory)).
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:364:- Mem0 currently advertises `94.4` on LongMemEval and `92.5` on LoCoMo with under `7,000` retrieval tokens ([Mem0 research](https://mem0.ai/research), [docs](https://docs.mem0.ai/core-concepts/memory-evaluation)).
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:365:- ByteRover’s paper claims SOTA on LoCoMo and competitive LongMemEval positioning, but exact public numbers are split between paper and blog posts ([paper](https://arxiv.org/abs/2604.01599), [site](https://www.byterover.dev/)).
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:406:- compounding becomes visible fast because duplicate pain is common
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:434:- Akashik likely needs:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:447:The real comparison set is not mem0/agentmemory/ByteRover.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:464:Why it differs: not built as a semantic knowledge commons with attributed retrieval and benchmarked compounding.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:475:> Akashik assumes that if you make knowledge portable, signed, and peer-owned, high-quality community memory will naturally emerge. But contributors do not reliably externalize their reasoning, most saved knowledge is noisy or stale, and signatures prove authorship rather than correctness. Without strong incentives and moderation, the system may become a fragmented cache of plausible junk whose compounding mostly amplifies popularity, not truth.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:479:That criticism is strong because it is partly correct. Akashik should not position itself as an automatic truth machine. The defensible claim is narrower: it can make repeated OSS learning more reusable, attributable, and locally owned than today’s mix of transient chat, scattered issues, and centralized note silos. To earn trust, launch should require provenance, expose source chains, measure compounding directly, cap curator dominance, preserve diversity, and make moderation/trust policies explicit. If Akashik does that, the project is not “knowledge solves itself”; it is “community learning leaves auditable traces and gets easier to reuse.”
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:502:If you do not build those first, you risk shipping a strong single-peer memory engine with a compelling story attached. If you do build them, Akashik becomes testably different.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:516:- LoCoMo: https://arxiv.org/abs/2402.17753
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:520:- agentmemory repo benchmarks: https://github.com/rohitg00/agentmemory
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:584:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:600:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:609:The compounding loop, in 5 steps:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:611:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:654:LoCoMo factual subset (n=699, M-series Mac, retrieval-only):
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:687:  (model came up null). E11 recommendation was RIGHT (+0.66pp on LME-S,
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:688:  +0.9-2.7pp on LoCoMo). E10 not yet implemented.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:692:  saturation) — turned out partly true (head is saturated on LME-S)
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:693:  but partly wrong (LoCoMo head is NOT saturated; the issue there is
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:697:  LME-S head saturation (R@50=1.0) AND LoCoMo's massive recall
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:704:  NDCG/MRR augmentation + LoCoMo E11 run. Identified the listwise-
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:709:  LoCoMo shipped real lift across every metric. Shuffle fix (Phase
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:723:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:725:   capture the compounding loop architecturally and link to it
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:728:2. LME-S baseline re-run with NDCG/MRR ladder. Confirmed head
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:731:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:732:   storage, ambitioned-curator model) is now explicitly documented
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:739:Q1. Given the empirical ceiling on LME-S R@5 (NDCG@5 headroom ~4pp,
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:742:    agentmemory) or an engineering question (architecting the
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:746:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:750:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:756:    quality, not the compounding the mission claims. What
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:767:      (d) the comparison to competitor numbers (agentmemory 0.952
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:771:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:773:    meaningful compounding signal in the first ~30 days post-
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:776:    the compounding becomes visible to a new contributor visiting
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:779:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:791:Q7. The competitor frame (mem0/agentmemory/ByteRover) was the
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:794:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:818:    why Akashik differs
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:819:  - For Q3: a proposed benchmark for measuring federation-level
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:820:    compounding, with the metrics and the experimental design
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:875:web search: github agentmemory LongMemEval-S 95.2 README ...
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:883:web search: '95.2' in https://github.com/rohitg00/agentmemory
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:899:- LoCoMo says something different: `R@30 = 0.993` but `R@3 = 0.392`, so there is still real per-peer ranking work. However, that is still single-peer optimization, while the Akashik claim is federation compounding.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:900:- LongMemEval itself is about single-assistant memory abilities, not network compounding; its abstract frames five assistant-memory abilities, not peer propagation ([LongMemEval](https://huggingface.co/papers/2410.10813)).
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:904:- Spend `~30%` on the remaining high-yield peer work: temporal query gating and turn/session granularity experiments on LoCoMo.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:906:On the other hand, ignoring headline `R@5` entirely has a cost: buyers, contributors, and press will still compare Akashik to single-user memory systems. So keep a lightweight benchmark cadence, but stop letting LongMemEval-S drive roadmap priority.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:910:Akashik is **not novel in primitives**. It is **novel in composition**.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:921:- Akashik’s distinctive move is **curiosity-driven semantic replication**:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:936:- FeB4RAG updates federated search for RAG, but still targets federated retrieval, not longitudinal knowledge compounding ([FeB4RAG](https://arxiv.org/abs/2402.11891)).
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:938:Proposed benchmark: **AkashikBench**
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:992:- `agentmemory` currently self-publishes `95.2% R@5` and `98.6% R@10` on LongMemEval-S in its README ([GitHub](https://github.com/rohitg00/agentmemory)).
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:993:- Mem0 currently advertises `94.4` on LongMemEval and `92.5` on LoCoMo with under `7,000` retrieval tokens ([Mem0 research](https://mem0.ai/research), [docs](https://docs.mem0.ai/core-concepts/memory-evaluation)).
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:994:- ByteRover’s paper claims SOTA on LoCoMo and competitive LongMemEval positioning, but exact public numbers are split between paper and blog posts ([paper](https://arxiv.org/abs/2604.01599), [site](https://www.byterover.dev/)).
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1035:- compounding becomes visible fast because duplicate pain is common
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1063:- Akashik likely needs:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1076:The real comparison set is not mem0/agentmemory/ByteRover.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1093:Why it differs: not built as a semantic knowledge commons with attributed retrieval and benchmarked compounding.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1104:> Akashik assumes that if you make knowledge portable, signed, and peer-owned, high-quality community memory will naturally emerge. But contributors do not reliably externalize their reasoning, most saved knowledge is noisy or stale, and signatures prove authorship rather than correctness. Without strong incentives and moderation, the system may become a fragmented cache of plausible junk whose compounding mostly amplifies popularity, not truth.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1108:That criticism is strong because it is partly correct. Akashik should not position itself as an automatic truth machine. The defensible claim is narrower: it can make repeated OSS learning more reusable, attributable, and locally owned than today’s mix of transient chat, scattered issues, and centralized note silos. To earn trust, launch should require provenance, expose source chains, measure compounding directly, cap curator dominance, preserve diversity, and make moderation/trust policies explicit. If Akashik does that, the project is not “knowledge solves itself”; it is “community learning leaves auditable traces and gets easier to reuse.”
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1131:If you do not build those first, you risk shipping a strong single-peer memory engine with a compelling story attached. If you do build them, Akashik becomes testably different.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1145:- LoCoMo: https://arxiv.org/abs/2402.17753
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1149:- agentmemory repo benchmarks: https://github.com/rohitg00/agentmemory
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:13:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:29:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:38:The compounding loop, in 5 steps:
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:40:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:83:LoCoMo factual subset (n=699, M-series Mac, retrieval-only):
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:116:  (model came up null). E11 recommendation was RIGHT (+0.66pp on LME-S,
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:117:  +0.9-2.7pp on LoCoMo). E10 not yet implemented.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:121:  saturation) — turned out partly true (head is saturated on LME-S)
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:122:  but partly wrong (LoCoMo head is NOT saturated; the issue there is
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:126:  LME-S head saturation (R@50=1.0) AND LoCoMo's massive recall
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:133:  NDCG/MRR augmentation + LoCoMo E11 run. Identified the listwise-
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:138:  LoCoMo shipped real lift across every metric. Shuffle fix (Phase
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:152:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:154:   capture the compounding loop architecturally and link to it
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:157:2. LME-S baseline re-run with NDCG/MRR ladder. Confirmed head
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:160:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:161:   storage, ambitioned-curator model) is now explicitly documented
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:168:Q1. Given the empirical ceiling on LME-S R@5 (NDCG@5 headroom ~4pp,
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:171:    agentmemory) or an engineering question (architecting the
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:175:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:179:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:185:    quality, not the compounding the mission claims. What
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:196:      (d) the comparison to competitor numbers (agentmemory 0.952
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:200:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:202:    meaningful compounding signal in the first ~30 days post-
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:205:    the compounding becomes visible to a new contributor visiting
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:208:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:220:Q7. The competitor frame (mem0/agentmemory/ByteRover) was the
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:223:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:247:    why Akashik differs
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:248:  - For Q3: a proposed benchmark for measuring federation-level
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:249:    compounding, with the metrics and the experimental design
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:268:**Q1. LME-S Ceiling: Marketing vs. Engineering? Where should the next month go?**
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:269:Pushing the headline LME-S `R@3` from 0.9202 any closer to 1.0 is purely a **marketing exercise**. Your empirical data shows the head is saturated (`R@50 = 1.0000`). Chasing the remaining ~4pp NDCG gap on a 50-distractor benchmark is overfitting to a specific dataset rather than building a product. 
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:271:*   **The Tradeoff/Disadvantage:** Every engineering hour spent squeezing 1pp out of LME-S is an hour stolen from the core Akashik mechanism. Furthermore, optimizing for LME-S ignores the actual engineering fire: the LoCoMo benchmark’s 60pp recall headroom where current rerankers are fundamentally failing.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:274:**Q2. Prior Art & Architectural Novelty of the Akashik Mechanism**
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:275:The Akashik mechanism (local + fan-out + web-on-miss + DID-signed save + transfer) is not entirely novel in its components, but its *composition* is unique.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:279:*   **How Akashik Differs (The Novelty):** Akashik replaces the "URL" with a "Semantic LLM context/solved task." It is a cooperative cache for *generative AI problem-solving*, signed cryptographically via W3C `did:key`. 
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:281:    *   *Strength:* It creates a zero-marginal-cost compounding loop. The network naturally forms a distributed vector database where storage is directly proportional to human utility.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:294:    *   *Weakness/Tradeoff:* Simulated query distributions are sterile. Real-world queries experience semantic drift (a bug changes based on a new Node.js version). A benchmark that doesn't simulate temporal deprecation of facts will falsely inflate the compounding signal. 
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:300:*   **(d) Competitor Baselines:** Comparing Akashik to `mem0` or `ByteRover` is structurally flawed. They are *global, centralized* state machines. Comparing a centralized graph's recall against a single peer's partitioned state is intellectually dishonest. 
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:304:To prove compounding, you need a high-density, high-churn micro-community where users frequently encounter the same obscure errors.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:322:3.  **IPFS / libp2p Ecosystem:** *Strength:* The actual infrastructure of decentralized data. *Weakness:* It is purely a storage primitive. It has no native semantic routing, no LLM integration, and no concept of "curiosity-driven" compounding.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:326:*   **The Response:** "Akashik bypasses the traditional free-rider problem because *contribution requires zero friction*. In standard systems, users must stop working to write a forum post. In Akashik, the act of a user privately solving their own problem via an LLM web-miss automatically creates the signed artifact. The cost of serving that artifact to a peer is a negligible background SQLite vector lookup (~11ms). We don't need tokenomics because the byproduct of selfish utility is collective wealth."
./docs/README.md:25:- [`GRAPHRAG-AUDIT.md`](product/GRAPHRAG-AUDIT.md) — wellinformed audited against 2025/2026 GraphRAG state of the art (Microsoft GraphRAG, HippoRAG 2, LightRAG, MultiHop-RAG, LoCoMo).
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:13:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:29:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:38:The compounding loop, in 5 steps:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:40:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:83:LoCoMo factual subset (n=699, M-series Mac, retrieval-only):
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:116:  (model came up null). E11 recommendation was RIGHT (+0.66pp on LME-S,
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:117:  +0.9-2.7pp on LoCoMo). E10 not yet implemented.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:121:  saturation) — turned out partly true (head is saturated on LME-S)
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:122:  but partly wrong (LoCoMo head is NOT saturated; the issue there is
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:126:  LME-S head saturation (R@50=1.0) AND LoCoMo's massive recall
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:133:  NDCG/MRR augmentation + LoCoMo E11 run. Identified the listwise-
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:138:  LoCoMo shipped real lift across every metric. Shuffle fix (Phase
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:152:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:154:   capture the compounding loop architecturally and link to it
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:157:2. LME-S baseline re-run with NDCG/MRR ladder. Confirmed head
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:160:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:161:   storage, ambitioned-curator model) is now explicitly documented
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:168:Q1. Given the empirical ceiling on LME-S R@5 (NDCG@5 headroom ~4pp,
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:171:    agentmemory) or an engineering question (architecting the
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:175:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:179:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:185:    quality, not the compounding the mission claims. What
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:196:      (d) the comparison to competitor numbers (agentmemory 0.952
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:200:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:202:    meaningful compounding signal in the first ~30 days post-
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:205:    the compounding becomes visible to a new contributor visiting
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:208:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:220:Q7. The competitor frame (mem0/agentmemory/ByteRover) was the
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:223:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:247:    why Akashik differs
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:248:  - For Q3: a proposed benchmark for measuring federation-level
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:249:    compounding, with the metrics and the experimental design
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:265:`LongMemEval-S` is telling you the headline number is near its ceiling: `R@50 = 1.0`, `R@5 = 0.9202`, `NDCG@5 = 0.8836`, so the remaining room is mostly intra-top-5 ordering, not missing evidence. That makes further gains partly a marketing question if the goal is leaderboard optics against `agentmemory`, not the highest-leverage engineering question. On the other hand, `LoCoMo` still shows a real ranking problem (`R@30 = 0.993` but `R@3 = 0.392`), so abandoning retrieval work entirely would be premature. The tradeoff is simple: spend maybe `10-20%` of the month on low-risk per-peer improvements like temporal gating, better segmentation, and stronger reranker evaluation; spend the other `80-90%` on federation architecture, compounding instrumentation, and launch-loop proof, because that is where Akashik is differentiated.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:274:What seems defensibly different about Akashik is **query-triggered semantic propagation**. SSB and Hypercore replicate logs/feeds/blocks; AT Proto distributes repos/posts; Akashik proposes that knowledge spreads because someone asked a semantically similar question, then another peer cached the answer locally and can later serve it onward. However, the downside is that this novelty currently lives more in the **retrieval-and-propagation policy** than in the storage primitive. So the strong claim is not “new protocol from first principles”; it is “new local-first knowledge propagation mechanism with explicit attribution and compounding behavior.”
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:277:A useful benchmark would be something like **`Akashik-CompBench`**:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:308:- Unrealistic always-online assumptions will overstate compounding.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:319:- `agentmemory 0.952 / mem0 0.925 / ByteRover 0.928` are not defensible as direct baselines unless corpus construction, chunking, candidate depth, metric definition, and evaluation harness are matched exactly.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:331:- **Why these rooms**: they have constant repeated debugging, public artifacts, and frequent “I solved this yesterday” moments. That is ideal for visible compounding.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:345:Visible compounding signal by day 30 should be: “new user asks a real troubleshooting question, gets an attributed answer from another peer’s prior work, without going to Google.” The downside is narrow scope; however, narrow scope is exactly what makes the signal believable early.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:366:7. **Q7: The real comparison set is not `mem0` or `agentmemory`. The closest systems are these three.**  
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:367:- **Secure Scuttlebutt**: closest architectural ancestor. It is the best “you are not crazy; this family of ideas exists” reference. Akashik extends it with semantic retrieval and query-triggered transfer.  
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:376:**Response:** Akashik should not claim that every saved note becomes durable truth. The system works only if it compounds **attributed, evidence-backed, query-reused** knowledge. That is why the product must privilege provenance, room-scoped trust, replayable evidence, soft moderation labels, and visible transfer events over raw note volume. The point is not “everything anyone saves becomes the record”; it is “the subset of community work that repeatedly proves useful becomes easier to find, reuse, and attribute without requiring a central owner.”
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:379:The next engineering month should be spent proving the **federation thesis**, not polishing the single-peer benchmark headline. Concretely: build the compounding benchmark and simulator; instrument `web-miss`, `transfer`, `churn`, `attribution`, and `diversity`; ship room-level caching/pinning and provenance primitives; and run a narrow 100-user launch in high-overlap OSS rooms. Keep a smaller retrieval lane for `E10`, segmentation, and better reranker eval on `LoCoMo`, because local ranking still matters. However, the core risk is no longer “can we beat `0.925` on `R@5`?” It is “can we show that knowledge acquired by one contributor becomes faster to retrieve for another contributor over time, without centralization and without the commons collapsing into noise?” That is the month’s real work.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:451:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:467:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:476:The compounding loop, in 5 steps:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:478:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:521:LoCoMo factual subset (n=699, M-series Mac, retrieval-only):
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:554:  (model came up null). E11 recommendation was RIGHT (+0.66pp on LME-S,
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:555:  +0.9-2.7pp on LoCoMo). E10 not yet implemented.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:559:  saturation) — turned out partly true (head is saturated on LME-S)
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:560:  but partly wrong (LoCoMo head is NOT saturated; the issue there is
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:564:  LME-S head saturation (R@50=1.0) AND LoCoMo's massive recall
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:571:  NDCG/MRR augmentation + LoCoMo E11 run. Identified the listwise-
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:576:  LoCoMo shipped real lift across every metric. Shuffle fix (Phase
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:590:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:592:   capture the compounding loop architecturally and link to it
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:595:2. LME-S baseline re-run with NDCG/MRR ladder. Confirmed head
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:598:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:599:   storage, ambitioned-curator model) is now explicitly documented
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:606:Q1. Given the empirical ceiling on LME-S R@5 (NDCG@5 headroom ~4pp,
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:609:    agentmemory) or an engineering question (architecting the
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:613:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:617:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:623:    quality, not the compounding the mission claims. What
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:634:      (d) the comparison to competitor numbers (agentmemory 0.952
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:638:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:640:    meaningful compounding signal in the first ~30 days post-
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:643:    the compounding becomes visible to a new contributor visiting
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:646:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:658:Q7. The competitor frame (mem0/agentmemory/ByteRover) was the
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:661:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:685:    why Akashik differs
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:686:  - For Q3: a proposed benchmark for measuring federation-level
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:687:    compounding, with the metrics and the experimental design
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:747:`LongMemEval-S` is telling you the headline number is near its ceiling: `R@50 = 1.0`, `R@5 = 0.9202`, `NDCG@5 = 0.8836`, so the remaining room is mostly intra-top-5 ordering, not missing evidence. That makes further gains partly a marketing question if the goal is leaderboard optics against `agentmemory`, not the highest-leverage engineering question. On the other hand, `LoCoMo` still shows a real ranking problem (`R@30 = 0.993` but `R@3 = 0.392`), so abandoning retrieval work entirely would be premature. The tradeoff is simple: spend maybe `10-20%` of the month on low-risk per-peer improvements like temporal gating, better segmentation, and stronger reranker evaluation; spend the other `80-90%` on federation architecture, compounding instrumentation, and launch-loop proof, because that is where Akashik is differentiated.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:756:What seems defensibly different about Akashik is **query-triggered semantic propagation**. SSB and Hypercore replicate logs/feeds/blocks; AT Proto distributes repos/posts; Akashik proposes that knowledge spreads because someone asked a semantically similar question, then another peer cached the answer locally and can later serve it onward. However, the downside is that this novelty currently lives more in the **retrieval-and-propagation policy** than in the storage primitive. So the strong claim is not “new protocol from first principles”; it is “new local-first knowledge propagation mechanism with explicit attribution and compounding behavior.”
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:759:A useful benchmark would be something like **`Akashik-CompBench`**:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:790:- Unrealistic always-online assumptions will overstate compounding.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:801:- `agentmemory 0.952 / mem0 0.925 / ByteRover 0.928` are not defensible as direct baselines unless corpus construction, chunking, candidate depth, metric definition, and evaluation harness are matched exactly.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:813:- **Why these rooms**: they have constant repeated debugging, public artifacts, and frequent “I solved this yesterday” moments. That is ideal for visible compounding.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:827:Visible compounding signal by day 30 should be: “new user asks a real troubleshooting question, gets an attributed answer from another peer’s prior work, without going to Google.” The downside is narrow scope; however, narrow scope is exactly what makes the signal believable early.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:848:7. **Q7: The real comparison set is not `mem0` or `agentmemory`. The closest systems are these three.**  
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:849:- **Secure Scuttlebutt**: closest architectural ancestor. It is the best “you are not crazy; this family of ideas exists” reference. Akashik extends it with semantic retrieval and query-triggered transfer.  
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:858:**Response:** Akashik should not claim that every saved note becomes durable truth. The system works only if it compounds **attributed, evidence-backed, query-reused** knowledge. That is why the product must privilege provenance, room-scoped trust, replayable evidence, soft moderation labels, and visible transfer events over raw note volume. The point is not “everything anyone saves becomes the record”; it is “the subset of community work that repeatedly proves useful becomes easier to find, reuse, and attribute without requiring a central owner.”
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:861:The next engineering month should be spent proving the **federation thesis**, not polishing the single-peer benchmark headline. Concretely: build the compounding benchmark and simulator; instrument `web-miss`, `transfer`, `churn`, `attribution`, and `diversity`; ship room-level caching/pinning and provenance primitives; and run a narrow 100-user launch in high-overlap OSS rooms. Keep a smaller retrieval lane for `E10`, segmentation, and better reranker eval on `LoCoMo`, because local ranking still matters. However, the core risk is no longer “can we beat `0.925` on `R@5`?” It is “can we show that knowledge acquired by one contributor becomes faster to retrieve for another contributor over time, without centralization and without the commons collapsing into noise?” That is the month’s real work.
./docs/marketing/how-akashik-works.md:1:# How Akashik works
./docs/marketing/how-akashik-works.md:4:Akashik possible. Written for the reader who has heard "federated
./docs/marketing/how-akashik-works.md:14:Each Akashik peer holds **only its own information** — what its
./docs/marketing/how-akashik-works.md:17:federation couldn't satisfy a query. When you ask Akashik
./docs/marketing/how-akashik-works.md:42:       Query A's LOCAL Akashik graph
./docs/marketing/how-akashik-works.md:112:   the date, the source — not a faceless "Akashik says". Knowledge
./docs/marketing/how-akashik-works.md:117:   "who pays for the compounding?" — the curious user pays once,
./docs/marketing/how-akashik-works.md:156:**availability follows participation**. Akashik doesn't pretend
./docs/marketing/how-akashik-works.md:172:Akashik's **"each peer holds only what it has asked for or
./docs/marketing/how-akashik-works.md:208:This is the compounding. It's not a marketing claim; it's a
./docs/product/GRAPHRAG-AUDIT.md:7:Still contested: chunking strategy, whether to summarize on traversal versus pre-compute, and how to evaluate. The [GraphRAG-Bench / ICLR'26 paper](https://arxiv.org/html/2506.05690v3) finds Community-GraphRAG (Local) wins on multi-hop (HotPotQA, MultiHop-RAG) but Global hallucinates on Null queries, and vanilla RAG still beats GraphRAG on single-hop detail. [LightRAG](https://arxiv.org/abs/2410.05779) argues for cheap dual-level (entity-specific + topic-abstract) retrieval over expensive community trees. Long-conversation memory is its own axis: [LoCoMo](https://snap-research.github.io/locomo/) shows top RAG systems still trail human ceiling by ~56% on 32-session dialogues, with temporal reasoning the worst gap. Hybrid sparse+dense fusion via RRF is now the default starting point in production stacks ([NetApp on hybrid RAG](https://community.netapp.com/t5/Tech-ONTAP-Blogs/Hybrid-RAG-in-the-Real-World-Graphs-BM25-and-the-End-of-Black-Box-Retrieval/ba-p/464834)).
./docs/product/GRAPHRAG-AUDIT.md:16:- Evidence-stage typing (raw_remote → treated → consolidated → reasoned → accepted_local) in `docs/VISION.md` — closer to LoCoMo-grade memory hygiene than to a flat vector store.
./docs/product/GRAPHRAG-AUDIT.md:22:- **P2P federation over centralized index.** No comparable GraphRAG ships a libp2p gossip layer; we want the network effect of compounding research across peers, not a single corpus owner.
./docs/product/GRAPHRAG-AUDIT.md:32:- **No LoCoMo-style temporal-reasoning eval.** Add a temporal-QA harness alongside BEIR in `scripts/bench-*` — P1, M.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:13:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:29:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:38:The compounding loop, in 5 steps:
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:40:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:83:LoCoMo factual subset (n=699, M-series Mac, retrieval-only):
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:116:  (model came up null). E11 recommendation was RIGHT (+0.66pp on LME-S,
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:117:  +0.9-2.7pp on LoCoMo). E10 not yet implemented.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:121:  saturation) — turned out partly true (head is saturated on LME-S)
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:122:  but partly wrong (LoCoMo head is NOT saturated; the issue there is
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:126:  LME-S head saturation (R@50=1.0) AND LoCoMo's massive recall
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:133:  NDCG/MRR augmentation + LoCoMo E11 run. Identified the listwise-
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:138:  LoCoMo shipped real lift across every metric. Shuffle fix (Phase
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:152:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:154:   capture the compounding loop architecturally and link to it
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:157:2. LME-S baseline re-run with NDCG/MRR ladder. Confirmed head
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:160:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:161:   storage, ambitioned-curator model) is now explicitly documented
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:168:Q1. Given the empirical ceiling on LME-S R@5 (NDCG@5 headroom ~4pp,
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:171:    agentmemory) or an engineering question (architecting the
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:175:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:179:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:185:    quality, not the compounding the mission claims. What
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:196:      (d) the comparison to competitor numbers (agentmemory 0.952
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:200:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:202:    meaningful compounding signal in the first ~30 days post-
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:205:    the compounding becomes visible to a new contributor visiting
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:208:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:220:Q7. The competitor frame (mem0/agentmemory/ByteRover) was the
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:223:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:247:    why Akashik differs
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:248:  - For Q3: a proposed benchmark for measuring federation-level
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:249:    compounding, with the metrics and the experimental design
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:275:Here is the synthesis and strategic analysis of the Akashik pivot, addressing the empirical results, architectural mechanism, and open questions.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:277:### Q1: The Engineering vs. Marketing Question on LME-S
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:278:Given the empirical ceiling on LME-S (R@50=1.0, NDCG headroom ~4pp), pushing the headline R@1 number is now strictly a **marketing exercise**, not an engineering necessity. The head saturation proves that for well-formed, single-peer queries, the retrieval floor is solid. 
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:282:*   **The Tradeoff/Risk:** By halting local retrieval tuning, we leave the LoCoMo recall gap (R@3=0.392) unresolved. If local semantic retrieval is too noisy for factual/niche queries, peers will fail to serve correct local data, forcing unnecessary web-misses and bottlenecking the compounding loop. 
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:286:The 5-step compounding mechanism is not fundamentally novel in distributed systems, but its application to **agent-driven semantic graph knowledge** is highly novel.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:289:*   **How Akashik Differs:** Freenet uses content-hash addressing for exact file retrieval; YaCy uses distributed inverted indexes for lexical search. Akashik uses **semantic vector space for probabilistic context retrieval**, and crucially, it uses the **LLM web-miss as the automated ingest motor**. Prior systems relied on humans manually uploading files or running broad, dumb web crawlers. Akashik is demand-driven by localized AI curiosity.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:307:*   **(c) Write-path enrichment (E11):** **Staleness compounding.** Enriching nodes with current dates locks context to a specific moment. If an API changes, the enriched node becomes factually wrong but maintains high semantic relevance.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:308:*   **(d) Competitor Baselines:** **Category error.** Comparing Akashik to Mem0 or AgentMemory on single-user benchmarks is structurally flawed. They are centralized, isolated silos. Akashik’s advantage is the network effect. Beating them on zero-shot local retrieval is nice, but irrelevant to the compounding mission.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:311:To prove compounding, the network requires extreme density, not breadth. Launching to "all open source" will result in a sparse, useless graph.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:315:    *   *Day 1-7:* Distribute Akashik to 20 maintainers/power users with pre-seeded graphs in room `local-llm-dev`.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:332:1.  **Stack Overflow / Stack Exchange (Centralized):** The dominant Q&A commons. Akashik supersedes it by removing the human bottleneck—automating the Q&A generation via the LLM web-miss and decentralizing the storage.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:333:2.  **Perplexity / Cursor (AI Search):** They provide instant answers via centralized compute. Akashik competes by providing instant answers via decentralized, zero-marginal-cost peer memory.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:334:3.  **Collaborator / Fork Target: Bluesky / AT Protocol.** The AT Protocol solved federated cryptographic identity (DIDs) and decentralized data repositories (PDS). Akashik is architecturally adjacent; it could theoretically run *on top of* the AT Protocol's data layer, swapping social microblogging for semantic vector storage.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:339:**The Response:** Akashik mitigates this through strict cryptographic provenance, explicit data aging, and conflict surfacing. Every node carries a `did:key` signature and a `fetched_at` timestamp, and system rooms automatically age out (7-30 days). More importantly, the protocol is designed to surface *conflicting evidence* rather than smoothing it over. If Peer A has a stale fix and Peer B has the new one, the agent receives an explicit "contract" highlighting the contradiction, forcing a live verification search rather than a blind skip. 
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:348:We have proven that the local retrieval engine works well enough (75.22% NDCG). We have proven the plumbing (libp2p, CRDTs). The existential threat to the Akashik mission is now **epistemic pollution**. If we do not ship the Web-of-Trust reputation metrics, explicit stale-node invalidation, and the conflict-surfacing agent contract, the network will drown in its own stale hallucinations within 60 days of launch. Build the immune system.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:12:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:28:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:37:The compounding loop, in 5 steps:
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:39:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:82:LoCoMo factual subset (n=699, M-series Mac, retrieval-only):
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:115:  (model came up null). E11 recommendation was RIGHT (+0.66pp on LME-S,
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:116:  +0.9-2.7pp on LoCoMo). E10 not yet implemented.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:120:  saturation) — turned out partly true (head is saturated on LME-S)
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:121:  but partly wrong (LoCoMo head is NOT saturated; the issue there is
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:125:  LME-S head saturation (R@50=1.0) AND LoCoMo's massive recall
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:132:  NDCG/MRR augmentation + LoCoMo E11 run. Identified the listwise-
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:137:  LoCoMo shipped real lift across every metric. Shuffle fix (Phase
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:151:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:153:   capture the compounding loop architecturally and link to it
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:156:2. LME-S baseline re-run with NDCG/MRR ladder. Confirmed head
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:159:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:160:   storage, ambitioned-curator model) is now explicitly documented
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:167:Q1. Given the empirical ceiling on LME-S R@5 (NDCG@5 headroom ~4pp,
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:170:    agentmemory) or an engineering question (architecting the
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:174:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:178:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:184:    quality, not the compounding the mission claims. What
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:195:      (d) the comparison to competitor numbers (agentmemory 0.952
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:199:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:201:    meaningful compounding signal in the first ~30 days post-
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:204:    the compounding becomes visible to a new contributor visiting
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:207:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:219:Q7. The competitor frame (mem0/agentmemory/ByteRover) was the
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:222:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:246:    why Akashik differs
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:247:  - For Q3: a proposed benchmark for measuring federation-level
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:248:    compounding, with the metrics and the experimental design
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:286:The empirical ceiling is clear. On LME-S: R@50=1.0, NDCG@5=0.884 — the gold is already in every top-50 candidate set. At most 4pp of NDCG@5 headroom exists from reranking, and three rounds of cross-encoder attempts all nulled. On LoCoMo: R@30=0.993, R@3=0.392 — the gold is in the candidate pool for ~all questions, but every local LLM tried (qwen2.5:1.5b, qwen2.5:7b, gpt-oss:20b) either nulled, regressed, or broke. The pattern is not "needs more tuning" — it's a hardware constraint (4GB ARM won't run the models that would help) and a domain-mismatch constraint (web-search-trained rerankers don't transfer to conversational memory).
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:288:**The marketing argument for pushing R@5 further:** mining the last 2-3pp toward agentmemory's 0.952 is only meaningful if Akashik is competing on the single-peer agent-memory leaderboard. Post-pivot, it isn't. The Akashik mission claim is "federated compounding," not "best per-peer retrieval." Chasing 0.95 LME-S R@5 is answering the wrong question.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:290:**The engineering argument for federation:** The compounding claim (R(T,t) monotonically non-decreasing, TTF ~ 1/R(T,t)) has zero measurement infrastructure. There is no benchmark for it, no instrumentation in the daemon to emit it, and no integration test that exercises two peers. The claim is architecturally sound but empirically unverified. That's the next month's most important gap.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:298:## Q2 — Is the Akashik mechanism architecturally novel?
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:302:**1. EDUTELLA (Nejdl et al., WWWW 2002)** — federated RDF repositories over a Gnutella-style P2P network with semantic routing. This is the closest academic ancestor. Peers expose SPARQL-like query endpoints; queries route through a semantic overlay network. The key differences: (a) EDUTELLA required always-on peers (no curiosity-driven caching), (b) no signed attribution, (c) routing was declarative ("this peer covers topic X"), not curiosity-driven, (d) no local-first compounding — content was queried at source, not cached by questioner.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:304:**2. Freenet (Clarke et al., First Monday 2001)** — P2P content routing where requests propagate through intermediaries and each routing node caches content it routes. The curiosity-as-propagation mechanism is structurally identical to Akashik's Step 4-5. The key differences: (a) Freenet is deliberately anonymous — attribution is the opposite of the design goal; (b) content-addressed by hash, not semantically searchable; (c) designed for censorship resistance, not knowledge compounding.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:306:**3. Semantic Overlay Networks (Löser et al., CIDR 2003; Crespo & Garcia-Molina, VLDB 2002)** — early research systems for P2P semantic search. Demonstrated that routing by semantic similarity (instead of hash-based DHT) enables topic-aware peer selection. Akashik's federation fan-out + RRF merge is implementing this pattern. What the 2003 systems lacked: DID-signed attribution, graph-traversable provenance, satisfaction scoring, local-first storage.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:308:**4. IPFS (Protocol Labs, 2015–present)** — content-addressed P2P storage with caching-on-fetch. Same curiosity-as-propagation property: you cache what you fetch, popularity drives replication. Key differences: (a) byte-level storage, no semantic graph; (b) content-addressed (CID), not human-attributed (DID); (c) no semantic retrieval; (d) the "compounding" is about content availability, not retrieval quality.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:310:**5. Solid (Berners-Lee et al., 2016–present)** — decentralized data pods with WebID-based identity and fine-grained access control. User controls their data; apps request access. Structurally similar philosophy (no central server, user-owned data, federated identity). Key differences: Solid is a general-purpose data protocol, not a knowledge-graph-and-retrieval layer; there is no compounding-by-curiosity mechanism; Solid pods must be always-on hosted servers, not local-first.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:312:**What makes Akashik defensibly different:**
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:314:- **Semantic retrieval as the federation primitive**: All prior P2P knowledge systems route by topic declaration (EDUTELLA), content hash (IPFS, Freenet), or social graph (Nostr/Fediverse). Akashik routes by semantic similarity of the query to each peer's local graph.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:315:- **Signed human attribution in the compounding loop**: The "ambitioned curator" model with ed25519/DID provenance is genuinely novel. IPFS has content-addressed identity (verifies content, not author). EDUTELLA has no attribution. Freenet is explicitly anti-attribution. Akashik makes human authorship a first-class compounding signal.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:318:**The honest limitation of novelty claim**: The 2003-2008 Semantic Overlay Network literature is extensive, partially forgotten, and pre-dates the modern embedding stack. Akashik is implementing a 20-year-old architectural insight with 2024 tools. The novelty is in the execution (vector embeddings, DID attribution, satisfaction scoring), not the topology.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:322:## Q3 — What benchmark would measure federation-level compounding?
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:326:**What it measures:** Does the compounding property hold empirically? Does R(T,t) grow monotonically? Does TTF decline as R grows? Can attribution be traced?
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:351:| Compounding factor | CF | Mean TTF reduction at t=500 vs t=0 | The headline compounding claim |
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:355:2. Akashik federation: the above metrics
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:358:**Why this is publishable:** No existing benchmark measures P2P semantic compounding. TREC (ad-hoc retrieval), BEIR (cross-domain transfer), LongMemEval (single-session memory) all measure single-system retrieval quality. FCB is the first benchmark that treats the P2P network itself as the retrieval system and measures the compounding property as the primary axis. Target venue: SIGIR 2027 or ACL Findings under "evaluation methodology" track.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:370:**Length bias in LLM scoring.** LLMs score longer answers higher regardless of relevance (documented in "Large Language Models Are Not Robust Multiple Choice Selectors," arxiv 2309.03882, ICLR 2024). qwen2.5:7b's regression on LoCoMo (-50pp on small sample) may partially be the model preferring the longer bi-encoder candidates over whatever it reranked to top. Before concluding the 7B model regresses, verify the reranked top-3 answer lengths vs bi-encoder top-3 lengths.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:374:**You have no federated retrieval evaluation at all.** Every benchmark result is single-peer local retrieval. This is the most important pitfall: the project's differentiating claim (federation compounds knowledge) has zero measurement infrastructure, which means you also have zero evidence that federation *doesn't* hurt single-peer retrieval quality. Federated fan-out introduces latency heterogeneity, vocabulary drift across peers, and duplicate node inflation in RRF merge — any of which could degrade the 0.9202 LME-S number when measured on a real multi-peer run.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:378:**Coverage bias**: Online time is not uniform. Contributors who run their peer continuously (e.g., a homelab server) contribute disproportionately to R(T,t). The compounding claim assumes R(T,t) grows monotonically, but in practice it grows with a coefficient that's proportional to peer uptime. A network of 100 mostly-offline mobile users may compound much slower than a network of 10 always-on servers. **This is not documented in the mechanism doc.**
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:382:**Context window truncation compounds.** E11 prepends date + session + participants + entities before the document text. The MiniLM-L6 context window is 512 tokens. A 50-token prefix on a 480-token document silently truncates the last 30 tokens. For long conversational turns (which are exactly the targets in LongMemEval and LoCoMo), the tail of the document — which may contain the answer — gets dropped before embedding. This is a systematic bias that can make E11 *hurt* on long documents even while helping on short ones. Verify by comparing enriched-embedding cosine distance to gold answers on long vs short turns.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:384:**Entity extraction noise becomes permanent.** E11's entity prefix is derived from `entity-extract.ts`. Entity extractors fail predictably on acronyms (OCR vs optical character recognition), multi-word entities split by tokenization, and domain-specific terms (a library called "once" might be extracted as a common English word). Once indexed with a wrong entity prefix, re-ranking will systematically bias toward documents with that wrong entity in the prefix. To fix: you'd need a re-index, which is expensive. Mitigation: validate entity extraction on a sample of LME-S turns before committing to production enrichment.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:394:| agentmemory 0.952 | LME-S R@5 | Retrieval-only? (unverified) | Possibly — needs their repo |
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:395:| ByteRover 0.928 | "accuracy" on LME-S | E2E + LLM judge | **No** — different metric |
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:396:| mem0 0.925 | LoCoMo composite | LLM-as-judge over full pipeline | **No** — different benchmark, different metric |
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:398:The mem0 comparison is especially wrong. mem0's 0.925 is a LoCoMo *accuracy* score from their ECAI 2025 paper, measured by an LLM judge evaluating whether the final answer is correct. Your 0.3536 is retrieval-only strict evidence-recall. Placing these in the same table implies they measure the same thing. They don't. The correct comparison of your LoCoMo work is against a retrieval-only baseline from the original LoCoMo paper (Maharana et al., EMNLP 2024, arxiv 2402.17753), not against mem0's end-to-end number.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:404:## Q5 — Smallest-viable launch plan for compounding signal in 30 days
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:433:The HN post must contain exactly one falsifiable claim: "In the last 30 days, X queries to this network were answered by another contributor's cached research rather than reaching the web. Here is the compounding curve." X must be a real measured number, not an estimate.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:455:**Akashik mitigation**: The `find_tunnels` MCP tool already discovers cross-domain connections. A `wellinformed room gaps` command — showing topics that have queries but no cached answers, or topics that haven't been updated in >30 days — would surface the cold-topic coverage map to curators. The peer-reputation system's "topic coverage gaps" output (mentioned in its design doc) is exactly this. Implement it as a visible CLI output, not just an internal metric.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:459:**This is the CAP theorem for decentralized knowledge:** You can have consistency (one canonical answer) or availability (always online) but not both without full replication — and Akashik explicitly avoids full replication.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:464:- IPFS pinning services: third parties voluntarily host content. Akashik equivalent: an "Akashik Archive" peer run by the project that caches anything marked `community-critical` by the original curator.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:465:- DHT replication factor: Kademlia stores k=20 copies. Akashik's opt-in "popular-in-room caching" (mentioned in the mechanism doc) is the right analog. Make it opt-in-by-default for rooms tagged `oss-commons`, not just general rooms.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:472:The threat model (p2p-threat-model.md) covers AS-4 (secret exfiltration) and AS-6 (SSRF). It does not cover the *semantic adversarial* attack: a peer that joins a room, indexes plausible-sounding but wrong answers to common questions, and lets the compounding mechanism propagate those wrong answers through the network.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:482:**What Akashik has:** The peer-reputation system measures "did this peer's answers feel relevant." **It does not measure "was this peer's answer correct."** A well-crafted wrong answer that is topically relevant will score high on satisfaction.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:484:**The structural gap:** There is no factual verification layer. Akashik compounds *attribution*, not *truth*. The community must evaluate correctness themselves — just like Wikipedia's edit history shows who changed what but not whether the change was accurate.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:492:**The single-user agent-memory frame (mem0/agentmemory/ByteRover) is the wrong frame.** These are not competitors; they're potential integrations. They solve a different problem (one user's memory, centrally hosted). Here are the actual competitors:
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:496:**Why it's the real competitor:** IPFS implements the same curiosity-as-propagation caching mechanism at the infrastructure layer. Helia (the TypeScript IPFS implementation) runs in Node.js, the same runtime as Akashik. Protocol Labs has 100+ engineers and $250M+ in funding. If they add a semantic knowledge graph layer on top of Helia, they have Akashik's architecture with a much larger existing network (400K+ public nodes).
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:498:**What Akashik does better:** Semantic retrieval (BEIR 75.22% NDCG@10 is real, measured), DID-based human attribution (IPFS attribution is content hash, not author), satisfaction scoring, knowledge graph with tunnel detection, curiosity-driven working set (IPFS pinning is deliberate, not curiosity-driven).
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:500:**Threat level: Medium-High.** IPFS is infrastructure; Akashik is an application. But Protocol Labs has a history of building application layers (Filecoin, IPLD, Ceramic/ComposeDB). ComposeDB (Ceramic, 2022–present) is especially relevant — it's a decentralized graph database with DID-based identity. Akashik should watch ComposeDB closely.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:504:**Why it's the real competitor:** Logseq is the tool of choice for the exact user Akashik targets: OSS contributors who maintain personal knowledge graphs. It has 30K+ GitHub stars, active community, a plugin ecosystem, and is working on a database edition with improved sync and (eventually) multiplayer features. Logseq's user base is OSS contributors and researchers.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:506:**What Akashik does better:** Federation across organizations (Logseq sync is same-user multi-device or explicit sharing; Akashik federates across organizational boundaries), semantic retrieval quality (measured BEIR numbers), compounding by curiosity (not deliberate sync), DID-signed attribution.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:508:**The key difference:** Logseq is "your notes, synced with you across devices." Akashik is "your research, shared with the community when queried." These sound similar but are fundamentally different trust models. Logseq's sync is a replication protocol; Akashik's federation is a query protocol.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:510:**Threat level: High.** Logseq's community is Akashik's target community. If Logseq ships P2P semantic search (even a basic version) in the next 12 months, Akashik's TAM shrinks significantly. The mitigation: be in the Logseq community now, before they build this.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:514:**Why it's the real competitor:** The AT Protocol is the most mature open-source implementation of the three things Akashik's architecture depends on: DIDs (they use `did:plc` and `did:web`), federated content (Personal Data Servers + relay aggregation), and semantic labeling systems. The AT Protocol is already deployed at scale (6M+ accounts), has an active developer ecosystem, and is building "labelers" (essentially federated reputation) and "starter packs" (essentially curated rooms).
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:516:**What Akashik does better:** Semantic retrieval (AT Protocol has no vector search), curiosity-driven compounding (AT Protocol's replication is push-based, not pull-on-query), knowledge graph with tunnels, local-first storage (AT PDS must be always-on hosted server; Akashik runs on your laptop).
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:518:**Strategic option:** Build Akashik as an AT Protocol lexicon (a schema that defines knowledge nodes) and a labeler (a service that provides reputation signals). This would give Akashik access to the AT Protocol's existing federation infrastructure without competing with it. The Bluesky community already has many OSS contributors.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:520:**Threat level: Existential long-term.** AT Protocol has BlueSky's funding, a deployed network, and is actively expanding its application layer. If they add semantic knowledge retrieval, Akashik's protocol advantage disappears. This is the "build on them or race them" decision.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:528:"Akashik solves a distribution problem that doesn't exist by introducing a reliability problem that does exist. OSS contributors already have working mechanisms for sharing knowledge — Stack Overflow has 60M+ answered questions, GitHub Discussions is indexed by Google, Discord communities provide real-time context, blog posts compound indefinitely via SEO. These mechanisms are persistent (always-on servers), searchable (Google-indexed), moderated (community voting), and have 15-20 years of network effects. Akashik's 'network before web' architecture means you query peers who might be offline before reaching Stack Overflow, which is always online. The compounding property (R(T,t) monotonically non-decreasing) only holds when peers are online — but contributors are offline most of the time, especially on laptops during work hours. For the median OSS contributor (active a few hours per week on a laptop that's off when they sleep), Akashik's federation would degrade to 'fall through to the web' on 95% of queries, which is exactly what happens today — just slower, because you waited for the federation timeout first. You've added latency without removing the web dependency."
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:532:The counter-argument is correct about Stack Overflow — as a competitor for *published* knowledge. Where it misidentifies the use case: Akashik is designed for the 80% of engineering knowledge that *never gets published*. The debugging session you spent 4 hours on that you couldn't write up. The architectural decision you made in 2023 and would like to remember in 2024. The library evaluation you ran before choosing your ORM. The PR review comment that explained why the abstraction was wrong. None of that compounded into Stack Overflow's index — it evaporated when the Slack message disappeared or the terminal session closed. When a new contributor joins a project and asks "why did we use SQLite instead of Postgres?", that answer is in someone's head or in a Slack message from 2 years ago — not on Stack Overflow. Akashik is designed for that knowledge: private, in-progress, context-rich, never published — and the availability concern (offline peers) is real and documented honestly, but for a tool that runs as a daemon on a developer's machine and stores only what *that developer has asked about*, the latency added by federation fan-out is 50-200ms to peers, which is faster than a Google search and cheaper than a Stack Overflow question that gets ignored.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:595:The Akashik pitch is OSS commons, not B2B. But the first enterprise customer (a company wanting to run Akashik as an internal knowledge layer for their engineering team) will send a security questionnaire. The architecture needs answers for:
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:609:Round 2 got the diagnostic framing right (R@50=1.0 on LME-S, 60pp headroom on LoCoMo).
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:612:Three rounds of consistent empirical work produced: (a) a clean retrieval pipeline at 75.22% BEIR SciFact NDCG@10 (CPU-only, competitive with published baselines), (b) 0.9202 LME-S R@5 (within 3pp of the published leader, retrieval-only, no LLM judge), (c) clear evidence that cross-encoder rerank doesn't help on these benchmarks, (d) clear evidence that small local LLMs don't help on LoCoMo, (e) E11 as the only write-path intervention with consistent positive signal.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:624:- Cross-encoder rerank experiments (3 empirical nulls on LME-S, 1 regression on BEIR — this is concluded)
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:626:- LME-S R@5 race toward 0.952 (wrong mission frame; Akashik doesn't compete on single-peer leaderboards post-pivot)
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:632:**The absence of a working two-peer demo.** Without a live demonstration that Step 5 actually happens — that B's query is answered by A's research, attributed, faster than a web search — the compounding claim is a mechanism doc, not a product. Every investor, contributor, and early adopter will ask: "can you show me the compounding?" The current answer is: no, because there's no instrumented multi-peer test. That's the most important thing to fix before anything else.
./docs/product/BENCHMARKS.md:152:| locomoFactualF1 | 0.10 | **0.8640** | 0.0864 | 4-persona × 40-session × 6-month synthetic LoCoMo — harmonic mean of evidence-recall (0.833) AND answer-token-containment (0.897) |
./docs/product/BENCHMARKS.md:161:#### LoCoMo scorer choice (Phase 23.6.1)
./docs/product/BENCHMARKS.md:163:First Phase 23.6 cut measured LoCoMo via token-F1 between the FULL retrieved-summary text and the SHORT gold-answer string. That metric is mathematically pinned tiny (long summary + short gold = bad precision no matter how good retrieval is) and gave a misleading 0.14 even when evidence-recall was 0.83. Fixed in Phase 23.6.1:
./docs/product/BENCHMARKS.md:195:- `locomo-synth` — 4-persona × 40-session × 6-month synthetic conversational corpus covering LoCoMo's long-horizon factual recall + temporal/causal reasoning axes. 30 queries with declared evidence-session ground truth; dimension scored on evidence-session retrieval recall (retrieval-only, no answer extractor). Real LoCoMo + extractor pending Phase 23.7+.
./docs/product/BENCHMARKS.md:225:The benchmark structure was synthesised against a 30+-paper survey covering memory benchmarks 2023–2026 — including LongMemEval-S/M/V2 (ICLR 2025, arxiv 2410.10813), LoCoMo (EMNLP 2024, arxiv 2402.17753), BEAM (ICLR 2026, arxiv 2510.27246), EpBench (used by GSW, arxiv 2511.07587), ConvoMem (Salesforce, arxiv 2511.10523), MemoryAgentBench (arxiv 2507.05257), Mem^p Procedural Memory (arxiv 2508.06433), and BCC for Bayesian-update calibration (arxiv 2507.17951). Coverage matrix + gap analysis in `.planning/phases/phase-23/23-CONTEXT.md`.
./docs/product/BENCHMARKS.md:231:| agentmemory (rohitg00) | LongMemEval-S R@5 | 95.2% | retrieval-only, public benchmark |
./docs/product/BENCHMARKS.md:234:| mem0 | LoCoMo composite | 92.5 | mem0 ECAI 2025 |
./docs/product/BENCHMARKS.md:236:| MemMachine | LoCoMo (gpt-4.1-mini) | 0.9169 | |
./docs/product/BENCHMARKS.md:239:| **wellinformed** (Hetzner, Phase 23.7 real public corpora) | unified composite | **0.8597** | real BEIR SciFact + LongMemEval-S oracle + LoCoMo factual; synthetic in 5 of 9 dimensions |
./docs/product/BENCHMARKS.md:241:Direct apples-to-apples comparisons land in Phase 23.5 when the real LongMemEval-S / LoCoMo / BEIR SciFact / HotpotQA full adapters ship. Until then the composite is comparable across our own commits as a regression ratchet, not against external systems.
./docs/product/BENCHMARKS.md:287:3. **Real LoCoMo factual F1 = 0.3536 vs synth 0.864** is the brutal one — real LoCoMo has 3+ gold evidence sessions per question often, and strict-recall (`every gold tag in top-3`) is unforgiving. mem0's 92.5 LoCoMo composite uses an **LLM judge over accuracy**, not retrieval-only — directly comparable only via the Phase 23.8 SQuAD-F1 path (`WELLINFORMED_BENCH_LLM_EXTRACTOR=1`).
./docs/product/BENCHMARKS.md:309:The 0.9202 lands within a hair of ByteRover's claimed 92.8% on the same public benchmark — *retrieval-only, no LLM judge*. agentmemory claims 95.2%; we're 3pp behind their best path. Hetzner CAX11, ~110 min wall-time.
./docs/product/BENCHMARKS.md:311:#### LoCoMo with qwen2.5:1.5b SQuAD-F1 extractor (Mac M-series)
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:376:The three steps form a diagonal flow — visualizing the "compounding"

codex
I found the prior Round 4 materials and the project’s benchmark notes. Next I’m reading the round synthesis plus the retrieval/federation docs so the answer stays aligned with the project’s own empirical state rather than drifting into generic prior-art comparison.
exec
/bin/zsh -lc "sed -n '1,240p' docs/research/octopus-discover/round-4-2026-05-26/synthesis.md" in /Users/saharbarak/personal/wellinformed
 succeeded in 0ms:
# PROBE Phase Synthesis
## Discovery Summary - יום ג׳ מאי 26 2026 17:11:12 IDT
## Original Task: -P FOURTH-ROUND analysis. Prior three octopus-discover rounds advanced the project through: (1) initial menu of retrieval-quality experiments, (2) empirical pushback on the cross-encoder null, (3) metric-blindness diagnosis + write-path enrichment validation. We've now measured everything those recommendations asked for AND made a fundamental project-identity pivot. Need help triangulating where next.

================================================================
PROJECT IDENTITY (changed since last round)
================================================================

The project pivoted from "wellinformed: agent-memory product" to
"Akashik: federated knowledge commons for the open-source community as a whole."

The mission is to give the OSS community what it has always lacked:
a shared, contributor-owned memory substrate where every piece of
reading, debugging, and figuring-out compounds into the community's
collective progress — generation after generation, signed and
attributed, forever.

The brand name borrows from the Akashic Records mythology, reframed
as concrete contributor-owned infrastructure. The codebase is still
called "wellinformed" internally.

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

exec
/bin/zsh -lc "sed -n '1,240p' docs/research/octopus-discover/round-4-2026-05-26/README.md" in /Users/saharbarak/personal/wellinformed
 succeeded in 0ms:
# Octopus discover — Round 4 (2026-05-26)

Multi-LLM discover round run after:
- Three prior rounds (2026-05-21, 2026-05-24, 2026-05-26 morning)
- The pivot from `wellinformed` (agent-memory product) to **Akashik**
  (federated knowledge commons for the OSS community)
- The articulation of the **compounding mechanism** (peer-local
  storage, federation-on-query, web-on-miss, save-locally,
  transfer-on-next-ask)
- The introduction of NDCG/MRR metrics (Phase 23.15) revealing
  E11 lift on LoCoMo and the order-sensitive view of LME-S

## The brief

8 questions across strategy, mission, mechanism novelty, real
competitor identification, launch design, attack-surface analysis,
and the strongest counter-argument against the entire project.
Verbatim brief is in `synthesis.md`.

## Files

- `synthesis.md` — the final octopus-emitted synthesis. **Partial**:
  only the gemini synthesizer's codebase-reality-check +
  mandatory-systemic-perspectives section made it through. Direct
  answers to Q1-Q8 are scattered across the probe files.
- `probes/codex-0.md` — codex probe #0 (58 KB)
- `probes/gemini-1.md` — gemini probe #1 (24 KB)
- `probes/claude-sonnet-2.md` — claude-sonnet probe #2 (54 KB)
- `probes/codex-3.md` — codex probe #3 (65 KB; longest)
- `probes/gemini-4.md` — gemini probe #4 (25 KB)
- `probes/claude-sonnet-5.md` — claude-sonnet probe #5 (37 KB)

## Headline outputs

### From the synthesis (gemini codebase audit, 8 launch-blocker findings)

1. CLI↔daemon IPC has no auth — local trust boundary gap
2. 60 s cache TTL with no stagger — thundering herd risk
3. No quarantine table for malformed nodes during schema migrations
4. Metric cardinality bomb avoided ✓ but observability sacrificed
5. No runbooks — bus factor = 1; no recovery path for corrupted
   vector index / split-brain CRDT / dial storms
6. CI supply chain: `npm ci` + `bash bootstrap.sh` + recursive
   submodules can exfil GITHUB_TOKEN before SLSA provenance step
7. No HTTP-style auth taxonomy (no 401/403/429 equivalents)
8. No data-exfiltration audit trails — SOC2 Type II will fail

### From the probes (extracted by re-reading directly)

Direct Q1-Q8 answers will be synthesized into `round-5-2026-05-26/`
via a follow-up discover run with an explicit "answer Q1-Q8
directly" brief.

## Next round

Round 5 is a focused re-run requesting direct answers to Q1-Q8
from the round 4 brief, since the round 4 synthesizer focused on
the codebase audit instead of fusing the strategy answers.

exec
/bin/zsh -lc "sed -n '1,260p' docs/research/beat-the-competitors-retrieval-plan.md" in /Users/saharbarak/personal/wellinformed
 succeeded in 0ms:
# How wellinformed beats the retrieval leaderboard (forward plan)

**Status:** strategic sketch — Phase 24 candidate ratchets
**Drafted:** 2026-05-21
**Anchor numbers (Phase 23.7+ measured):**
| Benchmark | wellinformed | Competitor best | Gap |
|---|---:|---:|---:|
| LongMemEval-S R@5 (50-distractor, n=500) | **0.9202** | agentmemory 0.952, ByteRover 0.928 | -3pp / -0.6pp |
| LongMemEval-S R@5 (oracle) | 0.9990 | (at ceiling) | — |
| BEIR SciFact NDCG@10 (5,183 docs × 300 q) | **0.7202** | ColBERTv2 SOTA ~0.7522 | -3pp |
| LoCoMo harmonic-mean (n=699, retrieval-only) | 0.3536 | mem0 0.925 (LLM-judge) | not comparable |
| LoCoMo SQuAD-F1 (qwen2.5:1.5b extractor) | 0.1602 | (no published SQuAD-F1) | new axis |

The honest read: we are **0.6pp** below ByteRover, **3pp** below agentmemory, on the actual public LongMemEval-S benchmark — retrieval-only, no LLM judge. That gap is closeable.

## 1. Loss analysis — where the points actually live

Per-question-type R@5 on LME-S 50-distractor (n=500):

| Question type | n | R@5 | Headroom |
|---|---:|---:|---:|
| single-session-assistant | 56 | 1.000 | 0 |
| knowledge-update | 78 | 0.974 | ~2 pts |
| multi-session | 133 | 0.905 | ~10 pts |
| temporal-reasoning | 133 | 0.871 | ~13 pts |
| single-session-preference | 30 | 0.867 | ~13 pts |

**Where the recoverable mass is:**

1. **multi-session (0.905, 133 q)** — needs evidence from ≥2 sessions in top-5. Single-shot retrieval can't always grab both. Bi-encoder cosine doesn't compose well across hops.
2. **temporal-reasoning (0.871, 133 q)** — "earliest / latest / before X" doesn't naturally rank by date in vector space. Time is implicit at best.
3. **single-session-preference (0.867, 30 q)** — preferences stated once with different vocabulary than the question uses. Pure semantic gap.

Note small-N caveat on single-session-preference (30 q) — one bad retrieval costs 3.3pp.

## 2. Inventory — what's already in the codebase

Primitives that exist but are NOT in the bench retrieval path:

| Primitive | Where | Bench-path? | Note |
|---|---|---|---|
| Cross-encoder rerank (ms-marco-MiniLM-L-6-v2) | `src/application/ask.ts:436-441` + `src/domain/cross-rerank.ts` | **No** | Gated behind `WELLINFORMED_RERANK=1`; benches call `searchByRoom` directly, bypass `ask()` |
| Personalized PageRank rerank | `src/application/ask.ts:444` | **No** | Same — only in `ask()` |
| Mention enrichment (`buildHit`) | `src/application/ask.ts:448` | **No** | Same |
| Cross-room federated search | `src/application/use-cases.ts` | **No** | Benches scope to one room |
| Binary-quantized hot cache | `src/domain/binary-quantize.ts` | No | Hot-cache layer for query latency, not quality |
| Hyperbolic embeddings | `src/infrastructure/embedders.ts` | No | Experimental Phase 22+ |
| LLM extractor (Phase 23.8) | wired into `bench-locomo-real` | partial | LoCoMo-only |

Primitives that don't exist yet but would lift the gap:

- HyDE query expansion
- Multi-query expansion (RAG-Fusion-style 3-5 reformulations + RRF)
- Iterative multi-hop retrieval (retrieve → entity-extract → re-retrieve)
- Time-aware reranking for temporal queries
- Fine-tuned bi-encoder on held-out LongMemEval domain
- Late-interaction retrieval (ColBERTv2-style)

## 3. Experiment menu — impact / effort matrix

Ranked by `(expected lift on LME-S R@5)/(implementation hours)`:

| # | Experiment | Lift estimate | Effort | Rationale |
|---|---|---:|---|---|
| **E1** | **Wire cross-encoder rerank into the bench path** | **+2 to +5pp** | **1-2 h** | ms-marco MiniLM rerank typically lifts NDCG@10 by 3-8 points on BEIR; should generalize. Code already exists, just not invoked. |
| **E2** | Upgrade embedder: all-MiniLM-L6-v2 → bge-base-en-v1.5 (768-dim, top-MTEB) | +3 to +6pp | 1 h | Single-line model change. BGE-base on SciFact = 0.7308 NDCG@10 vs all-MiniLM 0.6440 (BEIR table). |
| **E3** | Upgrade to nomic-embed-text-v1.5 (768-dim, **8192-ctx**) | +2 to +5pp | 1 h | The 8192-ctx eliminates silent truncation on multi-session conversational evidence. Long context = better recall on `multi-session` and `temporal-reasoning` types. |
| **E4** | HyDE: Ollama-generate synthetic answer per question, embed + retrieve | +2 to +4pp | 4-6 h | Highest impact on `single-session-preference` (rephrasing gap). Reuses existing Ollama client. Adds ~500 LLM calls/bench. |
| **E5** | Multi-query expansion (3 reformulations + RRF fuse) | +1 to +3pp | 3-4 h | Helps `multi-session` by hitting different facets. Adds 3× retrieval cost. |
| **E6** | Time-aware reranking when query contains temporal keywords | +3 to +6pp on temporal subset | 2-3 h | Targeted at `temporal-reasoning` (0.871). Detect "earliest / latest / before / after / first / last" → boost by date. |
| **E7** | Iterative two-hop retrieval (entity extract → re-retrieve) | +3 to +5pp on multi-session | 6-8 h | Largest theoretical win for `multi-session`. Requires entity extraction at query time. |
| **E8** | Fine-tune bi-encoder on held-out LME pairs | +5 to +10pp | 2-3 days | Highest absolute lift but requires GPU + train infra. Risk: overfits to LME, regresses BEIR. |
| **E9** | Activate PPR rerank in bench (already wired in `ask`) | +0 to +2pp | 1 h | Free if E1 is done — both come together by routing through `ask()`. Per HANDOFF the PPR is in `ask.ts`; same bypass issue. |

## 4. Recommendation — bench-doable in ~1 day

**The plan that lands inside this week:**

```
E1 + E9 (route benches through ask())  →  +2-5pp     1 day  ← first
E2 (BGE-base embedder)                  →  +3-6pp    1 day  ← second
E3 (nomic-embed for long context)       →  +2-5pp    1 day  ← OR vs E2

Combined plausible end-state:
  LongMemEval-S R@5      0.9202  →  0.96-0.98   (beats agentmemory 0.952)
  BEIR SciFact NDCG@10   0.7202  →  0.78-0.82   (beats ColBERTv2 0.7522)
```

If those land, **wellinformed becomes the published-leaderboard leader on LME-S** with a fully open-source, CPU-only, retrieval-only pipeline. No LLM judge, no GPT-4 reasoning loop, no closed-weight model — just a clean hybrid sparse+dense+rerank+graph pipeline that beats the proprietary stacks.

**E4 / E5 / E6 / E7** are second-wave once E1–E3 are measured. They target the *remaining* loss after the easy wins — by then we'll know which question types are still bleeding.

**E8 (fine-tuning)** is the nuclear option. Park it. We don't need it to hit SOTA.

## 5. First-experiment design (E1: cross-encoder rerank in bench path)

Concrete diff:

```
// In each bench-*-real.test.ts, around the searchByRoom call:
//
// Today:
//   const r = await searchByRoom({ graphs, vectors, embedder })({ room, text, k: K });
//
// E1 path — pull rerank into the test:
//   const reranker = process.env.WELLINFORMED_RERANK === '1'
//     ? crossEncoderFromEnv() : null;
//   const r0 = await searchByRoom({ graphs, vectors, embedder })({ room, text, k: K * 4 });  // 4x candidates
//   const matches = r0._unsafeUnwrap();
//   const reranked = reranker
//     ? (await rerankMatches(text, matches, docTextOf, reranker))
//         .map((xs) => xs.slice(0, K))
//     : ok(matches.slice(0, K));
```

Run with `WELLINFORMED_RERANK=1` env on the Hetzner box. Compare against today's 0.9202 number. If lift is real, ship.

**Risk:** cross-encoder adds ~10ms/match latency. With K=5 reranked from 20 candidates, that's 200ms/query × 500 q = 100s added to LME-S run. Cheap.

**Risk #2:** the ms-marco model might underperform on conversational LongMemEval — it was trained on web-search pairs. If E1 underdelivers, fall back to E2/E3 first.

## 6. Stretch — Phase 24 candidates

Once leaderboard-leading on retrieval, the next frontier is **hybrid retrieval + LLM extraction with SQuAD-F1 + LLM-judge as competing axes in the composite**. That makes wellinformed comparable to mem0's 92.5 LoCoMo composite — different scoring philosophy, head-to-head. Phase 23.8 already laid the SQuAD-F1 foundation; Phase 24 adds the judge axis.

Beyond that: **federated retrieval** (the unique wellinformed bet) — measure how P2P-shared rooms across multiple peers lift recall on out-of-distribution questions, vs single-peer baselines. No public benchmark covers this today; we'd publish one.

---

## 7. Multi-LLM research update (2026-05-21 — Octopus discover, 6 probes)

After running this brief through claude-octopus `discover -P` (Codex × 2 + Claude-sonnet × 2 + Gemini × 2), the synthesis surfaced **three high-ROI techniques that were missing from my E1-E8** plus several revisions to the existing plan. The key conceptual shift: I was thinking purely *read-path*; write-path interventions compound with all read-path techniques at **zero query-time latency**.

### 7.1 Three new candidates — should rank above several of my originals

| # | Technique | What it is | Targets | Lift est. | Effort |
|---|---|---|---|---:|---|
| **E10** | **Temporal Query Gate + recency-disable** | Classifier detects temporal queries ("when", "before", "earliest", "latest", "first", "last"). For matched queries, disable recency boost and substitute a temporal-distance scorer over date metadata. | temporal-reasoning **13pp** | +5–10pp on temporal subset | 2-3 h |
| **E11** | **Rule-based contextual enrichment (write-path)** | Prepend structured metadata (date, room/persona, participants, top-K extracted entities) to each session's text *before* embedding. Like Anthropic's Contextual Retrieval but rule-based — no LLM call, zero ingest cost beyond regex/NER. | multi-session **10pp**, temporal **13pp** | +3–5pp aggregate | 3-4 h |
| **E12** | **Write-path contradiction chains (`superseded_by`)** | mem0-style write-time classifier marks older conflicting preference nodes as `superseded_by` newer ones. At query time, filter or down-weight superseded nodes. Solves stale-preference pollution structurally. | single-session-preference **13pp** | +5–10pp on preferences | 4-6 h |

All three are **write-path** — they pay their cost at consolidation/index time, not query time. They also compound with E1 (cross-encoder rerank) and E2/E3 (embedder swap) — no cancellation per the synthesis.

### 7.2 Revisions to E1-E8 based on the synthesis

- **E1 reranker model**: don't just activate `ms-marco-MiniLM-L-6-v2` — *also swap the model*. The ms-marco reranker was trained on web-search ranking pairs and is **domain-mismatched for conversational memory** (which resembles a semantic-entailment task). Universal recommendation across probes: swap to **`mxbai-rerank-base-v1`** or an NLI-based cross-encoder. Same activation work; better model. Effort still ~2 h.
- **E4 (HyDE)**: gate **off** for temporal and multi-session queries. Synthesis warns HyDE actively backfires in high-distractor environments — if the LLM hallucinates a wrong date or entity in the hypothetical document, dense search pulls in highly convincing false positives. Apply HyDE only to single-session and ambiguous-vocabulary queries.
- **Late-interaction (ColBERTv2 / PLAID)**: **abandon** as a primary retrieval path. The full-corpus late-interaction index doesn't fit the Hetzner CAX11 4GB RAM constraint and isn't a natural fit for `sqlite-vec`. Only viable form is `Jina-ColBERT-v2` as a **second-stage reranker** on top-20 candidates — and even then, projected lift is small on LME-S vs other options.
- **MTEB top models (gte-Qwen2-7B, NV-Embed-v2)**: **abandon** for inference; can't fit 4GB ARM. Stick with bge-base / nomic-embed for the embedder swap. Larger models could be used to *generate synthetic training pairs* offline (E8 territory).
- **SPLADE-v3**: don't pursue in the first wave. It would replace BM25 but the storage + ingestion cost is high (~30k-vocab sparse vectors, no native `sqlite-vec` support; needs a parallel inverted index). Defer until after E1-E3 + E10-E12 are measured.
- **CRAG / Self-RAG / reasoning-augmented retrieval**: defer. They inject LLM calls into the retrieval loop, breaking the "no LLM in hot path" stance. Useful only as fallback when initial retrieval confidence is low — Phase 25 candidate.

### 7.3 Updated top-3 sprint hit-list (replaces §4)

Revised after multi-LLM synthesis:

| Rank | Action | Targets | Lift est. | Effort | Why this order |
|---|---|---|---:|---|---|
| **1st** | **E1' (rerank wired + mxbai-rerank-base-v1)** | All types | +3-7pp | 2-3 h | Free lift; activates a code path already wired but bypassed; new model is a single ONNX swap. |
| **2nd** | **E11 (contextual enrichment)** | multi-session, temporal | +3-5pp | 3-4 h | Write-path → compounds with everything. Single-pass re-index of LoCoMo + LME-S sessions to validate. |
| **3rd** | **E10 (temporal query gate)** | temporal-reasoning **specifically** | +5-10pp on temporal subset | 2-3 h | Direct attack on our weakest large-N type. Pure routing logic, no model swap. |

**Plausible combined end-state after this sprint:**
```
LongMemEval-S R@5       0.9202  →  0.965-0.975   (clears agentmemory 0.952)
LongMemEval-S temporal  0.871   →  0.93-0.97     (closes 6-10pp of 13pp gap)
LongMemEval-S multi     0.905   →  0.94-0.96     (closes 3-5pp of 10pp gap)
BEIR SciFact NDCG@10    0.7202  →  0.75-0.79     (clears ColBERTv2 0.7522)
```

Then E12 (write-path contradiction) + the original E2/E3 (embedder swap) become the second-week sprint targeting single-session-preference and the BEIR ceiling.

### 7.4 Compound vs cancel — empirical notes from the synthesis

- ✅ **Compounds:** rerank ⊕ contextual-enrichment ⊕ temporal-gate ⊕ predecessor-chains. All operate on different stages.
- ✅ **Compounds:** embedder upgrade (bge / nomic) ⊕ cross-encoder rerank. Standard BEIR finding.
- ⚠️ **Cancels:** HyDE ⊕ high-distractor temporal queries → HyDE drags retrieval *down* by 2-5pp on those subsets. Must be query-type-gated.
- ⚠️ **Cancels:** ms-marco rerank ⊕ conversational queries → domain mismatch; swap to NLI/entailment-trained reranker.
- 📊 **Diminishing returns:** rerank + multi-query + HyDE + multi-hop all stacked → published systems plateau around +8-12pp combined over the bi-encoder baseline. We're already at 0.92 LME-S; absolute ceiling on this benchmark with retrieval-only is probably ~0.97-0.98.

### 7.5 Operational gaps the synthesis flagged (not retrieval-quality but worth filing)

These are Phase 25+ but worth recording so they don't get lost:

- **CI/CD checksum pinning** — `model-checksums.json` for the Xenova ONNX weights to prevent supply-chain attacks (the bge-base defective-conversion incident is the precedent).
- **2-minute regression smoke bench** — small subset of LME-S / SciFact in CI so quality regressions can't ship silently.
- **Bus factor on `wellinformed-rs`** — Rust ARM cross-compile is specialized knowledge; consider TypeScript-only fallback path.
- **GDPR derived-data semantics** — contextual enrichment + contradiction chains create *derived* personal data that must map back to source turns for delete-by-user compliance.

Source: `~/.claude-octopus/results/probe-synthesis-1779351019.md` — 6 multi-LLM probes synthesized by Gemini-2.5-Pro, 2026-05-21. Full transcript preserved in claude-octopus state.

exec
/bin/zsh -lc "sed -n '1,240p' docs/marketing/how-akashik-works.md" in /Users/saharbarak/personal/wellinformed
 succeeded in 0ms:
# How Akashik works

The shortest accurate description of the mechanism that makes
Akashik possible. Written for the reader who has heard "federated
knowledge graph" and wants to understand *exactly* what's
distributed, *what* gets cached, *when* the network reaches out
to the web, and *who* ends up holding which piece of the record.

This is the architecture, not the marketing copy. The marketing
copy lives in [`storybrand-messaging-draft.md`](./storybrand-messaging-draft.md).

## The one-paragraph version

Each Akashik peer holds **only its own information** — what its
user contributed, what it pulled from other peers in response to
its user's questions, and what it researched on the web when the
federation couldn't satisfy a query. When you ask Akashik
something, it asks your local graph first, then asks every peer
you're federated with for *their two cents*. If the federation
can't answer with confidence, the harness reaches out to the web,
finishes the research, and **saves the result locally on the peer
that asked** — that peer becomes the "ambitioned" curator of that
piece of knowledge. The *next* user who asks a similar question
gets that research transferred from the ambitioned peer (if
they're online), without anyone having to know it existed. Every
query is a potential cache-fill, every web-fetch becomes someone's
local commons, and the network's working set grows by *what its
contributors are curious about* — not by what a central planner
decided to ingest. **Time-to-answer drops every time anyone in
the network does work.** That compound is the entire mission.

## The mechanism in five steps

```
                ┌─────────────────────────────────────────────────┐
                │  USER A asks: "How does mxbai-rerank compare    │
                │   to cross-encoder on long contexts?"           │
                └─────────────────────────────────────────────────┘
                                    │
                                    ▼
   ─── STEP 1 ─────────────────────────────────────────────────
       Query A's LOCAL Akashik graph
       Hit?  → return; done. (Cheapest path. Zero network.)
       Miss? → continue.
   ────────────────────────────────────────────────────────────
                                    │
                                    ▼
   ─── STEP 2 ─────────────────────────────────────────────────
       Fan out to connected PEERS in A's shared rooms
       Each peer answers with "two cents" — whatever they've
       saved or previously researched that matches.
       Results merge via RRF into a candidate set.
   ────────────────────────────────────────────────────────────
                                    │
                                    ▼
                   ┌────────────────┴───────────────┐
                   │ Federation answered?           │
                   │  ├── Yes (confident) → return  │
                   │  └── No (or low confidence)    │
                   └───────────────┬────────────────┘
                                    │
                                    ▼
   ─── STEP 3 ─────────────────────────────────────────────────
       Harness performs WEB RESEARCH on A's machine
       (WebSearch / WebFetch / arxiv pull / etc.)
       This is the only time the network reaches outward.
   ────────────────────────────────────────────────────────────
                                    │
                                    ▼
   ─── STEP 4 ─────────────────────────────────────────────────
       Result is SIGNED BY A and saved to A's local graph
       A becomes the "ambitioned" curator of this knowledge.
       Provenance: A's DID, timestamp, source URLs, room.
   ────────────────────────────────────────────────────────────
                                    │
                                    ▼
   ─── STEP 5 ─────────────────────────────────────────────────
       Later, USER B asks a similar question
       Federation fan-out reaches A's peer (if online)
       A's research transfers to B with original attribution
       Cost of the research: paid once, by A. Benefit: ∞.
   ────────────────────────────────────────────────────────────
```

## What each peer actually stores

| Bucket | Contents | Source |
|---|---|---|
| **Self-contributed** | Things the user explicitly saved (`akashik save <url>`, codebase indexing, manually-typed notes) | The user |
| **Pulled** | Nodes received from federated peers in response to the user's own queries | Federation, with provenance |
| **Researched-on-miss** | Web research results that were fetched on the user's machine because the federation couldn't satisfy a query | Web, attested by the curator |
| **NOT stored** | Anything other peers saved that this user never asked about | — |

The fourth row is the key. No peer holds the global graph. There
is **no global graph**. Each peer's local store is exactly the
slice that's been pulled into use through that user's curiosity
plus their direct contributions. This is what makes it scale to
the whole open-source community without becoming someone's
2-terabyte sync nightmare.

## Why "ambitioned" matters

When User A's query triggers web research, A's machine does the
fetching, A's machine does the embedding, and A's local graph
stores the result. **A is now the ambitioned curator** of that
particular piece of knowledge for the network.

This matters for four reasons:

1. **Provenance lives where the work happened.** The reader who
   queries A's research six months later sees A's DID, A's room,
   the date, the source — not a faceless "Akashik says". Knowledge
   has authors.
2. **Cost lives where the curiosity was.** A paid the network
   roundtrip + the web fetch. B, C, D who query later pay
   nothing. The "ambitioned" framing is the natural answer to
   "who pays for the compounding?" — the curious user pays once,
   the community benefits forever.
3. **Trust is graph-traversable.** If you don't trust the
   research, you can follow the chain: who curated it, who they
   are, what room they're in, what they linked to. There's no
   "trust the platform" because there's no platform.
4. **Curiosity drives the network's working set.** The faster a
   topic gets queried, the more peers end up with it cached. The
   network's hot data is exactly what the community is currently
   curious about. Nobody has to plan ingestion; the curiosity of
   the contributors plans it.

## What happens when a peer goes offline

This is the honest trade-off and we don't paper over it.

If User A is offline when User B asks a question only A's local
graph holds:

- B's local-first query misses (A's research isn't on B's disk).
- B's federation fan-out reaches A's peer ID but gets no response
  (A is offline).
- B falls through to web research themselves.
- B is now an ambitioned curator of their own version of that
  research.
- Some duplication. Some redundancy. Both A and B now hold
  attestable versions of the same investigation.

Two notes:

- This is fine and arguably *good*. Multiple independent curations
  of the same topic strengthen the record (more provenance, more
  perspectives).
- Mitigations exist for popular topics: peers can opt into
  caching anything that crosses a "frequently queried" threshold
  in their room. The default is "cache only what I asked for";
  the opt-in is "also cache the room's hot items".

This is identical to the property every decentralized system has:
**availability follows participation**. Akashik doesn't pretend
otherwise.

## Why this beats every existing alternative

Other "shared memory" or "team knowledge" products try to be a
single source of truth and either need a central server, a
sync daemon, or full replication of the entire graph on every
node. All three are wrong for the OSS community as a whole:

| Approach | Problem |
|---|---|
| Central server (Notion, Slack, "team memory" SaaS) | Vendor owns the data; pricing/privacy changes can lock you out; doesn't scale to community-of-millions ownership |
| Full-graph replication on every node | Disk cost compounds linearly with community size; new joiners face a multi-GB-to-multi-TB sync; trivially DoS-able by spam contributions |
| Per-room private CRDTs (Roam-style multiplayer) | Closed by default; doesn't compound across rooms; no path to community-wide commons |

Akashik's **"each peer holds only what it has asked for or
contributed"** model neatly avoids all three. The community's
knowledge is replicated *to the precision of demand* — popular
items get cached on many peers, fringe items live on one peer
with original provenance, and disk cost on every peer scales with
*that peer's own curiosity*, not with the community's total
contribution volume.

## Compounding, stated formally

For any topic `T` in the network:

- Let `Q(T, t)` = number of times anyone has asked about `T` by
  time `t`.
- Let `R(T, t)` = number of peers currently holding a cached
  answer for `T` at time `t`.

Then by construction:

```
R(T, t) ≤ Q(T, t)
```

(R grows by 1 each time a previously-uncached peer asks about T
and pulls it.) The interesting property:

```
expected_time_to_answer(T)  ~  1 / R(T, t)
```

The more peers cache `T`, the faster the next query lands. And
`R(T, t)` is **monotonically non-decreasing** under the
mechanism — it only grows. Knowledge that's been
researched anywhere in the network gets faster to retrieve
everywhere.

This is the compounding. It's not a marketing claim; it's a
property of the architecture.

## Privacy: who sees what

| Type of data | Who sees it |
|---|---|
| Your local contributions in a public room | Anyone federated in that room can pull on query |
| Your local contributions in a private room | Only peers you've explicitly shared the room with |
| Your queries | Local to you; the federation sees only what you choose to fan out |
| Web research you did to satisfy your own query | Saved locally; shared via your peer ID with the room you queried from |
| Anything you never saved or researched | Doesn't exist on your peer; nothing to leak |

The default is **privacy-by-construction**: a peer literally
cannot expose what it doesn't hold. No data-erasure migration
required for a node that was never indexed.

## Reading the network

Public peers (and there can be many) expose a read-only browse
endpoint that shows the records held by that peer + freshness +
provenance chains. This is the "Browse the record" entry point
for newcomers who want to see what's already in the federation
before contributing. No login. No account. Just a peer URL.

## See also

- [`storybrand-messaging-draft.md`](./storybrand-messaging-draft.md) — Brand messaging that this mechanism credibility-anchors.
- `docs/research/beat-the-competitors-retrieval-plan.md` — The retrieval-quality work that backs each peer's individual lookups.
- The protocol spec (TBD — link when the public spec lands).

web search: 
web search: RFC 8569 Content-Centric Networking (CCNx) Semantics and Messages ...
web search: 
web search: AT Protocol official specification repo ...
web search: 
web search: github bluesky-social atproto repo official ...
web search: 
web search: LongMemEval arXiv 2410.10813 official ...
web search: 
web search: Wikipedia anti-vandalism revision history paper arxiv ...
codex
I have the project’s own Round 4 brief and benchmark notes. I’m now pulling just the most relevant prior probe passages for Q1-Q8 and cross-checking the outside references so the final synthesis names concrete neighbors instead of hand-waving at categories.
exec
/bin/zsh -lc "sed -n '620,760p' docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md" in /Users/saharbarak/personal/wellinformed
 succeeded in 0ms:
| 2-3 | FCB instrumentation + 2-peer integration test | Only measurement that validates the mission claim; currently zero |
| 3-4 | Coordinator server for cross-router peer discovery | mDNS doesn't cross routers; launch requires a coordinator for non-LAN peers |

**What to stop doing:**
- Cross-encoder rerank experiments (3 empirical nulls on LME-S, 1 regression on BEIR — this is concluded)
- Listwise LLM rerank with local models (hardware constraint, not algorithm constraint)
- LME-S R@5 race toward 0.952 (wrong mission frame; Akashik doesn't compete on single-peer leaderboards post-pivot)

**The one thing most likely to kill this project:**

Not the retrieval quality. Not the competitor landscape. Not the benchmark numbers.

**The absence of a working two-peer demo.** Without a live demonstration that Step 5 actually happens — that B's query is answered by A's research, attributed, faster than a web search — the compounding claim is a mechanism doc, not a product. Every investor, contributor, and early adopter will ask: "can you show me the compounding?" The current answer is: no, because there's no instrumented multi-peer test. That's the most important thing to fix before anything else.

The architecture is sound. The retrieval is measured. The mission is clear. The gap is demonstration. Close it.
```

## Status: SUCCESS
# Completed: יום ג׳ מאי 26 2026 17:08:58 IDT

exec
/bin/zsh -lc 'rg -n "Q1|Q2|Q3|Q4|Q5|Q6|Q7|Q8|closest prior art|benchmark|launch plan|competitor|counter-argument|counter argument|novel|federation|compounding" docs/research/octopus-discover/round-4-2026-05-26/probes/*.md' in /Users/saharbarak/personal/wellinformed
 succeeded in 0ms:
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:32:  - what it researched on the web when the federation couldn't answer
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:38:The compounding loop, in 5 steps:
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:43:  STEP 3: If federation can't satisfy → harness reaches the web on
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:47:  STEP 5: Next user B asks similar question → federation fan-out
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:81:  Max rerank-only headroom on this benchmark: ~4pp NDCG@5.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:154:   capture the compounding loop architecturally and link to it
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:160:3. The Akashik mechanism (5-step compounding loop, peer-local
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:168:Q1. Given the empirical ceiling on LME-S R@5 (NDCG@5 headroom ~4pp,
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:172:    federation rather than tuning per-peer retrieval)? Where should
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:175:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:177:    architecturally novel, or is it a known pattern in disguise?
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:178:    Cite prior art. If it IS novel, what's the closest existing
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:182:Q3. There is NO existing public benchmark for "how much does a
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:184:    R@5 / NDCG@K / MRR benchmarks measure single-peer retrieval
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:185:    quality, not the compounding the mission claims. What
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:186:    benchmark would actually measure the mission? Could we
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:189:Q4. The Octopus has flagged "input-order bias" (Round 3) and
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:196:      (d) the comparison to competitor numbers (agentmemory 0.952
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:200:Q5. The Akashik mission requires the network to actually grow.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:201:    What's the smallest-viable launch plan that produces a
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:202:    meaningful compounding signal in the first ~30 days post-
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:205:    the compounding becomes visible to a new contributor visiting
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:208:Q6. The Akashik architecture relies on user curiosity as the
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:215:      (c) adversarial contributors flood the federation with
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:220:Q7. The competitor frame (mem0/agentmemory/ByteRover) was the
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:234:    Which of these is the closest competitor / collaborator / fork
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:237:Q8. Final philosophical question. The mission is "make the OSS
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:240:    counter-argument someone could make against this entire
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:245:  - Direct answers to Q1-Q8
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:246:  - For Q2: closest prior-art protocol or research paper, with
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:248:  - For Q3: a proposed benchmark for measuring federation-level
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:249:    compounding, with the metrics and the experimental design
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:250:  - For Q5: the smallest-viable launch plan (specific communities,
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:252:  - For Q7: definitive identification of the 2-3 systems that are
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:253:    actual competitors (not categories)
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:254:  - For Q8: the strongest counter-argument + a one-paragraph
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:264:Based on the extensive historical context, benchmarking data, and the strategic pivot toward an open-source knowledge commons, here is the synthesis of your fourth-round research.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:266:### Direct Answers to Q1-Q8
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:268:**Q1. LME-S Ceiling: Marketing vs. Engineering? Where should the next month go?**
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:269:Pushing the headline LME-S `R@3` from 0.9202 any closer to 1.0 is purely a **marketing exercise**. Your empirical data shows the head is saturated (`R@50 = 1.0000`). Chasing the remaining ~4pp NDCG gap on a 50-distractor benchmark is overfitting to a specific dataset rather than building a product. 
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:271:*   **The Tradeoff/Disadvantage:** Every engineering hour spent squeezing 1pp out of LME-S is an hour stolen from the core Akashik mechanism. Furthermore, optimizing for LME-S ignores the actual engineering fire: the LoCoMo benchmark’s 60pp recall headroom where current rerankers are fundamentally failing.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:272:*   **Next Month Focus:** Engineering must pivot to **federation resilience and routing**. The single-node retrieval is "good enough" for an MVP. The network’s ability to actually fan out queries, merge results, and handle offline peers without catastrophic latency is the existential bet.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:274:**Q2. Prior Art & Architectural Novelty of the Akashik Mechanism**
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:275:The Akashik mechanism (local + fan-out + web-on-miss + DID-signed save + transfer) is not entirely novel in its components, but its *composition* is unique.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:281:    *   *Strength:* It creates a zero-marginal-cost compounding loop. The network naturally forms a distributed vector database where storage is directly proportional to human utility.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:284:**Q3. Benchmark for Federated Compounding**
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:285:Existing benchmarks (`NDCG@10`, `MRR`) measure *isolated state*. To measure the mission, you must measure *network accumulation over time*.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:293:    *   *Strength:* This perfectly visualizes the mechanism. A successful FCD run will show an exponential decay curve—early queries burn tokens/web-calls, while later queries are instantly satisfied by the federation.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:294:    *   *Weakness/Tradeoff:* Simulated query distributions are sterile. Real-world queries experience semantic drift (a bug changes based on a new Node.js version). A benchmark that doesn't simulate temporal deprecation of facts will falsely inflate the compounding signal. 
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:296:**Q4. Known Pitfalls in Current Evaluations**
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:303:**Q5. Smallest-Viable Launch Plan (Day-30 Signal)**
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:304:To prove compounding, you need a high-density, high-churn micro-community where users frequently encounter the same obscure errors.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:313:**Q6. Curiosity Network Vulnerabilities**
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:318:**Q7. Real Existing Competitors (Systems, not Categories)**
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:322:3.  **IPFS / libp2p Ecosystem:** *Strength:* The actual infrastructure of decentralized data. *Weakness:* It is purely a storage primitive. It has no native semantic routing, no LLM integration, and no concept of "curiosity-driven" compounding.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:324:**Q8. The Strongest Counter-Argument & Response**
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:339:*   *Failed:* Cross-encoder models on specific subsets (domain mismatch), small local LLMs for listwise reranking (they don't beat bi-encoders on your data), and the underlying assumption that tweaking single-node recall would yield a distinct product advantage over centralized competitors.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:342:You must stop tuning embeddings and start **engineering the federation routing and trust mechanisms**. Your entire brand pivot rests on the claim: *"expected_time_to_answer(T) ~ 1 / R(T, t)"*. 
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:32:  - what it researched on the web when the federation couldn't answer
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:38:The compounding loop, in 5 steps:
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:43:  STEP 3: If federation can't satisfy → harness reaches the web on
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:47:  STEP 5: Next user B asks similar question → federation fan-out
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:81:  Max rerank-only headroom on this benchmark: ~4pp NDCG@5.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:154:   capture the compounding loop architecturally and link to it
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:160:3. The Akashik mechanism (5-step compounding loop, peer-local
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:168:Q1. Given the empirical ceiling on LME-S R@5 (NDCG@5 headroom ~4pp,
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:172:    federation rather than tuning per-peer retrieval)? Where should
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:175:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:177:    architecturally novel, or is it a known pattern in disguise?
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:178:    Cite prior art. If it IS novel, what's the closest existing
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:182:Q3. There is NO existing public benchmark for "how much does a
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:184:    R@5 / NDCG@K / MRR benchmarks measure single-peer retrieval
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:185:    quality, not the compounding the mission claims. What
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:186:    benchmark would actually measure the mission? Could we
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:189:Q4. The Octopus has flagged "input-order bias" (Round 3) and
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:196:      (d) the comparison to competitor numbers (agentmemory 0.952
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:200:Q5. The Akashik mission requires the network to actually grow.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:201:    What's the smallest-viable launch plan that produces a
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:202:    meaningful compounding signal in the first ~30 days post-
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:205:    the compounding becomes visible to a new contributor visiting
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:208:Q6. The Akashik architecture relies on user curiosity as the
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:215:      (c) adversarial contributors flood the federation with
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:220:Q7. The competitor frame (mem0/agentmemory/ByteRover) was the
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:234:    Which of these is the closest competitor / collaborator / fork
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:237:Q8. Final philosophical question. The mission is "make the OSS
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:240:    counter-argument someone could make against this entire
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:245:  - Direct answers to Q1-Q8
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:246:  - For Q2: closest prior-art protocol or research paper, with
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:248:  - For Q3: a proposed benchmark for measuring federation-level
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:249:    compounding, with the metrics and the experimental design
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:250:  - For Q5: the smallest-viable launch plan (specific communities,
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:252:  - For Q7: definitive identification of the 2-3 systems that are
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:253:    actual competitors (not categories)
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:254:  - For Q8: the strongest counter-argument + a one-paragraph
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:277:### Q1: The Engineering vs. Marketing Question on LME-S
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:281:*   **The Advantage:** Architecting the federation (CRDT sync, query fan-out, reputation) builds the actual moat—network effects—and directly realizes the OSS commons mission.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:282:*   **The Tradeoff/Risk:** By halting local retrieval tuning, we leave the LoCoMo recall gap (R@3=0.392) unresolved. If local semantic retrieval is too noisy for factual/niche queries, peers will fail to serve correct local data, forcing unnecessary web-misses and bottlenecking the compounding loop. 
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:285:### Q2: Architectural Novelty and Prior Art
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:286:The 5-step compounding mechanism is not fundamentally novel in distributed systems, but its application to **agent-driven semantic graph knowledge** is highly novel.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:292:### Q3: Benchmark for Federated Compounding
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:298:    1.  **Network-wide Cache Hit Rate (NCHR):** The percentage of queries satisfied by the federation without triggering a web-miss.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:303:### Q4: Known Pitfalls and Blindspots
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:307:*   **(c) Write-path enrichment (E11):** **Staleness compounding.** Enriching nodes with current dates locks context to a specific moment. If an API changes, the enriched node becomes factually wrong but maintains high semantic relevance.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:308:*   **(d) Competitor Baselines:** **Category error.** Comparing Akashik to Mem0 or AgentMemory on single-user benchmarks is structurally flawed. They are centralized, isolated silos. Akashik’s advantage is the network effect. Beating them on zero-shot local retrieval is nice, but irrelevant to the compounding mission.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:310:### Q5: Smallest-Viable Launch Plan
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:311:To prove compounding, the network requires extreme density, not breadth. Launching to "all open source" will result in a sparse, useless graph.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:317:    *   *Day 30:* The Compounding Signal event. A new user asks "How to fix CUDA OOM on RTX 3090 with Qwen 2.5 7B". Because a power user solved and cached this on Day 15, the new user receives the answer instantly from the federation, skipping a 2-minute Perplexity search.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:318:*   **Enterprise Angle:** Treat CI/CD pipelines as privileged read-only peers. When a CI build fails, it queries the federation for the error, demonstrating immediate value to enterprise OSS sponsors.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:320:### Q6: Curiosity as Propagation Signal (Risks & Solutions)
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:326:*   **(c) Misinformation Attack Surface:** Adversaries flood the federation with plausible-but-wrong answers.
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:330:### Q7: The REAL Competitors
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:331:The actual competitors are systems that substitute for the *behavior* of finding OSS knowledge. 
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:336:### Q8: The Strongest Counter-Argument & Response
docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:337:**The Counter-Argument:** *The "Garbage Compounding" (Poisoning/Staleness) Problem.* If an agent hallucinates a fix, or a valid fix becomes deprecated, it gets cached by Peer A. Peer B pulls it, caches it, and Peer C pulls it from B. The federation becomes a high-speed propagation network for confidently wrong or obsolete AI-generated answers, irreversibly polluting the OSS community's context window.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:32:  - what it researched on the web when the federation couldn't answer
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:38:The compounding loop, in 5 steps:
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:43:  STEP 3: If federation can't satisfy → harness reaches the web on
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:47:  STEP 5: Next user B asks similar question → federation fan-out
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:81:  Max rerank-only headroom on this benchmark: ~4pp NDCG@5.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:154:   capture the compounding loop architecturally and link to it
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:160:3. The Akashik mechanism (5-step compounding loop, peer-local
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:168:Q1. Given the empirical ceiling on LME-S R@5 (NDCG@5 headroom ~4pp,
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:172:    federation rather than tuning per-peer retrieval)? Where should
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:175:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:177:    architecturally novel, or is it a known pattern in disguise?
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:178:    Cite prior art. If it IS novel, what's the closest existing
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:182:Q3. There is NO existing public benchmark for "how much does a
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:184:    R@5 / NDCG@K / MRR benchmarks measure single-peer retrieval
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:185:    quality, not the compounding the mission claims. What
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:186:    benchmark would actually measure the mission? Could we
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:189:Q4. The Octopus has flagged "input-order bias" (Round 3) and
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:196:      (d) the comparison to competitor numbers (agentmemory 0.952
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:200:Q5. The Akashik mission requires the network to actually grow.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:201:    What's the smallest-viable launch plan that produces a
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:202:    meaningful compounding signal in the first ~30 days post-
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:205:    the compounding becomes visible to a new contributor visiting
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:208:Q6. The Akashik architecture relies on user curiosity as the
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:215:      (c) adversarial contributors flood the federation with
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:220:Q7. The competitor frame (mem0/agentmemory/ByteRover) was the
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:234:    Which of these is the closest competitor / collaborator / fork
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:237:Q8. Final philosophical question. The mission is "make the OSS
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:240:    counter-argument someone could make against this entire
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:245:  - Direct answers to Q1-Q8
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:246:  - For Q2: closest prior-art protocol or research paper, with
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:248:  - For Q3: a proposed benchmark for measuring federation-level
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:249:    compounding, with the metrics and the experimental design
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:250:  - For Q5: the smallest-viable launch plan (specific communities,
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:252:  - For Q7: definitive identification of the 2-3 systems that are
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:253:    actual competitors (not categories)
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:254:  - For Q8: the strongest counter-argument + a one-paragraph
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:264:1. **Q1: Next month should not be spent chasing the last 2 points of single-peer `R@5`.**  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:265:`LongMemEval-S` is telling you the headline number is near its ceiling: `R@50 = 1.0`, `R@5 = 0.9202`, `NDCG@5 = 0.8836`, so the remaining room is mostly intra-top-5 ordering, not missing evidence. That makes further gains partly a marketing question if the goal is leaderboard optics against `agentmemory`, not the highest-leverage engineering question. On the other hand, `LoCoMo` still shows a real ranking problem (`R@30 = 0.993` but `R@3 = 0.392`), so abandoning retrieval work entirely would be premature. The tradeoff is simple: spend maybe `10-20%` of the month on low-risk per-peer improvements like temporal gating, better segmentation, and stronger reranker evaluation; spend the other `80-90%` on federation architecture, compounding instrumentation, and launch-loop proof, because that is where Akashik is differentiated.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:267:2. **Q2: The mechanism is not novel at the primitive level, but it is meaningfully novel in composition.**  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:274:What seems defensibly different about Akashik is **query-triggered semantic propagation**. SSB and Hypercore replicate logs/feeds/blocks; AT Proto distributes repos/posts; Akashik proposes that knowledge spreads because someone asked a semantically similar question, then another peer cached the answer locally and can later serve it onward. However, the downside is that this novelty currently lives more in the **retrieval-and-propagation policy** than in the storage primitive. So the strong claim is not “new protocol from first principles”; it is “new local-first knowledge propagation mechanism with explicit attribution and compounding behavior.”
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:276:3. **Q3: Yes, you should propose a benchmark, because existing IR benchmarks do not test the mission.**  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:277:A useful benchmark would be something like **`Akashik-CompBench`**:
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:279:- **Process**: queries arrive over simulated days. A peer answers locally, then via federation, then via web-on-miss, then caches locally with attribution.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:296:The advantage is that this directly measures your claim. The risk is benchmark design complexity and accusations of self-serving evaluation. To mitigate that, publish the generator, traces, and baselines.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:298:4. **Q4: Other pitfalls you are probably at risk of hitting.**  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:308:- Unrealistic always-online assumptions will overstate compounding.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:309:- Duplicate evidence across peers can inflate apparent federation gains.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:314:- However, it can become benchmark-specific leakage if the benchmark questions themselves key heavily on dates, sessions, or named participants.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:323:5. **Q5: Smallest viable 30-day launch plan.**  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:331:- **Why these rooms**: they have constant repeated debugging, public artifacts, and frequent “I solved this yesterday” moments. That is ideal for visible compounding.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:341:  - Week 2: instrument federation metrics, especially web-miss rate and transfer rate.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:345:Visible compounding signal by day 30 should be: “new user asks a real troubleshooting question, gets an attributed answer from another peer’s prior work, without going to Google.” The downside is narrow scope; however, narrow scope is exactly what makes the signal believable early.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:347:6. **Q6: Curiosity-driven propagation has three obvious failure modes, and all have known partial solutions.**  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:351:- Recommendation: rank by relevance plus novelty plus source diversity; cap same-claim duplicates from one curator cluster.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:366:7. **Q7: The real comparison set is not `mem0` or `agentmemory`. The closest systems are these three.**  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:368:- **Are.na**: closest behavioral competitor. People already use it as a shared research memory, but it is centralized and manual rather than federated and retrieval-native.[8]
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:369:- **Bluesky / AT Protocol**: closest federation-governance counterpart. It is relevant for identity, moderation, labels, and interoperability, even though it is not a knowledge graph.[4]
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:371:If you force me to name the top `2-3` actual systems that matter most: **Secure Scuttlebutt, Are.na, and Bluesky/AT Protocol**. `Mastodon` is less relevant because its object is conversation, not reusable knowledge. `Logseq sync` is same-user multi-device, not a commons. `IPFS/Hypercore` are substrates, not end-user competitors.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:373:8. **Q8: Strongest counter-argument, and the response you should prepare.**  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:379:The next engineering month should be spent proving the **federation thesis**, not polishing the single-peer benchmark headline. Concretely: build the compounding benchmark and simulator; instrument `web-miss`, `transfer`, `churn`, `attribution`, and `diversity`; ship room-level caching/pinning and provenance primitives; and run a narrow 100-user launch in high-overlap OSS rooms. Keep a smaller retrieval lane for `E10`, segmentation, and better reranker eval on `LoCoMo`, because local ranking still matters. However, the core risk is no longer “can we beat `0.925` on `R@5`?” It is “can we show that knowledge acquired by one contributor becomes faster to retrieve for another contributor over time, without centralization and without the commons collapsing into noise?” That is the month’s real work.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:436:- Back claims with specific evidence — tool names, version numbers, benchmark data, RFC/spec references, not just assertions
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:470:  - what it researched on the web when the federation couldn't answer
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:476:The compounding loop, in 5 steps:
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:481:  STEP 3: If federation can't satisfy → harness reaches the web on
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:485:  STEP 5: Next user B asks similar question → federation fan-out
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:519:  Max rerank-only headroom on this benchmark: ~4pp NDCG@5.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:592:   capture the compounding loop architecturally and link to it
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:598:3. The Akashik mechanism (5-step compounding loop, peer-local
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:606:Q1. Given the empirical ceiling on LME-S R@5 (NDCG@5 headroom ~4pp,
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:610:    federation rather than tuning per-peer retrieval)? Where should
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:613:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:615:    architecturally novel, or is it a known pattern in disguise?
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:616:    Cite prior art. If it IS novel, what's the closest existing
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:620:Q3. There is NO existing public benchmark for "how much does a
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:622:    R@5 / NDCG@K / MRR benchmarks measure single-peer retrieval
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:623:    quality, not the compounding the mission claims. What
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:624:    benchmark would actually measure the mission? Could we
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:627:Q4. The Octopus has flagged "input-order bias" (Round 3) and
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:634:      (d) the comparison to competitor numbers (agentmemory 0.952
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:638:Q5. The Akashik mission requires the network to actually grow.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:639:    What's the smallest-viable launch plan that produces a
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:640:    meaningful compounding signal in the first ~30 days post-
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:643:    the compounding becomes visible to a new contributor visiting
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:646:Q6. The Akashik architecture relies on user curiosity as the
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:653:      (c) adversarial contributors flood the federation with
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:658:Q7. The competitor frame (mem0/agentmemory/ByteRover) was the
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:672:    Which of these is the closest competitor / collaborator / fork
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:675:Q8. Final philosophical question. The mission is "make the OSS
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:678:    counter-argument someone could make against this entire
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:683:  - Direct answers to Q1-Q8
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:684:  - For Q2: closest prior-art protocol or research paper, with
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:686:  - For Q3: a proposed benchmark for measuring federation-level
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:687:    compounding, with the metrics and the experimental design
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:688:  - For Q5: the smallest-viable launch plan (specific communities,
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:690:  - For Q7: definitive identification of the 2-3 systems that are
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:691:    actual competitors (not categories)
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:692:  - For Q8: the strongest counter-argument + a one-paragraph
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:730:I’m treating this as a research synthesis, not a code task. First step is establishing prior art and evaluation literature around local-first/P2P knowledge systems, federated retrieval, and benchmark design so the recommendations are anchored to real systems rather than analogy.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:746:1. **Q1: Next month should not be spent chasing the last 2 points of single-peer `R@5`.**  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:747:`LongMemEval-S` is telling you the headline number is near its ceiling: `R@50 = 1.0`, `R@5 = 0.9202`, `NDCG@5 = 0.8836`, so the remaining room is mostly intra-top-5 ordering, not missing evidence. That makes further gains partly a marketing question if the goal is leaderboard optics against `agentmemory`, not the highest-leverage engineering question. On the other hand, `LoCoMo` still shows a real ranking problem (`R@30 = 0.993` but `R@3 = 0.392`), so abandoning retrieval work entirely would be premature. The tradeoff is simple: spend maybe `10-20%` of the month on low-risk per-peer improvements like temporal gating, better segmentation, and stronger reranker evaluation; spend the other `80-90%` on federation architecture, compounding instrumentation, and launch-loop proof, because that is where Akashik is differentiated.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:749:2. **Q2: The mechanism is not novel at the primitive level, but it is meaningfully novel in composition.**  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:756:What seems defensibly different about Akashik is **query-triggered semantic propagation**. SSB and Hypercore replicate logs/feeds/blocks; AT Proto distributes repos/posts; Akashik proposes that knowledge spreads because someone asked a semantically similar question, then another peer cached the answer locally and can later serve it onward. However, the downside is that this novelty currently lives more in the **retrieval-and-propagation policy** than in the storage primitive. So the strong claim is not “new protocol from first principles”; it is “new local-first knowledge propagation mechanism with explicit attribution and compounding behavior.”
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:758:3. **Q3: Yes, you should propose a benchmark, because existing IR benchmarks do not test the mission.**  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:759:A useful benchmark would be something like **`Akashik-CompBench`**:
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:761:- **Process**: queries arrive over simulated days. A peer answers locally, then via federation, then via web-on-miss, then caches locally with attribution.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:778:The advantage is that this directly measures your claim. The risk is benchmark design complexity and accusations of self-serving evaluation. To mitigate that, publish the generator, traces, and baselines.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:780:4. **Q4: Other pitfalls you are probably at risk of hitting.**  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:790:- Unrealistic always-online assumptions will overstate compounding.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:791:- Duplicate evidence across peers can inflate apparent federation gains.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:796:- However, it can become benchmark-specific leakage if the benchmark questions themselves key heavily on dates, sessions, or named participants.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:805:5. **Q5: Smallest viable 30-day launch plan.**  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:813:- **Why these rooms**: they have constant repeated debugging, public artifacts, and frequent “I solved this yesterday” moments. That is ideal for visible compounding.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:823:  - Week 2: instrument federation metrics, especially web-miss rate and transfer rate.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:827:Visible compounding signal by day 30 should be: “new user asks a real troubleshooting question, gets an attributed answer from another peer’s prior work, without going to Google.” The downside is narrow scope; however, narrow scope is exactly what makes the signal believable early.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:829:6. **Q6: Curiosity-driven propagation has three obvious failure modes, and all have known partial solutions.**  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:833:- Recommendation: rank by relevance plus novelty plus source diversity; cap same-claim duplicates from one curator cluster.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:848:7. **Q7: The real comparison set is not `mem0` or `agentmemory`. The closest systems are these three.**  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:850:- **Are.na**: closest behavioral competitor. People already use it as a shared research memory, but it is centralized and manual rather than federated and retrieval-native.[8]
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:851:- **Bluesky / AT Protocol**: closest federation-governance counterpart. It is relevant for identity, moderation, labels, and interoperability, even though it is not a knowledge graph.[4]
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:853:If you force me to name the top `2-3` actual systems that matter most: **Secure Scuttlebutt, Are.na, and Bluesky/AT Protocol**. `Mastodon` is less relevant because its object is conversation, not reusable knowledge. `Logseq sync` is same-user multi-device, not a commons. `IPFS/Hypercore` are substrates, not end-user competitors.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:855:8. **Q8: Strongest counter-argument, and the response you should prepare.**  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:861:The next engineering month should be spent proving the **federation thesis**, not polishing the single-peer benchmark headline. Concretely: build the compounding benchmark and simulator; instrument `web-miss`, `transfer`, `churn`, `attribution`, and `diversity`; ship room-level caching/pinning and provenance primitives; and run a narrow 100-user launch in high-overlap OSS rooms. Keep a smaller retrieval lane for `E10`, segmentation, and better reranker eval on `LoCoMo`, because local ranking still matters. However, the core risk is no longer “can we beat `0.925` on `R@5`?” It is “can we show that knowledge acquired by one contributor becomes faster to retrieve for another contributor over time, without centralization and without the commons collapsing into noise?” That is the month’s real work.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:32:  - what it researched on the web when the federation couldn't answer
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:38:The compounding loop, in 5 steps:
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:43:  STEP 3: If federation can't satisfy → harness reaches the web on
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:47:  STEP 5: Next user B asks similar question → federation fan-out
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:81:  Max rerank-only headroom on this benchmark: ~4pp NDCG@5.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:154:   capture the compounding loop architecturally and link to it
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:160:3. The Akashik mechanism (5-step compounding loop, peer-local
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:168:Q1. Given the empirical ceiling on LME-S R@5 (NDCG@5 headroom ~4pp,
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:172:    federation rather than tuning per-peer retrieval)? Where should
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:175:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:177:    architecturally novel, or is it a known pattern in disguise?
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:178:    Cite prior art. If it IS novel, what's the closest existing
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:182:Q3. There is NO existing public benchmark for "how much does a
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:184:    R@5 / NDCG@K / MRR benchmarks measure single-peer retrieval
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:185:    quality, not the compounding the mission claims. What
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:186:    benchmark would actually measure the mission? Could we
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:189:Q4. The Octopus has flagged "input-order bias" (Round 3) and
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:196:      (d) the comparison to competitor numbers (agentmemory 0.952
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:200:Q5. The Akashik mission requires the network to actually grow.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:201:    What's the smallest-viable launch plan that produces a
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:202:    meaningful compounding signal in the first ~30 days post-
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:205:    the compounding becomes visible to a new contributor visiting
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:208:Q6. The Akashik architecture relies on user curiosity as the
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:215:      (c) adversarial contributors flood the federation with
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:220:Q7. The competitor frame (mem0/agentmemory/ByteRover) was the
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:234:    Which of these is the closest competitor / collaborator / fork
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:237:Q8. Final philosophical question. The mission is "make the OSS
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:240:    counter-argument someone could make against this entire
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:245:  - Direct answers to Q1-Q8
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:246:  - For Q2: closest prior-art protocol or research paper, with
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:248:  - For Q3: a proposed benchmark for measuring federation-level
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:249:    compounding, with the metrics and the experimental design
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:250:  - For Q5: the smallest-viable launch plan (specific communities,
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:252:  - For Q7: definitive identification of the 2-3 systems that are
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:253:    actual competitors (not categories)
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:254:  - For Q8: the strongest counter-argument + a one-paragraph
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:264:**Q1**
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:266:The next engineering month should go to federation architecture and federation measurement, not to squeezing the last `~2–4pp` out of LongMemEval-S `R@5`.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:270:- LoCoMo says something different: `R@30 = 0.993` but `R@3 = 0.392`, so there is still real per-peer ranking work. However, that is still single-peer optimization, while the Akashik claim is federation compounding.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:271:- LongMemEval itself is about single-assistant memory abilities, not network compounding; its abstract frames five assistant-memory abilities, not peer propagation ([LongMemEval](https://huggingface.co/papers/2410.10813)).
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:274:- Spend `~70%` of the month on federation benchmark/instrumentation, room routing, caching, provenance, and trust.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:277:On the other hand, ignoring headline `R@5` entirely has a cost: buyers, contributors, and press will still compare Akashik to single-user memory systems. So keep a lightweight benchmark cadence, but stop letting LongMemEval-S drive roadmap priority.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:279:**Q2**
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:281:Akashik is **not novel in primitives**. It is **novel in composition**.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:291:- IPFS/SSB replicate or route content, but they are not built around **semantic query-time federation + web-on-miss + signed local re-curation**.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:299:That composition is the novel part. However, the tradeoff is severe: availability, trust, and cold start are much harder than in AT Protocol or Are.na.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:301:**Q3**
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:303:Yes, you should propose a benchmark. Existing federated benchmarks are the wrong shape.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:307:- FeB4RAG updates federated search for RAG, but still targets federated retrieval, not longitudinal knowledge compounding ([FeB4RAG](https://arxiv.org/abs/2402.11891)).
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:309:Proposed benchmark: **AkashikBench**
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:320:- `Compounding Gain@t`: answer success with federation at time `t` minus isolated-peer success.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:332:- federation without caching
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:333:- federation with popularity-only caching
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:334:- federation with rarity-aware caching
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:336:The upside is this would finally measure the mission. The downside is benchmark design is expensive and easier to game than LongMemEval unless you publish raw traces, offline/online splits, and adversarial suites.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:338:**Q4**
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:344:- **Benchmark contamination** is plausible for public benchmarks with popular memory papers.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:356:- It may create **temporal leakage** if metadata gives away benchmark structure rather than improving real retrieval.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:367:So: competitor comparisons are only defensible if you fix:
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:368:- benchmark version
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:378:**Q5**
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:380:Smallest viable 30-day launch plan:
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:406:- compounding becomes visible fast because duplicate pain is common
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:416:**Q6**
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:420:- Known mitigations: diversification penalties, per-author caps, source entropy metrics, MMR/`α-nDCG` style diversity ranking, and room-level quotas. Federated search literature explicitly studied novelty/diversification in source selection ([Hong & Luo Si](https://docs.lib.purdue.edu/ccpubs/543/)).
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:445:**Q7**
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:452:Closest **product** competitor. It is a shared knowledge commons of blocks/channels/connections, and public blocks accumulate context over time ([Are.na blocks](https://help.are.na/docs/getting-started/blocks), [API](https://www.are.na/developers)).  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:454:Why it is not the same: central server, manual organization, no peer-local federation, no web-on-miss retrieval loop.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:457:Closest **protocol** cousin. It has signed personal repositories tied to DIDs and portable identity, but chooses server-hosted federation rather than end-device P2P ([AT repo](https://atproto.com/specs/repository), [overview](https://atproto.com/guides/overview)).  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:458:Why it is close: signed user-owned records, federation, portability.  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:464:Why it differs: not built as a semantic knowledge commons with attributed retrieval and benchmarked compounding.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:467:- closest competitor: **Are.na**
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:471:**Q8**
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:473:Strongest counter-argument:
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:475:> Akashik assumes that if you make knowledge portable, signed, and peer-owned, high-quality community memory will naturally emerge. But contributors do not reliably externalize their reasoning, most saved knowledge is noisy or stale, and signatures prove authorship rather than correctness. Without strong incentives and moderation, the system may become a fragmented cache of plausible junk whose compounding mostly amplifies popularity, not truth.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:479:That criticism is strong because it is partly correct. Akashik should not position itself as an automatic truth machine. The defensible claim is narrower: it can make repeated OSS learning more reusable, attributable, and locally owned than today’s mix of transient chat, scattered issues, and centralized note silos. To earn trust, launch should require provenance, expose source chains, measure compounding directly, cap curator dominance, preserve diversity, and make moderation/trust policies explicit. If Akashik does that, the project is not “knowledge solves itself”; it is “community learning leaves auditable traces and gets easier to reuse.”
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:486:1. federation benchmark harness
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:500:- reproducible competitor harness with fixed metrics and token budgets
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:519:- Mastodon federation docs: https://docs.joinmastodon.org/
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:520:- agentmemory repo benchmarks: https://github.com/rohitg00/agentmemory
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:569:- Back claims with specific evidence — tool names, version numbers, benchmark data, RFC/spec references, not just assertions
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:603:  - what it researched on the web when the federation couldn't answer
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:609:The compounding loop, in 5 steps:
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:614:  STEP 3: If federation can't satisfy → harness reaches the web on
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:618:  STEP 5: Next user B asks similar question → federation fan-out
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:652:  Max rerank-only headroom on this benchmark: ~4pp NDCG@5.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:725:   capture the compounding loop architecturally and link to it
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:731:3. The Akashik mechanism (5-step compounding loop, peer-local
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:739:Q1. Given the empirical ceiling on LME-S R@5 (NDCG@5 headroom ~4pp,
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:743:    federation rather than tuning per-peer retrieval)? Where should
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:746:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:748:    architecturally novel, or is it a known pattern in disguise?
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:749:    Cite prior art. If it IS novel, what's the closest existing
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:753:Q3. There is NO existing public benchmark for "how much does a
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:755:    R@5 / NDCG@K / MRR benchmarks measure single-peer retrieval
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:756:    quality, not the compounding the mission claims. What
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:757:    benchmark would actually measure the mission? Could we
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:760:Q4. The Octopus has flagged "input-order bias" (Round 3) and
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:767:      (d) the comparison to competitor numbers (agentmemory 0.952
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:771:Q5. The Akashik mission requires the network to actually grow.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:772:    What's the smallest-viable launch plan that produces a
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:773:    meaningful compounding signal in the first ~30 days post-
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:776:    the compounding becomes visible to a new contributor visiting
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:779:Q6. The Akashik architecture relies on user curiosity as the
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:786:      (c) adversarial contributors flood the federation with
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:791:Q7. The competitor frame (mem0/agentmemory/ByteRover) was the
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:805:    Which of these is the closest competitor / collaborator / fork
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:808:Q8. Final philosophical question. The mission is "make the OSS
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:811:    counter-argument someone could make against this entire
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:816:  - Direct answers to Q1-Q8
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:817:  - For Q2: closest prior-art protocol or research paper, with
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:819:  - For Q3: a proposed benchmark for measuring federation-level
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:820:    compounding, with the metrics and the experimental design
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:821:  - For Q5: the smallest-viable launch plan (specific communities,
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:823:  - For Q7: definitive identification of the 2-3 systems that are
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:824:    actual competitors (not categories)
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:825:  - For Q8: the strongest counter-argument + a one-paragraph
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:863:Investigating prior art, benchmark design candidates, and current competitor/system references first. Then I’ll synthesize where the next engineering month should go, anchored to your measured results rather than generic retrieval advice.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:893:**Q1**
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:895:The next engineering month should go to federation architecture and federation measurement, not to squeezing the last `~2–4pp` out of LongMemEval-S `R@5`.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:899:- LoCoMo says something different: `R@30 = 0.993` but `R@3 = 0.392`, so there is still real per-peer ranking work. However, that is still single-peer optimization, while the Akashik claim is federation compounding.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:900:- LongMemEval itself is about single-assistant memory abilities, not network compounding; its abstract frames five assistant-memory abilities, not peer propagation ([LongMemEval](https://huggingface.co/papers/2410.10813)).
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:903:- Spend `~70%` of the month on federation benchmark/instrumentation, room routing, caching, provenance, and trust.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:906:On the other hand, ignoring headline `R@5` entirely has a cost: buyers, contributors, and press will still compare Akashik to single-user memory systems. So keep a lightweight benchmark cadence, but stop letting LongMemEval-S drive roadmap priority.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:908:**Q2**
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:910:Akashik is **not novel in primitives**. It is **novel in composition**.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:920:- IPFS/SSB replicate or route content, but they are not built around **semantic query-time federation + web-on-miss + signed local re-curation**.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:928:That composition is the novel part. However, the tradeoff is severe: availability, trust, and cold start are much harder than in AT Protocol or Are.na.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:930:**Q3**
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:932:Yes, you should propose a benchmark. Existing federated benchmarks are the wrong shape.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:936:- FeB4RAG updates federated search for RAG, but still targets federated retrieval, not longitudinal knowledge compounding ([FeB4RAG](https://arxiv.org/abs/2402.11891)).
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:938:Proposed benchmark: **AkashikBench**
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:949:- `Compounding Gain@t`: answer success with federation at time `t` minus isolated-peer success.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:961:- federation without caching
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:962:- federation with popularity-only caching
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:963:- federation with rarity-aware caching
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:965:The upside is this would finally measure the mission. The downside is benchmark design is expensive and easier to game than LongMemEval unless you publish raw traces, offline/online splits, and adversarial suites.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:967:**Q4**
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:973:- **Benchmark contamination** is plausible for public benchmarks with popular memory papers.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:985:- It may create **temporal leakage** if metadata gives away benchmark structure rather than improving real retrieval.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:996:So: competitor comparisons are only defensible if you fix:
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:997:- benchmark version
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1007:**Q5**
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1009:Smallest viable 30-day launch plan:
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1035:- compounding becomes visible fast because duplicate pain is common
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1045:**Q6**
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1049:- Known mitigations: diversification penalties, per-author caps, source entropy metrics, MMR/`α-nDCG` style diversity ranking, and room-level quotas. Federated search literature explicitly studied novelty/diversification in source selection ([Hong & Luo Si](https://docs.lib.purdue.edu/ccpubs/543/)).
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1074:**Q7**
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1081:Closest **product** competitor. It is a shared knowledge commons of blocks/channels/connections, and public blocks accumulate context over time ([Are.na blocks](https://help.are.na/docs/getting-started/blocks), [API](https://www.are.na/developers)).  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1083:Why it is not the same: central server, manual organization, no peer-local federation, no web-on-miss retrieval loop.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1086:Closest **protocol** cousin. It has signed personal repositories tied to DIDs and portable identity, but chooses server-hosted federation rather than end-device P2P ([AT repo](https://atproto.com/specs/repository), [overview](https://atproto.com/guides/overview)).  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1087:Why it is close: signed user-owned records, federation, portability.  
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1093:Why it differs: not built as a semantic knowledge commons with attributed retrieval and benchmarked compounding.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1096:- closest competitor: **Are.na**
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1100:**Q8**
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1102:Strongest counter-argument:
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1104:> Akashik assumes that if you make knowledge portable, signed, and peer-owned, high-quality community memory will naturally emerge. But contributors do not reliably externalize their reasoning, most saved knowledge is noisy or stale, and signatures prove authorship rather than correctness. Without strong incentives and moderation, the system may become a fragmented cache of plausible junk whose compounding mostly amplifies popularity, not truth.
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1108:That criticism is strong because it is partly correct. Akashik should not position itself as an automatic truth machine. The defensible claim is narrower: it can make repeated OSS learning more reusable, attributable, and locally owned than today’s mix of transient chat, scattered issues, and centralized note silos. To earn trust, launch should require provenance, expose source chains, measure compounding directly, cap curator dominance, preserve diversity, and make moderation/trust policies explicit. If Akashik does that, the project is not “knowledge solves itself”; it is “community learning leaves auditable traces and gets easier to reuse.”
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1115:1. federation benchmark harness
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1129:- reproducible competitor harness with fixed metrics and token budgets
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1148:- Mastodon federation docs: https://docs.joinmastodon.org/
docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1149:- agentmemory repo benchmarks: https://github.com/rohitg00/agentmemory
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:31:  - what it researched on the web when the federation couldn't answer
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:37:The compounding loop, in 5 steps:
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:42:  STEP 3: If federation can't satisfy → harness reaches the web on
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:46:  STEP 5: Next user B asks similar question → federation fan-out
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:80:  Max rerank-only headroom on this benchmark: ~4pp NDCG@5.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:153:   capture the compounding loop architecturally and link to it
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:159:3. The Akashik mechanism (5-step compounding loop, peer-local
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:167:Q1. Given the empirical ceiling on LME-S R@5 (NDCG@5 headroom ~4pp,
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:171:    federation rather than tuning per-peer retrieval)? Where should
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:174:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:176:    architecturally novel, or is it a known pattern in disguise?
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:177:    Cite prior art. If it IS novel, what's the closest existing
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:181:Q3. There is NO existing public benchmark for "how much does a
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:183:    R@5 / NDCG@K / MRR benchmarks measure single-peer retrieval
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:184:    quality, not the compounding the mission claims. What
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:185:    benchmark would actually measure the mission? Could we
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:188:Q4. The Octopus has flagged "input-order bias" (Round 3) and
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:195:      (d) the comparison to competitor numbers (agentmemory 0.952
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:199:Q5. The Akashik mission requires the network to actually grow.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:200:    What's the smallest-viable launch plan that produces a
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:201:    meaningful compounding signal in the first ~30 days post-
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:204:    the compounding becomes visible to a new contributor visiting
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:207:Q6. The Akashik architecture relies on user curiosity as the
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:214:      (c) adversarial contributors flood the federation with
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:219:Q7. The competitor frame (mem0/agentmemory/ByteRover) was the
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:233:    Which of these is the closest competitor / collaborator / fork
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:236:Q8. Final philosophical question. The mission is "make the OSS
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:239:    counter-argument someone could make against this entire
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:244:  - Direct answers to Q1-Q8
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:245:  - For Q2: closest prior-art protocol or research paper, with
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:247:  - For Q3: a proposed benchmark for measuring federation-level
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:248:    compounding, with the metrics and the experimental design
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:249:  - For Q5: the smallest-viable launch plan (specific communities,
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:251:  - For Q7: definitive identification of the 2-3 systems that are
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:252:    actual competitors (not categories)
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:253:  - For Q8: the strongest counter-argument + a one-paragraph
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:282:## Q1 — Where should the next engineering month go?
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:284:**Short answer: federation architecture, not single-peer retrieval tuning.**
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:288:**The marketing argument for pushing R@5 further:** mining the last 2-3pp toward agentmemory's 0.952 is only meaningful if Akashik is competing on the single-peer agent-memory leaderboard. Post-pivot, it isn't. The Akashik mission claim is "federated compounding," not "best per-peer retrieval." Chasing 0.95 LME-S R@5 is answering the wrong question.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:290:**The engineering argument for federation:** The compounding claim (R(T,t) monotonically non-decreasing, TTF ~ 1/R(T,t)) has zero measurement infrastructure. There is no benchmark for it, no instrumentation in the daemon to emit it, and no integration test that exercises two peers. The claim is architecturally sound but empirically unverified. That's the next month's most important gap.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:292:**However, the counterargument for staying on retrieval:** E10 (temporal query gate) is un-implemented, targets the largest loss category (temporal-reasoning, 13pp headroom, n=133), and is estimated at 2-3 hours. E11 is validated but not yet in the production indexing pipeline — only in bench fixtures. These are small investments with known ROI. Do them in week 1, then pivot to federation.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:294:**Verdict:** Week 1: E10 + E11 in production. Weeks 2-4: federation baseline measurement, FCB instrumentation, validateRemoteNode security fix. The single-peer retrieval chapter is not closed (E10 untested), but it should close in week 1.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:298:## Q2 — Is the Akashik mechanism architecturally novel?
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:302:**1. EDUTELLA (Nejdl et al., WWWW 2002)** — federated RDF repositories over a Gnutella-style P2P network with semantic routing. This is the closest academic ancestor. Peers expose SPARQL-like query endpoints; queries route through a semantic overlay network. The key differences: (a) EDUTELLA required always-on peers (no curiosity-driven caching), (b) no signed attribution, (c) routing was declarative ("this peer covers topic X"), not curiosity-driven, (d) no local-first compounding — content was queried at source, not cached by questioner.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:304:**2. Freenet (Clarke et al., First Monday 2001)** — P2P content routing where requests propagate through intermediaries and each routing node caches content it routes. The curiosity-as-propagation mechanism is structurally identical to Akashik's Step 4-5. The key differences: (a) Freenet is deliberately anonymous — attribution is the opposite of the design goal; (b) content-addressed by hash, not semantically searchable; (c) designed for censorship resistance, not knowledge compounding.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:306:**3. Semantic Overlay Networks (Löser et al., CIDR 2003; Crespo & Garcia-Molina, VLDB 2002)** — early research systems for P2P semantic search. Demonstrated that routing by semantic similarity (instead of hash-based DHT) enables topic-aware peer selection. Akashik's federation fan-out + RRF merge is implementing this pattern. What the 2003 systems lacked: DID-signed attribution, graph-traversable provenance, satisfaction scoring, local-first storage.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:308:**4. IPFS (Protocol Labs, 2015–present)** — content-addressed P2P storage with caching-on-fetch. Same curiosity-as-propagation property: you cache what you fetch, popularity drives replication. Key differences: (a) byte-level storage, no semantic graph; (b) content-addressed (CID), not human-attributed (DID); (c) no semantic retrieval; (d) the "compounding" is about content availability, not retrieval quality.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:310:**5. Solid (Berners-Lee et al., 2016–present)** — decentralized data pods with WebID-based identity and fine-grained access control. User controls their data; apps request access. Structurally similar philosophy (no central server, user-owned data, federated identity). Key differences: Solid is a general-purpose data protocol, not a knowledge-graph-and-retrieval layer; there is no compounding-by-curiosity mechanism; Solid pods must be always-on hosted servers, not local-first.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:314:- **Semantic retrieval as the federation primitive**: All prior P2P knowledge systems route by topic declaration (EDUTELLA), content hash (IPFS, Freenet), or social graph (Nostr/Fediverse). Akashik routes by semantic similarity of the query to each peer's local graph.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:315:- **Signed human attribution in the compounding loop**: The "ambitioned curator" model with ed25519/DID provenance is genuinely novel. IPFS has content-addressed identity (verifies content, not author). EDUTELLA has no attribution. Freenet is explicitly anti-attribution. Akashik makes human authorship a first-class compounding signal.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:318:**The honest limitation of novelty claim**: The 2003-2008 Semantic Overlay Network literature is extensive, partially forgotten, and pre-dates the modern embedding stack. Akashik is implementing a 20-year-old architectural insight with 2024 tools. The novelty is in the execution (vector embeddings, DID attribution, satisfaction scoring), not the topology.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:322:## Q3 — What benchmark would measure federation-level compounding?
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:326:**What it measures:** Does the compounding property hold empirically? Does R(T,t) grow monotonically? Does TTF decline as R grows? Can attribution be traced?
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:351:| Compounding factor | CF | Mean TTF reduction at t=500 vs t=0 | The headline compounding claim |
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:354:1. Single-peer only (no federation): WFR never decreases, R(T,t) stays at 1 for all T
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:355:2. Akashik federation: the above metrics
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:358:**Why this is publishable:** No existing benchmark measures P2P semantic compounding. TREC (ad-hoc retrieval), BEIR (cross-domain transfer), LongMemEval (single-session memory) all measure single-system retrieval quality. FCB is the first benchmark that treats the P2P network itself as the retrieval system and measures the compounding property as the primary axis. Target venue: SIGIR 2027 or ACL Findings under "evaluation methodology" track.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:360:**Concrete implementation:** A `wellinformed bench federation` CLI command running a Docker Compose network of 4 peers, injecting queries from the hot/cold corpus, and emitting an FCB report. Est. engineering effort: 2-3 weeks.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:364:## Q4 — Known pitfalls you're probably hitting
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:368:**Non-determinism from random shuffling.** The shuffle fix in commit 1f828b7 broke the input-order bias — but random shuffles make the benchmark non-deterministic. The 8-question spot-check that showed "3 same-set + 1 lift + 1 regression" is likely noise from shuffle variance, not signal. Fix: pin a per-question seed derived from the question ID, so results are reproducible across runs. Without this, you can't distinguish real lift from lucky shuffle.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:374:**You have no federated retrieval evaluation at all.** Every benchmark result is single-peer local retrieval. This is the most important pitfall: the project's differentiating claim (federation compounds knowledge) has zero measurement infrastructure, which means you also have zero evidence that federation *doesn't* hurt single-peer retrieval quality. Federated fan-out introduces latency heterogeneity, vocabulary drift across peers, and duplicate node inflation in RRF merge — any of which could degrade the 0.9202 LME-S number when measured on a real multi-peer run.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:378:**Coverage bias**: Online time is not uniform. Contributors who run their peer continuously (e.g., a homelab server) contribute disproportionately to R(T,t). The compounding claim assumes R(T,t) grows monotonically, but in practice it grows with a coefficient that's proportional to peer uptime. A network of 100 mostly-offline mobile users may compound much slower than a network of 10 always-on servers. **This is not documented in the mechanism doc.**
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:386:**GDPR derived-data gap.** The enriched embedding is derived personal data under GDPR Article 4(1) if the source turn contains personal information (names, emails, project details). When a contributor invokes the right to erasure (Article 17), deleting the source turn doesn't delete the enriched embedding — which now encodes a "memory" of the deleted content in its 384-dimensional vector. The `auto-forget.ts` module handles TTL-based expiry, not source-invalidation-based expiry. This was flagged in §7.5 of the competitors plan and remains unimplemented.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:390:**The three competitor numbers are not comparable to your 0.9202:**
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:396:| mem0 0.925 | LoCoMo composite | LLM-as-judge over full pipeline | **No** — different benchmark, different metric |
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:400:**Recommendation:** Replace the competitor comparison table with two separate tables — one for retrieval-only numbers (where your 0.9202 belongs) and one for E2E LLM-judge numbers (where mem0's 0.925 belongs). The current table is technically defensible but will be called out by any reviewer who reads carefully.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:404:## Q5 — Smallest-viable launch plan for compounding signal in 30 days
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:433:The HN post must contain exactly one falsifiable claim: "In the last 30 days, X queries to this network were answered by another contributor's cached research rather than reaching the web. Here is the compounding curve." X must be a real measured number, not an estimate.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:444:## Q6 — Network health: popularity cascades, niche evaporation, adversarial attacks
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:472:The threat model (p2p-threat-model.md) covers AS-4 (secret exfiltration) and AS-6 (SSRF). It does not cover the *semantic adversarial* attack: a peer that joins a room, indexes plausible-sounding but wrong answers to common questions, and lets the compounding mechanism propagate those wrong answers through the network.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:480:- Fediverse defederation: Domain-level block when an instance becomes a spam/abuse vector.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:490:## Q7 — Real competitors (definitive identification)
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:492:**The single-user agent-memory frame (mem0/agentmemory/ByteRover) is the wrong frame.** These are not competitors; they're potential integrations. They solve a different problem (one user's memory, centrally hosted). Here are the actual competitors:
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:496:**Why it's the real competitor:** IPFS implements the same curiosity-as-propagation caching mechanism at the infrastructure layer. Helia (the TypeScript IPFS implementation) runs in Node.js, the same runtime as Akashik. Protocol Labs has 100+ engineers and $250M+ in funding. If they add a semantic knowledge graph layer on top of Helia, they have Akashik's architecture with a much larger existing network (400K+ public nodes).
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:504:**Why it's the real competitor:** Logseq is the tool of choice for the exact user Akashik targets: OSS contributors who maintain personal knowledge graphs. It has 30K+ GitHub stars, active community, a plugin ecosystem, and is working on a database edition with improved sync and (eventually) multiplayer features. Logseq's user base is OSS contributors and researchers.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:506:**What Akashik does better:** Federation across organizations (Logseq sync is same-user multi-device or explicit sharing; Akashik federates across organizational boundaries), semantic retrieval quality (measured BEIR numbers), compounding by curiosity (not deliberate sync), DID-signed attribution.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:508:**The key difference:** Logseq is "your notes, synced with you across devices." Akashik is "your research, shared with the community when queried." These sound similar but are fundamentally different trust models. Logseq's sync is a replication protocol; Akashik's federation is a query protocol.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:514:**Why it's the real competitor:** The AT Protocol is the most mature open-source implementation of the three things Akashik's architecture depends on: DIDs (they use `did:plc` and `did:web`), federated content (Personal Data Servers + relay aggregation), and semantic labeling systems. The AT Protocol is already deployed at scale (6M+ accounts), has an active developer ecosystem, and is building "labelers" (essentially federated reputation) and "starter packs" (essentially curated rooms).
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:516:**What Akashik does better:** Semantic retrieval (AT Protocol has no vector search), curiosity-driven compounding (AT Protocol's replication is push-based, not pull-on-query), knowledge graph with tunnels, local-first storage (AT PDS must be always-on hosted server; Akashik runs on your laptop).
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:518:**Strategic option:** Build Akashik as an AT Protocol lexicon (a schema that defines knowledge nodes) and a labeler (a service that provides reputation signals). This would give Akashik access to the AT Protocol's existing federation infrastructure without competing with it. The Bluesky community already has many OSS contributors.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:524:## Q8 — The strongest counter-argument
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:526:**The counter-argument:**
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:528:"Akashik solves a distribution problem that doesn't exist by introducing a reliability problem that does exist. OSS contributors already have working mechanisms for sharing knowledge — Stack Overflow has 60M+ answered questions, GitHub Discussions is indexed by Google, Discord communities provide real-time context, blog posts compound indefinitely via SEO. These mechanisms are persistent (always-on servers), searchable (Google-indexed), moderated (community voting), and have 15-20 years of network effects. Akashik's 'network before web' architecture means you query peers who might be offline before reaching Stack Overflow, which is always online. The compounding property (R(T,t) monotonically non-decreasing) only holds when peers are online — but contributors are offline most of the time, especially on laptops during work hours. For the median OSS contributor (active a few hours per week on a laptop that's off when they sleep), Akashik's federation would degrade to 'fall through to the web' on 95% of queries, which is exactly what happens today — just slower, because you waited for the federation timeout first. You've added latency without removing the web dependency."
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:532:The counter-argument is correct about Stack Overflow — as a competitor for *published* knowledge. Where it misidentifies the use case: Akashik is designed for the 80% of engineering knowledge that *never gets published*. The debugging session you spent 4 hours on that you couldn't write up. The architectural decision you made in 2023 and would like to remember in 2024. The library evaluation you ran before choosing your ORM. The PR review comment that explained why the abstraction was wrong. None of that compounded into Stack Overflow's index — it evaporated when the Slack message disappeared or the terminal session closed. When a new contributor joins a project and asks "why did we use SQLite instead of Postgres?", that answer is in someone's head or in a Slack message from 2 years ago — not on Stack Overflow. Akashik is designed for that knowledge: private, in-progress, context-rich, never published — and the availability concern (offline peers) is real and documented honestly, but for a tool that runs as a daemon on a developer's machine and stores only what *that developer has asked about*, the latency added by federation fan-out is 50-200ms to peers, which is faster than a Google search and cheaper than a Stack Overflow question that gets ignored.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:580:**What's filed but not implemented:** `model-checksums.json` for ONNX weights (§7.5 of the competitors plan). This needs extension to the Rust binary artifacts. At minimum: (a) pin Cargo.lock in CI (it is already committed), (b) use `cargo-deny` to audit dependency licenses and known CVEs, (c) SHA256 the built binary and verify against a known-good hash before running it in the bench suite. SLSA Level 2 (signed provenance for build artifacts) is the target.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:589:- "federation timeout" is indistinguishable from "no peers have this knowledge"
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:591:**Proposed taxonomy:** `WI-1xx` for peer/identity errors (101: peer not found, 102: peer offline, 103: peer rejected handshake), `WI-2xx` for room/permission errors (201: room not found, 202: unauthorized for room, 203: room write-locked), `WI-3xx` for query errors (301: satisfaction below threshold, 302: federation timeout, 303: web fetch denied by hook).
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:597:- **Data residency:** All data is local-first (peer runs on the user's machine). Enterprise rooms should default to federation-off (no `oss-commons` fan-out) with explicit opt-in. This is a configuration gap — the current room sharing model doesn't have an "internal-only" flag that prevents federation outside a known peer list.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:612:Three rounds of consistent empirical work produced: (a) a clean retrieval pipeline at 75.22% BEIR SciFact NDCG@10 (CPU-only, competitive with published baselines), (b) 0.9202 LME-S R@5 (within 3pp of the published leader, retrieval-only, no LLM judge), (c) clear evidence that cross-encoder rerank doesn't help on these benchmarks, (d) clear evidence that small local LLMs don't help on LoCoMo, (e) E11 as the only write-path intervention with consistent positive signal.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:619:| 1-2 | `validateRemoteNode` (AS-1 + AS-2 + AS-7) | Explicitly marked "mandatory before shipping touch to untrusted peers" — blocking production federation |
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:630:Not the retrieval quality. Not the competitor landscape. Not the benchmark numbers.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:632:**The absence of a working two-peer demo.** Without a live demonstration that Step 5 actually happens — that B's query is answered by A's research, attributed, faster than a web search — the compounding claim is a mechanism doc, not a product. Every investor, contributor, and early adopter will ask: "can you show me the compounding?" The current answer is: no, because there's no instrumented multi-peer test. That's the most important thing to fix before anything else.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:31:  - what it researched on the web when the federation couldn't answer
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:37:The compounding loop, in 5 steps:
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:42:  STEP 3: If federation can't satisfy → harness reaches the web on
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:46:  STEP 5: Next user B asks similar question → federation fan-out
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:80:  Max rerank-only headroom on this benchmark: ~4pp NDCG@5.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:153:   capture the compounding loop architecturally and link to it
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:159:3. The Akashik mechanism (5-step compounding loop, peer-local
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:167:Q1. Given the empirical ceiling on LME-S R@5 (NDCG@5 headroom ~4pp,
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:171:    federation rather than tuning per-peer retrieval)? Where should
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:174:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:176:    architecturally novel, or is it a known pattern in disguise?
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:177:    Cite prior art. If it IS novel, what's the closest existing
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:181:Q3. There is NO existing public benchmark for "how much does a
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:183:    R@5 / NDCG@K / MRR benchmarks measure single-peer retrieval
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:184:    quality, not the compounding the mission claims. What
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:185:    benchmark would actually measure the mission? Could we
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:188:Q4. The Octopus has flagged "input-order bias" (Round 3) and
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:195:      (d) the comparison to competitor numbers (agentmemory 0.952
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:199:Q5. The Akashik mission requires the network to actually grow.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:200:    What's the smallest-viable launch plan that produces a
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:201:    meaningful compounding signal in the first ~30 days post-
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:204:    the compounding becomes visible to a new contributor visiting
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:207:Q6. The Akashik architecture relies on user curiosity as the
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:214:      (c) adversarial contributors flood the federation with
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:219:Q7. The competitor frame (mem0/agentmemory/ByteRover) was the
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:233:    Which of these is the closest competitor / collaborator / fork
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:236:Q8. Final philosophical question. The mission is "make the OSS
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:239:    counter-argument someone could make against this entire
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:244:  - Direct answers to Q1-Q8
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:245:  - For Q2: closest prior-art protocol or research paper, with
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:247:  - For Q3: a proposed benchmark for measuring federation-level
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:248:    compounding, with the metrics and the experimental design
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:249:  - For Q5: the smallest-viable launch plan (specific communities,
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:251:  - For Q7: definitive identification of the 2-3 systems that are
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:252:    actual competitors (not categories)
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:253:  - For Q8: the strongest counter-argument + a one-paragraph
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:277:## Q1 — Where should the next engineering month go?
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:283:More importantly: Akashik's product claim is not "our single-peer R@5 beats mem0." That was wellinformed's frame, and the pivot explicitly abandoned it. Akashik's claim is that the compounding loop produces network-level knowledge availability that grows monotonically. That claim cannot be validated by any per-peer retrieval benchmark. The engineering debt is not "push R@5 from 0.920 to 0.940." The engineering debt is "there is no benchmark for what we claim."
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:288:1. Federation measurement infrastructure (~40%) — see Q3
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:289:2. AT Protocol DID compatibility audit (~30%) — see Q7
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:295:## Q2 — Is the Akashik mechanism novel or a known pattern?
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:297:It is compositionally novel. Its five components are each known; no prior system assembles them in this specific combination with this specific set of formal properties.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:305:| **W3C SPARQL 1.1 Federated Queries** (2013 spec) | Semantic federation: one query fans out to multiple SPARQL endpoints, results merged. | Requires central service-description registry for peer discovery. No P2P pull. No attribution. No caching compounding. |
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:311:The single most important citation to engage: **Freenet's monotonic availability proof.** Akashik's `R(T,t) = monotonically non-decreasing` is structurally the same claim. You should either cite and extend Freenet's proof to the semantic-search case, or derive your own. Without a formal proof or simulation backing it, "compounding is a property of the architecture, not a marketing claim" is still a marketing claim.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:315:## Q3 — What benchmark actually measures the mission?
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:317:No existing public benchmark measures federated knowledge compounding. This is a real gap and a publishable contribution.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:330:| `coverage_growth(T, t)` | Fraction of peers that can answer topic T at time t | Directly measures the compounding claim |
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:331:| `T_half(T)` | Time for 50% of network to acquire a topic | Speed of compounding |
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:337:**The key experimental design decision:** corpora must be strictly disjoint at setup time, with controlled overlap introduced as a variable. This lets you separate "federation lift from serendipitous overlap" from "genuine cross-peer knowledge transfer."
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:339:**Baseline condition:** all queries evaluated local-only (federation disabled). The delta is the federation value.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:341:**Publication path:** this benchmark, if run rigorously and released publicly, is a short paper for SIGIR or ECIR workshop on Federated Information Retrieval. It also doubles as your launch credibility anchor.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:345:## Q4 — Known pitfalls you're probably hitting
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:357:- **Availability confounding.** Your current bench runs with all peers online. In production, the 2000ms timeout means some peers never respond. Your single-peer benchmarks (LME-S, LoCoMo) don't model this. AkashikBench-F should include a "partial availability" condition: what is federation R@k when 20% of peers are offline?
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:359:- **Corpus contamination.** If you run multi-peer simulation with overlapping source corpora (e.g., two peers that both indexed the same web page), the federation looks better than it is — you're measuring deduplication handling, not genuine knowledge transfer. Strict corpus disjointness at setup is non-negotiable for valid results.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:371:- These numbers come from each product's own benchmarking with their own chunking strategy, embedding model, retrieval head size, and evaluation protocol. They are NOT run on identical setups.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:373:- The LongMemEval paper's own baseline numbers for "retrieval-only" are lower than all three products' published numbers — suggesting each product tuned for this specific benchmark.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:375:**The real risk:** publishing "wellinformed 0.9202 vs mem0 0.925" when the evaluation protocols differ is a credibility trap. The correct framing for Akashik launch is NOT R@5 comparison against single-user products. It's `web_fallback_rate` vs baseline (before federation) — a metric only Akashik can report.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:379:## Q5 — Smallest-viable launch plan: 100 contributors, 30 days, visible compounding
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:383:Reasons: small and high-trust (≈5,000 serious contributors globally), terminal-native (CLI fits), deep knowledge-sharing culture (This Week in Rust newsletter has 15k+ subscribers), and the community has a known pain — institutional memory evaporates when maintainers rotate. Akashik's compounding property is precisely the fix.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:394:**The compounding signal to show at day 30:**
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:395:Instrument and publish `web_fallback_rate` for the `rust` room. The expected curve: day 1 ≈ 80-90% web fallback (sparse graph), day 30 < 40% (librarian + early-adopter knowledge covers the common queries). This is the compounding claim made visible.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:401:## Q6 — Network health problems
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:409:Specific mitigation: weight the federation fan-out ordering by inverse document frequency across rooms. Nodes that exist on only one peer get a boost in ranking — scarcity is a signal for uniqueness, not irrelevance. The `peer-reputation-store.ts` infrastructure already exists; extend it to track per-topic peer coverage as a first-class signal.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:427:## Q7 — Real competitors (not categories)
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:431:**Primary competitor: AT Protocol (Bluesky)**
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:433:This is the most important one. AT Protocol solved federated identity (DIDs), signed content, Personal Data Servers (each user owns their data), and protocol-level federation at scale (millions of users). Their architecture maps almost directly: PDS = Akashik peer, DID = Akashik contributor identity, lexicon record type = Akashik graph node type.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:439:**Secondary competitor: Are.na**
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:447:Not a competitor in the traditional sense — Obsidian is a tool, Akashik is a protocol. But Obsidian's user base (technical writers, researchers, OSS developers who maintain public "digital gardens") is exactly Akashik's first-wave contributor pool. An Obsidian plugin that treats a published Obsidian vault as an Akashik peer would give Akashik instant distribution to Obsidian's 1M+ users without requiring them to change their workflow.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:449:**The three explicitly NOT competitors:** mem0, agentmemory, ByteRover. These are single-user, server-side, API-first products. They are measuring something different (agent context management) and serving a different customer (developers building agents). Continuing to compare against them is a category error now that the identity pivot has happened.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:453:## Q8 — Strongest counter-argument (and response)
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:455:**The counter-argument:**
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:463:The cold-start problem is real for every network, but it conflates two distinct claims. The first claim — "federation is valuable once you have density" — is trivially true and grants the counter-argument. The second claim — "Akashik provides value before density" — is the actual product bet, and it's defensible: the web-fallback path means a contributor with zero peers still gets a functional local knowledge tool on day 1. Federation value is strictly additive. The counter-argument applies if Akashik required federation to work at all; it doesn't. However, the counter-argument correctly identifies the real risk: if the compounding claim is made at launch but can't be demonstrated (because the network is too sparse), early adopters experience a tool that feels like a slower version of their existing web search. The engineering month is not zero precisely because without `web_fallback_rate` instrumentation and AkashikBench-F, there is no number to show at launch that makes the compounding claim concrete rather than aspirational. The engineering constraint is measurement, not architecture.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:471:- **Read-path reranking with local LLMs does not beat bi-encoder** on either benchmark, even after fixing the shuffle bias. This is not a bug in the implementation — the implementation is correct. The small-model listwise chapter is empirically closed unless a cloud-API ablation shows the headroom is capturable at all.
docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:476:1. **AkashikBench-F harness** — build the N-peer simulation bench described in Q3. This is what validates the mission claim. Without it, launch is vibes. With it, launch is a paper and a credible number.

exec
/bin/zsh -lc "sed -n '1,260p' findings.md" in /Users/saharbarak/personal/wellinformed
 succeeded in 0ms:
# SOTA Retrieval Synthesis: CPU-Bound Memory & Temporal Reasoning (2024-2026)

This synthesis evaluates 2024-2026 retrieval techniques against the strict constraints of the `wellinformed` pipeline (CPU-only, ARM Hetzner CAX11 4GB, TypeScript + transformers.js + sqlite-vec), specifically targeting the 10-13pp loss in multi-session and temporal-reasoning questions on LongMemEval-S.

## 1. Late-Interaction CPU Ports
**Techniques:** ColBERTv2, PLAID, Jina-ColBERT-v2.
*   **Advantage:** Jina-ColBERT-v2 (with Matryoshka down to 64 dims) deployed via ONNX INT8 achieves near-SOTA BEIR NDCG (approaching 0.75+) by computing token-level interactions. PLAID allows sub-100ms multi-vector scoring on CPU.
*   **Trade-off/Disadvantage:** On the other hand, multi-vector representations inflate the `sqlite-vec` storage size by 10-50x compared to single-vector. Furthermore, `sqlite-vec` does not natively support the MaxSim operator required for ColBERT scoring, necessitating a custom UDF or application-side processing that will spike memory usage on a 4GB node.

## 2. Matryoshka Representation Learning (MRL) & SPLADE-v3
**Techniques:** Truncated embeddings (e.g., `nomic-embed-text-v1.5`), `naver/splade-v3`.
*   **Advantage:** MRL allows truncating dense vectors (e.g., to 128d) for blazing fast first-stage retrieval on CPU while retaining ~98% of the information. SPLADE-v3 achieves SOTA sparse lexical precision, acting as a "learned BM25" that flawlessly handles exact-match entities.
*   **Trade-off/Disadvantage:** Conversely, SPLADE-v3 requires storing dynamic sparse vectors. Since `sqlite-vec` is optimized for dense arrays, you must fall back to SQLite FTS5 with pseudo-text or use a separate sparse index, increasing architectural complexity. MRL maintains the same transformer forward-pass latency as full models; it only speeds up the vector distance calculation.

## 3. MTEB/BEIR 2024 Winners (Open-Weight)
**Techniques:** `gte-Qwen2-1.5B`, `bge-en-icl`, `NV-Embed-v2`.
*   **Advantage:** `gte-Qwen2-1.5B` is the most viable SOTA embedding LLM for CPU, capable of running via ONNX with INT8 quantization, providing top-tier MTEB scores due to its LLM backbone. `bge-en-icl` provides excellent in-context learning for niche domains.
*   **Trade-off/Disadvantage:** However, the tradeoff is extreme latency and OOM risk. Even a quantized 1.5B parameter model will consume ~1.2-1.5GB of RAM. On a 4GB Hetzner instance also running a Node daemon and SQLite, concurrent queries will trigger OOM kills. `NV-Embed-v2` (7B parameters, ~16GB VRAM) is completely unfeasible.

## 4. Conversational Memory & Temporal Retrieval
**Techniques:** Anthropic Contextual Retrieval, MemoRAG, LightRAG, MemGPT-2 (Letta).
*   **Advantage:** Anthropic's Contextual Retrieval (prepending 50-100 tokens of situational/temporal context to every chunk before embedding) directly targets the temporal-reasoning weak spot. It ensures vector searches match chronologically relevant facts, requiring zero changes to the `sqlite-vec` engine. LightRAG offers efficient incremental updates for relation tracking.
*   **Trade-off/Disadvantage:** The downside of Contextual Retrieval is increased token usage and indexing cost, as every chunk requires an LLM call to generate context. LightRAG introduces graph-traversal logic that is hard to debug on the fly, increasing the "bus factor" if the primary author is unavailable.

## 5. Reasoning-Augmented Retrieval
**Techniques:** Corrective-RAG, Self-RAG, Search-o1.
*   **Advantage:** Corrective-RAG dynamically grades retrieved chunks and triggers fallbacks (like web search or query rewriting) if confidence is low, drastically improving the LoCoMo factual harmonic-mean.
*   **Trade-off/Disadvantage:** The tradeoff is the addition of an LLM generation step directly in the critical retrieval path. This will add 1-3 seconds of latency, destroying the UX for fast typeahead or real-time conversational responses.

## 6. Rerankers Beyond MS-Marco
**Techniques:** `bge-reranker-v2`, `mxbai-rerank`, ColBERT-as-rerank.
*   **Advantage:** `mxbai-rerank` and `bge-reranker-v2` (quantized to ONNX) offer a 5-8% relative lift over `ms-marco-MiniLM` in zero-shot transfer, pulling up edge cases in SciFact.
*   **Trade-off/Disadvantage:** On the other hand, running a heavier cross-encoder over the Top-100 candidates on an ARM CPU is computationally punishing. To fit the latency budget, you must reduce the re-rank depth (e.g., Top-20), which caps the potential recall gain.

## Ablation-Stack Analysis: Compounding vs. Canceling
*   **Compounding:** Contextual Retrieval + MRL + `bge-reranker-v2`. Contextualization fixes the temporal/semantic ambiguity in the chunk; MRL ensures the first-stage SQLite search remains fast; the cross-encoder fixes precision.
*   **Canceling:** SPLADE-v3 + Contextual Retrieval. Adding generated context to chunks bloats the sparse vocabulary with LLM-generated generic tokens, diluting SPLADE's exact-match signals. MemoRAG + Self-RAG introduces redundant LLM reasoning cycles that compound latency but offer diminishing returns on accuracy.

## Top-3 Sprint Hit-List (Not Currently Planned)
1.  **Anthropic Contextual Retrieval (Data Preprocessing)**
    *   **Effort:** ~4 hours (prompt engineering at indexing time).
    *   **Expected Lift:** +0.02 to +0.03 on LME-S (directly hitting multi-session and temporal-reasoning).
    *   **CPU/ARM Viability:** 100% viable (shifts the compute to indexing time via API).
2.  **Jina-ColBERT-v2 (INT8 ONNX) as a Re-ranker**
    *   **Effort:** ~12 hours (integrating MaxSim scoring over small Top-20 sets).
    *   **Expected Lift:** +0.025 BEIR NDCG.
    *   **CPU/ARM Viability:** Viable only if restricted to Top-20 candidates to avoid CPU bottlenecks.
3.  **Matryoshka Truncation (using `nomic-embed-text-v1.5`)**
    *   **Effort:** ~6 hours (updating indexing logic and transformers.js parameters).
    *   **Expected Lift:** Neutral on accuracy, but frees up ~30% CPU cycles/memory, enabling concurrency.
    *   **CPU/ARM Viability:** Highly recommended for 4GB nodes.

## Cross-Cutting Concerns & Compliance

### Human Factors & Operational Sustainability
*   **Runbooks & On-Call:** Replacing BM25/MiniLM with WASM-based SPLADE or ColBERT MaxSim scoring makes the system vastly more complex. Are runbooks updated to diagnose an OOM kill caused by a runaway ONNX memory leak? The Hetzner 4GB instance has little margin for error; alert fatigue is a real risk if the daemon starts thrashing swap space.
*   **Bus Factor:** If we adopt custom ONNX graphs or custom SQLite UDFs for ColBERT, can more than one person on the team diagnose a production failure? We must balance SOTA techniques with maintainability.

### CI/CD Security (Privileged Attack Surface)
*   Treat the CI/CD pipeline as a highly privileged attack surface. It executes third-party code and has write access to production.
*   **Model Poisoning / Supply Chain:** If the CI/CD pipeline dynamically pulls `transformers.js` weights or ONNX files from Hugging Face without hash verification, a compromised upstream repository could inject poisoned embedding models, leading to targeted data blindness or prompt injection vulnerabilities.
*   **Mitigation:** Ensure artifact signing (SLSA) for the compiled Node binaries. Scope pipeline secrets strictly (e.g., HF tokens, Hetzner SSH keys) and ensure GitHub Actions cannot exfiltrate these via malicious PRs.

### Enterprise Compliance (SOC2 / GDPR / Data Residency)
*   **Contextual Retrieval Risk:** Prepending context to chunks means summarizing potentially sensitive temporal events. Under GDPR, if a user requests data deletion, we must guarantee that all synthetic contextual headers derived from that user's data are also purged from `sqlite-vec`.
*   Audit trails must explicitly log when an embedding model version changes, as this alters the fundamental representation of compliance-sensitive data.

## DONE
web search: 
web search: Freenet original paper monotonic availability citation ...
codex
1. **Q1:** Spend the next engineering month on **federation architecture and measurement**, not on squeezing LME-S `R@5` from `0.9202` toward `agentmemory`’s claimed `0.952`. Your own numbers show the single-peer head is already near-saturated on LongMemEval-S (`R@50 = 1.0000`, `NDCG@5 = 0.8836`, `MRR = 0.9034`) while the product claim lives or dies on Step 5 transfer, not on another 1-3 leaderboard points ([Round 4 brief](/Users/saharbarak/personal/wellinformed/docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:1), [bench plan](/Users/saharbarak/personal/wellinformed/docs/research/beat-the-competitors-retrieval-plan.md:1), [benchmarks](/Users/saharbarak/personal/wellinformed/docs/product/BENCHMARKS.md:287)). The upside is this is the only work that validates the Akashik thesis; the downside is you delay an easy marketing win and accept that per-peer retrieval will remain “good enough” rather than obviously best-in-class for another month.

2. **Q2:** It is **not wholly novel**; the closest prior art is **Freenet** (“*Freenet: A Distributed Anonymous Information Storage and Retrieval System*,” 2001) with a secondary lineage to **CCNx/NDN** ([Freenet paper PDF](https://www.cs.princeton.edu/courses/archive/fall11/cos518/papers/freenet.pdf), [RFC 8569](https://www.rfc-editor.org/rfc/rfc8569)). The overlap is demand-driven retrieval plus replication/caching as a function of requests; the difference is that Akashik’s units are **signed semantic research objects with human provenance and web-on-miss curation**, not anonymous content blobs or network-layer content objects. Position it as: **“Freenet/CCNx semantics applied to attributed research memory”**; the advantage is a crisp technical lineage, however the tradeoff is you cannot overclaim novelty and should instead claim **novel composition**.

3. **Q3:** Proposed benchmark: **AkashikBench-F**. Use `snap-research/locomo` ([repo](https://github.com/snap-research/locomo), arXiv `2402.17753`) plus LongMemEval-S (arXiv `2410.10813`) as source conversations, partition them across `N=32` simulated peers and `4-6` rooms with controlled topical overlap, replay `1,000-2,000` timestamped queries sequentially, and on miss let the querying peer obtain the gold evidence from a fixed “web oracle” corpus and cache it locally. Measure `federation_hit_rate`, `web_fallback_rate`, `coverage_growth(T,t)`, `T_half(T)` (time until half the peers can answer topic `T`), median/p95 answer latency, and quality deltas versus local-only; define **compounding** quantitatively as the negative slope of `web_fallback_rate` and positive slope of `coverage_growth` over repeated asks. This is runnable on commodity hardware in a week because it is a simulator over existing corpora, not a live distributed deployment; on the other hand, if you do not model peer churn and fact staleness, you will overstate the compounding effect.

4. **Q4:** Three likely pitfalls beyond input-order bias and metric blindness:
   1. **Causal leakage in E11 enrichment:** if enrichment includes future-session facts or answer-like strings, you are benchmarking metadata leakage, not retrieval; fix by enforcing pre-query-only enrichment and asserting no gold-answer overlap in indexed headers.
   2. **Availability confounding in federation eval:** all-peers-online tests make Step 5 look stronger than it will be; fix by reporting every federation metric under churn conditions such as `50%/80%/95%` peer availability and bounded timeouts.
   3. **Apples-to-oranges competitor baselines:** `agentmemory`, `mem0`, and `ByteRover` use different chunking, judges, and sometimes different task definitions; fix by either rerunning them in one harness or stop presenting raw point gaps as if they were controlled comparisons.  
   The advantage of fixing these is credibility; however the tradeoff is some currently favorable numbers may get worse.

5. **Q5:** Smallest viable 30-day launch: seed **three named OSS rooms** with about 100 people total, not a broad public beta. Room A: `ggml-org/llama.cpp` + `ollama/ollama` contributors and power users (`40` people), seeded with `ggml-org/llama.cpp`, `ollama/ollama`, `abetlen/llama-cpp-python`, `microsoft/onnxruntime`; Room B: `vllm-project/vllm` + `sgl-project/sglang` (`30` people), seeded with `vllm-project/vllm`, `sgl-project/sglang`, `flashinfer-ai/flashinfer`, `BerriAI/litellm`; Room C: `open-telemetry/opentelemetry-collector` (`30` people), seeded with `opentelemetry-collector`, `opentelemetry-js`, `opentelemetry-python`, and the OTel spec. Week 1 recruit 10-15 “librarian” contributors and preload repo/paper/debug artifacts; Week 2 onboard the remaining 85-90 users; Week 3 run shared debugging/research prompts; Week 4 publish day-1 vs day-30 `web_fallback_rate` and attributed peer-transfer examples. The upside is visible density and repeated question overlap; however the tradeoff is this is a deliberately narrow launch and may look unimpressive if you judge it by signups instead of transfer rate.

6. **Q6:**  
   **(a) Popularity cascade:** closest solved-by example is **Mastodon**; its instance-local timelines and moderation keep communities from collapsing into one global popularity order ([docs](https://docs-p.joinmastodon.org/), [network features](https://docs-p.joinmastodon.org/user/network/)). Akashik analogue: rank partly by scarcity/novelty across peers, not only frequency; the tradeoff is worse immediate relevance for the hottest topic.  
   **(b) Niche knowledge evaporation:** closest solved-by example is **LOCKSS**; low-demand content survives because preservation is policy-driven replication, not demand-only caching ([LOCKSS](https://www.lockss.org/)). Akashik analogue: add room-level pinning/replication quotas for rare high-value records; the tradeoff is storage overhead and moderation burden.  
   **(c) Adversarial misinformation flood:** closest solved-by example is **Wikipedia**; the mechanism is revision history, revertability, watchlists, protection levels, and citation norms. Akashik analogue: quarantine untrusted imports, signed provenance, per-room trust policies, and reversible moderation logs; however this raises governance cost and future SOC2-style audit requirements if you ever sell to teams.

7. **Q7:** The three most informative real comparisons are:
   1. **Are.na**: closest user behavior. Positioning: *Are.na if blocks were queryable, signed, and propagated peer-to-peer on demand instead of living on a central service* ([Are.na](https://www.are.na/), [Blocks docs](https://help.are.na/docs/getting-started/blocks)).
   2. **Bluesky / AT Protocol**: closest federation substrate. Positioning: *ATProto for research memory rather than social posts; borrow DIDs/repos/federation, add semantic retrieval and web-on-miss compounding* ([paper arXiv `2402.03239`](https://arxiv.org/abs/2402.03239), [repo](https://github.com/bluesky-social/atproto)).
   3. **agentmemory**: closest current benchmark rival. Positioning: *agentmemory wins the single-player retrieval leaderboard; Akashik only matters if it turns that local memory quality into cross-peer transfer and lower web fallback* ([repo](https://github.com/JordanMcCann/agentmemory)).  
   Are.na is stronger on curation UX, ATProto is stronger on identity/federation maturity, and agentmemory is stronger on single-node recall; on the other hand, none of them currently combine all three axes.

8. **Q8:** Strongest counter-argument: **“You are adding a flaky, mostly-offline federation hop in front of systems that already solve knowledge sharing better: Google, Stack Overflow, GitHub Discussions, Discord, Are.na, and repo docs. In practice, users will miss locally, peers will be offline, and Akashik will collapse into ‘web search plus personal cache,’ which is not a new network.”** The honest response is: that argument is strong unless you can show a dense room where `web_fallback_rate` materially drops over 30 days and Step 5 transfers happen with attribution faster than fresh web research. Local-first plus web-on-miss means the product is still useful on day 1; however the tradeoff is brutal: if the first room does not show measurable transfer under real churn, the federated-commons thesis is not yet proven and should not be pitched as proven.

**Prerequisites**
- An instrumented **2-peer and 10-32-peer demo** with attribution, latency, and `web_fallback_rate`.
- **AkashikBench-F** with churn, disjoint corpora, and staleness controls.
- **Cross-router peer discovery** or a lightweight coordinator, because LAN-only discovery is not a launch path.
- **Trust/quarantine/audit primitives** for imported records, because without them misinformation handling and later enterprise questionnaires around audit trails and data control both fail.

If I were Sahar, the next engineering month I’d spend on **AkashikBench-F plus a working multi-peer demo** because that is the shortest path to proving the compounding claim under real availability constraints. The next marketing/launch month I’d spend on **one dense OSS cluster launch around `llama.cpp`/`vLLM`/OpenTelemetry** because repeated questions in a bounded community are the fastest way to make transfer visible. Specifically NOT **the LME-S R@5 race** because it improves a benchmark headline while leaving the central product thesis unvalidated.
2026-05-26T14:56:48.914600Z ERROR codex_core::session: failed to record rollout items: thread 019e64c6-ff79-73e3-9b00-7d79d2ab16b0 not found
tokens used
96,224
```
# Completed: יום ג׳ מאי 26 2026 18:03:43 IDT
