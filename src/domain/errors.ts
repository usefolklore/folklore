/**
 * Domain errors for the folklore knowledge graph.
 *
 * Every error is a tagged union member with a `type` discriminator plus
 * enough context for a caller to render a useful message. No `Error`
 * instances, no `throw` — errors flow through neverthrow's `Result` and
 * `ResultAsync`, so they are values you compose, not exceptions.
 *
 * The error families mirror the bounded contexts:
 *
 *   - `GraphError`      — node/edge validation, missing references, I/O
 *   - `VectorError`     — dimension mismatch, sqlite/sqlite-vec failures
 *   - `EmbeddingError`  — transformers runtime, model load, inference
 *   - `PeerError`       — P2P identity, peer store I/O, transport, dial
 *   - `ScanError`       — secrets detection at the sharing boundary
 *   - `ShareError`      — node sharing, Y.js CRDT sync, share-log I/O
 *   - `SearchError`     — federated search fan-out, rate limiting, auth (Phase 17)
 *   - `CodebaseError`   — structured codebase indexing, tree-sitter, code-graph.db (Phase 19)
 *   - `NetError`        — production networking: relay, hole-punch, UPnP, bandwidth (Phase 18)
 *
 * `AppError` is the top-level union used by CLI and application layers.
 */

// ─────────────────────── GraphError ───────────────────────

export type GraphError =
  | { readonly type: 'InvalidNode'; readonly field: string; readonly node_id?: string }
  | { readonly type: 'InvalidEdge'; readonly field: string }
  | { readonly type: 'NodeNotFound'; readonly node_id: string }
  | { readonly type: 'DanglingEdge'; readonly source: string; readonly target: string }
  | { readonly type: 'GraphReadError'; readonly path: string; readonly message: string }
  | { readonly type: 'GraphWriteError'; readonly path: string; readonly message: string }
  | { readonly type: 'GraphParseError'; readonly path: string; readonly message: string };

export const GraphError = {
  invalidNode: (field: string, node_id?: string): GraphError => ({ type: 'InvalidNode', field, node_id }),
  invalidEdge: (field: string): GraphError => ({ type: 'InvalidEdge', field }),
  nodeNotFound: (node_id: string): GraphError => ({ type: 'NodeNotFound', node_id }),
  danglingEdge: (source: string, target: string): GraphError => ({ type: 'DanglingEdge', source, target }),
  readError: (path: string, message: string): GraphError => ({ type: 'GraphReadError', path, message }),
  writeError: (path: string, message: string): GraphError => ({ type: 'GraphWriteError', path, message }),
  parseError: (path: string, message: string): GraphError => ({ type: 'GraphParseError', path, message }),
} as const;

// ─────────────────────── VectorError ──────────────────────

export type VectorError =
  | { readonly type: 'DimensionMismatch'; readonly expected: number; readonly got: number }
  | { readonly type: 'VectorOpenError'; readonly path: string; readonly message: string }
  | { readonly type: 'VectorWriteError'; readonly node_id: string; readonly message: string }
  | { readonly type: 'VectorReadError'; readonly message: string };

export const VectorError = {
  dimensionMismatch: (expected: number, got: number): VectorError => ({
    type: 'DimensionMismatch',
    expected,
    got,
  }),
  openError: (path: string, message: string): VectorError => ({ type: 'VectorOpenError', path, message }),
  writeError: (node_id: string, message: string): VectorError => ({
    type: 'VectorWriteError',
    node_id,
    message,
  }),
  readError: (message: string): VectorError => ({ type: 'VectorReadError', message }),
} as const;

// ─────────────────────── EmbeddingError ───────────────────

export type EmbeddingError =
  | { readonly type: 'ModelLoadError'; readonly model: string; readonly message: string }
  | { readonly type: 'InferenceError'; readonly message: string };

export const EmbeddingError = {
  modelLoad: (model: string, message: string): EmbeddingError => ({ type: 'ModelLoadError', model, message }),
  inference: (message: string): EmbeddingError => ({ type: 'InferenceError', message }),
} as const;

// ─────────────────────── ScanMatch ────────────────────────

/** A single pattern match found during secret scanning. */
export interface ScanMatch {
  /** The ShareableNode field where the match was found (e.g. 'label'). */
  readonly field: string;
  /** The pattern name that triggered (e.g. 'openai-key'). */
  readonly patternName: string;
}

// ─────────────────────── PeerError ────────────────────────

