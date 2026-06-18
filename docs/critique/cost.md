# Cost-economics critique — does the "compounding inference / 9.1× cheaper" thesis survive?

Adversarial FinOps review of Folklore's central cost claim: that cached + peer-shared
knowledge reduces inference/token/network cost. Grounded in `bench/bench-compounding.mjs`,
`bench/bench-value-model.mjs`, `bench/bench-subgraph-transfer.mjs`,
`src/domain/peer-telemetry.ts`, `eval/out/compounding-summary.json`,
`eval/out/value-model-summary.json`, and the live DB on this host
(`~/.folklore`: 21,133 nodes; `vectors.db` 174 MB; `code-graph.db` 368 MB).

**Bottom line up front:** the *measured, realized* cost reduction on the live `ask`
path today is **0** — 0 web deflections, 0 estimated input tokens saved across 96
natural queries (`value-model-summary.json`). Every headline cost number (9.13×, 77.1%)
is **simulator/model output** under a heavy-tail demand assumption that is *true by
construction*, not a retrieval measurement. The repo's own docs say this; the website
claims do not. The gap between claimed and realized is essentially the whole claim.

---

## Q1 (CRITICAL) — The 9.13× / 77.1% headline is a pure cache simulator, and the win is largely true-by-construction.

**Assumption under attack.** `bench-compounding.mjs` models demand as Mandelbrot-Zipf
(`α=0.9`, `offset=20`), caches as per-peer LRU(`C_p=200`) over `N=5000` topics, and
declares a query a "hit" if the topic sits in *any* peer's cache (a boolean set-membership
test). There is no retrieval, no semantic match, no satisfaction threshold — a "hit" is
`peers[j].has(topic)`. With `P=64` peers × `C_p=200` = 12,800 cache slots against only
5,000 topics, the pooled cache **structurally covers the entire catalog 2.5×over**. The
cooperative hit-rate *cannot not* rise. The script's own header admits the federation
decay is "true by construction" and the BENCHMARKS.md §"Federation web-fallback" section
concedes the 17%→1% curve is "a demonstration, not validated evidence."

**Sensitivity — where the win collapses.** The result is dominated by three inputs:
- **Catalog size `N` vs pooled capacity `P·C_p`.** The default deliberately saturates
  the catalog (`cumPeers=64` → 12,800 slots > 5,000 topics). The header literally says
  dropping to `--cumPeers 16` (3,200 slots < 5,000) gives the "under-provisioned regime
  where the gap never flattens." Real research-query space is not 5,000 topics; it is
  effectively unbounded and **churns**. The model has **zero corpus churn** — topics never
  expire, never get invalidated, never need re-fetch. Folklore's own freshness rule
  (7-day staleness, `peer-telemetry.ts` `DEFAULT_STALE_AFTER_DAYS`) means real hits
  *expire*, re-introducing paid fetches the model never charges for.
- **Zipf skew `α`.** At `α=0.9` the top 1% of topics carry a large share of traffic, so a
  small cache wins big. Flatten the demand (research queries are far less repetitive than
  web-page requests — the cooperative-caching literature it cites is about CDN/web objects,
  not novel research questions) and the hit-rate craters.
- **Peer count `P`.** The compounding curve is the entire thesis, but at `P=1` (the actual
  state of essentially every user today) cooperative = isolated = **18.4%** (`headline.isolated_hit`).
  The 9.1× requires 64 cooperating peers sharing an overlapping query distribution.

**Real vs claimed.** Claimed: 9.13× fewer trips, 77.1% fewer tokens. Realized today
(P=1, real graph, live `ask`): **0% web deflection, 0 tokens saved.** The simulator is
internally consistent and Che-validated, but it validates a *model of CDN caching*, not
Folklore's retrieval. **Severity: CRITICAL** — it is the headline number and it is not measured.

## Q2 (CRITICAL) — The deny gate is the only mechanism that actually saves money, and it fires ~never on real queries.

**Assumption under attack.** The cost saving is physical only when the PreToolUse deny
gate cancels an outbound `WebSearch`/`WebFetch` (skipping the network trip *and* the LLM
tokens to process the result). Everything else is bookkeeping. The shipped gate requires
`decision === 'use_memory'` (`bench-deny-sweep.mjs` lines 198–201), which per
`peer-telemetry.ts` `CONTRACT_THRESHOLDS.use_memory` needs **satisfaction ≥ 0.85** —
*and* ≥4 of 5 components observed, else it is demoted to `verify_one_source` (which does
not deny).

