# QoS critique — retrieval quality & deny-gate calibration

Adversarial audit of whether Folklore returns the *right* cached knowledge and
whether the deny gate makes *good* skip decisions. Evidence is cited to
`file:line` and to the two reproducible logs
(`docs/BENCHMARKS-RESULTS.md`, the bench scripts). Severity is rated by the
cost of the failure mode, not its likelihood alone — the most expensive error
here is a **false deny**: blocking a web call when memory was wrong or
insufficient, leaving the agent stuck with a confidently wrong answer and no
recourse.

Ranked tough questions follow. Each carries the risk, the evidence, a severity,
and a concrete test/metric that would settle it without overfitting to the
existing 12-query toy.

---

## 1. The deny gate is dead-on-arrival on real traffic — and nobody can tell whether that is safe or just lucky. (SEVERITY: CRITICAL)

**Claim under test.** The shipped gate fires only when all of
`FOLKLORE_DENY_WEBSEARCH=1 && action==='use_memory' && score>=0.85 && hits>=2`
(`.claude/hooks/folklore-smart-hook.cjs:338-343`). `use_memory` itself requires
`score>=0.85` AND non-shallow evidence (`peer-telemetry.ts:770-773`,
`CONTRACT_THRESHOLDS.use_memory=0.85` at `:737`).

**The miscalibration.** After the orphan GC, real-graph satisfaction tops out
~0.37–0.57 (task brief; corroborated by `bench-user-value.mjs`: 22.9% grounded
success and **0.0% web deflection** on 96 real queries —
`BENCHMARKS-RESULTS.md:57`, and `bench-deny-sweep`'s own finding "every
shipped-gate cell is 0% true-deny … no in-corpus answer reaches the fixed 0.85
breakpoint" — `bench-deny-sweep.mjs:366-373`). So on the real graph the gate
**never fires**. The 0.85 number and the live score distribution do not live in
the same range.

**Is it the threshold or the scorer?** It is the scorer's *scaling*, not the
threshold. The relevance gate multiplies the trust aggregate by a factor in
`[REL_FLOOR, 1] = [0.3, 1]` (`peer-telemetry.ts:270,307,423`). The trust base
for a fresh, well-provenanced local node is roughly the mean of
freshness/provenance/consensus (signature unobserved locally), so ~0.6–0.8. A
genuinely good MiniLM-384 hybrid hit lands around distance 0.9–1.05
(`folklore-smart-hook.cjs:34-39`). Plug d=0.95 into the gate:
`dRel = (1.2-0.95)/(1.2-0.5) = 0.357`, and with even partial coverage the fused
relevance is well under 0.6, so `relGate ≈ 0.3 + 0.7*0.4 ≈ 0.58`. Multiply:
`0.75 * 0.58 ≈ 0.43`. **That is the ceiling for a *correct* hit** — it can
never clear 0.85 unless distance approaches `D_NEAR=0.5`, which MiniLM hybrid
essentially never produces on this corpus. The gate is mathematically
unreachable by design, not by accident. Either `D_NEAR/D_FAR` are calibrated to
a different embedder than the one in production (MiniLM-384) or the 0.85
breakpoint was set against the pre-relevance-gate scorer and never re-derived.

**How to tell without overfitting.** Run the live `ask --json` path over a held-out
natural-question set of ≥200 queries with human in/out-of-corpus labels (NOT the
12-query fixture, NOT the synthetic 59-node graph). Plot the satisfaction
histogram split by label. The settling metric: the **separation** between the
in-corpus and out-of-corpus score distributions (e.g. AUC of satisfaction as a
binary classifier of "memory can answer this"). If AUC is high but both modes
sit below 0.85, the threshold is wrong → re-derive it as the score at a target
precision (e.g. the score where false-deny ≤ 2%). If AUC ≈ 0.5, the *scorer* is
broken and no threshold saves it. This is the one experiment that separates
"miscalibrated knob" from "mis-scaled scorer" and it is currently absent.

---

## 2. The SHIP verdict rests on a 59-node synthetic graph that contradicts the in-corpus numbers, and never measures the costly error on real traffic. (SEVERITY: CRITICAL)

**Claim under test.** `bench-deny-validate` returns "84% true-deny / 3%
false-deny → SHIP" (`bench-deny-validate.mjs:262-265`, logged at
`BENCHMARKS-RESULTS.md:72`).

**Why it is not trustworthy as shipped.**
- It tests the **score-only** gate (`scoreOnlyDeny`,
  `bench-deny-validate.mjs:144`) — the *proposed relaxation that drops the
  `action==='use_memory'` precondition*. That is **not the gate that ships**
  (`folklore-smart-hook.cjs:340`). So the 84%/3% describes a gate variant that
  does not exist in `.claude/`. The shipped gate's true-deny on the same real
  path is ~0% (Q1). The bench validating "SHIP" and the code that ships are two
  different gates.
