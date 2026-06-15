# Meme-agent — memes by the network, for the network

The meme-agent (`src/agents/meme-agent/`) runs a standalone
**generate → post → append** pipeline. It mints a folk-pop meme, can
post it to X, and appends a record to `site/assets/memes.json` so the
site's `#memes` grid renders it.

It is **DRY-RUN by default**: with no `--live` flag (or no X
credentials) it generates the meme and appends the record but makes
**zero live posts** — no account creation, no spend, no network call to
X. This is the contract for the current milestone (AGENT-01): the agent
is fully runnable the moment X credentials land, and posts nothing
until then.

## What it does

1. **Generate.** Default is a **no-credit templated SVG** composited
   from existing folk art in `site/assets/gen/` (e.g. `meme-amnesia.png`)
   under a folk-pop caption band — zero dependencies, zero spend. An
   optional `--higgsfield` path shells out to the higgsfield CLI for a
   `nano_banana_2` gen at **~1 credit**; it falls back to the SVG path
   if the CLI is missing or out of credit.
2. **Post (gated).** Only when `--live` is passed **and** `X_CLIENT_ID`
   is set does it call `postTweet` from
   `src/infrastructure/x-client.ts` — the project's existing OAuth 2.0
   PKCE client (no second auth implementation). In dry-run, or when the
   credential is absent, it logs `[dry-run] would post: <caption>` and
   skips the network entirely. Note: x-client is text-only, so the live
   tweet posts the caption; image-attach is a documented follow-up.
3. **Append.** Reads `site/assets/memes.json` (a `MemeEntry[]`), pushes
   the new entry, and writes it back atomically (tmp + rename). If the
   file is absent it starts a fresh array.

## Environment variables

The post step reuses the **same** credentials as the `folklore publish`
command:

| Var               | Required for live post | Source |
|-------------------|------------------------|--------|
| `X_CLIENT_ID`     | yes                    | [X Developer Portal](https://developer.x.com/en/portal/dashboard) → Projects & Apps → OAuth 2.0 Client ID |
| `X_CLIENT_SECRET` | optional (PKCE public clients) | same app |

On first live post the x-client opens a browser for OAuth 2.0 PKEE and
caches the token at `~/.folklore/x-token.json` (auto-refreshed). No
credentials are ever hardcoded.

## Run command

Dry-run (default — no creds needed, nothing posted):

```bash
node --import tsx src/agents/meme-agent/run.ts --text "never research twice"
```

Flags:

- `--live` — enable the gated X post step (still a no-op unless
  `X_CLIENT_ID` is set).
- `--higgsfield` — opt into the ~1-credit higgsfield gen (falls back to
  the no-credit SVG on any failure).
- `--text "<caption>"` — caption override (truncated to 280 chars);
  defaults to a folk-pop line when omitted.

Every run appends exactly one `MemeEntry` to `site/assets/memes.json`.

## Dry-run guarantee

The agent makes **zero** live X posts unless **both** `--live` is passed
**and** `X_CLIENT_ID` is set. The default invocation is a complete
dry-run. There is no account creation and no live posting in this
milestone.

## Cron it

Once X credentials exist, schedule a daily mint. Example crontab lines:

```cron
# Daily dry-run at 09:00 — generates + appends, posts nothing
0 9 * * * cd /path/to/folklore && node --import tsx src/agents/meme-agent/run.ts --text "$(date +\%F): never research twice" >> /tmp/meme-agent.log 2>&1

# Daily LIVE post at 09:00 (only once X_CLIENT_ID is configured)
0 9 * * * cd /path/to/folklore && X_CLIENT_ID=$X_CLIENT_ID node --import tsx src/agents/meme-agent/run.ts --live --text "$(date +\%F): never research twice" >> /tmp/meme-agent.log 2>&1
```

Until the live variant is enabled, the dry-run line keeps `memes.json`
fresh for the site without ever touching the network.

## The memes.json schema

`MemeEntry` (defined in `src/agents/meme-agent/types.ts`) is the single
source of truth for each record the site renders:

| field       | type                            | notes |
|-------------|---------------------------------|-------|
| `id`        | string                          | URL-safe slug |
| `caption`   | string                          | ≤ 280 chars |
| `image`     | string                          | path **relative to `site/`**, e.g. `assets/gen/meme-amnesia.png` |
| `alt`       | string                          | accessible alt text |
| `createdAt` | string                          | ISO-8601 |
| `source`    | `'svg' \| 'higgsfield' \| 'seed'` | provenance |
| `postedUrl` | string (optional)               | x.com status URL when live-posted; omitted in dry-run / seed |
