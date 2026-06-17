/**
 * prune-orphan-vectors — vector-index consistency repair.
 *
 * Over a graph's lifetime (rebrands, migrations, `gc apply` node
 * retention) graph nodes get removed while their embeddings linger in
 * `vectors.db`. The result is an *orphaned vector*: a `vec_meta` row
 * whose `node_id` no longer resolves in `graph.json`. When retrieval's
 * top hits land on orphans, `getNode` returns undefined → null metadata
 * → provenance penalty + freshness blindness → depressed satisfaction →
 * the deny gate never fires. The fix is to drop the orphan rows.
 *
 * This is deliberately NOT a method on the `VectorIndex` port: that
 * interface is widely consumed (and mocked) and a bulk-prune capability
 * doesn't belong on the per-record CRUD surface. It opens its own
 * better-sqlite3 + sqlite-vec connection and mirrors the exact delete
 * triple used by `vector-index.ts` `deleteByNodeId` — vec0 + fts5 key on
 * `rowid` (no FK cascade), `vec_meta` keys on `node_id`.
 *
 * Pure-ish + testable: the caller supplies the set of valid node ids
 * (from a loaded graph) and the db path; this module owns no policy
 * about *which* graph or *where* it lives. The CLI command wires it to
 * the runtime. Idempotent — a second run with the same valid-id set
 * finds zero orphans.
 */

import { ResultAsync } from 'neverthrow';
import type Database from 'better-sqlite3';
import { VectorError } from '../domain/errors.js';
import { DEFAULT_DIM } from '../domain/vectors.js';

export interface PruneOrphanVectorsDeps {
  /** Path to the sqlite-vec database (e.g. `~/.folklore/vectors.db`). */
  readonly dbPath: string;
  /** Node ids that still resolve in the graph; everything else is orphaned. */
  readonly validIds: ReadonlySet<string>;
  /** Embedding dimension for the vec0 table (defaults to the corpus dim). */
  readonly dim?: number;
  /** When true, scan + report only; touch nothing. */
  readonly dryRun?: boolean;
  /** When true (default), VACUUM after a non-dry-run delete to reclaim space. */
  readonly vacuum?: boolean;
}

export interface PruneOrphanVectorsReport {
  /** Total `vec_meta` rows scanned. */
  readonly scanned: number;
  /** Rows whose `node_id` resolves in the graph (kept). */
  readonly resolved: number;
  /** Rows whose `node_id` does not resolve (orphaned). */
  readonly orphans: number;
  /** Rows actually deleted (0 on a dry run). */
  readonly deleted: number;
  /** Resolve-rate after the prune (1.0 once orphans are gone). */
  readonly resolveRateAfter: number;
  readonly dryRun: boolean;
  /** Up to 10 orphan node_ids, for the human-readable report. */
  readonly sampleOrphans: readonly string[];
}

interface MetaRow {
  readonly rowid: number;
  readonly node_id: string;
}

/**
 * Find and drop `vec_meta`/`vec_nodes`/`fts_docs` rows whose `node_id`
 * is absent from `validIds`. Returns a report; never re-embeds.
 */
export const pruneOrphanVectors = (
  deps: PruneOrphanVectorsDeps,
): ResultAsync<PruneOrphanVectorsReport, VectorError> => {
  const dim = deps.dim ?? DEFAULT_DIM;
  const dryRun = deps.dryRun ?? false;
  const doVacuum = deps.vacuum ?? true;

  return ResultAsync.fromPromise(
    (async (): Promise<PruneOrphanVectorsReport> => {
      const [Better, vec] = await Promise.all([
        import('better-sqlite3'),
        import('sqlite-vec'),
      ]);
      const DatabaseCtor = (Better as unknown as { default: typeof Database }).default;
      const db = new DatabaseCtor(deps.dbPath);
      try {
        db.pragma('journal_mode = WAL');
        db.pragma('synchronous = NORMAL');
        vec.load(db);
        // vec0 is created with a fixed embedding dim; if the db predates
        // this code the table already exists, so this is a guard for the
        // (test) case of a fresh file. IF NOT EXISTS keeps it idempotent.
        db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS vec_nodes USING vec0(embedding float[${dim}])`);

        const rows = db.prepare('SELECT rowid, node_id FROM vec_meta').all() as MetaRow[];
        const scanned = rows.length;
        const orphanRows = rows.filter((r) => !deps.validIds.has(r.node_id));
        const orphans = orphanRows.length;
        const resolved = scanned - orphans;
        const sampleOrphans = orphanRows.slice(0, 10).map((r) => r.node_id);

        let deleted = 0;
        if (!dryRun && orphans > 0) {
          // Mirror vector-index.ts deleteByNodeId: vec0 + fts5 key on
          // rowid, vec_meta on node_id. vec0 rowid binds need BigInt.
          const stDeleteVec = db.prepare('DELETE FROM vec_nodes WHERE rowid = ?');
          const stDeleteFts = db.prepare('DELETE FROM fts_docs WHERE rowid = ?');
          const stDeleteMeta = db.prepare('DELETE FROM vec_meta WHERE node_id = ?');
          const tx = db.transaction((batch: readonly MetaRow[]) => {
            for (const r of batch) {
              stDeleteVec.run(BigInt(r.rowid));
              stDeleteFts.run(r.rowid);
              stDeleteMeta.run(r.node_id);
            }
          });
          tx(orphanRows);
          deleted = orphans;
          // VACUUM rebuilds the file to reclaim the freed pages. Must run
          // outside any open transaction; the tx above has committed.
          if (doVacuum) db.exec('VACUUM');
        }

        const remaining = scanned - deleted;
        const resolveRateAfter = remaining === 0 ? 1 : resolved / remaining;

        return { scanned, resolved, orphans, deleted, resolveRateAfter, dryRun, sampleOrphans };
      } finally {
        db.close();
      }
    })(),
    (e) => VectorError.writeError(deps.dbPath, (e as Error).message),
  );
};
