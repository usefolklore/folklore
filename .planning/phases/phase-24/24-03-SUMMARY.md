---
phase: phase-24
plan: 03
subsystem: wire-protocol
tags: [v5-cutover, wave-1b, federation, search-sync, touch-protocol, share-envelope, peer-pull-telemetry, rooms-deletion, breaking-change]
dependency_graph:
  requires:
    - phase: phase-24-01
      provides: "AkashikNodeFields with workspace + private, no room (schema wedge)"
    - phase: phase-24-02
      provides: "share-store / system-rooms / rooms-config files deleted"
  provides:
    - "V5 SearchRequest / SearchResponse / PeerMatch (no room, protocol_version: 5)"
    - "V5 TouchRequest / TouchResponse (no room, protocol_version: 5, private-node gate)"
    - "V5 ShareEnvelope (no room validation)"
    - "V5 FederatedSearchParams / FederatedMatch (no room param, no room field)"
    - "Peer-only PeerPullTelemetry (room dimension dropped — Open Question 5)"
    - "SearchError.protocolMismatch — pre-V5 envelope rejection error type"
  affects:
    - "Wave 2: share-sync.ts rewrite (now has stable V5 envelopes to read)"
    - "Wave 3: ~47 surgical edits at PeerMatch / FederatedMatch consumer sites"
    - "All inbound libp2p search + touch streams (pre-V5 peers now receive explicit refusal)"
tech-stack:
  added: []
  patterns:
    - "Envelope-layer V5 enforcement — libp2p protocol-path string (/akashik/{search,touch}/1.0.0) is unchanged; protocol version lives in the JSON envelope as `protocol_version: 5`. Pre-V5 peers receive a clear envelope-parse refusal payload, not 'protocol not handled'."
    - "Two V5 gates per inbound handler: (1) reject any envelope with a `room` field (pre-V5 signature), (2) reject any envelope without `protocol_version === 5`."
    - "Outbound sender fence — both search and touch initiators assert `protocol_version === 5` before transmit so no V4-shaped envelope can leave this peer even if a caller bypasses the type system."
key-files:
  created: []
  modified:
    - path: "src/infrastructure/search-sync.ts"
      change: "Drop room from SearchRequest/Response/PeerMatch; add protocol_version: 5; inbound V5 guard + outbound fence; drop loadSharedRooms+searchByRoom* path; rate-limiter key remains peer-only"
    - path: "src/domain/errors.ts"
      change: "Add SearchProtocolMismatch variant + SE.protocolMismatch constructor + formatError case; drop SearchUnauthorized (room-level auth replaced by node-level private gate)"
    - path: "src/application/peer-pull-telemetry.ts"
      change: "Rewrite to peer-only — drop room param + system-rooms import + staleWindowFor; per-peer signal preserved (source_peer / also_from_peers)"
    - path: "src/domain/touch.ts"
      change: "TouchRequest: drop room, add protocol_version: 5; TouchResponse: add protocol_version: 5; TouchResponseError: drop room-not-shared/room-too-large, add protocol-mismatch/too-large"
    - path: "src/infrastructure/touch-protocol.ts"
      change: "Drop loadSharedRooms + system-rooms imports; replace per-room filter with non-private + freshest-by-fetched_at; inbound V5 guard; outbound openTouchStream sheds room param"
    - path: "src/domain/share-envelope.ts"
      change: "Drop the `n.room` presence check in validateShareablePayload; header documents V5 envelope contract"
    - path: "src/application/federated-search.ts"
      change: "Drop FederatedSearchParams.room + FederatedMatch.room; outbound SearchRequest carries protocol_version: 5; askGossip called with null topic; local query routing collapsed to searchHybrid / searchGlobal"
key-decisions:
  - "Libp2p protocol-path stays `/akashik/{search,touch}/1.0.0` — V5 is enforced at the envelope layer, not via a new protocol id. Pre-V5 peers get clean refusal payloads rather than 'protocol not handled' transport errors. Documented in commit messages."
  - "ShareEnvelope validates payload shape but no longer requires `n.room` — the underlying ShareableNode.room field is Wave 2/3 cleanup; this layer narrows scope to what the envelope itself controls."
  - "Open Question 5 RESOLVED — peer-pull-telemetry rewritten to per-peer (not deleted). The room dimension was extra; the peer dimension still drives reputation and consensus."
  - "TouchResponseError grows a `protocol-mismatch` variant so V4 initiators see a structured refusal payload alongside the dropped `room-not-shared` (which was only meaningful when rooms existed)."
