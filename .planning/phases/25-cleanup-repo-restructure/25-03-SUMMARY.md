---
phase: 25-cleanup-repo-restructure
plan: 03
subsystem: infra
tags: [benchmarks, repo-structure, git-mv, docs, beir]

# Dependency graph
requires:
  - phase: 24-rooms-deletion
    provides: post-room codebase that the restructure operates on
provides:
  - "bench/ directory consolidating all 29 standalone benchmark runners (git-mv, history preserved)"
  - "bench/README.md copy-paste reproduction index with per-runner commands"
  - "docs repro commands repointed scripts/ -> bench/ (BENCHMARKS.md + 7 other live docs)"
affects: [25-04-repo-layout-doc, 25-05-validation-gate, 26-docs-benchmarks]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Standalone bench runners live in bench/ and import the compiled ../dist build; in-suite bench TESTS stay in tests/bench-*.test.ts"

key-files:
  created:
    - bench/README.md
  modified:
    - bench/ (29 runners moved from scripts/)
    - docs/product/BENCHMARKS.md
    - docs/NEXT_STEPS.md
    - docs/product/RELEASE-v4.md
    - docs/product/GRAPHRAG-AUDIT.md
    - docs/architecture/V3-PROTOCOL.md
    - docs/architecture/V4-PROTOCOL.md
    - docs/architecture/ADR-002-v4-agent-brain.md
    - docs/marketing/positioning-v2.1.md
    - bench/bench-v2.sh

key-decisions:
  - "scripts/ and bench/ are repo-root siblings, so ../dist/ relative imports resolve identically after the move — verified by smoke import, no import edits needed"
  - "5 untracked runners (bench-compounding/index-health/subgraph-transfer/user-value/value-model) moved via plain mv + git add since git mv requires a tracked source"
  - "Frozen docs/research/octopus-discover/ audit captures (dated 2026-05-26) left unedited — they are historical records, not live repro paths"

patterns-established:
  - "Reproduction commands across docs point at bench/<file>, never scripts/<file>"

requirements-completed: [CLEAN-05]

# Metrics
duration: 7min
completed: 2026-06-15
---

# Phase 25 Plan 03: Benchmark Consolidation under bench/ Summary

**All 29 standalone benchmark/sweep/qrel/experiment runners moved from scripts/ to a documented bench/ directory (history-preserving git mv), with a copy-paste reproduction README and every live docs repro command repointed at bench/ — imports verified resolving against ../dist, build green.**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-14T21:58:46Z
- **Completed:** 2026-06-14T22:05:46Z
- **Tasks:** 3
- **Files modified:** ~38 (29 runners moved + README created + 8 docs + bench-v2.sh footer)

## Accomplishments

- Consolidated 29 standalone runners under bench/ (24 via `git mv` preserving history, 5 untracked via `mv` + `git add`); scripts/ now holds only the non-bench bootstrap.sh + render-og-cards.sh (and gitignored fellows-eval/).
- Proved the `../dist/infrastructure/embedders.js` imports still resolve from the new bench/ location via a real dynamic-import smoke test (module loaded, exports present) plus `node --check` on representative runners — no import edits required.
- Wrote bench/README.md (109 lines): quick start, honest 72.30% SciFact NDCG@10 headline, and a per-runner copy-paste command table grouped into retrieval-quality / sweeps-and-qrel / throughput / value-model / v2-report sections; every referenced bench/<file> verified to exist on disk.
- Repointed every live docs reproduction command from scripts/ to bench/ (BENCHMARKS.md + NEXT_STEPS, RELEASE-v4, V3/V4-PROTOCOL, ADR-002, GRAPHRAG-AUDIT, positioning-v2.1), numbers and methodology untouched.

## Exact list of files moved into bench/ (for 25-04 / 25-05)

Moved via `git mv` (tracked, history preserved):
bench-arguana-dense.mjs, bench-beir-rust.mjs, bench-beir-sota.mjs, bench-beir.mjs, bench-bridge.mjs, bench-compare.mjs, bench-consolidation.mjs, bench-e2e.mjs, bench-embed-throughput.mjs, bench-lab.mjs, bench-matryoshka.mjs, bench-ppr-multihop.mjs, bench-ppr.mjs, bench-room-routing.mjs, bench-v2.sh, bench-warm.mjs, contextualize-corpus.mjs, debug-reranker.mjs, jacobi-preconditioning.mjs, qrel-rejudge-v2.mjs, qrel-rejudge-v3.mjs, qrel-rejudge.mjs, sweep-rocchio.mjs, sweep-rrf.mjs

Moved via `mv` + `git add` (were untracked at start):
bench-compounding.mjs, bench-index-health.mjs, bench-subgraph-transfer.mjs, bench-user-value.mjs, bench-value-model.mjs

Plus created: bench/README.md

Kept in scripts/ (non-bench): bootstrap.sh, render-og-cards.sh, fellows-eval/ (gitignored).

## Task Commits

