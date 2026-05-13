# wellinformed v3 — P2P Memory Protocol

**Version:** 0.1 (draft)
**Status:** Reference implementation shipped in wellinformed v3.x; spec stabilising ahead of v3.0 tag
**Audience:** Implementers of cross-agent persistent memory, P2P application authors, anyone building on free LLMs

---

## 1. Motivation

Centralized memory stacks (mem0, ChatGPT memory, Claude projects, Zep, Letta) own the vectors, graph, and retrieval for their users. When you switch LLM providers, your memory is stuck or must be re-embedded from scratch. This is the same lock-in pattern as SaaS — done to your AI persona.

Free/open LLMs (Llama, Mistral, Qwen, DeepSeek, GPT-OSS) have no portable, cryptographically-verifiable, cross-model memory layer. Without one, the free-LLM world is a collection of stateless chat shells. Memory is a **necessary (not sufficient) condition** for a self-sovereign LLM stack.

**wellinformed v3** defines a protocol so that:
- Memory entries are **user-authored**, not device-authored or provider-authored
- Memory **verifiably** originates from a stated user identity, without registries or DID resolvers
- Memory **portably** federates across encoder choices (nomic, bge, e5, all-MiniLM, future)
- Memory **efficiently** syncs over P2P meshes (binary-quantized 64-byte vectors)
- The whole stack runs **local-first** on CPU with no GPU requirement

This spec defines the wire primitives. The reference implementation is the `wellinformed` TypeScript codebase; the spec is portable to any language (Rust, Go, Python, Swift).

---

## 2. Identity (§2.1–2.3)

### 2.1 User DID

A user identity is a **W3C did:key** over an **Ed25519** keypair.

```
did:key:z<base58btc(0xed 0x01 || publicKey)>
```

Where `publicKey` is exactly 32 bytes (RFC 8032 Ed25519 public key). The `0xed 0x01` two-byte multicodec prefix is the W3C-registered Ed25519 marker.

**Why did:key over did:web, did:ion, did:plc:** wellinformed needs zero-registry offline verifiability. Any peer can decode a did:key in microseconds without a network round-trip. Composable DID methods (did:web for human-readable names, did:plc for AT Protocol interop) are a v3.1 extension; the core protocol only requires did:key.

The user **private seed** is a 32-byte Ed25519 seed. v1 recovery format is 64-char lowercase hex. v1.1 will add BIP39 mnemonic.

### 2.2 Device Key

An operational keypair authorized by the user DID.

**Device authorization message** (canonical string, no JSON):

```
wellinformed-auth:v1:<device_id>:<hex(device_public_key)>:<authorized_at_ISO8601>
```

The user signs this message with their private seed → `authorization_sig` (64 bytes Ed25519).

A `DeviceKey` record is:

```
{
  "device_id":          "<hostname>-<12-hex>",
  "user_did":           "did:key:z...",
  "device_public_key":  32 bytes,
  "authorized_at":      ISO-8601 UTC timestamp,
  "authorization_sig":  64 bytes (user's signature over the auth message)
}
```

Revoking a device means destroying its private key — old envelopes it signed remain verifiable because each envelope embeds the device pub key and the authorization chain.

### 2.3 Signed Envelope

Every outbound memory-bearing record wraps in an envelope.

```
SignedEnvelope<T> = {
  envelope_version:       1,
  payload:                T,
  signer_did:             DID (== DeviceKey.user_did),
  signer_device_id:       string,
  device_public_key:      32 bytes,
  device_authorization: {
    authorized_at:        ISO-8601,
    authorization_sig:    64 bytes
  },
  signed_at:              ISO-8601,
  signature:              64 bytes   (device-signed; see §2.4)
}
```

**Payload signing message** (canonical string):

```
wellinformed-sig:v1:<device_id>:<signed_at>:<canonical_json(payload)>
```

The device signs this message with its private seed → `signature`.

Domain separation: the `wellinformed-auth:v1:` and `wellinformed-sig:v1:` prefixes prevent cross-protocol replay. A valid authorization signature cannot be re-presented as a payload signature.

### 2.4 Verification

A receiver verifies any envelope offline with three steps:

1. **Decode user DID → public key.** did:key is self-describing; no registry lookup.
2. **Verify device authorization:**
   recompute `wellinformed-auth:v1:<device_id>:<hex(device_pub)>:<authorized_at>`,
   `Ed25519.verify(user_public_key, auth_message, device_authorization.authorization_sig)`.
