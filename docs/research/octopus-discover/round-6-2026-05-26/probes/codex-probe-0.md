<!-- trust=untrusted provider=codex -->
# Agent: codex
# Task ID: probe-1779816691-0
# Role: researcher
# Phase: probe
# Prompt: Analyze the problem space: -P CLEANUP AUDIT — what's no longer relevant in the Akashik project given the full arc:

CONTEXT:
The project has gone through:
1. Multiple ML retrieval optimization attempts (E1' rerank, E11 enrichment, listwise rerank, NDCG/MRR augmentation)
2. Three octopus-discover synthesis rounds with empirical pushback
3. A fundamental pivot from 'akashik: agent memory product' to 'Akashik: federated knowledge commons for the OSS community'
4. The articulation of the compounding mechanism (peer-local + federation-on-query + web-on-miss + save-locally + transfer-on-next-ask)
5. The scaffolding of AkashikBench-F which validated the compounding thesis (slope -4.74e-5 on LoCoMo)
6. Now: rebrand sweep in progress (Akashik), and need to clean up the codebase + docs of stale artifacts.

WORKING DIR: /Users/saharbarak/personal/akashik

QUESTIONS:

Q1. Looking at the project layout (src/, tests/, docs/, .planning/, scripts/, examples/), what's likely NO-LONGER-RELEVANT given the OSS-community-commons positioning?

Q2. Specific things to investigate:
   - .planning/ directory — there are phase-21, phase-23 dirs, HANDOFF.md, long-term-memory-integration.md. The phase-based GSD planning workflow may be useful or may be cruft.
   - docs/research/ — multiple research docs (energy-based-contradiction-detection, beat-the-competitors-retrieval-plan, performance-prediction-matrix). Some of these may have been superseded by the pivot.
   - src/ — there's akashik-rs/ (Rust sidecar), .claude-octopus/ (octopus state), .agents/ (skills/hooks). Anything obviously dead code?
   - tests/ — many tests reflect the old framing. Tests for bench-real.test.ts (30-doc proxy), bench-standard.test.ts (synth HotpotQA). Are these still useful or superseded?
   - Markdown clutter — README.md.bak.830lines is in the working tree (a backup of an old README). docs has potential duplication.
   - Codebase identifiers (akashik* prefixes everywhere) — should we plan a coordinated rename, or stay two-name?

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
- Be opinionated. Don't return 'maybe keep, maybe delete' for everything. Make a call.. Focus on understanding constraints, requirements, and user needs.
# Started: יום ג׳ מאי 26 2026 20:31:42 IDT

<!-- BEGIN-UNTRUSTED:provider=codex:nonce=7d7a6ded977fcc5f -->
## Output
```
The stale surface is mostly “leaderboard-era retrieval product” material, plus process debris from the phase-based buildout. The live core now is: federation, provenance, community compounding, AkashikBench-F, and the Akashik story.

**Repo Root**

| file path | action | one-line reason |
|---|---|---|
| `README.md` | `KEEP` | This is already the clearest statement of the Akashik pivot and should be the canonical repo entrypoint. |
| `README.md.bak.830lines` | `DELETE` | Pure clutter; backup files do not belong in the working tree. |
| `.claude-octopus/state.json` | `DELETE` | Runtime state, not product source; this looks accidentally committed. |
| `.claude-octopus/state.json.backup` | `DELETE` | Same as above, plus even less defensible. |
| `.gitignore` | `NEEDS-REWRITE` | Add `.claude-octopus/`, likely `demo.tape`, and any other local state/output paths. |
| `.agents/skills/**` | `DELETE` | These are maintainer workflow assets, not Akashik product code or docs. |
| `CLAUDE.md` | `KEEP` | Dev instructions are useful internally, but it should stay clearly non-product-facing. |
| `NEXT_STEPS.md` | `ARCHIVE` | Duplicates planning intent now better expressed in `docs/PROJECT-PLAN-AKASHIK.md`. |
| `findings.md` | `ARCHIVE` | Likely useful as a historical scratchpad, not as a live source of truth. |
| `dist/` | `DELETE` | Generated output; if tracked, remove from git and regenerate in CI/builds only. |
| `akashik-rs/` | `KEEP` | Still valid infrastructure for local retrieval speed, even though it no longer carries the product narrative. |
| `demo/README.md` | `NEEDS-REWRITE` | Demos should sell federation/community compounding, not old single-user memory behavior. |

**.planning**

| file path | action | one-line reason |
|---|---|---|
| `.planning/HANDOFF.md` | `DELETE` | Session-specific Hetzner/OpenClaw handoff is operational residue, not reusable project knowledge. |
| `.planning/long-term-memory-integration.md` | `ARCHIVE` | Good historical rationale for the old memory stack, but not the current Akashik thesis. |
| `.planning/phases/phase-15/**` | `ARCHIVE` | Historically useful for P2P/security lineage, but phase-by-phase GSD files are not a good live operating surface now. |
| `.planning/phases/phase-16/**` | `ARCHIVE` | Same: room-sharing history matters, but not as active planning docs. |
| `.planning/phases/phase-17/**` | `ARCHIVE` | Federation history is valuable, but the phase files are build logs now. |
| `.planning/phases/phase-18/**` | `ARCHIVE` | Useful provenance, not live strategy. |
| `.planning/phases/phase-19/**` | `ARCHIVE` | Same. |
| `.planning/phases/phase-20/**` | `ARCHIVE` | Same. |
| `.planning/phases/phase-21/21-CONTEXT.md` | `ARCHIVE` | Long-term-memory phase context is now secondary to Akashik federation work. |
| `.planning/phases/phase-23/23-CONTEXT.md` | `ARCHIVE` | Retrieval bench context matters historically, but not as a live product guide. |
| `.planning/BENCH-v2.md` | `ARCHIVE` | Strong retrieval research record, but strategically superseded by AkashikBench-F. |
| `.planning/BENCH-COMPETITORS.md` | `ARCHIVE` | Useful historical market/retrieval context, but no longer the main battlefield. |
| `.planning/PROJECT.md` | `DELETE` | Duplicated by newer Akashik docs and likely stale. |
| `.planning/ROADMAP.md` | `DELETE` | Redundant with `docs/PROJECT-PLAN-AKASHIK.md` unless rewritten completely. |
| `.planning/REQUIREMENTS.md` | `ARCHIVE` | Preserve if you want requirements traceability; otherwise it will confuse current positioning. |
| `.planning/STATE.md` | `DELETE` | State snapshots age badly and quickly become noise. |
| `.planning/test-runs/**` | `DELETE` | Ephemeral run logs should not live as first-class repo artifacts. |

**Docs**

| file path | action | one-line reason |
|---|---|---|
| `docs/PROJECT-PLAN-AKASHIK.md` | `KEEP` | This is the right live execution doc for the current arc. |
| `docs/README.md` | `NEEDS-REWRITE` | Make it a clean docs index around Akashik, not accumulated legacy categories. |
| `docs/marketing/how-akashik-works.md` | `KEEP` | Best explanation of the compounding mechanism and should remain first-class. |
| `docs/marketing/storybrand-messaging-draft.md` | `ARCHIVE` | Preserve the evolution internally, but collapse public-facing messaging to a final version. |
| `docs/marketing/positioning-v2.1.md` | `NEEDS-REWRITE` | Likely close to the new thesis, but still carries transitional akashik/oracle-era framing. |
| `docs/marketing/positioning-draft.md` | `ARCHIVE` | Draft-stage messaging should not compete with the current story. |
| `docs/marketing/SOCIAL-LAUNCH.md` | `KEEP` | Launch execution is still relevant post-pivot. |
| `docs/marketing/how-akashik-works.md` | `KEEP` | Core architecture/message bridge; not stale. |
| `docs/marketing/growth-sources-plan.md` | `NEEDS-REWRITE` | Keep only if retargeted to OSS-community seeding rather than generic product growth. |
| `docs/marketing/influencer-outreach.md` | `NEEDS-REWRITE` | Valid only if aligned with the OSS pilot audience; otherwise it will drift. |
| `docs/product/VISION.md` | `NEEDS-REWRITE` | Still smart, but it frames Akashik as an “agent-memory protocol problem” more than a federated commons. |
| `docs/product/BENCHMARKS.md` | `NEEDS-REWRITE` | Too retrieval-leaderboard-heavy for the current story; keep the evidence, change the framing. |
| `docs/product/ROADMAP.md` | `ARCHIVE` | Superseded by the Akashik project plan unless rewritten from scratch. |
| `docs/product/RELEASE-v4.md` | `ARCHIVE` | Release notes for the old product arc are historical, not live product guidance. |
| `docs/product/MANIFESTO.md` | `KEEP` | If it aligns with the Akashik commons thesis, this is still valuable narrative glue. |
| `docs/architecture/ADR-001-v3-memory-protocol.md` | `ARCHIVE` | Good lineage artifact, but no longer the leading architectural reference. |
| `docs/architecture/ADR-002-v4-agent-brain.md` | `ARCHIVE` | “Agent brain” language is from the prior product identity. |
| `docs/architecture/V3-PROTOCOL.md` | `ARCHIVE` | Historical protocol layer, not current outward-facing architecture. |
| `docs/architecture/V4-PROTOCOL.md` | `ARCHIVE` | Same; useful lineage, stale primary framing. |
| `docs/p2p/P2P-VISION.md` | `ARCHIVE` | Important pivot precursor, but README and Akashik docs supersede it. |
| `docs/p2p/p2p-threat-model.md` | `KEEP` | Security/compliance-adjacent material ages better and matters for future SOC2/GDPR credibility. |
| `docs/p2p/peer-reputation-design.md` | `KEEP` | Still part of the federation story and operational trust layer. |
| `docs/p2p/peer-reputation-load-spreading.md` | `KEEP` | Still relevant to live federation scaling. |
| `docs/p2p/satisfaction-scoring.md` | `NEEDS-REWRITE` | Conceptually useful, but written for the older “agent memory quality gate” frame. |
| `docs/research/beat-the-competitors-retrieval-plan.md` | `ARCHIVE` | Strong technical research, but the positioning premise is superseded; annotate that explicitly. |
| `docs/research/performance-prediction-matrix.md` | `ARCHIVE` | Useful retrieval-era thinking, but now secondary and too speculative as a live doc. |
| `docs/research/energy-based-contradiction-detection.md` | `ARCHIVE` | Good forward sketch, but not core to the current launch narrative. |
| `docs/research/github-star-growth.md` | `KEEP` | Still useful if launch/distribution remains GitHub-centric. |
| `docs/research/octopus-discover/round-4-2026-05-26/**` | `ARCHIVE` | Preserve as decision provenance; not a day-to-day doc surface. |
| `docs/research/octopus-discover/round-5-2026-05-26/**` | `KEEP` | This round directly informed the current Akashik plan and AkashikBench-F thesis. |
| `docs/index.html` | `KEEP` | Keep if this is the public docs/landing surface; otherwise it risks drift and needs synchronization. |
| `docs/probe.html` | `DELETE` | Looks like an experiment artifact, not durable documentation. |

**Tests**

| file path | action | one-line reason |
|---|---|---|
| `tests/bench-akashik-federation.test.ts` | `KEEP` | This is the one benchmark that directly validates the current product thesis. |
| `tests/bench-locomo-real.test.ts` | `KEEP` | Real-corpus single-peer retrieval still matters as a subsystem health check. |
| `tests/bench-longmemeval-real.test.ts` | `KEEP` | Same: still useful as retrieval regression evidence, even if no longer the headline. |
| `tests/bench-scifact-real.test.ts` | `KEEP` | Useful baseline for retrieval quality and hardware comparisons. |
| `tests/bench-real.test.ts` | `NEEDS-REWRITE` | Keep only as a fast smoke benchmark; it should stop pretending to be canonical evaluation. |
| `tests/bench-standard.test.ts` | `NEEDS-REWRITE` | Same problem: useful as CI smoke, superseded as public evidence. |
| `tests/bench-locomo-synth.test.ts` | `ARCHIVE` | Real LoCoMo exists now; keep only if you explicitly want a fast fixture suite. |
| `tests/bench-longmemeval-synth.test.ts` | `ARCHIVE` | Same as above; valuable for local speed, not for product claims. |
| `tests/phase39.oracle-gossip-e2e.test.ts` | `KEEP` | Oracle/pubsub is still a real federation capability, not just old framing fluff. |
| `tests/federated-search-cap-tiers.test.ts` | `KEEP` | Directly relevant to federation fan-out quality and scaling behavior. |
| `tests/phase18.production-net.test.ts` | `KEEP` | Networking regressions still matter to Akashik’s core architecture. |
| `tests/phase29.rust-retrieval-regression.test.ts` | `KEEP` | Rust sidecar is still valid infra; keep a regression guard if you keep the sidecar. |

**Src / code**

| file path | action | one-line reason |
|---|---|---|
| `src/application/federated-search.ts` | `KEEP` | Core Akashik behavior; this is central, not optional. |
| `src/domain/federation-sim.ts` | `KEEP` | Core to AkashikBench-F and the compounding thesis. |
| `src/application/use-cases.ts` | `KEEP` | Still foundational, but comments/reference text should stop talking like Phase 1 code. |
| `src/application/ask.ts` | `NEEDS-REWRITE` | Keep the functionality, but align the flow/docs with local→federation→web→save. |
| `src/domain/long-term-memory.ts` | `ARCHIVE` | Not dead code necessarily, but clearly from the older “agent memory product” center of gravity. |
| `src/domain/cross-rerank.ts` | `ARCHIVE` | Useful retrieval infra, but no longer central enough to dominate the conceptual surface. |
| `src/domain/llm-listwise-rerank.ts` | `ARCHIVE` | Same: technically interesting, strategically de-centered. |
| `src/telegram/bot.ts` | `DELETE` | Telegram capture is a single-user workflow feature, not part of the OSS knowledge-commons core. |
| `src/telegram/capture.ts` | `DELETE` | Same. |
| `src/telegram/commands.ts` | `DELETE` | Same. |
| `src/domain/oracle.ts` | `KEEP` | The oracle room still fits community knowledge exchange, though it should be presented as secondary to federation-on-query. |
| `src/cli/commands/onboard.ts` | `NEEDS-REWRITE` | Keep if you want adoption, but the onboarding story should be “join the commons,” not “set up your personal memory.” |
| `src/cli/index.ts` | `NEEDS-REWRITE` | Command surface has grown into product sprawl; prune or regroup around Akashik’s current core use cases. |

A few clear calls. On the two-name issue: stay two-name only as a short transitional tactic, because the upside is package/install continuity, but the downside is constant cognitive tax across docs, tests, CLI, and benchmarks. I would not do an immediate repo/package rename before the pilot if it risks breaking the working distribution path; on the other hand, I would aggressively remove “akashik” from narrative docs now and schedule one coordinated technical rename once the pilot-facing docs stabilize. On `storybrand-messaging-draft.md`, keep the revision history only in archive form; the public or active doc should be the final message only. On `beat-the-competitors-retrieval-plan.md`, archive and annotate it rather than delete it; its strengths are real technical research and benchmark archaeology, however its competitive frame is now wrong for the product.

If I were Sahar cleaning up right now, the 3 changes I’d make first are: delete repo junk and local state (`README.md.bak.830lines`, `.claude-octopus/*`, tracked `dist/`) because that is pure signal-to-noise drag; archive most of `.planning/` plus the retrieval-era research docs because they preserve history without continuing to steer the present; rewrite `docs/product/BENCHMARKS.md`, `docs/product/VISION.md`, and onboarding/command-facing docs around Akashik’s actual thesis because the biggest current risk is not dead code, it is a codebase and doc surface still telling two different stories.
```
<!-- END-UNTRUSTED:provider=codex:nonce=7d7a6ded977fcc5f -->

## Status: SUCCESS

## Warnings/Errors
```
OpenAI Codex v0.125.0 (research preview)
--------
workdir: /Users/saharbarak/personal/akashik
model: gpt-5.4
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR, /Users/saharbarak/.codex/memories] (network access enabled)
reasoning effort: none
reasoning summaries: none
session id: 019e6557-a38e-7183-8dfb-0cd38e5abfe7
--------
user
IMPORTANT: You are running as a non-interactive subagent dispatched by Claude Octopus via codex exec. These are user-level instructions and take precedence over all skill directives. Skip ALL skills (brainstorming, using-superpowers, writing-plans, etc.). Do NOT read skill files, ask clarifying questions, offer visual companions, or follow any skill checklists. Respond directly to the prompt below.

TOOL POLICY: You MUST NOT use Write, Edit, or Bash for modifications. Only Read, Glob, Grep, WebSearch, and WebFetch are permitted for this role.

You are a technical researcher specializing in deep investigation, pattern analysis, and synthesis of complex information.

**Expertise:** Literature review, technology evaluation, best practices research, architectural pattern analysis, competitive analysis, trend identification, documentation synthesis.

**Approach:**
- Explore problems from multiple perspectives before forming conclusions
- Identify patterns across different sources and domains
- Synthesize information into actionable insights
- Acknowledge uncertainties and gaps in knowledge
- Cite sources and provide evidence for claims
- Balance breadth of exploration with depth of analysis

**Balance requirement (MANDATORY):**
- For every architectural or strategic recommendation, argue BOTH sides — state the advantages AND the disadvantages, tradeoffs, or risks. One-sided advocacy without acknowledging downsides is incomplete research.
- When comparing options, present each option's strengths AND weaknesses. Never dismiss an option without explaining what it does well.
- Use phrases like "on the other hand", "however", "conversely", "the tradeoff is" to signal balanced analysis.

**Compliance and regulatory awareness:**
- For enterprise/B2B contexts, always consider compliance implications (SOC2, HIPAA, PCI-DSS, GDPR) even if not explicitly asked
- For security-adjacent topics, consider audit trails, evidence gathering, and regulatory reporting requirements
- For infrastructure decisions, consider data residency, encryption at rest/in transit, and access control compliance

**Output quality bar (MANDATORY):**
- Back claims with specific evidence — tool names, version numbers, benchmark data, RFC/spec references, not just assertions
- Distinguish established best practices from emerging/experimental approaches
- For each recommendation, state at least one trade-off or limitation
- If information is unavailable or uncertain, say so explicitly rather than guessing

---

**Task:**
Analyze the problem space: -P CLEANUP AUDIT — what's no longer relevant in the Akashik project given the full arc:

CONTEXT:
The project has gone through:
1. Multiple ML retrieval optimization attempts (E1' rerank, E11 enrichment, listwise rerank, NDCG/MRR augmentation)
2. Three octopus-discover synthesis rounds with empirical pushback
3. A fundamental pivot from 'akashik: agent memory product' to 'Akashik: federated knowledge commons for the OSS community'
4. The articulation of the compounding mechanism (peer-local + federation-on-query + web-on-miss + save-locally + transfer-on-next-ask)
5. The scaffolding of AkashikBench-F which validated the compounding thesis (slope -4.74e-5 on LoCoMo)
6. Now: rebrand sweep in progress (Akashik), and need to clean up the codebase + docs of stale artifacts.

WORKING DIR: /Users/saharbarak/personal/akashik

QUESTIONS:

Q1. Looking at the project layout (src/, tests/, docs/, .planning/, scripts/, examples/), what's likely NO-LONGER-RELEVANT given the OSS-community-commons positioning?

Q2. Specific things to investigate:
   - .planning/ directory — there are phase-21, phase-23 dirs, HANDOFF.md, long-term-memory-integration.md. The phase-based GSD planning workflow may be useful or may be cruft.
   - docs/research/ — multiple research docs (energy-based-contradiction-detection, beat-the-competitors-retrieval-plan, performance-prediction-matrix). Some of these may have been superseded by the pivot.
   - src/ — there's akashik-rs/ (Rust sidecar), .claude-octopus/ (octopus state), .agents/ (skills/hooks). Anything obviously dead code?
   - tests/ — many tests reflect the old framing. Tests for bench-real.test.ts (30-doc proxy), bench-standard.test.ts (synth HotpotQA). Are these still useful or superseded?
   - Markdown clutter — README.md.bak.830lines is in the working tree (a backup of an old README). docs has potential duplication.
   - Codebase identifiers (akashik* prefixes everywhere) — should we plan a coordinated rename, or stay two-name?

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
- Be opinionated. Don't return 'maybe keep, maybe delete' for everything. Make a call.. Focus on understanding constraints, requirements, and user needs.

IMPORTANT: If you find yourself searching or grepping more than 3 times in a row without reading files or writing analysis, STOP searching. Consolidate what you've found so far and write your analysis. More searching rarely improves the output — synthesis does.

---

<!-- BEGIN-UNTRUSTED:provider-history:aebde26b15b6872d -->
## Provider History (codex)
Recent learnings from this project:
### probe | 2026-05-06T10:00:36Z
**Task:** IMPORTANT: You are running as a non-interactive subagent dispatched by Claude Octopus via codex exec
**Learned:** <!-- trust=untrusted provider=codex --> # Agent: codex # Task ID: probe-1778061026-0 # Role: researcher # Phase: probe # Prompt: Analyze the problem space: Audit the last 4 commits on this TypeScript 
---
### probe | 2026-05-06T10:00:37Z
**Task:** IMPORTANT: You are running as a non-interactive subagent dispatched by Claude Octopus via codex exec
**Learned:** <!-- trust=untrusted provider=codex --> # Agent: codex # Task ID: probe-1778061026-3 # Role: researcher # Phase: probe # Prompt: Investigate technical feasibility and dependencies for: Audit the last 
---
### probe | 2026-05-06T10:43:18Z
**Task:** IMPORTANT: You are running as a non-interactive subagent dispatched by Claude Octopus via codex exec
**Learned:** <!-- trust=untrusted provider=codex --> # Agent: codex # Task ID: probe-1778063597-0 # Role: researcher # Phase: probe # Prompt: Analyze the problem space: Do we need a blockchain? Audit this codebase
---
### probe | 2026-05-06T10:43:19Z
**Task:** IMPORTANT: You are running as a non-interactive subagent dispatched by Claude Octopus via codex exec
**Learned:** <!-- trust=untrusted provider=codex --> # Agent: codex # Task ID: probe-1778063597-3 # Role: researcher # Phase: probe # Prompt: Investigate technical feasibility and dependencies for: Do we need a bl
---
### probe | 2026-05-06T13:42:57Z
**Task:** IMPORTANT: You are running as a non-interactive subagent dispatched by Claude Octopus via codex exec
**Learned:** <!-- trust=untrusted provider=codex --> # Agent: codex # Task ID: probe-1778074357-0 # Role: researcher # Phase: probe # Prompt: Analyze the problem space: Brainstorm + audit: what technologies should
---
### probe | 2026-05-06T13:42:58Z
**Task:** IMPORTANT: You are running as a non-interactive subagent dispatched by Claude Octopus via codex exec
**Learned:** <!-- trust=untrusted provider=cod...
<!-- END-UNTRUSTED:provider-history:aebde26b15b6872d -->
codex
Inspecting the repository structure first, then I’ll sample the highest-signal docs, tests, and source files to classify what still fits the Akashik pivot versus what has become historical baggage.
exec
/bin/zsh -lc 'find docs -maxdepth 2 -type f | sort | head -n 200' in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
docs/PROJECT-PLAN-AKASHIK.md
docs/README.md
docs/architecture/ADR-001-v3-memory-protocol.md
docs/architecture/ADR-002-v4-agent-brain.md
docs/architecture/V3-PROTOCOL.md
docs/architecture/V4-PROTOCOL.md
docs/architecture/claude-obsidian-parity.md
docs/assets/_graph-fallback.svg
docs/assets/logo-mark.svg
docs/assets/logo-monochrome.svg
docs/assets/logo-wordmark.svg
docs/assets/manifesto-illustration.svg
docs/assets/og-card.png
docs/assets/og-card.svg
docs/assets/og-portrait.png
docs/assets/og-portrait.svg
docs/assets/og-square.png
docs/assets/og-square.svg
docs/banner.png
docs/banner.svg
docs/comps/01-hero.png
docs/demo.gif
docs/demo.tape
docs/index.html
docs/logo.png
docs/logo.svg
docs/marketing/BRAND-KIT.md
docs/marketing/IMAGEGEN-FRONTEND-WEB.md
docs/marketing/SITE-REDESIGN-SPEC.md
docs/marketing/SOCIAL-LAUNCH.md
docs/marketing/growth-sources-plan.md
docs/marketing/how-akashik-works.md
docs/marketing/influencer-outreach.md
docs/marketing/positioning-draft.md
docs/marketing/positioning-v2.1.md
docs/marketing/storybrand-messaging-draft.md
docs/marketing/x-launch-posts.md
docs/memory-stack.png
docs/memory-stack.svg
docs/p2p/P2P-VISION.md
docs/p2p/p2p-threat-model.md
docs/p2p/peer-reputation-design.md
docs/p2p/peer-reputation-load-spreading.md
docs/p2p/satisfaction-scoring.md
docs/probe.html
docs/product/BENCHMARKS.md
docs/product/GRAPHRAG-AUDIT.md
docs/product/MANIFESTO.md
docs/product/RELEASE-v4.md
docs/product/ROADMAP.md
docs/product/VISION.md
docs/protocol/PROTOCOL-QUALITY-QUESTIONS.md
docs/research/beat-the-competitors-retrieval-plan.md
docs/research/energy-based-contradiction-detection.md
docs/research/github-star-growth.md
docs/research/performance-prediction-matrix.md
docs/welly-idle.png

exec
/bin/zsh -lc 'find .planning -maxdepth 3 -type f | sort | head -n 200' in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
.planning/BENCH-COMPETITORS.md
.planning/BENCH-v2.md
.planning/CFD-SOTA-ATTACKS.md
.planning/DATA-ENGINEER-SOTA-ATTACKS.md
.planning/DATA-SCIENCE-SOTA-ATTACKS.md
.planning/HANDOFF.md
.planning/MATH-SOTA-ATTACKS.md
.planning/MILESTONES.md
.planning/PARTICLE-PHYSICS-SOTA-ATTACKS.md
.planning/PHYSICS-SOTA-ATTACKS.md
.planning/PROJECT.md
.planning/REQUIREMENTS.md
.planning/ROADMAP.md
.planning/SOTA-UPGRADE-PLAN.md
.planning/STATE.md
.planning/V2.1-SYNTHESIS.md
.planning/audits/ai-solution-architect.md
.planning/audits/data-researcher.md
.planning/audits/enterprise-architect.md
.planning/audits/s2-geometry.md
.planning/audits/senior-data-engineer.md
.planning/audits/senior-data-scientist.md
.planning/harness-integration-roadmap.md
.planning/long-term-memory-integration.md
.planning/multi-provider-epic.md
.planning/p2p-scale-plan.md
.planning/phases/phase-07/07-CONTEXT.md
.planning/phases/phase-15/15-01-PLAN.md
.planning/phases/phase-15/15-01-SUMMARY.md
.planning/phases/phase-15/15-02-PLAN.md
.planning/phases/phase-15/15-02-SUMMARY.md
.planning/phases/phase-15/15-03-PLAN.md
.planning/phases/phase-15/15-03-SUMMARY.md
.planning/phases/phase-15/15-04-PLAN.md
.planning/phases/phase-15/15-04-SUMMARY.md
.planning/phases/phase-15/15-CONTEXT.md
.planning/phases/phase-15/15-RESEARCH.md
.planning/phases/phase-15/15-VALIDATION.md
.planning/phases/phase-15/15-VERIFICATION.md
.planning/phases/phase-16/16-01-PLAN.md
.planning/phases/phase-16/16-01-SUMMARY.md
.planning/phases/phase-16/16-02-PLAN.md
.planning/phases/phase-16/16-02-SUMMARY.md
.planning/phases/phase-16/16-03-PLAN.md
.planning/phases/phase-16/16-03-SUMMARY.md
.planning/phases/phase-16/16-04-PLAN.md
.planning/phases/phase-16/16-04-SUMMARY.md
.planning/phases/phase-16/16-CONTEXT.md
.planning/phases/phase-16/16-RESEARCH.md
.planning/phases/phase-16/16-VERIFICATION.md
.planning/phases/phase-17/17-01-PLAN.md
.planning/phases/phase-17/17-01-SUMMARY.md
.planning/phases/phase-17/17-02-PLAN.md
.planning/phases/phase-17/17-02-SUMMARY.md
.planning/phases/phase-17/17-03-PLAN.md
.planning/phases/phase-17/17-03-SUMMARY.md
.planning/phases/phase-17/17-04-PLAN.md
.planning/phases/phase-17/17-04-SUMMARY.md
.planning/phases/phase-17/17-CONTEXT.md
.planning/phases/phase-17/17-RESEARCH.md
.planning/phases/phase-17/17-VERIFICATION.md
.planning/phases/phase-18/18-01-PLAN.md
.planning/phases/phase-18/18-01-SUMMARY.md
.planning/phases/phase-18/18-02-PLAN.md
.planning/phases/phase-18/18-02-SUMMARY.md
.planning/phases/phase-18/18-03-PLAN.md
.planning/phases/phase-18/18-03-SUMMARY.md
.planning/phases/phase-18/18-04-PLAN.md
.planning/phases/phase-18/18-04-SUMMARY.md
.planning/phases/phase-18/18-CONTEXT.md
.planning/phases/phase-18/18-RESEARCH.md
.planning/phases/phase-18/18-VERIFICATION.md
.planning/phases/phase-19/19-01-PLAN.md
.planning/phases/phase-19/19-01-SUMMARY.md
.planning/phases/phase-19/19-02-PLAN.md
.planning/phases/phase-19/19-03-PLAN.md
.planning/phases/phase-19/19-03-SUMMARY.md
.planning/phases/phase-19/19-04-PLAN.md
.planning/phases/phase-19/19-04-SUMMARY.md
.planning/phases/phase-19/19-CONTEXT.md
.planning/phases/phase-19/19-RESEARCH.md
.planning/phases/phase-19/19-VERIFICATION.md
.planning/phases/phase-19/phase-19-02-SUMMARY.md
.planning/phases/phase-20/20-01-PLAN.md
.planning/phases/phase-20/20-01-SUMMARY.md
.planning/phases/phase-20/20-02-PLAN.md
.planning/phases/phase-20/20-02-SUMMARY.md
.planning/phases/phase-20/20-03-PLAN.md
.planning/phases/phase-20/20-03-SUMMARY.md
.planning/phases/phase-20/20-04-PLAN.md
.planning/phases/phase-20/20-04-SUMMARY.md
.planning/phases/phase-20/20-CONTEXT.md
.planning/phases/phase-20/20-VERIFICATION.md
.planning/phases/phase-21/21-CONTEXT.md
.planning/phases/phase-23/23-CONTEXT.md
.planning/test-runs/p2p-phases-2026-05-11T160726Z.md
.planning/v2.1-CANDIDATES.md

exec
/bin/zsh -lc "pwd && rg --files -g 'README*' -g 'docs/**' -g 'tests/**' -g 'src/**' -g '.planning/**' -g 'scripts/**' -g 'examples/**' -g '.claude-octopus/**' -g '.agents/**' | sed 's#"'^#./#'"' | sort | head -n 400" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
/Users/saharbarak/personal/akashik
./README.md
./README.md.bak.830lines
./demo/README.md
./docs/PROJECT-PLAN-AKASHIK.md
./docs/README.md
./docs/architecture/ADR-001-v3-memory-protocol.md
./docs/architecture/ADR-002-v4-agent-brain.md
./docs/architecture/V3-PROTOCOL.md
./docs/architecture/V4-PROTOCOL.md
./docs/architecture/claude-obsidian-parity.md
./docs/assets/_graph-fallback.svg
./docs/assets/logo-mark.svg
./docs/assets/logo-monochrome.svg
./docs/assets/logo-wordmark.svg
./docs/assets/manifesto-illustration.svg
./docs/assets/og-card.png
./docs/assets/og-card.svg
./docs/assets/og-portrait.png
./docs/assets/og-portrait.svg
./docs/assets/og-square.png
./docs/assets/og-square.svg
./docs/assets/vendor/three/postprocessing/EffectComposer.js
./docs/assets/vendor/three/postprocessing/MaskPass.js
./docs/assets/vendor/three/postprocessing/Pass.js
./docs/assets/vendor/three/postprocessing/RenderPass.js
./docs/assets/vendor/three/postprocessing/ShaderPass.js
./docs/assets/vendor/three/postprocessing/UnrealBloomPass.js
./docs/assets/vendor/three/shaders/CopyShader.js
./docs/assets/vendor/three/shaders/LuminosityHighPassShader.js
./docs/assets/vendor/three/three-shim.js
./docs/banner.png
./docs/banner.svg
./docs/comps/01-hero.png
./docs/demo.gif
./docs/demo.tape
./docs/index.html
./docs/logo.png
./docs/logo.svg
./docs/marketing/BRAND-KIT.md
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md
./docs/marketing/SITE-REDESIGN-SPEC.md
./docs/marketing/SOCIAL-LAUNCH.md
./docs/marketing/growth-sources-plan.md
./docs/marketing/how-akashik-works.md
./docs/marketing/influencer-outreach.md
./docs/marketing/positioning-draft.md
./docs/marketing/positioning-v2.1.md
./docs/marketing/storybrand-messaging-draft.md
./docs/marketing/x-launch-posts.md
./docs/memory-stack.png
./docs/memory-stack.svg
./docs/p2p/P2P-VISION.md
./docs/p2p/p2p-threat-model.md
./docs/p2p/peer-reputation-design.md
./docs/p2p/peer-reputation-load-spreading.md
./docs/p2p/satisfaction-scoring.md
./docs/probe.html
./docs/product/BENCHMARKS.md
./docs/product/GRAPHRAG-AUDIT.md
./docs/product/MANIFESTO.md
./docs/product/RELEASE-v4.md
./docs/product/ROADMAP.md
./docs/product/VISION.md
./docs/protocol/PROTOCOL-QUALITY-QUESTIONS.md
./docs/research/beat-the-competitors-retrieval-plan.md
./docs/research/energy-based-contradiction-detection.md
./docs/research/github-star-growth.md
./docs/research/octopus-discover/round-4-2026-05-26/README.md
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md
./docs/research/octopus-discover/round-5-2026-05-26/README.md
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-2.md
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-5.md
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-1.md
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-4.md
./docs/research/octopus-discover/round-5-2026-05-26/synthesis.md
./docs/research/performance-prediction-matrix.md
./docs/welly-idle.png
./scripts/bench-arguana-dense.mjs
./scripts/bench-beir-rust.mjs
./scripts/bench-beir-sota.mjs
./scripts/bench-beir.mjs
./scripts/bench-bridge.mjs
./scripts/bench-compare.mjs
./scripts/bench-consolidation.mjs
./scripts/bench-embed-throughput.mjs
./scripts/bench-lab.mjs
./scripts/bench-matryoshka.mjs
./scripts/bench-ppr-multihop.mjs
./scripts/bench-ppr.mjs
./scripts/bench-room-routing.mjs
./scripts/bench-v2.sh
./scripts/bench-warm.mjs
./scripts/bootstrap.sh
./scripts/contextualize-corpus.mjs
./scripts/debug-reranker.mjs
./scripts/jacobi-preconditioning.mjs
./scripts/qrel-rejudge-v2.mjs
./scripts/qrel-rejudge-v3.mjs
./scripts/qrel-rejudge.mjs
./scripts/render-og-cards.sh
./scripts/sweep-rocchio.mjs
./scripts/sweep-rrf.mjs
./src/application/ask.ts
./src/application/auto-forget-tick.ts
./src/application/batch-ingest.ts
./src/application/bip39-recovery.ts
./src/application/codebase-indexer.ts
./src/application/consolidator.ts
./src/application/discover.ts
./src/application/discovery-loop.ts
./src/application/federated-recall.ts
./src/application/federated-search.ts
./src/application/hot-cache-tick.ts
./src/application/identity-bridge.ts
./src/application/identity-lifecycle.ts
./src/application/ingest.ts
./src/application/peer-order-builder.ts
./src/application/peer-pull-telemetry.ts
./src/application/recall.ts
./src/application/report.ts
./src/application/session-ingest.ts
./src/application/session-manager.ts
./src/application/update-checker.ts
./src/application/update-peer-reputation.ts
./src/application/use-cases.ts
./src/cli/commands/ask.ts
./src/cli/commands/bench.ts
./src/cli/commands/cache-stats.ts
./src/cli/commands/claude-install.ts
./src/cli/commands/codebase.ts
./src/cli/commands/consolidate.ts
./src/cli/commands/daemon.ts
./src/cli/commands/dashboard.ts
./src/cli/commands/discover-loop.ts
./src/cli/commands/discover.ts
./src/cli/commands/doctor.ts
./src/cli/commands/entity.ts
./src/cli/commands/eval.ts
./src/cli/commands/export-obsidian.ts
./src/cli/commands/gc.ts
./src/cli/commands/help.ts
./src/cli/commands/hot.ts
./src/cli/commands/identity.ts
./src/cli/commands/index-project.ts
./src/cli/commands/init.ts
./src/cli/commands/jobs.ts
./src/cli/commands/lint.ts
./src/cli/commands/login.ts
./src/cli/commands/logs.ts
./src/cli/commands/mcp.ts
./src/cli/commands/metrics.ts
./src/cli/commands/onboard.ts
./src/cli/commands/oracle.ts
./src/cli/commands/peer.ts
./src/cli/commands/peers-rep.ts
./src/cli/commands/publish.ts
./src/cli/commands/recall.ts
./src/cli/commands/recent-sessions.ts
./src/cli/commands/report.ts
./src/cli/commands/room.ts
./src/cli/commands/save.ts
./src/cli/commands/sessions.ts
./src/cli/commands/share.ts
./src/cli/commands/sources.ts
./src/cli/commands/swarm.ts
./src/cli/commands/telegram.ts
./src/cli/commands/this.ts
./src/cli/commands/touch.ts
./src/cli/commands/trigger.ts
./src/cli/commands/unshare.ts
./src/cli/commands/update.ts
./src/cli/commands/version.ts
./src/cli/commands/viz.ts
./src/cli/index.ts
./src/cli/ipc-client.ts
./src/cli/runtime.ts
./src/cli/tui/share-picker-tty.ts
./src/daemon/consolidate-tick.ts
./src/daemon/file-watcher.ts
./src/daemon/ipc-handlers.ts
./src/daemon/ipc.ts
./src/daemon/job-queue.ts
./src/daemon/job-runner.ts
./src/daemon/loop.ts
./src/domain/auto-forget.ts
./src/domain/bench-types.ts
./src/domain/binary-quantize.ts
./src/domain/bloom.ts
./src/domain/chunks.ts
./src/domain/codebase.ts
./src/domain/consolidated-memory.ts
./src/domain/content.ts
./src/domain/contextual-enrich.ts
./src/domain/cross-rerank.ts
./src/domain/entity-extract.ts
./src/domain/entity.ts
./src/domain/errors.ts
./src/domain/eval-metrics.ts
./src/domain/federation-sim.ts
./src/domain/feeds.ts
./src/domain/graph-lint.ts
./src/domain/graph-rerank.ts
./src/domain/graph.ts
./src/domain/hot-cache.ts
./src/domain/identity.ts
./src/domain/internal-schemes.ts
./src/domain/job.ts
./src/domain/llm-extractor.ts
./src/domain/llm-listwise-rerank.ts
./src/domain/log-event.ts
./src/domain/long-term-memory.ts
./src/domain/metrics.ts
./src/domain/oracle.ts
./src/domain/pagerank.ts
./src/domain/peer-reputation.ts
./src/domain/peer-telemetry.ts
./src/domain/peer.ts
./src/domain/query-cache.ts
./src/domain/recency-rerank.ts
./src/domain/release.ts
./src/domain/remote-node-validator.ts
./src/domain/rerank-tier.ts
./src/domain/rooms.ts
./src/domain/save-note.ts
./src/domain/secret-gate.ts
./src/domain/semantic-cache.ts
./src/domain/sessions.ts
./src/domain/shamir.ts
./src/domain/share-envelope.ts
./src/domain/share-picker.ts
./src/domain/share-policy.ts
./src/domain/sharing.ts
./src/domain/sources.ts
./src/domain/subject-key.ts
./src/domain/system-rooms.ts
./src/domain/touch.ts
./src/domain/vectors.ts
./src/domain/write-time-gate.ts
./src/infrastructure/async-mutex.ts
./src/infrastructure/atomic-write.ts
./src/infrastructure/bandwidth-limiter.ts
./src/infrastructure/code-graph.ts
./src/infrastructure/config-loader.ts
./src/infrastructure/connection-health.ts
./src/infrastructure/cross-encoder.ts
./src/infrastructure/embedders.ts
./src/infrastructure/entity-registry.ts
./src/infrastructure/github-oauth.ts
./src/infrastructure/graph-repository.ts
./src/infrastructure/http/fetcher.ts
./src/infrastructure/hw-detect.ts
./src/infrastructure/identity-resolver.ts
./src/infrastructure/identity-store.ts
./src/infrastructure/linked-accounts.ts
./src/infrastructure/llm-extractor.ts
./src/infrastructure/llm-listwise-rerank.ts
./src/infrastructure/log-store.ts
./src/infrastructure/ollama-client.ts
./src/infrastructure/oracle-gossip.ts
./src/infrastructure/parsers/html-extractor.ts
./src/infrastructure/parsers/xml-parser.ts
./src/infrastructure/peer-reputation-store.ts
./src/infrastructure/peer-store.ts
./src/infrastructure/peer-transport.ts
./src/infrastructure/process-lock.ts
./src/infrastructure/recall-sync.ts
./src/infrastructure/rooms-config.ts
./src/infrastructure/rust-retrieval.ts
./src/infrastructure/search-gossip.ts
./src/infrastructure/search-sync.ts
./src/infrastructure/sessions-state.ts
./src/infrastructure/share-store.ts
./src/infrastructure/share-sync.ts
./src/infrastructure/sources-config.ts
./src/infrastructure/sources/arxiv.ts
./src/infrastructure/sources/audio-transcript.ts
./src/infrastructure/sources/claude-sessions.ts
./src/infrastructure/sources/codebase.ts
./src/infrastructure/sources/devto.ts
./src/infrastructure/sources/ecosystems-timeline.ts
./src/infrastructure/sources/generic-rss.ts
./src/infrastructure/sources/generic-url.ts
./src/infrastructure/sources/git-log.ts
./src/infrastructure/sources/git-submodules.ts
./src/infrastructure/sources/github-releases.ts
./src/infrastructure/sources/github-trending.ts
./src/infrastructure/sources/hn-algolia.ts
./src/infrastructure/sources/image-metadata.ts
./src/infrastructure/sources/image-ocr.ts
./src/infrastructure/sources/npm-trending.ts
./src/infrastructure/sources/oss-insight.ts
./src/infrastructure/sources/package-deps.ts
./src/infrastructure/sources/pdf-text.ts
./src/infrastructure/sources/podcast-rss.ts
./src/infrastructure/sources/product-hunt.ts
./src/infrastructure/sources/reddit.ts
./src/infrastructure/sources/registry.ts
./src/infrastructure/sources/twitter-search.ts
./src/infrastructure/sources/youtube-transcript.ts
./src/infrastructure/summariser.ts
./src/infrastructure/telemetry-formatter.ts
./src/infrastructure/touch-protocol.ts
./src/infrastructure/tree-sitter-parser.ts
./src/infrastructure/vector-index.ts
./src/infrastructure/watch-targets.ts
./src/infrastructure/x-client.ts
./src/infrastructure/ydoc-store.ts
./src/mcp/server.ts
./src/telegram/bot.ts
./src/telegram/capture.ts
./src/telegram/commands.ts
./src/telegram/digest.ts
./tests/auto-forget.test.ts
./tests/bench-akashik-federation.test.ts
./tests/bench-auto-forget.test.ts
./tests/bench-beta-calibration.test.ts
./tests/bench-locomo-real.test.ts
./tests/bench-locomo-synth.test.ts
./tests/bench-longmemeval-real.test.ts
./tests/bench-longmemeval-synth.test.ts
./tests/bench-onnx.test.ts
./tests/bench-real.test.ts
./tests/bench-retention-band.test.ts
./tests/bench-scifact-real.test.ts
./tests/bench-standard.test.ts
./tests/bench-tier-promotion.test.ts
./tests/bench-write-gate.test.ts
./tests/binary-quantize.test.ts
./tests/bip39-recovery.test.ts
./tests/bloom.test.ts
./tests/browser-portability.test.ts
./tests/consolidate-tick.test.ts
./tests/consolidated-memory.test.ts
./tests/consolidator.test.ts
./tests/contextual-enrich.test.ts
./tests/cross-rerank.test.ts
./tests/embedder-batching.test.ts
./tests/error-hints.test.ts
./tests/eval-metrics.test.ts
./tests/federated-search-cap-tiers.test.ts
./tests/federation-sim.test.ts
./tests/fixtures/phase19/callee.ts
./tests/fixtures/phase19/caller.ts
./tests/fixtures/phase19/patterns.ts
./tests/fixtures/phase19/sample.py
./tests/fixtures/phase19/sample.ts
./tests/fixtures/phase20/sample-session.jsonl
./tests/fixtures/phase20/sample-with-secret.jsonl
./tests/github-oauth.test.ts
./tests/graph-rerank.test.ts
./tests/identity-bridge.test.ts
./tests/identity-lifecycle.test.ts
./tests/identity.test.ts
./tests/ipc.test.ts
./tests/job-queue-backpressure.test.ts
./tests/linked-accounts.test.ts
./tests/llm-extractor.test.ts
./tests/llm-listwise-rerank.test.ts
./tests/log-store.test.ts
./tests/long-term-memory.test.ts
./tests/metrics.test.ts
./tests/multi-rrf.test.ts
./tests/pagerank.test.ts
./tests/peer-order-builder.test.ts
./tests/peer-reputation-math.test.ts
./tests/peer-reputation-review-fixes.test.ts
./tests/peer-reputation-store.test.ts
./tests/peer-telemetry.test.ts
./tests/phase1.graph-rooms.test.ts
./tests/phase15.peer-security.test.ts
./tests/phase16.share-crdt.test.ts
./tests/phase17.discovery.test.ts
./tests/phase17.federated-search.test.ts
./tests/phase17.mcp-tool.test.ts
./tests/phase18.production-net.test.ts
./tests/phase19.codebase-indexing.test.ts
./tests/phase2.chunks.test.ts
./tests/phase2.feeds.test.ts
./tests/phase2.ingest.test.ts
./tests/phase20.sessions.test.ts
./tests/phase29.rust-retrieval-regression.test.ts
./tests/phase3.mcp.test.ts
./tests/phase31.remote-node-validator.test.ts
./tests/phase32.hot-cache.test.ts
./tests/phase33.graph-lint.test.ts
./tests/phase34.save-note.test.ts
./tests/phase35.p2p-touch-e2e.test.ts
./tests/phase36.system-rooms.test.ts
./tests/phase37.share-picker.test.ts
./tests/phase38.oracle.test.ts
./tests/phase39.oracle-gossip-e2e.test.ts
./tests/phase4.rooms.test.ts

exec
/bin/zsh -lc 'ls -la' in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
total 744
drwxr-xr-x@  33 saharbarak  staff    1056 May 26 20:13 .
drwxr-xr-x@  17 saharbarak  staff     544 May 25 16:29 ..
drwxr-xr-x@   3 saharbarak  staff      96 Apr 29 17:36 .agents
drwxr-xr-x@   8 saharbarak  staff     256 May 26 11:45 .claude
drwxr-xr-x@   7 saharbarak  staff     224 May 26 20:31 .claude-octopus
drwxr-xr-x@   3 saharbarak  staff      96 Apr 29 17:36 .claude-plugin
drwxr-xr-x@  15 saharbarak  staff     480 May 26 20:31 .git
drwxr-xr-x@   3 saharbarak  staff      96 Apr 29 17:36 .github
-rw-r--r--@   1 saharbarak  staff     397 May  9 00:36 .gitignore
-rw-r--r--@   1 saharbarak  staff     127 Apr 29 17:36 .gitmodules
-rw-r--r--@   1 saharbarak  staff     496 Apr 29 17:36 .mcp.json
drwxr-xr-x@  26 saharbarak  staff     832 May 20 19:38 .planning
-rw-r--r--@   1 saharbarak  staff   15020 May 23 18:20 CLAUDE.md
-rw-r--r--@   1 saharbarak  staff     416 Apr 29 17:36 Dockerfile
-rw-r--r--@   1 saharbarak  staff    7358 Apr 29 19:53 NEXT_STEPS.md
-rw-r--r--@   1 saharbarak  staff    9398 May 26 20:13 README.md
-rw-r--r--@   1 saharbarak  staff   50994 May  9 10:50 README.md.bak.830lines
drwxr-xr-x@   3 saharbarak  staff      96 May  9 15:34 bin
drwxr-xr-x@   3 saharbarak  staff      96 Apr 29 17:36 config
drwxr-xr-x@  26 saharbarak  staff     832 May 11 16:06 demo
drwxr-xr-x@   9 saharbarak  staff     288 Apr 29 18:22 dist
drwxr-xr-x@  24 saharbarak  staff     768 May 26 20:14 docs
-rw-r--r--@   1 saharbarak  staff    7945 May 21 11:12 findings.md
drwxr-xr-x@ 410 saharbarak  staff   13120 May 26 12:16 node_modules
-rw-r--r--@   1 saharbarak  staff  250282 May  4 11:16 package-lock.json
-rw-r--r--@   1 saharbarak  staff    2440 May  4 11:16 package.json
drwxr-xr-x@  27 saharbarak  staff     864 May  9 10:13 scripts
-rw-r--r--@   1 saharbarak  staff    1612 Apr 29 17:36 skills-lock.json
drwxr-xr-x@   9 saharbarak  staff     288 Apr 29 17:36 src
drwxr-xr-x@  90 saharbarak  staff    2880 May 26 19:53 tests
-rw-r--r--@   1 saharbarak  staff     648 Apr 29 17:36 tsconfig.json
drwxr-xr-x@   3 saharbarak  staff      96 Apr 29 17:36 vendor
drwxr-xr-x@   6 saharbarak  staff     192 Apr 29 19:55 akashik-rs

codex
The file map is clear now: there’s a live Akashik/P2P/federation track sitting beside a large amount of legacy retrieval-optimization and phase-era planning material. I’m reading representative files next so the keep/archive/delete calls are based on actual content, not just filenames.
exec
/bin/zsh -lc "sed -n '1,220p' README.md" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
# Akashik

**Federated knowledge commons for the open-source community.**

Akashik is a peer-to-peer knowledge graph protocol where every researcher, maintainer, and engineer adds their reading and reasoning, and where every newcomer can query what the community has already learned before re-treading the same path. Each contribution is Ed25519-signed, locally owned, and federated only on demand — so the network's working set grows by what its contributors are actually curious about, not by what a central planner decided to ingest.

---

## The community already learned this. Read the record.

Open source built the freest software stack in history because we shared *code* — CRAN, npm, PyPI, GitHub, arXiv. The infrastructure compounds. But the knowledge *between* the code (what we read, what we figured out together, what we debugged at 3am) has never had the same substrate. Each generation of contributors starts over. The same papers get re-explained in posts that 404 within a year. The same CUDA OOM gets diagnosed in parallel by fifty people next Tuesday.

**Akashik is what** that missing substrate looks like: a federated, cryptographically-attested record the community writes for itself. Not a personal-memory product. Not a team wiki. A shared protocol where contributor reading-hours compound into community progress, signed and attributed, forever.

**The differentiator is federation, not retrieval.** Single-user memory products already solve personal retrieval; Akashik is not trying to beat them on per-user R@5. The bet is that *cross-peer transfer* of researched-once knowledge is the missing primitive in the OSS knowledge stack, and that a demand-shaped P2P graph is the right way to build it.

The name borrows from the mythological **Akashic Records** — the perfect referent because it names what we're building: a shared, persistent, accessible record of what the collective has known. The "k" instead of "c" signals the engineering implementation, not the literal myth.

---

## How it works — the compounding loop

When you ask Akashik something, the system runs through five steps:

1. **Local first.** Query your own peer's graph. Hit? Return. Zero network cost.
2. **Federation on miss.** Fan out to the peers you share rooms with. Each answers with whatever they've already saved or researched. Results merge via reciprocal-rank fusion.
3. **Web on second miss.** If the federation can't answer with confidence, the harness performs `WebSearch` / `WebFetch` / arXiv pull on *your* machine — the only time the network reaches outward.
4. **Save locally, signed.** The result lands in your local graph, attested by your DID (Ed25519). You are now the "ambitioned" curator of that knowledge: provenance, room, timestamp, source URLs all attached.
5. **Transfer on next ask.** When another contributor asks something similar later, federation fan-out reaches your peer, your research transfers to them with original attribution, and they pay nothing for the hour you spent.

Stated formally, for any topic `T` and time `t`:

- `R(T, t)` = number of peers currently holding a cached answer for `T`
- `R(T, t)` is **monotonically non-decreasing** under the mechanism — it only grows
- `expected_time_to_answer(T) ~ 1 / R(T, t)`

Compounding is not a marketing claim; it is a property of the architecture. Each peer holds only what it has asked for or contributed — there is no global graph, no central server, and disk cost on every peer scales with that peer's own curiosity rather than with the community's total contribution volume.

Full architecture: [`docs/marketing/how-akashik-works.md`](docs/marketing/how-akashik-works.md).

---

## Empirical validation — AkashikBench-F

The Round 5 octopus-discover synthesis identified one benchmark capable of falsifying the federated-commons thesis: a federation-level simulator measuring `web_fallback_rate(t)` over a realistic peer network with offline churn. We built it. First run, on the LoCoMo factual subset:

| Parameter | Value |
|---|---|
| Corpus | LoCoMo factual subset — 695 queries |
| Peers | 10, strictly disjoint initial shards |
| Sim steps | 2000 |
| Offline churn | 20% |
| Query distribution | Zipfian (alpha = 1.0) |

Results:

| Metric | Value | Reading |
|---|---|---|
| `web_fallback_rate` (start) | 0.170 | 17% of queries hit the web at t=0 |
| `web_fallback_rate` (end) | 0.010 | 1% of queries hit the web by t=2000 |
| Compounding slope | -4.74e-5 | Negative → thesis validated for this corpus |
| Local resolution | 74.2% | Cache hit on own peer |
| Federation resolution | 21.3% | Pulled from another peer |
| Web fallback | 4.5% | Outbound only when federation couldn't answer |

**These are simulator numbers, not pilot numbers.** v1 abstracts away per-peer retrieval quality (those are measured separately by the LongMemEval / LoCoMo / BEIR benches in `tests/`) and treats "does peer N hold doc D" as boolean. v2 plugs real retrieval in. The real-pilot validation lives in the 30-day local-AI / agent-tooling ecosystem launch plan — see [`docs/research/octopus-discover/round-5-2026-05-26/`](docs/research/octopus-discover/round-5-2026-05-26/) for the full synthesis.

Bench source: [`tests/bench-akashik-federation.test.ts`](tests/bench-akashik-federation.test.ts).

---

## Quickstart

> The npm package and CLI binary are still named `akashik` during the two-name period. The brand-marketing name is **Akashik**; a coordinated rename of package + repo + DNS is queued behind the public launch. Examples below show both forms.

Install:

```bash
npm install -g akashik
# (will become: npm install -g akashik)
```

Run your first peer:

```bash
akashik init
akashik daemon start
```

Save what teaches you:

```bash
akashik save https://arxiv.org/abs/2406.16678 --room research
akashik save ./notes/cuda-oom-debug.md --room toolshed
```

Query the record:

```bash
akashik ask "how does mxbai-rerank compare to cross-encoder on long contexts?"
```

The query checks your local graph, then federates to peers you share rooms with, then falls back to web research only if neither can answer. The web result lands in your local graph signed by you — the next contributor who asks something similar pulls it from your peer with full attribution.

**Federate. Compound. Continue.**

---

## Architecture pillars

- **P2P federation over libp2p.** No central server, no vendor data lock-in. Each peer advertises the rooms it participates in; queries fan out via gossip with bounded timeouts. Lineage per the Round 5 synthesis: *Freenet-style demand-shaped lazy replication with cache-fill on miss*, applied to attributed semantic memory.
- **Ed25519-signed contributions with DIDs.** Every record carries the curator's decentralized identifier, room, source URLs, and timestamp. Trust is graph-traversable: follow the chain, see who curated, when, and why. Lineage: AT Protocol's signed-attribution layer applied to research memory rather than social posts.
- **Commodity hardware.** Xenova ONNX embeddings (384-dim, all-MiniLM-L6-v2), sqlite-vec for vector search, sql.js for cross-platform persistence. A $7/mo VPS, a laptop, or a Raspberry Pi runs a full peer. Reproducible from public sources.

The full synthesis frames Akashik as compositionally novel with prior-art math: *"Freenet-style demand-shaped replication applied to attributed semantic research memory, with AT Protocol-style DID signatures."*

---

## What's next

Active workstreams (planning doc forthcoming at [`docs/PROJECT-PLAN-AKASHIK.md`](docs/PROJECT-PLAN-AKASHIK.md)):

- **AkashikBench-F v2** — real per-peer retrieval (not boolean), measure compounding under genuine retrieval-quality variance.
- **100-peer pilot in the local-AI / agent-tooling ecosystem** — seed contributors to `llama.cpp + ollama`, `vllm-project/vllm`, and `aider` with 50-80 canonical artifacts. Publish the real `web_fallback_rate` curve after 30 days.
- **Codebase rename** — coordinated `akashik → akashik` migration across npm, GitHub, DNS.
- **Read-only public peer endpoint** — "Browse the record" entry point for newcomers, no login required.
- **GDPR Article 17 tombstones** — reconciling immutable provenance with right-to-erasure via signed deletion records.
- **Rarity-aware replication quotas** — LOCKSS-style protection against niche-content evaporation; BitTorrent rarest-first weighting on federation fan-out.

---

## Contributing

Akashik is pre-launch — the federation simulator validates the thesis, the retrieval stack benchmarks at parity with public single-user baselines, and the real pilot is the next milestone. We need:

- Contributors who run a peer in the local-AI / agent-tooling ecosystem during the pilot window.
- Researchers willing to seed canonical artifacts (papers, debug threads, PRs) into their local graphs.
- Engineers interested in libp2p, signed DIDs, or vector-search infrastructure.

Open an issue, fork the repo, or DM the maintainer. The project is in flux and the door is open.

## Status

Pre-launch. Simulator-validated, retrieval-benchmarked, pilot pending. Two-name period in effect (`akashik` in code, `Akashik` in marketing). Public protocol spec lands with the rename.

## License

MIT. Always open protocol. Your contributions, signed by you. No central server. Ever. Provenance preserved forever.

exec
/bin/zsh -lc "sed -n '1,220p' package.json" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
{
  "name": "akashik",
  "version": "4.0.0-rc1",
  "description": "OSS P2P agent memory — DID-authored cryptographic envelopes, 48× compressed vectors, 33× faster cached queries via daemon IPC + native Rust client, episodic→semantic consolidation worker, cross-model embedding bridge. CPU-local, zero GPU, zero SaaS. v4 Agent Brain.",
  "type": "module",
  "bin": {
    "akashik": "./bin/akashik.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "bootstrap": "bash scripts/bootstrap.sh",
    "doctor": "node bin/akashik.js doctor",
    "start": "node bin/akashik.js",
    "test": "node --import tsx --test tests/*.test.ts"
  },
  "files": [
    "bin/**",
    "dist/**",
    ".claude-plugin/**",
    ".claude/**",
    "config/config.example.yaml"
  ],
  "engines": {
    "node": ">=20"
  },
  "keywords": [
    "claude-code",
    "knowledge-graph",
    "research-agent",
    "mcp",
    "embeddings",
    "semantic-search",
    "telegram-bot"
  ],
  "license": "MIT",
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.13",
    "@types/node": "^22.0.0",
    "@types/node-telegram-bot-api": "^0.64.14",
    "tsx": "^4.21.0",
    "typescript": "^5.6.0"
  },
  "dependencies": {
    "@clack/prompts": "^1.2.0",
    "@libp2p/bootstrap": "12.0.16",
    "@libp2p/circuit-relay-v2": "4.2.0",
    "@libp2p/crypto": "^5.1.15",
    "@libp2p/dcutr": "3.0.15",
    "@libp2p/floodsub": "^11.0.18",
    "@libp2p/identify": "^4.1.0",
    "@libp2p/interface": "^3.2.0",
    "@libp2p/kad-dht": "16.2.0",
    "@libp2p/mdns": "12.0.16",
    "@libp2p/noise": "^1.0.1",
    "@libp2p/peer-id": "^6.0.6",
    "@libp2p/tcp": "^11.0.15",
    "@libp2p/upnp-nat": "4.0.15",
    "@libp2p/yamux": "^8.0.1",
    "@modelcontextprotocol/sdk": "^1.29.0",
    "@mozilla/readability": "^0.6.0",
    "@multiformats/multiaddr": "^13.0.1",
    "@noble/hashes": "^2.2.0",
    "@scure/bip39": "^2.0.1",
    "@xenova/transformers": "^2.17.2",
    "better-sqlite3": "^11.10.0",
    "chokidar": "^5.0.0",
    "fast-xml-parser": "^5.5.11",
    "libp2p": "^3.2.0",
    "linkedom": "^0.18.12",
    "neverthrow": "^8.2.0",
    "node-telegram-bot-api": "^0.66.0",
    "sqlite-vec": "^0.1.9",
    "tree-sitter": "0.21.1",
    "tree-sitter-python": "0.23.4",
    "tree-sitter-typescript": "0.23.2",
    "twitter-api-v2": "^1.29.0",
    "y-protocols": "1.0.7",
    "yaml": "^2.8.3",
    "yjs": "13.6.30",
    "zod": "^4.3.6"
  }
}

exec
/bin/zsh -lc "sed -n '1,220p' .gitignore" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
# dependencies
node_modules/

# build output
dist/
*.tsbuildinfo
docs/comps/

# logs
*.log
npm-debug.log*

# env
.env
.env.*
!.env.example

# akashik runtime state — per-user, never commit
.akashik/

# vector store
vectors.db
vectors.db-*

# python venv for graphify sidecar (Phase 1)
vendor/graphify/.venv/
__pycache__/
*.pyc
*.pyo

# editors / OS
.vscode/
.idea/
.DS_Store
Thumbs.db

exec
/bin/zsh -lc 'find akashik-rs -maxdepth 2 -type f | sort | head -n 80' in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
akashik-rs/.gitignore
akashik-rs/Cargo.lock
akashik-rs/Cargo.toml
akashik-rs/src/lib.rs
akashik-rs/src/main.rs

exec
/bin/zsh -lc "sed -n '1,220p' docs/PROJECT-PLAN-AKASHIK.md" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
# Akashik — project plan

This is the engineering+launch plan for the next 30-60 days, anchored
in the Round 5 octopus-discover recommendation (verbatim: "next
engineering month on AkashikBench-F and federation routing; next
marketing month on a 100-person pilot in the local-AI / agent-tooling
OSS ecosystem"). The product has pivoted from "agent-memory product"
to "federated knowledge commons for the open-source community" and
the brand is now Akashik — the codebase is still `akashik` and
will remain so during the two-name period. The architecture
([how-akashik-works.md](./marketing/how-akashik-works.md)) is the
credibility anchor for the mission; AkashikBench-F is the only
instrument that can falsify or validate the compounding thesis
empirically.

## Status snapshot (2026-05-26)

AkashikBench-F was scaffolded today
([tests/bench-akashik-federation.test.ts](../tests/bench-akashik-federation.test.ts)
+ [src/domain/federation-sim.ts](../src/domain/federation-sim.ts))
and produced positive signal on the LoCoMo factual subset:
`compoundingSlope = -4.74e-5` (negative = network is learning),
`web_fallback_rate` trajectory monotonically falls over the
simulated horizon. This is in-simulator only — a pure boolean-set
abstraction over real retrieval — so it validates dynamics, not
end-to-end retrieval quality. Real-pilot validation is pending.
Codebase is still named `akashik`; brand is Akashik; the
rename PR is a separate workstream queued behind launch. LongMemEval-S
R@5 = 0.9268 (with E11 enrichment), LoCoMo R@10 = 0.725 (with E11);
the local read-path is at its practical ceiling and further per-peer
retrieval tuning is explicitly de-prioritised below.

## Phase 24 — Federation infrastructure (next engineering month)

The Round 5 verbatim recommendation: spend this month on
AkashikBench-F + federation routing because validating the
compounding network effect is the only way to prove the product's
core differentiator. Concrete deliverables:

- **24.1 AkashikBench-F parameter sweep.** Run the existing simulator
  across the grid `shard ∈ {0.02, 0.05, 0.10, 0.20}` ×
  `offline ∈ {0.0, 0.2, 0.5}` × `peers ∈ {5, 10, 25, 50}` ×
  `zipfAlpha ∈ {0.5, 1.0, 1.5}`. For each cell, report
  `compoundingSlope`, `propagationHalfLife.median`,
  `propagationHalfLife.never`, and the
  `local / federation / web` fraction breakdown. Success criterion:
  `compoundingSlope < 0` across ≥ 80% of plausible (shard ≤ 0.10,
  offline ≤ 0.5) configurations. Identify the regime boundary
  where compounding fails so we know what we're betting on.
  Deliverable: results table in
  `docs/research/akashik-bench-f-sweep.md` with a one-paragraph
  interpretation per axis.

- **24.2 Niche-evaporation mitigation (LOCKSS-style).** Today's bench
  surfaced `propagation.never = 76 / 103` documents — only a quarter
  of newly-introduced docs ever reach 50% peer coverage. This is
  Q6b in the Round 5 brief (niche evaporation). Implement
  rarity-aware caching: peers opt-in to caching room items below
  a popularity threshold (the inverse of BitTorrent rarest-first
  — peers proactively replicate the long tail that's at risk of
  evaporating). Add a `replicateBelowPopularity` knob to `SimConfig`,
  wire it into the cache-fill step in `runFederationSim`, and re-run
  the sweep to show the `never` count drops. Deliverable: simulator
  option + measured fix (target: `never` count cut by ≥ 50%
  without `compoundingSlope` going positive).

- **24.3 Federation routing (real wire).** Harden the existing
  `src/infrastructure/peer-transport.ts` (libp2p gossip + dial)
  and `src/application/federated-search.ts` (query fan-out +
  cross-peer transfer) so peers can actually exchange query results
  in production, not just in the sim. Includes:
  Ed25519-signed envelope verification on the receive path
  (already partially present — finish it), bounded timeouts on
  fan-out (Q4 availability-confounding mitigation), and the
  cache-fill side-effect (when peer B answers peer A, peer A
  writes the result to its own local graph signed by B's DID).
  Success criterion: 10-peer LAN integration test shows a query
  resolved by federation lands signed-by-source on the asking
  peer's local graph and is hit-locally on the next ask.

- **24.4 `web_fallback_rate` telemetry pipeline.** Per Round 5
  priority matrix (high impact, low effort). Add a cardinality-safe
  counter to `src/domain/metrics.ts` (no `peer_id × room × entity_id`
  labels — the round-2 audit already warned this is a 500M-series
  bomb; we emit room-level aggregates only). Counter increments
  on `web` resolves, denominator on all resolves; daily snapshot
  written to the peer's local metrics ring. This is the live-network
  analogue of the simulator's `webFallbackRateOverTime`. Success
  criterion: per-room daily snapshot, queryable from CLI, integrates
  cleanly with the existing `metrics bypass` audit path.

- **24.5 Operational hardening — top 3 of the Round 4 blocker list.**
  Three of the eight launch blockers from
  [round-4 synthesis](./research/octopus-discover/round-4-2026-05-26/synthesis.md)
  are picked up here; the other five get explicit defer-to-Phase-26
  notes below.
  - **CLI ↔ daemon IPC auth** (Round 4 finding A): the local
    socket has no workload identity today; a compromised process
    can impersonate the CLI. Add a per-session token in
    `src/daemon/ipc.ts` written to `~/.akashik/ipc.token`
    with `0600` perms; CLI reads + sends on every call; daemon
    rejects unauth'd connections. Success: integration test
    confirms unauth'd socket connect is rejected with
    `IpcAuthError`.
  - **Cache invalidation staggering** (Round 4 finding B):
    today's 60s TTL flush-everything-at-once is a thundering-herd
    risk. Add jitter `±20%` to the TTL per cache key in
    `src/domain/hot-cache.ts` and `src/daemon/ipc-handlers.ts`;
    benchmark shows no synchronized miss bursts under simulated
    load.
  - **CI supply chain** (Round 4 finding F): `npm ci` +
    `scripts/bootstrap.sh` run before the provenance step,
    so a malicious dep can exfiltrate `GITHUB_TOKEN` /
    `NPM_TOKEN`. Pin all transitive deps via lockfile-only
    install (`npm ci --ignore-scripts` + explicit allowlist of
    postinstall scripts), and move secret-bearing steps after
    bootstrap. Success: CI run with a synthetic-malicious dep
    cannot reach the publish step.

## Phase 25 — Pilot launch (next marketing/launch month)

Per Round 5's smallest-viable launch plan: seed the local-AI /
agent-tooling ecosystem because their high-frequency debugging
queries make compounding visible within 30 days. The brutal
tradeoff is acknowledged in the Round 5 brief: "temporarily
pigeonholes Akashik as 'niche debugging tool' — but guarantees
high query overlap so compounding shows up fast." Worth it.

- **25.1 Seed content curation.** Assemble 50-80 canonical artifacts
  covering the local-AI ecosystem's recurring pain points: GitHub
  issues on CUDA OOM (ollama, vllm, llama.cpp), Apple Silicon Metal
  perf threads, vLLM PagedAttention PRs, quantization comparison
  papers (GPTQ, AWQ, GGUF), aider context-window strategies, etc.
  Each artifact saved via `akashik save --type research` from
  a librarian's peer (so provenance lands signed by a real maintainer,
  not the project itself). Deliverable: `docs/marketing/seed-corpus-pilot.md`
  listing every artifact with its URL, librarian, and room.

- **25.2 Librarian onboarding (5-10 maintainers).** Specific named
  maintainers in `llama.cpp`, `ollama`, `vllm-project/vllm`, and
  `aider` ecosystems. These people seed the graph in week 1 of
  the pilot. Target list (to be confirmed by 1:1 outreach):
  - `ollama` — Jeffrey Morgan + 1 maintainer
  - `vllm-project/vllm` — Zhuohan Li + Woosuk Kwon (or proxies)
  - `llama.cpp` — Georgi Gerganov is unlikely; a top-N contributor
    is the realistic target
  - `aider` — Paul Gauthier
  - Plus 3-5 independent ML/agent-tooling builders with strong
    OSS bona fides
  This is the contribution-graph problem — we cannot list certainty
  here; the deliverable is a *contacted* list with yes/no/pending
  status by end of week 1.

- **25.3 Cohort onboarding (80-90 early adopters).** Weeks 2-3 of
  the pilot per Round 5. Recruitment channels: Hacker News (one
  Show HN post), the `r/LocalLLaMA` subreddit, LocalLLM Discords,
  and the maintainers' own audiences. Onboarding artifact is a
  90-second video walkthrough + `npm install -g akashik` +
  `akashik share` to join the pilot rooms. Success criterion:
  ≥ 80 active peers (defined as: ≥ 1 query in past 7 days) by end
  of week 3.

- **25.4 Measurement & report.** Week 4 publishes the live
  `web_fallback_rate(t)` trajectory across the cohort, using
  the 24.4 telemetry pipeline. This is the empirical anchor
  that validates or falsifies the federated thesis under real
  churn — the same chart the simulator produces, but on real
  peers, real queries, real offline rates. Deliverable:
  `docs/research/pilot-30-day-report.md` with the
  trajectory, propagation half-life on real-pilot data, the
  `local / federation / web` fraction breakdown, and an explicit
  pass/fail verdict on the compounding hypothesis. If the line
  doesn't fall measurably, we publish that too — the Q8
  counter-argument is fair-game and we promised to answer it
  empirically.

## Phase 26+ — Operational maturity (deferred Round 4 findings)

The five Round 4 launch blockers that don't gate the pilot but
do gate enterprise / SOC2-grade adoption. Each gets a deliberate
phase slot, not a hand-wave:

- **26.1 Schema migration quarantine** (Round 4 C). When a peer
  with an older schema federates with a peer on v2, malformed
  nodes are dropped silently. Add a `quarantine` table in the
  peer's SQLite, persist rejected envelopes with the parser error,
  and expose `akashik quarantine list / replay` so operators
  can recover post-migration. The right time to ship this is
  immediately after the pilot when we'll have actual cross-version
  traffic.

- **26.2 Observability for federated search** (Round 4 D). The
  current cardinality-safe metric design is correct but
  under-instrumented for ops — when fan-out degrades, the
  operator can't tell which peer / room is the cause.
  Mitigation: per-room (not per-peer) histograms for fan-out
  latency, federation hit rate, dial failures; emitted as
  structured logs the operator can grep, not as Prometheus
  labels.

- **26.3 Runbooks for split-brain / dial-storms / index corruption**
  (Round 4 E). Today's bus-factor is 1; the runbook deliverable
  is `docs/runbooks/{split-brain.md, dial-storm.md, index-corruption.md, peer-key-rotation.md}`
  with reproducible recovery commands. Drives toward bus-factor ≥ 2
  via documentation, not just hiring.

- **26.4 HTTP-style auth error taxonomy** (Round 4 G). Domain
  errors today (`PeerDialError`, `ShareError`) are too granular for
  MCP clients to decide retry vs abort. Add a coarse `category`
  field — `unauthorized | forbidden | rate-limited | unavailable | bad-request`
  — alongside the precise error name. Clients route on the category;
  humans debug from the precise name.

- **26.5 SOC2-grade exfiltration audit trails** (Round 4 H).
  Today peers federate queries autonomously; an enterprise
  auditor cannot prove what proprietary IP left the local machine.
  Mitigation: append-only signed audit log of every outbound
  federation query with `(timestamp, room, query-hash, target-peer-set)`;
  optional WORM export. This is enterprise gating, not pilot
  gating.

exec
/bin/zsh -lc "sed -n '1,220p' docs/marketing/how-akashik-works.md" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
# How Akashik works

The shortest accurate description of the mechanism that makes
Akashik possible. Written for the reader who has heard "federated
knowledge graph" and wants to understand *exactly* what's
distributed, *what* gets cached, *when* the network reaches out
to the web, and *who* ends up holding which piece of the record.

This is the architecture, not the marketing copy. The marketing
copy lives in [`storybrand-messaging-draft.md`](./storybrand-messaging-draft.md).

## The one-paragraph version

Each Akashik peer holds **only its own information** — what its
user contributed, what it pulled from other peers in response to
its user's questions, and what it researched on the web when the
federation couldn't satisfy a query. When you ask Akashik
something, it asks your local graph first, then asks every peer
you're federated with for *their two cents*. If the federation
can't answer with confidence, the harness reaches out to the web,
finishes the research, and **saves the result locally on the peer
that asked** — that peer becomes the "ambitioned" curator of that
piece of knowledge. The *next* user who asks a similar question
gets that research transferred from the ambitioned peer (if
they're online), without anyone having to know it existed. Every
query is a potential cache-fill, every web-fetch becomes someone's
local commons, and the network's working set grows by *what its
contributors are curious about* — not by what a central planner
decided to ingest. **Time-to-answer drops every time anyone in
the network does work.** That compound is the entire mission.

## The mechanism in five steps

```
                ┌─────────────────────────────────────────────────┐
                │  USER A asks: "How does mxbai-rerank compare    │
                │   to cross-encoder on long contexts?"           │
                └─────────────────────────────────────────────────┘
                                    │
                                    ▼
   ─── STEP 1 ─────────────────────────────────────────────────
       Query A's LOCAL Akashik graph
       Hit?  → return; done. (Cheapest path. Zero network.)
       Miss? → continue.
   ────────────────────────────────────────────────────────────
                                    │
                                    ▼
   ─── STEP 2 ─────────────────────────────────────────────────
       Fan out to connected PEERS in A's shared rooms
       Each peer answers with "two cents" — whatever they've
       saved or previously researched that matches.
       Results merge via RRF into a candidate set.
   ────────────────────────────────────────────────────────────
                                    │
                                    ▼
                   ┌────────────────┴───────────────┐
                   │ Federation answered?           │
                   │  ├── Yes (confident) → return  │
                   │  └── No (or low confidence)    │
                   └───────────────┬────────────────┘
                                    │
                                    ▼
   ─── STEP 3 ─────────────────────────────────────────────────
       Harness performs WEB RESEARCH on A's machine
       (WebSearch / WebFetch / arxiv pull / etc.)
       This is the only time the network reaches outward.
   ────────────────────────────────────────────────────────────
                                    │
                                    ▼
   ─── STEP 4 ─────────────────────────────────────────────────
       Result is SIGNED BY A and saved to A's local graph
       A becomes the "ambitioned" curator of this knowledge.
       Provenance: A's DID, timestamp, source URLs, room.
   ────────────────────────────────────────────────────────────
                                    │
                                    ▼
   ─── STEP 5 ─────────────────────────────────────────────────
       Later, USER B asks a similar question
       Federation fan-out reaches A's peer (if online)
       A's research transfers to B with original attribution
       Cost of the research: paid once, by A. Benefit: ∞.
   ────────────────────────────────────────────────────────────
```

## What each peer actually stores

| Bucket | Contents | Source |
|---|---|---|
| **Self-contributed** | Things the user explicitly saved (`akashik save <url>`, codebase indexing, manually-typed notes) | The user |
| **Pulled** | Nodes received from federated peers in response to the user's own queries | Federation, with provenance |
| **Researched-on-miss** | Web research results that were fetched on the user's machine because the federation couldn't satisfy a query | Web, attested by the curator |
| **NOT stored** | Anything other peers saved that this user never asked about | — |

The fourth row is the key. No peer holds the global graph. There
is **no global graph**. Each peer's local store is exactly the
slice that's been pulled into use through that user's curiosity
plus their direct contributions. This is what makes it scale to
the whole open-source community without becoming someone's
2-terabyte sync nightmare.

## Why "ambitioned" matters

When User A's query triggers web research, A's machine does the
fetching, A's machine does the embedding, and A's local graph
stores the result. **A is now the ambitioned curator** of that
particular piece of knowledge for the network.

This matters for four reasons:

1. **Provenance lives where the work happened.** The reader who
   queries A's research six months later sees A's DID, A's room,
   the date, the source — not a faceless "Akashik says". Knowledge
   has authors.
2. **Cost lives where the curiosity was.** A paid the network
   roundtrip + the web fetch. B, C, D who query later pay
   nothing. The "ambitioned" framing is the natural answer to
   "who pays for the compounding?" — the curious user pays once,
   the community benefits forever.
3. **Trust is graph-traversable.** If you don't trust the
   research, you can follow the chain: who curated it, who they
   are, what room they're in, what they linked to. There's no
   "trust the platform" because there's no platform.
4. **Curiosity drives the network's working set.** The faster a
   topic gets queried, the more peers end up with it cached. The
   network's hot data is exactly what the community is currently
   curious about. Nobody has to plan ingestion; the curiosity of
   the contributors plans it.

## What happens when a peer goes offline

This is the honest trade-off and we don't paper over it.

If User A is offline when User B asks a question only A's local
graph holds:

- B's local-first query misses (A's research isn't on B's disk).
- B's federation fan-out reaches A's peer ID but gets no response
  (A is offline).
- B falls through to web research themselves.
- B is now an ambitioned curator of their own version of that
  research.
- Some duplication. Some redundancy. Both A and B now hold
  attestable versions of the same investigation.

Two notes:

- This is fine and arguably *good*. Multiple independent curations
  of the same topic strengthen the record (more provenance, more
  perspectives).
- Mitigations exist for popular topics: peers can opt into
  caching anything that crosses a "frequently queried" threshold
  in their room. The default is "cache only what I asked for";
  the opt-in is "also cache the room's hot items".

This is identical to the property every decentralized system has:
**availability follows participation**. Akashik doesn't pretend
otherwise.

## Why this beats every existing alternative

Other "shared memory" or "team knowledge" products try to be a
single source of truth and either need a central server, a
sync daemon, or full replication of the entire graph on every
node. All three are wrong for the OSS community as a whole:

| Approach | Problem |
|---|---|
| Central server (Notion, Slack, "team memory" SaaS) | Vendor owns the data; pricing/privacy changes can lock you out; doesn't scale to community-of-millions ownership |
| Full-graph replication on every node | Disk cost compounds linearly with community size; new joiners face a multi-GB-to-multi-TB sync; trivially DoS-able by spam contributions |
| Per-room private CRDTs (Roam-style multiplayer) | Closed by default; doesn't compound across rooms; no path to community-wide commons |

Akashik's **"each peer holds only what it has asked for or
contributed"** model neatly avoids all three. The community's
knowledge is replicated *to the precision of demand* — popular
items get cached on many peers, fringe items live on one peer
with original provenance, and disk cost on every peer scales with
*that peer's own curiosity*, not with the community's total
contribution volume.

## Compounding, stated formally

For any topic `T` in the network:

- Let `Q(T, t)` = number of times anyone has asked about `T` by
  time `t`.
- Let `R(T, t)` = number of peers currently holding a cached
  answer for `T` at time `t`.

Then by construction:

```
R(T, t) ≤ Q(T, t)
```

(R grows by 1 each time a previously-uncached peer asks about T
and pulls it.) The interesting property:

```
expected_time_to_answer(T)  ~  1 / R(T, t)
```

The more peers cache `T`, the faster the next query lands. And
`R(T, t)` is **monotonically non-decreasing** under the
mechanism — it only grows. Knowledge that's been
researched anywhere in the network gets faster to retrieve
everywhere.

This is the compounding. It's not a marketing claim; it's a
property of the architecture.

## Privacy: who sees what

| Type of data | Who sees it |
|---|---|
| Your local contributions in a public room | Anyone federated in that room can pull on query |
| Your local contributions in a private room | Only peers you've explicitly shared the room with |
| Your queries | Local to you; the federation sees only what you choose to fan out |
| Web research you did to satisfy your own query | Saved locally; shared via your peer ID with the room you queried from |
| Anything you never saved or researched | Doesn't exist on your peer; nothing to leak |


exec
/bin/zsh -lc "sed -n '1,220p' docs/marketing/storybrand-messaging-draft.md" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
# Akashik — brand messaging, StoryBrand 7-prompt pass

Draft website copy generated by running the StoryBrand 7-prompt
workflow (`marketing/storybrand-messaging-engine.md` in the
`SaharBarak/skills-and-workflows` repo) against Akashik's actual
mission. Captured 2026-05-26.

**Brand name:** Akashik (formerly project codename `akashik`).
The name borrows from the **Akashic Records** — the mythological
compendium of all knowledge ever held by the human collective —
and reframes the idea as concrete, contributor-owned infrastructure:
a federated, cryptographically-attested record that the open-source
community writes for itself.

**Mission anchor (the only anchor that's correct):** Akashik is
**the federated knowledge commons for the open-source community
as a whole**. Not a personal-memory product (mem0/agentmemory/
ByteRover already do that). Not a team-collaboration tool (Slack/
Notion/Roam already lock that down). The mission is to give the
OSS community what it has always lacked: a shared, contributor-
owned memory substrate where every piece of reading, debugging,
and figuring-out **compounds** into the community's collective
progress — generation after generation, signed and attributed,
forever.

Brand voice: pragmatic engineer with reverence for the mythology.
The Akashic Records reference is an undertone, not a costume.

---

## Prompt 1 — Hero Identifier

**Business (one sentence):**
> Akashik is a peer-to-peer knowledge graph protocol for the
> open-source community — a federated, contributor-owned record
> where every researcher, maintainer, and engineer adds their
> reading and reasoning, and where every newcomer can query
> what the community has already learned before re-treading the
> same path.

**Ideal customer:**
> Open-source maintainers, indie researchers, ML practitioners,
> hobbyist builders, security researchers, anyone working in
> public who has been frustrated watching the same problems get
> solved in parallel by hundreds of people across the community
> — because the knowledge between the code (what we read, what
> we figured out, what we learned together) has no shared
> infrastructure.

**Dominant survival-level desire** (not a list of wants):
> Compounding. They want the hours they spend reading and
> figuring things out to **pay forward** — to the next person
> in the community who hits the same wall, to the next
> generation of contributors who would otherwise re-tread the
> same path. The open-source ethos has always been about making
> your work matter beyond yourself; Akashik is the natural
> extension to *knowledge* work itself.

**Website opening line (no cleverness, no brand name):**
> **The community already learned this. Read the record.**

---

## Prompt 2 — Three-Layer Problem Mapper

**External problem (the customer can name this):**
> "Every time I dig into a new topic, I rediscover things
> hundreds of people in this community already figured out. The
> answers exist — in dead blogs, in lost Discord threads, in
> someone's local Obsidian — but they're not retrievable from
> outside the original author's head."

**Internal problem (the frustration underneath):**
> "My reading hours don't compound. I figure something out,
> write notes only I'll see, and three months later someone
> else burns the same weekend solving the same problem. We're
> all doing the same work in parallel — and the community has
> no mechanism to remember any of it."

**Philosophical problem (the injustice they feel):**
> "Open source built the freest software stack in history
> because we shared *code*. We built CRAN, npm, PyPI, GitHub,
> arxiv — knowledge infrastructure that compounds. But for
> everything *between* the code — what we read, what we
> figured out together — we have *nothing*. Each generation of
> OSS contributors starts over. That's not how open source is
> supposed to work."

**Three test subheadlines (one per layer):**
- External — `Stop rediscovering what your community already solved.`
- Internal — `Your reading hours should compound. They don't.`
- Philosophical — `Open source built the world's code stack. Time to build the knowledge stack.`

---

## Prompt 3 — Empathy-Authority Positioner

**Empathy statement (mirrors the internal problem, not generic):**
> You spent last weekend learning something — a paper, a tool,
> a technique. Two months from now, someone in your community
> will burn the same weekend learning the same thing, because
> your notes and your blog post and your tweets aren't
> queryable by them. You'd love to compound that knowledge
> forward. You just don't have a mechanism.

**Three authority proof points to display:**
1. **Compounding by construction — not by promise.** Each peer
   holds only what its user has asked for or contributed. When
   the federation can't answer a query, the harness does web
   research on the asking peer's machine, and the result is saved
   *there*, cryptographically signed by that user. The next
   contributor who asks a similar question pulls the cached
   research from that "ambitioned" peer — paying nothing for work
   that was done once. The network's working set grows by what
   the community is curious about. See [how Akashik
   works](./how-akashik-works.md) for the architecture.
2. **Every contribution is cryptographically signed** —
   Ed25519-attested decentralized identifiers (DIDs). Knowledge
   compounds *with provenance*: every record in the federation
   carries the curator's signature, room, source URLs, and
   timestamp. The community sees who figured out what, and
   when — forever, without "trust the platform" being part of
   the contract.
3. **Runs on commodity hardware. The whole community can run a
   peer.** Every component (Xenova ONNX embedders, sqlite-vec,
   the Rust embed-server) is reproducible from public sources.
   A $7/mo VPS, a laptop, a Raspberry Pi. Disk cost on each
   peer scales with *that peer's own curiosity*, not with the
   community's total contribution volume — so the record can
   actually be community-of-millions sized.

**Guide introduction (2 sentences, leads with empathy, closes with authority — About-page copy):**
> We watched open source build the freest software stack in
> history through distributed collaboration — but the knowledge
> *above* the code (what we read, what we learned, what we
> figured out together) never got the same infrastructure.
> Akashik is the protocol the community has been missing: a
> federated, cryptographically-attested record where every
> contributor's reading compounds into every other contributor's
> progress.

---

## Prompt 4 — Clarity Plan Builder

**Process Plan (3 steps, how a contributor joins the federation — each ≤5 words):**
1. Run an Akashik peer.
2. Save what teaches you.
3. Federate. Compound. Continue.

**Agreement Plan (4 commitments that eliminate buying fears):**
- Always open protocol.
- Your contributions, signed by you.
- No central server. Ever.
- Provenance preserved forever.

---

## Prompt 5 — Action Trigger

**Direct CTA (3-5 words, action verb first — invites contribution):**
> **Run your first peer**

**Transitional CTA (free resource concept):**
> **Browse the record** — see what the community has already
> contributed, signed and attributed. (Public peers expose
> read-only browse-by-room.)

**Button placement strategy:**
- Direct CTA appears 3× on the homepage:
  1. Top-right (sticky header, all pages)
  2. Center-fold (right after the hero subheadline)
  3. End of every doc page
- Transitional CTA appears 3× more gently:
  1. Below the hero (alternative path for not-yet-ready visitors)
  2. Sidebar on docs pages
  3. Footer
- Direct CTA leads visually — invitation first, value-first
  fallback second.

---

## Prompt 6 — Stakes Amplifier

**What specific negative outcome happens if they do nothing?**
> The community keeps rediscovering. Every new generation of
> OSS contributors starts over. Knowledge that wants to be free
> stays locked in fragmented decaying surfaces — dead blogs,
> deleted tweets, abandoned Discord servers. Search engines
> decay. SEO spam wins. The collective intelligence the
> community *could* have, simply isn't.

**What does the community look like in 6 months without solving this?**
> The same problems get solved another hundred times by another
> hundred people. The same papers get re-explained in another
> fifty blog posts that will 404 within a year. AI assistants
> trained on the community's knowledge from two years ago can't
> answer questions about anything new the community has actually
> figured out. The community keeps *generating* more knowledge
> than it *accumulates*.

**What's the cost of inaction in dollars, time, or status?**
- Person-years of redundant rediscovery, every week, across
  thousands of contributors
- Loss of provenance — work gets recycled without attribution,
  contributors burn out unrecognized
- Erosion of the OSS knowledge commons as every alternative
  substrate (blogs, tweets, Discord, wikis) continues to decay

**Stakes paragraph (for the sales page):**
> Every week the open-source community doesn't have a shared
> memory layer, the same problems get solved in parallel by
> hundreds of people, the same papers get re-explained in posts
> that will 404 within a year, and the same lessons get
> forgotten as old contributors burn out and new ones start
> over. We built the freest code stack in history. We can build
> the knowledge stack too — or we can let the community's
> collective progress keep evaporating, blog post by blog post,
> conversation by conversation.


exec
/bin/zsh -lc "sed -n '1,220p' docs/research/beat-the-competitors-retrieval-plan.md" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
# How Akashik beats the retrieval leaderboard (forward plan)

**Status:** strategic sketch — Phase 24 candidate ratchets
**Drafted:** 2026-05-21
**Anchor numbers (Phase 23.7+ measured):**
| Benchmark | Akashik | Competitor best | Gap |
|---|---:|---:|---:|
| LongMemEval-S R@5 (50-distractor, n=500) | **0.9202** | agentmemory 0.952, ByteRover 0.928 | -3pp / -0.6pp |
| LongMemEval-S R@5 (oracle) | 0.9990 | (at ceiling) | — |
| BEIR SciFact NDCG@10 (5,183 docs × 300 q) | **0.7202** | ColBERTv2 SOTA ~0.7522 | -3pp |
| LoCoMo harmonic-mean (n=699, retrieval-only) | 0.3536 | mem0 0.925 (LLM-judge) | not comparable |
| LoCoMo SQuAD-F1 (qwen2.5:1.5b extractor) | 0.1602 | (no published SQuAD-F1) | new axis |

The honest read: we are **0.6pp** below ByteRover, **3pp** below agentmemory, on the actual public LongMemEval-S benchmark — retrieval-only, no LLM judge. That gap is closeable.

## 1. Loss analysis — where the points actually live

Per-question-type R@5 on LME-S 50-distractor (n=500):

| Question type | n | R@5 | Headroom |
|---|---:|---:|---:|
| single-session-assistant | 56 | 1.000 | 0 |
| knowledge-update | 78 | 0.974 | ~2 pts |
| multi-session | 133 | 0.905 | ~10 pts |
| temporal-reasoning | 133 | 0.871 | ~13 pts |
| single-session-preference | 30 | 0.867 | ~13 pts |

**Where the recoverable mass is:**

1. **multi-session (0.905, 133 q)** — needs evidence from ≥2 sessions in top-5. Single-shot retrieval can't always grab both. Bi-encoder cosine doesn't compose well across hops.
2. **temporal-reasoning (0.871, 133 q)** — "earliest / latest / before X" doesn't naturally rank by date in vector space. Time is implicit at best.
3. **single-session-preference (0.867, 30 q)** — preferences stated once with different vocabulary than the question uses. Pure semantic gap.

Note small-N caveat on single-session-preference (30 q) — one bad retrieval costs 3.3pp.

## 2. Inventory — what's already in the codebase

Primitives that exist but are NOT in the bench retrieval path:

| Primitive | Where | Bench-path? | Note |
|---|---|---|---|
| Cross-encoder rerank (ms-marco-MiniLM-L-6-v2) | `src/application/ask.ts:436-441` + `src/domain/cross-rerank.ts` | **No** | Gated behind `AKASHIK_RERANK=1`; benches call `searchByRoom` directly, bypass `ask()` |
| Personalized PageRank rerank | `src/application/ask.ts:444` | **No** | Same — only in `ask()` |
| Mention enrichment (`buildHit`) | `src/application/ask.ts:448` | **No** | Same |
| Cross-room federated search | `src/application/use-cases.ts` | **No** | Benches scope to one room |
| Binary-quantized hot cache | `src/domain/binary-quantize.ts` | No | Hot-cache layer for query latency, not quality |
| Hyperbolic embeddings | `src/infrastructure/embedders.ts` | No | Experimental Phase 22+ |
| LLM extractor (Phase 23.8) | wired into `bench-locomo-real` | partial | LoCoMo-only |

Primitives that don't exist yet but would lift the gap:

- HyDE query expansion
- Multi-query expansion (RAG-Fusion-style 3-5 reformulations + RRF)
- Iterative multi-hop retrieval (retrieve → entity-extract → re-retrieve)
- Time-aware reranking for temporal queries
- Fine-tuned bi-encoder on held-out LongMemEval domain
- Late-interaction retrieval (ColBERTv2-style)

## 3. Experiment menu — impact / effort matrix

Ranked by `(expected lift on LME-S R@5)/(implementation hours)`:

| # | Experiment | Lift estimate | Effort | Rationale |
|---|---|---:|---|---|
| **E1** | **Wire cross-encoder rerank into the bench path** | **+2 to +5pp** | **1-2 h** | ms-marco MiniLM rerank typically lifts NDCG@10 by 3-8 points on BEIR; should generalize. Code already exists, just not invoked. |
| **E2** | Upgrade embedder: all-MiniLM-L6-v2 → bge-base-en-v1.5 (768-dim, top-MTEB) | +3 to +6pp | 1 h | Single-line model change. BGE-base on SciFact = 0.7308 NDCG@10 vs all-MiniLM 0.6440 (BEIR table). |
| **E3** | Upgrade to nomic-embed-text-v1.5 (768-dim, **8192-ctx**) | +2 to +5pp | 1 h | The 8192-ctx eliminates silent truncation on multi-session conversational evidence. Long context = better recall on `multi-session` and `temporal-reasoning` types. |
| **E4** | HyDE: Ollama-generate synthetic answer per question, embed + retrieve | +2 to +4pp | 4-6 h | Highest impact on `single-session-preference` (rephrasing gap). Reuses existing Ollama client. Adds ~500 LLM calls/bench. |
| **E5** | Multi-query expansion (3 reformulations + RRF fuse) | +1 to +3pp | 3-4 h | Helps `multi-session` by hitting different facets. Adds 3× retrieval cost. |
| **E6** | Time-aware reranking when query contains temporal keywords | +3 to +6pp on temporal subset | 2-3 h | Targeted at `temporal-reasoning` (0.871). Detect "earliest / latest / before / after / first / last" → boost by date. |
| **E7** | Iterative two-hop retrieval (entity extract → re-retrieve) | +3 to +5pp on multi-session | 6-8 h | Largest theoretical win for `multi-session`. Requires entity extraction at query time. |
| **E8** | Fine-tune bi-encoder on held-out LME pairs | +5 to +10pp | 2-3 days | Highest absolute lift but requires GPU + train infra. Risk: overfits to LME, regresses BEIR. |
| **E9** | Activate PPR rerank in bench (already wired in `ask`) | +0 to +2pp | 1 h | Free if E1 is done — both come together by routing through `ask()`. Per HANDOFF the PPR is in `ask.ts`; same bypass issue. |

## 4. Recommendation — bench-doable in ~1 day

**The plan that lands inside this week:**

```
E1 + E9 (route benches through ask())  →  +2-5pp     1 day  ← first
E2 (BGE-base embedder)                  →  +3-6pp    1 day  ← second
E3 (nomic-embed for long context)       →  +2-5pp    1 day  ← OR vs E2

Combined plausible end-state:
  LongMemEval-S R@5      0.9202  →  0.96-0.98   (beats agentmemory 0.952)
  BEIR SciFact NDCG@10   0.7202  →  0.78-0.82   (beats ColBERTv2 0.7522)
```

If those land, **Akashik becomes the published-leaderboard leader on LME-S** with a fully open-source, CPU-only, retrieval-only pipeline. No LLM judge, no GPT-4 reasoning loop, no closed-weight model — just a clean hybrid sparse+dense+rerank+graph pipeline that beats the proprietary stacks.

**E4 / E5 / E6 / E7** are second-wave once E1–E3 are measured. They target the *remaining* loss after the easy wins — by then we'll know which question types are still bleeding.

**E8 (fine-tuning)** is the nuclear option. Park it. We don't need it to hit SOTA.

## 5. First-experiment design (E1: cross-encoder rerank in bench path)

Concrete diff:

```
// In each bench-*-real.test.ts, around the searchByRoom call:
//
// Today:
//   const r = await searchByRoom({ graphs, vectors, embedder })({ room, text, k: K });
//
// E1 path — pull rerank into the test:
//   const reranker = process.env.AKASHIK_RERANK === '1'
//     ? crossEncoderFromEnv() : null;
//   const r0 = await searchByRoom({ graphs, vectors, embedder })({ room, text, k: K * 4 });  // 4x candidates
//   const matches = r0._unsafeUnwrap();
//   const reranked = reranker
//     ? (await rerankMatches(text, matches, docTextOf, reranker))
//         .map((xs) => xs.slice(0, K))
//     : ok(matches.slice(0, K));
```

Run with `AKASHIK_RERANK=1` env on the Hetzner box. Compare against today's 0.9202 number. If lift is real, ship.

**Risk:** cross-encoder adds ~10ms/match latency. With K=5 reranked from 20 candidates, that's 200ms/query × 500 q = 100s added to LME-S run. Cheap.

**Risk #2:** the ms-marco model might underperform on conversational LongMemEval — it was trained on web-search pairs. If E1 underdelivers, fall back to E2/E3 first.

## 6. Stretch — Phase 24 candidates

Once leaderboard-leading on retrieval, the next frontier is **hybrid retrieval + LLM extraction with SQuAD-F1 + LLM-judge as competing axes in the composite**. That makes Akashik comparable to mem0's 92.5 LoCoMo composite — different scoring philosophy, head-to-head. Phase 23.8 already laid the SQuAD-F1 foundation; Phase 24 adds the judge axis.

Beyond that: **federated retrieval** (the unique Akashik bet) — measure how P2P-shared rooms across multiple peers lift recall on out-of-distribution questions, vs single-peer baselines. No public benchmark covers this today; we'd publish one.

---

## 7. Multi-LLM research update (2026-05-21 — Octopus discover, 6 probes)

After running this brief through claude-octopus `discover -P` (Codex × 2 + Claude-sonnet × 2 + Gemini × 2), the synthesis surfaced **three high-ROI techniques that were missing from my E1-E8** plus several revisions to the existing plan. The key conceptual shift: I was thinking purely *read-path*; write-path interventions compound with all read-path techniques at **zero query-time latency**.

### 7.1 Three new candidates — should rank above several of my originals

| # | Technique | What it is | Targets | Lift est. | Effort |
|---|---|---|---|---:|---|
| **E10** | **Temporal Query Gate + recency-disable** | Classifier detects temporal queries ("when", "before", "earliest", "latest", "first", "last"). For matched queries, disable recency boost and substitute a temporal-distance scorer over date metadata. | temporal-reasoning **13pp** | +5–10pp on temporal subset | 2-3 h |
| **E11** | **Rule-based contextual enrichment (write-path)** | Prepend structured metadata (date, room/persona, participants, top-K extracted entities) to each session's text *before* embedding. Like Anthropic's Contextual Retrieval but rule-based — no LLM call, zero ingest cost beyond regex/NER. | multi-session **10pp**, temporal **13pp** | +3–5pp aggregate | 3-4 h |
| **E12** | **Write-path contradiction chains (`superseded_by`)** | mem0-style write-time classifier marks older conflicting preference nodes as `superseded_by` newer ones. At query time, filter or down-weight superseded nodes. Solves stale-preference pollution structurally. | single-session-preference **13pp** | +5–10pp on preferences | 4-6 h |

All three are **write-path** — they pay their cost at consolidation/index time, not query time. They also compound with E1 (cross-encoder rerank) and E2/E3 (embedder swap) — no cancellation per the synthesis.

### 7.2 Revisions to E1-E8 based on the synthesis

- **E1 reranker model**: don't just activate `ms-marco-MiniLM-L-6-v2` — *also swap the model*. The ms-marco reranker was trained on web-search ranking pairs and is **domain-mismatched for conversational memory** (which resembles a semantic-entailment task). Universal recommendation across probes: swap to **`mxbai-rerank-base-v1`** or an NLI-based cross-encoder. Same activation work; better model. Effort still ~2 h.
- **E4 (HyDE)**: gate **off** for temporal and multi-session queries. Synthesis warns HyDE actively backfires in high-distractor environments — if the LLM hallucinates a wrong date or entity in the hypothetical document, dense search pulls in highly convincing false positives. Apply HyDE only to single-session and ambiguous-vocabulary queries.
- **Late-interaction (ColBERTv2 / PLAID)**: **abandon** as a primary retrieval path. The full-corpus late-interaction index doesn't fit the Hetzner CAX11 4GB RAM constraint and isn't a natural fit for `sqlite-vec`. Only viable form is `Jina-ColBERT-v2` as a **second-stage reranker** on top-20 candidates — and even then, projected lift is small on LME-S vs other options.
- **MTEB top models (gte-Qwen2-7B, NV-Embed-v2)**: **abandon** for inference; can't fit 4GB ARM. Stick with bge-base / nomic-embed for the embedder swap. Larger models could be used to *generate synthetic training pairs* offline (E8 territory).
- **SPLADE-v3**: don't pursue in the first wave. It would replace BM25 but the storage + ingestion cost is high (~30k-vocab sparse vectors, no native `sqlite-vec` support; needs a parallel inverted index). Defer until after E1-E3 + E10-E12 are measured.
- **CRAG / Self-RAG / reasoning-augmented retrieval**: defer. They inject LLM calls into the retrieval loop, breaking the "no LLM in hot path" stance. Useful only as fallback when initial retrieval confidence is low — Phase 25 candidate.

### 7.3 Updated top-3 sprint hit-list (replaces §4)

Revised after multi-LLM synthesis:

| Rank | Action | Targets | Lift est. | Effort | Why this order |
|---|---|---|---:|---|---|
| **1st** | **E1' (rerank wired + mxbai-rerank-base-v1)** | All types | +3-7pp | 2-3 h | Free lift; activates a code path already wired but bypassed; new model is a single ONNX swap. |
| **2nd** | **E11 (contextual enrichment)** | multi-session, temporal | +3-5pp | 3-4 h | Write-path → compounds with everything. Single-pass re-index of LoCoMo + LME-S sessions to validate. |
| **3rd** | **E10 (temporal query gate)** | temporal-reasoning **specifically** | +5-10pp on temporal subset | 2-3 h | Direct attack on our weakest large-N type. Pure routing logic, no model swap. |

**Plausible combined end-state after this sprint:**
```
LongMemEval-S R@5       0.9202  →  0.965-0.975   (clears agentmemory 0.952)
LongMemEval-S temporal  0.871   →  0.93-0.97     (closes 6-10pp of 13pp gap)
LongMemEval-S multi     0.905   →  0.94-0.96     (closes 3-5pp of 10pp gap)
BEIR SciFact NDCG@10    0.7202  →  0.75-0.79     (clears ColBERTv2 0.7522)
```

Then E12 (write-path contradiction) + the original E2/E3 (embedder swap) become the second-week sprint targeting single-session-preference and the BEIR ceiling.

### 7.4 Compound vs cancel — empirical notes from the synthesis

- ✅ **Compounds:** rerank ⊕ contextual-enrichment ⊕ temporal-gate ⊕ predecessor-chains. All operate on different stages.
- ✅ **Compounds:** embedder upgrade (bge / nomic) ⊕ cross-encoder rerank. Standard BEIR finding.
- ⚠️ **Cancels:** HyDE ⊕ high-distractor temporal queries → HyDE drags retrieval *down* by 2-5pp on those subsets. Must be query-type-gated.
- ⚠️ **Cancels:** ms-marco rerank ⊕ conversational queries → domain mismatch; swap to NLI/entailment-trained reranker.
- 📊 **Diminishing returns:** rerank + multi-query + HyDE + multi-hop all stacked → published systems plateau around +8-12pp combined over the bi-encoder baseline. We're already at 0.92 LME-S; absolute ceiling on this benchmark with retrieval-only is probably ~0.97-0.98.

### 7.5 Operational gaps the synthesis flagged (not retrieval-quality but worth filing)

These are Phase 25+ but worth recording so they don't get lost:

- **CI/CD checksum pinning** — `model-checksums.json` for the Xenova ONNX weights to prevent supply-chain attacks (the bge-base defective-conversion incident is the precedent).
- **2-minute regression smoke bench** — small subset of LME-S / SciFact in CI so quality regressions can't ship silently.
- **Bus factor on `akashik-rs`** — Rust ARM cross-compile is specialized knowledge; consider TypeScript-only fallback path.
- **GDPR derived-data semantics** — contextual enrichment + contradiction chains create *derived* personal data that must map back to source turns for delete-by-user compliance.

Source: `~/.claude-octopus/results/probe-synthesis-1779351019.md` — 6 multi-LLM probes synthesized by Gemini-2.5-Pro, 2026-05-21. Full transcript preserved in claude-octopus state.

exec
/bin/zsh -lc "sed -n '1,220p' docs/research/performance-prediction-matrix.md" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
# Performance prediction matrix — hardware × rerank tier

**Drafted:** 2026-05-24
**Anchors:** T1 diagnostic on Hetzner CAX11 ARM (R@5=0.9202, R@10=0.9687, R@20=0.9925, R@50=1.000) + E11 contextual enrichment (R@5=0.9268) + E1' null with `bge-reranker-base` (R@5=0.9202) + competitor public claims (ByteRover 0.928 @ 1.6s; mem0 0.925 with LLM judge; agentmemory 0.952).

## 1. Empirical floor and ceiling

Both anchors are *measured*, not predicted:

- **Recall floor**: R@5 baseline = 0.9202 (bi-encoder + RRF, no rerank, no enrich)
- **Recall ceiling at K=20**: R@20 = 0.9925 → a perfect reranker over the top-20 head lifts R@5 to 0.9925
- **Recall ceiling at K=50**: R@50 = 1.000 → with a listwise reranker that sees the full 50 candidates, the ceiling is 1.000

Anything above 0.9925 requires going beyond cross-encoder rerank (the cross-encoder only sees the top-20 head). Anything between 0.9202 and 0.9925 is achievable with the right cross-encoder. Anything between 0.9925 and 1.0000 is reachable only with listwise rerank over a wider pool.

## 2. The prediction matrix

Rows = hardware tier (worst to best). Columns = rerank tier. Cells show **(predicted R@5, predicted per-query latency)**.

| Hardware → Rerank ↓ | **CAX11 ARM cloud** (4 GB, 2 vCPU) | **Intel/AMD laptop CPU** (16 GB, 8 cores) | **Apple Silicon M1+** (ANE + Metal) | **Apple Silicon M3+ Max** (ANE + 30+ GPU cores) | **NVIDIA RTX 3060+** (workstation) |
|---|---|---|---|---|---|
| **none** (no rerank — current baseline) | 0.920 @ 100 ms | 0.920 @ 60 ms | 0.920 @ 50 ms | 0.920 @ 40 ms | 0.920 @ 30 ms |
| **cross-encoder ms-marco-MiniLM-L-6-v2** (E1' redo, in flight) | 0.93–0.95 @ 250 ms | 0.93–0.95 @ 200 ms | 0.93–0.95 @ 150 ms | 0.93–0.95 @ 120 ms | 0.93–0.95 @ 80 ms |
| **cross-encoder + E11 enrichment stack** | 0.94–0.96 @ 250 ms | 0.94–0.96 @ 200 ms | 0.94–0.96 @ 150 ms | 0.94–0.96 @ 120 ms | 0.94–0.96 @ 80 ms |
| **LLM listwise — qwen2.5:1.5b** (small) | NOT VIABLE¹ | 0.94–0.96 @ 5–8 s | 0.95–0.97 @ 1.5–2.5 s | 0.95–0.97 @ 0.8–1.5 s | 0.95–0.97 @ 0.4–0.8 s |
| **LLM listwise — qwen2.5:7b** (medium) | NOT VIABLE¹ | 0.96–0.97 @ 15–30 s | 0.96–0.97 @ 3–5 s | 0.96–0.97 @ 1.5–3 s | 0.96–0.97 @ 0.5–1.2 s |
| **LLM listwise — gpt-oss:20b** (large, Apache 2.0 ~20B params) | NOT VIABLE¹ | NOT VIABLE² | 0.97–0.985 @ 6–10 s | 0.97–0.985 @ 3–5 s | 0.97–0.99 @ 1–2 s |
| **LLM listwise — Claude Haiku API** (cloud) | 0.97–0.99 @ 0.5–1 s³ | 0.97–0.99 @ 0.5–1 s³ | 0.97–0.99 @ 0.5–1 s³ | 0.97–0.99 @ 0.5–1 s³ | 0.97–0.99 @ 0.5–1 s³ |
| **Tiered: cross-encoder always + LLM-small on uncertain queries** | NOT VIABLE¹ | ~0.95 @ 250 ms median, 5 s p95 | ~0.96 @ 150 ms median, 2 s p95 | ~0.96 @ 120 ms median, 1.5 s p95 | ~0.96 @ 80 ms median, 0.8 s p95 |

**Footnotes:**
1. `NOT VIABLE¹` — 4 GB RAM can't fit the model in resident memory (qwen2.5:1.5b needs ~2 GB plus working set; 7b needs ~5 GB; 20b needs ~15 GB).
2. `NOT VIABLE²` — fits in RAM but encoding latency runs into the multi-minute range without acceleration. Would block the bench rather than serve users.
3. Cloud API path bypasses the local hardware constraint entirely but adds USD ~$0.0005–0.001 per query and a network round-trip.

## 3. How to read the matrix

**Vertical reading (within a hardware column):** how much R@5 lift you get from upgrading your rerank tier, given your hardware.
- On a CAX11 ARM box: cross-encoder is the ceiling (~0.95). LLM listwise is impossible.
- On an M3 Max: cross-encoder gives ~0.95; LLM-small adds another ~+1 pp at ~1s; LLM-large adds another ~+1–2 pp at ~3-5 s.
- On a GPU workstation: nothing is cost-prohibitive — pick by quality.

**Horizontal reading (within a rerank tier):** how much latency improves with better hardware at fixed quality.
- Cross-encoder latency drops 3× from CAX11 to RTX-class.
- LLM listwise drops 5–10× from CPU-only to ANE-accelerated.
- For competitive UX, anything above 1 s per query starts to feel slow; anything above 3 s feels like a separate operation.

**Diagonal reading:** "what is each user's actually-best-achievable R@5?"
- ARM-cloud / Raspberry Pi user: 0.94–0.96 (cross-encoder + E11)
- Typical M-series MacBook user with Ollama: 0.95–0.97 (llm-listwise-small)
- Heavy user with gpt-oss:20b on M3+ Max: 0.97–0.985
- Workstation user: 0.97–0.99
- Cloud-API user: 0.97–0.99 with ~$0.001/q

## 4. Competitor positioning under each tier

| System | Their R@5 | Their latency | Our matching tier |
|---|---:|---:|---|
| ByteRover | 0.928 | 1.6 s | matched by *any* cross-encoder tier on Apple Silicon + |
| mem0 (LLM-as-judge) | 0.925¹ | 1–2 s | matched by cross-encoder + E11 |
| agentmemory | 0.952 | ~2-3 s² | matched by llm-listwise-small or larger |
| MemMachine (gpt-4.1-mini judge) | ~0.92³ | 3–5 s | matched by cross-encoder + E11 |

1. mem0's LoCoMo 92.5 is composite (LLM judge), not LME-S R@5.
2. agentmemory's latency isn't publicly broken down; inferred from architecture.
3. MemMachine's LME-S number isn't published; LoCoMo 0.917 is the published anchor.

## 5. Predicted lift from EBM / LLM-listwise vs cross-encoder

The cross-encoder runs *pairwise* — independent scoring of each (query, doc) pair. The LLM listwise reranker runs *listwise* — sees the whole candidate set jointly and can rank them comparatively. Three structural advantages drive the lift estimates:

| Capability | Cross-encoder ms-marco | LLM listwise |
|---|---|---|
| Domain match (conversational sessions, LME) | Trained on web passages — partial | Prompt-conditioned — adaptive |
| Joint candidate awareness | No (pairwise scores can't compare across candidates) | Yes — full list in context |
| Negation / contradiction handling | Indirect (via training data) | Explicit (LLM understands NOT, was vs is, etc.) |
| Temporal reasoning ("before X happened") | Absent — no ordinal geometry in scores | Present — LLM can do relative time |
| Per-question routing | Fixed pipeline | LLM can self-route ("this is a temporal question, sort by date") |

The lift estimates above are anchored to:
- RankGPT (Sun et al., 2023) reported +6.1 pp NDCG@10 over ms-marco on BEIR using gpt-3.5
- RankLlama (Ma et al., 2023) reported +3–4 pp using LLaMA-7B fine-tuned for ranking
- Listwise reranking surveys (2024) consistently show +2-5 pp over pairwise on conversational tasks

LongMemEval-S specifically has +5 pp of headroom (R@5 0.92 vs R@20 0.99) that the cross-encoder demonstrably failed to capture with bge-reranker-base. The LLM listwise has a structural reason to succeed where bge failed: it can use the temporal-reasoning capability the cross-encoder lacks, and that's exactly the question type sitting in the gold-tail.

## 6. The "+EBM" prediction

If we treat "EBM" as *listwise rerank specifically* (the meaningful interpretation per our earlier discussion):

Without LLM listwise (cross-encoder ceiling): **0.93–0.96 R@5**
With LLM listwise small (qwen2.5:1.5b / phi3:mini): **0.95–0.97**
With LLM listwise large (qwen2.5:7b / gpt-oss:20b): **0.96–0.98**
With LLM listwise frontier (Claude/GPT-4-class via API): **0.97–0.99**

Theoretical retrieval-only ceiling on LME-S 50-distractor: **1.000** (matches measured R@50).

The agentmemory 0.952 number sits in the "LLM listwise small" tier in this matrix. Their architectural advantage is *they have an LLM in the pipeline* — we'd match them by adding the same.

## 7. Recommended next experiments (post ms-marco bench)

Once the in-flight ms-marco cross-encoder run lands, the next four data points are:

1. **ms-marco + E11 on Hetzner** — establishes the cross-encoder + write-path ceiling on the conservative hardware tier
2. **Mac-side baseline (no rerank)** — establishes how much faster everything is on user-real hardware (probably 3–5×)
3. **Mac-side LLM listwise with qwen2.5:1.5b** — first measurement of the small LLM rerank tier; predicted 0.95–0.97
4. **Mac-side LLM listwise with gpt-oss:20b** — first measurement of the large LLM rerank tier; predicted 0.97–0.985

Total wall-time: ~6 hours for all four, spread across Hetzner + Mac. Each one independently tells us something.

## 8. What the matrix implies about the project pitch

The defensible positioning *isn't* "we beat agentmemory on R@5" — that depends on a tier they probably already use and we're catching up to. The defensible positioning is:

> **Akashik is the only retrieval system that adapts to whatever hardware its user has.**
> On a Raspberry Pi we run a fast cross-encoder and hit ~0.94.
> On a M3 Max we run gpt-oss:20b listwise and hit ~0.98.
> On a workstation we run anything that fits.
> Across all tiers, we share results federally between peers so the same data isn't fetched twice.
>
> No competitor offers this — they're all single-tier (cloud-only or single-model).

That's the story the matrix tells, and it's much stronger than "0.96 vs 0.952" leaderboard chasing.

exec
/bin/zsh -lc "sed -n '1,220p' docs/research/energy-based-contradiction-detection.md" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
# Energy-Based Contradiction Detection

**Status:** sketch (not committed to a phase yet)
**Filed:** 2026-05-20
**Author:** Akashik core
**Supersedes:** the placeholder name "Phase 25" used in earlier conversation — descriptive title from here on

A proposal for replacing the Jaccard-on-tokens contradiction filter in
`src/domain/auto-forget.ts` with a small learned NLI-style energy
network. Not urgent. Worth filing while the reasoning is fresh.

## The problem

Phase 22 ships `auto-forget` with a contradiction pass that demotes
the older of two graph nodes when:

```
Jaccard(tokens(node_A.summary), tokens(node_B.summary)) ≥ 0.9
∧  they share ≥ 1 concept tag
∧  their concept tags have a disjoint disagreement
```

This catches **lexical near-duplicates with disagreeing tags**. It
misses everything else.

### What Jaccard misses

Three failure modes observed in synthetic benchmarks + likely in
production:

1. **Paraphrased contradiction.** "The GPS in the Tesla is working
   now" vs "The GPS in the Tesla is broken." Share `the`, `gps`,
   `tesla`, `is` — Jaccard 0.7-ish, below the 0.9 cutoff. Both say
   the opposite thing about the same fact. Jaccard never fires.
2. **Negation flips.** "Pacific Renovations is cheaper than Bay Area
   Builders" vs "Pacific Renovations is NOT cheaper than Bay Area
   Builders." One-token difference, Jaccard ~0.97, but the concept-
   disagreement check requires disjoint tags — both candidates share
   the same tags, so the disagreement check filters them out.
3. **Numerical updates.** "Bob's rent is 27500 CZK" vs "Bob's rent is
   28800 CZK." High Jaccard, both about rent. Older is no longer
   correct. Tag-disagreement check probably fires, but Jaccard alone
   can't *grade* the severity of the disagreement.

The first two are silent wrong-answer sources at federation time:
peer A still serves the old fact, peer B has the corrected one, and
the consumer can't tell which to trust without re-checking the source.

### Why the current setup doesn't fix itself

Tightening Jaccard wouldn't help — that's a precision/recall tradeoff
on the same broken signal. The fundamental issue: Jaccard measures
**lexical similarity**, not **truth-value compatibility**. Two
sentences that agree and two sentences that contradict can have
identical Jaccard scores.

The right signal is "does (A ∧ B) entail a contradiction" — that's a
**Natural Language Inference (NLI)** task. NLI models output an
energy / logit per label in `{entailment, neutral, contradiction}`,
which IS an energy-based model (logits = energies, softmax just
normalizes them).

## Proposed approach

Replace the Jaccard step with an NLI-style energy classifier:

```
e(A, B) → 3-way energy over {entail, neutral, contradict}

contradicts(A, B) = argmax e(A, B) == contradict
                    ∧ confidence(e) ≥ threshold
```

### Model choice

Three real options, ranked by what fits Akashik's CPU-only +
Xenova-ONNX constraint:

| Model | Params | NLI accuracy (MNLI test) | Quantised ONNX | Notes |
|---|---:|---:|---|---|
| `cross-encoder/nli-deberta-v3-small` | 142M | ~90% | available on HF | sweet spot — Xenova-compatible, ~30 MB int8 |
| `cross-encoder/nli-deberta-v3-base` | 184M | ~91% | available | +1 point accuracy, 2× the RAM |
| `MoritzLaurer/DeBERTa-v3-large-mnli` | 435M | ~92% | partial | needs GPU; not for the daemon path |

Default: **`nli-deberta-v3-small`**, quantised, lazy-loaded via the
same `@xenova/transformers` pattern as the cross-encoder reranker
(`src/infrastructure/cross-encoder.ts`). Falls open on model-load
failure — same fail-open contract as Phase 21A.

### Where it slots in

`src/domain/auto-forget.ts:contradictsPass` is the only call site.
The substitution is mechanical:

```ts
// Before (Phase 22):
const sim = jaccardSimilarity(summaryTokens[i], summaryTokens[j]);
if (sim >= opts.contradictionThreshold && hasDisjointTags) {
  demote(older);
}

// After (proposed):
const verdict = await nli.classify(summary_i, summary_j);
if (verdict.label === 'contradiction' && verdict.confidence >= opts.contradictionThreshold) {
  demote(older);
}
```

The fall-back path (Jaccard) stays available behind an env flag:
`AKASHIK_CONTRADICTION_BACKEND=jaccard|nli`. NLI is the default
once the model is downloaded; Jaccard is the offline-or-degraded
fallback.

### Training data — three sources

We don't train from scratch. `nli-deberta-v3-small` ships with MNLI +
ANLI pretraining (1M+ NLI pairs). Zero-shot accuracy on the auto-
forget task is the starting point.

**Optional fine-tuning sources** (post v4.1 once federation has run
for months):

1. **Cross-peer disagreement audit log.** Every time federated search
   surfaces two nodes from different peers with the same source URI
   but different content, that's a labelled contradiction pair (with
   the right resolution = whichever the user kept).
2. **User feedback on `akashik contradictions resolve --prefer
   peer|local`.** Each resolution is a labelled (A, B, winner) triple
   we can use for adapter fine-tuning via LoRA.
3. **Synthetic adversarial pairs.** Generate paraphrase pairs +
   negation pairs from existing graph nodes via Phi-4-mini, label them
   via the system's existing semantic memory. ~1000 pairs per peer,
   shareable in `toolshed` if the user opts in.

LoRA fine-tuning fits on CPU — DeBERTa-v3-small + LoRA rank 8 trains
~5 minutes per epoch on 1000 pairs on a Hetzner CCX23. No GPU.

## What this doesn't replace

The proposal is narrow:

- **Bi-encoder retrieval** stays — NLI is too slow for the candidate
  set, only the contradiction post-filter on already-retrieved tier
  nodes
- **Cross-encoder rerank** stays — different signal, different model,
  different stage
- **PPR / recency rerank** stays
- **The retention math** (λ, σ, decay) stays
- **The Beta(α, β) procedural counters** stay
- **The four-tier vocabulary** stays

This is a single-line replacement in `auto-forget.ts`. The rest of
the system is unchanged.

## Acceptance gates (when this phase eventually ships)

| Gate | Target | Why |
|---|---:|---|
| Contradiction-precision on paraphrase benchmark | ≥ 0.90 | Jaccard is at ~0.70; this is the win |
| Contradiction-recall on paraphrase benchmark | ≥ 0.85 | Don't miss real contradictions |
| Daemon-tick latency cost | ≤ +200 ms p50 | NLI is heavier than Jaccard but bounded |
| Memory floor | ≤ +60 MB | DeBERTa-v3-small int8 quantised |
| Composite memory bench (Phase 23) | no regression | Don't break the ratchet |
| Fail-open behaviour | 100% on model load failure | Same contract as cross-encoder reranker |

## Why not now

Three reasons in order of weight:

1. **Volume is wrong.** Local-only graphs have very few real
   contradictions today — Jaccard misses don't bite hard until
   federation has run long enough that cross-peer disagreements pile
   up. We're at zero federated peers; nothing to detect.
2. **The bench can't see the difference.** Phase 23's auto-forget
   bench (50 nodes, 5 TTL + 10 ancient + 35 keep) doesn't have
   paraphrased contradictions to surface. We'd be shipping an NLI
   model that scores 1.0 on a Jaccard-shaped test set. Not a
   defensible move.
3. **Other work is higher leverage.** Phase 23.7 (real public-bench
   adapters) and Phase 22 deferred items (GSW entity-summary
   retrieval, Bayesian feedback loop) both move documented numbers
   today. NLI-EBM moves a number that doesn't exist yet.

## When to revisit

The trigger conditions, any of:

- ≥ 100 federated peers active with `toolshed` shared
- ≥ 50 distinct contradiction-resolution events in audit logs across
  the network
- A user-reported "the system kept the wrong fact" incident with a
  Jaccard miss as root cause
- A benchmark suite that scores paraphrase-contradiction precision
  (could be built before federation hits scale — see "open
  questions" below)

## Open questions

1. **Symmetry.** NLI is directional (A entails B ≠ B entails A). Our
   contradiction detector is bidirectional (we just want to know "do
   these contradict"). Do we run both directions and AND them? OR
   them? Use the max-confidence one? Default: AND on `contradict`
   labels — both directions must agree to demote.
2. **Calibration.** DeBERTa-v3-small NLI is well-calibrated on MNLI;
   probably less so on memory-summary domain. May need a small held-
   out calibration set per-peer.
3. **Cross-language.** Akashik is currently English-only on the
   write-gate side. DeBERTa-v3 is multilingual but NLI checkpoints
   are usually English. If we go multilingual, we need a different
   checkpoint or per-language model. Phase 25.1.
4. **Federation gossip.** Once we have an NLI verdict on (peer-A's
   fact, peer-B's fact), should we ship the verdict over the wire
   to peer C so C doesn't re-compute? Pro: bandwidth + cost. Con:
   trust — what if peer A is lying about the verdict to demote peer
   B's node? Solution probably: each peer computes its own verdicts;
   verdicts are local-view only.

## Concrete first step

When the phase opens:

codex
The research docs confirm the pattern: a lot of material is valuable as historical evidence, but much of it is optimized for “beat mem0 on retrieval” rather than “prove a federated commons compounds.” I’m checking the tests and source paths that embody that old thesis so the cleanup recommendations hit code, not just prose.
exec
/bin/zsh -lc "sed -n '1,220p' tests/bench-akashik-federation.test.ts" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
/**
 * Bench — AkashikBench-F (federation-level compounding).
 *
 * The benchmark the octopus-discover Round 5 synthesis identified
 * as the only one that can falsify or validate the federated-
 * commons thesis. Lives in `docs/research/octopus-discover/round-
 * 5-2026-05-26/synthesis.md` for context.
 *
 * Loads a frozen OSS corpus (default: snap-research/locomo factual
 * subset), partitions documents into N strictly disjoint peer
 * shards (each peer starts knowing only its own slice), runs a
 * Zipfian query stream with realistic offline churn through the
 * pure-domain federation simulator
 * (`src/domain/federation-sim.ts`), and emits:
 *
 *   - `web_fallback_rate(t)` ladder — the network's curiosity-
 *     driven learning curve. Falling = compounding.
 *   - `compoundingSlope` — linear-regression slope of the ladder.
 *     Negative = thesis validated. Near-zero = thesis open. Above
 *     zero = thesis broken (would be very strange in this sim).
 *   - `propagationHalfLife` — median sim-steps from "a doc enters
 *     the network via web fallback" to "≥ 50% of peers hold it".
 *     Lower = faster compounding. Infinity = niche-evaporation
 *     case (Q6b in the Round 5 brief).
 *   - Cumulative source breakdown — fraction of all queries
 *     resolved locally / via federation / via web.
 *
 * Environment contract (all required to run; otherwise skipped):
 *
 *   AKASHIK_BENCH_F=1
 *     Master gate (off by default so CI stays fast).
 *
 *   LOCOMO_DIR=/path/to/locomo
 *     Provides the corpus. Same dir convention as the existing
 *     `bench-locomo-real.test.ts`. Set to a directory that
 *     contains `locomo10.json`.
 *
 *   AKASHIK_BENCH_OUT=/path/to/run.jsonl   (optional)
 *     If set, suite appends one `BenchSuiteReport` JSON line.
 *
 *   AKASHIK_BENCH_PEERS=10           (default 10 — Round 5 spec)
 *   AKASHIK_BENCH_STEPS=2000         (default 2000)
 *   AKASHIK_BENCH_OFFLINE=0.2        (default 0.2 — Round 5 spec)
 *   AKASHIK_BENCH_ZIPF=1.0           (default 1.0)
 *   AKASHIK_BENCH_SEED=42            (default 42)
 *   AKASHIK_BENCH_SHARD=0.05         (default 0.05 — 50% web-only
 *                                     at 10 peers; gives a strong
 *                                     compounding signal)
 *   AKASHIK_BENCH_WINDOW=100         (default 100)
 *
 * Why a pure simulator instead of spinning up real peers:
 *
 *   v1 measures federation DYNAMICS — does the curiosity-driven
 *   cache-fill mechanism produce compounding under realistic
 *   churn? It deliberately abstracts away per-peer retrieval
 *   quality (those are measured separately by the LongMemEval /
 *   LoCoMo / BEIR public-corpus benches). Boolean "does the peer
 *   hold this doc" is the right granularity for this question
 *   and it runs in seconds. v2 plugs in real retrieval per peer
 *   for a full-stack federation bench — but only after v1
 *   confirms the dynamics work.
 */

import assert from 'node:assert/strict';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  runFederationSim,
  webFallbackRateOverTime,
  compoundingSlope,
  propagationHalfLife,
  resolveSourceCounts,
  type SimCorpus,
} from '../src/domain/federation-sim.js';
import type { BenchSuiteReport } from '../src/domain/bench-types.js';

// ─────────────── corpus loader ─────────────

interface LocomoQa {
  readonly question: string;
  readonly evidence?: readonly string[];
  readonly category?: number;
}

interface LocomoSample {
  readonly sample_id?: string;
  readonly qa: readonly LocomoQa[];
  readonly conversation: Readonly<Record<string, unknown>>;
}

const FACTUAL_CATEGORIES = new Set([1, 2, 3]);

/**
 * Build a `SimCorpus` from the LoCoMo factual subset. Each LoCoMo
 * QA pair becomes one simulator `SimQuery`. The `goldDocs` are the
 * LoCoMo session tags (e.g. `D3`, `D7`) referenced by the QA's
 * `evidence` field. Tags are namespaced by sample id so different
 * samples' D1's don't collide.
 */
const buildCorpusFromLoCoMo = (locomoPath: string): SimCorpus => {
  const dataset = JSON.parse(readFileSync(locomoPath, 'utf8')) as readonly LocomoSample[];
  const queries: { id: string; goldDocs: string[] }[] = [];
  const docSet = new Set<string>();
  for (let sIdx = 0; sIdx < dataset.length; sIdx++) {
    const sample = dataset[sIdx];
    const sampleTag = sample.sample_id ?? `s${sIdx}`;
    for (let qIdx = 0; qIdx < sample.qa.length; qIdx++) {
      const q = sample.qa[qIdx];
      if (q.category === undefined || !FACTUAL_CATEGORIES.has(q.category)) continue;
      if (!q.evidence || q.evidence.length === 0) continue;
      const gold = new Set<string>();
      for (const ev of q.evidence) {
        if (typeof ev !== 'string') continue;
        const colon = ev.indexOf(':');
        const tag = (colon >= 0 ? ev.slice(0, colon) : ev).trim();
        if (tag.length === 0) continue;
        const nsTag = `${sampleTag}/${tag}`;
        gold.add(nsTag);
        docSet.add(nsTag);
      }
      if (gold.size === 0) continue;
      queries.push({
        id: `${sampleTag}#q${qIdx}`,
        goldDocs: Array.from(gold),
      });
    }
  }
  return { queries, allDocs: Array.from(docSet) };
};

// ─────────────── bench ─────────────

test('bench: AkashikBench-F — federation compounding on LoCoMo', { timeout: 60 * 60 * 1000 }, async (t) => {
  if (process.env.AKASHIK_BENCH_F !== '1') {
    t.skip('AKASHIK_BENCH_F not set — skipping AkashikBench-F');
    return;
  }
  const dir = process.env.LOCOMO_DIR;
  if (!dir) {
    t.skip('LOCOMO_DIR not set — see suite header for layout');
    return;
  }
  const corpusPath = join(dir, 'locomo10.json');
  if (!existsSync(corpusPath)) {
    t.skip(`missing ${corpusPath}`);
    return;
  }

  const corpus = buildCorpusFromLoCoMo(corpusPath);
  assert.ok(corpus.queries.length > 0, 'corpus has zero queries');
  assert.ok(corpus.allDocs.length > 0, 'corpus has zero docs');

  const numPeers = Number(process.env.AKASHIK_BENCH_PEERS ?? 10);
  const numSteps = Number(process.env.AKASHIK_BENCH_STEPS ?? 2000);
  const offlineProbability = Number(process.env.AKASHIK_BENCH_OFFLINE ?? 0.2);
  const zipfAlpha = Number(process.env.AKASHIK_BENCH_ZIPF ?? 1.0);
  const seed = Number(process.env.AKASHIK_BENCH_SEED ?? 42);
  const initialShardFraction = Number(process.env.AKASHIK_BENCH_SHARD ?? 0.05);
  const windowSize = Number(process.env.AKASHIK_BENCH_WINDOW ?? 100);

  // Disjointness invariant: numPeers × initialShardFraction ≤ 1.0
  // — otherwise the simulator's sequential sharding can't allocate
  // enough docs and later peers get smaller shards (or nothing).
  // We don't fail; just log a warning.
  const totalCoverage = numPeers * initialShardFraction;
  if (totalCoverage > 1.0) {
    console.warn(`  WARN: peers (${numPeers}) × shardFraction (${initialShardFraction}) = ${totalCoverage} > 1.0 — sharding will be uneven`);
  }

  console.log(`AkashikBench-F: ${numPeers} peers × ${numSteps} steps · offline=${offlineProbability} · zipf=${zipfAlpha} · shard=${initialShardFraction} (coverage ${(totalCoverage * 100).toFixed(0)}%) · corpus=${corpus.queries.length} queries, ${corpus.allDocs.length} docs`);

  const t0 = performance.now();
  const result = runFederationSim(corpus, {
    numPeers,
    numSteps,
    offlineProbability,
    zipfAlpha,
    seed,
    initialShardFraction,
  });
  const elapsedMs = performance.now() - t0;

  const rates = webFallbackRateOverTime(result.events, windowSize);
  const slope = compoundingSlope(rates);
  const halfLife = propagationHalfLife(result.events, numPeers);
  const counts = resolveSourceCounts(result.events);

  // First and last window's fallback rates for a punchy comparison
  const firstRate = rates.length > 0 ? rates[0].rate : 0;
  const lastRate = rates.length > 0 ? rates[rates.length - 1].rate : 0;

  console.log(`  web_fallback_rate trajectory:`);
  for (let i = 0; i < rates.length; i++) {
    if (i === 0 || i === rates.length - 1 || i % Math.max(1, Math.floor(rates.length / 8)) === 0) {
      console.log(`    t≈${rates[i].t.toString().padStart(5)}  rate=${rates[i].rate.toFixed(3)}`);
    }
  }
  console.log(`  first→last fallback rate: ${firstRate.toFixed(3)} → ${lastRate.toFixed(3)}  (slope=${slope.toExponential(2)})`);
  console.log(`  propagation half-life: median=${halfLife.median.toFixed(1)} steps · ever-reached=${halfLife.everReached} · never=${halfLife.never}`);
  console.log(`  resolve sources: local=${counts.local} federation=${counts.federation} web=${counts.web} (total ${counts.total})`);
  console.log(`  elapsed: ${(elapsedMs).toFixed(1)} ms`);

  const report: BenchSuiteReport = {
    suite: 'akashik-federation',
    metrics: {
      webFallbackRateFirst: firstRate,
      webFallbackRateLast: lastRate,
      compoundingSlope: slope,
      propagationHalfLifeMedian: Number.isFinite(halfLife.median) ? halfLife.median : -1,
      propagationEverReached: halfLife.everReached,
      propagationNever: halfLife.never,
      localFraction: counts.total > 0 ? counts.local / counts.total : 0,
      federationFraction: counts.total > 0 ? counts.federation / counts.total : 0,
      webFraction: counts.total > 0 ? counts.web / counts.total : 0,
      simSteps: numSteps,
      eventsEmitted: result.events.length,
      numPeers,
    },

exec
/bin/zsh -lc "sed -n '1,220p' tests/bench-real.test.ts" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
/**
 * Real benchmarks — no synthetic fluff.
 *
 * Uses a labeled corpus with known-relevant query-document pairs.
 * Measures actual IR metrics: Precision@K, Recall@K, MRR, NDCG.
 * Latency percentiles over 100+ runs. Scale from 10 to 1000 nodes.
 * Memory footprint tracking. Real ONNX embeddings via fixture
 * embedder with controlled similarity vectors.
 *
 * This is what a real eval looks like.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { fileGraphRepository } from '../src/infrastructure/graph-repository.js';
import { openSqliteVectorIndex } from '../src/infrastructure/vector-index.js';
import { fixtureEmbedder } from '../src/infrastructure/embedders.js';
import { indexNode, searchByRoom, searchGlobal } from '../src/application/use-cases.js';
import { sparse } from '../src/domain/vectors.js';
import type { BenchSuiteReport } from '../src/domain/bench-types.js';

// ─────────── corpus with ground truth ───────────

interface CorpusItem {
  id: string;
  label: string;
  text: string;
  /** Tags for relevance judgment — query "tag" should return this item */
  tags: string[];
}

/** 30-item corpus spanning 3 domains with clear tag-based relevance */
const CORPUS: CorpusItem[] = [
  // Cluster 1: vector search (10 items)
  { id: 'vs-1', label: 'HNSW index construction', text: 'Hierarchical navigable small world graphs for approximate nearest neighbor search with logarithmic complexity', tags: ['vector-search', 'indexing'] },
  { id: 'vs-2', label: 'Product quantization for compression', text: 'Divide vectors into subspaces and quantize each independently to reduce memory by 32x with minimal recall loss', tags: ['vector-search', 'compression'] },
  { id: 'vs-3', label: 'IVF-PQ hybrid index', text: 'Inverted file index with product quantization combining coarse partitioning with fine-grained compression', tags: ['vector-search', 'indexing', 'compression'] },
  { id: 'vs-4', label: 'sqlite-vec performance tuning', text: 'WAL mode pragma synchronous normal and batch inserts for sqlite vec0 virtual table throughput', tags: ['vector-search', 'sqlite', 'performance'] },
  { id: 'vs-5', label: 'Faiss vs Annoy vs ScaNN', text: 'Benchmark comparison of approximate nearest neighbor libraries on the SIFT1M dataset', tags: ['vector-search', 'benchmark'] },
  { id: 'vs-6', label: 'Dense retrieval with bi-encoders', text: 'Sentence transformers encode queries and documents independently for efficient dot product similarity', tags: ['vector-search', 'embeddings'] },
  { id: 'vs-7', label: 'Matryoshka representation learning', text: 'Train embedding models where truncated prefixes retain semantic quality at reduced dimensions', tags: ['vector-search', 'embeddings', 'compression'] },
  { id: 'vs-8', label: 'Filtered vector search', text: 'Pre-filtering vs post-filtering strategies for metadata-constrained nearest neighbor queries', tags: ['vector-search', 'filtering'] },
  { id: 'vs-9', label: 'Streaming vector updates', text: 'Incremental index maintenance for real-time vector databases without full rebuild', tags: ['vector-search', 'streaming'] },
  { id: 'vs-10', label: 'Vector search evaluation metrics', text: 'Recall at K precision at K and mean reciprocal rank for nearest neighbor quality assessment', tags: ['vector-search', 'metrics'] },

  // Cluster 2: knowledge graphs (10 items)
  { id: 'kg-1', label: 'Entity extraction with NER', text: 'Named entity recognition using transformer models to populate knowledge graph nodes from unstructured text', tags: ['knowledge-graph', 'extraction'] },
  { id: 'kg-2', label: 'Relation extraction pipelines', text: 'Joint entity and relation extraction with attention-based span classification for knowledge base construction', tags: ['knowledge-graph', 'extraction'] },
  { id: 'kg-3', label: 'Knowledge graph embeddings survey', text: 'TransE TransR RotatE ComplEx and other geometric models for link prediction in knowledge graphs', tags: ['knowledge-graph', 'embeddings'] },
  { id: 'kg-4', label: 'Graph neural networks for KG', text: 'Message passing neural networks aggregate neighbor features for node classification and link prediction', tags: ['knowledge-graph', 'gnn'] },
  { id: 'kg-5', label: 'Ontology alignment methods', text: 'Schema matching and instance matching techniques for integrating heterogeneous knowledge graphs', tags: ['knowledge-graph', 'integration'] },
  { id: 'kg-6', label: 'Temporal knowledge graphs', text: 'Representing and reasoning over time-stamped facts with temporal extensions to standard KG models', tags: ['knowledge-graph', 'temporal'] },
  { id: 'kg-7', label: 'Knowledge graph completion', text: 'Predicting missing links in incomplete knowledge graphs using embedding-based and rule-based methods', tags: ['knowledge-graph', 'embeddings'] },
  { id: 'kg-8', label: 'SPARQL query optimization', text: 'Join ordering and cardinality estimation for efficient graph pattern matching in RDF stores', tags: ['knowledge-graph', 'querying'] },
  { id: 'kg-9', label: 'GraphRAG architecture', text: 'Retrieval augmented generation with graph-structured knowledge for multi-hop reasoning', tags: ['knowledge-graph', 'rag'] },
  { id: 'kg-10', label: 'Community detection algorithms', text: 'Leiden Louvain and spectral clustering for identifying densely connected subgroups in large graphs', tags: ['knowledge-graph', 'clustering'] },

  // Cluster 3: MLOps / deployment (10 items)
  { id: 'ml-1', label: 'Model serving with ONNX Runtime', text: 'Cross-platform inference acceleration using ONNX format with hardware-specific execution providers', tags: ['mlops', 'serving', 'onnx'] },
  { id: 'ml-2', label: 'Feature store design patterns', text: 'Online and offline feature serving with point-in-time correct joins for ML training and inference', tags: ['mlops', 'features'] },
  { id: 'ml-3', label: 'A/B testing for ML models', text: 'Statistical significance testing and traffic splitting for comparing model versions in production', tags: ['mlops', 'testing'] },
  { id: 'ml-4', label: 'Model monitoring and drift detection', text: 'Distribution shift detection using KL divergence PSI and adversarial validation on production data', tags: ['mlops', 'monitoring'] },
  { id: 'ml-5', label: 'Quantization-aware training', text: 'Train neural networks with simulated low-precision arithmetic to enable int8 inference without accuracy loss', tags: ['mlops', 'compression', 'onnx'] },
  { id: 'ml-6', label: 'Kubernetes ML workloads', text: 'GPU scheduling node affinity and resource quotas for distributed training jobs on Kubernetes clusters', tags: ['mlops', 'kubernetes'] },
  { id: 'ml-7', label: 'Experiment tracking with MLflow', text: 'Log parameters metrics and artifacts for reproducible ML experiments with automatic model registry', tags: ['mlops', 'tracking'] },
  { id: 'ml-8', label: 'Data versioning with DVC', text: 'Git-like version control for large datasets and ML pipelines with remote storage backends', tags: ['mlops', 'versioning'] },
  { id: 'ml-9', label: 'CI/CD for ML pipelines', text: 'Automated testing retraining and deployment pipelines with data validation and model quality gates', tags: ['mlops', 'cicd'] },
  { id: 'ml-10', label: 'Edge deployment optimization', text: 'Model pruning knowledge distillation and TensorRT compilation for latency-constrained edge inference', tags: ['mlops', 'serving', 'compression'] },
];

/** Labeled queries with expected relevant document IDs */
const QUERIES: Array<{ query: string; tag: string; expected: string[] }> = [
  { query: 'how to build a fast nearest neighbor index', tag: 'vector-search', expected: ['vs-1', 'vs-3', 'vs-5', 'vs-8', 'vs-9'] },
  { query: 'reduce embedding memory footprint', tag: 'compression', expected: ['vs-2', 'vs-3', 'vs-7', 'ml-5', 'ml-10'] },
  { query: 'extract entities and relations from text', tag: 'extraction', expected: ['kg-1', 'kg-2'] },
  { query: 'deploy models to production', tag: 'serving', expected: ['ml-1', 'ml-10', 'ml-6'] },
  { query: 'graph based retrieval augmented generation', tag: 'rag', expected: ['kg-9', 'kg-4'] },
  { query: 'sqlite database performance', tag: 'sqlite', expected: ['vs-4'] },
  { query: 'ONNX model inference optimization', tag: 'onnx', expected: ['ml-1', 'ml-5'] },
  { query: 'community clustering in networks', tag: 'clustering', expected: ['kg-10'] },
];

// ─────────── metrics ───────────

const precisionAtK = (retrieved: string[], relevant: Set<string>, k: number): number => {
  const topK = retrieved.slice(0, k);
  const hits = topK.filter((id) => relevant.has(id)).length;
  return hits / k;
};

const recallAtK = (retrieved: string[], relevant: Set<string>, k: number): number => {
  const topK = retrieved.slice(0, k);
  const hits = topK.filter((id) => relevant.has(id)).length;
  return relevant.size > 0 ? hits / relevant.size : 0;
};

const mrr = (retrieved: string[], relevant: Set<string>): number => {
  for (let i = 0; i < retrieved.length; i++) {
    if (relevant.has(retrieved[i])) return 1 / (i + 1);
  }
  return 0;
};

const ndcgAtK = (retrieved: string[], relevant: Set<string>, k: number): number => {
  const topK = retrieved.slice(0, k);
  let dcg = 0;
  for (let i = 0; i < topK.length; i++) {
    if (relevant.has(topK[i])) dcg += 1 / Math.log2(i + 2);
  }
  // Ideal DCG
  const idealHits = Math.min(relevant.size, k);
  let idcg = 0;
  for (let i = 0; i < idealHits; i++) idcg += 1 / Math.log2(i + 2);
  return idcg > 0 ? dcg / idcg : 0;
};

const percentile = (arr: number[], p: number): number => {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
};

// ─────────── helpers ───────────

const buildIndex = async (tmp: string) => {
  const graphs = fileGraphRepository(join(tmp, 'graph.json'));
  const vectors = (await openSqliteVectorIndex({ path: join(tmp, 'vectors.db') }))._unsafeUnwrap();
  const embedder = fixtureEmbedder();
  const deps = { graphs, vectors, embedder };
  const useCase = indexNode(deps);

  for (const item of CORPUS) {
    await useCase({
      node: {
        id: item.id,
        label: item.label,
        file_type: 'document',
        source_file: `corpus/${item.id}`,
        source_uri: `corpus://${item.id}`,
        tags: item.tags,
      },
      text: `${item.label}. ${item.text}`,
      room: 'bench',
    });
  }

  return { deps, close: () => vectors.close() };
};

// ─────────── real benchmarks ───────────

test('real-bench: IR metrics on labeled corpus (P@5, R@5, MRR, NDCG@5)', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'wi-real-'));
  try {
    const { deps, close } = await buildIndex(tmp);
    const searchDeps = { graphs: deps.graphs, vectors: deps.vectors, embedder: deps.embedder };

    const results: Array<{ query: string; p5: number; r5: number; mrr_val: number; ndcg5: number }> = [];

    for (const q of QUERIES) {
      const searchResult = (await searchByRoom(searchDeps)({
        room: 'bench',
        text: q.query,
        k: 10,
      }))._unsafeUnwrap();

      const retrieved = searchResult.map((r) => r.node_id);
      const relevant = new Set(q.expected);

      const p5 = precisionAtK(retrieved, relevant, 5);
      const r5 = recallAtK(retrieved, relevant, 5);
      const mrrVal = mrr(retrieved, relevant);
      const ndcg5 = ndcgAtK(retrieved, relevant, 5);

      results.push({ query: q.query, p5, r5, mrr_val: mrrVal, ndcg5 });
    }

    // Aggregate
    const avgP5 = results.reduce((s, r) => s + r.p5, 0) / results.length;
    const avgR5 = results.reduce((s, r) => s + r.r5, 0) / results.length;
    const avgMRR = results.reduce((s, r) => s + r.mrr_val, 0) / results.length;
    const avgNDCG5 = results.reduce((s, r) => s + r.ndcg5, 0) / results.length;

    console.log(`\n  IR Metrics (${QUERIES.length} queries, ${CORPUS.length} documents):`);
    console.log(`  ┌────────────────────────────────────────────────┐`);
    console.log(`  │ Precision@5:  ${(avgP5 * 100).toFixed(1).padStart(5)}%                          │`);
    console.log(`  │ Recall@5:     ${(avgR5 * 100).toFixed(1).padStart(5)}%                          │`);
    console.log(`  │ MRR:          ${avgMRR.toFixed(3).padStart(5)}                           │`);
    console.log(`  │ NDCG@5:       ${avgNDCG5.toFixed(3).padStart(5)}                           │`);
    console.log(`  └────────────────────────────────────────────────┘`);
    console.log(`\n  Per-query breakdown:`);
    for (const r of results) {
      console.log(`    ${r.query.slice(0, 45).padEnd(45)} P@5=${(r.p5 * 100).toFixed(0).padStart(3)}% R@5=${(r.r5 * 100).toFixed(0).padStart(3)}% MRR=${r.mrr_val.toFixed(2)}`);
    }

    // Phase 23 CI retrieval quality gate — locked to the current fixture-
    // embedder baseline with a small safety margin. Tightened from the
    // prior `>= 0` sanity check per the data scientist audit recommendation:
    // a green `npm test` should prove retrieval quality didn't regress, not
    // just that the code compiles. Baseline (2026-04-14, commit 3770db4+):
    //   MRR     = 0.708
    //   NDCG@5  = 0.682
    //   R@5     = ~0.73 (varies 40-100% per query)
    //   P@5     = ~0.32
    // Thresholds set 8-12% below baseline to absorb tokenization + FTS5
    // interaction noise from Phase 23 pipeline unification. Drops below
    // these bars should fail CI loudly — this is the regression gate.
    assert.ok(
      avgMRR >= 0.62,
      `retrieval MRR regressed below 0.62 floor: ${avgMRR.toFixed(3)}`,
    );
    assert.ok(
      avgNDCG5 >= 0.60,
      `retrieval NDCG@5 regressed below 0.60 floor: ${avgNDCG5.toFixed(3)}`,
    );
    assert.ok(

exec
/bin/zsh -lc "rg -n \"process\\.env|AKASHIK_|skipIf|describe\\.skip|test\\.skip\" tests src | head -n 200" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
tests/phase4.rooms.test.ts:143:    // Set AKASHIK_HOME so init writes to our tmp dir
tests/phase4.rooms.test.ts:144:    const origHome = process.env.AKASHIK_HOME;
tests/phase4.rooms.test.ts:145:    process.env.AKASHIK_HOME = tmp;
tests/phase4.rooms.test.ts:172:    process.env.AKASHIK_HOME = origHome;
src/domain/share-policy.ts:37: *   AKASHIK_REQUIRE_SIGNED_NODES=1
src/domain/share-policy.ts:42:  env: NodeJS.ProcessEnv = process.env,
src/domain/share-policy.ts:44:  const v = env.AKASHIK_REQUIRE_SIGNED_NODES;
src/daemon/ipc.ts:18: * Socket lives at `${AKASHIK_HOME}/daemon.sock` — Unix-only.
src/domain/share-envelope.ts:22: * separate commit behind AKASHIK_REQUIRE_SIGNED_NODES so the
tests/bench-tier-promotion.test.ts:121:  if (process.env.AKASHIK_BENCH_OUT) {
tests/bench-tier-promotion.test.ts:122:    appendBenchReport(process.env.AKASHIK_BENCH_OUT, JSON.stringify(report) + '\n');
src/daemon/consolidate-tick.ts:82: * Children inherit AKASHIK_HOME so they hit the same graph.
src/daemon/consolidate-tick.ts:121:        env: { ...process.env, AKASHIK_HOME: homeDir },
tests/bench-longmemeval-synth.test.ts:441:    if (process.env.AKASHIK_BENCH_OUT) {
tests/bench-longmemeval-synth.test.ts:442:      appendBenchReport(process.env.AKASHIK_BENCH_OUT, JSON.stringify(report) + '\n');
src/domain/errors.ts:543:      return `rerank disabled (AKASHIK_RERANK is not set)`;
src/domain/errors.ts:582:      return 'fix: check network access; the embedder downloads ~90 MB on first use. Re-run `akashik doctor` to retry, or set `AKASHIK_MODEL_CACHE` to a writable directory.';
tests/contextual-enrich.test.ts:10: * Xenova model when AKASHIK_BENCH_PUBLIC_REAL is unset, so the
tests/contextual-enrich.test.ts:132:test('isContextualEnrichEnabled: gated by AKASHIK_BENCH_CONTEXTUAL_ENRICH=1', () => {
tests/contextual-enrich.test.ts:133:  const prior = process.env.AKASHIK_BENCH_CONTEXTUAL_ENRICH;
tests/contextual-enrich.test.ts:135:    delete process.env.AKASHIK_BENCH_CONTEXTUAL_ENRICH;
tests/contextual-enrich.test.ts:137:    process.env.AKASHIK_BENCH_CONTEXTUAL_ENRICH = '0';
tests/contextual-enrich.test.ts:139:    process.env.AKASHIK_BENCH_CONTEXTUAL_ENRICH = '1';
tests/contextual-enrich.test.ts:143:      delete process.env.AKASHIK_BENCH_CONTEXTUAL_ENRICH;
tests/contextual-enrich.test.ts:145:      process.env.AKASHIK_BENCH_CONTEXTUAL_ENRICH = prior;
src/domain/rerank-tier.ts:6: * and the env-shape from process.env (via a thin reader port to keep
src/domain/rerank-tier.ts:50: * Subset of `process.env` the picker needs. Pulled through a
src/domain/rerank-tier.ts:63:   * Master kill-switch — `AKASHIK_RERANK=0` forces `none` tier
src/domain/rerank-tier.ts:70:export const rerankEnvFromProcess = (env: NodeJS.ProcessEnv = process.env): RerankEnv => {
src/domain/rerank-tier.ts:71:  const override = env.AKASHIK_RERANK_TIER as RerankTier | undefined;
src/domain/rerank-tier.ts:77:    modelOverride: env.AKASHIK_RERANK_MODEL || undefined,
src/domain/rerank-tier.ts:78:    latencyBudgetMs: env.AKASHIK_RERANK_LATENCY_MS
src/domain/rerank-tier.ts:79:      ? Number(env.AKASHIK_RERANK_LATENCY_MS)
src/domain/rerank-tier.ts:81:    headSizeOverride: env.AKASHIK_RERANK_HEAD
src/domain/rerank-tier.ts:82:      ? Number(env.AKASHIK_RERANK_HEAD)
src/domain/rerank-tier.ts:84:    disabled: env.AKASHIK_RERANK === '0',
src/domain/rerank-tier.ts:127: *   1. Explicit env override (`AKASHIK_RERANK_TIER`)
src/domain/rerank-tier.ts:128: *   2. Master kill-switch (`AKASHIK_RERANK=0`)
src/domain/rerank-tier.ts:140:      reason: 'AKASHIK_RERANK=0 (master kill-switch)',
tests/phase29.rust-retrieval-regression.test.ts:12: * This test is opt-in via `AKASHIK_RUST_BIN` env var or a
tests/phase29.rust-retrieval-regression.test.ts:91:  const candidate = process.env.AKASHIK_RUST_BIN ?? repoBinaryPath();
tests/phase29.rust-retrieval-regression.test.ts:99:      'akashik-rs embed_server binary not built — build with `cargo build --release --manifest-path akashik-rs/Cargo.toml` or set AKASHIK_RUST_BIN',
src/infrastructure/summariser.ts:65: * via `AKASHIK_OLLAMA_MODEL` or the OllamaClientOptions.model.
src/infrastructure/summariser.ts:127: *   1. `AKASHIK_SUMMARISER=fixture` → fixtureSummariser (tests)
src/infrastructure/summariser.ts:128: *   2. `AKASHIK_SUMMARISER=ollama` OR ollama unset OR default →
src/infrastructure/summariser.ts:142:  const choice = (process.env.AKASHIK_SUMMARISER ?? '').toLowerCase();
src/infrastructure/summariser.ts:145:      fallback: process.env.AKASHIK_SUMMARISER_FIXTURE ?? 'fixture-summary',
tests/bench-real.test.ts:235:    if (process.env.AKASHIK_BENCH_OUT) {
tests/bench-real.test.ts:249:      appendFileSync(process.env.AKASHIK_BENCH_OUT, JSON.stringify(report) + '\n');
src/infrastructure/ollama-client.ts:67: * override via AKASHIK_OLLAMA_URL at the runtime layer.
src/infrastructure/ollama-client.ts:70:  const baseUrl = (opts.baseUrl ?? process.env.AKASHIK_OLLAMA_URL ?? DEFAULTS.baseUrl).replace(/\/$/, '');
src/infrastructure/ollama-client.ts:71:  const defaultModel = opts.model ?? process.env.AKASHIK_OLLAMA_MODEL ?? DEFAULTS.model;
src/domain/contextual-enrich.ts:130: * Env-gate helper. Returns `true` when `AKASHIK_BENCH_CONTEXTUAL_ENRICH=1`,
src/domain/contextual-enrich.ts:135:  process.env.AKASHIK_BENCH_CONTEXTUAL_ENRICH === '1';
src/cli/commands/onboard.ts:147:  const def = flags.home ?? process.env.AKASHIK_HOME ?? join(homedir(), '.akashik');
src/cli/commands/onboard.ts:158:  process.env.AKASHIK_HOME = chosen;
src/cli/commands/onboard.ts:162:      `Add to your shell profile so future sessions agree:\n  export AKASHIK_HOME="${chosen}"`,
src/cli/commands/onboard.ts:197: * `AKASHIK_GITHUB_CLIENT_ID` configured see a clear "skip + how
src/cli/commands/onboard.ts:204:  const clientId = process.env.AKASHIK_GITHUB_CLIENT_ID;
src/cli/commands/onboard.ts:214:        '  2. export AKASHIK_GITHUB_CLIENT_ID="Iv1.<your_id>"',
src/cli/commands/onboard.ts:323:      env: { ...process.env, AKASHIK_HOME: home },
src/cli/commands/onboard.ts:367:        `The 'akashik trigger --room sessions' subprocess exited before the\nwizard's tail window finished. Common causes:\n  - AKASHIK_HOME mismatch (chosen home: ${home})\n  - claude_sessions source not provisioned (daemon will create it on next boot)\n  - first-run schema migration\n\nRetry manually with:\n  akashik trigger --room sessions`,
src/cli/commands/onboard.ts:390:    { detached: true, stdio: 'ignore', env: { ...process.env } },
src/cli/commands/onboard.ts:463:  --home DIR      data home (graph + vectors + model cache); also via $AKASHIK_HOME
src/cli/commands/onboard.ts:536:      `  · Everything stays under ${process.env.AKASHIK_HOME}`,
tests/bench-standard.test.ts:225:    if (process.env.AKASHIK_BENCH_OUT) {
tests/bench-standard.test.ts:242:      appendFileSync(process.env.AKASHIK_BENCH_OUT, JSON.stringify(report) + '\n');
tests/bench-write-gate.test.ts:161:  if (process.env.AKASHIK_BENCH_OUT) {
tests/bench-write-gate.test.ts:162:    appendBenchReport(process.env.AKASHIK_BENCH_OUT, JSON.stringify(report) + '\n');
tests/share-policy.test.ts:10: *   - sharePolicyModeFromEnv reads AKASHIK_REQUIRE_SIGNED_NODES
tests/share-policy.test.ts:69:  assert.equal(sharePolicyModeFromEnv({ AKASHIK_REQUIRE_SIGNED_NODES: '' }), 'soft');
tests/share-policy.test.ts:70:  assert.equal(sharePolicyModeFromEnv({ AKASHIK_REQUIRE_SIGNED_NODES: '0' }), 'soft');
tests/share-policy.test.ts:74:  assert.equal(sharePolicyModeFromEnv({ AKASHIK_REQUIRE_SIGNED_NODES: '1' }), 'strict');
tests/share-policy.test.ts:76:    sharePolicyModeFromEnv({ AKASHIK_REQUIRE_SIGNED_NODES: 'true' }),
tests/bench-longmemeval-real.test.ts:26: *   AKASHIK_BENCH_PUBLIC_REAL=1
tests/bench-longmemeval-real.test.ts:35: *   AKASHIK_BENCH_OUT=/path/to/report.jsonl   (optional)
tests/bench-longmemeval-real.test.ts:103:  if (process.env.AKASHIK_BENCH_PUBLIC_REAL !== '1') {
tests/bench-longmemeval-real.test.ts:104:    t.skip('AKASHIK_BENCH_PUBLIC_REAL not set — skipping real-corpus suite');
tests/bench-longmemeval-real.test.ts:114:  const explicitFile = process.env.LONGMEMEVAL_FILE;
tests/bench-longmemeval-real.test.ts:115:  const dir = process.env.LONGMEMEVAL_DIR;
tests/bench-longmemeval-real.test.ts:140:  // Set `AKASHIK_RERANK=1` to activate; `AKASHIK_RERANK_MODEL`
tests/bench-longmemeval-real.test.ts:149:  // `AKASHIK_LLM_RERANK=1`. When both are set, LISTWISE WINS
tests/bench-longmemeval-real.test.ts:153:  const RERANK_HEAD = Number(process.env.AKASHIK_RERANK_HEAD ?? (listwiseScorer ? 30 : 20));
tests/bench-longmemeval-real.test.ts:163:  const KMAX = Number(process.env.AKASHIK_BENCH_LME_KMAX ?? 50);
tests/bench-longmemeval-real.test.ts:168:    console.log(`  cross-encoder rerank ON · model=${process.env.AKASHIK_RERANK_MODEL ?? 'Xenova/ms-marco-MiniLM-L-6-v2'} · over-retrieve k=${overRetrieveK} → rerank top-${RERANK_HEAD} → final K=${K}`);
tests/bench-longmemeval-real.test.ts:172:  // When `AKASHIK_BENCH_CONTEXTUAL_ENRICH=1`, prepend
tests/bench-longmemeval-real.test.ts:315:    // `AKASHIK_BENCH_PROGRESS_EVERY_N` (default 25). Live tails
tests/bench-longmemeval-real.test.ts:320:    const PROGRESS_EVERY_N = Number(process.env.AKASHIK_BENCH_PROGRESS_EVERY_N ?? 25);
tests/bench-longmemeval-real.test.ts:379:    notes: `Real LongMemEval-S split=${splitName} — ${dataset.length} questions × per-question haystacks via Xenova all-MiniLM-L6-v2 (fp32, mean-pooled, 512 max_len). Source: ${datasetPath}. Rerank=${listwiseScorer ? `llm-listwise:${listwiseScorer.model}` : (reranker ? (process.env.AKASHIK_RERANK_MODEL ?? 'Xenova/ms-marco-MiniLM-L-6-v2') : 'off')} (over-retrieve k=${overRetrieveK}, head=${RERANK_HEAD}, final K=${K}). Enrich=${enrichOn ? 'on (date+session+participants prefix)' : 'off'}. T1 diagnostic: R@5/10/20/50 from a single KMAX=${KMAX} retrieval pass. Replaces the 20-session synthetic proxy.`,
tests/bench-longmemeval-real.test.ts:382:  if (process.env.AKASHIK_BENCH_OUT) {
tests/bench-longmemeval-real.test.ts:383:    appendFileSync(process.env.AKASHIK_BENCH_OUT, JSON.stringify(report) + '\n');
tests/rerank-tier.test.ts:61:test('pickRerankTier: AKASHIK_RERANK=0 forces none on any hardware', () => {
tests/rerank-tier.test.ts:78:  const env = rerankEnvFromProcess({ AKASHIK_RERANK_TIER: 'bogus' });
tests/rerank-tier.test.ts:152:    AKASHIK_RERANK_TIER: 'llm-listwise-small',
tests/rerank-tier.test.ts:153:    AKASHIK_RERANK_MODEL: 'qwen2.5:3b',
tests/rerank-tier.test.ts:154:    AKASHIK_RERANK_LATENCY_MS: '2500',
tests/rerank-tier.test.ts:155:    AKASHIK_RERANK_HEAD: '40',
tests/rerank-tier.test.ts:156:    AKASHIK_RERANK: '1',
tests/bench-locomo-real.test.ts:23: *   AKASHIK_BENCH_LLM_EXTRACTOR=1 swaps the containment metric
tests/bench-locomo-real.test.ts:31: *   AKASHIK_BENCH_PUBLIC_REAL=1
tests/bench-locomo-real.test.ts:41: *   AKASHIK_BENCH_OUT=/path/to/report.jsonl   (optional)
tests/bench-locomo-real.test.ts:222:  if (process.env.AKASHIK_BENCH_PUBLIC_REAL !== '1') {
tests/bench-locomo-real.test.ts:223:    t.skip('AKASHIK_BENCH_PUBLIC_REAL not set — skipping real-corpus suite');
tests/bench-locomo-real.test.ts:226:  const dir = process.env.LOCOMO_DIR;
tests/bench-locomo-real.test.ts:236:  const useLlmExtractor = process.env.AKASHIK_BENCH_LLM_EXTRACTOR === '1';
tests/bench-locomo-real.test.ts:239:    t.skip('AKASHIK_BENCH_LLM_EXTRACTOR=1 but no extractor resolvable from env (set AKASHIK_OLLAMA_URL or AKASHIK_BENCH_LLM_EXTRACTOR_FIXTURE=1)');
tests/bench-locomo-real.test.ts:260:  const RERANK_HEAD = Number(process.env.AKASHIK_RERANK_HEAD ?? (listwiseScorer ? 30 : 20));
tests/bench-locomo-real.test.ts:267:  const KMAX = Number(process.env.AKASHIK_BENCH_LOCOMO_KMAX ?? 50);
tests/bench-locomo-real.test.ts:272:    console.log(`  cross-encoder rerank ON · model=${process.env.AKASHIK_RERANK_MODEL ?? 'Xenova/ms-marco-MiniLM-L-6-v2'} · over-retrieve k=${overRetrieveK} → rerank top-${RERANK_HEAD} → final K=${K}`);
tests/bench-locomo-real.test.ts:415:        // Tunable via `AKASHIK_BENCH_PROGRESS_EVERY_N` (default 25).
tests/bench-locomo-real.test.ts:416:        const PROGRESS_EVERY_N = Number(process.env.AKASHIK_BENCH_PROGRESS_EVERY_N ?? 25);
tests/bench-locomo-real.test.ts:474:  // when the extractor was wired in (`AKASHIK_BENCH_LLM_EXTRACTOR=1`).
tests/bench-locomo-real.test.ts:536:    notes: `Real LoCoMo factual subset (categories 1/2/3) — ${dataset.length} conversations × ${totalQ} questions via Xenova all-MiniLM-L6-v2 (fp32, mean-pooled, 512 max_len). Harmonic mean of evidence-session recall and answer-token containment in top-${K} retrieved sessions. Rerank=${listwiseScorer ? `llm-listwise:${listwiseScorer.model}` : (reranker ? (process.env.AKASHIK_RERANK_MODEL ?? 'Xenova/ms-marco-MiniLM-L-6-v2') : 'off')} (over-retrieve k=${overRetrieveK}, head=${RERANK_HEAD}, final K=${K}). Enrich=${enrichOn ? 'on (date+session+participants prefix, scoring on raw text)' : 'off'}. Replaces the 4-persona synthetic proxy.${extractor ? ` LLM extractor: ${extractor.model} (SQuAD-F1 / EM reported alongside).` : ''}`,
tests/bench-locomo-real.test.ts:539:  if (process.env.AKASHIK_BENCH_OUT) {
tests/bench-locomo-real.test.ts:540:    appendFileSync(process.env.AKASHIK_BENCH_OUT, JSON.stringify(report) + '\n');
tests/bench-locomo-real.test.ts:565:  // AKASHIK_BENCH_LLM_EXTRACTOR=1 path (squadF1 metric, reported
tests/error-hints.test.ts:56:  assert.match(h!, /AKASHIK_MODEL_CACHE/);
tests/bench-locomo-synth.test.ts:44: *   set `AKASHIK_BENCH_LLM_EXTRACTOR=1` to swap the
tests/bench-locomo-synth.test.ts:479:    if (process.env.AKASHIK_BENCH_OUT) {
tests/bench-locomo-synth.test.ts:480:      appendFileSync(process.env.AKASHIK_BENCH_OUT, JSON.stringify(report) + '\n');
tests/bench-scifact-real.test.ts:17: *   AKASHIK_BENCH_PUBLIC_REAL=1
tests/bench-scifact-real.test.ts:27: *   AKASHIK_BENCH_OUT=/path/to/report.jsonl   (optional)
tests/bench-scifact-real.test.ts:107:  if (process.env.AKASHIK_BENCH_PUBLIC_REAL !== '1') {
tests/bench-scifact-real.test.ts:108:    t.skip('AKASHIK_BENCH_PUBLIC_REAL not set — skipping real-corpus suite');
tests/bench-scifact-real.test.ts:111:  const dir = process.env.BEIR_SCIFACT_DIR;
tests/bench-scifact-real.test.ts:152:    // Activated via AKASHIK_RERANK=1; model selectable via
tests/bench-scifact-real.test.ts:153:    // AKASHIK_RERANK_MODEL (default Xenova/ms-marco-MiniLM-L-6-v2,
tests/bench-scifact-real.test.ts:160:      console.log(`  cross-encoder rerank ON · model=${process.env.AKASHIK_RERANK_MODEL ?? 'Xenova/ms-marco-MiniLM-L-6-v2'} · over-retrieve k=${overRetrieveK} → rerank top-${RERANK_HEAD} → NDCG@${K}`);
tests/bench-scifact-real.test.ts:247:      notes: `Real BEIR SciFact — ${corpus.length} docs × ${queries.length} test queries via Xenova all-MiniLM-L6-v2 (fp32, mean-pooled, 512 max_len). Rerank=${reranker ? (process.env.AKASHIK_RERANK_MODEL ?? 'Xenova/ms-marco-MiniLM-L-6-v2') : 'off'} (over-retrieve k=${overRetrieveK}, head=${RERANK_HEAD}). Replaces the 30-doc labeled proxy.`,
tests/bench-scifact-real.test.ts:250:    if (process.env.AKASHIK_BENCH_OUT) {
tests/bench-scifact-real.test.ts:251:      appendFileSync(process.env.AKASHIK_BENCH_OUT, JSON.stringify(report) + '\n');
tests/summariser.test.ts:9: *   - summariserFromEnv() respects AKASHIK_SUMMARISER=fixture
tests/summariser.test.ts:108:    saved[k] = process.env[k];
tests/summariser.test.ts:109:    if (env[k] === undefined) delete process.env[k];
tests/summariser.test.ts:110:    else process.env[k] = env[k];
tests/summariser.test.ts:116:      if (saved[k] === undefined) delete process.env[k];
tests/summariser.test.ts:117:      else process.env[k] = saved[k];
tests/summariser.test.ts:122:test('summariserFromEnv: AKASHIK_SUMMARISER=fixture → fixture adapter', async () => {
tests/summariser.test.ts:124:    { AKASHIK_SUMMARISER: 'fixture', AKASHIK_SUMMARISER_FIXTURE: 'env-default' },
tests/summariser.test.ts:135:  await withEnv({ AKASHIK_SUMMARISER: undefined }, () => {
tests/summariser.test.ts:149:  await withEnv({ AKASHIK_SUMMARISER: undefined }, () => {
tests/phase18.production-net.test.ts:12: * `AKASHIK_SKIP_SLOW=1`. Unit + structural tiers run always.
tests/phase18.production-net.test.ts:580:// Slow: opt-out via AKASHIK_SKIP_SLOW=1
tests/phase18.production-net.test.ts:596:const SKIP_SLOW = process.env['AKASHIK_SKIP_SLOW'] === '1';
tests/bench-auto-forget.test.ts:185:  if (process.env.AKASHIK_BENCH_OUT) {
tests/bench-auto-forget.test.ts:186:    appendBenchReport(process.env.AKASHIK_BENCH_OUT, JSON.stringify(report) + '\n');
src/application/federated-search.ts:328:    || process.env.AKASHIK_SEARCH_GOSSIP === '0';
tests/bench-retention-band.test.ts:130:  if (process.env.AKASHIK_BENCH_OUT) {
tests/bench-retention-band.test.ts:131:    appendBenchReport(process.env.AKASHIK_BENCH_OUT, JSON.stringify(report) + '\n');
tests/bench-akashik-federation.test.ts:38: *   AKASHIK_BENCH_OUT=/path/to/run.jsonl   (optional)
tests/bench-akashik-federation.test.ts:136:  if (process.env.AKASHIK_BENCH_F !== '1') {
tests/bench-akashik-federation.test.ts:140:  const dir = process.env.LOCOMO_DIR;
tests/bench-akashik-federation.test.ts:155:  const numPeers = Number(process.env.AKASHIK_BENCH_PEERS ?? 10);
tests/bench-akashik-federation.test.ts:156:  const numSteps = Number(process.env.AKASHIK_BENCH_STEPS ?? 2000);
tests/bench-akashik-federation.test.ts:157:  const offlineProbability = Number(process.env.AKASHIK_BENCH_OFFLINE ?? 0.2);
tests/bench-akashik-federation.test.ts:158:  const zipfAlpha = Number(process.env.AKASHIK_BENCH_ZIPF ?? 1.0);
tests/bench-akashik-federation.test.ts:159:  const seed = Number(process.env.AKASHIK_BENCH_SEED ?? 42);
tests/bench-akashik-federation.test.ts:160:  const initialShardFraction = Number(process.env.AKASHIK_BENCH_SHARD ?? 0.05);
tests/bench-akashik-federation.test.ts:161:  const windowSize = Number(process.env.AKASHIK_BENCH_WINDOW ?? 100);
tests/bench-akashik-federation.test.ts:230:  if (process.env.AKASHIK_BENCH_OUT) {
tests/bench-akashik-federation.test.ts:231:    appendFileSync(process.env.AKASHIK_BENCH_OUT, JSON.stringify(report) + '\n');
tests/llm-extractor.test.ts:11: * when `AKASHIK_BENCH_LLM_EXTRACTOR=1` and a reachable Ollama is
tests/phase16.share-crdt.test.ts:68:/** Create a hermetic tmp dir. Caller must set/restore AKASHIK_HOME and rmSync on teardown. */
tests/bench-beta-calibration.test.ts:99:  if (process.env.AKASHIK_BENCH_OUT) {
tests/bench-beta-calibration.test.ts:100:    appendBenchReport(process.env.AKASHIK_BENCH_OUT, JSON.stringify(report) + '\n');
src/cli/commands/daemon.ts:38:      env: { ...process.env },
src/cli/commands/daemon.ts:183:  // $AKASHIK_HOME/daemon.sock, 0600.
src/cli/commands/metrics.ts:24:  process.env.AKASHIK_HOME ?? join(homedir(), '.akashik');
src/cli/commands/metrics.ts:68: *   - AKASHIK_DENY_ON_TERMINAL=0 (soft persuasion only): some
src/cli/commands/metrics.ts:71: *   - AKASHIK_DENY_ON_TERMINAL=1 (hard deny): bypass should
src/cli/commands/metrics.ts:129:    console.log(`  off (AKASHIK_DENY_ON_TERMINAL=0 is the default) or the harness`);
src/cli/commands/doctor.ts:51:  return process.env.AKASHIK_HOME || join(homedir(), '.akashik');
src/infrastructure/rust-retrieval.ts:120:   * `$AKASHIK_RUST_BIN` env var or this option.
src/infrastructure/rust-retrieval.ts:128:  const envBin = process.env.AKASHIK_RUST_BIN;
src/cli/commands/bench.ts:5: * `AKASHIK_BENCH_OUT` set so each suite appends a
src/cli/commands/bench.ts:56: * the Hetzner box (with `AKASHIK_BENCH_PUBLIC_REAL=1` and the
src/cli/commands/bench.ts:101:          env: { ...process.env, AKASHIK_BENCH_OUT: outFile },
src/cli/commands/peers-rep.ts:34:  process.env.AKASHIK_HOME ?? join(homedir(), '.akashik');
src/cli/commands/entity.ts:8: * The registry lives at $AKASHIK_HOME/entities.json. It's the
src/cli/commands/publish.ts:19:  const clientId = process.env.X_CLIENT_ID;
src/cli/commands/publish.ts:23:    clientSecret: process.env.X_CLIENT_SECRET,
src/cli/runtime.ts:37:  process.env.AKASHIK_HOME ?? join(homedir(), '.akashik');
src/cli/runtime.ts:41: *   AKASHIK_VECTOR_QUANTIZATION=binary-512   → returns 512
src/cli/runtime.ts:42: *   AKASHIK_VECTOR_QUANTIZATION=binary-256   → returns 256
src/cli/runtime.ts:53:  const raw = process.env.AKASHIK_VECTOR_QUANTIZATION;
src/cli/runtime.ts:65: * Backends (selected by `AKASHIK_EMBEDDER_BACKEND`):
src/cli/runtime.ts:75: *   AKASHIK_EMBEDDER_MODEL   — 'minilm' | 'nomic' | 'bge-base'
src/cli/runtime.ts:76: *   AKASHIK_RUST_BIN         — path to embed_server binary
src/cli/runtime.ts:82:  const backend = (process.env.AKASHIK_EMBEDDER_BACKEND ?? 'xenova').toLowerCase();
src/cli/runtime.ts:91:  // Opt-out via AKASHIK_EMBEDDER_BATCH=off for the serial path
src/cli/runtime.ts:94:  const batchingEnabled = (process.env.AKASHIK_EMBEDDER_BATCH ?? 'on').toLowerCase() !== 'off';
src/cli/runtime.ts:95:  const batchSize = parseInt(process.env.AKASHIK_EMBEDDER_BATCH_SIZE ?? '32', 10) || 32;
src/cli/runtime.ts:96:  const batchWaitMs = parseInt(process.env.AKASHIK_EMBEDDER_BATCH_MS ?? '20', 10) || 20;
src/cli/runtime.ts:100:      const model = (process.env.AKASHIK_EMBEDDER_MODEL ?? 'minilm').toLowerCase();
src/cli/runtime.ts:105:          `AKASHIK_EMBEDDER_MODEL='${model}' — supported: minilm, nomic, bge-base`,
src/cli/runtime.ts:201:        binaryOnly: (process.env.AKASHIK_VECTOR_FP32_DROP ?? '').toLowerCase() === 'true',
src/cli/commands/consolidate.ts:63:  let model = process.env.AKASHIK_OLLAMA_MODEL ?? 'qwen2.5:1.5b';
src/cli/commands/consolidate.ts:243:      console.error(`  start it with: ollama serve  (or configure AKASHIK_OLLAMA_URL)`);
src/cli/commands/consolidate.ts:246:    console.error(`consolidate: ollama ${ping.value} @ ${process.env.AKASHIK_OLLAMA_URL ?? 'http://localhost:11434'}, model=${parsed.model}`);
src/cli/commands/consolidate.ts:449:  console.log('Set AKASHIK_OLLAMA_URL / AKASHIK_OLLAMA_MODEL to override.');

exec
/bin/zsh -lc "sed -n '1,220p' tests/bench-standard.test.ts" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
/**
 * Standardized benchmarks — BEIR/HotPotQA + LOCOMO-style evaluation.
 *
 * Uses the SAME evaluation methodology as competitors:
 * - Cognee: 24 HotPotQA multi-hop questions, NDCG@10
 * - mem0: LOCOMO conversational memory, LLM-as-Judge score
 * - mcp-memory-service: R@5 on custom dataset
 *
 * We use a curated HotPotQA-style subset (multi-hop questions that
 * require finding information across 2+ documents) plus temporal
 * and knowledge-update queries from LOCOMO's evaluation framework.
 *
 * Metrics: NDCG@10, MAP@10, R@5, R@10, P@5, MRR — standard BEIR metrics.
 * All measured with real ONNX embeddings (all-MiniLM-L6-v2).
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { fileGraphRepository } from '../src/infrastructure/graph-repository.js';
import { openSqliteVectorIndex } from '../src/infrastructure/vector-index.js';
import { xenovaEmbedder } from '../src/infrastructure/embedders.js';
import { indexNode, searchGlobal } from '../src/application/use-cases.js';
import type { BenchSuiteReport } from '../src/domain/bench-types.js';

// ─────────── HotPotQA-style multi-hop corpus ───────────
// Each question requires reasoning across 2+ documents.
// Format follows BEIR: corpus of passages, queries with relevant doc IDs.

const CORPUS: Record<string, { title: string; text: string }> = {
  'wiki-albert-einstein': { title: 'Albert Einstein', text: 'Albert Einstein was a German-born theoretical physicist who developed the theory of relativity. He received the Nobel Prize in Physics in 1921 for his explanation of the photoelectric effect. Einstein was born in Ulm in the Kingdom of Württemberg in the German Empire on 14 March 1879.' },
  'wiki-photoelectric': { title: 'Photoelectric effect', text: 'The photoelectric effect is the emission of electrons when electromagnetic radiation such as light hits a material. Einstein explained this phenomenon in 1905 using the concept of photons. This work was cited when he received the Nobel Prize in 1921.' },
  'wiki-nobel-physics': { title: 'Nobel Prize in Physics', text: 'The Nobel Prize in Physics is awarded annually by the Royal Swedish Academy of Sciences. Notable laureates include Albert Einstein (1921), Niels Bohr (1922), and Richard Feynman (1965). The prize recognizes outstanding contributions to physics.' },
  'wiki-niels-bohr': { title: 'Niels Bohr', text: 'Niels Bohr was a Danish physicist who made foundational contributions to understanding atomic structure and quantum theory. He received the Nobel Prize in Physics in 1922. Bohr mentored many physicists including Werner Heisenberg.' },
  'wiki-heisenberg': { title: 'Werner Heisenberg', text: 'Werner Heisenberg was a German theoretical physicist and a key pioneer of quantum mechanics. He received the Nobel Prize in Physics in 1932 for the creation of quantum mechanics. He studied under Niels Bohr in Copenhagen.' },
  'wiki-quantum-mechanics': { title: 'Quantum mechanics', text: 'Quantum mechanics is a fundamental theory in physics that provides a description of nature at the scale of atoms and subatomic particles. Key contributors include Max Planck, Albert Einstein, Niels Bohr, Werner Heisenberg, and Erwin Schrödinger.' },
  'wiki-sqlite': { title: 'SQLite', text: 'SQLite is a C-language library that implements a small fast full-featured SQL database engine. It is the most widely deployed database engine in the world. SQLite is built into all mobile phones and most computers and comes bundled inside countless applications.' },
  'wiki-vector-db': { title: 'Vector database', text: 'A vector database is a collection of data stored as mathematical representations. Vector databases are used for similarity search and are essential components of retrieval augmented generation (RAG) systems. Popular implementations include Pinecone, Weaviate, and Qdrant.' },
  'wiki-rag': { title: 'Retrieval-augmented generation', text: 'Retrieval-augmented generation (RAG) is a technique that combines a retrieval system with a generative model. The retrieval component searches a knowledge base using vector similarity to find relevant context which is then provided to the language model for generation.' },
  'wiki-transformer': { title: 'Transformer architecture', text: 'The transformer is a deep learning architecture developed by Google researchers in 2017. It uses self-attention mechanisms and has become the foundation for models like BERT, GPT, and T5. The original paper is titled Attention Is All You Need.' },
  'wiki-bert': { title: 'BERT', text: 'BERT (Bidirectional Encoder Representations from Transformers) is a language model developed by Google. It uses the transformer encoder architecture and was pre-trained on a large corpus of text. BERT revolutionized NLP by enabling transfer learning.' },
  'wiki-attention': { title: 'Attention mechanism', text: 'The attention mechanism allows neural networks to focus on relevant parts of the input when producing output. It was first used in sequence-to-sequence models for machine translation and later became central to the transformer architecture.' },
  'wiki-knowledge-graph': { title: 'Knowledge graph', text: 'A knowledge graph is a structured representation of facts where entities are nodes and relationships are edges. Google introduced the term in 2012. Knowledge graphs are used in search engines, recommendation systems, and question answering.' },
  'wiki-graphrag': { title: 'GraphRAG', text: 'GraphRAG combines knowledge graphs with retrieval-augmented generation. Instead of flat vector retrieval, GraphRAG traverses graph relationships to find multi-hop connections. Microsoft Research published a paper on GraphRAG in 2024.' },
  'wiki-embedding': { title: 'Word embedding', text: 'Word embeddings are dense vector representations of words where semantically similar words have similar vectors. Word2Vec, GloVe, and FastText are popular word embedding methods. Modern approaches use contextual embeddings from transformer models like BERT.' },
};

// Multi-hop queries (require information from 2+ documents)
const QUERIES: Array<{
  id: string;
  query: string;
  relevant: string[];
  type: 'multi-hop' | 'single-hop' | 'temporal' | 'comparison';
}> = [
  // Multi-hop: Einstein → Nobel → photoelectric
  { id: 'q1', query: 'What phenomenon did the 1921 Nobel Prize in Physics recipient explain?', relevant: ['wiki-albert-einstein', 'wiki-photoelectric', 'wiki-nobel-physics'], type: 'multi-hop' },
  // Multi-hop: Bohr → mentored → Heisenberg → quantum
  { id: 'q2', query: 'Who mentored the physicist that created quantum mechanics?', relevant: ['wiki-niels-bohr', 'wiki-heisenberg'], type: 'multi-hop' },
  // Multi-hop: transformer → attention → BERT
  { id: 'q3', query: 'What architecture uses attention mechanisms and led to BERT?', relevant: ['wiki-transformer', 'wiki-attention', 'wiki-bert'], type: 'multi-hop' },
  // Multi-hop: RAG → vector DB → knowledge graph
  { id: 'q4', query: 'What type of database is used in retrieval augmented generation systems?', relevant: ['wiki-rag', 'wiki-vector-db'], type: 'multi-hop' },
  // Multi-hop: GraphRAG → knowledge graph → RAG
  { id: 'q5', query: 'How does GraphRAG differ from standard retrieval augmented generation?', relevant: ['wiki-graphrag', 'wiki-knowledge-graph', 'wiki-rag'], type: 'multi-hop' },
  // Comparison: Einstein vs Bohr Nobel years
  { id: 'q6', query: 'Did Einstein or Bohr receive their Nobel Prize first?', relevant: ['wiki-albert-einstein', 'wiki-niels-bohr', 'wiki-nobel-physics'], type: 'comparison' },
  // Single-hop: direct SQLite lookup
  { id: 'q7', query: 'What is the most widely deployed database engine?', relevant: ['wiki-sqlite'], type: 'single-hop' },
  // Single-hop: embeddings
  { id: 'q8', query: 'Dense vector representations of words where similar words are close', relevant: ['wiki-embedding'], type: 'single-hop' },
  // Multi-hop: quantum mechanics → contributors → Nobel prizes
  { id: 'q9', query: 'Which Nobel laureates contributed to quantum mechanics?', relevant: ['wiki-quantum-mechanics', 'wiki-heisenberg', 'wiki-niels-bohr', 'wiki-albert-einstein'], type: 'multi-hop' },
  // Multi-hop: attention → transformer → Attention Is All You Need
  { id: 'q10', query: 'What paper introduced the architecture that uses self-attention?', relevant: ['wiki-transformer', 'wiki-attention'], type: 'multi-hop' },
];

// ─────────── BEIR standard metrics ───────────

const ndcgAtK = (retrieved: string[], relevant: Set<string>, k: number): number => {
  let dcg = 0;
  for (let i = 0; i < Math.min(retrieved.length, k); i++) {
    if (relevant.has(retrieved[i])) dcg += 1 / Math.log2(i + 2);
  }
  let idcg = 0;
  for (let i = 0; i < Math.min(relevant.size, k); i++) idcg += 1 / Math.log2(i + 2);
  return idcg > 0 ? dcg / idcg : 0;
};

const mapAtK = (retrieved: string[], relevant: Set<string>, k: number): number => {
  let sum = 0;
  let hits = 0;
  for (let i = 0; i < Math.min(retrieved.length, k); i++) {
    if (relevant.has(retrieved[i])) {
      hits++;
      sum += hits / (i + 1);
    }
  }
  return relevant.size > 0 ? sum / Math.min(relevant.size, k) : 0;
};

const recallAtK = (retrieved: string[], relevant: Set<string>, k: number): number => {
  const hits = retrieved.slice(0, k).filter((id) => relevant.has(id)).length;
  return relevant.size > 0 ? hits / relevant.size : 0;
};

const precisionAtK = (retrieved: string[], relevant: Set<string>, k: number): number => {
  return retrieved.slice(0, k).filter((id) => relevant.has(id)).length / k;
};

const mrr = (retrieved: string[], relevant: Set<string>): number => {
  for (let i = 0; i < retrieved.length; i++) {
    if (relevant.has(retrieved[i])) return 1 / (i + 1);
  }
  return 0;
};

// ─────────── benchmark ───────────

test('BEIR/HotPotQA-style: multi-hop retrieval with real ONNX embeddings', async () => {
  const tmp = mkdtempSync(join(tmpdir(), 'wi-beir-'));
  try {
    const graphs = fileGraphRepository(join(tmp, 'graph.json'));
    const vectors = (await openSqliteVectorIndex({ path: join(tmp, 'vectors.db') }))._unsafeUnwrap();
    const embedder = xenovaEmbedder({ cacheDir: join(tmp, 'models') });
    const deps = { graphs, vectors, embedder };
    const useCase = indexNode(deps);

    // Index corpus
    console.log(`\n  Indexing ${Object.keys(CORPUS).length} Wikipedia passages with real MiniLM...`);
    const indexStart = performance.now();
    for (const [id, doc] of Object.entries(CORPUS)) {
      await useCase({
        node: { id, label: doc.title, file_type: 'document', source_file: `wiki/${id}` },
        text: `${doc.title}. ${doc.text}`,
        room: 'beir',
      });
    }
    const indexTime = performance.now() - indexStart;
    console.log(`  Indexed in ${(indexTime / 1000).toFixed(1)}s`);

    // Run queries
    type QueryResult = {
      id: string; query: string; type: string;
      ndcg10: number; map10: number; r5: number; r10: number; p5: number; mrr_val: number;
      latency: number;
    };
    const results: QueryResult[] = [];

    for (const q of QUERIES) {
      const start = performance.now();
      const searchResult = (await searchGlobal(deps)({ text: q.query, k: 10 }))._unsafeUnwrap();
      const latency = performance.now() - start;
      const retrieved = searchResult.map((r) => r.node_id);
      const relevant = new Set(q.relevant);

      results.push({
        id: q.id, query: q.query, type: q.type,
        ndcg10: ndcgAtK(retrieved, relevant, 10),
        map10: mapAtK(retrieved, relevant, 10),
        r5: recallAtK(retrieved, relevant, 5),
        r10: recallAtK(retrieved, relevant, 10),
        p5: precisionAtK(retrieved, relevant, 5),
        mrr_val: mrr(retrieved, relevant),
        latency,
      });
    }

    // Aggregate by query type
    const byType = new Map<string, QueryResult[]>();
    for (const r of results) {
      const arr = byType.get(r.type) ?? [];
      arr.push(r);
      byType.set(r.type, arr);
    }

    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
    const overall = {
      ndcg10: avg(results.map((r) => r.ndcg10)),
      map10: avg(results.map((r) => r.map10)),
      r5: avg(results.map((r) => r.r5)),
      r10: avg(results.map((r) => r.r10)),
      p5: avg(results.map((r) => r.p5)),
      mrr: avg(results.map((r) => r.mrr_val)),
      latency_p50: [...results.map((r) => r.latency)].sort((a, b) => a - b)[5] ?? 0,
    };

    console.log(`\n  ╔═══════════════════════════════════════════════════════════╗`);
    console.log(`  ║  BEIR/HotPotQA-style Benchmark (akashik v1.1)       ║`);
    console.log(`  ║  ${Object.keys(CORPUS).length} passages, ${QUERIES.length} queries, real all-MiniLM-L6-v2          ║`);
    console.log(`  ╠═══════════════════════════════════════════════════════════╣`);
    console.log(`  ║  NDCG@10:   ${(overall.ndcg10 * 100).toFixed(1).padStart(6)}%                                   ║`);
    console.log(`  ║  MAP@10:    ${(overall.map10 * 100).toFixed(1).padStart(6)}%                                   ║`);
    console.log(`  ║  Recall@5:  ${(overall.r5 * 100).toFixed(1).padStart(6)}%                                   ║`);
    console.log(`  ║  Recall@10: ${(overall.r10 * 100).toFixed(1).padStart(6)}%                                   ║`);
    console.log(`  ║  P@5:       ${(overall.p5 * 100).toFixed(1).padStart(6)}%                                   ║`);
    console.log(`  ║  MRR:       ${overall.mrr.toFixed(3).padStart(6)}                                    ║`);
    console.log(`  ║  Latency:   ${overall.latency_p50.toFixed(1).padStart(6)}ms p50                              ║`);
    console.log(`  ╠═══════════════════════════════════════════════════════════╣`);

    for (const [type, typeResults] of byType) {
      const ta = {
        ndcg10: avg(typeResults.map((r) => r.ndcg10)),
        r5: avg(typeResults.map((r) => r.r5)),
        mrr: avg(typeResults.map((r) => r.mrr_val)),
      };
      console.log(`  ║  ${type.padEnd(12)} NDCG@10=${(ta.ndcg10 * 100).toFixed(0).padStart(3)}%  R@5=${(ta.r5 * 100).toFixed(0).padStart(3)}%  MRR=${ta.mrr.toFixed(2).padStart(4)}  ║`);
    }
    console.log(`  ╠═══════════════════════════════════════════════════════════╣`);
    console.log(`  ║  Competitor comparison:                                  ║`);
    console.log(`  ║    Cognee HotPotQA:           NDCG not published         ║`);
    console.log(`  ║    mem0 LOCOMO:               67.1% LLM-as-Judge         ║`);
    console.log(`  ║    mcp-memory-service:        86.0% R@5 (custom)         ║`);
    console.log(`  ║    akashik (this run):   ${(overall.r5 * 100).toFixed(1)}% R@5, ${(overall.ndcg10 * 100).toFixed(1)}% NDCG@10  ║`);
    console.log(`  ╚═══════════════════════════════════════════════════════════╝`);

    console.log(`\n  Per-query:`);
    for (const r of results) {

exec
/bin/zsh -lc "sed -n '1,220p' tests/bench-locomo-real.test.ts" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
/**
 * Benchmark — real LoCoMo factual subset, harmonic-mean F1 (Phase 23.7).
 *
 * Replaces the 4-persona / 40-session synthetic fixture in
 * `bench-locomo-synth.test.ts` with the actual snap-research/locomo
 * dataset (EMNLP 2024). Same scorer: harmonic mean of evidence-recall
 * + answer-token-containment in top-3 retrieved evidence. The token-
 * F1-on-full-summary metric is intentionally NOT used — see the synth
 * suite header for the length-mismatch precision bug history.
 *
 * Factual subset: questions where `category ∈ {1, 2, 3}` —
 *   1 = single-hop, 2 = multi-hop, 3 = temporal reasoning.
 * Categories 4 (open-domain) and 5 (adversarial) are excluded; both
 * require an LLM judge to score fairly and don't belong in the
 * retrieval-only dimension.
 *
 * Per LoCoMo convention, `evidence` is a list of `"D<session>:<turn>"`
 * strings. We collapse to the set of source SESSIONS — akashik
 * indexes one node per session, not per turn, so session-level
 * evidence is the right granularity.
 *
 * Optional LLM extractor (env-gated, off by default):
 *   AKASHIK_BENCH_LLM_EXTRACTOR=1 swaps the containment metric
 *   for a real Ollama Phi-4-mini extracted answer scored via
 *   SQuAD-style F1. Wired here as a stub — the extractor itself is a
 *   Phase 23.8 follow-up. With the flag off (default) we report the
 *   pure-compute harmonic-mean dimension.
 *
 * Environment contract:
 *
 *   AKASHIK_BENCH_PUBLIC_REAL=1
 *     Master gate; off by default.
 *
 *   LOCOMO_DIR=/path/to/locomo
 *     Directory containing:
 *         locomo10.json    (10 conversations, ~200 factual QA pairs)
 *     Get it via:
 *         git clone https://github.com/snap-research/locomo $LOCOMO_DIR/repo
 *         cp $LOCOMO_DIR/repo/data/locomo10.json $LOCOMO_DIR/
 *
 *   AKASHIK_BENCH_OUT=/path/to/report.jsonl   (optional)
 *     Composite-runner sink.
 *
 * Embedder: real Xenova all-MiniLM-L6-v2 (no fixture).
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { fileGraphRepository } from '../src/infrastructure/graph-repository.js';
import { openSqliteVectorIndex } from '../src/infrastructure/vector-index.js';
import { xenovaEmbedder, batchingEmbedder } from '../src/infrastructure/embedders.js';
import { indexNode, searchByRoom } from '../src/application/use-cases.js';
import { llmExtractorFromEnv } from '../src/infrastructure/llm-extractor.js';
import { squadF1, squadExactMatch } from '../src/domain/llm-extractor.js';
import { rerankMatches } from '../src/domain/cross-rerank.js';
import { crossEncoderFromEnv } from '../src/infrastructure/cross-encoder.js';
import { rerankMatchesListwise } from '../src/domain/llm-listwise-rerank.js';
import { listwiseScorerFromEnv } from '../src/infrastructure/llm-listwise-rerank.js';
import { ndcgAtK, reciprocalRank } from '../src/domain/eval-metrics.js';
import { enrichText, isContextualEnrichEnabled } from '../src/domain/contextual-enrich.js';
import type { BenchSuiteReport } from '../src/domain/bench-types.js';
import type { Room } from '../src/domain/graph.js';
import type { Match } from '../src/domain/vectors.js';

const ROOM = 'locomo' as Room;
const DIM = 384;
const K = 3;
const FACTUAL_CATEGORIES = new Set([1, 2, 3]);

interface LocomoTurn {
  readonly speaker?: string;
  readonly text?: string;
  readonly dia?: string;
}

interface LocomoQa {
  readonly question: string;
  /** Real LoCoMo answers can be string | number | date — coerce via `toAnswerString` at the call site. */
  readonly answer: unknown;
  readonly evidence?: readonly string[];
  readonly category?: number;
  readonly adversarial_answer?: unknown;
}

interface LocomoSample {
  readonly sample_id?: string;
  readonly conversation: Readonly<Record<string, unknown>>;
  readonly qa: readonly LocomoQa[];
}

// ─────────────── conversation parsing ─────────────

interface ParsedSession {
  readonly nodeId: string;        // e.g. `${sample_id}/session_1`
  readonly sessionTag: string;    // e.g. `D1` — what evidence refs use
  readonly summary: string;
  readonly fetchedAt: string;
  /** Distinct speaker names in this session — fed into E11 contextual enrichment. */
  readonly participants: readonly string[];
}

/**
 * Pull the ordered list of `session_N` keys out of a conversation
 * object, returning each as a flat text blob plus the LoCoMo tag (`D1`,
 * `D2`, …) that evidence strings reference.
 */
const parseSessions = (sample: LocomoSample): ParsedSession[] => {
  const conv = sample.conversation;
  const sampleTag = sample.sample_id ?? 'sample';
  // session keys follow `session_N`; date keys `session_N_date_time`.
  const sessionKeys = Object.keys(conv)
    .filter((k) => /^session_\d+$/.test(k))
    .sort((a, b) => Number(a.slice('session_'.length)) - Number(b.slice('session_'.length)));

  const out: ParsedSession[] = [];
  for (const key of sessionKeys) {
    const idx = Number(key.slice('session_'.length));
    const sessionTag = `D${idx}`;
    const turns = conv[key];
    const dateRaw = conv[`${key}_date_time`];
    const fetchedAt = typeof dateRaw === 'string' && dateRaw.length > 0
      ? dateRaw
      : '2026-05-19T00:00:00Z';
    if (!Array.isArray(turns)) continue;

    const parts: string[] = [];
    const speakerSet = new Set<string>();
    for (const turn of turns) {
      if (typeof turn !== 'object' || turn === null) continue;
      const t = turn as LocomoTurn;
      const speaker = (t.speaker ?? '').toString().trim();
      const content = ((t.text ?? t.dia ?? '') as string).replace(/\s+/g, ' ').trim();
      if (content.length === 0) continue;
      if (speaker.length > 0) speakerSet.add(speaker);
      parts.push(speaker.length > 0 ? `${speaker}: ${content.slice(0, 1000)}` : content.slice(0, 1000));
    }
    const summary = parts.join('\n');
    if (summary.length === 0) continue;

    out.push({
      nodeId: `${sampleTag}/${key}`,
      sessionTag,
      summary,
      fetchedAt,
      participants: Array.from(speakerSet),
    });
  }
  return out;
};

/**
 * `D1:5` → `D1`. We score evidence at session granularity (one node
 * per session). Empty / malformed entries are dropped.
 */
const evidenceToSessionTags = (evidence: readonly string[] | undefined): Set<string> => {
  const out = new Set<string>();
  if (!evidence) return out;
  for (const ev of evidence) {
    if (typeof ev !== 'string') continue;
    const colon = ev.indexOf(':');
    const tag = (colon >= 0 ? ev.slice(0, colon) : ev).trim();
    if (tag.length > 0) out.add(tag);
  }
  return out;
};

// ─────────────── token containment scorer (same as synth suite) ─────────────

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'that', 'this', 'was', 'were',
  'have', 'has', 'had', 'are', 'her', 'his', 'him', 'she', 'they',
  'their', 'them', 'into', 'than', 'who', 'what', 'when', 'where',
  'how', 'why', 'which', 'will', 'all', 'any', 'one', 'two', 'three',
  'but', 'not', 'out', 'over', 'about', 'also', 'some', 'more',
]);

/**
 * Coerce arbitrary input to a string for token extraction. Real LoCoMo
 * answers occasionally arrive as numbers, dates, or short arrays in
 * the JSON; the synthetic adapter declared `answer: string` but the
 * upstream dataset is loosely typed, so we defensively stringify
 * rather than crash. `null` / `undefined` map to `""`; arrays are
 * joined with spaces; everything else gets `String(...)`.
 */
const toAnswerString = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map((x) => toAnswerString(x)).join(' ');
  return String(v);
};

const keyTokens = (s: unknown): Set<string> => {
  const out = new Set<string>();
  const str = toAnswerString(s);
  for (const t of str.toLowerCase().split(/[^a-z0-9]+/)) {
    if (t.length > 2 && !STOPWORDS.has(t)) out.add(t);
  }
  return out;
};

const answerTokenContainment = (retrievedText: unknown, goldAnswer: unknown): number => {
  const gold = keyTokens(goldAnswer);
  if (gold.size === 0) return 0;
  const retrieved = keyTokens(retrievedText);
  let hits = 0;
  for (const t of gold) if (retrieved.has(t)) hits++;
  return hits / gold.size;
};

const harmonicMean = (a: number, b: number): number => {
  if (a <= 0 || b <= 0) return 0;
  return (2 * a * b) / (a + b);
};

// ─────────────── runner ─────────────


exec
/bin/zsh -lc "sed -n '1,220p' tests/federated-search-cap-tiers.test.ts" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
/**
 * Unit tests — federated-search top-N cap + rank-weighted timeout
 * tier (the load-spreading mechanisms from
 * docs/peer-reputation-load-spreading.md §3 / §7).
 *
 * Covers:
 *   - maxPeers = N caps fan-out to first N from peerOrder
 *   - peerOrder runs BEFORE the cap (rank-aware selection)
 *   - lowRankTimeoutMs applies only to peers beyond topTierCount
 *   - default behaviour (no params) == ask every peer at full budget
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { okAsync } from 'neverthrow';

import { runFederatedSearch } from '../src/application/federated-search.js';
import type { Libp2p } from '@libp2p/interface';
import type { VectorIndex } from '../src/infrastructure/vector-index.js';
import type { Vector, VectorRecord, Match } from '../src/domain/vectors.js';
import type { PeerMatch, SearchRequest } from '../src/infrastructure/search-sync.js';
import type { SearchError } from '../src/domain/errors.js';
import { ResultAsync } from 'neverthrow';

const buildFakeVectorIndex = (records: readonly VectorRecord[]): VectorIndex => {
  const byId = new Map(records.map((r) => [r.node_id, r]));
  return {
    upsert: () => okAsync(undefined),
    searchGlobal: () => okAsync<Match[], never>([]),
    searchByRoom: () => okAsync<Match[], never>([]),
    searchHybrid: () => okAsync<Match[], never>([]),
    searchByRoomHybrid: () => okAsync<Match[], never>([]),
    all: () => okAsync(Array.from(byId.values())),
    size: () => byId.size,
    close: () => undefined,
  } as unknown as VectorIndex;
};

const buildFakeNode = (peerIds: readonly string[]): Libp2p =>
  ({ getPeers: () => peerIds.map((id) => ({ toString: () => id })) }) as unknown as Libp2p;

const buildCapturingStream = (calls: string[]) =>
  (_node: Libp2p, peerId: string, _req: SearchRequest): ResultAsync<readonly PeerMatch[], SearchError> => {
    calls.push(peerId);
    return okAsync<readonly PeerMatch[], SearchError>([]);
  };

const fakeEmbedding = new Float32Array(384);

// ─────────────── max-peers cap ────────────

test('maxPeers caps the fan-out to top-N from peerOrder', async () => {
  const calls: string[] = [];
  await runFederatedSearch(
    {
      node: buildFakeNode(['peerD', 'peerC', 'peerB', 'peerA']),
      vectorIndex: buildFakeVectorIndex([]),
      openStream: buildCapturingStream(calls),
    },
    {
      embedding: fakeEmbedding,
      k: 3,
      // peerOrder reverses to put peerA first
      peerOrder: (peers) => [...peers].reverse(),
      maxPeers: 2,
    },
  );
  // Only the top 2 from the ordered list should be queried.
  assert.deepEqual(calls.sort(), ['peerA', 'peerB']);
});

test('without maxPeers, every peer is queried (default behaviour)', async () => {
  const calls: string[] = [];
  await runFederatedSearch(
    {
      node: buildFakeNode(['peerA', 'peerB', 'peerC']),
      vectorIndex: buildFakeVectorIndex([]),
      openStream: buildCapturingStream(calls),
    },
    { embedding: fakeEmbedding, k: 3 },
  );
  assert.deepEqual(calls.sort(), ['peerA', 'peerB', 'peerC']);
});

// ─────────────── tier-aware timeouts ──────

test('lowRankTimeoutMs applies only to peers beyond topTierCount', async () => {
  // Two peers — first one resolves slow, second one resolves fast.
  // topTierCount=1 means peer index 0 gets the full 2000 ms; peer
  // index 1 gets the tighter 50 ms tier-2 budget. The slow peer at
  // index 1 should hit the tier-2 timeout.
  const slowResponses = new Map<string, number>([
    ['peerA', 0],     // resolves immediately
    ['peerB', 500],   // resolves after 500ms
  ]);
  const buildSlowStream =
    (_node: Libp2p, peerId: string, _req: SearchRequest): ResultAsync<readonly PeerMatch[], SearchError> => {
      const delayMs = slowResponses.get(peerId) ?? 0;
      return ResultAsync.fromPromise(
        new Promise<readonly PeerMatch[]>((resolve) => {
          setTimeout(() => resolve([]), delayMs);
        }),
        () => ({} as SearchError),
      );
    };

  const result = await runFederatedSearch(
    {
      node: buildFakeNode(['peerA', 'peerB']),
      vectorIndex: buildFakeVectorIndex([]),
      openStream: buildSlowStream,
    },
    {
      embedding: fakeEmbedding,
      k: 3,
      perPeerTimeoutMs: 2000,
      lowRankTimeoutMs: 50,
      topTierCount: 1,
    },
  );

  // peerA (index 0) responds → status='ok'
  // peerB (index 1) is slow + tier-2 budget expires → status='timeout'
  // Telemetry should reflect 1 timeout from the tier-2 demotion.
  assert.equal(result.peers_timed_out, 1);
});

exec
/bin/zsh -lc "sed -n '1,220p' src/application/use-cases.ts" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
/**
 * Application use cases — thin orchestration between domain and infra.
 *
 * Each use case is a pure function (no classes, no hidden state) that
 * takes the ports it needs as parameters and returns a `ResultAsync`.
 * This makes them trivial to test with fakes and keeps the domain
 * utterly I/O-free.
 *
 * The use cases here are the minimum needed for Phase 1's acceptance
 * test. Later phases will add: indexDocument (fetch+chunk+embed+upsert),
 * answerQuestion (embed+search+assemble context), detectDrift, etc.
 */

import { Result, ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { AppError, GraphError, VectorError } from '../domain/errors.js';
import {
  type Graph,
  type GraphNode,
  type NodeId,
  type Room,
  type Subgraph,
  type TraversalOptions,
  type Wing,
  bfs,
  nodesInRoom,
  upsertNode as upsertNodePure,
} from '../domain/graph.js';
import {
  type Match,
  type Tunnel,
  type VectorRecord,
  findTunnels as findTunnelsPure,
} from '../domain/vectors.js';
import type { GraphRepository } from '../infrastructure/graph-repository.js';
import type { VectorIndex } from '../infrastructure/vector-index.js';
import type { Embedder } from '../infrastructure/embedders.js';

// ─────────────────────── commands ─────────────────────────

/** A node about to be inserted, together with the text that will be embedded. */
export interface IndexNodeCommand {
  readonly node: GraphNode;
  readonly text: string;
  readonly room: Room;
  readonly wing?: Wing;
}

/** A room-scoped semantic search. */
export interface RoomSearchQuery {
  readonly room: Room;
  readonly text: string;
  readonly k?: number;
}

/** A global semantic search (no room filter). */
export interface GlobalSearchQuery {
  readonly text: string;
  readonly k?: number;
}

/** Parameters for the tunnel-detection pass. */
export interface TunnelDetectionQuery {
  readonly threshold: number;
  readonly restrictToRoom?: Room;
}

// ─────────────────────── dependencies ─────────────────────

/**
 * All ports a use case might need. We pass this as a single object so
 * adding a new port (e.g. a clock, a logger) doesn't force every use
 * case signature to change.
 */
export interface UseCaseDeps {
  readonly graphs: GraphRepository;
  readonly vectors: VectorIndex;
  readonly embedder: Embedder;
}

// ─────────────────────── indexNode ────────────────────────

/**
 * Embed a node's text, upsert the vector into the vector index, and
 * upsert the node into the graph with `embedding_id` set to the node
 * id. The operation is an atomic pair from the caller's perspective
 * (both writes succeed or the error is surfaced).
 *
 * Side effects are ordered so the vector is written first. If the
 * subsequent graph write fails, the vector store has a stale row
 * that a later graph write will overwrite — harmless.
 */
export const indexNode =
  (deps: UseCaseDeps) =>
  (cmd: IndexNodeCommand): ResultAsync<Graph, AppError> =>
    deps.embedder
      .embed(cmd.text)
      .mapErr((e): AppError => e)
      .andThen((vec) =>
        deps.vectors
          .upsert({
            node_id: cmd.node.id,
            room: cmd.room,
            wing: cmd.wing,
            vector: vec,
            // Pass the pre-prefix raw text so the FTS5 BM25 index can
            // participate in hybrid retrieval. Phase 23 pipeline unification:
            // production now writes to both vec0 AND fts_docs on every upsert.
            raw_text: cmd.text,
          })
          .mapErr((e): AppError => e)
          .map(() => vec),
      )
      .andThen(() =>
        deps.graphs.load().mapErr((e): AppError => e).andThen((graph) => {
          const enriched: GraphNode = {
            ...cmd.node,
            room: cmd.room,
            wing: cmd.wing,
            embedding_id: cmd.node.id,
          };
          return ResultAsync.fromPromise(
            Promise.resolve(upsertNodePure(graph, enriched)),
            (): AppError => ({ type: 'GraphWriteError', path: '<memory>', message: 'upsert failed' }),
          )
            .andThen((r: Result<Graph, GraphError>) =>
              r.isOk() ? okAsync<Graph, AppError>(r.value) : errAsync<Graph, AppError>(r.error),
            )
            .andThen((next) => deps.graphs.save(next).mapErr((e): AppError => e).map(() => next));
        }),
      );

// ─────────────────────── searchByRoom ─────────────────────

/**
 * Room-scoped semantic search. Returns the top-k matches restricted
 * to the given room, fused via RRF over dense + BM25 (Phase 23
 * pipeline unification: production now uses hybrid by default).
 *
 * For nodes that were upserted before Phase 23 (and thus have no FTS5
 * row), the BM25 stage returns an empty list and RRF degrades gracefully
 * to dense-only. Once the graph is re-indexed the hybrid benefit kicks in.
 */
export const searchByRoom =
  (deps: UseCaseDeps) =>
  (query: RoomSearchQuery): ResultAsync<readonly Match[], AppError> => {
    const k = query.k ?? 5;
    return deps.embedder
      .embed(query.text)
      .mapErr((e): AppError => e)
      .andThen((vec) => {
        // Phase 3c — when the VectorIndex was opened with binaryDim,
        // route through the Hamming-ranked binary path. Otherwise fall
        // back to the fp32 searchByRoomHybrid. Zero-behavioral-change
        // when binary mode is off.
        const call =
          deps.vectors.binaryDim !== null
            ? deps.vectors.searchByRoomHybridBinary(query.room, query.text, vec, k)
            : deps.vectors.searchByRoomHybrid(query.room, query.text, vec, k);
        return call.mapErr((e): AppError => e);
      });
  };

// ─────────────────────── searchGlobal ─────────────────────

/**
 * Global semantic search — no room filter. Hybrid dense + BM25 + RRF
 * (Phase 23 pipeline unification).
 */
export const searchGlobal =
  (deps: UseCaseDeps) =>
  (query: GlobalSearchQuery): ResultAsync<readonly Match[], AppError> => {
    const k = query.k ?? 5;
    return deps.embedder
      .embed(query.text)
      .mapErr((e): AppError => e)
      .andThen((vec) => {
        const call =
          deps.vectors.binaryDim !== null
            ? deps.vectors.searchHybridBinary(query.text, vec, k)
            : deps.vectors.searchHybrid(query.text, vec, k);
        return call.mapErr((e): AppError => e);
      });
  };

// ─────────────────────── findTunnels ──────────────────────

/**
 * Offline pass: surface pairs of nodes in different rooms with L2
 * distance below `threshold`. Pulls the full snapshot from the vector
 * index and delegates the math to the pure domain function.
 */
export const findTunnels =
  (deps: UseCaseDeps) =>
  (query: TunnelDetectionQuery): ResultAsync<readonly Tunnel[], AppError> =>
    deps.vectors
      .all()
      .mapErr((e): AppError => e)
      .map((records: readonly VectorRecord[]) =>
        findTunnelsPure(records, query.threshold, query.restrictToRoom),
      );

// ─────────────────────── exploreRoom ──────────────────────

/**
 * Graph traversal inside a single room. Seeds from the most-similar
 * node for the given text and BFSes outward using the room filter on
 * the pure domain traversal. Returns the matching sub-graph.
 */
export interface ExploreRoomQuery {
  readonly room: Room;
  readonly text: string;
  readonly depth?: number;
  readonly k?: number;
}

export const exploreRoom =
  (deps: UseCaseDeps) =>
  (query: ExploreRoomQuery): ResultAsync<Subgraph, AppError> => {
    const k = query.k ?? 3;
    const traversalOpts: TraversalOptions = { depth: query.depth ?? 3, room: query.room };

exec
/bin/zsh -lc "sed -n '1,220p' src/application/federated-search.ts" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
/**
 * Federated search — fan-out orchestrator for cross-peer semantic search.
 *
 * Phase 17 application layer. Coordinates:
 *   1. Local vector query (searchGlobal or searchByRoom)
 *   2. Parallel fan-out to all connected peers via openSearchStream
 *   3. Result merging with deduplication (prefer local, collapse peer dupes into _also_from_peers)
 *   4. Cross-room tunnel detection via findTunnels over the merged synthetic record set (FED-04)
 *
 * CRITICAL invariants:
 *   1. Fan-out MUST use Promise.all with per-promise Promise.race timeout — NOT
 *      ResultAsync.combine/ResultAsync.combineWithAllErrors which short-circuit on
 *      first failure and block the entire fan-out (Research anti-pattern from 17-RESEARCH.md:
 *      "Eager ResultAsync sequence on fan-out").
 *
 *   2. Per-peer timeout is 2000ms (CONTEXT.md locked). Degraded peers do not block
 *      the query. Each peer outcome is tagged ok|timeout|error for diagnostics.
 *
 *   3. No Y.Doc mutations, no REMOTE_ORIGIN, no CRDT. This is a pure read-only path.
 *
 *   4. Tunnel detection (FED-04) runs over local vectors only for merged matches.
 *      Remote-only rows are skipped because raw vectors are not transmitted across
 *      the wire (SEC-03 boundary). This is a functional subset — documented, not a bug.
 *
 *   5. Dependency injection: openSearchStream is injectable (optional dep) for unit
 *      testability. Tests can mock it to avoid real libp2p dials.
 */
import type { Libp2p } from '@libp2p/interface';
import type { VectorIndex } from '../infrastructure/vector-index.js';
import type { Vector, Tunnel, VectorRecord } from '../domain/vectors.js';
import { findTunnels as findTunnelsPure } from '../domain/vectors.js';
import type { Room } from '../domain/graph.js';
import type { PeerMatch, SearchRequest } from '../infrastructure/search-sync.js';
import { openSearchStream } from '../infrastructure/search-sync.js';
import { askGossip } from '../infrastructure/search-gossip.js';

// ─────────────────────── output types ─────────────────────────────────────────

/**
 * A merged search result — either local (source_peer=null) or
 * from a specific remote peer (source_peer=peerId string).
 *
 * _also_from_peers lets the caller see which OTHER peers returned the
 * same node_id. Deduplication prefers the local entry (or first-seen peer);
 * same-node_id hits from additional peers are collapsed into _also_from_peers
 * on the winning row. This is the Claude's-discretion decision from CONTEXT.md.
 */
export interface FederatedMatch {
  readonly node_id: string;
  readonly room: string;
  readonly wing?: string;
  readonly distance: number;
  readonly _source_peer: string | null;
  readonly _also_from_peers?: readonly string[];
}

export interface FederatedSearchResult {
  readonly matches: readonly FederatedMatch[];
  readonly tunnels: readonly Tunnel[];
  readonly peers_queried: number;
  readonly peers_responded: number;
  readonly peers_timed_out: number;
  readonly peers_errored: number;
  /**
   * Wire-level telemetry — populated unconditionally so callers can
   * surface a peer-pull block into the agent session. Enrichment and
   * satisfaction scoring happen at the call site (MCP / CLI / hook)
   * where the GraphRepository is available.
   */
  readonly _telemetry: {
    readonly took_total_ms: number;
    readonly took_local_ms: number;
    readonly took_fanout_ms: number;
    readonly took_merge_ms: number;
    readonly bytes_received_estimate: number;
    readonly peers_alive: number;
  };
}

export interface FederatedSearchDeps {
  readonly node: Libp2p;
  readonly vectorIndex: VectorIndex;
  /**
   * Injectable override for openSearchStream — allows unit tests to mock
   * the outbound stream without a real libp2p node.
   * Defaults to the real openSearchStream from search-sync.ts.
   */
  readonly openStream?: typeof openSearchStream;
}

export interface FederatedSearchParams {
  readonly embedding: Vector;     // Float32Array, length === DEFAULT_DIM
  readonly k: number;
  readonly room?: string;
  /**
   * Raw query text for the local-half hybrid (vector + BM25) lookup. When
   * omitted, local search falls back to vector-only. Peers still receive
   * only the embedding (SEC-03 boundary — raw text does not cross the
   * wire); this field exists for the LOCAL half, which has the text
   * in-process anyway.
   */
  readonly text?: string;
  /** Cross-room tunnel threshold. Default 0.6 matches MCP find_tunnels default. */
  readonly tunnelThreshold?: number;
  /**
   * Skip the cross-room tunnel pass at the end of the merge.
   * Tunnel detection runs findTunnelsPure on the merged result set,
   * which on a 5–10 hit return adds ~150-250ms because it embeds
   * pairs of records and compares. The agent contract block does
   * not currently use tunnel output; --peers callers should set
   * this to true to skip the cost.
   */
  readonly skipTunnels?: boolean;
  /** Per-peer deadline. Default 2000ms matches CONTEXT.md locked decision. */
  readonly perPeerTimeoutMs?: number;
  /**
   * Optional peer-ordering callback. When supplied, the connected
   * peer list is passed through this function before fan-out — the
   * reputation system uses it to bubble high-rep peers to the front
   * (with an epsilon-greedy floor so unknown peers still get
   * sampled). Pure: no I/O, no clock dependence at this layer; the
   * caller closes any reputation/ranking state into the closure.
   *
   * Default behaviour (no callback) preserves the libp2p-native peer
   * order — backwards compatible with every existing test.
   */
  readonly peerOrder?: (peerIds: readonly string[]) => readonly string[];
  /**
   * Optional cap on how many peers to fan out to. After `peerOrder`
   * runs, the top `maxPeers` are queried; the rest are skipped.
   *
   * The mechanism that actually spreads load (combined with the rep
   * system's load_factor in rank_score): top-rep peers get the
   * fan-out budget; medium-rep peers stay idle this round; over time
   * the load_factor decays a peer that's been hit recently and the
   * rotation continues organically.
   *
   * Defaults to no cap (current behaviour — fan out to every
   * connected peer). When set with a low rank-budget alongside, the
   * combined effect is "ask top-3 peers fully; ask top-8 peers with
   * a tighter timeout; skip the rest."
   */
  readonly maxPeers?: number;
  /**
   * Tier-2 timeout for peers ranked between TIER_1_COUNT and
   * `maxPeers`. Lets the federated layer give your top-N peers the
   * full 2 s budget while still sampling tier-2 peers under a
   * shorter (e.g. 700 ms) deadline. When omitted, every peer gets
   * the full `perPeerTimeoutMs`.
   */
  readonly lowRankTimeoutMs?: number;
  /**
   * How many peers count as the "top tier" that get the full
   * `perPeerTimeoutMs`. Default 3 — every peer beyond this gets
   * `lowRankTimeoutMs` if it's set. Ignored when `lowRankTimeoutMs`
   * is undefined.
   */
  readonly topTierCount?: number;
  /**
   * P2P-scale phase 1 — use pubsub broadcast for fan-out instead of
   * per-peer dialProtocol. Default true (gossip-first). When the
   * gossip collector returns zero responses, the call falls through
   * to the legacy per-peer dial path so a missing pubsub service
   * never strands the request.
   */
  readonly useGossip?: boolean;
  /**
   * Collector window for gossip fan-out. Default 200 ms.
   * Lower for tighter latency, higher for larger swarms (10k peers
   * need ~300 ms floodsub propagation, ~80 ms gossipsub mesh).
   */
  readonly gossipWindowMs?: number;
  /**
   * Tail-aware merge cap (audit fold-in): never let a single peer
   * contribute more than ⌈k/peerDiversityDivisor⌉ matches to the
   * final top-k. Default 3 — i.e. top-3 peers collectively cannot
   * monopolise more than k. Disabled by setting to Infinity.
   */
  readonly peerDiversityDivisor?: number;
}

// ─────────────────────── per-peer timeout helper ──────────────────────────────

/**
 * Outcome of a single peer's fan-out attempt.
 * status: 'ok' = responded with matches (may be empty), 'timeout' = 2s exceeded,
 *         'error' = dial or protocol error.
 */
interface PeerOutcome {
  readonly peerId: string;
  readonly status: 'ok' | 'timeout' | 'error';
  readonly matches: ReadonlyArray<PeerMatch>;
}

/**
 * Race a peer stream against a timeout.
 *
 * Pattern 2 (17-RESEARCH.md): Promise.race is the correct tool here —
 * NOT ResultAsync.combine which short-circuits on first error, killing the
 * fan-out for all remaining peers when one peer fails.
 *
 * Error handling: if `work` rejects, the outcome is tagged 'error' (not 'timeout').
 * Both cases produce empty matches — the difference is visible in the diagnostic
 * counters (peers_timed_out vs peers_errored) in FederatedSearchResult.
 */
const withTimeout = (
  peerId: string,
  work: Promise<ReadonlyArray<PeerMatch>>,
  ms: number,
): Promise<PeerOutcome> =>
  Promise.race<PeerOutcome>([
    work.then(
      (matches) => ({ peerId, status: 'ok' as const, matches }),
      () => ({ peerId, status: 'error' as const, matches: [] }),
    ),
    new Promise<PeerOutcome>((resolve) =>
      setTimeout(() => resolve({ peerId, status: 'timeout' as const, matches: [] }), ms),
    ),
  ]);


exec
/bin/zsh -lc "sed -n '1,220p' src/domain/federation-sim.ts" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
/**
 * Phase 24 (Akashik) — federation simulator (pure domain).
 *
 * Per the Round 5 octopus-discover synthesis
 * (docs/research/octopus-discover/round-5-2026-05-26/),
 * **AkashikBench-F** is the only benchmark that can falsify or
 * validate the federated-commons thesis. The current public-corpus
 * benchmarks (LongMemEval, LoCoMo, BEIR) measure *single-peer*
 * retrieval quality, not the compounding the mission claims.
 *
 * This module is the simulator — deterministic, pure, in-process,
 * boolean-set abstraction over the actual retrieval mechanism. It
 * answers exactly one question:
 *
 *   "Given N peers, a Zipfian query stream, an offline-churn rate,
 *    and the ambitioned-curator + curiosity-driven cache-fill
 *    mechanism — does the network's web_fallback_rate fall over
 *    time, and how fast does a newly-acquired fact propagate to
 *    half the network?"
 *
 * Boolean abstraction: each peer either holds doc D or it doesn't.
 * This deliberately ignores retrieval-quality concerns (R@K /
 * NDCG / MRR — those are measured separately by the public-corpus
 * benches). What this measures is *federation dynamics* under
 * realistic churn + curiosity patterns. v2 plugs in real retrieval
 * per peer; v1 keeps the dynamics testable in seconds, not hours.
 *
 * No I/O. No clock. No randomness without a seed. The whole sim
 * runs in a single process and is deterministic given (config,
 * seed, corpus, query-stream).
 */

// ─────────────── seeded PRNG ─────────────

/**
 * xorshift32 — fast deterministic PRNG. Same algorithm as the
 * listwise-rerank shuffle (`src/domain/llm-listwise-rerank.ts`),
 * keeping behaviour consistent across deterministic-replay paths.
 */
const xorshift32 = (seed: number): (() => number) => {
  let s = seed === 0 ? 1 : seed >>> 0;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 0xFFFFFFFF;
  };
};

// ─────────────── corpus ─────────────

/**
 * A `Query` in this simulation universe — an identifier the
 * Zipfian sampler can refer to, plus the set of ground-truth gold
 * document IDs (≥ 1) that satisfy the query. Boolean abstraction:
 * "the peer has the answer" iff the peer holds ANY gold doc.
 *
 * For the strict-all-gold semantic (LoCoMo-style), the consuming
 * harness can change `goldFound` to require ALL gold IDs present
 * before counting it as satisfied.
 */
export interface SimQuery {
  readonly id: string;
  readonly goldDocs: ReadonlyArray<string>;
}

export interface SimCorpus {
  readonly queries: ReadonlyArray<SimQuery>;
  /** All doc IDs that exist in the universe — used to seed peer shards. */
  readonly allDocs: ReadonlyArray<string>;
}

// ─────────────── config ─────────────

export interface SimConfig {
  readonly numPeers: number;
  /** Total simulation steps (one query per step). */
  readonly numSteps: number;
  /** Per-step probability that any given peer is offline. */
  readonly offlineProbability: number;
  /**
   * Zipfian shape parameter for the query stream. α=0 → uniform
   * (every query equally likely); α=1 → classic Zipf (popularity
   * tail). The Round 5 brief specifies a Zipfian stream as the
   * realistic shape for OSS-community curiosity.
   */
  readonly zipfAlpha: number;
  /** PRNG seed — deterministic replay key. */
  readonly seed: number;
  /**
   * Fraction of `allDocs` each peer's initial shard contains.
   * The simulator enforces shard *disjointness* — no doc starts
   * on two peers. Round 5 specifies disjoint seeding to prevent
   * "Corpus Contamination" inflating false compounding.
   */
  readonly initialShardFraction: number;
  /**
   * Verbose per-step logging (off by default — bench harness
   * decides when to emit progress).
   */
  readonly trace?: boolean;
}

// ─────────────── outcomes ─────────────

export type ResolveSource = 'local' | 'federation' | 'web';

export interface SimEvent {
  readonly t: number;
  readonly queryId: string;
  readonly askingPeer: string;
  readonly source: ResolveSource;
  readonly servingPeer?: string;
  readonly goldFound: boolean;
  readonly peersOnline: number;
  /**
   * Doc IDs the asking peer now holds after this event. Useful
   * for downstream propagation analysis (which peer learned what
   * at which time).
   */
  readonly askerLearned: ReadonlyArray<string>;
}

export interface SimResult {
  readonly events: ReadonlyArray<SimEvent>;
  readonly peerStates: ReadonlyMap<string, ReadonlySet<string>>;
}

// ─────────────── Zipfian sampler ─────────────

/**
 * Build a Zipfian sampler over [0, n) with shape parameter α.
 * Uses inverse CDF — O(log n) per sample after O(n) setup.
 * Deterministic for a given PRNG.
 */
const zipfianSampler = (
  n: number,
  alpha: number,
  rng: () => number,
): (() => number) => {
  if (alpha === 0 || n <= 1) {
    return () => Math.floor(rng() * n);
  }
  // CDF: P(rank ≤ k) ∝ Σ_{i=1..k} (1/i^α)
  const cdf: number[] = new Array(n);
  let total = 0;
  for (let i = 1; i <= n; i++) {
    total += 1 / Math.pow(i, alpha);
    cdf[i - 1] = total;
  }
  for (let i = 0; i < n; i++) cdf[i] /= total;

  return () => {
    const r = rng();
    // Binary search for first cdf[i] >= r
    let lo = 0, hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (cdf[mid] >= r) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };
};

// ─────────────── simulator ─────────────

/**
 * Run the federation simulation. Pure: given (corpus, config), the
 * result is deterministic and replay-friendly.
 *
 * Loop per step:
 *   1. Roll online/offline state for every peer (independent
 *      Bernoulli trials with `offlineProbability`).
 *   2. Sample a query from the Zipfian stream.
 *   3. Pick an *online* peer uniformly at random as the asker.
 *   4. Local lookup → if any gold doc present, satisfy locally.
 *   5. Else fan out to other online peers → if any of them holds
 *      any gold doc, federation hit; asker pulls the matching
 *      docs into its own local set (cross-peer transfer = caching).
 *   6. Else web fallback → asker fetches gold docs from the
 *      "controlled oracle web corpus" (i.e. the simulator's
 *      ground-truth gold set for that query) and saves them
 *      locally. Asker is now the ambitioned curator.
 *   7. Emit a `SimEvent` describing what happened.
 *
 * If no peer is online at all in a step (rare under reasonable
 * churn), the step is skipped — no query was askable.
 */
export const runFederationSim = (corpus: SimCorpus, config: SimConfig): SimResult => {
  const rng = xorshift32(config.seed);
  const sampler = zipfianSampler(corpus.queries.length, config.zipfAlpha, rng);

  // Initial sharding — disjoint per peer, leftovers stay on the
  // "web oracle" (i.e. nobody knows them locally until asked).
  const peers: { id: string; docs: Set<string> }[] = [];
  const allDocs = corpus.allDocs;
  const shardSize = Math.floor(allDocs.length * config.initialShardFraction);
  // Deterministically shuffle docs once, then partition into N
  // shards of `shardSize` each. Anything past N×shardSize starts
  // un-cached on any peer (web-only knowledge).
  const shuffled = [...allDocs];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  for (let p = 0; p < config.numPeers; p++) {
    const start = p * shardSize;
    const end = Math.min(start + shardSize, shuffled.length);
    peers.push({
      id: `peer-${p}`,
      docs: new Set(shuffled.slice(start, end)),
    });
  }

  const events: SimEvent[] = [];

  for (let t = 0; t < config.numSteps; t++) {
    // 1. roll online state
    const online: typeof peers = [];
    for (const p of peers) {
      if (rng() >= config.offlineProbability) online.push(p);

exec
/bin/zsh -lc "sed -n '1,220p' src/domain/long-term-memory.ts" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
/**
 * Long-term memory — tier vocabulary, retention math, and Bayesian
 * reliability counters for procedural memories.
 *
 * Lives next to `consolidated-memory.ts` (which already covers the
 * episodic→semantic clustering pass shipped in Phase 4b). This module
 * adds:
 *
 *   1. A four-tier classification — observation / episodic / semantic
 *      / procedural — derived deterministically from a node's URI
 *      scheme. No I/O; just inspect the prefix.
 *   2. Retention scoring — `salience · exp(-λ·Δt) + σ·Σ(1/days_since_access)`
 *      from arxiv 2512.18950 (MACLA). Decides hot / warm / cold tier
 *      membership for ranking and forgetting decisions.
 *   3. Bayesian reliability counters — Beta(α, β) on procedural
 *      memories. Updates from user feedback signals. Expected-utility
 *      selection score combines semantic similarity, reliability, and
 *      an entropy-driven exploration bonus.
 *
 * Pure: no I/O, no clock except via injected `now` parameter, no
 * randomness. Every fallible op returns a neverthrow Result.
 *
 * What NOT to put here:
 *   - LLM summarisation calls (lives in infra SummariserProvider)
 *   - Graph node persistence (lives in graph-repository)
 *   - The auto-forget tick itself (application layer)
 */

import { Result, err, ok } from 'neverthrow';
import { ConsolidationError } from './errors.js';

// ─────────────── tiers ─────────────

/**
 * The four long-term memory tiers, ordered by abstraction level.
 *
 *   - observation: raw graph node from an ingest source (research, code,
 *     session log). Unstructured, large volume, decays fast.
 *   - episodic:    one full session compressed into a session://<sid>
 *     node. Local-only (privacy boundary).
 *   - semantic:    cross-session merged fact under synthesis://. Shared
 *     into the `toolshed` room when the user opts in.
 *   - procedural:  a recurring workflow under decision://. Shared.
 *     Carries a Beta(α, β) reliability counter that updates with
 *     feedback.
 */
export type MemoryTier = 'observation' | 'episodic' | 'semantic' | 'procedural';

/**
 * URI prefix → tier mapping. Anything else (file://, https://,
 * arxiv://, etc.) is treated as `observation`.
 *
 * Order matters in `tierForUri`: `session://` must be checked before
 * `synthesis://` even though they don't share a prefix here, to keep
 * the function shape uniform for future additions.
 */
const TIER_PREFIXES: ReadonlyArray<{ readonly prefix: string; readonly tier: MemoryTier }> = [
  { prefix: 'session://',   tier: 'episodic'   },
  { prefix: 'synthesis://', tier: 'semantic'   },
  { prefix: 'decision://',  tier: 'procedural' },
];

/**
 * Classify a node's URI into a memory tier by prefix. Pure, total.
 *
 * Returns 'observation' for any URI that doesn't match a tier prefix
 * — including raw `file://`, `https://`, `arxiv://`, and free-form ids
 * like `chunk-42`.
 */
export const tierForUri = (uri: string): MemoryTier => {
  for (const { prefix, tier } of TIER_PREFIXES) {
    if (uri.startsWith(prefix)) return tier;
  }
  return 'observation';
};

// ─────────────── beta counter ─────────────

/**
 * Beta(α, β) reliability counter for a procedural memory.
 *
 * Encodes the agent's belief about whether a procedure succeeds, in
 * the form of a Beta posterior over a Bernoulli success rate. Updates
 * by integer increments — `α += 1` on a success, `β += 1` on a
 * failure. Mean is `α/(α+β)`. Entropy is `−mean·log(mean) − (1−mean)·log(1−mean)`
 * (binary entropy of the mean — a closed-form proxy for the full
 * Beta-distribution differential entropy, which costs digamma calls
 * we don't want in a hot scorer).
 *
 * Convention: brand-new procedures start at Beta(1, 1) — uniform
 * prior, mean = 0.5, max entropy. This is the standard non-informative
 * Beta and lets the exploration bonus push the agent to *try* new
 * procedures before any feedback arrives.
 */
export interface BetaCounter {
  readonly alpha: number;
  readonly beta: number;
}

/** Default counter for a freshly-created procedural memory. */
export const initialBetaCounter = (): BetaCounter => ({ alpha: 1, beta: 1 });

/**
 * Update a counter with a single binary outcome — true = success,
 * false = failure. Returns a new counter (immutable).
 *
 * Numeric guard: caller could pass cached counters with absurd
 * values (NaN, negative). We clamp the result to the non-negative
 * regime; if a non-finite slips through we reset to the prior.
 */
export const updateBeta = (c: BetaCounter, success: boolean): BetaCounter => {
  const alpha = success ? c.alpha + 1 : c.alpha;
  const beta  = success ? c.beta      : c.beta + 1;
  if (!Number.isFinite(alpha) || !Number.isFinite(beta) || alpha < 0 || beta < 0) {
    return initialBetaCounter();
  }
  return { alpha, beta };
};

/** Posterior mean — agent's point estimate of the success rate. */
export const betaMean = (c: BetaCounter): number => {
  const total = c.alpha + c.beta;
  return total > 0 ? c.alpha / total : 0.5;
};

/**
 * Binary-entropy proxy for the Bernoulli with parameter `mean`.
 * Range: [0, ln 2] ≈ [0, 0.693]. Used as the exploration bonus in
 * `expectedUtility` — high entropy means "we have weak evidence,
 * try this procedure to learn more."
 *
 * The true Beta differential entropy involves digamma + a constant
 * we don't want in the hot path. The Bernoulli proxy peaks at the
 * same location (mean = 0.5) and decays monotonically toward 0 as
 * the mean tightens — same qualitative behaviour at a fraction of
 * the cost.
 */
export const betaEntropy = (c: BetaCounter): number => {
  const p = betaMean(c);
  if (p <= 0 || p >= 1) return 0;
  return -(p * Math.log(p) + (1 - p) * Math.log(1 - p));
};

// ─────────────── expected-utility selection ─────────────

/**
 * Inputs to the procedural-memory selection scorer.
 *
 * `similarity` is the bi-encoder (or hybrid) score between the query
 * and the procedure's text representation — already on [0, 1] after
 * cross-rerank squashing. `risk` defaults to 1.0 in Phase 21; Phase
 * 22 will derive it per procedure from past failure mode tags.
 */
export interface EuInput {
  readonly similarity: number;
  readonly counter: BetaCounter;
  readonly risk?: number;
}

export interface EuOptions {
  /** Reward on success. Default 1. */
  readonly rMax?: number;
  /** Cost on failure. Default 0.5 — failures hurt half as much as successes help. */
  readonly cFail?: number;
  /** Exploration weight (entropy bonus coefficient). Default 0.1. */
  readonly lambdaInfo?: number;
}

/**
 * MACLA Eq. 4 — expected-utility selection score for procedural
 * memories.
 *
 *   EU = sim · mean · R_max − risk · (1 − mean) · C_fail + λ_info · H[Beta]
 *
 * Where:
 *   - `mean = α / (α + β)`  is the posterior success-rate estimate
 *   - `H[Beta]` is the binary-entropy proxy from `betaEntropy`
 *   - The first term rewards similar + reliable procedures
 *   - The second term penalises similar + unreliable procedures
 *   - The third term rewards uncertainty — encourages exploration
 *
 * Returns a finite number. Use it as the procedural lane in the
 * retrieval fuser; bigger is better.
 */
export const expectedUtility = (input: EuInput, opts: EuOptions = {}): number => {
  const rMax = opts.rMax ?? 1;
  const cFail = opts.cFail ?? 0.5;
  const lambda = opts.lambdaInfo ?? 0.1;
  const risk = input.risk ?? 1;
  const mean = betaMean(input.counter);
  const entropy = betaEntropy(input.counter);
  const reward = input.similarity * mean * rMax;
  const penalty = risk * (1 - mean) * cFail;
  return reward - penalty + lambda * entropy;
};

// ─────────────── retention math ─────────────

/**
 * Per-tier base salience. Procedural > Semantic > Episodic > Observation
 * — established workflows are more valuable to keep than raw chunks.
 *
 * The agentmemory paper (arxiv 2512.18950) uses similar weights
 * keyed on memory type (architecture > pattern > preference >
 * workflow > fact). We collapse those into our tier scheme because
 * (a) our `synthesis://` already encodes the "fact vs pattern"
 * distinction in the body, and (b) the cleaner mapping is easier
 * to test.
 */
const TIER_BASE_SALIENCE: Record<MemoryTier, number> = {
  procedural:  0.85,
  semantic:    0.75,
  episodic:    0.50,
  observation: 0.30,
};

/** Bonus from access count. Caps at 0.2 to avoid runaway dominance. */
const ACCESS_BONUS = (count: number): number => Math.min(0.2, Math.max(0, count) * 0.02);

/**

exec
/bin/zsh -lc "sed -n '1,220p' src/domain/cross-rerank.ts" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
/**
 * Cross-encoder rerank — pure scoring composition.
 *
 * The cross-encoder reranker is a small bi-encoder (ms-marco-MiniLM
 * style) that scores a (query, document) pair jointly, unlike the
 * bi-encoder retriever which embeds each side independently. Cross
 * scoring is much more accurate but quadratic in pair count, so it
 * runs only on the top-N candidates from the hybrid retriever.
 *
 * This module is the DOMAIN layer of that pipeline — it knows nothing
 * about ONNX, transformers, or the Xenova runtime. It accepts a
 * `Scorer` port (one async call: (pairs) → scores) and produces a
 * reranked Match list. The infrastructure adapter lives in
 * `infrastructure/cross-encoder.ts`.
 *
 * Why this lives next to `graph-rerank.ts` and `recency-rerank.ts`:
 *   The composition (candidates + per-pair scores → reranked candidates)
 *   is a domain concern. Network/model details are not.
 *
 * Algorithm:
 *   1. Take the top-N candidates from the bi-encoder hybrid stage
 *      (already RRF-fused dense + BM25 from Phase 23).
 *   2. Build (query, doc-text) pairs. Doc text comes from the
 *      VectorRecord.raw_text saved alongside the embedding.
 *   3. Score every pair with the cross-encoder Scorer port.
 *   4. Rewrite each Match.distance to (1 − cross_score) so downstream
 *      consumers (recency-rerank, satisfaction scorer) treat lower as
 *      better, consistent with cosine-distance semantics elsewhere.
 *   5. Sort by new distance asc. Leave the tail (rank > N) untouched
 *      and concatenate — they are already ranked below the head, the
 *      cross-encoder confirms the head ordering.
 *
 * Fail-open: when the Scorer port errors (model load failure, runtime
 * fault), this module returns the input matches unchanged. The
 * application layer can log via the RerankError but should never abort
 * the ask on a rerank failure.
 */

import { ResultAsync, okAsync } from 'neverthrow';
import type { Match } from './vectors.js';
import type { RerankError } from './errors.js';

// ─────────────── port ─────────────

/**
 * The cross-encoder scoring port. One call, batched.
 *
 * Implementations:
 *   - `xenovaCrossEncoder` (infrastructure/cross-encoder.ts) — Xenova
 *     `Xenova/ms-marco-MiniLM-L-6-v2`, lazy-loaded, falls open on
 *     model-load failure.
 *   - `fixtureCrossEncoder` — deterministic for tests; returns
 *     pre-registered scores keyed on the doc text.
 */
export interface CrossEncoderScorer {
  /**
   * Score (query, doc) pairs in batch. Returns a parallel array of
   * relevance scores in roughly [0, 1] — higher means more relevant.
   * Implementations may emit logits; absolute calibration is not
   * required, only the order. We rescale to [0, 1] before mapping
   * to distance.
   */
  score(query: string, docs: readonly string[]): ResultAsync<readonly number[], RerankError>;
}

// ─────────────── options ─────────────

export interface CrossRerankOptions {
  /**
   * Number of head candidates to rerank. Tail (rank > headSize) passes
   * through unchanged. Default 20 — empirically the sweet spot for
   * MS-MARCO-MiniLM on retrieval workloads (cost grows linearly, lift
   * plateaus past 20).
   */
  readonly headSize?: number;
}

// ─────────────── algorithm ─────────────

/**
 * Apply cross-encoder scores to the top-N candidates, returning a new
 * Match list with rewritten distances. Pure — no I/O beyond the
 * Scorer port call.
 *
 * Distance mapping: `new_distance = 1 − sigmoidIfLogit(score)`. We
 * sigmoid-squash when the raw score is outside [0, 1] (cross-encoders
 * commonly emit logits in roughly [−10, +10]); inside [0, 1] we
 * pass through. This keeps distances comparable to the bi-encoder's
 * L2-on-unit-vectors scale while preserving the cross-encoder's
 * relative ordering.
 *
 * Returns the original `matches` unchanged when:
 *   - the matches array is empty
 *   - the matches lack `raw_text` we can pair against (caller's job
 *     to provide a doc-text resolver — see `rerankWithDocs`)
 *   - the Scorer port errors
 */
export const rerankMatches = (
  query: string,
  matches: readonly Match[],
  docTextOf: (m: Match) => string | undefined,
  scorer: CrossEncoderScorer,
  opts: CrossRerankOptions = {},
): ResultAsync<readonly Match[], RerankError> => {
  const headSize = opts.headSize ?? 20;

  if (matches.length === 0) return okAsync(matches);

  const head = matches.slice(0, Math.min(headSize, matches.length));
  const tail = matches.slice(head.length);

  const docs: string[] = [];
  const headWithText: Match[] = [];
  const headWithoutText: Match[] = [];
  for (const m of head) {
    const t = docTextOf(m);
    if (t && t.length > 0) {
      docs.push(t);
      headWithText.push(m);
    } else {
      headWithoutText.push(m);
    }
  }

  if (docs.length === 0) return okAsync(matches);

  return scorer
    .score(query, docs)
    .map((scores) => {
      const rescaled = scores.map(toDistance);
      const reranked: Match[] = headWithText
        .map((m, i) => ({ ...m, distance: rescaled[i] ?? m.distance }))
        .sort((a, b) => a.distance - b.distance);
      return [...reranked, ...headWithoutText, ...tail];
    })
    .orElse((): ResultAsync<readonly Match[], RerankError> => okAsync(matches));
};

// ─────────────── score → distance ─────────────

/**
 * Map a raw cross-encoder score to a [0, 2] distance.
 *
 * Heuristic: if the raw score is in [0, 1] we treat it as a probability
 * (Xenova text-classification pipeline default) and return `1 − score`.
 * Otherwise we treat it as a logit and apply a logistic squash first.
 *
 * Why 1 − sigmoid(logit) not just −logit:
 *   Downstream consumers (recency-rerank, sat scorer) assume cosine-
 *   distance semantics (0 = identical, 2 = orthogonal). Logits violate
 *   that scale. Sigmoid keeps the range bounded and monotonic.
 */
const toDistance = (raw: number): number => {
  if (!Number.isFinite(raw)) return 1;
  const p = raw >= 0 && raw <= 1 ? raw : sigmoid(raw);
  return clamp(0, 2, 1 - p);
};

const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));
const clamp = (lo: number, hi: number, x: number): number => Math.max(lo, Math.min(hi, x));

exec
/bin/zsh -lc "sed -n '1,220p' src/domain/llm-listwise-rerank.ts" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
/**
 * Phase 23.12 — LLM-listwise reranker, domain layer.
 *
 * Pairwise cross-encoder reranking (the existing `cross-rerank.ts`
 * path) came up null on LongMemEval-S — bi-encoder cosine and the
 * cross-encoder relevance score correlate too strongly for the top
 * of the head, so reranking doesn't move gold from positions 6-20
 * into top-5.
 *
 * Listwise reranking sees the WHOLE candidate set jointly: the
 * model attends to all 50 candidates at once and can:
 *   - rank them comparatively ("d_3 is better than d_5 because…")
 *   - detect redundancy ("d_2 ≈ d_7, prefer the more specific one")
 *   - reason about temporal / negation / contradiction
 *     ("the question asks 'before X' so the dated-earlier candidates
 *      win, not the most cosine-similar ones")
 *
 * The model is LLM-as-judge style (RankGPT, RankLlama). Pure-domain
 * algorithm composes (query, candidates) → permutation; the actual
 * LLM call is a port (`ListwiseScorer`) so infrastructure adapters
 * (Ollama, OpenAI-compatible, fixture) can slot in.
 *
 * Fail-open: when the scorer errors out OR returns malformed output,
 * we return the input matches unchanged. The application layer logs
 * the error but never blocks the user's query.
 */

import { ResultAsync, okAsync } from 'neverthrow';
import type { Match } from './vectors.js';
import type { RerankError } from './errors.js';

// ─────────────── port ─────────────

export interface ListwiseScorerInput {
  readonly query: string;
  readonly candidates: ReadonlyArray<{
    readonly id: string;
    /** Display text passed to the LLM — typically a truncated session summary. */
    readonly text: string;
  }>;
  /** How many top results the LLM should return. */
  readonly topK: number;
}

/**
 * The listwise-scoring port. Takes (query, candidates, topK) →
 * an ordered list of candidate IDs (best first), capped at topK.
 *
 * Implementations:
 *   - `ollamaListwiseScorer` (infrastructure/) — Ollama-backed
 *   - `fixtureListwiseScorer` — deterministic, for tests
 *
 * The returned IDs MUST be a subset of the input candidate IDs.
 * Implementations should sanitise (drop hallucinated IDs, dedupe,
 * stop at the first invalid token) — this domain layer trusts
 * what it gets and folds the order into the final result.
 */
export interface ListwiseScorer {
  /** Model identifier — `qwen2.5:1.5b`, `gpt-oss:20b`, etc. For audit/telemetry. */
  readonly model: string;
  /** Score the candidate list. Returns the LLM's preferred ID order, top-first. */
  score(input: ListwiseScorerInput): ResultAsync<readonly string[], RerankError>;
}

// ─────────────── options ─────────────

export interface ListwiseRerankOptions {
  /**
   * Number of head candidates to send to the LLM. Default 30 — small
   * enough to fit a small-LLM context budget (~4k tokens with truncated
   * candidate text), large enough to cover the LongMemEval R@30 ≈ 0.998
   * head where ~all gold lives.
   */
  readonly headSize?: number;
  /**
   * Maximum chars per candidate's text before truncation. Default
   * 500 — ~125 tokens, keeps the listwise prompt under ~7k tokens
   * for a 30-candidate head.
   */
  readonly maxCharsPerCandidate?: number;
  /**
   * Shuffle candidates before showing them to the LLM. Default `true`.
   *
   * Listwise rerankers have a well-known *input-order bias* — when
   * candidates arrive sorted (e.g. by bi-encoder cosine, as they do
   * from our retriever) the LLM tends to passively confirm that
   * order rather than independently rank by content. RankGPT et al.
   * report this and address it via sliding-window scans or input
   * permutation; we use deterministic-per-query shuffling.
   *
   * Empirically validated 2026-05-25: on real LoCoMo questions both
   * qwen2.5:1.5b and the bench-time gpt-oss:20b path produced
   * IDENTICAL top-3 sets to the bi-encoder when candidates were
   * presented in cosine order. Shuffling breaks the bias and lets
   * the model rank on its own merits.
   *
   * Set to `false` for ablation studies or when the upstream retriever
   * does not return a sorted list.
   */
  readonly shuffleInput?: boolean;
}

// ─────────────── algorithm ─────────────

/**
 * Listwise-rerank a Match list. Takes the top-`headSize` candidates,
 * asks the LLM to reorder them, returns:
 *   [llm-reranked head] + [matches that had no text] + [tail past head]
 *
 * The tail past `headSize` is untouched — listwise reranking only
 * affects the head we sent to the model. Tail items at rank > headSize
 * remain in bi-encoder order.
 *
 * The `docTextOf` callback resolves Match → display text. Matches
 * whose doc text is empty/unresolvable bypass the LLM entirely
 * (passed through in original order, after reranked head).
 */
export const rerankMatchesListwise = (
  query: string,
  matches: readonly Match[],
  docTextOf: (m: Match) => string | undefined,
  scorer: ListwiseScorer,
  opts: ListwiseRerankOptions = {},
): ResultAsync<readonly Match[], RerankError> => {
  const headSize = opts.headSize ?? 30;
  const maxChars = opts.maxCharsPerCandidate ?? 500;
  const shuffleInput = opts.shuffleInput !== false;

  if (matches.length === 0) return okAsync(matches);

  const head = matches.slice(0, Math.min(headSize, matches.length));
  const tail = matches.slice(head.length);

  // Partition into (with-text) and (without-text). The LLM only sees
  // the with-text set; the without-text set passes through unchanged.
  const candidates: { id: string; text: string }[] = [];
  const matchById = new Map<string, Match>();
  const withoutText: Match[] = [];
  for (const m of head) {
    const id = String(m.node_id);
    const t = docTextOf(m);
    if (t && t.length > 0) {
      candidates.push({ id, text: truncate(t, maxChars) });
      matchById.set(id, m);
    } else {
      withoutText.push(m);
    }
  }

  if (candidates.length === 0) return okAsync(matches);

  // Break input-order bias — shuffle deterministically per query.
  // See `ListwiseRerankOptions.shuffleInput` for rationale.
  const presented = shuffleInput ? shuffleSeeded(candidates, hashString(query)) : candidates;

  return scorer
    .score({ query, candidates: presented, topK: candidates.length })
    .map((orderedIds) => {
      const reranked: Match[] = [];
      const placed = new Set<string>();
      // Place ids in LLM order, dropping unknown/duplicate ones.
      for (const id of orderedIds) {
        if (placed.has(id)) continue;
        const m = matchById.get(id);
        if (!m) continue;
        reranked.push(m);
        placed.add(id);
      }
      // Append any head-with-text items the LLM skipped, in original
      // bi-encoder order (preserves fail-soft behaviour when the LLM
      // returns a partial list).
      for (const id of matchById.keys()) {
        if (!placed.has(id)) reranked.push(matchById.get(id) as Match);
      }
      return [...reranked, ...withoutText, ...tail];
    })
    .orElse((): ResultAsync<readonly Match[], RerankError> => okAsync(matches));
};

// ─────────────── helpers ─────────────

const truncate = (s: string, maxChars: number): string =>
  s.length > maxChars ? `${s.slice(0, maxChars)}…` : s;

/**
 * Deterministic-per-query shuffle. Uses Fisher-Yates with a seeded
 * xorshift32 PRNG so the same (query, candidates) always produces
 * the same presentation order — bench runs reproduce, debug-replay
 * works, peer comparisons are valid.
 */
const shuffleSeeded = <T>(arr: readonly T[], seed: number): T[] => {
  const out = [...arr];
  let s = seed === 0 ? 1 : seed;
  for (let i = out.length - 1; i > 0; i--) {
    // xorshift32 step
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    const j = ((s >>> 0) % (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

/** djb2 hash → 32-bit seed for the shuffle PRNG. Deterministic. */
const hashString = (s: string): number => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return h >>> 0;
};

// ─────────────── prompt builder (shared between adapters) ─────────────

/**
 * Canonical listwise-rerank prompt. Mirrors the RankGPT / RankZephyr
 * structure: numbered candidates + a strict "output IDs in order"
 * directive. Output format is intentionally machine-parseable.
 *
 * The prompt is exposed as a domain function so adapters share the
 * same shape — caps the model's freedom to drift across implementations.

exec
/bin/zsh -lc "sed -n '1,220p' .planning/HANDOFF.md" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
# Session Handoff — Phase 23.7 / Hetzner OpenClaw

**Drafted:** 2026-05-20
**Replaces:** prior v2.1 Path B handoff (archived to git history at `6b5d7e1`)
**Reason for handoff:** context window pressure; about to nuke a remote VM and need clean context for the install + benchmark phase
**Last commit:** local working tree dirty — no pushes, no commits this session beyond what's in `git status`

---

## 1. Where we are right now

Phase 21 + 22 + 23 + 23.6.1 all landed locally. Unified memory bench
composite: **0.9012 / 1.0000** with all 9 dimensions reporting.
Acceptance gates per suite documented in
`docs/product/BENCHMARKS.md`.

**Active task — partially complete:** Hetzner rebuild of server
`openclaw` (ID `125481213`, IP `91.98.75.154`) to bare Ubuntu 24.04
ARM, then install OpenClaw + Codex provider, wire MCP over
reverse-SSH, run Phase 23.7 (real public-corpus benches) on it.

**2026-05-20 update:** the 3 real-corpus adapters (BEIR SciFact,
LongMemEval-S oracle, LoCoMo factual) are now written and env-gated
under `tests/` — see §7 below. Remaining work is purely the remote
box (rebuild → OpenClaw install → MCP tunnel → run the gated suites).

**2026-05-20 — late afternoon push.** Hetzner box rebuilt twice
(first attempt had no SSH key injected; second pass used
`--user-data-from-file /tmp/handoff-cloud-init.yaml` with the local
pubkey in cloud-init's `ssh_authorized_keys`). Firewall reopened —
current Mac public IP `79.177.151.9` is now in the `openclaw-fw`
allowlist. Base toolchain installed (Node 22.22.2, npm 10.9.7, build-
essential, git, jq, tmux). OpenClaw `2026.5.18` installed via
`npm install -g openclaw`; gateway running as a systemd service
(`openclaw-gateway.service`) on `127.0.0.1:37777` with token auth
(token in `/etc/openclaw-gateway.env` mode 600). Loopback bind, no
external exposure. akashik working tree rsynced to
`/opt/akashik/` (`npm install` complete — 503 packages). All
three datasets staged: `/data/scifact` (8 MB), `/data/longmemeval`
(15 MB `longmemeval_oracle.json`), `/data/locomo` (2.7 MB
`locomo10.json`). Composite bench currently running in tmux session
`bench` writing to `/data/reports/run.{log,jsonl}`. Background
watcher will notify on completion.

## 2. The exact blocker — please resume here

The Claude Code auto-mode classifier rejects `hcloud server rebuild`
even after the user explicitly answered "Yes — proceed with the
rebuild" in an AskUserQuestion. Classifier reasoning is wrong
("user's confirmation question was never answered") — false positive.

**Workaround already negotiated with user:** they run the rebuild
themselves via the `!` shell prefix so the command goes through the
session as user-typed shell rather than a Claude tool call.

**The exact command to paste with `!` prefix** (user has the new
read+write HCLOUD token — DO NOT commit it; paste-back on resume):

```
! HCLOUD_TOKEN='<paste new read+write token here>' hcloud server rebuild 125481213 --image ubuntu-24.04
```

The original token in earlier turns (`clVNJq…`) was read-only.
User generated a new read+write one (`geTLI4ZUN1Mj…`) which the
classifier wouldn't let me invoke. User should paste either the same
new token OR a freshly minted one on resume.

## 3. What's confirmed about the target

| Field | Value |
|---|---|
| Project | "other" hcloud project (NOT `openclaw-project` which is the default context on this Mac) |
| Server name | `openclaw` |
| Server ID | `125481213` |
| IPv4 | `91.98.75.154` |
| Type | CAX11 (ARM, 2 cores, 4 GB RAM, 40 GB disk) |
| Current OS | Ubuntu 24.04 ARM (will be wiped + reinstalled with same image) |
| User authorization | YES — explicitly confirmed nuke in AskUserQuestion |
| SSH alias on this Mac | `hetzner` (user `handoff`) and `hetzner-root` (user `root`) — both point at `91.98.75.154` via `~/.ssh/handoff_ed25519` |
| Mac public IP (whitelisted in Hetzner firewall) | `5.28.182.156` |

## 4. Plan after rebuild lands

Order of operations once `ssh hetzner-root` starts responding (usually 30-60 s after rebuild API call returns):

1. **ssh in** as root via `hetzner-root`. Verify clean state: `lsb_release -a`, `df -h`, `free -h`, `ip a`.
2. **Install OpenClaw.** User wants the `octo:claw` skill flow — Ubuntu/Debian install path. Stack:
   - apt update + upgrade
   - install Node 22 LTS (NodeSource repo), git, curl, build-essential
   - install OpenClaw via the canonical install command (check `octo:claw` skill at resume time)
   - systemd service for the daemon
3. **Codex API key** → `/etc/openclaw/.env` mode 600. User will paste it on resume via AskUserQuestion. NEVER write to git, NEVER log it.
4. **MCP transport** = reverse-SSH (Tailscale not available per user). Plan: OpenClaw binds MCP on `127.0.0.1:7173` on the VM; this Mac opens `ssh -R 7173:127.0.0.1:7173 hetzner-root` as a persistent tunnel (or `autossh` for resilience); MCP server added to `~/.claude.json` on this Mac with the loopback URL.
5. **Phase 23.7 — real public-corpus benches.** Three adapters to write under `tests/bench/public-real/`:
   - `bench-scifact-real.test.ts` — full BEIR SciFact (5,183 docs × 300 queries), NDCG@10. Replaces the 30-doc proxy currently feeding `beirSciFactNdcg10`.
   - `bench-longmemeval-real.test.ts` — LongMemEval-S oracle split (500 questions, ~3 GB HF download). Recall@5 against gold evidence sessions.
   - `bench-locomo-real.test.ts` — LoCoMo factual subset from `snap-research/locomo` GitHub. F1 via the same harmonic-mean scorer the synthetic suite uses.
   All three are env-gated (`AKASHIK_BENCH_PUBLIC_REAL=1`) so CI stays fast — they only run on the Hetzner box.
6. **Run + report.** Expected composite jump: 0.9012 → ~0.95 depending on real-corpus reality (BEIR SOTA is 0.7522 not 1.0 so composite can't hit 1.0 on real data).

## 5. Secrets discipline

- **HCLOUD_TOKEN (new read+write):** lives in env only for the lifetime of `hcloud` commands. NEVER write to disk or commit. On final cleanup: `unset HCLOUD_TOKEN`.
- **HCLOUD_TOKEN (original read-only `clVNJq…`):** safe to leave alone; user generated it. We're not using it.
- **Codex API key (not yet provided):** user will paste via AskUserQuestion on resume. Goes ONLY to `/etc/openclaw/.env` on the VM via heredoc-piped ssh. Never on this Mac's disk.
- **SSH key `~/.ssh/handoff_ed25519`:** already on disk, user-managed, don't touch.

## 6. Files touched this session (uncommitted in working tree)

| Layer | File | Purpose |
|---|---|---|
| domain | `src/domain/cross-rerank.ts` | NEW — Phase 21 cross-encoder rerank pure logic |
| domain | `src/domain/long-term-memory.ts` | NEW — tier vocab + Beta(α,β) + retention math |
| domain | `src/domain/write-time-gate.ts` | NEW — write-time gating filter |
| domain | `src/domain/auto-forget.ts` | NEW — auto-forget planner |
| domain | `src/domain/bench-types.ts` | NEW — typed bench report shapes + composite |
| domain | `src/domain/errors.ts` | EDIT — added RerankError + ConsolidationError variants |
| infra | `src/infrastructure/cross-encoder.ts` | NEW — Xenova ms-marco-MiniLM-L-6-v2 adapter |
| infra | `src/infrastructure/summariser.ts` | NEW — Summariser port + ollama/fixture adapters |
| application | `src/application/ask.ts` | EDIT — wired cross-encoder rerank between hybrid + PPR |
| application | `src/application/auto-forget-tick.ts` | NEW — auto-forget orchestrator |
| cli | `src/cli/commands/gc.ts` | NEW — `akashik gc {list,apply}` |
| cli | `src/cli/commands/bench.ts` | NEW — `akashik bench memory` |
| cli | `src/cli/index.ts` | EDIT — registered `gc` + `bench` |
| tests | `tests/bench-tier-promotion.test.ts` | NEW — F1 = 1.0 |
| tests | `tests/bench-beta-calibration.test.ts` | NEW — worst err 0.011 |
| tests | `tests/bench-write-gate.test.ts` | NEW — F1 = 1.0 |
| tests | `tests/bench-retention-band.test.ts` | NEW — accuracy = 1.0 |
| tests | `tests/bench-auto-forget.test.ts` | NEW — F1 = 1.0 |
| tests | `tests/bench-longmemeval-synth.test.ts` | NEW — R@5 = 1.0 |
| tests | `tests/bench-locomo-synth.test.ts` | NEW — harmonic mean dim 0.864 |
| tests | `tests/bench-standard.test.ts` | EDIT — emits BenchSuiteReport for hotpotqaRecall5 |
| tests | `tests/bench-real.test.ts` | EDIT — emits BenchSuiteReport for beirSciFactNdcg10 |
| tests | `tests/cross-rerank.test.ts` | NEW — unit, 8/8 |
| tests | `tests/long-term-memory.test.ts` | NEW — unit, 21/21 |
| tests | `tests/write-time-gate.test.ts` | NEW — unit, 12/12 |
| tests | `tests/summariser.test.ts` | NEW — unit, 10/10 |
| tests | `tests/auto-forget.test.ts` | NEW — unit, 9/9 |
| planning | `.planning/phases/phase-21/21-CONTEXT.md` | NEW |
| planning | `.planning/phases/phase-23/23-CONTEXT.md` | NEW |
| planning | `.planning/long-term-memory-integration.md` | NEW (research synth) |
| docs | `docs/research/energy-based-contradiction-detection.md` | NEW (forward sketch) |
| docs | `docs/product/BENCHMARKS.md` | EDIT — Phase 23 section appended |

`git status` will show all of these as modified/untracked. The user has not asked for a commit yet; default policy is no commit unless asked.

## 7. Open tasks at handoff time (task list won't survive context clear)

Carry these as TodoWrite items on resume:

1. ~~Wait for user `! hcloud server rebuild …` command output~~ — still blocked locally:
   classifier rejects `hcloud server rebuild` and `ssh hetzner-root` as
   "Production Reads/Writes" without explicit per-command authorization;
   workaround is for the user to run them with the `!` prefix. The local
   `HCLOUD_TOKEN` in env also authenticates to `openclaw-project`, which
   does NOT contain server `125481213` — that lives in the "other"
   project and needs the read+write token from HANDOFF §2.
2. ssh into rebuilt box via `hetzner-root`, verify clean state
3. Install OpenClaw using `octo:claw` skill (or manual apt + npm flow)
4. Receive + install Codex API key (`/etc/openclaw/.env` mode 600)
5. Wire MCP over reverse-SSH; register in `~/.claude.json`
6. Verify MCP call works from this Mac
7. ~~Write 3 real-corpus bench adapters~~ — **DONE 2026-05-20**, files
   landed flat under `tests/` (project test glob is `tests/*.test.ts`, not
   nested) and all env-gated behind `AKASHIK_BENCH_PUBLIC_REAL=1`:
   - `tests/bench-scifact-real.test.ts` — BEIR SciFact NDCG@10. Needs
     `BEIR_SCIFACT_DIR` pointing at `corpus.jsonl + queries.jsonl +
     qrels/test.tsv`. Floor: NDCG@10 ≥ 0.30.
   - `tests/bench-longmemeval-real.test.ts` — LongMemEval-S oracle
     Recall@5. Needs `LONGMEMEVAL_DIR/longmemeval_oracle.json`. Floor:
     R@5 ≥ 0.40.
   - `tests/bench-locomo-real.test.ts` — LoCoMo factual subset (cats
     1/2/3) harmonic-mean dimension. Needs `LOCOMO_DIR/locomo10.json`.
     Floor: dim ≥ 0.40. LLM-extractor flag wired but no-op pending 23.8.
   All three use `xenovaEmbedder()` (all-MiniLM-L6-v2 fp32 mean-pooled
   512 max_len) wrapped in `batchingEmbedder({ maxBatch: 32 })`. They
   `t.skip()` cleanly when the master gate or data dir is missing —
   verified 2026-05-20 with both env permutations.
8. Run them on the Hetzner box, report composite delta
9. Update `docs/product/BENCHMARKS.md` with real numbers
10. Commit + push (only if user asks)

## 8. Context that's easy to forget

- `git push` is NEVER done without explicit user authorization (user policy in CLAUDE.md). Commits only when asked.
- The `octo:claw` skill exists locally — invoke it for OpenClaw setup instead of hand-rolling.
- The user pinned Codex specifically (not Claude/Gemini) for the remote provider — relevant if `octo:claw` asks which provider to wire.
- Tailscale is NOT installed — don't suggest it. Reverse-SSH is the agreed transport.
- All public-corpus adapters MUST be env-gated. CI stays fast; only the Hetzner box runs them.
- `AKASHIK_BENCH_OUT` is the JSONL append target for any bench file — the composite runner spawns each suite with it set. Document this in any new bench file.
- The pre-existing 4 test failures (Phase 17 tool-count, Phase 20 deps, Phase 35 P2P E2E, peer-order-builder flake) are NOT in scope to fix — they're project drift, document only.
- Synthetic LoCoMo scorer: dropped full-summary token-F1 because it was mathematically pinned tiny; replaced with harmonic mean of evidence-recall + answer-token-containment. Documented in suite header. Real-LoCoMo Phase 23.7 adapter should use the same metric — OR opt-in to LLM extractor via `AKASHIK_BENCH_LLM_EXTRACTOR=1`.

## 9. Composite numbers worth quoting

```
composite: 0.9012 / 1.0000   (9 suites, 18.5s local)

beirSciFactNdcg10         0.6816   ← 30-doc local proxy (real BEIR pending on Hetzner)
hotpotqaRecall5           0.9667
longmemevalRecall5        1.0000   (synthetic; real-LME pending on Hetzner)
locomoFactualF1           0.8640   (harmonic-mean dim; real-LoCoMo pending on Hetzner)
tierPromotionF1           1.0000
betaCalibration           0.9890
autoForgetF1              1.0000
retentionBandAccuracy     1.0000
writeGateF1               1.0000
```

## 10. Resume checklist (paste this prompt to continue)

> "Resume from `.planning/HANDOFF.md`. We left off about to rebuild the Hetzner box for Phase 23.7. The classifier blocked the rebuild; I'm pasting the user-typed `! hcloud server rebuild` output now. Proceed from there."

End of handoff.

exec
/bin/zsh -lc "sed -n '1,220p' .planning/long-term-memory-integration.md" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
# Long-Term Memory Integration Plan

Fold three engineering wins from `rohitg00/agentmemory` into akashik,
plus add the long-term memory layer we've been missing. P2P-native, not a
verbatim port.

## What we're adding (and why)

| # | Capability | Source pattern | Why we need it |
|---|---|---|---|
| 1 | BM25 + dense + graph fused via RRF | `src/state/hybrid-search.ts` | We currently fuse dense + tag overlap + PPR. No sparse lane. RRF (k=60) is the canonical TREC fusion — known win on heterogenous queries (acronyms, code identifiers, exact-string lookups dense misses) |
| 2 | Cross-encoder rerank on top 20 | `src/state/reranker.ts` (Xenova ms-marco-MiniLM-L-6-v2) | Last-mile precision lift on a small window. Optional, env-gated, quantised, CPU-only |
| 3 | Long-term memory tiers + consolidation | `src/functions/consolidation-pipeline.ts` + `consolidate.ts` | We have raw nodes + `synthesis://` URIs but no automated promotion pass. Without this, the graph just grows linearly and gets noisier |
| 4 | Retention scoring + auto-forget | `src/functions/retention.ts`, `auto-forget.ts` | Currently `age_days` is metadata only. No active decay, no contradiction handling. Stale wrong answers stick around forever |

What we're explicitly **not** taking:

- `iii-engine` / `iii-sdk` runtime DSL — homebrew, no portability value.
  Our `EmbeddingProvider`, `StateKV`-equivalents already exist (the
  `graph-repository.ts`, `vector-index.ts`, `embedders.ts` pair).
- Their KV-only storage — we keep `graph.json` + `vectors.db` because
  CRDT room sync demands a node/edge surface they don't have.
- Their entity-extraction LLM call on every write — too costly at our
  ingest rate, and our `entity-registry.ts` already does deterministic
  extraction.

## Long-term memory model — the four tiers, mapped to our world

agentmemory's tier names are misleading for a P2P system. Here's the
mapping that actually fits akashik:

| Their tier | Their meaning | Our equivalent | New work |
|---|---|---|---|
| Working | Raw observations from one tool call | Graph nodes from `ingest.ts` (already exists) | None |
| Episodic | Session-level summary | `session://<sid>` node, written at SessionEnd | New: session summariser |
| Semantic | Cross-session merged facts | `synthesis://<topic>` node (exists, but written by hand) | New: auto-promotion from clustered concept hits |
| Procedural | Recurring workflows | `decision://<workflow>` node (exists, by hand) | New: pattern miner over recurring code-graph traversals |

The P2P twist: **semantic + procedural memories advertise into the
`toolshed` room**, episodic stays local (privacy). When peers query, they
see your validated long-term memory, not your raw session traces. This is
the cooperative-learning bit — peer A's hard-won workflow becomes peer B's
prefetch hit.

## Architecture — where each piece slots into our DDD layers

```
src/
  domain/
    retention.ts          [NEW] pure retention math (decay, salience, RRF)
    consolidation.ts      [NEW] tier promotion rules (pure, testable)
    contradiction.ts      [NEW] Jaccard-on-tokens cluster detector
  application/
    hybrid-search.ts      [NEW] triple-stream fuser orchestrating
                                vector-index + bm25-index + graph-rerank,
                                replacing the current dense-only path in
                                ask.ts. Keeps the same AskResult shape.
    consolidate-tick.ts   [NEW] scheduled use case; runs every N hours
                                via daemon/loop.ts, promotes tiers.
    auto-forget-tick.ts   [NEW] TTL + contradiction + low-value purge
  infrastructure/
    bm25-index.ts         [NEW] sparse index, persisted to ~/.akashik/bm25.json
    reranker.ts           [NEW] optional Xenova cross-encoder, env-gated
  daemon/
    loop.ts                [edit] register consolidate-tick + auto-forget-tick
  mcp/
    server.ts              [edit] expose `consolidate` + `forget` tools
```

Strict layering: domain has zero infra deps. application calls infra ports
via existing interfaces. Same shape as the rest of the repo.

## Phase breakdown

### Phase A — Hybrid search (RRF + rerank)

**Domain (pure):**
- `domain/retention.ts` exports `rrf(rankLists: number[][], k=60)` and
  weighted-RRF variant.
- Verify with property tests: rrf of identical lists ranks them top;
  rrf of disjoint lists interleaves by k+rank.

**Infrastructure:**
- `infrastructure/bm25-index.ts` — port the BM25 logic from their
  `search-index.ts`. Persist as JSONL. Stemmer + synonym file optional
  per language.
- `infrastructure/reranker.ts` — `@xenova/transformers` lazy load.
  Quantised model. Env flag `AKASHIK_RERANK=1`. Falls open on
  load failure (returns input unchanged).

**Application:**
- New `hybrid-search.ts` use case. Replaces the call site in
  `ask.ts:searchByRoom`. Same `AskHit[]` return shape so the
  satisfaction scorer and the hook contract don't change.

**Acceptance:**
- BEIR SciFact NDCG@10 ≥ current 75.22% (don't regress).
- With reranker on: ≥ +2 points (cross-encoder lift is well documented).
- p50 local latency stays ≤ 25 ms without reranker, ≤ 80 ms with.

### Phase B — Long-term memory tiers

**Domain:**
- `domain/consolidation.ts` — pure tier-promotion rules. Input: list of
  graph nodes + access logs. Output: planned promotions
  (`{ from: 'observation', to: 'semantic', nodes: [...] }`). No I/O.
- Concept-cluster detection: nodes sharing >= 3 concept tags AND
  cosine ≥ 0.7 → candidate semantic memory.
- Pattern detection (procedural): recurring `code_graph` traversals
  appearing in ≥ 2 sessions → candidate procedural memory.

**Application:**
- `consolidate-tick.ts` — uses a `MemoryProvider` port (we already have
  `EmbeddingProvider`; adding a `SummariserProvider` for LLM
  summarisation). Default impl: local llama.cpp or hosted via the
  bring-your-own-API user already configured for embeddings.
- Output: writes `session://`, `synthesis://`, `decision://` URI nodes
  via existing `graph-repository.ts`. No new storage.
- Schedules: configurable. Defaults — episodic at SessionEnd hook;
  semantic + procedural every 6h; decay every 24h.

**P2P:**
- New `decision://` and `synthesis://` nodes automatically land in
  `toolshed` (already wired in `internal-schemes.ts:50-51`).
- No change to room-sharing — these are first-class shareable types.

**Acceptance:**
- On a 7-day session corpus, consolidation produces ≥1 semantic memory
  per recurring concept (≥ 3 hits).
- Procedural extraction recovers ≥ 1 workflow per pattern with
  frequency ≥ 2.
- LongMemEval-S style benchmark target: ≥ 80% R@5 on synthetic
  long-term recall. (We don't have to match their 95.2% — they overfit
  to a 500-question set — but we need a documented number.)

### Phase C — Retention scoring + auto-forget

**Domain:**
- `domain/retention.ts` — pure score math:
  ```
  retention = clip(0..1, salience × exp(-λ·Δt) + σ·Σ(1/days_since_access))
  ```
  λ = 0.01, σ = 0.3, tier-thresholds hot=0.7 warm=0.4 cold=0.15. Same
  defaults as theirs, expose via `~/.akashik/config.json`.
- `domain/contradiction.ts` — Jaccard on shared-concept clusters.
  Threshold 0.9, older loses, audit-logged.

**Application:**
- `auto-forget-tick.ts` — TTL expiry, contradiction resolution,
  low-importance pruning (their 180-day + importance ≤ 2 default fits).

**P2P:**
- Auto-forget is **local only**. Never propagates a delete across the
  mesh. A peer that "forgets" simply stops advertising; if another peer
  asks, the touch protocol returns 0 nodes. Other peers may still hold
  the same content — that's fine, federation is eventually-consistent
  on content, not on delete operations.

**Acceptance:**
- Retention scores written to a new KV scope `retention.json` (parallel
  to `peer-reputation-store.ts` pattern). Surfaced via statusline.
- Auto-forget dry-run + apply CLI subcommand under `akashik gc`.
- Contradiction detector pages an audit entry to
  `~/.akashik/audit.jsonl`.

## What this replaces / deprecates

- `application/recall.ts` — keep as-is (entity-mentions recall is
  orthogonal). Hybrid search runs in parallel, results merged in `ask.ts`.
- `domain/recency-rerank.ts` — subsumed by retention scoring (recency
  becomes one component, not its own pass).
- Hand-written `synthesis://` notes — keep, but consolidation creates
  them automatically too.

## Open architectural questions for the research pass

1. **BM25 index sync via CRDT** — our `share-sync.ts` ships graph diffs,
   not inverted-index diffs. Do we ship the BM25 index across peers, or
   does each peer rebuild on receive? Rebuild is simpler; ship is faster
   on cold join. Default: rebuild on receive, async, behind a feature
   flag — same pattern as `vector-index.ts` rebuild.
2. **Summariser provider** — bring-your-own-key (OpenAI / Anthropic /
   local llama.cpp) versus mandate-local. Mandate-local keeps the
   privacy story clean but raises CPU floor. Default: local first, BYO
   key optional via env. Same pattern as `embedders.ts`.
3. **Tier-aware ranking** — should semantic/procedural memories
   outrank raw observations in `ask` results? Yes, weighted into RRF as
   a fourth lane with weight 0.5 of the dense lane.
4. **Cross-peer contradiction** — when peer B's semantic memory
   contradicts peer A's local semantic memory, who wins? Local always
   wins on the local view; the peer hit is surfaced with a contradiction
   badge. Resolution stays human-in-the-loop.

## Research findings — answers to the four open questions

### Q1. BM25 index over CRDT?

**Decision: rebuild on receive, never ship the index.**

Our `share-sync.ts` already commits to this pattern. The Y.Doc / Y.Map
sync protocol ships only the `ShareableNode` payloads (text + metadata),
filtered through `buildPatterns` for secret redaction before
`applyUpdate`. The local `vector-index.ts` rebuilds on receive
asynchronously, not over the wire. BM25 is the same problem class:
- Inverted indexes are derivable from the corpus. Shipping them is
  redundant bandwidth.
- Indexes diverge per locale (stemmer differs by language config). A
  peer-shipped index would be wrong for receivers using a different
  stemmer.
- The CRDT semantics on a Y.Map of token→[postings] would be
  awful — every insert is a multi-key write with concurrent edits.

Implementation: `infrastructure/bm25-index.ts` exposes an
`onNodeUpserted(node)` hook called from the same Y.Map observer that
already rebuilds the vector index (`share-sync.ts:362`). One-line
addition to the existing path.

### Q2. Summariser provider — local mandate vs BYO?

**Decision: BYO with a local default, exactly like `embedders.ts`.**

exec
/bin/zsh -lc "sed -n '1,220p' docs/product/BENCHMARKS.md" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
# Benchmarks — full BEIR v1, Phase 25 SOTA + 13 documented null attacks

Real retrieval quality measured against canonical BEIR datasets using Akashik's runtime pipeline. All numbers directly comparable to the [MTEB BEIR leaderboard](https://huggingface.co/spaces/mteb/leaderboard).

```
╔═══════════════════════════════════════════════════════════════════════╗
║  BEIR SciFact (5,183 × 300) — progression                             ║
╠═══════════════════════════════════════════════════════════════════════╣
║  Baseline  MiniLM-L6 dense only               NDCG@10  64.82%         ║
║  Wave 1  + nomic-embed-v1.5 (768d, Xenova)    NDCG@10  69.98%  +5.16  ║
║  Wave 2  + BM25 FTS5 hybrid (RRF k=60)        NDCG@10  72.30%  +2.32  ║
║  Phase 25  Rust bge-base sidecar + hybrid     NDCG@10  75.22%  +2.92  ║
║  Calibrated  gpt-oss:20b judge (κ=0.7053)     NDCG@10 ~81.06%  +5.84  ║
╠═══════════════════════════════════════════════════════════════════════╣
║  Phase 25 is the measured CPU-local ceiling on standard qrels.        ║
║  bge-base-en-v1.5 (Rust fastembed) + FTS5 BM25 + RRF (k=60)           ║
║  137M params · 11 ms p50 end-to-end · zero GPU · zero cloud           ║
╚═══════════════════════════════════════════════════════════════════════╝
```

### Phase 25 detail — where 75.22% lands on the leaderboard

| Model | Params | SciFact NDCG@10 | Runtime |
|-------|--------|-----------------|---------|
| BM25 (Anserini) | — | 66.5% | CPU |
| all-MiniLM-L6-v2 (v1 baseline) | 23M | 64.82% | CPU |
| nomic-embed-text-v1.5 (dense) | 137M | 70.36% | CPU |
| bge-base-en-v1.5 (dense) | 110M | 74.04% | CPU |
| **Akashik Phase 25 (hybrid + Rust)** | **137M** | **75.22%** | **CPU, 11ms p50** |
| monoT5-3B reranker on top | 3B | 76.70% | **GPU** |
| InRanker-3B (monoT5-distilled) | 3B | 78.31% | **GPU** |

**+1.18 NDCG@10 over published bge-base dense**, 1.5 NDCG below monoT5-3B while requiring no GPU. On **calibrated qrels** (gpt-oss:20b LLM-as-judge audit, κ=0.7053 substantial-agreement per Landis-Koch 1977, 100% precision over 129 controls) the instrument-corrected ceiling is ~81% on a 50-query subset — confirming the standard-qrel ceiling is measurement-floor-bound, not pipeline-ceiling-bound.

### 13 null attacks — what didn't work (all measured, all reproducible)

| Round | Attack | Δ NDCG@10 | Verdict |
|---|---|---:|---|
| Wave 3 | `bge-reranker-base` cross-encoder | **−1.92** | MS-MARCO domain mismatch on scientific text |
| Wave 4 | oracle room routing on CQADupStack | +0.34 | below 3pt gate — disjoint vocab already implicit |
| §2i | PPR rerank over doc-doc kNN | **−23.76** | single-hop diffusion leaks mass off gold |
| §2k-1 | RRF (k, α) parameter sweep | +0.17 | train-fold overfit, held-out null |
| §2k-2 | Rocchio dense PRF (m=5, α=0.7) | **−0.19** | encoder ceiling — no vocab gap at top-5 |
| §2k-3 | Qwen2.5:0.5B Contextual Retrieval | −1.46 | small LLM adds lexical noise |
| §2k-4 | Qwen2.5:3B Contextual Retrieval | −0.06 | 6× params, no signal gain |
| §2L-1 | ArguAna dense-only retarget | +1.45 | soft (gate was +5pt) |
| §2L-2 | Diagonal Jacobi preconditioning | **−0.77** | refutes "can't regress" claim |
| §2L-3 | qrel rejudge V1 (Qwen2.5:3B naive) | — | κ=0.418 (FAIL 0.6 gate) |
| §2L-4 | qrel rejudge V2 (4-shot + CoT) | — | κ=0.458 (FAIL 0.6 gate) |
| Round 3 V3 | qrel rejudge V3 (gpt-oss:20b) | +2.53 | **κ=0.7053 PASSES gate** — 2.8% qrel FN rate measured |
| Round 5 | InRanker-base stacked on hybrid top-50 | **−13.72** | in-domain training not enough — strong hybrid + pointwise rerank destroys precision |

Every null is accompanied by a reproduction script in [`scripts/`](scripts/) and a mechanistic explanation in [`.planning/BENCH-v2.md`](.planning/BENCH-v2.md). **Documented null > hypothetical positive.**

### Reproduce

```bash
# Phase 25 headline — requires Rust sidecar built
cd akashik-rs && cargo build --release && cd ..
AKASHIK_RUST_BIN=$(pwd)/akashik-rs/target/release/embed_server \
  node scripts/bench-beir-rust.mjs scifact --model bge-base

# Wave 2 (pure Node, no Rust)
node scripts/bench-beir-sota.mjs scifact --hybrid

# Wave 3 / reranker null — reproduces the −1.92pt regression
node scripts/bench-beir-sota.mjs scifact --hybrid --rerank

# Wave 4 / room routing null — requires CQADupStack
node scripts/bench-room-routing.mjs \
  --datasets-dir ~/.akashik/bench/cqadupstack/cqadupstack \
  --rooms mathematica,webmasters,gaming

# Calibrated qrel rejudge — requires Ollama + gpt-oss:20b
node scripts/qrel-rejudge.mjs 100 20
```

See [`.planning/BENCH-v2.md`](.planning/BENCH-v2.md) for the full attack archive (root-cause analysis, per-query bucket distributions, specialist post-mortems across 4 agent rounds) and [`.planning/BENCH-COMPETITORS.md`](.planning/BENCH-COMPETITORS.md) for verified competitor landscape (mem0, Graphiti/Zep, Letta, Mastra, Engram, cognee, memobase, Honcho, MemPalace, mcp-memory-service).

## Real numbers

```
75.22% NDCG@10 ┃ 11 ms p50 ┃ 48× vector compression ┃ 91.9% cross-model bridge
13 null attacks ┃ κ=0.7053 qrel audit ┃ 6.29× session consolidation
21 MCP tools ┃ 23 adapters ┃ 14 secret patterns ┃ 396 tests ┃ v4.0-rc1
```

<details>
<summary>Architecture (for contributors)</summary>

```
src/
  domain/           Pure types + functions, no I/O, Result monads (neverthrow)
                    graph · rooms · peer · sharing · codebase · errors · vectors
  infrastructure/   Ports + adapters — SQLite, ONNX, libp2p, tree-sitter
                    graph-repository · vector-index · peer-transport · peer-store
                    share-store · ydoc-store · share-sync · search-sync
                    bandwidth-limiter · connection-health · code-graph
                    tree-sitter-parser · sources/*
  application/      Use cases (ingest · discover · findTunnels · federated-search · codebase-indexer)
  daemon/           Tick loop + libp2p node lifecycle + share/search protocols
  mcp/              21 MCP tools over stdio
  cli/              Admin commands (peer · share · unshare · codebase · ask ·
                    oracle · save · hot · lint · etc.)
```

Functional DDD. Every fallible op returns `Result<T, E>`. No classes in domain/application. All deps verified via `gh api` + [ossinsight.io](https://ossinsight.io). 396 tests, zero regressions across v2.0 + v2.1.

**v2.0 phases shipped:**
1. Phase 15 — Peer Foundation + Security (libp2p ed25519 identity, 14-pattern secrets scanner, share audit)
2. Phase 16 — Room Sharing via Y.js CRDT (metadata-only replication, offline catchup)
3. Phase 17 — Federated Search + Discovery (cross-peer semantic search, mDNS, DHT wiring)
4. Phase 18 — Production Networking (NAT traversal, bandwidth management, health monitoring, 10-peer mesh verified)
5. Phase 19 — Structured Codebase Indexing (tree-sitter code graph, separate from research rooms, attachable via M:N)
6. Phase 20 — Session capture + 16th MCP tool (recent_sessions rollup, always-local room)

**v2.1 waves shipped:**
7. Phase 24–25 — Rust embed_server + bge-base via fastembed-rs (75.22% SciFact NDCG@10, +11.9 over Xenova)
8. Phase 31–35 — Remote-node validator at trust boundary + real two-peer touch E2E (caught the silent `git://` drop bug)
9. Phase 32–34 — Hot-cache recency digest + graph-lint (8 hygiene rules + P2P drift) + save (typed distillation notes)
10. Phase 36 — **System rooms** (toolshed + research + oracle, always-on, age-aware, virtual membership)
11. Phase 37 — Interactive share picker (zero-dep ANSI TUI)
12. Phase 38 — **Oracle bulletin board** (Layer A: questions + answers via touch + CRDT, 5 MCP tools)
13. Phase 39 — **Oracle gossip** (Layer B: real-time pubsub via @libp2p/floodsub, daemon subscribes on boot)
14. Phase 21–22 — Long-term memory tiers (episodic/semantic/procedural), Bayesian reliability, write-time gate, auto-forget
15. Phase 23 — **Unified memory bench** (`akashik bench memory`): 8 suites scoring 9 dimensions, composite **0.8597** on real public corpora (Phase 23.7 — Hetzner, 2026-05-20). Synthetic-fallback composite is 0.9107.

</details>

---

## Phase 23 — Unified Memory Benchmark

The long-term memory work shipped in Phase 21/22 (tier vocabulary, Beta(α,β)
reliability counters, write-time gating, auto-forget) needed a benchmark
that's stricter than any single public suite. Phase 23 ships `akashik
bench memory` — a runner that scores 9 dimensions across 8 suites and
emits a single composite score.

Run it:
```bash
akashik bench memory --json
```

### Composite — measured 2026-05-20 (Phase 23.6.1 — scorer fix)

| Dimension | Weight | Score | Contribution | Source |
|---|---:|---:|---:|---|
| beirSciFactNdcg10 | 0.25 | **0.6816** | 0.1704 | local 30-item labeled corpus (NDCG@5, BEIR SciFact proxy) |
| hotpotqaRecall5 | 0.15 | **0.9667** | 0.1450 | 15-passage wiki multi-hop with real Xenova MiniLM |
| longmemevalRecall5 | 0.20 | **1.0000** | 0.2000 | 20-session × 20-query synthetic LongMemEval-style |
| locomoFactualF1 | 0.10 | **0.8640** | 0.0864 | 4-persona × 40-session × 6-month synthetic LoCoMo — harmonic mean of evidence-recall (0.833) AND answer-token-containment (0.897) |
| tierPromotionF1 | 0.10 | **1.0000** | 0.1000 | 200 labelled URIs, macro-F1 over 4 tiers |
| betaCalibration | 0.05 | **0.9890** | 0.0495 | 1000-step Bernoulli streams at p ∈ {0.2, 0.5, 0.8} |
| autoForgetF1 | 0.05 | **1.0000** | 0.0500 | 50-node staged graph (5 TTL + 10 ancient + 35 keep) |
| retentionBandAccuracy | 0.05 | **1.0000** | 0.0500 | 28 hand-labelled (keep/discard/unsure) rows |
| writeGateF1 | 0.05 | **1.0000** | 0.0500 | 100 labelled (60 promote, 40 drop) candidates |

**Composite: 0.9012 / 1.0000** — elapsed 18.5 s end-to-end on commodity laptop hardware (M-class). All 9 dimensions reporting real numbers.

#### LoCoMo scorer choice (Phase 23.6.1)

First Phase 23.6 cut measured LoCoMo via token-F1 between the FULL retrieved-summary text and the SHORT gold-answer string. That metric is mathematically pinned tiny (long summary + short gold = bad precision no matter how good retrieval is) and gave a misleading 0.14 even when evidence-recall was 0.83. Fixed in Phase 23.6.1:

```
locomoFactualF1 = harmonic_mean(evidenceRecall, answerTokenContainment)

evidenceRecall          = (queries where ground-truth evidence sessions all in top-3) / total queries
answerTokenContainment  = mean over queries of:
                            (gold answer's key tokens present in top-3 retrieved text)
                            / (gold answer's key tokens)
                          key tokens = length > 2 AND not in stopword set
```

This is honest retrieval-only scoring. Per-persona breakdown of the current run (Alice marathon training / Bob Prague apartment / Cara ETH PhD / Dan Vienna restaurant):

| Persona | answer-token containment | evidence-recall |
|---|---:|---:|
| Alice | 0.912 | 0.750 |
| Bob | 0.837 | 0.857 |
| Cara | 0.881 | 0.857 |
| Dan | 0.948 | 0.875 |

LLM-extractor mode (`AKASHIK_BENCH_LLM_EXTRACTOR=1`) — opt-in upgrade that swaps containment for a real Ollama Phi-4-mini extracted-answer scored via SQuAD F1 against gold — is the next ratchet (Phase 23.7).

### Why each suite exists

Three families:

**A. Public-benchmark proxies (re-implemented with our retrieval stack):**

- `dense-retrieval-labeled` (BEIR proxy) — 30-item 3-domain corpus with tag-based relevance. NDCG@5 reported in lieu of NDCG@10 because the relevance set per query is small. Real 5,183-doc SciFact adapter pending Phase 23.5.
- `hotpotqa-style` — 15 wiki passages, 20 multi-hop queries (Einstein → Nobel → photoelectric pattern). Real Xenova `all-MiniLM-L6-v2` embeddings.
- `longmemeval-synth` — 20-session × 20-query synthetic conversational fixture covering the 5 LongMemEval-S abilities: information extraction, multi-session reasoning, temporal reasoning, knowledge updates, abstention. Real LongMemEval-S oracle adapter (500q, ~115k tokens/Q, 3 GB HF dataset) pending Phase 23.7+.
- `locomo-synth` — 4-persona × 40-session × 6-month synthetic conversational corpus covering LoCoMo's long-horizon factual recall + temporal/causal reasoning axes. 30 queries with declared evidence-session ground truth; dimension scored on evidence-session retrieval recall (retrieval-only, no answer extractor). Real LoCoMo + extractor pending Phase 23.7+.

**B. Akashik-specific synthetic suites — five gap axes no public benchmark covers:**

| Axis | Why no public benchmark | What this suite stresses |
|---|---|---|
| Tier-promotion accuracy | MIRIX defines tiers but no scoring | Did the URI-scheme classifier nail observation/episodic/semantic/procedural? |
| Bayesian calibration | BCC (arxiv 2507.17951) gives methodology, no benchmark applies it | Does the Beta(α,β) on a procedural memory converge to the true Bernoulli rate? |
| Auto-forget precision | EvolMem touches cognitively, no scored fixture | Of demoted/deleted nodes, what fraction were actually stale? |
| Retention-band accuracy | No benchmark scores keep/discard human verdicts | Does retentionScore + retentionBand match a thoughtful reviewer's call? |
| Write-time gate F1 | No benchmark scores write-time filters | Does `partitionByGate` reject noise without dropping signal? |

### Acceptance gates (per suite)

Each suite asserts its own floor. A regressing dimension fails the suite, which fails the bench. The floors are set 5–15% below the current-baseline number to absorb small fixture drift, with the explicit semantics that "if we get below this, something real changed":

| Suite | Floor | Current |
|---|---:|---:|
| `tier-promotion` | macro-F1 ≥ 0.95 | 1.0000 |
| `beta-calibration` | worst calibration error \< 0.05 | 0.0110 (= 1 − 0.989) |
| `retention-band` | accuracy ≥ 0.80 | 1.0000 |
| `write-gate` | F1 ≥ 0.90 | 1.0000 |
| `auto-forget` | F1 ≥ 0.85 | 1.0000 |
| `longmemeval-synth` | R@5 ≥ 0.60 | 1.0000 |
| `locomo-synth` | harmonic-mean dimension ≥ 0.65 | 0.8640 |
| `hotpotqa-style` | NDCG@10 ≥ 0.30, MRR ≥ 0.50, R@10 ≥ 0.50 | NDCG@10 high, MRR high, R@10 high |

exec
/bin/zsh -lc "sed -n '1,220p' docs/product/VISION.md" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
# Vision — the agent-memory protocol problem

Akashik is not a vector store with peer sync bolted on. It is an attempt
at the protocol that decides whether peer knowledge is good enough for an
agent to trust, cite, or use *instead of* a live web search. The product
question:

> When a peer returns knowledge, how do we know it is satisfactory enough to
> stop the agent from searching the web?

If that question is weak, the whole P2P story is vibes — sometimes helpful,
sometimes stale, sometimes wrong, impossible to defend. If it's strong,
Akashik becomes a serious agent-memory protocol. Full thinking surface
(60+ pages, evolving) in
[`docs/PROTOCOL-QUALITY-QUESTIONS.md`](./docs/PROTOCOL-QUALITY-QUESTIONS.md).

### The humanity-level bottleneck

Agent systems are stuck on one thing right now:

> Agents can act faster than humans can verify, but they do not yet know when
> their context is sufficient.

The failure mode is not only hallucination. It's **premature closure** — an
agent sees a plausible chunk, forms a plan, and stops searching before it has
the missing fact that would change the action. Akashik treats this as a
protocol problem, not a model problem:

- Context is not evidence.
- Relevance is not sufficiency.
- Consensus is not independence.
- Freshness is not correctness.
- Confidence is not calibration.
- A memory is not a source unless it carries provenance.
- A source is not an answer unless it resolves the task.

### The decision the protocol must make

Every query needs an explicit breakpoint, not a top-k chunk list. There are
six possible decisions and six kinds of breakpoint that produce them:

| Decision                          | Breakpoint type | Trigger                                                      |
| --------------------------------- | --------------- | ------------------------------------------------------------ |
| Use local / peer memory           | **Stop**        | Enough independent evidence covers every required fact.      |
| Search only the missing facts     | **Continue**    | Partial coverage — agent knows what's still missing.         |
| Refresh the source                | **Refetch**     | Right source, may be stale.                                  |
| Verify against another peer/oracle| **Consensus**   | Multiple answers, independence not yet proven.               |
| Force live verification           | **Risk**        | High-risk task — peer memory cannot be final.                |
| Ask the user                      | **Ambiguity**   | Query underspecified; more retrieval won't fix it.           |

A possible scorer:

```
satisfaction =
    retrieval_quality
  + source_quality
  + freshness_quality
  + peer_trust
  + consensus
  + task_fit
  - risk_penalty
  - staleness_penalty
  - missing_metadata_penalty
```

| Score        | Default behavior                                  |
| ------------ | ------------------------------------------------- |
| ≥ 0.85       | Use peer/local memory; no live search             |
| 0.65 – 0.85  | Use memory, verify one source                     |
| 0.40 – 0.65  | Show memory as hints; perform live search         |
| < 0.40       | Cache miss — search or ask the oracle room        |

Numbers are placeholders. The point is the breakpoint is **explicit and
measurable**, not an emergent property of cosine distance.

### Coverage map > top-k

Instead of returning ranked chunks, the daemon should return a coverage map:

```json
{
  "query": "upgrade libp2p dcutr setup for Node 24",
  "required_facts": [
    "current libp2p version",
    "Node 24 compatibility",
    "dcutr config changes",
    "known breaking changes",
    "local repo usage"
  ],
  "covered": [
    { "fact": "local repo usage", "evidence": ["node:codebase:peer-transport.ts"], "confidence": 0.91 },
    { "fact": "known breaking changes", "evidence": ["peer:alice:release-note-summary"], "confidence": 0.62 }
  ],
  "missing": [
    { "fact": "current libp2p version", "recommended_action": "package_registry_fetch" },
    { "fact": "Node 24 compatibility", "recommended_action": "live_search" }
  ],
  "decision": "search_required"
}
```

This is brighter than top-k because it tells the agent **why** it should keep
searching, and **what to search for**. "Search the web" is too crude — there
are many escalation moves: official docs, exact source URI, package registry,
GitHub releases, local git history, peer oracle, run a local command, run a
benchmark, ask a human. The protocol should recommend the next-best action,
not a binary `search_required: true`.

### The agent contract

Every response should expose an explicit contract to the agent — more useful
than prose context because it gives a decision boundary:

```txt
I found evidence for X.
I did not find evidence for Y.
This is fresh enough because Z.
This is risky because W.
My recommendation: use memory / verify source / search / ask user.
```

### Conflict is more informative than agreement

If two peers disagree, that is often more valuable than a single smooth
answer. The protocol should return contradictions explicitly:

```json
{ "conflicts": [ {
  "claim": "libp2p dcutr works on Node 24",
  "supporting_evidence":   ["peer:a:session-2026-04-20"],
  "contradicting_evidence":["peer:b:release-note-2026-04-24"],
  "recommended_action": "verify_primary_source"
} ] }
```

### Many peers means data treatment, not just retrieval

At small scale, peer search feels like asking a few friends. At network scale
it is a data-processing problem. The system will receive duplicate memories,
near-duplicate summaries, stale once-current sources, contradictory claims,
weak LLM summaries, poisoned spam, lived measurements from unknown peers,
mixed source schemas, repeated re-shares with unclear origins. The protocol
must therefore separate four jobs:

1. **Acquire** peer data.
2. **Treat** it into a clean evidence substrate.
3. **Consolidate** redundant and related evidence (preserving conflict + minority).
4. **Reason** over the treated substrate with provenance intact.

Knowledge moves through explicit stages — the storage layer should reflect
this, not collapse them:

| Stage              | Meaning                                              | Allowed uses                              |
| ------------------ | ---------------------------------------------------- | ----------------------------------------- |
| `raw_remote`       | received from peer, minimally validated              | audit, quarantine, low-trust search       |
| `treated`          | normalized, deduped, scored, provenance-preserved    | retrieval, satisfaction scoring           |
| `consolidated`     | clustered or summarized across evidence              | context injection, reports                |
| `reasoned`         | claims extracted, conflicts found, coverage mapped   | agent contract, skip/search decisions     |
| `accepted_local`   | user or policy promoted it into local memory         | normal local retrieval                    |

**Deduplication is not deletion.** Duplicates can mean independent
discoveries, propagating misinformation, official-source dominance, or sybil
re-shares. Collapse for context, but keep an `EvidenceCluster` record that
preserves origin counts, peer lineage, freshness range, consensus and
conflict scores. Clusters — not individual nodes — should become the primary
retrieval unit at scale.

**Memory degrades** in many ways: source staleness, summary loss, context
drift, dependency drift, peer drift, semantic drift, protocol drift.
Version-sensitive memories should expire faster; repo-aware memories can
include lockfile hashes; consolidation should preserve "fragile facts" and
"what would make this stale" alongside summaries.

### Agent epistemics — typed knowledge

For every answer-bearing result, the agent should know what kind of knowledge
it's holding:

| Label           | Meaning                                                     |
| --------------- | ----------------------------------------------------------- |
| `observed`      | A peer directly saw or ran this.                            |
| `measured`      | A peer produced a benchmark or reproducible result.         |
| `sourced`       | A peer indexed a primary or secondary source.               |
| `summarized`    | An LLM compressed raw material into a memory.               |
| `inferred`      | A peer or model derived a conclusion from evidence.         |
| `hearsay`       | Records someone else's claim without primary evidence.      |
| `stale_known`   | The system knows this may be outdated.                      |
| `unknown_basis` | The basis is missing or stripped.                           |

This makes claim extraction first-class — peers can share `claim` records
with `evidence_kind`, `measured_at`, `environment`, `confidence`, linked back
to exact source spans, instead of laundering weak evidence into confident
prose summaries.

### Quality points & red lines

A quality point is a measurable feature that moves the breakpoint decision.

**Positive:** fresh primary source · direct local measurement · reproducible
command · peer with high historical satisfaction in this domain · independent
peer agreement · refreshable source URI · covers a required fact · exact
versions/dates/commands · verified signature chain · linked to local repo
code.

**Negative:** missing timestamp · summary without raw provenance · stale
source · no exact version · no source URI · single-origin re-share · peer
unknown in this domain · only semantically adjacent · conflicts with another
peer · query is high-risk or time-sensitive.

**Red lines — always block "skip search":**

- Missing `fetched_at`.
- No source or provenance for a factual claim.
- High-risk task (security / dependency / financial / legal) with no primary
  fresh source.
- All evidence traces to one origin through re-shares.
- Stale window exceeded and source can't be cheaply refreshed.
- Room-required signature missing or invalid.

### Minimum bright protocol — v1 milestone

exec
/bin/zsh -lc "sed -n '1,220p' docs/p2p/P2P-VISION.md" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
# P2P Knowledge Graph — akashik v2.0 Vision

## The Idea

Every developer running akashik has a local knowledge graph. Right now these graphs are isolated — your homelab research doesn't connect to mine.

**v2.0 makes them connected.** A peer-to-peer network where akashik nodes discover each other, share graph fragments, and build a collective knowledge layer that's bigger than any single user's research.

```
Developer A (homelab)          Developer B (ml-papers)
     ┌──────────┐                  ┌──────────┐
     │ 500 nodes│                  │ 800 nodes│
     │ 3 rooms  │                  │ 2 rooms  │
     └────┬─────┘                  └────┬─────┘
          │         P2P mesh             │
          └──────────┬───────────────────┘
                     │
            ┌────────┴────────┐
            │ Shared subgraph │
            │  tunnels across │
            │  both graphs    │
            └─────────────────┘
```

## How It Works

### Discovery
- Nodes announce themselves on a local network via mDNS/Bonjour
- Or register with a lightweight coordination server (optional)
- Or manually add peers: `akashik peer add <address>`

### Sharing Protocol
- Each node exposes a subset of its graph as "public rooms"
- Private rooms stay local (homelab stays mine)
- Shared rooms are replicated via CRDT (conflict-free replicated data types)
- Only node metadata + embeddings are shared — not raw source content

### Collective Intelligence
- Tunnel detection runs ACROSS peers — my homelab connects to your ml-papers
- Shared discovery loop: if peer B finds a great ArXiv source, peer A gets it suggested
- Federated search: `akashik ask "vector search" --peers` searches across all connected graphs

### Privacy Model
- **Opt-in only** — nothing shared by default
- **Room-level control** — mark rooms as public/private
- **Metadata only** — share node labels + embeddings, not full text
- **No central server** — peers connect directly
- **Encryption** — all P2P traffic encrypted with peer-to-peer TLS

## Architecture

```
src/
  p2p/
    peer.ts              Peer identity (keypair, address, capabilities)
    discovery.ts         mDNS + manual peer registry
    protocol.ts          Graph fragment exchange protocol (protobuf over QUIC)
    replication.ts       CRDT-based room synchronization
    federated-search.ts  Cross-peer semantic search aggregation
    privacy.ts           Room visibility rules, metadata stripping

  cli/
    commands/
      peer.ts            peer add|remove|list|status
      share.ts           share room|unshare room
```

### Protocol

```
PEER_HELLO    → exchange capabilities, room lists, node counts
ROOM_SYNC     → CRDT state vector exchange for shared rooms
NODE_PUSH     → push new nodes (metadata + embedding only)
SEARCH_QUERY  → federated search request
SEARCH_RESULT → aggregated results from peer's local graph
TUNNEL_ALERT  → cross-peer tunnel candidate notification
```

### CRDT Choice

Use **Automerge** or **Y.js** for the room-level CRDT:
- Each shared room is a CRDT document
- Node inserts/updates/deletes converge across peers
- No coordination server needed — peers sync directly
- Offline-first — changes queue and sync when reconnected

## Use Cases

### Research Teams
A team of 5 researchers each tracks different domains. P2P akashik connects their graphs. When researcher A indexes a paper about "efficient attention", researcher B (tracking "GPU optimization") gets a tunnel notification: "your GPU optimization connects to A's attention paper."

### Open Source Communities
A project maintainer shares their `project-x` room publicly. Contributors connect as peers and get the maintainer's research context (relevant papers, HN discussions, competitor analysis) automatically merged into their local graph.

### Conference Networks
At a conference, attendees run akashik in P2P mode. Their graphs auto-discover via local network. The collective graph of 100 attendees, each with 500 nodes, creates a 50K-node searchable knowledge base spanning every talk, paper, and conversation.

## Implementation Phases

### Phase 15: P2P Foundation
- Peer identity (ed25519 keypair)
- Manual peer management (`peer add/remove/list`)
- Basic graph fragment exchange over WebSocket

### Phase 16: Room Sharing
- Public/private room marking (`share room/unshare room`)
- CRDT-based room sync (Automerge)
- Metadata-only replication (no raw text)

### Phase 17: Federated Search
- Cross-peer search aggregation
- Tunnel detection across peers
- Shared discovery loop

### Phase 18: Production P2P
- mDNS auto-discovery
- QUIC transport (faster than WebSocket)
- Encryption + auth
- Bandwidth management + sync throttling

## What This Means

akashik goes from "your personal research memory" to "a collective intelligence network for developers." Every peer makes the network smarter. The graph grows faster than any individual could build it.

This is the end state: **a decentralized knowledge graph where every coding agent in the world shares what it learned.**

exec
/bin/zsh -lc "find .claude-octopus -maxdepth 2 -type f | sort | head -n 100 && printf '\\n---\\n' && find .agents -maxdepth 3 -type f | sort | head -n 100" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
.claude-octopus/state.json
.claude-octopus/state.json.backup

---
.agents/skills/copywriting/SKILL.md
.agents/skills/design-taste-frontend/SKILL.md
.agents/skills/full-output-enforcement/SKILL.md
.agents/skills/high-end-visual-design/SKILL.md
.agents/skills/imagegen-frontend-web/SKILL.md
.agents/skills/industrial-brutalist-ui/SKILL.md
.agents/skills/minimalist-ui/SKILL.md
.agents/skills/redesign-existing-projects/SKILL.md
.agents/skills/stitch-design-taste/DESIGN.md
.agents/skills/stitch-design-taste/SKILL.md

codex
The planning tree is strongly historical: it documents how the project got here, but it is not a good live operating surface anymore. I’m doing one more pass over CLI/features and representative older tests so I can separate “still a platform capability” from “artifact of the old personal-memory product thesis.”
exec
/bin/zsh -lc "sed -n '1,260p' src/cli/index.ts" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
#!/usr/bin/env node
/**
 * akashik CLI — subcommand router.
 *
 * Phase 0: doctor, version, help.
 * Phase 1: (runtime checks extended in doctor).
 * Phase 2: trigger, sources.
 * Future phases add: init, room, daemon, discover, telegram, report, ask, mcp.
 */

import { doctor } from './commands/doctor.js';
import { version } from './commands/version.js';
import { printHelp } from './commands/help.js';
import { trigger } from './commands/trigger.js';
import { sources } from './commands/sources.js';
import { mcp } from './commands/mcp.js';
import { init } from './commands/init.js';
import { room } from './commands/room.js';
import { ask } from './commands/ask.js';
import { report } from './commands/report.js';
import { daemon } from './commands/daemon.js';
import { discoverCmd } from './commands/discover.js';
import { indexProject } from './commands/index-project.js';
import { claudeInstall } from './commands/claude-install.js';
import { discoverLoopCmd } from './commands/discover-loop.js';
import { publish } from './commands/publish.js';
import { telegram } from './commands/telegram.js';
import { viz } from './commands/viz.js';
import { exportObsidian } from './commands/export-obsidian.js';
import { dashboard } from './commands/dashboard.js';
import { peer } from './commands/peer.js';
import { share } from './commands/share.js';
import { unshare } from './commands/unshare.js';
import { touch } from './commands/touch.js';
import { hot } from './commands/hot.js';
import { lint } from './commands/lint.js';
import { save } from './commands/save.js';
import { oracle } from './commands/oracle.js';
import { codebase } from './commands/codebase.js';
import { recentSessions } from './commands/recent-sessions.js';
import { identity } from './commands/identity.js';
import { logs } from './commands/logs.js';
import { update } from './commands/update.js';
import { consolidate } from './commands/consolidate.js';
import { sessions } from './commands/sessions.js';
import { cacheStats } from './commands/cache-stats.js';
import { onboard } from './commands/onboard.js';
import { thisCmd } from './commands/this.js';
import { jobs } from './commands/jobs.js';
import { recallCmd } from './commands/recall.js';
import { entity } from './commands/entity.js';
import { evalCmd } from './commands/eval.js';
import { metricsCmd } from './commands/metrics.js';
import { login } from './commands/login.js';
import { peersRep } from './commands/peers-rep.js';
import { swarm } from './commands/swarm.js';
import { gc } from './commands/gc.js';
import { bench } from './commands/bench.js';

type CommandFn = (args: string[]) => Promise<number> | number;

const commands: Record<string, CommandFn> = {
  doctor,
  version,
  '--version': version,
  '-v': version,
  help: printHelp,
  '--help': printHelp,
  '-h': printHelp,
  trigger,
  sources,
  mcp,
  init,
  room,
  ask,
  report,
  daemon,
  discover: discoverCmd,
  index: indexProject,
  claude: claudeInstall,
  'discover-loop': discoverLoopCmd,
  publish,
  telegram,
  viz,
  export: exportObsidian,
  dashboard,
  peer,
  share,
  unshare,
  touch,
  hot,
  lint,
  save,
  oracle,
  codebase,
  'recent-sessions': recentSessions,
  identity,
  logs,
  update,
  consolidate,
  sessions,
  'cache-stats': cacheStats,
  onboard,
  this: thisCmd,
  jobs,
  recall: recallCmd,
  entity,
  eval: evalCmd,
  metrics: metricsCmd,
  login,
  swarm,
  gc,
  bench,
  // Plural-form alias: `akashik peers rep …` works as well as
  // `akashik peer rep …`. The subcommand dispatcher handles both.
  peers: async (args: string[]): Promise<number> => {
    const [sub, ...rest] = args;
    if (sub === 'rep') return peersRep(rest);
    console.error('peers: only `rep` is implemented today (more coming).');
    console.error('  usage: akashik peers rep [<peer-id>] [--subject <key>] [--json]');
    return sub ? 1 : 1;
  },
};

const futureCommands = new Set<string>([]);

async function main(): Promise<number> {
  const [cmd, ...rest] = process.argv.slice(2);
  if (!cmd) {
    printHelp([]);
    return 0;
  }
  const handler = commands[cmd];
  if (handler) {
    return (await handler(rest)) ?? 0;
  }
  if (futureCommands.has(cmd)) {
    console.error(`akashik: '${cmd}' is recognized but not yet implemented (Phase 0 scaffold).`);
    console.error(`               see the roadmap — it lands in a later phase.`);
    return 2;
  }
  console.error(`akashik: unknown command '${cmd}'. run 'akashik help'.`);
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('akashik: fatal error');
    console.error(err);
    process.exit(1);
  });

exec
/bin/zsh -lc "sed -n '1,220p' src/telegram/bot.ts" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
/**
 * Telegram bot — long-polling client for akashik.
 *
 * Single-user, runs inside the daemon process. Handles:
 *   - Inbound URLs → auto-ingest into best-matching room
 *   - Inbound text → save as note or route as command
 *   - Outbound digests → daily summary after daemon tick
 *   - Commands → ask, report, trigger, status, rooms
 */

import TelegramBot from 'node-telegram-bot-api';
import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import type { GraphError } from '../domain/errors.js';
import { GraphError as GE } from '../domain/errors.js';
import { handleCapture } from './capture.js';
import { handleCommand } from './commands.js';
import type { Runtime } from '../cli/runtime.js';

export interface TelegramConfig {
  readonly bot_token: string;
  readonly chat_id: string;
  readonly enabled: boolean;
}

export const loadTelegramConfig = (raw: Record<string, unknown>): TelegramConfig | null => {
  const tg = (raw.telegram ?? {}) as Record<string, unknown>;
  const token = typeof tg.bot_token === 'string' ? tg.bot_token : process.env.TELEGRAM_BOT_TOKEN;
  const chatId = typeof tg.chat_id === 'string' ? tg.chat_id : process.env.TELEGRAM_CHAT_ID;
  const enabled = tg.enabled !== false;
  if (!token || !chatId) return null;
  return { bot_token: token, chat_id: chatId, enabled };
};

export interface AkashikBot {
  readonly sendMessage: (text: string) => ResultAsync<void, GraphError>;
  readonly sendDigest: (markdown: string) => ResultAsync<void, GraphError>;
  readonly stop: () => void;
}

const URL_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

export const startBot = (
  config: TelegramConfig,
  runtime: Runtime,
): ResultAsync<AkashikBot, GraphError> => {
  if (!config.enabled || !config.bot_token) {
    return errAsync(GE.readError('telegram', 'bot not configured — run akashik telegram setup'));
  }

  try {
    const bot = new TelegramBot(config.bot_token, { polling: true });
    const allowedChat = config.chat_id;

    // Message handler
    bot.on('message', async (msg) => {
      if (String(msg.chat.id) !== allowedChat) return; // single-user whitelist
      const text = msg.text ?? '';

      // Check for URLs — inbound capture
      const urls = text.match(URL_RE);
      if (urls && urls.length > 0) {
        const reply = await handleCapture(runtime, urls, text);
        await bot.sendMessage(msg.chat.id, reply, { parse_mode: 'Markdown' });
        return;
      }

      // No URL — treat as command or note
      const result = await handleCommand(runtime, text);
      await bot.sendMessage(msg.chat.id, result, { parse_mode: 'Markdown' });
    });

    const sendMessage = (text: string): ResultAsync<void, GraphError> =>
      ResultAsync.fromPromise(
        bot.sendMessage(allowedChat, text, { parse_mode: 'Markdown' }).then(() => undefined),
        (e) => GE.writeError('telegram', (e as Error).message),
      );

    const sendDigest = (markdown: string): ResultAsync<void, GraphError> => {
      // Telegram has 4096 char limit — truncate if needed
      const truncated = markdown.length > 4000
        ? markdown.slice(0, 3997) + '...'
        : markdown;
      return sendMessage(truncated);
    };

    const stop = (): void => {
      bot.stopPolling();
    };

    return okAsync({ sendMessage, sendDigest, stop });
  } catch (e) {
    return errAsync(GE.readError('telegram', (e as Error).message));
  }
};

exec
/bin/zsh -lc "sed -n '1,220p' tests/bench-longmemeval-synth.test.ts" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
/**
 * Benchmark — synthetic LongMemEval-style conversational long-term recall.
 *
 * Mirrors the LongMemEval-S task structure (arxiv 2410.10813, ICLR 2025)
 * without requiring a 3 GB HuggingFace download. The synthetic fixture
 * exercises the same five abilities the original benchmark targets:
 *
 *   1. Information extraction  — single-fact recall across N sessions
 *   2. Multi-session reasoning — bridge facts across 2+ evidence sessions
 *   3. Temporal reasoning      — "earliest", "latest", "before X"
 *   4. Knowledge updates       — a fact gets contradicted by a later session
 *   5. Abstention              — answer must be "I don't know"; relevant
 *                                evidence does NOT exist in the haystack
 *
 * For each question we pre-define the ground-truth evidence session(s).
 * Each session is one node in the graph (label + summary). We run our
 * hybrid retrieval (`searchByRoom`), map top-k matches back to session
 * ids, and score Recall@5 against the ground truth.
 *
 * Acceptance: aggregate Recall@5 ≥ 0.60. The bar is set below
 * agentmemory's 95% claim on the public benchmark because (a) we use
 * a tougher synthetic haystack with no oracle pruning, (b) we score
 * retrieval-only without an LLM judge, and (c) our deterministic
 * fixture-embedder produces less calibrated similarity than ONNX.
 *
 * In the public-benchmark phase (Phase 23.5) we'll re-run this as
 * `bench-longmemeval-real.test.ts` against the actual HF dataset
 * with the same scorer.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { appendFileSync as _appendFileSync } from 'node:fs';
const appendBenchReport = (path: string, data: string): void => _appendFileSync(path, data);
import { fileGraphRepository } from '../src/infrastructure/graph-repository.js';
import { openSqliteVectorIndex } from '../src/infrastructure/vector-index.js';
import { fixtureEmbedder } from '../src/infrastructure/embedders.js';
import { indexNode, searchByRoom } from '../src/application/use-cases.js';
import { recallAtK, reciprocalRank } from '../src/domain/eval-metrics.js';
import type { BenchSuiteReport } from '../src/domain/bench-types.js';
import type { Room } from '../src/domain/graph.js';

const ROOM = 'sessions' as Room;
const DIM = 384;

// ─────────────── synthetic fixture ─────────────

interface SyntheticSession {
  readonly id: string;
  readonly summary: string;
}

interface SyntheticQuery {
  readonly id: string;
  readonly type:
    | 'information-extraction'
    | 'multi-session-reasoning'
    | 'temporal-reasoning'
    | 'knowledge-update'
    | 'abstention';
  readonly query: string;
  /** Ground-truth evidence session ids. Empty for abstention questions. */
  readonly relevant: readonly string[];
}

const SESSIONS: readonly SyntheticSession[] = [
  // Sessions 0–9: car purchase + maintenance timeline
  { id: 'session://2026-04-01-car-purchase',     summary: 'I bought a blue Tesla Model 3 from the Mountain View dealership on April 1st 2026. The salesperson was Maria.' },
  { id: 'session://2026-04-10-first-service',    summary: 'Took the Tesla in for its first service appointment on April 10th. Software update applied, no issues found.' },
  { id: 'session://2026-04-15-gps-glitch',       summary: 'GPS navigation in the Tesla started showing wrong street names after the recent software update. First noticed today April 15th.' },
  { id: 'session://2026-04-20-gps-fixed',        summary: 'Tesla service patched the GPS issue with software update 2026.4.2 on April 20th. Working correctly now.' },
  { id: 'session://2026-05-01-tire-rotation',    summary: 'Routine tire rotation done at the Mountain View service center on May 1st. Cost was 120 dollars.' },
  // Sessions 5–9: home renovation
  { id: 'session://2026-03-15-kitchen-quote',    summary: 'Got a quote of 28000 dollars from Pacific Renovations for the kitchen remodel on March 15th.' },
  { id: 'session://2026-03-20-quote-comparison', summary: 'Second quote from Bay Area Builders came in at 31000 dollars for the same kitchen scope, slightly higher than Pacific Renovations.' },
  { id: 'session://2026-04-05-contractor-chosen',summary: 'Decided to go with Pacific Renovations for the kitchen remodel based on better pricing. Signed the contract April 5th.' },
  { id: 'session://2026-05-10-demo-started',     summary: 'Kitchen demolition started May 10th. Cabinets and old appliances out. Took two days.' },
  // Sessions 9–14: pet care
  { id: 'session://2026-02-01-adoption',         summary: 'Adopted a Border Collie puppy named Luna from the local rescue on February 1st 2026.' },
  { id: 'session://2026-02-15-first-vet',        summary: 'First vet visit for Luna on February 15th. Vaccinations up to date. Vet recommended a probiotic supplement.' },
  { id: 'session://2026-03-10-luna-trained',     summary: 'Luna completed her basic obedience class. She now sits, stays, and recalls reliably.' },
  // Sessions 12–15: work/career
  { id: 'session://2026-01-15-job-offer',        summary: 'Got a job offer from Acme Corp for the senior engineer role on January 15th. Compensation package is competitive.' },
  { id: 'session://2026-01-20-accepted-job',     summary: 'Accepted the Acme Corp offer on January 20th. Start date is February 5th.' },
  { id: 'session://2026-02-05-first-day',        summary: 'First day at Acme Corp on February 5th. Met the team, set up the laptop, attended onboarding sessions.' },
  // Sessions 15–19: distractors / noise
  { id: 'session://2025-12-20-holiday-trip',     summary: 'Took a holiday trip to Hawaii from December 20th to 27th. Beautiful weather, snorkeling at Hanauma Bay.' },
  { id: 'session://2026-01-05-new-year-resolutions', summary: 'Wrote down new year resolutions: read 24 books, run a half marathon, learn Spanish.' },
  { id: 'session://2026-02-28-flu-recovery',     summary: 'Recovered from a week-long flu by February 28th. Lost five pounds. Back to normal energy now.' },
  { id: 'session://2026-04-25-bike-purchase',    summary: 'Bought a road bike from a local shop on April 25th. Black carbon frame, ten gears.' },
  { id: 'session://2026-05-05-bike-first-ride',  summary: 'Took the new road bike on its first long ride along the bay trail on May 5th. 35 mile loop.' },
];

const QUERIES: readonly SyntheticQuery[] = [
  // Information extraction (5)
  {
    id: 'ie-1',
    type: 'information-extraction',
    query: 'Who was the Tesla salesperson at the Mountain View dealership',
    relevant: ['session://2026-04-01-car-purchase'],
  },
  {
    id: 'ie-2',
    type: 'information-extraction',
    query: 'What kitchen remodel quote did Pacific Renovations give',
    relevant: ['session://2026-03-15-kitchen-quote'],
  },
  {
    id: 'ie-3',
    type: 'information-extraction',
    query: 'What is the name of the Border Collie puppy adopted from the rescue',
    relevant: ['session://2026-02-01-adoption'],
  },
  {
    id: 'ie-4',
    type: 'information-extraction',
    query: 'When did the new role at Acme Corp start',
    relevant: ['session://2026-01-20-accepted-job', 'session://2026-02-05-first-day'],
  },
  {
    id: 'ie-5',
    type: 'information-extraction',
    query: 'What did the vet recommend for Luna at her first visit',
    relevant: ['session://2026-02-15-first-vet'],
  },

  // Multi-session reasoning (5)
  {
    id: 'msr-1',
    type: 'multi-session-reasoning',
    query: 'Which contractor was hired for the kitchen remodel and what was the final price',
    relevant: ['session://2026-03-15-kitchen-quote', 'session://2026-04-05-contractor-chosen'],
  },
  {
    id: 'msr-2',
    type: 'multi-session-reasoning',
    query: 'When was the GPS issue first noticed in the Tesla and when was it fixed',
    relevant: ['session://2026-04-15-gps-glitch', 'session://2026-04-20-gps-fixed'],
  },
  {
    id: 'msr-3',
    type: 'multi-session-reasoning',
    query: 'How long between adopting Luna and finishing her obedience training',
    relevant: ['session://2026-02-01-adoption', 'session://2026-03-10-luna-trained'],
  },
  {
    id: 'msr-4',
    type: 'multi-session-reasoning',
    query: 'How long between receiving the Acme Corp offer and the first day at work',
    relevant: ['session://2026-01-15-job-offer', 'session://2026-02-05-first-day'],
  },
  {
    id: 'msr-5',
    type: 'multi-session-reasoning',
    query: 'Which kitchen quote was higher Pacific Renovations or Bay Area Builders',
    relevant: ['session://2026-03-15-kitchen-quote', 'session://2026-03-20-quote-comparison'],
  },

  // Temporal reasoning (4)
  {
    id: 'tr-1',
    type: 'temporal-reasoning',
    query: 'What was the earliest event in 2026 the bike purchase the kitchen demo or the GPS glitch',
    relevant: ['session://2026-04-15-gps-glitch'],
  },
  {
    id: 'tr-2',
    type: 'temporal-reasoning',
    query: 'What happened just before the kitchen demolition started in May',
    relevant: ['session://2026-04-05-contractor-chosen', 'session://2026-05-10-demo-started'],
  },
  {
    id: 'tr-3',
    type: 'temporal-reasoning',
    query: 'When was the most recent service appointment for the Tesla',
    relevant: ['session://2026-05-01-tire-rotation'],
  },
  {
    id: 'tr-4',
    type: 'temporal-reasoning',
    query: 'What event happened in late January 2026 related to a new job',
    relevant: ['session://2026-01-15-job-offer', 'session://2026-01-20-accepted-job'],
  },

  // Knowledge update (3)
  {
    id: 'ku-1',
    type: 'knowledge-update',
    query: 'Is the GPS in the Tesla currently working',
    relevant: ['session://2026-04-20-gps-fixed'],
  },
  {
    id: 'ku-2',
    type: 'knowledge-update',
    query: 'Has Luna completed her obedience training',
    relevant: ['session://2026-03-10-luna-trained'],
  },
  {
    id: 'ku-3',
    type: 'knowledge-update',
    query: 'Has the kitchen demolition phase finished',
    relevant: ['session://2026-05-10-demo-started'],
  },

  // Abstention (3) — answer does NOT exist in haystack
  {
    id: 'ab-1',
    type: 'abstention',
    query: 'What was the dealer plate number on the Tesla at delivery',
    relevant: [],
  },
  {
    id: 'ab-2',
    type: 'abstention',
    query: 'How much did the Hawaii hotel cost per night during the December trip',
    relevant: [],
  },

exec
/bin/zsh -lc "sed -n '1,220p' tests/bench-locomo-synth.test.ts" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
/**
 * Benchmark — synthetic LoCoMo-style factual-recall (Phase 23.6).
 *
 * Mirrors the LoCoMo task structure (arxiv 2402.17753, EMNLP 2024)
 * without requiring the full snap-research/locomo dataset. The
 * synthetic fixture exercises the same axes the original benchmark
 * targets:
 *
 *   1. Long horizon — sessions span 6 simulated months
 *   2. Factual recall — answer is a discrete fact (name, number,
 *      date, place) extractable from one or two sessions
 *   3. Temporal/causal reasoning — "before X happened", "first time
 *      Y was mentioned", "what came after Z"
 *   4. Persona stability — 4 distinct personas with consistent
 *      attributes across the timeline
 *
 * Scoring (Phase 23.6.1 — fix for the length-mismatch precision bug):
 *
 * Two pure-compute signals combined, each in [0, 1]:
 *
 *   1. `evidenceRecall`        — fraction of declared ground-truth
 *      evidence sessions present in top-3 retrieved. Measures "did
 *      we find the right session(s)?"
 *
 *   2. `answerTokenContainment` — of the gold answer's KEY tokens
 *      (length > 2, stopword-filtered), what fraction appear anywhere
 *      in the top-3 retrieved evidence summaries? Measures "would a
 *      downstream extractor have the raw material to produce the
 *      answer?"
 *
 * Token-F1 over the FULL summary text vs short gold answer was
 * dropped because it's mathematically pinned tiny (long summary +
 * short gold = bad precision no matter how good retrieval is). That
 * mismatch is exactly why real LoCoMo / LongMemEval / SQuAD require
 * an LLM judge or a span extractor — they're measuring something
 * different.
 *
 * Composite dimension = harmonic mean of the two signals. Both must
 * be high for the bench to score well — finding the right session
 * but missing the answer tokens (or vice versa) drags the harmonic
 * mean down sharply.
 *
 * Opt-in LLM extractor (Phase 23.7+):
 *   set `AKASHIK_BENCH_LLM_EXTRACTOR=1` to swap the
 *   containment metric for a real Ollama Phi-4-mini extracted
 *   answer scored via SQuAD-style F1. Not wired in this turn —
 *   the scaffolding is documented in the suite registry.
 *
 * Acceptance: locomoFactualF1 ≥ 0.65 (harmonic mean threshold). The
 * number is set below mem0's 92.5 composite (mem0 uses a full
 * LoCoMo eval with LLM judge) because we're retrieval-only.
 */

import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileGraphRepository } from '../src/infrastructure/graph-repository.js';
import { openSqliteVectorIndex } from '../src/infrastructure/vector-index.js';
import { fixtureEmbedder } from '../src/infrastructure/embedders.js';
import { indexNode, searchByRoom } from '../src/application/use-cases.js';
import type { BenchSuiteReport } from '../src/domain/bench-types.js';
import type { Room } from '../src/domain/graph.js';

const ROOM = 'locomo' as Room;
const DIM = 384;

// ─────────────── synthetic 4-persona × 6-month corpus ─────────────

interface Session {
  readonly id: string;
  readonly persona: 'Alice' | 'Bob' | 'Cara' | 'Dan';
  readonly day: number;       // days since corpus start
  readonly summary: string;
}

const PERSONAS = ['Alice', 'Bob', 'Cara', 'Dan'] as const;

/**
 * 40 sessions, ~10 per persona, spread across 180 days.
 * Each session is one node in the graph (label + summary). Summaries
 * are detailed enough to support factual retrieval and to differ
 * across persona+topic combos.
 */
const SESSIONS: readonly Session[] = [
  // ─── Alice — Berlin marathon training ─────────────
  { id: 'alice-d3',   persona: 'Alice', day: 3,   summary: 'Alice signed up for the Berlin marathon on day 3. Race date set for September 28. Training plan starts tomorrow with three short runs per week.' },
  { id: 'alice-d12',  persona: 'Alice', day: 12,  summary: 'Alice finished her first 5K training run in 28 minutes. Reports feeling good but notes mild knee soreness after the run.' },
  { id: 'alice-d40',  persona: 'Alice', day: 40,  summary: 'Alice bought her first proper running shoes — Asics Nimbus 25. Cost was 165 euros at the Friedrichshain store.' },
  { id: 'alice-d65',  persona: 'Alice', day: 65,  summary: 'Alice ran her first 10K on day 65, finishing in 58 minutes 12 seconds. Sunday morning run along the Spree river path.' },
  { id: 'alice-d90',  persona: 'Alice', day: 90,  summary: 'Alice completed a half marathon training run on day 90. Time 2 hours 8 minutes 34 seconds. New personal best for the distance.' },
  { id: 'alice-d115', persona: 'Alice', day: 115, summary: 'Alice strained her left calf during a 15K training run on day 115. Took two weeks rest as advised by the physiotherapist.' },
  { id: 'alice-d150', persona: 'Alice', day: 150, summary: 'Alice completed a 28K training run on day 150. Time was 2 hours 55 minutes. Final long run before the Berlin marathon taper.' },
  { id: 'alice-d175', persona: 'Alice', day: 175, summary: 'Alice ran the Berlin marathon on day 175 in 4 hours 12 minutes 47 seconds. Finished in mid-pack but completed her first full marathon.' },

  // ─── Bob — apartment hunt in Prague ─────────────
  { id: 'bob-d5',   persona: 'Bob', day: 5,   summary: 'Bob started apartment hunting in Prague on day 5. Budget set at 25000 CZK per month. Looking for a one-bedroom in Vinohrady.' },
  { id: 'bob-d18',  persona: 'Bob', day: 18,  summary: 'Bob viewed a flat on Korunni street on day 18. Asking 26000 CZK, slightly over budget. Old building with high ceilings, no elevator.' },
  { id: 'bob-d35',  persona: 'Bob', day: 35,  summary: 'Bob put in an offer on a one-bedroom in Karlin on day 35. Price 27500 CZK monthly with a six-month deposit. Decision expected within a week.' },
  { id: 'bob-d45',  persona: 'Bob', day: 45,  summary: 'Bob signed the lease on the Karlin flat on day 45. Move-in date is day 60. Cost was 27500 CZK monthly plus 165000 CZK deposit.' },
  { id: 'bob-d60',  persona: 'Bob', day: 60,  summary: 'Bob moved into the Karlin flat on day 60. Movers cost was 4500 CZK. Wifi installed the same evening, comcast equivalent for the Czech market.' },
  { id: 'bob-d80',  persona: 'Bob', day: 80,  summary: 'Bob furnished the flat over week 11. Total spend on Ikea furniture was 38000 CZK. Reports the new sofa is exceptionally comfortable.' },
  { id: 'bob-d120', persona: 'Bob', day: 120, summary: 'Bob hosted his first dinner party in the Karlin flat on day 120. Eight guests, cooked Vietnamese pho. Reports the gathering went well.' },
  { id: 'bob-d165', persona: 'Bob', day: 165, summary: 'Bob received the first annual rent increase notice on day 165. New rent will be 28800 CZK starting next quarter. Letter dated last Tuesday.' },

  // ─── Cara — PhD thesis on knowledge graphs ─────────────
  { id: 'cara-d2',   persona: 'Cara', day: 2,   summary: 'Cara defended her PhD thesis proposal on knowledge graph retrieval at ETH Zurich on day 2. Committee approved with minor revisions due in two months.' },
  { id: 'cara-d25',  persona: 'Cara', day: 25,  summary: 'Cara submitted revised thesis proposal on day 25. Added a chapter on temporal graph embeddings per committee feedback. Advisor is Professor Mendelsohn.' },
  { id: 'cara-d55',  persona: 'Cara', day: 55,  summary: 'Cara presented her first PhD paper at the ICDM workshop on day 55. Paper title: temporal-aware reranking for knowledge graph retrieval. Got positive feedback.' },
  { id: 'cara-d85',  persona: 'Cara', day: 85,  summary: 'Cara got her first paper accepted to EMNLP main conference on day 85. Reviewer scores 4-4-5. Camera-ready due in two weeks.' },
  { id: 'cara-d110', persona: 'Cara', day: 110, summary: 'Cara attended EMNLP in Singapore on day 110. Presented the temporal-aware reranking paper as a poster. Met three potential PhD collaborators.' },
  { id: 'cara-d135', persona: 'Cara', day: 135, summary: 'Cara started a 3-month research internship at Google DeepMind on day 135. Topic is multi-hop graph retrieval at scale. Manager is Dr. Chen.' },
  { id: 'cara-d170', persona: 'Cara', day: 170, summary: 'Cara completed her DeepMind internship on day 170. Final report shipped to her advisor. Extended a research collaboration with the host team for another quarter.' },

  // ─── Dan — restaurant venture in Vienna ─────────────
  { id: 'dan-d8',   persona: 'Dan', day: 8,   summary: 'Dan started planning a Vietnamese restaurant in Vienna on day 8. Initial business plan budget is 180000 euros. Location TBD in the seventh district.' },
  { id: 'dan-d22',  persona: 'Dan', day: 22,  summary: 'Dan signed a 5-year commercial lease on Neubaugasse 14 on day 22. Rent is 4200 euros monthly. Space is 85 square meters with existing kitchen plumbing.' },
  { id: 'dan-d50',  persona: 'Dan', day: 50,  summary: 'Dan hired his first cook on day 50. Name is Linh, ex-sous chef from Anan Saigon in Vietnam. Salary is 38000 euros gross annual plus tip share.' },
  { id: 'dan-d75',  persona: 'Dan', day: 75,  summary: 'Dan completed the kitchen renovation on day 75. Total cost was 62000 euros. Two extra weeks over plan due to ventilation hood permits.' },
  { id: 'dan-d100', persona: 'Dan', day: 100, summary: 'Dan opened the restaurant on day 100. Soft launch evening served 32 covers. Reports the pho beef bowl was the most ordered dish that night.' },
  { id: 'dan-d130', persona: 'Dan', day: 130, summary: 'Dan got the first Falter newspaper review on day 130. Two and a half stars out of five. Critic praised the bao buns but flagged inconsistent service timing.' },
  { id: 'dan-d160', persona: 'Dan', day: 160, summary: 'Dan reported the restaurant broke even on day 160. Monthly revenue averaged 58000 euros over the prior eight weeks. Operations now sustainable.' },

  // ─── distractors / cross-persona noise ─────────────
  { id: 'distract-d20',  persona: 'Alice', day: 20,  summary: 'Alice visited the Berlin Christmas markets on day 20. Bought a hand-knitted scarf and a stollen. Reports the gluhwein was excellent.' },
  { id: 'distract-d70',  persona: 'Bob',   day: 70,  summary: 'Bob attended the Prague jazz festival on day 70. Saw three concerts over the weekend. Festival pass cost was 1800 CZK.' },
  { id: 'distract-d95',  persona: 'Cara',  day: 95,  summary: 'Cara published a personal blog post on day 95 about graph algorithms for beginners. Post went moderately viral with 8000 views in two days.' },
  { id: 'distract-d125', persona: 'Dan',   day: 125, summary: 'Dan attended a sommelier course in Vienna on day 125. Got the WSET level 2 certificate. Course was three weekends and cost 2300 euros.' },
];

// ─────────────── 30 factual-recall queries with gold answers ─────────────

interface LocomoQuery {
  readonly id: string;
  readonly persona: string;
  readonly query: string;
  /** Gold-standard answer string. F1 computed against retrieved-evidence tokens. */
  readonly goldAnswer: string;
  /** Evidence session ids — used as a sanity check. */
  readonly evidence: readonly string[];
}

const QUERIES: readonly LocomoQuery[] = [
  // ─── Alice — marathon ─────────────
  { id: 'lq-a1', persona: 'Alice', query: 'What marathon did Alice sign up for and when was the race scheduled',
    goldAnswer: 'Berlin marathon September 28', evidence: ['alice-d3'] },
  { id: 'lq-a2', persona: 'Alice', query: 'What was Alice first 5K training run time',
    goldAnswer: '28 minutes', evidence: ['alice-d12'] },
  { id: 'lq-a3', persona: 'Alice', query: 'What model of running shoes did Alice buy and what did they cost',
    goldAnswer: 'Asics Nimbus 25 165 euros', evidence: ['alice-d40'] },
  { id: 'lq-a4', persona: 'Alice', query: 'What was Alice first 10K time',
    goldAnswer: '58 minutes 12 seconds', evidence: ['alice-d65'] },
  { id: 'lq-a5', persona: 'Alice', query: 'What was Alice final marathon finishing time',
    goldAnswer: '4 hours 12 minutes 47 seconds', evidence: ['alice-d175'] },
  { id: 'lq-a6', persona: 'Alice', query: 'What injury did Alice have during training and how long did she rest',
    goldAnswer: 'left calf strain two weeks rest', evidence: ['alice-d115'] },

  // ─── Bob — apartment ─────────────
  { id: 'lq-b1', persona: 'Bob', query: 'What budget did Bob set for his Prague apartment hunt',
    goldAnswer: '25000 CZK per month', evidence: ['bob-d5'] },
  { id: 'lq-b2', persona: 'Bob', query: 'Which neighborhood did Bob initially want to live in',
    goldAnswer: 'Vinohrady', evidence: ['bob-d5'] },
  { id: 'lq-b3', persona: 'Bob', query: 'Which Prague apartment did Bob ultimately sign for and at what rent',
    goldAnswer: 'Karlin one bedroom 27500 CZK monthly', evidence: ['bob-d45'] },
  { id: 'lq-b4', persona: 'Bob', query: 'What was Bob deposit on the new flat',
    goldAnswer: '165000 CZK', evidence: ['bob-d45'] },
  { id: 'lq-b5', persona: 'Bob', query: 'How much did Bob spend on Ikea furniture',
    goldAnswer: '38000 CZK', evidence: ['bob-d80'] },
  { id: 'lq-b6', persona: 'Bob', query: 'What was Bob new rent after the annual increase',
    goldAnswer: '28800 CZK', evidence: ['bob-d165'] },

  // ─── Cara — PhD ─────────────
  { id: 'lq-c1', persona: 'Cara', query: 'Where is Cara doing her PhD and on what topic',
    goldAnswer: 'ETH Zurich knowledge graph retrieval', evidence: ['cara-d2'] },
  { id: 'lq-c2', persona: 'Cara', query: 'Who is Cara PhD advisor',
    goldAnswer: 'Professor Mendelsohn', evidence: ['cara-d25'] },
  { id: 'lq-c3', persona: 'Cara', query: 'What was the title of Cara first PhD paper',
    goldAnswer: 'temporal-aware reranking for knowledge graph retrieval', evidence: ['cara-d55'] },
  { id: 'lq-c4', persona: 'Cara', query: 'At which conference was Cara first paper accepted',
    goldAnswer: 'EMNLP main conference', evidence: ['cara-d85'] },
  { id: 'lq-c5', persona: 'Cara', query: 'Where did Cara do her research internship and who managed her',
    goldAnswer: 'Google DeepMind Dr Chen', evidence: ['cara-d135'] },
  { id: 'lq-c6', persona: 'Cara', query: 'In what city did Cara attend EMNLP',
    goldAnswer: 'Singapore', evidence: ['cara-d110'] },

  // ─── Dan — restaurant ─────────────
  { id: 'lq-d1', persona: 'Dan', query: 'Where is Dan opening his restaurant',
    goldAnswer: 'Vienna Neubaugasse 14 seventh district', evidence: ['dan-d8', 'dan-d22'] },
  { id: 'lq-d2', persona: 'Dan', query: 'What is the monthly rent on Dan restaurant space',
    goldAnswer: '4200 euros monthly', evidence: ['dan-d22'] },
  { id: 'lq-d3', persona: 'Dan', query: 'Who did Dan hire as his first cook and from where',
    goldAnswer: 'Linh ex-sous chef from Anan Saigon Vietnam', evidence: ['dan-d50'] },
  { id: 'lq-d4', persona: 'Dan', query: 'How much did the kitchen renovation cost',
    goldAnswer: '62000 euros', evidence: ['dan-d75'] },
  { id: 'lq-d5', persona: 'Dan', query: 'What was the Falter newspaper review rating',
    goldAnswer: 'two and a half stars out of five', evidence: ['dan-d130'] },
  { id: 'lq-d6', persona: 'Dan', query: 'When did Dan restaurant break even and at what monthly revenue',
    goldAnswer: 'day 160 58000 euros monthly', evidence: ['dan-d160'] },

  // ─── temporal / causal reasoning ─────────────
  { id: 'lq-t1', persona: 'Alice', query: 'Did Alice get injured before or after running her first 10K',
    goldAnswer: 'after first 10K injury at day 115 10K at day 65', evidence: ['alice-d65', 'alice-d115'] },
  { id: 'lq-t2', persona: 'Bob',   query: 'Was Bob hosting his first dinner party before or after the rent increase',
    goldAnswer: 'before rent increase party day 120 increase day 165', evidence: ['bob-d120', 'bob-d165'] },
  { id: 'lq-t3', persona: 'Cara',  query: 'Did Cara start her DeepMind internship before or after EMNLP',
    goldAnswer: 'after EMNLP internship day 135 EMNLP day 110', evidence: ['cara-d110', 'cara-d135'] },
  { id: 'lq-t4', persona: 'Dan',   query: 'How many days between the soft launch and the Falter review',
    goldAnswer: '30 days launch day 100 review day 130', evidence: ['dan-d100', 'dan-d130'] },

  // ─── persona stability — does the retriever stay with the right persona ─────────────
  { id: 'lq-p1', persona: 'Alice', query: 'Did Alice ever go to a Christmas market and what did she buy',
    goldAnswer: 'Berlin Christmas markets hand-knitted scarf and stollen gluhwein', evidence: ['distract-d20'] },
  { id: 'lq-p2', persona: 'Dan',   query: 'What sommelier course did Dan complete',
    goldAnswer: 'WSET level 2 in Vienna 2300 euros three weekends', evidence: ['distract-d125'] },
];

// ─────────────── seeded topic-vector embedder ─────────────

/**

exec
/bin/zsh -lc "sed -n '1,220p' tests/phase39.oracle-gossip-e2e.test.ts" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
/**
 * Phase 39 — oracle gossip E2E (Layer B of peer discovery).
 *
 * Two real libp2p nodes on ephemeral ports. Alice publishes a question
 * over pubsub; Bob subscribes; Bob's graph repo receives and upserts
 * the validated question. Same trust-boundary semantics as the phase35
 * touch E2E — validator + secret-gate still gate everything on Bob's
 * side.
 *
 * What this pins:
 *
 *   G1  publish→subscribe round-trip: Alice's question arrives at Bob's
 *       graph without either peer doing an explicit touch/dial handshake
 *       first (pubsub auto-activates on connection).
 *   G2  bad wire format is rejected and observable via onRejected,
 *       not thrown into the libp2p event loop (so one bad publisher
 *       can't crash the subscriber's pubsub service).
 *   G3  size cap rejects oversized messages before parse / validation.
 */

import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Libp2p } from '@libp2p/interface';

import { loadOrCreateIdentity, createNode } from '../src/infrastructure/peer-transport.js';
import { fileGraphRepository } from '../src/infrastructure/graph-repository.js';
import {
  publishQuestion,
  subscribeOracle,
  ORACLE_TOPIC,
  type SubscribeHandle,
} from '../src/infrastructure/oracle-gossip.js';
import { nodeFromQuestion } from '../src/domain/oracle.js';

describe('Phase 39 — oracle gossip E2E (two real pubsub peers)', () => {
  let aliceHome = '';
  let bobHome = '';
  let aliceNode: Libp2p | undefined;
  let bobNode: Libp2p | undefined;
  let bobSub: SubscribeHandle | undefined;
  let alicePeerIdStr = '';
  // Observers capture Bob's accept/reject events so assertions can
  // wait until the message actually lands.
  const accepted: Array<{ kind: string; id: string }> = [];
  const rejected: string[] = [];

  before(async () => {
    aliceHome = mkdtempSync(join(tmpdir(), 'wi-p39-alice-'));
    bobHome = mkdtempSync(join(tmpdir(), 'wi-p39-bob-'));
    // Seed empty graphs so the repos can load/save cleanly.
    const emptyGraph = { directed: false, multigraph: false, graph: { hyperedges: [] }, nodes: [], links: [] };
    writeFileSync(join(aliceHome, 'graph.json'), JSON.stringify(emptyGraph));
    writeFileSync(join(bobHome,   'graph.json'), JSON.stringify(emptyGraph));

    const [aliceIdR, bobIdR] = await Promise.all([
      loadOrCreateIdentity(join(aliceHome, 'peer-identity.json')),
      loadOrCreateIdentity(join(bobHome,   'peer-identity.json')),
    ]);
    if (aliceIdR.isErr()) throw aliceIdR.error;
    if (bobIdR.isErr())   throw bobIdR.error;

    const [aliceNodeR, bobNodeR] = await Promise.all([
      createNode(aliceIdR.value, { listenPort: 0, listenHost: '127.0.0.1', upnp: false }),
      createNode(bobIdR.value,   { listenPort: 0, listenHost: '127.0.0.1', upnp: false }),
    ]);
    if (aliceNodeR.isErr()) throw aliceNodeR.error;
    if (bobNodeR.isErr())   throw bobNodeR.error;
    aliceNode = aliceNodeR.value;
    bobNode   = bobNodeR.value;
    alicePeerIdStr = aliceIdR.value.peerId;

    // Bob subscribes before Alice publishes; caller's graph repo picks
    // up inbound nodes. onAccepted + onRejected drive the assertion
    // barrier — tests poll `accepted` / `rejected` instead of relying
    // on timing.
    const repo = fileGraphRepository(join(bobHome, 'graph.json'));
    const sub = await subscribeOracle(bobNode, {
      graphRepo: repo,
      onAccepted: (msg) => {
        accepted.push({ kind: msg.kind, id: msg.node.id });
      },
      onRejected: (reason) => {
        rejected.push(reason);
      },
    });
    if (sub.isErr()) throw sub.error;
    bobSub = sub.value;
    // Alice also subscribes so floodsub announces Alice as a subscriber
    // of the topic to Bob — in floodsub, a peer only forwards to peers
    // it has seen subscribed. Without this, Bob's subscription isn't
    // visible to Alice and the message wouldn't be forwarded.
    const aliceSvc = (aliceNode.services as Record<string, unknown>).pubsub as {
      subscribe: (t: string) => void;
    };
    aliceSvc.subscribe(ORACLE_TOPIC);

    // Dial Alice → Bob so they share a live connection before publish.
    const aliceAddrs = aliceNode.getMultiaddrs();
    assert.ok(aliceAddrs.length > 0);
    await bobNode.dial(aliceAddrs[0]);
    // Give floodsub one tick to exchange subscription announcements.
    await new Promise<void>((r) => setTimeout(r, 150));
  });

  after(async () => {
    bobSub?.unsubscribe();
    await Promise.allSettled([aliceNode?.stop(), bobNode?.stop()]);
    if (aliceHome) rmSync(aliceHome, { recursive: true, force: true });
    if (bobHome)   rmSync(bobHome,   { recursive: true, force: true });
  });

  test('G1: Alice publishes a question, Bob receives and upserts it via pubsub', async () => {
    assert.ok(aliceNode && bobNode && bobSub);
    accepted.length = 0;
    rejected.length = 0;

    const q = nodeFromQuestion({
      text: 'How fast can rag-on-cpu go with bge-base + hybrid BM25?',
      askedBy: alicePeerIdStr,
      date: new Date('2026-04-17T12:00:00Z'),
    });
    const pub = await publishQuestion(aliceNode!, q);
    assert.ok(pub.isOk(), `publish failed: ${pub.isErr() ? JSON.stringify(pub.error) : ''}`);

    // Wait for Bob's subscribe handler to accept. Polling beats a fixed
    // sleep — avoid timing flakes on CI. 1s budget is generous.
    const deadline = Date.now() + 1500;
    while (accepted.length === 0 && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 25));
    }
    assert.strictEqual(accepted.length, 1, `expected 1 accepted msg, got ${accepted.length} (rejected=${JSON.stringify(rejected)})`);
    assert.strictEqual(accepted[0].kind, 'question');
    assert.strictEqual(accepted[0].id, q.id);
  });

  test('G2: malformed JSON on the topic is rejected, not thrown', async () => {
    assert.ok(aliceNode && bobSub);
    accepted.length = 0;
    rejected.length = 0;

    const alicePubsub = (aliceNode!.services as Record<string, unknown>).pubsub as {
      publish: (t: string, d: Uint8Array) => Promise<unknown>;
    };
    const junk = new TextEncoder().encode('{not valid json[');
    await alicePubsub.publish(ORACLE_TOPIC, junk);

    const deadline = Date.now() + 1000;
    while (rejected.length === 0 && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 25));
    }
    assert.strictEqual(accepted.length, 0, 'malformed input must NOT have been accepted');
    assert.strictEqual(rejected.length, 1, `expected 1 rejection, got ${rejected.length}`);
    assert.match(rejected[0], /json parse/);
  });

  test('G3: oversized payload is rejected before parse', async () => {
    assert.ok(aliceNode);
    accepted.length = 0;
    rejected.length = 0;

    // 65KB — just past the 64KB cap.
    const big = new TextEncoder().encode('x'.repeat(65 * 1024));
    const alicePubsub = (aliceNode!.services as Record<string, unknown>).pubsub as {
      publish: (t: string, d: Uint8Array) => Promise<unknown>;
    };
    await alicePubsub.publish(ORACLE_TOPIC, big);

    const deadline = Date.now() + 1000;
    while (rejected.length === 0 && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 25));
    }
    assert.strictEqual(accepted.length, 0);
    assert.strictEqual(rejected.length, 1, `expected 1 rejection, got ${rejected.length}`);
    assert.match(rejected[0], /exceeds cap/);
  });
});

exec
/bin/zsh -lc 'rg -n "telegram|oracle|onboard|claude-install|personal memory|agent-memory" README.md docs src tests | head -n 200' in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
tests/phase17.mcp-tool.test.ts:79:  it('C2: server.ts registers exactly 21 tools (14 Phase-17 + code_graph_query Phase-19 + recent_sessions Phase-20 + 5 oracle tools Phase-38)', () => {
tests/phase17.mcp-tool.test.ts:86:      `expected 21 tools in Phase 38 (14 Phase-17 + code_graph_query + recent_sessions + oracle_ask + oracle_answer + list_open_questions + oracle_answers + oracle_answerable), found ${matches.length}`,
src/domain/federation-sim.ts:180: *      "controlled oracle web corpus" (i.e. the simulator's
src/domain/federation-sim.ts:193:  // "web oracle" (i.e. nobody knows them locally until asked).
src/domain/federation-sim.ts:270:        // 6. web fallback — fetch all gold docs from the oracle
tests/bench-longmemeval-synth.test.ts:22: * a tougher synthetic haystack with no oracle pruning, (b) we score
tests/bench-longmemeval-synth.test.ts:88:  { id: 'session://2026-02-05-first-day',        summary: 'First day at Acme Corp on February 5th. Met the team, set up the laptop, attended onboarding sessions.' },
src/domain/remote-node-validator.ts:121:  // enforced by the oracle domain module.
src/domain/remote-node-validator.ts:122:  'oracle_kind',
tests/bench-longmemeval-real.test.ts:2: * Benchmark — real LongMemEval-S oracle split, Recall@5 (Phase 23.7).
tests/bench-longmemeval-real.test.ts:10: * The oracle split bundles each question with its full haystack of
tests/bench-longmemeval-real.test.ts:17: * Why oracle (not S/M)? Oracle is small enough (~3 GB) to fit on the
tests/bench-longmemeval-real.test.ts:20: * problem (S = 50 sessions/q, M = 500 sessions/q, oracle = ~10
tests/bench-longmemeval-real.test.ts:21: * sessions/q). The S/M splits become a follow-up once the oracle
tests/bench-longmemeval-real.test.ts:31: *         longmemeval_oracle.json    (the oracle split JSON)
tests/bench-longmemeval-real.test.ts:33: *     xiaowu0162/longmemeval longmemeval_oracle.json --local-dir $LONGMEMEVAL_DIR`.
tests/bench-longmemeval-real.test.ts:102:test('bench: real LongMemEval-S oracle Recall@5', { timeout: 24 * 60 * 60 * 1000 }, async (t) => {
tests/bench-longmemeval-real.test.ts:110:  //                       oracle / S / M without copy-renames)
tests/bench-longmemeval-real.test.ts:111:  //   LONGMEMEVAL_DIR   — directory containing `longmemeval_oracle.json`
tests/bench-longmemeval-real.test.ts:112:  //                       (default — oracle is the easiest split and
tests/bench-longmemeval-real.test.ts:120:  const datasetPath = explicitFile ?? join(dir as string, 'longmemeval_oracle.json');
src/domain/oracle.ts:2: * oracle — peer-to-peer Q&A bulletin board.
src/domain/oracle.ts:4: * Questions and answers live as GraphNodes in the `oracle` system room.
src/domain/oracle.ts:10: * The oracle "protocol" is therefore entirely a data shape — no new
src/domain/oracle.ts:17: *     id:           oracle-question:<uuid>
src/domain/oracle.ts:18: *     source_uri:   oracle-question:<uuid>
src/domain/oracle.ts:20: *     room:         'oracle' (physical room = system room name is fine)
src/domain/oracle.ts:23: *     oracle_kind:  'question'
src/domain/oracle.ts:29: *     id:           oracle-answer:<uuid>
src/domain/oracle.ts:30: *     source_uri:   oracle-answer:<uuid>
src/domain/oracle.ts:32: *     room:         'oracle'
src/domain/oracle.ts:35: *     oracle_kind:  'answer'
src/domain/oracle.ts:36: *     question_id:  <oracle-question:xxx> this answer is for
src/domain/oracle.ts:71:const QUESTION_PREFIX = 'oracle-question:';
src/domain/oracle.ts:72:const ANSWER_PREFIX = 'oracle-answer:';
src/domain/oracle.ts:96:    source_file: 'akashik:oracle',
src/domain/oracle.ts:98:    room: 'oracle',
src/domain/oracle.ts:102:    oracle_kind: 'question',
src/domain/oracle.ts:118:    source_file: 'akashik:oracle',
src/domain/oracle.ts:120:    room: 'oracle',
src/domain/oracle.ts:124:    oracle_kind: 'answer',
src/domain/oracle.ts:160:  if (n.oracle_kind !== 'question') return undefined;
src/domain/oracle.ts:175:  if (n.oracle_kind !== 'answer') return undefined;
src/domain/oracle.ts:196:    if (n.oracle_kind !== 'answer') continue;
src/domain/oracle.ts:262:   * `oracle_answer` confidence field.
tests/phase35.p2p-touch-e2e.test.ts:44:import { nodeFromQuestion, nodeFromAnswer, listQuestions, listAnswers } from '../src/domain/oracle.js';
tests/phase35.p2p-touch-e2e.test.ts:227:  test('E5 oracle: Alice posts a question, Bob pulls it via the oracle system room', async () => {
tests/phase35.p2p-touch-e2e.test.ts:242:    // Bob touches the oracle system room — auto-allowed, not in Alice's
tests/phase35.p2p-touch-e2e.test.ts:244:    const r = await openTouchStream(bobNode!, alicePeerId, 'oracle');
tests/phase35.p2p-touch-e2e.test.ts:245:    assert.ok(r.isOk(), `oracle touch failed: ${r.isErr() ? JSON.stringify(r.error) : ''}`);
tests/phase35.p2p-touch-e2e.test.ts:265:    // simulate a later CRDT merge, then have Bob pull 'oracle' again
tests/phase35.p2p-touch-e2e.test.ts:271:    const r2 = await openTouchStream(bobNode!, alicePeerId, 'oracle');
tests/phase35.p2p-touch-e2e.test.ts:276:    assert.ok(q2, 'question must still be in the oracle room');
tests/phase36.system-rooms.test.ts:49:  test('S1: three system rooms registered by name (toolshed, research, oracle)', () => {
tests/phase36.system-rooms.test.ts:53:    assert.ok(SYSTEM_ROOM_NAMES.has('oracle'));
tests/phase36.system-rooms.test.ts:56:    assert.ok(isSystemRoomName('oracle'));
tests/phase36.system-rooms.test.ts:59:    assert.strictEqual(findSystemRoom('oracle')?.name, 'oracle');
src/domain/internal-schemes.ts:31:  'telegram:',
src/domain/internal-schemes.ts:39:  // Oracle bulletin board (system room: oracle)
src/domain/internal-schemes.ts:40:  'oracle-question:',
src/domain/internal-schemes.ts:41:  'oracle-answer:',
tests/phase39.oracle-gossip-e2e.test.ts:2: * Phase 39 — oracle gossip E2E (Layer B of peer discovery).
tests/phase39.oracle-gossip-e2e.test.ts:36:} from '../src/infrastructure/oracle-gossip.js';
tests/phase39.oracle-gossip-e2e.test.ts:37:import { nodeFromQuestion } from '../src/domain/oracle.js';
tests/phase39.oracle-gossip-e2e.test.ts:39:describe('Phase 39 — oracle gossip E2E (two real pubsub peers)', () => {
tests/error-hints.test.ts:90:test('IdentityKeyGenerationError → hint says identity init / onboard', () => {
tests/error-hints.test.ts:94:  assert.match(h!, /identity init|onboard/);
tests/phase38.oracle.test.ts:2: * Phase 38 — oracle bulletin board (domain + wire).
tests/phase38.oracle.test.ts:5: * GraphNodes in the `oracle` system room; propagation is free via
tests/phase38.oracle.test.ts:28:} from '../src/domain/oracle.js';
tests/phase38.oracle.test.ts:32:describe('Phase 38 — oracle domain', () => {
tests/phase38.oracle.test.ts:40:    assert.strictEqual(q.oracle_kind, 'question');
tests/phase38.oracle.test.ts:43:    assert.strictEqual(q.room, 'oracle');
tests/phase38.oracle.test.ts:51:      questionId: 'oracle-question:abc',
tests/phase38.oracle.test.ts:58:    assert.strictEqual(a.oracle_kind, 'answer');
tests/phase38.oracle.test.ts:59:    assert.strictEqual(a.question_id, 'oracle-question:abc');
tests/phase38.oracle.test.ts:72:    // Non-oracle nodes are rejected
tests/phase38.oracle.test.ts:112:  test('O7: questions + answers belong to the oracle system room by scheme', () => {
tests/phase38.oracle.test.ts:122:  test('O8: oracle nodes cross the remote-node validator (trust boundary)', () => {
tests/phase20.sessions.test.ts:536:  it('SESS-07 K1: claude-install HOOK_SCRIPT branches on CLAUDE_HOOK_EVENT env var', () => {
tests/phase20.sessions.test.ts:537:    const src = readFileSync('src/cli/commands/claude-install.ts', 'utf8');
tests/phase20.sessions.test.ts:543:    const src = readFileSync('src/cli/commands/claude-install.ts', 'utf8');
tests/phase20.sessions.test.ts:548:    const src = readFileSync('src/cli/commands/claude-install.ts', 'utf8');
tests/phase20.sessions.test.ts:561:    const src = readFileSync('src/cli/commands/claude-install.ts', 'utf8');
tests/phase20.sessions.test.ts:566:    const src = readFileSync('src/cli/commands/claude-install.ts', 'utf8');
tests/phase20.sessions.test.ts:610:  it('SESS-06 L1: src/mcp/server.ts has the expected registerTool count (21 after Phase 38 oracle tools)', () => {
tests/phase20.sessions.test.ts:613:    // Phase 20 pinned this at 16; Phase 38 added 5 oracle tools
tests/phase20.sessions.test.ts:614:    // (oracle_ask, oracle_answer, list_open_questions, oracle_answers,
tests/phase20.sessions.test.ts:615:    // oracle_answerable).
tests/phase20.sessions.test.ts:686:  it('SESS-07 M6: claude-install.ts has SessionStart in hook config (not just script body)', () => {
tests/phase20.sessions.test.ts:687:    const src = readFileSync('src/cli/commands/claude-install.ts', 'utf8');
src/domain/system-rooms.ts:12: *               fetches, web searches, telegram captures. "What has
src/domain/system-rooms.ts:45:export type SystemRoomName = 'toolshed' | 'research' | 'oracle';
src/domain/system-rooms.ts:70:  description: 'arxiv, hn, rss, web searches, web fetches, telegram — external reading',
src/domain/system-rooms.ts:72:  uriPrefixes: ['arxiv:', 'hn:', 'rss:', 'websearch:', 'http://', 'https://', 'telegram:'],
src/domain/system-rooms.ts:76: *  here as nodes (schemes oracle-question: / oracle-answer:) and
src/domain/system-rooms.ts:81:  name: 'oracle',
src/domain/system-rooms.ts:84:  uriPrefixes: ['oracle-question:', 'oracle-answer:'],
src/domain/errors.ts:614:      return 'fix: run `akashik identity init` to create your DID, or `akashik onboard` to run the full setup wizard.';
src/mcp/server.ts:54:} from '../domain/oracle.js';
src/mcp/server.ts:842:  // ─────────────── oracle_ask ─────────────
src/mcp/server.ts:843:  // Layer A of the peer-discovery stack — post a question to the oracle
src/mcp/server.ts:845:  // `touch oracle`. Returns the new question id so the caller can
src/mcp/server.ts:846:  // poll back with oracle_answers.
src/mcp/server.ts:849:    'oracle_ask',
src/mcp/server.ts:852:        'Post a new question to the oracle system room. The question propagates ' +
src/mcp/server.ts:854:        'wire protocol). Peers can answer with oracle_answer. Returns the ' +
src/mcp/server.ts:855:        'question id (`oracle-question:<uuid>`). Use this when you want the ' +
src/mcp/server.ts:872:      const res = await indexNode(deps)({ node, text, room: 'oracle' });
src/mcp/server.ts:883:  // ─────────────── oracle_answer ──────────
src/mcp/server.ts:889:    'oracle_answer',
src/mcp/server.ts:892:        'Post an answer to an existing oracle question. Links to the question ' +
src/mcp/server.ts:898:          .describe('The question id (e.g. `oracle-question:<uuid>`)'),
src/mcp/server.ts:911:          `oracle_answer: '${question_id}' does not look like a question id (expected 'oracle-question:...')`,
src/mcp/server.ts:924:      const res = await indexNode(deps)({ node, text, room: 'oracle' });
src/mcp/server.ts:937:  // Surface the oracle room so an agent can see what's waiting for an
src/mcp/server.ts:945:        'List open questions in the oracle room — questions peers (including ' +
src/mcp/server.ts:983:  // ─────────────── oracle_answerable ──────
src/mcp/server.ts:988:  // oracle_answer. Keeps the LLM as the answerer, graph as the
src/mcp/server.ts:992:    'oracle_answerable',
src/mcp/server.ts:995:        'Return open oracle questions this peer could plausibly answer from its ' +
src/mcp/server.ts:1000:        'oracle_answer next.',
src/mcp/server.ts:1036:      // oracle-room hits so we don't match questions against other
src/mcp/server.ts:1050:          .filter((h) => h.room !== 'oracle')
src/mcp/server.ts:1086:  // ─────────────── oracle_answers ──────────
src/mcp/server.ts:1088:  // recency-ranked. Pair with oracle_ask to complete the Q→A loop
src/mcp/server.ts:1092:    'oracle_answers',
src/mcp/server.ts:1095:        'Fetch all answers for a given oracle question. Sorted by confidence ' +
src/mcp/server.ts:1097:        'answered_by, confidence, fetched_at}. Use after oracle_ask to poll ' +
src/mcp/server.ts:1100:        question_id: z.string().describe('The oracle-question:<uuid> to fetch answers for'),
src/cli/index.ts:8: * Future phases add: init, room, daemon, discover, telegram, report, ask, mcp.
src/cli/index.ts:24:import { claudeInstall } from './commands/claude-install.js';
src/cli/index.ts:27:import { telegram } from './commands/telegram.js';
src/cli/index.ts:38:import { oracle } from './commands/oracle.js';
src/cli/index.ts:47:import { onboard } from './commands/onboard.js';
src/cli/index.ts:83:  telegram,
src/cli/index.ts:94:  oracle,
src/cli/index.ts:103:  onboard,
src/infrastructure/oracle-gossip.ts:2: * oracle-gossip — Layer B of the peer-discovery stack.
src/infrastructure/oracle-gossip.ts:4: * Thin wrapper over libp2p pubsub for the oracle Q&A topic. Layer A
src/infrastructure/oracle-gossip.ts:18: *     1. build the question / answer node via domain/oracle.ts
src/infrastructure/oracle-gossip.ts:29: *   - Claude-driven answering (oracle_answerable does that)
src/infrastructure/oracle-gossip.ts:52:/** libp2p pubsub topic for oracle questions + answers. Versioned so we
src/infrastructure/oracle-gossip.ts:54:export const ORACLE_TOPIC = '/akashik/oracle/1.0.0';
src/infrastructure/oracle-gossip.ts:63:/** Wire envelope. `kind` is redundant with node.oracle_kind but
src/infrastructure/oracle-gossip.ts:94:      'oracle-gossip: libp2p node was constructed without pubsub. Ensure createNode wires the floodsub service.',
src/infrastructure/oracle-gossip.ts:110:        throw new Error(`oracle-gossip: message ${json.length}B exceeds ${MAX_MESSAGE_BYTES}B cap`);
src/infrastructure/oracle-gossip.ts:115:    (e) => GE.writeError('oracle-gossip:publish', (e as Error).message),
src/infrastructure/oracle-gossip.ts:144: * Subscribe to the oracle topic. Every inbound message is:
src/infrastructure/oracle-gossip.ts:159:    return errAsync(GE.writeError('oracle-gossip:subscribe', pubsub.message));
src/cli/commands/onboard.ts:2: * `akashik onboard` — first-run installer + onboarding wizard.
src/cli/commands/onboard.ts:49:import { claudeInstall } from './claude-install.js';
src/cli/commands/onboard.ts:138:    cancel('onboarding cancelled — run again whenever.');
src/cli/commands/onboard.ts:394:  // LIVENESS PROBE (round-3 UX review — `onboard.ts:339` always logged
src/cli/commands/onboard.ts:460:const USAGE = `usage: akashik onboard [--yes] [--home DIR] [--no-sessions]
src/cli/commands/onboard.ts:473:export const onboard = async (args: readonly string[]): Promise<number> => {
src/cli/commands/onboard.ts:481:  intro('akashik onboard');
docs/marketing/positioning-v2.1.md:18:you trust via libp2p. Questions reach peers via an oracle bulletin
docs/marketing/positioning-v2.1.md:158:entries, oracle answers, room shares — can be wrapped in a signed
docs/marketing/positioning-v2.1.md:172:(`toolshed`, `research`, `oracle`) every peer advertises by default;
docs/marketing/positioning-v2.1.md:211:- **Oracle bulletin board** — post a question via `oracle ask`. It
docs/marketing/positioning-v2.1.md:214:  can plausibly answer see it via `oracle answerable` and respond
docs/marketing/positioning-v2.1.md:388:- Key points: `toolshed` + `research` always-on + the `oracle`
docs/marketing/positioning-v2.1.md:391:- Proof: GIF of `akashik oracle ask "..." --live` on peer A,
docs/marketing/positioning-v2.1.md:392:  `akashik oracle show <qid>` on peer B within 2 s.
docs/marketing/storybrand-messaging-draft.md:405:| Desire | Own my personal memory | Share with my team | **Compound community progress** |
docs/marketing/SITE-REDESIGN-SPEC.md:1050:- The pseudo-terminal output blocks (identity + oracle examples)
src/cli/commands/oracle.ts:2: * `akashik oracle <sub>` — peer-to-peer Q&A via the oracle system room.
src/cli/commands/oracle.ts:5: *   ask "<text>"            post a question to the oracle room; peers see it on next touch
src/cli/commands/oracle.ts:12: * already gates inbound oracle nodes; secret-gate already redacts them.
src/cli/commands/oracle.ts:28:} from '../../domain/oracle.js';
src/cli/commands/oracle.ts:34:import { publishQuestion, publishAnswer } from '../../infrastructure/oracle-gossip.js';
src/cli/commands/oracle.ts:38:const ORACLE_ROOM = 'oracle';
src/cli/commands/oracle.ts:52: * configured relay, publish one oracle message over pubsub, stop.
src/cli/commands/oracle.ts:64:    console.error(`oracle --live: identity: ${formatError(idRes.error)}`);
src/cli/commands/oracle.ts:69:    console.error(`oracle --live: config: ${formatError(cfgRes.error)}`);
src/cli/commands/oracle.ts:80:    console.error(`oracle --live: libp2p: ${formatError(nodeRes.error)}`);
src/cli/commands/oracle.ts:93:    pubsub.subscribe('/akashik/oracle/1.0.0');
src/cli/commands/oracle.ts:123:      console.error(`oracle --live: publish: ${formatError(publishRes.error)}`);
src/cli/commands/oracle.ts:126:    console.log(`  live:   published to /akashik/oracle/1.0.0 (${dialed} peer(s) dialed)`);
src/cli/commands/oracle.ts:144:    console.error('oracle ask: missing question — usage: akashik oracle ask "your question" [--live]');
src/cli/commands/oracle.ts:149:    console.error(`oracle ask: ${formatError(rt.error)}`);
src/cli/commands/oracle.ts:162:      console.error(`oracle ask: ${formatError(res.error)}`);
src/cli/commands/oracle.ts:165:    console.log(`oracle ask: posted`);
src/cli/commands/oracle.ts:169:      ? '  peers subscribed to /akashik/oracle/1.0.0 get it now; others on next touch.'
src/cli/commands/oracle.ts:170:      : '  peers will see it on their next touch of `oracle`.');
src/cli/commands/oracle.ts:200:    console.error('oracle answer: usage: akashik oracle answer <question-id> "your answer" [--confidence 0.7] [--live]');
src/cli/commands/oracle.ts:204:    console.error(`oracle answer: '${qid}' does not look like a question id (expected 'oracle-question:...')`);
src/cli/commands/oracle.ts:209:    console.error(`oracle answer: ${formatError(rt.error)}`);
src/cli/commands/oracle.ts:222:      console.error(`oracle answer: ${formatError(res.error)}`);
src/cli/commands/oracle.ts:225:    console.log(`oracle answer: posted`);
src/cli/commands/oracle.ts:255:    console.error(`oracle list: ${formatError(rt.error)}`);
src/cli/commands/oracle.ts:262:      console.error(`oracle list: ${formatError(graph.error)}`);
src/cli/commands/oracle.ts:271:      console.log('oracle list: no questions yet.');
src/cli/commands/oracle.ts:289:    console.error('oracle show: missing question id — usage: akashik oracle show <qid>');
src/cli/commands/oracle.ts:294:    console.error(`oracle show: ${formatError(rt.error)}`);
src/cli/commands/oracle.ts:301:      console.error(`oracle show: ${formatError(graph.error)}`);
src/cli/commands/oracle.ts:306:    if (!qNode || qNode.oracle_kind !== 'question') {
src/cli/commands/oracle.ts:307:      console.error(`oracle show: question not found: ${qid}`);
src/cli/commands/oracle.ts:362:    console.error(`oracle answerable: ${formatError(rt.error)}`);

codex
The stale surface is mostly “leaderboard-era retrieval product” material, plus process debris from the phase-based buildout. The live core now is: federation, provenance, community compounding, AkashikBench-F, and the Akashik story.

**Repo Root**

| file path | action | one-line reason |
|---|---|---|
| `README.md` | `KEEP` | This is already the clearest statement of the Akashik pivot and should be the canonical repo entrypoint. |
| `README.md.bak.830lines` | `DELETE` | Pure clutter; backup files do not belong in the working tree. |
| `.claude-octopus/state.json` | `DELETE` | Runtime state, not product source; this looks accidentally committed. |
| `.claude-octopus/state.json.backup` | `DELETE` | Same as above, plus even less defensible. |
| `.gitignore` | `NEEDS-REWRITE` | Add `.claude-octopus/`, likely `demo.tape`, and any other local state/output paths. |
| `.agents/skills/**` | `DELETE` | These are maintainer workflow assets, not Akashik product code or docs. |
| `CLAUDE.md` | `KEEP` | Dev instructions are useful internally, but it should stay clearly non-product-facing. |
| `NEXT_STEPS.md` | `ARCHIVE` | Duplicates planning intent now better expressed in `docs/PROJECT-PLAN-AKASHIK.md`. |
| `findings.md` | `ARCHIVE` | Likely useful as a historical scratchpad, not as a live source of truth. |
| `dist/` | `DELETE` | Generated output; if tracked, remove from git and regenerate in CI/builds only. |
| `akashik-rs/` | `KEEP` | Still valid infrastructure for local retrieval speed, even though it no longer carries the product narrative. |
| `demo/README.md` | `NEEDS-REWRITE` | Demos should sell federation/community compounding, not old single-user memory behavior. |

**.planning**

| file path | action | one-line reason |
|---|---|---|
| `.planning/HANDOFF.md` | `DELETE` | Session-specific Hetzner/OpenClaw handoff is operational residue, not reusable project knowledge. |
| `.planning/long-term-memory-integration.md` | `ARCHIVE` | Good historical rationale for the old memory stack, but not the current Akashik thesis. |
| `.planning/phases/phase-15/**` | `ARCHIVE` | Historically useful for P2P/security lineage, but phase-by-phase GSD files are not a good live operating surface now. |
| `.planning/phases/phase-16/**` | `ARCHIVE` | Same: room-sharing history matters, but not as active planning docs. |
| `.planning/phases/phase-17/**` | `ARCHIVE` | Federation history is valuable, but the phase files are build logs now. |
| `.planning/phases/phase-18/**` | `ARCHIVE` | Useful provenance, not live strategy. |
| `.planning/phases/phase-19/**` | `ARCHIVE` | Same. |
| `.planning/phases/phase-20/**` | `ARCHIVE` | Same. |
| `.planning/phases/phase-21/21-CONTEXT.md` | `ARCHIVE` | Long-term-memory phase context is now secondary to Akashik federation work. |
| `.planning/phases/phase-23/23-CONTEXT.md` | `ARCHIVE` | Retrieval bench context matters historically, but not as a live product guide. |
| `.planning/BENCH-v2.md` | `ARCHIVE` | Strong retrieval research record, but strategically superseded by AkashikBench-F. |
| `.planning/BENCH-COMPETITORS.md` | `ARCHIVE` | Useful historical market/retrieval context, but no longer the main battlefield. |
| `.planning/PROJECT.md` | `DELETE` | Duplicated by newer Akashik docs and likely stale. |
| `.planning/ROADMAP.md` | `DELETE` | Redundant with `docs/PROJECT-PLAN-AKASHIK.md` unless rewritten completely. |
| `.planning/REQUIREMENTS.md` | `ARCHIVE` | Preserve if you want requirements traceability; otherwise it will confuse current positioning. |
| `.planning/STATE.md` | `DELETE` | State snapshots age badly and quickly become noise. |
| `.planning/test-runs/**` | `DELETE` | Ephemeral run logs should not live as first-class repo artifacts. |

**Docs**

| file path | action | one-line reason |
|---|---|---|
| `docs/PROJECT-PLAN-AKASHIK.md` | `KEEP` | This is the right live execution doc for the current arc. |
| `docs/README.md` | `NEEDS-REWRITE` | Make it a clean docs index around Akashik, not accumulated legacy categories. |
| `docs/marketing/how-akashik-works.md` | `KEEP` | Best explanation of the compounding mechanism and should remain first-class. |
| `docs/marketing/storybrand-messaging-draft.md` | `ARCHIVE` | Preserve the evolution internally, but collapse public-facing messaging to a final version. |
| `docs/marketing/positioning-v2.1.md` | `NEEDS-REWRITE` | Likely close to the new thesis, but still carries transitional akashik/oracle-era framing. |
| `docs/marketing/positioning-draft.md` | `ARCHIVE` | Draft-stage messaging should not compete with the current story. |
| `docs/marketing/SOCIAL-LAUNCH.md` | `KEEP` | Launch execution is still relevant post-pivot. |
| `docs/marketing/how-akashik-works.md` | `KEEP` | Core architecture/message bridge; not stale. |
| `docs/marketing/growth-sources-plan.md` | `NEEDS-REWRITE` | Keep only if retargeted to OSS-community seeding rather than generic product growth. |
| `docs/marketing/influencer-outreach.md` | `NEEDS-REWRITE` | Valid only if aligned with the OSS pilot audience; otherwise it will drift. |
| `docs/product/VISION.md` | `NEEDS-REWRITE` | Still smart, but it frames Akashik as an “agent-memory protocol problem” more than a federated commons. |
| `docs/product/BENCHMARKS.md` | `NEEDS-REWRITE` | Too retrieval-leaderboard-heavy for the current story; keep the evidence, change the framing. |
| `docs/product/ROADMAP.md` | `ARCHIVE` | Superseded by the Akashik project plan unless rewritten from scratch. |
| `docs/product/RELEASE-v4.md` | `ARCHIVE` | Release notes for the old product arc are historical, not live product guidance. |
| `docs/product/MANIFESTO.md` | `KEEP` | If it aligns with the Akashik commons thesis, this is still valuable narrative glue. |
| `docs/architecture/ADR-001-v3-memory-protocol.md` | `ARCHIVE` | Good lineage artifact, but no longer the leading architectural reference. |
| `docs/architecture/ADR-002-v4-agent-brain.md` | `ARCHIVE` | “Agent brain” language is from the prior product identity. |
| `docs/architecture/V3-PROTOCOL.md` | `ARCHIVE` | Historical protocol layer, not current outward-facing architecture. |
| `docs/architecture/V4-PROTOCOL.md` | `ARCHIVE` | Same; useful lineage, stale primary framing. |
| `docs/p2p/P2P-VISION.md` | `ARCHIVE` | Important pivot precursor, but README and Akashik docs supersede it. |
| `docs/p2p/p2p-threat-model.md` | `KEEP` | Security/compliance-adjacent material ages better and matters for future SOC2/GDPR credibility. |
| `docs/p2p/peer-reputation-design.md` | `KEEP` | Still part of the federation story and operational trust layer. |
| `docs/p2p/peer-reputation-load-spreading.md` | `KEEP` | Still relevant to live federation scaling. |
| `docs/p2p/satisfaction-scoring.md` | `NEEDS-REWRITE` | Conceptually useful, but written for the older “agent memory quality gate” frame. |
| `docs/research/beat-the-competitors-retrieval-plan.md` | `ARCHIVE` | Strong technical research, but the positioning premise is superseded; annotate that explicitly. |
| `docs/research/performance-prediction-matrix.md` | `ARCHIVE` | Useful retrieval-era thinking, but now secondary and too speculative as a live doc. |
| `docs/research/energy-based-contradiction-detection.md` | `ARCHIVE` | Good forward sketch, but not core to the current launch narrative. |
| `docs/research/github-star-growth.md` | `KEEP` | Still useful if launch/distribution remains GitHub-centric. |
| `docs/research/octopus-discover/round-4-2026-05-26/**` | `ARCHIVE` | Preserve as decision provenance; not a day-to-day doc surface. |
| `docs/research/octopus-discover/round-5-2026-05-26/**` | `KEEP` | This round directly informed the current Akashik plan and AkashikBench-F thesis. |
| `docs/index.html` | `KEEP` | Keep if this is the public docs/landing surface; otherwise it risks drift and needs synchronization. |
| `docs/probe.html` | `DELETE` | Looks like an experiment artifact, not durable documentation. |

**Tests**

| file path | action | one-line reason |
|---|---|---|
| `tests/bench-akashik-federation.test.ts` | `KEEP` | This is the one benchmark that directly validates the current product thesis. |
| `tests/bench-locomo-real.test.ts` | `KEEP` | Real-corpus single-peer retrieval still matters as a subsystem health check. |
| `tests/bench-longmemeval-real.test.ts` | `KEEP` | Same: still useful as retrieval regression evidence, even if no longer the headline. |
| `tests/bench-scifact-real.test.ts` | `KEEP` | Useful baseline for retrieval quality and hardware comparisons. |
| `tests/bench-real.test.ts` | `NEEDS-REWRITE` | Keep only as a fast smoke benchmark; it should stop pretending to be canonical evaluation. |
| `tests/bench-standard.test.ts` | `NEEDS-REWRITE` | Same problem: useful as CI smoke, superseded as public evidence. |
| `tests/bench-locomo-synth.test.ts` | `ARCHIVE` | Real LoCoMo exists now; keep only if you explicitly want a fast fixture suite. |
| `tests/bench-longmemeval-synth.test.ts` | `ARCHIVE` | Same as above; valuable for local speed, not for product claims. |
| `tests/phase39.oracle-gossip-e2e.test.ts` | `KEEP` | Oracle/pubsub is still a real federation capability, not just old framing fluff. |
| `tests/federated-search-cap-tiers.test.ts` | `KEEP` | Directly relevant to federation fan-out quality and scaling behavior. |
| `tests/phase18.production-net.test.ts` | `KEEP` | Networking regressions still matter to Akashik’s core architecture. |
| `tests/phase29.rust-retrieval-regression.test.ts` | `KEEP` | Rust sidecar is still valid infra; keep a regression guard if you keep the sidecar. |

**Src / code**

| file path | action | one-line reason |
|---|---|---|
| `src/application/federated-search.ts` | `KEEP` | Core Akashik behavior; this is central, not optional. |
| `src/domain/federation-sim.ts` | `KEEP` | Core to AkashikBench-F and the compounding thesis. |
| `src/application/use-cases.ts` | `KEEP` | Still foundational, but comments/reference text should stop talking like Phase 1 code. |
| `src/application/ask.ts` | `NEEDS-REWRITE` | Keep the functionality, but align the flow/docs with local→federation→web→save. |
| `src/domain/long-term-memory.ts` | `ARCHIVE` | Not dead code necessarily, but clearly from the older “agent memory product” center of gravity. |
| `src/domain/cross-rerank.ts` | `ARCHIVE` | Useful retrieval infra, but no longer central enough to dominate the conceptual surface. |
| `src/domain/llm-listwise-rerank.ts` | `ARCHIVE` | Same: technically interesting, strategically de-centered. |
| `src/telegram/bot.ts` | `DELETE` | Telegram capture is a single-user workflow feature, not part of the OSS knowledge-commons core. |
| `src/telegram/capture.ts` | `DELETE` | Same. |
| `src/telegram/commands.ts` | `DELETE` | Same. |
| `src/domain/oracle.ts` | `KEEP` | The oracle room still fits community knowledge exchange, though it should be presented as secondary to federation-on-query. |
| `src/cli/commands/onboard.ts` | `NEEDS-REWRITE` | Keep if you want adoption, but the onboarding story should be “join the commons,” not “set up your personal memory.” |
| `src/cli/index.ts` | `NEEDS-REWRITE` | Command surface has grown into product sprawl; prune or regroup around Akashik’s current core use cases. |

A few clear calls. On the two-name issue: stay two-name only as a short transitional tactic, because the upside is package/install continuity, but the downside is constant cognitive tax across docs, tests, CLI, and benchmarks. I would not do an immediate repo/package rename before the pilot if it risks breaking the working distribution path; on the other hand, I would aggressively remove “akashik” from narrative docs now and schedule one coordinated technical rename once the pilot-facing docs stabilize. On `storybrand-messaging-draft.md`, keep the revision history only in archive form; the public or active doc should be the final message only. On `beat-the-competitors-retrieval-plan.md`, archive and annotate it rather than delete it; its strengths are real technical research and benchmark archaeology, however its competitive frame is now wrong for the product.

If I were Sahar cleaning up right now, the 3 changes I’d make first are: delete repo junk and local state (`README.md.bak.830lines`, `.claude-octopus/*`, tracked `dist/`) because that is pure signal-to-noise drag; archive most of `.planning/` plus the retrieval-era research docs because they preserve history without continuing to steer the present; rewrite `docs/product/BENCHMARKS.md`, `docs/product/VISION.md`, and onboarding/command-facing docs around Akashik’s actual thesis because the biggest current risk is not dead code, it is a codebase and doc surface still telling two different stories.
2026-05-26T17:35:48.298803Z ERROR codex_core::session: failed to record rollout items: thread 019e6557-a38e-7183-8dfb-0cd38e5abfe7 not found
tokens used
215,071
```
# Completed: יום ג׳ מאי 26 2026 20:41:42 IDT
