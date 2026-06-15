/**
 * Federated search — fan-out orchestrator for cross-peer semantic search.
 *
 * Phase 17 application layer; V5 envelope cutover Phase 24-03 (ROOMS-DEL-05).
 * V5: no `room` parameter on the request. Read-side workspace pre-filtering
 * happens at the CALLER (Wave 3) before fan-out, not on the wire.
 *
 * Coordinates:
 *   1. Local vector query (searchGlobal — V5 has no room dimension)
 *   2. Parallel fan-out to all connected peers via openSearchStream
 *   3. Result merging with deduplication (prefer local, collapse peer dupes into _also_from_peers)
 *   4. Tunnel detection via findTunnels over the merged synthetic record set (FED-04)
 *
 * CRITICAL invariants:
 *   1. Fan-out MUST use Promise.all with per-promise Promise.race timeout — NOT
 *      ResultAsync.combine/ResultAsync.combineWithAllErrors which short-circuit on
 *      first failure and block the entire fan-out (Research anti-pattern from 17-RESEARCH.md:
 *      "Eager ResultAsync sequence on fan-out").
 *
 *   2. Per-peer timeout is 2000ms (CONTEXT.md locked). Degraded peers do not block
 *      the query. Each peer outcome is tagged ok|timeout|error for diagnostics.
 *
 *   3. No Y.Doc mutations, no REMOTE_ORIGIN, no CRDT. This is a pure read-only path.
 *
 *   4. Tunnel detection (FED-04) runs over local vectors only for merged matches.
 *      Remote-only rows are skipped because raw vectors are not transmitted across
 *      the wire (SEC-03 boundary). This is a functional subset — documented, not a bug.
 *
 *   5. Dependency injection: openSearchStream is injectable (optional dep) for unit
 *      testability. Tests can mock it to avoid real libp2p dials.
 */
import type { Libp2p } from '@libp2p/interface';
import type { VectorIndex } from '../infrastructure/vector-index.js';
import type { Vector, Tunnel, VectorRecord } from '../domain/vectors.js';
import { findTunnels as findTunnelsPure } from '../domain/vectors.js';
import type { PeerMatch, SearchRequest } from '../infrastructure/search-sync.js';
import { openSearchStream, SEARCH_PROTOCOL_VERSION } from '../infrastructure/search-sync.js';
import { askGossip } from '../infrastructure/search-gossip.js';
import { publicKeyFromPeerId } from '../infrastructure/peer-transport.js';
import { verifyMatch } from '../domain/match-attestation.js';

/**
 * Asker-side attestation verdict for one wire match.
 * undefined = unsigned; false = claimed-but-invalid (treat as worse
 * than unsigned — the peer either tampered or signed sloppily).
 * Public keys come straight out of Ed25519 peer ids.
 */
const verifyMatchAttestation = (
  peerId: string,
  pm: Pick<PeerMatch, 'node_id' | 'label' | 'source_uri' | 'fetched_at' | 'attestation'>,
): boolean | undefined => {
  if (!pm.attestation) return undefined;
  const pub = publicKeyFromPeerId(peerId);
  if (!pub) return false;
  return verifyMatch(
    pub,
    { node_id: pm.node_id, label: pm.label, source_uri: pm.source_uri, fetched_at: pm.fetched_at },
    pm.attestation,
  );
};

// ─────────────────────── output types ─────────────────────────────────────────

/**
 * A merged search result — either local (source_peer=null) or
 * from a specific remote peer (source_peer=peerId string).
 *
 * V5 (Phase 24-03): no `room` field. Local-side workspace filtering happens
 * at the read caller before the search runs.
 *
 * _also_from_peers lets the caller see which OTHER peers returned the
 * same node_id. Deduplication prefers the local entry (or first-seen peer);
 * same-node_id hits from additional peers are collapsed into _also_from_peers
 * on the winning row. This is the Claude's-discretion decision from CONTEXT.md.
 */
