<!-- trust=untrusted provider=codex -->
# Agent: codex
# Task ID: probe-1779816691-3
# Role: researcher
# Phase: probe
# Prompt: Investigate technical feasibility and dependencies for: -P CLEANUP AUDIT — what's no longer relevant in the Akashik project given the full arc:

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
- Be opinionated. Don't return 'maybe keep, maybe delete' for everything. Make a call.. What are the prerequisites?
# Started: יום ג׳ מאי 26 2026 20:31:43 IDT

<!-- BEGIN-UNTRUSTED:provider=codex:nonce=c835144e53f5698e -->
## Output
```
The repo is carrying three different stories at once: old `akashik` personal/team memory, mid-phase retrieval leaderboard work, and current `Akashik` OSS commons. The cleanup should optimize for one thing: make the federation-compounding thesis look like the product, and demote everything else to history.

**Direct Table**

**Repo Root**

| file path | action | one-line reason |
|---|---|---|
| `README.md` | KEEP | This is the current canonical Akashik story and already explains the compounding loop clearly. |
| `README.md.bak.830lines` | DELETE | Pure backup clutter; no product or engineering value once current README exists. |
| `package.json` | NEEDS-REWRITE | Still markets `akashik` as an “agent memory” package; code name can stay, description should not. |
| `NEXT_STEPS.md` | ARCHIVE | Useful transition artifact, but still frames the product as “local-first agent memory system.” |
| `findings.md` | ARCHIVE | Retrieval-research synthesis is historically useful, but not front-door product truth now. |
| `.gitignore` | NEEDS-REWRITE | Missing `.claude-octopus/`; should also explicitly exclude local research state and transient backups. |
| `.planning/` | NEEDS-REWRITE | Valuable as history, but the current phase tree is not a usable live planning system anymore. |
| `.claude-octopus/` | DELETE | Checked-in local orchestration state; not product source, not reproducible, security/noise risk. |
| `.agents/` | DELETE | Personal authoring skills/design prompts are not part of the Akashik OSS product surface. |
| `.claude/` | KEEP | Repo-level contributor/agent instructions can still be relevant if they are product-specific. |
| `.claude-plugin/` | KEEP | Still relevant if Claude integration remains part of the distribution story. |
| `src/` | KEEP | Core product implementation. |
| `tests/` | KEEP | Still needed, but several retrieval-era suites should be archived. |
| `docs/` | KEEP | Core narrative and design record, but needs triage hard. |
| `scripts/` | ARCHIVE | Many scripts are tied to retrieval-race experiments; keep as lab history, not top-level product identity. |
| `akashik-rs/` | KEEP | Not obviously dead; still supports current performance path during the two-name period. |
| `dist/` | KEEP | Build artifact expected for package distribution; not a cleanup target unless you change release flow. |
| `demo/` | NEEDS-REWRITE | Demo likely still useful, but copy/screens need to reflect Akashik instead of old framing. |

**Docs: top 20**

| file path | action | one-line reason |
|---|---|---|
| `docs/PROJECT-PLAN-AKASHIK.md` | KEEP | Best current plan doc; aligned to AkashikBench-F and the OSS pilot. |
| `docs/README.md` | NEEDS-REWRITE | Likely redundant unless it becomes the docs index for the Akashik story. |
| `docs/product/VISION.md` | NEEDS-REWRITE | Strong protocol thinking, but still anchored in “agent-memory protocol problem.” |
| `docs/product/ROADMAP.md` | ARCHIVE | Describes the old Claude plugin + Telegram product arc, not the current one. |
| `docs/product/BENCHMARKS.md` | NEEDS-REWRITE | Benchmarking still matters, but this doc over-centers retrieval leaderboard progress and stale phases. |
| `docs/product/MANIFESTO.md` | KEEP | Likely still useful if it matches the commons thesis; keep as mission-layer doc. |
| `docs/product/GRAPHRAG-AUDIT.md` | ARCHIVE | Useful historical competitive analysis, but not core to the Akashik front story now. |
| `docs/product/RELEASE-v4.md` | ARCHIVE | Release doc for the pre-pivot product generation. |
| `docs/marketing/how-akashik-works.md` | KEEP | This is one of the strongest current explanatory artifacts. |
| `docs/marketing/storybrand-messaging-draft.md` | NEEDS-REWRITE | Preserve the final messaging, collapse the revision scaffolding into a shorter canonical doc. |
| `docs/marketing/positioning-draft.md` | ARCHIVE | Draft-stage messaging from an earlier frame. |
| `docs/marketing/positioning-v2.1.md` | ARCHIVE | Transitional positioning; useful history, wrong as current source of truth. |
| `docs/marketing/SOCIAL-LAUNCH.md` | KEEP | Still launch-relevant if updated for Akashik naming and pilot audience. |
| `docs/marketing/growth-sources-plan.md` | KEEP | Still useful for OSS distribution planning. |
| `docs/marketing/influencer-outreach.md` | KEEP | Still useful if the pilot depends on targeted OSS ecosystem outreach. |
| `docs/research/beat-the-competitors-retrieval-plan.md` | ARCHIVE | Keep as annotated history; the research is good, but the frame is superseded. |
| `docs/research/energy-based-contradiction-detection.md` | ARCHIVE | Legit future idea, but non-core and not tied to the present Akashik milestone. |
| `docs/research/performance-prediction-matrix.md` | ARCHIVE | Over-optimizes old leaderboard logic and hardware-tier positioning instead of federation value. |
| `docs/research/github-star-growth.md` | ARCHIVE | Potentially useful growth research, but not a live product doc. |
| `docs/p2p/p2p-threat-model.md` | KEEP | Still directly relevant; for OSS and future enterprise use, security provenance remains core. |

**Tests: top 10**

| file path | action | one-line reason |
|---|---|---|
| `tests/bench-akashik-federation.test.ts` | KEEP | This is the pivot-validating benchmark and should become the flagship suite. |
| `tests/bench-locomo-real.test.ts` | KEEP | Still useful as a single-peer retrieval floor; complements, not replaces, federation tests. |
| `tests/bench-longmemeval-real.test.ts` | KEEP | Same as above; useful baseline even if no longer the product headline. |
| `tests/bench-scifact-real.test.ts` | KEEP | Good retrieval regression guard, but secondary to federation from now on. |
| `tests/bench-real.test.ts` | ARCHIVE | 30-doc labeled proxy is clearly superseded by real-corpus benches. |
| `tests/bench-standard.test.ts` | ARCHIVE | Synthetic Hotpot/competitor-style framing was useful then, but is no longer canonical. |
| `tests/bench-locomo-synth.test.ts` | ARCHIVE | Real LoCoMo bench makes this mainly a historical or fast-smoke artifact. |
| `tests/bench-longmemeval-synth.test.ts` | ARCHIVE | Same issue; real-corpus equivalents now exist. |
| `tests/phase17.federated-search.test.ts` | KEEP | Still directly tied to the Akashik mechanism. |
| `tests/phase35.p2p-touch-e2e.test.ts` | KEEP | Real P2P behavior is still core to the current thesis. |

**Src: top 10**

| file path | action | one-line reason |
|---|---|---|
| `src/domain/federation-sim.ts` | KEEP | Core Akashik proof artifact. |
| `src/application/federated-search.ts` | KEEP | Central to the live product story. |
| `src/application/ask.ts` | KEEP | Still the main query path, though terminology and fallback narration need eventual rename cleanup. |
| `src/application/discovery-loop.ts` | KEEP | Still aligned if discovery means growing the commons; not obviously stale. |
| `src/infrastructure/peer-transport.ts` | KEEP | Foundational to the federation thesis. |
| `src/domain/peer-reputation.ts` | KEEP | Still strategically relevant for trust, abuse resistance, and future compliance posture. |
| `src/domain/long-term-memory.ts` | ARCHIVE | Solid work, but it belongs to the old “memory product” center of gravity, not the current core. |
| `src/telegram/bot.ts` | DELETE | Telegram bot is product-surface drift; it is not part of the current Akashik wedge. |
| `src/cli/commands/onboard.ts` | NEEDS-REWRITE | Onboarding still matters, but the flow should sell “join the commons,” not “install a personal memory daemon.” |
| `src/infrastructure/rust-retrieval.ts` | KEEP | Not dead; still supports performance paths while the package/runtime remain in the two-name period. |

**`.planning/` tree**

| file path | action | one-line reason |
|---|---|---|
| `.planning/HANDOFF.md` | DELETE | Session-specific infra notes, server IDs, and operational residue should not live in the product repo. |
| `.planning/long-term-memory-integration.md` | ARCHIVE | Strong historical design work, but centered on the pre-pivot memory stack. |
| `.planning/phases/phase-21/21-CONTEXT.md` | ARCHIVE | Good historical context for the memory-tier effort; not live plan material. |
| `.planning/phases/phase-23/23-CONTEXT.md` | ARCHIVE | Useful retrieval-benchmark history, superseded as active planning. |
| `.planning/BENCH-COMPETITORS.md` | ARCHIVE | Keep as research record, not as current strategy surface. |
| `.planning/BENCH-v2.md` | ARCHIVE | Historical retrieval-attack archive; useful, but not live plan material. |
| `.planning/MILESTONES.md` | NEEDS-REWRITE | Keep only if re-authored around Akashik phases, not phase-number archaeology. |
| `.planning/PROJECT.md` | ARCHIVE | Almost certainly stale relative to `docs/PROJECT-PLAN-AKASHIK.md`. |
| `.planning/ROADMAP.md` | ARCHIVE | Same issue; wrong layer and likely stale framing. |
| `.planning/test-runs/p2p-phases-2026-05-11T160726Z.md` | DELETE | Raw run log, not durable product documentation. |

**Q1-Q5 Calls**

The biggest no-longer-relevant cluster is anything whose center of gravity is “beat mem0/agentmemory on single-peer retrieval” or “personal memory product workflow.” That work was not wasted; it became enabling infrastructure. However, front-door docs, stale synthetic benches, session handoff files, Telegram surface area, personal `.agents` skills, and `.claude-octopus` state are now mostly drag.

On `.planning/`: the phase-based GSD workflow was useful while the project was in rapid invention mode. On the other hand, keeping the full phase tree at repo front-door now makes the codebase read like an excavation site. The tradeoff is traceability versus clarity. My call: keep planning history, but archive almost all of `.planning/phases/` and replace live planning with one current Akashik roadmap plus a short `docs/archive/README.md` explaining the lineage.

On `docs/research/`: `beat-the-competitors-retrieval-plan.md` should be archived, not deleted. It contains real empirical thinking and explains why retrieval work plateaued. However, it is now strategically misleading if left unannotated at top level. `energy-based-contradiction-detection.md` and `performance-prediction-matrix.md` are also archive material: intellectually useful, but off the current critical path. Conversely, `p2p-threat-model.md` stays live because security, provenance, auditability, and future GDPR/SOC2 questions still matter under the new thesis.

On `src/`: `akashik-rs` is not obviously dead. The upside of keeping it is that it preserves a proven performance path during the transition; the downside is maintenance burden and name-drift. I would not remove it until you know the Node-only path can fully cover the hot paths you care about. `.claude-octopus/`, by contrast, looks checked in by mistake. The upside of preserving it is effectively zero; the downside is repo noise and accidental leakage of local orchestration state. It should be deleted and gitignored.

On tests: the real-corpus benches still matter because they prove the local node is not weak. However, the product claim is no longer “best R@5.” The tradeoff is regression coverage versus attention dilution. My call: keep `bench-akashik-federation` as flagship, keep the real retrieval benches as regression guards, archive the synthetic proxy benches that were only useful while public-corpus adapters were missing.

On naming: do not stay indefinite two-name. A short bounded two-name period is defensible because it avoids breaking installs, CLI muscle memory, config locations, and package publishing flow. However, the tradeoff is ongoing cognitive debt: every doc has to explain the mismatch, and stale `akashik` framing keeps regenerating. My recommendation is a coordinated rename plan with prerequisites:
1. Confirm package/binary/repo/domain names you can actually secure.
2. Decide whether config paths stay `~/.akashik` for one compatibility release or migrate with aliasing.
3. Add a temporary CLI alias so `akashik` and `akashik` both work for one release.
4. Freeze protocol IDs and signed message prefixes deliberately; changing them has compatibility implications.
5. Publish one migration doc and stop creating new mixed-name docs immediately.

If I were Sahar cleaning up right now, the 3 changes I’d make first are: delete and gitignore `.claude-octopus/` plus remove `README.md.bak.830lines`; archive the stale retrieval-era docs/tests into `docs/archive/` with a short index note; and rewrite `package.json` + `docs/product/ROADMAP.md` around the Akashik commons thesis. Those three give the fastest signal improvement because they remove obvious noise, stop the repo from telling the wrong story, and preserve the useful history without letting it dominate the present.
```
<!-- END-UNTRUSTED:provider=codex:nonce=c835144e53f5698e -->

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
session id: 019e6557-a8e4-7fd3-87f9-24af3b9b0d4f
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
Investigate technical feasibility and dependencies for: -P CLEANUP AUDIT — what's no longer relevant in the Akashik project given the full arc:

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
- Be opinionated. Don't return 'maybe keep, maybe delete' for everything. Make a call.. What are the prerequisites?

IMPORTANT: If you find yourself searching or grepping more than 3 times in a row without reading files or writing analysis, STOP searching. Consolidate what you've found so far and write your analysis. More searching rarely improves the output — synthesis does.

---

<!-- BEGIN-UNTRUSTED:provider-history:074734a78100ce5e -->
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
<!-- END-UNTRUSTED:provider-history:074734a78100ce5e -->
codex
Auditing the repository structure and representative files first, then I’ll make hard keep/archive/delete calls tied to the Akashik pivot rather than the older akashik framing.
exec
/bin/zsh -lc "printf 'SRC\\n' && find src -maxdepth 3 -type f | sort" in /Users/saharbarak/personal/akashik
exec
/bin/zsh -lc "printf 'DOCS\\n' && find docs -maxdepth 3 -type f | sort" in /Users/saharbarak/personal/akashik
exec
/bin/zsh -lc "printf 'TESTS\\n' && find tests -maxdepth 3 -type f | sort" in /Users/saharbarak/personal/akashik
exec
/bin/zsh -lc "pwd && printf '\\nROOT\\n' && find . -maxdepth 1 -mindepth 1 | sort" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
DOCS
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

 succeeded in 0ms:
SRC
src/application/ask.ts
src/application/auto-forget-tick.ts
src/application/batch-ingest.ts
src/application/bip39-recovery.ts
src/application/codebase-indexer.ts
src/application/consolidator.ts
src/application/discover.ts
src/application/discovery-loop.ts
src/application/federated-recall.ts
src/application/federated-search.ts
src/application/hot-cache-tick.ts
src/application/identity-bridge.ts
src/application/identity-lifecycle.ts
src/application/ingest.ts
src/application/peer-order-builder.ts
src/application/peer-pull-telemetry.ts
src/application/recall.ts
src/application/report.ts
src/application/session-ingest.ts
src/application/session-manager.ts
src/application/update-checker.ts
src/application/update-peer-reputation.ts
src/application/use-cases.ts
src/cli/commands/ask.ts
src/cli/commands/bench.ts
src/cli/commands/cache-stats.ts
src/cli/commands/claude-install.ts
src/cli/commands/codebase.ts
src/cli/commands/consolidate.ts
src/cli/commands/daemon.ts
src/cli/commands/dashboard.ts
src/cli/commands/discover-loop.ts
src/cli/commands/discover.ts
src/cli/commands/doctor.ts
src/cli/commands/entity.ts
src/cli/commands/eval.ts
src/cli/commands/export-obsidian.ts
src/cli/commands/gc.ts
src/cli/commands/help.ts
src/cli/commands/hot.ts
src/cli/commands/identity.ts
src/cli/commands/index-project.ts
src/cli/commands/init.ts
src/cli/commands/jobs.ts
src/cli/commands/lint.ts
src/cli/commands/login.ts
src/cli/commands/logs.ts
src/cli/commands/mcp.ts
src/cli/commands/metrics.ts
src/cli/commands/onboard.ts
src/cli/commands/oracle.ts
src/cli/commands/peer.ts
src/cli/commands/peers-rep.ts
src/cli/commands/publish.ts
src/cli/commands/recall.ts
src/cli/commands/recent-sessions.ts
src/cli/commands/report.ts
src/cli/commands/room.ts
src/cli/commands/save.ts
src/cli/commands/sessions.ts
src/cli/commands/share.ts
src/cli/commands/sources.ts
src/cli/commands/swarm.ts
src/cli/commands/telegram.ts
src/cli/commands/this.ts
src/cli/commands/touch.ts
src/cli/commands/trigger.ts
src/cli/commands/unshare.ts
src/cli/commands/update.ts
src/cli/commands/version.ts
src/cli/commands/viz.ts
src/cli/index.ts
src/cli/ipc-client.ts
src/cli/runtime.ts
src/cli/tui/share-picker-tty.ts
src/daemon/consolidate-tick.ts
src/daemon/file-watcher.ts
src/daemon/ipc-handlers.ts
src/daemon/ipc.ts
src/daemon/job-queue.ts
src/daemon/job-runner.ts
src/daemon/loop.ts
src/domain/auto-forget.ts
src/domain/bench-types.ts
src/domain/binary-quantize.ts
src/domain/bloom.ts
src/domain/chunks.ts
src/domain/codebase.ts
src/domain/consolidated-memory.ts
src/domain/content.ts
src/domain/contextual-enrich.ts
src/domain/cross-rerank.ts
src/domain/entity-extract.ts
src/domain/entity.ts
src/domain/errors.ts
src/domain/eval-metrics.ts
src/domain/federation-sim.ts
src/domain/feeds.ts
src/domain/graph-lint.ts
src/domain/graph-rerank.ts
src/domain/graph.ts
src/domain/hot-cache.ts
src/domain/identity.ts
src/domain/internal-schemes.ts
src/domain/job.ts
src/domain/llm-extractor.ts
src/domain/llm-listwise-rerank.ts
src/domain/log-event.ts
src/domain/long-term-memory.ts
src/domain/metrics.ts
src/domain/oracle.ts
src/domain/pagerank.ts
src/domain/peer-reputation.ts
src/domain/peer-telemetry.ts
src/domain/peer.ts
src/domain/query-cache.ts
src/domain/recency-rerank.ts
src/domain/release.ts
src/domain/remote-node-validator.ts
src/domain/rerank-tier.ts
src/domain/rooms.ts
src/domain/save-note.ts
src/domain/secret-gate.ts
src/domain/semantic-cache.ts
src/domain/sessions.ts
src/domain/shamir.ts
src/domain/share-envelope.ts
src/domain/share-picker.ts
src/domain/share-policy.ts
src/domain/sharing.ts
src/domain/sources.ts
src/domain/subject-key.ts
src/domain/system-rooms.ts
src/domain/touch.ts
src/domain/vectors.ts
src/domain/write-time-gate.ts
src/infrastructure/async-mutex.ts
src/infrastructure/atomic-write.ts
src/infrastructure/bandwidth-limiter.ts
src/infrastructure/code-graph.ts
src/infrastructure/config-loader.ts
src/infrastructure/connection-health.ts
src/infrastructure/cross-encoder.ts
src/infrastructure/embedders.ts
src/infrastructure/entity-registry.ts
src/infrastructure/github-oauth.ts
src/infrastructure/graph-repository.ts
src/infrastructure/http/fetcher.ts
src/infrastructure/hw-detect.ts
src/infrastructure/identity-resolver.ts
src/infrastructure/identity-store.ts
src/infrastructure/linked-accounts.ts
src/infrastructure/llm-extractor.ts
src/infrastructure/llm-listwise-rerank.ts
src/infrastructure/log-store.ts
src/infrastructure/ollama-client.ts
src/infrastructure/oracle-gossip.ts
src/infrastructure/parsers/html-extractor.ts
src/infrastructure/parsers/xml-parser.ts
src/infrastructure/peer-reputation-store.ts
src/infrastructure/peer-store.ts
src/infrastructure/peer-transport.ts
src/infrastructure/process-lock.ts
src/infrastructure/recall-sync.ts
src/infrastructure/rooms-config.ts
src/infrastructure/rust-retrieval.ts
src/infrastructure/search-gossip.ts
src/infrastructure/search-sync.ts
src/infrastructure/sessions-state.ts
src/infrastructure/share-store.ts
src/infrastructure/share-sync.ts
src/infrastructure/sources-config.ts
src/infrastructure/sources/arxiv.ts
src/infrastructure/sources/audio-transcript.ts
src/infrastructure/sources/claude-sessions.ts
src/infrastructure/sources/codebase.ts
src/infrastructure/sources/devto.ts
src/infrastructure/sources/ecosystems-timeline.ts
src/infrastructure/sources/generic-rss.ts
src/infrastructure/sources/generic-url.ts
src/infrastructure/sources/git-log.ts
src/infrastructure/sources/git-submodules.ts
src/infrastructure/sources/github-releases.ts
src/infrastructure/sources/github-trending.ts
src/infrastructure/sources/hn-algolia.ts
src/infrastructure/sources/image-metadata.ts
src/infrastructure/sources/image-ocr.ts
src/infrastructure/sources/npm-trending.ts
src/infrastructure/sources/oss-insight.ts
src/infrastructure/sources/package-deps.ts
src/infrastructure/sources/pdf-text.ts
src/infrastructure/sources/podcast-rss.ts
src/infrastructure/sources/product-hunt.ts
src/infrastructure/sources/reddit.ts
src/infrastructure/sources/registry.ts
src/infrastructure/sources/twitter-search.ts
src/infrastructure/sources/youtube-transcript.ts
src/infrastructure/summariser.ts
src/infrastructure/telemetry-formatter.ts
src/infrastructure/touch-protocol.ts
src/infrastructure/tree-sitter-parser.ts
src/infrastructure/vector-index.ts
src/infrastructure/watch-targets.ts
src/infrastructure/x-client.ts
src/infrastructure/ydoc-store.ts
src/mcp/server.ts
src/telegram/bot.ts
src/telegram/capture.ts
src/telegram/commands.ts
src/telegram/digest.ts

 succeeded in 0ms:
TESTS
tests/auto-forget.test.ts
tests/bench-akashik-federation.test.ts
tests/bench-auto-forget.test.ts
tests/bench-beta-calibration.test.ts
tests/bench-locomo-real.test.ts
tests/bench-locomo-synth.test.ts
tests/bench-longmemeval-real.test.ts
tests/bench-longmemeval-synth.test.ts
tests/bench-onnx.test.ts
tests/bench-real.test.ts
tests/bench-retention-band.test.ts
tests/bench-scifact-real.test.ts
tests/bench-standard.test.ts
tests/bench-tier-promotion.test.ts
tests/bench-write-gate.test.ts
tests/binary-quantize.test.ts
tests/bip39-recovery.test.ts
tests/bloom.test.ts
tests/browser-portability.test.ts
tests/consolidate-tick.test.ts
tests/consolidated-memory.test.ts
tests/consolidator.test.ts
tests/contextual-enrich.test.ts
tests/cross-rerank.test.ts
tests/embedder-batching.test.ts
tests/error-hints.test.ts
tests/eval-metrics.test.ts
tests/federated-search-cap-tiers.test.ts
tests/federation-sim.test.ts
tests/fixtures/phase19/callee.ts
tests/fixtures/phase19/caller.ts
tests/fixtures/phase19/patterns.ts
tests/fixtures/phase19/sample.py
tests/fixtures/phase19/sample.ts
tests/fixtures/phase20/sample-session.jsonl
tests/fixtures/phase20/sample-with-secret.jsonl
tests/github-oauth.test.ts
tests/graph-rerank.test.ts
tests/identity-bridge.test.ts
tests/identity-lifecycle.test.ts
tests/identity.test.ts
tests/ipc.test.ts
tests/job-queue-backpressure.test.ts
tests/linked-accounts.test.ts
tests/llm-extractor.test.ts
tests/llm-listwise-rerank.test.ts
tests/log-store.test.ts
tests/long-term-memory.test.ts
tests/metrics.test.ts
tests/multi-rrf.test.ts
tests/pagerank.test.ts
tests/peer-order-builder.test.ts
tests/peer-reputation-math.test.ts
tests/peer-reputation-review-fixes.test.ts
tests/peer-reputation-store.test.ts
tests/peer-telemetry.test.ts
tests/phase1.graph-rooms.test.ts
tests/phase15.peer-security.test.ts
tests/phase16.share-crdt.test.ts
tests/phase17.discovery.test.ts
tests/phase17.federated-search.test.ts
tests/phase17.mcp-tool.test.ts
tests/phase18.production-net.test.ts
tests/phase19.codebase-indexing.test.ts
tests/phase2.chunks.test.ts
tests/phase2.feeds.test.ts
tests/phase2.ingest.test.ts
tests/phase20.sessions.test.ts
tests/phase29.rust-retrieval-regression.test.ts
tests/phase3.mcp.test.ts
tests/phase31.remote-node-validator.test.ts
tests/phase32.hot-cache.test.ts
tests/phase33.graph-lint.test.ts
tests/phase34.save-note.test.ts
tests/phase35.p2p-touch-e2e.test.ts
tests/phase36.system-rooms.test.ts
tests/phase37.share-picker.test.ts
tests/phase38.oracle.test.ts
tests/phase39.oracle-gossip-e2e.test.ts
tests/phase4.rooms.test.ts
tests/phase5.ask-report.test.ts
tests/phase6.daemon.test.ts
tests/process-lock.test.ts
tests/query-cache.test.ts
tests/recency-rerank.test.ts
tests/release.test.ts
tests/rerank-tier.test.ts
tests/semantic-cache.test.ts
tests/shamir.test.ts
tests/share-envelope.test.ts
tests/share-policy.test.ts
tests/summariser.test.ts
tests/vector-index-binary.test.ts
tests/write-time-gate.test.ts

 succeeded in 0ms:
/Users/saharbarak/personal/akashik

ROOT
./.agents
./.claude
./.claude-octopus
./.claude-plugin
./.git
./.github
./.gitignore
./.gitmodules
./.mcp.json
./.planning
./CLAUDE.md
./Dockerfile
./NEXT_STEPS.md
./README.md
./README.md.bak.830lines
./bin
./config
./demo
./dist
./docs
./findings.md
./node_modules
./package-lock.json
./package.json
./scripts
./skills-lock.json
./src
./tests
./tsconfig.json
./vendor
./akashik-rs

exec
/bin/zsh -lc "printf 'PLANNING\\n' && find .planning -maxdepth 4 -type f | sort" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
PLANNING
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

codex
The layout confirms three eras mixed together: old retrieval-RAG work, later P2P/federation work, and current Akashik branding. I’m reading the canonical docs and a cross-section of source/tests now to separate historical record from active product surface.
exec
/bin/zsh -lc "sed -n '1,220p' README.md" in /Users/saharbarak/personal/akashik
exec
/bin/zsh -lc "sed -n '1,220p' package.json" in /Users/saharbarak/personal/akashik
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
/bin/zsh -lc "sed -n '1,220p' docs/product/ROADMAP.md" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
# Akashik — Roadmap

## Vision

A Claude Code plugin that turns a research daemon + daily Telegram scroll into a queryable, embeddings-backed knowledge graph. Rooms partition knowledge by domain (homelab, fundraise, etc.). Tunnels surface surprising cross-domain connections.

## Phases

### Phase 0 — Scaffold (done)

Zero-dep CLI with `doctor`, `version`, `help`. Plugin manifest at `.claude-plugin/plugin.json`. Config example. TypeScript + ESM.

### Phase 1 — Graph + Vectors + Embeddings (done)

DDD layered stack: pure domain (graph, vectors, errors), infrastructure ports + adapters (JSON graph repo, sqlite-vec vector index, xenova/fixture embedders), application use cases (indexNode, searchByRoom, searchGlobal, findTunnels, exploreRoom). Graphify vendored as submodule with schema patch for room/wing/source_uri/fetched_at/embedding_id. Python venv bootstrapping for graphify sidecar.

### Phase 2 — Source Ingest Pipeline (done)

Pluggable Source port with four adapters: generic_rss, arxiv, hn_algolia, generic_url. RSS 2.0 + Atom normaliser. Recursive paragraph chunker. Content-hash (sha256) dedup on re-runs. `akashik trigger [--room R]` and `akashik sources list|add|remove|enable|disable`.

Libraries: @mozilla/readability (article extraction), linkedom (DOM), fast-xml-parser (XML).

### Phase 3 — MCP Server (done)

9 tools exposed over stdio via @modelcontextprotocol/sdk: search, ask, get_node, get_neighbors, list_rooms, find_tunnels, sources_list, trigger_room, graph_stats. `akashik mcp start` — auto-spawned by Claude Code via the plugin manifest.

### Phase 4 — Room Management + Init

**Commands:** `akashik init`, `akashik room list|create|switch|current`

**Goal:** Make onboarding self-service. `init` is an interactive wizard that asks what the user is researching, creates the room, suggests source adapters (arxiv queries, RSS feeds, HN searches), and registers them. `room` manages rooms programmatically (list, create, set current default, switch).

**Deliverables:**
- `src/domain/rooms.ts` — Room metadata type (name, description, created_at, keywords, default wing)
- `src/infrastructure/rooms-config.ts` — Room registry at `~/.akashik/rooms.json`
- `src/cli/commands/init.ts` — Interactive room seeding wizard (prompts via readline)
- `src/cli/commands/room.ts` — list / create / switch / current / describe
- Update `sources add` to validate that the room exists in the registry
- Update MCP tools: add `room_create`, `room_list` tools
- Test: `tests/phase4.rooms.test.ts`

### Phase 5 — CLI Search + Reports

**Commands:** `akashik ask "<query>"`, `akashik report [date] [--room R]`

**Goal:** Query the graph from the terminal without Claude Code, and generate human-readable daily/weekly reports.

**Deliverables:**
- `src/cli/commands/ask.ts` — Semantic search + formatted context output to stdout
- `src/cli/commands/report.ts` — Generate markdown report: new nodes, tunnel candidates, god nodes, community shifts
- `src/application/report.ts` — Report generation use case (loads graph, computes delta since last report, formats)
- Report persistence at `~/.akashik/reports/<room>/<date>.md`
- Test: `tests/phase5.ask.test.ts`, `tests/phase5.report.test.ts`

### Phase 6 — Daemon + Discovery

**Commands:** `akashik daemon start|stop|status`, `akashik discover [--room R]`

**Goal:** Set-and-forget. The daemon runs `triggerRoom` on a configurable schedule, rotates through rooms, writes reports, and surfaces new content without manual intervention. Discovery mode expands the source list by finding new feeds/queries within a room's topic area.

**Deliverables:**
- `src/daemon/loop.ts` — setInterval-based loop with PID file, round-robin rooms, configurable interval
- `src/daemon/discovery.ts` — Given a room's keywords and existing sources, suggest new sources (search RSS aggregators, arxiv categories, HN tags)
- `src/cli/commands/daemon.ts` — start / stop / status
- `src/cli/commands/discover.ts` — one-shot discovery run
- Config integration: read daemon settings from `~/.akashik/config.yaml` (add `yaml` dep)
- Test: `tests/phase6.daemon.test.ts`

### Phase 7 — Telegram Bridge

**Commands:** `akashik telegram setup|test|capture-start|digest-test`

**Subphases (from config.yaml):**
- **7a — Outbound digests:** After each daemon iteration, send a summary to Telegram (one message per room, top-N new items)
- **7b — Inbound capture:** Forward any link to the bot → auto-ingest into the best-matching room. Follows references (max_depth), OCR images, vision fallback for screenshots
- **7c — Inbound commands:** Query from your phone: `ask`, `report`, `trigger`, `status`, `rooms`, `pending`

**Deliverables:**
- `src/telegram/bot.ts` — Telegram Bot API client (long-polling, no webhook)
- `src/telegram/capture.ts` — URL → ingest pipeline, room classification, reference following
- `src/telegram/digest.ts` — Post-iteration summary formatting + send
- `src/telegram/commands.ts` — Inbound command routing
- `src/cli/commands/telegram.ts` — setup (interactive token + chat_id), test, capture-start
- Test: `tests/phase7.telegram.test.ts` (mock bot API)

## Status

| Phase | Status | Commits | Tests |
|-------|--------|---------|-------|
| 0 | done | `3d298bf` | — |
| 1 | done | `7548d92` `d053264` `b4365b3` | 1 |
| 2 | done | `db22615` | 14 |
| 3 | done | `1efbbb4` | 1 |
| 4 | next | — | — |
| 5 | planned | — | — |
| 6 | planned | — | — |
| 7 | planned | — | — |

## Principles

- **DDD + functional:** pure domain, ports + adapters infra, neverthrow Result chains
- **Research before picking libs:** verify on ossinsight / gh API / star-history, not generic web search
- **Right tool for the job:** hand-roll when the dep is heavier than the function (chunker, RSS normaliser)
- **Three new deps max per phase:** keep the dependency surface tight
- **Test at least 3 items:** catches the eager-sequence race on shared state

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


codex
The canonical docs already show the mismatch: README and Akashik plan are current, while `docs/product/ROADMAP.md` still describes a Claude Code plugin and Telegram capture product. I’m checking whether code/tests still back the new federation thesis or mainly preserve the older personal-memory stack.
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
/bin/zsh -lc "sed -n '1,220p' .planning/phases/phase-21/21-CONTEXT.md" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
# Phase 21: Long-Term Memory + Cross-Encoder Rerank — Context

**Gathered:** 2026-05-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Long-term agent memory plus a precision lift on the existing hybrid
search. Two concerns, one phase because they share infrastructure
(SummariserProvider port, retention math, audit log).

What ships:

1. **Cross-encoder reranker** on top of the existing dense+BM25+RRF
   pipeline (Phase 23). Xenova quantised `ms-marco-MiniLM-L-6-v2`,
   top-20 window, env-gated. Expected lift: +2–4 NDCG@10 points based
   on standard ms-marco-MiniLM-L-6 benchmarks.

2. **Three new long-term memory tiers** mapped onto our existing URI
   schemes: `session://` (episodic), `synthesis://` (semantic),
   `decision://` (procedural). Auto-promotion from raw observations
   driven by a scheduled consolidate-tick. Privacy boundary:
   episodic stays local, semantic + procedural ship to `toolshed`.

3. **Bayesian reliability** on procedural memories — Beta(α,β)
   counters updated from user feedback, selection by expected utility
   (MACLA paper, arxiv 2512.18950). Replaces flat "tier weight" idea.

4. **Auto-forget tick** — TTL expiry, Jaccard-cluster contradiction
   detection, low-importance pruning. Local-only — never propagates
   delete across the mesh.

Not in scope this phase: GSW-style entity-summary retrieval (Phase C
in the planning doc, lands as Phase 22). The router decision between
hybrid-RRF and GSW lives in Phase 22.

</domain>

<decisions>
## Implementation Decisions

### Cross-encoder reranker

- Lazy-loaded singleton via `@xenova/transformers` (already a dep).
- Model: `Xenova/ms-marco-MiniLM-L-6-v2`, quantised, CPU-only.
- Top-20 window — head reranked, tail untouched, concatenated.
- Env flag: `AKASHIK_RERANK=1`. Off by default; falls open
  (returns input unchanged) on model-load failure.
- Module: `infrastructure/cross-encoder.ts`. Pure scoring math in
  `domain/cross-rerank.ts`.
- Hook point: `application/ask.ts:357`, after `searchByRoomHybrid`
  returns and before recency-rerank + PPR. The cross-encoder lifts
  precision on the head; recency + PPR keep the long-tail policy.

### Long-term memory tier schema

URI scheme → tier mapping (no schema migration — these prefixes
already pass `OPAQUE_INTERNAL_PREFIXES` in `internal-schemes.ts:50-51`):

| URI prefix | Tier | Who writes |
|---|---|---|
| `session://<sid>` | Episodic | consolidate-tick at SessionEnd |
| `synthesis://<topic-slug>` | Semantic | consolidate-tick on 6h schedule when concept cluster threshold met |
| `decision://<workflow-slug>` | Procedural | consolidate-tick when recurring pattern detected (≥2 sessions) |

Each tier node carries extended metadata on top of the existing
`GraphNode`:

```ts
// pure domain — no I/O
interface TierMetadata {
  readonly tier: 'episodic' | 'semantic' | 'procedural';
  readonly strength: number;         // [0,1] retention salience
  readonly accessCount: number;      // for retention reinforcement
  readonly lastAccessedAt: string;   // ISO
  readonly forgetAfter?: string;     // ISO, optional TTL
  readonly sources: readonly string[]; // observation node IDs this tier rolled up
  readonly version: number;          // monotonic; new version supersedes old
  readonly supersedes?: readonly string[]; // parent versions
  // procedural-only
  readonly beta?: { alpha: number; beta: number }; // reliability counter
}
```

Persisted as JSON on the existing graph node `extra` field — no
table-schema migration.

### SummariserProvider port

Mirrors `Embedder` (`infrastructure/embedders.ts:29`):

```ts
export interface SummariserProvider {
  summarise(
    system: string,
    user: string,
    opts?: { maxTokens?: number; timeoutMs?: number },
  ): ResultAsync<string, SummariserError>;
}
```

Default impl: small local instruct model via `@xenova/transformers`
(quantised). Specific candidate: `Xenova/Phi-3.5-mini-instruct` or
similar < 4 GB quantised. Falls open with a deterministic
fixture-summariser when local model unavailable, so dev environments
don't break.

BYO options via env (mirror existing pattern):
- `OPENAI_API_KEY` → `gpt-4o-mini`
- `ANTHROPIC_API_KEY` → `claude-haiku-4-5-20251001`
- `GEMINI_API_KEY` → `gemini-2.0-flash`

Provider selection in `infrastructure/summariser-factory.ts`.

### Retention scoring (domain)

Pure function, no I/O:

```
retention(node) = clip(0, 1,
    salience(node) · exp(-λ · daysSince(createdAt))
  + σ · Σ(1 / daysSinceAccess(t)) for t in recentAccesses)
```

Defaults: λ = 0.01, σ = 0.3.
Tier thresholds: hot ≥ 0.7, warm ≥ 0.4, cold ≥ 0.15.

Salience component: tier-aware base + access-count bonus.

```
salience(node) = baseSalienceForTier(tier)
               + min(0.2, accessCount × 0.02)
```

Tier base table: procedural 0.85, semantic 0.75, episodic 0.5,
observation 0.3.

### Bayesian reliability (procedural only)

Each `decision://` node carries `beta: { alpha, beta }`. On user
feedback (thumb-up via existing audit-log path):
```
α ← α + y       where y ∈ {0, 1}
β ← β + (1 − y)
```

Expected-utility selection (MACLA Eq. 4):
```
EU(proc | query) = sim(q, proc) · α/(α+β) · R_max
                 − risk(proc) · β/(α+β) · C_fail
                 + λ_info · H[Beta(α, β)]
```

Defaults: R_max = 1, C_fail = 0.5, λ_info = 0.1. Risk fixed at 1 in
Phase 21 (Phase 22 will derive risk per procedure).

### Consolidate-tick + write-time gate

- Schedule: registered with `daemon/loop.ts` ticker, same place as
  source adapters. Episodic on SessionEnd hook. Semantic +
  procedural every 6 h. Decay pass every 24 h.
- Write-time gate (arxiv 2603.15994) is a pure-domain filter that
  runs before promotion:
  - Drop observations with importance ≤ 2.
  - Drop observations that contradict an existing semantic node
    with strength ≥ 0.8 (Jaccard ≥ 0.9 on token sets).
  - Drop observations failing schema check (no concepts, no entity
    mentions).
- MAX_LLM_CALLS_PER_TICK = 10. Same budget as agentmemory. Prevents
  runaway summariser cost.

### Auto-forget tick

- TTL expiry: any node with `forgetAfter` in the past is hard-deleted
  locally. Audit-logged.
- Contradiction: Jaccard ≥ 0.9 on shared-concept clusters. Older
  node marked `isLatest = false`. Never deleted; just demoted.
- Low-importance: observations ≥ 180 days old AND importance ≤ 2.
- All cross-peer effects local-only — touch protocol just stops
  returning the demoted node.

### Cross-peer contradiction surface

Federated search hits include a `contradicts?: string[]` field
listing local node IDs the peer hit disagrees with. Statusline gets
a contradiction count; new CLI `akashik contradictions
{list,resolve}`.

</decisions>

<scope>
## Scope

In:
- domain/cross-rerank.ts, domain/long-term-memory.ts,
  domain/retention.ts, domain/consolidation.ts,
  domain/contradiction.ts
- infrastructure/cross-encoder.ts, infrastructure/summariser.ts,
  infrastructure/summariser-factory.ts
- application/hybrid-rerank.ts, application/consolidate-tick.ts,
  application/auto-forget-tick.ts
- daemon/loop.ts edits — register new ticks
- mcp/server.ts edits — expose `consolidate` + `forget` tools
- CLI: `akashik gc`, `akashik contradictions`

Out:
- GSW entity-summary retrieval (Phase 22)
- Per-procedure risk derivation (Phase 22)
- Multi-tenant team memory
- Image-memory consolidation

</scope>

<status>
## Status — 2026-05-19

Shipped this turn:

- `src/domain/cross-rerank.ts` + `src/infrastructure/cross-encoder.ts`

exec
/bin/zsh -lc "sed -n '1,220p' .planning/phases/phase-23/23-CONTEXT.md" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
# Phase 23: Unified Memory Benchmark — Context

**Gathered:** 2026-05-19
**Status:** Researching → Building

<domain>
## Phase Boundary

Establish a strict, reproducible benchmark suite for the long-term
memory work shipped in Phase 21/22. The deliverable is a single
`akashik bench memory` command (and matching `npm test` entry)
that runs every dimension and emits one JSON report.

The benchmark is the **acceptance contract** for any future memory
change — a PR that adds a tier, a router, or a retention tweak must
not regress the report. Trip-wire ratchets, not narrative claims.

</domain>

<survey>
## Memory benchmark landscape (May 2026)

| Benchmark | Year / venue | Task | Queries | Metric | Public runner | What it stresses |
|---|---|---|---|---|---|---|
| BEIR SciFact | 2021 | scientific-claim retrieval | 300 | NDCG@10 | yes (Python + ours TS) | bi-encoder precision over noisy distractors |
| HotpotQA | 2018 | multi-hop QA | 7,405 dev | EM/F1 + R@k | yes | bridging facts across 2 paragraphs |
| MuSiQue | 2022 | multi-hop QA | 4,847 | F1 | yes | 2–4-hop bridging w/ adversarial distractors |
| MS-MARCO Passage | 2018 | passage retrieval / rerank | 6,980 dev | MRR@10 | yes | cross-encoder reranking ceiling |
| LongMemEval-S | ICLR 2025 | conversational long-term memory | 500 | QA correctness (GPT-4o judge) | yes (Python) | 5 abilities: info-extract / multi-session / temporal / knowledge-update / abstention. ~115k tokens of history per Q, ~40 sessions |
| LongMemEval-M / Oracle | ICLR 2025 | same | 500 | same | yes | longer haystacks (500 sessions/Q), or oracle evidence |
| LoCoMo | EMNLP 2024 (arxiv 2402.17753) | very long conversational memory | ~600 turns × 32 sessions/dialogue | F1 + LLM-as-Judge | yes | weeks/months horizon; factual recall + temporal + causal |
| Ep-Bench | arxiv 2511.07587 (GSW paper) | episodic memory for RAG | 100k–1M tokens corpora | task-specific accuracy | partial | space-time-anchored narrative tracking |
| RAGBench | 2024 | RAG quality across 12 datasets | aggregate | TRACe metrics | yes | retrieval + generation joint |

**Documented SOTA points worth citing:**
- mem0 / Letta / LangMem evaluated on LoCoMo in the Mem0 ECAI 2025
  paper. Human ceiling F1 87.9, GPT-4 32.1, mem0/Letta/Zep at varying
  points between.
- agentmemory claims 95.2% R@5 on LongMemEval-S.
- ByteRover claims 92.8% top-market accuracy + 1.6s latency on
  LongMemEval-S.
- GSW (arxiv 2511.07587) +20% on Ep-Bench over RAG baselines, −51%
  query tokens.

**Gaps no public benchmark covers cleanly:**
1. **Tier-promotion accuracy** — does the system correctly classify a
   raw observation into observation / episodic / semantic / procedural?
2. **Bayesian reliability calibration** — does Beta(α,β) on procedural
   memories converge on the true success rate over a feedback stream?
3. **Auto-forget precision/recall** — are demoted nodes actually the
   stale / contradicted / TTL-expired ones?
4. **Retention-band calibration** — does our 0.7/0.4/0.15 hot/warm/cold/
   frozen banding match a human "should I keep this" judgement?
5. **Write-time gate quality** — does the gate's drop-reason mirror a
   manually-labelled "should this have been promoted" set?

These five are the **akashik-specific** axes — no public benchmark
hits them because they're internal to the tier-management pipeline.
They have to be synthetic, but the synthetic harness can be small,
deterministic, and shared into the repo so anyone can run it.
</survey>

<decisions>
## Implementation Decisions

### Three benchmark families, one runner

**A. Public benchmarks (re-implemented with our retrieval stack):**

| Suite | Subset | Where | Acceptance gate |
|---|---|---|---|
| BEIR SciFact | full dev (300q × 5183 docs) | `tests/bench-real.test.ts` (already wired) | NDCG@10 ≥ 0.75 (current 0.7522) |
| HotpotQA-style multi-hop | curated 20-query subset | `tests/bench-standard.test.ts` (already wired) | R@5 ≥ 0.80 |
| LongMemEval-S (oracle split) | full 500 questions | NEW `tests/bench-longmemeval.test.ts` | Recall@5 ≥ 0.75 on the retrieval-only sub-evaluator (we skip the GPT-4o judge because it's not deterministic / costs money) |
| LoCoMo factual recall | 50-question subset | NEW `tests/bench-locomo.test.ts` | F1 ≥ 0.50 on factual-recall split (no LLM judge) |

We omit:
- Ep-Bench full (no clean public TS-portable runner; GSW path is
  Phase 24's job and they have their own internal eval)
- MS-MARCO full (300+ GB; we use the ms-marco-MiniLM cross-encoder
  output indirectly via the rerank-on-BEIR signal)
- RAGBench full (needs a generation step we don't own)

**B. Akashik-specific synthetic benchmarks** — the five gap-axes
above. Each gets a labelled fixture + a pure-domain scorer:

| Axis | Fixture | Metric |
|---|---|---|
| Tier-promotion accuracy | 200 hand-labelled URIs spanning all four tiers | Macro F1 of `tierForUri` |
| Bayesian calibration | 1000-step synthetic feedback stream with known success rate p ∈ {0.2, 0.5, 0.8} | mean abs error \|α/(α+β) − p\| after step 1000 |
| Auto-forget precision | 50-node graph w/ 20 staged stales | precision + recall of demoted set vs ground truth |
| Retention-band calibration | 60 labelled "human verdict" rows (keep / discard / unsure) | accuracy + confusion matrix on band ↔ verdict mapping |
| Write-time gate | 100 hand-labelled candidates (promote / drop) | precision + recall of `partitionByGate` against labels |

**C. Composite score** — single number per run, transparent formula:

```
wi_memory_score =
    0.25 · NDCG@10(BEIR SciFact)
  + 0.15 · R@5(HotpotQA-style)
  + 0.20 · R@5(LongMemEval-S oracle)
  + 0.10 · F1(LoCoMo factual subset)
  + 0.10 · F1(tier promotion)
  + 0.05 · (1 − betaError)
  + 0.05 · F1(auto-forget)
  + 0.05 · accuracy(retention band)
  + 0.05 · F1(write gate)
```

Total weight = 1.0. Acceptance gate for a PR: composite must not drop
> 1 point absolute (no narrative excuses).

### Runner shape

- One driver under `src/cli/commands/bench.ts` (NEW): subcommand
  `akashik bench memory [--suite <name>] [--json]`.
- Each suite is a TS file under `tests/bench-*.test.ts` so `npm test`
  picks them up automatically AND they can be invoked standalone via
  the CLI driver.
- Suite outputs a typed `BenchSuiteReport`:
  ```ts
  interface BenchSuiteReport {
    suite: string;
    metrics: Record<string, number>;
    perQuery: ReadonlyArray<{ id: string; metric: string; value: number }>;
    elapsedMs: number;
    rev: string;  // git SHA at run time
  }
  ```
- Composite runner aggregates suite reports + emits
  `~/.akashik/bench-memory-<ISO>.json` plus a one-line summary
  to stdout.

### Reproducibility

- Embedder pinned to `Xenova/all-MiniLM-L6-v2` (fp32, mean pooling) for
  all runs — published model variant, no quantisation drift.
- Cross-encoder pinned to `Xenova/ms-marco-MiniLM-L-6-v2` (quantised
  is fine here — only the head is reranked).
- Random seeds fixed where applicable (Beta calibration uses a fixed
  RNG seed).
- LongMemEval test set is HF-hosted at
  `xiaowu0162/longmemeval-cleaned`. We pull `longmemeval_oracle.json`
  on first run, cache under `~/.akashik/bench-cache/`.
- LoCoMo subset is hand-extracted from arxiv 2402.17753's released
  dataset (50 factual-recall pairs). Vendored under `tests/fixtures/`.

### What we explicitly do NOT do

- No GPT-4o-as-judge step. Non-deterministic + costs money + needs an
  API key. We score retrieval correctness instead — the answer is
  "did the system surface the source session", not "did it write a
  good answer paragraph". This is a stricter floor: if retrieval is
  bad, generation can't recover.
- No corpora that require online API access at run time. All test
  data either ships in-repo or downloads to `~/.akashik/
  bench-cache/` on first use.
- No leakage of test data into the prefetch cache. Bench mode sets
  `AKASHIK_BENCH=1` which disables the auto-save hook.

</decisions>

<scope>
## Scope

In:
- `src/cli/commands/bench.ts` — driver subcommand
- `src/domain/bench-types.ts` — typed report shapes
- `tests/bench-longmemeval.test.ts` — LongMemEval-S oracle adapter
- `tests/bench-locomo.test.ts` — LoCoMo factual-recall subset
- `tests/bench-tier-promotion.test.ts` — tier-classification F1
- `tests/bench-beta-calibration.test.ts` — Bayesian convergence
- `tests/bench-auto-forget.test.ts` — already exists, extend
- `tests/bench-retention-band.test.ts` — human-verdict calibration
- `tests/bench-write-gate.test.ts` — gate precision/recall
- `tests/fixtures/bench-memory/*.json` — synthetic + vendored data
- `docs/product/BENCHMARKS.md` — update with new suite + composite formula

Out:
- Ep-Bench full implementation (Phase 24 with GSW)
- MS-MARCO full retrieval (we score it indirectly via rerank lift)
- RAGBench (no generation step in scope)
- A web dashboard for trend tracking (Phase 25)

</scope>

<acceptance>
## Acceptance criteria

1. `akashik bench memory --json` exits 0 and emits a valid
   `BenchSuiteReport[]` plus a composite score.
2. Composite score on the current main branch is documented in
   `docs/product/BENCHMARKS.md`.
3. Every suite has a CI mode that runs in <30 s (subset). Full mode
   is allowed to take longer.
4. No suite depends on external API access at run time once the
   cache is warm.
5. The 4 pre-existing test failures (Phase 17/20/35 stale assertions)
   are not made worse.

</acceptance>

exec
/bin/zsh -lc "sed -n '1,200p' tests/bench-akashik-federation.test.ts" in /Users/saharbarak/personal/akashik
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

exec
/bin/zsh -lc "sed -n '1,200p' tests/bench-real.test.ts" in /Users/saharbarak/personal/akashik
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

exec
/bin/zsh -lc "sed -n '1,220p' src/application/federated-search.ts" in /Users/saharbarak/personal/akashik
exec
/bin/zsh -lc "sed -n '1,220p' tests/bench-standard.test.ts" in /Users/saharbarak/personal/akashik
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
/bin/zsh -lc "rg -n \"\\.claude-octopus|AKASHIK_BENCH_PUBLIC_REAL|storybrand|akashik|Akashik\" -g '"'!node_modules'"' -g '"'!dist'"' ." in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
./src/domain/federation-sim.ts:2: * Phase 24 (Akashik) — federation simulator (pure domain).
./src/domain/federation-sim.ts:6: * **AkashikBench-F** is the only benchmark that can falsify or
./src/domain/federation-sim.ts:360: * core operational claim of the Akashik mechanism.
./src/domain/metrics.ts:13: *   - `akashik metrics` IPC command returns a JSON snapshot.
./src/domain/bench-types.ts:42: *   - 0.10 tier-promotion F1 — akashik-specific
./src/domain/release.ts:4: * A release manifest published by the akashik project is a JSON
./src/domain/release.ts:161:  const message = new TextEncoder().encode(`akashik-release:v1:${canonicalManifestJSON(manifest)}`);
./src/domain/log-event.ts:4: * Every observable behavior on a akashik node is one of these
./src/domain/log-event.ts:143: * One-line human-readable rendering for `akashik logs tail`.
./src/domain/recency-rerank.ts:98: * (eventually) by `akashik ask --explain`.
./src/domain/peer-telemetry.ts:2: * Peer-pull telemetry — the record emitted every time akashik
./src/domain/job.ts:3: * and the `akashik jobs` CLI surface. The queue itself + the
./src/domain/job.ts:64: * Project ingest — what `akashik this` actually wants. Runs the
./src/domain/job.ts:68: * from the room+root inputs, mirroring `akashik index`.
./src/domain/llm-extractor.ts:12: *   1. retrieve top-k via akashik
./findings.md:3:This synthesis evaluates 2024-2026 retrieval techniques against the strict constraints of the `akashik` pipeline (CPU-only, ARM Hetzner CAX11 4GB, TypeScript + transformers.js + sqlite-vec), specifically targeting the 10-13pp loss in multi-session and temporal-reasoning questions on LongMemEval-S.
./src/domain/hot-cache.ts:6: * `~/.akashik/hot.md`. A new Claude session reads hot.md at
./src/domain/hot-cache.ts:127:  lines.push('generator: akashik');
./src/domain/hot-cache.ts:164:  lines.push(`_Generated by akashik. Reload with \`akashik hot --refresh\`._`);
./src/domain/system-rooms.ts:2: * System-managed rooms — the out-of-the-box rooms every akashik
./src/domain/system-rooms.ts:19: *    A git commit tagged `room: akashik-dev` is STILL in toolshed.
./src/domain/system-rooms.ts:38: * opt-in for P2P sharing via the interactive `akashik share` TUI.
./src/domain/graph.ts:2: * Pure domain model for the akashik knowledge graph.
./src/domain/graph.ts:43:/** akashik-added optional fields. Declared in graphify.validate.OPTIONAL_NODE_FIELDS. */
./src/domain/bloom.ts:2: * Pure Bloom filter — the primitive behind akashik v3's
./src/domain/entity.ts:60:  /** Optional human note shown in `akashik entity list`. */
./src/cli/ipc-client.ts:6: * Mirrors the wire format used in bin/akashik.js but lives in
./src/cli/ipc-client.ts:18:import { akashikHome } from './runtime.js';
./src/cli/ipc-client.ts:33:    const sockPath = join(akashikHome(), 'daemon.sock');
./src/domain/save-note.ts:2: * save-note — pure helpers for the `akashik save` command.
./src/domain/save-note.ts:72:    source_file: 'akashik:save',
./src/domain/identity.ts:4: * This module owns the pure domain layer for akashik's three-tier
./src/domain/identity.ts:508: *   `akashik-auth:v1:{device_id}:{hex(device_pub_key)}:{authorized_at}`
./src/domain/identity.ts:510: * The leading domain-separation tag (`akashik-auth:v1:`) prevents
./src/domain/identity.ts:520:  const s = `akashik-auth:v1:${deviceId}:${hex}:${authorizedAt}`;
./src/domain/identity.ts:526: *   `akashik-sig:v1:{device_id}:{signed_at}:{canonical_json(payload)}`
./src/domain/identity.ts:536:    const s = `akashik-sig:v1:${deviceId}:${signedAt}:${json}`;
./src/domain/internal-schemes.ts:3: * non-http/https URI prefixes akashik recognises as legitimate
./src/domain/internal-schemes.ts:44:  // User-saved typed notes via `akashik save --type ...`. These
./src/domain/errors.ts:2: * Domain errors for the akashik knowledge graph.
./src/domain/errors.ts:272: *   - SessionStateFileError  — ~/.akashik/sessions-state.json read/write/parse failure
./src/domain/errors.ts:568:        ? 'fix: run `akashik trigger` to populate the graph (this is normal on first run).'
./src/domain/errors.ts:569:        : 'fix: run `akashik doctor --fix` and check the file is readable.';
./src/domain/errors.ts:571:      return `fix: graph file is corrupted at ${e.path}. Restore from backup or move it aside and run \`akashik trigger\` to rebuild.`;
./src/domain/errors.ts:573:      return 'fix: check disk space and that no other akashik process is holding the write lock (`akashik doctor`).';
./src/domain/errors.ts:577:      return 'fix: run `akashik doctor --fix` to reset the sqlite-vec store, or check the file permissions on `~/.akashik/vectors.db`.';
./src/domain/errors.ts:582:      return 'fix: check network access; the embedder downloads ~90 MB on first use. Re-run `akashik doctor` to retry, or set `AKASHIK_MODEL_CACHE` to a writable directory.';
./src/domain/errors.ts:596:      return 'fix: re-check the multiaddr; for diagnostics run `akashik peer list`.';
./src/domain/errors.ts:600:      return 'fix: run `akashik identity init` to (re)create the peer identity, or `akashik identity import <hex>` to restore.';
./src/domain/errors.ts:607:      return `fix: the node was BLOCKED before reaching the network — your secret is safe locally. Either remove the credential from the source content, or move it to a non-shared room. Inspect the node with \`akashik get-node ${e.nodeId}\`.`;
./src/domain/errors.ts:610:      return `fix: review flagged nodes with \`akashik lint --room ${e.room}\` and either remove the secrets or unshare the room.`;
./src/domain/errors.ts:614:      return 'fix: run `akashik identity init` to create your DID, or `akashik onboard` to run the full setup wizard.';
./src/domain/errors.ts:617:      return 'fix: the identity chain failed to verify. If this is your own identity, `akashik identity rotate` regenerates the device key under your existing DID.';
./src/domain/errors.ts:630: *   ask: graph read error at ~/.akashik/graph.json: ENOENT
./src/domain/errors.ts:631: *     → fix: run `akashik trigger` to populate the graph (this is normal on first run).
./src/cli/index.ts:3: * akashik CLI — subcommand router.
./src/cli/index.ts:114:  // Plural-form alias: `akashik peers rep …` works as well as
./src/cli/index.ts:115:  // `akashik peer rep …`. The subcommand dispatcher handles both.
./src/cli/index.ts:120:    console.error('  usage: akashik peers rep [<peer-id>] [--subject <key>] [--json]');
./src/cli/index.ts:138:    console.error(`akashik: '${cmd}' is recognized but not yet implemented (Phase 0 scaffold).`);
./src/cli/index.ts:142:  console.error(`akashik: unknown command '${cmd}'. run 'akashik help'.`);
./src/cli/index.ts:149:    console.error('akashik: fatal error');
./src/domain/oracle.ts:96:    source_file: 'akashik:oracle',
./src/domain/oracle.ts:118:    source_file: 'akashik:oracle',
./src/cli/tui/share-picker-tty.ts:66:  const header = `${BOLD}akashik share${RESET} — toggle which physical rooms are open to peers`;
./src/cli/tui/share-picker-tty.ts:76:    : `${DIM}  (no physical rooms yet — run \`akashik trigger\` first)${RESET}`;
./src/cli/tui/share-picker-tty.ts:100: * `akashik share room <name>` command instead.
./src/cli/tui/share-picker-tty.ts:106:    throw new Error('share ui: requires a TTY. Use `akashik share room <name>` in scripts.');
./scripts/qrel-rejudge-v3.mjs:33:const CACHE_DIR = join(homedir(), '.akashik', 'bench');
./scripts/qrel-rejudge-v3.mjs:49:console.log(' akashik — SciFact qrel rejudge V2 (few-shot + CoT)');
./src/domain/touch.ts:32:export const TOUCH_PROTOCOL_ID = '/akashik/touch/1.0.0' as const;
./src/infrastructure/sessions-state.ts:3: * ~/.akashik/sessions-state.json.
./src/infrastructure/sessions-state.ts:209: * akashik processes (e.g., daemon + CLI) from racing and clobbering
./src/infrastructure/ydoc-store.ts:2: * Y.Doc binary persistence — `~/.akashik/ydocs/<room>.ydoc` files.
./bin/akashik.js:3: * akashik CLI entry (thin shim + optional IPC delegation).
./bin/akashik.js:70:const akashikHome = () =>
./bin/akashik.js:71:  process.env.AKASHIK_HOME ?? join(homedir(), '.akashik');
./bin/akashik.js:75:    const sockPath = join(akashikHome(), 'daemon.sock');
./bin/akashik.js:130:  console.error('akashik: no build output and no source found.');
./src/mcp/server.ts:2: * akashik MCP server — exposes the knowledge graph to Claude Code.
./src/mcp/server.ts:4: * Spawned by `akashik mcp start` or by Claude Code itself via
./src/mcp/server.ts:62:import { akashikHome } from '../cli/runtime.js';
./src/mcp/server.ts:72:    { name: 'akashik', version: '0.0.1' },
./src/mcp/server.ts:88:        'Semantic search over the akashik knowledge graph. Returns the top-k matches ordered by distance. Optionally filter by room.',
./src/mcp/server.ts:109:  // to ~/.akashik/prefetch-cache.jsonl, keyed by exact prompt
./src/mcp/server.ts:129:  const homeFromRuntime = (_rt: Runtime): string => akashikHome();
./src/mcp/server.ts:166:      // answer to ~/.akashik/prefetch-cache.jsonl. When the
./src/mcp/server.ts:205:            text: `# akashik context for: ${query}\n\n${blocks.join('\n\n---\n\n')}`,
./src/mcp/server.ts:321:      const identityPath = join(akashikHome(), 'peer-identity.json');
./src/mcp/server.ts:322:      const peersPath = join(akashikHome(), 'peers.json');
./src/mcp/server.ts:323:      const configPath = join(akashikHome(), 'config.yaml');
./src/mcp/server.ts:369:        // "akashik actually went to the network and here's what
./src/mcp/server.ts:444:        'in that case the agent should fall back to `ask` or suggest `akashik entity add <name>`.',
./src/mcp/server.ts:454:      const registry = fileEntityRegistry(join(akashikHome(), 'entities.json'));
./src/mcp/server.ts:467:            hint: `No entity registered for "${name}". Register one with \`akashik entity add "${name}"\`, or run an ingest — heuristic detection picks up CamelCase identifiers and URL hosts automatically.`,
./src/mcp/server.ts:492:  // Cross-peer entity recall via the /akashik/recall/1.0.0
./src/mcp/server.ts:514:      const cfgRes = await loadConfig(join(akashikHome(), 'config.yaml'));
./src/mcp/server.ts:516:      const idRes = await loadOrCreateIdentity(join(akashikHome(), 'peer-identity.json'));
./src/mcp/server.ts:523:        peersPath: join(akashikHome(), 'peers.json'),
./src/mcp/server.ts:528:        const peersRes = await loadPeers(join(akashikHome(), 'peers.json'));
./src/mcp/server.ts:731:  // Phase 19 — 15th MCP tool. Queries ~/.akashik/code-graph.db independently
./src/mcp/server.ts:739:        'Query the structured code graph (Phase 19). Returns code nodes (classes, functions, methods, interfaces, types, imports, exports) from indexed codebases. SEPARATE from `search` / `ask` — those query research content (ArXiv, HN, RSS, etc.). This tool queries the structured code graph stored in ~/.akashik/code-graph.db, built by `akashik codebase index <path>`. Supports filtering by codebase id, node kind, and name substring.',
./src/mcp/server.ts:856:        'broader federation of akashik peers to help answer a question ' +
./src/mcp/server.ts:868:        join(akashikHome(), 'peer-identity.json'),
./src/mcp/server.ts:915:        join(akashikHome(), 'peer-identity.json'),
./src/mcp/server.ts:1025:      const selfRes = await loadOrCreateIdentity(join(akashikHome(), 'peer-identity.json'));
./src/infrastructure/touch-protocol.ts:2: * Touch protocol — `/akashik/touch/1.0.0`.
./src/infrastructure/touch-protocol.ts:193:    // name (e.g. `akashik share room research`), include nodes
./src/cli/commands/save.ts:2: * `akashik save --room R [--type T] --label X [--text Y]`
./src/cli/commands/save.ts:11: *   akashik save --room project --type concept --label "Touch primitive" \
./src/cli/commands/save.ts:14: *   echo "long body..." | akashik save --room project --type synthesis --label "..."
./scripts/qrel-rejudge-v2.mjs:33:const CACHE_DIR = join(homedir(), '.akashik', 'bench');
./scripts/qrel-rejudge-v2.mjs:49:console.log(' akashik — SciFact qrel rejudge V2 (few-shot + CoT)');
./src/cli/commands/update.ts:2: * `akashik update <sub>` — auto-update CLI surface.
./src/cli/commands/update.ts:16: *      the install (npm update -g akashik, brew upgrade, etc.) — the
./src/cli/commands/update.ts:27:import { akashikHome } from '../runtime.js';
./src/cli/commands/update.ts:50:    console.error('  example: akashik update configure \\');
./src/cli/commands/update.ts:52:    console.error('             --url https://releases.akashik.dev/latest.json');
./src/cli/commands/update.ts:65:  const r = await configureUpdates(akashikHome(), {
./src/cli/commands/update.ts:80:  console.log(`  auto-check:          disabled (run 'akashik update enable-auto' to turn on)`);
./src/cli/commands/update.ts:88:  const r = await checkForUpdate(akashikHome(), v);
./src/cli/commands/update.ts:113:  console.log(`  npm update -g akashik   # if installed via npm`);
./src/cli/commands/update.ts:121:  const cfg = await loadUpdateConfig(akashikHome());
./src/cli/commands/update.ts:127:    console.log('not configured (run `akashik update configure --did ... --url ...`)');
./src/cli/commands/update.ts:130:  const state = await loadUpdateState(akashikHome());
./src/cli/commands/update.ts:147:  const cfg = await loadUpdateConfig(akashikHome());
./src/cli/commands/update.ts:150:    console.error('not configured. run: akashik update configure --did ... --url ...');
./src/cli/commands/update.ts:153:  const r = await configureUpdates(akashikHome(), { ...cfg.value, auto_check_enabled: enabled });
./src/cli/commands/update.ts:160:  console.log('usage: akashik update <sub>');
./src/infrastructure/x-client.ts:6: * ~/.akashik/x-token.json, refreshes automatically.
./src/infrastructure/x-client.ts:63:  console.log('\nOpen this URL in your browser to authorize akashik:\n');
./src/infrastructure/x-client.ts:103:        res.end('<h2>akashik authorized. You can close this tab.</h2>');
./Dockerfile:19:ENTRYPOINT ["node", "bin/akashik.js"]
./NEXT_STEPS.md:1:# akashik Next Steps
./NEXT_STEPS.md:3:This is the execution README for getting akashik closer to SOTA as a
./NEXT_STEPS.md:14:akashik should make this demo feel inevitable:
./NEXT_STEPS.md:18:3. akashik retrieves the trusted peer memory before web search.
./NEXT_STEPS.md:85:- `akashik-rs/src/bin/akashik_cli.rs`
./NEXT_STEPS.md:86:- `bin/akashik.js`
./NEXT_STEPS.md:160:akashik changes agent behavior.
./NEXT_STEPS.md:229:akashik is ready to claim category leadership when:
./scripts/bench-matryoshka.mjs:64:const CACHE_ROOT = join(homedir(), '.akashik', 'bench');
./scripts/bench-matryoshka.mjs:81:console.log(` akashik — Matryoshka truncation gate`);
./src/cli/commands/swarm.ts:2: * `akashik swarm` — Phase 3 of the P2P scale plan.
./src/cli/commands/swarm.ts:7: *     Generates ~/.akashik/swarm-corpus.jsonl with N synthetic
./src/cli/commands/swarm.ts:35:import { defaultRuntime, akashikHome } from '../runtime.js';
./src/cli/commands/swarm.ts:229:  let seed = 'akashik-swarm-default';
./src/cli/commands/swarm.ts:246:  const home = akashikHome();
./src/cli/commands/swarm.ts:311:  console.log(`Next: \`akashik swarm sim\` to start the responder.`);
./src/cli/commands/swarm.ts:328:  const home = akashikHome();
./src/cli/commands/swarm.ts:332:    console.error(`  run \`akashik swarm gen --count 100\` first.`);
./src/cli/commands/swarm.ts:351:  console.log(`          akashik daemon start`);
./src/cli/commands/swarm.ts:365:    console.log('usage: akashik swarm <gen|sim> [flags]');
./src/cli/commands/swarm.ts:369:    console.log('    ~/.akashik/swarm-corpus.jsonl. Adversarial peers');
./src/cli/commands/swarm.ts:374:    console.log('    synthetic gossip responses on /akashik/search-resp');
./src/infrastructure/rust-retrieval.ts:3: * akashik-rs `embed_server` binary for the non-embedder ops:
./src/infrastructure/rust-retrieval.ts:66: * Tunnel in akashik's domain shape — a semantic bridge between
./src/infrastructure/rust-retrieval.ts:119:   * `akashik-rs/target/release/embed_server`; override via
./src/infrastructure/rust-retrieval.ts:131:  return join(here, '..', '..', 'akashik-rs', 'target', 'release', 'embed_server');
./scripts/bench-ppr.mjs:38:const CACHE_ROOT = join(homedir(), '.akashik', 'bench');
./scripts/contextualize-corpus.mjs:10:// at ~/.akashik/bench/<output_dataset>/<output_dataset>/ along
./scripts/contextualize-corpus.mjs:40:const CACHE_ROOT = join(homedir(), '.akashik', 'bench');
./scripts/contextualize-corpus.mjs:220:console.log(`  AKASHIK_RUST_BIN=$(pwd)/akashik-rs/target/release/embed_server \\`);
./CLAUDE.md:248:<!-- akashik:start -->
./CLAUDE.md:250:# akashik
./CLAUDE.md:251:akashik is a knowledge-graph-first research layer with P2P
./CLAUDE.md:266:  akashik — zero overhead, zero noise.
./CLAUDE.md:282:Two canonical rooms every akashik peer advertises out of the box:
./CLAUDE.md:291:`akashik save`: a URL-sourced save lands in `research`
./CLAUDE.md:306:- If the hit is older, prefer a fresh pull — `mcp__akashik__trigger_room`
./CLAUDE.md:311:## When to invoke akashik
./CLAUDE.md:320:   already indexed?" question, call the akashik MCP tools
./CLAUDE.md:331:   the statusline panel and the `akashik metrics bypass` audit,
./CLAUDE.md:345:6. **Save synthesized insights with `akashik save --type
./CLAUDE.md:356:   a refresh via `mcp__akashik__trigger_room` then retry.
./CLAUDE.md:358:<!-- akashik:end -->
./scripts/sweep-rocchio.mjs:36:const CACHE_DIR = join(homedir(), '.akashik', 'bench');
./scripts/sweep-rocchio.mjs:50:console.log(' akashik — Rocchio dense PRF on SciFact');
./src/cli/commands/onboard.ts:2: * `akashik onboard` — first-run installer + onboarding wizard.
./src/cli/commands/onboard.ts:18: * indexing is the user's intent, exposed as `akashik this`.
./src/cli/commands/onboard.ts:147:  const def = flags.home ?? process.env.AKASHIK_HOME ?? join(homedir(), '.akashik');
./src/cli/commands/onboard.ts:160:  if (chosen !== join(homedir(), '.akashik')) {
./src/cli/commands/onboard.ts:178:    sp.stop("runtime check reported issues — run 'akashik doctor --fix'");
./src/cli/commands/onboard.ts:215:        '  3. akashik login',
./src/cli/commands/onboard.ts:231:    log.message('skipped — run `akashik login` when convenient');
./src/cli/commands/onboard.ts:236:  // logic is identical to `akashik login`. One canonical path
./src/cli/commands/onboard.ts:242:    log.warn('login failed — `akashik login` to retry');
./src/cli/commands/onboard.ts:299:    "Skip if unsure; you can always run 'akashik trigger --room sessions' later.",
./src/cli/commands/onboard.ts:312:    log.message('skipped — run `akashik trigger --room sessions` when convenient');
./src/cli/commands/onboard.ts:367:        `The 'akashik trigger --room sessions' subprocess exited before the\nwizard's tail window finished. Common causes:\n  - AKASHIK_HOME mismatch (chosen home: ${home})\n  - claude_sessions source not provisioned (daemon will create it on next boot)\n  - first-run schema migration\n\nRetry manually with:\n  akashik trigger --room sessions`,
./src/cli/commands/onboard.ts:375:    `Track progress with:\n  akashik sessions status\n  tail -f ${logPath}\n\nThe daemon will pick up the new nodes once it starts.`,
./src/cli/commands/onboard.ts:453:    lines.push('  akashik peer add /ip4/<host>/tcp/<port>/p2p/<id>');
./src/cli/commands/onboard.ts:460:const USAGE = `usage: akashik onboard [--yes] [--home DIR] [--no-sessions]
./src/cli/commands/onboard.ts:467:  daemon, and prints what akashik will do on every session.
./src/cli/commands/onboard.ts:470:  run 'akashik this me' (private) or 'akashik this everyone'
./src/cli/commands/onboard.ts:481:  intro('akashik onboard');
./src/cli/commands/onboard.ts:528:      '  akashik this              index the current folder, keep it private',
./src/cli/commands/onboard.ts:529:      '  akashik this everyone     index + share with the P2P network',
./src/cli/commands/onboard.ts:530:      '  akashik ask "..."         semantic search across your graph',
./src/cli/commands/onboard.ts:531:      '  akashik trigger           refresh all rooms',
./src/cli/commands/onboard.ts:532:      '  akashik peer list         see who you talk to',
./src/cli/commands/onboard.ts:533:      '  akashik doctor            health check',
./src/cli/commands/onboard.ts:539:      "  · Stop the network at any time: akashik daemon stop",
./src/infrastructure/config-loader.ts:2: * Config loader — reads ~/.akashik/config.yaml with typed defaults.
./config/config.example.yaml:1:# akashik — example configuration.
./config/config.example.yaml:2:# Copy to ~/.akashik/config.yaml and fill in secrets.
./config/config.example.yaml:14:  cache_dir: ~/.akashik/models
./config/config.example.yaml:18:  path: ~/.akashik/graph
./config/config.example.yaml:19:  python_venv: ~/.akashik/.venv
./config/config.example.yaml:24:  path: ~/.akashik/vectors.db
./src/cli/commands/sources.ts:2: * `akashik sources <sub>` — manage the ~/.akashik/sources.json
./src/cli/commands/sources.ts:14: *   akashik sources add hn-embeddings \
./src/cli/commands/sources.ts:37:  if (args.length === 0) return 'missing <id> — usage: akashik sources add <id> --kind K --room R --config {json}';
./src/cli/commands/sources.ts:85:    console.log('no sources configured. try `akashik sources add` to create one.');
./src/cli/commands/sessions.ts:2: * `akashik sessions <sub>` — Claude session ingestion lifecycle.
./src/cli/commands/sessions.ts:14: *   2. Delete ~/.akashik/sessions-state.json
./src/cli/commands/sessions.ts:27:import { akashikHome } from '../runtime.js';
./src/cli/commands/sessions.ts:29:const sessionsStatePath = (): string => join(akashikHome(), 'sessions-state.json');
./src/cli/commands/sessions.ts:37:    console.log('  next run of `akashik trigger --room sessions` will re-ingest from offset 0.');
./src/cli/commands/sessions.ts:45:    console.error(`  'akashik trigger --room sessions' (can re-create thousands of nodes).`);
./src/cli/commands/sessions.ts:51:  const lockRes = await acquireLock(akashikHome(), {
./src/cli/commands/sessions.ts:72:    console.log('  akashik trigger --room sessions');
./src/cli/commands/sessions.ts:115:  console.log('usage: akashik sessions <sub>');
./src/cli/commands/sessions.ts:123:  console.log('~/.claude/projects/**/*.jsonl are never touched by akashik — a fresh');
./src/infrastructure/peer-store.ts:2: * Peer store — persists known peers to ~/.akashik/peers.json.
./src/infrastructure/peer-store.ts:26: * concurrent akashik processes cannot clobber each other's peer list.
./src/infrastructure/peer-store.ts:111:   *   - 'manual' : `akashik peer add <multiaddr>`
./src/infrastructure/peer-store.ts:259: * and releases the lock. Prevents two akashik processes (e.g., daemon +
./scripts/qrel-rejudge.mjs:49:const CACHE_DIR = join(homedir(), '.akashik', 'bench');
./scripts/qrel-rejudge.mjs:65:console.log(' akashik — SciFact qrel completeness audit (Round 2)');
./src/cli/commands/logs.ts:2: * `akashik logs <sub>` — local-first network telemetry surface.
./src/cli/commands/logs.ts:11: * Logs live under ~/.akashik/logs/. Shipping is opt-in; default is
./src/cli/commands/logs.ts:29:import { akashikHome } from '../runtime.js';
./src/cli/commands/logs.ts:37:  const r = await tailToday(logPaths(akashikHome()), n);
./src/cli/commands/logs.ts:53:    console.error('logs export: missing <path>. usage: akashik logs export ./welly-debug.ndjson.gz');
./src/cli/commands/logs.ts:56:  const r = await exportBundle(logPaths(akashikHome()));
./src/cli/commands/logs.ts:71:    console.error('logs enable-shipping: missing <url>. usage: akashik logs enable-shipping https://logs.example.com/ingest');
./src/cli/commands/logs.ts:78:  const r = await enableShipping(logPaths(akashikHome()), url);
./src/cli/commands/logs.ts:85:  console.log('  disable any time:  akashik logs disable-shipping');
./src/cli/commands/logs.ts:90:  const r = await disableShipping(logPaths(akashikHome()));
./src/cli/commands/logs.ts:100:  const r = await getShippingStatus(logPaths(akashikHome()));
./src/cli/commands/logs.ts:117:  const r = await rotate(logPaths(akashikHome()));
./src/cli/commands/logs.ts:127:  console.log('usage: akashik logs <sub>');
./src/cli/commands/logs.ts:136:  console.log('Logs are local-first (~/.akashik/logs/). Shipping is opt-in; nothing');
./src/cli/commands/metrics.ts:2: * `akashik metrics` — emit the daemon's live metrics snapshot.
./src/cli/commands/metrics.ts:7: * shim in `bin/akashik.js` intercepts this command BEFORE we
./src/cli/commands/metrics.ts:11: *   - the user runs `akashik metrics` with no daemon running, OR
./src/cli/commands/metrics.ts:23:const akashikHome = (): string =>
./src/cli/commands/metrics.ts:24:  process.env.AKASHIK_HOME ?? join(homedir(), '.akashik');
./src/cli/commands/metrics.ts:60: * `akashik metrics bypass [--json] [--since <iso>]`
./src/cli/commands/metrics.ts:82:  const home = akashikHome();
./src/cli/commands/metrics.ts:114:  console.log(`akashik metrics bypass (window: ${out.window_since})`);
./src/cli/commands/metrics.ts:141:  const sock = join(akashikHome(), 'daemon.sock');
./src/cli/commands/metrics.ts:144:    : 'metrics live in the daemon process. start `akashik daemon` to populate.';
./akashik-rs/src/main.rs:1://! akashik-bench — BEIR benchmark runner (CLI entry).
./akashik-rs/src/main.rs:28:use akashik_bench::application::{run_benchmark, BenchmarkConfig, BenchmarkReport};
./akashik-rs/src/main.rs:29:use akashik_bench::domain::{beir::load_beir, BeirDataset, EncoderSpec};
./akashik-rs/src/main.rs:30:use akashik_bench::infrastructure::{
./akashik-rs/src/main.rs:64:        " akashik-bench (Rust/functional/DDD) — BEIR {}",
./akashik-rs/src/main.rs:145:    let bench_root = PathBuf::from(&home).join(".akashik/bench");
./src/cli/commands/mcp.ts:2: * `akashik mcp start` — start the MCP stdio server.
./src/cli/commands/discover-loop.ts:2: * `akashik discover-loop [--room R] [--max-iterations N]`
./src/cli/commands/share.ts:2: * `akashik share <sub>` — sharing boundary commands.
./src/cli/commands/share.ts:18:import { runtimePaths, akashikHome } from '../runtime.js';
./src/cli/commands/share.ts:25:const configPath = (): string => join(akashikHome(), 'config.yaml');
./src/cli/commands/share.ts:26:const sharedRoomsPath = (): string => join(akashikHome(), 'shared-rooms.json');
./src/cli/commands/share.ts:43:      'share audit: missing --room <name>. usage: akashik share audit --room <name> [--json]',
./src/cli/commands/share.ts:120:    console.error('share room: missing <name>. usage: akashik share room <name>');
./src/cli/commands/share.ts:175:    console.error(`\nrun 'akashik share audit --room ${roomId}' for full details.`);
./src/cli/commands/share.ts:202:  const ydocPath = join(akashikHome(), 'ydocs', `${roomId}.ydoc`);
./src/cli/commands/share.ts:203:  const logPath = join(akashikHome(), 'share-log.jsonl');
./src/cli/commands/share.ts:229:  console.log("  run 'akashik daemon start' (or restart it) so peers can sync this room");
./src/cli/commands/share.ts:251:    console.log('share ui: no physical rooms yet. Run `akashik trigger` to index some content first.');
./src/cli/commands/share.ts:292:      console.error(`  ${b.room}: ${b.count} flagged node(s). Run \`akashik share audit --room ${b.room}\` to inspect.`);
./src/cli/commands/share.ts:309:const USAGE = `usage: akashik share <audit|room|ui>
./scripts/sweep-rrf.mjs:9: * Data: ~/.akashik/bench/scifact__rust-via-ts__bge-base/vectors.db
./scripts/sweep-rrf.mjs:36:const CACHE_DIR = join(homedir(), '.akashik', 'bench');
./scripts/sweep-rrf.mjs:52:console.log(' akashik — RRF k + α sweep on cached SciFact');
./scripts/bootstrap.sh:3:# akashik bootstrap — sets up the per-user runtime dir, creates a
./scripts/bootstrap.sh:24:WELL_DIR="${AKASHIK_HOME:-$HOME/.akashik}"
./scripts/bootstrap.sh:28:log()  { printf '[akashik] %s\n' "$*"; }
./scripts/bootstrap.sh:29:warn() { printf '[akashik] WARN %s\n' "$*" >&2; }
./scripts/bootstrap.sh:30:die()  { printf '[akashik] FATAL %s\n' "$*" >&2; exit "${2:-1}"; }
./scripts/bootstrap.sh:68:# targets ~/.akashik/venv which is per-user cache.
./scripts/bootstrap.sh:118:print(f"[akashik] state written to {state_file}")
./scripts/bootstrap.sh:121:log "bootstrap OK — run 'akashik doctor' to verify the full stack"
./scripts/bench-arguana-dense.mjs:37:const CACHE_DIR = join(homedir(), '.akashik', 'bench');
./scripts/bench-arguana-dense.mjs:46:console.log(' akashik — ArguAna dense-only re-target gate');
./akashik-rs/src/lib.rs:1://! akashik-bench library — shared modules for the `bench_beir`
./akashik-rs/src/lib.rs:3://! embedding server consumed by the TypeScript akashik stack).
./src/infrastructure/sources/claude-sessions.ts:53:  /** ~/.akashik directory — state file is written here. */
./src/cli/commands/touch.ts:2: * `akashik touch <peer-id-or-multiaddr> --room <name> [--max N] [--dry-run]`
./src/cli/commands/touch.ts:17:import { akashikHome } from '../runtime.js';
./src/cli/commands/touch.ts:32:const identityPath = (): string => join(akashikHome(), 'peer-identity.json');
./src/cli/commands/touch.ts:33:const peersPath = (): string => join(akashikHome(), 'peers.json');
./src/cli/commands/touch.ts:34:const configPath = (): string => join(akashikHome(), 'config.yaml');
./src/cli/commands/touch.ts:35:const graphPath = (): string => join(akashikHome(), 'graph.json');
./src/cli/commands/touch.ts:46:    return 'touch: missing <peer-id-or-multiaddr>. usage: akashik touch <peer> --room <name> [--max N] [--dry-run]';
./src/cli/commands/touch.ts:82:  if (!rec || rec.addrs.length === 0) return `touch: peer '${target}' not found in peers.json (add via 'akashik peer add <multiaddr>' first)`;
./src/cli/commands/recent-sessions.ts:2: * `akashik recent-sessions` — Phase 20 CLI surface.
./src/cli/commands/recent-sessions.ts:4: * Queries ~/.akashik/graph.json for nodes in the `sessions` room,
./src/cli/commands/recent-sessions.ts:204:      'no recent sessions indexed. run `akashik daemon start` so the claude-sessions adapter can populate the graph.',
./src/cli/commands/index-project.ts:2: * `akashik index [--room R] [--root DIR]`
./src/cli/commands/consolidate.ts:2: * `akashik consolidate <sub>` — Phase 4c CLI surface for the
./src/cli/commands/consolidate.ts:21: * The CLI enforces `akashik daemon start` is NOT running with
./src/cli/commands/consolidate.ts:40:import { akashikHome } from '../runtime.js';
./src/cli/commands/consolidate.ts:68:  // entries go to an NDJSON file that `akashik sessions reingest`
./src/cli/commands/consolidate.ts:86:  if (!room) return 'missing <room>. usage: akashik consolidate run <room> [--dry-run] [--prune [--backup PATH | --no-backup]]';
./src/cli/commands/consolidate.ts:215:  const lockRes = await acquireLock(akashikHome(), {
./src/cli/commands/consolidate.ts:223:    console.error(`  retry, or run 'akashik daemon stop' to free the lock.`);
./src/cli/commands/consolidate.ts:283:      // graph nodes to an NDJSON file so `akashik sessions reingest`
./src/cli/commands/consolidate.ts:287:          ?? join(akashikHome(), `prune-backup-${parsed.room}-${Date.now()}.ndjson`);
./src/cli/commands/consolidate.ts:433:  console.log('usage: akashik consolidate <sub>');
./src/cli/commands/consolidate.ts:451:  console.log('Run consolidation while `akashik daemon` is stopped — v4.0 has no');
./src/cli/commands/consolidate.ts:481:    console.error('consolidate prune-marked: missing <room>. usage: akashik consolidate prune-marked <room> [--no-backup | --backup PATH] [--force]');
./src/cli/commands/consolidate.ts:485:  const lockRes = await acquireLock(akashikHome(), { owner: 'consolidate-prune', waitMs: 30_000, pollIntervalMs: 250 });
./src/cli/commands/consolidate.ts:516:      const path = backupPath ?? join(akashikHome(), `prune-marked-backup-${room}-${Date.now()}.ndjson`);
./scripts/bench-beir-sota.mjs:58:const CACHE_ROOT = join(homedir(), '.akashik', 'bench');
./scripts/bench-beir-sota.mjs:71:console.log(` akashik — BEIR ${DATASET.toUpperCase()} SOTA Benchmark`);
./src/cli/commands/entity.ts:2: * `akashik entity <sub>` — manage the entity registry.
./src/cli/commands/entity.ts:22:const USAGE = `usage: akashik entity <sub>
./src/cli/commands/entity.ts:83:  console.log(`run \`akashik recall ${label}\` after ingest to see hits.`);
./src/cli/commands/entity.ts:106:    console.log('add one with: akashik entity add <label> [--alias A] [--type T]');
./src/cli/commands/entity.ts:111:    console.log('add one with: akashik entity add <label> [--alias A] [--type T]');
./src/cli/commands/gc.ts:2: * `akashik gc` — long-term-memory garbage collection.
./src/cli/commands/gc.ts:111:    console.error(`  see: akashik gc help`);
./src/cli/commands/gc.ts:142:  console.log(`akashik gc — long-term memory garbage collection
./src/cli/commands/gc.ts:184:      console.error(`  see: akashik gc help`);
./src/cli/commands/eval.ts:2: * `akashik eval <queries.jsonl> [--room R] [--k 10] [--json]`
./src/cli/commands/eval.ts:66:    return 'missing queries file — usage: akashik eval <queries.jsonl> [--room R] [--k 10] [--limit N] [--json]';
./scripts/jacobi-preconditioning.mjs:36:const CACHE_DIR = join(homedir(), '.akashik', 'bench');
./scripts/jacobi-preconditioning.mjs:49:console.log(' akashik — Diagonal Jacobi preconditioning (CFD #1)');
./src/cli/commands/oracle.ts:2: * `akashik oracle <sub>` — peer-to-peer Q&A via the oracle system room.
./src/cli/commands/oracle.ts:35:import { akashikHome } from '../runtime.js';
./src/cli/commands/oracle.ts:61:  const homePath = akashikHome();
./src/cli/commands/oracle.ts:93:    pubsub.subscribe('/akashik/oracle/1.0.0');
./src/cli/commands/oracle.ts:126:    console.log(`  live:   published to /akashik/oracle/1.0.0 (${dialed} peer(s) dialed)`);
./src/cli/commands/oracle.ts:144:    console.error('oracle ask: missing question — usage: akashik oracle ask "your question" [--live]');
./src/cli/commands/oracle.ts:169:      ? '  peers subscribed to /akashik/oracle/1.0.0 get it now; others on next touch.'
./src/cli/commands/oracle.ts:200:    console.error('oracle answer: usage: akashik oracle answer <question-id> "your answer" [--confidence 0.7] [--live]');
./src/cli/commands/oracle.ts:289:    console.error('oracle show: missing question id — usage: akashik oracle show <qid>');
./src/cli/commands/oracle.ts:441:const USAGE = `usage: akashik oracle <ask|answer|list|show|answerable>
./src/cli/commands/oracle.ts:456:surface. Run \`akashik daemon start\` (or ensure peers are connected)
./src/cli/commands/cache-stats.ts:2: * `akashik cache-stats` — print L1 query cache observability.
./src/cli/commands/cache-stats.ts:15:const akashikHome = (): string =>
./src/cli/commands/cache-stats.ts:16:  process.env.AKASHIK_HOME ?? join(homedir(), '.akashik');
./src/cli/commands/cache-stats.ts:19:  // The actual IPC call is intercepted in bin/akashik.js when the
./src/cli/commands/cache-stats.ts:22:  const sock = join(akashikHome(), 'daemon.sock');
./src/cli/commands/cache-stats.ts:31:      note: 'L1 cache lives in the daemon process. Start `akashik daemon` to populate.',
./src/cli/commands/login.ts:2: * `akashik login` — link a verified GitHub identity to your
./src/cli/commands/login.ts:6: * the social DID for akashik is anchored to existing OAuth
./src/cli/commands/login.ts:8: * GitHub user id + profile URL go into `~/.akashik/linked-
./src/cli/commands/login.ts:34:import { akashikHome } from '../runtime.js';
./src/cli/commands/login.ts:49:      return 'verification code expired before you completed the flow. re-run `akashik login github`.';
./src/cli/commands/login.ts:135:  const persisted = saveLinkedAccount(akashikHome(), 'github', {
./src/cli/commands/login.ts:150:  console.log(`  recorded:   ~/.akashik/linked-accounts.json`);
./src/cli/commands/login.ts:158:const USAGE = `usage: akashik login
./src/cli/commands/login.ts:171:    3. Re-run: akashik login
./src/cli/commands/login.ts:181:  // Permit `akashik login github` as an explicit alias, but
./src/cli/commands/login.ts:182:  // bare `akashik login` is the canonical form.
./src/cli/commands/login.ts:184:    console.error(`login: unknown argument '${args[0]}'. usage: akashik login`);
./src/cli/commands/recall.ts:2: * `akashik recall <name> [--room R] [--k N] [--json]`
./src/cli/commands/recall.ts:19:import { defaultRuntime, akashikHome } from '../runtime.js';
./src/cli/commands/recall.ts:50:  if (!query) return 'missing name — usage: akashik recall <name> [--room R] [--k N] [--peers] [--json]';
./src/cli/commands/recall.ts:56:    console.log(`usage: akashik recall <name> [--room R] [--k N] [--peers] [--json]
./src/cli/commands/recall.ts:59:(\`akashik entity add ...\`) plus heuristic auto-detected
./src/cli/commands/recall.ts:67:              /akashik/recall/1.0.0 protocol — returns
./src/cli/commands/recall.ts:107:  const idPath = join(akashikHome(), 'peer-identity.json');
./src/cli/commands/recall.ts:108:  const peersPath = join(akashikHome(), 'peers.json');
./src/cli/commands/recall.ts:109:  const cfgPath = join(akashikHome(), 'config.yaml');
./src/cli/commands/recall.ts:166:    console.log(`# akashik recall --peers: ${parsed.query}`);
./src/cli/commands/recall.ts:182:        console.log('  (no connected peers — dial one with `akashik peer add <multiaddr>`)');
./src/cli/commands/recall.ts:222:      console.log(`  register one with: akashik entity add "${parsed.query}"`);
./src/cli/commands/recall.ts:251:  console.log(`# akashik recall: ${entity.label}`);
./src/cli/commands/recall.ts:261:    console.log('or no ingest has run since registration. try `akashik trigger`.');
./src/cli/commands/init.ts:2: * `akashik init` — interactive room seeding wizard.
./src/cli/commands/init.ts:17: * Non-interactive mode: `akashik init --name X --desc Y --keywords a,b`
./src/cli/commands/init.ts:117:  console.log('\nakashik init — set up a new research room\n');
./src/cli/commands/init.ts:230:    console.log(`run 'akashik trigger --room ${result.room.id}' to fetch initial content.`);
./src/cli/commands/telegram.ts:2: * `akashik telegram <sub>`
./src/cli/commands/telegram.ts:18:akashik telegram setup
./src/cli/commands/telegram.ts:58:  console.log('Run `akashik telegram test` to verify.');
./src/cli/commands/telegram.ts:66:    console.error('No config.yaml found. Run `akashik telegram setup` first.');
./src/cli/commands/telegram.ts:74:    console.error('Telegram not configured. Run `akashik telegram setup`.');
./src/cli/commands/telegram.ts:91:  const result = await bot.value.sendMessage('akashik bot is working. Send a URL to ingest or type a command.');
./src/cli/commands/telegram.ts:108:    console.error('No config.yaml. Run `akashik telegram setup`.');
./scripts/bench-v2.sh:2:# akashik v2.0 comprehensive benchmark
./scripts/bench-v2.sh:7:WI=akashik
./scripts/bench-v2.sh:48:# akashik v2.0 — Benchmark Report
./scripts/bench-v2.sh:56:**akashik:** $($WI version 2>/dev/null || echo "unknown")
./scripts/bench-v2.sh:114:bench_capture "reindex akashik (116 files)"       $WI codebase reindex 19a0c7525684eded
./scripts/bench-v2.sh:141:graph_size=$(wc -c < ~/.akashik/graph.json 2>/dev/null || echo 0)
./scripts/bench-v2.sh:142:vectors_size=$(wc -c < ~/.akashik/vectors.db 2>/dev/null || echo 0)
./scripts/bench-v2.sh:143:code_size=$(wc -c < ~/.akashik/code-graph.db 2>/dev/null || echo 0)
./scripts/bench-v2.sh:145:printf "  %-45s %12s bytes\n" "~/.akashik/graph.json" "$graph_size"
./scripts/bench-v2.sh:146:printf "  %-45s %12s bytes\n" "~/.akashik/vectors.db" "$vectors_size"
./scripts/bench-v2.sh:147:printf "  %-45s %12s bytes\n" "~/.akashik/code-graph.db" "$code_size"
./scripts/bench-v2.sh:152:research_nodes=$(sqlite3 ~/.akashik/vectors.db "SELECT COUNT(*) FROM vec_meta" 2>/dev/null || echo 0)
./scripts/bench-v2.sh:153:code_nodes=$(sqlite3 ~/.akashik/code-graph.db "SELECT COUNT(*) FROM code_nodes")
./scripts/bench-v2.sh:154:code_edges=$(sqlite3 ~/.akashik/code-graph.db "SELECT COUNT(*) FROM code_edges")
./scripts/bench-v2.sh:155:codebases=$(sqlite3 ~/.akashik/code-graph.db "SELECT COUNT(*) FROM codebases")
./scripts/bench-v2.sh:212:| ~/.akashik/graph.json (research graph) | $(echo "scale=2; $graph_size / 1024 / 1024" | bc) MB |
./scripts/bench-v2.sh:213:| ~/.akashik/vectors.db (ONNX vectors + meta) | $(echo "scale=2; $vectors_size / 1024 / 1024" | bc) MB |
./scripts/bench-v2.sh:214:| ~/.akashik/code-graph.db (Phase 19 code graph) | $(echo "scale=2; $code_size / 1024 / 1024" | bc) MB |
./src/cli/commands/viz.ts:2: * `akashik viz [--room R] [--output FILE]`
./src/cli/commands/viz.ts:19:<html><head><meta charset="UTF-8"><title>akashik — ${title}</title>
./src/cli/commands/viz.ts:24:<div id="info">akashik — ${title}</div>
./scripts/bench-beir.mjs:3:// the canonical retrieval metrics on akashik's ONNX + sqlite-vec stack.
./scripts/bench-beir.mjs:37:const CACHE_ROOT = join(homedir(), '.akashik', 'bench');
./scripts/bench-beir.mjs:49:console.log(` akashik — BEIR ${DATASET.toUpperCase()} Benchmark`);
./demo/scene-federated.tape:1:# akashik — natural Claude Code session, federated retrieval live.
./demo/scene-federated.tape:20:Type "cd /Users/saharbarak/personal/akashik"
./demo/scene-federated.tape:22:Type "export AKASHIK_HOME=$HOME/.akashik.demo"
./src/cli/commands/export-obsidian.ts:2: * `akashik export obsidian [--room R] [--output DIR]`
./src/cli/commands/export-obsidian.ts:102:    const indexLines = [`# akashik vault — ${room ?? 'all rooms'}`, '', `${nodes.length} nodes, ${edges.length} edges`, ''];
./scripts/bench-beir-rust.mjs:6:// akashik-rs embed_server binary) → openSqliteVectorIndex.upsert
./scripts/bench-beir-rust.mjs:47:const CACHE_ROOT = join(homedir(), '.akashik', 'bench');
./src/cli/commands/hot.ts:2: * `akashik hot [--refresh] [--path]`
./akashik-rs/src/bin/akashik_cli.rs:1://! akashik-cli — native Rust client for the v4.1 IPC fast path.
./akashik-rs/src/bin/akashik_cli.rs:3://! v4.0 ships `bin/akashik.js` which checks for the daemon socket
./akashik-rs/src/bin/akashik_cli.rs:18://! command isn't IPC-delegatable), exec `node bin/akashik.js`
./akashik-rs/src/bin/akashik_cli.rs:53:fn akashik_home() -> PathBuf {
./akashik-rs/src/bin/akashik_cli.rs:58:            home.join(".akashik")
./akashik-rs/src/bin/akashik_cli.rs:63:    akashik_home().join("daemon.sock")
./akashik-rs/src/bin/akashik_cli.rs:109:    // Locate bin/akashik.js relative to this binary. The standard
./akashik-rs/src/bin/akashik_cli.rs:111:    //   <repo>/akashik-rs/target/release/akashik-cli
./akashik-rs/src/bin/akashik_cli.rs:112:    //   <repo>/bin/akashik.js
./akashik-rs/src/bin/akashik_cli.rs:113:    // ↑ four ancestors: target → release → akashik-rs → repo root
./akashik-rs/src/bin/akashik_cli.rs:114:    let exe = env::current_exe().unwrap_or_else(|_| PathBuf::from("./akashik-cli"));
./akashik-rs/src/bin/akashik_cli.rs:122:    node_entry.push("akashik.js");
./akashik-rs/src/bin/akashik_cli.rs:126:            "akashik-cli: fallback path {} does not exist",
./akashik-rs/src/bin/akashik_cli.rs:139:            eprintln!("akashik-cli: failed to exec node: {e}");
./src/cli/commands/ask.ts:2: * `akashik ask "<query>" [--room R] [--k N] [--peers]`
./src/cli/commands/ask.ts:8: * With --peers: fans out to all connected peers via /akashik/search/1.0.0,
./src/cli/commands/ask.ts:22:import { defaultRuntime, akashikHome } from '../runtime.js';
./src/cli/commands/ask.ts:53:  if (!query) return 'missing query — usage: akashik ask "your question" [--room R] [--k N] [--peers] [--json]';
./src/cli/commands/ask.ts:155: * "akashik_hook_version" — defends against zombie hooks after a
./src/cli/commands/ask.ts:173:  console.log(`# akashik agent contract (hook_version: ${HOOK_SCHEMA_VERSION})`);
./src/cli/commands/ask.ts:205:    console.log(`# akashik: "${r.query}" matches entity ${e.id}`);
./src/cli/commands/ask.ts:228:      console.log('no results found. try a broader query or run `akashik trigger` to index content first.');
./src/cli/commands/ask.ts:288:  const identityPath = join(akashikHome(), 'peer-identity.json');
./src/cli/commands/ask.ts:289:  const peersPath = join(akashikHome(), 'peers.json');
./src/cli/commands/ask.ts:290:  const configPath = join(akashikHome(), 'config.yaml');
./src/cli/commands/ask.ts:347:      home: akashikHome(),
./src/cli/commands/ask.ts:395:          const id = await ensureIdentity(akashikHome());
./src/cli/commands/ask.ts:403:            home: akashikHome(),
./src/cli/commands/ask.ts:452:    console.log(`# akashik federated results for: ${parsed.query}`);
./src/cli/commands/ask.ts:488:    // 7. Peer-pull telemetry block — visible signal of "akashik
./scripts/bench-ppr-multihop.mjs:63:const RESULTS_DIR = join(homedir(), '.akashik', 'bench', `ppr-multihop-${DATASET}`);
./scripts/bench-ppr-multihop.mjs:67:console.log(` akashik — PPR multi-hop rerank gate (${DATASET})`);
./src/cli/commands/help.ts:6:akashik — knowledge graph + research daemon Claude Code plugin
./src/cli/commands/help.ts:9:  akashik <command> [options]
./demo/scene-touch.tape:1:# akashik — scene 6 — P2P touch across a 5-daemon mesh
./demo/scene-touch.tape:26:Type "export AKASHIK_HOME=$HOME/.akashik.demo"
./demo/scene-touch.tape:38:Type 'akashik peer list'
./demo/scene-touch.tape:51:Type 'akashik ask "open-hardware portable Raman LH2 spectrometer munich" --k 3 --json | jq ".aggregate // .satisfaction.score"'
./demo/scene-touch.tape:62:Type 'akashik touch --peer "$AKASHIK_DEMO_PEER_B_ID" --room research'
./demo/scene-touch.tape:71:Type 'akashik touch --peer "$AKASHIK_DEMO_PEER_D_ID" --room research'
./demo/scene-touch.tape:82:Type 'akashik ask "open-hardware portable Raman LH2 spectrometer munich" --k 3'
./src/cli/commands/doctor.ts:2: * doctor — checks runtime prerequisites for akashik.
./src/cli/commands/doctor.ts:9: *   - ~/.akashik/venv exists and can `import graphify`
./src/cli/commands/doctor.ts:50:function akashikHome(): string {
./src/cli/commands/doctor.ts:51:  return process.env.AKASHIK_HOME || join(homedir(), '.akashik');
./src/cli/commands/doctor.ts:55:  return join(akashikHome(), 'venv', 'bin', 'python');
./src/cli/commands/doctor.ts:126:    name: 'akashik venv',
./src/cli/commands/doctor.ts:130:    fix: 'run `akashik doctor --fix` (or `scripts/bootstrap.sh`)',
./src/cli/commands/doctor.ts:142:      fix: 'run `akashik doctor --fix`',
./src/cli/commands/doctor.ts:156:      fix: 'run `akashik doctor --fix` to reinstall graphify into the venv',
./src/cli/commands/doctor.ts:171:      name: 'akashik schema patch',
./src/cli/commands/doctor.ts:180:    name: 'akashik schema patch',
./src/cli/commands/doctor.ts:227:  console.log('akashik doctor\n');
./src/cli/commands/doctor.ts:238:    console.log("run 'akashik doctor --fix' to bootstrap the venv + graphify install.");
./src/cli/commands/claude-install.ts:2: * `akashik claude install` / `akashik claude uninstall`
./src/cli/commands/claude-install.ts:5: * knowledge questions through the akashik graph automatically:
./src/cli/commands/claude-install.ts:8: *    Extracts the query from the tool input, runs `akashik ask
./src/cli/commands/claude-install.ts:11: *    ~/.akashik/miss-log.jsonl so the user can decide whether to
./src/cli/commands/claude-install.ts:38:const LEGACY_HOOK_NAME = 'akashik-hook.sh';
./src/cli/commands/claude-install.ts:39:const SMART_HOOK_SH = 'akashik-smart-hook.sh';
./src/cli/commands/claude-install.ts:40:const SMART_HOOK_CJS = 'akashik-smart-hook.cjs';
./src/cli/commands/claude-install.ts:41:const POST_FETCH_SH = 'akashik-post-fetch.sh';
./src/cli/commands/claude-install.ts:42:const POST_FETCH_CJS = 'akashik-post-fetch.cjs';
./src/cli/commands/claude-install.ts:61: * akashik package. When running from source, resolves to the repo's
./src/cli/commands/claude-install.ts:72:# akashik PreToolUse + SessionStart hook.
./src/cli/commands/claude-install.ts:74:GRAPH="\${AKASHIK_HOME:-$HOME/.akashik}/graph.json"
./src/cli/commands/claude-install.ts:78:  if command -v akashik >/dev/null 2>&1; then
./src/cli/commands/claude-install.ts:79:    RECENT=$(akashik recent-sessions --hours 24 --limit 1 --json 2>/dev/null || echo '{"count":0,"sessions":[]}')
./src/cli/commands/claude-install.ts:86:      MSG="akashik: Previous session $SID (started $STARTED, branch $BRANCH). Last assistant: \${FINAL:-<none>}. Call the recent_sessions MCP tool for the full rollup."
./src/cli/commands/claude-install.ts:96:  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"akashik: Knowledge graph exists ('"$NODES"' nodes). Before searching raw files, consider using the akashik MCP tools: search (semantic k-NN), ask (search + context assembly), get_node (lookup by ID), get_neighbors (graph traversal). These return your indexed research + codebase + external sources in one query."}}'
./src/cli/commands/claude-install.ts:101:// WebFetch. Extracts the query and runs `akashik ask --json` against
./src/cli/commands/claude-install.ts:144:# akashik
./src/cli/commands/claude-install.ts:145:akashik is a knowledge-graph-first research layer with P2P
./src/cli/commands/claude-install.ts:154:Two canonical rooms every akashik peer advertises out of the box:
./src/cli/commands/claude-install.ts:163:\`akashik save\`: a URL-sourced save lands in \`research\`
./src/cli/commands/claude-install.ts:178:- If the hit is older, prefer a fresh pull — \`mcp__akashik__trigger_room\`
./src/cli/commands/claude-install.ts:183:## When to invoke akashik
./src/cli/commands/claude-install.ts:185:1. Use the akashik MCP tools (\`search\`, \`ask\`, \`get_node\`,
./src/cli/commands/claude-install.ts:193:   \`akashik metrics bypass\` audit, not by routing through Bash.
./src/cli/commands/claude-install.ts:197:   \`akashik save --type synthesis --room <room>\` to file the
./src/cli/commands/claude-install.ts:202:const CLAUDE_MD_MARKER_START = '<!-- akashik:start -->';
./src/cli/commands/claude-install.ts:203:const CLAUDE_MD_MARKER_END = '<!-- akashik:end -->';
./src/cli/commands/claude-install.ts:247:  // dedupe filter — any owned script name is a akashik entry
./src/cli/commands/claude-install.ts:283:  console.log(`  updated ${claudeMdPath} (akashik section added)`);
./src/cli/commands/claude-install.ts:285:  console.log('\nClaude Code will now check the akashik knowledge graph');
./src/cli/commands/claude-install.ts:347:  console.log('\nakashik hooks removed. Restart Claude Code to deactivate.');
./src/cli/commands/claude-install.ts:359:      console.log('akashik claude install\n');
./src/cli/commands/claude-install.ts:362:      console.log('akashik claude uninstall\n');
./scripts/bench-room-routing.mjs:4:// Tests whether akashik's room architecture gives a measurable retrieval lift
./scripts/bench-room-routing.mjs:11://     --datasets-dir ~/.akashik/bench/cqadupstack/cqadupstack \
./scripts/bench-room-routing.mjs:38:const DATASETS_DIR = getArg('--datasets-dir', join(homedir(), '.akashik/bench/cqadupstack/cqadupstack'));
./scripts/bench-room-routing.mjs:51:const CACHE_ROOT = join(homedir(), '.akashik', 'bench');
./scripts/bench-room-routing.mjs:59:console.log(' akashik Wave 4 — Room Routing Gate Test');
./scripts/bench-room-routing.mjs:237:// target room. This is the same pattern akashik's production
./src/cli/commands/identity.ts:2: * `akashik identity <sub>` — inspect and manage the user+device
./src/cli/commands/identity.ts:24:import { akashikHome } from '../runtime.js';
./src/cli/commands/identity.ts:43:  const res = await ensureIdentity(akashikHome());
./src/cli/commands/identity.ts:56:  const res = await ensureIdentity(akashikHome());
./src/cli/commands/identity.ts:66:  const res = await rotateDeviceKey(akashikHome());
./src/cli/commands/identity.ts:78:    ? await exportRecoveryHex(akashikHome())
./src/cli/commands/identity.ts:79:    : await exportRecoveryMnemonic(akashikHome());
./src/cli/commands/identity.ts:90:    console.error('   Use `akashik identity export --hex` for the legacy v1 hex format.\n');
./src/cli/commands/identity.ts:104:    console.error('  usage: akashik identity import <24-word-mnemonic>');
./src/cli/commands/identity.ts:105:    console.error('         akashik identity import <64-char-hex>');
./src/cli/commands/identity.ts:109:  const res = await importRecoveryAuto(akashikHome(), input);
./src/cli/commands/identity.ts:119:  console.log('usage: akashik identity <sub>');
./src/cli/commands/identity.ts:128:  console.log('Every memory entry akashik signs is wrapped in an envelope');
./src/cli/commands/this.ts:2: * `akashik this [me|everyone] [--root DIR] [--name NAME]`
./src/cli/commands/this.ts:9: *   akashik this              → index cwd, room private
./src/cli/commands/this.ts:10: *   akashik this me           → same (explicit private)
./src/cli/commands/this.ts:11: *   akashik this everyone     → index cwd + share room with peers
./src/cli/commands/this.ts:15: * boundary identical to `akashik share room <name>`.
./src/cli/commands/this.ts:23:import { akashikHome, runtimePaths } from '../runtime.js';
./src/cli/commands/this.ts:53:const USAGE = `usage: akashik this [me|everyone] [--root DIR] [--name NAME]
./src/cli/commands/this.ts:71:  console.log(`akashik this ${visibility} — room '${slug}' (${root})\n`);
./src/cli/commands/this.ts:78:  registerWatchTarget(join(akashikHome(), 'watch-targets.json'), {
./src/cli/commands/this.ts:99:    console.log(`    akashik daemon stop && akashik daemon start`);
./src/cli/commands/this.ts:100:    console.log(`\n  track ingest progress with:  akashik jobs watch`);
./src/cli/commands/this.ts:107:      console.log(`  to share later: akashik share room ${slug}`);
./src/cli/commands/this.ts:115:  console.log(`  akashik daemon start`);
./src/cli/commands/this.ts:125:    console.log(`  to share later: akashik share room ${slug}`);
./src/cli/commands/report.ts:2: * `akashik report [--room R] [--since DATE] [--no-save]`
./src/cli/commands/report.ts:5: * optionally persists it to ~/.akashik/reports/<room>/<date>.md.
./scripts/bench-bridge.mjs:7:// against the same corpus. If true, akashik peers can federate
./scripts/bench-bridge.mjs:47:const CACHE_ROOT = join(homedir(), '.akashik', 'bench');
./scripts/bench-bridge.mjs:61:console.log(' akashik — cross-model embedding bridge gate');
./src/cli/commands/publish.ts:2: * `akashik publish <sub>`
./scripts/bench-consolidation.mjs:56:const wiHome = () => process.env.AKASHIK_HOME ?? join(homedir(), '.akashik');
./src/cli/commands/discover.ts:2: * `akashik discover [--room R] [--auto]`
./src/cli/commands/discover.ts:48:    console.error('discover: no room specified and no default room set. use --room or run `akashik init`.');
./src/cli/commands/discover.ts:82:    console.log(`\n${suggestions.length} source(s) added. run 'akashik trigger --room ${room}' to fetch.`);
./src/cli/commands/discover.ts:84:    console.log(`add them with: akashik discover --room ${room} --auto`);
./akashik-rs/src/bin/embed_server.rs:4://! akashik stack spawns on first use to embed via production-
./akashik-rs/src/bin/embed_server.rs:41:use akashik_bench::{
./akashik-rs/src/bin/embed_server.rs:193:    // akashik's production indexNode path gets the correct
./akashik-rs/src/bin/embed_server.rs:290:        "akashik-bench embed_server v{} — stdio JSON-RPC",
./scripts/bench-lab.mjs:11:// Inputs: existing bench sota.db files under ~/.akashik/bench/, which
./scripts/bench-lab.mjs:43:const CACHE_ROOT = join(homedir(), '.akashik', 'bench');
./scripts/bench-lab.mjs:48:console.log(' akashik — retrieval lab');
./demo/scene-claude.tape:1:# akashik — scene 4 — side-by-side timing comparison
./demo/scene-claude.tape:5:# Run B: this repo, akashik PreToolUse hook wired.
./demo/scene-claude.tape:30:Type "export AKASHIK_HOME=$HOME/.akashik.demo"
./demo/scene-claude.tape:38:Type '# Same model. Same prompt. The only difference: akashik.'
./demo/scene-claude.tape:42:Type 'cd /tmp/demo-without-akashik'
./demo/scene-claude.tape:55:# ─── Run B: Claude + akashik — fast + cited ───────────
./demo/scene-claude.tape:60:Type 'cd /Users/saharbarak/personal/akashik'
./demo/scene-claude.tape:64:Type '# (2)  claude WITH the akashik PreToolUse hook'
./src/cli/commands/room.ts:2: * `akashik room <sub>` — manage the room registry.
./src/cli/commands/room.ts:12: *   akashik room create homelab --desc "Home lab infra" --keywords "proxmox,mikrotik,10gbe"
./src/cli/commands/room.ts:13: *   akashik room switch homelab
./src/cli/commands/room.ts:36:    console.log('no rooms configured. try `akashik init` or `akashik room create <name>`.');
./src/cli/commands/room.ts:50:    console.error('room create: missing <name>. usage: akashik room create <name> [--desc "..."] [--keywords "a,b,c"] [--wing "default"]');
./src/cli/commands/room.ts:117:    console.log('no default room set. run `akashik init` to create one.');
./src/cli/commands/trigger.ts:2: * `akashik trigger [--room <room>] [--sync]` — run an ingest pass.
./src/cli/commands/trigger.ts:75:    console.log('trigger: no sources configured — use `akashik sources add` to seed one.');
./src/cli/commands/trigger.ts:89:  console.log(`\n${rooms.length - failed} job(s) queued — track with: akashik jobs watch`);
./src/cli/commands/trigger.ts:130:      console.log('trigger: no sources configured — use `akashik sources add` to seed one.');
./src/cli/commands/unshare.ts:2: * `akashik unshare <name>` — make a room private again.
./src/cli/commands/unshare.ts:8: * KEEPS the .ydoc binary file at ~/.akashik/ydocs/<name>.ydoc so a
./src/cli/commands/unshare.ts:15:import { akashikHome } from '../runtime.js';
./src/cli/commands/unshare.ts:17:const sharedRoomsPath = (): string => join(akashikHome(), 'shared-rooms.json');
./src/cli/commands/unshare.ts:19:const USAGE = `usage: akashik unshare <name>
./src/cli/commands/unshare.ts:59:  console.log('  restart the daemon (akashik daemon stop && start) to close active sync streams for this room');
./scripts/bench-compare.mjs:10://     ~/.akashik/bench/scifact__nomic-ai-nomic-embed-text-v1-5/results.json \
./scripts/bench-compare.mjs:11://     ~/.akashik/bench/scifact__nomic-ai-nomic-embed-text-v1-5__hybrid/results.json
./src/cli/commands/daemon.ts:2: * `akashik daemon <sub>` — background research daemon.
./src/cli/commands/daemon.ts:132:    console.error(`  another akashik process is already mutating. retry in a moment.`);
./src/cli/commands/daemon.ts:170:  // Phase 41 — file-watcher (registered roots from `akashik this`)
./src/cli/commands/daemon.ts:195:  void rt.value.embedder.embed('akashik daemon warm').then(
./src/cli/runtime.ts:36:export const akashikHome = (): string =>
./src/cli/runtime.ts:37:  process.env.AKASHIK_HOME ?? join(homedir(), '.akashik');
./src/cli/runtime.ts:69: *   'rust'    — spawns the `akashik-rs` embed_server binary and
./src/cli/runtime.ts:87:  // Measured 3.1× throughput on the live akashik stack via
./src/cli/runtime.ts:129:  const home = akashikHome();
./src/cli/commands/lint.ts:2: * `akashik lint [--room R] [--json]`
./src/cli/commands/bench.ts:2: * `akashik bench memory` — unified memory benchmark runner.
./src/cli/commands/bench.ts:56: * the Hetzner box (with `AKASHIK_BENCH_PUBLIC_REAL=1` and the
./src/cli/commands/bench.ts:161:  lines.push(`akashik memory bench — ${r.runAt}`);
./src/cli/commands/bench.ts:190:  console.log(`akashik bench — unified memory benchmark
./demo/scene-prompt-hook.tape:1:# akashik — scene 9 — UserPromptSubmit hook in flight
./demo/scene-prompt-hook.tape:27:Type "export AKASHIK_HOME=$HOME/.akashik.demo"
./demo/scene-prompt-hook.tape:34:Type "# akashik UserPromptSubmit hook — fires BEFORE Claude reads the user message."
./demo/scene-prompt-hook.tape:48:Type "cat /tmp/wi-prompt-demo.json | node .claude/hooks/akashik-prompt-submit.cjs | jq -r .hookSpecificOutput.additionalContext"
./src/cli/commands/peers-rep.ts:2: * `akashik peers rep [<peer-id>] [--subject <key>] [--json]`
./src/cli/commands/peers-rep.ts:18: * consumers (CI tooling, the future `akashik audit export`).
./src/cli/commands/peers-rep.ts:33:const akashikHomeDir = (): string =>
./src/cli/commands/peers-rep.ts:34:  process.env.AKASHIK_HOME ?? join(homedir(), '.akashik');
./src/cli/commands/peers-rep.ts:132:    console.log('no peer reputation data yet — needs at least one federated ask with `akashik ask --peers`.');
./src/cli/commands/peers-rep.ts:201:const USAGE = `usage: akashik peers rep [<peer-id>] [--subject <key>] [--json]
./src/cli/commands/peers-rep.ts:214:  const home = akashikHomeDir();
./src/cli/commands/codebase.ts:2: * `akashik codebase <sub>` — Phase 19 structured code graph management.
./src/cli/commands/codebase.ts:5: *   index <path> [--name N]   parse a codebase into ~/.akashik/code-graph.db
./src/cli/commands/codebase.ts:14: * Separate from `akashik index` (shallow research-room indexing — NOT modified
./src/cli/commands/codebase.ts:64:    console.error('codebase index: missing <path>. usage: akashik codebase index <path> [--name <name>]');
./src/cli/commands/codebase.ts:139:      console.log('no indexed codebases. try `akashik codebase index <path>`.');
./src/cli/commands/codebase.ts:165:    console.error('codebase show: missing <id>. usage: akashik codebase show <id>');
./src/cli/commands/codebase.ts:214:    console.error('codebase reindex: missing <id>. usage: akashik codebase reindex <id>');
./src/cli/commands/codebase.ts:259:    console.error('codebase attach: usage: akashik codebase attach <id> --room <room-id>');
./src/cli/commands/codebase.ts:296:    console.error('codebase detach: usage: akashik codebase detach <id> --room <room-id>');
./src/cli/commands/codebase.ts:326:    console.error('codebase search: missing <query>. usage: akashik codebase search <query> [--codebase <id>] [--kind <kind>]');
./src/cli/commands/codebase.ts:380:    console.error('codebase remove: missing <id>. usage: akashik codebase remove <id>');
./src/cli/commands/codebase.ts:406:const USAGE = `usage: akashik codebase <index|list|show|reindex|attach|detach|search|remove>
./src/cli/commands/codebase.ts:409:  index <path> [--name N] [--json]     parse a codebase into ~/.akashik/code-graph.db
./src/cli/commands/peer.ts:2: * `akashik peer <sub>` — manage P2P peer connections.
./src/cli/commands/peer.ts:26:import { akashikHome } from '../runtime.js';
./src/cli/commands/peer.ts:28:const identityPath = (): string => join(akashikHome(), 'peer-identity.json');
./src/cli/commands/peer.ts:29:const peersPath = (): string => join(akashikHome(), 'peers.json');
./src/cli/commands/peer.ts:30:const configPath = (): string => join(akashikHome(), 'config.yaml');
./src/cli/commands/peer.ts:36:    console.error('peer add: missing <multiaddr>. usage: akashik peer add /ip4/1.2.3.4/tcp/9001');
./src/cli/commands/peer.ts:107:    console.error('peer remove: missing <id>. usage: akashik peer remove <peerId>');
./src/cli/commands/peer.ts:173:    console.log('no known peers. try `akashik peer add <multiaddr>`.');
./src/cli/commands/peer.ts:216:const USAGE = `usage: akashik peer <add|remove|list|status>
./src/infrastructure/embedders.ts:149: * Spawns the `akashik-rs/target/release/embed_server` binary on
./src/infrastructure/embedders.ts:166:   * `akashik-rs/target/release/embed_server`; override via
./src/infrastructure/embedders.ts:203:    // Default path assumes the repo layout: akashik-rs is a sibling
./src/infrastructure/embedders.ts:208:      return join(here, '..', '..', 'akashik-rs', 'target', 'release', 'embed_server');
./src/infrastructure/embedders.ts:333: * encoder. Measured gain on the live akashik stack (bench-embed-
./scripts/bench-warm.mjs:28:const home = process.env.AKASHIK_HOME ?? join(homedir(), '.akashik');
./package.json:2:  "name": "akashik",
./package.json:7:    "akashik": "./bin/akashik.js"
./package.json:13:    "doctor": "node bin/akashik.js doctor",
./package.json:14:    "start": "node bin/akashik.js",
./src/cli/commands/dashboard.ts:2: * `akashik dashboard [--port N]`
./src/cli/commands/dashboard.ts:24:<title>akashik dashboard</title>
./src/cli/commands/dashboard.ts:60:  <div class="logo">akashik</div>
./src/cli/commands/dashboard.ts:256:    console.log(`akashik dashboard running at http://localhost:${port}`);
./src/infrastructure/process-lock.ts:12: *   - POSIX exclusive-create on `<home>/akashik.lock` (the same
./src/infrastructure/process-lock.ts:70:const lockPath = (homeDir: string): string => join(homeDir, 'akashik.lock');
./src/infrastructure/process-lock.ts:107: * Try to acquire the akashik write lock. Returns a LockHandle on
./src/infrastructure/process-lock.ts:161:        `akashik.lock held by ${result.owner} (pid=${result.pid}); wait or stop the holder`,
./src/infrastructure/process-lock.ts:193: * `akashik status` style commands that want to surface "is anyone
./akashik-rs/Cargo.lock:2937:name = "akashik-bench"
./src/infrastructure/log-store.ts:122: * `akashik logs tail` flow. For a streaming watcher the caller
./src/cli/commands/jobs.ts:2: * `akashik jobs <sub>` — inspect the daemon's background queue.
./src/cli/commands/jobs.ts:23:const USAGE = `usage: akashik jobs <sub>
./src/cli/commands/jobs.ts:32:    console.error('jobs: daemon is not running. start it with `akashik daemon start`.');
./src/cli/commands/jobs.ts:60:    process.stdout.write(`akashik jobs — ${new Date().toISOString()}\n\n`);
./src/infrastructure/telemetry-formatter.ts:5: *   - CLI tail output after `akashik ask --peers`
./src/infrastructure/telemetry-formatter.ts:12:const HR_TOP    = '─── akashik peer pull ─────────────────────────────────';
./akashik-rs/Cargo.toml:2:name = "akashik-bench"
./akashik-rs/Cargo.toml:7:# Minimum-viable BEIR benchmark for akashik in Rust.
./akashik-rs/Cargo.toml:11:# NDCG@10. Reads BEIR corpora directly from ~/.akashik/bench/
./src/infrastructure/watch-targets.ts:5: * Each entry: { room, root, registered_at }. `akashik this`
./src/infrastructure/watch-targets.ts:50:  // watch-targets — losing them means every `akashik this` has
./src/infrastructure/watch-targets.ts:60: * (room, root) pair so re-running `akashik this` refreshes the
./src/infrastructure/http/fetcher.ts:49:  const userAgent = opts.userAgent ?? 'akashik/0.1 (+https://github.com/saharbarak/akashik)';
./src/infrastructure/share-store.ts:2: * Share store — persists the shared-rooms registry to ~/.akashik/shared-rooms.json.
./src/infrastructure/share-store.ts:29: * concurrent akashik processes (e.g., daemon + CLI `share room foo`)
./src/infrastructure/share-store.ts:284: * and releases the lock. Prevents two akashik processes (e.g., daemon +
./src/infrastructure/sources-config.ts:4: * The registry lives at `~/.akashik/sources.json` (overridable
./README.md.bak.830lines:2:  <img src="docs/logo.png" alt="akashik" width="400" />
./README.md.bak.830lines:6:  <a href="https://github.com/SaharBarak/akashik/stargazers"><img src="https://img.shields.io/github/stars/SaharBarak/akashik?style=social" alt="Stars" /></a>&nbsp;
./README.md.bak.830lines:7:  <a href="https://github.com/SaharBarak/akashik/network/members"><img src="https://img.shields.io/github/forks/SaharBarak/akashik?style=social" alt="Forks" /></a>&nbsp;
./README.md.bak.830lines:8:  <a href="https://github.com/SaharBarak/akashik/watchers"><img src="https://img.shields.io/github/watchers/SaharBarak/akashik?style=social" alt="Watchers" /></a>
./README.md.bak.830lines:14:  <img src="demo/scene-claude.gif" alt="Side-by-side: Claude alone (~14 s, hedged) vs Claude + akashik (~1.5 s, cited)" width="880" />
./README.md.bak.830lines:18:  <em>Same model. Same prompt. The only difference is akashik.</em>
./README.md.bak.830lines:24:$ akashik ask "vector search sqlite" --k 3
./README.md.bak.830lines:27:   distance: 0.961 | room: akashik-dev
./README.md.bak.830lines:47:| <img src="demo/scene-prompt-hook.gif" alt="UserPromptSubmit hook — answer arrives before Claude reads the message" width="420" /> | **The hook fires BEFORE the LLM reads your message.** UserPromptSubmit + akashik = retrieval at prompt time. Claude has the answer with citations *before* it considers a tool call. |
./README.md.bak.830lines:49:| <img src="demo/scene-codebase.gif" alt="codebase Q&A" width="420" /> | **Codebase Q&A.** `claude -p` cites `src/daemon/job-queue.ts` directly via the akashik PreToolUse hook. |
./README.md.bak.830lines:55:## Why akashik exists
./README.md.bak.830lines:61:**akashik is how that ecosystem shares its knowledge.**
./README.md.bak.830lines:67:The result: fewer tokens burned on repeated research, richer sessions every time a peer in your network learns something new, automatic propagation of best practices and current tools, context that stays fresh between pre-training cuts. The open-source movement open-sourced the code. **akashik open-sources the knowledge graph itself.** That's the next step.
./README.md.bak.830lines:71:**1. Each peer carries a shard of what's current — together, the live index.** Every akashik instance is a libp2p peer. Rooms sync across peers via Y.js CRDT. A federated `ask --peers` fans a query across the network in parallel, 2-second per-peer timeout, results merged by cosine distance with per-peer attribution. The stranger who read that paper last Thursday, the peer who benchmarked that library two weeks ago, the dev who debugged that exact bug last night — their embeddings flow into your session. Nobody knows the whole graph; together the community does — the live state of the field, something no frozen-weight model can touch.
./README.md.bak.830lines:80:  <img src="docs/memory-stack.png" alt="The same Claude session, two different Fridays — without vs with akashik" width="920" />
./README.md.bak.830lines:85:Without akashik, your Claude session starts empty every time. Claude browses ten URLs, burns forty-five thousand tokens, takes thirty seconds, returns an answer half a year stale, and dies with the tab. Ten thousand other people run the exact same loop the same day. None of it compounds.
./README.md.bak.830lines:87:With akashik, the `PreToolUse` hook fires before Claude reaches for the web. Your graph — already holding every arXiv paper you've pulled, every repo you've starred, every past session you've had, plus every shard shared by every other peer running akashik — answers in **11 ms**. Three hits across three rooms: a GitHub repo someone starred yesterday, a piece of community code you hadn't seen, an arXiv paper from two hours ago. Claude replies instantly from the community's latest state. When the session ends, your transcript is vector-indexed back into the graph so tomorrow's session starts richer than today's. And every peer on the network is doing the same — the ten-thousand-stranger loop runs **once**, not ten thousand times.
./README.md.bak.830lines:96:git clone https://github.com/SaharBarak/akashik.git && cd akashik
./README.md.bak.830lines:103:akashik init                      # create a room, pick your sources
./README.md.bak.830lines:104:akashik trigger --room homelab    # fetch from ArXiv, HN, RSS, blogs, any URL
./README.md.bak.830lines:105:akashik index                     # index your codebase + deps + git
./README.md.bak.830lines:110:Register akashik as a **user-scoped MCP server** so every project gets it automatically — no `.mcp.json` per repo, no restart for each new project:
./README.md.bak.830lines:113:claude mcp add --scope user akashik -- akashik mcp
./README.md.bak.830lines:114:akashik claude install            # PreToolUse hook — Claude checks the graph first
./README.md.bak.830lines:136:**Research channels** — akashik also connects to the GitHub analytics ecosystem for tracking trends, competitors, and emerging tools:
./README.md.bak.830lines:151:akashik discover --room homelab --auto
./README.md.bak.830lines:157:After `akashik claude install`, a PreToolUse hook fires before every Glob/Grep/Read. Claude sees:
./README.md.bak.830lines:159:> *"akashik: Knowledge graph exists (425 nodes). Consider using search, ask, get_node before searching raw files."*
./README.md.bak.830lines:165:The v2.1 hook layer goes further: before every Grep/Glob/Read/WebSearch/WebFetch, a PreToolUse hook runs `akashik ask --json` on the extracted query and injects the top-3 hits into Claude's context. On a miss, the query is logged for later ingest. After every WebSearch/WebFetch, a PostToolUse hook auto-saves the result as a `source` node in the always-on `research` system room so the next session finds it via the graph instead of the network.
./README.md.bak.830lines:174:- **One room per repo** — when you `akashik index` a codebase (or Claude Code opens one), akashik provisions a dedicated room for it. The repo name becomes the room id — `my-app`, `auto-tlv`, `akashik-dev` — and its embeddings, commits, and docs stay scoped to that room. Switching projects switches rooms automatically; queries stay relevant to the repo you're in without cross-contamination.
./README.md.bak.830lines:177:**Tunnels** are the exception — when nodes in different rooms are semantically close, akashik flags them. A paper about embedding quantization in `ml-papers` connects to a memory issue in `homelab`. That connection is what rooms exist to produce.
./README.md.bak.830lines:181:Every akashik instance is a libp2p peer with a cryptographic identity. Rooms can be shared across peers via Y.js CRDT. Search runs federated across the network. mDNS auto-discovers peers on your LAN; NAT traversal via circuit-relay-v2 + dcutr + UPnP handles the public internet. All traffic is encrypted by libp2p Noise; peers authenticate via ed25519 during the handshake.
./README.md.bak.830lines:185:akashik peer status                          # show your PeerId + public key
./README.md.bak.830lines:186:akashik peer add /ip4/1.2.3.4/tcp/9001      # connect to a remote peer
./README.md.bak.830lines:187:akashik peer list                            # known peers (--json for agents)
./README.md.bak.830lines:190:akashik share audit --room homelab           # see exactly what would be shared
./README.md.bak.830lines:191:akashik share room homelab                   # mark room as shared (audit-gated)
./README.md.bak.830lines:192:akashik unshare homelab                      # stop sharing (keeps local .ydoc)
./README.md.bak.830lines:195:akashik ask "proxmox GPU passthrough" --peers  # query across connected peers
./README.md.bak.830lines:212:Every akashik peer advertises **three always-on system rooms** out of the box. No opt-in, no manual sharing — every peer can touch them immediately:
./README.md.bak.830lines:220:Membership is **virtual** — derived from each node's `source_uri` scheme, not from its physical `room` field. A git commit tagged `room: akashik-dev` still shows up in `toolshed` for peers. User-chosen rooms stay intact; system rooms are an additional query-time lens.
./README.md.bak.830lines:227:akashik share ui                             # interactive toggle list
./README.md.bak.830lines:236:akashik oracle ask "how do I wire prefetch hooks without adding a dep?"
./README.md.bak.830lines:240:akashik oracle answerable                    # what can your graph plausibly answer?
./README.md.bak.830lines:241:akashik oracle answer <qid> "use raw ANSI + setRawMode" --confidence 0.85
./README.md.bak.830lines:242:akashik oracle show <qid>                    # confidence-ranked answers
./README.md.bak.830lines:248:akashik oracle ask "..." --live              # publishes over pubsub for real-time fan-out
./README.md.bak.830lines:249:akashik oracle answer <qid> "..." --live     # live response path
./README.md.bak.830lines:250:akashik daemon start                         # daemon subscribes at boot and upserts
./README.md.bak.830lines:256:`@libp2p/floodsub` ships Layer B today; gossipsub's latest still targets libp2p/interface v2 while akashik runs v3 — the service API is identical so a future swap is a one-line change.
./README.md.bak.830lines:260:Beyond raw ingest, `akashik save` files typed notes (synthesis / concept / decision / source) that outlive chat transcripts. Ported from [claude-obsidian](https://github.com/AgriciDaniel/claude-obsidian) — reused for the Q&A distillation flow.
./README.md.bak.830lines:263:akashik save --room project --type synthesis --label "Touch primitive" \
./README.md.bak.830lines:265:echo "body..." | akashik save --room project --type concept --label "RNG tunnels"
./README.md.bak.830lines:272:Every akashik install provisions a W3C `did:key` on first boot. Ed25519 keypair, 32-byte pubkey, base58btc-encoded with the `0xed01` multicodec prefix per the [did:key spec](https://w3c-ccg.github.io/did-method-key/). The user DID is long-lived and survives device changes; a device key is authorized by the user DID via a signed tuple `(device_id, device_pub, authorized_at)` so individual devices can be rotated without losing identity.
./README.md.bak.830lines:275:akashik identity show           # prints your user DID + authorized devices
./README.md.bak.830lines:276:akashik identity rotate         # new device key, same user DID, old device revoked
./README.md.bak.830lines:277:akashik identity export         # BIP39 mnemonic recovery phrase
./README.md.bak.830lines:278:akashik identity import         # restore from recovery phrase on a new machine
./README.md.bak.830lines:281:**Signed envelopes at the wire** — any outbound node (memory entry, oracle answer, room share) can be wrapped with a device signature + the device-authorization chain. Receivers verify the whole chain **offline, in under 2 ms, three Ed25519 checks**. No DID resolver, no registry lookup, no network call. Domain-separation tags (`akashik-auth:v1:` vs `akashik-sig:v1:`) prevent replay of authorization signatures as payload signatures.
./README.md.bak.830lines:292:**Why this matters:** the VC-funded AI memory category holds your identity in their user table. When they change pricing, when they get acquired, when they revoke your account — they take your identity with them. akashik's identity is math you already own; no intermediary to revoke it.
./README.md.bak.830lines:296:Separate from the research graph, akashik parses codebases into a rich structured code graph via tree-sitter. Codebases are first-class aggregates attachable to rooms via a join table. Nothing mixes the research nodes and the code nodes — two distinct graphs, two distinct query surfaces.
./README.md.bak.830lines:299:akashik codebase index ~/work/my-app         # parse with tree-sitter (TS+JS+Python)
./README.md.bak.830lines:300:akashik codebase attach <id> --room homelab  # attach to a research room (M:N)
./README.md.bak.830lines:301:akashik codebase search "loadConfig"          # lexical search across attached codebases
./README.md.bak.830lines:302:akashik codebase list --json                  # machine-readable view with node counts
./README.md.bak.830lines:305:Schema captures: **file**, **module**, **class**, **interface**, **function**, **method**, **import**, **export**, **type_alias** (9 node kinds) with **contains**, **imports**, **extends**, **implements**, **calls** edges (5 kinds). Call graph resolution is best-effort with confidence levels (`exact` / `heuristic` / `unresolved`). Trivial pattern detection tags `Factory` / `Singleton` / `Observer` / `Builder` / `Adapter` classes. Stored in a separate SQLite file at `~/.akashik/code-graph.db` — wiping and re-indexing is safe without losing your research embeddings.
./README.md.bak.830lines:312:akashik discover-loop --room homelab --max-iterations 3
./README.md.bak.830lines:325:akashik publish auth              # OAuth 2.0 — opens browser
./README.md.bak.830lines:326:akashik publish preview           # see what would be posted
./README.md.bak.830lines:327:akashik publish launch            # post the launch thread
./README.md.bak.830lines:328:akashik publish tweet "text"      # post a single tweet
./README.md.bak.830lines:334:akashik daemon start              # runs trigger on a schedule
./README.md.bak.830lines:335:akashik daemon status             # check if running
./README.md.bak.830lines:336:akashik report --room homelab     # see what's new
./README.md.bak.830lines:341:Real retrieval quality measured against canonical BEIR datasets using akashik's runtime pipeline. All numbers directly comparable to the [MTEB BEIR leaderboard](https://huggingface.co/spaces/mteb/leaderboard).
./README.md.bak.830lines:367:| **akashik Phase 25 (hybrid + Rust)** | **137M** | **75.22%** | **CPU, 11ms p50** |
./README.md.bak.830lines:397:cd akashik-rs && cargo build --release && cd ..
./README.md.bak.830lines:398:AKASHIK_RUST_BIN=$(pwd)/akashik-rs/target/release/embed_server \
./README.md.bak.830lines:409:  --datasets-dir ~/.akashik/bench/cqadupstack/cqadupstack \
./README.md.bak.830lines:468:akashik is not a vector store with peer sync bolted on. It is an attempt
./README.md.bak.830lines:478:akashik becomes a serious agent-memory protocol. Full thinking surface
./README.md.bak.830lines:491:the missing fact that would change the action. akashik treats this as a
./README.md.bak.830lines:750:The execution priorities for getting akashik to category leadership as a
./README.md.bak.830lines:760:3. akashik retrieves the trusted peer memory before web search.
./README.md.bak.830lines:793:akashik claims category leadership when:
./README.md.bak.830lines:812:<a href="https://www.star-history.com/#SaharBarak/akashik&Date">
./README.md.bak.830lines:814:    <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=SaharBarak/akashik&type=Date&theme=dark" />
./README.md.bak.830lines:815:    <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=SaharBarak/akashik&type=Date" />
./README.md.bak.830lines:816:    <img alt="Star History" src="https://api.star-history.com/svg?repos=SaharBarak/akashik&type=Date" />
./src/infrastructure/identity-resolver.ts:46: *   list     — snapshot of every DID seen; used by `akashik
./src/infrastructure/identity-resolver.ts:65: * commit lifts state to `~/.akashik/identity-audit.json` with
./docs/logo.svg:1:<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 240" fill="none" role="img" aria-label="akashik — the network before the web">
./docs/logo.svg:44:        fill="#f7f4ec" letter-spacing="-2.4">akashik</text>
./src/infrastructure/sources/twitter-search.ts:5: * reads from a local cache file (~/.akashik/twitter-cache.json)
./src/infrastructure/sources/twitter-search.ts:64:const CACHE_PATH = join(homedir(), '.akashik', 'twitter-cache.json');
./demo/MANUSCRIPT.md:1:# akashik — Demo Manuscript
./demo/MANUSCRIPT.md:10:1. **akashik turns local research into agent context faster than the agent can search the web.**
./demo/MANUSCRIPT.md:25:# 1. Clean akashik home so the demo starts from a known state.
./demo/MANUSCRIPT.md:26:mv ~/.akashik ~/.akashik.backup-$(date +%s) 2>/dev/null || true
./demo/MANUSCRIPT.md:33:akashik onboard --yes
./demo/MANUSCRIPT.md:36:akashik daemon status
./demo/MANUSCRIPT.md:37:akashik metrics | jq .gauges     # expect queue.queued=0, queue.running=0
./demo/MANUSCRIPT.md:43:akashik ask "boil-off detection in cryogenic hydrogen tanks" --k 3
./demo/MANUSCRIPT.md:60:akashik
./demo/MANUSCRIPT.md:75:"point akashik at a folder of notes" — that's what we demonstrate.
./demo/MANUSCRIPT.md:90:$ akashik this me
./demo/MANUSCRIPT.md:102:> and the ML used in that field. `akashik this me` chunks them,
./demo/MANUSCRIPT.md:116:$ time akashik ask "what ML methods are used for liquid hydrogen leak detection"
./demo/MANUSCRIPT.md:122:# akashik agent contract (hook_version: 2)         ◄── decision FIRST
./demo/MANUSCRIPT.md:163:graph — no `akashik` invocation visible.
./demo/MANUSCRIPT.md:166:already has the akashik PreToolUse hook wired (from `akashik onboard` earlier).
./demo/MANUSCRIPT.md:180:- RIGHT (terminal tail of `~/.akashik/daemon.log`): the hook fires, `ask` runs,
./demo/MANUSCRIPT.md:186:> akashik hook fires before Claude's tool call, runs `ask`, and
./demo/MANUSCRIPT.md:189:> `akashik`.** The agent is just smarter.
./demo/MANUSCRIPT.md:193:## Scene 4 — Side-by-side: Claude alone vs Claude + akashik (90 sec)
./demo/MANUSCRIPT.md:197:**Setup:** two Claude Code panels side-by-side. **LEFT** has the akashik hook
./demo/MANUSCRIPT.md:212:- **RIGHT** (Claude + akashik): Claude responds in ~1.5 sec with specifics from the
./demo/MANUSCRIPT.md:219:> Same question. Same model. The only difference is whether akashik
./demo/MANUSCRIPT.md:228:**Goal:** show that akashik has TWO retrieval channels — semantic search AND
./demo/MANUSCRIPT.md:234:$ akashik recall stanford-cryo-lab
./demo/MANUSCRIPT.md:276:AKASHIK_HOME=~/.akashik-peerB akashik onboard --yes
./demo/MANUSCRIPT.md:277:AKASHIK_HOME=~/.akashik-peerB akashik save \
./demo/MANUSCRIPT.md:280:AKASHIK_HOME=~/.akashik-peerB akashik share room research
./demo/MANUSCRIPT.md:283:akashik peer add /ip4/127.0.0.1/tcp/<peerB-port>/p2p/<peerB-id>
./demo/MANUSCRIPT.md:284:akashik share room research
./demo/MANUSCRIPT.md:290:$ akashik peer list
./demo/MANUSCRIPT.md:294:$ akashik touch --peer peer-B --room research --label "open-source LH2 spectrometers"
./demo/MANUSCRIPT.md:298:$ akashik ask "open-source spectrometer projects for hydrogen sensing"
./demo/MANUSCRIPT.md:308:> `akashik touch` pulls just that note, attributes it to the peer
./demo/MANUSCRIPT.md:318:question answered with citations from `akashik`'s own source tree.
./demo/MANUSCRIPT.md:320:**Setup:** in the akashik repo:
./demo/MANUSCRIPT.md:323:$ akashik this me
./demo/MANUSCRIPT.md:324:indexing /Users/.../akashik … 312 chunks / 5.3 s
./demo/MANUSCRIPT.md:330:How does the akashik daemon do bounded backpressure on the job queue?
./demo/MANUSCRIPT.md:356:akashik
./demo/MANUSCRIPT.md:364:  github.com/SaharBarak/akashik
./demo/MANUSCRIPT.md:369:> Three things make akashik different. It's local-first — your
./demo/MANUSCRIPT.md:373:> without a middleman. Try it: github.com/SaharBarak/akashik.
./package-lock.json:2:  "name": "akashik",
./package-lock.json:8:      "name": "akashik",
./package-lock.json:51:        "akashik": "bin/akashik.js"
./tests/phase17.mcp-tool.test.ts:31:      home: '/tmp/akashik-test',
./tests/phase17.mcp-tool.test.ts:32:      graph: '/tmp/akashik-test/graph.json',
./tests/phase17.mcp-tool.test.ts:33:      vectors: '/tmp/akashik-test/vectors.db',
./tests/phase17.mcp-tool.test.ts:34:      sources: '/tmp/akashik-test/sources.json',
./tests/phase17.mcp-tool.test.ts:35:      rooms: '/tmp/akashik-test/rooms.json',
./tests/phase17.mcp-tool.test.ts:36:      modelCache: '/tmp/akashik-test/models',
./src/infrastructure/cross-encoder.ts:46:   * to keep akashik self-contained.
./README.md:1:# Akashik
./README.md:5:Akashik is a peer-to-peer knowledge graph protocol where every researcher, maintainer, and engineer adds their reading and reasoning, and where every newcomer can query what the community has already learned before re-treading the same path. Each contribution is Ed25519-signed, locally owned, and federated only on demand — so the network's working set grows by what its contributors are actually curious about, not by what a central planner decided to ingest.
./README.md:13:**Akashik is what** that missing substrate looks like: a federated, cryptographically-attested record the community writes for itself. Not a personal-memory product. Not a team wiki. A shared protocol where contributor reading-hours compound into community progress, signed and attributed, forever.
./README.md:15:**The differentiator is federation, not retrieval.** Single-user memory products already solve personal retrieval; Akashik is not trying to beat them on per-user R@5. The bet is that *cross-peer transfer* of researched-once knowledge is the missing primitive in the OSS knowledge stack, and that a demand-shaped P2P graph is the right way to build it.
./README.md:23:When you ask Akashik something, the system runs through five steps:
./README.md:43:## Empirical validation — AkashikBench-F
./README.md:74:> The npm package and CLI binary are still named `akashik` during the two-name period. The brand-marketing name is **Akashik**; a coordinated rename of package + repo + DNS is queued behind the public launch. Examples below show both forms.
./README.md:79:npm install -g akashik
./README.md:86:akashik init
./README.md:87:akashik daemon start
./README.md:93:akashik save https://arxiv.org/abs/2406.16678 --room research
./README.md:94:akashik save ./notes/cuda-oom-debug.md --room toolshed
./README.md:100:akashik ask "how does mxbai-rerank compare to cross-encoder on long contexts?"
./README.md:115:The full synthesis frames Akashik as compositionally novel with prior-art math: *"Freenet-style demand-shaped replication applied to attributed semantic research memory, with AT Protocol-style DID signatures."*
./README.md:123:- **AkashikBench-F v2** — real per-peer retrieval (not boolean), measure compounding under genuine retrieval-quality variance.
./README.md:125:- **Codebase rename** — coordinated `akashik → akashik` migration across npm, GitHub, DNS.
./README.md:134:Akashik is pre-launch — the federation simulator validates the thesis, the retrieval stack benchmarks at parity with public single-user baselines, and the real pilot is the next milestone. We need:
./README.md:144:Pre-launch. Simulator-validated, retrieval-benchmarked, pilot pending. Two-name period in effect (`akashik` in code, `Akashik` in marketing). Public protocol spec lands with the rename.
./demo/scene-touch.sh:3:# akashik demo — scene 6 (P2P touch) end-to-end orchestrator.
./demo/scene-touch.sh:42:export AKASHIK_DEMO_PEER_B_ID=$(cat "$HOME/.akashik.demo/peer-B-id")
./demo/scene-touch.sh:43:export AKASHIK_DEMO_PEER_C_ID=$(cat "$HOME/.akashik.demo/peer-C-id")
./demo/scene-touch.sh:44:export AKASHIK_DEMO_PEER_D_ID=$(cat "$HOME/.akashik.demo/peer-D-id")
./demo/scene-touch.sh:45:export AKASHIK_DEMO_PEER_E_ID=$(cat "$HOME/.akashik.demo/peer-E-id")
./tests/phase5.ask-report.test.ts:58:  const tmp = mkdtempSync(join(tmpdir(), 'akashik-phase5-'));
./tests/phase5.ask-report.test.ts:101:    assert.ok(md.includes('# akashik report'));
./demo/teardown-p2p.sh:3:# akashik demo — P2P touch teardown.
./demo/teardown-p2p.sh:14:# `~/.akashik.demo*.archived-<ts>` so the next setup starts
./demo/teardown-p2p.sh:25:  "${AKASHIK_DEMO_HOME:-$HOME/.akashik.demo}"
./demo/teardown-p2p.sh:26:  "${AKASHIK_DEMO_PEER_B_HOME:-$HOME/.akashik.demo-peerB}"
./demo/teardown-p2p.sh:27:  "${AKASHIK_DEMO_PEER_C_HOME:-$HOME/.akashik.demo-peerC}"
./demo/teardown-p2p.sh:28:  "${AKASHIK_DEMO_PEER_D_HOME:-$HOME/.akashik.demo-peerD}"
./demo/teardown-p2p.sh:29:  "${AKASHIK_DEMO_PEER_E_HOME:-$HOME/.akashik.demo-peerE}"
./demo/teardown-p2p.sh:32:echo "── akashik P2P teardown ────────────────────────────"
./demo/teardown-p2p.sh:37:    if AKASHIK_HOME="$h" akashik daemon stop 2>/dev/null; then
./demo/teardown-p2p.sh:48:# Belt-and-braces — kill any akashik daemon process still alive
./demo/teardown-p2p.sh:51:# main akashik daemon if it shares the parent terminal session.
./demo/teardown-p2p.sh:52:if pgrep -fl "akashik.*daemon.*_run" >/dev/null 2>&1; then
./demo/teardown-p2p.sh:54:  pkill -TERM -f "akashik.*daemon.*_run" 2>/dev/null || true
./src/infrastructure/search-gossip.ts:6: * `akashik ask --peers` from O(peers × dial_handshake_ms) to
./src/infrastructure/search-gossip.ts:14: *   /akashik/search/1.0.0           — request topic
./src/infrastructure/search-gossip.ts:15: *   /akashik/search-resp/1.0.0      — response topic
./src/infrastructure/search-gossip.ts:72:export const SEARCH_REQ_TOPIC = '/akashik/search/1.0.0' as const;
./src/infrastructure/search-gossip.ts:73:export const SEARCH_RESP_TOPIC = '/akashik/search-resp/1.0.0' as const;
./src/infrastructure/search-gossip.ts:226:// loaded (~/.akashik/swarm-corpus.jsonl), it ALSO publishes
./src/infrastructure/tree-sitter-parser.ts:5: * CRITICAL: tree-sitter and its grammar packages are CommonJS. akashik
./demo/validate-reputation.sh:3:# akashik demo — peer reputation validation harness.
./demo/validate-reputation.sh:7:# via `akashik peers rep` to verify the wire-up actually
./demo/validate-reputation.sh:22:A_HOME="${AKASHIK_DEMO_HOME:-$HOME/.akashik.demo}"
./demo/validate-reputation.sh:43:# `akashik ask --peers` boots its OWN ephemeral libp2p node and
./demo/validate-reputation.sh:51:AKASHIK_HOME="$A_HOME" akashik daemon stop || true
./demo/validate-reputation.sh:52:# Remove the stale daemon.sock — the bin/akashik.js shim's
./demo/validate-reputation.sh:72:  AKASHIK_HOME="$A_HOME" akashik ask "$q" --peers --k 5 \
./demo/validate-reputation.sh:84:echo "── \`akashik peers rep\` (default — top-3 per peer) ──"
./demo/validate-reputation.sh:85:AKASHIK_HOME="$A_HOME" akashik peers rep || true
./demo/validate-reputation.sh:88:echo "── \`akashik peers rep --subject room:research\` ──"
./demo/validate-reputation.sh:89:AKASHIK_HOME="$A_HOME" akashik peers rep --subject room:research || true
./demo/validate-reputation.sh:92:echo "── raw rep file (~/.akashik.demo/peer-reputation.json) ──"
./src/infrastructure/linked-accounts.ts:5: * Persisted at `~/.akashik/linked-accounts.json` with an atomic
./src/infrastructure/linked-accounts.ts:25: * verified-at timestamp says "akashik proved the user controls
./demo/timing.tape:1:# akashik — single-frame timing teaser
./demo/timing.tape:3:# Shows the headline number — `akashik ask` returning a full
./demo/timing.tape:27:Type "export AKASHIK_HOME=$HOME/.akashik.demo"
./demo/timing.tape:38:Type 'time akashik ask "who runs quench-detection LSTM research" --k 3 | head -20'
./src/infrastructure/identity-store.ts:3: * `~/.akashik/identity/` (or the caller-supplied home directory).
./src/infrastructure/identity-store.ts:61:/** Build the identity-layer file paths from a akashik home directory. */
./src/infrastructure/peer-reputation-store.ts:3: * `~/.akashik/peer-reputation.json`.
./src/infrastructure/peer-reputation-store.ts:57: * Load `peer-reputation.json` from the akashik home directory.
./src/infrastructure/recall-sync.ts:4: * Sibling protocol to /akashik/search/1.0.0. The architectural
./src/infrastructure/recall-sync.ts:12: *   - Mirrors how /akashik/touch/1.0.0 sits next to /search.
./src/infrastructure/recall-sync.ts:41:export const RECALL_PROTOCOL_ID = '/akashik/recall/1.0.0' as const;
./tests/peer-telemetry.test.ts:235:  assert.match(lines[0], /^─+ akashik peer pull/);
./demo/setup.sh:3:# akashik demo — one-shot setup.
./demo/setup.sh:6:# akashik home, then verifies the install with a sample query.
./demo/setup.sh:8:# ~/.akashik.demo so the demo always starts from the same place.
./demo/setup.sh:16:#   AKASHIK_DEMO_HOME   alternate data home (default ~/.akashik.demo)
./demo/setup.sh:21:DEMO_HOME="${AKASHIK_DEMO_HOME:-$HOME/.akashik.demo}"
./demo/setup.sh:24:echo "── akashik demo setup ─────────────────────────────"
./demo/setup.sh:39:AKASHIK_HOME="$DEMO_HOME" akashik daemon stop 2>/dev/null || true
./demo/setup.sh:41:# 3. Load each markdown note via `akashik save`. Each file is
./demo/setup.sh:53:  if AKASHIK_HOME="$DEMO_HOME" akashik save \
./demo/setup.sh:70:AKASHIK_HOME="$DEMO_HOME" akashik ask \
./demo/setup.sh:78:echo "    AKASHIK_HOME=$DEMO_HOME akashik ask \"who runs the cryo lab at stanford\""
./demo/setup.sh:79:echo "    AKASHIK_HOME=$DEMO_HOME akashik recall stanford-cryo-lab"
./demo/setup.sh:80:echo "    AKASHIK_HOME=$DEMO_HOME akashik metrics | jq ."
./tests/bench-tier-promotion.test.ts:8: * This is a akashik-specific axis — no public benchmark exists
./src/infrastructure/github-oauth.ts:6: *   1. akashik runs in a terminal on the user's laptop. There's
./src/infrastructure/github-oauth.ts:30: *   - User-Agent identifies akashik so GitHub's audit log can
./src/infrastructure/github-oauth.ts:119:const USER_AGENT = 'akashik-oauth/1.0';
./tests/bench-onnx.test.ts:136:    console.log(`    akashik:       ${(avgR5 * 100).toFixed(1)}% R@5 (measured, real ONNX)`);
./demo/README.md:1:# akashik — demo
./demo/README.md:10:bash demo/setup.sh         # loads the corpus into ~/.akashik.demo
./demo/README.md:18:export AKASHIK_HOME=$HOME/.akashik.demo
./demo/README.md:20:akashik ask "ML methods for liquid hydrogen leak detection" --k 3
./demo/README.md:21:akashik recall stanford-cryo-lab
./demo/README.md:22:akashik recall nasa-glenn
./demo/README.md:23:akashik metrics | jq .
./demo/README.md:44:| `scene-claude.gif`        | Side-by-side: Claude alone vs Claude + akashik (1200×800, ~350 KB). |
./demo/README.md:52:The VHS-rendered GIFs are real recordings of `akashik` running against the
./demo/README.md:74:`~/.akashik.demo*` home with a unique research note. Records the
./src/infrastructure/hw-detect.ts:3: * compute resources. Drives the rerank-tier picker so akashik
./src/infrastructure/code-graph.ts:4: * Opens ~/.akashik/code-graph.db (separate from vectors.db per
./demo/setup-p2p.sh:3:# akashik demo — P2P touch setup (5-peer mesh).
./demo/setup-p2p.sh:5:# Brings up 5 akashik daemons on 127.0.0.1 (peer A + 4 peers
./demo/setup-p2p.sh:7:# is connected to all four — `akashik touch` from A pulls just
./demo/setup-p2p.sh:29:A_HOME="${AKASHIK_DEMO_HOME:-$HOME/.akashik.demo}"
./demo/setup-p2p.sh:36:  "${AKASHIK_DEMO_PEER_B_HOME:-$HOME/.akashik.demo-peerB}"
./demo/setup-p2p.sh:37:  "${AKASHIK_DEMO_PEER_C_HOME:-$HOME/.akashik.demo-peerC}"
./demo/setup-p2p.sh:38:  "${AKASHIK_DEMO_PEER_D_HOME:-$HOME/.akashik.demo-peerD}"
./demo/setup-p2p.sh:39:  "${AKASHIK_DEMO_PEER_E_HOME:-$HOME/.akashik.demo-peerE}"
./demo/setup-p2p.sh:86:echo "── akashik P2P touch setup (5-daemon mesh) ─────────"
./demo/setup-p2p.sh:114:  AKASHIK_HOME="$home" akashik daemon stop 2>/dev/null || true
./demo/setup-p2p.sh:123:AKASHIK_HOME="$A_HOME" akashik identity init >/dev/null 2>&1 || true
./demo/setup-p2p.sh:124:AKASHIK_HOME="$A_HOME" akashik share room research >/dev/null
./demo/setup-p2p.sh:174:  AKASHIK_HOME="$h" akashik identity init >/dev/null
./demo/setup-p2p.sh:175:  AKASHIK_HOME="$h" akashik save \
./demo/setup-p2p.sh:181:  AKASHIK_HOME="$h" akashik save \
./demo/setup-p2p.sh:187:  AKASHIK_HOME="$h" akashik share room research >/dev/null
./demo/setup-p2p.sh:195:AKASHIK_HOME="$A_HOME" akashik daemon start
./demo/setup-p2p.sh:200:  AKASHIK_HOME="${HOMES[$i]}" akashik daemon start
./demo/setup-p2p.sh:208:# Note: `akashik peer add` boots an ephemeral libp2p node to
./demo/setup-p2p.sh:214:A_PEERID=$(AKASHIK_HOME="$A_HOME" akashik peer status 2>/dev/null | awk '/peerId/ {print $2}')
./demo/setup-p2p.sh:229:    pid=$(AKASHIK_HOME="$h" akashik peer status 2>/dev/null | awk '/peerId/ {print $2}')
./demo/setup-p2p.sh:277:# rendering. Mirrors what real `akashik login` would produce
./demo/setup-p2p.sh:289:    pid=$(AKASHIK_HOME="$h" akashik peer status 2>/dev/null | awk '/peerId/ {print $2}')
./demo/setup-p2p.sh:290:    did=$(AKASHIK_HOME="$h" akashik identity show 2>/dev/null | awk '/user DID/ {print $3}')
./demo/setup-p2p.sh:318:AKASHIK_HOME="$A_HOME" akashik daemon start
./demo/setup-p2p.sh:321:  AKASHIK_HOME="${HOMES[$i]}" akashik daemon start
./demo/screencast.tape:1:# akashik — terminal demo (screencast)
./demo/screencast.tape:28:Type "export AKASHIK_HOME=$HOME/.akashik.demo"
./demo/screencast.tape:36:Type '# akashik — local-first knowledge graph for AI agents'
./demo/screencast.tape:43:Type 'time akashik ask "ML methods for liquid hydrogen leak detection" --k 3'
./demo/screencast.tape:54:Type 'akashik recall stanford-cryo-lab'
./demo/screencast.tape:65:Type 'akashik recall nasa-glenn'
./demo/screencast.tape:76:Type 'akashik peers rep'
./demo/screencast.tape:83:Type 'echo "akashik — local-first knowledge for AI agents"'
./demo/screencast.tape:95:Type 'echo "  github.com/SaharBarak/akashik"'
./src/infrastructure/search-sync.ts:4: * Phase 17 core. Registers /akashik/search/1.0.0 on a libp2p node.
./src/infrastructure/search-sync.ts:9: *   1. SEARCH_PROTOCOL_ID is '/akashik/search/1.0.0' — separate from
./src/infrastructure/search-sync.ts:10: *      '/akashik/share/1.0.0' so sync and search have independent stream
./src/infrastructure/search-sync.ts:53:export const SEARCH_PROTOCOL_ID = '/akashik/search/1.0.0' as const;
./src/infrastructure/search-sync.ts:413: * Register the /akashik/search/1.0.0 protocol on the libp2p node.
./src/infrastructure/search-sync.ts:437: * Unregister the /akashik/search/1.0.0 protocol.
./src/infrastructure/search-sync.ts:486:            `akashik: peer ${peerIdStr} search error: ${resp.error}\n`,
./tests/contextual-enrich.test.ts:10: * Xenova model when AKASHIK_BENCH_PUBLIC_REAL is unset, so the
./src/application/consolidator.ts:81:   * does NOT call persist/mark. Useful for `akashik consolidate
./tests/identity.test.ts:172:    const msg = new TextEncoder().encode('hello akashik');
./tests/identity.test.ts:258:      room: 'akashik-dev',
./src/infrastructure/share-sync.ts:4: * Phase 16 core. Registers /akashik/share/1.0.0 on a libp2p node,
./src/infrastructure/share-sync.ts:76:export const SHARE_PROTOCOL_ID = '/akashik/share/1.0.0' as const;
./src/infrastructure/share-sync.ts:85:export const REMOTE_ORIGIN: unique symbol = Symbol('akashik-share-remote');
./src/infrastructure/share-sync.ts:367: *   2. Carry _akashik_source_peer: <peerId> as a provenance tag
./src/infrastructure/share-sync.ts:448:        _akashik_source_peer: remotePeerId,
./src/infrastructure/share-sync.ts:449:        ...(screened.signedBy ? { _akashik_signed_by: screened.signedBy } : {}),
./src/infrastructure/share-sync.ts:556:  readonly ydocsDir: string;                           // ~/.akashik/ydocs
./src/infrastructure/share-sync.ts:579:   * `akashik identity peers` (future) and audit logs can answer
./src/infrastructure/share-sync.ts:633: * Register the /akashik/share/1.0.0 protocol on the libp2p node.
./demo/scene-codebase.tape:1:# akashik — scene 7 — codebase Q&A inside Claude Code
./demo/scene-codebase.tape:3:# The akashik repo is indexed into ~/.akashik.demo (room
./demo/scene-codebase.tape:4:# `akashik`, 342 nodes including 249 code chunks + 50 git log
./demo/scene-codebase.tape:10:# akashik hook, the relevant code chunks (and the very commit
./demo/scene-codebase.tape:13:# Run: bash demo/setup.sh && AKASHIK_HOME=~/.akashik.demo \
./demo/scene-codebase.tape:14:#        akashik this me  &&  vhs demo/scene-codebase.tape
./demo/scene-codebase.tape:33:Type "export AKASHIK_HOME=$HOME/.akashik.demo"
./demo/scene-codebase.tape:35:Type "cd /Users/saharbarak/personal/akashik"
./demo/scene-codebase.tape:42:Type '# Claude Code session in the akashik repo'
./demo/scene-codebase.tape:44:Type '# PreToolUse hook fires before any Read/Glob/Grep — akashik prefetches'
./demo/scene-codebase.tape:48:Type 'time claude -p "How does the akashik daemon do bounded backpressure on the job queue? Cite the file path and key constants."'
./demo/scene-codebase.tape:54:Type 'echo "↑ akashik-prefetched: Claude cites src/daemon/job-queue.ts directly"'
./src/infrastructure/rooms-config.ts:4: * Stores the room registry at `~/.akashik/rooms.json`. Same
./demo/scene-federated.sh:3:# akashik demo — scene "federated" end-to-end orchestrator.
./tests/phase1.graph-rooms.test.ts:76:  const tmp = mkdtempSync(join(tmpdir(), 'akashik-phase1-'));
./tests/phase34.save-note.test.ts:4: * Covers the pure helpers that back the `akashik save` CLI:
./tests/phase34.save-note.test.ts:56:    assert.strictEqual(n.source_file, 'akashik:save');
./src/infrastructure/async-mutex.ts:7: * keeps OTHER akashik processes off the files; this mutex
./src/application/ingest.ts:20: *      (a new akashik extra field — not in graphify's patch but
./tests/bench-standard.test.ts:191:    console.log(`  ║  BEIR/HotPotQA-style Benchmark (akashik v1.1)       ║`);
./tests/bench-standard.test.ts:216:    console.log(`  ║    akashik (this run):   ${(overall.r5 * 100).toFixed(1)}% R@5, ${(overall.ndcg10 * 100).toFixed(1)}% NDCG@10  ║`);
./src/infrastructure/oracle-gossip.ts:54:export const ORACLE_TOPIC = '/akashik/oracle/1.0.0';
./src/infrastructure/peer-transport.ts:26:// the small networks akashik targets at this stage. Gossipsub 14.x
./src/infrastructure/peer-transport.ts:27:// still targets @libp2p/interface v2 while akashik uses v3, so
./src/infrastructure/peer-transport.ts:230:            `akashik: mDNS unavailable (${(e as Error).message}). ` +
./src/infrastructure/peer-transport.ts:251:        ...(dhtOn ? { dht: kadDHT({ clientMode: true, protocol: '/akashik/kad/1.0.0' }) } : {}),
./src/infrastructure/peer-transport.ts:331:            (e) => process.stderr.write(`akashik: peer:discovery persist failed: ${e.type}\n`),
./src/infrastructure/peer-transport.ts:376:        tags: { 'keep-alive-akashik': { value: 50 } },
./tests/phase31.remote-node-validator.test.ts:5: * known-bad node shape must be rejected; every legitimate akashik
./tests/phase31.remote-node-validator.test.ts:6: * node must pass. If either side breaks, akashik becomes either
./tests/phase31.remote-node-validator.test.ts:32:    room: 'akashik-dev',
./tests/phase35.p2p-touch-e2e.test.ts:89:      room: 'akashik-dev',
./tests/phase35.p2p-touch-e2e.test.ts:198:    // physical room is `akashik-dev`, NOT 'toolshed' — virtual
./tests/bench-locomo-real.test.ts:18: * strings. We collapse to the set of source SESSIONS — akashik
./tests/bench-locomo-real.test.ts:31: *   AKASHIK_BENCH_PUBLIC_REAL=1
./tests/bench-locomo-real.test.ts:222:  if (process.env.AKASHIK_BENCH_PUBLIC_REAL !== '1') {
./tests/bench-locomo-real.test.ts:223:    t.skip('AKASHIK_BENCH_PUBLIC_REAL not set — skipping real-corpus suite');
./tests/phase29.rust-retrieval-regression.test.ts:87:  return join(here, '..', 'akashik-rs', 'target', 'release', 'embed_server');
./tests/phase29.rust-retrieval-regression.test.ts:99:      'akashik-rs embed_server binary not built — build with `cargo build --release --manifest-path akashik-rs/Cargo.toml` or set AKASHIK_RUST_BIN',
./tests/phase3.mcp.test.ts:137:  const tmp = mkdtempSync(join(tmpdir(), 'akashik-phase3-'));
./tests/bench-real.test.ts:230:    // The 30-item labeled corpus with NDCG@5 is akashik's BEIR
./tests/bench-longmemeval-real.test.ts:26: *   AKASHIK_BENCH_PUBLIC_REAL=1
./tests/bench-longmemeval-real.test.ts:103:  if (process.env.AKASHIK_BENCH_PUBLIC_REAL !== '1') {
./tests/bench-longmemeval-real.test.ts:104:    t.skip('AKASHIK_BENCH_PUBLIC_REAL not set — skipping real-corpus suite');
./tests/bench-longmemeval-real.test.ts:397:  // their full pipeline + reranker. akashik retrieves with
./src/application/use-cases.ts:237:// downstream callers can `import { Result } from 'akashik/application'`
./tests/phase20.sessions.test.ts:542:  it('SESS-07 K2: hook script shells out to akashik recent-sessions --hours 24 --json', () => {
./tests/phase20.sessions.test.ts:565:  it('K5: hook script guards akashik binary with command -v before shelling out', () => {
./tests/phase20.sessions.test.ts:567:    assert.match(src, /command -v akashik/, 'PATH guard required');
./tests/phase20.sessions.test.ts:574:    const hookScriptName = 'akashik-hook.sh';
./src/application/bip39-recovery.ts:10: *     `akashik identity import` autodetects the format.
./tests/release.test.ts:80:  const message = new TextEncoder().encode(`akashik-release:v1:${json}`);
./tests/error-hints.test.ts:38:test('GraphReadError ENOENT → hint says run `akashik trigger`', () => {
./tests/error-hints.test.ts:42:  assert.match(h!, /akashik trigger/);
./docs/assets/logo-wordmark.svg:1:<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 64" width="360" height="64" role="img" aria-label="akashik">
./docs/assets/logo-wordmark.svg:2:  <title>akashik — wordmark</title>
./docs/assets/logo-wordmark.svg:32:  <text x="84" y="42" class="wm-text">akashik</text>
./tests/bench-akashik-federation.test.ts:2: * Bench — AkashikBench-F (federation-level compounding).
./tests/bench-akashik-federation.test.ts:135:test('bench: AkashikBench-F — federation compounding on LoCoMo', { timeout: 60 * 60 * 1000 }, async (t) => {
./tests/bench-akashik-federation.test.ts:137:    t.skip('AKASHIK_BENCH_F not set — skipping AkashikBench-F');
./tests/bench-akashik-federation.test.ts:172:  console.log(`AkashikBench-F: ${numPeers} peers × ${numSteps} steps · offline=${offlineProbability} · zipf=${zipfAlpha} · shard=${initialShardFraction} (coverage ${(totalCoverage * 100).toFixed(0)}%) · corpus=${corpus.queries.length} queries, ${corpus.allDocs.length} docs`);
./tests/bench-akashik-federation.test.ts:227:    notes: `AkashikBench-F v1 on LoCoMo factual — ${corpus.queries.length} queries × ${corpus.allDocs.length} docs · ${numPeers} peers · ${numSteps} steps · offline=${offlineProbability} · zipf=${zipfAlpha} · shard=${initialShardFraction}. Boolean federation simulator (no per-peer retrieval — see suite header). Compounding = negative slope of web_fallback_rate over the simulation.`,
./tests/identity-lifecycle.test.ts:124:      label: 'akashik v3 is a P2P memory protocol for the free LLM world',
./tests/identity-lifecycle.test.ts:125:      room: 'akashik-dev',
./tests/phase2.ingest.test.ts:66:  const tmp = mkdtempSync(join(tmpdir(), 'akashik-phase2-'));
./tests/phase2.ingest.test.ts:115:    // graph should contain 3 nodes with akashik fields set
./src/application/codebase-indexer.ts:372:          `akashik codebase: ${parseErrors} file(s) skipped due to parse errors (e.g. ${parseErrorSamples.join(', ')})\n`,
./tests/phase16.share-crdt.test.ts:69:const makeHome = (): string => mkdtempSync(join(tmpdir(), 'akashik-phase16-'));
./tests/phase16.share-crdt.test.ts:951:  test('SHARE_PROTOCOL_ID is /akashik/share/1.0.0', () => {
./tests/phase16.share-crdt.test.ts:952:    assert.equal(SHARE_PROTOCOL_ID, '/akashik/share/1.0.0');
./tests/phase16.share-crdt.test.ts:955:  test('REMOTE_ORIGIN is a Symbol with description akashik-share-remote', () => {
./tests/phase16.share-crdt.test.ts:959:      'akashik-share-remote',
./tests/phase16.share-crdt.test.ts:967:    assert.notEqual(REMOTE_ORIGIN as unknown, Symbol('akashik-share-remote'), 'two Symbol() calls with same desc are not equal');
./tests/log-store.test.ts:67:      room: 'akashik-dev',
./tests/identity-bridge.test.ts:65:      room: 'akashik-dev',
./tests/bench-scifact-real.test.ts:17: *   AKASHIK_BENCH_PUBLIC_REAL=1
./tests/bench-scifact-real.test.ts:107:  if (process.env.AKASHIK_BENCH_PUBLIC_REAL !== '1') {
./tests/bench-scifact-real.test.ts:108:    t.skip('AKASHIK_BENCH_PUBLIC_REAL not set — skipping real-corpus suite');
./src/application/peer-pull-telemetry.ts:7: * smart-hook, and `akashik ask --peers` CLI tail.
./docs/assets/manifesto-illustration.svg:1:<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 220" width="1100" height="220" role="img" aria-label="lineage timeline: Napster, eMule, BitTorrent, IPFS, akashik">
./docs/assets/manifesto-illustration.svg:2:  <title>akashik — cooperative-network lineage timeline</title>
./docs/assets/manifesto-illustration.svg:52:  <!-- akashik — 2026, knowledge -->
./docs/assets/manifesto-illustration.svg:58:    <text class="ln-mark" text-anchor="middle" y="36" font-weight="700">akashik</text>
./src/application/update-checker.ts:11: *   - npm-based installs (the canonical akashik distribution)
./src/application/update-checker.ts:12: *     already have an idiomatic upgrade path (`npm update -g akashik`)
./src/application/update-checker.ts:20: * v3.1 may add a `akashik update install` flow for the npm path
./src/application/update-checker.ts:135: * eligibility (for `akashik update status` reporting).
./src/application/update-checker.ts:145:        PeerError.identityReadError(updatePaths(homeDir).configPath, 'update not configured — run `akashik update configure`'),
./docs/banner.svg:1:<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 640" fill="none" role="img" aria-label="akashik — the network before the web. peer-to-peer knowledge graph for AI agents.">
./docs/banner.svg:83:        fill="#f7f4ec" letter-spacing="-3">akashik</text>
./docs/banner.svg:116:    <text x="44" y="48">github.com/SaharBarak/akashik</text>
./src/application/identity-bridge.ts:34:import { akashikHome } from '../cli/runtime.js';
./src/application/identity-bridge.ts:52:    const home = homeOverride ?? akashikHome();
./docs/assets/_graph-fallback.svg:1:<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500" role="img" aria-label="akashik network — sample 50-node knowledge graph">
./docs/assets/_graph-fallback.svg:2:  <title>akashik knowledge graph — static fallback for §11 live demo on mobile / unreachable backend</title>
./docs/assets/og-square.svg:1:<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" width="1200" height="1200" role="img" aria-label="akashik — The globally accumulating knowledge network. For AI agents and humans.">
./docs/assets/og-square.svg:2:  <title>akashik — Open Graph square / LinkedIn carousel cover</title>
./docs/assets/og-square.svg:24:    <text x="56" y="22" class="og-mark" font-size="32">akashik</text>
./docs/assets/og-square.svg:63:  <text class="og-meta" font-size="20" x="96" y="1140">github.com/twocirclestudios/akashik</text>
./src/application/report.ts:120:  lines.push(`# akashik report — ${data.room}`);
./docs/assets/logo-mark.svg:1:<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="akashik mark">
./docs/assets/logo-mark.svg:2:  <title>akashik — 6-peer mesh mark</title>
./docs/assets/og-portrait.svg:1:<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1080 1920" width="1080" height="1920" role="img" aria-label="akashik — The globally accumulating knowledge network. For AI agents and humans.">
./docs/assets/og-portrait.svg:2:  <title>akashik — vertical share card (Stories / TikTok / IG portrait)</title>
./docs/assets/og-portrait.svg:24:    <text x="64" y="28" class="og-mark" font-size="36">akashik</text>
./docs/assets/og-portrait.svg:66:  <text class="og-meta" font-size="24" x="96" y="1820">github.com/twocirclestudios/akashik</text>
./docs/assets/logo-monochrome.svg:1:<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 64" width="360" height="64" role="img" aria-label="akashik">
./docs/assets/logo-monochrome.svg:2:  <title>akashik — monochrome wordmark for non-brand placements</title>
./docs/assets/logo-monochrome.svg:32:  <text x="84" y="42" class="wm-text">akashik</text>
./docs/PROJECT-PLAN-AKASHIK.md:1:# Akashik — project plan
./docs/PROJECT-PLAN-AKASHIK.md:5:engineering month on AkashikBench-F and federation routing; next
./docs/PROJECT-PLAN-AKASHIK.md:9:the brand is now Akashik — the codebase is still `akashik` and
./docs/PROJECT-PLAN-AKASHIK.md:12:credibility anchor for the mission; AkashikBench-F is the only
./docs/PROJECT-PLAN-AKASHIK.md:18:AkashikBench-F was scaffolded today
./docs/PROJECT-PLAN-AKASHIK.md:27:Codebase is still named `akashik`; brand is Akashik; the
./docs/PROJECT-PLAN-AKASHIK.md:36:AkashikBench-F + federation routing because validating the
./docs/PROJECT-PLAN-AKASHIK.md:40:- **24.1 AkashikBench-F parameter sweep.** Run the existing simulator
./docs/PROJECT-PLAN-AKASHIK.md:100:    `src/daemon/ipc.ts` written to `~/.akashik/ipc.token`
./docs/PROJECT-PLAN-AKASHIK.md:126:pigeonholes Akashik as 'niche debugging tool' — but guarantees
./docs/PROJECT-PLAN-AKASHIK.md:134:  Each artifact saved via `akashik save --type research` from
./docs/PROJECT-PLAN-AKASHIK.md:158:  90-second video walkthrough + `npm install -g akashik` +
./docs/PROJECT-PLAN-AKASHIK.md:159:  `akashik share` to join the pilot rooms. Success criterion:
./docs/PROJECT-PLAN-AKASHIK.md:187:  and expose `akashik quarantine list / replay` so operators
./docs/PROJECT-PLAN-AKASHIK.md:249:- **No premature rebrand-PR (`akashik → akashik` package
./docs/PROJECT-PLAN-AKASHIK.md:251:  participants install `akashik` and read about Akashik;
./docs/PROJECT-PLAN-AKASHIK.md:332:  `akashik metrics fallback --room <room>` returns a per-day
./docs/PROJECT-PLAN-AKASHIK.md:341:- **AkashikBench-F v2 is at least started.** v1 is boolean-set
./docs/PROJECT-PLAN-AKASHIK.md:354:  and the AkashikBench-F design brief.
./docs/PROJECT-PLAN-AKASHIK.md:369:- [docs/marketing/storybrand-messaging-draft.md](./marketing/storybrand-messaging-draft.md)
./docs/assets/og-card.svg:1:<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630" role="img" aria-label="akashik — The globally accumulating knowledge network. For AI agents and humans.">
./docs/assets/og-card.svg:2:  <title>akashik — Open Graph social card</title>
./docs/assets/og-card.svg:27:    <text x="56" y="22" class="og-mark" font-size="32">akashik</text>
./docs/assets/og-card.svg:39:  <text class="og-meta" font-size="18" x="72" y="572">github.com/twocirclestudios/akashik</text>
./docs/protocol/PROTOCOL-QUALITY-QUESTIONS.md:4:parts of akashik that decide whether peer knowledge is good enough for an
./docs/protocol/PROTOCOL-QUALITY-QUESTIONS.md:14:akashik becomes a serious agent-memory protocol.
./docs/protocol/PROTOCOL-QUALITY-QUESTIONS.md:201:2. akashik retrieves local + peer candidates.
./docs/protocol/PROTOCOL-QUALITY-QUESTIONS.md:241:  "room": "akashik-dev",
./docs/protocol/PROTOCOL-QUALITY-QUESTIONS.md:521:akashik should treat this as a protocol problem:
./docs/protocol/PROTOCOL-QUALITY-QUESTIONS.md:594:- Can the agent ask akashik for "coverage" instead of "search"?
./docs/protocol/PROTOCOL-QUALITY-QUESTIONS.md:814:If akashik works, peers are not just caches. They become sources of
./docs/protocol/PROTOCOL-QUALITY-QUESTIONS.md:1185:- Which metrics should be visible in `akashik stats`?
./docs/architecture/claude-obsidian-parity.md:15:| **Skill trigger vocabulary** (rich frontmatter trigger phrases: "ingest this url", "what do you know about", "/save", "find orphans", …) | `.claude/skills/akashik/SKILL.md` has 7 triggers | **Minor.** Our skill is wired but the vocabulary is narrow; natural-sounding phrases like "save this to akashik" don't activate. |
./docs/architecture/claude-obsidian-parity.md:35:**Add:** `akashik/hot-cache` — a new domain concept. After each tick, generate a ~500-word summary of: (a) newest N nodes, (b) most-queried rooms this session, (c) pending ingests, (d) 3-5 most surprising cross-references. Store at `~/.akashik/hot.md` and include in SessionStart hook output.
./docs/architecture/claude-obsidian-parity.md:37:**Why:** Session continuity is the single biggest daily UX improvement. Today Claude walks into a akashik session with no context. With a hot cache, the first thing Claude reads is an actionable recency digest.
./docs/architecture/claude-obsidian-parity.md:43:**Add:** `akashik lint [--room R] [--fix]` — graph-health checker with the 8 categories from claude-obsidian's wiki-lint, plus P2P-specific ones (orphaned remote nodes, stale shared-room manifest, secret-pattern drift since last audit).
./docs/architecture/claude-obsidian-parity.md:51:**Add:** `akashik save --room R` — called from a Claude session, takes the last N assistant messages + the user question, produces a typed node (synthesis/concept/decision), writes into the chosen room. Complements auto-ingest by capturing *distillations*, not transcripts.
./docs/architecture/claude-obsidian-parity.md:59:**Add:** `~/.akashik/research-program.md` — a YAML+markdown config read by `discover-loop` to parameterise source preferences, min-confidence gate, round depth, stop conditions. Mirrors claude-obsidian's `program.md`.
./docs/architecture/claude-obsidian-parity.md:79:**Add:** Expand `.claude/skills/akashik/SKILL.md` frontmatter to include trigger phrases matching claude-obsidian's voice: "save this to X", "ingest this url", "what do you know about", "find orphans", etc.
./docs/architecture/claude-obsidian-parity.md:87:Porting their hot cache and lint into akashik closes the two biggest UX gaps with ~5 hours of work. That gets us parity on session continuity and graph hygiene while keeping all our structural advantages (vectors, P2P, adapters, Rust). No need to fork — we cherry-pick the two patterns that are worth owning.
./src/telegram/capture.ts:60:    return 'No rooms configured. Run `akashik init` first.';
./docs/research/energy-based-contradiction-detection.md:5:**Author:** Akashik core
./docs/research/energy-based-contradiction-detection.md:76:Three real options, ranked by what fits Akashik's CPU-only +
./docs/research/energy-based-contradiction-detection.md:127:2. **User feedback on `akashik contradictions resolve --prefer
./docs/research/energy-based-contradiction-detection.md:207:3. **Cross-language.** Akashik is currently English-only on the
./docs/research/energy-based-contradiction-detection.md:256:- Akashik Phase 22 auto-forget contradiction pass: `src/domain/auto-forget.ts:contradictsPass`
./docs/architecture/ADR-002-v4-agent-brain.md:1:# ADR-002 — akashik v4 Agent Brain design decisions
./docs/architecture/ADR-002-v4-agent-brain.md:36:- No structured types on the wire — JSON only. Acceptable because the handler registry is small and version-bumped via the protocol ID (`/akashik/search/2.0.0`).
./docs/architecture/ADR-002-v4-agent-brain.md:47:- Server-side coalescing in `akashik-rs/src/bin/embed_server.rs` (tokio + async channel + thread pool). High effort, requires a Rust async refactor.
./docs/architecture/ADR-002-v4-agent-brain.md:92:**Chosen:** `akashik consolidate run <room>` is an explicit CLI command, run by an operator (or a cron job, or the daemon's tick loop in v4.1). Not auto-run on a timer in v4.0.
./docs/architecture/ADR-002-v4-agent-brain.md:138:**Chosen:** `${AKASHIK_HOME}/akashik.lock` — POSIX exclusive-create file with `{pid, owner, timestamp}` content. Daemon refreshes every 20s; consolidate waits up to 30s.
./docs/architecture/ADR-002-v4-agent-brain.md:151:- **Operator-debuggable** — `cat ~/.akashik/akashik.lock` shows who holds it
./src/telegram/commands.ts:104:    '*akashik status*',
./src/telegram/commands.ts:128:    '*akashik commands:*',
./docs/demo.tape:1:# akashik CLI demo — accumulate · share · stream
./docs/demo.tape:4:# Thesis: akashik is a COMMUNITY network. Everyone who runs it
./docs/demo.tape:11:#   1. Thesis banner       — what akashik does in one sentence
./docs/demo.tape:44:Type `echo "▸ akashik — accumulate · share · stream knowledge into every LLM session"`
./docs/demo.tape:57:Type "akashik peer status"
./docs/demo.tape:70:Type@28ms `akashik ask "vector search sqlite" --k 3`
./docs/demo.tape:80:Type "# federate — every akashik peer, anywhere, contributes a shard"
./docs/demo.tape:83:Type@28ms `akashik ask "P2P knowledge graph" --k 3 --peers`
./docs/demo.tape:96:Type "claude mcp get akashik"
./src/telegram/bot.ts:2: * Telegram bot — long-polling client for akashik.
./src/telegram/bot.ts:47:    return errAsync(GE.readError('telegram', 'bot not configured — run akashik telegram setup'));
./docs/memory-stack.svg:1:<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1400 1020" fill="none" role="img" aria-label="Why akashik compounds — same Claude session, two different Fridays">
./docs/memory-stack.svg:94:  <!-- ─── RIGHT COLUMN — with akashik ────────────────── -->
./docs/memory-stack.svg:105:      <text x="840" y="227" font-size="13" font-family="'JetBrains Mono','SF Mono','Menlo',monospace" fill="#b4b4c0">PreToolUse hook fires · `akashik ask` runs before Claude reaches for a tool</text>
./docs/research/beat-the-competitors-retrieval-plan.md:1:# How Akashik beats the retrieval leaderboard (forward plan)
./docs/research/beat-the-competitors-retrieval-plan.md:6:| Benchmark | Akashik | Competitor best | Gap |
./docs/research/beat-the-competitors-retrieval-plan.md:89:If those land, **Akashik becomes the published-leaderboard leader on LME-S** with a fully open-source, CPU-only, retrieval-only pipeline. No LLM judge, no GPT-4 reasoning loop, no closed-weight model — just a clean hybrid sparse+dense+rerank+graph pipeline that beats the proprietary stacks.
./docs/research/beat-the-competitors-retrieval-plan.md:124:Once leaderboard-leading on retrieval, the next frontier is **hybrid retrieval + LLM extraction with SQuAD-F1 + LLM-judge as competing axes in the composite**. That makes Akashik comparable to mem0's 92.5 LoCoMo composite — different scoring philosophy, head-to-head. Phase 23.8 already laid the SQuAD-F1 foundation; Phase 24 adds the judge axis.
./docs/research/beat-the-competitors-retrieval-plan.md:126:Beyond that: **federated retrieval** (the unique Akashik bet) — measure how P2P-shared rooms across multiple peers lift recall on out-of-distribution questions, vs single-peer baselines. No public benchmark covers this today; we'd publish one.
./docs/research/beat-the-competitors-retrieval-plan.md:187:- **Bus factor on `akashik-rs`** — Rust ARM cross-compile is specialized knowledge; consider TypeScript-only fallback path.
./docs/research/beat-the-competitors-retrieval-plan.md:190:Source: `~/.claude-octopus/results/probe-synthesis-1779351019.md` — 6 multi-LLM probes synthesized by Gemini-2.5-Pro, 2026-05-21. Full transcript preserved in claude-octopus state.
./docs/architecture/V4-PROTOCOL.md:1:# akashik v4 — Agent Brain Protocol
./docs/architecture/V4-PROTOCOL.md:4:**Status:** Reference implementation shipped in akashik v4.x; spec stabilising ahead of v4.0 tag
./docs/architecture/V4-PROTOCOL.md:28:client → daemon:  {"id": <number>, "cmd": "ask", "args": ["--room", "akashik-dev", "p2p memory"]}
./docs/architecture/V4-PROTOCOL.md:45:`bin/akashik.js` checks for the socket file BEFORE importing `dist/cli/index.js`. If present and the command is in the delegatable set (currently `ask`, `stats`), the request is forwarded over IPC. Otherwise the CLI takes the normal spawn path.
./docs/architecture/V4-PROTOCOL.md:98:Episodic memory entries (raw session transcripts, ingested chat logs, observed events) accumulate linearly. A brain compresses them via overnight replay into semantic schemas. akashik v4 ships this as a CLI primitive plus a graph-node schema.
./docs/architecture/V4-PROTOCOL.md:175:`${AKASHIK_HOME}/akashik.lock` — POSIX exclusive-create file.
./docs/architecture/V4-PROTOCOL.md:248:bin/akashik.js                  Client-side IPC delegation (Phase 1)
./docs/architecture/V4-PROTOCOL.md:285:- **v4.1 — Native binary client** (Rust `akashik-cli` that speaks the IPC protocol directly, bypassing Node boot). Target: warm-hit latency 100ms → 15ms.
./docs/research/performance-prediction-matrix.md:115:> **Akashik is the only retrieval system that adapts to whatever hardware its user has.**
./docs/README.md:1:# akashik — documentation index
./docs/README.md:18:What akashik is, why it exists, what's shipped, what's planned.
./docs/README.md:21:- [`VISION.md`](product/VISION.md) — the agent-memory protocol problem and where akashik sits in it.
./docs/README.md:25:- [`GRAPHRAG-AUDIT.md`](product/GRAPHRAG-AUDIT.md) — akashik audited against 2025/2026 GraphRAG state of the art (Microsoft GraphRAG, HippoRAG 2, LightRAG, MultiHop-RAG, LoCoMo).
./src/daemon/job-queue.ts:4: * Owned by the daemon process (one instance per `akashik daemon
./src/daemon/job-queue.ts:11: *   - Sequential output is easier to read in `akashik jobs watch`.
./src/daemon/job-queue.ts:13: * Persistence: queue + completed log written to ~/.akashik/jobs.json
./docs/research/github-star-growth.md:1:# GitHub Star Growth Research — Applied to Akashik
./docs/research/github-star-growth.md:23:7. **Real-world results with actual output**: Not synthetic demos — the literal output of running Akashik on itself.
./docs/research/github-star-growth.md:25:9. **CTA at the bottom**: "If Akashik saves you from re-Googling something you already read, give it a star."
./docs/research/github-star-growth.md:40:- [ ] Post on Hacker News (Show HN: Akashik — a knowledge graph Claude Code plugin fed by ArXiv, HN, and your codebase)
./src/daemon/ipc.ts:5: * Why: a cold `akashik ask` pays ~700 ms of Node+tsx boot + ~40 ms
./docs/index.html:6:  <title>akashik — the network before the web</title>
./docs/index.html:12:  <meta property="og:title"          content="akashik — the globally accumulating knowledge network" />
./docs/index.html:14:  <meta property="og:url"            content="https://saharbarak.github.io/akashik/" />
./docs/index.html:15:  <meta property="og:image"          content="https://saharbarak.github.io/akashik/assets/og-card.png" />
./docs/index.html:20:  <meta name="twitter:title"         content="akashik — the globally accumulating knowledge network" />
./docs/index.html:22:  <meta name="twitter:image"         content="https://saharbarak.github.io/akashik/assets/og-card.png" />
./docs/index.html:596:    /* ───── hero-compare — side-by-side: vanilla Claude vs Claude+akashik ───── */
./docs/index.html:693:       window, so akashik falls back to research and writes the
./docs/index.html:1971:        <a href="#" class="brand" aria-label="akashik home">
./docs/index.html:1973:          akashik
./docs/index.html:1983:        <a class="nav-cta" href="https://github.com/SaharBarak/akashik" rel="noopener">
./docs/index.html:1984:          SaharBarak/akashik
./docs/index.html:2026:            <pre class="install-code"><code id="install-code">$ npm install -g akashik</code><button id="install-copy" type="button" aria-label="Copy install command">
./docs/index.html:2041:            <a class="btn btn-primary" href="https://github.com/SaharBarak/akashik">
./docs/index.html:2057:        <figure class="hero-compare" aria-label="Side-by-side: vanilla Claude vs Claude with akashik answering the same question">
./docs/index.html:2080:              <span class="cmp-agent js-agent" aria-live="polite">claude code</span>&nbsp;+ akashik
./docs/index.html:2085:              <div class="cmp-step cmp-hit" data-slot="w-hit">&#9670; akashik: 11&nbsp;ms &middot; 3 cited chunks &middot; age 2d &middot; fresh</div>
./docs/index.html:2105:    <div class="try-graph-canvas" id="try-graph-canvas" aria-label="Live akashik knowledge-graph view"></div>
./docs/index.html:2147:        <h2>How akashik hooks into your workflow.</h2>
./docs/index.html:2156:            A <code>UserPromptSubmit</code> hook runs <code>akashik ask</code> on every message &mdash; top graph matches inject as <code>additionalContext</code> before the LLM reads a token.
./docs/index.html:2177:claude mcp add --scope user akashik -- akashik mcp
./docs/index.html:2178:akashik claude install
./docs/index.html:2197:          <span><b>akashik</b></span>
./docs/index.html:2222:      <pre data-reveal style="margin-top: 2rem; background: var(--ink-900); color: #e8e8ed; padding: 1rem 1.2rem; border-radius: 8px; font-family: var(--mono); font-size: 0.85rem; max-width: 720px; overflow-x: auto;"><code>$ akashik bench beir-scifact   # one command, full reproduce</code></pre>
./docs/index.html:2292:        <img src="assets/manifesto-illustration.svg" alt="Cooperative-network lineage: Napster, eMule, BitTorrent, IPFS, akashik" style="width: 100%; height: auto; display: block;" />
./docs/index.html:2298:        With service bills spiraling out of control and the stack becoming more unsustainable by the quarter, <b>akashik enters to help us work together again</b> &mdash; like we did back when the boundaries were technological. Today the boundaries are economic.
./docs/index.html:2317:        <pre class="code finale-code"><code>$ npm install -g akashik
./docs/index.html:2318:$ akashik init</code></pre>
./docs/index.html:2320:          <a class="btn btn-primary" href="https://github.com/SaharBarak/akashik">
./docs/index.html:2326:          <a class="btn btn-ghost" href="https://github.com/SaharBarak/akashik/discussions">
./docs/index.html:2334:          <a href="https://github.com/SaharBarak/akashik/stargazers">
./docs/index.html:2335:            <img src="https://img.shields.io/github/stars/SaharBarak/akashik?style=social" alt="GitHub stars" />
./docs/index.html:2337:          <a href="https://github.com/SaharBarak/akashik/releases">
./docs/index.html:2338:            <img src="https://img.shields.io/github/v/release/SaharBarak/akashik?include_prereleases&label=release&color=34d399" alt="release" />
./docs/index.html:2352:          <a href="#" class="footer-mark" aria-label="akashik home">
./docs/index.html:2354:            <span>akashik</span>
./docs/index.html:2369:            <li><a href="https://github.com/SaharBarak/akashik">GitHub</a></li>
./docs/index.html:2370:            <li><a href="https://github.com/SaharBarak/akashik/blob/main/README.md">README</a></li>
./docs/index.html:2371:            <li><a href="https://github.com/SaharBarak/akashik/issues">Issues</a></li>
./docs/index.html:2372:            <li><a href="https://github.com/SaharBarak/akashik/blob/main/LICENSE">MIT License</a></li>
./docs/index.html:2379:            <li><code>npm install -g akashik</code></li>
./docs/index.html:2380:            <li><code>brew install saharbarak/akashik/akashik</code></li>
./docs/index.html:2381:            <li><code>npx akashik init</code></li>
./docs/index.html:2402:          <a href="https://github.com/SaharBarak/akashik">github.com/SaharBarak/akashik</a>
./docs/index.html:2449:        npm:      '$ npm install -g akashik',
./docs/index.html:2450:        homebrew: '$ brew install saharbarak/akashik/akashik',
./docs/index.html:2451:        npx:      '$ npx akashik init',
./docs/index.html:2551:            hit:    '◆ akashik: 11 ms · 3 cited chunks · age 2d · fresh',
./docs/index.html:2581:            hit:    '◆ akashik: 14 ms · 1 cached chunk · age 31d · STALE (> 7d)',
./docs/index.html:3049:        // Each scenario sources its answer from a specific akashik room.
./docs/index.html:3430:          ['code:wi-recall', 'code · akashik/src/recall.rs'],
./docs/index.html:3431:          ['code:wi-federated', 'code · akashik/src/net/federated.rs'],
./docs/index.html:3432:          ['code:wi-hooks', 'code · akashik/.claude/hooks/akashik-hook.sh'],
./docs/architecture/V3-PROTOCOL.md:1:# akashik v3 — P2P Memory Protocol
./docs/architecture/V3-PROTOCOL.md:4:**Status:** Reference implementation shipped in akashik v3.x; spec stabilising ahead of v3.0 tag
./docs/architecture/V3-PROTOCOL.md:15:**akashik v3** defines a protocol so that:
./docs/architecture/V3-PROTOCOL.md:22:This spec defines the wire primitives. The reference implementation is the `akashik` TypeScript codebase; the spec is portable to any language (Rust, Go, Python, Swift).
./docs/architecture/V3-PROTOCOL.md:38:**Why did:key over did:web, did:ion, did:plc:** akashik needs zero-registry offline verifiability. Any peer can decode a did:key in microseconds without a network round-trip. Composable DID methods (did:web for human-readable names, did:plc for AT Protocol interop) are a v3.1 extension; the core protocol only requires did:key.
./docs/architecture/V3-PROTOCOL.md:49:akashik-auth:v1:<device_id>:<hex(device_public_key)>:<authorized_at_ISO8601>
./docs/architecture/V3-PROTOCOL.md:91:akashik-sig:v1:<device_id>:<signed_at>:<canonical_json(payload)>
./docs/architecture/V3-PROTOCOL.md:96:Domain separation: the `akashik-auth:v1:` and `akashik-sig:v1:` prefixes prevent cross-protocol replay. A valid authorization signature cannot be re-presented as a payload signature.
./docs/architecture/V3-PROTOCOL.md:104:   recompute `akashik-auth:v1:<device_id>:<hex(device_pub)>:<authorized_at>`,
./docs/architecture/V3-PROTOCOL.md:107:   recompute `akashik-sig:v1:<device_id>:<signed_at>:<canonical_json(payload)>`,
./docs/architecture/V3-PROTOCOL.md:134:akashik v3 ships **linear bridges** — for each supported encoder pair (A, B), a matrix `W_{A→B} ∈ R^{d_B × d_A}` such that `bridge(v_A) = L2_normalize(W · v_A)` is approximately equivalent to embedding the original text in encoder B.
./docs/architecture/V3-PROTOCOL.md:197:/akashik/capabilities/1.0.0 → {
./docs/architecture/V3-PROTOCOL.md:220:- `/akashik/search/2.0.0` — one-shot request/response semantic search
./docs/architecture/V3-PROTOCOL.md:221:- `/akashik/touch/1.0.0` — asymmetric public-room pull
./docs/architecture/V3-PROTOCOL.md:222:- `/akashik/share/2.0.0` — bidirectional CRDT room sync (Y.js)
./docs/architecture/V3-PROTOCOL.md:223:- `/akashik/save/1.0.0` — signed note append
./docs/architecture/V3-PROTOCOL.md:224:- `/akashik/capabilities/1.0.0` — capability exchange
./docs/architecture/V3-PROTOCOL.md:305:- Ed25519 sign/verify on the two domain-separation tags (`akashik-auth:v1:`, `akashik-sig:v1:`)
./docs/architecture/V3-PROTOCOL.md:310:The reference suite is `tests/identity.test.ts` + `tests/identity-lifecycle.test.ts` + `tests/identity-bridge.test.ts` (38 tests total) in the akashik repo.
./docs/architecture/V3-PROTOCOL.md:320:- **CLI**: `akashik identity {init|show|rotate|export|import}`
./docs/architecture/V3-PROTOCOL.md:343:This protocol specification is CC-BY-4.0. The reference implementation is MIT. Cross-model bridge matrices distributed by the akashik project are CC0.
./docs/architecture/V3-PROTOCOL.md:349:All numbers are measured on commodity CPU hardware (Apple Silicon, M-series). Reproduction scripts are in the akashik repo at `scripts/bench-*.mjs`.
./docs/architecture/ADR-001-v3-memory-protocol.md:1:# ADR-001 — akashik v3 memory protocol design decisions
./docs/architecture/ADR-001-v3-memory-protocol.md:12:akashik v2 established measured retrieval quality (Phase 25: 75.22% NDCG@10 on SciFact via Rust-fastembed bge-base + hybrid — within ~1.5pt of GPU reranker ceiling). The v3 milestone moves from "a retrieval engine" to "a protocol" — with the specific goal of unlocking cross-model, cross-device, cross-agent portable memory for the free-LLM world.
./docs/architecture/ADR-001-v3-memory-protocol.md:160:- Incremental adoption: `/akashik/search/2.0.0` (signed) runs alongside `/akashik/search/1.0.0` (unsigned) during migration
./docs/architecture/ADR-001-v3-memory-protocol.md:181:- Every memory entry akashik emits can be cryptographically attributed to a user DID
./docs/product/GRAPHRAG-AUDIT.md:1:# GraphRAG audit — Akashik against 2025/2026 SOTA
./docs/product/GRAPHRAG-AUDIT.md:9:## 2. Where Akashik aligns with best practice
./docs/product/GRAPHRAG-AUDIT.md:20:## 3. Where Akashik diverges intentionally
./docs/p2p/P2P-VISION.md:1:# P2P Knowledge Graph — akashik v2.0 Vision
./docs/p2p/P2P-VISION.md:5:Every developer running akashik has a local knowledge graph. Right now these graphs are isolated — your homelab research doesn't connect to mine.
./docs/p2p/P2P-VISION.md:7:**v2.0 makes them connected.** A peer-to-peer network where akashik nodes discover each other, share graph fragments, and build a collective knowledge layer that's bigger than any single user's research.
./docs/p2p/P2P-VISION.md:30:- Or manually add peers: `akashik peer add <address>`
./docs/p2p/P2P-VISION.md:41:- Federated search: `akashik ask "vector search" --peers` searches across all connected graphs
./docs/p2p/P2P-VISION.md:90:A team of 5 researchers each tracks different domains. P2P akashik connects their graphs. When researcher A indexes a paper about "efficient attention", researcher B (tracking "GPU optimization") gets a tunnel notification: "your GPU optimization connects to A's attention paper."
./docs/p2p/P2P-VISION.md:96:At a conference, attendees run akashik in P2P mode. Their graphs auto-discover via local network. The collective graph of 100 attendees, each with 500 nodes, creates a 50K-node searchable knowledge base spanning every talk, paper, and conversation.
./docs/p2p/P2P-VISION.md:123:akashik goes from "your personal research memory" to "a collective intelligence network for developers." Every peer makes the network smarter. The graph grows faster than any individual could build it.
./docs/research/octopus-discover/round-5-2026-05-26/README.md:11:> **AkashikBench-F + federation routing.** Stop chasing the final
./docs/research/octopus-discover/round-5-2026-05-26/README.md:20:> the DID identity + signed-attribution layer. Akashik =
./docs/research/octopus-discover/round-5-2026-05-26/README.md:24:### Q3 — AkashikBench-F (proposed federation benchmark)
./docs/research/octopus-discover/round-5-2026-05-26/README.md:56:> Tradeoff: temporarily pigeonholes Akashik as "niche debugging
./docs/research/octopus-discover/round-5-2026-05-26/README.md:69:   *Positioning:* "Are.na is what Akashik looks like centralized;
./docs/research/octopus-discover/round-5-2026-05-26/README.md:70:   Akashik is Are.na where blocks are queryable via vector search,
./docs/research/octopus-discover/round-5-2026-05-26/README.md:74:   social posts; Akashik is AT Protocol for semantic research
./docs/research/octopus-discover/round-5-2026-05-26/README.md:78:   Akashik extends that local memory into cross-peer transfer
./docs/research/octopus-discover/round-5-2026-05-26/README.md:87:> Akashik will collapse into a slower 'web search plus personal
./docs/research/octopus-discover/round-5-2026-05-26/README.md:105:> **AkashikBench-F and federation routing** because validating
./docs/research/octopus-discover/round-5-2026-05-26/README.md:141:- **AkashikBench-F** → new `tests/bench-akashik-federation.test.ts`
./docs/research/octopus-discover/round-5-2026-05-26/README.md:148:  `docs/marketing/storybrand-messaging-draft.md` Prompt 3 authority
./docs/marketing/positioning-v2.1.md:1:# Akashik — positioning (v2.1)
./docs/marketing/positioning-v2.1.md:16:**The counter:** Every Akashik instance is a node in a peer mesh.
./docs/marketing/positioning-v2.1.md:25:the business model, not the memory. Run Akashik instead. Share
./docs/marketing/positioning-v2.1.md:43:> Your peers already did this research. Akashik asks their
./docs/marketing/positioning-v2.1.md:56:can't help answer your question and vice versa. Akashik's
./docs/marketing/positioning-v2.1.md:75:> Every AI memory SaaS is a silo with a pricing model. Akashik
./docs/marketing/positioning-v2.1.md:93:> Every developer running Akashik is a peer in the network. Your
./docs/marketing/positioning-v2.1.md:123:> Akashik is the opposite shape. Every instance is a peer. Every
./docs/marketing/positioning-v2.1.md:127:> doesn't have, Akashik checks the peers you trust before it
./docs/marketing/positioning-v2.1.md:153:Every Akashik install provisions a W3C `did:key` (Ed25519,
./docs/marketing/positioning-v2.1.md:170:rooms you opt into. There is no Akashik server — nobody to buy
./docs/marketing/positioning-v2.1.md:204:- **Auto-prefetch** — the Claude Code hook runs `akashik ask`
./docs/marketing/positioning-v2.1.md:221:federate. They're each their own fragmentation. Akashik is the
./docs/marketing/positioning-v2.1.md:234:  Domain-separation tags (`akashik-auth:v1:` vs
./docs/marketing/positioning-v2.1.md:235:  `akashik-sig:v1:`) prevent replay of authorization signatures
./docs/marketing/positioning-v2.1.md:256:The architecture refuses the move. There is no Akashik server
./docs/marketing/positioning-v2.1.md:275:  Akashik's argument for it.
./docs/marketing/positioning-v2.1.md:288:> `git clone https://github.com/SaharBarak/akashik && npm i && bash scripts/bootstrap.sh`
./docs/marketing/positioning-v2.1.md:349:- Headline: **Akashik is the opposite shape.**
./docs/marketing/positioning-v2.1.md:351:  answers FROM its own graph. No Akashik server. No directory.
./docs/marketing/positioning-v2.1.md:353:- Proof: screenshot of `akashik peer list` with real peer IDs.
./docs/marketing/positioning-v2.1.md:366:- Proof: `akashik identity show` output — real DID,
./docs/marketing/positioning-v2.1.md:380:- Visual: a clean bar chart — Akashik Wave 2 vs bge-base-en
./docs/marketing/positioning-v2.1.md:391:- Proof: GIF of `akashik oracle ask "..." --live` on peer A,
./docs/marketing/positioning-v2.1.md:392:  `akashik oracle show <qid>` on peer B within 2 s.
./docs/marketing/positioning-v2.1.md:420:**Page title (SEO):** Akashik — the network before the web
./docs/marketing/positioning-v2.1.md:421:**Description:** The federated knowledge graph for AI agents. Your peers already did this research — Akashik asks their graphs before your Claude Code session hits the web. Your identity is a W3C did:key you own. MIT-licensed, CPU-local, 75.22% NDCG@10 on BEIR SciFact. No cloud, no subscription.
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-5.md:11:Akashik = federated knowledge commons for the OSS community.
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-5.md:36:Q2 — Is the Akashik 'ambitioned-curator + curiosity-driven cache'
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-5.md:67:     existing systems that Akashik most directly competes with /
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-5.md:119:**Nearest neighbour: Named Data Networking (NDN)**, specifically the Interest/Data forwarding plane described in Jacobson et al., "Named Data Networking," arxiv:1611.03982 (also SIGCOMM 2009). NDN routes content *requests* toward caches based on name prefixes; forwarding state is maintained per-hop; content flows back along the reverse path and is cached en route. The structural analogy to Akashik is exact: a query (Interest packet) propagates toward knowledgeable peers; the answer flows back and is cached locally.
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-5.md:121:**What Akashik adds that NDN lacks**: (a) routing signal is *semantic similarity* (vector distance), not name prefix — so it handles unstructured knowledge without a naming authority; (b) episodic→semantic consolidation changes what gets propagated over time (the `consolidator.ts` distillation loop has no NDN equivalent); (c) the Oracle module routes open questions to peers most likely to answer based on local graph coverage, not just content proximity.
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-5.md:125:**Positioning against NDN**: "Akashik is NDN for unstructured agent knowledge, with semantic routing replacing name routing and LLM distillation replacing static cache eviction."
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-5.md:167:- **Rust Discord** (`#general`, `#tooling`) — 70k members, strong local-first and CLI-first culture. The `akashik-rs` Rust IPC client is a genuine first-class citizen for this audience. Rust Discord is the fastest community at turning a cool CLI demo into GitHub stars.
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-5.md:171:- Index the **LoCoMo paper** (arxiv:2306.02954) with an annotation explaining the 60pp R@3/R@30 gap and what it means for agent memory — this positions Akashik as the system that *understands* the benchmark, not just scores on it.
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-5.md:172:- Index the **MemGPT/Letta paper** (arxiv:2310.08560) with a comparison note: "Letta requires their agent runtime; akashik works with Claude Code, Cursor, and Cline today."
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-5.md:177:- **Days 8–14**: Post "Show HN: akashik — P2P semantic cache for AI agent memory" with the FedComp-LoCoMo chart (even a synthetic one from the simulation). Link the terminal video. HN is the fastest path to 50 GitHub stars from technical users.
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-5.md:197:**System that solved it**: BitTorrent's seeding incentive model. Rare torrents (low-seeders) get *preferential download slots* from peers with available bandwidth — the system explicitly rewards seeding rare content. **Mechanism**: Inverse-frequency replication weighting — assign a higher `touch` refresh priority to nodes with low cross-peer replication count. In Akashik terms: nodes that exist on only 1–2 known peers should get longer TTLs and lower auto-forget priority, not equal treatment.
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-5.md:203:**System that solved it**: Wikipedia's ORES (Objective Revision Evaluation Service, 2015). ORES scores every edit on a vandalism probability using ML, independent of who made the edit. The mechanism is *content scoring*, not *identity trust*: a high-reputation editor can still submit bad content; a new editor's good content gets accepted. **Mechanism for Akashik**: Add a local incoherence/quality score at ingestion time (e.g., embedding distance between a node's summary and its source text as a factual consistency proxy), separate from peer reputation. New peers' oracle answers are quarantined until N positive consistency scores accumulate — same structure as Wikipedia's flagged revisions.
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-5.md:211:**Positioning**: "mem0 knows what *your* agent told it. Akashik knows what your *network* has researched. Your agent memory is only as good as your network."
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-5.md:215:**Positioning**: "Letta is an agent runtime you run instead of Claude Code. Akashik is a retrieval layer you add *to* Claude Code, Cursor, or Cline. If you want stateful agents on their platform, use Letta. If you want your existing agent to stop re-researching what your teammates already know, use Akashik." The moat is composability, not capability replacement.
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-5.md:219:**Positioning**: "Logseq requires you to *write* what you know. Akashik captures what you *research* automatically. Zero-overhead knowledge accumulation vs. zero-friction note-taking."
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-5.md:220:The real threat from this category is Obsidian + the DataviewJS + Remotely Save plugin stack — 1M+ users, free, already has community plugins for AI. Akashik's answer: that stack requires human curation; Akashik auto-ingests agent research and propagates it to peers without a separate writing step.
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-5.md:232:The cold-start problem is real and the argument is correct that federation provides zero benefit to a single isolated peer. Our answer is that *local value is already sufficient on day zero* — `akashik save` + `akashik ask` already beats a bare LLM context window for a single user on the LME-S benchmark (R@5=0.9202), and that value is why someone installs it. Federation is a multiplier on existing value, not a prerequisite for it. The coordination burden is also lower than Slack or GitHub Discussions because it's *implicit*: when two developers in the same OSS project both install akashik, they automatically share knowledge through the `toolshed` system room (which is always-on and P2P-shared) without any explicit "join this workspace" action. The social coordination is replaced by ambient proximity in the codebase — the same mechanism that makes pull request visibility work without users needing to subscribe to each other. The honest concession: this argument becomes false if the `toolshed` room and oracle gossip are not reliably working on first install. The current state (federation silently downgrades to dense-only, oracle gossip end-to-end test is in `phase39.oracle-gossip-e2e.test.ts` but not shipped) means the argument *is* currently true. Fixing that is the same work as Q1's answer.
./src/daemon/ipc-handlers.ts:96:  if (!query) return 'missing query — usage: akashik ask "your question" [--room R] [--k N] [--json]';
./src/daemon/ipc-handlers.ts:209:    const stdout = 'no results found. try a broader query or run `akashik trigger` to index content first.\n';
./src/daemon/ipc-handlers.ts:223:    lines.push(`# akashik: "${r.query}" matches entity ${e.id}`);
./src/daemon/ipc-handlers.ts:280: * (akashik cache-stats) prints this for operators monitoring
./src/daemon/ipc-handlers.ts:341: * `akashik jobs submit <kind> <...args>` over IPC.
./src/daemon/ipc-handlers.ts:350: * spam — keeps `akashik this | xargs` style scripting easy).
./src/daemon/ipc-handlers.ts:441: *   $ akashik metrics
./src/daemon/ipc-handlers.ts:468: * buildIpcHandlers(). Used by bin/akashik.js to know whether to
./docs/marketing/x-launch-posts.md:1:# X/Twitter Launch Posts — Akashik
./docs/marketing/x-launch-posts.md:12:Open source: github.com/SaharBarak/akashik
./docs/marketing/x-launch-posts.md:26:1. `akashik init` — pick your research topics
./docs/marketing/x-launch-posts.md:27:2. `akashik trigger` — fetch from ArXiv, HN, RSS
./docs/marketing/x-launch-posts.md:28:3. `akashik index` — index your codebase
./docs/marketing/x-launch-posts.md:29:4. `akashik claude install` — hook into Claude Code
./docs/marketing/x-launch-posts.md:34:The key command is `akashik claude install`.
./docs/marketing/x-launch-posts.md:58:Akashik is different: it partitions by research domain (rooms), detects cross-domain connections (tunnels), and actively fetches from ArXiv + HN + RSS on a schedule.
./docs/marketing/x-launch-posts.md:65:You track "homelab" and "ml-papers" separately. When a paper about embedding quantization in ml-papers is semantically close to a memory issue in homelab, Akashik flags it.
./docs/marketing/x-launch-posts.md:70:I indexed Akashik's own codebase into its own graph.
./docs/marketing/x-launch-posts.md:85:Akashik fixes that in 4 commands:
./docs/marketing/x-launch-posts.md:88:akashik init
./docs/marketing/x-launch-posts.md:89:akashik trigger --room homelab
./docs/marketing/x-launch-posts.md:90:akashik index
./docs/marketing/x-launch-posts.md:91:akashik claude install
./docs/marketing/x-launch-posts.md:99:I typed `akashik discover --room akashik-dev --auto` and it found:
./docs/marketing/x-launch-posts.md:113:Akashik changes that.
./docs/marketing/x-launch-posts.md:115:github.com/SaharBarak/akashik
./docs/marketing/x-launch-posts.md:120:Akashik is a knowledge graph with rooms, tunnels, 8 source adapters, and a daemon that keeps it current.
./docs/marketing/x-launch-posts.md:131:github.com/SaharBarak/akashik
./docs/marketing/growth-sources-plan.md:89:akashik discover-loop --room homelab --max-iterations 3
./src/daemon/loop.ts:11: * PID file at `~/.akashik/daemon.pid` for lifecycle management.
./src/daemon/loop.ts:14: * by `akashik daemon start`. It logs to
./src/daemon/loop.ts:15: * `~/.akashik/daemon.log` and exits cleanly on SIGTERM.
./src/daemon/loop.ts:366:  // (i.e. they have run `akashik peer status` or `peer add` at least once).
./src/daemon/loop.ts:550:              daemonLog(deps.homePath, `share sync registered: /akashik/share/1.0.0`);
./src/daemon/loop.ts:617:              daemonLog(deps.homePath, `search protocol registered: /akashik/search/1.0.0`);
./src/daemon/loop.ts:632:              daemonLog(deps.homePath, `recall protocol registered: /akashik/recall/1.0.0`);
./src/daemon/loop.ts:654:              daemonLog(deps.homePath, `touch protocol registered: /akashik/touch/1.0.0`);
./src/daemon/loop.ts:658:            // /akashik/oracle/1.0.0 topic so inbound questions and
./src/daemon/loop.ts:678:              daemonLog(deps.homePath, `oracle pubsub subscribed: /akashik/oracle/1.0.0`);
./src/daemon/loop.ts:720:              daemonLog(deps.homePath, `search-gossip subscribed: /akashik/search/1.0.0`);
./src/daemon/job-runner.ts:9: * `akashik jobs list`. Errors throw — the queue catches them and
./src/daemon/job-runner.ts:200: * Project ingest — the four ephemeral descriptors that `akashik
./src/daemon/job-runner.ts:203: * NOT persisted to sources.json (mirrors `akashik index`).
./docs/marketing/storybrand-messaging-draft.md:1:# Akashik — brand messaging, StoryBrand 7-prompt pass
./docs/marketing/storybrand-messaging-draft.md:4:workflow (`marketing/storybrand-messaging-engine.md` in the
./docs/marketing/storybrand-messaging-draft.md:5:`SaharBarak/skills-and-workflows` repo) against Akashik's actual
./docs/marketing/storybrand-messaging-draft.md:8:**Brand name:** Akashik (formerly project codename `akashik`).
./docs/marketing/storybrand-messaging-draft.md:15:**Mission anchor (the only anchor that's correct):** Akashik is
./docs/marketing/storybrand-messaging-draft.md:34:> Akashik is a peer-to-peer knowledge graph protocol for the
./docs/marketing/storybrand-messaging-draft.md:56:> your work matter beyond yourself; Akashik is the natural
./docs/marketing/storybrand-messaging-draft.md:115:   the community is curious about. See [how Akashik
./docs/marketing/storybrand-messaging-draft.md:137:> Akashik is the protocol the community has been missing: a
./docs/marketing/storybrand-messaging-draft.md:147:1. Run an Akashik peer.
./docs/marketing/storybrand-messaging-draft.md:240:- New topic to dig into → query the Akashik, see what
./docs/marketing/storybrand-messaging-draft.md:256:> touched before. Akashik checks your local peer, then asks the
./docs/marketing/storybrand-messaging-draft.md:321:## Why "Akashik"
./docs/marketing/storybrand-messaging-draft.md:331:"Akashik" (stylised without the "c") gives us:
./docs/marketing/storybrand-messaging-draft.md:351:- **The Akashik. A federated record for the open-source community.**
./docs/marketing/storybrand-messaging-draft.md:352:- **Akashik — every contributor's reading, compounding into the community's progress.**
./docs/marketing/storybrand-messaging-draft.md:353:- **Akashik — open source's knowledge stack. P2P, signed, contributor-owned.**
./docs/marketing/storybrand-messaging-draft.md:354:- **Akashik — read the record the community already wrote.**
./docs/marketing/storybrand-messaging-draft.md:355:- **Akashik — each peer holds what it's asked for. Every query compounds the network.**
./docs/marketing/storybrand-messaging-draft.md:369:> When you ask Akashik something, it checks your peer first.
./docs/marketing/storybrand-messaging-draft.md:389:called `akashik` as of this writing. The brand-marketing
./docs/marketing/storybrand-messaging-draft.md:390:name is **Akashik**. Two-name period is normal during a rebrand;
./docs/marketing/storybrand-messaging-draft.md:393:- Marketing materials, the website, social, and press: **Akashik**
./docs/marketing/storybrand-messaging-draft.md:395:  PROJECT.md, source code): **akashik** (for now)
./docs/marketing/storybrand-messaging-draft.md:396:- Migration plan to rename `akashik → akashik` in the
./docs/marketing/storybrand-messaging-draft.md:402:| | Pass 1 — Personal | Pass 2 — Small teams | Pass 3 — OSS community (Akashik) |
./docs/p2p/peer-reputation-load-spreading.md:28:Two facts about the existing akashik code make load-spreading
./docs/p2p/peer-reputation-load-spreading.md:31:1. **Touch already replicates chunks.** When peer A `akashik touch`-es a
./docs/p2p/peer-reputation-load-spreading.md:33:   `_akashik_source_peer: B` provenance. A is now a secondary source for
./docs/p2p/peer-reputation-load-spreading.md:62:**What it does.** `akashik touch --peer B --label "lemlist pricing"` pulls
./docs/p2p/peer-reputation-load-spreading.md:63:the chunk and writes it to A's local `graph.json` with `_akashik_source_peer: B`.
./docs/p2p/peer-reputation-load-spreading.md:73:  flag to `akashik ask --peers` that, on a high-confidence federated
./docs/p2p/peer-reputation-load-spreading.md:175:*touched* from peer B (carrying `_akashik_source_peer: B`), the
./docs/p2p/peer-reputation-load-spreading.md:194:local update path to credit `_akashik_source_peer` chains).
./docs/p2p/peer-reputation-load-spreading.md:214:**Files:** new wire protocol `/akashik/seed/1.0.0`. Substantial — Phase 3
./docs/p2p/peer-reputation-load-spreading.md:308:Item (3) is the rep-update path crediting `_akashik_source_peer` chains.
./docs/product/ROADMAP.md:1:# Akashik — Roadmap
./docs/product/ROADMAP.md:19:Pluggable Source port with four adapters: generic_rss, arxiv, hn_algolia, generic_url. RSS 2.0 + Atom normaliser. Recursive paragraph chunker. Content-hash (sha256) dedup on re-runs. `akashik trigger [--room R]` and `akashik sources list|add|remove|enable|disable`.
./docs/product/ROADMAP.md:25:9 tools exposed over stdio via @modelcontextprotocol/sdk: search, ask, get_node, get_neighbors, list_rooms, find_tunnels, sources_list, trigger_room, graph_stats. `akashik mcp start` — auto-spawned by Claude Code via the plugin manifest.
./docs/product/ROADMAP.md:29:**Commands:** `akashik init`, `akashik room list|create|switch|current`
./docs/product/ROADMAP.md:35:- `src/infrastructure/rooms-config.ts` — Room registry at `~/.akashik/rooms.json`
./docs/product/ROADMAP.md:44:**Commands:** `akashik ask "<query>"`, `akashik report [date] [--room R]`
./docs/product/ROADMAP.md:52:- Report persistence at `~/.akashik/reports/<room>/<date>.md`
./docs/product/ROADMAP.md:57:**Commands:** `akashik daemon start|stop|status`, `akashik discover [--room R]`
./docs/product/ROADMAP.md:66:- Config integration: read daemon settings from `~/.akashik/config.yaml` (add `yaml` dep)
./docs/product/ROADMAP.md:71:**Commands:** `akashik telegram setup|test|capture-start|digest-test`
./src/daemon/file-watcher.ts:8: * (.git, node_modules, dist, .akashik, *.swp, *.tmp).
./src/daemon/file-watcher.ts:45:  /\/\.akashik\//,
./src/daemon/file-watcher.ts:202:  // sessions are universal, not opted-in via `akashik this`.
./docs/marketing/SITE-REDESIGN-SPEC.md:1:# Akashik — landing page redesign spec
./docs/marketing/SITE-REDESIGN-SPEC.md:17:- **GitHub repo (target):** `github.com/twocirclestudios/akashik`
./docs/marketing/SITE-REDESIGN-SPEC.md:18:  (currently `github.com/SaharBarak/akashik`; migration pending)
./docs/marketing/SITE-REDESIGN-SPEC.md:22:  git clone https://github.com/twocirclestudios/akashik.git
./docs/marketing/SITE-REDESIGN-SPEC.md:23:  cd akashik
./docs/marketing/SITE-REDESIGN-SPEC.md:35:  npx -y akashik init
./docs/marketing/SITE-REDESIGN-SPEC.md:43:  $ git clone https://github.com/twocirclestudios/akashik.git
./docs/marketing/SITE-REDESIGN-SPEC.md:44:  $ cd akashik && npm install && npm run bootstrap
./docs/marketing/SITE-REDESIGN-SPEC.md:47:**Migration touchpoints — every reference to `SaharBarak/akashik`
./docs/marketing/SITE-REDESIGN-SPEC.md:48:must flip to `twocirclestudios/akashik` when execution starts.**
./docs/marketing/SITE-REDESIGN-SPEC.md:81:the cost reframe — Akashik's retrieval doesn't go through an LLM.
./docs/marketing/SITE-REDESIGN-SPEC.md:109:│ NAV ▸ Akashik   Demo · How it works · Bench · Install   ☆  │
./docs/marketing/SITE-REDESIGN-SPEC.md:134:│   ║      twocirclestudios/akashik.git   ║                    │
./docs/marketing/SITE-REDESIGN-SPEC.md:135:│   ║  $ cd akashik && npm install &&     ║                    │
./docs/marketing/SITE-REDESIGN-SPEC.md:181:$ git clone https://github.com/twocirclestudios/akashik.git
./docs/marketing/SITE-REDESIGN-SPEC.md:182:$ cd akashik && npm install && npm run bootstrap
./docs/marketing/SITE-REDESIGN-SPEC.md:185:$ npx -y akashik init
./docs/marketing/SITE-REDESIGN-SPEC.md:188:$ brew install twocirclestudios/akashik/akashik
./docs/marketing/SITE-REDESIGN-SPEC.md:195:  page; will be `akashik peer list` JSON output until built)
./docs/marketing/SITE-REDESIGN-SPEC.md:199:  links to `https://github.com/twocirclestudios/akashik`)
./docs/marketing/SITE-REDESIGN-SPEC.md:244:Beat 1 = the Akashik graph fired. Beat 2 = the LLM read the
./docs/marketing/SITE-REDESIGN-SPEC.md:273:2. Tells you the *one fact only Akashik has* (claim line — NEW)
./docs/marketing/SITE-REDESIGN-SPEC.md:323:  git:      '$ git clone https://github.com/twocirclestudios/akashik.git\n$ cd akashik && npm install && npm run bootstrap',
./docs/marketing/SITE-REDESIGN-SPEC.md:324:  npm:      '$ npx -y akashik init',
./docs/marketing/SITE-REDESIGN-SPEC.md:325:  homebrew: '$ brew install twocirclestudios/akashik/akashik',
./docs/marketing/SITE-REDESIGN-SPEC.md:422:     href="https://github.com/twocirclestudios/akashik">
./docs/marketing/SITE-REDESIGN-SPEC.md:429:  <a class="btn btn-primary" href="https://github.com/twocirclestudios/akashik">
./docs/marketing/SITE-REDESIGN-SPEC.md:672:> **How Akashik hooks into your workflow**
./docs/marketing/SITE-REDESIGN-SPEC.md:682:> Akashik registers a `UserPromptSubmit` hook with Claude Code
./docs/marketing/SITE-REDESIGN-SPEC.md:684:> a message, the hook runs `akashik ask` against your local
./docs/marketing/SITE-REDESIGN-SPEC.md:695:> Akashik's graph holds it, ranks it by freshness and provenance,
./docs/marketing/SITE-REDESIGN-SPEC.md:700:> When your session ends, Akashik indexes your transcript back
./docs/marketing/SITE-REDESIGN-SPEC.md:713:claude mcp add --scope user akashik -- akashik mcp
./docs/marketing/SITE-REDESIGN-SPEC.md:714:akashik claude install
./docs/marketing/SITE-REDESIGN-SPEC.md:742:│   $ git clone https://github.com/twocirclestudios/akashik.git│
./docs/marketing/SITE-REDESIGN-SPEC.md:743:│   $ cd akashik && npm install && npm run bootstrap           │
./docs/marketing/SITE-REDESIGN-SPEC.md:765:$ git clone https://github.com/twocirclestudios/akashik.git
./docs/marketing/SITE-REDESIGN-SPEC.md:766:$ cd akashik && npm install && npm run bootstrap
./docs/marketing/SITE-REDESIGN-SPEC.md:770:- Primary: `☆ Star on GitHub` → `https://github.com/twocirclestudios/akashik`
./docs/marketing/SITE-REDESIGN-SPEC.md:771:- Ghost: `Join Discussions` → `https://github.com/twocirclestudios/akashik/discussions`
./docs/marketing/SITE-REDESIGN-SPEC.md:779:- `shields.io/github/stars/twocirclestudios/akashik?style=social`
./docs/marketing/SITE-REDESIGN-SPEC.md:780:- `shields.io/github/v/release/twocirclestudios/akashik`
./docs/marketing/SITE-REDESIGN-SPEC.md:781:- (optional) `shields.io/npm/v/akashik` once published
./docs/marketing/SITE-REDESIGN-SPEC.md:794:<img src="https://raw.githubusercontent.com/SaharBarak/akashik/main/demo/scene-claude.gif" …>
./docs/marketing/SITE-REDESIGN-SPEC.md:804:     alt="Side-by-side: Claude alone (~14s, hedged) vs Claude + Akashik (~1.5s, cited)">
./docs/marketing/SITE-REDESIGN-SPEC.md:848:2. Keep: "Akashik open-sources the knowledge graph itself" close
./docs/marketing/SITE-REDESIGN-SPEC.md:868:- Update repo references to `twocirclestudios/akashik`
./docs/marketing/SITE-REDESIGN-SPEC.md:914:1. **Repo migration timing.** Is `twocirclestudios/akashik` live
./docs/marketing/SITE-REDESIGN-SPEC.md:916:   404 until upload) or keep `SaharBarak/akashik` until the move
./docs/marketing/SITE-REDESIGN-SPEC.md:939:5. **npm package name.** Will we publish as `akashik` or
./docs/marketing/SITE-REDESIGN-SPEC.md:940:   `@twocircle/akashik` (scoped)?
./docs/marketing/SITE-REDESIGN-SPEC.md:941:   - Recommended: try `akashik` first — short, memorable. If
./docs/marketing/SITE-REDESIGN-SPEC.md:942:     taken on npm, fall back to `@twocircle/akashik`.
./docs/marketing/SITE-REDESIGN-SPEC.md:960:     cheap follow-up — JSON dump of `akashik peer list --json`
./docs/marketing/SITE-REDESIGN-SPEC.md:965:   twocirclestudios/akashik/akashik` as one of the three
./docs/marketing/SITE-REDESIGN-SPEC.md:975:   endpoint that runs `akashik ask --peers --json` against the
./docs/marketing/SITE-REDESIGN-SPEC.md:979:   - Recommended: Fly.io node running `akashik daemon` + a thin
./docs/marketing/SITE-REDESIGN-SPEC.md:988:      ($1.94/mo) running `akashik daemon`. Generates a fresh
./docs/marketing/SITE-REDESIGN-SPEC.md:1085:product demo. Visitors don't read about Akashik — they query the
./docs/marketing/SITE-REDESIGN-SPEC.md:1097:  The page fires `POST /api/ask`, the server runs `akashik ask
./docs/marketing/SITE-REDESIGN-SPEC.md:1242:| Error      | inline message: `couldn't reach the network — try again? (or run `akashik ask` locally)` |
./docs/marketing/SITE-REDESIGN-SPEC.md:1281:- Runs `akashik ask --peers --json --k 5` server-side against the
./docs/research/octopus-discover/round-5-2026-05-26/synthesis.md:9:Akashik = federated knowledge commons for the OSS community.
./docs/research/octopus-discover/round-5-2026-05-26/synthesis.md:34:Q2 — Is the Akashik 'ambitioned-curator + curiosity-driven cache'
./docs/research/octopus-discover/round-5-2026-05-26/synthesis.md:65:     existing systems that Akashik most directly competes with /
./docs/research/octopus-discover/round-5-2026-05-26/synthesis.md:94:The next engineering month must be spent on **architecting the federation and its measurement infrastructure (AkashikBench-F)**. The empirical data confirms the LME-S head is saturated (R@50=1.000, ~4pp NDCG headroom). Chasing the final 2-3pp to match `agentmemory`'s 0.952 is a vanity metric for a single-user memory product, which Akashik is no longer. The core differentiator is network compounding. Conversely, the tradeoff of abandoning single-peer tuning is leaving 60pp of factual headroom on LoCoMo unmined, meaning local retrieval may remain noisy. However, building the federation layer (CRDT sync, query fan-out) and measuring the `web_fallback_rate` is the only way to empirically validate the actual "knowledge commons" thesis.
./docs/research/octopus-discover/round-5-2026-05-26/synthesis.md:96:**Q2 — Is the Akashik mechanism architecturally novel?**
./docs/research/octopus-discover/round-5-2026-05-26/synthesis.md:97:The mechanism is compositionally novel, but builds entirely upon established primitives. The closest prior art for the monotonic caching property is **Freenet** (Clarke et al., 2001, [PDF](https://www.cs.princeton.edu/courses/archive/fall11/cos518/papers/freenet.pdf)), which formally described demand-driven transparent lazy replication. For identity and repositories, the closest neighbor is **AT Protocol**. Position Akashik as: *"Freenet-style demand-shaped replication applied to attributed semantic research memory, utilizing AT Protocol-style DID signatures."* The advantage is a strong lineage to Freenet's caching math and ATProto's identity model; however, the tradeoff is that unlike AT Protocol's always-on server relays, Akashik's device-level P2P suffers severe cold-start availability and relies heavily on unpredictable individual node uptime.
./docs/research/octopus-discover/round-5-2026-05-26/synthesis.md:100:Propose **AkashikBench-F** (Federated Compounding Benchmark).
./docs/research/octopus-discover/round-5-2026-05-26/synthesis.md:114:*   **Tradeoff:** This narrow wedge guarantees high query overlap, making compounding visible quickly. Conversely, it temporarily pigeonholes Akashik as a niche debugging tool rather than a broad knowledge commons, which could stall wider OSS adoption.
./docs/research/octopus-discover/round-5-2026-05-26/synthesis.md:122:1.  **Are.na**: Closest *product* competitor. *Positioning:* Are.na is what Akashik looks like centralized; Akashik is Are.na where blocks are queryable via vector search, locally owned, and propagate peer-to-peer.
./docs/research/octopus-discover/round-5-2026-05-26/synthesis.md:123:2.  **AT Protocol (Bluesky)**: Closest *protocol* analogue. *Positioning:* AT Protocol solved federated identity for social posts; Akashik is AT Protocol for semantic research memory with demand-shaped retrieval.
./docs/research/octopus-discover/round-5-2026-05-26/synthesis.md:124:3.  **agentmemory**: Closest *current benchmark* rival. *Positioning:* agentmemory wins single-player retrieval; Akashik extends that baseline local memory into cross-peer transfer and network compounding.
./docs/research/octopus-discover/round-5-2026-05-26/synthesis.md:128:*   **Counter-argument:** "You are adding a flaky, mostly-offline federation hop in front of systems that already solve knowledge sharing better (Stack Overflow, GitHub, Google). Because peers are mostly offline laptops, users will miss locally, peers will time out, and Akashik will collapse into a slower 'web search plus personal cache', meaning the federated network effect is a complete illusion."
./docs/research/octopus-discover/round-5-2026-05-26/synthesis.md:138:*   **Compliance & Enterprise Viability vs. Immutable Provenance:** For B2B/enterprise contexts, Akashik's "signed and attributed forever" model fundamentally conflicts with GDPR right-to-erasure (Article 17). If a peer deletes a node containing PII, tombstones must propagate reliably across the P2P graph. Furthermore, for SOC2 Type II compliance, enterprise customers require evidence of access control, audit trails, and data residency; Akashik's gossip-first federation lacks an explicit central audit trail of who queried what proprietary IP, risking accidental exfiltration.
./docs/research/octopus-discover/round-5-2026-05-26/synthesis.md:148:| **AkashikBench-F Harness (Federation Eval)** | High | Medium | **High** |
./docs/research/octopus-discover/round-5-2026-05-26/synthesis.md:156:If I were Sahar, the next engineering month I'd spend on AkashikBench-F and federation routing because validating the compounding network effect is the only way to prove the product's core differentiator. The next marketing/launch month I'd spend on a 100-person pilot seeded in the local-AI/agent-tooling OSS ecosystem because their high-frequency debugging queries will make compounding visible and measurable within 30 days. Specifically NOT chasing the final 3pp of R@5 on LongMemEval-S because it chases a mathematical ceiling for a single-user metric, which distracts from the federated mission.
./docs/marketing/BRAND-KIT.md:1:# Akashik — brand kit
./docs/marketing/BRAND-KIT.md:349:it. Akashik surfaces using cards:
./docs/marketing/BRAND-KIT.md:400:below. For Akashik surfaces:
./docs/marketing/BRAND-KIT.md:562:│   ●  Akashik                                             │
./docs/marketing/BRAND-KIT.md:576:│   github.com/twocirclestudios/akashik   MIT · 2026 │
./docs/marketing/BRAND-KIT.md:581:- Brand mark: `Akashik` 32 px Outfit 700, `--accent`
./docs/marketing/BRAND-KIT.md:594:<meta property="og:image" content="https://akashik.dev/og-card.png">
./docs/marketing/BRAND-KIT.md:598:<meta name="twitter:image" content="https://akashik.dev/og-card.png">
./docs/marketing/BRAND-KIT.md:621:- `logo-wordmark.svg` — `Akashik` set in Outfit 700 plus the
./docs/marketing/BRAND-KIT.md:648:| `manifesto-illustration.svg` | inline SVG, decorative | Single-color emerald line illustration of the Napster→eMule→BitTorrent→Akashik lineage as nodes on a timeline |
./docs/marketing/BRAND-KIT.md:712:Akashik surfaces:
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:1:# Akashik — imagegen / frontend-web visual direction
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:4:(from leonxlnx/taste-skill) to Akashik's redesign. Pairs with:
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:35:Akashik's "premium SaaS / infra / product" brief:
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:48:Brief mapping (per skill §1.5): Akashik = **SaaS / infra /
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:60:| Category | Pick | Why this for Akashik |
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:142:│  ●  Akashik                     Demo · How · Bench · Install     ☆ Star  │
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:218:│              The only difference is Akashik.                              │
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:223:│         │     (Claude alone vs Claude + Akashik,             │           │
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:243:> Akashik." Center: a single horizontal animated terminal
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:246:> (~14 s). The right terminal injects context from an Akashik
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:348:│   How Akashik hooks into your workflow                                    │
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:368:│   │ claude mcp add --scope user akashik -- akashik mcp     │   │
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:369:│   │ akashik claude install                                      │   │
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:391:> showing "claude mcp add --scope user akashik -- akashik
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:392:> mcp" followed by "akashik claude install"; below that, a
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:427:│         │ │ $ cd akashik && npm install &&            │ │           │
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:479:│  BEIR SciFact NDCG@10 — Akashik vs incumbents            │  SciFact       │
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:481:│  Akashik            ████████████████████████  75.22%     │  vs the next   │
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:499:> SciFact NDCG@10 — Akashik vs incumbents". Below: a
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:500:> horizontal bar chart with 5 rows (Akashik, Pinecone-baseline,
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:502:> in mono left-aligned, followed by a horizontal bar — Akashik
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:595:│  │ THE      │   Akashik is not on the treadmill.                          │
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:613:│   Akashik adds: federation, peer reputation, signed envelopes.           │
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:623:> label: a tight Outfit 600 H2 "Akashik is not on the
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:632:> "Akashik adds: federation, peer reputation, signed
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:655:│  (Napster→eMule→BitTorrent→IPFS→Akashik timeline, dimmed)                 │
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:673:> "BitTorrent 2001", "IPFS 2014", and "Akashik 2026" connected
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:711:│              ago. Akashik open-sources the knowledge graph               │
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:757:│   $ git clone https://github.com/twocirclestudios/akashik.git        │
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:758:│   $ cd akashik && npm install && npm run bootstrap                   │
./docs/marketing/IMAGEGEN-FRONTEND-WEB.md:860:This skill normally produces raster image-gen prompts. Akashik's
./docs/product/MANIFESTO.md:1:# Why Akashik exists
./docs/product/MANIFESTO.md:7:**Akashik is how that ecosystem shares its knowledge.**
./docs/product/MANIFESTO.md:13:The result: fewer tokens burned on repeated research, richer sessions every time a peer in your network learns something new, automatic propagation of best practices and current tools, context that stays fresh between pre-training cuts. The open-source movement open-sourced the code. **Akashik open-sources the knowledge graph itself.** That's the next step.
./docs/product/MANIFESTO.md:17:**1. Each peer carries a shard of what's current — together, the live index.** Every Akashik instance is a libp2p peer. Rooms sync across peers via Y.js CRDT. A federated `ask --peers` fans a query across the network in parallel, 2-second per-peer timeout, results merged by cosine distance with per-peer attribution. The stranger who read that paper last Thursday, the peer who benchmarked that library two weeks ago, the dev who debugged that exact bug last night — their embeddings flow into your session. Nobody knows the whole graph; together the community does — the live state of the field, something no frozen-weight model can touch.
./docs/product/MANIFESTO.md:26:  <img src="docs/memory-stack.png" alt="The same Claude session, two different Fridays — without vs with Akashik" width="920" />
./docs/product/MANIFESTO.md:31:Without Akashik, your Claude session starts empty every time. Claude browses ten URLs, burns forty-five thousand tokens, takes thirty seconds, returns an answer half a year stale, and dies with the tab. Ten thousand other people run the exact same loop the same day. None of it compounds.
./docs/product/MANIFESTO.md:33:With Akashik, the `PreToolUse` hook fires before Claude reaches for the web. Your graph — already holding every arXiv paper you've pulled, every repo you've starred, every past session you've had, plus every shard shared by every other peer running Akashik — answers in **11 ms**. Three hits across three rooms: a GitHub repo someone starred yesterday, a piece of community code you hadn't seen, an arXiv paper from two hours ago. Claude replies instantly from the community's latest state. When the session ends, your transcript is vector-indexed back into the graph so tomorrow's session starts richer than today's. And every peer on the network is doing the same — the ten-thousand-stranger loop runs **once**, not ten thousand times.
./docs/marketing/influencer-outreach.md:1:# AI/ML Influencer Outreach — Akashik
./docs/marketing/influencer-outreach.md:6:- @simonw — Simon Willison. Writes about Claude Code, MCP, LLM tools. His blog is already indexed by Akashik. Natural fit.
./docs/marketing/influencer-outreach.md:11:- @OpenClawAI — OpenClaw. Skills ecosystem. Akashik works as an OpenClaw skill.
./docs/marketing/influencer-outreach.md:14:- @kaborpathy — Andrej Karpathy. Keeps a /raw folder of research — Akashik is literally the answer to that workflow.
./docs/marketing/influencer-outreach.md:32:Would love your take: github.com/SaharBarak/akashik
./docs/marketing/influencer-outreach.md:44:- Slide 2: "Akashik fixes that" + terminal screenshot
./docs/marketing/influencer-outreach.md:51:- Slide 2: "Akashik detects when they connect"
./docs/marketing/influencer-outreach.md:79:- "Show HN: Akashik – Give your coding agent a research memory (MCP plugin)"
./docs/marketing/influencer-outreach.md:80:- "Show HN: Akashik – Knowledge graph for AI agents, fed by ArXiv/HN/RSS"
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-4.md:12:Akashik = federated knowledge commons for the OSS community.
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-4.md:37:Q2 — Is the Akashik 'ambitioned-curator + curiosity-driven cache'
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-4.md:68:     existing systems that Akashik most directly competes with /
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-4.md:108:On the one hand, tuning per-peer `R@5` to match `agentmemory`'s 0.952 offers a recognizable marketing metric that early adopters easily understand. However, the severe tradeoff is that it completely ignores Akashik's core differentiator. Your own data shows LME-S head saturation (`R@50 = 1.0`), meaning single-peer optimization suffers diminishing returns. Conversely, building federation-level benchmarks validates the actual "knowledge commons" claim. Therefore, the month must be spent on federation routing and measurement (AkashikBench-F), even though it requires abandoning the easy `R@5` marketing race.
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-4.md:110:### Q2 — Is the Akashik mechanism architecturally novel?
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-4.md:112:The closest architectural analogue for the monotonic availability property is **Freenet** (Clarke et al., 2001, *"A Decentralized, Fault-Tolerant System for Anonymously Publishing Information"*). The identity layer closely mirrors **AT Protocol's** signed personal repositories (AT Protocol Repository Spec). Adopting AT Protocol's DID structure provides immediate interoperability and an established ecosystem; conversely, the disadvantage is inheriting their server-to-server assumptions rather than Akashik's device-level P2P graph. Position Akashik as "AT Protocol for semantic knowledge" fused with "Freenet's monotonic caching"—an emerging approach that adds query-triggered semantic replication, which neither prior system possesses.
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-4.md:115:**AkashikBench-F (Federated Compounding Benchmark)**
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-4.md:130:**Trade-off:** While hyper-focusing on Rust guarantees high query density and fast visible compounding for a niche, the downside is it risks branding Akashik as a language-specific debugging tool rather than a general knowledge commons. Nevertheless, solving the cold-start problem justifies the initial pigeonholing.
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-4.md:138:- **Are.na**: The closest *product* competitor (centralized curation/attribution). Are.na provides a frictionless centralized UX with strong community features; however, Akashik supersedes it by replacing central servers with peer-local federation, prioritizing data sovereignty over immediate onboarding ease.
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-4.md:139:- **AT Protocol (Bluesky)**: The closest *protocol* analogue (signed, portable user-owned records). While AT Protocol excels at social broadcasting and identity portability, Akashik extends it by introducing query-driven semantic knowledge propagation.
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-4.md:140:- **Secure Scuttlebutt (SSB)**: The closest *infrastructure* cousin (device-level, offline-friendly P2P log replication, ACM ICN 2019). SSB is an established best practice for offline mesh networks, but the tradeoff is that Akashik replaces its pure gossip replication with targeted semantic vector search to reduce bandwidth.
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-4.md:144:**Honest Response:** "We acknowledge that federation value is strictly additive and dependent on density. However, Akashik solves the cold-start problem by providing strict single-player value on day one: the local-first web-fallback loop ensures that even a user with zero peers gets a functional, accumulating local knowledge base. The tradeoff is that early adopters bear the cost of local indexing, but they retain sovereign ownership of their data, and the network effect becomes a progressive enhancement rather than a hard prerequisite."
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-4.md:148:If I were Sahar, the next engineering month I'd spend on building the AkashikBench-F federation measurement harness and assessing AT Protocol DID compatibility because the project's core claim of monotonic compounding currently lacks empirical proof. The next marketing/launch month I'd spend on seeding the Rust OSS community with 5 'librarians' and 95 early adopters because demonstrating a sharp drop in the `web_fallback_rate` within a single, high-density domain is the only way to prove the architecture works in practice. Specifically NOT tuning the LongMemEval-S R@5 metric because competing on single-peer memory benchmarks completely abandons Akashik's federated differentiator and chases a mathematical ceiling we've already hit.
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-1.md:12:Akashik = federated knowledge commons for the OSS community.
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-1.md:37:Q2 — Is the Akashik 'ambitioned-curator + curiosity-driven cache'
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-1.md:68:     existing systems that Akashik most directly competes with /
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-1.md:104:*   **Positioning:** Akashik differs by triggering replication via *semantic query similarity* rather than push-flooding or explicit key lookup, and binding DID-signed attribution inextricably to the semantic node. *The tradeoff:* While query-driven semantic replication ensures peers only store what they actually care about (saving disk space), it suffers from much worse cold-start availability than systems like AT Protocol, which use always-on server relays to guarantee uptime.
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-1.md:106:**Q3 — Proposed Benchmark: AkashikBench-F**
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-1.md:129:*   **Tradeoff:** Hyper-focusing on Rust compiler/build errors guarantees high query overlap (proving the compounding loop quickly), but risks pigeonholing Akashik's brand as a niche debugging tool rather than a generalized knowledge commons.
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-1.md:139:1.  **AT Protocol (Bluesky):** *Closest Protocol Analogue.* They solved portable, signed user-repositories via DIDs. *Positioning:* AT Protocol does federated microblogging via central relays; Akashik does query-driven semantic knowledge propagation via device-level P2P.
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-1.md:140:2.  **Are.na:** *Closest Product Analogue.* They built a highly successful, contributor-attributed curated knowledge commons. *Positioning:* Are.na knowledge belongs to a central server and requires manual curation; Akashik knowledge is contributor-owned, distributed, and auto-assembles via semantic graphs.
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-1.md:141:3.  **Secure Scuttlebutt (SSB):** *Closest Infrastructure Fork Target.* They pioneered local-first, offline-friendly, signed P2P replication. *Positioning:* SSB targets chronological social feeds; Akashik targets non-linear, semantic retrieval and agent orchestration.
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-1.md:146:*   **The Argument:** "Compounding is a property of participation density, not just architecture. Akashik's mathematical property ($R(T,t)$ grows over time) is useless until the network hits critical mass. Before that density exists, curiosity-driven pulling will almost always result in a cache miss, making the P2P layer dead weight. You are trying to solve a cold-start social coordination problem with routing infrastructure."
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-1.md:147:*   **The Response:** The cold-start problem is real, but Akashik bypasses the "empty room" failure mode through its `web-on-miss` fallback. On Day 1, a user with zero peers still gets a highly functional, sub-second local agent memory tool that automates their web research. The federated compounding is strictly additive. The system provides immediate single-player utility to
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-1.md:154:**Rationale:** The core mission relies on the compounding loop, which cannot be measured or improved by single-peer retrieval metrics like LongMemEval-S R@5. Chasing R@5 is a marketing exercise for the old single-user product frame; building and measuring the federated mechanism directly validates Akashik's actual value proposition.
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-1.md:158:The closest prior-art paper is **Freenet** (Clarke et al. 2001, "A Decentralized, Fault-Tolerant System for Anonymously Publishing Information"), which formally proved monotonic availability ($R(T,t)$ non-decreasing) via query-path caching. Akashik differs by combining this caching with semantic search, user-attributed DID signatures, and a deterministic web-fallback-and-local-save loop instead of anonymous routing.
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-1.md:161:**AkashikBench-F (Federation Compounding Benchmark)**
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-1.md:190:- **Argument**: "Akashik assumes that making knowledge portable and signed will naturally yield high-quality community memory. In reality, compounding requires network effects you haven't earned, and without density, the federated mechanism is slower and worse than a centralized web search. You have a coordination problem in an infrastructure costume."
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-1.md:191:- **Response**: "We grant that federation provides value only with density, but Akashik is designed to provide immediate single-player value before density is reached. Because the system gracefully falls back to a web search—and saves that result locally for the user's future sessions—a contributor with zero peers still gets a functional, accelerating local memory tool on day 1. Federation is strictly additive to this baseline, solving the cold-start problem by making the single-user experience worthwhile while the network effect builds."
./docs/research/octopus-discover/round-5-2026-05-26/probes/gemini-1.md:194:If I were Sahar, the next engineering month I'd spend on building the AkashikBench-F simulation harness and instrumenting `web_fallback_rate` because these are the only metrics that actually measure the federated compounding claim. The next marketing/launch month I'd spend on onboarding 5-20 Rust infrastructure maintainers to seed a single, high-pain debugging room because deep coverage in one niche proves the mechanism better than thin coverage everywhere. Specifically NOT chasing the last 3% of R@5 on LongMemEval-S because that optimizes for the old, single-user product frame and distracts from the core peer-to-peer value proposition.
./docs/p2p/satisfaction-scoring.md:3:How akashik turns a set of retrieval hits into a single number
./docs/p2p/satisfaction-scoring.md:16:- Hook-level boost: [`.claude/hooks/akashik-prompt-submit.cjs`](../../.claude/hooks/akashik-prompt-submit.cjs) — applied AFTER the base scorer, capped at 1.0, never demotes.
./docs/p2p/satisfaction-scoring.md:47:Applied in `akashik-prompt-submit.cjs` because the base scorer
./docs/p2p/satisfaction-scoring.md:105:  100 queries where Claude was told to use vs. ignore akashik
./docs/marketing/SOCIAL-LAUNCH.md:1:# Akashik — social launch pack
./docs/marketing/SOCIAL-LAUNCH.md:3:The copy that ships when Akashik leaves the bench. One source of
./docs/marketing/SOCIAL-LAUNCH.md:26:> github.com/SaharBarak/akashik
./docs/marketing/SOCIAL-LAUNCH.md:30:> Just shipped Akashik — the globally accumulating knowledge
./docs/marketing/SOCIAL-LAUNCH.md:37:> github.com/SaharBarak/akashik
./docs/marketing/SOCIAL-LAUNCH.md:45:> Akashik lands in the prompt itself.
./docs/marketing/SOCIAL-LAUNCH.md:72:> One uses Akashik. ~10× faster. Cited from local research. Hook
./docs/marketing/SOCIAL-LAUNCH.md:84:> Run a node: github.com/SaharBarak/akashik
./docs/marketing/SOCIAL-LAUNCH.md:88:> Every other RAG fires when the agent calls a tool. Akashik
./docs/marketing/SOCIAL-LAUNCH.md:103:1. **Show HN: Akashik — retrieval lands before the LLM reads the prompt**
./docs/marketing/SOCIAL-LAUNCH.md:104:2. **Show HN: Akashik — globally accumulating knowledge network for AI agents and the humans who run them (P2P, MIT)**
./docs/marketing/SOCIAL-LAUNCH.md:111:> Akashik is a local-first knowledge graph + libp2p P2P
./docs/marketing/SOCIAL-LAUNCH.md:121:> - P2P: libp2p protocols `/akashik/{search,recall,touch,share}/1.0.0`
./docs/marketing/SOCIAL-LAUNCH.md:132:> github.com/SaharBarak/akashik
./docs/marketing/SOCIAL-LAUNCH.md:143:> agent decides it needs context. Akashik fires *before the agent
./docs/marketing/SOCIAL-LAUNCH.md:179:> **Akashik is the globally accumulating knowledge network for AI
./docs/marketing/SOCIAL-LAUNCH.md:187:> *you* run `akashik ask` in your terminal, you read the same
./docs/marketing/SOCIAL-LAUNCH.md:192:> into the agent's tool-call path, Akashik wires it into the
./docs/marketing/SOCIAL-LAUNCH.md:202:> github.com/SaharBarak/akashik
./docs/marketing/SOCIAL-LAUNCH.md:208:> — Akashik lands the answer in the context window before the
./docs/marketing/SOCIAL-LAUNCH.md:217:> [Show] Akashik — local-first knowledge graph + P2P federation that hooks into Claude Code's prompt path
./docs/marketing/SOCIAL-LAUNCH.md:225:> Akashik wires retrieval into the prompt itself. The hook fires
./docs/marketing/SOCIAL-LAUNCH.md:227:> `akashik ask` against a local knowledge graph + connected
./docs/marketing/SOCIAL-LAUNCH.md:243:> github.com/SaharBarak/akashik
./docs/marketing/SOCIAL-LAUNCH.md:247:> [P] Akashik — peer-federated knowledge retrieval with
./docs/marketing/SOCIAL-LAUNCH.md:266:> github.com/SaharBarak/akashik
./docs/marketing/SOCIAL-LAUNCH.md:276:> Same model. Same prompt. The only difference is Akashik.
./docs/marketing/SOCIAL-LAUNCH.md:296:- *Most RAG fires when the agent calls a tool. Akashik fires when the user types.*
./docs/marketing/SOCIAL-LAUNCH.md:301:- *Same model. Same prompt. The only difference is Akashik.*
./docs/marketing/SOCIAL-LAUNCH.md:310:> Building Akashik — the globally accumulating knowledge network
./docs/marketing/SOCIAL-LAUNCH.md:312:> github.com/SaharBarak/akashik
./docs/marketing/SOCIAL-LAUNCH.md:316:> Akashik — knowledge before the prompt. Cooperative, P2P, MIT.
./docs/marketing/SOCIAL-LAUNCH.md:317:> github.com/SaharBarak/akashik
./docs/marketing/SOCIAL-LAUNCH.md:321:> Akashik — knowledge before the prompt.
./docs/marketing/SOCIAL-LAUNCH.md:327:These phrases dilute Akashik by tying it to weaker incumbents.
./docs/marketing/SOCIAL-LAUNCH.md:356:10. **Email blast (if list exists)** — short subject line: "Akashik is live"; body = mission paragraph + repo link.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:12:Akashik = federated knowledge commons for the OSS community.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:37:Q2 — Is the Akashik 'ambitioned-curator + curiosity-driven cache'
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:68:     existing systems that Akashik most directly competes with /
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:97:2. **Q2**: It is **not a new primitive**; the closest prior art is **Freenet** (Clarke et al., 2001, PDF: https://www.cs.princeton.edu/courses/archive/fall11/cos518/papers/freenet.pdf). Freenet explicitly describes “transparent lazy replication,” request-path caching, and a self-reinforcing cycle where successful requests improve routing and replicate popular data closer to future requestors. What Akashik adds is not the caching primitive, but the **product composition**: local-first personal stores, curator-mediated transfer, OSS research artifacts, and explicit provenance expectations. Position it as: **“Freenet-style demand-shaped replication for OSS knowledge, with Aardvark-style expertise routing rather than anonymous file retrieval”**; Aardvark is the closest social-routing neighbor (Horowitz and Kamvar, WWW 2010: https://archives.iw3c2.org/www2010/aardvarkFinalWWW2010.pdf).
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:109:- **(a) Popularity cascade**: **BitTorrent** is the closest solved analog; its `rarest-first` piece selection increases diversity instead of only amplifying already-popular pieces (Legout et al., arXiv:cs/0609026, https://arxiv.org/abs/cs/0609026). Mechanism: preferentially replicate scarce items. For Akashik, the translation is “propagate under-represented but validated records first,” not just most-clicked ones.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:111:- **(c) Adversarial misinformation flood**: **Wikipedia** is the best-known answer, using verifiability rules, citations, revision history, reverts, watchlists, and page protection rather than pure algorithmic ranking (verifiability work: arXiv:1902.11116, https://arxiv.org/abs/1902.11116). Mechanism: provenance plus human moderation plus reversible history. However, research on retracted-paper persistence shows even Wikipedia is imperfect, so Akashik should plan signed provenance, source-quality labels, abuse reporting, and append-only moderation logs from day one.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:114:- **agentmemory**: strongest comparison on local retrieval quality; Akashik should position as “everything agentmemory does locally, plus cross-peer transfer and federation-level compounding.” Source: https://www.agentmemory.tech/
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:115:- **mem0**: strong comparison on production memory infrastructure; Akashik position is “peer-owned and federated memory commons, not an app-scoped memory layer.” Source: https://github.com/mem0ai/mem0 and arXiv:2504.19413.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:116:- **Bluesky / AT Protocol**: strongest comparison on federation architecture; Akashik position is “ATProto for knowledge artifacts and demand-shaped retrieval, not social posting.” Sources: https://github.com/bluesky-social/atproto and https://atproto.com/guides/overview
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:118:8. **Q8**: The devastating argument is: **“This is an overengineered federation story searching for a workload. Retrieval is already near-solved locally, cross-user query overlap is probably too low to create real compounding, and the moment you add federation you inherit abuse, provenance, privacy, deletion, and trust problems that centralized copilots or per-user memory systems avoid.”** The honest response is that this critique is valid unless Akashik proves a narrow, high-overlap use case quickly. So the burden of proof is not philosophical decentralization; it is a measurable federation lift in one community, with signed provenance, moderation/audit logs, and deletion/tombstone semantics good enough that the knowledge graph does not become an ungovernable exfiltration or misinformation cache. If the 30-day pilot cannot show repeated miss-to-hit conversion across different users, the project should be narrowed to local-first memory sync rather than a federated commons.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:130:workdir: /Users/saharbarak/personal/akashik
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:181:Akashik = federated knowledge commons for the OSS community.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:206:Q2 — Is the Akashik 'ambitioned-curator + curiosity-driven cache'
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:237:     existing systems that Akashik most directly competes with /
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:320:2. **Q2**: It is **not a new primitive**; the closest prior art is **Freenet** (Clarke et al., 2001, PDF: https://www.cs.princeton.edu/courses/archive/fall11/cos518/papers/freenet.pdf). Freenet explicitly describes “transparent lazy replication,” request-path caching, and a self-reinforcing cycle where successful requests improve routing and replicate popular data closer to future requestors. What Akashik adds is not the caching primitive, but the **product composition**: local-first personal stores, curator-mediated transfer, OSS research artifacts, and explicit provenance expectations. Position it as: **“Freenet-style demand-shaped replication for OSS knowledge, with Aardvark-style expertise routing rather than anonymous file retrieval”**; Aardvark is the closest social-routing neighbor (Horowitz and Kamvar, WWW 2010: https://archives.iw3c2.org/www2010/aardvarkFinalWWW2010.pdf).
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:332:- **(a) Popularity cascade**: **BitTorrent** is the closest solved analog; its `rarest-first` piece selection increases diversity instead of only amplifying already-popular pieces (Legout et al., arXiv:cs/0609026, https://arxiv.org/abs/cs/0609026). Mechanism: preferentially replicate scarce items. For Akashik, the translation is “propagate under-represented but validated records first,” not just most-clicked ones.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:334:- **(c) Adversarial misinformation flood**: **Wikipedia** is the best-known answer, using verifiability rules, citations, revision history, reverts, watchlists, and page protection rather than pure algorithmic ranking (verifiability work: arXiv:1902.11116, https://arxiv.org/abs/1902.11116). Mechanism: provenance plus human moderation plus reversible history. However, research on retracted-paper persistence shows even Wikipedia is imperfect, so Akashik should plan signed provenance, source-quality labels, abuse reporting, and append-only moderation logs from day one.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:337:- **agentmemory**: strongest comparison on local retrieval quality; Akashik should position as “everything agentmemory does locally, plus cross-peer transfer and federation-level compounding.” Source: https://www.agentmemory.tech/
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:338:- **mem0**: strong comparison on production memory infrastructure; Akashik position is “peer-owned and federated memory commons, not an app-scoped memory layer.” Source: https://github.com/mem0ai/mem0 and arXiv:2504.19413.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:339:- **Bluesky / AT Protocol**: strongest comparison on federation architecture; Akashik position is “ATProto for knowledge artifacts and demand-shaped retrieval, not social posting.” Sources: https://github.com/bluesky-social/atproto and https://atproto.com/guides/overview
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-0.md:341:8. **Q8**: The devastating argument is: **“This is an overengineered federation story searching for a workload. Retrieval is already near-solved locally, cross-user query overlap is probably too low to create real compounding, and the moment you add federation you inherit abuse, provenance, privacy, deletion, and trust problems that centralized copilots or per-user memory systems avoid.”** The honest response is that this critique is valid unless Akashik proves a narrow, high-overlap use case quickly. So the burden of proof is not philosophical decentralization; it is a measurable federation lift in one community, with signed provenance, moderation/audit logs, and deletion/tombstone semantics good enough that the knowledge graph does not become an ungovernable exfiltration or misinformation cache. If the 30-day pilot cannot show repeated miss-to-hit conversion across different users, the project should be narrowed to local-first memory sync rather than a federated commons.
./docs/p2p/peer-reputation-design.md:4:Synthesis at `~/.claude-octopus/results/probe-synthesis-1778145513.md` (654 KB).
./docs/p2p/peer-reputation-design.md:21:| Work                 | What it got right                                                    | What's wrong-fit for akashik                              |
./docs/p2p/peer-reputation-design.md:28:| **SybilGuard** (Yu 2008) | Graph-based identity defense                                   | Assumes social trust graph akashik doesn't have today    |
./docs/p2p/peer-reputation-design.md:107:`~/.akashik/peer-reputation.json` — local, atomic temp-write + rename
./docs/p2p/peer-reputation-design.md:230:| 7 | `akashik peers rep [<peer-id>]` inspect command | **ADD-NEXT** | `src/cli/commands/peers-rep.ts` (new) |
./docs/p2p/peer-reputation-design.md:231:| 8 | Pull-on-demand wire protocol (signed review summaries) | **ADD-LATER** | New `/akashik/reputation/1.0.0` libp2p protocol |
./docs/p2p/peer-reputation-design.md:281:- Multi-LLM round-4 synthesis at `~/.claude-octopus/results/probe-synthesis-1778145513.md`
./docs/product/VISION.md:3:Akashik is not a vector store with peer sync bolted on. It is an attempt
./docs/product/VISION.md:13:Akashik becomes a serious agent-memory protocol. Full thinking surface
./docs/product/VISION.md:26:the missing fact that would change the action. Akashik treats this as a
./docs/research/octopus-discover/round-4-2026-05-26/README.md:5:- The pivot from `akashik` (agent-memory product) to **Akashik**
./docs/product/RELEASE-v4.md:1:# Akashik v4 — Agent Brain
./docs/product/RELEASE-v4.md:10:> Akashik v4 is the first OSS P2P agent memory framework with cryptographic identity, brain-shaped caching, and episodic-to-semantic background consolidation. CPU-local, Apache 2.0 / MIT, zero SaaS dependencies.
./docs/product/RELEASE-v4.md:26:**Claim**: A running `akashik daemon` with its L1 query cache warm serves repeat `ask` queries in **~100 ms**. A cold CLI (no daemon) takes **~900 ms**.
./docs/product/RELEASE-v4.md:28:**Measured** (live akashik home, 10,607 nodes, warm ONNX cache on disk):
./docs/product/RELEASE-v4.md:36:The native Rust client (`akashik-rs/src/bin/akashik_cli.rs`) collapses the Node-boot floor to ~5 ms — total round trip ~27 ms for cached repeat queries. Compose with daemon IPC + L1 cache and you hit the original 60× plan target *for cached repeats*. Cache misses run ~160–240 ms because the actual work (embed + search) dominates; native client overhead is irrelevant on miss.
./docs/product/RELEASE-v4.md:40:npx akashik@4 daemon start
./docs/product/RELEASE-v4.md:42:time akashik ask "your query"                 # cold miss, ~280 ms
./docs/product/RELEASE-v4.md:43:time akashik ask "your query"                 # warm hit, ~100 ms
./docs/product/RELEASE-v4.md:68:AKASHIK_RUST_BIN=./akashik-rs/target/release/embed_server \
./docs/product/RELEASE-v4.md:105:**Claim**: Akashik v4 is the first OSS agent memory framework that ships **episodic→semantic background consolidation as a reusable primitive**. A `sessions` room of 7,002 raw Claude Code transcript entries gets clustered by cosine similarity, each cluster LLM-summarized, and persisted as a `consolidated_memory` graph node with cryptographic provenance chain.
./docs/product/RELEASE-v4.md:137:akashik consolidate run <room> --dry-run --threshold 0.8 --min-size 5
./docs/product/RELEASE-v4.md:146:**Coordination with the daemon**: Both `akashik daemon` and `akashik consolidate run` acquire the cross-process write lock at `<home>/akashik.lock` (file-based exclusive create with stale-PID recovery). The daemon holds it for its lifetime + refreshes every 20s; consolidate waits up to 30s for it. **No "stop the daemon first" caveat — run anytime.** Stale-recovery handles the case where a prior holder crashed without releasing.
./docs/product/RELEASE-v4.md:148:**Atomic prune** — pass `--prune` to `akashik consolidate run` and the source raw entries get deleted from BOTH the graph and the vector index after successful consolidation. Closes the §2j quality regression by removing BM25 competition from the still-indexed raw text. Mutually exclusive with `--dry-run`.
./docs/product/RELEASE-v4.md:172:**Claim**: Every memory entry Akashik emits can be cryptographically attributed to a **user DID** (not a device, not a provider). Cross-device memory portability is proven end-to-end — a signed envelope on device A verifies on a freshly-recovered device B with zero prior contact.
./docs/product/RELEASE-v4.md:177:- Domain-separated signatures (`akashik-auth:v1:` vs `akashik-sig:v1:`)
./docs/product/RELEASE-v4.md:236:npm install -g akashik@4
./docs/product/RELEASE-v4.md:237:akashik identity init         # no-op if you already have a DID
./docs/product/RELEASE-v4.md:238:akashik daemon start          # enables the IPC hot path
./docs/product/RELEASE-v4.md:259:akashik consolidate run sessions --threshold 0.8 --min-size 5
./docs/product/RELEASE-v4.md:261:akashik consolidate run sessions --threshold 0.8 --min-size 5 --prune
./docs/product/RELEASE-v4.md:271:- ✅ **v4.0 — Native Rust client** (`akashik-rs/src/bin/akashik_cli.rs`, commit `a462f86`). Cold-starts ~5 ms, IPC round trip ~22 ms, total **27 ms** end-to-end for cached repeats. **33× faster than v3 cold CLI**. Falls back to Node shim when daemon socket absent or command not delegatable.
./docs/product/RELEASE-v4.md:272:- ✅ **v4.0 — BIP39 24-word mnemonic recovery** (`src/application/bip39-recovery.ts`, commit `8dced04`). 24-word English phrase = 256 bits = exact Ed25519 seed. `akashik identity export` defaults to mnemonic; `--hex` for v1 legacy format. Import autodetects either form. Adds `@scure/bip39` (40 KB audited dep, used by every Bitcoin/ETH wallet).
./docs/product/RELEASE-v4.md:273:- ✅ **v4.0 — Cross-process write lock** (`src/infrastructure/process-lock.ts`, commit `5591757`). Daemon and mutating CLI commands coordinate via `<home>/akashik.lock`. Stale-PID recovery + 20s heartbeat refresh. No "stop daemon" caveat anymore.
./docs/product/RELEASE-v4.md:276:- ✅ **v4.0 — Backup-before-prune** (commits `3c16238`, `91840da`). `--prune` writes NDJSON backup of source nodes by default; `--no-backup` opt-out. `akashik sessions reingest` recovers from full sessions-state.json wipe + re-trigger.
./docs/product/RELEASE-v4.md:277:- ✅ **v4.0 — Cache observability** (`akashik cache-stats`, commit `b2ab5ed`). Daemon-side L1 hit/miss/eviction counters exposed via IPC.
./docs/product/BENCHMARKS.md:3:Real retrieval quality measured against canonical BEIR datasets using Akashik's runtime pipeline. All numbers directly comparable to the [MTEB BEIR leaderboard](https://huggingface.co/spaces/mteb/leaderboard).
./docs/product/BENCHMARKS.md:29:| **Akashik Phase 25 (hybrid + Rust)** | **137M** | **75.22%** | **CPU, 11ms p50** |
./docs/product/BENCHMARKS.md:59:cd akashik-rs && cargo build --release && cd ..
./docs/product/BENCHMARKS.md:60:AKASHIK_RUST_BIN=$(pwd)/akashik-rs/target/release/embed_server \
./docs/product/BENCHMARKS.md:71:  --datasets-dir ~/.akashik/bench/cqadupstack/cqadupstack \
./docs/product/BENCHMARKS.md:126:15. Phase 23 — **Unified memory bench** (`akashik bench memory`): 8 suites scoring 9 dimensions, composite **0.8597** on real public corpora (Phase 23.7 — Hetzner, 2026-05-20). Synthetic-fallback composite is 0.9107.
./docs/product/BENCHMARKS.md:136:that's stricter than any single public suite. Phase 23 ships `akashik
./docs/product/BENCHMARKS.md:142:akashik bench memory --json
./docs/product/BENCHMARKS.md:197:**B. Akashik-specific synthetic suites — five gap axes no public benchmark covers:**
./docs/product/BENCHMARKS.md:238:| **Akashik** (synth fallback) | unified composite | **0.9107** | 9 dimensions, no LLM judge |
./docs/product/BENCHMARKS.md:239:| **Akashik** (Hetzner, Phase 23.7 real public corpora) | unified composite | **0.8597** | real BEIR SciFact + LongMemEval-S oracle + LoCoMo factual; synthetic in 5 of 9 dimensions |
./docs/product/BENCHMARKS.md:245:Three real-corpus suites are now wired into the bench CLI. They share the env contract `AKASHIK_BENCH_PUBLIC_REAL=1` (master gate; off by default to keep CI fast) and each takes a dataset-directory env var. Without the gate or the dataset they `t.skip()` cleanly and the composite falls back to the synth/proxy value (registration order in `src/cli/commands/bench.ts` is `synth → real` so real overwrites synth iff real ran).
./docs/product/BENCHMARKS.md:258:AKASHIK_BENCH_PUBLIC_REAL=1 \
./docs/product/BENCHMARKS.md:263:  akashik bench memory --json
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-2.md:11:Akashik = federated knowledge commons for the OSS community.
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-2.md:36:Q2 — Is the Akashik 'ambitioned-curator + curiosity-driven cache'
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-2.md:67:     existing systems that Akashik most directly competes with /
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-2.md:106:# Akashik Round 5 — Direct Answers to Q1–Q8
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-2.md:125:| P2P cooperative cache with semantic miss | **Cooperative web caching (Squid/ICP, RFC 2186, 1997)** — peers consult each other on cache miss before hitting origin. Akashik replaces URL-identity with vector-similarity. | RFC 2186 (Wessels & Claffy, 1997) |
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-2.md:178:1. **Nix/NixOS community** — discourse.nixos.org (~40K members), GitHub nix-community (~600 active contributors). Value proposition: reproducible local tooling, no cloud dependency, Nix flake install is a natural fit for akashik.
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-2.md:180:3. **Elixir/Phoenix community** — elixirforum.com (~50K members). Highly documentation-oriented, love functional programming, many run local dev environments. akashik's functional DDD architecture resonates.
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-2.md:197:**The hook that gets ~100 contributors:** "Your Claude remembers conversations; Akashik lets your Claude remember what your entire team has read — across companies, without a server." The federation event makes this visceral.
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-2.md:207:**System that solved it:** BitTorrent's **rarest-first piece selection** (Cohen 2003, "Incentives Build Robustness in BitTorrent"). Peers preferentially request pieces that fewer peers have, ensuring swarm-wide diversity and preventing any single piece from monopolizing bandwidth. **Mechanism applied to Akashik:** weight the curiosity queue by inverse peer-count of the node — nodes held by fewer peers get propagation priority over nodes already held by many. Implementation: add a `peer_count` field to `GraphNode`, updated by the gossip layer; curiosity score = query_relevance / (1 + log(peer_count + 1)).
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-2.md:213:**System that solved it:** **Wikipedia's Vital Articles + Good Article editorial system.** A designated cadre explicitly maintains coverage of tail knowledge regardless of traffic. **Mechanism applied to Akashik:** room-level `protected: true` flag. Protected rooms are exempt from any future eviction / compaction logic. The existing `shareStore` already has a `shareable` flag (Phase 16); extend it with `protected`. Rooms explicitly flagged by the room owner survive curiosity-driven decay. Curators self-identify.
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-2.md:219:**System that solved it:** **Bluesky/ATProto's labeler architecture** (2023, github.com/bluesky-social/atproto). Third-party labelers can tag content; each peer configures which labelers to subscribe to. Content is not deleted globally — it is filtered locally per-peer trust policy. **Mechanism applied to Akashik:** the W3C did:key signed envelope layer (Phase 32) is already in place — every node has a verifiable `device_id + user_did` chain. Add: a `trust_score` per peer DID, computed from endorsements by other trusted peers (web-of-trust). At ingest, nodes from peers below a configurable trust threshold are quarantined (indexed but not surfaced in default search). The `ScanError.SecretDetected` hard-block pattern (already in Phase 18) is the template for this quarantine path.
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-2.md:229:**1-line positioning:** *"mem0 remembers your conversations; Akashik remembers everything you've read and researched — and lets your peers' knowledge answer your questions."*
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-2.md:233:**1-line positioning:** *"Are.na is what Akashik looks like without the retrieval layer — Akashik is Are.na where any query gets answered, not just browsed."*
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-2.md:237:**1-line positioning:** *"Letta extends a single agent's memory; Akashik extends a community's collective research memory — portably, across providers and devices."*
./docs/research/octopus-discover/round-5-2026-05-26/probes/claude-sonnet-2.md:267:The Phase 4 consolidation left 6,013 raw entries flagged `consolidated_at != null` but not pruned. These compete with consolidated_memory nodes in BM25 (confirmed cause of the 55% quality proxy failure in §2j). The quarantine pattern: after consolidation, raw entries move to a `consolidated_raw` partition that is excluded from BM25 but retained for vector search. Add a `akashik prune --room <room>` command that performs this partition split and verify with the entity-extraction probe (§2j path forward).
./docs/p2p/p2p-threat-model.md:3:Scope: the attack surface exposed once a akashik node accepts data from **untrusted peers** via `share sync` (Y.js CRDT) or `touch` (one-shot pull). This document enumerates concrete paths from a hostile peer to code execution or secret exfiltration, and the mitigations that are (a) shipped, (b) planned, or (c) deferred.
./docs/p2p/p2p-threat-model.md:5:**Threat actor.** A peer on the P2P network who has completed the libp2p handshake and can send arbitrary payloads on `/akashik/share/1.0.0` and `/akashik/touch/1.0.0`. Peers are not authenticated beyond their ed25519 peer identity — there is no external PKI and no "this peer is trusted" claim.
./docs/p2p/p2p-threat-model.md:11:4. `~/.akashik/*.yaml`, `peer-identity.json` — private key for peer identity.
./docs/marketing/how-akashik-works.md:1:# How Akashik works
./docs/marketing/how-akashik-works.md:4:Akashik possible. Written for the reader who has heard "federated
./docs/marketing/how-akashik-works.md:10:copy lives in [`storybrand-messaging-draft.md`](./storybrand-messaging-draft.md).
./docs/marketing/how-akashik-works.md:14:Each Akashik peer holds **only its own information** — what its
./docs/marketing/how-akashik-works.md:17:federation couldn't satisfy a query. When you ask Akashik
./docs/marketing/how-akashik-works.md:42:       Query A's LOCAL Akashik graph
./docs/marketing/how-akashik-works.md:112:   the date, the source — not a faceless "Akashik says". Knowledge
./docs/marketing/how-akashik-works.md:156:**availability follows participation**. Akashik doesn't pretend
./docs/marketing/how-akashik-works.md:172:Akashik's **"each peer holds only what it has asked for or
./docs/marketing/how-akashik-works.md:235:- [`storybrand-messaging-draft.md`](./storybrand-messaging-draft.md) — Brand messaging that this mechanism credibility-anchors.
./docs/marketing/positioning-draft.md:5:> Akashik is the only way to accumulate, share, and stream knowledge seamlessly into your LLM work sessions.
./docs/marketing/positioning-draft.md:9:> Akashik builds on the global accumulation of knowledge and marks the new age in web, decentralized knowledge web.
./docs/marketing/positioning-draft.md:13:## What category does Akashik sit in?
./docs/marketing/positioning-draft.md:17:| Adjacent | What they share | What Akashik adds |
./docs/marketing/positioning-draft.md:25:Best framing: **Akashik is a knowledge layer for AI agents.** Specifically, the layer between "what the model was trained on" and "what the agent reaches for online" — local + peer-federated graphs that the agent reads as part of its prompt arrival, not as a tool it has to call.
./docs/marketing/positioning-draft.md:32:Frames Akashik against the closed-lab monopoly. Good for HN crowd, founders, senior engineers.
./docs/marketing/positioning-draft.md:34:- **12 words:** *Closed labs hoard knowledge. Akashik federates it. Signed, local-first, sub-second.*
./docs/marketing/positioning-draft.md:35:- **25 words:** *Closed labs froze the knowledge in the model. Akashik unfreezes it: every peer's research, code, and notes federated locally — your agent reads it before it reaches for the web.*
./docs/marketing/positioning-draft.md:36:- **60 words:** *Frontier labs trained on what existed six months ago. The thing you actually need was published yesterday, by ten thousand people, none of whom got asked. **Akashik is how that ecosystem shares its knowledge.** Every peer keeps a local-first graph; the network federates over libp2p with cryptographic identity you own. No servers. No subscriptions. No revoke.*
./docs/marketing/positioning-draft.md:44:- **25 words:** *Akashik gives every AI agent a sub-second knowledge layer. Local graphs federate over libp2p; retrieval lands as cited context before the agent reaches for the internet.*
./docs/marketing/positioning-draft.md:45:- **60 words:** *Akashik is a knowledge layer for AI agents. 11 ms p50 retrieval over your code, your dependencies, your research. Hook-injected into Claude Code, Codex, Gemini, and any MCP host before the agent considers a tool call. Federates over libp2p with W3C identity; signed envelopes prove what came from where. **75% NDCG@10 on BEIR SciFact, MIT-licensed, github.com/SaharBarak/akashik.***
./docs/marketing/positioning-draft.md:52:- **25 words:** *Akashik is the decentralized knowledge web — every peer's research, code, and conversations, federated into a layer your AI agents read before they ever reach for the internet.*
./docs/marketing/positioning-draft.md:53:- **60 words:** *The web's first chapter was pages. Its next is knowledge — the structured, current, attributed shape of what each of us has learned. **Akashik is the decentralized knowledge web for AI agents.** Every peer keeps a local graph; the graphs federate over libp2p with cryptographic identity. Your agent's context arrives before it ever asks the open web.*
./docs/marketing/positioning-draft.md:55:**Tradeoff.** "Decentralized" carries crypto-baggage. Needs a sentence somewhere reassuring there's no chain. The 60-word version handles this implicitly ("libp2p" + "cryptographic identity" without "blockchain") but a casual reader could miss it. **The "next chapter" framing is the strongest move in this lead** — it places Akashik in web-historical context without overclaiming.
./docs/marketing/positioning-draft.md:61:- **25 words:** *Every other RAG fires when the agent calls a tool. Akashik fires when the user types — local graph, cited, sub-second, before the LLM has thought.*
./docs/marketing/positioning-draft.md:62:- **60 words:** *Most retrieval systems wait for the agent to decide it needs to search. **Akashik lands in the prompt itself.** The hook fires on UserPromptSubmit, queries the local + federated graph, and injects cited context before the LLM reads the question. Same model, same prompt — but answered from your peers' graphs, not the open web.*
./docs/marketing/positioning-draft.md:64:**Tradeoff.** Strongest *technical* differentiator on this list — only Akashik does this, today. Risks being inscrutable to non-technical viewers (what's a "UserPromptSubmit hook"?). Best paired with the side-by-side gif as the visual proof.
./docs/marketing/positioning-draft.md:96:These phrases dilute Akashik by associating it with weaker incumbents. **Avoid:**
./docs/marketing/positioning-draft.md:101:4. **"Knowledge management for the AI era."** Too soft. Akashik isn't about *managing* knowledge — it's about *federating* it.
./docs/marketing/positioning-draft.md:113:The second risk: **Lead A and Lead C's "movement" framing reads as overclaim** if the system doesn't *yet* feel networked at the moment a new user installs it. Akashik's local-first design means a fresh install sees zero peers. The README has to make the local-only experience compelling on its own — which the prompt-hook gif does — so the federation story is upside, not the only story.
./docs/marketing/positioning-draft.md:117:**Headline:** Lead C, 60-word, with the existing performance-claim line preserved as the second paragraph. Replace the current "Akashik is the only way to accumulate, share, and stream knowledge..." with:
./docs/marketing/positioning-draft.md:121:> learned. **Akashik is the decentralized knowledge web for AI
./docs/marketing/positioning-draft.md:128:> Same model. Same prompt. The only difference is Akashik.
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:9:The project pivoted from "akashik: agent-memory product" to
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:10:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:20:called "akashik" internally.
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:26:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:37:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:149:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:157:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:172:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:176:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:197:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:205:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:220:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:244:    why Akashik differs
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:258:This synthesis combines a direct analysis of the local codebase with the mandatory systemic perspectives. The findings below are grounded strictly in the actual file contents, repository structure, and CI/CD configurations found in your workspace, directly applying them to your recent pivot to the **Akashik** federated knowledge commons.
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:280:**Relation to the Akashik Pivot:**
./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:327:*   **Balanced Trade-off:** The advantage of your current setup is that developers feel safe sharing rooms because API keys are scrubbed. The disadvantage is that enterprise SOC2 Type II auditors will fail the system. An enterprise needs to prove *who asked what, and what specific data left the local machine*. Because Akashik peers autonomously federate queries via `ask --peers`, a SOC2 audit cannot easily prove that a specific piece of proprietary IP wasn't inadvertently synced to an unauthorized peer's local graph.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:11:The project pivoted from "akashik: agent-memory product" to
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:12:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:22:called "akashik" internally.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:28:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:39:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:151:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:159:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:174:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:178:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:199:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:207:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:222:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:246:    why Akashik differs
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:266:# FOURTH-ROUND ANALYSIS — Akashik / akashik
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:273:The stack is TypeScript / DDD with clean layer separation (`domain` → `application` → `infrastructure` → `cli`/`mcp`). Domain layer is pure: immutable graph values, `neverthrow` Result monads throughout, no I/O. Key domain types confirm what the prompt describes: `graph.ts` (immutable GraphNode/GraphEdge), `eval-metrics.ts` (pure `recallAtK`/`ndcgAtK`/`reciprocalRank`), `contextual-enrich.ts` (E11, pure, deterministic), `llm-listwise-rerank.ts` (ports-and-adapters for LLM, shuffle already shipped at commit 1f828b7), `sharing.ts` (SEC-03 boundary: no raw embeddings cross the wire), `oracle.ts` (P2P Q&A as pure graph-node data shape), `federated-search.ts` (Promise.all fan-out with 2000ms per-peer timeout, dedup prefers local). The architecture is sound for the Akashik mission. The retrieval plumbing is well-built. The open question is what to measure next.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:279:**The headline claim first:** continuing to push per-peer R@5 is a marketing question for the OLD product frame, not an engineering question for Akashik.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:283:More importantly: Akashik's product claim is not "our single-peer R@5 beats mem0." That was akashik's frame, and the pivot explicitly abandoned it. Akashik's claim is that the compounding loop produces network-level knowledge availability that grows monotonically. That claim cannot be validated by any per-peer retrieval benchmark. The engineering debt is not "push R@5 from 0.920 to 0.940." The engineering debt is "there is no benchmark for what we claim."
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:295:## Q2 — Is the Akashik mechanism novel or a known pattern?
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:301:| System | What it shares with Akashik | What's missing |
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:309:**What makes Akashik defensibly different:** The mechanism where (a) propagation is triggered by semantic query similarity not by push replication or key lookup, (b) DID-signed attribution is non-separable from the content node (it travels as a graph property, not as metadata that can be stripped), and (c) the satisfaction gate is a protocol-level decision (the `0.85 threshold` in VISION.md) not a UX heuristic — this combination exists nowhere in the prior art literature.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:311:The single most important citation to engage: **Freenet's monotonic availability proof.** Akashik's `R(T,t) = monotonically non-decreasing` is structurally the same claim. You should either cite and extend Freenet's proof to the semantic-search case, or derive your own. Without a formal proof or simulation backing it, "compounding is a property of the architecture, not a marketing claim" is still a marketing claim.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:319:**Proposed: AkashikBench-F (Federation Compounding Benchmark)**
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:357:- **Availability confounding.** Your current bench runs with all peers online. In production, the 2000ms timeout means some peers never respond. Your single-peer benchmarks (LME-S, LoCoMo) don't model this. AkashikBench-F should include a "partial availability" condition: what is federation R@k when 20% of peers are offline?
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:375:**The real risk:** publishing "akashik 0.9202 vs mem0 0.925" when the evaluation protocols differ is a credibility trap. The correct framing for Akashik launch is NOT R@5 comparison against single-user products. It's `web_fallback_rate` vs baseline (before federation) — a metric only Akashik can report.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:383:Reasons: small and high-trust (≈5,000 serious contributors globally), terminal-native (CLI fits), deep knowledge-sharing culture (This Week in Rust newsletter has 15k+ subscribers), and the community has a known pain — institutional memory evaporates when maintainers rotate. Akashik's compounding property is precisely the fix.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:389:Direct invite to maintainers of top-100 crates by download count. Message: "You already know things that took months to learn. Akashik keeps that knowledge alive for the next person, attributed to you." The attribution model matters here — unlike Confluence/Notion, contributions stay yours.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:392:Submit a This Week in Rust link. Not a blog post — a concrete demo: "Ask 'how do I handle backpressure in tokio::mpsc?' — watch Akashik answer from peer knowledge instead of web." The demo should show the `_source_peer` field (already in `FederatedMatch`) crediting the actual peer that contributed the answer.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:407:The known solution is **topic diversity indexing**, analogous to Mastodon's local vs. federated timeline split. Akashik's room structure partially mitigates this (niche rooms exist independently), but within a room, hot nodes will crowd out cold ones in search rankings.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:423:The asymmetry to be honest about: misinformation spreads faster than corrections in every P2P network studied. Akashik's DID attribution is the correct mitigation (you can identify and quarantine a bad actor's entire contribution graph) but the window between propagation and quarantine is real. Launch comms should acknowledge this explicitly rather than claiming "attribution solves misinformation."
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:433:This is the most important one. AT Protocol solved federated identity (DIDs), signed content, Personal Data Servers (each user owns their data), and protocol-level federation at scale (millions of users). Their architecture maps almost directly: PDS = Akashik peer, DID = Akashik contributor identity, lexicon record type = Akashik graph node type.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:437:**Practical question for the engineering month:** should Akashik use AT Protocol DIDs natively? The `identity-store.ts` and `github-oauth.ts` infrastructure suggests GitHub OAuth DIDs. Assess whether AT Protocol DID anchoring is feasible — if yes, Akashik inherits AT Protocol's identity ecosystem and becomes a knowledge-graph extension of the AT Protocol universe rather than a competing P2P identity system.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:441:Are.na is the closest product-level analogue. Curated cards, attributed to contributors, topic-organized, designed for thinkers/researchers/OSS community. Are.na is what Akashik would look like centralized. It has ~700k users and genuine community adoption among exactly Akashik's target demographic.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:443:The competitive differentiation is NOT features — Are.na is polished. The differentiation is: Are.na's knowledge belongs to Are.na's servers. Akashik's knowledge belongs to its contributors. That's a values-level difference that resonates with the OSS community specifically.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:447:Not a competitor in the traditional sense — Obsidian is a tool, Akashik is a protocol. But Obsidian's user base (technical writers, researchers, OSS developers who maintain public "digital gardens") is exactly Akashik's first-wave contributor pool. An Obsidian plugin that treats a published Obsidian vault as an Akashik peer would give Akashik instant distribution to Obsidian's 1M+ users without requiring them to change their workflow.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:457:> "This is a coordination problem in an infrastructure costume. Compounding is a property of participation density, not architecture. The mechanism only works when enough peers are online and have already pulled the relevant knowledge — which requires network effects you haven't earned yet. Every federated network (Mastodon, Matrix, Diaspora) has built technically correct architecture and then struggled for years to reach the critical mass where the federated property is actually better than the centralized alternative. Akashik's architectural insight about R(T,t) is correct but irrelevant until you have R(T, t) >> 0 for enough T, which is a community-building problem, not an engineering problem. The next engineering month could be zero effort and the project would succeed faster by spending that month on community seeding and distribution."
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:463:The cold-start problem is real for every network, but it conflates two distinct claims. The first claim — "federation is valuable once you have density" — is trivially true and grants the counter-argument. The second claim — "Akashik provides value before density" — is the actual product bet, and it's defensible: the web-fallback path means a contributor with zero peers still gets a functional local knowledge tool on day 1. Federation value is strictly additive. The counter-argument applies if Akashik required federation to work at all; it doesn't. However, the counter-argument correctly identifies the real risk: if the compounding claim is made at launch but can't be demonstrated (because the network is too sparse), early adopters experience a tool that feels like a slower version of their existing web search. The engineering month is not zero precisely because without `web_fallback_rate` instrumentation and AkashikBench-F, there is no number to show at launch that makes the compounding claim concrete rather than aspirational. The engineering constraint is measurement, not architecture.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:472:- **The identity pivot is architecturally correct.** The codebase already has all the infrastructure needed for the Akashik mission: federated search with dedup and attribution (`federated-search.ts`), peer reputation (`peer-reputation-store.ts`), oracle P2P Q&A (`oracle.ts`), DID identity (`identity-store.ts`), SEC-03 metadata boundary (`sharing.ts`). None of this needs to be built. What needs to be built is the measurement infrastructure for what the mission claims.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:476:1. **AkashikBench-F harness** — build the N-peer simulation bench described in Q3. This is what validates the mission claim. Without it, launch is vibes. With it, launch is a paper and a credible number.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:12:The project pivoted from "akashik: agent-memory product" to
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:13:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:23:called "akashik" internally.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:29:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:40:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:152:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:160:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:175:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:179:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:200:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:208:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:223:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:247:    why Akashik differs
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:271:*   **The Tradeoff/Disadvantage:** Every engineering hour spent squeezing 1pp out of LME-S is an hour stolen from the core Akashik mechanism. Furthermore, optimizing for LME-S ignores the actual engineering fire: the LoCoMo benchmark’s 60pp recall headroom where current rerankers are fundamentally failing.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:274:**Q2. Prior Art & Architectural Novelty of the Akashik Mechanism**
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:275:The Akashik mechanism (local + fan-out + web-on-miss + DID-signed save + transfer) is not entirely novel in its components, but its *composition* is unique.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:279:*   **How Akashik Differs (The Novelty):** Akashik replaces the "URL" with a "Semantic LLM context/solved task." It is a cooperative cache for *generative AI problem-solving*, signed cryptographically via W3C `did:key`. 
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:300:*   **(d) Competitor Baselines:** Comparing Akashik to `mem0` or `ByteRover` is structurally flawed. They are *global, centralized* state machines. Comparing a centralized graph's recall against a single peer's partitioned state is intellectually dishonest. 
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:326:*   **The Response:** "Akashik bypasses the traditional free-rider problem because *contribution requires zero friction*. In standard systems, users must stop working to write a forum post. In Akashik, the act of a user privately solving their own problem via an LLM web-miss automatically creates the signed artifact. The cost of serving that artifact to a peer is a negligible background SQLite vector lookup (~11ms). We don't need tokenomics because the byproduct of selfish utility is collective wealth."
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:12:The project pivoted from "akashik: agent-memory product" to
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:13:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:23:called "akashik" internally.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:29:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:40:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:152:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:160:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:175:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:179:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:200:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:208:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:223:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:247:    why Akashik differs
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:275:Here is the synthesis and strategic analysis of the Akashik pivot, addressing the empirical results, architectural mechanism, and open questions.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:289:*   **How Akashik Differs:** Freenet uses content-hash addressing for exact file retrieval; YaCy uses distributed inverted indexes for lexical search. Akashik uses **semantic vector space for probabilistic context retrieval**, and crucially, it uses the **LLM web-miss as the automated ingest motor**. Prior systems relied on humans manually uploading files or running broad, dumb web crawlers. Akashik is demand-driven by localized AI curiosity.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:308:*   **(d) Competitor Baselines:** **Category error.** Comparing Akashik to Mem0 or AgentMemory on single-user benchmarks is structurally flawed. They are centralized, isolated silos. Akashik’s advantage is the network effect. Beating them on zero-shot local retrieval is nice, but irrelevant to the compounding mission.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:315:    *   *Day 1-7:* Distribute Akashik to 20 maintainers/power users with pre-seeded graphs in room `local-llm-dev`.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:332:1.  **Stack Overflow / Stack Exchange (Centralized):** The dominant Q&A commons. Akashik supersedes it by removing the human bottleneck—automating the Q&A generation via the LLM web-miss and decentralizing the storage.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:333:2.  **Perplexity / Cursor (AI Search):** They provide instant answers via centralized compute. Akashik competes by providing instant answers via decentralized, zero-marginal-cost peer memory.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:334:3.  **Collaborator / Fork Target: Bluesky / AT Protocol.** The AT Protocol solved federated cryptographic identity (DIDs) and decentralized data repositories (PDS). Akashik is architecturally adjacent; it could theoretically run *on top of* the AT Protocol's data layer, swapping social microblogging for semantic vector storage.
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:339:**The Response:** Akashik mitigates this through strict cryptographic provenance, explicit data aging, and conflict surfacing. Every node carries a `did:key` signature and a `fetched_at` timestamp, and system rooms automatically age out (7-30 days). More importantly, the protocol is designed to surface *conflicting evidence* rather than smoothing it over. If Peer A has a stale fix and Peer B has the new one, the agent receives an explicit "contract" highlighting the contradiction, forcing a live verification search rather than a blind skip. 
./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:348:We have proven that the local retrieval engine works well enough (75.22% NDCG). We have proven the plumbing (libp2p, CRDTs). The existential threat to the Akashik mission is now **epistemic pollution**. If we do not ship the Web-of-Trust reputation metrics, explicit stale-node invalidation, and the conflict-surfacing agent contract, the network will drown in its own stale hallucinations within 60 days of launch. Build the immune system.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:12:Akashik = federated knowledge commons for the OSS community.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:37:Q2 — Is the Akashik 'ambitioned-curator + curiosity-driven cache'
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:68:     existing systems that Akashik most directly competes with /
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:95:1. **Q1:** Spend the next engineering month on **federation architecture and measurement**, not on squeezing LME-S `R@5` from `0.9202` toward `agentmemory`’s claimed `0.952`. Your own numbers show the single-peer head is already near-saturated on LongMemEval-S (`R@50 = 1.0000`, `NDCG@5 = 0.8836`, `MRR = 0.9034`) while the product claim lives or dies on Step 5 transfer, not on another 1-3 leaderboard points ([Round 4 brief](/Users/saharbarak/personal/akashik/docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:1), [bench plan](/Users/saharbarak/personal/akashik/docs/research/beat-the-competitors-retrieval-plan.md:1), [benchmarks](/Users/saharbarak/personal/akashik/docs/product/BENCHMARKS.md:287)). The upside is this is the only work that validates the Akashik thesis; the downside is you delay an easy marketing win and accept that per-peer retrieval will remain “good enough” rather than obviously best-in-class for another month.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:97:2. **Q2:** It is **not wholly novel**; the closest prior art is **Freenet** (“*Freenet: A Distributed Anonymous Information Storage and Retrieval System*,” 2001) with a secondary lineage to **CCNx/NDN** ([Freenet paper PDF](https://www.cs.princeton.edu/courses/archive/fall11/cos518/papers/freenet.pdf), [RFC 8569](https://www.rfc-editor.org/rfc/rfc8569)). The overlap is demand-driven retrieval plus replication/caching as a function of requests; the difference is that Akashik’s units are **signed semantic research objects with human provenance and web-on-miss curation**, not anonymous content blobs or network-layer content objects. Position it as: **“Freenet/CCNx semantics applied to attributed research memory”**; the advantage is a crisp technical lineage, however the tradeoff is you cannot overclaim novelty and should instead claim **novel composition**.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:99:3. **Q3:** Proposed benchmark: **AkashikBench-F**. Use `snap-research/locomo` ([repo](https://github.com/snap-research/locomo), arXiv `2402.17753`) plus LongMemEval-S (arXiv `2410.10813`) as source conversations, partition them across `N=32` simulated peers and `4-6` rooms with controlled topical overlap, replay `1,000-2,000` timestamped queries sequentially, and on miss let the querying peer obtain the gold evidence from a fixed “web oracle” corpus and cache it locally. Measure `federation_hit_rate`, `web_fallback_rate`, `coverage_growth(T,t)`, `T_half(T)` (time until half the peers can answer topic `T`), median/p95 answer latency, and quality deltas versus local-only; define **compounding** quantitatively as the negative slope of `web_fallback_rate` and positive slope of `coverage_growth` over repeated asks. This is runnable on commodity hardware in a week because it is a simulator over existing corpora, not a live distributed deployment; on the other hand, if you do not model peer churn and fact staleness, you will overstate the compounding effect.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:110:   **(a) Popularity cascade:** closest solved-by example is **Mastodon**; its instance-local timelines and moderation keep communities from collapsing into one global popularity order ([docs](https://docs-p.joinmastodon.org/), [network features](https://docs-p.joinmastodon.org/user/network/)). Akashik analogue: rank partly by scarcity/novelty across peers, not only frequency; the tradeoff is worse immediate relevance for the hottest topic.  
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:111:   **(b) Niche knowledge evaporation:** closest solved-by example is **LOCKSS**; low-demand content survives because preservation is policy-driven replication, not demand-only caching ([LOCKSS](https://www.lockss.org/)). Akashik analogue: add room-level pinning/replication quotas for rare high-value records; the tradeoff is storage overhead and moderation burden.  
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:112:   **(c) Adversarial misinformation flood:** closest solved-by example is **Wikipedia**; the mechanism is revision history, revertability, watchlists, protection levels, and citation norms. Akashik analogue: quarantine untrusted imports, signed provenance, per-room trust policies, and reversible moderation logs; however this raises governance cost and future SOC2-style audit requirements if you ever sell to teams.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:117:   3. **agentmemory**: closest current benchmark rival. Positioning: *agentmemory wins the single-player retrieval leaderboard; Akashik only matters if it turns that local memory quality into cross-peer transfer and lower web fallback* ([repo](https://github.com/JordanMcCann/agentmemory)).  
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:120:8. **Q8:** Strongest counter-argument: **“You are adding a flaky, mostly-offline federation hop in front of systems that already solve knowledge sharing better: Google, Stack Overflow, GitHub Discussions, Discord, Are.na, and repo docs. In practice, users will miss locally, peers will be offline, and Akashik will collapse into ‘web search plus personal cache,’ which is not a new network.”** The honest response is: that argument is strong unless you can show a dense room where `web_fallback_rate` materially drops over 30 days and Step 5 transfers happen with attribution faster than fresh web research. Local-first plus web-on-miss means the product is still useful on day 1; however the tradeoff is brutal: if the first room does not show measurable transfer under real churn, the federated-commons thesis is not yet proven and should not be pitched as proven.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:124:- **AkashikBench-F** with churn, disjoint corpora, and staleness controls.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:128:If I were Sahar, the next engineering month I’d spend on **AkashikBench-F plus a working multi-peer demo** because that is the shortest path to proving the compounding claim under real availability constraints. The next marketing/launch month I’d spend on **one dense OSS cluster launch around `llama.cpp`/`vLLM`/OpenTelemetry** because repeated questions in a bounded community are the fastest way to make transfer visible. Specifically NOT **the LME-S R@5 race** because it improves a benchmark headline while leaving the central product thesis unvalidated.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:138:workdir: /Users/saharbarak/personal/akashik
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:189:Akashik = federated knowledge commons for the OSS community.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:214:Q2 — Is the Akashik 'ambitioned-curator + curiosity-driven cache'
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:245:     existing systems that Akashik most directly competes with /
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:302:/bin/zsh -lc 'rg --files . | rg "(akashik|round|locomo|lme|agentmemory|federat|benchmark|retrieval|memory)"' in /Users/saharbarak/personal/akashik
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:334:/bin/zsh -lc 'rg -n "Round 4|Akashik|ambitioned-curator|LoCoMo|LME-S|agentmemory|federation-level|compounding" .' in /Users/saharbarak/personal/akashik
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:377:./docs/research/beat-the-competitors-retrieval-plan.md:89:If those land, **akashik becomes the published-leaderboard leader on LME-S** with a fully open-source, CPU-only, retrieval-only pipeline. No LLM judge, no GPT-4 reasoning loop, no closed-weight model — just a clean hybrid sparse+dense+rerank+graph pipeline that beats the proprietary stacks.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:379:./docs/research/beat-the-competitors-retrieval-plan.md:124:Once leaderboard-leading on retrieval, the next frontier is **hybrid retrieval + LLM extraction with SQuAD-F1 + LLM-judge as competing axes in the composite**. That makes akashik comparable to mem0's 92.5 LoCoMo composite — different scoring philosophy, head-to-head. Phase 23.8 already laid the SQuAD-F1 foundation; Phase 24 adds the judge axis.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:395:./docs/research/octopus-discover/round-4-2026-05-26/README.md:5:- The pivot from `akashik` (agent-memory product) to **Akashik**
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:398:./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:10:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:399:./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:26:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:401:./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:37:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:410:./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:149:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:413:./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:157:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:417:./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:172:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:418:./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:176:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:421:./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:197:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:424:./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:205:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:426:./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:220:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:427:./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:244:    why Akashik differs
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:430:./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:258:This synthesis combines a direct analysis of the local codebase with the mandatory systemic perspectives. The findings below are grounded strictly in the actual file contents, repository structure, and CI/CD configurations found in your workspace, directly applying them to your recent pivot to the **Akashik** federated knowledge commons.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:431:./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:280:**Relation to the Akashik Pivot:**
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:432:./docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:327:*   **Balanced Trade-off:** The advantage of your current setup is that developers feel safe sharing rooms because API keys are scrubbed. The disadvantage is that enterprise SOC2 Type II auditors will fail the system. An enterprise needs to prove *who asked what, and what specific data left the local machine*. Because Akashik peers autonomously federate queries via `ask --peers`, a SOC2 audit cannot easily prove that a specific piece of proprietary IP wasn't inadvertently synced to an unauthorized peer's local graph.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:433:./docs/marketing/storybrand-messaging-draft.md:1:# Akashik — brand messaging, StoryBrand 7-prompt pass
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:434:./docs/marketing/storybrand-messaging-draft.md:5:`SaharBarak/skills-and-workflows` repo) against Akashik's actual
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:435:./docs/marketing/storybrand-messaging-draft.md:8:**Brand name:** Akashik (formerly project codename `akashik`).
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:436:./docs/marketing/storybrand-messaging-draft.md:15:**Mission anchor (the only anchor that's correct):** Akashik is
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:437:./docs/marketing/storybrand-messaging-draft.md:17:as a whole**. Not a personal-memory product (mem0/agentmemory/
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:438:./docs/marketing/storybrand-messaging-draft.md:34:> Akashik is a peer-to-peer knowledge graph protocol for the
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:439:./docs/marketing/storybrand-messaging-draft.md:56:> your work matter beyond yourself; Akashik is the natural
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:440:./docs/marketing/storybrand-messaging-draft.md:115:   the community is curious about. See [how Akashik
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:441:./docs/marketing/storybrand-messaging-draft.md:137:> Akashik is the protocol the community has been missing: a
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:442:./docs/marketing/storybrand-messaging-draft.md:147:1. Run an Akashik peer.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:443:./docs/marketing/storybrand-messaging-draft.md:240:- New topic to dig into → query the Akashik, see what
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:444:./docs/marketing/storybrand-messaging-draft.md:256:> touched before. Akashik checks your local peer, then asks the
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:445:./docs/marketing/storybrand-messaging-draft.md:321:## Why "Akashik"
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:446:./docs/marketing/storybrand-messaging-draft.md:331:"Akashik" (stylised without the "c") gives us:
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:447:./docs/marketing/storybrand-messaging-draft.md:351:- **The Akashik. A federated record for the open-source community.**
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:448:./docs/marketing/storybrand-messaging-draft.md:352:- **Akashik — every contributor's reading, compounding into the community's progress.**
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:449:./docs/marketing/storybrand-messaging-draft.md:353:- **Akashik — open source's knowledge stack. P2P, signed, contributor-owned.**
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:450:./docs/marketing/storybrand-messaging-draft.md:354:- **Akashik — read the record the community already wrote.**
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:451:./docs/marketing/storybrand-messaging-draft.md:355:- **Akashik — each peer holds what it's asked for. Every query compounds the network.**
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:452:./docs/marketing/storybrand-messaging-draft.md:369:> When you ask Akashik something, it checks your peer first.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:453:./docs/marketing/storybrand-messaging-draft.md:390:name is **Akashik**. Two-name period is normal during a rebrand;
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:454:./docs/marketing/storybrand-messaging-draft.md:393:- Marketing materials, the website, social, and press: **Akashik**
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:455:./docs/marketing/storybrand-messaging-draft.md:402:| | Pass 1 — Personal | Pass 2 — Small teams | Pass 3 — OSS community (Akashik) |
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:456:./docs/marketing/storybrand-messaging-draft.md:406:| Real competitor | mem0, agentmemory, ByteRover | Slack, Notion, lock-in SaaS | **Nothing — the void in the OSS knowledge stack** |
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:457:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:12:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:458:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:28:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:460:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:39:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:469:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:151:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:472:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:159:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:476:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:174:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:477:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:178:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:480:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:199:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:483:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:207:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:485:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:222:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:486:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:246:    why Akashik differs
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:489:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:266:# FOURTH-ROUND ANALYSIS — Akashik / akashik
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:490:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:273:The stack is TypeScript / DDD with clean layer separation (`domain` → `application` → `infrastructure` → `cli`/`mcp`). Domain layer is pure: immutable graph values, `neverthrow` Result monads throughout, no I/O. Key domain types confirm what the prompt describes: `graph.ts` (immutable GraphNode/GraphEdge), `eval-metrics.ts` (pure `recallAtK`/`ndcgAtK`/`reciprocalRank`), `contextual-enrich.ts` (E11, pure, deterministic), `llm-listwise-rerank.ts` (ports-and-adapters for LLM, shuffle already shipped at commit 1f828b7), `sharing.ts` (SEC-03 boundary: no raw embeddings cross the wire), `oracle.ts` (P2P Q&A as pure graph-node data shape), `federated-search.ts` (Promise.all fan-out with 2000ms per-peer timeout, dedup prefers local). The architecture is sound for the Akashik mission. The retrieval plumbing is well-built. The open question is what to measure next.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:491:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:279:**The headline claim first:** continuing to push per-peer R@5 is a marketing question for the OLD product frame, not an engineering question for Akashik.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:493:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:283:More importantly: Akashik's product claim is not "our single-peer R@5 beats mem0." That was akashik's frame, and the pivot explicitly abandoned it. Akashik's claim is that the compounding loop produces network-level knowledge availability that grows monotonically. That claim cannot be validated by any per-peer retrieval benchmark. The engineering debt is not "push R@5 from 0.920 to 0.940." The engineering debt is "there is no benchmark for what we claim."
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:496:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:295:## Q2 — Is the Akashik mechanism novel or a known pattern?
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:497:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:301:| System | What it shares with Akashik | What's missing |
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:499:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:309:**What makes Akashik defensibly different:** The mechanism where (a) propagation is triggered by semantic query similarity not by push replication or key lookup, (b) DID-signed attribution is non-separable from the content node (it travels as a graph property, not as metadata that can be stripped), and (c) the satisfaction gate is a protocol-level decision (the `0.85 threshold` in VISION.md) not a UX heuristic — this combination exists nowhere in the prior art literature.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:500:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:311:The single most important citation to engage: **Freenet's monotonic availability proof.** Akashik's `R(T,t) = monotonically non-decreasing` is structurally the same claim. You should either cite and extend Freenet's proof to the semantic-search case, or derive your own. Without a formal proof or simulation backing it, "compounding is a property of the architecture, not a marketing claim" is still a marketing claim.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:502:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:319:**Proposed: AkashikBench-F (Federation Compounding Benchmark)**
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:506:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:357:- **Availability confounding.** Your current bench runs with all peers online. In production, the 2000ms timeout means some peers never respond. Your single-peer benchmarks (LME-S, LoCoMo) don't model this. AkashikBench-F should include a "partial availability" condition: what is federation R@k when 20% of peers are offline?
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:509:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:375:**The real risk:** publishing "akashik 0.9202 vs mem0 0.925" when the evaluation protocols differ is a credibility trap. The correct framing for Akashik launch is NOT R@5 comparison against single-user products. It's `web_fallback_rate` vs baseline (before federation) — a metric only Akashik can report.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:511:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:383:Reasons: small and high-trust (≈5,000 serious contributors globally), terminal-native (CLI fits), deep knowledge-sharing culture (This Week in Rust newsletter has 15k+ subscribers), and the community has a known pain — institutional memory evaporates when maintainers rotate. Akashik's compounding property is precisely the fix.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:512:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:389:Direct invite to maintainers of top-100 crates by download count. Message: "You already know things that took months to learn. Akashik keeps that knowledge alive for the next person, attributed to you." The attribution model matters here — unlike Confluence/Notion, contributions stay yours.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:513:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:392:Submit a This Week in Rust link. Not a blog post — a concrete demo: "Ask 'how do I handle backpressure in tokio::mpsc?' — watch Akashik answer from peer knowledge instead of web." The demo should show the `_source_peer` field (already in `FederatedMatch`) crediting the actual peer that contributed the answer.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:516:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:407:The known solution is **topic diversity indexing**, analogous to Mastodon's local vs. federated timeline split. Akashik's room structure partially mitigates this (niche rooms exist independently), but within a room, hot nodes will crowd out cold ones in search rankings.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:517:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:423:The asymmetry to be honest about: misinformation spreads faster than corrections in every P2P network studied. Akashik's DID attribution is the correct mitigation (you can identify and quarantine a bad actor's entire contribution graph) but the window between propagation and quarantine is real. Launch comms should acknowledge this explicitly rather than claiming "attribution solves misinformation."
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:518:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:433:This is the most important one. AT Protocol solved federated identity (DIDs), signed content, Personal Data Servers (each user owns their data), and protocol-level federation at scale (millions of users). Their architecture maps almost directly: PDS = Akashik peer, DID = Akashik contributor identity, lexicon record type = Akashik graph node type.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:519:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:437:**Practical question for the engineering month:** should Akashik use AT Protocol DIDs natively? The `identity-store.ts` and `github-oauth.ts` infrastructure suggests GitHub OAuth DIDs. Assess whether AT Protocol DID anchoring is feasible — if yes, Akashik inherits AT Protocol's identity ecosystem and becomes a knowledge-graph extension of the AT Protocol universe rather than a competing P2P identity system.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:520:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:441:Are.na is the closest product-level analogue. Curated cards, attributed to contributors, topic-organized, designed for thinkers/researchers/OSS community. Are.na is what Akashik would look like centralized. It has ~700k users and genuine community adoption among exactly Akashik's target demographic.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:521:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:443:The competitive differentiation is NOT features — Are.na is polished. The differentiation is: Are.na's knowledge belongs to Are.na's servers. Akashik's knowledge belongs to its contributors. That's a values-level difference that resonates with the OSS community specifically.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:522:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:447:Not a competitor in the traditional sense — Obsidian is a tool, Akashik is a protocol. But Obsidian's user base (technical writers, researchers, OSS developers who maintain public "digital gardens") is exactly Akashik's first-wave contributor pool. An Obsidian plugin that treats a published Obsidian vault as an Akashik peer would give Akashik instant distribution to Obsidian's 1M+ users without requiring them to change their workflow.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:524:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:457:> "This is a coordination problem in an infrastructure costume. Compounding is a property of participation density, not architecture. The mechanism only works when enough peers are online and have already pulled the relevant knowledge — which requires network effects you haven't earned yet. Every federated network (Mastodon, Matrix, Diaspora) has built technically correct architecture and then struggled for years to reach the critical mass where the federated property is actually better than the centralized alternative. Akashik's architectural insight about R(T,t) is correct but irrelevant until you have R(T, t) >> 0 for enough T, which is a community-building problem, not an engineering problem. The next engineering month could be zero effort and the project would succeed faster by spending that month on community seeding and distribution."
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:525:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:463:The cold-start problem is real for every network, but it conflates two distinct claims. The first claim — "federation is valuable once you have density" — is trivially true and grants the counter-argument. The second claim — "Akashik provides value before density" — is the actual product bet, and it's defensible: the web-fallback path means a contributor with zero peers still gets a functional local knowledge tool on day 1. Federation value is strictly additive. The counter-argument applies if Akashik required federation to work at all; it doesn't. However, the counter-argument correctly identifies the real risk: if the compounding claim is made at launch but can't be demonstrated (because the network is too sparse), early adopters experience a tool that feels like a slower version of their existing web search. The engineering month is not zero precisely because without `web_fallback_rate` instrumentation and AkashikBench-F, there is no number to show at launch that makes the compounding claim concrete rather than aspirational. The engineering constraint is measurement, not architecture.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:527:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:472:- **The identity pivot is architecturally correct.** The codebase already has all the infrastructure needed for the Akashik mission: federated search with dedup and attribution (`federated-search.ts`), peer reputation (`peer-reputation-store.ts`), oracle P2P Q&A (`oracle.ts`), DID identity (`identity-store.ts`), SEC-03 metadata boundary (`sharing.ts`). None of this needs to be built. What needs to be built is the measurement infrastructure for what the mission claims.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:528:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:476:1. **AkashikBench-F harness** — build the N-peer simulation bench described in Q3. This is what validates the mission claim. Without it, launch is vibes. With it, launch is a paper and a credible number.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:531:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:13:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:532:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:29:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:534:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:40:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:543:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:152:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:546:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:160:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:550:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:175:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:551:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:179:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:554:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:200:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:557:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:208:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:559:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:223:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:560:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:247:    why Akashik differs
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:563:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:270:- LoCoMo says something different: `R@30 = 0.993` but `R@3 = 0.392`, so there is still real per-peer ranking work. However, that is still single-peer optimization, while the Akashik claim is federation compounding.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:566:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:277:On the other hand, ignoring headline `R@5` entirely has a cost: buyers, contributors, and press will still compare Akashik to single-user memory systems. So keep a lightweight benchmark cadence, but stop letting LongMemEval-S drive roadmap priority.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:567:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:281:Akashik is **not novel in primitives**. It is **novel in composition**.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:568:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:292:- Akashik’s distinctive move is **curiosity-driven semantic replication**:
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:570:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:309:Proposed benchmark: **AkashikBench**
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:575:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:434:- Akashik likely needs:
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:578:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:475:> Akashik assumes that if you make knowledge portable, signed, and peer-owned, high-quality community memory will naturally emerge. But contributors do not reliably externalize their reasoning, most saved knowledge is noisy or stale, and signatures prove authorship rather than correctness. Without strong incentives and moderation, the system may become a fragmented cache of plausible junk whose compounding mostly amplifies popularity, not truth.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:579:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:479:That criticism is strong because it is partly correct. Akashik should not position itself as an automatic truth machine. The defensible claim is narrower: it can make repeated OSS learning more reusable, attributable, and locally owned than today’s mix of transient chat, scattered issues, and centralized note silos. To earn trust, launch should require provenance, expose source chains, measure compounding directly, cap curator dominance, preserve diversity, and make moderation/trust policies explicit. If Akashik does that, the project is not “knowledge solves itself”; it is “community learning leaves auditable traces and gets easier to reuse.”
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:580:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:502:If you do not build those first, you risk shipping a strong single-peer memory engine with a compelling story attached. If you do build them, Akashik becomes testably different.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:583:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:584:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:584:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:600:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:586:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:611:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:595:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:723:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:598:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:731:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:602:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:746:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:603:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:750:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:606:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:771:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:609:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:779:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:611:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:794:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:612:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:818:    why Akashik differs
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:617:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:899:- LoCoMo says something different: `R@30 = 0.993` but `R@3 = 0.392`, so there is still real per-peer ranking work. However, that is still single-peer optimization, while the Akashik claim is federation compounding.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:620:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:906:On the other hand, ignoring headline `R@5` entirely has a cost: buyers, contributors, and press will still compare Akashik to single-user memory systems. So keep a lightweight benchmark cadence, but stop letting LongMemEval-S drive roadmap priority.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:621:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:910:Akashik is **not novel in primitives**. It is **novel in composition**.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:622:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:921:- Akashik’s distinctive move is **curiosity-driven semantic replication**:
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:624:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:938:Proposed benchmark: **AkashikBench**
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:629:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1063:- Akashik likely needs:
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:632:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1104:> Akashik assumes that if you make knowledge portable, signed, and peer-owned, high-quality community memory will naturally emerge. But contributors do not reliably externalize their reasoning, most saved knowledge is noisy or stale, and signatures prove authorship rather than correctness. Without strong incentives and moderation, the system may become a fragmented cache of plausible junk whose compounding mostly amplifies popularity, not truth.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:633:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1108:That criticism is strong because it is partly correct. Akashik should not position itself as an automatic truth machine. The defensible claim is narrower: it can make repeated OSS learning more reusable, attributable, and locally owned than today’s mix of transient chat, scattered issues, and centralized note silos. To earn trust, launch should require provenance, expose source chains, measure compounding directly, cap curator dominance, preserve diversity, and make moderation/trust policies explicit. If Akashik does that, the project is not “knowledge solves itself”; it is “community learning leaves auditable traces and gets easier to reuse.”
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:634:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1131:If you do not build those first, you risk shipping a strong single-peer memory engine with a compelling story attached. If you do build them, Akashik becomes testably different.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:637:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:13:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:638:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:29:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:640:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:40:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:649:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:152:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:652:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:160:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:656:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:175:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:657:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:179:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:660:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:200:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:663:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:208:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:665:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:223:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:666:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:247:    why Akashik differs
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:671:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:271:*   **The Tradeoff/Disadvantage:** Every engineering hour spent squeezing 1pp out of LME-S is an hour stolen from the core Akashik mechanism. Furthermore, optimizing for LME-S ignores the actual engineering fire: the LoCoMo benchmark’s 60pp recall headroom where current rerankers are fundamentally failing.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:672:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:274:**Q2. Prior Art & Architectural Novelty of the Akashik Mechanism**
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:673:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:275:The Akashik mechanism (local + fan-out + web-on-miss + DID-signed save + transfer) is not entirely novel in its components, but its *composition* is unique.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:674:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:279:*   **How Akashik Differs (The Novelty):** Akashik replaces the "URL" with a "Semantic LLM context/solved task." It is a cooperative cache for *generative AI problem-solving*, signed cryptographically via W3C `did:key`. 
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:677:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:300:*   **(d) Competitor Baselines:** Comparing Akashik to `mem0` or `ByteRover` is structurally flawed. They are *global, centralized* state machines. Comparing a centralized graph's recall against a single peer's partitioned state is intellectually dishonest. 
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:680:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:326:*   **The Response:** "Akashik bypasses the traditional free-rider problem because *contribution requires zero friction*. In standard systems, users must stop working to write a forum post. In Akashik, the act of a user privately solving their own problem via an LLM web-miss automatically creates the signed artifact. The cost of serving that artifact to a peer is a negligible background SQLite vector lookup (~11ms). We don't need tokenomics because the byproduct of selfish utility is collective wealth."
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:681:./docs/README.md:25:- [`GRAPHRAG-AUDIT.md`](product/GRAPHRAG-AUDIT.md) — akashik audited against 2025/2026 GraphRAG state of the art (Microsoft GraphRAG, HippoRAG 2, LightRAG, MultiHop-RAG, LoCoMo).
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:682:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:13:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:683:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:29:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:685:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:40:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:694:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:152:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:697:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:160:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:701:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:175:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:702:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:179:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:705:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:200:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:708:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:208:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:710:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:223:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:711:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:247:    why Akashik differs
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:714:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:265:`LongMemEval-S` is telling you the headline number is near its ceiling: `R@50 = 1.0`, `R@5 = 0.9202`, `NDCG@5 = 0.8836`, so the remaining room is mostly intra-top-5 ordering, not missing evidence. That makes further gains partly a marketing question if the goal is leaderboard optics against `agentmemory`, not the highest-leverage engineering question. On the other hand, `LoCoMo` still shows a real ranking problem (`R@30 = 0.993` but `R@3 = 0.392`), so abandoning retrieval work entirely would be premature. The tradeoff is simple: spend maybe `10-20%` of the month on low-risk per-peer improvements like temporal gating, better segmentation, and stronger reranker evaluation; spend the other `80-90%` on federation architecture, compounding instrumentation, and launch-loop proof, because that is where Akashik is differentiated.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:715:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:274:What seems defensibly different about Akashik is **query-triggered semantic propagation**. SSB and Hypercore replicate logs/feeds/blocks; AT Proto distributes repos/posts; Akashik proposes that knowledge spreads because someone asked a semantically similar question, then another peer cached the answer locally and can later serve it onward. However, the downside is that this novelty currently lives more in the **retrieval-and-propagation policy** than in the storage primitive. So the strong claim is not “new protocol from first principles”; it is “new local-first knowledge propagation mechanism with explicit attribution and compounding behavior.”
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:716:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:277:A useful benchmark would be something like **`Akashik-CompBench`**:
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:722:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:367:- **Secure Scuttlebutt**: closest architectural ancestor. It is the best “you are not crazy; this family of ideas exists” reference. Akashik extends it with semantic retrieval and query-triggered transfer.  
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:723:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:376:**Response:** Akashik should not claim that every saved note becomes durable truth. The system works only if it compounds **attributed, evidence-backed, query-reused** knowledge. That is why the product must privilege provenance, room-scoped trust, replayable evidence, soft moderation labels, and visible transfer events over raw note volume. The point is not “everything anyone saves becomes the record”; it is “the subset of community work that repeatedly proves useful becomes easier to find, reuse, and attribute without requiring a central owner.”
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:725:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:451:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:726:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:467:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:728:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:478:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:737:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:590:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:740:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:598:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:744:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:613:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:745:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:617:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:748:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:638:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:751:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:646:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:753:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:661:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:754:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:685:    why Akashik differs
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:757:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:747:`LongMemEval-S` is telling you the headline number is near its ceiling: `R@50 = 1.0`, `R@5 = 0.9202`, `NDCG@5 = 0.8836`, so the remaining room is mostly intra-top-5 ordering, not missing evidence. That makes further gains partly a marketing question if the goal is leaderboard optics against `agentmemory`, not the highest-leverage engineering question. On the other hand, `LoCoMo` still shows a real ranking problem (`R@30 = 0.993` but `R@3 = 0.392`), so abandoning retrieval work entirely would be premature. The tradeoff is simple: spend maybe `10-20%` of the month on low-risk per-peer improvements like temporal gating, better segmentation, and stronger reranker evaluation; spend the other `80-90%` on federation architecture, compounding instrumentation, and launch-loop proof, because that is where Akashik is differentiated.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:758:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:756:What seems defensibly different about Akashik is **query-triggered semantic propagation**. SSB and Hypercore replicate logs/feeds/blocks; AT Proto distributes repos/posts; Akashik proposes that knowledge spreads because someone asked a semantically similar question, then another peer cached the answer locally and can later serve it onward. However, the downside is that this novelty currently lives more in the **retrieval-and-propagation policy** than in the storage primitive. So the strong claim is not “new protocol from first principles”; it is “new local-first knowledge propagation mechanism with explicit attribution and compounding behavior.”
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:759:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:759:A useful benchmark would be something like **`Akashik-CompBench`**:
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:765:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:849:- **Secure Scuttlebutt**: closest architectural ancestor. It is the best “you are not crazy; this family of ideas exists” reference. Akashik extends it with semantic retrieval and query-triggered transfer.  
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:766:./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:858:**Response:** Akashik should not claim that every saved note becomes durable truth. The system works only if it compounds **attributed, evidence-backed, query-reused** knowledge. That is why the product must privilege provenance, room-scoped trust, replayable evidence, soft moderation labels, and visible transfer events over raw note volume. The point is not “everything anyone saves becomes the record”; it is “the subset of community work that repeatedly proves useful becomes easier to find, reuse, and attribute without requiring a central owner.”
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:768:./docs/marketing/how-akashik-works.md:1:# How Akashik works
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:769:./docs/marketing/how-akashik-works.md:4:Akashik possible. Written for the reader who has heard "federated
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:770:./docs/marketing/how-akashik-works.md:14:Each Akashik peer holds **only its own information** — what its
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:771:./docs/marketing/how-akashik-works.md:17:federation couldn't satisfy a query. When you ask Akashik
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:772:./docs/marketing/how-akashik-works.md:42:       Query A's LOCAL Akashik graph
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:773:./docs/marketing/how-akashik-works.md:112:   the date, the source — not a faceless "Akashik says". Knowledge
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:775:./docs/marketing/how-akashik-works.md:156:**availability follows participation**. Akashik doesn't pretend
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:776:./docs/marketing/how-akashik-works.md:172:Akashik's **"each peer holds only what it has asked for or
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:782:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:13:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:783:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:29:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:785:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:40:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:794:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:152:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:797:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:160:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:801:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:175:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:802:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:179:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:805:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:200:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:808:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:208:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:810:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:223:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:811:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:247:    why Akashik differs
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:814:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:275:Here is the synthesis and strategic analysis of the Akashik pivot, addressing the empirical results, architectural mechanism, and open questions.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:819:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:289:*   **How Akashik Differs:** Freenet uses content-hash addressing for exact file retrieval; YaCy uses distributed inverted indexes for lexical search. Akashik uses **semantic vector space for probabilistic context retrieval**, and crucially, it uses the **LLM web-miss as the automated ingest motor**. Prior systems relied on humans manually uploading files or running broad, dumb web crawlers. Akashik is demand-driven by localized AI curiosity.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:821:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:308:*   **(d) Competitor Baselines:** **Category error.** Comparing Akashik to Mem0 or AgentMemory on single-user benchmarks is structurally flawed. They are centralized, isolated silos. Akashik’s advantage is the network effect. Beating them on zero-shot local retrieval is nice, but irrelevant to the compounding mission.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:823:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:315:    *   *Day 1-7:* Distribute Akashik to 20 maintainers/power users with pre-seeded graphs in room `local-llm-dev`.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:824:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:332:1.  **Stack Overflow / Stack Exchange (Centralized):** The dominant Q&A commons. Akashik supersedes it by removing the human bottleneck—automating the Q&A generation via the LLM web-miss and decentralizing the storage.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:825:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:333:2.  **Perplexity / Cursor (AI Search):** They provide instant answers via centralized compute. Akashik competes by providing instant answers via decentralized, zero-marginal-cost peer memory.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:826:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:334:3.  **Collaborator / Fork Target: Bluesky / AT Protocol.** The AT Protocol solved federated cryptographic identity (DIDs) and decentralized data repositories (PDS). Akashik is architecturally adjacent; it could theoretically run *on top of* the AT Protocol's data layer, swapping social microblogging for semantic vector storage.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:827:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:339:**The Response:** Akashik mitigates this through strict cryptographic provenance, explicit data aging, and conflict surfacing. Every node carries a `did:key` signature and a `fetched_at` timestamp, and system rooms automatically age out (7-30 days). More importantly, the protocol is designed to surface *conflicting evidence* rather than smoothing it over. If Peer A has a stale fix and Peer B has the new one, the agent receives an explicit "contract" highlighting the contradiction, forcing a live verification search rather than a blind skip. 
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:828:./docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:348:We have proven that the local retrieval engine works well enough (75.22% NDCG). We have proven the plumbing (libp2p, CRDTs). The existential threat to the Akashik mission is now **epistemic pollution**. If we do not ship the Web-of-Trust reputation metrics, explicit stale-node invalidation, and the conflict-surfacing agent contract, the network will drown in its own stale hallucinations within 60 days of launch. Build the immune system.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:829:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:12:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:830:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:28:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:832:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:39:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:841:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:151:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:844:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:159:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:848:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:174:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:849:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:178:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:852:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:199:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:855:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:207:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:857:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:222:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:858:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:246:    why Akashik differs
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:862:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:288:**The marketing argument for pushing R@5 further:** mining the last 2-3pp toward agentmemory's 0.952 is only meaningful if Akashik is competing on the single-peer agent-memory leaderboard. Post-pivot, it isn't. The Akashik mission claim is "federated compounding," not "best per-peer retrieval." Chasing 0.95 LME-S R@5 is answering the wrong question.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:864:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:298:## Q2 — Is the Akashik mechanism architecturally novel?
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:866:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:304:**2. Freenet (Clarke et al., First Monday 2001)** — P2P content routing where requests propagate through intermediaries and each routing node caches content it routes. The curiosity-as-propagation mechanism is structurally identical to Akashik's Step 4-5. The key differences: (a) Freenet is deliberately anonymous — attribution is the opposite of the design goal; (b) content-addressed by hash, not semantically searchable; (c) designed for censorship resistance, not knowledge compounding.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:867:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:306:**3. Semantic Overlay Networks (Löser et al., CIDR 2003; Crespo & Garcia-Molina, VLDB 2002)** — early research systems for P2P semantic search. Demonstrated that routing by semantic similarity (instead of hash-based DHT) enables topic-aware peer selection. Akashik's federation fan-out + RRF merge is implementing this pattern. What the 2003 systems lacked: DID-signed attribution, graph-traversable provenance, satisfaction scoring, local-first storage.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:870:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:312:**What makes Akashik defensibly different:**
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:871:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:314:- **Semantic retrieval as the federation primitive**: All prior P2P knowledge systems route by topic declaration (EDUTELLA), content hash (IPFS, Freenet), or social graph (Nostr/Fediverse). Akashik routes by semantic similarity of the query to each peer's local graph.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:872:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:315:- **Signed human attribution in the compounding loop**: The "ambitioned curator" model with ed25519/DID provenance is genuinely novel. IPFS has content-addressed identity (verifies content, not author). EDUTELLA has no attribution. Freenet is explicitly anti-attribution. Akashik makes human authorship a first-class compounding signal.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:873:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:318:**The honest limitation of novelty claim**: The 2003-2008 Semantic Overlay Network literature is extensive, partially forgotten, and pre-dates the modern embedding stack. Akashik is implementing a 20-year-old architectural insight with 2024 tools. The novelty is in the execution (vector embeddings, DID attribution, satisfaction scoring), not the topology.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:877:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:355:2. Akashik federation: the above metrics
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:890:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:455:**Akashik mitigation**: The `find_tunnels` MCP tool already discovers cross-domain connections. A `akashik room gaps` command — showing topics that have queries but no cached answers, or topics that haven't been updated in >30 days — would surface the cold-topic coverage map to curators. The peer-reputation system's "topic coverage gaps" output (mentioned in its design doc) is exactly this. Implement it as a visible CLI output, not just an internal metric.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:891:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:459:**This is the CAP theorem for decentralized knowledge:** You can have consistency (one canonical answer) or availability (always online) but not both without full replication — and Akashik explicitly avoids full replication.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:892:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:464:- IPFS pinning services: third parties voluntarily host content. Akashik equivalent: an "Akashik Archive" peer run by the project that caches anything marked `community-critical` by the original curator.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:893:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:465:- DHT replication factor: Kademlia stores k=20 copies. Akashik's opt-in "popular-in-room caching" (mentioned in the mechanism doc) is the right analog. Make it opt-in-by-default for rooms tagged `oss-commons`, not just general rooms.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:895:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:482:**What Akashik has:** The peer-reputation system measures "did this peer's answers feel relevant." **It does not measure "was this peer's answer correct."** A well-crafted wrong answer that is topically relevant will score high on satisfaction.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:896:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:484:**The structural gap:** There is no factual verification layer. Akashik compounds *attribution*, not *truth*. The community must evaluate correctness themselves — just like Wikipedia's edit history shows who changed what but not whether the change was accurate.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:898:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:496:**Why it's the real competitor:** IPFS implements the same curiosity-as-propagation caching mechanism at the infrastructure layer. Helia (the TypeScript IPFS implementation) runs in Node.js, the same runtime as Akashik. Protocol Labs has 100+ engineers and $250M+ in funding. If they add a semantic knowledge graph layer on top of Helia, they have Akashik's architecture with a much larger existing network (400K+ public nodes).
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:899:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:498:**What Akashik does better:** Semantic retrieval (BEIR 75.22% NDCG@10 is real, measured), DID-based human attribution (IPFS attribution is content hash, not author), satisfaction scoring, knowledge graph with tunnel detection, curiosity-driven working set (IPFS pinning is deliberate, not curiosity-driven).
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:900:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:500:**Threat level: Medium-High.** IPFS is infrastructure; Akashik is an application. But Protocol Labs has a history of building application layers (Filecoin, IPLD, Ceramic/ComposeDB). ComposeDB (Ceramic, 2022–present) is especially relevant — it's a decentralized graph database with DID-based identity. Akashik should watch ComposeDB closely.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:901:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:504:**Why it's the real competitor:** Logseq is the tool of choice for the exact user Akashik targets: OSS contributors who maintain personal knowledge graphs. It has 30K+ GitHub stars, active community, a plugin ecosystem, and is working on a database edition with improved sync and (eventually) multiplayer features. Logseq's user base is OSS contributors and researchers.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:902:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:506:**What Akashik does better:** Federation across organizations (Logseq sync is same-user multi-device or explicit sharing; Akashik federates across organizational boundaries), semantic retrieval quality (measured BEIR numbers), compounding by curiosity (not deliberate sync), DID-signed attribution.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:903:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:508:**The key difference:** Logseq is "your notes, synced with you across devices." Akashik is "your research, shared with the community when queried." These sound similar but are fundamentally different trust models. Logseq's sync is a replication protocol; Akashik's federation is a query protocol.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:904:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:510:**Threat level: High.** Logseq's community is Akashik's target community. If Logseq ships P2P semantic search (even a basic version) in the next 12 months, Akashik's TAM shrinks significantly. The mitigation: be in the Logseq community now, before they build this.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:905:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:514:**Why it's the real competitor:** The AT Protocol is the most mature open-source implementation of the three things Akashik's architecture depends on: DIDs (they use `did:plc` and `did:web`), federated content (Personal Data Servers + relay aggregation), and semantic labeling systems. The AT Protocol is already deployed at scale (6M+ accounts), has an active developer ecosystem, and is building "labelers" (essentially federated reputation) and "starter packs" (essentially curated rooms).
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:906:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:516:**What Akashik does better:** Semantic retrieval (AT Protocol has no vector search), curiosity-driven compounding (AT Protocol's replication is push-based, not pull-on-query), knowledge graph with tunnels, local-first storage (AT PDS must be always-on hosted server; Akashik runs on your laptop).
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:907:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:518:**Strategic option:** Build Akashik as an AT Protocol lexicon (a schema that defines knowledge nodes) and a labeler (a service that provides reputation signals). This would give Akashik access to the AT Protocol's existing federation infrastructure without competing with it. The Bluesky community already has many OSS contributors.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:908:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:520:**Threat level: Existential long-term.** AT Protocol has BlueSky's funding, a deployed network, and is actively expanding its application layer. If they add semantic knowledge retrieval, Akashik's protocol advantage disappears. This is the "build on them or race them" decision.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:909:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:528:"Akashik solves a distribution problem that doesn't exist by introducing a reliability problem that does exist. OSS contributors already have working mechanisms for sharing knowledge — Stack Overflow has 60M+ answered questions, GitHub Discussions is indexed by Google, Discord communities provide real-time context, blog posts compound indefinitely via SEO. These mechanisms are persistent (always-on servers), searchable (Google-indexed), moderated (community voting), and have 15-20 years of network effects. Akashik's 'network before web' architecture means you query peers who might be offline before reaching Stack Overflow, which is always online. The compounding property (R(T,t) monotonically non-decreasing) only holds when peers are online — but contributors are offline most of the time, especially on laptops during work hours. For the median OSS contributor (active a few hours per week on a laptop that's off when they sleep), Akashik's federation would degrade to 'fall through to the web' on 95% of queries, which is exactly what happens today — just slower, because you waited for the federation timeout first. You've added latency without removing the web dependency."
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:910:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:532:The counter-argument is correct about Stack Overflow — as a competitor for *published* knowledge. Where it misidentifies the use case: Akashik is designed for the 80% of engineering knowledge that *never gets published*. The debugging session you spent 4 hours on that you couldn't write up. The architectural decision you made in 2023 and would like to remember in 2024. The library evaluation you ran before choosing your ORM. The PR review comment that explained why the abstraction was wrong. None of that compounded into Stack Overflow's index — it evaporated when the Slack message disappeared or the terminal session closed. When a new contributor joins a project and asks "why did we use SQLite instead of Postgres?", that answer is in someone's head or in a Slack message from 2 years ago — not on Stack Overflow. Akashik is designed for that knowledge: private, in-progress, context-rich, never published — and the availability concern (offline peers) is real and documented honestly, but for a tool that runs as a daemon on a developer's machine and stores only what *that developer has asked about*, the latency added by federation fan-out is 50-200ms to peers, which is faster than a Google search and cheaper than a Stack Overflow question that gets ignored.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:911:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:595:The Akashik pitch is OSS commons, not B2B. But the first enterprise customer (a company wanting to run Akashik as an internal knowledge layer for their engineering team) will send a security questionnaire. The architecture needs answers for:
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:915:./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:626:- LME-S R@5 race toward 0.952 (wrong mission frame; Akashik doesn't compete on single-peer leaderboards post-pivot)
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:925:./docs/product/BENCHMARKS.md:239:| **akashik** (Hetzner, Phase 23.7 real public corpora) | unified composite | **0.8597** | real BEIR SciFact + LongMemEval-S oracle + LoCoMo factual; synthetic in 5 of 9 dimensions |
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:935:/bin/zsh -lc "sed -n '1,240p' docs/research/octopus-discover/round-4-2026-05-26/synthesis.md" in /Users/saharbarak/personal/akashik
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:945:The project pivoted from "akashik: agent-memory product" to
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:946:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:956:called "akashik" internally.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:962:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:973:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1085:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1093:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1108:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1112:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1133:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1141:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1156:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1179:/bin/zsh -lc "sed -n '1,240p' docs/research/octopus-discover/round-4-2026-05-26/README.md" in /Users/saharbarak/personal/akashik
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1185:- The pivot from `akashik` (agent-memory product) to **Akashik**
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1241:/bin/zsh -lc "sed -n '1,260p' docs/research/beat-the-competitors-retrieval-plan.md" in /Users/saharbarak/personal/akashik
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1243:# How akashik beats the retrieval leaderboard (forward plan)
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1248:| Benchmark | akashik | Competitor best | Gap |
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1331:If those land, **akashik becomes the published-leaderboard leader on LME-S** with a fully open-source, CPU-only, retrieval-only pipeline. No LLM judge, no GPT-4 reasoning loop, no closed-weight model — just a clean hybrid sparse+dense+rerank+graph pipeline that beats the proprietary stacks.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1366:Once leaderboard-leading on retrieval, the next frontier is **hybrid retrieval + LLM extraction with SQuAD-F1 + LLM-judge as competing axes in the composite**. That makes akashik comparable to mem0's 92.5 LoCoMo composite — different scoring philosophy, head-to-head. Phase 23.8 already laid the SQuAD-F1 foundation; Phase 24 adds the judge axis.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1368:Beyond that: **federated retrieval** (the unique akashik bet) — measure how P2P-shared rooms across multiple peers lift recall on out-of-distribution questions, vs single-peer baselines. No public benchmark covers this today; we'd publish one.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1429:- **Bus factor on `akashik-rs`** — Rust ARM cross-compile is specialized knowledge; consider TypeScript-only fallback path.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1432:Source: `~/.claude-octopus/results/probe-synthesis-1779351019.md` — 6 multi-LLM probes synthesized by Gemini-2.5-Pro, 2026-05-21. Full transcript preserved in claude-octopus state.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1435:/bin/zsh -lc "sed -n '1,240p' docs/marketing/how-akashik-works.md" in /Users/saharbarak/personal/akashik
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1437:# How Akashik works
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1440:Akashik possible. Written for the reader who has heard "federated
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1446:copy lives in [`storybrand-messaging-draft.md`](./storybrand-messaging-draft.md).
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1450:Each Akashik peer holds **only its own information** — what its
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1453:federation couldn't satisfy a query. When you ask Akashik
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1478:       Query A's LOCAL Akashik graph
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1548:   the date, the source — not a faceless "Akashik says". Knowledge
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1592:**availability follows participation**. Akashik doesn't pretend
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1608:Akashik's **"each peer holds only what it has asked for or
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1671:- [`storybrand-messaging-draft.md`](./storybrand-messaging-draft.md) — Brand messaging that this mechanism credibility-anchors.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1688:/bin/zsh -lc "sed -n '620,760p' docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md" in /Users/saharbarak/personal/akashik
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1696:- LME-S R@5 race toward 0.952 (wrong mission frame; Akashik doesn't compete on single-peer leaderboards post-pivot)
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1711:/bin/zsh -lc 'rg -n "Q1|Q2|Q3|Q4|Q5|Q6|Q7|Q8|closest prior art|benchmark|launch plan|competitor|counter-argument|counter argument|novel|federation|compounding" docs/research/octopus-discover/round-4-2026-05-26/probes/*.md' in /Users/saharbarak/personal/akashik
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1719:docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:160:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1722:docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:175:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1731:docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:200:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1735:docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:208:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1753:docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:271:*   **The Tradeoff/Disadvantage:** Every engineering hour spent squeezing 1pp out of LME-S is an hour stolen from the core Akashik mechanism. Furthermore, optimizing for LME-S ignores the actual engineering fire: the LoCoMo benchmark’s 60pp recall headroom where current rerankers are fundamentally failing.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1755:docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:274:**Q2. Prior Art & Architectural Novelty of the Akashik Mechanism**
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1756:docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-1.md:275:The Akashik mechanism (local + fan-out + web-on-miss + DID-signed save + transfer) is not entirely novel in its components, but its *composition* is unique.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1777:docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:160:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1780:docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:175:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1789:docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:200:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1793:docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:208:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1816:docs/research/octopus-discover/round-4-2026-05-26/probes/gemini-4.md:308:*   **(d) Competitor Baselines:** **Category error.** Comparing Akashik to Mem0 or AgentMemory on single-user benchmarks is structurally flawed. They are centralized, isolated silos. Akashik’s advantage is the network effect. Beating them on zero-shot local retrieval is nice, but irrelevant to the compounding mission.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1833:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:160:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1836:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:175:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1845:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:200:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1849:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:208:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1864:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:265:`LongMemEval-S` is telling you the headline number is near its ceiling: `R@50 = 1.0`, `R@5 = 0.9202`, `NDCG@5 = 0.8836`, so the remaining room is mostly intra-top-5 ordering, not missing evidence. That makes further gains partly a marketing question if the goal is leaderboard optics against `agentmemory`, not the highest-leverage engineering question. On the other hand, `LoCoMo` still shows a real ranking problem (`R@30 = 0.993` but `R@3 = 0.392`), so abandoning retrieval work entirely would be premature. The tradeoff is simple: spend maybe `10-20%` of the month on low-risk per-peer improvements like temporal gating, better segmentation, and stronger reranker evaluation; spend the other `80-90%` on federation architecture, compounding instrumentation, and launch-loop proof, because that is where Akashik is differentiated.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1866:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:274:What seems defensibly different about Akashik is **query-triggered semantic propagation**. SSB and Hypercore replicate logs/feeds/blocks; AT Proto distributes repos/posts; Akashik proposes that knowledge spreads because someone asked a semantically similar question, then another peer cached the answer locally and can later serve it onward. However, the downside is that this novelty currently lives more in the **retrieval-and-propagation policy** than in the storage primitive. So the strong claim is not “new protocol from first principles”; it is “new local-first knowledge propagation mechanism with explicit attribution and compounding behavior.”
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1868:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:277:A useful benchmark would be something like **`Akashik-CompBench`**:
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1894:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:598:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1897:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:613:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1906:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:638:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1910:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:646:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1926:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:747:`LongMemEval-S` is telling you the headline number is near its ceiling: `R@50 = 1.0`, `R@5 = 0.9202`, `NDCG@5 = 0.8836`, so the remaining room is mostly intra-top-5 ordering, not missing evidence. That makes further gains partly a marketing question if the goal is leaderboard optics against `agentmemory`, not the highest-leverage engineering question. On the other hand, `LoCoMo` still shows a real ranking problem (`R@30 = 0.993` but `R@3 = 0.392`), so abandoning retrieval work entirely would be premature. The tradeoff is simple: spend maybe `10-20%` of the month on low-risk per-peer improvements like temporal gating, better segmentation, and stronger reranker evaluation; spend the other `80-90%` on federation architecture, compounding instrumentation, and launch-loop proof, because that is where Akashik is differentiated.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1928:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:756:What seems defensibly different about Akashik is **query-triggered semantic propagation**. SSB and Hypercore replicate logs/feeds/blocks; AT Proto distributes repos/posts; Akashik proposes that knowledge spreads because someone asked a semantically similar question, then another peer cached the answer locally and can later serve it onward. However, the downside is that this novelty currently lives more in the **retrieval-and-propagation policy** than in the storage primitive. So the strong claim is not “new protocol from first principles”; it is “new local-first knowledge propagation mechanism with explicit attribution and compounding behavior.”
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1930:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:759:A useful benchmark would be something like **`Akashik-CompBench`**:
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1955:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:160:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1958:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:175:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1967:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:200:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1971:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:208:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1987:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:270:- LoCoMo says something different: `R@30 = 0.993` but `R@3 = 0.392`, so there is still real per-peer ranking work. However, that is still single-peer optimization, while the Akashik claim is federation compounding.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1990:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:277:On the other hand, ignoring headline `R@5` entirely has a cost: buyers, contributors, and press will still compare Akashik to single-user memory systems. So keep a lightweight benchmark cadence, but stop letting LongMemEval-S drive roadmap priority.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1992:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:281:Akashik is **not novel in primitives**. It is **novel in composition**.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:1998:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:309:Proposed benchmark: **AkashikBench**
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2023:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:475:> Akashik assumes that if you make knowledge portable, signed, and peer-owned, high-quality community memory will naturally emerge. But contributors do not reliably externalize their reasoning, most saved knowledge is noisy or stale, and signatures prove authorship rather than correctness. Without strong incentives and moderation, the system may become a fragmented cache of plausible junk whose compounding mostly amplifies popularity, not truth.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2024:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:479:That criticism is strong because it is partly correct. Akashik should not position itself as an automatic truth machine. The defensible claim is narrower: it can make repeated OSS learning more reusable, attributable, and locally owned than today’s mix of transient chat, scattered issues, and centralized note silos. To earn trust, launch should require provenance, expose source chains, measure compounding directly, cap curator dominance, preserve diversity, and make moderation/trust policies explicit. If Akashik does that, the project is not “knowledge solves itself”; it is “community learning leaves auditable traces and gets easier to reuse.”
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2036:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:731:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2039:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:746:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2048:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:771:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2052:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:779:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2069:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:899:- LoCoMo says something different: `R@30 = 0.993` but `R@3 = 0.392`, so there is still real per-peer ranking work. However, that is still single-peer optimization, while the Akashik claim is federation compounding.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2072:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:906:On the other hand, ignoring headline `R@5` entirely has a cost: buyers, contributors, and press will still compare Akashik to single-user memory systems. So keep a lightweight benchmark cadence, but stop letting LongMemEval-S drive roadmap priority.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2074:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:910:Akashik is **not novel in primitives**. It is **novel in composition**.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2080:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:938:Proposed benchmark: **AkashikBench**
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2105:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1104:> Akashik assumes that if you make knowledge portable, signed, and peer-owned, high-quality community memory will naturally emerge. But contributors do not reliably externalize their reasoning, most saved knowledge is noisy or stale, and signatures prove authorship rather than correctness. Without strong incentives and moderation, the system may become a fragmented cache of plausible junk whose compounding mostly amplifies popularity, not truth.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2106:docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1108:That criticism is strong because it is partly correct. Akashik should not position itself as an automatic truth machine. The defensible claim is narrower: it can make repeated OSS learning more reusable, attributable, and locally owned than today’s mix of transient chat, scattered issues, and centralized note silos. To earn trust, launch should require provenance, expose source chains, measure compounding directly, cap curator dominance, preserve diversity, and make moderation/trust policies explicit. If Akashik does that, the project is not “knowledge solves itself”; it is “community learning leaves auditable traces and gets easier to reuse.”
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2117:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:159:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2120:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:174:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2129:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:199:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2133:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:207:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2149:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:288:**The marketing argument for pushing R@5 further:** mining the last 2-3pp toward agentmemory's 0.952 is only meaningful if Akashik is competing on the single-peer agent-memory leaderboard. Post-pivot, it isn't. The Akashik mission claim is "federated compounding," not "best per-peer retrieval." Chasing 0.95 LME-S R@5 is answering the wrong question.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2153:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:298:## Q2 — Is the Akashik mechanism architecturally novel?
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2155:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:304:**2. Freenet (Clarke et al., First Monday 2001)** — P2P content routing where requests propagate through intermediaries and each routing node caches content it routes. The curiosity-as-propagation mechanism is structurally identical to Akashik's Step 4-5. The key differences: (a) Freenet is deliberately anonymous — attribution is the opposite of the design goal; (b) content-addressed by hash, not semantically searchable; (c) designed for censorship resistance, not knowledge compounding.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2156:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:306:**3. Semantic Overlay Networks (Löser et al., CIDR 2003; Crespo & Garcia-Molina, VLDB 2002)** — early research systems for P2P semantic search. Demonstrated that routing by semantic similarity (instead of hash-based DHT) enables topic-aware peer selection. Akashik's federation fan-out + RRF merge is implementing this pattern. What the 2003 systems lacked: DID-signed attribution, graph-traversable provenance, satisfaction scoring, local-first storage.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2159:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:314:- **Semantic retrieval as the federation primitive**: All prior P2P knowledge systems route by topic declaration (EDUTELLA), content hash (IPFS, Freenet), or social graph (Nostr/Fediverse). Akashik routes by semantic similarity of the query to each peer's local graph.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2160:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:315:- **Signed human attribution in the compounding loop**: The "ambitioned curator" model with ed25519/DID provenance is genuinely novel. IPFS has content-addressed identity (verifies content, not author). EDUTELLA has no attribution. Freenet is explicitly anti-attribution. Akashik makes human authorship a first-class compounding signal.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2161:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:318:**The honest limitation of novelty claim**: The 2003-2008 Semantic Overlay Network literature is extensive, partially forgotten, and pre-dates the modern embedding stack. Akashik is implementing a 20-year-old architectural insight with 2024 tools. The novelty is in the execution (vector embeddings, DID attribution, satisfaction scoring), not the topology.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2166:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:355:2. Akashik federation: the above metrics
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2168:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:360:**Concrete implementation:** A `akashik bench federation` CLI command running a Docker Compose network of 4 peers, injecting queries from the hot/cold corpus, and emitting an FCB report. Est. engineering effort: 2-3 weeks.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2184:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:496:**Why it's the real competitor:** IPFS implements the same curiosity-as-propagation caching mechanism at the infrastructure layer. Helia (the TypeScript IPFS implementation) runs in Node.js, the same runtime as Akashik. Protocol Labs has 100+ engineers and $250M+ in funding. If they add a semantic knowledge graph layer on top of Helia, they have Akashik's architecture with a much larger existing network (400K+ public nodes).
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2185:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:504:**Why it's the real competitor:** Logseq is the tool of choice for the exact user Akashik targets: OSS contributors who maintain personal knowledge graphs. It has 30K+ GitHub stars, active community, a plugin ecosystem, and is working on a database edition with improved sync and (eventually) multiplayer features. Logseq's user base is OSS contributors and researchers.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2186:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:506:**What Akashik does better:** Federation across organizations (Logseq sync is same-user multi-device or explicit sharing; Akashik federates across organizational boundaries), semantic retrieval quality (measured BEIR numbers), compounding by curiosity (not deliberate sync), DID-signed attribution.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2187:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:508:**The key difference:** Logseq is "your notes, synced with you across devices." Akashik is "your research, shared with the community when queried." These sound similar but are fundamentally different trust models. Logseq's sync is a replication protocol; Akashik's federation is a query protocol.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2188:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:514:**Why it's the real competitor:** The AT Protocol is the most mature open-source implementation of the three things Akashik's architecture depends on: DIDs (they use `did:plc` and `did:web`), federated content (Personal Data Servers + relay aggregation), and semantic labeling systems. The AT Protocol is already deployed at scale (6M+ accounts), has an active developer ecosystem, and is building "labelers" (essentially federated reputation) and "starter packs" (essentially curated rooms).
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2189:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:516:**What Akashik does better:** Semantic retrieval (AT Protocol has no vector search), curiosity-driven compounding (AT Protocol's replication is push-based, not pull-on-query), knowledge graph with tunnels, local-first storage (AT PDS must be always-on hosted server; Akashik runs on your laptop).
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2190:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:518:**Strategic option:** Build Akashik as an AT Protocol lexicon (a schema that defines knowledge nodes) and a labeler (a service that provides reputation signals). This would give Akashik access to the AT Protocol's existing federation infrastructure without competing with it. The Bluesky community already has many OSS contributors.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2193:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:528:"Akashik solves a distribution problem that doesn't exist by introducing a reliability problem that does exist. OSS contributors already have working mechanisms for sharing knowledge — Stack Overflow has 60M+ answered questions, GitHub Discussions is indexed by Google, Discord communities provide real-time context, blog posts compound indefinitely via SEO. These mechanisms are persistent (always-on servers), searchable (Google-indexed), moderated (community voting), and have 15-20 years of network effects. Akashik's 'network before web' architecture means you query peers who might be offline before reaching Stack Overflow, which is always online. The compounding property (R(T,t) monotonically non-decreasing) only holds when peers are online — but contributors are offline most of the time, especially on laptops during work hours. For the median OSS contributor (active a few hours per week on a laptop that's off when they sleep), Akashik's federation would degrade to 'fall through to the web' on 95% of queries, which is exactly what happens today — just slower, because you waited for the federation timeout first. You've added latency without removing the web dependency."
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2194:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:532:The counter-argument is correct about Stack Overflow — as a competitor for *published* knowledge. Where it misidentifies the use case: Akashik is designed for the 80% of engineering knowledge that *never gets published*. The debugging session you spent 4 hours on that you couldn't write up. The architectural decision you made in 2023 and would like to remember in 2024. The library evaluation you ran before choosing your ORM. The PR review comment that explained why the abstraction was wrong. None of that compounded into Stack Overflow's index — it evaporated when the Slack message disappeared or the terminal session closed. When a new contributor joins a project and asks "why did we use SQLite instead of Postgres?", that answer is in someone's head or in a Slack message from 2 years ago — not on Stack Overflow. Akashik is designed for that knowledge: private, in-progress, context-rich, never published — and the availability concern (offline peers) is real and documented honestly, but for a tool that runs as a daemon on a developer's machine and stores only what *that developer has asked about*, the latency added by federation fan-out is 50-200ms to peers, which is faster than a Google search and cheaper than a Stack Overflow question that gets ignored.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2209:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:159:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2212:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:174:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2221:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:199:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2225:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:207:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2240:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:283:More importantly: Akashik's product claim is not "our single-peer R@5 beats mem0." That was akashik's frame, and the pivot explicitly abandoned it. Akashik's claim is that the compounding loop produces network-level knowledge availability that grows monotonically. That claim cannot be validated by any per-peer retrieval benchmark. The engineering debt is not "push R@5 from 0.920 to 0.940." The engineering debt is "there is no benchmark for what we claim."
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2243:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:295:## Q2 — Is the Akashik mechanism novel or a known pattern?
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2246:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:311:The single most important citation to engage: **Freenet's monotonic availability proof.** Akashik's `R(T,t) = monotonically non-decreasing` is structurally the same claim. You should either cite and extend Freenet's proof to the semantic-search case, or derive your own. Without a formal proof or simulation backing it, "compounding is a property of the architecture, not a marketing claim" is still a marketing claim.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2255:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:357:- **Availability confounding.** Your current bench runs with all peers online. In production, the 2000ms timeout means some peers never respond. Your single-peer benchmarks (LME-S, LoCoMo) don't model this. AkashikBench-F should include a "partial availability" condition: what is federation R@k when 20% of peers are offline?
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2259:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:375:**The real risk:** publishing "akashik 0.9202 vs mem0 0.925" when the evaluation protocols differ is a credibility trap. The correct framing for Akashik launch is NOT R@5 comparison against single-user products. It's `web_fallback_rate` vs baseline (before federation) — a metric only Akashik can report.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2261:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:383:Reasons: small and high-trust (≈5,000 serious contributors globally), terminal-native (CLI fits), deep knowledge-sharing culture (This Week in Rust newsletter has 15k+ subscribers), and the community has a known pain — institutional memory evaporates when maintainers rotate. Akashik's compounding property is precisely the fix.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2268:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:433:This is the most important one. AT Protocol solved federated identity (DIDs), signed content, Personal Data Servers (each user owns their data), and protocol-level federation at scale (millions of users). Their architecture maps almost directly: PDS = Akashik peer, DID = Akashik contributor identity, lexicon record type = Akashik graph node type.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2270:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:447:Not a competitor in the traditional sense — Obsidian is a tool, Akashik is a protocol. But Obsidian's user base (technical writers, researchers, OSS developers who maintain public "digital gardens") is exactly Akashik's first-wave contributor pool. An Obsidian plugin that treats a published Obsidian vault as an Akashik peer would give Akashik instant distribution to Obsidian's 1M+ users without requiring them to change their workflow.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2274:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:463:The cold-start problem is real for every network, but it conflates two distinct claims. The first claim — "federation is valuable once you have density" — is trivially true and grants the counter-argument. The second claim — "Akashik provides value before density" — is the actual product bet, and it's defensible: the web-fallback path means a contributor with zero peers still gets a functional local knowledge tool on day 1. Federation value is strictly additive. The counter-argument applies if Akashik required federation to work at all; it doesn't. However, the counter-argument correctly identifies the real risk: if the compounding claim is made at launch but can't be demonstrated (because the network is too sparse), early adopters experience a tool that feels like a slower version of their existing web search. The engineering month is not zero precisely because without `web_fallback_rate` instrumentation and AkashikBench-F, there is no number to show at launch that makes the compounding claim concrete rather than aspirational. The engineering constraint is measurement, not architecture.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2276:docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-5.md:476:1. **AkashikBench-F harness** — build the N-peer simulation bench described in Q3. This is what validates the mission claim. Without it, launch is vibes. With it, launch is a paper and a credible number.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2279:/bin/zsh -lc "sed -n '1,260p' findings.md" in /Users/saharbarak/personal/akashik
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2283:This synthesis evaluates 2024-2026 retrieval techniques against the strict constraints of the `akashik` pipeline (CPU-only, ARM Hetzner CAX11 4GB, TypeScript + transformers.js + sqlite-vec), specifically targeting the 10-13pp loss in multi-session and temporal-reasoning questions on LongMemEval-S.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2352:1. **Q1:** Spend the next engineering month on **federation architecture and measurement**, not on squeezing LME-S `R@5` from `0.9202` toward `agentmemory`’s claimed `0.952`. Your own numbers show the single-peer head is already near-saturated on LongMemEval-S (`R@50 = 1.0000`, `NDCG@5 = 0.8836`, `MRR = 0.9034`) while the product claim lives or dies on Step 5 transfer, not on another 1-3 leaderboard points ([Round 4 brief](/Users/saharbarak/personal/akashik/docs/research/octopus-discover/round-4-2026-05-26/synthesis.md:1), [bench plan](/Users/saharbarak/personal/akashik/docs/research/beat-the-competitors-retrieval-plan.md:1), [benchmarks](/Users/saharbarak/personal/akashik/docs/product/BENCHMARKS.md:287)). The upside is this is the only work that validates the Akashik thesis; the downside is you delay an easy marketing win and accept that per-peer retrieval will remain “good enough” rather than obviously best-in-class for another month.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2354:2. **Q2:** It is **not wholly novel**; the closest prior art is **Freenet** (“*Freenet: A Distributed Anonymous Information Storage and Retrieval System*,” 2001) with a secondary lineage to **CCNx/NDN** ([Freenet paper PDF](https://www.cs.princeton.edu/courses/archive/fall11/cos518/papers/freenet.pdf), [RFC 8569](https://www.rfc-editor.org/rfc/rfc8569)). The overlap is demand-driven retrieval plus replication/caching as a function of requests; the difference is that Akashik’s units are **signed semantic research objects with human provenance and web-on-miss curation**, not anonymous content blobs or network-layer content objects. Position it as: **“Freenet/CCNx semantics applied to attributed research memory”**; the advantage is a crisp technical lineage, however the tradeoff is you cannot overclaim novelty and should instead claim **novel composition**.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2356:3. **Q3:** Proposed benchmark: **AkashikBench-F**. Use `snap-research/locomo` ([repo](https://github.com/snap-research/locomo), arXiv `2402.17753`) plus LongMemEval-S (arXiv `2410.10813`) as source conversations, partition them across `N=32` simulated peers and `4-6` rooms with controlled topical overlap, replay `1,000-2,000` timestamped queries sequentially, and on miss let the querying peer obtain the gold evidence from a fixed “web oracle” corpus and cache it locally. Measure `federation_hit_rate`, `web_fallback_rate`, `coverage_growth(T,t)`, `T_half(T)` (time until half the peers can answer topic `T`), median/p95 answer latency, and quality deltas versus local-only; define **compounding** quantitatively as the negative slope of `web_fallback_rate` and positive slope of `coverage_growth` over repeated asks. This is runnable on commodity hardware in a week because it is a simulator over existing corpora, not a live distributed deployment; on the other hand, if you do not model peer churn and fact staleness, you will overstate the compounding effect.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2367:   **(a) Popularity cascade:** closest solved-by example is **Mastodon**; its instance-local timelines and moderation keep communities from collapsing into one global popularity order ([docs](https://docs-p.joinmastodon.org/), [network features](https://docs-p.joinmastodon.org/user/network/)). Akashik analogue: rank partly by scarcity/novelty across peers, not only frequency; the tradeoff is worse immediate relevance for the hottest topic.  
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2368:   **(b) Niche knowledge evaporation:** closest solved-by example is **LOCKSS**; low-demand content survives because preservation is policy-driven replication, not demand-only caching ([LOCKSS](https://www.lockss.org/)). Akashik analogue: add room-level pinning/replication quotas for rare high-value records; the tradeoff is storage overhead and moderation burden.  
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2369:   **(c) Adversarial misinformation flood:** closest solved-by example is **Wikipedia**; the mechanism is revision history, revertability, watchlists, protection levels, and citation norms. Akashik analogue: quarantine untrusted imports, signed provenance, per-room trust policies, and reversible moderation logs; however this raises governance cost and future SOC2-style audit requirements if you ever sell to teams.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2374:   3. **agentmemory**: closest current benchmark rival. Positioning: *agentmemory wins the single-player retrieval leaderboard; Akashik only matters if it turns that local memory quality into cross-peer transfer and lower web fallback* ([repo](https://github.com/JordanMcCann/agentmemory)).  
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2377:8. **Q8:** Strongest counter-argument: **“You are adding a flaky, mostly-offline federation hop in front of systems that already solve knowledge sharing better: Google, Stack Overflow, GitHub Discussions, Discord, Are.na, and repo docs. In practice, users will miss locally, peers will be offline, and Akashik will collapse into ‘web search plus personal cache,’ which is not a new network.”** The honest response is: that argument is strong unless you can show a dense room where `web_fallback_rate` materially drops over 30 days and Step 5 transfers happen with attribution faster than fresh web research. Local-first plus web-on-miss means the product is still useful on day 1; however the tradeoff is brutal: if the first room does not show measurable transfer under real churn, the federated-commons thesis is not yet proven and should not be pitched as proven.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2381:- **AkashikBench-F** with churn, disjoint corpora, and staleness controls.
./docs/research/octopus-discover/round-5-2026-05-26/probes/codex-3.md:2385:If I were Sahar, the next engineering month I’d spend on **AkashikBench-F plus a working multi-peer demo** because that is the shortest path to proving the compounding claim under real availability constraints. The next marketing/launch month I’d spend on **one dense OSS cluster launch around `llama.cpp`/`vLLM`/OpenTelemetry** because repeated questions in a bounded community are the fastest way to make transfer visible. Specifically NOT **the LME-S R@5 race** because it improves a benchmark headline while leaving the central product thesis unvalidated.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:12:The project pivoted from "akashik: agent-memory product" to
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:13:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:23:called "akashik" internally.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:29:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:40:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:152:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:160:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:175:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:179:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:200:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:208:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:223:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:247:    why Akashik differs
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:265:`LongMemEval-S` is telling you the headline number is near its ceiling: `R@50 = 1.0`, `R@5 = 0.9202`, `NDCG@5 = 0.8836`, so the remaining room is mostly intra-top-5 ordering, not missing evidence. That makes further gains partly a marketing question if the goal is leaderboard optics against `agentmemory`, not the highest-leverage engineering question. On the other hand, `LoCoMo` still shows a real ranking problem (`R@30 = 0.993` but `R@3 = 0.392`), so abandoning retrieval work entirely would be premature. The tradeoff is simple: spend maybe `10-20%` of the month on low-risk per-peer improvements like temporal gating, better segmentation, and stronger reranker evaluation; spend the other `80-90%` on federation architecture, compounding instrumentation, and launch-loop proof, because that is where Akashik is differentiated.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:274:What seems defensibly different about Akashik is **query-triggered semantic propagation**. SSB and Hypercore replicate logs/feeds/blocks; AT Proto distributes repos/posts; Akashik proposes that knowledge spreads because someone asked a semantically similar question, then another peer cached the answer locally and can later serve it onward. However, the downside is that this novelty currently lives more in the **retrieval-and-propagation policy** than in the storage primitive. So the strong claim is not “new protocol from first principles”; it is “new local-first knowledge propagation mechanism with explicit attribution and compounding behavior.”
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:277:A useful benchmark would be something like **`Akashik-CompBench`**:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:367:- **Secure Scuttlebutt**: closest architectural ancestor. It is the best “you are not crazy; this family of ideas exists” reference. Akashik extends it with semantic retrieval and query-triggered transfer.  
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:376:**Response:** Akashik should not claim that every saved note becomes durable truth. The system works only if it compounds **attributed, evidence-backed, query-reused** knowledge. That is why the product must privilege provenance, room-scoped trust, replayable evidence, soft moderation labels, and visible transfer events over raw note volume. The point is not “everything anyone saves becomes the record”; it is “the subset of community work that repeatedly proves useful becomes easier to find, reuse, and attribute without requiring a central owner.”
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:399:workdir: /Users/saharbarak/personal/akashik
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:450:The project pivoted from "akashik: agent-memory product" to
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:451:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:461:called "akashik" internally.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:467:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:478:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:590:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:598:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:613:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:617:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:638:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:646:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:661:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:685:    why Akashik differs
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:747:`LongMemEval-S` is telling you the headline number is near its ceiling: `R@50 = 1.0`, `R@5 = 0.9202`, `NDCG@5 = 0.8836`, so the remaining room is mostly intra-top-5 ordering, not missing evidence. That makes further gains partly a marketing question if the goal is leaderboard optics against `agentmemory`, not the highest-leverage engineering question. On the other hand, `LoCoMo` still shows a real ranking problem (`R@30 = 0.993` but `R@3 = 0.392`), so abandoning retrieval work entirely would be premature. The tradeoff is simple: spend maybe `10-20%` of the month on low-risk per-peer improvements like temporal gating, better segmentation, and stronger reranker evaluation; spend the other `80-90%` on federation architecture, compounding instrumentation, and launch-loop proof, because that is where Akashik is differentiated.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:756:What seems defensibly different about Akashik is **query-triggered semantic propagation**. SSB and Hypercore replicate logs/feeds/blocks; AT Proto distributes repos/posts; Akashik proposes that knowledge spreads because someone asked a semantically similar question, then another peer cached the answer locally and can later serve it onward. However, the downside is that this novelty currently lives more in the **retrieval-and-propagation policy** than in the storage primitive. So the strong claim is not “new protocol from first principles”; it is “new local-first knowledge propagation mechanism with explicit attribution and compounding behavior.”
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:759:A useful benchmark would be something like **`Akashik-CompBench`**:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:849:- **Secure Scuttlebutt**: closest architectural ancestor. It is the best “you are not crazy; this family of ideas exists” reference. Akashik extends it with semantic retrieval and query-triggered transfer.  
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-0.md:858:**Response:** Akashik should not claim that every saved note becomes durable truth. The system works only if it compounds **attributed, evidence-backed, query-reused** knowledge. That is why the product must privilege provenance, room-scoped trust, replayable evidence, soft moderation labels, and visible transfer events over raw note volume. The point is not “everything anyone saves becomes the record”; it is “the subset of community work that repeatedly proves useful becomes easier to find, reuse, and attribute without requiring a central owner.”
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:12:The project pivoted from "akashik: agent-memory product" to
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:13:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:23:called "akashik" internally.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:29:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:40:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:152:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:160:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:175:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:179:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:200:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:208:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:223:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:247:    why Akashik differs
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:270:- LoCoMo says something different: `R@30 = 0.993` but `R@3 = 0.392`, so there is still real per-peer ranking work. However, that is still single-peer optimization, while the Akashik claim is federation compounding.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:277:On the other hand, ignoring headline `R@5` entirely has a cost: buyers, contributors, and press will still compare Akashik to single-user memory systems. So keep a lightweight benchmark cadence, but stop letting LongMemEval-S drive roadmap priority.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:281:Akashik is **not novel in primitives**. It is **novel in composition**.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:292:- Akashik’s distinctive move is **curiosity-driven semantic replication**:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:309:Proposed benchmark: **AkashikBench**
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:434:- Akashik likely needs:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:475:> Akashik assumes that if you make knowledge portable, signed, and peer-owned, high-quality community memory will naturally emerge. But contributors do not reliably externalize their reasoning, most saved knowledge is noisy or stale, and signatures prove authorship rather than correctness. Without strong incentives and moderation, the system may become a fragmented cache of plausible junk whose compounding mostly amplifies popularity, not truth.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:479:That criticism is strong because it is partly correct. Akashik should not position itself as an automatic truth machine. The defensible claim is narrower: it can make repeated OSS learning more reusable, attributable, and locally owned than today’s mix of transient chat, scattered issues, and centralized note silos. To earn trust, launch should require provenance, expose source chains, measure compounding directly, cap curator dominance, preserve diversity, and make moderation/trust policies explicit. If Akashik does that, the project is not “knowledge solves itself”; it is “community learning leaves auditable traces and gets easier to reuse.”
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:502:If you do not build those first, you risk shipping a strong single-peer memory engine with a compelling story attached. If you do build them, Akashik becomes testably different.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:532:workdir: /Users/saharbarak/personal/akashik
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:583:The project pivoted from "akashik: agent-memory product" to
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:584:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:594:called "akashik" internally.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:600:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:611:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:723:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:731:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:746:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:750:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:771:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:779:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:794:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:818:    why Akashik differs
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:899:- LoCoMo says something different: `R@30 = 0.993` but `R@3 = 0.392`, so there is still real per-peer ranking work. However, that is still single-peer optimization, while the Akashik claim is federation compounding.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:906:On the other hand, ignoring headline `R@5` entirely has a cost: buyers, contributors, and press will still compare Akashik to single-user memory systems. So keep a lightweight benchmark cadence, but stop letting LongMemEval-S drive roadmap priority.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:910:Akashik is **not novel in primitives**. It is **novel in composition**.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:921:- Akashik’s distinctive move is **curiosity-driven semantic replication**:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:938:Proposed benchmark: **AkashikBench**
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1063:- Akashik likely needs:
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1104:> Akashik assumes that if you make knowledge portable, signed, and peer-owned, high-quality community memory will naturally emerge. But contributors do not reliably externalize their reasoning, most saved knowledge is noisy or stale, and signatures prove authorship rather than correctness. Without strong incentives and moderation, the system may become a fragmented cache of plausible junk whose compounding mostly amplifies popularity, not truth.
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1108:That criticism is strong because it is partly correct. Akashik should not position itself as an automatic truth machine. The defensible claim is narrower: it can make repeated OSS learning more reusable, attributable, and locally owned than today’s mix of transient chat, scattered issues, and centralized note silos. To earn trust, launch should require provenance, expose source chains, measure compounding directly, cap curator dominance, preserve diversity, and make moderation/trust policies explicit. If Akashik does that, the project is not “knowledge solves itself”; it is “community learning leaves auditable traces and gets easier to reuse.”
./docs/research/octopus-discover/round-4-2026-05-26/probes/codex-3.md:1131:If you do not build those first, you risk shipping a strong single-peer memory engine with a compelling story attached. If you do build them, Akashik becomes testably different.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:11:The project pivoted from "akashik: agent-memory product" to
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:12:"Akashik: federated knowledge commons for the open-source community as a whole."
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:22:called "akashik" internally.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:28:Each Akashik peer holds only its own information:
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:39:  STEP 1: Local-first query → A's local Akashik graph
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:151:   Brand renamed to Akashik. New StoryBrand-anchored marketing
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:159:3. The Akashik mechanism (5-step compounding loop, peer-local
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:174:Q2. The Akashik mechanism (peer-local + federation-on-query + web-
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:178:    research/protocol/system, and what makes Akashik different in
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:199:Q5. The Akashik mission requires the network to actually grow.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:207:Q6. The Akashik architecture relies on user curiosity as the
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:222:    Akashik competes with / extends / supersedes? Be specific
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:246:    why Akashik differs
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:288:**The marketing argument for pushing R@5 further:** mining the last 2-3pp toward agentmemory's 0.952 is only meaningful if Akashik is competing on the single-peer agent-memory leaderboard. Post-pivot, it isn't. The Akashik mission claim is "federated compounding," not "best per-peer retrieval." Chasing 0.95 LME-S R@5 is answering the wrong question.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:298:## Q2 — Is the Akashik mechanism architecturally novel?
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:304:**2. Freenet (Clarke et al., First Monday 2001)** — P2P content routing where requests propagate through intermediaries and each routing node caches content it routes. The curiosity-as-propagation mechanism is structurally identical to Akashik's Step 4-5. The key differences: (a) Freenet is deliberately anonymous — attribution is the opposite of the design goal; (b) content-addressed by hash, not semantically searchable; (c) designed for censorship resistance, not knowledge compounding.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:306:**3. Semantic Overlay Networks (Löser et al., CIDR 2003; Crespo & Garcia-Molina, VLDB 2002)** — early research systems for P2P semantic search. Demonstrated that routing by semantic similarity (instead of hash-based DHT) enables topic-aware peer selection. Akashik's federation fan-out + RRF merge is implementing this pattern. What the 2003 systems lacked: DID-signed attribution, graph-traversable provenance, satisfaction scoring, local-first storage.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:312:**What makes Akashik defensibly different:**
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:314:- **Semantic retrieval as the federation primitive**: All prior P2P knowledge systems route by topic declaration (EDUTELLA), content hash (IPFS, Freenet), or social graph (Nostr/Fediverse). Akashik routes by semantic similarity of the query to each peer's local graph.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:315:- **Signed human attribution in the compounding loop**: The "ambitioned curator" model with ed25519/DID provenance is genuinely novel. IPFS has content-addressed identity (verifies content, not author). EDUTELLA has no attribution. Freenet is explicitly anti-attribution. Akashik makes human authorship a first-class compounding signal.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:318:**The honest limitation of novelty claim**: The 2003-2008 Semantic Overlay Network literature is extensive, partially forgotten, and pre-dates the modern embedding stack. Akashik is implementing a 20-year-old architectural insight with 2024 tools. The novelty is in the execution (vector embeddings, DID attribution, satisfaction scoring), not the topology.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:355:2. Akashik federation: the above metrics
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:360:**Concrete implementation:** A `akashik bench federation` CLI command running a Docker Compose network of 4 peers, injecting queries from the hot/cold corpus, and emitting an FCB report. Est. engineering effort: 2-3 weeks.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:418:*What they commit to*: Index one active project (`akashik index <repo>`), join `oss-commons` room, run their peer for at least 4 hours/day for 30 days.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:436:1. `akashik peer add` via a lightweight coordinator server (not just mDNS — mDNS doesn't cross routers)
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:437:2. `akashik ask` shows "[answered by: @username, 4 days ago]" in the output
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:438:3. A `akashik network status` command showing R(T,t) for the top 10 topics in the room
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:440:**What will kill the launch:** If the coordinator server requires Docker or a domain name to self-host, only 10 people will run peers. The "default open" mode must be `akashik peer join oss-commons.akashik.dev` — one command, no setup.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:455:**Akashik mitigation**: The `find_tunnels` MCP tool already discovers cross-domain connections. A `akashik room gaps` command — showing topics that have queries but no cached answers, or topics that haven't been updated in >30 days — would surface the cold-topic coverage map to curators. The peer-reputation system's "topic coverage gaps" output (mentioned in its design doc) is exactly this. Implement it as a visible CLI output, not just an internal metric.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:459:**This is the CAP theorem for decentralized knowledge:** You can have consistency (one canonical answer) or availability (always online) but not both without full replication — and Akashik explicitly avoids full replication.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:464:- IPFS pinning services: third parties voluntarily host content. Akashik equivalent: an "Akashik Archive" peer run by the project that caches anything marked `community-critical` by the original curator.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:465:- DHT replication factor: Kademlia stores k=20 copies. Akashik's opt-in "popular-in-room caching" (mentioned in the mechanism doc) is the right analog. Make it opt-in-by-default for rooms tagged `oss-commons`, not just general rooms.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:482:**What Akashik has:** The peer-reputation system measures "did this peer's answers feel relevant." **It does not measure "was this peer's answer correct."** A well-crafted wrong answer that is topically relevant will score high on satisfaction.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:484:**The structural gap:** There is no factual verification layer. Akashik compounds *attribution*, not *truth*. The community must evaluate correctness themselves — just like Wikipedia's edit history shows who changed what but not whether the change was accurate.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:486:**What to add:** (a) Community flagging — `akashik flag <node_id> --reason misinformation` sends a signed attestation to the room that the node is disputed. (b) Dispute visibility — when a node has flags, display them in search results: "[flagged as disputed by 3 peers]." (c) Reputation decay on flagged nodes — peer-reputation score decays when the peer's nodes accumulate flags. This doesn't verify truth, but it creates a social accountability layer.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:496:**Why it's the real competitor:** IPFS implements the same curiosity-as-propagation caching mechanism at the infrastructure layer. Helia (the TypeScript IPFS implementation) runs in Node.js, the same runtime as Akashik. Protocol Labs has 100+ engineers and $250M+ in funding. If they add a semantic knowledge graph layer on top of Helia, they have Akashik's architecture with a much larger existing network (400K+ public nodes).
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:498:**What Akashik does better:** Semantic retrieval (BEIR 75.22% NDCG@10 is real, measured), DID-based human attribution (IPFS attribution is content hash, not author), satisfaction scoring, knowledge graph with tunnel detection, curiosity-driven working set (IPFS pinning is deliberate, not curiosity-driven).
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:500:**Threat level: Medium-High.** IPFS is infrastructure; Akashik is an application. But Protocol Labs has a history of building application layers (Filecoin, IPLD, Ceramic/ComposeDB). ComposeDB (Ceramic, 2022–present) is especially relevant — it's a decentralized graph database with DID-based identity. Akashik should watch ComposeDB closely.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:504:**Why it's the real competitor:** Logseq is the tool of choice for the exact user Akashik targets: OSS contributors who maintain personal knowledge graphs. It has 30K+ GitHub stars, active community, a plugin ecosystem, and is working on a database edition with improved sync and (eventually) multiplayer features. Logseq's user base is OSS contributors and researchers.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:506:**What Akashik does better:** Federation across organizations (Logseq sync is same-user multi-device or explicit sharing; Akashik federates across organizational boundaries), semantic retrieval quality (measured BEIR numbers), compounding by curiosity (not deliberate sync), DID-signed attribution.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:508:**The key difference:** Logseq is "your notes, synced with you across devices." Akashik is "your research, shared with the community when queried." These sound similar but are fundamentally different trust models. Logseq's sync is a replication protocol; Akashik's federation is a query protocol.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:510:**Threat level: High.** Logseq's community is Akashik's target community. If Logseq ships P2P semantic search (even a basic version) in the next 12 months, Akashik's TAM shrinks significantly. The mitigation: be in the Logseq community now, before they build this.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:514:**Why it's the real competitor:** The AT Protocol is the most mature open-source implementation of the three things Akashik's architecture depends on: DIDs (they use `did:plc` and `did:web`), federated content (Personal Data Servers + relay aggregation), and semantic labeling systems. The AT Protocol is already deployed at scale (6M+ accounts), has an active developer ecosystem, and is building "labelers" (essentially federated reputation) and "starter packs" (essentially curated rooms).
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:516:**What Akashik does better:** Semantic retrieval (AT Protocol has no vector search), curiosity-driven compounding (AT Protocol's replication is push-based, not pull-on-query), knowledge graph with tunnels, local-first storage (AT PDS must be always-on hosted server; Akashik runs on your laptop).
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:518:**Strategic option:** Build Akashik as an AT Protocol lexicon (a schema that defines knowledge nodes) and a labeler (a service that provides reputation signals). This would give Akashik access to the AT Protocol's existing federation infrastructure without competing with it. The Bluesky community already has many OSS contributors.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:520:**Threat level: Existential long-term.** AT Protocol has BlueSky's funding, a deployed network, and is actively expanding its application layer. If they add semantic knowledge retrieval, Akashik's protocol advantage disappears. This is the "build on them or race them" decision.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:528:"Akashik solves a distribution problem that doesn't exist by introducing a reliability problem that does exist. OSS contributors already have working mechanisms for sharing knowledge — Stack Overflow has 60M+ answered questions, GitHub Discussions is indexed by Google, Discord communities provide real-time context, blog posts compound indefinitely via SEO. These mechanisms are persistent (always-on servers), searchable (Google-indexed), moderated (community voting), and have 15-20 years of network effects. Akashik's 'network before web' architecture means you query peers who might be offline before reaching Stack Overflow, which is always online. The compounding property (R(T,t) monotonically non-decreasing) only holds when peers are online — but contributors are offline most of the time, especially on laptops during work hours. For the median OSS contributor (active a few hours per week on a laptop that's off when they sleep), Akashik's federation would degrade to 'fall through to the web' on 95% of queries, which is exactly what happens today — just slower, because you waited for the federation timeout first. You've added latency without removing the web dependency."
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:532:The counter-argument is correct about Stack Overflow — as a competitor for *published* knowledge. Where it misidentifies the use case: Akashik is designed for the 80% of engineering knowledge that *never gets published*. The debugging session you spent 4 hours on that you couldn't write up. The architectural decision you made in 2023 and would like to remember in 2024. The library evaluation you ran before choosing your ORM. The PR review comment that explained why the abstraction was wrong. None of that compounded into Stack Overflow's index — it evaporated when the Slack message disappeared or the terminal session closed. When a new contributor joins a project and asks "why did we use SQLite instead of Postgres?", that answer is in someone's head or in a Slack message from 2 years ago — not on Stack Overflow. Akashik is designed for that knowledge: private, in-progress, context-rich, never published — and the availability concern (offline peers) is real and documented honestly, but for a tool that runs as a daemon on a developer's machine and stores only what *that developer has asked about*, the latency added by federation fan-out is 50-200ms to peers, which is faster than a Google search and cheaper than a Stack Overflow question that gets ignored.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:542:`akashik-rs` runs as a separate process communicating over a socket. That IPC channel is currently unprotected — any local process on the same machine that discovers the socket address can submit arbitrary embeddings to the embed_server, inject poisoned vectors into the local graph, or exfiltrate the embedding space.
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:595:The Akashik pitch is OSS commons, not B2B. But the first enterprise customer (a company wanting to run Akashik as an internal knowledge layer for their engineering team) will send a security questionnaire. The architecture needs answers for:
./docs/research/octopus-discover/round-4-2026-05-26/probes/claude-sonnet-2.md:626:- LME-S R@5 race toward 0.952 (wrong mission frame; Akashik doesn't compete on single-peer leaderboards post-pivot)

codex
I have enough structure to make decisions. I’m reading the few pivot-sensitive artifacts now: benchmark narrative, competitor plan, and the old backup/readme clutter that affects archive-vs-delete calls.
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
/bin/zsh -lc "sed -n '1,160p' NEXT_STEPS.md" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
# akashik Next Steps

This is the execution README for getting akashik closer to SOTA as a
local-first agent memory system.

The target is not BEIR leaderboard SOTA. The repo already documents that
choice in `docs/ADR-002-v4-agent-brain.md`: retrieval quality is measured, but
the stronger product claim is an agent brain that is fast, federated,
cryptographically portable, and useful before an agent burns time on repeat
research.

## North Star

akashik should make this demo feel inevitable:

1. Peer A researches or fixes something current.
2. Peer B asks Claude/Codex a related task.
3. akashik retrieves the trusted peer memory before web search.
4. The agent sees source age, room, peer attribution, and provenance.
5. The answer is faster, cheaper, and better than local-only context.

Everything below should serve that loop.

## Priority 1: Make Federated Search Match Local Search

Local search uses hybrid dense + BM25 retrieval. Remote peer search currently
receives only an embedding, so peers can only run vector search.

Relevant files:

- `src/application/federated-search.ts`
- `src/infrastructure/search-sync.ts`
- `src/infrastructure/vector-index.ts`
- `tests/phase17.federated-search.test.ts`

Work:

- Add an optional `query_text` field to the federated search request.
- Gate raw query sharing by config or room policy.
- When `query_text` is present, remote peers should call `searchByRoomHybrid`
  or hybrid search across shared rooms.
- Preserve the embedding-only path for privacy-sensitive rooms.
- Add tests proving local-only hybrid and federated remote hybrid return the
  same class of results on BM25-sensitive queries.

Acceptance gate:

- Federated search no longer silently downgrades remote peers to dense-only
  when the room policy allows query text.

## Priority 2: Fix Room-Filtered Dense Retrieval

`searchByRoom` performs global vector search, then filters by room. This can
miss good in-room results when other rooms dominate the global nearest
neighbors.

Relevant files:

- `src/infrastructure/vector-index.ts`
- `src/domain/vectors.ts`
- `tests/phase4.rooms.test.ts`
- `tests/vector-index-binary.test.ts`

Work:

- Add a true room-restricted dense retrieval path.
- Prefer per-room vector partitions or a query shape that constrains by room
  before ranking.
- Keep binary and fp32 behavior aligned.
- Add a regression test where global top-k is dominated by another room but
  room search still returns the correct in-room hit.

Acceptance gate:

- Room search recall is independent of global overfetch luck.

## Priority 3: Ship The Native Rust CLI Path

The Rust IPC client exists, but install/package flow still centers the Node
shim. If warm hits are part of the product claim, the native path should be a
first-class shipped artifact.

Relevant files:

- `akashik-rs/src/bin/akashik_cli.rs`
- `bin/akashik.js`
- `package.json`
- `scripts/bootstrap.sh`
- `docs/V4-PROTOCOL.md`
- `docs/RELEASE-v4.md`

Work:

- Build the Rust CLI during bootstrap when Rust is available.
- Package or document the binary path clearly.
- Make command dispatch choose native IPC for delegatable commands.
- Keep the Node fallback intact.
- Add a benchmark command that reports cold, warm, daemon-hit, and fallback
  latencies.

Acceptance gate:

- A fresh user can run the native fast path without reading implementation
  notes.

## Priority 4: Wire Semantic L2 Cache Into The Daemon

The semantic cache primitive exists, but paraphrased agent queries still miss
if only exact query caching is active.

Relevant files:

- `src/domain/semantic-cache.ts`
- `src/domain/query-cache.ts`
- `src/daemon/ipc-handlers.ts`
- `src/daemon/ipc.ts`
- `src/cli/commands/cache-stats.ts`

Work:

- Embed incoming `ask` queries in the daemon.
- Check semantic cache after exact cache miss and before retrieval.
- Store successful results with query vectors.
- Clear or version caches on graph writes.
- Expose L1/L2 hit rates in cache stats.

Acceptance gate:

- Similar paraphrases within the TTL hit cache without stale graph results.

## Priority 5: Make Consolidation Ambient And Safe

Consolidation is central to long-running agent memory, but the current path is
still operator-driven or requires explicit room config.

Relevant files:

- `src/application/consolidator.ts`
- `src/cli/commands/consolidate.ts`
- `src/daemon/consolidate-tick.ts`
- `src/infrastructure/config-loader.ts`
- `scripts/bench-consolidation.mjs`

Work:

- Auto-discover eligible rooms when `daemon.consolidate.rooms` is empty.
- Run a pre/post retrieval-quality gate for consolidated rooms.
- Keep NDJSON backup on by default before prune.
- Record consolidation outcome per room, not only per tick.
- Surface status in CLI and daemon logs.

Acceptance gate:

- Users can enable auto-consolidation without hand-listing rooms and without
  losing retrieval quality silently.

## Priority 6: Add Product-Shaped Evals

BEIR is useful but incomplete for this product. The important eval is whether
akashik changes agent behavior.

exec
/bin/zsh -lc "sed -n '1,120p' README.md.bak.830lines" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
<p align="center">
  <img src="docs/logo.png" alt="akashik" width="400" />
</p>

<p align="center">
  <a href="https://github.com/SaharBarak/akashik/stargazers"><img src="https://img.shields.io/github/stars/SaharBarak/akashik?style=social" alt="Stars" /></a>&nbsp;
  <a href="https://github.com/SaharBarak/akashik/network/members"><img src="https://img.shields.io/github/forks/SaharBarak/akashik?style=social" alt="Forks" /></a>&nbsp;
  <a href="https://github.com/SaharBarak/akashik/watchers"><img src="https://img.shields.io/github/watchers/SaharBarak/akashik?style=social" alt="Watchers" /></a>
</p>

<h1 align="center">The globally accumulating knowledge network.<br/>For AI agents &mdash; and humans.</h1>

<p align="center">
  <img src="demo/scene-claude.gif" alt="Side-by-side: Claude alone (~14 s, hedged) vs Claude + akashik (~1.5 s, cited)" width="880" />
</p>

<p align="center">
  <em>Same model. Same prompt. The only difference is akashik.</em>
</p>

> **Cooperative. Peer-to-peer. In the lineage of Napster, eMule, and BitTorrent — every peer's research compounds for the whole network, and a sub-second retrieval replaces 90+ seconds of token-burning AI research. No one pays twice for the same answer.**

```
$ akashik ask "vector search sqlite" --k 3

## vearch/vearch (2,297★)            (GitHub repo your peer starred)
   distance: 0.961 | room: akashik-dev

## packages/vectordb/store.go         (your own code)
   distance: 1.090 | room: auto-tlv

## CLAUDE.md project instructions     (your research notes)
   distance: 1.173 | room: auto-tlv
```

One query. Three rooms. A starred GitHub repo, your Go source, and your own Claude-session notes — all retrieved in 970 ms, CPU-only, no network call.

<p align="center">
  <b>75.22% NDCG@10 on BEIR SciFact</b> &nbsp;·&nbsp; CPU-only &nbsp;·&nbsp; 11 ms p50 &nbsp;·&nbsp;
  <b>13 documented null attacks</b> &nbsp;·&nbsp; W3C did:key identity &nbsp;·&nbsp; libp2p federation &nbsp;·&nbsp; MIT
</p>

## See it in action

| | |
|---|---|
| <img src="demo/scene-prompt-hook.gif" alt="UserPromptSubmit hook — answer arrives before Claude reads the message" width="420" /> | **The hook fires BEFORE the LLM reads your message.** UserPromptSubmit + akashik = retrieval at prompt time. Claude has the answer with citations *before* it considers a tool call. |
| <img src="demo/timing.gif" alt="headline timing teaser" width="420" /> | **Direct query, sub-second.** 15 cryogenic-LH2 research notes, cold cache. Real `time` measurement. |
| <img src="demo/scene-codebase.gif" alt="codebase Q&A" width="420" /> | **Codebase Q&A.** `claude -p` cites `src/daemon/job-queue.ts` directly via the akashik PreToolUse hook. |
| <img src="demo/scene-touch.gif" alt="P2P touch — 5-peer mesh" width="420" /> | **P2P touch.** 5 daemons on 127.0.0.1; peer A pulls exclusive notes from peers B and D, attribution preserved. |
| <img src="demo/screencast.gif" alt="full screencast" width="420" /> | **Full tour.** Agent contract, semantic search, entity recall, peer reputation table. |

Reproduce locally — every gif in `demo/` is a real recording, not a mock-up. See `demo/README.md` for the one-shot setup script and the [shooting manuscript](demo/MANUSCRIPT.md).

## Why akashik exists

The frontier-model economy isn't sustainable, and everyone paying attention knows it. Compute costs climb. Training runs burn hundreds of millions. Investors want returns. Governments want levers — a US administration can decide tomorrow that an AI lab is strategic infrastructure and reshape its trajectory with a phone call. When that happens your workflow's weather changes overnight: prices hike, models deprecate, weights get silently swapped, terms tighten, behaviors drift. The customer is never consulted.

The open-source community — tens of thousands of engineers, researchers, and operators — already writes the code, benchmarks the models, builds the tools, and documents the failure modes faster than any single lab can absorb them. Closed labs race; the open-source ecosystem evolves.

**akashik is how that ecosystem shares its knowledge.**

Ten thousand developers asking the same question ten thousand times a day. Ten thousand isolated 30-minute web searches. Same papers, same GitHub repos, same Stack Overflow threads, all re-derived alone, all billable. None of it accumulates. Each of us holds a shard of what's current — the regression we hit at 3 am and fixed, the library migration we finished Tuesday, the arXiv paper that dropped two hours ago, the CI config that broke after Node 25 shipped. None of that is in any frozen-weight model because it happened *after* training ended. Alone, those shards die when the session closes. Federated, they become the only live index of the field. Knowledge compounds across the community faster than any quarterly pre-training dump can keep up. Your Claude session starts from what ten thousand peers have already measured — not what a foundation model memorized six months ago.

Decentralized means the knowledge can't be revoked. When a lab gets acquired, sanctioned, or reorganized, your graph doesn't care. Your identity is a W3C `did:key` you own — the math on your keyring, not a row in someone else's user table. Shared memory carries signed envelopes verifiable offline in under 2 ms. Nobody emails support, because nobody operates "support."

The result: fewer tokens burned on repeated research, richer sessions every time a peer in your network learns something new, automatic propagation of best practices and current tools, context that stays fresh between pre-training cuts. The open-source movement open-sourced the code. **akashik open-sources the knowledge graph itself.** That's the next step.

## The three pillars

**1. Each peer carries a shard of what's current — together, the live index.** Every akashik instance is a libp2p peer. Rooms sync across peers via Y.js CRDT. A federated `ask --peers` fans a query across the network in parallel, 2-second per-peer timeout, results merged by cosine distance with per-peer attribution. The stranger who read that paper last Thursday, the peer who benchmarked that library two weeks ago, the dev who debugged that exact bug last night — their embeddings flow into your session. Nobody knows the whole graph; together the community does — the live state of the field, something no frozen-weight model can touch.

**2. Your identity is math you own.** W3C `did:key` over Ed25519 on first boot, BIP39 24-word recovery, hardware-authorized device keys. Every shared memory carries a signed envelope verifiable offline in under 2 ms. No registry, no resolver, no customer record to revoke. When the VC-funded memory category changes pricing, yours stays.

**3. Retrieval that's measured, not claimed.** 75.22% NDCG@10 on full BEIR SciFact (5,183 × 300) — 1.2 pts above published bge-base dense, 1.5 below GPU-only monoT5-3B. 13 separate algorithmic attacks nulled and documented, including a full gpt-oss:20b κ=0.7053 LLM-as-judge calibration audit that puts the instrument-corrected ceiling at ~81%. Every null is reproducible; the hard part of retrieval is knowing what you can't claim.

## The only knowledge layer that gets richer the more people use it

<p align="center">
  <img src="docs/memory-stack.png" alt="The same Claude session, two different Fridays — without vs with akashik" width="920" />
</p>

**Same question. Same developer. Two different Fridays.**

Without akashik, your Claude session starts empty every time. Claude browses ten URLs, burns forty-five thousand tokens, takes thirty seconds, returns an answer half a year stale, and dies with the tab. Ten thousand other people run the exact same loop the same day. None of it compounds.

With akashik, the `PreToolUse` hook fires before Claude reaches for the web. Your graph — already holding every arXiv paper you've pulled, every repo you've starred, every past session you've had, plus every shard shared by every other peer running akashik — answers in **11 ms**. Three hits across three rooms: a GitHub repo someone starred yesterday, a piece of community code you hadn't seen, an arXiv paper from two hours ago. Claude replies instantly from the community's latest state. When the session ends, your transcript is vector-indexed back into the graph so tomorrow's session starts richer than today's. And every peer on the network is doing the same — the ten-thousand-stranger loop runs **once**, not ten thousand times.

That's the compound. Every new contributor makes every existing session better. The graph is the only memory layer in the AI stack that goes the *other* direction: up and to the right, forever, at zero marginal cost.

**Sources for the canonical stack** this diagram contrasts against: Anthropic's [Claude Code best-practices doc](https://code.claude.com/docs/en/best-practices) and the 2026 community comparisons of mem0 / Zep / Letta / Engram / MemPalace / mcp-memory-service.

## Install

```bash
git clone https://github.com/SaharBarak/akashik.git && cd akashik
npm install && bash scripts/bootstrap.sh
```

## Try it

```bash
akashik init                      # create a room, pick your sources
akashik trigger --room homelab    # fetch from ArXiv, HN, RSS, blogs, any URL
akashik index                     # index your codebase + deps + git
```

## Wire it into Claude Code (once, globally)

Register akashik as a **user-scoped MCP server** so every project gets it automatically — no `.mcp.json` per repo, no restart for each new project:

```bash
claude mcp add --scope user akashik -- akashik mcp
akashik claude install            # PreToolUse hook — Claude checks the graph first
```

After this, opening any project in Claude Code has `search`, `ask`, `get_node`, `get_neighbors`, `find_tunnels` available immediately. Claude checks your knowledge graph before every file search — no explicit ask needed.

> If you only want it in the current project, skip `--scope user` and a `.mcp.json` will be written locally instead.


exec
/bin/zsh -lc "find .claude-octopus -maxdepth 3 -type f | sort | sed -n '1,120p'" in /Users/saharbarak/personal/akashik
exec
/bin/zsh -lc "find .agents -maxdepth 3 -type f | sort | sed -n '1,120p'" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
.claude-octopus/state.json
.claude-octopus/state.json.backup

 succeeded in 0ms:
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

exec
/bin/zsh -lc "find akashik-rs -maxdepth 3 -type f | sort | sed -n '1,120p'" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
akashik-rs/.gitignore
akashik-rs/Cargo.lock
akashik-rs/Cargo.toml
akashik-rs/src/application/mod.rs
akashik-rs/src/application/pipeline.rs
akashik-rs/src/bin/embed_server.rs
akashik-rs/src/bin/akashik_cli.rs
akashik-rs/src/domain/beir.rs
akashik-rs/src/domain/encoder_spec.rs
akashik-rs/src/domain/metrics.rs
akashik-rs/src/domain/mod.rs
akashik-rs/src/domain/room_routing.rs
akashik-rs/src/domain/tunnel_graph.rs
akashik-rs/src/domain/vector_ops.rs
akashik-rs/src/infrastructure/encoder_port.rs
akashik-rs/src/infrastructure/fastembed_encoder.rs
akashik-rs/src/infrastructure/json_report.rs
akashik-rs/src/infrastructure/mod.rs
akashik-rs/src/infrastructure/progress.rs
akashik-rs/src/lib.rs
akashik-rs/src/main.rs

exec
/bin/zsh -lc "sed -n '1,200p' src/cli/commands/onboard.ts" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
/**
 * `akashik onboard` — first-run installer + onboarding wizard.
 *
 * Eight numbered steps that take a fresh machine to a wired install:
 *
 *   1. Pick the data home directory
 *   2. Run doctor (informational)
 *   3. Materialise the libp2p identity
 *   4. Ensure system rooms (toolshed + research) are shareable
 *   5. Wire Claude Code hooks + strip ghost helper-script entries
 *   6. Optionally ingest past Claude Code sessions (detached)
 *   7. Start the daemon
 *   8. Show P2P status + final cheatsheet
 *
 * The UI uses @clack/prompts so the surface matches modern installer
 * UX (bordered intro/outro, spinners with live status, clean Ctrl-C
 * cancellation). Onboarding deliberately does NOT index the cwd —
 * indexing is the user's intent, exposed as `akashik this`.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { connect } from 'node:net';
import {
  intro,
  outro,
  text,
  confirm,
  spinner,
  note,
  log,
  isCancel,
  cancel,
} from '@clack/prompts';
import { formatError } from '../../domain/errors.js';
import { loadOrCreateIdentity } from '../../infrastructure/peer-transport.js';
import { ensureSystemRoomsShared, loadSharedRooms } from '../../infrastructure/share-store.js';
import { loadPeers } from '../../infrastructure/peer-store.js';
import { isRunning, readPid } from '../../daemon/loop.js';
import { runtimePaths } from '../runtime.js';
import { claudeInstall } from './claude-install.js';

// ─────────────── flags ─────────────────────

interface Flags {
  readonly yes: boolean;
  readonly home?: string;
  readonly noSessions: boolean;
}

const parseFlags = (args: readonly string[]): Flags => {
  let yes = false;
  let home: string | undefined;
  let noSessions = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = (): string => args[++i] ?? '';
    if (a === '--yes' || a === '-y') yes = true;
    else if (a === '--home') home = next();
    else if (a.startsWith('--home=')) home = a.slice('--home='.length);
    else if (a === '--no-sessions') noSessions = true;
  }
  return { yes, home, noSessions };
};

// ─────────────── ghost-hook cleanup ────────

interface GhostRemoval {
  readonly event: string;
  readonly path: string;
}

const cleanGhostHooks = (
  settingsPath: string,
  projectDir: string,
): readonly GhostRemoval[] => {
  if (!existsSync(settingsPath)) return [];

  let parsed: { hooks?: Record<string, unknown[]> };
  try {
    parsed = JSON.parse(readFileSync(settingsPath, 'utf8'));
  } catch {
    return [];
  }
  const hooks = parsed.hooks;
  if (!hooks || typeof hooks !== 'object') return [];

  const removed: GhostRemoval[] = [];
  const isBroken = (entry: unknown): boolean => {
    const inner = (entry as { hooks?: unknown[] })?.hooks;
    if (!Array.isArray(inner)) return false;
    for (const h of inner) {
      const cmd = (h as { command?: string })?.command;
      if (typeof cmd !== 'string') continue;
      const matches = cmd.match(/\.claude\/[^"\s']+\.(?:cjs|mjs|sh|js)/g) ?? [];
      for (const rel of matches) {
        if (!existsSync(join(projectDir, rel))) return true;
      }
    }
    return false;
  };

  for (const event of Object.keys(hooks)) {
    const arr = hooks[event];
    if (!Array.isArray(arr)) continue;
    hooks[event] = arr.filter((entry) => {
      if (!isBroken(entry)) return true;
      const inner = (entry as { hooks?: unknown[] }).hooks ?? [];
      for (const h of inner) {
        const cmd = (h as { command?: string })?.command ?? '';
        const m = cmd.match(/\.claude\/[^"\s']+\.(?:cjs|mjs|sh|js)/g) ?? [];
        for (const p of m) {
          if (!existsSync(join(projectDir, p))) removed.push({ event, path: p });
        }
      }
      return false;
    });
  }
  if (removed.length > 0) {
    parsed.hooks = hooks;
    writeFileSync(settingsPath, JSON.stringify(parsed, null, 2));
  }
  return removed;
};

// ─────────────── cancel helper ─────────────

const ensure = <T>(v: T | symbol): T => {
  if (isCancel(v)) {
    cancel('onboarding cancelled — run again whenever.');
    process.exit(0);
  }
  return v as T;
};

// ─────────────── steps ─────────────────────

const stepHome = async (flags: Flags): Promise<string> => {
  const def = flags.home ?? process.env.AKASHIK_HOME ?? join(homedir(), '.akashik');
  const chosen = flags.yes
    ? def
    : ensure(
        await text({
          message: 'Data home',
          placeholder: def,
          initialValue: def,
          validate: (v) => (v && v.trim() ? undefined : 'path required'),
        }),
      );
  process.env.AKASHIK_HOME = chosen;
  mkdirSync(chosen, { recursive: true });
  if (chosen !== join(homedir(), '.akashik')) {
    note(
      `Add to your shell profile so future sessions agree:\n  export AKASHIK_HOME="${chosen}"`,
      'non-default home',
    );
  }
  return chosen;
};

const stepDoctor = (): void => {
  const sp = spinner();
  sp.start('checking runtime (Node, Python, venv, graphify)');
  const r = spawnSync(process.execPath, [process.argv[1], 'doctor'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (r.status === 0) {
    sp.stop('runtime healthy');
  } else {
    sp.stop("runtime check reported issues — run 'akashik doctor --fix'");
  }
};

const stepIdentity = async (home: string): Promise<string | null> => {
  const sp = spinner();
  sp.start('creating libp2p identity (Ed25519)');
  const res = await loadOrCreateIdentity(join(home, 'peer-identity.json'));
  if (res.isErr()) {
    sp.stop(`identity failed: ${formatError(res.error)}`);
    return null;
  }
  sp.stop(`peer identity ready · ${res.value.peerId.slice(0, 24)}…`);
  return res.value.peerId;
};

/**
 * Optional GitHub OAuth link — wires a verified GitHub handle to the
 * local DID via Device Flow. Skippable; users without
 * `AKASHIK_GITHUB_CLIENT_ID` configured see a clear "skip + how
 * to enable later" message rather than a broken flow.
 *
 * The actual OAuth round-trip lives in src/cli/commands/login.ts; this

exec
/bin/zsh -lc "sed -n '1,200p' src/telegram/bot.ts" in /Users/saharbarak/personal/akashik
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
/bin/zsh -lc "sed -n '1,200p' src/infrastructure/rust-retrieval.ts" in /Users/saharbarak/personal/akashik
 succeeded in 0ms:
/**
 * Rust retrieval client — thin stdio JSON-RPC wrapper around the
 * akashik-rs `embed_server` binary for the non-embedder ops:
 * tunnel detection (Phase 27, mathematician Proposal B — RNG graph)
 * and pilot-centroid room routing (Phase 28, RouterRetriever-style).
 *
 * Shape mirrors `rustSubprocessEmbedder` from `embedders.ts`: a single
 * long-lived subprocess, single-flight FIFO request queue, lazy
 * startup on first use, graceful error propagation via neverthrow
 * Result monads. Every call is pure wrt the client's observable
 * state: same input → same output (the Rust side is stateless).
 *
 * Strategy pattern: the `RustRetrievalClient` interface is what the
 * application layer should depend on; the concrete `spawnRustRetrievalClient`
 * factory is infrastructure-only.
 */

import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { dirname, join } from 'node:path';
import * as readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { VectorError } from '../domain/errors.js';
import type { NodeId, Room } from '../domain/graph.js';
import type { Vector } from '../domain/vectors.js';

// ─────────────────────── wire types ───────────────────────

interface WireVector {
  readonly node_id: NodeId;
  readonly room: Room;
  readonly vector: readonly number[];
}

interface WireTunnel {
  readonly a: NodeId;
  readonly b: NodeId;
  readonly room_a: Room;
  readonly room_b: Room;
  readonly distance: number;
}

interface WireCentroid {
  readonly room: Room;
  readonly vector: readonly number[];
  readonly doc_count: number;
}

interface RustRequest {
  readonly op: 'find_tunnels' | 'compute_centroids' | 'ping' | 'shutdown';
  readonly vectors?: readonly WireVector[];
  readonly k_neighbors?: number;
}

interface RustResponse {
  readonly ok: boolean;
  readonly tunnels?: readonly WireTunnel[];
  readonly centroids?: readonly WireCentroid[];
  readonly error?: string;
  readonly version?: string;
}

// ─────────────────────── domain-layer outputs ─────────────

/**
 * Tunnel in akashik's domain shape — a semantic bridge between
 * two rooms, returned by the RNG graph pass. Distance is L2 between
 * the two nodes' embeddings.
 */
export interface RetrievalTunnel {
  readonly a: NodeId;
  readonly b: NodeId;
  readonly room_a: Room;
  readonly room_b: Room;
  readonly distance: number;
}

/**
 * A room's L2-normalized pilot centroid vector, used for
 * RouterRetriever-style routing (cosine query → nearest room).
 */
export interface RoomCentroid {
  readonly room: Room;
  readonly vector: Vector;
  readonly doc_count: number;
}

/**
 * Port — the application layer depends on this interface, not on
 * the concrete subprocess implementation. Lets unit tests swap in a
 * pure in-memory fake.
 */
export interface RustRetrievalClient {
  findTunnels(
    vectors: ReadonlyArray<{
      readonly node_id: NodeId;
      readonly room: Room;
      readonly vector: Vector;
    }>,
    kNeighbors?: number,
  ): ResultAsync<readonly RetrievalTunnel[], VectorError>;

  computeCentroids(
    vectors: ReadonlyArray<{
      readonly node_id: NodeId;
      readonly room: Room;
      readonly vector: Vector;
    }>,
  ): ResultAsync<readonly RoomCentroid[], VectorError>;

  close(): void;
}

// ─────────────────────── options ─────────────────────────

export interface RustRetrievalOptions {
  /**
   * Path to the embed_server binary. Defaults to the repo-local
   * `akashik-rs/target/release/embed_server`; override via
   * `$AKASHIK_RUST_BIN` env var or this option.
   */
  readonly binaryPath?: string;
}

// ─────────────────────── adapter ─────────────────────────

const defaultBinaryPath = (): string => {
  const envBin = process.env.AKASHIK_RUST_BIN;
  if (envBin) return envBin;
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', '..', 'akashik-rs', 'target', 'release', 'embed_server');
};

/**
 * Spawn a long-lived Rust retrieval client. Lazy — no subprocess
 * until the first op is called.
 */
export const spawnRustRetrievalClient = (
  opts: RustRetrievalOptions = {},
): RustRetrievalClient => {
  const binaryPath = opts.binaryPath ?? defaultBinaryPath();

  let child: ChildProcessWithoutNullStreams | null = null;
  const pending: Array<(res: RustResponse) => void> = [];
  let initPromise: Promise<void> | null = null;

  const ensureStarted = (): ResultAsync<void, VectorError> => {
    if (child && !child.killed) return okAsync(undefined);
    if (!initPromise) {
      initPromise = new Promise<void>((resolve, reject) => {
        try {
          const spawned = spawn(binaryPath, [], { stdio: ['pipe', 'pipe', 'pipe'] });
          spawned.on('error', (e) => reject(e));
          spawned.on('exit', (code) => {
            child = null;
            while (pending.length > 0) {
              const resolver = pending.shift();
              if (resolver) {
                resolver({
                  ok: false,
                  error: `embed_server exited with code ${code}`,
                });
              }
            }
          });
          spawned.stderr.setEncoding('utf8');
          spawned.stderr.on('data', () => {
            // startup banner + goodbye — absorb silently
          });

          readline.createInterface({ input: spawned.stdout }).on('line', (line) => {
            const resolver = pending.shift();
            if (!resolver) return;
            try {
              resolver(JSON.parse(line) as RustResponse);
            } catch (e) {
              resolver({
                ok: false,
                error: `stdout parse: ${(e as Error).message}`,
              });
            }
          });

          child = spawned;
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    }
    return ResultAsync.fromPromise(initPromise, (e) =>
      VectorError.readError(`rust retrieval spawn: ${(e as Error).message}`),
    );
  };

  const sendRequest = (req: RustRequest): ResultAsync<RustResponse, VectorError> =>
    ensureStarted().andThen(() =>
      ResultAsync.fromPromise(
        new Promise<RustResponse>((resolve) => {
          pending.push(resolve);

codex
The repo is carrying three different stories at once: old `akashik` personal/team memory, mid-phase retrieval leaderboard work, and current `Akashik` OSS commons. The cleanup should optimize for one thing: make the federation-compounding thesis look like the product, and demote everything else to history.

**Direct Table**

**Repo Root**

| file path | action | one-line reason |
|---|---|---|
| `README.md` | KEEP | This is the current canonical Akashik story and already explains the compounding loop clearly. |
| `README.md.bak.830lines` | DELETE | Pure backup clutter; no product or engineering value once current README exists. |
| `package.json` | NEEDS-REWRITE | Still markets `akashik` as an “agent memory” package; code name can stay, description should not. |
| `NEXT_STEPS.md` | ARCHIVE | Useful transition artifact, but still frames the product as “local-first agent memory system.” |
| `findings.md` | ARCHIVE | Retrieval-research synthesis is historically useful, but not front-door product truth now. |
| `.gitignore` | NEEDS-REWRITE | Missing `.claude-octopus/`; should also explicitly exclude local research state and transient backups. |
| `.planning/` | NEEDS-REWRITE | Valuable as history, but the current phase tree is not a usable live planning system anymore. |
| `.claude-octopus/` | DELETE | Checked-in local orchestration state; not product source, not reproducible, security/noise risk. |
| `.agents/` | DELETE | Personal authoring skills/design prompts are not part of the Akashik OSS product surface. |
| `.claude/` | KEEP | Repo-level contributor/agent instructions can still be relevant if they are product-specific. |
| `.claude-plugin/` | KEEP | Still relevant if Claude integration remains part of the distribution story. |
| `src/` | KEEP | Core product implementation. |
| `tests/` | KEEP | Still needed, but several retrieval-era suites should be archived. |
| `docs/` | KEEP | Core narrative and design record, but needs triage hard. |
| `scripts/` | ARCHIVE | Many scripts are tied to retrieval-race experiments; keep as lab history, not top-level product identity. |
| `akashik-rs/` | KEEP | Not obviously dead; still supports current performance path during the two-name period. |
| `dist/` | KEEP | Build artifact expected for package distribution; not a cleanup target unless you change release flow. |
| `demo/` | NEEDS-REWRITE | Demo likely still useful, but copy/screens need to reflect Akashik instead of old framing. |

**Docs: top 20**

| file path | action | one-line reason |
|---|---|---|
| `docs/PROJECT-PLAN-AKASHIK.md` | KEEP | Best current plan doc; aligned to AkashikBench-F and the OSS pilot. |
| `docs/README.md` | NEEDS-REWRITE | Likely redundant unless it becomes the docs index for the Akashik story. |
| `docs/product/VISION.md` | NEEDS-REWRITE | Strong protocol thinking, but still anchored in “agent-memory protocol problem.” |
| `docs/product/ROADMAP.md` | ARCHIVE | Describes the old Claude plugin + Telegram product arc, not the current one. |
| `docs/product/BENCHMARKS.md` | NEEDS-REWRITE | Benchmarking still matters, but this doc over-centers retrieval leaderboard progress and stale phases. |
| `docs/product/MANIFESTO.md` | KEEP | Likely still useful if it matches the commons thesis; keep as mission-layer doc. |
| `docs/product/GRAPHRAG-AUDIT.md` | ARCHIVE | Useful historical competitive analysis, but not core to the Akashik front story now. |
| `docs/product/RELEASE-v4.md` | ARCHIVE | Release doc for the pre-pivot product generation. |
| `docs/marketing/how-akashik-works.md` | KEEP | This is one of the strongest current explanatory artifacts. |
| `docs/marketing/storybrand-messaging-draft.md` | NEEDS-REWRITE | Preserve the final messaging, collapse the revision scaffolding into a shorter canonical doc. |
| `docs/marketing/positioning-draft.md` | ARCHIVE | Draft-stage messaging from an earlier frame. |
| `docs/marketing/positioning-v2.1.md` | ARCHIVE | Transitional positioning; useful history, wrong as current source of truth. |
| `docs/marketing/SOCIAL-LAUNCH.md` | KEEP | Still launch-relevant if updated for Akashik naming and pilot audience. |
| `docs/marketing/growth-sources-plan.md` | KEEP | Still useful for OSS distribution planning. |
| `docs/marketing/influencer-outreach.md` | KEEP | Still useful if the pilot depends on targeted OSS ecosystem outreach. |
| `docs/research/beat-the-competitors-retrieval-plan.md` | ARCHIVE | Keep as annotated history; the research is good, but the frame is superseded. |
| `docs/research/energy-based-contradiction-detection.md` | ARCHIVE | Legit future idea, but non-core and not tied to the present Akashik milestone. |
| `docs/research/performance-prediction-matrix.md` | ARCHIVE | Over-optimizes old leaderboard logic and hardware-tier positioning instead of federation value. |
| `docs/research/github-star-growth.md` | ARCHIVE | Potentially useful growth research, but not a live product doc. |
| `docs/p2p/p2p-threat-model.md` | KEEP | Still directly relevant; for OSS and future enterprise use, security provenance remains core. |

**Tests: top 10**

| file path | action | one-line reason |
|---|---|---|
| `tests/bench-akashik-federation.test.ts` | KEEP | This is the pivot-validating benchmark and should become the flagship suite. |
| `tests/bench-locomo-real.test.ts` | KEEP | Still useful as a single-peer retrieval floor; complements, not replaces, federation tests. |
| `tests/bench-longmemeval-real.test.ts` | KEEP | Same as above; useful baseline even if no longer the product headline. |
| `tests/bench-scifact-real.test.ts` | KEEP | Good retrieval regression guard, but secondary to federation from now on. |
| `tests/bench-real.test.ts` | ARCHIVE | 30-doc labeled proxy is clearly superseded by real-corpus benches. |
| `tests/bench-standard.test.ts` | ARCHIVE | Synthetic Hotpot/competitor-style framing was useful then, but is no longer canonical. |
| `tests/bench-locomo-synth.test.ts` | ARCHIVE | Real LoCoMo bench makes this mainly a historical or fast-smoke artifact. |
| `tests/bench-longmemeval-synth.test.ts` | ARCHIVE | Same issue; real-corpus equivalents now exist. |
| `tests/phase17.federated-search.test.ts` | KEEP | Still directly tied to the Akashik mechanism. |
| `tests/phase35.p2p-touch-e2e.test.ts` | KEEP | Real P2P behavior is still core to the current thesis. |

**Src: top 10**

| file path | action | one-line reason |
|---|---|---|
| `src/domain/federation-sim.ts` | KEEP | Core Akashik proof artifact. |
| `src/application/federated-search.ts` | KEEP | Central to the live product story. |
| `src/application/ask.ts` | KEEP | Still the main query path, though terminology and fallback narration need eventual rename cleanup. |
| `src/application/discovery-loop.ts` | KEEP | Still aligned if discovery means growing the commons; not obviously stale. |
| `src/infrastructure/peer-transport.ts` | KEEP | Foundational to the federation thesis. |
| `src/domain/peer-reputation.ts` | KEEP | Still strategically relevant for trust, abuse resistance, and future compliance posture. |
| `src/domain/long-term-memory.ts` | ARCHIVE | Solid work, but it belongs to the old “memory product” center of gravity, not the current core. |
| `src/telegram/bot.ts` | DELETE | Telegram bot is product-surface drift; it is not part of the current Akashik wedge. |
| `src/cli/commands/onboard.ts` | NEEDS-REWRITE | Onboarding still matters, but the flow should sell “join the commons,” not “install a personal memory daemon.” |
| `src/infrastructure/rust-retrieval.ts` | KEEP | Not dead; still supports performance paths while the package/runtime remain in the two-name period. |

**`.planning/` tree**

| file path | action | one-line reason |
|---|---|---|
| `.planning/HANDOFF.md` | DELETE | Session-specific infra notes, server IDs, and operational residue should not live in the product repo. |
| `.planning/long-term-memory-integration.md` | ARCHIVE | Strong historical design work, but centered on the pre-pivot memory stack. |
| `.planning/phases/phase-21/21-CONTEXT.md` | ARCHIVE | Good historical context for the memory-tier effort; not live plan material. |
| `.planning/phases/phase-23/23-CONTEXT.md` | ARCHIVE | Useful retrieval-benchmark history, superseded as active planning. |
| `.planning/BENCH-COMPETITORS.md` | ARCHIVE | Keep as research record, not as current strategy surface. |
| `.planning/BENCH-v2.md` | ARCHIVE | Historical retrieval-attack archive; useful, but not live plan material. |
| `.planning/MILESTONES.md` | NEEDS-REWRITE | Keep only if re-authored around Akashik phases, not phase-number archaeology. |
| `.planning/PROJECT.md` | ARCHIVE | Almost certainly stale relative to `docs/PROJECT-PLAN-AKASHIK.md`. |
| `.planning/ROADMAP.md` | ARCHIVE | Same issue; wrong layer and likely stale framing. |
| `.planning/test-runs/p2p-phases-2026-05-11T160726Z.md` | DELETE | Raw run log, not durable product documentation. |

**Q1-Q5 Calls**

The biggest no-longer-relevant cluster is anything whose center of gravity is “beat mem0/agentmemory on single-peer retrieval” or “personal memory product workflow.” That work was not wasted; it became enabling infrastructure. However, front-door docs, stale synthetic benches, session handoff files, Telegram surface area, personal `.agents` skills, and `.claude-octopus` state are now mostly drag.

On `.planning/`: the phase-based GSD workflow was useful while the project was in rapid invention mode. On the other hand, keeping the full phase tree at repo front-door now makes the codebase read like an excavation site. The tradeoff is traceability versus clarity. My call: keep planning history, but archive almost all of `.planning/phases/` and replace live planning with one current Akashik roadmap plus a short `docs/archive/README.md` explaining the lineage.

On `docs/research/`: `beat-the-competitors-retrieval-plan.md` should be archived, not deleted. It contains real empirical thinking and explains why retrieval work plateaued. However, it is now strategically misleading if left unannotated at top level. `energy-based-contradiction-detection.md` and `performance-prediction-matrix.md` are also archive material: intellectually useful, but off the current critical path. Conversely, `p2p-threat-model.md` stays live because security, provenance, auditability, and future GDPR/SOC2 questions still matter under the new thesis.

On `src/`: `akashik-rs` is not obviously dead. The upside of keeping it is that it preserves a proven performance path during the transition; the downside is maintenance burden and name-drift. I would not remove it until you know the Node-only path can fully cover the hot paths you care about. `.claude-octopus/`, by contrast, looks checked in by mistake. The upside of preserving it is effectively zero; the downside is repo noise and accidental leakage of local orchestration state. It should be deleted and gitignored.

On tests: the real-corpus benches still matter because they prove the local node is not weak. However, the product claim is no longer “best R@5.” The tradeoff is regression coverage versus attention dilution. My call: keep `bench-akashik-federation` as flagship, keep the real retrieval benches as regression guards, archive the synthetic proxy benches that were only useful while public-corpus adapters were missing.

On naming: do not stay indefinite two-name. A short bounded two-name period is defensible because it avoids breaking installs, CLI muscle memory, config locations, and package publishing flow. However, the tradeoff is ongoing cognitive debt: every doc has to explain the mismatch, and stale `akashik` framing keeps regenerating. My recommendation is a coordinated rename plan with prerequisites:
1. Confirm package/binary/repo/domain names you can actually secure.
2. Decide whether config paths stay `~/.akashik` for one compatibility release or migrate with aliasing.
3. Add a temporary CLI alias so `akashik` and `akashik` both work for one release.
4. Freeze protocol IDs and signed message prefixes deliberately; changing them has compatibility implications.
5. Publish one migration doc and stop creating new mixed-name docs immediately.

If I were Sahar cleaning up right now, the 3 changes I’d make first are: delete and gitignore `.claude-octopus/` plus remove `README.md.bak.830lines`; archive the stale retrieval-era docs/tests into `docs/archive/` with a short index note; and rewrite `package.json` + `docs/product/ROADMAP.md` around the Akashik commons thesis. Those three give the fastest signal improvement because they remove obvious noise, stop the repo from telling the wrong story, and preserve the useful history without letting it dominate the present.
2026-05-26T17:34:49.132058Z ERROR codex_core::session: failed to record rollout items: thread 019e6557-a8e4-7fd3-87f9-24af3b9b0d4f not found
tokens used
102,720
```
# Completed: יום ג׳ מאי 26 2026 20:41:44 IDT
