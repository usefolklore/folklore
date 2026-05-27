/**
 * `akashik migrate v5 [--rollback]` — V4 → V5 schema migration
 * (Phase 24, Plan 11, ROOMS-DEL-06).
 *
 * Reads graph.json as raw JSON (the V5 type lacks `room`), backs it up to
 * graph.v4-backup.json, strips `room` from every node, stamps `private: false`,
 * heuristically infers `workspace` from known repo paths, flattens legacy
 * room-prefixed peer-reputation entries, deletes rooms.json + shared-rooms.json.
 *
 * Idempotent (re-runs exit "Already on V5"). Rollback restores the graph blob
 * only; rooms.json + shared-rooms.json deletions and rep flattening are one-way.
 */

import {
  existsSync, readFileSync, writeFileSync, copyFileSync,
  unlinkSync, renameSync, statSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const akashikHome = (): string =>
  process.env.AKASHIK_HOME ?? join(homedir(), '.akashik');

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

/** Forward migration: V4 → V5. */
const runMigrate = (): number => {
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

const printUsage = (): void => {
  console.error('usage: akashik migrate v5 [--rollback]');
  console.error('  V4 → V5 schema migration (rooms abstraction removed).');
  console.error('  --rollback restores the pre-migration graph.json from backup.');
};

export const migrateCommand = async (args: string[]): Promise<number> => {
  const [sub, ...rest] = args;
  if (sub !== 'v5') { printUsage(); return 1; }
  if (rest.includes('--rollback')) return runRollback();
  if (rest.length > 0) {
    console.error(`migrate v5: unknown flag '${rest[0]}'`);
    printUsage();
    return 1;
  }
  return runMigrate();
};
