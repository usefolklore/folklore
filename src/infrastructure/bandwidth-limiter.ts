/**
 * Shared bandwidth primitives for Phase 18 production networking.
 *
 * NET-02 layered limits (CONTEXT.md locked):
 *   - Per-peer-per-room token bucket — reuses createRateLimiter from Phase 17
 *     search-sync.ts via re-export (single source of truth, Pitfall 5 —
 *     18-RESEARCH.md lines 249-275). The rate limiter's Pitfall 7 inline
 *     idle eviction carries over unchanged.
 *   - Daemon-tick semaphore on concurrent outbound share syncs (NEW here).
 *
 * This module has NO libp2p imports — it is pure primitives so tests can
 * run without spinning up a node.
 */
export { createRateLimiter, type RateLimiter } from './search-sync.js';

/**
 * Counting semaphore — bounded concurrency primitive.
 * Used by runShareSyncTick to cap `max_concurrent_share_syncs` in-flight streams.
 *
 * Pattern 5 (18-RESEARCH.md): trivial counter + guard. A promise-queue
 * implementation adds unnecessary complexity when tryAcquire is non-blocking.
 */
export interface Semaphore {
  /** Attempt to acquire one slot. Returns true if granted, false if at capacity. */
  tryAcquire(): boolean;
  /** Release one slot. No-op if already at zero (defensive — Test 6). */
  release(): void;
  /** Current available slots. */
  available(): number;
}

export const createSemaphore = (maxConcurrent: number): Semaphore => {
  let active = 0;
  return {
    tryAcquire: (): boolean => {
      if (active >= maxConcurrent) return false;
      active++;
      return true;
    },
    release: (): void => {
      if (active > 0) active--;  // defensive: never go negative
    },
    available: (): number => maxConcurrent - active,
  };
};
