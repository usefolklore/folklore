/**
 * `wellinformed share <sub>` — sharing boundary commands.
 *
 * Subcommands:
 *   audit --room <name> [--json]   show what would be shared (allowed + blocked nodes)
 *   room <name>                    mark a room as shared (runs audit; blocks on flagged nodes)
 */

import { join } from 'node:path';
import { formatError } from '../../domain/errors.js';
import { auditRoom, buildPatterns } from '../../domain/sharing.js';
import { nodesInRoom } from '../../domain/graph.js';
import { loadConfig } from '../../infrastructure/config-loader.js';
import { fileGraphRepository } from '../../infrastructure/graph-repository.js';
import { runtimePaths, wellinformedHome } from '../runtime.js';
import { mutateSharedRooms, addSharedRoom, loadSharedRooms } from '../../infrastructure/share-store.js';
import { loadYDoc, saveYDoc } from '../../infrastructure/ydoc-store.js';
import { syncNodeIntoYDoc } from '../../infrastructure/share-sync.js';

const configPath = (): string => join(wellinformedHome(), 'config.yaml');
const sharedRoomsPath = (): string => join(wellinformedHome(), 'shared-rooms.json');

// ─────────────────────── subcommands ──────────────────────

const audit = async (rest: readonly string[]): Promise<number> => {
  let roomId: string | undefined;
  let jsonOutput = false;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--room' && i + 1 < rest.length) {
      roomId = rest[++i];
    } else if (rest[i] === '--json') {
      jsonOutput = true;
    }
  }

  if (!roomId) {
    console.error(
      'share audit: missing --room <name>. usage: wellinformed share audit --room <name> [--json]',
    );
    return 1;
  }

  const configResult = await loadConfig(configPath());
  if (configResult.isErr()) {
    console.error(`share audit: ${formatError(configResult.error)}`);
    return 1;
  }
  const cfg = configResult.value;

  const paths = runtimePaths();
  const graphRepo = fileGraphRepository(paths.graph);
  const graphResult = await graphRepo.load();
  if (graphResult.isErr()) {
    console.error(`share audit: ${formatError(graphResult.error)}`);
    return 1;
  }
  const graph = graphResult.value;

  const roomNodes = nodesInRoom(graph, roomId);
  if (roomNodes.length === 0) {
    console.log(`share audit: room '${roomId}' has no nodes.`);
    return 0;
  }

  const patterns = buildPatterns(cfg.security.secrets_patterns);
  const result = auditRoom(roomNodes, patterns);

  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          room: roomId,
          total: roomNodes.length,
          allowed: result.allowed.length,
          blocked: result.blocked.length,
          allowed_nodes: result.allowed,
          blocked_nodes: result.blocked,
        },
        null,
        2,
      ),
    );
    return 0;
  }

  console.log(`share audit for room '${roomId}':`);
  console.log(`  total nodes:   ${roomNodes.length}`);
  console.log(`  would share:   ${result.allowed.length}`);
  console.log(`  blocked:       ${result.blocked.length}`);

  if (result.allowed.length > 0) {
    console.log(`\nallowed (${result.allowed.length}):`);
    for (const node of result.allowed) {
      const uri = node.source_uri ? ` (${node.source_uri})` : '';
      console.log(`  ${node.id.slice(0, 12).padEnd(14)} ${node.label.slice(0, 60)}${uri}`);
    }
  }

  if (result.blocked.length > 0) {
    console.log(`\nBLOCKED (${result.blocked.length}):`);
    for (const b of result.blocked) {
      const reasons = b.matches.map((m) => `${m.field}:${m.patternName}`).join(', ');
      console.log(`  ${b.nodeId.slice(0, 12).padEnd(14)} [${reasons}]`);
    }
  }

  return 0;
};

// ─────────────────────── share room <name> ───────────────

