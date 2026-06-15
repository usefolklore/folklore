---
phase: 27-site-build-out
plan: 05
subsystem: infra
tags: [cloudflare-pages, wrangler, static-site, deploy-config, headers]

# Dependency graph
requires:
  - phase: 26-docs-and-benchmarks
    provides: docs content that the site sources
provides:
  - Verified Cloudflare Pages deploy config (wrangler.toml output dir = site/, _headers valid)
  - Evidence the static site/ output serves correctly without a build step (local 200 proof)
  - Confirmation of zero Vercel/Netlify deploy remnants in the repo deploy surface
affects: [28-merch-and-meme-agent, site deploy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cloudflare Pages serves site/ as a static directory — no build command (pages_build_output_dir = \"site\")"
    - "_headers file is the CF-Pages mechanism for custom response headers (not applied by a plain static server)"

key-files:
  created: []
  modified: []

key-decisions:
  - "Verify-only plan: both wrangler.toml and site/_headers were already correct, so zero file changes were made"
  - "Deploy stayed blocked-on-user (auth + domain); no wrangler login/publish/deploy command was run"
  - "Local CF-Pages-equivalent proof used python3 stdlib static serve of site/; security headers NOT asserted over local serve (they are CF-Pages-specific) — their presence in the file is asserted at the config level instead"

patterns-established:
  - "Pattern: deploy config is verified buildable locally (config grep + static serve 200) before any deploy, so the user's eventual deploy is a one-step action"

requirements-completed: [SITE-05]

# Metrics
duration: 8min
completed: 2026-06-15
---

# Phase 27 Plan 05: Verify Cloudflare Pages Config Summary

**Cloudflare Pages deploy config verified buildable — wrangler.toml output dir = site/, site/_headers present and valid, zero Vercel/Netlify remnants, and the site/ static output proven to serve 200 locally — with no deploy performed (blocked on user auth/domain).**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-15T09:53Z
- **Completed:** 2026-06-15T10:10Z
- **Tasks:** 2 (both verify-only, zero file changes)
- **Files modified:** 0

## Accomplishments
- Confirmed `wrangler.toml` declares `pages_build_output_dir = "site"` with sane `name = "folklore"` + `compatibility_date = "2026-06-15"`.
- Confirmed `site/_headers` is present, non-empty, and uses valid CF-Pages `_headers` syntax (`/*` path-pattern with indented `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`).
- Confirmed zero non-Cloudflare deploy remnants: vercel.json, netlify.toml, .vercel/, .vercelignore, site/_redirects all absent; repo-wide grep for `vercel`/`netlify` across json/toml/yaml configs returned nothing; package.json `build` script is just `tsc` (no host deploy script).
- Confirmed the static output is well-formed: site/index.html + site/assets/gen/ present; all assets referenced with RELATIVE paths (`assets/gen/...`); no absolute filesystem or `http://localhost` asset refs.
- Proved a CF-Pages-equivalent local static serve of site/: HTTP `GET /` → 200 with body containing `<title>Folklore` (actual title: `Folklore · oral tradition, set down for machines`), and `GET /assets/gen/hero.png` → 200.

## Task Commits

Both tasks were verify-only and made zero file changes, so there were no per-task code commits.

1. **Task 1: Verify Cloudflare Pages config and absence of Vercel remnants** — no commit (zero file changes; config already correct)
2. **Task 2: Prove the site serves locally (CF-Pages-equivalent), no deploy** — no commit (verification only)

**Plan metadata:** committed with SUMMARY + STATE + ROADMAP + REQUIREMENTS updates (docs commit).

## Files Created/Modified
None — this was a verification plan and the config was already correct. wrangler.toml and site/_headers were inspected and left unchanged.

## Decisions Made
- Treated this as a verify-only plan: since `pages_build_output_dir = "site"` and the security-header `_headers` file were already correct, the plan's "fix only if needed" branch did not fire and no files were touched.
- Did NOT assert the security headers over the local static serve — a plain python static server does not apply the CF-Pages `_headers` file. Header presence is asserted at the file/config level (Task 1) instead, per the plan's explicit note.
- Did NOT run any deploy/publish/login command (`wrangler pages deploy`, `wrangler login`). Deploy remains blocked-on-user (Cloudflare auth + usefolklore.com domain purchase).

## Deviations from Plan
None - plan executed exactly as written. (Both tasks were verify-only; everything was already in the expected correct state.)

## Issues Encountered
- The verification harness auto-backgrounded several bash invocations, so the python static-serve script's final PASS/FAIL print line was occasionally swallowed by the wrapper. Resolved by reading the static server's own HTTP access log, which definitively recorded `GET / HTTP/1.1 200` and `GET /assets/gen/hero.png HTTP/1.1 200`, and by confirming the `<title>Folklore` substring directly via grep on index.html. The substantive verification (both endpoints 200, title match) is unambiguously satisfied.

## User Setup Required
None for this plan. The actual Cloudflare Pages deploy itself remains blocked on user-side prerequisites (Cloudflare auth + usefolklore.com domain), tracked in STATE.md "Blocked on user". Once those exist, deploy is a one-step `wrangler pages deploy site` against the verified config.

## Next Phase Readiness
- SITE-05 satisfied: the deploy config is green and Cloudflare-correct, the static output is proven servable, and the only remaining gate is user auth/domain.
- Phase 28 (Merch & Meme-Agent) can rely on the Store section's site/ output being deployable as-is once the user completes the Cloudflare/domain setup.

---
*Phase: 27-site-build-out*
*Completed: 2026-06-15*

## Self-Check: PASSED
- FOUND: .planning/phases/27-site-build-out/27-05-SUMMARY.md
- VERIFIED: wrangler.toml `pages_build_output_dir = "site"` (grep matched)
- VERIFIED: site/_headers present, non-empty, contains X-Content-Type-Options
- VERIFIED: no vercel.json / netlify.toml / .vercel / .vercelignore / site/_redirects
- VERIFIED: local static serve GET / → 200 (title match) and GET /assets/gen/hero.png → 200
- No per-task code commits expected (verify-only, zero file changes)
