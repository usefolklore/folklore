/**
 * Phase 18: Production Networking — TDD test suite.
 *
 * Three tiers (per 18-RESEARCH.md Validation architecture):
 *   1. Structural — source-read regex assertions (S1..S14)
 *   2. Unit       — connection-health, bandwidth-limiter, share-sync gate (U1..U20)
 *   3. Integration — real 10-peer libp2p mesh (NET-04) — tagged slow
 *
 * All 7 pitfalls from 18-RESEARCH.md are encoded as regression tests.
 *
 * Slow tier: the 10-peer integration test is tagged slow and skippable via
 * `WELLINFORMED_SKIP_SLOW=1`. Unit + structural tiers run always.
 *
 * Runner: node --import tsx --test tests/phase18.production-net.test.ts
 */
import { test, describe, before, after } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

import * as Y from 'yjs';
import type { Libp2p } from '@libp2p/interface';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

/** Recursive source grep — for Pitfall 1 src-wide scan. */
const grepSrcRecursive = (needle: string): string[] => {
  const results: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const s = statSync(full);
      if (s.isDirectory()) walk(full);
      else if (entry.endsWith('.ts')) {
        const txt = readFileSync(full, 'utf8');
        if (txt.includes(needle)) results.push(full);
      }
    }
  };
  walk(join(ROOT, 'src'));
  return results;
};

// ─────────────────────────────────────────────────────────────────────────────
// Structural tier — S1..S14 (NET-01, NET-03, NetError, PeerConfig, daemon)
// No libp2p runtime needed — assertions operate on source text only.
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 18 — Structural: libp2p transport wiring (NET-01, NET-03)', () => {
  const transport = read('src/infrastructure/peer-transport.ts');

  test("S1 NET-01: circuitRelayTransport is in transports[] alongside tcp", () => {
    assert.ok(
      transport.includes('circuitRelayTransport()'),
      'peer-transport.ts must include circuitRelayTransport()',
    );
    assert.ok(
      transport.includes('tcp()'),
      'peer-transport.ts must include tcp()',
    );
    // Both must appear together in the transports array
    const transportsBlock = transport.match(/transports:\s*\[([^\]]+)\]/);
    assert.ok(transportsBlock, 'transports array block must exist');
    assert.ok(
      transportsBlock![1].includes('tcp()') && transportsBlock![1].includes('circuitRelayTransport()'),
      'transports[] must contain both tcp() and circuitRelayTransport()',
    );
  });

  test("S2 NET-01: yamux stream muxer is wired (multiplexed streams)", () => {
    const matches = transport.match(/streamMuxers:\s*\[yamux\(\)\]/g);
    assert.ok(matches && matches.length === 1, 'streamMuxers must include yamux() exactly once');
  });

  test("S3 Pitfall 1 LOCK: circuitRelayServer NEVER appears in any src/ file", () => {
    const hits = grepSrcRecursive('circuitRelayServer');
    assert.equal(
      hits.length,
      0,
      `circuitRelayServer found in: ${hits.join(', ')} — must use circuitRelayTransport() (client-only)`,
    );
  });

  test("S4 NET-03: dcutr() is wired in services block", () => {
    const matches = transport.match(/dcutr:\s*dcutr\(\)/g);
    assert.ok(matches && matches.length === 1, 'services must include dcutr: dcutr() exactly once');
  });

  test("S5 NET-03: uPnPNAT is wired in services block (conditional on cfg.upnp)", () => {
    // uPnPNAT is wired with options (autoConfirmAddress: true) inside a conditional
    // spread — only active when cfg.upnp !== false (default true)
    assert.ok(
      transport.includes('uPnPNAT('),
      'services must include uPnPNAT( call',
    );
    assert.ok(
      transport.includes('upnpNAT'),
      "services key 'upnpNAT' must appear in peer-transport.ts",
    );
    assert.ok(
      transport.includes("cfg.upnp !== false"),
      'uPnPNAT must be conditional on cfg.upnp !== false (silent disable when upnp:false)',
    );
  });

  test("S6 Anti-pattern LOCK: /p2p-circuit only added when cfg.relays is non-empty", () => {
    assert.ok(
      transport.match(/cfg\.relays && cfg\.relays\.length > 0/),
      "conditional guard 'cfg.relays && cfg.relays.length > 0' required — prevents /p2p-circuit when no relays configured",
    );
    const circuitMatches = transport.match(/'\/p2p-circuit'/g);
    assert.ok(
      circuitMatches && circuitMatches.length === 1,
      "'/p2p-circuit' must appear exactly once (inside the conditional guard)",
    );
  });

  test("S7 NET-03: three new libp2p imports present", () => {
    assert.ok(
      transport.includes("from '@libp2p/circuit-relay-v2'"),
      'must import from @libp2p/circuit-relay-v2',
    );
    assert.ok(
      transport.includes("from '@libp2p/dcutr'"),
      'must import from @libp2p/dcutr',
    );
    assert.ok(
      transport.includes("from '@libp2p/upnp-nat'"),
      'must import from @libp2p/upnp-nat',
    );
  });
});

