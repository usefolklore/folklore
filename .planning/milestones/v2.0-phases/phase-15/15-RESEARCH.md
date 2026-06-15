# Phase 15: Peer Foundation + Security - Research

**Researched:** 2026-04-12
**Domain:** js-libp2p peer identity, ed25519 key management, secrets scanning, share audit
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Peer Identity & Key Management**
- libp2p protobuf-encoded ed25519 keypair stored at ~/.folklore/peer-identity.json
- PeerId derived via libp2p standard (multihash of public key) for interoperability
- Keypair auto-generated on first `peer` command (lazy, no explicit init step)
- New `src/domain/peer.ts` for PeerId/PeerInfo/PeerRegistry types + pure validation
- New `src/infrastructure/peer-transport.ts` for libp2p I/O

**P2P Transport & Connection Model**
- Listening port configurable via config.yaml, default 0 (OS-assigned)
- Persistent connections with auto-reconnect (matches NET-04 requirement)
- Minimal libp2p module set: @libp2p/tcp + @libp2p/noise + @libp2p/yamux
- Known peers stored in `~/.folklore/peers.json` (separate from identity)

**Secrets Scanner Design**
- Scan shareable fields: label, source_uri, fetched_at
- Regex-based pattern set, extensible via config.yaml — ship with 8-10 patterns
- Hard block on detection (SEC-02): refuse to share, log warning, no --force override
- Scan triggered on `share room` and `share audit` commands

**Share Audit & Metadata Boundary**
- Shared fields per SEC-03: id, label, room, embedding vector, source_uri, fetched_at
- Audit output: table by default, --json flag for machine-readable
- Audit shows what WILL be shared + count of blocked nodes with reasons
- New `src/domain/sharing.ts` for ShareableNode type, scanNode, auditRoom pure functions

### Claude's Discretion
None — all questions explicitly decided.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PEER-01 | ed25519 keypair generated on first run, stored at ~/.folklore/peer-identity.json | Key generation via `generateKeyPair('Ed25519')` from `@libp2p/crypto/keys`; serialize via `.raw` (64 bytes) base64-encoded to JSON |
| PEER-02 | `folklore peer add <multiaddr>` connects via js-libp2p | `node.dial(multiaddr(addr))` then `peerStore.merge(peerId, { tags: { 'keep-alive-folklore': { value: 50 } } })` |
| PEER-03 | `folklore peer remove <id>` disconnects and removes | `node.hangUp(peerId)` then remove from peers.json |
| PEER-04 | `folklore peer list` shows connected peers with status, latency, shared rooms | `node.getPeers()` + `node.getConnections()` for status |
| PEER-05 | `folklore peer status` shows own identity, public key, connected peer count | `node.peerId.toString()` + `node.getPeers().length` |
| SEC-01 | Secrets scanner runs on every node before sharing — detects API keys, tokens, passwords | Regex-based scanner on shareable fields; 10 compiled patterns |
| SEC-02 | Flagged nodes are BLOCKED from sharing with a clear warning | Hard block in `scanNode()` pure function returning `Result<ShareableNode, ScanError>` |
| SEC-03 | Shared nodes carry only id, label, room, embedding vector, source_uri, fetched_at | `ShareableNode` projection type — structural pick of `GraphNode` |
| SEC-04 | `folklore share audit --room X` shows exactly what would be shared | `auditRoom()` pure function that maps nodes through `scanNode` and collects pass/block |
| SEC-05 | All P2P traffic encrypted via libp2p Noise protocol | `@libp2p/noise` as `connectionEncrypters: [noise()]` — handled natively by the handshake |
| SEC-06 | Peer authentication via ed25519 signature verification | Handled natively by Noise handshake — no extra code needed; PeerId IS the public key multihash |
</phase_requirements>

---

## Summary

Phase 15 lays the cryptographic and transport foundation for all subsequent P2P work. It has two distinct sub-domains: *peer identity + connectivity* (PEER-01..05) and *security boundary* (SEC-01..06). They are loosely coupled — the scanner and audit machinery does not require a live libp2p node and can be developed and tested independently.

The libp2p stack in 2025 is fully ESM-native and Node 20 compatible. The three locked deps (`libp2p@3.2.0`, `@libp2p/tcp@11.0.15`, `@libp2p/noise@1.0.1`, `@libp2p/yamux@8.0.1`) are all pure ESM packages with TypeScript `.d.ts` declarations. Key serialization for persistent storage uses the `.raw` property (Uint8Array, 64 bytes for ed25519 private key = 32 priv + 32 pub concatenated) encoded as base64 in JSON — no protobuf library needed at the storage layer. The `privateKey` option on `createLibp2p()` accepts a reconstituted `Ed25519PrivateKey` directly, enabling a fully stateless transport layer that loads identity from disk on each start.