patterns-established:
  - "Envelope V5 guard: inbound handlers run two checks before any work — (a) reject `room` field if present, (b) require `protocol_version === 5`. Replicated identically in search-sync and touch-protocol so the next wire protocol that needs V5 can copy the same pattern."
  - "Outbound V5 fence: senders assert protocol_version before transmit. Protects against accidental V4 envelopes leaving the peer when a caller bypasses the type system or test code path constructs a partial object."
requirements-completed:
  - ROOMS-DEL-05

# Metrics
duration: ~40 min
completed: 2026-05-27
---

# Phase 24 Plan 03: V5 Wire-Protocol Cutover Summary

**Wave 1b — stripped `room` from 5 federation wire envelopes (SearchRequest, SearchResponse, PeerMatch, TouchRequest, ShareEnvelope) and the peer-pull-telemetry record; added `protocol_version: 5` literals + ProtocolMismatch error variant so pre-V5 peers receive structured refusal payloads rather than transport-level "protocol not handled" errors.**

## Final V5 Envelope Shapes

### SearchRequest (src/infrastructure/search-sync.ts)

```ts
export interface SearchRequest {
  readonly type: 'search';
  readonly protocol_version: 5;
  readonly embedding: number[];   // JSON-safe — reconstructed as Float32Array on inbound
  readonly k: number;
}
```

### SearchResponse (src/infrastructure/search-sync.ts)

```ts
export interface SearchResponse {
  readonly type: 'search_response';
  readonly protocol_version: 5;
  readonly matches: ReadonlyArray<Omit<PeerMatch, '_source_peer'>>;
  readonly error?: 'dimension_mismatch' | 'rate_limited' | 'protocol' | 'protocol_mismatch';
}
```

### PeerMatch (src/infrastructure/search-sync.ts)

```ts
export interface PeerMatch {
  readonly node_id: string;
  readonly wing?: string;
  readonly distance: number;
  readonly label?: string;
  readonly source_uri?: string;
  readonly _source_peer: string | null;  // null = local, peerId string = remote
}
```

### TouchRequest (src/domain/touch.ts)

```ts
export interface TouchRequest {
  readonly type: 'touch';
  readonly protocol_version: 5;
  readonly max_nodes?: number;
}
```

### TouchResponse (src/domain/touch.ts)

```ts
export interface TouchResponse {
  readonly type: 'touch-response';
  readonly protocol_version: 5;
  readonly nodes: readonly GraphNode[];
  readonly redactions_applied: number;
  readonly error?: TouchResponseError;  // 'rate-limited' | 'too-large' | 'protocol-mismatch' | 'internal-error'
}
```

### ShareEnvelope (src/domain/share-envelope.ts)

The envelope type itself (`SignedEnvelope<ShareableNode>`) lives in `src/domain/identity.ts` and is structurally unchanged. The payload validator no longer requires `n.room`:

```ts
const validateShareablePayload = (n: ShareableNode): Result<void, ShareEnvelopeError> => {
  if (!n || typeof n !== 'object')                        return err(...);
  if (typeof n.id !== 'string' || n.id.length === 0)      return err(...);
  if (typeof n.label !== 'string' || n.label.length === 0) return err(...);
  // V5: no `n.room` check — authorization is per-node via `private: boolean`
  // (enforced upstream of signing).
  ...
};
```

### PeerPullTelemetry (record shape, src/domain/peer-telemetry.ts consumed by src/application/peer-pull-telemetry.ts)

The wire-emitted record no longer populates `room`:

```ts
return {
  query,
  // room: omitted (V5)
  took_ms, took_local_ms, took_merge_ms,
  bytes_received, result_count, distinct_sources,
  peers_alive, peers_queried, peers_responded, peers_timed_out, peers_errored,
  satisfaction, decision,
  coverage_map: null,
  emitted_at,
};
```

### SearchError.protocolMismatch (src/domain/errors.ts)

