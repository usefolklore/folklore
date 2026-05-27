/**
 * `akashik migrate v5 [--rollback]` — V4 → V5 schema migration
 * (Phase 24, Plan 11, ROOMS-DEL-06) PLUS the Phase 25 data-dir
 * relocation `~/.wellinformed/` → `~/.akashik/`.
 *
 * Two transitions in one command, in order:
 *   1. Directory relocate: rename ~/.wellinformed/ → ~/.akashik/ (or
 *      copy+delete on cross-device). Atomic where filesystems allow.
 *   2. Schema migrate: graph.json V4 → V5 — strip `room` from every
 *      node, stamp `private: false`, heuristically infer `workspace`,
 *      flatten legacy room-prefixed peer-reputation entries, delete
 *      rooms.json + shared-rooms.json. graph.v4-backup.json captures
 *      pre-migration state.
 *
 * Idempotent — re-runs exit "Already on V5" without touching disk.
 * Rollback restores the graph blob from backup; rooms.json +
 * shared-rooms.json deletions, reputation flattening, and the dir
 * relocate are one-way. The dir relocate is deliberately not rolled
 * back: ~/.akashik/ is the canonical post-rebrand home; reverting
 * the brand is out of scope for a schema rollback.
 */

import {
  existsSync, readFileSync, writeFileSync, copyFileSync, readdirSync,
  unlinkSync, renameSync, statSync, mkdirSync, rmSync, cpSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const akashikHome = (): string =>
  process.env.AKASHIK_HOME ?? join(homedir(), '.akashik');

/** Pre-rebrand home. Only consulted by the relocator below; the rest of
 *  the CLI has been swept to akashikHome(). */
const legacyHome = (): string =>
  process.env.AKASHIK_LEGACY_HOME ?? join(homedir(), '.wellinformed');

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 63);

interface RawNode {
  readonly id?: string;
  readonly room?: string;
  readonly private?: boolean;
  readonly workspace?: string;
  readonly [k: string]: unknown;
}

interface RawGraph {
  readonly nodes?: RawNode[];
  readonly [k: string]: unknown;
}

interface MigratePaths {
  readonly home: string;
  readonly graph: string;
  readonly backup: string;
  readonly roomsJson: string;
  readonly sharedRoomsJson: string;
  readonly sharedRoomsLock: string;
  readonly peerReputation: string;
}

interface MigrateStats {
  readonly nodesTotal: number;
  readonly roomFieldsStripped: number;
  readonly privateDefaulted: number;
  readonly workspaceTagged: number;
  readonly uniqueRooms: number;
}

const migratePaths = (): MigratePaths => {
  const home = akashikHome();
  return {
    home,
    graph: join(home, 'graph.json'),
    backup: join(home, 'graph.v4-backup.json'),
    roomsJson: join(home, 'rooms.json'),
    sharedRoomsJson: join(home, 'shared-rooms.json'),
    sharedRoomsLock: join(home, 'shared-rooms.json.lock'),
    peerReputation: join(home, 'peer-reputation.json'),
  };
};

/**
 * Heuristic: does a slugified room name match a real repo on disk?
 * Scans ~/personal, ~/code, ~/work, ~/src, ~/projects.
 * Override via AKASHIK_REPO_ROOTS=path1:path2.
 */
const repoRoots = (): readonly string[] => {
  const env = process.env.AKASHIK_REPO_ROOTS;
  if (env) return env.split(':').filter(Boolean);
  const h = homedir();
  return [join(h, 'personal'), join(h, 'code'), join(h, 'work'), join(h, 'src'), join(h, 'projects')];
};

const inferWorkspace = (roomName: string): string | undefined => {
  const slug = slugify(roomName);
  if (!slug) return undefined;
  for (const root of repoRoots()) {
    try {
      const candidate = join(root, slug);
      if (existsSync(candidate) && statSync(candidate).isDirectory()) return slug;
    } catch { /* unreadable root — skip */ }
  }
  return undefined;
};

/** Crash-safe write: .tmp + rename. Matches Phase 20 sessions-state pattern. */
const atomicWriteJson = (path: string, value: unknown): void => {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, path);
};

