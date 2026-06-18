# Folklore — the skeptical user's review

I'm not the person building this. I'm the engineer who read the pitch
("your agent never researches the same thing twice", "peer-to-peer
compounding inference"), ran `folklore claude install`, and now lives with
five `folklore: knowledge graph is live` reminders on every Read. This is
what I'd actually ask before I decide whether to leave it on past Friday.

Questions are ranked by how much they'd move my keep/kill decision.

---

## 1. Does the headline feature even fire on my real queries? (severity: critical)

**Why it matters to me.** The whole pitch is "answers before the web." The
mechanism that delivers that is the deny gate: satisfaction ≥ 0.85, ≥ 2
hits, decision = `use_memory`. If that never trips, I'm running a glorified
auto-saver, not the thing on the box.

**What the evidence says.** It doesn't trip on real questions. The
measured in-corpus satisfaction tops out around **0.68**
(`bench-deny-sweep.mjs`, BENCHMARKS-RESULTS.md), and on my actual graph the
natural-question path lands at **22.9% grounded success, 0.0% web
deflection** (`bench-user-value.mjs`, real 21,133-node graph). The shipped
gate ("Variant A") is described in the project's own benchmark log as
**"inert, because `use_memory` is governed by a fixed 0.85 breakpoint."**
BENCHMARKS.md grades the live `ask` path **"5.0% grounded success, 0.0% web
deflection — gap, not a claim."** So today, with the default config, the
deny gate essentially never fires on natural questions, because real
satisfaction (≤0.68) sits below the threshold (0.85) by design. The 42%
true-deny number only appears under a *recommended-only, not-shipped*
"Variant B" score-only gate at threshold 0.70.

**Verdict.** The headline value is aspirational as shipped. What I actually
get on day one is the PostToolUse auto-save (real, useful) plus a local
search index — not "the web call gets denied because memory had it."

---

## 2. Then what concrete thing do I get in week one vs vanilla? (severity: high)

**Why it matters to me.** If the deny gate is inert, I need to know the
real, today benefit or I'm paying overhead for a promise.

**What the evidence says.** Honestly, two real things. First, every
WebSearch/WebFetch result is auto-saved and signed, so my *own* repeated
research is cached and locally searchable — that clears the "useful to one
person immediately" bar the README sets. Second, retrieval quality is
genuinely benchmarked (BEIR SciFact NDCG@10 0.7202 real / 0.7522 with the
Rust sidecar), not asserted. But the compounding/federation story — the
reason to pick this over mem0 — is not something I experience in week one.
The coldstart bench (`bench-coldstart-seed.mjs`) shows deflection only
moves **0.0% → 8.3%** on the deny gate even after seeding. So week-one me
gets a decent local cache with provenance. That's it. Fine, but it's a
smaller promise than the marquee.

---

## 3. When the gate DOES deny and injects "cached peer knowledge," how do I know it's right? (severity: high)

**Why it matters to me.** A denied web call means I never see the live
source. I'm trusting the graph blind. A false "I've got it" is strictly
worse than a redundant fetch — and the README admits exactly this ("a false
positive costs more than a redundant fetch").

**What the evidence says.** The mitigations exist on paper: the
`shallowEvidence` demotion (fewer than 4 of 5 components observed →
downgrade `use_memory` to `verify_one_source`), the relevance gate
(trust × relevance, so a fresh-but-off-topic local node can't inflate), and
risk tiers (security/auth/crypto queries force `search_required`). These are
real code in `peer-telemetry.ts` and they're thoughtful. But the
adversarial validation is **a single synthetic 59-node graph with
hand-authored near-misses** (`bench-deny-validate.mjs`), and even there one
near-miss leaked ("three-phase vs two-phase commit"). There is **no
field-measured false-deny rate on real traffic** — the README says the
100-peer pilot is "queued next." So the honest answer is: the guards are
designed well but unproven at my scale, and when a deny is wrong I have no
in-the-moment signal that it was wrong. I'd want the shadow-search
auto-judge (RFC-0003 OQ#5, still unbuilt per NEXT-LEVERS.md) before I trust
a silent deny on anything that matters.

---

## 4. Does the 7-day freshness rule protect me or just dress up stale data? (severity: high)

**Why it matters to me.** "Cached peer knowledge" for a fast-moving topic
(a library API, a CVE, a breaking change) is a liability if it's months
old. I need the staleness logic to actually catch that.

**What the evidence says.** Mixed, and the docs don't even agree with the
code. CLAUDE.md states a **7-day** staleness window; `peer-telemetry.ts`
defaults `stale_after_days` to **14** in two places. More importantly,
freshness is only *observed* if nodes carry `fetched_at` — and
`bench-index-health.mjs` reports **source_uri metadata coverage at 0.1%**
on the real graph. If almost no node has provenance/timestamp metadata, the
freshness component is largely *unobserved*, which means the scorer drops it
and leans on the trust components it can see. So the freshness rule protects
me only for the small fraction of nodes that actually carry timestamps;
for the rest it's silent. The risk-tier overlay (elevated risk → verify)
is the better protection here, and it's keyword-based, so it'll miss
anything not matching its regex. Net: freshness is a real idea with thin
real-data coverage today. I would not trust a cache hit on a versioned
dependency without re-fetching, and the tool mostly can't tell me to.

---

## 5. What leaks to peers, and what's the blast radius if a node has a secret? (severity: high)

**Why it matters to me.** Sharing is symmetric and **on by default** —
nodes federate unless I mark them `private`. I index my codebase and my
research notes. If a node captures an API key, a `.env` value, an internal
URL, or a customer name, it could travel over libp2p to peers. That's the
scariest line in the whole product for me.

**What the evidence says.** There are two layers, both pattern-based and
both incomplete. `sharing.ts`/`scanNode` hard-blocks on a secret match for
`share audit`; `secret-gate.ts` *redacts in place* (`[REDACTED:<pattern>]`)
on the touch/push path. The badge says **14 secret patterns**. Pattern
matching catches AWS keys and obvious tokens; it does **not** catch a
homegrown secret, a base64 blob, a password in prose, a private hostname,
or PII. The default-share posture means the safe failure mode (don't share)
is *not* the default — I have to remember `--private` per node, and the
auto-save hook files web results without me thinking about sharing at all.
Blast radius if I slip: a redaction miss is unrecoverable — once a peer
pulls the node over CRDT sync, it's on their disk, signed by me, with no
revocation story documented. For a single engineer this is manageable with
discipline; for a team graph it's the thing I'd block on before turning
federation on. I'd want share to be **opt-in per room**, not opt-out per
node, and I'd want the secret patterns documented so I can judge coverage.

---

## 6. The "compounding" numbers — what do I experience month 1 vs month 6? (severity: high)

**Why it matters to me.** 9.1× cheaper and 17%→1% web fallback are the
reasons to believe the long game. If those are simulator figures, my lived
experience could be nothing like them.

**What the evidence says.** They are explicitly simulator/model figures, and
the docs say so plainly — to their credit. The 17%→1% curve is
"illustrative simulator output, not a measured production result… part of
that decay is true by construction" (BENCHMARKS.md §federation). The 9.1×
is a Che-approximation cache model over Zipfian demand
(`bench-compounding.mjs`, labeled SIMULATOR). The one *real-graph*
measurement (`bench-subgraph-transfer.mjs`) shows 63% token saving across a
*related-query neighborhood* — a narrower, conditional claim. There is **no
longitudinal field data** — the README's own roadmap puts "publish the real
web_fallback_rate curve after 30 days of live traffic" in the *Next*
column, i.e. not done. So month 1: I get a local cache and auto-save.
Month 6 *if* I have active peers sharing overlapping work: the architecture
makes compounding monotonic in principle (the math section is sound), but I
have zero evidence of the magnitude I'll actually see, and the magnitude
depends entirely on demand overlap with my peers — which for a solo user or
a small disjoint team could be near zero.

---

## 7. Five "knowledge graph is live" reminders on every Read — is the cognitive load worth it? (severity: medium)

**Why it matters to me.** I just watched my own session get five identical
`folklore: knowledge graph is live. Use search / ask / get_node` reminders
injected on plain file Reads. CLAUDE.md promises "Local code exploration
(Read/Grep/Glob) runs without the hook" and "Routine prompts never touch
folklore — zero overhead, zero noise." That's not what I'm seeing.

**What the evidence says.** The SessionStart/PreToolUse wiring is nudging me
toward MCP tools on operations the docs say it leaves alone, and it
duplicates the nudge. That's the exact "noise" the pitch promised wouldn't
happen. Add the four `FOLKLORE_DENY_*` env knobs, the statusline panel, the
`folklore metrics bypass` audit, and 21 MCP tools, and the surface area is
large for a tool whose deny gate is currently inert. For me, more knobs +
more reminders + a feature that doesn't fire = net friction in week one.
The reminders are the most fixable thing here and the most immediately
annoying.

---

## 8. The docs contradict each other — which numbers do I believe? (severity: medium)

**Why it matters to me.** If I can't trust the numbers on the page, I can't
trust the deny that those numbers authorize.

**What the evidence says.** Several live inconsistencies: staleness window
7 days (CLAUDE.md) vs 14 (code); the retired 96.8% NDCG figure that
BENCHMARKS.md itself flags as not-comparable; `bench-deny-validate` results
that *supersede* the older `bench/README.md` table (the doc warns its own
README is stale, verdict flipped SHIP-WITH-GUARD → SHIP after the relevance
change); a composite of **0.9012** in one section and **0.9107**/**0.8597**
in others depending on synth-vs-real. To the team's credit, BENCHMARKS-RESULTS.md
is unusually honest — it labels simulators, records blocked runners, and
prints the negative live-path numbers. But as a user skimming, I have to do
real work to figure out which figure is the one I'd actually feel. The
honesty is there; the single source of truth is not.

---

## 9. The retrieval benchmark needs a Rust sidecar I probably won't build (severity: medium)

**Why it matters to me.** The LED on the site shows **0.7522**. I want to
know if that's what *I* get out of the box.

**What the evidence says.** No. 0.7522 requires building the optional Rust
`bge-base` sidecar (`cargo build --release`). The zero-extra-build path a
fresh clone reproduces is **0.7230** (still good, and honestly labeled the
"honest headline"). In the sandbox capture, **8 benchmarks are blocked
solely on the missing Rust sidecar**, and they crash with an "unsettled
top-level await" instead of a clean "sidecar not found" message. So the
flagship number is behind a build step most users skip, and the failure
mode when the sidecar is absent is a confusing crash, not a graceful
fallback. The number I actually get is 0.7230 — fine, but not the LED.

---

## 10. Federation requires manual multiaddr exchange — will I ever actually have peers? (severity: medium)

**Why it matters to me.** Compounding is worthless without peers. The
quickstart has me running `folklore peer add /ip4/203.0.113.7/tcp/4001/...`
by hand, copied from someone's `peer status`.

**What the evidence says.** mDNS and DHT wiring exist (Phase 17/18), but the
documented onboarding is manual multiaddr paste. For me that means: solo,
I'll never have a peer; on a team, someone has to run a discovery ritual.
The 10-peer mesh is "verified" in a test harness, not in my office. The
network-effects promise has a cold-start problem the product hasn't shown
me it solves outside a lab. Realistically, month 1 I'm running this
single-player, which loops back to question 2: single-player, it's a
local cache.

---

## 11. Provenance is "signed by a verified GitHub handle" — does that actually buy me trust? (severity: low)

**Why it matters to me.** The pitch leans on "attributable, named,
auditable" knowledge vs anonymous Stack-Overflow. Sounds great. But a
signature proves *who* wrote a node, not whether the node is *correct*.

**What the evidence says.** Signature coverage is one of five scorer
components and is "unobservable on a stand-alone node" (the code says so),
so for my own local graph it contributes nothing. Across peers it tells me
which named human curated a claim — useful for accountability, not for
correctness. A confidently-wrong-but-signed node is still confidently
wrong. The provenance chain is a real differentiator for *blame* and
*auditing*; I just shouldn't confuse it with the node being right. Low
severity because it's a genuine feature that's honestly scoped — I only
flag it so I don't over-trust the green checkmark.

---

## Verdict — would I keep it on after a week?

**Qualified yes, but with federation and the deny gate OFF, and only because
the auto-save is genuinely useful and the team is honest about the rest.**

Here's my real calculus. The marquee feature — silent deny-on-confidence —
**does not fire on my real queries today** (satisfaction ≤0.68 vs a 0.85
gate; live web-deflection measured at 0.0%). So I'm not getting "never
research the same thing twice" in any automatic sense. What I *am* getting
is a provenance-signed local cache of my own research with benchmarked
retrieval quality — that's real, it works alone, and it clears the bar that
kills most memory tools. I'd leave **that** on.

What I'd turn off or never turn on in week one: `FOLKLORE_DENY_WEBSEARCH`
(it either does nothing at 0.85, or if I lower it I'm trusting an
unvalidated false-deny rate on a single synthetic test), and federation (the
default-share-with-pattern-only-redaction posture is too risky for anything
touching a real codebase, and I have no peers anyway). I'd also want the
duplicate "knowledge graph is live" reminders silenced — they directly
contradict the "zero noise" promise and they're the first thing that made me
distrust the rest of the copy.

The thing that would flip me from "qualified yes, gate off" to "yes, gate
on" is concrete and the team already knows what it is: the shadow-search
auto-judge measuring a real BadSkipRate on live traffic, plus the 30-day
field web_fallback_rate curve, plus opt-in-per-room sharing with documented
secret-pattern coverage. Until then the compounding thesis is a
well-argued, well-simulated promise — not something I've felt. I respect
that the docs say so out loud. But respect isn't the same as the tool
having saved me anything yet, and after one week, it mostly hasn't beyond
caching my own searches.
