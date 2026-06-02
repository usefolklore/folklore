/**
 * Phase 39 — oracle gossip E2E (Layer B of peer discovery).
 *
 * In-process port of the original two-real-libp2p-nodes test. The real
 * pubsub is replaced with a fake bus that exercises the SAME public
 * contract `oracle-gossip.ts` consumes: `publish`, `subscribe`,
 * `unsubscribe`, `addEventListener('message', …)`, `removeEventListener`.
 * Fan-out semantics match floodsub — publish reaches every other peer
 * that has both subscribed to the topic and attached a listener.
 *
 * Why port: the previous incarnation spun two real libp2p nodes on
 * ephemeral ports, which flaked on shared CI runners (port allocation
 * contention, mDNS sandboxing, 1.5s deadline). The behavioural surface
 * Phase 39 actually pins is the validator + reject pathway in
 * `subscribeOracle`, not libp2p's own wire — fake bus is sufficient.
 *
 * What this still pins:
 *
 *   G1  publish→subscribe round-trip: Alice's question reaches Bob's
 *       graph via the oracle subscribe handler + onAccepted observer
 *   G2  malformed JSON on the topic is rejected via onRejected
 *       (not thrown into the message handler) — one bad publisher
 *       cannot crash a subscriber's pubsub service
 *   G3  oversized payload (>64KB) is rejected before parse, with
 *       a reject reason that names the cap
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Libp2p } from '@libp2p/interface';

import { fileGraphRepository } from '../src/infrastructure/graph-repository.js';
import {
  publishQuestion,
  subscribeOracle,
  ORACLE_TOPIC,
  type SubscribeHandle,
} from '../src/infrastructure/oracle-gossip.js';
import { nodeFromQuestion } from '../src/domain/oracle.js';

// ─────────────── in-process pubsub bus ───────────────

interface PeerSlot {
  readonly id: string;
  readonly topics: Set<string>;
  readonly listeners: Set<(e: CustomEvent<{ topic: string; data: Uint8Array; from: string }>) => void>;
}

/**
 * Shared in-process pubsub bus. fan-out matches floodsub — a publish
 * is delivered to every OTHER peer that has both subscribed to the
 * topic and attached a 'message' listener. The publisher itself is
 * never echoed (matches libp2p default behaviour).
 */
class FakeBus {
  private readonly peers = new Map<string, PeerSlot>();

  attach(peerId: string): PeerSlot {
    const slot: PeerSlot = { id: peerId, topics: new Set(), listeners: new Set() };
    this.peers.set(peerId, slot);
    return slot;
  }

  detach(peerId: string): void {
    this.peers.delete(peerId);
  }

  publish(fromPeerId: string, topic: string, data: Uint8Array): void {
    for (const [peerId, slot] of this.peers.entries()) {
      if (peerId === fromPeerId) continue;     // no echo
      if (!slot.topics.has(topic)) continue;   // not subscribed
      const event = new CustomEvent('message', {
        detail: { topic, data, from: fromPeerId },
      });
      // Dispatch via microtask so callers can await a turn of the
      // event loop just like real pubsub.
      queueMicrotask(() => {
        for (const listener of slot.listeners) {
          try { listener(event); }
          catch { /* the real PubsubService swallows handler throws too */ }
        }
      });
    }
  }
}

/** Build a fake Libp2p node whose `services.pubsub` speaks the bus. */
const makeFakeNode = (bus: FakeBus, peerId: string): Libp2p => {
  const slot = bus.attach(peerId);
  const pubsub = {
    publish: async (topic: string, data: Uint8Array): Promise<void> => {
      bus.publish(peerId, topic, data);
    },
    subscribe: (topic: string): void => { slot.topics.add(topic); },
    unsubscribe: (topic: string): void => { slot.topics.delete(topic); },
    addEventListener: (
      _type: string,
      listener: (e: CustomEvent<{ topic: string; data: Uint8Array; from: string }>) => void,
    ): void => { slot.listeners.add(listener); },
    removeEventListener: (
      _type: string,
      listener: (e: CustomEvent<{ topic: string; data: Uint8Array; from: string }>) => void,
    ): void => { slot.listeners.delete(listener); },
  };
  // Cast to Libp2p — only `services.pubsub` is touched by oracle-gossip.
  return { services: { pubsub } } as unknown as Libp2p;
};

// ─────────────── test fixtures ───────────────

