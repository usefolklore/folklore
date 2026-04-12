/**
 * Daemon loop — runs triggerRoom on a schedule.
 *
 * The loop is a plain setInterval-based timer that:
 *   1. loads the room registry
 *   2. picks the next room (round-robin or all-at-once)
 *   3. calls triggerRoom for each picked room
 *   4. generates a report per room
 *   5. sleeps until the next tick
 *
 * PID file at `~/.wellinformed/daemon.pid` for lifecycle management.
 *
 * The daemon is designed to run as a detached child process forked
 * by `wellinformed daemon start`. It logs to
 * `~/.wellinformed/daemon.log` and exits cleanly on SIGTERM.
 *
 * For testability, `runOneTick` is exported separately — tests call
 * it directly without starting the timer.
 */

import { existsSync, readFileSync, unlinkSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { ResultAsync, okAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import { formatError } from '../domain/errors.js';
import { roomIds } from '../domain/rooms.js';
import type { RoomRun } from '../domain/sources.js';
import { triggerRoom } from '../application/ingest.js';
import { generateReport, renderReport } from '../application/report.js';
import type { IngestDeps } from '../application/ingest.js';
import type { DaemonConfig } from '../infrastructure/config-loader.js';
import { loadConfig } from '../infrastructure/config-loader.js';
import type { RoomsConfig } from '../infrastructure/rooms-config.js';
import type { GraphRepository } from '../infrastructure/graph-repository.js';
import type { VectorIndex } from '../infrastructure/vector-index.js';
import type { SourcesConfig } from '../infrastructure/sources-config.js';
import type { Libp2p } from '@libp2p/interface';
import { loadOrCreateIdentity, createNode, dialAndTag } from '../infrastructure/peer-transport.js';
import { loadPeers } from '../infrastructure/peer-store.js';
import { buildPatterns } from '../domain/sharing.js';
import {
  createShareSyncRegistry,
  registerShareProtocol,
  runShareSyncTick,
  unregisterShareProtocol,
  type ShareSyncRegistry,
} from '../infrastructure/share-sync.js';
import {
  createSearchRegistry,
  registerSearchProtocol,
  unregisterSearchProtocol,
  type SearchRegistry,
} from '../infrastructure/search-sync.js';
import {
  createHealthTracker,
  type HealthTracker,
} from '../infrastructure/connection-health.js';

// ─────────────── types ──────────────────

export interface DaemonDeps {
  readonly ingestDeps: IngestDeps;
  readonly rooms: RoomsConfig;
  readonly graphs: GraphRepository;
  readonly vectors: VectorIndex;
  readonly sources: SourcesConfig;
  readonly config: DaemonConfig;
  readonly homePath: string;
  readonly shareSync?: ShareSyncRegistry | null;   // Phase 16 — null until libp2p starts
  /** Phase 18: in-memory connection health tracker. Undefined until libp2p starts. */
  readonly healthTracker?: HealthTracker | null;
}

export interface TickResult {
  readonly rooms: readonly RoomRun[];
  readonly reports_written: readonly string[];
}

// ─────────────── PID management ─────────

const pidPath = (homePath: string): string => join(homePath, 'daemon.pid');
const logPath = (homePath: string): string => join(homePath, 'daemon.log');

export const writePid = (homePath: string): void => {
  mkdirSync(homePath, { recursive: true });
  writeFileSync(pidPath(homePath), String(process.pid));
};

export const readPid = (homePath: string): number | null => {
  const p = pidPath(homePath);
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, 'utf8').trim();
  const pid = parseInt(raw, 10);
  return Number.isNaN(pid) ? null : pid;
};

export const removePid = (homePath: string): void => {
  const p = pidPath(homePath);
  if (existsSync(p)) unlinkSync(p);
};

export const isRunning = (homePath: string): boolean => {
  const pid = readPid(homePath);
  if (pid === null) return false;
  try {
    process.kill(pid, 0); // signal 0 = existence check
    return true;
  } catch {
    // stale PID file — process gone
    removePid(homePath);
    return false;
  }
};

// ─────────────── logging ────────────────

const daemonLog = (homePath: string, msg: string): void => {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    appendFileSync(logPath(homePath), line);
  } catch {
    // best-effort
  }
};

// ─────────────── one tick ───────────────

/** Track round-robin position across ticks. */
let roundRobinIndex = 0;

/**
 * Execute one daemon tick. Exported for testability — tests call
 * this directly without starting the timer or writing PID files.
 */
