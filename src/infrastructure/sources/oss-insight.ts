/**
 * oss_insight source adapter — fetches repo analytics from OSS Insight API.
 *
 * OSS Insight (ossinsight.io) by PingCAP tracks GitHub repo activity:
 * stars, commits, PRs, contributors. We use it to discover trending
 * repos in a room's topic area.
 *
 * API: https://api.ossinsight.io/v1/repos/search?keyword=X
 *
 * Config:
 *   {
 *     keyword: string       // search keyword
 *     max_items?: number    // default 10
 *   }
 */

import { ResultAsync, okAsync, errAsync } from 'neverthrow';
import type { AppError } from '../../domain/errors.js';
import type { ContentItem } from '../../domain/content.js';
import type { Source, SourceDescriptor } from '../../domain/sources.js';
import type { HttpFetcher } from '../http/fetcher.js';

interface OssInsightConfig {
  readonly keyword: string;
  readonly max_items?: number;
}

interface RepoResult {
  readonly repo_id?: number;
  readonly repo_name?: string;
  readonly description?: string;
  readonly stars?: number;
  readonly forks?: number;
  readonly language?: string;
  readonly pushed_at?: string;
}

export interface OssInsightDeps {
  readonly http: HttpFetcher;
}

export const ossInsightSource = (deps: OssInsightDeps) =>
  (descriptor: SourceDescriptor): Source => {
    const cfg: OssInsightConfig = {
      keyword: typeof descriptor.config.keyword === 'string' ? descriptor.config.keyword : '',
      max_items: typeof descriptor.config.max_items === 'number' ? descriptor.config.max_items : 10,
    };

    const fetchItems = (): ResultAsync<readonly ContentItem[], AppError> => {
      if (!cfg.keyword) {
        return errAsync({ type: 'InvalidNode' as const, field: 'config.keyword', node_id: descriptor.id });
      }
      const url = `https://api.ossinsight.io/v1/repos/search?keyword=${encodeURIComponent(cfg.keyword)}&limit=${cfg.max_items ?? 10}`;
      return deps.http
        .get(url)
        .mapErr((e): AppError => e)
        .andThen((response) => {
          try {
            const parsed = JSON.parse(response.body);
            const rows: RepoResult[] = parsed?.data?.rows ?? parsed?.rows ?? [];
            const items: ContentItem[] = rows
              .filter((r) => r.repo_name)
              .map((r) => ({
                source_uri: `https://github.com/${r.repo_name}`,
                title: `${r.repo_name} (${r.stars ?? 0} stars)`,
                text: [
                  `Repository: ${r.repo_name}`,
                  r.description ? `Description: ${r.description}` : '',
                  `Stars: ${r.stars ?? 0} | Forks: ${r.forks ?? 0}`,
                  r.language ? `Language: ${r.language}` : '',
                  r.pushed_at ? `Last push: ${r.pushed_at}` : '',
                ].filter(Boolean).join('\n'),
                published_at: r.pushed_at,
                metadata: { kind: 'oss_insight', stars: r.stars, forks: r.forks, language: r.language },
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
