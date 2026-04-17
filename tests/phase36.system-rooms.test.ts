/**
 * Phase 36 — system rooms (toolshed + research).
 *
 * Two canonical P2P-always-shared rooms whose membership is derived from
 * source_uri scheme rather than a physical room field. Nodes are sorted
 * newest-first by fetched_at; the remote-node validator now REQUIRES
 * fetched_at on the trust boundary so receiving LLMs always see age.
 *
 * This file covers the domain + share-store + validator surface. The
 * phase 35 p2p-touch-e2e test exercises the wire.
 */

import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { GraphNode } from '../src/domain/graph.js';
import {
  TOOLSHED,
  RESEARCH,
  SYSTEM_ROOMS,
  SYSTEM_ROOM_NAMES,
  isSystemRoomName,
  findSystemRoom,
  belongsToSystemRoom,
  nodesInSystemRoom,
  ageDays,
  isStale,
} from '../src/domain/system-rooms.js';
import { validateRemoteNode, validateRemoteNodes } from '../src/domain/remote-node-validator.js';
import {
  removeSharedRoom,
  ensureSystemRoomsShared,
  loadSharedRooms,
} from '../src/infrastructure/share-store.js';

const mk = (o: Partial<GraphNode>): GraphNode => ({
  id: 'n',
  label: 'l',
  file_type: 'document',
  source_file: 's',
  fetched_at: '2026-04-10T00:00:00Z',
  ...o,
}) as GraphNode;

describe('Phase 36 — system rooms (domain)', () => {
  test('S1: exactly two system rooms registered by name', () => {
    assert.strictEqual(SYSTEM_ROOMS.length, 2);
    assert.ok(SYSTEM_ROOM_NAMES.has('toolshed'));
    assert.ok(SYSTEM_ROOM_NAMES.has('research'));
    assert.ok(isSystemRoomName('toolshed'));
    assert.ok(isSystemRoomName('research'));
    assert.ok(!isSystemRoomName('user-project'));
    assert.strictEqual(findSystemRoom('toolshed')?.name, 'toolshed');
    assert.strictEqual(findSystemRoom('unknown'), undefined);
  });

  test('S2: staleAfterDays hints — research=7, toolshed=30', () => {
    assert.strictEqual(RESEARCH.staleAfterDays, 7);
    assert.strictEqual(TOOLSHED.staleAfterDays, 30);
  });

  test('S3: virtual membership derived from source_uri scheme, not room field', () => {
    // git-sourced node with a user-chosen room still counts as toolshed
    const git = mk({ id: 'g1', source_uri: 'git://abc', room: 'user-project' });
    assert.ok(belongsToSystemRoom(git, TOOLSHED));
    assert.ok(!belongsToSystemRoom(git, RESEARCH));

    // arxiv paper belongs to research regardless of room
    const arxiv = mk({ id: 'a1', source_uri: 'arxiv://2409.02685', room: 'phd' });
    assert.ok(belongsToSystemRoom(arxiv, RESEARCH));
    assert.ok(!belongsToSystemRoom(arxiv, TOOLSHED));

    // plain local file (no system scheme) belongs to neither
    const doc = mk({ id: 'd1', source_uri: 'local://notes.txt', room: 'thoughts' });
    assert.ok(!belongsToSystemRoom(doc, TOOLSHED));
    assert.ok(!belongsToSystemRoom(doc, RESEARCH));
  });

  test('S4: websearch: and https: also route to research (auto-save hook path)', () => {
    const ws = mk({ id: 'w1', source_uri: 'websearch:rng tunnels' });
    assert.ok(belongsToSystemRoom(ws, RESEARCH));
    const https = mk({ id: 'h1', source_uri: 'https://example.org/page' });
    assert.ok(belongsToSystemRoom(https, RESEARCH));
  });

  test('S5: nodesInSystemRoom sorts newest-first by fetched_at', () => {
    const nodes: GraphNode[] = [
      mk({ id: 'old',    source_uri: 'arxiv://1', fetched_at: '2020-01-01T00:00:00Z' }),
      mk({ id: 'fresh',  source_uri: 'arxiv://2', fetched_at: '2026-04-15T00:00:00Z' }),
      mk({ id: 'middle', source_uri: 'arxiv://3', fetched_at: '2024-06-01T00:00:00Z' }),
    ];
    const sorted = nodesInSystemRoom(nodes, RESEARCH);
    assert.deepStrictEqual(sorted.map((n) => n.id), ['fresh', 'middle', 'old']);
  });

  test('S6: ageDays math is within epsilon of exact delta', () => {
    const now = new Date('2026-04-17T00:00:00Z');
    const ten = mk({ fetched_at: '2026-04-07T00:00:00Z' });
    const age = ageDays(ten, now);
    assert.ok(age !== null && Math.abs(age - 10) < 0.001, `expected ~10, got ${age}`);
    const noStamp = mk({ fetched_at: undefined });
    assert.strictEqual(ageDays(noStamp, now), null);
  });

  test('S7: isStale true when past staleAfterDays or no fetched_at', () => {
    const now = new Date('2026-04-17T00:00:00Z');
    const fresh = mk({ fetched_at: '2026-04-15T00:00:00Z', source_uri: 'arxiv://x' });
    const old   = mk({ fetched_at: '2026-01-01T00:00:00Z', source_uri: 'arxiv://y' });
    assert.ok(!isStale(fresh, RESEARCH, now));
    assert.ok(isStale(old, RESEARCH, now));
    // un-aged is worst-case stale
    const unknown = mk({ fetched_at: undefined, source_uri: 'arxiv://z' });
    assert.ok(isStale(unknown, RESEARCH, now));
  });
});

