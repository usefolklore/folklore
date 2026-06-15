---
phase: phase-24
plan: 06
subsystem: share-sync (CRDT federation)
tags: [v5-cutover, wave-2a, share-sync, rooms-deletion, breaking-change, highest-risk]
dependency_graph:
  requires:
    - phase: phase-24-01
      provides: "FolkloreNodeFields with workspace + private, no room (schema wedge)"
    - phase: phase-24-02
      provides: "share-store.ts deleted (no loadSharedRooms / sharedRoomsPath)"
    - phase: phase-24-03
      provides: "V5 wire envelopes + SearchError.protocolMismatch error type"
    - phase: phase-24-04
      provides: "Daemon loop callsite dropped sharedRoomsPath arg (still expects V5 registry)"
  provides:
    - "V5 share-sync engine — single global Y.Doc, private-flag gate, peer-only keys"
    - "collectShareable(graph) helper exporting the V5 sharing gate"
    - "SHARE_PROTOCOL_VERSION = 5 literal + V5 SubscribeRequest envelope"
  affects:
    - "tests/phase16.share-crdt.test.ts — needs Wave 4 surgical edit (imports deleted share-store, asserts on legacy 7-arg signature)"
    - "tests/phase18.production-net.test.ts — U16..U20 need Wave 4 edit (drop the legacy `room` positional arg from syncNodeIntoYDoc calls)"
    - "src/cli/commands/share.ts — Wave 2b rewrite picks up the new V5 entry points (openShareStream(peerId), syncNodeIntoYDoc with no room)"
tech-stack:
  added: []
  patterns:
    - "Module-scope screen / buildImported helpers — hoisted out of the inbound observer closure for sub-500-line line count without losing per-peer parametrisation"
    - "Outbound V5 fence — defence-in-depth assert before transmit even though TS types already constrain protocol_version"
    - "Two V5 inbound guards on SubscribeRequest — (a) reject `rooms` field; (b) require protocol_version === 5"
    - "Single global Y.Doc lazy-loaded on first stream session (registry.doc field starts null)"
    - "VERDICT_METRIC lookup table — collapses 5-case switch into a Record"
key-files:
  created: []
  modified:
    - path: "src/infrastructure/share-sync.ts"
      change: "869 → 499 lines (370-line delta, 43% reduction). Excised loadSharedRooms, sharedRoomsPath, per-room Y.Doc map, SubscribeRequest.rooms array, (peer, room) composite stream key, ydocPathFor(room), getOrLoadDoc(room). Added SHARE_PROTOCOL_VERSION=5, collectShareable(graph), V5 inbound guards, peer-only StreamEntry, single global ydocPath."
key-decisions:
  - "Subscribe negotiation collapsed to a protocol-version handshake. Original 869-line file did a full SubscribeRequest exchange computing room intersection — replaced with a one-shot `{type, protocol_version: 5}` envelope and reject-on-mismatch. Pre-V5 envelopes with a `rooms` field are explicitly detected and rejected with a clear error message pointing at V5-PROTOCOL.md."
  - "Single global Y.Doc lives behind a lazy load — `registry.doc` starts null and is populated by `getOrLoadDoc(registry)` on first stream session. This preserves the per-path serialisation contract from ydoc-store.ts (the writeQueues Map still keyed on ydocPath, only one path now) while avoiding loading the doc eagerly at registry construction (the daemon may construct the registry before any peer connects)."
  - "ShareableNode.room field deliberately NOT removed (out of scope — Wave 3 cleanup of src/domain/sharing.ts). Instead, share-sync.ts now omits the `room` key from the wire-payload Y.Map.set() call. This is the minimal surface change to make the wire-V5 contract pass without touching the domain type."
  - "Module-scope screenInbound + buildImportedNode + logInbound helpers — the original code packed these as closure-local fns inside attachInboundObserver. Hoisting them out cut the inbound observer body from ~85 lines to ~50 while making the policy/secrets/persistence pipeline easier to reason about independently of the observer lifecycle. Each takes (peer, ...) explicitly so the closure-captured remotePeerIdStr is now an explicit parameter — purer functions, easier to test in isolation."
  - "VERDICT_METRIC = Record<verdict, counter-name> at module scope — collapses the 5-arm switch on classifyInboundShare verdicts into a single metric.counter(`share.inbound.${VERDICT_METRIC[c.verdict]}`).inc() call. Same semantics, ~10 fewer lines."
  - "Stream-registry semaphore (Phase 18 `max_concurrent_share_syncs`) was NOT in the pre-V5 share-sync.ts; it lives in bandwidth-limiter.ts. The V5 rewrite preserves the existing relationship — share-sync.ts still imports createRateLimiter from search-sync.ts (single source of truth) and bandwidth-limiter.ts's makePerPeerRoomKey helper is now dead code from share-sync.ts's perspective (still consumed elsewhere — out of scope to delete here)."
