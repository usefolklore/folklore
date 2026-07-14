/**
 * Fetch sync — targeted node-body pull over libp2p.
 *
 * /folklore/search/1.0.0 returns POINTERS (node_id + metadata); this
 * protocol returns the BODY (`node.summary`) for specific node ids,
 * so a federated hit can actually be injected into an agent's context
 * and cached locally — the compounding loop. Sibling to recall/touch:
 *
 *   - search: "who has something relevant?"      (metadata only)
 *   - fetch:  "give me THOSE nodes"              (bounded, by id)
 *   - touch:  "give me your whole shared graph"  (heavy, bulk)
 *
 * Privacy boundary mirrors search/touch: per-node `private` gate at
 * the wire, all transmitted strings through the secrets redactor,
 * source_uri through the local-path sanitiser. Every node is signed
 * with the responder's peer key over a body-covering canonical form
 * (NODE_DOMAIN — not replayable as a search-match signature).
 */

import * as lp from 'it-length-prefixed';
import { ResultAsync } from 'neverthrow';
import type { Libp2p, Stream, Connection } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';
import type { SearchError } from '../domain/errors.js';
import { SearchError as SEARCH_ERR } from '../domain/errors.js';
import type { Graph, GraphEdge } from '../domain/graph.js';
import { bfs, getNode } from '../domain/graph.js';
import { redactNode } from '../domain/secret-gate.js';
import { buildPatterns } from '../domain/sharing.js';
import { signNode, type MatchAttestation } from '../domain/match-attestation.js';
import { createRateLimiter, type RateLimiter } from './search-sync.js';
import { sanitiseSourceUri } from './recall-sync.js';

type PatternSet = ReturnType<typeof buildPatterns>;

// ─────────────── constants ────────────────

export const FETCH_PROTOCOL_ID = '/folklore/fetch/1.0.0' as const;
const PER_PEER_TIMEOUT_MS = 2000;
const MAX_INBOUND_STREAMS = 16;
/** Hard cap on ids per request — fetch is targeted, not bulk (touch is bulk). */
export const MAX_FETCH_IDS = 10;
/** Bounded subgraph transplant: requested hits plus one-hop context. */
export const FETCH_SUBGRAPH_DEPTH = 1;
export const FETCH_SUBGRAPH_MAX_NODES = 48;
/** Per-node body cap on the wire. */
const SUMMARY_MAX_CHARS = 4000;
/** Request frame cap: 10 ids × 512 chars + envelope ≪ 16 KB. */
const REQ_MAX_BYTES = 16 * 1024;
/** Response frame cap: bounded subgraph, 48 nodes × ~5 KB plus edges. */
const RESP_MAX_BYTES = 512 * 1024;
/** Stricter than search — fetch reads bodies. */
const RATE_PER_SEC = 3;
const RATE_BURST = 6;

// ─────────────── wire shapes ──────────────

export interface FetchRequest {
  readonly type: 'fetch';
  readonly protocol_version: 5;
  readonly node_ids: readonly string[];
  /** Include bounded graph neighborhood around requested ids. Default true. */
  readonly include_neighbors?: boolean;
  readonly max_nodes?: number;
}

export interface FetchedNode {
  readonly node_id: string;
  readonly label?: string;
  readonly summary?: string;
  readonly source_uri?: string;
  readonly fetched_at?: string;
  /** Ed25519 over the node-level canonical form (covers summary). */
  readonly attestation?: MatchAttestation;
}

export interface FetchResponse {
  readonly type: 'fetch_ok';
  readonly protocol_version: 5;
  /** Requested ids that exist AND are shareable. Unknown or private
   *  ids are silently absent — absence is not an error. */
  readonly nodes: readonly FetchedNode[];
  /** Edges connecting the transmitted nodes. */
  readonly edges?: readonly GraphEdge[];
}

export interface FetchError {
  readonly type: 'fetch_err';
  readonly reason: 'rate_limited' | 'invalid_request';
}

export type FetchWire = FetchResponse | FetchError;

// ─────────────── frame helpers ────────────

