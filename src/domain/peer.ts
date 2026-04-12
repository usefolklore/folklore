/**
 * Pure domain vocabulary for P2P peer identity and registry.
 *
 * Defines the types and pure functions for managing known peers.
 * No I/O, no classes, no throws — all fallible operations return
 * neverthrow Results so they compose safely in the application layer.
 *
 * The infrastructure layer (peer-store.ts, peer-transport.ts) owns
 * the actual libp2p I/O and filesystem persistence; this module
 * owns the vocabulary and the invariant-preserving transformations.
 */

import { Result, err, ok } from 'neverthrow';

// ─────────────────────── types ────────────────────────────

export interface PeerInfo {
  /** multibase-encoded PeerId string (libp2p canonical form) */
  readonly id: string;
  /** known multiaddrs for dialling this peer */
  readonly addrs: readonly string[];
  /** ISO-8601 timestamp when this peer was first added */
  readonly addedAt: string;
  /** optional human-readable alias */
  readonly label?: string;
}

export interface PeerRegistry {
  readonly peers: readonly PeerInfo[];
}

// ─────────────────────── constructors ─────────────────────

export const emptyRegistry = (): PeerRegistry => ({ peers: [] });

// ─────────────────────── queries ──────────────────────────

export const findPeer = (
  registry: PeerRegistry,
  id: string,
): PeerInfo | undefined => registry.peers.find((p) => p.id === id);

export const hasPeer = (
  registry: PeerRegistry,
  id: string,
): boolean => registry.peers.some((p) => p.id === id);

// ─────────────────────── mutations (pure) ─────────────────

/**
 * Add a peer to the registry. Returns err if the peer already exists
 * (deduplication is enforced by id). Returns a new PeerRegistry value.
 */
export const addPeer = (
  registry: PeerRegistry,
  peer: PeerInfo,
): Result<PeerRegistry, string> =>
  hasPeer(registry, peer.id)
    ? err(`peer '${peer.id}' already exists`)
    : ok({ peers: [...registry.peers, peer] });

/**
 * Remove a peer by id. Returns err if the peer is not found.
 * Returns a new PeerRegistry value with the peer excluded.
 */
export const removePeer = (
  registry: PeerRegistry,
  id: string,
): Result<PeerRegistry, string> =>
  hasPeer(registry, id)
    ? ok({ peers: registry.peers.filter((p) => p.id !== id) })
    : err(`peer '${id}' not found`);

// ─────────────────────── validation ───────────────────────

/**
 * Structural check that an address string is shaped like a multiaddr
 * (starts with '/'). Full protocol-level validation is deferred to
 * @multiformats/multiaddr at the infrastructure layer.
 */
export const isMultiaddrShaped = (addr: string): boolean =>
  addr.startsWith('/') && addr.length > 1;
