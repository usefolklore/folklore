# Protocol Quality Questions

This document is intentionally unresolved. It is a thinking surface for the
parts of wellinformed that decide whether peer knowledge is good enough for an
agent to trust, cite, or use instead of doing a live search.

The core product question:

> When a peer returns knowledge, how do we know it is satisfactory enough to
> stop the agent from searching the web?

If this question is weak, the whole P2P story becomes vibes: sometimes helpful,
sometimes stale, sometimes wrong, and impossible to defend. If it is strong,
wellinformed becomes a serious agent-memory protocol.

## The Decision We Actually Need To Make

Every query needs a breakpoint decision:

1. Use local graph only.
2. Use trusted peer graph.
3. Ask the oracle room.
4. Trigger live web search.
5. Trigger source re-fetch.
6. Ask the user because the confidence boundary is unclear.

The protocol should not simply return "top-k chunks." It should return enough
evidence for an agent or daemon policy to decide which of these paths is
appropriate.

## What Counts As Amazing?

Peer data is amazing when it beats live search on the dimensions agents care
about:

- It is already scoped to the user's task, repo, toolchain, or room.
- It includes provenance, age, and peer attribution.
- It captures lived debugging experience not present in docs.
- It includes local measurements, configs, commands, errors, and fixes.
- It comes from a peer with a record of satisfying similar queries.
- Multiple independent peers converge on the same answer or source.
- It saves a web search without reducing answer quality.
- It gives the agent enough context to act, not just enough text to summarize.

Open questions:

- What makes a peer answer "actionable" rather than merely relevant?
- Is one high-quality peer better than three weak peers agreeing?
- How do we represent "this was measured locally" versus "this was read
  somewhere"?
- Should a peer be able to say "I know this because I ran it"?
- What metadata would make a coding agent stop and trust the result?

## What Is Garbage?

Peer data is garbage when it wastes the agent's context budget or causes false
confidence:

- Stale release notes presented as current.
- A memory with no source, timestamp, or derivation chain.
- A summary that lost the command, version, or failure mode.
- Near-duplicate hits from one peer pretending to be consensus.
- Dense similarity matches that are topic-adjacent but not answer-bearing.
- Re-shared memories where the original provenance is unclear.
- Peer answers that are too short to verify and too confident to ignore.
- Good content from an untrusted room accidentally crossing into a sensitive
  workflow.

Open questions:

- Can we detect "relevant but not answer-bearing" automatically?
- Should peers return abstentions as first-class results?
- Should a low-quality peer result lower confidence more than no result?
- What is the penalty for a result with no `fetched_at`?
- What is the penalty for a result whose source cannot be re-fetched?

## Satisfactory Enough To Skip Search

Skipping search should require a positive evidence threshold, not just a high
vector score.

A possible satisfaction model:

```
satisfaction =
  retrieval_quality
  + source_quality
  + freshness_quality
  + peer_trust
  + consensus
  + task_fit
  - risk_penalty
  - staleness_penalty
  - missing_metadata_penalty
```

The daemon can then choose:

| Score | Decision |
|---|---|
| `>= 0.85` | Use peer/local memory; no live search by default |
| `0.65 - 0.85` | Use memory, but optionally verify one source |
| `0.40 - 0.65` | Show memory as hints; perform live search |
| `< 0.40` | Treat as cache miss; search or ask oracle |

These numbers are placeholders. The important design point is that the
breakpoint is explicit and measurable.

Open questions:

- What are the initial weights?
- Should weights be global, per room, per source type, or per user?
- Does "skip search" mean no web search, or no agent-initiated search at all?
- Should high-risk domains require a higher breakpoint?
- Should coding tasks, medical/legal/financial tasks, and product research
  have separate policies?

## Required Metadata For Peer Results

A peer result should probably include more than `node_id`, `room`, and
`distance`.

Candidate result envelope:

