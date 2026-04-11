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
  { keywords: ['ai', 'ml', 'machine-learning', 'deep-learning', 'llm', 'embeddings'], url: 'https://rsshub.app/papers-with-code/latest', name: 'Papers With Code' },
  { keywords: ['ai', 'ml', 'llm', 'gpt', 'claude', 'transformer'], url: 'https://simonwillison.net/atom/everything/', name: 'Simon Willison' },
  { keywords: ['kubernetes', 'k8s', 'devops', 'cloud', 'infra'], url: 'https://kubernetes.io/feed.xml', name: 'Kubernetes Blog' },
  { keywords: ['rust', 'systems', 'programming'], url: 'https://blog.rust-lang.org/feed.xml', name: 'Rust Blog' },
  { keywords: ['homelab', 'selfhost', 'self-hosted', 'proxmox', 'docker'], url: 'https://selfh.st/rss/', name: 'selfh.st' },
  { keywords: ['security', 'infosec', 'vulnerability', 'cve'], url: 'https://krebsonsecurity.com/feed/', name: 'Krebs on Security' },
  { keywords: ['crypto', 'web3', 'defi', 'ethereum', 'safe', 'multisig'], url: 'https://blog.ethereum.org/feed.xml', name: 'Ethereum Blog' },
  { keywords: ['typescript', 'javascript', 'node', 'deno', 'bun'], url: 'https://devblogs.microsoft.com/typescript/feed/', name: 'TypeScript Blog' },
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
            const existingConfigs = existing.map((s) => JSON.stringify(s.config));

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
              // Skip if already registered (compare by URL)
              const cfg = JSON.stringify({ feed_url: feed.url, max_items: 20 });
              if (existingConfigs.includes(cfg)) continue;
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