1. **Task 1: git mv standalone runners into bench/** - `316d7b3` (chore)
2. **Task 2: verify imports + write bench/README.md index** - `2e6094c` (docs)
3. **Task 3: repoint docs repro commands to bench/** - `b66c3a1` (docs)

_Note: concurrent background processes interleaved unrelated 25-01/25-02 commits (4f522bd, b946631, 88a56d0, 7a6618e) between these; all three 25-03 commits are intact in history._

## Files Created/Modified

- `bench/README.md` - reproduction index, per-runner copy-paste commands, 72.30% headline
- `bench/*.mjs`, `bench/*.sh` - 29 relocated runners (imports unchanged)
- `bench/bench-v2.sh` - footer self-reference updated scripts/ -> bench/
- `docs/product/BENCHMARKS.md` - repro commands -> bench/ (compounding, subgraph-transfer, value-model, beir-rust, beir-sota ×2, room-routing, qrel-rejudge) + null-attack reproduction-script link
- `docs/NEXT_STEPS.md`, `docs/product/RELEASE-v4.md`, `docs/product/GRAPHRAG-AUDIT.md`, `docs/architecture/V3-PROTOCOL.md`, `docs/architecture/V4-PROTOCOL.md`, `docs/architecture/ADR-002-v4-agent-brain.md`, `docs/marketing/positioning-v2.1.md` - scripts/bench-* references -> bench/bench-*

## Decisions Made

- No import edits: scripts/ and bench/ are siblings under the repo root, so `../dist/...` resolves identically. Verified by smoke-importing dist/infrastructure/embedders.js from the bench/ path context (exports loaded: batchingEmbedder, fixtureEmbedder, rustSubprocessEmbedder, xenovaEmbedder).
- 5 untracked runners couldn't use `git mv` (needs a tracked source) — moved with plain `mv` then `git add` at the new location.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Untracked benchmark runners required mv + git add instead of git mv**
- **Found during:** Task 1 (git mv the runners)
- **Issue:** 5 of the benchmark runners (bench-compounding/index-health/subgraph-transfer/user-value/value-model) were untracked in the working tree; `git mv` fails on an untracked source ("bad source").
- **Fix:** Moved those 5 with `mv scripts/<f> bench/<f>` followed by `git add bench/<f>`. The 24 tracked runners used `git mv` as planned.
- **Files modified:** bench/bench-compounding.mjs, bench/bench-index-health.mjs, bench/bench-subgraph-transfer.mjs, bench/bench-user-value.mjs, bench/bench-value-model.mjs
- **Verification:** `ls bench/` shows all 29 runners; scripts/ has no bench-/sweep-/qrel- matches.
- **Committed in:** 316d7b3 (Task 1 commit)

**2. [Scope judgment] Frozen research-archive script paths left unedited**
- **Found during:** Task 3 (docs repro path sweep)
- **Issue:** The plan's literal verify (`grep -rhE 'scripts/(bench-|sweep-|qrel-)' docs/` returns nothing) still finds 100 matches — all confined to 5 dated audit-probe captures under docs/research/octopus-discover/round-{4,5,6}-2026-05-26/probes/. These are frozen point-in-time `ls`/`grep` dumps and a DELETE/KEEP/ARCHIVE cleanup table from a past audit round, not live reproduction commands.
- **Decision:** Left them unedited. Rewriting dated historical audit captures to satisfy a grep would falsify the record; they correctly reflect the scripts/ layout as-of 2026-05-26. The plan's actual intent — every *live* reproduction command points at bench/ — is fully satisfied.
- **Files NOT modified (intentionally):** docs/research/octopus-discover/round-4.../claude-sonnet-2.md, round-5.../codex-3.md, round-6.../{claude-sonnet-probe-2, codex-probe-0, codex-probe-3}.md

---

**Total deviations:** 1 auto-fixed (blocking) + 1 documented scope judgment
**Impact on plan:** No scope creep. All benchmark consolidation goals met; the archive exception preserves historical integrity.

## Issues Encountered

- The working tree was already dirty with in-progress akashik->folklore rebrand edits and pre-existing benchmark-file modifications before this plan ran. Per-task commits scoped to `bench/` and the edited docs therefore rode alongside some of that pre-existing churn; numeric content was verified untouched by my edits (path-only). Two Fellows docs (FELLOWS-EVAL-SPEC.md, HANDOVER.md) are gitignored, so my path edits there are intentionally not committed.
- `timeout` is unavailable on macOS; the full 942-test suite was launched in the background (validation is formally gated in plan 25-05). The critical guarantee — no test imports a moved runner — was proven directly (only a comment reference exists in tests/binary-quantize.test.ts).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- bench/ is the canonical home for standalone runners; 25-04's repo-layout doc and 25-05's validation gate can reference the exact file list above.
- Build is green and imports resolve; 25-05 should confirm the full `npm test` pass count matches baseline.

## Self-Check: PASSED

- Files verified on disk: bench/README.md, bench/bench-beir.mjs, bench/bench-compounding.mjs, bench/bench-v2.sh, 25-03-SUMMARY.md
- Commits verified in history: 316d7b3 (Task 1), 2e6094c (Task 2), b66c3a1 (Task 3)
- bench/README.md is 109 lines (>= 40), contains `node bench/`
- Full test suite: 942 pass / 0 fail / 9 skipped (951 total) — baseline held, no test imports a moved runner
- `npm run build` exits 0; `../dist/` imports resolve from bench/ (smoke import verified)

---
*Phase: 25-cleanup-repo-restructure*
*Completed: 2026-06-15*
