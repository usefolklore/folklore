<!-- trust=untrusted provider=gemini -->
# Agent: gemini
# Task ID: probe-1779816691-4
# Role: researcher
# Phase: probe
# Prompt: Synthesize cross-cutting concerns for: -P CLEANUP AUDIT — what's no longer relevant in the Akashik project given the full arc:

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
- Be opinionated. Don't return 'maybe keep, maybe delete' for everything. Make a call.. What themes emerge across problem space, solutions, and feasibility?

When synthesizing, verify that these commonly-missed perspectives have been addressed. If any were missed by other agents, include them:

- Should an auth mechanism change be tied to an API version boundary? If moving from API keys to OAuth2, is that a v1-to-v2 transition or are auth and API versions independent during a transition period?
- Account for zombie integrations: some enterprise clients have integration code maintained by teams that no longer exist. These integrations will never voluntarily migrate. What is the strategy for the long tail?
- For API migrations, consider shadow traffic validation: replay production traffic against both old and new APIs and diff responses. This catches discrepancies that unit tests miss. Define what 'parity' means — exact match or acceptable divergence threshold.
- Are backups actually tested? When was the last full restore performed, and how long did it take? What is the measured (not theoretical) RTO? Does the restore process require manual steps only one person knows?
# Started: יום ג׳ מאי 26 2026 20:31:44 IDT

