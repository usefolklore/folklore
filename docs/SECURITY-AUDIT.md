# Folklore security audit — 2026-06-22

Authorized defensive pentest of the user's own repo. Three parallel
security-auditor passes (P2P/federation, hooks/redaction, MCP/rust/deny-gate —
last pass pending) plus a manual dependency + dangerous-pattern sweep. Findings
verified against source where marked ✓.

## Fix order (by exploitability × impact)

1. **F1** revoke the committed Hetzner token (do first — it's live)
2. **C-1** wire `validateRemoteNode` into the two inbound paths that skip it (SSRF + poisoning)
3. **DEP-1** bump/patch `protobufjs` (critical RCE, peer-reachable)
4. **C-2 + H-1** bind signed envelopes to the peer + enforce the `signed_at` window
5. **F3** broaden secret-redaction patterns (DB URLs, AWS secret, Azure, env-pass)
6. **H-2** reconsider public-DHT default-on; **F2** stop building JSON in shell; **F5** pin the hook engine path

---

## CRITICAL

### F1 — Live Hetzner Cloud API token committed in cleartext ✓
`.claude/settings.local.json:8-9` — a 64-char `HCLOUD_TOKEN` embedded in two
Bash permission-allowlist entries. Full server/image control over the project's
infra. **Gitignored** (✓ not in git history / remote), but cleartext on disk and
now captured in audit + shell transcripts. None of the 24 redaction patterns
catch a bare Hetzner token.
**Fix:** revoke + rotate in Hetzner now; source it from a secret manager or
user-level env, never a permission literal.

### C-1 — Inbound share-sync + fetch-consumer skip `validateRemoteNode` → SSRF + graph poisoning ✓
`src/infrastructure/share-sync.ts:299` (`upsertNode(buildImportedNode(...))`),
`src/application/federated-ask.ts:231-249` (`cacheFetched`→`cacheNode`→`indexNode`).
The validator (`src/domain/remote-node-validator.ts`) is the documented trust
boundary (SSRF host/scheme gate, prototype-pollution strip, field whitelist) but
is only wired into `touch-protocol` + `oracle-gossip` (✓ grep-confirmed). The
share-sync apply path runs only `classifyInboundShare` + `scanNode` (secrets
only); the fetch consumer runs nothing.
**Exploit:** a peer shares a node with `source_uri:
http://169.254.169.254/latest/meta-data/...` (AWS IMDS) or an internal
`http://10.0.0.5/`; it's persisted and becomes a re-fetch/re-embed target →
SSRF pivot. Same path accepts attacker-chosen id/label/summary → Sybil graph
poisoning that the deny-on-confidence hook later serves as authoritative.
**Fix:** route both paths through `validateRemoteNode` before persist (≈2 lines
each), exactly as touch-protocol does.

### DEP-1 — `protobufjs` arbitrary code execution (critical) ✓
`npm audit`: critical RCE in `protobufjs` (transitive via libp2p). folklore
parses protobuf **from peers** over the DHT/federation, so this is a
peer-reachable code-exec path, not theoretical.
**Fix:** `npm audit fix` / pin a patched protobufjs; verify libp2p still builds.

---

## HIGH

### C-2 — Signed envelopes not bound to the delivering peer → impersonation / relay-replay
`src/infrastructure/share-sync.ts:296-301,471-475`; `src/domain/share-policy.ts`.
A `signed_ok` verdict proves only that *some* DID signed the payload; nothing
ties `verified_user_did`/`device_id` to the `remotePeer` that delivered it. The
only binding (github pin from `peer-labels.json`) is skipped for unlabelled
peers (the default). A peer can relay another author's broadcast envelope and
have it attributed to that author. No nonce, no peerId-in-signature.
**Fix:** include `remotePeer`/nonce in the signed canonical message; require
signer→connecting-peerId match; make pinning fail-closed for trusted peers.

### H-1 — `verifyEnvelope` never enforces the `signed_at` window → unlimited replay
`src/domain/identity.ts:465-502`. Docs promise a freshness check; the code only
copies `verifiedAt` into the result and never compares it to `signed_at`. Old
envelopes replay forever; a future-dated `signed_at` sorts a poisoned node as
"freshest." Compounds C-2.
**Fix:** reject `signed_at > verifiedAt + skew` or `< verifiedAt - maxAge`.

### F2 — Shell-built JSON in the wired SessionStart hook → JSON/context injection
`.claude/hooks/folklore-hook.sh:9-19` (the hook actually wired to SessionStart).
`sed`-extracts a prior session's `final_assistant_message` (attacker-influenceable
transcript text) and interpolates it **unescaped** into a JSON `additionalContext`
template via `printf`. A prior assistant turn containing `"`/`\` breaks the JSON
or smuggles fields; verbatim flow into `additionalContext` is a prompt-injection
path into a fresh session. No RCE (args quoted), so HIGH not CRITICAL.
**Fix:** emit the JSON from Node/`jq -Rs`, not shell. The `.cjs` recall hook
already does this correctly via `JSON.stringify` — prefer it.

### F3 — Common secret formats bypass redaction (verified empirically)
`src/domain/sharing.ts:93-126`. Confirmed misses: AWS **secret** access key
(40-char; only AKIA *IDs* are caught), DB connection strings
(`postgres://user:pass@…`, `mongodb+srv://…` — `basic-auth-url` userinfo class
breaks on `%`/special chars), Azure `AccountKey=`/SAS `sig=` (no patterns at
all), GCP service-account JSON without a PEM block, and generic env creds not
literally named "password" (`DB_PASS=`, bare `SECRET=`). `remember.ts` reports a
redaction count but a pasted Postgres URL passes straight into the digest body →
disk + SessionStart context (F4). `distillSession` also extracts bash commands
verbatim (`PGPASSWORD=… psql`, `curl -H "Authorization: …"`).
**Fix:** add AWS-secret / DB-URL / Azure / broadened-env patterns; loosen
`basic-auth-url` userinfo; optional entropy fallback in assignment contexts.