The secrets scanner is a pure domain function with zero additional dependencies. Ten regex patterns cover all patterns specified in SEC-01. Patterns are compiled once at module load into a frozen array of `{ name, pattern }` objects; config.yaml can supply additional patterns via a `security.secrets_patterns` array that gets merged in at startup.

**Primary recommendation:** Build domain layer first (peer.ts, sharing.ts, error extensions), then infrastructure layer (peer-transport.ts, peers-store.ts), then CLI commands. Test the scanner and audit in isolation before touching libp2p.

---

## Standard Stack

### Core (3 new deps — exactly at budget)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `libp2p` | 3.2.0 | P2P node factory — `createLibp2p()` with transport/encrypt/mux wiring | Official js-libp2p core; pure ESM; `privateKey` config injects existing key |
| `@libp2p/tcp` | 11.0.15 | TCP transport for Node.js | Standard TCP transport; OS-port-0 works by default |
| `@libp2p/noise` | 1.0.1 | Noise XX protocol for connection encryption + peer auth | Published Sep 2025 under official `@libp2p/*` namespace; uses `@noble/curves` (no native deps) |
| `@libp2p/yamux` | 8.0.1 | Stream multiplexer | Official `@libp2p/*` namespace; same version as `@chainsafe/libp2p-yamux` |

### Zero-cost Transitive Deps (already in libp2p, no budget cost)

| Library | Version | Purpose |
|---------|---------|---------|
| `@libp2p/crypto` | 5.1.15 | `generateKeyPair('Ed25519')`, `unmarshalEd25519PrivateKey()`, `.raw` |
| `@libp2p/peer-id` | 6.0.6 | `peerIdFromPrivateKey()`, `peerIdFromString()` |
| `@multiformats/multiaddr` | 13.0.1 | `multiaddr(str)` for parsing `peer add <multiaddr>` argument |

