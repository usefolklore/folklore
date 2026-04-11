/**
 * ecosystems_timeline source adapter.
 *
 * Fetches open-source ecosystem events from the Ecosyste.ms Timeline
 * API at https://timeline.ecosyste.ms/api/v1/events. No auth needed.
 *
 * Config shape:
 *   {
 *     query?: string          // optional search query filter
 *     max_items?: number      // default 20
 *   }
 *
 * The API returns a JSON array of event objects. Each event becomes
 * a ContentItem.
 *
 * Stable URI for dedup: the event `url` field.
 */

import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { AppError, GraphError } from '../../domain/errors.js';
import { GraphError as GE } from '../../domain/errors.js';
import type { ContentItem } from '../../domain/content.js';
import type { Source, SourceDescriptor } from '../../domain/sources.js';
import type { HttpFetcher } from '../http/fetcher.js';

interface EcosystemsTimelineConfig {
  readonly query?: string;
  readonly max_items?: number;
}

interface TimelineEvent {
  readonly id?: number;
  readonly title?: string;
  readonly body?: string;
  readonly url?: string;
  readonly created_at?: string;
  readonly event_type?: string;
  readonly repository?: { readonly full_name?: string };
}

const parseConfig = (raw: Readonly<Record<string, unknown>>): EcosystemsTimelineConfig => ({
  query: typeof raw.query === 'string' ? raw.query : undefined,
  max_items: typeof raw.max_items === 'number' ? raw.max_items : undefined,
});

const buildUrl = (cfg: EcosystemsTimelineConfig): string => {
  const params = new URLSearchParams({
    per_page: String(cfg.max_items ?? 20),
  });
  if (cfg.query) {
    params.set('query', cfg.query);
  }
  return `https://timeline.ecosyste.ms/api/v1/events?${params.toString()}`;
};

const parseResponse = (body: string, url: string): ResultAsync<readonly TimelineEvent[], GraphError> => {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!Array.isArray(parsed)) {
      return errAsync(GE.parseError(url, 'expected JSON array from Ecosyste.ms Timeline'));
    }
    return okAsync(parsed as TimelineEvent[]);
  } catch (e) {
    return errAsync(GE.parseError(url, (e as Error).message));
  }
};

const eventToItem = (event: TimelineEvent): ContentItem | null => {
  const url = event.url;
  if (!url) return null;
  const title = event.title;
  if (!title) return null;
  return {
    source_uri: url,
    title,
    text: event.body && event.body.length > 0 ? event.body : title,
    published_at: event.created_at,
    author: undefined,
    metadata: {
      kind: 'ecosystems_timeline',
      event_type: event.event_type,
      repository: event.repository?.full_name,
      event_id: event.id,
    },
  };
};

export interface EcosystemsTimelineDeps {
  readonly http: HttpFetcher;
}

export const ecosystemsTimelineSource = (deps: EcosystemsTimelineDeps) =>
  (descriptor: SourceDescriptor): Source => {
    const cfg = parseConfig(descriptor.config);

    const fetchItems = (): ResultAsync<readonly ContentItem[], AppError> => {
      const url = buildUrl(cfg);
      const max = cfg.max_items ?? 20;
      return deps.http
        .get(url)
        .mapErr((e): AppError => e)
        .andThen((response) => parseResponse(response.body, url).mapErr((e): AppError => e))
        .map((events): readonly ContentItem[] => {
          const items: ContentItem[] = [];
          for (const ev of events) {
            const item = eventToItem(ev);
            if (item) items.push(item);
            if (items.length >= max) break;
          }
          return items;
        });
    };

    return { descriptor, fetch: fetchItems };
  };
