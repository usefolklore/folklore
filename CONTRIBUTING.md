# Contributing to folklore

## Branch + PR workflow

`main` is protected. Direct pushes log a "Bypassed rule violations" warning
on GitHub and are discouraged — even when you have admin override, you
should land changes through PRs so CI runs, the diff gets reviewed (by
you on a re-read, or by anyone else), and the merge commit captures
intent.

```
main ────────────────────────────────────────────────────► (protected)
                                                            ▲
                          feat/short-slug ──────────► PR ───┘
                          fix/short-slug
                          chore/short-slug
```

### Day-to-day flow

```bash
# start work
git switch -c feat/short-slug

# code, commit (semantic prefix — feat / fix / refactor / test / docs / chore)
git add ...
git commit -m "feat(area): one-line subject

Optional body explaining why."

# push branch + open PR
git push -u origin feat/short-slug
gh pr create --base main --fill

# CI runs against the PR. When green, squash-or-merge from the GitHub UI.
```

### Branch naming

- `feat/` — new behavior, new commands, new capabilities
- `fix/` — bug fixes
- `refactor/` — restructuring without behavior change
- `test/` — adding tests for existing behavior
- `docs/` — README / CONTRIBUTING / inline docstring changes
- `chore/` — dependency bumps, CI, tooling

Keep slugs short and verb-noun (`feat/peer-label`, `fix/migrate-backup`,
`refactor/use-cases-deps`).

### Commit message style

```
type(scope-or-phase): one-line subject (lowercase, no period)

Optional multi-line body. Explain the *why* — the diff explains the what.
Reference phase / requirement IDs when relevant (ROOMS-DEL-04, NET-02).

Out of scope for this commit (deferred):
  - bullet
  - bullet
```

Examples from this project:

```
feat(26): stamp github_user at indexNode + migrate --stamp-github back-fill
fix(25): migrate v5 idempotent across rollback → re-migrate round-trip
refactor(ci): port Phase 39 to in-process bus, delete Phase 18 NET-04
```

### Co-authoring

Don't add `Co-Authored-By` trailers for AI assistants or third-party tools
unless explicitly requested. Solo-author by default.

### CI gate

Every PR runs `.github/workflows/ci.yml` against the Node version matrix
(currently `22, 24`). The merge button stays grey until both pass.

If you need to bypass for an emergency, the `enforce_admins` setting on
`main` is currently `false` — admin push will land but log a warning. The
preferred path is a hotfix branch + immediate PR + self-merge.

## Local development

```bash
npm ci
npm run build
bash scripts/bootstrap.sh   # one-time: pulls submodules + python venv
npm test                    # full suite (≈ 18 s on a modern Mac)
```

Targeted single-file run:

```bash
node --import tsx --test tests/phase26.e2e-share-sync.test.ts
```

The full suite ships green at `0 fail / 0 cancelled / 7 skipped` (the 7
skipped are documented opt-outs — see each test file's header).

## Test tiers

- **Unit + structural** — pure / mock-driven, fast (< 5 s total). Every push.
- **Integration in-process** — fake-libp2p / Y.Doc-ferry / inline fakes.
  Still runs on every push because there's no network in the loop.
- **Integration real-network** — none currently in the tree. The
  ex-flaky multi-libp2p tests were either ported to in-process (Phase
  39) or deleted (Phase 18 NET-04 — libp2p's own contract, not ours).

If you need to add a real-network smoke, gate it behind an opt-in env
var (e.g. `FOLKLORE_REAL_NET=1`) and exclude it from the default CI
workflow.

## Hardening recommendation: flip `enforce_admins: true`

Once you're comfortable with the PR-only flow, run:

```bash
gh api -X PUT repos/SaharBarak/folklore/branches/main/protection \
  --input - <<EOF
{ "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 1 },
  "required_status_checks": null,
  "restrictions": null }
EOF
```

That makes the PR + review requirement bind admins too, so a stray
`git push origin main` from a tired Friday night gets rejected
instead of silently bypassing the rule.
