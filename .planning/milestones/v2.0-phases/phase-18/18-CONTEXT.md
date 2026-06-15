# Phase 18: Production Networking - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Production-grade P2P networking for folklore. NAT traversal via libp2p circuit-relay-v2 + dcutr hole punching + UPnP. Bandwidth management at the application layer with layered limits (updates/sec per peer per room, concurrent syncs per tick). Connection health monitoring via passive libp2p events with in-memory degraded-peer tracking. A real 10-peer in-process integration test proves NET-04's "10+ simultaneous peers without degradation." This is the last phase of v2.0 — after Phase 18, the P2P milestone is shippable.

</domain>

<decisions>
## Implementation Decisions

### NAT Traversal Stack
- **3 new libp2p modules: `@libp2p/circuit-relay-v2@4.2.0` + `@libp2p/dcutr@3.0.15` + `@libp2p/upnp-nat@4.0.15`** — industry-standard combo
- Circuit-relay-v2: **client-only in Phase 18** — every peer can dial via relays but does not serve as one. Serving-as-relay is a v3 concern (capacity, DoS mitigation)
- Bootstrap relays: **configurable via `config.yaml peer.relays: []`, empty by default** — users explicitly add known-reliable relay multiaddrs when they need them. No hardcoded IPFS bootstrap nodes (third-party dependency risk)
- UPnP: **on by default, fails silently** — if UPnP is unavailable (router doesn't support, blocked, error), log a stderr warning once and continue without external port mapping

### Bandwidth Management
- **Throttling at the application layer** inside `share-sync.ts` and `search-sync.ts` — libp2p stream-level limits are coarse and tied to internals. App-layer gives semantic control
- **Layered limits:**
  - `peer.bandwidth.max_updates_per_sec_per_peer_per_room` (default `50`) — per-peer-per-room token bucket for outbound share updates
  - `peer.bandwidth.max_concurrent_share_syncs` (default `10`) — per-tick semaphore on the daemon
- **Independent budgets between share and search** — share is persistent/batched, search is interactive. A runaway search must not starve CRDT sync
- Defaults in `config.yaml peer.bandwidth`; per-peer override via optional `config.yaml peer.bandwidth_overrides: { <peerId>: {...} }` for power users tuning flaky peers

### Connection Health & Auto-Reconnect
- **Passive monitoring** — listen to libp2p `connection:close` events, track disconnect counts in-memory. Phase 15's `reconnectRetries: Infinity` + exponential backoff already handles reconnection; Phase 18 adds observability
- **Degraded heuristic:** **3+ unexpected disconnects within 60s OR no successful stream in 5 minutes** flags a peer as degraded
- **Action on degraded:** surfaced in `peer list` and `peer list --json` output (new `health: 'ok' | 'degraded'` field); logged to `share-log.jsonl` with `action: 'peer_degraded'`; **no auto-removal** (user decides)
- **Health state is in-memory only** — resets on daemon restart to avoid stale state. No `health.json` file

### Multi-Peer Testing (NET-04)
- **In-process 10-peer integration test** — spin up 10 short-lived libp2p nodes on OS-assigned ports, connect in a mesh, exchange one share update + one federated search, verify connectivity
- **Runtime budget: 30-45 seconds** — slower than unit tests but acceptable. Tagged as a "slow" test; skippable via `FOLKLORE_SKIP_SLOW=1`
- **Shared `afterAll` cleanup** stops every node in the test file, catching individual stop failures so cleanup can't cascade into test failures
- **Pass bar: hard = all 10 nodes connected to at least 3 others** (NET-04 literal text is "10+ connected simultaneously without degradation"); soft logging if fewer actually connect, but assertion fails

### Claude's Discretion
- Exact token-bucket refill timing within the bandwidth limiter
- Specific log format inside `share-log.jsonl` for the new `peer_degraded` / `bandwidth_limited` action types
- Whether the 10-peer test uses a complete mesh (N*(N-1)/2 = 45 connections) or a sparse ring+crossover — leave to planner

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/infrastructure/peer-transport.ts` — `createNode` signature is already layered for conditional modules (mDNS, DHT were added in Phase 17). Phase 18 adds relay/dcutr/upnp the same way
- `src/infrastructure/share-sync.ts` — Phase 17's token bucket pattern (`createRateLimiter` in search-sync) can be reused for the application-layer bandwidth limiter
- `src/infrastructure/peer-store.ts` — `PeerRecord` already has `discovery_method`; Phase 18 does NOT modify the persisted schema (health is in-memory only)
- `src/cli/commands/peer.ts` — `peer list` output already has discovery_method column; add `health` column the same way
- `src/daemon/loop.ts` — Phase 17 wired search protocol; Phase 18 adds the health event listener registration alongside
- `~/.folklore/share-log.jsonl` — extend with new action types per Phase 15-17 precedent

### Established Patterns
- Functional DDD, neverthrow, no classes in domain/app
- Token bucket + idle eviction (from Phase 17 `search-sync.ts`)
- Error union per bounded context — Phase 18 extends with `NetError` variants
- Configurable defaults via `config.yaml peer.*` section with typed loader
- Audit log as append-only `share-log.jsonl`
- In-process libp2p integration tests (Phase 16's 10-way concurrent mutation test is precedent)

### Integration Points
- `src/infrastructure/peer-transport.ts` `createNode` — add conditional `relay: circuitRelayServer(...)` (client-only), `dcutr: dcutr()`, `upnpNAT: uPnPNAT()` into services block. Wire `config.peer.relays` into `addresses.listen` as `/p2p-circuit` suffixes when non-empty
- `src/domain/errors.ts` — add `NetError` with variants (`RelayDialFailed`, `HolePunchTimeout`, `UPnPMapFailed`, `BandwidthExceeded`, `HealthDegraded`, `RelayNotConfigured`). Wire into `AppError` + `formatError`
- `src/infrastructure/config-loader.ts` — extend `PeerConfig` with `relays: readonly string[]`, `upnp: boolean`, `bandwidth: { max_updates_per_sec_per_peer_per_room, max_concurrent_share_syncs }`, `bandwidth_overrides?: Record<string, ...>`
- New `src/infrastructure/connection-health.ts` — in-memory degraded-peer tracker. Pure-ish: mutating Map but no external I/O beyond the audit log append
- New `src/infrastructure/bandwidth-limiter.ts` — shared token-bucket + semaphore primitives (moved from search-sync duplication where applicable)
- `src/cli/commands/peer.ts` — add `health` column to list output (text + json)
- `src/daemon/loop.ts` — register `connection:close` listener after libp2p bootstrap, cleanup on SIGTERM

</code_context>

<specifics>
## Specific Ideas

- Dep budget: **3 new deps** — `@libp2p/circuit-relay-v2@4.2.0`, `@libp2p/dcutr@3.0.15`, `@libp2p/upnp-nat@4.0.15`. Verified via `npm view` on 2026-04-12
- NET-04's "10+ peers without degradation" is satisfied when the 10-peer in-process test passes. Production testing on real NAT infrastructure is a UAT item users perform when deploying
- Bandwidth defaults are conservative: 50 updates/sec per peer per room = 50 * 3600 = 180K updates/hour per peer. Homelab daily traffic is orders of magnitude lower. Power users tune upward via config
- Phase 17 review item: "query privacy" surfaced the embedding-visibility trade-off. Phase 18 does NOT solve this; it's documented as deferred to v3 (PIR)
- `connection:close` in libp2p 3.x fires for both clean disconnects and errors; the health tracker must distinguish graceful vs unexpected via event detail
- Health tracker Map is bounded by the number of known peers (small); idle eviction is not needed like the per-peer rate limiter from Phase 17

</specifics>

<deferred>
## Deferred Ideas

- **Serving as a relay for others** — v3 (capacity planning, DoS mitigation required first)
- **Private Information Retrieval (PIR)** — full query privacy, v3+
- **Per-peer ACL** — Phase 15 review risk; noted, revisit when real need emerges
- **Multi-hop routing (peer proxies through peer)** — v3
- **Reputation / trust graph** — v3
- **AutoNAT** — AutoNAT v2 is newer; dcutr covers the hole-punching half of NAT traversal without the overhead of AutoNAT advertisement
- **Active heartbeat protocol** — passive monitoring via libp2p events is sufficient; dedicated heartbeat is overhead for marginal gain

</deferred>