```ts
interface PeerKnowledgeResult {
  node_id: string;
  room: string;
  label: string;
  distance: number;
  source_peer: string;
  source_uri?: string;
  fetched_at: string;
  indexed_at: string;
  source_type: string;
  content_kind: "doc" | "code" | "session" | "note" | "oracle_answer" | "release" | "benchmark";
  derivation: "raw" | "summary" | "consolidated" | "peer_reshare" | "manual_note";
  has_raw_text: boolean;
  has_signature: boolean;
  signature_chain?: string;
  benchmark_claims?: BenchmarkClaim[];
  freshness_window_days?: number;
  peer_confidence?: number;
  abstention_reason?: string;
}
```

Open questions:

- Which fields are mandatory at the trust boundary?
- Which fields are safe to reveal across peers?
- Should peers reveal labels, summaries, or only source handles until trusted?
- How do we avoid leaking sensitive repo names through `room`?
- Should `distance` be exposed if different peers use different embedders?
- Should every result include the embedder model and dim used to index it?

## Benchmark Claims As Metadata

Some peer results are just memories. Others make claims:

- "This package worked on Node 24."
- "This retrieval setup hit 75.22% NDCG@10."
- "This migration fixed the bug."
- "This source is current as of yesterday."

Claims should be represented as metadata when possible.

Candidate shape:

```ts
interface BenchmarkClaim {
  claim_id: string;
  metric: string;
  value: number | string;
  dataset?: string;
  command?: string;
  environment?: string;
  sample_size?: number;
  measured_at: string;
  reproducible: boolean;
  artifact_uri?: string;
}
```

Open questions:

- Should "measured locally" rank above "read from official docs"?
- What is the minimum benchmark metadata before a claim is trusted?
- Can peers share benchmark artifacts without leaking local paths?
- Should benchmark claims expire faster than ordinary notes?
- Should the protocol distinguish "claim", "evidence", and "interpretation"?

## Correlating Peer Data With Real Search

The strongest way to know whether peer data is satisfactory is to compare it
against live search outcomes.

Possible evaluation loop:

1. Agent asks query `Q`.
2. wellinformed retrieves local + peer candidates.
3. Policy decides whether it would skip search.
4. In shadow mode, still run live search.
5. Judge whether peer data would have been enough.
6. Store outcome as a satisfaction training example.

This creates a real product benchmark:

```
peer_satisfaction_rate =
  queries_where_peer_data_was_enough / total_shadow_queries

bad_skip_rate =
  queries_where_policy_skipped_but_search_found_required_info / total_skips

search_saved_rate =
  queries_where_policy_skipped_and_answer_quality_was_unchanged / total_queries
```

Open questions:

- What is the judge? Human, LLM, heuristic, or mixed?
- What is the gold answer: live search, official docs, final agent answer, or
  user acceptance?
- How do we avoid training the system to prefer SEO pages over peer experience?
- How often should shadow search run?
- Should users opt into telemetry, or should this be local-only?
- Can the benchmark be reproduced without sending private queries anywhere?

## Proposed Satisfaction Bench

Create a benchmark that tests the actual product claim: "peer knowledge is
good enough to avoid repeat research."

Dataset rows:

```json
{
  "query": "how do I wire sqlite-vec with FTS5 hybrid search?",
  "task_type": "coding",
  "room": "wellinformed-dev",
  "local_hits": [],
  "peer_hits": [],
  "live_search_hits": [],
  "final_answer": "",
  "human_label": "peer_enough | search_required | mixed | abstain",
  "required_facts": [],
  "bad_skip_reason": ""
}
```

Metrics:

- `SearchSaved@Policy`: how often the policy avoids search.
- `BadSkipRate`: how often it avoided search incorrectly.
- `PeerEnoughRate`: how often peer/local data contained all required facts.
- `FreshnessMissRate`: how often search was needed only because peer data was
  stale.
- `MetadataCoverage`: how often peer results had enough provenance to judge.
- `AnswerDelta`: final answer quality with peer-only context versus search.
- `LatencySaved`: wall-clock time saved by not searching.
- `TokenSaved`: context and tool-call tokens avoided.

Open questions:

- What BadSkipRate is acceptable?
- Is a 5% bad skip rate tolerable for coding but not for finance/legal?
- Should "mixed" count as success if it reduces search scope?
- How many labeled examples are enough before changing protocol defaults?
- Should we benchmark per room, per source type, per peer, or globally?

## Peer Trust Is Not One Number

Trust should be multi-dimensional:

