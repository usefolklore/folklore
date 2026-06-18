# Folklore

**Your agent never researches the same thing twice.**

Folklore is the hearth your AI agents gather around. The fire is your
knowledge graph; the tales are everything you (and your peers) have already
read, indexed, and distilled. Knowledge survives here the way folklore always
has — passed on, peer to peer, never relearned from scratch.

## What it is

A local-first memory and research layer for AI agents. It answers from your
own graph *before* the web, and it federates that graph peer-to-peer — so a
thing one peer paid to research is a thing nobody on the network pays for
again. The lore is the graph; the folk are the peers.

## The bet

It works **alone** on day one: a single agent, a single laptop, no cloud, no
account. Then it **compounds** when peers join — each peer's graph becomes
reachable to the rest, and the more people gather around the fire, the less
anyone has to leave it. Product first, protocol second. We ship a working,
benchmarked tool; the spec just documents what it already does.

## Proof, not promises

- **72.30% NDCG@10** on full BEIR SciFact — pure-Node hybrid retrieval
  (nomic-embed-v1.5 + BM25 RRF), directly comparable to the MTEB BEIR
  leaderboard.
- **75.22% NDCG@10** on the same dataset with the optional Rust sidecar
  (bge-base-en-v1.5) — above published bge-base dense, with no GPU.
- **11 ms p50** end-to-end retrieval. **137M params.** Zero GPU, zero cloud.
- **+20–43% recall@1** from sharing inference trees peer-to-peer — vs a proper
  single-node semantic cache, at a matched ≤2% false-accept budget, on real BEIR
  sets (SciFact +20.5%, NFCorpus +26.2%, FiQA +43.3%). Federated semantic-cache
  reuse: a peer inherits the verified answer to any question the network already
  resolved.
- 13 documented null attacks — every dead end is published with a repro
  script, because a documented null beats a hypothetical positive.

Every number above has a command behind it. See the benchmarks page in the
engine repo.

## How it works

It's stone soup for research. When your agent reaches for the web, Folklore
asks your graph — and your connected peers' graphs — first. If a confident
answer is already in the pot (the network-before-web deny-on-confidence
gate), the agent reads it and skips the trip entirely. If nobody has it, the
web call goes through as normal, and the result drops back into the pot so
the next agent — yours or a peer's — finds it waiting. Routine local work
(reading files, grepping code) never touches any of this; only outbound
lookups do.

## Where to look

The repos under this org mirror that same alone-then-compounds shape (some
may still be on their way):

- **folklore** — the engine and CLI. The flagship package. Start here.
- **folklore-spec** — the protocol and its RFCs. The contributor-facing home.
- **folklore-site** — the website source.

## ──

**never research twice.**
