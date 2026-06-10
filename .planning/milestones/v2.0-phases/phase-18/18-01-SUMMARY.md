---
phase: phase-18
plan: "01"
subsystem: foundation
tags: [libp2p, nat-traversal, errors, config, peer-config, bandwidth]
dependency_graph:
  requires: []
  provides:
    - "@libp2p/circuit-relay-v2@4.2.0 installed (exact pin)"
    - "@libp2p/dcutr@3.0.15 installed (exact pin)"
    - "@libp2p/upnp-nat@4.0.15 installed (exact pin)"
    - "NetError union (6 variants) in src/domain/errors.ts"
    - "AppError union includes NetError (9th bounded context)"
    - "BandwidthConfig + BandwidthOverride interfaces in config-loader.ts"
    - "PeerConfig.relays / .upnp / .bandwidth / .bandwidth_overrides"
  affects:
    - "src/domain/errors.ts — AppError widened, formatError exhaustive switch extended"
    - "src/infrastructure/config-loader.ts — PeerConfig, DEFAULT_PEER, loadConfig parser"
    - "package.json + package-lock.json — 3 new exact-pin deps"
tech_stack:
  added:
    - "@libp2p/circuit-relay-v2@4.2.0 (ESM-only, circuit-relay client transport)"
    - "@libp2p/dcutr@3.0.15 (ESM-only, hole-punch upgrade via DCUtR)"
    - "@libp2p/upnp-nat@4.0.15 (ESM-only, UPnP port mapping, silent failure)"
  patterns:
    - "Tagged union error extension (same as SearchError / CodebaseError pattern)"
    - "factory-object-as-const constructors (same as all prior error bounded contexts)"
    - "Exhaustive switch without default clause (TypeScript narrowing gate)"
    - "YAML parser with num/bool/str/array helper functions (same config-loader pattern)"
key_files:
  modified:
    - path: package.json
      lines_added: 3
      description: "3 exact-pin libp2p deps — @libp2p/circuit-relay-v2, @libp2p/dcutr, @libp2p/upnp-nat"
    - path: package-lock.json
      lines_added: 206
      description: "Lock file regenerated with 16 transitive packages added"
    - path: src/domain/errors.ts
      lines_added: 45
      description: "NetError type (6 variants), factory (6 constructors), AppError union member, 6 formatError cases, JSDoc update"
    - path: src/infrastructure/config-loader.ts
      lines_added: 61
      description: "BandwidthConfig + BandwidthOverride interfaces, PeerConfig 4 new fields, DEFAULT_PEER 4 new defaults, loadConfig parser for relays/upnp/bandwidth/overrides"
decisions:
  - "ESM-only packages: @libp2p/circuit-relay-v2, @libp2p/dcutr, @libp2p/upnp-nat have no CJS export — require() fails with ERR_PACKAGE_PATH_NOT_EXPORTED. Dynamic import() works correctly (all three typeof function). This is expected for libp2p v3 ecosystem."
  - "NetError formatError cases added BEFORE closing brace of switch, AFTER CodebaseInvalidPathError — no default clause per exhaustiveness requirement."
  - "bandwidth_overrides appears as optional field in both PeerConfig interface and DEFAULT_PEER (intentionally omitted from object literal, resulting in undefined at runtime) — matches plan spec."
metrics:
  duration: "~8 minutes (2026-04-12T15:20:25Z to 2026-04-12T15:28:25Z)"
  tasks_completed: 3
  tasks_total: 3
  files_modified: 4
  completed_date: "2026-04-12"
---

# Phase 18 Plan 01: Foundation Layer Summary

**One-liner:** Three exact-pin libp2p NAT-traversal deps installed + NetError 6-variant union wired into AppError + PeerConfig extended with relays/upnp/bandwidth/overrides and conservative locked defaults.

## Tasks Completed

| Task | Description | Commit | Outcome |
|------|-------------|--------|---------|
| 1 | Install @libp2p/circuit-relay-v2@4.2.0, @libp2p/dcutr@3.0.15, @libp2p/upnp-nat@4.0.15 | `0e86ccb` | 3 deps at exact pins, 16 transitive packages, ESM-only verified via import() |
| 2 | Add NetError union + factory + extend AppError + formatError | `9a055bf` | 6 variants, 6 constructors, 9th AppError member, exhaustive switch extended |
| 3 | Extend PeerConfig with relays/upnp/bandwidth/overrides + DEFAULT_PEER + loadConfig parser | `3c6c426` | BandwidthConfig + BandwidthOverride interfaces, 4 new PeerConfig fields, 4 defaults, YAML parsing |

## New Exports

### src/domain/errors.ts

