/**
 * Semantic L2 query cache — Phase 5.1 v4.1 primitive that catches
 * paraphrased queries the L1 exact-match cache misses.
 *
 * L1 (src/domain/query-cache.ts) keys on hash(cmd + args) — strict
 * string equality. "what's libp2p" misses against a cached "tell me
 * about libp2p". L2 keys on the query EMBEDDING and returns the
 * cached result for any prior query whose embedding is within
 * `similarity_threshold` cosine to the new one.
 *
 * Mechanics:
 *   - Stored entries: { vector, stdout, insertedAtMs }
 *   - get(queryVec, threshold) → linear scan; return the most-similar
 *     entry above threshold OR null
 *   - set(queryVec, stdout) → insert; evict LRU when over capacity
 *   - TTL: same 60s window as L1 (paraphrased queries that are minutes
 *     apart shouldn't be served stale)
 *
 * Linear scan is O(N × D) per get. At max 256 entries × 768 dim that's
 * 200K ops = ~10 µs in JS. Acceptable. ANN-assisted L2 is v4.3+ if
 * needed.
 *
 * Pure: no I/O, no classes, all sync. Process-local (no persistence).
 */

import type { Vector } from './vectors.js';

export interface SemanticCacheEntry {
  readonly vector: Vector;
  readonly stdout: string;
  readonly insertedAtMs: number;
}

export interface SemanticCacheStats {
  readonly size: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
  readonly hit_rate: number;
  readonly average_hit_similarity: number;
}

export interface SemanticCacheOptions {
  /** Max entries before LRU eviction. Default 128. */
  readonly maxEntries?: number;
  /** TTL in ms. Default 60_000. */
  readonly ttlMs?: number;
  /** Default cosine similarity threshold for hits. Default 0.92. */
  readonly defaultThreshold?: number;
  /** Clock for tests. Default () => Date.now(). */
  readonly clock?: () => number;
}

export interface SemanticCacheLookup {
  readonly stdout: string;
  readonly similarity: number;
  readonly insertedAtMs: number;
}

export interface SemanticCache {
  /**
   * Returns the best-matching cached entry above threshold, OR null.
   * Threshold defaults to the cache's defaultThreshold.
   */
  get(queryVec: Vector, threshold?: number): SemanticCacheLookup | null;
  /** Insert a (vector, stdout) entry; LRU-evict if over capacity. */
  set(queryVec: Vector, stdout: string): void;
  clear(): void;
  stats(): SemanticCacheStats;
}

const DEFAULTS: Required<SemanticCacheOptions> = {
  maxEntries: 128,
  ttlMs: 60_000,
  defaultThreshold: 0.92,
  clock: () => Date.now(),
};

const cosine = (a: Vector, b: Vector): number => {
  // Both inputs assumed to be unit-normalized (embed pipeline ensures
  // this). Skip renorm in the hot loop.
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
};

export const semanticCache = (opts: SemanticCacheOptions = {}): SemanticCache => {
  const cfg: Required<SemanticCacheOptions> = { ...DEFAULTS, ...opts };
  if (cfg.maxEntries < 1) throw new Error(`semanticCache: maxEntries must be ≥1, got ${cfg.maxEntries}`);
  if (cfg.ttlMs < 0) throw new Error(`semanticCache: ttlMs must be ≥0, got ${cfg.ttlMs}`);
  if (cfg.defaultThreshold < -1 || cfg.defaultThreshold > 1) {
    throw new Error(`semanticCache: defaultThreshold must be in [-1, 1], got ${cfg.defaultThreshold}`);
  }

  // We use an array (insertion-order) so we can do LRU-by-rotation
  // cheaply. For 128 entries the linear scan is fine; if scaling
  // beyond 1K we'd need an ANN structure.
  const entries: Array<SemanticCacheEntry> = [];
  let hits = 0;
  let misses = 0;
  let evictions = 0;
  let hitSimilaritySum = 0;

  const evictExpired = (now: number): void => {
    let writeIdx = 0;
    for (let readIdx = 0; readIdx < entries.length; readIdx++) {
      if (now - entries[readIdx].insertedAtMs <= cfg.ttlMs) {
        if (readIdx !== writeIdx) entries[writeIdx] = entries[readIdx];
        writeIdx++;
      }
    }
    if (writeIdx < entries.length) {
      const dropped = entries.length - writeIdx;
      entries.length = writeIdx;
      evictions += dropped;
    }
  };

  return {
    get: (queryVec, threshold) => {
      const now = cfg.clock();
      evictExpired(now);
      const t = threshold ?? cfg.defaultThreshold;
      let bestIdx = -1;
      let bestSim = -Infinity;
      for (let i = 0; i < entries.length; i++) {
        const sim = cosine(queryVec, entries[i].vector);
        if (sim > bestSim) {
          bestSim = sim;
          bestIdx = i;
        }
      }
      if (bestIdx < 0 || bestSim < t) {
        misses++;
        return null;
      }
      // LRU touch — move best to end of array
      const hit = entries[bestIdx];
      entries.splice(bestIdx, 1);
      entries.push(hit);
      hits++;
      hitSimilaritySum += bestSim;
      return { stdout: hit.stdout, similarity: bestSim, insertedAtMs: hit.insertedAtMs };
    },
    set: (queryVec, stdout) => {
      const now = cfg.clock();
      evictExpired(now);
      // Insert at end (most recently used)
      entries.push({ vector: queryVec, stdout, insertedAtMs: now });
      while (entries.length > cfg.maxEntries) {
        entries.shift();
        evictions++;
      }
    },
    clear: () => { entries.length = 0; },
    stats: () => {
      const total = hits + misses;
      return {
        size: entries.length,
        hits,
        misses,
        evictions,
        hit_rate: total > 0 ? hits / total : 0,
        average_hit_similarity: hits > 0 ? hitSimilaritySum / hits : 0,
      };
    },
  };
};
