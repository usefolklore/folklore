# Akashik v5 — Wire Protocol

**Version:** 0.5 (draft, supersedes [`V4-PROTOCOL.md`](./V4-PROTOCOL.md))
**Status:** Reference implementation shipped in Akashik v5.x on `feat/delete-rooms`; spec stabilising ahead of v5.0 tag
**Date:** 2026-05-27
**Audience:** Implementers of cross-agent persistent memory, P2P application authors, anyone building on free LLMs

---

## 1. Motivation — why V5 breaks the wire

V3 established the P2P memory primitives — cryptographic identity (W3C
`did:key`), the cross-model embedding bridge, binary-quantised vector storage.
V4 added the agent-brain layer — persistent daemon, episodic→semantic
consolidation, query cache, cross-process write coordination. Both kept the
`room` abstraction as the unit of federation: per-room Y.Docs, room-keyed
reputation, an explicit room field on every wire envelope.

V5 deletes rooms entirely. Two debates (rooms-abstraction and
rooms-deprecation, see `.planning/debates/`) ran in late May 2026; the
synthesis killed the rename-to-tags alternative because of canonical-
authority and Y.Doc-boundary problems, and chose hard deletion over a
graceful compatibility window because the protocol had no live federation
partners to break.

**Replacement primitives (LOCKED):**

- **`workspace?: string`** — optional node field, populated from
  `slugify(basename(git rev-parse --show-toplevel))` at index time. Read-side
  pre-filter only. **Local-only — never enters federation, never enters
  reputation.**
- **`private: boolean`** (default `false`) on every graph node. Sharing
  becomes a filter on `private === false`. `akashik save --private`
  sets it. **Replaces `shared-rooms.json` entirely** for the binary-privacy
  case.

Everything in V3-PROTOCOL.md still applies for identity, envelopes, bridge
registry, and binary-512 quantisation. V4's daemon IPC, query cache, batched
embedder, and consolidator are untouched. V5 changes **only** the federation
layer (search / recall / touch / share envelopes) and the storage layer
(rooms.json + shared-rooms.json gone, single global Y.Doc instead of per-
room).

---

## 2. Required envelope discipline

Every inbound federation envelope **MUST** carry `protocol_version: 5`. Any
envelope with `protocol_version !== 5` is rejected with a
`SearchProtocolMismatch` (or its per-protocol equivalent) and the stream is
closed. Any envelope that still carries a `room` field is rejected as a
pre-V5 V4 payload, regardless of the protocol-version value — a defensive
extra guard against partial upgrades.

The implementation lives in `src/infrastructure/search-sync.ts`,
`recall-sync.ts`, `touch-protocol.ts`, and the share-sync subscribe
handshake. All four call sites carry the same two-pronged guard:

```ts
if ('room' in envelope) reject('peer sent V4 envelope with `room` field');
if (envelope.protocol_version !== 5) reject('peer speaks pre-V5 protocol');
```

Error wording in production (search-sync.ts:330):

```
peer at <peerId> sent V4 SearchRequest with `room` field. This peer
is on V5; the `room` field is removed. See docs/architecture/V5-PROTOCOL.md.
```

The `ProtocolMismatchError` family is in `src/domain/errors.ts` —
`SearchProtocolMismatch` (search), `TouchProtocolError` (touch),
`InboundUpdateRejected` (share-sync), `recall_err.protocol_mismatch` (recall).

---

## 3. Envelope shapes — V5

All envelopes are length-prefixed JSON frames over libp2p streams.

### 3.1 `SearchRequest` / `SearchResponse` — `/akashik/search/1.0.0`

(see `src/infrastructure/search-sync.ts` for the live definitions)

```ts
export interface SearchRequest {
  readonly type: 'search';
  readonly protocol_version: 5;
  readonly embedding: number[];   // JSON-safe; reconstructed as Float32Array on inbound
  readonly k: number;
}

export interface PeerMatch {
  readonly node_id: string;
  readonly wing?: string;
  readonly distance: number;
  readonly label?: string;
  readonly source_uri?: string;
  readonly _source_peer: string | null;   // null = local; peerId = remote
}

export interface SearchResponse {
  readonly type: 'search_response';
  readonly protocol_version: 5;
  readonly matches: ReadonlyArray<Omit<PeerMatch, '_source_peer'>>;
  readonly error?: 'dimension_mismatch' | 'rate_limited' | 'protocol' | 'protocol_mismatch';
}
```

