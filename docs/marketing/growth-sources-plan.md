# Growth Source Adapters + Discovery Loop Agent

## New source adapters to build

### GitHub analytics sites (for tracking trends + competitors)

| Site | API/Scrape | Adapter name | What it produces |
|---|---|---|---|
| star-history.com | SVG API: `api.star-history.com/svg?repos=X` | `star_history` | Star trajectory data per repo |
| Daily Stars Explorer | GitHub: `emanuelef/daily-stars-explorer` | `daily_stars` | Top daily star gainers |
| OSS Insight (ossinsight.io) | REST API: `api.ossinsight.io/v1/repos/X` | `oss_insight` | Per-repo activity metrics |
| Repohistory | GitHub Pages data | `repo_history` | Historical star/fork/issue trends |
| RepoBeats (axiom.co) | Embed endpoint | `repo_beats` | Contributor + PR activity |
| Gitstar Ranking | Web scrape | `gitstar_ranking` | Top repos by star count |
| Ecosyste.ms Timeline | API: `timeline.ecosyste.ms` | `ecosystems_timeline` | Package release timeline |

### Social/content sites (for marketing intelligence)

| Site | API | Adapter name | What it produces |
|---|---|---|---|
| X/Twitter | API v2 (search) | `twitter_search` | Tweets mentioning keywords |
| Reddit | JSON API (no auth for public) | `reddit_search` | Posts from target subreddits |
| Product Hunt | GraphQL API | `product_hunt` | Trending dev tools |
| Dev.to | REST API | `devto` | Articles matching tags |

## Discovery loop agent

### Concept

The discovery loop is a recursive source-expansion system:

```
Workspace keywords
    |
    v
discover() → suggested sources
    |
    v
trigger() → fetch + index new content
    |
    v
analyze graph → extract NEW keywords from indexed content
    |
    v
update workspace keywords
    |
    v
discover() again → more sources from expanded keywords
    |
    v
... repeat until convergence (no new sources found)
```

### How it differs from current `discover`

Current `discover` is one-shot: it matches workspace keywords against a hardcoded list of known feeds. The discovery loop agent:

1. **Extracts keywords from the graph itself** — after indexing ArXiv papers, it pulls out terms like "HNSW", "product quantization", "asymmetric search" that weren't in the original workspace keywords
2. **Searches external APIs** — uses the extracted keywords to query the star-tracking sites, finding repos and tools the user didn't know about
3. **Self-limits** — tracks which keyword→source pairs have already been explored, converges when no new sources are found
4. **Reports what it found** — generates a "discovery report" showing the expansion path

### Architecture

```
src/application/discovery-loop.ts

discoveryLoop(deps)(workspace, opts) → ResultAsync<DiscoveryReport>
  1. load workspace keywords
  2. run discover() for initial suggestions
  3. for each new source: trigger + index
  4. extract new keywords from freshly indexed content
     (top TF-IDF terms not already in workspace keywords)
  5. add new keywords to workspace
  6. repeat from step 2
  7. stop when: no new sources found OR max iterations reached
```

### MCP tool

```
discover_loop — "Expand my research automatically. Discover new sources,
                 index them, extract new keywords, discover more."
```

### CLI command

```bash
folklore discover-loop --workspace homelab --max-iterations 3
# iteration 1: found 4 sources from workspace keywords
# iteration 2: found 2 more from extracted keywords ("VFIO", "iommu")
# iteration 3: found 0 new — converged
# total: 6 new sources, 42 new nodes
```

## Implementation priority

1. **Discovery loop agent** — highest value, uses existing infrastructure
2. **oss_insight adapter** — has a real API, gives repo activity data
3. **ecosystems_timeline adapter** — package release tracking
4. **daily_stars adapter** — trending repos
5. **twitter_search adapter** — social signal (needs API key)
6. **reddit_search adapter** — no auth needed for public subreddits
