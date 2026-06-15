# `src/infrastructure` — IO / adapter layer

This directory is the **infrastructure layer** of Folklore's functional-DDD
architecture: the effectful adapters that implement the *ports* defined in
`src/domain`. Everything here does IO — model loads, sqlite, libp2p, the Rust
bridge, the filesystem. The pure logic lives in `src/domain`; the use-cases
that wire the two together live in `src/application`.

Modules group into four clusters.

## retrieval / embedding

The ML / embedding / retrieval adapters. **See
[`../../docs/architecture/RETRIEVAL-MODULES.md`](../../docs/architecture/RETRIEVAL-MODULES.md)
for the authoritative deep-dive** — module roles, the dense + lexical + RRF +
rerank pipeline flow, the rerank tiering, and the measured ceilings.

- `embedders.ts` — `Embedder` port; ONNX (`xenovaEmbedder`) + fixture adapters.
- `vector-index.ts` — `VectorIndex` port; sqlite-vec ANN + FTS5 BM25 store.
- `cross-encoder.ts` — Xenova `ms-marco-MiniLM-L-6-v2` reranker (fail-open).
- `llm-listwise-rerank.ts` — Ollama LLM listwise reranker adapter.
- `rust-retrieval.ts` — stdio JSON-RPC bridge to the `folklore-rs` backend.
- `search-sync.ts` — local hybrid search assembly + request/response federated search.
- `search-gossip.ts` — federated/gossip search over libp2p pubsub (V5).
- `hw-detect.ts` — host capability probe driving the rerank-tier picker.

## P2P / federation

The libp2p transport, peer state, and sync protocols.

- `peer-transport.ts`, `peer-store.ts` — transport + peer registry.
- `share-sync.ts`, `recall-sync.ts` — Y.js / CRDT share + recall sync.
- `ydoc-store.ts` — Y.js document store.
- `bandwidth-limiter.ts`, `connection-health.ts` — rate limiting + health.
- `oracle-gossip.ts` — oracle gossip over pubsub.
- `touch-protocol.ts` — peer touch / liveness protocol.

## code-graph

Structured codebase indexing (tree-sitter → code-graph.db).

- `code-graph.ts` — code-graph builder.
- `tree-sitter-parser.ts` — tree-sitter source parsing.

## storage / misc

Persistence and cross-cutting adapters.

- `graph-repository.ts` — the knowledge-graph repository.
- `atomic-write.ts` — crash-safe atomic file writes.
- `config-loader.ts` — config file loading.
- `log-store.ts` — append-only log store.
- `sessions-state.ts` — session state persistence.

---

Markdown files in `src/` are documentation only — `tsconfig.json`'s `include`
is `src/**/*` but a `.md` file is not a `.ts` file, so this README has zero
build impact.
