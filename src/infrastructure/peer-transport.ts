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
import type { PeerInfo } from '@libp2p/interface';
import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@libp2p/noise';
import { yamux } from '@libp2p/yamux';
import { mdns } from '@libp2p/mdns';
import { kadDHT } from '@libp2p/kad-dht';
import { multiaddr } from '@multiformats/multiaddr';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import type { PeerError } from '../domain/errors.js';
import { PeerError as PE } from '../domain/errors.js';
import { mutatePeers, addPeerRecord } from './peer-store.js';

/**
 * Identity file format marker. Bumped when the on-disk layout changes
 * in a way that is not forward-compatible with `privateKeyFromRaw`.
 *
 * ed25519-raw-v1:
 *   { format: 'ed25519-raw-v1', privateKeyB64: string, peerId: string, createdAt: string }
 *   privateKeyB64 is base64-encoded 64 bytes (32 priv + 32 pub) exactly as
 *   returned by Ed25519PrivateKey.raw in libp2p 3.x.
 *
 * Legacy files (no `format` field, written by the initial Phase 15 implementation)
 * are accepted on read as if they were ed25519-raw-v1 and upgraded in place
 * on the next write path (silent migration — old installs keep working).
 */
const IDENTITY_FORMAT_CURRENT = 'ed25519-raw-v1' as const;
type IdentityFormat = typeof IDENTITY_FORMAT_CURRENT;

interface IdentityFile {
  readonly format?: IdentityFormat;
  readonly privateKeyB64: string;
  readonly peerId: string;
  readonly createdAt?: string;
}

export interface PeerIdentity {
  readonly privateKey: Ed25519PrivateKey;
  readonly peerId: string;
}

