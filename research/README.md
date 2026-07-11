# Folklore — Focused Research (working notes)

Local-only, gitignored. This folder is the methodical research log for the
*broad reuse / compounding* thesis behind Folklore (codename `akashik`): a
peer-to-peer inference layer where participants share previously generated,
high-quality model outputs through a federated vector index, so that a
semantically similar query can reuse a prior result as context instead of
re-running the remote model call.

It re-broadens past the narrow Fellows pivot (provenance / poisoning-defense),
which is kept as **one pillar** rather than the whole story. See
`docs/FELLOWS-FRAMING.md` for the narrow framing and its disciplined null.

## Layout

- `00-research-agenda.md` — the thesis, the seven research questions (RQ1–RQ7),
  current in-repo evidence per RQ, hypotheses, and what would falsify each.
- `01-notebook-discovery.md` — running log of NotebookLM Q&A (notebook 1 =
  `akashik` background corpus; notebook 2 = `Folklore` focused workspace).
- `sources/` — curated authoritative sources per RQ + the manifest used to seed
  notebook 2.
- `rq/` — one deep-dive Q&A file per research question (notebook answers + web
  grounding + synthesis + follow-ups).
- `90-synthesis.md` — cross-RQ synthesis: what holds, what is a null, what is
  still simulator-only.
- `91-next-experiments.md` — the rigorous-benchmark / data-collection plan that
  the immediate research challenge calls for.
- `experiments/` — runnable protocols E1–E5 (one file each) that turn that plan
  into executable benchmarks grounded in the real `bench/` + `scripts/fellows-eval/`
  harness, plus a consolidated build-queue of the new code each needs.

## Method (the discipline this log enforces)

1. **Memory first, web second.** Consult the local notebooks (and the live
   Folklore graph) before outbound lookups.
2. **Document every question and its answer**, verbatim where it matters, so the
   chain from assumption → evidence → conclusion is auditable.
3. **Honest benches only** — matched comparisons, no weak-baseline inflation,
   and always label *simulator* vs *measured*. A clean null is a result.

## Notebooks

| # | Name | URL | Role |
|---|------|-----|------|
| 1 | akashik | `…/notebook/a53976eb-b587-40bb-bd47-0f56f6bd9fec` | broad background corpus (federation, provenance, trust, poisoning defenses) |
| 2 | Folklore | `…/notebook/f39aeb08-cecd-45f2-a03e-415c0c716eeb` | focused workspace — seeded for the reuse/compounding agenda |