export interface FederatedMatch {
  readonly node_id: string;
  readonly wing?: string;
  readonly distance: number;
  /** Wire-carried metadata from the responding peer (absent on local
   *  hits — the caller reads those from its own graph). */
  readonly label?: string;
  readonly source_uri?: string;
  readonly fetched_at?: string;
  /**
   * Attestation verdict, asker-side. true = the peer's Ed25519
   * signature over the transmitted metadata verified against the key
   * in its peer id; false = a signature was claimed but did NOT
   * verify (tamper / wrong key — worse than absent); undefined =
   * unsigned (peer predates signing) or local hit.
   */
  readonly _sig_valid?: boolean;
  readonly _source_peer: string | null;
  readonly _also_from_peers?: readonly string[];
}

export interface FederatedSearchResult {
  readonly matches: readonly FederatedMatch[];
  readonly tunnels: readonly Tunnel[];
  readonly peers_queried: number;
  readonly peers_responded: number;
  readonly peers_timed_out: number;
  readonly peers_errored: number;
  /**
   * Wire-level telemetry — populated unconditionally so callers can
   * surface a peer-pull block into the agent session. Enrichment and
   * satisfaction scoring happen at the call site (MCP / CLI / hook)
   * where the GraphRepository is available.
   */
  readonly _telemetry: {
    readonly took_total_ms: number;
    readonly took_local_ms: number;
    readonly took_fanout_ms: number;
    readonly took_merge_ms: number;
    readonly bytes_received_estimate: number;
    readonly peers_alive: number;
  };
}

export interface FederatedSearchDeps {
  readonly node: Libp2p;
  readonly vectorIndex: VectorIndex;
  /**
   * Injectable override for openSearchStream — allows unit tests to mock
   * the outbound stream without a real libp2p node.
   * Defaults to the real openSearchStream from search-sync.ts.
   */
  readonly openStream?: typeof openSearchStream;
}

export interface FederatedSearchParams {
  readonly embedding: Vector;     // Float32Array, length === DEFAULT_DIM
  readonly k: number;
  /**
   * Raw query text for the local-half hybrid (vector + BM25) lookup. When
   * omitted, local search falls back to vector-only. Peers still receive
   * only the embedding (SEC-03 boundary — raw text does not cross the
   * wire); this field exists for the LOCAL half, which has the text
   * in-process anyway.
   */
  readonly text?: string;
  /** Cross-room tunnel threshold. Default 0.6 matches MCP find_tunnels default. */
  readonly tunnelThreshold?: number;
  /**
   * Skip the cross-room tunnel pass at the end of the merge.
   * Tunnel detection runs findTunnelsPure on the merged result set,
   * which on a 5–10 hit return adds ~150-250ms because it embeds
   * pairs of records and compares. The agent contract block does
   * not currently use tunnel output; --peers callers should set
   * this to true to skip the cost.
   */
  readonly skipTunnels?: boolean;
  /** Per-peer deadline. Default 2000ms matches CONTEXT.md locked decision. */
  readonly perPeerTimeoutMs?: number;
  /**
   * Optional peer-ordering callback. When supplied, the connected
   * peer list is passed through this function before fan-out — the
   * reputation system uses it to bubble high-rep peers to the front
   * (with an epsilon-greedy floor so unknown peers still get
   * sampled). Pure: no I/O, no clock dependence at this layer; the
   * caller closes any reputation/ranking state into the closure.
   *
   * Default behaviour (no callback) preserves the libp2p-native peer
   * order — backwards compatible with every existing test.
   */
  readonly peerOrder?: (peerIds: readonly string[]) => readonly string[];
  /**
   * Optional cap on how many peers to fan out to. After `peerOrder`
   * runs, the top `maxPeers` are queried; the rest are skipped.
   *
   * The mechanism that actually spreads load (combined with the rep
   * system's load_factor in rank_score): top-rep peers get the
   * fan-out budget; medium-rep peers stay idle this round; over time
   * the load_factor decays a peer that's been hit recently and the
   * rotation continues organically.
   *
   * Defaults to no cap (current behaviour — fan out to every
   * connected peer). When set with a low rank-budget alongside, the
   * combined effect is "ask top-3 peers fully; ask top-8 peers with
   * a tighter timeout; skip the rest."
   */
  readonly maxPeers?: number;
  /**
   * Tier-2 timeout for peers ranked between TIER_1_COUNT and
   * `maxPeers`. Lets the federated layer give your top-N peers the
   * full 2 s budget while still sampling tier-2 peers under a
   * shorter (e.g. 700 ms) deadline. When omitted, every peer gets
   * the full `perPeerTimeoutMs`.
   */
  readonly lowRankTimeoutMs?: number;
  /**
   * How many peers count as the "top tier" that get the full
   * `perPeerTimeoutMs`. Default 3 — every peer beyond this gets
   * `lowRankTimeoutMs` if it's set. Ignored when `lowRankTimeoutMs`
   * is undefined.
   */
  readonly topTierCount?: number;
  /**
   * P2P-scale phase 1 — use pubsub broadcast for fan-out instead of
   * per-peer dialProtocol. Default true (gossip-first). When the
   * gossip collector returns zero responses, the call falls through
   * to the legacy per-peer dial path so a missing pubsub service
   * never strands the request.
   */
  readonly useGossip?: boolean;
  /**
   * Collector window for gossip fan-out. Default 200 ms.
   * Lower for tighter latency, higher for larger swarms (10k peers
   * need ~300 ms floodsub propagation, ~80 ms gossipsub mesh).
   */
  readonly gossipWindowMs?: number;
  /**
   * Tail-aware merge cap (audit fold-in): never let a single peer
   * contribute more than ⌈k/peerDiversityDivisor⌉ matches to the
   * final top-k. Default 3 — i.e. top-3 peers collectively cannot
   * monopolise more than k. Disabled by setting to Infinity.
   */
  readonly peerDiversityDivisor?: number;
}

