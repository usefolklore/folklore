# Phase 26: Docs & Benchmarks - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

<domain>
## Phase Boundary
Honest, polished docs for launch: a BENCHMARKS page presenting the real measured numbers; extended/indexed RFCs; an org-profile README for the usefolklore GitHub org. Documentation only — no source/runtime changes, build stays green.
</domain>

<decisions>
## Implementation Decisions
### Claude's Discretion
Doc-content phase — choices at Claude's discretion. Hard constraints: numbers must be HONEST and match what's in the repo/bench (BEIR SciFact Wave-2 hybrid 72.30% NDCG@10; the 0.7522 figure used on the site is the same SciFact number rounded — reconcile and present consistently with method + repro commands pointing at bench/; document Wave-3 reranker regression −1.92 and Wave-4 routing null as honest failures; FolkloreBench-F federation 17%→1% is a SIMULATOR figure, label it so). Do not invent metrics. Keep folk-pop brand voice where user-facing. No source changes; build green. No claude/anthropic git co-authors. Respect blocked-on-user items.
</decisions>

<code_context>
## Existing Code Insights
- Benchmarks live in bench/ (consolidated in Phase 25) with bench/README.md repro index.
- docs/product/BENCHMARKS.md exists; docs/architecture/RETRIEVAL-MODULES.md has the measured ceilings; MILESTONES.md v2.0 section has the 4-wave table.
- RFCs at docs/rfc/ (RFC-0001 done + index). Site benchmark numbers in site/index.html (proof section).
</code_context>

<specifics>
## Specific Ideas
Mirror akashikprotocol's clean docs surface. Org-profile README belongs at a path for the usefolklore/.github repo (e.g. docs/brand/org-profile.md or .github/profile/README.md staged copy) since the org isn't created yet (blocked on user).
</specifics>

<deferred>
## Deferred Ideas
Physical push to usefolklore/.github (blocked on org creation). Higgsfield-animated benchmark charts (blocked on credits).
</deferred>
