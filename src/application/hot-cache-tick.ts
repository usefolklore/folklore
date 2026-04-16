/**
 * Hot-cache tick — application-layer I/O wrapper around the pure
 * domain summariser. Called on every daemon tick AND on demand from
 * the CLI `hot --refresh` command.
 *
 * Contract: given a graph repo and a home path, produce the snapshot,
 * render it, and atomically write to `{home}/hot.md`. Any failure
 * returns a Result — callers log and continue, never crash the tick.
 */

import { writeFile, rename, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ResultAsync, errAsync } from 'neverthrow';
import { GraphError } from '../domain/errors.js';
import type { GraphRepository } from '../infrastructure/graph-repository.js';
import { buildSnapshot, render } from '../domain/hot-cache.js';

export const HOT_FILENAME = 'hot.md' as const;

export const refreshHotCache = (
  graphs: GraphRepository,
  homePath: string,
): ResultAsync<string, GraphError> =>
  graphs.load().andThen((graph) => {
    const snapshot = buildSnapshot(graph);
    const text = render(snapshot);
    const target = join(homePath, HOT_FILENAME);
    const tmp = `${target}.tmp`;
    return ResultAsync.fromPromise(
      (async (): Promise<string> => {
        await mkdir(homePath, { recursive: true });
        await writeFile(tmp, text, 'utf8');
        await rename(tmp, target);
        return target;
      })(),
      (e) => GraphError.writeError(target, (e as Error).message),
    );
  });

/** Convenience: build the rendered markdown without writing. */
export const buildHotCacheText = (
  graphs: GraphRepository,
): ResultAsync<string, GraphError> =>
  graphs
    .load()
    .map((graph) => render(buildSnapshot(graph)))
    .orElse((e) => errAsync<string, GraphError>(e));
