/**
 * Tiny single-resource async mutex. Single-process serialization
 * point for load-modify-save sequences against shared file state
 * (graph.json today; vectors.db is sqlite-WAL-locked already).
 *
 * The cross-process lock in src/infrastructure/process-lock.ts
 * keeps OTHER akashik processes off the files; this mutex
 * keeps multiple in-process callers (daemon tick + job worker) off
 * each other. They both go through the same Runtime, so a singleton
 * shared via Runtime.graphMutex is exactly what's needed to close
 * the lost-update window flagged in the recent review.
 *
 * No queue ordering, no priority — FIFO via promise chain. Pure JS.
 */

export interface AsyncMutex {
  /**
   * Run `fn` while holding the lock. Awaits the previous holder,
   * then runs and releases — even if `fn` throws. The returned
   * promise resolves with `fn`'s value or rejects with `fn`'s error.
   */
  runExclusive<T>(fn: () => Promise<T>): Promise<T>;
}

export const asyncMutex = (): AsyncMutex => {
  // The "tail" of the queue — the promise to await before the next
  // critical section starts. Each runExclusive chains itself onto
  // this tail; failure inside fn doesn't break the chain (we always
  // resolve the inner promise to unblock the next waiter).
  let tail: Promise<void> = Promise.resolve();

  const runExclusive = async <T>(fn: () => Promise<T>): Promise<T> => {
    let release: () => void = () => undefined;
    const next = new Promise<void>((resolve) => { release = resolve; });
    const prev = tail;
    tail = prev.then(() => next);

    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  };

  return { runExclusive };
};