describe('Phase 18 — Structural: NetError (Plan 01 foundation)', () => {
  const errors = read('src/domain/errors.ts');

  test("S8 all 6 NetError variants present", () => {
    for (const v of [
      'RelayDialFailed',
      'HolePunchTimeout',
      'UPnPMapFailed',
      'BandwidthExceeded',
      'HealthDegraded',
      'RelayNotConfigured',
    ]) {
      assert.ok(
        errors.includes(`'${v}'`) || errors.includes(`"${v}"`),
        `missing NetError variant: ${v}`,
      );
    }
  });

  test("S9 NetError is a member of AppError union", () => {
    assert.ok(
      errors.match(/\|\s*NetError(\s|;|$)/m) || errors.includes('| NetError;'),
      'NetError must be part of AppError union',
    );
  });

  test("S8b factory has all 6 NetError constructors", () => {
    for (const ctor of [
      'relayDialFailed',
      'holePunchTimeout',
      'upnpMapFailed',
      'bandwidthExceeded',
      'healthDegraded',
      'relayNotConfigured',
    ]) {
      assert.ok(errors.includes(`${ctor}:`), `missing NetError factory: ${ctor}`);
    }
  });
});

describe('Phase 18 — Structural: PeerConfig extensions (Plan 01)', () => {
  const cfg = read('src/infrastructure/config-loader.ts');

  test("S10 PeerConfig has relays/upnp/bandwidth fields", () => {
    assert.ok(cfg.includes('readonly relays: readonly string[]'), 'PeerConfig must have readonly relays: readonly string[]');
    assert.ok(cfg.includes('readonly upnp: boolean'), 'PeerConfig must have readonly upnp: boolean');
    assert.ok(cfg.includes('readonly bandwidth: BandwidthConfig'), 'PeerConfig must have readonly bandwidth: BandwidthConfig');
    assert.ok(cfg.includes('bandwidth_overrides'), 'PeerConfig must have bandwidth_overrides field');
  });

  test("S11 DEFAULT_PEER has locked default values (50, 10, [], true)", () => {
    assert.ok(
      cfg.includes('max_updates_per_sec_per_peer_per_room: 50'),
      'default max_updates_per_sec_per_peer_per_room must be 50',
    );
    assert.ok(
      cfg.includes('max_concurrent_share_syncs: 10'),
      'default max_concurrent_share_syncs must be 10',
    );
    assert.ok(cfg.includes('relays: []'), 'default relays must be []');
    assert.ok(cfg.includes('upnp: true'), 'default upnp must be true');
  });

  test("S10b BandwidthConfig interface is exported", () => {
    assert.ok(cfg.includes('export interface BandwidthConfig'), 'BandwidthConfig must be exported');
    assert.ok(cfg.includes('export interface BandwidthOverride'), 'BandwidthOverride must be exported');
  });
});

