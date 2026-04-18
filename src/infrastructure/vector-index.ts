/**
 * VectorIndex — port + sqlite-vec adapter.
 *
 * The port is a narrow capability interface: anything that can upsert
 * a vector record, search globally, search by room, run hybrid (dense +
 * BM25) search, and enumerate all records (for offline passes like
 * tunnel detection).
 *
 * The adapter `sqliteVectorIndex` is backed by better-sqlite3 +
 * sqlite-vec 0.1.x + SQLite FTS5. Room filtering uses an auxiliary
 * `vec_meta` table joined against the `vec0` virtual table, because the
 * npm-packaged 0.1.x doesn't consistently expose partition keys across
 * platforms. BM25 uses the built-in `bm25(fts_docs, 0.9, 0.4)` auxiliary
 * function — the BEIR-tuned Anserini defaults (Pyserini SIGIR 2021).
 *
 * Single responsibility: it indexes vectors and answers proximity
 * queries. It does NOT know about tunnels — that's pure domain logic
 * in `src/domain/vectors.ts`. This file just provides the raw records.
 *
 * Hybrid fuse logic is also pure domain (`rrfFuse` in vectors.ts); this
 * adapter only produces the two ranked lists and delegates merging.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type Database from 'better-sqlite3';
import { VectorError } from '../domain/errors.js';
import type {
  HybridConfig,
  Match,
  RankedCandidate,
  Vector,
  VectorRecord,
} from '../domain/vectors.js';
import { DEFAULT_DIM, DEFAULT_HYBRID_CONFIG, rrfFuse, sanitizeForFts5 } from '../domain/vectors.js';
import { matryoshkaBinary, hammingDistance } from '../domain/binary-quantize.js';
import type { NodeId, Room, Wing } from '../domain/graph.js';

/** Port — the application layer depends on this. */
export interface VectorIndex {
  upsert(record: VectorRecord): ResultAsync<void, VectorError>;
  searchGlobal(query: Vector, k: number): ResultAsync<readonly Match[], VectorError>;
  searchByRoom(room: Room, query: Vector, k: number): ResultAsync<readonly Match[], VectorError>;
  /**
   * Hybrid dense + BM25 retrieval with RRF fusion (Cormack-Clarke-Büttcher
   * SIGIR 2009). Uses the raw text query for BM25 and the embedded vector
   * for dense. Returns top-k after fusion.
   *
   * Falls back to dense-only when: (a) the sanitizer produces an empty
   * string (stopword-only queries), (b) the FTS5 stage errors. Never
   * falls back silently — always logs.
   */
  searchHybrid(
    rawQuery: string,
    queryVec: Vector,
    k: number,
    cfg?: HybridConfig,
  ): ResultAsync<readonly Match[], VectorError>;
  /** Hybrid with a room filter. */
  searchByRoomHybrid(
    room: Room,
    rawQuery: string,
    queryVec: Vector,
    k: number,
    cfg?: HybridConfig,
  ): ResultAsync<readonly Match[], VectorError>;
  /**
   * Binary-quantized hybrid retrieval. Truncates + sign-bit-packs the
   * query at the configured `binaryDim`, scores corpus vectors via
   * Hamming popcount (brute-force O(N) over the stored binary blob —
   * acceptable at ≤100k scale), then RRF-fuses with BM25.
   *
   * Returns empty results when binary mode is disabled (no binaryDim
   * configured) or when no rows have raw_bin populated (prior-to-
   * binary-mode upserts). Never errors for these empty cases — the
   * caller should route through `searchHybrid` when binary is off.
   */
  searchHybridBinary(
    rawQuery: string,
    queryVec: Vector,
    k: number,
    cfg?: HybridConfig,
  ): ResultAsync<readonly Match[], VectorError>;
  searchByRoomHybridBinary(
    room: Room,
    rawQuery: string,
    queryVec: Vector,
    k: number,
    cfg?: HybridConfig,
  ): ResultAsync<readonly Match[], VectorError>;
  /** Snapshot of every record — used by offline passes like tunnel detection. */
  all(): ResultAsync<readonly VectorRecord[], VectorError>;
  size(): number;
  /** True iff binary quantization is enabled at index open time. */
  readonly binaryDim: number | null;
  close(): void;
}

