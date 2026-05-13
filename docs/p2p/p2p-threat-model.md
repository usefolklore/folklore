# P2P Threat Model — Remote Code Execution + Data Leakage

Scope: the attack surface exposed once a wellinformed node accepts data from **untrusted peers** via `share sync` (Y.js CRDT) or `touch` (one-shot pull). This document enumerates concrete paths from a hostile peer to code execution or secret exfiltration, and the mitigations that are (a) shipped, (b) planned, or (c) deferred.

**Threat actor.** A peer on the P2P network who has completed the libp2p handshake and can send arbitrary payloads on `/wellinformed/share/1.0.0` and `/wellinformed/touch/1.0.0`. Peers are not authenticated beyond their ed25519 peer identity — there is no external PKI and no "this peer is trusted" claim.

**Assets.**
1. `graph.json` — node store. A corrupted node can re-appear on every subsequent query.
2. `vectors.db` — SQLite file; SQL injection into FTS5 queries is a latent risk.
3. `~/.claude/projects/*.jsonl` — session transcripts, often contain API keys.
4. `~/.wellinformed/*.yaml`, `peer-identity.json` — private key for peer identity.
5. Host shell via `node --` subprocess spawning on node content (only if we ever pipe node data into a command).

## Attack surface, ranked by severity

### AS-1 — Prototype pollution via JSON.parse on touch response (HIGH)

**Vector.** `touch-protocol.ts:initiator` does `JSON.parse(decoder.decode(frame.value)) as TouchResponse` without schema validation. A hostile responder can send `{"__proto__":{"polluted":true}}` and, if any subsequent code path walks the parsed object with `for (const k in obj)`, the pollution propagates to every object in the process.

**Status.** Not mitigated in v2.1.

**Mitigation (planned):**
- Wrap `JSON.parse` with a reviver that rejects `__proto__`, `constructor`, and `prototype` keys.
- Validate `TouchResponse` shape with zod/typebox before casting — reject on any missing/extra field.
- Same for `share-sync.ts` SubscribeRequest parsing (line 613 area).

### AS-2 — Malformed GraphNode passed to `upsertNode` (HIGH)

**Vector.** Touch merges remote nodes directly into the local graph via `upsertNode`. The function checks four required fields but accepts arbitrary extra keys. A hostile peer can craft a node with a 10 MB `label`, a `source_file` that is a real filesystem path, or a key whose name shadows code that later reads the node (e.g. `toJSON`, `toString`).

**Status.** Partially mitigated — `GraphifyNodeCore` requires `file_type ∈ {'code','document','paper','image','rationale'}` and that's type-enforced at TypeScript level, but NOT runtime-enforced on touched nodes.

**Mitigation:**
- Add a runtime `validateRemoteNode` predicate on the touch ingest path that enforces field whitelists, max string lengths (labels ≤ 8 KB, URIs ≤ 2 KB), and the file_type enum.
- Strip keys that don't appear in an explicit allow list. Arbitrary extra keys (e.g. `__proto__`, `toJSON`) are dropped.

### AS-3 — SQL injection via node label → FTS5 (MEDIUM)

**Vector.** After touch ingest, the node's `label` or `raw_text` flows through `vec_meta.raw_text`, the FTS5 index, and eventually through `bm25(fts_docs, k1, b)` in `searchHybrid`. A maliciously crafted label containing FTS5 operators (`AND`, `OR`, `NEAR`, `"`, column filters) can alter query semantics or cause parse errors that crash the search.

**Status.** `searchHybrid` already sanitises *queries* with `sanitizeForFts5` (Phase 21) — but the *indexed text* comes from node labels, which are peer-controlled on touched nodes.

**Mitigation:**
- FTS5 itself treats indexed text as content-only (operators in content are safe); risk is limited to query-time if we ever echo label text back into a query.
- Harden by running `sanitizeForFts5` also on labels at touch-ingest time.
- Reject labels containing NUL bytes or control characters < 0x20.

### AS-4 — Secret exfiltration via unredacted OWN nodes (HIGH, mitigated)

**Vector.** A researcher pastes an OpenAI key into a note, marks their room public, a peer touches the room, the peer now has the key.

**Status.** Mitigated by `secret-gate.ts::redactNode` — the touch responder runs every outbound node through 14 built-in patterns (openai-key, github-token, aws-key-id, etc.) plus user-configured extras from `config.yaml::security.secrets_patterns`. Matches are replaced with `[REDACTED:<pattern-name>]` in place.