// ─────────────────────── per-peer timeout helper ──────────────────────────────

/**
 * Outcome of a single peer's fan-out attempt.
 * status: 'ok' = responded with matches (may be empty), 'timeout' = 2s exceeded,
 *         'error' = dial or protocol error.
 */
interface PeerOutcome {
  readonly peerId: string;
  readonly status: 'ok' | 'timeout' | 'error';
  readonly matches: ReadonlyArray<PeerMatch>;
}

/**
 * Race a peer stream against a timeout.
 *
 * Pattern 2 (17-RESEARCH.md): Promise.race is the correct tool here —
 * NOT ResultAsync.combine which short-circuits on first error, killing the
 * fan-out for all remaining peers when one peer fails.
 *
 * Error handling: if `work` rejects, the outcome is tagged 'error' (not 'timeout').
 * Both cases produce empty matches — the difference is visible in the diagnostic
 * counters (peers_timed_out vs peers_errored) in FederatedSearchResult.
 */
const withTimeout = (
  peerId: string,
  work: Promise<ReadonlyArray<PeerMatch>>,
  ms: number,
): Promise<PeerOutcome> =>
  Promise.race<PeerOutcome>([
    work.then(
      (matches) => ({ peerId, status: 'ok' as const, matches }),
      () => ({ peerId, status: 'error' as const, matches: [] }),
    ),
    new Promise<PeerOutcome>((resolve) =>
      setTimeout(() => resolve({ peerId, status: 'timeout' as const, matches: [] }), ms),
    ),
  ]);

// ─────────────────────── tunnel detection helper ──────────────────────────────

/**
 * Cross-room tunnel pass over the merged match set.
 *
 * FED-04 implementation: "run existing findTunnels over the combined result set
 * as a synthetic one-shot graph" (CONTEXT.md). Since raw vectors are not
 * transmitted across the wire (SEC-03 boundary), we pull local vectors from the
 * vector index for rows that exist locally and SKIP peer-only rows.
 *
 * This is a functional subset — documented, not a bug. Phase 18+ can add
 * optional vector transmission for full cross-peer tunnel detection.
 */