const writeFrame = async (stream: Stream, payload: object): Promise<void> => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  for (const chunk of lp.encode([bytes])) {
    stream.send(chunk);
  }
};

const readFrame = async <T>(stream: Stream, maxBytes: number): Promise<T | null> => {
  for await (const msg of lp.decode(stream, { maxDataLength: maxBytes })) {
    const bytes = msg.subarray();
    if (bytes.byteLength > maxBytes) return null;
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as T;
    } catch {
      return null;
    }
  }
  return null;
};

// ─────────────── responder ────────────────

export interface FetchRegistryDeps {
  readonly node: Libp2p;
  /** Live graph getter — re-fetched per request so updates flow. */
  readonly getGraph: () => Promise<Graph | null>;
  /** Secrets patterns for outbound redaction (label + summary). */
  readonly secretsPatterns?: PatternSet;
  /** 32-byte Ed25519 seed for node attestation. */
  readonly signSeed?: Uint8Array;
  readonly log?: (msg: string) => void;
  /** Called after a successful serve with (peerId, nodesServed, nodeIds). >0
   *  means real inference was handed to a peer — drives the contribution ledger
   *  and the live feed. */
  readonly onServed?: (peer: string, count: number, nodeIds?: readonly string[]) => void;
}

const isValidRequest = (req: unknown): req is FetchRequest => {
  const r = req as FetchRequest | null;
  return (
    !!r &&
    r.type === 'fetch' &&
    r.protocol_version === 5 &&
    Array.isArray(r.node_ids) &&
    r.node_ids.length > 0 &&
    r.node_ids.length <= MAX_FETCH_IDS &&
    r.node_ids.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 512)
  );
};

/** Project one graph node to its wire form. null = not shareable. */
export const projectFetchedNode = (
  graph: Graph,
  nodeId: string,
  patterns: PatternSet | undefined,
  signSeed: Uint8Array | undefined,
  signedAt: string,
): FetchedNode | null => {
  const node = getNode(graph, nodeId);
  if (!node || node.private === true) return null;
  const clean = patterns ? redactNode(node, patterns).node : node;
  const fields = {
    node_id: nodeId,
    label: clean.label,
    summary: typeof clean.summary === 'string' ? (clean.summary as string).slice(0, SUMMARY_MAX_CHARS) : undefined,
    source_uri: sanitiseSourceUri(clean.source_uri),
    fetched_at: clean.fetched_at,
  };
  if (!signSeed) return fields;
  const sig = signNode(signSeed, fields, signedAt);
  return sig.isOk() ? { ...fields, attestation: sig.value } : fields;
};

export const collectFetchSubgraph = (
  graph: Graph,
  req: FetchRequest,
): { readonly nodeIds: readonly string[]; readonly edges: readonly GraphEdge[] } => {
  const maxNodes = Math.max(
    req.node_ids.length,
    Math.min(FETCH_SUBGRAPH_MAX_NODES, req.max_nodes ?? FETCH_SUBGRAPH_MAX_NODES),
  );
  if (req.include_neighbors === false) {
    return { nodeIds: req.node_ids.slice(0, maxNodes), edges: [] };
  }

  const sg = bfs(graph, req.node_ids, { depth: FETCH_SUBGRAPH_DEPTH });
  const nodeIds = sg.nodes.slice(0, maxNodes).map((n) => n.id);
  const allowed = new Set(nodeIds);
  const edges = sg.edges.filter((e) => allowed.has(e.source) && allowed.has(e.target));
  return { nodeIds, edges };
};

const projectFetchedEdge = (edge: GraphEdge): GraphEdge => ({
  source: edge.source,
  target: edge.target,
  relation: edge.relation,
  confidence: edge.confidence,
  source_file: 'peer-subgraph',
  ...(typeof edge.confidence_score === 'number' ? { confidence_score: edge.confidence_score } : {}),
});