describe('Phase 39 — oracle gossip E2E (in-process pubsub)', () => {
  let aliceHome = '';
  let bobHome = '';
  let bus: FakeBus | undefined;
  let aliceNode: Libp2p | undefined;
  let bobNode: Libp2p | undefined;
  let bobSub: SubscribeHandle | undefined;
  const alicePeerIdStr = '12D3KooAlice0000000000000000000000000000000000';
  const bobPeerIdStr = '12D3KooBob000000000000000000000000000000000000';

  const accepted: Array<{ kind: string; id: string }> = [];
  const rejected: string[] = [];

  before(async () => {
    aliceHome = mkdtempSync(join(tmpdir(), 'ak-p39-alice-'));
    bobHome = mkdtempSync(join(tmpdir(), 'ak-p39-bob-'));
    const emptyGraph = {
      directed: false, multigraph: false, graph: { hyperedges: [] }, nodes: [], links: [],
    };
    writeFileSync(join(aliceHome, 'graph.json'), JSON.stringify(emptyGraph));
    writeFileSync(join(bobHome, 'graph.json'), JSON.stringify(emptyGraph));

    bus = new FakeBus();
    aliceNode = makeFakeNode(bus, alicePeerIdStr);
    bobNode = makeFakeNode(bus, bobPeerIdStr);

    // Bob subscribes BEFORE Alice publishes; same handler wiring as
    // production runtime.
    const repo = fileGraphRepository(join(bobHome, 'graph.json'));
    const sub = await subscribeOracle(bobNode, {
      graphRepo: repo,
      onAccepted: (msg) => { accepted.push({ kind: msg.kind, id: msg.node.id }); },
      onRejected: (reason) => { rejected.push(reason); },
    });
    if (sub.isErr()) throw sub.error;
    bobSub = sub.value;

    // Alice also subscribes to the topic so the fake fan-out matches
    // floodsub's "only forward to known subscribers" behaviour. Real
    // libp2p needs this to thread the subscription announcement; the
    // bus uses it as part of the fan-out check (skip non-subscribers).
    const aliceSvc = (aliceNode.services as Record<string, unknown>).pubsub as {
      subscribe: (t: string) => void;
    };
    aliceSvc.subscribe(ORACLE_TOPIC);
  });

  after(async () => {
    bobSub?.unsubscribe();
    if (bus) {
      bus.detach(alicePeerIdStr);
      bus.detach(bobPeerIdStr);
    }
    if (aliceHome) rmSync(aliceHome, { recursive: true, force: true });
    if (bobHome) rmSync(bobHome, { recursive: true, force: true });
  });

  // ─────────────── G1: happy path ─────────

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

    // Poll the assertion barrier — same UX as the libp2p version, but
    // the deadline can be tight because there's no network in the loop.
    const deadline = Date.now() + 500;
    while (accepted.length === 0 && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 5));
    }
    assert.strictEqual(accepted.length, 1,
      `expected 1 accepted msg, got ${accepted.length} (rejected=${JSON.stringify(rejected)})`);
    assert.strictEqual(accepted[0].kind, 'question');
    assert.strictEqual(accepted[0].id, q.id);
  });

  // ─────────────── G2: parser-reject pathway ─────────

  test('G2: malformed JSON on the topic is rejected, not thrown', async () => {
    assert.ok(aliceNode && bobSub);
    accepted.length = 0;
    rejected.length = 0;

    const aliceSvc = (aliceNode!.services as Record<string, unknown>).pubsub as {
      publish: (t: string, d: Uint8Array) => Promise<unknown>;
    };
    const junk = new TextEncoder().encode('{not valid json[');
    await aliceSvc.publish(ORACLE_TOPIC, junk);

    const deadline = Date.now() + 500;
    while (rejected.length === 0 && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 5));
    }
    assert.strictEqual(accepted.length, 0, 'malformed input must NOT have been accepted');
    assert.strictEqual(rejected.length, 1, `expected 1 rejection, got ${rejected.length}`);
    assert.match(rejected[0], /json parse/);
  });

  // ─────────────── G3: size cap ───────────

  test('G3: oversized payload is rejected before parse', async () => {
    assert.ok(aliceNode);
    accepted.length = 0;
    rejected.length = 0;

    // 65KB — just past the 64KB cap inside oracle-gossip's handler.
    const big = new TextEncoder().encode('x'.repeat(65 * 1024));
    const aliceSvc = (aliceNode!.services as Record<string, unknown>).pubsub as {
      publish: (t: string, d: Uint8Array) => Promise<unknown>;
    };
    await aliceSvc.publish(ORACLE_TOPIC, big);

    const deadline = Date.now() + 500;
    while (rejected.length === 0 && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 5));
    }
    assert.strictEqual(accepted.length, 0);
    assert.strictEqual(rejected.length, 1, `expected 1 rejection, got ${rejected.length}`);
    assert.match(rejected[0], /exceeds cap/);
  });
});
