# Streaming Inference From Peers — Research & Design

*Status: research synthesis + design proposal. Dev-branch only.*
*Question: how does Claude Code stream inference today, and how could folklore stream reasoning from peers instead of always calling Anthropic's servers?*

Four parallel research passes fed this: Claude Code / Messages-API streaming mechanics (×2, independently corroborated), P2P-inference & cache-serving prior art, and a folklore-architecture gap map. Every external claim is cited at the bottom of its section.

---

## 1. The one hard fact: where the inference stream actually lives

Claude Code always calls `POST /v1/messages` with `"stream": true` and **validates only the SSE protocol, not the backend.** It picks its destination purely from env — `ANTHROPIC_BASE_URL` (host) + `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` (auth). Point the base URL at a local host that speaks the Anthropic Messages SSE dialect and *every* model call — main loop, sub-agents, background — flows through you. This is the sanctioned interception point (the LiteLLM / gateway pattern).

The stream is a fixed SSE event lifecycle:

```
message_start
  → (per content block) content_block_start → N× content_block_delta → content_block_stop
  → 1+ message_delta   (carries stop_reason + cumulative usage)
  → message_stop
  (ping / error may interleave)
```

Delta shapes: text = `text_delta`; tool calls = `input_json_delta` (partial-JSON string fragments, concatenate then `JSON.parse` at `content_block_stop`); thinking = `thinking_delta` + a trailing `signature_delta`. Because the whole model output is just an ordered SSE sequence over one HTTP response, **a proxy can synthesize the entire sequence itself** and the client cannot tell a locally-generated stream from an Anthropic-origin one. That is the core substitution point.

Two adjacent facts:
- **Prompt caching is Anthropic's own "don't recompute" — but it only caches *input* prefixes, never output.** `cache_read_input_tokens` at ~0.1× cost proves it; the generation is always recomputed. So Anthropic gives no output-replay primitive; that is a client-side construct you build. Caches are per-workspace/org, not shareable across peers.
- **Transcripts are on disk but ≠ the wire stream.** `~/.claude/projects/<encoded-cwd>/<session>.jsonl` (append-only, one row per *content block*, grouped by `message.id`) preserves accumulated text, thinking + signatures, tool I/O, and final usage — enough to replay a *semantically identical* Message, but it loses delta granularity, ping timing, and the outbound request body (including `cache_control` placement). To capture the real wire trace you must sit at transport.