/**
 * Errors from the P2P peer bounded context.
 *
 * Split into identity errors (peer-transport.ts: key generation,
 * read/write of peer-identity.json) and store errors (peer-store.ts:
 * read/write of peers.json) — callers can distinguish them precisely.
 *
 * PeerStoreReadError / PeerStoreWriteError are separate from
 * PeerIdentityReadError / PeerIdentityWriteError so that a caller
 * handling the peers.json store does not accidentally catch identity
 * key errors (two different files, two different failure modes).
 */
export type PeerError =
  | { readonly type: 'PeerIdentityReadError';     readonly path: string; readonly message: string }
  | { readonly type: 'PeerIdentityWriteError';    readonly path: string; readonly message: string }
  | { readonly type: 'PeerIdentityParseError';    readonly path: string; readonly message: string }
  | { readonly type: 'PeerIdentityGenerateError'; readonly message: string }
  | { readonly type: 'PeerStoreReadError';        readonly path: string; readonly message: string }
  | { readonly type: 'PeerStoreWriteError';       readonly path: string; readonly message: string }
  | { readonly type: 'PeerDialError';             readonly addr: string; readonly message: string }
  | { readonly type: 'PeerNotFound';              readonly id: string }
  | { readonly type: 'PeerTransportError';        readonly message: string }
  | { readonly type: 'InvalidMultiaddr';          readonly addr: string; readonly message: string };

export const PeerError = {
  identityReadError:     (path: string, message: string): PeerError => ({ type: 'PeerIdentityReadError', path, message }),
  identityWriteError:    (path: string, message: string): PeerError => ({ type: 'PeerIdentityWriteError', path, message }),
  identityParseError:    (path: string, message: string): PeerError => ({ type: 'PeerIdentityParseError', path, message }),
  identityGenerateError: (message: string): PeerError              => ({ type: 'PeerIdentityGenerateError', message }),
  storeReadError:        (path: string, message: string): PeerError => ({ type: 'PeerStoreReadError', path, message }),
  storeWriteError:       (path: string, message: string): PeerError => ({ type: 'PeerStoreWriteError', path, message }),
  dialError:             (addr: string, message: string): PeerError => ({ type: 'PeerDialError', addr, message }),
  notFound:              (id: string): PeerError                   => ({ type: 'PeerNotFound', id }),
  transportError:        (message: string): PeerError              => ({ type: 'PeerTransportError', message }),
  invalidMultiaddr:      (addr: string, message: string): PeerError => ({ type: 'InvalidMultiaddr', addr, message }),
} as const;

// ─────────────────────── ScanError ────────────────────────

/** Errors from the secrets-scanning boundary. */
export type ScanError =
  | { readonly type: 'SecretDetected'; readonly nodeId: string; readonly matches: readonly ScanMatch[] };

export const ScanError = {
  secretDetected: (nodeId: string, matches: readonly ScanMatch[]): ScanError => ({
    type: 'SecretDetected',
    nodeId,
    matches,
  }),
} as const;

// ─────────────────────── ShareError ───────────────────────

/**
 * Errors from the node-sharing bounded context (Phase 16).
 *
 * - ShareAuditBlocked        — sharing aborted because the audit found flagged nodes
 * - YDocLoadError / SaveError — .ydoc file I/O failures (binary Yjs state)
 * - SyncProtocolError        — libp2p stream / sync handshake failure with a specific peer
 * - InboundUpdateRejected    — secrets scanner blocked an update arriving from a peer (logged + dropped, no back-prop)
 * - ShareStoreReadError / WriteError — share-log I/O (mirrors PeerStoreReadError pattern)
 */
export type ShareError =
  | { readonly type: 'ShareAuditBlocked';     readonly blockedCount: number }
  | { readonly type: 'YDocLoadError';         readonly path: string; readonly message: string }
  | { readonly type: 'YDocSaveError';         readonly path: string; readonly message: string }
  | { readonly type: 'SyncProtocolError';     readonly peer: string; readonly message: string }
  | { readonly type: 'InboundUpdateRejected'; readonly peer: string; readonly reason: string }
  | { readonly type: 'ShareStoreReadError';   readonly path: string; readonly message: string }
  | { readonly type: 'ShareStoreWriteError';  readonly path: string; readonly message: string }
  /** NET-02: per-peer token bucket exhausted — outbound update rejected. */
  | { readonly type: 'BandwidthExceeded';     readonly peer: string };

