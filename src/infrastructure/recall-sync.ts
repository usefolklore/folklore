/**
 * Recall sync — federated entity recall over libp2p.
 *
 * Sibling protocol to /akashik/search/1.0.0. The architectural
 * review (data + solution architects, both converged) said: ship
 * recall as its OWN protocol. Reasons:
 *
 *   - Wire shape is genuinely different (entity_id string vs
 *     embedding number[384]).
 *   - Lifecycle independence — separate rate limit, separate ACL
 *     decisions later.
 *   - Mirrors how /akashik/touch/1.0.0 sits next to /search.
 *
 * Privacy boundary (V5):
 *   - Sender ships a CANONICAL entity_id (e.g. 'entity:product:lemlist').
 *     The slug function in src/domain/entity.ts is deterministic,
 *     so two peers that both registered "Lemlist" arrive at the
 *     same id without exchanging aliases.
 *   - Receiver applies the per-node sharing gate: only `mentions`
 *     edges whose source chunk has `node.private === false` are
 *     surfaced. The legacy shared-rooms gate is gone — Plan 06
 *     replaced it with the node-level private flag (binary).
 *   - The `surface` text on a mention edge is user prose ("lemlist
 *     is overpriced") — never transmitted. Only the chunk's
 *     metadata (label, source_uri, age_days) crosses.
 *
 * Pure transport. The fan-out orchestration lives in
 * application/federated-recall.ts; this file is libp2p-only.
 */

import { createHmac, randomBytes } from 'node:crypto';
import * as lp from 'it-length-prefixed';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { Libp2p, Stream, Connection } from '@libp2p/interface';
import { peerIdFromString } from '@libp2p/peer-id';
import type { Graph, GraphEdge, GraphNode } from '../domain/graph.js';
import { edgesByRelationAndTarget } from '../domain/graph.js';
import { SearchError as SEARCH_ERR, type SearchError } from '../domain/errors.js';

// ─────────────── constants ────────────────

export const RECALL_PROTOCOL_ID = '/akashik/recall/1.0.0' as const;
const PER_PEER_TIMEOUT_MS = 2000;
const MAX_INBOUND_STREAMS = 16;
const MAX_LIMIT = 50;
/**
 * Hard cap on inbound frame size in bytes. A V5 RecallRequest is
 * small (entity_id ≤ 256 chars + integer limit + JSON overhead —
 * typically <1 KB). 4 KB leaves slack without giving an attacker
 * room to push a 10 MB JSON.parse at the responder. Caught by the
 * multi-LLM review.
 */
const MAX_INBOUND_FRAME_BYTES = 4096;
/**
 * Per-token-bucket rate limit on inbound recall requests (mirrors
 * search-sync's pattern). Without this, any connected peer could
 * drive continuous graph loads, share-store reads, and inbound
 * mention-index walks at the responder.
 */
const RATE_PER_SEC = 5;
const RATE_BURST = 10;
const RATE_IDLE_EVICT_MS = 5 * 60 * 1000;

// ─────────────── wire shapes ──────────────

export interface RecallRequest {
  readonly type: 'recall';
  readonly entity_id: string;
  readonly limit: number;
}

export interface RecallPeerHit {
  readonly node_id: string;
  readonly label: string;
  readonly source_uri?: string;
  readonly fetched_at?: string;
  readonly age_days?: number;
}

export interface RecallResponse {
  readonly type: 'recall_ok';
  readonly entity_id: string;
  readonly mention_count: number;       // peer's own count, not aggregate
  readonly hits: readonly RecallPeerHit[];
}

export interface RecallError {
  readonly type: 'recall_err';
  // V5: 'unauthorized_room' retired with the rooms abstraction.
  readonly reason: 'unknown_entity' | 'unauthorized' | 'rate_limited' | 'invalid_request';
}

type RecallWire = RecallResponse | RecallError;

// ─────────────── frame helpers ────────────

const writeFrame = async (stream: Stream, payload: object): Promise<void> => {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  // lp.encode over an in-memory array is a synchronous iterable.
  for (const chunk of lp.encode([bytes])) {
    stream.send(chunk);
  }
};