- Identity trust: do we recognize this peer?
- Room trust: is this room shared intentionally?
- Source trust: is the source official, primary, or random commentary?
- Freshness trust: is the result inside its stale window?
- Historical trust: did this peer satisfy similar queries before?
- Consensus trust: do independent peers agree?
- Signature trust: can we verify authorship and device lineage?
- Domain trust: is this peer good for Rust but weak for ML papers?

Open questions:

- Should trust be user-assigned, learned, or both?
- How do we prevent popularity from becoming correctness?
- How do we represent "trusted peer, untrusted source"?
- How do we represent "untrusted peer, official source"?
- Should trust decay over time?
- Should peers be able to carry endorsements from other peers?

## Consensus And Independence

Three peer hits are not always three pieces of evidence. They may all come from
the same original source or from one re-shared memory.

Open questions:

- How do we identify independent evidence?
- Should the protocol carry `origin_peer` separate from `source_peer`?
- Should re-shares preserve original signature chains?
- Should consensus require different source domains?
- Should duplicate source URLs collapse into one evidence item?
- How do we detect sybil peers repeating the same claim?

## Freshness And Staleness

Every source type needs a freshness policy.

Examples:

| Source type | Possible stale window |
|---|---|
| package release notes | 7-30 days |
| API docs | 7-14 days |
| academic papers | 90-365 days |
| coding session memory | 30-180 days |
| benchmark result | until dependency/environment changes |
| security advisory | hours to days |

Open questions:

- Should stale windows be configured by room or source type?
- Should peers return stale data with a warning or omit it?
- Should a stale but official source outrank fresh commentary?
- How do we detect that a dependency version changed since indexing?
- Can source freshness be verified cheaply without full re-fetch?

## Breakpoints By Risk

The same satisfaction score should not mean the same thing everywhere.

Possible policy:

| Task risk | Peer enough? | Search behavior |
|---|---|---|
| Low-risk coding memory | one trusted answer may suffice | skip search at high score |
| Dependency upgrade | require freshness + source | verify release/docs |
| Security | require fresh primary source | search unless official current source |
| Medical/legal/financial | peer data is context only | always search/verify |
| Product purchase/travel | peer data is hint only | current search required |

Open questions:

- Can the daemon infer task risk from query text?
- Should MCP hosts pass task-risk metadata?
- Should users configure "never skip search" rooms?
- What does the CLI do differently from Claude/Codex hooks?

## Protocol Ideas To Explore

### `knowledge_result_v2`

Upgrade federated search responses to include quality metadata, not only match
distance.

Questions:

- What is the minimal result envelope that improves decisions?
- How much metadata increases bandwidth?
- Which fields are optional without breaking policy?

### `satisfaction_probe`

A request where one peer asks another: "Do you have enough evidence to answer
this query?"

Possible response:

```ts
{
  "can_answer": true,
  "confidence": 0.78,
  "needs_search": false,
  "reason": "fresh official docs + local benchmark",
  "evidence_count": 3,
  "stale_count": 0
}
```

Questions:

- Is this better than search returning top-k?
- Can peers estimate confidence honestly?
- Should confidence be calibrated per peer?

### `abstain`

Peers should be able to say "I know adjacent things, but not enough."

Questions:

- Should abstention improve peer trust?
- Can abstentions reduce useless context injection?
- Should a peer return both weak evidence and an abstention?

### `shadow_search_receipt`

When a live search happens after peer retrieval, store whether the search
confirmed, contradicted, or expanded peer memory.

Questions:

- Is this local-only or shareable?
- Can this become the training data for satisfaction scoring?
- Should peers receive feedback that their result was insufficient?

### `source_refresh_request`

Instead of doing a full web search, ask the peer or local daemon to re-fetch
the specific source behind a hit.

Questions:

- When is refresh cheaper than search?
- Who pays the network/token cost?
- Should refresh results update the shared room automatically?

## What To Build First

The smallest useful version:

1. Add richer peer result metadata: `fetched_at`, `source_uri`, `source_type`,
   `content_kind`, `derivation`, `has_signature`.
2. Add a local satisfaction scorer with explicit weights and trace output.
3. Add `--shadow-search` mode for CLI or hooks.
4. Log `peer_enough`, `search_required`, and `bad_skip_reason` examples.
5. Create a small hand-labeled satisfaction bench from real agent workflows.

