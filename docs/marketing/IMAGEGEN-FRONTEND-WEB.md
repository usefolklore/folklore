# Akashik — imagegen / frontend-web visual direction

Per-section art direction produced by applying `imagegen-frontend-web`
(from leonxlnx/taste-skill) to Akashik's redesign. Pairs with:

- **What to build** → SITE-REDESIGN-SPEC.md
- **How it should look** → BRAND-KIT.md (visual contract)
- **Per-section visual mocks** → this file
- **What to say** → SOCIAL-LAUNCH.md / positioning-draft.md

**Status:** visual direction finalized; raster reference comps to be
generated externally (FLUX/Midjourney/DALL-E) per §6 of this doc.
Production assets remain SVG line-art per BRAND-KIT.md §8.

---

## 0 · How to use this doc

1. **For implementation:** treat each section's mockup + composition
   anchor + background mode as the layout contract. Code against
   that, not against any rendered raster comp.
2. **For visual reference:** copy the §5 image-gen prompts into your
   preferred raster tool. The output is a comp — **never ships to
   production**. It exists to align reviewers on the look-and-feel
   before any HTML is written.
3. **For consistency check:** §3 locks the combinatorial picks
   (theme, typography, hero architecture, narrative spine).
   Anything that drifts from those choices is a regression.

---

## 1 · Active baseline configuration

Per `imagegen-frontend-web` §1 dials, with adaptations for
Akashik's "premium SaaS / infra / product" brief:

| Dial | Value | Notes |
|------|-------|-------|
| `DESIGN_VARIANCE` | **8** | Asymmetric layouts default; centered-hero banned |
| `VISUAL_DENSITY` | **4** | Daily-app feel, not packed dashboards |
| `ART_DIRECTION` | **8** | Bold creative statement, not safe commercial |
| `IMPLEMENTATION_CLARITY` | **9** | Highly codeable; comps must be implementable, not moodboard-vague |
| `IMAGE_USAGE_PRIORITY` | **7** | Mid — line-art SVG illustrations + GIFs, not photo-led (brand bans raster) |
| `SPACING_GENEROSITY` | **8** | Breathable, not packed |
| `LAYOUT_VARIATION` | **9** | Maximize composition variety across the 11 sections |
| `CONVERSION_DISCIPLINE` | **8** | Conversion-aware, premium-balanced |

Brief mapping (per skill §1.5): Akashik = **SaaS / infra /
premium product** → Mid Editorial hero · solid + inline asset
backgrounds · subtle palette-matched gradients · clear product
framing.

---

## 2 · Combinatorial picks (LOCKED — do not deviate)

These choices commit the entire page to a single coherent visual
identity. Every section in §5 derives from them.

| Category | Pick | Why this for Akashik |
|----------|------|---------------------------|
| **Theme paradigm** | **Deep Dark Mode** (`--ink-900: #0c0c14` charcoal-graphite, emerald glow only when justified) | Matches the existing token system; proof-of-product feels engineering-grade |
| **Background character** | **Subtle technical grid / dotted field** + **Pure solid field with soft ambient gradient depth** (the existing 24px grain dot field stays) | Reinforces the graph-native pillar (§1.2 brand kit) without being literal |
| **Typography character** | **Satoshi-like clean grotesk** → executed as **Outfit** (already on the allow-list) + **JetBrains Mono** for data | Avoids Inter; signals technical precision; matches existing CSS tokens |
| **Hero architecture** | **Asymmetric Split Hero** (1.4fr left | 1fr right) | Avoids "centered minimalist" cliché AND the rejected "left-text/right-image" default; the 1.4fr ratio is asymmetric *enough* to signal intent |
| **Section system** | **Asymmetric premium marketing flow** | Section heights vary intentionally (large hero → mid demo → tall live-graph → mid sections → finale) |
| **Signature component set (4)** | (1) **Pristine Gapless Bento Grid** for `#arch` · (2) **Vertical Rhythm Lines** for `#compare` · (3) **Oversized Metrics Strip** for `#bench` · (4) **Layered Image Crop Frames** for `#demo` | Each component does work for one specific section's job. No card-spam. |
| **Motion-implied (2)** | **staggered float-up energy** (matches existing `data-reveal` reveal engine) + **cinematic fade-through energy** (gif → demo → live-graph hand-off) | Already aligned with §5 of BRAND-KIT.md (`MOTION_INTENSITY: 6`) |
| **Hero scale** | **Mid Editorial Hero** | Balanced type/image — 5.6rem H1 + 520×330 gif lands cinematic without screen-filling |
| **Narrative / concept spine** | **Living system / garden** — organic growth metaphor, branching layout, nurtured tone | Threads with "compounds for the whole network", "the network gets smarter every time someone runs a node", and the 6-peer mesh visual language |
| **Second-read moment** | **A macro crop that carries brand color naturally** → executed as the **live-counter pulse animation** in emerald (single tick → flash → return) | Aids scan order (eye catches the tick, anchors at the counter, follows to the star CTA) |

Across the page these picks produce **one site, not eleven mood-
boarded pages.** Continuity is enforced by §4.

---

## 3 · Cross-page consistency contract

All 11 section comps must respect:

