# S2 Geometry Audit — folklore vector architecture

**Lens:** Google S2 / Hilbert-curve hierarchical spatial indexing
**Audit date:** 2026-04-13
**Scope:** `src/infrastructure/vector-index.ts`, `src/domain/vectors.ts`, BENCH-v2, v2.1 candidates
**Rule of thumb:** *Think in cells, not coordinates. The sphere is not flat — and neither is R^{768} after L2 normalization.*

---

## 1. The unique lens — what S2 brings that the prior agents missed

The previous audits (solution-architect, data-scientist, math/geometry) framed folklore's retrieval problem as "which distance function + which index + which encoder." They proposed HNSW, ScaNN, Voronoi/Delaunay tunnels. Good work. But they all stay inside the **continuous geometric** frame: vectors live in R^{768}, we compute real-valued distances, we build graph structures over points.

S2 proposes something structurally different: **throw away the points and keep the cells.** Every embedding becomes a 64-bit integer cell ID. Every proximity query becomes an **integer range scan on a B-tree**. Every room becomes a **prefix** in the cell-ID bit string. Every tunnel becomes a **neighbor-cell lookup** on the 30-level hierarchy. The distance metric is replaced by a cell-containment/adjacency relation, and the index is no longer a specialized vector structure (vec0, HNSW, IVF) — it's the same B-tree SQLite has been shipping since 2004.