Sources: [Messages streaming](https://platform.claude.com/docs/en/build-with-claude/streaming) · [Claude Code env vars](https://code.claude.com/docs/en/env-vars) · [prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) · [sessions/JSONL](https://code.claude.com/docs/en/sessions) · [claude-code-router](https://github.com/musistudio/claude-code-router) · [LiteLLM /v1/messages](https://docs.litellm.ai/docs/anthropic_unified/)

---

## 2. Two things you can share — and only one fits a heterogeneous network

| Share | Examples | Same model required? | Streams? | Fits folklore |
|---|---|---|---|---|
| **Model compute** (split the forward pass) | Petals, exo, LocalAI-worker, Hivemind | Yes — same open-weight model, tokenizer, layout | Yes | ✗ — peers run Claude/GPT/local Llamas; no shared weights |
| **KV cache** (model-internal state over the wire) | CacheGen/LMCache, Mooncake, vLLM/SGLang prefix | Yes — exact weights+version+quant+tokenizer+layout | Yes | ✗ — model-locked; huge; foreign KV is an unverifiable injection vector |
| **Derived artifacts** (final text / distilled trace) | GPTCache, Portkey, semantic-router; ReasoningBank, mem0/Letta/Cognee | **No** — model-agnostic | Yes (replay) | ✓ — this is folklore's lane |

The takeaway is structural, not incidental: **KV and layer-splitting are definitionally impossible across peers on different models.** KV is a model-internal representation, not knowledge. Only *derived artifacts* — the final answer, or better a distilled reasoning trace — cross a heterogeneous network. And at hit time a derived-artifact reuse needs **no inference at all** — it sidesteps the model entirely.

Prior art that directly informs the design:
- **Replay-as-stream is solved, not research.** Portkey serves cache hits as SSE chunks indistinguishable from live completions; GPTCache supports stream-mode hits. Chunking a stored answer into a token stream is an interface decision.
- **The transport exists.** LocalAI *federated mode* (libp2p DHT + mDNS, shared-token private swarms, NAT traversal, whole-request routing to a peer) is the closest architectural precedent; Petals proves DHT-routed multi-hop sessions over volunteers.
- **The admission decision is the hard part.** semantic-router's *learned per-route thresholds* + Portkey's "start at 0.95+ cosine, disable semantic mode for correctness-critical domains" are the state of the art. A global 0.8 threshold is the *documented* failure mode. **Wrong-context reuse, not staleness, is the dominant correctness risk.**
- **Distilled trace beats verbatim replay.** ReasoningBank (Google, +34.2% success / −16% steps) shows strategy-level memory items outperform raw trajectory replay, and *failures are as valuable as successes*. This validates folklore's `synthesis`/`resolved_query` node approach over caching verbatim model output.
- **The open ground:** nobody today combines *peer discovery + trace-level memory + similarity-gated admission + stream replay*. Each existing system holds one or two of those four. Folklore is positioned to hold all four.

Sources: [Petals](https://github.com/bigscience-workshop/petals) · [exo](https://github.com/exo-explore/exo) · [LocalAI distribute](https://localai.io/features/distribute/) · [CacheGen](https://arxiv.org/abs/2310.07240) / [LMCache](https://github.com/LMCache/LMCache) · [Mooncake](https://github.com/kvcache-ai/Mooncake) · [GPTCache](https://github.com/zilliztech/gptcache) · [Portkey cache/stream](https://dev.to/portkey/stream-llm-responses-from-cache-5f5o) · [semantic-router thresholds](https://docs.aurelio.ai/semantic-router/user-guide/features/threshold-optimization) · [ReasoningBank](https://arxiv.org/pdf/2509.25140)

---

## 3. The legal line (shapes the whole design)

Anthropic Commercial Terms: **you own your Outputs** — storing and replaying **your own** completions is squarely permitted, and Anthropic doesn't train on customer content. But **third-party redistribution** — peer A's Claude output answering peer B's identical prompt — is **not addressed** in the public terms. That's the actual open question and it is unresolved.

Consequence: the shared unit should be a **distilled trace / synthesis** (a derived work the sharing peer authored), **not verbatim provider completions**. This is *independently* the better technical choice (§2, ReasoningBank) — so the legal-safe path and the quality-optimal path are the same path. Verbatim peer-completion sharing is deferred behind an explicit opt-in and a direct terms read.

Sources: [Commercial Terms](https://assets.ctfassets.net/5965pury2lcm/4e9p7xwZDo6mBgWfSyDsCV/907c229ef3ee22366fa66837419bde2c/Anthropic_T_Cs.pdf) · [output-ownership analysis](https://terms.law/ai-output-rights/anthropic/)

---

## 4. Where folklore is today — and the exact gap

**Current boundary — folklore intercepts at the *tool layer*.** Claude Code hooks gate `WebSearch`/`WebFetch` (deny-on-confidence) and inject retrieved context as `additionalContext`; MCP tools (`ask`/`search`/…) answer on demand. What's substituted is **retrieved knowledge for a network trip** — the model on Anthropic's servers still generates every output token. Confirmed by grep: **zero** `/v1/messages`, `ANTHROPIC_BASE_URL`, SSE, or proxy code in `src/`. Denying a tool reduces *tool traffic*, not *inference traffic*.

**Target boundary — intercept at the *model layer*.** A local wire-compatible `/v1/messages` proxy that Claude Code points at via `ANTHROPIC_BASE_URL`. Per request: canonicalize the message array, check a completion/trace index, then either **replay a stored answer as spec-correct Anthropic SSE** (never contact Anthropic) or **pass through, tee the stream, and file the result** — the exact analogue of the existing `PostToolUse` auto-save, one layer down.

**Already built — transplants directly (folklore is ~70% there):**
- `resolved-query://` nodes (`src/domain/query-reuse.ts`) — embedded *question → verified answer-doc pointers*, already federating over the CRDT, expanded at read time behind `FOLKLORE_QUERY_REUSE=1`. A completion/trace node *is* this shape. (Claimed q2q recall@1 ≈0.71–0.84 vs ~0.35–0.47 q2doc.)
- Both federation transports carry peer answers with **no new protocol**: `/folklore/search/1.0.0` ships the **query embedding, never the text** → signed pointer metadata; `/folklore/fetch/1.0.0` ships bodies (≤4 KB summary cap — would need raising). Ed25519 per-node/per-match attestation gives "this peer vouches for this answer" for free, with claimed-but-invalid-never-cached.
- The deny-gate brain — `computeSatisfaction` / `decideContract` / energy gate (thresholds ≥0.85 use / ≥0.65 verify / ≥0.40 search / <0.40 ask) — transplants as the **serve-vs-passthrough** decision; miss-log / bypass-log as its audit trail.
- L1 exact-hash (`query-cache.ts`) and L2 semantic (`semantic-cache.ts`, ≥0.92 cosine, LRU+TTL) are in-process prototypes of the exact + close-enough completion lookups.
- Read-side precedent already shipped: MCP `ask` short-circuits to a cached assembled answer within 60 s (`src/mcp/server.ts:115-174`) — the whole replay pattern, one layer too high to touch the token stream.
- Privacy/trust plumbing: `private` flag, secrets redaction, `validateRemoteNode` (SSRF/scheme/size), per-peer rate limits, contribution ledger + notifications.

**Missing — net-new (5 components):**
1. **The proxy** — a local HTTP server speaking Anthropic Messages (`/v1/messages` + `/v1/messages/count_tokens`, forward `anthropic-version`/`anthropic-beta` unchanged, TLS/auth passthrough) + install-time `ANTHROPIC_BASE_URL` wiring (natural home: `folklore claude install`).
2. **A completion/trace cache keyed on the message array** — canonical serialization of (model, system, messages, tools, params) → hash key + a *larger* body store than the current 4–8 KB caps.
3. **An SSE replay encoder** (stored answer → spec-correct streaming events, plausible pacing) + a **tee/capture decoder** for the pass-through path.
4. **A "close-enough" gate calibrated for *completions*** — retrieval-relevance thresholds (deny 0.85; semantic 0.92) are far too loose to serve a *whole answer* for a paraphrase. Needs learned per-intent thresholds (semantic-router style) and a multi-turn keying strategy (last user turn vs. whole array). `.bench-data/` + `shadow-receipt` calibration are the instruments.
5. **A replayability classifier** — tool-use turns, environment-dependent answers, and anything with side effects must **always** fall through. No such classifier exists (the prompt-submit regex is a starting sketch).

---

## 5. Proposal — three lanes, shipped in order

**Lane A — Federated derived traces (do now; ~70% exists).** Keep intercepting at the tool layer, but make the *shared unit* a distilled reasoning trace, not just a source doc. Extend `resolved_query`/`synthesis` to capture "question → the reasoning that resolved it" (ReasoningBank-style: successes *and* failures), federate over the existing transports, inject as context. **Zero legal risk, zero model-lock, no new protocol.** This is folklore's thesis, sharpened. It does *not* replace the token stream — and that's fine, because it removes the *need* for many calls entirely.

**Lane B — Self-cache proxy (in-spec, high personal value).** Build the `/v1/messages` proxy but scope it to replay **your own** prior completions (deterministic exact-match first, then a *conservative* semantic gate). You own your outputs, so this is unambiguously in-spec. It cuts your own repeated inference cost and is the vehicle that proves the SSE replay encoder + capture tee + `ANTHROPIC_BASE_URL` wiring. Reuses Lane A's cache + gate machinery.

**Lane C — Peer-completion streaming (deferred, gated).** Only after a direct terms read: let the proxy serve *another peer's* signed answer as SSE. Technically this is Lane B + Lane A's federation with no new mechanism — but it's the legally murky one. Ship behind an explicit opt-in flag, distilled-trace-first (not verbatim), with the replayability classifier hard-blocking side-effecting turns.

**Sequencing:** A (this quarter, extends shipped code) → B (proves the proxy in-spec) → C (pending legal, flag-gated). Each lane composes with the last; none throws away the previous.

**The honest one-liner:** folklore's superpower isn't streaming *the model's tokens* from peers — that's KV territory, model-locked and legally murky. It's making the model *unnecessary* by streaming the **derived reasoning** peers already worked out. Lanes B/C are the plumbing to serve that at the transport layer; Lane A is the actual value.