```typescript
export type NetError =
  | { readonly type: 'RelayDialFailed';    readonly addr: string; readonly message: string }
  | { readonly type: 'HolePunchTimeout';   readonly peer: string; readonly elapsedMs: number }
  | { readonly type: 'UPnPMapFailed';      readonly message: string }
  | { readonly type: 'BandwidthExceeded';  readonly peer: string; readonly room: string }
  | { readonly type: 'HealthDegraded';     readonly peer: string; readonly reason: 'disconnects' | 'idle' }
  | { readonly type: 'RelayNotConfigured' };

export const NetError = {
  relayDialFailed:    (addr, message) => ...,
  holePunchTimeout:   (peer, elapsedMs) => ...,
  upnpMapFailed:      (message) => ...,
  bandwidthExceeded:  (peer, room) => ...,
  healthDegraded:     (peer, reason) => ...,
  relayNotConfigured: () => ...,
} as const;

// AppError now:
export type AppError = GraphError | VectorError | EmbeddingError | PeerError | ScanError
  | ShareError | SearchError | CodebaseError | NetError;
```

### src/infrastructure/config-loader.ts

```typescript
export interface BandwidthConfig {
  readonly max_updates_per_sec_per_peer_per_room: number;  // default 50
  readonly max_concurrent_share_syncs: number;              // default 10
}

export interface BandwidthOverride {
  readonly max_updates_per_sec_per_peer_per_room?: number;
  readonly max_concurrent_share_syncs?: number;
}

// PeerConfig new fields:
readonly relays: readonly string[];                           // default []
readonly upnp: boolean;                                      // default true
readonly bandwidth: BandwidthConfig;                         // default {50, 10}
readonly bandwidth_overrides?: Readonly<Record<string, BandwidthOverride>>;  // default undefined
```

## Default Values

| Field | Default | Source |
|-------|---------|--------|
| `peer.relays` | `[]` | CONTEXT.md locked — users opt in explicitly, no hardcoded IPFS nodes |
| `peer.upnp` | `true` | CONTEXT.md locked — silent fail on loopback, no crash |
| `peer.bandwidth.max_updates_per_sec_per_peer_per_room` | `50` | CONTEXT.md locked — conservative (50/s * 3600 = 180K/hour per peer) |
| `peer.bandwidth.max_concurrent_share_syncs` | `10` | CONTEXT.md locked — per-tick semaphore |
| `peer.bandwidth_overrides` | `undefined` | Optional, power-user override per PeerId |

## Dep Versions Confirmed

| Package | Version | Pin | Notes |
|---------|---------|-----|-------|
| @libp2p/circuit-relay-v2 | 4.2.0 | exact (no ^~) | ESM-only; circuitRelayTransport typeof function |
| @libp2p/dcutr | 3.0.15 | exact (no ^~) | ESM-only; dcutr typeof function; no peerDeps |
| @libp2p/upnp-nat | 4.0.15 | exact (no ^~) | ESM-only; uPnPNAT typeof function; errors caught internally |

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Noted Deviations (non-blocking)

**1. [Rule 2 - ESM-only] require() verification commands in plan fail — not a bug**
- **Found during:** Task 1 acceptance verification
- **Issue:** Plan acceptance criteria include `node -e "require('@libp2p/circuit-relay-v2')"` checks. These fail with `ERR_PACKAGE_PATH_NOT_EXPORTED` because all three packages are ESM-only (no CJS export). This is the standard for libp2p v3+ ecosystem.
- **Resolution:** Replaced with ESM dynamic import verification — `import('@libp2p/circuit-relay-v2')` confirms all three are resolvable and their exported functions are typeof function. This is the correct check for ESM packages.
- **Impact:** None — the packages work correctly. The project already uses ESM throughout (tsconfig targets ESM, tsx loader). No code changes needed.

## Verification Results

```
npx tsc --noEmit         → PASS (exhaustive switch accepts all 6 NetError variants)
npm test                 → 199 tests, 0 failures (no regressions from AppError widening)
loadConfig('/nonexistent') → {"max_updates_per_sec_per_peer_per_room":50,"max_concurrent_share_syncs":10}
```

## Self-Check: PASSED

- `src/domain/errors.ts` — NetError type, factory, AppError union, 6 formatError cases: confirmed present
- `src/infrastructure/config-loader.ts` — BandwidthConfig, BandwidthOverride, 4 PeerConfig fields, DEFAULT_PEER, parser: confirmed present
- `package.json` — 3 exact-pin deps: confirmed
- Commits `0e86ccb`, `9a055bf`, `3c6c426` — confirmed in git log
- `npx tsc --noEmit` — PASS
- `npm test` — 199/199 PASS