**Sensitivity / measurement.** On the live path (`bench-user-value`, 96 natural queries
over the real 21,133-node graph): **mean satisfaction 0.33**, grounded success 22.9%,
**web deflections 0**. Satisfaction of 0.33 is not within reach of the 0.85 deny floor —
not even close. The deny-sweep confirms the shipped gate is "**inert**" because
`use_memory` sits behind a fixed 0.85 breakpoint that the `FOLKLORE_DENY_THRESHOLD` knob
cannot lower. A score-only variant reaches 42% true-deny *only on a hand-built in-corpus
fixture*, and min_hits≥2 collapses it to 0%.

**Real vs claimed.** The mechanism that produces the dollars fires **0 times** in the
only live measurement. Current realized cost reduction ≈ **$0**. **Severity: CRITICAL** —
the saving mechanism is disconnected from the saving claim.

## Q3 (HIGH) — Double-counting: the same avoided event is banked as both a saved web trip AND saved tokens.

**Assumption under attack.** `value-model-summary.json` presents "9.13× fewer paid web
trips" and "77.1% fewer model-input tokens" as two distinct wins, and the scorecard SVG
plots them as separate bars. But in `subgraphEconomics()` they are the **same event**: a
cooperative hit avoids one web trip *and* substitutes `GRAPH_CONTEXT_TOKENS` (1200) for
`WEB_CONTEXT_TOKENS` (8000) for that identical query. They are two projections of one
avoided fetch, not two independent savings. A reader who mentally adds "9× cheaper trips
*plus* 77% cheaper tokens" is double-counting; the honest figure is a single avoided-fetch
count expressed in two units.

**Sensitivity.** The token ratio is entirely set by the `8000 / 1200` assumption (a
6.7× per-query token advantage baked in before any caching). If a graph hit actually needs
more context to be trustworthy (provenance, multiple neighbors — the protocol's own
"context is not evidence" stance), `GRAPH_CONTEXT_TOKENS` rises and the 77% shrinks
proportionally. The number is an assumption, not a measurement of token bills (the runner's
own grade: "modeled from measured trips and measured graph payloads, **not LLM bill logs**").
**Severity: HIGH** — the two headline numbers are not additive and are driven by one
hard-coded ratio.

## Q4 (HIGH) — Counter-costs the model omits entirely; netted, they can erase the win at low P.

The cost model charges **nothing** for the machinery that produces the saving:

- **Prefetch on every outbound call.** The PreToolUse hook runs a hybrid lex+vec search
  (+ optional federated fan-out) before *every* `WebSearch`/`WebFetch`, including the ~91%
  of queries that miss and proceed to the web anyway. `bench-warm.mjs`: vector k-NN p50
  30 ms; `bench-e2e.mjs`: warm-ask p50 **755 ms**, fed-ask p50 **1045 ms**. That is latency
  and compute added to *every* outbound query, paid even on a miss. At a 9% hit rate, ~91%
  of prefetches are pure overhead.
- **Embedding cost to index every fetch (auto-save).** The PostToolUse hook embeds and
  stores every web result. That is an embedding-inference cost per fetch — a *new* recurring
  inference charge the "tokens saved" line never nets against.
- **Storage growth.** Measured on this host: **174 MB `vectors.db`** for ~21k nodes
  (~8.3 KB/node all-in) plus **368 MB `code-graph.db`**. Linear in corpus → at 1M nodes
  that is ~8 GB of vectors alone, before VACUUM/maintenance churn. Not free at scale.
- **P2P sync bandwidth.** The subgraph model itself counts **2.92 GB** of P2P transfer
  (`p2p_transfer_bytes`) to achieve its 200k-query saving, at ~19.6 KB per federated hit.
  Bandwidth is a real (often metered) cost the "cheaper" framing ignores.

**Net.** At P=1 (no peers) there is no federation benefit, so prefetch + embed + storage
are **pure cost with zero offsetting saving** — the system is strictly more expensive than
just paying for the web call. **Severity: HIGH** — for the realistic single-user case the
net is negative.

