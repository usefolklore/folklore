/**
 * seed-corpus-data — the bundled default seed corpus.
 *
 * Shipped as a TypeScript module (not a JSON asset) on purpose: the
 * build is a plain `tsc`, which emits this into `dist/**` automatically,
 * so the corpus travels with the package without an extra copy step or
 * any runtime asset-path resolution. `folklore seed` loads this by
 * default; `--file` overrides it with a user-supplied manifest.
 *
 * The corpus is deliberately small and domain-durable: concept-level
 * claims about folklore's own architecture and the memory/retrieval
 * primitives an agent working in this repo asks about in its first
 * session. Durable means a fresh pull would not change the answer, so
 * a seeded hit is a *correct* hit, not a stale guess. Keep entries
 * timeless; anything version-specific belongs in a fetched node with
 * real freshness metadata, not the seed.
 *
 * The shape matches `SeedCorpus` and is validated through
 * `parseSeedCorpus` at load time like any external manifest, so a typo
 * here fails the same loud way a bad `--file` would.
 */

export const DEFAULT_SEED_CORPUS = {
  version: 1,
  entries: [
    {
      type: 'concept',
      label: 'Network-before-web retrieval gate',
      body:
        'Folklore is network-before-web: local Read/Grep/Glob run unaffected, but an outbound WebSearch or WebFetch first asks the local knowledge graph plus connected peers. A PreToolUse hook prefetches the graph and injects the top hits; on a confident answer it denies the outbound web call so the agent reasons from cache instead of paying the network trip. The goal is to pay the network cost for any given lookup at most once across all sessions and peers.',
    },
    {
      type: 'concept',
      label: 'Deny-on-confidence threshold and minimum hits',
      body:
        'The deny-on-confidence gate fires only when four conditions align: FOLKLORE_DENY_WEBSEARCH=1, the tool is WebSearch or WebFetch, the decision is use_memory, the satisfaction score is at or above FOLKLORE_DENY_THRESHOLD (default 0.85), and there are at least FOLKLORE_DENY_MIN_HITS (default 2) graph hits. When any condition fails the web call proceeds normally. Local tools are never denied because they are cheap.',
    },
    {
      type: 'concept',
      label: 'Auto-save PostToolUse hook closes the loop',
      body:
        'After a WebSearch or WebFetch completes, a PostToolUse hook captures the result text and files it into the global graph as a source note via folklore save, stamping the query or URL as source_uri. This means the second time anyone asks the same thing the graph answers instead of the web. The real cost of going to the web is not the trip but repeating the trip, so auto-saving the first answer is what makes the gate compound.',
    },
    {
      type: 'concept',
      label: 'Satisfaction score components',
      body:
        'The v1 satisfaction scorer averages observed components, each in zero to one: retrieval (top-3 average of one minus cosine distance), freshness (fraction of nodes inside their staleness window), provenance (fraction with both source_uri and fetched_at), consensus (distinct origins, a local-only carve-out scoring one), and signature (fraction with a verified chain). Unobserved signals carry zero weight rather than a 0.5 prior, so a low-data result set cannot be inflated. Penalties for missing provenance, single remote origin, semantic-only adjacency, and staleness subtract up to 0.4.',
    },
    {
      type: 'concept',
      label: 'Agent contract decision breakpoints',
      body:
        'Folklore returns an explicit agent contract, not just top-k chunks. The decision is picked from satisfaction by threshold: use_memory at 0.85 and up, verify_one_source at 0.65 and up, search_required at 0.40 and up, otherwise ask_user. Shallow evidence (fewer than four of five components observed) demotes use_memory to verify_one_source. A task-risk overlay raises the bar: elevated-risk work verifies a source despite a high score, and high-risk work (security, auth, crypto, medical, legal, financial) always requires a live source.',
    },
    {
      type: 'concept',
      label: 'Per-node privacy and P2P federation',
      body:
        'Every node is either local-only or shared over P2P, gated by a per-node private flag. Sharing is symmetric: peers exchange their non-private nodes via a Y.js CRDT sync. A node source_uri scheme records its origin (codebase, web fetch, arxiv, seed, and so on); an optional local-only workspace tag groups nodes by the repo they were captured in but never travels over the wire. Claude Code session transcripts are hard-blocked from federation regardless of the flag.',
    },
    {
      type: 'concept',
      label: 'Data freshness and the staleness window',
      body:
        'Every graph hit carries age_days and fetched_at. The default staleness window is 7 days for trust decisions and 14 days for the freshness scorer component. If a hit is younger than the window, trust the cache; if older, prefer a fresh pull and let the auto-save hook write the newer version back. A hit with no fetched_at is treated as stale of unknown age. This is why seed nodes carry a real timestamp at index time.',
    },
    {
      type: 'concept',
      label: 'Ask retrieval pipeline stages',
      body:
        'The ask use case composes hybrid dense-plus-BM25 search with RRF fusion, an optional cross-encoder rerank gated on hardware tier, a personalized-PageRank graph rerank, and a uniform-half-life recency rerank, then enriches each hit with the entities it mentions and resolves the raw query as an entity alias to also run recall. The result envelope carries the search hits, the satisfaction score, and the full agent contract.',
    },
    {
      type: 'concept',
      label: 'Cold-start seeding rationale',
      body:
        'A fresh install has an empty graph, so the first prompts always miss the gate and the deny-on-confidence path never fires until web traffic has warmed the graph. folklore seed imports a small curated corpus of durable concept nodes at install time so the graph answers from the first session. Seed nodes use a seed:// source_uri scheme so they are auditable and never confused with web-fetched provenance, and they are indexed through the same write path as user-saved notes.',
    },
    {
      type: 'concept',
      label: 'MCP active lane versus hook passive lane',
      body:
        'Folklore has two lanes. The passive lane is the PreToolUse hook that gates outbound WebSearch and WebFetch automatically. The active lane is the folklore MCP tools (search, ask, get_node, get_neighbors, find_tunnels, recall) that an agent calls explicitly to consult memory before deciding whether a web call is even needed. MCP is the default for active calls: type-safe schemas, roughly 50 ms per call versus 500 ms of Node boot for a CLI subprocess, and cross-harness portability.',
    },
    {
      type: 'concept',
      label: 'Save-note types and deterministic ids',
      body:
        'folklore save files a typed node that outlives chat history. The four note types are concept (a named idea), synthesis (a merged finding across sources), decision (a logged choice with rationale), and source (an external pointer). Node ids are deterministic, derived as type://YYYY-MM-DD/slug, so saving the same title twice in one day idempotently updates the existing node rather than duplicating it.',
    },
    {
      type: 'concept',
      label: 'Subgraph transfer economics',
      body:
        'When a peer hit arrives it imports not just one node but a one-hop neighborhood: on the measured local graph a remote hit brings several nodes and edges of surrounding context per lookup. The value is twofold: fewer paid web trips over the lifetime of a query stream, and more context carried per hit so a lighter model can reason with provenance it would otherwise have to re-fetch. The compounding advantage is strongest when many peers share one corpus.',
    },
  ],
} as const;
