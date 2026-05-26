# Akashik — landing page redesign spec

This document is the single source of truth for the upcoming landing
page rewrite. Synthesized from a three-agent audit (marketing,
UX, frontend) of the current `docs/index.html`. All implementation
decisions belong here. If a decision needs to change, edit this file
first; do not improvise during execution.

**Status:** specification finalized; execution NOT yet started.

---

## 0 · Naming, repo, and install — global facts

These apply to every artifact (README, landing page, social pack):

- **GitHub repo (target):** `github.com/twocirclestudios/wellinformed`
  (currently `github.com/SaharBarak/wellinformed`; migration pending)
- **Install path (canonical, npm, homebrew):**

  ```bash
  git clone https://github.com/twocirclestudios/wellinformed.git
  cd wellinformed
  npm install
  npm run bootstrap
  ```

  `npm run bootstrap` already wraps `scripts/bootstrap.sh` in
  `package.json`, so the published install line is fully npm-faced.
  No exposed `bash …` invocations on the landing page.

- **Tighter one-liner (post-npm-publish, future):**

  ```bash
  npx -y wellinformed init
  ```

  Pre-publish, the four-line clone-and-bootstrap is the canonical path.

- **Verbatim hero install strip (use this exact text):**

  ```
  $ git clone https://github.com/twocirclestudios/wellinformed.git
  $ cd wellinformed && npm install && npm run bootstrap
  ```

**Migration touchpoints — every reference to `SaharBarak/wellinformed`
must flip to `twocirclestudios/wellinformed` when execution starts.**
Known files holding the old org:

- `README.md` (multiple star/fork badge URLs + repo links)
- `docs/index.html` (nav-cta, hero CTAs, finale install, footer)
- `docs/SOCIAL-LAUNCH.md` (X bio, launch tweet, HN body, LinkedIn,
  Reddit, email signatures, slide one-liners)
- `docs/positioning-draft.md` (no live URLs; safe to leave)

---

## 1 · Why we're rewriting it

Three independent agent reviews converged on the same four problems.
The page has good bones — typography (Outfit + JetBrains Mono),
single-accent emerald palette, real benchmark bars, the chapter-numbered
IA — but four specific defects kill conversion.

| # | Defect | Severity | Source |
|---|--------|----------|--------|
| 1 | The hero canvas (Three.js peer-graph viz) competes with the H1, fails to communicate the wedge, and tanks LCP (~150 KB Three.js + 1000 LOC scene before paint) | **CRITICAL** | All three agents |
| 2 | Hero CTAs are `Run your own node` (reads as blockchain ops) and `See the code` (duplicates the GitHub link in the nav). No inline install one-liner above the fold | **HIGH** | All three agents |
| 3 | The page is belief-before-proof: a 5-paragraph manifesto sits at chapter 01, immediately after the demo. Five sections of philosophy stand between the demo and the next install surface | **HIGH** | All three agents |
| 4 | The technical wedge — *deep-research-grade retrieval at sub-second, zero tokens consumed* — appears nowhere above the fold. Lineage framing is good but doesn't differentiate against RAG/MCP | **HIGH** | Marketing, UX |

**Wedge claim — RESOLVED (round 2):**
> **Deep research in 11 ms. Cited. Zero tokens.**

Three beats, each making one defensible claim. "Deep research" lands the
quality dimension by directly competing with the category readers know
(ChatGPT Deep Research, Claude Research mode — products that take 5–10
minutes and burn tokens). "11 ms" is the cached-query p50; "Cited" is
the proof artifact (every match returns provenance); "Zero tokens" is
the cost reframe — Akashik's retrieval doesn't go through an LLM.

What we explicitly rejected and why:
- *"Retrieval fires before the LLM reads your prompt"* — the founder
  ruled this out: mechanism detail, not interesting to the audience.
- *"Sub-second cited research, no tokens"* — variants without an actual
  number underperform; "11 ms" is the credibility anchor.
- *"What a frontier agent synthesizes in 90 seconds — cached, cited,
  free"* — strong but "cached" is misleading (cold path is ~970 ms);
  "free" reads softer than "Zero tokens" in a developer audience.

Plus three smaller misses:

