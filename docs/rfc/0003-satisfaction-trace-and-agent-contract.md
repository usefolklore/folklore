# RFC-0003 — Satisfaction Trace & Agent Contract

- Status: Draft
- Author(s): Folklore maintainers
- Created: 2026-06

## Summary

When Folklore answers a query, it should not hand the agent a pile of top-k chunks and leave the "is this enough?" decision implicit. This RFC defines the **agent contract**: an explicit, JSON-safe recommendation — *use memory / verify one source / search / ask the user* — accompanied by the **satisfaction trace** that produced it (each scorer component, its value, whether it was observable, and the weight it carried). The contract is computed by a single pure function, `decideContract()`, so the local `ask` path and the federated peer-pull path derive and explain a decision exactly one way. This RFC documents what ships today in `src/domain/peer-telemetry.ts`; it is the operational companion to RFC-0002's deny gate (which consumes the `use_memory` verdict) and the first concrete step of the "Minimum Bright Protocol" sketched in [`../protocol/PROTOCOL-QUALITY-QUESTIONS.md`](../protocol/PROTOCOL-QUALITY-QUESTIONS.md).

## Motivation

The hardest problem in agent memory is not retrieval — it is deciding when retrieval is *enough*. An agent that sees a plausible chunk, forms a plan, and stops searching before it has the fact that would change the action has failed by premature closure, not by hallucination. Folklore treats this as a protocol problem: the response must carry **evidence and a decision**, not just relevance.

Two pressures make the contract worth its own RFC. First, a deny (RFC-0002) is a destructive override of a tool the agent explicitly requested; a user who sees a blocked `WebSearch` must be able to trace *exactly* which signals justified it. A score alone (`0.87`) is not an explanation. Second, the decision threshold logic had drifted into two near-identical copies (the local `ask` path and the peer-pull telemetry path), which is how thresholds silently diverge. Consolidating onto one traceable function removes that risk and gives v2 (task-risk, coverage maps) a single place to specialise.

## Design

### Result envelope

Scoring operates over `EnrichedMatch` — a retrieval hit augmented with the metadata the scorer needs, pulled off the graph by the caller so the scorer stays pure:

```ts
interface EnrichedMatch {
  node_id: string;
  distance: number;                    // lower = closer
  source_peer: string | null;         // null = local, peerId = arrived from this peer
  also_from_peers: readonly string[]; // other peers that returned the same node
  source_uri?: string;
  fetched_at?: string;                // ISO-8601
  age_days?: number;                  // computed against `now`
  has_signature?: boolean;            // did:key envelope verified
  stale_after_days?: number;          // global default when omitted
}
```

Optionality is load-bearing: a missing field means *unobserved*, not *zero*. The scorer never invents a `0.5` prior for an absent signal (an earlier version did, and it inflated the floor on low-data result sets).

### Satisfaction model

Five components, each in `[0,1]`, aggregated as an **equal-weight average over observed components only**:

| Component | Measures | Observed when |
|---|---|---|
| `retrieval` | top-3 mean of `(1 − distance)` | any results |
| `freshness` | fraction inside the stale window | ≥1 hit has `age_days` |
| `provenance` | fraction with `source_uri` **and** `fetched_at` | always (boolean per node) |
| `consensus` | distinct origins agree (all-local = N/A = 1.0) | any results |
| `signature` | fraction with a verified signature chain | ≥1 hit reports `has_signature` |

Penalties (subtractive, capped at −0.4 total): majority missing provenance (−0.15), single **remote** origin re-share (−0.15), top hit semantically adjacent only at `d > 1.5` (−0.2), more stale than fresh (−0.1). `score = clamp01(avg_observed − penalties)`.

### The satisfaction trace

`computeSatisfaction()` returns, alongside the score, a five-row trace — the explainability surface a deny must be traceable to:

