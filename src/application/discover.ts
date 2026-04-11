/**
 * Discovery use case — suggest new sources for a room.
 *
 * Given a room's keywords and existing sources, this generates
 * candidate SourceDescriptors that the user can approve. Phase 6
 * scope is keyword-derived:
 *
 *   - ArXiv queries from keywords not already covered by an arxiv source
 *   - HN Algolia queries from keywords not already covered
 *   - Well-known RSS feeds from aggregators that match keywords
 *
 * No auto-add — returns suggestions as an array. The CLI command
 * or MCP tool can optionally add them with --auto / a confirmation.
 */

import { ResultAsync, okAsync } from 'neverthrow';
import type { AppError } from '../domain/errors.js';
import type { RoomId } from '../domain/rooms.js';
import { findRoom } from '../domain/rooms.js';
import type { SourceDescriptor, SourceKind } from '../domain/sources.js';
import { forRoom } from '../domain/sources.js';
import type { RoomsConfig } from '../infrastructure/rooms-config.js';
import type { SourcesConfig } from '../infrastructure/sources-config.js';

// ─────────────── types ──────────────────

export interface DiscoverDeps {
  readonly rooms: RoomsConfig;
  readonly sources: SourcesConfig;
}

export interface Suggestion {
  readonly descriptor: SourceDescriptor;
  readonly reason: string;
}

// ─────────────── well-known feeds ───────

interface KnownFeed {
  readonly keywords: readonly string[];
  readonly url: string;
  readonly name: string;
}

const KNOWN_FEEDS: readonly KnownFeed[] = [
  // AI / ML
  { keywords: ['ai', 'ml', 'machine-learning', 'deep-learning', 'llm', 'embeddings'], url: 'https://rsshub.app/papers-with-code/latest', name: 'Papers With Code' },
  { keywords: ['ai', 'ml', 'llm', 'gpt', 'claude', 'transformer'], url: 'https://simonwillison.net/atom/everything/', name: 'Simon Willison' },
  { keywords: ['ai', 'ml', 'llm', 'agent', 'mcp'], url: 'https://lilianweng.github.io/index.xml', name: 'Lil Log (Lilian Weng)' },
  { keywords: ['ai', 'ml', 'research', 'deep-learning'], url: 'https://distill.pub/rss.xml', name: 'Distill.pub' },
  { keywords: ['ai', 'agent', 'mcp', 'claude', 'openai'], url: 'https://www.latent.space/feed', name: 'Latent Space' },
  // Dev tools / languages
  { keywords: ['kubernetes', 'k8s', 'devops', 'cloud', 'infra'], url: 'https://kubernetes.io/feed.xml', name: 'Kubernetes Blog' },
  { keywords: ['rust', 'systems', 'programming'], url: 'https://blog.rust-lang.org/feed.xml', name: 'Rust Blog' },
  { keywords: ['typescript', 'javascript', 'node', 'deno', 'bun'], url: 'https://devblogs.microsoft.com/typescript/feed/', name: 'TypeScript Blog' },
  { keywords: ['go', 'golang', 'cloud', 'backend'], url: 'https://go.dev/blog/feed.atom', name: 'Go Blog' },
  { keywords: ['python', 'pip', 'django', 'flask', 'fastapi'], url: 'https://blog.python.org/feeds/posts/default?alt=rss', name: 'Python Blog' },
  // Homelab / self-hosted
  { keywords: ['homelab', 'selfhost', 'self-hosted', 'proxmox', 'docker'], url: 'https://selfh.st/rss/', name: 'selfh.st' },
  // Security
  { keywords: ['security', 'infosec', 'vulnerability', 'cve'], url: 'https://krebsonsecurity.com/feed/', name: 'Krebs on Security' },
  { keywords: ['security', 'appsec', 'devsecops'], url: 'https://portswigger.net/research/rss', name: 'PortSwigger Research' },
  // Web3 / crypto
  { keywords: ['crypto', 'web3', 'defi', 'ethereum', 'safe', 'multisig'], url: 'https://blog.ethereum.org/feed.xml', name: 'Ethereum Blog' },
  // Open source / GitHub
  { keywords: ['open-source', 'github', 'oss', 'stars', 'trending'], url: 'https://github.blog/feed/', name: 'GitHub Blog' },
  { keywords: ['open-source', 'oss', 'npm', 'packages'], url: 'https://blog.npmjs.org/rss', name: 'npm Blog' },
];

/**
 * Known research channel adapters — non-RSS sources that the discovery
 * loop can suggest based on room keywords. Each maps to an adapter
 * kind (oss_insight, github_trending) with a keyword-derived config.
 */
interface KnownChannel {
  readonly keywords: readonly string[];
  readonly kind: SourceKind;
  readonly name: string;
  readonly buildConfig: (roomKeywords: readonly string[]) => Readonly<Record<string, unknown>>;
}

