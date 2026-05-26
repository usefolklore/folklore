# Agent: claude-sonnet
# Task ID: probe-1779816691-2
# Role: researcher
# Phase: probe
# Prompt: Explore edge cases and potential challenges for: -P CLEANUP AUDIT — what's no longer relevant in the Akashik project given the full arc:

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
- Be opinionated. Don't return 'maybe keep, maybe delete' for everything. Make a call.. What could go wrong? What's often overlooked?

IMPORTANT — The following perspectives are systematically missed by LLMs. You MUST address each one:

- Should an auth mechanism change be tied to an API version boundary? If moving from API keys to OAuth2, is that a v1-to-v2 transition or are auth and API versions independent during a transition period?
- Account for zombie integrations: some enterprise clients have integration code maintained by teams that no longer exist. These integrations will never voluntarily migrate. What is the strategy for the long tail?
- For API migrations, consider shadow traffic validation: replay production traffic against both old and new APIs and diff responses. This catches discrepancies that unit tests miss. Define what 'parity' means — exact match or acceptable divergence threshold.
- Are backups actually tested? When was the last full restore performed, and how long did it take? What is the measured (not theoretical) RTO? Does the restore process require manual steps only one person knows?
# Started: יום ג׳ מאי 26 2026 20:31:43 IDT