```ts
interface ComponentTrace {
  name: 'retrieval' | 'freshness' | 'provenance' | 'consensus' | 'signature';
  value: number;        // 0..1
  observed: boolean;
  weight: number;       // equal split across observed rows; 0 when unobserved
}
```

`observed_components` (the count of visible signals) is carried for the shallow-evidence rule below.

### The decision breakpoint

`decideContract(satisfaction, opts?)` maps the score to one action via an explicit table:

| Score | Decision |
|---|---|
| `≥ 0.85` (`CONTRACT_THRESHOLDS.use_memory`) | `use_memory` |
| `≥ 0.65` (`verify_one_source`) | `verify_one_source` |
| `≥ 0.40` (`search_required`) | `search_required` |
| `< 0.40` | `ask_user` |

**Shallow-evidence demotion.** When fewer than 4 of 5 components are observed (or the caller passes `shallowEvidence: true` — e.g. recall-only hits with no live search), a top-tier `use_memory` is demoted to `verify_one_source`. Rationale: `consensus` is a carve-out for the all-local case and `signature` is unobservable on a stand-alone node, so a high score resting on one or two signals is not defensible enough to deny a web call outright.

### The agent contract

```ts
interface AgentContract {
  decision: AgentDecision;            // the verdict above
  recommended_action: string;         // imperative, human-readable
  score: number;
  reasons: readonly string[];         // positives that lifted the score
  penalties: readonly string[];       // negatives that held it down
  trace: readonly ComponentTrace[];   // the per-component breakdown
  would_shadow_search: boolean;       // false only for a confident use_memory
  summary: string;                    // one-line: found · score · lead reason → action
}
```

`would_shadow_search` is the bad-skip instrumentation hook: every escalating decision is worth a shadow web search to measure whether the skip *would* have been wrong, which becomes the training signal for future weight tuning. `AgentDecision` follows a growth promise — existing values keep their semantics, callers default-route on unknown.

This is the same shape across surfaces: it flows into MCP `ask` responses, the smart-hook `additionalContext`, and CLI block output, so an agent (or a human reading a denial) gets the decision boundary, not just prose context.

## Reference implementation

- Scorer + trace: `src/domain/peer-telemetry.ts` — `computeSatisfaction()`.
- Contract: `src/domain/peer-telemetry.ts` — `decideContract()`, `CONTRACT_THRESHOLDS`.
- Callers (deduped onto the contract): `src/application/ask.ts`, `src/application/peer-pull-telemetry.ts`.
- Narrative reference: [`../p2p/satisfaction-scoring.md`](../p2p/satisfaction-scoring.md).

## Open questions

1. **Weights.** The aggregate is currently an equal-weight average over observed components. Should weights be learned from shadow-search outcomes, and should they be global, per-source-type, or per-workspace?
2. **Task risk.** The same score should not authorise the same skip everywhere. Should the contract overlay a task-risk signal (coding vs security vs financial) so high-risk tasks require a higher breakpoint?
3. **Coverage map.** `PeerPullTelemetry.coverage_map` is reserved (`null` today). Should the contract carry a required-facts / covered / missing map for borderline queries, recommending a *constrained* next search rather than a blanket `search_required`?
4. **Conflict.** Should contradicting peer claims surface as a first-class field that forces verification, rather than being averaged into a single score?
5. **Calibration.** What `would_shadow_search` sampling rate, and what BadSkipRate target, should gate any change to the default thresholds?

## Drawbacks & alternatives

Returning a contract is more bytes than returning `decision: string`. The trace is bounded (five rows) and only the borderline cases need the full reasoning, so the cost is small relative to the trust it buys. The alternative — leaving sufficiency implicit and trusting the agent to re-search — is exactly the premature-closure failure this RFC exists to address.

## Relationship to other RFCs

RFC-0001 defines the node model and deny semantics at the contract level. RFC-0002 defines the deny gate that consumes the `use_memory` verdict. This RFC defines how that verdict — and the three other verdicts — are computed and explained. It changes no wire format; it formalises a domain-layer contract that already ships.