export const runOneTick = (deps: DaemonDeps): ResultAsync<TickResult, AppError> =>
  deps.rooms
    .load()
    .mapErr((e): AppError => e)
    .andThen((registry) => {
      const allRooms = roomIds(registry);
      const picked: string[] = [];
      if (allRooms.length === 0) {
        // no rooms — still tick share sync if available
        return runRooms(deps, picked);
      }

      // Pick rooms for this tick
      if (deps.config.round_robin_rooms) {
        picked.push(allRooms[roundRobinIndex % allRooms.length]);
        roundRobinIndex++;
      } else {
        picked.push(...allRooms);
      }

      return runRooms(deps, picked);
    })
    .andThen((tickResult) => {
      if (!deps.shareSync) {
        return okAsync<TickResult, AppError>(tickResult);
      }
      return runShareSyncTick(deps.shareSync)
        .map((sync) => {
          daemonLog(deps.homePath, `share sync tick: opened=${sync.opened}`);
          return tickResult;
        })
        .orElse((e) => {
          daemonLog(deps.homePath, `share sync error: ${formatError(e)}`);
          return okAsync<TickResult, AppError>(tickResult);
        });
    });

const runRooms = (
  deps: DaemonDeps,
  rooms: readonly string[],
): ResultAsync<TickResult, AppError> => {
  const results: RoomRun[] = [];
  const reports: string[] = [];

  // Sequential to avoid parallel writes to graph.json
  return rooms
    .reduce<ResultAsync<void, AppError>>(
      (acc, room) =>
        acc.andThen(() =>
          triggerRoom(deps.ingestDeps)(room)
            .andThen((run) => {
              results.push(run);
              daemonLog(deps.homePath, `tick: room=${room} new=${run.runs.reduce((s, r) => s + r.items_new, 0)}`);
              // Generate report
              return generateReport({
                graphs: deps.graphs,
                vectors: deps.vectors,
                sources: deps.sources,
              })({ room })
                .map((data) => {
                  const md = renderReport(data);
                  const reportDir = join(deps.homePath, 'reports', room);
                  mkdirSync(reportDir, { recursive: true });
                  const date = data.generated_at.slice(0, 10);
                  const path = join(reportDir, `${date}.md`);
                  writeFileSync(path, md);
                  reports.push(path);
                  daemonLog(deps.homePath, `report: ${path}`);
                });
            })
            .orElse((e) => {
              daemonLog(deps.homePath, `error: room=${room} ${formatError(e)}`);
              return okAsync(undefined);
            }),
        ),
      okAsync<void, AppError>(undefined),
    )
    .map((): TickResult => ({ rooms: results, reports_written: reports }));
};

// ─────────────── loop ───────────────────

/**
 * Start the daemon loop. Runs until SIGTERM / SIGINT. Writes PID
 * file on start, removes on exit.
 *
 * This function never returns in normal operation — it blocks via
 * the timer. Tests should use `runOneTick` instead.
 */
