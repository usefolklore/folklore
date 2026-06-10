---
phase: 15-peer-foundation-security
plan: "04"
subsystem: tests
tags: [peer, sharing, secrets-scan, libp2p, tdd, node-test, neverthrow]
dependency_graph:
  requires:
    - 15-01 (scanNode, auditRoom, buildPatterns, ScanError)
    - 15-02 (loadOrCreateIdentity, dialAndTag, loadPeers, savePeers, addPeerRecord, removePeerRecord)
  provides:
    - 37 automated tests covering all 11 Phase 15 requirements (PEER-01..05, SEC-01..06)
    - Regression guard for regex lastIndex statefulness bug
  affects:
    - tests/phase15.peer-security.test.ts (new)
tech_stack:
  added: []
  patterns:
    - node:test describe/test grouping by requirement ID
    - mkdtempSync + rmSync cleanup for hermetic I/O tests
    - Structural source-text assertion (readFileSync + assert.match) for SEC-05
    - Pure unit tests for domain functions; async identity tests use tmp dirs
key_files:
  created:
    - tests/phase15.peer-security.test.ts
  modified: []
decisions:
  - "import.meta.dirname used for SEC-05 source path (portable, no __dirname hack)"
  - "twopers() helper function returns fresh PeersFile copy per test to prevent cross-test mutation"
  - "SEC-06 12D3 prefix assertion confirmed against live generated PeerId from loadOrCreateIdentity"
  - "All 37 tests went GREEN on first run — no RED phase needed (implementations from Plans 01+02 were already complete)"
metrics:
  duration_seconds: 180
  completed_date: "2026-04-12T08:15:34Z"
  tasks_completed: 1
  tasks_total: 1
  files_created: 1
  files_modified: 0
---

# Phase 15 Plan 04: Peer Foundation + Security Test Suite Summary

**One-liner:** 37 node:test assertions across 12 describe groups covering all 11 Phase 15 requirements — secrets scanner, share audit, ed25519 identity, peer store, Noise structural check, and regex statefulness regression guard.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Create tests/phase15.peer-security.test.ts covering PEER-01..05 + SEC-01..06 | cb46402 | tests/phase15.peer-security.test.ts |

## What Was Built

### tests/phase15.peer-security.test.ts (474 lines)

One comprehensive test file using `node:test` (no additional framework), matching the project's established test pattern.

**SEC-01 (13 tests):** Every one of the 10 built-in secret patterns exercised individually with a concrete matching value in the relevant field (`label` or `source_uri`). Verifies `match.patternName` and `match.field` on each result. Plus: `buildPatterns` returns exactly 10, and merges a custom pattern to 11.

**SEC-02 (2 tests):** `scanNode` error discriminant (`type === 'SecretDetected'`, `nodeId` correct, `matches.length > 0`). `auditRoom` blocked count for a 3-node mixed list.

**SEC-03 (2 tests):** `Object.keys(result.value)` contains neither `file_type` nor `source_file`. All six safe fields (`id`, `label`, `room`, `source_uri`, `fetched_at`, `embedding_id`) present when populated.

**SEC-04 (4 tests):** Mixed list produces correct allowed/blocked counts; all-clean list; empty list; two flagged nodes each receive independent match arrays.

**SEC-05 (1 test):** `readFileSync` on `peer-transport.ts` source then `assert.match(src, /connectionEncrypters:\s*\[noise\(\)\]/)` — contiguous pattern, not disjoint keyword presence.

**SEC-06 (1 test):** Live `loadOrCreateIdentity` call in tmp dir; PeerId string `startsWith('12D3')` asserted (ed25519 multihash, base58btc encoding convention).

**PEER-01 (3 tests):** File absent → generates JSON with `privateKeyB64`, `peerId`, `createdAt`. Two consecutive loads return identical `peerId`. `privateKey.raw.byteLength === 64`.

**PEER-02 (1 test):** Dynamic `import()` of peer-transport module; `typeof mod.dialAndTag === 'function'`.

**PEER-03 (3 tests):** `removePeerRecord` by id leaves correct remainder; nonexistent id returns unchanged file; single-peer removal yields empty array.

**PEER-04 (4 tests):** `savePeers` + `loadPeers` atomic roundtrip; nonexistent path returns `{ peers: [] }`; `addPeerRecord` upserts addrs on duplicate id; inserts new record on absent id.

**PEER-05 (1 test):** `privateKey.raw.slice(32).byteLength === 32` (public key slice); `peerId` is a defined string.

**Regression (2 tests):** Two consecutive flagged scans both return `isErr()` (no lastIndex leak). Flagged scan followed by clean scan — clean node returns `isOk()` (no false-positive bleed).

## Verification

```
node --import tsx --test tests/phase15.peer-security.test.ts
  tests 37 | suites 12 | pass 37 | fail 0

npm test
  tests 70 | suites 12 | pass 70 | fail 0 (33 pre-existing + 37 new)
```

## Deviations from Plan

None — plan executed exactly as written. Tests went GREEN on first run because the implementations from Plans 01 (domain) and 02 (infrastructure) were already complete and correct.

## Self-Check: PASSED

- [x] tests/phase15.peer-security.test.ts exists (474 lines, > 200 minimum)
- [x] All 11 requirements (PEER-01..05, SEC-01..06) have at least one test
- [x] All 10 secret patterns tested individually (SEC-01)
- [x] Identity generate-then-load cycle tested with stable PeerId (PEER-01)
- [x] SEC-05 asserts contiguous `/connectionEncrypters:\s*\[noise\(\)\]/` pattern
- [x] SEC-06 asserts PeerId starts with `12D3` prefix
- [x] Regex statefulness regression test present and passing
- [x] Commit cb46402 exists
- [x] Full test suite (npm test) 70/70 pass, zero regressions
