/**
 * Tests for application/prune-orphan-vectors.ts — vector-index orphan GC.
 *
 * Builds a real sqlite-vec index via openSqliteVectorIndex (so vec0 +
 * fts5 are wired exactly as production), upserts a mix of records whose
 * node_ids do / don't appear in a "graph" valid-id set, then prunes.
 *
 * Covers:
 *   - dry-run reports orphans but deletes nothing
 *   - real run deletes only orphans; valid rows + their search hits survive
 *   - resolve-rate reaches 1.0 after the prune
 *   - idempotent: a second run finds zero orphans
 *   - empty valid-id set prunes everything; all-valid set prunes nothing
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openSqliteVectorIndex } from '../src/infrastructure/vector-index.ts';
import type { VectorRecord } from '../src/domain/vectors.ts';
import { normalize } from '../src/domain/vectors.ts';
import { pruneOrphanVectors } from '../src/application/prune-orphan-vectors.ts';

const DIM = 64;
let dir: string;
let dbPath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fl-prune-'));
  dbPath = join(dir, 'vectors.db');
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const mkVec = (seed: number): Float32Array => {
  const v = new Float32Array(DIM);
  let s = seed >>> 0;
  for (let i = 0; i < DIM; i++) {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    v[i] = ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5;
  }
  return normalize(v);
};

const mkRecord = (id: string, seed: number, text: string): VectorRecord => ({
  node_id: id,
  room: '',
  vector: mkVec(seed),
  raw_text: text,
});

/** Seed a fresh db with `n` records id'd `node-0..n-1`, close the handle. */
const seedDb = async (n: number): Promise<void> => {
  const r = await openSqliteVectorIndex({ path: dbPath, dim: DIM });
  assert.ok(r.isOk());
  if (!r.isOk()) return;
  const idx = r.value;
  try {
    for (let i = 0; i < n; i++) {
      const res = await idx.upsert(mkRecord(`node-${i}`, i + 1, `document number ${i} about retrieval`));
      assert.ok(res.isOk());
    }
    assert.equal(idx.size(), n);
  } finally {
    idx.close();
  }
};

describe('pruneOrphanVectors', () => {
  it('dry-run reports orphans but deletes nothing', async () => {
    await seedDb(10);
    // valid ids: even nodes only → 5 orphans (the odd ones)
    const validIds = new Set(['node-0', 'node-2', 'node-4', 'node-6', 'node-8']);
    const r = await pruneOrphanVectors({ dbPath, validIds, dim: DIM, dryRun: true });
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    assert.equal(r.value.scanned, 10);
    assert.equal(r.value.orphans, 5);
    assert.equal(r.value.resolved, 5);
    assert.equal(r.value.deleted, 0);
    assert.equal(r.value.dryRun, true);

    // confirm nothing was written
    const re = await openSqliteVectorIndex({ path: dbPath, dim: DIM });
    assert.ok(re.isOk());
    if (re.isOk()) { assert.equal(re.value.size(), 10); re.value.close(); }
  });

  it('deletes only orphans; valid rows survive and remain searchable', async () => {
    await seedDb(10);
    const validIds = new Set(['node-0', 'node-2', 'node-4', 'node-6', 'node-8']);
    const r = await pruneOrphanVectors({ dbPath, validIds, dim: DIM });
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    assert.equal(r.value.deleted, 5);
    assert.equal(r.value.resolveRateAfter, 1);

    const re = await openSqliteVectorIndex({ path: dbPath, dim: DIM });
    assert.ok(re.isOk());
    if (!re.isOk()) return;
    const idx = re.value;
    try {
      assert.equal(idx.size(), 5);
      // every surviving record resolves to a valid id; no orphan leaks
      const all = await idx.all();
      assert.ok(all.isOk());
      if (all.isOk()) {
        for (const rec of all.value) assert.ok(validIds.has(rec.node_id), `leaked orphan ${rec.node_id}`);
        assert.equal(all.value.length, 5);
      }
      // a valid node is still retrievable via hybrid search
      const hits = await idx.searchHybrid('document about retrieval', mkVec(5), 5);
      assert.ok(hits.isOk());
      if (hits.isOk()) {
        assert.ok(hits.value.length > 0);
        for (const h of hits.value) assert.ok(validIds.has(h.node_id));
      }
    } finally {
      idx.close();
    }
  });

  it('is idempotent — a second prune finds zero orphans', async () => {
    await seedDb(6);
    const validIds = new Set(['node-0', 'node-1', 'node-2']);
    const first = await pruneOrphanVectors({ dbPath, validIds, dim: DIM });
    assert.ok(first.isOk());
    if (first.isOk()) assert.equal(first.value.deleted, 3);

    const second = await pruneOrphanVectors({ dbPath, validIds, dim: DIM });
    assert.ok(second.isOk());
    if (second.isOk()) {
      assert.equal(second.value.orphans, 0);
      assert.equal(second.value.deleted, 0);
      assert.equal(second.value.scanned, 3);
    }
  });

  it('empty valid-id set prunes everything; all-valid set prunes nothing', async () => {
    await seedDb(4);
    const none = await pruneOrphanVectors({ dbPath, validIds: new Set(), dim: DIM });
    assert.ok(none.isOk());
    if (none.isOk()) assert.equal(none.value.deleted, 4);

    await seedDb(4); // re-seed (prev db now empty)
    const all = new Set(['node-0', 'node-1', 'node-2', 'node-3']);
    const keep = await pruneOrphanVectors({ dbPath, validIds: all, dim: DIM });
    assert.ok(keep.isOk());
    if (keep.isOk()) {
      assert.equal(keep.value.orphans, 0);
      assert.equal(keep.value.deleted, 0);
    }
  });
});