3. **Verify payload signature:**
   recompute `wellinformed-sig:v1:<device_id>:<signed_at>:<canonical_json(payload)>`,
   `Ed25519.verify(device_public_key, payload_message, signature)`.

Full verification cost: 3 Ed25519 ops, < 2 ms typical on modern hardware.

### 2.5 Canonical JSON

Payloads are serialized with the following deterministic rules:

- Object keys sorted lexicographically at every nesting level
- Arrays preserve insertion order (position is semantic)
- Primitives: `string`, `number`, `boolean`, `null`
- `Uint8Array` encoded as `"0x<hex>"` string (length-prefixed hex)
- **Rejected**: `bigint`, `function`, `undefined`, `Map`, `Set`, `Date`, cyclic refs, non-finite numbers

This gives byte-identical output across runtimes (Node, Rust, Go, Python, browser). Required because the signature covers the byte stream.

Reference: RFC 8785 (JCS) for the JSON subset we emit.

---

## 3. Cross-Model Bridge Registry (§3.1–3.3)

### 3.1 Motivation

A peer running BGE (encoder A) cannot query a peer indexing under nomic-v1.5 (encoder B) without some kind of translation: same text gives different vectors in each space, so cosine similarity is meaningless across.

wellinformed v3 ships **linear bridges** — for each supported encoder pair (A, B), a matrix `W_{A→B} ∈ R^{d_B × d_A}` such that `bridge(v_A) = L2_normalize(W · v_A)` is approximately equivalent to embedding the original text in encoder B.

**Measured retention** (SciFact, 5,183 paired corpus vectors, ridge least-squares λ=0.01):

| Bridge | NDCG@10 | Retention vs native target |
|--------|---------|----------------------------|
| native nomic (ceiling) | 70.01% | 100% |
| **bge → nomic (bridged)** | **64.34%** | **91.9%** ✓ |
| native bge (Xenova port) | 63.46% | 90.6% |

The bridge beats the native defective-Xenova-bge score — linear W also acts as a quality repair for bad ONNX ports.

### 3.2 Schema

A bridge entry in the registry:

```
BridgeMatrix = {
  from_encoder:   "bge-base-en-v1.5"  (canonical name),
  to_encoder:     "nomic-embed-text-v1.5",
  from_dim:       768,
  to_dim:         768,
  lambda:         0.01,
  training_pairs: 5183,
  training_corpus: "BeIR/scifact" (or multiple),
  matrix_url:     "ipfs://... | https://...",
  matrix_sha256:  "<64-char hex>",
  version:        1,
  trained_at:     ISO-8601,
  signed_by_did:  DID (author of the bridge; optional)
}
```

The matrix is distributed as a signed binary blob: `[from_dim:u32][to_dim:u32][row-major fp32 data]`. For 768×768 that's ~2.4 MB — acceptable bandwidth for one-time download.

### 3.3 Canonical encoder: v3 is nomic-v1.5

Bridges in v3 are unidirectional toward **nomic-embed-text-v1.5** (768d, 8192 context, Apache 2.0). All peers are expected to either index natively under nomic-v1.5 OR carry a bridge matrix from their local encoder.

The canonical choice is pragmatic: nomic-v1.5 has permissive licensing, supports Matryoshka truncation (§4), and has a correctly-ported Xenova ONNX (unlike bge-base-en-v1.5 per §2d of the v2 benchmark). v3.1 may add bge-base or gte-base as canonical after the relevant ports are validated.

---

## 4. Vector Quantization Negotiation (§4.1–4.3)

### 4.1 Supported encodings

| Encoding | Bytes per 768-dim vec | NDCG@10 retention (hybrid, 4-BEIR worst case) |
|----------|----------------------|-----------------------------------------------|
| fp32 | 3,072 | 100% (anchor) |
| fp32-512 (Matryoshka) | 2,048 | ≥ 99% |
| fp32-384 (Matryoshka) | 1,536 | ≥ 98% (worst: SciDocs −1.42pt) |
| fp32-128 (Matryoshka) | 512 | ≥ 99% (hybrid rescues dense loss) |
| **binary-768** | 96 | ≥ 99% (worst: SciDocs −1.10pt) |
| **binary-512** | 64 | ≥ 98% (worst: SciDocs −1.79pt) |

