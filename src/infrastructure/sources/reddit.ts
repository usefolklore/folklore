/**
 * reddit source adapter.
 *
 * Fetches hot posts from a subreddit via Reddit's public JSON API
 * (no authentication required). Each post becomes a ContentItem.
 *
 * Config shape:
 *   {
 *     subreddit: string       // subreddit name, e.g. "programming"
 *     max_items?: number      // default 20
 *   }
 *
 * The JSON API returns a Listing with children of kind "t3" (links).
 * We map each child's `data` to a ContentItem.
 *
 * Stable URI for dedup: the Reddit permalink
 * https://www.reddit.com{permalink}
 */

import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { AppError, GraphError } from '../../domain/errors.js';
import { GraphError as GE } from '../../domain/errors.js';
import type { ContentItem } from '../../domain/content.js';
import type { Source, SourceDescriptor } from '../../domain/sources.js';
import type { HttpFetcher } from '../http/fetcher.js';

interface RedditConfig {
  readonly subreddit: string;
  readonly max_items?: number;
}

interface RedditPost {
  readonly id: string;
  readonly title?: string;
  readonly selftext?: string;
  readonly url?: string;
  readonly permalink?: string;
  readonly author?: string;
  readonly created_utc?: number;
  readonly subreddit?: string;
}

interface RedditChild {
  readonly kind: string;
  readonly data: RedditPost;
}

const parseConfig = (raw: Readonly<Record<string, unknown>>): RedditConfig | null => {
  const subreddit = raw.subreddit;
  if (typeof subreddit !== 'string' || subreddit.length === 0) return null;
  return {
    subreddit,
    max_items: typeof raw.max_items === 'number' ? raw.max_items : undefined,
  };
};

const buildUrl = (cfg: RedditConfig): string => {
  const limit = cfg.max_items ?? 20;
  return `https://www.reddit.com/r/${encodeURIComponent(cfg.subreddit)}/hot.json?limit=${limit}`;
};

const parseResponse = (body: string, url: string): ResultAsync<readonly RedditChild[], GraphError> => {
  try {
    const parsed = JSON.parse(body) as { data?: { children?: RedditChild[] } };
    if (!parsed || !parsed.data || !Array.isArray(parsed.data.children)) {
      return errAsync(GE.parseError(url, 'expected { data: { children: [] } } from Reddit'));
    }
    return okAsync(parsed.data.children);
  } catch (e) {
    return errAsync(GE.parseError(url, (e as Error).message));
  }
};

const postToItem = (child: RedditChild): ContentItem | null => {
  const post = child.data;
  const title = post.title;
  if (!title) return null;
  const permalink = post.permalink;
  if (!permalink) return null;
  const sourceUri = `https://www.reddit.com${permalink}`;
  const publishedAt = post.created_utc
    ? new Date(post.created_utc * 1000).toISOString()
    : undefined;
  return {
    source_uri: sourceUri,
    title,
    text: post.selftext && post.selftext.length > 0 ? post.selftext : title,
    published_at: publishedAt,
    author: post.author,
    metadata: {
      kind: 'reddit',
      subreddit: post.subreddit,
      target_url: post.url,
      reddit_id: post.id,
    },
  };
};

export interface RedditDeps {
  readonly http: HttpFetcher;
}

export const redditSource = (deps: RedditDeps) =>
  (descriptor: SourceDescriptor): Source => {
    const cfg = parseConfig(descriptor.config);

    const fetchItems = (): ResultAsync<readonly ContentItem[], AppError> => {
      if (!cfg) {
        return errAsync<readonly ContentItem[], AppError>({
          type: 'InvalidNode',
          field: 'config.subreddit',
          node_id: descriptor.id,
        });
      }
      const url = buildUrl(cfg);
      const max = cfg.max_items ?? 20;
      return deps.http
        .get(url)
        .mapErr((e): AppError => e)
        .andThen((response) => parseResponse(response.body, url).mapErr((e): AppError => e))
        .map((children): readonly ContentItem[] => {
          const items: ContentItem[] = [];
          for (const c of children) {
            const item = postToItem(c);
            if (item) items.push(item);
            if (items.length >= max) break;
          }
          return items;
        });
    };

    return { descriptor, fetch: fetchItems };
  };
