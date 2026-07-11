# Deny-gate demo

The one-screen proof of folklore's core bet: **your agent asks its graph before it asks the web.**

![deny-gate demo](deny-gate.gif)

When the graph is confident, the outbound web call is **denied** and answered from
local memory in under a second. When it isn't, the call proceeds — and the result
is saved, so the next agent (yours or a peer's) gets it for free.

## Run it

```bash
cd examples/deny-gate
bash setup.sh                                              # build the demo graph
./agent 'how does tokio schedule tasks across threads?'   # → DENIED, answered offline
./agent 'what is the current SOFR interest rate today?'   # → ALLOWED, web proceeds
```

## What's real here

This is not a mock. `agent.mjs` calls the actual engine (`folklore ask --json`) and
applies the **same deny rule the PreToolUse hook applies inside Claude Code**:
`decision == use_memory` AND `hits >= FOLKLORE_DENY_MIN_HITS` AND
`satisfaction >= FOLKLORE_DENY_THRESHOLD`. Same inputs, same verdict — the CLI just
renders it for a human instead of returning it to the agent.

The only thing scoped-down is the corpus: `setup.sh` ingests 8 curated nodes into an
isolated `FOLKLORE_HOME` (`.demo-home/`, git-ignored) so the demo is fast and
deterministic instead of running against your full graph.

## Re-record the GIF

```bash
cd examples/deny-gate
bash setup.sh
vhs demo.tape        # writes deny-gate.gif
```

Requires [`vhs`](https://github.com/charmbracelet/vhs) (`brew install vhs`).

## Files

| File | Role |
| --- | --- |
| `agent.mjs` | the driver — fires a WebSearch, renders folklore's deny/allow decision |
| `agent` | thin launcher that pins the demo env (`FOLKLORE_HOME`, thresholds) |
| `setup.sh` | builds the isolated demo graph (idempotent) |
| `demo.tape` | VHS script that records the GIF |
