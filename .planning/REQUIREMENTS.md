# Requirements: Folklore — v3.0 Folklore Launch

**Defined:** 2026-06-15
**Core Value:** Your coding agent answers from your actual research and codebase, not its training data.

## v3.0 Requirements

Requirements for the public launch milestone. Each maps to a roadmap phase (continues from Phase 24).

### Cleanup (model + repo cruft)

- [x] **CLEAN-01**: ruflo / claude-flow / RuFlo-V3 sections removed from CLAUDE.md, leaving only Folklore's own config
- [x] **CLEAN-02**: claude-flow `.claude/` hooks and skills not used by Folklore removed; Folklore's own hooks kept and documented
- [x] **CLEAN-03**: claude-flow MCP / swarm / hive-mind references removed from config and docs
- [x] **CLEAN-04**: ML/embedding + retrieval code organized into a clean, documented module layout (embedders, hybrid retrieval pipeline)
- [x] **CLEAN-05**: benchmark code (FolkloreBench-F, BEIR/LoCoMo/LongMemEval) consolidated under a documented `bench/` structure with reproduction commands
- [x] **CLEAN-06**: 3-tier model-routing config cleaned and documented (or removed if unused)

### Repository structure

- [x] **REPO-01**: repo reorganized into a well-thought, akashikprotocol-clean layout (src domains, docs, tests, spec, site, examples)
- [x] **REPO-02**: build stays green and full test suite passes after restructure (no regressions)
- [x] **REPO-03**: org-ready repo boundaries defined (folklore core+cli, spec, site, .github org profile) with a documented split plan

### Docs

- [x] **DOCS-01**: BENCHMARKS page presents real numbers (BEIR SciFact NDCG, Wave-2 hybrid, FolkloreBench-F 17%→1%) with method + repro
- [x] **DOCS-02**: RFC set extended as needed (RFC-0002+) and RFC index current
- [x] **DOCS-03**: org profile README authored (`.github/profile`) for the usefolklore org landing

### Site

- [ ] **SITE-01**: composition pass + mobile responsive sweep across all sections (no overflow, clean stacking at 390px)
- [x] **SITE-02**: Guidebook section added (how Folklore works / get started)
- [ ] **SITE-03**: Platform Culture section added (the lore, the commons, the folk)
- [ ] **SITE-04**: real Store section (merch products + $LORE), structured for live products
- [ ] **SITE-05**: Cloudflare Pages deploy config verified buildable (`wrangler.toml`, `_headers`); deploy itself blocked on user auth/domain

### Merch

- [ ] **MERCH-01**: real product designs/mockups (tee, stickers, pin) derived from the folk art, wired into the Store

### Agent

- [ ] **AGENT-01**: autonomous Twitter meme-agent scaffold — pipeline that generates a folk-pop meme, posts to X, and appends it to the site `/store` (runnable once X creds exist)
- [ ] **AGENT-02**: site `/store` (or memes) integration consuming agent output (data file the site reads)

## Out of Scope (this milestone)

| Feature | Reason |
|---------|--------|
| higgsfield art animation (img→video) | Blocked: free credits exhausted, needs top-up |
| GitHub org `usefolklore` creation | Blocked: GitHub has no API for free-org creation; user action |
| Cloudflare auth + usefolklore.com domain | Blocked: user account/purchase |
| $LORE token launch on bags.fm | Blocked: user action; site wires real link after |
| Live X posting | Blocked: needs X API credentials; agent scaffolded only |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CLEAN-01 | Phase 25 | Complete |
| CLEAN-02 | Phase 25 | Complete |
| CLEAN-03 | Phase 25 | Complete |
| CLEAN-04 | Phase 25 | Complete |
| CLEAN-05 | Phase 25 | Complete |
| CLEAN-06 | Phase 25 | Complete |
| REPO-01 | Phase 25 | Complete |
| REPO-02 | Phase 25 | Complete |
| REPO-03 | Phase 25 | Complete |
| DOCS-01 | Phase 26 | Complete |
| DOCS-02 | Phase 26 | Complete |
| DOCS-03 | Phase 26 | Complete |
| SITE-01 | Phase 27 | Pending |
| SITE-02 | Phase 27 | Complete |
| SITE-03 | Phase 27 | Pending |
| SITE-04 | Phase 27 | Pending |
| SITE-05 | Phase 27 | Pending |
| MERCH-01 | Phase 28 | Pending |
| AGENT-01 | Phase 28 | Pending |
| AGENT-02 | Phase 28 | Pending |

**Coverage:** 20/20 v3.0 requirements mapped ✓ — no orphans, no duplicates.

---
*Requirements defined: 2026-06-15 · Traceability populated 2026-06-15 during v3.0 roadmap creation*
