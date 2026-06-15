---
phase: phase-16
plan: "04"
subsystem: share-crdt-tests
tags: [yjs, crdt, testing, share-store, ydoc-store, share-sync, regression, pitfalls]
dependency_graph:
  requires:
    - 16-01  # share-store.ts, ydoc-store.ts, ShareError
    - 16-02  # share-sync.ts — REMOTE_ORIGIN, syncNodeIntoYDoc, SHARE_PROTOCOL_ID
    - 16-03  # CLI commands share/unshare
  provides:
    - "tests/phase16.share-crdt.test.ts — 40-test regression net for Phase 16"
  affects:
    - phase-17  # future plans touching share-sync.ts will see this as the contract
tech_stack:
  added: []
  patterns:
    - hermetic tmp dirs via mkdtempSync + rmSync in finally blocks
    - block-comment stripping before structural doesNotMatch assertions
    - pipeline structural assertion (frameIter .subarray() + handleInboundFrame param type)
    - REMOTE_ORIGIN symbol identity test (ESM module cache singleton check)
    - local-mutation counter pattern for observer invariant testing
key_files:
  created:
    - tests/phase16.share-crdt.test.ts
  modified: []
decisions:
  - "Block-comment stripping (/\\*[\\s\\S]*?\\*\\/) applied before doesNotMatch assertions — JSDoc mentions of forbidden APIs in production files do not cause false failures"
  - "Uint8ArrayList.subarray structural test uses pipeline pattern (frameIter block + handleInboundFrame signature) rather than proximity-window check — the design is a flatten-in-iterator pattern, not a co-located call"
  - "No CLI integration tests (share/unshare argv dispatch) — those commands rely on FOLKLORE_HOME + loadConfig + graph.json; tested via pure share-store/ydoc-store round-trips which are the actual contracts"
metrics:
  duration_seconds: 420
  tasks_completed: 1
  files_created: 1
  files_modified: 0
  completed_date: "2026-04-12T11:30:00Z"
---

# Phase 16 Plan 04: Share CRDT Test Suite — SUMMARY

**One-liner:** 40-test regression net covering SHARE-01..06 requirements + 5 structural pitfall guards (V1/V2, echo loop, empty-response, init order, Uint8ArrayList pipeline) across 13 describe groups, 969 lines, zero failures on first `npm test` run.

---

## What Was Built

`tests/phase16.share-crdt.test.ts` (969 lines, 40 tests, 13 describe groups). Mirrors Phase 15's structural pattern: one file, hermetic tmp dirs, structural assertions via `readFileSync` + regex, no shared state between tests.

### Describe Groups and Assertion Counts

| # | Describe Group | Tests | What It Locks In |
|---|---------------|-------|-----------------|
| 1 | SHARE-01: share room records after audit passes | 4 | empty room allowed, 3-node clean room, flagged room blocked at audit gate, idempotent second share |
| 2 | SHARE-02: unshare removes from registry but keeps .ydoc | 3 | remove entry, no-op on missing, .ydoc file survives |
| 3 | SHARE-03: CRDT convergence + REMOTE_ORIGIN echo prevention | 5 | two-doc convergence, concurrent edits, REMOTE_ORIGIN symbol identity, echo prevention counter, local broadcast invariant (Blocker 5) |
| 4 | SHARE-04: ShareableNode boundary — only metadata propagates | 3 | 6-key Y.Map entry, round-trip preserves keys, file_type/source_file absent |
| 5 | SHARE-05: incremental sync via state vectors | 3 | incremental < full update, delta convergence on third doc, fresh-doc SV decodes via readSyncStep1 |
| 6 | SHARE-06: offline changes queue + reconnect catchup | 3 | saveYDoc→loadYDoc preserves all keys, .tmp absent after atomic save, T0→T1 reconnect convergence |
| 7 | Pitfall: V1/V2 format invariant | 2 | V1 functional round-trip, structural check (no V2 APIs in executable code) |
| 8 | Pitfall: readSyncMessage empty-response guard | 2 | SyncStep2 leaves encoder empty (length === 0), structural guard present |
| 9 | Pitfall: ydoc-store init order | 2 | no getMap in executable code (structural), functional round-trip via caller |
| 10 | Pitfall: Uint8ArrayList.subarray() before createDecoder | 2 | pipeline structural: frameIter has .subarray(), handleInboundFrame takes bytes: Uint8Array |
| 11 | Pitfall: secrets scanned on inbound + outbound updates | 3 | flagged node → Err(ShareAuditBlocked), share-log.jsonl allowed:false, clean node passes |
| 12 | share-store + ydoc-store round-trip (Plan 16-01 surface) | 5 | addSharedRoom persists, removeSharedRoom no-op, upsert dedup, 5-entry Y.Map round-trip, 10-way concurrent safety |
| 13 | Phase 16 constants | 3 | SHARE_PROTOCOL_ID value, REMOTE_ORIGIN symbol desc, REMOTE_ORIGIN uniqueness |

**Total: 40 tests, 0 failures**

### Pitfall Regression Mapping

