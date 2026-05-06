# wellinformed — Demo Manuscript

**Target length:** 6–7 minutes total. **Format:** asciinema recording + screen capture for the
Claude Code panel scenes. Each scene is self-contained — you can re-record one without
re-doing the others.

**Audience:** an engineer or researcher who has heard of "knowledge graph for AI agents" but
hasn't yet seen one in action. The demo proves three claims, in order:

1. **wellinformed turns local research into agent context faster than the agent can search the web.**
2. **It surfaces context proactively — you don't ask for it, the hook injects it before the LLM tool call.**
3. **It federates over P2P — peers pull each other's knowledge without uploading anything to a server.**

The corpus is small but realistic: 15 nodes about **cryogenic liquid-hydrogen leak detection
and the LLMs/ML used in that field.** Niche enough that base-model Claude has to web-search for
specifics, common enough that real researchers exist to point at.

---

## Pre-recording checklist

Run all of these once before recording.

```bash
# 1. Clean wellinformed home so the demo starts from a known state.
mv ~/.wellinformed ~/.wellinformed.backup-$(date +%s) 2>/dev/null || true

# 2. Onboard fresh — the wizard now has a GitHub-login step we want to show.
#    Set the OAuth client id BEFORE running, otherwise the GitHub step
#    will render the "skipped, here's how to enable" path which is also
#    valid demo material. Pick whichever story you want to tell.
export WELLINFORMED_GITHUB_CLIENT_ID="<your_dev_oauth_app_client_id>"   # optional
wellinformed onboard --yes

# 3. Verify the daemon is up + IPC reachable.
wellinformed daemon status
wellinformed metrics | jq .gauges     # expect queue.queued=0, queue.running=0

# 4. Load the demo corpus (this is what the manuscript walks through).
bash demo/setup.sh

# 5. Confirm a sample query works end-to-end before recording.
wellinformed ask "boil-off detection in cryogenic hydrogen tanks" --k 3
#  expect: agent contract first, ≥0.65 satisfaction, 3 hits citing the corpus
```

If any of those fail, fix before recording. The demo's credibility evaporates if the user sees
a stack trace.

**Recommended terminal:** dark theme, font ≥ 16pt, 100×30 cell. asciinema rec at 60 FPS for
playback smoothness.

---

## Scene 0 — Title card (10 sec)

**On screen (text overlay or first terminal output):**

```
wellinformed
A local-first knowledge graph for your AI agents.
P2P. Signed. Sub-second.
```

**Voiceover (or terminal echo):**

> Three minutes to a working knowledge graph that makes Claude smarter,
> faster, and offline-capable. Let's go.

---

## Scene 1 — Load 15 research nodes (40 sec)

**Goal:** show how easy it is to seed a research corpus. The user's actual workflow is
"point wellinformed at a folder of notes" — that's what we demonstrate.

**Commands:**

```bash
$ ls demo/research-corpus
01-fiber-optic-h2-sensor.md      09-multimodal-sensor-fusion-lh2.md
02-laser-raman-leak-detection.md 10-quench-detection-lstm.md
03-thermal-imaging-cryo.md       11-physics-informed-nn-cryo.md
04-mass-spec-effluent.md         12-stanford-cryo-lab-publications.md
05-fbg-strain-sensors.md         13-nasa-glenn-h2-research.md
06-acoustic-emission-h2.md       14-eth-zurich-aerospace-lh2.md
07-ortho-para-ratio-ml.md        15-public-h2-sensor-datasets.md
08-boil-off-rate-monitoring.md

$ wellinformed this me
indexing demo/research-corpus … 15 files / 47 chunks / 2.1 s
graph:    47 nodes added
entities: 9 new (fiber-optic-sensor, raman-spectroscopy, lstm,
          physics-informed-neural-network, ortho-para-ratio,
          stanford-cryo-lab, nasa-glenn, eth-zurich-aerospace, lh2)
vectors:  47 embeddings (384d, all-MiniLM-L6-v2)
```

**Voiceover:**

> Fifteen markdown files about cryogenic liquid-hydrogen leak detection
> and the ML used in that field. `wellinformed this me` chunks them,
> embeds them, and extracts entities — all on this laptop, nothing
> leaves the machine. Two seconds for the whole thing.

---

## Scene 2 — Direct retrieval, with timing (40 sec)

**Goal:** show that the local graph answers in milliseconds with a high satisfaction score.
This is the baseline before we get to the Claude Code integration.

**Command:**

```bash
$ time wellinformed ask "what ML methods are used for liquid hydrogen leak detection"
```

**What viewers see (annotated):**