Do not start with a complicated learned model. Start with a transparent scorer
that can be argued about.

## Trace Format

Every breakpoint decision should be explainable.

Example:

```json
{
  "query": "sqlite vec fts5 hybrid search",
  "decision": "skip_search",
  "score": 0.87,
  "reasons": [
    "2 fresh peer hits",
    "1 local code hit",
    "official source_uri present",
    "age 3d inside 14d stale window",
    "peer prior satisfaction 0.82"
  ],
  "penalties": [
    "no benchmark artifact"
  ],
  "would_shadow_search": true
}
```

Open questions:

- Should traces be shown to the agent, user, or only logs?
- Should traces be included in MCP tool responses?
- How verbose can traces be before they waste context?

## Research Questions

- Does peer memory reduce live searches by at least 30% without increasing
  bad answers?
- What metadata most predicts peer sufficiency?
- Does consensus across peers beat one trusted peer?
- How often is freshness the reason peer memory fails?
- Are consolidated memories worse than raw memories for task execution?
- Which source types most often satisfy queries?
- Can an LLM judge peer sufficiency with acceptable agreement against humans?
- What confidence threshold keeps BadSkipRate below 2%?
- Does showing provenance to the agent improve final answer quality?

## Red Lines

These should block "skip search":

- Missing `fetched_at`.
- No source or provenance for a factual claim.
- Query classified as high-risk and no primary fresh source is present.
- Peer result only matches semantically but contains no answer-bearing text.
- All evidence comes from one origin through re-shares.
- Source freshness window is exceeded and cannot be cheaply refreshed.
- Signature required by room policy but missing or invalid.

Open questions:

- Which red lines are hard protocol failures versus policy warnings?
- Can users override red lines per room?
- How do we avoid making the system too conservative to be useful?

## The Hardest Open Problem

The hardest problem is not retrieval. It is deciding when retrieval is enough.

That means the protocol needs to carry evidence, not just chunks. The quality
system needs to measure bad skips, not just NDCG. The product should optimize
for "searches safely avoided" rather than "more results returned."

Until that is measured, the honest default is:

> Peer knowledge can narrow or answer a query, but high-risk or freshness-
> sensitive tasks still require verification.

## The Humanity-Level Bottleneck

This is the thing agent systems are stuck on right now:

> Agents can act faster than humans can verify, but they do not yet know when
> their context is sufficient.

The failure is not only hallucination. It is premature closure. An agent sees a
plausible chunk, forms a plan, and stops searching before it has the missing
fact that would change the action.

wellinformed should treat this as a protocol problem:

- Context is not evidence.
- Relevance is not sufficiency.
- Consensus is not independence.
- Freshness is not correctness.
- Confidence is not calibration.
- A memory is not a source unless it carries provenance.
- A source is not an answer unless it resolves the task.

Open questions:

- Can the protocol force agents to distinguish "I found related material" from
  "I have enough to act"?
- Can we make insufficiency visible before the agent commits to a plan?
- Can a local-first graph become a calibrated epistemic instrument rather than
  just a faster cache?

## Agent Epistemics: What The Agent Thinks It Knows

For every answer-bearing result, the agent needs to know what kind of knowledge
it is holding.

Possible epistemic labels:

| Label | Meaning |
|---|---|
| `observed` | A peer directly saw or ran this. |
| `measured` | A peer produced a benchmark or reproducible result. |
| `sourced` | A peer indexed a primary or secondary source. |
| `summarized` | An LLM compressed raw material into a memory. |
| `inferred` | A peer or model derived a conclusion from evidence. |
| `hearsay` | A memory records someone else's claim without primary evidence. |
| `stale_known` | The system knows this may be outdated. |
| `unknown_basis` | The basis is missing or stripped. |

Open questions:

- Should every node carry an epistemic label?
- Who assigns the label: adapter, user, LLM, peer, or verifier?
- Can labels be upgraded after verification?
- Should `unknown_basis` be allowed to influence skip-search decisions?
- How do we prevent LLM summaries from laundering weak evidence into confident
  memories?

