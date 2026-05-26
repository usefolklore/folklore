# Octopus discover — Round 6 (2026-05-26 evening, cleanup audit)

Cleanup-audit round run after the Akashik rebrand sweep (rounds 4-5
delivered the strategy + work plan; this round audits what's no
longer relevant in the repo). Synthesis fused into actionable
priority matrix.

## Headline findings

The audit identified the repo's **two-story debt** — codebase
fractured between the dead "single-player retrieval leaderboard"
era and the live "federated knowledge commons" era, actively
misleading new contributors. Three top-priority cleanup actions
named explicitly:

1. **Delete & gitignore local state and backups**
   (`.claude-octopus/`, `.agents/`, `.claude-plugin/`,
   `README.md.bak.830lines`) — security/hygiene risk + repo bloat.
2. **Bulk archive `.planning/phases/` and pre-pivot retrieval docs**
   (`beat-the-competitors-retrieval-plan.md`,
   `performance-prediction-matrix.md`, SOTA-attack docs) into an
   `archive/` folder — they actively mislead new contributors by
   presenting the dead positioning as current strategy.
3. **Rewrite `MANIFESTO.md`, `VISION.md`, `ROADMAP.md`** to the
   Akashik OSS-commons framing + set up a `wellinformed` bin
   alias for zombie integrations during the two-name period.

## Priority matrix (verbatim from synthesis)

| Finding / Action | Impact | Effort | Priority |
| :--- | :---: | :---: | :---: |
| Delete `.claude-octopus/` & `README.md.bak.830lines` | High | Low | **High** |
| Add `.claude-octopus/`, `.agents/`, `.claude-plugin/` to `.gitignore` | High | Low | **High** |
| Archive `.planning/phases/` & retrieval-era research docs | Medium | Low | **High** |
| Commit Hetzner benchmark results to repo | High | Low | **High** |
| Rewrite `MANIFESTO.md`, `VISION.md`, `ROADMAP.md` | High | Medium | **High** |
| Archive synthetic tests (`bench-standard`, `bench-real`, `*synth*`) | Medium | Low | **Medium** |
| Quarantine `src/telegram/bot.ts` to `legacy/` | Low | Low | **Medium** |
| Setup shadow traffic validation for federated search | High | High | **Medium** |
| Coordinated global rename to `akashik` (with bin alias) | High | High | **Low** |

## Conflicts + trade-offs surfaced

- **Codebase naming (rename vs two-name):** Full rename cleanly
  aligns branding but breaks the Rust IPC (`wellinformed-rs`) and
  legacy zombie integrations. Resolution: tolerate cognitive debt
  of two-name period; keep `wellinformed` for code/binaries with
  later deprecation-aliased rename.
- **Experimental rerankers (`cross-rerank.ts`,
  `llm-listwise-rerank.ts`):** Archive/disable rather than delete.
  ML infrastructure is technically sound and may be revived post-
  pilot; deletion is irreversible.
- **Telegram bot (`src/telegram/`):** Quarantine to
  `src/legacy/` with explicit deprecation, don't delete (would
  abruptly break workflows that won't voluntarily migrate).

## Gaps flagged

- **Shadow traffic validation:** As `ask()` shifts to
  `federated-search.ts` gossip fan-out, unit tests aren't enough.
  Need a harness replaying federated queries against both the
  old direct-fan-out path and the new routed path, with parity
  defined (e.g. top-5 result-sets must not drop >1 point absolute).
- **Untested backups:** The Phase 23.7 benchmark results proving
  the compounding thesis live entirely on the ephemeral Hetzner
  box. They need to be committed to `docs/product/BENCHMARKS.md`
  as static artifacts before the box is torn down.

## Action plan (next session)

Per the priority matrix, the first cleanup pass should land:

1. ✅ This round archived (this folder).
2. ⏳ Hygiene: add gitignore entries, remove `README.md.bak.830lines`,
   make `.claude-octopus/` untracked. (Doing now alongside the
   GitHub repo rename.)
3. ⏭ Archive sweep: move `.planning/phases/` and the three
   pre-pivot research docs into `archive/`. (Defer to follow-up
   session — bigger touch.)
4. ⏭ Rewrite MANIFESTO/VISION/ROADMAP. (Defer to follow-up —
   needs deliberate writing, not mechanical sweep.)
5. ⏭ Commit Hetzner bench results to BENCHMARKS.md. (Needs the
   Hetzner box probed first to extract the numbers from
   `/data/reports/`.)

## Files

- `synthesis.md` — fused Gemini synthesis with priority matrix
- `probes/codex-probe-{0,3}.md` — codex deep-dive into specific
  src/ paths and docs/ trees
- `probes/claude-sonnet-probe-{2,5}.md` — strategic positioning vs
  cleanup tradeoffs
- `probes/gemini-probe-{1,4}.md` — codebase-grounded audits

## Next round

Round 7 (when it happens) should be a *post-pilot* discover that
incorporates the live `web_fallback_rate(t)` trajectory and the
production pilot's real-world counter-arguments. Not before the
pilot.
