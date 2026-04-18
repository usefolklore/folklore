/**
 * Query cache — pure domain LRU with TTL for the L1 working-memory
 * layer of Phase 5 (v4 Agent Brain plan).
 *
 * Keyed by a hash of (query_text | room | k); value is the serialized
 * stdout of the handler that produced it. TTL defaults to 60 s so a
 * burst of agent refinement queries all hit cache, but stale entries
 * aren't served past the graph's natural write cadence.
 *
 * Why cache the stdout string rather than the Match[] array:
 *   - The IPC handler's return value IS the stdout string. Caching it
 *     avoids re-formatting matches + re-joining the graph on hit.
 *   - Serialized strings are immutable, easy to compare for tests.
 *   - Invalidation on ingest is coarse (clear everything) — the hit
 *     rate we're chasing (≥30% on a refinement burst) doesn't need
 *     fine-grained invalidation.
 *
 * Pure: no I/O, no classes, all ops synchronous. Node-runtime caller
 * owns the cache instance and passes it into the IPC handler.
 *
 * The eviction policy is classic LRU — the least-recently-*accessed*
 * entry gets evicted when size > maxEntries. Map's insertion-order
 * guarantee lets us do this with zero extra bookkeeping.
 */

import { createHash } from 'node:crypto';

// ─────────────── public types ───────────────

export interface QueryCacheEntry {
  /** ISO-8601 timestamp of insertion. Used for TTL. */
  readonly insertedAt: string;
  /** Cached handler stdout. */
  readonly stdout: string;
}

export interface QueryCacheStats {
  readonly size: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly hit_rate: number;
}

export interface QueryCacheOptions {
  /** Max entries before LRU eviction. Default 256. */
  readonly maxEntries?: number;
  /** TTL in milliseconds. Default 60_000 (60 s). */
  readonly ttlMs?: number;
  /** Clock injection for tests. Default () => Date.now(). */
  readonly clock?: () => number;
}

export interface QueryCache {
  /** Compute the canonical cache key for a (cmd, args) tuple. */
  keyFor(cmd: string, args: readonly string[]): string;
  /** Fetch — null if miss OR expired (expired entries are deleted). */
  get(key: string): QueryCacheEntry | null;
  /** Insert; evicts the LRU entry if we're at capacity. */
  set(key: string, stdout: string): void;
  /** Clear all entries. */
  clear(): void;
  /** Observability. */
  stats(): QueryCacheStats;
}

// ─────────────── implementation ───────────────

const DEFAULTS: Required<QueryCacheOptions> = {
  maxEntries: 256,
  ttlMs: 60_000,
  clock: () => Date.now(),
};

/**
 * Build an in-memory LRU cache with TTL. Zero-allocation on hit
 * (reuses the stored entry's string + just touches the Map order).
 */
export const queryCache = (opts: QueryCacheOptions = {}): QueryCache => {
  const cfg: Required<QueryCacheOptions> = { ...DEFAULTS, ...opts };
  if (cfg.maxEntries < 1) throw new Error(`queryCache: maxEntries must be ≥1, got ${cfg.maxEntries}`);
  if (cfg.ttlMs < 0) throw new Error(`queryCache: ttlMs must be ≥0, got ${cfg.ttlMs}`);

  const store = new Map<string, { insertedAtMs: number; stdout: string }>();
  let hits = 0;
  let misses = 0;
  let evictions = 0;

  const keyFor = (cmd: string, args: readonly string[]): string => {
    // Canonicalize args: sort non-positional flags for stable keys, but
    // preserve positional order. For the `ask` command specifically the
    // query is positional (non-flag), and --room / --k / --json are
    // flags. Simpler safe approach: hash the full (cmd, args) as-is,
    // since the client passes them in a deterministic order anyway.
    const h = createHash('sha256');
    h.update(cmd);
    h.update('\x00');
    for (const a of args) { h.update(a); h.update('\x01'); }
    return h.digest('hex').slice(0, 32);
  };

  const get = (key: string): QueryCacheEntry | null => {
    const now = cfg.clock();
    const v = store.get(key);
    if (!v) { misses++; return null; }
    if (now - v.insertedAtMs > cfg.ttlMs) {
      // Expired — evict + miss
      store.delete(key);
      misses++;
      return null;
    }
    // LRU touch: delete + re-insert to move to end of Map iteration order
    store.delete(key);
    store.set(key, v);
    hits++;
    return { insertedAt: new Date(v.insertedAtMs).toISOString(), stdout: v.stdout };
  };

  const set = (key: string, stdout: string): void => {
    // Overwrite existing or insert new
    if (store.has(key)) store.delete(key);
    store.set(key, { insertedAtMs: cfg.clock(), stdout });
    // Evict LRU if over capacity. Map iterates insertion order, so the
    // first key is the oldest.
    while (store.size > cfg.maxEntries) {
      const firstKey = store.keys().next().value;
      if (firstKey === undefined) break;
      store.delete(firstKey);
      evictions++;
    }
  };

  const clear = (): void => {
    store.clear();
    // Intentionally do NOT reset the counters — cumulative metrics
    // are more useful for observability.
  };

  const stats = (): QueryCacheStats => {
    const total = hits + misses;
    return {
      size: store.size,
      hits,
      misses,
      evictions,
      hit_rate: total > 0 ? hits / total : 0,
    };
  };

  return { keyFor, get, set, clear, stats };
};