- It runs on a **hand-authored 59-node corpus** with adversarial banks
  *engineered to sit near the cap* (`:394-397`). The script itself calls it "a
  deliberate worst-case probe … single-graph measurement."
- The numbers **disagree** with the in-corpus path: `bench-deny-sweep` reports
  best-cell **42% true-deny** on the real seed corpus
  (`BENCHMARKS-RESULTS.md:71`) vs `bench-deny-validate`'s 84% on the synthetic
  one. A 2× gap between two harnesses of the "same" gate means at least one is
  not measuring production behaviour. The 25–42% band from the real corpus is
  the more credible one because it runs the real seed + real ask path.
- The safety of score-only rests entirely on the `d<=1.05` **distance cap**, not
  on satisfaction — the bench says so explicitly ("satisfaction still does not
  discriminate, bands 0.81/0.58/0.35 … the cap is the load-bearing guard",
  `bench-deny-validate.mjs:376`). But the relevance-gate change *was* supposed
  to make satisfaction discriminate. If the cap is still doing all the work, the
  trust×relevance refactor bought separation on the synthetic graph that may not
  transfer.

**False-deny risk on real traffic.** Unknown and unmeasured. The 3% figure is
on engineered near-misses against a 59-node graph; the real graph has 21,133
nodes (`BENCHMARKS-RESULTS.md:16`), so the density of "close-but-wrong"
neighbours within `d<=1.05` is far higher — every adversarial query has many
more chances to land a spurious sub-cap neighbour. False-deny on real traffic
is plausibly *worse* than 3%, and it is the error that silently corrupts an
answer. The current SHIP verdict does not bound it.

**Settling test.** A frozen, labelled, real-corpus deny-eval: ≥150 queries the
graph genuinely cannot answer (drawn from real miss-log.jsonl entries, not
invented), run through the **shipped** predicate, reporting false-deny with a
Wilson 95% CI. Ship only if the *upper* CI bound on false-deny ≤ 2%. Re-run on
every scorer/threshold change as a regression gate. The 12- and 59-query
fixtures cannot produce a CI tight enough to license "SHIP" — one flip moves the
rate ~8 points (`bench-deny-sweep.mjs:390-391`, stated in the script).

---

## 3. The relevance gate fuses proximity + coverage, but coverage is a substring bag-of-words that mis-fires both ways. (SEVERITY: HIGH)

**Mechanism.** `coverageRatio = (# query terms whose lowercased string appears
in concatenated hit label+summary) / (# query terms)` (`ask.ts:286-294`), fused
as `rel = 0.6*coverage + 0.4*proximity` (`peer-telemetry.ts:279,303`).

**Mis-fire A — lexically-overlapping, semantically wrong (false high).** A query
"how does three-phase commit avoid the blocking problem two-phase commit has?"
shares nearly all terms with a 2PC node that never discusses 3PC. Coverage ≈ 1.0,
proximity moderate → `rel ≈ 0.6*1.0 + 0.4*0.4 = 0.76` → gate ≈ 0.83 → the trust
base passes through nearly undamped. This is exactly the single near-miss leak
the validation bench reports by name (`BENCHMARKS-RESULTS.md:82`). Substring
coverage *rewards* the adversarial near-miss because shared jargon is shared
jargon regardless of answer correctness. Weighting coverage at 0.6 — the
*higher* weight — amplifies this failure mode, the opposite of the comment's
stated intent (`peer-telemetry.ts:275-278`).

**Mis-fire B — correct but paraphrased (false low).** A node that answers the
query in different words ("two-phase commit stalls when the coordinator dies" vs
query "what makes 2PC block on coordinator failure") scores low coverage even
though it is the right answer. Proximity may still be good, but coverage is
weighted 0.6, so a paraphrase is penalised harder than a lexical match — the
gate prefers keyword overlap over meaning, which is precisely what dense
retrieval was supposed to fix.

**Is COVERAGE_WEIGHT=0.6 defensible?** No — it is asserted, not derived. The
comment argues coverage is "the stronger discriminator for topically-adjacent
near-misses" (`peer-telemetry.ts:275-278`), but mis-fire A shows substring
coverage is *fooled by exactly those near-misses*. There is no sweep, no
held-out tuning, no ablation behind 0.6. Also note: `extractQueryTerms` +
`includes()` substring matching means "commit" matches "commitment", "auth"
matches "author" — token-boundary-blind, inflating coverage on the wrong nodes.

**Settling test.** Build a labelled near-miss eval (correct-paraphrase vs
wrong-but-lexically-overlapping, ~50 each) and sweep `COVERAGE_WEIGHT ∈ {0,
0.2, …, 1.0}` measuring near-miss false-deny and paraphrase recall jointly.
Report the value that minimises `max(false_deny, 1 - paraphrase_recall)`.
Separately: replace substring `includes()` with token-set overlap (Jaccard on
tokenised terms) and re-measure — if it moves the number materially, the current
substring matcher is a latent bug, not a tuning choice.