Binary uses the sign bit of each dimension (popcount Hamming distance for ranking).

### 4.2 Negotiation handshake

At connection setup peers exchange supported encodings via libp2p identify protocol:

```
/wellinformed/capabilities/1.0.0 → {
  encoders: ["nomic-embed-text-v1.5", "Xenova/bge-base-en-v1.5"],
  bridges:  ["bge-base → nomic", ...],
  encodings: ["fp32-768", "fp32-512", "fp32-128", "binary-768", "binary-512"],
  preferred_encoding: "binary-512"
}
```

When peer A sends a query, A specifies the encoding. Peer B responds with match payloads in the same encoding. The sender is responsible for any bridge application before transmission.

### 4.3 Why binary-512 is the federated-sync default

- **64 bytes/vec** — a 10,000-entry vector namespace is 640 KB, fits in a single mesh message
- **Hamming popcount** is ~6× faster than fp32 cosine, hardware-accelerated on modern CPUs via `_mm_popcnt_u64`
- Measured quality loss: −1.79 pt NDCG@10 worst-case across SciFact/ArguAna/FiQA/SciDocs in the hybrid pipeline (see `.planning/BENCH-v2.md §2f`)
- Hybrid RRF fusion with BM25 (already in the production retrieval path) rescues the truncation/quantization loss that would be visible in dense-only scoring

---

## 5. Federated Operations (§5.1–5.4)

### 5.1 Protocol IDs

- `/wellinformed/search/2.0.0` — one-shot request/response semantic search
- `/wellinformed/touch/1.0.0` — asymmetric public-room pull
- `/wellinformed/share/2.0.0` — bidirectional CRDT room sync (Y.js)
- `/wellinformed/save/1.0.0` — signed note append
- `/wellinformed/capabilities/1.0.0` — capability exchange

The `/2.0.0` suffix signals that requests and responses are wrapped in `SignedEnvelope` (§2.3). `/1.0.0` protocols are unsigned legacy shapes retained for backward compatibility during migration.

### 5.2 SearchRequest envelope

```
SearchRequest = {
  type:      "search",
  embedding: number[]    (length = encoding_dim, JSON-safe fp32 or int array for binary),
  encoding:  string      (one of §4.1),
  encoder:   string      (canonical encoder name),
  bridge_applied:    string | null  (bridge name if the sender mapped to canonical),
  room:      string | null,
  k:         number
}

// Wire form:
SignedEnvelope<SearchRequest>
```

A peer receiving a `SearchRequest` MUST:
1. Verify the envelope (§2.4) — reject if invalid
2. Check the local `shared-rooms.json` — refuse if the requested room is not shared with this peer (or globally)
3. Convert to local encoding if needed (apply inverse bridge, re-quantize)
4. Run hybrid dense+BM25 RRF retrieval
5. Respond with `SignedEnvelope<SearchResponse>` containing top-k matches with `_source_peer` annotation

### 5.3 Match payload

```
Match = {
  node_id:       string  (content-addressed: "sha256:<hex>" or IPFS CID),
  room:          string,
  wing:          string | null,
  distance:      number,
  bridge_from_encoding: string | null
}
```

`node_id` content-addressing makes dedup and replication across peers trivial — identical content from two peers produces the same ID regardless of metadata.

### 5.4 Rate limiting + trust

Peers apply token-bucket rate limiting per `signer_did` (not per peer-id). This means:
- One user on two devices shares one bucket
- A DID attempting abuse can be banned without affecting other users on the same node
- Anonymous (unsigned-envelope) requests get a stricter anonymous bucket

Rate limits are local policy; the protocol specifies only that limits apply at the DID granularity.

---

## 6. Trust Model (§6.1–6.3)

### 6.1 Threat model

- **Malicious peer** sends signed payloads that are wrong, biased, or floods — mitigated by rate limit, optional DID block-list, future reputation scores
- **Injection via shared rooms** — mitigated by the secrets scanner (§ Phase 15 threat model in `docs/p2p-threat-model.md`)
- **Replay of old envelopes** — mitigated by `signed_at` bounds; receivers may reject envelopes more than N minutes old
- **Forged DID** — impossible without the Ed25519 private seed; DID is self-describing and verified locally
- **Downgrade attacks on bridge matrices** — the registry requires SHA-256 pinning; peers never load an untrusted matrix