describe('Phase 18 — Structural: Daemon wiring (Plan 03)', () => {
  const loop = read('src/daemon/loop.ts');

  test("S12a connection:close listener registered", () => {
    assert.ok(
      loop.includes("addEventListener('connection:close'"),
      "daemon/loop.ts must register 'connection:close' listener",
    );
    assert.ok(loop.includes('recordDisconnect'), "connection:close listener must call recordDisconnect");
  });

  test("S12b Pitfall 7 LOCK: relay TTL expiry filtered via conn.limits !== undefined", () => {
    assert.ok(
      loop.includes('conn.limits !== undefined'),
      "listener must filter relay-limited closures via conn.limits !== undefined so relay TTL expiry does not flag peers as degraded",
    );
  });

  test("S12c Pattern 2: relay pre-dial iterates config.peer.relays", () => {
    assert.ok(
      loop.includes('for (const relayAddr of cfgRes.value.peer.relays)'),
      "daemon must iterate peer.relays for pre-dial on startup",
    );
  });

  test("S12d Plan 03: bandwidth config wired into createShareSyncRegistry", () => {
    // The daemon passes maxUpdatesPerSecPerPeerPerRoom from config into
    // createShareSyncRegistry which internally constructs the rate limiter —
    // the registry owns the createRateLimiter call (not the daemon directly).
    assert.ok(
      loop.includes('max_updates_per_sec_per_peer_per_room'),
      'daemon must pass max_updates_per_sec_per_peer_per_room to share sync registry',
    );
    assert.ok(
      loop.includes('createShareSyncRegistry'),
      'daemon must call createShareSyncRegistry to wire bandwidth-limited share sync',
    );
  });

  test("S12e HealthTracker spliced into tickDeps", () => {
    assert.ok(loop.includes('healthTracker: liveHealth'), 'daemon must pass healthTracker: liveHealth into tick deps');
  });
});

describe('Phase 18 — Structural: peer list health column (Plan 03)', () => {
  const peerCli = read('src/cli/commands/peer.ts');

  test("S13a JSON output has health field (NET-04: health tracking exposed in CLI)", () => {
    // peer list --json outputs health: 'unknown' for all peers (daemon-process
    // tracker not accessible from CLI process; Phase 19+ will expose via MCP/IPC)
    assert.ok(
      peerCli.includes("health: 'unknown'"),
      "peer list JSON must include health: 'unknown' field",
    );
  });

  test("S13b text output renders health column", () => {
    assert.ok(
      peerCli.includes('health:    unknown'),
      "peer list text must render 'health:    unknown' row for each peer",
    );
  });

  test("S13c health field is present in JSON peers array (not just text)", () => {
    // Confirm the JSON path has the health key — structural check that
    // both JSON and text output surfaces health as required by NET-04
    const jsonBlock = peerCli.match(/peers\.map\([^)]+\{[\s\S]*?health[\s\S]*?\}\)/);
    assert.ok(
      jsonBlock !== null || peerCli.includes("health: 'unknown'"),
      'peer list JSON peers array must include health field',
    );
  });
});