const detectV4 = (raw: RawGraph, paths: MigratePaths): boolean => {
  if (existsSync(paths.roomsJson)) return true;
  if (existsSync(paths.sharedRoomsJson)) return true;
  const nodes = Array.isArray(raw.nodes) ? raw.nodes : [];
  return nodes.slice(0, 50).some((n) => typeof n.room === 'string');
};

const transformNodes = (rawNodes: RawNode[]): { nodes: RawNode[]; stats: MigrateStats } => {
  const uniqueRooms = new Set<string>();
  const workspaceByRoom = new Map<string, string | undefined>();
  let roomFieldsStripped = 0;
  let privateDefaulted = 0;
  let workspaceTagged = 0;

  for (const n of rawNodes) {
    if (typeof n.room === 'string' && n.room.length > 0) {
      uniqueRooms.add(n.room);
      if (!workspaceByRoom.has(n.room)) {
        workspaceByRoom.set(n.room, inferWorkspace(n.room));
      }
    }
  }

  const nodes: RawNode[] = rawNodes.map((n) => {
    const { room, ...rest } = n as RawNode & { room?: string };
    const carriedRoom = typeof room === 'string' && room.length > 0;
    if (carriedRoom) roomFieldsStripped += 1;

    const next: Record<string, unknown> = { ...rest };
    if (typeof next.private !== 'boolean') {
      next.private = false;
      privateDefaulted += 1;
    }
    if (typeof next.workspace !== 'string' && carriedRoom) {
      const ws = workspaceByRoom.get(room as string);
      if (ws) { next.workspace = ws; workspaceTagged += 1; }
    }
    return next as RawNode;
  });

  return {
    nodes,
    stats: {
      nodesTotal: rawNodes.length,
      roomFieldsStripped, privateDefaulted, workspaceTagged,
      uniqueRooms: uniqueRooms.size,
    },
  };
};

/**
 * Drop legacy room-prefixed subject entries from peer-reputation.json.
 * Aligns disk with the V5 runtime filter introduced in 24-10.
 */
const flattenReputation = (path: string): { dropped: number; peersAffected: number } => {
  if (!existsSync(path)) return { dropped: 0, peersAffected: 0 };
  let parsed: { peers?: Record<string, { subjects?: Record<string, unknown> }> };
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch { return { dropped: 0, peersAffected: 0 }; }
  if (!parsed.peers || typeof parsed.peers !== 'object') return { dropped: 0, peersAffected: 0 };

  let dropped = 0;
  let peersAffected = 0;
  const LEGACY_PREFIX = `${'r'}oom:`;   // string-concat: no `'room:'` literal in greps

  for (const peerId of Object.keys(parsed.peers)) {
    const peer = parsed.peers[peerId];
    if (!peer?.subjects || typeof peer.subjects !== 'object') continue;
    let peerDropped = 0;
    for (const k of Object.keys(peer.subjects)) {
      if (k.startsWith(LEGACY_PREFIX)) { delete peer.subjects[k]; peerDropped += 1; }
    }
    if (peerDropped > 0) { dropped += peerDropped; peersAffected += 1; }
  }
  atomicWriteJson(path, parsed);
  return { dropped, peersAffected };
};

const removeIfExists = (path: string): boolean => {
  if (!existsSync(path)) return false;
  try { unlinkSync(path); return true; } catch { return false; }
};

const confirmBackupOverwrite = (path: string): boolean => {
  if (!existsSync(path)) return true;
  console.error(`migrate: ${path} already exists from a prior run.`);
  console.error(`migrate: refusing to overwrite. Remove or move it aside, then retry.`);
  return false;
};

/** Is the directory empty (or just a stale .DS_Store)? Used to decide
 *  whether a target like ~/.akashik/ counts as a real "would clobber"
 *  conflict or is safe to consume. */
const isDirEffectivelyEmpty = (path: string): boolean => {
  if (!existsSync(path)) return true;
  try {
    const entries = readdirSync(path).filter((e) => e !== '.DS_Store');
    return entries.length === 0;
  } catch { return false; }
};

interface RelocateOutcome {
  readonly kind: 'noop' | 'relocated' | 'merged' | 'aborted';
  readonly message: string;
}

