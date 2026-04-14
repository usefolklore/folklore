/**
 * Phase 29 — CI retrieval regression bar for the Rust-backed pipeline.
 *
 * Per senior data scientist audit: `npm test` must be load-bearing
 * for retrieval quality, not just code correctness. Phase 23 added a
 * threshold gate in `bench-real.test.ts` using the fixture embedder;
 * this test adds a SECOND gate that exercises the REAL Rust
 * end-to-end path: spawn embed_server, run a tiny BEIR-style fixture
 * through the production `searchHybrid` port with the Rust
 * subprocess embedder, assert NDCG@10 >= 0.70.
 *
 * This test is opt-in via `WELLINFORMED_RUST_BIN` env var or a
 * platform-default path, because the Rust binary is not yet bundled
 * with the npm package (Phase 24 ships the adapter, Phase 30 will
 * handle prebuilt distribution). Tests that can't find the binary
 * skip cleanly — they don't fail CI until the binary is available.
 */

import { strict as assert } from 'node:assert';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { openSqliteVectorIndex } from '../src/infrastructure/vector-index.js';
import { rustSubprocessEmbedder } from '../src/infrastructure/embedders.js';
import { spawnRustRetrievalClient } from '../src/infrastructure/rust-retrieval.js';

// ─── tiny SciFact-like fixture ───────────────────────────────────
//
// 10 passages × 5 queries, hand-picked so the top-1 gold is
// consistently findable by a real dense encoder. Each query has
// exactly one relevant passage. Threshold set at NDCG@10 >= 0.70 —
// below published SciFact (~74% bge-base) because fixture is tiny,
// above pure-noise (20% random baseline) by a wide margin.

interface FixtureEntry {
  readonly id: string;
  readonly text: string;
}

interface FixtureQuery {
  readonly id: string;
  readonly text: string;
  readonly gold_doc_id: string;
}

const CORPUS: readonly FixtureEntry[] = [
  { id: 'p1', text: 'Vitamin C supplementation reduces the duration of the common cold in adults.' },
  { id: 'p2', text: 'Long COVID neurological symptoms persist for months after acute infection.' },
  { id: 'p3', text: 'Mediterranean diet lowers cardiovascular disease risk by 30 percent over five years.' },
  { id: 'p4', text: 'Exercise improves insulin sensitivity in patients with type 2 diabetes.' },
  { id: 'p5', text: 'Blue light exposure before bedtime disrupts circadian rhythm and melatonin production.' },
  { id: 'p6', text: 'Omega-3 fatty acids reduce triglyceride levels in patients with hypertriglyceridemia.' },
  { id: 'p7', text: 'Meditation practice decreases cortisol levels and markers of chronic stress.' },
  { id: 'p8', text: 'Antibiotic resistance genes spread through horizontal gene transfer in gut microbiota.' },
  { id: 'p9', text: 'Vaccines against HPV prevent cervical cancer in adolescent females.' },
  { id: 'p10', text: 'Intermittent fasting improves metabolic markers independent of caloric restriction.' },
];

const QUERIES: readonly FixtureQuery[] = [
  { id: 'q1', text: 'Does vitamin C shorten colds?', gold_doc_id: 'p1' },
  { id: 'q2', text: 'How does exercise affect diabetes?', gold_doc_id: 'p4' },
  { id: 'q3', text: 'Effect of screen light on sleep', gold_doc_id: 'p5' },
  { id: 'q4', text: 'Benefits of fish oil on blood lipids', gold_doc_id: 'p6' },
  { id: 'q5', text: 'HPV vaccine cancer prevention', gold_doc_id: 'p9' },
];

// NDCG@10 for single-relevant queries — simplified from the full
// graded formula since every gold has grade 1.
const ndcgAtK = (
  ranked: ReadonlyArray<{ docId: string }>,
  goldId: string,
  k: number,
): number => {
  for (let i = 0; i < Math.min(ranked.length, k); i++) {
    if (ranked[i].docId === goldId) {
      return 1 / Math.log2(i + 2);
    }
  }
  return 0;
};

const repoBinaryPath = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', 'wellinformed-rs', 'target', 'release', 'embed_server');
};

const rustBinaryAvailable = (): string | null => {
  const candidate = process.env.WELLINFORMED_RUST_BIN ?? repoBinaryPath();
  return existsSync(candidate) ? candidate : null;
};

