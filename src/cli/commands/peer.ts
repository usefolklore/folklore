/**
 * `wellinformed peer <sub>` — manage P2P peer connections.
 *
 * Subcommands:
 *   add <multiaddr>   connect to a remote peer and persist to peers.json
 *   remove <id>       remove a peer from peers.json
 *   list              show known peers (stored only — live status/latency in Phase 18)
 *   status            show own PeerId, public key, and known peer count
 */

import { join } from 'node:path';
import { formatError } from '../../domain/errors.js';
import { isMultiaddrShaped } from '../../domain/peer.js';
import {
  loadOrCreateIdentity,
  createNode,
  dialAndTag,
} from '../../infrastructure/peer-transport.js';
import {
  loadPeers,
  mutatePeers,
  addPeerRecord,
  removePeerRecord,
} from '../../infrastructure/peer-store.js';
import { loadConfig } from '../../infrastructure/config-loader.js';
import { wellinformedHome } from '../runtime.js';

const identityPath = (): string => join(wellinformedHome(), 'peer-identity.json');
const peersPath = (): string => join(wellinformedHome(), 'peers.json');
const configPath = (): string => join(wellinformedHome(), 'config.yaml');

// ─────────────────────── subcommands ──────────────────────

const add = async (rest: readonly string[]): Promise<number> => {
  if (rest.length === 0) {
    console.error('peer add: missing <multiaddr>. usage: wellinformed peer add /ip4/1.2.3.4/tcp/9001');
    return 1;
  }
  const rawAddr = rest[0];
  if (!isMultiaddrShaped(rawAddr)) {
    console.error(`peer add: '${rawAddr}' does not look like a multiaddr (must start with /)`);
    return 1;
  }

  const configResult = await loadConfig(configPath());
  if (configResult.isErr()) {
    console.error(`peer add: ${formatError(configResult.error)}`);
    return 1;
  }
  const cfg = configResult.value;

  const idResult = await loadOrCreateIdentity(identityPath());
  if (idResult.isErr()) {
    console.error(`peer add: ${formatError(idResult.error)}`);
    return 1;
  }

  const nodeResult = await createNode(idResult.value, {
    listenPort: cfg.peer.port,
    listenHost: cfg.peer.listen_host,
  });
  if (nodeResult.isErr()) {
    console.error(`peer add: ${formatError(nodeResult.error)}`);
    return 1;
  }
  const node = nodeResult.value;

  try {
    const dialResult = await dialAndTag(node, rawAddr);
    if (dialResult.isErr()) {
      console.error(`peer add: ${formatError(dialResult.error)}`);
      return 1;
    }
    const peerId = dialResult.value;

    // Use mutatePeers for a locked read-modify-write transaction so two
    // concurrent `peer add` invocations cannot clobber each other.
    let wasExisting = false;
    const mutateResult = await mutatePeers(peersPath(), (current) => {
      const existing = current.peers.find((p) => p.id === peerId);
      wasExisting = existing !== undefined;
      return addPeerRecord(current, {
        id: peerId,
        addrs: [rawAddr],
        addedAt: existing?.addedAt ?? new Date().toISOString(),
      });
    });
    if (mutateResult.isErr()) {
      console.error(`peer add: ${formatError(mutateResult.error)}`);
      return 1;
    }

    if (wasExisting) {
      console.log(`updated addrs for existing peer ${peerId}`);
    } else {
      console.log(`added peer ${peerId}`);
    }
    console.log(`  addr: ${rawAddr}`);
    return 0;
  } finally {
    await node.stop();
  }
};

const remove = async (rest: readonly string[]): Promise<number> => {
  if (rest.length === 0) {
    console.error('peer remove: missing <id>. usage: wellinformed peer remove <peerId>');
    return 1;
  }
  const targetId = rest[0];

  // First check existence without the lock (cheap short-circuit so we
  // don't grab the lock just to report "not found").
  const peersResult = await loadPeers(peersPath());
  if (peersResult.isErr()) {
    console.error(`peer remove: ${formatError(peersResult.error)}`);
    return 1;
  }
  if (!peersResult.value.peers.some((p) => p.id === targetId)) {
    console.error(`peer remove: peer '${targetId}' not found in peers.json`);
    return 1;
  }

  // Transactional remove — guards against a concurrent `peer add` that
  // re-added the same peer between our check and our write.
  const mutateResult = await mutatePeers(peersPath(), (current) =>
    removePeerRecord(current, targetId),
  );
  if (mutateResult.isErr()) {
    console.error(`peer remove: ${formatError(mutateResult.error)}`);
    return 1;
  }
  console.log(`removed peer ${targetId}`);
  return 0;
};

const list = async (rest: readonly string[]): Promise<number> => {
  const jsonOutput = rest.includes('--json');

  const peersResult = await loadPeers(peersPath());
  if (peersResult.isErr()) {
    console.error(`peer list: ${formatError(peersResult.error)}`);
    return 1;
  }
  const { peers } = peersResult.value;

  if (jsonOutput) {
    // Machine-readable output for agent consumption (Phase 16+)
    // Phase 15 scope: stored peers only — no live status/latency/shared rooms
    console.log(
      JSON.stringify(
        {
          count: peers.length,
          peers: peers.map((p) => ({
            id: p.id,
            addrs: p.addrs,
            addedAt: p.addedAt,
            label: p.label,
          })),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  if (peers.length === 0) {
    console.log('no known peers. try `wellinformed peer add <multiaddr>`.');
    return 0;
  }
  console.log(`known peers (${peers.length}):\n`);
  for (const p of peers) {
    console.log(`  ${p.id}`);
    for (const a of p.addrs) {
      console.log(`    addr: ${a}`);
    }
    console.log(`    added: ${p.addedAt}`);
    if (p.label) console.log(`    label: ${p.label}`);
    console.log('');
  }
  return 0;
};

const status = async (): Promise<number> => {
  const idResult = await loadOrCreateIdentity(identityPath());
  if (idResult.isErr()) {
    console.error(`peer status: ${formatError(idResult.error)}`);
    return 1;
  }
  const identity = idResult.value;

  const peersResult = await loadPeers(peersPath());
  const peerCount = peersResult.isOk() ? peersResult.value.peers.length : 0;

  // Ed25519 .raw is 64 bytes: [0..32) = private scalar, [32..64) = public key
  const publicKeyB64 = Buffer.from(identity.privateKey.raw.slice(32)).toString('base64');

  console.log('peer identity:');
  console.log(`  peerId:      ${identity.peerId}`);
  console.log(`  public key:  ${publicKeyB64}`);
  console.log(`  known peers: ${peerCount}`);
  return 0;
};

// ─────────────────────── usage ────────────────────────────

const USAGE = `usage: wellinformed peer <add|remove|list|status>

subcommands:
  add <multiaddr>   connect to a remote peer
  remove <id>       disconnect and remove a known peer
  list [--json]     show all known peers (stored — live status in Phase 18)
  status            show own identity and peer count`;

// ─────────────────────── entry ────────────────────────────

export const peer = async (args: string[]): Promise<number> => {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'add':    return add(rest);
    case 'remove': return remove(rest);
    case 'list':   return list(rest);
    case 'status': return status();
    default:
      console.error(sub ? `peer: unknown subcommand '${sub}'` : 'peer: missing subcommand');
      console.error(USAGE);
      return 1;
  }
};