### 6.2 Optional reputation

v3 core does not mandate reputation. Peers MAY maintain a local DID-keyed reputation table driven by:
- Ratio of useful matches returned (self-evaluated at rerank time)
- Verifiable Credentials (W3C VC spec, v3.1 extension)
- Social graph signals (this DID is followed by DIDs I trust)

### 6.3 Key recovery

Users MAY split their user seed via Shamir's Secret Sharing across 3–5 trusted peers ("social recovery"). v3 core ships the primitive (`ssss-split` / `ssss-combine`) but does not wire it into the CLI — this is v3.1 UX work.

---

## 7. Conformance Tests

A v3 implementation MUST pass:

- `did:key` encode/decode round-trip on a W3C-shape input
- Ed25519 sign/verify on the two domain-separation tags (`wellinformed-auth:v1:`, `wellinformed-sig:v1:`)
- Canonical JSON byte identity across key orderings + nested objects
- Envelope verification: signed on node A, verified on node B with no prior state
- Bridge matrix loading + dimension consistency check

The reference suite is `tests/identity.test.ts` + `tests/identity-lifecycle.test.ts` + `tests/identity-bridge.test.ts` (38 tests total) in the wellinformed repo.

---

## 8. Reference implementation

- **Domain layer** (pure, no I/O): `src/domain/identity.ts`
- **Infrastructure** (disk + Node crypto): `src/infrastructure/identity-store.ts`
- **Application** (lifecycle): `src/application/identity-lifecycle.ts`
- **Process bridge** (sign/verify seam): `src/application/identity-bridge.ts`
- **CLI**: `wellinformed identity {init|show|rotate|export|import}`
- **Bench**:
  - `scripts/bench-lab.mjs` — Matryoshka × quantization × hybrid sweep
  - `scripts/bench-bridge.mjs` — cross-model bridge gate

Zero new runtime dependencies beyond Node's built-in `crypto` and `neverthrow` (already used).

---

## 9. Future work (post-v3.0)

- **v3.1 — Encoder bridges**: train + publish bge↔nomic, e5↔nomic, gte↔nomic matrices via Rust-fastembed to rule out Xenova port confounds
- **v3.1 — BIP39 recovery mnemonics** — current recovery is 64-char hex
- **v3.1 — did:plc** compatibility for AT Protocol interop
- **v3.2 — Bloom-filter pre-filter** — per-peer semantic bloom filter published at capability exchange, cuts federated-query fan-out bandwidth 10–100×
- **v3.2 — HippoRAG-style PPR** over cross-room tunnels + peer graph for multi-hop retrieval
- **v3.2 — Zero-knowledge retrieval** — peer returns a proof that the top-k set is honest without revealing the rest of the index
- **v3.3 — Homomorphic query** — peer runs retrieval on an encrypted query

---

## 10. License

This protocol specification is CC-BY-4.0. The reference implementation is MIT. Cross-model bridge matrices distributed by the wellinformed project are CC0.

---

## Appendix A — measured numbers

All numbers are measured on commodity CPU hardware (Apple Silicon, M-series). Reproduction scripts are in the wellinformed repo at `scripts/bench-*.mjs`.

| Capability | Measurement | Axis | Reference |
|------------|-------------|------|-----------|
| Cross-model retention | 91.9% NDCG@10 | bge query → nomic corpus on BeIR/SciFact | `.planning/BENCH-v2.md §2g` |
| Storage compression | 48× | binary-512 hybrid vs fp32-768 | §2f |
| Retrieval quality (current CPU ceiling) | 75.22% NDCG@10 | SciFact, Rust fastembed bge-base + hybrid | §2e |
| Retrieval latency p50 | 11 ms | SciFact hybrid, 5k corpus | §2e |
| Signed envelope verify | < 2 ms | 3 Ed25519 ops | tests/identity.test.ts |
| Cross-device memory verify | proven | envelope signed on A verifies on B after recovery import | tests/identity-lifecycle.test.ts |
| 10-peer libp2p mesh | 2.5 s setup | real nodes, in-process | v2 §8 |

---

*This document is the spec. For the narrative of why, see `docs/P2P-VISION.md`. For the threat model, see `docs/p2p-threat-model.md`. For the measurement evidence, see `.planning/BENCH-v2.md`.*