## Q5 (HIGH) — Break-even requires conditions that do not exist in the field today.

**The unit economics.** A saving materializes only when (avoided web+LLM cost) >
(prefetch compute + embed cost + amortized storage/bandwidth) AND the deny gate actually
fires. From the numbers:
- **Hit rate must clear the deny floor.** Realized live satisfaction 0.33 vs required 0.85.
  The gate needs satisfaction in a band it currently never reaches on natural queries.
- **Peers.** The compounding curve only bends with `P` in the dozens sharing an overlapping
  query distribution. Cooperative=isolated at P=1; meaningful lift in the sim appears around
  P=16–64. A solo user or a 2–3 person team sits on the flat part of the curve.
- **Query volume + repetition.** The Zipf reuse assumption requires the *same* topics
  recurring across the network. Research/coding queries are far more novel and longer-tailed
  than the CDN-object demand the model borrows.

**Realistic break-even:** needs (a) the read path fixed so live satisfaction reaches ~0.85
on real queries (the repo flags this as an open gap — index health shows title coverage
2.4%, source_uri 0.1%), (b) tens of peers with overlapping demand, and (c) enough repeated
queries to amortize the per-fetch embed + storage. None of (a)/(b)/(c) hold today.
**Severity: HIGH.**

## Q6 (MEDIUM) — Subgraph "real graph" number (63.3%) is a within-graph projection, not a measured saving.

`bench-subgraph-transfer.mjs` measures real transplant payloads (avg 3.9 nodes / 2.9 edges,
p50 1.3 KiB) on the live graph — that part is genuinely measured. But the **63.3% token
saving** is then computed by *assuming* `RELATED_QUERIES=8` future related asks each would
have cost `WEB_CONTEXT_TOKENS=8000` and now cost `GRAPH_CONTEXT_TOKENS=1200`. The "8 related
queries actually got asked and actually hit the transplanted neighborhood" is an assumption,
not an observation. It reuses the same 8000/1200 ratio as Q3, so it is the same modeled
advantage re-expressed on a real payload sample. **Severity: MEDIUM** — payload is real,
the saving is modeled.

## Q7 (MEDIUM) — Headline mismatch / number drift weakens credibility.

The compounding script prints a hardcoded "web-fallback 81.5%" string and a "4.9× fewer
trips" sweep figure, while the cumulative section reports "9.1×" — two different multipliers
from the same run (`headline.fewer_web_trips_x = 4.91` vs `cumulative.cheaper_x = 9.13`).
The website quotes the larger one. Both are simulator outputs, but quoting 9.1× without the
4.9× context, and without the P=1 → 18.4% baseline, overstates the typical case.
**Severity: MEDIUM** — not wrong, but selectively framed.

---

## Verdict

**Does the cost-reduction thesis hold?** As a *model*, it is internally coherent and
Che-validated — cooperative caching over heavy-tail demand does reduce fetches, and the
simulator demonstrates the sign and shape. As a *realized product saving today, it does
not hold*: the live `ask` path deflects **0%** of web calls, saves **0** tokens, and the
deny gate that is the actual money-saving mechanism is **inert** because live satisfaction
(0.33) sits far below the 0.85 firing threshold. The 9.13× and 77.1% are simulator/model
figures under a saturated-cache, zero-churn, high-Zipf assumption that is partly true by
construction, and the two headline numbers are two views of one avoided event (double-count
risk). Counter-costs (per-fetch prefetch + embed, 174 MB+ vectors, ~2.9 GB P2P) are
unaccounted; at the realistic P=1 single-user case the net is *negative*.

**Under what conditions could it hold?** All three must land together: (1) the read path
is fixed so real-query satisfaction reliably clears ~0.85 (today's biggest blocker — index
metadata coverage is near-zero), (2) tens of peers with genuinely overlapping query demand,
(3) query repetition high enough to amortize the per-fetch embedding + storage overhead.

**Single biggest threat:** the deny gate does not fire on real queries. Everything
downstream — trips avoided, tokens saved, compounding — is conditional on satisfaction
crossing 0.85, and the only live measurement puts it at 0.33 with 0 deflections. Until that
gap closes, the realized cost reduction is indistinguishable from zero while the system adds
prefetch, embedding, and storage costs that the model never subtracts.
