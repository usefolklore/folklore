# Vision — the agent-memory protocol problem

Akashik is not a vector store with peer sync bolted on. It is an attempt
at the protocol that decides whether peer knowledge is good enough for an
agent to trust, cite, or use *instead of* a live web search. The product
question:

> When a peer returns knowledge, how do we know it is satisfactory enough to
> stop the agent from searching the web?

If that question is weak, the whole P2P story is vibes — sometimes helpful,
sometimes stale, sometimes wrong, impossible to defend. If it's strong,
Akashik becomes a serious agent-memory protocol. Full thinking surface
(60+ pages, evolving) in
[`docs/PROTOCOL-QUALITY-QUESTIONS.md`](./docs/PROTOCOL-QUALITY-QUESTIONS.md).

### The humanity-level bottleneck

Agent systems are stuck on one thing right now:

> Agents can act faster than humans can verify, but they do not yet know when
> their context is sufficient.

The failure mode is not only hallucination. It's **premature closure** — an
agent sees a plausible chunk, forms a plan, and stops searching before it has
the missing fact that would change the action. Akashik treats this as a
protocol problem, not a model problem:

- Context is not evidence.
- Relevance is not sufficiency.
- Consensus is not independence.
- Freshness is not correctness.
- Confidence is not calibration.
- A memory is not a source unless it carries provenance.
- A source is not an answer unless it resolves the task.

### The decision the protocol must make

Every query needs an explicit breakpoint, not a top-k chunk list. There are
six possible decisions and six kinds of breakpoint that produce them:

| Decision                          | Breakpoint type | Trigger                                                      |
| --------------------------------- | --------------- | ------------------------------------------------------------ |
| Use local / peer memory           | **Stop**        | Enough independent evidence covers every required fact.      |
| Search only the missing facts     | **Continue**    | Partial coverage — agent knows what's still missing.         |
| Refresh the source                | **Refetch**     | Right source, may be stale.                                  |
| Verify against another peer/oracle| **Consensus**   | Multiple answers, independence not yet proven.               |
| Force live verification           | **Risk**        | High-risk task — peer memory cannot be final.                |
| Ask the user                      | **Ambiguity**   | Query underspecified; more retrieval won't fix it.           |

A possible scorer:

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

| Score        | Default behavior                                  |
| ------------ | ------------------------------------------------- |
| ≥ 0.85       | Use peer/local memory; no live search             |
| 0.65 – 0.85  | Use memory, verify one source                     |
| 0.40 – 0.65  | Show memory as hints; perform live search         |
| < 0.40       | Cache miss — search or ask the oracle room        |

Numbers are placeholders. The point is the breakpoint is **explicit and
measurable**, not an emergent property of cosine distance.

### Coverage map > top-k