**Removed in V5:** `SearchRequest.room`, `SearchResponse.room`, `PeerMatch.room`.

### 3.2 `RecallRequest` / `RecallResponse` — `/akashik/recall/1.0.0`

(see `src/infrastructure/recall-sync.ts`)

```ts
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
  readonly mention_count: number;     // peer's own count, not aggregate
  readonly hits: readonly RecallPeerHit[];
}

export interface RecallError {
  readonly type: 'recall_err';
  readonly reason: 'unknown_entity' | 'unauthorized' | 'rate_limited' | 'invalid_request';
}
```

**Removed in V5:** `RecallRequest.room`, `RecallPeerHit.room`, the
`unauthorized_room` error reason. The responder now applies a per-node
`node.private === false` gate; rooms-level authorisation is gone.

### 3.3 `TouchRequest` / `TouchResponse` — `/akashik/touch/1.0.0`

(see `src/domain/touch.ts`)

```ts
export interface TouchRequest {
  readonly type: 'touch';
  readonly protocol_version: 5;
  readonly max_nodes?: number;        // optional client cap; responder cap still applies
}

export interface TouchResponse {
  readonly type: 'touch-response';
  readonly protocol_version: 5;
  readonly nodes: readonly GraphNode[];
  readonly redactions_applied: number;  // audit evidence
  readonly error?: 'rate-limited' | 'too-large' | 'protocol-mismatch' | 'internal-error';
}
```

**Semantic change:** pre-V5 touch meant "give me your N freshest nodes in
room R." V5 touch means "give me your N freshest non-private nodes." The
responder filters on `node.private === false` only; there is no room-level
authorisation gate, and the special `TouchRoomNotShared` error variant is
retired from new envelopes (the type alias still exists in
`src/domain/errors.ts` to keep older error logs decodable).

### 3.4 `SubscribeRequest` — `/akashik/share/2.0.0`

(see `src/infrastructure/share-sync.ts`)

```ts
interface SubscribeRequest {
  readonly type: 'subscribe';
  readonly protocol_version: 5;
}
```

**Removed in V5:** the `rooms: string[]` array that used to negotiate which
rooms a peer wanted to subscribe to. Subscribe is now a one-shot "I'm online
— sync me." handshake; the per-node `private` flag is the only authorisation
gate.

### 3.5 `ShareEnvelope` — the share-sync update payload

The `validateShareablePayload` shape in `src/domain/share-envelope.ts`
already conforms to V5 (Phase 24-03 dropped the `room` field). Each update
is a signed envelope carrying one or more `ShareableNode` payloads whose
`private` field MUST be `false` (the V5 gate). The author DID, signature,
and replay nonce are unchanged from V4.

---

## 4. Single-Y.Doc storage model

V4 maintained a `Map<RoomId, Y.Doc>` keyed by room id; each room had its
own `~/.akashik/<room>.ydoc` file and a separate CRDT replication
boundary. V5 collapses this to a single global Y.Doc at
`~/.akashik/graph.ydoc`. Convergence at the node-id level is provided
by Y.Map exactly as before — Y.js does not care that the partition layer
disappeared from above it.

Migration consequences:

- Pre-existing per-room `.ydoc` files are **left in place** by
  `akashik migrate v5`. They are orphaned but harmless — the V5 boot
  path creates `graph.ydoc` on first run and never reads the old files. A
  Phase 25+ GC pass may remove them.
- The single Y.Doc loads faster on cold start (one mmap, one decode) and
  uses less RSS than the prior per-room map.

---

## 5. Sharing gate — `node.private === false`

V4 sharing was room-authorisation: a node was shareable if it belonged to a
room listed in `shared-rooms.json`. V5 sharing is per-node:

- `akashik save --private` sets `private: true` on the new node →
  never federates.
- `akashik save` (no flag) → `private: false` → eligible for
  federation, subject to secrets-scanner gate and bandwidth limits.

The sharing gate is enforced at four sites:

1. `share-sync.ts:collectShareable(graph)` — outbound CRDT update assembly.
2. `recall-sync.ts:answerRecall` — per-node `node.private !== false ?
   skip : include` filter on the recall responder.
3. `touch-protocol.ts:handleTouchRequest` — same gate on touch responses.
4. `share-envelope.ts:validateShareablePayload` — inbound update validator
   asserts `private === false` on every node it accepts.

---

## 6. Reputation subject scheme — `entity:*` only