const readFrame = async <T>(stream: Stream, maxBytes: number): Promise<T | null> => {
  // `maxDataLength` makes lp.decode itself reject oversize frames
  // before any application buffer holds them — gemini synthesis
  // BLOCKER on recall-sync.ts:105. The post-decode `byteLength`
  // check stays as defense-in-depth (e.g. if a future libp2p
  // version changes the option semantics).
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

export interface RecallResponderDeps {
  /** Loaded graph snapshot — passed by the daemon's request handler. */
  readonly graph: Graph;
  /** ms-since-epoch for age computation. */
  readonly now: () => number;
}

/**
 * Allowlisted URI schemes that are safe to transmit. Local
 * filesystem paths (file://, /Users/..., absolute /paths) leak the
 * asker's homedir + project layout when the asker has indexed
 * private code into a shared room — caught by the multi-LLM review.
 *
 * Anything outside this set is dropped from the wire (the hit still
 * goes back, just without the URI). The label + room + age give
 * enough context for downstream filtering without the leak.
 */
const SAFE_URI_PREFIXES = [
  'http://',
  'https://',
  'github.com/',
  'arxiv:',
  'doi:',
  'urn:',
  'mailto:',
];

const isLocalPath = (s: string): boolean => {
  const lower = s.toLowerCase();
  return (
    lower.startsWith('file://') ||
    s.startsWith('/') ||                       // unix absolute
    s.startsWith('./') ||                      // relative-current  (gemini MED)
    s.startsWith('../') ||                     // relative-parent
    /^[a-z]:[\\/]/i.test(s) ||                 // windows
    // Anything with a path separator that didn't match SAFE_URI_PREFIXES
    // upstream is treated as a local path. This catches things like
    // `src/foo/bar.ts` that the codex sanitiser missed.
    /[\\/]/.test(s)
  );
};

const sanitiseSourceUri = (raw: unknown): string | undefined => {
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  const lower = raw.toLowerCase();
  return SAFE_URI_PREFIXES.some((p) => lower.startsWith(p)) ? raw : undefined;
};

/**
 * Per-process secret used to HMAC opaque ids. Generated once on first
 * use, kept in memory only — never logged, never persisted, never
 * transmitted. Two effects:
 *
 *   - Within a single process lifetime, the same local path → same
 *     opaque id (so cross-peer dedupe still works for the duration
 *     of one daemon run).
 *   - Across processes / peers, the SAME local path → DIFFERENT
 *     opaque ids — preventing a peer from rebuilding a rainbow table
 *     and reverse-mapping ids to filesystem layouts.
 *
 * The 32-bit DJB2 hash this replaced was reversible by an attacker
 * with a few thousand candidate paths. Gemini synthesis HIGH on
 * recall-sync.ts:172.
 */
let nodeSecret: Buffer | null = null;
const getNodeSecret = (): Buffer => {
  if (!nodeSecret) nodeSecret = randomBytes(32);
  return nodeSecret;
};

/**
 * Stable opaque hash of a node_id used for cross-peer dedupe when the
 * underlying id contains a local path. HMAC-SHA256 truncated to 16
 * hex chars (8 bytes / 64 bits) — roughly 2^32 birthday-resistance,
 * plenty for dedupe within a single peer's result set without
 * shipping the full 64 hex chars.
 */
const opaqueId = (raw: string): string => {
  const mac = createHmac('sha256', getNodeSecret()).update(raw).digest('hex');
  return `node:${mac.slice(0, 16)}`;
};

const sanitiseNodeId = (id: string): string =>
  isLocalPath(id) ? opaqueId(id) : id;

/**
 * Sanitise the chunk label before transmission. When the label
 * looks like an absolute path, only the basename leaves; when it's
 * already free-form text (a chunk title, an issue subject), it
 * passes through unchanged.
 */
const sanitiseLabel = (raw: unknown): string => {
  if (typeof raw !== 'string' || raw.length === 0) return '';
  if (isLocalPath(raw)) {
    const base = raw.split(/[\\/]/).pop() ?? '';
    return base.length > 0 ? base : '<file>';
  }
  return raw.length > 200 ? raw.slice(0, 200) : raw;
};

const buildHit = (
  edge: GraphEdge,
  graph: Graph,
  nowMs: number,
): { hit: RecallPeerHit; node: GraphNode } | null => {
  const node: GraphNode | undefined = graph.nodeById.get(edge.source);
  if (!node) return null;
  // Don't transmit chunk body content or local filesystem paths —
  // only safe public-URI metadata. The fallback to source_file the
  // codex audit caught (recall-sync.ts:126 of v1) leaked
  // /Users/saharbarak/... and similar absolute paths to peers.
  const fetchedAt =
    typeof node.fetched_at === 'string' ? node.fetched_at : undefined;
  const fetchedMs = fetchedAt ? Date.parse(fetchedAt) : NaN;
  const ageDays = Number.isFinite(fetchedMs)
    ? Number(((nowMs - fetchedMs) / 86_400_000).toFixed(2))
    : undefined;
  return {
    hit: {
      node_id: sanitiseNodeId(node.id),
      label: sanitiseLabel(node.label),
      source_uri: sanitiseSourceUri(node.source_uri),
      fetched_at: fetchedAt,
      age_days: ageDays,
    },
    node,
  };
};

/**
 * Answer a single inbound recall. Used by the protocol handler on
 * the daemon side.
 *
 * V5 gate: every hit's source node must have `private === false`.
 * The pre-V5 shared-rooms.json authorization registry is gone —
 * sharing is a per-node attribute (see Plan 06 share-sync.ts).
 */
export const answerRecall = async (
  req: RecallRequest,
  deps: RecallResponderDeps,
): Promise<RecallWire> => {
  if (typeof req.entity_id !== 'string' || req.entity_id.length === 0) {
    return { type: 'recall_err', reason: 'invalid_request' };
  }
  const limit = Math.min(Math.max(1, req.limit ?? 20), MAX_LIMIT);

  // Walk inbound mentions edges via the indexed accessor.
  const edges = edgesByRelationAndTarget(deps.graph, 'mentions', req.entity_id);
  if (edges.length === 0) {
    return {
      type: 'recall_ok',
      entity_id: req.entity_id,
      mention_count: 0,
      hits: [],
    };
  }

  // Build hits THEN apply the V5 sharing gate (node.private === false).
  //
  // Privacy invariants preserved from V4:
  //
  // 1. mention_count reflects ONLY hits that pass the privacy gate —
  //    leaking total mention volume of private chunks to peers would
  //    be a side-channel.
  //
  // 2. Nodes without an explicit `private: false` are NOT surfaced.
  //    This is the inverse of the legacy `!hit.room && drop` rule:
  //    only nodes that explicitly opted in to sharing (private:false)
  //    can be returned. Nodes with `private` missing/undefined are
  //    treated as private by default — defence in depth.
  const now = deps.now();
  const hits: RecallPeerHit[] = [];
  for (const e of edges) {
    const built = buildHit(e, deps.graph, now);
    if (!built) continue;
    // V5 sharing gate — only public nodes propagate.
    if (built.node.private !== false) continue;
    hits.push(built.hit);
  }
  // Sort by recency desc, then trim to the asker's limit.
  hits.sort((a, b) =>
    (b.fetched_at ?? '').localeCompare(a.fetched_at ?? ''),
  );
  return {
    type: 'recall_ok',
    entity_id: req.entity_id,
    // Count = post-filter hits. Same number an external caller
    // could reproduce from `hits.length`, so no extra information
    // crosses; consistent with the wire shape's privacy contract.
    mention_count: hits.length,
    hits: hits.slice(0, limit),
  };
};

// ─────────────── per-peer rate limiter ────

/**
 * Token-bucket rate limiter — same shape as search-sync's. Without
 * this, any peer can drive continuous graph loads + share-store
 * reads + edge-index walks at the responder. Inline (not shared
 * with search-sync) per the review's "lifecycle independence"
 * decision: search and recall have separate quotas.
 */
interface BucketState {
  tokens: number;
  lastRefill: number;
  lastActive: number;
}

const buckets = new Map<string, BucketState>();

/**
 * Evict idle buckets in a background interval rather than scanning the
 * full map on every inbound request. The previous shape (inline scan
 * inside `consumeToken`) is an O(N) operation per request — gemini
 * synthesis MED on recall-sync.ts:326 flagged it as an algorithmic-
 * complexity DoS vector when peer churn is high. Interval cadence is
 * intentionally generous: idle-evict is housekeeping, not security.
 */
let evictTimer: NodeJS.Timeout | null = null;
const startEvictionLoop = (): void => {
  if (evictTimer) return;
  evictTimer = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (now - b.lastActive > RATE_IDLE_EVICT_MS) buckets.delete(k);
    }
  }, 60_000);
  evictTimer.unref?.();
};

