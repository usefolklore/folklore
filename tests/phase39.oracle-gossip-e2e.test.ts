/**
 * Phase 39 — oracle gossip E2E (Layer B of peer discovery).
 *
 * Two real libp2p nodes on ephemeral ports. Alice publishes a question
 * over pubsub; Bob subscribes; Bob's graph repo receives and upserts
 * the validated question. Same trust-boundary semantics as the phase35
 * touch E2E — validator + secret-gate still gate everything on Bob's
 * side.
 *
 * What this pins:
 *
 *   G1  publish→subscribe round-trip: Alice's question arrives at Bob's
 *       graph without either peer doing an explicit touch/dial handshake
 *       first (pubsub auto-activates on connection).
 *   G2  bad wire format is rejected and observable via onRejected,
 *       not thrown into the libp2p event loop (so one bad publisher
 *       can't crash the subscriber's pubsub service).
 *   G3  size cap rejects oversized messages before parse / validation.
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Libp2p } from '@libp2p/interface';

import { loadOrCreateIdentity, createNode } from '../src/infrastructure/peer-transport.js';
import { fileGraphRepository } from '../src/infrastructure/graph-repository.js';
import {
  publishQuestion,
  subscribeOracle,
  ORACLE_TOPIC,
  type SubscribeHandle,
} from '../src/infrastructure/oracle-gossip.js';
import { nodeFromQuestion } from '../src/domain/oracle.js';

describe('Phase 39 — oracle gossip E2E (two real pubsub peers)', () => {
  let aliceHome = '';
  let bobHome = '';
  let aliceNode: Libp2p | undefined;
  let bobNode: Libp2p | undefined;
  let bobSub: SubscribeHandle | undefined;
  let alicePeerIdStr = '';
  // Observers capture Bob's accept/reject events so assertions can
  // wait until the message actually lands.
  const accepted: Array<{ kind: string; id: string }> = [];
  const rejected: string[] = [];

  before(async () => {
    aliceHome = mkdtempSync(join(tmpdir(), 'wi-p39-alice-'));
    bobHome = mkdtempSync(join(tmpdir(), 'wi-p39-bob-'));
    // Seed empty graphs so the repos can load/save cleanly.
    const emptyGraph = { directed: false, multigraph: false, graph: { hyperedges: [] }, nodes: [], links: [] };
    writeFileSync(join(aliceHome, 'graph.json'), JSON.stringify(emptyGraph));
    writeFileSync(join(bobHome,   'graph.json'), JSON.stringify(emptyGraph));

    const [aliceIdR, bobIdR] = await Promise.all([
      loadOrCreateIdentity(join(aliceHome, 'peer-identity.json')),
      loadOrCreateIdentity(join(bobHome,   'peer-identity.json')),
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
    bobNode   = bobNodeR.value;
    alicePeerIdStr = aliceIdR.value.peerId;

    // Bob subscribes before Alice publishes; caller's graph repo picks
    // up inbound nodes. onAccepted + onRejected drive the assertion
    // barrier — tests poll `accepted` / `rejected` instead of relying
    // on timing.
    const repo = fileGraphRepository(join(bobHome, 'graph.json'));
    const sub = await subscribeOracle(bobNode, {
      graphRepo: repo,
      onAccepted: (msg) => {
        accepted.push({ kind: msg.kind, id: msg.node.id });
      },
      onRejected: (reason) => {
        rejected.push(reason);
      },
    });
    if (sub.isErr()) throw sub.error;
    bobSub = sub.value;
    // Alice also subscribes so floodsub announces Alice as a subscriber
    // of the topic to Bob — in floodsub, a peer only forwards to peers
    // it has seen subscribed. Without this, Bob's subscription isn't
    // visible to Alice and the message wouldn't be forwarded.
    const aliceSvc = (aliceNode.services as Record<string, unknown>).pubsub as {
      subscribe: (t: string) => void;
    };
    aliceSvc.subscribe(ORACLE_TOPIC);

    // Dial Alice → Bob so they share a live connection before publish.
    const aliceAddrs = aliceNode.getMultiaddrs();
    assert.ok(aliceAddrs.length > 0);
    await bobNode.dial(aliceAddrs[0]);
    // Give floodsub one tick to exchange subscription announcements.
    await new Promise<void>((r) => setTimeout(r, 150));
  });

  after(async () => {
    bobSub?.unsubscribe();
    await Promise.allSettled([aliceNode?.stop(), bobNode?.stop()]);
    if (aliceHome) rmSync(aliceHome, { recursive: true, force: true });
    if (bobHome)   rmSync(bobHome,   { recursive: true, force: true });
  });

  test('G1: Alice publishes a question, Bob receives and upserts it via pubsub', async () => {
    assert.ok(aliceNode && bobNode && bobSub);
    accepted.length = 0;
    rejected.length = 0;

    const q = nodeFromQuestion({
      text: 'How fast can rag-on-cpu go with bge-base + hybrid BM25?',
      askedBy: alicePeerIdStr,
      date: new Date('2026-04-17T12:00:00Z'),
    });
    const pub = await publishQuestion(aliceNode!, q);
    assert.ok(pub.isOk(), `publish failed: ${pub.isErr() ? JSON.stringify(pub.error) : ''}`);

    // Wait for Bob's subscribe handler to accept. Polling beats a fixed
    // sleep — avoid timing flakes on CI. 1s budget is generous.
    const deadline = Date.now() + 1500;
    while (accepted.length === 0 && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 25));
    }
    assert.strictEqual(accepted.length, 1, `expected 1 accepted msg, got ${accepted.length} (rejected=${JSON.stringify(rejected)})`);
    assert.strictEqual(accepted[0].kind, 'question');
    assert.strictEqual(accepted[0].id, q.id);
  });

  test('G2: malformed JSON on the topic is rejected, not thrown', async () => {
    assert.ok(aliceNode && bobSub);
    accepted.length = 0;
    rejected.length = 0;

    const alicePubsub = (aliceNode!.services as Record<string, unknown>).pubsub as {
      publish: (t: string, d: Uint8Array) => Promise<unknown>;
    };
    const junk = new TextEncoder().encode('{not valid json[');
    await alicePubsub.publish(ORACLE_TOPIC, junk);

    const deadline = Date.now() + 1000;
    while (rejected.length === 0 && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 25));
    }
    assert.strictEqual(accepted.length, 0, 'malformed input must NOT have been accepted');
    assert.strictEqual(rejected.length, 1, `expected 1 rejection, got ${rejected.length}`);
    assert.match(rejected[0], /json parse/);
  });

  test('G3: oversized payload is rejected before parse', async () => {
    assert.ok(aliceNode);
    accepted.length = 0;
    rejected.length = 0;

    // 65KB — just past the 64KB cap.
    const big = new TextEncoder().encode('x'.repeat(65 * 1024));
    const alicePubsub = (aliceNode!.services as Record<string, unknown>).pubsub as {
      publish: (t: string, d: Uint8Array) => Promise<unknown>;
    };
    await alicePubsub.publish(ORACLE_TOPIC, big);

    const deadline = Date.now() + 1000;
    while (rejected.length === 0 && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 25));
    }
    assert.strictEqual(accepted.length, 0);
    assert.strictEqual(rejected.length, 1, `expected 1 rejection, got ${rejected.length}`);
    assert.match(rejected[0], /exceeds cap/);
  });
});
