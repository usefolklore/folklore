/**
 * github_releases source adapter.
 *
 * Fetches release notes for a GitHub repository via the public REST
 * API at https://api.github.com/repos/{owner}/{repo}/releases.
 * No authentication required for public repos (rate-limited to 60/hr).
 *
 * Config shape:
 *   {
 *     repo: string            // "owner/repo" format, e.g. "facebook/react"
 *     max_items?: number      // default 20
 *   }
 *
 * The API returns a JSON array of release objects. Each release
 * becomes a ContentItem.
 *
 * Stable URI for dedup: the `html_url` of the release page on GitHub.
 */

import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { AppError, GraphError } from '../../domain/errors.js';
import { GraphError as GE } from '../../domain/errors.js';
import type { ContentItem } from '../../domain/content.js';
import type { Source, SourceDescriptor } from '../../domain/sources.js';
import type { HttpFetcher } from '../http/fetcher.js';

interface GithubReleasesConfig {
  readonly repo: string;
  readonly max_items?: number;
}

interface GithubRelease {
  readonly id?: number;
  readonly name?: string;
  readonly tag_name?: string;
  readonly body?: string;
  readonly html_url?: string;
  readonly published_at?: string;
  readonly author?: { readonly login?: string };
  readonly draft?: boolean;
  readonly prerelease?: boolean;
}

const parseConfig = (raw: Readonly<Record<string, unknown>>): GithubReleasesConfig | null => {
  const repo = raw.repo;
  if (typeof repo !== 'string' || repo.length === 0) return null;
  // Validate "owner/repo" format
  if (!repo.includes('/')) return null;
  return {
    repo,
    max_items: typeof raw.max_items === 'number' ? raw.max_items : undefined,
  };
};

const buildUrl = (cfg: GithubReleasesConfig): string => {
  const perPage = cfg.max_items ?? 20;
  return `https://api.github.com/repos/${cfg.repo}/releases?per_page=${perPage}`;
};

const parseResponse = (body: string, url: string): ResultAsync<readonly GithubRelease[], GraphError> => {
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!Array.isArray(parsed)) {
      return errAsync(GE.parseError(url, 'expected JSON array from GitHub Releases API'));
    }
    return okAsync(parsed as GithubRelease[]);
  } catch (e) {
    return errAsync(GE.parseError(url, (e as Error).message));
  }
};

const releaseToItem = (release: GithubRelease): ContentItem | null => {
  const htmlUrl = release.html_url;
  if (!htmlUrl) return null;
  const title = release.name || release.tag_name;
  if (!title) return null;
  return {
    source_uri: htmlUrl,
    title,
    text: release.body && release.body.length > 0 ? release.body : title,
    published_at: release.published_at,
    author: release.author?.login,
    metadata: {
      kind: 'github_releases',
      tag_name: release.tag_name,
      release_id: release.id,
      draft: release.draft,
      prerelease: release.prerelease,
    },
  };
};

export interface GithubReleasesDeps {
  readonly http: HttpFetcher;
}

export const githubReleasesSource = (deps: GithubReleasesDeps) =>
  (descriptor: SourceDescriptor): Source => {
    const cfg = parseConfig(descriptor.config);

    const fetchItems = (): ResultAsync<readonly ContentItem[], AppError> => {
      if (!cfg) {
        return errAsync<readonly ContentItem[], AppError>({
          type: 'InvalidNode',
          field: 'config.repo',
          node_id: descriptor.id,
        });
      }
      const url = buildUrl(cfg);
      const max = cfg.max_items ?? 20;
      return deps.http
        .get(url)
        .mapErr((e): AppError => e)
        .andThen((response) => parseResponse(response.body, url).mapErr((e): AppError => e))
        .map((releases): readonly ContentItem[] => {
          const items: ContentItem[] = [];
          for (const r of releases) {
            const item = releaseToItem(r);
            if (item) items.push(item);
            if (items.length >= max) break;
          }
          return items;
        });
    };

    return { descriptor, fetch: fetchItems };
  };
