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
import type { AppError, ShareError } from '../domain/errors.js';
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
import { ensureSessionsRoom, enforceRetention } from '../application/session-ingest.js';
import { refreshHotCache } from '../application/hot-cache-tick.js';
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
  createTouchRegistry,
  registerTouchProtocol,
  unregisterTouchProtocol,
  type TouchRegistry,
} from '../infrastructure/touch-protocol.js';
import {
  TOUCH_DEFAULT_RATE_PER_SEC,
  TOUCH_DEFAULT_BURST,
} from '../domain/touch.js';
import {
  subscribeOracle,
  type SubscribeHandle as OracleSubscribeHandle,
} from '../infrastructure/oracle-gossip.js';
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
  // Phase 20 — auto-provision sessions room + register claude_sessions source.
  // Idempotent: rooms.create deduplicates, sources.add deduplicates, mutateSharedRooms deduplicates.
  ensureSessionsRoom({ rooms: deps.rooms, sources: deps.sources, homePath: deps.homePath })
    .orElse((e) => {
      daemonLog(deps.homePath, `ensureSessionsRoom failed: ${formatError(e)}`);
      return okAsync<void, AppError>(undefined);
    })
    .andThen(() =>
      deps.rooms
        .load()
        .mapErr((e): AppError => e),
    )
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
        daemonLog(deps.homePath, 'share sync tick: skipped (no registry)');
        return okAsync<TickResult, AppError>(tickResult);
      }
      const peerCount = deps.shareSync.node.getPeers().length;
      daemonLog(
        deps.homePath,
        `share sync tick: starting (connected_peers=${peerCount})`,
      );
      return runShareSyncTick(deps.shareSync)
        .map((sync) => {
          daemonLog(deps.homePath, `share sync tick: opened=${sync.opened}`);
          return tickResult;
        })
        .orElse((e) => {
          daemonLog(deps.homePath, `share sync error: ${formatError(e)}`);
          return okAsync<TickResult, AppError>(tickResult);
        });
    })
    .andThen((tickResult) => {
      // Phase 20 retention pass — prune old session nodes lacking key signals.
      // Load config.yaml for retention_days; fall back to 30 on error.
      return loadConfig(join(deps.homePath, 'config.yaml'))
        .mapErr((e): AppError => e)
        .andThen((cfg) => {
          const retentionDays = cfg.sessions?.retention_days ?? 30;
          return enforceRetention({ graphs: deps.graphs }, retentionDays)
            .map((dropped) => {
              if (dropped > 0) {
                daemonLog(
                  deps.homePath,
                  `retention: dropped ${dropped} session nodes older than ${retentionDays} days`,
                );
              }
              return tickResult;
            })
            .orElse((e): ResultAsync<TickResult, AppError> => {
              daemonLog(deps.homePath, `retention error: ${formatError(e)}`);
              return okAsync<TickResult, AppError>(tickResult);
            });
        })
        .orElse((e): ResultAsync<TickResult, AppError> => {
          daemonLog(deps.homePath, `retention config error: ${formatError(e)}`);
          return okAsync<TickResult, AppError>(tickResult);
        });
    })
    .andThen((tickResult) => {
      // Phase 32 — refresh the hot cache after every tick so Claude
      // sessions starting between ticks always see a current recency
      // digest. Failures are logged, never fatal to the tick chain.
      return refreshHotCache(deps.graphs, deps.homePath)
        .map(() => tickResult)
        .orElse((e): ResultAsync<TickResult, AppError> => {
          daemonLog(deps.homePath, `hot cache error: ${formatError(e)}`);
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
  let liveTouch: TouchRegistry | null = null; // Phase 31
  let liveOracle: OracleSubscribeHandle | null = null; // Phase 39 — pubsub
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
            listenPort: cfgRes.value.peer.port,
            listenHost: cfgRes.value.peer.listen_host,
            mdns: cfgRes.value.peer.mdns,
            dhtEnabled: cfgRes.value.peer.dht.enabled,
            peersPath: join(deps.homePath, 'peers.json'), // enables peer:discovery persistence
            relays: cfgRes.value.peer.relays,
            upnp: cfgRes.value.peer.upnp,
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

              // P2P-sync bug fix: the daemon's main-tick share sync cadence is
              // tied to research-tick interval (daily by default), which leaves
              // new connections unsynced for up to 24 hours. Two complementary
              // triggers close the gap:
              //   1. Immediate tick right after registration — covers peers
              //      dialed during startup.
              //   2. Reactive tick on every connection:open — covers inbound
              //      peer connections, reconnects, and late-discovered peers.
              const syncRegistry = liveSync;
              void runShareSyncTick(syncRegistry)
                .map((sync) => {
                  daemonLog(
                    deps.homePath,
                    `share sync tick (startup): opened=${sync.opened}`,
                  );
                  return undefined;
                })
                .orElse((e) => {
                  daemonLog(
                    deps.homePath,
                    `share sync tick (startup) error: ${formatError(e)}`,
                  );
                  return okAsync<undefined, ShareError>(undefined);
                });

              liveNode.addEventListener('connection:open', (evt) => {
                const conn = evt.detail;
                const peerId = conn.remotePeer.toString();
                daemonLog(
                  deps.homePath,
                  `connection:open peer=${peerId} — triggering share sync tick`,
                );
                void runShareSyncTick(syncRegistry)
                  .map((sync) => {
                    daemonLog(
                      deps.homePath,
                      `share sync tick (on-connect): opened=${sync.opened}`,
                    );
                    return undefined;
                  })
                  .orElse((e) => {
                    daemonLog(
                      deps.homePath,
                      `share sync tick (on-connect) error: ${formatError(e)}`,
                    );
                    return okAsync<undefined, ShareError>(undefined);
                  });
              });
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

            // Phase 31: register asymmetric touch protocol — one-shot pull
            // of a remote peer's shared-room graph with pre-transmission
            // redaction via secret-gate. Separate registry, shared libp2p
            // node, stricter rate limit than search (touch is heavier).
            liveTouch = createTouchRegistry(
              liveNode,
              deps.homePath,
              deps.graphs,
              TOUCH_DEFAULT_RATE_PER_SEC,
              TOUCH_DEFAULT_BURST,
              cfgRes.value.security.secrets_patterns,
            );
            const touchReg = await registerTouchProtocol(liveTouch);
            if (touchReg.isErr()) {
              daemonLog(deps.homePath, `touch protocol register failed: ${formatError(touchReg.error)}`);
              liveTouch = null;
            } else {
              daemonLog(deps.homePath, `touch protocol registered: /wellinformed/touch/1.0.0`);
            }

            // Phase 39 — Layer B oracle pubsub. Subscribe to the
            // /wellinformed/oracle/1.0.0 topic so inbound questions and
            // answers from connected peers land in the local graph in
            // real-time (seconds, not minutes). Upserts run through the
            // same remote-node-validator as touch, so the trust boundary
            // stays identical. Subscribe is fire-and-forget: a failure
            // to subscribe is logged and the daemon keeps running on
            // Layer A (touch + CRDT) alone.
            const oracleSub = await subscribeOracle(liveNode, {
              graphRepo: deps.graphs,
              onAccepted: (msg, fromPeer) => {
                daemonLog(deps.homePath, `oracle inbound ${msg.kind} from peer=${fromPeer} id=${msg.node.id}`);
              },
              onRejected: (reason, fromPeer) => {
                daemonLog(deps.homePath, `oracle rejected from peer=${fromPeer} reason=${reason}`);
              },
            });
            if (oracleSub.isErr()) {
              daemonLog(deps.homePath, `oracle subscribe failed (Layer B disabled): ${formatError(oracleSub.error)}`);
            } else {
              liveOracle = oracleSub.value;
              daemonLog(deps.homePath, `oracle pubsub subscribed: /wellinformed/oracle/1.0.0`);
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
    // Cleanup order: oracle pubsub → touch → search → share → node.stop
    if (liveOracle) {
      try { liveOracle.unsubscribe(); } catch { /* benign */ }
    }
    if (liveTouch) {
      try { await unregisterTouchProtocol(liveTouch); } catch { /* benign */ }
    }
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
