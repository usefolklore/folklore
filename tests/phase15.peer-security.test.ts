/**
 * Phase 15: Peer Foundation + Security — requirement tests.
 *
 * Covers PEER-01..05, SEC-01..06.
 * Pure unit tests except PEER-01 (uses tmp dir for identity file).
 *
 * SEC-05: structural assertion — connectionEncrypters: [noise()] present
 *         as a contiguous pattern in peer-transport.ts source.
 * SEC-06: PeerId starts with '12D3' prefix (ed25519 multihash, base58btc).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { scanNode, auditRoom, buildPatterns } from '../src/domain/sharing.js';
import type { GraphNode } from '../src/domain/graph.js';
import { loadOrCreateIdentity } from '../src/infrastructure/peer-transport.js';
import {
  loadPeers,
  savePeers,
  addPeerRecord,
  removePeerRecord,
} from '../src/infrastructure/peer-store.js';
import type { PeersFile, PeerRecord } from '../src/infrastructure/peer-store.js';

// ─────────────────────── helpers ──────────────────────────

const makeNode = (overrides: Partial<GraphNode> = {}): GraphNode => ({
  id: 'test-node-1',
  label: 'Clean test node',
  file_type: 'document',
  source_file: '/tmp/test.md',
  room: 'test-room',
  ...overrides,
});

const patterns = buildPatterns();

// ─────────────────────── SEC-01: all 10 secret patterns detected ──────────

describe('SEC-01: secrets scanner detects all 10 built-in patterns', () => {
  const secretSamples: Array<{
    patternName: string;
    field: 'label' | 'source_uri';
    value: string;
  }> = [
    {
      patternName: 'openai-key',
      field: 'label',
      value: 'key is sk-abcdefghij1234567890xx',
    },
    {
      patternName: 'github-token',
      field: 'label',
      value: 'token ghp_REDACTED_TEST_VALUE_36CHARS_AAAAAAAA',
    },
    {
      patternName: 'github-oauth',
      field: 'label',
      value: 'oauth gho_REDACTED_TEST_VALUE_36CHARS_AAAAAAAA',
    },
    {
      patternName: 'aws-key-id',
      field: 'source_uri',
      value: 'https://s3.aws?key=AKIA-REDACTED-AB',
    },
    {
      patternName: 'stripe-live',
      field: 'label',
      value: 'sk_live_REDACTEDTEST24CHARS_Q',
    },
    {
      patternName: 'bearer-token',
      field: 'label',
      value: 'Bearer eyJhbGciOiJIUzI1NiIsI',
    },
    {
      patternName: 'password-kv',
      field: 'label',
      value: 'password=mysecretpassword123',
    },
    {
      patternName: 'api-key-kv',
      field: 'label',
      value: 'api_key=abcdefghij1234567890',
    },
    {
      patternName: 'env-token',
      field: 'label',
      value: 'GITHUB_TOKEN=ghp_realvalue123456',
    },
    {
      patternName: 'env-secret',
      field: 'label',
      value: 'AWS_SECRET=AKIA-REDACTED-AA',
    },
  ];

  for (const { patternName, field, value } of secretSamples) {
    test(`detects ${patternName} in ${field}`, () => {
      const node = makeNode({ [field]: value });
      const result = scanNode(node, patterns);
      assert.ok(result.isErr(), `expected err for pattern ${patternName}`);
      const match = result.error.matches.find((m) => m.patternName === patternName);
      assert.ok(
        match,
        `expected match for pattern ${patternName}, got: ${JSON.stringify(result.error.matches)}`,
      );
      assert.equal(match.field, field);
    });
  }

  test('buildPatterns returns exactly 10 built-in patterns', () => {
    assert.equal(patterns.length, 10);
  });

  test('buildPatterns merges custom patterns with built-ins', () => {
    const custom = buildPatterns([{ name: 'custom', pattern: 'CUSTOM_\\d+' }]);
    assert.equal(custom.length, 11);
    assert.equal(custom[10].name, 'custom');
  });

  test('scanNode returns ok for a clean node', () => {
    const node = makeNode({ label: 'harmless research note' });
    const result = scanNode(node, patterns);
    assert.ok(result.isOk(), `expected ok, got: ${JSON.stringify(result)}`);
  });
});

// ─────────────────────── SEC-02: flagged nodes return typed error ─────────

describe('SEC-02: flagged nodes are hard-blocked with SecretDetected', () => {
  test('scanNode returns err with type SecretDetected', () => {
    const node = makeNode({ label: 'has sk-abcdefghij1234567890xx' });
    const result = scanNode(node, patterns);
    assert.ok(result.isErr());
    assert.equal(result.error.type, 'SecretDetected');
    assert.equal(result.error.nodeId, node.id);
    assert.ok(result.error.matches.length > 0);
  });

  test('auditRoom counts blocked nodes correctly', () => {
    const clean1 = makeNode({ id: 'c1' });
    const clean2 = makeNode({ id: 'c2' });
    const flagged = makeNode({ id: 'f1', label: 'has sk-abcdefghij1234567890xx' });
    const result = auditRoom([clean1, clean2, flagged], patterns);
    assert.equal(result.allowed.length, 2);
    assert.equal(result.blocked.length, 1);
    assert.equal(result.blocked[0].nodeId, 'f1');
  });
});

// ─────────────────────── SEC-03: ShareableNode field boundary ────────────

describe('SEC-03: ShareableNode excludes internal fields', () => {
  test('scanNode ok result has no file_type or source_file keys', () => {
    const node = makeNode({ id: 'safe-1', label: 'harmless' });
    const result = scanNode(node, patterns);
    assert.ok(result.isOk());
    const keys = Object.keys(result.value);
    assert.ok(!keys.includes('file_type'), 'ShareableNode must not have file_type');
    assert.ok(!keys.includes('source_file'), 'ShareableNode must not have source_file');
  });

  test('scanNode ok result carries expected safe fields', () => {
    const node = makeNode({
      id: 'safe-2',
      label: 'test node',
      room: 'r1',
      source_uri: 'https://example.com',
      fetched_at: '2026-01-01T00:00:00Z',
      embedding_id: 'emb-1',
    });
    const result = scanNode(node, patterns);
    assert.ok(result.isOk());
    const v = result.value;
    assert.equal(v.id, 'safe-2');
    assert.equal(v.label, 'test node');
    assert.equal(v.room, 'r1');
    assert.equal(v.source_uri, 'https://example.com');
    assert.equal(v.fetched_at, '2026-01-01T00:00:00Z');
    assert.equal(v.embedding_id, 'emb-1');
  });
});

// ─────────────────────── SEC-04: auditRoom partitions correctly ───────────

describe('SEC-04: auditRoom correctly partitions allowed and blocked nodes', () => {
  test('returns allowed and blocked arrays with correct counts', () => {
    const nodes = [
      makeNode({ id: 'a1', label: 'safe node' }),
      makeNode({ id: 'a2', label: 'also safe' }),
      makeNode({ id: 'b1', label: 'ghp_REDACTED_TEST_VALUE_36CHARS_AAAAAAAA' }),
    ];
    const result = auditRoom(nodes, patterns);
    assert.equal(result.allowed.length, 2);
    assert.equal(result.blocked.length, 1);
    assert.equal(result.blocked[0].nodeId, 'b1');
    assert.ok(result.blocked[0].matches.some((m) => m.patternName === 'github-token'));
  });

  test('all-clean room returns all nodes allowed, zero blocked', () => {
    const nodes = [makeNode({ id: 'c1' }), makeNode({ id: 'c2' })];
    const result = auditRoom(nodes, patterns);
    assert.equal(result.allowed.length, 2);
    assert.equal(result.blocked.length, 0);
  });

  test('empty room returns empty allowed and blocked arrays', () => {
    const result = auditRoom([], patterns);
    assert.equal(result.allowed.length, 0);
    assert.equal(result.blocked.length, 0);
  });

  test('multiple flagged nodes each have their own match list', () => {
    const nodes = [
      makeNode({ id: 'f1', label: 'sk-abcdefghij1234567890xx' }),
      makeNode({ id: 'f2', label: 'ghp_REDACTED_TEST_VALUE_36CHARS_AAAAAAAA' }),
    ];
    const result = auditRoom(nodes, patterns);
    assert.equal(result.allowed.length, 0);
    assert.equal(result.blocked.length, 2);
    const ids = result.blocked.map((b) => b.nodeId);
    assert.ok(ids.includes('f1'));
    assert.ok(ids.includes('f2'));
  });
});

// ─────────────────────── SEC-05: Noise encryption (structural) ───────────

describe('SEC-05: Noise encryption configured as contiguous pattern', () => {
  test('peer-transport.ts source contains connectionEncrypters: [noise()] as contiguous pattern', () => {
    const srcPath = join(
      import.meta.dirname,
      '..',
      'src',
      'infrastructure',
      'peer-transport.ts',
    );
    const src = readFileSync(srcPath, 'utf8');
    // Contiguous pattern — not just separate occurrences of noise() and connectionEncrypters
    assert.match(
      src,
      /connectionEncrypters:\s*\[noise\(\)\]/,
      'peer-transport.ts must configure connectionEncrypters: [noise()] as a contiguous pattern (SEC-05)',
    );
  });
});

// ─────────────────────── SEC-06: PeerId prefix (ed25519 multihash) ───────

describe('SEC-06: PeerId uses ed25519 multihash (12D3 prefix)', () => {
  test('generated PeerId starts with 12D3 prefix', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wi-sec06-'));
    try {
      const idPath = join(tmp, 'peer-identity.json');
      const result = await loadOrCreateIdentity(idPath);
      assert.ok(result.isOk(), `expected ok, got: ${JSON.stringify(result)}`);
      assert.ok(typeof result.value.peerId === 'string');
      assert.ok(result.value.peerId.length > 10, 'PeerId should be a substantial string');
      assert.ok(
        result.value.peerId.startsWith('12D3'),
        `PeerId should start with 12D3 prefix (ed25519 multihash), got: ${result.value.peerId.slice(0, 12)}...`,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ─────────────────────── PEER-01: ed25519 identity generation ────────────

describe('PEER-01: loadOrCreateIdentity generates and loads ed25519 keypair', () => {
  test('generates peer-identity.json when absent', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wi-peer01-'));
    try {
      const idPath = join(tmp, 'peer-identity.json');
      assert.ok(!existsSync(idPath), 'file must not exist before first call');
      const result = await loadOrCreateIdentity(idPath);
      assert.ok(result.isOk(), `expected ok, got: ${JSON.stringify(result)}`);
      assert.ok(existsSync(idPath), 'peer-identity.json must be created on disk');

      const stored = JSON.parse(readFileSync(idPath, 'utf8'));
      assert.ok(stored.privateKeyB64, 'stored JSON must have privateKeyB64');
      assert.ok(stored.peerId, 'stored JSON must have peerId');
      assert.ok(stored.createdAt, 'stored JSON must have createdAt');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('loads existing identity and returns stable PeerId', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wi-peer01b-'));
    try {
      const idPath = join(tmp, 'peer-identity.json');
      const r1 = await loadOrCreateIdentity(idPath);
      assert.ok(r1.isOk());
      const r2 = await loadOrCreateIdentity(idPath);
      assert.ok(r2.isOk());
      assert.equal(r1.value.peerId, r2.value.peerId, 'PeerId must be stable across load cycles');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('private key raw is 64 bytes (32-byte priv + 32-byte pub, ed25519 convention)', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wi-peer01c-'));
    try {
      const idPath = join(tmp, 'peer-identity.json');
      const result = await loadOrCreateIdentity(idPath);
      assert.ok(result.isOk());
      assert.equal(
        result.value.privateKey.raw.byteLength,
        64,
        'ed25519 raw key must be 64 bytes (32 priv + 32 pub)',
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ─────────────────────── PEER-02: dialAndTag exported (structural) ───────

describe('PEER-02: peer add — dialAndTag is exported from peer-transport', () => {
  test('dialAndTag is a function', async () => {
    const mod = await import('../src/infrastructure/peer-transport.js');
    assert.equal(
      typeof mod.dialAndTag,
      'function',
      'dialAndTag must be exported from peer-transport.ts',
    );
  });
});

// ─────────────────────── PEER-03: removePeerRecord ───────────────────────

describe('PEER-03: peer remove — removePeerRecord', () => {
  test('removes the correct peer by id', () => {
    const result = removePeerRecord(twopers(), 'peer-a');
    assert.equal(result.peers.length, 1);
    assert.equal(result.peers[0].id, 'peer-b');
  });

  test('removing nonexistent id returns file unchanged', () => {
    const result = removePeerRecord(twopers(), 'nonexistent');
    assert.equal(result.peers.length, 2);
  });

  test('removing last peer returns empty peers array', () => {
    const single: PeersFile = {
      peers: [{ id: 'only', addrs: ['/ip4/1.2.3.4/tcp/9001'], addedAt: '2026-01-01T00:00:00Z' }],
    };
    const result = removePeerRecord(single, 'only');
    assert.equal(result.peers.length, 0);
  });

  /** Fresh copy of twopeers to avoid mutation across tests. */
  function twopers(): PeersFile {
    return {
      peers: [
        { id: 'peer-a', addrs: ['/ip4/1.2.3.4/tcp/9001'], addedAt: '2026-01-01T00:00:00Z' },
        { id: 'peer-b', addrs: ['/ip4/5.6.7.8/tcp/9002'], addedAt: '2026-01-02T00:00:00Z' },
      ],
    };
  }

});