## Sufficiency Is Task-Relative

The same result can be sufficient for one task and insufficient for another.

Example:

- Query: "What is sqlite-vec?"
  - A stale overview may be enough.
- Query: "How do I use sqlite-vec with Node 24 in production today?"
  - Needs fresh package/API data, commands, versions, and probably live
    verification.
- Query: "Should I migrate my production vector index this afternoon?"
  - Needs risk analysis, migration notes, backups, and source freshness.

Protocol implication:

The result envelope should not only say "I am relevant." It should help answer:

1. What task type is this query?
2. What facts are required to act?
3. Which required facts are covered by the retrieved evidence?
4. Which required facts are missing?
5. Which missing facts require search, refetch, or user confirmation?

Open questions:

- Can we infer required facts from query type?
- Should the MCP tool return a "missing facts" list?
- Can the agent ask wellinformed for "coverage" instead of "search"?
- Is a coverage map more important than top-k ranking?

## The Coverage Map

Instead of returning only ranked chunks, the daemon could build a coverage map:

```json
{
  "query": "upgrade libp2p dcutr setup for Node 24",
  "required_facts": [
    "current libp2p version",
    "Node 24 compatibility",
    "dcutr config changes",
    "known breaking changes",
    "local repo usage"
  ],
  "covered": [
    {
      "fact": "local repo usage",
      "evidence": ["node:codebase:peer-transport.ts"],
      "confidence": 0.91
    },
    {
      "fact": "known breaking changes",
      "evidence": ["peer:alice:release-note-summary"],
      "confidence": 0.62
    }
  ],
  "missing": [
    {
      "fact": "current libp2p version",
      "recommended_action": "live_search_or_package_registry_fetch"
    },
    {
      "fact": "Node 24 compatibility",
      "recommended_action": "live_search"
    }
  ],
  "decision": "search_required"
}
```

This is brighter than top-k because it tells the agent why it should continue
searching.

Open questions:

- Can this be done without an LLM?
- Should coverage extraction run only when confidence is near a breakpoint?
- How expensive is coverage mapping relative to just searching?
- Can coverage maps be stored and improved over time?

## Breakpoint Taxonomy

There are different kinds of breakpoints:

### Stop Breakpoint

The system has enough evidence to stop searching.

Question:

- What proof is required before stopping?

### Continue Breakpoint

The system has some useful evidence but knows the missing facts.

Question:

- Can we constrain the next search to only the missing facts?

### Refetch Breakpoint

The system found the right source but it may be stale.

Question:

- Is source refresh better than broad web search?

### Consensus Breakpoint

The system has multiple peer answers but does not know if they are independent.

Question:

- Do we verify origin independence or treat consensus as weak?

### Risk Breakpoint

The task risk is high enough that peer memory cannot be final.

Question:

- Which domains force live verification regardless of score?

### Ambiguity Breakpoint

The query is underspecified, and more retrieval will not fix it.

Question:

- Should the agent ask the user before searching?

## Quality Points

A "quality point" is a measurable feature that changes the breakpoint
decision.

Positive quality points:

- Fresh primary source.
- Direct local measurement.
- Reproducible command.
- Peer has high historical satisfaction in this domain.
- Independent peer agreement.
- Source URI can be refreshed.
- The result covers a required fact.
- The result includes exact versions, dates, or commands.
- Signature chain verifies author and device.
- The memory is connected to local repo code.

Negative quality points:

- Missing timestamp.
- Summary without raw provenance.
- Stale source.
- No exact version.
- No source URI.
- Single-origin re-share.
- Peer unknown in this domain.
- Result is only semantically adjacent.
- Result conflicts with another peer.
- Query is high-risk or time-sensitive.

Open questions:

- Which quality points should be hard gates?
- Which are merely scoring features?
- Can the system learn point weights locally from shadow-search outcomes?
- Should quality points be exposed to users as a trace?

## Conflict Is More Informative Than Agreement

If two peers disagree, that is often more valuable than a single smooth answer.

Protocol idea:

Return conflicts explicitly:

```json
{
  "conflicts": [
    {
      "claim": "libp2p dcutr works on Node 24",
      "supporting_evidence": ["peer:a:session-2026-04-20"],
      "contradicting_evidence": ["peer:b:release-note-2026-04-24"],
      "recommended_action": "verify_primary_source"
    }
  ]
}
```

