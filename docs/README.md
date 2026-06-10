# Akashik — documentation index

This directory holds the long-form docs. The repo README is the
front door; everything substantial is here, organised by domain.

```
docs/
├── product/         the why and what
├── architecture/    decision records, protocol versions, parity studies
├── p2p/             federation, identity, satisfaction, trust
├── protocol/        open questions that gate the protocol's evolution
├── marketing/       brand, copy, launch, site redesign work
└── (assets)         logos, banners, GIFs, html previews
```

## product

What Akashik is, why it exists, what's shipped, what's planned.

- [`MANIFESTO.md`](product/MANIFESTO.md) — the why. OSS cooperation vs AI-lab silos.
- [`VISION.md`](product/VISION.md) — the agent-memory protocol problem and where Akashik sits in it.
- [`ROADMAP.md`](product/ROADMAP.md) — north star, priorities, definition of done, explicit out-of-scope.
- [`BENCHMARKS.md`](product/BENCHMARKS.md) — full BEIR v1 results, Phase 25 SOTA, 13 documented null attacks, reproduction scripts.
- [`RELEASE-v4.md`](product/RELEASE-v4.md) — v4 release notes.
- [`GRAPHRAG-AUDIT.md`](product/GRAPHRAG-AUDIT.md) — Akashik audited against 2025/2026 GraphRAG state of the art (Microsoft GraphRAG, HippoRAG 2, LightRAG, MultiHop-RAG, LoCoMo).

## architecture

Locked design decisions.

- [`ADR-001-v3-memory-protocol.md`](architecture/ADR-001-v3-memory-protocol.md) — v3 memory protocol decision record.
- [`ADR-002-v4-agent-brain.md`](architecture/ADR-002-v4-agent-brain.md) — v4 agent brain decision record.
- [`V3-PROTOCOL.md`](architecture/V3-PROTOCOL.md) — v3 protocol spec.
- [`V4-PROTOCOL.md`](architecture/V4-PROTOCOL.md) — v4 protocol spec.
- [`claude-obsidian-parity.md`](architecture/claude-obsidian-parity.md) — feature-parity study against claude-obsidian.

## p2p

Everything federation-layer.

- [`P2P-VISION.md`](p2p/P2P-VISION.md) — federation + identity vision (pre-V5 snapshot; the V5 federation model is in [`V5-PROTOCOL.md`](architecture/V5-PROTOCOL.md)).
- [`p2p-threat-model.md`](p2p/p2p-threat-model.md) — adversary classes, mitigations.
- [`peer-reputation-design.md`](p2p/peer-reputation-design.md) — reputation scoring system.
- [`peer-reputation-load-spreading.md`](p2p/peer-reputation-load-spreading.md) — load-spreading via reputation epsilon-greedy.
- [`satisfaction-scoring.md`](p2p/satisfaction-scoring.md) — **how the agent-contract satisfaction number is calculated** (drives terminal/non-terminal decisions, deny-on-terminal enforcement).

## protocol

Open questions the protocol can't claim resolved.

- [`PROTOCOL-QUALITY-QUESTIONS.md`](protocol/PROTOCOL-QUALITY-QUESTIONS.md) — the live list of protocol-quality questions.

## marketing

External-facing copy and design.

- [`BRAND-KIT.md`](marketing/BRAND-KIT.md) — brand identity.
- [`SITE-REDESIGN-SPEC.md`](marketing/SITE-REDESIGN-SPEC.md) — site redesign spec.
- [`SOCIAL-LAUNCH.md`](marketing/SOCIAL-LAUNCH.md) — social-launch plan.
- [`IMAGEGEN-FRONTEND-WEB.md`](marketing/IMAGEGEN-FRONTEND-WEB.md) — imagegen frontend web spec.
- `marketing/` subdirectory has additional positioning drafts and assets.

## assets

`logo.png/svg`, `banner.png/svg`, `memory-stack.png/svg`, `demo.gif/tape`, `index.html`, `probe.html`, and the `assets/`, `comps/`, `demo/`, `logos/`, `research/` subdirectories.
