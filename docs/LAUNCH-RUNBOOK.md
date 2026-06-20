# Folklore launch runbook — copy-paste to go live

Two gates only YOU can clear (I can't: no Cloudflare creds, no social logins in
the sandbox). Everything else is built + committed and goes live the moment these
run. Do them in order.

---

## GATE 1 — Publish the site (it's frozen at an old commit right now)

The live site does NOT reflect any recent work (bars fix, $LORE removal,
leaderboard, AEO, /compare). Auto-deploy isn't working; deploy via the restored
GitHub Action.

```bash
# 1. Cloudflare: create a fresh API token (the old ones were burned)
#    Dashboard → My Profile → API Tokens → Create → template "Edit Cloudflare Workers"
#    OR custom: Account → Cloudflare Pages → Edit. Copy the token.
#    Also grab your Account ID (Workers & Pages → right sidebar).

# 2. Add both as repo secrets:
gh secret set CLOUDFLARE_API_TOKEN  --repo usefolklore/folklore   # paste token
gh secret set CLOUDFLARE_ACCOUNT_ID --repo usefolklore/folklore   # paste account id

# 3. Deploy (runs site/ → CF Pages project "folklore"):
gh workflow run deploy-site.yml --repo usefolklore/folklore
gh run watch "$(gh run list --workflow=deploy-site.yml --repo usefolklore/folklore --limit 1 --json databaseId -q '.[0].databaseId')" --repo usefolklore/folklore

# 4. Verify the new content is actually live (not index-fallback):
curl -s -L https://usefolklore.sh/compare/ | grep -o '<title>[^<]*</title>'   # expect: "Folklore vs mem0…"
curl -s -L https://usefolklore.sh/llms.txt | head -1                          # expect: "# Folklore"
curl -s -L https://usefolklore.sh/ | grep -c '/compare'                       # expect: ≥1 (nav link)
```

If `deploy-site` still fails after secrets: connect CF Pages git-integration in
the dashboard (Workers & Pages → folklore → Settings → Builds: connect the repo,
build output dir `site`, no build command) so every push auto-deploys; then the
Action is optional.

Alternative (local, if you have wrangler authed):
```bash
cd <repo> && npx wrangler pages deploy site --project-name=folklore --branch=main
```

---

## GATE 2 — Post the week-1 campaign (real accounts)

Campaign is drafted + honest in `usefolklore/orchestra` →
`campaigns/folklore-week1.md` (r/selfhosted lead, r/LocalLLaMA, X thread,
LinkedIn, Show HN). CTA = the GitHub repo.

```bash
# 1. Connect accounts to social-publisher (one human login each — no fake accounts):
#    - browser path: log into X / LinkedIn / Reddit once in a persistent profile
#      dir (~/.orchestra/profiles/folklore) used by playwright-mcp
#    - or official APIs: export REDDIT_*, BLUESKY_*, MASTODON_* tokens

# 2. Dry-run the queue (review every post before it goes out):
#    hand campaigns/folklore-week1.md to the social-publisher agent → it prints
#    the per-channel queue. Then --commit to schedule on local cron.

# 3. Be present: reply to every comment as a person for the first few hours.
```

Order within the week: r/selfhosted + Show HN first (highest-signal, OSS crowd),
then X thread + LinkedIn the next day, cluster within ~3 days to stack toward
GitHub trending.

---

## GATE 3 (optional, for the federation claim) — stand up a bootstrap node

Federation is default-on in config but has no peer to reach. To make "compounds
across peers" true:

```bash
# On a public host (fixed port, reachable):
#   config.yaml: peer.listen_host: 0.0.0.0, peer.port: 4001
folklore daemon _run        # note its /dns4/<host>/tcp/4001/p2p/<peerId> multiaddr

# Then ship it as the default for every install:
export FOLKLORE_BOOTSTRAP_PEERS="/dns4/seed.usefolklore.sh/tcp/4001/p2p/<peerId>"
#   (or commit it to config.yaml peer.dht.bootstrap_peers)
```

Until this exists, marketing copy stays "works alone today; P2P shipping" — do
not claim present-tense federation.

---

## What's already done (no action needed)
- Site content: bars fail-safe fill, $LORE/bags.fm removed, honest leaderboard,
  full AEO/SEO (robots/sitemap/llms.txt/JSON-LD/canonical), /compare magnet.
- GitHub repo discovery: 20 topics + homepage set (live now).
- Federation default-on in config (gated on Gate 3's bootstrap node).
- Campaign drafted (honest, GitHub-CTA) in usefolklore/orchestra.

## Hard rules (do not break)
- No fake/bought stars or karma, no sockpuppets — Folklore sells provenance.
- Every public number traces to the benchmark; negatives stay visible.
- Don't drive launch traffic anywhere until Gate 1 confirms /compare is live.
