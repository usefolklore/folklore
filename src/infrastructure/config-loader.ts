/**
 * Config loader — reads ~/.wellinformed/config.yaml with typed defaults.
 *
 * The config is optional. If the file doesn't exist, all fields fall
 * back to their defaults. If it exists but is malformed, we return
 * an error rather than silently using defaults (fail-loud at startup).
 *
 * The shape mirrors config/config.example.yaml. Only the daemon and
 * rooms.tunnels sections are consumed in Phase 6; the rest is read
 * but passed through to callers as-is.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { parse as parseYaml } from 'yaml';
import type { GraphError } from '../domain/errors.js';
import { GraphError as GE } from '../domain/errors.js';

// ─────────────── types ──────────────────

export interface DaemonConfig {
  readonly interval_seconds: number;
  readonly max_parallel_sources: number;
  readonly discovery_cadence: number;
  readonly round_robin_rooms: boolean;
}

export interface TunnelsConfig {
  readonly enabled: boolean;
  readonly similarity_threshold: number;
  readonly min_cluster_size: number;
}

export interface BandwidthConfig {
  /** Per-peer-per-room token bucket rate for outbound share updates (default 50). */
  readonly max_updates_per_sec_per_peer_per_room: number;
  /** Daemon-tick semaphore on concurrent outbound share syncs (default 10). */
  readonly max_concurrent_share_syncs: number;
}

export interface BandwidthOverride {
  readonly max_updates_per_sec_per_peer_per_room?: number;
  readonly max_concurrent_share_syncs?: number;
}

export interface PeerConfig {
  /** Listening port for the libp2p TCP transport. 0 = OS-assigned (default). */
  readonly port: number;
  /**
   * Interface to bind the TCP listener to. Default '127.0.0.1' (localhost only)
   * so ephemeral CLI commands do not expose a libp2p endpoint on public
   * interfaces. Set to '0.0.0.0' when running as a daemon that should
   * accept remote peer connections.
   */
  readonly listen_host: string;
  /** mDNS LAN auto-discovery. Default true (enabled) per DISC-02 locked decision. */
  readonly mdns: boolean;
  /** Kademlia DHT. Wired but off by default per DISC-03 locked decision. */
  readonly dht: {
    readonly enabled: boolean;
    /** Optional multiaddr list fed to @libp2p/bootstrap as DHT seed peers. */
    readonly bootstrap_peers: readonly string[];
  };
  /** Token bucket for inbound federated-search requests (per-peer). */
  readonly search_rate_limit: {
    readonly rate_per_sec: number;
    readonly burst: number;
  };
  /**
   * Known-reliable relay multiaddrs (empty by default — CONTEXT.md locked).
   * When non-empty, /p2p-circuit is added to addresses.listen in Plan 02,
   * and the daemon dials each relay on startup (Plan 03).
   * NO hardcoded IPFS bootstrap nodes — users opt in explicitly.
   */
  readonly relays: readonly string[];
  /**
   * UPnP port mapping. Default true — @libp2p/upnp-nat is a no-op on
   * listen_host=127.0.0.1 (Pitfall 2 from 18-RESEARCH.md) and catches
   * all errors internally, so wiring unconditionally is safe.
   */
  readonly upnp: boolean;
  /**
   * Layered bandwidth limits (CONTEXT.md locked defaults):
   *   - max_updates_per_sec_per_peer_per_room: 50
   *   - max_concurrent_share_syncs: 10
   */
  readonly bandwidth: BandwidthConfig;
  /**
   * Optional per-peer overrides keyed by PeerId string.
   * Phase 18 ships with plumbing only — CLI to edit comes later.
   */
  readonly bandwidth_overrides?: Readonly<Record<string, BandwidthOverride>>;
}

export interface SecurityConfig {
  /**
   * Extra secrets patterns to append to the 10 built-ins.
   * Each entry must have a `name` (for diagnostics) and a `pattern`
   * (ECMAScript regex string — the 'g' flag is added automatically).
   */
  readonly secrets_patterns: ReadonlyArray<{ readonly name: string; readonly pattern: string }>;
}

export interface AppConfig {
  readonly daemon: DaemonConfig;
  readonly tunnels: TunnelsConfig;
  readonly peer: PeerConfig;
  readonly security: SecurityConfig;
  /** The full raw parsed object — callers can drill into sections we don't type. */
  readonly raw: Readonly<Record<string, unknown>>;
}

// ─────────────── defaults ───────────────

const DEFAULT_DAEMON: DaemonConfig = {
  interval_seconds: 86400,
  max_parallel_sources: 8,
  discovery_cadence: 5,
  round_robin_rooms: true,
};

const DEFAULT_TUNNELS: TunnelsConfig = {
  enabled: true,
  similarity_threshold: 0.80,
  min_cluster_size: 3,
};

const DEFAULT_PEER: PeerConfig = {
  port: 0,
  listen_host: '127.0.0.1',
  mdns: true,
  dht: { enabled: false, bootstrap_peers: [] },
  search_rate_limit: { rate_per_sec: 10, burst: 30 },
  relays: [],
  upnp: true,
  bandwidth: {
    max_updates_per_sec_per_peer_per_room: 50,
    max_concurrent_share_syncs: 10,
  },
  // bandwidth_overrides intentionally omitted (optional, undefined by default)
};

const DEFAULT_SECURITY: SecurityConfig = { secrets_patterns: [] };

