# Folklore — a skeptical senior dev's adoption review

Evaluating Folklore as a daily-driver memory/research layer for my coding
agent. Lens: integrator/operator, not author. Evidence is cited to
`file:line` in this repo at branch `main`. No cheerleading; the goal is to
find what bites me at 2am, six months in.

Severity legend: **blocker** (won't adopt until fixed) · **major** (adopt
with a mitigation + a ticket) · **minor** (annoyance, ship anyway).

---

## 1. The shipped deny-gate is effectively inert — the "moat" doesn't fire. **major**

**Why it matters to a dev.** The entire pitch is "answers before the web,
denies the redundant call." If the deny path almost never triggers, I'm
carrying the *cost* of the gate (a prefetch subprocess on every outbound
call) without the *benefit* (skipped web trips). I need to know whether the
flagship behavior actually does anything before I wire it into my flow.

**What the repo says.** The hook's deny requires `action === 'use_memory'`
(`.claude/hooks/folklore-smart-hook.cjs:337-343`). That decision is gated by
a **fixed** 0.85 breakpoint in the domain layer
(`src/domain/peer-telemetry.ts:736-740, 772-773`), *and* demoted to
`verify_one_source` whenever fewer than 4 of 5 satisfaction components are
observed (`peer-telemetry.ts:770-773`). On a pure-local graph, `consensus`
is a carve-out and `signature` is usually unobservable on a standalone node
— so a typical local hit observes ≤3 components and is demoted out of
`use_memory` *regardless of score*. The project's own bench says this
plainly: "`FOLKLORE_DENY_THRESHOLD` alone is **inert** on the shipped gate —
the `action === 'use_memory'` condition gates it shut first"
(`bench/bench-deny-sweep.mjs:20-23`), and Variant A (the shipped gate)
measured "≤8% true-deny in every cell" (`docs/BENCHMARKS-RESULTS.md:71`).

**The honest read:** the deny gate is tuned so conservatively that, alone, it
rarely denies — which is defensible safety-wise but means the headline
behavior is mostly aspirational on a solo install. The 42%/84% true-deny
numbers that look good are **Variant B (score-only)**, which is explicitly
"recommend-only — no `src/`/`.claude/` edits" (`BENCHMARKS-RESULTS.md:71`),
i.e. *not shipped*. Adopt knowing the gate's day-one value is the injected
*context*, not the deny.

## 2. `FOLKLORE_DENY_THRESHOLD` is a foot-gun, not a knob. **major**

**Why it matters.** The README sells threshold tuning as the escape valve
(`README.md:130-136`). If turning the knob does nothing in the regime I'm in
and everything in a regime I can't see, I'll mis-tune it and either get no
denies or get silently wrong answers.

**What the repo says.** Per §1, below the fixed 0.85 `use_memory`
breakpoint the threshold is inert; the `bench-deny-sweep` header calls this
out directly (`bench-deny-sweep.mjs:20-23, 198-201`). So the knob only has
range *above* 0.85, where the score rarely lands on a shallow local graph
anyway. Lowering it (0.70) does nothing on the shipped gate; the only thing
that actually moved false-deny in the validate run was a hard distance
pre-filter `d≤1.05`, "not the score" (`BENCHMARKS-RESULTS.md:71`). A knob
whose effect is confounded by two upstream gates is a knob I will get wrong.
The real tunables that bite are undocumented in the README table:
`FOLKLORE_HIT_THRESHOLD` (1.05) and `FOLKLORE_GAP_MIN` (0.02) in
`folklore-smart-hook.cjs:48-49`, with a comment admitting the cap must be
hand-raised "if the corpus shifts (larger graph = more aggressive noise
floor)" — i.e. the relevance filter is corpus-size-sensitive and there's no
auto-calibration.

## 3. False-deny cost in a live debugging session is real and the escape hatch is clumsy. **major**

**Why it matters.** When I'm debugging a fast-moving dep (say a CVE patch or
a breaking change in a library released last week), a false-deny — graph
says "I've got it" with a 3-day-old cached answer — sends me down a stale
path and I may not notice until I've burned 20 minutes.

**What the repo says.** There *is* layered defense here, to be fair:
`classifyRisk` (`peer-telemetry.ts:686-699`) forces `elevated`/`high`-risk
queries (version/upgrade/CVE/auth/crypto) up to `verify_one_source` or
`search_required` even at a high score (`peer-telemetry.ts:786-794`). That's
genuinely good design and directly addresses the worst false-deny case. But
it's keyword-driven, so anything that doesn't match the regex (a library
name, a symbol, an error string with no "upgrade/version/CVE" token) gets no
freshness protection beyond the 14-day stale window
(`peer-telemetry.ts:216`). **Escape hatch:** the only documented override is
`FOLKLORE_DENY_WEBSEARCH=0` (`folklore-smart-hook.cjs:348`), an *env var* —
I'd have to restart my agent session with a changed env to defeat a single
bad deny, then remember to flip it back. There is no per-call "no really,
search anyway" affordance. In practice I'd just run with the deny off, which
loops back to §1.

