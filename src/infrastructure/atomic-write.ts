/**
 * Atomic file write — write to `<path>.tmp`, rename into place.
 *
 * On POSIX, `rename(2)` is atomic within a filesystem: a reader
 * either sees the old file or the new one, never a torn state.
 * SIGKILL during the tmp write leaves a stray .tmp (cleaned by
 * the next write), but the canonical file is never half-written.
 *
 * graph-repository.ts already does this for graph.json; this
 * helper extends the same guarantee to jobs.json, watch-targets.json,
 * and other persisted control state.
 */

import { writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const atomicWriteSync = (path: string, content: string): void => {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, path);
};
