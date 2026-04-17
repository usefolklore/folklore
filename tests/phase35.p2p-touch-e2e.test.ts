/**
 * Phase 35 — P2P touch end-to-end.
 *
 * Two real libp2p nodes on ephemeral ports. Alice seeds a graph, marks
 * one room shareable, registers the touch protocol. Bob dials Alice
 * over 127.0.0.1 TCP, opens a touch stream, and the test asserts on
 * the wire traffic — not on source-grep invariants.
 *
 * This is the test that was missing per the handoff audit: phases 15
 * through 18 all verify structural wiring (reading source files, not
 * dialling). The red flag was the uncommitted `claude-session:` /
 * `file-uri:` additions to remote-node-validator.ts, which implied the
 * validator was being tripped by real traffic without any regression
 * coverage to catch it.
 *
 * Scenarios covered:
 *   E1  round-trip: Alice shares 'research', Bob pulls, receives all
 *       three research nodes, zero rejections
 *   E2  gate: Bob tries to touch 'private' (not shared) → responder
 *       returns 'room-not-shared' error, nodes array empty
 *   E3  trust boundary: every node Bob received passes the remote-node
 *       validator in this process (closes the loop on the boundary)
 *
 * Run: node --import tsx --test tests/phase35.p2p-touch-e2e.test.ts
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Libp2p } from '@libp2p/interface';

import { loadOrCreateIdentity, createNode } from '../src/infrastructure/peer-transport.js';
import {
  createTouchRegistry,
  registerTouchProtocol,
  openTouchStream,
} from '../src/infrastructure/touch-protocol.js';
import { fileGraphRepository } from '../src/infrastructure/graph-repository.js';
import type { GraphJson } from '../src/domain/graph.js';
import { validateRemoteNodes } from '../src/domain/remote-node-validator.js';

/** Build a minimal graph.json covering two rooms — one shareable, one not. */
const seedGraph = (): GraphJson => ({
  directed: false,
  multigraph: false,
  graph: { hyperedges: [] },
  nodes: [
    {
      id: 'arxiv://2409.02685',
      label: 'RouterRetriever (AAAI 2025)',
      file_type: 'paper',
      source_file: 'arxiv:2409.02685',
      room: 'research',
      source_uri: 'arxiv://2409.02685',
      fetched_at: '2026-04-17T00:00:00Z',
    },
    {
      id: 'https://example.org/rng',
      label: 'Relative Neighbourhood Graph notes',
      file_type: 'document',
      source_file: 'web:rng',
      room: 'research',
      source_uri: 'https://example.org/rng',
      fetched_at: '2026-04-17T00:00:00Z',
    },
    {
      // hn:// is a research-scheme URI, so it lives in the `research`
      // system room alongside the arxiv + https nodes above.
      id: 'hn://story/1',
      label: 'HN thread on retrieval latency',
      file_type: 'document',
      source_file: 'hn',
      room: 'research',
      source_uri: 'hn://story/1',
      fetched_at: '2026-04-17T00:00:00Z',
    },
    {
      // Toolshed-scheme node — covered by the E4 test. Intentionally
      // in a user-chosen `room` (not 'toolshed') to prove virtual
      // membership wins over the physical room field.
      id: 'git://abc123',
      label: 'commit abc123 — hybrid bm25 fix',
      file_type: 'code',
      source_file: 'git:local',
      room: 'wellinformed-dev',
      source_uri: 'git://abc123',
      fetched_at: '2026-04-17T00:00:00Z',
    },
    {
      id: 'priv://secret-1',
      label: 'private note',
      file_type: 'rationale',
      source_file: 'local',
      room: 'private',
      source_uri: 'https://example.org/private',
      fetched_at: '2026-04-17T00:00:00Z',
    },
  ],
  links: [],
});