export const startLoop = async (deps: DaemonDeps): Promise<void> => {
  writePid(deps.homePath);
  daemonLog(deps.homePath, `daemon started (pid=${process.pid}, interval=${deps.config.interval_seconds}s)`);

  // ───── Phase 16: optional libp2p + share sync bootstrap ─────
  // Only start a libp2p node if the user has already created an identity
  // (i.e. they have run `wellinformed peer status` or `peer add` at least once).
  // This keeps the daemon's network footprint zero for users who never use P2P.
  let liveNode: Libp2p | null = null;
  let liveSync: ShareSyncRegistry | null = null;
  let liveSearch: SearchRegistry | null = null; // Phase 17
  let liveHealthTracker: HealthTracker | null = null; // Phase 18
  const identityPath = join(deps.homePath, 'peer-identity.json');
  if (existsSync(identityPath)) {
    try {
      const cfgPath = join(deps.homePath, 'config.yaml');
      const cfgRes = await loadConfig(cfgPath);
      if (cfgRes.isErr()) {
        daemonLog(deps.homePath, `share sync skipped — config: ${formatError(cfgRes.error)}`);
      } else {
        const idRes = await loadOrCreateIdentity(identityPath);
        if (idRes.isErr()) {
          daemonLog(deps.homePath, `share sync skipped — identity: ${formatError(idRes.error)}`);
        } else {
          const nodeRes = await createNode(idRes.value, {
            listenPort: 0, // ephemeral — daemon does not need a fixed port for v1
            listenHost: '127.0.0.1',
            mdns: cfgRes.value.peer.mdns,
            dhtEnabled: cfgRes.value.peer.dht.enabled,
            peersPath: join(deps.homePath, 'peers.json'), // enables peer:discovery persistence
          });
          if (nodeRes.isErr()) {
            daemonLog(deps.homePath, `share sync skipped — libp2p: ${formatError(nodeRes.error)}`);
          } else {
            liveNode = nodeRes.value;

            // ── Phase 18: connection health tracker ──────────────────────────
            // Create the in-memory tracker and register the connection:close
            // listener. Pitfall 7: relay-TTL expiry fires connection:close with
            // conn.limits !== undefined — these are EXPECTED closures, NOT
            // genuine disconnects. Log as audit-only; do NOT mark degraded.
            liveHealthTracker = createHealthTracker();
            const healthTracker = liveHealthTracker;  // non-null ref for closure
            liveNode.addEventListener('connection:close', (evt) => {
              const conn = evt.detail;
              const peerId = conn.remotePeer.toString();
              if (conn.limits !== undefined) {
                // Relay TTL expiry — expected, not a genuine disconnect.
                // Pitfall 7: conn.limits is set on relay-with-TTL closures.
                // Log as audit-only; do NOT call recordDisconnect here.
                daemonLog(deps.homePath, `relay TTL expiry for ${peerId} (limits set, not marking degraded)`);
                return;
              }
              healthTracker.recordDisconnect(peerId);
              daemonLog(deps.homePath, `connection:close peer=${peerId}`);
            });
            daemonLog(deps.homePath, 'connection health tracker registered');

            // ── Phase 18: relay pre-dial ──────────────────────────────────────
            // Best-effort dial of each configured relay multiaddr. Failures are
            // logged but never crash the daemon — relay is an optional transport.
            if (cfgRes.value.peer.relays.length > 0) {
              for (const relayAddr of cfgRes.value.peer.relays) {
                try {
                  await dialAndTag(liveNode, relayAddr);
                  daemonLog(deps.homePath, `relay pre-dial ok: ${relayAddr}`);
                } catch (e) {
                  daemonLog(deps.homePath, `relay pre-dial failed (non-fatal): ${relayAddr} — ${(e as Error).message}`);
                }
              }
            }

            // Best-effort dial of every known peer so streams open on first tick.
            const peersRes = await loadPeers(join(deps.homePath, 'peers.json'));
            if (peersRes.isOk()) {
              for (const p of peersRes.value.peers) {
                for (const addr of p.addrs) {
                  try {
                    await dialAndTag(liveNode, addr);
                    daemonLog(deps.homePath, `dialed peer ${p.id} via ${addr}`);
                    break;  // one successful addr is enough
                  } catch {
                    // continue to next addr
                  }
                }
              }
            }
            liveSync = createShareSyncRegistry({
              node: liveNode,
              homePath: deps.homePath,
              graphRepo: deps.graphs,
              patterns: buildPatterns(cfgRes.value.security.secrets_patterns),
              maxUpdatesPerSecPerPeerPerRoom:
                cfgRes.value.peer.bandwidth.max_updates_per_sec_per_peer_per_room,
            });
            const reg = await registerShareProtocol(liveSync);
            if (reg.isErr()) {
              daemonLog(deps.homePath, `share sync register failed: ${formatError(reg.error)}`);
              liveSync = null;
            } else {
              daemonLog(deps.homePath, `share sync registered: /wellinformed/share/1.0.0`);
            }

            // Phase 17: register federated search protocol alongside share protocol.
            // Uses the SAME live libp2p node — separate protocol lifecycles per CONTEXT.md
            // locked decision, but one libp2p node hosts both. Independent of share success.
            liveSearch = createSearchRegistry(
              liveNode,
              deps.homePath,
              deps.vectors,
              cfgRes.value.peer.search_rate_limit.rate_per_sec,
              cfgRes.value.peer.search_rate_limit.burst,
            );
            const searchReg = await registerSearchProtocol(liveSearch);
            if (searchReg.isErr()) {
              daemonLog(deps.homePath, `search protocol register failed: ${formatError(searchReg.error)}`);
              liveSearch = null;
            } else {
              daemonLog(deps.homePath, `search protocol registered: /wellinformed/search/1.0.0`);
            }
          }
        }
      }
    } catch (e) {
      daemonLog(deps.homePath, `share sync bootstrap threw: ${(e as Error).message}`);
    }
  }

  // Splice the live registry and health tracker into deps so runOneTick sees them.
  const tickDeps: DaemonDeps = { ...deps, shareSync: liveSync, healthTracker: liveHealthTracker };

  const cleanup = async (): Promise<void> => {
    // Cleanup order: search → share → node.stop (per plan spec)
    if (liveSearch) {
      try { await unregisterSearchProtocol(liveSearch); } catch { /* benign */ }
    }
    if (liveSync) {
      try { await unregisterShareProtocol(liveSync); } catch { /* benign */ }
    }
    if (liveNode) {
      try { await liveNode.stop(); } catch { /* benign */ }
    }
    removePid(deps.homePath);
    daemonLog(deps.homePath, 'daemon stopped');
    process.exit(0);
  };
  process.on('SIGTERM', () => { void cleanup(); });
  process.on('SIGINT', () => { void cleanup(); });

  // Run immediately on start
  await runOneTick(tickDeps);

  // Then schedule
  const interval = setInterval(async () => {
    await runOneTick(tickDeps);
  }, deps.config.interval_seconds * 1000);

  // Keep the process alive
  interval.unref(); // allow process to exit on signal
  await new Promise<void>(() => {}); // block forever
};
