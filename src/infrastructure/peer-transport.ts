/**
 * P2P transport — libp2p node lifecycle and identity management.
 * All libp2p I/O lives here. Domain layer remains pure.
 *
 * Identity serialization: raw base64 JSON per CONTEXT.md decision.
 * The `.raw` property on Ed25519PrivateKey gives the correct 64 bytes
 * (32 private + 32 public concatenated). No protobuf framing needed.
 *
 * API note: libp2p 3.x exposes `privateKeyFromRaw` (not the older
 * `unmarshalEd25519PrivateKey`) — verified against installed types.
 */
import { generateKeyPair, privateKeyFromRaw } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import type { Ed25519PrivateKey, Libp2p } from '@libp2p/interface';
import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@libp2p/noise';
import { yamux } from '@libp2p/yamux';
import { multiaddr } from '@multiformats/multiaddr';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PeerError } from '../domain/errors.js';
import { PeerError as PE } from '../domain/errors.js';

export interface PeerIdentity {
  readonly privateKey: Ed25519PrivateKey;
  readonly peerId: string;
}

export interface TransportConfig {
  readonly listenPort: number;
}

/**
 * Load existing identity from disk, or generate + persist a new one.
 * Identity file format: { privateKeyB64: string, peerId: string, createdAt: string }
 *
 * Uses raw base64 JSON — `.raw` gives 64 bytes (ed25519 priv+pub),
 * `privateKeyFromRaw()` accepts the raw Uint8Array directly.
 */
export const loadOrCreateIdentity = (
  identityPath: string,
): ResultAsync<PeerIdentity, PeerError> => {
  if (existsSync(identityPath)) {
    return ResultAsync.fromPromise(
      readFile(identityPath, 'utf8'),
      (e) => PE.identityReadError(identityPath, (e as Error).message),
    ).andThen((text) => {
      try {
        const stored = JSON.parse(text) as { privateKeyB64: string; peerId: string };
        const rawBytes = Uint8Array.from(Buffer.from(stored.privateKeyB64, 'base64'));
        const privateKey = privateKeyFromRaw(rawBytes) as Ed25519PrivateKey;
        return okAsync({ privateKey, peerId: stored.peerId } satisfies PeerIdentity);
      } catch (e) {
        return errAsync(PE.identityParseError(identityPath, (e as Error).message));
      }
    });
  }

  return ResultAsync.fromPromise(
    generateKeyPair('Ed25519'),
    (e) => PE.identityGenerateError((e as Error).message),
  ).andThen((privateKey) => {
    const peerId = peerIdFromPrivateKey(privateKey).toString();
    const stored = {
      privateKeyB64: Buffer.from(privateKey.raw).toString('base64'),
      peerId,
      createdAt: new Date().toISOString(),
    };
    const dir = dirname(identityPath);
    return ResultAsync.fromPromise(
      mkdir(dir, { recursive: true }),
      (e) => PE.identityWriteError(identityPath, (e as Error).message),
    ).andThen(() =>
      ResultAsync.fromPromise(
        writeFile(identityPath, JSON.stringify(stored, null, 2), 'utf8'),
        (e) => PE.identityWriteError(identityPath, (e as Error).message),
      ),
    ).map(() => ({ privateKey, peerId }) satisfies PeerIdentity);
  });
};

/**
 * Create a libp2p node with TCP + Noise + Yamux.
 * Calls node.start() explicitly — omitting this is a known pitfall
 * (the node is constructed but not listening until started).
 *
 * connectionEncrypters: [noise()] satisfies SEC-05 (all traffic encrypted).
 * Noise handshake authenticates peers via ed25519 signatures (SEC-06) —
 * zero custom crypto required.
 */
export const createNode = (
  identity: PeerIdentity,
  cfg: TransportConfig,
): ResultAsync<Libp2p, PeerError> =>
  ResultAsync.fromPromise(
    (async () => {
      const node = await createLibp2p({
        privateKey: identity.privateKey,
        addresses: { listen: [`/ip4/0.0.0.0/tcp/${cfg.listenPort}`] },
        transports: [tcp()],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        connectionManager: {
          reconnectRetries: 5,
          reconnectRetryInterval: 2000,
          reconnectBackoffFactor: 2,
        },
      });
      await node.start();
      return node;
    })(),
    (e) => PE.transportError((e as Error).message),
  );

/**
 * Dial a remote peer by multiaddr, tag for keep-alive, return PeerId string.
 * multiaddr() parse is synchronous and throws — wrapped in try/catch to
 * convert synchronous throw to a typed Result error.
 */
export const dialAndTag = (
  node: Libp2p,
  rawAddr: string,
): ResultAsync<string, PeerError> =>
  ResultAsync.fromPromise(
    (async () => {
      let ma;
      try {
        ma = multiaddr(rawAddr);
      } catch (e) {
        throw Object.assign(new Error((e as Error).message), {
          _isMultiaddrError: true,
          addr: rawAddr,
        });
      }
      const conn = await node.dial(ma);
      const peerId = conn.remotePeer;
      await node.peerStore.merge(peerId, {
        multiaddrs: [ma],
        tags: { 'keep-alive-wellinformed': { value: 50 } },
      });
      return peerId.toString();
    })(),
    (e) => {
      const err = e as Error & { _isMultiaddrError?: boolean; addr?: string };
      return err._isMultiaddrError
        ? PE.invalidMultiaddr(err.addr ?? rawAddr, err.message)
        : PE.dialError(rawAddr, err.message);
    },
  );

/**
 * Hang up a peer connection by PeerId string.
 * Uses PE.transportError for hangup failures — not PE.notFound,
 * which is reserved for registry lookup misses.
 */
export const hangUpPeer = (
  node: Libp2p,
  peerIdStr: string,
): ResultAsync<void, PeerError> =>
  ResultAsync.fromPromise(
    (async () => {
      const { peerIdFromString } = await import('@libp2p/peer-id');
      const pid = peerIdFromString(peerIdStr);
      await node.hangUp(pid);
    })(),
    (e) => PE.transportError((e as Error).message),
  );

/** Basic node status: own PeerId, listening addresses, connected peer count. */
export interface NodeStatus {
  readonly peerId: string;
  readonly listenAddrs: readonly string[];
  readonly connectedPeers: number;
}

export const getNodeStatus = (node: Libp2p): NodeStatus => ({
  peerId: node.peerId.toString(),
  listenAddrs: node.getMultiaddrs().map((m) => m.toString()),
  connectedPeers: node.getPeers().length,
});
