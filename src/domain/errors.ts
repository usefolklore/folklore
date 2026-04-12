/**
 * Domain errors for the wellinformed knowledge graph.
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
 *   - `ShareError`      — room sharing, Y.js CRDT sync, shared-rooms.json I/O
 *   - `SearchError`     — federated search fan-out, rate limiting, auth (Phase 17)
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
 * Errors from the room-sharing bounded context (Phase 16).
 *
 * - ShareAuditBlocked        — `share room X` aborted because auditRoom found flagged nodes
 * - YDocLoadError / SaveError — .ydoc file I/O failures (binary Yjs state)
 * - SyncProtocolError        — libp2p stream / sync handshake failure with a specific peer
 * - InboundUpdateRejected    — secrets scanner blocked an update arriving from a peer (logged + dropped, no back-prop)
 * - ShareStoreReadError / WriteError — shared-rooms.json I/O (mirrors PeerStoreReadError pattern)
 */
export type ShareError =
  | { readonly type: 'ShareAuditBlocked';     readonly room: string; readonly blockedCount: number }
  | { readonly type: 'YDocLoadError';         readonly path: string; readonly message: string }
  | { readonly type: 'YDocSaveError';         readonly path: string; readonly message: string }
  | { readonly type: 'SyncProtocolError';     readonly peer: string; readonly message: string }
  | { readonly type: 'InboundUpdateRejected'; readonly peer: string; readonly room: string; readonly reason: string }
  | { readonly type: 'ShareStoreReadError';   readonly path: string; readonly message: string }
  | { readonly type: 'ShareStoreWriteError';  readonly path: string; readonly message: string };

export const ShareError = {
  shareAuditBlocked:     (room: string, blockedCount: number): ShareError => ({ type: 'ShareAuditBlocked', room, blockedCount }),
  ydocLoadError:         (path: string, message: string): ShareError => ({ type: 'YDocLoadError', path, message }),
  ydocSaveError:         (path: string, message: string): ShareError => ({ type: 'YDocSaveError', path, message }),
  syncProtocolError:     (peer: string, message: string): ShareError => ({ type: 'SyncProtocolError', peer, message }),
  inboundUpdateRejected: (peer: string, room: string, reason: string): ShareError => ({ type: 'InboundUpdateRejected', peer, room, reason }),
  shareStoreReadError:   (path: string, message: string): ShareError => ({ type: 'ShareStoreReadError', path, message }),
  shareStoreWriteError:  (path: string, message: string): ShareError => ({ type: 'ShareStoreWriteError', path, message }),
} as const;

// ─────────────────────── SearchError ──────────────────────

/**
 * Errors from the federated search bounded context (Phase 17).
 *
 * - SearchDimensionMismatch — inbound embedding length != 384 (local model dim)
 * - SearchUnauthorized      — peer requested a room not in local shared-rooms.json
 * - SearchRateLimited       — peer exceeded token bucket (10 req/s, burst 30)
 * - SearchProtocolError     — libp2p stream/dial/frame decode failure
 * - SearchTimeout           — per-peer 2s deadline exceeded during outbound fan-out
 */
export type SearchError =
  | { readonly type: 'SearchDimensionMismatch'; readonly expected: number; readonly got: number }
  | { readonly type: 'SearchUnauthorized';      readonly peer: string; readonly room: string }
  | { readonly type: 'SearchRateLimited';       readonly peer: string }
  | { readonly type: 'SearchProtocolError';     readonly peer: string; readonly message: string }
  | { readonly type: 'SearchTimeout';           readonly peer: string; readonly elapsedMs: number };

export const SearchError = {
  dimensionMismatch: (expected: number, got: number): SearchError => ({ type: 'SearchDimensionMismatch', expected, got }),
  unauthorized:      (peer: string, room: string): SearchError    => ({ type: 'SearchUnauthorized', peer, room }),
  rateLimited:       (peer: string): SearchError                  => ({ type: 'SearchRateLimited', peer }),
  protocolError:     (peer: string, message: string): SearchError => ({ type: 'SearchProtocolError', peer, message }),
  timeout:           (peer: string, elapsedMs: number): SearchError => ({ type: 'SearchTimeout', peer, elapsedMs }),
} as const;

