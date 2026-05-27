/**
 * `wellinformed unshare <peer>` — V5 peer-removal command.
 *
 * Removes a peer from peers.json so the daemon's share-sync tick stops
 * opening outbound streams to it. The peer's locally-imported nodes are
 * kept in the graph (they're already on disk and harmless once cut off).
 *
 * Per-topic unsharing does not exist in V5 — to stop sharing a specific
 * node, mark it `private: true` via `wellinformed save --private`.
 */
import { join } from 'node:path';
import { formatError } from '../../domain/errors.js';
import { loadPeers, mutatePeers, removePeerRecord } from '../../infrastructure/peer-store.js';
import { wellinformedHome } from '../runtime.js';

const peersPath = (): string => join(wellinformedHome(), 'peers.json');

const USAGE = `usage: wellinformed unshare <peer-id>

Removes the peer from peers.json so the daemon stops syncing to it.
Locally-imported nodes from that peer are retained.`;

export const unshare = async (args: readonly string[]): Promise<number> => {
  const peerId = args[0];
  if (!peerId) {
    console.error('unshare: missing <peer-id>');
    console.error(USAGE);
    return 1;
  }
  const peersResult = await loadPeers(peersPath());
  if (peersResult.isErr()) {
    console.error(`unshare: ${formatError(peersResult.error)}`);
    return 1;
  }
  if (!peersResult.value.peers.some((p) => p.id === peerId)) {
    console.log(`unshare: '${peerId}' is not in peers.json (no-op)`);
    return 0;
  }
  const mutResult = await mutatePeers(peersPath(), (current) => removePeerRecord(current, peerId));
  if (mutResult.isErr()) {
    console.error(`unshare: ${formatError(mutResult.error)}`);
    return 1;
  }
  console.log(`unshare '${peerId}': removed from peers.json`);
  console.log("  restart the daemon (`wellinformed daemon stop && start`) to close any active share streams");
  return 0;
};