Instead of returning ranked chunks, the daemon should return a coverage map:

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
    { "fact": "local repo usage", "evidence": ["node:codebase:peer-transport.ts"], "confidence": 0.91 },
    { "fact": "known breaking changes", "evidence": ["peer:alice:release-note-summary"], "confidence": 0.62 }
  ],
  "missing": [
    { "fact": "current libp2p version", "recommended_action": "package_registry_fetch" },
    { "fact": "Node 24 compatibility", "recommended_action": "live_search" }
  ],
  "decision": "search_required"
}
```

This is brighter than top-k because it tells the agent **why** it should keep
searching, and **what to search for**. "Search the web" is too crude — there
are many escalation moves: official docs, exact source URI, package registry,
GitHub releases, local git history, peer oracle, run a local command, run a
benchmark, ask a human. The protocol should recommend the next-best action,
not a binary `search_required: true`.

### The agent contract

Every response should expose an explicit contract to the agent — more useful
than prose context because it gives a decision boundary:

```txt
I found evidence for X.
I did not find evidence for Y.
This is fresh enough because Z.
This is risky because W.
My recommendation: use memory / verify source / search / ask user.
```

### Conflict is more informative than agreement

If two peers disagree, that is often more valuable than a single smooth
answer. The protocol should return contradictions explicitly:

```json
{ "conflicts": [ {
  "claim": "libp2p dcutr works on Node 24",
  "supporting_evidence":   ["peer:a:session-2026-04-20"],
  "contradicting_evidence":["peer:b:release-note-2026-04-24"],
  "recommended_action": "verify_primary_source"
} ] }
```

### Many peers means data treatment, not just retrieval

At small scale, peer search feels like asking a few friends. At network scale
it is a data-processing problem. The system will receive duplicate memories,
near-duplicate summaries, stale once-current sources, contradictory claims,
weak LLM summaries, poisoned spam, lived measurements from unknown peers,
mixed source schemas, repeated re-shares with unclear origins. The protocol
must therefore separate four jobs:

1. **Acquire** peer data.
2. **Treat** it into a clean evidence substrate.
3. **Consolidate** redundant and related evidence (preserving conflict + minority).
4. **Reason** over the treated substrate with provenance intact.

Knowledge moves through explicit stages — the storage layer should reflect
this, not collapse them:

| Stage              | Meaning                                              | Allowed uses                              |
| ------------------ | ---------------------------------------------------- | ----------------------------------------- |
| `raw_remote`       | received from peer, minimally validated              | audit, quarantine, low-trust search       |
| `treated`          | normalized, deduped, scored, provenance-preserved    | retrieval, satisfaction scoring           |
| `consolidated`     | clustered or summarized across evidence              | context injection, reports                |
| `reasoned`         | claims extracted, conflicts found, coverage mapped   | agent contract, skip/search decisions     |
| `accepted_local`   | user or policy promoted it into local memory         | normal local retrieval                    |

**Deduplication is not deletion.** Duplicates can mean independent
discoveries, propagating misinformation, official-source dominance, or sybil
re-shares. Collapse for context, but keep an `EvidenceCluster` record that
preserves origin counts, peer lineage, freshness range, consensus and
conflict scores. Clusters — not individual nodes — should become the primary
retrieval unit at scale.

**Memory degrades** in many ways: source staleness, summary loss, context
drift, dependency drift, peer drift, semantic drift, protocol drift.
Version-sensitive memories should expire faster; repo-aware memories can
include lockfile hashes; consolidation should preserve "fragile facts" and
"what would make this stale" alongside summaries.

### Agent epistemics — typed knowledge

For every answer-bearing result, the agent should know what kind of knowledge
it's holding:

| Label           | Meaning                                                     |
| --------------- | ----------------------------------------------------------- |
| `observed`      | A peer directly saw or ran this.                            |
| `measured`      | A peer produced a benchmark or reproducible result.         |
| `sourced`       | A peer indexed a primary or secondary source.               |
| `summarized`    | An LLM compressed raw material into a memory.               |
| `inferred`      | A peer or model derived a conclusion from evidence.         |
| `hearsay`       | Records someone else's claim without primary evidence.      |
| `stale_known`   | The system knows this may be outdated.                      |
| `unknown_basis` | The basis is missing or stripped.                           |

This makes claim extraction first-class — peers can share `claim` records
with `evidence_kind`, `measured_at`, `environment`, `confidence`, linked back
to exact source spans, instead of laundering weak evidence into confident
prose summaries.

### Quality points & red lines

A quality point is a measurable feature that moves the breakpoint decision.

**Positive:** fresh primary source · direct local measurement · reproducible
command · peer with high historical satisfaction in this domain · independent
peer agreement · refreshable source URI · covers a required fact · exact
versions/dates/commands · verified signature chain · linked to local repo
code.

**Negative:** missing timestamp · summary without raw provenance · stale
source · no exact version · no source URI · single-origin re-share · peer
unknown in this domain · only semantically adjacent · conflicts with another
peer · query is high-risk or time-sensitive.

**Red lines — always block "skip search":**

- Missing `fetched_at`.
- No source or provenance for a factual claim.
- High-risk task (security / dependency / financial / legal) with no primary
  fresh source.
- All evidence traces to one origin through re-shares.
- Stale window exceeded and source can't be cheaply refreshed.
- Room-required signature missing or invalid.

### Minimum bright protocol — v1 milestone

The first genuinely intelligent version. Necessary, not yet sufficient at
network scale, but it's the pivot from *retrieval system* to *epistemic
protocol*:

1. Result quality metadata.
2. Raw-remote landing zone separate from local memory.
3. Treatment pipeline (schema → safety → normalize → dedupe → score →
   quarantine/promote).
4. Evidence clustering with duplicate collapse.
5. Claim extraction for high-value results.
6. Transparent satisfaction scorer.
7. Coverage map for borderline queries.
8. Shadow-search receipts to measure bad skips.
9. Traceable agent contract in every response.
10. Retention and quarantine policy for remote garbage.

### First experiment

A 100-query local study from real agent workflows. For each query: retrieve
local + peer results → produce satisfaction score and agent contract → decide
skip/search/refetch/ask-user → in shadow mode, run the recommended live
verification anyway → label whether the original decision was correct.

Targets before changing protocol defaults:

- `BadSkipRate` < **2%** for low-risk coding tasks.
- `SearchSavedRate` > **25%**.
- `MetadataCoverage` > **90%**.
- ≥ **30 examples** where peer memory beats live search by containing local
  measurement or lived debugging evidence absent from the public web.

### Open research questions

- Does peer memory reduce live searches by 30%+ without raising bad answers?
- Which metadata most predicts peer sufficiency?
- Does consensus across independent peers beat one trusted peer?
- Can claim-level contradiction be detected from metadata alone?
- How often is freshness the actual reason peer memory fails?
- Can an LLM judge peer sufficiency with acceptable human agreement?
- What confidence threshold keeps `BadSkipRate` below 2%?
- Does showing provenance to the agent improve final answer quality?
- Should benchmark claims be first-class typed metadata, distinct from prose?
- How do we represent "trusted peer, untrusted source" vs "untrusted peer,
  official source"?
- How do we detect sybil peers re-sharing one origin as fake consensus?
- Should reputation be local-and-private, or does that lose accountability?
- Can an LLM-free coverage extractor be cheap enough to run on every query?

### The hardest open problem

The hardest problem is not retrieval. It is deciding when retrieval is
enough. That means the protocol needs to carry **evidence, not just
chunks**. The quality system needs to measure **bad skips, not just NDCG**.
The product should optimize for **searches safely avoided** rather than "more
results returned."

Until that is measured, the honest default is:

> Peer knowledge can narrow or answer a query, but high-risk or freshness-
> sensitive tasks still require verification.