## 4. Hooks fail silently by design — and the engine-resolver bug proves the failure mode is invisible. **major**

**Why it matters.** "Fail closed, exit 0, no output" (`.claude/README.md:14`)
means a broken Folklore is indistinguishable from a working-but-quiet one. I
won't know my memory layer is dead; I'll just quietly be back to web-every-time
while believing I'm compounding.

**What the repo says.** Commit `1f53b25` is the tell: *all four hooks* called
`folklore` on PATH directly, so with no global install "every prefetch, deny,
auto-save and MCP-pre call silently failed" — the harness fired the hooks but
the engine was never reached. That shipped and went unnoticed because the
contract is to swallow errors (`folklore-smart-hook.cjs:91, 143-145`;
`folklore-post-fetch.cjs:110`). The fix added a dist fallback
(`folklore-smart-hook.cjs:109-117`), but the *class* of bug is intact:
`prefetch()` returns `null` on any throw and the hook emits "binary
unavailable or timed out" (`folklore-smart-hook.cjs:289-293`) — a single line
that looks identical whether the binary is missing, the 4.5s timeout
(`:29`) blew, or the graph query errored. **What else fails silently:** the
PostToolUse auto-save spawns detached with `stdio: [pipe, ignore, ignore]`
and resolves on *any* close including non-zero
(`folklore-post-fetch.cjs:82-93`) — if `save` fails, the "next session hits
the graph" promise silently breaks and nothing tells me. There's a
`miss-log.jsonl` but no *error*-log; I'd need to manually run `folklore ask`
to discover the engine is broken. **Mitigation that should exist:** a
`folklore doctor` that exercises the real hook path and asserts a non-empty
result.

## 5. Concurrent-access correctness: reads don't take the lock; cache can serve a torn view across processes. **major**

**Why it matters.** The daemon holds the write lock for its whole lifetime
(`process-lock.ts:9-11`), and my agent's hooks shell out to a *second*
`folklore` process (`prefetch` via `execFileSync`,
`folklore-smart-hook.cjs:124`) while the daemon may be mid-ingest. I need the
reader to see a consistent graph.

**What the repo says.** Graph writes are atomic via tmp+rename
(`graph-repository.ts:97-116`, `atomic-write.ts:17-22`) — good, a reader sees
old-or-new, never torn. But `load()` does **not** acquire the process lock
(`graph-repository.ts:63-95`); the lock is only taken by mutating CLI
commands and the daemon (`process-lock.ts:5-11`). The in-memory cache
comment claims "In-process only — the cross-process write lock guarantees no
other process is mutating the file while ours holds the lock"
(`graph-repository.ts:53-55`) — but the *hook's* reader process doesn't hold
that lock, so that guarantee doesn't apply to it. In practice the atomic
rename saves correctness (you get a coherent old graph), so this is a
staleness window, not corruption. **The vectors.db side is weaker:** WAL +
`synchronous=NORMAL` (`vector-index.ts:153-154`) with no `busy_timeout`
pragma anywhere — under daemon write + hook read contention a reader can hit
`SQLITE_BUSY` and `searchGlobal` surfaces it as a `VectorError.readError`
(`vector-index.ts:343-345`), which the hook swallows to `null` → "binary
unavailable" (see §4). There is **no VACUUM path in the code at all** (grep
finds zero), so the "mid-VACUUM" failure mode in the brief doesn't exist —
but neither does any reclamation of the orphaned-vector rot, see §8.

## 6. Setup/DX friction: native builds + a 27-dependency libp2p stack + cold-start silence. **major**

**Why it matters.** Day-one experience determines whether this survives past
the first `npm i`. Native modules are where cross-platform installs go to die.

