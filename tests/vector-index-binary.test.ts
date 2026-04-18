/**
 * Integration tests for Phase 3b — binary-quantized storage + search
 * wired into src/infrastructure/vector-index.ts.
 *
 * Covers:
 *   - binaryDim default is null → searchHybridBinary returns []
 *     (graceful degradation, no binary rows)
 *   - binaryDim=128 on a fresh DB → upsert writes raw_bin, searchHybridBinary
 *     returns top-k ordered by Hamming
 *   - fp32 path is unaffected when binary mode is enabled (searchHybrid
 *     still ranks by L2 the same way)
 *   - migration: opening an existing DB with binary mode flips it on;
 *     pre-existing rows have NULL raw_bin and are skipped
 *   - searchByRoomHybridBinary respects the room filter
 *   - storage: raw_bin is exactly ceil(binaryDim/8) bytes
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openSqliteVectorIndex } from '../src/infrastructure/vector-index.ts';
import type { VectorRecord } from '../src/domain/vectors.ts';
import { normalize } from '../src/domain/vectors.ts';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'wi-bq-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const mkVec = (dim: number, seed: number): Float32Array => {
  const v = new Float32Array(dim);
  // Simple seeded PRNG — mulberry32
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

const mkRecord = (id: string, room: string, dim: number, seed: number, text: string): VectorRecord => ({
  node_id: id,
  room,
  vector: mkVec(dim, seed),
  raw_text: text,
});

describe('vector-index — binary mode off (default)', () => {
  it('binaryDim exposes null when option unset', async () => {
    const r = await openSqliteVectorIndex({ path: join(dir, 'vec.db'), dim: 128 });
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    const idx = r.value;
    try {
      assert.equal(idx.binaryDim, null);
    } finally {
      idx.close();
    }
  });

  it('searchHybridBinary returns empty when binary mode is off', async () => {
    const r = await openSqliteVectorIndex({ path: join(dir, 'vec.db'), dim: 128 });
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    const idx = r.value;
    try {
      // Upsert some rows (no binary column will be populated)
      await idx.upsert(mkRecord('a', 'r1', 128, 1, 'alpha'));
      await idx.upsert(mkRecord('b', 'r1', 128, 2, 'beta'));
      const res = await idx.searchHybridBinary('alpha', mkVec(128, 1), 5);
      assert.ok(res.isOk());
      if (res.isOk()) assert.equal(res.value.length, 0);
    } finally {
      idx.close();
    }
  });
});

describe('vector-index — binary mode enabled', () => {
  it('upsert writes raw_bin at ceil(binaryDim/8) bytes', async () => {
    const Better = (await import('better-sqlite3')).default;
    const dbPath = join(dir, 'vec.db');
    const r = await openSqliteVectorIndex({ path: dbPath, dim: 128, binaryDim: 128 });
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    const idx = r.value;
    try {
      assert.equal(idx.binaryDim, 128);
      await idx.upsert(mkRecord('a', 'r1', 128, 42, 'alpha'));

      // Inspect raw_bin directly
      const db = new Better(dbPath, { readonly: true });
      const row = db.prepare('SELECT raw_bin FROM vec_meta WHERE node_id = ?').get('a') as { raw_bin: Buffer };
      assert.ok(row.raw_bin);
      assert.equal(row.raw_bin.length, 16, 'binary-128 = 16 bytes');
      db.close();
    } finally {
      idx.close();
    }
  });

  it('searchHybridBinary returns top-k ordered by Hamming (closest self-match first)', async () => {
    const r = await openSqliteVectorIndex({ path: join(dir, 'vec.db'), dim: 128, binaryDim: 128 });
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    const idx = r.value;
    try {
      // Use distinctive per-row text so BM25 doesn't confound the
      // dense-arm signal via RRF — we want to measure Hamming ranking.
      const words = ['alpha','bravo','charlie','delta','echo','foxtrot','golf','hotel','india','juliet','kilo','lima','mike','november','oscar','papa','quebec','romeo','sierra','tango'];
      for (let i = 0; i < 20; i++) {
        await idx.upsert(mkRecord(`n${i}`, 'r1', 128, 100 + i, `${words[i]} body text`));
      }
      // Query with the same seed as 'n7' (foxtrot+1=golf → n6/foxtrot was seed 106,
      // so 107 → n7/hotel) — 'n7' should be top by Hamming (self-match).
      const queryVec = mkVec(128, 107);
      const res = await idx.searchHybridBinary('hotel', queryVec, 5);
      assert.ok(res.isOk());
      if (!res.isOk()) return;
      assert.ok(res.value.length > 0);
      assert.equal(res.value[0].node_id, 'n7', 'self-match should be top-1');
    } finally {
      idx.close();
    }
  });

  it('searchByRoomHybridBinary respects the room filter', async () => {
    const r = await openSqliteVectorIndex({ path: join(dir, 'vec.db'), dim: 128, binaryDim: 128 });
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    const idx = r.value;
    try {
      await idx.upsert(mkRecord('a', 'r1', 128, 1, 'alpha one'));
      await idx.upsert(mkRecord('b', 'r2', 128, 2, 'beta two'));
      await idx.upsert(mkRecord('c', 'r1', 128, 3, 'alpha three'));

      const res = await idx.searchByRoomHybridBinary('r1', 'alpha', mkVec(128, 1), 5);
      assert.ok(res.isOk());
      if (!res.isOk()) return;
      for (const m of res.value) assert.equal(m.room, 'r1');
    } finally {
      idx.close();
    }
  });

  it('fp32 searchHybrid path is unaffected when binary mode is enabled', async () => {
    const r = await openSqliteVectorIndex({ path: join(dir, 'vec.db'), dim: 128, binaryDim: 128 });
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    const idx = r.value;
    try {
      for (let i = 0; i < 10; i++) {
        await idx.upsert(mkRecord(`n${i}`, 'r1', 128, 10 + i, `doc ${i}`));
      }
      const query = mkVec(128, 13); // same seed as n3
      const res = await idx.searchHybrid('doc 3', query, 5);
      assert.ok(res.isOk());
      if (!res.isOk()) return;
      // RRF hybrid fuses dense + BM25; BM25 on the generic "doc 3" token
      // matches every "doc N" row so strict top-1 isn't guaranteed. What
      // we're asserting is: the fp32 dense arm still finds the self-match
      // well enough for it to appear in the top-k — i.e. binary mode
      // doesn't corrupt the fp32 path.
      const ids = res.value.map((m) => m.node_id);
      assert.ok(ids.includes('n3'), `n3 (self-match) should be in top-5, got ${ids.join(',')}`);
    } finally {
      idx.close();
    }
  });
});

describe('vector-index — binary migration on existing DB', () => {
  it('opening with binaryDim adds the column; pre-existing rows remain NULL', async () => {
    const dbPath = join(dir, 'vec.db');

    // First: open without binary, insert some rows
    {
      const r = await openSqliteVectorIndex({ path: dbPath, dim: 128 });
      assert.ok(r.isOk());
      if (!r.isOk()) return;
      const idx = r.value;
      for (let i = 0; i < 5; i++) {
        await idx.upsert(mkRecord(`old${i}`, 'r1', 128, 200 + i, `old doc ${i}`));
      }
      idx.close();
    }

    // Second: open WITH binary mode. Pre-existing rows stay NULL.
    const r2 = await openSqliteVectorIndex({ path: dbPath, dim: 128, binaryDim: 128 });
    assert.ok(r2.isOk());
    if (!r2.isOk()) return;
    const idx2 = r2.value;
    try {
      assert.equal(idx2.binaryDim, 128);

      // New insert should now write raw_bin. Use a text that does NOT
      // overlap with the old rows so BM25 doesn't rescue them — this
      // isolates the behavior of the binary-dense arm.
      await idx2.upsert(mkRecord('new1', 'r1', 128, 300, 'cryptographic zetavault singularity'));

      // Query uses the distinctive new-row tokens — BM25 returns only
      // new1; the binary-dense arm also returns only new1 (since old
      // rows have NULL raw_bin and are skipped). Old rows never appear.
      const res = await idx2.searchHybridBinary('cryptographic zetavault', mkVec(128, 300), 5);
      assert.ok(res.isOk());
      if (!res.isOk()) return;
      const ids = res.value.map((m) => m.node_id);
      assert.ok(ids.includes('new1'), 'new binary-indexed row must appear');
      for (const id of ids) {
        assert.ok(!id.startsWith('old'), `old rows (NULL raw_bin, non-matching text) should not appear — got ${id}`);
      }
    } finally {
      idx2.close();
    }
  });
});

describe('vector-index — binary mode rejects invalid dim', () => {
  it('binaryDim outside {128, 256, 384, 512} falls back to null (mode off)', async () => {
    const r = await openSqliteVectorIndex({ path: join(dir, 'vec.db'), dim: 128, binaryDim: 99 });
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    try {
      assert.equal(r.value.binaryDim, null, 'invalid binaryDim coerces to null');
    } finally {
      r.value.close();
    }
  });
});