const consumeToken = (peerId: string, now: number): boolean => {
  startEvictionLoop();
  let b = buckets.get(peerId);
  if (!b) {
    b = { tokens: RATE_BURST - 1, lastRefill: now, lastActive: now };
    buckets.set(peerId, b);
    return true;
  }
  // Refill — add tokens proportional to elapsed time, cap at burst.
  const elapsed = (now - b.lastRefill) / 1000;
  b.tokens = Math.min(RATE_BURST, b.tokens + elapsed * RATE_PER_SEC);
  b.lastRefill = now;
  b.lastActive = now;
  if (b.tokens >= 1) {
    b.tokens -= 1;
    return true;
  }
  return false;
};

// ─────────────── protocol registration ────

export interface RecallRegistryDeps {
  readonly node: Libp2p;
  /** Live graph getter — re-fetched per request so updates flow. */
  readonly getGraph: () => Promise<Graph | null>;
  /** Optional logger; default no-op. */
  readonly log?: (msg: string) => void;
}

export const registerRecallProtocol = (deps: RecallRegistryDeps): void => {
  const log = deps.log ?? (() => undefined);
  void deps.node.handle(
    RECALL_PROTOCOL_ID,
    async (stream: Stream, connection: Connection) => {
      const peerIdStr = connection.remotePeer.toString();
      try {
        // Rate-limit per peer BEFORE doing any work — graph load,
        // share-store read, and edge-index walks all touch the hot
        // path; a chatty peer mustn't be able to keep them busy.
        if (!consumeToken(peerIdStr, Date.now())) {
          await writeFrame(stream, { type: 'recall_err', reason: 'rate_limited' });
          await stream.close();
          return;
        }

        const req = await readFrame<RecallRequest>(stream, MAX_INBOUND_FRAME_BYTES);
        if (!req || req.type !== 'recall') {
          await writeFrame(stream, {
            type: 'recall_err',
            reason: 'invalid_request',
          });
          await stream.close();
          return;
        }
        // Cheap input validation — entity_id + room caps. Stops a
        // peer from forcing an enormous-string graph traversal.
        if (typeof req.entity_id !== 'string' || req.entity_id.length === 0 || req.entity_id.length > 256) {
          await writeFrame(stream, { type: 'recall_err', reason: 'invalid_request' });
          await stream.close();
          return;
        }
        const graph = await deps.getGraph();
        if (!graph) {
          // Responder-side transient state — graph file isn't loaded
          // yet, or the load failed. NOT the asker's fault. Sending
          // `invalid_request` would (a) mislabel the asker as faulty
          // in their telemetry and (b) cause caching of a permanent
          // negative response. Close silently so the asker times out
          // and naturally retries on a later request (claude-sonnet
          // sub-agent HIGH-3).
          log(`recall responder ← peer=${peerIdStr.slice(0, 12)} graph_unloaded`);
          await stream.close();
          return;
        }
        const resp = await answerRecall(req, {
          graph,
          now: () => Date.now(),
        });
        await writeFrame(stream, resp);
        log(
          `recall responder ← peer=${peerIdStr.slice(0, 12)} entity=${req.entity_id} hits=${resp.type === 'recall_ok' ? resp.hits.length : 0}`,
        );
      } catch (e) {
        log(`recall responder error: ${(e as Error).message}`);
      } finally {
        await stream.close().catch(() => { /* benign */ });
      }
    },
    { maxInboundStreams: MAX_INBOUND_STREAMS },
  );
};