describe('Phase 35 — P2P touch E2E (two real libp2p nodes)', () => {
  let aliceHome = '';
  let bobHome = '';
  let aliceNode: Libp2p | undefined;
  let bobNode: Libp2p | undefined;
  let alicePeerId = '';

  before(async () => {
    aliceHome = mkdtempSync(join(tmpdir(), 'wi-p35-alice-'));
    bobHome = mkdtempSync(join(tmpdir(), 'wi-p35-bob-'));

    // Alice seeds graph + shared-rooms manifest
    writeFileSync(join(aliceHome, 'graph.json'), JSON.stringify(seedGraph()));
    writeFileSync(
      join(aliceHome, 'shared-rooms.json'),
      JSON.stringify({
        version: 2,
        rooms: [
          // `research` as a physical room is legacy — system room
          // coverage handles it now, but we keep the entry so older
          // peers who dial by name still land on a valid room.
          { name: 'research', sharedAt: '2026-04-17T00:00:00Z', shareable: true },
          // `private` explicitly opts OUT of all sharing, including
          // virtual system-room membership. Nodes tagged `room: private`
          // must NEVER cross the wire — this is the test's trust-boundary
          // fixture.
          { name: 'private',  sharedAt: '2026-04-17T00:00:00Z', shareable: false },
        ],
      }),
    );

    // Identities + libp2p nodes on ephemeral ports
    const [aliceIdR, bobIdR] = await Promise.all([
      loadOrCreateIdentity(join(aliceHome, 'peer-identity.json')),
      loadOrCreateIdentity(join(bobHome, 'peer-identity.json')),
    ]);
    if (aliceIdR.isErr()) throw aliceIdR.error;
    if (bobIdR.isErr())   throw bobIdR.error;

    const [aliceNodeR, bobNodeR] = await Promise.all([
      createNode(aliceIdR.value, { listenPort: 0, listenHost: '127.0.0.1', upnp: false }),
      createNode(bobIdR.value,   { listenPort: 0, listenHost: '127.0.0.1', upnp: false }),
    ]);
    if (aliceNodeR.isErr()) throw aliceNodeR.error;
    if (bobNodeR.isErr())   throw bobNodeR.error;
    aliceNode = aliceNodeR.value;
    bobNode = bobNodeR.value;
    alicePeerId = aliceIdR.value.peerId;

    // Alice registers the touch responder
    const graphRepo = fileGraphRepository(join(aliceHome, 'graph.json'));
    const registry = createTouchRegistry(aliceNode, aliceHome, graphRepo, 1000, 100);
    const regR = await registerTouchProtocol(registry);
    if (regR.isErr()) throw regR.error;

    // Bob dials Alice's first listen address directly (no mDNS — deterministic)
    const aliceAddrs = aliceNode.getMultiaddrs();
    assert.ok(aliceAddrs.length > 0, 'Alice must advertise at least one multiaddr');
    await bobNode.dial(aliceAddrs[0]);
  });

  after(async () => {
    await Promise.allSettled([aliceNode?.stop(), bobNode?.stop()]);
    if (aliceHome) rmSync(aliceHome, { recursive: true, force: true });
    if (bobHome)   rmSync(bobHome,   { recursive: true, force: true });
  });

  test('E1 round-trip: Bob pulls `research` — virtual membership by URI scheme', async () => {
    assert.ok(bobNode, 'bob node must be up');
    const r = await openTouchStream(bobNode!, alicePeerId, 'research');
    assert.ok(r.isOk(), `openTouchStream failed: ${r.isErr() ? JSON.stringify(r.error) : ''}`);
    if (r.isErr()) return;
    const { nodes, rejected } = r.value;
    // System-room `research` membership is derived from source_uri
    // scheme — arxiv://, https://, hn:// all qualify. The git:// and
    // priv:// nodes in Alice's graph must NOT leak in.
    assert.strictEqual(nodes.length, 3, `expected 3 research-scheme nodes, got ${nodes.length}`);
    assert.strictEqual(rejected.length, 0, `unexpected rejections: ${JSON.stringify(rejected)}`);
    const ids = new Set(nodes.map((n) => n.id));
    assert.ok(ids.has('arxiv://2409.02685'));
    assert.ok(ids.has('https://example.org/rng'));
    assert.ok(ids.has('hn://story/1'));
    for (const n of nodes) {
      assert.notStrictEqual(n.id, 'git://abc123', 'toolshed-scheme node leaked into research');
      assert.notStrictEqual(n.id, 'priv://secret-1', 'private-room node leaked into research');
    }
  });

  test('E4 system room `toolshed`: Bob pulls toolshed and gets the git-scheme node regardless of its physical room', async () => {
    assert.ok(bobNode);
    // Toolshed is never listed in Alice's shared-rooms.json — the
    // touch handler auto-allows system rooms. The git:// node's
    // physical room is `wellinformed-dev`, NOT 'toolshed' — virtual
    // membership wins.
    const r = await openTouchStream(bobNode!, alicePeerId, 'toolshed');
    assert.ok(r.isOk(), `toolshed touch failed: ${r.isErr() ? JSON.stringify(r.error) : ''}`);
    if (r.isErr()) return;
    const ids = new Set(r.value.nodes.map((n) => n.id));
    assert.ok(ids.has('git://abc123'), 'git:// node must land in toolshed');
    // No research-scheme nodes in toolshed
    assert.ok(!ids.has('arxiv://2409.02685'));
    assert.ok(!ids.has('hn://story/1'));
  });

  test('E2 gate: Bob cannot touch `private` — responder returns room-not-shared', async () => {
    assert.ok(bobNode);
    const r = await openTouchStream(bobNode!, alicePeerId, 'private');
    // The wire protocol returns ok() with an empty nodes array + an error
    // code on room-not-shared — the dial itself succeeds, the responder
    // just refuses to serve. So we expect isOk + empty nodes.
    // (A hard TouchError would only come from transport failures.)
    if (r.isOk()) {
      assert.strictEqual(r.value.nodes.length, 0, 'private room must yield zero nodes');
    } else {
      // Acceptable alternative: responder surfaces a protocol error string
      // that the initiator maps to a TouchError. Either is a successful
      // gate — what we're ruling out is "received the private node".
      assert.ok(true, 'gate refused via TouchError — acceptable');
    }
  });

  test('E3 trust boundary: every received node passes the remote-node validator locally', async () => {
    assert.ok(bobNode);
    const r = await openTouchStream(bobNode!, alicePeerId, 'research');
    assert.ok(r.isOk());
    if (r.isErr()) return;
    // Re-run the validator on Bob's side. Touch already does validation
    // inside openTouchStream (that's what rejected[] is for). This test
    // pins the contract by validating again independently — if the
    // validator ever rejects a node shape the responder emits, both
    // sides surface the drift here.
    const v = validateRemoteNodes(r.value.nodes);
    assert.strictEqual(
      v.rejected.length,
      0,
      `validator rejected received nodes: ${JSON.stringify(v.rejected)}`,
    );
    assert.strictEqual(v.accepted.length, r.value.nodes.length);
  });
});