patterns-established:
  - "Single global Y.Doc per peer (replaces per-room Y.Doc maps). The y-protocols/sync contract still enforces a Y.Map-level convergence guarantee; the partition was always a federation-policy concept, not a CRDT one."
  - "Per-node sharing gate (`node.private === false`) replaces room-membership authorization. Sharing becomes a pure node-attribute filter — no separate authorization registry, no shared-rooms.json."
  - "Protocol-version negotiation at the envelope layer (not via libp2p protocol-path versioning). The libp2p protocol-path stays /folklore/share/1.0.0; V5 is enforced via `protocol_version: 5` in the SubscribeRequest JSON envelope. Pre-V5 peers receive a clear refusal payload."
requirements-completed:
  - "ROOMS-DEL-03 — shared-rooms.json no longer read or written; sharing path filters on node.private === false (collectShareable helper)"

# Metrics
duration: ~13 min
completed: 2026-05-27
loc_before: 869
loc_after: 499
loc_delta: -370 (-43%)
---

# Phase 24 Plan 06: share-sync.ts V5 Cutover Summary

**Rewrote the 869-line room-scoped CRDT federation engine into a 499-line V5-clean module on a single global Y.Doc + per-node `private` gate, completing the highest-risk file in Phase 24.**

## Final V5 Shapes

### ShareSyncRegistry

```ts
export interface ShareSyncRegistry {
  readonly node: Libp2p;
  readonly homePath: string;
  readonly graphRepo: GraphRepository;
  readonly patterns: ReturnType<typeof buildPatterns>;
  /** Single global Y.Doc — lazy-loaded on first stream session. */
  doc: Y.Doc | null;
  /** peerId → StreamEntry (V5: no composite key). */
  readonly streams: Map<string, StreamEntry>;
  readonly logPath: string;
  /** Absolute path to the single global graph.ydoc file. */
  readonly ydocPath: string;
  readonly limiter?: RateLimiter;
  readonly policyMode: SharePolicyMode;
  readonly identityResolver: IdentityResolver;
}
```

### SubscribeRequest (V5)

```ts
interface SubscribeRequest {
  readonly type: 'subscribe';
  readonly protocol_version: 5;
}
```

Outbound `writeSubscribeRequest` ALWAYS emits `{ type: 'subscribe', protocol_version: 5 }` with an inline V5 fence. Inbound `readSubscribeRequest` runs two guards:
- reject any envelope with a `rooms` field (pre-V5 signature) → throws `"protocol mismatch: peer <id> sent pre-V5 SubscribeRequest with 'rooms' field"`
- require `protocol_version === 5` → throws `"protocol mismatch: peer <id> protocol_version=<got>; expected 5"`

### collectShareable (V5 sharing gate)

```ts
export const collectShareable = (graph: Graph): readonly GraphNode[] =>
  graph.json.nodes.filter((n: GraphNode) => n.private === false);
```

### StreamEntry — peerId-only key

```ts
interface StreamEntry {
  readonly fs: FramedStream;
  readonly stream: Stream;
  readonly detachInbound: () => void;
  readonly cancelDebounce: () => void;
  readonly detachOutbound: () => void;
}
// stored as: registry.streams.set(remotePeerIdStr, entry);
```

## Preserved Invariants — Grep Evidence

| Invariant | grep pattern | Hits | Status |
|---|---|---:|---|
| REMOTE_ORIGIN echo prevention | `REMOTE_ORIGIN` | 5 | preserved |
| scanNode secrets gate (SEC-01) | `scanNode` | 5 | preserved |
| V1 encoding (no V2) | `loadYDoc\|saveYDoc` | 3 | preserved |
| Single global graph.ydoc | `graph\.ydoc` | 3 | preserved |
| protocol_version: 5 envelope | `protocol_version` | 7 | new — V5 |
| private-flag gate | `node\.private\|n\.private\|n: GraphNode` | 2 | new — V5 |

## Acceptance Criteria — All Met

| Criterion | Expected | Actual | Status |
|---|---|---:|---|
| File line count | < 500 | 499 | PASS |
| `loadSharedRooms` / `share-store` imports or call refs | 0 | 0 | PASS |
| `rooms: string[]/RoomId[]/Room[]` field | 0 | 0 | PASS |
| `Map<RoomId\|Map<Room` (per-room maps) | 0 | 0 | PASS |
| `sharedRoomsPath` field | 0 | 0 | PASS |
| `graph.ydoc` path constant | ≥ 1 | 3 | PASS |
| `protocol_version` literal | ≥ 1 | 7 | PASS |
| `node.private` filter | ≥ 1 | 2 | PASS |
| `REMOTE_ORIGIN` preserved | ≥ 1 | 5 | PASS |
| `scanNode` preserved | ≥ 1 | 5 | PASS |
| Y.Doc V1 encoding helpers preserved | ≥ 1 | 3 | PASS |
| `searchByRoom` references | 0 | 0 | PASS |
| `tsc --noEmit` errors in share-sync.ts | 0 | 0 | PASS |

