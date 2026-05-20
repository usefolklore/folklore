# Session Handoff — Phase 23.7 / Hetzner OpenClaw

**Drafted:** 2026-05-20
**Replaces:** prior v2.1 Path B handoff (archived to git history at `6b5d7e1`)
**Reason for handoff:** context window pressure; about to nuke a remote VM and need clean context for the install + benchmark phase
**Last commit:** local working tree dirty — no pushes, no commits this session beyond what's in `git status`

---

## 1. Where we are right now

Phase 21 + 22 + 23 + 23.6.1 all landed locally. Unified memory bench
composite: **0.9012 / 1.0000** with all 9 dimensions reporting.
Acceptance gates per suite documented in
`docs/product/BENCHMARKS.md`.

**Active task — partially complete:** Hetzner rebuild of server
`openclaw` (ID `125481213`, IP `91.98.75.154`) to bare Ubuntu 24.04
ARM, then install OpenClaw + Codex provider, wire MCP over
reverse-SSH, run Phase 23.7 (real public-corpus benches) on it.

**2026-05-20 update:** the 3 real-corpus adapters (BEIR SciFact,
LongMemEval-S oracle, LoCoMo factual) are now written and env-gated
under `tests/` — see §7 below. Remaining work is purely the remote
box (rebuild → OpenClaw install → MCP tunnel → run the gated suites).