export const ShareError = {
  shareAuditBlocked:     (blockedCount: number): ShareError => ({ type: 'ShareAuditBlocked', blockedCount }),
  ydocLoadError:         (path: string, message: string): ShareError => ({ type: 'YDocLoadError', path, message }),
  ydocSaveError:         (path: string, message: string): ShareError => ({ type: 'YDocSaveError', path, message }),
  syncProtocolError:     (peer: string, message: string): ShareError => ({ type: 'SyncProtocolError', peer, message }),
  inboundUpdateRejected: (peer: string, reason: string): ShareError => ({ type: 'InboundUpdateRejected', peer, reason }),
  shareStoreReadError:   (path: string, message: string): ShareError => ({ type: 'ShareStoreReadError', path, message }),
  shareStoreWriteError:  (path: string, message: string): ShareError => ({ type: 'ShareStoreWriteError', path, message }),
  bandwidthExceeded:     (peer: string): ShareError => ({ type: 'BandwidthExceeded', peer }),
} as const;

// ─────────────────────── SearchError ──────────────────────

/**
 * Errors from the federated search bounded context (Phase 17, V5 cutover Phase 24).
 *
 * - SearchDimensionMismatch  — inbound embedding length != 384 (local model dim)
 * - SearchRateLimited        — peer exceeded token bucket (10 req/s, burst 30)
 * - SearchProtocolError      — libp2p stream/dial/frame decode failure
 * - SearchTimeout            — per-peer 2s deadline exceeded during outbound fan-out
 * - SearchProtocolMismatch   — V5: peer sent a pre-V5 envelope (e.g. `room` field or
 *                              missing `protocol_version: 5`). Hard cutover — see
 *                              docs/architecture/V5-PROTOCOL.md.
 *
 * SearchUnauthorized was removed in V5 — room-level authorization no longer exists;
 * the per-node `private: boolean` gate replaces it (ROOMS-DEL-03 / ROOMS-DEL-05).
 */
export type SearchError =
  | { readonly type: 'SearchDimensionMismatch'; readonly expected: number; readonly got: number }
  | { readonly type: 'SearchRateLimited';       readonly peer: string }
  | { readonly type: 'SearchProtocolError';     readonly peer: string; readonly message: string }
  | { readonly type: 'SearchTimeout';           readonly peer: string; readonly elapsedMs: number }
  | { readonly type: 'SearchProtocolMismatch';  readonly message: string };

export const SearchError = {
  dimensionMismatch: (expected: number, got: number): SearchError => ({ type: 'SearchDimensionMismatch', expected, got }),
  rateLimited:       (peer: string): SearchError                  => ({ type: 'SearchRateLimited', peer }),
  protocolError:     (peer: string, message: string): SearchError => ({ type: 'SearchProtocolError', peer, message }),
  timeout:           (peer: string, elapsedMs: number): SearchError => ({ type: 'SearchTimeout', peer, elapsedMs }),
  protocolMismatch:  (message: string): SearchError               => ({ type: 'SearchProtocolMismatch', message }),
} as const;

// ─────────────────────── CodebaseError ───────────────────

/**
 * Errors from the structured codebase indexing bounded context (Phase 19).
 *
 * Split by failure surface:
 *   - DbOpenError / DbReadError / DbWriteError — code-graph.db I/O at infrastructure boundary
 *   - GrammarMissingError / ParseError        — tree-sitter grammar load + parse failures
 *   - CodebaseNotFoundError                   — lookup miss in codebases table
 *   - InvalidPathError                        — user supplied path does not exist or is not a directory
 */
export type CodebaseError =
  | { readonly type: 'CodebaseDbOpenError';         readonly path: string; readonly message: string }
  | { readonly type: 'CodebaseDbReadError';         readonly message: string }
  | { readonly type: 'CodebaseDbWriteError';        readonly table: string; readonly message: string }
  | { readonly type: 'CodebaseGrammarMissingError'; readonly language: string; readonly message: string }
  | { readonly type: 'CodebaseParseError';          readonly file_path: string; readonly message: string }
  | { readonly type: 'CodebaseNotFoundError';       readonly codebase_id: string }
  | { readonly type: 'CodebaseInvalidPathError';    readonly path: string; readonly message: string };

