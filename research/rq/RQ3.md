## RQ3 — Provenance buys calibration, not immunity: cryptographic attribution restores confidence where the agent is the weak link, but does not by itself "stop the lie"

**Answer.** Safe peer-to-peer reuse needs two separable layers: (1) a *provenance* layer that cryptographically binds each reused output to a stable, history-bearing identity (who produced it, over an unforgeable body), and (2) a *judgment* layer where the consuming agent reasons over those trust signals. The literature shows the retrieval/generation pipeline is trivially poisonable without (1)+(2); Folklore's measured evidence shows that on a *frontier* consumer the dominant risk is not adversary-following but **confidence miscalibration**. So crypto-attribution's measurable payoff is restoring calibrated confidence for weaker/gold-absent agents — not granting immunity to a strong one.

**What the literature shows.** Poisoning is cheap and the pipeline is the soft target. PoisonedRAG (arXiv:2402.07867) reaches a ~90% attack-success rate by injecting just **5** crafted texts per target question into a corpus of millions, under both black-box and white-box threat models, and reports that several tested defenses are insufficient. Backdoored Retrievers (arXiv:2410.14479) is sharper still: a **single** poisoned document plus a topic-trigger backdoor on the dense retriever's fine-tuning drives ASR to ~1.0 (100%) on Llama-3 and Mistral (0.75–0.9 on Vicuna), with the poison almost always retrieved in first position; it evaluates **no** defenses. These two agree — few documents, high ASR, immature defenses. RobustRAG (arXiv:2405.15556) is the partial rebuttal: an isolate-then-aggregate scheme (disjoint passage groups, per-group generation, secure keyword/decoding aggregation) yields *certifiable* lower bounds on response quality and drives empirical ASR from >90% to ~10% — but its certified robust accuracy is modest (~26–71% depending on task/model, well below clean accuracy) and is evaluated mainly at **k′=1 corrupted of k=10** retrieved. It does not cover majority corruption. EigenTrust (Kamvar et al., Stanford/WWW2003) attacks the *routing* layer instead: a global trust value as the left principal eigenvector of the normalized local-trust matrix, seeded by pre-trusted peers, which **in simulation** suppresses inauthentic downloads even with up to **70%** of peers in a malicious collective — but the authors explicitly flag that beyond ~40% via pseudospoofing/**Sybil** the guarantee needs an external cost-of-entry, and they bake in "no profit to newcomers" (anti-whitewashing). C2PA frames the provenance layer: signed, tamper-evident manifests attesting origin and edit history — a "nutrition label" for content — and, crucially, it attests *provenance and integrity, not truthfulness*.

**How it maps to Folklore.** The attack papers **confirm** Folklore's threat model: without trust signals, reused context is poisonable at 1–5 documents, so a federated reuse index *must* gate on provenance. Folklore's substrate operationalizes the C2PA scoping with per-match Ed25519 attestation and body-covering node attestation (measured live on a two-peer wire, not simulated), emitting per-result trust lines (signed-by-@handle / unsigned / unattributed-fresh-identity). EigenTrust **confirms** Folklore's central honesty point — a Sybil can always emit a *valid signature*, but attribution+history is the costly quantity — which is precisely EigenTrust's "no profit to newcomers / impose a cost of entry." Folklore **extends** EigenTrust's *simulated* 70%-collective result into a *measured* regime: on a controlled BEIR-SciFact poisoning eval with a 75% Sybil-majority of colluding poison (embedded injections + laundered citations), Opus 4.8 held attack-success ~0. But this is where the literature gets **challenged**, and where Folklore's discipline matters: provenance did not "win" that eval — the model simply did not follow the adversary; its observed degradation was verdicts shifting to UNCERTAIN (confidence loss), not adoption of the false claim. RobustRAG's relevance is exactly that its certified defense exists *because* the generator is assumed weak; Folklore's frontier consumer is already near-robust on accuracy, so the provenance layer's job shifts from blocking the lie to **re-calibrating** an over-cautious agent. The single signed+attributed peer hit that moved satisfaction 0.13→0.79 is that calibration signal made measurable — though it is a satisfaction-score movement, not an accuracy result.

**Open questions / the falsifier.** The hypothesis — provenance restores calibrated confidence specifically for weaker agents / gold-absent regimes where the *baseline is actually vulnerable* — is untested: Folklore's null was measured only on one frontier model, one dataset. The decisive experiment is the same 75%-Sybil poison eval on a Haiku/7B-class consumer, with vs. without the signed trust lines. **The falsifier:** if a weak model's ASR and calibration are unchanged by the trust lines (it follows the poison majority regardless), then attribution carries no measurable defensive value and the sharpened hypothesis dies. A second falsifier is structural — if attribution+history turns out *cheaply* forgeable (aged fake identities, laundered reputation), the whole substrate collapses, exactly the >40%-Sybil boundary EigenTrust warned about.

---
### Reviewer corrections (adversarial pass)
- Reframed the headline so provenance is not credited with "stopping" the SciFact poison; the frontier model's own robustness did, and only via confidence degradation — corrected an implicit overclaim.
- Labeled EigenTrust's 70%-collective result as **simulated** and Folklore's 75%-Sybil result as **measured**, and explicitly declined to claim Folklore "matches/beats" EigenTrust (different mechanisms, different regimes — apples-to-oranges).
- Presented RobustRAG's certified accuracy as a **lower-bound range (~26–71%, below clean accuracy)** at k′=1-of-10, not a headline number, and noted its guarantee does not cover majority corruption — preventing a simulator-vs-measured / scope conflation.
- Demoted the 0.13→0.79 satisfaction jump to a **calibration/UX signal, n likely =1**, not a robustness/accuracy result.
- Constrained "ASR~0" to one model (Opus 4.8) and one dataset (SciFact); removed any implication that "LLMs resist poison" in general.
- Stated attribution is "not cheaply forgeable" rather than unforgeable, and tied the limit to EigenTrust's explicit >40% Sybil caveat.

---

### Bench update (loop, 2026-06-27) — the sharpened experiment RAN, and it is positive

The "untested on weaker agents / gold-absent" open question above is now **answered,
measured**. `eval/RESULTS-LOG.md` + `eval/out.run6-haiku/summary.json` (Haiku agent,
Opus judge, BEIR SciFact, gold-displaced regime, A1/A2/A3 × {25,50,75}%, n=82, 2,957
judged cells):

- The runs-1–4 null was an **artifact** of force-pinning the gold passage in the
  top-k window (PoisonedRAG's own failure analysis).
- With gold displaced, the **baseline is genuinely poisoned**: flip-ASR T0 **0.53–0.64**,
  attack-effect ~0.83.
- The **provenance ranker (T1)** — drop every unsigned passage, keep the
  attributed-signed source — cuts flip-ASR **~25× (0.589→0.024)** and attack-effect
  **~8.7× (0.838→0.098)**, and is **poison-rate-invariant**. T2 (provenance-in-prompt)
  blocks the lie but converts it to doubt (T1 > T2).
- Per-attack: A1 authority 0.94→≤0.03, A3 citation-laundering 0.86→≤0.03, A2 crude
  injection already ignored.

So the sharpened RQ3 hypothesis — provenance restores correctness/calibration in the
regime where the baseline is actually vulnerable — is **confirmed**. This supersedes
the "disciplined null" reading; the whitepaper §7.4 was corrected to this positive
result. See `research/proof/`.
