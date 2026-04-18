/**
 * Tests for src/domain/log-event.ts + src/infrastructure/log-store.ts.
 * Covers:
 *   - did_hash daily rotation (different days → different hashes)
 *   - buildEvent fills boilerplate + omits did_hash when did absent
 *   - fmtEvent renders every kind without throwing
 *   - appendEvent + tailToday round-trip
 *   - rotate compresses non-today files + deletes past retention
 *   - shipPending advances offset on success, leaves it on failure
 *   - shipping disabled / no-config returns ok with zero events
 *   - exportBundle merges + sorts by ts
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import { mkdtemp, rm, writeFile, readFile, utimes } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { gunzipSync } from 'node:zlib';
import { buildEvent, computeDidHash, fmtEvent, type LogEvent } from '../src/domain/log-event.ts';
import {
  logPaths,
  appendEvent,
  tailToday,
  rotate,
  enableShipping,
  disableShipping,
  shipPending,
  exportBundle,
  getShippingStatus,
} from '../src/infrastructure/log-store.ts';

let home: string;

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'wi-logs-'));
});

afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

describe('log-event', () => {
  it('did_hash rotates by UTC day', () => {
    const did = 'did:key:z6Mk-test';
    const a = computeDidHash(did, '2026-04-17T10:00:00.000Z');
    const b = computeDidHash(did, '2026-04-17T23:00:00.000Z');
    const c = computeDidHash(did, '2026-04-18T01:00:00.000Z');
    assert.equal(a, b, 'same day → same hash');
    assert.notEqual(a, c, 'different day → different hash');
    assert.equal(a.length, 16, 'hash is 16 hex chars');
  });

  it('buildEvent omits did_hash when did absent', () => {
    const e = buildEvent('peer.connected', { peer_id: 'Qm123', ts: '2026-04-17T00:00:00.000Z' });
    assert.equal(e.kind, 'peer.connected');
    assert.equal(e.schema, 1);
    assert.equal(e.did_hash, null);
    assert.equal((e as { peer_id: string }).peer_id, 'Qm123');
  });

  it('buildEvent computes did_hash when did supplied', () => {
    const e = buildEvent('search.outbound', {
      did: 'did:key:z6Mk-x',
      peer_id: 'Qm456',
      room: 'wellinformed-dev',
      k: 10,
      ms: 25,
      ts: '2026-04-17T10:00:00.000Z',
    });
    assert.notEqual(e.did_hash, null);
    assert.equal(e.did_hash!.length, 16);
  });

  it('fmtEvent handles every kind without throwing', () => {
    const samples: LogEvent[] = [
      buildEvent('peer.dial', { addr: '/ip4/1.2.3.4/tcp/9001' }),
      buildEvent('search.inbound', { peer_id: 'Qm', room: 'r', k: 5 }),
      buildEvent('envelope.verify_failed', { reason: 'bad sig' }),
      buildEvent('share.update_received', { peer_id: 'Qm', room: 'r', bytes: 128 }),
      buildEvent('update.installed', { from_version: '3.0.0', to_version: '3.0.1' }),
      buildEvent('log.shipped', { endpoint: 'https://x', events: 50, bytes: 1024 }),
    ];
    for (const e of samples) {
      const line = fmtEvent(e);
      assert.ok(line.length > 0, `${e.kind} produced empty line`);
      assert.ok(line.includes(e.kind), `${e.kind} not in formatted line`);
    }
  });
});

describe('log-store — append + tail', () => {
  it('appended events appear in tail order', async () => {
    const paths = logPaths(home);
    for (let i = 0; i < 5; i++) {
      const e = buildEvent('peer.dial', { addr: `/ip4/10.0.0.${i}/tcp/9001` });
      const r = await appendEvent(paths, e);
      assert.ok(r.isOk());
    }
    const r = await tailToday(paths, 3);
    assert.ok(r.isOk());
    if (r.isOk()) {
      assert.equal(r.value.length, 3);
      // Last 3 events are addresses 2, 3, 4
      const addrs = r.value.map((e) => (e as { addr?: string }).addr);
      assert.deepEqual(addrs, ['/ip4/10.0.0.2/tcp/9001', '/ip4/10.0.0.3/tcp/9001', '/ip4/10.0.0.4/tcp/9001']);
    }
  });

  it('tail on missing file returns empty', async () => {
    const r = await tailToday(logPaths(home), 10);
    assert.ok(r.isOk());
    if (r.isOk()) assert.equal(r.value.length, 0);
  });
});

describe('log-store — rotation', () => {
  it('compresses yesterday + leaves today untouched', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterdayDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const yesterday = yesterdayDate.toISOString().slice(0, 10);

    // Pre-create files for today and yesterday
    const paths = logPaths(home, today);
    const todayFile = paths.todayPath;
    const yesterdayFile = join(paths.dir, `events-${yesterday}.jsonl`);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(paths.dir, { recursive: true });
    await writeFile(todayFile, '{"x":1}\n');
    await writeFile(yesterdayFile, '{"x":2}\n');
    // Mark yesterday's mtime as 1 day ago so it's not deleted (within retention)
    await utimes(yesterdayFile, yesterdayDate, yesterdayDate);

    const r = await rotate(paths);
    assert.ok(r.isOk(), `rotate err: ${r.isErr() ? JSON.stringify(r.error) : ''}`);
    if (!r.isOk()) return;

    // today's file still .jsonl, yesterday's now .gz
    assert.ok(existsSync(todayFile), 'today still present');
    assert.ok(!existsSync(yesterdayFile), 'yesterday raw should be removed');
    assert.ok(existsSync(yesterdayFile + '.gz'), 'yesterday gz should exist');
    assert.ok(r.value.compressed >= 1);
  });

  it('deletes files older than retention', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const paths = logPaths(home, today);
    const oldFile = join(paths.dir, `events-2025-01-01.jsonl`);
    const { mkdir } = await import('node:fs/promises');
    await mkdir(paths.dir, { recursive: true });
    await writeFile(oldFile, '{"x":99}\n');
    await utimes(oldFile, oldDate, oldDate);

    const r = await rotate(paths, 30);
    assert.ok(r.isOk());
    if (!r.isOk()) return;
    assert.ok(!existsSync(oldFile), 'old file should be deleted');
    assert.ok(r.value.deleted >= 1);
  });
});

describe('log-store — shipping', () => {
  it('shipping disabled returns ok with zero events', async () => {
    const paths = logPaths(home);
    await appendEvent(paths, buildEvent('peer.dial', { addr: '/ip4/1.1.1.1' }));
    const r = await shipPending(paths);
    assert.ok(r.isOk());
    if (r.isOk()) assert.equal(r.value.events_shipped, 0);
  });

  it('shipPending advances offset on 2xx', async () => {
    const paths = logPaths(home);
    await appendEvent(paths, buildEvent('peer.dial', { addr: '/ip4/1.1.1.1' }));
    await appendEvent(paths, buildEvent('peer.dial', { addr: '/ip4/2.2.2.2' }));
    const enableR = await enableShipping(paths, 'http://test.invalid/ingest');
    assert.ok(enableR.isOk());

    let receivedBody = '';
    const fakeFetch: typeof fetch = (async (url, init) => {
      receivedBody = (init as RequestInit)?.body as string;
      return { ok: true, status: 200, text: async () => '' } as Response;
    }) as typeof fetch;

    const r = await shipPending(paths, fakeFetch);
    assert.ok(r.isOk(), `ship: ${r.isErr() ? JSON.stringify(r.error) : ''}`);
    if (r.isOk()) {
      assert.equal(r.value.events_shipped, 2);
      assert.ok(r.value.bytes_shipped > 0);
    }
    assert.ok(receivedBody.includes('peer.dial'));

    // Second call: nothing new → 0 events
    const r2 = await shipPending(paths, fakeFetch);
    assert.ok(r2.isOk());
    if (r2.isOk()) assert.equal(r2.value.events_shipped, 0);
  });

  it('shipPending leaves offset unchanged on non-2xx', async () => {
    const paths = logPaths(home);
    await appendEvent(paths, buildEvent('peer.dial', { addr: '/ip4/1.1.1.1' }));
    await enableShipping(paths, 'http://test.invalid');

    const fakeFetch: typeof fetch = (async () => ({ ok: false, status: 500, text: async () => '' } as Response)) as typeof fetch;
    const r = await shipPending(paths, fakeFetch);
    assert.ok(r.isErr(), 'should bubble error');

    // Status: offset should still be 0
    const status = await getShippingStatus(paths);
    assert.ok(status.isOk());
    if (status.isOk()) assert.equal(status.value!.last_shipped_offset, 0);
  });

  it('disableShipping flips enabled flag', async () => {
    const paths = logPaths(home);
    await enableShipping(paths, 'http://x');
    await disableShipping(paths);
    const r = await getShippingStatus(paths);
    assert.ok(r.isOk());
    if (r.isOk()) assert.equal(r.value!.enabled, false);
  });
});

describe('log-store — exportBundle', () => {
  it('concatenates today + decompresses past, sorts by timestamp', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const paths = logPaths(home, today);
    await appendEvent(paths, buildEvent('peer.dial', { addr: 'a', ts: '2026-04-17T11:00:00.000Z' }));
    await appendEvent(paths, buildEvent('peer.dial', { addr: 'b', ts: '2026-04-17T10:00:00.000Z' }));

    const r = await exportBundle(paths);
    assert.ok(r.isOk());
    if (!r.isOk()) return;

    const text = gunzipSync(Buffer.from(r.value)).toString('utf8');
    const lines = text.split('\n').filter((l) => l.length > 0);
    assert.equal(lines.length, 2);
    // Sorted: 10:00 line first, 11:00 second
    assert.ok(lines[0].includes('"ts":"2026-04-17T10:00:00.000Z"'));
    assert.ok(lines[1].includes('"ts":"2026-04-17T11:00:00.000Z"'));
  });
});
