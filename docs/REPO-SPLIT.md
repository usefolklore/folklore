# Repository split plan

This is the **written org-boundary plan** for Folklore. It defines how the
single repository (mapped in
[`architecture/REPO-LAYOUT.md`](architecture/REPO-LAYOUT.md)) partitions into
separate repos under the `usefolklore` GitHub org, mirroring akashikprotocol's
clean separation of core / spec / site / `.github`.

This document is a plan, not the split. The physical multi-repo split happens at
push time **once the `usefolklore` org exists** — see "Blocked on user" below.
Nothing here moves files this milestone.

## Intent

Mirror akashikprotocol's clean separation under the `usefolklore` org. Today
everything lives in one repo so the engine, spec, and site evolve together
during pre-launch. At launch the boundaries already drawn in the layout doc
become repo boundaries: the engine ships as the flagship `folklore` package, the
spec gets its own contributor-facing repo, the site deploys from its own repo,
and the org profile lives in the special `.github` repo.

The layout was designed for this split from the start: the spec is documented
separately from `src/`, benchmarks are isolated in `bench/`, and `site/` already
deploys on an independent track. The split is therefore a lift-and-extract, not
a refactor.

## Target repos

| Repo | Contents | Notes |
|---|---|---|
| `usefolklore/folklore` | **core + cli:** `src/`, `tests/`, `bench/`, `folklore-rs/`, `bin/`, `config/`, `package.json`, engine docs | The flagship npm package `@usefolklore/folklore`. Carries the `vendor/graphify` submodule. |
| `usefolklore/folklore-spec` | **spec:** `spec/`, `docs/rfc/`, `docs/protocol/`, the versioned protocol docs (`docs/architecture/V5-PROTOCOL.md` + superseded V3/V4) | Contributor-facing protocol home. The RFC process moves here. |
| `usefolklore/folklore-site` | **site:** `site/`, `wrangler.toml`, `site/_headers` | Deploys independently to Cloudflare Pages. |
| `usefolklore/.github` | **org profile:** the org profile README | Authored in DOCS-03 (Phase 26). Do NOT create `.github/profile` in this repo now. |

## Migration mechanics

Per repo, when the org exists:

### usefolklore/folklore (core + cli)
- Extract with `git filter-repo --path src/ --path tests/ --path bench/ --path folklore-rs/ --path bin/ --path config/ --path package.json` (plus build config: `tsconfig*.json`, `eslint.config.mjs`, `Dockerfile`).
- The `vendor/graphify` submodule travels here — it backs the code-graph/retrieval path. Re-add via `.gitmodules` in the new repo (`https://github.com/saharbarak/graphify.git`, branch `folklore`).
- Update any docs links that pointed at `docs/...` to the spec repo URL.

### usefolklore/folklore-spec (spec)
- Extract with `git filter-repo --path spec/ --path docs/rfc/ --path docs/protocol/ --path docs/architecture/V5-PROTOCOL.md --path docs/architecture/V3-PROTOCOL.md --path docs/architecture/V4-PROTOCOL.md --path docs/WHITEPAPER.md`.
- `spec/README.md` uses `../docs/...` relative links today; rewrite those to in-repo paths (the `docs/` subtree moves alongside `spec/`) once extracted.
- RFC issue templates / labels move with it.

### usefolklore/folklore-site (site)
- Extract with `git filter-repo --path site/ --path wrangler.toml`. `_headers` lives inside `site/` so it travels automatically.
- Cross-repo references: any site link into `docs/` (whitepaper, RFC) must be rewritten to the spec repo's published URL or the live docs site, since `docs/` no longer ships alongside `site/`.
- Cloudflare Pages project re-points its source to this repo.

### usefolklore/.github (org profile)
- Created fresh in Phase 26 (DOCS-03). No extraction — the profile README is new content, not lifted from here.

## Cross-repo reference rewrites

After the split, three classes of links break and must be rewritten:
- **engine → spec:** code comments / engine docs linking `docs/rfc` or protocol docs point to the `folklore-spec` repo (or its published docs URL).
- **spec → engine:** the spec's `../src/...` and `../bench/...` links point to the `folklore` repo.
- **site → spec:** site links to the whitepaper / RFCs point to the published spec/docs URL rather than a sibling `docs/` path.

This repo's `docs/architecture/REPO-LAYOUT.md` and this file stay in whichever
repo retains general docs (the core repo), with updated cross-repo URLs.

## Blocked on user

Do NOT attempt these — they require user action outside execution scope:
- Creating the `usefolklore` GitHub org and the four repos under it.
- Cloudflare auth + the `usefolklore.com` domain purchase (re-point of the site
  deploy depends on this).

Until the org exists, the boundaries above are enforced *logically* by the
single-repo layout in [`architecture/REPO-LAYOUT.md`](architecture/REPO-LAYOUT.md);
the physical split is deferred to a later milestone.