// ─────────────────────── PEER-04: loadPeers / savePeers roundtrip ────────

describe('PEER-04: peer list — atomic peers.json roundtrip', () => {
  test('loadPeers returns peers with expected id, addrs, addedAt fields', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wi-peer04-'));
    try {
      const peersPath = join(tmp, 'peers.json');
      const file: PeersFile = {
        peers: [
          {
            id: 'peer-x',
            addrs: ['/ip4/10.0.0.1/tcp/4001'],
            addedAt: '2026-04-12T00:00:00Z',
          },
        ],
      };
      const saveResult = await savePeers(peersPath, file);
      assert.ok(saveResult.isOk(), `savePeers failed: ${JSON.stringify(saveResult)}`);

      const result = await loadPeers(peersPath);
      assert.ok(result.isOk(), `loadPeers failed: ${JSON.stringify(result)}`);
      assert.equal(result.value.peers.length, 1);
      assert.equal(result.value.peers[0].id, 'peer-x');
      assert.deepEqual(result.value.peers[0].addrs, ['/ip4/10.0.0.1/tcp/4001']);
      assert.equal(result.value.peers[0].addedAt, '2026-04-12T00:00:00Z');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('loadPeers returns empty file for nonexistent path', async () => {
    const result = await loadPeers('/tmp/nonexistent-peers-phase15-test.json');
    assert.ok(result.isOk());
    assert.equal(result.value.peers.length, 0);
  });

  test('addPeerRecord upserts: refreshes addrs on duplicate id', () => {
    const file: PeersFile = {
      peers: [{ id: 'p1', addrs: ['/ip4/1.1.1.1/tcp/1'], addedAt: '2026-01-01T00:00:00Z' }],
    };
    const updated = addPeerRecord(file, {
      id: 'p1',
      addrs: ['/ip4/2.2.2.2/tcp/2'],
      addedAt: '2026-01-01T00:00:00Z',
    });
    assert.equal(updated.peers.length, 1, 'no duplicate should be inserted');
    assert.deepEqual(updated.peers[0].addrs, ['/ip4/2.2.2.2/tcp/2']);
  });

  test('addPeerRecord inserts new peer when id is absent', () => {
    const file: PeersFile = { peers: [] };
    const record: PeerRecord = {
      id: 'new-peer',
      addrs: ['/ip4/3.3.3.3/tcp/3'],
      addedAt: '2026-04-12T00:00:00Z',
    };
    const updated = addPeerRecord(file, record);
    assert.equal(updated.peers.length, 1);
    assert.equal(updated.peers[0].id, 'new-peer');
  });
});

// ─────────────────────── PEER-05: peer status fields ─────────────────────

describe('PEER-05: peer status — identity exposes peerId and public key slice', () => {
  test('identity provides string peerId and 32-byte public key slice', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'wi-peer05-'));
    try {
      const idPath = join(tmp, 'peer-identity.json');
      const result = await loadOrCreateIdentity(idPath);
      assert.ok(result.isOk(), `expected ok, got: ${JSON.stringify(result)}`);
      assert.ok(result.value.peerId, 'peerId must be defined');
      assert.ok(typeof result.value.peerId === 'string');
      // Public key occupies the last 32 bytes of the 64-byte raw key
      const pubKeyBytes = result.value.privateKey.raw.slice(32);
      assert.equal(pubKeyBytes.byteLength, 32, 'public key slice must be 32 bytes');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

// ─────────────────────── Regression: regex statefulness ──────────────────

describe('Regression: regex lastIndex must be reset between scanNode calls', () => {
  test('scanning multiple nodes in sequence does not miss matches due to stale lastIndex', () => {
    const flagged1 = makeNode({ id: 'r1', label: 'has sk-abcdefghij1234567890xx' });
    const flagged2 = makeNode({ id: 'r2', label: 'also sk-zyxwvutsrq1234567890xx' });
    const r1 = scanNode(flagged1, patterns);
    const r2 = scanNode(flagged2, patterns);
    assert.ok(r1.isErr(), 'first scan should detect secret');
    assert.ok(r2.isErr(), 'second scan must also detect secret (no regex lastIndex leak)');
  });

  test('clean node after flagged node is still allowed (no false-positive from stale state)', () => {
    const flagged = makeNode({ id: 'dirty', label: 'sk-abcdefghij1234567890xx' });
    const clean = makeNode({ id: 'clean', label: 'harmless note' });
    const r1 = scanNode(flagged, patterns);
    const r2 = scanNode(clean, patterns);
    assert.ok(r1.isErr(), 'dirty node must be blocked');
    assert.ok(r2.isOk(), 'clean node after dirty must still be allowed');
  });
});
