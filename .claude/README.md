# Folklore — Claude Code integration

Everything in this directory is Folklore's own Claude Code wiring: the
PreToolUse / PostToolUse / UserPromptSubmit / SessionStart hooks that make the
agent answer from the knowledge graph before reaching for the web, plus the
status-line helper and the project skill. The inherited `claude-flow`
configuration that previously lived here (MCP server, attribution co-author,
agent teams, swarm/hive-mind blocks, the "3-Tier Model Routing" router) was
removed in phase 25; nothing in this directory belongs to that framework.

The live wiring is declared in [`settings.json`](./settings.json). Each hook
fails closed: if the graph is missing, the binary isn't on `PATH`, or a probe
times out, the hook exits 0 with no output so Claude's original tool call
proceeds normally.

## Shipped hooks

| File | Event | What it does |
|------|-------|--------------|
| `hooks/folklore-smart-hook.sh` → `.cjs` | PreToolUse (`Glob`/`Grep`/`Read`/`WebSearch`/`WebFetch`) | Deny-on-confidence graph gate. Prefetches the graph for the tool's query and injects the top hits; on a confident hit (satisfaction ≥ threshold, ≥ min hits) it denies the outbound web call so Claude reasons from cache. Misses are appended to `~/.folklore/miss-log.jsonl`. |
| `hooks/folklore-mcp-pre.cjs` | PreToolUse (`mcp__folklore__.*`) | Pre-call guard for Folklore's own MCP tools. |
| `hooks/folklore-post-fetch.sh` → `.cjs` | PostToolUse (`WebSearch`/`WebFetch`) | Auto-saves the fetched result into the global graph as a `source` note, so the next session (yours or a peer's) hits the graph instead of the web. |
| `hooks/folklore-prompt-submit.cjs` | UserPromptSubmit | Runs `folklore ask` against the prompt text and injects the retrieval block before Claude even reads the prompt — often preventing a WebSearch from being attempted at all. |
| `hooks/folklore-session-start.sh`, `hooks/folklore-hook.sh` | SessionStart | Session bootstrap / context priming. |
| `hooks/folklore-session-capture.sh` | session capture | Captures session activity for later ingest. |
| `hooks/folklore-post-edit.sh` | post-edit | Post-edit helper. |

Supporting assets:

- `helpers/ak-statusline.cjs` — the status-line command referenced by
  `settings.json` (`statusLine`), rendering Folklore federation / cache state.
- `skills/folklore/SKILL.md` — the project skill describing how to consult the
  graph (active lane) alongside the passive hook lane.

## Tuning

The smart hook is tuned through env vars in `settings.json` /the shell:
`FOLKLORE_DENY_WEBSEARCH`, `FOLKLORE_DENY_THRESHOLD`, `FOLKLORE_DENY_MIN_HITS`,
`FOLKLORE_PREFETCH_PEERS`. See the project `CLAUDE.md` for the behavioural
description of the network-before-web gate.

## Model tiering (CLEAN-06)

Folklore does **not** use a foreign 3-tier model router. The removed
"3-Tier Model Routing (ADR-026)" config (Agent Booster / Haiku / Sonnet routing)
was unused and has been deleted.

The only tiering Folklore actually ships is the rerank **hardware-tier** picker
in [`src/infrastructure/hw-detect.ts`](../src/infrastructure/hw-detect.ts). It
probes the host cheaply (platform/arch, Apple Silicon, NVIDIA CUDA via
`nvidia-smi`, Ollama via an HTTP probe, RAM) and resolves a coarse tier —
`gpu` > `accelerated` > `cpu` > `minimal` — which the reranker uses to pick the
best quality the machine can deliver. Without a GPU or a reachable Ollama
endpoint it downgrades from LLM-listwise rerank to cross-encoder, and further to
pure-CPU on minimal hardware. Every probe is fail-closed: a misconfigured
`FOLKLORE_OLLAMA_URL` downgrades the tier rather than crashing.
