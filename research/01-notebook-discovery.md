# NotebookLM Discovery Log

*Running Q&A log. Each entry = one NotebookLM query (each query is an independent
browser session, so context is restated per question). Answers are Gemini's
source-grounded synthesis over the notebook's own sources.*

---

## Q0.1 — Notebook 1 (`akashik`) overview

**Notebook:** `…/notebook/a53976eb-b587-40bb-bd47-0f56f6bd9fec`

**Q.** What is the content of this notebook? Topics, theses, experiments, sources;
list the distinct themes.

**A (summary).** The akashik notebook is a broad corpus organized around three
themes:

1. **Metadata traveling with federated search results** — provenance, freshness,
   trust. Mandatory components: cryptographic content identifiers (CID / SHA-256),
   digital signatures bound to a verified identity / DID (e.g. Sigstore, verified
   GitHub handle), supply-chain lineage (SBOM / AIBOM), source URI + fetch
   timestamp + grounding artifacts, and cryptographic TTL / signed Certificate
   Revocation List so peers can prune revoked or expired knowledge.

2. **Content transfer mechanics between peers** — asymmetric cooperative caching
   (requests fan out hop-by-hop through cache layers; data replies tunnel
   directly and write only to nodes that actually need the content, bypassing
   user-space cache processing on uninvolved nodes); on-demand / lazy retrieval
   via OCI manifests (resolve query → CID, fetch lightweight manifest first,
   download heavy layers only on affirmative selection).

3. **Defenses against poisoned / adversarial responses** — because signatures
   guarantee identity but not semantic accuracy: ingestion-level embedding
   anomaly detection (poison clusters as statistical outliers, quarantine before
   indexing); zero-knowledge causal leave-one-out filtering (remove each doc,
   measure answer-stability / entropy differential; a doc whose removal causes a
   radical shift is an adversarial hijack and is dropped); chunk-wise perplexity
   (PD / PM) + text-similarity filtering for adversarially optimized payloads;
   and asymmetric Sybil-proof reputation (EigenTrust with periodic teleport to
   pre-trusted seed nodes to isolate Sybil clusters).

**Read.** Notebook 1 leans heavily toward the **infrastructure + trust + poisoning**
side (the narrow Fellows pillar). It is rich but, as the user noted, unfocused —
it does not directly target the reuse-quality / savings / compounding questions.
Useful as the background corpus for **RQ3** (trust/provenance) and parts of
**RQ2** (staleness/TTL) and **RQ6** (defense benchmarks).

---

## Q0.2 — Notebook 2 (`Folklore`) overview

**Notebook:** `…/notebook/f39aeb08-cecd-45f2-a03e-415c0c716eeb`

**Q.** Same discovery question.

**A.** The notebook is **empty** — no sources uploaded. NotebookLM offered to run
a Fast-research search to seed it.

**Decision (from user).**
- **Scope:** center the **broad reuse / compounding agenda** (superset); treat
  poisoning-defense as one pillar.
- **Build method:** **both** — curate authoritative papers per RQ and add them by
  URL, *and* run NotebookLM Fast-research to broaden coverage.

Next: curate sources per RQ (see `sources/`), seed notebook 2, then run the
focused Q&A pass against the grounded notebook.

---

## Q1.1 — Notebook 1 (`akashik`): trust-decision deep-dive (RQ3)

**Q.** How should a consuming agent decide whether to trust/reuse a peer's
answer? (a) trust/provenance signals; (b) decision rules/thresholds; (c)
Sybil-resistant reputation; (d) limits of cryptographic identity.

**A (summary).** NotebookLM re-emphasised the **payload that must travel** with a
trusted result: a digital signature bound to a verified identity / DID (verified
GitHub handle), non-repudiation; the original source URI + exact fetch timestamp
+ raw grounding artifacts; optional AIBOM/SBOM lineage; and **freshness /
revocation** via cryptographic TTL plus an inclusion proof from an append-only
transparency log (Sigstore / SCITT) or a CRL check so peers auto-prune revoked
knowledge. (Parts (b)–(d) — thresholds, EigenTrust Sybil resistance, and the
"signature proves identity not accuracy" limit — were covered by the Q0.1
discovery answer: embedding-anomaly quarantine, zero-knowledge causal LOO,
perplexity filtering, and EigenTrust's pre-trusted-seed teleport.)

## Seeding notebook 2

- **34 curated sources added** via `add_source.py --urls-file` (Websites bulk
  paste). Verified by listing: all 34 present (arXiv / ACL / OpenReview / USENIX
  / Stanford PDF / C2PA). See `sources/notebook2-manifest.txt`.
- **Fast-research broaden #1** (`--research "decentralized peer-to-peer LLM
  inference networks and cross-user sharing/caching of model outputs"`) ran and
  added discovered sources. **#2** (staleness/TTL) hit a NotebookLM DOM quirk
  (the discover textarea was `readonly` until mode-select); not retried per the
  skill's "don't loop on browser failures" guidance.

## Tooling note — two skill fixes made this session

The NotebookLM skill had drifted against the current NotebookLM DOM:

1. **`add_source.py` — add-source dialog detection.** An *empty* notebook
   auto-opens the Add-source dialog, but `click_add_source` only looked for an
   "Add" button and reported failure ("could not open add-source dialog") even
   though the dialog was present. Fixed: added `dialog_is_open()` (detects the
   `Websites`/`Upload files`/`Copied text` option buttons), short-circuit when the
   dialog is already open, prefer the stable role-button for "Websites", and make
   the URL field discovery robust to placeholder drift (textbox/textarea/input
   fallbacks).
2. **`ask_question.py` — stale-answer read.** NotebookLM persists chat history, so
   a fresh browser session shows the *previous* question's answer as the last
   (already-stable) bubble. The poller locked onto it immediately and returned the
   wrong answer (twice it returned the "list sources" output to unrelated
   questions). Fixed: snapshot the pre-submit answer text and only accept a new
   bubble whose text differs; raised the timeout to 180s.

## Throttle event — focused Q&A pass deferred

After ~9 NotebookLM sessions in quick succession, notebook chat stopped
generating new answers (the known free-tier rate limit — "50/day; wait or switch
account"). With the stale-read bug fixed, this now surfaces honestly as a
timeout rather than a wrong answer. **Decision:** stop querying NotebookLM for
now; notebook 2 is fully seeded and ready for a later focused Q&A pass. The
focused research below is completed by reading the **primary sources directly**
(parallel WebFetch synthesis → per-RQ notes in `rq/`, cross-RQ `90-synthesis.md`,
and `91-next-experiments.md`) — higher-fidelity than NotebookLM's grounded
summaries, and not blocked by the rate limit.

### To resume the NotebookLM pass later

```bash
cd ~/.claude/skills/notebooklm
# one focused query at a time (space them out to avoid the rate limit):
python3 scripts/run.py ask_question.py \
  --question "<one focused RQ question>" \
  --notebook-url "https://notebooklm.google.com/notebook/f39aeb08-cecd-45f2-a03e-415c0c716eeb"
```

The focused questions to run are FQ1–FQ6 (reuse→quality boundary; staleness
detection; savings quantification; cross-user compounding; benchmarks/gaps;
architectures) — see `00-research-agenda.md` for their RQ framing.

---
