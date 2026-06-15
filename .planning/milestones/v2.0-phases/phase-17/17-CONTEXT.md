# Phase 17: Federated Search + Discovery - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Search across the P2P network and discover peers automatically. Federated search sends the requester's local embedding to all connected peers, each runs sqlite-vec against its own shared-room vectors, and the requester merges results with `_source_peer` provenance. Discovery adds mDNS (LAN auto-discovery) and DHT wiring (off by default). Cross-peer tunnel detection runs over the combined result set. Delivers `ask --peers`, the `federated_search` MCP tool, and auto-discovery via mDNS. Production networking (NAT traversal, bandwidth management, auto-reconnect) is Phase 18.

</domain>

<decisions>
## Implementation Decisions

### Federated Search Protocol
- Wire format: **embedding** (384-dim Float32Array from the requester's local ONNX runtime) — not raw query text. Keeps ONNX out of the inbound hot path on responding peers
- Fan-out: **parallel dial** — send `SearchRequest` to all currently-connected peers via parallel libp2p streams, collect responses with a **2s timeout** per peer. Degraded peers do not block the query
- Result merging: requester merges local results + all peer responses into one ranked list by cosine distance, annotating each result with `_source_peer: <peerId>` (null for local results)
- New protocol ID: **`/folklore/search/1.0.0`** — separate from `/folklore/share/1.0.0` so sync and search have independent stream lifecycles

### Peer Discovery Strategy
- **mDNS enabled by default** (DISC-02) — homelab/LAN case is the primary use. `@libp2p/mdns` auto-adds discovered peers to the libp2p peerStore. Disable via `config.yaml peer.mdns: false`
- **DHT wired but off by default** (DISC-03) — `@libp2p/kad-dht` implementation lands in Phase 17 but `config.yaml peer.dht.enabled: true` required to activate. Ships the plumbing so Phase 18/v3 can enable cheaply
- **DISC-04 coordination server deferred** — adds deploy complexity. DISC-01 (manual) + DISC-02 (mDNS) + DISC-03 (DHT) cover the core discovery needs for v2.0
- Discovered peers auto-persisted to `peers.json` with new field `discovery_method: 'manual' | 'mdns' | 'dht'` — distinguishable from manual adds in `peer list` output

### MCP Tool + CLI Surface
- Extend existing `folklore ask` with `--peers` flag (matches FED-01 literal text). `ask` already does embedding + ranking; federated mode adds the fan-out step
- New MCP tool **`federated_search(query, limit?, room?)`** — separate from existing `search` so Claude has a clear choice between "my graph" vs. "my graph + peers". Results include `_source_peer` annotation. Registered as the 14th MCP tool
- Default behavior when **no peers connected**: return local-only results with `peers_queried: 0` in the meta field. No hard error. Same for `ask --peers`
- Cross-peer tunnel detection (FED-04): run existing `findTunnels` over the combined result set as a synthetic one-shot graph. Surface tunnels as a separate section in output

### Security, Trust, and Privacy
- **Query privacy** — peers see the embedding and room filter. Embeddings are not plaintext but are correlatable. Document this trade-off explicitly in the `federated_search` tool description and in `peer status` output. Private information retrieval (PIR) is v3+
- **Inbound search authorization** — peers can request any room but only rooms in the local `shared-rooms.json` respond. Non-shared rooms return an empty result set. No per-peer ACL in Phase 17 (room-level only)
- **Rate limiting** — token bucket per peer: **10 requests/sec, burst 30**. Configurable via `config.yaml peer.search_rate_limit`. Prevents a peer from DOSing local sqlite-vec with a fast query loop
- **Audit log** — append to existing `~/.folklore/share-log.jsonl` with new `action: 'search_request' | 'search_response'` entries. Single log file for all P2P activity

### Claude's Discretion
- Exact wire format for `SearchRequest` / `SearchResponse` (likely JSON framed via length-prefixed — same pattern as SubscribeRequest in Phase 16)
- Whether `federated_search` deduplicates results that exist locally AND on a peer (lean: yes, prefer local with a secondary `_also_from_peers: [...]` annotation)
- Dimension mismatch handling between peers with different embedding models (unlikely but possible — error-and-skip is safe default)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/infrastructure/vector-index.ts` — `VectorIndex.query(embedding, topK, roomFilter)` is the core sqlite-vec adapter. Federated search calls this directly with inbound embeddings
- `src/application/discover.ts` — `findTunnels` is pure and operates on any Graph/Subgraph. Phase 17 calls it with a synthetic combined graph from federated results
- `src/infrastructure/peer-transport.ts` — `createNode`, `registerShareProtocol`, `dialAndTag` — Phase 17 adds `registerSearchProtocol` and `openSearchStream` alongside
- `src/infrastructure/share-sync.ts` — `runStreamSession` / framing pattern / `.subarray()` lpStream handling can be adapted for the search protocol handler
- `src/infrastructure/share-store.ts` — `loadSharedRooms` authoritative for "is this room shared" check in inbound search authorization
- `src/cli/commands/ask.ts` — existing ask command; Phase 17 adds `--peers` flag branch
- `src/mcp/server.ts` — `buildMcpServer(runtime)` — Phase 17 registers the new `federated_search` tool alongside existing 13

### Established Patterns
- Functional DDD: pure domain types, neverthrow Result for all I/O
- Error unions per bounded context — Phase 17 extends with `SearchError` variants
- V1 JSON framing over libp2p streams via `it-length-prefixed` (Phase 16 set this precedent)
- Token bucket pattern: simple refill rate + burst cap, stateful per-peer Map
- `shared-rooms.json` cross-process lock from Phase 16's `share-store.ts` — reuse directly

### Integration Points
- `src/infrastructure/peer-transport.ts` — add mDNS module to `createLibp2p` config + conditional DHT
- `src/cli/commands/peer.ts` — `peer list` output shows `discovery_method` for discovered peers
- `src/infrastructure/peer-store.ts` — extend `PeerRecord` with optional `discovery_method` field, migrate via existing `version` field
- `src/daemon/loop.ts` — discovery runs as part of libp2p node lifecycle (no new tick); federated search is synchronous per CLI/MCP call (no daemon involvement)
- `~/.folklore/share-log.jsonl` — extend existing audit log with search actions

</code_context>

<specifics>
## Specific Ideas

- Dep budget: **3 new npm deps** — `@libp2p/mdns` (mDNS discovery), `@libp2p/kad-dht` (DHT wiring), `@libp2p/bootstrap` (manual bootstrap peer list for DHT). Verify on npm registry 2026-04-12 before install
- Phase 15 risk callout: "query privacy" is the trade-off that Phase 17 surfaces explicitly. We ship it, document it, don't mitigate it — PIR lands in v3
- Federated search latency budget: 2s per-peer timeout + parallel fan-out means even 10 slow peers don't exceed 2s wall clock
- Embedding dimension: 384 (all-MiniLM-L6-v2). Peers with a different model or dimension get a `dimension_mismatch` error and are skipped
- Phase 16 lessons: use `REMOTE_ORIGIN` Symbol pattern for any Y.js mutations triggered by inbound search results (if we observe any). Phase 17 does not write to the Y.Doc, so this concern is minimal
- MCP tool count goes from 13 → 14. Update README numbers

</specifics>

<deferred>
## Deferred Ideas

- **NAT traversal** (libp2p relay, hole punching) — Phase 18 NET-03
- **Bandwidth management** (configurable sync rate) — Phase 18 NET-02
- **Auto-reconnect + connection health monitoring** — Phase 18 NET-04
- **Coordination server** (DISC-04) — optional bootstrap server, deferred to Phase 18 or later
- **Private Information Retrieval (PIR)** — full query privacy, v3+
- **Per-peer ACL** — "peer P may read room R but not room S", noted as Phase 15 review risk; revisit when real need emerges
- **Multi-hop routing** (peer B proxies through peer C) — Phase 18 or v3
- **Reputation / trust graph** — v3

</deferred>