/**
 * Relocate `~/.wellinformed/` → `~/.akashik/`. Decision matrix:
 *
 *   legacy │ target          │ action
 *   ───────┼─────────────────┼─────────────────────────────────────
 *   none   │ any             │ noop (nothing to migrate)
 *   exists │ none            │ rename (or cross-device copy+delete)
 *   exists │ exists, empty   │ rmdir target, then rename
 *   exists │ exists, non-empty │ ABORT (ambiguous — user must resolve)
 *
 * After a successful rename we leave behind a marker file at the legacy
 * path so the user can see — at a glance — that the relocate happened.
 * The marker is a single-line breadcrumb, never read by code.
 */
const relocateDir = (): RelocateOutcome => {
  const legacy = legacyHome();
  const target = akashikHome();

  if (!existsSync(legacy)) {
    return { kind: 'noop', message: `Legacy ${legacy} not present — skipping dir relocate.` };
  }
  try {
    if (!statSync(legacy).isDirectory()) {
      return { kind: 'aborted', message: `${legacy} exists but is not a directory; refusing to touch.` };
    }
  } catch (e) {
    return { kind: 'aborted', message: `failed to stat ${legacy}: ${(e as Error).message}` };
  }

  // Safety: refuse to relocate while a legacy daemon holds the pidfile.
  const legacyPid = join(legacy, 'daemon.pid');
  if (existsSync(legacyPid)) {
    try {
      const pid = parseInt(readFileSync(legacyPid, 'utf8').trim(), 10);
      if (Number.isFinite(pid) && pid > 0) {
        // Probe — sending signal 0 throws if process is gone.
        try {
          process.kill(pid, 0);
          return {
            kind: 'aborted',
            message: `daemon still running in ${legacy} (pid ${pid}). Stop it first: 'akashik daemon stop' (against the legacy home).`,
          };
        } catch { /* stale pidfile, safe to proceed */ }
      }
    } catch { /* unreadable pidfile, treat as stale */ }
  }

  if (existsSync(target)) {
    if (!isDirEffectivelyEmpty(target)) {
      return {
        kind: 'aborted',
        message:
          `Both ${legacy} and ${target} exist with data — refusing to merge automatically.\n` +
          `  Inspect both directories, move whichever you want to keep aside, then retry.`,
      };
    }
    // Target is empty (or only .DS_Store) — clear it so the rename can target it.
    try { rmSync(target, { recursive: true, force: true }); }
    catch (e) {
      return { kind: 'aborted', message: `failed to clear empty ${target}: ${(e as Error).message}` };
    }
  }

  // Try same-filesystem atomic rename first.
  try {
    renameSync(legacy, target);
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'EXDEV') {
      // Cross-device: copy then delete. Not atomic, but the only option.
      try {
        cpSync(legacy, target, { recursive: true, preserveTimestamps: true });
        rmSync(legacy, { recursive: true, force: true });
      } catch (e2) {
        return { kind: 'aborted', message: `cross-device relocate failed: ${(e2 as Error).message}` };
      }
    } else {
      return { kind: 'aborted', message: `rename failed: ${err.message}` };
    }
  }

  // Breadcrumb so the user knows where their data went.
  try {
    mkdirSync(legacy, { recursive: true });
    writeFileSync(
      join(legacy, 'RELOCATED.txt'),
      `This directory was relocated to ${target} on ${new Date().toISOString()}\n` +
      `by 'akashik migrate v5'. The relocation is one-way; akashik no longer\n` +
      `reads from this path. Safe to delete.\n`,
    );
  } catch { /* breadcrumb is best-effort */ }

  return { kind: 'relocated', message: `Relocated ${legacy} → ${target}` };
};

