# Multi-provider integration — epic

**Created:** 2026-05-17
**Status:** epic-level — needs decomposition before any phase starts
**Trigger:** "integrate to claude plugins store and mcp, to chatgpt and codex, to gemini and to all the other ai providers people love and use (treat this one as an opec of its own)"

## Why this is an epic, not a phase

Each provider has its own auth model, plugin store, distribution channel,
hook architecture, and pricing surface. Shipping wellinformed as a first-class
plugin/MCP server inside each one is on the order of weeks per provider,
not days. Trying to land them in one sweep is how integrations end up
half-baked. This epic decomposes the work into per-provider phases that
each ship independently and can be parallelised.

## Surface area per provider

### A. Anthropic / Claude

#### A.1 Claude Code plugin store

- **What:** wellinformed as a first-class entry in the Claude Code plugin
  marketplace (the `claude-plugins-official` org or equivalent).
- **Effort:** M — plugin manifest, hooks pre-wired, MCP server pre-registered,
  CLAUDE.md snippet auto-inserted. Mostly packaging.
- **Distribution:** `claude plugin install wellinformed` one-liner.
- **Gates:** Anthropic's plugin marketplace acceptance criteria + naming.

#### A.2 Anthropic API direct integration

- **What:** MCP server entry that any Anthropic SDK consumer can wire in:
  `client.beta.messages.create({mcp_servers: [{url: 'wellinformed mcp', ...}]})`
- **Effort:** S — the MCP server already exists. Document the wire-up
  pattern in `docs/integrations/anthropic-sdk.md`.
- **Distribution:** README docs.

### B. OpenAI / ChatGPT / Codex

#### B.1 ChatGPT GPT actions

- **What:** A GPT in the GPT Store backed by an OpenAPI spec that fronts
  the wellinformed daemon's HTTP surface.
- **Effort:** M — daemon needs an HTTP server (currently only stdio MCP +
  Unix socket IPC). Add a `wellinformed http-serve --port N` mode.
- **Distribution:** GPT Store listing.

#### B.2 Codex CLI integration

- **What:** Once Codex's MCP support lands (in Q3 2026 per their roadmap),
  same pattern as Claude Code: `codex --mcp-config wi.json`.
- **Effort:** S, gated on Codex.

#### B.3 OpenAI Assistants API

- **What:** Function-calling integration — wellinformed exposed as a set
  of function tools to any Assistant.
- **Effort:** M — adapter that translates between MCP tool schemas and
  OpenAI function-calling schemas.

### C. Google / Gemini

#### C.1 Gemini CLI

- **What:** Same shape as Codex once Gemini CLI hits MCP parity (which
  it has since Oct 2025).
- **Effort:** S.

#### C.2 Vertex AI / Gemini API

- **What:** Same as the Anthropic SDK pattern — document the wire-up
  for Vertex AI customers.
- **Effort:** S.

### D. xAI / Grok

- **What:** Function-calling pattern. Grok 3 API.
- **Effort:** M, lower priority (smaller dev mindshare).

### E. Mistral

- **What:** Function-calling pattern. Le Chat backed by `mistral` API.
- **Effort:** M, low priority.

### F. Open-weights providers (Ollama, vLLM, LM Studio, etc.)

- **What:** Local-model harnesses don't have native function-calling
  consistency. Approach: ship a `wellinformed translate` mode that
  injects the federated context into the system prompt directly.
- **Effort:** S.

### G. Generic "any chatbot UI"

- **What:** A Chrome extension that watches the active LLM chat (whatever
  provider) and injects wellinformed context client-side, similar to
  Memex / Glasp.
- **Effort:** L — separate browser product. Defer.

## Per-provider deliverable shape

Every provider integration needs the same five artifacts:

1. **Install command:** `wellinformed <provider> install`
2. **Config snippet:** auto-generated entry for that provider's MCP/plugin/rules system
3. **Auth flow:** OAuth where supported, API-key fallback otherwise
4. **Documentation:** `docs/integrations/<provider>.md` with the wire-up walkthrough
5. **Demo:** screen recording showing federation firing in that harness

## Architectural prerequisites (do these first)

Before fanning out, two pieces of infrastructure need to land. Both block
parallel provider work.

### P.1 HTTP serve mode

The daemon needs a `wellinformed http-serve --port N` that exposes the
same surface as the MCP stdio server but over HTTP. Required for ChatGPT
GPT Actions and any provider without native MCP support. Maps to:
`POST /ask`, `POST /search`, `GET /node/:id`, `POST /federated_search`.

- **Effort:** S–M (~2 days)
- **File:** new `src/infrastructure/http-server.ts`

### P.2 Tool-schema adapter

The MCP tool schemas are zod-based. OpenAI function-calling and
Anthropic tool-use use JSON Schema. Vertex AI uses a different shape.
Build one canonical conversion from MCP tool definitions → all major
function-calling schemas.

- **Effort:** S
- **File:** new `src/application/tool-adapters/index.ts`

### P.3 Cross-harness identity

Currently `wellinformed identity init` creates a fresh DID per home.
Multi-provider means one user DID with N device keys (one per harness
install). The lifecycle ops in `src/application/identity-lifecycle.ts`
need a "register-new-device" path that authorizes a fresh device key
under an existing user DID.

- **Effort:** M (the cryptographic surface exists; need the UX)

## Sequencing

Suggested order, parallel where possible:

```
Week 1  ┃ P.1 HTTP serve mode (blocks B.1, F)
        ┃ P.2 Tool-schema adapter (blocks B.3, D, E)
Week 2  ┃ A.1 Claude Code plugin store
        ┃ B.2 Codex CLI (if MCP support has shipped)
        ┃ C.1 Gemini CLI
Week 3  ┃ B.1 ChatGPT GPT actions
        ┃ B.3 OpenAI Assistants API
        ┃ P.3 Cross-harness identity
Week 4  ┃ A.2, C.2 SDK documentation
        ┃ F   Open-weights harness adapter
        ┃ D, E lower-priority providers
Backlog ┃ G   Chrome extension (deferred)
```

Each provider gets its own short phase planning doc once it enters
active work. This file is the meta-plan.

## Marketing through the integration

Each provider integration is a content opportunity:

- *"Your ChatGPT GPT now has a peer-to-peer memory layer"*
- *"Gemini CLI + wellinformed = federated context on your terminal"*
- *"One memory, every model: the wellinformed cross-harness story"*

The cross-harness narrative is the actual differentiator. Memory layers
that lock you to one provider (mem0 + Anthropic only, Letta + own host,
etc.) are common. wellinformed's federation works across providers
because the data is yours, the protocol is open, and the integrations
are thin adapters.

## Open questions

- **Pricing:** every provider is free for the integration itself (wellinformed
  runs locally + on the user's peers). But ChatGPT GPT Actions has minimum
  performance bars — does our HTTP serve mode pass them? Test before listing.
- **OAuth juggling:** each provider has its own OAuth flow. Cross-provider
  single-sign-on through github OAuth is the cleanest UX. Plumb it through
  the existing `wellinformed login` command.
- **API stability:** which providers are likely to break their MCP/plugin
  surface in the next 6 months? Anthropic's is locked. OpenAI's Assistants
  API has been stable since beta. Gemini's CLI is young — expect churn.
  Plan accordingly with version pinning in the install commands.
