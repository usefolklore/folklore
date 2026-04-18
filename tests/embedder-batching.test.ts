/**
 * Tests for the batchingEmbedder decorator — Phase 2 of the v4 plan.
 *
 * Covers:
 *   - individual .embed() calls get coalesced into a batch
 *   - batch flushes when maxBatch hits
 *   - batch flushes after flushAfterMs when partial
 *   - direct .embedBatch() bypasses the queue
 *   - each caller receives the vector corresponding to ITS text
 *   - inner failure propagates to all pending resolvers
 *   - vector-count mismatch (inner bug) returns an error to all
 *   - dim is inherited from the wrapped embedder
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { okAsync, errAsync } from 'neverthrow';
import { batchingEmbedder, type Embedder } from '../src/infrastructure/embedders.ts';
import { EmbeddingError } from '../src/domain/errors.ts';
import type { Vector } from '../src/domain/vectors.ts';

// ─────────────── mock embedder ───────────────

interface MockStats {
  embedCalls: number;
  embedBatchCalls: number;
  embedBatchSizes: number[];
}

const mockEmbedder = (dim: number): { embedder: Embedder; stats: MockStats } => {
  const stats: MockStats = { embedCalls: 0, embedBatchCalls: 0, embedBatchSizes: [] };
  return {
    stats,
    embedder: {
      dim,
      embed: (text: string) => {
        stats.embedCalls++;
        const v = new Float32Array(dim);
        v[0] = text.length; // deterministic token — lets us verify per-caller mapping
        return okAsync(v);
      },
      embedBatch: (texts: readonly string[]) => {
        stats.embedBatchCalls++;
        stats.embedBatchSizes.push(texts.length);
        const out: Vector[] = texts.map((t) => {
          const v = new Float32Array(dim);
          v[0] = t.length;
          return v;
        });
        return okAsync(out);
      },
    },
  };
};

// ─────────────── tests ───────────────

describe('batchingEmbedder — size-triggered flush', () => {
  it('flushes when maxBatch reached', async () => {
    const { embedder, stats } = mockEmbedder(4);
    const batched = batchingEmbedder(embedder, { maxBatch: 3, flushAfterMs: 10_000 });

    // Fire 3 embed() calls in parallel — queue should fill and flush immediately
    const [a, b, c] = await Promise.all([
      batched.embed('aa'),
      batched.embed('bbb'),
      batched.embed('cccc'),
    ]);
    assert.ok(a.isOk() && b.isOk() && c.isOk());
    if (!a.isOk() || !b.isOk() || !c.isOk()) return;
    assert.equal(a.value[0], 2); // 'aa'.length
    assert.equal(b.value[0], 3);
    assert.equal(c.value[0], 4);
    assert.equal(stats.embedBatchCalls, 1);
    assert.equal(stats.embedBatchSizes[0], 3);
  });
});

describe('batchingEmbedder — time-triggered flush', () => {
  it('flushes after flushAfterMs when partial', async () => {
    const { embedder, stats } = mockEmbedder(2);
    const batched = batchingEmbedder(embedder, { maxBatch: 100, flushAfterMs: 15 });

    // Fire 2 calls — queue is partial (< maxBatch). Timer should flush ~15ms later.
    const t0 = Date.now();
    const [a, b] = await Promise.all([
      batched.embed('hello'),
      batched.embed('world'),
    ]);
    const elapsed = Date.now() - t0;
    assert.ok(a.isOk() && b.isOk());
    if (!a.isOk() || !b.isOk()) return;
    assert.equal(a.value[0], 5);
    assert.equal(b.value[0], 5);
    assert.equal(stats.embedBatchCalls, 1);
    assert.equal(stats.embedBatchSizes[0], 2);
    assert.ok(elapsed >= 10, `elapsed should be >= 10ms, got ${elapsed}`);
  });
});

describe('batchingEmbedder — multi-wave', () => {
  it('coalesces many parallel calls into few batches', async () => {
    const { embedder, stats } = mockEmbedder(2);
    const batched = batchingEmbedder(embedder, { maxBatch: 5, flushAfterMs: 50 });

    // Fire 12 calls concurrently — they all enter the queue synchronously.
    // The maxBatch=5 size trigger kicks off the first flush; items that
    // arrived before the flush started get drained in that one batch.
    // Remaining items queue up and flush in a follow-on round. Total
    // batch count is small (typically 1-2 depending on microtask timing).
    const promises = Array.from({ length: 12 }, (_, i) => batched.embed(`t${i}`));
    const results = await Promise.all(promises);
    for (const r of results) assert.ok(r.isOk());
    // Coalescing is doing its job when there are far fewer batches than
    // individual calls. Upper bound: the queue could have drained in a
    // single pass; lower bound is 1. Anything ≤ 3 beats naive serialization.
    assert.ok(stats.embedBatchCalls >= 1 && stats.embedBatchCalls <= 3,
      `expected 1-3 batches, got ${stats.embedBatchCalls}`);
  });
});

describe('batchingEmbedder — direct embedBatch bypasses queue', () => {
  it('inner embedBatch is called directly, no queueing', async () => {
    const { embedder, stats } = mockEmbedder(2);
    const batched = batchingEmbedder(embedder, { maxBatch: 32, flushAfterMs: 20 });

    const r = await batched.embedBatch(['x', 'y', 'z']);
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    assert.equal(r.value.length, 3);
    assert.equal(stats.embedBatchCalls, 1);
    assert.equal(stats.embedBatchSizes[0], 3);
    assert.equal(stats.embedCalls, 0);
  });
});

describe('batchingEmbedder — failure propagation', () => {
  it('inner batch failure fails all pending resolvers', async () => {
    const stats = { batchCount: 0 };
    const failing: Embedder = {
      dim: 4,
      embed: () => okAsync(new Float32Array(4)),
      embedBatch: () => {
        stats.batchCount++;
        return errAsync<readonly Vector[], EmbeddingError>(EmbeddingError.inference('fake fail'));
      },
    };
    const batched = batchingEmbedder(failing, { maxBatch: 3, flushAfterMs: 5 });
    const [a, b, c] = await Promise.all([
      batched.embed('1'),
      batched.embed('2'),
      batched.embed('3'),
    ]);
    assert.ok(a.isErr() && b.isErr() && c.isErr());
    // One batch attempt for all three
    assert.equal(stats.batchCount, 1);
  });

  it('inner returns wrong count → all get error', async () => {
    const miscountingInner: Embedder = {
      dim: 4,
      embed: () => okAsync(new Float32Array(4)),
      embedBatch: (texts) => {
        // Deliberately return fewer vectors than inputs
        const out: Vector[] = texts.slice(0, 1).map(() => new Float32Array(4));
        return okAsync(out);
      },
    };
    const batched = batchingEmbedder(miscountingInner, { maxBatch: 3, flushAfterMs: 5 });
    const [a, b] = await Promise.all([batched.embed('x'), batched.embed('y')]);
    assert.ok(a.isErr() && b.isErr());
  });
});

describe('batchingEmbedder — misc invariants', () => {
  it('dim is inherited from inner', () => {
    const { embedder } = mockEmbedder(768);
    const batched = batchingEmbedder(embedder);
    assert.equal(batched.dim, 768);
  });

  it('single embed() flushes on the timer', async () => {
    const { embedder, stats } = mockEmbedder(2);
    const batched = batchingEmbedder(embedder, { maxBatch: 100, flushAfterMs: 10 });
    const r = await batched.embed('solo');
    assert.ok(r.isOk());
    assert.equal(stats.embedBatchCalls, 1);
    assert.equal(stats.embedBatchSizes[0], 1);
  });
});