---

## 4. Staleness is displayed but only weakly wired, and there is NO age multiplier on a confidently-wrong-because-old hit. (SEVERITY: HIGH)

**What is wired.** `age_days` reaches the scorer on the real `ask` path
(`ask.ts:117,131`) and feeds the `freshness` component as
`fresh/ageKnown` with a fallback limit of 14 days because
`stale_after_days` is passed as **`undefined`** (`ask.ts:118,132`;
limit fallback `peer-telemetry.ts:216,351`). There is a "more stale than fresh"
penalty of +0.1 (`peer-telemetry.ts:408-411`).

**What is NOT wired — the dangerous gap.** Freshness only enters `base`, the
*trust* aggregate, as one of up-to-four averaged components
(`peer-telemetry.ts:328-339`). The **relevance gate** — the multiplicative term
that actually drives the score (Q1) — is a pure function of distance + coverage
(`peer-telemetry.ts:291-308`); **age never enters it**. Consequence: a hit that
is semantically perfect (d≈0.6) but 400 days old still gets `relGate≈1.0`, and
its only age penalty is (a) freshness dropping that one averaged component and
(b) a flat +0.1 stale penalty. A single very-close, very-stale node can still
clear a high score. For `elevated`-risk queries (version/dependency/upgrade
work, `ELEVATED_RISK` at `:687`) this is exactly the silent-drift failure the
risk overlay was meant to catch — and the overlay only *demotes the decision*
(`:786`), it does not lower the *score*, so the deny-gate's `score>=0.85` test
still sees the stale-but-close number.

The 7-day window in CLAUDE.md is also **not the code default**: the scorer
falls back to **14** days (`peer-telemetry.ts:216`), `DEFAULT_STALE_AFTER_DAYS`
is **14** in `application/peer-pull-telemetry.ts:44` but **30** in
`domain/peer-reputation.ts:142`. Three different staleness windows (7 doc / 14
scorer / 30 reputation) live in the tree. The doc's "7-day" rule is unenforced.

**Settling test.** Inject the same node at ages {1, 7, 14, 30, 90, 365} days and
assert satisfaction decays monotonically and crosses below the deny threshold by
the documented window. It currently will not, because age has no multiplicative
path. Then add an age term to the relevance gate (e.g.
`relGate *= clamp(1 - max(0, age-stale)/halflife)`) and re-run the deny-eval to
confirm stale hits stop denying. Also: collapse the three staleness constants to
one source of truth and assert it in a test.

---

## 5. Real-graph precision@k is unknown — BEIR 72–75% NDCG is a clean-qrels ceiling that does not describe a messy mixed-source personal graph. (SEVERITY: HIGH)

**The gap.** The headline 72.30%/75.22% NDCG@10 is BEIR SciFact: curated docs,
gold qrels, single domain (`BENCHMARKS.md:11-12,38-39`). The production graph is
21,133 nodes of mixed `file://`/`session://`/web sources with **no qrels** and
known metadata rot: `bench-index-health` reports source_uri coverage **0.1%**
and title **2.4%** (`BENCHMARKS-RESULTS.md:110`). NDCG on SciFact tells you
nothing about precision@k of injected hits here, because (a) there are no
relevance labels, and (b) the corpus mixes registers (code, chat, prose) that
the single MiniLM-384 embedder maps into one space where cross-register
neighbours are spuriously close.

**Why this bites the deny gate specifically.** The gate injects top-k hits and
(when it fires) *blocks the alternative*. If precision@2 on real queries is, say,
0.5, then half the time a fired gate injects a wrong-domain neighbour as
authoritative. The provenance component (`:224-227`) cannot catch this — 99.9%
of nodes lack source_uri, so provenance is near-zero-coverage and contributes
noise to the trust base, not signal.

**The next silent failure mode after orphans.** Orphaned vectors (27.4% with no
graph node) were one class of silent corruption. The structurally-identical next
ones, all currently unmonitored: (i) **register collision** — a code symbol node
and a prose node that share tokens sit close in MiniLM space, so a coding query
retrieves a chat log; (ii) **duplicate/near-duplicate nodes** from re-ingesting
the same source inflate `distinct_origins` and `hits.length>=2` falsely — the
consensus component and min-hits guard both assume independence the graph does
not provide (`:239-251` treats all-local as consensus=1.0); (iii) **empty/short
`raw_text`** nodes (25,005 raw_text of 26,395 vectors = 5.3% missing,
`BENCHMARKS-RESULTS.md:16`) that embed to near-centroid and become universal
weak neighbours. Self-recall R@1 90.5% (`:110`) measures the index finding *its
own stored vector* — it says nothing about answer correctness.

