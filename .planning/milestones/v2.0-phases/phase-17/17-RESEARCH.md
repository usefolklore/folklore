# Phase 17: Federated Search + Discovery — Research

**Researched:** 2026-04-12
**Domain:** libp2p peer discovery (mDNS, Kademlia DHT, Bootstrap) + federated semantic search over sqlite-vec + MCP tool registration
**Confidence:** HIGH (core stack verified against npm registry + official libp2p docs on 2026-04-12)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Federated Search Protocol**
- Wire format: embedding (384-dim Float32Array from the requester's local ONNX runtime) — not raw query text. Keeps ONNX out of the inbound hot path on responding peers
- Fan-out: parallel dial — send SearchRequest to all currently-connected peers via parallel libp2p streams, collect responses with a 2s timeout per peer. Degraded peers do not block the query
- Result merging: requester merges local results + all peer responses into one ranked list by cosine distance, annotating each result with `_source_peer: <peerId>` (null for local results)
- New protocol ID: `/folklore/search/1.0.0` — separate from `/folklore/share/1.0.0` so sync and search have independent stream lifecycles

**Peer Discovery Strategy**
- mDNS enabled by default (DISC-02) — homelab/LAN case is the primary use. `@libp2p/mdns` auto-adds discovered peers to the libp2p peerStore. Disable via `config.yaml peer.mdns: false`
- DHT wired but off by default (DISC-03) — `@libp2p/kad-dht` implementation lands in Phase 17 but `config.yaml peer.dht.enabled: true` required to activate. Ships the plumbing so Phase 18/v3 can enable cheaply
- DISC-04 coordination server deferred — adds deploy complexity. DISC-01 (manual) + DISC-02 (mDNS) + DISC-03 (DHT) cover the core discovery needs for v2.0
- Discovered peers auto-persisted to `peers.json` with new field `discovery_method: 'manual' | 'mdns' | 'dht'` — distinguishable from manual adds in `peer list` output

**MCP Tool + CLI Surface**
- Extend existing `folklore ask` with `--peers` flag (matches FED-01 literal text). `ask` already does embedding + ranking; federated mode adds the fan-out step
- New MCP tool `federated_search(query, limit?, room?)` — separate from existing `search` so Claude has a clear choice between "my graph" vs. "my graph + peers". Results include `_source_peer` annotation. Registered as the 14th MCP tool
- Default behavior when no peers connected: return local-only results with `peers_queried: 0` in the meta field. No hard error. Same for `ask --peers`
- Cross-peer tunnel detection (FED-04): run existing `findTunnels` over the combined result set as a synthetic one-shot graph. Surface tunnels as a separate section in output

**Security, Trust, and Privacy**
- Query privacy — peers see the embedding and room filter. Embeddings are not plaintext but are correlatable. Document this trade-off explicitly in the `federated_search` tool description and in `peer status` output. Private information retrieval (PIR) is v3+
- Inbound search authorization — peers can request any room but only rooms in the local `shared-rooms.json` respond. Non-shared rooms return an empty result set. No per-peer ACL in Phase 17 (room-level only)
- Rate limiting — token bucket per peer: 10 requests/sec, burst 30. Configurable via `config.yaml peer.search_rate_limit`. Prevents a peer from DOSing local sqlite-vec with a fast query loop
- Audit log — append to existing `~/.folklore/share-log.jsonl` with new `action: 'search_request' | 'search_response'` entries. Single log file for all P2P activity

### Claude's Discretion
- Exact wire format for `SearchRequest` / `SearchResponse` (likely JSON framed via length-prefixed — same pattern as SubscribeRequest in Phase 16)
- Whether `federated_search` deduplicates results that exist locally AND on a peer (lean: yes, prefer local with a secondary `_also_from_peers: [...]` annotation)
- Dimension mismatch handling between peers with different embedding models (unlikely but possible — error-and-skip is safe default)

### Deferred Ideas (OUT OF SCOPE)
- NAT traversal (libp2p relay, hole punching) — Phase 18 NET-03
- Bandwidth management (configurable sync rate) — Phase 18 NET-02
- Auto-reconnect + connection health monitoring — Phase 18 NET-04
- Coordination server (DISC-04) — optional bootstrap server, deferred to Phase 18 or later
- Private Information Retrieval (PIR) — full query privacy, v3+
- Per-peer ACL — "peer P may read room R but not room S", noted as Phase 15 review risk; revisit when real need emerges
- Multi-hop routing (peer B proxies through peer C) — Phase 18 or v3
- Reputation / trust graph — v3
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| FED-01 | `folklore ask "query" --peers` searches across all connected peers' shared rooms | ask.ts parseArgs pattern identified; `--peers` flag branch extends existing arg loop; fan-out via `openSearchStream` per connected peer |
| FED-02 | Results aggregated and re-ranked by distance across all peers | `VectorIndex.searchGlobal` returns `Match[]` with `distance`; merge is sort-by-distance over combined local+peer arrays |
| FED-03 | Each result shows which peer it came from | `_source_peer: peerId | null` annotation added at merge time; verified against share-sync.ts provenance pattern (`_folklore_source_peer`) |
| FED-04 | Tunnel detection runs across peers — cross-peer + cross-room connections surfaced | `findTunnels` in `application/use-cases.ts` is pure over a Graph; feed it synthetic VectorRecords from merged results |
| FED-05 | MCP tool `federated_search` lets Claude search the P2P network mid-conversation | `server.registerTool` pattern verified from server.ts; 13 tools registered → 14th is `federated_search` |
| DISC-01 | Manual peer add via multiaddr (always works, no infrastructure needed) | Already delivered in Phase 15 via `peer-store.ts` + `peer.ts` CLI |
| DISC-02 | mDNS/Bonjour auto-discovery for peers on the same local network | `@libp2p/mdns@12.0.16` verified; `peerDiscovery: [mdns()]` in createLibp2p; emits `peer:discovery` event; caller dials + persists with `discovery_method: 'mdns'` |
| DISC-03 | DHT-based discovery for internet-wide peer finding (libp2p Kademlia) | `@libp2p/kad-dht@16.2.0` verified; wired as `services: { dht: kadDHT({ clientMode: true }) }` by default; activated by config flag |
| DISC-04 | Optional coordination server for bootstrapping | DEFERRED per CONTEXT.md — `@libp2p/bootstrap@12.0.16` installed for DHT bootstrap list only |
</phase_requirements>

---

## Summary

Phase 17 delivers three interlocking features: federated search (send embedding to all connected peers, merge results), auto-discovery (mDNS on LAN, DHT wired but off), and the `federated_search` MCP tool. All three are additive to the Phase 15+16 infrastructure — the libp2p node, peer-store, and FramedStream framing pattern are reused unchanged.

The search protocol mirrors the Phase 16 share protocol structurally: `node.handle('/folklore/search/1.0.0', handler)`, JSON first-frame (SearchRequest), then a single JSON response frame (SearchResponse). No Y.js, no CRDT, no stream loop — request/response semantics are simpler than the sync protocol. The biggest design question is whether to use short-lived one-shot streams (open → request → response → close) or reuse streams for multiple queries. Given the 2s timeout requirement and the short-lived nature of search queries, one-shot streams per query per peer are correct.

Discovery wiring is straightforward: `peerDiscovery: [mdns({ interval: 20000 })]` added to `createLibp2p` in `peer-transport.ts`, a `peer:discovery` event listener persists the peer with `discovery_method: 'mdns'` via `mutatePeers`, and optionally dials (respecting libp2p's own auto-dial when `minConnections > 0`). DHT is wired as a service with `clientMode: true` by default (no DHT serving overhead until the user opts in).

**Primary recommendation:** Copy the Phase 16 `FramedStream` + single JSON frame pattern for the search protocol. One-shot stream lifecycle. Parallel fan-out with `Promise.race([searchPeer(peer), timeout(2000)])`. Merge arrays by ascending distance. Register mDNS in `peerDiscovery`, DHT in `services`.

---

## Standard Stack

### Core (no new deps — already installed)
| Library | Installed Version | Purpose | Why |
|---------|------------------|---------|-----|
| `libp2p` | 3.2.0 | Node lifecycle, `node.handle()`, `node.dialProtocol()`, `node.getPeers()`, `peer:discovery` event | Phase 15/16 baseline |
| `@libp2p/interface` | 3.2.0 | `Libp2p`, `Stream`, `Connection` types | Phase 15/16 baseline |
| `it-length-prefixed` | transitive | Frame encoding/decoding on libp2p streams | Phase 16 pattern (lp.encode/lp.decode) |
| `neverthrow` | 8.2.0 | Result/ResultAsync for all I/O | Project-wide constraint |
| `better-sqlite3` + `sqlite-vec` | 11.10.0 / 0.1.9 | `VectorIndex.searchGlobal` / `searchByRoom` — the responding peer's search backend | Phase 1 baseline |
| `@modelcontextprotocol/sdk` | 1.29.0 | `McpServer.registerTool` for `federated_search` | Phase 3 baseline |

### New Deps — 3 Maximum (verified 2026-04-12)
| Library | Version | Published | Purpose | Install |
|---------|---------|----------|---------|---------|
| `@libp2p/mdns` | **12.0.16** | 2026-04-08 | mDNS peer discovery — `peerDiscovery: [mdns()]` | `npm i @libp2p/mdns` |
| `@libp2p/kad-dht` | **16.2.0** | 2026-04-08 | Kademlia DHT — `services: { dht: kadDHT() }` | `npm i @libp2p/kad-dht` |
| `@libp2p/bootstrap` | **12.0.16** | 2026-04-08 | Bootstrap peer list for DHT seed peers | `npm i @libp2p/bootstrap` |

**Version verification:** Confirmed against npm registry 2026-04-12. All three versions are in the `latest` dist-tag. All three are compatible with `@libp2p/interface@3.2.0` and `libp2p@3.2.0` (confirmed via `dependencies` field in npm metadata — they all declare `"@libp2p/interface": "^3.2.0"`).

**Installation:**
```bash
npm install @libp2p/mdns@12.0.16 @libp2p/kad-dht@16.2.0 @libp2p/bootstrap@12.0.16
```

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JSON first-frame (SearchRequest) | protobuf / msgpack | JSON is 1-2KB overhead per query, negligible vs 2s timeout. Matches Phase 16 SubscribeRequest precedent. Zero new deps. |
| One-shot streams per query | Persistent multiplexed query streams | One-shot is simpler, avoids stream registry complexity, correct for infrequent queries. Persistent streams only worth it for high-frequency use — not this workload. |
| `kadDHT({ clientMode: true })` | `clientMode: false` (server mode) | Client mode: node queries DHT but doesn't serve it. Server mode: participates in routing table. Default to client to minimize overhead. Opt-in via config. |

---

## Architecture Patterns

### Recommended Project Structure (additions only)

```
src/
├── domain/
│   └── errors.ts             # Add SearchError union (7th bounded context)
├── infrastructure/
│   ├── peer-transport.ts     # Add mdns + kad-dht to createLibp2p; add peer:discovery handler
│   ├── peer-store.ts         # PeerRecord gets discovery_method?: 'manual'|'mdns'|'dht'
│   └── search-sync.ts        # NEW: registerSearchProtocol, openSearchStream, runFederatedSearch
├── application/
│   └── federated-search.ts   # NEW: orchestrates embed → fan-out → merge → findTunnels
├── cli/commands/
│   └── ask.ts                # Extend: --peers flag branch calls federatedSearch
└── mcp/
    └── server.ts             # Extend: register 14th tool federated_search
```

### Pattern 1: Search Protocol (One-Shot Request/Response)

**What:** Open a new libp2p stream per peer per query, send SearchRequest JSON frame, read one SearchResponse JSON frame, close. No loop.

**When to use:** Every call to `runFederatedSearch` fans out to all connected peers.

```typescript
// Source: Phase 16 share-sync.ts FramedStream pattern (adapted)
export const SEARCH_PROTOCOL_ID = '/folklore/search/1.0.0' as const;

// SearchRequest — first and only outbound frame
interface SearchRequest {
  readonly type: 'search';
  readonly embedding: number[];       // Float32Array serialized as number[] for JSON
  readonly room?: string;             // optional room filter
  readonly k: number;                 // top-k requested
}

// SearchResponse — first and only inbound frame
interface SearchResponse {
  readonly type: 'search_response';
  readonly matches: ReadonlyArray<{
    node_id: string;
    room: string;
    wing?: string;
    distance: number;
    label?: string;             // optional — responding peer includes if available
    source_uri?: string;
  }>;
  readonly error?: string;      // dimension_mismatch | unauthorized | rate_limited
}

// Inbound handler on responding peer
const handleSearchRequest = async (
  stream: Stream,
  vectorIndex: VectorIndex,
  sharedRoomsPath: string,
  rateLimiter: RateLimiter,
  logPath: string,
  peerId: string,
): Promise<void> => {
  const fs = makeFramedStream(stream);       // reuse Phase 16 FramedStream
  const iter = fs.frameIter();
  const frame = await iter.next();
  if (frame.done) { fs.close(); return; }
  const req = JSON.parse(new TextDecoder().decode(frame.value)) as SearchRequest;

  // authorization: room must be in shared-rooms.json
  // rate limit: token bucket keyed by remotePeerId
  // dimension guard: req.embedding.length must === 384

  const embedding = new Float32Array(req.embedding);
  const results = req.room
    ? await vectorIndex.searchByRoom(req.room as Room, embedding, req.k)
    : await vectorIndex.searchGlobal(embedding, req.k);

  const response: SearchResponse = results.isOk()
    ? { type: 'search_response', matches: results.value }
    : { type: 'search_response', matches: [], error: results.error.type };

  await fs.write(new TextEncoder().encode(JSON.stringify(response)));
  fs.close();
};
```

### Pattern 2: Parallel Fan-Out with Per-Peer Timeout

**What:** Query all connected peers simultaneously. Each peer gets a 2s deadline. Failures and timeouts yield empty arrays, never blocking the merge.

```typescript
// Source: CONTEXT.md — "parallel dial, 2s timeout per peer"
const queryOnePeer = async (
  node: Libp2p,
  peerId: string,
  req: SearchRequest,
): Promise<ReadonlyArray<PeerMatch>> => {
  const pid = peerIdFromString(peerId);
  const stream = await node.dialProtocol(pid, SEARCH_PROTOCOL_ID);
  const fs = makeFramedStream(stream);
  await fs.write(new TextEncoder().encode(JSON.stringify(req)));
  const iter = fs.frameIter();
  const frame = await iter.next();
  fs.close();
  if (frame.done) return [];
  const resp = JSON.parse(new TextDecoder().decode(frame.value)) as SearchResponse;
  return resp.matches.map(m => ({ ...m, _source_peer: peerId }));
};

const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  Promise.race([promise, new Promise<T>(resolve => setTimeout(() => resolve(fallback), ms))]);

export const runFederatedSearch = async (
  node: Libp2p,
  vectorIndex: VectorIndex,
  embedding: Float32Array,
  k: number,
  room?: string,
): Promise<FederatedResult> => {
  const localMatches = room
    ? await vectorIndex.searchByRoom(room as Room, embedding, k)
    : await vectorIndex.searchGlobal(embedding, k);

  const peers = node.getPeers().map(p => p.toString());
  const req: SearchRequest = {
    type: 'search',
    embedding: Array.from(embedding),
    room,
    k,
  };

  const peerResults = await Promise.all(
    peers.map(peerId =>
      withTimeout(queryOnePeer(node, peerId, req), 2000, [])
        .catch(() => [] as PeerMatch[]),
    ),
  );

  const allMatches = [
    ...(localMatches.isOk() ? localMatches.value.map(m => ({ ...m, _source_peer: null })) : []),
    ...peerResults.flat(),
  ].sort((a, b) => a.distance - b.distance);

  return {
    matches: allMatches.slice(0, k),
    peers_queried: peers.length,
    peers_responded: peerResults.filter(r => r.length > 0).length,
  };
};
```

### Pattern 3: mDNS Discovery → peers.json Persistence

**What:** Listen for `peer:discovery` events emitted by the mDNS module. Persist with `discovery_method: 'mdns'`. Optionally dial if not already connected.

**Critical:** mDNS emits `peer:discovery` events on the libp2p node — it does NOT auto-dial. The connectionManager will auto-dial if `minConnections > 0`, but do not rely on this. Explicit `node.dial()` is the safe pattern.

```typescript
// Source: libp2p official PEER_DISCOVERY.md + mdns README
import { mdns } from '@libp2p/mdns';

// In createLibp2p (peer-transport.ts):
const node = await createLibp2p({
  privateKey: identity.privateKey,
  addresses: { listen: [`/ip4/${host}/tcp/${cfg.listenPort}`] },
  transports: [tcp()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  peerDiscovery: cfg.mdns !== false ? [mdns({ interval: 20000 })] : [],
  services: cfg.dhtEnabled ? {
    dht: kadDHT({ clientMode: true, protocol: '/folklore/kad/1.0.0' }),
  } : {},
  connectionManager: { reconnectRetries: Infinity, reconnectRetryInterval: 2000, reconnectBackoffFactor: 2 },
});

// Discovery event listener (attached after node.start()):
node.addEventListener('peer:discovery', (evt) => {
  const peerInfo = evt.detail;
  const peerId = peerInfo.id.toString();
  const addrs = peerInfo.multiaddrs.map(m => m.toString());

  // Persist with discovery_method
  void mutatePeers(peersPath, (file) =>
    addPeerRecord(file, {
      id: peerId,
      addrs,
      addedAt: new Date().toISOString(),
      discovery_method: 'mdns',
    }),
  );

  // Dial if not already connected
  if (!node.getPeers().some(p => p.toString() === peerId)) {
    void node.dial(peerInfo.multiaddrs[0]).catch(() => { /* best-effort */ });
  }
});
```

### Pattern 4: Token Bucket Rate Limiter (Stateful Map)

**What:** Per-peer token bucket. Stateful `Map<peerId, BucketState>`. No timers — refill is computed lazily on each consume call.

**Why stateful Map (not stateless per-call):** The burst cap (30) requires tracking accumulated tokens across requests. Stateless functions cannot enforce burst limits.

```typescript
// Source: CONTEXT.md — "10 req/s, burst 30"
interface BucketState {
  tokens: number;
  lastRefill: number;   // Date.now() ms
}

const RATE = 10;        // tokens per second
const BURST = 30;       // max bucket size

const buckets = new Map<string, BucketState>();

export const consumeToken = (peerId: string): boolean => {
  const now = Date.now();
  const state = buckets.get(peerId) ?? { tokens: BURST, lastRefill: now };
  const elapsed = (now - state.lastRefill) / 1000;
  const refilled = Math.min(BURST, state.tokens + elapsed * RATE);
  if (refilled < 1) {
    buckets.set(peerId, { tokens: refilled, lastRefill: now });
    return false;    // rate limited
  }
  buckets.set(peerId, { tokens: refilled - 1, lastRefill: now });
  return true;       // allowed
};
```

**CRITICAL:** The `buckets` Map must be module-scoped (or passed as a dependency) so it persists across calls. A new Map per request defeats the purpose.

### Pattern 5: MCP Tool Registration (14th Tool)

**What:** `server.registerTool` follows identical shape to existing 13 tools. Return local-only results with `peers_queried: 0` when no peers connected.

```typescript
// Source: src/mcp/server.ts — existing registerTool pattern
server.registerTool(
  'federated_search',
  {
    description:
      'Search the P2P network — queries the local knowledge graph AND all connected peers\' shared rooms. ' +
      'PRIVACY NOTE: connected peers see your embedding vector (not raw text) and room filter. ' +
      'Embeddings are not plaintext but are correlatable. ' +
      'Results include _source_peer field (null = local, peerId string = remote peer).',
    inputSchema: {
      query: z.string().describe('The natural-language search query'),
      room: z.string().optional().describe('Restrict to this room on all peers'),
      k: z.number().int().min(1).max(50).default(5).describe('Results per source'),
    },
  },
  async ({ query, room, k }) => {
    // embed → runFederatedSearch → findTunnels on combined → okJson
  },
);
```

### Anti-Patterns to Avoid

- **Reusing share streams for search:** `/folklore/share/1.0.0` and `/folklore/search/1.0.0` are separate protocols with separate lifecycles. Never multiplex search frames into the Y.js sync stream.
- **Sending raw query text over the wire:** The locked decision is to send the embedding (Float32Array → number[]). Raw text means the responding peer must run ONNX, violating the inbound hot-path constraint.
- **Blocking on slow peers:** `Promise.race` with a 2s timeout per peer. Never `await Promise.all` without a timeout wrapper.
- **Eager ResultAsync sequence on fan-out:** Use `Promise.all` with `.catch(() => [])` guards, not `ResultAsync.combine` (which short-circuits on first error). This is the sequenceLazy pattern applied to the search fan-out.
- **DHT serverMode on by default:** `clientMode: true` is the safe default. Server mode joins the global DHT routing table — incorrect for an opt-in feature.
- **Auto-dialing all mDNS peers unconditionally:** Check `node.getPeers()` before dialing to avoid duplicate connections.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| mDNS multicast peer discovery | Custom UDP multicast + DNS-SD parser | `@libp2p/mdns` | mDNS spec has edge cases (PTR/SRV/TXT/A/AAAA record parsing, TTL handling, multiple interfaces, Windows/macOS Bonjour coexistence) |
| DHT peer routing | Custom Kademlia | `@libp2p/kad-dht` | k-bucket management, FIND_NODE RPCs, XOR distance metric, concurrent alpha queries are non-trivial |
| Length-prefixed stream framing | Custom varint framing | `it-length-prefixed` (already installed) | Phase 16 already established this pattern; it handles Uint8ArrayList correctly |
| Token bucket state | External rate-limit library | Hand-rolled Map (40 LoC) | Simple enough; any library adds a dep and still needs peerId keying |

**Key insight:** The search protocol framing is simpler than the share protocol (no CRDT, no sync messages, no Y.js) — but the libp2p stream framing primitives are identical. Copy-paste `makeFramedStream` from share-sync.ts rather than re-inventing it.

---

## Common Pitfalls

### Pitfall 1: mDNS Does Not Auto-Dial
**What goes wrong:** Developer assumes mDNS discovery means automatic connection. Peers appear in the peerStore but no streams are established.
**Why it happens:** libp2p `peer:discovery` only adds to peerStore. Auto-dial requires `connectionManager.minConnections > 0` AND the peer being in the peerStore. The connectionManager will eventually dial, but timing is unpredictable.
**How to avoid:** Explicitly call `node.dial(peerInfo.multiaddrs[0])` inside the `peer:discovery` handler after checking `node.getPeers()`.
**Warning signs:** `peer list` shows discovered peers but `peer status` shows `connectedPeers: 0`.

### Pitfall 2: mDNS Fails in Docker and WSL2 (Non-Mirrored Mode)
**What goes wrong:** mDNS uses UDP multicast to `224.0.0.251:5353`. Docker's default bridge network does not forward multicast between containers. WSL2 (non-mirrored mode) isolates the VM's network from the host.
**Why it happens:** mDNS is link-local multicast — it does not cross network boundaries. Docker bridge ≠ a LAN segment.
**How to avoid:** Docker users must use `--network host` for mDNS to work. WSL2 users need mirrored mode (Docker Desktop 4.26+) or manual `peer add`. Document this in the `peer status` output and config comment.
**Warning signs:** mDNS works between two bare-metal processes but not between two Docker containers.

### Pitfall 3: Float32Array JSON Serialization Round-Trip Precision
**What goes wrong:** `JSON.stringify(Array.from(embedding))` loses precision for some float32 values because JSON uses float64 text representation. On the receiving end `new Float32Array(parsed.embedding)` may have slightly different values.
**Why it happens:** JavaScript's JSON serializer uses `Number.prototype.toString()` which is float64. sqlite-vec's `MATCH` clause uses exact binary comparison on the embedding buffer.
**How to avoid:** The precision loss is sub-epsilon for all-MiniLM-L6-v2 outputs in practice (cosine distance rankings are stable). This is acceptable per CONTEXT.md. If it becomes a problem in testing, Base64-encode the raw Float32Array bytes instead.
**Warning signs:** Test results differ between local and federated queries by more than floating-point epsilon.

### Pitfall 4: kad-dht Needs `identify` Service to Function
**What goes wrong:** DHT is wired but peer routing fails silently. Peers connect but the DHT routing table stays empty.
**Why it happens:** kad-dht relies on the `identify` protocol to learn which protocols peers support. Without `identify`, DHT cannot confirm peers speak the Kademlia protocol.
**How to avoid:** Add `identify: identify()` to `services` whenever `dht: kadDHT(...)` is present.
**Warning signs:** `node.services.dht` exists but routing table is always empty.

### Pitfall 5: SearchError Missing from AppError Union and formatError
**What goes wrong:** TypeScript compilation fails or `formatError` throws on `SearchError` variants because they're not in the union.
**Why it happens:** Every new error bounded context must be added to `AppError = GraphError | VectorError | ... | SearchError` and `formatError` switch statement.
**How to avoid:** Extend `domain/errors.ts` first (Wave 0), before writing any search infrastructure. Add `SearchError` to `AppError` union and add cases to `formatError`.
**Warning signs:** TS2322 / exhaustive switch error in `formatError`.

### Pitfall 6: PeerRecord Schema Migration for `discovery_method`
**What goes wrong:** Existing `peers.json` files have `PeerRecord` without `discovery_method`. Strict TypeScript type assertions fail on load.
**Why it happens:** `loadPeers` reads the raw JSON without migration.
**How to avoid:** Make `discovery_method` optional (`discovery_method?: 'manual' | 'mdns' | 'dht'`) in `PeerRecord`. Absence means 'manual' (pre-Phase 17 entries). No migration needed.
**Warning signs:** `peer list` fails with type assertion error on legacy peers.json.

### Pitfall 7: Rate Limiter Map Grows Unbounded
**What goes wrong:** `buckets` Map accumulates entries for every peer that ever sent a search request. Over time, memory leaks for peers that disconnected long ago.
**Why it happens:** No eviction policy on the Map.
**How to avoid:** On `peer:disconnect` event (or whenever `hangUpPeer` is called), `buckets.delete(peerId)`. Alternatively, cap the Map size at 1000 entries with LRU eviction.
**Warning signs:** Memory growth proportional to total unique peers seen, not active peers.

---

## Code Examples

### sqlite-vec query with Float32Array (verified against vector-index.ts)

The existing `VectorIndex` port's `searchGlobal` and `searchByRoom` already accept `Float32Array` (typed as `Vector = Float32Array`). The inbound handler receives `number[]` from JSON and must reconstruct the `Float32Array`:

```typescript
// Source: src/infrastructure/vector-index.ts — toVecBuffer helper
// The VectorIndex.searchGlobal signature:
//   searchGlobal(query: Vector, k: number): ResultAsync<readonly Match[], VectorError>
// Vector = Float32Array (from src/domain/vectors.ts DEFAULT_DIM = 384)

// In the inbound handler:
const embedding = new Float32Array(req.embedding);  // from JSON number[]
if (embedding.length !== 384) {
  // return SearchResponse with error: 'dimension_mismatch'
}
const matches = await vectorIndex.searchGlobal(embedding, req.k);
```

**Key insight from vector-index.ts source:** `toVecBuffer` converts `Float32Array` to `Buffer` via `Buffer.from(v.buffer, v.byteOffset, v.byteLength)`. This means `new Float32Array(req.embedding)` where `req.embedding` is a plain `number[]` produces a correctly contiguous Float32Array that `toVecBuffer` handles correctly.

### MCP tool registration — exact existing pattern (server.ts)

```typescript
// Source: src/mcp/server.ts — okJson + errText helpers already defined
// Pattern used by all 13 existing tools:
server.registerTool(
  'tool_name',
  { description: '...', inputSchema: { param: z.string() } },
  async ({ param }) => {
    const result = await someUseCase(deps)(param);
    if (result.isErr()) return errText(result.error);
    return okJson(result.value);
  },
);
// federated_search is the 14th tool — identical shape
```

### `ask.ts` --peers flag extension pattern

```typescript
// Source: src/cli/commands/ask.ts — existing parseArgs pattern
// Add to ParsedArgs:
interface ParsedArgs {
  readonly query: string;
  readonly room?: string;
  readonly k: number;
  readonly peers: boolean;   // NEW
}

// In parseArgs loop:
else if (a === '--peers') peers = true;

// In ask():
if (parsed.peers) {
  // embed query → runFederatedSearch(node, vectorIndex, embedding, k, room)
  // print with _source_peer annotation
} else {
  // existing local search path (unchanged)
}
```

### createLibp2p with mDNS + DHT (extended peer-transport.ts)

```typescript
// Source: libp2p official CONFIGURATION.md + mdns/kad-dht README
import { mdns } from '@libp2p/mdns';
import { kadDHT } from '@libp2p/kad-dht';
import { identify } from '@libp2p/identify';  // transitive — already available

const node = await createLibp2p({
  privateKey: identity.privateKey,
  addresses: { listen: [`/ip4/${host}/tcp/${cfg.listenPort}`] },
  transports: [tcp()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  peerDiscovery: cfg.mdns !== false ? [mdns({ interval: 20000 })] : [],
  services: {
    ...(cfg.dhtEnabled ? {
      dht: kadDHT({ clientMode: true, protocol: '/folklore/kad/1.0.0' }),
      identify: identify(),    // required for DHT routing table to populate
    } : {}),
  },
  connectionManager: {
    reconnectRetries: Infinity,
    reconnectRetryInterval: 2000,
    reconnectBackoffFactor: 2,
  },
});
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@chainsafe/libp2p-yamux` (older examples) | `@libp2p/yamux` | libp2p 2.x→3.x | Already using correct package (yamux@8.0.1 in package.json) |
| `identifyService` from `libp2p/identify` | `identify` from `@libp2p/identify` | libp2p 3.x | Import path changed — use `@libp2p/identify` for transitive; verify it's available as transitive dep before adding explicit dep |
| `peerDiscovery.autoDial: false` config | Remove from config; set `connectionManager.minConnections: 0` | libp2p 0.x → current | Auto-dial is now controlled purely by `minConnections` |
| `unmarshalEd25519PrivateKey` | `privateKeyFromRaw` | libp2p 3.x | Already using correct API (documented in STATE.md) |

**Deprecated/outdated:**
- `@libp2p/mplex`: replaced by `@libp2p/yamux` for stream muxing (already using yamux)
- `connectionEncryption: [noise()]` (array key name): current API is `connectionEncrypters: [noise()]` (already using correct key in peer-transport.ts)

---

## Open Questions

1. **Does `@libp2p/identify` need to be an explicit dep?**
   - What we know: `identify` is required for DHT routing table to populate. It's likely a transitive dep already (via `libp2p` core or `@libp2p/kad-dht`).
   - What's unclear: Whether `import { identify } from '@libp2p/identify'` resolves without adding to package.json (Node ESM resolution).
   - Recommendation: Run `node -e "import('@libp2p/identify').then(m => console.log(Object.keys(m)))"` in the project before committing the DHT wiring. If it resolves, skip the explicit dep (dep budget is tight). If not, it's the 4th dep — acceptable since DHT is optional/gated.

2. **`peer:discovery` event detail shape in libp2p 3.x**
   - What we know: The event detail is `PeerInfo` with `.id` (PeerId) and `.multiaddrs` (Multiaddr[]). The mdns module dispatches a custom `'peer'` event internally, which libp2p core translates to `'peer:discovery'` on the node.
   - What's unclear: Exact TypeScript type of `evt.detail` at runtime — whether it's `PeerInfo` from `@libp2p/interface` or a raw object.
   - Recommendation: Use `evt.detail.id.toString()` and `evt.detail.multiaddrs.map(m => m.toString())` defensively; add a runtime guard before attempting dial.

3. **Deduplication strategy for local-AND-peer results**
   - What we know: CONTEXT.md gives discretion; preference is to keep local with `_also_from_peers: [...]` annotation.
   - What's unclear: Whether to deduplicate by `node_id` (exact match) or by embedding distance (near-duplicate). Responding peers share `node_id` space only if they received the node via Y.js CRDT sync — otherwise IDs differ.
   - Recommendation: Deduplicate by exact `node_id` only. Near-duplicate detection is a v3 feature. If the same `node_id` appears from both local and peer, keep local entry, append peer's peerId to `_also_from_peers`.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test`) via `--test` flag |
| Config file | None — command in package.json: `node --import tsx --test tests/*.test.ts` |
| Quick run command | `node --import tsx --test tests/phase17.*.test.ts` |
| Full suite command | `npm test` (runs all `tests/*.test.ts`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FED-01 | `ask --peers` flag parsed, federated path invoked | unit | `node --import tsx --test tests/phase17.federated-search.test.ts` | Wave 0 |
| FED-02 | merged results ranked by distance ascending | unit | same | Wave 0 |
| FED-03 | `_source_peer` annotation present (null for local, peerId for remote) | unit | same | Wave 0 |
| FED-04 | `findTunnels` called over combined result set when tunnel candidates exist | unit | same | Wave 0 |
| FED-05 | `federated_search` MCP tool registered and returns correct shape | unit | `node --import tsx --test tests/phase17.mcp-tool.test.ts` | Wave 0 |
| DISC-01 | Manual peer add — already tested in phase15; no new test needed | — | `npm test` (regression) | ✅ |
| DISC-02 | mDNS config wiring — `createLibp2p` called with `peerDiscovery` array containing mdns when mdns enabled | unit (mock) | `node --import tsx --test tests/phase17.discovery.test.ts` | Wave 0 |
| DISC-03 | DHT disabled by default; enabled when `peer.dht.enabled: true` | unit (mock) | same | Wave 0 |
| DISC-04 | DEFERRED — no test needed | — | — | — |

### Sampling Rate
- **Per task commit:** `node --import tsx --test tests/phase17.*.test.ts`
- **Per wave merge:** `npm test` (full 127+ test suite, zero regressions)
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/phase17.federated-search.test.ts` — covers FED-01..04: fan-out logic (mocked peers), merge, annotation, tunnel pass-through
- [ ] `tests/phase17.mcp-tool.test.ts` — covers FED-05: McpServer with InMemoryTransport, federated_search tool registered and callable
- [ ] `tests/phase17.discovery.test.ts` — covers DISC-02, DISC-03: createNode config shape with mDNS/DHT toggles, PeerRecord discovery_method field, rate limiter token bucket

Test strategy for networking code: mock the libp2p node (`getPeers()`, `dialProtocol()`, `addEventListener`) — do not spin up real TCP listeners in unit tests. Phase 16 set this precedent (40 tests, all passing without network I/O).

---

## Sources

### Primary (HIGH confidence)
- npm registry `npm view @libp2p/mdns` — version 12.0.16, published 2026-04-08
- npm registry `npm view @libp2p/kad-dht` — version 16.2.0, published 2026-04-08
- npm registry `npm view @libp2p/bootstrap` — version 12.0.16, published 2026-04-08
- `src/infrastructure/vector-index.ts` — exact `VectorIndex` port interface + `toVecBuffer` helper
- `src/infrastructure/share-sync.ts` — `makeFramedStream`, `FramedStream`, `SubscribeRequest` framing pattern (Phase 16)
- `src/infrastructure/peer-transport.ts` — `createNode`, `createLibp2p` config shape
- `src/infrastructure/peer-store.ts` — `PeerRecord`, `mutatePeers`, `addPeerRecord`
- `src/domain/errors.ts` — all 6 error bounded contexts; `AppError` union; `formatError`
- `src/mcp/server.ts` — `buildMcpServer`, `server.registerTool` pattern, `okJson`/`errText` helpers
- `src/cli/commands/ask.ts` — `parseArgs` pattern, `ParsedArgs` interface, command structure

### Secondary (MEDIUM confidence — verified against official docs)
- [libp2p PEER_DISCOVERY.md](https://github.com/libp2p/js-libp2p/blob/main/doc/PEER_DISCOVERY.md) — auto-dial behavior, `minConnections`, `peer:discovery` event
- [libp2p CONFIGURATION.md](https://github.com/libp2p/js-libp2p/blob/main/doc/CONFIGURATION.md) — full `createLibp2p` example with mdns + dht services
- [libp2p mdns README](https://github.com/libp2p/js-libp2p/blob/main/packages/peer-discovery-mdns/README.md) — `mdns()` factory, `peerDiscovery` array
- [libp2p mdns source mdns.ts](https://github.com/libp2p/js-libp2p/blob/main/packages/peer-discovery-mdns/src/mdns.ts) — `MulticastDNSInit` interface, default interval 10000ms, `dispatchEvent` (not peerStore.merge)
- [libp2p kad-dht README](https://github.com/libp2p/js-libp2p/blob/main/packages/kad-dht/README.md) — `services: { dht: kadDHT() }`, `clientMode`, address mappers
- [libp2p bootstrap README](https://github.com/libp2p/js-libp2p/blob/main/packages/peer-discovery-bootstrap/README.md) — `peerDiscovery: [bootstrap({ list: [...] })]`, emits `peer:discovery` not auto-dial
- [libp2p discuss: bootstrap + kad-dht](https://discuss.libp2p.io/t/connect-libp2p-with-bootstrap-and-kad-dht/1940) — identify service required for DHT

### Tertiary (LOW confidence — WebSearch, flag for validation)
- [libp2p discuss: Docker containers](https://discuss.libp2p.io/t/running-libp2p-in-docker-containers/1608) — mDNS fails without `--network host` in Docker
- WebSearch summary: WSL2 mDNS requires mirrored mode (Docker Desktop 4.26+)

---

## Metadata

**Confidence breakdown:**
- Standard stack (new deps): HIGH — verified against npm registry on 2026-04-12; all three deps compatible with installed libp2p 3.2.x
- Architecture patterns: HIGH — derived directly from reading Phase 16 source code (share-sync.ts, server.ts, ask.ts, peer-transport.ts)
- mDNS wiring: HIGH — official README + source mdns.ts inspected; `MulticastDNSInit` interface confirmed
- kad-dht wiring: MEDIUM — official README verified; `identify` service dependency confirmed from forum source
- Token bucket: HIGH — hand-rolled pattern is simple and well-understood; 40-line implementation
- Docker/WSL pitfalls: LOW — forum sources only; no official doc confirmation
- `evt.detail` type in peer:discovery: MEDIUM — inferred from PeerInfo type in @libp2p/interface; needs runtime verification

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (libp2p 3.x stable; mdns/kad-dht patch-releases don't change API)
