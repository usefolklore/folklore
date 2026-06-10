# Phase 15: Peer Foundation + Security - Validation

**Created:** 2026-04-12
**Purpose:** Per-wave test commands and Nyquist compliance documentation.

---

## Wave 1 (Plan 15-01): Domain types + security functions

**Automated verification:**
```bash
# Type-check domain files compile cleanly
npx tsc --noEmit src/domain/peer.ts src/domain/sharing.ts src/domain/errors.ts src/infrastructure/config-loader.ts

# Existing tests unbroken
npm test

# SEC-03: ShareableNode excludes file_type and source_file
grep -c "file_type\|source_file" src/domain/sharing.ts  # expect 0

# Regex statefulness guard present
grep -c "re.lastIndex = 0" src/domain/sharing.ts  # expect 1

# PeerStoreReadError/PeerStoreWriteError present in errors.ts
grep -c "PeerStoreReadError\|PeerStoreWriteError" src/domain/errors.ts  # expect >= 4
```

**Nyquist note:** Wave 1 creates pure domain functions. Tests for these functions are in Plan 15-04 (wave 3). This is acceptable because:
1. Domain functions are type-checked by `tsc --noEmit` in wave 1 (compile-time correctness).
2. The behavior tests in 15-04 exercise the actual implementations — they are not stubs.
3. Splitting tests into a separate plan keeps each plan within context budget.

---

## Wave 2 (Plan 15-02): Infrastructure layer + npm deps

**Automated verification:**
```bash
# Dependencies installed at correct versions
npm ls libp2p @libp2p/tcp @libp2p/noise @libp2p/yamux

# Type-check infrastructure files
npx tsc --noEmit src/infrastructure/peer-transport.ts src/infrastructure/peer-store.ts

# Existing tests unbroken
npm test

# No raw .then() in generate chain (architecture compliance)
grep -c "\.then(" src/infrastructure/peer-transport.ts  # expect 0

# peer-store.ts uses store error types, not identity error types
grep -c "storeReadError\|storeWriteError" src/infrastructure/peer-store.ts  # expect >= 2
grep -c "identityReadError\|identityWriteError" src/infrastructure/peer-store.ts  # expect 0

# hangUpPeer uses transportError, not notFound
grep -A2 "hangUpPeer" src/infrastructure/peer-transport.ts | grep -c "transportError"  # expect 1
```

**Nyquist note:** Wave 2 creates infrastructure I/O wrappers. Integration tests are in Plan 15-04 (wave 3). This is acceptable because:
1. `loadOrCreateIdentity` and `peer-store` involve filesystem I/O — tests need tmp dirs.
2. The test file exercises the real filesystem round-trip (generate, write, read, compare PeerId).
3. Tests could not run RED before implementations exist (they import the modules).

---

## Wave 3 (Plan 15-03 + 15-04): CLI commands + comprehensive tests

**Plan 15-03 verification:**
```bash
# Type-check CLI files
npx tsc --noEmit src/cli/commands/peer.ts src/cli/commands/share.ts src/cli/index.ts

# Commands registered
grep "peer" src/cli/index.ts
grep "share" src/cli/index.ts

# Full type-check
npx tsc --noEmit

# Full test suite
npm test
```

**Plan 15-04 verification (TDD test suite):**
```bash
# Run phase 15 tests specifically
node --import tsx --test tests/phase15.peer-security.test.ts

# Run full test suite (no regressions)
node --import tsx --test tests/*.test.ts
```

**Nyquist note:** Plan 15-04 is wave 3 (not wave 2) because:
1. Tests are integration-level — they import actual implementations from Plans 01 + 02.
2. SEC-05 structural assertion reads `peer-transport.ts` source (must exist first).
3. The TDD RED phase is verified by confirming each test references an actual behavior (not vacuously true).
4. Moving tests to wave 2 would require stub implementations that get replaced — more complexity, not less.

---

## Wave 3 justification summary

Wave 3 contains both the CLI layer (15-03) and the test suite (15-04). These can run in parallel since 15-04 depends on [15-01, 15-02] but NOT on 15-03. The test file tests domain + infrastructure, not CLI commands.

```
Wave 1:  15-01 (domain types + security functions)
Wave 2:  15-02 (infrastructure + deps)
Wave 3:  15-03 (CLI commands)  |  15-04 (tests) — parallel, no file conflicts
```

---

## Cross-wave validation commands

After ALL waves complete:
```bash
# Full type-check
npx tsc --noEmit

# Full test suite
npm test

# Phase-specific tests
node --import tsx --test tests/phase15.peer-security.test.ts

# Verify all 11 requirements have tests
grep -c "describe.*SEC-0[1-6]\|describe.*PEER-0[1-5]" tests/phase15.peer-security.test.ts  # expect 11
```