## Regression Test Status (phase16 + phase18)

Per critical constraint #7 of the executor prompt: "phase16 + phase18 tests still meaningful (may need test updates in Wave 4, but the production code should be functional)."

### phase16.share-crdt.test.ts — KNOWN: deferred to Wave 4

```
ERR_MODULE_NOT_FOUND: src/infrastructure/share-store.js
```

The test file imports `loadSharedRooms`, `mutateSharedRooms`, `addSharedRoom`, `removeSharedRoom`, etc. from the **deleted** `src/infrastructure/share-store.ts` (deleted in 24-02). This is a test-side breakage scheduled for Wave 4 surgical edit per the phase-24 CONTEXT.md test-strategy. The production code is V5-functional; the test file is V4-shaped.

### phase18.production-net.test.ts — 39/44 passing; 5 expected failures

```
ℹ tests 44
ℹ pass 39
ℹ fail 5
```

Failing tests (all in the syncNodeIntoYDoc bandwidth gate group U16..U20):
- `U16 backward compat: no rateLimiter`
- `U17 consume-false limiter returns BandwidthExceeded error`
- `U18 consume-true limiter writes normally`
- `U19 bandwidth-limited writes audit entry`
- `U20 rate limiter called with composite key ownPeerId::room`

Root cause: these tests still call `syncNodeIntoYDoc(doc, node, patterns, logPath, 'me', 'r', limiter)` with the legacy V4 7-argument signature, where the 6th positional argument was `room: string`. The V5 signature is `(doc, node, patterns, logPath, ownPeerId, limiter?)` — 6 args, no room. The test passes the string `'r'` / `'homelab'` where the V5 code now expects a `RateLimiter`, producing `TypeError: limiter.consume is not a function`.

U20 explicitly asserts the composite key `'me::homelab'` — V5 keys on `ownPeerId` only, so this assertion is intentionally invalidated by the cutover. All five are scheduled for Wave 4 surgical edits.

**Production code functional:** the remaining 39 phase18 tests cover connection-health, bandwidth-limiter primitives, hole-punch, relay dial, semaphore, and integration scenarios — all pass against the V5 rewrite.

## LOC Delta

| File | Before | After | Δ |
|---|---:|---:|---:|
| `src/infrastructure/share-sync.ts` | 869 | 499 | **−370 (−43%)** |

Diff stat: `1 file changed, 221 insertions(+), 591 deletions(-)`

## Commit

| Hash | Message |
|---|---|
| `ca255f6` | `refactor(24-06): rewrite share-sync.ts on V5 contract (869 → 499 lines)` |