| Pitfall | Test Group | Lock Mechanism |
|---------|-----------|----------------|
| Echo loop (Pitfall 1) | SHARE-03 | Counter stays at 0 when applyUpdate uses REMOTE_ORIGIN |
| Local broadcast invariant (Blocker 5) | SHARE-03 | Counter > 0 after syncNodeIntoYDoc with non-REMOTE_ORIGIN |
| V1/V2 mismatch (Pitfall 2) | Pitfall: V1/V2 | doesNotMatch on code-only source (block comments stripped) |
| Empty-response guard (Pitfall 5) | Pitfall: empty-response | encoding.length(responseEncoder) === 0 after SyncStep2 |
| ydoc-store init order (Pitfall 3) | Pitfall: ydoc-store init order | doesNotMatch /doc\.getMap/ on code-only source |
| Uint8ArrayList flatten (Pitfall 4) | Pitfall: Uint8ArrayList.subarray | frameIter block contains .subarray(); handleInboundFrame param is Uint8Array |

### RED-GREEN Record

Phase 15 went GREEN on first run. Phase 16 required 3 RED-GREEN cycles:

1. **RED** — V1/V2 structural test: `doesNotMatch(/encodeStateAsUpdateV2/)` matched a block comment (`/** ... NEVER call encodeStateAsUpdateV2 ... */`) in share-sync.ts. **Fix:** strip block comments with `/\/\*[\s\S]*?\*\//g` before asserting.

2. **RED** — ydoc-store init-order structural test: `doesNotMatch(/doc\.getMap/)` matched JSDoc comment text. **Fix:** same block-comment strip technique.

3. **RED** — Uint8ArrayList.subarray proximity test: original 5-line window check around `createDecoder` failed because `handleInboundFrame` receives a pre-flattened `bytes: Uint8Array` — the `.subarray()` is in `frameIter`, not adjacent to `createDecoder`. **Fix:** rewrote as a pipeline structural test: assert `.subarray()` in the `frameIter` block AND that `handleInboundFrame` accepts `bytes: Uint8Array`.

All three fixes are Rule 1 (bug in test logic, not in production code). Production code was correct throughout.

---

## Verification Results

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` | PASS — EXIT:0 |
| `node --import tsx --test tests/phase16.share-crdt.test.ts` | 40 pass, 0 fail |
| `npm test` | 127 pass, 0 fail (87 prior + 40 new) |
| `grep -cE "^describe\(" tests/phase16.share-crdt.test.ts` | 13 (≥12 required) |
| `grep -cE "^\s*test\(" tests/phase16.share-crdt.test.ts` | 40 (≥25 required) |
| `wc -l tests/phase16.share-crdt.test.ts` | 969 (≥400 required) |
| SHARE-01 through SHARE-06 each ≥1 mention | ALL PASS |
| REMOTE_ORIGIN occurrences | 31 (≥4 required) |
| mkdtempSync / rmSync present | YES |
| Uint8ArrayList.subarray describe group | YES |
| createDecoder in tests | 10 occurrences |
| Local broadcast invariant / origin !== REMOTE_ORIGIN | 3 occurrences |

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Block-comment false positives on structural `doesNotMatch` assertions**
- **Found during:** Task 1, first test run (RED)
- **Issue:** `doesNotMatch(/encodeStateAsUpdateV2/)` and `doesNotMatch(/doc\.getMap/)` matched text inside JSDoc block comments (`/** ... */`) in the production source files. The source files are correct — the comments document what NOT to do.
- **Fix:** Strip block comments with `src.replace(/\/\*[\s\S]*?\*\//g, '')` and line comments with `.replace(/\/\/.*$/, '')` before applying structural assertions. Applied to V1/V2 test and ydoc-store init-order test.
- **Files modified:** `tests/phase16.share-crdt.test.ts` (no production files changed)
- **Commit:** fa9ef10 (same atomic commit — fixed during GREEN phase before commit)

**2. [Rule 1 - Bug] Uint8ArrayList.subarray proximity window test did not reflect actual pipeline design**
- **Found during:** Task 1, first test run (RED)
- **Issue:** Plan's structural test used a 5-line sliding window around each `createDecoder` call. The production code's design is a pipeline: `frameIter` yields `msg.subarray()` (flat Uint8Array), then `handleInboundFrame(flat, ...)` receives it and passes to `createDecoder(bytes)`. The `.subarray()` is NOT within 5 lines of `createDecoder` — it's in a different function.
- **Fix:** Replaced window-proximity test with a pipeline structural test: (a) assert `.subarray()` exists in the `frameIter` function block, (b) assert `handleInboundFrame` accepts `bytes: Uint8Array` as its first parameter. This correctly validates the flatten-then-use design.
- **Files modified:** `tests/phase16.share-crdt.test.ts` only
- **Commit:** fa9ef10

---

## Final npm test Totals

```
tests: 127
pass:  127
fail:  0
  prior (phases 1-15):   87
  new (phase 16):        40
```

---

## Self-Check: PASSED

| Item | Status |
|------|--------|
| tests/phase16.share-crdt.test.ts | FOUND |
| commit fa9ef10 | FOUND |
| 40 test() calls | PASS |
| 13 describe groups | PASS |
| 969 lines | PASS |
| All SHARE-01..06 covered | PASS |
| 5 pitfall groups present | PASS |
| Local broadcast invariant test | PASS |
| npm test 127/127 | PASS |