**What the repo says.** Two native builds: `better-sqlite3@^12.10.0` and
`sqlite-vec@^0.1.9` (`package.json` deps), plus an *optional* Rust
`embed_server` sidecar that the headline 75.22% number depends on and which
**was not buildable in the project's own sandbox** — 8 benchmarks blocked on
the missing sidecar, crashing with an "unsettled top-level await" rather than
a clean error (`BENCHMARKS-RESULTS.md:101-102, 112, 148-153`). The default
runtime ships a heavy transitive surface: ~15 `@libp2p/*` packages, `yjs`,
`@xenova/transformers`, `tree-sitter` + two grammars. `@xenova/transformers`
pulls ONNX runtime and, on first real use, a model download — the
NEXT-LEVERS doc flags "550 MB nomic ONNX first-run download (needs progress
UI + escape hatch)" as a *known risk* of the path they want to ship
(`docs/NEXT-LEVERS.md:48-51`). **Cold start:** onboard explicitly warns the
graph is silent until warmed — "seed skipped — run 'folklore seed' once to
warm the cold-start graph" (`src/cli/commands/onboard.ts:337`), and the
coldstart bench confirms an empty graph yields **0% deflection** until seeded
(`BENCHMARKS-RESULTS.md:59`). So the honest day-one story is: native build
risk, a multi-hundred-MB model fetch, and a tool that does nothing useful
until I've fed it. The MCP path across harnesses (Codex/Gemini/etc.) is
"register `folklore mcp start`" (`README.md:202`) — one more stdio server to
babysit per harness.

## 7. The flagship "17%→1%" and "9.13×" numbers are simulator/model output, not field data. **major**

**Why it matters.** I'm being asked to change my workflow on the strength of
compounding claims. If those are constructed rather than measured, the EV of
adopting is unproven.

**What the repo says.** To the project's credit, it labels this honestly and
repeatedly — but the labels confirm the skepticism. The 17%→1% curve is
"illustrative simulator output, not a measured production result" and "part
of that decay is *true by construction*" under v1's boolean-retrieval
abstraction (`docs/product/BENCHMARKS.md:97-112`). The 9.13× is a *demand
model* (Zipfian × Che-approximation), not retrieval measurement
(`BENCHMARKS-RESULTS.md:55-63`). And the one number measured on the **real
live `ask` path** is brutal: "**22.9% grounded success, 0.0% web deflection**"
on the natural-question path (`BENCHMARKS-RESULTS.md:57`;
`docs/product/BENCHMARKS.md:81`), which the docs correctly call "a gap, not a
claim." Retrieval quality (72.30% NDCG@10 honest headline,
`BENCHMARKS.md:29-37`) is real and well-benched. The *compounding economic
thesis* — the actual reason to run P2P — is not yet validated; the 100-peer
pilot is still "queued" (`README.md:220`, `BENCHMARKS.md:157`).

## 8. Maintainability: graph.json + vectors.db dual source of truth, drift between them, just-patched orphan rot. **major**

**Why it matters.** Six months of research is only worth trusting if the two
stores stay consistent and the data survives schema bumps. Two stores that
can drift is an operational liability.

**What the repo says.** State is split: `graph.json` (10-50 MB, parsed whole
into memory, `graph-repository.ts:36-39`) and `vectors.db`
(sqlite-vec + FTS5). They're written by *different* code paths with no
cross-store transaction — a node can exist in one and not the other. The
index-health bench shows the drift is real and measured:
`graph_vector` coverage **90.7%**, `raw_text` 94.7%
(`BENCHMARKS-RESULTS.md:110`) — i.e. ~9% of graph nodes have no vector.
`graph-lint` only detects edge-level `orphan` (node with no edges,
`src/domain/graph-lint.ts:13,27,58`); there's no lint rule reconciling
graph↔vector membership. The brief's "orphaned-vector rot (just patched)"
matches the pattern — `deleteByNodeId` (`vector-index.ts:489-504`) has to
hand-delete across three tables (`vec_nodes`/`vec_meta`/`fts_docs`) with "no
FK to cascade for us" (`:243-246`), exactly the kind of manual multi-table
delete that leaves orphans when one step is missed. **Migrations** are
in-place `ALTER TABLE ... ADD COLUMN` wrapped in try/catch on "duplicate
column" (`vector-index.ts:180-199`) — fine for additive columns, but there's
no schema-version stamp and no down-migration; the `room` column is dead
weight kept "for backward read-compat" (`vector-index.ts:22-25, 162-170`). I
*would* trust the atomic-rename'd graph.json for 6 months; I would **not**
yet trust that the vector index stays in lockstep with it without a periodic
reconcile job, which I don't see shipped.

## 9. Latency budget: a subprocess prefetch on every Read/Grep/Glob, not just web calls. **minor→major**

**Why it matters.** The README says local tools "are never touched"
(`README.md:111`), but the actual matcher is
`Glob|Grep|Read|WebSearch|WebFetch` (`.claude/settings.json:5`). Claude Code
fires Read/Grep/Glob *hundreds* of times a session (the hook's own comment
admits this, `folklore-smart-hook.cjs:313-315`).

