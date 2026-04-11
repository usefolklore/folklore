/**
 * podcast_rss source adapter.
 *
 * Similar to generic_rss but enriches ContentItem metadata with
 * podcast-specific fields: episode duration (itunes:duration) and
 * enclosure URL (the audio file link). This lets downstream
 * processors distinguish podcast episodes from plain blog posts.
 *
 * Config shape:
 *   {
 *     feed_url: string        // http(s):// or file:// URL of the podcast RSS feed
 *     max_items?: number      // default 20
 *   }
 *
 * The adapter:
 *   1. fetches the feed URL as raw text via HttpFetcher
 *   2. parses the XML via XmlParserPort
 *   3. normalises RSS 2.0 / Atom 1.0 via domain.feeds.normalizeFeed
 *   4. walks the raw parsed XML to extract enclosure and itunes:duration
 *   5. returns ContentItem[] trimmed to max_items with enriched metadata
 */

import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { AppError } from '../../domain/errors.js';
import type { ContentItem } from '../../domain/content.js';
import type { Source, SourceDescriptor } from '../../domain/sources.js';
import { normalizeFeed } from '../../domain/feeds.js';
import type { HttpFetcher } from '../http/fetcher.js';
import type { XmlParserPort } from '../parsers/xml-parser.js';

interface PodcastRssConfig {
  readonly feed_url: string;
  readonly max_items?: number;
}

/** Podcast-specific metadata extracted from the raw XML item. */
interface PodcastMeta {
  readonly enclosure_url?: string;
  readonly enclosure_type?: string;
  readonly enclosure_length?: string;
  readonly duration?: string;
}

const parseConfig = (raw: Readonly<Record<string, unknown>>): PodcastRssConfig | null => {
  const feed_url = raw.feed_url;
  if (typeof feed_url !== 'string' || feed_url.length === 0) return null;
  const max_items = typeof raw.max_items === 'number' ? raw.max_items : undefined;
  return { feed_url, max_items };
};

// ─────────────────────── helpers ──────────────────────────

/** Coerce `v` into an array. fast-xml-parser returns a single object when a tag has one child. */
const asArray = (v: unknown): readonly unknown[] => {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
};

/** Drill into a non-null object, returning null otherwise. */
const extract = (v: unknown): Record<string, unknown> | null => {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
};

const pickString = (v: unknown): string | undefined => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (v && typeof v === 'object') {
    const obj = v as Record<string, unknown>;
    if (typeof obj['#text'] === 'string') return obj['#text'];
  }
  return undefined;
};

/**
 * Extract podcast-specific metadata from a raw RSS item element.
 * Looks for `enclosure` (with url, type, length attributes) and
 * `itunes:duration` tags.
 */
const extractPodcastMeta = (rawItem: Record<string, unknown>): PodcastMeta => {
  const meta: {
    enclosure_url?: string;
    enclosure_type?: string;
    enclosure_length?: string;
    duration?: string;
  } = {};

  // Enclosure — RSS 2.0 podcasts use <enclosure url="..." type="audio/mpeg" length="12345" />
  const enclosure = extract(rawItem.enclosure);
  if (enclosure) {
    meta.enclosure_url = pickString(enclosure.url);
    meta.enclosure_type = pickString(enclosure.type);
    meta.enclosure_length = pickString(enclosure.length);
  }

  // itunes:duration — can be "HH:MM:SS", "MM:SS", or just seconds
  const duration = pickString(rawItem['itunes:duration']);
  if (duration) {
    meta.duration = duration;
  }

  return meta;
};

/**
 * Walk the raw parsed XML tree to build a map from item link to
 * PodcastMeta. The normalizeFeed output uses the link as source_uri,
 * so we can join on that.
 */
const buildPodcastMetaMap = (root: unknown): ReadonlyMap<string, PodcastMeta> => {
  const map = new Map<string, PodcastMeta>();
  const obj = extract(root);
  if (!obj) return map;

  // RSS 2.0: rss > channel > item
  const rss = extract(obj.rss);
  if (rss) {
    const channel = extract(rss.channel);
    if (channel) {
      const items = asArray(channel.item);
      for (const rawItem of items) {
        const item = extract(rawItem);
        if (!item) continue;
        const link = pickString(item.link);
        if (!link) continue;
        map.set(link, extractPodcastMeta(item));
      }
    }
    return map;
  }

  // Atom 1.0: feed > entry (less common for podcasts, but handle it)
  const feed = extract(obj.feed);
  if (feed) {
    const entries = asArray(feed.entry);
    for (const rawEntry of entries) {
      const entry = extract(rawEntry);
      if (!entry) continue;
      // Atom link resolution — try alternate link href
      const links = asArray(entry.link);
      for (const l of links) {
        const linkObj = extract(l);
        if (linkObj) {
          const href = pickString(linkObj.href);
          if (href) {
            map.set(href, extractPodcastMeta(entry));
            break;
          }
        }
      }
    }
  }

  return map;
};

export interface PodcastRssDeps {
  readonly http: HttpFetcher;
  readonly xml: XmlParserPort;
}

export const podcastRssSource = (deps: PodcastRssDeps) =>
  (descriptor: SourceDescriptor): Source => {
    const cfg = parseConfig(descriptor.config);

    const fetchItems = (): ResultAsync<readonly ContentItem[], AppError> => {
      if (!cfg) {
        return errAsync<readonly ContentItem[], AppError>({
          type: 'InvalidNode',
          field: 'config.feed_url',
          node_id: descriptor.id,
        });
      }
      const max = cfg.max_items ?? 20;
      return deps.http
        .get(cfg.feed_url)
        .mapErr((e): AppError => e)
        .andThen((response) => {
          const parsed = deps.xml.parse(response.body, cfg.feed_url);
          if (parsed.isErr()) {
            return errAsync<readonly ContentItem[], AppError>(parsed.error);
          }

          // Build podcast meta map from raw XML before normalization flattens it
          const podcastMetaMap = buildPodcastMetaMap(parsed.value);

          const normalised = normalizeFeed(parsed.value);
          if (normalised.isErr()) {
            return errAsync<readonly ContentItem[], AppError>(normalised.error);
          }
          const items: readonly ContentItem[] = normalised.value.slice(0, max).map((f) => {
            const podMeta = podcastMetaMap.get(f.source_uri);
            return {
              source_uri: f.source_uri,
              title: f.title,
              text: f.text,
              published_at: f.published_at,
              author: f.author,
              metadata: {
                kind: 'podcast_rss',
                feed_url: cfg.feed_url,
                enclosure_url: podMeta?.enclosure_url,
                enclosure_type: podMeta?.enclosure_type,
                enclosure_length: podMeta?.enclosure_length,
                duration: podMeta?.duration,
              },
            };
          });
          return okAsync<readonly ContentItem[], AppError>(items);
        });
    };

    return { descriptor, fetch: fetchItems };
  };
