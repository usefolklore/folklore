# Folklore protocol specification

This directory is the **spec surface** for Folklore — the entry point to the
protocol that the engine in `src/` implements. The spec is intentionally a thin
index: the authoritative documents live under `docs/`, and this README points
at them so the protocol has one discoverable front door (and a clean boundary
for the eventual `folklore-spec` org repo — see `docs/REPO-SPLIT.md`).

Folklore ships as a working tool first; the spec documents what the tool already
does and where it is headed. It is here for credibility and contributors, not as
the product pitch.

## Where the spec lives

| Surface | Path | What it is |
|---|---|---|
| RFC index | [`docs/rfc/README.md`](../docs/rfc/README.md) | The canonical RFC process + status table. Start here. |
| RFC-0001 | [`docs/rfc/0001-folklore-core.md`](../docs/rfc/0001-folklore-core.md) | Folklore Core — node model, federation, deny semantics. |
| Current wire protocol | [`docs/architecture/V5-PROTOCOL.md`](../docs/architecture/V5-PROTOCOL.md) | **Current** versioned protocol (V5: workspace + private, post-rooms). |
| Protocol quality | [`docs/protocol/PROTOCOL-QUALITY-QUESTIONS.md`](../docs/protocol/PROTOCOL-QUALITY-QUESTIONS.md) | Open quality/correctness questions for the protocol. |
| Whitepaper | [`docs/WHITEPAPER.md`](../docs/WHITEPAPER.md) | The long-form design narrative. |

Earlier wire-protocol versions (`docs/architecture/V3-PROTOCOL.md`,
`V4-PROTOCOL.md`) are kept as superseded history — V5 is the live spec.

## Reading order

1. [`docs/rfc/README.md`](../docs/rfc/README.md) — the RFC process and status.
2. [`docs/rfc/0001-folklore-core.md`](../docs/rfc/0001-folklore-core.md) — the core node + federation model.
3. [`docs/architecture/V5-PROTOCOL.md`](../docs/architecture/V5-PROTOCOL.md) — the current wire protocol the daemon speaks.

## Proposing a change

The RFC process is described in [`docs/rfc/README.md`](../docs/rfc/README.md):
open an issue tagged `rfc`, draft `docs/rfc/NNNN-short-title.md`, discuss in the
PR, and a maintainer accepts or declines.
