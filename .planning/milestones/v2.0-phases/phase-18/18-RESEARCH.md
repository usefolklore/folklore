# Phase 18: Production Networking - Research

**Researched:** 2026-04-12
**Domain:** libp2p NAT traversal, bandwidth management, connection health, multi-peer testing
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**NAT Traversal Stack**
- 3 new libp2p modules: `@libp2p/circuit-relay-v2@4.2.0` + `@libp2p/dcutr@3.0.15` + `@libp2p/upnp-nat@4.0.15` — industry-standard combo
- Circuit-relay-v2: client-only in Phase 18 — every peer dials via relays but does not serve as one. Serving-as-relay is a v3 concern
- Bootstrap relays: configurable via `config.yaml peer.relays: []`, empty by default — no hardcoded IPFS bootstrap nodes
- UPnP: on by default, fails silently — if unavailable log a stderr warning once and continue

**Bandwidth Management**
- Throttling at the application layer inside `share-sync.ts` and `search-sync.ts`
- Layered limits:
  - `peer.bandwidth.max_updates_per_sec_per_peer_per_room` (default `50`) — per-peer-per-room token bucket for outbound share updates
  - `peer.bandwidth.max_concurrent_share_syncs` (default `10`) — per-tick semaphore on the daemon
- Independent budgets between share and search
- Defaults in `config.yaml peer.bandwidth`; per-peer override via optional `peer.bandwidth_overrides: { <peerId>: {...} }`

**Connection Health & Auto-Reconnect**
- Passive monitoring — listen to libp2p `connection:close` events. Phase 15's `reconnectRetries: Infinity` already handles reconnection; Phase 18 adds observability
- Degraded heuristic: 3+ unexpected disconnects within 60s OR no successful stream in 5 minutes
- Action on degraded: surfaced in `peer list` and `peer list --json`; logged to `share-log.jsonl` with `action: 'peer_degraded'`; no auto-removal
- Health state is in-memory only — resets on daemon restart

**Multi-Peer Testing (NET-04)**
- In-process 10-peer integration test — spin up 10 short-lived libp2p nodes on OS-assigned ports
- Runtime budget: 30-45 seconds. Tagged as "slow"; skippable via `AKASHIK_SKIP_SLOW=1`
- Shared `afterAll` cleanup stops every node, individual failures cannot cascade
- Pass bar: hard = all 10 nodes connected to at least 3 others

### Claude's Discretion
- Exact token-bucket refill timing within the bandwidth limiter
- Specific log format inside `share-log.jsonl` for `peer_degraded` / `bandwidth_limited` action types
- Whether the 10-peer test uses a complete mesh or a sparse ring+crossover

### Deferred Ideas (OUT OF SCOPE)
- Serving as a relay for others — v3
- Private Information Retrieval (PIR) — v3+
- Per-peer ACL — v3
- Multi-hop routing — v3
- Reputation / trust graph — v3
- AutoNAT — deferred; dcutr covers the hole-punching half without AutoNAT overhead
- Active heartbeat protocol — passive monitoring via libp2p events is sufficient
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| NET-01 | js-libp2p transport with multiplexed streams | Yamux already wired (Phase 15); circuitRelayTransport adds relay transport alongside tcp(); multiplexing is automatic via yamux |
| NET-02 | Bandwidth management — configurable sync rate, no flooding | Token bucket from search-sync.ts is directly reusable; semaphore primitive needed for concurrent syncs |
| NET-03 | NAT traversal via libp2p relay + hole punching | circuitRelayTransport() in transports + dcutr() in services + uPnPNAT() in services |
| NET-04 | Connection health monitoring with auto-reconnect | connection:close event detail is `Connection` object with `.remotePeer.toString()`, `.direct`, `.limits`; reconnect is already handled by Phase 15's `reconnectRetries: Infinity` |
</phase_requirements>

---

## Summary

