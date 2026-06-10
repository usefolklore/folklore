/**
 * `akashik peer <sub>` — manage P2P peer connections.
 *
 * Subcommands:
 *   add <multiaddr>          connect to a remote peer and persist to peers.json
 *   remove <id>              remove a peer from peers.json
 *   list                     show known peers (stored only — live status/latency in Phase 18)
 *   status                   show own PeerId, public key, and known peer count
 *   label <id> <github>      register the expected GitHub handle for a peer
 *                            (Phase 26 — drives envelope-pin in share-sync)
 *   unlabel <id>              remove the github label for a peer
 */

import { readFileSync } from 'node:fs';
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
import {
  loadPeerLabels,
  lookupGithub,
  setPeerLabel,
  removePeerLabel,
} from '../../infrastructure/peer-labels.js';
import { akashikHome } from '../runtime.js';

const identityPath = (): string => join(akashikHome(), 'peer-identity.json');
const peersPath = (): string => join(akashikHome(), 'peers.json');
const peerLabelsPath = (): string => join(akashikHome(), 'peer-labels.json');
const configPath = (): string => join(akashikHome(), 'config.yaml');

// ─────────────────────── subcommands ──────────────────────

const add = async (rest: readonly string[]): Promise<number> => {
  if (rest.length === 0) {
    console.error('peer add: missing <multiaddr>. usage: akashik peer add /ip4/1.2.3.4/tcp/9001');
    return 1;
  }
  const rawAddr = rest[0];
  if (!isMultiaddrShaped(rawAddr)) {
    console.error(`peer add: '${rawAddr}' does not look like a multiaddr (must start with /)`);
    return 1;
  }

  // Config validated for early failure, but the ephemeral node below
  // deliberately ignores peer.port (daemon-only — see createNode note).
  const configResult = await loadConfig(configPath());
  if (configResult.isErr()) {
    console.error(`peer add: ${formatError(configResult.error)}`);
    return 1;
  }

  const idResult = await loadOrCreateIdentity(identityPath());
  if (idResult.isErr()) {
    console.error(`peer add: ${formatError(idResult.error)}`);
    return 1;
  }

  // Ephemeral dial-only node: ALWAYS port 0. The configured peer.port
  // belongs to the daemon's listener — binding it here collides with
  // a running daemon (EADDRINUSE) and bricks `peer add`.
  const nodeResult = await createNode(idResult.value, {
    listenPort: 0,
    listenHost: '127.0.0.1',
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
    console.error('peer remove: missing <id>. usage: akashik peer remove <peerId>');
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
  // Phase 26 — pull github mapping from peer-labels.json so the list
  // surfaces identity binding alongside the multiaddr.
  const labels = loadPeerLabels(peerLabelsPath());

  if (jsonOutput) {
    // Machine-readable output for agent consumption (Phase 16+)
    // Phase 17: discovery_method field added — undefined rendered as 'manual' for legacy peers
    // Phase 18: health field added — always 'unknown' in CLI (tracker lives in daemon
    //   process memory; Phase 19+ will expose it via MCP tool or daemon IPC).
    // Phase 26: github field added — pulled from peer-labels.json; null when unlabelled.
    console.log(
      JSON.stringify(
        {
          count: peers.length,
          peers: peers.map((p) => ({
            id: p.id,
            addrs: p.addrs,
            addedAt: p.addedAt,
            label: p.label,
            github: lookupGithub(labels, p.id) ?? null,
            discovery_method: p.discovery_method ?? 'manual',
            health: 'unknown',  // populated via daemon IPC/MCP in Phase 19+
          })),
        },
        null,
        2,
      ),
    );
    return 0;
  }

  if (peers.length === 0) {
    console.log('no known peers. try `akashik peer add <multiaddr>`.');
    return 0;
  }
  console.log(`known peers (${peers.length}):\n`);
  for (const p of peers) {
    const gh = lookupGithub(labels, p.id);
    console.log(`  ${p.id}${gh ? `  @${gh}` : ''}`);
    for (const a of p.addrs) {
      console.log(`    addr: ${a}`);
    }
    console.log(`    added:     ${p.addedAt}`);
    console.log(`    discovery: ${p.discovery_method ?? 'manual'}`);
    // Phase 18: health is tracked in-memory in the daemon; CLI shows 'unknown'
    // until Phase 19+ daemon IPC or MCP tool exposes the live health state.
    console.log(`    health:    unknown`);
    if (gh) {
      console.log(`    github:    @${gh} (envelope-pinned)`);
    } else {
      console.log(`    github:    — (unlabelled; run \`akashik peer label ${p.id.slice(0, 12)}… @handle\`)`);
    }
    if (p.label) console.log(`    label:     ${p.label}`);
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

  // Daemon-published listen addresses (written on libp2p startup).
  // This is what another machine pastes into `akashik peer add`.
  try {
    const raw = JSON.parse(readFileSync(join(akashikHome(), 'p2p-addrs.json'), 'utf8')) as { addrs?: string[] };
    const addrs = Array.isArray(raw.addrs) ? raw.addrs : [];
    if (addrs.length > 0) {
      console.log('  listen addrs (daemon):');
      for (const a of addrs) {
        // getMultiaddrs() may already carry the /p2p/<id> suffix.
        console.log(`    ${a.includes('/p2p/') ? a : `${a}/p2p/${identity.peerId}`}`);
      }
    }
  } catch { /* daemon not running with p2p, or pre-upgrade — omit */ }
  return 0;
};

// ─────────────────────── label / unlabel ─────────────────

/**
 * `akashik peer label <peer-id> <github-handle>` — registers the
 * expected GitHub handle for a peer (Phase 26). share-sync looks up
 * this mapping when it receives a signed envelope from <peer-id> and
 * rejects the envelope if payload.github_user doesn't match.
 *
 * Without a label, the peer's nodes still flow — verifier degrades
 * gracefully (no pin). Adding a label tightens the binding.
 */
const label = async (rest: readonly string[]): Promise<number> => {
  const positional = rest.filter((a) => !a.startsWith('--'));
  if (positional.length < 2) {
    console.error('peer label: usage: akashik peer label <peer-id> <github-handle> [--note "free text"]');
    return 1;
  }
  const [peerId, githubRaw] = positional;
  const github = githubRaw.startsWith('@') ? githubRaw.slice(1) : githubRaw;
  // Optional --note "..." — picked up from the original rest, not
  // the positional-filtered list, so the value (which may legitimately
  // start with a letter) doesn't get mistaken for a peer-id.
  let note: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === '--note') { note = rest[i + 1]; break; }
    if (rest[i].startsWith('--note=')) { note = rest[i].slice('--note='.length); break; }
  }

  try {
    setPeerLabel(peerLabelsPath(), peerId, {
      github,
      ...(note ? { note } : {}),
    });
  } catch (e) {
    console.error(`peer label: failed to persist: ${(e as Error).message}`);
    return 1;
  }
  console.log(`✓ labelled ${peerId.slice(0, 16)}… → @${github}${note ? ` (note: ${note})` : ''}`);
  console.log(`  share-sync will now pin every signed envelope from this peer`);
  console.log(`  to payload.github_user === "${github}" (mismatch → reject).`);
  return 0;
};

const unlabel = async (rest: readonly string[]): Promise<number> => {
  const positional = rest.filter((a) => !a.startsWith('--'));
  if (positional.length < 1) {
    console.error('peer unlabel: usage: akashik peer unlabel <peer-id>');
    return 1;
  }
  const [peerId] = positional;
  let removed: boolean;
  try {
    removed = removePeerLabel(peerLabelsPath(), peerId);
  } catch (e) {
    console.error(`peer unlabel: failed: ${(e as Error).message}`);
    return 1;
  }
  if (removed) {
    console.log(`✓ removed label for ${peerId.slice(0, 16)}…`);
    console.log(`  share-sync will no longer pin envelopes from this peer.`);
  } else {
    console.log(`peer unlabel: ${peerId.slice(0, 16)}… was not labelled (nothing to do)`);
  }
  return 0;
};

// ─────────────────────── usage ────────────────────────────

const USAGE = `usage: akashik peer <add|remove|list|status|label|unlabel|rep>

subcommands:
  add <multiaddr>          connect to a remote peer
  remove <id>              disconnect and remove a known peer
  list [--json]            show all known peers (stored — live status in Phase 18)
  status                   show own identity and peer count
  label <id> <github>      register expected GitHub handle (Phase 26 envelope pin)
                           --note "free text"   optional human-readable annotation
  unlabel <id>             remove the github label for a peer
  rep [<peer-id>]          inspect peer reputation (subjects × scores)
                           --subject <key>      rank peers on one subject
                           --json               machine-readable output`;

// ─────────────────────── entry ────────────────────────────

export const peer = async (args: string[]): Promise<number> => {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'add':     return add(rest);
    case 'remove':  return remove(rest);
    case 'list':    return list(rest);
    case 'status':  return status();
    case 'label':   return label(rest);
    case 'unlabel': return unlabel(rest);
    case 'rep': {
      const { peersRep } = await import('./peers-rep.js');
      return peersRep(rest);
    }
    default:
      console.error(sub ? `peer: unknown subcommand '${sub}'` : 'peer: missing subcommand');
      console.error(USAGE);
      return 1;
  }
};