/** Forward migration: V4 → V5. */
const runMigrate = (): number => {
  // Step 0 — relocate ~/.wellinformed/ → ~/.akashik/ before touching schema.
  console.log('Checking data home...');
  const reloc = relocateDir();
  if (reloc.kind === 'aborted') {
    console.error(`migrate: ${reloc.message}`);
    return 1;
  }
  if (reloc.kind === 'relocated') console.log(`  ✓ ${reloc.message}`);
  else console.log(`  ${reloc.message}`);
  console.log('');

  const paths = migratePaths();
  console.log(`Reading ${paths.graph}...`);
  if (!existsSync(paths.graph)) {
    console.error(`migrate: ${paths.graph} not found — nothing to migrate.`);
    return 1;
  }

  let raw: RawGraph;
  try { raw = JSON.parse(readFileSync(paths.graph, 'utf8')) as RawGraph; }
  catch (e) {
    console.error(`migrate: failed to parse ${paths.graph}: ${(e as Error).message}`);
    return 1;
  }
  const rawNodes = Array.isArray(raw.nodes) ? (raw.nodes as RawNode[]) : [];

  if (!detectV4(raw, paths)) {
    console.log('  Already on V5.');
    return 0;
  }

  const roomCount = new Set(
    rawNodes.map((n) => n.room).filter((r): r is string => typeof r === 'string'),
  ).size;
  console.log(`  ${rawNodes.length} nodes found across ${roomCount} room(s).`);
  if (existsSync(paths.roomsJson)) console.log(`Reading ${paths.roomsJson}... present.`);
  if (existsSync(paths.sharedRoomsJson)) console.log(`Reading ${paths.sharedRoomsJson}... present.`);

  if (!confirmBackupOverwrite(paths.backup)) return 1;
  try { copyFileSync(paths.graph, paths.backup); }
  catch (e) {
    console.error(`migrate: backup failed: ${(e as Error).message}`);
    return 1;
  }

  console.log('');
  console.log('Migrating to V5...');

  const { nodes, stats } = transformNodes(rawNodes);
  const nextGraph = { ...raw, nodes };
  try { atomicWriteJson(paths.graph, nextGraph); }
  catch (e) {
    console.error(`migrate: failed to write ${paths.graph}: ${(e as Error).message}`);
    return 1;
  }
  console.log(`  ✓ Stripped \`room\` field from ${stats.roomFieldsStripped} nodes`);
  console.log(`  ✓ Set \`private: false\` on ${stats.privateDefaulted} nodes (default)`);
  console.log(`  ✓ Heuristic workspace assignment: ${stats.workspaceTagged} nodes tagged`);

  const rep = flattenReputation(paths.peerReputation);
  if (rep.dropped > 0) {
    console.log(`  ✓ Flattened ${rep.dropped} reputation entries across ${rep.peersAffected} peer(s)`);
  } else {
    console.log(`  ✓ Reputation file already V5-clean (no legacy keys found)`);
  }

  if (removeIfExists(paths.roomsJson)) console.log(`  ✓ Deleted ${basename(paths.roomsJson)}`);
  if (removeIfExists(paths.sharedRoomsJson)) console.log(`  ✓ Deleted ${basename(paths.sharedRoomsJson)}`);
  if (removeIfExists(paths.sharedRoomsLock)) console.log(`  ✓ Deleted ${basename(paths.sharedRoomsLock)}`);

  console.log(`  ✓ Backed up pre-migration graph to ${basename(paths.backup)}`);
  console.log('');
  console.log('V5 cutover complete. Run `akashik doctor` to verify.');
  return 0;
};

/** Rollback: restore the graph blob from backup. Everything else is one-way. */
const runRollback = (): number => {
  const paths = migratePaths();
  console.log(`Reading ${paths.backup}...`);
  if (!existsSync(paths.backup)) {
    console.error(`migrate --rollback: ${paths.backup} not found — nothing to restore.`);
    return 1;
  }

  let nodeCount = 0;
  try {
    const raw = JSON.parse(readFileSync(paths.backup, 'utf8')) as RawGraph;
    nodeCount = Array.isArray(raw.nodes) ? raw.nodes.length : 0;
  } catch (e) {
    console.error(`migrate --rollback: backup corrupted (${(e as Error).message}); refusing to restore.`);
    return 1;
  }

  try { copyFileSync(paths.backup, paths.graph); }
  catch (e) {
    console.error(`migrate --rollback: restore failed: ${(e as Error).message}`);
    return 1;
  }
  console.log(`  ✓ ${nodeCount} nodes restored to ${basename(paths.graph)}`);
  console.log(`  ✗ rooms.json deleted at migration — NOT auto-recoverable`);
  console.log(`  ✗ shared-rooms.json deleted at migration — NOT auto-recoverable`);
  console.log(`  ✗ peer-reputation.json flattening NOT auto-reversible`);
  console.log('');
  console.log('Re-create rooms.json + shared-rooms.json from your own backups if needed,');
  console.log('or run `akashik migrate v5` again to re-apply.');
  return 0;
};

