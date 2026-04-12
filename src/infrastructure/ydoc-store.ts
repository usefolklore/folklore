/**
 * Y.Doc binary persistence — `~/.wellinformed/ydocs/<room>.ydoc` files.
 *
 * V1 ENCODING ONLY. The y-protocols/sync module Phase 16 uses for the wire
 * protocol expects V1 update bytes. Mixing V1 and V2 silently corrupts state
 * (see 16-RESEARCH.md Pitfall 2). Every encode call here is V1:
 *   - encodeStateAsUpdate (NOT encodeStateAsUpdateV2)
 *   - applyUpdate         (NOT applyUpdateV2)
 *   - doc.on('update')    (NOT doc.on('updateV2'))
 *
 * INIT ORDER. loadYDoc returns a Y.Doc that already has the persisted bytes
 * applied. Callers MUST NOT call doc.getMap('nodes') before loadYDoc returns,
 * because doing so initializes an empty shared type and can produce a clock
 * conflict with the stored state on first apply (Pitfall 3). The store
 * deliberately never calls doc.getMap — that is the caller's responsibility.
 *
 * CONCURRENT SAVES. Pitfall 6 — Node is single-threaded but async, so two
 * `await saveYDoc(samePath, ...)` calls can interleave their tmp+rename
 * sequence. We serialize per-path with a Map<string, Promise<void>> chain.
 * Entries persist for the process lifetime: at most one entry per shared room,
 * and shared rooms are long-lived, so the memory cost is negligible.
 */
import * as Y from 'yjs';
import { ResultAsync, okAsync } from 'neverthrow';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { ShareError } from '../domain/errors.js';
import { ShareError as SE } from '../domain/errors.js';

/**
 * Per-path write queue. Each path key chains its writes through a single
 * promise so two concurrent saveYDoc(samePath, _) calls execute serially.
 * Cleared lazily — entries persist for the lifetime of the process,
 * which is fine: at most one entry per shared room.
 */
const writeQueues = new Map<string, Promise<void>>();

/**
 * Load a Y.Doc from disk, or return a fresh one if no file exists.
 *
 * Strict init order: `new Y.Doc()` → `Y.applyUpdate(doc, storedBytes)` → return.
 * The caller may then call `doc.getMap('nodes')` on the returned doc.
 * This function deliberately does NOT call getMap — see module-level comment.
 *
 * @param ydocPath - Absolute path to the .ydoc binary file
 * @returns ResultAsync wrapping either a Y.Doc (possibly fresh) or a YDocLoadError
 */
export const loadYDoc = (ydocPath: string): ResultAsync<Y.Doc, ShareError> => {
  const doc = new Y.Doc();
  if (!existsSync(ydocPath)) {
    return okAsync(doc);
  }
  return ResultAsync.fromPromise(
    readFile(ydocPath),
    (e) => SE.ydocLoadError(ydocPath, (e as Error).message),
  ).andThen((bytes) => {
    try {
      // V1 applyUpdate — must match V1 encodeStateAsUpdate used by saveYDoc.
      Y.applyUpdate(doc, new Uint8Array(bytes));
      return okAsync<Y.Doc, ShareError>(doc);
    } catch (e) {
      return ResultAsync.fromPromise(
        Promise.reject(SE.ydocLoadError(ydocPath, `applyUpdate failed: ${(e as Error).message}`)),
        (err) => err as ShareError,
      );
    }
  });
};

/**
 * Save a Y.Doc to disk atomically using V1 encoding.
 *
 * Steps:
 *   1. Snapshot update bytes synchronously via V1 `Y.encodeStateAsUpdate(doc)`
 *   2. Enqueue the write in the per-path queue so concurrent calls serialize
 *   3. In the queued task: mkdir (recursive) → writeFile(.tmp) → rename(.tmp → path)
 *
 * The snapshot happens synchronously at call time (before the queue delay) so
 * a rapid sequence of saves captures the doc state at each call site, not at
 * the time the queued task actually runs.
 *
 * @param ydocPath - Absolute path to the .ydoc binary file
 * @param doc      - The Y.Doc whose full state should be persisted
 * @returns ResultAsync<void, YDocSaveError>
 */
export const saveYDoc = (
  ydocPath: string,
  doc: Y.Doc,
): ResultAsync<void, ShareError> => {
  const tmp = `${ydocPath}.tmp`;
  const dir = dirname(ydocPath);

  // Snapshot bytes synchronously so the queued task uses the doc state at call time,
  // not at execution time (otherwise serialized writes drift across the queue delay).
  let bytes: Uint8Array;
  try {
    // V1 ENCODING — NEVER encodeStateAsUpdateV2.
    bytes = Y.encodeStateAsUpdate(doc);
  } catch (e) {
    return ResultAsync.fromPromise(
      Promise.reject(SE.ydocSaveError(ydocPath, `encode failed: ${(e as Error).message}`)),
      (err) => err as ShareError,
    );
  }

  const previous = writeQueues.get(ydocPath) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined) // never let prior failure cancel the chain
    .then(async () => {
      await mkdir(dir, { recursive: true });
      await writeFile(tmp, bytes);
      await rename(tmp, ydocPath);
    });
  writeQueues.set(ydocPath, next);

  return ResultAsync.fromPromise(
    next,
    (e) => SE.ydocSaveError(ydocPath, (e as Error).message),
  );
};