| Element | Locked value | Source |
|---------|-------------|--------|
| Palette | `--ink-900`, `--ink-800`, `--accent #34d399`, `--paper #f7f4ec`, `--ink-mute #a4a4af`, `--accent-warm #d9a255` (data only) | BRAND-KIT §2 |
| Display type | Outfit 600/700, `letter-spacing: -0.035em` for display, `-0.022em` for section | BRAND-KIT §3 |
| Mono type | JetBrains Mono 400/500 | BRAND-KIT §3.1 |
| CTA family | Pill `border-radius: 999px`, primary emerald fill, ghost transparent + 1px border | BRAND-KIT §6.1 |
| Card radius | `16px` (when used; mostly avoided per Rule 4) | BRAND-KIT §6.4 |
| Code-block radius | `8px` | BRAND-KIT §6.6 |
| Image treatment | Single-color emerald line art on `--ink-900`; GIFs in `<figure>` with 12px radius + diffusion shadow | BRAND-KIT §8 |
| Tonal voice | Concrete / confident / technical / cooperative / wry-on-cost | BRAND-KIT §10.1 |

A reviewer scrolling through all 11 comps must read them as
**one site**.

---

## 4 · Section-rhythm map

Avoid uniform slabs. Mix section ambition deliberately:

| # | Anchor | Section | Ambition | Approx. height (desktop) |
|---|--------|---------|----------|--------------------------|
| 1 | Hero          | top              | LARGE | ~860 px (full-viewport min-h) |
| 2 | `#demo`       | gif demo         | MEDIUM | ~620 px |
| 3 | `#try`        | ask the network  | LARGE | ~880 px (live 3D graph + query) |
| 4 | `#how`        | 3-step explainer | MEDIUM | ~620 px |
| 5 | `#install`    | quickstart       | MINI  | ~360 px (focused, ultra restraint) |
| 6 | `#bench`      | benchmark        | LARGE | ~720 px (light section break) |
| 7 | `#arch`       | architecture     | MEDIUM | ~640 px |
| 8 | `#compare`    | competitor table | MEDIUM | ~580 px |
| 9 | `#shape`      | pillars          | MINI  | ~420 px |
| 10 | `#thesis`    | manifesto (trimmed) | MINI | ~380 px |
| 11 | `#finale`    | star + community | MEDIUM | ~520 px |

Pattern: **L M L M S L M M S S M.** No two LARGEs back-to-back; MINIs
serve as breath between dense sections.

---

## 5 · Section-by-section direction

Eleven blocks. Each block specifies: composition anchor · background
mode · CTA style · ASCII mockup · image-gen prompt · implementation
note.

---

### 5.1 — SECTION 1 of 11: Hero

| Field | Value |
|-------|-------|
| **Composition anchor** | Asymmetric Split Hero (1.4fr left | 1fr right) |
| **Background mode** | Solid `--ink-900` surface + grain dot field + inline asset (right column = `scene-prompt-hook.gif`) |
| **CTA style** | Classic primary pill + inline-link counters |
| **Image scale** | 16:9 reference; in-page hero is `min-h-[100dvh]` |

