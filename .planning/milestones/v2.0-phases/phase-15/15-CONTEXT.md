# Phase 15: Peer Foundation + Security - Context

**Gathered:** 2026-04-12
**Status:** Ready for planning

<domain>
## Phase Boundary

Peer identity, manual peer management, secrets scanning, and share audit. Establishes the security model BEFORE any room-level sharing (Phase 16). Delivers 5 CLI commands (`peer add/remove/list/status`, `share audit`) and the foundational P2P transport layer.

</domain>

<decisions>
## Implementation Decisions

### Peer Identity & Key Management
- ed25519 keypair stored at ~/.folklore/peer-identity.json as raw base64 JSON (research confirms `.raw` property gives the correct 64 bytes directly — protobuf framing is unnecessary at the storage layer; libp2p's `unmarshalEd25519PrivateKey()` accepts the raw Uint8Array)
- PeerId derived via libp2p standard (multihash of public key) for interoperability
- Keypair auto-generated on first `peer` command (lazy, no explicit init step)
- New `src/domain/peer.ts` for PeerId/PeerInfo/PeerRegistry types + pure validation; `src/infrastructure/peer-transport.ts` for libp2p I/O

### P2P Transport & Connection Model
- Listening port configurable via config.yaml, default 0 (OS-assigned) to avoid conflicts
- Persistent connections with auto-reconnect (matches NET-04 requirement)
- Minimal libp2p module set: @libp2p/tcp + @libp2p/noise (SEC-05) + @libp2p/yamux
- Known peers stored in `~/.folklore/peers.json` (separate from identity, survives restarts)

### Secrets Scanner Design
- Scan all shareable fields: label, source_uri, fetched_at (content/raw text already excluded by SEC-03)
- Regex-based pattern set, extensible via config.yaml — ship with 8-10 patterns (sk-, ghp_, AKIA, Bearer, password=, etc.)
- Hard block on detection (SEC-02): refuse to share flagged nodes, log clear warning, no --force override
- Scan triggered on `share room` and `share audit` commands (at the sharing boundary, not on every insert)

### Share Audit & Metadata Boundary
- Shared fields per SEC-03: id, label, room, embedding vector, source_uri, fetched_at — no file_type, source_file, or raw text
- Audit output: table by default, --json flag for machine-readable output
- Audit shows both what WILL be shared and count of blocked nodes with reasons
- New `src/domain/sharing.ts` for ShareableNode type (subset of GraphNode), scanNode, auditRoom pure functions

### Claude's Discretion
- None — all questions explicitly decided

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/domain/graph.ts` — Graph/GraphNode/GraphEdge types, immutable graph operations, room filtering
- `src/domain/rooms.ts` — RoomRegistry, RoomMeta, validateRoomId, slugifyRoomName
- `src/domain/errors.ts` — GraphError with factory methods (parseError, readError, etc.)
- `src/infrastructure/config-loader.ts` — YAML config loader with typed defaults and neverthrow Results
- CLI command pattern: `(args: string[]) => Promise<number>` registered in `src/cli/index.ts`

### Established Patterns
- Functional DDD: pure domain types + functions in src/domain, I/O in src/infrastructure
- neverthrow Result/ResultAsync for all fallible operations — no throws
- sequenceLazy thunks for sequential async chains (prevents eager race conditions)
- Config at ~/.folklore/config.yaml with defaults baked into loader
- Immutable data: all domain types use readonly fields, transformations return new values

### Integration Points
- `src/cli/index.ts` command router — add `peer` and `share` commands
- `src/infrastructure/config-loader.ts` — extend AppConfig with peer section
- `src/domain/graph.ts` GraphNode — ShareableNode is a projection of existing fields
- `~/.folklore/` runtime directory — add peer-identity.json and peers.json

</code_context>

<specifics>
## Specific Ideas

- js-libp2p confirmed in PROJECT.md (2.5K stars, pushed Apr 11) — verified via gh API
- 4 new deps: libp2p (core) + @libp2p/tcp, @libp2p/noise, @libp2p/yamux (3 plugin modules)
- Peer authentication (SEC-06) handled natively by libp2p Noise handshake — no extra code needed

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>