const DEFAULT_CONFIG: AppConfig = {
  daemon: DEFAULT_DAEMON,
  tunnels: DEFAULT_TUNNELS,
  peer: DEFAULT_PEER,
  security: DEFAULT_SECURITY,
  raw: {},
};

// ─────────────── loader ─────────────────

export const loadConfig = (path: string): ResultAsync<AppConfig, GraphError> => {
  if (!existsSync(path)) return okAsync(DEFAULT_CONFIG);
  return ResultAsync.fromPromise(readFile(path, 'utf8'), (e) =>
    GE.readError(path, (e as Error).message),
  ).andThen((text) => {
    try {
      const raw = parseYaml(text) as Record<string, unknown> | null;
      if (!raw || typeof raw !== 'object') {
        return errAsync<AppConfig, GraphError>(GE.parseError(path, 'config root must be a YAML mapping'));
      }
      const daemonRaw = (raw.daemon ?? {}) as Record<string, unknown>;
      const roomsRaw = (raw.rooms ?? {}) as Record<string, unknown>;
      const tunnelsRaw = (roomsRaw.tunnels ?? {}) as Record<string, unknown>;
      const peerRaw = (raw.peer ?? {}) as Record<string, unknown>;
      const securityRaw = (raw.security ?? {}) as Record<string, unknown>;

      const daemon: DaemonConfig = {
        interval_seconds: num(daemonRaw.interval_seconds, DEFAULT_DAEMON.interval_seconds),
        max_parallel_sources: num(daemonRaw.max_parallel_sources, DEFAULT_DAEMON.max_parallel_sources),
        discovery_cadence: num(daemonRaw.discovery_cadence, DEFAULT_DAEMON.discovery_cadence),
        round_robin_rooms: bool(daemonRaw.round_robin_rooms, DEFAULT_DAEMON.round_robin_rooms),
      };
      const tunnels: TunnelsConfig = {
        enabled: bool(tunnelsRaw.enabled, DEFAULT_TUNNELS.enabled),
        similarity_threshold: num(tunnelsRaw.similarity_threshold, DEFAULT_TUNNELS.similarity_threshold),
        min_cluster_size: num(tunnelsRaw.min_cluster_size, DEFAULT_TUNNELS.min_cluster_size),
      };
      const peer: PeerConfig = {
        port: num(peerRaw.port, DEFAULT_PEER.port),
        listen_host: str(peerRaw.listen_host, DEFAULT_PEER.listen_host),
        mdns: bool(peerRaw.mdns, DEFAULT_PEER.mdns),
        dht: {
          enabled: bool(
            (peerRaw.dht as Record<string, unknown> | undefined)?.enabled,
            DEFAULT_PEER.dht.enabled,
          ),
          bootstrap_peers: Array.isArray(
            (peerRaw.dht as Record<string, unknown> | undefined)?.bootstrap_peers,
          )
            ? ((peerRaw.dht as Record<string, unknown>).bootstrap_peers as unknown[]).filter(
                (x): x is string => typeof x === 'string',
              )
            : DEFAULT_PEER.dht.bootstrap_peers,
        },
        search_rate_limit: {
          rate_per_sec: num(
            (peerRaw.search_rate_limit as Record<string, unknown> | undefined)?.rate_per_sec,
            DEFAULT_PEER.search_rate_limit.rate_per_sec,
          ),
          burst: num(
            (peerRaw.search_rate_limit as Record<string, unknown> | undefined)?.burst,
            DEFAULT_PEER.search_rate_limit.burst,
          ),
        },
        relays: Array.isArray(peerRaw.relays)
          ? (peerRaw.relays as unknown[]).filter((x): x is string => typeof x === 'string')
          : DEFAULT_PEER.relays,
        upnp: bool(peerRaw.upnp, DEFAULT_PEER.upnp),
        bandwidth: {
          max_updates_per_sec_per_peer_per_room: num(
            (peerRaw.bandwidth as Record<string, unknown> | undefined)?.max_updates_per_sec_per_peer_per_room,
            DEFAULT_PEER.bandwidth.max_updates_per_sec_per_peer_per_room,
          ),
          max_concurrent_share_syncs: num(
            (peerRaw.bandwidth as Record<string, unknown> | undefined)?.max_concurrent_share_syncs,
            DEFAULT_PEER.bandwidth.max_concurrent_share_syncs,
          ),
        },
        bandwidth_overrides:
          peerRaw.bandwidth_overrides && typeof peerRaw.bandwidth_overrides === 'object'
            ? (peerRaw.bandwidth_overrides as Readonly<Record<string, BandwidthOverride>>)
            : undefined,
      };
      const security: SecurityConfig = {
        secrets_patterns: Array.isArray(securityRaw.secrets_patterns)
          ? (securityRaw.secrets_patterns as Array<{ name: string; pattern: string }>)
          : DEFAULT_SECURITY.secrets_patterns,
      };

      return okAsync<AppConfig, GraphError>({ daemon, tunnels, peer, security, raw });
    } catch (e) {
      return errAsync<AppConfig, GraphError>(GE.parseError(path, (e as Error).message));
    }
  });
};

const num = (v: unknown, def: number): number => (typeof v === 'number' ? v : def);
const bool = (v: unknown, def: boolean): boolean => (typeof v === 'boolean' ? v : def);
const str = (v: unknown, def: string): string => (typeof v === 'string' && v.length > 0 ? v : def);
