# Harness integration roadmap

**Created:** 2026-05-17
**Status:** planning — not yet executed
**Goal:** ship wellinformed as a one-command install into every popular AI coding harness, framed as **"the decentralized cooperative memory & research layer."**

## Tier 0 — already integrated

- **Claude Code** — full integration. PreToolUse + UserPromptSubmit + PostToolUse hooks, MCP server registration, status line, `wellinformed claude install` command.

## Tier 1 — biggest near-term reach

These are the harnesses with the largest active developer mindshare and the
clearest hook-equivalent extension points. Land them next.

### 1.1 Cursor

**Surface area:** Rules + `.cursorrules` + MCP support (since Cursor 0.43).
Cursor has full MCP support; we register the wellinformed MCP server and
get all 23 tools immediately. The hook layer needs a different mechanism —
Cursor doesn't have PreToolUse equivalents; we wire context injection via
a `.cursorrules` snippet that instructs Cursor's agent to call wellinformed
search before WebSearch.

- **Effort:** S (1-2 days)
- **Deliverables:** `wellinformed cursor install`, MCP entry in `~/.cursor/mcp.json`, `.cursorrules` snippet generator.

### 1.2 Cline (VSCode extension)

**Surface area:** Native MCP support + the `.clinerules` file. Cline's
agent loop is open-source and the rules system is the closest analog to
Claude Code's CLAUDE.md.

- **Effort:** S
- **Deliverables:** `wellinformed cline install`, MCP registration, rules snippet.

### 1.3 Continue.dev

**Surface area:** Open-source agent platform. `.continuerc.json` config
+ MCP support + custom slash commands. Their tool-call hooks aren't as
deep as Claude Code's but they have `customCommands` and `slashCommands`
that can be used to surface wellinformed federation.

- **Effort:** M
- **Deliverables:** Continue plugin package on the marketplace.

### 1.4 Aider

**Surface area:** CLI coding assistant. No MCP, no hooks — but Aider
supports `--read` to add files to the chat context. We wire a wrapper:
`wellinformed aider <args>` that runs `wellinformed ask` first, writes
the result to a temp file, then invokes `aider --read /tmp/wi.md`.

- **Effort:** S
- **Deliverables:** `wellinformed aider` shim command.

## Tier 2 — second wave

### 2.1 GitHub Copilot CLI (`copilot`)

**Surface area:** Programmatic `copilot -p` mode. No hooks, but we can wrap
the invocation similar to Aider.

- **Effort:** S

### 2.2 OpenCode (Sonnet CLI)

**Surface area:** Multi-LLM CLI. Plugin system + slash commands. We've
seen it work via the octo orchestrator.

- **Effort:** S

### 2.3 Codex CLI (OpenAI)

**Surface area:** `codex exec` non-interactive mode. Wrapper or via the
`--mcp-config` flag if/when supported.

- **Effort:** M — depends on MCP support landing in Codex.

### 2.4 Gemini CLI

**Surface area:** `gemini` CLI. MCP support landed in 2025-Q4. Wire
similar to Cursor.

- **Effort:** S

## Tier 3 — long tail

- **Sourcegraph Cody** — MCP support + the `cody.commands.context` extension.
- **Tabnine** — limited context surfaces; tertiary priority.
- **Codium** — open-source, low priority.

## The pitch (single sentence per harness)

> *"wellinformed turns your agent into a peer in a cooperative knowledge
> graph. Every research lookup your agent does, every codebase fact it
> learns, every paper it reads — federated to your peers' agents over
> libp2p, scored, and surfaced in your context before the LLM makes the
> next tool call. Same model. Same prompt. Higher floor."*

## Distribution plan

1. Each harness gets a `wellinformed <harness> install` subcommand that
   does the registration in one shot.
2. README badges: `Cursor ✓` · `Cline ✓` · `Continue ✓` · `Aider ✓` etc.
3. Per-harness GIF demo on the marketing site.
4. PRs into each harness's "examples" directory (Cursor MCP gallery,
   Cline community rules, Continue plugin marketplace).
5. Two short blog posts:
   - "Plug wellinformed into your IDE — five harnesses, one command"
   - "Decentralized memory across your AI tools" (the cross-harness story)

## Open questions

- **Identity scope:** does the same `did:key` apply across harnesses, or
  does each harness boot a separate device key authorized by the same
  user DID? Lean toward: one user DID, multiple device keys, one per
  harness instance.
- **Cache sharing:** when both Cursor and Claude Code run with the same
  WELLINFORMED_HOME, they share the prefetch cache + bypass log. Is that
  the right default? Probably yes — gives a unified view across harnesses.
- **Deny semantics across harnesses:** only Claude Code's hook system
  supports `permissionDecision:'deny'`. Other harnesses get the
  context-injection layer (additionalContext / rules) but no hard deny.

## Sequencing

1. **Week 1:** Cursor + Cline (largest reach, lowest effort)
2. **Week 2:** Continue + Aider
3. **Week 3:** Copilot CLI + Gemini + OpenCode
4. **Week 4:** Codex (gated on MCP availability), Cody, marketing copy
