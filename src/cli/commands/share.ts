/**
 * `wellinformed share <sub>` — sharing boundary commands.
 *
 * Subcommands:
 *   audit --room <name> [--json]   show what would be shared (allowed + blocked nodes)
 *
 * Phase 16 will add: room <name> (enable sharing), unshare <name>.
 */

import { join } from 'node:path';
import { formatError } from '../../domain/errors.js';
import { auditRoom, buildPatterns } from '../../domain/sharing.js';
import { nodesInRoom } from '../../domain/graph.js';
import { loadConfig } from '../../infrastructure/config-loader.js';
import { fileGraphRepository } from '../../infrastructure/graph-repository.js';
import { runtimePaths, wellinformedHome } from '../runtime.js';

const configPath = (): string => join(wellinformedHome(), 'config.yaml');

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

// ─────────────────────── usage ────────────────────────────

const USAGE = `usage: wellinformed share <audit>

subcommands:
  audit --room <name> [--json]   show what would be shared before enabling

future (Phase 16):
  room <name>                    mark a room as shared
  unshare <name>                 make a room private again`;

// ─────────────────────── entry ────────────────────────────

export const share = async (args: string[]): Promise<number> => {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'audit': return audit(rest);
    default:
      console.error(sub ? `share: unknown subcommand '${sub}'` : 'share: missing subcommand');
      console.error(USAGE);
      return 1;
  }
};