Phase 18 closes the last gap between a LAN-only P2P demo and a production-grade deployment. Three libp2p modules slot into the existing `createNode` function: `circuitRelayTransport()` goes in `transports[]`, `dcutr()` and `uPnPNAT()` go in `services{}`. All three have been verified at their exact pinned versions as the npm latest releases as of 2026-04-12. No peer dependencies are missing — none of the three require `@libp2p/identify` (dcutr's docs show identify in examples but the package itself has no peerDeps). `@libp2p/identify` is available at 4.1.0 if desired but the Phase 17 decision to omit it stands and is safe.

The bandwidth layer reuses the `createRateLimiter` pattern from `search-sync.ts` verbatim for the per-peer-per-room token bucket. The concurrent sync semaphore is a new primitive (a simple counter + queue), but small. Connection health is a new `src/infrastructure/connection-health.ts` module: a `Map<peerId, { disconnects: number[], lastStreamAt: number }>` that the daemon's `connection:close` listener populates. The full `Connection` object is the event detail — `evt.detail.remotePeer.toString()` gives the peer ID, `evt.detail.direct` distinguishes relay vs direct, `evt.detail.limits` is set on relay-limited connections. There is no separate `graceful` vs `error` field on the event; graceful detection requires checking whether the peer is still present in `node.getPeers()` immediately after the event fires.

The 10-peer integration test is the highest-risk deliverable. Key pitfalls: (1) all 10 nodes must use `listenPort: 0` to get OS-assigned ports, avoiding EADDRINUSE; (2) cleanup in `afterAll` must call `node.stop()` for each node wrapped in individual try/catch so one failure cannot orphan others; (3) the test must await actual connection establishment, not just dial — use `node.getPeers().length` polling with a timeout rather than trusting `node.dial()` return; (4) 10 × 10 = 100 potential TCP connections in one process is within Node 20's default limits but mDNS multicast should be disabled to avoid flooding loopback.

**Primary recommendation:** Wire `circuitRelayTransport()` + `dcutr()` + `uPnPNAT()` into `createNode`; reuse `createRateLimiter` for share bandwidth; build `connection-health.ts` as a thin in-memory tracker; write the 10-peer test with OS-assigned ports and mDNS disabled.

---

## Standard Stack

### Core (all versions confirmed via `npm view` on 2026-04-12)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@libp2p/circuit-relay-v2` | `4.2.0` | Relay transport — client-only dial via relay servers | Official libp2p relay v2 implementation |
| `@libp2p/dcutr` | `3.0.15` | Direct Connection Upgrade through Relay — hole punching | Official libp2p hole punching; auto-upgrades relay→direct |
| `@libp2p/upnp-nat` | `4.0.15` | UPnP port mapping — makes node reachable from internet | Official libp2p UPnP service |

### Supporting (already installed — no new deps)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `libp2p` | `^3.2.0` | Core — `createLibp2p`, connection events | Always |
| `@libp2p/tcp` | `^11.0.15` | TCP transport | Always alongside circuit relay |
| `@libp2p/yamux` | `^8.0.1` | Stream multiplexer | Always — enables NET-01 multiplexed streams |
| `neverthrow` | `^8.2.0` | Result monad | All fallible ops |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `circuitRelayTransport()` client-only | `circuitRelayServer()` | Server requires capacity planning + DoS mitigation; locked to client-only |
| App-layer token bucket | libp2p connection limits | libp2p limits are coarse and internal; app-layer gives semantic per-room control |
| Passive `connection:close` | Active heartbeat / AutoNAT | AutoNAT is heavyweight; passive monitoring + existing reconnect retries is sufficient |

**Installation:**
```bash
npm install @libp2p/circuit-relay-v2@4.2.0 @libp2p/dcutr@3.0.15 @libp2p/upnp-nat@4.0.15
```

---

## Architecture Patterns

### Recommended Project Structure (new files only)

```
src/
├── infrastructure/
│   ├── peer-transport.ts        # MODIFIED — add relay/dcutr/upnp to createNode
│   ├── connection-health.ts     # NEW — in-memory degraded-peer tracker
│   ├── bandwidth-limiter.ts     # NEW — shared token-bucket + semaphore primitives
│   ├── share-sync.ts            # MODIFIED — hook bandwidth-limiter into outbound path
│   ├── config-loader.ts         # MODIFIED — extend PeerConfig with relays/upnp/bandwidth
│   └── peer-store.ts            # UNCHANGED — PeerRecord schema stays at version 1
├── domain/
│   └── errors.ts                # MODIFIED — add NetError union + AppError extension
├── cli/commands/
│   └── peer.ts                  # MODIFIED — add health column to peer list
└── daemon/
    └── loop.ts                  # MODIFIED — register connection:close listener
tests/
└── phase18.production-net.test.ts  # NEW — structural + 10-peer integration
```

### Pattern 1: circuitRelayTransport wiring in createNode

**What:** Add `circuitRelayTransport()` to the `transports` array and conditionally append `/p2p-circuit` multiaddr to `addresses.listen` when `config.peer.relays` is non-empty.

**When to use:** Always for Phase 18 nodes. The transport is a no-op if no relay is configured.

```typescript
// Source: @libp2p/circuit-relay-v2@4.2.0 dist/src/index.d.ts (verified)
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
import { dcutr } from '@libp2p/dcutr';
import { uPnPNAT } from '@libp2p/upnp-nat';

const node = await createLibp2p({
  privateKey: identity.privateKey,
  addresses: {
    listen: [
      `/ip4/${host}/tcp/${cfg.listenPort}`,
      // Only append relay listen when relays are configured.
      // The /p2p-circuit suffix is a sentinel that tells the relay transport
      // to make a reservation on any connected relay peer.
      ...(cfg.relays && cfg.relays.length > 0 ? ['/p2p-circuit'] : []),
    ],
  },
  transports: [tcp(), circuitRelayTransport()],  // relay alongside tcp
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  peerDiscovery,
  services: {
    ...(dhtOn ? { dht: kadDHT({ clientMode: true, protocol: '/akashik/kad/1.0.0' }) } : {}),
    dcutr: dcutr(),       // auto-activates on relay connections; no extra config
    upnpNAT: uPnPNAT(),   // silent failure if router unavailable (verified in source)
  },
  connectionManager: {
    reconnectRetries: Infinity,
    reconnectRetryInterval: 2000,
    reconnectBackoffFactor: 2,
  },
});
```

**Key findings from source inspection:**
- `circuitRelayTransport()` takes no required arguments — `circuitRelayTransport()` (no args) is valid
- `dcutr()` takes no required arguments — just `dcutr()` works; it auto-activates on limited connections
- `uPnPNAT()` wraps all errors in `this.log.error(...)` — it does NOT throw from `start()`. The `mapIpAddresses` method catches internally. Safe to wire unconditionally.
- Neither `dcutr` nor `circuit-relay-v2` nor `upnp-nat` declare `@libp2p/identify` as a peer dependency — the dcutr docs show identify in their example but it is optional. Phase 17's decision to omit identify stands.

### Pattern 2: Relay dial + pre-dial on daemon startup

**What:** When `config.peer.relays` is non-empty, dial each relay multiaddr after node start so the circuit relay transport can make a reservation. This is separate from the `/p2p-circuit` listen suffix.

```typescript
// After node.start() in createNode or daemon startLoop:
if (cfg.relays) {
  for (const relayAddr of cfg.relays) {
    await node.dial(multiaddr(relayAddr)).catch((e) => {
      process.stderr.write(`akashik: relay dial failed for ${relayAddr}: ${(e as Error).message}\n`);
    });
  }
}
```

**Why:** The relay transport needs an active connection to a relay peer before it can make a reservation. Without dialing the relay first, `/p2p-circuit` in addresses.listen is inert.

### Pattern 3: connection-health tracker (in-memory)

**What:** A thin module tracking disconnect counts and last-stream timestamps per peer.

```typescript
// src/infrastructure/connection-health.ts
export interface PeerHealth {
  readonly disconnectTimestamps: readonly number[];  // epoch ms, sliding 60s window
  readonly lastStreamAt: number;                     // epoch ms
  readonly health: 'ok' | 'degraded';
}

export interface HealthTracker {
  recordDisconnect(peerId: string, nowMs?: number): void;
  recordStream(peerId: string, nowMs?: number): void;
  getHealth(peerId: string): PeerHealth;
  checkAll(nowMs?: number): ReadonlyMap<string, PeerHealth>;
}
```

**Key design points:**
- Map is bounded by known peer count — no idle eviction needed (unlike search-sync rate limiter)
- Degraded = `disconnectTimestamps.filter(t => nowMs - t < 60_000).length >= 3` OR `nowMs - lastStreamAt > 5 * 60 * 1000`
- `lastStreamAt` must be updated from `openShareStream` and `openSearchStream` success paths
- `connection:close` event: `node.addEventListener('connection:close', (evt: CustomEvent<Connection>) => { tracker.recordDisconnect(evt.detail.remotePeer.toString()); })`

### Pattern 4: connection:close event — exact shape

**What:** The `connection:close` event fires for BOTH graceful and error disconnects. The event detail is the full `Connection` object.

```typescript
// Source: @libp2p/interface/dist/src/connection.d.ts + dist/src/index.d.ts (verified)
node.addEventListener('connection:close', (evt: CustomEvent<Connection>) => {
  const conn = evt.detail;
  const peerId = conn.remotePeer.toString();
  const isRelayed = !conn.direct;            // true = connection was via relay
  const hasLimits = conn.limits !== undefined; // relay imposed data/time limits
  const connId = conn.id;                    // unique string per connection
  // conn.status will be 'closed' at this point
  // No separate 'graceful' vs 'error' field exists on the event.
  // Grace detection: check if node.getPeers() still contains this peerId after event.
});
```

**Important:** `peer:disconnect` emits `CustomEvent<PeerId>` (not Connection) — fires only when ALL connections to that peer close. `connection:close` fires per-connection. Use `connection:close` for health tracking (more granular); use `peer:disconnect` for "truly gone" detection.

### Pattern 5: bandwidth-limiter.ts — shared primitives

**What:** Extract the token bucket from `search-sync.ts` (`createRateLimiter`) into a shared module. Add a new counting semaphore for `max_concurrent_share_syncs`.

```typescript
// src/infrastructure/bandwidth-limiter.ts
// Re-export createRateLimiter (moved from search-sync.ts or re-implemented identically):
export { createRateLimiter, type RateLimiter } from './search-sync.js';

// New: counting semaphore for concurrent sync limit
export interface Semaphore {
  tryAcquire(): boolean;
  release(): void;
  available(): number;
}

export const createSemaphore = (maxConcurrent: number): Semaphore => {
  let active = 0;
  return {
    tryAcquire: () => { if (active >= maxConcurrent) return false; active++; return true; },
    release: () => { if (active > 0) active--; },
    available: () => maxConcurrent - active,
  };
};
```

**Note:** The CONTEXT.md decision says "moved from search-sync duplication where applicable." The cleanest path is to define both primitives in `bandwidth-limiter.ts` and have `search-sync.ts` import from there (rather than duplicating). However, since search-sync.ts exports `createRateLimiter` for tests, care must be taken not to break the import path used in tests.

### Pattern 6: 10-peer integration test structure

**What:** Spin up 10 libp2p nodes, connect them, verify mesh connectivity.

```typescript
// tests/phase18.production-net.test.ts
import { describe, it, before, after } from 'node:test';

const SKIP = process.env.AKASHIK_SKIP_SLOW === '1';

describe('Phase 18: NET-04 — 10-peer mesh', { skip: SKIP, timeout: 50_000 }, () => {
  const nodes: Libp2p[] = [];

  before(async () => {
    // Spin up 10 nodes. listenPort: 0 = OS-assigned, no EADDRINUSE.
    // mDNS MUST be disabled — multicast on loopback floods the test.
    for (let i = 0; i < 10; i++) {
      const identity = await loadOrCreateIdentity(/* tmp path */);
      const node = await createNode(identity, { listenPort: 0, mdns: false });
      nodes.push(node.value);
    }
  });

  after(async () => {
    // CRITICAL: wrap each stop in try/catch so one failure cannot cascade
    await Promise.allSettled(nodes.map(n => n.stop()));
  });

  it('NET-04: all 10 nodes connect to at least 3 others', async () => {
    // Connect in a ring first (guarantees no island)
    for (let i = 0; i < nodes.length; i++) {
      const next = nodes[(i + 1) % nodes.length];
      const addr = next.getMultiaddrs()[0];
      await nodes[i].dial(addr);
    }
    // Add cross-links for resilience (every 3rd to every 6th)
    // ... cross-link dials ...

    // Poll until connectivity stabilizes (up to 10s)
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      const allGood = nodes.every(n => n.getPeers().length >= 3);
      if (allGood) break;
      await new Promise(r => setTimeout(r, 200));
    }

    for (const n of nodes) {
      assert.ok(n.getPeers().length >= 3, `peer only has ${n.getPeers().length} connections`);
    }
  });
});
```

### Anti-Patterns to Avoid

- **Do NOT add `/p2p-circuit` to listen addresses when `config.peer.relays` is empty** — this causes the transport to search for ANY peer acting as a relay, which creates noisy connection attempts. Only enable when user has provided explicit relay multiaddrs.
- **Do NOT use `circuitRelayServer()` in Phase 18** — that is the serving path; Phase 18 is client-only. The import name is `circuitRelayTransport()` (in `transports[]`), NOT `circuitRelayServer()` (which goes in `services{}`).
- **Do NOT disable `reconnectRetries: Infinity` for relay connections** — relay connections use the same connection manager; exponential backoff applies normally.
- **Do NOT call `dcutr()` only on relay connections** — it registers as a service and auto-activates on limited connections. Wire it unconditionally.
- **Do NOT mDNS in the 10-peer test** — multicast on loopback floods all 10 nodes simultaneously; disable with `mdns: false` in `TransportConfig`.
- **Do NOT use a fixed port in the 10-peer test** — use `listenPort: 0` on every node to let the OS assign ephemeral ports.
- **Do NOT trust `node.dial()` return for connectivity** — dial returning means the connection was opened, but `node.getPeers()` may not yet reflect it. Poll with timeout.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Relay traversal | Custom relay protocol | `circuitRelayTransport()` | Relay v2 spec, cryptographic reservation, time/data limits |
| Hole punching | Custom STUN/ICE | `dcutr()` | Synchronized dial timing via relay, standard libp2p protocol `/libp2p/dcutr` |
| UPnP port mapping | Custom SSDP M-SEARCH | `uPnPNAT()` | Handles both IPv4 mapping and IPv6 pinholes, auto-refresh, silent failure |
| Token bucket rate limiter | Custom timer-based | `createRateLimiter` from search-sync.ts | Already proven in Phase 17; exact same token bucket shape needed |
| Semaphore | Promise-based queue | Simple counter (see Pattern 5) | The bounded concurrency need is trivial; a promise queue adds unnecessary complexity |

**Key insight:** The three new libp2p modules slot in as services/transports with zero custom protocol code. The only truly new code is the health tracker Map and the semaphore counter.

---

## Common Pitfalls

### Pitfall 1: `circuitRelayServer` vs `circuitRelayTransport` confusion

**What goes wrong:** Developer imports `circuitRelayServer` and puts it in `services{}`, expecting to be a relay client. But `circuitRelayServer` makes the node a relay SERVER (hop protocol). The client transport is `circuitRelayTransport` and goes in `transports[]`.

**Why it happens:** Both are exported from the same package. The JSDoc in the package distinguishes them (server example uses `services`, transport example uses `transports`).

**How to avoid:** Import `circuitRelayTransport` from `@libp2p/circuit-relay-v2`. Put it in `transports: [tcp(), circuitRelayTransport()]`. Never put it in `services`.

**Warning signs:** Node starts accepting HOP protocol streams — check if unexpected relay traffic appears.

### Pitfall 2: UPnP requires non-loopback listen address

**What goes wrong:** `uPnPNAT()` wired but listen address is `127.0.0.1` (the default in `peer.listen_host`). UPnP cannot map a loopback address to an external port — the port mapper silently does nothing.

**Why it happens:** The official docs state "Your libp2p node must be listening on a non-loopback IPv4 address." The daemon currently uses `listenHost: '127.0.0.1'` by default.

**How to avoid:** UPnP is only functional when the user sets `listen_host: 0.0.0.0` in config.yaml. The `uPnPNAT()` service should always be wired (it's a no-op on loopback), but the log should note that UPnP requires `listen_host: 0.0.0.0`. Do NOT change the default listen_host — that is a security decision (CONTEXT.md: "localhost only so ephemeral CLI commands do not expose a libp2p endpoint").

**Warning signs:** UPnP wired but no external address change after daemon starts. Expected behavior on loopback — not a bug.

### Pitfall 3: `connection:close` fires for graceful AND error disconnects — no discriminator field

**What goes wrong:** Health tracker counts graceful shutdowns (daemon SIGTERM, `node.stop()`) as unexpected disconnects. A peer that does a clean shutdown triggers the "3 disconnects in 60s" degraded heuristic.

**Why it happens:** The `Connection` interface has no `error` or `reason` field. The `status` is `'closed'` in both cases by the time the event fires.

**How to avoid:** Use a two-step heuristic: (1) check if `node.getPeers()` still contains the peer ID immediately after the event (within the same microtask); if NOT present, the peer fully disconnected. (2) Only count as "unexpected" if the peer had previously been `keep-alive`-tagged. Peers tagged via `dialAndTag` have the `keep-alive-akashik` tag — their disconnects are unexpected. Peers without the tag are ephemeral connections that can close normally.

**Warning signs:** `peer list` shows all peers as `degraded` after any daemon restart.

### Pitfall 4: dcutr requires relay connection to be already established

**What goes wrong:** `dcutr()` is wired but hole punching never triggers because the nodes never connect via relay first.

**Why it happens:** DCUtR works by synchronizing direct dial attempts over an existing relay connection. Without a relay connection (`/p2p-circuit` address established), DCUtR has nothing to upgrade.

**How to avoid:** Relay dial must succeed before DCUtR activates. In tests and in the daemon, dial the relay multiaddr explicitly after node start. In the 10-peer test (no relay infrastructure), DCUtR will be wired but dormant — that is correct behavior.

**Warning signs:** `direct` field on all connections is `false` even after extended connection time, and relay multiaddrs were never configured.

### Pitfall 5: 10-peer test — mDNS multicast storm on loopback

**What goes wrong:** All 10 test nodes with mDNS enabled simultaneously send multicast discovery packets on the loopback interface. Each node receives 9 peer:discovery events. Each calls `node.dial()` on discovery. This creates up to 90 concurrent dial attempts, saturating Node's libuv thread pool, causing test timeouts.

**Why it happens:** mDNS uses UDP multicast. On loopback, all 10 nodes see each other's multicast packets simultaneously.

**How to avoid:** Set `mdns: false` in `TransportConfig` for all 10 test nodes. Use explicit `node.dial(targetAddr)` to build the mesh manually.

**Warning signs:** Test consistently times out at ~25-30s even with 50s timeout. Check if mDNS is enabled.

### Pitfall 6: `listenPort: 0` but nodes start before TCP bind completes

**What goes wrong:** After `node.start()`, `node.getMultiaddrs()` may return an empty array for a brief moment while TCP binds asynchronously. A dial to address `[]` throws immediately.

**Why it happens:** TCP listen is async. `createNode` calls `node.start()` and returns, but the OS-assigned port may not be reflected in `getMultiaddrs()` for a few milliseconds.

**How to avoid:** After `await node.start()`, assert `node.getMultiaddrs().length > 0` before returning. If empty, poll once with a short delay. In the 10-peer test, after spinning up all nodes, add a brief stabilization wait (`await new Promise(r => setTimeout(r, 100))`) before starting dial phase.

**Warning signs:** `TypeError: Cannot read properties of undefined (reading 'toString')` when calling `node.getMultiaddrs()[0].toString()`.

### Pitfall 7: reconnectRetries: Infinity with relay connections — relay has data/time limits

**What goes wrong:** A relay connection has `ConnectionLimits` set by the relay server (default: 2 minutes duration, 128KB data). When limits are exceeded, the relay closes the stream. `reconnectRetries: Infinity` will retry, but if it reconnects via relay again, the new connection will also have limits. This is not a bug — it is expected behavior. However, the health tracker must not flag these limit-expired disconnects as "degraded" if the peer immediately reconnects.

**Why it happens:** `conn.limits` is set on relay connections. When `connection:close` fires for a limit-expired relay connection, `conn.limits` is not null/undefined. This can be used to distinguish limit expiry from unexpected closure.

**How to avoid:** In the health tracker, check `evt.detail.limits !== undefined` — if limits are set, the close was expected (relay TTL) and should not count toward the degraded heuristic.

**Warning signs:** Peers configured with relays show as permanently degraded every 2 minutes.

---

## Code Examples

### Exact import and wire pattern for createNode

```typescript
// Source: @libp2p/circuit-relay-v2@4.2.0 dist/src/index.d.ts (verified 2026-04-12)
import { circuitRelayTransport } from '@libp2p/circuit-relay-v2';
// Source: @libp2p/dcutr@3.0.15 dist/src/index.d.ts (verified 2026-04-12)
import { dcutr } from '@libp2p/dcutr';
// Source: @libp2p/upnp-nat@4.0.15 dist/src/index.d.ts (verified 2026-04-12)
import { uPnPNAT } from '@libp2p/upnp-nat';

// In createNode, services block:
const services: Record<string, unknown> = {
  ...(dhtOn ? { dht: kadDHT({ clientMode: true, protocol: '/akashik/kad/1.0.0' }) } : {}),
  dcutr: dcutr(),
  ...(cfg.upnp !== false ? { upnpNAT: uPnPNAT() } : {}),
};

// transports:
transports: [tcp(), circuitRelayTransport()],

// addresses.listen — conditional /p2p-circuit:
const listenAddrs = [`/ip4/${host}/tcp/${cfg.listenPort}`];
if (cfg.relays && cfg.relays.length > 0) {
  listenAddrs.push('/p2p-circuit');
}
```

### connection:close health listener registration (in daemon/loop.ts)

```typescript
// Source: @libp2p/interface/dist/src/index.d.ts — Libp2pEvents type (verified 2026-04-12)
// connection:close: CustomEvent<Connection>
// Connection.remotePeer: PeerId
// Connection.direct: boolean
// Connection.limits?: ConnectionLimits  — set on relay connections
import type { Connection } from '@libp2p/interface';

liveNode.addEventListener('connection:close', (evt: CustomEvent<Connection>) => {
  const conn = evt.detail;
  const peerId = conn.remotePeer.toString();
  const isRelayLimited = conn.limits !== undefined;
  // Don't count relay TTL expiry as unexpected disconnect (Pitfall 7)
  if (!isRelayLimited) {
    healthTracker.recordDisconnect(peerId);
  }
  void appendShareLog(logPath, {
    timestamp: new Date().toISOString(),
    peer: peerId,
    action: 'peer_disconnect',
    relayed: !conn.direct,
    limitExpired: isRelayLimited,
  });
});
```

### Extended PeerConfig (config-loader.ts additions)

```typescript
export interface BandwidthConfig {
  readonly max_updates_per_sec_per_peer_per_room: number;  // default 50
  readonly max_concurrent_share_syncs: number;              // default 10
}

export interface BandwidthOverride {
  readonly max_updates_per_sec_per_peer_per_room?: number;
  readonly max_concurrent_share_syncs?: number;
}

// Added to PeerConfig:
readonly relays: readonly string[];   // default []
readonly upnp: boolean;               // default true
readonly bandwidth: BandwidthConfig;
readonly bandwidth_overrides?: Readonly<Record<string, BandwidthOverride>>;
```

### NetError union for domain/errors.ts

```typescript
export type NetError =
  | { readonly type: 'RelayDialFailed';     readonly addr: string; readonly message: string }
  | { readonly type: 'HolePunchTimeout';    readonly peer: string; readonly elapsedMs: number }
  | { readonly type: 'UPnPMapFailed';       readonly message: string }
  | { readonly type: 'BandwidthExceeded';   readonly peer: string; readonly room: string }
  | { readonly type: 'HealthDegraded';      readonly peer: string; readonly reason: 'disconnects' | 'idle' }
  | { readonly type: 'RelayNotConfigured' };

// Add to AppError union:
export type AppError = GraphError | VectorError | EmbeddingError | PeerError | ScanError
  | ShareError | SearchError | CodebaseError | NetError;
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Circuit Relay v1 | Circuit Relay v2 (`/libp2p/circuit/relay/0.2.0/hop`) | libp2p 0.40+ | v2 has data/time limits, reservation protocol, DoS mitigation |
| STUN/ICE for hole punching | DCUtR (`/libp2p/dcutr`) | libp2p 0.36+ | Simpler, libp2p-native, relay-synchronized timing |
| AutoNAT for external address | UPnP + DCUtR combined | libp2p 0.42+ | UPnP opens firewall, DCUtR upgrades relay→direct |
| `reconnectRetries: number` | `reconnectRetries: Infinity` + exponential backoff | Phase 15 | Already implemented — no change needed |

**Deprecated/outdated:**
- `circuitRelayServer()` wired in Phase 18: deferred to v3 per CONTEXT.md
- `@libp2p/identify` in services: not available transitively from `libp2p@3.2.0`; dcutr and circuit-relay-v2 do NOT require it (verified via peerDependencies inspection)

---

## Open Questions

1. **Does `circuitRelayTransport()` auto-discover relay peers via DHT or random walk?**
   - What we know: The transport has a `RandomWalk` component dependency in `CircuitRelayTransportComponents` and a `RelayDiscovery` class that uses `randomWalk` to find relays
   - What's unclear: Whether this auto-discovery fires even without explicit relay multiaddrs in config, and whether it causes unexpected network traffic when DHT is off
   - Recommendation: Wire `circuitRelayTransport()` unconditionally but only add `/p2p-circuit` to `addresses.listen` when `cfg.relays.length > 0`. The transport's auto-discovery is independent of the listen address.

2. **Exact behavior of `uPnPNAT()` when `listenHost` is `127.0.0.1`**
   - What we know: Source confirms errors are logged via `this.log.error(...)`, NOT thrown. The `mapIpAddresses` call is wrapped in try/catch internally. The service does NOT crash `createLibp2p`.
   - What's unclear: Whether the SSDP M-SEARCH still goes out on a loopback-bound node (wasted UDP traffic)
   - Recommendation: Wire unconditionally. The silent failure behavior is confirmed. Add a one-time stderr warning if `listenHost === '127.0.0.1'` noting that UPnP requires `listen_host: 0.0.0.0` to function.

3. **Relay connection data limit (128KB default) impact on Y.js sync**
   - What we know: `DEFAULT_DATA_LIMIT = BigInt(1 << 17)` = 128KB per relay connection. A full Y.Doc sync (sync step 1 + 2) for a large room could approach this limit.
   - What's unclear: Whether the Phase 16 Y.Doc sync protocol can exceed 128KB on rooms with thousands of nodes
   - Recommendation: The data limit only applies to relay connections. Once DCUtR upgrades the connection to direct, limits are removed. The health tracker's Pitfall 7 mitigation handles the disconnect from limit expiry. No action needed unless a room exceeds 128KB consistently.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | node:test (built-in, Node 20) with tsx loader |
| Config file | none — invoked via `node --import tsx --test tests/*.test.ts` |
| Quick run command | `node --import tsx --test tests/phase18.production-net.test.ts` |
| Full suite command | `npm test` (runs all `tests/*.test.ts`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NET-01 | circuitRelayTransport wired in transports[] | structural (source read + regex) | `node --import tsx --test tests/phase18.production-net.test.ts` | ❌ Wave 0 |
| NET-01 | yamux stream multiplexer still wired | structural | same | ❌ Wave 0 |
| NET-02 | bandwidth config parsed from config.yaml | unit (loadConfig with bandwidth fields) | same | ❌ Wave 0 |
| NET-02 | token bucket limits outbound share updates | unit (createRateLimiter mock) | same | ❌ Wave 0 |
| NET-02 | semaphore limits concurrent syncs | unit (createSemaphore) | same | ❌ Wave 0 |
| NET-03 | dcutr() wired in services{} | structural | same | ❌ Wave 0 |
| NET-03 | uPnPNAT() wired in services{} | structural | same | ❌ Wave 0 |
| NET-03 | /p2p-circuit only added when relays non-empty | unit (TransportConfig with relays) | same | ❌ Wave 0 |
| NET-04 | connection:close listener registered in daemon | structural | same | ❌ Wave 0 |
| NET-04 | health tracker records disconnects and marks degraded | unit (HealthTracker pure logic) | same | ❌ Wave 0 |
| NET-04 | peer list shows health column | structural (peer.ts source) | same | ❌ Wave 0 |
| NET-04 | 10-peer mesh: all connected to 3+ peers | integration (slow, real libp2p nodes) | `AKASHIK_SKIP_SLOW=0 node --import tsx --test tests/phase18.production-net.test.ts` | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `node --import tsx --test tests/phase18.production-net.test.ts` (skip slow via env)
- **Per wave merge:** `npm test` (full suite, all 163+ prior tests must still pass)
- **Phase gate:** Full suite green before `/gsd:verify-work`. Slow test must pass with `AKASHIK_SKIP_SLOW=0`.

### Wave 0 Gaps

- [ ] `tests/phase18.production-net.test.ts` — covers all NET-01..04 requirements
- [ ] `src/infrastructure/connection-health.ts` — new module, no test yet
- [ ] `src/infrastructure/bandwidth-limiter.ts` — new module, no test yet

*(No framework install needed — node:test is built-in to Node 20)*

---

## Sources

### Primary (HIGH confidence)

- `@libp2p/circuit-relay-v2@4.2.0` `dist/src/index.d.ts` — exact function signatures `circuitRelayTransport()`, `circuitRelayServer()`; `CircuitRelayTransportInit` fields
- `@libp2p/dcutr@3.0.15` `dist/src/index.d.ts` — `dcutr()` signature, `DCUtRServiceInit` fields, no peerDeps
- `@libp2p/upnp-nat@4.0.15` `dist/src/index.d.ts` + `dist/src/upnp-nat.js` — `uPnPNAT()` signature; confirmed errors caught internally in `mapIpAddresses`, NOT thrown from `start()`
- `@libp2p/interface` (installed with the three deps) `dist/src/index.d.ts` — `Libp2pEvents` type: `'connection:close': CustomEvent<Connection>`, `'peer:disconnect': CustomEvent<PeerId>`
- `@libp2p/interface` `dist/src/connection.d.ts` — `Connection` interface: `.remotePeer: PeerId`, `.direct: boolean`, `.limits?: ConnectionLimits`, `.id: string`, `.status: ConnectionStatus`
- `npm view @libp2p/circuit-relay-v2 version` → `4.2.0` (latest, dist-tags.latest confirmed)
- `npm view @libp2p/dcutr version` → `3.0.15` (latest, confirmed)
- `npm view @libp2p/upnp-nat version` → `4.0.15` (latest, confirmed)
- `@libp2p/dcutr/package.json` — no peerDependencies; no `@libp2p/identify` required
- `@libp2p/circuit-relay-v2/package.json` — no peerDependencies
- All existing project source files read directly from `/Users/saharbarak/workspace/akashik/src/`

### Secondary (MEDIUM confidence)

- `@libp2p/upnp-nat` package documentation comment: "Your libp2p node must be listening on a non-loopback IPv4 address" — confirms UPnP is no-op on loopback (documented behavior)
- `@libp2p/circuit-relay-v2` constants: `DEFAULT_DATA_LIMIT = BigInt(1 << 17)` (128KB), `DEFAULT_DURATION_LIMIT = 2 minutes` — relay connection limits

### Tertiary (LOW confidence)

- None — all critical claims verified from installed package source

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all three deps verified at exact version from npm registry 2026-04-12; function signatures confirmed from installed TypeScript declarations
- Architecture: HIGH — patterns derived from actual package source; existing codebase read in full
- Pitfalls: HIGH — Pitfalls 1–4 derived from package source/docs; Pitfalls 5–7 derived from existing codebase patterns and Phase 17 precedents
- Validation architecture: HIGH — node:test framework confirmed from existing test files; test command confirmed from package.json scripts

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (libp2p releases frequently; re-verify if `libp2p` core package bumps major version)