**Settling test.** Sample 100 real fired/near-fired queries, have a human label
the top-3 injected hits as relevant/irrelevant, and report precision@1/@3 with a
CI. This is the only number that tells you what the gate actually injects.
Separately, add three index-health sentinels — duplicate-vector rate
(cosine>0.98 pairs), register-collision rate (code↔prose neighbours in top-k),
and centroid-proximity rate (near-empty-text nodes) — and alert when any rises,
the way orphan rate now should.

---

## 6. min_hits>=2 is a weak independence guard on a single-origin local graph. (SEVERITY: MEDIUM)

`DENY_MIN_HITS=2` (`folklore-smart-hook.cjs:88`) is meant to stop a single
close-but-wrong node from denying. But on a local-only graph, "2 hits" can be
two near-duplicate nodes from the same ingest (Q5-ii), and consensus is forced
to 1.0 for all-local sets (`peer-telemetry.ts:249-251`) so it adds no
independence check. `bench-deny-sweep` notes min_hits 2/3 "collapse true-deny to
0%" on the real corpus (`BENCHMARKS-RESULTS.md:71`) — i.e. the guard is either
inert (gate never fires anyway, Q1) or, if the gate were reachable, satisfied by
non-independent hits.

**Settling test.** Require the 2 hits to be from distinct `source_uri`
prefixes (or distinct ingest batches) before counting toward min_hits, and
measure the change in false-deny on the duplicate-heavy real graph.

---

## 7. The contract demotion logic can be bypassed by the deny-gate's raw score read. (SEVERITY: MEDIUM)

`decideContract` demotes `use_memory`→`verify_one_source` on shallow evidence and
on elevated/high risk (`peer-telemetry.ts:770-794`). The shipped hook correctly
gates on `action==='use_memory'` (`:340`), so the demotion *is* respected on the
WebSearch/WebFetch path. **But** the proposed score-only relaxation that the
SHIP-verdict bench actually validates (`scoreOnlyDeny`,
`bench-deny-validate.mjs:144`) reads `satisfaction >= threshold` directly and
**discards the contract** — so it would deny on a score the contract had
explicitly demoted for being high-risk or shallow. If score-only is ever adopted
(the bench recommends it), high-risk queries (auth/crypto/medical/financial,
`HIGH_RISK` at `:686`) would be denied on memory alone — the precise outcome the
risk overlay exists to prevent.

**Settling test.** Any score-only variant must AND-in `contract.decision !==
search_required` and re-test the high-risk bank specifically. Add a unit test:
high-risk query with score 0.9 must never produce a hard deny.

---

## Verdict

**QoS is not yet good enough to trust the deny gate — but for a reassuring
reason: on the real graph the gate is inert, so it is not currently doing harm.**
The danger is latent, not active. The moment someone "fixes" the calibration by
lowering the threshold or relaxing the `use_memory` precondition (both proposed
in the benches), the gate starts firing on a scorer whose real-traffic
discrimination has *never been measured with labels and a confidence interval*,
guarded by a distance cap whose 3% false-deny estimate comes from a 59-node
synthetic graph that disagrees 2× with the in-corpus harness. That is the
combination that ships a confidently-wrong-answer machine.

The relevance-gate refactor (trust×relevance) is the right idea and the band
separation on the synthetic graph (0.81/0.58/0.35) is encouraging, but it has not
been shown to transfer to the 21k-node real graph, and its coverage term is a
substring bag-of-words that demonstrably rewards the worst near-misses.

### Top 3 to fix, in order

1. **Produce one real, labelled, CI-backed deny-eval (≥150 in + ≥150
   out-of-corpus from real miss-log queries) against the SHIPPED predicate, and
   re-derive the 0.85 threshold from a target false-deny rate.** Everything else
   is guessing until the live score distribution is characterised with labels.
   This single artifact replaces both toy fixtures and answers Q1 and Q2.

2. **Wire age into the score multiplicatively and unify the staleness constant.**
   Today a perfect-but-ancient hit can still score high because age never touches
   the relevance gate (Q4); and 7/14/30-day windows coexist. Add an age decay to
   `relevanceGate` and collapse to one `STALE_AFTER_DAYS`, asserted by a
   monotonic-decay test.

3. **Replace substring coverage with token-set overlap and sweep
   COVERAGE_WEIGHT on a paraphrase-vs-near-miss eval (Q3).** The current 0.6 is
   undefended and the substring matcher rewards lexical near-misses — the exact
   adversarial case. Tune it, or drop coverage and gate on proximity alone if it
   does not earn its weight.

Honorable mention: add the three index-health sentinels (duplicate-vector,
register-collision, near-empty-text) so the next silent corruption after orphans
is caught by a metric, not by an auditor.