export const CodebaseError = {
  dbOpenError:         (path: string, message: string): CodebaseError => ({ type: 'CodebaseDbOpenError', path, message }),
  dbReadError:         (message: string): CodebaseError               => ({ type: 'CodebaseDbReadError', message }),
  dbWriteError:        (table: string, message: string): CodebaseError => ({ type: 'CodebaseDbWriteError', table, message }),
  grammarMissingError: (language: string, message: string): CodebaseError => ({ type: 'CodebaseGrammarMissingError', language, message }),
  parseError:          (file_path: string, message: string): CodebaseError => ({ type: 'CodebaseParseError', file_path, message }),
  notFound:            (codebase_id: string): CodebaseError           => ({ type: 'CodebaseNotFoundError', codebase_id }),
  invalidPath:         (path: string, message: string): CodebaseError => ({ type: 'CodebaseInvalidPathError', path, message }),
} as const;

// ─────────────────────── NetError ────────────────────────

/**
 * Errors from the production networking bounded context (Phase 18).
 *
 * Split by failure surface:
 *   - RelayDialFailed      — explicit dial of a config.peer.relays entry failed
 *   - HolePunchTimeout     — dcutr direct-upgrade did not complete in time
 *   - UPnPMapFailed        — @libp2p/upnp-nat reported a non-recoverable mapping failure (note: the service catches most errors internally — this is only for cases that surface)
 *   - BandwidthExceeded    — per-peer-per-room token bucket rejected an outbound update
 *   - HealthDegraded       — connection-health tracker flipped a peer to 'degraded'
 *   - RelayNotConfigured   — caller asked for /p2p-circuit behaviour but config.peer.relays is empty
 */
export type NetError =
  | { readonly type: 'RelayDialFailed';    readonly addr: string; readonly message: string }
  | { readonly type: 'HolePunchTimeout';   readonly peer: string; readonly elapsedMs: number }
  | { readonly type: 'UPnPMapFailed';      readonly message: string }
  | { readonly type: 'BandwidthExceeded';  readonly peer: string }
  | { readonly type: 'HealthDegraded';     readonly peer: string; readonly reason: 'disconnects' | 'idle' }
  | { readonly type: 'RelayNotConfigured' };

export const NetError = {
  relayDialFailed:    (addr: string, message: string): NetError    => ({ type: 'RelayDialFailed', addr, message }),
  holePunchTimeout:   (peer: string, elapsedMs: number): NetError  => ({ type: 'HolePunchTimeout', peer, elapsedMs }),
  upnpMapFailed:      (message: string): NetError                  => ({ type: 'UPnPMapFailed', message }),
  bandwidthExceeded:  (peer: string): NetError                     => ({ type: 'BandwidthExceeded', peer }),
  healthDegraded:     (peer: string, reason: 'disconnects' | 'idle'): NetError => ({ type: 'HealthDegraded', peer, reason }),
  relayNotConfigured: (): NetError                                 => ({ type: 'RelayNotConfigured' }),
} as const;

// ─────────────────────── SessionError ────────────────────

/**
 * Errors from the Claude-session ingestion bounded context (Phase 20).
 *
 * Split by failure surface:
 *   - SessionFileReadError   — reading a *.jsonl transcript from ~/.claude/projects
 *   - SessionJsonlParseError — one line of a transcript failed JSON.parse (partial write, corruption)
 *   - SessionStateFileError  — ~/.folklore/sessions-state.json read/write/parse failure
 *   - SessionRetentionError  — retention pruning pass failed (graph repo write error during delete)
 *   - SessionIngestError     — upstream application-layer ingest for a session node failed
 */
export type SessionError =
  | { readonly type: 'SessionFileReadError';   readonly path: string; readonly message: string }
  | { readonly type: 'SessionJsonlParseError'; readonly path: string; readonly lineNum: number; readonly message: string }
  | { readonly type: 'SessionStateFileError';  readonly path: string; readonly message: string }
  | { readonly type: 'SessionRetentionError';  readonly message: string }
  | { readonly type: 'SessionIngestError';     readonly sessionId: string; readonly message: string };

export const SessionError = {
  fileReadError:   (path: string, message: string): SessionError =>
    ({ type: 'SessionFileReadError', path, message }),
  jsonlParseError: (path: string, lineNum: number, message: string): SessionError =>
    ({ type: 'SessionJsonlParseError', path, lineNum, message }),
  stateFileError:  (path: string, message: string): SessionError =>
    ({ type: 'SessionStateFileError', path, message }),
  retentionError:  (message: string): SessionError =>
    ({ type: 'SessionRetentionError', message }),
  ingestError:     (sessionId: string, message: string): SessionError =>
    ({ type: 'SessionIngestError', sessionId, message }),
} as const;