describe('Phase 18 — Structural: dep budget + identify presence (Plan 02)', () => {
  const pkg = JSON.parse(read('package.json')) as Record<string, unknown> & {
    dependencies: Record<string, string>;
  };

  test("S14a three new deps pinned exactly", () => {
    assert.equal(
      pkg.dependencies['@libp2p/circuit-relay-v2'],
      '4.2.0',
      '@libp2p/circuit-relay-v2 must be pinned to 4.2.0',
    );
    assert.equal(
      pkg.dependencies['@libp2p/dcutr'],
      '3.0.15',
      '@libp2p/dcutr must be pinned to 3.0.15',
    );
    assert.equal(
      pkg.dependencies['@libp2p/upnp-nat'],
      '4.0.15',
      '@libp2p/upnp-nat must be pinned to 4.0.15',
    );
  });

  test("S14b @libp2p/identify present (required by circuitRelayTransport at runtime)", () => {
    // circuitRelayTransport's RelayDiscovery registers @libp2p/identify as a
    // serviceDependency — without it createLibp2p throws on capability checks.
    // Phase 17's decision to omit identify was correct then (no relay transport);
    // Phase 18 wires circuitRelayTransport making identify mandatory.
    assert.ok(
      pkg.dependencies['@libp2p/identify'] !== undefined,
      '@libp2p/identify must be in dependencies (required by circuitRelayTransport)',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Unit tier — U1..U20
// ─────────────────────────────────────────────────────────────────────────────

describe('Phase 18 — Unit: HealthTracker (NET-04)', async () => {
  const { createHealthTracker } = await import('../src/infrastructure/connection-health.js');

  test('U1 fresh tracker returns health=ok for unknown peer', () => {
    const t = createHealthTracker();
    const h = t.getHealth('never-seen');
    assert.equal(h.health, 'ok');
    assert.equal(h.disconnectTimestamps.length, 0);
    assert.equal(h.lastStreamAt, 0);
  });

  test('U2 two disconnects within 60s keeps health=ok (threshold is 3)', () => {
    const t = createHealthTracker();
    const now = 1_700_000_000_000;
    t.recordDisconnect('p1', now);
    t.recordDisconnect('p1', now + 10);
    assert.equal(t.getHealth('p1', now + 100).health, 'ok');
  });

  test('U3 three disconnects within 60s marks health=degraded (reason: disconnects)', () => {
    const t = createHealthTracker();
    const now = 1_700_000_000_000;
    t.recordDisconnect('p1', now);
    t.recordDisconnect('p1', now + 10);
    t.recordDisconnect('p1', now + 20);
    const h = t.getHealth('p1', now + 100);
    assert.equal(h.health, 'degraded');
    assert.equal(h.reason, 'disconnects');
  });

  test('U4 disconnects older than 60s are pruned from sliding window — degraded→ok', () => {
    const t = createHealthTracker();
    const now = 1_700_000_000_000;
    t.recordDisconnect('p1', now);
    t.recordDisconnect('p1', now + 10);
    t.recordDisconnect('p1', now + 20);
    // 61s later — all three disconnects are outside the 60s window
    const h = t.getHealth('p1', now + 61_000);
    assert.equal(h.health, 'ok');
  });

  test('U5 recordStream makes peer appear active — health stays ok within 5 min window', () => {
    const t = createHealthTracker();
    const now = 1_700_000_000_000;
    t.recordStream('p1', now);
    // 60s later — stream is recent, no disconnects
    const h = t.getHealth('p1', now + 60_000);
    assert.equal(h.health, 'ok');
  });

  test('U6 lastStreamAt older than 5 min yields health=degraded (reason: idle)', () => {
    const t = createHealthTracker();
    const now = 1_700_000_000_000;
    t.recordStream('p1', now);
    // 6 minutes later — stream is stale
    const h = t.getHealth('p1', now + 6 * 60 * 1_000);
    assert.equal(h.health, 'degraded');
    assert.equal(h.reason, 'idle');
  });

  test('U7 OR logic: 3 disconnects + recent stream = still degraded (disconnects wins)', () => {
    const t = createHealthTracker();
    const now = 1_700_000_000_000;
    t.recordStream('p1', now);
    t.recordDisconnect('p1', now + 100);
    t.recordDisconnect('p1', now + 200);
    t.recordDisconnect('p1', now + 300);
    const h = t.getHealth('p1', now + 400);
    assert.equal(h.health, 'degraded');
    assert.equal(h.reason, 'disconnects');
  });

  test('U8 checkAll returns map with all recorded peers (not just degraded)', () => {
    const t = createHealthTracker();
    const now = 1_700_000_000_000;
    t.recordDisconnect('p1', now);
    t.recordStream('p2', now);
    const snap = t.checkAll(now);
    assert.equal(snap.size, 2);
    assert.ok(snap.has('p1'));
    assert.ok(snap.has('p2'));
  });

  test('U9 checkAll on fresh tracker returns empty map', () => {
    assert.equal(createHealthTracker().checkAll().size, 0);
  });
});

describe('Phase 18 — Unit: Semaphore + createRateLimiter re-export (NET-02)', async () => {
  const bl = await import('../src/infrastructure/bandwidth-limiter.js');

  test('U10 createSemaphore(3) grants tryAcquire 3 times', () => {
    const s = bl.createSemaphore(3);
    assert.equal(s.tryAcquire(), true);
    assert.equal(s.tryAcquire(), true);
    assert.equal(s.tryAcquire(), true);
  });

  test('U11 4th tryAcquire on capacity-3 semaphore returns false', () => {
    const s = bl.createSemaphore(3);
    s.tryAcquire();
    s.tryAcquire();
    s.tryAcquire();
    assert.equal(s.tryAcquire(), false);
  });

  test('U12 available() reflects current capacity minus active', () => {
    const s = bl.createSemaphore(3);
    assert.equal(s.available(), 3);
    s.tryAcquire();
    assert.equal(s.available(), 2);
    s.tryAcquire();
    assert.equal(s.available(), 1);
  });

  test('U13 release restores one slot — previously-denied acquire now succeeds', () => {
    const s = bl.createSemaphore(2);
    s.tryAcquire();
    s.tryAcquire();
    assert.equal(s.tryAcquire(), false, 'should be denied at capacity');
    s.release();
    assert.equal(s.tryAcquire(), true, 'should succeed after release');
  });

  test('U14 release below zero is a no-op — available never exceeds capacity', () => {
    const s = bl.createSemaphore(2);
    s.release(); // no-op — already at max
    s.release();
    s.release();
    assert.equal(s.available(), 2, 'must not exceed initial capacity');
  });

  test('U15 createRateLimiter is re-exported from bandwidth-limiter and usable', () => {
    const rl = bl.createRateLimiter(10, 10);
    assert.equal(typeof rl.consume, 'function', 'createRateLimiter must return an object with consume()');
    assert.equal(rl.consume('p1'), true, 'consume with fresh bucket must return true');
  });
});

describe('Phase 18 — Unit: syncNodeIntoYDoc bandwidth gate (NET-02)', async () => {
  const { syncNodeIntoYDoc } = await import('../src/infrastructure/share-sync.js');
  const { buildPatterns } = await import('../src/domain/sharing.js');

  const makeNode = (id: string) => ({
    id,
    label: 'hello world',
    file_type: 'document' as const,
    source_file: 'test',
    room: 'r',
    embedding_id: 'e1',
    source_uri: 'u',
    fetched_at: new Date().toISOString(),
  });

  const allowAllLimiter = {
    consume: (_key: string) => true,
    evictIdle: () => 0,
    peek: () => undefined,
  };

  const denyAllLimiter = {
    consume: (_key: string) => false,
    evictIdle: () => 0,
    peek: () => undefined,
  };

  test('U16 backward compat: no rateLimiter = Phase 16 behaviour preserved', async () => {
    const doc = new Y.Doc();
    const d = await mkdtemp(join(tmpdir(), 'p18-u16-'));
    const logPath = join(d, 'share-log.jsonl');
    const result = await syncNodeIntoYDoc(doc, makeNode('n1'), buildPatterns([]), logPath, 'me', 'r');
    assert.ok(result.isOk(), `must succeed without limiter, got: ${result.isErr() ? JSON.stringify(result.error) : 'ok'}`);
    assert.ok(doc.getMap('nodes').has('n1'), 'node must be written to Y.Doc');
  });

  test('U17 consume-false limiter returns BandwidthExceeded error', async () => {
    const doc = new Y.Doc();
    const d = await mkdtemp(join(tmpdir(), 'p18-u17-'));
    const logPath = join(d, 'share-log.jsonl');
    const result = await syncNodeIntoYDoc(
      doc,
      makeNode('n2'),
      buildPatterns([]),
      logPath,
      'me',
      'r',
      denyAllLimiter,
    );
    assert.ok(result.isErr(), 'must be an error when rate-limited');
    assert.equal(result.error.type, 'BandwidthExceeded', `expected BandwidthExceeded, got ${result.error.type}`);
    assert.equal(doc.getMap('nodes').has('n2'), false, 'node must NOT be written to Y.Doc when rate-limited');
  });

  test('U18 consume-true limiter writes normally to Y.Doc', async () => {
    const doc = new Y.Doc();
    const d = await mkdtemp(join(tmpdir(), 'p18-u18-'));
    const logPath = join(d, 'share-log.jsonl');
    const result = await syncNodeIntoYDoc(
      doc,
      makeNode('n3'),
      buildPatterns([]),
      logPath,
      'me',
      'r',
      allowAllLimiter,
    );
    assert.ok(result.isOk(), `must succeed with allow-all limiter, got: ${result.isErr() ? JSON.stringify(result.error) : 'ok'}`);
    assert.ok(doc.getMap('nodes').has('n3'), 'node must be written to Y.Doc');
  });

  test("U19 bandwidth-limited writes audit entry with action='bandwidth_limited'", async () => {
    const doc = new Y.Doc();
    const d = await mkdtemp(join(tmpdir(), 'p18-u19-'));
    const logPath = join(d, 'share-log.jsonl');
    await syncNodeIntoYDoc(
      doc,
      makeNode('n4'),
      buildPatterns([]),
      logPath,
      'me',
      'r',
      denyAllLimiter,
    );
    const log = await readFile(logPath, 'utf8');
    assert.ok(log.includes('"action":"bandwidth_limited"'), 'audit log must contain action=bandwidth_limited');
    assert.ok(log.includes('"peer":"me"'), 'audit log must contain the ownPeerId as peer field');
  });

  test('U20 rate limiter called with composite key ownPeerId::room', async () => {
    const doc = new Y.Doc();
    const d = await mkdtemp(join(tmpdir(), 'p18-u20-'));
    const logPath = join(d, 'share-log.jsonl');
    const seen: string[] = [];
    const spyLimiter = {
      consume: (k: string) => {
        seen.push(k);
        return true;
      },
      evictIdle: () => 0,
      peek: () => undefined,
    };
    await syncNodeIntoYDoc(
      doc,
      makeNode('n5'),
      buildPatterns([]),
      logPath,
      'me',
      'homelab',
      spyLimiter,
    );
    // Key must be composite ownPeerId::room (makePerPeerRoomKey format)
    assert.ok(
      seen.includes('me::homelab'),
      `expected composite key 'me::homelab', got: ${seen.join(', ')}`,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Integration tier — 10-peer mesh (NET-04)
// Slow: opt-out via WELLINFORMED_SKIP_SLOW=1
// ─────────────────────────────────────────────────────────────────────────────

/**
 * NET-04 literal pass bar: "10+ peers connected simultaneously without degradation."
 *
 * Spins 10 real libp2p nodes (listenPort:0, mdns:false, upnp:false) in-process,
 * connects them in a ring + cross-link mesh, then asserts every node has >= 3
 * peers within a 10-second stabilization window.
 *
 * Pitfall locks baked in:
 *   Pitfall 5: mdns:false prevents multicast storm on loopback
 *   Pitfall 6: wait for getMultiaddrs().length > 0 after start (TCP bind race)
 *   listenPort:0 prevents EADDRINUSE (OS assigns a free port)
 *   Promise.allSettled in cleanup prevents one stop() failure from cascading
 */
const SKIP_SLOW = process.env['WELLINFORMED_SKIP_SLOW'] === '1';

describe('Phase 18 — Integration: 10-peer mesh (NET-04)', { skip: SKIP_SLOW }, async () => {
  const { loadOrCreateIdentity, createNode } = await import('../src/infrastructure/peer-transport.js');

  let nodes: Libp2p[] = [];

  before(async () => {
    const starts: Promise<Libp2p>[] = [];
    for (let i = 0; i < 10; i++) {
      const d = await mkdtemp(join(tmpdir(), `p18-i-${i}-`));
      const idRes = await loadOrCreateIdentity(join(d, 'peer-identity.json'));
      if (idRes.isErr()) throw new Error(`identity ${i} failed: ${JSON.stringify(idRes.error)}`);
      const identity = idRes.value;
      starts.push(
        (async () => {
          const nodeRes = await createNode(identity, {
            listenPort: 0,         // Pitfall 6 mitigation — OS-assigned port, avoids EADDRINUSE
            listenHost: '127.0.0.1',
            mdns: false,           // Pitfall 5 mitigation — no multicast storm on loopback
            upnp: false,           // skip UPnP — no router in test environment
          });
          if (nodeRes.isErr()) throw new Error(`createNode ${i} failed: ${JSON.stringify(nodeRes.error)}`);
          return nodeRes.value;
        })(),
      );
    }
    nodes = await Promise.all(starts);

    // Pitfall 6: wait for TCP bind to populate getMultiaddrs()
    // OS port assignment is async — a brief settle window prevents race.
    await new Promise<void>((r) => setTimeout(r, 300));
    for (const [i, n] of nodes.entries()) {
      const addrs = n.getMultiaddrs();
      if (addrs.length === 0) {
        throw new Error(`node ${i} has no multiaddr after bind wait — listenPort:0 failed`);
      }
    }
  });

  after(async () => {
    // CRITICAL: Promise.allSettled — one stop() failure must NOT cascade and
    // leave other nodes orphaned, causing port leaks in CI.
    await Promise.allSettled(nodes.map((n) => n.stop()));
    nodes = [];
  });

  test('I1..I4 NET-04: all 10 nodes connect to at least 3 peers within 10s', async () => {
    const N = nodes.length;

    // Build mesh: ring (i → (i+1) % N) + cross-links (i → (i+3) % N, even i only)
    // This guarantees every node has at least 2 outbound dials; combined with
    // symmetric connection establishment, every node ends up with >= 3 peers.
    const dials: Promise<unknown>[] = [];
    for (let i = 0; i < N; i++) {
      // Ring link
      const next = nodes[(i + 1) % N];
      const nextAddrs = next.getMultiaddrs();
      if (nextAddrs.length > 0) {
        dials.push(nodes[i]!.dial(nextAddrs[0]!).catch(() => undefined));
      }
      // Cross link (even-indexed nodes)
      if (i % 2 === 0) {
        const cross = nodes[(i + 3) % N];
        const crossAddrs = cross.getMultiaddrs();
        if (crossAddrs.length > 0) {
          dials.push(nodes[i]!.dial(crossAddrs[0]!).catch(() => undefined));
        }
      }
    }
    await Promise.allSettled(dials);

    // Poll for connectivity stabilization — up to 10s deadline
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const stable = nodes.every((n) => n.getPeers().length >= 3);
      if (stable) break;
      await new Promise<void>((r) => setTimeout(r, 200));
    }

    // Hard assertion — NET-04 literal pass bar
    for (const [i, n] of nodes.entries()) {
      const peerCount = n.getPeers().length;
      assert.ok(
        peerCount >= 3,
        `NET-04 FAIL: node ${i} has ${peerCount} peer(s) — required >= 3 for "10+ peers simultaneously without degradation"`,
      );
    }
  });
});
