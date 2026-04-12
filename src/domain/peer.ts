/**
 * Pure domain validation for peer multiaddrs.
 *
 * Infrastructure-level peer state (known peers, PeerRecord, peers.json I/O)
 * lives in src/infrastructure/peer-store.ts. This module only owns the
 * pure validation functions that do not need any I/O.
 *
 * No classes, no throws — fallible operations return neverthrow Results.
 */

/**
 * Structural check that an address string is shaped like a multiaddr
 * (starts with '/'). Full protocol-level validation is deferred to
 * @multiformats/multiaddr at the infrastructure layer — this check is
 * just a fast CLI-level sanity guard before invoking libp2p.
 */
export const isMultiaddrShaped = (addr: string): boolean =>
  addr.startsWith('/') && addr.length > 1;
