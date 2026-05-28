<!-- trust=untrusted provider=gemini -->
# Agent: gemini
# Task ID: probe-1779816691-1
# Role: researcher
# Phase: probe
# Prompt: Research existing solutions and patterns for: -P CLEANUP AUDIT — what's no longer relevant in the Akashik project given the full arc:

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
- Be opinionated. Don't return 'maybe keep, maybe delete' for everything. Make a call.. What has been done before? What worked, what failed?
# Started: יום ג׳ מאי 26 2026 20:31:43 IDT

<!-- BEGIN-UNTRUSTED:provider=gemini:nonce=4f8551e335ba65d2 -->
## Output
```
Here is the cleanup audit synthesizing the codebase context and the recent pivot to the **Akashik** (OSS federated knowledge commons) positioning.

### Codebase Identifiers: The Naming Strategy
**Recommendation:** Stay two-name for now. Keep `akashik` for code, binaries, and the Rust sidecar, while using `Akashik` for the product, docs, and branding.
- *Advantage:* A codebase-wide rename is a massive, highly-disruptive git operation that will break the `akashik-rs` IPC integration, invalidate existing user installations, and clutter commit history just as you are stabilizing the federation layer. 
- *Tradeoff:* It creates cognitive load for new OSS contributors who have to map "Akashik" in the README to "akashik" in the CLI and source files. We can mitigate this with a clear "Architecture / Glossary" note in the root README.

### Cleanup Audit Table

| File Path | Action | Reason |
| :--- | :--- | :--- |
| **Repo Root** | | |
| `README.md.bak.830lines` | DELETE | Pure noise; an old backup cluttering the working tree. |
| `.claude-octopus/` | DELETE | Untracked local AI state. Delete and add to `.gitignore` to prevent leaks. |
| `akashik-rs/` | KEEP | The Rust IPC client is a primary growth lever for the Rust Discord community. |
| `.agents/` | KEEP | Active AI skills/hooks directory for local workflows. |
| **.planning/ Tree** | | |
| `.planning/` (Entire Directory) | ARCHIVE | Phase-based GSD planning (e.g., `phase-21`, `HANDOFF.md`) is a solo-dev artifact. Archive to `docs/archive/` for historical context. |
| **docs/ Top 20 Files** | | |
| `docs/PROJECT-PLAN-AKASHIK.md` | KEEP | The active alignment document for the current pivot. |
| `docs/README.md` | KEEP | The primary entry point for the repo. |
| `docs/probe.html` | DELETE | Testing cruft with no long-term value. |
| `docs/research/beat-the-competitors-retrieval-plan.md` | ARCHIVE | Competitive positioning (mem0, Letta) is superseded, but the LME-S ML analysis is worth preserving. |
| `docs/research/energy-based-contradiction-detection.md` | ARCHIVE | Obsolete ML research irrelevant to the new federated baseline. |
| `docs/research/performance-prediction-matrix.md` | ARCHIVE | Old single-player optimization tracking. |
| `docs/research/github-star-growth.md` | ARCHIVE | Pre-pivot growth tracking. |
| `docs/marketing/storybrand-messaging-draft.md` | NEEDS-REWRITE | **Delete the evolution table.** Collapse the document to reflect *only* the final OSS community version to prevent brand confusion. |
| `docs/marketing/positioning-draft.md` | ARCHIVE | Old single-player agent memory positioning. |
| `docs/marketing/positioning-v2.1.md` | ARCHIVE | Old single-player agent memory positioning. |
| `docs/marketing/SITE-REDESIGN-SPEC.md` | KEEP | Active spec for the current rebrand sweep. |
| `docs/marketing/BRAND-KIT.md` | KEEP | Essential for consistent Akashik branding. |
| `docs/architecture/ADR-001-v3-memory-protocol.md` | KEEP | Critical protocol history. |
| `docs/architecture/ADR-002-v4-agent-brain.md` | KEEP | Core architecture decisions. |
| `docs/architecture/V4-PROTOCOL.md` | KEEP | Active protocol spec for the daemon. |
| `docs/p2p/P2P-VISION.md` | KEEP | Foundational to the new Akashik federated mission. |
| `docs/p2p/p2p-threat-model.md` | KEEP | P2P security context is mandatory for OSS adoption. |
| `docs/product/MANIFESTO.md` | KEEP | Aligns perfectly with the OSS community positioning. |
| `docs/product/GRAPHRAG-AUDIT.md` | ARCHIVE | Pre-pivot competitive analysis. |
| `docs/index.html` | KEEP | Landing page staging for the redesign. |
| **tests/ Top 10 Files** | | |
| `tests/bench-standard.test.ts` | DELETE | Synthetic HotpotQA test entirely superseded by real-corpus benches. |
| `tests/bench-real.test.ts` | DELETE | Old 30-doc proxy superseded by `bench-locomo-real.test.ts`. |
| `tests/bench-locomo-synth.test.ts` | DELETE | Synthetic fixtures superseded by real data. |
| `tests/bench-longmemeval-synth.test.ts` | DELETE | Synthetic fixtures superseded by real data. |
| `tests/bench-akashik-federation.test.ts` | KEEP | Crucial test validating the compounding federated thesis. |
| `tests/bench-locomo-real.test.ts` | KEEP | The current gold standard for retrieval accuracy. |
| `tests/phase38.oracle.test.ts` | KEEP | Tests the live P2P Q&A bulletin board logic. |
| `tests/federation-sim.test.ts` | KEEP | Validates core P2P scaling and routing. |
| `tests/cross-rerank.test.ts` | DELETE | Tests dead code that yielded a "clean null" in quality lift. |
| `tests/llm-listwise-rerank.test.ts` | DELETE | Tests dead code (underperformed bi-encoder). |
| **src/ Top 10 Files** | | |
| `src/domain/binary-quantize.ts` | DELETE | Dead experimental hot-cache optimization; not in the bench path. |
| `src/domain/cross-rerank.ts` | DELETE | Abandoned phase artifact; gated and proved useless. |
| `src/domain/llm-listwise-rerank.ts` | DELETE | Dead code; small LLMs proved worse than the bi-encoder here. |
| `src/domain/oracle.ts` | KEEP | Core logic for the federated oracle gossip. |
| `src/application/discovery-loop.ts` | KEEP | Active, necessary keyword expansion loop. |
| `src/application/consolidator.ts` | KEEP | Crucial for the episodic→semantic distillation process. |
| `src/application/federated-search.ts` | KEEP | The backbone of the Akashik P2P network. |
| `src/domain/recency-rerank.ts` | DELETE | Another abandoned single-player reranking experiment. |
| `src/infrastructure/rust-retrieval.ts` | KEEP | Core IPC bridge to the `akashik-rs` client. |
| `src/application/ask.ts` | NEEDS-REWRITE | Strip out the dead reranker conditionals (e.g., cross-rerank) that currently clutter the file. |

### Execution Priority

If I were Sahar cleaning up right now, the 3 changes I'd make first are:
1. **Purge the synthetic tests (`bench-standard`, `bench-real`, `*synth*`)**: They clutter CI/CD, gate nothing useful, and have been empirically superseded by `bench-locomo-real.test.ts` which is the actual source of truth for retrieval quality.
2. **Move the `.planning/` tree and `docs/research/` out of the working directory into `docs/archive/`**: They represent the old single-player memory product framing (RAG optimization / solo-dev GSD phases), which actively creates conflicting context for any OSS contributor trying to understand the new federated mission.
3. **Delete the experimental reranker modules (`cross-rerank.ts`, `llm-listwise-rerank.ts`, `binary-quantize.ts`)**: The empirical probes confirmed they offer no quality lift ("clean null", "below bi-encoder"). Removing them drastically simplifies `src/application/ask.ts` and allows engineering focus to shift entirely to federation stability (like fixing the hybrid remote search bug) rather than chasing SOTA embeddings.
```
<!-- END-UNTRUSTED:provider=gemini:nonce=4f8551e335ba65d2 -->

## Status: SUCCESS

## Warnings/Errors
```
Warning: 256-color support not detected. Using a terminal with at least 256-color support is recommended for a better visual experience.
YOLO mode is enabled. All tool calls will be automatically approved.
YOLO mode is enabled. All tool calls will be automatically approved.
Ripgrep is not available. Falling back to GrepTool.
missing pgrep output
```
# Completed: יום ג׳ מאי 26 2026 20:41:43 IDT