// ─────────────────────── CodebaseError ───────────────────

/**
 * Errors from the structured codebase indexing bounded context (Phase 19).
 *
 * Split by failure surface:
 *   - DbOpenError / DbReadError / DbWriteError — code-graph.db I/O at infrastructure boundary
 *   - GrammarMissingError / ParseError        — tree-sitter grammar load + parse failures
 *   - CodebaseNotFoundError                   — lookup miss in codebases table
 *   - AttachFailedError                       — codebase_rooms join table mutations
 *   - InvalidPathError                        — user supplied path does not exist or is not a directory
 */
export type CodebaseError =
  | { readonly type: 'CodebaseDbOpenError';         readonly path: string; readonly message: string }
  | { readonly type: 'CodebaseDbReadError';         readonly message: string }
  | { readonly type: 'CodebaseDbWriteError';        readonly table: string; readonly message: string }
  | { readonly type: 'CodebaseGrammarMissingError'; readonly language: string; readonly message: string }
  | { readonly type: 'CodebaseParseError';          readonly file_path: string; readonly message: string }
  | { readonly type: 'CodebaseNotFoundError';       readonly codebase_id: string }
  | { readonly type: 'CodebaseAttachFailedError';   readonly codebase_id: string; readonly room_id: string; readonly message: string }
  | { readonly type: 'CodebaseInvalidPathError';    readonly path: string; readonly message: string };

export const CodebaseError = {
  dbOpenError:         (path: string, message: string): CodebaseError => ({ type: 'CodebaseDbOpenError', path, message }),
  dbReadError:         (message: string): CodebaseError               => ({ type: 'CodebaseDbReadError', message }),
  dbWriteError:        (table: string, message: string): CodebaseError => ({ type: 'CodebaseDbWriteError', table, message }),
  grammarMissingError: (language: string, message: string): CodebaseError => ({ type: 'CodebaseGrammarMissingError', language, message }),
  parseError:          (file_path: string, message: string): CodebaseError => ({ type: 'CodebaseParseError', file_path, message }),
  notFound:            (codebase_id: string): CodebaseError           => ({ type: 'CodebaseNotFoundError', codebase_id }),
  attachFailed:        (codebase_id: string, room_id: string, message: string): CodebaseError => ({ type: 'CodebaseAttachFailedError', codebase_id, room_id, message }),
  invalidPath:         (path: string, message: string): CodebaseError => ({ type: 'CodebaseInvalidPathError', path, message }),
} as const;

// ─────────────────────── AppError union ───────────────────

export type AppError = GraphError | VectorError | EmbeddingError | PeerError | ScanError | ShareError | SearchError | CodebaseError;

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
      return `share blocked: room '${e.room}' has ${e.blockedCount} flagged node(s)`;
    case 'YDocLoadError':
      return `ydoc load error at ${e.path}: ${e.message}`;
    case 'YDocSaveError':
      return `ydoc save error at ${e.path}: ${e.message}`;
    case 'SyncProtocolError':
      return `sync protocol error with peer ${e.peer}: ${e.message}`;
    case 'InboundUpdateRejected':
      return `inbound update rejected from ${e.peer} (room ${e.room}): ${e.reason}`;
    case 'ShareStoreReadError':
      return `share store read error at ${e.path}: ${e.message}`;
    case 'ShareStoreWriteError':
      return `share store write error at ${e.path}: ${e.message}`;
    case 'SearchDimensionMismatch':
      return `search dimension mismatch: expected ${e.expected}, got ${e.got}`;
    case 'SearchUnauthorized':
      return `search unauthorized: peer ${e.peer} requested unshared room '${e.room}'`;
    case 'SearchRateLimited':
      return `search rate limited for peer ${e.peer}`;
    case 'SearchProtocolError':
      return `search protocol error with peer ${e.peer}: ${e.message}`;
    case 'SearchTimeout':
      return `search timeout for peer ${e.peer} after ${e.elapsedMs}ms`;
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
    case 'CodebaseAttachFailedError':
      return `attach failed for codebase ${e.codebase_id} to room ${e.room_id}: ${e.message}`;
    case 'CodebaseInvalidPathError':
      return `invalid codebase path '${e.path}': ${e.message}`;
  }
};
