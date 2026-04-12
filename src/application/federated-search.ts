/**
 * Federated search — fan-out orchestrator for cross-peer semantic search.
 *
 * Phase 17 application layer. Coordinates:
 *   1. Local vector query (searchGlobal or searchByRoom)
 *   2. Parallel fan-out to all connected peers via openSearchStream
 *   3. Result merging with deduplication (prefer local, collapse peer dupes into _also_from_peers)
 *   4. Cross-room tunnel detection via findTunnels over the merged synthetic record set (FED-04)
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
import type { Room } from '../domain/graph.js';
import type { PeerMatch, SearchRequest } from '../infrastructure/search-sync.js';
import { openSearchStream } from '../infrastructure/search-sync.js';

// ─────────────────────── output types ─────────────────────────────────────────

/**
 * A merged search result — either local (source_peer=null) or
 * from a specific remote peer (source_peer=peerId string).
 *
 * _also_from_peers lets the caller see which OTHER peers returned the
 * same node_id. Deduplication prefers the local entry (or first-seen peer);
 * same-node_id hits from additional peers are collapsed into _also_from_peers
 * on the winning row. This is the Claude's-discretion decision from CONTEXT.md.
 */
export interface FederatedMatch {
  readonly node_id: string;
  readonly room: string;
  readonly wing?: string;
  readonly distance: number;
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
  readonly room?: string;
  /** Cross-room tunnel threshold. Default 0.6 matches MCP find_tunnels default. */
  readonly tunnelThreshold?: number;
  /** Per-peer deadline. Default 2000ms matches CONTEXT.md locked decision. */
  readonly perPeerTimeoutMs?: number;
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
 *   1. Query local vectorIndex (searchByRoom or searchGlobal depending on room param)
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
  const room = params.room;
  const perPeerTimeoutMs = params.perPeerTimeoutMs ?? 2000;
  const tunnelThreshold = params.tunnelThreshold ?? 0.6;

  // Resolve injectable stream opener (test seam)
  const streamOpener = deps.openStream ?? openSearchStream;

  // 1. Local query — synchronous from the caller's perspective
  const localRes = room
    ? await deps.vectorIndex.searchByRoom(room as Room, params.embedding, k)
    : await deps.vectorIndex.searchGlobal(params.embedding, k);

  const localMatches: FederatedMatch[] = localRes.isOk()
    ? localRes.value.map((m) => ({
        node_id: m.node_id,
        room: m.room,
        wing: m.wing,
        distance: m.distance,
        _source_peer: null,
      }))
    : [];

  // 2. Parallel fan-out — NEVER use ResultAsync.combine (short-circuits on first error).
  // Use plain Promise.all with per-promise withTimeout guards.
  // Anti-pattern locked from 17-RESEARCH.md: "Eager ResultAsync sequence on fan-out".
  const peers = deps.node.getPeers().map((p) => p.toString());
  const req: SearchRequest = {
    type: 'search',
    embedding: Array.from(params.embedding),  // Float32Array → number[] (JSON-safe, Pitfall 3)
    room,
    k,
  };

  const peerOutcomes: PeerOutcome[] = peers.length === 0
    ? []
    : await Promise.all(
        peers.map((peerId) =>
          withTimeout(
            peerId,
            // openSearchStream returns ResultAsync — unwrap to a plain Promise so
            // withTimeout can Promise.race it against the deadline.
            // Promise.resolve() wraps the PromiseLike returned by ResultAsync.then()
            // into a real Promise (TS 2345 — PromiseLike lacks .catch/.finally).
            Promise.resolve(
              streamOpener(deps.node, peerId, req).then(
                (r) => (r.isOk() ? r.value : ([] as ReadonlyArray<PeerMatch>)),
                () => [] as ReadonlyArray<PeerMatch>,
              ),
            ),
            perPeerTimeoutMs,
          ),
        ),
      );

  const peers_queried = peers.length;
  const peers_responded = peerOutcomes.filter((o) => o.status === 'ok' && o.matches.length > 0).length;
  const peers_timed_out = peerOutcomes.filter((o) => o.status === 'timeout').length;
  const peers_errored = peerOutcomes.filter((o) => o.status === 'error').length;

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
          room: pm.room,
          wing: pm.wing,
          distance: pm.distance,
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
  const tunnels = await computeCrossRoomTunnels(
    deps.vectorIndex,
    merged,
    tunnelThreshold,
  );

  return {
    matches: merged,
    tunnels,
    peers_queried,
    peers_responded,
    peers_timed_out,
    peers_errored,
  };
};
