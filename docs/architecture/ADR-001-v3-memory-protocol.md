# ADR-001 — wellinformed v3 memory protocol design decisions

**Status:** accepted
**Date:** 2026-04-17
**Deciders:** project lead + operator
**Supersedes:** none (first ADR of v3 series)

---

## Context

wellinformed v2 established measured retrieval quality (Phase 25: 75.22% NDCG@10 on SciFact via Rust-fastembed bge-base + hybrid — within ~1.5pt of GPU reranker ceiling). The v3 milestone moves from "a retrieval engine" to "a protocol" — with the specific goal of unlocking cross-model, cross-device, cross-agent portable memory for the free-LLM world.

Several design decisions along the v3 surface were evaluated against alternatives. This ADR records the chosen path and why.

---

## Decision 1 — `did:key` as the only required DID method

**Chosen:** W3C `did:key` over Ed25519 (multicodec 0xed01).

**Alternatives considered:**
- `did:web` — human-readable (alice.example.com), requires HTTPS infrastructure per user
- `did:ion` — Bitcoin-anchored, heavyweight, requires IPFS + sidetree network participation
- `did:plc` — AT Protocol's choice, requires a PLC directory server
- `did:pkh` — wallet-address-derived, inherits Ethereum/Solana ecosystem
- Nostr npub — simpler bech32 encoding, incompatible with W3C DID tooling

**Why did:key:**
- **Zero-registry, zero-network offline verifiability** — a peer decodes a did:key in microseconds without a DNS resolve or IPFS dial
- **Self-contained** — the DID string literally contains the public key, so verification needs nothing else
- **Tooling interop** — W3C DID Core compatibility means future Verifiable Credentials adoption is a schema extension, not a protocol replacement
- **Ed25519 already in libp2p's crypto stack** — zero new surface

**Trade-offs accepted:**
- Not human-readable (`did:key:z6MkkcdBLW...`) — v3.1 will add did:plc or DID-to-NIP-05-style aliasing as a layer
- Single-key identity — key rotation requires distributing a new DID, not just a new device key. Mitigated by the device-key layer (§2.2), which IS rotatable without affecting the user DID.

---

## Decision 2 — Three-tier identity hierarchy (user DID → device key → signed envelope)

**Chosen:** User owns the long-lived Ed25519 seed. Each device generates its own operational keypair, authorized by a user signature. Memory entries are wrapped in envelopes signed by the device key, with the device authorization chain embedded.

**Alternatives:**
- **Flat per-device DIDs** — simpler, but loses the "memory follows the user" property
- **Per-entry key derivation** (HD-wallet-style) — over-engineered for the threat model
- **Capability-based auth** (ocap) — doesn't fit the memory-as-value mental model

**Why three-tier:**
- Device key revocation doesn't invalidate past memory entries (each embeds its own device pub + authorization)
- Device compromise doesn't compromise the user identity
- Cross-device memory verification proven in `tests/identity-lifecycle.test.ts`

**Trade-offs accepted:**
- Envelope size — three key references per entry (~96 bytes plus signatures = ~272 bytes envelope overhead). Binary-512 vectors are 64 bytes, so envelope overhead dominates vector size at low quantization. Acceptable for the trust gain.

---

## Decision 3 — Linear (least-squares) cross-model bridge over MLP

**Chosen:** Ridge-regularized linear regression `W = (XᵀX + λI)⁻¹ XᵀY`, trained on paired corpus vectors.

**Alternatives:**
- **MLP bridge** — 2–3 hidden-layer nonlinear map, ~5M params
- **Re-embedding on receive** — naive but exact
- **Shared multi-vector anchors** — index every doc in N encoder spaces

**Why linear:**
- Measured: **91.9% retention on SciFact** (§2g of `BENCH-v2.md`). Above the 85% gate.
- 12-second solve (pure JS, zero deps). MLP training would need TensorFlow/PyTorch + hours
- 2.4 MB per W matrix ships trivially over libp2p identify
- Linear is cleanly invertible (W⁻¹) — bidirectional bridge on the same training
- Secondary finding: linear W **repairs defective ONNX ports** (bridge > native-Xenova-bge)

**Trade-offs accepted:**
- Nonlinear distortions between encoder spaces are lost. MLP could close the remaining ~8pt retention gap.
- If we find a pair where linear drops below 75%, revisit with an MLP head layered on top.

**Promotion criteria for MLP (v3.1):** any measured encoder pair where linear retention < 75% on a published BEIR set.

---

## Decision 4 — `nomic-embed-text-v1.5` as the canonical encoder

**Chosen:** nomic-embed-text-v1.5 is the v3 reference target. All bridges flow toward it.

**Alternatives:**
- `bge-base-en-v1.5` — higher MTEB, but Xenova port is measurably defective (§2e)
- `e5-base-v2` — similar tier, licensing unclear for commercial redistribution
- `all-MiniLM-L6-v2` — too small (384d), older generation
- `gte-base-en-v1.5` — competitive, less community tooling

**Why nomic-v1.5:**
- Apache 2.0 license (permissive, redistributable)
- MRL-trained (Matryoshka truncation from 768 → 128 with 95%+ retention)
- 8192 token context (long-doc friendly)
- Correctly-ported to Xenova transformers.js AND fastembed-rs
- Published benchmarks match our measured numbers (70% on SciFact vs published 70.36%)

**Trade-offs accepted:**
- Not the absolute quality ceiling — bge-large-en-v1.5 and bge-large-en-v1.5 both score higher on raw BEIR
- Encoder choice could become a v3.1 negotiated parameter if a superior open-license alternative emerges

---

## Decision 5 — Binary-512 hybrid as the federated-sync default quantization

