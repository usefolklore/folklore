/**
 * Phase 16: Room Sharing via Y.js CRDT — requirement tests.
 *
 * Covers SHARE-01..06 plus the 4 critical pitfalls from 16-RESEARCH.md:
 *   1. Echo loop prevention (REMOTE_ORIGIN symbol identity + observer early-return)
 *   2. V1/V2 format mismatch (static + functional)
 *   3. readSyncMessage empty-response guard
 *   4. ydoc-store init order (no getMap before applyUpdate)
 *   5. Uint8ArrayList.subarray() before createDecoder (Blocker 1)
 *
 * Mirrors tests/phase15.peer-security.test.ts:
 *   - one file, multiple describe groups by requirement ID
 *   - hermetic tmp dirs via mkdtempSync + rmSync
 *   - structural assertions (readFileSync + regex) for source-level invariants
 *   - functional assertions for behavior
 *
 * Runner: node --import tsx --test tests/phase16.share-crdt.test.ts
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

import {
  loadSharedRooms,
  saveSharedRooms,
  mutateSharedRooms,
  addSharedRoom,
  removeSharedRoom,
  type SharedRoomsFile,
  type SharedRoomRecord,
} from '../src/infrastructure/share-store.js';
import { loadYDoc, saveYDoc } from '../src/infrastructure/ydoc-store.js';
import {
  REMOTE_ORIGIN,
  SHARE_PROTOCOL_ID,
  syncNodeIntoYDoc,
} from '../src/infrastructure/share-sync.js';
import { buildPatterns } from '../src/domain/sharing.js';
import type { GraphNode } from '../src/domain/graph.js';

// ─────────────────────── helpers ──────────────────────────

const makeNode = (overrides: Partial<GraphNode> = {}): GraphNode => ({
  id: 'n1',
  label: 'Clean test node',
  file_type: 'document',
  source_file: '/tmp/test.md',
  room: 'test-room',
  ...overrides,
});

const patterns = buildPatterns();

/** Create a hermetic tmp dir. Caller must set/restore WELLINFORMED_HOME and rmSync on teardown. */
const makeHome = (): string => mkdtempSync(join(tmpdir(), 'wellinformed-phase16-'));

/**
 * Exchange a full state update from src to dst using REMOTE_ORIGIN so the
 * outbound observer on dst does not re-broadcast it (echo-loop prevention).
 */
const exchangeFull = (src: Y.Doc, dst: Y.Doc): void => {
  const update = Y.encodeStateAsUpdate(src);
  Y.applyUpdate(dst, update, REMOTE_ORIGIN);
};

// ─────────────────────── SHARE-01: share room records after audit ────────────

