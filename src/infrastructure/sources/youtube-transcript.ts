/**
 * youtube_transcript source adapter.
 *
 * Fetches the public Atom feed for a YouTube channel and maps video
 * entries to ContentItem values. YouTube exposes an Atom 1.0 feed at:
 *
 *   https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}
 *
 * Config shape:
 *   {
 *     channel_id: string     // YouTube channel ID, e.g. "UCxxxxxx"
 *     max_items?: number     // default 20
 *   }
 *
 * The adapter:
 *   1. fetches the feed URL as raw text via HttpFetcher
 *   2. parses the XML via XmlParserPort
 *   3. normalises Atom entries via domain.feeds.normalizeFeed
 *   4. returns ContentItem[] trimmed to max_items
 */

import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { AppError } from '../../domain/errors.js';
import type { ContentItem } from '../../domain/content.js';
import type { Source, SourceDescriptor } from '../../domain/sources.js';
import { normalizeFeed } from '../../domain/feeds.js';
import type { HttpFetcher } from '../http/fetcher.js';
import type { XmlParserPort } from '../parsers/xml-parser.js';

interface YoutubeTranscriptConfig {
  readonly channel_id: string;
  readonly max_items?: number;
}

const parseConfig = (raw: Readonly<Record<string, unknown>>): YoutubeTranscriptConfig | null => {
  const channel_id = raw.channel_id;
  if (typeof channel_id !== 'string' || channel_id.length === 0) return null;
  return {
    channel_id,
    max_items: typeof raw.max_items === 'number' ? raw.max_items : undefined,
  };
};

const buildUrl = (cfg: YoutubeTranscriptConfig): string =>
  `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(cfg.channel_id)}`;

export interface YoutubeTranscriptDeps {
  readonly http: HttpFetcher;
  readonly xml: XmlParserPort;
}

export const youtubeTranscriptSource = (deps: YoutubeTranscriptDeps) =>
  (descriptor: SourceDescriptor): Source => {
    const cfg = parseConfig(descriptor.config);

    const fetchItems = (): ResultAsync<readonly ContentItem[], AppError> => {
      if (!cfg) {
        return errAsync<readonly ContentItem[], AppError>({
          type: 'InvalidNode',
          field: 'config.channel_id',
          node_id: descriptor.id,
        });
      }
      const url = buildUrl(cfg);
      const max = cfg.max_items ?? 20;
      return deps.http
        .get(url)
        .mapErr((e): AppError => e)
        .andThen((response) => {
          const parsed = deps.xml.parse(response.body, url);
          if (parsed.isErr()) {
            return errAsync<readonly ContentItem[], AppError>(parsed.error);
          }
          const normalised = normalizeFeed(parsed.value);
          if (normalised.isErr()) {
            return errAsync<readonly ContentItem[], AppError>(normalised.error);
          }
          const items: readonly ContentItem[] = normalised.value.slice(0, max).map((f) => ({
            source_uri: f.source_uri,
            title: f.title,
            text: f.text,
            published_at: f.published_at,
            author: f.author,
            metadata: {
              kind: 'youtube_transcript',
              channel_id: cfg.channel_id,
              video_url: f.source_uri,
            },
          }));
          return okAsync<readonly ContentItem[], AppError>(items);
        });
    };

    return { descriptor, fetch: fetchItems };
  };
