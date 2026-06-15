---
phase: 28-merch-and-meme-agent
plan: 02
subsystem: agents
tags: [meme-agent, twitter, x-api, svg, dry-run, neverthrow, esm]

# Dependency graph
requires:
  - phase: 27-site-build-out
    provides: "#memes grid + assets/gen/ folk art the agent composites + references"
  - phase: (prior) publish feature
    provides: "src/infrastructure/x-client.ts postTweet (OAuth 2.0 PKCE) — reused, not reimplemented"
provides:
  - "Standalone meme-agent under src/agents/meme-agent/ running generate -> (gated) post -> append, DRY-RUN by default"
  - "MemeEntry schema (the site/assets/memes.json record shape) — the data contract Plan 28-03 renders"
  - "Seeded site/assets/memes.json with 2 entries referencing existing folk art"
  - "No-credit templated SVG meme generator (default) + optional higgsfield path (flagged, off by default)"
  - "docs/agents/meme-agent.md — env vars, run command, dry-run guarantee, cron"
affects: [28-03 (site wires memes.json into #memes), AGENT-02]

# Tech tracking
tech-stack:
  added: []  # zero new deps — twitter-api-v2 + node:fs already present
  patterns:
    - "Dry-run-by-default agent: live side-effect gated behind explicit flag AND credential"
    - "Generation fallback chain (higgsfield -> SVG) via neverthrow orElse"

key-files:
  created:
    - src/agents/meme-agent/types.ts
    - src/agents/meme-agent/generate.ts
    - src/agents/meme-agent/pipeline.ts
    - src/agents/meme-agent/run.ts
    - tests/phase28.meme-agent.test.ts
    - site/assets/memes.json
    - docs/agents/meme-agent.md
  modified: []

key-decisions:
  - "Landing dir = src/agents/meme-agent/ (NOT a top-level tools/) so it compiles under tsconfig rootDir:./src + include:[src/**/*] and is linted by eslint src tests"
  - "Default generation is a no-credit composited SVG (zero deps, zero spend); higgsfield (~1 credit) is opt-in behind --higgsfield and falls back to SVG on any failure"
  - "Post step reuses x-client.postTweet — no second OAuth implementation; gated behind !dryRun AND X_CLIENT_ID"
  - "A failed live post never drops the locally-generated meme (orElse keeps the bare entry, memes.json still appended)"
  - "Committed memes.json is the clean 2-entry seed; the round-trip test append + its SVG were restored/removed after verification"

patterns-established:
  - "Agent invocation config (MemeAgentConfig) built from argv by run.ts, consumed by pure pipeline/generate"
  - "Sandboxed agent tests: all file I/O under os.tmpdir(), X_CLIENT_ID stripped, real site/assets untouched"

requirements-completed: [AGENT-01]

# Metrics
duration: ~20min
completed: 2026-06-15
---

# Phase 28 Plan 02: Twitter Meme-Agent Scaffold Summary

**A standalone, DRY-RUN-by-default meme-agent (`src/agents/meme-agent/`) that mints a no-credit folk-pop SVG meme from existing art, gates an X post behind the reused x-client + `--live` + `X_CLIENT_ID`, and appends a `MemeEntry` to `site/assets/memes.json` — the data contract Plan 28-03 will render.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-15T08:04:01Z
- **Completed:** 2026-06-15T08:09:00Z
- **Tasks:** 3 completed
- **Files created:** 7 (4 TS + 1 test + memes.json + docs)

## Accomplishments

- Defined `MemeEntry` / `MemeAgentConfig` (`types.ts`) as the single source of truth for the `site/assets/memes.json` record shape that Plan 28-03 reads.
- Seeded `site/assets/memes.json` with 2 valid entries (`source:"seed"`) referencing existing folk art via relative paths (`assets/gen/meme-amnesia.png`, `assets/gen/meme-coinrain.png`), no absolute/external URLs.
- Built `generateMeme` (`generate.ts`): default no-credit SVG composited from an existing `assets/gen/*.png` under a folk-pop caption band (palette-matched to the site), returning `Ok(MemeEntry source:'svg')`; optional higgsfield (`nano_banana_2`, ~1 credit) path gated behind `useHiggsfield`, wrapped so a missing CLI / exhausted credit returns Err and never throws.
- Built `runMemeAgent` (`pipeline.ts`): generate -> (gated) post -> append. The post step reuses `src/infrastructure/x-client.ts` `postTweet`; it is reached ONLY when `!dryRun && X_CLIENT_ID`, otherwise it logs `[dry-run] would post:` and makes zero network calls. Append is atomic-ish (tmp + rename); a missing memes.json starts a fresh array; a failed post keeps the meme.
- Built `run.ts` CLI (`--live` / `--higgsfield` / `--text`), defaulting to a full dry-run; prints the plan + resulting entry, exits non-zero on Err via `formatError`.
- Wrote `docs/agents/meme-agent.md` (env vars, run command, dry-run guarantee, cron lines, memes.json schema table).
- 5 sandboxed tests in `tests/phase28.meme-agent.test.ts` (svg-generate, text-override-truncate, higgsfield-off, dry-run-append-one, fresh-array).

## Verification

- `npx tsc --noEmit` exits 0 with all new files.
- `npm test` full suite: 947 pass / 0 fail / 9 skipped (was 942 pass; +5 new tests, zero regressions).
- `npm run lint` over the agent files + test: clean.
- End-to-end dry-run (no creds): `node --import tsx src/agents/meme-agent/run.ts --text "never research twice"` exited 0, printed `[dry-run] would post`, made zero network calls, and grew `memes.json` 2 -> 3 with a `source:'svg'` entry and no `postedUrl`. The appended entry + its generated SVG were then reverted so the committed `memes.json` is the clean 2-entry seed.
- Max 3 new deps honored: **zero** new deps (twitter-api-v2 + node:fs already present).

## Landing-directory rationale (for the record)

The agent lives under `src/agents/meme-agent/` rather than a top-level `tools/` directory because `tsconfig.json` has `rootDir:"./src"` + `include:["src/**/*"]` and `lint:"eslint src tests"`. Code outside `src/` would neither compile under `npm run build` nor be linted, breaking the "tsc stays 0" + "compiles" constraints. This is the only landing spot that honors them.

## memes.json schema (for Plan 28-03)

`MemeEntry[]` where each entry is: `id` (slug), `caption` (<=280), `image` (relative-to-site path, e.g. `assets/gen/...`), `alt`, `createdAt` (ISO), `source` (`'svg' | 'higgsfield' | 'seed'`), and optional `postedUrl` (x.com status URL, present only when live-posted). 28-03 should render `image` + `alt` into the existing `#memes` grid and may surface `caption` / `postedUrl`.

## Deviations from Plan

None — plan executed as written. (memes.json did not pre-exist, so Task 1 created it fresh rather than editing; this is within the plan's "create/seed" instruction.)

## Commits

- 4b00ed1 — feat(28-02): define MemeEntry schema + seed memes.json
- 94ceb74 — feat(28-02): no-credit SVG meme generator + tests
- 30978ab — feat(28-02): meme-agent pipeline + CLI + docs

## Self-Check: PASSED

All 8 created files present on disk; all 3 task commits (4b00ed1, 94ceb74, 30978ab) present in git history.