### DEP-2 — `@libp2p/kad-dht` unvalidated PUT_VALUE → disk-exhaustion DoS
`npm audit` HIGH. A DHT **server** node accepts unbounded PUT_VALUE records.
Worsened by H-2 (public DHT now default-on), making any seed a DoS target.
**Fix:** bump kad-dht; cap/validate inbound records; keep seeds opt-in.

### H-2 — Public Amino DHT default-ON + fixed enumerable rendezvous CID → roster enumeration + deanonymization + eclipse
`src/infrastructure/config-loader.ts:195` (`dht.public:true`),
`rendezvous.ts:65` (CID = `sha256("folklore/federation/v5")`, a constant). Any
third party computes the CID and `findProviders()` to enumerate the entire
folklore membership (peerIds + IP multiaddrs). Correlating peerId→IP (DHT) with
peerId→github (labelled/signed shared nodes) is a direct identity↔IP
deanonymization. Single fixed CID + dial-every-provider loop → Sybil eclipse on
bootstrap. **This is a regression introduced this session** (default flip).
**Fix:** default `public:false` (opt-in), or cap+shuffle dialed providers,
surface the IP-exposure tradeoff at first daemon start, and decouple
github-bearing data from the discovery identity.

### DEP-3 — other high dep CVEs
`fast-uri` (path traversal via percent-encoded dots), `@xenova/transformers` /
`onnxruntime-web` / `onnx-proto` (embedding stack), `fast-xml-builder`, `hono`
(JSX HTML injection). 13 total: 1 critical, 7 high, 5 moderate.
**Fix:** `npm audit fix`; manually review majors.

---

## MEDIUM

- **H-3** `scanNode` covers only 5 fields (no `summary`); `redactNode` covers all
  — a send path wired to `scanNode` ships `summary` secrets. Unify the field set
  + test that both gates cover the same keys. `src/domain/secret-gate.ts` vs
  `src/domain/sharing.ts:134-140`.
- **F5** Hooks resolve the engine to repo-local `dist/cli/index.js` via
  `CLAUDE_PROJECT_DIR`; opening a hostile repo that ships `.claude/hooks/*` +
  `dist/` auto-executes attacker JS on SessionStart. Also `transcript_path` →
  `readFileSync` (`remember.ts:103`) unvalidated (read-any-file primitive, low
  exploitability — must parse as Claude JSONL). Args are array-form `execFileSync`
  (✓ no command injection). **Fix:** pin engine to a user-level absolute path;
  ignore project-scoped `FOLKLORE_BIN`/`CLAUDE_PROJECT_DIR` for binary choice;
  validate `transcript_path` resolves under `~/.claude/projects/`.
- **M-1** Unsigned fetch responses are cached (`federated-ask.ts:198`, gate is
  `sigValid !== false`). **Fix:** gate caching on `sigValid === true`.
- **M-2** `soft` share policy is the default → unsigned nodes accepted.
  **Fix:** default `strict`, or couple soft with mandatory `validateRemoteNode`.
- **M-3** No aggregate-size/node-count budget on share-sync CRDT apply; `.ydoc`
  persisted every frame → amplified disk-I/O DoS. **Fix:** per-peer byte/node
  budget + debounce the ydoc persist.
- **EXEC-1 — FIXED** (commit on `security/audit-and-fixes`). `viz.ts` +
  `x-client.ts` now use `execFile` (no shell); path/url is an argv element.
