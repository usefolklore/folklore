/**
 * devto source adapter.
 *
 * Fetches articles from Dev.to's public REST API filtered by tag.
 * No authentication required for reading published articles.
 *
 * Config shape:
 *   {
 *     tag: string             // tag to filter by, e.g. "javascript"
 *     max_items?: number      // default 20
 *   }
 *
 * The API returns a flat JSON array of article objects. Each article
 * becomes a ContentItem.
 *
 * Stable URI for dedup: the canonical article URL from the `url` field.
 */

import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { AppError, GraphError } from '../../domain/errors.js';
import { GraphError as GE } from '../../domain/errors.js';
import type { ContentItem } from '../../domain/content.js';
import type { Source, SourceDescriptor } from '../../domain/sources.js';
import type { HttpFetcher } from '../http/fetcher.js';

interface DevtoConfig {
  readonly tag: string;
  readonly max_items?: number;
}

interface DevtoArticle {
  readonly id: number;
  readonly title?: string;
  readonly description?: string;
  readonly url?: string;
  readonly published_at?: string;
  readonly user?: { readonly username?: string };
  readonly tags?: string;
  readonly positive_reactions_count?: number;
}

const parseConfig = (raw: Readonly<Record<string, unknown>>): DevtoConfig | null => {
  const tag = raw.tag;
  if (typeof tag !== 'string' || tag.length === 0) return null;
  return {
    tag,
    max_items: typeof raw.max_items === 'number' ? raw.max_items : undefined,
  };
};

const buildUrl = (cfg: DevtoConfig): string => {
  const params = new URLSearchParams({
    tag: cfg.tag,
    per_page: String(cfg.max_items ?? 20),
  });
  return `https://dev.to/api/articles?${params.toString()}`;
};

const parseResponse = (body: string, url: string): ResultAsync<readonly DevtoArticle[], GraphError> => {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!Array.isArray(parsed)) {
      return errAsync(GE.parseError(url, 'expected JSON array from Dev.to'));
    }
    return okAsync(parsed as DevtoArticle[]);
  } catch (e) {
    return errAsync(GE.parseError(url, (e as Error).message));
  }
};

const articleToItem = (article: DevtoArticle): ContentItem | null => {
  const title = article.title;
  if (!title) return null;
  const url = article.url;
  if (!url) return null;
  return {
    source_uri: url,
    title,
    text: article.description && article.description.length > 0 ? article.description : title,
    published_at: article.published_at,
    author: article.user?.username,
    metadata: {
      kind: 'devto',
      devto_id: article.id,
      tags: article.tags,
      reactions: article.positive_reactions_count,
    },
  };
};

export interface DevtoDeps {
  readonly http: HttpFetcher;
}

export const devtoSource = (deps: DevtoDeps) =>
  (descriptor: SourceDescriptor): Source => {
    const cfg = parseConfig(descriptor.config);

    const fetchItems = (): ResultAsync<readonly ContentItem[], AppError> => {
      if (!cfg) {
        return errAsync<readonly ContentItem[], AppError>({
          type: 'InvalidNode',
          field: 'config.tag',
          node_id: descriptor.id,
        });
      }
      const url = buildUrl(cfg);
      const max = cfg.max_items ?? 20;
      return deps.http
        .get(url)
        .mapErr((e): AppError => e)
        .andThen((response) => parseResponse(response.body, url).mapErr((e): AppError => e))
        .map((articles): readonly ContentItem[] => {
          const items: ContentItem[] = [];
          for (const a of articles) {
            const item = articleToItem(a);
            if (item) items.push(item);
            if (items.length >= max) break;
          }
          return items;
        });
    };

    return { descriptor, fetch: fetchItems };
  };
