/**
 * Connection health — in-memory passive monitoring for NET-04.
 *
 * NO file I/O, NO libp2p imports. This module is a thin state container
 * the daemon populates by listening to libp2p's `connection:close` event
 * and calling recordDisconnect. Share-sync and search-sync success paths
 * call recordStream when a stream opens cleanly.
 *
 * Degraded heuristic (CONTEXT.md locked):
 *   - 3+ disconnects within the last 60s (sliding window), OR
 *   - No successful stream in the last 5 minutes
 *
 * Pitfall 7 mitigation: callers MUST filter relay TTL expiry closures
 * BEFORE calling recordDisconnect. The Connection event detail has
 * `.limits !== undefined` on relay-limited closures — these are expected,
 * not unexpected. This module does NOT know about Connection objects.
 *
 * State is ephemeral — resets on daemon restart (CONTEXT.md decision: no
 * health.json file to avoid stale state).
 */

const DISCONNECT_WINDOW_MS = 60_000;        // 60s sliding window
const DISCONNECT_THRESHOLD = 3;              // 3+ disconnects = degraded
const IDLE_THRESHOLD_MS = 5 * 60 * 1000;    // 5 minutes no stream = degraded

export interface PeerHealth {
  readonly disconnectTimestamps: readonly number[];  // epoch ms, within sliding window
  readonly lastStreamAt: number;                     // epoch ms (0 = never)
  readonly health: 'ok' | 'degraded';
  readonly reason?: 'disconnects' | 'idle';          // only set when degraded
}

export interface HealthTracker {
  recordDisconnect(peerId: string, nowMs?: number): void;
  recordStream(peerId: string, nowMs?: number): void;
  getHealth(peerId: string, nowMs?: number): PeerHealth;
  checkAll(nowMs?: number): ReadonlyMap<string, PeerHealth>;
}

interface MutableState {
  disconnects: number[];   // epoch ms, pruned to sliding window on every access
  lastStreamAt: number;    // 0 = never
}

export const createHealthTracker = (): HealthTracker => {
  const state = new Map<string, MutableState>();

  const getOrInit = (peerId: string): MutableState => {
    const existing = state.get(peerId);
    if (existing) return existing;
    const fresh: MutableState = { disconnects: [], lastStreamAt: 0 };
    state.set(peerId, fresh);
    return fresh;
  };

  const pruneWindow = (disconnects: number[], nowMs: number): number[] =>
    disconnects.filter((t) => nowMs - t < DISCONNECT_WINDOW_MS);

  const computeHealth = (
    disconnects: readonly number[],
    lastStreamAt: number,
    nowMs: number,
  ): PeerHealth => {
    const windowed = disconnects.filter((t) => nowMs - t < DISCONNECT_WINDOW_MS);
    if (windowed.length >= DISCONNECT_THRESHOLD) {
      return {
        disconnectTimestamps: windowed,
        lastStreamAt,
        health: 'degraded',
        reason: 'disconnects',
      };
    }
    // Idle check: ignore if peer has never opened a stream (lastStreamAt === 0
    // AND no disconnects — we simply don't know this peer yet) OR if it has
    // a recent stream.
    if (lastStreamAt !== 0 && nowMs - lastStreamAt > IDLE_THRESHOLD_MS) {
      return {
        disconnectTimestamps: windowed,
        lastStreamAt,
        health: 'degraded',
        reason: 'idle',
      };
    }
    return {
      disconnectTimestamps: windowed,
      lastStreamAt,
      health: 'ok',
    };
  };

  return {
    recordDisconnect: (peerId: string, nowMs: number = Date.now()): void => {
      const s = getOrInit(peerId);
      s.disconnects = pruneWindow(s.disconnects, nowMs);
      s.disconnects.push(nowMs);
    },
    recordStream: (peerId: string, nowMs: number = Date.now()): void => {
      const s = getOrInit(peerId);
      s.lastStreamAt = nowMs;
    },
    getHealth: (peerId: string, nowMs: number = Date.now()): PeerHealth => {
      const s = state.get(peerId);
      if (!s) {
        return {
          disconnectTimestamps: [],
          lastStreamAt: 0,
          health: 'ok',
        };
      }
      return computeHealth(s.disconnects, s.lastStreamAt, nowMs);
    },
    checkAll: (nowMs: number = Date.now()): ReadonlyMap<string, PeerHealth> => {
      const out = new Map<string, PeerHealth>();
      for (const [peerId, s] of state.entries()) {
        out.set(peerId, computeHealth(s.disconnects, s.lastStreamAt, nowMs));
      }
      return out;
    },
  };
};