const KNOWN_CHANNELS: readonly KnownChannel[] = [
  {
    keywords: ['github', 'oss', 'open-source', 'stars', 'trending', 'repos'],
    kind: 'oss_insight',
    name: 'OSS Insight (trending repos)',
    buildConfig: (kw) => ({ keyword: kw.slice(0, 3).join(' '), max_items: 10 }),
  },
  {
    keywords: ['github', 'oss', 'open-source', 'typescript', 'javascript', 'python', 'rust', 'go'],
    kind: 'github_trending',
    name: 'GitHub Trending (search API)',
    buildConfig: (kw) => ({ query: kw.slice(0, 3).join(' '), sort: 'stars', max_items: 10 }),
  },
  // Generic — any room with >2 keywords gets offered these
  {
    keywords: ['ai', 'ml', 'embeddings', 'vector', 'rag', 'knowledge-graph', 'agent', 'mcp', 'llm'],
    kind: 'oss_insight',
    name: 'OSS Insight (AI/ML repos)',
    buildConfig: (kw) => ({ keyword: kw.filter(k => ['ai', 'ml', 'embeddings', 'vector', 'rag', 'llm', 'agent'].includes(k)).slice(0, 3).join(' ') || kw[0], max_items: 10 }),
  },
  {
    keywords: ['ai', 'ml', 'embeddings', 'vector', 'rag', 'knowledge-graph', 'agent', 'mcp', 'llm'],
    kind: 'github_trending',
    name: 'GitHub Trending (AI/ML)',
    buildConfig: (kw) => ({ query: kw.filter(k => ['ai', 'ml', 'embeddings', 'vector', 'rag', 'llm', 'agent'].includes(k)).slice(0, 3).join(' ') || kw[0], sort: 'stars', max_items: 10 }),
  },
];

// ─────────────── use case ───────────────

export const discover =
  (deps: DiscoverDeps) =>
  (roomId: RoomId): ResultAsync<readonly Suggestion[], AppError> =>
    deps.rooms
      .load()
      .mapErr((e): AppError => e)
      .andThen((registry) => {
        const room = findRoom(registry, roomId);
        if (!room) {
          return okAsync<readonly Suggestion[], AppError>([]);
        }
        return deps.sources
          .list()
          .mapErr((e): AppError => e)
          .map((allSources): readonly Suggestion[] => {
            const existing = forRoom(allSources, roomId);
            const existingKinds = new Set(existing.map((s) => s.kind));

            const suggestions: Suggestion[] = [];

            // ArXiv suggestions
            if (!existingKinds.has('arxiv')) {
              const query = room.keywords.map((k) => `abs:${k}`).join(' OR ');
              if (query) {
                suggestions.push(arxivSuggestion(roomId, query, room.keywords));
              }
            }

            // HN Algolia suggestions
            if (!existingKinds.has('hn_algolia')) {
              const query = room.keywords.join(' ');
              if (query) {
                suggestions.push(hnSuggestion(roomId, query, room.keywords));
              }
            }

            // Well-known RSS feeds
            for (const feed of KNOWN_FEEDS) {
              const matches = feed.keywords.some((fk) =>
                room.keywords.some((rk) => rk.toLowerCase().includes(fk) || fk.includes(rk.toLowerCase())),
              );
              if (!matches) continue;
              if (existing.some((s) => s.kind === 'generic_rss' && (s.config as { feed_url?: string }).feed_url === feed.url)) continue;
              suggestions.push({
                descriptor: {
                  id: `${roomId}-${slugify(feed.name)}`,
                  kind: 'generic_rss' as SourceKind,
                  room: roomId,
                  enabled: true,
                  config: { feed_url: feed.url, max_items: 20 },
                },
                reason: `${feed.name} matches keywords: ${feed.keywords.filter((fk) => room.keywords.some((rk) => rk.toLowerCase().includes(fk))).join(', ')}`,
              });
            }

            // Research channel adapters (OSS Insight, GitHub Trending, etc.)
            for (const channel of KNOWN_CHANNELS) {
              const matches = channel.keywords.some((ck) =>
                room.keywords.some((rk) => rk.toLowerCase().includes(ck) || ck.includes(rk.toLowerCase())),
              );
              if (!matches) continue;
              const channelId = `${roomId}-${slugify(channel.name)}`;
              if (existing.some((s) => s.id === channelId)) continue;
              if (existing.some((s) => s.kind === channel.kind && s.room === roomId)) continue;
              const config = channel.buildConfig(room.keywords);
              suggestions.push({
                descriptor: {
                  id: channelId,
                  kind: channel.kind,
                  room: roomId,
                  enabled: true,
                  config,
                },
                reason: `${channel.name} matches keywords: ${channel.keywords.filter((ck) => room.keywords.some((rk) => rk.toLowerCase().includes(ck))).join(', ')}`,
              });
            }

            return suggestions;
          });
      });

// ─────────────── helpers ────────────────

const arxivSuggestion = (
  roomId: string,
  query: string,
  keywords: readonly string[],
): Suggestion => ({
  descriptor: {
    id: `${roomId}-arxiv`,
    kind: 'arxiv' as SourceKind,
    room: roomId,
    enabled: true,
    config: { query, max_items: 10 },
  },
  reason: `ArXiv search for room keywords: ${keywords.join(', ')}`,
});

const hnSuggestion = (
  roomId: string,
  query: string,
  keywords: readonly string[],
): Suggestion => ({
  descriptor: {
    id: `${roomId}-hn`,
    kind: 'hn_algolia' as SourceKind,
    room: roomId,
    enabled: true,
    config: { query, max_items: 15, tags: 'story' },
  },
  reason: `Hacker News search for: ${keywords.join(', ')}`,
});

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
