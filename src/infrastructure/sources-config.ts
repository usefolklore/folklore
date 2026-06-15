/**
 * sources-config — port + file adapter for the user's source registry.
 *
 * The registry lives at `~/.folklore/sources.json` (overridable
 * via `FOLKLORE_HOME`). The schema is intentionally boring: a
 * flat array of SourceDescriptor values. Phase 3 can migrate to
 * YAML when we need comments and references.
 *
 * The port is narrow — list / add / remove — and returns
 * ResultAsync so the application layer can chain over I/O errors.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { GraphError } from '../domain/errors.js';
import { GraphError as GE } from '../domain/errors.js';
import type { SourceDescriptor } from '../domain/sources.js';

/** Port. */
export interface SourcesConfig {
  list(): ResultAsync<readonly SourceDescriptor[], GraphError>;
  add(d: SourceDescriptor): ResultAsync<readonly SourceDescriptor[], GraphError>;
  remove(id: string): ResultAsync<readonly SourceDescriptor[], GraphError>;
  replace(all: readonly SourceDescriptor[]): ResultAsync<readonly SourceDescriptor[], GraphError>;
}

/**
 * File-backed implementation. Reads the whole file on every call —
 * simple, correct, fine for a list of tens to low hundreds.
 */
export const fileSourcesConfig = (path: string): SourcesConfig => {
  const readAll = (): ResultAsync<SourceDescriptor[], GraphError> => {
    if (!existsSync(path)) return okAsync([]);
    return ResultAsync.fromPromise(readFile(path, 'utf8'), (e) =>
      GE.readError(path, (e as Error).message),
    ).andThen((text) => {
      if (text.trim().length === 0) return okAsync<SourceDescriptor[], GraphError>([]);
      try {
        const parsed = JSON.parse(text);
        if (!Array.isArray(parsed)) {
          return errAsync<SourceDescriptor[], GraphError>(
            GE.parseError(path, 'sources.json root must be an array'),
          );
        }
        return okAsync<SourceDescriptor[], GraphError>(parsed as SourceDescriptor[]);
      } catch (e) {
        return errAsync<SourceDescriptor[], GraphError>(
          GE.parseError(path, (e as Error).message),
        );
      }
    });
  };

  const writeAll = (
    all: readonly SourceDescriptor[],
  ): ResultAsync<readonly SourceDescriptor[], GraphError> => {
    try {
      mkdirSync(dirname(path), { recursive: true });
    } catch (e) {
      return errAsync(GE.writeError(path, (e as Error).message));
    }
    return ResultAsync.fromPromise(
      writeFile(path, JSON.stringify(all, null, 2), 'utf8'),
      (e) => GE.writeError(path, (e as Error).message),
    ).map(() => all);
  };

  const list = (): ResultAsync<readonly SourceDescriptor[], GraphError> => readAll();

  const add = (
    d: SourceDescriptor,
  ): ResultAsync<readonly SourceDescriptor[], GraphError> =>
    readAll().andThen((current) => {
      const without = current.filter((x) => x.id !== d.id);
      return writeAll([...without, d]);
    });

  const remove = (
    id: string,
  ): ResultAsync<readonly SourceDescriptor[], GraphError> =>
    readAll().andThen((current) => writeAll(current.filter((x) => x.id !== id)));

  const replace = (
    all: readonly SourceDescriptor[],
  ): ResultAsync<readonly SourceDescriptor[], GraphError> => writeAll(all);

  return { list, add, remove, replace };
};