- **F6** PostToolUse auto-save files web bodies as `--type source` (public, not
  private); confirm `save.ts` runs `redactNode`; redact `source_uri` query strings.

## LOW

- **L-1** `BLOCKED_HOST_PREFIXES` uses `startsWith`, misses `172.16/12`, IPv6 ULA,
  and `10.evil.com` hostnames / DNS-rebinding. Use CIDR + resolve-then-check.
- **L-2** Rendezvous dials every provider per round with no cap — Sybil dial
  amplifier. Cap + shuffle.

## Turnkey fix recipe — C-1 (de-risked)

The naive "just call `validateRemoteNode` before upsert" BREAKS provenance:
`validateRemoteNode` allow-lists `ALLOWED_KEYS` and strips everything else —
including `private`, `github_user`, `_folklore_source_peer`, `_folklore_signed_by`,
which `buildImportedNode` sets. Those are **receiver-derived** (peer = the libp2p
remotePeer; signedBy = verified signature; private = local policy), not
attacker-controlled, so the correct fix validates the attacker fields then
re-stamps the receiver provenance onto the validated node:

```ts
const built = buildImportedNode(peer, s.payload, s.signedBy);
const v = validateRemoteNode(built);           // SSRF/scheme/host + shape gate
if (v.isErr()) { logInbound(logPath, peer, built.id, 'validate_drop'); return; }
const safe = {
  ...v.value,                                  // sanitised attacker fields
  private: false,
  _folklore_source_peer: peer,                 // re-stamp receiver-derived provenance
  ...(built._folklore_signed_by ? { _folklore_signed_by: built._folklore_signed_by } : {}),
  ...(built.github_user ? { github_user: built.github_user } : {}),
} as GraphNode;
const r = upsertNode(graph, safe);
```
Apply at **both** share-sync upsert sites (snapshot-apply ~299 + handler) and at
`federated-ask.ts` `cacheFetched` (validate `node`, re-stamp `_folklore_source_peer`).
Gate with the existing `tests/phase26.e2e-share-sync.test.ts` + add a test that an
inbound node with `source_uri: http://169.254.169.254/...` is dropped.

## Solid (no action)
Prototype-pollution revivers present (`remote-node-validator`, `touch-protocol`);
Noise encryption + Ed25519 peerId auth correct; outbound fetch/search/touch use
`redactNode` consistently; rate limiters with idle-eviction present; hook
arg-passing is array-form (no command injection).

---

## Third pass — MCP / rust / deny-gate (appended)

### C-1 corroborated + deepened: signed envelope doesn't cover the body ✓
`src/domain/match-attestation.ts:48-57` — `canonicalBytes` signs only
`node_id, label, source_uri, fetched_at`, **not `summary`** (the text the agent
reasons from). So even `sig_valid === true` means "a keyed peer vouched for the
metadata," not "the body is true." A keyed peer signs honest-looking metadata
(`source_uri: https://arxiv.org/...`, fresh `fetched_at`) and ships an arbitrary
poisoned `summary`. Compounds C-1/M-1 (unsigned nodes also cached) and the
spoofable scorer below. Two independent audit passes flagged this path.
**Fix:** extend `AttestedMatchFields`/`canonicalBytes` to cover `summary`; cache
only `sigValid === true`; route pulled nodes through `validateRemoteNode`.

### Spoofable satisfaction scorer feeds the deny gate
`src/domain/peer-telemetry.ts:249-296`. `consensus` rises to 1.0 from
attacker-supplied `also_from_peers` strings (a single peer fabricates 2+
origins); `provenance`/`freshness` are 1.0 from attacker `source_uri`/`fetched_at`;
missing signature is *dropped*, not penalized. A poisoned peer answer can score
"confident" and (once H2 is fixed) deny the agent's WebSearch, redirecting it to
attacker text. **Fix:** require attested DID↔peerId-bound distinct origins for
consensus; penalize unsigned remote results.

### H2 — deny gate is INERT on the federated default path
`.claude/hooks/folklore-smart-hook.cjs:144-145` reads `parsed.satisfaction`/
`parsed.decision`, but `formatFederatedAsk` (`federated-ask.ts:297-308`) emits
only nested `_telemetry.*` — so both are null and the deny never fires on the
default `--peers` path. Protective *today*, but dangerous the moment the
plumbing is "fixed" before C-1. **Fix order: C-1 → H2, never reverse.**