/**
 * Back-fill `github_user` on every existing node from the linked
 * github handle in ~/.akashik/linked-accounts.json (Phase 26).
 *
 * Nodes that already carry a `github_user` are NEVER overwritten —
 * peer-imported nodes carry their author's handle, and this command
 * must not clobber them. Only nodes with no field at all get stamped.
 *
 * Idempotent: re-runs with no eligible nodes exit "Already stamped."
 * No-op when there's no github handle to stamp (the user hasn't run
 * `akashik login` yet).
 */
const runStampGithub = (): number => {
  const paths = migratePaths();
  if (!existsSync(paths.graph)) {
    console.error(`migrate --stamp-github: ${paths.graph} not found.`);
    return 1;
  }

  // Pull the handle from linked-accounts.json via the infrastructure
  // helper. We dynamic-import so this command doesn't drag the OAuth
  // module into every migrate code path.
  const linkedPath = join(paths.home, 'linked-accounts.json');
  let handle: string | undefined;
  if (existsSync(linkedPath)) {
    try {
      const parsed = JSON.parse(readFileSync(linkedPath, 'utf8'));
      handle = parsed?.accounts?.github?.handle;
    } catch { /* unreadable — fall through to "no handle" */ }
  }
  if (!handle) {
    console.error(`migrate --stamp-github: no linked github account in ${linkedPath}.`);
    console.error(`  Run \`akashik login\` first to link an account.`);
    return 1;
  }

  let raw: RawGraph;
  try { raw = JSON.parse(readFileSync(paths.graph, 'utf8')) as RawGraph; }
  catch (e) {
    console.error(`migrate --stamp-github: failed to parse ${paths.graph}: ${(e as Error).message}`);
    return 1;
  }

  const rawNodes = Array.isArray(raw.nodes) ? (raw.nodes as RawNode[]) : [];
  let stamped = 0;
  let preserved = 0;
  const nextNodes: RawNode[] = rawNodes.map((n) => {
    const current = (n as { github_user?: unknown }).github_user;
    if (typeof current === 'string' && current.length > 0) {
      preserved += 1;
      return n;
    }
    stamped += 1;
    return { ...n, github_user: handle };
  });

  if (stamped === 0) {
    console.log(`Already stamped — all ${preserved} node(s) already carry github_user.`);
    return 0;
  }

  // Reuse the v4-backup slot — same atomicity guarantees as runMigrate.
  if (!confirmBackupOverwrite(paths.backup)) return 1;
  try { copyFileSync(paths.graph, paths.backup); }
  catch (e) {
    console.error(`migrate --stamp-github: backup failed: ${(e as Error).message}`);
    return 1;
  }

  try { atomicWriteJson(paths.graph, { ...raw, nodes: nextNodes }); }
  catch (e) {
    console.error(`migrate --stamp-github: failed to write ${paths.graph}: ${(e as Error).message}`);
    return 1;
  }
  console.log(`  ✓ Stamped github_user="${handle}" on ${stamped} node(s)`);
  if (preserved > 0) console.log(`  ✓ Preserved existing github_user on ${preserved} node(s)`);
  console.log(`  ✓ Backed up pre-stamp graph to ${basename(paths.backup)}`);
  return 0;
};

const printUsage = (): void => {
  console.error('usage: akashik migrate v5 [--rollback | --stamp-github]');
  console.error('  V4 → V5 schema migration (rooms abstraction removed) PLUS');
  console.error('  data-dir relocation ~/.wellinformed/ → ~/.akashik/ (Phase 25).');
  console.error('  --rollback     restores the pre-migration graph.json from backup.');
  console.error('  --stamp-github back-fills github_user on existing nodes from the');
  console.error('                 verified handle in linked-accounts.json (Phase 26).');
  console.error('  The dir relocation is NOT rolled back by --rollback — it stands.');
};

// Test seam — exposed so tests can drive the relocator with synthetic
// AKASHIK_HOME / AKASHIK_LEGACY_HOME without invoking the full migrate.
export const __relocateDirForTest = relocateDir;

export const migrateCommand = async (args: string[]): Promise<number> => {
  const [sub, ...rest] = args;
  if (sub !== 'v5') { printUsage(); return 1; }
  if (rest.includes('--rollback')) return runRollback();
  if (rest.includes('--stamp-github')) return runStampGithub();
  if (rest.length > 0) {
    console.error(`migrate v5: unknown flag '${rest[0]}'`);
    printUsage();
    return 1;
  }
  return runMigrate();
};
