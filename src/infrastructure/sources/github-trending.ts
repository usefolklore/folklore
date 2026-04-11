/**
 * github_trending source adapter — fetches trending repos via GitHub search API.
 *
 * Uses the GitHub search API (no auth needed for public repos) to find
 * recently-created or recently-starred repos matching keywords.
 *
 * Config:
 *   {
 *     query: string         // GitHub search query (e.g. "embeddings language:typescript")
 *     sort?: string         // "stars" | "updated" | "created" (default: "stars")
 *     max_items?: number    // default 10
 *   }
 */

import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import type { AppError } from '../../domain/errors.js';
import type { ContentItem } from '../../domain/content.js';
import type { Source, SourceDescriptor } from '../../domain/sources.js';
import type { HttpFetcher } from '../http/fetcher.js';

interface GithubTrendingConfig {
  readonly query: string;
  readonly sort?: string;
  readonly max_items?: number;
}

interface GithubRepo {
  readonly full_name?: string;
  readonly html_url?: string;
  readonly description?: string;
  readonly stargazers_count?: number;
  readonly forks_count?: number;
  readonly language?: string;
  readonly pushed_at?: string;
  readonly created_at?: string;
  readonly topics?: string[];
}

export interface GithubTrendingDeps {
  readonly http: HttpFetcher;
}

export const githubTrendingSource = (deps: GithubTrendingDeps) =>
  (descriptor: SourceDescriptor): Source => {
    const cfg: GithubTrendingConfig = {
      query: typeof descriptor.config.query === 'string' ? descriptor.config.query : '',
      sort: typeof descriptor.config.sort === 'string' ? descriptor.config.sort : 'stars',
      max_items: typeof descriptor.config.max_items === 'number' ? descriptor.config.max_items : 10,
    };

    const fetchItems = (): ResultAsync<readonly ContentItem[], AppError> => {
      if (!cfg.query) {
        return errAsync({ type: 'InvalidNode' as const, field: 'config.query', node_id: descriptor.id });
      }
      const params = new URLSearchParams({
        q: `${cfg.query} pushed:>${thirtyDaysAgo()}`,
        sort: cfg.sort ?? 'stars',
        order: 'desc',
        per_page: String(cfg.max_items ?? 10),
      });
      const url = `https://api.github.com/search/repositories?${params}`;
      return deps.http
        .get(url)
        .mapErr((e): AppError => e)
        .andThen((response) => {
          try {
            const parsed = JSON.parse(response.body);
            const repos: GithubRepo[] = parsed?.items ?? [];
            const items: ContentItem[] = repos
              .filter((r) => r.full_name)
              .map((r) => ({
                source_uri: r.html_url ?? `https://github.com/${r.full_name}`,
                title: `${r.full_name} (${r.stargazers_count ?? 0} stars)`,
                text: [
                  `Repository: ${r.full_name}`,
                  r.description ? `Description: ${r.description}` : '',
                  `Stars: ${r.stargazers_count ?? 0} | Forks: ${r.forks_count ?? 0}`,
                  r.language ? `Language: ${r.language}` : '',
                  r.topics?.length ? `Topics: ${r.topics.join(', ')}` : '',
                  r.pushed_at ? `Last push: ${r.pushed_at}` : '',
                ].filter(Boolean).join('\n'),
                published_at: r.created_at,
                metadata: {
                  kind: 'github_trending',
                  stars: r.stargazers_count,
                  forks: r.forks_count,
                  language: r.language,
                  topics: r.topics,
                },
              }));
            return okAsync<readonly ContentItem[], AppError>(items);
          } catch (e) {
            return errAsync<readonly ContentItem[], AppError>({
              type: 'GraphParseError' as const,
              path: url,
              message: (e as Error).message,
            });
          }
        });
    };

    return { descriptor, fetch: fetchItems };
  };

const thirtyDaysAgo = (): string => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};
