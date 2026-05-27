/**
 * `wellinformed share <peer>` — V5 peer-only share command.
 *
 * Every graph node where `private === false` is shareable. There is no
 * per-topic flag and no shared-rooms.json. To stop sharing a node, mark
 * it private; to stop sharing with a peer, `wellinformed unshare <peer>`.
 *
 * Flow: audit the shareable subset against the secrets-scanner
 * (Phase 15 SEC-01 — hard block on flagged content), print a summary,
 * then (unless --audit-only) persist the peerId to peers.json so the
 * daemon's share-sync tick picks it up.
 */

import { join } from 'node:path';
import { formatError, formatErrorWithHint, type ScanMatch } from '../../domain/errors.js';
import { scanNode, buildPatterns, type ShareableNode } from '../../domain/sharing.js';
import type { GraphNode } from '../../domain/graph.js';
import { loadConfig } from '../../infrastructure/config-loader.js';
import { fileGraphRepository } from '../../infrastructure/graph-repository.js';
import { runtimePaths, wellinformedHome } from '../runtime.js';
import { mutatePeers, addPeerRecord, loadPeers } from '../../infrastructure/peer-store.js';

// Local batch wrapper around scanNode — V5 share surface operates on
// the whole graph filtered by `private === false`, not on per-topic batches.
const auditNodes = (
  nodes: readonly GraphNode[],
  patterns: ReturnType<typeof buildPatterns>,
): { allowed: ShareableNode[]; blocked: Array<{ nodeId: string; matches: readonly ScanMatch[] }> } => {
  const allowed: ShareableNode[] = [];
  const blocked: Array<{ nodeId: string; matches: readonly ScanMatch[] }> = [];
  for (const node of nodes) {
    const r = scanNode(node, patterns);
    if (r.isOk()) allowed.push(r.value);
    else blocked.push({ nodeId: node.id, matches: r.error.matches });
  }
  return { allowed, blocked };
};

const configPath = (): string => join(wellinformedHome(), 'config.yaml');
const peersPath = (): string => join(wellinformedHome(), 'peers.json');

const USAGE = `usage: wellinformed share <peer-id> [--audit-only] [--json]

Shares every graph node where \`private === false\` with the given peer.
The peer must already be reachable (run \`wellinformed peer add <multiaddr>\`
first if it is not yet in peers.json). Sharing is gated by the secrets
scanner — any node containing tokens or keys is hard-blocked.

flags:
  --audit-only   show what would be shared without persisting the share intent
  --json         emit the audit summary as JSON`;

interface ParsedArgs {
  readonly peerId: string;
  readonly auditOnly: boolean;
  readonly json: boolean;
}

const parseArgs = (args: readonly string[]): ParsedArgs | { readonly error: string } => {
  let peerId: string | undefined;
  let auditOnly = false;
  let json = false;
  for (const arg of args) {
    if (arg === '--audit-only') auditOnly = true;
    else if (arg === '--json') json = true;
    else if (arg.startsWith('--')) return { error: `unknown flag '${arg}'` };
    else if (peerId === undefined) peerId = arg;
    else return { error: `unexpected positional '${arg}'` };
  }
  if (!peerId) return { error: 'missing <peer-id>' };
  return { peerId, auditOnly, json };
};

export const share = async (args: readonly string[]): Promise<number> => {
  const parsed = parseArgs(args);
  if ('error' in parsed) {
    console.error(`share: ${parsed.error}`);
    console.error(USAGE);
    return 1;
  }

  const configResult = await loadConfig(configPath());
  if (configResult.isErr()) {
    console.error(`share: ${formatErrorWithHint(configResult.error)}`);
    return 1;
  }
  const cfg = configResult.value;

  const paths = runtimePaths();
  const graphRepo = fileGraphRepository(paths.graph);
  const graphResult = await graphRepo.load();
  if (graphResult.isErr()) {
    console.error(`share: ${formatErrorWithHint(graphResult.error)}`);
    return 1;
  }
  const graph = graphResult.value;

  // V5 share gate: node.private === false. Nodes with the field absent
  // default to non-private (per ROOMS-DEL-03 migration semantics), so the
  // filter is "not explicitly private".
  const totalNodes = graph.json.nodes.length;
  const candidateNodes = graph.json.nodes.filter((n) => n.private !== true);
  const privateNodes = totalNodes - candidateNodes.length;

  const patterns = buildPatterns(cfg.security.secrets_patterns);
  const result = auditNodes(candidateNodes, patterns);

  if (parsed.json) {
    console.log(JSON.stringify({
      peer: parsed.peerId,
      total: totalNodes,
      private_skipped: privateNodes,
      would_share: result.allowed.length,
      blocked: result.blocked.length,
      blocked_nodes: result.blocked,
    }, null, 2));
  } else {
    console.log(`share <- ${parsed.peerId}:`);
    console.log(`  graph nodes:       ${totalNodes}`);
    console.log(`  private (skipped): ${privateNodes}`);
    console.log(`  would share:       ${result.allowed.length}`);
    console.log(`  blocked (secrets): ${result.blocked.length}`);
    if (result.blocked.length > 0) {
      console.log(`\nBLOCKED (${result.blocked.length}):`);
      for (const b of result.blocked) {
        const reasons = b.matches.map((m) => `${m.field}:${m.patternName}`).join(', ');
        console.log(`  ${b.nodeId.slice(0, 12).padEnd(14)} [${reasons}]`);
      }
    }
  }

  if (parsed.auditOnly) return 0;
  if (result.blocked.length > 0) {
    console.error(`\nshare: refusing — ${result.blocked.length} node(s) contain secrets. Mark them private (\`wellinformed save --private\`) or remove them before sharing.`);
    return 1;
  }

  // Persist the share intent: ensure the peer is in peers.json so the
  // daemon's share-sync tick will key an outbound stream against it.
  const peersResult = await loadPeers(peersPath());
  if (peersResult.isErr()) {
    console.error(`share: ${formatError(peersResult.error)}`);
    return 1;
  }
  const existing = peersResult.value.peers.find((p) => p.id === parsed.peerId);
  const mutResult = await mutatePeers(peersPath(), (current) => addPeerRecord(current, {
    id: parsed.peerId,
    addrs: existing?.addrs ?? [],
    addedAt: existing?.addedAt ?? new Date().toISOString(),
  }));
  if (mutResult.isErr()) {
    console.error(`share: ${formatError(mutResult.error)}`);
    return 1;
  }
  console.log(`\nshare intent recorded for ${parsed.peerId}. Restart the daemon (\`wellinformed daemon stop && start\`) so it picks up the new share target.`);
  return 0;
};