**Residual risk.** Patterns are heuristic. Novel key formats (Anthropic `sk-ant-...` is not built-in — add it), API secrets embedded in URLs, or secrets encoded as base64 will not match. The gate is a defence in depth, not a guarantee. Users should still run `share audit` before publishing and treat every shared room as already-leaked.

### AS-5 — Embedding-vector leakage (MEDIUM, mitigated)

**Vector.** Sentence-transformer embeddings reveal approximate source text (Morris et al. 2023, "Text Embeddings Reveal Almost As Much As Text"). Shipping a vector is nearly shipping the raw note.

**Status.** Mitigated at design level — `ShareableNode` does NOT include the vector field; touch payload is metadata + source_uri only. Receivers must re-embed from `source_uri` or `label` on their own side.

### AS-6 — Arbitrary URL fetch on indexing (MEDIUM)

**Vector.** A touched node has `source_uri: "http://169.254.169.254/latest/meta-data/"` (AWS IMDS) or `"file:///etc/passwd"`. If peer B runs `discover-loop` or any re-ingest over a touched node, they may hit SSRF targets or read local files.

**Status.** Not mitigated. The re-ingest path uses the same adapters as manual source-add.

**Mitigation:**
- At touch-ingest, rewrite `source_uri` to `p2p://<peerId>/<originalUri>` so downstream code knows this URI came from a peer and has to re-opt-in before fetching.
- OR: reject any `source_uri` that resolves to a private IP, file:// scheme, or a scheme not in `{https, arxiv, p2p}`.

### AS-7 — Prototype gadget chain on Y.js updates (HIGH)

**Vector.** `share-sync.ts` accepts incremental Y.js updates from peers and applies them to local Y.docs. Y.js internally uses a binary CRDT format, but the *interpretation* of fields eventually flows back through JSON.parse-style paths when materialised to `graph.json`.

**Status.** Same as AS-2, applies to the Y.js path.

**Mitigation:** same as AS-2 — runtime validation at the domain boundary before materialisation.

### AS-8 — Denial-of-service via unbounded payloads (LOW)

**Vector.** A peer sends a single touch response with 1 million nodes, each with a 100 MB label.

**Status.** Partially mitigated — `TOUCH_MAX_NODES = 5000` is enforced responder-side and capped client-side via `req.max_nodes`. No per-node size cap exists.

**Mitigation:**
- Add wire-level frame cap in `makeFramedStream` (reject frames > 64 MB).
- Enforce `label.length ≤ 8 KB`, `source_uri.length ≤ 2 KB` in `validateRemoteNode`.

### AS-9 — Peer-identity spoofing (LOW, design-mitigated)

**Vector.** Attacker claims to be peer X by reusing X's peer ID in a multiaddr.

**Status.** Mitigated — libp2p's noise transport does a mutual ed25519 handshake; a peer cannot impersonate another peer's ID without their private key.

### AS-10 — Command injection on node-text rendering (CRITICAL IF PRESENT, CURRENTLY NONE)

**Vector.** Any code path that does `exec(node.label)`, `spawn(node.source_file)`, or `require(node.somefield)` would be an instant RCE.

**Status.** Verified absent. No `child_process`, `eval`, or `require()` call in the codebase consumes node-derived strings as commands/paths. This is a standing invariant — any future adapter that does this must be gated behind a local-only provenance check.

## Mitigation priority

Mandatory before shipping `touch` to untrusted peers:
1. **AS-1 + AS-2 + AS-7** — Schema-validate every inbound payload. One function `validateRemoteNode`, shared across touch + share-sync, zero bypass.
2. **AS-6** — URL scheme + IP allow-list on touched `source_uri`.
3. **AS-8** — Per-node size caps.

Defer (acceptable for trusted LAN / known peers):
- **AS-3** — Low impact unless label → query path exists.
- **AS-4** — Already mitigated by secret-gate; pattern set is the ongoing maintenance burden.
- **AS-5** — Design-level mitigated.
- **AS-9, AS-10** — Not exploitable in current code.

Target: AS-1/2/7 fixes land as a single `validateRemoteNode` module with unit tests covering each malformed-node shape. Est. effort: 2-3 hours.
