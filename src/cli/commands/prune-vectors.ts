/**
 * `folklore prune-vectors [--dry-run] [--no-backup] [--no-vacuum] [--json]`
 *
 * Drop orphaned vectors — `vec_meta` rows whose `node_id` no longer
 * resolves in `graph.json`. Orphans accrue from rebrands, migrations,
 * and `gc apply` node retention; left in place they poison retrieval
 * (top hits land on nodes with no metadata → depressed satisfaction →
 * the deny gate never fires). See application/prune-orphan-vectors.ts.
 *
 * Data-sensitive: backs up `vectors.db` (copy → `vectors.db.bak-<ts>`)
 * before mutating, unless --no-backup or --dry-run. The orphan scan is
 * read-only; --dry-run reports the orphan count without touching disk.
 *
 * This command opens only the graph (not the full runtime VectorIndex),
 * so the pruner holds the sole write handle on vectors.db — VACUUM needs
 * no contending connection.
 */

import { copyFileSync, existsSync } from 'node:fs';
import { runtimePaths } from '../runtime.js';
import { fileGraphRepository } from '../../infrastructure/graph-repository.js';
import { formatError } from '../../domain/errors.js';
import { pruneOrphanVectors } from '../../application/prune-orphan-vectors.js';

interface Flags {
  readonly dryRun: boolean;
  readonly backup: boolean;
  readonly vacuum: boolean;
  readonly json: boolean;
}

const parseFlags = (rest: readonly string[]): Flags | string => {
  let dryRun = false;
  let backup = true;
  let vacuum = true;
  let json = false;
  for (const f of rest) {
    if (f === '--dry-run') { dryRun = true; continue; }
    if (f === '--no-backup') { backup = false; continue; }
    if (f === '--no-vacuum') { vacuum = false; continue; }
    if (f === '--json') { json = true; continue; }
    if (f === '--help' || f === '-h') return 'help';
    return `prune-vectors: unknown flag '${f}'`;
  }
  return { dryRun, backup, vacuum, json };
};

const USAGE = `usage: folklore prune-vectors [--dry-run] [--no-backup] [--no-vacuum] [--json]

  Drop orphaned vectors — vec_meta rows whose node_id no longer resolves
  in graph.json. Orphans depress retrieval satisfaction and stop the
  network-before-web deny gate from firing.

  --dry-run     scan + report the orphan count; touch nothing
  --no-backup   skip the vectors.db backup before deleting (NOT advised)
  --no-vacuum   skip the post-delete VACUUM (faster; leaves freed pages)
  --json        machine-readable report on stdout

  Backs up vectors.db to vectors.db.bak-<timestamp> before mutating
  unless --dry-run or --no-backup. Idempotent: re-running finds none.`;

export const pruneVectors = async (rest: readonly string[]): Promise<number> => {
  const flags = parseFlags(rest);
  if (flags === 'help') { console.log(USAGE); return 0; }
  if (typeof flags === 'string') { console.error(flags); return 1; }

  const paths = runtimePaths();
  if (!existsSync(paths.vectors)) {
    console.error(`prune-vectors: no vector index at ${paths.vectors} (nothing to prune).`);
    return 1;
  }

  const graphRes = await fileGraphRepository(paths.graph).load();
  if (graphRes.isErr()) {
    console.error(`prune-vectors: cannot load graph: ${formatError(graphRes.error)}`);
    return 1;
  }
  const validIds = new Set<string>(graphRes.value.nodeById.keys());

  if (!flags.dryRun && flags.backup) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = `${paths.vectors}.bak-${stamp}`;
    try {
      copyFileSync(paths.vectors, dest);
      if (!flags.json) console.log(`prune-vectors: backed up vectors.db → ${dest}`);
    } catch (e) {
      console.error(`prune-vectors: backup failed (${(e as Error).message}); aborting.`);
      return 1;
    }
  }

  const res = await pruneOrphanVectors({
    dbPath: paths.vectors,
    validIds,
    dryRun: flags.dryRun,
    vacuum: flags.vacuum,
  });
  if (res.isErr()) {
    console.error(`prune-vectors: ${formatError(res.error)}`);
    return 1;
  }
  const r = res.value;

  if (flags.json) {
    console.log(JSON.stringify(r, null, 2));
    return 0;
  }

  const pct = (n: number): string => `${(100 * n).toFixed(1)}%`;
  if (flags.dryRun) {
    console.log(
      `prune-vectors: --dry-run — ${r.orphans} orphan(s) of ${r.scanned} rows ` +
      `(${pct(r.scanned ? r.resolved / r.scanned : 1)} resolve today). Nothing written.`,
    );
  } else {
    console.log(
      `prune-vectors: deleted ${r.deleted} orphan(s); ${r.scanned - r.deleted} rows remain, ` +
      `resolve-rate now ${pct(r.resolveRateAfter)}.`,
    );
  }
  if (r.sampleOrphans.length > 0 && (flags.dryRun || r.deleted > 0)) {
    console.log('  sample orphans:');
    for (const id of r.sampleOrphans) console.log(`    · ${id}`);
  }
  return 0;
};