```ts
export type SearchError =
  | { readonly type: 'SearchDimensionMismatch'; readonly expected: number; readonly got: number }
  | { readonly type: 'SearchRateLimited';       readonly peer: string }
  | { readonly type: 'SearchProtocolError';     readonly peer: string; readonly message: string }
  | { readonly type: 'SearchTimeout';           readonly peer: string; readonly elapsedMs: number }
  | { readonly type: 'SearchProtocolMismatch';  readonly message: string };

export const SearchError = {
  ...
  protocolMismatch:  (message: string): SearchError => ({ type: 'SearchProtocolMismatch', message }),
};
```

## Performance

- **Duration:** ~40 min
- **Tasks:** 3 (across 5 atomic file commits)
- **Files modified:** 7
- **Files newly compiling tasks:** 0 (per-plan: Wave 2/3 still has tsc fallout — expected)

## Open Question 5 — RESOLVED

**Question:** Delete or rewrite `peer-pull-telemetry.ts`?
**Decision:** Rewrite to peer-only. The per-peer signal (source_peer / also_from_peers) still drives reputation, consensus diagnostics, and the satisfaction scorer's consensus component. Only the room slice was extra weight.

**LOC delta (peer-pull-telemetry.ts):** 113 → 128 lines. The slight increase is JSDoc explaining the V5 cutover decision; functional code shrank (removed `staleWindowFor`, removed system-room imports, removed room propagation through `nodeRoom`).

## Task Commits

Each task atomically committed:

1. **Task 1: search-sync.ts + errors.ts (V5 protocol + ProtocolMismatch)** — `e79f71d` (feat)
2. **Task 2: peer-pull-telemetry.ts rewrite to peer-only** — `93d26b7` (refactor)
3. **Task 3a: touch-protocol.ts + touch.ts (V5 envelope + private gate)** — `5145b6a` (feat)
4. **Task 3b: share-envelope.ts (drop room validation)** — `6a8e0e1` (feat)
5. **Task 3c: federated-search.ts (drop room param, emit V5 envelopes)** — `d656378` (feat)