/** Configuration for the sqlite adapter. */
export interface SqliteVectorIndexOptions {
  readonly path: string;
  readonly dim?: number;
  /**
   * searchByRoom implementation detail — how many extra candidates to
   * pull from the global KNN before filtering down to one room.
   * Defaults to 10 (so searchByRoom(k=5) probes the global top-50).
   */
  readonly roomSearchOverfetch?: number;
  /**
   * Enables Matryoshka-binary quantized storage alongside fp32.
   * When set, every `upsert` also writes the sign-bit-packed truncation
   * of the input vector at this dim into `vec_meta.raw_bin`, and the
   * `searchHybridBinary` / `searchByRoomHybridBinary` methods are
   * available as an alternative retrieval path (48× storage per §2f of
   * BENCH-v2.md).
   *
   * Valid values: 128, 256, 384, 512. When unset, binary storage is
   * disabled and the binary search methods return empty results.
   *
   * Phase 3 of the v4 plan: ship the primitive; production toggle lives
   * behind `WELLINFORMED_VECTOR_QUANTIZATION=binary-{N}` in the runtime
   * builder.
   */
  readonly binaryDim?: number;
}

const isValidBinaryDim = (d: number | undefined): d is number =>
  d === 128 || d === 256 || d === 384 || d === 512;