```
# wellinformed agent contract (hook_version: 2)         ◄── decision FIRST
action:        use_memory                               ◄── new in this release
satisfaction:  0.84  (range 0.00–1.00)
thresholds:    ≥0.85 use_memory · ≥0.65 verify_one_source · ≥0.40 search_required · <0.40 ask_user
signals:       fresh=5 stale=0 missing_provenance=0 observed=4/5
reasons:       top hit very close · 5 fresh nodes · strong provenance coverage

## semantic search results
ranked by: relevance × recency-decay

### Quench-detection LSTMs for cryogenic systems
relevance: 0.871 (cosine_distance 0.129) | room: research
mentions: lstm, lh2, ortho-para-ratio
[…actual chunk text…]

### Multimodal sensor fusion for LH2 leak monitoring
relevance: 0.842 …
[…]

### Physics-informed neural networks for cryogenic flow modelling
relevance: 0.811 …
[…]

real    0m0.082s        ◄── EIGHTY-TWO MILLISECONDS
user    0m0.061s
sys     0m0.018s
```

**Voiceover:**

> Eighty-two milliseconds. The decision contract is at the top — `use_memory`
> means an agent reading this can trust the cache, no web search needed.
> The threshold legend is in the block itself, so any LLM — Claude, Codex,
> Gemini, Cursor — interprets the score the same way.

---

## Scene 3 — Claude Code session (the magic moment, 80 sec)

**Goal:** show the PreToolUse hook injecting context automatically. The user types a prompt,
Claude calls a tool, the hook fires, the answer arrives with sources cited from the local
graph — no `wellinformed` invocation visible.

**Setup:** open a Claude Code session in a fresh directory. The `.claude/settings.json`
already has the wellinformed PreToolUse hook wired (from `wellinformed onboard` earlier).

**On-screen prompt (typed into Claude Code):**

```
What ML approaches have researchers tried for liquid-hydrogen leak detection,
and which group at Stanford has been publishing on quench-detection LSTMs?
```

**What viewers see (split screen):**

- LEFT (Claude Code transcript): Claude responds in 1.5 s with specifics — names of
  techniques, the Stanford lab, citations to specific notes from the corpus. Sources show
  `_source: research/12-stanford-cryo-lab-publications.md`.
- RIGHT (terminal tail of `~/.wellinformed/daemon.log`): the hook fires, `ask` runs,
  satisfaction=0.86, `action: use_memory`, ~80 ms.

**Voiceover:**

> Claude Code session. I ask a complex question. Behind the scenes, the
> wellinformed hook fires before Claude's tool call, runs `ask`, and
> injects the result block into Claude's context. Claude answers in
> 1.5 seconds with citations to my own research notes. **I never typed
> `wellinformed`.** The agent is just smarter.

---

## Scene 4 — Side-by-side: Claude alone vs Claude + wellinformed (90 sec)

**Goal:** the headline timing comparison. Same question, two sessions, visible time delta.

**Setup:** two Claude Code panels side-by-side. **LEFT** has the wellinformed hook
DISABLED for this scene only (rename `.claude/settings.json` → `.claude/settings.json.bak`
in that workspace). **RIGHT** has the hook enabled.

**Question typed simultaneously into both:**

```
Which research group is publishing on quench-detection LSTMs for
cryogenic hydrogen storage? Cite specific papers if you know them.
```

**What viewers see:**

- **LEFT** (Claude alone): Claude says "let me search" → WebSearch tool call → ~12-18 sec
  to gather generic results. Often hedges ("I don't have specific information…").
- **RIGHT** (Claude + wellinformed): Claude responds in ~1.5 sec with specifics from the
  corpus — Stanford Cryogenic Systems Lab, the LSTM paper, the dataset reference.

**On-screen timer overlay** (or the `time` wrapper command shown clearly).

**Voiceover:**

> Same question. Same model. The only difference is whether wellinformed
> injected the local graph context. Left: 14 seconds, generic answer.
> Right: 1.5 seconds, specific answer with my own citations.
> **Order-of-magnitude faster, dramatically more useful.**

---

## Scene 5 — Recall by entity, not just by similarity (40 sec)

**Goal:** show that wellinformed has TWO retrieval channels — semantic search AND
entity-keyed graph traversal. The second one catches what vector embeddings miss.

**Command:**

```bash
$ wellinformed recall stanford-cryo-lab
```

**What viewers see:**

```
recall: stanford-cryo-lab (canonical, type=lab, mentions=4)

  research/12-stanford-cryo-lab-publications.md      [research, today]
    "The Stanford Cryogenic Systems Lab maintains an open dataset of …"

  research/10-quench-detection-lstm.md               [research, today]
    "quench events in superconducting magnets … work originating at
     Stanford's lab on the SLAC accelerator complex."

  research/14-eth-zurich-aerospace-lh2.md            [research, today]
    "ETH Zurich's collaboration with the Stanford lab on H2 storage …"

  research/15-public-h2-sensor-datasets.md           [research, today]
    "datasets curated by the Stanford lab and NASA Glenn …"

action: use_memory  satisfaction: 0.91  · 4 mentions across 4 chunks
```

**Voiceover:**

> Asking about "stanford-cryo-lab" by name doesn't always embed well.
> But entity recall does a one-hop graph traversal — every chunk that
> mentions this entity, anywhere in the corpus, ranked by recency.
> Four mentions, four chunks, every one cited.

---

## Scene 6 — P2P touch — pulling a peer's knowledge (60 sec)

**Goal:** show federation. A second peer (a colleague) has different research nodes —
you pull theirs without copying any files.

**Setup (do this BEFORE recording):**

