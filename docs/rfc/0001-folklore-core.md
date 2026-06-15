# RFC-0001 — Folklore Core

- Status: Draft
- Author(s): Folklore maintainers
- Created: 2026-06

## Summary

Folklore Core defines the minimum a node must implement to be a Folklore peer: the **node model** (the unit of knowledge), the **room** derivation, the **federated query**, the **deny semantics** that gate the web, and the **provenance** envelope that makes every record attributable. A conforming peer can save knowledge locally, answer queries from its own graph, fan a query out to peers, and serve signed results back.

## Motivation

Agents re-pay for inference over data that's already been resolved. MCP standardizes tool access; A2A standardizes agent-to-agent messaging; neither answers "what do we already know?" Folklore Core is the contract that lets independent peers share resolved reasoning without a central server, so the first hop for any research call is the commons rather than the web.

It works for a single peer (your own graph) and improves monotonically as peers join. The contract below is deliberately small so a Level-0 peer is implementable quickly.

## Design

### Node

The atomic unit. Required fields:

| Field | Type | Notes |
|---|---|---|
| `id` | string (ULID) | stable, sortable |
| `content` | string | the knowledge |
| `type` | enum | `source`, `synthesis`, `finding`, `decision`, `observation`, `contradiction`, `correction` |
| `source_uri` | string | origin; its scheme derives the room |
| `embedding` | float32[384] | `all-MiniLM-L6-v2`, CPU |
| `fetched_at` | timestamp | freshness anchor |
| `provenance` | Provenance | see below |
| `edges` | Edge[] | typed links to other node ids |

`Edge` types: `supports`, `contradicts`, `depends_on`, `supersedes`, `elaborates`, `answers`.

### Provenance

Every node is signed. A consumer can verify the chain end-to-end.

| Field | Type | Notes |
|---|---|---|
| `curator_id` | DID | cryptographic identity of the saver |
| `github_handle` | string | verified, human-attributable |
| `signature` | bytes | over `content` + `source_uri` + `fetched_at` |
| `sources` | string[] | URIs the node was grounded on |

### Rooms

Rooms are **virtual**, derived from `source_uri` scheme, never stored on the node. Two system rooms are mandatory and always federated:

- `toolshed` — codebase / tools / deps (`file:`, `git:` schemes). Stale-after 30 days.
- `research` — web / arXiv / RSS (`https:`, `arxiv:` schemes). Stale-after 7 days.

A peer MUST advertise both. Additional rooms are opt-in.

### Operations

A Level-0 peer MUST implement:

- `SAVE(node)` → signs, embeds, inserts, derives room.
- `ASK(query, {rooms?, peers?})` → runs the retrieval pipeline, returns ranked hits each carrying `score`, `age_days`, `provenance`.
- `ADVERTISE()` → returns the peer's room set for federation membership.

A Level-1 peer adds:

- `FAN_OUT(query)` → federated `ASK` across configured peers over libp2p, merging signed hits.
- `SUBSCRIBE(room)` → push updates for a room.

### Retrieval pipeline (normative for `ASK`)

1. Hybrid recall: BM25 + vector kNN, fused with RRF.
2. Cross-encoder rerank of the fused candidates.
3. Graph PPR rerank over edges.

Each returned hit MUST include its final `satisfaction_score`, `age_days`, and `provenance`.

### Deny semantics

A peer MAY gate an outbound web call. A deny is permitted **iff all three** hold:

- `satisfaction_score ≥ FOLKLORE_DENY_THRESHOLD` (default 0.85)
- hit count `≥ FOLKLORE_DENY_MIN_HITS` (default 2)
- the decision layer returns `use_memory` (not `verify` or `search_web`)

On deny, the peer injects the graph hits into the caller's context in place of the web result. On any failure, the call proceeds and the result MUST be `SAVE`-d. Deny is **off by default**: a false deny is costlier than a redundant fetch.

### Freshness

A hit inside its room's stale-after window is trustworthy. Past the window, a peer SHOULD prefer a fresh pull and replace the stale node on auto-save. A hit lacking `fetched_at` MUST be treated as stale of unknown age.

## Alternatives considered

- **Central knowledge bank.** Rejected: single point of failure, capture, and rate-limiting. Federation keeps every peer sovereign over its own graph.
- **Anonymous records.** Rejected: without provenance there's no way to reason about adversarial or poisoned retrieval. Signing is mandatory.
- **Deny-on by default.** Rejected for v1: false positives erode trust faster than redundant fetches cost. Opt-in per project.

## Open questions

See [the RFC index](README.md#open-questions-right-now) — trust model, rarity-aware replication, deny defaults, cross-peer freshness merge, and conflict surfacing are all live.
