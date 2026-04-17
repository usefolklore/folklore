/**
 * Tests for src/domain/pagerank.ts — the PPR primitive behind v3.2's
 * graph-based rerank. Covers:
 *   - convergence on a small known-answer graph
 *   - personalization bias (distribution skews toward seed nodes)
 *   - mass conservation (output sums to ~1)
 *   - dangling-node teleport (no mass leak when a node has no out-edges)
 *   - parameter validation
 *   - kNN graph builder: correct degree, symmetry-adjacent structure
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { pagerank, buildKnnGraph, type Edge } from '../src/domain/pagerank.ts';

describe('pagerank — convergence on small graphs', () => {
  it('chain graph 0 → 1 → 2 with uniform personalization rises toward tail', () => {
    // Classic small-graph intuition: sink at node 2 accumulates more mass
    // than the source when alpha is high.
    const edges: Edge[] = [
      { from: 0, to: 1, weight: 1 },
      { from: 1, to: 2, weight: 1 },
    ];
    const p = [1 / 3, 1 / 3, 1 / 3];
    const r = pagerank(3, edges, p, { alpha: 0.85, maxIter: 100, tol: 1e-9 });
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    // Tail node accumulates more than source — classic PageRank behavior
    assert.ok(r.value[2] > r.value[0], `r[2]=${r.value[2].toFixed(4)} not > r[0]=${r.value[0].toFixed(4)}`);
    // Mass conserves within tiny tolerance
    const sum = r.value[0] + r.value[1] + r.value[2];
    assert.ok(Math.abs(sum - 1) < 1e-6, `sum=${sum}`);
  });

  it('personalization seeded at one node biases the output toward it', () => {
    // Symmetric 3-cycle. With uniform personalization, PPR converges to
    // uniform. With personalization concentrated at node 0, node 0
    // should have the highest final score.
    const edges: Edge[] = [
      { from: 0, to: 1, weight: 1 }, { from: 1, to: 2, weight: 1 }, { from: 2, to: 0, weight: 1 },
    ];
    const uniform = pagerank(3, edges, [1, 1, 1], { alpha: 0.85 });
    const seededAt0 = pagerank(3, edges, [1, 0, 0], { alpha: 0.85 });
    assert.ok(uniform.isOk() && seededAt0.isOk());
    if (!uniform.isOk() || !seededAt0.isOk()) return;

    // Uniform → ~1/3 per node
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(uniform.value[i] - 1 / 3) < 0.01, `uniform[${i}]=${uniform.value[i]}`);
    }
    // Seeded-at-0 → node 0 dominates
    assert.ok(seededAt0.value[0] > seededAt0.value[1]);
    assert.ok(seededAt0.value[0] > seededAt0.value[2]);
  });

  it('handles dangling nodes without mass leak', () => {
    // Node 2 has no out-edges (dangling). Its mass must teleport to p,
    // not evaporate. Total should remain ~1.
    const edges: Edge[] = [
      { from: 0, to: 1, weight: 1 }, { from: 1, to: 2, weight: 1 },
      // node 2 → dangling
    ];
    const r = pagerank(3, edges, [1, 1, 1], { alpha: 0.85, maxIter: 100, tol: 1e-9 });
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    const sum = r.value[0] + r.value[1] + r.value[2];
    assert.ok(Math.abs(sum - 1) < 1e-6, `dangling mass leaked: sum=${sum}`);
  });
});

describe('pagerank — input validation', () => {
  it('rejects n=0 or negative', () => {
    assert.ok(pagerank(0, [], [], {}).isErr());
    assert.ok(pagerank(-1, [], [], {}).isErr());
  });

  it('rejects mismatched personalization length', () => {
    assert.ok(pagerank(3, [], [1, 1], {}).isErr());
    assert.ok(pagerank(3, [], [1, 1, 1, 1], {}).isErr());
  });

  it('rejects all-zero personalization', () => {
    assert.ok(pagerank(3, [], [0, 0, 0], {}).isErr());
  });

  it('rejects negative personalization entries', () => {
    assert.ok(pagerank(3, [], [1, -0.5, 1], {}).isErr());
  });

  it('rejects out-of-range edges', () => {
    assert.ok(pagerank(3, [{ from: 0, to: 5, weight: 1 }], [1, 1, 1], {}).isErr());
  });

  it('rejects alpha outside (0,1)', () => {
    assert.ok(pagerank(3, [], [1, 1, 1], { alpha: 0 }).isErr());
    assert.ok(pagerank(3, [], [1, 1, 1], { alpha: 1 }).isErr());
    assert.ok(pagerank(3, [], [1, 1, 1], { alpha: 1.5 }).isErr());
  });
});

describe('buildKnnGraph', () => {
  it('emits exactly k edges per node', () => {
    // 4 unit vectors in 2D. Top-1 neighbor per node.
    const vecs: Float64Array[] = [
      new Float64Array([1, 0]),
      new Float64Array([0.9, 0.436]),     // close to v0
      new Float64Array([-1, 0]),          // opposite v0
      new Float64Array([-0.9, -0.436]),   // close to v2
    ];
    const r = buildKnnGraph(vecs, 1);
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    assert.equal(r.value.length, 4, `expected 4 edges (1 per node), got ${r.value.length}`);

    // v0's top-1 neighbor should be v1 (highest dot product)
    const fromV0 = r.value.filter((e) => e.from === 0);
    assert.equal(fromV0.length, 1);
    assert.equal(fromV0[0].to, 1);
    // v2's top-1 neighbor should be v3
    const fromV2 = r.value.filter((e) => e.from === 2);
    assert.equal(fromV2[0].to, 3);
  });

  it('rejects k out of range', () => {
    const vecs: Float64Array[] = [new Float64Array([1, 0]), new Float64Array([0, 1])];
    assert.ok(buildKnnGraph(vecs, 0).isErr());
    assert.ok(buildKnnGraph(vecs, 2).isErr()); // k == n — violates k < n constraint
  });

  it('weights are non-negative (negative cosines clamped)', () => {
    const vecs: Float64Array[] = [
      new Float64Array([1, 0]),
      new Float64Array([-1, 0]),  // cosine(v0, v1) = -1
    ];
    const r = buildKnnGraph(vecs, 1);
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    for (const e of r.value) {
      assert.ok(e.weight >= 0, `negative weight: ${e.weight}`);
    }
  });
});