Open questions:

- Can we detect claim-level contradiction from metadata alone?
- Should contradiction always force search?
- Can contradiction improve answer quality by warning the agent early?
- Should peers receive feedback that their memory conflicts with newer data?

## Search Is Not One Thing

"Search the web" is too crude. There are many escalation moves:

- Search official docs.
- Fetch the exact source URI.
- Query package registry.
- Query GitHub releases.
- Query local git history.
- Ask a peer oracle.
- Ask a human.
- Run a local command.
- Run a benchmark.
- Inspect the codebase.

Protocol implication:

The breakpoint decision should recommend the next best verification action,
not merely `search_required: true`.

Open questions:

- Can source adapters advertise what verification actions they support?
- Should result metadata include `refresh_strategy`?
- Should "run local command" be allowed as a verification path?
- How do we prevent unsafe tool execution from peer-provided instructions?

## Memory Degrades

A memory can degrade in several ways:

- Source staleness: the world changed.
- Summary loss: consolidation removed details.
- Context drift: the user's repo changed.
- Dependency drift: versions changed.
- Peer drift: the peer's expertise or trust changed.
- Semantic drift: terms changed meaning.
- Protocol drift: fields once optional become required.

Open questions:

- Can nodes carry degradation modes?
- Should consolidation preserve "fragile facts" separately from summaries?
- Should version-sensitive memories expire faster?
- Can repo-aware memories include dependency lockfile hashes?
- Should a memory be invalidated when package versions move?

## From Search Cache To Knowledge Market

If wellinformed works, peers are not just caches. They become sources of
evidence with different specialties.

This creates incentive and abuse questions:

- Why should a peer share high-quality evidence?
- How does a peer prove it has useful knowledge without leaking it?
- How do we stop low-quality peers from flooding plausible summaries?
- How do we prevent sybil consensus?
- Should peers earn reputation per satisfied query?
- Can reputation be local and private instead of global and gameable?
- Can a peer specialize by room, source type, or benchmark domain?

Design pressure:

Global reputation is tempting but dangerous. Local satisfaction history may be
better: "this peer helped me before on this kind of task."

Open questions:

- Should reputation ever leave the local machine?
- Can peers carry signed attestations without creating a social graph leak?
- How do we handle a once-good peer becoming stale?

## The Agent Contract

The protocol should expose an explicit contract to the agent:

```txt
I found evidence for X.
I did not find evidence for Y.
This is fresh enough because Z.
This is risky because W.
My recommendation is: use memory / verify source / search / ask user.
```

This contract is more important than prose context. It gives the agent a
decision boundary.

Open questions:

- Should every MCP `ask` response include a contract block?
- Should hooks inject only the contract, only evidence, or both?
- Can we train agents to respect "search_required"?
- How do we evaluate whether agents follow the contract?

## Minimum Bright Protocol

A first genuinely intelligent version might require only five additions:

1. Result quality metadata.
2. A transparent satisfaction scorer.
3. A missing-facts or coverage map for borderline queries.
4. Shadow-search receipts to measure bad skips.
5. A traceable agent contract in every response.

This is the pivot from retrieval system to epistemic protocol.

## Updated First Experiment

Run a 100-query local study from real agent workflows.

For each query:

1. Retrieve local + peer results.
2. Produce satisfaction score and agent contract.
3. Decide skip/search/refetch/ask-user.
4. In shadow mode, run the recommended live verification anyway.
5. Label whether the original decision was correct.

Record:

- task type
- required facts
- evidence coverage
- decision
- skipped search or not
- bad skip or not
- time saved
- tokens saved
- whether final answer changed
- missing metadata that would have helped

Target before changing defaults:

- BadSkipRate below 2% for low-risk coding tasks.
- SearchSavedRate above 25%.
- MetadataCoverage above 90%.
- At least 30 examples where peer memory beats live search by containing local
  measurement or lived debugging evidence.

Open questions:

- Who labels the 100 examples?
- Can an LLM pre-label and a human audit disagreements?
- What is the minimum viable UI for reviewing shadow-search receipts?
