/**
 * twitter_search source adapter (stub).
 *
 * The X/Twitter API requires OAuth authentication, so this adapter
 * reads from a local cache file (~/.wellinformed/twitter-cache.json)
 * instead of hitting the live API. An external script or tool can
 * populate that cache file with the appropriate shape.
 *
 * Config shape:
 *   {
 *     query: string          // search query (used to filter cached items)
 *     max_items?: number     // default 20
 *   }
 *
 * Cache file shape (twitter-cache.json):
 *   {
 *     items: [
 *       {
 *         id: string,
 *         text: string,
 *         author_username?: string,
 *         created_at?: string,
 *         url?: string,
 *         query?: string
 *       }
 *     ]
 *   }
 *
 * If the cache file does not exist or is malformed, the adapter
 * returns an empty array — it never fails hard.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { AppError } from '../../domain/errors.js';
import type { ContentItem } from '../../domain/content.js';
import type { Source, SourceDescriptor } from '../../domain/sources.js';

interface TwitterSearchConfig {
  readonly query: string;
  readonly max_items?: number;
}

interface CachedTweet {
  readonly id?: string;
  readonly text?: string;
  readonly author_username?: string;
  readonly created_at?: string;
  readonly url?: string;
  readonly query?: string;
}

const parseConfig = (raw: Readonly<Record<string, unknown>>): TwitterSearchConfig | null => {
  const query = raw.query;
  if (typeof query !== 'string' || query.length === 0) return null;
  return {
    query,
    max_items: typeof raw.max_items === 'number' ? raw.max_items : undefined,
  };
};

const CACHE_PATH = join(homedir(), '.wellinformed', 'twitter-cache.json');

const readCache = (): ResultAsync<readonly CachedTweet[], never> =>
  ResultAsync.fromPromise(
    readFile(CACHE_PATH, 'utf8').then((raw) => {
      const parsed = JSON.parse(raw) as { items?: CachedTweet[] };
      if (!parsed || !Array.isArray(parsed.items)) return [] as CachedTweet[];
      return parsed.items;
    }),
    () => undefined as never,
  ).orElse(() => okAsync<readonly CachedTweet[], never>([]));

const tweetToItem = (tweet: CachedTweet): ContentItem | null => {
  if (!tweet.id || !tweet.text) return null;
  const url = tweet.url ?? `https://x.com/i/status/${tweet.id}`;
  return {
    source_uri: url,
    title: tweet.text.length > 100 ? `${tweet.text.slice(0, 97)}...` : tweet.text,
    text: tweet.text,
    published_at: tweet.created_at,
    author: tweet.author_username,
    metadata: { kind: 'twitter_search', tweet_id: tweet.id },
  };
};

export const twitterSearchSource = () =>
  (descriptor: SourceDescriptor): Source => {
    const cfg = parseConfig(descriptor.config);

    const fetchItems = (): ResultAsync<readonly ContentItem[], AppError> => {
      if (!cfg) {
        return errAsync<readonly ContentItem[], AppError>({
          type: 'InvalidNode',
          field: 'config.query',
          node_id: descriptor.id,
        });
      }
      const max = cfg.max_items ?? 20;
      const queryLower = cfg.query.toLowerCase();

      return readCache().map((tweets): readonly ContentItem[] => {
        const items: ContentItem[] = [];
        for (const tweet of tweets) {
          // Filter cached tweets by query if the tweet has a query tag,
          // or include all if no query tag is present on the tweet.
          if (tweet.query && !tweet.query.toLowerCase().includes(queryLower)) {
            const tweetText = tweet.text?.toLowerCase() ?? '';
            if (!tweetText.includes(queryLower)) continue;
          }
          const item = tweetToItem(tweet);
          if (item) items.push(item);
          if (items.length >= max) break;
        }
        return items;
      });
    };

    return { descriptor, fetch: fetchItems };
  };
