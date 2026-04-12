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

export interface PeerConfig {
  /** Listening port for the libp2p TCP transport. 0 = OS-assigned (default). */
  readonly port: number;
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

const DEFAULT_PEER: PeerConfig = { port: 0 };

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