describe('Phase 36 — share-store enforcement', () => {
  test('S8: removeSharedRoom refuses to unshare system rooms', () => {
    const file = {
      version: 2,
      rooms: [
        { name: 'toolshed',  sharedAt: '2026-04-17T00:00:00Z', shareable: true },
        { name: 'research',  sharedAt: '2026-04-17T00:00:00Z', shareable: true },
        { name: 'user-room', sharedAt: '2026-04-17T00:00:00Z', shareable: true },
      ],
    };
    const afterToolshed = removeSharedRoom(file, 'toolshed');
    assert.ok(afterToolshed.rooms.some((r) => r.name === 'toolshed'), 'system toolshed must survive');
    const afterResearch = removeSharedRoom(afterToolshed, 'research');
    assert.ok(afterResearch.rooms.some((r) => r.name === 'research'), 'system research must survive');
    const afterUser = removeSharedRoom(afterResearch, 'user-room');
    assert.ok(!afterUser.rooms.some((r) => r.name === 'user-room'), 'user room must be removable');
  });

  test('S9: ensureSystemRoomsShared idempotently adds both rooms to a fresh file', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wi-p36-share-'));
    const path = join(tmp, 'shared-rooms.json');
    try {
      // Empty state → ensure pins both system rooms
      const r1 = await ensureSystemRoomsShared(path, new Date('2026-04-17T00:00:00Z'));
      assert.ok(r1.isOk());
      if (r1.isErr()) return;
      const names1 = new Set(r1.value.rooms.map((r) => r.name));
      assert.ok(names1.has('toolshed'));
      assert.ok(names1.has('research'));

      // Idempotent: re-run preserves existing records, same count
      const r2 = await ensureSystemRoomsShared(path, new Date('2030-01-01T00:00:00Z'));
      assert.ok(r2.isOk());
      if (r2.isErr()) return;
      assert.strictEqual(r2.value.rooms.length, r1.value.rooms.length);
      // sharedAt of existing system rooms must be preserved (not bumped)
      const ts = r2.value.rooms.find((r) => r.name === 'toolshed')?.sharedAt;
      assert.strictEqual(ts, '2026-04-17T00:00:00.000Z');

      // loadSharedRooms sees the pinned entries
      const loaded = await loadSharedRooms(path);
      assert.ok(loaded.isOk());
      if (loaded.isOk()) {
        assert.ok(loaded.value.rooms.some((r) => r.name === 'toolshed' && r.shareable));
      }
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe('Phase 36 — validator requires fetched_at on trust boundary', () => {
  test('V1: node with fetched_at passes', () => {
    const r = validateRemoteNode({
      id: 'arxiv://1',
      label: 'Paper',
      file_type: 'paper',
      source_file: 'arxiv',
      source_uri: 'arxiv://1',
      fetched_at: '2026-04-17T00:00:00Z',
    });
    assert.ok(r.isOk(), r.isErr() ? JSON.stringify(r.error) : '');
  });

  test('V2: missing fetched_at is rejected with FetchedAtMissing', () => {
    const r = validateRemoteNode({
      id: 'arxiv://1',
      label: 'Paper',
      file_type: 'paper',
      source_file: 'arxiv',
      source_uri: 'arxiv://1',
      // no fetched_at
    });
    assert.ok(r.isErr());
    if (r.isErr()) assert.strictEqual(r.error.kind, 'FetchedAtMissing');
  });

  test('V3: unparseable fetched_at is rejected with FetchedAtInvalid', () => {
    const r = validateRemoteNode({
      id: 'arxiv://1',
      label: 'Paper',
      file_type: 'paper',
      source_file: 'arxiv',
      source_uri: 'arxiv://1',
      fetched_at: 'definitely-not-a-date',
    });
    assert.ok(r.isErr());
    if (r.isErr()) assert.strictEqual(r.error.kind, 'FetchedAtInvalid');
  });

  test('V4: validateRemoteNodes partitions — ok + rejected mixed batch', () => {
    const { accepted, rejected } = validateRemoteNodes([
      {
        id: 'arxiv://1', label: 'A', file_type: 'paper', source_file: 'a',
        source_uri: 'arxiv://1', fetched_at: '2026-04-17T00:00:00Z',
      },
      {
        id: 'arxiv://2', label: 'B', file_type: 'paper', source_file: 'b',
        source_uri: 'arxiv://2',
        // no fetched_at
      },
    ]);
    assert.strictEqual(accepted.length, 1);
    assert.strictEqual(rejected.length, 1);
    assert.strictEqual(rejected[0].failure.kind, 'FetchedAtMissing');
  });
});