// ─────────────────────── AppError union ───────────────────

// ─────────────────────── TouchError (Phase 31 — asymmetric graph exchange) ───────

/**
 * Errors from the `touch` bounded context: one-shot asymmetric pull of a
 * remote peer's public room graph. Unlike ShareError (symmetric Y.js CRDT
 * replication), touch has no intersection requirement and no persistent
 * state — a stream opens, a request is sent, a response is received, the
 * stream closes. Failure modes mirror SearchError's request/response shape.
 */
export type TouchError =
  | { readonly type: 'TouchProtocolError'; readonly peer: string; readonly message: string }
  | { readonly type: 'TouchTimeout';       readonly peer: string; readonly elapsedMs: number }
  | { readonly type: 'TouchBudgetExceeded'; readonly peer: string; readonly max: number }
  | { readonly type: 'TouchRemoteError';   readonly peer: string; readonly code: string };

export const TouchError = {
  protocolError:   (peer: string, message: string): TouchError => ({ type: 'TouchProtocolError', peer, message }),
  timeout:         (peer: string, elapsedMs: number): TouchError => ({ type: 'TouchTimeout', peer, elapsedMs }),
  budgetExceeded:  (peer: string, max: number): TouchError     => ({ type: 'TouchBudgetExceeded', peer, max }),
  remoteError:     (peer: string, code: string): TouchError    => ({ type: 'TouchRemoteError', peer, code }),
} as const;

// ─────────────────────── IdentityError (Phase 32 — DID wave) ─────

/**
 * Errors from the user-identity / DID bounded context.
 *
 * Split by failure surface:
 *   - KeyGenerationError       — Ed25519 keypair generation failed (Node crypto)
 *   - InvalidDIDError          — malformed did:key string (bad prefix, bad base58, wrong multicodec)
 *   - SignatureError           — sign/verify operation itself failed at the crypto layer
 *   - BadSignatureError        — cryptographically valid operation that produced an invalid signature
 *   - DeviceAuthorizationError — envelope's device authorization chain does not verify under the claimed user DID
 *   - CanonicalizationError    — payload could not be canonical-JSON-encoded (cyclic object, bigint, etc.)
 */
export type IdentityError =
  | { readonly type: 'IdentityKeyGenerationError';     readonly message: string }
  | { readonly type: 'IdentityInvalidDIDError';        readonly did: string;   readonly message: string }
  | { readonly type: 'IdentitySignatureError';         readonly message: string }
  | { readonly type: 'IdentityBadSignatureError';      readonly reason: string }
  | { readonly type: 'IdentityDeviceAuthorizationError'; readonly reason: string }
  | { readonly type: 'IdentityCanonicalizationError';  readonly message: string };

export const IdentityError = {
  keyGeneration:        (message: string): IdentityError => ({ type: 'IdentityKeyGenerationError', message }),
  invalidDID:           (did: string, message: string): IdentityError => ({ type: 'IdentityInvalidDIDError', did, message }),
  signature:            (message: string): IdentityError => ({ type: 'IdentitySignatureError', message }),
  badSignature:         (reason: string): IdentityError => ({ type: 'IdentityBadSignatureError', reason }),
  deviceAuthorization:  (reason: string): IdentityError => ({ type: 'IdentityDeviceAuthorizationError', reason }),
  canonicalization:     (message: string): IdentityError => ({ type: 'IdentityCanonicalizationError', message }),
} as const;

// ─────────────────────── ConsolidationError (Phase 4 — agent-brain consolidator) ─

/**
 * Errors from the episodic→semantic consolidation worker.
 *
 * The worker pulls episodic entries from a room, clusters them by
 * cosine similarity, distills each cluster via a local LLM, and
 * persists the result as a `consolidated_memory` graph node. This
 * error family covers the boundary checks at each stage.
 */
export type ConsolidationError =
  | { readonly type: 'ConsolidationEmptyInput';        readonly message: string }
  | { readonly type: 'ConsolidationDimMismatch';       readonly expected: number; readonly got: number; readonly at: number }
  | { readonly type: 'ConsolidationInvalidParameter';  readonly field: string; readonly message: string };

export const ConsolidationError = {
  emptyInput:        (message: string): ConsolidationError => ({ type: 'ConsolidationEmptyInput', message }),
  dimMismatch:       (expected: number, got: number, at: number): ConsolidationError => ({ type: 'ConsolidationDimMismatch', expected, got, at }),
  invalidParameter:  (field: string, message: string): ConsolidationError => ({ type: 'ConsolidationInvalidParameter', field, message }),
} as const;