Nobody else in the audit chain pointed at the fact that **sqlite-vec's `vec0` virtual table is the weakest link in folklore's stack**: it forces `MATCH ? AND k = ?` which is a full scan dressed up as a virtual-table query ([vector-index.ts:107-113](../../src/infrastructure/vector-index.ts#L107)), it rejects `INSERT OR REPLACE` ([vector-index.ts:90-95](../../src/infrastructure/vector-index.ts#L90)), and its room-filter path is a 10× over-fetch hack ([vector-index.ts:157-165](../../src/infrastructure/vector-index.ts#L157)). An S2-style integer-cell index is the only proposal in the audit series that could **delete vec0 entirely** and replace it with plain `CREATE INDEX idx_cell ON vec_meta(cell_id)`.

That's the lens: **trade geometry for integers; trade virtual tables for B-trees; trade k-NN for range scans.**

---

## 2. Does S2 indexing apply to R^{768} sphere-normalized embeddings?

This is the fundamental math question, and I'll be honest: **it partially applies, with caveats the literature documents but does not fully resolve.**

**What's true.** The all-MiniLM-L6-v2, nomic-embed-text-v1.5, and bge-base-en-v1.5 encoders all produce L2-normalized outputs, so every vector in folklore lives on the unit hypersphere S^{767} ⊂ R^{768}. The S2 library proper operates on S² (the 2-sphere) via a cube-face projection + quad-tree + Hilbert ordering ([google/s2geometry](https://github.com/google/s2geometry), [S2Vec ArXiv 2025](https://arxiv.org/html/2504.16942v1)). The mathematical machinery of Hilbert curves generalizes trivially to any d-dimensional hypercube [0,1]^d — the Moore/Butz constructions give you d-dim Hilbert curves directly. So "Hilbert-order a high-dim space" is mechanically possible and the literature has been doing it since the 90s ([Lawder & King 2000](https://dl.acm.org/doi/10.1145/373626.373678), [Efficient Neighbor-Finding on Space-Filling Curves, Stuttgart 2017](https://arxiv.org/pdf/1710.06384)).

**What's false.** S2's *quality* — the specific geometric property "near cells ↔ near points" — degrades badly in high dimensions. Space-filling-curve ANN methods (SK-LSH, HD-Index, JSpaceFillingCurve) are **known to not scale past ~30-50 dimensions** without heavy compensation mechanisms (multiple shifted curves, dimensionality reduction, learned rotations). The [VLDB SK-LSH paper](https://dl.acm.org/doi/abs/10.14778/2732939.2732947) and [Stuttgart 2017 survey](https://arxiv.org/pdf/1710.06384) are explicit: d=768 is **outside the operating range** of raw Hilbert-curve ANN. At 768 dimensions the curve "unfolds" in a way that destroys the locality guarantee — two points that are L2-close will frequently end up in opposite halves of the curve.

**What actually works in practice.** The literature converges on a two-stage pattern:

1. **Reduce first, then Hilbert-order.** Project R^{768} → R^{d'} with d' ∈ {8, 16, 32} via random projection, PCA, or a learned rotation (ITQ, OPQ). Then Hilbert-order the reduced space. This is essentially how [Hilbert-curve assisted structure embedding, PMC 2024](https://pmc.ncbi.nlm.nih.gov/articles/PMC11285582/) works, and it matches the SPANN/ScaNN inverted-index philosophy: cluster into O(√n) cells first, then scan candidates.
2. **Use the Hilbert order for *locality clustering*, not for distance estimation.** The curve tells you *which bucket* a point lives in; you still re-rank within the bucket with real L2/cosine.

**Literature verdict.** No paper I can find adapts Google's S2 library *directly* to R^{d>3}. [S2Vec (2025)](https://arxiv.org/html/2504.16942v1) uses S2 cells as *spatial tokens* that a neural net embeds into R^d — but the S2 cells themselves live on the actual Earth, not on the embedding sphere. The correct framing is not "use S2 on R^{768}" but "build an S2-inspired **hierarchical integer-cell index** over a dimensionality-reduced projection of R^{768}." That's the workable version.

---

## 3. Concrete proposal — Hilbert-ordered cell index for folklore

### 3.1 Schema

Replace the current `vec0` virtual table with a plain table over 64-bit cell IDs:

```sql
-- Drop vec0 virtual table entirely. Replace with:
CREATE TABLE vec_nodes (
  rowid      INTEGER PRIMARY KEY,
  node_id    TEXT    UNIQUE NOT NULL,
  room       TEXT    NOT NULL,
  wing       TEXT,
  cell_id    INTEGER NOT NULL,  -- 64-bit Hilbert cell ID
  embedding  BLOB    NOT NULL,  -- raw 768-d float32 for exact rerank
  created    INTEGER NOT NULL
);
CREATE INDEX idx_vec_cell      ON vec_nodes(cell_id);       -- B-tree over sorted ints
CREATE INDEX idx_vec_room_cell ON vec_nodes(room, cell_id); -- room-prefix scans
```

### 3.2 Cell ID construction

Offline, during ingestion (`upsert`):

```typescript
// src/domain/cell.ts — new module
export const toCellId = (v: Vector, rotation: Float32Array): bigint => {
  // 1. Project 768 → 16 via learned rotation (ITQ or PCA)
  const reduced = project(v, rotation);           // Float32Array(16)
  // 2. Unit-normalize (stays on S^15)
  const unit = normalize(reduced);
  // 3. Map each coord into [0, 2^4) — 4 bits per axis × 16 axes = 64 bits
  const quantized = quantize(unit, 4);            // Uint8Array(16)
  // 4. Hilbert curve index over 16-d hypercube
  return hilbert16d(quantized);                   // bigint
};
```

The rotation matrix is learned once on a bootstrap corpus (`scripts/fit-rotation.mjs`) and persisted to `~/.folklore/rotation.bin`. 4 bits × 16 axes gives ~1.8 × 10^{19} cell IDs, plenty of resolution for a 5K-100K node corpus.

### 3.3 Query pattern

```typescript
export const searchByCell = (
  db: Database,
  query: Vector,
  rotation: Float32Array,
  k: number,
): readonly Match[] => {
  const qCell = toCellId(query, rotation);
  // Neighbor cells via Hilbert prefix widening — O(log n) prefix scan
  const rangeBits = pickRangeBits(qCell, /*targetCandidates=*/ k * 20);
  const lo = qCell & ~((1n << BigInt(rangeBits)) - 1n);
  const hi = lo | ((1n << BigInt(rangeBits)) - 1n);

  // Pure integer B-tree range scan — no MATCH, no virtual table
  const candidates = db.prepare(
    `SELECT node_id, room, wing, embedding
     FROM vec_nodes
     WHERE cell_id BETWEEN ? AND ?`
  ).all(lo, hi);

  // Exact rerank inside the candidate bucket
  return candidates
    .map(c => ({ ...c, distance: l2(query, fromBuf(c.embedding)) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k);
};
```

### 3.4 Complexity vs current

| Operation | Current (`vec0`) | S2-style | Notes |
|---|---|---|---|
| `searchGlobal(k)` | O(n) vec0 scan + k-sort | O(log n) B-tree range + O(c) rerank | `c` = candidates in bucket, typically 20k-100k |
| `searchByRoom(k)` | O(n · overfetch) + filter | O(log n) prefix scan | Room is a B-tree column, no overfetch |
| `upsert` | DELETE+INSERT (OK) | INSERT + index update | Same cost class |
| `all()` (tunnels) | Full table scan | Full table scan (unchanged) | Only used offline |

For folklore's 2,830 research vectors the asymptotic win is theoretical — n is too small for log n to matter. **The real win is getting off `vec0`.** sqlite-vec 0.1.x is pre-release; it has the upsert problem, the MATCH+k syntax quirk, and an inability to cleanly filter by room. A plain B-tree over cell_id is sqlite since 2004, rock solid, and lets you write normal SQL.

---

## 4. Tunnels via cell adjacency — replacing O(n²) `findTunnels`

Current `findTunnels` at [vectors.ts:106-131](../../src/domain/vectors.ts#L106) is an explicit O(n²) double loop. The previous math-agent audit proposed replacing it with Delaunay triangulation / Relative Neighborhood Graph in R^{768}. That's correct in principle but computationally brutal: Delaunay in d=768 is not tractable — the complexity is O(n^{⌈d/2⌉}).

**S2 alternative — cell-neighbor tunnels.** A tunnel is an edge between two nodes in different rooms that share a low-order cell prefix. Concretely:

```typescript
export const findTunnelsByCell = (
  db: Database,
  threshold: number,
): readonly Tunnel[] => {
  // All pairs whose cell_ids differ only in the lowest ~20 bits,
  // AND whose room differs. This is a single SQL self-join.
  return db.prepare(`
    SELECT a.node_id AS a, b.node_id AS b,
           a.room AS room_a, b.room AS room_b,
           a.cell_id, b.cell_id, a.embedding AS ea, b.embedding AS eb
    FROM vec_nodes a
    JOIN vec_nodes b
      ON a.cell_id >> 20 = b.cell_id >> 20  -- shared 44-bit prefix
     AND a.rowid < b.rowid
     AND a.room != b.room
  `).all()
    .map(row => ({ ...row, distance: l2(fromBuf(row.ea), fromBuf(row.eb)) }))
    .filter(t => t.distance <= threshold)
    .sort((a, b) => a.distance - b.distance);
};
```

**Complexity.** If cells are reasonably balanced the shared-prefix join touches ~O(n · bucket_size) rows, typically O(n · √n) for a well-chosen prefix shift. For folklore's 2,830 vectors that's ~150k rows examined instead of 4M in the naive loop — a **~26× speedup** on findTunnels. At v2.0's projected 100k-node P2P graph the win is ~316×.

**vs the Voronoi / RNG proposal.** The math-agent audit was correct that Voronoi gives you the *sparsest edge set that preserves neighborhood structure*. But Voronoi-based tunneling requires computing the Delaunay in 768 dims (intractable) or in a reduced space (same reduction as S2). Once you've already reduced to R^{16} for cell IDs, you can either: (a) use cell-prefix join (this proposal — simpler, integer-only), or (b) run a proper Delaunay in R^{16} (scipy-style). Option (a) is within an order-of-magnitude of option (b) on recall and is 100× simpler to implement. **Recommend (a).**

---

## 5. Room sharding via cell prefix — structural meaning for rooms

This is the most interesting implication for folklore's domain model, and it directly answers a question the Wave 4 benchmark left unresolved.

**Wave 4 finding (BENCH-v2.md §2c):** oracle room-routing beat flat hybrid by only +0.34 NDCG@10 on CQADupStack. Conclusion: rooms don't carry retrieval-useful partition signal in the current architecture. The report closes with: *"Nothing in the literature uses explicitly user-curated partitions + inter-partition edges as a retrieval scoring signal."*

**S2 reframe.** In the current architecture, rooms are a *metadata tag* — `vec_meta.room` is a TEXT column with an index, and `searchByRoom` is just a filter. Rooms have no geometric meaning; they're labels pasted onto points. Of course they don't help retrieval — they're not part of the index structure.

In the S2 proposal, a room becomes a **reserved high-bit prefix** of the cell ID:

```
cell_id layout (64 bits):
 ┌─────────────┬───────────────────────────────────────┐
 │ 8-bit room  │ 56-bit Hilbert cell over reduced R^16 │
 └─────────────┴───────────────────────────────────────┘
```

This gives rooms **structural** meaning:
- `searchByRoom('tlvtech')` is a range scan `WHERE cell_id BETWEEN room_lo AND room_hi` — a single B-tree seek, zero overfetch, zero wasted work.
- Cross-room tunnels are "pairs of cells that share the *lower* 44 bits but differ in the upper 8" — a specific prefix pattern that can be computed with bit arithmetic.
- Federated P2P sharding can route on the upper bits — a peer advertising `tlvtech` claims the `0x03xxxxxxxxxxxxxx` range and serves queries in that prefix. The Kademlia DHT Phase 17 already uses XOR-distance on peer IDs; cell IDs give you the same property *on content*.

**Does this help BEIR quality?** Probably not on SciFact / NFCorpus — these are single-topic corpora, rooms don't vary. But it closes the open question from Wave 4: "on overlapping-vocabulary rooms, does routing help?" With cell-prefix rooms, the answer becomes **mechanically yes** — the index *is* the partition, not a filter over a flat index. Routing isn't a separate step that can only approximate an oracle; routing is the primary key lookup.

**Structural win:** rooms become a first-class index concept instead of a metadata overlay. That's the answer to *"what is a room, geometrically?"* — it's a Hilbert cell-ID prefix.

---

## 6. Expected impact on BEIR — honest scoping

**Latency: strong win (1-2 orders of magnitude at scale).** Replacing `vec0 MATCH + scan` with `cell_id BETWEEN` is a genuine algorithmic improvement from O(n) to O(log n + candidates). At 2,830 vectors the absolute latency is dominated by constant factors and the rerank loop, so the Wave 2 36ms p50 might only drop to ~25ms. At 100k vectors (projected v2.1 target) the win is 5-10×. At 1M+ vectors (P2P federated view) it's the difference between usable and not.

**Quality: neutral-to-slightly-negative, honestly.** S2/Hilbert indexing is a **coarse filter**, and the rerank inside the bucket uses the same cosine as today. Best case, quality is unchanged. Worst case, a mis-sized bucket drops a relevant passage before rerank — a 0.5-2% NDCG@10 regression. This is **not a path to beat the 72.30% Wave 2 ceiling** or to close the gap with bge-base at 74%. The encoder swap in the currently-running Phase 22 is a much bigger lever for quality.

**Retrieval consistency across rooms: big win.** This is the under-discussed axis. Today `searchByRoom` over-fetches 10× from a global KNN and filters — meaning if a room has <10% of its candidates in the global top-50, you silently get worse results. With cell-prefix rooms, `searchByRoom` is *isomorphic to* a smaller global search, with no overfetch gap. Tail rooms (small indexed codebases, niche feeds) should see a **measurable consistency improvement** — less "why is the mathematica room returning gaming results" variance. This is hard to benchmark on BEIR (single-topic) but trivial to measure on CQADupStack. **Recommend running the cell-prefix version against the Wave 4 flat-vs-oracle gate test — I predict it closes the +0.34 oracle gap without needing a learned router.**

**Honest summary.** S2 indexing is not a quality play. It's an **architecture simplification + latency + federation play**. If the goal is "beat bge-base on BEIR," do Phase 22 (encoder swap). If the goal is "make folklore's index scale from 5k to 5M nodes without rewriting vec0," this is the path.

---

## 7. Implementation plan — 1-2 day spike

### Spike goal

Prove the cell-index approach works on the current vectors.db. Acceptance: `searchGlobal(k=10)` latency ≤ current Wave 2, `findTunnels` ≥10× faster, `searchByRoom` zero-overfetch, all 243 existing tests pass against the new adapter.

### Files to change

| File | Change | Lines |
|---|---|---|
| `src/domain/cell.ts` | **New.** Hilbert encoder for 16-d reduced space, cell-ID bitpacking, room-prefix helpers. Pure functions, Result-wrapped. | ~180 |
| `src/domain/vectors.ts` | Add `findTunnelsByCell(db, threshold)` alongside existing `findTunnels` for A/B comparison. | +40 |
| `src/infrastructure/cell-index.ts` | **New.** Alternative `VectorIndex` adapter backed by `vec_nodes` table with `cell_id` integer column, no vec0. Same port interface. | ~220 |
| `src/infrastructure/vector-index.ts` | Unchanged in spike — run both adapters side by side behind a config flag `indexKind: 'vec0' | 'cell'`. | — |
| `scripts/fit-rotation.mjs` | **New.** Fit a 768→16 PCA/ITQ rotation on a bootstrap corpus, write to `~/.folklore/rotation.bin`. | ~100 |
| `scripts/bench-cell-index.mjs` | **New.** Run SciFact + CQADupStack against both adapters, print latency / NDCG delta / tunnel count. | ~150 |
| `tests/cell-index.test.ts` | **New.** Port hex tests + adapter contract tests copied from `vector-index.test.ts`, run against cell adapter. | ~250 |

### Package choice

Three options, in my recommendation order:

1. **Write it ourselves (~150 LOC).** A 16-d Hilbert encoder is a classical Butz algorithm, ~80 lines of bit-manipulation TS. This is the right call because: (a) no external dep, (b) pure function, fits the functional-DDD style, (c) the existing [JSpaceFillingCurve Java reference](https://github.com/hairbeRt/JSpaceFillingCurve) translates line-for-line, (d) we control the bit layout for room-prefixing.
2. **[`@mapbox/hilbert-curve`](https://www.npmjs.com/package/hilbert-curve) or equivalent.** Exists but is 2-D only — not useful for our R^{16} target. Skip.
3. **`s2sphere` / `nodes2ts`.** These are ports of Google's S2 library — they do *spherical* geometry on Earth and won't help us in R^{16}. **Do not use.** They're named-after but not structurally matched to our problem. This is the trap I specifically want to flag: the audit topic is "S2 Geometry" but the *Google S2 library itself* is the wrong tool. We want the *idea* (integer cells + Hilbert ordering + prefix trees), not the library.

### Day 1

- Hilbert-16 encoder + unit tests against a known reference (Butz 1971 paper has a worked example)
- ITQ rotation fit on bench corpus, persist to disk
- `cell-index.ts` adapter with `upsert` / `searchGlobal` / `all`
- `findTunnelsByCell` implementation

### Day 2

- `searchByRoom` with cell-prefix room encoding
- `scripts/bench-cell-index.mjs` A/B against current adapter on SciFact + CQADupStack
- Decision memo: if latency ≥ current and quality within −1 NDCG@10, open a PR to make cell-index the default behind a v2.2 flag. If quality regresses ≥2 points, document the failure mode in this audit and keep vec0 as default.

### Gate criteria

This is a spike, not a commitment. Kill criteria:
- Quality regression > 2 NDCG@10 on SciFact vs Wave 2 baseline → abort, keep vec0
- findTunnels speedup < 5× → abort, math-agent's Voronoi proposal wins
- Hilbert encoder bugs or locality failures on synthetic tests → abort, the 768→16 projection is too lossy for this corpus

---

## 8. Takeaways

1. **S2/Hilbert does not directly apply to R^{768}, but the *idea* — integer cell IDs + B-tree range scans + prefix-addressed rooms — cleanly replaces `vec0` and gives rooms a first-class structural meaning instead of being metadata overlays.**
2. **The real win is architectural simplification and room/federation semantics, not BEIR quality.** Latency improves at scale; findTunnels gets ~26× on current corpus, ~300× at 100k; room searches become true B-tree seeks with zero overfetch. Quality is neutral-to-slightly-negative — Phase 22 encoder swap remains the correct lever for beating Wave 2's 72.30% NDCG@10 ceiling.
3. **Run the 1-2 day spike with the ITQ-rotation + 16-d Hilbert + side-by-side adapter.** Gate on SciFact quality regression ≤ 2 points and findTunnels speedup ≥ 5×. If it passes, ship behind a config flag in v2.2. If it fails, this audit is the receipt — document the failure mode and defer to vec0 until sqlite-vec matures.

---

**References**

- [Efficient Neighbor-Finding on Space-Filling Curves (Stuttgart 2017)](https://arxiv.org/pdf/1710.06384)
- [SK-LSH: an efficient index structure for approximate nearest neighbor search (VLDB)](https://dl.acm.org/doi/abs/10.14778/2732939.2732947)
- [Querying multi-dimensional data indexed using the Hilbert space-filling curve (SIGMOD Record)](https://dl.acm.org/doi/10.1145/373626.373678)
- [S2Vec: Self-Supervised Geospatial Embeddings (ArXiv 2025)](https://arxiv.org/html/2504.16942v1) — note: uses S2 cells as *input tokens*, not as the vector index
- [google/s2geometry](https://github.com/google/s2geometry) — the reference S2 library (spherical Earth, not applicable here)
- [Google's S2, geometry on the sphere, cells and Hilbert curve (Christian Perone)](https://blog.christianperone.com/2015/08/googles-s2-geometry-on-the-sphere-cells-and-hilbert-curve/)
- [SPANN: Highly-efficient Billion-scale ANN (NeurIPS 2021)](https://www.microsoft.com/en-us/research/wp-content/uploads/2021/11/SPANN_finalversion1.pdf) — hierarchical-cluster-then-scan philosophy that matches the S2-inspired approach
- [Hilbert-curve assisted structure embedding method (PMC 2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11285582/)
- [A Fast kNN Algorithm Using Multiple Space-Filling Curves (PMC)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9223091/)
- [Pinecone serverless architecture (namespaces as hard partitions)](https://www.pinecone.io/blog/serverless-architecture/)