const computeCrossRoomTunnels = async (
  vectorIndex: VectorIndex,
  merged: readonly FederatedMatch[],
  threshold: number,
): Promise<readonly Tunnel[]> => {
  // Pull every local vector record once — acceptable for Phase 17 volumes.
  // Phase 18+ could cache this or use a targeted per-node_id lookup.
  const allRes = await vectorIndex.all();
  if (allRes.isErr()) return [];
  const localById = new Map<string, VectorRecord>();
  for (const r of allRes.value) localById.set(r.node_id, r);

  // Build the synthetic record set: for each merged match, use the local
  // vector if available, skip peer-only rows (no vector on hand).
  const synthetic: VectorRecord[] = [];
  for (const m of merged) {
    const local = localById.get(m.node_id);
    if (local) synthetic.push(local);
  }

  // findTunnelsPure is O(n²) over the synthetic set (typically k ≤ 50 for Phase 17).
  return findTunnelsPure(synthetic, threshold);
};

// ─────────────────────── main orchestrator ────────────────────────────────────

/**
 * Run a federated search across the local vector index and all connected peers.
 *
 * Steps:
 *   1. Query local vectorIndex (searchGlobal / searchHybrid — V5 has no room param)
 *   2. Parallel fan-out: send SearchRequest to all connected peers via openSearchStream,
 *      each wrapped in withTimeout(2000ms). Uses Promise.all — NOT ResultAsync.combine.
 *   3. Merge local + remote results, dedupe by node_id (prefer local), sort by distance,
 *      slice to top-k. Duplicate peer hits collapsed into _also_from_peers.
 *   4. Tunnel detection: findTunnels over the merged synthetic record set (FED-04).
 *   5. Return FederatedSearchResult with matches, tunnels, and diagnostic counters.
 *
 * When no peers are connected: returns local-only results with peers_queried=0.
 * When a peer errors or times out: its matches are empty; it contributes to
 * peers_timed_out or peers_errored counters.
 */