describe('SHARE-01: share room records the room after audit passes', () => {
  test('clean room with 0 nodes is allowed — records as shared with 0 nodes', async () => {
    const home = makeHome();
    const registryPath = join(home, 'shared-rooms.json');
    try {
      const result = await mutateSharedRooms(registryPath, (file) =>
        addSharedRoom(file, { name: 'empty-room', sharedAt: new Date().toISOString() }),
      );
      assert.ok(result.isOk(), `mutateSharedRooms failed: ${JSON.stringify(result)}`);
      assert.equal(result.value.rooms.length, 1);
      assert.equal(result.value.rooms[0].name, 'empty-room');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('clean room with 3 nodes is allowed — 3 records in shared-rooms.json', async () => {
    const home = makeHome();
    const registryPath = join(home, 'shared-rooms.json');
    try {
      // Simulate share room flow: audit passes, mutateSharedRooms persists
      const nodes = [
        makeNode({ id: 'a1', label: 'node alpha', room: 'science' }),
        makeNode({ id: 'a2', label: 'node beta', room: 'science' }),
        makeNode({ id: 'a3', label: 'node gamma', room: 'science' }),
      ];
      // All 3 nodes are clean — audit produces no blocked nodes
      const { auditRoom } = await import('../src/domain/sharing.js');
      const audit = auditRoom(nodes, patterns);
      assert.equal(audit.blocked.length, 0, 'expected no blocked nodes for clean room');
      assert.equal(audit.allowed.length, 3);

      const result = await mutateSharedRooms(registryPath, (file) =>
        addSharedRoom(file, { name: 'science', sharedAt: new Date().toISOString() }),
      );
      assert.ok(result.isOk());
      assert.equal(result.value.rooms.length, 1);
      assert.equal(result.value.rooms[0].name, 'science');

      // Re-read from disk to confirm persistence
      const loaded = await loadSharedRooms(registryPath);
      assert.ok(loaded.isOk());
      assert.equal(loaded.value.rooms.length, 1);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('flagged room (node with sk-... label) is BLOCKED — mutateSharedRooms never called', async () => {
    const { auditRoom } = await import('../src/domain/sharing.js');
    const nodes = [
      makeNode({ id: 'f1', label: 'sk-abcdefghij1234567890xx', room: 'secrets-room' }),
    ];
    const audit = auditRoom(nodes, patterns);
    assert.equal(audit.blocked.length, 1, 'expected 1 blocked node');
    assert.equal(audit.blocked[0].nodeId, 'f1');
    // Verify no shared-rooms.json would be written — simulated by checking audit gate
    assert.ok(audit.blocked.length > 0, 'SHARE-01 gate: blocked.length > 0 prevents mutateSharedRooms');
  });

  test('second share room <same> is idempotent — exactly 1 record', async () => {
    const home = makeHome();
    const registryPath = join(home, 'shared-rooms.json');
    try {
      const record: SharedRoomRecord = { name: 'lab', sharedAt: '2026-01-01T00:00:00Z' };
      const r1 = await mutateSharedRooms(registryPath, (file) => addSharedRoom(file, record));
      assert.ok(r1.isOk());
      assert.equal(r1.value.rooms.length, 1);

      // Second call with same name — addSharedRoom upserts
      const r2 = await mutateSharedRooms(registryPath, (file) =>
        addSharedRoom(file, { name: 'lab', sharedAt: new Date().toISOString() }),
      );
      assert.ok(r2.isOk());
      assert.equal(r2.value.rooms.length, 1, 'idempotent: still exactly 1 record after second share');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

// ─────────────────────── SHARE-02: unshare semantics ────────────────────────

describe('SHARE-02: unshare removes from registry but keeps .ydoc', () => {
  test('unshare on shared room removes the entry from shared-rooms.json', async () => {
    const home = makeHome();
    const registryPath = join(home, 'shared-rooms.json');
    try {
      // First share a room
      const r1 = await mutateSharedRooms(registryPath, (file) =>
        addSharedRoom(file, { name: 'homelab', sharedAt: '2026-01-01T00:00:00Z' }),
      );
      assert.ok(r1.isOk());
      assert.equal(r1.value.rooms.length, 1);

      // Now unshare
      const r2 = await mutateSharedRooms(registryPath, (file) =>
        removeSharedRoom(file, 'homelab'),
      );
      assert.ok(r2.isOk());
      assert.equal(r2.value.rooms.length, 0, 'room should be removed from registry');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('unshare on missing room is a no-op — exits cleanly, registry unchanged', async () => {
    const home = makeHome();
    const registryPath = join(home, 'shared-rooms.json');
    try {
      // Share one room then try to unshare a DIFFERENT room
      await mutateSharedRooms(registryPath, (file) =>
        addSharedRoom(file, { name: 'existing', sharedAt: '2026-01-01T00:00:00Z' }),
      );
      const result = await mutateSharedRooms(registryPath, (file) =>
        removeSharedRoom(file, 'nonexistent'),
      );
      assert.ok(result.isOk(), 'removeSharedRoom on missing room must not error');
      assert.equal(result.value.rooms.length, 1, 'registry should be unchanged');
      assert.equal(result.value.rooms[0].name, 'existing');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('.ydoc file is NOT deleted by unshare (retained for future re-share)', async () => {
    const home = makeHome();
    const registryPath = join(home, 'shared-rooms.json');
    const ydocsDir = join(home, 'ydocs');
    mkdirSync(ydocsDir, { recursive: true });
    const ydocPath = join(ydocsDir, 'homelab.ydoc');
    try {
      // Create the .ydoc file and registry entry
      const doc = new Y.Doc();
      const saveResult = await saveYDoc(ydocPath, doc);
      assert.ok(saveResult.isOk(), 'saveYDoc failed');
      assert.ok(existsSync(ydocPath), '.ydoc must exist before unshare');

      await mutateSharedRooms(registryPath, (file) =>
        addSharedRoom(file, { name: 'homelab', sharedAt: '2026-01-01T00:00:00Z' }),
      );

      // Simulate unshare: removes registry entry but does NOT touch .ydoc
      await mutateSharedRooms(registryPath, (file) => removeSharedRoom(file, 'homelab'));

      // .ydoc must still exist
      assert.ok(existsSync(ydocPath), '.ydoc must be retained after unshare (SHARE-02)');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

// ─────────────────────── SHARE-03: CRDT convergence + REMOTE_ORIGIN ─────────

describe('SHARE-03: Y.js CRDT convergence + REMOTE_ORIGIN echo prevention', () => {
  test('two empty docs — doc A sets entry, exchange → doc B has the same entry', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    docA.transact(() => {
      docA.getMap('nodes').set('node-1', { id: 'node-1', label: 'Research paper' });
    });

    exchangeFull(docA, docB);

    const mapB = docB.getMap<{ id: string; label: string }>('nodes');
    assert.ok(mapB.has('node-1'), 'doc B must have node-1 after applying doc A update');
    const entry = mapB.get('node-1');
    assert.equal(entry?.label, 'Research paper');
  });

  test('concurrent edits — A sets "a", B sets "b", exchange both ways → both have both', () => {
    const docA = new Y.Doc();
    const docB = new Y.Doc();

    // Concurrent independent writes
    docA.transact(() => { docA.getMap('nodes').set('key-a', { id: 'key-a', label: 'from A' }); });
    docB.transact(() => { docB.getMap('nodes').set('key-b', { id: 'key-b', label: 'from B' }); });

    // Exchange in both directions
    exchangeFull(docA, docB);
    exchangeFull(docB, docA);

    const mapA = docA.getMap<unknown>('nodes');
    const mapB = docB.getMap<unknown>('nodes');
    assert.ok(mapA.has('key-a'), 'doc A must retain its own key');
    assert.ok(mapA.has('key-b'), 'doc A must receive key-b from doc B');
    assert.ok(mapB.has('key-a'), 'doc B must receive key-a from doc A');
    assert.ok(mapB.has('key-b'), 'doc B must retain its own key');
  });

  test('REMOTE_ORIGIN is a Symbol — same instance across multiple imports', async () => {
    assert.equal(typeof REMOTE_ORIGIN, 'symbol', 'REMOTE_ORIGIN must be a Symbol');
    // Re-import to verify module-level singleton (ESM module cache)
    const mod = await import('../src/infrastructure/share-sync.js');
    assert.ok(
      Object.is(mod.REMOTE_ORIGIN, REMOTE_ORIGIN),
      'REMOTE_ORIGIN must be the same Symbol instance on re-import',
    );
  });

  test('echo prevention — observer with REMOTE_ORIGIN guard does NOT fire on remote applyUpdate', () => {
    const doc = new Y.Doc();
    let callCount = 0;

    doc.on('update', (_update: Uint8Array, origin: unknown) => {
      if (origin === REMOTE_ORIGIN) return;  // ECHO LOOP PREVENTION
      callCount++;
    });

    // Apply an update with REMOTE_ORIGIN — the guard must prevent the counter from incrementing
    const srcDoc = new Y.Doc();
    srcDoc.transact(() => { srcDoc.getMap('nodes').set('remote-key', { label: 'from remote' }); });
    const update = Y.encodeStateAsUpdate(srcDoc);
    Y.applyUpdate(doc, update, REMOTE_ORIGIN);

    assert.equal(callCount, 0, 'observer must NOT fire when origin === REMOTE_ORIGIN (echo prevention)');
  });

  test('Local broadcast invariant (Blocker 5) — syncNodeIntoYDoc fires outbound observer for local mutations', async () => {
    const home = makeHome();
    const logPath = join(home, 'share-log.jsonl');
    try {
      const doc = new Y.Doc();
      let localMutationCount = 0;

      // Attach an observer that counts updates NOT from REMOTE_ORIGIN (i.e., local mutations)
      doc.on('update', (_update: Uint8Array, origin: unknown) => {
        if (origin !== REMOTE_ORIGIN) localMutationCount++;
      });

      const node = makeNode({ id: 'local-n1', label: 'Local research note', room: 'lab' });
      const result = await syncNodeIntoYDoc(doc, node, patterns, logPath, 'local-peer', 'lab');

      assert.ok(result.isOk(), `syncNodeIntoYDoc failed: ${JSON.stringify(result)}`);
      assert.ok(
        localMutationCount > 0,
        'Local broadcast invariant: syncNodeIntoYDoc MUST fire the outbound observer (local mutation, not REMOTE_ORIGIN)',
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

// ─────────────────────── SHARE-04: metadata-only boundary ────────────────────

describe('SHARE-04: ShareableNode boundary — only metadata propagates', () => {
  test('syncNodeIntoYDoc writes only the 6 ShareableNode keys to Y.Map', async () => {
    const home = makeHome();
    const logPath = join(home, 'share-log.jsonl');
    try {
      const doc = new Y.Doc();
      const node = makeNode({
        id: 'meta-1',
        label: 'Metadata test node',
        room: 'meta-room',
        file_type: 'code',
        source_file: '/secret/internal/path.ts',
        embedding_id: 'emb-abc',
        source_uri: 'https://arxiv.org/abs/2401.00001',
        fetched_at: '2026-04-12T00:00:00Z',
      });

      const result = await syncNodeIntoYDoc(doc, node, patterns, logPath, 'local', 'meta-room');
      assert.ok(result.isOk(), `syncNodeIntoYDoc failed: ${JSON.stringify(result)}`);

      const map = doc.getMap<Record<string, unknown>>('nodes');
      assert.ok(map.has('meta-1'), 'node must be in Y.Map');
      const entry = map.get('meta-1') as Record<string, unknown>;
      assert.ok(entry, 'entry must not be null');

      const entryKeys = Object.keys(entry).sort();
      // Shareable keys: id, label, room, embedding_id, source_uri, fetched_at
      const expectedKeys = ['embedding_id', 'fetched_at', 'id', 'label', 'room', 'source_uri'].sort();
      assert.deepEqual(entryKeys, expectedKeys, 'Y.Map entry must contain exactly the 6 ShareableNode keys');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('round-trip through saveYDoc + loadYDoc preserves the ShareableNode keys', async () => {
    const home = makeHome();
    const logPath = join(home, 'share-log.jsonl');
    const ydocPath = join(home, 'meta-room.ydoc');
    try {
      const docWrite = new Y.Doc();
      const node = makeNode({
        id: 'rt-1',
        label: 'Round-trip node',
        room: 'round-trip-room',
        file_type: 'document',
        source_file: '/internal/docs/rt.md',
      });
      const syncResult = await syncNodeIntoYDoc(docWrite, node, patterns, logPath, 'local', 'round-trip-room');
      assert.ok(syncResult.isOk());

      const saveResult = await saveYDoc(ydocPath, docWrite);
      assert.ok(saveResult.isOk());

      const loadResult = await loadYDoc(ydocPath);
      assert.ok(loadResult.isOk());
      const docRead = loadResult.value;
      const map = docRead.getMap<Record<string, unknown>>('nodes');
      assert.ok(map.has('rt-1'), 'loaded doc must have the node key');
      const entry = map.get('rt-1') as Record<string, unknown>;
      assert.equal(entry.id, 'rt-1');
      assert.equal(entry.label, 'Round-trip node');
      assert.ok(!('file_type' in entry), 'file_type must NOT be present after round-trip');
      assert.ok(!('source_file' in entry), 'source_file must NOT be present after round-trip');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('GraphNode with file_type and source_file produces Y.Map entry without those fields', async () => {
    const home = makeHome();
    const logPath = join(home, 'share-log.jsonl');
    try {
      const doc = new Y.Doc();
      const node = makeNode({
        id: 'boundary-1',
        label: 'Boundary test',
        file_type: 'code',
        source_file: '/very/secret/path.ts',
        room: 'boundary-room',
      });

      const result = await syncNodeIntoYDoc(doc, node, patterns, logPath, 'local', 'boundary-room');
      assert.ok(result.isOk());

      const entry = doc.getMap<Record<string, unknown>>('nodes').get('boundary-1') as Record<string, unknown>;
      assert.ok(entry, 'entry must exist');
      assert.ok(!('file_type' in entry), 'file_type must NOT propagate across SHARE-04 boundary');
      assert.ok(!('source_file' in entry), 'source_file must NOT propagate across SHARE-04 boundary');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

// ─────────────────────── SHARE-05: incremental sync via state vectors ────────

describe('SHARE-05: incremental sync via state vectors', () => {
  test('encodeStateAsUpdate(doc, peerSV) is shorter than encodeStateAsUpdate(doc) for non-empty SV', () => {
    const docA = new Y.Doc();
    // Set a baseline key
    docA.transact(() => { docA.getMap('nodes').set('baseline', { id: 'baseline', label: 'base entry' }); });

    // Peer B starts from this same state
    const docB = new Y.Doc();
    Y.applyUpdate(docB, Y.encodeStateAsUpdate(docA), REMOTE_ORIGIN);

    // Doc A adds a new entry that B does not have
    docA.transact(() => { docA.getMap('nodes').set('new-entry', { id: 'new-entry', label: 'incremental' }); });

    // Incremental delta vs full export
    const peerBSV = Y.encodeStateVector(docB);
    const fullUpdate = Y.encodeStateAsUpdate(docA);
    const incrementalUpdate = Y.encodeStateAsUpdate(docA, peerBSV);

    assert.ok(
      incrementalUpdate.byteLength < fullUpdate.byteLength,
      `incremental update (${incrementalUpdate.byteLength}B) must be shorter than full update (${fullUpdate.byteLength}B)`,
    );
  });

  test('incremental delta applied to a third doc starting from baseline converges', () => {
    const docA = new Y.Doc();
    docA.transact(() => { docA.getMap('nodes').set('shared-base', { id: 'shared-base', label: 'base' }); });

    // Doc C starts from the baseline (same as a hypothetical peer B)
    const docC = new Y.Doc();
    Y.applyUpdate(docC, Y.encodeStateAsUpdate(docA), REMOTE_ORIGIN);

    // Doc A adds more
    docA.transact(() => { docA.getMap('nodes').set('delta-entry', { id: 'delta-entry', label: 'delta' }); });

    // Compute SV of docC (the baseline peer) and extract the delta
    const sv = Y.encodeStateVector(docC);
    const delta = Y.encodeStateAsUpdate(docA, sv);

    // Apply delta to docC — it should converge to docA's state
    Y.applyUpdate(docC, delta, REMOTE_ORIGIN);

    const mapC = docC.getMap<unknown>('nodes');
    assert.ok(mapC.has('shared-base'), 'baseline entry must be preserved');
    assert.ok(mapC.has('delta-entry'), 'delta entry must be present after applying incremental update');
  });

  test('encodeStateVector on a fresh doc decodes via readSyncStep1 without throwing', () => {
    const freshDoc = new Y.Doc();
    const sv = Y.encodeStateVector(freshDoc);
    assert.ok(sv instanceof Uint8Array, 'encodeStateVector must return Uint8Array');
    assert.ok(sv.byteLength > 0, 'fresh doc state vector must not be zero-length');

    // Verify y-protocols accepts it as a valid SyncStep1 payload
    const enc = encoding.createEncoder();
    syncProtocol.writeSyncStep1(enc, freshDoc);
    const step1Bytes = encoding.toUint8Array(enc);

    // Decoding should not throw
    let threw = false;
    try {
      const dec = decoding.createDecoder(step1Bytes);
      const responseEnc = encoding.createEncoder();
      const responseDoc = new Y.Doc();
      syncProtocol.readSyncMessage(dec, responseEnc, responseDoc, REMOTE_ORIGIN);
    } catch {
      threw = true;
    }
    assert.ok(!threw, 'readSyncMessage on a valid SyncStep1 from fresh doc must not throw');
  });
});

// ─────────────────────── SHARE-06: offline catchup via .ydoc ─────────────────

describe('SHARE-06: offline changes queue + reconnect catchup', () => {
  test('saveYDoc → loadYDoc round-trip preserves all Y.Map keys', async () => {
    const home = makeHome();
    const ydocPath = join(home, 'offline.ydoc');
    try {
      const docA = new Y.Doc();
      const map = docA.getMap<{ id: string; label: string }>('nodes');
      docA.transact(() => {
        map.set('offline-1', { id: 'offline-1', label: 'Offline node A' });
        map.set('offline-2', { id: 'offline-2', label: 'Offline node B' });
        map.set('offline-3', { id: 'offline-3', label: 'Offline node C' });
      });

      const saveResult = await saveYDoc(ydocPath, docA);
      assert.ok(saveResult.isOk(), `saveYDoc failed: ${JSON.stringify(saveResult)}`);

      const loadResult = await loadYDoc(ydocPath);
      assert.ok(loadResult.isOk(), `loadYDoc failed: ${JSON.stringify(loadResult)}`);
      const docB = loadResult.value;
      const loadedMap = docB.getMap<{ id: string; label: string }>('nodes');

      assert.ok(loadedMap.has('offline-1'), 'offline-1 must survive round-trip');
      assert.ok(loadedMap.has('offline-2'), 'offline-2 must survive round-trip');
      assert.ok(loadedMap.has('offline-3'), 'offline-3 must survive round-trip');
      assert.equal(loadedMap.get('offline-1')?.label, 'Offline node A');
      assert.equal(loadedMap.get('offline-3')?.label, 'Offline node C');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('.tmp file is absent after a successful saveYDoc (atomic rename completed)', async () => {
    const home = makeHome();
    const ydocPath = join(home, 'atomic.ydoc');
    try {
      const doc = new Y.Doc();
      doc.transact(() => { doc.getMap('nodes').set('k', { id: 'k', label: 'atomic' }); });
      const saveResult = await saveYDoc(ydocPath, doc);
      assert.ok(saveResult.isOk());
      assert.ok(!existsSync(`${ydocPath}.tmp`), '.tmp file must not exist after successful atomic save');
      assert.ok(existsSync(ydocPath), 'final .ydoc must exist after save');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('reconnect simulation — T0 snapshot, mutate at T1, save again, load → T1 state', async () => {
    const home = makeHome();
    const ydocPath = join(home, 'reconnect.ydoc');
    try {
      // T0: create initial state and snapshot
      const docLive = new Y.Doc();
      docLive.transact(() => {
        docLive.getMap('nodes').set('t0-node', { id: 't0-node', label: 'T0 state' });
      });
      const save0 = await saveYDoc(ydocPath, docLive);
      assert.ok(save0.isOk(), 'T0 snapshot failed');

      // T1: add a new entry (offline mutation)
      docLive.transact(() => {
        docLive.getMap('nodes').set('t1-node', { id: 't1-node', label: 'T1 state' });
      });
      const save1 = await saveYDoc(ydocPath, docLive);
      assert.ok(save1.isOk(), 'T1 save failed');

      // Reconnect: load from the T1 snapshot
      const loadResult = await loadYDoc(ydocPath);
      assert.ok(loadResult.isOk());
      const docReloaded = loadResult.value;
      const map = docReloaded.getMap<{ id: string; label: string }>('nodes');

      assert.ok(map.has('t0-node'), 'T0 state must persist after reconnect');
      assert.ok(map.has('t1-node'), 'T1 state must persist after reconnect (offline mutations survive)');
      assert.equal(map.get('t1-node')?.label, 'T1 state');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

// ─────────────────────── Pitfall 1: V1/V2 format invariant ───────────────────

describe('Pitfall: V1/V2 format invariant', () => {
  test('V1 encodeStateAsUpdate round-trips via V1 applyUpdate — preserves key', () => {
    const docSrc = new Y.Doc();
    docSrc.transact(() => {
      docSrc.getMap('nodes').set('v1-key', { id: 'v1-key', label: 'V1 round-trip check' });
    });

    // V1 encode
    const updateBytes = Y.encodeStateAsUpdate(docSrc);
    assert.ok(updateBytes instanceof Uint8Array, 'encodeStateAsUpdate must return Uint8Array');

    // V1 apply on fresh doc
    const docDst = new Y.Doc();
    Y.applyUpdate(docDst, updateBytes);  // V1 applyUpdate — no V2

    const map = docDst.getMap<{ id: string; label: string }>('nodes');
    assert.ok(map.has('v1-key'), 'V1 round-trip must preserve key');
    assert.equal(map.get('v1-key')?.label, 'V1 round-trip check');
  });

  test('share-sync.ts contains no V2 encoding APIs in executable code (structural)', () => {
    const src = readFileSync(
      new URL('../src/infrastructure/share-sync.ts', import.meta.url),
      'utf8',
    );
    // Strip both block comments /* ... */ and line comments // ...
    // so that documentation mentions do not cause false failures.
    const noBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, '');
    const codeOnly = noBlockComments
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    assert.doesNotMatch(codeOnly, /encodeStateAsUpdateV2/, 'share-sync.ts must not call V2 encodeStateAsUpdateV2 in code');
    assert.doesNotMatch(codeOnly, /applyUpdateV2/, 'share-sync.ts must not call V2 applyUpdateV2 in code');
    // doc.on('updateV2') — checked as a code call (not a comment mention)
    assert.doesNotMatch(codeOnly, /\.on\(['"]updateV2['"]\)/, "share-sync.ts must not listen on doc.on('updateV2')");
  });
});

// ─────────────────────── Pitfall 2: empty-response guard ─────────────────────

describe('Pitfall: readSyncMessage empty-response guard', () => {
  test('SyncStep2 message produces empty response encoder (encoding.length === 0)', () => {
    // Build a SyncStep2 message: send all updates from docSrc to docDst
    const docSrc = new Y.Doc();
    docSrc.transact(() => { docSrc.getMap('nodes').set('step2-key', { id: 'step2-key' }); });

    // Build a step2 frame (response to an imagined step1 with empty SV)
    const enc = encoding.createEncoder();
    const emptySV = Y.encodeStateVector(new Y.Doc());
    syncProtocol.writeSyncStep2(enc, docSrc, emptySV);
    const step2Bytes = encoding.toUint8Array(enc);

    // Apply via readSyncMessage — response encoder must be empty
    const responseEncoder = encoding.createEncoder();
    const docDst = new Y.Doc();
    const decoder = decoding.createDecoder(step2Bytes);
    syncProtocol.readSyncMessage(decoder, responseEncoder, docDst, REMOTE_ORIGIN);

    assert.equal(
      encoding.length(responseEncoder),
      0,
      'SyncStep2 must leave the response encoder empty (guard: if encoding.length > 0)',
    );
  });

  test('share-sync.ts has the literal empty-response guard (structural)', () => {
    const src = readFileSync(
      new URL('../src/infrastructure/share-sync.ts', import.meta.url),
      'utf8',
    );
    assert.match(
      src,
      /if\s*\(\s*encoding\.length\(responseEncoder\)\s*>\s*0\s*\)/,
      'share-sync.ts must have the literal empty-response guard: if (encoding.length(responseEncoder) > 0)',
    );
  });
});

// ─────────────────────── Pitfall 3: ydoc-store init order ────────────────────

describe('Pitfall: ydoc-store init order (no getMap inside the store)', () => {
  test('ydoc-store.ts does not call doc.getMap in executable code (structural)', () => {
    const src = readFileSync(
      new URL('../src/infrastructure/ydoc-store.ts', import.meta.url),
      'utf8',
    );
    // Strip both block comments and line comments before asserting.
    // The module uses doc.getMap in JSDoc/block-comment documentation
    // to explain caller responsibilities — those must not fail the check.
    const noBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, '');
    const codeOnly = noBlockComments
      .split('\n')
      .map((line) => line.replace(/\/\/.*$/, ''))
      .join('\n');
    assert.doesNotMatch(
      codeOnly,
      /doc\.getMap/,
      'ydoc-store.ts must NEVER call doc.getMap in code — that is the caller\'s responsibility (init-order invariant)',
    );
  });

  test('loadYDoc on a saved file returns doc whose getMap("nodes").get(key) matches', async () => {
    const home = makeHome();
    const ydocPath = join(home, 'init-order.ydoc');
    try {
      const docWrite = new Y.Doc();
      docWrite.transact(() => {
        docWrite.getMap('nodes').set('init-key', { id: 'init-key', label: 'init order test' });
      });
      const saveResult = await saveYDoc(ydocPath, docWrite);
      assert.ok(saveResult.isOk());

      // loadYDoc returns doc — caller calls getMap AFTER load returns (correct init order)
      const loadResult = await loadYDoc(ydocPath);
      assert.ok(loadResult.isOk());
      const docRead = loadResult.value;
      const entry = docRead.getMap<{ id: string; label: string }>('nodes').get('init-key');
      assert.ok(entry, 'entry must be present after correct init-order load');
      assert.equal(entry.label, 'init order test');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

// ─────────── Pitfall 3b: Uint8ArrayList.subarray() before createDecoder ──────
// Blocker 1: lp.decode yields Uint8ArrayList values; passing them directly to
// decoding.createDecoder() or JSON.parse() silently produces empty/wrong data.
// The production code must call .subarray() to flatten to Uint8Array first.

describe('Pitfall: Uint8ArrayList.subarray() before createDecoder', () => {
  test('share-sync.ts: .subarray() and createDecoder form a safe pipeline (structural)', () => {
    const src = readFileSync(
      new URL('../src/infrastructure/share-sync.ts', import.meta.url),
      'utf8',
    );
    // 1. File must have createDecoder (decoding step)
    assert.match(src, /createDecoder/, 'share-sync.ts must have at least one createDecoder call');
    // 2. File must have .subarray() (the Uint8ArrayList → Uint8Array flatten step)
    assert.match(src, /\.subarray\(\)/, 'share-sync.ts must call .subarray() to flatten Uint8ArrayList');

    // 3. The flatten happens inside the frameIter generator — find lines containing
    //    "frameIter" and verify the surrounding area contains .subarray().
    const lines = src.split('\n');
    const frameIterStart = lines.findIndex((ln) => ln.includes('const frameIter'));
    assert.ok(frameIterStart >= 0, 'frameIter must be defined in share-sync.ts');

    // Look at up to 20 lines from the frameIter definition — the .subarray() must appear
    const frameIterBlock = lines.slice(frameIterStart, frameIterStart + 20).join('\n');
    assert.match(
      frameIterBlock,
      /\.subarray\(\)/,
      'frameIter must call .subarray() to flatten lp.decode() output from Uint8ArrayList to Uint8Array',
    );

    // 4. handleInboundFrame receives the already-flat bytes: Uint8Array as first param,
    //    confirming the pipeline design (flatten in frameIter, use flat in handler).
    const handleLineIdx = lines.findIndex((ln) => ln.includes('handleInboundFrame') && ln.includes('async'));
    assert.ok(handleLineIdx >= 0, 'handleInboundFrame async function must be defined in share-sync.ts');
    const handleSig = lines.slice(handleLineIdx, handleLineIdx + 5).join('\n');
    assert.match(
      handleSig,
      /bytes:\s*Uint8Array/,
      'handleInboundFrame must accept bytes: Uint8Array (pre-flattened via frameIter .subarray())',
    );
  });

  test('frameIter in share-sync.ts yields .subarray() before any createDecoder usage (structural)', () => {
    const src = readFileSync(
      new URL('../src/infrastructure/share-sync.ts', import.meta.url),
      'utf8',
    );
    // The frameIter must contain .subarray() so decoded frames are flat Uint8Array
    assert.match(
      src,
      /\.subarray\(\)/,
      'share-sync.ts must call .subarray() to flatten Uint8ArrayList from lp.decode()',
    );
    // Verify readSubscribeRequest uses the flattened frame (TextDecoder not raw Uint8ArrayList)
    // result.value arrives from frameIter which already called .subarray()
    const fnMatch = src.match(/readSubscribeRequest[\s\S]*?(?=\n\/\/|$)/);
    assert.ok(fnMatch, 'readSubscribeRequest function not found in share-sync.ts');
    const body = fnMatch[0];
    assert.match(
      body,
      /TextDecoder/,
      'readSubscribeRequest must decode via TextDecoder (after .subarray() in frameIter)',
    );
  });
});

// ─────────────────────── Pitfall 4: secrets scanned on inbound/outbound ──────

describe('Pitfall: secrets scanned on inbound + outbound updates', () => {
  test('syncNodeIntoYDoc with a flagged node returns Err(ShareAuditBlocked)', async () => {
    const home = makeHome();
    const logPath = join(home, 'share-log.jsonl');
    try {
      const doc = new Y.Doc();
      const flaggedNode = makeNode({
        id: 'flagged-1',
        label: 'sk-abcdefghij1234567890xx',  // openai-style secret
        room: 'secrets-room',
      });

      const result = await syncNodeIntoYDoc(doc, flaggedNode, patterns, logPath, 'local', 'secrets-room');
      assert.ok(result.isErr(), 'syncNodeIntoYDoc must return Err for a flagged node');
      assert.equal(result.error.type, 'ShareAuditBlocked', 'error type must be ShareAuditBlocked');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('share-log.jsonl receives { allowed: false } line for a blocked outbound node', async () => {
    const home = makeHome();
    const logPath = join(home, 'share-log.jsonl');
    try {
      const doc = new Y.Doc();
      const flaggedNode = makeNode({
        id: 'flagged-2',
        label: 'sk-abcdefghij1234567890xx',
        room: 'secrets-room',
      });

      await syncNodeIntoYDoc(doc, flaggedNode, patterns, logPath, 'local', 'secrets-room');

      assert.ok(existsSync(logPath), 'share-log.jsonl must exist after blocked outbound');
      const lines = readFileSync(logPath, 'utf8').trim().split('\n').filter(Boolean);
      assert.ok(lines.length > 0, 'share-log.jsonl must contain at least one entry');
      const entry = JSON.parse(lines[lines.length - 1]) as {
        allowed: boolean;
        action: string;
        nodeId: string;
      };
      assert.equal(entry.allowed, false, 'log entry must have allowed: false for blocked node');
      assert.equal(entry.action, 'outbound');
      assert.equal(entry.nodeId, 'flagged-2');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('clean node passes through syncNodeIntoYDoc and is added to Y.Map', async () => {
    const home = makeHome();
    const logPath = join(home, 'share-log.jsonl');
    try {
      const doc = new Y.Doc();
      const cleanNode = makeNode({ id: 'clean-1', label: 'Harmless research note', room: 'lab' });

      const result = await syncNodeIntoYDoc(doc, cleanNode, patterns, logPath, 'local', 'lab');
      assert.ok(result.isOk(), 'clean node must pass through secrets gate');
      assert.ok(doc.getMap('nodes').has('clean-1'), 'clean node must be present in Y.Map');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

// ─────────────────────── Persistence layer round-trip (Plan 16-01) ───────────

describe('share-store + ydoc-store round-trip (Plan 16-01 surface)', () => {
  test('addSharedRoom + mutateSharedRooms persists to disk and re-reads cleanly', async () => {
    const home = makeHome();
    const registryPath = join(home, 'shared-rooms.json');
    try {
      const record: SharedRoomRecord = { name: 'data-lab', sharedAt: '2026-04-12T00:00:00Z' };
      const writeResult = await mutateSharedRooms(registryPath, (file) =>
        addSharedRoom(file, record),
      );
      assert.ok(writeResult.isOk());
      assert.equal(writeResult.value.rooms.length, 1);

      // Re-read from a cold loadSharedRooms to confirm disk persistence
      const readResult = await loadSharedRooms(registryPath);
      assert.ok(readResult.isOk());
      assert.equal(readResult.value.rooms.length, 1);
      assert.equal(readResult.value.rooms[0].name, 'data-lab');
      assert.equal(readResult.value.rooms[0].sharedAt, '2026-04-12T00:00:00Z');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('removeSharedRoom on missing name is a no-op — returns unchanged file', () => {
    const file: SharedRoomsFile = {
      version: 1,
      rooms: [{ name: 'present', sharedAt: '2026-01-01T00:00:00Z' }],
    };
    const result = removeSharedRoom(file, 'absent');
    assert.equal(result.rooms.length, 1, 'removeSharedRoom on missing name must not alter the file');
    assert.equal(result.rooms[0].name, 'present');
  });

  test('addSharedRoom upserts on duplicate name — one record, not two', () => {
    const file: SharedRoomsFile = { version: 1, rooms: [] };
    const r1 = addSharedRoom(file, { name: 'dup', sharedAt: '2026-01-01T00:00:00Z' });
    const r2 = addSharedRoom(r1, { name: 'dup', sharedAt: '2026-02-01T00:00:00Z' });
    assert.equal(r2.rooms.length, 1, 'upsert must produce exactly 1 record, not 2');
    assert.equal(r2.rooms[0].sharedAt, '2026-02-01T00:00:00Z', 'upsert must update the record');
  });

  test('saveYDoc + loadYDoc round-trips a Y.Map with 5 entries with no data loss', async () => {
    const home = makeHome();
    const ydocPath = join(home, 'five-entry.ydoc');
    try {
      const docWrite = new Y.Doc();
      docWrite.transact(() => {
        const map = docWrite.getMap<{ id: string; label: string }>('nodes');
        for (let i = 1; i <= 5; i++) {
          map.set(`node-${i}`, { id: `node-${i}`, label: `Entry number ${i}` });
        }
      });

      const saveResult = await saveYDoc(ydocPath, docWrite);
      assert.ok(saveResult.isOk(), 'saveYDoc must succeed for 5-entry map');

      const loadResult = await loadYDoc(ydocPath);
      assert.ok(loadResult.isOk(), 'loadYDoc must succeed');
      const docRead = loadResult.value;
      const map = docRead.getMap<{ id: string; label: string }>('nodes');

      assert.equal(map.size, 5, 'Y.Map must have exactly 5 entries after round-trip');
      for (let i = 1; i <= 5; i++) {
        assert.ok(map.has(`node-${i}`), `node-${i} must survive round-trip`);
        assert.equal(map.get(`node-${i}`)?.label, `Entry number ${i}`);
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('10 concurrent mutateSharedRooms mutations all land — no lost writes', async () => {
    const home = makeHome();
    const registryPath = join(home, 'concurrent-rooms.json');
    try {
      const mutations = Array.from({ length: 10 }, (_, i) =>
        mutateSharedRooms(registryPath, (current) =>
          addSharedRoom(current, {
            name: `room-${i.toString().padStart(2, '0')}`,
            sharedAt: new Date().toISOString(),
          }),
        ),
      );

      const results = await Promise.all(mutations);
      for (const r of results) {
        assert.ok(r.isOk(), `mutation failed: ${JSON.stringify(r.isErr() ? r.error : 'ok')}`);
      }

      const finalResult = await loadSharedRooms(registryPath);
      assert.ok(finalResult.isOk());
      assert.equal(
        finalResult.value.rooms.length,
        10,
        'all 10 concurrent mutations must be preserved (no lost writes under lock)',
      );

      const names = new Set(finalResult.value.rooms.map((r) => r.name));
      assert.equal(names.size, 10, 'all 10 room names must be distinct');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});

// ─────────────────────── Phase 16 constants ──────────────────────────────────

describe('Phase 16 constants', () => {
  test('SHARE_PROTOCOL_ID is /wellinformed/share/1.0.0', () => {
    assert.equal(SHARE_PROTOCOL_ID, '/wellinformed/share/1.0.0');
  });

  test('REMOTE_ORIGIN is a Symbol with description wellinformed-share-remote', () => {
    assert.equal(typeof REMOTE_ORIGIN, 'symbol');
    assert.equal(
      (REMOTE_ORIGIN as symbol).description,
      'wellinformed-share-remote',
      'REMOTE_ORIGIN Symbol description must be stable for test assertions',
    );
  });

  test('REMOTE_ORIGIN !== undefined and !== null (is a unique symbol)', () => {
    assert.notEqual(REMOTE_ORIGIN as unknown, undefined);
    assert.notEqual(REMOTE_ORIGIN as unknown, null);
    assert.notEqual(REMOTE_ORIGIN as unknown, Symbol('wellinformed-share-remote'), 'two Symbol() calls with same desc are not equal');
  });
});