export const registerFetchProtocol = (deps: FetchRegistryDeps): void => {
  const log = deps.log ?? (() => undefined);
  const limiter: RateLimiter = createRateLimiter(RATE_PER_SEC, RATE_BURST);
  void deps.node.handle(
    FETCH_PROTOCOL_ID,
    async (stream: Stream, connection: Connection) => {
      const peerIdStr = connection.remotePeer.toString();
      try {
        if (!limiter.consume(peerIdStr)) {
          await writeFrame(stream, { type: 'fetch_err', reason: 'rate_limited' } satisfies FetchError);
          return;
        }
        const req = await readFrame<FetchRequest>(stream, REQ_MAX_BYTES);
        if (!isValidRequest(req)) {
          await writeFrame(stream, { type: 'fetch_err', reason: 'invalid_request' } satisfies FetchError);
          return;
        }
        const graph = await deps.getGraph();
        if (!graph) {
          // Transient responder-side state — close silently so the
          // asker times out and retries later (same recall decision).
          log(`fetch responder ← peer=${peerIdStr.slice(0, 12)} graph_unloaded`);
          return;
        }
        const signedAt = new Date().toISOString();
        const subgraph = collectFetchSubgraph(graph, req);
        const nodes = subgraph.nodeIds
          .map((id) => projectFetchedNode(graph, id, deps.secretsPatterns, deps.signSeed, signedAt))
          .filter((n): n is FetchedNode => n !== null);
        const served = new Set(nodes.map((n) => n.node_id));
        const edges = subgraph.edges
          .filter((e) => served.has(e.source) && served.has(e.target))
          .map(projectFetchedEdge);
        await writeFrame(stream, {
          type: 'fetch_ok',
          protocol_version: 5,
          nodes,
          edges,
        } satisfies FetchResponse);
        log(`fetch responder ← peer=${peerIdStr.slice(0, 12)} asked=${req.node_ids.length} served=${nodes.length} edges=${edges.length}`);
        deps.onServed?.(peerIdStr, nodes.length, nodes.map((n) => n.node_id));
      } catch (e) {
        log(`fetch responder error: ${(e as Error).message}`);
      } finally {
        await stream.close().catch(() => { /* benign */ });
      }
    },
    { maxInboundStreams: MAX_INBOUND_STREAMS },
  );
};

export const unregisterFetchProtocol = (node: Libp2p): ResultAsync<void, SearchError> =>
  ResultAsync.fromPromise(
    node.unhandle(FETCH_PROTOCOL_ID),
    (e) => SEARCH_ERR.protocolError('local', `unhandle() failed: ${(e as Error).message}`),
  );

// ─────────────── outbound dial ────────────

const withTimeout = <T>(p: Promise<T>, ms: number, peer: string): Promise<T> =>
  Promise.race<T>([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`fetch timeout peer=${peer}`)), ms),
    ),
  ]);

/**
 * Dial FETCH_PROTOCOL_ID on `peerId`, request up to MAX_FETCH_IDS
 * node bodies, return the decoded wire object. Failure (timeout,
 * dial, parse) resolves the Result error channel; the caller treats
 * it as "peer could not serve" and moves on.
 */
export const openFetchStream = (
  node: Libp2p,
  peerIdStr: string,
  nodeIds: readonly string[],
): ResultAsync<FetchWire | null, SearchError> =>
  ResultAsync.fromPromise(
    (async () => {
      const pid = peerIdFromString(peerIdStr);
      const stream = await withTimeout(
        node.dialProtocol(pid, FETCH_PROTOCOL_ID),
        PER_PEER_TIMEOUT_MS,
        peerIdStr,
      );
      try {
        const req: FetchRequest = {
        type: 'fetch',
        protocol_version: 5,
        node_ids: nodeIds.slice(0, MAX_FETCH_IDS),
        include_neighbors: true,
        max_nodes: FETCH_SUBGRAPH_MAX_NODES,
      };
        await writeFrame(stream, req);
        return await withTimeout(
          readFrame<FetchWire>(stream, RESP_MAX_BYTES),
          PER_PEER_TIMEOUT_MS,
          peerIdStr,
        );
      } finally {
        await stream.close().catch(() => { /* benign */ });
      }
    })(),
    (e) => SEARCH_ERR.protocolError('local', (e as Error).message),
  );
