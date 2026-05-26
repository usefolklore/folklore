# Agent: claude-sonnet
# Task ID: probe-1779816691-5
# Role: researcher
# Phase: probe
# Prompt: Analyze the LOCAL CODEBASE in the current directory for: -P CLEANUP AUDIT — what's no longer relevant in the Akashik project given the full arc:

CONTEXT:
The project has gone through:
1. Multiple ML retrieval optimization attempts (E1' rerank, E11 enrichment, listwise rerank, NDCG/MRR augmentation)
2. Three octopus-discover synthesis rounds with empirical pushback
3. A fundamental pivot from 'wellinformed: agent memory product' to 'Akashik: federated knowledge commons for the OSS community'
4. The articulation of the compounding mechanism (peer-local + federation-on-query + web-on-miss + save-locally + transfer-on-next-ask)
5. The scaffolding of AkashikBench-F which validated the compounding thesis (slope -4.74e-5 on LoCoMo)
6. Now: rebrand sweep in progress (Akashik), and need to clean up the codebase + docs of stale artifacts.

WORKING DIR: /Users/saharbarak/personal/wellinformed

QUESTIONS:

Q1. Looking at the project layout (src/, tests/, docs/, .planning/, scripts/, examples/), what's likely NO-LONGER-RELEVANT given the OSS-community-commons positioning?

Q2. Specific things to investigate:
   - .planning/ directory — there are phase-21, phase-23 dirs, HANDOFF.md, long-term-memory-integration.md. The phase-based GSD planning workflow may be useful or may be cruft.
   - docs/research/ — multiple research docs (energy-based-contradiction-detection, beat-the-competitors-retrieval-plan, performance-prediction-matrix). Some of these may have been superseded by the pivot.
   - src/ — there's wellinformed-rs/ (Rust sidecar), .claude-octopus/ (octopus state), .agents/ (skills/hooks). Anything obviously dead code?
   - tests/ — many tests reflect the old framing. Tests for bench-real.test.ts (30-doc proxy), bench-standard.test.ts (synth HotpotQA). Are these still useful or superseded?
   - Markdown clutter — README.md.bak.830lines is in the working tree (a backup of an old README). docs has potential duplication.
   - Codebase identifiers (wellinformed* prefixes everywhere) — should we plan a coordinated rename, or stay two-name?

Q3. What docs/research artifacts should be ARCHIVED (moved to a docs/archive/ subfolder with a note) vs DELETED outright? Archive = useful historical record; delete = noise.

Q4. Specific to the Akashik pivot:
   - storybrand-messaging-draft.md went through THREE major revisions (personal → team → OSS community). Is preserving the evolution table useful, or should we collapse to just the final version?
   - The competitor-positioning research (beat-the-competitors-retrieval-plan.md) was written when we thought we were competing with mem0/agentmemory on R@5. That positioning is now superseded — but the research is still useful. Archive? Annotate?

Q5. Code-quality cleanup candidates:
   - Unused exports in src/domain/* — anything left over from abandoned phases?
   - Tests gated by env vars that are never going to be set again — e.g., synthetic-fixture tests for retrieval that the real-corpus benches have replaced.
   - .claude-octopus/ state directory — is this checked in by mistake? Should it be gitignored?

OUTPUT EXPECTED:
- Direct table: file path | action (KEEP / ARCHIVE / DELETE / NEEDS-REWRITE) | one-line reason
- Cover at least: top 20 files in docs/, top 10 files in tests/, top 10 files in src/, the .planning/ tree, the contents of repo root.
- One paragraph at the end: 'If I were Sahar cleaning up right now, the 3 changes I'd make first are X, Y, Z because [why these].'
- Be opinionated. Don't return 'maybe keep, maybe delete' for everything. Make a call.. Run: find . -type f -name '*.ts' -o -name '*.py' -o -name '*.js' | head -30, then read key files. Report: tech stack, architecture patterns, file structure, coding conventions, and how they relate to the prompt. Focus on ACTUAL code, not hypotheticals.
# Started: יום ג׳ מאי 26 2026 20:31:44 IDT

## Output
```
I now have enough signal. Let me write the full audit.

---

# Akashik Cleanup Audit — 2026-05-26

## Context Synopsis (what I verified from the code)

- **Active product:** Akashik (OSS federated knowledge commons). Codebase still named `wellinformed` — intentional two-name period per `docs/PROJECT-PLAN-AKASHIK.md`.
- **Current state:** Phase 23.7 (Hetzner real-corpus benches + AkashikBench-F validated). Phase 24 is next (federation sweep, niche-evaporation mitigation, IPC auth hardening).
- **Explicitly de-prioritized:** All further R@5 / LongMemEval / bge-reranker tuning (PROJECT-PLAN-AKASHIK.md §"What we're explicitly NOT doing").
- **Architecture:** DDD, functional TypeScript, neverthrow Results, libp2p P2P, SQLite + ONNX vectors, wellinformed-rs Rust sidecar (BM25 + dense fusion).
- **Critical finding:** `.claude-octopus/` is tracked by git but NOT in `.gitignore`.

---

## Table 1 — Repo Root

| File | Action | Reason |
|---|---|---|
| `README.md` | NEEDS-REWRITE | Still says "wellinformed" product framing. Must be updated to Akashik identity before Phase 25 pilot launch. |
| `README.md.bak.830lines` | DELETE | Committed backup file. Violates root-folder rule. Git history has it. |
| `findings.md` | DELETE | Root-level working note (violates CLAUDE.md "never save to root"). Stale planning artifact. |
| `NEXT_STEPS.md` | DELETE | Same — root-level planning scratchpad. Project plan is `docs/PROJECT-PLAN-AKASHIK.md` now. |
| `CLAUDE.md` | KEEP | Active project config. |
| `Dockerfile` | KEEP | Needed for distribution. |
| `package.json`, `tsconfig.json`, `package-lock.json` | KEEP | Build config. |
| `skills-lock.json` | KEEP | Agent harness config. |
| `.mcp.json`, `.gitignore`, `.gitmodules` | KEEP | Config. Note: `.gitignore` needs two additions (see below). |

---

## Table 2 — `.planning/` Tree

| Path | Action | Reason |
|---|---|---|
| `.planning/STATE.md` | NEEDS-REWRITE | Says "Phase 20 EXECUTING" (April 2026). We're at Phase 23.7. Completely stale; a new contributor reading this gets the wrong current position. |
| `.planning/HANDOFF.md` | KEEP | Active handoff for Phase 23.7 Hetzner + resume instructions. Most recent (2026-05-20). |
| `.planning/MILESTONES.md` | KEEP | Good historical progress record. Has the retroactive retirement note on the v1.1 96.8% NDCG claim. |
| `.planning/PROJECT.md` | NEEDS-REWRITE | Superseded by `docs/PROJECT-PLAN-AKASHIK.md`. Keep the file but redirect or update to current Akashik framing. |
| `.planning/REQUIREMENTS.md` | ARCHIVE | Pre-pivot requirements. No longer authoritative; product positioning has shifted fundamentally. |
| `.planning/ROADMAP.md` | ARCHIVE | Pre-pivot roadmap. `docs/product/ROADMAP.md` + `docs/PROJECT-PLAN-AKASHIK.md` are the live artifacts. |
| `.planning/long-term-memory-integration.md` | ARCHIVE | Research sketch that led to Phase 21. Now superseded by `21-CONTEXT.md` which has the actual implementation decisions. Useful provenance, not actionable. |
| `.planning/BENCH-v2.md` | KEEP | Benchmarking methodology doc; still referenced. |
| `.planning/BENCH-COMPETITORS.md` | ARCHIVE | Pre-pivot competitor benchmarking. The explicit "not competing with agentmemory" decision in PROJECT-PLAN-AKASHIK.md makes this moot. |
| `.planning/SOTA-UPGRADE-PLAN.md` | ARCHIVE | Retrieval SOTA upgrade planning, all of which is explicitly parked. |
| `.planning/V2.1-SYNTHESIS.md` | ARCHIVE | Pre-pivot v2.1 candidate synthesis. Superseded by octopus-discover rounds 4 and 5. |
| `.planning/v2.1-CANDIDATES.md` | ARCHIVE | Same — pre-pivot feature candidates list. |
| `.planning/harness-integration-roadmap.md` | ARCHIVE | Integration harness plan from before Phase 20. |
| `.planning/multi-provider-epic.md` | ARCHIVE | Multi-provider epic planning; not mentioned in any current phase plan. |
| `.planning/p2p-scale-plan.md` | KEEP | P2P scaling design doc. Still relevant to Phase 24 federation routing. |
| `.planning/audits/ai-solution-architect.md` | ARCHIVE | Point-in-time code audit, ~April 2026. Historical. |
| `.planning/audits/data-researcher.md` | ARCHIVE | Same. |
| `.planning/audits/enterprise-architect.md` | ARCHIVE | Same. |
| `.planning/audits/s2-geometry.md` | ARCHIVE | Same. S2 geometry was evaluated and not adopted. |
| `.planning/audits/senior-data-engineer.md` | ARCHIVE | Same. |
| `.planning/audits/senior-data-scientist.md` | ARCHIVE | Same. |
| `.planning/CFD-SOTA-ATTACKS.md` | DELETE | CFD (computational fluid dynamics) SOTA attacks have zero relevance to a P2P knowledge graph. Was likely generated by an LLM brainstorm sweep. |
| `.planning/PHYSICS-SOTA-ATTACKS.md` | DELETE | Same — particle physics and general physics SOTA attacks on a knowledge graph product is noise. |
| `.planning/PARTICLE-PHYSICS-SOTA-ATTACKS.md` | DELETE | Same. |
| `.planning/MATH-SOTA-ATTACKS.md` | DELETE | Borderline — mathematical reasoning benchmarks are partially relevant (HotpotQA multi-hop). But the document is about attacking retrieval with math SOTA, not about our product doing math. Delete. |
| `.planning/DATA-SCIENCE-SOTA-ATTACKS.md` | ARCHIVE | More relevant than physics — covers retrieval NDCG methodology. Archive rather than delete. |
| `.planning/DATA-ENGINEER-SOTA-ATTACKS.md` | ARCHIVE | Some pipeline design content, archive. |
| `.planning/test-runs/p2p-phases-2026-05-11T160726Z.md` | ARCHIVE | Historical test run snapshot. Not actionable, but valuable as a baseline reference. |
| `.planning/phases/phase-07/` through `.planning/phases/phase-20/` | ARCHIVE (bulk) | All 14 phase directories are complete. PLAN, SUMMARY, CONTEXT, RESEARCH, VERIFICATION files for phases 07–20 are done work. Move to `.planning/archive/phases/`. The CONTEXT.md files have implementation decisions that are load-bearing (they document "why this API choice, not that one"); the PLAN and SUMMARY files are execution records. |
| `.planning/phases/phase-21/21-CONTEXT.md` | KEEP | Phase 21 (cross-encoder + long-term memory) is recently shipped and partially deferred. CONTEXT.md is still the reference for the Beta(α,β) math and tier schema. |
| `.planning/phases/phase-23/23-CONTEXT.md` | KEEP | Active — Phase 23 is the benchmark acceptance contract. AkashikBench-F lives here. |

---

## Table 3 — `docs/` (Top 20 Files)

| File | Action | Reason |
|---|---|---|
| `docs/PROJECT-PLAN-AKASHIK.md` | KEEP | Canonical 30-60 day engineering + launch plan. The authoritative "what's next." |
| `docs/marketing/storybrand-messaging-draft.md` | KEEP | Final Akashik brand positioning (2026-05-26). This is the live marketing artifact. See Q4 analysis below. |
| `docs/marketing/how-akashik-works.md` | KEEP | Architectural credibility anchor. Referenced by PROJECT-PLAN-AKASHIK.md as load-bearing for pilot. |
| `docs/research/octopus-discover/round-5-2026-05-26/` | KEEP | The canonical recommendation that drives Phase 24 and Phase 25. |
| `docs/research/octopus-discover/round-4-2026-05-26/` | KEEP | Referenced directly in PROJECT-PLAN-AKASHIK.md §Phase 24.5 (8 launch blockers). |
| `docs/product/BENCHMARKS.md` | KEEP | Active acceptance contract. Updated in Phase 23. |
| `docs/p2p/p2p-threat-model.md` | KEEP | Security threat model. Referenced by Phase 26 SOC2 work. |
| `docs/p2p/P2P-VISION.md` | KEEP | Still aligns with federated commons mission. |
| `docs/p2p/peer-reputation-design.md` | KEEP | Active feature (peer reputation scores are in production). |
| `docs/p2p/peer-reputation-load-spreading.md` | KEEP | Same. |
| `docs/p2p/satisfaction-scoring.md` | KEEP | Active — satisfaction scoring drives the PreToolUse deny-on-confidence hook. |
| `docs/architecture/ADR-001-v3-memory-protocol.md` | KEEP | Active protocol spec. |
| `docs/architecture/ADR-002-v4-agent-brain.md` | KEEP | Active protocol spec. |
| `docs/architecture/V3-PROTOCOL.md` | KEEP | Active. |
| `docs/architecture/V4-PROTOCOL.md` | KEEP | Active. |
| `docs/architecture/claude-obsidian-parity.md` | ARCHIVE | Pre-pivot feature parity doc ("be like Obsidian + Claude"). The OSS-commons framing has moved well past this. Useful history, not actionable. |
| `docs/research/beat-the-competitors-retrieval-plan.md` | ARCHIVE | Strong empirical content (loss analysis by question type, E1–E9 experiment matrix) but the mission is explicitly superseded. PROJECT-PLAN-AKASHIK.md says "not in this 60-day window." Archive with an annotation, don't delete — the headroom analysis will be needed if retrieval work ever resumes. |
| `docs/research/performance-prediction-matrix.md` | ARCHIVE | Hardware × rerank tier matrix. Well-researched, but the retrieval-tuning sprint it supported is parked. Archive with note: "superseded by PROJECT-PLAN-AKASHIK.md §Not doing." |
| `docs/research/energy-based-contradiction-detection.md` | KEEP | Forward sketch for Phase 22 (cross-peer contradiction surface). Still in scope. |
| `docs/research/github-star-growth.md` | ARCHIVE | Pre-pivot marketing research on GitHub growth tactics. Not wrong, just no longer the primary concern; compounding telemetry is now the metric. |
| `docs/marketing/positioning-draft.md` | ARCHIVE | First-draft positioning (personal-productivity framing). Three generations behind. |
| `docs/marketing/positioning-v2.1.md` | ARCHIVE | Second-draft positioning (team collaboration framing). Superseded by storybrand OSS-community final. |
| `docs/product/MANIFESTO.md` | NEEDS-REWRITE | Content exists but was written for the agent-memory framing. Must be updated for OSS-commons mission before Phase 25. |
| `docs/product/VISION.md` | NEEDS-REWRITE | Same — pre-pivot product vision. |
| `docs/product/ROADMAP.md` | NEEDS-REWRITE | Pre-pivot roadmap. Superseded by PROJECT-PLAN-AKASHIK.md but the file still exists in docs/product/ and will confuse newcomers. |
| `docs/product/RELEASE-v4.md` | ARCHIVE | Historical release note. |
| `docs/product/GRAPHRAG-AUDIT.md` | ARCHIVE | GraphRAG evaluation done during v1.1. Interesting history; not actionable. |
| `docs/protocol/PROTOCOL-QUALITY-QUESTIONS.md` | KEEP | Live protocol design questions. |
| `docs/marketing/growth-sources-plan.md` | KEEP | Phase 25 pilot growth tactics. |
| `docs/marketing/influencer-outreach.md` | KEEP | Phase 25 maintainer outreach list. |
| `docs/marketing/SOCIAL-LAUNCH.md` | KEEP | Phase 25 launch content. |
| `docs/marketing/x-launch-posts.md` | KEEP | Phase 25 launch content. |
| `docs/marketing/SITE-REDESIGN-SPEC.md` | NEEDS-REWRITE | Site redesign spec for Akashik. The spec may still be valid structurally but the brand is Akashik now. |
| `docs/marketing/IMAGEGEN-FRONTEND-WEB.md` | DELETE | Looks like a stale imagegen task log dropped into docs/marketing/. Not a marketing document. |
| `docs/marketing/BRAND-KIT.md` | NEEDS-REWRITE | Brand kit exists but assets (logos, wordmarks) all say `wellinformed`. Must be updated for Akashik before launch. |
| `docs/assets/logo-*.svg`, `og-card.*`, `og-portrait.*` | NEEDS-REWRITE | All existing brand assets are `wellinformed` identity. Akashik rebrand requires new assets. These are stale until the rebrand PR. |
| `docs/index.html` | NEEDS-REWRITE | Landing page. Rebrand target. |
| `docs/probe.html` | DELETE | HTML probe file in docs/ root — diagnostic artifact, not a product doc. |
| `docs/demo.tape` | KEEP | VHS tape script for demo recording. |
| `docs/memory-stack.png/svg` | KEEP | Technical diagram. Architecture is still valid. |

---

## Table 4 — `tests/` (Top 20 Files)

| File | Action | Reason |
|---|---|---|
| `tests/bench-akashik-federation.test.ts` | KEEP | AkashikBench-F — the core validation instrument for the compounding thesis. |
| `tests/bench-locomo-real.test.ts` | KEEP | Phase 23.7 real-corpus adapter (env-gated). |
| `tests/bench-longmemeval-real.test.ts` | KEEP | Phase 23.7 real-corpus adapter (env-gated). |
| `tests/bench-scifact-real.test.ts` | KEEP | Phase 23.7 real-corpus adapter (env-gated). |
| `tests/bench-real.test.ts` | KEEP | 30-doc BEIR SciFact proxy. Still valid as local CI proxy; eventually replaced by `bench-scifact-real` on real data. |
| `tests/bench-standard.test.ts` | KEEP | HotpotQA synthetic multi-hop bench. Valid. |
| `tests/bench-locomo-synth.test.ts` | KEEP | Synthetic LoCoMo bench. Valid. |
| `tests/bench-longmemeval-synth.test.ts` | KEEP | Synthetic LongMemEval bench. Valid. |
| `tests/bench-onnx.test.ts` | KEEP | ONNX embedder bench. Valid infrastructure test. |
| `tests/bench-auto-forget.test.ts`, `bench-beta-calibration.test.ts`, `bench-retention-band.test.ts`, `bench-tier-promotion.test.ts`, `bench-write-gate.test.ts` | KEEP | Phase 21/23 wellinformed-specific synthetic benches. All are part of the composite score formula. |
| `tests/llm-listwise-rerank.test.ts` | ARCHIVE/DISABLE | LLM listwise rerank is explicitly de-prioritized (PROJECT-PLAN-AKASHIK.md §"Not doing"). The code still exists in `src/domain/llm-listwise-rerank.ts` but this test is now "aspirational not tested." Either add a `.skip` with a note, or archive. Don't delete — the code may be revived post-pilot. |
| `tests/contextual-enrich.test.ts` | KEEP | E11 contextual enrichment is in the production R@5=0.9268 path. |
| `tests/cross-rerank.test.ts` | KEEP | Phase 21 cross-encoder rerank. Active. |
| `tests/phase1.graph-rooms.test.ts` through `tests/phase6.daemon.test.ts` | KEEP | Core functionality. |
| `tests/phase15.peer-security.test.ts` through `tests/phase20.sessions.test.ts` | KEEP | P2P and sessions layer. All shipped phases. |
| `tests/phase29.rust-retrieval-regression.test.ts` through `tests/phase39.oracle-gossip-e2e.test.ts` | KEEP, FLAG | Tests for phases 29–39 that have no corresponding `.planning/phases/phase-XX/` directory. They were written ahead of the formal planning cycle. They should KEEP running, but add a comment or README note that their planning artifacts are in the forthcoming phases list. Phase 35 P2P E2E is already documented as a known flake in HANDOFF.md. |
| `tests/fixtures/phase19/` | KEEP | Tree-sitter fixtures for codebase indexing tests. |
| `tests/fixtures/phase20/` | KEEP | Session fixtures including secret-gate fixture. |

---

## Table 5 — `src/` (Top 10 Files / Areas)

| Path | Action | Reason |
|---|---|---|
| `src/domain/llm-listwise-rerank.ts` | KEEP (annotate) | Code is correct and well-tested. But the retrieval sprint that would activate it is explicitly parked. Add a `// Phase 24+ — not wired into the bench or ask path; activation deferred per PROJECT-PLAN-AKASHIK.md` comment at the top. |
| `src/infrastructure/llm-listwise-rerank.ts` | KEEP (annotate) | Same rationale. Infrastructure adapter for the parked feature. |
| `src/domain/federation-sim.ts` | KEEP | AkashikBench-F core. The `compoundingSlope`, `webFallbackRateOverTime`, `propagationHalfLife` functions are the primary validation instruments for Phase 24. |
| `src/infrastructure/rust-retrieval.ts` | KEEP | Rust sidecar bridge. The sidecar is still active (BM25 lane). Phase 29 regression test exists. |
| `src/application/federated-search.ts` | KEEP | Phase 17 federation fan-out. Phase 24.3 hardening target. |
| `src/domain/long-term-memory.ts` | KEEP | Phase 21, active. |
| `src/domain/cross-rerank.ts` | KEEP | Phase 21, active. |
| `src/application/auto-forget-tick.ts` | KEEP | Phase 21, active. |
| `src/cli/commands/bench.ts` | KEEP | `wellinformed bench memory` driver. Phase 23. |
| `src/telegram/` (bot.ts, capture.ts, commands.ts, digest.ts) | KEEP | Telegram bridge shipped in Phase 7. Still a valid ingest path. No evidence it's been abandoned. |
| `src/cli/commands/swarm.ts` | INVESTIGATE | `swarm` CLI command — is this the claude-flow swarm integration or a wellinformed-native feature? If it's unused glue from the octopus harness, it could be a delete candidate. |

---

## Table 6 — Dotfiles / Scaffolding

| Path | Action | Reason |
|---|---|---|
| `.claude-octopus/state.json` | GITIGNORE IMMEDIATELY | This file is tracked by git but contains agent session state (provider usage counters, session start timestamps, project_id). It's not `.gitignore`d. This is the most urgent find: it's agent runtime state, not source code. Add `.claude-octopus/` to `.gitignore`. |
| `.claude-octopus/context/`, `.claude-octopus/quick/`, `.claude-octopus/summaries/` | GITIGNORE | Same — all subdirectories of `.claude-octopus/` are runtime state. |
| `.claude-plugin/plugin.json` | KEEP (possibly gitignore) | Plugin manifest for Claude Code. If this is user-local config (like `.claude/settings.local.json`), gitignore it. If it's project-level config that all contributors need, keep it tracked. |
| `.agents/skills/` (copywriting, design-taste-frontend, etc.) | KEEP (but reassess) | These are UI/design agent skills. They're tangential to the OSS-commons product but serve the marketing workstream. Low noise, low cost to keep. |
| `.claude/skills/wellinformed/SKILL.md` | NEEDS-REWRITE | The wellinformed skill needs updating to Akashik brand. |
| `wellinformed-rs/` | KEEP | Rust sidecar (BM25 + HNSW). Active — referenced by `rust-retrieval.ts` and has a regression test (`phase29`). |
| `vendor/graphify/` | INVESTIGATE | Python graphify sidecar from Phase 1. `.gitignore` says "Phase 1" — is the sidecar still used, or was it replaced by the TypeScript graph layer? If unused, delete. |
| `demo/` | KEEP | Demo research corpus and screenshots. Used for the demo tape. |

---

## Q4 Analysis — `storybrand-messaging-draft.md` (Three-Draft History)

**Verdict: collapse to the final version only, delete the evolution table.**

The current `storybrand-messaging-draft.md` (2026-05-26) already represents the final OSS-community positioning. The context says there were three revisions (personal → team → OSS community) but the file itself contains only the final Akashik OSS-commons framing — the earlier drafts were in the now-archived `positioning-draft.md` and `positioning-v2.1.md`. The "evolution table" would be in those archived files, not in the current one.

The advantage of preserving the evolution: it documents that personal and team framings were evaluated and rejected, which is useful context for anyone who questions the OSS-commons positioning later. The disadvantage: it adds cognitive overhead to the canonical messaging document and risks confusing copywriters or contributors who read only the live file. **Recommendation: archive `positioning-draft.md` and `positioning-v2.1.md` with a single-line header "Superseded by storybrand-messaging-draft.md 2026-05-26. Archived for provenance." Keep the storybrand file as-is — no evolution table needed in the live doc.** The git history already captures the full evolution.

---

## Q5 Analysis — `.claude-octopus/` and the Two `.gitignore` Gaps

The `.gitignore` has no entry for:
1. `.claude-octopus/` — runtime agent state (found state.json with session timestamps and provider usage counters). **This is the most urgent fix** — it's committing ephemeral machine-local state.
2. `findings.md` / `NEXT_STEPS.md` — there's no pattern to catch root-level working notes (these aren't committed by a rule, just discipline). No `.gitignore` fix needed, just delete them.

The `.claude-plugin/plugin.json` question is secondary — check if it contains anything machine-local before deciding.

---

## Priority Recommendation

**If I were Sahar cleaning up right now, the 3 changes I'd make first are:**

**1. Gitignore `.claude-octopus/` and delete `README.md.bak.830lines` in one commit.**
These are the two most embarrassing things in the tracked tree. `.claude-octopus/state.json` contains session metadata (provider usage counts, project_id, session_start timestamps) — it's agent runtime state that has no business being in git history, and it will accumulate noise on every session. `README.md.bak.830lines` is literally a backup file in the root that will confuse every contributor who clones this repo. One commit: `echo ".claude-octopus/" >> .gitignore && git rm -r --cached .claude-octopus/`. These changes are zero-risk and immediate.

**2. Archive the `.planning/phases/phase-07` through `phase-20` directories and the dead retrieval research docs in one PR.**
Fourteen completed phase directories plus `SOTA-UPGRADE-PLAN.md`, `BENCH-COMPETITORS.md`, `performance-prediction-matrix.md`, `beat-the-competitors-retrieval-plan.md`, and the domain-irrelevant SOTA attack files (CFD, physics, particle physics, math) are all historical artifacts that are cluttering the active planning context. Moving them to `.planning/archive/` costs nothing (git history preserves them), and the search-and-read cognitive load goes down immediately. The "explicitly not doing retrieval tuning" decision in PROJECT-PLAN-AKASHIK.md means these files currently *actively mislead* anyone who reads them — a new contributor seeing `beat-the-competitors-retrieval-plan.md` would reasonably assume that's the current mission. Archiving corrects that signal.

**3. Rewrite `docs/product/MANIFESTO.md`, `docs/product/VISION.md`, and `docs/product/ROADMAP.md` to Akashik OSS-commons framing.**
These three files are the first things a potential pilot contributor will read to understand what the project *is*. They currently describe an agent-memory product. The `storybrand-messaging-draft.md` + `how-akashik-works.md` + `PROJECT-PLAN-AKASHIK.md` together contain everything needed to rewrite all three in under an hour. Until this is done, the project's own docs will undermine the Phase 25 pilot recruitment. The `README.md` is in the same bucket, but it's also gated by the domain-rename question — rewriting MANIFESTO/VISION/ROADMAP can happen now without touching the binary package name.
```

## Status: SUCCESS
# Completed: יום ג׳ מאי 26 2026 20:41:45 IDT
