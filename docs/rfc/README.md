# Folklore RFCs

The RFC process is where Folklore's design decisions get made in the open. It exists for **credibility and contributors**, not as the product pitch — Folklore ships as a working tool first; the spec documents what the tool already does and where it's headed.

## Status

| RFC | Title | Status |
|---|---|---|
| [0001](0001-folklore-core.md) | Folklore Core — node model, sharing gate, federation, deny semantics | Draft |
| [0002](0002-deny-on-confidence.md) | Deny-on-Confidence Gate — the network-before-web hook | Draft |
| [0003](0003-satisfaction-trace-and-agent-contract.md) | Satisfaction Trace & Agent Contract — the explainable breakpoint decision | Draft |

## Process

1. **Propose.** Open an issue describing the problem and your proposed change. Tag it `rfc`.
2. **Draft.** If there's appetite, write it up as `docs/rfc/NNNN-short-title.md` following the template below and open a PR.
3. **Discuss.** The PR is the venue. Design debate happens in review.
4. **Accept / decline.** A maintainer merges (Accepted) or closes with rationale (Declined). Accepted RFCs become the reference for implementation.

## Template

```markdown
# RFC-NNNN — Title

- Status: Draft | Accepted | Declined | Superseded
- Author(s):
- Created:

## Summary
One paragraph.

## Motivation
What problem, why now, who feels it.

## Design
The actual proposal — data shapes, operations, wire format, defaults.

## Alternatives considered
What else, and why not.

## Open questions
What's still undecided.
```

## Open questions right now

These are the live design decisions where input is most useful:

1. **Provenance trust model.** GitHub-handle attestation is the v1 anchor. Is that enough, or do we need a web-of-trust / staking layer for sybil resistance?
2. **Rarity-aware replication.** How aggressively should the network replicate niche knowledge so it survives its sole holder going offline — and who pays the disk?
3. **Deny defaults.** Should deny-on-confidence ever be on by default, or is opt-in the permanent stance?
4. **Cross-peer freshness.** When two peers hold the same fact at different ages, what's the merge rule beyond "prefer fresher"?
5. **Conflict surfacing.** When peers hold contradictory conclusions, does Folklore resolve, or just surface both with provenance and let the agent decide?
