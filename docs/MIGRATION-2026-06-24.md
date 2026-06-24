# `main` history rewrite — 2026-06-24

> **If your local clone is older than 2026-06-24, read this before any `git pull`,
> `merge`, or `rebase`.** Your local `main` shares no valid merge-base with the new
> `main`; a naive pull will conflict massively and try to resurrect deleted dirs.

## What happened

`origin/main` (github.com/usefolklore/folklore) was hard-rewritten with
`git filter-repo` and force-pushed. Every commit in history had these directories
purged:

`.planning/`, `docs/`, `site/`, `demo/`, `assets/`, `folklore-rs/`

Results:
- clone size ~320 MB → ~3 MB
- new `main` HEAD: `e4ea104`
- pre-rewrite history preserved at **`origin/backup/main-pre-cleanup`** (recovery
  anchor — read, do not restore)

Kept on `main`: `src/`, `tests/`, `bin/`, `config/`, `.claude-plugin/`,
`.claude/{hooks,skills,helpers}/`, `bench/`, `eval/`, `.github/`, and repo meta
(README, LICENSE, `package.json`, `CONTRIBUTING.md`).

## Re-sync your clone

```bash
git fetch origin
git checkout main
git reset --hard origin/main        # adopt new history, discard old local main
git remote prune origin
```

For an in-flight feature branch built on the old `main`, rebase onto the new base
(do **not** merge):

```bash
git rebase --onto origin/main <old-main-sha-it-branched-from> <your-branch>
# simplest alternative: recreate the branch from new main and cherry-pick your commits
git switch -c feat/your-slug origin/main
git cherry-pick <sha>...<sha>
```

If your branch edits a purged dir (`.planning/`, `docs/`, …), that is expected —
those are now **dev-branch-only**. Keep them on your branch; never reintroduce
them to `main`.

## Repository model going forward

Authoritative source: [`CONTRIBUTING.md`](../CONTRIBUTING.md) on `main`.

- `main` = only what ships or builds the npm package. Rule of thumb: if
  `npm ci && npm run build && npm test` doesn't need it, it doesn't belong on
  `main` — open a dev branch.
- Dev-branch-only dirs: `.planning/` (`feat/*`, `experiment/*`), `docs/` (`docs/*`),
  `site/` (site/docs branch), `demo/`, `assets/`, `folklore-rs/`.
- Branch prefixes: `feat/ fix/ refactor/ test/ docs/ chore/ security/ experiment/
  handoff/ backup/`.
- CI/CD: PR → `ci.yml` (required `test` check, node 22/24: `npm ci → lint → build →
  bootstrap → test`) → squash-merge → tag `vX.Y.Z` → `release.yml` (npm
  `--provenance` + `ghcr.io/usefolklore/folklore`). `main` is protected; no
  force-push.

## Hard rule

Never force-push `main` or push the old history back over it. The old tree lives at
`origin/backup/main-pre-cleanup` for reference only.
