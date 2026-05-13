# claude-obsidian Parity Audit

Source: **AgriciDaniel/claude-obsidian** @ commit 2026-04-16 (1,417 stars). Karpathy LLM-wiki pattern. 10 skills, single-user single-vault.

## What they have, we don't

| Their capability | Our equivalent | Gap |
|---|---|---|
| **Hot cache** (`wiki/hot.md`, ~500w recency digest regenerated after every ingest + session end) | `recent_sessions` MCP tool (reads session transcripts) | **No unified digest** — user must query per-session. Claude-obsidian produces one cached blob Claude can grab at session start with ~1 read. |
| **Wiki-lint** (orphans / dead links / stale claims / missing pages / missing xrefs / frontmatter gaps / empty sections / stale index) | none | **Full gap.** We have no graph-health tool. Orphan nodes in shared rooms is a real hygiene bug we can't currently surface. |
| **Save-as-synthesis** (`/save` turns current conversation into a typed wiki note: synthesis/concept/source/decision) | Sessions auto-ingest (raw transcript → nodes) | **Missing the typed synthesis step.** We capture the raw conversation, but not the "here's the distilled answer as a permanent concept/synthesis node." |
| **Autoresearch program.md** (user-configurable research objectives: source prefs, confidence scoring, domain constraints, stop conditions) | `discover-loop` | **Missing the `program.md`.** Our loop is hard-coded in logic; theirs is config-driven per project/room. |
| **Obsidian-native vault output** (wikilinks `[[Name]]`, frontmatter properties, callouts, dataview dashboards) | `export-obsidian` command | **Partial.** We export plain markdown but not wikilinks, frontmatter properties, or dataview blocks — Obsidian's graph view and Dataview can't query what we emit. |
| **Visual canvas** (`claude-canvas` companion, mind-map topology) | `dashboard` web view (vis.js) | **Different UX.** Ours is a standalone webpage, theirs integrates with Obsidian Canvas. |
| **Skill trigger vocabulary** (rich frontmatter trigger phrases: "ingest this url", "what do you know about", "/save", "find orphans", …) | `.claude/skills/wellinformed/SKILL.md` has 7 triggers | **Minor.** Our skill is wired but the vocabulary is narrow; natural-sounding phrases like "save this to wellinformed" don't activate. |

## What we have, they don't

| Our capability | Their equivalent | Comment |
|---|---|---|
| **P2P federation** (libp2p + Y.js CRDT + `touch` asymmetric pull, 16 MCP tools) | none | They're single-vault. We federate. |
| **Vector + BM25 hybrid retrieval** (bge-base 768-dim, SciFact NDCG@10 = 75.22%) | Claude LLM reading files on demand | They substitute retrieval with LLM-read-files. Ours measures +11 NDCG over their approach on hard benchmarks. |
| **Scheduled daemon** (periodic source fetches, auto-reindex, auto-trigger) | manual `/wiki` invocations | They're pull-only, we push. |
| **23 typed source adapters** (ArXiv, HN, RSS, GitHub Trending, npm deps, codebases, sessions, Telegram) | drop-a-file-in-`.raw/` | Ours is structured, theirs is freeform. |
| **Rust inference sidecar** (fastembed-rs subprocess, +3.4x throughput) | none | Performance floor is different. |
| **Security posture** (secret-gate, remote-node-validator, P2P threat model) | none | They have no network surface; we do. |
| **Codebase-graph subsystem** (tree-sitter TS/JS/Python + `code_graph_query` MCP tool) | none | |

## Recommendations

Ranked by leverage / cost ratio:

### 1. Hot cache (HIGH leverage, LOW cost — ship first)

**Add:** `wellinformed/hot-cache` — a new domain concept. After each tick, generate a ~500-word summary of: (a) newest N nodes, (b) most-queried rooms this session, (c) pending ingests, (d) 3-5 most surprising cross-references. Store at `~/.wellinformed/hot.md` and include in SessionStart hook output.

**Why:** Session continuity is the single biggest daily UX improvement. Today Claude walks into a wellinformed session with no context. With a hot cache, the first thing Claude reads is an actionable recency digest.

**Files:** `src/domain/hot-cache.ts` (pure summariser), `src/application/hot-cache-tick.ts` (integration with daemon loop). Est. 2h including tests.

### 2. Lint command (HIGH leverage, MEDIUM cost)

**Add:** `wellinformed lint [--room R] [--fix]` — graph-health checker with the 8 categories from claude-obsidian's wiki-lint, plus P2P-specific ones (orphaned remote nodes, stale shared-room manifest, secret-pattern drift since last audit).

**Why:** We ship shared rooms with zero hygiene checks. A user's public room could have dangling node references, stale source URIs, or drifted frontmatter and nobody would know. Lint catches it before other peers touch it.

**Files:** `src/domain/graph-lint.ts` (rules), `src/application/lint.ts`, `src/cli/commands/lint.ts`. Est. 3-4h.

### 3. Save-as-synthesis (MEDIUM leverage, LOW cost)

**Add:** `wellinformed save --room R` — called from a Claude session, takes the last N assistant messages + the user question, produces a typed node (synthesis/concept/decision), writes into the chosen room. Complements auto-ingest by capturing *distillations*, not transcripts.

**Why:** Today sessions auto-ingest raw chat. Users who want to preserve the *answer* (not the journey to the answer) have no first-class path.

**Files:** `src/cli/commands/save.ts` + new SourceKind in `sources.ts`. Est. 2h.

### 4. Autoresearch `program.md` (MEDIUM leverage, MEDIUM cost)

**Add:** `~/.wellinformed/research-program.md` — a YAML+markdown config read by `discover-loop` to parameterise source preferences, min-confidence gate, round depth, stop conditions. Mirrors claude-obsidian's `program.md`.

**Why:** Our discover-loop is currently one-size-fits-all. Users with specific research domains (biomedical, legal, security) want to constrain source types and confidence thresholds per project.

**Files:** extend `src/application/discover-loop.ts` to read the program file, docs update. Est. 3h.

### 5. Obsidian-native export (LOW leverage, LOW cost)

**Add:** Upgrade `export-obsidian` to emit frontmatter properties + wikilinks + embedded dataview blocks, so the exported vault is a first-class Obsidian experience (graph view, dataview dashboards, backlinks).

**Why:** Our current export is a data dump, not a usable vault. Small lift, unlocks the existing `export-obsidian` flow properly.

**Files:** `src/application/export-obsidian.ts`. Est. 2h.

### 6. Canvas integration (DEFER to v2.2)

Nice-to-have. Our web dashboard already covers the "visual view" gap adequately for v2.x.

### 7. Trigger vocabulary polish (CHEAP but not urgent)

**Add:** Expand `.claude/skills/wellinformed/SKILL.md` frontmatter to include trigger phrases matching claude-obsidian's voice: "save this to X", "ingest this url", "what do you know about", "find orphans", etc.

Est. 20 min.

## Overall read

claude-obsidian is a **strong thin-client** over Claude's native file-reading + writing abilities. They're ahead on skill vocabulary and knowledge hygiene (hot cache + lint). We're ahead on retrieval quality, source diversity, and multi-user federation.

Porting their hot cache and lint into wellinformed closes the two biggest UX gaps with ~5 hours of work. That gets us parity on session continuity and graph hygiene while keeping all our structural advantages (vectors, P2P, adapters, Rust). No need to fork — we cherry-pick the two patterns that are worth owning.

Do **not** migrate to the vault-as-source-of-truth model. Their strength (plaintext everywhere) is our explicit weakness case — retrieval quality drops by 10+ NDCG when you replace vectors with text file grep.
