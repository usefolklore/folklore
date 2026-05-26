# PROBE Phase Synthesis
## Discovery Summary - יום ג׳ מאי 26 2026 20:43:34 IDT
## Original Task: -P CLEANUP AUDIT — what's no longer relevant in the Akashik project given the full arc:

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
- Be opinionated. Don't return 'maybe keep, maybe delete' for everything. Make a call.

<external-cli-output provider="gemini" trust="untrusted">
Based on the multi-agent codebase audit, here is the synthesis of the cleanup requirements, cross-cutting concerns, and transition strategy for the Akashik pivot.

### 1. Key Findings
- **Two-Story Debt:** The repository is heavily fractured between the dead "single-player retrieval leaderboard" era (`wellinformed`) and the live "federated knowledge commons" era (`Akashik`). This actively misleads new OSS contributors.
- **Security & Hygiene Risks:** Transient agent state containing provider usage metrics and session IDs (`.claude-octopus/`) and massive root-level backups (`README.md.bak.830lines`) are tracked in version control, violating basic repo hygiene and posing security risks.
- **Missing API Boundaries:** The pivot to Ed25519 DIDs introduces a hard authentication boundary that clashes with existing local IPC tokens. This migration lacks a strict protocol version bump (e.g., to `/akashik/share/2.0.0`), creating a split-brain security surface.
- **RTO Reality Check:** The Hetzner benchmarking VM has a bus-factor of 1. It relies on a manual cloud-init rebuild requiring a specific individual's token, and holds uncommitted validation data for the core compounding thesis. 

### 2. Patterns & Consensus
- **Purge Local State:** Unanimous agreement to immediately delete and add to `.gitignore`: `.claude-octopus/`, `.agents/`, `.claude-plugin/`, and `README.md.bak.830lines`.
- **Archive Legacy Planning & Research:** The `.planning/phases/` directories, along with docs like `beat-the-competitors-retrieval-plan.md`, `performance-prediction-matrix.md`, and the SOTA attack documents, represent excellent historical research but are strategically misleading. They must be moved to `archive/` directories with clear annotations.
- **Supersede Synthetic Tests:** Real-corpus benchmarks (`bench-locomo-real.test.ts`, `bench-akashik-federation.test.ts`) are the new gold standard. Synthetic tests (`bench-standard.test.ts`, `bench-real.test.ts`, `*synth*`) should be archived or skipped to reduce CI noise and focus engineering on federation dynamics.
- **Rewrite Core Positioning:** `MANIFESTO.md`, `VISION.md`, and `ROADMAP.md` must be entirely rewritten to match the final OSS-commons StoryBrand messaging. Draft positioning files (`positioning-draft.md`, `positioning-v2.1.md`) should be deleted.

### 3. Conflicts & Trade-offs
- **Codebase Naming (Rename vs. Two-Name):**
  - *Conflict:* Full rename cleanly aligns branding, but breaks the Rust IPC (`wellinformed-rs`) and legacy zombie integrations. 
  - *Resolution & Trade-off:* Tolerate the cognitive debt of a "two-name" period. Use "Akashik" for all branding/docs, but keep "wellinformed" for code/binaries. When the rename happens, keep `wellinformed` as a bin alias with a deprecation warning to safely handle zombie integrations.
- **Experimental Rerankers (`cross-rerank.ts`, `llm-listwise-rerank.ts`):**
  - *Conflict:* Delete dead ML optimization code to simplify the hot path vs. archive the code since it is technically sound and might be revived post-pilot.
  - *Resolution & Trade-off:* Archive/disable the code and tests (e.g., via `.skip`). Deleting simplifies `ask.ts`, but archiving preserves validated (though currently parked) ML infrastructure.
- **Telegram Bot Integration (`src/telegram/`):**
  - *Conflict:* Delete it due to product-surface drift vs. maintain it to avoid breaking early adopter workflows.
  - *Resolution & Trade-off:* Quarantine into a `src/legacy/` namespace and explicitly deprecate it. Maintaining it drains P2P daemon engineering time, but outright deletion abruptly breaks workflows that will never voluntarily migrate to v2 auth.

### 4. Gaps
- **Shadow Traffic Validation:** As the primary `ask()` pipeline shifts to a `federated-search.ts` gossip fan-out, unit tests are insufficient. There is no shadow-traffic harness to replay federated queries against both the old direct-fan-out path and the new routed path. "Parity" must be strictly defined (e.g., the top-5 result sets must not drop >1 point absolute).
- **Untested Backups:** The critical Phase 23.7 benchmark results proving the compounding thesis (`/data/reports/run.{log,jsonl}`) live entirely on the ephemeral Hetzner box. They must be committed to `docs/product/BENCHMARKS.md` as static artifacts before the box is torn down.

### 5. Priority Matrix

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

### 6. Recommended Approach

If I were Sahar cleaning up right now, the 3 changes I'd make first are:
1. **Delete and `.gitignore` local state and backups (`.claude-octopus/`, `.agents/`, `README.md.bak.830lines`)**: Because checking in transient agent state, provider tokens, and 50KB backups is a severe security/hygiene risk that bloats the repo and confuses context windows.
2. **Bulk archive `.planning/phases/` and pre-pivot retrieval docs to `archive/` folders**: Because they actively mislead new OSS contributors by presenting the dead "single-player leaderboard" positioning as the current strategy, diluting the focus on AkashikBench-F and federation.
3. **Rewrite `MANIFESTO.md`, `VISION.md`, and `ROADMAP.md` to the Akashik OSS-commons framing, while setting up a `wellinformed` bin alias for zombie integrations**: Because the biggest current risk is a doc surface telling two different stories; updating the docs aligns the mission for the Phase 25 pilot, while the bin alias safely handles legacy integrations during the two-name transition.
</external-cli-output>

---
*Synthesized from 6 research threads (task group: 1779816691)*