**What the repo says.** For Read the query is empty so it short-circuits fast
(`folklore-smart-hook.cjs:101, 284-287`), and a 90s prefetch-cache
(`:205-219`) means most fires reuse a cached banner. But Grep/Glob carry a
pattern and *do* trigger a full `prefetch()` — an `execFileSync` Node-boot
subprocess with peers fan-out and a 4.5s timeout (`:29, 119-124`). The
project's own guidance says MCP is ~50ms vs ~500ms for "Node-boot for a CLI
subprocess" (`CLAUDE.md`, "When to invoke folklore" §2) — and the hook takes
the 500ms CLI path, not MCP. Measured E2E: warm-ask p50 **755ms**, fed-ask
p50 **1045ms** (`BENCHMARKS-RESULTS.md:109`). So a Grep with peers enabled
can add ~0.75-1s before the actual grep runs. The 5s hook timeout
(`settings.json:11`) caps the worst case but a timeout *is* a 5s stall.
Mitigation: `FOLKLORE_PREFETCH_PEERS=0` for local-only, and the empty-query
fast path covers Read — but Grep/Glob latency is real and the README
undersells it.

## 10. Discoverability of "is it even on": the MCP tools the docs tell me to use aren't reliably present. **minor**

**Why it matters.** CLAUDE.md and the injected hook context both instruct the
agent to call `mcp__folklore__ask` / `get_node` / `search` before web lookups
(`folklore-smart-hook.cjs:195, 285`; `CLAUDE.md` §2-5). If those tools aren't
registered in the session, the "active lane" guidance is dead text.

**What the repo says.** In *this very session* the folklore MCP tools were not
loadable (the harness's ToolSearch found no `mcp__folklore__*` schemas), yet
the PreToolUse hook kept emitting "Use search / ask / get_node MCP tools
before outbound lookups" on every Read. So the passive lane (hook) and active
lane (MCP) can be out of sync — the hook advertises tools the session doesn't
have. Minor because the hook still injects context, but it erodes trust in
the instructions and means cross-harness portability (`README.md:202`) needs
per-harness verification I'd have to do myself.

## 11. The auto-save loop saves raw web dumps as `source` notes with thin provenance. **minor**

**Why it matters.** The compounding story depends on saved results being
*useful* later. If auto-save files 32KB raw-text blobs
(`folklore-post-fetch.cjs:45, 89`) under a label like `web: <query>` with
`source_uri = websearch:<query>` (`folklore-post-fetch.cjs:67-77`), my graph
fills with low-signal dumps, not distilled claims.

**What the repo says.** This is acknowledged — CLAUDE.md §6 tells me to
*manually* `folklore save --type synthesis` to add the "distilled claim"
because "the auto-save hook already filed the raw source." So the auto-save is
a raw-capture net; the valuable synthesis is a manual step I have to remember
on every research result. Realistically I won't, and the graph quality
degrades toward a pile of search-result text. The `bench-user-value` 22.9%/0%
result (§7) is consistent with this: raw `source_url` notes scored **0.0%**
grounded success vs 41.7% for `content_excerpt`/`content_question`
(`BENCHMARKS-RESULTS.md:57`).

---

## Verdict

A pragmatic senior dev adopts this **in local-only mode, deny OFF, as a
search-result cache and a benchmarked retrieval engine** — and treats the P2P
compounding story as unproven-but-interesting rather than a reason to switch.
The engineering underneath is genuinely strong: honest benchmarking that
documents 13 null attacks and labels every simulator number as such, atomic
graph writes, a thoughtful risk-tiered decision contract, fail-closed hooks,
and a real 72.30% NDCG@10 CPU retrieval result. But the flagship behaviors a
buyer is sold on are the weakest in practice: the deny-gate is near-inert as
shipped (§1), its headline tuning knob is confounded (§2), the live
natural-question deflection is measured at **0%** (§7), the two-store design
can drift ~9% (§8), and the whole thing fails *silently* when it breaks — a
class of bug the project already shipped once (§4). What would flip me to
full adoption: (a) a `folklore doctor` that proves the hook path is live and
loud-fails when it isn't; (b) a shipped graph↔vector reconcile/lint job with a
schema-version stamp; (c) the live `ask`-path deflection number moving off
zero on a real corpus; and (d) the 100-peer pilot publishing a *measured*
web-fallback curve to replace the simulator. Until then it's a useful
single-player tool with a compelling but unvalidated multiplayer thesis —
adopt the former, wait on the latter.