// ─────────────────────── RerankError (Phase 21 — cross-encoder rerank) ─

/**
 * Errors from the cross-encoder reranker.
 *
 * Cross-encoder is the last-mile precision pass on top of the Phase 23
 * dense+BM25+RRF hybrid. Lazy-loaded ONNX model via @xenova/transformers.
 * Module is fail-open by design — the call site falls through to the
 * non-reranked candidate list when this errors. These variants exist for
 * telemetry and audit, not for caller branching.
 */
export type RerankError =
  | { readonly type: 'RerankModelLoad';   readonly model: string; readonly message: string }
  | { readonly type: 'RerankInference';   readonly message: string }
  | { readonly type: 'RerankDisabled' };

export const RerankError = {
  modelLoad: (model: string, message: string): RerankError => ({ type: 'RerankModelLoad', model, message }),
  inference: (message: string): RerankError => ({ type: 'RerankInference', message }),
  disabled:  (): RerankError => ({ type: 'RerankDisabled' }),
} as const;

export type AppError = GraphError | VectorError | EmbeddingError | PeerError | ScanError | ShareError | SearchError | CodebaseError | NetError | SessionError | TouchError | IdentityError | ConsolidationError | RerankError;

/** Render a tagged error as a one-line human-readable string. */
export const formatError = (e: AppError): string => {
  switch (e.type) {
    case 'InvalidNode':
      return `invalid node: missing '${e.field}'${e.node_id ? ` (id=${e.node_id})` : ''}`;
    case 'InvalidEdge':
      return `invalid edge: missing '${e.field}'`;
    case 'NodeNotFound':
      return `node not found: ${e.node_id}`;
    case 'DanglingEdge':
      return `dangling edge: ${e.source} → ${e.target}`;
    case 'GraphReadError':
      return `graph read error at ${e.path}: ${e.message}`;
    case 'GraphWriteError':
      return `graph write error at ${e.path}: ${e.message}`;
    case 'GraphParseError':
      return `graph parse error at ${e.path}: ${e.message}`;
    case 'DimensionMismatch':
      return `vector dimension mismatch: expected ${e.expected}, got ${e.got}`;
    case 'VectorOpenError':
      return `vector store open error at ${e.path}: ${e.message}`;
    case 'VectorWriteError':
      return `vector write error for ${e.node_id}: ${e.message}`;
    case 'VectorReadError':
      return `vector read error: ${e.message}`;
    case 'ModelLoadError':
      return `embedding model load failed (${e.model}): ${e.message}`;
    case 'InferenceError':
      return `embedding inference failed: ${e.message}`;
    case 'PeerIdentityReadError':
      return `peer identity read error at ${e.path}: ${e.message}`;
    case 'PeerIdentityWriteError':
      return `peer identity write error at ${e.path}: ${e.message}`;
    case 'PeerIdentityParseError':
      return `peer identity parse error at ${e.path}: ${e.message}`;
    case 'PeerIdentityGenerateError':
      return `peer identity generation failed: ${e.message}`;
    case 'PeerStoreReadError':
      return `peer store read error at ${e.path}: ${e.message}`;
    case 'PeerStoreWriteError':
      return `peer store write error at ${e.path}: ${e.message}`;
    case 'PeerDialError':
      return `peer dial error for ${e.addr}: ${e.message}`;
    case 'PeerNotFound':
      return `peer not found: ${e.id}`;
    case 'PeerTransportError':
      return `peer transport error: ${e.message}`;
    case 'InvalidMultiaddr':
      return `invalid multiaddr '${e.addr}': ${e.message}`;
    case 'SecretDetected':
      return `secret detected in node ${e.nodeId}: ${e.matches.map((m) => `${m.field}/${m.patternName}`).join(', ')}`;
    case 'ShareAuditBlocked':
      return `share blocked: ${e.blockedCount} flagged node(s)`;
    case 'YDocLoadError':
      return `ydoc load error at ${e.path}: ${e.message}`;
    case 'YDocSaveError':
      return `ydoc save error at ${e.path}: ${e.message}`;
    case 'SyncProtocolError':
      return `sync protocol error with peer ${e.peer}: ${e.message}`;
    case 'InboundUpdateRejected':
      return `inbound update rejected from ${e.peer}: ${e.reason}`;
    case 'ShareStoreReadError':
      return `share store read error at ${e.path}: ${e.message}`;
    case 'ShareStoreWriteError':
      return `share store write error at ${e.path}: ${e.message}`;
    case 'SearchDimensionMismatch':
      return `search dimension mismatch: expected ${e.expected}, got ${e.got}`;
    case 'SearchRateLimited':
      return `search rate limited for peer ${e.peer}`;
    case 'SearchProtocolError':
      return `search protocol error with peer ${e.peer}: ${e.message}`;
    case 'SearchTimeout':
      return `search timeout for peer ${e.peer} after ${e.elapsedMs}ms`;
    case 'SearchProtocolMismatch':
      return `search protocol mismatch: ${e.message}`;
    case 'TouchProtocolError':
      return `touch protocol error with peer ${e.peer}: ${e.message}`;
    case 'TouchTimeout':
      return `touch timeout for peer ${e.peer} after ${e.elapsedMs}ms`;
    case 'TouchBudgetExceeded':
      return `touch response from peer ${e.peer} exceeds max nodes (${e.max})`;
    case 'TouchRemoteError':
      return `touch remote error from peer ${e.peer}: ${e.code}`;
    case 'CodebaseDbOpenError':
      return `code graph db open error at ${e.path}: ${e.message}`;
    case 'CodebaseDbReadError':
      return `code graph db read error: ${e.message}`;
    case 'CodebaseDbWriteError':
      return `code graph db write error (table=${e.table}): ${e.message}`;
    case 'CodebaseGrammarMissingError':
      return `tree-sitter grammar missing for language '${e.language}': ${e.message}`;
    case 'CodebaseParseError':
      return `code parse error in ${e.file_path}: ${e.message}`;
    case 'CodebaseNotFoundError':
      return `codebase not found: ${e.codebase_id}`;
    case 'CodebaseInvalidPathError':
      return `invalid codebase path '${e.path}': ${e.message}`;
    case 'RelayDialFailed':
      return `relay dial failed for ${e.addr}: ${e.message}`;
    case 'HolePunchTimeout':
      return `hole punch timeout for peer ${e.peer} after ${e.elapsedMs}ms`;
    case 'UPnPMapFailed':
      return `UPnP port mapping failed: ${e.message}`;
    case 'BandwidthExceeded':
      return `bandwidth limit exceeded for peer ${e.peer}`;
    case 'HealthDegraded':
      return `peer ${e.peer} health degraded (${e.reason})`;
    case 'RelayNotConfigured':
      return `no relays configured in peer.relays — set config.yaml peer.relays to enable /p2p-circuit`;
    case 'SessionFileReadError':
      return `session file read error at ${e.path}: ${e.message}`;
    case 'SessionJsonlParseError':
      return `session JSONL parse error at ${e.path}:${e.lineNum}: ${e.message}`;
    case 'SessionStateFileError':
      return `session state file error at ${e.path}: ${e.message}`;
    case 'SessionRetentionError':
      return `session retention error: ${e.message}`;
    case 'SessionIngestError':
      return `session ingest error for ${e.sessionId}: ${e.message}`;
    case 'IdentityKeyGenerationError':
      return `identity key generation failed: ${e.message}`;
    case 'IdentityInvalidDIDError':
      return `invalid DID '${e.did}': ${e.message}`;
    case 'IdentitySignatureError':
      return `identity signature op failed: ${e.message}`;
    case 'IdentityBadSignatureError':
      return `identity signature verification failed: ${e.reason}`;
    case 'IdentityDeviceAuthorizationError':
      return `device authorization invalid: ${e.reason}`;
    case 'IdentityCanonicalizationError':
      return `canonical JSON encoding failed: ${e.message}`;
    case 'ConsolidationEmptyInput':
      return `consolidation: empty input — ${e.message}`;
    case 'ConsolidationDimMismatch':
      return `consolidation: vector dim mismatch at index ${e.at}: expected ${e.expected}, got ${e.got}`;
    case 'ConsolidationInvalidParameter':
      return `consolidation: invalid parameter '${e.field}' — ${e.message}`;
    case 'RerankModelLoad':
      return `rerank model load failed (${e.model}): ${e.message}`;
    case 'RerankInference':
      return `rerank inference failed: ${e.message}`;
    case 'RerankDisabled':
      return `rerank disabled (FOLKLORE_RERANK is not set)`;
  }
};