<!-- BEGIN-UNTRUSTED:provider=gemini:nonce=ba7b8e0c23f4d50f -->
## Output
```
Based on the codebase audit, the pivot from a single-user memory product (`wellinformed`) to a federated knowledge commons (`Akashik`) renders a significant portion of the repository's planning, benchmarking, and single-agent optimization code obsolete. The new priority is network compounding and cross-peer routing, not chasing personal-agent retrieval leaderboards.

Here is the synthesis of cross-cutting concerns, integrating the required perspectives on migrations, zombie integrations, and operational realities.

### Cross-Cutting Synthesis & Missing Perspectives

- **API Versioning & Auth Boundaries:** The pivot introduces Ed25519 DIDs for P2P identity. This fundamentally clashes with the existing local API key/token models used for daemon IPC. This is a hard v1-to-v2 boundary. **Tradeoff:** Tying the auth migration directly to the P2P release forces a breaking change on all existing local users. *Conversely*, supporting both auth models indefinitely creates a split-brain security surface. We must decouple local IPC auth from P2P identity during a transition period, allowing local agents to function while the DID network bootstraps.
- **Zombie Integrations (`src/telegram/bot.ts`):** The Telegram integration is a relic of the "personal memory" era. The maintainers of such scripts will never voluntarily migrate to a federated DID model. **Tradeoff:** Maintaining it drains engineering time from the core P2P daemon. *On the other hand*, immediately deleting it breaks existing workflows for early adopters. **Strategy:** Quarantine it into a `src/legacy/` namespace and explicitly deprecate it for v2.
- **Shadow Traffic Validation:** As the primary `ask()` pipeline shifts from a local SQLite query to a `federated-search.ts` gossip fan-out, unit tests are insufficient. **Tradeoff:** Shadow routing doubles the query latency for the test cohort. *However*, failing to do so risks silent quality degradation (like the currently documented "remote peers get embeddings only" bug). **Strategy:** Implement a shadow traffic pass in the daemon that runs local queries against *both* the local store and the network, diffing the results to define what 'parity' means in a federated context.
- **Backups and True RTO:** In a federated model, the concept of a "backup" shifts. If a peer loses their local `.wellinformed` SQLite database, what is the actual Recovery Time Objective (RTO) to rebuild their graph from the P2P network using their DID? **Tradeoff:** Relying purely on the network for restores saves disk space and complexity. *Conversely*, if a niche topic was only held locally and the peer dies, that knowledge evaporates (the "niche knowledge evaporation" failure mode). The restore process must be empirically timed and documented.

### Cleanup Audit Table

| File Path | Action | Reason |
|---|---|---|
| **Docs (Top 20)** | | |
| `docs/research/beat-the-competitors-retrieval-plan.md` | ARCHIVE | Positioning is dead (chasing mem0 on single-peer R@5), but E1-E12 retrieval techniques remain technically valid for the local hybrid search layer. |
| `docs/research/energy-based-contradiction-detection.md` | ARCHIVE | Over-optimizes local Jaccard vs NLI contradiction; irrelevant when federation transfers are the priority. |
| `docs/research/performance-prediction-matrix.md` | KEEP | Hardware latency tiering (CAX11 ARM vs Apple Silicon) remains highly relevant for sizing commodity P2P nodes. |
| `docs/research/octopus-discover/round-5-*/claude-sonnet-5.md` | ARCHIVE | Critical historical artifact showing exactly why the Akashik pivot happened. |
| `docs/marketing/storybrand-messaging-draft.md` | NEEDS-REWRITE | Collapse the evolution table to an appendix. It is vital for onboarding contributors to the new positioning, but shouldn't dilute the final messaging. |
| `docs/README.md` | KEEP | Standard docs entrypoint. |
| `docs/PROJECT-PLAN-AKASHIK.md` | KEEP | Current forward-looking plan for the new pivot. |
| `docs/architecture/*` | KEEP | Core architecture documentation. |
| `docs/p2p/*` | KEEP | Core Akashik value proposition and routing mechanics. |
| **Tests (Top 10)** | | |
| `tests/bench-akashik-federation.test.ts` | KEEP | The new gold standard for the compounding thesis (FedComp-LoCoMo). |
| `tests/bench-locomo-real.test.ts` | KEEP | Real-corpus validation for cross-session reasoning. |
| `tests/bench-longmemeval-real.test.ts` | KEEP | Baseline recall ceiling validation for local-first caches. |
| `tests/bench-standard.test.ts` | DELETE | Synthetic benchmark entirely superseded by real-corpus suites and federation simulation. |
| `tests/bench-real.test.ts` | DELETE | 30-doc proxy superseded by the full `bench-scifact-real.test.ts`. |
| `tests/bench-locomo-synth.test.ts` | DELETE | Synthetic tests are cruft now that real-corpus adapters exist. |
| `tests/bench-longmemeval-synth.test.ts` | DELETE | Synthetic test cruft. |
| `tests/federation-sim.test.ts` | KEEP | Validates P2P routing and local-first cache mechanics. |
| `tests/auto-forget.test.ts` | NEEDS-REWRITE | Must be updated to handle federated contradictions and inverse-frequency replication weighting, not just local TTLs. |
| `tests/bench-auto-forget.test.ts` | DELETE | Gated synthetic test that doesn't measure cross-peer TTL. |
| **Src (Top 10)** | | |
| `src/wellinformed-rs/` | KEEP | Rust IPC client is a massive adoption driver for the local-first community (Rust Discord). |
| `src/domain/cross-rerank.ts` | KEEP | Valid optimization for the local retrieval layer before federation fan-out. |
| `src/domain/recency-rerank.ts` | DELETE | Superseded by retention scoring and auto-forget math in `retention.ts`. |
| `src/domain/llm-listwise-rerank.ts` | ARCHIVE | Too heavy for commodity peers (CAX11 ARM); cross-encoder is the ceiling for the target hardware. |
| `src/application/federated-search.ts` | NEEDS-REWRITE | Must fix the silent embedding-only remote degradation bug (Priority 1 in NEXT_STEPS). |
| `src/application/discovery-loop.ts` | KEEP | Core recursive TF-IDF expansion for federated curiosity. |
| `src/telegram/bot.ts` | NEEDS-REWRITE | Quarantine this zombie integration. Determine if it migrates to v2 auth or gets explicitly dropped. |
| `src/mcp/server.ts` | KEEP | Essential for Claude Code / Cursor integration (the core ingestion mechanism). |
| `src/daemon/ipc.ts` | KEEP | Foundation for local agent communication. |
| `src/infrastructure/github-oauth.ts` | NEEDS-REWRITE | Re-evaluate auth mechanism boundaries (API keys vs OAuth2 DIDs). |
| **.planning Tree** | | |
| `.planning/phases/phase-15` to `phase-21` | DELETE | Old GSD workflow focused entirely on single-user retrieval optimization. |
| `.planning/HANDOFF.md` | DELETE | Stale session state for Hetzner VM benchmarking configuration. |
| `.planning/long-term-memory-integration.md` | ARCHIVE | Deep dive into personal memory tiers; useful theory, but wrong product focus. |
| `.planning/ROADMAP.md` | NEEDS-REWRITE | Must reflect the Akashik compounding thesis, not personal R@5 leaderboard climbing. |
| `.planning/BENCH-COMPETITORS.md` | ARCHIVE | Dead positioning against mem0. |
| **Repo Root** | | |
| `README.md.bak.830lines` | DELETE | Huge backup file polluting the tree. |
| `.claude-octopus/` | DELETE | Transient agent state. Must be added to `.gitignore`. |
| `findings.md` | KEEP | Active working context. |
| `NEXT_STEPS.md` | KEEP | Contains the active federation bugs (remote hybrid search fix). |
| `CLAUDE.md` | NEEDS-REWRITE | Update codebase identifiers and SOPs to reflect the Akashik mission. |

### Final Recommendation

If I were Sahar cleaning up right now, the 3 changes I'd make first are:
1. **Delete the synthetic benchmark suites (`bench-standard`, `bench-real`, `*synth.test.ts`) and `.planning/phase-*` directories.** Because they anchor the team to the dead "single-player leaderboard" positioning and clutter the CI pipeline with tests that don't reflect the new Definition of Done.
2. **Add `.claude-octopus/` to `.gitignore` and delete it, along with `README.md.bak.830lines`.** Because checking in transient agent state and 800-line backups is pure noise that confuses codebase context windows and bloats the repo size.
3. **Execute a coordinated global rename from `wellinformed` to `akashik` across the codebase, while quarantining `src/telegram/bot.ts` to a `legacy/` dir.** Because operating in a "two-name" period creates cognitive dissonance for contributors, and moving zombie integrations out of the main path forces a clean v2 auth boundary.
```
<!-- END-UNTRUSTED:provider=gemini:nonce=ba7b8e0c23f4d50f -->

## Status: SUCCESS

## Warnings/Errors
```
Warning: 256-color support not detected. Using a terminal with at least 256-color support is recommended for a better visual experience.
YOLO mode is enabled. All tool calls will be automatically approved.
YOLO mode is enabled. All tool calls will be automatically approved.
Ripgrep is not available. Falling back to GrepTool.
```
# Completed: יום ג׳ מאי 26 2026 20:41:44 IDT