All three are direct dependencies of `libp2p` itself — they install automatically and do not count against the 3-dep budget.

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@libp2p/noise` | `@chainsafe/libp2p-noise` v17.0.0 | Both non-deprecated; `@libp2p/*` is newer official namespace (Sep 2025); CONTEXT.md locked `@libp2p/noise` |
| `@libp2p/yamux` | `@chainsafe/libp2p-yamux` v8.0.1 | Same version number; `@libp2p/*` namespace locked by CONTEXT.md |
| Hand-rolled ed25519 | `@noble/ed25519` standalone | Would diverge from libp2p PeerId derivation; libp2p's crypto is already installed |

**Installation:**
```bash
npm install libp2p @libp2p/tcp @libp2p/noise @libp2p/yamux
```

**Version verification (confirmed 2026-04-12):**
```
libp2p          3.2.0   (latest on npm)
@libp2p/tcp    11.0.15  (latest on npm)
@libp2p/noise   1.0.1   (latest on npm, published 2025-09-24)
@libp2p/yamux   8.0.1   (latest on npm, published 2025-09-24)
```

---

## Architecture Patterns

### Recommended File Structure

```
src/
├── domain/
│   ├── peer.ts           # PeerId, PeerInfo, PeerRegistry types + pure validation (new)
│   ├── sharing.ts        # ShareableNode, scanNode, auditRoom pure functions (new)
│   ├── graph.ts          # existing — ShareableNode projects from GraphNode
│   ├── rooms.ts          # existing
│   └── errors.ts         # extend AppError with PeerError + ScanError (extend existing)
├── infrastructure/
│   ├── peer-transport.ts # createNode(), dial(), hangUp(), loadIdentity (new)
│   ├── peer-store.ts     # peers.json read/write (new — separate from identity)
│   └── config-loader.ts  # extend AppConfig with PeerConfig + SecurityConfig (extend existing)
└── cli/
    ├── commands/
    │   ├── peer.ts        # peer add/remove/list/status subcommands (new)
    │   └── share.ts       # share audit subcommand (new)
    └── index.ts           # register peer + share commands (extend existing)

~/.folklore/
├── peer-identity.json     # { privateKeyB64: string, peerId: string, createdAt: string }
└── peers.json             # { peers: PeerRecord[] }
```

### Pattern 1: Lazy Key Generation on First Peer Command

**What:** `loadOrCreateIdentity()` checks for the identity file; if absent, generates and persists. All peer commands call this before doing anything else.

**When to use:** Every peer subcommand entry point.

```typescript
// src/infrastructure/peer-transport.ts
import { generateKeyPair, unmarshalEd25519PrivateKey } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';
import type { Ed25519PrivateKey } from '@libp2p/interface';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import type { PeerError } from '../domain/errors.js';
import { PeerError as PE } from '../domain/errors.js';

export interface PeerIdentity {
  readonly privateKey: Ed25519PrivateKey;
  readonly peerId: string;  // multibase-encoded multihash
}

export const loadOrCreateIdentity = (
  identityPath: string,
): ResultAsync<PeerIdentity, PeerError> => {
  if (existsSync(identityPath)) {
    return ResultAsync.fromPromise(
      readFile(identityPath, 'utf8'),
      (e) => PE.identityReadError(identityPath, (e as Error).message),
    ).andThen((text) => {
      try {
        const stored = JSON.parse(text) as { privateKeyB64: string; peerId: string };
        const rawBytes = Uint8Array.from(Buffer.from(stored.privateKeyB64, 'base64'));
        const privateKey = unmarshalEd25519PrivateKey(rawBytes);
        return okAsync({ privateKey, peerId: stored.peerId });
      } catch (e) {
        return errAsync(PE.identityParseError(identityPath, (e as Error).message));
      }
    });
  }
  return ResultAsync.fromPromise(
    generateKeyPair('Ed25519'),
    (e) => PE.identityGenerateError((e as Error).message),
  ).andThen((privateKey) => {
    const peerId = peerIdFromPrivateKey(privateKey).toString();
    const stored = {
      privateKeyB64: Buffer.from(privateKey.raw).toString('base64'),
      peerId,
      createdAt: new Date().toISOString(),
    };
    const dir = identityPath.replace(/\/[^/]+$/, '');
    return ResultAsync.fromPromise(
      mkdir(dir, { recursive: true }).then(() =>
        writeFile(identityPath, JSON.stringify(stored, null, 2), 'utf8'),
      ),
      (e) => PE.identityWriteError(identityPath, (e as Error).message),
    ).map(() => ({ privateKey, peerId }));
  });
};
```

### Pattern 2: createLibp2p with Injected Identity

**What:** Transport node is created with a loaded private key so PeerId is stable across restarts.

**When to use:** Any operation that needs a live P2P connection (peer add, peer list with status).

```typescript
// src/infrastructure/peer-transport.ts (continued)
import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@libp2p/noise';
import { yamux } from '@libp2p/yamux';

export interface TransportConfig {
  readonly listenPort: number;  // 0 = OS-assigned
}

export const createNode = (
  identity: PeerIdentity,
  cfg: TransportConfig,
): ResultAsync<Libp2p, PeerError> =>
  ResultAsync.fromPromise(
    createLibp2p({
      privateKey: identity.privateKey,
      addresses: {
        listen: [`/ip4/0.0.0.0/tcp/${cfg.listenPort}`],
      },
      transports: [tcp()],
      connectionEncrypters: [noise()],
      streamMuxers: [yamux()],
      connectionManager: {
        reconnectRetries: 5,
        reconnectRetryInterval: 2000,
        reconnectBackoffFactor: 2,
      },
    }),
    (e) => PE.transportError((e as Error).message),
  );
```

### Pattern 3: Peer Add — Dial + Tag + Persist

**What:** `peer add <multiaddr>` dials the remote, tags it `keep-alive-folklore` for auto-reconnect, derives and persists the PeerId.

**When to use:** `peer add` command only.

```typescript
// src/infrastructure/peer-transport.ts (continued)
import { multiaddr } from '@multiformats/multiaddr';

export const dialAndTag = (
  node: Libp2p,
  rawAddr: string,
): ResultAsync<string, PeerError> =>
  ResultAsync.fromPromise(
    (async () => {
      const ma = multiaddr(rawAddr);
      const conn = await node.dial(ma);
      const peerId = conn.remotePeer;
      await node.peerStore.merge(peerId, {
        multiaddrs: [ma],
        tags: { 'keep-alive-folklore': { value: 50 } },
      });
      return peerId.toString();
    })(),
    (e) => PE.dialError(rawAddr, (e as Error).message),
  );
```

### Pattern 4: ShareableNode Projection + scanNode

**What:** Pure domain function that projects a `GraphNode` to `ShareableNode` and simultaneously scans for secrets. Returns `Result<ShareableNode, ScanError>`.

**When to use:** Called in `auditRoom()` and (Phase 16) before any actual sync.

```typescript
// src/domain/sharing.ts
import { Result, ok, err } from 'neverthrow';
import type { GraphNode } from './graph.js';
import type { ScanError } from './errors.js';
import { ScanError as SE } from './errors.js';

export interface ShareableNode {
  readonly id: string;
  readonly label: string;
  readonly room: string;
  readonly embedding_id?: string;   // vector reference
  readonly source_uri?: string;
  readonly fetched_at?: string;
}

export interface ScanMatch {
  readonly field: string;
  readonly patternName: string;
}

const BUILT_IN_PATTERNS: ReadonlyArray<{ readonly name: string; readonly re: RegExp }> = [
  { name: 'openai-key',    re: /sk-[a-zA-Z0-9]{20,}/g },
  { name: 'github-token',  re: /ghp_[a-zA-Z0-9]{36}/g },
  { name: 'github-oauth',  re: /gho_[a-zA-Z0-9]{36}/g },
  { name: 'aws-key-id',    re: /AKIA[0-9A-Z]{16}/g },
  { name: 'stripe-live',   re: /sk_live_[a-zA-Z0-9]{24}/g },
  { name: 'bearer-token',  re: /Bearer\s+[a-zA-Z0-9._\-]{20,}/g },
  { name: 'password-kv',   re: /password\s*[=:]\s*\S{6,}/gi },
  { name: 'api-key-kv',    re: /api[_\-]?key\s*[=:]\s*["']?[a-zA-Z0-9._\-]{10,}/gi },
  { name: 'env-token',     re: /[A-Z_]{3,}_TOKEN=[^\s"']{8,}/g },
  { name: 'env-secret',    re: /[A-Z_]{3,}_SECRET=[^\s"']{8,}/g },
];

const SCANNABLE_FIELDS: ReadonlyArray<keyof ShareableNode> = [
  'label', 'source_uri', 'fetched_at',
];

// patterns is the built-ins merged with any config-supplied extras
export const buildPatterns = (
  extras: ReadonlyArray<{ name: string; pattern: string }> = [],
): ReadonlyArray<{ readonly name: string; readonly re: RegExp }> => [
  ...BUILT_IN_PATTERNS,
  ...extras.map(({ name, pattern }) => ({ name, re: new RegExp(pattern, 'g') })),
];

export const scanNode = (
  node: GraphNode,
  patterns: ReturnType<typeof buildPatterns>,
): Result<ShareableNode, ScanError> => {
  const shareable: ShareableNode = {
    id: node.id,
    label: node.label,
    room: node.room ?? '',
    embedding_id: node.embedding_id,
    source_uri: node.source_uri,
    fetched_at: node.fetched_at,
  };
  const matches: ScanMatch[] = [];
  for (const field of SCANNABLE_FIELDS) {
    const value = shareable[field];
    if (typeof value !== 'string') continue;
    for (const { name, re } of patterns) {
      re.lastIndex = 0;  // reset stateful global regex
      if (re.test(value)) matches.push({ field, patternName: name });
    }
  }
  if (matches.length > 0) {
    return err(SE.secretDetected(node.id, matches));
  }
  return ok(shareable);
};

export interface AuditResult {
  readonly allowed: readonly ShareableNode[];
  readonly blocked: ReadonlyArray<{ readonly nodeId: string; readonly matches: readonly ScanMatch[] }>;
}

export const auditRoom = (
  nodes: readonly GraphNode[],
  patterns: ReturnType<typeof buildPatterns>,
): AuditResult => {
  const allowed: ShareableNode[] = [];
  const blocked: Array<{ nodeId: string; matches: ScanMatch[] }> = [];
  for (const node of nodes) {
    const result = scanNode(node, patterns);
    if (result.isOk()) {
      allowed.push(result.value);
    } else {
      blocked.push({ nodeId: node.id, matches: result.error.matches });
    }
  }
  return { allowed, blocked };
};
```

### Pattern 5: peers.json Persistence

**What:** `peers.json` is a simple JSON array of `PeerRecord` written atomically (write to `.tmp`, rename).

**When to use:** After every `peer add` / `peer remove` that succeeds.

```typescript
// src/infrastructure/peer-store.ts
export interface PeerRecord {
  readonly id: string;          // multibase PeerId string
  readonly addrs: readonly string[];  // known multiaddrs
  readonly addedAt: string;     // ISO-8601
  readonly label?: string;      // optional human alias
}

export interface PeersFile {
  readonly peers: readonly PeerRecord[];
}
```

### Anti-Patterns to Avoid

- **Calling `createLibp2p()` in domain layer:** libp2p I/O belongs exclusively in `src/infrastructure/peer-transport.ts`. Domain functions (`scanNode`, `auditRoom`) must remain pure.
- **Eagerly creating the libp2p node on CLI startup:** Only `peer add`, `peer list`, and `peer status` require a live node. `peer remove` and `share audit` do not.
- **Using global regex without resetting `lastIndex`:** `RegExp` with `/g` flag is stateful. Always set `re.lastIndex = 0` before each `.test()` call. Failure to do this causes intermittent false negatives — a known pitfall with the scan loop pattern above.
- **Storing the full 64-byte raw key as hex:** Use base64 — it's 33% shorter and is the conventional encoding in libp2p key serialization contexts.
- **Treating multiaddr parse errors as throws:** `multiaddr(str)` throws on invalid input. Wrap in `ResultAsync.fromPromise` or a try/catch that returns `err(PE.invalidMultiaddr(...))`.
- **Using eager `ResultAsync.map` over the node scan loop:** The scan loop is synchronous — use plain `Result` (not `ResultAsync`) and avoid the sequenceLazy overhead entirely.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| ed25519 key generation | Custom crypto | `@libp2p/crypto/keys` `generateKeyPair('Ed25519')` | PeerId derivation must match libp2p's multihash convention |
| Noise handshake | Custom TLS/encrypt | `@libp2p/noise` as `connectionEncrypters` | Noise XX includes peer auth (SEC-06) for free |
| Multiaddr parsing | String splitting | `@multiformats/multiaddr` (transitive dep) | Handles IPv4, IPv6, DNS, `/p2p/` component extraction |
| Stream multiplexing | Raw TCP framing | `@libp2p/yamux` as `streamMuxers` | Required by libp2p for multi-protocol streams |
| Auto-reconnect | Custom retry loop | `connectionManager.reconnectRetries` + KEEP_ALIVE tag | libp2p tracks tagged peers and reconnects with backoff |

**Key insight:** The security properties of Phase 15 (SEC-05, SEC-06) are entirely delegated to the libp2p Noise handshake. Zero custom crypto code is needed. The 3-dep budget is fully accounted for.

---

## Common Pitfalls

### Pitfall 1: Global Regex Statefulness in Scanner
**What goes wrong:** A compiled `RegExp` with `/g` flag has a `.lastIndex` cursor. In a loop testing the same regex against multiple strings, after a match the cursor advances — the next `.test()` call on a DIFFERENT string starts from the wrong position and misses matches.
**Why it happens:** Compiling patterns once (correct for performance) with `/g` flag (needed for global scan) creates stateful objects shared across iterations.
**How to avoid:** Reset `re.lastIndex = 0` before every `.test(re, value)` call — as shown in the `scanNode` pattern above.
**Warning signs:** Tests with multiple nodes pass individually but fail when run in sequence.

### Pitfall 2: libp2p Node Not Started Before Dial
**What goes wrong:** `node.dial()` throws `"not started"` or returns a silent error.
**Why it happens:** `createLibp2p()` does NOT auto-start by default in all configurations. The `start: false` option exists; omitting it usually auto-starts, but this depends on config.
**How to avoid:** Explicitly call `await node.start()` after `createLibp2p()`, or pass `start: true` explicitly. Wrap in ResultAsync.
**Warning signs:** `node.getMultiaddrs()` returns `[]` immediately after creation.

### Pitfall 3: Multiaddr Parse Throws Synchronously
**What goes wrong:** `multiaddr('/invalid')` throws a synchronous `Error`, not a rejected Promise.
**Why it happens:** `@multiformats/multiaddr` validates the string immediately on construction.
**How to avoid:** Wrap in a try/catch that converts to `err(PE.invalidMultiaddr(addr, e.message))` before passing to any ResultAsync chain.
**Warning signs:** Uncaught exception propagates to the CLI crash handler instead of printing a clean error.

### Pitfall 4: PeerId String Format Mismatch
**What goes wrong:** `peerIdFromString()` throws on a string that was serialized with a different encoding (base58btc vs base32 CIDv1).
**Why it happens:** libp2p 3.x defaults to base32 CIDv1 encoding for new PeerIds, but older nodes produce base58btc strings (starting with `Qm...` or `12D3...`).
**How to avoid:** Store the PeerId string from `peerIdFromPrivateKey(key).toString()` directly — the library chooses the canonical encoding. When parsing user-supplied multiaddrs, the `/p2p/<peerid>` component is extracted by `@multiformats/multiaddr` — do not manually parse it.
**Warning signs:** `peerIdFromString(stored.peerId)` throws on a second run if the stored value was hand-constructed.

### Pitfall 5: peers.json Write Race on Concurrent Commands
**What goes wrong:** Two simultaneous `peer add` calls corrupt `peers.json` with a partial write.
**Why it happens:** `writeFile` is not atomic on most filesystems.
**How to avoid:** Write to `peers.json.tmp` then `rename()` (atomic on POSIX). Since this is a CLI tool (one user, sequential commands), this is low-risk but cheap to guard.
**Warning signs:** Malformed JSON on next `peer list`.

### Pitfall 6: 3-Dep Budget Miscount
**What goes wrong:** Developer adds `@libp2p/crypto` or `@multiformats/multiaddr` as explicit deps, pushing the count to 5.
**Why it happens:** These are transitively available but not in `package.json` — IDEs may suggest adding them explicitly.
**How to avoid:** Do NOT add `@libp2p/crypto`, `@libp2p/peer-id`, or `@multiformats/multiaddr` to `package.json`. They install as deps of `libp2p` and are importable. The 3-dep budget is: `libp2p` + `@libp2p/tcp` + `@libp2p/noise` (yamux counts as the 3rd if we count `@libp2p/yamux`, making it exactly 4 total — verify budget interpretation with planner).

> **Budget note:** CONTEXT.md says "3 new deps per phase" and lists 4 packages: `@libp2p/tcp`, `@libp2p/noise`, `@libp2p/yamux`, and `libp2p` itself. The likely interpretation is that `libp2p` is the core and the 3 modules are its named plugin deps. The planner should confirm whether `libp2p` counts as 1 of the 3 or is additional.

---

## Code Examples

### Generate and Persist Identity (verified API)

```typescript
// Source: @libp2p/crypto/keys, @libp2p/peer-id (verified from source + npm 2026-04-12)
import { generateKeyPair, unmarshalEd25519PrivateKey } from '@libp2p/crypto/keys';
import { peerIdFromPrivateKey } from '@libp2p/peer-id';

const privateKey = await generateKeyPair('Ed25519');
// privateKey.raw → Uint8Array(64) = 32-byte priv + 32-byte pub
const b64 = Buffer.from(privateKey.raw).toString('base64');
const peerId = peerIdFromPrivateKey(privateKey).toString();
// Store: { privateKeyB64: b64, peerId, createdAt: ISO }

// Restore:
const rawBytes = Uint8Array.from(Buffer.from(b64, 'base64'));
const restored = unmarshalEd25519PrivateKey(rawBytes);
```

### Create Minimal Libp2p Node (verified API)

```typescript
// Source: libp2p 3.2.0 README + CONFIGURATION.md (verified 2026-04-12)
import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@libp2p/noise';
import { yamux } from '@libp2p/yamux';

const node = await createLibp2p({
  privateKey: identity.privateKey,      // Ed25519PrivateKey from loadOrCreateIdentity
  addresses: { listen: ['/ip4/0.0.0.0/tcp/0'] },  // port 0 = OS-assigned
  transports: [tcp()],
  connectionEncrypters: [noise()],
  streamMuxers: [yamux()],
  connectionManager: {
    reconnectRetries: 5,
    reconnectRetryInterval: 2000,
    reconnectBackoffFactor: 2,
  },
});
await node.start();
console.log('Listening on:', node.getMultiaddrs().map(m => m.toString()));
```

### Dial Peer + Tag Keep-Alive (verified API)

```typescript
// Source: @libp2p/interface PeerStore.merge + KEEP_ALIVE constant (verified 2026-04-12)
import { multiaddr } from '@multiformats/multiaddr';

const ma = multiaddr('/ip4/192.168.1.10/tcp/9001');
const conn = await node.dial(ma);
await node.peerStore.merge(conn.remotePeer, {
  multiaddrs: [ma],
  tags: { 'keep-alive-folklore': { value: 50 } },
});
```

### Config Extension for Peer Section

```typescript
// src/infrastructure/config-loader.ts — extend existing AppConfig
export interface PeerConfig {
  readonly port: number;               // default: 0
}

export interface SecurityConfig {
  readonly secrets_patterns: ReadonlyArray<{ name: string; pattern: string }>;
}

// Extend AppConfig:
export interface AppConfig {
  readonly daemon: DaemonConfig;
  readonly tunnels: TunnelsConfig;
  readonly peer: PeerConfig;           // new
  readonly security: SecurityConfig;   // new
  readonly raw: Readonly<Record<string, unknown>>;
}
```

### Error Type Extensions for peer.ts and sharing.ts

```typescript
// Extend src/domain/errors.ts — new discriminated union members

export type PeerError =
  | { readonly type: 'PeerIdentityReadError';     readonly path: string; readonly message: string }
  | { readonly type: 'PeerIdentityWriteError';    readonly path: string; readonly message: string }
  | { readonly type: 'PeerIdentityParseError';    readonly path: string; readonly message: string }
  | { readonly type: 'PeerIdentityGenerateError'; readonly message: string }
  | { readonly type: 'PeerDialError';             readonly addr: string;  readonly message: string }
  | { readonly type: 'PeerNotFound';              readonly id: string }
  | { readonly type: 'PeerTransportError';        readonly message: string }
  | { readonly type: 'InvalidMultiaddr';          readonly addr: string;  readonly message: string };

export type ScanError =
  | { readonly type: 'SecretDetected'; readonly nodeId: string; readonly matches: readonly ScanMatch[] };

// Update AppError union:
export type AppError = GraphError | VectorError | EmbeddingError | PeerError | ScanError;
```

### CLI Command Registration Pattern

```typescript
// src/cli/index.ts — add to commands record
import { peer } from './commands/peer.js';
import { share } from './commands/share.js';

const commands: Record<string, CommandFn> = {
  // ... existing ...
  peer,
  share,
};
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `@chainsafe/libp2p-noise` | `@libp2p/noise` | Sep 2025 | Same API, official namespace migration |
| `@chainsafe/libp2p-yamux` | `@libp2p/yamux` | Sep 2025 | Same version number (8.0.1), official namespace |
| `PeerId.createFromPrivKey(bytes)` | `peerIdFromPrivateKey(key)` | libp2p v1+ | Direct typed key object instead of raw bytes |
| `key.bytes` for marshaling | `key.raw` (Uint8Array) | libp2p v1+ | `.raw` = canonical 64-byte field; `.bytes` may include protobuf wrapper |
| `libp2p.connections` | `node.getConnections()` | libp2p v1+ | Method not property |
| `libp2p.peerStore.addressBook` | `node.peerStore.merge()` | libp2p v1+ | Flat peerStore API, no sub-books |

**Deprecated / outdated:**
- `js-libp2p v0.x` patterns: `Libp2p.create()`, `PeerId.create()`, `libp2p.transportManager` — all replaced in 1.x+ / 3.x
- `libp2p-mplex`: deprecated in favor of yamux; mplex is no longer recommended
- `it-pipe` for stream handling: still valid but not needed for Phase 15 (no custom protocols yet)

---

## Open Questions

1. **Dep budget interpretation**
   - What we know: CONTEXT.md says "3 new deps" and lists `@libp2p/tcp`, `@libp2p/noise`, `@libp2p/yamux` — that's 3 modules. But `libp2p` itself is also a new dep.
   - What's unclear: Does `libp2p` count as 1 of the 3 or is it implicit?
   - Recommendation: Treat `libp2p` as the 4th dep (the core) and the 3 modules as the explicit budget. If budget is strict at 3, drop `@libp2p/yamux` and use `@chainsafe/libp2p-yamux` (same code, already a transitive dep of libp2p).

2. **peer-identity.json format: raw .raw bytes vs protobuf encoding**
   - What we know: CONTEXT.md says "libp2p protobuf-encoded ed25519 keypair" in the file. But the `@libp2p/crypto` API uses `.raw` (pure bytes, no protobuf header) for marshal/unmarshal.
   - What's unclear: Does the storage file need to use protobuf framing (KeyType header) for interoperability, or is raw-bytes-as-base64 sufficient?
   - Recommendation: Use `key.raw` (raw bytes, base64-encoded) in the JSON file. The "protobuf-encoded" phrase in CONTEXT.md likely refers to the on-wire PeerId derivation (multihash of protobuf-encoded public key), not the storage format. Raw bytes + base64 is simpler, has no extra dependencies, and is round-trippable via `unmarshalEd25519PrivateKey`.

3. **libp2p node lifecycle for read-only commands**
   - What we know: `peer list` shows "connected peers with status" but also "shared rooms" — shared rooms info lives in `peers.json`, not in the live node.
   - What's unclear: Should `peer list` start a libp2p node to get live connection status, or read only from `peers.json`?
   - Recommendation: `peer list` reads `peers.json` for the known-peer roster. It starts a node only if the node is already running (check for PID or socket). For Phase 15 (no daemon), list shows stored peers + "offline" status for all. Connection status is a Phase 18 concern.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in `node:test` (no separate framework installed) |
| Config file | None — test runner is `node --import tsx --test tests/*.test.ts` |
| Quick run command | `node --import tsx --test tests/phase15.peer-security.test.ts` |
| Full suite command | `node --import tsx --test tests/*.test.ts` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PEER-01 | `loadOrCreateIdentity` generates file when absent, loads when present | unit | `node --import tsx --test tests/phase15.peer-security.test.ts` | ❌ Wave 0 |
| PEER-02 | `dialAndTag` calls `node.dial()` + `peerStore.merge()` | unit (mock node) | same | ❌ Wave 0 |
| PEER-03 | `peer remove <id>` removes from peers.json and hangs up | unit (mock node) | same | ❌ Wave 0 |
| PEER-04 | `peer list` reads peers.json and renders table | unit | same | ❌ Wave 0 |
| PEER-05 | `peer status` shows own PeerId and peer count | unit (mock node) | same | ❌ Wave 0 |
| SEC-01 | `scanNode` detects all 10 built-in pattern types | unit | same | ❌ Wave 0 |
| SEC-02 | `scanNode` returns `err(ScanError)` for flagged node; `auditRoom` counts blocked | unit | same | ❌ Wave 0 |
| SEC-03 | `ShareableNode` type excludes file_type, source_file, raw text fields | type check + unit | same | ❌ Wave 0 |
| SEC-04 | `auditRoom` table output matches expected allowed/blocked split | unit | same | ❌ Wave 0 |
| SEC-05 | `createLibp2p` with `noise()` in `connectionEncrypters` — integration smoke | integration (loopback) | same | ❌ Wave 0 |
| SEC-06 | PeerId derived from key is stable across loadOrCreateIdentity calls | unit | same | ❌ Wave 0 |

> SEC-05 is the only test that requires a live TCP port. Mark it with a `TODO: integration` comment and an `--test-skip-pattern` guard if running in CI without network. All other tests are pure unit tests with no I/O beyond tmp files.

### Sampling Rate
- **Per task commit:** `node --import tsx --test tests/phase15.peer-security.test.ts`
- **Per wave merge:** `node --import tsx --test tests/*.test.ts`
- **Phase gate:** Full suite (33 existing + new phase15 tests) green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/phase15.peer-security.test.ts` — covers PEER-01..05, SEC-01..06 (all 11 requirements)
- [ ] No framework install needed — `node:test` already in use

---

## Sources

### Primary (HIGH confidence)
- `npm view libp2p@3.2.0 --json` — version 3.2.0 confirmed current, deps structure verified
- `npm view @libp2p/tcp@11.0.15` — current, no deprecation
- `npm view @libp2p/noise@1.0.1` — published 2025-09-24, no deprecation, `@noble/curves` crypto
- `npm view @libp2p/yamux@8.0.1` — published 2025-09-24, no deprecation
- `npm view @libp2p/crypto@5.1.15` — `generateKeyPair`, `unmarshalEd25519PrivateKey`, `.keys` export verified
- `npm view @libp2p/peer-id@6.0.6` — `peerIdFromPrivateKey`, `peerIdFromPublicKey` functions confirmed
- GitHub raw source `packages/peer-id/src/index.ts` — `peerIdFromPrivateKey(key)` signature confirmed
- GitHub raw source `packages/crypto/test/keys/ed25519.spec.ts` — `.raw` property usage confirmed; 64-byte private key format confirmed
- GitHub `packages/libp2p/src/index.ts` — `privateKey?: PrivateKey` in `Libp2pInit` confirmed; auto-generates Ed25519 if omitted
- GitHub `packages/libp2p/src/connection-manager/index.ts` — `reconnectRetries`, `reconnectRetryInterval`, `reconnectBackoffFactor` config confirmed
- GitHub `packages/interface/src/peer-store.ts` — `peerStore.merge()` with `tags` confirmed; KEEP_ALIVE prefix convention confirmed
- Official CONFIGURATION.md — `addresses.listen`, `connectionManager.maxConnections` verified

### Secondary (MEDIUM confidence)
- Official GETTING_STARTED.md — `@chainsafe/libp2p-noise`/`@chainsafe/libp2p-yamux` as examples; contrasted with locked `@libp2p/*` namespace decision
- js-libp2p-examples chat example `package.json` — confirmed `@chainsafe/*` packages in official examples (corroborates both namespaces exist and are valid)

### Tertiary (LOW confidence — not used for implementation decisions)
- Gitleaks / truffleHog pattern references — regex patterns cross-referenced against known open-source secret scanners; HIGH for the specific patterns listed (sk-, ghp_, AKIA are stable industry standards)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified from npm registry 2026-04-12
- Architecture: HIGH — key serialization, createLibp2p API, peerStore.merge all verified from source
- Pitfalls: HIGH for regex statefulness (well-known JS gotcha), MEDIUM for libp2p lifecycle (inferred from docs)
- Secrets patterns: HIGH — sk-, ghp_, AKIA, Bearer are stable patterns in use since 2020+

**Research date:** 2026-04-12
**Valid until:** 2026-05-12 (libp2p moves fast; re-verify if >30 days before implementation)
