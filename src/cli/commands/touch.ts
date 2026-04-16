/**
 * `wellinformed touch <peer-id-or-multiaddr> --room <name> [--max N] [--dry-run]`
 *
 * Asymmetric P2P pull — ask the remote peer for every node they publish
 * in <name>, receive them with server-side secret redaction, merge into
 * the local graph (dry-run prints + discards).
 *
 * Unlike `share room`, no local publishing is required — this is a
 * one-direction read. The peer may still refuse if the room isn't shared
 * on their side.
 *
 * Uses a short-lived libp2p node (same pattern as `peer add`) so it works
 * whether or not the daemon is running.
 */

import { join } from 'node:path';
import { wellinformedHome } from '../runtime.js';
import {
  loadOrCreateIdentity,
  createNode,
  dialAndTag,
} from '../../infrastructure/peer-transport.js';
import { loadConfig } from '../../infrastructure/config-loader.js';
import { loadPeers } from '../../infrastructure/peer-store.js';
import { formatError } from '../../domain/errors.js';
import { fileGraphRepository } from '../../infrastructure/graph-repository.js';
import { openTouchStream } from '../../infrastructure/touch-protocol.js';
import { TOUCH_MAX_NODES } from '../../domain/touch.js';
import { upsertNode } from '../../domain/graph.js';
import type { Graph, GraphNode } from '../../domain/graph.js';

const identityPath = (): string => join(wellinformedHome(), 'peer-identity.json');
const peersPath = (): string => join(wellinformedHome(), 'peers.json');
const configPath = (): string => join(wellinformedHome(), 'config.yaml');
const graphPath = (): string => join(wellinformedHome(), 'graph.json');

interface TouchArgs {
  readonly target: string;
  readonly room: string;
  readonly maxNodes: number;
  readonly dryRun: boolean;
}

const parseArgs = (rest: readonly string[]): TouchArgs | string => {
  if (rest.length === 0) {
    return 'touch: missing <peer-id-or-multiaddr>. usage: wellinformed touch <peer> --room <name> [--max N] [--dry-run]';
  }
  const target = rest[0];
  const flags = rest.slice(1);
  let room: string | undefined;
  let maxNodes: number = TOUCH_MAX_NODES;
  let dryRun = false;
  for (let i = 0; i < flags.length; i++) {
    const f = flags[i];
    if (f === '--room') { room = flags[++i]; continue; }
    if (f === '--max')  { maxNodes = parseInt(flags[++i], 10); continue; }
    if (f === '--dry-run') { dryRun = true; continue; }
    return `touch: unknown flag '${f}'`;
  }
  if (!room) return 'touch: --room <name> is required';
  if (!Number.isFinite(maxNodes) || maxNodes <= 0) return 'touch: --max must be a positive integer';
  return { target, room, maxNodes, dryRun };
};

/**
 * Resolve a user-supplied target into (peerId, addr) for dialAndTag.
 * Two shapes accepted:
 *   1. Full multiaddr "/ip4/.../p2p/12D3..."
 *   2. Bare peer id "12D3..." — looked up in peers.json
 */
const resolveTarget = async (
  target: string,
): Promise<{ peerId: string; addr: string } | string> => {
  if (target.startsWith('/')) {
    const m = target.match(/\/p2p\/([^/]+)$/);
    if (!m) return `touch: multiaddr missing /p2p/<peerId> suffix: ${target}`;
    return { peerId: m[1], addr: target };
  }
  const peersRes = await loadPeers(peersPath());
  if (peersRes.isErr()) return `touch: ${formatError(peersRes.error)}`;
  const rec = peersRes.value.peers.find((p) => p.id === target);
  if (!rec || rec.addrs.length === 0) return `touch: peer '${target}' not found in peers.json (add via 'wellinformed peer add <multiaddr>' first)`;
  return { peerId: rec.id, addr: rec.addrs[0] };
};

const mergeNodes = (graph: Graph, nodes: readonly GraphNode[]): { next: Graph; added: number; updated: number } => {
  let added = 0;
  let updated = 0;
  const next = nodes.reduce<Graph>((acc, n) => {
    const had = acc.nodeById.has(n.id);
    const res = upsertNode(acc, n);
    if (res.isErr()) return acc;
    if (had) updated++; else added++;
    return res.value;
  }, graph);
  return { next, added, updated };
};

export const touch = async (rest: readonly string[]): Promise<number> => {
  const parsed = parseArgs(rest);
  if (typeof parsed === 'string') {
    console.error(parsed);
    return 1;
  }

  const resolved = await resolveTarget(parsed.target);
  if (typeof resolved === 'string') {
    console.error(resolved);
    return 1;
  }

  const cfgRes = await loadConfig(configPath());
  if (cfgRes.isErr()) {
    console.error(`touch: ${formatError(cfgRes.error)}`);
    return 1;
  }

  const idRes = await loadOrCreateIdentity(identityPath());
  if (idRes.isErr()) {
    console.error(`touch: ${formatError(idRes.error)}`);
    return 1;
  }

  // CLI dialer uses an ephemeral port — the fixed peer.port is reserved for
  // the daemon listener, and binding it twice causes EADDRINUSE when the
  // daemon is already running. listenHost stays on 127.0.0.1 since the CLI
  // only initiates outbound connections and does not need to accept dials.
  const nodeRes = await createNode(idRes.value, {
    listenPort: 0,
    listenHost: '127.0.0.1',
  });
  if (nodeRes.isErr()) {
    console.error(`touch: ${formatError(nodeRes.error)}`);
    return 1;
  }
  const node = nodeRes.value;

  try {
    const dialRes = await dialAndTag(node, resolved.addr);
    if (dialRes.isErr()) {
      console.error(`touch: dial failed: ${formatError(dialRes.error)}`);
      return 1;
    }

    const streamRes = await openTouchStream(node, resolved.peerId, parsed.room, parsed.maxNodes);
    if (streamRes.isErr()) {
      console.error(`touch: ${formatError(streamRes.error)}`);
      return 1;
    }
    const { nodes, redactions_applied } = streamRes.value;

    console.log(
      `touch: peer ${resolved.peerId} returned ${nodes.length} node(s) from room '${parsed.room}'${redactions_applied > 0 ? ` (${redactions_applied} redaction${redactions_applied === 1 ? '' : 's'} applied server-side)` : ''}`,
    );

    if (parsed.dryRun) {
      for (const n of nodes.slice(0, 10)) {
        console.log(`  ${n.id}  ${n.label.slice(0, 80)}`);
      }
      if (nodes.length > 10) console.log(`  ...and ${nodes.length - 10} more`);
      return 0;
    }

    if (nodes.length === 0) return 0;

    const repo = fileGraphRepository(graphPath());
    const graphRes = await repo.load();
    if (graphRes.isErr()) {
      console.error(`touch: ${formatError(graphRes.error)}`);
      return 1;
    }

    const { next, added, updated } = mergeNodes(graphRes.value, nodes);
    const saveRes = await repo.save(next);
    if (saveRes.isErr()) {
      console.error(`touch: save failed: ${formatError(saveRes.error)}`);
      return 1;
    }
    console.log(`touch: merged — ${added} new, ${updated} updated`);
    return 0;
  } finally {
    await node.stop();
  }
};