const roomCmd = async (rest: readonly string[]): Promise<number> => {
  const roomId = rest[0];
  if (!roomId) {
    console.error('share room: missing <name>. usage: wellinformed share room <name>');
    return 1;
  }

  // Phase 20 — Defence-in-depth: hard-refuse the `sessions` room.
  // Check 1: hardcoded literal — catches the case where shared-rooms.json
  //   is absent, corrupt, or the flag was somehow stripped.
  if (roomId === 'sessions') {
    console.error(
      `share room 'sessions': refused — the sessions room contains personal Claude Code transcripts and is marked non-shareable. Session data must never cross libp2p.`,
    );
    return 1;
  }

  // Check 2: persisted shareable flag — catches any non-shareable room
  //   (not just `sessions`) that was explicitly flagged in share-store.
  const existingSharedRes = await loadSharedRooms(sharedRoomsPath());
  if (existingSharedRes.isOk()) {
    const existing = existingSharedRes.value.rooms.find((r) => r.name === roomId);
    if (existing && existing.shareable === false) {
      console.error(
        `share room '${roomId}': refused — room is marked non-shareable (shared-rooms.json).`,
      );
      return 1;
    }
  }

  const configResult = await loadConfig(configPath());
  if (configResult.isErr()) {
    console.error(`share room: ${formatError(configResult.error)}`);
    return 1;
  }
  const cfg = configResult.value;

  const paths = runtimePaths();
  const graphRepo = fileGraphRepository(paths.graph);
  const graphResult = await graphRepo.load();
  if (graphResult.isErr()) {
    console.error(`share room: ${formatError(graphResult.error)}`);
    return 1;
  }
  const graph = graphResult.value;

  // SECRETS GATE — auditRoom must pass before adding the room to the registry.
  // This is the SHARE-01 hard-block (no override, mirrors `share audit` semantics).
  const roomNodes = nodesInRoom(graph, roomId);
  const patterns = buildPatterns(cfg.security.secrets_patterns);
  const auditRes = auditRoom(roomNodes, patterns);

  if (auditRes.blocked.length > 0) {
    console.error(`share room: BLOCKED — ${auditRes.blocked.length} node(s) in room '${roomId}' contain secrets`);
    for (const b of auditRes.blocked) {
      const reasons = b.matches.map((m) => `${m.field}:${m.patternName}`).join(', ');
      console.error(`  ${b.nodeId.slice(0, 12).padEnd(14)} [${reasons}]`);
    }
    console.error(`\nrun 'wellinformed share audit --room ${roomId}' for full details.`);
    return 1;
  }

  // Persist to shared-rooms.json under cross-process lock.
  const record: import('../../infrastructure/share-store.js').SharedRoomRecord = {
    name: roomId,
    sharedAt: new Date().toISOString(),
    shareable: true,
  };
  const writeResult = await mutateSharedRooms(sharedRoomsPath(), (file) =>
    addSharedRoom(file, record),
  );
  if (writeResult.isErr()) {
    console.error(`share room: ${formatError(writeResult.error)}`);
    return 1;
  }

  // SHARE-04 — populate the Y.Doc with existing room nodes so peers see content
  // on the FIRST sync, not just future ingests. Loads the room's Y.Doc (or creates
  // one), iterates the allowed GraphNode objects (full node, not the ShareableNode
  // projection) and calls syncNodeIntoYDoc which applies the secrets gate internally.
  // saveYDoc commits the populated state.
  // syncNodeIntoYDoc enforces the SHARE-04 metadata boundary: only ShareableNode
  // keys propagate. Raw source text never enters the Y.Doc.
  const allowedIds = new Set(auditRes.allowed.map((s) => s.id));
  const allowedNodes = roomNodes.filter((n) => allowedIds.has(n.id));
  const ydocPath = join(wellinformedHome(), 'ydocs', `${roomId}.ydoc`);
  const logPath = join(wellinformedHome(), 'share-log.jsonl');
  const ydocLoad = await loadYDoc(ydocPath);
  if (ydocLoad.isErr()) {
    console.error(`share room: ${formatError(ydocLoad.error)}`);
    return 1;
  }
  const ydoc = ydocLoad.value;
  for (const node of allowedNodes) {
    const populated = await syncNodeIntoYDoc(ydoc, node, patterns, logPath, 'local', roomId);
    if (populated.isErr()) {
      console.error(`share room: failed to seed Y.Doc for node ${node.id}: ${formatError(populated.error)}`);
      return 1;
    }
  }
  const ydocSave = await saveYDoc(ydocPath, ydoc);
  if (ydocSave.isErr()) {
    console.error(`share room: ${formatError(ydocSave.error)}`);
    return 1;
  }

  const noun = auditRes.allowed.length === 1 ? 'node' : 'nodes';
  if (auditRes.allowed.length === 0) {
    console.log(`share room '${roomId}': now public (0 nodes — empty room recorded for future sync)`);
  } else {
    console.log(`share room '${roomId}': now public (${auditRes.allowed.length} ${noun} shareable)`);
  }
  console.log("  run 'wellinformed daemon start' (or restart it) so peers can sync this room");
  return 0;
};

// ─────────────────────── usage ────────────────────────────

const USAGE = `usage: wellinformed share <audit|room>

subcommands:
  audit --room <name> [--json]   show what would be shared before enabling
  room <name>                    mark a room as shared (runs audit; blocks on flagged nodes)`;

// ─────────────────────── entry ────────────────────────────

export const share = async (args: string[]): Promise<number> => {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'audit': return audit(rest);
    case 'room':  return roomCmd(rest);
    default:
      console.error(sub ? `share: unknown subcommand '${sub}'` : 'share: missing subcommand');
      console.error(USAGE);
      return 1;
  }
};