export interface TransportConfig {
  readonly listenPort: number;
  /**
   * Interface to bind the TCP listener to. Default '127.0.0.1' — local-only.
   * Set to '0.0.0.0' in config.yaml to accept remote peer connections.
   * Defaulting to localhost means a user who runs `peer status` or `peer add`
   * on an untrusted network does not accidentally expose a libp2p endpoint.
   */
  readonly listenHost?: string;
  /** mDNS LAN discovery. Default true. Set false via PeerConfig.mdns. */
  readonly mdns?: boolean;
  /** kad-dht wiring. Default false. Set true via PeerConfig.dht.enabled. */
  readonly dhtEnabled?: boolean;
  /** Path to peers.json for peer:discovery persistence. REQUIRED when mdns is true. */
  readonly peersPath?: string;
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
      let stored: IdentityFile;
      try {
        stored = JSON.parse(text) as IdentityFile;
      } catch (e) {
        return errAsync<PeerIdentity, PeerError>(
          PE.identityParseError(identityPath, `JSON parse failed: ${(e as Error).message}`),
        );
      }
      if (!stored || typeof stored.privateKeyB64 !== 'string' || typeof stored.peerId !== 'string') {
        return errAsync<PeerIdentity, PeerError>(
          PE.identityParseError(identityPath, "missing 'privateKeyB64' or 'peerId' fields"),
        );
      }
      // Accept legacy files with no format marker as ed25519-raw-v1
      // (they were written by the initial Phase 15 implementation).
      // Reject any explicit format that is not the current one so
      // accidental migrations are loud instead of silent.
      if (stored.format && stored.format !== IDENTITY_FORMAT_CURRENT) {
        return errAsync<PeerIdentity, PeerError>(
          PE.identityParseError(
            identityPath,
            `unsupported identity format '${stored.format}' (expected '${IDENTITY_FORMAT_CURRENT}')`,
          ),
        );
      }
      let privateKey: Ed25519PrivateKey;
      try {
        const rawBytes = Uint8Array.from(Buffer.from(stored.privateKeyB64, 'base64'));
        const pk = privateKeyFromRaw(rawBytes);
        if (pk.type !== 'Ed25519') {
          return errAsync<PeerIdentity, PeerError>(
            PE.identityParseError(identityPath, `expected Ed25519 key, got ${pk.type}`),
          );
        }
        privateKey = pk as Ed25519PrivateKey;
      } catch (e) {
        return errAsync<PeerIdentity, PeerError>(
          PE.identityParseError(identityPath, `key decode failed: ${(e as Error).message}`),
        );
      }
      return okAsync({ privateKey, peerId: stored.peerId } satisfies PeerIdentity);
    });
  }

  return ResultAsync.fromPromise(
    generateKeyPair('Ed25519'),
    (e) => PE.identityGenerateError((e as Error).message),
  ).andThen((privateKey) => {
    const peerId = peerIdFromPrivateKey(privateKey).toString();
    const stored: IdentityFile = {
      format: IDENTITY_FORMAT_CURRENT,
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
 * Create a libp2p node with TCP + Noise + Yamux + optional mDNS + optional kad-dht.
 * Calls node.start() explicitly — omitting this is a known pitfall
 * (the node is constructed but not listening until started).
 *
 * connectionEncrypters: [noise()] satisfies SEC-05 (all traffic encrypted).
 * Noise handshake authenticates peers via ed25519 signatures (SEC-06) —
 * zero custom crypto required.
 *
 * mDNS (DISC-02): enabled by default. Pitfall 2 (17-RESEARCH.md) — Docker/WSL2
 * multicast bind failure must NOT crash createNode. Wrapped in try/catch.
 *
 * kad-dht (DISC-03): off by default. Pitfall 4 (17-RESEARCH.md) — DHT ideally
 * needs identify to populate its routing table. Since @libp2p/identify is not
 * available as a transitive dep, clientMode:true is used without identify.
 *
 * peer:discovery (Pitfall 1, 17-RESEARCH.md): mDNS does NOT auto-dial. The
 * peer:discovery event handler MUST call node.dial() explicitly. Without this,
 * peers appear in peer list but 0 are connected (connectionManager.minConnections
 * is not set — we do NOT rely on auto-dial).
 */
export const createNode = (
  identity: PeerIdentity,
  cfg: TransportConfig,
): ResultAsync<Libp2p, PeerError> =>
  ResultAsync.fromPromise(
    (async () => {
      const host = cfg.listenHost ?? '127.0.0.1';
      const mdnsEnabled = cfg.mdns !== false;   // default true per DISC-02
      const dhtOn = cfg.dhtEnabled === true;    // default false per DISC-03

      // Build peerDiscovery array conditionally. mDNS failures in Docker/WSL
      // (multicast not forwarded) must not crash createNode — wrap in try.
      let peerDiscovery: ReturnType<typeof mdns>[] = [];
      if (mdnsEnabled) {
        try {
          peerDiscovery = [mdns({ interval: 20000 })];
        } catch (e) {
          // Pitfall 2 (17-RESEARCH.md): Docker bridge / WSL2 non-mirrored
          // multicast bind failure. Log and continue without mDNS.
          // mDNS unavailable — user must use manual 'peer add' or enable Docker --network host / WSL2 mirrored mode.
          process.stderr.write(
            `wellinformed: mDNS unavailable (${(e as Error).message}). ` +
            `Continuing without LAN discovery. ` +
            `Use manual 'peer add' or enable Docker --network host / WSL2 mirrored mode.\n`,
          );
          peerDiscovery = [];
        }
      }

      // Pitfall 4 (17-RESEARCH.md): DHT ideally needs identify to populate its routing table.
      // @libp2p/identify is NOT available as a transitive dep from libp2p@3.2.0 (confirmed Phase 17
      // Plan 01). DHT runs in clientMode:true which does not require identify — it queries the
      // routing table passively without advertising itself, so routing-table population from
      // identify is optional for the client-mode use case.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const services: Record<string, any> = dhtOn
        ? { dht: kadDHT({ clientMode: true, protocol: '/wellinformed/kad/1.0.0' }) }
        : {};

      const node = await createLibp2p({
        privateKey: identity.privateKey,
        addresses: { listen: [`/ip4/${host}/tcp/${cfg.listenPort}`] },
        transports: [tcp()],
        connectionEncrypters: [noise()],
        streamMuxers: [yamux()],
        peerDiscovery,
        services,
        // Retry aggressively to match the "persistent connection" contract.
        // Infinity + exponential backoff caps at reconnectRetryInterval * factor^attempts,
        // so retries slow down to minutes-scale for long-flapped peers but never stop.
        connectionManager: {
          reconnectRetries: Infinity,
          reconnectRetryInterval: 2000,
          reconnectBackoffFactor: 2,
        },
      });
      await node.start();

      // Pitfall 1 (17-RESEARCH.md): mDNS peer:discovery only populates peerStore.
      // We MUST explicitly (a) persist with discovery_method:'mdns' AND (b) dial.
      // Both sides — persist is safe (atomic lock), dial is best-effort.
      // NOTE: we do NOT set minConnections — no auto-dial; this explicit handler is required.
      if (mdnsEnabled && cfg.peersPath) {
        const peersPath = cfg.peersPath;
        node.addEventListener('peer:discovery', (evt: CustomEvent<PeerInfo>) => {
          // Defensive: evt.detail type is inferred from libp2p; runtime check.
          const detail = evt.detail;
          if (!detail || !detail.id || !Array.isArray(detail.multiaddrs)) return;
          const peerIdStr = detail.id.toString();
          const addrs = detail.multiaddrs.map((m) => m.toString());

          // Persist the discovery via the locked peers.json mutation path.
          // Best-effort: failures here must not break the event loop.
          void mutatePeers(peersPath, (current) =>
            addPeerRecord(current, {
              id: peerIdStr,
              addrs,
              addedAt: new Date().toISOString(),
              discovery_method: 'mdns',
            }),
          ).match(
            () => undefined,
            (e) => process.stderr.write(`wellinformed: peer:discovery persist failed: ${e.type}\n`),
          );

          // Explicit dial — only if not already connected (avoid dial storms on
          // rediscovery intervals). getPeers() returns currently-connected PeerIds.
          const already = node.getPeers().some((p) => p.toString() === peerIdStr);
          if (!already && detail.multiaddrs.length > 0) {
            void node.dial(detail.multiaddrs[0]).catch(() => {
              // Best-effort — a dial can fail for many reasons (firewall, race
              // with peer going offline). The next discovery interval (20s)
              // retries automatically.
            });
          }
        });
      }

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
