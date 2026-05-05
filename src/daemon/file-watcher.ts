/**
 * Daemon file-watcher — observes every registered watch-target root
 * and enqueues `ingest:file` jobs on change.
 *
 * One chokidar instance per root. Events are debounced 500ms per file
 * so a save burst (e.g. an editor's atomic-write dance) collapses
 * into a single re-ingest. Common noisy paths are excluded
 * (.git, node_modules, dist, .wellinformed, *.swp, *.tmp).
 *
 * Also includes a session-watcher for ~/.claude/projects/**\/*.jsonl
 * → enqueues `ingest:session` jobs on JSONL append. Same debounce
 * (2s per session because Claude can flush mid-conversation and we
 * don't want to re-walk on every line).
 */

import chokidar, { type FSWatcher } from 'chokidar';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readdirSync, statSync } from 'node:fs';
import type { JobQueue } from './job-queue.js';
import type { WatchTarget } from '../infrastructure/watch-targets.js';
import { loadWatchTargets, stampWatchTargetScan } from '../infrastructure/watch-targets.js';

const FILE_DEBOUNCE_MS = 500;
const SESSION_DEBOUNCE_MS = 2000;

// Paths chokidar should never even consider.
const FILE_IGNORE: readonly RegExp[] = [
  /\/\.git\//,
  /\/node_modules\//,
  /\/dist\//,
  /\/build\//,
  /\/\.wellinformed\//,
  /\.swp$/,
  /\.tmp$/,
  /~$/,
  /\.DS_Store$/,
];

const ignored = (p: string): boolean => FILE_IGNORE.some((rx) => rx.test(p));

/**
 * Recursively walk `dir`, calling `visit` on each file (not
 * directory) that survives the FILE_IGNORE filter. Bounded by
 * MAX_DEPTH to keep accidental symlink cycles from looping.
 *
 * Used by the boot-time reconciliation path so files modified
 * during daemon downtime get re-ingested instead of silently
 * dropped (the chokidar `ignoreInitial: true` flag means startup
 * doesn't replay events).
 */
const MAX_DEPTH = 12;
const walkFiles = (
  dir: string,
  visit: (path: string, mtimeMs: number) => void,
  depth = 0,
): void => {
  if (depth > MAX_DEPTH) return;
  let entries: readonly string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (ignored(full)) continue;
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkFiles(full, visit, depth + 1);
    } else if (st.isFile()) {
      visit(full, st.mtimeMs);
    }
  }
};

export interface FileWatcherHandle {
  /** Stop every chokidar instance. Idempotent. */
  readonly stop: () => Promise<void>;
}

export interface FileWatcherDeps {
  readonly homePath: string;
  readonly queue: JobQueue;
  /** Optional log sink — defaults to console. */
  readonly log?: (line: string) => void;
}

/**
 * Start watchers for every entry in watch-targets.json plus the
 * Claude sessions jsonl tree. Returns a handle whose stop() awaits
 * every chokidar instance's close().
 */
export const startFileWatchers = (deps: FileWatcherDeps): FileWatcherHandle => {
  const log = deps.log ?? ((s) => console.log(s));
  const targets = loadWatchTargets(join(deps.homePath, 'watch-targets.json'));

  const watchers: FSWatcher[] = [];
  // Per-target debounce timers — keyed by path.
  const fileTimers = new Map<string, NodeJS.Timeout>();

  const enqueueFile = (target: WatchTarget, path: string): void => {
    const prev = fileTimers.get(path);
    if (prev) clearTimeout(prev);
    fileTimers.set(
      path,
      setTimeout(() => {
        fileTimers.delete(path);
        deps.queue.submit({ kind: 'ingest:file', room: target.room, path });
        log(`watch: queued ingest:file ${path} (room=${target.room})`);
      }, FILE_DEBOUNCE_MS),
    );
  };

  const watchTargetsPath = join(deps.homePath, 'watch-targets.json');

  for (const t of targets) {
    if (!existsSync(t.root)) {
      log(`watch: skipping missing root ${t.root}`);
      continue;
    }

    // Boot-time reconciliation — find files modified since this
    // target's last_scan_at and enqueue them. Closes the gap where
    // the daemon was off (or the wizard told the user to restart it
    // to pick up a new target) and editor saves during that window
    // were silently lost.
    const sinceMs = t.last_scan_at ? Date.parse(t.last_scan_at) : 0;
    let caughtUp = 0;
    walkFiles(t.root, (path, mtimeMs) => {
      if (mtimeMs > sinceMs) {
        deps.queue.submit({ kind: 'ingest:file', room: t.room, path });
        caughtUp++;
      }
    });
    if (caughtUp > 0) {
      log(`watch: catch-up for ${t.root} (room=${t.room}) — ${caughtUp} file(s) since ${t.last_scan_at ?? '<never>'}`);
    }
    // Stamp the scan so the next boot's catch-up window starts here.
    // Done BEFORE chokidar starts so concurrent live events still
    // get debounced through the normal path.
    try { stampWatchTargetScan(watchTargetsPath, { room: t.room, root: t.root }); }
    catch (e) { log(`watch: stamp failed for ${t.root}: ${(e as Error).message}`); }

    const w = chokidar.watch(t.root, {
      ignored: (p: string) => ignored(p),
      ignoreInitial: true,        // catch-up scan above replaces the initial replay
      persistent: true,
      depth: 12,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    });
    w.on('add', (p) => enqueueFile(t, p));
    w.on('change', (p) => enqueueFile(t, p));
    w.on('error', (e) => log(`watch: error on ${t.root}: ${(e as Error).message}`));
    watchers.push(w);
    log(`watch: started for ${t.root} (room=${t.room})`);
  }

  // Session watcher — flat ~/.claude/projects tree. Always-on since
  // sessions are universal, not opted-in via `wellinformed this`.
  const sessionRoot = join(homedir(), '.claude', 'projects');
  const sessionTimer = { handle: null as NodeJS.Timeout | null };
  if (existsSync(sessionRoot)) {
    const w = chokidar.watch(sessionRoot, {
      ignored: (p: string) =>
        // Only watch .jsonl files; ignore the index.json sidecars and
        // anything claude-flow / ruflo writes alongside.
        !p.endsWith('.jsonl') && !p.endsWith(sessionRoot),
      ignoreInitial: true,
      persistent: true,
      depth: 4,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 200 },
    });
    const enqueueSession = (path: string): void => {
      if (sessionTimer.handle) clearTimeout(sessionTimer.handle);
      sessionTimer.handle = setTimeout(() => {
        sessionTimer.handle = null;
        deps.queue.submit({ kind: 'ingest:session' });
        log(`watch: queued ingest:session (trigger=${path})`);
      }, SESSION_DEBOUNCE_MS);
    };
    w.on('add', enqueueSession);
    w.on('change', enqueueSession);
    w.on('error', (e) => log(`watch: error on session tree: ${(e as Error).message}`));
    watchers.push(w);
    log(`watch: started session watcher on ${sessionRoot}`);
  }

  const stop = async (): Promise<void> => {
    for (const t of fileTimers.values()) clearTimeout(t);
    fileTimers.clear();
    if (sessionTimer.handle) clearTimeout(sessionTimer.handle);
    await Promise.all(watchers.map((w) => w.close()));
  };

  return { stop };
};