```bash
# Peer B (separate machine or another Wellinformed home dir):
WELLINFORMED_HOME=~/.wellinformed-peerB wellinformed onboard --yes
WELLINFORMED_HOME=~/.wellinformed-peerB wellinformed save \
  --room research --type concept --label "open-source LH2 spectrometers" \
  --text "Recent open-hardware projects for portable Raman LH2 sensors include …"
WELLINFORMED_HOME=~/.wellinformed-peerB wellinformed share room research

# Peer A (your main demo machine):
wellinformed peer add /ip4/127.0.0.1/tcp/<peerB-port>/p2p/<peerB-id>
wellinformed share room research
```

**Recording commands:**

```bash
$ wellinformed peer list
peer-A → peer-B  (connected, last_pull 2 min ago)
shared rooms: research, toolshed

$ wellinformed touch --peer peer-B --room research --label "open-source LH2 spectrometers"
touch: peer-B/research → 1 chunk pulled (0.4 KB) in 380 ms
graph updated: 1 new chunk · 0 entities · _source_peer=peer-B

$ wellinformed ask "open-source spectrometer projects for hydrogen sensing"
…
### open-source LH2 spectrometers   _source_peer=peer-B
relevance: 0.886 …
```

**Voiceover:**

> A peer — could be a colleague's laptop on the same network or a
> remote teammate on the open internet — has a research note I don't.
> `wellinformed touch` pulls just that note, attributes it to the peer
> on import, and now my next `ask` surfaces it as if I'd written it
> myself. Nothing was uploaded to a server. The peer never got my
> query — just the entity name.

---

## Scene 7 — Codebase Q&A: not just research, but code too (30 sec)

**Goal:** prove that the same primitives work over the user's own code. Show a coding
question answered with citations from `wellinformed`'s own source tree.

**Setup:** in the wellinformed repo:

```bash
$ wellinformed this me
indexing /Users/.../wellinformed … 312 chunks / 5.3 s
```

**Recording prompt (in Claude Code):**

```
How does the wellinformed daemon do bounded backpressure on the job queue?
```

**What viewers see (in Claude Code):**

Claude answers with:
- The `MAX_QUEUED = 1000` constant + the file path
- The dedup-by-kind+payload behavior + line reference
- The frequency-Map signature change for `touchMany`
- Cites `src/daemon/job-queue.ts` chunks specifically

All from the local code graph. No web search, no GitHub API call.

**Voiceover:**

> Same primitives over my own codebase. Claude knows my code now.
> Three commits, two pushes, the answer stays current because the
> file watcher re-ingests on save.

---

## Scene 8 — Closing card (15 sec)

**On screen:**

```
wellinformed

  ✓ 80 ms local retrieval
  ✓ proactive hook injection — no command needed
  ✓ P2P federation, signed envelopes, no server
  ✓ entity-aware recall, satisfaction-scored decisions
  ✓ works over research, code, and your own past notes

  github.com/SaharBarak/wellinformed
```

**Voiceover:**

> Three things make wellinformed different. It's local-first — your
> graph never leaves your machine unless you opt in. It's proactive —
> the hook fires before Claude can web-search. And it federates without
> a server, so two laptops on the same network share what they know
> without a middleman. Try it: github.com/SaharBarak/wellinformed.

---

## Production checklist

- [ ] Demo runs end-to-end without errors. Test the full path twice
  before recording.
- [ ] Both Claude Code panels in scene 4 use the same model
  (`claude-sonnet-4-6` recommended) so the comparison is fair.
- [ ] Time the full demo: target 6:00–7:00.
- [ ] Asciinema recording at 60 FPS, font 16pt+, dark theme.
- [ ] Side-by-side scene uses OBS or screen with two panels — make sure
  both are zoomed equally.
- [ ] Subtitles for voiceover for accessibility + auto-translation.
- [ ] Final upload: GitHub repo `demo/` directory + asciinema.org for
  the terminal-only scenes + YouTube for the full thing.

## What is in the repo alongside this manuscript

Recorded artifacts (already in the repo):
- `demo/MANUSCRIPT.md` — this file.
- `demo/README.md` — quickstart + recorded-vs-live mapping.
- `demo/research-corpus/` — 15 markdown files (loaded in scene 1).
- `demo/setup.sh` — one-shot setup script.
- `demo/screencast.tape` + `demo/screencast.gif` — VHS recording of
  scenes 0, 2, 5, 8 against the real corpus.
- `demo/timing.tape` + `demo/timing.gif` — single-shot headline-timing
  teaser; the 4-second proof that retrieval is sub-second.

Live-capture scenes (filled when recording):
- Scenes 3, 4, 6, 7 — Claude Code session, side-by-side timing,
  P2P touch, codebase Q&A. These need a real Claude Code panel
  alongside a terminal; OBS or macOS Screen Capture is the tool.
  Stills go into `demo/screenshots/`; full footage into
  `demo/walkthrough.mp4` (gitignored — link to a hosted version
  from the README).

## Manuscript change log

- v1 — initial draft. 15-node corpus, 8 scenes, 6–7 min target.