**Chosen:** 512-dim Matryoshka-truncated, sign-bit-binary-quantized vectors (64 bytes/vec), scored via hybrid RRF over BM25 + Hamming popcount.

**Alternatives:**
- fp32-768 — current production, 3072 bytes/vec
- fp32-128 — 6× smaller than fp32-768, 99%+ retention in hybrid
- binary-768 — 32× smaller, 97%+ retention, 96 bytes/vec
- int8-512 — broken in current implementation; fixable; dominated by binary at comparable bytes

**Why binary-512:**
- 48× smaller than fp32-768. A 10k-entry vector database drops from ~30 MB to ~0.6 MB.
- Hamming popcount is ~6× faster than fp32 cosine on modern CPUs (`_mm_popcnt_u64`).
- Measured worst-case NDCG@10 loss across SciFact + ArguAna + FiQA + SciDocs: −1.79pt (§2f).
- The quality loss vanishes inside hybrid RRF fusion (already the production path).
- 64-byte payload fits a 10k-entry mesh message cleanly.

**Trade-offs accepted:**
- SciFact pure-dense (no BM25) loses ~13pt vs fp32-768. Peers running dense-only retrieval should use fp32-512 (2048 bytes/vec) instead.
- Non-retrieval use cases (e.g. clustering, tunnels) need the full-precision vector. Nodes can carry both — the canonical on-wire format is binary, the on-disk format is fp32.

---

## Decision 6 — Optional (not mandated) reputation

**Chosen:** v3 core specifies per-DID rate-limiting semantics but does NOT define a reputation protocol. Peers MAY maintain local DID-keyed reputation; there is no protocol-level reputation broadcast.

**Alternatives:**
- Mandatory reputation (every peer publishes scores)
- Social-graph reputation (DID X trusts DID Y)
- Verifiable-credentials reputation (W3C VC)

**Why optional:**
- Reputation as a mandate becomes a point of failure — what happens when peers disagree?
- Local reputation is trivially expressible (a DID block-list is enough for 90% of use cases)
- W3C VC reputation is a compatible additive, not a replacement

**Trade-offs accepted:**
- Byzantine peers can flood at the protocol's built-in per-DID rate limit until they're blocked. Acceptable on a low-noise open mesh; may revisit if abuse emerges.

---

## Decision 7 — Ship primitives without wire-protocol integration first

**Chosen:** v3 primitives (identity, bridge, Bloom, PPR, Shamir) are complete pure-domain modules with full tests. Wire-protocol integration (envelope-wrapping on `search-sync`, `share-sync`, etc.) lands in v3.1 as a separate ship, not a flag-day rewrite.

**Alternatives:**
- Big-bang flag-day rewrite of all wire protocols to carry envelopes
- Opt-in envelope flag per protocol

**Why primitives-first:**
- Each primitive has a clean gate test that ran and produced a measured number (§2f/§2g/§2h of BENCH-v2.md)
- Breaking the existing 293-test regression suite to rewire protocols is unnecessary given the primitives work
- Incremental adoption: `/wellinformed/search/2.0.0` (signed) runs alongside `/wellinformed/search/1.0.0` (unsigned) during migration

**Trade-offs accepted:**
- No demo of end-to-end envelope flow in this release. Integration tests for the bridge seam exist but don't cross the libp2p boundary.

---

## Non-decisions (deferred with reason)

| Item | Why deferred |
|------|--------------|
| BIP39 mnemonic recovery | v1 format (64-char hex) is adequate for the first adopter wave. Adding `@scure/bip39` (40 KB audited dep) is trivial for v3.1. |
| HippoRAG-2 PPR multi-hop SOTA | PPR primitive ships; measured null on single-hop SciFact as expected. Multi-hop benchmark gate (MuSiQue/HotpotQA, ~20 GB downloads) lands in v3.2. |
| Contextual Retrieval (Anthropic Sept 2024) | Requires local LLM runtime (llama.cpp / Ollama) — a heavy dep for a quality lever that's orthogonal to the v3 protocol thesis. v3.2. |
| ZK retrieval | Research space; not even the CCG has a standardized scheme. v3.3+. |

---

## Consequences (measured + expected)

**Immediate (v3.0):**
- Every memory entry wellinformed emits can be cryptographically attributed to a user DID
- Peers running different encoders federate via the bridge registry at 91.9% retention (SciFact)
- Vector databases shrink 48× with −1.79pt worst-case NDCG@10 across 4 BEIR sets
- Ed25519-signed recovery hex restores identity on a fresh machine; envelope signed on device A verifies on device B (proven in `tests/identity-lifecycle.test.ts`)

**Expected (v3.1–v3.3):**
- Bridge matrices published for nomic ↔ bge, nomic ↔ e5, nomic ↔ gte covering ~95% of OSS embedding deployments
- HippoRAG-2 PPR rerank gates on MuSiQue; if PASS, ships as a production rerank path on multi-hop queries
- Contextual Retrieval measured on Phase 25 stack; if +1.5pt on SciFact, publishable CPU-SOTA claim vs monoT5-3B GPU (76.7%)

---

## Revisit triggers

This ADR is revisited if:
- An OSS encoder appears with clearly superior quality AND permissive license AND correct Xenova + fastembed ports → revisit Decision 4
- A measured encoder pair shows linear bridge < 75% retention → revisit Decision 3 (add MLP)
- A reputation attack on a v3.0 deployment succeeds at scale → revisit Decision 6
- did:key proves inadequate for a specific adopter (e.g. mobile wallet integration) → Decision 1 is additive, not exclusive

---

*See `docs/V3-PROTOCOL.md` for the wire-level specification. See `.planning/BENCH-v2.md` §2f/§2g/§2h for the measurements that inform these decisions.*
