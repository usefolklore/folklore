# Agent memory — session continuity across context clears

The problem: every time a coding agent's context window clears (compaction,
`/clear`, a new session), it forgets what it was doing. You end up writing manual
session handoffs over and over.

Folklore already is a memory layer — a knowledge graph with embeddings, hybrid
retrieval, and `recall`/`ask`. What was missing was the **session-continuity
lane**: capturing a distilled "where did we leave off" memory when context is
about to clear, and recalling it when a fresh window opens. This is that lane.
It reuses the existing graph, embedder, and save path — no new dependency, and
**no API key**: distillation is heuristic over the active session's own
transcript (the JSONL file Claude Code already writes to disk).

This is the folklore-native equivalent of what mem0 / agentmemory do, except the
memory lives in your graph (federates with peers when not private, retrievable
via `ask`) instead of a second siloed store.

## The two lanes

**Capture** — `folklore remember --transcript <path> [--workspace W] [--force]`
Reads a session transcript, distills it into a single digest (last goal,
decisions, files touched, open threads, errors, commits), and saves it as ONE
embedded `decision` node marked `private: true`. The node id is deterministic
per `(day, workspace, session)`, so repeated captures **update the same node in
place** (mem0-style consolidation) instead of spamming the graph. A debounce
(`--min-new N`, default 6) skips re-capture until the transcript has grown
enough — and the debounce check runs *before* the embedder boots, so skipped
captures are cheap.

**Recall** — `folklore resume [--workspace W|all] [--limit N] [--json]`
Prints the most recent digest(s) for this workspace. Reads `graph.json`
directly (no embedder boot) so it's fast enough to run on every session start.
Silent when there's no prior memory.

## Hook wiring

Two hook scripts drive the lanes automatically:

- `.claude/hooks/folklore-memory-capture.cjs` — wired on **Stop** (debounced),
  **PreCompact** (forced — context about to be summarised), and **SessionEnd**
  (forced — last chance before close). Reads `transcript_path` + `cwd` from the
  hook stdin payload.
- `.claude/hooks/folklore-memory-recall.cjs` — wired on **SessionStart**.
  Emits the latest digest as `hookSpecificOutput.additionalContext`, so a fresh
  window opens already knowing where you left off.

Every hook path is soft-fail: any error exits 0 with no output, so the session
is never blocked. The capture that does fire boots the embedder once (~1–3s);
the debounce keeps that rare on `Stop`.

### settings.json

The capture/recall hooks must be registered in `.claude/settings.json`. The
recall hook is added alongside the existing SessionStart stats hook; capture is
added to the (previously empty) `Stop`, `PreCompact`, and `SessionEnd` arrays.
See the PR / setup notes for the exact block — registering auto-executing hooks
is a deliberate, user-authorised step.

## Tuning knobs (env)

- `FOLKLORE_CAPTURE_TIMEOUT_MS=30000` — max time the capture hook waits.
- `FOLKLORE_RESUME_TIMEOUT_MS=5000` — max time the recall hook waits.
- `FOLKLORE_RESUME_LIMIT=1` — how many recent digests to inject at SessionStart.
- `remember --min-new N` (default 6) — debounce threshold on `Stop`.

## Why not bolt on mem0 / agentmemory

They would add a second store that doesn't federate, duplicates retrieval the
graph already does, and wouldn't fix the actual gap (capture wrote empty
markers; recall surfaced stats, not memory). Distilling into the existing graph
means session memory is searchable via `ask`, ages under the same freshness
rules, and — when not private — compounds across peers like every other node.
