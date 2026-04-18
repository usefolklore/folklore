/**
 * Tests for src/infrastructure/process-lock.ts — v4.1 cross-process
 * write lock primitive.
 *
 * Covers:
 *   - acquireLock + release round-trip
 *   - exclusive: second acquire fails with conflict info
 *   - waitMs: second acquire waits for first to release
 *   - stale lock (process gone): re-acquired forcibly
 *   - stale lock (timestamp old): re-acquired forcibly
 *   - peekLock: non-blocking inspection
 *   - refresh extends the staleness window
 *   - release is idempotent
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireLock, peekLock, lockPath } from '../src/infrastructure/process-lock.ts';

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'wi-lock-'));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('acquire + release', () => {
  it('round-trips a single locker', async () => {
    const r = await acquireLock(home, { owner: 'test' });
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    assert.equal(r.value.owner, 'test');
    assert.ok(existsSync(r.value.path));
    await r.value.release();
    assert.ok(!existsSync(r.value.path));
  });

  it('exclusive: second acquire fails immediately when waitMs=0', async () => {
    const a = await acquireLock(home, { owner: 'first' });
    assert.ok(a.isOk());
    if (!a.isOk()) return;
    try {
      const b = await acquireLock(home, { owner: 'second' });
      assert.ok(b.isErr(), 'second acquire should fail');
      if (b.isErr()) {
        // Error message should mention the holder's owner tag
        const formatted = JSON.stringify(b.error);
        assert.ok(formatted.includes('first'), `expected error to name 'first', got: ${formatted}`);
      }
    } finally {
      await a.value.release();
    }
  });

  it('release is idempotent', async () => {
    const r = await acquireLock(home, { owner: 'test' });
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    await r.value.release();
    await r.value.release(); // should not throw
    assert.ok(!existsSync(r.value.path));
  });
});

describe('wait + retry', () => {
  it('waitMs: second acquire succeeds after first releases', async () => {
    const a = await acquireLock(home, { owner: 'first' });
    assert.ok(a.isOk());
    if (!a.isOk()) return;
    // Schedule release in 50ms
    setTimeout(() => { void a.value.release(); }, 50);
    const t0 = Date.now();
    const b = await acquireLock(home, { owner: 'second', waitMs: 500, pollIntervalMs: 25 });
    const elapsed = Date.now() - t0;
    assert.ok(b.isOk(), `second should acquire after waiting; got ${b.isErr() ? JSON.stringify(b.error) : ''}`);
    if (b.isOk()) {
      assert.ok(elapsed >= 50, `should have waited ≥50ms, got ${elapsed}`);
      assert.ok(elapsed < 500, 'should have acquired before deadline');
      assert.equal(b.value.owner, 'second');
      await b.value.release();
    }
  });

  it('waitMs: times out when holder never releases', async () => {
    const a = await acquireLock(home, { owner: 'never-releases' });
    assert.ok(a.isOk());
    if (!a.isOk()) return;
    try {
      const b = await acquireLock(home, { owner: 'wait', waitMs: 100, pollIntervalMs: 25 });
      assert.ok(b.isErr(), 'should time out');
    } finally {
      await a.value.release();
    }
  });
});

describe('stale lock recovery', () => {
  it('breaks lock from a non-existent PID', async () => {
    // Manually plant a lock file with a PID that doesn't exist
    const path = lockPath(home);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(home, { recursive: true });
    await writeFile(path, JSON.stringify({
      pid: 999_999_999, // very unlikely to exist
      owner: 'crashed',
      timestamp: Date.now(),
    }));

    const r = await acquireLock(home, { owner: 'recovery', staleAfterMs: 60_000 });
    assert.ok(r.isOk(), `should break stale lock; got ${r.isErr() ? JSON.stringify(r.error) : ''}`);
    if (r.isOk()) await r.value.release();
  });

  it('breaks lock with timestamp older than staleAfterMs', async () => {
    const path = lockPath(home);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(home, { recursive: true });
    await writeFile(path, JSON.stringify({
      pid: process.pid, // alive process
      owner: 'old',
      timestamp: Date.now() - 5_000, // 5s old
    }));

    // staleAfterMs=1000 → 5s-old lock is stale
    const r = await acquireLock(home, { owner: 'recovery', staleAfterMs: 1_000 });
    assert.ok(r.isOk(), `should break stale-by-time lock; got ${r.isErr() ? JSON.stringify(r.error) : ''}`);
    if (r.isOk()) await r.value.release();
  });
});

describe('peekLock', () => {
  it('returns null when no lock', async () => {
    const r = await peekLock(home);
    assert.ok(r.isOk());
    if (r.isOk()) assert.equal(r.value, null);
  });

  it('returns lock info when held', async () => {
    const a = await acquireLock(home, { owner: 'holder' });
    assert.ok(a.isOk());
    if (!a.isOk()) return;
    try {
      const r = await peekLock(home);
      assert.ok(r.isOk());
      if (r.isOk()) {
        assert.ok(r.value);
        assert.equal(r.value!.owner, 'holder');
        assert.equal(r.value!.pid, process.pid);
      }
    } finally {
      await a.value.release();
    }
  });
});

describe('refresh', () => {
  it('extends the staleness window', async () => {
    const a = await acquireLock(home, { owner: 'long-runner' });
    assert.ok(a.isOk());
    if (!a.isOk()) return;
    try {
      const peeked1 = await peekLock(home);
      const ts1 = peeked1.isOk() && peeked1.value ? peeked1.value.timestamp : 0;

      // Wait + refresh
      await new Promise((r) => setTimeout(r, 20));
      await a.value.refresh();

      const peeked2 = await peekLock(home);
      const ts2 = peeked2.isOk() && peeked2.value ? peeked2.value.timestamp : 0;
      assert.ok(ts2 >= ts1, `refresh should bump timestamp: ${ts1} → ${ts2}`);
      assert.ok(ts2 - ts1 >= 15, `bump should be at least the wait time: ${ts2 - ts1}ms`);
    } finally {
      await a.value.release();
    }
  });
});