/**
 * Actionable remediation hint for an error, or null when there is no
 * obvious fix the user can run.
 *
 * `formatError` answers "what went wrong"; `hintFor` answers "what do I
 * do about it." Round-3 multi-LLM UX review flagged this as one of the
 * three top ADD-NOW items: every CLI callsite that prints `formatError`
 * leaves the user staring at a typed message with no next step.
 *
 * Architectural note: hints are CLI-facing, but living next to the
 * error definitions keeps the mapping discoverable and prevents
 * scattered ad-hoc strings across each command. CLI renderers can
 * still suppress or rewrite by passing `--no-hints`.
 */
export const hintFor = (e: AppError): string | null => {
  switch (e.type) {
    // ─── graph state ──────────────────────────
    case 'GraphReadError':
      // Most common cause on first run: graph.json doesn't exist yet.
      // The path-bearing message already shows ENOENT.
      return /ENOENT|no such file/i.test(e.message)
        ? 'fix: run `folklore trigger` to populate the graph (this is normal on first run).'
        : 'fix: run `folklore doctor --fix` and check the file is readable.';
    case 'GraphParseError':
      return `fix: graph file is corrupted at ${e.path}. Restore from backup or move it aside and run \`folklore trigger\` to rebuild.`;
    case 'GraphWriteError':
      return 'fix: check disk space and that no other folklore process is holding the write lock (`folklore doctor`).';

    // ─── vectors / embedder ───────────────────
    case 'VectorOpenError':
      return 'fix: run `folklore doctor --fix` to reset the sqlite-vec store, or check the file permissions on `~/.folklore/vectors.db`.';
    case 'ModelLoadError':
      // The model is fetched lazily on first embed (~90 MB for
      // all-MiniLM-L6-v2). Either the cache is missing or the
      // download failed.
      return 'fix: check network access; the embedder downloads ~90 MB on first use. Re-run `folklore doctor` to retry, or set `FOLKLORE_MODEL_CACHE` to a writable directory.';

    // ─── peer / network ───────────────────────
    case 'PeerDialError':
      // Distinguish actionable causes by string-matching the inner
      // message — gives the right hint without adding new error
      // variants. Round-3 review flagged this string-typed reason
      // as a separate concern; keep the call-to-action correct.
      if (/timeout/i.test(e.message)) {
        return `fix: peer is unreachable. Verify the address (\`${e.addr}\`), your firewall, and that the remote peer's daemon is running.`;
      }
      if (/ECONNREFUSED/i.test(e.message)) {
        return 'fix: remote port refused the connection. The peer may be offline or listening on a different address.';
      }
      return 'fix: re-check the multiaddr; for diagnostics run `folklore peer list`.';

    case 'PeerIdentityReadError':
    case 'PeerIdentityParseError':
      return 'fix: run `folklore identity init` to (re)create the peer identity, or `folklore identity import <hex>` to restore.';

    // ─── share / privacy ──────────────────────
    case 'SecretDetected':
      // SecretDetected is the user's most-confusing error: an opaque
      // node id and a list of pattern names with no path forward.
      // Hint points at the two real fixes.
      return `fix: the node was BLOCKED before reaching the network — your secret is safe locally. Either remove the credential from the source content, or mark the node private. Inspect the node with \`folklore get-node ${e.nodeId}\`.`;

    case 'ShareAuditBlocked':
      return `fix: review flagged nodes with \`folklore lint\` and either remove the secrets or mark them private.`;

    // ─── identity / signing ───────────────────
    case 'IdentityKeyGenerationError':
      return 'fix: run `folklore identity init` to create your DID, or `folklore onboard` to run the full setup wizard.';
    case 'IdentityBadSignatureError':
    case 'IdentityDeviceAuthorizationError':
      return 'fix: the identity chain failed to verify. If this is your own identity, `folklore identity rotate` regenerates the device key under your existing DID.';

    // Default: no actionable suffix.
    default:
      return null;
  }
};

/**
 * Convenience for CLI renderers — `formatError` plus an optional
 * `hintFor` newline-suffix. Most CLI callsites should use this rather
 * than calling the two helpers separately.
 *
 *   ask: graph read error at ~/.folklore/graph.json: ENOENT
 *     → fix: run `folklore trigger` to populate the graph (this is normal on first run).
 *
 * Returns just the formatted error when there is no hint.
 */
export const formatErrorWithHint = (e: AppError): string => {
  const base = formatError(e);
  const hint = hintFor(e);
  return hint ? `${base}\n  → ${hint}` : base;
};