- `scene-prompt-hook.gif` exists in the repo but is **not on the page**
  (single biggest unforced error — it's the strongest proof asset)
- The demo gif loads from `raw.githubusercontent.com` (slow, rate-limited
  on HN traffic, will 429)
- No `<main>` landmark; `aria-live` on the canvas status announces
  decorative scenario rotations to screen readers

---

## 2 · The hero — rebuild spec

### 2.1 Layout (1440×900, two-column)

```
┌──────────────────────────────────────────────────────────────────┐
│ NAV ▸ Akashik   Demo · How it works · Bench · Install   ☆  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ● v4.0 — agent brain: cached queries, native CLI                │
│                                                                   │
│  H1 (5.6rem, Outfit 600, lh 0.98):                                │
│   The globally accumulating                                       │
│    knowledge network.                                             │
│   For AI agents — and humans.                                     │
│                                                                   │
│  CLAIM (1.25rem, accent emerald, 600):                            │
│   Deep research in 11 ms.                                         │
│   Cited. Zero tokens.                                             │
│                                                                   │
│  SUB (1.05rem, ink-mute):                                         │
│   Cooperative. Peer-to-peer. In the lineage of Napster, eMule,    │
│   and BitTorrent — every peer's research compounds for the        │
│   whole network. No one pays twice for the same answer.           │
│                                                                   │
│  INSTALL STRIP (segmented pill + shared code block):              │
│   ┌──────────────────────────────────────────┐                    │
│   │  git clone │  npm  │  Homebrew           │                    │
│   └──────────────────────────────────────────┘                    │
│   ╔══════════════════════════════════════════╗                    │
│   ║  $ git clone https://github.com/         ║                    │
│   ║      twocirclestudios/wellinformed.git   ║                    │
│   ║  $ cd wellinformed && npm install &&     ║                    │
│   ║      npm run bootstrap          [⎘ copy] ║                    │
│   ╚══════════════════════════════════════════╝                    │
│                                                                   │
│  CTA ROW (2 signals + 1 action):                                  │
│   · 12 peers online   · 4 domains indexed   [ ☆ Star on GitHub ]  │
│                                                                   │
│  META STRIP (4 stats, mono, dimmed):                              │
│   75.22% NDCG@10 · 11 ms p50 · MIT · CPU-only                     │
│                                                          ┃         │
│                                              ┃────────[ scene-     │
│                                              ┃  prompt-hook.gif ]  │
│                                              ┃  520×330            │
│                                              ┃                     │
│                                              ┃  caption (12px      │
│                                              ┃   mono, ink-mute):  │
│                                              ┃  "The graph loaded. │
│                                              ┃   The model read it.│
│                                              ┃   You paid nothing."│
└──────────────────────────────────────────────────────────────────┘
```

### 2.2 Exact copy (use these strings verbatim)

**H1** (already in place):
> The globally accumulating knowledge network. For AI agents — and humans.

**Claim** (RESOLVED — the technical wedge):
> **Deep research in 11 ms. Cited. Zero tokens.**

Three beats, each making a defensible claim against the alternative
the reader is otherwise paying for. See §1 defect #4 for full rationale
and rejected alternatives.

**Sub** (slightly trimmed from current — drop the did:key sentence;
the OAuth-anchored DID-on-GitHub identity story moves into the
architecture section as the credibility-authentication beat):
> Cooperative. Peer-to-peer. In the lineage of Napster, eMule, and BitTorrent — every peer's research compounds for the whole network. No one pays twice for the same answer.

**Install strip** (RESOLVED — segmented pill, three channels, shared
code block; full implementation in §2.5):

Three install commands surfaced, default `git clone`:

```bash
# git clone (default — canonical today)
$ git clone https://github.com/twocirclestudios/wellinformed.git
$ cd wellinformed && npm install && npm run bootstrap

# npm (post-publish, future)
$ npx -y wellinformed init

# Homebrew (post-tap-publish, future)
$ brew install twocirclestudios/wellinformed/wellinformed
```

**CTA row** (RESOLVED — 2 live signals + 1 conversion action; full
implementation in §2.6):

- Counter A: `· 12 peers online` (clickable, links to repo `/network`
  page; will be `wellinformed peer list` JSON output until built)
- Counter B: `· 4 domains indexed` (clickable, scrolls to `#arch`
  rooms section)
- Action: `☆ Star on GitHub` (primary `btn-primary`, emerald fill,
  links to `https://github.com/twocirclestudios/wellinformed`)

The "see it in 60 seconds" CTA from the round-1 draft is **dropped**.
Demo section sits one scroll below the hero; nav links to `#demo`;
gif in the right column is a silent demo. Three CTAs in the hero
diluted hierarchy.

**Meta strip** (4 stats — distilled from current 4):
> 75.22% NDCG@10 · 11 ms p50 · MIT · CPU-only

### 2.3 Hero right column — replace canvas with gif

**Remove:** the entire Three.js scene (~1000 LOC inline JS + 150 KB
external `three.module.js` from jsdelivr). Keep no canvas — replace
the right column entirely.

**Column-width reality check.** The hero is `grid-template-columns:
1.4fr 1fr` with `gap: clamp(2rem, 6vw, 5rem)`. At 1440px viewport
with 48px shell padding either side and a 64px column gap, the right
column is `(1440 − 96 − 64) / 2.4 ≈ 533 px`. The round-1 spec value
of `width="600"` was 67 px wider than the column. **Corrected to
520×330** (preserves the 1.58:1 aspect ratio).

**Markup** — semantic `<figure>` + `<figcaption>`:

```html
<figure class="hero-gif" data-reveal style="--d: 2">
  <img
    src="../demo/scene-prompt-hook.gif"
    width="520"
    height="330"
    loading="eager"
    decoding="async"
    style="border-radius: 12px; box-shadow: 0 4px 24px rgba(0,0,0,.45);"
    alt="UserPromptSubmit hook in flight: indexed context block lands as additionalContext before Claude reads the user message">
  <figcaption>
    The graph loaded. The model read it. You paid nothing.
  </figcaption>
</figure>
```

**Caption** (RESOLVED):
> The graph loaded. The model read it. You paid nothing.

Three short declarative sentences narrating what the gif just showed.
Beat 1 = the Akashik graph fired. Beat 2 = the LLM read the
context. Beat 3 = the cost reframe — the punchline. The third
sentence is the gut-punch: it makes the visitor feel the wedge as
relief, not as a feature.

**Caption typography:**

```css
.hero-gif figcaption {
  font-family: var(--mono);             /* JetBrains Mono */
  font-size: 12px;
  line-height: 1.5;
  color: var(--ink-mute);               /* #a4a4af after the §6.2 a11y bump */
  margin-top: 10px;
  max-width: 480px;                     /* slightly narrower than gif → optical indent */
}

@media (max-width: 900px) {
  .hero-gif img { width: 100%; height: auto; max-width: 520px; aspect-ratio: 520 / 330; }
  .hero-gif figcaption { max-width: 100%; }
}
```

The `aspect-ratio` declaration on mobile reserves layout space before
the gif loads — zero CLS.

### 2.4 What this hero does that the current one doesn't

1. Tells you what it is (H1 — unchanged)
2. Tells you the *one fact only Akashik has* (claim line — NEW)
3. Tells you the philosophy (sub line — same content, demoted)
4. Shows you the product working (gif — replaces canvas)
5. Lowers the install threshold (3-channel install strip — NEW above the fold)
6. Proves the network is alive (live counters — NEW)
7. Gives you one clear conversion action (Star on GitHub — fixed)

The current hero does steps 1, 3, and a metaphor for #4. It misses 2,
5, 6, and 7 — the four highest-converting moves.

---

### 2.5 Install strip — implementation

**Pattern:** segmented pill (3 segments) above one shared code block.
Click a segment → that command renders in the block. The block height
stays constant regardless of which channel is selected (no layout
shift, no jumpy hero).

**Why pill beats tabs / stacks / auto-detect:**
A full tab-bar steals 48–56 px of vertical space in the left column
where the H1, claim, sub, install, CTAs, and meta strip all already
fight for budget. Stacking three multi-line code blocks dwarfs the
H1. Auto-detect has no affordance. The pill is a single 32 px control
that signals "choose one, see one" instantly and reuses the existing
emerald accent token for active state — zero new color budget.

**Markup skeleton:**

```html
<div class="install-strip">
  <div class="install-tabs" role="tablist" aria-label="Install method">
    <button role="tab" aria-selected="true"  data-install-tab="git">git clone</button>
    <button role="tab" aria-selected="false" data-install-tab="npm">npm</button>
    <button role="tab" aria-selected="false" data-install-tab="homebrew">Homebrew</button>
  </div>
  <pre class="install-code"><code id="install-code"><!-- JS-injected --></code>
    <button id="install-copy" aria-label="Copy install command">⎘</button>
  </pre>
</div>
```

**Vanilla JS — 28 LOC, zero deps:**

```javascript
const segments = document.querySelectorAll('[data-install-tab]');
const block    = document.getElementById('install-code');
const copyBtn  = document.getElementById('install-copy');

const commands = {
  git:      '$ git clone https://github.com/twocirclestudios/wellinformed.git\n$ cd wellinformed && npm install && npm run bootstrap',
  npm:      '$ npx -y wellinformed init',
  homebrew: '$ brew install twocirclestudios/wellinformed/wellinformed',
};

let active = 'git';
block.textContent = commands[active];

segments.forEach((seg) => {
  seg.addEventListener('click', () => {
    active = seg.dataset.installTab;
    segments.forEach((s) => s.setAttribute('aria-selected', String(s === seg)));
    block.textContent = commands[active];
  });
});

copyBtn.addEventListener('click', async () => {
  await navigator.clipboard.writeText(commands[active]);
  copyBtn.textContent = '✓ copied';
  copyBtn.style.color = 'var(--accent)';
  setTimeout(() => { copyBtn.textContent = '⎘'; copyBtn.style.color = ''; }, 1500);
});
```

**State styling:**

```css
.install-tabs {
  display: inline-flex;
  background: var(--ink-800);
  border: 1px solid var(--border-dark);
  border-radius: 6px;
  padding: 3px;
}
.install-tabs button {
  background: transparent;
  color: var(--ink-mute);
  font-family: var(--mono);
  font-size: 0.85rem;
  padding: 6px 14px;
  border: 0;
  border-radius: 4px;
  transition: all 0.18s var(--ease);
}
.install-tabs button:hover            { color: #e8e8ed; background: var(--ink-700); }
.install-tabs button[aria-selected="true"] {
  background: var(--accent);
  color: var(--ink-900);
  font-weight: 600;
}
.install-code {
  position: relative;
  background: var(--ink-800);
  border: 1px solid var(--border-dark);
  border-radius: 8px;
  padding: 16px 20px;
  font-family: var(--mono);
  font-size: 0.92rem;
  line-height: 1.6;
  color: #e8e8ed;
  overflow-x: auto;
}
.install-code button#install-copy {
  position: absolute;
  top: 12px;
  right: 12px;
  background: transparent;
  color: var(--ink-mute);
  border: 0;
  font-family: var(--mono);
  font-size: 0.85rem;
  cursor: pointer;
}
```

**Accessibility:** `role="tablist"` on the wrapper, `role="tab"` +
`aria-selected` on each segment, arrow-key cycling to be added if a
visitor reports needing it (default keyboard `Tab` already works).

**Mobile:** stack the pill across full width below 900 px; the
shared code block scrolls horizontally for the longest line
(`overflow-x: auto` already in the CSS above).

---

### 2.6 Live network counters — implementation

**Decision:** the counters are clickable signals, not pure display
badges. They carry information AND route to a destination — clickable
counters signal "there's something real behind these numbers" in a
way display-only badges don't. Visual weight is **subordinate** to
the star button (the star is the conversion event; counters are
trust priming).

**Markup:**

```html
<div class="hero-ctas" data-reveal style="--d: 3">
  <a class="counter" id="counter-peers"
     href="https://github.com/twocirclestudios/wellinformed">
    · <span data-counter="peers">—</span> peers online
  </a>
  <a class="counter" id="counter-domains"
     href="#arch">
    · <span data-counter="domains">—</span> domains indexed
  </a>
  <a class="btn btn-primary" href="https://github.com/twocirclestudios/wellinformed">
    ☆ Star on GitHub
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" stroke-width="1.6"
            stroke-linecap="round" stroke-linejoin="round" fill="none"/>
    </svg>
  </a>
</div>
```

**Counter copy voice — picks (and rejected alternatives):**

| Counter | Pick | Rejected | Why |
|---------|------|----------|-----|
| A | `12 peers online` | `12 active peers` | redundant adjective |
| A | (same) | `12 nodes federated` | jargon, blockchain-adjacent |
| B | `4 domains indexed` | `4 domains covered` | passive |
| B | (same) | `4 topics` | vague |

`peers online` is alive and human. `domains indexed` is a precise
technical verb (indexing is the literal act).

**States:**

| State | Render |
|-------|--------|
| Loading (≤ 800 ms) | `· — peers online` (mono dash placeholder, no skeleton, no spinner) |
| Cold-start (peers === 0) | `· be the first peer` (replace the number entirely; invitation, not error) |
| Error (fetch fails after 3 s) | hide both counters; star button only |
| Healthy | `· 12 peers online` |

**Visual weight:**

```css
.hero-ctas .counter {
  font-family: var(--mono);
  font-size: 0.92rem;
  color: var(--ink-mute);
  text-decoration: none;
  transition: color 0.2s var(--ease);
}
.hero-ctas .counter:hover { color: #e8e8ed; text-decoration: underline; }
.hero-ctas .btn-primary    { font-size: 1rem; font-weight: 600; }  /* unchanged */
```

The counters are mono-italic-ish in feel (same JetBrains Mono as the
rest), 14 px ish, dimmed; the star button is 16 px semibold accent-
filled. Eye reads counters as context → star as action.

**Data source:** **live, not static.** Counters poll the same
bootstrap-node daemon that powers §11's "Ask the network" section.
The numbers visibly tick up when new peers join — that *is* the
proof the network is alive.

**Endpoint:** `GET /api/stats`, served by the same Fly.io daemon
that runs `/api/ask` (see §8 question 9). Cloudflare Worker fronts
it for rate limiting and edge caching with a 10-second TTL — fast
enough to feel live, conservative enough that a HN-hug doesn't melt
the daemon.

```jsonc
// GET /api/stats response
{
  "peers": 12,
  "domains": 4,
  "chunks": 4891,
  "avg_latency_ms": 970,
  "fetched_at": "2026-05-08T14:00:00Z"
}
```

Backing data per field:

- `peers`: bootstrap node's connected libp2p peer count
- `domains`: distinct rooms in `shared-rooms.json` (system rooms
  `toolshed` + `research` always counted; user-negotiated rooms
  add to it)
- `chunks`: total nodes in the bootstrap node's graph (for §11)
- `avg_latency_ms`: rolling 5-min average from the daemon's
  federated-query telemetry (for §11)

Browser polls every **30 seconds** in v1 (Phase A). SSE upgrade
(Phase B) pushes updates instantly when peer count changes — same
two-phase split as §11.10.

**Implementation — Phase A polling, ~30 LOC:**

```javascript
const STATS_URL = '/api/stats';
const POLL_MS   = 30_000;
const peersEl   = document.querySelector('[data-counter="peers"]');
const domainsEl = document.querySelector('[data-counter="domains"]');
const counters  = document.querySelectorAll('.counter');

let lastPeers = null;

async function loadCounters() {
  try {
    const res = await fetch(STATS_URL, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`stats unavailable: ${res.status}`);
    const { peers, domains } = await res.json();

    // tick animation when peer count changes
    if (lastPeers !== null && peers !== lastPeers) {
      peersEl.classList.add('counter--tick');
      setTimeout(() => peersEl.classList.remove('counter--tick'), 800);
    }
    lastPeers = peers;

    peersEl.textContent   = peers === 0 ? 'be the first peer' : peers;
    domainsEl.textContent = domains;
    counters.forEach(c => c.style.display = '');  // un-hide if previously errored
  } catch {
    counters.forEach(c => c.style.display = 'none');
  }
}

loadCounters();
setInterval(loadCounters, POLL_MS);
// pause polling when tab is hidden — kind to the daemon
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) loadCounters();
});
```

**Tick animation** (when the peer count actually changes — fires
maybe once an hour in steady state, but when it does, it's the most
emotionally resonant signal on the page):

```css
.counter--tick {
  animation: counter-pulse 0.8s var(--ease);
}
@keyframes counter-pulse {
  0%   { color: var(--ink-mute); transform: translateY(0); }
  30%  { color: var(--accent);   transform: translateY(-2px); }
  100% { color: var(--ink-mute); transform: translateY(0); }
}
```

**Phase B — SSE upgrade (commit 3 polish):**

```javascript
const stream = new EventSource('/api/stats/stream');
stream.addEventListener('peers', e => updatePeers(Number(e.data)));
stream.addEventListener('domains', e => updateDomains(Number(e.data)));
stream.addEventListener('error', () => {
  stream.close();
  // fallback to polling
  setInterval(loadCounters, POLL_MS);
});
```

The Worker emits an `event: peers\ndata: 13\n\n` frame whenever the
daemon's peer count changes (debounced to 1 update/sec max).

**Click behavior (final):**
- Counter A (`peers online`) → `#try` (scrolls to live-network section
  — clicking the live counter takes you to the live demo, perfect
  visual rhyme)
- Counter B (`domains indexed`) → `#arch` (rooms section)
- Star → repo URL

**Note on §11 alignment:** §11.6 also calls out `/api/stats`'s
extended fields (`chunks`, `avg_latency_ms`). Same endpoint, same
daemon, same Worker, same shape. The hero counters are the
top-of-page surface; §11's status line is the demo-section surface;
both read from one source of truth.

---

## 3 · Section IA — page-wide reorder

### 3.1 Current vs new

| New # | Section | Anchor | Was | Action |
|------:|---------|--------|-----|--------|
| 1 | Hero | (top) | hero | Rebuild per §2 |
| 2 | Demo (both gifs) | `#demo` | `#demo-band` | Add `scene-prompt-hook.gif`, rename anchor, fix asset path |
| 3 | **Ask the network** (live 3D graph + query box) | `#try` | — (NEW) | Full spec in §11 |
| 4 | **How it works in 3 steps** | `#how` | — (NEW) | Full draft in §4 |
| 5 | Quickstart | `#install` | scattered | New explicit install section, npm flow |
| 6 | Benchmark | `#bench` | Ch. 05 (`#bench`) | Keep as-is, move up |
| 7 | Architecture (Identity + Rooms merged) | `#arch` | Ch. 04 + Ch. 06 | Merge two sections into one |
| 8 | Comparison table | `#compare` | Ch. 02 (`#silo`) | Keep, move down — lands harder after proof |
| 9 | Pillars (the opposite shape) | `#shape` | Ch. 03 (`#shape`) | Keep, move down |
| 10 | Manifesto (shortened) | `#thesis` | Ch. 01 (`#manifesto`) | Cut from 5 paragraphs → 2 paragraphs; move to position 10 |
| 11 | Finale — star + community | (bottom) | finale | Rebuild per §5 |

**Net change: 11 → 11 sections** (live-graph section added; architecture
merges identity + rooms; manifesto sheds three paragraphs).

**Why "Ask the network" sits at position 3 (not 2 or 4):** the gif
demos at position 2 prove the *integration* (Claude Code with the
hook fires faster, cited). The live-graph section at position 3
proves the *network* (real peers, real latency, real chunks).
Putting it before "How it works" lets visitors *experience* the
mechanism before they read about it.

### 3.2 Why this order

The current order is *belief → proof*: manifesto first, then competitor
table, then mechanism, then benchmark. A skeptical engineer who hits
the manifesto's opening paragraph either converts or bounces — and the
copy doesn't earn the conversion at that moment because they haven't
seen the product work yet.

The new order is *proof → mechanism → conviction*:

1. Hero shows the wedge in one line
2. Demo proves it (gif)
3. "How it works in 3 steps" explains the mechanism
4. Quickstart gives them the install path while interest is hot
5. Benchmark gives them the credibility numbers
6. Architecture answers "but how?"
7. Comparison table answers "but how is this different from $other?"
8. Pillars answers "what's the philosophical shape?"
9. Manifesto closes the conviction sale
10. Finale captures the star

A visitor who bounces at any point in this order has gotten more value
than they would have under the current order. A visitor who converts
has been escorted through proof → mechanism → trust → action.

### 3.3 Nav update

Current nav links: `Thesis · The treadmill · The alternative · Identity · Benchmark · How to join`

New nav links:
> Demo · How it works · Bench · Install · Architecture

Drop the chapter-romantic names in nav (keep them as section headers
inside the page). Nav exists for orientation, not for poetry.

---

## 4 · NEW section: "How it works in 3 steps"

Anchor: `#how`. Position: between Demo (`#demo`) and Quickstart
(`#install`).

### 4.1 Section header

> **How Akashik hooks into your workflow**
>
> Three things make the network compound. None of them are tool-calls.

### 4.2 Step 01 — `Hook fires at prompt time, not tool-call time`

> Every other RAG framework wires retrieval into the agent's
> tool-call path. That means the LLM has to decide it needs context
> before it gets context.
>
> Akashik registers a `UserPromptSubmit` hook with Claude Code
> (Codex, Gemini, and any MCP host work the same way). When you type
> a message, the hook runs `wellinformed ask` against your local
> graph — and injects the top matches as `additionalContext` before
> the LLM reads a single token of your prompt.

### 4.3 Step 02 — `Your graph holds what frozen weights can't`

> ArXiv papers you pulled last week. Git commits from this morning.
> Research notes from a peer in your network who debugged the exact
> same library failure three days ago. None of that is in any
> foundation model — it happened after the training cut.
>
> Akashik's graph holds it, ranks it by freshness and provenance,
> and surfaces it in 11 ms p50.

### 4.4 Step 03 — `Every peer makes the network smarter`

> When your session ends, Akashik indexes your transcript back
> into the graph. When a peer in your network asks a related question
> tomorrow, your work answers it — cited, signed, attributed.
>
> The network accumulates. No one pays twice for the same answer.

### 4.5 Closing micro-CTA inside the section

A small mono code block with the wire-up command (it's the move that
turns visitor-into-user):

```bash
# wire it once, globally:
claude mcp add --scope user wellinformed -- wellinformed mcp
wellinformed claude install
# every project gets it. no per-repo config.
```

With one inline link below: `Full quickstart →` (anchors to `#install`).

---

## 5 · Finale rebuild

### 5.1 Current finale

H2: `Run your own node.`
Body: a copy-pastable git-clone command (with `bash scripts/bootstrap.sh`)
plus four small badges (MIT · no account · no key · no cloud).
**Problems:** no star ask, no community link, no social pull, badges
undersized, the install command still uses the bash form.

### 5.2 New finale

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                   │
│   The network gets smarter every time someone new runs a node.    │
│                                                                   │
│   You are the next peer. Every query you answer adds to what      │
│   the whole network knows.                                        │
│                                                                   │
│   $ git clone https://github.com/twocirclestudios/wellinformed.git│
│   $ cd wellinformed && npm install && npm run bootstrap           │
│                                                                   │
│   [ ☆ Star on GitHub ]   [ Join Discussions ]                    │
│                                                                   │
│   MIT  ·  no account  ·  no API key  ·  no cloud  ·  CPU-only    │
│                                                                   │
│   ☆ <live star count via shields.io>  ·  <release version>       │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 5.3 Exact copy

**H2:**
> The network gets smarter every time someone new runs a node.

**Sub:**
> You are the next peer. Every query you answer adds to what the whole network knows.

**Install block** (same npm flow as the hero — repeat is intentional, the visitor scrolled here to copy):

```
$ git clone https://github.com/twocirclestudios/wellinformed.git
$ cd wellinformed && npm install && npm run bootstrap
```

**CTA pair:**
- Primary: `☆ Star on GitHub` → `https://github.com/twocirclestudios/wellinformed`
- Ghost: `Join Discussions` → `https://github.com/twocirclestudios/wellinformed/discussions`
  (use Discord URL if/when one exists; until then, GitHub Discussions
  is the default community surface)

**Meta line:**
> MIT · no account · no API key · no cloud · CPU-only

**Live signals (small, mono, ink-mute):**
- `shields.io/github/stars/twocirclestudios/wellinformed?style=social`
- `shields.io/github/v/release/twocirclestudios/wellinformed`
- (optional) `shields.io/npm/v/wellinformed` once published

---

## 6 · Surgical fixes (no IA churn)

These can land in any commit; they don't depend on the hero rebuild
or the section reorder.

### 6.1 Asset path — fix the demo gif source

Current (`docs/index.html` ~line 1042):
```html
<img src="https://raw.githubusercontent.com/SaharBarak/wellinformed/main/demo/scene-claude.gif" …>
```

New:
```html
<img src="../demo/scene-claude.gif"
     loading="lazy"
     decoding="async"
     width="1000"
     height="auto"
     alt="Side-by-side: Claude alone (~14s, hedged) vs Claude + Akashik (~1.5s, cited)">
```

Same fix applies to the second gif (`scene-prompt-hook.gif`) when it's
added to the demo section per §3.

### 6.2 Accessibility

- Wrap sections 2–10 in a single `<main>` landmark
- Drop `aria-live="polite"` on `viz-status` (it's decorative when the
  canvas is gone; remove the element entirely)
- Bump `--ink-mute` from `#8c8c98` to `#a4a4af` for body-copy contrast
  (current ratio ~4.0:1 is borderline)
- Pause control on the demo gifs — replace `<img>` with `<video>` +
  controls + `autoplay muted loop playsinline`, OR keep `<img>` but
  add a wrapper with a Pause toggle

### 6.3 Performance

- Drop the Three.js import + scene entirely (replaced by gif per §2)
- Add `&display=swap` to the Google Fonts URL (currently FOIT)
- Remove `pulse-ring` infinite animation on `.brand-mark::after`
  (cheap but unnecessary compositor layer)

### 6.4 Mobile

- Align `.hero-meta` breakpoint with hero column collapse:
  change `@media (max-width: 700px)` → `@media (max-width: 900px)` for
  the meta-strip 4-col → 2-col swap
- Mobile DOM order: `.hero-viz { order: 2 }` below 900px so headline
  and CTAs render before the gif (the gif is still proof, but on mobile
  the visitor needs orientation first)
- Nav links collapse to hamburger or hide entirely below 700px; keep
  brand mark + GitHub-star pill always visible
- Install command in finale: `overflow-x: auto; white-space: nowrap;`
  on the wrapper to prevent horizontal page scroll on 375px

### 6.5 Manifesto trim

Current chapter 01 is ~330 words across 5 paragraphs. Cut to two
paragraphs, ~120 words total:

1. Keep: "ten thousand people published the thing you actually need
   yesterday, none of whom got asked" paragraph (the inequality framing)
2. Keep: "Akashik open-sources the knowledge graph itself" close
3. Drop: the rest

The full manifesto becomes a separate `docs/manifesto.html` page,
linked from the trimmed section as `Read the full thesis →`.

---

## 7 · Implementation plan — three sequenced commits

Each commit is independently shippable and pause-reviewable. Hold on
the next commit until the previous one is approved.

### Commit 1 — `redesign(site): hero rebuild`

- Replace Three.js canvas with `scene-prompt-hook.gif`
- Add wedge claim line ("Retrieval fires before the LLM reads…")
- Add hero install strip (npm-only)
- Rewrite CTAs (`See it in 60 seconds`, `Star on GitHub`)
- Update meta strip (4 stats — keep current)
- Update repo references to `twocirclestudios/wellinformed`
- Drop Three.js import + scene code (~1000 LOC removed)
- Hero section only — leave the rest of the page untouched

**Estimated diff:** ~80 lines added, ~1100 lines removed. Net negative.

### Commit 2 — `redesign(site): IA reorder + how-it-works section`

- Reorder sections per §3.1
- Add new `#how` section per §4
- Add new explicit `#install` section between `#how` and `#bench`
- Rename anchors and update nav links
- Merge identity + rooms chapters into single `#arch`
- Trim manifesto to 2 paragraphs; link to full thesis page (separate
  file, can be empty stub for now)

**Estimated diff:** ~250 lines moved, ~150 lines added (new sections),
~200 lines removed (manifesto trim).

### Commit 3 — `redesign(site): finale + surgical polish`

- Rebuild finale per §5 (star button, community link, npm install,
  live shields.io signals)
- Apply all §6 surgical fixes (asset paths, a11y `<main>`, mobile
  breakpoints, font-display swap)
- Update repo references everywhere they were missed in commit 1
- Update README and SOCIAL-LAUNCH.md for the same `twocirclestudios`
  org migration (one sweep file-by-file)

**Estimated diff:** ~120 lines added, ~80 lines removed across 3 files.

### Sequencing rationale

Commit 1 is high-leverage and zero-risk (it only touches the hero,
which is most visible to users right now). Commit 2 is medium-risk
(lots of moves but no new copy beyond §4) — pausing here lets the
founder sanity-check the section order before we delete the manifesto.
Commit 3 is polish-only, ships cleanly once 1+2 are accepted.

---

## 8 · Open questions — decide before commit 1

These need a one-line answer each. Capturing here so we don't get
stuck mid-execution:

1. **Repo migration timing.** Is `twocirclestudios/wellinformed` live
   yet? If not, do we ship the redesign with the new org URLs (links
   404 until upload) or keep `SaharBarak/wellinformed` until the move
   is done?
   - Recommended: do the migration FIRST (push to new org), then ship
     redesign with correct URLs. Otherwise we'd ship dead links to HN.

2. **Discord vs GitHub Discussions.** The finale community CTA needs a
   destination. Is there a Discord, or do we link to GitHub Discussions
   for now?
   - Recommended: GitHub Discussions until/unless a Discord exists.

3. **Manifesto fate.** Trim to 2 paragraphs and link out to a full
   thesis page, or just keep all 5 paragraphs at the bottom of the
   page (no separate thesis page)?
   - Recommended: 2 paragraphs in-page, full thesis as
     `docs/manifesto.html` (cheap to add, keeps the conviction copy
     for readers who want the full pitch).

4. **Pause control on demo gifs.** WCAG 2.2.2 wants either a pause
   button or a video with controls. Keep `<img>` (faster, no controls
   issue if we keep the gif short ~25 s), or convert to `<video>`?
   - Recommended: keep `<img>` and accept the 2.2.2 finding for now;
     revisit if we add a third gif or extend to >30 s.

5. **npm package name.** Will we publish as `wellinformed` or
   `@twocircle/wellinformed` (scoped)?
   - Recommended: try `wellinformed` first — short, memorable. If
     taken on npm, fall back to `@twocircle/wellinformed`.

6. **Live-counter polling cadence.** §2.6 (round-3 update) specifies
   the hero counters are LIVE — polling `/api/stats` every 30 s,
   with optional SSE upgrade in Phase B. Is 30 s the right cadence,
   or do we want faster (10 s) / slower (60 s) polling?
   - Recommended: 30 s. Fast enough that a peer joining feels live;
     slow enough that 1 000 simultaneous visitors only generate
     ~33 req/sec to the daemon (well under Fly.io 256 MB capacity).
     Worker edge-caches with 10 s TTL, so most polls hit the cache.
     Drop to 10 s only if telemetry shows visitors don't perceive
     the liveness. SSE makes the cadence question moot — push when
     it changes, no polling at all.

7. **Counter A click target.** §2.6 routes `peers online` to the repo
   URL until a `/network` page exists. Build that page now, or ship
   with the repo-link fallback and add it post-launch?
   - Recommended: ship with repo-link fallback. The page is a
     cheap follow-up — JSON dump of `wellinformed peer list --json`
     pretty-printed in a `/network/index.html` static file, regenerated
     by the same cron that writes `/_counters.json`.

8. **Homebrew tap.** §2.5 surfaces `brew install
   twocirclestudios/wellinformed/wellinformed` as one of the three
   install channels. Does the tap exist? If not, do we (a) ship the
   pill with Homebrew shown today and a "coming soon" footnote, or
   (b) hide the Homebrew segment until the tap is published?
   - Recommended: (b) hide until the tap is published. Showing a
     channel that doesn't work undermines the trust the install strip
     is supposed to build. Two segments (`git clone` | `npm`) is fine
     for v1; restore Homebrew as a third segment when ready.

9. **Live-demo server hosting.** §11 needs a public `POST /api/ask`
   endpoint that runs `wellinformed ask --peers --json` against the
   bootstrap node. Hosted as a Cloudflare Worker (proxying to a Fly.io
   bootstrap host), Vercel Edge function, or a small VPS / Fly.io node
   running the daemon directly?
   - Recommended: Fly.io node running `wellinformed daemon` + a thin
     `/api/ask` HTTP wrapper. Simplest path — the daemon already
     exists; we just expose one method. Cloudflare Worker fronts it
     for rate limiting + TLS + edge cache on `/_graph.json`.

10. **Bootstrap-node identity.** Which peer runs the demo daemon? The
    founder's laptop is wrong (uptime, WAN exposure). A dedicated VM
    is right. What's its DID, and is the cost (~$5/mo Fly.io) okay?
    - Recommended: dedicated Fly.io 256 MB shared-cpu instance
      ($1.94/mo) running `wellinformed daemon`. Generates a fresh
      did:key on first boot, persisted to a Fly volume.

11. **Demo-content room.** §11 suggests loading a `demo-content`
    room on the bootstrap node, seeded with the cryogenic-LH2 sample
    data so the suggested-query chips have answers. Approve loading
    `demo/data/*` into a public room, or curate a different content
    set?
    - Recommended: load the existing demo data. It's already shaped
      to give good answers ("LSTM quench detection" → Stanford
      cryo-lab paper); writing new content is wasted effort.

12. **Live-demo rate limit.** §11.6 specifies 10 queries / IP / hour.
    Right number, or do we tighten / loosen?
    - Recommended: 10/hour for v1. If we get HN-hugged, drop to
      5/hour with an explicit "demo throttled — install for unlimited
      queries" message. Server-side query budget cap also needed: if
      the bootstrap daemon's CPU > 80% sustained, return 503 to all
      `/api/ask` requests.

---

## 8.5 · Resolved decisions — round 2 log

Captured here so future-me knows what got picked, what got rejected,
and why. Do not relitigate without good reason.

| # | Decision | Pick | Notes |
|---|----------|------|-------|
| R1 | Wedge claim line | **"Deep research in 11 ms. Cited. Zero tokens."** | Rejected: "fires before the LLM reads your prompt" (mechanism, not interesting). Rejected: "cached, cited, free" (cached is misleading; cold path ~970 ms). |
| R2 | Gif caption | **"The graph loaded. The model read it. You paid nothing."** | Three short sentences narrating the gif's three beats. Third sentence is the emotional reframe — relief, not feature. |
| R3 | Hero CTAs | **2 live counters + 1 star** | Dropped "see it in 60 seconds" — demo section sits one scroll below; gif in right column is silent demo; three CTAs would dilute hierarchy. |
| R4 | Counter A copy | `12 peers online` | Rejected: "active peers" (redundant), "nodes federated" (jargon). |
| R5 | Counter B copy | `4 domains indexed` | Rejected: "domains covered" (passive), "topics" (vague). |
| R6 | Counter visual weight | Subordinate to star | Smaller, dimmed mono; star is the conversion event, counters are trust priming. |
| R7 | Counter loading state | Mono dash `—` placeholder | No skeleton, no spinner. Mono-width dash prevents layout shift. |
| R8 | Counter cold-start | `· be the first peer` (when peers === 0) | Invitation, not error. |
| R9 | Counter error state | Hide both counters; star button only | Dead numbers erode trust faster than absence. |
| R10 | Install strip pattern | **Segmented pill** (3 segments, 1 shared code block) | Rejected: tabs (steals 48–56 px), stacked (3× height), auto-detect (no affordance). |
| R11 | Install default segment | `git clone` (canonical today) | npm + Homebrew become canonical post-publish. |
| R12 | Gif dimensions | **520×330** (was 600×380 in round 1) | Right column is ~533 px at 1440 viewport; round-1 was 67 px too wide. Aspect ratio 1.58:1 preserved. |
| R13 | Gif markup | `<figure>` + `<figcaption>` | Semantic correctness, accessibility. |
| R14 | Hero "see in 60 seconds" CTA | **Dropped** | Demo section + nav link + hero gif handle this organically. |
| R15 | Caption typography | 12 px JetBrains Mono, ink-mute, max-width 480 px, margin-top 10 px | Optical indent (caption narrower than gif). |
| R16 | Hero-counter data source | **Live `/api/stats` polling every 30 s** (Phase A); SSE push (Phase B) | Same daemon endpoint as §11. Visibly ticks up when peers join — counter pulse animation. Replaces the round-2 plan of a 5-min static cron file. |
| R17 | Counter A click target | **Scrolls to `#try`** (live-network section) | Round 2 said "repo URL until /network exists". Now that §11 *is* the network surface, clicking the live counter takes you to the live demo — perfect visual rhyme. |
| R18 | Live-network section | **NEW §11 — "Ask the network. Right now."** | 3D Obsidian-style force graph + live federated query box. Inserted at IA position 3, between gif demo and "How it works". Two-phase ship: Phase A (query box + static SVG poster) in commit 2; Phase B (3D graph) in commit 3. |

---

## 9 · What we are NOT changing

For clarity — these elements are explicitly preserved from the current
page:

- Typography stack (Outfit + JetBrains Mono)
- Color palette (single accent emerald, no purple/blue, paper/ink
  duality)
- Design tokens at `:root`
- The `data-reveal` IntersectionObserver reveal engine
- The BEIR SciFact bench bars (genuinely good proof)
- The 3-rooms section (`#rooms`)
- The pseudo-terminal output blocks (identity + oracle examples)
- The chapter-numbered IA inside the page (`Chapter 03`, etc.) — we
  keep this typographic device but renumber to match the new order
- The favicon (the inline SVG peer-graph mark — already on-brand)
- Footer

What is being deleted:
- The entire Three.js peer-graph scene (~1000 LOC inline JS)
- The 3-paragraph middle of the manifesto
- The duplicate "more demos" links (currently 4 inline links to the
  same `demo/README.md`)

---

## 10 · How to use this doc

When execution starts:

1. Read this whole file once — including §8.5 resolved decisions log
   and §11 live-graph section spec.
2. Resolve the open questions in §8. One-line answers each.
3. Execute commit 1 (§7 — hero rebuild). Pause.
4. Visual check on the hero. Diff vs §2 mockup. Ship.
5. Execute commit 2 (IA reorder + "Ask the network" MVP). Pause.
6. Visual check on section order + live demo. Ship.
7. Execute commit 3 (finale + polish + live-graph 3D upgrade). Ship.

At every pause, the question is: *does what's on screen match the
spec?* If the spec is wrong, edit this file before changing the code.

---

## 11 · "Ask the network" — live 3D graph + federated query (NEW section)

This is the section that turns the page from sales artifact into live
product demo. Visitors don't read about Akashik — they query the
real network from the page. Section anchor: `#try`. Position: 3 (between
the gif demo and "How it works").

### 11.1 What this section does

A two-column live demo:

- **Left:** a 3D force-directed graph of the bootstrap node's public
  knowledge graph (toolshed + research rooms + public demo content).
  Nodes pulse and edges glow when a query touches them.
- **Right:** a query input + results panel. Visitor types a question.
  The page fires `POST /api/ask`, the server runs `wellinformed ask
  --peers --json` against the federation, results stream back with
  per-peer attribution and timing. The graph nodes that answered
  light up.

It is the most concrete possible proof: the visitor *queries the
network* before they install anything.

### 11.2 Section header copy

**H2:**
> **Ask the network. Right now.**

**Sub:**
> No install. No account. Type a question — your query fans out to live peers, returns cited chunks in under a second.

**Live status line** (mono, ink-mute, above the columns):
> 12 peers online · 4,891 chunks indexed · 0.97 s avg latency

(Pulled from `/_counters.json` — same source as the hero counters,
extended with `chunks` and `avg_latency_ms` fields.)

### 11.3 Layout — two-column at 1440 px

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                     │
│              ASK THE NETWORK. RIGHT NOW.                           │
│              No install. No account. Type a question.              │
│                                                                     │
│   12 peers online · 4,891 chunks indexed · 0.97 s avg latency      │
│                                                                     │
│  ┌────────────────────────────┐  ┌─────────────────────────────┐  │
│  │                            │  │                             │  │
│  │                            │  │ ╭─────────────────────────╮ │  │
│  │   [3D force graph —        │  │ │ ▸ ask the network…      │ │  │
│  │    ~300 nodes, edges       │  │ ╰─────────────────────────╯ │  │
│  │    glowing on active       │  │                             │  │
│  │    query, peer nodes       │  │  ┌───────────────────────┐  │  │
│  │    pulsing emerald,        │  │  │ Stanford cryo-lab —   │  │  │
│  │    rotation on idle,       │  │  │   Quench-detection    │  │  │
│  │    pause on hover]         │  │  │   LSTM, 2024.         │  │  │
│  │                            │  │  │ ─────                 │  │  │
│  │   ↻ rotate · drag to pan   │  │  │ peer  did:key:zX9…    │  │  │
│  │                            │  │  │ score 0.94 · 124 ms   │  │  │
│  │                            │  │  └───────────────────────┘  │  │
│  │                            │  │  [↑ 4 more chunks ↓]        │  │
│  │                            │  │                             │  │
│  │                            │  │  Asked 12 · responded 8     │  │
│  │                            │  │  Total: 0.97 s              │  │
│  └────────────────────────────┘  └─────────────────────────────┘  │
│                                                                     │
│        Want this for your own work? → Quickstart                   │
└────────────────────────────────────────────────────────────────────┘
```

Below the columns, a single ghost link to the install section:
> Want this for your own work? → Quickstart

### 11.4 Graph visualization spec

**Library:** [`3d-force-graph`](https://github.com/vasturiano/3d-force-graph)
(Three.js + d3-force-3d, ~5 k stars, drop-in component, ~250 KB gz
bundle including Three.js).

**Why this library over raw Three.js or 2D `force-graph`:** it is the
de-facto Obsidian-style 3D graph component, has the exact behaviors
the visitor expects (drag, rotate, zoom, node hover, custom colors
per-node), and lets us focus on data + interaction rather than scene
setup.

**Bundle handling:** lazy-loaded on `IntersectionObserver` — the
section is well below the fold, so the 250 KB cost only pays out
when the visitor actually scrolls to the section. Same pattern the
hero canvas should have used (and didn't).

**Data source:** `GET /_graph.json` — a static JSON file regenerated
every 10 minutes by the same cron that writes `/_counters.json`.

```jsonc
{
  "nodes": [
    { "id": "did:key:zX9…", "label": "peer-alice",  "type": "peer",      "size": 8 },
    { "id": "node:abc123", "label": "Quench LSTM", "type": "research", "room": "research" },
    { "id": "node:def456", "label": "src/db.ts",   "type": "code",     "room": "toolshed" }
  ],
  "edges": [
    { "source": "did:key:zX9…", "target": "node:abc123", "type": "authored" },
    { "source": "node:abc123",  "target": "node:def456", "type": "cites"    }
  ],
  "fetched_at": "2026-05-08T14:00:00Z"
}
```

**Visual treatment:**

| Node type   | Color                | Size | Notes |
|-------------|----------------------|------|-------|
| `peer`      | `var(--accent)` emerald | 8 | Larger, halo-glow on render |
| `research`  | `#d9a255` warm amber | 4 | Demo-content rooms (research, toolshed, public) |
| `code`      | `#8c8c98` ink-mute   | 3 | Toolshed code chunks |
| `synthesis` | `#34d399` accent     | 4 | Synthesis nodes — slightly emissive |

Edges: 0.4 alpha emerald lines; on active query, edges connecting
responding peers→matched chunks pulse to 1.0 alpha for 1.5 s.

**Interaction:**

- **Idle:** auto-rotate at 0.6 deg/sec
- **Hover node:** pause rotation, halo on hovered node, tooltip with
  `label` + `room` + `type`
- **Drag:** rotate / pan
- **Scroll wheel:** zoom (clamped: max 2× initial, min 0.4×)
- **On query fire:** trace edges from each responding peer node →
  the matched chunk node, in 80 ms staggered fade-in

**Cap:** 300 nodes max in the rendered subgraph. If the live graph
has more, server-side downsamples to keep the visual readable.

### 11.5 Query box spec

**Markup:**

```html
<form id="ask-network" class="ask-form">
  <label for="ask-input" class="visually-hidden">Ask the network</label>
  <input
    id="ask-input"
    type="text"
    autocomplete="off"
    placeholder="ask the network…"
    maxlength="240">
  <button type="submit" aria-label="Submit">→</button>
</form>
```

**States:**

| State      | Render |
|------------|--------|
| Idle       | placeholder `ask the network…`, ghost arrow button |
| Typing     | submit button gains accent fill |
| Submitted  | input disabled (1.5 s max), shimmer animation under input border |
| Streaming  | results cards animate in one at a time as `chunks[i]` arrives |
| Complete   | total-latency line renders at the bottom, input re-enabled, focus restored |
| Error      | inline message: `couldn't reach the network — try again? (or run `wellinformed ask` locally)` |
| Rate-limited | inline message: `you've hit the demo rate limit — install to keep asking` + link to `#install` |

**Suggested-query chips** (below the input on idle, click-to-fill):

> Try: `LSTM quench detection` · `vector search sqlite` · `libp2p service discovery`

These are seeded queries the bootstrap node knows it has good answers
for — so the demo never disappoints on first impression.

**Result card:**

```html
<article class="result-card">
  <h3>{title}</h3>
  <p class="excerpt">{first 280 chars}</p>
  <footer>
    <span class="peer">peer <code>{did:key:…}</code></span>
    <span class="score">score {0.94}</span>
    <span class="latency">{124 ms}</span>
  </footer>
</article>
```

DIDs truncated to first 14 chars + ellipsis; click expands the full
DID.

### 11.6 Server endpoints

The live demo needs two endpoints. Both are public, both rate-limited.

**`GET /_graph.json`**
- Static JSON, regenerated every 10 minutes
- Cached at the edge (Cloudflare or GH Pages CDN)
- Shape per §11.4
- Cap: 300 nodes, 600 edges (random-sample if more)

**`POST /api/ask`**
- Body: `{ "query": "string" }`
- Runs `wellinformed ask --peers --json --k 5` server-side against the
  bootstrap node's daemon
- Returns:
  ```json
  {
    "matches": [
      { "id": "node:abc", "title": "...", "excerpt": "...",
        "peer": "did:key:zX9...", "score": 0.94, "latency_ms": 124 }
    ],
    "telemetry": {
      "peers_queried": 12,
      "peers_responded": 8,
      "total_ms": 970
    }
  }
  ```
- Rate limit: **10 queries / IP / hour**, with `Retry-After` header
  on 429
- Hard timeout: 5 s; if the daemon takes longer, return 504 with the
  partial result

### 11.7 Failure-mode design

The live demo will sometimes fail. Plan for it:

| Failure | Detection | UX |
|---------|-----------|----|
| `/_graph.json` 404 / parse error | fetch `.catch` | Replace graph column with a static SVG of the network (~50 nodes, hand-arranged, looks intentional, not a fallback) |
| `/api/ask` returns 429 (rate-limited) | response status | Inline "you've hit the demo rate limit — install to keep asking" + link to `#install` |
| `/api/ask` returns 504 / 5xx | response status | Inline "the demo node is rebooting — try a recorded query" + show one of the 3 suggested-query results from a static cache |
| `/api/ask` takes > 5 s on the client side | `AbortSignal.timeout(5000)` | Same as 504 |
| User submits empty / < 6 chars | client-side guard | Ignore submit; gentle shake animation on input |
| User submits prompt-injection / abuse | server-side check (length, profanity filter, no URLs) | Return 400 with "the demo only takes plain questions"; server logs |

**Static fallback graph** is itself a small SVG (~10 KB) committed
to the repo at `docs/_graph-fallback.svg`. The graph column code
prefers `/_graph.json` and falls back to the SVG only on hard error.

### 11.8 Mobile (375 px)

The graph is the wrong shape for mobile (you can't drag/rotate a 3D
graph on a 375 px-wide canvas without it being miserable). Three
options, ranked:

1. **Hide the graph on mobile, full-width the query box.** Recommended.
   The interactive value lives in the query, not the visualization.
   Mobile visitors get the input, the results, the latency line, and
   one image-of-the-graph as a poster (`docs/_graph-poster.png`,
   ~30 KB) above the input as a "what your query touches" preview.
2. Show the graph as a 2D `force-graph` (no Three.js, no 3D) —
   smaller, easier to interact with on touch.
3. Show a static rotating SVG snapshot (no interaction).

Option 1 is the recommendation. The query box + results is the live
proof — the graph is the visual proof. On mobile, prioritize live
proof.

### 11.9 Bundle / performance budget

- `3d-force-graph` + Three.js: ~250 KB gz (lazy-loaded on
  IntersectionObserver, NOT in the critical path)
- `/_graph.json`: ≤ 80 KB (300 nodes × ~150 bytes + 600 edges ×
  ~80 bytes)
- `/api/ask` payload: ≤ 6 KB per response
- LCP impact: zero (section is below the fold; nothing in this
  section participates in LCP)
- TBT impact: Three.js parse runs on idle main thread when the
  section is visible — accept the ~80 ms blocking time at that
  moment; it does not affect time-to-interactive

### 11.10 Implementation phases

This section is the most ambitious piece of the redesign. Ship it in
two phases so commit 2 doesn't block on perfect:

**Phase A — query box only (commit 2)**
- HTML form + result cards
- `POST /api/ask` endpoint live (server)
- Live status line at top (12 peers online …)
- Static SVG poster of the graph as the left column (the
  `_graph-poster.png` mentioned in §11.8 #1, full-size)
- Suggested-query chips
- Rate limiting + failure modes per §11.7

**Phase B — 3D graph upgrade (commit 3)**
- Lazy-load `3d-force-graph` on IntersectionObserver
- Replace the static poster with the live 3D graph
- Wire the on-query edge animations
- Mobile fallback per §11.8

Phase A alone is already a strong demo (live federated query, real
peer attribution, real latency). Phase B is the visual flourish.
Don't let Phase B block Phase A.

### 11.11 Open questions for this section (added to §8)

These need answers before commit 2 work begins on the section. See
§8 entries 9–12.

- **9.** Server hosting — Cloudflare Workers, Vercel Edge, or a
  small Fly.io / VPS node?
- **10.** Bootstrap-node identity — which actual peer runs the demo
  daemon? (Likely a dedicated host, not the founder's laptop.)
- **11.** What rooms are exposed to the demo? (Recommended:
  `toolshed`, `research`, plus a curated `demo-content` room loaded
  with the cryogenic-LH2 sample data — the same demo content the
  gifs use, so the live demo answers the suggested-query chips
  correctly.)
- **12.** Rate limiting — 10 queries / IP / hour, or different?

---

---

*Appendix — full agent reports are stored in conversation context but
not pasted here. The synthesis above captures every recommendation
with conversion impact ≥ medium.*
