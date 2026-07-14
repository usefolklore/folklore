# Session handoff — 2026-07-14 (part 2)

## Branch state
- On `experiment/peer-inference-streaming` (branched off `feat/contribution-reputation`).
- **PR #17** (`feat/contribution-reputation`) is **GREEN and mergeable** — both `test (22)` + `test (24)` pass, Cloudflare Pages preview built. Fully pushed. Merging = production deploy (site prod is on `main`). Owner's call — was requested earlier but not executed; do it when ready.
- `experiment/peer-inference-streaming` is **NOT pushed** — carries all feat/* commits plus the research doc (`4e0d9b3`). Push + open its own PR, or cherry-pick the doc, when the inference work starts.
- Uncommitted: `README.md` (one edit not made by this session — reworded hero to "A torrent swarm for reasoning" / "so you start…". Left as-is; confirm with owner whether it stays, given we dropped torrent/swarm framing on the site).
- Untracked, ignore: `.bench-data/`, `.envrc.local`, `.fastembed_cache/`, `folklore-rs/`.

## Shipped since part-1 handoff (all on PR #17)
Site went through a full redesign arc — the homepage is now a **full-bleed terminal session** ("THE TERMINAL IS THE SITE"): fixed titlebar as chrome, fixed statusline with live tracker peer count + scroll line-counter, scenes as staged `folklore <cmd>` moments that type themselves on scroll.

Key commits (newest first): mobile github-tab stars + pocket demo · reckoning=yellow broadsheet · island slim (380×84) · dominant demo + chapter contrast bands · **the boredom directive** (two designer agents → set-pieces: THE EXCHANGE / THE INHERITANCE / THE RECKONING / LIGHT YOUR FIRE, folk watermarks in the glass, intent-tinted scenes) · **hearth mark v3** (two rounds of designer critique — 3-layer flame seated on dark logs, tellers behind logs, glow pools light; propagated to master `folklore-logo.svg` + all surfaces) · live-coded mini-demo replacing the mp4 (mp4 GitHub-only) · manifesto + creed/how-it-works/statistics subpages · menubar client (`client/menubar-macos/`) · two-way P2P notifications.

Demo pipeline still at `examples/desktop-demo/` (scene.html + record.mjs + cuts.sh); v1/v2 recoverable at tags in git log.

## The research (this session's real ask)
`docs/research/PEER-INFERENCE-STREAMING.md` — 4 parallel research agents synthesized. Bottom line:
- Claude Code streams via `POST /v1/messages` (SSE); `ANTHROPIC_BASE_URL` is the only transport hook where the real stream lives. Prompt caching caches input only, never output.
- You can't stream *the model's tokens* across peers on different models (KV/layer-split are model-locked). Only **derived artifacts** cross a heterogeneous network — and reuse needs no inference at hit time.
- Legal: you own your outputs (self-replay in-spec); peer redistribution of raw provider completions is **unresolved** → share **distilled traces**, not verbatim.
- Folklore is ~70% there but intercepts at the **tool layer**; target is a **model-layer `/v1/messages` proxy**. resolved_query nodes, federation transports, signed provenance, deny-gate, L1/L2 caches all transplant. 5 net-new pieces (proxy, message-array cache, SSE replay+capture, completion-calibrated gate, replayability classifier).
- **Proposal — 3 lanes:** A) federate distilled reasoning traces now (extends shipped code) → B) self-cache proxy (in-spec, proves plumbing) → C) peer-completion streaming (deferred, legal-gated).

## Next steps (in order)
1. **Merge PR #17** (green) → production deploy.
2. Confirm the README hero wording with owner (torrent/swarm vs network — site already dropped it).
3. Push `experiment/peer-inference-streaming`; decide RFC vs prototype.
4. Inference work: write Lane A as an RFC/phase, or prototype the Lane B `/v1/messages` self-cache proxy (start: `folklore claude install` sets `ANTHROPIC_BASE_URL`; reuse `query-reuse.ts` + `semantic-cache.ts`).

## Standing context (also in auto-memory `demo-craft-preferences`)
No mocks passed as real · peers are PEOPLE (@handles), not swarm/developers — site dropped the torrent framing per owner · brand = hearth logo + paper/ink/pink/yellow/teal + Fraunces + Geist Mono · pacing errs slow · repo is usefolklore/folklore · never git-commit with claude/anthropic co-authors.
