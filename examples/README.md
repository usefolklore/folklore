# Folklore examples

Copy-paste, runnable usage of the Folklore CLI. Every command below is a real
subcommand of `folklore` (verify with `folklore help`); nothing here is
invented. Install first, then work through the examples in order.

## Install

```bash
npm install -g @usefolklore/folklore
folklore doctor --fix     # check + bootstrap runtime prerequisites
```

Or from a checkout of this repo:

```bash
npm install
npm run build
node bin/folklore.js help
```

## 1. Index and search a codebase

Parse a codebase into the local code-graph (tree-sitter index), then run a
structured query against it:

```bash
folklore codebase index ./src --name folklore-core
folklore codebase list                       # find the id of what you just indexed
folklore codebase search "rrf fusion"        # structured code-graph query
```

## 2. Ask the graph (network-before-web)

`ask` runs semantic search over your local graph and emits context. If your
graph already holds a confident answer, you reason from the cache instead of
paying for a web trip:

```bash
folklore ask "how does mxbai-rerank compare to cross-encoder on long contexts?"
```

## 3. Ask, federated across peers

Add `--peers` to fan the same question out to connected peers first — the first
hop becomes "what does the network already know about this?":

```bash
folklore ask "what did we conclude about RRF vs reranking on scientific text?" --peers
```

## 4. Save a synthesized insight

After reasoning through a result, file a typed node so the next session (yours
or a peer's) hits the distilled claim first:

```bash
folklore save --label "rerank-domain-mismatch" \
  --text "bge-reranker-base regresses on scientific text (MS-MARCO domain mismatch)" \
  --type synthesis
```

## 5. Make Claude Code use the graph automatically

Wire the network-before-web hook into Claude Code so `WebSearch` / `WebFetch`
are gated by the graph without any manual calls:

```bash
folklore claude install
```

## See also

- [`../spec/README.md`](../spec/README.md) — the protocol the engine implements.
- [`../bench/README.md`](../bench/README.md) — reproduce the retrieval benchmarks.
- [`../docs/architecture/REPO-LAYOUT.md`](../docs/architecture/REPO-LAYOUT.md) — the full repository layout.
