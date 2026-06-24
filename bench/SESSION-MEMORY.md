# Agent-memory benchmark — session-digest distiller

Reproducible measurement of the capture lane (`folklore remember`) over a real
corpus of Claude Code transcripts. Honest framing: every number below is the
pure distiller measured against ground truth, with the by-design cap loss
reported rather than hidden.

## Reproduce

```bash
npm run build
node bench/bench-session-memory.mjs --n 300            # top 300 transcripts ≥20KB by size
```

The harness reads `~/.claude/projects/**/*.jsonl` (read-only — never writes a
graph), parses each with the same `classifyJsonlEntry` the live path uses,
distills, and compares against ground truth derived from the full (uncapped)
`Edit`/`Write`/`MultiEdit` tool-use list.

## Results (300 real sessions ≥ 20KB, corpus of 22,982 transcripts)

| Metric | Value | Notes |
|--------|-------|-------|
| distill latency p50 | 0.15 ms | pure CPU, no embedding |
| distill latency p95 / p99 | 1.25 ms / 3.04 ms | worst case ~6 ms |
| compression | 0.27% of transcript bytes | digest markdown vs raw transcript (~370×) |
| last-goal captured | 100% (300/300) | every session yields a resumable goal |
| ≥1 decision captured | 95% (284/300) | the 5% are pure exploration with no stated choice |
| empty digests | 0% (0/300) | nothing-to-remember rate on substantive sessions |
| file coverage | 94.68% | edited files appearing in the digest (231 sessions with edits) |
| cap-saturated | 27 sessions | edited > 25 files; coverage capped by design (`MAX_FILES`) |
| redaction-need | 0/300 | raw digests carrying a live secret pattern this sample |

### Reading the numbers

- **Latency is free.** Sub-millisecond p50 over real sessions means the Stop
  hook's debounce is the only reason to skip — the distill itself is noise. The
  cost that matters is the one-time embed on an actual capture, measured
  separately (the embedder boot, not the distiller).
- **94.68%, not 100%, and why.** The distiller keeps the 25 most-recently
  touched files (`MAX_FILES`). 27/231 sessions edited more than 25 files; on
  those, coverage is capped on purpose — a resumed session wants the recent
  working set, not a 60-file dump. The cap is reported, not smoothed over. Raise
  `MAX_FILES` to trade a longer injected digest for fuller coverage.
- **Recency, not arrival order.** On a capped session the kept 25 are the *last*
  touched (a re-touch moves a file to the most-recent slot), so the digest
  reflects where work ended, not where it started. Locked by unit test.
- **redaction-need = 0 here, but the layer is load-bearing.** None of these 300
  sessions had a pasted key. The capture path still runs every digest through
  the shared secret patterns (`buildPatterns`, 24 built-ins incl. the
  Anthropic/OpenAI-project key shapes the broad `sk-` rule missed) before save —
  proven by the planted-secret test (3/3 redacted, 0 raw secrets in the graph).
  Session digests are also `private: true`, so they never federate regardless.

## What this does NOT measure

End-to-end recall *quality* (does injecting the digest make a resumed agent
behave better) is not captured by a static harness — it needs an A/B over live
sessions. What is measured here is the upstream guarantee that makes recall
possible: the digest faithfully captures the goal, decisions, and recent files
of a real session, fast, compact, and secret-free.
