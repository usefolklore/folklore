/**
 * watch-targets.json — persistent registry of folders the daemon
 * watches for auto-re-ingest.
 *
 * Each entry: { room, root, registered_at }. `wellinformed this`
 * registers the cwd; the daemon reads the file on boot and starts a
 * chokidar watcher per root.
 *
 * Single-writer, multi-reader. Registration is idempotent — adding
 * the same (room, root) twice updates the timestamp instead of
 * duplicating the row.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export interface WatchTarget {
  readonly room: string;
  readonly root: string;
  readonly registered_at: string;     // ISO-8601
}

interface WatchTargetsFile {
  readonly version: 1;
  readonly targets: readonly WatchTarget[];
}

const empty = (): WatchTargetsFile => ({ version: 1, targets: [] });

const safeRead = (path: string): WatchTargetsFile => {
  if (!existsSync(path)) return empty();
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as WatchTargetsFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.targets)) return empty();
    return parsed;
  } catch {
    return empty();
  }
};

const safeWrite = (path: string, file: WatchTargetsFile): void => {
  writeFileSync(path, JSON.stringify(file, null, 2));
};

export const loadWatchTargets = (path: string): readonly WatchTarget[] =>
  safeRead(path).targets;

/**
 * Idempotent register. Replaces any existing row with the same
 * (room, root) pair so re-running `wellinformed this` refreshes the
 * registered_at timestamp without duplicating the entry.
 */
export const registerWatchTarget = (
  path: string,
  target: Omit<WatchTarget, 'registered_at'>,
  now: Date = new Date(),
): readonly WatchTarget[] => {
  const file = safeRead(path);
  const filtered = file.targets.filter(
    (t) => !(t.room === target.room && t.root === target.root),
  );
  const next: readonly WatchTarget[] = [
    ...filtered,
    { ...target, registered_at: now.toISOString() },
  ];
  safeWrite(path, { version: 1, targets: next });
  return next;
};

export const unregisterWatchTarget = (
  path: string,
  target: { readonly room: string; readonly root: string },
): readonly WatchTarget[] => {
  const file = safeRead(path);
  const next = file.targets.filter(
    (t) => !(t.room === target.room && t.root === target.root),
  );
  safeWrite(path, { version: 1, targets: next });
  return next;
};