**Mockup (1440×810):**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ●  Akashik                     Demo · How · Bench · Install     ☆ Star  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  ● v4.0 — agent brain: cached queries, native CLI                         │
│                                                                           │
│  The globally accumulating                       ┌───────────────────┐   │
│   knowledge network.                             │                   │   │
│  For AI agents — and humans.                     │  scene-prompt-    │   │
│                                                  │   hook.gif        │   │
│  Deep research in 11 ms. Cited. Zero tokens.     │  (520×330,        │   │
│                                                  │   12px radius,    │   │
│  Cooperative. Peer-to-peer. In the lineage of    │   diffusion       │   │
│  Napster, eMule, and BitTorrent — every peer's   │   shadow)         │   │
│  research compounds for the whole network.       │                   │   │
│  No one pays twice for the same answer.          └───────────────────┘   │
│                                                                           │
│  ┌─────────────────────────────────────┐                                  │
│  │ [git clone] [npm] [Homebrew]        │     The graph loaded.            │
│  │ ┌─────────────────────────────────┐ │     The model read it.           │
│  │ │ $ git clone …                   │ │     You paid nothing.            │
│  │ │ $ cd … && npm i && npm run boot │ │                                  │
│  │ └─────────────────────────────────┘ │                                  │
│  └─────────────────────────────────────┘                                  │
│                                                                           │
│  · 12 peers online   · 4 domains indexed         [ ☆ Star on GitHub ]    │
│                                                                           │
│  75.22% NDCG@10  ·  11 ms p50  ·  MIT  ·  CPU-only                       │
└──────────────────────────────────────────────────────────────────────────┘
```

**Image-gen prompt (FLUX / Midjourney / DALL-E):**

> Hero section of a premium open-source developer tool's landing
> page, asymmetric split layout 60/40, deep charcoal background
> #0c0c14 with subtle 24px dotted grid overlay. Left column: massive
> Outfit display headline in light gray #e8e8ed reading "The
> globally accumulating knowledge network. For AI agents — and
> humans." with the em-dash phrase in single-accent emerald #34d399;
> below, a tight JetBrains Mono claim in emerald reading "Deep
> research in 11 ms. Cited. Zero tokens."; below, a 56-character
> body paragraph in muted gray #a4a4af; below that, an install
> command block with a segmented pill (git clone | npm | Homebrew)
> in emerald-on-charcoal mono code; below that, two inline live
> counters in mono ("· 12 peers online · 4 domains indexed") next
> to a single primary CTA pill ("☆ Star on GitHub" in emerald-fill
> with charcoal text). Right column: a layered animated terminal
> screenshot showing a live UserPromptSubmit hook firing with
> indexed graph context. 12px border-radius, soft diffusion shadow.
> Typography: Outfit 600 for display, JetBrains Mono 500 for code.
> No purple, no blue, no neon glow, no gradient text. 16:9 aspect.
> Premium awwwards-grade, Bun/Linear/Astro feel.

**Implementation note:** the comp is verifying the asymmetric
balance + emerald discipline. Implementation lives in
SITE-REDESIGN-SPEC.md §2.

---

### 5.2 — SECTION 2 of 11: Demo (gif)

| Field | Value |
|-------|-------|
| **Composition anchor** | Image-as-canvas (gif fills section; text in lower 30%) |
| **Background mode** | Flat `--paper #f7f4ec` color block + GIF as the visual focus |
| **CTA style** | CTA as caption under visual (no button) |
| **Image scale** | 16:10 reference |

**Mockup:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│              SEE IT IN ACTION                                             │
│              ─────────────────                                            │
│                                                                           │
│              Same model. Same query.                                      │
│              The only difference is Akashik.                              │
│                                                                           │
│         ┌────────────────────────────────────────────────────┐           │
│         │                                                    │           │
│         │     scene-claude.gif                               │           │
│         │     (Claude alone vs Claude + Akashik,             │           │
│         │      side-by-side timing comparison,               │           │
│         │      ~10× speedup,                                 │           │
│         │      cited from local research)                    │           │
│         │                                                    │           │
│         │     1000×600, 12px radius, diffusion shadow        │           │
│         └────────────────────────────────────────────────────┘           │
│                                                                           │
│              ↑ ~10× faster · cited from local research ·                  │
│              hook fired before any tool call                              │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

**Image-gen prompt:**

> Proof-of-product section on a warm off-white #f7f4ec background,
> centered composition. Top: small uppercase eyebrow "SEE IT IN
> ACTION" in mono. Below: a calm two-line statement in Outfit 600
> dark charcoal "Same model. Same query. The only difference is
> Akashik." Center: a single horizontal animated terminal
> recording showing two side-by-side terminal windows running the
> same Claude Code prompt. The left terminal is bare and slow
> (~14 s). The right terminal injects context from an Akashik
> hook and answers in ~1.5 s. Both terminals share the same
> JetBrains Mono typeface, dark Catppuccin Mocha theme inside the
> recording but rounded with 12px radius and soft diffusion shadow
> against the paper background. Below the GIF: a small mono caption
> in muted gray ("↑ ~10× faster · cited from local research · hook
> fired before any tool call"). Premium editorial calm, no card
> chrome, no purple, no blue, single emerald accent only used in
> the recording itself. 16:10 aspect.

**Implementation note:** comp verifies the light-section break
(paper bg) and that the gif gets its own visual zone. Production
fix: gif loads from `../demo/scene-claude.gif` (NOT
raw.githubusercontent.com).

---

### 5.3 — SECTION 3 of 11: Ask the network (live 3D graph + query)

| Field | Value |
|-------|-------|
| **Composition anchor** | Centered low — graph fills the section as canvas; query input + status line + section header layered in lower-third |
| **Background mode** | Image as the entire visual + text overlaid (the 3D force graph IS the section's background) |
| **CTA style** | Underlined inline link with arrow ("Want this for your own work? → Quickstart") |
| **Image scale** | 21:9 reference |

**Mockup:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│        Ask the network. Right now.                                        │
│        No install. No account. Type a question.                           │
│                                                                           │
│        12 peers online · 4,891 chunks indexed · 0.97 s avg latency        │
│                                                                           │
│   ┌─────────────────────────────────────┐  ┌───────────────────────────┐ │
│   │                                     │  │                           │ │
│   │                                     │  │  ▸ ask the network…       │ │
│   │      ●                              │  │                           │ │
│   │     /│\\                             │  │  ┌─────────────────────┐ │ │
│   │    ● │ ●     ╱                      │  │  │ Stanford cryo-lab — │ │ │
│   │  ╱  │ │ ╲   ╱                       │  │  │ Quench-detection    │ │ │
│   │ ●   │ ●  ●─────●                    │  │  │ LSTM, 2024.         │ │ │
│   │  ╲  │ │ ╱   ╲                       │  │  │ peer did:key:zX9…   │ │ │
│   │    ● │ ●     ╲                      │  │  │ score 0.94 · 124 ms │ │ │
│   │     \│/                              │  │  └─────────────────────┘ │ │
│   │      ●                              │  │                           │ │
│   │                                     │  │  Asked 12 · responded 8   │ │
│   │   [3D force graph, emerald lines    │  │  Total: 0.97 s            │ │
│   │    on charcoal, peer halos pulsing] │  │                           │ │
│   │                                     │  │                           │ │
│   └─────────────────────────────────────┘  └───────────────────────────┘ │
│                                                                           │
│           Want this for your own work? → Quickstart                       │
└──────────────────────────────────────────────────────────────────────────┘
```

**Image-gen prompt:**

> Live demo section on a deep charcoal #0c0c14 background. Top
> centered: an Outfit 600 H2 reading "Ask the network. Right now."
> followed by a 12-word sub in muted gray. Below: a JetBrains Mono
> live-status line in muted gray reading "12 peers online · 4,891
> chunks indexed · 0.97 s avg latency". Main canvas is split 60/40:
> left 60% is a 3D force-directed knowledge graph in
> Obsidian-vault style — ~120 visible emerald nodes (large nodes
> are peers, small nodes are chunks, mid nodes are research papers
> in warm amber #d9a255), connected by glowing thin emerald lines
> at varied opacity (0.2 to 0.55), the camera at a gentle isometric
> angle suggesting auto-rotation, peer nodes have soft radial halo
> glows; right 40% is a rounded query interface — a dark elevated
> input field with placeholder "ask the network…", below it 2-3
> result cards in dark elevated panels showing chunk titles in
> Outfit 500, 280-char excerpts, peer DID truncated to "did:key:
> zX9…" and a relevance score "0.94" + latency "124 ms" in mono;
> below the cards a small mono telemetry line "Asked 12 · responded
> 8 · Total: 0.97 s". Bottom: a quiet underlined inline link with
> emerald arrow → "Quickstart". 21:9 aspect, premium dataviz feel,
> no purple, no blue, no neon. Reference: how Linear / Vercel
> dashboards render rich data without ornament.

**Implementation note:** Phase A ships with `_graph-fallback.svg`
on the left; Phase B replaces it with the live `3d-force-graph`
canvas. Comp shows Phase B end-state.

---

### 5.4 — SECTION 4 of 11: How it works in 3 steps

| Field | Value |
|-------|-------|
| **Composition anchor** | Off-grid editorial offset — three steps staggered diagonally, NOT three equal cards |
| **Background mode** | Subtle texture / paper / grid as background |
| **CTA style** | None section-level; closing micro code block ("wire it once, globally:") + "Full quickstart →" inline link |
| **Image scale** | 16:9 reference |

**Mockup:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│   How Akashik hooks into your workflow                                    │
│   Three things make the network compound. None are tool-calls.           │
│                                                                           │
│   01                                                                      │
│   ──                                                                      │
│   Hook fires at prompt time, not tool-call time.                          │
│   <body paragraph, ~80 words>                                             │
│                                                                           │
│            02                                                             │
│            ──                                                             │
│            Your graph holds what frozen weights can't.                    │
│            <body paragraph, ~80 words>                                    │
│                                                                           │
│                       03                                                  │
│                       ──                                                  │
│                       Every peer makes the network smarter.              │
│                       <body paragraph, ~80 words>                         │
│                                                                           │
│   ┌──────────────────────────────────────────────────────────────────┐   │
│   │ # wire it once, globally:                                        │   │
│   │ claude mcp add --scope user akashik -- akashik mcp     │   │
│   │ akashik claude install                                      │   │
│   └──────────────────────────────────────────────────────────────────┘   │
│                                                  Full quickstart  →     │
└──────────────────────────────────────────────────────────────────────────┘
```

Each step indented further right than the previous (~80 px stagger).
The three steps form a diagonal flow — visualizing the "compounding"
narrative.

**Image-gen prompt:**

> Three-step explainer section on a deep charcoal #0c0c14
> background with a very faint 24px dotted grid texture. Off-grid
> editorial layout: three numbered steps stagger diagonally
> downward and to the right, each step indented ~80px more than
> the previous, creating a visual cascade. Each step renders an
> oversized JetBrains Mono numeral "01", "02", "03" in muted gray
> #a4a4af with a single 1px emerald rule below it, then a tight
> Outfit 500 line headline ("Hook fires at prompt time, not
> tool-call time."), then a 4-line body paragraph in muted gray.
> Bottom of the section: a single dark elevated mono code block
> showing "claude mcp add --scope user akashik -- akashik
> mcp" followed by "akashik claude install"; below that, a
> right-aligned underlined inline link in emerald with arrow:
> "Full quickstart →". No cards, no boxes, just typography +
> spacing as the structure. 16:9 aspect, premium docs / explainer
> energy, Stripe-docs caliber.

**Implementation note:** stagger uses CSS `margin-left` per step
(`0`, `80px`, `160px`). Mobile collapses to flush-left stack.

---

### 5.5 — SECTION 5 of 11: Quickstart

| Field | Value |
|-------|-------|
| **Composition anchor** | Stacked center (label / headline / install / CTA all centered, ultra-minimalist) |
| **Background mode** | Solid surface with inline asset (the install-strip pill IS the asset) |
| **CTA style** | Banner-style full-width install strip (the install IS the CTA) |
| **Image scale** | 16:10 reference, MINI ambition |

**Mockup:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│                                                                           │
│                              QUICKSTART                                   │
│                              ──────────                                   │
│                                                                           │
│                         Three commands. Done.                             │
│                                                                           │
│         ┌────────────────────────────────────────────────────┐           │
│         │ [git clone]  [npm]  [Homebrew]                     │           │
│         │ ┌────────────────────────────────────────────────┐ │           │
│         │ │ $ git clone https://github.com/twocirclestud…  │ │           │
│         │ │ $ cd akashik && npm install &&            │ │           │
│         │ │     npm run bootstrap            [⎘ copy]      │ │           │
│         │ └────────────────────────────────────────────────┘ │           │
│         └────────────────────────────────────────────────────┘           │
│                                                                           │
│              MIT  ·  no account  ·  no API key  ·  no cloud              │
│                                                                           │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

**Image-gen prompt:**

> Ultra-minimalist install section on deep charcoal #0c0c14
> background, lots of negative space, fully centered stacked
> composition. Top: tiny mono uppercase eyebrow "QUICKSTART" with
> a thin emerald rule below. Below: a single Outfit 500 line in
> light gray "Three commands. Done." Center: a wide install
> strip — segmented pill at the top with three options "git clone
> | npm | Homebrew" (active option emerald-filled, others muted
> gray), under the pill a single elevated dark mono code block
> with three lines of shell commands, with a small copy icon in
> the upper-right corner. Bottom: a thin metadata strip in mono
> muted gray reading "MIT · no account · no API key · no cloud".
> No images, no decoration, just typography + a single command
> block. 16:10 aspect, confident restraint, Linear-quickstart caliber.

**Implementation note:** this section is intentionally MINI — its
job is to give a paste-ready install path while interest is hot.

---

### 5.6 — SECTION 6 of 11: Benchmark

| Field | Value |
|-------|-------|
| **Composition anchor** | Top-left lead, support bottom-right (numbers anchor TL, prose details BR) |
| **Background mode** | Color-blocked diptych (light `--paper #f7f4ec` left 70% with bench bars, accent block right 30% with summary) |
| **CTA style** | Oversized headline + tiny CTA hint ("13 documented null attacks" link inline) |
| **Image scale** | 16:9 reference |

**Mockup:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  paper bg #f7f4ec                                       │ accent block   │
│                                                          │ #34d399 dim   │
│  CHAPTER 05 — BENCHMARK                                  │                │
│                                                          │                │
│  Real numbers. CPU-only.                                 │  75.22%        │
│  No GPU. No cloud.                                       │  NDCG@10       │
│                                                          │  on BEIR       │
│  BEIR SciFact NDCG@10 — Akashik vs incumbents            │  SciFact       │
│                                                          │                │
│  Akashik            ████████████████████████  75.22%     │  vs the next   │
│  Pinecone-baseline  ███████████████░░░░░░░░░  58.40%     │  closest:      │
│  mem0-cached        ████████████░░░░░░░░░░░░  44.10%     │  +16.82 pts    │
│  Letta-default      █████████░░░░░░░░░░░░░░░  31.50%     │                │
│  LangChain-RAG      ███████░░░░░░░░░░░░░░░░░  26.80%     │  CPU-only      │
│                                                          │  11 ms p50     │
│  13 documented null attacks · threat model →             │                │
└──────────────────────────────────────────────────────────────────────────┘
```

**Image-gen prompt:**

> Benchmark section, color-blocked diptych: left 70% on warm paper
> #f7f4ec with deep charcoal text, right 30% on dimmed emerald
> #34d399 at 14% opacity with deep charcoal text. Left column,
> top-left anchor: tiny mono uppercase eyebrow "CHAPTER 05 —
> BENCHMARK", then a tight Outfit 600 two-line H2 "Real numbers.
> CPU-only. No GPU. No cloud.", then a small mono caption "BEIR
> SciFact NDCG@10 — Akashik vs incumbents". Below: a
> horizontal bar chart with 5 rows (Akashik, Pinecone-baseline,
> mem0-cached, Letta-default, LangChain-RAG); each row is a label
> in mono left-aligned, followed by a horizontal bar — Akashik
> is the longest (75.22%) in saturated emerald #34d399, the others
> shorter and in muted gray with subtle hatching. To the right of
> each bar, the percentage in JetBrains Mono. Below the chart, a
> small underlined inline link in emerald "13 documented null
> attacks · threat model →". Right column: oversized
> Outfit 600 statement "75.22% NDCG@10 on BEIR SciFact" with the
> percentage massive (96px) and the rest progressively smaller;
> below it a small mono caption "vs the next closest: +16.82
> pts" and "CPU-only · 11 ms p50". 16:9 aspect, premium-research
> data-viz feel, no purple, no blue, single emerald accent.

**Implementation note:** the existing bench bars are good — keep
them, ensure the diptych split is implemented (current page renders
all on paper bg, split adds visual rhythm).

---

### 5.7 — SECTION 7 of 11: Architecture (Identity + Rooms merged)

| Field | Value |
|-------|-------|
| **Composition anchor** | Bottom-right CTA cluster — content top-left, action right |
| **Background mode** | Full-bleed `--ink-900` + tonal overlay (subtle radial gradient from emerald-accent at 8% opacity in top-left corner) |
| **CTA style** | Outline / ghost ("Read the threat model →") |
| **Image scale** | 16:9 reference |

**Mockup:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  /  emerald soft glow top-left                                            │
│                                                                           │
│  CHAPTER 04+06 — ARCHITECTURE                                             │
│                                                                           │
│  W3C did:key identity. Your math, not someone's user table.              │
│                                                                           │
│  ┌────────── pristine gapless bento (3-col, mixed sizes) ──────────┐    │
│  │ ┌────────────┐ ┌────────────┐ ┌──────────────────────────────┐  │    │
│  │ │ TOOLSHED   │ │ RESEARCH   │ │ user-negotiated rooms        │  │    │
│  │ │ codebase   │ │ arxiv, web │ │ wi-test · auto-tlv · etc.    │  │    │
│  │ │ stale: 30d │ │ stale: 7d  │ │ membership: opt-in via TUI   │  │    │
│  │ └────────────┘ └────────────┘ └──────────────────────────────┘  │    │
│  │                                                                  │    │
│  │ ┌──────────────────────────────────────────────────────────────┐ │    │
│  │ │ identity: Ed25519 signed envelopes, OAuth-anchored DIDs       │ │    │
│  │ │ via GitHub login (DID = github_username + Ed25519 keypair)    │ │    │
│  │ └──────────────────────────────────────────────────────────────┘ │    │
│  └──────────────────────────────────────────────────────────────────┘    │
│                                                                           │
│                          [ Read the threat model → ]                      │
└──────────────────────────────────────────────────────────────────────────┘
```

**Image-gen prompt:**

> Architecture section on deep charcoal #0c0c14 with a soft
> emerald radial glow in the upper-left corner (8% opacity, large
> radius, subtle). Top-left: tiny mono eyebrow "CHAPTER 04+06 —
> ARCHITECTURE" in muted gray. Below: a tight Outfit 600 H2 "W3C
> did:key identity. Your math, not someone's user table." in light
> gray. Center: a pristine gapless bento grid — three smaller
> tiles in the top row (TOOLSHED, RESEARCH, user-negotiated rooms),
> each with a uppercase mono label + 2-line description; below
> them a single wide tile spanning the full row width describing
> the OAuth-anchored DID identity model. All tiles are dark
> elevated panels (#14141f) with thin 1px emerald borders at low
> opacity. Bottom-right: a single ghost CTA pill with emerald
> 1px border reading "Read the threat model →". 16:9 aspect,
> system-architecture diagram caliber, Vercel-docs feel.

**Implementation note:** merges existing chapters 04 + 06 into
one bento. Current ad-hoc terminal output blocks become the bento
tile content.

---

### 5.8 — SECTION 8 of 11: Comparison table

| Field | Value |
|-------|-------|
| **Composition anchor** | Off-grid editorial offset — header off-axis left, table fills full width |
| **Background mode** | Subtle texture (`--paper`) — light section break |
| **CTA style** | None (info section) |
| **Image scale** | 16:10 reference |

**Mockup:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│  ┌──────────┐                                                             │
│  │ CH. 02   │                                                             │
│  │ THE      │   Akashik is not on the treadmill.                          │
│  │ TREADMILL│   Five categories chase the same problem from the wrong end.│
│  └──────────┘                                                             │
│                                                                           │
│   ─────────────────────────────────────────────────────────────────────   │
│   product       │ category        │ what they share          │ verdict    │
│   ─────────────────────────────────────────────────────────────────────   │
│   mem0          │ memory layer    │ key-value scratchpad     │ stateful   │
│   ─────────────────────────────────────────────────────────────────────   │
│   Zep           │ memory layer    │ session ledger           │ append-only│
│   ─────────────────────────────────────────────────────────────────────   │
│   Letta (MemGPT)│ memory framework│ context window mgmt      │ paging     │
│   ─────────────────────────────────────────────────────────────────────   │
│   MemPalace     │ vector mem      │ embeddings + recall      │ uni-directional │
│   ─────────────────────────────────────────────────────────────────────   │
│   Mastra        │ agent stack     │ MCP server               │ framework  │
│   ─────────────────────────────────────────────────────────────────────   │
│                                                                           │
│   Akashik adds: federation, peer reputation, signed envelopes.           │
└──────────────────────────────────────────────────────────────────────────┘
```

**Image-gen prompt:**

> Comparison-table section on warm paper #f7f4ec, off-grid
> editorial offset. Upper-left corner: a small tagged label box
> "CH. 02 / THE TREADMILL" in mono uppercase, the box itself is
> a 1px charcoal border on paper. To the right of and below the
> label: a tight Outfit 600 H2 "Akashik is not on the
> treadmill." with a smaller subline "Five categories chase the
> same problem from the wrong end." Below the heading, a clean
> data table with 4 columns (product, category, what they share,
> verdict), 5 rows (mem0, Zep, Letta, MemPalace, Mastra), separated
> by hairline 1px charcoal divide-y rules — NO card backgrounds.
> Use JetBrains Mono for product names, Outfit 400 for body cells.
> The "verdict" column right-aligns single-word verdicts in muted
> emerald-ink #0f6a46. Below the table: one summary line in mono
> "Akashik adds: federation, peer reputation, signed
> envelopes." 16:10 aspect, premium-data-grid feel, NO card
> chrome.

**Implementation note:** existing chapter has card-style rows;
brand kit Rule 4 says ditch the cards, use `divide-y`.

---

### 5.9 — SECTION 9 of 11: Pillars (the opposite shape)

| Field | Value |
|-------|-------|
| **Composition anchor** | Bottom-left text over background image (`manifesto-illustration.svg` as ambient bg) |
| **Background mode** | Atmospheric photo with strong color grade — single-tone graded for brand mood (manifesto timeline illustration as bg, dimmed to 18% opacity) |
| **CTA style** | None (info section, MINI ambition) |
| **Image scale** | 21:9 reference, MINI ambition |

**Mockup:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  charcoal bg #0c0c14, manifesto-illustration.svg as 18%-opacity bg       │
│  (Napster→eMule→BitTorrent→IPFS→Akashik timeline, dimmed)                 │
│                                                                           │
│                                                                           │
│                                                                           │
│                                                                           │
│  CH. 03 — THE OPPOSITE SHAPE                                              │
│                                                                           │
│  Local-first. Peer-federated. Signed-by-default. Stale-aware.            │
│                                                                           │
│  Four pillars. None of them is "decentralized AI."                       │
└──────────────────────────────────────────────────────────────────────────┘
```

**Image-gen prompt:**

> Mini section on deep charcoal #0c0c14, with a faint horizontal
> timeline illustration as ambient background at ~18% opacity —
> the timeline shows nodes labeled "Napster 1999", "eMule 2002",
> "BitTorrent 2001", "IPFS 2014", and "Akashik 2026" connected
> by a dashed emerald line, all rendered in single-color emerald
> line art and subtly dimmed to feel atmospheric. Foreground:
> bottom-left anchor with a tiny mono uppercase eyebrow "CH. 03 —
> THE OPPOSITE SHAPE", below it a single tight Outfit 500 line
> "Local-first. Peer-federated. Signed-by-default. Stale-aware.",
> below that one more line in muted gray "Four pillars. None of
> them is 'decentralized AI.'". Lots of negative space — the
> illustration carries the metaphor, the text only labels it.
> 21:9 aspect, mini-section ambition, atmospheric historical feel.

**Implementation note:** uses `assets/manifesto-illustration.svg`
as ambient background. The four pillars become a structural
device for the section, not a card row.

---

### 5.10 — SECTION 10 of 11: Manifesto (trimmed, MINI)

| Field | Value |
|-------|-------|
| **Composition anchor** | Stacked center (text-only, ultra restraint) |
| **Background mode** | Pure solid field with soft ambient gradient depth (charcoal with ~5% emerald wash from bottom) |
| **CTA style** | Underlined inline link ("Read the full thesis →") |
| **Image scale** | 16:9 reference, MINI ambition |

**Mockup:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│                                                                           │
│                                                                           │
│                                                                           │
│              The web's first chapter was pages. Its next is               │
│              knowledge — the structured, current, attributed              │
│              shape of what each of us has learned.                        │
│                                                                           │
│              Frontier labs trained on what existed six months             │
│              ago. Akashik open-sources the knowledge graph               │
│              itself.                                                      │
│                                                                           │
│                          Read the full thesis →                           │
└──────────────────────────────────────────────────────────────────────────┘
```

**Image-gen prompt:**

> Mini manifesto section on deep charcoal #0c0c14 with a very
> subtle emerald gradient wash rising from the bottom 30% of the
> canvas at ~5% opacity. Centered stacked composition with
> generous top and bottom margins. Two short paragraphs in Outfit
> 400 light gray, max-width ~56ch, line-height 1.6, very calm.
> Below the paragraphs: a single underlined inline link in emerald
> with arrow → "Read the full thesis". No images, no embellishment,
> just typography + atmospheric background. 16:9 aspect,
> editorial-essay caliber, Stripe-Increment feel.

**Implementation note:** content is the trimmed 2-paragraph
manifesto per BRAND-KIT §6.5; full thesis lives at
`docs/manifesto.html`.

---

### 5.11 — SECTION 11 of 11: Finale — star + community

| Field | Value |
|-------|-------|
| **Composition anchor** | Centered statement — H2 + sub + install + dual-CTA + meta strip + live signals |
| **Background mode** | Cinematic tonal gradient (palette-matched, low chroma — charcoal at top fading to ink-800 at center fading to a warm ink-700 at bottom) |
| **CTA style** | Classic primary pill (Star) + Outline / ghost (Discussions) |
| **Image scale** | 16:9 reference |

**Mockup:**

```
┌──────────────────────────────────────────────────────────────────────────┐
│  cinematic gradient: ink-900 → ink-800 → ink-700                          │
│                                                                           │
│                                                                           │
│   The network gets smarter every time someone new runs a node.            │
│                                                                           │
│   You are the next peer. Every query you answer adds to what              │
│   the whole network knows.                                                │
│                                                                           │
│   $ git clone https://github.com/twocirclestudios/akashik.git        │
│   $ cd akashik && npm install && npm run bootstrap                   │
│                                                                           │
│         [ ☆ Star on GitHub ]      [ Join Discussions ]                    │
│                                                                           │
│   MIT  ·  no account  ·  no API key  ·  no cloud  ·  CPU-only             │
│                                                                           │
│   ☆ <live star count>  ·  <release version>                               │
│                                                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

**Image-gen prompt:**

> Finale CTA section on a cinematic vertical gradient — top is
> deep charcoal #0c0c14, middle transitions through #14141f, bottom
> warms into #1c1c28. Centered stacked composition. Top: a tight
> Outfit 600 H2 in light gray "The network gets smarter every time
> someone new runs a node." Below: an Outfit 400 sub paragraph "You
> are the next peer. Every query you answer adds to what the whole
> network knows." Below: a wide elevated dark mono code block
> with two lines of git clone + npm bootstrap commands, with a
> copy icon. Below the code block: two CTA buttons side by side —
> a primary emerald-fill pill "☆ Star on GitHub" and a ghost pill
> with emerald 1px border "Join Discussions". Below the CTAs: a
> thin metadata strip in mono muted gray "MIT · no account · no
> API key · no cloud · CPU-only". Bottom: a tiny mono signal line
> "☆ live star count · release version". 16:9 aspect, finale
> energy, calm-but-decisive, no fireworks, single emerald accent.

**Implementation note:** match SITE-REDESIGN-SPEC.md §5.

---

## 6 · Image-generation toolchain

### 6.1 Recommended tools (raster reference comps only)

| Tool | When to use | Notes |
|------|-------------|-------|
| **FLUX (1.1 Pro / dev)** | First pick. Best at prompt adherence on technical UI mocks. | Run via Replicate or fal.ai. Use `aspect_ratio: "16:9"` for hero/finale, `"21:9"` for live-graph + pillars, `"16:10"` for narrower content. |
| **Midjourney v7** | When a section needs "atmospheric" feel (pillars, manifesto) | Use `--ar 16:9 --style raw` to suppress mood-art bias |
| **DALL-E 3** | When the others over-stylize | Lower fidelity but very obedient to literal compositions |
| **Stable Diffusion XL** | Local / cost-free fallback | Use the SDXL Turbo or Lightning variants |
| **Banned for production assets** | (already in BRAND-KIT §8.4) | Production = SVG line art only. Raster is reference-only. |

### 6.2 Prompt structure (the format every §5 prompt follows)

Each prompt is structured as:

```
[section description] +
[background spec] +
[layout / composition anchor] +
[typography spec — exact fonts] +
[color palette — exact hex values] +
[component breakdown — what each region holds] +
[CTA / interaction state] +
[aspect ratio] +
[reference brand for tone calibration ("Linear", "Vercel docs", "Bun" — NOT "Apple", "Stripe-marketing")] +
[anti-tells: "no purple, no blue, no neon, no gradient text"]
```

Following this structure means an unfamiliar reviewer can paste any
of the 11 prompts into any of the recommended tools and get a comp
that aligns with the brand kit ±~15%.

### 6.3 Palette-match technique

Image-gen tools tend to drift saturation. Counter this:

- Specify hex values explicitly in every prompt (`#34d399` not "emerald")
- Add a negative prompt where supported: `--no purple, --no blue, --no neon, --no gradient text, --no glow`
- Generate 4 variants per section; pick the closest match to brand-kit
  tokens; do NOT post-edit to "fix" it (that signals over-correction)

### 6.4 Where to file the output

When raster comps are generated:

```
docs/comps/
├── 01-hero.png
├── 02-demo.png
├── 03-try.png
├── 04-how.png
├── 05-install.png
├── 06-bench.png
├── 07-arch.png
├── 08-compare.png
├── 09-shape.png
├── 10-thesis.png
└── 11-finale.png
```

These are review artifacts — `.gitignore` them, do not check in,
do not deploy. The implementation works against this doc, not
against the comp.

---

## 7 · Brand-kit reconciliation

This skill normally produces raster image-gen prompts. Akashik's
BRAND-KIT.md §8.4 explicitly bans Midjourney/DALL-E/SD/FLUX raster in
production. The two are reconciled by:

| Layer | Tool | Where it lives |
|-------|------|----------------|
| **Visual direction** | This doc + the §5 prompts | `docs/IMAGEGEN-FRONTEND-WEB.md` |
| **Reference comps** | FLUX/Midjourney/etc. raster output | `docs/comps/` (gitignored, review-only) |
| **Production assets** | Hand-authored SVG line art | `docs/assets/*.svg` |
| **Production GIFs** | VHS terminal recordings | `demo/scene-*.gif` |

Net rule: raster comps are **reference**. Production is **vector**.
A raster comp that wants to be in production = brand-kit violation.

---

## 8 · Pre-flight checklist

Before any of these comps go to a reviewer:

- [ ] All 11 sections have one image (no collapsing, no skipping)
- [ ] Composition anchor varies — at least 5 different anchors used
  across the page (current count: 9)
- [ ] Background mode varies — at least 6 different modes used
  (current count: 11, one per section)
- [ ] CTA style varies — at least 5 different styles used (current
  count: 7)
- [ ] Hero is **not** centered minimalist OR default left-text/
  right-image (asymmetric split is intentional, not lazy)
- [ ] Every prompt explicitly bans purple, blue, neon, gradient
  text
- [ ] Every prompt names the exact hex palette
- [ ] Every prompt cites a calibration brand (Linear / Vercel /
  Bun / Astro — NOT Apple / Stripe-marketing / Salesforce)
- [ ] Section rhythm follows §4: L M L M S L M M S S M
- [ ] Narrative spine ("living system") appears in at least 4
  sections' visual logic
- [ ] Second-read moment (live-counter pulse) appears once,
  unmistakably
- [ ] No fake KPI columns, no stock photo avatars, no Acme/Nexus
  brand slop, no "elevate / unleash" copy

When all 13 boxes check, the comp set is ready for review. If a
reviewer's note breaks one of them, edit this doc first, then
regenerate the affected comp(s) — never improvise.

---

*This doc is the visual-direction layer between SITE-REDESIGN-SPEC.md
(what to build) and the actual frontend implementation (how to code
it). When the implementation diverges from a comp, this doc is the
authority. When this doc diverges from BRAND-KIT.md, BRAND-KIT.md
wins.*