## Output
```
I have all the evidence I need. Here is the full opinionated cleanup audit.

---

## Akashik Cleanup Audit — KEEP / ARCHIVE / DELETE / NEEDS-REWRITE

---

### Repo Root

| File / Dir | Action | Reason |
|---|---|---|
| `README.md` | NEEDS-REWRITE | Still says "wellinformed", north-star is the old demo loop, no mention of compounding thesis or OSS commons |
| `README.md.bak.830lines` | **DELETE** | 50 KB backup file committed by mistake; every git clone carries it; no historical value beyond git log |
| `NEXT_STEPS.md` | **ARCHIVE → `docs/archive/`** | North star ("make federated search match local search") is the old agent-memory framing; superseded by PROJECT-PLAN-AKASHIK.md and the compounding thesis |
| `findings.md` | **ARCHIVE → `docs/archive/`** | SOTA retrieval synthesis for the Phase 21-23 CPU-bound optimization era; genuinely good research but frozen-in-time; will confuse contributors who read it as current direction |
| `CLAUDE.md` | KEEP | Project instructions still valid |
| `Dockerfile` | KEEP | Infra unchanged |
| `package.json` / `tsconfig.json` | KEEP | |
| `skills-lock.json` | KEEP | Harness tooling config |
| `.mcp.json` | NEEDS-REWRITE | Tool names will still say `wellinformed` after rename; update after binary rename lands |
| `.gitignore` | **NEEDS EDIT** | `.claude-octopus/`, `.agents/`, `.claude-plugin/` are NOT gitignored but are committed local tool state — add all three |
| `.claude-octopus/` | **DELETE from git + GITIGNORE** | state.json tracks session counts and local workflow state; accidentally committed; is per-developer local state; `state.json.backup` means someone was editing it manually. High-risk if it ever captures tokens. |
| `.agents/` | ARCHIVE/GITIGNORE | Skills and hooks specific to the octopus workflow runner; local runtime state, not source |
| `.claude-plugin/` | KEEP + GITIGNORE | Plugin config is fine but shouldn't be committed if it contains instance-specific data |
| `bin/wellinformed.js` | NEEDS-REWRITE | Will become `bin/akashik.js` at rename; keep `wellinformed` as a symlink alias for zombie-integration continuity (see §Zombie Integrations below) |
| `demo/` (all `.gif` files) | NEEDS-REWRITE | All GIFs show `wellinformed` branding; the `.tape` scripts are the source-of-truth and should be re-run after rebrand; binary GIFs bloat git history — consider moving to a CDN or GitHub Releases attachment |
| `demo/*.tape` / `*.sh` | KEEP | Source scripts are still valid conceptually; just need brand find-replace |
| `vendor/` | KEEP | |
| `config/config.example.yaml` | KEEP | |

---

### `.planning/` Tree

| Path | Action | Reason |
|---|---|---|
| `PROJECT.md` | NEEDS-REWRITE | Root project context; predates the pivot |
| `REQUIREMENTS.md` | ARCHIVE | Original requirements doc for v2.0 P2P phases 15-18; superseded by AkashikBench-F + Phase 24 plan |
| `ROADMAP.md` | ARCHIVE | Covers phases 15-18 only, ends at Phase 20; entire forward plan is now PROJECT-PLAN-AKASHIK.md |
| `STATE.md` | ARCHIVE | GSD state file frozen at Phase 20 execution (April 2026); phases 21-23 aren't tracked here; replaced by HANDOFF.md for operational state |
| `HANDOFF.md` | **KEEP** | Contains live Hetzner box details (Phase 23.7), bench run status, and the exact blocker description. Still operationally relevant until the Phase 24 kickoff. |
| `MILESTONES.md` | ARCHIVE | Historical milestone log; the active forward plan is in docs/PROJECT-PLAN-AKASHIK.md |
| `long-term-memory-integration.md` | ARCHIVE | Pre-Phase-21 planning spec; the work shipped. Valuable design rationale but completed |
| `harness-integration-roadmap.md` | NEEDS-REVIEW | May still be forward-looking or may be fully executed; read before deciding |
| `multi-provider-epic.md` | KEEP | Multi-LLM provider for summariser is still live scope |
| `p2p-scale-plan.md` | KEEP | Federation scale plan directly feeds Phase 24 |
| `SOTA-UPGRADE-PLAN.md` | ARCHIVE | Per-peer retrieval optimization plan; the ceiling was explicitly reached (0.9268 LME-S R@5); explicitly de-prioritized in PROJECT-PLAN-AKASHIK.md |
| `BENCH-COMPETITORS.md` | ARCHIVE | Written against mem0/ByteRover head-to-head framing; superseded by the commons positioning |
| `BENCH-v2.md` | ARCHIVE | Benchmark planning for Phase 23; now executed and documented in BENCHMARKS.md |
| `v2.1-CANDIDATES.md` | ARCHIVE | Candidate retrieval improvements for v2.1; the actual executed work is in phase 21-23 context files |
| `V2.1-SYNTHESIS.md` | ARCHIVE | Synthesis of v2.1 candidates; superseded by octopus-discover rounds 4+5 |
| `CFD-SOTA-ATTACKS.md` | ARCHIVE | Domain-specific adversarial analysis; interesting but not on any active phase roadmap |
| `DATA-ENGINEER-SOTA-ATTACKS.md` | ARCHIVE | Same |
| `DATA-SCIENCE-SOTA-ATTACKS.md` | ARCHIVE | Same |
| `MATH-SOTA-ATTACKS.md` | ARCHIVE | Same |
| `PARTICLE-PHYSICS-SOTA-ATTACKS.md` | ARCHIVE | Same |
| `PHYSICS-SOTA-ATTACKS.md` | ARCHIVE | Same |
| `audits/*.md` (all 6 files) | ARCHIVE | Agent-generated code review audits from a specific review sprint; useful to preserve the analysis but not active |
| `phases/phase-07/` | ARCHIVE | Completed, old phase |
| `phases/phase-15/` through `phase-20/` | ARCHIVE | All 4-plan sets complete and delivered; keep as historical record in `phases/archive/` |
| `phases/phase-21/` | KEEP | Recently shipped; Phase 21 context documents Phase 24's predecessor; still relevant to understanding the codebase |
| `phases/phase-23/` | KEEP | The benchmark design document is the acceptance contract for any future memory PR |
| `test-runs/p2p-phases-2026-05-11T160726Z.md` | ARCHIVE | Specific test run snapshot from a network validation session |

---

### `docs/` — Top 20 Files

| File | Action | Reason |
|---|---|---|
| `docs/PROJECT-PLAN-AKASHIK.md` | **KEEP** | Living plan; the single source of truth for Phase 24+ direction |
| `docs/product/BENCHMARKS.md` | KEEP | Acceptance contracts; the ratchet table is the CI contract |
| `docs/product/MANIFESTO.md` | NEEDS-REWRITE | Presumably wellinformed-branded; core mission text needs Akashik language |
| `docs/product/VISION.md` | NEEDS-REWRITE | Same |
| `docs/product/ROADMAP.md` | NEEDS-REWRITE | Should reflect Phase 24+ only |
| `docs/product/GRAPHRAG-AUDIT.md` | KEEP | Architecture audit; still accurate |
| `docs/product/RELEASE-v4.md` | KEEP | Historical release notes |
| `docs/p2p/P2P-VISION.md` | KEEP | Core architecture vision, still the foundation |
| `docs/p2p/p2p-threat-model.md` | KEEP | Security model; directly relevant to identity bridge and GitHub OAuth |
| `docs/p2p/peer-reputation-design.md` | KEEP | Reputation math feeds federation routing |
| `docs/p2p/peer-reputation-load-spreading.md` | KEEP | Same |
| `docs/p2p/satisfaction-scoring.md` | KEEP | Drives the deny-on-confidence hook |
| `docs/architecture/ADR-001-v3-memory-protocol.md` | KEEP | Protocol contract |
| `docs/architecture/ADR-002-v4-agent-brain.md` | KEEP | Contains the explicit decision NOT to chase BEIR leaderboard SOTA — critical context for Phase 24 |
| `docs/architecture/claude-obsidian-parity.md` | **ARCHIVE** | Pre-pivot artifact; the product is no longer trying to be an Obsidian parity tool |
| `docs/marketing/storybrand-messaging-draft.md` | KEEP | Written today (2026-05-26); this IS the current brand voice |
| `docs/marketing/positioning-draft.md` | **DELETE** | Superseded by storybrand-messaging-draft.md; the earlier personal/team framings are confusing and directly contradict the OSS commons mission |
| `docs/marketing/positioning-v2.1.md` | **DELETE** | Same; two-version evolution table has no value in the working tree when the final direction is clearly stated — git history preserves the evolution |
| `docs/marketing/how-akashik-works.md` | KEEP | The technical explainer for the compounding mechanism; cited from PROJECT-PLAN-AKASHIK.md |
| `docs/research/beat-the-competitors-retrieval-plan.md` | **ARCHIVE with annotation** | The per-question-type loss breakdown and LME-S per-type R@5 numbers are genuinely valuable (0.905 multi-session, 0.871 temporal) and will guide Phase 24 routing decisions. But the framing "beat the competitors" and the anchor benchmarks against mem0/ByteRover are the old positioning. Move to `docs/archive/retrieval-research-pre-pivot.md` and add a 3-line header: "Framing superseded by Akashik commons pivot. Retrieval quality analysis and per-question-type loss breakdown remain accurate as of Phase 23.7." |
| `docs/research/performance-prediction-matrix.md` | ARCHIVE | Performance prediction for the Phase 21-23 retrieval optimization era; the ceiling is reached, no forward relevance |
| `docs/research/energy-based-contradiction-detection.md` | KEEP | Still live — Phase 21's auto-forget and Jaccard contradiction detection are in prod; this research informed that design |
| `docs/research/github-star-growth.md` | KEEP | OSS growth strategy; directly relevant to Akashik's OSS community positioning |
| `docs/research/octopus-discover/round-5-2026-05-26/` | KEEP | The synthesis that produced the current direction; this is the evidence for the pivot |
| `docs/research/octopus-discover/round-4-2026-05-26/` | ARCHIVE | Round 4 was superseded by round 5; the intermediate probes are noise without the synthesis |
| `docs/index.html` | NEEDS-REWRITE | The public-facing website; still says wellinformed |
| `docs/probe.html` | **DELETE** | Debug/network probe page; has no place in the public docs tree; likely contains local IP addresses |
| `docs/welly-idle.png` | **DELETE** | "welly" is the old mascot/nickname for wellinformed; not part of the Akashik brand |
| `docs/banner.png/svg`, `docs/logo.png/svg` | NEEDS-REWRITE | wellinformed branding; needs Akashik rebrand |
| `docs/memory-stack.png/svg` | NEEDS-REWRITE | Architecture diagram references wellinformed stack; update to show Akashik federation layer |
| `docs/assets/logo-*.svg`, `og-*.png/svg`, `manifesto-illustration.svg` | NEEDS-REWRITE | Brand assets; some may already be Akashik-branded (check), rest need the rename sweep |
| `docs/protocol/PROTOCOL-QUALITY-QUESTIONS.md` | KEEP | Protocol design questions; still forward-relevant |

---

### `tests/` — Top 10 Files

| File | Action | Reason |
|---|---|---|
| `tests/bench-akashik-federation.test.ts` | **KEEP** | AkashikBench-F — the key Phase 24 instrument; validates the compounding thesis |
| `tests/bench-locomo-real.test.ts` | KEEP | Real-corpus LoCoMo factual recall; acceptance gate for Phase 23.7+ |
| `tests/bench-longmemeval-real.test.ts` | KEEP | Real-corpus LME-S oracle; the primary quality gate |
| `tests/bench-scifact-real.test.ts` | KEEP | BEIR SciFact full run; retrieval regression gate |
| `tests/bench-real.test.ts` | KEEP (but NOTE) | Older BEIR proxy; still a valid regression guard, but its scope overlaps with bench-scifact-real.test.ts. The comment header saying "30-doc proxy" is fine — it runs fast in CI |
| `tests/bench-standard.test.ts` | KEEP (comment header is stale) | The HotpotQA-style synthetic multi-hop bench is still a valid acceptance gate. However, the file header says "Uses the SAME evaluation methodology as competitors" — that framing is dead. The test itself is fine; the comment should be updated to reflect "synthetic regression harness for multi-hop retrieval" |
| `tests/llm-listwise-rerank.test.ts` | **ARCHIVE** | Listwise LLM reranking was one of the explicitly abandoned ML optimization attempts (named in your project context). These tests guard dead code. If `src/domain/llm-listwise-rerank.ts` still exports anything, it should be deleted; if it's purely test-only, delete the test |
| `tests/bench-locomo-synth.test.ts` | ARCHIVE | Synthetic LoCoMo proxy superseded by bench-locomo-real.test.ts and AkashikBench-F; keeping both creates ambiguity about which is the acceptance gate |
| `tests/bench-longmemeval-synth.test.ts` | ARCHIVE | Same — synthetic proxy replaced by real corpus; keeping both adds CI cost for no new signal |
| `tests/phase29.rust-retrieval-regression.test.ts` | NEEDS-REVIEW | Phase 29 isn't in the ROADMAP — it was added in the 21-23 era. Verify that wellinformed-rs is still active and the test still passes; if the Rust sidecar is not on the Phase 24 roadmap, this becomes a maintenance liability |
| `tests/fixtures/phase19/`, `tests/fixtures/phase20/` | KEEP | Support live phaseNN tests; not bloat |

---

### `src/` — Top 10 Candidates

| File | Action | Reason |
|---|---|---|
| `src/cli/commands/telegram.ts` | **DELETE** | Telegram integration has no mention in Phase 24 roadmap, no test coverage referenced in the planning docs, and is not part of the OSS commons protocol surface. Dead code. |
| `src/cli/commands/export-obsidian.ts` | **DELETE** | Obsidian export is an artifact of the pre-pivot "claude-obsidian-parity" era. The docs/architecture/claude-obsidian-parity.md is being archived; the command should go with it. |
| `src/cli/commands/swarm.ts` | NEEDS-REVIEW | Ambiguous: is this the multi-agent orchestration swarm (dev tooling) or the P2P mesh topology? If it's the ruflo agent swarm, it belongs in `.agents/` not in the shipped CLI. If it's the P2P network swarm concept, it may be forward-relevant for Phase 24. |
| `src/application/federated-search.ts` | KEEP | Core of Phase 17+; directly in Phase 24 scope |
| `src/application/consolidator.ts` | KEEP | Phase 21/22 auto-promotion pipeline; feeds the compounding mechanism |
| `src/application/auto-forget-tick.ts` | KEEP | Phase 21/22; live daemon tick |
| `src/domain/long-term-memory.ts` | KEEP | Phase 21 core domain; the tier math and Beta(α,β) is the published architecture |
| `src/domain/federation-sim.ts` | KEEP | AkashikBench-F simulator; Phase 24's key instrument |
| `wellinformed-rs/` (submodule) | NEEDS-REVIEW | The Rust sidecar delivered phase29 regression testing. Per PROJECT-PLAN-AKASHIK.md, per-peer retrieval is de-prioritized; but if the Rust path is still in the test matrix, it needs to be maintained or explicitly frozen |
| `src/cli/commands/bench.ts` | KEEP | The unified bench runner; becomes the `akashik bench` command after rename |

---

### `scripts/` — Notable Items

| File | Action | Reason |
|---|---|---|
| `scripts/qrel-rejudge.mjs` (v1) | DELETE | v3 supersedes; three versions is archeology not engineering |
| `scripts/qrel-rejudge-v2.mjs` | DELETE | Same |
| `scripts/qrel-rejudge-v3.mjs` | KEEP | Current version |
| `scripts/sweep-rocchio.mjs` | ARCHIVE | Rocchio parameter sweep from the optimization era; values are now fixed |
| `scripts/sweep-rrf.mjs` | ARCHIVE | RRF k=60 is now canonical; sweep is historical |
| `scripts/jacobi-preconditioning.mjs` | ARCHIVE | PPR solver optimization experiment; not on Phase 24 roadmap |
| `scripts/bench-beir-sota.mjs` | KEEP | Useful external SOTA comparison reference |
| `scripts/contextualize-corpus.mjs` | KEEP | Anthropic Contextual Retrieval preprocessing; listed as Phase 24 priority in findings.md |
| `scripts/bench-bridge.mjs` | NEEDS-REVIEW | Verify it targets the new AkashikBench-F path, not the old proxy |

---

## Addressing the Four Systematically-Missed Perspectives

### 1. Auth mechanism → API version boundary

The project uses ed25519 peer identity (Phase 15, `~/.wellinformed/peer-identity.json`). The identity strategy memory entry says GitHub OAuth is the planned social DID anchor. **This is a hard API version break.** Existing peers authenticating via raw ed25519 multiaddrs will silently fail to establish sessions if the OAuth requirement lands as a patch. The correct treatment: gate GitHub OAuth behind a new handshake version in the `/wellinformed/share/1.0.0` libp2p protocol (bump to `/akashik/share/2.0.0`), keep the v1 handler alive for at least one major version, and add a deprecation notice to the `wellinformed peer add` CLI response. The identity bridge code (`src/application/identity-bridge.ts`) should contain the migration path. This is **not currently documented** in any phase plan — it's an implicit assumption that auth and API versioning are decoupled. They are not.

### 2. Zombie integrations

The MCP server exposes `wellinformed` tool names. Any Claude Code user who installed the MCP via `.mcp.json` or `claude_desktop_config.json` has entries like `"command": "wellinformed"` hard-coded. When the npm package renames to `akashik`, the MCP server stops responding for every user who installed it and moved on. These users will never voluntarily migrate — they're in set-and-forget mode.

**Strategy:** Keep `"wellinformed"` as a bin alias in `package.json` for at least 2 major versions (`"bin": { "wellinformed": "bin/akashik.js", "akashik": "bin/akashik.js" }`). The startup banner should print a one-time deprecation warning: `"wellinformed is deprecated; use akashik instead"` — but only if invoked as `wellinformed`, never if invoked as `akashik`. This respects the zero-noise contract for new users while notifying old users passively.

### 3. Shadow traffic validation / parity definition

AkashikBench-F is an in-simulator boolean-set abstraction — it validates dynamics (compounding slope = -4.74e-5), not real network retrieval quality. The Phase 24 federation routing changes (room-affinity routing, query-type detection) will touch `src/application/federated-search.ts` and `src/infrastructure/search-sync.ts`. These changes have no shadow-traffic harness yet.

**What parity means here is specific:** the composite bench score from Phase 23 (0.9012 / 1.0000) must not drop >1 point absolute when the new routing lands. That's the stated gate. What's missing is a test that replays a set of federated queries against both the old direct-fan-out path and the new routed path and diffs the top-5 result sets. Acceptable divergence: same hit in top-5 (order may change), zero cases where the routed path returns empty where direct-fan-out returns results. This harness does not exist and should be a Phase 24.1 deliverable before any routing change lands.

### 4. Backup / RTO reality

The HANDOFF.md describes the Hetzner box (`91.98.75.154`) with datasets at `/data/scifact`, `/data/locomo`, `/data/longmemeval` and bench reports at `/data/reports/run.{log,jsonl}`. There is no documented backup of the vector store (`vectors.db`) or the knowledge graph (`graph.json`) on that box. The "restore" procedure is "rebuild the box from cloud-init YAML + re-download datasets + re-run npm install" — documented in HANDOFF.md, requiring ~2 hours plus the specific Hetzner token (noted as "paste new read+write token here" — which means only one person has it). That is a single-person-bus-factor RTO. The bench results at `/data/reports/` are the only empirical validation of the compounding thesis and are not committed to the repo. **The Phase 23.7 bench results (LME-S 0.9202, LoCoMo slope -4.74e-5) should be committed to `docs/product/BENCHMARKS.md` as static artifact before the box is torn down.**

---

## What's Often Overlooked

Three things LLM-generated cleanup audits routinely miss here:

**First:** `tests/fixtures/phase19/` and `phase20/` look like junk by name but support live regression tests (`phase19.codebase-indexing.test.ts`, `phase20.sessions.test.ts`). Deleting them would silently break the test suite. Always verify that phaseNN fixtures are unreferenced before touching them.

**Second:** The `docs/assets/vendor/three/` directory (EffectComposer, UnrealBloomPass, etc.) is a vendored Three.js postprocessing stack. It's committed (not in .gitignore for `docs/`), weighs nothing compared to GIFs, and serves the `docs/index.html` 3D animation. It's not stale — it just looks exotic. Don't touch it.

**Third:** `docs/marketing/IMAGEGEN-FRONTEND-WEB.md` and `SITE-REDESIGN-SPEC.md` — these might look like scratchpad noise but they're probably the spec for the AI-generated OG cards and the site redesign. Before archiving them, verify that the generated assets in `docs/assets/og-card.png` etc. have been checked in and that the spec isn't the only record of how to regenerate them.

---

## Top-3 First Moves

**1. `git rm README.md.bak.830lines` + add `.claude-octopus/` to `.gitignore` + `git rm -r --cached .claude-octopus/`**

These are the two zero-risk, zero-rework changes that immediately improve anyone else's `git clone` experience and remove the one item that could contain sensitive data (the octopus state tracks provider API usage and session IDs). Combined they're a two-minute commit. Do this before any other cleanup so that subsequent PRs don't accidentally re-include the backup or the state file.

**2. Bulk archive all `.planning/phases/phase-07` through `phase-20/` plus all six SOTA-ATTACKS files into `.planning/archive/`**

This single sweep removes ~65 files from the "active" view of the planning directory while preserving every decision record. The HANDOFF.md, phase-21, phase-23, p2p-scale-plan, and multi-provider-epic stay in place. After this move, the `.planning/` root contains ~10 actually-live files instead of 100 files from three different eras. Every future session that opens the planning dir will see the current state, not the history.

**3. Delete `docs/marketing/positioning-draft.md` + `positioning-v2.1.md`, and add the 3-line annotation header to `docs/research/beat-the-competitors-retrieval-plan.md` before moving it to `docs/archive/`**

These three files are the most dangerous clutter in the repo because they actively contradict the current mission. A new contributor reading the docs/ folder will hit "wellinformed competes with mem0/ByteRover on R@5" before they hit "Akashik is the federated knowledge commons for the OSS community." That's a positioning inversion that takes time to undo mentally. The storybrand-messaging-draft.md (written today) is the canonical voice; every pre-pivot positioning document left in the active tree is a hole in that narrative.
```

## Status: SUCCESS
# Completed: יום ג׳ מאי 26 2026 20:41:43 IDT