export const unregisterRecallProtocol = (node: Libp2p): ResultAsync<void, SearchError> =>
  ResultAsync.fromPromise(
    node.unhandle(RECALL_PROTOCOL_ID),
    (e) => SEARCH_ERR.protocolError('local', (e as Error).message),
  );

// ─────────────── outbound dial ────────────

const withTimeout = <T>(p: Promise<T>, ms: number, peer: string): Promise<T> =>
  Promise.race<T>([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error(`recall timeout peer=${peer}`)), ms),
    ),
  ]);

/**
 * Dial RECALL_PROTOCOL_ID on `peerId`, send the request, read the
 * single response frame, return the decoded wire object. Failure
 * (timeout, dial error, parse error) returns null and the caller
 * counts that peer as 'errored' / 'timed_out'.
 */
export const openRecallStream = (
  node: Libp2p,
  peerIdStr: string,
  req: RecallRequest,
): ResultAsync<RecallWire | null, SearchError> =>
  ResultAsync.fromPromise(
    (async () => {
      const pid = peerIdFromString(peerIdStr);
      const stream = await withTimeout(
        node.dialProtocol(pid, RECALL_PROTOCOL_ID),
        PER_PEER_TIMEOUT_MS,
        peerIdStr,
      );
      try {
        await writeFrame(stream, req);
        // Inbound (response) cap is generous: a recall_ok with 50
        // hits at ~512 B each + envelope overhead ≈ 30 KB. Cap at
        // 64 KB so a malicious peer can't OOM the asker by sending
        // an unbounded JSON document back through the protocol.
        const RESP_MAX_BYTES = 64 * 1024;
        const resp = await withTimeout(
          readFrame<RecallWire>(stream, RESP_MAX_BYTES),
          PER_PEER_TIMEOUT_MS,
          peerIdStr,
        );
        return resp;
      } finally {
        await stream.close().catch(() => { /* benign */ });
      }
    })(),
    (e) => SEARCH_ERR.protocolError('local', (e as Error).message),
  );

// silence unused parity import
void errAsync;
void okAsync;