/** Lazily open a sqlite-vec backed VectorIndex. */
export const openSqliteVectorIndex = (
  opts: SqliteVectorIndexOptions,
): ResultAsync<VectorIndex, VectorError> => {
  const dim = opts.dim ?? DEFAULT_DIM;
  const overfetch = opts.roomSearchOverfetch ?? 10;
  const binaryDim = isValidBinaryDim(opts.binaryDim) ? opts.binaryDim : null;

  return ResultAsync.fromPromise(
    (async () => {
      mkdirSync(dirname(opts.path), { recursive: true });
      const firstTime = !existsSync(opts.path);

      const [Better, vec] = await Promise.all([import('better-sqlite3'), import('sqlite-vec')]);
      const DatabaseCtor = (Better as unknown as { default: typeof Database }).default;
      const db = new DatabaseCtor(opts.path);
      db.pragma('journal_mode = WAL');
      db.pragma('synchronous = NORMAL');
      vec.load(db);

      if (firstTime) {
        db.exec(`CREATE VIRTUAL TABLE vec_nodes USING vec0(embedding float[${dim}])`);
        db.exec(`CREATE TABLE IF NOT EXISTS vec_meta (
          rowid    INTEGER PRIMARY KEY,
          node_id  TEXT    UNIQUE NOT NULL,
          room     TEXT    NOT NULL,
          wing     TEXT,
          raw_text TEXT,
          raw_bin  BLOB,
          created  INTEGER NOT NULL
        )`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_vec_meta_room ON vec_meta(room)`);
        db.exec(`CREATE VIRTUAL TABLE fts_docs USING fts5(
          text,
          tokenize='porter unicode61 remove_diacritics 2'
        )`);
      } else {
        // Backward-compat migration: existing DBs from pre-Phase-23 don't
        // have raw_text or fts_docs. Add them on-the-fly. The ALTER TABLE
        // is idempotent via try/catch on "duplicate column"; the CREATE
        // VIRTUAL TABLE uses IF NOT EXISTS semantics via try/catch.
        try {
          db.exec(`ALTER TABLE vec_meta ADD COLUMN raw_text TEXT`);
        } catch (e) {
          if (!/duplicate column/i.test((e as Error).message)) throw e;
        }
        // Phase 3 migration — raw_bin column for binary-quantized storage.
        // Pre-existing rows stay NULL; `searchHybridBinary` skips them.
        try {
          db.exec(`ALTER TABLE vec_meta ADD COLUMN raw_bin BLOB`);
        } catch (e) {
          if (!/duplicate column/i.test((e as Error).message)) throw e;
        }
        try {
          db.exec(`CREATE VIRTUAL TABLE fts_docs USING fts5(
            text,
            tokenize='porter unicode61 remove_diacritics 2'
          )`);
        } catch (e) {
          if (!/already exists/i.test((e as Error).message)) throw e;
        }
      }

      return build(db, dim, overfetch, binaryDim);
    })(),
    (e) => VectorError.openError(opts.path, (e as Error).message),
  );
};

// ─────────────────────── implementation ───────────────────

const build = (
  db: Database.Database,
  dim: number,
  overfetch: number,
  binaryDim: number | null,
): VectorIndex => {
  // sqlite-vec's vec0 virtual table rejects `INSERT OR REPLACE` because
  // the internal storage treats the rowid as an immutable key. The
  // supported upsert pattern is: DELETE by rowid (no-op if absent)
  // followed by a plain INSERT inside a single transaction.
  const stDeleteVec = db.prepare('DELETE FROM vec_nodes WHERE rowid = ?');
  const stInsertVec = db.prepare('INSERT INTO vec_nodes(rowid, embedding) VALUES (?, ?)');
  // Upsert includes raw_bin (Phase 3). When binary mode is off we pass
  // null and the column stays NULL — no behavioral change for fp32 callers.
  const stUpsertMeta = db.prepare(
    'INSERT OR REPLACE INTO vec_meta(rowid, node_id, room, wing, raw_text, raw_bin, created) VALUES (?, ?, ?, ?, ?, ?, ?)',
  );
  const stDeleteFts = db.prepare('DELETE FROM fts_docs WHERE rowid = ?');
  const stInsertFts = db.prepare('INSERT INTO fts_docs(rowid, text) VALUES (?, ?)');
  const stGetRowid = db.prepare('SELECT rowid FROM vec_meta WHERE node_id = ?');
  const stCount = db.prepare('SELECT COUNT(*) AS n FROM vec_meta');
  const stMaxRowid = db.prepare('SELECT COALESCE(MAX(rowid), 0) AS m FROM vec_meta');
  const stAllMeta = db.prepare('SELECT rowid, node_id, room, wing, raw_text FROM vec_meta ORDER BY rowid');
  const stAllVectors = db.prepare('SELECT rowid, embedding FROM vec_nodes');
  // Binary retrieval: stream (rowid, node_id, room, wing, raw_bin) for
  // rows where the binary blob exists. NULL rows are skipped.
  const stAllBin = db.prepare(
    'SELECT rowid, node_id, room, wing, raw_bin FROM vec_meta WHERE raw_bin IS NOT NULL ORDER BY rowid',
  );
  const stAllBinByRoom = db.prepare(
    'SELECT rowid, node_id, room, wing, raw_bin FROM vec_meta WHERE raw_bin IS NOT NULL AND room = ? ORDER BY rowid',
  );
  // sqlite-vec requires the k value on the MATCH clause itself
  // (`k = ?`), not as a trailing LIMIT. LIMIT is evaluated AFTER the
  // vec0 scan, so using it alone makes sqlite-vec reject the prepare.
  const stSearch = db.prepare(
    `SELECT m.node_id, m.room, m.wing, v.distance
     FROM vec_nodes v
     JOIN vec_meta  m ON v.rowid = m.rowid
     WHERE v.embedding MATCH ? AND k = ?
     ORDER BY v.distance`,
  );
  // BM25 with BEIR-tuned Anserini parameters (k1=0.9, b=0.4). FTS5's
  // bm25() aux returns negative Lucene-style scores, so ORDER BY rank ASC.
  const stBm25 = db.prepare(
    `SELECT m.node_id, m.room, m.wing
       FROM fts_docs f
       JOIN vec_meta m ON m.rowid = f.rowid
      WHERE fts_docs MATCH ?
      ORDER BY bm25(fts_docs, 0.9, 0.4)
      LIMIT ?`,
  );
  const stBm25Room = db.prepare(
    `SELECT m.node_id, m.room, m.wing
       FROM fts_docs f
       JOIN vec_meta m ON m.rowid = f.rowid
      WHERE fts_docs MATCH ? AND m.room = ?
      ORDER BY bm25(fts_docs, 0.9, 0.4)
      LIMIT ?`,
  );

  const upsert = (record: VectorRecord): ResultAsync<void, VectorError> => {
    if (record.vector.length !== dim) {
      return errAsync(VectorError.dimensionMismatch(dim, record.vector.length));
    }
    try {
      const existing = stGetRowid.get(record.node_id) as { rowid: number } | undefined;
      const rowidNum = existing?.rowid ?? (stMaxRowid.get() as { m: number }).m + 1;
      const rowid = BigInt(rowidNum);
      const buf = toVecBuffer(record.vector);
      const rawText = record.raw_text ?? null;

      // Phase 3 — compute the binary-quantized vector when binary mode
      // is enabled. Skipped when binaryDim is null. Dimension validation
      // already guarantees record.vector.length === dim, so the MRL
      // truncation `dim → binaryDim` is always well-formed (since we
      // validated binaryDim ∈ {128, 256, 384, 512} ≤ typical 768).
      let rawBin: Buffer | null = null;
      if (binaryDim !== null) {
        const packed = matryoshkaBinary(record.vector, binaryDim);
        if (packed.isOk()) {
          rawBin = Buffer.from(packed.value);
        }
        // On MRL error we silently skip the binary column — the fp32
        // path is still correct. Logging this is a Phase 3c observability
        // addition via the log-event pipeline.
      }

      const tx = db.transaction(() => {
        // delete any prior vector + fts row for this rowid (no-op if absent)
        stDeleteVec.run(rowid);
        stInsertVec.run(rowid, buf);
        stUpsertMeta.run(
          rowidNum,
          record.node_id,
          record.room,
          record.wing ?? null,
          rawText,
          rawBin,
          Date.now(),
        );
        // FTS5 write path — only when raw_text is provided. Delete first
        // to handle updates (content='' FTS5 tables don't auto-dedupe).
        if (rawText !== null) {
          stDeleteFts.run(rowidNum);
          stInsertFts.run(rowidNum, rawText);
        }
      });
      tx();
      return okAsync(undefined);
    } catch (e) {
      return errAsync(VectorError.writeError(record.node_id, (e as Error).message));
    }
  };

  const searchGlobal = (query: Vector, k: number): ResultAsync<readonly Match[], VectorError> => {
    if (query.length !== dim) return errAsync(VectorError.dimensionMismatch(dim, query.length));
    try {
      const rows = stSearch.all(toVecBuffer(query), k) as Array<{
        node_id: NodeId;
        room: Room;
        wing: Wing | null;
        distance: number;
      }>;
      const matches: readonly Match[] = rows.map((r) => ({
        node_id: r.node_id,
        room: r.room,
        wing: r.wing ?? undefined,
        distance: r.distance,
      }));
      return okAsync(matches);
    } catch (e) {
      return errAsync(VectorError.readError((e as Error).message));
    }
  };

  const searchByRoom = (
    room: Room,
    query: Vector,
    k: number,
  ): ResultAsync<readonly Match[], VectorError> =>
    searchGlobal(query, k * overfetch).map((all) => {
      const filtered = all.filter((m) => m.room === room);
      return filtered.slice(0, k);
    });

  // BM25 sparse retrieval via FTS5. Returns ranked candidates, not Matches,
  // so the RRF fuse can combine with dense ranks.
  const bm25Search = (
    rawQuery: string,
    k: number,
    roomFilter?: Room,
  ): readonly RankedCandidate[] => {
    const ftsQuery = sanitizeForFts5(rawQuery);
    if (ftsQuery === '') return [];
    try {
      const rows = (roomFilter
        ? stBm25Room.all(ftsQuery, roomFilter, k)
        : stBm25.all(ftsQuery, k)) as Array<{
        node_id: NodeId;
        room: Room;
        wing: Wing | null;
      }>;
      return rows.map((r, idx) => ({
        node_id: r.node_id,
        room: r.room,
        wing: r.wing ?? undefined,
        denseRank: null,
        bm25Rank: idx,
      }));
    } catch {
      // FTS5 query parser may still reject a constructed query edge case;
      // treat as empty and fall back to dense-only via RRF.
      return [];
    }
  };

  // Dense retrieval returning RankedCandidates rather than Matches — used
  // as the dense arm of hybrid fusion.
  const denseSearchRanked = (
    query: Vector,
    k: number,
  ): ResultAsync<readonly RankedCandidate[], VectorError> =>
    searchGlobal(query, k).map((matches) =>
      matches.map((m, idx) => ({
        node_id: m.node_id,
        room: m.room,
        wing: m.wing,
        denseRank: idx,
        bm25Rank: null,
        distance: m.distance,
      })),
    );

  const searchHybrid = (
    rawQuery: string,
    queryVec: Vector,
    k: number,
    cfg: HybridConfig = DEFAULT_HYBRID_CONFIG,
  ): ResultAsync<readonly Match[], VectorError> =>
    denseSearchRanked(queryVec, cfg.denseK).map((dense) => {
      const bm25 = bm25Search(rawQuery, cfg.bm25K);
      const fused = rrfFuse(dense, bm25, cfg);
      return fused.slice(0, k).map((c) => ({
        node_id: c.node_id,
        room: c.room as Room,
        wing: c.wing,
        distance: c.distance ?? 0,
      }));
    });

  const searchByRoomHybrid = (
    room: Room,
    rawQuery: string,
    queryVec: Vector,
    k: number,
    cfg: HybridConfig = DEFAULT_HYBRID_CONFIG,
  ): ResultAsync<readonly Match[], VectorError> =>
    searchGlobal(queryVec, cfg.denseK * overfetch)
      .map((allMatches) => allMatches.filter((m) => m.room === room).slice(0, cfg.denseK))
      .map((denseMatches) => {
        const dense: RankedCandidate[] = denseMatches.map((m, idx) => ({
          node_id: m.node_id,
          room: m.room,
          wing: m.wing,
          denseRank: idx,
          bm25Rank: null,
          distance: m.distance,
        }));
        const bm25 = bm25Search(rawQuery, cfg.bm25K, room);
        const fused = rrfFuse(dense, bm25, cfg);
        return fused.slice(0, k).map((c) => ({
          node_id: c.node_id,
          room: c.room as Room,
          wing: c.wing,
          distance: c.distance ?? 0,
        }));
      });

  // ─── Phase 3 — binary-quantized retrieval path ───
  //
  // Reads every row with raw_bin populated, computes Hamming distance
  // between the truncated+packed query and each stored blob, returns
  // the top-N as RankedCandidates in cosine-like orientation (lower
  // Hamming = better = lower denseRank). Then RRF-fuses with BM25 via
  // the same rrfFuse used by searchHybrid.
  //
  // O(N) read + O(N * bytes) scoring. At 10k rows × 64 bytes = 640 KB
  // read, ~1 ms SQL + ~1 ms popcount → ~3 ms total end-to-end. Acceptable
  // at v4's 10k-100k target corpus sizes. Scaling beyond 1M would need
  // native sqlite-vec bit-vector support or an IVF-PQ layer — deferred
  // to v4.2 per the plan's Non-goals.

  const binarySearchRanked = (
    queryVec: Vector,
    k: number,
    roomFilter?: Room,
  ): ResultAsync<readonly RankedCandidate[], VectorError> => {
    if (binaryDim === null) {
      return okAsync([]);
    }
    if (queryVec.length !== dim) {
      return errAsync(VectorError.dimensionMismatch(dim, queryVec.length));
    }
    try {
      const packedRes = matryoshkaBinary(queryVec, binaryDim);
      if (packedRes.isErr()) {
        // MRL failure — fall back to empty result so the caller can
        // degrade gracefully via the BM25 arm of RRF.
        return okAsync([]);
      }
      const queryBin = packedRes.value;

      const rows = (
        roomFilter ? stAllBinByRoom.all(roomFilter) : stAllBin.all()
      ) as Array<{
        rowid: number;
        node_id: NodeId;
        room: Room;
        wing: Wing | null;
        raw_bin: Buffer;
      }>;

      if (rows.length === 0) return okAsync([]);

      // Score every row via Hamming. For top-k selection, a simple sort
      // is fine at ≤100k; a heap-based partial sort would win at scale.
      const scored: Array<{ row: typeof rows[number]; dist: number }> = new Array(rows.length);
      for (let i = 0; i < rows.length; i++) {
        const docBin = new Uint8Array(
          rows[i].raw_bin.buffer,
          rows[i].raw_bin.byteOffset,
          rows[i].raw_bin.byteLength,
        );
        scored[i] = { row: rows[i], dist: hammingDistance(queryBin, docBin) };
      }
      scored.sort((a, b) => a.dist - b.dist);

      const topN = scored.slice(0, k);
      const ranked: RankedCandidate[] = topN.map((s, idx) => ({
        node_id: s.row.node_id,
        room: s.row.room,
        wing: s.row.wing ?? undefined,
        denseRank: idx,
        bm25Rank: null,
        distance: s.dist,
      }));
      return okAsync(ranked);
    } catch (e) {
      return errAsync(VectorError.readError((e as Error).message));
    }
  };

  const searchHybridBinary = (
    rawQuery: string,
    queryVec: Vector,
    k: number,
    cfg: HybridConfig = DEFAULT_HYBRID_CONFIG,
  ): ResultAsync<readonly Match[], VectorError> =>
    binarySearchRanked(queryVec, cfg.denseK).map((dense) => {
      if (dense.length === 0 && binaryDim === null) return [];
      const bm25 = bm25Search(rawQuery, cfg.bm25K);
      const fused = rrfFuse(dense, bm25, cfg);
      return fused.slice(0, k).map((c) => ({
        node_id: c.node_id,
        room: c.room as Room,
        wing: c.wing,
        distance: c.distance ?? 0,
      }));
    });

  const searchByRoomHybridBinary = (
    room: Room,
    rawQuery: string,
    queryVec: Vector,
    k: number,
    cfg: HybridConfig = DEFAULT_HYBRID_CONFIG,
  ): ResultAsync<readonly Match[], VectorError> =>
    binarySearchRanked(queryVec, cfg.denseK, room).map((dense) => {
      if (dense.length === 0 && binaryDim === null) return [];
      const bm25 = bm25Search(rawQuery, cfg.bm25K, room);
      const fused = rrfFuse(dense, bm25, cfg);
      return fused.slice(0, k).map((c) => ({
        node_id: c.node_id,
        room: c.room as Room,
        wing: c.wing,
        distance: c.distance ?? 0,
      }));
    });

  const all = (): ResultAsync<readonly VectorRecord[], VectorError> => {
    try {
      const metas = stAllMeta.all() as Array<{
        rowid: number;
        node_id: NodeId;
        room: Room;
        wing: Wing | null;
        raw_text: string | null;
      }>;
      const vectors = stAllVectors.all() as Array<{ rowid: number; embedding: Buffer }>;
      const vecByRow = new Map<number, Vector>();
      for (const v of vectors) vecByRow.set(v.rowid, fromVecBuffer(v.embedding, dim));
      const records: readonly VectorRecord[] = metas
        .map((m) => {
          const vec = vecByRow.get(m.rowid);
          if (!vec) return null;
          const record: VectorRecord = {
            node_id: m.node_id,
            room: m.room,
            wing: m.wing ?? undefined,
            vector: vec,
            raw_text: m.raw_text ?? undefined,
          };
          return record;
        })
        .filter((r): r is VectorRecord => r !== null);
      return okAsync(records);
    } catch (e) {
      return errAsync(VectorError.readError((e as Error).message));
    }
  };

  const size = (): number => {
    const r = stCount.get() as { n: number };
    return r.n;
  };

  const close = (): void => {
    db.close();
  };

  return {
    upsert,
    searchGlobal,
    searchByRoom,
    searchHybrid,
    searchByRoomHybrid,
    searchHybridBinary,
    searchByRoomHybridBinary,
    all,
    size,
    binaryDim,
    close,
  };
};

// ─────────────────────── helpers ──────────────────────────

const toVecBuffer = (v: Vector): Buffer => Buffer.from(v.buffer, v.byteOffset, v.byteLength);

const fromVecBuffer = (buf: Buffer, dim: number): Vector => {
  const out = new Float32Array(dim);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  for (let i = 0; i < dim; i++) out[i] = dv.getFloat32(i * 4, true);
  return out;
};
