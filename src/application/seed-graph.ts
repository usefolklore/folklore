/**
 * seed-graph — application use case behind `folklore seed`.
 *
 * Walks a parsed `SeedCorpus` and indexes each entry into the graph
 * via the same `indexNode` write path that `folklore save` uses, so
 * seeded nodes are real, retrievable, embedded nodes (not a special
 * second-class store). The point is cold-start: after seeding, a
 * fresh graph already answers the durable concept questions an agent
 * asks in its first session, so the deny-on-confidence hook fires
 * from turn one instead of after the graph has been warmed by web
 * traffic.
 *
 * Idempotent: each entry's node id is deterministic (`seedNodeId`),
 * so by default already-present ids are skipped — re-running `seed`
 * is a no-op on an already-seeded graph rather than a duplicate
 * write. `force` re-indexes everything (refreshes embeddings after a
 * corpus update).
 *
 * Functional: a curried use case over injected deps, neverthrow
 * Results, no classes.
 */

import { ResultAsync, okAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import { getNode, type Graph } from '../domain/graph.js';
import {
  type SeedCorpus,
  type SeedEntry,
  seedNodeId,
  seedToNode,
} from '../domain/seed-corpus.js';
import { indexNode, type UseCaseDeps } from './use-cases.js';

export interface SeedGraphParams {
  readonly corpus: SeedCorpus;
  /** Re-index entries even if their id already exists. Default false. */
  readonly force?: boolean;
  /** Injectable clock so ids/timestamps are deterministic in tests. */
  readonly now?: Date;
}

export interface SeedGraphReport {
  readonly total: number;
  readonly seeded: number;
  readonly skipped: number;
  /** Node ids actually written this run (seeded), in corpus order. */
  readonly seeded_ids: readonly string[];
  /** Node ids skipped because they already existed (when not forcing). */
  readonly skipped_ids: readonly string[];
}

/**
 * Index every corpus entry whose node id is not already present
 * (unless `force`). Returns a report of what was written vs skipped.
 *
 * The write is sequential: `indexNode` does load → mutate → save on
 * the shared graph, so concurrent writers would lose updates. A seed
 * corpus is tiny (tens of nodes) and only runs at install time, so a
 * simple fold keeps it correct without a mutex.
 */
export const seedGraph =
  (deps: UseCaseDeps) =>
  (params: SeedGraphParams): ResultAsync<SeedGraphReport, AppError> => {
    const now = params.now ?? new Date();
    const force = params.force ?? false;

    return deps.graphs
      .load()
      .mapErr((e): AppError => e)
      .andThen((graph) => {
        const present = (entry: SeedEntry): boolean =>
          getNode(graph, seedNodeId(entry, now)) !== undefined;

        const toSeed = force
          ? params.corpus.entries
          : params.corpus.entries.filter((e) => !present(e));
        const skipped = force
          ? []
          : params.corpus.entries.filter((e) => present(e));

        const seededIds: string[] = [];

        // Fold the index calls into one sequential chain. Each step
        // re-loads the graph inside `indexNode`, so writes accumulate.
        const chain = toSeed.reduce<ResultAsync<unknown, AppError>>(
          (acc, entry) =>
            acc.andThen(() => {
              const { node, text } = seedToNode(entry, now);
              return indexNode(deps)({ node, text }).map((g: Graph) => {
                seededIds.push(node.id);
                return g;
              });
            }),
          okAsync(undefined),
        );

        return chain.map(
          (): SeedGraphReport => ({
            total: params.corpus.entries.length,
            seeded: seededIds.length,
            skipped: skipped.length,
            seeded_ids: seededIds,
            skipped_ids: skipped.map((e) => seedNodeId(e, now)),
          }),
        );
      });
  };
