/**
 * npm_trending source adapter.
 *
 * Queries the npm registry search API and maps package results to
 * ContentItem values. Useful for tracking trending packages matching
 * a keyword (e.g. "vector database", "llm framework").
 *
 * Config shape:
 *   {
 *     query: string          // npm search query, e.g. "vector database"
 *     max_items?: number     // default 20
 *   }
 *
 * The npm registry search endpoint returns JSON with an `objects` array
 * where each entry has a `package` object containing name, description,
 * links, publisher, and date fields.
 */

import { ResultAsync, errAsync, okAsync } from 'neverthrow';
import type { AppError, GraphError } from '../../domain/errors.js';
import { GraphError as GE } from '../../domain/errors.js';
import type { ContentItem } from '../../domain/content.js';
import type { Source, SourceDescriptor } from '../../domain/sources.js';
import type { HttpFetcher } from '../http/fetcher.js';

interface NpmTrendingConfig {
  readonly query: string;
  readonly max_items?: number;
}

interface NpmPackageResult {
  readonly package: {
    readonly name?: string;
    readonly description?: string;
    readonly date?: string;
    readonly links?: { readonly npm?: string; readonly homepage?: string; readonly repository?: string };
    readonly publisher?: { readonly username?: string; readonly email?: string };
    readonly version?: string;
    readonly keywords?: readonly string[];
  };
  readonly score?: {
    readonly final?: number;
    readonly detail?: { readonly quality?: number; readonly popularity?: number; readonly maintenance?: number };
  };
}

const parseConfig = (raw: Readonly<Record<string, unknown>>): NpmTrendingConfig | null => {
  const query = raw.query;
  if (typeof query !== 'string' || query.length === 0) return null;
  return {
    query,
    max_items: typeof raw.max_items === 'number' ? raw.max_items : undefined,
  };
};

const buildUrl = (cfg: NpmTrendingConfig): string => {
  const params = new URLSearchParams({
    text: cfg.query,
    size: String(cfg.max_items ?? 20),
  });
  return `https://registry.npmjs.org/-/v1/search?${params.toString()}`;
};

const parseResponse = (
  body: string,
  url: string,
): ResultAsync<readonly NpmPackageResult[], GraphError> => {
  try {
    const parsed = JSON.parse(body) as { objects?: NpmPackageResult[] };
    if (!parsed || !Array.isArray(parsed.objects)) {
      return errAsync(GE.parseError(url, 'expected { objects: [] } from npm registry'));
    }
    return okAsync(parsed.objects);
  } catch (e) {
    return errAsync(GE.parseError(url, (e as Error).message));
  }
};

const resultToItem = (result: NpmPackageResult): ContentItem | null => {
  const pkg = result.package;
  if (!pkg || !pkg.name) return null;
  const npmUrl = pkg.links?.npm ?? `https://www.npmjs.com/package/${pkg.name}`;
  return {
    source_uri: npmUrl,
    title: pkg.name,
    text: pkg.description ?? pkg.name,
    published_at: pkg.date,
    author: pkg.publisher?.username,
    metadata: {
      kind: 'npm_trending',
      version: pkg.version,
      keywords: pkg.keywords,
      homepage: pkg.links?.homepage,
      repository: pkg.links?.repository,
      score: result.score?.final,
    },
  };
};

export interface NpmTrendingDeps {
  readonly http: HttpFetcher;
}

export const npmTrendingSource = (deps: NpmTrendingDeps) =>
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
      const url = buildUrl(cfg);
      const max = cfg.max_items ?? 20;
      return deps.http
        .get(url)
        .mapErr((e): AppError => e)
        .andThen((response) => parseResponse(response.body, url).mapErr((e): AppError => e))
        .map((results): readonly ContentItem[] => {
          const items: ContentItem[] = [];
          for (const r of results) {
            const item = resultToItem(r);
            if (item) items.push(item);
            if (items.length >= max) break;
          }
          return items;
        });
    };

    return { descriptor, fetch: fetchItems };
  };