export const runFederatedSearch = async (
  deps: FederatedSearchDeps,
  params: FederatedSearchParams,
): Promise<FederatedSearchResult> => {
  const k = params.k;
  const perPeerTimeoutMs = params.perPeerTimeoutMs ?? 2000;
  const tunnelThreshold = params.tunnelThreshold ?? 0.6;

  // Resolve injectable stream opener (test seam)
  const streamOpener = deps.openStream ?? openSearchStream;

  const t0 = Date.now();

  // 1. Local query — V5 has no room dimension. Use the hybrid (BM25 + vector
  // + RRF) path whenever the caller supplied the raw text. Hybrid is what
  // the non-federated `searchGlobal` use case calls — without it, federated
  // local-half would silently diverge in retrieval quality from the local-
  // only `ask` path (bug caught while wiring the v2.1 smart-hook to consult
  // peers by default).
  //
  // Workspace pre-filter (when present) is applied at the read CALLER site
  // (Wave 3), BEFORE this function runs — federated-search itself stays
  // workspace-agnostic.
  const localRes = params.text
    ? await deps.vectorIndex.searchHybrid(params.text, params.embedding, k)
    : await deps.vectorIndex.searchGlobal(params.embedding, k);

  const localMatches: FederatedMatch[] = localRes.isOk()
    ? localRes.value.map((m) => ({
        node_id: m.node_id,
        wing: m.wing,
        distance: m.distance,
        _source_peer: null,
      }))
    : [];

  const t1 = Date.now();

  // 2a. P2P-scale phase 1 — pubsub fan-out (gossip-first).
  //
  // Replaces N × dialProtocol with one publish + one collector window.
  // Falls through to the legacy per-peer dial path if the gossip
  // collector returns zero responses (no pubsub service, no peers
  // subscribed yet, or floodsub propagation budget exhausted).
  //
  // Tail-aware merge: cap each peer's contribution to ⌈k/divisor⌉
  // so the top-k can't be monopolised by the closest-latency peer
  // returning a stack of near-duplicates. Audit fold-in from
  // .planning/p2p-scale-plan.md Phase 1 mod.
  const gossipDisabled = params.useGossip === false
    || process.env.FOLKLORE_SEARCH_GOSSIP === '0';
  let gossipPeerOutcomes: PeerOutcome[] | null = null;

  if (!gossipDisabled) {
    // Early-exit hint — pass an explicit maxPeers cap when the caller
    // supplied one. Otherwise leave the collector to drain the window:
    // swarm-sim responders can emit many more responses than there
    // are connected libp2p peers, and we don't want to short-circuit
    // those out. Larger swarms set gossipWindowMs to a higher value
    // (e.g. 300ms for a 100-peer swarm).
    const gossipRes = await askGossip(
      deps.node,
      params.embedding,
      k,
      {
        // Default 250ms — covers floodsub on a LAN mesh + parallel
        // swarm-responder publish bursts. Tighter latency target?
        // Set params.gossipWindowMs explicitly.
        windowMs: params.gossipWindowMs ?? 250,
        maxPeerResponses: typeof params.maxPeers === 'number' && params.maxPeers > 0
          ? params.maxPeers
          : undefined,
      },
    );
    if (gossipRes.isOk() && gossipRes.value.responses.length > 0) {
      const divisor = params.peerDiversityDivisor ?? 3;
      const perPeerCap = Number.isFinite(divisor) && divisor > 0
        ? Math.max(1, Math.ceil(k / divisor))
        : Number.POSITIVE_INFINITY;
      gossipPeerOutcomes = gossipRes.value.responses.map((r) => ({
        peerId: r.peer_id,
        matches: r.matches.slice(0, perPeerCap) as ReadonlyArray<PeerMatch>,
        status: 'ok' as const,
      }));
    }
  }

  // 2b. Legacy parallel fan-out — used when gossip is disabled OR
  // returned no responses. NEVER use ResultAsync.combine (short-circuits
  // on first error). Plain Promise.all with per-promise withTimeout.
  const rawPeers = deps.node.getPeers().map((p) => p.toString());
  // Reputation ordering hook — caller may bubble high-rep peers to
  // the front with an epsilon-greedy floor. Defaults to libp2p's
  // native order.
  const orderedPeers = params.peerOrder ? params.peerOrder(rawPeers) : rawPeers;
  // Top-N cap — the actual load-spreading mechanism alongside the
  // rep system's load_factor. After ordering, only the top
  // `maxPeers` get queried; the rest are skipped this round and
  // their rank decays naturally. No cap (default) preserves the
  // current "ask everyone" behaviour.
  const peers = typeof params.maxPeers === 'number' && params.maxPeers > 0
    ? orderedPeers.slice(0, params.maxPeers)
    : orderedPeers;
  const topTierCount = params.topTierCount ?? 3;
  const peerBudgetMs = (idx: number): number =>
    params.lowRankTimeoutMs !== undefined && idx >= topTierCount
      ? params.lowRankTimeoutMs
      : perPeerTimeoutMs;
  const req: SearchRequest = {
    type: 'search',
    protocol_version: SEARCH_PROTOCOL_VERSION,
    embedding: Array.from(params.embedding),  // Float32Array → number[] (JSON-safe, Pitfall 3)
    k,
  };

  const peerOutcomes: PeerOutcome[] = gossipPeerOutcomes !== null
    ? gossipPeerOutcomes
    : peers.length === 0
    ? []
    : await Promise.all(
        peers.map((peerId, idx) =>
          withTimeout(
            peerId,
            Promise.resolve(
              streamOpener(deps.node, peerId, req).then(
                (r) => (r.isOk() ? r.value : ([] as ReadonlyArray<PeerMatch>)),
                () => [] as ReadonlyArray<PeerMatch>,
              ),
            ),
            // Tier-aware budget: top-tier peers (idx < topTierCount)
            // get the full perPeerTimeoutMs; tier-2 peers get the
            // tighter `lowRankTimeoutMs` if set.
            peerBudgetMs(idx),
          ),
        ),
      );

  // peers_queried bookkeeping
  // ─────────────────────────
  // On the gossip path, the asker fans out via a single publish; the
  // responders are whoever subscribes to the request topic and chooses
  // to answer (including swarm-sim virtual peers behind one physical
  // daemon). Reporting peers_queried = peers.length (real libp2p
  // connections) would understate the cooperating set when the
  // responders outnumber the directly-connected peers. Use the
  // outcome count when it exceeds the direct-peer count — that's the
  // honest answer to "how many peers were asked AND chose to answer."
  const peers_queried = gossipPeerOutcomes !== null
    ? Math.max(peers.length, peerOutcomes.length)
    : peers.length;
  const peers_responded = peerOutcomes.filter((o) => o.status === 'ok' && o.matches.length > 0).length;
  const peers_timed_out = peerOutcomes.filter((o) => o.status === 'timeout').length;
  const peers_errored = peerOutcomes.filter((o) => o.status === 'error').length;

  // Bytes-received estimate: sum of JSON-encoded peer match payloads.
  // PeerMatch is a small object (node_id ≈ 36, room ≈ 12, wing ≈ 12,
  // distance + commas + braces ≈ 30 → ~90 B per row at the 50th
  // percentile). JSON.stringify gives a fair upper bound without
  // forcing the wire layer to expose a byte counter.
  const bytes_received_estimate = peerOutcomes.reduce(
    (acc, o) => acc + (o.matches.length === 0 ? 0 : JSON.stringify(o.matches).length),
    0,
  );

  const t2 = Date.now();

  // 3. Merge — dedupe by node_id preferring local, collapse peer dupes into _also_from_peers
  const byId = new Map<string, FederatedMatch>();
  for (const m of localMatches) {
    byId.set(m.node_id, m);
  }
  for (const outcome of peerOutcomes) {
    for (const pm of outcome.matches) {
      const existing = byId.get(pm.node_id);
      if (!existing) {
        byId.set(pm.node_id, {
          node_id: pm.node_id,
          wing: pm.wing,
          distance: pm.distance,
          label: pm.label,
          source_uri: pm.source_uri,
          fetched_at: pm.fetched_at,
          _sig_valid: verifyMatchAttestation(outcome.peerId, pm),
          _source_peer: outcome.peerId,
        });
      } else {
        // Duplicate — prefer the existing entry (local or first-seen peer),
        // append this peer to _also_from_peers (CONTEXT.md discretion decision).
        const already = existing._also_from_peers ?? [];
        byId.set(pm.node_id, {
          ...existing,
          _also_from_peers: [...already, outcome.peerId],
        });
      }
    }
  }

  const merged = Array.from(byId.values())
    .sort((a, b) => a.distance - b.distance)
    .slice(0, k);

  // 4. Tunnel detection over the merged synthetic set (FED-04).
  // findTunnelsPure requires VectorRecord[] with `vector` field. We don't have
  // raw vectors from peers — tunnel pass uses local vectors only for merged matches.
  // Peer-only entries are skipped (see computeCrossRoomTunnels comment).
  //
  // Skip path: when params.skipTunnels is set (eg --peers callers), we
  // omit the tunnel pass entirely. Cuts ~150-250ms off the wallclock
  // for federated queries that don't render tunnel output.
  const tunnels = params.skipTunnels
    ? []
    : await computeCrossRoomTunnels(
        deps.vectorIndex,
        merged,
        tunnelThreshold,
      );

  const t3 = Date.now();

  return {
    matches: merged,
    tunnels,
    peers_queried,
    peers_responded,
    peers_timed_out,
    peers_errored,
    _telemetry: {
      took_total_ms: t3 - t0,
      took_local_ms: t1 - t0,
      took_fanout_ms: t2 - t1,
      took_merge_ms: t3 - t2,
      bytes_received_estimate,
      // peers_alive — currently == peers_queried because we fan out to
      // every connected peer. When v4.x adds DHT-aware peer selection
      // this will diverge: peers_alive = swarm size, peers_queried = subset.
      peers_alive: peers_queried,
    },
  };
};
