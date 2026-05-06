/**
 * Unit tests — bounded job queue backpressure.
 *
 * Locks the contract added in the multi-LLM round-2 review:
 *   - submit returns null when MAX_QUEUED is reached
 *   - DEDUP_KINDS collapse repeated identical payloads to the
 *     existing queued id
 *   - depth() reports queued/running counts non-allocatingly
 *
 * The runner is stubbed to never resolve so we can poke the queue
 * without the worker draining it during the test window.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startJobQueue, type JobQueue } from '../src/daemon/job-queue.js';
import type { JobPayload } from '../src/domain/job.js';

const tmpHome = (): string => mkdtempSync(join(tmpdir(), 'wi-queue-'));

const stuckRunner = async (): Promise<string> =>
  new Promise<string>(() => { /* never resolves */ });

const makeQueue = (homePath: string): JobQueue =>
  startJobQueue({ homePath, runner: stuckRunner });

test('depth() returns 0/0/1000 for an empty queue', () => {
  const home = tmpHome();
  try {
    const q = makeQueue(home);
    const d = q.depth();
    assert.equal(d.queued, 0);
    assert.equal(d.running, 0);
    assert.equal(d.max_queued, 1000);
    q.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('dedupes ingest:session — same payload returns same id', () => {
  const home = tmpHome();
  try {
    const q = makeQueue(home);
    const payload: JobPayload = { kind: 'ingest:session' };
    const id1 = q.submit(payload);
    const id2 = q.submit(payload);
    const id3 = q.submit(payload);
    assert.ok(id1 !== null);
    assert.equal(id1, id2);
    assert.equal(id1, id3);
    // depth shouldn't grow past 1
    assert.ok(q.depth().queued <= 1, `expected ≤1, got ${q.depth().queued}`);
    q.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('dedupes ingest:batch — identical payload (same room + paths) collapses', () => {
  const home = tmpHome();
  try {
    const q = makeQueue(home);
    const payload: JobPayload = { kind: 'ingest:batch', room: 'r', paths: ['a.md', 'b.md'] };
    const id1 = q.submit(payload);
    const id2 = q.submit({ ...payload }); // structurally identical
    assert.equal(id1, id2);
    assert.ok(q.depth().queued <= 1);
    q.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('does NOT dedupe across different ingest:batch payloads', () => {
  const home = tmpHome();
  try {
    const q = makeQueue(home);
    const id1 = q.submit({ kind: 'ingest:batch', room: 'r', paths: ['a.md'] });
    const id2 = q.submit({ kind: 'ingest:batch', room: 'r', paths: ['b.md'] });
    assert.ok(id1 !== null && id2 !== null);
    assert.notEqual(id1, id2, 'distinct payloads must produce distinct ids');
    q.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('rejects with null when queue exceeds MAX_QUEUED (1000)', () => {
  // Each submit gets a unique payload (different paths) so dedupe doesn't fire.
  const home = tmpHome();
  try {
    const q = makeQueue(home);
    let lastId: string | null = '';
    for (let i = 0; i < 1000; i++) {
      lastId = q.submit({
        kind: 'ingest:batch',
        room: 'r',
        paths: [`file-${i}.md`],
      });
    }
    // 1000th submit accepted; 1001st must reject because the worker
    // is stuck (stubbed runner) so nothing has drained.
    assert.ok(lastId !== null, '1000th submit should still succeed');
    const rejected = q.submit({
      kind: 'ingest:batch',
      room: 'r',
      paths: ['overflow.md'],
    });
    // Worker may have promoted one job to running; allow up to 999
    // queued + 1 running. We need to verify the OVERFLOW path fires
    // when truly at cap. Force it:
    let nullsSeen = 0;
    for (let i = 0; i < 50; i++) {
      const r = q.submit({
        kind: 'ingest:batch',
        room: 'r',
        paths: [`overflow-${i}.md`],
      });
      if (r === null) nullsSeen++;
    }
    // At least one rejection in the burst — we just submitted >max.
    assert.ok(nullsSeen >= 1 || rejected === null, 'expected overflow rejections');
    q.stop();
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
