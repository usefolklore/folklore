# Repository layout

This is the authoritative map of the Folklore repository. It describes the
akashikprotocol-clean layout the repo follows: a functional-DDD engine in `src/`,
a separated spec surface, isolated benchmarks, runnable examples, and a site that
deploys independently. Every directory named here exists on disk — this doc cites
nothing that is not present.

The matching org-boundary plan (which of these directories become which repos
under the `usefolklore` org) is in [`../REPO-SPLIT.md`](../REPO-SPLIT.md). The
physical split is deferred until the org exists; this layout is what gets split.

## Top-level tree

```
folklore/
├── src/             # functional-DDD engine (domain / application / infrastructure / cli / daemon / mcp)
├── tests/           # the suite npm test runs (~85 *.test.ts files)
├── bench/           # standalone benchmark + sweep + qrel runners (import the compiled ../dist)
├── spec/            # protocol spec surface — thin index into docs/rfc + docs/protocol + V5-PROTOCOL
├── docs/            # architecture, product, research, brand, marketing, rfc, protocol, whitepaper
├── site/            # the folk-pop marketing site (deploys independently via Cloudflare Pages)
├── examples/        # copy-paste runnable usage of the folklore CLI
├── folklore-rs/     # Rust retrieval crate (Cargo.toml) used by the rust-subprocess embedder path
├── bin/             # CLI entrypoint (folklore.js)
├── config/          # config.example.yaml and runtime config templates
├── vendor/          # git submodules — vendor/graphify
└── .github/         # CI workflows (ci.yml, release.yml) + pull_request_template.md
```

Other present top-level entries — `assets/`, `demo/`, `dist/` (build output),
`eval/`, `node_modules/`, `scripts/` (non-bench bootstrap + render helpers) — are
supporting material, not part of the engine/spec/site separation below.

## Directory roles

| Directory | Role |
|---|---|
| `src/` | The engine. Functional DDD: no classes in domain/app, `neverthrow` Results, IO pushed to the edges. See the layer breakdown below. |
| `src/domain/` | Pure logic — node model, vectors (incl. `rrfFuse`), rerank tiering (`pickRerankTier`). No IO. |
| `src/application/` | Use-case orchestration over domain logic. |
| `src/infrastructure/` | IO at the edges — embedders, vector index, P2P/federation, code-graph, storage, `hw-detect`. See [`../../src/infrastructure/README.md`](../../src/infrastructure/README.md). |
| `src/cli/` | The `folklore` command surface (`src/cli/commands/*.ts`). |
| `src/daemon/` | Background research daemon — IPC fast path + libp2p. |
| `src/mcp/` | The MCP server Claude Code (and other harnesses) auto-spawn. |
| `tests/` | The full suite. Standalone benchmarks live in `bench/`, not here; only in-suite bench *tests* (`tests/bench-*.test.ts`) stay. |
| `bench/` | All standalone benchmark / sweep / qrel runners, consolidated in plan 25-03. Each imports the compiled `../dist` build. Reproduction index: [`../../bench/README.md`](../../bench/README.md). |
| `spec/` | The protocol spec surface — a thin index ([`../../spec/README.md`](../../spec/README.md)) into `docs/rfc/`, `docs/protocol/`, and the current `docs/architecture/V5-PROTOCOL.md`. |
| `docs/` | All documentation: `architecture/` (ADRs, V3/V4/V5 protocol, retrieval modules), `product/` (BENCHMARKS), `research/`, `brand/`, `marketing/`, `rfc/`, `protocol/`, the whitepaper. |
| `site/` | The marketing site. Kept independent so it deploys on its own (Cloudflare Pages, `wrangler.toml` → `site/`). Not touched by engine changes. |
| `examples/` | Runnable usage — [`../../examples/README.md`](../../examples/README.md) — verified against real CLI subcommands. |
| `folklore-rs/` | The Rust retrieval crate backing the rust-subprocess embedder. |
| `bin/` | `folklore.js` CLI entrypoint. |
| `config/` | Config templates (`config.example.yaml`). |
| `vendor/` | Git submodules — `vendor/graphify`. |
| `.github/` | CI (`workflows/ci.yml`, `workflows/release.yml`) + `pull_request_template.md`. The org profile README is authored later (DOCS-03, Phase 26) — there is no `.github/profile` here yet. |

## The two surfaces this layout adds

Relative to the akashikprotocol-clean target, the repo previously lacked two
explicit surfaces; both now exist:

- **Spec surface** — `spec/README.md` is the discoverable front door for the
  protocol. The authoritative documents stay in `docs/rfc/` (RFC process +
  RFC-0001), `docs/protocol/`, and `docs/architecture/V5-PROTOCOL.md` (current);
  `spec/` just indexes them and marks the clean boundary for a future
  `folklore-spec` repo.
- **Examples surface** — `examples/README.md` holds copy-paste runnable usage of
  the `folklore` CLI, every command verified against `folklore help`.

## Design principles

- **Functional DDD.** Domain and application layers are pure (`neverthrow`
  Results, no classes); IO is confined to `src/infrastructure/` at the edges.
- **Spec separated from code.** The protocol is documented in `docs/` and
  surfaced via `spec/`, distinct from the `src/` implementation — so the spec can
  split into its own repo without dragging the engine along.
- **Benchmarks isolated from the test suite.** Standalone runners live in
  `bench/` and import the compiled `../dist`, keeping `npm test` (the suite in
  `tests/`) fast and deterministic.
- **Site kept independent.** `site/` deploys on its own track (Cloudflare Pages)
  and is never coupled to engine changes, so a separate `folklore-site` repo is a
  clean lift.
- **Documented over churned.** Module organization is captured by authoritative
  docs (this file, [`RETRIEVAL-MODULES.md`](RETRIEVAL-MODULES.md)) rather than
  risky mass file moves under the zero-regression test bar.

## See also

- [`RETRIEVAL-MODULES.md`](RETRIEVAL-MODULES.md) — the ML/embedding + hybrid-retrieval module map.
- [`../../spec/README.md`](../../spec/README.md) — the protocol spec surface.
- [`../../bench/README.md`](../../bench/README.md) — benchmark reproduction index.
- [`../REPO-SPLIT.md`](../REPO-SPLIT.md) — the org-boundary split plan.