### H3 — Rust embed_server unbounded line read → OOM DoS ✓
`folklore-rs/src/bin/embed_server.rs:300` (`reader.lines()` — no cap); TS side
`embedders.ts:275` sends `JSON.stringify(req)` with no size limit and no
`texts.len()`/per-text cap. One multi-hundred-MB query (from an MCP call or
ingested untrusted doc) balloons RSS until OOM, killing the shared embedder.
**Fix:** capped `read_until` + reject over limit; cap `texts.len()` + per-text
bytes in `handle_embed`; clamp query length TS-side (the prefetch hook caps at
300 but MCP tools + ingest don't).

### M4 — embed_server binary path hijackable → RCE
`src/infrastructure/embedders.ts:200-222`. `FOLKLORE_RUST_BIN` (unvalidated env)
or the repo-relative default → `spawn(binaryPath, [])`. A hostile repo shipping
`folklore-rs/target/release/embed_server`, or an env override, runs on first
search. Spawn is arg-safe (array form) — only the *path* is the issue.
**Fix:** absolute install-owned path; refuse world-writable / repo-relative;
optionally hash-pin.

### M5 — LIKE wildcard in `code_graph_query` (minor)
`src/mcp/server.ts:684` wraps `%${name_pattern}%`; parameterized (no injection)
but `%`/`_` act as wildcards over the user's own code. Cosmetic. `ESCAPE` if
exact-substring is intended.

### Clean (verified)
FTS5 `MATCH` goes through `sanitizeForFts5` (tokenized `[a-z0-9]+`, no raw text);
vec0 + all upserts parameterized; MCP tools use zod `.int().min().max()` bounds
(no unbounded-k DoS, no path traversal via node_id); Rust JSON is a closed
tagged enum (no deserialization gadget); spawn is shell-free array form.

---

## Fourth pass — auto-update RCE chain (appended)

### UPD-1 — CRITICAL: release signature doesn't cover the installed bytes ✓
`src/application/update-installer.ts:117` runs `npm install -g folklore@${version}`
using **only** the manifest's `version`. The signed `tarball_url` + `tarball_sha256`
are never consumed by the installer — they appear only as `console.log` hints in
`update.ts:120-121` (✓ grep-confirmed: zero real consumers outside `release.ts`).
So after the manifest signature provably verifies, the bytes that actually
install come from **npm registry resolution**, which is exactly what signing was
meant to remove from the trust path. Anyone who can serve a package for that
version to the host's npm (registry compromise, dependency-confusion, a
misconfigured/MITM'd registry) gets arbitrary code execution (npm lifecycle
scripts run as the daemon user) — with a valid project signature in the logs. On
the `auto_install_force` path it's unattended; on the manual `folklore update`
path the signature still gives false assurance.
**Fix:** download `tarball_url`, verify the bytes against `tarball_sha256`
constant-time, and `npm install -g <verified.tgz>` (the exact artifact) — pass
the full verified manifest into the installer, not a bare version string.

### UPD-2 — HIGH: pinned DID / manifest URL silently overwritten, no https enforcement
The trusted `project_did` + manifest URL can be replaced (config/state) with no
https requirement → an attacker who flips the pin points updates at their own
signer + URL. **Fix:** treat the pin as immutable (compiled-in) or require an
explicit, authenticated re-pin; enforce https on the manifest URL.

### UPD-3 — MEDIUM: one signed force_upgrade → fleet install behind a single local boolean
`auto_install_force` (daemon `loop.ts:216`) gates unattended install — good that
it exists and is opt-in, but a single signed `force_upgrade` manifest then
installs across every consenting node at once (no staged rollout, no per-node
confirm). Combined with UPD-1 that's fleet-wide RCE. **Fix:** stage/canary force
rollouts; keep `auto_install_force` default-off and loudly documented.

### UPD-4 — MEDIUM/LOW: no `released_at` freshness (same-version replay/freeze) + `0.0.0` fail-open
No freshness check lets a signed manifest be replayed to freeze/redirect a node;
a `0.0.0` parse fail-open biases toward the auto-install path. **Fix:** enforce
strictly-increasing version + a signed `released_at` window; fail closed on parse.

### Cleared by this pass
`update-peer-reputation.ts` is **not** in the install path (it scores answer
quality) — peers cannot trigger an install; the only network input is the
manifest, which must verify under the pinned DID. The verify→install TOCTOU is
correctly closed for the *version decision* (re-checked before install) — but
UPD-1 defeats it because the installed bytes never came from the manifest anyway.

---

_All four passes complete (P2P · hooks/redaction · MCP/rust/deny-gate ·
auto-update), plus web/site (clean — `memes.json` render is XSS-safe by
construction) and a dependency sweep. Highest priority: **F1** (revoke token) →
**UPD-1** (install the signed artifact, not an npm version) → **C-1** (validate +
sign the body) → **DEP-1** (protobufjs). The through-line across every pass: the
cryptographic guarantees the code documents are real but **not enforced at the
point that matters** — inbound node validation (C-1), the signed field set
(body), and the installed bytes (UPD-1). The primitives are good; the wiring
leaves gaps._