Pre-V5 reputation had two parallel subject schemes:
- `entity:<canonical_entity_id>` — derived from `mentioned_entities` on
  each hit.
- `room:<room_name>` — a secondary scheme for "this peer answered well
  about room R."

V5 keeps only `entity:*`. The peer-reputation runtime
(`src/infrastructure/peer-reputation-store.ts`) deny-lists any
`room:`-prefixed subject key at both read and write time;
`akashik migrate v5` flattens the on-disk record so the disk file is
also V5-clean. See [`peer-reputation-design.md`](../p2p/peer-reputation-design.md)
§ V5 Update for the full rationale — the design always preferred `entity:*`
as the canonical subject; V5 just retired the room fallback.

Peers whose entire reputation lived in `room:*` subjects lose their scores
in the flatten. This is acceptable per the locked decision —
`peer-reputation-design.md:84-87` always identified entity-derived subjects
as the primary, audit-stable signal.

---

## 7. Migration — `akashik migrate v5`

V5 ships a one-shot CLI migration that converts a V4 home directory to
V5. The command is **idempotent** — running it twice prints
"Already on V5." and exits 0.

```
akashik migrate v5            # forward migration
akashik migrate v5 --rollback # restore graph.json from backup
```

Behaviour (see `src/cli/commands/migrate.ts`):

1. **Detect.** Sample the first 50 nodes; if no `room` field on any AND
   neither `rooms.json` nor `shared-rooms.json` exists → "Already on V5."
2. **Backup.** Atomic copy `graph.json` → `graph.v4-backup.json`.
   Refuses to clobber an existing backup.
3. **Transform.** Strip `room` from every node. Set `private: false`
   where absent. Heuristic `workspace` inference: slugify the room name;
   if `$HOME/personal/<slug>` or `$HOME/code/<slug>` (or other configured
   roots) exists, set `workspace: <slug>`; otherwise leave it unset.
4. **Reputation.** Flatten `peer-reputation.json` by deleting every
   `peers[*].subjects[room:*]` entry.
5. **Delete.** Remove `rooms.json`, `shared-rooms.json`, and any stale
   `shared-rooms.json.lock`.
6. **Audit.** Print per-stage counts.

Rollback restores only the graph blob. `rooms.json` + `shared-rooms.json`
deletions and reputation flattening are **one-way** — the migration
prints loud warnings about this on the rollback path, and the doctor
nag persists until the user opts into the forward migration.

The boot path does **not** auto-migrate. `akashik doctor` samples 10
random nodes on every run and prints a yellow nag warning if any carry a
`room` field or if `rooms.json` / `shared-rooms.json` still exists. This
is a deliberate "explicit opt-in to a one-way data transform" UX —
auto-migration was the loser of Open Question 6 in the Plan 24-11
decision log.

---

## 8. Cross-references

- `src/infrastructure/search-sync.ts` — search wire protocol.
- `src/infrastructure/recall-sync.ts` — recall wire protocol + per-node
  private gate.
- `src/infrastructure/touch-protocol.ts` — touch wire protocol.
- `src/domain/touch.ts` — touch envelope types.
- `src/domain/share-envelope.ts` — share-sync payload validator.
- `src/cli/commands/migrate.ts` — V4→V5 migration command.
- `src/cli/commands/doctor.ts` — V5 schema readiness check.
- [`V4-PROTOCOL.md`](./V4-PROTOCOL.md) — deprecated; preserved for
  migration reference.
- [`V3-PROTOCOL.md`](./V3-PROTOCOL.md) — archived; preserved for
  historical reference.
- [`peer-reputation-design.md`](../p2p/peer-reputation-design.md) — see
  V5 Update section for the entity-only subject scheme.
- `.planning/phases/phase-24/` — full phase log (CONTEXT.md, RESEARCH.md,
  Plans 01-12).

---

## 9. Compatibility notice

V5 is a **hard break** from V4. There is no compatibility window, no
shim, no "either V4 or V5 accepted" mode. A peer running V4 dialling a V5
peer (or vice versa) receives a `ProtocolMismatchError` and the stream
closes. The decision is documented in
`.planning/debates/rooms-deprecation-2026-05-27/SYNTHESIS.md` — the user
had no live federation partners at cutover time, so the operational risk
of a hard break was zero.

If a third party builds against this spec after 2026-05-27, they SHOULD
target V5 directly; V4 should be treated as historical reference.

---

*Phase: phase-24*
*Plan: 11*
*Spec drafted: 2026-05-27*