test('phase-29: Rust embedder end-to-end retrieval quality gate on fixture', async (t) => {
  const binary = rustBinaryAvailable();
  if (!binary) {
    t.skip(
      'wellinformed-rs embed_server binary not built — build with `cargo build --release --manifest-path wellinformed-rs/Cargo.toml` or set WELLINFORMED_RUST_BIN',
    );
    return;
  }

  const tmp = mkdtempSync(join(tmpdir(), 'wi-p29-'));
  try {
    const dbPath = join(tmp, 'vectors.db');

    // Use MiniLM (smallest, fastest — sufficient for the gate)
    const embedder = rustSubprocessEmbedder({
      model: 'minilm',
      dim: 384,
      binaryPath: binary,
    });

    const indexRes = await openSqliteVectorIndex({ path: dbPath, dim: 384 });
    assert.ok(indexRes.isOk(), 'vector index must open');
    const index = indexRes.value;

    try {
      // Index the fixture through the production upsert path with raw_text
      for (const doc of CORPUS) {
        const vecRes = await embedder.embed(doc.text);
        assert.ok(vecRes.isOk(), `embed ${doc.id} must succeed`);
        const upsertRes = await index.upsert({
          node_id: doc.id,
          room: 'phase29-fixture',
          vector: vecRes.value,
          raw_text: doc.text,
        });
        assert.ok(upsertRes.isOk(), `upsert ${doc.id} must succeed`);
      }

      // Run each query through searchHybrid (the Phase 23 production
      // port). Check that the gold is retrieved and compute NDCG.
      const perQ: number[] = [];
      for (const q of QUERIES) {
        const vecRes = await embedder.embed(q.text);
        assert.ok(vecRes.isOk(), `query embed ${q.id} must succeed`);
        const sRes = await index.searchHybrid(q.text, vecRes.value, 10);
        assert.ok(sRes.isOk(), `searchHybrid ${q.id} must succeed`);
        const ranked = sRes.value.map((m) => ({ docId: m.node_id }));
        const ndcg = ndcgAtK(ranked, q.gold_doc_id, 10);
        perQ.push(ndcg);
      }

      const meanNdcg = perQ.reduce((a, b) => a + b, 0) / perQ.length;
      console.log(
        `  phase-29 Rust retrieval gate: mean NDCG@10 = ${meanNdcg.toFixed(3)} (threshold 0.70)`,
      );

      assert.ok(
        meanNdcg >= 0.7,
        `Rust retrieval regression: NDCG@10=${meanNdcg.toFixed(3)} < 0.70 threshold`,
      );
    } finally {
      index.close();
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('phase-29: spawnRustRetrievalClient tunnel detection end-to-end', async (t) => {
  const binary = rustBinaryAvailable();
  if (!binary) {
    t.skip('embed_server binary not available');
    return;
  }

  const client = spawnRustRetrievalClient({ binaryPath: binary });
  try {
    const vectors = [
      { node_id: 'a', room: 'r1', vector: new Float32Array([1.0, 0.0, 0.0]) },
      { node_id: 'b', room: 'r2', vector: new Float32Array([0.9, 0.1, 0.0]) },
      { node_id: 'c', room: 'r1', vector: new Float32Array([0.0, 1.0, 0.0]) },
      { node_id: 'd', room: 'r2', vector: new Float32Array([0.0, 0.9, 0.1]) },
    ];

    const tunnelsRes = await client.findTunnels(vectors, 3);
    assert.ok(tunnelsRes.isOk(), 'findTunnels must succeed');
    const tunnels = tunnelsRes.value;
    assert.ok(tunnels.length >= 2, `expected >= 2 tunnels, got ${tunnels.length}`);

    // Every tunnel must be cross-room
    for (const t of tunnels) {
      assert.notStrictEqual(t.room_a, t.room_b, 'tunnels must cross room boundaries');
    }

    // Tunnels must be sorted by ascending distance
    for (let i = 1; i < tunnels.length; i++) {
      assert.ok(
        tunnels[i].distance >= tunnels[i - 1].distance,
        'tunnels must be sorted by ascending distance',
      );
    }

    // Distance on the near pair (a,b) or (c,d) should be ~0.14 (√0.02)
    assert.ok(
      tunnels[0].distance < 0.2,
      `closest tunnel too far: ${tunnels[0].distance.toFixed(4)}`,
    );
  } finally {
    client.close();
  }
});

test('phase-29: spawnRustRetrievalClient centroid computation end-to-end', async (t) => {
  const binary = rustBinaryAvailable();
  if (!binary) {
    t.skip('embed_server binary not available');
    return;
  }

  const client = spawnRustRetrievalClient({ binaryPath: binary });
  try {
    const vectors = [
      { node_id: 'a', room: 'r1', vector: new Float32Array([1.0, 0.0, 0.0]) },
      { node_id: 'b', room: 'r1', vector: new Float32Array([0.0, 1.0, 0.0]) },
      { node_id: 'c', room: 'r2', vector: new Float32Array([0.0, 0.0, 1.0]) },
    ];

    const centroidsRes = await client.computeCentroids(vectors);
    assert.ok(centroidsRes.isOk(), 'computeCentroids must succeed');
    const centroids = centroidsRes.value;
    assert.strictEqual(centroids.length, 2, 'expected 2 rooms');

    const byRoom = new Map(centroids.map((c) => [c.room, c]));
    const r1 = byRoom.get('r1');
    const r2 = byRoom.get('r2');
    assert.ok(r1 && r2, 'both rooms must be present');

    // r1 centroid = unit-normalized mean of [1,0,0] and [0,1,0]
    // = [1/√2, 1/√2, 0] ≈ [0.707, 0.707, 0]
    assert.ok(Math.abs(r1.vector[0] - Math.SQRT1_2) < 1e-3);
    assert.ok(Math.abs(r1.vector[1] - Math.SQRT1_2) < 1e-3);
    assert.strictEqual(r1.doc_count, 2);

    // r2 centroid = the sole vector
    assert.ok(Math.abs(r2.vector[2] - 1.0) < 1e-3);
    assert.strictEqual(r2.doc_count, 1);
  } finally {
    client.close();
  }
});
