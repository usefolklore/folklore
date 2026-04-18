/**
 * Tests for src/domain/consolidated-memory.ts — the pure domain of the
 * Phase 4 consolidation primitive. Covers:
 *   - findClusters: deterministic output under shuffled input
 *   - seed + ≥min_size neighborhood → one cluster
 *   - <min_size neighborhood → no cluster emitted, entries left raw
 *   - max_size clamp keeps the closest neighbors
 *   - rejects multi-room input (caller must partition)
 *   - rejects mixed-dim vectors
 *   - buildConsolidatedMemory: provenance_ids are sorted deterministic
 *   - computeCentroid: unit-norm output on unit-norm input
 *   - partitionByRoom: round-trip equivalence
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  findClusters,
  buildConsolidatedMemory,
  computeCentroid,
  partitionByRoom,
  type EpisodicEntry,
} from '../src/domain/consolidated-memory.ts';
import { normalize } from '../src/domain/vectors.ts';

const unit = (dim: number, seed: number): Float32Array => {
  const v = new Float32Array(dim);
  let s = seed >>> 0;
  for (let i = 0; i < dim; i++) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    v[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
  }
  return normalize(v);
};

// A vector that's `frac` along the seed axis toward a random direction
// — lets us manufacture known cosine similarities for clustering tests.
const nearby = (seed: Float32Array, angle: number, noiseSeed: number): Float32Array => {
  const noise = unit(seed.length, noiseSeed);
  const v = new Float32Array(seed.length);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  for (let i = 0; i < seed.length; i++) v[i] = seed[i] * cosA + noise[i] * sinA;
  return normalize(v);
};

const mkEntry = (
  id: string,
  room: string,
  vector: Float32Array,
  ts: string,
): EpisodicEntry => ({ node_id: id, room, vector, raw_text: `${id} body`, timestamp: ts });

// ─────────────── findClusters ───────────────

describe('findClusters — basic clustering', () => {
  it('returns empty on empty input', () => {
    const r = findClusters([]);
    assert.ok(r.isOk());
    if (r.isOk()) assert.equal(r.value.length, 0);
  });

  it('emits one cluster when seed + neighborhood ≥ min_size', () => {
    // Seed + 5 close neighbors (angle=0.1 rad → cos ~0.995), 2 far outliers
    const seed = unit(64, 7);
    const entries: EpisodicEntry[] = [
      mkEntry('seed', 'r1', seed, '2026-04-01T00:00:00Z'),
      mkEntry('n1', 'r1', nearby(seed, 0.15, 1), '2026-04-01T00:01:00Z'),
      mkEntry('n2', 'r1', nearby(seed, 0.20, 2), '2026-04-01T00:02:00Z'),
      mkEntry('n3', 'r1', nearby(seed, 0.25, 3), '2026-04-01T00:03:00Z'),
      mkEntry('n4', 'r1', nearby(seed, 0.30, 4), '2026-04-01T00:04:00Z'),
      mkEntry('far1', 'r1', unit(64, 99), '2026-04-01T00:05:00Z'),
      mkEntry('far2', 'r1', unit(64, 100), '2026-04-01T00:06:00Z'),
    ];
    const r = findClusters(entries, { similarity_threshold: 0.9, min_size: 5 });
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    assert.equal(r.value.length, 1, 'one cluster expected');
    const c = r.value[0];
    assert.equal(c.seed_node_id, 'seed');
    assert.equal(c.entries.length, 5);
    assert.equal(c.room, 'r1');
    assert.equal(c.centroid.length, 64);
  });

  it('drops neighborhoods below min_size', () => {
    const seed = unit(32, 11);
    const entries: EpisodicEntry[] = [
      mkEntry('seed', 'r1', seed, '2026-04-01T00:00:00Z'),
      mkEntry('n1', 'r1', nearby(seed, 0.1, 1), '2026-04-01T00:01:00Z'),
      // only 2 total → below default min_size=5
      mkEntry('far', 'r1', unit(32, 99), '2026-04-01T00:02:00Z'),
    ];
    const r = findClusters(entries);
    assert.ok(r.isOk());
    if (r.isOk()) assert.equal(r.value.length, 0);
  });

  it('max_size clamp keeps the closest neighbors', () => {
    const seed = unit(32, 13);
    const entries: EpisodicEntry[] = [
      mkEntry('seed', 'r1', seed, '2026-04-01T00:00:00Z'),
    ];
    // 10 neighbors at increasing angles (closer to farther)
    for (let i = 1; i <= 10; i++) {
      entries.push(mkEntry(`n${i}`, 'r1', nearby(seed, 0.05 + i * 0.02, 100 + i), `2026-04-01T00:0${i}:00Z`));
    }
    const r = findClusters(entries, { similarity_threshold: 0.9, min_size: 3, max_size: 5 });
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    // The seed-rooted cluster MUST be clamped at max_size. Leftover
    // close-neighbors may themselves form a follow-on cluster from a
    // different seed — that's expected greedy behavior.
    assert.ok(r.value.length >= 1, 'at least one cluster expected');
    const first = r.value[0];
    assert.equal(first.seed_node_id, 'seed', 'first cluster seed is the earliest entry');
    assert.equal(first.entries.length, 5, 'first cluster clamped to max_size');
    // The first cluster must contain the seed + the 4 closest neighbors (n1..n4)
    const ids = first.entries.map((e) => e.node_id).sort();
    assert.deepEqual(ids, ['n1', 'n2', 'n3', 'n4', 'seed']);
  });

  it('deterministic: shuffled inputs produce identical cluster membership', () => {
    const seed = unit(16, 17);
    const mk = (): EpisodicEntry[] => [
      mkEntry('seed', 'r1', seed, '2026-04-01T00:00:00Z'),
      mkEntry('a', 'r1', nearby(seed, 0.1, 21), '2026-04-01T00:01:00Z'),
      mkEntry('b', 'r1', nearby(seed, 0.15, 22), '2026-04-01T00:02:00Z'),
      mkEntry('c', 'r1', nearby(seed, 0.2, 23), '2026-04-01T00:03:00Z'),
      mkEntry('d', 'r1', nearby(seed, 0.25, 24), '2026-04-01T00:04:00Z'),
    ];
    const orig = mk();
    const shuffled = [...mk()].reverse();

    const a = findClusters(orig, { similarity_threshold: 0.9, min_size: 5 });
    const b = findClusters(shuffled, { similarity_threshold: 0.9, min_size: 5 });
    assert.ok(a.isOk() && b.isOk());
    if (!a.isOk() || !b.isOk()) return;
    const idsA = a.value[0]?.entries.map((e) => e.node_id).sort();
    const idsB = b.value[0]?.entries.map((e) => e.node_id).sort();
    assert.deepEqual(idsA, idsB);
  });
});

describe('findClusters — input validation', () => {
  it('rejects multi-room input', () => {
    const seed = unit(16, 1);
    const entries: EpisodicEntry[] = [
      mkEntry('a', 'r1', seed, '2026-04-01T00:00:00Z'),
      mkEntry('b', 'r2', seed, '2026-04-01T00:01:00Z'),
    ];
    assert.ok(findClusters(entries).isErr());
  });

  it('rejects mixed-dim vectors', () => {
    const entries: EpisodicEntry[] = [
      mkEntry('a', 'r1', unit(16, 1), '2026-04-01T00:00:00Z'),
      mkEntry('b', 'r1', unit(32, 2), '2026-04-01T00:01:00Z'),
    ];
    assert.ok(findClusters(entries).isErr());
  });

  it('rejects invalid similarity_threshold', () => {
    const e: EpisodicEntry[] = [mkEntry('a', 'r1', unit(16, 1), '2026-04-01T00:00:00Z')];
    assert.ok(findClusters(e, { similarity_threshold: -0.1 }).isErr());
    assert.ok(findClusters(e, { similarity_threshold: 1.5 }).isErr());
  });

  it('rejects min_size < 2', () => {
    const e: EpisodicEntry[] = [mkEntry('a', 'r1', unit(16, 1), '2026-04-01T00:00:00Z')];
    assert.ok(findClusters(e, { min_size: 1 }).isErr());
  });

  it('rejects max_size < min_size', () => {
    const e: EpisodicEntry[] = [mkEntry('a', 'r1', unit(16, 1), '2026-04-01T00:00:00Z')];
    assert.ok(findClusters(e, { min_size: 10, max_size: 5 }).isErr());
  });
});

// ─────────────── buildConsolidatedMemory ───────────────

describe('buildConsolidatedMemory', () => {
  it('returns a well-formed record with sorted provenance', () => {
    const cluster = {
      seed_node_id: 'z-seed',
      entries: [
        mkEntry('z-seed', 'r1', unit(16, 1), '2026-04-01T00:00:00Z'),
        mkEntry('a', 'r1', unit(16, 2), '2026-04-01T00:01:00Z'),
        mkEntry('b', 'r1', unit(16, 3), '2026-04-01T00:02:00Z'),
      ],
      centroid: unit(16, 1),
      room: 'r1' as const,
    };
    const r = buildConsolidatedMemory(cluster, 'the summary', {
      makeId: () => 'consolidated:abc123',
      clock: () => '2026-04-17T00:00:00.000Z',
      llm_model: 'qwen2.5:1.5b',
    });
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    assert.equal(r.value.id, 'consolidated:abc123');
    assert.deepEqual([...r.value.provenance_ids], ['a', 'b', 'z-seed']); // sorted
    assert.equal(r.value.summary, 'the summary');
    assert.equal(r.value.consolidated_at, '2026-04-17T00:00:00.000Z');
    assert.equal(r.value.llm_model, 'qwen2.5:1.5b');
  });

  it('trims whitespace from summary', () => {
    const cluster = {
      seed_node_id: 's', entries: [mkEntry('s', 'r1', unit(16, 1), '2026-04-01T00:00:00Z')],
      centroid: unit(16, 1), room: 'r1' as const,
    };
    const r = buildConsolidatedMemory(cluster, '  padded  ', {
      makeId: () => 'x', llm_model: 'm',
    });
    assert.ok(r.isOk());
    if (r.isOk()) assert.equal(r.value.summary, 'padded');
  });

  it('rejects empty summary', () => {
    const cluster = {
      seed_node_id: 's', entries: [mkEntry('s', 'r1', unit(16, 1), '2026-04-01T00:00:00Z')],
      centroid: unit(16, 1), room: 'r1' as const,
    };
    assert.ok(buildConsolidatedMemory(cluster, '   ', {
      makeId: () => 'x', llm_model: 'm',
    }).isErr());
  });
});

// ─────────────── computeCentroid ───────────────

describe('computeCentroid', () => {
  it('returns a unit-norm vector on unit-norm inputs', () => {
    const vecs = [unit(32, 1), unit(32, 2), unit(32, 3), unit(32, 4)];
    const c = computeCentroid(vecs);
    assert.equal(c.length, 32);
    let sumsq = 0;
    for (let i = 0; i < c.length; i++) sumsq += c[i] * c[i];
    assert.ok(Math.abs(sumsq - 1) < 1e-5);
  });

  it('returns empty on empty input', () => {
    const c = computeCentroid([]);
    assert.equal(c.length, 0);
  });
});

// ─────────────── partitionByRoom ───────────────

describe('partitionByRoom', () => {
  it('round-trip preserves entries', () => {
    const entries: EpisodicEntry[] = [
      mkEntry('a', 'r1', unit(8, 1), '2026-04-01T00:00:00Z'),
      mkEntry('b', 'r2', unit(8, 2), '2026-04-01T00:01:00Z'),
      mkEntry('c', 'r1', unit(8, 3), '2026-04-01T00:02:00Z'),
      mkEntry('d', 'r3', unit(8, 4), '2026-04-01T00:03:00Z'),
    ];
    const part = partitionByRoom(entries);
    assert.equal(part.size, 3);
    assert.equal(part.get('r1')!.length, 2);
    assert.equal(part.get('r2')!.length, 1);
    assert.equal(part.get('r3')!.length, 1);
  });
});