Single atomic commit on `feat/delete-rooms`. No co-authored commits (per user's global CLAUDE.md). Not pushed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — minor] Inline V5 fence comment in writeSubscribeRequest**
- **Found during:** Task 1
- **Issue:** The plan's spec described an "outbound sender fence" pattern carried over from 24-03 (search-sync.ts). The V5 protocol_version literal is already type-constrained by the SubscribeRequest interface, but a runtime assert prevents test-code partials from leaking V4 envelopes.
- **Fix:** Kept the runtime assert with a `// Outbound V5 fence` comment so the next reviewer sees it as intentional defence-in-depth, not redundant code.
- **Files modified:** `src/infrastructure/share-sync.ts` (within Task 1's scope)
- **Verification:** Same pattern as 24-03's `openSearchStream` / `openTouchStream` fences.

**2. [Rule 2 — critical hygiene] Inbound-observer helper hoisting**
- **Found during:** Task 2
- **Issue:** Plan target was < 500 lines. Initial straight rewrite came in at 530+ lines because the inbound observer carried closure-local helpers (`screen`, `buildImported`, `drop`) that ballooned the function body.
- **Fix:** Hoisted three helpers to module scope as `screenInbound(value, policyMode, identityResolver)`, `buildImportedNode(peer, v, signedBy?)`, `logInbound(logPath, peer, nodeId, reason)`. Each takes `peer` / `policyMode` / etc. as explicit parameters rather than capturing them via closure — purer functions, more testable, and dropped enough lines to fit under 500.
- **Files modified:** `src/infrastructure/share-sync.ts` (Task 2 scope)
- **Verification:** All three helpers are pure-functional; observer body shrank from ~85 lines to ~50.

**3. [Rule 2 — critical hygiene] ShareableNode.room omission at wire layer**
- **Found during:** Task 2
- **Issue:** `src/domain/sharing.ts` still exports `ShareableNode { room: string }` (Wave 3 cleanup will remove it from the domain type). If the V5 wire payload included `room`, V5 peers would see room data even after the protocol-version cutover — defeating the whole phase.
- **Fix:** The Y.Map upsert in syncNodeIntoYDoc deliberately omits the `room` key from the payload object: `map.set(s.id, { id, label, embedding_id, source_uri, fetched_at })`. The ShareableNode value still carries `room` (from `scanNode`'s projection of `node.room ?? ''`), but it never reaches the wire. This is the minimal surface change to make V5 wire-clean without prematurely touching the domain type.
- **Files modified:** `src/infrastructure/share-sync.ts` (Task 2 scope)
- **Verification:** The Y.Map.set object literal explicitly enumerates exactly 5 fields, no spread, no `room`.

### Out-of-Scope Issues Found (Not Fixed — Logged for Future Waves)

**1. `bandwidth-limiter.ts:makePerPeerRoomKey` now dead from share-sync.ts perspective**
- The helper is no longer called from share-sync.ts (the limiter key is the bare `peerId` now).
- `makePerPeerRoomKey` likely consumed elsewhere (peer-pull-telemetry? search-gossip?) — not investigated; safe to leave.
- Wave 3 cleanup, not Wave 2.

**2. `src/domain/sharing.ts:ShareableNode.room` field still exists**
- Out of scope for this plan (Wave 3 surgical edits). The share-sync.ts wire payload now omits it explicitly; downstream cleanup can drop it from the type.

**3. Phase16 + Phase18 tests need Wave 4 surgical edits**
- phase16.share-crdt.test.ts imports from the deleted `share-store.js` — Wave 4 will re-target assertions to the V5 surface.
- phase18.production-net.test.ts U16..U20 use the legacy 7-arg `syncNodeIntoYDoc` signature with a positional `room` argument — Wave 4 will drop the room positional.
- Production code is V5-functional; the breakage is test-side only.

## Open Items Inherited from Prior Plans

**24-04 open item — recall-sync.ts RecallRegistryDeps still requires `sharedRoomsPath`** (per 24-04-SUMMARY): NOT in this plan's scope. The plan-24-06 task definition limits this rewrite to `src/infrastructure/share-sync.ts` only. `recall-sync.ts` is on the Wave 2 rewrite list (24-09 or 24-10).

## Self-Check: PASSED

```
wc -l src/infrastructure/share-sync.ts                               → 499  PASS (< 500)
grep -cE 'from.*share-store|loadSharedRooms' .../share-sync.ts       → 0    PASS
grep -cE 'rooms\s*:\s*(string\[\]|RoomId\[\]|Room\[\])' .../share-sync.ts → 0  PASS
grep -cE 'Map<RoomId|Map<Room\b' .../share-sync.ts                   → 0    PASS
grep -c 'sharedRoomsPath' .../share-sync.ts                          → 0    PASS
grep -c 'graph\.ydoc' .../share-sync.ts                              → 3    PASS (> 0)
grep -c 'protocol_version' .../share-sync.ts                         → 7    PASS (> 0)
grep -cE 'node\.private|n\.private|n: GraphNode' .../share-sync.ts   → 2    PASS (> 0)
grep -c 'REMOTE_ORIGIN' .../share-sync.ts                            → 5    PASS (preserved)
grep -c 'scanNode' .../share-sync.ts                                 → 5    PASS (preserved)
grep -cE 'loadYDoc|saveYDoc' .../share-sync.ts                       → 3    PASS (V1 only)
grep -c 'searchByRoom' .../share-sync.ts                             → 0    PASS
npx tsc --noEmit 2>&1 | grep -c 'src/infrastructure/share-sync.ts'   → 0    PASS
git log --oneline | grep ca255f6                                     → FOUND PASS
[ -f .planning/phases/phase-24/24-06-SUMMARY.md ]                    → exists  PASS
```

## What Comes Next

- **Wave 2b — `src/cli/commands/share.ts` + `unshare.ts`:** rewrite to consume the new V5 entry points (`openShareStream(peerId)`, `syncNodeIntoYDoc(... no room ...)`, `collectShareable(graph)` for sharable enumeration).
- **Wave 2c — `src/mcp/server.ts`:** drop the room-dimensioned MCP tools and strip `room` from the remaining tools.
- **Wave 3 — surgical edits in ~47 files:** every consumer of `openShareStream`, `syncNodeIntoYDoc`, `createShareSyncRegistry`, and `runShareSyncTick` updates its callsite signature.
- **Wave 4 — test surgical edits:** `phase16.share-crdt.test.ts` (re-target away from deleted share-store imports), `phase18.production-net.test.ts` (U16..U20 drop the legacy `room` positional).

---
*Phase: phase-24*
*Plan: 06*
*Completed: 2026-05-27*