**2026-05-20 — late afternoon push.** Hetzner box rebuilt twice
(first attempt had no SSH key injected; second pass used
`--user-data-from-file /tmp/handoff-cloud-init.yaml` with the local
pubkey in cloud-init's `ssh_authorized_keys`). Firewall reopened —
current Mac public IP `79.177.151.9` is now in the `openclaw-fw`
allowlist. Base toolchain installed (Node 22.22.2, npm 10.9.7, build-
essential, git, jq, tmux). OpenClaw `2026.5.18` installed via
`npm install -g openclaw`; gateway running as a systemd service
(`openclaw-gateway.service`) on `127.0.0.1:37777` with token auth
(token in `/etc/openclaw-gateway.env` mode 600). Loopback bind, no
external exposure. wellinformed working tree rsynced to
`/opt/wellinformed/` (`npm install` complete — 503 packages). All
three datasets staged: `/data/scifact` (8 MB), `/data/longmemeval`
(15 MB `longmemeval_oracle.json`), `/data/locomo` (2.7 MB
`locomo10.json`). Composite bench currently running in tmux session
`bench` writing to `/data/reports/run.{log,jsonl}`. Background
watcher will notify on completion.

## 2. The exact blocker — please resume here

The Claude Code auto-mode classifier rejects `hcloud server rebuild`
even after the user explicitly answered "Yes — proceed with the
rebuild" in an AskUserQuestion. Classifier reasoning is wrong
("user's confirmation question was never answered") — false positive.

**Workaround already negotiated with user:** they run the rebuild
themselves via the `!` shell prefix so the command goes through the
session as user-typed shell rather than a Claude tool call.

**The exact command to paste with `!` prefix** (user has the new
read+write HCLOUD token — DO NOT commit it; paste-back on resume):

```
! HCLOUD_TOKEN='<paste new read+write token here>' hcloud server rebuild 125481213 --image ubuntu-24.04
```

The original token in earlier turns (`clVNJq…`) was read-only.
User generated a new read+write one (`geTLI4ZUN1Mj…`) which the
classifier wouldn't let me invoke. User should paste either the same
new token OR a freshly minted one on resume.

## 3. What's confirmed about the target

| Field | Value |
|---|---|
| Project | "other" hcloud project (NOT `openclaw-project` which is the default context on this Mac) |
| Server name | `openclaw` |
| Server ID | `125481213` |
| IPv4 | `91.98.75.154` |
| Type | CAX11 (ARM, 2 cores, 4 GB RAM, 40 GB disk) |
| Current OS | Ubuntu 24.04 ARM (will be wiped + reinstalled with same image) |
| User authorization | YES — explicitly confirmed nuke in AskUserQuestion |
| SSH alias on this Mac | `hetzner` (user `handoff`) and `hetzner-root` (user `root`) — both point at `91.98.75.154` via `~/.ssh/handoff_ed25519` |
| Mac public IP (whitelisted in Hetzner firewall) | `5.28.182.156` |

## 4. Plan after rebuild lands

Order of operations once `ssh hetzner-root` starts responding (usually 30-60 s after rebuild API call returns):

1. **ssh in** as root via `hetzner-root`. Verify clean state: `lsb_release -a`, `df -h`, `free -h`, `ip a`.
2. **Install OpenClaw.** User wants the `octo:claw` skill flow — Ubuntu/Debian install path. Stack:
   - apt update + upgrade
   - install Node 22 LTS (NodeSource repo), git, curl, build-essential
   - install OpenClaw via the canonical install command (check `octo:claw` skill at resume time)
   - systemd service for the daemon
3. **Codex API key** → `/etc/openclaw/.env` mode 600. User will paste it on resume via AskUserQuestion. NEVER write to git, NEVER log it.
4. **MCP transport** = reverse-SSH (Tailscale not available per user). Plan: OpenClaw binds MCP on `127.0.0.1:7173` on the VM; this Mac opens `ssh -R 7173:127.0.0.1:7173 hetzner-root` as a persistent tunnel (or `autossh` for resilience); MCP server added to `~/.claude.json` on this Mac with the loopback URL.
5. **Phase 23.7 — real public-corpus benches.** Three adapters to write under `tests/bench/public-real/`:
   - `bench-scifact-real.test.ts` — full BEIR SciFact (5,183 docs × 300 queries), NDCG@10. Replaces the 30-doc proxy currently feeding `beirSciFactNdcg10`.
   - `bench-longmemeval-real.test.ts` — LongMemEval-S oracle split (500 questions, ~3 GB HF download). Recall@5 against gold evidence sessions.
   - `bench-locomo-real.test.ts` — LoCoMo factual subset from `snap-research/locomo` GitHub. F1 via the same harmonic-mean scorer the synthetic suite uses.
   All three are env-gated (`WELLINFORMED_BENCH_PUBLIC_REAL=1`) so CI stays fast — they only run on the Hetzner box.
6. **Run + report.** Expected composite jump: 0.9012 → ~0.95 depending on real-corpus reality (BEIR SOTA is 0.7522 not 1.0 so composite can't hit 1.0 on real data).

## 5. Secrets discipline

- **HCLOUD_TOKEN (new read+write):** lives in env only for the lifetime of `hcloud` commands. NEVER write to disk or commit. On final cleanup: `unset HCLOUD_TOKEN`.
- **HCLOUD_TOKEN (original read-only `clVNJq…`):** safe to leave alone; user generated it. We're not using it.
- **Codex API key (not yet provided):** user will paste via AskUserQuestion on resume. Goes ONLY to `/etc/openclaw/.env` on the VM via heredoc-piped ssh. Never on this Mac's disk.
- **SSH key `~/.ssh/handoff_ed25519`:** already on disk, user-managed, don't touch.

## 6. Files touched this session (uncommitted in working tree)

| Layer | File | Purpose |
|---|---|---|
| domain | `src/domain/cross-rerank.ts` | NEW — Phase 21 cross-encoder rerank pure logic |
| domain | `src/domain/long-term-memory.ts` | NEW — tier vocab + Beta(α,β) + retention math |
| domain | `src/domain/write-time-gate.ts` | NEW — write-time gating filter |
| domain | `src/domain/auto-forget.ts` | NEW — auto-forget planner |
| domain | `src/domain/bench-types.ts` | NEW — typed bench report shapes + composite |
| domain | `src/domain/errors.ts` | EDIT — added RerankError + ConsolidationError variants |
| infra | `src/infrastructure/cross-encoder.ts` | NEW — Xenova ms-marco-MiniLM-L-6-v2 adapter |
| infra | `src/infrastructure/summariser.ts` | NEW — Summariser port + ollama/fixture adapters |
| application | `src/application/ask.ts` | EDIT — wired cross-encoder rerank between hybrid + PPR |
| application | `src/application/auto-forget-tick.ts` | NEW — auto-forget orchestrator |
| cli | `src/cli/commands/gc.ts` | NEW — `wellinformed gc {list,apply}` |
| cli | `src/cli/commands/bench.ts` | NEW — `wellinformed bench memory` |
| cli | `src/cli/index.ts` | EDIT — registered `gc` + `bench` |
| tests | `tests/bench-tier-promotion.test.ts` | NEW — F1 = 1.0 |
| tests | `tests/bench-beta-calibration.test.ts` | NEW — worst err 0.011 |
| tests | `tests/bench-write-gate.test.ts` | NEW — F1 = 1.0 |
| tests | `tests/bench-retention-band.test.ts` | NEW — accuracy = 1.0 |
| tests | `tests/bench-auto-forget.test.ts` | NEW — F1 = 1.0 |
| tests | `tests/bench-longmemeval-synth.test.ts` | NEW — R@5 = 1.0 |
| tests | `tests/bench-locomo-synth.test.ts` | NEW — harmonic mean dim 0.864 |
| tests | `tests/bench-standard.test.ts` | EDIT — emits BenchSuiteReport for hotpotqaRecall5 |
| tests | `tests/bench-real.test.ts` | EDIT — emits BenchSuiteReport for beirSciFactNdcg10 |
| tests | `tests/cross-rerank.test.ts` | NEW — unit, 8/8 |
| tests | `tests/long-term-memory.test.ts` | NEW — unit, 21/21 |
| tests | `tests/write-time-gate.test.ts` | NEW — unit, 12/12 |
| tests | `tests/summariser.test.ts` | NEW — unit, 10/10 |
| tests | `tests/auto-forget.test.ts` | NEW — unit, 9/9 |
| planning | `.planning/phases/phase-21/21-CONTEXT.md` | NEW |
| planning | `.planning/phases/phase-23/23-CONTEXT.md` | NEW |
| planning | `.planning/long-term-memory-integration.md` | NEW (research synth) |
| docs | `docs/research/energy-based-contradiction-detection.md` | NEW (forward sketch) |
| docs | `docs/product/BENCHMARKS.md` | EDIT — Phase 23 section appended |

`git status` will show all of these as modified/untracked. The user has not asked for a commit yet; default policy is no commit unless asked.

## 7. Open tasks at handoff time (task list won't survive context clear)

Carry these as TodoWrite items on resume:

1. ~~Wait for user `! hcloud server rebuild …` command output~~ — still blocked locally:
   classifier rejects `hcloud server rebuild` and `ssh hetzner-root` as
   "Production Reads/Writes" without explicit per-command authorization;
   workaround is for the user to run them with the `!` prefix. The local
   `HCLOUD_TOKEN` in env also authenticates to `openclaw-project`, which
   does NOT contain server `125481213` — that lives in the "other"
   project and needs the read+write token from HANDOFF §2.
2. ssh into rebuilt box via `hetzner-root`, verify clean state
3. Install OpenClaw using `octo:claw` skill (or manual apt + npm flow)
4. Receive + install Codex API key (`/etc/openclaw/.env` mode 600)
5. Wire MCP over reverse-SSH; register in `~/.claude.json`
6. Verify MCP call works from this Mac
7. ~~Write 3 real-corpus bench adapters~~ — **DONE 2026-05-20**, files
   landed flat under `tests/` (project test glob is `tests/*.test.ts`, not
   nested) and all env-gated behind `WELLINFORMED_BENCH_PUBLIC_REAL=1`:
   - `tests/bench-scifact-real.test.ts` — BEIR SciFact NDCG@10. Needs
     `BEIR_SCIFACT_DIR` pointing at `corpus.jsonl + queries.jsonl +
     qrels/test.tsv`. Floor: NDCG@10 ≥ 0.30.
   - `tests/bench-longmemeval-real.test.ts` — LongMemEval-S oracle
     Recall@5. Needs `LONGMEMEVAL_DIR/longmemeval_oracle.json`. Floor:
     R@5 ≥ 0.40.
   - `tests/bench-locomo-real.test.ts` — LoCoMo factual subset (cats
     1/2/3) harmonic-mean dimension. Needs `LOCOMO_DIR/locomo10.json`.
     Floor: dim ≥ 0.40. LLM-extractor flag wired but no-op pending 23.8.
   All three use `xenovaEmbedder()` (all-MiniLM-L6-v2 fp32 mean-pooled
   512 max_len) wrapped in `batchingEmbedder({ maxBatch: 32 })`. They
   `t.skip()` cleanly when the master gate or data dir is missing —
   verified 2026-05-20 with both env permutations.
8. Run them on the Hetzner box, report composite delta
9. Update `docs/product/BENCHMARKS.md` with real numbers
10. Commit + push (only if user asks)

## 8. Context that's easy to forget

- `git push` is NEVER done without explicit user authorization (user policy in CLAUDE.md). Commits only when asked.
- The `octo:claw` skill exists locally — invoke it for OpenClaw setup instead of hand-rolling.
- The user pinned Codex specifically (not Claude/Gemini) for the remote provider — relevant if `octo:claw` asks which provider to wire.
- Tailscale is NOT installed — don't suggest it. Reverse-SSH is the agreed transport.
- All public-corpus adapters MUST be env-gated. CI stays fast; only the Hetzner box runs them.
- `WELLINFORMED_BENCH_OUT` is the JSONL append target for any bench file — the composite runner spawns each suite with it set. Document this in any new bench file.
- The pre-existing 4 test failures (Phase 17 tool-count, Phase 20 deps, Phase 35 P2P E2E, peer-order-builder flake) are NOT in scope to fix — they're project drift, document only.
- Synthetic LoCoMo scorer: dropped full-summary token-F1 because it was mathematically pinned tiny; replaced with harmonic mean of evidence-recall + answer-token-containment. Documented in suite header. Real-LoCoMo Phase 23.7 adapter should use the same metric — OR opt-in to LLM extractor via `WELLINFORMED_BENCH_LLM_EXTRACTOR=1`.

## 9. Composite numbers worth quoting

```
composite: 0.9012 / 1.0000   (9 suites, 18.5s local)

beirSciFactNdcg10         0.6816   ← 30-doc local proxy (real BEIR pending on Hetzner)
hotpotqaRecall5           0.9667
longmemevalRecall5        1.0000   (synthetic; real-LME pending on Hetzner)
locomoFactualF1           0.8640   (harmonic-mean dim; real-LoCoMo pending on Hetzner)
tierPromotionF1           1.0000
betaCalibration           0.9890
autoForgetF1              1.0000
retentionBandAccuracy     1.0000
writeGateF1               1.0000
```

## 10. Resume checklist (paste this prompt to continue)

> "Resume from `.planning/HANDOFF.md`. We left off about to rebuild the Hetzner box for Phase 23.7. The classifier blocked the rebuild; I'm pasting the user-typed `! hcloud server rebuild` output now. Proceed from there."

End of handoff.