All commits on `feat/delete-rooms`. No co-authored commits (per user's global CLAUDE.md). Not pushed.

## Decisions Made

### Libp2p protocol-path stays at `/akashik/{search,touch}/1.0.0`

Per the plan's critical constraint #4 — V5 is enforced at the envelope layer, not via a new libp2p protocol id. Pre-V5 peers get clean refusal payloads (`error: 'protocol_mismatch'` for search, `error: 'protocol-mismatch'` for touch) plus a stderr log line pointing at `docs/architecture/V5-PROTOCOL.md`, rather than `protocol not handled` transport-level errors. This is the right tradeoff because the user has no live peers — there's no reason to make pre-V5 transport probes harder than necessary to diagnose, and the refusal payload still carries the version-skew signal where operators look first.

### Outbound V5 fence

Both `openSearchStream` and `openTouchStream` runtime-assert `protocol_version === 5` before transmitting. This is a defence-in-depth fence: TypeScript already constrains the envelope type, but a partial object constructed in test code or a Wave 2 caller that bypasses the type system shouldn't be able to leak a V4-shaped envelope. If the fence fires, the asker fails locally with `protocolError` rather than confusing the receiver.

### TouchResponseError reshape

Pre-V5 `TouchResponseError` was `'room-not-shared' | 'rate-limited' | 'room-too-large' | 'internal-error'`. The two room-* codes were the room-authorization gate. V5 drops both and adds `'protocol-mismatch'` (for the V5 guard) and `'too-large'` (room-agnostic size cap that already existed semantically). This is a wire-error-code break, but Wave 2 consumers in `share.ts` / CLI haven't started yet — the next wave inherits the cleaner code set.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] peer-pull-telemetry.ts plan-prescription mismatch**
- **Found during:** Task 2 (peer-pull-telemetry rewrite)
- **Issue:** The plan's task-2 prescription (`recordPull(peerId, ...)`, `getTelemetry(peerId)`, `listAllTelemetry()` API; bucket keyed on `${peerId}:${room}`; persistence at `peer-pull-telemetry/<peer>/<room>.json`) described a file shape that does not match the actual `peer-pull-telemetry.ts`. The real file is a pure transformer (`buildPeerPullTelemetry(params)`) that builds an agent-session telemetry record from a `FederatedSearchResult` — it has no Map, no persistence, and no per-record CRUD API. The peer signal is carried per-match via `source_peer` / `also_from_peers`.
- **Fix:** Honoured the plan's INTENT (drop room dimension, keep peer signal) over its literal prescription. Removed `BuildTelemetryParams.room`, removed the emitted `room` field from the output record, removed `staleWindowFor()` (system-room specific), removed the `import from system-rooms.js`, and replaced room-specific stale windows with a single `DEFAULT_STALE_AFTER_DAYS` (14d). The per-match `source_peer` / `also_from_peers` peer signal is unchanged — that's what reputation actually uses.
- **Files modified:** `src/application/peer-pull-telemetry.ts`
- **Verification:** Zero `room?: string|Room|RoomId` fields; zero `system-rooms` imports; both peer-keyed identifiers (`source_peer` / `_source_peer`) still present. Acceptance criterion B3 (literal `peerId` ≥ 3) cannot meaningfully apply to this file's actual API shape; tracked here as the intent-vs-literal divergence.
- **Committed in:** `93d26b7`

**2. [Rule 3 - Blocking] TouchError.roomNotShared kept but no longer constructed by handler**
- **Found during:** Task 3a (touch-protocol.ts)
- **Issue:** `TouchError.roomNotShared` exists in `src/domain/errors.ts` and is still wired into `formatError`. With the V5 cutover the touch handler can never construct it (no room-level gate), but removing the variant from the union is a Wave 2/3 surface change that touches `formatError` switch exhaustiveness across the AppError union. Out of scope for this wire-protocol-focused plan.
- **Fix:** Left the `roomNotShared` constructor in place; the touch initiator no longer maps any `remote:*` string to it. Wave 2/3 cleanup will remove it from the union along with the underlying ShareableNode.room field. Tracked here so the next wave's reviewer knows it's a dangling-but-harmless constructor.
- **Files modified:** None (intentional non-change)
- **Verification:** `grep -n "roomNotShared" src/infrastructure/touch-protocol.ts` returns zero — the handler no longer references it.
- **Committed in:** N/A (no code change required)

---

**Total deviations:** 2 auto-fixed (1 plan-prescription mismatch, 1 deferred-cleanup tracking).
**Impact on plan:** Plan intent fully delivered. The two deviations are: (a) honouring intent over a literal API spec that didn't match reality; (b) leaving one error-variant cleanup for Wave 2/3 where it naturally belongs alongside the ShareableNode.room field removal.

## Self-Check: PASSED

```
grep -rnE "^\s*(readonly\s+)?room\??:\s*(string|Room|RoomId)" \
  src/infrastructure/search-sync.ts \
  src/infrastructure/touch-protocol.ts \
  src/domain/share-envelope.ts \
  src/domain/touch.ts \
  src/application/federated-search.ts \
  src/application/peer-pull-telemetry.ts
→ 0 matches  PASS

grep -c "protocol_version" src/infrastructure/search-sync.ts        → 20  PASS (≥ 2)
grep -c "protocol_version" src/infrastructure/touch-protocol.ts     → 10  PASS
grep -c "protocol_version" src/domain/touch.ts                      →  2  PASS
grep -c "protocol_version" src/application/federated-search.ts      →  1  PASS

grep -c "protocolMismatch\|ProtocolMismatch" src/domain/errors.ts   →  4  PASS (≥ 3)

git log feat/delete-rooms ^main | grep "24-03"                      →  5 commits  PASS

[ -f .planning/phases/phase-24/24-03-SUMMARY.md ]                   →  PASS
```

## Issues Encountered

None — the V5 envelope changes were mechanical once the protocol-version literal landed; the deviation list above covers everything that required judgement.

## Next Phase Readiness

- V5 wire types are stable. Wave 2 (share-sync.ts rewrite) and Wave 3 (~47 surgical edits at PeerMatch / FederatedMatch consumer sites) can now type-check against immutable envelope contracts.
- `tsc --noEmit` still has Wave 0 / Wave 1 blast-radius errors at consumer sites (expected per plan); the V5 wire types themselves are clean.
- The TouchError.roomNotShared variant (and related `ShareableNode.room` in `src/domain/sharing.ts`) are tracked for Wave 2/3 cleanup.

---
*Phase: phase-24*
*Plan: 03*
*Completed: 2026-05-27*
